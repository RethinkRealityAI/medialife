"""LOOT BREAK loading-screen GIF: the splash's party, open chest and rays,
no text or logos. Rendered on a low-res pixel canvas and scaled up with
nearest-neighbour, so it matches the sprites and compresses well."""
import json, math, os, random, sys
from PIL import Image

# Usage: python3 scripts/loot-break-loading-gif.py OUT.gif
# Sprites come from the built splash (run scripts/build-loot-break.mjs first).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_splash = open(os.path.join(ROOT, 'public/labs/loot-break/splash.html')).read()
_a = _splash.index('var ART = ') + len('var ART = ')
ART = json.loads(_splash[_a:_splash.index(';', _splash.index('			}', _a))])
OUT = sys.argv[1]
N = int(os.environ.get('N', 32))          # frames per loop
SCALE = int(os.environ.get('SCALE', 6))   # display px per sprite px
# Canvas in sprite px: 90 x 160 at 6x = 540 x 960, a 9:16 phone screen.
W = int(os.environ.get('W', 90))
H = int(os.environ.get('H', 160))
FRAME_MS = int(os.environ.get('MS', 90))


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def sprite(name, flip=False):
    rows = ART['SPRITES'][name]
    im = Image.new('RGBA', (len(rows[0]), len(rows)), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            c = ART['PAL'].get(ch)
            if c:
                px[x, y] = hexrgb(c) + (255,)
    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im


def screen(a, b, t):
    """Screen-blend colour b over a at strength t (light adds, never muddies)."""
    return tuple(round(255 - (255 - a[i]) * (255 - b[i] * t) / 255) for i in range(3))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background():
    """Splash background: dark violet gradient, blue glow top right, purple
    glow at the bottom. Quantised into bands so it stays pixel-crisp."""
    bg = Image.new('RGB', (W, H))
    p = bg.load()
    top, mid, bot = hexrgb('#0d0a1a'), hexrgb('#1a1033'), hexrgb('#2a1650')
    for y in range(H):
        t = y / (H - 1)
        base = lerp(top, mid, t / .55) if t < .55 else lerp(mid, bot, (t - .55) / .45)
        for x in range(W):
            c = base
            # blue glow top right
            d = math.hypot((x / W - .85) / .9, (y / H) / .6)
            if d < 1:
                c = lerp(c, hexrgb('#1d3f7a'), (1 - d) * .55)
            # purple glow from the bottom
            d = math.hypot((x / W - .5) / 1.2, (y / H - 1.08) / .7)
            if d < 1:
                c = lerp(c, hexrgb('#6a2fb0'), (1 - d) * .8)
            # quantise to 6-level steps per channel band for crisp banding
            c = tuple((v // 6) * 6 for v in c)
            p[x, y] = c
    return bg


BG = background()
HEROES = [('priest', False), ('sorcerer', False), (None, False), ('ranger', True), ('knight', True)]
SPR = {n: sprite(n, f) for n, f in HEROES if n}
CHEST = sprite('chestOpen')
GOLD = hexrgb('#ffd35a')

# Party layout, as on the splash: 16-px heroes overlapping by 3, chest in the middle.
xs, x = [], 0
for i, (n, _) in enumerate(HEROES):
    if n is None:
        x += 1
        xs.append(x)
        x += 16 + 1
    else:
        if i and HEROES[i - 1][0] is not None:
            x -= 3
        xs.append(x)
        x += 16
ROW_W = x
X0 = (W - ROW_W) // 2
FLOOR = int(H * .5) + 8       # feet line: the party sits in the middle
CX = X0 + xs[2] + 8           # chest centre
CY = FLOOR - 7

rnd = random.Random(7)
STARS = [(rnd.randrange(W), rnd.randrange(int(H * .62)), rnd.random()) for _ in range(34)]
SPARKS = [(rnd.uniform(-14, 14), rnd.random(), rnd.choice([1, 1, 2])) for _ in range(7)]


def frame(f):
    t = f / N
    im = BG.copy().convert('RGBA')
    px = im.load()

    # twinkling stars (each twinkles once per loop at its own phase)
    for sx, sy, ph in STARS:
        a = max(0, math.sin((t + ph) * 2 * math.pi))
        if a > .35:
            c = lerp(px[sx, sy][:3], (255, 255, 255), .45 + .45 * (a > .8))
            px[sx, sy] = c + (255,)

    # rays: 16 spokes rotating one spoke-gap per loop (seamless), fading out
    spokes, rot = 12, t * (2 * math.pi / 12)
    for y in range(H):
        for x in range(W):
            dx, dy = x + .5 - CX, y + .5 - CY
            r = math.hypot(dx, dy)
            if r < 4 or r > 42:
                continue
            ang = (math.atan2(dy, dx) - rot) % (2 * math.pi / spokes)
            if ang < (2 * math.pi / spokes) * .32:
                # a stepped gold ramp, like a pixel-art light burst; the
                # outer bands are checkered so the sky shows through
                if r < 14:
                    px[x, y] = hexrgb('#ffe7a3') + (255,)
                elif r < 23:
                    px[x, y] = hexrgb('#ffc94a') + (255,)
                elif r < 32:
                    if (x + y) % 2 == 0 or r < 27:
                        px[x, y] = hexrgb('#e8a12e') + (255,)
                elif (x + y) % 2 == 0 and (r < 36 or (x // 2 + y // 2) % 2 == 0):
                    px[x, y] = hexrgb('#a0602a') + (255,)

    # soft glow behind the chest, pulsing gently
    pulse = .5 + .12 * math.sin(t * 2 * math.pi)
    rg = 13 + round(2 * math.sin(t * 2 * math.pi))
    for y in range(CY - rg, CY + rg):
        for x in range(CX - rg, CX + rg):
            d = math.hypot(x + .5 - CX, y + .5 - CY)
            if d < rg - 3:
                px[x, y] = hexrgb('#fff0b8') + (255,)
            elif d < rg and (x + y) % 2 == 0:
                px[x, y] = hexrgb('#ffd35a') + (255,)

    # pool of light the party stands in
    for y in range(FLOOR - 2, FLOOR + 4):
        for x in range(X0 - 10, X0 + ROW_W + 10):
            d = math.hypot((x + .5 - (X0 + ROW_W / 2)) / (ROW_W / 2 + 10), (y + .5 - (FLOOR + 1)) / 3)
            if d < 1:
                k = round((1 - d) * .6 * 3) / 3
                if k > 0:
                    px[x, y] = screen(px[x, y][:3], hexrgb('#ffd278'), k) + (255,)

    # sparkles rising out of the chest
    for ox, ph, sz in SPARKS:
        u = (t + ph) % 1
        sx = int(CX + ox * (0.4 + u))
        sy = int(CY - 4 - u * 30)
        if u < .85 and 0 <= sx < W and 0 <= sy < H:
            col = GOLD if u < .6 else hexrgb('#fff3d0')
            for yy in range(sz):
                for xx in range(sz):
                    if 0 <= sx + xx < W and 0 <= sy + yy < H:
                        px[sx + xx, sy + yy] = col + (255,)

    # the party, bobbing one pixel in turn (like the splash idle)
    for i, (n, _) in enumerate(HEROES):
        x = X0 + xs[i]
        if n is None:
            im.alpha_composite(CHEST, (x, FLOOR - 16))
            continue
        bob = -1 if ((f + i * 3) // (N // 4)) % 2 else 0
        # drop shadow one pixel down, then the sprite
        sh = SPR[n].copy()
        sh.putdata([(0, 0, 0, 90) if a[3] else (0, 0, 0, 0) for a in SPR[n].get_flattened_data()] if hasattr(SPR[n], 'get_flattened_data') else [(0, 0, 0, 90) if a[3] else (0, 0, 0, 0) for a in SPR[n].getdata()])
        im.alpha_composite(sh, (x, FLOOR - 16 + bob + 1))
        im.alpha_composite(SPR[n], (x, FLOOR - 16 + bob))
    return im.convert('RGB')


frames = [frame(f) for f in range(N)]
# Crop to a square around the action, then scale up with hard pixels.
big = [fr.resize((W * SCALE, H * SCALE), Image.NEAREST) for fr in frames]
# One shared palette from a few frames, no dithering (flat pixel art).
sample = Image.new('RGB', (W * 4, H))
for k in range(4):
    sample.paste(frames[k * N // 4], (W * k, 0))
pal = sample.quantize(colors=int(os.environ.get('COLORS', 96)), method=Image.MEDIANCUT, dither=Image.NONE)
q = [b.quantize(palette=pal, dither=Image.NONE) for b in big]
q[0].save(OUT, save_all=True, append_images=q[1:], duration=FRAME_MS, loop=0, optimize=True, disposal=1)
print(OUT, os.path.getsize(OUT), 'bytes', len(q), 'frames', q[0].size)
