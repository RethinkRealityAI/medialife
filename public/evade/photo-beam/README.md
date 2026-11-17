# EVADE AR: Photo Beam

`/evade/photo-beam/`: snap a selfie, point the phone at a charm on the EVADE keychain or at the Sukeban tee, lock on to
a glowing photo spot and beam it on. The photo becomes a few thousand pixels that stream down a beam of light and land on their own spot,
and a materialise sweep prints it on. It stays on that charm (this phone only) and re-materialises whenever the charm
is found again.
Dapo's brief: "users take a picture and have it beam and appear in a magical way on the assets we're tracking".

Base: Bobo X-Ray (`/evade/xray-bobo/`): engine, tracking rules (Spray Bobo PR #47, same numbers), camera handling
(iOS macro lens, kickVideo, 12 s watchdog, error sheet), recorder, sound, options, diag logs, desktop QR.

## The flow (round 2, Dapo 2026-11-16)
1. **Capture** (Start): our own `getUserMedia` stream, front camera (`facingMode: user`), not the AR engine. Mirrored
   preview, saved mirrored as seen (the visible cover crop of the video, capped at 1024 px). Face guide, big shutter
   bottom centre (right edge in landscape), Library (the file input) left, Switch right (exact facing first, then
   ideal; hidden with one camera, e.g. a desktop webcam), 3 s timer (remembered), flash, shutter sound. The raw
   `getUserMedia` is taken at the top of `main.js`, before the iPhone lens patch (that patch is for the AR camera).
   Camera denied / missing / busy: an error card with "Choose from library" and "Try again".
2. **Make it yours**: the editor in a neutral rounded shape (pan, zoom, style, sticker). The slot is not chosen here:
   the photo is cut to each slot's own shape (cover fit, same pan/zoom, style, sticker) when it is beamed.
   Retake goes back to the live camera; **Ready to beam** goes on.
3. **Hand-over**: every selfie track is stopped, the video emptied, then a pause (450 ms iOS, 150 ms elsewhere), and
   only then does the 8th Wall engine start on the rear camera (first time) or `XR8.resume()` (later; the resume is
   checked: live track, playing, `currentTime` advancing, play-kicked; otherwise the `restartCamera` path).
4. **Aim**: the photo waits in a card at the bottom centre; a flat two-layer ray runs from it to a reticle at the
   centre of the screen. Every slot on a tracked charm glows (flat cyan outline and pulsing fill). The centre ray is
   tested against the slot's mesh, with a box fallback (grown 20 % to acquire, 60 % to keep), 0.12 s steady to lock,
   0.35 s of misses to let go, and one-frame tracking drops are ignored, so it doesn't flicker. **Lock on**: ray,
   reticle, outline, fill and card turn EVADE yellow, the brackets close in around the slot, a buzz and a click,
   "BEAM READY · BOBO'S VISOR", and the bottom-centre **Beam** button lights up (it replaces the photo shutter while a
   photo waits; the shutter comes back after). Tapping a glowing spot also locks it (no aiming needed).
5. **Beam**: the locked slot takes the photo (replacing any it had), the beam runs as before, the card empties.
   **Beam again** (chip) aims the same photo at another charm; **New photo** (bottom left) pauses the engine
   (`XR8.pause()` releases the rear camera) and goes back to capture. With no photo waiting, tapping a slot opens
   capture too.
Reduced motion: no pulsing, instant lock, no bracket close-in, shorter beam (the materialise sweep stays).

## From the Bobo Booth (2026-11-17)
`?from=booth`: the booth (`/evade/bobo-booth/`) left a cropped photo in IndexedDB under `handoff` (`{ src: Blob, from,
look, at }`, ignored after 30 min, deleted once read). The splash shows it ("Beam your booth photo", Back to the booth);
Start skips capture and opens Make it yours with it; Retake there goes back to the booth; Options gains "Back to the
Bobo Booth". Everything after (aim, lock on, Beam, saved per charm) is unchanged.

## The Sukeban tee (round 3)
The tee is Spray Bobo's target `tee-sukeban` (loaded from `/evade/spray-bobo/targets/`, not copied; print 0.3048 x
0.4064 m), so the page tracks 9 pictures. It carries two slots, each its own piece (own photo, own IndexedDB key):
- **Sukeban's face** (`sukeface`, kind `face`, flat). The mask is her face skin (the largest pink skin blob round the
  face), filled across each row with her eyes, nose and mouth; the fringe above the eye line, the side hair, the
  earrings and both hands (the other skin blobs, grown over the red nails) are left out, so they sit on top of the selfie
  like the art; grown a little below the jaw so a chin joins. Shading is her skin's luminance only, at 0.45 strength.
  The capture guide has this slot's shape (aspect 1.21, set from slots.json as `--ga`) and her eye line (`--ge`, 25.6 %
  down); a photo taken through the guide is fitted so the guide's box lands on the slot (`faceFromGuide`), and the
  editor's **On Sukeban** preview shows the selfie inside her hair and fingers (pan and zoom there set the face fit
  only). Library photos start centred.
