// The 2D frame art laid over photos, drawn the same way on screen (an overlay canvas) and into the saved photo, so
// what you frame is what you get. Never mirrored: the selfie underneath is the mirror image, the art reads the right
// way. EVADE frames (code-drawn, flat colours, EVADE's own logo and a three.js render of the real Bobo model):
//   hideout  a slate screen bezel with yellow arcade corner brackets and a cyan inner line (Bobo's Hideout's screens)
//   arcade   an arcade cabinet: a marquee on top ("BOBO'S ARCADE" with bulbs), BOBO OS colour bars down the sides
//   bobo     Bobo himself sitting in the bottom-left corner, peeking into your photo
//   clean    just the brand strip
// The brand strip (every frame, saved photos only): EVADE logo + "Bobo's Hideout" on a dark glass tab, and the
// "Activated by MEDIALIFE" badge. Filters (natural, gold, eclipse, mono) are plain per-pixel colour maps, so they work
// the same on every phone (no canvas `filter`).
import { loadImage } from './ui';
import { BRAND, EV } from '../../evade/brand/brand';

export type FrameStyle = 'hideout' | 'arcade' | 'bobo' | 'clean';
export type PhotoFilter = 'natural' | 'gold' | 'eclipse' | 'mono';
export const FRAME_STYLES: Array<{ id: FrameStyle; label: string }> = [
  { id: 'hideout', label: 'Hideout' }, { id: 'arcade', label: 'Arcade' }, { id: 'bobo', label: 'Bobo' }, { id: 'clean', label: 'Clean' },
];
export const PHOTO_FILTERS: Array<{ id: PhotoFilter; label: string }> = [
  { id: 'natural', label: 'Natural' }, { id: 'gold', label: 'Gold' }, { id: 'eclipse', label: 'Eclipse' }, { id: 'mono', label: 'Mono' },
];

const BOBO = '/evade/hub/img/bobo/bobo-sit.webp';

let art: Promise<void> | null = null;
let logo: HTMLImageElement | null = null;
let actBy: HTMLImageElement | null = null;
let bobo: HTMLImageElement | null = null;

export function loadFrameArt(): Promise<void> {
  if (!art) {
    const font = document.fonts?.load('italic 900 40px "Exo 2"').catch(() => null) ?? Promise.resolve(null);
    art = Promise.all([loadImage(BRAND.logo), loadImage(BRAND.activatedBy), loadImage(BOBO), font]).then(([a, b, c]) => {
      logo = a; actBy = b; bobo = c;
    });
  }
  return art;
}

export interface FrameSpec {
  /** Draw the brand strip (EVADE lockup + Activated by MEDIALIFE). */
  title: boolean;
  /** Lockup width as a share of the picture width. */
  titleWidth?: number;
  /** (kept for callers) */
  titleTop?: number;
  /** Which corner the lockup goes in (default bottom right; the frame with Bobo in it keeps bottom right too). */
  titleAt?: 'top' | 'bottom-left' | 'bottom-right';
  frame?: FrameStyle;
  filter?: PhotoFilter;
  /** On screen while framing: only the decoration that never covers you (no brand strip). */
  live?: boolean;
}

export function applyFilter(g: CanvasRenderingContext2D, w: number, h: number, f: PhotoFilter): void {
  if (f === 'natural') return;
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i], gg = p[i + 1], b = p[i + 2];
    if (f === 'gold') { r = r * 1.08 + 10; gg = gg * 1.03 + 4; b = b * 0.84; }
    else if (f === 'eclipse') { const l = 0.3 * r + 0.59 * gg + 0.11 * b; r = l * 0.55 + r * 0.2; gg = l * 0.7 + gg * 0.15 + 6; b = l * 0.85 + b * 0.25 + 26; }
    else if (f === 'mono') { const l = 0.3 * r + 0.59 * gg + 0.11 * b; r = gg = b = (l - 128) * 1.14 + 128; }
    p[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    p[i + 1] = gg < 0 ? 0 : gg > 255 ? 255 : gg;
    p[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  g.putImageData(d, 0, 0);
}

/** Small seeded random, so a frame draws the same every time (live view and the saved photo match). */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

function brackets(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, len: number, lw: number, col: string): void {
  g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'square'; g.lineJoin = 'miter';
  for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
    g.beginPath(); g.moveTo(cx, cy + sy * len); g.lineTo(cx, cy); g.lineTo(cx + sx * len, cy); g.stroke();
  }
}

