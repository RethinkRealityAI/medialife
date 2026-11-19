# Cuts the cat Bobo charm and the back of the Eclipse can charm (the side with the QR code) out of the
# product shot Dapo sent on 2026-11-11 (src/product-keychain.webp), for two image targets: kc-bobo and
# kc-can-back. Scripted image processing only (no generative tools on EVADE's art).
# The product shot shows the charms from the side whose outline is the mirror of the flat artwork
# (Bobo's tail on the right), so each charm is lined up with the MIRRORED artwork:
#   1. the printed part is found (coloured, on a white backdrop) and matched in shape to the artwork's
#      printed part, mirrored (ECC), giving a rotation + scale into the artwork's own picture frame;
#   2. the charm is redrawn upright in the same 3:4 picture frame build_targets.py uses for that artwork,
#      so the 3D character lines up with its print the same way (the frame is mirrored in layout.json);
#   3. the acrylic outline is traced like cut_can_photo.py: the print grown by the acrylic margin plus the
#      tab, each point moved out to the acrylic's outer edge, then smoothed.
# Outputs per charm: src/<name>.png (the picture, acrylic on a flat light background) and
# src/<name>-outline.json (the acrylic outline in that picture, 0..1, for the portal mask).
# Needs opencv-python-headless. Run: python3 cut_product_charms.py
import os, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
from scipy.ndimage import gaussian_filter1d, median_filter

HERE = os.path.dirname(os.path.abspath(__file__)) + '/src/'
ART = os.path.abspath(os.path.join(HERE, '..', '..', '..', 'public', 'evade', 'keychain', 'src')) + '/'
PRGB = np.asarray(Image.open(HERE + 'product-keychain.webp').convert('RGB'))
S = 2                                                 # pictures at twice the artwork's 14 px per mm
K = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def print_mask(rgb, region):
    rgb = rgb.astype(int); sat = rgb.max(2) - rgb.min(2); m = (sat > 45) | (rgb.max(2) < 150)
    z = np.zeros_like(m); x0, y0, x1, y1 = region; z[y0:y1, x0:x1] = m[y0:y1, x0:x1]
    z = ndi.binary_fill_holes(ndi.binary_closing(z, iterations=4))
    lab, n = ndi.label(z); return lab == 1 + np.argmax(ndi.sum(z, lab, range(1, n + 1)))


def frame_of(cw, ch):
    """the padded 3:4 picture build_targets.py makes round an artwork of cw x ch: size and the artwork's offset"""
    tw, th = (cw, round(cw / 0.75)) if cw / ch > 0.75 else (round(ch * 0.75), ch)
    tw, th = round(tw * 1.04), round(th * 1.04)
    return tw, th, (tw - cw) // 2, (th - ch) // 2


