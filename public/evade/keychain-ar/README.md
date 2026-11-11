# EVADE keychain AR: Bobo's Pop-Out

`/evade/keychain-ar/` — point the camera at the EVADE acrylic keychain and Bobo and the Eclipse can
jump off their charms, land below the keychain and come alive. A swirling portal in the charm's colours
stays open on each charm where the character was (it covers the whole acrylic piece for the charms that
have a traced outline). The portal's soft halo is baked once at load (`bakeMask`), and its swirl noise
repeats exactly once round the circle, so there is no seam where the angle wraps.

Image tracking is the **open-source 8th Wall engine** (`@8thwall/engine` 0.1.0, MIT,
github.com/8thwall/8thwall), self-hosted in `vendor/xr/` (`xr.js` + the `xr-tracking.js` chunk; the
face and sky chunks are not shipped). No 8th Wall account, key or hosted platform. Rendering is plain
three.js through `XR8.Threejs.pipelineModule()`. World tracking (SLAM) is off: it is a separate
binary under a different licence and is not needed here.

## Files
- `index.html` — splash, in-camera HUD, photo sheet, error sheet.
- `main.js` — everything else (see the comment at the top for how the alignment works).
- `image-targets/` — written by `scripts/build-keychain-ar/build_targets.py`:
  Five targets are active: `kc-can`, `kc-can-back`, `kc-bobo`, `kc-bobo-l`, `kc-old`. `*_luminance.jpg` is what the engine tracks.
  - `kc-bobo`: the cat Bobo charm, cut from the product shot Dapo sent (2026-11-11,
    `scripts/build-keychain-ar/cut_product_charms.py`). That side's outline is the artwork's mirrored
    (tail on the right), so its charm frame is mirrored in `layout.json` (`"mirror": true`) and the 3D
    Bobo is mirrored with it.
  - `kc-bobo-l`: the cat charm's other side (the same print seen through the clear acrylic, so mirrored: tail
    on the left). Its frame is not mirrored, so the 3D Bobo has his tail on the left there. The cat's face is
    nearly symmetric, so either picture can briefly latch onto the other side; the side found first holds
    until it has been gone for 0.7 s (`catSide` in `main.js`).
  - `kc-can`: the front of the real Eclipse can charm, cut from Dapo's phone photo
    (`scripts/build-keychain-ar/cut_can_photo.py`: GrabCut for the print, then the acrylic's outer edge
    traced and smoothed; skin seen through the clear acrylic is softened so it gives no false detail).
  - `kc-can-back`: the can's QR side, from the product shot (mirrored frame, like `kc-bobo`).
  - `kc-can-art`: the flat can art, only with `?canart=1`.
  - `*-mask.png`: the portal mask of a target (its whole acrylic piece), in its picture frame grown 1.3x
    for the glow; the page swaps it in while that target drives the charm. Targets without one use the
    silhouette inside the model.
  - `kc-old`: the earlier design's Bobo charm (the blocky avatar with one arm up), cut from a phone
    photo. It has its own model (`/evade/keychain/ar/old-bobo.glb`, built from boxes in Blender by
    `scripts/build-keychain-ar/build_old_bobo.py` to match the print) and its own silhouette. In
    `main.js` it takes the Bobo slot (`B`) whenever its charm is the one in view; clip names match the
    cat's, so the same buttons drive it.
  - `kc-both`: the two cat-keychain charms hanging together. Only loaded with `?pair=1`.
  - `guide-both.png`, `how-can.jpg`: pictures for the camera guide and the instructions screen.
  - `layout.json`: per target, the picture's size and where the two charm frames sit in it (metres).
- `splash.jpg` — backdrop generated with Higgsfield from a text prompt only (no EVADE artwork was
  given to it); the real Bobo and can renders are composited on top.
- `target/` — test pictures to point a phone at when the real keychain is not to hand: 14 layouts with each
  charm on its own chain from one ring (spread, hanging, overlapping, tilted, far, sideways, dim, the Roblox
  Bobo set, all three together) plus the original picture. Tap one to show it full screen. Built by
  `scripts/build-keychain-ar/build_test_pictures.py`. The cat charm there is still the art (no photo of the
  real cat charm yet).
- Camera: the page leaves the engine's own camera start untouched unless a test profile is chosen in
  Tune > Camera test. If the camera never starts with a profile set, the page offers "Use the standard
  camera", which clears it. `?hd=0` also clears it. Camera start-up steps are in the test log (`camSteps`).

## How it lines up
The target picture is built from the two charm pictures (14 px per mm) at the keychain's rest layout,
taken from the 3D keychain model. `layout.json` gives the picture's size and centre in keychain space,
so each charm frame is a fixed offset from the tracked picture. The `Silhouette` quad inside each GLB
covers exactly its charm frame, and the model starts at (charm frame) x (Silhouette matrix)^-1, so the
model, the silhouette and the print coincide.

Everything (silhouettes, characters, pads, sparks) is a child of the tracked picture and is only drawn
while the target is tracked: when the target is lost, or no pose arrives for half a second, it all
hides (after a 0.25 s grace against flicker) and comes back in place when the target is found again.
The pose is followed without lag; only sub-millimetre jitter is smoothed.

