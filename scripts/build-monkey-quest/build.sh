#!/usr/bin/env bash
# Rebuild the Monkey Quest Hub assets from Dapo's pin photo (the pin on its Monkey Quest card).
# Needs Python 3.13 with: pip install bpy==5.2.4 numpy pillow scipy opencv-python-headless shapely
# and Node (gltf-transform). PIN_PHOTO = the original photo (3000x4000). Set PY to that Python.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python3}
W=/tmp/mq; mkdir -p $W
OUT=../../public/monkey-quest/hub
$PY -c "import cv2,sys; im=cv2.imread(sys.argv[1]); cv2.imwrite('$W/crop.png', im[1540:3880,520:2480]); cv2.imwrite('$W/logo_crop.png', im[700:1720,360:2340])" "${PIN_PHOTO:?set PIN_PHOTO}"
$PY segment.py          # enamel colours -> m_red/m_peach/m_pink.png
$PY pin_masks.py        # silhouette, metal lines, eyes -> pin_shapes.json (mm, pin assumed 50 mm tall)
$PY seg_logo3.py        # logo layers from the card art -> logo_shapes.json
$PY cut_pin.py          # the pin cut out of the card -> pin_cutout.png
$PY build_art.py        # page art: silhouette, line guide, cut-out photo
$PY /mnt/project-files/skills/immersive/snippets/build_target.py $W/pin_cutout.png mq-pin $OUT/targets /monkey-quest/hub/targets/ --bg '#7a8ca0' --print-height-mm 50
$PY build_pin.py -- $W/pin.glb $W/pin.blend
$PY build_logo.py -- $W/logo.glb $W/logo.blend
for n in pin logo; do
  npx -y @gltf-transform/cli@4 weld $W/$n.glb $W/${n}_w.glb
  npx -y @gltf-transform/cli@4 quantize --quantize-normal 16 --quantize-texcoord 14 $W/${n}_w.glb $W/${n}_q.glb   # 10-bit normals band the enamel
  npx -y @gltf-transform/cli@4 dedup $W/${n}_q.glb $OUT/models/$n.glb
done
ls -la $OUT/models
