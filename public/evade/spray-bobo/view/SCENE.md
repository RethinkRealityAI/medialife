# Attaching a paintable's scene in the AR page

Recipe for `public/evade/spray-bobo/main.js` (8th Wall image targets + three.js). The share viewer
(`view/main.js`, `buildSceneItems`) and the Studio (`spray-studio/src/paint/sceneItems.ts`) do the same thing;
copy from the viewer (plain JS, same three build), do not import it.

## Data
`paintable.scene` (from `/api/spray/sets`, `/api/spray/sets/<id>` or `/api/spray/creations/<id>`): `SceneItem[]`,
missing = none. See `src/lib/spray/model.ts`. Skip items with `visible === false`.

Coordinates: origin = centre of the 3:4 tracked picture, x right, y up, z out of the print towards the viewer,
**millimetres of the real print** (`paintable.heightMm` tall, `heightMm * 3/4` wide). Rotations: degrees, XYZ order.

## Which group, which scale
Parent the scene to the group that follows the **image target** (the one 8th Wall moves on `imagefound` /
`imageupdated`, where the print card / canvas sits), not to the sticker or anything that animates.
On that group the picture spans the target's height in world units:

    const targetH = detail.scaledHeight;          // world units the tracked picture is tall (xrimage events)
    const mm = targetH / paintable.heightMm;      // world units per millimetre
    sceneGroup.scale.setScalar(mm);               // children are in millimetres from here on

If the AR page already has a frame in metres where the picture is `H` tall (the keychain frame,
`H = 0.0801` for Bobo), use `mm = H / heightMm` on that frame instead. In both cases: **one length = picture
height / heightMm**. Check the target's z axis: the scene's +z must point out of the print towards the camera
(8th Wall's flat targets lie with their normal along the group's +z after its own rotation; if the page rotates
the content group by -90 degrees about x for flat prints, parent under that rotated group).

For a picture where `flip === -1` (printed seen through clear acrylic), mirror x: `sceneGroup.scale.x *= -1`
only if the paint canvas is mirrored on that same group; otherwise show the scene on the front target only.

## Per item

    const holder = new THREE.Group();
    holder.position.set(...it.pos);                                   // mm
    holder.rotation.set(...it.rot.map(THREE.MathUtils.degToRad), 'XYZ');
    sceneGroup.add(holder);

- **model** (GLB at `it.file`): lazy-load `GLTFLoader` + `MeshoptDecoder` (`three/addons/...`) only when a model
  exists. Normalise in the rest pose, before any animation runs:

      const inner = new THREE.Group(); inner.add(gltf.scene); inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const d = box.getSize(new THREE.Vector3());
      const s = it.size / (d.y > 0 ? d.y : Math.max(d.x, d.z));      // size = height in mm (flat model: largest side)
      inner.scale.setScalar(s);
      inner.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s);   // bbox centre -> pos
      holder.add(inner);                                              // rot applies about that centre
      if (it.clip) { const c = THREE.AnimationClip.findByName(gltf.animations, it.clip);
        if (c) { mixer = new THREE.AnimationMixer(gltf.scene); mixer.clipAction(c).play(); } }   // loops; mixer.update(dt) per frame

  Set `frustumCulled = false` on skinned meshes. The admin editor also decodes Draco: if the AR page has a DRACOLoader + decoder available, set it; the share viewer has none vendored, so a Draco GLB is skipped there.
- **image**: `PlaneGeometry(it.size * aspect, it.size)` (aspect = `it.aspect` or the image's natural w/h),
  `MeshBasicMaterial({ map, transparent: true, alphaTest: 0.01, side: DoubleSide, toneMapped: false })`,
  `map.colorSpace = SRGBColorSpace`. Faces +z at rot 0. PNG/WebP alpha is kept.
- **video**: same plane with a `THREE.VideoTexture`. The element:

      v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
      v.crossOrigin = 'anonymous'; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      v.src = it.file; v.load(); v.play().catch(() => {});

  iOS Safari: autoplay only when muted + `playsinline` (attribute set before `src`), otherwise it goes full
  screen or refuses; Low Power Mode can still block autoplay, so also call `v.play()` inside the next user
  gesture (the AR page's first tap). Android Chrome: muted autoplay works; unmuting needs a user activation.
  If `it.sound` is true, unmute on the first `pointerup` / `touchend` / `keydown` (not `pointerdown`: on touch
  it is not a user activation) with `v.muted = false; v.play()`, and respect the page's own mute button.
  Pause videos when the target is lost or the page is hidden; play again on `imagefound`.

## Failure and timing
Wrap each item: on any load error `console.warn` and remove its holder; never let one asset break the page.
Show the scene when the target is found (a short staggered scale pop, none with `prefers-reduced-motion`);
hide it on `imagelost`. Keep everything out of raycasts / tap picking if the page picks the print
(`obj.raycast = () => {}` on every scene object).
