# Handoff: shell (app UI, splash, Arcade sheet, Selfie, Photo, capture)

Worker "shell", 2026-11-22. **Tested in the headless simulator only** (Chromium + SwiftShader, fake front camera from
a still face photo). Nothing here has been on a real phone yet.

## What was built

**EVADE look everywhere in my folders.** Flat colours only. Tokens in `src/shared/theme.css` (`--ev-*`; the old `--cb-*`
names stay but are remapped: `--cb-pink` is now EVADE yellow, so text on it must be ink). Fonts Exo 2 (italic display)
+ Space Grotesk. `index.html`: title "Bobo's Hideout · EVADE", theme-color `#0f1519`, Google Fonts, favicon `/favicon.svg`,
engine-binary script tag unchanged. No Happi / Japan Parade / Cheer Bear text left in my folders.

**Splash** (`hud/hud.ts`, `hud/hud.css`, `src/evade/brand/`): EVADE logo, 3D hero window (world's showcase hero via
`heroRect`) with yellow corner brackets, kicker "EVADE ◆ Bobo's Arcade", title "Bobo's **Hideout**" (cyan word), one-line
lead, yellow Start (disabled "Loading…" until ready, press shadow), cyan loading bar, Activated by MEDIALIFE badge, flat
rising pixels (`src/evade/brand/splash-fx.ts`). Desktop: two columns. Start on a computer opens 3D; camera modes show the
QR sheet (world's device check).

**Top bar + menu:** EVADE lockup pill + menu button; tabs 3D / AR / Selfie / Photo. Menu: Bobo's Arcade, How it works,
EVADE Labs (`/evade/labs/`), Start again, Back, Licences link (`/evade/licences/`, only here, never on the splash).

**Bobo's Arcade sheet** (`src/app/components/ArcadeSheet.tsx`, `arcade.css`, `src/app/controller.ts`): marquee header
with chasing bulbs and a live tally, Quick play (PlayDirector's games from `experience.playGames`, using their
`color`/`icon`), "The machines": every experience from `arcadeState()` in `src/evade/catalog.ts` (nothing hard-coded) as
cabinet cards (accent-coloured name, thumbnail screen, control panel, sub or unlock task, Needs chip, Locked / Soon
states), "Around the hideout" places, and a card view (big cabinet, chips, lock box "Locked. {task} to unlock it.", Play
→ `launch(item)`, a QR note on computers). Opens from: the Arcade button (`arcade {id:'', source:'button'}`), a cabinet
or walk-up (`{id, source}` opens that card), the menu (`window` event `evade:open-arcade`), the Q key, and
`/evade/hub/?arcade` (opens on start). Esc closes. A round in progress is held while the sheet is open.

**App shell lean-up** (`src/app/`): all Happi voice / talk / settings UI removed (Bobo is a cat: no voice UI).

**Selfie** (`modes/face/`): Bobo Booth's wearables ported to `wearables.ts` (from `public/evade/bobo-booth/wearables.js`,
built in code; gold less metallic because there is no env map; no keychain mini-Bobo or lens decal). `face-fx.ts`
gives four looks, the booth's own sets, in the existing segmented picker: **Full Bobo** (cat hat, Bobo shades, can +
hoop, septum), **Fizz** (BOBO visor, night shades, two Eclipse cans, star stud, game-day cheek stripes), **Gold**
(gold cat-eyes, hoops, nose hoop), **Be Bobo** (cat hat, bells, whiskers + pink nose). Every piece arrives/leaves with
the booth's animations; earrings swing (damped pendulum to gravity); face cues make them swing and the hat hop. The
booth's face paint is replaced by flat cheek decals. The engine face mesh is used as a depth occluder when its
`loading` event reaches the mode. The Happi selfie UI is kept: frame + filter chips, shutter bottom centre with 5 s
countdown (hold = video), Smile switch bottom left, **Bobo** toggle bottom right (shows/hides the borrowed Bobo,
bottom-left overlay), review sheet.

**Frames / filters / watermark** (`capture/frame-art.ts`, `style-strip.ts`): frames Hideout (slate border, cyan line,
yellow brackets, pixels), Arcade (marquee "BOBO'S ARCADE", colour bars), Bobo (render of the real model in the corner),
Clean; filters Natural, Gold, Eclipse, Mono. Saved photos/videos carry the EVADE lockup ("BOBO'S HIDEOUT") and the
Activated by MEDIALIFE badge. Review sheet restyled dark EVADE (`capture.css`). Happi-only extras removed from the UI
("Watch photo animation" no longer offered; `public/img/capture/frame-title.webp` Happi art deleted, it was unused).

