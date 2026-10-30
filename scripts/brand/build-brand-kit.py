"""
Builds the MEDIALIFE brand kit shown in Admin > MEDIALIFE (public/brand/kit/).

  avatar-*        circular profile pictures (animated + static)
  logo-*          animated MEDIALIFE and "Activated by MEDIALIFE" logos
  banner-*        social banners sized per platform
  call-background video-call background
  static-*        transparent PNG logos

Lettering is always the OFFICIAL artwork (public/brand/medialife-lockup.webp);
it is never re-typeset. The source is small, so it is upscaled and re-edged
(see `official_mask`). The orb and rings follow the mark in
src/components/site/Logo.tsx and public/favicon.svg. Banner copy uses
Space Grotesk / JetBrains Mono, the site's fonts (scripts/brand/fonts/, OFL).

The first frame of every animation is the finished, fully lit logo: Outlook and
any platform that freezes GIFs shows only that frame.

Run from the repo root:  python3 scripts/brand/build-brand-kit.py [name ...]
Needs Pillow, numpy and ffmpeg (for MP4 / WebM).
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "brand" / "kit"
FONTS = Path(__file__).resolve().parent / "fonts"

BG = np.array([10, 10, 18], np.float32)  # Ember Black #0A0A12
CYAN = np.array([25, 175, 254], np.float32)
MAGENTA = np.array([255, 47, 174], np.float32)
ICE = np.array([127, 212, 255], np.float32)
WHITE = np.array([255, 255, 255], np.float32)
MUTED = np.array([150, 152, 168], np.float32)

LOOP = 4.0  # seconds
REST_HOLD = 1.6  # extra hold on frame 0 in GIFs


# ---------------------------------------------------------------- timeline


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def bump(t, a, b):
    if t <= a or t >= b:
        return 0.0
    return float(np.sin(np.pi * (t - a) / (b - a)))


def beat(t):
    """Shared activation beat: gather, fire, wave, settle."""
    charge = float(smooth((t - 0.5) / 0.45) * (1 - smooth((t - 0.95) / 0.12)))
    ignite = bump(t, 0.95, 2.2)
    shocks = []
    for delay in (0.0, 0.18):
        p = (t - 0.97 - delay) / 0.9
        if 0 < p < 1:
            shocks.append(p)
    sweep = (t - 1.05) / 1.25
    return charge, ignite, shocks, sweep


# ---------------------------------------------------------------- canvas


class Canvas:
    """Premultiplied RGB + alpha, so the same scene exports opaque or transparent."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = np.zeros((h, w, 3), np.float32)
        self.a = np.zeros((h, w), np.float32)
        self.yy, self.xx = np.mgrid[0:h, 0:w].astype(np.float32)

    def over(self, color, alpha):
        a = np.clip(alpha, 0, 1)
        col = color if np.ndim(color) == 3 else np.broadcast_to(color, (self.h, self.w, 3))
        self.p = col * a[..., None] + self.p * (1 - a[..., None])
        self.a = a + self.a * (1 - a)

    def glow(self, color, alpha):
        a = np.clip(alpha, 0, None)
        col = color if np.ndim(color) == 3 else np.broadcast_to(color, (self.h, self.w, 3))
        self.p = self.p + col * a[..., None]
        # Light adds coverage in proportion to its brightness, so a glow
        # exported on transparency stays a coloured light, not a grey haze.
        self.a = self.a + np.clip(a * col.max(-1) / 255, 0, 1) * (1 - self.a)

    def dist(self, cx, cy):
        return np.hypot(self.xx - cx, self.yy - cy)

    def on(self, bg):
        """Flatten onto a solid background."""
        return np.clip(self.p + bg * (1 - self.a[..., None]), 0, 255)

    def rgba(self):
        a = np.clip(self.a, 1e-4, 1)
        c = np.clip(self.p / a[..., None], 0, 255)
        return np.dstack([c, np.clip(self.a, 0, 1) * 255])