def cut(name, art_file, region, hole, tab_r, margin):
    art = np.asarray(Image.open(ART + art_file).convert('RGBA'))
    pa = ndi.binary_fill_holes(art[..., 3] >= 250)[:, ::-1]           # the artwork's print, mirrored
    pp = print_mask(PRGB, region)
    def mom(m):
        ys, xs = np.nonzero(m); c = np.array([xs.mean(), ys.mean()]); ev, evec = np.linalg.eigh(np.cov(np.vstack([xs - c[0], ys - c[1]])))
        v = evec[:, 1]; return c, np.arctan2(v[1], v[0]), np.sqrt(m.sum())
    (cA, aA, sA), (cP, aP, sP) = mom(pa), mom(pp)
    d = (aP - aA + np.pi / 2) % np.pi - np.pi / 2; s = sP / sA
    R = np.array([[np.cos(d), -np.sin(d)], [np.sin(d), np.cos(d)]]) * s
    M = np.c_[R, cP - R @ cA].astype(np.float32)                       # artwork (mirrored) -> product shot
    _, M = cv2.findTransformECC(cv2.GaussianBlur(pa.astype(np.float32), (0, 0), 3), cv2.GaussianBlur(pp.astype(np.float32), (0, 0), 3), M,
                                cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), None, 5)
    g = np.array([[x, y] for x in (0, art.shape[1]) for y in (0, art.shape[0])], np.float32)
    M, _ = cv2.estimateAffinePartial2D(g, g @ M[:, :2].T + M[:, 2])  # no shear: rotation, scale, shift only
    tw, th, ox, oy = frame_of(art.shape[1], art.shape[0]); TW, TH = tw * S, th * S
    A = np.vstack([M, [0, 0, 1]]) @ np.array([[1 / S, 0, -ox], [0, 1 / S, -oy], [0, 0, 1]])      # picture -> product shot
    pic = cv2.warpAffine(PRGB[..., ::-1].copy(), A[:2].astype(np.float32), (TW, TH), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderValue=(255, 255, 255))
    pm = cv2.warpAffine(pp.astype(np.uint8) * 255, A[:2].astype(np.float32), (TW, TH), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    pm = (pm > 127).astype(np.uint8) * 255
    guess = cv2.dilate(pm, K(margin)); cv2.circle(guess, hole, tab_r, 255, -1); guess = cv2.erode(cv2.dilate(guess, K(30)), K(30))
    cs, _ = cv2.findContours(guess, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=len)[:, 0, :].astype(float)
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(np.r_[c, c[:1]], axis=0).T))]; N = 900
    t = np.linspace(0, seg[-1], N, endpoint=False)
    pts = np.c_[np.interp(t, seg, np.r_[c[:, 0], c[0, 0]]), np.interp(t, seg, np.r_[c[:, 1], c[0, 1]])]
    tan = np.roll(pts, -3, 0) - np.roll(pts, 3, 0); nrm = np.c_[tan[:, 1], -tan[:, 0]]; nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    if cv2.pointPolygonTest(pts.astype(np.float32), tuple(map(float, pts[0] + nrm[0] * 5)), False) > 0: nrm = -nrm
    lum = cv2.GaussianBlur(cv2.cvtColor(pic, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
    gx = cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3)
    offs = np.arange(-30, 31); best = np.zeros(N)
    for i, (p, nv) in enumerate(zip(pts, nrm)):
        q = p[None] + offs[:, None] * nv[None]
        xi = np.clip(q[:, 0].round().astype(int), 0, TW - 1); yi = np.clip(q[:, 1].round().astype(int), 0, TH - 1)
        gg = np.abs(gx[yi, xi] * nv[0] + gy[yi, xi] * nv[1]) * np.exp(-(offs / 25.0) ** 2)
        best[i] = offs[np.nonzero(gg >= 0.5 * gg.max())[0].max()]
    best = gaussian_filter1d(median_filter(best, size=25, mode='wrap'), 8, mode='wrap')
    out = pts + best[:, None] * nrm
    big = np.zeros((TH * 4, TW * 4), np.uint8); cv2.fillPoly(big, [np.round(out * 4).astype(np.int32)], 255, cv2.LINE_AA)
    acr = cv2.resize(big, (TW, TH), interpolation=cv2.INTER_AREA).astype(np.float32)[..., None] / 255
    img = pic * acr + np.array([240, 238, 236], np.float32) * (1 - acr)
    cv2.imwrite(HERE + name + '.png', np.clip(img, 0, 255).astype(np.uint8))
    json.dump(dict(note=f'{name}: acrylic outline in src/{name}.png, x/y as fractions of its width/height; the picture is the artwork {art_file} frame, mirrored',
                   points=[[round(x / TW, 5), round(y / TH, 5)] for x, y in out[::3]]), open(HERE + name + '-outline.json', 'w'))
    from fit_print import fit
    print(name, fit(pm, S * 14000, SIL_FILE[name], True, HERE + name + '-fit.json', debug=DEBUG and DEBUG + name + '-fit.png'))
    return pic, pm, pts, out

SIL_FILE = {'can-back': 'silhouette-eclipse.png', 'bobo-product': 'silhouette-bobo.png'}
DEBUG = None


if __name__ == '__main__':
    import sys
    dbg = len(sys.argv) > 1
    if dbg: DEBUG = sys.argv[1]
    for args in (('can-back', 'charm-eclipse.png', (150, 850, 860, 2048), (700, 172), 84, 40),
                 ('bobo-product', 'charm-bobo.png', (880, 800, 1850, 2048), (682, 278), 80, 50)):
        pic, pm, pts, out = cut(*args)
        if dbg:
            ov = pic.copy(); cv2.polylines(ov, [pts.astype(np.int32)], True, (0, 0, 255), 1); cv2.polylines(ov, [out.astype(np.int32)], True, (0, 200, 0), 3)
            cv2.imwrite(sys.argv[1] + args[0] + '-ov.png', cv2.resize(ov, None, fx=0.5, fy=0.5))
        print(args[0], pic.shape[1], 'x', pic.shape[0])
