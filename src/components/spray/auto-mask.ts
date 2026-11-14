// Spray Bobo CMS: "Use the target picture". Works out the part fans can paint from the front picture
// itself by removing a plain background. Classic image processing only (colour distance, flood fill,
// small open/close, connected shapes): no machine learning, no generative tools, no network. Runs in the
// admin's browser on the 768x1024 paint grid, so the result lines up pixel for pixel with the target.
//
// How it works:
//  1. the picture is converted to Lab (a colour space where distance matches what people see) and
//     softened by a pixel, so JPEG noise doesn't break the fill;
//  2. the colours along the picture's border are grouped into up to four background colours (the pad
//     bars added by "Whole picture (pad)" are background by definition);
//  3. a flood fill starts at the border and spreads through pixels close to a background colour (or very
//     close to a neighbour that is already background, so soft shadows and uneven light still count).
//     Because it only spreads from the edges, same-coloured areas INSIDE the character are kept;
//  4. taps add a connected colour region to the background, or keep one;
//  5. clean up: small open/close, drop specks and tiny islands, fill pinholes, feather the edge ~1 px.
// The core functions take plain pixel arrays (no DOM) so they can also be tested outside the browser.

export type Tap = { u: number; v: number; keep: boolean };
export type Confidence = "good" | "ok" | "poor";

type Cluster = { L: number; a: number; b: number; n: number };

export type AutoPrep = {
  w: number;
  h: number;
  L: Float32Array;
  A: Float32Array;
  B: Float32Array;
  /** 1: known background (the pad bars of the frame, or see-through in the picture). */
  known: Uint8Array;
  /** The picture's own see-through areas decide the shape (a cut-out PNG used as the target). */
  ownAlpha: Uint8Array | null;
  clusters: Cluster[];
  /** Distance of each pixel to the nearest background colour. */
  distBg: Float32Array;
  /** Indices of the border pixels (outside the pad bars) the fill may start from. */
  border: Int32Array;
};

export type AutoResult = {
  /** 0..255 per pixel, feathered by ~1 px. */
  alpha: Uint8Array;
  coverage: number;
  confidence: Confidence;
  /** Plain-words detail behind the confidence (for tests and the hint line). */
  stats: { plain: number; noise: number; colours: number; ragged: number; pieces: number };
};

/** Tolerance slider range and default (colour distance). */
export const TOL_MIN = 4;
export const TOL_MAX = 40;
export const TOL_DEFAULT = 14;

