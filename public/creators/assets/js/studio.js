/**
 * Drop Studio - the MEDIALIFE x Roblox product configurator.
 *
 * Everything is generated at runtime; there are no model or texture downloads.
 * Each product is described by a 2D signed distance field which is inflated
 * into a soft, closed shell ("puff mesh"). That keeps every product fully
 * parametric -- colourway, print, activation tag placement and the activation
 * cinematic all drive the same geometry.
 *
 * UV convention: a single square texture holds the front print in its TOP half
 * (v 0.5..1) and the back in its BOTTOM half (v 0..0.5), so a decal can be
 * painted on the front only.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ---------------------------------------------------------------------------
// signed distance fields (negative inside, positive outside)
// ---------------------------------------------------------------------------

/** Chaikin corner cutting - softens a hand-authored silhouette. */
function chaikin(pts, iterations = 2) {
  let out = pts;
  for (let it = 0; it < iterations; it++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const p = out[i];
      const q = out[(i + 1) % out.length];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    out = next;
  }
  return out;
}

/** Mirror the right-hand half of a silhouette to guarantee symmetry. */
function mirrorRight(half) {
  const left = half.map(([x, y]) => [-x, y]).reverse();
  return [...half, ...left];
}

/**
 * Split long edges before smoothing. Chaikin rounds a corner by an amount
 * proportional to its adjacent edge lengths, so resampling first is what keeps
 * an armpit notch or a sleeve corner from dissolving into a blob.
 */
function resample(pts, maxLen = 0.075) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    out.push(p);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n = Math.floor(d / maxLen);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

function polySdf(pts) {
  const n = pts.length;
  return (px, py) => {
    let best = Infinity;
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = pts[i][0],
        yi = pts[i][1];
      const xj = pts[j][0],
        yj = pts[j][1];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      const ex = xj - xi,
        ey = yj - yi;
      const wx = px - xi,
        wy = py - yi;
      const t = clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-9));
      const qx = xi + ex * t - px,
        qy = yi + ey * t - py;
      const dd = qx * qx + qy * qy;
      if (dd < best) best = dd;
    }
    return inside ? -Math.sqrt(best) : Math.sqrt(best);
  };
}

