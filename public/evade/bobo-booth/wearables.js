// Bobo Booth wearables, built in code (no generative tools): the Bobo cat hat, the BOBO visor, Bobo shades and gold
// cat-eye shades (with a tiny 3D Bobo from the real keychain GLB), earrings (the real Eclipse can GLB as a drop, gold
// hoops, Bobo's collar bell) and nose rings.
//
// Units: the 8th Wall face's own local units ("FU"). 1 FU ~ 139 mm (the eyes are 0.453 FU apart = 63 mm).
// Axes (measured in the simulator): x = the wearer's left, y = up, z = BACK of the head (the face looks down -z).
// The origin sits inside the head between the ears. Flat colours only (no gradients, Dapo's platform rule).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export const MM = 1 / 139;                         // millimetres -> FU
export const COL = {
  tabby: '#f3ab5e', stripe: '#d8762c', cream: '#fde3bd', earPink: '#f4a3a8',
  visor: '#8cc8f8', visorDark: '#2f6fd0', white: '#ffffff', gold: '#e9b43c', ink: '#15131a', evadeGold: '#f6c344',
  canBlue: '#3f9be6', hoodie: '#1f6fd6',
};

// ---------------------------------------------------------------- shared materials and textures
const mats = {};
export function materials() {
  if (mats.gold) return mats;
  mats.gold = new THREE.MeshStandardMaterial({ color: COL.gold, metalness: 1, roughness: 0.22 });
  mats.silver = new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 1, roughness: 0.18 });
  mats.ink = new THREE.MeshStandardMaterial({ color: COL.ink, metalness: 0.1, roughness: 0.4 });
  mats.frameGold = new THREE.MeshStandardMaterial({ color: COL.evadeGold, metalness: 0.35, roughness: 0.35 });
  mats.frameBlue = new THREE.MeshStandardMaterial({ color: COL.hoodie, metalness: 0.1, roughness: 0.35 });
  mats.earOuter = new THREE.MeshStandardMaterial({ color: COL.tabby, roughness: 0.85 });
  mats.earInner = new THREE.MeshStandardMaterial({ color: COL.earPink, roughness: 0.9 });
  mats.visorDark = new THREE.MeshStandardMaterial({ color: COL.visorDark, roughness: 0.5, side: THREE.DoubleSide });
  mats.visorBrim = new THREE.MeshStandardMaterial({ color: COL.visor, roughness: 0.45, side: THREE.DoubleSide });
  return mats;
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// tabby fur over the beanie (equirect u = around, v = top->rim): flat base, tapered dark stripes, a cream band at the rim
function tabbyTex() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = COL.tabby; g.fillRect(0, 0, w, h);
    g.fillStyle = COL.stripe;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N * w, len = h * (0.55 + 0.25 * ((i * 37) % 7) / 7), wd = w / N * 0.32;
      g.beginPath(); g.moveTo(u - wd, 0);
      for (let y = 0; y <= len; y += 8) g.lineTo(u - wd * (1 - y / len) + Math.sin(y / 40 + i) * 10, y);
      for (let y = len; y >= 0; y -= 8) g.lineTo(u + wd * (1 - y / len) + Math.sin(y / 40 + i) * 10, y);
      g.closePath(); g.fill();
    }
    // the forehead "M" above the visor (front = u 0.75 with three's sphere mapping and our -z front)
    const fx = w * 0.75; g.lineWidth = 16; g.strokeStyle = COL.stripe; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(fx - 90, h * 0.62); g.lineTo(fx - 50, h * 0.36); g.lineTo(fx, h * 0.55); g.lineTo(fx + 50, h * 0.36); g.lineTo(fx + 90, h * 0.62); g.stroke();
  });
}
// the visor band: Bobo's light blue with dark blue edges and white BOBO lettering, like the charm
function visorTex() {
  return canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = COL.visor; g.fillRect(0, 0, w, h);
    g.fillStyle = COL.visorDark; g.fillRect(0, 0, w, h * 0.12); g.fillRect(0, h * 0.88, w, h * 0.12);
    g.fillStyle = COL.white; g.fillRect(0, h * 0.12, w, h * 0.035); g.fillRect(0, h * 0.845, w, h * 0.035);
    g.font = '900 150px "Exo 2", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 14; g.strokeStyle = COL.visorDark; g.strokeText('B O B O', w / 2, h * 0.53);
    g.fillStyle = COL.white; g.fillText('B O B O', w / 2, h * 0.53);
  });
}

