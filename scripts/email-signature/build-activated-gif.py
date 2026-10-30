"""
Builds the "Activated by MEDIALIFE" email-signature badge.

Outputs (public/email/):
  activated-by-medialife.gif  animated badge, 600x160 (shown at 300x80 for retina)
  activated-by-medialife.png  static fallback, identical to the GIF's first frame

The wordmark is the OFFICIAL lockup (public/brand/medialife-lockup.webp) and is
never re-typeset; only light is drawn over it. The orb is the brand mark from
src/components/site/Logo.tsx and public/favicon.svg.

Frame 0 is the fully lit resting state on purpose: Outlook desktop (2007-2019)
shows only the first frame of a GIF, so it must read as a finished logo.

Run from the repo root:  python3 scripts/email-signature/build-activated-gif.py
Needs Pillow and numpy.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "email"

W, H = 600, 160
SS = 3  # supersampling for the vector parts
FPS = 20
DURATION = 4.0  # seconds per loop
REST_HOLD_MS = 1600  # extra hold on the resting frame, so the loop feels calm

BG = np.array([11, 12, 17], np.float32)
CYAN = np.array([25, 175, 254], np.float32)
MAGENTA = np.array([255, 47, 174], np.float32)
WHITE = np.array([255, 255, 255], np.float32)
RADIUS = 22

ORB = (80, 80)
RING_R, RING_W = 40, 5.0
HALO_R, HALO_W = 58, 2.4
CORE_R = 21

LOCK_H = 100
LOCK_X, LOCK_Y = 170, 31

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)


def ember(x, y):
    """135deg cyan -> magenta, mapped across the orb's box."""
    t = ((x - (ORB[0] - HALO_R)) + (y - (ORB[1] - HALO_R))) / (4 * HALO_R)
    t = np.clip(t, 0, 1)[..., None]
    return CYAN * (1 - t) + MAGENTA * t


def ring_alpha(r, width):
    """Anti-aliased ring coverage at radius r with stroke width."""
    d = np.hypot(xx - ORB[0], yy - ORB[1])
    return np.clip(width / 2 + 0.5 - np.abs(d - r), 0, 1)


def disc_alpha(r):
    d = np.hypot(xx - ORB[0], yy - ORB[1])
    return np.clip(r + 0.5 - d, 0, 1)


def blur(a, radius):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255


def over(base, color, alpha):
    a = np.clip(alpha, 0, 1)[..., None]
    return base * (1 - a) + color * a


def add(base, color, alpha):
    return base + color * np.clip(alpha, 0, None)[..., None]


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def bump(t, a, b):
    """0 outside [a,b], smooth 0->1->0 inside."""
    if t <= a or t >= b:
        return 0.0
    u = (t - a) / (b - a)
    return float(np.sin(np.pi * u))


# Official lockup, white on alpha -> coverage mask
lock = Image.open(ROOT / "public/brand/medialife-lockup.webp").convert("RGBA")
lw = round(lock.width * LOCK_H / lock.height)
lock = lock.resize((lw, LOCK_H), Image.LANCZOS)
lock_mask = np.zeros((H, W), np.float32)
lock_mask[LOCK_Y:LOCK_Y + LOCK_H, LOCK_X:LOCK_X + lw] = np.asarray(lock, np.float32)[..., 3] / 255
lock_glow = blur(lock_mask, 6)
LOCK_X1 = LOCK_X + lw

# Rounded-corner badge mask (supersampled)
big = Image.new("L", (W * SS, H * SS), 0)
ImageDraw.Draw(big).rounded_rectangle((0, 0, W * SS - 1, H * SS - 1), RADIUS * SS, fill=255)
badge = np.asarray(big.resize((W, H), Image.LANCZOS), np.float32) / 255

orb_grad = ember(xx, yy)


