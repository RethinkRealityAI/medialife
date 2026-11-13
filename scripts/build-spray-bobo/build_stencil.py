# Spray Bobo: the paintable canvas for the cat charm, cut from the kc-bobo image target itself
# (public/evade/keychain-ar/image-targets/kc-bobo.jpg), so the canvas lines up pixel for pixel with what
# the engine tracks. Scripted only (thresholds + morphology, OpenCV): no generative tools touch EVADE art.
#   art/cat-mask.png   white, opaque where the printed cat is (the stencil: paint only sticks inside it)
#   art/cat-lines.png  the print's ink lines on transparent (the colouring-book outline drawn over the paint)
#   art/cat-outline.json the cut line of the 3D die-cut sticker the finished painting becomes
# Run: python3 scripts/build-spray-bobo/build_stencil.py
import cv2, numpy as np, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'public/evade/keychain-ar/image-targets/kc-bobo.jpg')
OUT = os.path.join(ROOT, 'public/evade/spray-bobo/art')
W, H = 768, 1024                      # the paint texture size (the target picture is 1682x2244, same 3:4)

im = cv2.imread(SRC)
im = cv2.resize(im, (W, H), interpolation=cv2.INTER_AREA)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
s, v = hsv[..., 1].astype(np.float32) / 255, hsv[..., 2].astype(np.float32) / 255
ink = ((s > 0.22) | (v < 0.55)).astype(np.uint8) * 255
ink = cv2.morphologyEx(ink, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
# fill the inside (the white belly and muzzle are closed in by ink lines)
ff = ink.copy(); m = np.zeros((H + 2, W + 2), np.uint8); cv2.floodFill(ff, m, (0, 0), 255)
filled = ink | cv2.bitwise_not(ff)
# keep the cat: the biggest piece (drops the ring, glints on the acrylic)
n, lab, st, _ = cv2.connectedComponentsWithStats(filled)
big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); mask = (lab == big).astype(np.uint8) * 255
mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
mask = cv2.GaussianBlur(mask, (3, 3), 0)
cv2.imwrite(os.path.join(OUT, 'cat-mask.png'), np.dstack([np.full_like(mask, 255)] * 3 + [mask]))   # white, alpha = the cat
# ink lines: dark, low-ish value strokes inside the cat (the brown outline art)
g = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
local = cv2.GaussianBlur(g, (0, 0), 6)
dark = np.clip((local - g - 8) / 40, 0, 1) * np.clip((0.78 - v) / 0.3, 0, 1)
dark = np.maximum(dark, np.clip((0.42 - v) / 0.2, 0, 1))
dark *= (mask > 0)
a = (np.clip(dark * 1.9, 0, 1) * 255).astype(np.uint8)
lines = np.zeros((H, W, 4), np.uint8); lines[..., 0:3] = (24, 18, 30); lines[..., 3] = a
# the outline of the stencil itself, so the canvas edge reads even before any paint
edge = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
lines[..., 3] = np.maximum(lines[..., 3], edge)
cv2.imwrite(os.path.join(OUT, 'cat-lines.png'), lines)
# the outline for the 3D die-cut sticker the finished painting becomes (uv: x right, y down, 0..1)
cs, _ = cv2.findContours((mask > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cs, key=cv2.contourArea)
c = cv2.approxPolyDP(c, 1.2, True)[:, 0, :]
import json
json.dump({'note': 'Spray Bobo die-cut outline, uv of the kc-bobo picture (x right, y down)', 'points': [[round(x / W, 5), round(y / H, 5)] for x, y in c]},
          open(os.path.join(OUT, 'cat-outline.json'), 'w'))
print('outline points', len(c))
ys, xs = np.nonzero(mask > 127)
print('mask bbox (uv)', xs.min() / W, ys.min() / H, xs.max() / W, ys.max() / H, 'fill', (mask > 127).mean())