const sdRoundRect = (x, y, hw, hh, r) => {
  const qx = Math.abs(x) - hw + r;
  const qy = Math.abs(y) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

// silhouettes -- authored as a right-hand half, mirrored, resampled, softened
const TEE_PTS = chaikin(
  resample(
    mirrorRight([
      [0.0, -1.2],
      [0.58, -1.22],
      [0.6, -0.4],
      [0.62, 0.26],
      [0.68, 0.34],
      [1.05, 0.5],
      [1.17, 0.8],
      [0.93, 0.95],
      [0.62, 1.02],
      [0.26, 1.1],
      [0.11, 1.03],
      [0.0, 0.96],
    ]),
    0.06,
  ),
  2,
);

const HOODIE_PTS = chaikin(
  resample(
    mirrorRight([
      [0.0, -1.24],
      [0.66, -1.26],
      [0.68, -0.4],
      [0.72, 0.22],
      [0.78, 0.3],
      [1.21, 0.44],
      [1.33, 0.78],
      [1.07, 0.94],
      [0.75, 1.02],
      [0.57, 1.06],
      [0.53, 1.26],
      [0.34, 1.45],
      [0.0, 1.51],
    ]),
    0.06,
  ),
  2,
);

/**
 * SDF, bounds and surface profile per product.
 * `print` is the mark's width as a fraction of the texture, so a logo reads at
 * a sensible size on a deskmat and on a keychain without manual fiddling.
 */
const SHAPES = {
  tee: {
    sdf: polySdf(TEE_PTS),
    bounds: [-1.26, -1.32, 1.26, 1.2],
    puff: 0.135,
    feather: 0.3,
    res: 112,
    tag: [0.34, -1.04],
    print: 0.245,
    wrinkle: 0.014,
  },
  hoodie: {
    sdf: polySdf(HOODIE_PTS),
    bounds: [-1.44, -1.38, 1.44, 1.62],
    puff: 0.175,
    feather: 0.34,
    res: 112,
    tag: [1.16, 0.62],
    print: 0.225,
    wrinkle: 0.017,
  },
  keychain: {
    sdf: (x, y) => sdRoundRect(x, y + 0.18, 0.62, 0.7, 0.24),
    bounds: [-0.78, -1.04, 0.78, 0.66],
    puff: 0.17,
    feather: 0.24,
    res: 92,
    tag: [0.36, -0.64],
    print: 0.34,
    wrinkle: 0,
    ring: { y: 0.6, r: 0.19, tube: 0.042 },
  },
  plush: {
    sdf: (x, y) => {
      const body = sdCircle(x, y, 0, -0.34, 0.72);
      const head = sdCircle(x, y, 0, 0.56, 0.55);
      const ears = Math.min(sdCircle(x, y, -0.45, 0.99, 0.24), sdCircle(x, y, 0.45, 0.99, 0.24));
      const arms = Math.min(sdCircle(x, y, -0.72, -0.34, 0.26), sdCircle(x, y, 0.72, -0.34, 0.26));
      const feet = Math.min(sdCircle(x, y, -0.35, -0.96, 0.25), sdCircle(x, y, 0.35, -0.96, 0.25));
      return smin(smin(smin(body, head, 0.3), smin(ears, arms, 0.14), 0.14), feet, 0.16);
    },
    bounds: [-1.1, -1.34, 1.1, 1.34],
    puff: 0.5,
    feather: 0.56,
    res: 100,
    tag: [0.5, -0.94],
    print: 0.22,
    wrinkle: 0,
  },
  stickers: {
    sdf: (x, y) => sdRoundRect(x, y, 0.82, 1.08, 0.1),
    bounds: [-0.94, -1.2, 0.94, 1.2],
    puff: 0.026,
    feather: 0.042,
    res: 84,
    tag: [0.56, -0.94],
    print: 0.4,
    wrinkle: 0,
  },
  mousepad: {
    sdf: (x, y) => sdRoundRect(x, y, 1.3, 0.74, 0.09),
    bounds: [-1.42, -0.86, 1.42, 0.86],
    puff: 0.038,
    feather: 0.052,
    res: 108,
    tag: [1.0, -0.5],
    print: 0.26,
    wrinkle: 0,
  },
};

/**
 * Inflate a 2D SDF into a closed, welded shell.
 *
 * Grid vertices that sit just outside the boundary are projected onto it via
 * two gradient steps, which keeps the silhouette crisp rather than stair-
 * stepped at grid resolution. Front and back share boundary vertices (z == 0
 * there), so mergeVertices welds them into one watertight surface.
 */
function puffGeometry(shape) {
  const { sdf, bounds, puff, feather, res, wrinkle = 0 } = shape;
  const [minX, minY, maxX, maxY] = bounds;
  const w = maxX - minX;
  const h = maxY - minY;
  const nx = res;
  const ny = Math.max(8, Math.round((res * h) / w));
  const H = 1e-3;

  const N = (nx + 1) * (ny + 1);
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const depth = new Float32Array(N); // positive inside
  const active = new Uint8Array(N);

  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = j * (nx + 1) + i;
      const x = minX + (i / nx) * w;
      const y = minY + (j / ny) * h;
      const d = sdf(x, y);
      px[k] = x;
      py[k] = y;
      depth[k] = -d;
      active[k] = d < 0 ? 1 : 0;
    }
  }

  // promote near-boundary vertices by projecting them onto the surface
  const promote = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d2 = c + 1;
      const cell = [a, b, c, d2];
      const on = cell.reduce((s, k) => s + active[k], 0);
      if (on === 0 || on === 4) continue;
      for (const k of cell) if (!active[k]) promote.push(k);
    }
  }
  for (const k of promote) {
    if (active[k]) continue;
    let x = px[k],
      y = py[k];
    for (let s = 0; s < 2; s++) {
      const d = sdf(x, y);
      const gx = (sdf(x + H, y) - sdf(x - H, y)) / (2 * H);
      const gy = (sdf(x, y + H) - sdf(x, y - H)) / (2 * H);
      const len = Math.hypot(gx, gy) || 1e-6;
      x -= (d * gx) / len;
      y -= (d * gy) / len;
    }
    px[k] = x;
    py[k] = y;
    depth[k] = 0;
    active[k] = 1;
  }

  // vertex buffers: front shell then back shell
  const frontIdx = new Int32Array(N).fill(-1);
  const backIdx = new Int32Array(N).fill(-1);
  const pos = [];
  const uv = [];

  const profile = (dep) => {
    const t = clamp01(dep / feather);
    return puff * Math.sqrt(1 - (1 - t) * (1 - t));
  };

  for (let k = 0; k < N; k++) {
    if (!active[k]) continue;
    const x = px[k],
      y = py[k];
    let z = profile(depth[k]);
    if (wrinkle && z > 0.004) {
      z +=
        wrinkle *
        Math.sin(x * 7.3 + y * 2.1) *
        Math.sin(y * 5.7 - x * 1.4) *
        clamp01(depth[k] / feather);
    }
    const tx = (x - minX) / w;
    const ty = (y - minY) / h;

    frontIdx[k] = pos.length / 3;
    pos.push(x, y, z);
    uv.push(tx, 0.5 + 0.5 * ty);

    backIdx[k] = pos.length / 3;
    pos.push(x, y, -z);
    uv.push(1 - tx, 0.5 * ty);
  }

  const index = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      const b = a + 1;
      const c = a + nx + 1;
      const d2 = c + 1;
      if (!(active[a] && active[b] && active[c] && active[d2])) continue;
      index.push(frontIdx[a], frontIdx[b], frontIdx[d2]);
      index.push(frontIdx[a], frontIdx[d2], frontIdx[c]);
      index.push(backIdx[a], backIdx[d2], backIdx[b]);
      index.push(backIdx[a], backIdx[c], backIdx[d2]);
    }
  }

  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo = mergeVertices(geo, 1e-4);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.userData.profile = profile;
  return geo;
}

// ---------------------------------------------------------------------------
// procedural textures
// ---------------------------------------------------------------------------

/** Tiling fabric weave normal map, derived from an analytic height field. */
function weaveNormalMap() {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(S, S);
  const hAt = (x, y) => {
    const f = (Math.PI * 2 * 8) / S;
    return Math.sin(x * f) * 0.5 + Math.sin(y * f) * 0.5 + Math.sin((x + y) * f * 0.5) * 0.18;
  };
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const gx = hAt(x + 1, y) - hAt(x - 1, y);
      const gy = hAt(x, y + 1) - hAt(x, y - 1);
      const nx = -gx * 0.5,
        ny = -gy * 0.5,
        nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 26);
  return tex;
}

