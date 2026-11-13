# EVADE keychain AR: Spray Bobo

`/evade/spray-bobo/` — your phone is the spray can. Point it at a charm on the EVADE keychain: the Bobo cat
or the Eclipse can (each has its own canvas and its own saved painting). When the charm is found its outline
lights up and a spray can slides onto the screen. Tap the can: it flies onto the charm, bursts ("PSSHT!"),
and the blank canvas (the charm as a colouring-book stencil) spreads out from the charm's middle with a wet
yellow edge. Aim the phone like a can and hold the can (or the
screen) to spray. Save, and the painting flashes, peels off the charm as a 3D die-cut sticker of your Bobo,
spins and lives above the print from then on. It is kept on the phone (IndexedDB), so the next scan brings
your Bobo straight back.

## Pieces
- `index.html`, `style.css`, `main.js` — the page. Flat colours only (no gradients, Dapo's platform rule).
- `art/` — written by `scripts/build-spray-bobo/build_stencil.py` from the kc-bobo image target itself
  (thresholds and morphology only; no generative tool touches EVADE art):
  `cat-mask.png` (the stencil: paint only shows inside the cat), `cat-lines.png` (the outline),
  `cat-outline.json` (the sticker's cut line); `can-*` the same for the Eclipse can. The can's tracked
  picture is a soft photo, so its stencil is cut from the clean flat art (kc-can-art.jpg) and placed onto the
  photo by matching the two pictures (moon, lettering and tab line up). The back picture (QR side) shows the
  same can body, so the canvas is moved onto it by the offset stored in `can-outline.json` ("sides").
- Engine and image targets are shared with Off the Chain: `/evade/keychain-ar/vendor/xr/` (open-source 8th
  Wall, MIT) and `/evade/keychain-ar/image-targets/kc-bobo*.json` (both sides of the cat charm) and `kc-can.json`,
  `kc-can-back.json` (both sides of the can charm).
- `PIECES` in `main.js` lists the charms. Whichever is in view becomes the current one (`pickPiece`); while
  painting it stays locked to the charm being painted.

## Once saved
He (or the can) turns to look at the phone, paint drops in its colours orbit it (passing behind), and a flat
white shine sweeps over the gloss now and then. Tap: hop. Hold, then let go: a big jump with a spin and a
splat. Swipe: spin, which coasts and settles face-front. Shake the phone: he shakes the wet paint off.
Little cheers at 25, 50 and 80% painted.

## How painting lines up
The engine's `renderer.setSize()` writes the drawing size into the canvas's inline style, so with a pixel
ratio of 2 the canvas showed at twice the screen size and its middle (where the paint went) sat in the bottom
right corner (Dapo's first phone test). The stylesheet pins the canvas to the screen (`!important`; also
added to Off the Chain, whose dpr setting had the same problem), the page draws at 1x by default like Off the
Chain (`?dpr=2` for sharper), and screen points are mapped through the canvas's own box. The test log records
`aim` (how far the paint's spot shows from the nozzle, in px) to confirm on phones.

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
The shutter is always in the bottom centre: in find and saved modes, and while painting through the camera
button in the right column (the tools step aside, the can stays so you can film yourself spraying; "Tools"
brings them back). Tap for a photo, hold to film; the spray mist is drawn into photos and clips (the Cola Run recorder, source `spray-bobo`; clips can
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
Round 2 (2026-11-13, simulator again, at a pixel ratio of 2): paint lands under the reticle; the can
charm is found and painted from a photo of kc-can; can fly-in, canvas spread, camera mode, saved-mode
gestures work. Android's "remove animations" setting no longer hides the spray.
**The new parts are not yet tried on a phone or on the real charms.** Unknowns until then: the gyro bridge, acrylic glare,
how steep an angle still tracks, and whether shaking to refill feels right.

Test pictures: `/evade/keychain-ar/target/` has both charms' tracked pictures side by side (with a gap, true
size to each other) or one at a time, with Flip for the other sides and full screen.
