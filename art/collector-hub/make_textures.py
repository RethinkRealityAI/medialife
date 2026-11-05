"""Builds the room's flat textures by compositing EVADE's supplied art (no generative tools).
Run: python3 art/collector-hub/make_textures.py  -> art/collector-hub/tex/*.png
"""
import os, random, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, '..', '..'))
OUT = os.path.join(ROOT, 'tex'); os.makedirs(OUT, exist_ok=True)
F_BOLD = os.path.join(REPO, 'scripts/brand/fonts/SpaceGrotesk-Bold.ttf')
F_MED = os.path.join(REPO, 'scripts/brand/fonts/SpaceGrotesk-Medium.ttf')
def font(p, s): return ImageFont.truetype(p, s)
def A(p): return os.path.join(REPO, p)

NAVY0, NAVY1 = (8, 14, 36), (22, 40, 88)
CYAN, PINK, GOLD = (54, 227, 255), (255, 79, 163), (255, 196, 46)

def vgrad(w, h, c0, c1):
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / (h - 1); d.line([(0, y), (w, y)], fill=tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3)))
    return im

def cover(im, w, h):
    s = max(w / im.width, h / im.height); im = im.resize((int(im.width * s) + 1, int(im.height * s) + 1), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))

def rrect(d, box, r, **kw): d.rounded_rectangle(box, r, **kw)

# --- monitor screen: "BOBO OS" desktop with the hub apps ---------------------------------
W, H = 1600, 640
scr = vgrad(W, H, NAVY0, NAVY1)
d = ImageDraw.Draw(scr, 'RGBA')
for x in range(0, W, 64): d.line([(x, 0), (x, H)], fill=CYAN + (18,))
for y in range(0, H, 64): d.line([(0, y), (W, y)], fill=CYAN + (18,))
d.rectangle([0, 0, W, 54], fill=(5, 9, 24, 230))
d.text((28, 12), 'BOBO OS', font=font(F_BOLD, 30), fill=CYAN)
d.text((W - 150, 14), '9:41 PM', font=font(F_MED, 26), fill=(220, 230, 255))
logo = Image.open(A('public/brand/evade-logo.webp')).convert('RGBA'); logo = logo.resize((150, int(150 * logo.height / logo.width)), Image.LANCZOS)
scr.paste(logo, ((W - logo.width) // 2, 10), logo)
# tile 1: alerts
rrect(d, (40, 90, 560, 560), 26, fill=(10, 18, 44, 235), outline=CYAN + (180,), width=3)
d.text((72, 116), 'ALERTS', font=font(F_BOLD, 44), fill=(255, 255, 255))
d.ellipse((268, 116, 322, 170), fill=PINK); d.text((285, 118), '2', font=font(F_BOLD, 40), fill=(255, 255, 255))
for i, (t, s) in enumerate([('New drop incoming', 'Something new for your room'), ('Cola Run weekend', 'Beat 25 cans for a shelf trophy')]):
    y = 210 + i * 160
    rrect(d, (70, y, 530, y + 132), 18, fill=(24, 40, 86, 255))
    d.ellipse((90, y + 36, 150, y + 96), fill=GOLD if i == 0 else CYAN)
    d.text((172, y + 26), t, font=font(F_BOLD, 34), fill=(255, 255, 255))
    d.text((172, y + 74), s, font=font(F_MED, 24), fill=(170, 190, 235))
# tile 2: my clips (Cola Run)
splash = cover(Image.open(A('public/evade/creators/assets/img/cola-run-splash.webp')).convert('RGB').crop((0, 520, 1080, 1500)), 460, 470)
m = Image.new('L', splash.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, 459, 469), 26, fill=255)
scr.paste(splash, (590, 90), m)
d.rounded_rectangle((590, 90, 1050, 560), 26, outline=PINK + (220,), width=3)
d.rectangle((590, 486, 1050, 560), fill=(5, 9, 24, 200))
d.text((616, 500), 'MY CLIPS', font=font(F_BOLD, 38), fill=(255, 255, 255))
d.polygon([(800, 290), (800, 360), (858, 325)], fill=(255, 255, 255, 230))
# tile 3: bobo live
live = cover(Image.open(A('public/roblox/portal/img/evade/bobo-reward.webp')).convert('RGB'), 470, 470)
m = Image.new('L', live.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, 469, 469), 26, fill=255)
scr.paste(live, (1090, 90), m)
d.rounded_rectangle((1090, 90, 1560, 560), 26, outline=CYAN + (220,), width=3)
d.rectangle((1090, 486, 1560, 560), fill=(5, 9, 24, 200))
d.text((1116, 500), 'BOBO LIVE', font=font(F_BOLD, 38), fill=(255, 255, 255))
d.ellipse((1500, 506, 1528, 534), fill=(255, 60, 80))
# dock
for i, c in enumerate([CYAN, PINK, GOLD, (140, 120, 255), (90, 230, 160)]):
    cx = W // 2 - 160 + i * 80; d.ellipse((cx - 24, 584, cx + 24, 632), fill=c + (230,))
scr.save(os.path.join(OUT, 'screen.png'))

