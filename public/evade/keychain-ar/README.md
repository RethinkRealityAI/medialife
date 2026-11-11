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
  - `kc-both`: the Bobo cat charm and the can charm together as they hang on the keychain (no ring or
    chain). `*_luminance.jpg` is what the engine tracks, `*.jpg` is the same in colour.
  - `kc-bobo`, `kc-can`: each charm of the cat keychain on its own (the two charms are separate
    keychains on one ring, so people may have only one, or hold them apart).
  - `kc-old`, `kc-old-can`: the earlier design's two charms, cut from a phone photo of the real
    keychain (`scripts/build-keychain-ar/src/old-*.png`). No silhouettes on these.
  - `guide-both.png`: the two silhouettes together, for the camera guide.
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
Each charm has its own state (idle, charging, flying, out), so one charm arriving or leaving never
restarts the other, and a charm that leaves the view comes back as it was.

- A charm only counts as present once its own picture (`kc-bobo` / `kc-can`) has been seen. The pair
  picture locks onto a single charm too (half of it is enough), so alone it cannot say who is there.
- With both confirmed, `kc-both` places both charms, as long as it agrees with each charm's own picture
  to within 8 mm. Charms held apart disagree, and then each follows its own picture.
- Too far for the single pictures but `kc-both` holds for 1.5 s: taken as both charms.
- One charm's picture in view and the other's unseen for 1.5 s: the other charm has left.
- Both in view and steady: they pop together (can first). One in view: it pops alone; if the pair
  picture is tracked it waits up to 1.4 s for the other.
- The two designs' cans look alike. `kc-can` does not fire on the old can, but `kc-old-can` fires on the
  new one, so the old can only counts after 1.2 s without `kc-can` (at once next to the old Bobo), and
  `kc-both` is ignored for 5 s after an old-design charm.

## URL switches
- `?only=kc-both` (or any other target name) loads just that image target.
- `?debug` draws the target and charm frames and tints the silhouettes, and logs engine events.
- `?debug&nopop` only tracks: use it to check alignment on a real keychain.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the flat keychain picture): the
engine finds the targets, the frames land on the charms, the sequence runs to the end, photo and
buttons work. **Not yet tested on a phone or on the physical keychain**: acrylic glare, the real print
colours and how reliably the small can charm is picked up are unknown until then.
