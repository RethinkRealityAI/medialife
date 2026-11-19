# Spray Bobo: the Sukeban tee as a paintable piece (Dapo, 2026-11-13).
#
# The tee's print is the Sukeban character on a teal panel. The engine tracks the WHOLE print (teal included:
# more of the picture to hold on to), and only the character becomes the canvas.
#
# Sources (scripted only: thresholds, morphology, a least-squares placement; no generative tools):
#   src/sukeban-tee.png                       Dapo's picture of the printed tee (306x418, soft, the truth for framing)
#   public/work/sukeban-sticker-large.webp    the clean, cut-out character art (1600x2139, transparent)
# The clean art is placed on the tee picture by matching the two (normalised correlation; scale + offset), so the
# tracked picture is sharp and lines up with the real print. The tee picture is a little taller than 3:4, so a
# sliver comes off the bottom (the engine's pictures are 3:4).
#
# Outputs:
#   public/evade/spray-bobo/targets/tee-sukeban.json + _luminance.jpg + _thumbnail.jpg + .jpg   (image target,
#       same format as @8thwall/image-target-cli), targets/layout.json (its size in metres)
#   public/evade/spray-bobo/art/sukeban-mask.png / -lines.png / -outline.json   (stencil, ink lines, die-cut line)
# Run: python3 scripts/build-spray-bobo/build_sukeban.py
import os, json, time
import numpy as np, cv2
from PIL import Image, ImageFilter
from scipy.optimize import minimize

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
TEE = os.path.join(HERE, 'src', 'sukeban-tee.png')
ART = os.path.join(ROOT, 'public/work/sukeban-sticker-large.webp')
TOUT = os.path.join(ROOT, 'public/evade/spray-bobo/targets/')
AOUT = os.path.join(ROOT, 'public/evade/spray-bobo/art/')
URL = '/evade/spray-bobo/targets/'
NAME = 'tee-sukeban'
# The print's real size. A standard 12 x 16 in front print is assumed (only the "cm" readout and the
# "come closer" distance use it; tracking and painting are the same at any size). Change here if it differs.
WIDTH_M = 0.3048
os.makedirs(TOUT, exist_ok=True)

tee = Image.open(TEE).convert('RGB'); UW, UH = tee.size
ta = np.asarray(tee).astype(float)
teal = np.median(ta[2:12, 60:250].reshape(-1, 3), 0)
art = Image.open(ART).convert('RGBA')