// ---------------------------------------------------------------- hats
// The beanie is the top of an ellipsoid sitting on the head, tilted so the front rim rides up the forehead and the
// back drops to the nape. Its rim (in the tilt group's frame) is an ellipse at y = RIM_Y with radii RX/RZ.
const CAP = { rx: 0.66, ry: 0.68, rz: 0.76, theta: 0.57 * Math.PI, y: 0.29, z: 0.04, tilt: 0.3 };
const RIM_Y = CAP.ry * Math.cos(CAP.theta), RIM_K = Math.sin(CAP.theta);
function capFrame() { const g = new THREE.Group(); g.position.set(0, CAP.y, CAP.z); g.rotation.x = CAP.tilt; return g; }
function band(r0, r1, y0, y1, a0, a1, mat, n = 64) {   // a ribbon round the ellipse (angle 0 = front, -z)
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, s = Math.sin(a), c = Math.cos(a);
    pos.push(CAP.rx * RIM_K * r0 * s, y0, -CAP.rz * RIM_K * r0 * c, CAP.rx * RIM_K * r1 * s, y1, -CAP.rz * RIM_K * r1 * c);
    uv.push(1 - t, 0, 1 - t, 1);   // reversed so lettering reads the right way round from the front
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
function brim(r0, r1, y, a0, a1, droop, mat, n = 48) {   // a flat peak sticking out from the rim (front arc)
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n, s = Math.sin(a), c = Math.cos(a), w = Math.pow(Math.cos((i / n - 0.5) * Math.PI), 0.7);
    const rr = r0 + (r1 - r0) * w;
    pos.push(CAP.rx * RIM_K * r0 * s, y, -CAP.rz * RIM_K * r0 * c, CAP.rx * RIM_K * rr * s, y - droop * w, -CAP.rz * RIM_K * rr * c);
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
function visorBand(withBrim) {
  const m = materials(), g = new THREE.Group();
  const front = band(1.045, 1.04, RIM_Y - 0.01, RIM_Y + 0.17, -1.95, 1.95, new THREE.MeshStandardMaterial({ map: visorTex(), roughness: 0.45, side: THREE.DoubleSide }));
  g.add(front);
  if (withBrim) {
    const b = brim(1.04, 1.5, RIM_Y + 0.005, -1.05, 1.05, 0.06, m.visorBrim); g.add(b);
    const edge = brim(1.5, 1.53, RIM_Y - 0.055, -1.0, 1.0, 0.0, m.visorDark); edge.visible = false; g.add(edge);
  }
  return g;
}
function catEar(side) {
  const m = materials(), g = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.34, 4, 1), m.earOuter); outer.scale.set(1, 1, 0.38); outer.rotation.y = Math.PI / 4;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 4, 1), m.earInner); inner.scale.set(1, 1, 0.2); inner.rotation.y = Math.PI / 4;
  inner.position.set(0, -0.02, -0.045);
  g.add(outer, inner); g.name = 'catEar';
  // on the beanie's shell, up and out
  const a = side * 0.62, th = 0.24 * Math.PI;
  g.position.set(CAP.rx * Math.sin(th) * Math.sin(a) * 0.96, CAP.ry * Math.cos(th) * 0.96 + 0.12, -CAP.rz * Math.sin(th) * Math.cos(a) * 0.55);
  g.rotation.set(-0.12, -side * 0.35, -side * 0.38);
  return g;
}
export function buildCatHat(bobo = null) {
  const root = new THREE.Group(); root.name = 'catHat';
  const f = capFrame(); root.add(f);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, CAP.theta),
    new THREE.MeshStandardMaterial({ map: tabbyTex(), roughness: 0.92, side: THREE.DoubleSide }));
  shell.scale.set(CAP.rx, CAP.ry, CAP.rz); f.add(shell);
  // a cream cuff at the back (the rim not covered by the visor)
  f.add(band(1.035, 1.03, RIM_Y - 0.01, RIM_Y + 0.11, 1.95, Math.PI * 2 - 1.95, new THREE.MeshStandardMaterial({ color: COL.cream, roughness: 0.9, side: THREE.DoubleSide })));
  f.add(visorBand(false));
  f.add(catEar(1), catEar(-1));
  if (bobo) {   // the tiny Bobo sits on the crown, upright (undo the hat's tilt), between the ears
    bobo.position.set(0, CAP.ry * 0.96, 0.06); bobo.rotation.x = -CAP.tilt; bobo.userData.baseY = bobo.position.y; f.add(bobo);
  }
  return root;
}
export function buildVisor() {
  const root = new THREE.Group(); root.name = 'visor';
  const f = capFrame(); f.position.y -= 0.07; f.position.z -= 0.02; f.scale.setScalar(0.94); root.add(f);
  // a sun visor: the band goes all the way round (open top), with the peak at the front
  const m = materials();
  f.add(visorBand(true));
  f.add(band(1.04, 1.035, RIM_Y + 0.02, RIM_Y + 0.13, 1.95, Math.PI * 2 - 1.95, m.visorDark));
  return root;
}

