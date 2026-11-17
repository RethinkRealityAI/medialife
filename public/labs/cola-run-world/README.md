# Cola Run on 8th Wall world tracking (test)

`/labs/cola-run-world/`: the real Cola Run game (`mattercraft/cola-run/OrbHuntGame.ts`, bundled for the browser
as `/evade/cola-run-lab/assets/orb-hunt-game.js`) placed on the floor with 8th Wall's SLAM instead of Zappar's
Instant World Tracker. A quick test, not the shipping game: no recorder, no Bobo's Hideout, no platform events.

## Engine
- World tracking is NOT in the MIT open-source engine we vendor for image targets (`/evade/keychain-ar/vendor/xr/`,
  `@8thwall/engine` 0.1.0). It comes from the distributed binary `@8thwall/engine-binary@1.0.0` (Niantic Spatial,
  XR Engine License, free, closed source), loaded unmodified from jsDelivr with `data-preload-chunks="slam"`.
- Licence (8thwall.org/docs/engine/license): fine for branded / marketing experiences for clients when the engine
  is one component of a broader deliverable; not for selling the engine or an engine-based toolkit. Credit
  Niantic Spatial + link the licence (splash footer + index.html comment).
- Needs a phone: camera + motion sensors (iOS asks for motion access in the Start tap). Laptops are refused.

## How it works
- `XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' })`; camera starts at
  y = `CAM_H` (1.3) so 1 unit ≈ 1 m on the floor. Floor = plane y = 0.
- The game's Placement Anchor is a duck-typed object (`placementMode`, `placementValid`): while placing, the board
  follows the floor under the screen centre and faces the player; Place is disabled until the floor is hit.
- Board size: `?scale=` (default 0.2 of game units) or pinch with two fingers before Place.
- `?diag` (on by default on previews / localhost): engine, camera and tracking status in the corner. `?verbose`
  turns on 8th Wall's own logging.

## Tested
- Headless Chromium simulator (fake 960x720 camera, faked device motion): engine loads, SLAM reports NORMAL,
  floor found, Place, round starts, joystick moves Bobo. NOT tried on a real phone yet.
