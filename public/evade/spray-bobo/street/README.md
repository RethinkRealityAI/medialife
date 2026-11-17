# Spray Bobo Street (`/evade/spray-bobo/street/`)

Takes Spray Bobo art off the merch and into the room, on 8th Wall **world tracking** (SLAM). Three modes:

- **Hang**: place the art as a poster on a wall (flies in from the phone, slaps on with a shadow) or as a standee
  on the floor or a table (springs up, with a floor shadow). Up to 12.
- **Stamp**: press the art onto any surface the camera finds, as a rubber-stamp print (ink grain, small random
  size and twist so no two match). Up to 40.
- **Graffiti**: hold the can (or a finger on the camera) and spray straight onto walls and floors. The first spray
  on a spot puts a 3.2 m canvas on that surface; 10 caps, 3 nozzles, close-range splatter, drips that run down
  under gravity, stop and pool at the floor line, and lie flat as puddles on floors. Undo (6 steps). Up to 6
  canvases.

Always on screen: the shutter (bottom centre, photo tap / video hold) and **Move** (bottom right): picks up the
last hung piece, stamp or canvas, it follows the aim, tap to put it down (a poster turns into a standee and back
when it moves between wall and floor), Move again cancels. Pinch = size, twist = rotation.

Art: the phone's own Spray Bobo paintings (written by Spray Bobo as die-cut PNGs to IndexedDB `spray-bobo` / `kv`
under `street:<piece>` when a painting comes alive) plus the 29 EVADE decals as stickers. Spray Bobo's **Hang it**
button (alive bar) opens `street/?mode=hang&art=<piece>&go=1`, and Options > **Graffiti mode** opens Graffiti.

## What the engine gives us (and what it doesn't)

`@8thwall/engine-binary` (Niantic Spatial licence, loaded unmodified from jsDelivr, `data-preload-chunks="slam"`):

- `XrController.hitTest(x, y, ['FEATURE_POINT'])` returns real 3D points on walls, even fairly blank ones. The
  rotation it returns is always zero (no surface angle), and the first hits after start can sit at the camera
  (distance ~0): filtered at > 15 cm.
- `ESTIMATED_SURFACE` / `DETECTED_SURFACE` returned nothing in our tests; there is no vertical-plane detection or
  plane event in the JS API. The floor is the tracking origin plane (y = 0, camera starts at 1.3).

So the page finds surfaces itself (`updateSurface`): the floor by ray to y = 0; anything else by a plane fit
(PCA) over the last 0.9 s of hit points around the aim, snapped to wall (upright), table (flat) or slope. A loose
fit falls back to "a wall facing the phone" at the hit point. A wall fit is kept within 35 degrees of facing the
phone unless the evidence is strong (wide, tight, many points). Kind changes need 3 frames; the angle eases in.

## Tested

Headless Chromium with a fake camera (y4m of a rendered room: textured wall, brick wall, wooden floor) and fake
motion events. Wall found at the right distance (within ~5 cm at 2.2 m) and angle (median 1 degree, 90 % within
7 degrees on the textured wall); poster, standee, stamps, graffiti with drips, Move, Undo, photo, the handoff from
Spray Bobo (`street:bobo` written, page opens in Hang with that art). **Not tried on a phone yet.** Things to
watch on phones: wall angle on plain painted walls, how drips look, stamp size, frame rate with several canvases.

`?test` exposes `window.__st` (setMode, act, pickUp, undo, startSpray/stopSpray, sprayPath, fakeSurf, surf...);
`?diag` shows the surface panel; `?desktop` lets it run off a phone.
