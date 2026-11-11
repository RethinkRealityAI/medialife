# Keychain AR models (Bobo + Eclipse can)

`./build.sh` rebuilds `public/evade/keychain/ar/bobo-keychain.glb` and `eclipse-can.glb`.
Requirements: Python 3.13 with `pip install bpy==5.2.4 numpy pillow scipy scikit-image qrcode` (Blender as a
Python module), and Node for the `gltf-transform` pass. `PY=/path/to/python ./build.sh`.
`BOBO_OLD_RIG` points at the original `CatBobo_Anims.glb` (default: the project's Evade folder). Bobo is
built from that model, so the build needs it.

How it is made (no generative AI, no image-to-3D):
- **Bobo** (`build_tex.py`, `build_bobo.py`): the original Bobo model and rig (body, legs, head, ears, tail,
  visor), restyled to the keychain: the hoodie is removed, the head is enlarged, forms are smoothed, and every
  texture is repainted in flat keychain colours by a script (cream fur, orange stripes and paws, white bib,
  light-blue visor with white trim and lettering). The face is the keychain art's face painted onto the head
  (`public/evade/keychain/src/cat_art.png`); cheek tufts, collar, studs and bell are added; black
  inverted-hull outlines give the ink line. The keychain sitting pose is a pose on the original rig (hind
  legs folded, tail on a five-bone chain), so the original clips (walk etc.) run unchanged as `Classic*`.
- **Can** (`build_label.py`, `build_can.py`): a lathe of a measured 12 oz can profile; the label is drawn
  in vector from colours sampled off the keychain art (blue top, maroon bottom, bubbles, eclipse logo,
  hand-lettered ΣCLIPSE). The back carries the keychain's round SCAN TO ACTIVATE seal with a QR for
  `https://evade.medialife.ai`. Open pull tab, fizz bubbles.

The build also saves `.blend` files with packed textures in `$KC_WORK` (default `/tmp/keychain-ar`).
