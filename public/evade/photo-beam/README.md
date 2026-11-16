# EVADE AR: Photo Beam

`/evade/photo-beam/`: point the phone at a charm on the EVADE keychain, tap its glowing photo spot, snap or choose a
picture, and beam it on. The photo shrinks into a glowing card, a beam of light shoots from the phone to the charm,
the photo breaks into a few thousand pixels that stream down the beam and land on their own spot, and a materialise
sweep prints it on. It stays on that charm (this phone only) and re-materialises whenever the charm is found again.
Dapo's brief: "users take a picture and have it beam and appear in a magical way on the assets we're tracking".

Base: Bobo X-Ray (`/evade/xray-bobo/`): engine, tracking rules (Spray Bobo PR #47, same numbers), camera handling
(iOS macro lens, kickVideo, 12 s watchdog, error sheet), recorder, sound, options, diag logs, desktop QR.

## The slots (measured, not drawn)
`scripts/build-photo-beam/build_slots.py` (PIL + numpy) segments each target picture in
`/evade/keychain-ar/image-targets/` and writes `slots/`: a mask and a shading map per picture, and `slots.json`
(bounding box, outline polygon, per-column / per-row geometry, a 3-colour palette; uv of that picture, y down).

| Piece | Targets | Slot | How it was measured |
|---|---|---|---|
| Bobo | `kc-bobo`, `kc-bobo-l` | the blue visor band with BOBO | light/mid blue (HSV hue 132-168) in a box over the top third (the collar is the same blue, lower down, outside the box); largest blob; per-column top/bottom, smoothed |
| The can | `kc-can-back` | the can's body (label) | saturated print inside the clear acrylic; rows where the can is at >= 90 % of its full width, trimmed off the shoulder bead and the base |
| The can | `kc-can` | the same | a photo with dark brown acrylic round a grey print, so colour can't split them: the can's drawn outline (`/evade/spray-bobo/art/can-outline.json`, as X-Ray uses) rasterised, then the same full-width rows |
| Roblox Bobo | `kc-old`, `kc-old-l` | the blue cap | blue (hue 132-175, sat >= 40) in a box round the head (the light-blue shirt is below it) |

Each picture has its own slot in its own uv, so a photo reads the right way round on both sides of a charm (no
mirrored group as in X-Ray). Re-run the script after a target picture changes; `--overlay DIR` writes check images.

## How it is drawn
- **Visor / cap**: a grid over the band (per column, top to bottom) that bulges out of the print like fabric round a
  head (`BULGE` 9 % of its width at the middle). The photo covers the band's bounding box and the band's shape cuts it
  (no squashing at the narrow tips). Soft edge from the mask.
- **Can**: the front half of a cylinder whose silhouette is the drawn can (per row: centre and half width), standing
  `CAN_Z` (half its radius) proud of the print, so it reads as a label wrapped round a can. Drag across it to spin
  the label (texture offset, inertia). A stepped gloss band moves with the view angle.
- **Printed look**: the photo times the print's own luminance there (`*-shade.png`, median-filtered so letters and
  lines go, folds and shadows stay), strength from Options > Print look (Soft 0.35 / Printed 0.7 / Bold 1).
- **Empty slot**: a pulsing flat cyan fill and rim ribbon. Tap it (raycast, with a forgiving box fallback) or press
  Photo (left of the shutter).

## The beam (`tickBeam`, ~2.2 s, `BT`)
Card shrink (CSS, 0.38 s) -> beam grows from the card's spot, a little in front of the camera (three open cylinders:
white core, two flat see-through cyan sleeves) -> pixels (one `Points` draw, ~2-3k, each carrying its pixel's colour)
stream down in a loose spiral, centre first -> ring shockwave and sparkle burst on the first landing -> materialise
sweep (X-Ray's `makeBurn` bands: white-hot edge, cyan rim, one flat tint, then the photo) -> beam pulls in -> chime.
Sounds are synthesised (whoosh, shimmer, land, chime). If the charm is lost mid-beam everything hides and the clock
stops; it resumes when found. Reduced motion: shorter times, no spiral or sparkles, the sweep stays.

## Photos
- **Snap**: the engine's own rear-camera `<video>`, cropped through a viewfinder in the slot's aspect (same cover crop
  as the canvas), flash, freeze, editor.
- **Choose**: `<input type=file accept="image/*">`, decoded with `createImageBitmap` (EXIF orientation, decoder-side
  resize for very large files, `<img>` fallback), capped at 1024 px. Afterwards `ensureCamera` checks the engine video
  is advancing: `play()` first, then `XR8.pause()` + `XR8.resume()` (the engine re-opens the camera when the tracks
  have ended) and plays the new video. `XR8.stop()` + `XR8.run()` throws "No valid session manager" in this build.
- **Editor**: drag to pan, pinch / wheel to zoom; styles are pixel filters only (Photo, Screen print = 3 flat colours
  from the slot's palette after auto-levels, Halftone dots, Mono); optional sticker from Spray Bobo's decal library
  (the "wear" decals are left out: they are drawn for Bobo's face). No generative AI.
- Saved per piece in IndexedDB `photo-beam` / `kv` (key `bobo`, `can`, `old`): the source photo (JPEG) and the edit
  settings; the label is re-rendered on load. "Beam to others" copies it to the other charms as pending: it beams in
  the next time each is found. Remove: the chip, or Options.
- Nothing is uploaded. The recorder's "send to the globe" is off (`sendEnabled: false`): clips are save/share only.
  Events (`/api/bobo/events`, source `photo-beam`): scan, found, `custom` photo-beam-beamed (piece, style), share.

## Test hooks (`?test` -> `window.__pb`)
`state()`, `setPhoto(piece, dataURL, {style, sticker})` (runs "Beam it"), `beam(piece)`, `openEditor`, `openAdd`,
`startSnap` / `snap`, `remove`, `ensureCamera`, `restartCamera`, `slotScreen(target)`, `tap(x, y)`, `blind(on)`
(pretend every print is lost), `fake(name, pose)`. Phone logs: `/api/ar/kc-diag`, `page: 'photo-beam'` (beams,
beamsDone, snaps, picks, restarts, look, photos).

## Tested / not tested
Headless camera simulator only (Chromium fake camera, SwiftShader): kc-bobo, kc-can-back, kc-can and kc-old found; slot
outline; photo injected; beam to completion; photo sits on the visor and wraps the can; tap opens the sheet; Snap
grabs the camera frame; can spin; reload brings the photo back and re-materialises it; lost-mid-beam freezes and
resumes; paused and killed camera streams recover; 390x844, 360x740 and 844x390; no console errors.
**Not yet on a real phone**: the native picker suspending the camera (iOS Safari, Android Chrome), HEIC, frame rate
on mid phones, haptics, the look of the shading and gloss under real light, the mirrored sides (`kc-bobo-l`, `kc-old-l`) on their own.
