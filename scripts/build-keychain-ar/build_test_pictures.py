# Test pictures for the keychain AR page: the charms as separate keychains hanging from one ring, laid out
# in different ways (spacing, swing, tilt, distance, light), so recognition can be tried from a screen
# without the real keychain. Composited from the same pictures the targets are built from: the cat Bobo
# art (no photo of the real cat charm yet), Dapo's photo of the Eclipse can charm and his photo of the
# Roblox Bobo charm. Scripted compositing only, no generative AI.
# Output: public/evade/keychain-ar/target/tests/*.jpg + tests.json (the gallery at /evade/keychain-ar/target/)
# Run: python3 build_test_pictures.py
import os, json, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = REPO + '/public/evade/keychain-ar/target/tests/'
os.makedirs(OUT, exist_ok=True)
PX = 7.0                        # pixels per mm on the test canvas
W, H = 1600, 1200


def cut_photo(path, acrylic_mm):
    """a charm photo on its flat grey frame -> RGBA cut-out, scaled to PX; the grey joined to the border goes clear"""
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    bg = np.abs(a - a[2, 2]).sum(2) < 14
    lab, _ = ndi.label(bg); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    clear = np.isin(lab, list(edge))
    alpha = Image.fromarray(((~clear) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
    im = im.convert('RGBA'); im.putalpha(alpha); im = im.crop(alpha.getbbox())
    s = acrylic_mm * PX / im.height
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


def cut_art(path, ppm_mm):
    im = Image.open(path).convert('RGBA'); s = PX / ppm_mm
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)


CHARM = {
    'cat': cut_photo(HERE + '/src/bobo-product.png', 65),        # from the product shot (cut_product_charms.py)
    'canback': cut_photo(HERE + '/src/can-back.png', 57.5),      # the can's QR side, from the product shot
    'can': cut_photo(HERE + '/src/can-photo.png', 57.5),
    'roblox': cut_photo(HERE + '/src/old-bobo.png', 75),
}
CHARM['catl'] = CHARM['cat'].transpose(Image.FLIP_LEFT_RIGHT)       # the cat charm's other side: the print seen through the acrylic, tail on the left
NAME = {'catl': 'cat Bobo (other side)', 'cat': 'cat Bobo', 'canback': 'Eclipse can (QR side)', 'can': 'Eclipse can', 'roblox': 'Roblox Bobo'}


def hole(im):
    """where the charm hangs from: the middle of its topmost few rows"""
    al = np.asarray(im.getchannel('A')) > 128
    ys = np.nonzero(al.any(1))[0]; top = ys[0]
    xs = np.nonzero(al[top:top + 6].any(0))[0]
    return (xs.min() + xs.max()) / 2, top + 0.035 * im.height


def backdrop(kind, seed):
    rnd = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:H, 0:W]
    if kind == 'wood':
        base = np.array([156, 116, 80]); g = 0.93 + 0.05 * np.sin(xx / 23 + 2 * np.sin(yy / 260)) + 0.02 * np.sin(xx / 5.3) + rnd.normal(0, 0.02, (H, W))
        img = base[None, None] * g[..., None]
    elif kind == 'dark':
        g = 58 + 22 * (yy / H) + rnd.normal(0, 3, (H, W)); img = np.stack([g, g, g + 4], -1)
    else:
        g = 228 - 26 * ((xx - W * 0.4) ** 2 + (yy - H * 0.3) ** 2) / (W * W) + rnd.normal(0, 2.5, (H, W)); img = np.stack([g, g - 2, g - 6], -1)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')


def metal_ring(d, c, r, w):
    for i in range(int(w)):
        t = i / max(w - 1, 1); v = int(120 + 120 * math.sin(t * math.pi))
        d.ellipse([c[0] - r - w / 2 + i, c[1] - r - w / 2 + i, c[0] + r + w / 2 - i, c[1] + r + w / 2 - i], outline=(v, v, v + 6, 255), width=2)