/** Lightness counts for half: a soft shadow on the table is still "the table". */
const KL = 0.65;

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const fLab = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** RGBA (w x h) to Lab, softened with a 3x3 box. */
function toLab(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number) {
  const N = w * h;
  const L0 = new Float32Array(N),
    A0 = new Float32Array(N),
    B0 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = LIN[rgba[i * 4]],
      g = LIN[rgba[i * 4 + 1]],
      b = LIN[rgba[i * 4 + 2]];
    const x = fLab((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const y = fLab(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const z = fLab((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    L0[i] = 116 * y - 16;
    A0[i] = 500 * (x - y);
    B0[i] = 200 * (y - z);
  }
  return { L: box3(L0, w, h), A: box3(A0, w, h), B: box3(B0, w, h) };
}

function box3(a: Float32Array, w: number, h: number): Float32Array {
  const t = new Float32Array(a.length),
    o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const l = x > 0 ? a[r + x - 1] : a[r + x],
        rr = x < w - 1 ? a[r + x + 1] : a[r + x];
      t[r + x] = (l + a[r + x] + rr) / 3;
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = y > 0 ? t[i - w] : t[i],
        d = y < h - 1 ? t[i + w] : t[i];
      o[i] = (u + t[i] + d) / 3;
    }
  return o;
}

const dist = (L1: number, a1: number, b1: number, L2: number, a2: number, b2: number) => {
  const dl = (L1 - L2) * KL,
    da = a1 - a2,
    db = b1 - b2;
  return Math.sqrt(dl * dl + da * da + db * db);
};

/**
 * Get a picture ready (the slow part, done once per picture): Lab, the background colours from the
 * border, each pixel's distance to them. `pad` marks the frame's pad bars (known background) as
 * [x0, y0, x1, y1] of the picture inside the frame, in pixels; null: the picture fills the frame.
 */
export function prepareAuto(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  pad: [number, number, number, number] | null,
): AutoPrep {
  const N = w * h;
  const { L, A, B } = toLab(rgba, w, h);
  const known = new Uint8Array(N);
  // a picture with its own see-through parts (beyond the pad bars): those decide the shape
  let ownAlpha: Uint8Array | null = null;
  const [x0, y0, x1, y1] = pad ?? [0, 0, w, h];
  const ix0 = Math.max(0, Math.ceil(x0)),
    iy0 = Math.max(0, Math.ceil(y0)),
    ix1 = Math.min(w, Math.floor(x1)),
    iy1 = Math.min(h, Math.floor(y1));
  const inPic = (x: number, y: number) => x >= ix0 && x < ix1 && y >= iy0 && y < iy1;
  let seeInside = 0;
  for (let y = iy0; y < iy1; y++)
    for (let x = ix0; x < ix1; x++) if (rgba[(y * w + x) * 4 + 3] < 128) seeInside++;
  if (seeInside > (ix1 - ix0) * (iy1 - iy0) * 0.01) {
    ownAlpha = new Uint8Array(N);
    for (let i = 0; i < N; i++) ownAlpha[i] = rgba[i * 4 + 3];
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inPic(x, y) || rgba[i * 4 + 3] < 128) known[i] = 1;
    }

  // the border band of the picture itself (3 px), outside any see-through part
  const band: number[] = [];
  const BW = 3;
  for (let y = iy0; y < iy1; y++)
    for (let x = ix0; x < ix1; x++) {
      if (x >= ix0 + BW && x < ix1 - BW && y >= iy0 + BW && y < iy1 - BW) {
        x = ix1 - BW - 1;
        continue;
      }
      const i = y * w + x;
      if (!known[i]) band.push(i);
    }
  const border = Int32Array.from(band);

  // group the border colours: greedy, then two rounds of k-means; keep groups of 4%+ of the border
  let cl: Cluster[] = [];
  const step = Math.max(1, Math.floor(band.length / 4000));
  for (let k = 0; k < band.length; k += step) {
    const i = band[k];
    let best: Cluster | null = null,
      bd = 1e9;
    for (const c of cl) {
      const d = dist(L[i], A[i], B[i], c.L, c.a, c.b);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    if (best && bd < 10) {
      best.n++;
      best.L += (L[i] - best.L) / best.n;
      best.a += (A[i] - best.a) / best.n;
      best.b += (B[i] - best.b) / best.n;
    } else if (cl.length < 24) cl.push({ L: L[i], a: A[i], b: B[i], n: 1 });
  }
  for (let round = 0; round < 2; round++) {
    const acc = cl.map(() => ({ L: 0, a: 0, b: 0, n: 0 }));
    for (let k = 0; k < band.length; k += step) {
      const i = band[k];
      let bi = 0,
        bd = 1e9;
      cl.forEach((c, j) => {
        const d = dist(L[i], A[i], B[i], c.L, c.a, c.b);
        if (d < bd) {
          bd = d;
          bi = j;
        }
      });
      const s = acc[bi];
      s.L += L[i];
      s.a += A[i];
      s.b += B[i];
      s.n++;
    }
    cl = acc
      .filter((s) => s.n > 0)
      .map((s) => ({ L: s.L / s.n, a: s.a / s.n, b: s.b / s.n, n: s.n }));
  }
  const total = cl.reduce((s, c) => s + c.n, 0) || 1;
  cl.sort((p, q) => q.n - p.n);
  // the commonest border colour is the background; others only when they cover a good part of the
  // border too (a table and a wall), not when the character runs off the edge of the picture
  const clusters = cl.filter((c, i) => c.n / total >= (i === 0 ? 0.04 : 0.3)).slice(0, 4);
  // pad bars only (a picture with no usable border): their colour is the background
  if (!clusters.length) {
    let n = 0;
    const c = { L: 0, a: 0, b: 0, n: 1 };
    for (let i = 0; i < N; i++)
      if (known[i]) {
        c.L += L[i];
        c.a += A[i];
        c.b += B[i];
        n++;
      }
    if (n) clusters.push({ L: c.L / n, a: c.a / n, b: c.b / n, n });
    else clusters.push({ L: 100, a: 0, b: 0, n: 1 });
  }
  const distBg = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let bd = 1e9;
    for (const c of clusters) {
      const d = dist(L[i], A[i], B[i], c.L, c.a, c.b);
      if (d < bd) bd = d;
    }
    distBg[i] = bd;
  }
  return { w, h, L, A, B, known, ownAlpha, clusters, distBg, border };
}

/** Grow a region from seeds (a 4-connected flood). `ok(q, p)`: may q (next to p) join. */
function grow(
  w: number,
  h: number,
  out: Uint8Array,
  seeds: Iterable<number>,
  ok: (q: number, p: number) => boolean,
) {
  const N = w * h;
  const q = new Int32Array(N);
  let head = 0,
    tail = 0;
  for (const s of seeds)
    if (!out[s]) {
      out[s] = 1;
      q[tail++] = s;
    }
  while (head < tail) {
    const p = q[head++];
    const x = p % w;
    if (x > 0 && !out[p - 1] && ok(p - 1, p)) {
      out[p - 1] = 1;
      q[tail++] = p - 1;
    }
    if (x < w - 1 && !out[p + 1] && ok(p + 1, p)) {
      out[p + 1] = 1;
      q[tail++] = p + 1;
    }
    if (p >= w && !out[p - w] && ok(p - w, p)) {
      out[p - w] = 1;
      q[tail++] = p - w;
    }
    if (p < N - w && !out[p + w] && ok(p + w, p)) {
      out[p + w] = 1;
      q[tail++] = p + w;
    }
  }
}

/** The colour at a tap: the mean of a 5x5 patch (picks the colour, not one noisy pixel). */
function tapColour(P: AutoPrep, x: number, y: number) {
  let L = 0,
    a = 0,
    b = 0,
    n = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= P.w || yy >= P.h) continue;
      const i = yy * P.w + xx;
      L += P.L[i];
      a += P.A[i];
      b += P.B[i];
      n++;
    }
  return { L: L / n, a: a / n, b: b / n };
}

