# Spray Bobo viewer

`/sb/<id>` (Netlify rewrite to `/evade/spray-bobo/view/index.html`), or `/evade/spray-bobo/view/?c=<id>`.
What a share link or QR from the Studio opens: one fan's painting, no camera. Mostly phones, also desktop.

## What it does
- Reads `GET /api/spray/creations/<id>` (creation + paintable in one request), then loads the print, the mask,
  the lines (only if `linesOn`), the cut line (`files.outline`) and the paint layer (`creation.image`).
- The merch print lies on a flat card (ink rim, flat see-through shadow, tilted back like it is on a table) on
  a slate page with flat splats. The card lands, the painting spreads over it with the wet yellow edge, then the
  same reveal as the AR page after saving: flash, it peels off as the 3D die-cut sticker, spins and settles
  hovering above the print; paint drops in the creation's colours orbit it, a shine sweeps over it now and then,
  splat bursts.
- Drag / swipe: spin (coasts, settles face-front). Tap: hop. Hold, then let go: big jump with a spin.
  Keyboard (the stage is focusable): Enter / Space hop (hold for the big jump), arrows spin.
  Parallax: the pointer on desktop; the phone's tilt where the browser gives it without a permission prompt
  (Android; iOS asks, so it stays still there).
- Sounds are made with WebAudio (no files), start after the first tap; mute button top right (remembered).
- **Replay** plays the peel-off again. **Save image**: a 1080x1350 PNG, the sticker on EVADE yellow with both
  logos, the paintable's name and the short link (made ahead, so the share sheet opens straight from the tap;
  Web Share with a file where possible, else a download). **Share**: Web Share link, else copy with a toast.
  **See it on your merch**: `/evade/spray-bobo/?c=<id>` (needs the real merch and the camera).
  **Report**: confirm sheet, `POST /api/spray/creations/<id>/report`, "Thanks, the team will take a look".
- States: loading, not found (404 or no id), taken down (410), offline / error with Retry. `noindex`.
- `prefers-reduced-motion`: the peel-off is short (no spin, no screen flash, smaller bursts, no auto hops,
  no parallax), and the sticker always ends up showing. No WebGL: the sticker is shown as a flat picture.

## Pieces
- `index.html`, `style.css`, `main.js`: plain ES modules, three.js from `/roblox/creators/vendor/three/`
  (importmap). All URLs are absolute because the page is also served at `/sb/<id>`.
- The sticker geometry, its shadow, the orbit, splats, shine, the paint composite and the artwork are copied
  from `../main.js` (the AR page), not imported. The lights are softer than the AR page's (a dark page instead
  of a camera picture behind the sticker would otherwise wash the paint out).
- Flat colours only (no gradients); the only soft edge is the sticker's blurred shadow, as on the AR page.
- `?test` exposes `window.__sbv` (phase, life) for automated tests.

## Tested
Headless Chromium (SwiftShader) against `vite dev` with local storage in `.data/ar/`: at 390x844, 375x667,
844x390 and 1440x900; reveal sequence; tap hop, hold jump, drag spin and settle, keyboard; Save image (download
path); Share (copy path); Report; 404, 410, offline and loading states; a creation without base coat or lines
(the print shows under the paint); `/sb/<id>` (rewrite simulated). Not tried on real phones: Web Share with a
file, device tilt and sound need a real device.
