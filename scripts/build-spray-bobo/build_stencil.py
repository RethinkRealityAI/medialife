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

# ---------------------------------------------------------------- the Eclipse can charm (kc-can, Dapo 2026-11-13)
# The tracked picture kc-can is a photo of the real charm (soft, dark acrylic rim), so the stencil is cut from
# the clean flat can art (kc-can-art.jpg) and placed onto the photo: first by the printed can's outline, then
# refined by matching the pictures themselves (normalised correlation; the moon, lettering and tab line up).
# The back picture (kc-can-back, the QR side) shows the same can body (lid, tab, lettering) with a different
# middle, so it is matched the same way without the middle; its offset from the front goes into
# can-outline.json ("sides") and the page moves the canvas by it when the back is in view.
#   art/can-mask.png, art/can-lines.png, art/can-outline.json (as above, plus "sides")
from scipy.optimize import minimize
TD = os.path.join(ROOT, 'public/evade/keychain-ar/image-targets')
art = cv2.imread(os.path.join(TD, 'kc-can-art.jpg'))

def fillbig(m, k):
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    ff = m.copy(); mm = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8); cv2.floodFill(ff, mm, (0, 0), 255); m = m | cv2.bitwise_not(ff)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); return (lab == big).astype(np.uint8) * 255

def sim(p):   # scale, rotation, tx, ty -> 2x3
    sc, r, tx, ty = p; c, sn = np.cos(r) * sc, np.sin(r) * sc; return np.float32([[c, -sn, tx], [sn, c, ty]])

hsv = cv2.cvtColor(art, cv2.COLOR_BGR2HSV); s_, v_ = hsv[..., 1] / 255., hsv[..., 2] / 255.
art_print = fillbig(cv2.morphologyEx((((s_ > 0.18) | (v_ < 0.55)).astype(np.uint8) * 255), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), 11)
art_g = cv2.cvtColor(art, cv2.COLOR_BGR2GRAY).astype(np.float32)

def fit(name, back):
    ph = cv2.imread(os.path.join(TD, name)); hs = cv2.cvtColor(ph, cv2.COLOR_BGR2HSV); s2, v2 = hs[..., 1] / 255., hs[..., 2] / 255.
    pm = (s2 > 0.25) if back else ((((v2 > 0.47) | (s2 > 0.3)) & ~((v2 > 0.8) & (s2 < 0.08))))
    pm = fillbig(cv2.morphologyEx(pm.astype(np.uint8) * 255, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))), 31)
    # 1) the printed can's outline (IoU), from the bounding boxes
    k = 0.25; pk = cv2.resize(pm, None, fx=k, fy=k) > 127; h, w = pk.shape
    xa, ya, wa, ha = cv2.boundingRect(art_print); xp, yp, wp, hp = cv2.boundingRect(pm); s0 = wp / wa
    p0 = np.array([s0, 0, xp - xa * s0, yp + hp - (ya + ha) * s0])
    def iou(p): X = cv2.warpAffine(art_print, sim(p) * k, (w, h)) > 127; return -(X & pk).sum() / max((X | pk).sum(), 1)
    p1 = minimize(iou, p0, method='Nelder-Mead', options={'maxiter': 800, 'initial_simplex': [p0, p0 * [1.03, 1, 1, 1], p0 + [0, 0.03, 0, 0], p0 + [0, 0, 10, 0], p0 + [0, 0, 0, 10]]}).x
    outline_iou = -iou(p1)
    # 2) the pictures themselves (normalised correlation inside the can; on the back, not the middle circle)
    k = 0.3; g2 = cv2.GaussianBlur(cv2.resize(cv2.cvtColor(ph, cv2.COLOR_BGR2GRAY), None, fx=k, fy=k), (0, 0), 1.5).astype(np.float32)
    sel = cv2.resize(pm, (g2.shape[1], g2.shape[0])) > 127; H0, W0 = sel.shape
    if back: yy, xx = np.mgrid[:H0, :W0]; sel &= ~((xx - W0 * 0.53) ** 2 + (yy - H0 * 0.565) ** 2 < (W0 * 0.2) ** 2)
    def ncc(p):
        wa_ = cv2.GaussianBlur(cv2.warpAffine(art_g, sim(p) * k, (W0, H0), borderValue=255), (0, 0), 1.5)
        a = wa_[sel] - wa_[sel].mean(); b = g2[sel] - g2[sel].mean(); return -(a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum())
    best = min((p1 * [ds, 1, 1, 1] + [0, 0, dx, dy] for ds in (0.94, 1, 1.06) for dx in (-30, 0, 30) for dy in (-30, 0, 30)), key=ncc)
    p2 = minimize(ncc, best, method='Nelder-Mead', options={'maxiter': 1500, 'initial_simplex': [best, best * [1.02, 1, 1, 1], best + [0, 0.02, 0, 0], best + [0, 0, 6, 0], best + [0, 0, 0, 6]]}).x
    print(name, 'outline IoU', round(outline_iou, 3), 'picture match', round(-ncc(p2), 3), p2.round(4), 'outline fit', p1.round(4))
    # the back's middle and tab are different drawings, which pull the picture match off; its can body (the
    # printed outline) is what gets painted, so the back uses the outline fit
    return sim(p1 if back else p2), ph.shape[1], ph.shape[0]

