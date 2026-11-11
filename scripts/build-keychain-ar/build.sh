#!/usr/bin/env bash
# Rebuild the keychain AR models (Bobo + Eclipse can). Needs Python 3.13 with
#   pip install bpy==5.2.4 numpy pillow scipy scikit-image qrcode
# and Node for the final gltf-transform pass. Set PY to that Python.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python3}
export KC_WORK=${KC_WORK:-/tmp/keychain-ar}
OUT=../../public/evade/keychain/ar
mkdir -p "$KC_WORK" "$OUT"
$PY build_silhouettes.py
$PY build_tex.py
$PY build_bobo.py -- "$KC_WORK/bobo.glb" "$KC_WORK/bobo-keychain.blend"
$PY build_label.py
$PY build_can.py -- "$KC_WORK/eclipse-can.glb" "$KC_WORK/eclipse-can.blend"
for n in bobo:bobo-keychain eclipse-can:eclipse-can; do
  src="$KC_WORK/${n%%:*}.glb"; dst="$OUT/${n##*:}.glb"
  npx -y @gltf-transform/cli@4 resample "$src" "$dst"
  npx -y @gltf-transform/cli@4 dedup "$dst" "$dst"
done
ls -la "$OUT"
