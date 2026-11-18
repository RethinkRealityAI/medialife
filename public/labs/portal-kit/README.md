# Portal kit (world-tracked walk-through doors)

Shared runtime for the MEDIALIFE Portal (`/labs/medialife-portal/`) and Bobo's Portal (`/evade/bobo-portal/`).
A page supplies a splash, a `world.js` (`preload(loader)` + `makeWorld(data)(ctx)`) and a `runPortal({...})` config;
the kit does the rest.

- **Engine:** 8th Wall engine binary (`@8thwall/engine-binary@1.0.0`, SLAM), loaded unmodified from jsDelivr with
  `data-preload-chunks="slam"`. three.js r180 from `/roblox/creators/vendor/three/`.
- **Portal illusion (no stencil buffer on the 8th Wall context):** `portal.js` draws a huge depth-only wall with a
  door-shaped hole first, and clips every world material to the far side of the door plane. Crossing the door plane
  inside the opening flips to "inside": the wall and clip drop, and a depth-only panel in the opening keeps the room
  visible through the door behind you. Outside but behind the door plane (walked round the frame), the world isn't
  drawn at all (2026-11-18 round 2), so it can't wrap round you with nothing in front to hide it.
- **Big existing worlds (lots of materials, already warmed):** skip `register()` (clipping) and keep every piece of
  the world at z < 0 instead; the depth-only wall alone then hides it from outside. Clipping changes every
  material's shader and throws away a warm-up (see the Cola Run hideout).
- **Membrane:** flat colour bands (no gradients) in a ShaderMaterial; it irises open on Place and thins as you approach.
- **Flow:** find floor -> aim (door follows the floor reticle, pinch to size) -> Place -> walk through. Move (bottom
  right) picks the door up again and keeps the world state. Shutter bottom centre (photo / video with watermark).
- **Desktop:** open-on-phone QR (user agent check), `?desktop` skips it. Engine "unsupported device" errors go to the QR.
- **Test modes:** `?preview` renders the world with its own camera (no engine; `window.__preview.set(x,y,z,yaw,pitch)`),
  `?test` exposes `window.__portal` (place, enter, exit, tapObject, floorAt...). `?diag` shows the test log overlay.

## Tested / not tested (2026-11-18)
- Tested: headless simulator (fake camera + sensors) for placement and HUD; `?preview` walk-through for crossing,
  inside view, look-back through the door, taps, counters, finales; splash at 390x844, 375x667, 1366x800.
- Not tested yet: a real phone (tracking drift while walking, frame rate on mid-range Android, iOS motion prompt,
  video capture of the portal).

## Also used by
- **Cola Run's walk-in Bobo's Hideout** (`/evade/cola-run/hideout-portal.js`, 2026-11-18): HubCore's own room is
  moved into a Portal's world and laid out on one floor; `?hideout=classic` keeps the old two-storey room.
  Round 2 (after the first phone test went black): no clipping, no new lights, everything laid out and compiled at
  load (0 shaders compile when the door opens, was 25), small canvas textures, a "graphics restarted" sheet on a
  WebGL context loss, and a phone test log (`/api/ar/kc-diag` on previews: stalls, tracking, door steps, GPU resets).
