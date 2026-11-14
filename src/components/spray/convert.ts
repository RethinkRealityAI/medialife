// Spray Bobo CMS: turning uploads into what the AR engine and the paint canvas need. Runs in the admin's
// browser (canvas), the server checks sizes and types and stores the result (src/lib/spray/server.ts).
//
// For a flat ("PLANAR") image target the open-source 8th Wall engine needs only a 480x640 greyscale
// picture and a JSON file: it finds the feature points on the phone at run time. So "compiling" a target
// is: frame the picture 3:4, make the greyscale copy, check it has enough detail to track (`trackability`).

import { feather } from "./auto-mask";

export const PAINT_W = 768;
export const PAINT_H = 1024;
const LUM_W = 480;
const LUM_H = 640;
const PRINT_MAX_H = 1600;

export type Fit = "pad" | "crop";
/** How the upload sits in the 3:4 frame (fractions of the source picture), so overlays line up. */
export type Frame = { sw: number; sh: number; x: number; y: number; w: number; h: number };

export const loadImage = (src: string | Blob) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.decoding = "async";
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const done = () => {
      if (url !== src) URL.revokeObjectURL(url);
    };
    i.onload = () => {
      done();
      res(i);
    };
    i.onerror = () => {
      done();
      rej(new Error("We couldn't open that picture. Use a JPG, PNG or WebP file."));
    };
    i.crossOrigin = "anonymous";
    i.src = url;
  });

export const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

export const toBlob = (c: HTMLCanvasElement, type: "image/jpeg" | "image/png", q = 0.92) =>
  new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), type, q),
  );

/** The 3:4 frame for a picture: padded (whole picture, bars added) or cropped (fills, centre kept). */
export function frameFor(sw: number, sh: number, fit: Fit): Frame {
  const a = sw / sh;
  let w: number, h: number;
  if (a > 0.75 === (fit === "pad")) {
    w = sw;
    h = sw / 0.75;
  } else {
    h = sh;
    w = sh * 0.75;
  }
  return { sw, sh, w, h, x: (sw - w) / 2, y: (sh - h) / 2 };
}

/** Draw an image into the frame at the given size; `bg` fills the padding (none: transparent). */
export function drawFramed(
  img: CanvasImageSource,
  f: Frame,
  W: number,
  H: number,
  bg: string | null,
) {
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
  }
  const k = W / f.w;
  g.imageSmoothingQuality = "high";
  g.drawImage(img, -f.x * k, -f.y * k, f.sw * k, f.sh * k);
  return c;
}

