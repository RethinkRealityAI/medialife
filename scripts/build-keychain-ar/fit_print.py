# Lines a charm's 3D character up with the print in a photo-based target picture. The character models are
# built to the flat artwork: their Silhouette (public/evade/keychain/ar/silhouette-*.png, in the artwork's
# 14 px/mm frame) is where the model lies before it pops. A photo or product shot of the real charm never
# matches the artwork exactly, so the artwork frame is fitted to the print found in the picture (ECC on the
# two masks, reduced to rotation + uniform scale + shift) and the result goes into layout.json as the charm
# frame: x, y (metres from the picture centre, y up), rz (radians) and s (scale), plus mirror.
import json, math
import numpy as np, cv2
from PIL import Image

SIL = __import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', '..', 'public', 'evade', 'keychain', 'ar')) + '/'


def fit(print_mask, px_per_m, silhouette, mirror, out_json, debug=None):
    """print_mask: HxW uint8 (255 = print) in the target picture; px_per_m: picture pixels per metre"""
    H, W = print_mask.shape
    sil = np.asarray(Image.open(SIL + silhouette).convert('RGBA'))[..., 3]
    if mirror: sil = sil[:, ::-1]
    k = px_per_m / 14000.0                               # silhouette pixels -> picture pixels
    A0 = np.float32([[k, 0, W / 2 - sil.shape[1] * k / 2], [0, k, H / 2 - sil.shape[0] * k / 2]])
    m0 = cv2.warpAffine(sil, A0, (W, H), flags=cv2.INTER_LINEAR)   # where the model lies now (artwork centred)
    a = cv2.GaussianBlur((m0 > 127).astype(np.float32), (0, 0), 4); b = cv2.GaussianBlur((print_mask > 127).astype(np.float32), (0, 0), 4)
    M = np.float32([[1, 0, 0], [0, 1, 0]])
    cc, M = cv2.findTransformECC(a, b, M, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 400, 1e-7), None, 5)
    g = np.float32([[x, y] for x in (0, W) for y in (0, H)])
    S, _ = cv2.estimateAffinePartial2D(g, g @ M[:, :2].T + M[:, 2])  # q = sR q0 + t, picture pixels, y down
    s = float(math.hypot(S[0, 0], S[1, 0])); ang = math.atan2(S[1, 0], S[0, 0])
    c = np.array([W / 2, H / 2]); t = S[:, 2]
    R = S[:, :2]
    tm = (R @ c + t - c) / px_per_m; tm[1] = -tm[1]     # metres, y up
    res = dict(x=round(float(tm[0]), 6), y=round(float(tm[1]), 6), rz=round(-ang, 5), s=round(s, 5), mirror=bool(mirror), ecc=round(float(cc), 4))
    json.dump(res, open(out_json, 'w'))
    if debug:
        m1 = cv2.warpAffine(m0, S, (W, H))
        ov = np.dstack([print_mask, m0, m1]); cv2.imwrite(debug, cv2.resize(ov, None, fx=0.4, fy=0.4))
    return res
