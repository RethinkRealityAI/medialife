/**
 * The art kit: everything printed on the merch, resolved once per config.
 *
 *   logo     creator.logo (URL or a local file from "Make it yours"), trimmed;
 *            or a wordmark generated from the name when there is none / it fails
 *   front    product.print ?? logo     (apparel: small, left chest)
 *   back     product.backPrint, framed  (apparel: large back panel)
 *            ?? the logo set large on a framed accent panel, like the lineup
 *
 * Images are cached by URL so a live re-render in the admin preview does not
 * re-download anything.
 */
import {
  loadImage,
  trimmed,
  makeWordmark,
  makeCanvas,
  roundRect,
  ensureFonts,
  FONT_MONO,
  FONT_SANS,
  FONT_NEON,
  rng,
} from "./art.js";
import { luminance } from "./config.js";

const imageCache = new Map();
/** URL → trimmed canvas, or null when the image can't be used. */
export function loadArt(url) {
  if (!url) return Promise.resolve(null);
  if (!imageCache.has(url)) {
    imageCache.set(
      url,
      loadImage(url)
        .then((img) => trimmed(img, 1400))
        .catch((e) => {
          console.warn("[shelf] artwork unavailable, using the wordmark:", url, e.message);
          return null;
        }),
    );
  }
  return imageCache.get(url);
}

const mixHex = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

