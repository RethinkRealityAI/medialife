// Bobo's Arcade: one arcade machine per EVADE experience (src/evade/catalog.ts, never a hard-coded list), standing
// round the hideout's hall. Started from public/evade/cola-run/arcade-cabinet.js and made cheap for phones:
//   - each machine's body (cabinet, trims, control deck, buttons, coin door) is ONE merged mesh with vertex colours
//     (one shared Lambert material for every machine), so a machine costs 4 draws: body, screen, marquee, floor pad;
//   - the screen shows the experience's thumbnail (a 256 x 192 canvas, no mipmaps), with a padlock when it's locked
//     and a SOON band when it isn't out yet; the marquee says its name in its accent colour (flat, no gradients);
//   - everything is made at load; ticking only changes colours and opacities (no shader changes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArcadeState } from '../catalog';

/** Machine size (metres): about 1.45 m tall, a little under kid-arcade size. */
export const CAB = { h: 1.45, w: 0.62, depth: 0.5, reach: 0.62 };
const K = CAB.h / 1.1; // arcade-cabinet.js builds 1.1 units tall
const BODY = 0x1d2a3a, INK = 0x15131a, RED = 0xe3243a, YELLOW = 0xf6c344, CYAN = 0x4fd6e8;

export interface Cabinet {
  item: ArcadeState;
  group: THREE.Group;
  /** Door-local floor point in front of the machine, where Bobo stands to play (set by the layout). */
  front: THREE.Vector3;
  /** Pick box in the cabinet's own space. */
  box: THREE.Box3;
  /** Highlight 0..1 (Bobo is near it / it was picked). */
  glow: number;
  tick(t: number): void;
  /** Redraw the screen and marquee (fonts arrived, lock state changed). */
  redraw(item?: ArcadeState): void;
}

// ------------------------------------------------------------------ thumbnails
/** Load every thumbnail as an image (same origin). Missing ones become null (the screen draws a plain card). */
export async function loadThumbs(items: ArcadeState[], progress: (p: number) => void): Promise<Map<string, HTMLImageElement | null>> {
  const out = new Map<string, HTMLImageElement | null>();
  let done = 0;
  await Promise.all(items.map((it) => new Promise<void>((res) => {
    const img = new Image();
    let settled = false;
    const end = (ok: boolean) => {
      if (settled) return;
      settled = true;
      out.set(it.id, ok ? img : null);
      progress(++done / Math.max(1, items.length));
      res();
    };
    img.decoding = 'async';
    img.onload = () => end(true);
    img.onerror = () => end(false);
    window.setTimeout(() => end(img.complete && img.naturalWidth > 0), 6000);
    img.src = it.img;
  })));
  return out;
}

// ------------------------------------------------------------------ canvas art
/** Ink or white on an accent fill, whichever reads better. */
function inkOn(color: string): string {
  const c = new THREE.Color(color);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
  return lum > 0.25 ? '#15131a' : '#ffffff';
}

function drawScreen(g: CanvasRenderingContext2D, item: ArcadeState, img: HTMLImageElement | null): void {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = '#0a1c2a';
  g.fillRect(0, 0, W, H);
  if (img && img.naturalWidth) {
    // cover-fit
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    try { g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); } catch { /* tainted / broken: plain card */ }
  } else {
    g.fillStyle = item.color;
    g.font = 'italic 900 34px "Exo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(item.name.toUpperCase(), W / 2, H / 2, W - 24);
  }
  if (item.locked) {
    g.fillStyle = 'rgba(10,28,42,0.74)';
    g.fillRect(0, 0, W, H);
    // padlock (flat)
    const cx = W / 2, cy = H / 2 - 8;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 9;
    g.beginPath(); g.arc(cx, cy - 10, 20, Math.PI, 0); g.lineTo(cx + 20, cy + 4); g.moveTo(cx - 20, cy + 4); g.lineTo(cx - 20, cy - 10); g.stroke();
    g.fillStyle = '#f6c344';
    g.fillRect(cx - 32, cy, 64, 46);
    g.fillStyle = '#15131a';
    g.beginPath(); g.arc(cx, cy + 18, 7, 0, 7); g.fill();
    g.fillRect(cx - 3, cy + 20, 6, 14);
    g.fillStyle = '#ffffff';
    g.font = '700 18px "Space Grotesk", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('LOCKED', cx, H - 14);
  } else if (item.soon) {
    g.fillStyle = 'rgba(10,28,42,0.55)';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#f6c344';
    g.fillRect(0, H / 2 - 26, W, 52);
    g.fillStyle = '#15131a';
    g.font = 'italic 900 34px "Exo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SOON', W / 2, H / 2 + 2);
  }
  // a thin bezel line in the accent colour
  g.strokeStyle = item.color;
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
}