// ---------------------------------------------------------------- shades
// Cat-eye lens outline (right lens of the picture = wearer's left, x>0), in FU, centred on the eye.
function lensPts(w, h, up) {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2, x = Math.cos(a), y = Math.sin(a);
    // squarer bottom, upswept outer-top corner
    let px = x * w / 2 * (1 + 0.06 * y), py = y * h / 2 * (y < 0 ? 0.92 : 1);
    if (x > 0 && y > 0) { const k = Math.pow(x * y * 2, 2.2); px += k * up * 0.25; py += k * up; }
    pts.push(new THREE.Vector2(px, py));
  }
  return pts;
}
function grow(pts, d) {   // offset a closed outline outward by d (approx: along the averaged normal)
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], t = b.clone().sub(a).normalize();
    return p.clone().add(new THREE.Vector2(t.y, -t.x).multiplyScalar(d));
  });
}
function lensTex(tint, decal, flip) {
  return canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h);
    if (decal) {
      // Bobo sits in the lower outer corner of each lens (never mirrored, so he reads the same on both)
      const s = h * 0.6, dw = s * decal.width / decal.height, x = flip ? w * 0.06 : w * 0.94 - dw;
      // the lens is seen from its back (it faces into the head), so draw the art mirrored to read right
      g.save(); g.translate(x + dw, h * 0.36); g.scale(-1, 1); g.drawImage(decal, 0, 0, dw, s); g.restore();
    }
  });
}
function planeUVs(geo, pts) {
  const bb = new THREE.Box2().setFromPoints(pts), sz = bb.getSize(new THREE.Vector2());
  const p = geo.attributes.position, uv = [];
  for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - bb.min.x) / sz.x, (p.getY(i) - bb.min.y) / sz.y);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}