/** Hideout: a slate bezel, a thin cyan line inside it, yellow corner brackets, a few pixel "stars" in the corners. */
function hideoutFrame(g: CanvasRenderingContext2D, w: number, h: number, live: boolean): void {
  const m = Math.min(w, h), b = Math.round(m * 0.04);
  g.fillStyle = EV.slate;
  g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
  const l = Math.max(2, Math.round(m * 0.006));
  g.fillStyle = EV.cyan;
  g.fillRect(b, b, w - 2 * b, l); g.fillRect(b, h - b - l, w - 2 * b, l); g.fillRect(b, b, l, h - 2 * b); g.fillRect(w - b - l, b, l, h - 2 * b);
  const inset = b + m * 0.03;
  brackets(g, inset, inset, w - inset, h - inset, m * 0.09, Math.max(3, m * 0.014), EV.yellow);
  const R = rng(7);
  for (let i = 0; i < (live ? 6 : 12); i++) {
    const corner = i % 4, cx = corner % 2 ? w - inset - m * 0.12 * R() - m * 0.04 : inset + m * 0.12 * R() + m * 0.04;
    const cy = corner < 2 ? inset + m * 0.12 * R() + m * 0.05 : h - inset - m * 0.12 * R() - m * 0.05;
    const s = m * (0.008 + R() * 0.01);
    g.fillStyle = i % 3 ? EV.cyan : EV.yellow;
    g.fillRect(cx, cy, s, s);
  }
}

/** Arcade: a marquee band on top with chasing bulbs and the name, the BOBO OS colours as flat bars down each side,
 *  and a control-panel band at the bottom. */