function drawMarquee(g: CanvasRenderingContext2D, item: ArcadeState): void {
  const W = g.canvas.width, H = g.canvas.height;
  g.fillStyle = item.color;
  g.fillRect(0, 0, W, H);
  g.fillStyle = inkOn(item.color);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const text = item.name.toUpperCase();
  let size = 54;
  do {
    g.font = `italic 900 ${size}px "Exo 2", system-ui, sans-serif`;
    if (g.measureText(text).width <= W - 28) break;
    size -= 2;
  } while (size > 20);
  g.fillText(text, W / 2, H / 2 + 3);
}

function canvasTex(w: number, h: number): { tex: THREE.CanvasTexture; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return { tex, g };
}

// ------------------------------------------------------------------ geometry (shared)
let shared: { screen: THREE.BufferGeometry; marquee: THREE.BufferGeometry; pad: THREE.BufferGeometry; bodyMat: THREE.Material } | null = null;

function colored(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = (geo.index ? geo.toNonIndexed() : geo).translate(x * K, y * K, z * K);
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w * K, h * K, d * K);

/** One machine's body as a single geometry (its accent colour baked in). */
function bodyGeometry(accent: number): THREE.BufferGeometry {
  const parts = [
    colored(B(0.46, 0.52, 0.36), BODY, 0, 0.26, 0), // base
    colored(B(0.46, 0.42, 0.26), BODY, 0, 0.8, -0.05), // head
    colored(B(0.5, 0.04, 0.4), accent, 0, 0.52, 0.01), // control-deck lip
    colored(B(0.012, 1.0, 0.3), accent, -0.235, 0.5, 0), // side trims
    colored(B(0.012, 1.0, 0.3), accent, 0.235, 0.5, 0),
    colored(B(0.48, 0.1, 0.28), BODY, 0, 1.06, -0.04), // marquee box
    colored(B(0.42, 0.03, 0.14), INK, 0, 0.555, 0.12), // control deck
    colored(new THREE.CylinderGeometry(0.008 * K, 0.008 * K, 0.06 * K, 6), INK, -0.1, 0.6, 0.12), // stick
    colored(new THREE.SphereGeometry(0.022 * K, 10, 8), RED, -0.1, 0.635, 0.12), // knob
    colored(new THREE.CylinderGeometry(0.022 * K, 0.022 * K, 0.02 * K, 14), YELLOW, 0.05, 0.575, 0.12), // buttons
    colored(new THREE.CylinderGeometry(0.022 * K, 0.022 * K, 0.02 * K, 14), CYAN, 0.12, 0.575, 0.12),
    colored(B(0.12, 0.16, 0.01), INK, 0, 0.27, 0.181), // coin door
    colored(B(0.03, 0.05, 0.012), RED, 0, 0.3, 0.186), // coin slot
  ];
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

function sharedParts() {
  if (shared) return shared;
  shared = {
    screen: new THREE.PlaneGeometry(0.38 * K, 0.285 * K),
    marquee: new THREE.PlaneGeometry(0.48 * K, 0.1 * K),
    pad: new THREE.CircleGeometry(0.4 * K, 40).rotateX(-Math.PI / 2),
    bodyMat: new THREE.MeshLambertMaterial({ vertexColors: true }),
  };
  return shared;
}

/**
 * Build the machines (unplaced: the hideout lays them out). `mat` maps every material before first use (the AR stage
 * clones and patches them with the doorway clip; 3D passes them through).
 */
export function buildCabinets(items: ArcadeState[], thumbs: Map<string, HTMLImageElement | null>, mat: (m: THREE.Material) => THREE.Material = (m) => m): { group: THREE.Group; cabinets: Cabinet[] } {
  const group = new THREE.Group();
  group.name = 'bobos-arcade';
  const S = sharedParts();
  const bodyMat = mat(S.bodyMat);
  const cabinets: Cabinet[] = [];
  for (const it of items) {
    const g = new THREE.Group();
    g.name = `arcade-${it.id}`;
    g.matrixAutoUpdate = true;
    const accent = new THREE.Color(it.color).getHex();
    const body = new THREE.Mesh(bodyGeometry(accent), bodyMat);
    body.name = 'arcade-body';
    const scr = canvasTex(256, 192);
    const screenMat = mat(new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false })) as THREE.MeshBasicMaterial;
    const screen = new THREE.Mesh(S.screen, screenMat);
    screen.position.set(0, 0.8 * K, 0.0815 * K);
    screen.rotation.x = -0.08;
    screen.name = 'arcade-screen';
    const mq = canvasTex(512, 96);
    const marquee = new THREE.Mesh(S.marquee, mat(new THREE.MeshBasicMaterial({ map: mq.tex, toneMapped: false })));
    marquee.position.set(0, 1.06 * K, 0.1005 * K);
    marquee.name = 'arcade-marquee';
    const padMat = mat(new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false })) as THREE.MeshBasicMaterial;
    const pad = new THREE.Mesh(S.pad, padMat);
    pad.position.set(0, 0.004, CAB.reach);
    pad.renderOrder = 1;
    pad.name = 'arcade-pad';
    g.add(body, screen, marquee, pad);
    let item = it;
    const redraw = (next?: ArcadeState) => {
      if (next) item = next;
      drawScreen(scr.g, item, thumbs.get(item.id) ?? null);
      scr.tex.needsUpdate = true;
      drawMarquee(mq.g, item);
      mq.tex.needsUpdate = true;
    };
    redraw();
    const cab: Cabinet = {
      get item() { return item; },
      group: g,
      front: new THREE.Vector3(),
      box: new THREE.Box3(new THREE.Vector3(-0.27 * K, 0, -0.2 * K), new THREE.Vector3(0.27 * K, 1.12 * K, 0.22 * K)),
      glow: 0,
      tick(t: number) {
        const p = 0.5 + 0.5 * Math.sin(t * 3 + g.position.x);
        padMat.opacity = 0.28 + 0.22 * p + 0.35 * cab.glow;
        screenMat.color.setScalar(0.86 + 0.14 * Math.max(p * 0.6, cab.glow));
      },
      redraw,
    } as Cabinet;
    cabinets.push(cab);
    group.add(g);
  }
  // the brand fonts may arrive after the first draw: draw once more when they're in (texture upload only)
  try {
    void document.fonts?.ready.then(() => cabinets.forEach((c) => c.redraw()));
  } catch { /* old browser */ }
  return { group, cabinets };
}

/** Which machine a ray (in the cabinets' parent space) hits first. */
export function pickCabinet(cabinets: Cabinet[], ray: THREE.Ray, parentInv?: THREE.Matrix4): Cabinet | null {
  let best: Cabinet | null = null, bd = Infinity;
  const r = new THREE.Ray(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const c of cabinets) {
    c.group.updateMatrix();
    m.copy(c.group.matrix).invert();
    if (parentInv) m.multiply(parentInv);
    r.copy(ray).applyMatrix4(m);
    const p = r.intersectBox(c.box, v);
    if (!p) continue;
    const d = p.distanceToSquared(r.origin);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

