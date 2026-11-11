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
  - `kc-both`: the Bobo cat charm and the can charm together as they sit on the keychain (no ring or
    chain). `kc-both_luminance.jpg` is what the engine tracks, `kc-both.jpg` is the same in colour.
  - `kc-old`: the earlier keychain design (blocky Bobo with his arm up), cut from the product photo
    `public/merch/keychain-hand.webp`. Bobo charm only, see "Two designs" below.
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

One target means the can charm is assumed to hang in its rest position over Bobo. If it swings well
away, tracking gets weaker and the can silhouette will be off until it settles.

"Up" for the landed characters is read once, at the moment they pop (phone gravity when the browser
allows it, otherwise the top of the screen), and from then on they are fixed to the keychain.

## Two designs
Both keychain designs carry the same Eclipse can art, so any target with the can in it matches both
keychains. That is why `kc-old` is the old Bobo charm alone, and why `kc-both` will lock onto the old
keychain's can. `onTarget` lets `kc-old` win: whenever it is seen, and for 5 s after, `kc-both` is not
believed. The old design has no silhouettes (they are cut for the cat art); the characters pop out of
the charms and land below them. Its sizes are estimated from the photo, not from a production file.

## Bubbles
A tap on Bobo, the can, or anywhere else on the camera view blows bubbles; every tap in a row makes
more and bigger ones and fills the Fizz meter. The tenth tap is the "Eclipse overflow": the can spins
up on a geyser of bubbles, Bobo cheers, and the meter resets. The meter also resets after 6 s idle.

## URL switches
- `?only=kc-both` or `?only=kc-old` loads just that image target.
- `?debug` draws the target and charm frames and tints the silhouettes, and logs engine events.
- `?debug&nopop` only tracks: use it to check alignment on a real keychain.

## Tested / not tested
Tested headlessly in Chromium with a simulated camera (a video of the flat keychain picture): the
engine finds the targets, the frames land on the charms, the sequence runs to the end, photo and
buttons work. **Not yet tested on a phone or on the physical keychain**: acrylic glare, the real print
colours and how reliably the small can charm is picked up are unknown until then.