# ---- 1) place the art on the tee picture: (art width as a share of the picture's width, its top-left in fractions)
small = art.resize((art.width // 4, art.height // 4), Image.LANCZOS)
def render(p, W, H, src, bg=teal):
    s, x, y = p
    out = Image.new('RGBA', (W, H), tuple(int(v) for v in bg) + (255,))
    w = max(8, int(round(s * W))); h = int(round(w * src.height / src.width))
    out.alpha_composite(src.resize((w, h), Image.LANCZOS), (int(round(x * W)), int(round(y * H))))
    return out.convert('RGB')
tg = np.asarray(tee.convert('L')).astype(float)
def cost(p):
    r = np.asarray(render(p, UW, UH, small).convert('L')).astype(float)
    a, b = r - r.mean(), tg - tg.mean()
    return -(a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum())
best = min(((s, x, y) for s in np.arange(0.9, 1.3, 0.04) for x in np.arange(-0.15, 0.08, 0.03) for y in np.arange(-0.2, 0.08, 0.03)), key=cost)
fit = minimize(cost, best, method='Nelder-Mead', options=dict(xatol=1e-4, fatol=1e-5)).x
print('placement', fit.round(5), 'match', round(-cost(fit), 3))

# ---- 2) the tracked picture: 1200x1600 (3:4), the top of the tee picture's framing, flat teal + the clean art
FW, FH = 1200, 1600
s, x, y = fit
UHs = FW * UH / UW                     # the tee picture's height at this width (a little over 1600)
frame = Image.new('RGBA', (FW, FH), tuple(int(v) for v in teal) + (255,))
aw = int(round(s * FW)); ah = int(round(aw * art.height / art.width))
art_big = art.resize((aw, ah), Image.LANCZOS)
ax, ay = int(round(x * FW)), int(round(y * UHs))
frame.alpha_composite(art_big, (ax, ay))
pic = frame.convert('RGB')
pic.save(TOUT + f'{NAME}.jpg', quality=90)
lum = pic.resize((480, 640), Image.LANCZOS).convert('L').filter(ImageFilter.UnsharpMask(radius=2, percent=80, threshold=2))
lum.save(TOUT + f'{NAME}_luminance.jpg', quality=95)
pic.resize((263, 350), Image.LANCZOS).save(TOUT + f'{NAME}_thumbnail.jpg', quality=85)
now = int(time.time() * 1000)
json.dump(dict(imagePath=URL + f'{NAME}_luminance.jpg', metadata=None, name=NAME, type='PLANAR',
               properties=dict(left=0, top=0, width=FW, height=FH, isRotated=False, originalWidth=FW, originalHeight=FH),
               resources=dict(luminanceImage=f'{NAME}_luminance.jpg', thumbnailImage=f'{NAME}_thumbnail.jpg'),
               created=now, updated=now), open(TOUT + f'{NAME}.json', 'w'), indent=2)
json.dump({'note': 'Spray Bobo image targets (build_sukeban.py). widthM/heightM: the print in metres.',
           'targets': {NAME: dict(widthM=WIDTH_M, heightM=WIDTH_M * FH / FW)}}, open(TOUT + 'layout.json', 'w'), indent=2)

# ---- 3) the canvas: the character only (the art's own cut-out), at the paint texture's size
W, H = 768, 1024
alpha = np.zeros((FH, FW), np.uint8)
A = np.asarray(art_big)[..., 3]
x0, y0 = max(ax, 0), max(ay, 0); x1, y1 = min(ax + aw, FW), min(ay + ah, FH)
alpha[y0:y1, x0:x1] = A[y0 - ay:y1 - ay, x0 - ax:x1 - ax]
alpha = cv2.resize(alpha, (W, H), interpolation=cv2.INTER_AREA)
m = (alpha > 110).astype(np.uint8) * 255
# one smooth shape: close the gaps between hair strands and fingers, fill the holes, keep the biggest piece
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
ff = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0); mm = np.zeros((H + 4, W + 4), np.uint8)
cv2.floodFill(ff, mm, (0, 0), 255); m = m | cv2.bitwise_not(ff[1:-1, 1:-1])
n, lab, st, _ = cv2.connectedComponentsWithStats(m); m = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
m = (cv2.GaussianBlur(m, (0, 0), 2.2) > 127).astype(np.uint8) * 255      # rounds off the tiny jags
mask = cv2.GaussianBlur(m, (3, 3), 0)
cv2.imwrite(AOUT + 'sukeban-mask.png', np.dstack([np.full_like(mask, 255)] * 3 + [mask]))

# ink lines: the art's linework, thin strokes plus the edges of the big black areas (hair, jacket). The insides
# of those areas are left open, so they can be painted too (Lines off shows the print under the paint anyway).
col = np.asarray(art_big.convert('RGB'))
full = np.zeros((FH, FW, 3), np.uint8); full[:] = 255
sub = col[y0 - ay:y1 - ay, x0 - ax:x1 - ax]; a_ = A[y0 - ay:y1 - ay, x0 - ax:x1 - ax, None] / 255.
full[y0:y1, x0:x1] = (sub * a_ + 255 * (1 - a_)).astype(np.uint8)
g = cv2.cvtColor(cv2.resize(full, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY).astype(np.float32)
local = cv2.GaussianBlur(g, (0, 0), 3.5)
dark = np.clip((local - g - 4) / 26, 0, 1)                      # darker than around it: lines, hatching, edges of blacks
blackfill = cv2.erode((g < 70).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
edgeblk = ((g < 90).astype(np.uint8) - blackfill).clip(0, 1)    # a rim round each black area
ink = np.maximum(dark, edgeblk * 0.95) * (mask > 0)
a = (np.clip(ink * 1.6, 0, 1) * 255).astype(np.uint8)
edge = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
lines = np.zeros((H, W, 4), np.uint8); lines[..., 0:3] = (24, 18, 30); lines[..., 3] = np.maximum(a, edge)
cv2.imwrite(AOUT + 'sukeban-lines.png', lines)

# the die-cut line of the 3D sticker the finished painting becomes
cs, _ = cv2.findContours((mask > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 1.6, True)[:, 0, :]
json.dump({'note': 'Spray Bobo Sukeban die-cut outline, uv of the tee-sukeban picture (x right, y down)',
           'points': [[round(px / W, 5), round(py / H, 5)] for px, py in c]}, open(AOUT + 'sukeban-outline.json', 'w'))
ys, xs = np.nonzero(mask > 127)
print('outline points', len(c), 'mask bbox', (xs.min() / W, ys.min() / H, xs.max() / W, ys.max() / H), 'fill', round((mask > 127).mean(), 3))