export function buildShades({ frame = 'gold', tint = 'rgba(63,155,230,0.55)', decal = null, ears = 'bobo', bobo = null } = {}) {
  const m = materials(), root = new THREE.Group(); root.name = 'shades';
  const W = 0.40, H = 0.27, UP = 0.07, CX = 0.235, Z = -0.70, RIMW = 0.045, DEPTH = 0.035;
  const frameMat = frame === 'blue' ? m.frameBlue : m.frameGold;
  for (const side of [1, -1]) {
    const L = new THREE.Group(); L.position.set(side * CX, 0.015, Z); L.rotation.y = -side * 0.14;
    let inner = lensPts(W, H, UP), outer = grow(inner, RIMW);
    if (ears === 'spike') {   // plain cat-eye points on the top outer corner of each lens frame
      const i0 = 5, i1 = 10; const a = outer[i0], b = outer[i1];
      outer.splice(i0 + 1, i1 - i0 - 1, new THREE.Vector2((a.x + b.x) / 2 + 0.02, (a.y + b.y) / 2 + 0.085));
    }
    if (side < 0) { inner = inner.map((p) => new THREE.Vector2(-p.x, p.y)).reverse(); outer = outer.map((p) => new THREE.Vector2(-p.x, p.y)).reverse(); }
    const shape = new THREE.Shape(outer); shape.holes.push(new THREE.Path(inner.slice().reverse()));
    const fg = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 4 });
    fg.translate(0, 0, -DEPTH / 2);
    L.add(new THREE.Mesh(fg, frameMat));
    const lg = new THREE.ShapeGeometry(new THREE.Shape(inner), 6); planeUVs(lg, inner);
    const lm = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ map: lensTex(tint, decal, side < 0), transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    lm.renderOrder = 2; L.add(lm);
    // shine: one flat white sliver (no gradient)
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    sh.position.set(-0.08 * side, 0.02, -0.004); sh.rotation.z = side * 0.6; sh.renderOrder = 3; L.add(sh);
    if (ears === 'bobo') L.add(boboEar(side, frame));
    root.add(L);
    // temple arm back to the ear (hidden by the head occluder behind the face)
    const tx0 = side * (CX + W / 2 + 0.01), arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.64), frameMat);
    arm.position.set(side * 0.565, 0.055, Z + 0.34); arm.rotation.y = side * 0.1; root.add(arm);
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.05), frameMat); hinge.position.set(tx0 + side * 0.01, 0.06, Z + 0.03); root.add(hinge);
  }
  // bridge
  const br = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 16, Math.PI), frameMat);
  br.position.set(0, 0.05, Z - 0.005); root.add(br);
  if (bobo) {   // the tiny Bobo sitting on the bridge
    bobo.position.set(0, 0.105, Z - 0.03); root.add(bobo);
  }
  return root;
}

// Bobo's ear on the top outer corner of a lens: a rounded triangle with his pink inside and the charm's ink outline,
// tipped outward like his ears on the keychain
function earShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(-r * 0.6, h - r); s.quadraticCurveTo(0, h + r * 0.4, r * 0.6, h - r); s.lineTo(w / 2, 0);
  s.quadraticCurveTo(0, -h * 0.12, -w / 2, 0); return s;
}
function boboEar(side, frame) {
  const g = new THREE.Group(); g.name = 'boboEar';
  const outerCol = frame === 'blue' ? COL.hoodie : COL.tabby, innerCol = frame === 'blue' ? COL.visor : COL.earPink;
  const ex = (shape, d) => new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
  const ink = new THREE.Mesh(ex(earShape(0.2, 0.19, 0.035), 0.026), new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.5 }));
  ink.position.z = 0.006;
  const outer = new THREE.Mesh(ex(earShape(0.17, 0.165, 0.03), 0.03), new THREE.MeshStandardMaterial({ color: outerCol, roughness: 0.55 }));
  const inner = new THREE.Mesh(ex(earShape(0.095, 0.1, 0.022), 0.012), new THREE.MeshStandardMaterial({ color: innerCol, roughness: 0.6 }));
  outer.position.set(0, 0.012, -0.004); inner.position.set(0, 0.03, -0.022);
  g.add(ink, outer, inner);
  g.position.set(side * 0.13, 0.115, -0.012); g.rotation.z = -side * 0.42;
  return g;
}