function arcadeFrame(g: CanvasRenderingContext2D, w: number, h: number, live: boolean): void {
  const m = Math.min(w, h);
  const top = Math.round(m * 0.16), side = Math.round(m * 0.035), bot = Math.round(m * 0.05);
  g.fillStyle = EV.slate;
  g.fillRect(0, 0, w, top); g.fillRect(0, h - bot, w, bot);
  // side bars: the hideout's app colours, flat stripes
  const cols = [EV.red, EV.orange, EV.yellow, EV.green, EV.cyan, EV.blue, EV.violet, EV.pink];
  const seg = (h - top - bot) / cols.length;
  cols.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(0, top + i * seg, side, Math.ceil(seg));
    g.fillRect(w - side, top + (cols.length - 1 - i) * seg, side, Math.ceil(seg));
  });
  // yellow line under the marquee
  g.fillStyle = EV.yellow; g.fillRect(0, top - Math.max(3, m * 0.008), w, Math.max(3, m * 0.008));
  // bulbs
  const n = Math.max(9, Math.round(w / (m * 0.06)));
  for (let i = 0; i < n; i++) {
    const x = (w * (i + 0.5)) / n;
    g.fillStyle = i % 2 ? EV.yellow : '#fff3c4';
    g.beginPath(); g.arc(x, top * 0.14, m * 0.009, 0, Math.PI * 2); g.fill();
  }
  // the name
  g.fillStyle = EV.yellow; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 900 ${Math.round(top * 0.42)}px "Exo 2", "Arial Black", sans-serif`;
  g.fillText("BOBO'S ARCADE", w / 2, top * 0.6, w * 0.9);
  if (!live) {
    // control panel dots on the bottom band (a stick and two buttons, left)
    g.fillStyle = EV.cyan; g.beginPath(); g.arc(side + m * 0.06, h - bot / 2, bot * 0.26, 0, Math.PI * 2); g.fill();
    g.fillStyle = EV.pink; g.beginPath(); g.arc(side + m * 0.13, h - bot / 2, bot * 0.22, 0, Math.PI * 2); g.fill();
    g.fillStyle = EV.yellow; g.beginPath(); g.arc(side + m * 0.19, h - bot / 2, bot * 0.22, 0, Math.PI * 2); g.fill();
  }
}

/** Bobo: the render of the real model sitting in the bottom-left corner, plus a few flat sparkles near him. */
function boboFrame(g: CanvasRenderingContext2D, w: number, h: number, live: boolean): void {
  if (!bobo) return;
  const m = Math.min(w, h);
  const bh = h * (w > h ? 0.62 : 0.36), bw = bh * (bobo.naturalWidth / bobo.naturalHeight);
  g.drawImage(bobo, -bw * 0.06, h - bh * 0.98, bw, bh);
  const R = rng(19);
  for (let i = 0; i < (live ? 3 : 5); i++) {
    const x = bw * (0.85 + R() * 0.3), y = h - bh * (0.5 + R() * 0.5), s = m * (0.018 + R() * 0.014);
    g.fillStyle = i % 2 ? EV.cyan : EV.yellow;
    g.beginPath();
    g.moveTo(x, y - s); g.lineTo(x + s * 0.28, y - s * 0.28); g.lineTo(x + s, y); g.lineTo(x + s * 0.28, y + s * 0.28);
    g.lineTo(x, y + s); g.lineTo(x - s * 0.28, y + s * 0.28); g.lineTo(x - s, y); g.lineTo(x - s * 0.28, y - s * 0.28);
    g.closePath(); g.fill();
  }
}

/** The EVADE lockup (logo over "BOBO'S HIDEOUT") on a dark glass tab, `w` wide, top-left at (x, y). Returns its height. */
export function drawLockup(g: CanvasRenderingContext2D, x: number, y: number, w: number): number {
  const hgt = lockupHeight(w);
  const p = w * 0.07;
  g.fillStyle = 'rgba(15, 21, 25, 0.78)';
  g.beginPath(); g.roundRect(x, y, w, hgt, w * 0.07); g.fill();
  const inner = w - 2 * p;
  let yy = y + p;
  if (logo) {
    const lh = inner * (logo.naturalHeight / logo.naturalWidth);
    g.drawImage(logo, x + p, yy, inner, lh);
    yy += lh + w * 0.04;
  }
  g.fillStyle = EV.cyan; g.textAlign = 'center'; g.textBaseline = 'top';
  g.font = `italic 900 ${Math.round(w * 0.105)}px "Exo 2", "Arial Black", sans-serif`;
  g.fillText("BOBO'S HIDEOUT", x + w / 2, yy, inner);
  return hgt;
}
function lockupHeight(w: number): number {
  const p = w * 0.07, inner = w - 2 * p;
  const lh = logo ? inner * (logo.naturalHeight / logo.naturalWidth) : 0;
  return p + lh + w * 0.04 + w * 0.12 + p;
}

/** "Activated by MEDIALIFE" (white art) on a small dark tab, `w` wide. Returns its height. */
function drawActivated(g: CanvasRenderingContext2D, x: number, y: number, w: number): number {
  if (!actBy) return 0;
  const p = w * 0.08, ih = (w - 2 * p) * (actBy.naturalHeight / actBy.naturalWidth), hgt = ih + 2 * p;
  g.fillStyle = 'rgba(15, 21, 25, 0.72)';
  g.beginPath(); g.roundRect(x, y, w, hgt, w * 0.08); g.fill();
  g.drawImage(actBy, x + p, y + p, w - 2 * p, ih);
  return hgt;
}

export function drawFrameArt(g: CanvasRenderingContext2D, w: number, h: number, s: FrameSpec): void {
  if (s.filter) applyFilter(g, w, h, s.filter);
  const frame = s.frame ?? 'hideout';
  const live = !!s.live;
  if (frame === 'hideout') hideoutFrame(g, w, h, live);
  else if (frame === 'arcade') arcadeFrame(g, w, h, live);
  else if (frame === 'bobo') boboFrame(g, w, h, live);
  if (!s.title || live) return;
  const m = Math.min(w, h);
  const edge = frame === 'hideout' ? m * 0.075 : frame === 'arcade' ? m * 0.075 : m * 0.035;
  const lw = w * (s.titleWidth ?? 0.26), lh = lockupHeight(lw);
  // the lockup bottom right (or left / top when asked); Activated by MEDIALIFE in the opposite bottom corner,
  // except the Bobo frame, where Bobo has the left corner: it sits under the lockup
  const left = s.titleAt === 'bottom-left' && frame !== 'bobo';
  const lx = left ? edge : w - lw - edge;
  const ly = s.titleAt === 'top' ? edge : h - lh - edge;
  const aw = lw * 0.62;
  if (frame === 'bobo') {
    const ah = actBy ? (aw - 2 * aw * 0.08) * (actBy.naturalHeight / actBy.naturalWidth) + 2 * aw * 0.08 : 0;
    drawLockup(g, lx, ly - ah - m * 0.012, lw);
    drawActivated(g, w - aw - edge, h - ah - edge, aw);
    return;
  }
  drawLockup(g, lx, ly, lw);
  const ah = actBy ? (aw - 2 * aw * 0.08) * (actBy.naturalHeight / actBy.naturalWidth) + 2 * aw * 0.08 : 0;
  drawActivated(g, left ? w - aw - edge : edge, h - ah - edge, aw);
}