# --- window: night sky with an eclipse moon and a skyline ---------------------------------
S = 768
sky = vgrad(S, S, (6, 10, 30), (58, 34, 96))
d = ImageDraw.Draw(sky, 'RGBA'); rnd = random.Random(7)
for _ in range(140):
    x, y = rnd.randrange(S), rnd.randrange(int(S * 0.65)); r = rnd.choice([1, 1, 1, 2])
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, rnd.randrange(120, 255)))
glow = Image.new('RGBA', (S, S)); g = ImageDraw.Draw(glow); g.ellipse((420, 70, 660, 310), fill=(255, 210, 230, 110))
sky = Image.alpha_composite(sky.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(40)))
d = ImageDraw.Draw(sky, 'RGBA')
d.ellipse((470, 120, 610, 260), fill=(250, 246, 240)); d.ellipse((520, 110, 640, 230), fill=(122, 20, 52))
for i in range(26):
    bw = rnd.randrange(30, 70); bh = rnd.randrange(80, 260); x = i * 30 - 20
    d.rectangle((x, S - bh, x + bw, S), fill=(12, 14, 40, 255))
    for wy in range(S - bh + 12, S - 10, 22):
        for wx in range(x + 8, x + bw - 8, 16):
            if rnd.random() < 0.35: d.rectangle((wx, wy, wx + 6, wy + 9), fill=rnd.choice([CYAN, GOLD, PINK]) + (220,))
sky.convert('RGB').save(os.path.join(OUT, 'sky.png'))

# --- posters --------------------------------------------------------------------------
cover(Image.open(A('public/evade/creators/assets/img/cola-run-splash.webp')).convert('RGB'), 540, 968).save(os.path.join(OUT, 'poster_colarun.png'))
cover(Image.open(A('public/roblox/portal/img/evade/bobo-reward.webp')).convert('RGB'), 600, 600).save(os.path.join(OUT, 'poster_bobo.png'))
logo = Image.open(A('public/brand/evade-logo.webp')).convert('RGBA'); logo.save(os.path.join(OUT, 'sign_evade.png'))
print('textures ->', OUT)

# --- giant Eclipse can label (wraps 360 deg around the house; u = angle / 360) ---------------
LW, LH = 4096, 1280
lab = Image.new('RGB', (LW, LH), (159, 211, 245)); d = ImageDraw.Draw(lab, 'RGBA')
for y in range(LH):  # blue top with a soft vertical gradient
    t = y / LH; d.line([(0, y), (LW, y)], fill=(int(176 - 40 * t), int(222 - 30 * t), int(250 - 10 * t)))
split = int(LH * 0.46)
d.rectangle((0, split, LW, LH), fill=(155, 42, 78))
for i in range(0, LW, 8):  # subtle vertical sheen stripes in the crimson
    if (i // 8) % 9 == 0: d.rectangle((i, split, i + 20, LH), fill=(176, 64, 104, 90))
rnd2 = random.Random(3)
for _ in range(60):  # light-blue bubbles along the split
    x = rnd2.randrange(LW); y = split + rnd2.randrange(-30, 90); r = rnd2.choice([14, 20, 28, 38])
    d.ellipse((x - r, y - r, x + r, y + r), fill=(159, 211, 245))
d.rectangle((0, LH - 26, LW, LH), fill=(200, 205, 215)); d.rectangle((0, 0, LW, 22), fill=(200, 205, 215))
def eclipse_logo(cx, cy, r):
    d.ellipse((cx - r - 8, cy - r - 8, cx + r + 8, cy + r + 8), fill=(120, 10, 50))
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(253, 244, 236))
    o = int(r * 0.62); r2 = int(r * 0.72); d.ellipse((cx + o - r2, cy - int(r * 0.25) - r2, cx + o + r2, cy - int(r * 0.25) + r2), fill=(108, 0, 48))
for u in (0.375, 0.875):  # back of the house + the far side
    cx = int(LW * u); eclipse_logo(cx - 60, int(LH * 0.48), 190)
    f = font(F_MED, 150); fs = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 150)
    y0 = int(LH * 0.70); d.text((cx - 330, y0 + 4), 'Σ', font=fs, fill=(253, 244, 236))  # Space Grotesk has no Σ
    d.text((cx - 330 + int(fs.getlength('Σ')) + 6, y0), 'CLIPSE', font=f, fill=(253, 244, 236))
lab.save(os.path.join(OUT, 'can_label.png'))

# --- wood plank floor (planar UV across the disc) ---------------------------------------
FW = 1024
wood = Image.new('RGB', (FW, FW)); d = ImageDraw.Draw(wood)
pw_ = FW // 12
for i in range(12):
    base = (176, 122, 79) if i % 2 else (150, 101, 65)
    for x in range(i * pw_, (i + 1) * pw_):
        n = rnd2.randrange(-6, 6); d.line([(x, 0), (x, FW)], fill=tuple(max(0, c + n) for c in base))
    d.line([(i * pw_, 0), (i * pw_, FW)], fill=(70, 45, 30), width=3)
    off = rnd2.randrange(0, FW); d.line([(i * pw_, off), ((i + 1) * pw_, off)], fill=(70, 45, 30), width=3)
wood = wood.filter(ImageFilter.GaussianBlur(0.8)); wood.save(os.path.join(OUT, 'wood.png'))
print('can label + wood ok')

# --- "Go home" portal swirl ----------------------------------------------------------------
PS = 512
por = Image.new('RGBA', (PS, PS), (0, 0, 0, 0)); px = por.load()
for y in range(PS):
    for x in range(PS):
        dx, dy = (x - PS / 2) / (PS / 2), (y - PS / 2) / (PS / 2); rr = math.hypot(dx, dy)
        if rr > 1: continue
        ang = math.atan2(dy, dx); sw = 0.5 + 0.5 * math.sin(ang * 3 + rr * 9)
        t = min(1, rr * 1.1)
        c0, c1 = (255, 255, 255), (CYAN if sw > 0.5 else PINK)
        col = tuple(int(c0[i] * (1 - t) + c1[i] * t * (0.6 + 0.4 * sw)) for i in range(3))
        px[x, y] = col + (255,)
por = por.filter(ImageFilter.GaussianBlur(2)); por.convert('RGB').save(os.path.join(OUT, 'portal.png'))
print('portal ok')
