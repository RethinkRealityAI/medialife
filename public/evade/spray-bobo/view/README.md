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
  **View on merch** (second line: needs the real merch and a camera): `/evade/spray-bobo/?c=<id>`.
  **Report**: confirm sheet, `POST /api/spray/creations/<id>/report`, "Thanks, the team will take a look".
- States: loading, not found (404 or no id), taken down (410), offline / error with Retry. `noindex`.
- `prefers-reduced-motion`: the peel-off is short (no spin, no screen flash, smaller bursts, no auto hops,
  no parallax), and the sticker always ends up showing. No WebGL: the sticker is shown as a flat picture.

## The scene (models, pictures, video around the print)
- `paintable.scene` (see `SceneItem` in `src/lib/spray/model.ts`; missing = none; `visible: false` skipped).
  Millimetres of the print, origin its centre, x right, y up, z out; degrees XYZ. The group hangs off the
  card's frame `F` (the print, `H` = 0.0801 tall) scaled by `H / heightMm`, so it lands and tilts with the card
  and stays still while only the sticker spins. Models: rest-pose bounding box, height = `size`, box centre on
  `pos`, `rot` about it, `clip` looped (same rules as `src/components/scene-editor/README.md`). Pictures and
  video: unlit planes `size` tall, alpha kept; video muted, looping, inline; `sound` items unmute after the first
  tap / key and follow the mute button.
- Items pop in, staggered, once the sticker has settled (at once with reduced motion); Replay hides them and
  they pop in again. The camera fits the scene's placed reach (at most about twice the card alone).
- `GLTFLoader` + meshopt load only when there is a model (no Draco decoder is vendored: a Draco GLB is skipped).
  A failed asset is skipped with `console.warn`. Shown in `?embed=1` too. Save image stays the sticker only.
- `SCENE.md`: the recipe for the AR page.

## Pieces
- `index.html`, `style.css`, `main.js`: plain ES modules, three.js from `/roblox/creators/vendor/three/`
  (importmap). All URLs are absolute because the page is also served at `/sb/<id>`.
- The sticker geometry, its shadow, the orbit, splats, shine, the paint composite and the artwork are copied
  from `../main.js` (the AR page), not imported. The lights are softer than the AR page's (a dark page instead
  of a camera picture behind the sticker would otherwise wash the paint out).
- Flat colours only (no gradients); the only soft edge is the sticker's blurred shadow, as on the AR page.
- `?test` exposes `window.__sbv` (phase, life, scene and card groups) for automated tests.

## Tested
Headless Chromium (SwiftShader) against `vite dev` with local storage in `.data/ar/`: at 390x844, 375x667,
844x390 and 1440x900; reveal sequence; tap hop, hold jump, drag spin and settle, keyboard; Save image (download
path); Share (copy path); Report; 404, 410, offline and loading states; a creation without base coat or lines
(the print shows under the paint); `/sb/<id>` (rewrite simulated). Not tried on real phones: Web Share with a
file, device tilt and sound need a real device.
