import cv2, numpy as np
c = cv2.imread('/tmp/mq/logo_crop.png')
b = cv2.bilateralFilter(c, 9, 30, 9)
lab = cv2.cvtColor(b, cv2.COLOR_BGR2LAB).astype(np.float32)
L, A, B = lab[..., 0] * 100 / 255, lab[..., 1] - 128, lab[..., 2] - 128
blue = (B < -8)
yellow = (B > 30) & (L > 45) & ~blue
red = (A > 30) & (L >= 38) & ~yellow
maroon = (A > 18) & (L < 38) & ~yellow
dark = (L < 32) & ~blue & ~red & ~maroon
def clean(m, o=3, cl=5, minA=300):
    m = m.astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (o, o)))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (cl, cl)))
    n, lb, st, _ = cv2.connectedComponentsWithStats(m)
    k = np.zeros_like(m)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] > minA: k[lb == j] = 255
    return k
M = {'yellow': clean(yellow), 'red': clean(red), 'maroon': clean(maroon, 5, 9, 800), 'dark': clean(dark, 3, 7, 800)}
vis = np.full_like(c, 255)
vis[M['dark'] > 0] = (20, 20, 20); vis[M['maroon'] > 0] = (40, 30, 120); vis[M['red'] > 0] = (60, 40, 230); vis[M['yellow'] > 0] = (40, 200, 250)
cv2.imwrite('/tmp/mq/logo_seg.png', cv2.resize(vis, None, fx=0.5, fy=0.5))
for k, v in M.items(): cv2.imwrite(f'/tmp/mq/lg_{k}.png', v)
# --- letters vs ring
allc = cv2.bitwise_or(cv2.bitwise_or(M['red'], M['maroon']), M['yellow'])
n, lb, st, _ = cv2.connectedComponentsWithStats(allc, connectivity=4)
H, W = allc.shape
letters_red = np.zeros_like(allc); letters_yel = np.zeros_like(allc); ring = np.zeros_like(allc)
for j in range(1, n):
    m = lb == j; a = m.sum()
    if a < 400: continue
    x, y, w, h = st[j, :4]
    if x + w < 700 and y > 1100: continue          # the pin's top edge
    fy = (M['yellow'][m] > 0).mean(); fr = (M['red'][m] > 0).mean()
    if fy > 0.35: letters_yel[m] = 255
    elif fr > 0.12 and w < 700: letters_red[m] = 255
    else: ring[m] = 255
cv2.imwrite('/tmp/mq/lg_letters_red.png', letters_red); cv2.imwrite('/tmp/mq/lg_letters_yel.png', letters_yel); cv2.imwrite('/tmp/mq/lg_ring.png', ring)
vis = np.full_like(c, 255)
vis[M['dark'] > 0] = (20, 20, 20); vis[ring > 0] = (40, 30, 120); vis[letters_red > 0] = (60, 40, 230); vis[letters_yel > 0] = (40, 200, 250)
cv2.imwrite('/tmp/mq/logo_seg2.png', cv2.resize(vis, None, fx=0.5, fy=0.5))
