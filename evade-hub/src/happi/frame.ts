// The 3D Photo frame, built in code: a Happi photo board (orange, the coat's navy and white checker trim, the Happi
// logo on the bottom bar) on two navy legs. Model units like the old baked frame: 1 tall, feet on y = 0, facing +z,
// with the selfie opening at x -0.04..0.405, y 0.385..0.93, in front of z = 0.112 (the photo mode fits it there).
import * as THREE from 'three';
import { HAPPI } from './faceArt';

const B = { x0: -0.13, x1: 0.495, y0: 0.2, y1: 1.0 }; // the board
const O = { x0: -0.04, x1: 0.405, y0: 0.385, y1: 0.93 }; // the opening
const PX = 900; // canvas px per unit

export async function happiPhotoFrame(): Promise<THREE.Group> {
  const g = new THREE.Group();
  g.name = 'happi-frame';
  const w = B.x1 - B.x0, h = B.y1 - B.y0;
  const c = document.createElement('canvas');
  c.width = Math.round(w * PX); c.height = Math.round(h * PX);
  const x = c.getContext('2d')!;
  const X = (u: number) => (u - B.x0) * PX, Y = (v: number) => (B.y1 - v) * PX;
  x.fillStyle = HAPPI.orange; x.fillRect(0, 0, c.width, c.height);
  // checker trim round the opening
  const t = 22;
  for (let i = 0; ; i++) {
    let done = true;
    const ox0 = X(O.x0) - t * 2, ox1 = X(O.x1) + t * 2, oy0 = Y(O.y1) - t * 2, oy1 = Y(O.y0) + t * 2;
    for (let px = ox0, k = 0; px < ox1; px += t, k++) for (let r = 0; r < 2; r++) {
      x.fillStyle = (k + r) % 2 ? HAPPI.navy : '#ffffff';
      x.fillRect(px, oy0 + r * t, t, t); x.fillRect(px, oy1 - (2 - r) * t, t, t);
    }
    for (let py = oy0, k = 0; py < oy1; py += t, k++) for (let r = 0; r < 2; r++) {
      x.fillStyle = (k + r) % 2 ? HAPPI.navy : '#ffffff';
      x.fillRect(ox0 + r * t, py, t, t); x.fillRect(ox1 - (2 - r) * t, py, t, t);
    }
    if (done || i > 0) break;
  }
  // the opening is cut out (alpha), the selfie plane sits in it
  x.clearRect(X(O.x0), Y(O.y1), (O.x1 - O.x0) * PX, (O.y1 - O.y0) * PX);
  // logo on the bottom bar
  try {
    const img = new Image();
    img.src = '/evade/hub/img/happi-logo-sm.webp';
    await img.decode();
    const lh = (O.y0 - B.y0) * PX * 0.62, lw = lh * (img.width / img.height);
    x.drawImage(img, (c.width - lw) / 2, Y(B.y0) - (O.y0 - B.y0) * PX * 0.5 - lh / 2 + 6, lw, lh);
  } catch { /* the board still works without it */ }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.7, side: THREE.DoubleSide }),
  );
  front.position.set((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2, 0.112);
  // a thin back board edge so it reads as a solid board from the side (flat navy)
  const navy = new THREE.MeshStandardMaterial({ color: HAPPI.navy, roughness: 0.7 });
  const edge = (ww: number, hh: number, cx: number, cy: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, 0.03), navy);
    m.position.set(cx, cy, 0.096);
    return m;
  };
  g.add(front,
    edge(w, O.y0 - B.y0, (B.x0 + B.x1) / 2, (B.y0 + O.y0) / 2),
    edge(w, B.y1 - O.y1, (B.x0 + B.x1) / 2, (O.y1 + B.y1) / 2),
    edge(O.x0 - B.x0, O.y1 - O.y0, (B.x0 + O.x0) / 2, (O.y0 + O.y1) / 2),
    edge(B.x1 - O.x1, O.y1 - O.y0, (O.x1 + B.x1) / 2, (O.y0 + O.y1) / 2));
  for (const lx of [B.x0 + 0.08, B.x1 - 0.08]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, B.y0 + 0.02, 12), navy);
    leg.position.set(lx, (B.y0 + 0.02) / 2, 0.096);
    g.add(leg);
  }
  return g;
}
