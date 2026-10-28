/**
 * EVADE art for the stage, composed only from the supplied art files
 * (bobo-cat, eclipse-can) plus type and procedural shapes: the prints on the
 * future-drop garments, the desk-mat layout, the shelf-lip labels and the
 * floating can sprites. Exposes a `kit` with the interface products.js reads.
 */
import { makeCanvas, roundRect, FONT_SANS, FONT_MONO, fitToAspect } from "/merch-shelf/art.js";

export const GOLD = "#f6c344";
export const CYAN = "#36e6ff";

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

function fitText(ctx, text, maxW, size, weight = 700, family = FONT_SANS) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 8) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

/** The EVADE wordmark as type: gold on a dark plate, the splash's lockup. */
function wordmark(ctx, cx, cy, w, { sub = "COLA RUN", plate = true } = {}) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const s = fitText(ctx, "EVADE", w * 0.86, Math.round(w * 0.3), 700);
  const h = s * 1.1;
  if (plate) {
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h * 0.16);
    ctx.fillStyle = "#0b0d12";
    ctx.fill();
    ctx.lineWidth = Math.max(2, w * 0.012);
    ctx.strokeStyle = GOLD;
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, cy - s / 2, 0, cy + s / 2);
  g.addColorStop(0, "#ffe27a");
  g.addColorStop(1, "#f0a91e");
  ctx.fillStyle = g;
  ctx.fillText("EVADE", cx, cy + s * 0.04);
  if (sub) {
    const ss = fitText(ctx, sub, w * 0.86, Math.round(s * 0.6), 700);
    const sy = cy + h / 2 + ss * 0.85;
    ctx.fillStyle = GOLD;
    ctx.fillText(sub, cx, sy);
  }
  ctx.restore();
}

/** Back print: one art piece, large, with the EVADE lockup under it. */
function backPrint(art, aspect, { sub }) {
  const W = aspect >= 1 ? 1024 : Math.round(1024 * aspect);
  const H = aspect >= 1 ? Math.round(1024 / aspect) : 1024;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const aw = art.width;
  const ah = art.height;
  // Budget the whole print (art + EVADE plate + sub line) inside the canvas, so a short,
  // wide zone like the hoodie's back never crops the lockup. The plate is at most 0.33×its
  // width tall and the sub line hangs ~0.25×width below it.
  const pad = H * 0.02;
  const gap = H * 0.03;
  const lockW = Math.min(W * 0.62, (H * 0.3) / 0.6);
  const lockH = lockW * 0.6;
  const room = H - pad * 2 - gap - lockH;
  const s = Math.min((W * 0.9) / aw, room / ah);
  const top = (H - (ah * s + gap + lockH)) / 2;
  ctx.drawImage(art, (W - aw * s) / 2, top, aw * s, ah * s);
  wordmark(ctx, W / 2, top + ah * s + gap + lockW * 0.165, lockW, { sub });
  return c;
}

/** The desk mat: the Cola Run splash rebuilt from the art: grid floor, glow, cans, Bobo, lockup. */
function deskmatPrint(bobo, can, aspect) {
  const W = 1024;
  const H = Math.round(W / Math.max(0.5, aspect));
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1c2a33");
  bg.addColorStop(1, "#0a1016");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // perspective grid
  ctx.strokeStyle = "rgba(54,230,255,0.28)";
  ctx.lineWidth = 2;
  const hz = H * 0.55;
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + i * 18, hz);
    ctx.lineTo(W / 2 + i * 150, H);
    ctx.stroke();
  }
  for (let k = 0; k < 8; k++) {
    const y = hz + (H - hz) * Math.pow(k / 7, 1.8);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // glow ring
  ctx.save();
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = "rgba(120,240,255,0.95)";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(W * 0.5, H * 0.86, W * 0.2, H * 0.06, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // cans
  const cans = [
    [0.13, 0.32, 0.17, -0.5],
    [0.86, 0.3, 0.2, 0.35],
    [0.25, 0.7, 0.12, 0.3],
    [0.78, 0.72, 0.13, -0.3],
  ];
  for (const [x, y, sz, rot] of cans) {
    const h = H * sz * 1.6;
    const w = (h * can.width) / can.height;
    ctx.save();
    ctx.translate(W * x, H * y);
    ctx.rotate(rot);
    ctx.shadowColor = CYAN;
    ctx.shadowBlur = 26;
    ctx.drawImage(can, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
  // Bobo
  const bh = H * 0.56;
  const bw = (bh * bobo.width) / bobo.height;
  ctx.drawImage(bobo, W / 2 - bw / 2, H * 0.84 - bh, bw, bh);
  wordmark(ctx, W / 2, H * 0.15, W * 0.34, { sub: "COLA RUN" });
  return c;
}

/** Shelf-lip label (replaces the shelf's price tag; the stage never shows prices). */
export function lipLabel(text, { live = false } = {}) {
  const W = 720;
  const H = 112;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d");
  roundRect(ctx, 3, 3, W - 6, H - 6, 18);
  ctx.fillStyle = live ? "#111317" : "rgba(16,20,26,0.92)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = live ? GOLD : "rgba(54,230,255,0.55)";
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  // a status dot
  ctx.fillStyle = live ? GOLD : CYAN;
  ctx.beginPath();
  ctx.arc(52, H / 2, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = live ? "#ffe9a8" : "#bff7ff";
  fitText(ctx, text, W - 140, 46, 600, FONT_MONO);
  ctx.fillText(text, W / 2 + 22, H / 2 + 2);
  return c;
}

/** A soft glow behind a floating can sprite. */
export function glowSprite(art, color = CYAN) {
  const pad = Math.round(Math.max(art.width, art.height) * 0.18);
  const c = makeCanvas(art.width + pad * 2, art.height + pad * 2);
  const ctx = c.getContext("2d");
  ctx.shadowColor = color;
  ctx.shadowBlur = pad * 0.8;
  ctx.drawImage(art, pad, pad);
  ctx.shadowBlur = pad * 0.3;
  ctx.drawImage(art, pad, pad);
  return c;
}

/** The kit products.js expects (front/back/sleeve/toneFor/logo/badge). */
export function makeEvadeKit({ bobo, can }) {
  const toneFor = (hex) => (lum(hex) > 0.5 ? "dark" : "light");
  const front = (p) => (p.type === "hoodie" ? can : bobo);
  const kit = {
    key: "evade",
    isWordmark: false,
    toneFor,
    logo: () => bobo,
    badge: () => can,
    front,
    back: (p, aspect, { bleed = false } = {}) => {
      if (p.type === "deskmat") return deskmatPrint(bobo, can, aspect);
      if (p.type === "hoodie") return backPrint(can, aspect, { sub: "COLA RUN" });
      return backPrint(bobo, aspect, { sub: "COLA RUN" });
    },
    sleeve: () => fitToAspect(bobo, 0.3),
    name: "EVADE",
    handle: "",
    accent: CYAN,
    neon: GOLD,
  };
  return kit;
}