def ember(c, cx, cy, r):
    """135deg cyan -> magenta across a box of radius r around (cx, cy)."""
    t = np.clip(((c.xx - (cx - r)) + (c.yy - (cy - r))) / (4 * r), 0, 1)[..., None]
    return CYAN * (1 - t) + MAGENTA * t


def ring(d, r, w):
    return np.clip(w / 2 + 0.5 - np.abs(d - r), 0, 1)


def soft(d, r, sigma):
    """Gaussian falloff outside radius r."""
    return np.exp(-np.clip(d - r, 0, None) ** 2 / (2 * sigma**2))


# ---------------------------------------------------------------- lettering

_LOCKUP = Image.open(ROOT / "public/brand/medialife-lockup.webp").convert("RGBA")


def official_mask(height, which="wordmark"):
    """Official lettering as a coverage mask `height` px tall.

    The supplied artwork is small, so it is upscaled 4x past the target,
    blurred just enough to melt its pixel steps, and re-edged at 50% coverage
    before coming down to size. For flat white letterforms this keeps edges
    straight and crisp instead of soft or stair-stepped.
    """
    src = _LOCKUP if which == "lockup" else _LOCKUP.crop((0, 56, _LOCKUP.width, _LOCKUP.height))
    a = src.getchannel("A")
    bbox = a.point(lambda v: 255 if v > 24 else 0).getbbox()
    a = a.crop(bbox)
    w = round(a.width * height / a.height)
    if height > a.height:
        big = a.resize((w * 4, height * 4), Image.BICUBIC)
        # Blur away the source's pixel steps, then cut a clean edge at 50%.
        big = big.filter(ImageFilter.GaussianBlur(4 * height / a.height * 0.45))
        arr = np.asarray(big, np.float32) / 255
        arr = smooth((arr - 0.42) / 0.16)
        a = Image.fromarray((arr * 255).astype(np.uint8)).resize((w, height), Image.LANCZOS)
    else:
        a = a.resize((w, height), Image.LANCZOS)
    return np.asarray(a, np.float32) / 255


def place(c, mask, x, y):
    out = np.zeros((c.h, c.w), np.float32)
    h, w = mask.shape
    x, y = int(round(x)), int(round(y))
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, c.w), min(y + h, c.h)
    out[y0:y1, x0:x1] = mask[y0 - y : y1 - y, x0 - x : x1 - x]
    return out


def blur(a, radius):
    img = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius)), np.float32) / 255


def text_mask(c, text, font, size, x, y, anchor="la", tracking=0):
    img = Image.new("L", (c.w, c.h), 0)
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(str(FONTS / font), size)
    if tracking:
        # Manual letter spacing for the mono eyebrow.
        total = sum(f.getlength(ch) for ch in text) + tracking * (len(text) - 1)
        cx = x - (total / 2 if anchor[0] == "m" else total if anchor[0] == "r" else 0)
        for ch in text:
            d.text((cx, y), ch, font=f, fill=255, anchor="l" + anchor[1])
            cx += f.getlength(ch) + tracking
    else:
        d.text((x, y), text, font=f, fill=255, anchor=anchor)
    return np.asarray(img, np.float32) / 255


class Lettering:
    """A white mask an ember wave can travel through."""

    def __init__(self, c, mask, glow_px):
        self.mask = mask
        self.glow = blur(mask, glow_px)
        xs = np.nonzero(mask.max(0) > 0.1)[0]
        self.x0, self.x1 = (xs.min(), xs.max()) if len(xs) else (0, c.w)

    def draw(self, c, sweep, band_px, rest_glow=0.18, color=WHITE):
        col = np.broadcast_to(color, (c.h, c.w, 3)).copy()
        c.glow(np.array([60, 60, 110], np.float32), self.glow * rest_glow)
        if 0 < sweep < 1.25:
            head = self.x0 - band_px * 0.5 + smooth(min(sweep, 1)) * (self.x1 - self.x0 + band_px * 1.3)
            fade = 1 - smooth((sweep - 0.9) / 0.35)
            u = (head - c.xx) / band_px
            band = np.where((u > -0.12) & (u < 1), np.sin(np.pi * np.clip((u + 0.12) / 1.12, 0, 1)), 0) * fade
            mix = np.clip(u, 0, 1)[..., None]
            wave = CYAN * (1 - mix) + MAGENTA * mix
            col = col * (1 - band[..., None]) + wave * band[..., None]
            c.glow(wave * 0.75, self.glow * band)
        c.over(col, self.mask)


