# Keychain AR models (Bobo + Eclipse can)

`./build.sh` rebuilds `public/evade/keychain/ar/bobo-keychain.glb` and `eclipse-can.glb`.
Requirements: Python 3.13 with `pip install bpy==5.2.4 numpy pillow scipy scikit-image qrcode` (Blender as a
Python module), and Node for the `gltf-transform` pass. `PY=/path/to/python ./build.sh`.
`BOBO_OLD_RIG` points at the original `CatBobo_Anims.glb` (default: the project's Evade folder); the
new rig copies its bone names and orientations and carries its clips over as `Classic*`.

How it is made (no generative AI, no image-to-3D):
- **Bobo** (`build_tex.py`, `build_bobo.py`): built from Blender primitives and outlines traced from the
  keychain art (`public/evade/keychain/src/cat_art.png`): mochi head, cheek fluff and ears traced from the
  art's silhouette, flipped-up visor brim, collar and bell, pear body, column front legs, haunches, swept tail.
  It is modelled in the exact keychain pose and textured by projecting the keychain art from the front
  (face, BOBO visor, collar, bell, stripes); sides and back use a painted fur layer. Black inverted-hull
  outlines give the art's ink line. The rest pose is derived from the keychain pose so the original
  Bobo's quadruped clips (walk etc.) still work.
- **Can** (`build_label.py`, `build_can.py`): a lathe of a measured 12 oz can profile; the label is drawn
  in vector from colours sampled off the keychain art (blue top, maroon bottom, bubbles, eclipse logo,
  hand-lettered ΣCLIPSE). The back carries the keychain's round SCAN TO ACTIVATE seal with a QR for
  `https://evade.medialife.ai`. Open pull tab, fizz bubbles.

The build also saves `.blend` files with packed textures in `$KC_WORK` (default `/tmp/keychain-ar`).
