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
- **Beam it onto your merch, in the booth** (2026-11-17, Dapo: "one continuous, seamless flow"): Photo Beam runs
  inside the booth in a full-screen frame (`/evade/photo-beam/?embed=booth`), loaded in the background after the
  first shot. Beam: the clean frame (no watermark), cropped round the tracked faces (`faceBox()` at grab time), drops
  to the bottom ("Switching to the back camera"), the booth pauses its face engine (`XR8.pause()` frees the front
  camera), and posts `{ type: 'pb-beam', blob, delay }` (450 ms iOS camera hand-over). The frame starts (first time)
  or resumes its image-tracking engine on the back camera with the photo waiting to aim, posts `pb-live`, and fades in.
  Style (bottom right) opens Make it yours; Booth (bottom left) or Options > Back to the Bobo Booth pauses it and posts
  `pb-back`; the booth resumes its front camera (checked: frames advancing, play-kick, one pause + resume).
  Two documents because this engine build can't stop and re-run (`No valid session manager`) nor run face and image
  tracking together. From a strip you pick which shot. Nothing is uploaded. Fallback if the frame can't load in 20 s:
  the old page hand-over (IndexedDB `handoff` + `/evade/photo-beam/?from=booth`).
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

## Tuning after Dapo's phone test (2026-11-17)
- The engine's `mouthOpen` fires on talking and on a toothy smile (lip gap ~0.10 FU = 14 mm), and head shakes set it
  too. The fizz now needs the lip gap (upperLip to lowerLip) over `MOUTH_GAP` 0.2 FU (~28 mm, `?mouthgap=` to tune),
  held 350 ms, with the head steady (< ~60 deg/s) and the face found for 1.5 s. Eyebrows: held 450 ms, steady. Wink:
  steady and not while the mouth trick runs. The fizz is silent (the beep is gone).
- Stale rigs (a face lost and re-found under a new id) are dropped after 1.5 s, so they never block a face or raise
  "Friend joined" falsely.
- The splash's 3D still stays as a picture while the camera starts (disposing its renderer used to leave a blank box).

## Rounds
- Round 1 (2026-11-16): pieces, lens carousel, animations, strip.
- Round 2 (2026-11-17, Dapo's feedback): septum turned right, no lens decals, Bobo-ear frame tips, tiny Bobo on the
  hat, separate always-there shutter, face tricks, face paint, friends mode.
