/**
 * 2D artwork: the generated wordmark logo, image loading with a taint check,
 * die-cut sticker art, procedural wood/panel textures and QR drawing. All of it
 * is canvas work so nothing here needs a network round-trip.
 */
import QRCode from "qrcode";

export const FONT_SANS = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';
export const FONT_NEON = '"Tilt Neon", "Space Grotesk", ui-sans-serif, sans-serif';

let fontsReady = null;
/** Wait (briefly) for the fonts canvas text depends on. Never blocks for long. */
export function ensureFonts() {
  if (!fontsReady) {
    const loads = [
      '700 80px "Space Grotesk"',
      '500 40px "Space Grotesk"',
      '400 80px "Tilt Neon"',
      '500 24px "JetBrains Mono"',
    ].map((f) => (document.fonts ? document.fonts.load(f).catch(() => null) : null));
    fontsReady = Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
  }
  return fontsReady;
}

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/* ---- images ---------------------------------------------------------------- */

/**
 * Load an image for printing. Remote images are requested with CORS; an image
 * that loads but would taint a canvas (no CORS headers) is rejected, because a
 * tainted texture also blocks snapshots and saved images.
 */
export function loadImage(src, { timeout = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("blob:") && !src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.decoding = "async";
    const t = setTimeout(() => reject(new Error("image timeout")), timeout);
    img.onload = () => {
      clearTimeout(t);
      try {
        const c = makeCanvas(4, 4);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 4, 4);
        ctx.getImageData(0, 0, 1, 1);
      } catch {
        reject(new Error("image is cross-origin without CORS"));
        return;
      }
      if (!img.naturalWidth) reject(new Error("empty image"));
      else resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error(`could not load ${src}`));
    };
    img.src = src;
  });
}

/** Copy an image to a canvas, trimmed to its opaque content (logos often ship with padding). */
export function trimmed(img, maxSide = 1024) {
  const s = Math.min(
    1,
    maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height),
  );
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * s));
  const h = Math.max(1, Math.round((img.naturalHeight || img.height) * s));
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return c;
  }
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 12) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return c;
  const pad = 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const out = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Contain-fit art into a canvas of the given aspect (w/h) with padding. */
export function fitToAspect(art, aspect, { size = 1024, pad = 0.04 } = {}) {
  const W = aspect >= 1 ? size : Math.round(size * aspect);
  const H = aspect >= 1 ? Math.round(size / aspect) : size;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const aw = art.width || art.naturalWidth;
  const ah = art.height || art.naturalHeight;
  const s = Math.min((W * (1 - pad * 2)) / aw, (H * (1 - pad * 2)) / ah);
  ctx.drawImage(art, (W - aw * s) / 2, (H - ah * s) / 2, aw * s, ah * s);
  return c;
}

/* ---- the generated wordmark ------------------------------------------------ */

function initials(name) {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "★";
  if (words.length === 1) return [...words[0]][0].toUpperCase();
  return ([...words[0]][0] + [...words[1]][0]).toUpperCase();
}

/**
 * A believable merch mark from a name alone: a gradient-ringed emblem with the
 * initials, the name in heavy Space Grotesk, and a small "official merch" line.
 * `tone` is "light" (white type, for dark products) or "dark" (for pale ones).
 */
