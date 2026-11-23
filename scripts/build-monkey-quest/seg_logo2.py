import cv2, numpy as np
c = cv2.imread('/tmp/mq/logo_crop.png')
b = cv2.bilateralFilter(c, 7, 30, 7)
lab = cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.float32)
L, A, B = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
blue = (B < -8)
yellow = (B > 28) & (L > 42) & ~blue
reds = (A > 18) & (L >= 22) & ~yellow & ~blue
dark = (L < 34) & ~blue & ~reds & ~yellow
H, W = L.shape
def rect(x0, y0, x1, y1):
    m = np.zeros((H, W), bool); m[y0*2:y1*2, x0*2:x1*2] = True; return m
def clean(m, o=3, cl=3, minA=150):
    m = m.astype(np.uint8) * 255
    if o: m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (o, o)))
    if cl: m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (cl, cl)))
    n, lb, st, _ = cv2.connectedComponentsWithStats(m)
    k = np.zeros_like(m)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] > minA: k[lb == j] = 255
    return k
monkey_band = rect(20, 160, 800, 308)
quest_band = rect(260, 312, 860, 445)
hyper_band = rect(60, 88, 400, 158)
monkey = clean(reds & monkey_band, 3, 3, 300)
quest = clean((yellow | reds) & quest_band & ~monkey_band, 3, 3, 300)
hyper = clean(yellow & hyper_band, 0, 3, 40)
letters = (monkey > 0) | (quest > 0) | (hyper > 0)
ring = clean(reds & ~monkey_band & ~quest_band & ~rect(0, 440, 480, 520), 5, 9, 3000)
# backing = brush + outlines + letters, holes filled, smoothed
back = (dark | letters) & ~rect(0, 445, 470, 520)
back = clean(back, 5, 11, 4000)
def fill_holes(m):
    ff = m.copy(); h, w = m.shape; mask = np.zeros((h+2, w+2), np.uint8); cv2.floodFill(ff, mask, (0, 0), 255)
    return m | cv2.bitwise_not(ff)
back = fill_holes(back)
for k, v in dict(monkey=monkey, quest=quest, hyper=hyper, ring=ring, back=back).items(): cv2.imwrite(f'/tmp/mq/lg2_{k}.png', v)
vis = np.full_like(c, 255)
vis[back > 0] = (20, 20, 20); vis[ring > 0] = (40, 30, 120); vis[monkey > 0] = (60, 40, 230); vis[quest > 0] = (40, 200, 250); vis[hyper > 0] = (90, 230, 250)
cv2.imwrite('/tmp/mq/logo_seg3.png', cv2.resize(vis, None, fx=0.5, fy=0.5))
