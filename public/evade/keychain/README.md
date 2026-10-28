# EVADE activated keychain — 3D model

`evade-keychain.glb` is a binary glTF of the redesigned EVADE acrylic keychain set. It matches the factory proof: two clear acrylic charms, 3 mm thick, with a double-sided UV print and polished edges, on a swivel lobster clasp.

- **Charm_Bobo**: 57.8 × 65.9 mm cat charm. The back shows the front art mirrored, the way it looks through clear acrylic.
- **Charm_Eclipse**: 31 × 57.5 mm can charm. The front has the can art. The back has the can art (readable) plus a round "SCAN TO ACTIVATE" label with a QR code for `https://evade.medialife.ai`. The QR decodes from a rendered view.
- **Hardware**: a swivel lobster clasp, a 25 mm split ring, jump rings, and a 3-link chain on the can. The metal is nickel PBR (metalness 1, roughness 0.24 to 0.34).

## Conventions
- Units are metres (1 mm = 0.001), Y is up, and the charms face +Z.
- The root node is `EVADE_Keychain`. Its origin is at the top of the clasp, and the set hangs down to about y = -0.141.
- Node structure:
  - `Hardware`, which contains:
    - `Clasp`
    - `Swivel`
    - `Swivel_Eye`
    - `Split_Ring`
    - `Jump_Ring_*`
    - `Chain_Link_1..3`
  - `Charm_Bobo` and `Charm_Eclipse`. Each one's origin is at the centre of its 3 mm hanging hole, so to swing a charm you rotate the node around Z (or X). Each has these children:
    - `*_Acrylic`: the front and back faces
    - `*_Edge`: the polished rim
    - `*_Print_Front` and `*_Print_Back`: art planes 0.12 mm inside each face, alpha MASK
- Charm nodes carry a small resting swing (Bobo -11°, Eclipse +9°) and sit a little apart in depth: Bobo is about 2 mm behind and Eclipse about 2 mm in front.

## Materials
- `Acrylic_Clear` uses `KHR_materials_transmission` and `ior` 1.49. It also sets baseColor alpha to 0.2 with BLEND, so viewers without transmission still show a clear, lightly glossy slab.
- `Acrylic_Polished_Edge` is a bright, glassy, semi-transparent clearcoat that stands in for the edge glow of real polished acrylic.
- The print materials are standard PBR with PNG textures (the largest is 1024 px).
- For true print colours, render with `THREE.NeutralToneMapping` (or AgX). ACES washes out the pastel art.

## How it was built (no generative AI)
Everything is procedural three.js geometry, exported with GLTFExporter. The only images are the supplied charm art in `src/` and a QR code drawn from the `qrcode` package's module matrix. No image-to-image or image-to-3D tools were used.

The die-cut silhouette is traced from the art's alpha channel, using Moore-neighbour tracing, then RDP simplification and Chaikin smoothing. The hole is an exact 3 mm circle taken from `src/meta.json`. The silhouette is then extruded to 3 mm with a 0.4 mm bevel.

To rebuild and check the model:

```
node scripts/build-evade-keychain/build.mjs          # writes evade-keychain.glb
node scripts/build-evade-keychain/verify.mjs <dir>   # renders review screenshots
```

The scripts need Playwright with Chromium, and they use three r180. If `node_modules/three` is missing, they fetch it once into a temporary directory.
