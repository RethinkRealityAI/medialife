# Activated Merch landing page (`public/activated-merch/`)

Static, no-build page at `/activated-merch/` (short link `/activated`). Plain ES modules,
three.js r180 from `/roblox/creators/vendor/three/` via an importmap.

| file | what |
| --- | --- |
| `index.html` | all copy and sections: hero, details, tech (pinned), how it works, fans, collections, stickers, EVADE case study, IP-holder CTA |
| `style.css` | the HUD look: pixel grid, bracket corners, Pixelify Sans + JetBrains Mono, MEDIALIFE cyan→magenta |
| `main.js` | product list (names/prices from shop.medialife.ai, USD), scroll choreography, fan reel, lineup, lightbox |
| `scene.js` | the fixed WebGL stage: hanging garment, exploded fabric layers, phone tapping the NFC inlay |
| `cloth.js` | the cloth simulation (Verlet: two sewn panels, loft, tethers to the hanger, per-triangle wind, pointer grab) |
| `textures.js` | canvas-drawn knit normal map, cotton, NFC inlay, woven label, backdrop strokes |
| `garments.json`, `g/` | per garment: silhouette grid + back/front textures (RGBA, alpha = silhouette) |
| `p/` | product cutouts for the collection cards |
| `media/` | fan reaction clips (H.264, 480 wide) + poster frames, converted from the GIFs on /fan-reactions |

Garments are generated from the shop's flat-lay photos: the white background is
flood-filled away, the silhouette becomes the cloth grid, and the photo is the
back panel texture. The front panel uses the front photo when there is a clean one
(Sukeban hoodie) or a fabric fill with the chest logo. The EVADE charm image is the
existing `/merch/keychain-cutout.webp`; no generative tools were used on any asset.

Scroll positions: `hero` = 0→1 from the top to the details section, `tech` = 0→1
across the pinned tech section. The canvas fades out after the tech section and
stops rendering. No WebGL2 → the product photo is shown instead.
