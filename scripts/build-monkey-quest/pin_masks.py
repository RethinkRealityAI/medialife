# Pin masks from the photo: silhouette, enamel regions (red, peach, pink), eyes; vectorised to JSON (mm).
import cv2, numpy as np, json
from shapely.geometry import Polygon
from shapely.ops import unary_union
c = cv2.imread('/tmp/mq/crop.png')
H, W = c.shape[:2]
m = {k: cv2.imread(f'/tmp/mq/m_{k}.png', 0) for k in ('red', 'peach', 'pink')}
union = np.maximum.reduce(list(m.values()))
def fill_holes(x):
    ff = x.copy(); mask = np.zeros((H + 2, W + 2), np.uint8); cv2.floodFill(ff, mask, (0, 0), 255)
    return x | cv2.bitwise_not(ff)
def smooth(x, s=3.0): return ((cv2.GaussianBlur(x.astype(np.float32), (0, 0), s) > 127) * 255).astype(np.uint8)
def largest(x):
    n, lb, st, _ = cv2.connectedComponentsWithStats(x); j = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA]); return ((lb == j) * 255).astype(np.uint8)
RIM = 19
sil = cv2.dilate(union, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * RIM + 1, 2 * RIM + 1)))
sil = largest(sil); sil = fill_holes(sil)
sil = cv2.erode(cv2.dilate(sil, np.ones((3, 3))), np.ones((3, 3)))
sil = smooth(sil, 4)
# regions limited to the pin
regions = {k: smooth(cv2.bitwise_and(v, cv2.erode(sil, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))), 2.5) for k, v in m.items()}
# eyes = round holes in the face that are not pink
face = regions['peach']
holes = fill_holes(face) & ~face & ~cv2.dilate(regions['pink'], np.ones((15, 15))) & ~cv2.dilate(regions['red'], np.ones((15, 15)))
n, lb, st, cen = cv2.connectedComponentsWithStats(holes.astype(np.uint8))
eyes = []
for j in range(1, n):
    a = st[j, cv2.CC_STAT_AREA]; w, h = st[j, 2], st[j, 3]
    if a > 800 and 0.7 < w / h < 1.4 and a / (w * h) > 0.6:
        eyes.append([float(cen[j][0]), float(cen[j][1]), float((w + h) / 4)])
print('eyes', eyes)
ys, xs = np.nonzero(sil)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
PIN_H_MM = 50.0
s = PIN_H_MM / (y1 - y0)
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
print('pin px bbox', x0, x1, y0, y1, 'mm', (x1 - x0) * s, (y1 - y0) * s)
def to_mm(p): return [round((p[0] - cx) * s, 3), round(-(p[1] - cy) * s, 3)]
def polys(mask, eps=1.6):
    cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None: return out
    hier = hier[0]
    for i, cc in enumerate(cs):
        if hier[i][3] != -1: continue
        if cv2.contourArea(cc) < 400: continue
        ext = cv2.approxPolyDP(cc, eps, True)[:, 0, :]
        holes = []
        k = hier[i][2]
        while k != -1:
            if cv2.contourArea(cs[k]) > 200: holes.append(cv2.approxPolyDP(cs[k], eps, True)[:, 0, :])
            k = hier[k][0]
        out.append({'ext': [to_mm(p) for p in ext], 'holes': [[to_mm(p) for p in hh] for hh in holes]})
    return out
lines = sil.copy()
for v in regions.values(): lines[v > 0] = 0
for ex, ey, r in eyes: cv2.circle(lines, (int(ex), int(ey)), int(r + 2), 0, -1)
data = {'mm_per_px': s, 'size_mm': [(x1 - x0) * s, (y1 - y0) * s],
        'sil': polys(sil, 1.6), 'lines': polys(lines, 1.3),
        'regions': {k: polys(v) for k, v in regions.items()},
        'eyes': [[*to_mm((ex, ey)), r * s] for ex, ey, r in eyes]}
json.dump(data, open('/tmp/mq/pin_shapes.json', 'w'))
cv2.imwrite('/tmp/mq/sil.png', sil); cv2.imwrite('/tmp/mq/lines.png', lines)
crop_box = [int(x0), int(y0), int(x1), int(y1)]
json.dump({'crop_box': crop_box, 'cx': cx, 'cy': cy, 's': s}, open('/tmp/mq/pin_frame.json', 'w'))
vis = c.copy(); vis[lines > 0] = (0, 255, 0)
cv2.imwrite('/tmp/mq/lines_vis.png', cv2.resize(vis, None, fx=0.4, fy=0.4))