def chain(d, a, b):
    """small links from a to b"""
    n = max(1, int(math.dist(a, b) / (5 * PX)))
    for i in range(n):
        t0, t1 = i / n, (i + 1) / n
        p = (a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2)
        lr, lw = 2.8 * PX, 1.7 * PX
        if i % 2: lr, lw = lw, lr
        d.ellipse([p[0] - lw, p[1] - lr, p[0] + lw, p[1] + lr], outline=(190, 192, 198, 255), width=3)


def place(canvas, key, at, swing_deg, scale=1.0):
    """hang a charm by its hole from `at`, swung by swing_deg (positive = to the right)"""
    im = CHARM[key]
    if scale != 1: im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    hx, hy = hole(im)
    big = Image.new('RGBA', (im.width * 3, im.height * 3), (0, 0, 0, 0)); big.alpha_composite(im, (im.width, im.height))
    rot = big.rotate(swing_deg, resample=Image.BICUBIC, center=(im.width + hx, im.height + hy))
    ox, oy = round(at[0] - im.width - hx), round(at[1] - im.height - hy)
    sh = Image.new('RGBA', rot.size, (0, 0, 0, 0)); sh.putalpha(rot.getchannel('A').point(lambda v: v * 0.3).filter(ImageFilter.GaussianBlur(10)))
    canvas.alpha_composite(sh, (ox + 10, oy + 14)); canvas.alpha_composite(rot, (ox, oy))


def keychain(charms, bg='light', ring=(800, 120), seed=1):
    """charms: (key, chain direction in degrees from straight down (+ = to the right), chain length mm,
    charm swing in degrees). Each charm is its own keychain on its own chain, all from one ring."""
    cv = backdrop(bg, seed); d = ImageDraw.Draw(cv)
    R = 14 * PX
    for key, direction, length, swing in charms:
        a = math.radians(direction)
        top = (ring[0] + R * math.sin(a), ring[1] + R * math.cos(a))
        end = (top[0] + length * PX * math.sin(a), top[1] + length * PX * math.cos(a))
        chain(d, top, end)
        place(cv, key, end, swing)    # + swing = the charm's foot to the right (PIL turns counter-clockwise)
        d = ImageDraw.Draw(cv)
    metal_ring(d, ring, R, 2.4 * PX)
    return cv


def perspective(im, tilt_x=0.0, tilt_y=0.0, zoom=1.0, rot=0.0, bg=(60, 60, 64)):
    """look at the picture from an angle: tilt_x leans the top away (deg), tilt_y turns it sideways (deg)"""
    f = 1400.0
    cx, cy = W / 2, H / 2
    ax, ay, az = math.radians(tilt_x), math.radians(tilt_y), math.radians(rot)
    Rx = np.array([[1, 0, 0], [0, math.cos(ax), -math.sin(ax)], [0, math.sin(ax), math.cos(ax)]])
    Ry = np.array([[math.cos(ay), 0, math.sin(ay)], [0, 1, 0], [-math.sin(ay), 0, math.cos(ay)]])
    Rz = np.array([[math.cos(az), -math.sin(az), 0], [math.sin(az), math.cos(az), 0], [0, 0, 1]])
    Rm = Rz @ Ry @ Rx
    src = [(0, 0), (W, 0), (W, H), (0, H)]; dst = []
    for x, y in src:
        p = Rm @ np.array([(x - cx) * zoom, (y - cy) * zoom, 0.0]); z = f + p[2]
        dst.append((cx + f * p[0] / z, cy + f * p[1] / z))
    A = []; B = []
    for (x, y), (u, v) in zip(src, dst):   # coefficients map output (u, v) -> input (x, y)
        A.append([u, v, 1, 0, 0, 0, -x * u, -x * v]); B.append(x)
        A.append([0, 0, 0, u, v, 1, -y * u, -y * v]); B.append(y)
    coef = np.linalg.solve(np.array(A, float), np.array(B, float))
    out = Image.new('RGBA', (W, H), (*bg, 255))
    warped = im.transform((W, H), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC, fillcolor=(0, 0, 0, 0))
    out.alpha_composite(warped)
    return out


