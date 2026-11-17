# Bobo Booth (`/evade/bobo-booth/`)

EVADE selfie photo booth on the open-source 8th Wall engine's **face tracking** (MIT). Built 2026-11-16.

## What it does
- Front camera, mirrored like a selfie. Up to **2 faces** (`maxDetections`, `?faces=1..3`), one `Rig` per face id, each
  wearing the same look ("Friend joined the booth"). Ear tracking on (`enableEars`).
- Wearables, all made in code (`wearables.js`) or from EVADE's real GLBs, no generative tools:
  - Hat: **Bobo cat hat** (tabby beanie, cat ears, BOBO visor band, a tiny animated Bobo from `bobo-keychain.glb`
    sitting on top, ~64 mm), **BOBO visor**.
  - Shades: **Bobo shades** (gold cat-eye frames, plain blue lenses, frame tips shaped as Bobo's ears: ink outline,
    tabby outer, pink inner), **Night shades** (blue frames and ears, dark lenses), **Gold cat-eyes** (spike tips).
  - Earrings (hang from the real ear lobes, verlet swing): **Eclipse cans** (`eclipse-can.glb`, ~24 mm), Can + hoop,
    Gold hoops, **Bobo bells** (the collar bell), Star studs.
  - Nose: septum ring (a closed clicker ring whose top sits inside the nose, so only the lower arc and bead show),
    nose hoop, star stud.
  - **Face paint** (drawn on the live face mesh in the engine's standard face UVs, so it follows every expression):
    Bobo whiskers, Tabby Bobo (adds the forehead "M" and cheek stripes), Eclipse game day (gold eye-black, blue
    crescent, EVADE on the cheek). Feature positions in UV space are measured from the first tracked frame.
  - Looks: Full Bobo, Eclipse fizz, Gold rush, Be Bobo, Clear all. Shuffle button for a random look.
- Switching works like Snapchat/Instagram lenses: category chips, then a row of round thumbnails that snaps into a gold
  circle. What sits in the circle is worn; tap a thumbnail to glide it in. The **camera button is its own control,
  always at bottom centre below the row** (Dapo, round 2), with Strip on its left and Shuffle on its right.
- **Face tricks** (8th Wall face events; Options > Face tricks turns them off; a tips card shows once):
  open your mouth (`mouthOpen`) = cola fizz pours out (flat bubbles), the earrings swing and the tiny Bobo paws;
  raise both eyebrows for 250 ms (`leftEyebrowRaised && rightEyebrowRaised`) = next look (2.2 s cooldown, not while
  shooting); wink (`facecontroller.lefteyewinked` / `righteyewinked`) = the tiny Bobo waves, with a mew.
- Each piece has its own entrance and exit (`ANIM` in `wearables.js`): the cat hat drops and bounces and its ears
  spring up, the visor spins on, Bobo shades flip down off the forehead and the tiny Bobo hops on, Night shades slide
  in from the side, gold cat-eyes zoom in, earrings drop and swing, nose pieces twist/twinkle in. Flat four-point
  sparkles burst where a piece lands. Reduced motion: short scale fades only.
- Capture: tap = photo, hold = video (shared Cola Run recorder, can be sent to the Where is Bobo? globe),
  **Strip** toggle = 3-2-1 countdown then four shots laid out as a booth strip with the EVADE footer.
- **Beam it onto your merch** (2026-11-17, Dapo): the photo / strip sheet hands the shot to Photo Beam
  (`/evade/photo-beam/`). The clean frame (no watermark) is cropped round the tracked faces (hat to chin, ear to ear,
  never thinner than 4:5; `faceBox()` at grab time), written to Photo Beam's IndexedDB (`photo-beam` / `kv`, key
  `handoff`: `{ src: Blob, from, look, at }`), then the page opens `/evade/photo-beam/?from=booth`. Photo Beam takes it
  once, deletes it, says "Beam your booth photo" on its splash with the shot, and its Start opens Make it yours
  directly (Retake = back to the booth); then the usual aim, lock on and Beam onto any charm or the Sukeban tee.
  From a strip you pick which of the four shots to beam. Nothing is uploaded.
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
- Tested in the headless camera simulator with stock face photos (not committed): face found in ~3 s, ears found,
  every piece placed and animated, carousel swipe/snap, photo and strip, face paint on the mesh, mouth trigger fizz,
  wink and eyebrow tricks (fired from `__bb.fire`), two faces at once, no console errors.
- **Not tested on a real phone yet**: fps on mid-range Android, iPhone Safari front camera, real ear-lobe tracking
  under hair, video recording audio, landscape.

## Rounds
- Round 1 (2026-11-16): pieces, lens carousel, animations, strip.
- Round 2 (2026-11-17, Dapo's feedback): septum turned right, no lens decals, Bobo-ear frame tips, tiny Bobo on the
  hat, separate always-there shutter, face tricks, face paint, friends mode.
