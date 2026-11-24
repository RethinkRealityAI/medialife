# EVADE Hub: build brief (read first)

The EVADE Hub (`/evade/hub/` on medialife.ai) is a fork of the Happi AR hub (RethinkRealityAI/CheerBearAR, branch
`claude/project-thread-tte2zj`, itself the Cheer Bear hub) with every refinement kept: splash, top bar + mode tabs
(3D / AR / Selfie / Photo), mode transitions, tap/hold shutter, review page, AR placement + walk-in door, Move,
Actions, mini games, selfie frames/filters, Photo cutout. It becomes **Bobo's Hideout**: the EVADE character Bobo
(a cat) in the **Collector Hub room** (Bobo's Hideout), and the place where **every EVADE game and experience** lives,
shown as **arcade machines in the hideout** (Bobo's Arcade) and in an **Arcade sheet**.

Dapo's ask (2026-11-22): "create a similar hub experience like we did for Happi but for Evade. All the games and
experiences we've created for Evade should be there. Find a unique and great way to showcase them. The environment in
the 3D mode should be the Collectors Hub. Anything else you think would be great to have in there, feel free. With all
the enhancements and refinements we've made so far, the hub experience to be implemented too."

## Run / build / test
- From the repo root (`/home/user/medialife`): `npm run typecheck:evade-hub`, `npm run build:evade-hub` (outputs to
  `public/evade/hub/`, gitignored). Serve `public/` statically to test the built app WITH the rest of the site
  (thumbnails, games.json, models): e.g. `cd public && python3 -m http.server <your port>` then
  `http://localhost:<port>/evade/hub/`. Or `npm run dev:evade-hub` (Vite, port 5190; site files under `/labs`, `/evade`
  etc. are NOT served there, so prefer build + static server for anything that loads site assets).
- Headless: Chromium + Playwright are pre-installed (`require('playwright')`, launch args
  `--use-gl=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, deviceScaleFactor 1, iPhone UA). Never
  run `playwright install`. Example script: `/tmp/claude-0/shot.cjs <url> <out.png> <waitMs>`.
- Camera modes in the simulator: see the immersive skill `references/8thwall/testing.md` and
  `snippets/sim-camera-test.mjs` (fake camera, `?desktop`). The Happi hub's own e2e notes: `docs/handoff/*.md` in
  `/home/user/cheerbearar` (branch `happi`, checked out there, read-only for you).

## Where things are
- `evade-hub/src/experience/` framework-free three.js + 8th Wall engine binary (world + face in one session; modes are
  plugins). `src/app/` React shell (top slot, toasts, sheets, games panel). `src/happi/` = the Happi-specific pieces
  (character, faces, plaza/kit3d own place, sky, frame, hood, cutout, moves): REPLACE them with `src/evade/`
  equivalents and delete `src/happi/` when nothing imports it. `src/bear/` loads the character; `src/lipsync`,
  `src/audio` exist for the bear (Bobo doesn't talk: no lip sync needed; delete if unused).
- `src/evade/catalog.ts` (shared, orchestrator-owned): `loadArcade()`, `arcadeState()`, `isLocked()`, `launch()`.
  Reads `/evade/arcade/games.json` (+ Where is Bobo?, Digital Collection). Do not hard-code the experience list
  anywhere else.
- Contract (`src/shared/contracts.ts`): the experience emits `arcade` `{ id, source }` when the fan picks a machine
  in the world; the app opens that experience's card (name, sub, needs, lock task, thumbnail, Play -> `launch()`).
- Site assets you can load by absolute URL (same origin): Collector Hub room `/hub/evade/room.glb` (5.2 MB, has its
  own Bobo + clips Spin/Chill/Excited/Sit/Sleep/Walk inside; see how `public/labs/collector-hub/hub-core.js` and
  `mattercraft/cola-run/HubCore.ts` use it, and `public/evade/cola-run/hideout-portal.js` +
  `public/evade/cola-run/arcade-cabinet.js` for the life-size walk-in re-layout and the arcade machine), Bobo
  `/roblox/activated-retail/models/catbobo.glb` (Sit/Walk/Excited/Sleep/Chill, meshopt) + clips
  `/evade/creators/assets/models/bobo-clips.glb` (Idle/Run/Alert/Purr), Eclipse can
  `/evade/keychain/ar/eclipse-can.glb`, EVADE logo `/brand/evade-logo.webp`, Activated by
  `/activated-merch/media/ar/activated-by.webp`, experience thumbnails `/labs/img/*.webp`, hideout screen art
  `/evade/hideout/*.webp`, Cola Run splash `/evade/creators/assets/img/cola-run-splash-sm.webp`, Bobo Booth assets
  `public/evade/bobo-booth/`, shared hint pill `/vendor/ar-kit/hint.css`. Project files: `/mnt/project-files/Evade/`
  (Bobo art, Cola Run splash PNG, Merch photos). `/mnt/project-files` is a network mount: never search it recursively.

## EVADE look
Flat colours only, NO gradients anywhere (CSS, SVG, canvas, 3D glows). Tokens from live EVADE pages
(`public/evade/bobo-hoops/style.css`): slate `#0f1519`, yellow `#f6c344` (primary buttons, ink text `#15131a`, 3D
press shadow `#b98d1f`), cyan `#4fd6e8`, deep `#0a1c2a`, muted `#b8c2cc`, glass panels `rgba(15,21,25,.72)` + blur.
Fonts: "Exo 2" italic 800/900 for display, "Space Grotesk" 500/700 for UI (Google Fonts link in index.html).
Hideout accent colours (BOBO OS apps): red `#e3243a`, pink `#d81b78`/`#ff4f9a`, blue `#2a5bd7`, violet `#6a32e8`,
orange `#ff7a1a`, indigo `#4b3fb8`, green `#078a61`.

## Rules (Dapo's, non-negotiable)
1. Full branded splash (EVADE logo, hero = Bobo in the hideout, title, one-line lead, yellow Start disabled
   "Loading…" until ready, loading bar, "Activated by MEDIALIFE"). No instructions/licence text on the splash.
2. Computers: camera modes show an "open on your phone" QR; 3D works on computers. Phones by user agent, never touch.
3. No gradients. 4. Shutter bottom centre, never overlapped. 5. World tracking: Move / reset placement always on
   screen once placed; moving keeps state. 6. Hint pill = white on black glass, ~5 words. 7. Licences only behind a
   menu link (`/evade/licences/`); never show 8th Wall/Niantic/Mattercraft names to users.
8. EVADE: NO user-facing generative AI, and never run image-to-image / image-to-3D / generative tools (Meshy,
   Higgsfield...) on EVADE's own assets. Blender/three.js renders, compositing, cropping and code-drawn art are fine.
9. Only real products/real experiences. Don't invent features that don't exist (e.g. no fake leaderboards numbers).
10. Reduced motion: soften, never freeze. 11. No voice/talk UI (Bobo is a cat, and EVADE's audience dislikes AI).
12. Say plainly what was and wasn't tested on a real phone (everything here is simulator-only).

## Working together in this checkout
Two workers edit `/home/user/medialife/evade-hub` at once. Only edit your own folders (below). Do not run git
commands that change state (no commit/checkout/stash/reset); the orchestrator commits. Don't touch files outside
`evade-hub/` except where your section says so. `npm run typecheck:evade-hub` shows everyone's errors; fix only
yours. Use your own static-server port (world: 8771, shell: 8772). Rebuilding writes `public/evade/hub/` which both
of you serve; that's fine (rebuild before you screenshot). End by writing `evade-hub/docs/handoff/<your-name>.md`:
what you built, how to test, what's simulator-tested vs untested, open issues, findings worth adding to the immersive
skill. Save screenshots of every flow at phone size (390x844) to `/mnt/project-files/evade-hub/progress/<name>-*.png`.
