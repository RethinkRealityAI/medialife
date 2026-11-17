# Agent notes for the medialife repo

medialife.ai (Vite + React site in `src/`, static experience pages in `public/`, Netlify functions). These rules
are for anyone (human or agent) adding or changing an AR / immersive experience page under `public/evade/`,
`public/labs/` or `public/pitch/`.

## Experience page rules (Dapo's house rules)

1. **Full branded splash screen, always.** Every experience opens on a proper splash: client logo or wordmark,
   hero art that previews the experience (3D, animated flat SVG/CSS, or the client's splash art), title, a
   one-line lead, the primary Start button (disabled "Loading…" until ready), a loading bar, and the
   "Activated by MEDIALIFE" badge. Copy the closest live splash (`public/evade/spray-bobo/`,
   `public/evade/bobo-hoops/`, `public/evade/bobo-booth/`, `public/evade/spray-bobo/street/`).
   Never ship a bare screen with only a Start button. "Just the Start button" (Dapo on Cola Run, 2026-11-17)
   meant no instructions overlay, dark band or licence text on top of the splash, not removing the splash.
   Before handing over, screenshot the splash at phone size (e.g. iPhone 13 and iPhone SE) and at desktop width.
2. **Computers get an "open on your phone" QR, never a raw engine error.** Decide "phone" by device:
   `/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)`.
   Do not use `pointer: coarse` / `maxTouchPoints > 0`: touchscreen laptops pass it and the 8th Wall engine
   binary then fails with "No valid session manager". Also route engine errors matching
   `/session manager|not supported|unsupported|device/i` (before the camera has video) to the QR sheet.
   `?desktop` skips the check for testing. Reference: `openOnPhone()` in `public/evade/spray-bobo/street/main.js`.
3. **No gradients anywhere.** Flat colours only (CSS, SVG, canvas, 3D glows).
4. **Shutter / record button bottom centre**, never overlapped (joystick games: bottom right beside the joystick).
5. **World tracking:** Move / reset placement always on screen once something is placed (bottom right, else
   bottom left), and moving keeps the object's state.
6. **Licences** (8th Wall engine binary / Niantic Spatial, three.js) go on a Licences link in the menu
   (`/evade/licences/`), never on the splash.
7. **EVADE:** no user-facing generative AI; no generative or image-to-3D tools on EVADE's own assets.
8. **Pitch demos** (`/pitch/*`): unlisted (noindex, robots Disallow), never linked from the site, nav or Labs;
   text wordmarks instead of client logos.
9. Add a card to `public/labs/index.html` when an experience ships. Previews first; Dapo approves production merges.

The full playbook (engines, pitfalls, patterns) is the "immersive" skill; its house rules mirror this list.
