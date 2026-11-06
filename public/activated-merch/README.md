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

Blender 4.2, scripted (no generative or image-to-3D tools):
garment base meshes → object-space position/normal bakes → the shop's print photos
composited onto the baked UVs by 3D position → Principled BSDF with knit normal and sheen →
GLB. Keychains are contour-extruded acrylic plaques with the hardware from the EVADE
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
* NFC tag spots are set per product in `main.js` (`tag: { u, v, side, where }`) and are
  illustrative until confirmed.
* `?debug` exposes `window.__stage` for testing. No WebGL2 → the poster render is shown.