/** Light grain/cracks so a print reads as screen-printed and washed, not as a sticker. */
export function distress(canvas, amount = 0.22, seed = 5) {
  const ctx = canvas.getContext("2d");
  const r = rng(seed);
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const n = Math.round((canvas.width * canvas.height) / 900);
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = r() * amount;
    const s = 1 + r() * 3.5;
    ctx.fillRect(r() * canvas.width, r() * canvas.height, s, s * (0.5 + r()));
  }
  // a few hairline cracks
  ctx.globalAlpha = amount * 0.9;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#000";
  for (let i = 0; i < 26; i++) {
    let x = r() * canvas.width;
    let y = r() * canvas.height;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 30;
      y += (r() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

/** Embroidery look for the cap: diagonal satin stitches inside the art, with a raised shadow. */
export function embroider(art) {
  const pad = 12;
  const c = makeCanvas(art.width + pad * 2, art.height + pad * 2);
  const ctx = c.getContext("2d");
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.drawImage(art, pad, pad);
  ctx.shadowColor = "transparent";
  ctx.globalCompositeOperation = "source-atop";
  const step = Math.max(3, Math.round(c.width / 140));
  ctx.lineWidth = step * 0.5;
  for (let i = -c.height; i < c.width; i += step) {
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + c.height, c.height);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.moveTo(i + step * 0.5, 0);
    ctx.lineTo(i + step * 0.5 + c.height, c.height);
    ctx.stroke();
  }
  return c;
}

/**
 * The lineup's signature back print: a framed rectangular art panel.
 * With artwork (backPrint) the art fills the frame; without, the creator's
 * logo is set large on a deep panel in the accent colour.
 */
export function backPanel({ art, userArt, name, handle, accent, neon, aspect, size = 1024 }) {
  const W = aspect >= 1 ? size : Math.round(size * aspect);
  const H = aspect >= 1 ? Math.round(size / aspect) : size;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const m = Math.round(Math.min(W, H) * 0.035);
  if (userArt) {
    // cover-fit the artwork inside a thin frame
    ctx.fillStyle = "#0d0d10";
    ctx.fillRect(0, 0, W, H);
    const s = Math.max((W - m * 2) / userArt.width, (H - m * 2) / userArt.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(m, m, W - m * 2, H - m * 2);
    ctx.clip();
    ctx.drawImage(
      userArt,
      (W - userArt.width * s) / 2,
      (H - userArt.height * s) / 2,
      userArt.width * s,
      userArt.height * s,
    );
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = Math.max(3, m * 0.3);
    ctx.strokeRect(m * 0.5, m * 0.5, W - m, H - m);
    return distress(c, 0.18, 9);
  }
  // panel
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, mixHex(accent, "#000000", 0.5));
  g.addColorStop(1, mixHex(neon, "#000000", 0.62));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // halftone sun behind the mark
  const cx = W / 2;
  const cy = H * 0.47;
  const R = Math.min(W, H) * 0.42;
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  const dot = Math.max(6, Math.round(W / 64));
  for (let y = dot / 2; y < H; y += dot) {
    for (let x = dot / 2; x < W; x += dot) {
      const d = Math.hypot(x - cx, y - cy) / R;
      if (d > 1.25) continue;
      const rr = (dot / 2) * Math.max(0, 1 - d * 0.8);
      if (rr < 0.6) continue;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // speed lines, the anime-panel staple
  const r = rng(name.length + 3);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    ctx.lineWidth = 1 + r() * 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
    ctx.lineTo(cx + Math.cos(a) * W, cy + Math.sin(a) * W);
    ctx.stroke();
  }
  // the mark
  const maxW = W * 0.78;
  const maxH = H * 0.56;
  const s = Math.min(maxW / art.width, maxH / art.height);
  ctx.drawImage(
    art,
    cx - (art.width * s) / 2,
    cy - (art.height * s) / 2,
    art.width * s,
    art.height * s,
  );
  // frame + typography
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(3, m * 0.28);
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  ctx.lineWidth = Math.max(1.5, m * 0.1);
  ctx.strokeRect(m * 1.7, m * 1.7, W - m * 3.4, H - m * 3.4);
  const fs = Math.round(W * 0.034);
  ctx.font = `500 ${fs}px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(`${name.toUpperCase()} / 001`, m * 2.6, m * 2.6);
  ctx.textAlign = "right";
  ctx.fillText("ACTIVATED", W - m * 2.6, m * 2.6);
  ctx.textBaseline = "bottom";
  ctx.fillText((handle || "SCAN ME").toUpperCase(), W - m * 2.6, H - m * 2.6);
  ctx.textAlign = "left";
  ctx.fillText("◉ NFC · QR", m * 2.6, H - m * 2.6);
  return distress(c, 0.2, 4);
}

export function sleeveArt({ name, tone }) {
  const W = 300;
  const H = 1100;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.translate(W / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = tone === "light" ? "#f4f2ec" : "#16171c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let fs = 170;
  ctx.font = `700 ${fs}px ${FONT_SANS}`;
  const text = name.toUpperCase();
  while (ctx.measureText(text).width > H * 0.86 && fs > 40) {
    fs -= 6;
    ctx.font = `700 ${fs}px ${FONT_SANS}`;
  }
  ctx.fillText(text, 0, -fs * 0.12);
  ctx.font = `500 ${Math.round(fs * 0.28)}px ${FONT_MONO}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText("ACTIVATED · SCAN THE TAG", 0, fs * 0.62);
  return distress(c, 0.2, 6);
}

/** A round badge sticker: gradient disc, initials or logo in white. */
export function badgeArt({ name, logo, accent, neon }) {
  const S = 640;
  const c = makeCanvas(S, S);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, accent);
  g.addColorStop(1, neon);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.41, 0, Math.PI * 2);
  ctx.stroke();
  const s = Math.min((S * 0.58) / logo.width, (S * 0.5) / logo.height);
  ctx.drawImage(
    logo,
    S / 2 - (logo.width * s) / 2,
    S / 2 - (logo.height * s) / 2,
    logo.width * s,
    logo.height * s,
  );
  // ring text
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.round(S * 0.05)}px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const label = `${name.toUpperCase()} · ACTIVATED · `;
  const chars = [...label.repeat(2)].slice(0, 44);
  chars.forEach((ch, i) => {
    const a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(S / 2 + Math.cos(a) * S * 0.445, S / 2 + Math.sin(a) * S * 0.445);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  return c;
}

/** A mini neon-sign sticker: the name in tube lettering on a dark plate. */
export function neonPlateArt({ name, neon }) {
  const probe = makeCanvas(8, 8).getContext("2d");
  const fs = 150;
  probe.font = `400 ${fs}px ${FONT_NEON}`;
  const tw = Math.min(1400, probe.measureText(name).width);
  const W = Math.round(tw + 160);
  const H = 300;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  roundRect(ctx, 6, 6, W - 12, H - 12, 60);
  ctx.fillStyle = "#101118";
  ctx.fill();
  ctx.font = probe.font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = neon;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 12;
  ctx.strokeText(name, W / 2, H / 2 + 6, W - 120);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.fillText(name, W / 2, H / 2 + 6, W - 120);
  return c;
}

/**
 * Build the art kit for a config.
 * @param {object} config ShelfConfig
 * @param {{ localLogo?: HTMLCanvasElement|null }} opts a logo dropped in by the visitor
 */
export async function makeArtKit(config, { localLogo = null } = {}) {
  await ensureFonts();
  const { name, handle } = config.creator;
  const { accent, neon } = config.theme;
  let userLogo = localLogo || (await loadArt(config.creator.logo));
  const wordmarks = {};
  const wordmark = (tone) => (wordmarks[tone] ||= makeWordmark(name, { accent, neon, tone }));
  const prints = new Map();
  await Promise.all(
    config.products
      .flatMap((p) => [p.print, p.backPrint])
      .filter(Boolean)
      .map(async (u) => prints.set(u, await loadArt(u))),
  );

  /** "light" art for dark products, "dark" for pale ones. */
  const toneFor = (hex) => (luminance(hex) > 0.35 ? "dark" : "light");

  const kit = {
    key: `${name}|${handle}|${accent}|${neon}|${config.creator.logo || ""}|${localLogo ? "local" : ""}`,
    isWordmark: !userLogo,
    hasLocalLogo: !!localLogo,
    toneFor,
    logo: (tone = "light") => userLogo || wordmark(tone),
    /** Front / chest art for a product in a given colour. */
    front: (p, hex = p.color) => (p.print && prints.get(p.print)) || kit.logo(toneFor(hex)),
    /** The back panel canvas at a zone aspect. */
    back: (p, aspect) =>
      backPanel({
        art: kit.logo("light"),
        userArt: (p.backPrint && prints.get(p.backPrint)) || null,
        name,
        handle,
        accent,
        neon,
        aspect,
      }),
    /** Vertical sleeve print: the name set sideways, like the lineup's sleeve type. */
    sleeve: (tone = "light") => sleeveArt({ name, tone }),
    badge: () => badgeArt({ name, logo: kit.logo("light"), accent, neon }),
    neonPlate: () => neonPlateArt({ name, neon }),
    name,
    handle,
    accent,
    neon,
  };
  return kit;
}
