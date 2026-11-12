# Paints the Eclipse can label (full wrap) to match the keychain's can art. Pure vector drawing
# with colours sampled from the supplied art; no generative tools.
import os
WORK = os.environ.get('KC_WORK', '/tmp/keychain-ar'); os.makedirs(WORK, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

import math, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import qrcode

W, H = 2048, 1024          # full circumference x (neck .. bottom bevel)
SS = 2                     # supersample
img = Image.new('RGB', (W * SS, H * SS), (153, 200, 246))
d = ImageDraw.Draw(img)

BLUE = (153, 200, 246); BLUE_HI = (181, 236, 255); BLUE_D = (123, 179, 242)
MAROON = (153, 50, 83); MAROON_L = (176, 85, 140); MAROON_D = (120, 30, 62)
BUBBLE = (172, 235, 251); CREAM = (255, 246, 237); CREAM_SH = (216, 228, 242)
RING = (141, 0, 96); DARK = (95, 0, 48); TEXT = (246, 226, 244)

# art -> label mapping (front centre of the art lands on u = cx)
ART_CX, ART_R = 255, 240
def z_of(y):              # art y -> can height (0..1 can units)
    return 0.03 + (905 - y) / 695 * 0.85
def ly(y):                # can height -> label px (0 = neck at z .935, 1024 = z .06)
    return (0.935 - z_of(y)) / 0.875 * H
def lx(x, cx):
    s = max(-0.999, min(0.999, (x - ART_CX) / ART_R))
    return cx + math.asin(s) / (2 * math.pi) * W
K = W / (2 * math.pi * ART_R)     # label px per art px at the centre line (~1.36)

def S(v): return v * SS
def circle(cx, cy, r, fill, outline=None, w=0):
    d.ellipse([S(cx - r), S(cy - r), S(cx + r), S(cy + r)], fill=fill, outline=outline, width=S(w))

def face(cx, seal=False):
    # maroon lower half with a soft wave + bubbles straddling the edge
    top = ly(500)
    # side tints like the art's lighting on the liquid
    for i in range(40):
        t = i / 40
        c = tuple(int(MAROON_L[k] * (1 - t) + MAROON[k] * t) for k in range(3))
        x0 = cx - 470 + i * 6
        d.rectangle([S(x0), S(top), S(x0 + 6), S(H)], fill=c)
    # bubbles (positions/sizes read off the art)
    for (x, y, r) in [(60, 548, 36), (45, 680, 12), (470, 560, 40), (470, 632, 12), (395, 600, 34),
                      (360, 690, 36), (325, 650, 44), (110, 505, 30), (180, 520, 26), (430, 520, 30)]:
        circle(lx(x, cx), ly(y), r * K * 1.08, BUBBLE if r < 30 else BLUE)
    if seal:
        # keychain back: round "SCAN TO ACTIVATE" seal over the logo
        cx2, cy2, R = lx(255, cx), ly(560), 205
        circle(cx2, cy2, R + 10, (40, 40, 48))
        circle(cx2, cy2, R, (250, 250, 250))
        q = qrcode.QRCode(border=1, box_size=1, error_correction=qrcode.constants.ERROR_CORRECT_M)
        q.add_data('https://evade.medialife.ai'); q.make(fit=True)
        m = q.get_matrix(); n = len(m); side = 210; cell = side / n
        for j, row in enumerate(m):
            for i, v in enumerate(row):
                if v:
                    x0 = cx2 - side / 2 + i * cell; y0 = cy2 - side / 2 + 18 + j * cell
                    d.rectangle([S(x0), S(y0), S(x0 + cell) + 1, S(y0 + cell) + 1], fill=(20, 20, 24))
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', S(24))
        txt = 'SCAN TO ACTIVATE'
        # text on an arc above the code
        ang0 = -math.pi / 2 - 0.62
        for k, ch in enumerate(txt):
            a = ang0 + k * (1.24 / (len(txt) - 1))
            px = cx2 + math.cos(a) * (R - 34); py = cy2 + math.sin(a) * (R - 34)
            gl = Image.new('RGBA', (S(40), S(40)), (0, 0, 0, 0))
            ImageDraw.Draw(gl).text((S(20), S(20)), ch, font=f, fill=(20, 20, 24), anchor='mm')
            gl = gl.rotate(-math.degrees(a) - 90, resample=Image.BICUBIC)
            img.paste(gl, (int(S(px) - S(20)), int(S(py) - S(20))), gl)
    else:
        # eclipse logo: cream disc with a maroon ring, dark moon over its upper right
        bx, by, br = lx(240, cx), ly(560), 150 * K * 1.12
        circle(bx, by, br, CREAM, RING, 7)
        # pale shadow on the lower right of the disc
        sh = Image.new('L', img.size, 0); sd = ImageDraw.Draw(sh)
        sd.ellipse([S(bx - br + 8), S(by - br + 8), S(bx + br - 8), S(by + br - 8)], fill=255)
        sd.rectangle([0, 0, S(bx + br * 0.15), img.size[1]], fill=0)
        sd.rectangle([0, 0, img.size[0], S(by + br * 0.05)], fill=0)
        img.paste(Image.new('RGB', img.size, CREAM_SH), (0, 0), sh.filter(ImageFilter.GaussianBlur(S(6))))
        dx, dy, dr = lx(338, cx), ly(488), 105 * K * 1.42
        circle(dx, dy, dr, DARK)
    # ΣCLIPSE, hand-drawn thin strokes like the art
    base = ly(848); capH = 178; x = lx(40, cx) - 30; w = S(15)
    def L(pts):
        d.line([(S(px), S(py)) for px, py in pts], fill=TEXT, width=w, joint='curve')
        for px, py in (pts[0], pts[-1]):
            r = w / 2 / SS; d.ellipse([S(px - r), S(py - r), S(px + r), S(py + r)], fill=TEXT)
    def arc(cx_, cy_, rx, ry, a0, a1, n=24):
        return [(cx_ + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
                 cy_ + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
    t = base - capH
    # Σ
    L([(x + 62, t + 4), (x + 4, t + 6), (x + 44, t + capH * 0.52), (x + 2, base - 4), (x + 66, base - 8)]); x += 108
    # C
    L(arc(x + 42, t + capH / 2, 42, capH / 2, -60, -300, 30)); x += 112
    # L
    L([(x + 4, t), (x + 4, base), (x + 58, base - 2)]); x += 100
    # I
    L([(x + 6, t + 2), (x + 6, base)]); x += 50
    # P
    L([(x + 4, base), (x + 4, t)] + arc(x + 30, t + capH * 0.27, 34, capH * 0.27, -90, 90, 16) + [(x + 4, t + capH * 0.54)]); x += 106
    # S
    L(arc(x + 34, t + capH * 0.26, 32, capH * 0.26, -20, -270, 16) + arc(x + 34, t + capH * 0.74, 34, capH * 0.26, -90, 160, 16)); x += 106
    # E
    L([(x + 60, t + 2), (x + 4, t + 4), (x + 4, base), (x + 62, base - 2)]); L([(x + 4, t + capH * 0.5), (x + 50, t + capH * 0.5)])

# blue top with a soft highlight and the cyan shoulder line
for i in range(W):
    pass
d.rectangle([0, S(ly(500)), S(W), S(H)], fill=MAROON)
face(W * 0.5)          # front (u = .5 faces the viewer)
face(0.0, seal=True)   # back half wraps over the seam
face(W * 1.0, seal=True)
# cyan line just under the shoulder
d.rectangle([0, S(30), S(W), S(36)], fill=BLUE_HI)
img = img.resize((W, H), Image.LANCZOS)
img.save(WORK + '/can_label.png')
print('ok')
