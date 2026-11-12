# EVADE keychain AR: Bobo Off the Chain

The experience was called "Bobo's Pop-Out" until 2026-11-12; Dapo renamed it. The URL stays `/evade/keychain-ar/`.

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
- `splash3d.js` — where the splash keychain hangs; the keychain itself is the shared `/evade/keychain/dangle.js`
  (also meant for the EVADE hero).
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

## Which side of the charm (`pickSides` in `main.js`)
Cat Bobo (`kc-bobo` tail right, `kc-bobo-l` tail left) and Roblox Bobo (`kc-old`, `kc-old-l`) each have a
picture of both sides: the print and its mirror image, as it looks through the clear acrylic. Their faces are
nearly symmetric, so both pictures often lock onto the same charm (Dapo's phone log, 2026-11-11). The camera
image decides which side is really there: under each tracked picture's pose, the camera (160 px, blurred) is
correlated with that picture and with the picture mirrored about the character's own middle
(`image-targets/probe.json`, written by `build_targets.py`). A small lead picks the side before he pops; once
he is out it takes a clear lead to turn him. Side changes go into the phone test log (`e: 'side'`). On the
mirrored side the 3D character is drawn mirrored, with its lettering turned to read the right way round
(the cat's visor texture, Roblox Bobo's `CapText`), and the can turns round to show its QR face.

The QR on the product shot that `kc-can-back` is cut from is a stand-in (the real charm's QR encodes
something else), so it is painted over in the target picture. A phone photo of the real QR side, like the
one `kc-can` is cut from, would make that side much easier to find.

Test pictures (`/target/`): every picture has a Flip toggle (and Flip all) that shows the keychain turned
over: cat Bobo and Roblox Bobo mirrored, the can with its other face, the layout mirrored.

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

## The experience (UI round 2026-11-11, layout rounds 2026-11-12)
- **Look (2026-11-12, Dapo)**: EVADE's Cola Run family, in its own cut: dark slate, EVADE gold (#f6c344) for
  primary buttons and accents, Exo 2 black italic for display type, and a gold "BOBO" tab on a black,
  gold-rimmed "OFF THE CHAIN" plate (title, toast). Bobo-visor blue stays for the hint pill.
  **No gradients anywhere** (Dapo, 2026-11-12: the platform no longer uses them): flat slate splash
  (`--slate` #0f1519), flat black plate and toast, fizz bar flat can blue (`--fizz` #3f9be6), fish bar flat
  gold, flat basket, single-colour 3D glows (gold pad ring, white sparks), flat recorder sheet.
- **Splash** (`splash3d.js` + `/evade/keychain/dangle.js`): no backdrop art. The real keychain model
  (`/evade/keychain/evade-keychain.glb`) drops in on a cable that hangs from behind the EVADE logo: a
  near-rigid cable catches it, the set swings and twists about the clasp, and each charm swings on its
  own jump ring, driven by how the ring accelerates. As it lands it is flicked sideways as if someone just
  touched it (about 37° of swing, settling over ~10 s), and after a few calm seconds it gets a small nudge
  again, so it always reads as touchable. Drag or flick it to swing it, tap it to jiggle it. Then the
  title plate, an EVADE-gold Start, and Activated by MEDIALIFE at the bottom. The scene is disposed when
  the camera starts. Reduced motion: it just hangs.
- **HUD**: EVADE top left with a small "BOBO OFF THE CHAIN" plate under it (meters below), sound top right.
  A **menu** button sits above sound. Bottom row: **Replay animation** left, the **shutter** in the middle
  (with the photo/video pill above it), Activated by MEDIALIFE right. The
  action dock and the fish basket sit above the shutter, the hint pill above them. Landscape phones: the
  shutter moves to the right edge, middle; the dock sits bottom centre.
- **Shutter + mode pill**: a liquid glass pill above the shutter picks Photo or Video (minimal camera and
  video icons; only the chosen side is filled, by a sliding gold thumb). Photo: tap for a photo (white
  shutter). Video: the shutter turns red; tap to start, tap again to stop (a red ring fills towards the
  30 s limit and a timer replaces the pill while recording). The mode is remembered on the phone
  (`kc-ar-mode`). No recorder in the browser: no pill, photo only. Keyboard: arrows switch the mode, R
  starts or stops a video.
- **Menu (the way into Cola Run)**: the menu button (gold dot until first opened) opens a bottom sheet:
  a Cola Run card first (the Cola Run splash art and logo, "Play Cola Run" to evade.medialife.ai with
  utm_source=medialife, utm_medium=off-the-chain), then the Where is Bobo? globe and the EVADE keychain
  page. All open in a new tab so the AR keeps running. Cola Run is also earned in play: after Super Bobo,
  or an Eclipse overflow, a "Bobo's charged up. Play Cola Run" chip shows for 9 s (twice per visit at most)
  and opens the sheet.
- **Hint pill**: Bobo-visor blue (#8cc8f8) with navy text. While looking for the keychain it sits just
  under the silhouettes; once characters are out it sits above the dock.
- **Feed Bobo (fish basket)**: Feed opens a basket with a fish. Swipe the fish up toward Bobo: the
  sideways angle of the swipe picks where it lands in front of him. He turns, walks over, eats it and
  walks back to his spot. One that lands at his feet he just leans down for; a hard, straight swipe he
  catches in mid-air ("Nice catch!"). A slow but clear upward drag (over 60 px) still throws, gently, so
  every throw gets eaten. Three fish make **Super Bobo** (he grows, spins, glows, cheers, then settles
  back). The basket stays open through short tracking blips and closes when Bobo is gone. Tap Bobo to
  pet him (hearts and a purr).
- **Alive when idle**: random tail wags, chill and paw-raise moments, a nap with Zzz after 30 s of
  nothing, and his head turns to follow the phone. A soft shadow sits on the print under each character.
- **Photo and video**: photos and clips carry the two logos. Video uses the Cola Run recorder
  (`mattercraft/cola-run/CaptureCore.ts`, built to `/evade/cola-run-lab/assets/capture-core.js`), so a
  clip can be saved, shared or sent to the Where is Bobo? globe (Media Library, "Needs review").
  The shutter works as soon as the camera runs, so the pop-out itself can be filmed. The recorder's own
  button is hidden (`.crc-anchor`); the shutter drives it.
- **Where is Bobo? events**: `scan` on start, `sighting` when a character lands, `reward` on Super Bobo,
  and the capture event on a sent clip, all with source `keychain-ar`. `?nolog` sends nothing.
- **Tune**: hidden; `?tune` (or `?dev`) brings the button and panel back.

## URL switches
- `?tune` shows the Tune button and panel; `?nolog` sends no globe events or test logs.
- Test logs (`/api/ar/kc-diag`) are sent on previews and local dev only; on medialife.ai add `?diag`
  (they can still only be read back on a preview).
- `?only=kc-both` (or any other target name) loads just that image target.
- `?debug` draws the target and charm frames and tints the silhouettes, and logs engine events.
- `?debug&nopop` only tracks: use it to check alignment on a real keychain.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the flat keychain picture): the
engine finds the targets, the frames land on the charms, the sequence runs to the end, photo and
buttons work. **Not yet tested on a phone or on the physical keychain**: acrylic glare, the real print
colours and how reliably the small can charm is picked up are unknown until then.