export function makeWordmark(name, { accent = "#19affe", neon = "#ff37ae", tone = "light" } = {}) {
  const W = 1024;
  const H = 900;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const ink = tone === "light" ? "#ffffff" : "#14151b";
  const grad = (x0, y0, x1, y1) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, accent);
    g.addColorStop(1, neon);
    return g;
  };

  // emblem
  const cx = W / 2;
  const cy = 250;
  const R = 200;
  ctx.save();
  ctx.lineWidth = 34;
  ctx.strokeStyle = grad(cx - R, cy - R, cx + R, cy + R);
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // four small stars around the ring, the kind of detail a real merch mark has
  ctx.fillStyle = ink;
  for (const a of [Math.PI * 0.75, Math.PI * 0.25]) {
    const x = cx + Math.cos(a) * (R + 0);
    const y = cy + Math.sin(a) * (R + 0);
    star(ctx, x, y, 16, 7);
  }
  const ini = initials(name);
  let fs = ini.length > 1 ? 190 : 230;
  ctx.font = `700 ${fs}px ${FONT_SANS}`;
  while (ctx.measureText(ini).width > R * 1.45 && fs > 60) {
    fs -= 8;
    ctx.font = `700 ${fs}px ${FONT_SANS}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = grad(cx - R * 0.6, cy - R * 0.6, cx + R * 0.6, cy + R * 0.6);
  ctx.fillText(ini, cx, cy + fs * 0.04);
  ctx.restore();

  // name
  const text = name.toUpperCase();
  let size = 150;
  ctx.font = `700 ${size}px ${FONT_SANS}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  while (ctx.measureText(text).width > W * 0.94 && size > 40) {
    size -= 4;
    ctx.font = `700 ${size}px ${FONT_SANS}`;
  }
  const baseY = 520 + size * 0.72;
  ctx.fillStyle = ink;
  ctx.fillText(text, cx, baseY);

  // underline rule + small line
  const tw = Math.min(ctx.measureText(text).width, W * 0.94);
  ctx.font = `500 44px ${FONT_MONO}`;
  const small = "OFFICIAL  MERCH";
  const sw = ctx.measureText(small).width;
  const ly = baseY + 70;
  ctx.fillStyle = grad(cx - tw / 2, 0, cx + tw / 2, 0);
  ctx.fillRect(cx - tw / 2, ly - 14, (tw - sw) / 2 - 24, 8);
  ctx.fillRect(cx + sw / 2 + 24, ly - 14, (tw - sw) / 2 - 24, 8);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.85;
  ctx.fillText(small, cx, ly);
  ctx.globalAlpha = 1;
  return trimmed(c, 1024);
}

function star(ctx, x, y, r, r2) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r2 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/* ---- die-cut sticker art --------------------------------------------------- */

/**
 * A die-cut sticker from any art: the art over a white backing that follows
 * its silhouette with a generous border, the way a real kiss-cut sticker does.
 * Returns { face, edge, aspect } canvases (edge is the grey silhouette used
 * to fake the sticker's thickness).
 */
export function makeDieCut(art, { size = 512 } = {}) {
  const aw = art.width || art.naturalWidth;
  const ah = art.height || art.naturalHeight;
  const aspect = aw / ah;
  const W = aspect >= 1 ? size : Math.round(size * Math.max(aspect, 0.45));
  const H = aspect >= 1 ? Math.round(size / Math.min(aspect, 2.2)) : size;
  const border = Math.round(size * 0.05);
  const margin = border * 2 + 4;
  const s = Math.min((W - margin * 2) / aw, (H - margin * 2) / ah);
  const dw = aw * s;
  const dh = ah * s;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;

  // silhouette of the art
  const sil = makeCanvas(W, H);
  const sctx = sil.getContext("2d");
  sctx.drawImage(art, dx, dy, dw, dh);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, W, H);

  // dilate it: stamp the silhouette around a circle, then soften and re-threshold
  const dil = makeCanvas(W, H);
  const dctx = dil.getContext("2d");
  const steps = 28;
  for (const r of [border * 0.5, border]) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      dctx.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  dctx.drawImage(sil, 0, 0);
  const smooth = makeCanvas(W, H);
  const mctx = smooth.getContext("2d", { willReadFrequently: true });
  mctx.filter = `blur(${Math.max(2, border * 0.35)}px)`;
  mctx.drawImage(dil, 0, 0);
  mctx.filter = "none";
  const id = mctx.getImageData(0, 0, W, H);
  for (let i = 3; i < id.data.length; i += 4) {
    const a = id.data[i];
    id.data[i] = a > 110 ? 255 : a > 80 ? ((a - 80) / 30) * 255 : 0;
    id.data[i - 1] = id.data[i - 2] = id.data[i - 3] = 255;
  }
  mctx.putImageData(id, 0, 0);

  const face = makeCanvas(W, H);
  const fctx = face.getContext("2d");
  fctx.drawImage(smooth, 0, 0);
  fctx.drawImage(art, dx, dy, dw, dh);

  const edge = makeCanvas(W, H);
  const ectx = edge.getContext("2d");
  ectx.drawImage(smooth, 0, 0);
  ectx.globalCompositeOperation = "source-in";
  ectx.fillStyle = "#b9bcc6";
  ectx.fillRect(0, 0, W, H);
  return { face, edge, aspect: W / H };
}

/* ---- procedural textures --------------------------------------------------- */