def frame(t):
    """t in seconds within the loop."""
    img = np.broadcast_to(BG, (H, W, 3)).copy()

    charge = smooth((t - 0.5) / 0.45) * (1 - smooth((t - 0.95) / 0.12))  # core gathers
    ignite = bump(t, 0.95, 2.2)  # the flash after ignition
    sweep_t = (t - 1.05) / 1.25  # energy wave across the wordmark

    # Ambient bloom behind the orb, brighter when it fires
    bloom_a = 0.30 + 0.25 * charge + 0.55 * ignite
    img = add(img, orb_grad * 0.55, blur(disc_alpha(CORE_R + 8), 14) * bloom_a)

    # Shockwaves: two rings leave the orb on ignition
    for delay in (0.0, 0.18):
        p = (t - 0.97 - delay) / 0.9
        if 0 < p < 1:
            r = RING_R + smooth(p) * 150
            a = (1 - p) ** 1.6 * 0.85
            img = add(img, orb_grad, ring_alpha(r, 3.0 + 6 * (1 - p)) * a)

    # Halo and primary ring
    img = over(img, orb_grad, ring_alpha(HALO_R, HALO_W) * (0.32 + 0.4 * ignite))
    img = over(img, orb_grad, ring_alpha(RING_R, RING_W))
    img = add(img, orb_grad * 0.6, blur(ring_alpha(RING_R, RING_W), 3) * (0.4 * charge + 0.9 * ignite))

    # Core: contracts while charging, pops on ignition
    core_r = CORE_R * (1 - 0.18 * charge + 0.14 * ignite)
    d = np.hypot(xx - ORB[0], yy - ORB[1] + core_r * 0.16) / max(core_r, 1)
    core_col = np.where(
        d[..., None] < 0.55,
        np.array([127, 212, 255], np.float32) * (1 - d[..., None] / 0.55) + CYAN * (d[..., None] / 0.55),
        CYAN * (1 - (d[..., None] - 0.55) / 0.45) + MAGENTA * ((d[..., None] - 0.55) / 0.45),
    )
    core_col = core_col + (WHITE - core_col) * (0.45 * charge + 0.35 * ignite)
    img = over(img, np.clip(core_col, 0, 255), disc_alpha(core_r))
    # Specular highlight
    sx, sy = ORB[0] - core_r * 0.33, ORB[1] - core_r * 0.36
    spec = np.clip(core_r * 0.27 + 0.5 - np.hypot(xx - sx, yy - sy), 0, 1)
    img = over(img, WHITE, spec * 0.55)

    # Wordmark: white at rest; an ember wave travels left to right through it
    word_col = np.broadcast_to(WHITE, (H, W, 3)).copy()
    if 0 < sweep_t < 1.25:
        head = LOCK_X - 60 + smooth(min(sweep_t, 1)) * (LOCK_X1 - LOCK_X + 140)
        fade = 1 - smooth((sweep_t - 0.9) / 0.35)
        u = (head - xx) / 110  # 0 at the wave front, 1 at its tail
        band = np.where((u > -0.12) & (u < 1), np.sin(np.pi * np.clip((u + 0.12) / 1.12, 0, 1)), 0) * fade
        mix = np.clip(u, 0, 1)[..., None]
        wave = CYAN * (1 - mix) + MAGENTA * mix
        word_col = word_col * (1 - band[..., None]) + wave * band[..., None]
        img = add(img, wave * 0.75, lock_glow * band)
    # Resting glow under the wordmark, so it sits in the same light as the orb
    img = add(img, np.array([60, 60, 110], np.float32) * 0.18, lock_glow)
    img = over(img, word_col, lock_mask)

    return np.clip(img, 0, 255)


def to_rgba(rgb):
    a = (badge * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb.astype(np.uint8), a]), "RGBA")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    n = round(DURATION * FPS)
    frames = [frame(i / FPS) for i in range(n)]

    rest = to_rgba(frames[0])
    rest.save(OUT / "activated-by-medialife.png", optimize=True)

    # One shared palette (built from rest + peak frames) so colours never flicker
    sample = [frames[0], frames[round(1.2 * FPS)], frames[round(1.6 * FPS)], frames[round(2.0 * FPS)]]
    strip = Image.fromarray(np.vstack(sample).astype(np.uint8)).quantize(255, method=Image.Quantize.MEDIANCUT)
    pal = strip.getpalette()[: 255 * 3] + [0, 0, 0]  # index 255 = transparent corners

    corner = badge < 0.5
    gif_frames = []
    for f in frames:
        p = Image.fromarray(f.astype(np.uint8)).quantize(palette=strip, dither=Image.Dither.NONE)
        arr = np.asarray(p).copy()
        arr[corner] = 255
        q = Image.fromarray(arr, "P")
        q.putpalette(pal)
        gif_frames.append(q)

    durations = [round(1000 / FPS)] * n
    durations[0] += REST_HOLD_MS
    gif_frames[0].save(
        OUT / "activated-by-medialife.gif",
        save_all=True,
        append_images=gif_frames[1:],
        duration=durations,
        loop=0,
        transparency=255,
        disposal=1,
        optimize=True,
    )
    for f in ("activated-by-medialife.gif", "activated-by-medialife.png"):
        print(f, (OUT / f).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
