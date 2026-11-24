#!/usr/bin/env python3
"""Photo Beam: measure each charm's "photo slot" from its target picture (colour segmentation, PIL + numpy only).

For every target picture in public/evade/keychain-ar/image-targets/ this writes, into public/evade/photo-beam/slots/:
  <target>-mask.png   the slot as a mask (L, the bounding box of the slot plus a margin, holes such as lettering filled)
  <target>-shade.png  the print's own shading inside that box (L, 128 = neutral): the printed photo is multiplied by it
  slots.json          per target: the bounding box (uv of the picture, x right, y down), the outline polygon (uv), the
                      slot's geometry (a band: per column [u, vTop, vBot]; the can: per row [v, uLeft, uRight]) and a
                      3-colour palette taken from the slot (dark, mid, light) for the Screen print style.

Slots:
  kc-bobo, kc-bobo-l   the blue visor/hat band with BOBO on it (light and mid blue in the top third; the collar, lower
                       down, is the same blue and is left out by the search box)
  kc-old, kc-old-l     the blue cap of the Roblox Bobo (blue near the head; the light-blue shirt is below the box)
  kc-can, kc-can-back  the can's body (the label): the saturated print inside the acrylic, rows where the can is at
                       its full width (below the shoulder, above the base)
  tee-sukeban          (removed 2026-11-24, kept as a recipe) two slots on one target (the MEDIALIFE tee picture):
    face               kind 'face': her face skin (the largest pink skin blob round the face), filled across each row
                       with her eyes, nose and mouth, so a selfie face replaces hers; the fringe above the eye line,
                       the side hair, the earrings and both hands (the other skin blobs, grown over the red nails) are
                       left out so they sit on top of the selfie; grown a little below the jaw so a chin joins. Flat.
    top                kind 'band': the white tube top with the red lettering (white or red, strokes closed, holes
                       filled), cut below the tattooed skin, with the pendant and chain left out (in front of the photo).
                       Wraps like the visor (a bulge across), shading keeps the fold lines (the letters are in-painted).
  Slot files are named by slot id (the target name for the keychain's single slots).

Run:  python3 scripts/build-photo-beam/build_slots.py [--overlay DIR]   (DIR: write overlay PNGs to check by eye)
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public/evade/keychain-ar/image-targets'
SRC_TEE = ROOT / 'public/labs/medialife-spray/targets'   # for a mask-measured slot (none now: the Sukeban tee left Photo Beam 2026-11-24)
OUT = ROOT / 'public/evade/photo-beam/slots'

# search boxes (fractions of the picture: u0, v0, u1, v1) and colour rules (PIL HSV, all 0..255)
SLOTS = {
    'kc-bobo':     dict(kind='band', box=(0.04, 0.17, 0.96, 0.34), hue=(132, 168), sat=30, val=150),
    'kc-bobo-l':   dict(kind='band', box=(0.04, 0.17, 0.96, 0.34), hue=(132, 168), sat=30, val=150),
    'kc-old':      dict(kind='band', box=(0.33, 0.13, 0.75, 0.33), hue=(132, 175), sat=40, val=120),
    'kc-old-l':    dict(kind='band', box=(0.25, 0.13, 0.67, 0.33), hue=(132, 175), sat=40, val=120),
    'kc-can':      dict(kind='can', box=(0.08, 0.05, 0.92, 0.97), outline='spray-bobo/art/can-outline.json'),   # a photo with
    # dark brown acrylic round a grey print: colour cannot split them, so the can's drawn outline (Spray Bobo / X-Ray) is used
    'kc-can-back': dict(kind='can', box=(0.08, 0.05, 0.92, 0.97), sat=48, val=40),
}
PIECE = {'kc-bobo': 'bobo', 'kc-bobo-l': 'bobo', 'kc-old': 'old', 'kc-old-l': 'old', 'kc-can': 'can', 'kc-can-back': 'can'}
N_COLS = 48          # band: columns sampled along it
N_ROWS = 40          # can: rows sampled down it


def largest_component(m):
    """the biggest 4-connected blob of a boolean mask (BFS on a small copy; no scipy here)"""
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    best, best_n, cur = 0, 0, 0
    for y in range(h):
        for x in range(w):
            if not m[y, x] or lab[y, x]:
                continue
            cur += 1
            n = 0
            q = deque([(y, x)])
            lab[y, x] = cur
            while q:
                cy, cx = q.popleft()
                n += 1
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
            if n > best_n:
                best, best_n = cur, n
    return lab == best


def close(m, r):
    """binary closing with a square of radius r (dilate then erode), numpy only"""
    def shift_or(a, r, op):
        out = a.copy()
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                s = np.roll(np.roll(a, dy, 0), dx, 1)
                out = (out | s) if op == 'or' else (out & s)
        return out
    return shift_or(shift_or(m, r, 'or'), r, 'and')


def grow(m, r):
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * r + 1))) > 0


def shrink(m, r):
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * r + 1))) > 0


def soften(m, r):
    """round off stair steps: blur and threshold"""
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))) > 128


def labels(m):
    """4-connected components: label image and sizes (index 0 unused)"""
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    sizes = [0]
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                cur = len(sizes)
                n = 0
                q = deque([(y, x)])
                lab[y, x] = cur
                while q:
                    cy, cx = q.popleft()
                    n += 1
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = cur
                            q.append((ny, nx))
                sizes.append(n)
    return lab, sizes


def fill_holes(m):
    lab, _ = labels(~m)
    edge = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    return m | (~m & ~np.isin(lab, list(edge)))


def up2(m, k, shape):
    return np.kron(m, np.ones((k, k), bool))[:shape[0], :shape[1]]


def skin_of(H, S, V):
    return ((H <= 14) | (H >= 245)) & (S >= 25) & (S <= 80) & (V >= 180)


def face_mask(img):
    """Sukeban's face: see the module notes. Returns the mask in the box, the eye line (box px) and the skin mask."""
    hsv = np.asarray(img.convert('HSV')).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    k = 2
    skin = skin_of(H, S, V)
    lab, sz = labels(skin[::k, ::k])
    big = int(np.argmax(sz))
    F = lab == big
    S0 = np.zeros_like(F)                      # the face's own span, to tell the tongue (inside) from fingers (outside)
    for y in np.where(F.any(1))[0]:
        xs = np.where(F[y])[0]
        S0[y, xs.min():xs.max() + 1] = True
    hands = np.zeros_like(F)
    for i, n in enumerate(sz):
        if i and i != big and n > 150 and ((lab == i) & S0).sum() < 0.5 * n:
            hands |= lab == i
    shape = skin.shape
    F, hands = up2(F, k, shape), grow(up2(hands, k, shape), 10)
    rows = np.where(F.any(1))[0]
    cy = (rows.min() + rows.max()) // 2
    fx0, fx1 = np.where(F.any(0))[0][[0, -1]]
    white = (V > 225) & (S < 25)
    up = slice(max(rows.min(), cy - 140), cy)
    wys = np.where(white[up, fx0:fx1])[0] + up.start
    yE = int(np.percentile(wys, 3))            # the top of the eye whites
    yC = int(np.median(wys))                   # the eye line (middle of the whites)
    eye = np.zeros_like(F)
    band = slice(yE - 6, cy)
    eye[band, fx0:fx1] = (white | ((S > 90) & (V > 60) & (V < 235)))[band, fx0:fx1]
    G = (F | eye) & ~hands
    M = np.zeros_like(F)
    for y in range(max(0, yE - 30), shape[0]):
        xs = np.where(G[y])[0]
        if len(xs):
            M[y, xs.min():xs.max() + 1] = True
    yb = rows.max()                            # the chin: grow the lower face down a little, over the jaw line
    low = M.copy()
    low[:yb - 70, :] = False
    for dy in range(1, 24):
        M[dy:, :] |= low[:-dy, :]
    M = soften(M, 6)
    hair = V < 110
    hair[yE - 12:, :] = False                  # the fringe above the eye line stays on top
    return M & ~hair & ~hands, yC, skin