/** Seeded PRNG so a finish looks the same on every load. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wood grain running along x. */
export function woodTexture(base, grain, { w = 1024, h = 256, seed = 7 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const r = rng(seed);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, base[0]);
  g.addColorStop(0.5, base[1]);
  g.addColorStop(1, base[0]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // broad colour bands
  for (let i = 0; i < 14; i++) {
    ctx.globalAlpha = 0.05 + r() * 0.08;
    ctx.fillStyle = r() > 0.5 ? grain : base[1];
    ctx.fillRect(0, r() * h, w, 6 + r() * 26);
  }
  // fine grain lines
  for (let i = 0; i < 150; i++) {
    const y0 = r() * h;
    const amp = 1 + r() * 6;
    const freq = 0.002 + r() * 0.01;
    const ph = r() * 10;
    ctx.globalAlpha = 0.06 + r() * 0.22;
    ctx.strokeStyle = grain;
    ctx.lineWidth = 0.6 + r() * 1.8;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph * 2) * amp * 0.3;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // a couple of cathedral arches (the flame figure in flat-sawn boards)
  for (let k = 0; k < 3; k++) {
    const cx = r() * w;
    const cy = h * (0.3 + r() * 0.4);
    ctx.strokeStyle = grain;
    for (let i = 0; i < 9; i++) {
      ctx.globalAlpha = 0.08 + r() * 0.1;
      ctx.lineWidth = 1 + r();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 60 + i * 22, 8 + i * 5, 0, Math.PI * 0.05, Math.PI * 0.95);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Fine vertical fluting for the back panel. */
export function flutedTexture(base, line, { w = 512, h = 512, flutes = 32 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const fw = w / flutes;
  for (let i = 0; i < flutes; i++) {
    const g = ctx.createLinearGradient(i * fw, 0, (i + 1) * fw, 0);
    g.addColorStop(0, "rgba(0,0,0,0.35)");
    g.addColorStop(0.18, "rgba(255,255,255,0.05)");
    g.addColorStop(0.5, "rgba(255,255,255,0.10)");
    g.addColorStop(0.82, "rgba(255,255,255,0.03)");
    g.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = g;
    ctx.fillRect(i * fw, 0, fw, h);
  }
  ctx.fillStyle = line;
  for (let i = 0; i < flutes; i++) ctx.fillRect(i * fw, 0, 1, h);
  // faint noise so large areas don't band
  const r = rng(3);
  for (let i = 0; i < 2600; i++) {
    ctx.globalAlpha = r() * 0.06;
    ctx.fillStyle = r() > 0.5 ? "#fff" : "#000";
    ctx.fillRect(r() * w, r() * h, 1, 1 + r() * 2);
  }
  ctx.globalAlpha = 1;
  return c;
}

export function radialCanvas(stops, size = 256) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Vertical light wash: bright at the top, fading down (an LED spilling onto the back panel). */
export function washCanvas(w = 128, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.12, "rgba(255,255,255,0.55)");
  g.addColorStop(0.45, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // soften the sides
  ctx.globalCompositeOperation = "destination-in";
  const s = ctx.createLinearGradient(0, 0, w, 0);
  s.addColorStop(0, "rgba(0,0,0,0)");
  s.addColorStop(0.18, "rgba(0,0,0,1)");
  s.addColorStop(0.82, "rgba(0,0,0,1)");
  s.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/* ---- QR ---------------------------------------------------------------------- */

/** Draw a real QR code into a 2D context. Returns false if the text cannot be encoded. */
export function drawQR(
  ctx,
  text,
  x,
  y,
  size,
  { dark = "#000", light = null, margin = 0, round = false } = {},
) {
  let qr;
  try {
    qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  } catch {
    return false;
  }
  const n = qr.modules.size;
  const cell = size / (n + margin * 2);
  if (light) {
    ctx.fillStyle = light;
    ctx.fillRect(x, y, size, size);
  }
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.data[r * n + c]) continue;
      const px = x + (c + margin) * cell;
      const py = y + (r + margin) * cell;
      if (round) {
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, cell * 0.46, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(px, py, Math.ceil(cell), Math.ceil(cell));
    }
  }
  return true;
}

export function qrCanvas(text, size = 256, opts = {}) {
  const c = makeCanvas(size, size);
  drawQR(c.getContext("2d"), text, 0, 0, size, { light: "#fff", margin: 2, ...opts });
  return c;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