# ---------------------------------------------------------------- the orb


def orb(c, cx, cy, s, t, core=True, halo=True, bloom=1.0, ring_w=None):
    """The MEDIALIFE mark at scale s (s=1: ring radius 40px) and time t."""
    charge, ignite, shocks, _ = beat(t)
    d = c.dist(cx, cy)
    grad = ember(c, cx, cy, 58 * s)
    ring_r, ring_w = 40 * s, ring_w or 5.0 * s
    core_r = 21 * s * (1 - 0.18 * charge + 0.14 * ignite)

    c.glow(grad * 0.55, soft(d, 0, (core_r + 8 * s) * 0.9) * (0.30 + 0.25 * charge + 0.55 * ignite) * bloom)
    for p in shocks:
        r = ring_r + smooth(p) * 150 * s
        c.glow(grad, ring(d, r, (3.0 + 6 * (1 - p)) * s) * (1 - p) ** 1.6 * 0.85)
    if halo:
        c.over(grad, ring(d, 58 * s, 2.4 * s) * (0.32 + 0.4 * ignite))
    c.over(grad, ring(d, ring_r, ring_w))
    c.glow(grad * 0.6, np.exp(-((d - ring_r) ** 2) / (2 * (ring_w + 2 * s) ** 2)) * (0.25 + 0.4 * charge + 0.9 * ignite))
    if core:
        dd = np.hypot(c.xx - cx, c.yy - cy + core_r * 0.16) / max(core_r, 1)
        k = dd[..., None]
        col = np.where(k < 0.55, ICE * (1 - k / 0.55) + CYAN * (k / 0.55), CYAN * (1 - (k - 0.55) / 0.45) + MAGENTA * ((k - 0.55) / 0.45))
        col = col + (WHITE - col) * (0.45 * charge + 0.35 * ignite)
        c.over(np.clip(col, 0, 255), np.clip(core_r + 0.5 - d, 0, 1))
        sx, sy = cx - core_r * 0.33, cy - core_r * 0.36
        c.over(WHITE, np.clip(core_r * 0.27 + 0.5 - c.dist(sx, sy), 0, 1) * 0.55)


def backdrop(c, cx, cy, r, strength=1.0):
    """Ember Black with a faint ember light pooled around (cx, cy)."""
    c.over(BG, np.ones((c.h, c.w), np.float32))
    d = c.dist(cx, cy)
    c.glow(ember(c, cx, cy, r) * 0.10 * strength, np.exp(-(d**2) / (2 * (r * 0.9) ** 2)))


def echo_rings(c, cx, cy, radii, width, alpha):
    d = c.dist(cx, cy)
    grad = ember(c, cx, cy, max(radii))
    for i, r in enumerate(radii):
        c.over(grad, ring(d, r, width) * alpha * (0.85 ** i))


# ---------------------------------------------------------------- export


def frames(render, fps):
    n = round(LOOP * fps)
    return [render(i / fps) for i in range(n)]


def save_gif(path, rgb_frames, fps, corner_mask=None):
    sample_idx = [0, round(1.0 * fps), round(1.3 * fps), round(1.7 * fps), round(2.1 * fps)]
    strip = Image.fromarray(np.vstack([rgb_frames[i] for i in sample_idx]).astype(np.uint8))
    pal_img = strip.quantize(255, method=Image.Quantize.MEDIANCUT)
    pal = pal_img.getpalette()[: 255 * 3] + [0, 0, 0]
    out = []
    for f in rgb_frames:
        q = Image.fromarray(f.astype(np.uint8)).quantize(palette=pal_img, dither=Image.Dither.NONE)
        if corner_mask is not None:
            arr = np.asarray(q).copy()
            arr[corner_mask] = 255
            q = Image.fromarray(arr, "P")
        q.putpalette(pal)
        out.append(q)
    dur = [round(1000 / fps)] * len(out)
    dur[0] += round(REST_HOLD * 1000)
    kw = dict(transparency=255) if corner_mask is not None else {}
    out[0].save(path, save_all=True, append_images=out[1:], duration=dur, loop=0, disposal=1, optimize=True, **kw)