/** Soft radial falloff used for the contact shadow and floor fade. */
function radialTexture(inner, outer, stops) {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, S * inner, S / 2, S / 2, S * outer);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft round sprite for the particle stream. */
function sparkTexture() {
  const S = 64;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Deterministic pseudo-QR block art for printed activation codes. */
function drawCodeBlock(ctx, x, y, size, seed, fg) {
  const n = 9;
  const cell = size / n;
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  ctx.fillStyle = fg;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const finder = (i < 3 && j < 3) || (i > n - 4 && j < 3) || (i < 3 && j > n - 4);
      if (finder) {
        const edge =
          i === 0 ||
          j === 0 ||
          i === n - 1 ||
          j === n - 1 ||
          (i < 3 && (i === 2 || j === 2)) ||
          (j < 3 && (i === 2 || j === 2)) ||
          (i > n - 4 && (i === n - 3 || j === 2)) ||
          (j > n - 4 && (i === 2 || j === n - 3));
        if (edge || (i % 2 === 1 && j % 2 === 1))
          ctx.fillRect(x + i * cell, y + j * cell, cell, cell);
        continue;
      }
      if (rnd() > 0.5) ctx.fillRect(x + i * cell, y + j * cell, cell, cell);
    }
  }
}

// ---------------------------------------------------------------------------
// product surface painting
// ---------------------------------------------------------------------------

const TEX_SIZE = 1024;

/**
 * Trim and construction detail, in front-half canvas space.
 * Positions come from the shape's own bounds so a seam lands on the seam.
 */
