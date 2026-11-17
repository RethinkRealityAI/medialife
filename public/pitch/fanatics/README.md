# Fanatics pitch demos (`/pitch/fanatics/`)

**Unlisted pitch demos for Fanatics. Not for public release.** The Philadelphia 76ers and NBA names and marks and
the Fanatics name belong to their owners and are used here only to show Fanatics the idea. They need a licence (or
Fanatics' own assets under a signed agreement) before any public use. Both pages carry `noindex`, `/pitch/*` gets
`X-Robots-Tag: noindex, nofollow, noarchive` (netlify.toml) and `Disallow: /pitch/` (robots.txt). Never link them
from the site, the nav or `/labs/`. The pages use the text "FANATICS" as a wordmark, never the Fanatics logo.

## Fanatics Booth (`booth/`)

Face-tracked try-on (open-source 8th Wall face effects, forked from Bobo Booth): six 76ers caps and beanies on four
Meshy models (see `scripts/build-fanatics/README.md`), two face paints ("Game day" eye black, "Thirteen stars"),
photo, hold-to-film video and a 4-shot strip, and a **Shop** button that shows the hat you are wearing and opens the
76ers headwear page on Fanatics (demo link). Up to two faces. Nothing leaves the phone: no events, no globe, clips
are saved or shared by the visitor.

Fixed versus Bobo Booth: no white box while "Starting" (the hero canvas is hidden before its GL context is
released), no beep, no fizz or face tricks.

`?test` exposes `window.__fb` (setWear, face, screen, photo, strip, shop). `?fit=y,z,tilt,width` nudges every
hat's fit for phone tuning (FU, about 139 mm each).

## Sixers Spray (`spray/`)

World-tracked (8th Wall engine binary, SLAM), forked from Spray Bobo Street: **Hang** team art or stickers on a
wall or stand them on the floor, **Stamp** them on anything, **Graffiti** in 76ers colours with drips. Team art is
cropped from the real hats' logos (`spray/art/`); stickers are simple SVGs drawn for the demo (`spray/decals/`).
Options links to the Booth. No events, nothing sent.

`?test` exposes `window.__st` (same as Street); `?desktop` runs off a phone in the simulator.

## Tested

Headless Chromium with a fake camera only (2026-11-17):

- Booth: a stock portrait video; all six hats sit on the head, face paint follows the face, splash and "Starting"
  show no white box, photo, strip and Shop sheet open.
- Spray: a noise-textured fake camera with faked motion sensors, a test wall 2 to 2.4 m ahead; poster hung, stamp
  placed, graffiti sprayed in team colours.

**Not tried on a phone yet.** Watch for: hat size and height on real heads (tune with `?fit`), the beanie on long
hair, how the 2 MB beanie model loads on mobile data, wall finding on plain walls (same as Street).