// a die-cut sticker of Bobo's face from the real charm art, for the lenses
export function boboFaceDecal(img) {
  // the head in charm-bobo.png (809x923): roughly x 120..700, y 60..470; keep the art's own colours, alpha = the art
  const c = document.createElement('canvas'), sx = 120, sy = 60, sw = 580, sh = 410; c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

// the tiny Bobo (from the real keychain GLB): sitting, ~45 mm tall, facing out of the face (-z)
export function miniBobo(gltf, heightMm = 46) {
  const model = cloneSkinned(gltf.scene);
  model.traverse((o) => { if (o.name === 'Silhouette') o.visible = false; if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
  const body = model.getObjectByName('Bobo') || model;
  const bb = new THREE.Box3().setFromObject(body, true), size = bb.getSize(new THREE.Vector3());
  const k = heightMm * MM / size.y;
  const g = new THREE.Group(); g.name = 'miniBobo'; model.scale.setScalar(k); model.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k);
  const turn = new THREE.Group(); turn.rotation.y = Math.PI; turn.add(model); g.add(turn);
  const mixer = new THREE.AnimationMixer(model), clips = {};
  for (const c of gltf.animations) clips[c.name] = mixer.clipAction(c);
  g.userData = { mixer, clips, model };
  return g;
}

// ---------------------------------------------------------------- earrings (each hangs from a pivot and swings)
// Built hanging DOWN from the origin (the pivot at the lobe), in FU. `len` = pivot to centre of mass for the swing.
export function buildEarring(kind, can) {
  const m = materials(), g = new THREE.Group(); g.name = kind;
  const ring = (r, tube, arc = Math.PI * 2) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 40, arc), m.gold);
  if (kind === 'hoop') {
    const h = ring(0.095, 0.011); h.position.y = -0.095; h.rotation.y = Math.PI / 2.6; g.add(h); g.userData.len = 0.1;
  } else if (kind === 'can') {
    // the real Eclipse can GLB, ~24 mm tall, hanging by its pull tab from a small jump ring
    const h = ring(0.026, 0.006); h.position.y = -0.026; h.rotation.y = Math.PI / 2; g.add(h);
    const c = can.clone(true); c.traverse((o) => { if (o.name === 'Silhouette' || /Fizz/.test(o.name)) o.visible = false; if (o.isMesh) o.frustumCulled = false; });
    const bb = new THREE.Box3().setFromObject(c.getObjectByName('Can_Body') || c, true), sz = bb.getSize(new THREE.Vector3());
    const k = 24 * MM / sz.y; c.scale.setScalar(k);
    c.position.set(-(bb.min.x + bb.max.x) / 2 * k, -0.05 - bb.max.y * k, -(bb.min.z + bb.max.z) / 2 * k);
    g.add(c); g.userData.len = 0.12;
  } else if (kind === 'bell') {
    const h = ring(0.022, 0.005); h.position.y = -0.022; h.rotation.y = Math.PI / 2; g.add(h);
    const bell = new THREE.Group(); bell.position.y = -0.085;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.048, 28, 20), m.silver); bell.add(ball);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.02), m.ink); slot.position.set(0, -0.012, -0.04); slot.rotation.x = -0.4; bell.add(slot);
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), m.ink); hole.position.set(0, -0.032, -0.036); bell.add(hole);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.02, 12), m.silver); top.position.y = 0.05; bell.add(top);
    const star = new THREE.Mesh(starGeo(0.016, 0.007, 0.004), m.ink); star.position.set(0, 0.018, -0.046); bell.add(star);
    g.add(bell); g.userData.len = 0.085;
  } else if (kind === 'stud') {
    const s = new THREE.Mesh(starGeo(0.03, 0.013, 0.012), m.gold); s.rotation.y = Math.PI / 2; s.position.y = -0.01; g.add(s); g.userData.len = 0; g.userData.fixed = true;
  }
  return g;
}
export function starGeo(R, r, d) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: d * 0.4, bevelSize: d * 0.3, bevelSegments: 1 }); g.center(); return g;
}

// ---------------------------------------------------------------- nose pieces (placed at the nose tip, FU)
export function buildNose(kind) {
  const m = materials(), g = new THREE.Group(); g.name = kind;
  if (kind === 'septum') {
    // a closed clicker ring through the septum: its top half sits up inside the nose (the face mesh hides it), so only
    // the smooth curve shows under the nose, with a small bead at the bottom
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0105, 12, 48), m.gold);
    const ring = new THREE.Group(); ring.position.set(0, -0.06, 0.08); ring.rotation.x = 0.5; ring.add(r);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), m.gold); bead.position.set(0, -0.05, 0); ring.add(bead);
    g.add(ring);
  } else if (kind === 'hoop') {
    // a small hoop through the wearer's left nostril wing
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 10, 36), m.gold);
    r.position.set(0.118, -0.075, 0.075); r.rotation.set(0.2, 1.15, 0.25); g.add(r);
  } else if (kind === 'stud') {
    const s = new THREE.Mesh(starGeo(0.026, 0.011, 0.008), m.gold);
    s.position.set(0.112, -0.035, 0.05); s.rotation.set(0, 0.95, 0); g.add(s);
  }
  return g;
}

