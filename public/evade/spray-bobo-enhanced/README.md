# Spray Bobo Enhanced (EVADE) / Spray Enhanced (MEDIALIFE)

World-tracked paint studio: put 3D pieces on your floor and paint them in 3D. One page, two skins.

| URL | Skin |
|---|---|
| `/evade/spray-bobo-enhanced/` | EVADE (default) |
| `/labs/spray-enhanced/` | MEDIALIFE (netlify.toml 200 rewrite to this page; brand picked from the path) |
| `?brand=medialife` / `?brand=evade` | force a skin |

Separate page from Spray Bobo on purpose: Spray Bobo starts from the keychain print (image target) and paints a flat
sticker; this one has no print, is world-tracked from the first frame and paints real 3D surfaces. They can be folded
into one experience later (a "Studio" room mode in Spray Bobo) if Dapo wants one link.

## Flow

Splash (both brand logos, real painted hero renders, Start disabled until loaded) -> camera + "Find the floor" hint ->
library sheet -> the piece follows the reticle (pinch = size, twist / two-finger drag = turn) -> **Place** -> paint.

- **Spray**: hold anywhere; aim = screen centre; the ring shows the spray footprint in cm (distance-based, like a real can).
- **Brush**: finger-drawn marker on the surface (up to 32 stamps a frame, 3 px spacing).
- **Fill**: tap a part to fill it ("Filled Bobo's ear").
- **Stickers**: tap to stick a decal onto the surface (projected, wraps the shape).
- **Erase**: rubs paint back off.
- Nozzle tip (Skinny / Medium / Fat), 10 brand caps + your own colour, Undo (render-target snapshots), Spin.
- **Options**: finish (gloss / matte / chrome / glow), pose (Bobo: Idle, Alert, Purr, Sleep, Run; Classic Bobo; Robot dances),
  Fresh coat, Sound, Clear the room, How to paint, Licences.
- Bottom row: Undo | shutter (photo tap, video hold, ColaCapture) | Move (always on screen once placed; moving keeps the paint).
- Paint saves to IndexedDB (`spray-bobo-enhanced` / `paint`, key `brand:id`) and comes back the next time you place that piece.
- EVADE posts events to `/api/bobo/events` (source `spray-bobo-enhanced`), MEDIALIFE source `spray-enhanced`.
- Computers get the open-on-phone QR (`?desktop` skips). `?nocam` = desk mode (no engine), `?nocam&studio` = transparent renders.
  `?test` exposes `window.__se`; `?diag` shows the world-health line.

## Library (`library.js`)

EVADE: Bobo (Cola Run's `catrun.glb`), Eclipse can, Classic Bobo, blank toy, skate deck (80 cm), art block, robot.
MEDIALIFE: MEDIALIFE figure, giant spray can, blank toy, skate deck, art block, robot.
No generative / image-to-3D tools on anything (EVADE rule). Props are scripted (`scripts/build-spray-enhanced/props.py`),
the robot is three.js's CC0 RobotExpressive (credited on `/evade/licences/`).

To add a piece: add an entry to `ASSETS`. If its own UVs overlap (most character models), build an atlas sidecar with
`scripts/build-spray-enhanced/atlas.py` (xatlas, keyed by glTF mesh/primitive), otherwise give it a non-overlapping
TEXCOORD_1 and set `atlas: null`.

## How painting works (`paint.js`)

Projective GPU painting into a per-piece 1024 paint texture: a brush camera (its frustum = the spray cone) renders a depth
map of the piece, then every triangle is drawn in UV space (`gl_Position = paintUv * 2 - 1`, skinned positions) and only
texels the brush camera sees (facing + depth test) get paint. Premultiplied over-blend, a separate erase blend, chart
mask + dilate so seams do not show, undo by snapshots, PNG save. Works on animated (skinned) pieces: paint follows the pose.

## Tested

- Desk mode (headless Chromium): every tool, every piece, undo, finishes, poses, save/restore.
- World-tracking simulator (engine binary SLAM, fake camera + IMU): tracking NORMAL in ~3 to 5 s, place Bobo, fill and
  brush land on Bobo under SLAM, no errors.
- Splash: iPhone 13, iPhone SE, desktop (QR), both skins.

## Not tested yet

- Real phones (Dapo to test): floor finding, spray feel, frame rate on Android with two or three painted pieces.
