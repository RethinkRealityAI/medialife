// The Photo mode's picture frame, built in code: an EVADE photo board (slate, a flat yellow inner border with arcade
// corner brackets, the EVADE logo and "Bobo's Hideout" on the bottom bar, a row of marquee dots on the top bar) on two
// slate legs. Model units: 1 tall, feet on y = 0, facing +z, with the selfie opening at x -0.04..0.405,
// y 0.385..0.93, in front of z = 0.112 (the photo mode fits the selfie plane there). Flat colours only.
import * as THREE from 'three';
import { BRAND, EV } from '../brand/brand';

const B = { x0: -0.13, x1: 0.495, y0: 0.2, y1: 1.0 }; // the board
const O = { x0: -0.04, x1: 0.405, y0: 0.385, y1: 0.93 }; // the opening
const PX = 900; // canvas px per unit

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

export async function boboPhotoFrame(): Promise<THREE.Group> {
  const g = new THREE.Group();
  g.name = 'bobo-frame';
  const w = B.x1 - B.x0, h = B.y1 - B.y0;
  const c = document.createElement('canvas');
  c.width = Math.round(w * PX); c.height = Math.round(h * PX);
  const x = c.getContext('2d')!;
  const X = (u: number) => (u - B.x0) * PX, Y = (v: number) => (B.y1 - v) * PX;
  x.fillStyle = EV.slate; x.fillRect(0, 0, c.width, c.height);
  // yellow inner border round the opening, then cyan corner brackets just outside it
  const ox = X(O.x0), oy = Y(O.y1), ow = (O.x1 - O.x0) * PX, oh = (O.y1 - O.y0) * PX;
  const t = 18;
  x.fillStyle = EV.yellow; x.fillRect(ox - t, oy - t, ow + 2 * t, oh + 2 * t);
  x.strokeStyle = EV.cyan; x.lineWidth = 8; x.lineCap = 'square';
  const k = 46, m = t + 16;
  for (const [cx, cy, sx, sy] of [[ox - m, oy - m, 1, 1], [ox + ow + m, oy - m, -1, 1], [ox - m, oy + oh + m, 1, -1], [ox + ow + m, oy + oh + m, -1, -1]] as const) {
    x.beginPath(); x.moveTo(cx, cy + sy * k); x.lineTo(cx, cy); x.lineTo(cx + sx * k, cy); x.stroke();
  }
  // marquee dots across the top bar
  const topBar = Y(B.y1) + (oy - t - Y(B.y1)) / 2;
  const n = 11;
  for (let i = 0; i < n; i++) {
    x.fillStyle = i % 3 === 0 ? EV.cyan : EV.yellow;
    x.beginPath(); x.arc(c.width * (0.12 + (0.76 * i) / (n - 1)), topBar, 6, 0, Math.PI * 2); x.fill();
  }
  // the opening is cut out (alpha), the selfie plane sits in it
  x.clearRect(ox, oy, ow, oh);
  // bottom bar: EVADE logo + "BOBO'S HIDEOUT"
  const barTop = oy + oh + t, barH = c.height - barTop;
  const [logo] = await Promise.all([loadImg(BRAND.logo), document.fonts?.load('italic 900 40px "Exo 2"').catch(() => null)]);
  if (logo) {
    const lh = barH * 0.3, lw = lh * (logo.naturalWidth / logo.naturalHeight);
    x.drawImage(logo, (c.width - lw) / 2, barTop + barH * 0.2, lw, lh);
  }
  x.fillStyle = EV.cyan;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `italic 900 ${Math.round(barH * 0.2)}px "Exo 2", "Arial Black", sans-serif`;
  x.fillText("BOBO'S HIDEOUT", c.width / 2, barTop + barH * 0.7);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide }),
  );
  front.position.set((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, 0.112);
  // a thin back board edge so it reads as a solid board from the side (flat deep slate)
  const slate = new THREE.MeshStandardMaterial({ color: EV.deep, roughness: 0.7 });
  const edge = (ww: number, hh: number, cx: number, cy: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.03), slate);
    m.position.set(cx, cy, 0.096);
    return m;
  };
  g.add(front,
    edge(w, O.y0 - B.y0, (B.x0 + B.x1) / 2, (B.y0 + O.y0) / 2),
    edge(w, B.y1 - O.y1, (B.x0 + B.x1) / 2, (O.y1 + B.y1) / 2),
    edge(O.x0 - B.x0, O.y1 - O.y0, (B.x0 + O.x0) / 2, (O.y0 + O.y1) / 2),
    edge(B.x1 - O.x1, O.y1 - O.y0, (O.x1 + B.x1) / 2, (O.y0 + O.y1) / 2));
  for (const lx of [B.x0 + 0.08, B.x1 - 0.08]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, B.y0 + 0.02, 12), slate);
    leg.position.set(lx, (B.y0 + 0.02) / 2, 0.096);
    g.add(leg);
  }
  return g;
}
