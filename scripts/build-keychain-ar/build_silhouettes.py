# Black silhouettes of the printed art on each charm (what is left behind when Bobo and the can jump
# off the keychain). Same pixel frame as public/evade/keychain/src/charm-*.png, so a silhouette laid
# over the charm print covers the art exactly. Also writes the numbers the models and the lab need.
import os, json, math
import numpy as np
from PIL import Image
from scipy import ndimage
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
SRC = REPO + '/public/evade/keychain/src/'
OUT = REPO + '/public/evade/keychain/ar/'
meta = {}
for name in ('bobo', 'eclipse'):
    a = np.array(Image.open(SRC + f'charm-{name}.png').convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    pale = (rgb.min(-1) > 228) & (rgb.max(-1) - rgb.min(-1) < 30)        # the clear acrylic margin
    art = (al > 128) & ~pale
    art = ndimage.binary_opening(art, iterations=2)
    lab, n = ndimage.label(art)
    art = lab == (1 + int(np.argmax(ndimage.sum(art, lab, range(1, n + 1)))))
    art = ndimage.binary_fill_holes(ndimage.binary_closing(art, iterations=3))
    soft = np.clip(ndimage.gaussian_filter(art.astype(np.float32), 0.8) * 1.6 - 0.3, 0, 1)   # anti-aliased edge
    out = np.zeros(a.shape, np.uint8); out[..., 3] = (soft * 255).astype(np.uint8)
    Image.fromarray(out).save(OUT + f'silhouette-{name}.png', optimize=True)
    ys, xs = np.nonzero(art); h, w = art.shape
    base = art[int(ys.max() - 0.06 * (ys.max() - ys.min())):]            # where it stands: the bottom rows
    bx = np.nonzero(base)[1]
    # lean of the art (the can is printed at a slight angle): principal axis of the shape
    c = np.cov(np.stack([xs - xs.mean(), ys - ys.mean()])); ev, evec = np.linalg.eigh(c); ax = evec[:, 1]
    tilt = math.degrees(math.atan2(ax[0], -ax[1])); tilt = (tilt + 90) % 180 - 90
    meta[name] = dict(w=w, h=h, bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                      base_x=float((bx.min() + bx.max()) / 2), centre=[float(xs.mean()), float(ys.mean())],
                      tilt_deg=round(tilt, 2) if name == 'eclipse' else 0.0)
json.dump(meta, open(OUT + 'silhouettes.json', 'w'), indent=1)
print(json.dumps(meta))