/** The part fans can paint, from a prepared picture, a tolerance and the taps. */
export function autoMask(P: AutoPrep, tol: number, taps: Tap[] = []): AutoResult {
  const { w, h, L, A, B, distBg, known } = P;
  const N = w * h;
  const bg = new Uint8Array(N);
  const step = tol * 0.3,
    cap = tol * 1.5;
  const near = (q: number, p: number) => dist(L[q], A[q], B[q], L[p], A[p], B[p]) < step;

  if (P.ownAlpha) {
    for (let i = 0; i < N; i++) bg[i] = P.ownAlpha[i] < 128 ? 1 : 0;
  } else {
    // flood from the edges (and the pad bars) through the background colours
    const seeds: number[] = [];
    for (let i = 0; i < N; i++) if (known[i]) seeds.push(i);
    for (const i of P.border) if (distBg[i] < tol) seeds.push(i);
    grow(w, h, bg, seeds, (q, p) => {
      if (known[q]) return true;
      const d = distBg[q];
      return d < tol || (d < cap && near(q, p));
    });
  }

  // taps: "this is background" adds the connected region of that colour; "keep" adds one back
  const keep = new Uint8Array(N);
  for (const t of taps) {
    const x = Math.max(0, Math.min(w - 1, Math.round(t.u * w))),
      y = Math.max(0, Math.min(h - 1, Math.round(t.v * h)));
    const c = tapColour(P, x, y);
    const dc = (q: number) => dist(L[q], A[q], B[q], c.L, c.a, c.b);
    const seed = y * w + x;
    if (!t.keep) {
      const r = new Uint8Array(N);
      grow(w, h, r, [seed], (q, p) => {
        const d = dc(q);
        return d < tol || (d < cap && near(q, p));
      });
      for (let i = 0; i < N; i++) if (r[i]) bg[i] = 1;
    } else {
      // closer to the tapped colour than to the background, and near the tap: so keeping a white
      // part on a white table can't bring the whole table back
      const R2 = (w * 0.16) ** 2;
      const r = new Uint8Array(N);
      grow(w, h, r, [seed], (q) => {
        const qx = q % w,
          qy = (q / w) | 0;
        if ((qx - x) ** 2 + (qy - y) ** 2 > R2) return false;
        const d = dc(q);
        return d < tol && (d < distBg[q] || !bg[q]);
      });
      for (let i = 0; i < N; i++) if (r[i]) keep[i] = 1;
    }
  }
  let fg: Uint8Array = new Uint8Array(N);
  for (let i = 0; i < N; i++) fg[i] = (!bg[i] || keep[i]) && !known[i] ? 1 : 0;
  // see-through parts of the picture stay out even when kept
  if (P.ownAlpha) for (let i = 0; i < N; i++) if (P.ownAlpha[i] < 128 && !keep[i]) fg[i] = 0;

  // clean up: open (drops specks and hairline bridges), close (fills nicks), islands, pinholes
  const raw = fg;
  fg = close(open(fg, w, h, 2), w, h, 2);
  for (let i = 0; i < N; i++) if (keep[i]) fg[i] = 1;
  const pieces = keepBig(fg, w, h);
  fillPinholes(fg, w, h, Math.round(N * 0.0006));

  let on = 0;
  for (let i = 0; i < N; i++) on += fg[i];
  const coverage = on / N;

  // confidence: how plain the border is, how noisy, how ragged the edge came out
  let match = 0,
    noise = 0;
  for (const i of P.border)
    if (distBg[i] < tol) {
      match++;
      noise += distBg[i];
    }
  const plain = P.ownAlpha ? 1 : P.border.length ? match / P.border.length : 1;
  noise = match ? noise / match : 0;
  const smooth = close(open(fg, w, h, 5), w, h, 5);
  const per = perimeter(fg, w, h),
    perS = perimeter(smooth, w, h);
  // specks the clean-up removed count a little too: lots of them means a noisy background
  let specks = 0;
  for (let i = 0; i < N; i++) if (raw[i] !== fg[i]) specks++;
  const ragged = perS ? per / perS + Math.min(0.5, (specks / (on || 1)) * 2) : 9;
  const colours = P.ownAlpha ? 1 : P.clusters.length;
  let confidence: Confidence;
  if (coverage < 0.02 || coverage > 0.93 || plain < 0.6 || ragged > 1.9 || pieces > 6)
    confidence = "poor";
  else if (plain > 0.85 && colours <= 2 && ragged < 1.45 && noise < tol * 0.6 && pieces <= 4)
    confidence = "good";
  else confidence = "ok";

  return {
    alpha: feather(fg, w, h),
    coverage,
    confidence,
    stats: { plain, noise, colours, ragged, pieces },
  };
}