def save_video(path, rgb_frames, fps, alpha=None):
    """MP4 (H.264) for opaque frames; WebM (VP9 + alpha) when alpha frames are given."""
    h, w = rgb_frames[0].shape[:2]
    hold = round(REST_HOLD * fps)
    seq = [rgb_frames[0]] * hold + list(rgb_frames)
    aseq = None if alpha is None else [alpha[0]] * hold + list(alpha)
    with tempfile.TemporaryDirectory() as tmp:
        for i, f in enumerate(seq):
            if aseq is None:
                Image.fromarray(f.astype(np.uint8)).save(f"{tmp}/{i:04d}.png")
            else:
                Image.fromarray(np.dstack([f, aseq[i]]).astype(np.uint8), "RGBA").save(f"{tmp}/{i:04d}.png")
        if aseq is None:
            args = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "slow", "-movflags", "+faststart"]
            if w % 2 or h % 2:
                args = ["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"] + args
        else:
            args = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-auto-alt-ref", "0"]
        # Three loops so it plays smoothly where the platform does not loop video.
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "2", "-framerate", str(fps), "-i", f"{tmp}/%04d.png", *args, str(path)],
            check=True,
        )


def save_png(path, arr):
    mode = "RGBA" if arr.shape[2] == 4 else "RGB"
    Image.fromarray(arr.astype(np.uint8), mode).save(path, optimize=True)


def circle_mask(size):
    big = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(big).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    return np.asarray(big.resize((size, size), Image.LANCZOS), np.float32) / 255


# ---------------------------------------------------------------- assets


def avatar_wordmark(size):
    """MEDIALIFE inside the ring: the favicon with the name at its heart."""
    c0 = Canvas(size, size)
    k = size / 1080
    word = Lettering(c0, place(c0, *_centered(official_mask(round(94 * k)), size, size)), 10 * k)

    def render(t):
        c = Canvas(size, size)
        backdrop(c, size / 2, size / 2, size * 0.42, 1.4)
        charge, ignite, shocks, sweep = beat(t)
        d = c.dist(size / 2, size / 2)
        grad = ember(c, size / 2, size / 2, size * 0.45)
        R = 392 * k
        c.glow(grad * 0.5, np.exp(-(d**2) / (2 * (250 * k) ** 2)) * (0.16 + 0.18 * charge + 0.35 * ignite))
        for p in shocks:
            r = R * (0.55 + 0.75 * smooth(p))
            c.glow(grad, ring(d, r, (6 + 14 * (1 - p)) * k) * (1 - p) ** 1.6 * 0.9)
        c.over(grad, ring(d, R + 70 * k, 4 * k) * (0.28 + 0.4 * ignite))
        c.over(grad, ring(d, R, 22 * k))
        c.glow(grad * 0.6, np.exp(-((d - R) ** 2) / (2 * (24 * k) ** 2)) * (0.25 + 0.4 * charge + 0.9 * ignite))
        word.draw(c, sweep, 360 * k, rest_glow=0.25)
        return c.on(BG)

    return render


def _centered(mask, w, h, dx=0, dy=0):
    return mask, (w - mask.shape[1]) / 2 + dx, (h - mask.shape[0]) / 2 + dy


def avatar_mark(size):
    """The favicon orb on its own: reads at 32px where a name can't."""

    def render(t):
        c = Canvas(size, size)
        backdrop(c, size / 2, size / 2, size * 0.4, 1.2)
        orb(c, size / 2, size / 2, size / 160, t)
        return c.on(BG)

    return render


