import cv2, numpy as np, json
c = cv2.imread('/tmp/mq/crop.png')
b = cv2.bilateralFilter(c, 9, 40, 9)
lab = cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.float32)
L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
refs = {'red': (90, 185, 163), 'peach': (158, 158, 159), 'pink': (151, 177, 150)}
chroma = np.hypot(A - 128, B - 128)
enamel = (chroma > 28) & (A > 140)
d = {k: (L - v[0])**2 * 0.25 + (A - v[1])**2 + (B - v[2])**2 for k, v in refs.items()}
names = list(refs)
st = np.stack([d[k] for k in names], -1)
cls = np.argmin(st, -1)
masks = {}
k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
for i, n in enumerate(names):
    m = ((cls == i) & enamel).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k3)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # drop small blobs
    n_, lab_, stats, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for j in range(1, n_):
        if stats[j, cv2.CC_STAT_AREA] > 1500: keep[lab_ == j] = 255
    masks[n] = keep
    cv2.imwrite(f'/tmp/mq/m_{n}.png', keep)
# remove the logo (top of crop) : only keep components that touch the main pin body
union = np.maximum.reduce(list(masks.values()))
sil = cv2.morphologyEx(union, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
n_, lab_, stats, _ = cv2.connectedComponentsWithStats(sil)
big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
sil = ((lab_ == big) * 255).astype(np.uint8)
cv2.imwrite('/tmp/mq/sil0.png', sil)
vis = np.zeros_like(c); vis[masks['red'] > 0] = (40, 30, 200); vis[masks['peach'] > 0] = (100, 140, 220); vis[masks['pink'] > 0] = (180, 120, 255)
vis[(sil > 0) & (union == 0)] = (200, 200, 200)
cv2.imwrite('/tmp/mq/seg.png', cv2.resize(vis, None, fx=0.4, fy=0.4))