// ---------------------------------------------------------------- binary helpers (0/1 per pixel)

/** Max (dilate) or min (erode) over a (2r+1) square, separable with running counts. */
function morph(a: Uint8Array, w: number, h: number, r: number, dilate: boolean): Uint8Array {
  const t = new Uint8Array(a.length),
    o = new Uint8Array(a.length);
  const want = dilate ? 1 : 0;
  // rows
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let cnt = 0; // pixels equal to `want` in the window
    for (let x = -r; x < w + r; x++) {
      const add = x + r,
        rem = x - r - 1;
      if (add < w && add >= 0 && a[row + add] === want) cnt++;
      if (rem >= 0 && rem < w && a[row + rem] === want) cnt--;
      if (x >= 0 && x < w) t[row + x] = cnt > 0 ? want : 1 - want;
    }
  }
  for (let x = 0; x < w; x++) {
    let cnt = 0;
    for (let y = -r; y < h + r; y++) {
      const add = y + r,
        rem = y - r - 1;
      if (add < h && add >= 0 && t[add * w + x] === want) cnt++;
      if (rem >= 0 && rem < h && t[rem * w + x] === want) cnt--;
      if (y >= 0 && y < h) o[y * w + x] = cnt > 0 ? want : 1 - want;
    }
  }
  return o;
}
export const open = (a: Uint8Array, w: number, h: number, r: number) =>
  morph(morph(a, w, h, r, false), w, h, r, true);