/** The colour of the picture's border (for padding: the bars should look like the background). */
export function edgeColour(img: HTMLImageElement): string {
  const c = canvas(64, 64);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data;
  let r = 0,
    gg = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < 64; i++)
    for (const [x, y] of [
      [i, 0],
      [i, 63],
      [0, i],
      [63, i],
    ]) {
      const j = (y * 64 + x) * 4;
      if (d[j + 3] < 128) continue;
      r += d[j];
      gg += d[j + 1];
      b += d[j + 2];
      n++;
    }
  if (!n) return "#eceef0";
  const h = (v: number) =>
    Math.round(v / n)
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(gg)}${h(b)}`;
}

export type TargetBuild = {
  frame: Frame;
  colour: HTMLCanvasElement; // 3:4, up to 1600 px tall
  lum: HTMLCanvasElement; // 480x640 grey
  grey: Uint8Array; // the same, one byte per pixel
  track: Trackability;
};

/** A side of the merch → its tracked picture (3:4 colour copy, the greyscale copy the engine tracks, a score). */
export function buildTarget(img: HTMLImageElement, fit: Fit, sharpen = true): TargetBuild {
  const f = frameFor(img.naturalWidth, img.naturalHeight, fit);
  const bg = edgeColour(img);
  // a multiple of 4 tall, so the colour picture is exactly 3:4
  const H = Math.max(4, Math.min(PRINT_MAX_H, Math.round(f.h / 4) * 4));
  const colour = drawFramed(img, f, (H / 4) * 3, H, bg);
  const lum = canvas(LUM_W, LUM_H);
  const g = lum.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(colour, 0, 0, LUM_W, LUM_H);
  const d = g.getImageData(0, 0, LUM_W, LUM_H);
  let grey: Uint8Array = new Uint8Array(LUM_W * LUM_H);
  for (let i = 0; i < grey.length; i++)
    grey[i] = Math.round(
      0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2],
    );
  if (sharpen) grey = unsharp(grey, LUM_W, LUM_H);
  for (let i = 0; i < grey.length; i++) {
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = grey[i];
    d.data[i * 4 + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return { frame: f, colour, lum, grey, track: trackability(grey, LUM_W, LUM_H) };
}

/** A light unsharp mask (the build script does the same): crisper corners for the engine. */
function unsharp(a: Uint8Array, w: number, h: number, amount = 0.9): Uint8Array {
  const b = boxBlur(a, w, h, 2);
  const o = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++)
    o[i] = Math.max(0, Math.min(255, Math.round(a[i] + (a[i] - b[i]) * amount)));
  return o;
}
function boxBlur(a: Uint8Array | Float32Array, w: number, h: number, r: number): Float32Array {
  const t = new Float32Array(a.length),
    o = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += a[y * w + xx];
          n++;
        }
      }
      t[y * w + x] = s / n;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += t[yy * w + x];
          n++;
        }
      }
      o[y * w + x] = s / n;
    }
  return o;
}

export type Trackability = {
  /** 0..100 */
  score: number;
  label: "Great" | "Good" | "Weak" | "Poor";
  /** Corner points found (in 480x640 px) — drawn on the preview. */
  points: [number, number][];
  /** Share of the picture's 6x8 grid cells that have enough corners. */
  spread: number;
  contrast: number;
  advice: string[];
};

/** The word for a trackability score (the same cut-offs everywhere a score is shown). */
export const scoreLabel = (score: number): Trackability["label"] =>
  score >= 80 ? "Great" : score >= 62 ? "Good" : score >= 30 ? "Weak" : "Poor";

/**
 * How well the engine is likely to hold this picture: corners (Shi-Tomasi, at half size), how evenly
 * they spread over the picture, and contrast. Calibrated on the keychain targets (which track well on
 * phones) and on flat / low-detail pictures (which don't).
 */
export function trackability(grey: Uint8Array, w: number, h: number): Trackability {
  const W = w >> 1,
    H = h >> 1;
  const s = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      s[y * W + x] =
        (grey[2 * y * w + 2 * x] +
          grey[2 * y * w + 2 * x + 1] +
          grey[(2 * y + 1) * w + 2 * x] +
          grey[(2 * y + 1) * w + 2 * x + 1]) /
        4;
  const sm = boxBlur(s, W, H, 1);
  const xx = new Float32Array(W * H),
    yy = new Float32Array(W * H),
    xy = new Float32Array(W * H);
  let mean = 0;
  for (let i = 0; i < sm.length; i++) mean += sm[i];
  mean /= sm.length;
  let vari = 0;
  for (let i = 0; i < sm.length; i++) vari += (sm[i] - mean) ** 2;
  const contrast = Math.sqrt(vari / sm.length);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = (sm[i + 1] - sm[i - 1]) / 2,
        gy = (sm[i + W] - sm[i - W]) / 2;
      xx[i] = gx * gx;
      yy[i] = gy * gy;
      xy[i] = gx * gy;
    }
  const A = boxBlur(xx, W, H, 2),
    B = boxBlur(yy, W, H, 2),
    C = boxBlur(xy, W, H, 2);
  const R = new Float32Array(W * H);
  for (let i = 0; i < R.length; i++) {
    const tr = A[i] + B[i],
      det = A[i] * B[i] - C[i] * C[i];
    R[i] = tr / 2 - Math.sqrt(Math.max(0, (tr * tr) / 4 - det)); // smaller eigenvalue
  }
  const TH = 6; // calibrated: corners a phone camera will still see
  const pts: [number, number][] = [];
  const NM = 4;
  for (let y = 4; y < H - 4; y++)
    for (let x = 4; x < W - 4; x++) {
      const v = R[y * W + x];
      if (v < TH) continue;
      let max = true;
      for (let dy = -NM; dy <= NM && max; dy++)
        for (let dx = -NM; dx <= NM; dx++)
          if ((dx || dy) && R[(y + dy) * W + x + dx] > v) {
            max = false;
            break;
          }
      if (max) pts.push([x * 2, y * 2]);
    }
  const GX = 6,
    GY = 8,
    cells = new Uint16Array(GX * GY);
  for (const [x, y] of pts)
    cells[
      Math.min(GY - 1, Math.floor((y / h) * GY)) * GX + Math.min(GX - 1, Math.floor((x / w) * GX))
    ]++;
  let good = 0;
  for (const c of cells) if (c >= 3) good++;
  const spread = good / cells.length;
  // Calibrated on the keychain targets (120-160 corners, half the cells: phones hold them well), a
  // simple logo on a flat background (few corners, bunched: weak) and flat colour / soft gradients
  // (no corners: poor). The square root rewards the first corners most: going from 0 to 50 matters
  // far more than going from 150 to 200.
  const nScore = Math.sqrt(Math.min(1, pts.length / 200));
  const sScore = Math.sqrt(Math.min(1, spread / 0.55));
  const cScore = Math.min(1, contrast / 45);
  const score = Math.round(100 * (0.45 * nScore + 0.4 * sScore + 0.15 * cScore));
  const label = scoreLabel(score);
  const advice: string[] = [];
  if (pts.length < 90)
    advice.push(
      "Not much detail: flat colour and smooth shapes are hard for the camera to follow. Pictures with lettering, outlines and texture work best.",
    );
  if (spread < 0.35)
    advice.push(
      "The detail is bunched in one area: crop closer to the print, or keep more of a detailed background.",
    );
  if (contrast < 25)
    advice.push("Low contrast: use a sharper, evenly lit picture of the real print.");
  return { score, label, points: pts, spread, contrast, advice };
}

// ---------------------------------------------------------------- the canvas overlay
/** Whether a picture has see-through parts (at least 1% of it). */
export function hasTransparency(img: HTMLImageElement): boolean {
  const c = canvas(128, 128);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 128, 128);
  const d = g.getImageData(0, 0, 128, 128).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 128) n++;
  return n > 128 * 128 * 0.01;
}

export type LinesMode = "art" | "edge" | "none" | "upload";

export type CanvasBuild = {
  mask: HTMLCanvasElement; // 768x1024, white where paintable
  lines: HTMLCanvasElement | null; // 768x1024, ink lines
  outline: [number, number][]; // die-cut line, fractions
  coverage: number;
};

/**
 * Where an uploaded overlay sits on the target picture when it doesn't line up by itself: moved by x, y
 * (fractions of the picture's width and height), scaled by s around the middle and turned by r degrees.
 * Baked into the saved files, so nothing that shows the canvas needs to know about it.
 */
export type Place = { x: number; y: number; s: number; r: number };
export const PLACE0: Place = { x: 0, y: 0, s: 1, r: 0 };
export const isPlaced = (p: Place) => p.x !== 0 || p.y !== 0 || p.s !== 1 || p.r !== 0;

/** The tracking upload's frame, scaled to another picture exported from the same file. */
export function frameOn(frame: Frame, img: { naturalWidth: number; naturalHeight: number }): Frame {
  const k = img.naturalWidth / frame.sw;
  return {
    sw: img.naturalWidth,
    sh: img.naturalHeight,
    x: frame.x * k,
    y: frame.y * k,
    w: frame.w * k,
    h: frame.h * k,
  };
}

/** drawFramed on a transparent canvas, then moved / scaled / turned by `place`. */
export function drawPlaced(
  img: CanvasImageSource,
  f: Frame,
  W: number,
  H: number,
  place: Place = PLACE0,
): HTMLCanvasElement {
  const flat = drawFramed(img, f, W, H, null);
  if (!isPlaced(place)) return flat;
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.translate(W / 2 + place.x * W, H / 2 + place.y * H);
  g.rotate((place.r * Math.PI) / 180);
  g.scale(place.s, place.s);
  g.drawImage(flat, -W / 2, -H / 2);
  return c;
}

/** The RGBA pixels of a picture drawn at W x H. */
export function pixels(src: CanvasImageSource, W: number, H: number): Uint8ClampedArray {
  const c = canvas(W, H);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, W, H);
  return g.getImageData(0, 0, W, H).data;
}

/** The see-through channel of a picture at the paint size (0..255 per pixel). */
export function alphaOf(src: CanvasImageSource): Uint8Array {
  const d = pixels(src, PAINT_W, PAINT_H);
  const a = new Uint8Array(PAINT_W * PAINT_H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}

/**
 * An uploaded overlay → the part fans can paint (0..255 per pixel at the paint size) and the art's
 * pixels for "Art's own dark lines". A transparent PNG of the paintable part (e.g. the character cut
 * out of the shirt print), framed exactly like the front tracking picture, then placed by `place`.
 */
export function overlayShape(
  overlay: HTMLImageElement,
  frame: Frame,
  place: Place = PLACE0,
  noAlpha = !hasTransparency(overlay),
): { alpha: Uint8Array; art: Uint8ClampedArray | null } {
  const art = drawPlaced(overlay, frameOn(frame, overlay), PAINT_W, PAINT_H, place);
  const d = art
    .getContext("2d", { willReadFrequently: true })!
    .getImageData(0, 0, PAINT_W, PAINT_H).data;
  // A picture with no transparency (a JPEG, a flattened PNG): treat near-white as "not paintable", like
  // a stencil on white paper. Checked on the upload itself: the padding bars of the frame are always
  // transparent, so the framed copy can't tell.
  const alpha = new Uint8Array(PAINT_W * PAINT_H);
  for (let i = 0; i < alpha.length; i++) {
    const a = d[i * 4 + 3];
    alpha[i] = noAlpha && d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2] >= 735 ? 0 : a;
  }
  return { alpha, art: noAlpha ? null : d };
}

/** An uploaded lines PNG, framed and placed like the overlay. */
export const linesPlaced = (linesImg: HTMLImageElement, frame: Frame, place: Place = PLACE0) =>
  drawPlaced(linesImg, frameOn(frame, linesImg), PAINT_W, PAINT_H, place);

/**
 * The finished canvas from the part fans can paint (0..255 per pixel, 768x1024): the saved shape
 * (soft edge of about a pixel), the lines drawn over the paint, the sticker's cut line. `art`: the
 * picture's pixels at the same size, for "Art's own dark lines" (the dark outlines, faces and lettering
 * inside the shape).
 */
export function finishCanvas(
  alpha: Uint8Array,
  art: Uint8ClampedArray | null,
  linesMode: LinesMode,
  linesUpload: HTMLCanvasElement | null,
): CanvasBuild {
  const N = PAINT_W * PAINT_H;
  const m = new Uint8Array(N);
  let on = 0;
  for (let i = 0; i < N; i++) {
    const v = alpha[i] > 127 ? 1 : 0;
    m[i] = v;
    on += v;
  }
  if (on < N * 0.01)
    throw new Error(
      "Almost nothing is paintable yet. Mark the part fans can paint (step 4) before saving.",
    );
  const soft = feather(m, PAINT_W, PAINT_H);
  const mask = canvas(PAINT_W, PAINT_H);
  const mg = mask.getContext("2d")!;
  const md = mg.createImageData(PAINT_W, PAINT_H);
  for (let i = 0; i < N; i++) {
    md.data[i * 4] = md.data[i * 4 + 1] = md.data[i * 4 + 2] = 255;
    md.data[i * 4 + 3] = soft[i];
  }
  mg.putImageData(md, 0, 0);

  let lines: HTMLCanvasElement | null = null;
  if (linesMode === "upload" && linesUpload) {
    lines = linesUpload;
  } else if (linesMode === "art" || linesMode === "edge") {
    lines = canvas(PAINT_W, PAINT_H);
    const lg = lines.getContext("2d")!;
    const ld = lg.createImageData(PAINT_W, PAINT_H);
    const ink = (i: number) => {
      ld.data[i * 4] = 21;
      ld.data[i * 4 + 1] = 19;
      ld.data[i * 4 + 2] = 26;
      ld.data[i * 4 + 3] = 255;
    };
    // the edge: mask pixels next to a non-mask pixel, 3 px thick
    const R = 3;
    for (let y = 0; y < PAINT_H; y++)
      for (let x = 0; x < PAINT_W; x++) {
        const i = y * PAINT_W + x;
        if (!m[i]) continue;
        let edge = false;
        for (let dy = -R; dy <= R && !edge; dy += R)
          for (let dx = -R; dx <= R; dx += R) {
            const xx = x + dx,
              yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= PAINT_W || yy >= PAINT_H || !m[yy * PAINT_W + xx]) {
              edge = true;
              break;
            }
          }
        if (edge) ink(i);
      }
    if (linesMode === "art" && art) {
      // the art's own dark lines inside the shape (outlines, faces, lettering): pixels clearly darker
      // than their surroundings (thin strokes), or near-black. Dark filled areas (navy trousers) stay
      // paintable instead of turning into a black blob.
      const lum = new Float32Array(N);
      for (let i = 0; i < N; i++)
        lum[i] = 0.299 * art[i * 4] + 0.587 * art[i * 4 + 1] + 0.114 * art[i * 4 + 2];
      const local = boxBlur(lum, PAINT_W, PAINT_H, 6);
      for (let i = 0; i < N; i++) {
        if (!m[i]) continue;
        if ((lum[i] < 120 && local[i] - lum[i] > 22) || lum[i] < 28) ink(i);
      }
    }
    lg.putImageData(ld, 0, 0);
  }
  return { mask, lines, outline: traceOutline(m, PAINT_W, PAINT_H), coverage: on / N };
}

/**
 * The sticker's die-cut line: the mask's outer edge, joined up (separate bits of the art end up on one
 * sticker, gaps filled) and grown by a hair (~4 px of 768), simplified. Fractions, v down. Close to
 * the built-in outlines (scripts/build-spray-bobo/build_stencil.py: the mask's contour).
 */
export function traceOutline(m: Uint8Array, w: number, h: number): [number, number][] {
  const S = 4,
    W = w / S,
    H = h / S;
  let g = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let dy = 0; dy < S && !v; dy++)
        for (let dx = 0; dx < S; dx++)
          if (m[(y * S + dy) * w + x * S + dx]) {
            v = 1;
            break;
          }
      g[y * W + x] = v;
    }
  const dilate = (a: Uint8Array, r: number) => {
    const o = new Uint8Array(a.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!a[y * W + x]) continue;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const xx = x + dx,
              yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) o[yy * W + xx] = 1;
          }
      }
    return o;
  };
  // close gaps up to ~50 px (separate bits of the art end on one sticker), then keep a thin border:
  // dilate 6 cells, erode 5 (erode = dilate the outside)
  g = dilate(g, 6);
  const inv = (a: Uint8Array) => a.map((v) => (v ? 0 : 1));
  g = inv(dilate(inv(g), 5));
  // largest component
  const lab = new Int32Array(W * H);
  let best = 0,
    bestN = 0,
    cur = 0;
  for (let i = 0; i < g.length; i++) {
    if (!g[i] || lab[i]) continue;
    cur++;
    let n = 0;
    const st = [i];
    lab[i] = cur;
    while (st.length) {
      const j = st.pop()!;
      n++;
      const x = j % W,
        y = (j / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx;
        if (g[k] && !lab[k]) {
          lab[k] = cur;
          st.push(k);
        }
      }
    }
    if (n > bestN) {
      bestN = n;
      best = cur;
    }
  }
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === best;
  // Moore-neighbour boundary trace
  let start = -1;
  for (let i = 0; i < g.length && start < 0; i++) if (lab[i] === best) start = i;
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const sx = start % W,
    sy = (start / W) | 0;
  let x = sx,
    y = sy,
    d = 6;
  const pts: [number, number][] = [];
  for (let guard = 0; guard < W * H * 4; guard++) {
    pts.push([x, y]);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (d + 6 + k) % 8;
      const nx = x + dirs[nd][0],
        ny = y + dirs[nd][1];
      if (inside(nx, ny)) {
        x = nx;
        y = ny;
        d = nd;
        found = true;
        break;
      }
    }
    if (!found || (x === sx && y === sy)) break;
  }
  const simple = rdp(pts, 0.9);
  return simple.map(([px, py]) => [+((px + 0.5) / W).toFixed(5), +((py + 0.5) / H).toFixed(5)]);
}

function rdp(p: [number, number][], eps: number): [number, number][] {
  if (p.length < 4) return p;
  const keep = new Uint8Array(p.length);
  keep[0] = keep[p.length - 1] = 1;
  const st: [number, number][] = [[0, p.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!;
    const [ax, ay] = p[a],
      [bx, by] = p[b];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let md = 0,
      mi = -1;
    for (let i = a + 1; i < b; i++) {
      const dd = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / L;
      if (dd > md) {
        md = dd;
        mi = i;
      }
    }
    if (md > eps && mi > 0) {
      keep[mi] = 1;
      st.push([a, mi], [mi, b]);
    }
  }
  return p.filter((_, i) => keep[i]);
}
