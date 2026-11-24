# Eclipse Night (EVADE, sky AR)

`/evade/eclipse-night/` · source `eclipse-night` for events, test logs and clips.

**The moment:** hold up the Eclipse can charm (it "charges": gold rings, fizz bubbles), then point the phone at
the sky. Only the real sky turns into EVADE's night (buildings, trees and people stay in front of it), the night
pours down from overhead, a giant Eclipse can slides over the moon and a flat corona bursts out. Then Bobo's
constellation appears: hold the ring on each glowing star to light it and join the lines. When the last one lights,
Bobo (the real Bobo model with a gold glow) walks out of his stars across the sky and sits beside the eclipse.
Tap the sky (or Fizz) for fizz fireworks. Photo / video with the shutter in the bottom centre, as everywhere.

## Flow
charge (find kc-can / kc-can-back) -> look (point at the sky) -> show (night pours in, eclipse, 6.6 s) ->
trace (11 stars, only if the charm charged it) -> free (Bobo is out, fireworks).
- "No charm with me" skips the charge: the eclipse plays, the constellation waits until the charm is scanned
  (any time later, the charm still unlocks it).
- No sky after 6 s of looking up: "No sky here? Make it night anyway" switches to **Everything above**
  (Options): everything more than ~10 degrees above the horizon becomes the sky, so a ceiling works indoors.

## How the sky works
- The open-source 8th Wall engine (`@8thwall/engine` 0.1.0, MIT) ships a sky segmentation model
  (`resources/semantics-model.tflite` + `semantics-worker.js`, vendored next to `xr.js` in
  `/evade/keychain-ar/vendor/xr/resources/`). We run that worker ourselves; we do **not** use
  `XR8.LayersController`: in the simulator its built-in path fed the model a rotated frame (no sky found on a
  portrait camera) and drew blocks of night in the wrong places.
- Each round: draw what is on screen (the engine's centred "cover" crop of the camera) into 144x256, post it to
  the worker, get a 144x256 sky probability back (~45-120 ms in the simulator), smooth it a little.
- The composite is one full-screen quad in the main three.js scene (drawn first, before anything on the charm):
  it shows the sky scene's render target where the mask says sky. The mask is **re-projected with the phone's
  rotation** since the model last looked (`uM` = P · R(mask)^-1 · R(now) · P^-1), so it stays on the real sky
  between model results. It is also cut below the horizon (no "sky" on grey desks or floors).
- The sky scene has its own camera: the phone's `deviceorientation` (three.js DeviceOrientationControls maths),
  with the engine camera's projection. No sensors (laptops): drag to look.

## Files
`index.html`, `style.css` (flat colours; the splash preview is CSS), `main.js` (everything), this README.
Models: `/evade/keychain/ar/eclipse-can.glb`, `/evade/keychain/ar/bobo-keychain.glb` (EVADE's own models, not
generated). Constellation points are picked on `/evade/keychain/ar/silhouette-bobo.png`.

## Test hooks
- `?test` exposes `window.__en` (mode, seg stats, `aimCenter()`, `aimNext()`, `light(i)`, `forceCharge()`, `boboInfo()`).
- `?nocharm` starts at "look". `?nolog` sends nothing. Test logs: `GET /api/ar/kc-diag?limit=20` on a preview,
  records with `page: 'eclipse-night'` carry `sky {mode, results, ms, pct, pctAvg, pctMax}` and `ori {have, events}`.

## Tested / not tested (2026-11-17)
- Tested in the headless camera simulator (Chromium fake camera; stock skyline / road / cloud photos as the sky,
  not committed): the model finds the sky in an upright portrait frame (skyline 58 %, grey road sky 35 %);
  buildings stay in front of the night; charm found in ~1.7 s; the whole flow (charge -> show -> 11 stars ->
  Bobo -> fireworks), "No sky here?" button, Everything-above mode, fake orientation events.
- **Not tested on a real phone yet**: real orientation sensors on iPhone/Android (alpha drift), the mask staying
  on the sky while the phone turns, the model on a phone CPU with image tracking running, night-time skies
  (the model is for daylight / dusk skies), fps.