function drawTrim(ctx, id, S, ink, bounds) {
  const half = S / 2; // the front print occupies canvas y 0..half
  const [minX, minY, maxX, maxY] = bounds;
  const w = maxX - minX;
  const h = maxY - minY;
  const X = (x) => ((x - minX) / w) * S; // shape x -> canvas x
  const Y = (y) => (1 - (y - minY) / h) * half; // shape y -> canvas y

  ctx.save();
  ctx.globalAlpha = 0.17;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, S * 0.0026);
  ctx.setLineDash([S * 0.012, S * 0.012]);

  if (id === "tee" || id === "hoodie") {
    const neckY = id === "hoodie" ? 1.06 : 1.02;
    const neckX = id === "hoodie" ? 0.55 : 0.27;
    const hemY = id === "hoodie" ? -1.24 : -1.2;
    const hemX = id === "hoodie" ? 0.66 : 0.58;

    ctx.beginPath();
    ctx.ellipse(S * 0.5, Y(neckY), X(neckX) - S * 0.5, half * 0.05, 0, 0, Math.PI);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(X(-hemX * 0.94), Y(hemY + 0.05));
    ctx.lineTo(X(hemX * 0.94), Y(hemY + 0.05));
    ctx.stroke();

    if (id === "hoodie") {
      ctx.beginPath();
      ctx.moveTo(X(-0.42), Y(-0.34));
      ctx.lineTo(X(-0.42), Y(-0.9));
      ctx.lineTo(X(0.42), Y(-0.9));
      ctx.lineTo(X(0.42), Y(-0.34));
      ctx.stroke();
      // drawcord eyelets
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.22;
      for (const ex of [-0.13, 0.13]) {
        ctx.beginPath();
        ctx.arc(X(ex), Y(0.92), S * 0.006, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  } else if (id === "mousepad" || id === "stickers") {
    const inset = id === "mousepad" ? 0.055 : 0.05;
    ctx.beginPath();
    ctx.roundRect(
      S * inset,
      half * inset * 1.2,
      S * (1 - inset * 2),
      half * (1 - inset * 2.4),
      S * 0.014,
    );
    ctx.stroke();
  } else if (id === "keychain") {
    ctx.beginPath();
    ctx.roundRect(S * 0.12, half * 0.14, S * 0.76, half * 0.72, S * 0.04);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Repaint the product surface.
 * @returns {HTMLCanvasElement}
 */
function paintSurface(canvas, opts) {
  const S = TEX_SIZE;
  const half = S / 2;
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  const { base, ink, id, decal, decalScale, decalY, hasQr, seed, printW, bounds } = opts;

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);

  // gentle top-down light bake so the surface is not flat even before lighting
  const grad = ctx.createLinearGradient(0, 0, 0, half);
  grad.addColorStop(0, "rgba(255,255,255,0.03)");
  grad.addColorStop(0.55, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.14)");
  for (const yOff of [0, half]) {
    ctx.save();
    ctx.translate(0, yOff);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, half);
    ctx.restore();
  }

  drawTrim(ctx, id, S, ink, bounds || [-1, -1, 1, 1]);

  // printed activation code on the front hem -- a garment label, not a billboard
  if (hasQr) {
    const size = S * 0.042;
    const x = S * 0.5 - size / 2;
    const y = half * 0.855;
    ctx.save();
    ctx.globalAlpha = 0.42;
    drawCodeBlock(ctx, x, y, size, seed, ink);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = ink;
    ctx.font = `500 ${Math.round(S * 0.0105)}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.letterSpacing = "1.5px";
    ctx.fillText("ACTIVATED", S * 0.5, y + size * 1.5);
    ctx.restore();
  }

  // the creator's mark, front only
  if (decal && decal.complete && decal.naturalWidth) {
    const dw = S * (printW || 0.3) * decalScale;
    const ratio = decal.naturalHeight / decal.naturalWidth || 1;
    const dh = dw * ratio;
    const cx = S * 0.5;
    const cy = half * (0.46 - decalY * 0.28);
    ctx.save();
    ctx.globalAlpha = 0.92;
    try {
      ctx.drawImage(decal, cx - dw / 2, cy - dh / 2, dw, dh);
    } catch {
      /* a tainted or undecodable image simply does not print */
    }
    ctx.restore();
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// the studio
// ---------------------------------------------------------------------------

export function createStudio({ canvas, viewport, onReady, onFail, onActivationStep, onDecalDrag }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (err) {
    onFail?.(err);
    return null;
  }
  if (!renderer.getContext()) {
    onFail?.(new Error("no webgl context"));
    return null;
  }

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = null;

  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
  camera.position.set(0, 0.16, 5.0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minDistance = 2.6;
  controls.maxDistance = 8.5;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.maxPolarAngle = Math.PI * 0.86;
  controls.rotateSpeed = 0.78;
  controls.zoomSpeed = 0.7;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.55;

  // environment
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.035);
  scene.environment = envRT.texture;
  // kept low so a black colourway still reads black rather than mid-grey
  scene.environmentIntensity = 0.24;

  // key / rim / fill
  const key = new THREE.DirectionalLight(0xdfe9ff, 1.5);
  key.position.set(2.4, 3.0, 3.4);
  scene.add(key);

  // edge-on rims: short range keeps them on the product, off the floor
  const rimA = new THREE.PointLight(0x19affe, 14, 5.5, 2);
  rimA.position.set(-2.05, 0.75, 0.35);
  scene.add(rimA);

  const rimB = new THREE.PointLight(0xff37ae, 12, 5.5, 2);
  rimB.position.set(2.05, -0.35, 0.25);
  scene.add(rimB);

  // low back light separates the silhouette from the background
  const back = new THREE.DirectionalLight(0xbcd2ff, 0.75);
  back.position.set(-0.6, 1.6, -3.0);
  scene.add(back);

  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-1.6, -1.6, 2.4);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0x1b2230, 0.95));

  // ---- stage: floor disc + contact shadow -------------------------------
  const stage = new THREE.Group();
  scene.add(stage);

  const floorTex = radialTexture(0.0, 0.5, [
    [0, "rgba(56,63,86,1)"],
    [0.07, "rgba(34,39,54,1)"],
    [0.16, "rgba(17,19,28,1)"],
    [0.32, "rgba(6,7,12,1)"],
    [1, "rgba(2,2,4,1)"],
  ]);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(26, 96),
    // unlit on purpose: a lit floor catches the rim lights and blows out
    new THREE.MeshBasicMaterial({ map: floorTex }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.62;
  stage.add(floor);

  // a warm-dark pool rather than pure black, so it reads on a near-black stage
  const shadowTex = radialTexture(0.0, 0.5, [
    [0, "rgba(6,8,14,0.95)"],
    [0.34, "rgba(5,6,11,0.55)"],
    [1, "rgba(2,2,4,0)"],
  ]);
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
  );
  contact.renderOrder = 1;
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.605;
  stage.add(contact);

  // ---- product ----------------------------------------------------------
  const weave = weaveNormalMap();
  const surfaceCanvas = document.createElement("canvas");
  const surfaceTex = new THREE.CanvasTexture(surfaceCanvas);
  surfaceTex.colorSpace = THREE.SRGBColorSpace;
  surfaceTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const fabricMat = new THREE.MeshPhysicalMaterial({
    map: surfaceTex,
    roughness: 0.96,
    metalness: 0.0,
    normalMap: weave,
    normalScale: new THREE.Vector2(0.3, 0.3),
    sheen: 0.3,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color(0x3d4a5c),
    side: THREE.DoubleSide,
  });
  const enamelMat = new THREE.MeshPhysicalMaterial({
    map: surfaceTex,
    roughness: 0.26,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });
  const printMat = new THREE.MeshPhysicalMaterial({
    map: surfaceTex,
    roughness: 0.58,
    metalness: 0.0,
    clearcoat: 0.28,
    clearcoatRoughness: 0.4,
    normalMap: weave,
    normalScale: new THREE.Vector2(0.09, 0.09),
    side: THREE.DoubleSide,
  });
  const MATERIALS = {
    tee: fabricMat,
    hoodie: fabricMat,
    plush: fabricMat,
    keychain: enamelMat,
    stickers: printMat,
    mousepad: printMat,
  };

  const product = new THREE.Group();
  stage.add(product);

  const geoCache = new Map();
  let mesh = null;
  let ringMesh = null;
  let currentShape = null;
  let homeDist = 5.0;
  const homePos = new THREE.Vector3(0, 0.16, 5.0);

  /**
   * Where the cinematic props live for the current product. Recomputed on every
   * product change so the phone, portal and particle stream stay in frame for a
   * keychain and for a deskmat alike.
   */
  const cineAnchor = {
    center: new THREE.Vector3(),
    midLook: new THREE.Vector3(),
    phone: { x: 1.2, y: -0.1, z: 1.0, rise: 1.6, scale: 1 },
    portalScale: 1,
    unit: 1,
  };

  // ---- activation tag ---------------------------------------------------
  const tag = new THREE.Group();
  const tagBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.012, 32),
    new THREE.MeshPhysicalMaterial({
      color: 0x0d0f16,
      roughness: 0.35,
      metalness: 0.6,
      clearcoat: 0.6,
    }),
  );
  tagBody.rotation.x = Math.PI / 2;
  tag.add(tagBody);

  const tagGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.056, 0.008, 12, 40),
    new THREE.MeshBasicMaterial({ color: 0x19affe, transparent: true, opacity: 0.8 }),
  );
  tagGlow.position.z = 0.009;
  tag.add(tagGlow);

  const pulses = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Mesh(
      new THREE.RingGeometry(0.058, 0.068, 48),
      new THREE.MeshBasicMaterial({
        color: 0x19affe,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    p.position.z = 0.016;
    tag.add(p);
    pulses.push(p);
  }
  product.add(tag);

  // ---- cinematic props (hidden until the activation runs) ---------------
  const cine = new THREE.Group();
  cine.visible = false;
  stage.add(cine);

  // phone
  const phone = new THREE.Group();
  const phoneBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 1.62, 0.055),
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0b10,
      roughness: 0.25,
      metalness: 0.75,
      clearcoat: 0.8,
    }),
  );
  phone.add(phoneBody);

  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 256;
  screenCanvas.height = 512;
  const screenTex = new THREE.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 1.52),
    new THREE.MeshBasicMaterial({ map: screenTex, transparent: true }),
  );
  screen.position.z = 0.03;
  phone.add(screen);
  phone.position.set(1.05, -0.15, 1.5);
  phone.rotation.set(-0.12, -0.34, 0.06);
  cine.add(phone);

  // portal
  const portal = new THREE.Group();
  const portalRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.035, 16, 96),
    new THREE.MeshBasicMaterial({
      color: 0x19affe,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  portal.add(portalRing);
  const portalGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.5, 2.5),
    new THREE.MeshBasicMaterial({
      map: radialTexture(0, 0.5, [
        [0, "rgba(150,215,255,0.42)"],
        [0.34, "rgba(60,150,255,0.16)"],
        [0.62, "rgba(255,60,175,0.07)"],
        [1, "rgba(0,0,0,0)"],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  portal.add(portalGlow);
  portal.position.set(0, 0.1, -1.7);
  portal.scale.setScalar(0.01);
  cine.add(portal);

  // particle stream from product to portal
  const P_COUNT = 420;
  const pPos = new Float32Array(P_COUNT * 3);
  const pSeed = new Float32Array(P_COUNT);
  const pAngle = new Float32Array(P_COUNT);
  for (let i = 0; i < P_COUNT; i++) {
    pSeed[i] = Math.random();
    pAngle[i] = Math.random() * Math.PI * 2;
    pPos[i * 3] = 0;
    pPos[i * 3 + 1] = 0;
    pPos[i * 3 + 2] = 0;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 0.062,
      map: sparkTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xcfeaff,
    }),
  );
  cine.add(particles);

  // ---- post ------------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.26, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---- state -----------------------------------------------------------
  const state = {
    id: "tee",
    base: "#0b0b0f",
    ink: "#f4f5f8",
    decal: null,
    decalScale: 1,
    decalY: 0,
    hasQr: true,
    hasNfc: true,
    showTag: true,
    seed: 20260916,
  };

  function repaint() {
    paintSurface(surfaceCanvas, {
      ...state,
      printW: currentShape?.print ?? 0.3,
      bounds: currentShape?.bounds,
    });
    surfaceTex.needsUpdate = true;
  }

  /**
   * Fit the camera to whatever is on the stage so a deskmat and a keychain are
   * both well framed without per-product magic numbers.
   */
  function frameProduct() {
    if (!mesh) return;
    const box = new THREE.Box3().setFromObject(product);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Fit the box, not its bounding sphere: a sphere circumscribes a wide,
    // flat product like a deskmat by a huge margin and frames everything small.
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(fov / 2) * Math.max(camera.aspect, 0.6));
    const halfV = size.y / 2;
    const halfH = Math.max(size.x, size.z) / 2; // the widest face the turntable shows
    const distV = halfV / Math.tan(fov / 2);
    const distH = halfH / Math.tan(hFov / 2);
    homeDist = Math.max(distV, distH) * 1.12 + size.z * 0.5;

    controls.minDistance = homeDist * 0.4;
    controls.maxDistance = homeDist * 2.2;

    homePos.set(0, center.y, homeDist);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.04, 1);
    controls.target.set(0, center.y, 0);
    camera.position.copy(controls.target).add(dir.normalize().multiplyScalar(homeDist));
    controls.update();
  }

  function setProduct(id) {
    const shape = SHAPES[id];
    if (!shape) return;
    state.id = id;
    currentShape = shape;

    if (mesh) {
      product.remove(mesh);
      mesh = null;
    }
    if (ringMesh) {
      product.remove(ringMesh);
      ringMesh.geometry.dispose();
      ringMesh = null;
    }

    let geo = geoCache.get(id);
    if (!geo) {
      geo = puffGeometry(shape);
      geoCache.set(id, geo);
    }

    mesh = new THREE.Mesh(geo, MATERIALS[id] || fabricMat);
    product.add(mesh);

    if (shape.ring) {
      ringMesh = new THREE.Mesh(
        new THREE.TorusGeometry(shape.ring.r, shape.ring.tube, 14, 48),
        new THREE.MeshStandardMaterial({ color: 0xc8ccd6, roughness: 0.22, metalness: 1 }),
      );
      ringMesh.position.y = shape.ring.y;
      product.add(ringMesh);
    }

    // place the activation tag on the front surface
    const [tx, ty] = shape.tag;
    const dep = -shape.sdf(tx, ty);
    const z = geo.userData.profile(Math.max(dep, 0));
    tag.position.set(tx, ty, z + 0.01);
    tag.scale.setScalar(1);

    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    contact.scale.set(Math.max(size.x, 0.4) / 2.2, Math.max(size.x, 0.4) / 3.4, 1);
    contact.position.y = box.min.y - 0.015;
    floor.position.y = box.min.y - 0.025;
    floor.scale.setScalar(Math.max(0.42, Math.max(size.x, size.y) / 5.6));

    // stage the cinematic around the product's real footprint
    const unit = Math.max(size.x, size.y) / 2.4;
    cineAnchor.unit = unit;
    cineAnchor.center.set(0, center.y, 0);
    cineAnchor.midLook.set(size.x * 0.3, center.y, size.z * 0.4);
    cineAnchor.phone = {
      x: size.x * 0.5 + 0.3 * unit,
      y: center.y - 0.1 * unit,
      z: size.z * 0.5 + 0.85 * unit,
      rise: 1.5 * unit,
      scale: (size.y * 0.56) / 1.62, // phone body is 1.62 units tall
    };
    const ringR = 1.15 * Math.max(0.5, (size.y * 0.7) / 1.15);
    portal.position.set(
      0,
      Math.max(center.y, box.min.y + ringR * 0.92),
      -(size.z * 0.5 + 1.5 * unit),
    );
    cineAnchor.portalScale = Math.max(0.5, (size.y * 0.7) / 1.15); // ring radius is 1.15 at scale 1

    repaint();
    frameProduct();
  }

  function setColor(hex, ink) {
    state.base = hex;
    state.ink = ink;
    repaint();
  }

  function setActivation(kind) {
    state.hasNfc = kind === "nfc" || kind === "both";
    state.hasQr = kind === "qr" || kind === "both";
    tagBody.visible = state.hasNfc;
    tagGlow.visible = state.hasNfc;
    repaint();
  }

  function setShowTag(on) {
    state.showTag = on;
    tag.visible = on;
  }

  function setDecal(img) {
    state.decal = img;
    repaint();
  }
  function setDecalScale(v) {
    state.decalScale = v;
    repaint();
  }
  function setDecalY(v) {
    state.decalY = v;
    repaint();
  }

  // ---- decal dragging ---------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let dragging = false;

  function uvAt(ev) {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const hit = mesh ? ray.intersectObject(mesh, false)[0] : null;
    return hit && hit.uv ? hit.uv : null;
  }

  /** True when the pointer is over the printed mark on the front face. */
  function overDecal(uv) {
    if (!uv || uv.y < 0.5 || !state.decal) return false;
    const tx = uv.x;
    const ty = (uv.y - 0.5) * 2;
    const cx = 0.5;
    const cy = 0.54 + state.decalY * 0.28;
    const rx = 0.22 * state.decalScale;
    const ry = 0.22 * state.decalScale;
    return Math.abs(tx - cx) < rx && Math.abs(ty - cy) < ry;
  }

  canvas.addEventListener("pointermove", (ev) => {
    if (dragging) {
      const uv = uvAt(ev);
      if (uv && uv.y >= 0.5) {
        const ty = (uv.y - 0.5) * 2;
        const v = clamp((ty - 0.54) / 0.28, -1, 1);
        state.decalY = v;
        repaint();
        onDecalDrag?.(v);
      }
      return;
    }
    if (!state.decal) {
      canvas.style.cursor = "";
      return;
    }
    canvas.style.cursor = overDecal(uvAt(ev)) ? "grab" : "";
  });

  canvas.addEventListener("pointerdown", (ev) => {
    if (!state.decal) return;
    if (!overDecal(uvAt(ev))) return;
    dragging = true;
    controls.enabled = false;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture?.(ev.pointerId);
  });

  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    controls.enabled = true;
    canvas.style.cursor = "";
    canvas.releasePointerCapture?.(ev.pointerId);
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // ---- keyboard orbit ---------------------------------------------------
  // The viewport is the centrepiece, so it cannot be pointer-only. Written
  // against the public camera/target only -- OrbitControls' own rotate and
  // dolly helpers are private in r180 and would break on an upgrade.
  const _off = new THREE.Vector3();
  const _sph = new THREE.Spherical();

  function orbitBy(dTheta, dPhi) {
    _off.copy(camera.position).sub(controls.target);
    _sph.setFromVector3(_off);
    _sph.theta += dTheta;
    _sph.phi = clamp(_sph.phi + dPhi, controls.minPolarAngle + 0.02, controls.maxPolarAngle - 0.02);
    camera.position.copy(controls.target).add(_off.setFromSpherical(_sph));
  }

  function dollyBy(factor) {
    _off.copy(camera.position).sub(controls.target);
    const len = clamp(_off.length() * factor, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(_off.setLength(len));
  }

  canvas.addEventListener("keydown", (ev) => {
    if (act.on) return;
    const step = 0.16 * (ev.shiftKey ? 0.35 : 1);
    let handled = true;
    switch (ev.key) {
      case "ArrowLeft":
        orbitBy(step, 0);
        break;
      case "ArrowRight":
        orbitBy(-step, 0);
        break;
      case "ArrowUp":
        orbitBy(0, -step * 0.6);
        break;
      case "ArrowDown":
        orbitBy(0, step * 0.6);
        break;
      case "+":
      case "=":
        dollyBy(0.88);
        break;
      case "-":
      case "_":
        dollyBy(1.14);
        break;
      case "Home":
      case "0":
        resetView();
        break;
      default:
        handled = false;
    }
    if (!handled) return;
    ev.preventDefault();
    controls.autoRotate = false;
    controls.update();
  });

  // pause the turntable while someone is inspecting, resume when they leave
  canvas.addEventListener("focus", () => {
    if (!act.on) controls.autoRotate = false;
  });
  canvas.addEventListener("blur", () => {
    if (!act.on && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      controls.autoRotate = true;
  });

  // ---- activation cinematic --------------------------------------------
  const STEPS = [
    { at: 0.0, to: 0.16, label: "A chip and a code, in the product" },
    { at: 0.16, to: 0.38, label: "The fan taps it with their phone" },
    { at: 0.38, to: 0.62, label: "The experience opens — no app, no account" },
    { at: 0.62, to: 0.84, label: "They land back in your game, with a reward" },
    { at: 0.84, to: 1.0, label: "Every tap comes back to you as data" },
  ];

  let act = { on: false, t: 0, dur: 10.5, step: -1, start: 0, hold: null };

  function paintScreen(p) {
    const c = screenCanvas;
    const ctx = c.getContext("2d");
    const W = c.width,
      H = c.height;
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#071726");
    g.addColorStop(1, "#1a0716");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const t = clamp01(p);
    const cx = W / 2,
      cy = H * 0.42;
    for (let i = 0; i < 4; i++) {
      const r = (t * 1.5 + i * 0.25) % 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r * W * 0.62, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${25 + i * 30},${175 - i * 20},254,${(1 - r) * 0.7})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.34);
    core.addColorStop(0, `rgba(255,255,255,${0.35 + 0.4 * t})`);
    core.addColorStop(0.45, "rgba(25,175,254,0.42)");
    core.addColorStop(1, "rgba(255,55,174,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(244,245,248,0.85)";
    ctx.fillRect(W * 0.16, H * 0.74, W * 0.68 * t, 4);
    ctx.fillStyle = "rgba(244,245,248,0.22)";
    ctx.fillRect(W * 0.16, H * 0.74, W * 0.68, 4);
    screenTex.needsUpdate = true;
  }

  function startActivation() {
    act = {
      on: true,
      t: 0,
      dur: 10.5,
      step: -1,
      start: performance.now(),
      hold: null,
      camFrom: camera.position.clone(),
      tgtFrom: controls.target.clone(),
    };
    cine.visible = true;
    controls.autoRotate = false;
    controls.enabled = false;
    if (!state.showTag) tag.visible = true;
    return act.dur;
  }

  function stopActivation() {
    act.on = false;
    cine.visible = false;
    particles.material.opacity = 0;
    portal.scale.setScalar(0.01);
    controls.enabled = true;
    controls.autoRotate = true;
    tag.visible = state.showTag;
    onActivationStep?.(-1, 0);
  }

  function updateActivation(dt) {
    // wall clock, so the cinematic runs at the same pace on a slow GPU
    act.t = act.hold === null ? (performance.now() - act.start) / 1000 : act.hold * act.dur;
    const p = clamp01(act.t / act.dur);

    const idx = STEPS.findIndex((s) => p >= s.at && p < s.to);
    const step = idx === -1 ? STEPS.length - 1 : idx;
    if (step !== act.step) {
      act.step = step;
      onActivationStep?.(step, p);
    } else {
      onActivationStep?.(step, p);
    }

    // Camera path in units of the fitted distance, so the shot holds whether
    // the product is a keychain or a deskmat. Positions are set directly from
    // wall-clock progress -- a per-frame lerp trails on a slow GPU.
    const tagWorld = tag.getWorldPosition(new THREE.Vector3());
    const c = cineAnchor.center;
    const at = (x, y, z) =>
      new THREE.Vector3(c.x + x * homeDist, c.y + y * homeDist, c.z + z * homeDist);

    // a narrow viewport needs more distance to hold product and phone together
    const wide = 1.26 + Math.max(0, 1.15 - camera.aspect) * 0.55;

    const A = at(0, 0, 1.0); // hero
    const B = at(0.24, -0.13, 0.54); // macro on the tag
    const C = at(0.26, -0.02, wide); // product and phone together
    const D = at(-0.05, 0.05, wide + 0.2); // wide, portal behind

    let pos;
    let lookAt;
    if (p < 0.3) {
      const k = easeInOut(clamp01(p / 0.3));
      pos = A.clone().lerp(B, k);
      lookAt = c.clone().lerp(tagWorld, k * 0.9);
    } else if (p < 0.58) {
      const k = easeInOut(clamp01((p - 0.3) / 0.28));
      pos = B.clone().lerp(C, k);
      lookAt = tagWorld.clone().lerp(cineAnchor.midLook, k);
    } else {
      const k = easeInOut(clamp01((p - 0.58) / 0.42));
      pos = C.clone().lerp(D, k);
      lookAt = cineAnchor.midLook.clone().lerp(c, k);
    }

    // ease out of wherever the visitor had orbited to, then follow the path exactly
    const blend = easeInOut(clamp01(p / 0.07));
    camera.position.copy(act.camFrom).lerp(pos, blend);
    controls.target.copy(act.tgtFrom).lerp(lookAt, blend);

    // tag pulses fire during step 2
    const pulsing = p > 0.14 && p < 0.52;
    pulses.forEach((ring, i) => {
      if (!pulsing) {
        ring.material.opacity = 0;
        return;
      }
      const cycle = (act.t * 1.15 + i * 0.33) % 1;
      ring.scale.setScalar(1 + cycle * 4.4);
      ring.material.opacity = (1 - cycle) * 0.75;
    });

    // phone rises into frame beside the product and lights up
    const ph = cineAnchor.phone;
    const phoneIn = clamp01((p - 0.28) / 0.16);
    const phoneOut = 1 - clamp01((p - 0.74) / 0.12);
    phone.visible = phoneIn > 0.01 && phoneOut > 0.01;
    if (phone.visible) {
      const k = easeOut(phoneIn);
      phone.position.set(ph.x, lerp(ph.y - ph.rise, ph.y, k), lerp(ph.z - ph.rise * 0.4, ph.z, k));
      phone.rotation.set(lerp(-0.42, -0.1, k), -0.3, lerp(0.2, 0.04, k));
      phone.scale.setScalar(ph.scale * phoneOut);
      screen.material.opacity = phoneOut;
      paintScreen(clamp01((p - 0.32) / 0.28));
    }

    // portal opens behind, particles stream from the product into it
    const portalIn = clamp01((p - 0.56) / 0.16);
    portal.scale.setScalar(Math.max(0.01, easeOut(portalIn) * cineAnchor.portalScale));
    portalRing.material.opacity = portalIn * 0.9;
    portalGlow.material.opacity = portalIn * 0.55;
    portal.rotation.z += dt * 0.35;

    const streaming = clamp01((p - 0.58) / 0.12) * (1 - clamp01((p - 0.88) / 0.1));
    particles.material.opacity = streaming * 0.95;
    particles.material.size = 0.11 * cineAnchor.unit;
    if (streaming > 0.01) {
      const arr = pGeo.attributes.position.array;
      const u0 = cineAnchor.unit;
      const zEnd = portal.position.z;
      for (let i = 0; i < P_COUNT; i++) {
        const s = pSeed[i];
        const u = (act.t * 0.55 + s) % 1;
        const spin = pAngle[i] + u * 4.6;
        const radius = lerp(1.35, 0.18, u) * (0.6 + s * 0.55) * u0;
        arr[i * 3] = Math.cos(spin) * radius * (1 - u * 0.35);
        arr[i * 3 + 1] =
          lerp(c.y - 0.7 * u0 + s * 1.4 * u0, portal.position.y, u) +
          Math.sin(spin) * radius * 0.35;
        arr[i * 3 + 2] = lerp(0.35 * u0, zEnd, u);
      }
      pGeo.attributes.position.needsUpdate = true;
    }

    if (p >= 1 && act.hold === null) stopActivation();
  }

  // ---- loop -------------------------------------------------------------
  let raf = 0;
  let running = false;
  let last = performance.now();
  let idleTime = 0;

  function resize() {
    const w = viewport.clientWidth || 1;
    const h = viewport.clientHeight || 1;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (mesh && !act.on) frameProduct();
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    idleTime += dt;

    if (act.on) {
      updateActivation(dt);
    } else if (state.showTag && state.hasNfc) {
      // idle breathing on the tag so it reads as live
      const b = 0.5 + 0.5 * Math.sin(idleTime * 2.1);
      tagGlow.material.opacity = 0.45 + b * 0.5;
      pulses[0].scale.setScalar(1 + ((idleTime * 0.5) % 1) * 3.2);
      pulses[0].material.opacity = (1 - ((idleTime * 0.5) % 1)) * 0.28;
      pulses[1].material.opacity = 0;
      pulses[2].material.opacity = 0;
    }

    controls.update();
    composer.render();
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(viewport);

  const io = new IntersectionObserver(
    ([entry]) => (entry.isIntersecting && !document.hidden ? start() : stop()),
    { rootMargin: "180px" },
  );
  io.observe(viewport);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (viewport.getBoundingClientRect().top < innerHeight) start();
  });

  // ---- capture ----------------------------------------------------------
  /**
   * Render one frame and return it as a PNG data URL. Capturing in the same
   * task as the render avoids needing preserveDrawingBuffer, which costs
   * frame time on mobile GPUs.
   */
  function capture(width = 1200, height = 900) {
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevRatio = renderer.getPixelRatio();
    const prevAuto = controls.autoRotate;

    controls.autoRotate = false;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frameProduct();
    composer.render();
    const url = renderer.domElement.toDataURL("image/png");

    renderer.setPixelRatio(prevRatio);
    renderer.setSize(prevSize.x, prevSize.y, false);
    composer.setSize(prevSize.x, prevSize.y);
    camera.aspect = prevSize.x / Math.max(prevSize.y, 1);
    camera.updateProjectionMatrix();
    frameProduct();
    controls.autoRotate = prevAuto;
    return url;
  }

  function resetView() {
    controls.target.set(0, homePos.y, 0);
    camera.position.set(0, homePos.y + homeDist * 0.04, homeDist);
    controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.update();
  }

  setProduct("tee");
  resize();
  start();
  onReady?.();

  return {
    setProduct,
    setColor,
    setActivation,
    setShowTag,
    setDecal,
    setDecalScale,
    setDecalY,
    startActivation,
    stopActivation,
    capture,
    resetView,
    resize,
    /** Scene state, for debugging from the console. */
    debug: () => ({
      homeDist,
      cam: camera.position.toArray(),
      target: controls.target.toArray(),
      dist: camera.position.distanceTo(controls.target),
      aspect: camera.aspect,
      boxSize: mesh
        ? new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3()).toArray()
        : [0, 0, 0],
      phone: cineAnchor.phone,
      phoneVisible: phone.visible,
      phonePos: phone.position.toArray(),
      phoneScaleNow: phone.scale.x,
      portalZ: portal.position.z,
      portalScale: cineAnchor.portalScale,
      portalScaleNow: portal.scale.x,
      particleOpacity: particles.material.opacity,
      productId: state.id,
      baseColor: state.base,
      hasDecal: !!(state.decal && state.decal.complete && state.decal.naturalWidth),
    }),
    /** Freeze the cinematic at a fixed progress (0-1). Pass null to resume. */
    seek(p) {
      if (p === null) {
        if (act.on) act.start = performance.now() - act.t * 1000;
        act.hold = null;
        return;
      }
      if (!act.on) startActivation();
      act.hold = clamp01(p);
    },
    get isActivating() {
      return act.on;
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    dispose() {
      stop();
      ro.disconnect();
      io.disconnect();
      geoCache.forEach((g) => g.dispose());
      envRT.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
