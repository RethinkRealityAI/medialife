# Fanatics Booth hat pipeline

**Round 2 (current, 2026-11-17):** one Meshy model per product, so every stitch, eyelet and patch is the product's own.
`meshy_image_to_3d` with `ai_model: meshy-7.1`, `texture_model: meshy-7`, `texture_resolution: 4k`, `enable_pbr: true`,
`geometry_resolution: 2k`, remesh to 50k triangles: 35 credits each, 210 for six (task ids in the project files
`fanatics/meshy/tasks-hq.json`). Then:

    python pack_hq.py <meshy model.glb> public/pitch/fanatics/booth/models/<id>.glb

`pack_hq.py` fills the space around the UV islands with each island's own colour, re-encodes base colour and normal
at 2048 px and metal/roughness at 1024 px as JPEG, drops the emission (Meshy wires the base colour into it, which
looks unlit), and rewrites the GLB by hand (no npm tools). About 3 to 4 MB a cap, 7 MB for the knit.

Meshy packs UV islands edge to edge, so mipmaps draw white "lint" lines along every seam: the page turns mipmaps
off for these textures (`hats.js`, `noMips`). A hat on a face is shown near full texture size, so it stays sharp.

**Round 1 (kept for reference):** three base models and recoloured textures (`texel_map.py`, `recolor.py`,
`specs.json`, `pack.py`). Cheaper (90 credits) but recolouring loses the stitching, and Meshy builds raised
embroidery into the mesh, so a big raised logo shows through any other texture.
