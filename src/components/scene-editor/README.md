# Scene editor

Places 3D models, pictures and video around a tracked print, in real millimetres, so the scene shows
in AR exactly as placed. Self-contained: the host passes the print, the scene and two functions
(`upload`, `save`); see `SceneEditorProps` in `types.ts`. Used by the Spray Bobo CMS
(`src/components/spray/spray-admin.tsx`); to reuse it elsewhere, change the one type import in
`types.ts` and pass your own `upload` / `save`.

three.js loads only in the browser: `scene-editor.tsx` imports `stage.tsx` (the 3D canvas) with
`React.lazy` after mount, and `assets.ts` (loaders) with a dynamic `import()`.

## Files

| File | What it does |
| --- | --- |
| `scene-editor.tsx` | The editor: top bar, stage overlays, side panel, undo/redo, keyboard, save, dialogs |
| `stage.tsx` | The 3D stage (react-three-fiber + drei): print card, grid, ruler, items, move/rotate/resize handles, camera views |
| `panel.tsx` | Item list, the selected item's settings, number boxes |
| `assets.ts` | GLB loading (GLTFLoader + meshopt), measuring models, pictures and video |
| `scene-math.ts` | Defaults and placement helpers in millimetres (no three.js) |
| `history.ts` | Undo / redo |
| `ui.ts` | Shared class names and labels |

## The coordinate system (the contract)

Same as `SceneItem` in `src/lib/spray/model.ts`:

- Origin: the centre of the 3:4 tracked picture. x right, y up (along the picture), z out of the
  print towards the viewer.
- Units: **millimetres of the real print**. The picture is `heightMm` tall and `heightMm * 3/4` wide.
  A renderer whose card is `H` units tall multiplies every length (`pos`, `size`) by `H / heightMm`.
- `rot`: degrees, applied as a three.js `Euler(rx, ry, rz, "XYZ")` (three's default order), about the
  item's `pos`.

## How each kind is drawn (renderers must match this)

### Models (`kind: "model"`, GLB)

1. Load the GLB (GLTFLoader with MeshoptDecoder). **Draco is not supported**: the fans' pages have no
   Draco decoder, so the editor and the server refuse GLBs that list `KHR_draco_mesh_compression` (or
   `KHR_texture_basisu`, KTX2 textures) in `extensionsUsed` / `extensionsRequired`. Meshopt
   (`EXT_meshopt_compression`) is fine.
2. Measure the box of the scene **as loaded, before any animation runs**:
   `gltf.scene.updateMatrixWorld(true); box = new THREE.Box3().setFromObject(gltf.scene)`
   (precise = false, the default).
3. `bboxHeight = box.max.y - box.min.y`. If that is 0 (a completely flat model), use the largest of
   the box's three sides instead.
4. `scale = size / bboxHeight` (size is in mm; multiply by `H / heightMm` for your card).
5. `centre = box.getCenter()` in the model's own units. Translate the model by `-centre`, then scale
   it, then rotate and place it at `pos`:

```js
const inner = new THREE.Group();           // translate so the box centre is at the origin
inner.position.copy(centre).negate();
inner.add(gltf.scene /* or a SkeletonUtils.clone */);
const scaled = new THREE.Group();          // uniform scale
scaled.scale.setScalar(size / bboxHeight);
scaled.add(inner);
const item = new THREE.Group();            // rotate about the box centre, then place
item.position.set(...pos);
item.rotation.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG, "XYZ");
item.add(scaled);
```

So `size` is the model's bounding-box height in mm (before turning), and `pos` is where the centre of
its bounding box lands. At `rot = [0, 0, 0]` the model's own up (glTF +Y) runs up the picture and its
front (glTF +Z) faces out of the print.

- `clip`: the animation (by name) to loop; `null` for none. If the name is not in the file, show no
  animation.

### Pictures and video (`kind: "image"` / `"video"`)

- A flat rectangle `size * aspect` wide and `size` tall (`aspect` = width / height of the picture),
  centred on `pos`, facing +z at `rot = [0, 0, 0]` (a `PlaneGeometry` turned by `rot`).
- Unlit (`MeshBasicMaterial`, `toneMapped: false`), shown from both sides. Pictures keep their
  transparency (`transparent: true`, `alphaTest: 0.01`).
- Video loops; it starts muted. `sound: true` means fans can tap once to hear it.

### Everything

- `visible: false` items are not shown to anyone.
- Lighting in the editor: three's `RoomEnvironment` through a PMREM (`environmentIntensity` 0.9), an
  ambient light 0.35 and one directional light 1.6, tone mapping `NeutralToneMapping`, sRGB output.
  Match this for models to look the same.

## Placement helpers (editor only)

- New items: centred on the print, 60% of the print height tall, `z = 10%` of the print height plus
  half the model's depth.
- Sit flat on the print: `rot = [0, 0, 0]`, back touching the print (`z = depth / 2 + 0.5 mm`).
- Stand up on the print: `rot = [90, 0, 0]` (the item's up becomes +z), base on the print
  (`z = height / 2`). It then faces down the picture (-y), towards someone at the print's bottom edge.

## Files on the server (Spray Bobo)

- `POST /api/spray/admin/sets/<id>/asset` (admin cookie + `x-spray: 1`), multipart, in pieces of at
  most 4 MB: `file` (this piece), `kind`, `size` (whole file), `part` (0-based), `upload` (the name the
  first piece got). Answers `{ done: false, upload, part, parts }` until the last piece, then
  `{ done: true, file, bytes }`. Checked by header bytes: GLB ("glTF", version 2, length matches),
  PNG / JPEG / WebP, MP4 ("ftyp", not HEIC/AVIF). GLBs using Draco or KTX2 are refused (415). Limits: `SCENE_MAX_BYTES`.
- Files are served at `/api/spray/file/scene/<id>/<name>.<ext>` with the right type, Range support
  and a one-year immutable cache.
- `PUT /api/spray/admin/sets/<id>/scene` with `{ scene, heightMm? }` saves; the paintable comes back.