// ---------------------------------------------------------------- head occluder (no stencil: depth only)
// An ellipsoid a little inside the real head plus a neck, so the hat's back, the temple arms and the far earring hide
// behind the head. The live face mesh does the front of the face.
export function buildHeadOccluder() {
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat); head.scale.set(0.56, 0.82, 0.62); head.position.set(0, 0.06, 0.06);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.44, 1.6, 24), mat); neck.position.set(0, -1.1, 0.16);
  g.add(head, neck); g.traverse((o) => { o.renderOrder = -10; });
  return g;
}

// ---------------------------------------------------------------- appear / disappear (each piece has its own)
// wrap(): an animation wrapper centred on the piece (so it scales and spins about itself, not the head), plus the
// piece's spec. animFrame(w, spec, dir, t): dir 1 = arriving, -1 = leaving, t 0..1. Flat timing curves only.
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x) => x * x * x;
const easeOutBack = (x, k = 1.9) => 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2);
const easeOutElastic = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI / 3)) + 1);
const bounce = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
const sub = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
export const ANIM = {
  cathat: { in: 'drop', out: 'yeet', inS: 0.9, outS: 0.42, burstAt: 0.45, colors: ['#f3ab5e', '#fde3bd', '#8cc8f8'], sfx: 'mew' },
  visor: { in: 'spin', out: 'spinOff', inS: 0.85, outS: 0.4, burstAt: 0.7, colors: ['#8cc8f8', '#ffffff', '#2f6fd0'] },
  'shades:bobo': { in: 'flipDown', out: 'flipUp', inS: 0.8, outS: 0.38, burstAt: 0.55, colors: ['#f6c344', '#3f9be6', '#ffffff'], sfx: 'mew' },
  'shades:night': { in: 'slideIn', out: 'slideOut', inS: 0.7, outS: 0.36, burstAt: 0.6, colors: ['#1f6fd6', '#ffffff', '#8cc8f8'] },
  'shades:gold': { in: 'zoom', out: 'zoomOut', inS: 0.7, outS: 0.35, burstAt: 0.55, colors: ['#f6c344', '#ffffff', '#e9b43c'] },
  ears: { in: 'dangle', out: 'fall', inS: 0.75, outS: 0.38, burstAt: 0.3, colors: ['#f6c344', '#ffffff', '#3f9be6'], sfx: 'jingle' },
  'nose:septum': { in: 'twist', out: 'shrink', inS: 0.6, outS: 0.3, burstAt: 0.5, colors: ['#f6c344', '#ffffff'] },
  'nose:hoop': { in: 'pop', out: 'shrink', inS: 0.55, outS: 0.3, burstAt: 0.5, colors: ['#f6c344', '#ffffff'] },
  'nose:stud': { in: 'twinkle', out: 'shrink', inS: 0.7, outS: 0.3, burstAt: 0.55, colors: ['#ffffff', '#f6c344'] },
};
export function wrap(obj, cat, id) {
  const spec = ANIM[cat === 'hat' ? id : cat === 'ears' ? 'ears' : cat + ':' + id] || ANIM['nose:hoop'];
  const box = new THREE.Box3().setFromObject(obj, true), c = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  if (cat === 'ears') c.set(0, 0, 0);                 // earrings turn about the lobe
  const w = new THREE.Group(), inner = new THREE.Group(); inner.position.copy(c).negate(); inner.add(obj); w.add(inner);
  w.userData = { anim: spec, base: c.clone(), len: obj.userData.len, fixed: obj.userData.fixed };
  w.position.copy(c);
  return w;
}
export function animFrame(w, spec, dir, t, reduced) {
  const b = w.userData.base; w.position.copy(b); w.rotation.set(0, 0, 0); let s = 1;
  const parts = { ears: w.getObjectByName('catEar') ? [] : null, mini: w.getObjectByName('miniBobo') };
  if (reduced) { s = dir > 0 ? easeOutCubic(t) : 1 - t; w.scale.setScalar(Math.max(s, 0.0001)); w.visible = s > 0.001; return; }
  const name = dir > 0 ? spec.in : spec.out, e = dir > 0 ? t : t;
  switch (name) {
    case 'drop': {   // falls onto the head, bounces, the ears spring up after
      const k = bounce(Math.min(e / 0.75, 1)); w.position.y += (1 - k) * 1.3; w.rotation.z = (1 - k) * 0.35;
      const sq = Math.sin(sub(e, 0.3, 0.6) * Math.PI) * 0.12; w.scale.set(1 + sq, 1 - sq, 1 + sq); s = null;
      w.traverse((o) => { if (o.name === 'catEar') o.scale.setScalar(Math.max(0.0001, easeOutBack(sub(e, 0.45, 1), 3))); });
      if (parts.mini) { const m = sub(e, 0.6, 1); parts.mini.scale.setScalar(Math.max(0.0001, easeOutBack(m, 2.4))); parts.mini.position.y = parts.mini.userData.baseY + Math.sin(m * Math.PI) * 0.25; }
      break;
    }
    case 'yeet': { const k = easeInCubic(e); w.position.y += k * 1.4; w.rotation.y = k * 2.4; w.rotation.z = -k * 0.5; s = 1 - k * 0.7; break; }
    case 'spin': { const k = easeOutCubic(e); w.rotation.y = (1 - k) * -Math.PI * 2.5; w.position.y += (1 - k) * 0.35; s = easeOutBack(e, 1.6); break; }
    case 'spinOff': { const k = easeInCubic(e); w.rotation.y = k * Math.PI * 2; w.position.y += k * 0.8; s = 1 - k; break; }
    case 'flipDown': {   // slides down off the forehead, flips onto the nose; the tiny Bobo hops on last
      const k = easeOutBack(sub(e, 0, 0.7), 1.4); w.position.y += (1 - k) * 0.5; w.position.z += (1 - k) * -0.12; w.rotation.x = (1 - k) * -1.5;
      s = Math.min(1, sub(e, 0, 0.25) * 1.2 + 0.0001);
      w.traverse((o) => { if (o.name === 'boboEar') o.scale.setScalar(Math.max(0.0001, easeOutBack(sub(e, 0.5, 0.95), 3))); });
      break;
    }
    case 'flipUp': { const k = easeInCubic(e); w.position.y += k * 0.6; w.rotation.x = -k * 1.6; s = 1 - k; break; }
    case 'slideIn': { const k = easeOutBack(e, 1.3); w.position.x += (1 - k) * 1.8; w.rotation.y = (1 - k) * 1.3; w.rotation.z = (1 - k) * -0.4; break; }
    case 'slideOut': { const k = easeInCubic(e); w.position.x -= k * 1.8; w.rotation.y = -k * 1.3; s = 1 - k * 0.3; break; }
    case 'zoom': { const k = easeOutCubic(e); w.position.z += (1 - k) * -2.4; w.rotation.z = (1 - k) * Math.PI * 0.8; s = 1 + (1 - easeOutBack(e, 1.5)) * 0.6; break; }
    case 'zoomOut': { const k = easeInCubic(e); w.position.z += k * -2.2; w.rotation.z = -k * 1.2; s = 1 + k * 0.6; if (e > 0.85) s *= (1 - e) / 0.15; break; }
    case 'dangle': { w.position.y += (1 - easeOutCubic(e)) * 0.3; s = easeOutElastic(e); break; }
    case 'fall': { const k = easeInCubic(e); w.position.y -= k * 0.5; s = 1 - k; break; }
    case 'twist': { w.rotation.z = (1 - easeOutCubic(e)) * Math.PI * 1.5; s = easeOutElastic(e); break; }
    case 'twinkle': { w.rotation.y = (1 - easeOutCubic(e)) * Math.PI * 4; s = easeOutBack(e, 2.6); break; }
    case 'shrink': { const k = easeInCubic(e); w.rotation.z = k * 1.5; s = 1 - k; break; }
    default: s = easeOutBack(e, 2.2);   // pop
  }
  if (dir < 0 && name === 'yeet') {} // (handled above)
  if (s !== null) w.scale.setScalar(Math.max(s, 0.0001));
  w.visible = !(dir < 0 && t >= 1);
}