def top_mask(img):
    hsv = np.asarray(img.convert('HSV')).astype(int)
    H, S, V = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    white = (S < 30) & (V > 150)
    red = ((H <= 16) | (H >= 240)) & (S > 110) & (V > 120)
    k = 2
    f = shrink(grow((white | red)[::k, ::k], 3), 3)   # close the fold strokes and the letters' edges
    lab, sz = labels(f)
    f = fill_holes(lab == int(np.argmax(sz)))
    M = soften(up2(f, k, V.shape), 4)
    # the pendant and chain stay in front: dark lines at the top centre, grown, holes filled
    win = np.zeros_like(M)
    win[:200, 290:420] = True
    M &= ~fill_holes(grow((V < 110) & win, 2))
    # above the fabric is tattooed skin: per column, cut above its lowest pink pixel (top rows only)
    skin = skin_of(H, S, V)
    cut = np.array([(np.where(skin[:100, x])[0].max() + 4) if skin[:100, x].any() else 0 for x in range(M.shape[1])], float)
    cut = np.array([cut[max(0, i - 8):i + 9].max() for i in range(len(cut))])     # below the skin everywhere near
    cut = np.array([cut[max(0, i - 10):i + 11].mean() for i in range(len(cut))])  # then a smooth hem line
    for x in range(M.shape[1]):
        M[:int(cut[x]), x] = False
    lab, sz = labels(M[::2, ::2])
    M &= up2(lab == int(np.argmax(sz)), 2, M.shape)
    return M, white & ~grow(red, 4)          # clean fabric for the shading: away from the letters' edges