**Photo** (`modes/photo/`): Bobo's frame board built in code (`src/evade/capture/frame-board.ts`, same opening as before
so the selfie fit is unchanged) and a life-size Bobo cutout (`src/evade/capture/cutout.ts`, art
`public/img/bobo/cutout.webp` = three.js render of `catbobo.glb` "Sit" with a die-cut edge and face hole, made by
`src/evade/capture/tools/render-bobo.cjs`; no generative tools). Selfie stage wears "Be Bobo". All copy is Bobo's.

Deleted (mine, unused): `src/happi/{faceArt,frame,hood,cutout,splash-fx}.ts`, the voice/talk components.

## How to test

```bash
cd /home/user/medialife && npm run typecheck:evade-hub && npm run build:evade-hub   # both pass (2026-11-22 03:00)
(cd public && python3 -m http.server 8772 &)
# a still face photo -> y4m (any stock test portrait; testing only, never marketing):
ffmpeg -loop 1 -i face.jpg -t 6 -vf "crop=960:1280:0:0,scale=540:720,pad=960:720:210:0,format=yuv420p" -r 15 face.y4m
FACE_Y4M=$PWD/face.y4m node evade-hub/docs/handoff/shell-sim.cjs phone|desktop|locked|selfie|photo
```
`locked` rewrites `/evade/arcade/games.json` to `testing:false` in the browser so the lock states show. Hooks:
`window.__cbx` (experience, `?test`), `window.__evApp` (app controller, `?test`).

## Simulator-tested (screenshots in /mnt/project-files/evade-hub/progress/shell-*.png)
- Splash phone 390x844 iPhone UA (loading + ready) and desktop 1280x800; after Start; menu; Arcade sheet; a card;
  locked list + locked card (3 locked with `testing:false`); desktop card with the QR note. No console errors.
- Selfie: face found, all four looks, frame + filter switch, countdown, review, saved photo
  (`shell-selfie-06-photo.jpg`: lockup + Activated by in the corners). Attachment points arrive; face occluder built.
- Photo: welcome chooser, selfie stage with Be Bobo + guide oval.

## Not tested
- Anything on a real phone (fit of the hat/shades/earrings on real heads, iOS Safari, performance).
- Photo after the selfie: flip to back camera, placing the frame / cutout, Bobo beside the frame, room photo. The frame
  board and cutout have **not been seen in AR**; check `CUT.def 2.1` and `BESIDE` (h 0.74, x 0.7) on a phone.
- Video recording (hold shutter), Share sheet, Smile-to-snap, reduced motion.
- Earrings use the booth's default lobe positions: the engine sends `leftEar`/`rightEar` but no lobe points, so on some
  heads the earrings may float a little off the ear (same as the booth).

## Open issues / for others
- Fixed since first report: world fixed Bobo's facing and the `loadExternalModes` race. The splash hero's top was
  blanked by an opaque `.sp-bottom` (a band as tall as that panel, at the top of the hero; seen in SwiftShader, may
  also happen on phones), so the top/bottom panels are now transparent and the hero's flat shadow (1600px) paints the
  slate. Re-shot `shell-phone-01-splash.png` / `shell-desktop-01-splash.png`: Bobo whole and facing out.
- world has set text on `--cb-pink` (now yellow) to ink in play.css / toss.css.
- **contracts change (agreed with world):** `src/shared/contracts.ts` `arcade` source gains `'button'` (id `''` = open
  the whole sheet); `PlayGameInfo` gains optional `color` and `icon`.
- `/evade/licences/` should list the hub (8th Wall engine binary / Niantic Spatial, three.js).
- The dormant Happi "Classic clip" code path in `modes/face/index.ts` and the reveal / behind-the-scenes players in
  `capture/reveal.ts` are unused by the hub (no clip ships); safe to delete in a cleanup.

## Skill findings (immersive)
- A still-face y4m works with the hub's one-session engine when the init script strips `facingMode`/`deviceId`; face
  found in ~5 s at 390x844 with `?test&desktop`.
- The hub's engine sends no `leftLobe`/`rightLobe` attachment points (it sends `leftEar`/`rightEar`), so earrings rely on
  measured defaults.
- Without `scene.environment`, metalness-1 gold reads near black; ~0.55 metalness plus a small emissive keeps it gold.