Two corrections sit on top of that (`MODEL_FIT`, `FLAT` in `main.js`): the cat model is not centred on the
outline baked into its GLB, so it is moved and scaled to match the art (measured by rendering the model straight
on in its keychain pose; eyes, visor and collar line up afterwards), and while a character is still on its charm
it is pressed flat into the print (12% depth), so it lines up from any angle instead of standing proud of the
print and sliding off it in perspective. It fills out to full depth as it jumps.

## Where they rest (`restQ`, `spotOf` in `main.js`)
Once out, a character hovers just above its own print, facing the same way as the print (parallel to
the charm), so it stays in frame with the charm. Tune sliders: Hover (height above the print), Tilt
(0% parallel to the print, 100% upright on the ground), Distance (0% over its own print, 100% the
standing spot beside the charm, where Spacing applies). The Roblox Bobo lands 15% bigger than his print
(`LAND_SCALE`): at print size he read as too small.

## Which charm pops (`updateFrames` in `main.js`)
Each charm has its own state (idle, charging, flying, out) and runs only from its own picture, so one
charm never shows up for the other, one arriving or leaving never restarts the other, and a charm that
leaves the view comes back as it was. Replay starts both over.

A pop-out's steps belong to their character and only run while that charm is in view (`tween(..., owner)`),
so nothing plays out or makes a sound off screen; it carries on where it was when the charm comes back.
A charm only counts as held steady while its middle is well inside the picture, so the other charm on the
ring peeking in at the screen edge does not pop out of sight.

Watchdog: when nothing has been tracked for a while, the image targets can be handed to the engine again
(`XR8.XrController.configure`). Opt-in only (`?watchdog=1`, 8 s, at most every 15 s): restarting the search often made recognition worse on a real phone.
The Tune panel shows what is tracked and counts found / lost / rescans.

`?pair=1` is the combined version: `kc-both` is loaded too, and when both charms are steady they pop as
one sequence (can first, Bobo after the Can to Bobo time). The pair picture also locks onto a single
charm, so a charm still has to be confirmed by its own picture; the pair picture then places both, as
long as it agrees with the single pictures to within 8 mm on screen, or after 1.5 s when only it holds.

## iPhone close-up focus (`IOS_MACRO` in `main.js`)
iPhone Safari gives the plain wide camera by default, which cannot focus closer than about 20 cm, so the charm
blurred when the phone came close. On iPhone the page now asks for the multi-lens camera (Back Triple, then Back
Dual Wide) at up to 1920x1440, which switches to the close-focus lens by itself, with zoom set so the picture
matches the plain camera. If that camera gives no picture within 4 s, the page reloads once with the standard
camera for the rest of the visit. `?macro=0` turns it off; a Tune > Camera test profile overrides it. Android is
unchanged.

## Camera (`tuneCamera` in `main.js`)
The engine chooses its own camera constraints and tracks on a small greyscale copy of each frame. Added
from outside: an ideal 1920x1440 stream (falls back to the engine's own request), continuous focus and a
Zoom slider where the browser exposes them (Android Chrome), and drawing at up to 3x pixel density.
`?hd=0` turns all of that off. The Tune panel shows the stream the phone actually gave.

## The experience (UI round, 2026-11-11)
- **HUD**: EVADE and Activated by MEDIALIFE logos top left (with the fish and fizz meters under them),
  round icon buttons top right (photo, record, sound, replay), and an action dock at the bottom that
  shows only the actions for the characters out right now (Feed, Wave, Wag tail or Dance, Walk for Bobo;
  Bubbles and Spin for the can).
- **Feed Bobo**: a fish flies from the phone into his mouth; three fish make **Super Bobo** (he grows,
  spins, glows, cheers, then settles back). Tap Bobo to pet him (hearts and a purr).
- **Alive when idle**: random tail wags, chill and paw-raise moments, a nap with Zzz after 30 s of
  nothing, and his head turns to follow the phone. A soft shadow sits on the print under each character.
- **Photo and video**: photos and clips carry the two logos. Video uses the Cola Run recorder
  (`mattercraft/cola-run/CaptureCore.ts`, built to `/evade/cola-run-lab/assets/capture-core.js`), so a
  clip can be saved, shared or sent to the Where is Bobo? globe (Media Library, "Needs review").
  The record button shows as soon as the camera runs, so the pop-out itself can be filmed.
- **Where is Bobo? events**: `scan` on start, `sighting` when a character lands, `reward` on Super Bobo,
  and the capture event on a sent clip, all with source `keychain-ar`. `?nolog` sends nothing.
- **Tune**: hidden; `?tune` (or `?dev`) brings the button and panel back.

## URL switches
- `?tune` shows the Tune button and panel; `?nolog` sends no globe events.
- `?only=kc-both` (or any other target name) loads just that image target.
- `?debug` draws the target and charm frames and tints the silhouettes, and logs engine events.
- `?debug&nopop` only tracks: use it to check alignment on a real keychain.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the flat keychain picture): the
engine finds the targets, the frames land on the charms, the sequence runs to the end, photo and
buttons work. **Not yet tested on a phone or on the physical keychain**: acrylic glare, the real print
colours and how reliably the small can charm is picked up are unknown until then.
