# Fanatics Booth hat pipeline

Builds the hats for `/pitch/fanatics/booth/` from four Meshy image-to-3D models (latest, textured, remeshed to
20k triangles, 30 credits each; task ids in the project files `fanatics/meshy/tasks.json`):

| Model | Made from | Products on it |
|---|---|---|
| `flat.glb` | blue 76 59FIFTY photo | blue 76 (own texture), black 76 + Sixers black/red (recoloured textures) |
| `curved.glb` | red Sixers script photo | Sixers red script (own texture) |
| `ball.glb` | blue/red ball A-frame photo | the A-frame (own texture) |
| `beanie.glb` | grey striped pom knit photo | the knit (own texture) |

The A-frame has its own model because Meshy builds embroidery as raised geometry: on the curved model the Sixers
script stands out of the front panel, so any other logo textured onto it shows the script through it. Smoothing
the relief away tore the UV mapping, so a 4th model (30 credits) was the clean fix. Recolouring works on the flat
model because its 76 is low.

Steps (Python 3 with numpy, scipy, Pillow):

1. `python texel_map.py flat.glb /tmp/flat.npz 1024`: rasterises the UV layout to a 3D position and normal per
   texel.
2. `python recolor.py` with `specs.json`: per variant, classifies crown / brim / underbrim / button / inside from
   the texel positions, finds the old logo by colour distance, fills it, recolours with the original shading, and
   projects the new logo crop (`src/`) onto the front panel. Writes `t_<variant>.jpg`.
3. `python pack.py <meshy dir> public/pitch/fanatics/booth/models <tmp>`: 1024 px JPEG textures embedded, GLBs
   rewritten by hand (no gltf-transform needed), variant textures to `models/tex/`.

Paths in `specs.json` point at a scratch folder; edit them for your machine.
