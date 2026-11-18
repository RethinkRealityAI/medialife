# Labs tech demos (world and face)

Eleven small MEDIALIFE tech demos rebuilt from legacy 8th Wall sample projects. They use plain three.js r180 (no
A-Frame) on one shared shell. Each demo's own README names its source sample and asset credits. Each `main.js`
starts with a comment listing what was kept from the sample and what changed.

**Not phone-tested.** Every demo has been checked only in a headless Chromium simulator, with a fake camera
video, faked motion sensors and `?desktop&test`. Each check proved that the demo boots, places its content, that
the core interaction works, and that the console stays clean. Test every demo on a real iPhone and Android phone
before it goes live.

| Folder | Title | What it is | Source sample | Engine |
|---|---|---|---|---|
| robot-chat | Talk to Misa | A chat character on your floor who answers and dances | chatbot | world |
| joystick-robot | Robot Run | Drive a robot round your floor with a joystick | bunnyhop / rideordie | world |
| tap-to-place | Street Kit | Pick a bench, bin or lamp from a tray and tap the floor to place it | taptoplace | world |
| float-notes | Float Notes | Sticky notes floating in the air; edit them, drop them all | floatnoates | world |
| product-viewer | Product Viewer | A car in your room, colour swatches, AR / 3D switch | 3dar | world |
| physics | Pin Bowl | Bowling pins on your floor; tap to throw a ball (cannon-es) | physics-collider | world |
| face-effects | Face FX | Shades, face paint and a mask on up to three faces, branded photo | face-effects | face |
| moon-shop | Moon Shop | A doorway onto a showroom on the moon; walk through it | shop | world |
| nav-mesh | Robot Path | Tap a spot and the robot finds its way over ramps and bridges | nav-mesh | world |
| occlusion-floor | Floor Lift | A pillar rises out of your floor and sinks back (depth-only hider) | hidermaterial | world |
| image-to-world | Picture to Room | Point at a picture; a sand castle appears on the floor and stays | image-slam | world + image target |

Not built: `camera-swap` (swap-camera sample). It switches one engine between back-camera world tracking and
front-camera face tracking. It is left out because the face engine (MIT vendored build) and the world engine
(engine binary) are different builds, and the shared shell runs one mode per page.

## Shared shell (`shared/`)

`shell.js` and `shell.css` provide:

- The branded splash: wordmark, 3D hero turntable, title, lead, Start disabled while loading, loading bar and
  "Activated by MEDIALIFE".
- An "open on your phone" QR sheet for computers. Phones are detected by user agent, and engine device errors are
  sent to the same sheet.
- Engine boot for world or face mode, with the motion permission asked inside the Start tap.
- Tap to place with a reticle, and pinch while placing.
- A Move button, bottom right, once content is placed.
- The shutter bottom centre, giving a branded photo with a share or save sheet.
- A menu with How it works, Start again, More demos and Licences (`/evade/licences/`).

All colours are flat; there are no gradients. Each demo is `createDemo({...})` in its `main.js`.

Engines:

- World: 8th Wall engine binary 1.0.0, loaded unmodified from jsDelivr.
- Face: the MIT open-source engine vendored at `/evade/keychain-ar/vendor/xr/`.

No engine maker names or logos are shown to users. The licences are on the Licences page only.

## Robot chat and AI

`robot-chat` ships a **local scripted bot**: no network calls and no API key. The sample sent messages to OpenAI
from the browser through a hosted secret. A server hook is marked in `robot-chat/main.js` (`CHAT_ENDPOINT`, or
`?bot=/api/route`), and the README there describes the request and response shape. The key must stay on the
server.

## Media

`media/` holds about 6 MB of models and textures, compressed with gltf-transform (meshopt, webp, 1024 px).

## Testing hooks

Each demo exposes a small `window.__<name>` object for the simulator, plus `window.__demo`. `?diag` shows a
diagnostics panel. `?test` skips the first-run How sheet.
