# Activated Merch landing page (`public/activated-merch/`)

Static, no-build page at `/activated-merch/` (short link `/activated`). Plain ES modules,
three.js r180 from `/roblox/creators/vendor/three/` via an importmap.

| file | what |
| --- | --- |
| `index.html` | all copy and sections: hero, details, tech (pinned), how it works, fans, collections, stickers, EVADE case study, IP-holder CTA |
| `style.css` | the HUD look: pixel grid, bracket corners, Pixelify Sans + JetBrains Mono, MEDIALIFE cyan→magenta |
| `main.js` | product list (names/prices from shop.medialife.ai, USD; print side; NFC tag spot per piece), scroll choreography, pointer input, fan reel, collections |
| `scene.js` | the fixed WebGL stage: hero carousel, particle materialise intro, scan reveal, the dive to the NFC tag, exploded tag layers, phone tap |
| `softbody.js` | makes a GLB garment soft: skinned to ~150–230 spring nodes that always return to the rest pose; shape-matched rotations; shader patch for scan / cut-away / dither fade |
| `textures.js` | canvas-drawn cotton, round NFC tag, backing patch, backdrop strokes |
| `models/hero/` | apparel GLBs for the hero (2048 colour, 512 roughness, quantized) |
| `models/` | every product's GLB for the collection cards (1024 textures) |
| `posters/` | Cycles studio renders, used as model-viewer posters, switcher thumbnails and the no-WebGL fallback |
| `vendor/model-viewer.min.js` | Google model-viewer 4.4.0 (Apache-2.0), loaded only when the collection is near |
| `media/` | fan reaction clips (H.264, 480 wide) + poster frames, converted from the GIFs on /fan-reactions |
| `p/ar-stickers.webp` | sticker pack cutout for the sticker section |

## How the 3D assets were made

Garment base meshes: the tee, hoodie and long-sleeve from `/merch-shelf/models/`, which were
reconstructed with Meshy multi-view image-to-3D from blank front/back references derived from
MEDIALIFE's own lineup photos (2026-10-09, commit 27d4a60). Everything after that is scripted
Blender 4.2 with no generative tools: re-UV (no overlaps, 2.5× texel density on the print panels)
→ object-space position/normal and AO bakes → the shop's full-resolution print photos composited
onto the new UVs by 3D position → Principled BSDF with knit normal and sheen → GLB. The page
code makes them soft at runtime (`softbody.js`).

The two pullover hoodies (Sukeban, Trainwreck) use a higher-fidelity Meshy hoodie Dapo supplied
(2026-11-09, 1.3M faces): decimated to 40k faces, re-UV'd, and the full-detail folds, seams and
ribbing baked into a 2048 tangent-space normal map (material extra `bakedNormal`, so `softbody.js`
keeps the mesh UVs for it). Meshy's guessed back print is erased and the real print laid on, with the
print area's normal map flattened. Matte cotton: roughness 0.96 (print 0.86), no sheen, low specular.
The rest of the apparel (2026-11-09, same pipeline) comes from new Meshy multi-image jobs on the
shop photos: Syndicate tee, Trainwreck tee, Syndicate L/S and the Sukeban cardigan. Where Meshy
sculpted the artwork into the mesh as relief (L/S, cardigan, Trainwreck tee), it was re-run on
print-free copies of the photos, so the geometry is plain cloth and the prints are laid on flat.
The L/S takes its whole front and back (sleeve prints included) projected from the shop photos.
Tees are thickened 2x front-to-back (Meshy flat-lays are paper thin). The zip hoodie is the
pullover hoodie base with a painted zip, washed grey, since its only photo is the back.
Hero GLBs are meshopt-compressed (~0.4-1.7 MB); `scene.js` and `ar.js` set the meshopt decoder.
Collection-card copies are simplified to ~29k faces and only quantized (model-viewer has no local
meshopt decoder). Keychains are contour-extruded acrylic plaques with the hardware from the EVADE
keychain model; the sticker pack is a contour-extruded vinyl sheet. Posters are Cycles
renders of the same GLBs. `models/evade-charms.glb` is the EVADE keychain re-exported
(its original has NaN bounds in model-viewer) with transmission removed for broad support.

## Interaction model

* Hero: drag **on the piece** = spin it and pull the cloth; let go and it springs home.
  Drag **beside the piece**, flick, use ← → or the thumbnails = browse. Touch uses
  `touch-action: pan-y`, so vertical swipes still scroll the page.
* Scrolling adds a breeze that dies down; nothing stays in a deformed pose.
* `tech` scroll 0→1: dive to the tag spot (0–0.24), cut-away opens, layers lift out
  (0.26–0.52), phone taps (0.58–0.76), video plays.
* Each piece has a flat round NFC disc embedded in the design: usually behind the character's
  head in the print, sometimes under a front logo. Spots are set per product in `main.js`
  (`tag: { u, v, side, where }`, helpers `head()` and `LOGO`).
* Hero: the active piece is solid; the others stand off to the sides as holographic
  silhouettes (`uHolo` in `softbody.js`) and materialise with a scan line when browsed to.
* `?debug` exposes `window.__stage` for testing. No WebGL2 → the poster render is shown.
