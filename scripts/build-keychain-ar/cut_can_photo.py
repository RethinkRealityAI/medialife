# Cuts the Eclipse can charm out of Dapo's phone photo of the real charm (src/can-photo-original.jpg),
# clear acrylic and hanging tab included, with a clean outline that follows the acrylic's outer edge.
#   1. GrabCut finds the printed can (it has a crisp dark border).
#   2. The acrylic is laser cut at a margin around the print, with a tab and hole at the top: that shape
#      (print grown by the margin, plus the tab, with rounded joins) is the first guess of the outline.
#   3. Every point of that guess is moved along its normal to the outermost strong edge in the photo (the
#      acrylic's outer rim), then the offsets are smoothed, so the outline is exact but never jagged.
# Outputs: src/can-photo.png (the image-target picture: the acrylic centred 3:4 with a 4% margin on a flat light
# background, the skin seen through the clear acrylic softened so it gives the tracker no false detail) and
# src/can-outline.json (the outline in that picture, 0..1, for the portal mask build_targets.py draws).
# Needs opencv-python-headless (pip install opencv-python-headless). Run: python3 cut_can_photo.py
import os, json
import numpy as np, cv2
from PIL import Image, ImageOps
from scipy.ndimage import gaussian_filter1d, median_filter

HERE = os.path.dirname(os.path.abspath(__file__)) + '/src/'
full = np.asarray(ImageOps.exif_transpose(Image.open(HERE + 'can-photo-original.jpg')).convert('RGB'))[..., ::-1]
X0, Y0 = 888, 977                                   # the charm's region in the upright 3000x4000 photo
im = np.ascontiguousarray(full[Y0:3644, X0:2311]); H, W = im.shape[:2]
K = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))

# 1. the print, at half size
sm = cv2.resize(im, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
m = np.full(sm.shape[:2], cv2.GC_BGD, np.uint8)
cv2.rectangle(m, (80, 240), (640, 1230), cv2.GC_PR_BGD, -1)
cv2.rectangle(m, (110, 300), (590, 1190), cv2.GC_PR_FGD, -1)
cv2.rectangle(m, (160, 480), (560, 1150), cv2.GC_FGD, -1)
cv2.grabCut(sm, m, None, np.zeros((1, 65)), np.zeros((1, 65)), 8, cv2.GC_INIT_WITH_MASK)
fg = ((m == 1) | (m == 3)).astype(np.uint8) * 255
n, lab, st, _ = cv2.connectedComponentsWithStats(fg); fg = (lab == 1 + np.argmax(st[1:, 4])).astype(np.uint8) * 255
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, K(4))
pm = cv2.resize(fg, (W, H), interpolation=cv2.INTER_LINEAR)
pm = (cv2.GaussianBlur(pm, (0, 0), 6) > 127).astype(np.uint8) * 255

# 2. first guess of the acrylic: print + 100 px margin, tab round the hole, rounded joins
HOLE, TAB_R, MARGIN = (491, 395), 166, 100
guess = cv2.dilate(pm, K(MARGIN)); cv2.circle(guess, HOLE, TAB_R, 255, -1)
guess = cv2.erode(cv2.dilate(guess, K(60)), K(60))
cs, _ = cv2.findContours(guess, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=len)[:, 0, :].astype(float)
seg = np.r_[0, np.cumsum(np.hypot(*np.diff(np.r_[c, c[:1]], axis=0).T))]; N = 900
s = np.linspace(0, seg[-1], N, endpoint=False)
pts = np.c_[np.interp(s, seg, np.r_[c[:, 0], c[0, 0]]), np.interp(s, seg, np.r_[c[:, 1], c[0, 1]])]
tan = np.roll(pts, -3, 0) - np.roll(pts, 3, 0); nrm = np.c_[tan[:, 1], -tan[:, 0]]; nrm /= np.linalg.norm(nrm, axis=1)[:, None]
if cv2.pointPolygonTest(pts.astype(np.float32), tuple(map(float, pts[0] + nrm[0] * 5)), False) > 0: nrm = -nrm

# 3. snap to the outer rim
lum = cv2.createCLAHE(3.0, (8, 8)).apply(cv2.cvtColor(im, cv2.COLOR_BGR2LAB)[..., 0]).astype(np.float32)
lum = cv2.GaussianBlur(lum, (0, 0), 2.0)
gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)
offs = np.arange(-45, 46); best = np.zeros(N)
for i, (p, nv) in enumerate(zip(pts, nrm)):
    q = p[None] + offs[:, None] * nv[None]
    xi = np.clip(q[:, 0].round().astype(int), 0, W - 1); yi = np.clip(q[:, 1].round().astype(int), 0, H - 1)
    g = np.abs(gx[yi, xi] * nv[0] + gy[yi, xi] * nv[1]) * np.exp(-(offs / 35.0) ** 2)
    best[i] = offs[np.nonzero(g >= 0.6 * g.max())[0].max()]
best = gaussian_filter1d(median_filter(best, size=31, mode='wrap'), 12, mode='wrap')
out = pts + best[:, None] * nrm                       # the acrylic outline, crop pixels

# the picture: acrylic centred 3:4 with a 4% margin
x0, y0 = out.min(0); x1, y1 = out.max(0)
ph = (y1 - y0) * 1.04; pw = ph * 0.75; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
OW, OH = 1200, 1600; sc = OH / ph
M = np.float32([[sc, 0, -(cx - pw / 2) * sc], [0, sc, -(cy - ph / 2) * sc]])
photo = cv2.warpAffine(im, M, (OW, OH), flags=cv2.INTER_AREA if sc < 1 else cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
o2 = out * sc + M[:, 2]
SS = 4                                                # anti-aliased fill
big = np.zeros((OH * SS, OW * SS), np.uint8); cv2.fillPoly(big, [np.round(o2 * SS).astype(np.int32)], 255, cv2.LINE_AA)
acr = cv2.resize(big, (OW, OH), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
pr = cv2.warpAffine(pm, M, (OW, OH), flags=cv2.INTER_LINEAR)
# the clear band between the print and the rim: keep its tone, lose the skin's texture
inner = cv2.erode((acr > 0.5).astype(np.uint8) * 255, K(int(round(26 * sc)))) > 0
band = inner & ~(cv2.dilate(pr, K(int(round(10 * sc)))) > 0)
w = cv2.GaussianBlur(band.astype(np.float32), (0, 0), 3)[..., None]
soft = cv2.GaussianBlur(photo, (0, 0), 18)
photo = (photo * (1 - w) + soft * w)
bg = np.array([240, 238, 236], np.float32)            # BGR of (236, 238, 240)
pic = photo * acr[..., None] + bg * (1 - acr[..., None])
cv2.imwrite(HERE + 'can-photo.png', np.clip(pic, 0, 255).astype(np.uint8))
json.dump(dict(note='Eclipse can charm acrylic outline in src/can-photo.png, x/y as fractions of its width/height',
               points=[[round(x / OW, 5), round(y / OH, 5)] for x, y in o2[::3]]), open(HERE + 'can-outline.json', 'w'))
print('acrylic', round(x1 - x0), 'x', round(y1 - y0), 'px in the photo; aspect', round((x1 - x0) / (y1 - y0), 3))