Mf, fw, fh = fit('kc-can.jpg', False)
Mb, bw, bh = fit('kc-can-back.jpg', True)
# the stencil, from the clean art, placed on the kc-can picture at the paint texture's size
toTex = np.float32([[W / fw, 0, 0], [0, H / fh, 0], [0, 0, 1]])
Mt = (toTex @ np.vstack([Mf, [0, 0, 1]]))[:2]
mask = cv2.warpAffine(cv2.erode(art_print, np.ones((3, 3), np.uint8)), Mt, (W, H), flags=cv2.INTER_LINEAR)
mask = cv2.GaussianBlur(mask, (3, 3), 0)
cv2.imwrite(os.path.join(OUT, 'can-mask.png'), np.dstack([np.full_like(mask, 255)] * 3 + [mask]))
local = cv2.GaussianBlur(art_g, (0, 0), 3)
dark = np.maximum(np.clip((local - art_g - 6) / 30, 0, 1), np.clip((0.3 - v_) / 0.15, 0, 1)) * (cv2.erode(art_print, np.ones((5, 5), np.uint8)) > 0)
a = cv2.warpAffine((np.clip(dark * 1.8, 0, 1) * 255).astype(np.uint8), Mt, (W, H), flags=cv2.INTER_LINEAR)
edge = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
lines = np.zeros((H, W, 4), np.uint8); lines[..., 0:3] = (24, 18, 30); lines[..., 3] = np.maximum(a, edge)
cv2.imwrite(os.path.join(OUT, 'can-lines.png'), lines)
cs, _ = cv2.findContours((mask > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = cv2.approxPolyDP(max(cs, key=cv2.contourArea), 1.2, True)[:, 0, :]
# the back: where a point of the front picture sits on the back picture, in metres from each picture's middle
# (x right, y up). Both pictures are 0.04485 m wide (layout.json).
WM = 0.04485
def f2m(x, y, pw, phh): return np.array([(x - pw / 2) * WM / pw, (phh / 2 - y) * WM / pw])
Tb = np.vstack([Mb, [0, 0, 1]]) @ np.linalg.inv(np.vstack([Mf, [0, 0, 1]]))     # front px -> back px
def front_m_to_back_m(q):
    x, y = q[0] * fw / WM + fw / 2, fh / 2 - q[1] * fw / WM
    X = Tb @ [x, y, 1]; return f2m(X[0], X[1], bw, bh)
o = front_m_to_back_m([0, 0]); ex = front_m_to_back_m([0.01, 0]) - o
sides = {'kc-can-back': {'x': round(float(o[0]), 6), 'y': round(float(o[1]), 6), 'rz': round(float(np.arctan2(ex[1], ex[0])), 5), 's': round(float(np.hypot(*ex) / 0.01), 5)}}
json.dump({'note': 'Spray Bobo can die-cut outline, uv of the kc-can picture (x right, y down); sides: where the canvas sits on the other pictures (metres from the middle, y up; rz radians; s scale)',
           'points': [[round(x / W, 5), round(y / H, 5)] for x, y in c], 'sides': sides}, open(os.path.join(OUT, 'can-outline.json'), 'w'))
ys, xs = np.nonzero(mask > 127)
print('can outline points', len(c), 'bbox (uv)', xs.min() / W, ys.min() / H, xs.max() / W, ys.max() / H, 'sides', sides)
