# EVADE keychain AR: Bobo's Pop-Out

`/evade/keychain-ar/` — point the camera at the EVADE acrylic keychain and Bobo and the Eclipse can
jump off their charms, land below the keychain and come alive. A black silhouette stays on each charm
where the character was.

Image tracking is the **open-source 8th Wall engine** (`@8thwall/engine` 0.1.0, MIT,
github.com/8thwall/8thwall), self-hosted in `vendor/xr/` (`xr.js` + the `xr-tracking.js` chunk; the
face and sky chunks are not shipped). No 8th Wall account, key or hosted platform. Rendering is plain
three.js through `XR8.Threejs.pipelineModule()`. World tracking (SLAM) is off: it is a separate
binary under a different licence and is not needed here.

## Files
- `index.html` — splash, in-camera HUD, photo sheet, error sheet.
- `main.js` — everything else (see the comment at the top for how the alignment works).
- `image-targets/` — two targets written by `scripts/build-keychain-ar/build_targets.py`:
  `kc-bobo` (Bobo's head and chest; at rest the can charm hangs over his lower right, so that part is
  left out of the crop) and `kc-can` (the can's logo and wordmark).
- `splash.jpg` — backdrop generated with Higgsfield from a text prompt only (no EVADE artwork was
  given to it); the real Bobo and can renders are composited on top.
- `target/` — a flat picture of the keychain to point a phone at when the real keychain is not to hand.

## How it lines up
Each target is a 3:4 crop of a charm picture (14 px per mm). The crop numbers in the target json give
the whole charm frame around the tracked crop, in real metres. The `Silhouette` quad inside each GLB
covers exactly that frame, and the model starts at (charm frame) x (Silhouette matrix)^-1, so the
model, the silhouette and the print coincide. The silhouettes are children of the tracked charm
frames, so they stay on the keychain while the characters fly off.

Either charm can start the experience. If only one is tracked, the other charm's frame is placed from
the keychain's rest layout (taken from the 3D keychain model); as soon as both are tracked the measured
offset is used and remembered. On the real keychain the charms swing, so the untracked one is
approximate until the camera sees it.

The characters stand upright using the phone's gravity sensor when the browser allows it (iOS asks on
Start), otherwise "up" is the top of the screen. If the keychain lies flat on a table they land on the
table in front of it instead of below it.

## URL switches
- `?debug` draws the two charm frames and tints the silhouettes, and logs engine events.
- `?debug&nopop` only tracks: use it to check alignment on a real keychain.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the flat keychain picture): the
engine finds the targets, the frames land on the charms, the sequence runs to the end, photo and
buttons work. **Not yet tested on a phone or on the physical keychain**: acrylic glare, the real print
colours and how reliably the small can charm is picked up are unknown until then.
