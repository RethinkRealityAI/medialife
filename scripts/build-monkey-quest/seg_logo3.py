import cv2, numpy as np
c = cv2.imread('/tmp/mq/logo_crop.png'); c = cv2.bilateralFilter(c, 7, 30, 7)
lab = cv2.cvtColor(c, cv2.COLOR_BGR2LAB).astype(np.float32)
L, A, B = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
H, W = L.shape
def rect(x0, y0, x1, y1):
    m = np.zeros((H, W), bool); m[y0:y1, x0:x1] = True; return m
def clean(m, o=3, cl=3, minA=150, keep_largest=0):
    m = m.astype(np.uint8) * 255
    if o: m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (o, o)))
    if cl: m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (cl, cl)))
    n, lb, st, _ = cv2.connectedComponentsWithStats(m)
    k = np.zeros_like(m)
    order = sorted(range(1, n), key=lambda j: -st[j, cv2.CC_STAT_AREA])
    if keep_largest: order = order[:keep_largest]
    for j in order:
        if st[j, cv2.CC_STAT_AREA] > minA: k[lb == j] = 255
    return k
def smooth(m, s=2.0):
    return ((cv2.GaussianBlur(m.astype(np.float32), (0, 0), s) > 127) * 255).astype(np.uint8)
blue = B < -8
monkey = smooth(clean((A > 32) & (L > 21) & rect(40, 372, 1620, 620), 5, 5, 600))
quest = smooth(clean((L > 55) & (B > 25) & rect(520, 600, 1740, 900), 5, 5, 600))
hyper = smooth(clean((L > 50) & (B > 25) & rect(120, 170, 800, 320), 0, 3, 60), 1.2)
faces = (monkey > 0) | (quest > 0) | (hyper > 0)
pin = rect(0, 880, 960, H)
dark = (L < 30) & ~blue & (A < 22)
brush = clean(dark & ~pin, 7, 9, 5000)
plate = cv2.dilate(faces.astype(np.uint8) * 255, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
plate = clean((plate > 0) | (brush > 0), 0, 15, 5000, keep_largest=1)
plate = smooth(plate, 3)
ring = smooth(clean((A > 14) & (L > 10) & (L < 36) & ~blue & ~rect(0, 300, 1640, 640) & ~rect(500, 600, 1760, 900) & ~pin, 7, 15, 20000, keep_largest=1), 3)
for k, v in dict(monkey=monkey, quest=quest, hyper=hyper, plate=plate, ring=ring).items(): cv2.imwrite(f'/tmp/mq/lg3_{k}.png', v)
vis = np.full_like(c, 255)
vis[ring > 0] = (40, 30, 120); vis[plate > 0] = (20, 20, 20); vis[monkey > 0] = (60, 40, 230); vis[quest > 0] = (40, 200, 250); vis[hyper > 0] = (90, 230, 250)
cv2.imwrite('/tmp/mq/logo_seg4.png', cv2.resize(vis, None, fx=0.5, fy=0.5))
def fill_holes(x):
    ff = cv2.copyMakeBorder(x, 2, 2, 2, 2, cv2.BORDER_CONSTANT, value=0)
    mask = np.zeros((H + 6, W + 6), np.uint8); cv2.floodFill(ff, mask, (0, 0), 255)
    return x | cv2.bitwise_not(ff[2:-2, 2:-2])
plate = smooth(fill_holes(plate), 3)
# ring: fit a circle to the visible arc, redraw it as a clean brush ring (it sits behind the plate)
ys, xs = np.nonzero(ring)
Am = np.c_[2 * xs, 2 * ys, np.ones_like(xs)]; bb = xs ** 2 + ys ** 2
(cx, cy, k), *_ = np.linalg.lstsq(Am.astype(float), bb.astype(float), rcond=None)
r = np.sqrt(k + cx ** 2 + cy ** 2)
th = min(cv2.distanceTransform(ring, cv2.DIST_L2, 5).max() * 2, 125)
print('ring', cx, cy, r, th)
ring2 = np.zeros_like(ring)
import math
for a in np.linspace(-150, 125, 400):        # degrees, image coords (y down): leaves a gap at the lower left
    t = (a + 150) / 275
    w = th * (0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.6)))   # brush: thin start, full, thin tail
    if t > 0.85: w *= max(0.25, (1 - t) / 0.15)
    x = cx + r * math.cos(math.radians(a)); y = cy + r * math.sin(math.radians(a))
    cv2.circle(ring2, (int(x), int(y)), int(w / 2), 255, -1)
ring = smooth(ring2, 2)
S = 110.0 / W                                   # logo 110 mm wide (crop width)
ys, xs = np.nonzero(plate | ring); ox, oy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
def to_mm(p): return [round((p[0] - ox) * S, 3), round(-(p[1] - oy) * S, 3)]
def polys(mask, eps=1.2, minA=300):
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None: return out
    hier = hier[0]
    for i, cc in enumerate(cs):
        if hier[i][3] != -1 or cv2.contourArea(cc) < minA: continue
        holes = []; k = hier[i][2]
        while k != -1:
            if cv2.contourArea(cs[k]) > 60: holes.append([to_mm(p) for p in cv2.approxPolyDP(cs[k], eps, True)[:, 0, :]])
            k = hier[k][0]
        out.append({'ext': [to_mm(p) for p in cv2.approxPolyDP(cc, eps, True)[:, 0, :]], 'holes': holes})
    return out
import json
json.dump({'monkey': polys(monkey), 'quest': polys(quest), 'hyper': polys(hyper, 0.8, 40), 'plate': polys(plate, 1.6, 2000), 'ring': polys(ring, 1.5, 2000)}, open('/tmp/mq/logo_shapes.json', 'w'))
vis = np.full_like(c, 255)
vis[ring > 0] = (40, 30, 120); vis[plate > 0] = (20, 20, 20); vis[monkey > 0] = (60, 40, 230); vis[quest > 0] = (40, 200, 250); vis[hyper > 0] = (90, 230, 250)
cv2.imwrite('/tmp/mq/logo_seg5.png', cv2.resize(vis, None, fx=0.5, fy=0.5))
