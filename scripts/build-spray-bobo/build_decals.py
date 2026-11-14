#!/usr/bin/env python3
"""Spray Bobo decal library: writes the decal SVGs and the manifest the page reads.

    python3 scripts/build-spray-bobo/build_decals.py

Every decal is drawn here as flat vector art in the EVADE look (flat colours, thick ink outline, flat white
highlights, no gradients). Nothing is traced from or generated off EVADE's own artwork. The game decals are
original icons for things in the EVADE Roblox game (Cola, Jump Pad, Speed Pad, Barrier, Sensor, Teleporter, the
nextbot warning), not copies of the in-game models.

"Wear" decals (shades, hats, collars) are drawn in the kc-bobo paint texture's own pixels (768 x 1024, the
tracked picture), so each one's `fit` is exactly where it sits on Bobo: the centre (u, v, y down) and width (w)
as fractions of the picture. Their slot (eyes, head, neck) lets a new pair of shades replace the old pair.
On any other charm they drop in the middle of it instead.
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '../../public/evade/spray-bobo/decals'))
TW, TH = 768, 1024

INK = '#15131a'
Y, BLUE, SKY, MAG, RED, ORANGE, GREEN, PURPLE, WHITE = '#f6c344', '#3f9be6', '#8cc8f8', '#e85bd8', '#ff3b4e', '#ff8a2a', '#3ddc84', '#7a5cff', '#ffffff'
GOLD_D, SILVER, SILVER_D = '#d99a1e', '#dfe6ee', '#9aa7b4'


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


def pts(p):
    return ' '.join(f'{f(x)},{f(y)}' for x, y in p)


def star_pts(cx, cy, R, r, n=5, rot=-90):
    out = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        rr = R if i % 2 == 0 else r
        out.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    return out


def heart_d(cx, cy, s):
    """A heart s wide, its top dip at (cx, cy - 0.2s), the tip at (cx, cy + 0.55s)."""
    P = [(0, .3), (0, -.05), (-.55, -.1), (-.55, .3), (-.55, .6), (-.2, .8), (0, 1), (.2, .8), (.55, .6), (.55, .3), (.55, -.1), (0, -.05), (0, .3)]
    q = [(cx + x * s, cy + (y - .5) * s) for x, y in P]
    d = f'M{f(q[0][0])} {f(q[0][1])}'
    for i in range(1, len(q), 3):
        d += f' C{f(q[i][0])} {f(q[i][1])} {f(q[i+1][0])} {f(q[i+1][1])} {f(q[i+2][0])} {f(q[i+2][1])}'
    return d + 'Z'


def svg(w, h, body, vb=None):
    vb = vb or f'0 0 {f(w)} {f(h)}'
    # width/height in the file so every browser rasterises it at a known size (the page draws it at 2x)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{f(w)}" height="{f(h)}">'
            f'<g stroke="{INK}" stroke-linejoin="round" stroke-linecap="round">{body}</g></svg>\n')


def quad(p0, c, p1, t):
    a = (1 - t) ** 2, 2 * (1 - t) * t, t * t
    return (a[0] * p0[0] + a[1] * c[0] + a[2] * p1[0], a[0] * p0[1] + a[1] * c[1] + a[2] * p1[1])


def quad_n(p0, c, p1, t):  # unit normal (pointing down/outward of the curve's sag)
    dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0])
    dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])
    L = math.hypot(dx, dy) or 1
    return (-dy / L, dx / L)


# Stroke letters for the word stickers: polylines in a unit box (y down)
LET = {
    'M': [[(0, 1), (0, 0), (.5, .55), (1, 0), (1, 1)]],
    'E': [[(.95, 0), (0, 0), (0, 1), (.95, 1)], [(0, .5), (.75, .5)]],
    'O': 'O',
    'W': [[(0, 0), (.22, 1), (.5, .42), (.78, 1), (1, 0)]],
    'R': [[(0, 1), (0, 0), (.62, 0), (.9, .12), (.9, .4), (.62, .52), (0, .52)], [(.45, .52), (1, 1)]],
    'U': [[(0, 0), (0, .72), (.14, .94), (.5, 1), (.86, .94), (1, .72), (1, 0)]],
    'N': [[(0, 1), (0, 0), (1, 1), (1, 0)]],
    'Z': [[(0, 0), (1, 0), (0, 1), (1, 1)]],
    '!': [[(.5, 0), (.5, .64)]],
}


def word(text, x, y, lw, lh, gap, ink_w, w_col, col):
    """Letters drawn twice: a wide ink stroke, then the colour on top (flat, like a marker tag)."""
    parts_ink, parts_col = [], []
    cx = x
    for ch in text:
        cw = lw * (.32 if ch == '!' else 1)
        if ch == 'O':
            e = f'<ellipse cx="{f(cx + cw / 2)}" cy="{f(y + lh / 2)}" rx="{f(cw / 2)}" ry="{f(lh / 2)}" fill="none"/>'
            parts_ink.append(e); parts_col.append(e)
        else:
            for line in LET[ch]:
                p = [(cx + (u - .5) * cw + cw / 2 if ch != '!' else cx + cw / 2, y + v * lh) for u, v in line]
                e = f'<polyline points="{pts(p)}" fill="none"/>'
                parts_ink.append(e); parts_col.append(e)
            if ch == '!':
                d = f'<circle cx="{f(cx + cw / 2)}" cy="{f(y + lh * .93)}" r="{f(ink_w * .18)}" stroke-width="0"/>'
                parts_ink.append(d.replace('stroke-width="0"', f'fill="{INK}" stroke-width="{f(ink_w * .5)}"'))
                parts_col.append(d.replace('stroke-width="0"', f'fill="{col}" stroke="none"'))
        cx += cw + gap
    return (f'<g stroke="{INK}" stroke-width="{f(ink_w)}">' + ''.join(parts_ink) + '</g>'
            f'<g stroke="{col}" stroke-width="{f(w_col)}">' + ''.join(parts_col) + '</g>')


DECALS = []


def add(id, name, cat, w, h, body, word_=None, fit=None, slot=None, border=None, vb=None):
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, id + '.svg'), 'w') as fh:
        fh.write(svg(w, h, body, vb))
    d = {'id': id, 'name': name, 'cat': cat, 'file': id + '.svg', 'aspect': round(w / h, 4), 'word': word_ or 'FRESH!',
         'border': cat != 'wear' if border is None else border}
    if fit:
        d['fit'] = {'u': round(fit[0] / TW, 4), 'v': round(fit[1] / TH, 4), 'w': round(w / TW, 4), 'r': fit[2] if len(fit) > 2 else 0}
        d['slot'] = slot
    DECALS.append(d)


# ================================================================== WEAR (fits Bobo; texture pixels)
# Bobo's eyes are at (258, 370) and (418, 374) on the 768 x 1024 picture; the visor band spans x 128-555,
# y 195-330 with the ears above it to y 140; the collar runs from (185, 478) dipping to (342, 515).
EYE_C = (338, 371)


def shades(lens_d_fn, frame, lens, hi, w=340, h=130, arms=True, bridge_y=44):
    b = ''
    if arms:
        b += f'<path d="M8 44 L30 36 M{w-8} 44 L{w-30} 36" fill="none" stroke-width="9"/>'
    b += f'<path d="M150 {bridge_y} Q170 {bridge_y-12} 190 {bridge_y}" fill="none" stroke-width="10"/>'
    for cx in (90, 250):
        b += lens_d_fn(cx, frame, lens, hi)
    return b


def wayfarer(cx, frame, lens, hi):
    # a rounded trapezoid lens, wider at the top, with a thick top rim
    L = [(cx - 66, 32), (cx + 66, 32), (cx + 62, 46), (cx + 56, 88), (cx + 30, 106), (cx - 30, 106), (cx - 56, 88), (cx - 64, 46)]
    d = f'M{f(cx-60)} 30 H{f(cx+60)} Q{f(cx+70)} 30 {f(cx+67)} 42 L{f(cx+58)} 86 Q{f(cx+52)} 108 {f(cx+28)} 108 H{f(cx-28)} Q{f(cx-52)} 108 {f(cx-58)} 86 L{f(cx-67)} 42 Q{f(cx-70)} 30 {f(cx-60)} 30Z'
    s = f'<path d="{d}" fill="{lens}" stroke-width="9"/>'
    s += f'<path d="M{f(cx-62)} 30 H{f(cx+62)} L{f(cx+64)} 48 H{f(cx-64)}Z" fill="{frame}" stroke-width="9"/>'
    s += f'<path d="M{f(cx-38)} 58 L{f(cx-22)} 58 L{f(cx-40)} 96 L{f(cx-50)} 92Z M{f(cx-12)} 58 L{f(cx-4)} 58 L{f(cx-20)} 94 L{f(cx-28)} 94Z" fill="{hi}" stroke="none" opacity=".85"/>'
    return s


add('shades', 'Shades', 'wear', 340, 130, shades(wayfarer, INK, '#2a2733', WHITE), 'COOL!', (EYE_C[0], EYE_C[1] + 2), 'eyes')


def star_lens(cx, frame, lens, hi):
    o = star_pts(cx, 66, 72, 34, rot=-90)
    i = star_pts(cx, 68, 48, 22, rot=-90)
    s = f'<polygon points="{pts(o)}" fill="{frame}" stroke-width="9"/>'
    s += f'<polygon points="{pts(i)}" fill="{lens}" stroke-width="6"/>'
    s += f'<path d="M{f(cx-16)} 52 L{f(cx-6)} 52 L{f(cx-20)} 80 L{f(cx-28)} 76Z" fill="{hi}" stroke="none" opacity=".9"/>'
    return s


add('star-shades', 'Star shades', 'wear', 340, 140, shades(star_lens, Y, MAG, WHITE, h=140, bridge_y=60), 'STAR!', (EYE_C[0], EYE_C[1] - 2), 'eyes')


def heart_lens(cx, frame, lens, hi):
    s = f'<path d="{heart_d(cx, 70, 150)}" fill="{frame}" stroke-width="9"/>'
    s += f'<path d="{heart_d(cx, 72, 104)}" fill="{lens}" stroke-width="6"/>'
    s += f'<path d="M{f(cx-30)} 46 Q{f(cx-38)} 56 {f(cx-34)} 70" fill="none" stroke="{hi}" stroke-width="9" opacity=".9"/>'
    return s


add('heart-shades', 'Heart shades', 'wear', 340, 140, shades(heart_lens, MAG, '#8a1f6e', WHITE, h=140, bridge_y=52), 'LOVE IT!', (EYE_C[0], EYE_C[1] + 4), 'eyes')

# ---- hats (head slot)
# crown: 300 wide, base on the visor's top edge, a little tilt
cw, ch = 300, 180
crown = (f'<path d="M20 150 L12 50 L80 96 L150 22 L220 96 L288 50 L280 150Z" fill="{Y}" stroke-width="10"/>'
         f'<rect x="16" y="128" width="268" height="40" rx="8" fill="{GOLD_D}" stroke-width="10"/>'
         f'<circle cx="12" cy="48" r="13" fill="{Y}" stroke-width="8"/><circle cx="150" cy="20" r="15" fill="{Y}" stroke-width="8"/><circle cx="288" cy="48" r="13" fill="{Y}" stroke-width="8"/>'
         f'<circle cx="80" cy="148" r="11" fill="{MAG}" stroke-width="6"/><path d="M150 134 L164 148 L150 162 L136 148Z" fill="{BLUE}" stroke-width="6"/><circle cx="220" cy="148" r="11" fill="{RED}" stroke-width="6"/>'
         f'<path d="M150 62 L178 104 L150 122 L122 104Z" fill="{RED}" stroke-width="7"/>'
         f'<path d="M40 70 L46 120" stroke="{WHITE}" stroke-width="8" opacity=".85"/>')
add('crown', 'Crown', 'wear', cw, ch, crown, 'ROYAL!', (342, 182, -0.06), 'head')

# beanie: covers the visor, ears tucked in, a pom on top
bw, bh = 470, 280
ribs = ''.join(f'<path d="M{x} 222 V262" stroke-width="5" opacity=".6"/>' for x in range(52, 430, 30))
beanie = (f'<path d="M40 228 C30 110 110 52 235 52 C360 52 440 110 430 228Z" fill="{Y}" stroke-width="10"/>'
          f'<path d="M150 74 C170 120 168 180 160 226 M235 60 V226 M320 74 C300 120 302 180 310 226" fill="none" stroke-width="6" opacity=".55"/>'
          f'<path d="M80 120 C96 96 120 82 150 74" fill="none" stroke="{WHITE}" stroke-width="12" opacity=".85"/>'
          f'<rect x="22" y="212" width="426" height="60" rx="22" fill="{BLUE}" stroke-width="10"/>' + ribs +
          f'<circle cx="235" cy="40" r="34" fill="{WHITE}" stroke-width="10"/><path d="M215 30 Q222 18 236 16" fill="none" stroke="{SKY}" stroke-width="7"/>')
add('beanie', 'Beanie', 'wear', bw, bh, beanie, 'COZY!', (342, 210), 'head')

# party hat: tilted to his left ear
pw, ph = 190, 250
stripes = ''.join(f'<path d="M{f(95 - 70 * (t))} {f(30 + 190 * t)} L{f(95 + 70 * (t))} {f(30 + 190 * t)}" stroke="{MAG}" stroke-width="20" />' for t in (.35, .62, .88))
party = (f'<clipPath id="cone"><path d="M95 30 L170 224 Q95 246 20 224Z"/></clipPath>'
         f'<path d="M95 30 L170 224 Q95 246 20 224Z" fill="{Y}" stroke-width="10"/>'
         f'<g clip-path="url(#cone)" stroke-linecap="butt">{stripes}</g>'
         f'<path d="M95 30 L170 224 Q95 246 20 224Z" fill="none" stroke-width="10"/>'
         f'<circle cx="62" cy="168" r="6" fill="{BLUE}" stroke="none"/><circle cx="118" cy="120" r="6" fill="{BLUE}" stroke="none"/><circle cx="100" cy="200" r="6" fill="{WHITE}" stroke="none"/>'
         + ''.join(f'<path d="M95 30 L{f(95 + math.cos(a) * 30)} {f(30 + math.sin(a) * 30)}" stroke="{c}" stroke-width="9"/>' for a, c in [(-2.6, BLUE), (-2.0, MAG), (-1.4, WHITE), (-0.8, BLUE), (-0.3, MAG)]) +
         f'<circle cx="95" cy="28" r="14" fill="{WHITE}" stroke-width="8"/>')
add('party-hat', 'Party hat', 'wear', pw, ph, party, 'PARTY!', (396, 150, 0.3), 'head')

# top hat
tw_, th_ = 330, 210
tophat = (f'<path d="M70 26 Q165 10 260 26 L250 168 H80Z" fill="{INK}" stroke-width="10"/>'
          f'<path d="M78 128 H252 L249 166 H81Z" fill="{MAG}" stroke-width="8"/>'
          f'<path d="M14 178 Q165 150 316 178 Q330 196 300 200 Q165 186 30 200 Q0 196 14 178Z" fill="{INK}" stroke-width="10"/>'
          f'<path d="M100 40 L104 116" stroke="{WHITE}" stroke-width="10" opacity=".55"/>'
          f'<circle cx="214" cy="146" r="10" fill="{Y}" stroke-width="5"/>')
add('top-hat', 'Top hat', 'wear', tw_, th_, tophat, 'FANCY!', (342, 132, -0.05), 'head')

# headphones: the band over his ears, cups on the sides of his head
hw, hh = 500, 300
headph = (f'<path d="M58 210 C40 60 150 20 250 20 C350 20 460 60 442 210" fill="none" stroke-width="40"/>'
          f'<path d="M58 210 C40 60 150 20 250 20 C350 20 460 60 442 210" fill="none" stroke="{BLUE}" stroke-width="22"/>'
          f'<path d="M110 70 C150 46 190 38 230 36" fill="none" stroke="{WHITE}" stroke-width="7" opacity=".85"/>'
          + ''.join(f'<rect x="{x - 40}" y="166" width="80" height="124" rx="34" fill="{Y}" stroke-width="10"/>'
                    f'<rect x="{x - 22 if x < 250 else x - 4}" y="184" width="26" height="88" rx="12" fill="{INK}" stroke="none" opacity=".25"/>' for x in (50, 450))
          + f'<path d="M30 200 L30 250" stroke="{WHITE}" stroke-width="8" opacity=".8"/>')
add('headphones', 'Headphones', 'wear', hw, hh, headph, 'VIBES!', (342, 250), 'head')

# ---- collars (neck slot). The collar curve on the picture: (185, 478) -> sag to (342, 515) -> (500, 478)
C0, CC, C1 = (185, 478), (342, 552), (500, 478)
VX, VY = 160, 452          # viewBox origin on the picture


def arc_pts(off=0.0, n=24, t0=0.0, t1=1.0):
    out = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        x, y = quad(C0, CC, C1, t)
        nx, ny = quad_n(C0, CC, C1, t)
        out.append((x - VX + nx * off, y - VY + ny * off))
    return out


def band(width, fill, w_ink=10):
    top, bot = arc_pts(-width / 2), arc_pts(width / 2)
    p = top + bot[::-1]
    return f'<polygon points="{pts(p)}" fill="{fill}" stroke-width="{w_ink}"/>'


CWV, CHV = 360, 190
spikes = ''
for i in range(1, 8):
    t = i / 8
    x, y = quad(C0, CC, C1, t); nx, ny = quad_n(C0, CC, C1, t); tx, ty = -ny, nx
    bx, by = x - VX + nx * 14, y - VY + ny * 14
    tri = [(bx - tx * 13, by - ty * 13), (bx + nx * 34, by + ny * 34), (bx + tx * 13, by + ty * 13)]
    spikes += f'<polygon points="{pts(tri)}" fill="{SILVER}" stroke-width="7"/>'
studs = ''.join(f'<circle cx="{f(quad(C0, CC, C1, t)[0] - VX)}" cy="{f(quad(C0, CC, C1, t)[1] - VY)}" r="6" fill="{SILVER}" stroke-width="4"/>' for t in [i / 8 + 1 / 16 for i in range(8)])
add('spike-collar', 'Spiked collar', 'wear', CWV, CHV, spikes + band(30, INK) + studs, 'TOUGH!', (VX + CWV / 2, VY + CHV / 2), 'neck')

# gold chain with a big B medallion
links = ''
for i in range(19):
    t = (i + .5) / 19
    x, y = quad(C0, CC, C1, t); nx, ny = quad_n(C0, CC, C1, t)
    ang = math.degrees(math.atan2(-nx, ny))
    links += (f'<ellipse cx="{f(x - VX)}" cy="{f(y - VY)}" rx="{11 if i % 2 else 9}" ry="{6 if i % 2 else 9}" transform="rotate({f(ang)} {f(x - VX)} {f(y - VY)})" '
              f'fill="{"none" if i % 2 else Y}" stroke-width="{5}"/>')
mx, my = quad(C0, CC, C1, .5)
mx -= VX; my -= VY
medal = (f'<circle cx="{f(mx)}" cy="{f(my + 58)}" r="44" fill="{Y}" stroke-width="9"/>'
         f'<circle cx="{f(mx)}" cy="{f(my + 58)}" r="32" fill="none" stroke="{GOLD_D}" stroke-width="5"/>'
         f'<path d="M{f(mx - 12)} {f(my + 38)} V{f(my + 78)} H{f(mx + 4)} Q{f(mx + 18)} {f(my + 78)} {f(mx + 18)} {f(my + 66)} Q{f(mx + 18)} {f(my + 57)} {f(mx + 6)} {f(my + 57)} Q{f(mx + 16)} {f(my + 56)} {f(mx + 16)} {f(my + 47)} Q{f(mx + 16)} {f(my + 38)} {f(mx + 2)} {f(my + 38)}Z M{f(mx - 12)} {f(my + 57)} H{f(mx + 6)}" fill="none" stroke-width="7"/>'
         f'<path d="M{f(mx - 6)} {f(my + 12)} L{f(mx)} {f(my + 14)} L{f(mx + 6)} {f(my + 12)}" fill="none" stroke-width="6"/>'
         f'<path d="M{f(mx - 30)} {f(my + 44)} Q{f(mx - 28)} {f(my + 30)} {f(mx - 16)} {f(my + 24)}" fill="none" stroke="{WHITE}" stroke-width="6" opacity=".85"/>')
add('gold-chain', 'Gold chain', 'wear', CWV, CHV + 50, links + medal, 'BLING!', (VX + CWV / 2, VY + (CHV + 50) / 2), 'neck')

# bandana: tied round his neck, the point hanging over his chest
top = arc_pts(-14)
tipx, tipy = mx, my + 120
bandana_p = top + [(C1[0] - VX - 30, C1[1] - VY + 12), (tipx, tipy), (C0[0] - VX + 30, C0[1] - VY + 12)]
dots = ''.join(f'<circle cx="{f(mx + dx)}" cy="{f(my + dy)}" r="7" fill="{WHITE}" stroke="none"/>' for dx, dy in [(-60, 26), (-20, 40), (24, 30), (64, 22), (-30, 76), (14, 72), (0, 104)])
paisley = ''.join(f'<path d="M{f(mx + dx)} {f(my + dy)} q12 -10 0 -20" fill="none" stroke="{WHITE}" stroke-width="5"/>' for dx, dy in [(-90, 30), (90, 30), (-48, 58), (46, 56)])
bandana = (f'<polygon points="{pts(bandana_p)}" fill="{RED}" stroke-width="10"/>' + dots + paisley + band(22, RED) +
           f'<path d="M{f(C1[0] - VX - 8)} {f(C1[1] - VY - 4)} l26 -14 l6 24 Z M{f(C1[0] - VX - 8)} {f(C1[1] - VY - 4)} l30 10 l-14 18 Z" fill="{RED}" stroke-width="7"/>')
add('bandana', 'Bandana', 'wear', CWV, CHV + 50, bandana, 'SWAG!', (VX + CWV / 2, VY + (CHV + 50) / 2), 'neck')

# bow tie, on the collar where the bell is
bt = (f'<path d="M80 50 L12 14 Q2 50 12 86Z" fill="{MAG}" stroke-width="10"/><path d="M80 50 L148 14 Q158 50 148 86Z" fill="{MAG}" stroke-width="10"/>'
      f'<path d="M30 34 L54 46 M30 66 L54 54 M130 34 L106 46 M130 66 L106 54" stroke-width="5" opacity=".5"/>'
      f'<rect x="64" y="32" width="32" height="36" rx="10" fill="{MAG}" stroke-width="9"/>'
      f'<path d="M22 30 L22 52" stroke="{WHITE}" stroke-width="7" opacity=".85"/>')
add('bow-tie', 'Bow tie', 'wear', 160, 100, bt, 'DAPPER!', (342, 522), 'neck')

# ================================================================== FUN (sticker art, 256 x 256)
S = 256
add('heart', 'Heart', 'fun', S, S, f'<path d="{heart_d(128, 128, 220)}" fill="{RED}" stroke-width="12"/><path d="M60 88 Q58 66 78 56" fill="none" stroke="{WHITE}" stroke-width="14" opacity=".9"/>', 'LOVE!')
add('star', 'Star', 'fun', S, S, f'<polygon points="{pts(star_pts(128, 136, 118, 52))}" fill="{Y}" stroke-width="12"/><path d="M118 70 L104 108" stroke="{WHITE}" stroke-width="12" opacity=".9"/>', 'STAR!')
add('flame', 'Flame', 'fun', S, S,
    f'<path d="M128 14 C150 64 214 92 210 168 C206 222 168 246 128 246 C86 246 46 220 46 166 C46 118 80 100 86 58 C108 76 112 104 110 122 C130 100 136 64 128 14Z" fill="{ORANGE}" stroke-width="12"/>'
    f'<path d="M130 120 C142 150 176 160 172 196 C170 222 150 232 128 232 C104 232 84 220 84 194 C84 170 104 160 108 140 C118 150 120 160 118 170 C128 160 134 140 130 120Z" fill="{Y}" stroke-width="9"/>'
    f'<path d="M70 150 Q66 124 82 108" fill="none" stroke="{WHITE}" stroke-width="11" opacity=".85"/>', 'FIRE!')
add('bolt', 'Lightning', 'fun', S, S, f'<polygon points="148,10 52,146 118,146 96,246 206,98 138,98 170,10" fill="{Y}" stroke-width="12"/><path d="M140 32 L96 98" stroke="{WHITE}" stroke-width="10" opacity=".9"/>', 'ZAP!')
add('sparkles', 'Sparkles', 'fun', S, S,
    ''.join(f'<path d="M{cx} {cy - r} Q{cx} {cy} {cx + r} {cy} Q{cx} {cy} {cx} {cy + r} Q{cx} {cy} {cx - r} {cy} Q{cx} {cy} {cx} {cy - r}Z" fill="{c}" stroke-width="10"/>'
            for cx, cy, r, c in [(104, 140, 92, Y), (200, 60, 46, SKY), (206, 196, 36, MAG)]), 'SHINY!')
add('paw', 'Paw print', 'fun', S, S,
    f'<path d="M128 132 C168 132 206 168 202 204 C198 236 162 232 128 222 C94 232 58 236 54 204 C50 168 88 132 128 132Z" fill="{BLUE}" stroke-width="12"/>'
    + ''.join(f'<ellipse cx="{x}" cy="{y}" rx="24" ry="32" transform="rotate({a} {x} {y})" fill="{BLUE}" stroke-width="11"/>' for x, y, a in [(48, 112, -24), (96, 58, -8), (160, 58, 8), (208, 112, 24)])
    + f'<path d="M92 166 Q100 152 116 148" fill="none" stroke="{WHITE}" stroke-width="10" opacity=".85"/>', 'MEOW!')
add('fish', 'Fish', 'fun', S, S * .75,
    f'<path d="M30 96 C70 30 170 30 206 96 C170 162 70 162 30 96Z" fill="{SKY}" stroke-width="12"/>'
    f'<path d="M196 96 L246 54 L240 96 L246 138Z" fill="{SKY}" stroke-width="12"/>'
    f'<path d="M106 60 C120 80 120 112 106 132 M132 64 C144 84 144 108 132 128" fill="none" stroke-width="7" opacity=".55"/>'
    f'<circle cx="68" cy="86" r="11" fill="{INK}" stroke="none"/><circle cx="64" cy="82" r="4" fill="{WHITE}" stroke="none"/>'
    f'<path d="M78 54 Q100 44 124 46" fill="none" stroke="{WHITE}" stroke-width="10" opacity=".85"/>', 'SNACK!')
add('splat', 'Paint splat', 'fun', S, S,
    f'<path d="M128 30 C150 30 150 70 170 74 C196 80 214 40 236 64 C254 84 214 104 222 128 C230 150 254 162 238 188 C222 212 196 184 176 196 C156 208 166 246 136 246 C106 246 114 210 94 202 C72 192 46 226 26 202 C8 180 44 160 38 138 C32 116 2 104 18 80 C36 54 70 84 88 70 C106 56 104 30 128 30Z" fill="{MAG}" stroke-width="12"/>'
    f'<circle cx="236" cy="230" r="12" fill="{MAG}" stroke-width="8"/><circle cx="24" cy="36" r="9" fill="{MAG}" stroke-width="7"/>'
    f'<path d="M76 110 Q82 92 100 86" fill="none" stroke="{WHITE}" stroke-width="12" opacity=".85"/>', 'SPLAT!')
add('meow', 'Meow!', 'fun', 300, 220,
    f'<path d="M30 30 H270 Q290 30 290 50 V140 Q290 160 270 160 H120 L70 206 L82 160 H30 Q10 160 10 140 V50 Q10 30 30 30Z" fill="{WHITE}" stroke-width="12"/>'
    + word('MEOW!', 36, 66, 46, 60, 10, 26, 13, BLUE), 'MEOW!')
add('wow', 'Wow', 'fun', S, S,
    f'<polygon points="{pts(star_pts(128, 128, 124, 84, n=12, rot=-90))}" fill="{Y}" stroke-width="12"/>'
    + word('WOW', 46, 100, 46, 56, 8, 26, 13, RED), 'WOW!')

# ================================================================== EVADE GAME (original icons for things in the game)
add('cola', 'Cola', 'game', 170, 256,
    f'<path d="M32 30 Q32 14 50 14 H120 Q138 14 138 30 V226 Q138 244 120 244 H50 Q32 244 32 226Z" fill="{RED}" stroke-width="12"/>'
    f'<rect x="40" y="6" width="90" height="22" rx="8" fill="{SILVER}" stroke-width="10"/>'
    f'<rect x="40" y="228" width="90" height="22" rx="8" fill="{SILVER}" stroke-width="10"/>'
    f'<path d="M32 96 Q85 76 138 104 V150 Q85 124 32 146Z" fill="{WHITE}" stroke-width="9"/>'
    f'<polygon points="96,98 66,136 86,136 74,168 108,124 88,124" fill="{Y}" stroke-width="6"/>'
    f'<path d="M50 40 V82 M50 168 V214" stroke="{WHITE}" stroke-width="12" opacity=".75"/>', 'ZOOM!')
add('jump-pad', 'Jump pad', 'game', S, 200,
    f'<ellipse cx="128" cy="150" rx="116" ry="40" fill="{INK}" stroke-width="10"/>'
    f'<ellipse cx="128" cy="136" rx="116" ry="40" fill="{GREEN}" stroke-width="10"/>'
    f'<ellipse cx="128" cy="136" rx="70" ry="22" fill="{WHITE}" stroke-width="7"/>'
    f'<path d="M128 116 V24 M96 56 L128 22 L160 56" fill="none" stroke-width="26"/><path d="M128 116 V24 M96 56 L128 22 L160 56" fill="none" stroke="{GREEN}" stroke-width="12"/>', 'BOING!')
add('speed-pad', 'Speed pad', 'game', S, 170,
    f'<rect x="10" y="28" width="236" height="120" rx="22" fill="{INK}" stroke-width="10"/>'
    f'<rect x="10" y="18" width="236" height="120" rx="22" fill="{BLUE}" stroke-width="10"/>'
    + ''.join(f'<path d="M{x} 46 L{x + 36} 78 L{x} 110" fill="none" stroke="{Y}" stroke-width="16" />' for x in (46, 102, 158))
    + f'<path d="M30 40 H70" stroke="{WHITE}" stroke-width="9" opacity=".8"/>', 'SPEED!')
add('barrier', 'Barrier', 'game', S, 200,
    f'<clipPath id="bar"><rect x="14" y="40" width="228" height="64" rx="10"/></clipPath>'
    f'<path d="M44 104 V186 M212 104 V186" stroke-width="16"/><path d="M24 188 H68 M190 188 H234" stroke-width="12"/>'
    f'<rect x="14" y="40" width="228" height="64" rx="10" fill="{Y}" stroke-width="10"/>'
    f'<g clip-path="url(#bar)">' + ''.join(f'<polygon points="{x},40 {x + 28},40 {x - 12},104 {x - 40},104" fill="{INK}" stroke="none"/>' for x in range(30, 300, 56)) + '</g>'
    f'<rect x="14" y="40" width="228" height="64" rx="10" fill="none" stroke-width="10"/>'
    f'<circle cx="44" cy="26" r="13" fill="{ORANGE}" stroke-width="8"/><circle cx="212" cy="26" r="13" fill="{ORANGE}" stroke-width="8"/>', 'BLOCKED!')
add('sensor', 'Sensor', 'game', S, S,
    f'<path d="M86 236 L128 150 L170 236Z" fill="{SILVER_D}" stroke-width="10"/>'
    f'<path d="M58 70 A84 84 0 0 0 186 186 Z" fill="{SILVER}" stroke-width="11"/>'
    f'<path d="M122 128 L172 78" stroke-width="10"/><circle cx="176" cy="74" r="12" fill="{RED}" stroke-width="8"/>'
    + ''.join(f'<path d="M{176 + r * .7} {74 - r * .7} A{r} {r} 0 0 1 {176 + r} {74}" fill="none" stroke="{GREEN}" stroke-width="10" opacity="{o}"/>' for r, o in [(34, 1), (58, .8)])
    + ''.join(f'<path d="M{176 - r} {74} A{r} {r} 0 0 1 {176 - r * .7} {74 - r * .7}" fill="none" stroke="{GREEN}" stroke-width="10" opacity="{o}"/>' for r, o in [(34, 1), (58, .8)])
    + f'<path d="M74 112 Q80 150 104 172" fill="none" stroke="{WHITE}" stroke-width="10" opacity=".85"/>', 'BEEP BEEP!')
add('teleporter', 'Teleporter', 'game', S, S,
    f'<ellipse cx="128" cy="128" rx="112" ry="112" fill="{PURPLE}" stroke-width="12"/>'
    + ''.join(f'<path d="M128 128 m{f(math.cos(a) * 20)} {f(math.sin(a) * 20)} A{r} {r} 0 0 1 {f(128 + math.cos(a + 2.2) * r)} {f(128 + math.sin(a + 2.2) * r)}" fill="none" stroke="{c}" stroke-width="{w}"/>'
              for a, r, c, w in [(0, 80, SKY, 12), (2.1, 80, SKY, 12), (4.2, 80, SKY, 12), (1, 50, WHITE, 10), (3.1, 50, WHITE, 10), (5.2, 50, WHITE, 10)])
    + f'<circle cx="128" cy="128" r="16" fill="{WHITE}" stroke-width="8"/>', 'WHOOSH!')
add('run', 'Run!', 'game', 280, 250,
    f'<path d="M140 16 L268 232 H12Z" fill="{Y}" stroke-width="14"/>'
    f'<path d="M140 64 L224 210 H56Z" fill="none" stroke-width="6" opacity=".35"/>'
    + word('RUN!', 72, 120, 40, 62, 8, 24, 12, RED), 'RUN!')

with open(os.path.join(OUT, 'decals.json'), 'w') as fh:
    json.dump({'v': 1, 'cats': [{'k': 'wear', 'n': 'Wear'}, {'k': 'fun', 'n': 'Fun'}, {'k': 'game', 'n': 'EVADE'}], 'decals': DECALS}, fh, indent=1)
print(f'{len(DECALS)} decals -> {OUT}')