- **Sukeban's top** (`suketop`, kind `band`, bulge 12 %): the white tube top with the red lettering (white or red,
  strokes closed, holes filled), cut below the tattooed skin, with the pendant and chain left out (in front). Shading
  keeps the fold lines (the letters are in-painted out of it) at 1.6x strength so the folds show at Printed.
- Lock-on picks between the two by the centre ray (mesh first, then the nearest box); both glow; tapping either locks it.
- Styles for the drawing: **Ink** (her ink and two flat pinks from the tee, plus black lines where the photo has edges,
  Sobel) and **Match skin** (per-channel gains from the middle of the photo toward her skin, at 70 %). Pixel maths only.
- Her face is wider than a real one, so in her face the selfie is cut to a real-face oval (width : height 0.8 : 1,
  eyes 42 % down it on her eye line, its chin on her chin, reaching up under the fringe) with a soft edge of a few px;
  the rest of her face is her flat skin pink from the tee (Ink lines still draw over it). Match skin is on by default
  for her face. "On Sukeban" shows Match skin and **Face width** (Narrow / Normal / Wide = 0.72 / 0.8 / 0.9). The
  capture guide draws the same inner oval (Normal) inside the outer guide, so people frame their face to it.
- Masks for these two are 512 px with a one or two pixel soft edge (the shader takes the mask as alpha).

## The slots (measured, not drawn)
`scripts/build-photo-beam/build_slots.py` (PIL + numpy) segments each target picture in
`/evade/keychain-ar/image-targets/` and writes `slots/`: a mask and a shading map per picture, and `slots.json`
(per target picture, a list of slots: id, piece, bounding box, outline polygon, per-column / per-row geometry, a
3-colour palette, bulge, shading strength, for the face its eye line and skin colour; uv of that picture, y down).

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
- **Empty slot**: a soft pulsing flat cyan fill and rim ribbon; while aiming every slot glows, yellow when locked.