export const close = (a: Uint8Array, w: number, h: number, r: number) =>
  morph(morph(a, w, h, r, true), w, h, r, false);

/** Label 4-connected pieces of `v` (1 or 0). Returns labels and each piece's size and border touch. */
function label(a: Uint8Array, w: number, h: number, v: number) {
  const N = w * h;
  const lab = new Int32Array(N);
  const sizes: number[] = [0];
  const edge: boolean[] = [false];
  const st = new Int32Array(N);
  let cur = 0;
  for (let i = 0; i < N; i++) {
    if (a[i] !== v || lab[i]) continue;
    cur++;
    let n = 0,
      sp = 0,
      touches = false;
    st[sp++] = i;
    lab[i] = cur;
    while (sp) {
      const p = st[--sp];
      n++;
      const x = p % w,
        y = (p / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      if (x > 0 && a[p - 1] === v && !lab[p - 1]) {
        lab[p - 1] = cur;
        st[sp++] = p - 1;
      }
      if (x < w - 1 && a[p + 1] === v && !lab[p + 1]) {
        lab[p + 1] = cur;
        st[sp++] = p + 1;
      }
      if (y > 0 && a[p - w] === v && !lab[p - w]) {
        lab[p - w] = cur;
        st[sp++] = p - w;
      }
      if (y < h - 1 && a[p + w] === v && !lab[p + w]) {
        lab[p + w] = cur;
        st[sp++] = p + w;
      }
    }
    sizes.push(n);
    edge.push(touches);
  }
  return { lab, sizes, edge };
}

/** Keep the big shapes: drop islands under 2% of the largest (and under ~0.05% of the picture). */
function keepBig(fg: Uint8Array, w: number, h: number): number {
  const { lab, sizes } = label(fg, w, h, 1);
  const big = Math.max(0, ...sizes);
  const min = Math.max(big * 0.02, w * h * 0.0005);
  let kept = 0;
  for (let k = 1; k < sizes.length; k++) if (sizes[k] >= min) kept++;
  for (let i = 0; i < fg.length; i++) if (fg[i] && sizes[lab[i]] < min) fg[i] = 0;
  return kept;
}

/** Small background holes inside the shape (glints, specks) become paintable. */
function fillPinholes(fg: Uint8Array, w: number, h: number, max: number) {
  const { lab, sizes, edge } = label(fg, w, h, 0);
  for (let i = 0; i < fg.length; i++)
    if (!fg[i] && !edge[lab[i]] && sizes[lab[i]] <= max) fg[i] = 1;
}

function perimeter(a: Uint8Array, w: number, h: number): number {
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!a[i]) continue;
      if (
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !a[i - 1] ||
        !a[i + 1] ||
        !a[i - w] ||
        !a[i + w]
      )
        n++;
    }
  return n;
}

/** 0/1 → 0..255 with a ~1 px soft edge (3x3 mean). */
export function feather(a: Uint8Array, w: number, h: number): Uint8Array {
  const o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0,
        n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += a[yy * w + xx];
          n++;
        }
      }
      o[y * w + x] = Math.round((s / n) * 255);
    }
  return o;
}
