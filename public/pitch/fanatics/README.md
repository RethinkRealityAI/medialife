# Fanatics pitch demos (`/pitch/fanatics/`)

**Unlisted pitch demos for Fanatics. Not for public release.** The Philadelphia 76ers and NBA names and marks and
the Fanatics name belong to their owners and are used here only to show Fanatics the idea. They need a licence (or
Fanatics' own assets under a signed agreement) before any public use. Both pages carry `noindex`, `/pitch/*` gets
`X-Robots-Tag: noindex, nofollow, noarchive` (netlify.toml) and `Disallow: /pitch/` (robots.txt). Never link them
from the site, the nav or `/labs/`. The pages use the text "FANATICS" as a wordmark, never the Fanatics logo.

## Fanatics Merch Try-On (`booth/`)

Called "Fanatics Merch Try-On" everywhere a visitor sees it (Dapo 2026-11-17: it is not a full booth experience);
the folder stays `booth/` so earlier links keep working.

Face-tracked try-on (open-source 8th Wall face effects, forked from Bobo Booth): six 76ers caps and beanies, one Meshy 7
model each with PBR textures (see `scripts/build-fanatics/README.md`), loaded on demand (the worn hat first), two face
paints ("Game day" eye black, "Thirteen stars"), photo, hold-to-film video and a 4-shot strip, and a **Shop** button
that shows the hat you are wearing and opens the 76ers headwear page on Fanatics (demo link). Up to two faces. Nothing
leaves the phone: no events, no globe, clips are saved or shared by the visitor.

Splash: the real 3D hats turning on a flat display stand (a new one drops on every few seconds), faint sports line
silhouettes behind (no team marks), title, Start, Activated by MEDIALIFE.

In camera: a tips card like Bobo Booth's every time the camera opens (eyebrows, swipe, tap/hold; gone after 8 s or on
Got it). **Raise both eyebrows** for the next hat: both brows held 400 ms, re-arms only after they come down, 2.5 s
rest, never during a strip countdown or with a sheet open; switch in Options.

### How a hat fits (round 3)
The engine tracks the face only (no full-head mesh), so the rest of the head is modelled from the face:
- each crown is measured on its own band (width, front, back, bottom; brim left out) and scaled on its own axes to
  the reference head in `hats.js` FIT: deeper than wide (heads are), a little taller so hair can't poke over;
- the band's FRONT sits on the forehead skin, read every frame from the face mesh's midline (vertices 10, 151, 9),
  so the crown reaches as far back as the head; the back of the band drops toward the nape (tilt);
- each wearer's face width (vertices 234 to 454) against the reference 1.18 FU scales the hat and the skull
  (clamped 0.9 to 1.12, smoothed);
- the skull occluder (depth only) is an ellipsoid sized from the face and kept inside the crown; with the face-mesh
  occluder and a neck cylinder it hides what a real head would;
- the head pose gets adaptive (One Euro style) smoothing: still = steady, moving = no lag.

### Round 4: real-head sizes and Adjust fit
On Dapo's head the round 3 hats sat about 1.5 cm high and stopped short of the back, so FIT is now derived from
standard adult head sizes (about 195 mm long, 153 mm wide, 57 cm round; 1 FU is about 118 mm) plus hair, and the brim
keeps the width's scale so the longer crown doesn't stretch it.

**Options > Adjust fit** (or `?tune`) opens live sliders over the camera for the hat being worn: Width, Length,
Height, Up/down, Forward/back, Tilt back, and Hidden head (the occluder, all hats). Arrows change hat, Show head
paints the occluders, Reset hat goes back to the built-in fit, values stay on that phone (localStorage
`fanatics-booth-tune4`). **Copy values** copies `Fanatics fit {...}` to paste back; bake those numbers into
`TUNED` (per hat) or `FIT` (per style) in `hats.js`, then bump the storage key so old phone values don't linger.

`?test` exposes `window.__fb` (setWear, setYaw, brows, tune, measure, face, screen, photo, strip, shop).
`?occ=show` paints the occluders, `?yaw=0.9` turns the tracked head for side views, `?smooth=0` turns the pose
filter off.

## Sixers Spray (`spray/`)

On a computer (even a touchscreen laptop) it shows a QR to open it on a phone; any "unsupported device" error from
the engine lands on the same QR instead of a raw error.


World-tracked (8th Wall engine binary, SLAM), forked from Spray Bobo Street: **Hang** team art or stickers on a
wall or stand them on the floor, **Stamp** them on anything, **Graffiti** in 76ers colours with drips. Team art is
cropped from the real hats' logos (`spray/art/`); stickers are simple SVGs drawn for the demo (`spray/decals/`).
Options links to the Merch Try-On. No events, nothing sent.

`?test` exposes `window.__st` (same as Street); `?desktop` runs off a phone in the simulator.

## Tested

Headless Chromium with a fake camera only (2026-11-17):

- Merch Try-On: a stock portrait video; all six hats sit on the head (round 3 also checked front, side and 3/4 views
  of every hat against the face mesh and skull occluder), eyebrow raise changes the hat, tips card shows, face paint follows the face, splash and "Starting"
  show no white box, photo, strip and Shop sheet open.
- Spray: a noise-textured fake camera with faked motion sensors, a test wall 2 to 2.4 m ahead; poster hung, stamp
  placed, graffiti sprayed in team colours.

**Not tried on a phone yet.** Watch for: the hat's fit on side turns and on long or big hair (round 3), whether the eyebrow raise fires only when meant (tune with `?fit`), the beanie on long
hair, how the models (3 to 7 MB each, loaded one by one) load on mobile data, wall finding on plain walls (same as Street).
