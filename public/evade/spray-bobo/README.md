# EVADE keychain AR: Spray Bobo

`/evade/spray-bobo/` — your phone is the spray can. Point it at the cat charm on the EVADE keychain; when
Bobo is found his outline lights up and a spray can slides onto the screen. Tap the can and a canvas (Bobo
as a colouring-book stencil) is laid over the charm. Aim the phone like a can and hold the can (or the
screen) to spray. Save, and the painting flashes, peels off the charm as a 3D die-cut sticker of your Bobo,
spins and lives above the print from then on. It is kept on the phone (IndexedDB), so the next scan brings
your Bobo straight back.

## Pieces
- `index.html`, `style.css`, `main.js` — the page. Flat colours only (no gradients, Dapo's platform rule).
- `art/` — written by `scripts/build-spray-bobo/build_stencil.py` from the kc-bobo image target itself
  (thresholds and morphology only; no generative tool touches EVADE art):
  `cat-mask.png` (the stencil: paint only shows inside the cat), `cat-lines.png` (the outline),
  `cat-outline.json` (the sticker's cut line).
- Engine and image targets are shared with Off the Chain: `/evade/keychain-ar/vendor/xr/` (open-source 8th
  Wall, MIT) and `/evade/keychain-ar/image-targets/kc-bobo*.json` (both sides of the cat charm).

## How painting lines up
The paint texture (768x1024) is the kc-bobo target picture, so a point on the tracked picture is a point on
the canvas. The nozzle is the middle of the screen (or the finger, in finger mode): a ray from the camera
hits the picture's plane, and the paint lands there. The spray footprint grows with distance (nozzle
half-angles 0.6 / 1.4 / 2.8 degrees, Skinny / Medium / Fat) and stretches at a slant; the reticle shows it
and the distance in cm. Fast sweeps are filled in between frames. Paint held in one spot runs: drips flow
down the charm using the phone's gravity (a charm lying flat pools instead).

The can holds 24 s of spray (`CAN_SECONDS`); shake the phone (or tap the empty can) to refill. `?endless`
turns that off.

## Tracking robustness
- **Pose**: follows the engine without lag; only sub-millimetre jitter is smoothed (`follow`).
- **Which side of the charm** (`pickSide`): both pictures often lock onto one charm because the cat is
  nearly symmetric. Each picture is placed by its own pose and compared with the camera (30x40, weighted to
  the cells that differ from the cat's mirror image: tail, lettering); the better fit wins over time. While
  painting the side is locked: it only turns if the other side alone is seen for 1.5 s (keychain turned
  over). In the simulator this always settled on the right side within about 1 s (front) and 5 s (back);
  the mirror-about-the-middle test used by Off the Chain flipped with the tilt.
- **Gyro bridge** (`gyro`): when the engine drops the charm, the phone's gyroscope carries the pose for up to
  1.5 s, so a stroke doesn't break off. Browsers disagree on rotationRate's axes, so four readings run side
  by side and each is checked against the real tracking every 0.3 s; one is only used once it predicts the
  charm's turn clearly better than holding still. With none proven, the pose is only held for 0.4 s.
  (Not testable in the simulator: no motion sensors there. The test log shows which reading won.)
- iPhone close focus: the multi-lens camera at 1920x1440 (as Off the Chain), with the standard camera as
  fallback. Android asks for continuous focus where offered.

## Photo, video, artwork
Shutter (alive mode): tap for a photo, hold to film (the Cola Run recorder, source `spray-bobo`; clips can
go to the Where is Bobo? globe as "New Spray Bobo clip"). **Artwork** makes a 1080x1350 post: your Bobo as
a die-cut sticker on EVADE yellow with both logos.

## Switches
`?test` exposes `window.__sb` for automated tests; `?debug` draws the picture frame; `?only=kc-bobo` loads one
side; `?nolog` sends nothing; `?macro=0` uses the standard iPhone camera.
Test logs go to `/api/ar/kc-diag` (records with `page: 'spray-bobo'`) on previews and local dev only, or
with `?diag` on medialife.ai.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the kc-bobo picture moving and tilting,
and of its mirror): found in under half a second, canvas lines up, spraying, colours, undo, drips, finger
mode, save, the sticker animation, artwork export and coming back after a reload all work.
**Not yet tried on a phone or on the real charm.** Unknowns until then: the gyro bridge, acrylic glare,
how steep an angle still tracks, and whether shaking to refill feels right.
