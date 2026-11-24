# MEDIALIFE Spray

`/labs/medialife-spray/`: Spray Bobo's paint engine for **MEDIALIFE's own products only**. Your phone is the spray
can: point it at Sukeban on the MEDIALIFE tee, tap the can, spray, save, and the painting becomes a 3D die-cut
sticker on the shirt. Decals, photo / video (save and share only), Artwork, and the room modes (Hang, Stamp,
Graffiti, `?room=`) all work as on Spray Bobo.

Why it exists (Dapo, 2026-11-24): the Sukeban tee was a third piece inside Spray Bobo (EVADE). EVADE experiences
must carry EVADE merch only, so the tee moved here, and it is the home for more MEDIALIFE apparel (Syndicate,
Trainwreck...) later.

## How it is built
- No copy of the engine: `index.html` is Spray Bobo's page in MEDIALIFE dress (wordmark, blue and magenta, SPRAY
  can, Sukeban stencil on the splash) and loads `/evade/spray-bobo/main.js` after setting `window.SPRAY_BRAND`
  (see that README, "Brands"). `style.css` here only overrides colours.
- Pieces: `ML_PIECES` in `/evade/spray-bobo/main.js`. Targets in `targets/` (+ `layout.json`), stencil art in
  `art/`, built by `scripts/build-spray-bobo/build_sukeban.py`. Print assumed 12 in wide (unconfirmed).
- Kept apart from EVADE: own IndexedDB `medialife-spray`, `sendEnabled: false` on the recorder (nothing goes to
  the Where is Bobo? globe), no `/api/bobo/events`, no Spray Studio CMS, EVADE game decals hidden, own
  `licences/` page (linked from Options, never on the splash).
- Adding a MEDIALIFE piece: build its target + stencil like the tee, add it to `ML_PIECES` with `tdir` / `adir`
  pointing here. The engine tracks up to 10 pictures at once.

## Tested / not tested
Simulator (headless Chromium, fake camera of the tee picture, 2026-11-24): splash (iPhone 13, SE, desktop with the
open-on-phone QR), found in ~4 s, Got it, tap the can, spray, Save, sticker comes alive, Artwork card with the
MEDIALIFE logo, Graffiti room opens with MEDIALIFE colours. **Not yet tried on a real phone or a real tee.**
