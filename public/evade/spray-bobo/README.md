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

## Decals and the options menu (round 3, 2026-11-13)
- **Decals** (`decals/`, drawn by `scripts/build-spray-bobo/build_decals.py`, hand-drawn SVG): Wear (shades, hats,
  collars: each drawn on Bobo's own picture with a `fit`, so it lands on his eyes, head or neck, and a new one
  swaps the old one in the same `slot`), Fun stickers, and EVADE game icons. After the first Save the page asks
  "Dress up Bobo?"; Decal mode (the Decals button) lays the painting flat again: tap a decal to fly it on, drag
  to move, pinch or the corner handle to size and turn, Flip / To front / Remove, Done. Decals ride the 3D
  sticker, are saved with the painting and drawn into the artwork. They are kept in picture-frame fractions, so
  they work on any piece.
- **Options** (bottom sheet, one button): spray with phone or finger, outline, white base coat, camera, sound,
  how to play, clear and new painting (two taps to confirm). Replaces the unlabelled side buttons.

## Pieces are data (PIECES in main.js)
Each piece: its image targets, stencil art (`art/<art>-mask.png`, `-lines.png`, `-outline.json`), saved-painting
key and copy. Optional: `tdir` (folder with its target files and a `layout.json`, default Off the Chain's),
`view` (height in metres it is drawn at in AR, so a big print keeps the charm's look), `sprayK` (wider spray),
`near` (cm before "come closer"), `them` (him/her/it in tips), `ask`, `seek`, `evade: false` (no EVADE logo on
its photos and artwork).

**Sukeban tee** (`sukeban`): `scripts/build-spray-bobo/build_sukeban.py` places the clean character art
(`public/work/sukeban-sticker-large.webp`) onto Dapo's photo of the printed tee (`src/sukeban-tee.png`, match
0.91) and writes `targets/tee-sukeban.*` (the whole print, teal panel included, 3:4) plus the character-only
stencil. The print is assumed to be 12 in wide (`WIDTH_M`): only the cm readout uses it. Tested in the
simulator from the tee photo itself: found, canvas lines up, paint, save, decals, artwork.

## CMS merch, `?set=`, viewer mode `?c=`, scenes (round 4, 2026-11-14)
`cms.js` (no three.js, testable in Node) reads the Spray CMS (`src/lib/spray/`); `scene.js` draws scene items.
The page still works with no API at all (a plain static server): every CMS fetch is optional and silent.

**Start.** The built-in pieces start loading at once. In parallel `GET /api/spray/sets` (2.5 s limit, then the
page carries on without it; `?set=` and `?c=` get 8 s since they are what the visitor came for). The start button
waits for both, so a slow CMS delays it by at most 2.5 s and never blocks the camera once started.

**CMS paintables → PIECES** (`pieceFromPaintable`). Built-in records (`builtin: true`, ids `bobo`, `can`) are not
remapped: the built-ins stay exactly as in `main.js`; only their `scene` and `heightMm` are taken.
| piece field | from the paintable |
|---|---|
| `k` | `id` |
| `targets` | `targets[].name`, front first, at most 2 sides; engine data from `targetData` (matched by name) |
| `flip` | `{ name: -1 }` for each target with `flip: -1` |
| `xf` | each target's `xf` (metres, y up, radians), scaled like the canvas when drawn smaller (`view`) |
| `mirrorPair` | any side has `flip: -1` (a turn while painting needs 1.5 s; the cat's own side test only runs for Bobo) |
| art | `files.mask`, `files.lines` (null: a dark rim drawn around the mask), `files.outline` (`{points}`) |
| `print` | `files.print` (the sticker without base coat; the viewer splash) |
| real size | `heightMm` tall, width from the front target's pixel aspect (stands in for `layout.json`) |
| `view` | 0.1 m when `heightMm` > 120 (drawn at charm size, like the Sukeban tee), else real size |
| `sprayK` | `(heightMm / 80) ^ 0.3`, 1 to 2.5 (80 mm: 1, the tee's 406 mm: 1.63, its hand-set value 1.6) |
| `near` | `40 * sqrt(heightMm / 80)` cm, 40 to 150 (80 mm: 40, 406 mm: 90, the tee's hand-set values) |
| `key` | `cms:<id>` (its own saved painting in IndexedDB) |
| copy | `name` without a trailing "(...)": seek, found, back, ask "Deck out X?", them "it", title "MY X" |
| `evade` | `client === "EVADE"` (EVADE logo on photos and artwork) |
| `scene` | `scene` |

**Target limit.** The engine tracks at most 10 image targets at once (`MAX_TARGETS`; 8th Wall's documented limit,
not enforced in the vendored code). The built-ins use 5 and always stay; live CMS pieces follow in the CMS's
order (newest first) while they fit; the rest are left out (logged to the console). `?set=<id>` narrows the
page to that one piece, so any piece, drafts included, can always be tried.

**`?set=<id>`** (the Studio's camera button: `?set=<id>&from=studio`): `GET /api/spray/sets/<id>` (drafts too),
that piece only, the normal painting flow. Unknown id or failed load: a small notice on the splash and the usual
pieces.

**`?c=<creation id>`: viewer mode** ("View on merch" in the share viewer). Reads the creation, then its merch
through `/api/spray/sets/<paintable>` (the creation's copy if that fails) and the paint layer. Only that piece is
an image target. The splash keeps its look: "See it on your merch", the painting flat on its print (base coat and
outline as the painter left them), one button "View on merch" that opens the camera. In the camera: the print's
thumbnail as the guide and "Point your camera at X"; once found, the painting shows as the finished 3D sticker
(the same presentation as a saved painting, `primer` / `linesOn` respected, decals only if the creation carries
them), with the merch's scene. Controls: the shutter (bottom centre), Sound, and "Paint your own" (loads the
normal page). No can, canvas, caps, decals, options, ask or saving: nothing of the painting kit is reachable, and
this phone's own paintings are neither read nor written. 404 / 410 / offline: "We couldn't find that painting" /
"This painting was taken down" on the splash, and its button becomes "Paint your own".

**Scenes** (`scene.js`, the contract in `model.ts`): the items hang off the tracked picture, `H / heightMm` AR
units per mm, so they sit at exact real size relative to the print; shown only while the piece is tracked now,
in every mode (they pop in when the piece is found). Models: scale = size / bounding-box height, box centre on
pos, `clip` loops; pictures and video: planes `size` mm tall, `size * aspect` wide; video muted, looping, inline,
its sound after the first tap if `sound` (and the page's sound is on); `visible: false` skipped. GLTFLoader (and
the meshopt decoder) load only when there is a model. A failed asset is skipped with a console warning. On the
can's back side they move with the canvas (`xf`); on a mirrored side (the cat through the acrylic) they are placed
mirrored but not drawn mirrored (words stay readable). Items behind the print are hidden by an invisible card the
size of the picture (added only when some item reaches behind it). **While painting** (paint and decal modes)
nothing in the scene is hit-tested (the spray aims at the picture's plane), and items that stand in front of the
print fade to 22 % (a ghost, so you still see where they are) and come back when you save. Items beside the
print stay as they are.

**Tested** (headless Chromium, fake camera from y4m stills of kc-bobo and the CMS piece's two pictures, `vite dev`
with `.data/`): built-in Bobo found, painted, saved, back after reload (with Bobo's CMS scene); a CMS piece
from the list and as a draft through `?set=` found, painted (scene items fade), saved; the mirrored side; scene
items placed within 0.1 % of the expected position and size (as fractions of the engine's target height); broken
and hidden items skipped; viewer mode for a Bobo and a CMS creation, 404, 410; IndexedDB left untouched in viewer
mode. `node` checks for `cms.js` (mapping, limit, fetch fallbacks, time-out). Not tried on a phone.