def horizontal_logo(w, h, which):
    """Orb + official lettering, left to right. which: wordmark | lockup."""
    s = h / 160
    c0 = Canvas(w, h)
    lh = round((100 if which == "lockup" else 64) * s)
    mask = official_mask(lh, which)
    x = 170 * s
    lettering = Lettering(c0, place(c0, mask, x, (h - lh) / 2), 6 * s)

    def render(t):
        c = Canvas(w, h)
        orb(c, 80 * s, h / 2, s, t)
        lettering.draw(c, beat(t)[3], 110 * s)
        return c

    return render, round(x + mask.shape[1] + 40 * s)


# Platform banners. safe = (x0, y0, x1, y1) box that is visible everywhere and
# clear of the profile picture; art = where the orb and echo rings sit.
BANNERS = {
    "linkedin": dict(size=(1584, 396), safe=(560, 70, 1330, 330), art=(1440, 198), label="LinkedIn profile"),
    "linkedin-page": dict(size=(1128, 191), safe=(330, 30, 900, 165), art=(1010, 96), label="LinkedIn company page"),
    "x": dict(size=(1500, 500), safe=(470, 110, 1250, 400), art=(1360, 250), label="X (Twitter) header"),
    "youtube": dict(size=(2560, 1440), safe=(507, 509, 1953, 931), art=(1880, 720), label="YouTube channel art"),
    "facebook": dict(size=(1640, 624), safe=(300, 150, 1340, 474), art=(1250, 312), label="Facebook cover"),
    "discord": dict(size=(960, 540), safe=(90, 150, 870, 400), art=(760, 275), label="Discord server banner"),
    "discord-profile": dict(size=(680, 240), safe=(40, 40, 640, 200), art=(560, 120), label="Discord profile banner"),
}


def banner(name):
    b = BANNERS[name]
    W, H = b["size"]
    x0, y0, x1, y1 = b["safe"]
    ax, ay = b["art"]
    sh = y1 - y0
    c0 = Canvas(W, H)

    s = min(H / 396, W / 1584) * 1.9 if name != "youtube" else 3.2
    radii = [s * r for r in (95, 150, 215, 290, 375)]
    # Copy stays left of the orb's halo and inside the safe box.
    room = min(x1, ax - 80 * s) - x0

    # Type scales with the safe box height; tall boxes get the headline.
    word_h = round(sh * 0.22)
    word = official_mask(word_h)
    if word.shape[1] > room * 0.7:
        word_h = round(word_h * room * 0.7 / word.shape[1])
        word = official_mask(word_h)
    tall = sh >= 200
    lead, hot = "We turn fandom touchpoints into ", "immersive media."
    head_size = round(sh * 0.13)
    medium = FONTS / "SpaceGrotesk-Medium.ttf"
    while tall and ImageFont.truetype(str(medium), head_size).getlength(lead + hot) > room:
        head_size -= 1
    gap = round(sh * 0.08)
    url_size = max(11, round(sh * 0.055))
    blocks = word_h + (gap + head_size * 1.05 if tall else 0) + gap + url_size
    top = y0 + (sh - blocks) / 2
    lx = x0
    lettering = Lettering(c0, place(c0, word, lx, top), max(3, word_h / 14))
    y = top + word_h + gap
    head = None
    if tall:
        f = ImageFont.truetype(str(medium), head_size)
        hx0 = lx + f.getlength(lead)
        hx1 = hx0 + f.getlength(hot)
        t = np.clip((c0.xx - hx0) / max(hx1 - hx0, 1), 0, 1)[..., None]
        head = (text_mask(c0, lead, medium.name, head_size, lx, y),
                text_mask(c0, hot, medium.name, head_size, hx0, y),
                CYAN * (1 - t) + MAGENTA * t)
        y += head_size * 1.05 + gap
    url = text_mask(c0, "MEDIALIFE.AI  ·  IMMERSIVE FORMAT PRODUCTION STUDIO" if tall else "MEDIALIFE.AI",
                    "JetBrainsMono-Medium.ttf", url_size, lx, y, tracking=round(url_size * 0.22))

    def render(t):
        c = Canvas(W, H)
        backdrop(c, ax, ay, H * 0.9, 1.6)
        echo_rings(c, ax, ay, radii, max(1.2, s * 1.1), 0.22)
        orb(c, ax, ay, s, t)
        lettering.draw(c, beat(t)[3], word_h * 3)
        if head:
            c.over(WHITE * 0.92, head[0])
            c.over(head[2], head[1])
        c.over(MUTED, url)
        return c.on(BG)

    return render, b