def measure_custom(sid, cfg, overlay_dir=None):
    """a slot measured as a pixel mask (face, the tee top): geo per column from the mask, the mask kept as drawn"""
    img = Image.open(SRC_TEE / f"{cfg['target']}.jpg").convert('RGB')
    W, H = img.size
    bx = cfg['box']
    crop = img.crop(bx)
    extra = {}
    if cfg['kind'] == 'face':
        M, yC, clean = face_mask(crop)
        extra['eye'] = round((bx[1] + yC) / H, 5)   # the eye line, to line a selfie's eyes up with hers
    else:
        M, clean = top_mask(crop)
    ys, xs = np.where(M)
    # the slot's columns: top and bottom of the mask (the label covers their box; the mask cuts it)
    ca, cb = xs.min(), xs.max()
    n = 96
    cols = np.linspace(ca + 0.5, cb + 0.5, n)
    half = (cb - ca) / (n - 1)
    top, bot = [], []
    for x in cols:                             # the whole window round each column, so the mesh covers the mask
        win = M[:, max(0, int(x - half)):min(M.shape[1], int(x + half) + 1)]
        c = np.where(win.any(1))[0]
        top.append(c.min() if len(c) else np.nan)
        bot.append(c.max() + 1 if len(c) else np.nan)
    top, bot = np.array(top, float), np.array(bot, float)
    ok = ~np.isnan(top)
    top, bot = np.interp(cols, cols[ok], top[ok]), np.interp(cols, cols[ok], bot[ok])
    geo = [[round(float((bx[0] + x) / W), 5), round(float((bx[1] + t) / H), 5), round(float((bx[1] + b) / H), 5)] for x, t, b in zip(cols, top, bot)]
    poly = [[g[0], g[1]] for g in geo] + [[g[0], g[2]] for g in reversed(geo)]
    # the box: the mask's extent plus 3 %
    mu, mv = (xs.max() - xs.min()) * 0.03, (ys.max() - ys.min()) * 0.03
    px = [int(max(0, bx[0] + xs.min() - mu)), int(max(0, bx[1] + ys.min() - mv)), int(min(W, bx[0] + xs.max() + 1 + mu)), int(min(H, bx[1] + ys.max() + 1 + mv))]
    bb = [px[0] / W, px[1] / H, px[2] / W, px[3] / H]
    full = np.zeros((H, W), bool)
    full[bx[1]:bx[1] + M.shape[0], bx[0]:bx[0] + M.shape[1]] = M
    bw, bh = px[2] - px[0], px[3] - px[1]
    s = 512 / max(bw, bh)                      # mask and shade up to 512 px (hair strands and fingers)
    ow, oh = max(8, round(bw * s)), max(8, round(bh * s))
    mk = Image.fromarray((full[px[1]:px[3], px[0]:px[2]] * 255).astype(np.uint8)).resize((ow, oh), Image.LANCZOS)
    mk.save(OUT / f'{sid}-mask.png', optimize=True)
    # shade: the luminance, blurred only over the clean pixels (normalised convolution): her skin for the face (near
    # flat, the fringe's shadow stays), the fabric without the red letters for the top (the fold lines stay)
    lum = np.asarray(img.convert('L'), float)
    wgt = np.zeros((H, W), float)
    wgt[bx[1]:bx[1] + clean.shape[0], bx[0]:bx[0] + clean.shape[1]] = clean
    lum, wgt = lum[px[1]:px[3], px[0]:px[2]], wgt[px[1]:px[3], px[0]:px[2]]
    def bl(a, r):                              # a separable Gaussian (float, numpy only)
        kern = np.exp(-0.5 * (np.arange(-int(3 * r), int(3 * r) + 1) / r) ** 2)
        kern /= kern.sum()
        a = np.apply_along_axis(lambda v: np.convolve(np.pad(v, len(kern) // 2, mode='edge'), kern, 'valid'), 1, a)
        return np.apply_along_axis(lambda v: np.convolve(np.pad(v, len(kern) // 2, mode='edge'), kern, 'valid'), 0, a)
    r = 6 if cfg['kind'] == 'face' else 2.5
    num, den = bl(lum * wgt, r), bl(wgt, r)
    numL, denL = bl(lum * wgt, 14), bl(wgt, 14)   # wide: fills where the clean pixels are far (inside the letters)
    near = np.clip((den - 0.2) / 0.4, 0, 1)
    sh = near * num / np.maximum(den, 1e-6) + (1 - near) * np.where(denL > 0.01, numL / np.maximum(denL, 1e-6), np.nan)
    mm = full[px[1]:px[3], px[0]:px[2]]
    ref = np.nanmedian(sh[mm]) if mm.any() else 200
    sh = np.nan_to_num(sh, nan=ref)
    shade = Image.fromarray(np.clip(sh / max(ref, 1) * 128, 0, 255).astype(np.uint8)).resize((ow, oh), Image.LANCZOS)
    shade.save(OUT / f'{sid}-shade.png', optimize=True)
    # palette: for the face, her ink and two flat pinks (Ink style, Match skin); for the top, as the others
    arr = np.asarray(img)
    if cfg['kind'] == 'face':
        hsv = np.asarray(img.convert('HSV')).astype(int)
        sk = skin_of(hsv[..., 0], hsv[..., 1], hsv[..., 2]) & full
        light = np.median(arr[sk], axis=0)
        pinkish = ((hsv[..., 0] <= 14) | (hsv[..., 0] >= 245)) & (hsv[..., 1] >= 40) & (hsv[..., 1] <= 120) & (hsv[..., 2] >= 120) & (hsv[..., 2] < 205) & full
        mid = np.median(arr[pinkish], axis=0) if pinkish.sum() > 50 else light * 0.82
        cols = [np.array([26, 18, 20]), mid, light]
        pal = ['#%02x%02x%02x' % tuple(int(round(c)) for c in col) for col in cols]
        extra['skin'] = pal[2]
    else:
        pal = palette(arr, full)
    rec = {'id': sid, 'piece': cfg['piece'], 'kind': cfg['kind'], 'box': [round(x, 5) for x in bb], 'poly': [[round(a, 5), round(b, 5)] for a, b in poly],
           'geo': geo, 'palette': pal, 'mask': f'{sid}-mask.png', 'shade': f'{sid}-shade.png', 'px': [W, H], 'bulge': cfg['bulge'], 'shadeK': cfg['shadeK'], **extra}
    if overlay_dir:
        ov = img.convert('RGBA')
        g = np.zeros((H, W, 4), np.uint8)
        g[full] = (0, 255, 80, 100)
        edge = full ^ np.roll(full, 1, 0) | full ^ np.roll(full, 1, 1)
        g[grow(edge, 1)] = (255, 0, 90, 255)
        ov = Image.alpha_composite(ov, Image.fromarray(g))
        d = ImageDraw.Draw(ov)
        d.rectangle([px[0], px[1], px[2], px[3]], outline=(255, 255, 0, 255), width=3)
        if 'eye' in extra:
            d.line([px[0], extra['eye'] * H, px[2], extra['eye'] * H], fill=(0, 160, 255, 255), width=3)
        for i, c in enumerate(pal):
            d.rectangle([20 + i * 90, 20, 100 + i * 90, 100], fill=c, outline='black')
        ov.crop((max(0, px[0] - 80), max(0, px[1] - 80), min(W, px[2] + 80), min(H, px[3] + 80))).save(Path(overlay_dir) / f'{sid}-overlay.png')
        Image.fromarray(np.asarray(shade)).save(Path(overlay_dir) / f'{sid}-shade-check.png')
    return rec


def smooth(a, k=2):
    a = np.asarray(a, float)
    if len(a) < 3:
        return a
    p = np.pad(a, k, mode='edge')
    return np.convolve(p, np.ones(2 * k + 1) / (2 * k + 1), mode='valid')


def palette(rgb, m):
    """three flat colours from the slot: the darkest, middle and lightest thirds by luminance (their medians)"""
    px = rgb[m].reshape(-1, 3).astype(float)
    L = px @ np.array([0.299, 0.587, 0.114])
    order = np.argsort(L)
    thirds = np.array_split(px[order], [int(len(px) * 0.12), int(len(px) * 0.6)])
    cols = [np.median(t, axis=0) for t in thirds]
    cols[0] = cols[0] * 0.55                   # the dark ink a touch deeper, so the posterised photo keeps contrast
    cols[2] = cols[2] * 0.4 + 255 * 0.6        # the light step near paper white
    return ['#%02x%02x%02x' % tuple(int(max(0, min(255, round(c)))) for c in col) for col in cols]


def measure(name, cfg, overlay_dir=None):
    img = Image.open(SRC / f'{name}.jpg').convert('RGB')
    W, H = img.size
    k = 4                                      # work at a quarter size (the pictures are up to 1682x2244)
    sm = img.resize((W // k, H // k), Image.LANCZOS)
    w, h = sm.size
    hsv = np.asarray(sm.convert('HSV')).astype(int)
    hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    u0, v0, u1, v1 = cfg['box']
    inbox = np.zeros((h, w), bool)
    inbox[int(v0 * h):int(v1 * h), int(u0 * w):int(u1 * w)] = True
    if cfg['kind'] == 'band':
        m = inbox & (hh >= cfg['hue'][0]) & (hh <= cfg['hue'][1]) & (ss >= cfg['sat']) & (vv >= cfg['val'])
        # the dark blue ink lines between the panel and the band are kept by the closing
        m = close(m, 2)
    elif cfg.get('outline'):
        pts = json.loads((ROOT / 'public/evade' / cfg['outline']).read_text())['points']
        om = Image.new('L', (w, h), 0)
        ImageDraw.Draw(om).polygon([(u * w, v * h) for u, v in pts], fill=255)
        m = np.asarray(om) > 127
    else:
        m = inbox & (ss >= cfg['sat']) & (vv >= cfg['val']) & (vv <= cfg.get('vmax', 255))
        m = close(m, 3)
    m = largest_component(m)

    if cfg['kind'] == 'band':
        cols = np.where(m.any(0))[0]
        ca, cb = cols.min(), cols.max()
        # trim the ragged tips (where the band is under a fifth of its median height)
        heights = np.array([m[:, x].sum() for x in range(ca, cb + 1)])
        med = np.median(heights)
        keep = np.where(heights > med * 0.2)[0]
        ca, cb = ca + keep.min(), ca + keep.max()
        xs = np.linspace(ca + 0.5, cb + 0.5, N_COLS)
        top, bot = [], []
        for x in xs:
            col = m[:, min(int(x), w - 1)]
            ys = np.where(col)[0]
            top.append(ys.min() if len(ys) else np.nan)
            bot.append(ys.max() + 1 if len(ys) else np.nan)
        top, bot = smooth(np.array(top), 1), smooth(np.array(bot), 1)
        geo = [[round(float(x / w), 5), round(float(t / h), 5), round(float(b / h), 5)] for x, t, b in zip(xs, top, bot)]
        poly = [[g[0], g[1]] for g in geo] + [[g[0], g[2]] for g in reversed(geo)]
        full = np.zeros((h, w), bool)
        for x in range(ca, cb + 1):
            i = np.interp(x + 0.5, xs, np.arange(N_COLS))
            t, b = np.interp(i, np.arange(N_COLS), top), np.interp(i, np.arange(N_COLS), bot)
            full[int(round(t)):int(round(b)), x] = True
    else:
        rows = np.where(m.any(1))[0]
        widths = np.array([(np.where(m[y])[0].max() - np.where(m[y])[0].min()) if m[y].any() else 0 for y in range(h)])
        wmax = np.percentile(widths[rows], 90)
        body = np.where(widths >= wmax * 0.9)[0]
        ra, rb = body.min(), body.max()
        span = rb - ra
        ra, rb = ra + int(span * 0.03), rb - int(span * 0.05)   # off the shoulder's bead and the rounded base
        ys = np.linspace(ra + 0.5, rb + 0.5, N_ROWS)
        L, R = [], []
        for y in ys:
            xs_ = np.where(m[min(int(y), h - 1)])[0]
            L.append(xs_.min())
            R.append(xs_.max() + 1)
        L, R = smooth(np.array(L, float), 2), smooth(np.array(R, float), 2)
        inset = (np.median(R - L)) * 0.015          # a hair inside the can's edge line
        L, R = L + inset, R - inset
        geo = [[round(float(y / h), 5), round(float(l / w), 5), round(float(r / w), 5)] for y, l, r in zip(ys, L, R)]
        poly = [[g[1], g[0]] for g in geo] + [[g[2], g[0]] for g in reversed(geo)]
        full = np.zeros((h, w), bool)
        for y in range(ra, rb + 1):
            l, r = np.interp(y + 0.5, ys, L), np.interp(y + 0.5, ys, R)
            full[y, int(round(l)):int(round(r))] = True

    # the box: the slot plus a 4 % margin, in the full picture's pixels
    us, vs = [p[0] for p in poly], [p[1] for p in poly]
    mu, mv = (max(us) - min(us)) * 0.04, (max(vs) - min(vs)) * 0.04
    bb = [max(0, min(us) - mu), max(0, min(vs) - mv), min(1, max(us) + mu), min(1, max(vs) + mv)]
    px = [int(bb[0] * W), int(bb[1] * H), int(np.ceil(bb[2] * W)), int(np.ceil(bb[3] * H))]
    bb = [px[0] / W, px[1] / H, px[2] / W, px[3] / H]
    bw, bh = px[2] - px[0], px[3] - px[1]
    s = 256 / max(bw, bh)                       # mask and shade at most 256 px
    ow, oh = max(8, round(bw * s)), max(8, round(bh * s))

    # mask: drawn from the polygon at full size (smooth edge), then cropped
    mk = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mk).polygon([(u * W, v * H) for u, v in poly], fill=255)
    mk = mk.crop(px).resize((ow, oh), Image.LANCZOS)
    mk.save(OUT / f'{name}-mask.png', optimize=True)

    # shade: the print's luminance in the box, blurred so letters and fine lines go but folds and shadows stay,
    # divided by the slot's median (so 128 = the print's normal brightness there)
    lum = np.asarray(img.crop(px).convert('L').resize((ow, oh), Image.LANCZOS), float)
    mm = np.asarray(mk) > 127
    blur = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.GaussianBlur(3)), float)
    ref = np.median(blur[mm]) if mm.any() else 200
    shade = np.clip(blur / max(ref, 1) * 128, 0, 255).astype(np.uint8)
    Image.fromarray(shade).save(OUT / f'{name}-shade.png', optimize=True)

    full_px = np.asarray(img.resize((w, h), Image.LANCZOS))
    pal = palette(full_px, full)

    # the slot's real size share, for the aspect the photo is cut to
    rec = {'id': name, 'piece': PIECE[name], 'kind': cfg['kind'], 'bulge': 0.09 if cfg['kind'] == 'band' else 0, 'shadeK': 1, 'box': [round(x, 5) for x in bb], 'poly': [[round(a, 5), round(b, 5)] for a, b in poly],
           'geo': geo, 'palette': pal, 'mask': f'{name}-mask.png', 'shade': f'{name}-shade.png', 'px': [W, H]}

    if overlay_dir:
        ov = img.copy()
        d = ImageDraw.Draw(ov, 'RGBA')
        d.polygon([(u * W, v * H) for u, v in poly], fill=(0, 255, 120, 70), outline=(255, 0, 80, 255))
        d.rectangle([bb[0] * W, bb[1] * H, bb[2] * W, bb[3] * H], outline=(255, 255, 0, 255), width=4)
        for i, c in enumerate(pal):
            d.rectangle([20 + i * 90, 20, 100 + i * 90, 100], fill=c, outline='black')
        ov.thumbnail((700, 700))
        ov.save(Path(overlay_dir) / f'{name}-overlay.png')
    return rec


def main():
    overlay = None
    if '--overlay' in sys.argv:
        overlay = sys.argv[sys.argv.index('--overlay') + 1]
        Path(overlay).mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    out = {'note': 'Photo Beam slots, measured by scripts/build-photo-beam/build_slots.py from the target pictures. '
                   'uv of each picture (x right, y down). targets: per target picture, a list of slots. band / face geo: '
                   '[u, vTop, vBot] per column; can geo: [v, uLeft, uRight] per row. bulge: share of the width; shadeK: shading strength.',
           'targets': {}}
    for sid, cfg in SLOTS.items():
        r = measure_custom(sid, cfg, overlay) if cfg.get('custom') or cfg['kind'] == 'face' else measure(sid, cfg, overlay)
        out['targets'].setdefault(cfg.get('target', sid), []).append(r)
        print(sid, r['kind'], 'box', r['box'], 'palette', r['palette'], 'eye', r.get('eye'))
    (OUT / 'slots.json').write_text(json.dumps(out, separators=(',', ':')))


if __name__ == '__main__':
    main()
