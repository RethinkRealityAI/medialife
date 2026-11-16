# Bobo Booth (`/evade/bobo-booth/`)

EVADE selfie photo booth on the open-source 8th Wall engine's **face tracking** (MIT). Built 2026-11-16.

## What it does
- Front camera, mirrored like a selfie. One face at a time (`maxDetections: 1`), ear tracking on (`enableEars`).
- Wearables, all made in code (`wearables.js`) or from EVADE's real GLBs, no generative tools:
  - Hat: **Bobo cat hat** (tabby beanie, cat ears, BOBO visor band), **BOBO visor**.
  - Shades: **Bobo shades** (gold cat-eye frames with ear points, Bobo printed on the blue lenses, a tiny animated
    Bobo from `bobo-keychain.glb` sitting on the bridge), **Night shades** (blue frames, dark lenses), **Gold cat-eyes**.
  - Earrings (hang from the real ear lobes, verlet swing): **Eclipse cans** (`eclipse-can.glb`, ~24 mm), Can + hoop,
    Gold hoops, **Bobo bells** (the collar bell), Star studs.
  - Nose: septum ring, nose hoop, star stud.
  - Looks: Full Bobo, Eclipse fizz, Gold rush, Just the cat, Clear all. Shuffle button for a random look.
- Switching works like Snapchat/Instagram lenses: category chips, then a row of round thumbnails that snaps into the
  shutter ring (bottom centre). What sits in the ring is worn; tap a thumbnail to glide it in.
- Each piece has its own entrance and exit (`ANIM` in `wearables.js`): the cat hat drops and bounces and its ears
  spring up, the visor spins on, Bobo shades flip down off the forehead and the tiny Bobo hops on, Night shades slide
  in from the side, gold cat-eyes zoom in, earrings drop and swing, nose pieces twist/twinkle in. Flat four-point
  sparkles burst where a piece lands. Reduced motion: short scale fades only.
- Capture: tap = photo, hold = video (shared Cola Run recorder, can be sent to the Where is Bobo? globe),
  **Strip** toggle = 3-2-1 countdown then four shots laid out as a booth strip with the EVADE footer.
- Events: `/api/bobo/events` with source `bobo-booth` (scan, play, custom look, share). Test log `/api/ar/kc-diag`
  (page `bobo-booth`) on previews/local or `?diag`. `?test` exposes `window.__bb`.

## Engine notes
- Loads `/evade/keychain-ar/vendor/xr/xr.js` with `data-preload-chunks="slam,face"`. The face chunk
  (`xr-face.js`) and its models (`resources/face-*.tflite`) are vendored next to `xr.js` (the engine resolves them
  from the script's folder). `slam` is loaded only so `XR8.XrController` exists: `XR8.Threejs.pipelineModule()`
  calls `XrController.updateCameraProjectionMatrix` and throws on a face-only page without it.
- Face local units: ~139 mm per unit (`transform.scale` 0.139); x = wearer's left, y up, z = back of the head
  (the face looks down -z); origin inside the head between the ears. Measured attachment points are in
  `AP_DEFAULT` in `main.js`.
- Occlusion (no stencil buffer): the live face mesh (depth only, nudged back a hair) + an ellipsoid head and neck.

## Tested / not tested
- Tested in the headless camera simulator with a stock face photo (not committed): face found in ~3 s, both ears
  found, every piece placed and animated, carousel swipe/snap, photo and strip, no console errors.
- **Not tested on a real phone yet**: fps on mid-range Android, iPhone Safari front camera, real ear-lobe tracking
  under hair, video recording audio, landscape.

## Round 2 (planned, after Dapo's phone test)
Face triggers: open mouth = cola fizz burst, raised eyebrows = next look, blink = the tiny Bobo reacts.