def call_background():
    W, H = 1920, 1080
    word = official_mask(54)
    c0 = Canvas(W, H)
    lettering = Lettering(c0, place(c0, word, W - 96 - word.shape[1], 84), 4)
    url = text_mask(c0, "MEDIALIFE.AI", "JetBrainsMono-Medium.ttf", 20, W - 96, 84 + 54 + 22, anchor="ra", tracking=5)
    c = Canvas(W, H)
    backdrop(c, W * 0.82, H * 0.62, H * 0.9, 1.4)
    echo_rings(c, W * 0.82, H * 0.62, [140, 230, 330, 440, 560, 690], 1.6, 0.18)
    orb(c, W * 0.82, H * 0.62, 2.4, 0)
    lettering.draw(c, -1, 1)
    c.over(MUTED, url)
    return c.on(BG)


# ---------------------------------------------------------------- build


def build_avatars():
    for name, maker in (("avatar-medialife", avatar_wordmark), ("avatar-mark", avatar_mark)):
        hi = maker(1080)
        f0 = hi(0)
        save_png(OUT / f"{name}.png", f0)
        cm = circle_mask(1080)
        save_png(OUT / f"{name}-circle.png", np.dstack([f0, cm * 255]))
        save_video(OUT / f"{name}.mp4", frames(maker(720), 25), 25)
        save_gif(OUT / f"{name}.gif", frames(maker(400), 20), 20)


def build_logos():
    for which, name in (("wordmark", "logo-medialife"), ("lockup", "logo-activated")):
        for h, suffix, fps in ((320, "", 20),):
            render, w = horizontal_logo(10_000, h, which)
            render, w = horizontal_logo(w, h, which)
            canv = [render(i / fps) for i in range(round(LOOP * fps))]
            save_gif(OUT / f"{name}.gif", [c.on(BG) for c in canv], fps)
            save_png(OUT / f"{name}.png", canv[0].rgba())
        render, w = horizontal_logo(10_000, 400, which)
        render, w = horizontal_logo(w, 400, which)
        canv = [render(i / 25) for i in range(round(LOOP * 25))]
        save_video(OUT / f"{name}.mp4", [c.on(BG) for c in canv], 25)
        rgba = [c.rgba() for c in canv]
        save_video(OUT / f"{name}-transparent.webm", [f[..., :3] for f in rgba], 25, alpha=[f[..., 3] for f in rgba])


def build_banners():
    for name in BANNERS:
        render, b = banner(name)
        save_png(OUT / f"banner-{name}.png", render(0))
        if name.startswith("discord"):
            save_gif(OUT / f"banner-{name}.gif", frames(render, 20), 20)


def build_static():
    save_png(OUT / "call-background.png", call_background())
    for which, name in (("wordmark", "medialife"), ("lockup", "activated-by-medialife")):
        m = official_mask(250 if which == "wordmark" else 360, which)
        for tone, rgb in (("white", 255), ("black", 0)):
            save_png(OUT / f"static-{name}-{tone}.png", np.dstack([np.full(m.shape + (3,), rgb), m * 255]))
    c = Canvas(1024, 1024)
    orb(c, 512, 512, 1024 / 150, 0)
    save_png(OUT / "static-mark.png", c.rgba())


STEPS = {"avatars": build_avatars, "logos": build_logos, "banners": build_banners, "static": build_static}

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for step in sys.argv[1:] or STEPS:
        STEPS[step]()
    for f in sorted(OUT.iterdir()):
        print(f"{f.name:44} {f.stat().st_size / 1024:8.0f} KB")
