# EVADE keychain AR: Bobo's Pop-Out

`/evade/keychain-ar/` — point the camera at the EVADE acrylic keychain and Bobo and the Eclipse can
jump off their charms, land below the keychain and come alive. A black silhouette stays on each charm
where the character was.

Image tracking is the **open-source 8th Wall engine** (`@8thwall/engine` 0.1.0, MIT,
github.com/8thwall/8thwall), self-hosted in `vendor/xr/` (`xr.js` + the `xr-tracking.js` chunk; the
face and sky chunks are not shipped). No 8th Wall account, key or hosted platform. Rendering is plain
three.js through `XR8.Threejs.pipelineModule()`. World tracking (SLAM) is off: it is a separate
binary under a different licence and is not needed here.

## Files
- `index.html` — splash, in-camera HUD, photo sheet, error sheet.
- `main.js` — everything else (see the comment at the top for how the alignment works).
- `image-targets/` — written by `scripts/build-keychain-ar/build_targets.py`:
  - `kc-bobo`: the cat keychain's Bobo charm (flat art). `*_luminance.jpg` is what the engine tracks.
  - `kc-can`: the Eclipse can charm, cut from a phone photo of the real acrylic charm (clear edge and
    tab included, `scripts/build-keychain-ar/src/can-photo.png`). The can is the same on both keychain
    designs. `kc-can-art` is the flat art of the same charm, as a second picture of it.
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
- `target/` — a flat picture of the keychain to point a phone at when the real keychain is not to hand.

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

## Where they rest (`restQ`, `spotOf` in `main.js`)
Once out, a character hovers just above its own print, facing the same way as the print (parallel to
the charm), so it stays in frame with the charm. Tune sliders: Hover (height above the print), Tilt
(0% parallel to the print, 100% upright on the ground), Distance (0% over its own print, 100% the
standing spot beside the charm, where Spacing applies).

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

## Camera (`tuneCamera` in `main.js`)
The engine chooses its own camera constraints and tracks on a small greyscale copy of each frame. Added
from outside: an ideal 1920x1440 stream (falls back to the engine's own request), continuous focus and a
Zoom slider where the browser exposes them (Android Chrome), and drawing at up to 3x pixel density.
`?hd=0` turns all of that off. The Tune panel shows the stream the phone actually gave.

## URL switches
- `?only=kc-both` (or any other target name) loads just that image target.
- `?debug` draws the target and charm frames and tints the silhouettes, and logs engine events.
- `?debug&nopop` only tracks: use it to check alignment on a real keychain.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the flat keychain picture): the
engine finds the targets, the frames land on the charms, the sequence runs to the end, photo and
buttons work. **Not yet tested on a phone or on the physical keychain**: acrylic glare, the real print
colours and how reliably the small can charm is picked up are unknown until then.
