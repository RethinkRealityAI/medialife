"""Make one hat's colour variant texture from a Meshy base (texel map from texel_map.py) + a logo crop.
The base texture's own shading and fabric weave are kept as a brightness map; its logos are painted out
(normalised-convolution fill), each region (crown, brim top, under-brim, button) gets the variant colour,
then the variant's logo (cut from its product photo) is projected flat onto the front panel."""
import json, sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as nd

def blur(a, s): return nd.gaussian_filter(a, s)

def build(npz, spec, out, dbg=None):
    d = np.load(npz); P, Nn, M, T = d['pos'], d['nrm'], d['mask'], d['tex'].astype(np.float32) / 255
    S = M.shape[0]; x, y, z = P[..., 0], P[..., 1], P[..., 2]; ny, nz = Nn[..., 1], Nn[..., 2]
    # the crown's footprint (an ellipse) from its lower wall
    wall = M & (y > spec['wall'][0]) & (y < spec['wall'][1]) & (np.abs(ny) < 0.3)
    a = np.percentile(np.abs(x[wall]), 99); z0, z1 = np.percentile(z[wall], [1, 99]); zc, b = (z0 + z1) / 2, (z1 - z0) / 2
    r = np.sqrt((x / a) ** 2 + ((z - zc) / b) ** 2)
    brim = M & (r > 1.04) & (y < spec['brimY']) & (z > zc + 0.2 * b)
    under = brim & (ny < -0.2)
    top = brim & ~under
    ytop = y[M].max(); button = M & (y > ytop - 0.07) & (np.abs(x) < 0.09) & (np.abs(z - zc) < 0.09)
    yc = spec.get('yc', -0.45)
    outward = (Nn[..., 0] * x + Nn[..., 1] * (y - yc) + Nn[..., 2] * (z - zc)) > 0
    inside = M & ~brim & ~button & ~outward
    crown = M & ~brim & ~button & outward
    lum = T.mean(2)
    # logos: far from the region's typical colour
    logo = np.zeros_like(M)
    for reg in (crown, top, under, inside):
        if reg.sum() < 50: continue
        ch = T / np.maximum(T.sum(2, keepdims=True), 1e-3); mch = np.median(ch[reg], 0); ml = np.median(lum[reg])
        cd = np.linalg.norm(ch - mch, axis=2); lr = lum / max(ml, 1e-3)
        logo |= reg & ((cd > spec.get('logoDist', 0.07)) | (lr > 1.9) | (lr < 0.35))
    logo = nd.binary_dilation(logo, iterations=spec.get('dilate', 3)) & M
    keep = (M & ~logo).astype(np.float32)
    fill = blur(lum * keep, 9) / np.maximum(blur(keep, 9), 1e-4)
    L = np.where(logo, fill, lum)
    if spec.get('flattenFront'):   # the old logo's embroidery relief is baked into the shading: smooth the front panel
        ff = M & ~brim & ~button & (nz > 0.1) & (z > zc) & (y > spec['wall'][0])
        ff = nd.binary_dilation(ff, iterations=2) & M & ~brim
        fill2 = blur(L * keep, 22) / np.maximum(blur(keep, 22), 1e-4)
        L = np.where(ff, fill2, L)
    outc = np.zeros((S, S, 3), np.float32)
    for reg, key in ((crown, 'crown'), (top, 'brim'), (under, 'under'), (button, 'button'), (inside, 'inside')):
        if reg.sum() == 0: continue
        med = np.median(L[reg]); det = (1 + (np.clip(L / max(med, 1e-3), 0.4, 1.5) - 1) * spec.get('detail', 0.75))[..., None]
        col = np.array(spec[key], np.float32) / 255
        outc[reg] = (col * det)[reg] if col.mean() > 0.06 else (col + (det - 1) * 0.08)[reg]
    # keep the base logo recoloured (e.g. the 76 turned white) when asked
    if spec.get('keepLogo'):
        k = crown & logo & (nz > 0.2)
        raw = M & ~brim & (np.linalg.norm(T - np.median(T[crown], 0), axis=2) > 0.2) & (nz > 0.2)
        outc[raw] = (np.array(spec['keepLogo'], np.float32) / 255 * np.clip(0.8 + 0.25 * lum / np.percentile(lum[raw], 90), 0.8, 1.02)[..., None])[raw]
    # project the variant's logo onto the front
    if spec.get('logo'):
        im = Image.open(spec['logo']).convert('RGBA'); A = np.asarray(im).astype(np.float32) / 255; h, w = A.shape[:2]
        lw = spec['logoW']; lh = lw * h / w; cy = spec['logoY']
        u = x / lw + 0.5; v = (cy + lh / 2 - y) / lh
        front = crown & (nz > spec.get('nzMin', 0.3)) & (z > zc) & (u >= 0) & (u < 1) & (v >= 0) & (v < 1)
        ui = np.clip((u * (w - 1)).astype(int), 0, w - 1); vi = np.clip((v * (h - 1)).astype(int), 0, h - 1)
        smp = A[vi, ui]; al = smp[..., 3:4] * front[..., None]
        shade = np.clip(L / np.median(L[crown]), 0.6, 1.2)[..., None]
        outc = outc * (1 - al) + smp[..., :3] * shade * al
    outc[~M] = 0
    # bleed colours past the UV islands so mips don't show seams
    idx = nd.distance_transform_edt(~M, return_distances=False, return_indices=True)
    outc = outc[idx[0], idx[1]]
    Image.fromarray((np.clip(outc, 0, 1) * 255).astype(np.uint8)).save(out, quality=88)
    if dbg:
        D = np.zeros((S, S, 3), np.uint8); D[crown] = (60, 60, 200); D[top] = (220, 40, 40); D[under] = (40, 200, 40); D[button] = (255, 255, 0); D[inside] = (255, 0, 255); D[logo] = (255, 255, 255)
        Image.fromarray(D).save(dbg)
    print(out, 'crown a=%.2f zc=%.2f b=%.2f' % (a, zc, b), 'brim', top.sum(), 'under', under.sum(), 'button', button.sum(), 'logo', logo.sum())

if __name__ == '__main__':
    specs = json.load(open(sys.argv[1]))
    for s in specs: build(s['npz'], s, s['out'], s.get('dbg'))