## The beam (`tickBeam`, ~2.2 s, `BT`)
Beam pressed -> beam grows from the card's spot, a little in front of the camera (three open cylinders:
white core, two flat see-through cyan sleeves) -> pixels (one `Points` draw, ~2-3k, each carrying its pixel's colour)
stream down in a loose spiral, centre first -> ring shockwave and sparkle burst on the first landing -> materialise
sweep (X-Ray's `makeBurn` bands: white-hot edge, cyan rim, one flat tint, then the photo) -> beam pulls in -> chime.
Sounds are synthesised (whoosh, shimmer, land, chime). If the charm is lost mid-beam everything hides and the clock
stops; it resumes when found. Reduced motion: shorter times, no spiral or sparkles, the sweep stays.

## Photos
- **Library**: `<input type=file accept="image/*">`, decoded with `createImageBitmap` (EXIF orientation, decoder-side
  resize for very large files, `<img>` fallback), capped at 1024 px. Afterwards the selfie stream is reopened if the
  picker killed it; in AR, `ensureCamera` checks the engine video (`play()`, then `XR8.pause()` + `XR8.resume()`).
  `XR8.stop()` + `XR8.run()` throws "No valid session manager" in this build.
- **Editor**: drag to pan, pinch / wheel to zoom; styles are pixel filters only (Photo, Screen print = 3 flat colours
  from the slot's palette after auto-levels, Halftone dots, Mono); optional sticker from Spray Bobo's decal library
  (the "wear" decals are left out: they are drawn for Bobo's face). No generative AI.
- Saved per piece in IndexedDB `photo-beam` / `kv` (key `bobo`, `can`, `old`): the source photo (JPEG) and the edit
  settings; the label is re-rendered on load. Remove: the chip, or Options.
- Nothing is uploaded. The recorder's "send to the globe" is off (`sendEnabled: false`): clips are save/share only.
  Events (`/api/bobo/events`, source `photo-beam`): scan, found, `custom` photo-beam-ready (style) and
  photo-beam-beamed (piece, style), share.

## Test hooks (`?test` -> `window.__pb`)
`state()` (mode, capture {open, live, facing, mirror, cams, video}, engine {started, paused, video}, aim {visible,
locked, ready, label}, beam, pieces, slots), `openCapture()`, `shoot()` (no timer), `flip()`, `retake()`,
`library(dataURL, params)`, `style(v)`, `ready()` (Ready to beam), `fire()` (Beam), `again()`, `lock(target)`,
`aimAt(x, y)` / `aimAt(null)` (move the aim point off the centre), `tap(x, y)`, `slotScreen(target)`, `remove`,
`ensureCamera`, `restartCamera`, `blind(on)`, `fake(name, pose)`. Phone logs: `/api/ar/kc-diag`, `page: 'photo-beam'`
(captures, snaps, picks, locks, resumes, restarts, beams, beamsDone, selfie {facing, mirror, cams, label}, capErr).

## Tested / not tested
Headless camera simulator (Chromium fake camera from a y4m, SwiftShader; the fake device is one camera that answers
any facing mode): Start -> capture live, mirrored -> shoot -> editor -> Ready to beam -> selfie tracks stopped ->
engine starts -> aim lock by the centre ray on the kc-bobo visor -> Beam -> photo on the visor; New photo -> engine
paused (rear track ended) -> selfie -> Ready -> resume verified (live, advancing) -> tap-lock on the kc-can label ->
Beam -> photo wraps the can. Switch (environment, unmirrored, and back), camera denied (error card), lost mid-beam
freezes and resumes, reduced motion at 360x740, 390x844, 844x390, desktop 1280x800 (single webcam, no Switch); no
console errors (SwiftShader's readback performance warnings aside). Round 1 checks (kc-can-back, kc-old, reload
re-materialise, paused/killed streams) still apply.
Round 3 (Sukeban tee, simulator, 390x844): the tee found; both slots glow; the centre ray locks her face, Beam, the
drawn test face sits under the fringe with her fingers and side hair on top; Beam again locks her top, Beam, a striped
test card wraps it with the pendant in front and the folds showing; both hold photos at once; keychain round trip
re-run; no console errors.
**Not yet on a real phone**: the tee at 40-60 cm (tracking range, ray steadiness), a real selfie through the guide,
iOS Safari front -> rear hand-over (the 450 ms gap; whether `XR8.resume()` gets the macro
lens back every time), Android Chrome switching, the picker suspending the selfie camera, real front/rear facing
reports and two-camera Switch, aiming steadiness by hand, haptics, HEIC, frame rate on mid phones, the look under real
light, the mirrored sides (`kc-bobo-l`, `kc-old-l`) on their own.