NEW = [('cat', -48, 44, -34), ('canback', 48, 40, 34)]
OLD = [('roblox', -48, 40, -30), ('can', 48, 40, 34)]
TESTS = []
def add(slug, title, what, img, light=None, blur=0):
    img = img.convert('RGB')
    if light: img = ImageEnhance.Brightness(img).enhance(light); img = ImageEnhance.Contrast(img).enhance(0.85)
    if blur: img = img.filter(ImageFilter.GaussianBlur(blur))
    img.save(OUT + slug + '.jpg', quality=88)
    TESTS.append(dict(slug=slug, title=title, what=what))

# ---- the new keychain (cat Bobo + can), each charm on its own chain from the ring
add('new-apart', 'Cat Bobo and can, spread apart', 'The two keychains laid out on a table, a few centimetres apart.', keychain(NEW))
add('new-hanging', 'Hanging side by side', 'Both hanging straight down from the ring, close together but not touching.', keychain([('cat', -32, 46, 0), ('canback', 30, 44, 0)]))
add('new-front-can', 'Cat Bobo with the can front', 'Cat Bobo next to the front of the real can charm (the photo).', keychain([('cat', -40, 44, -10), ('can', 38, 42, 10)], seed=11))
add('new-other-side', 'The other side', 'The keychain turned over: cat Bobo with the tail on the left, next to the front of the can.', keychain([('catl', -34, 46, 4), ('can', 34, 44, -4)], seed=12))
add('new-wide', 'Far apart', 'Spread wide, as if the ring was dropped on a table.', keychain([('cat', -58, 36, -60), ('canback', 58, 34, 56)], bg='wood', ring=(800, 260), seed=2))
add('new-overlap', 'One over the other', 'The can lying partly on top of the cat charm.', keychain([('cat', -10, 26, -6), ('canback', 14, 34, 14)]))
add('new-tilt-back', 'Seen from below', 'Tipped back 40 degrees, like a phone held low.', perspective(keychain(NEW), tilt_x=40))
add('new-tilt-side', 'Seen from the side', 'Turned 45 degrees sideways.', perspective(keychain(NEW, bg='dark', seed=3), tilt_y=45))
add('new-far', 'Far away', 'Half size, like holding the phone at arm\'s length.', perspective(keychain(NEW), zoom=0.5, bg=(226, 224, 220)))
add('new-sideways', 'Turned on its side', 'The keychain on a table, turned 90 degrees.', perspective(keychain(NEW, bg='wood', seed=4), rot=90, zoom=0.62, bg=(150, 112, 78)))
add('new-dim', 'Dim light', 'Darker and softer, like a room in the evening.', keychain(NEW, seed=5), light=0.55, blur=1.2)
# ---- the earlier keychain (Roblox Bobo + can)
add('old-apart', 'Roblox Bobo and can, spread apart', 'The two keychains laid out a few centimetres apart.', keychain(OLD, bg='dark', seed=6))
add('old-hanging', 'Roblox Bobo hanging', 'Both hanging straight down from the ring.', keychain([('roblox', -34, 46, 0), ('can', 32, 46, 0)], seed=7))
add('old-tilt', 'Roblox Bobo at an angle', 'Tipped back 35 degrees and turned 25 degrees.', perspective(keychain(OLD, bg='wood', seed=8), tilt_x=35, tilt_y=-25))
add('old-far', 'Roblox Bobo far away', 'Half size.', perspective(keychain(OLD, bg='dark', seed=9), zoom=0.5, bg=(62, 62, 66)))
# ---- all three on one ring
add('all-three', 'All three on one ring', 'Cat Bobo, Roblox Bobo and the can together.', keychain([('cat', -64, 36, -50), ('roblox', 0, 12, 0), ('can', 64, 34, 50)], ring=(800, 190), seed=10))
json.dump(dict(tests=TESTS), open(OUT + 'tests.json', 'w'), indent=1)
print(len(TESTS), 'test pictures in', OUT)
