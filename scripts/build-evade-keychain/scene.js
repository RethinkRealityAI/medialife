// Builds the EVADE activated keychain as a three.js scene (runs in the browser).
// Everything is procedural geometry; the only images are the supplied charm art PNGs (used as textures)
// and a QR code drawn from its module matrix. No generative image / image-to-3D tools are involved.
// Modelled in millimetres, converted to metres at the end (toMetres).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const PX_PER_MM = 14;
const THICK = 3.0;        // acrylic thickness (mm)
const BEVEL = 0.4;        // polished edge radius (mm)
const PRINT_INSET = 0.12; // print layer sits just inside each face (mm)

// ---------- image helpers ----------
const loadImage = (src) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = src; });

function imageData(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}

// Chamfer distance (px) from each pixel to the nearest "outside" pixel.
function distanceToOutside(inside, w, h) {
  const INF = 1e9, d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside[i] ? INF : 0;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!d[i]) continue; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + a); else v = Math.min(v, a);
    if (y > 0) { v = Math.min(v, d[i - w] + a); if (x > 0) v = Math.min(v, d[i - w - 1] + b); if (x < w - 1) v = Math.min(v, d[i - w + 1] + b); } else v = Math.min(v, a);
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!d[i]) continue; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + a); else v = Math.min(v, a);
    if (y < h - 1) { v = Math.min(v, d[i + w] + a); if (x < w - 1) v = Math.min(v, d[i + w + 1] + b); if (x > 0) v = Math.min(v, d[i + w - 1] + b); } else v = Math.min(v, a);
    d[i] = v;
  }
  return d;
}

// The charm PNGs show the clear acrylic border as semi-transparent white (alpha ~155) plus a drawn
// cut-line. Keep only the printed art: opaque pixels at least ~0.6 mm in from the die-cut edge.
function printLayer(src) {
  const { width: w, height: h, data } = src;
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = data[i * 4 + 3] >= 100 ? 1 : 0;
  const dist = distanceToOutside(inside, w, h);
  const out = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3];
    let k = Math.min(1, Math.max(0, (a - 155) / 100));
    if (dist[i] < 9) k = 0;
    out.data[i * 4] = data[i * 4]; out.data[i * 4 + 1] = data[i * 4 + 1]; out.data[i * 4 + 2] = data[i * 4 + 2];
    out.data[i * 4 + 3] = Math.round(k * 255);
  }
  return { out, inside, dist };
}

// The can's back print reads correctly from behind, i.e. it is the art flipped relative to the acrylic.
// The silhouette is not perfectly symmetric, so shrink the art 3% about its centre and clip it to the
// (mirrored) acrylic interior so nothing ever prints past the clear border.
function readableBack(layer) {
  const { out: src, dist } = layer, w = src.width, h = src.height;
  const c = toCanvas(src), t = document.createElement('canvas'); t.width = w; t.height = h;
  const g = t.getContext('2d', { willReadFrequently: true }), k = 0.97;
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, (w - w * k) / 2, (h - h * k) / 2, w * k, h * k);
  const img = g.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (dist[y * w + (w - 1 - x)] < 12) img.data[(y * w + x) * 4 + 3] = 0;
  }
  return img;
}

function toCanvas(imgData, scale = 1) {
  const c0 = document.createElement('canvas'); c0.width = imgData.width; c0.height = imgData.height;
  c0.getContext('2d').putImageData(imgData, 0, 0);
  if (scale === 1) return c0;
  const c = document.createElement('canvas'); c.width = Math.round(imgData.width * scale); c.height = Math.round(imgData.height * scale);
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c0, 0, 0, c.width, c.height);
  return c;
}

// "SCAN TO ACTIVATE" round label with QR, drawn over the can's moon logo (back print, per factory proof).
function drawQrLabel(canvas, qr, cx, cy, R) {
  const g = canvas.getContext('2d');
  g.save();
  g.shadowColor = 'rgba(20,24,48,0.35)'; g.shadowBlur = R * 0.05;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  g.restore();
  g.lineWidth = R * 0.035; g.strokeStyle = '#1b2147';
  g.beginPath(); g.arc(cx, cy, R * 0.93, 0, Math.PI * 2); g.stroke();
  // curved headline
  const text = 'SCAN TO ACTIVATE', fs = R * 0.15, rr = R * 0.76;
  g.fillStyle = '#1b2147'; g.font = `800 ${fs}px Inter, "Inter Display", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const track = fs * 0.12;
  const widths = [...text].map((ch) => g.measureText(ch).width + track);
  const total = widths.reduce((s, v) => s + v, 0) - track;
  let ang = -Math.PI / 2 - total / rr / 2;
  [...text].forEach((ch, i) => {
    const a = ang + (widths[i] - track) / rr / 2;
    g.save(); g.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
    ang += widths[i] / rr;
  });
  // QR modules
  const n = qr.size, side = R * 0.98, m = side / n, x0 = cx - side / 2, y0 = cy - side / 2 + R * 0.15;
  g.fillStyle = '#0d1030';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.data[r * n + c]) g.fillRect(x0 + c * m - 0.25, y0 + r * m - 0.25, m + 0.5, m + 0.5);
}

function texture(canvas, name) {
  const t = new THREE.CanvasTexture(canvas);
  t.name = name; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------- outline tracing ----------
// Moore-neighbour trace of the outer boundary of a binary mask -> pixel-centre polygon.
function traceOuter(mask, w, h) {
  let start = mask.indexOf(1);
  const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const fg = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const sx = start % w, sy = (start / w) | 0;
  let px = sx, py = sy, bi = 0; const pts = [[sx, sy]];
  for (let guard = 0; guard < w * h; guard++) {
    let found = false;
    for (let k = 1; k <= 8; k++) {
      const idx = (bi + k) % 8, qx = px + dirs[idx][0], qy = py + dirs[idx][1];
      if (fg(qx, qy)) {
        const pb = dirs[(bi + k - 1) % 8], bx = px + pb[0] - qx, by = py + pb[1] - qy;
        bi = dirs.findIndex((d) => d[0] === bx && d[1] === by);
        px = qx; py = qy; found = true; break;
      }
    }
    if (!found || (px === sx && py === sy)) break;
    pts.push([px, py]);
  }
  return pts;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return rdp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(pts.slice(idx), eps));
}

function chaikin(pts, iters) {
  for (let it = 0; it < iters; it++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    pts = out;
  }
  return pts;
}

function outlinePolygon(inside, w, h) {
  const raw = traceOuter(inside, w, h).map(([x, y]) => [x + 0.5, y + 0.5]);
  const half = Math.floor(raw.length / 2);           // simplify as two open halves of the loop
  const simp = rdp(raw.slice(0, half + 1), 0.8).slice(0, -1).concat(rdp(raw.slice(half).concat([raw[0]]), 0.8).slice(0, -1));
  return chaikin(simp, 1);
}

// ---------- acrylic charm ----------
function acrylicGeometry(poly, meta) {
  const [hx, hy] = meta.hole, s = PX_PER_MM;
  const shape = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2((x - hx) / s, -(y - hy) / s)));
  const hole = new THREE.Path(); hole.absarc(0, 0, meta.hole_r / s, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const depth = THICK - 2 * BEVEL;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelOffset: -BEVEL, bevelSegments: 5, curveSegments: 40,
  });
  geo.translate(0, 0, -depth / 2);
  // Flat caps (group 0) + smooth-shaded polished edge (group 1), merged back into one mesh.
  const caps = new THREE.BufferGeometry(), sides = new THREE.BufferGeometry();
  const pos = geo.getAttribute('position');
  const pick = (g) => { const a = []; for (let i = g.start; i < g.start + g.count; i++) a.push(pos.getX(i), pos.getY(i), pos.getZ(i)); return new THREE.Float32BufferAttribute(a, 3); };
  caps.setAttribute('position', pick(geo.groups[0])); caps.computeVertexNormals();
  sides.setAttribute('position', pick(geo.groups[1]));
  const smooth = mergeVertices(sides, 1e-4); smooth.computeVertexNormals();
  geo.dispose();
  return { faces: mergeVertices(caps, 1e-6), edge: smooth };
}

function printPlane(meta, tex, mat, back) {
  const s = PX_PER_MM, w = meta.w / s, h = meta.h / s;
  const g = new THREE.PlaneGeometry(w, h);
  if (back) {
    g.rotateY(Math.PI);
    if (back === 'mirror') { const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
  }
  g.translate((meta.w / 2 - meta.hole[0]) / s, -(meta.h / 2 - meta.hole[1]) / s, (back ? -1 : 1) * (THICK / 2 - PRINT_INSET));
  const m = new THREE.Mesh(g, mat);
  return m;
}

function printMaterial(name, tex) {
  return new THREE.MeshStandardMaterial({ name, map: tex, alphaTest: 0.5, transparent: false, roughness: 0.42, metalness: 0 });
}

// ---------- hardware ----------
class SubCurve extends THREE.Curve {
  constructor(base, t0, t1) { super(); this.base = base; this.t0 = t0; this.t1 = t1; }
  getPoint(t, out = new THREE.Vector3()) { let u = this.t0 + (this.t1 - this.t0) * t; u = ((u % 1) + 1) % 1; return this.base.getPoint(u, out); }
}
class Helix extends THREE.Curve {
  constructor(R, turns, rise, a0) { super(); Object.assign(this, { R, turns, rise, a0 }); }
  getPoint(t, out = new THREE.Vector3()) { const a = this.a0 + t * this.turns * Math.PI * 2; return out.set(this.R * Math.cos(a), this.R * Math.sin(a), (t - 0.5) * this.rise); }
}

function ovalCurve(a, b) {
  const pts = []; for (let i = 0; i < 24; i++) { const t = (i / 24) * Math.PI * 2; const c = Math.cos(t), s = Math.sin(t); pts.push(new THREE.Vector3(a * Math.sign(c) * Math.abs(c) ** 0.8, b * Math.sign(s) * Math.abs(s) ** 0.8, 0)); }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

function buildHardware(metal, metalDark) {
  const hw = new THREE.Group(); hw.name = 'Hardware';
  const mesh = (geo, name, mat = metal) => { const m = new THREE.Mesh(geo, mat); m.name = name; return m; };

  // Swivel lobster clasp, top of clasp at y = 0.
  const clasp = new THREE.Group(); clasp.name = 'Clasp';
  const V = (x, y) => new THREE.Vector3(x, y, 0);
  const bodyCurve = new THREE.CatmullRomCurve3([V(0, -1.35), V(3.4, -2.3), V(5.3, -5.2), V(5.6, -9.5), V(4.9, -14), V(3.4, -18.2), V(1.6, -20.6), V(0, -21.3),
    V(-1.6, -20.6), V(-3.4, -18.2), V(-4.9, -14), V(-5.6, -9.5), V(-5.3, -5.2), V(-3.4, -2.3)], true, 'centripetal');
  const r = 1.35, gate0 = 9.15 / 14, gate1 = 11.85 / 14;
  const body = new SubCurve(bodyCurve, gate1 + 0.012, gate0 - 0.012 + 1);
  clasp.add(mesh(new THREE.TubeGeometry(body, 160, r, 20, false), 'Clasp_Body'));
  for (const t of [gate1 + 0.012, gate0 - 0.012]) {
    const cap = mesh(new THREE.SphereGeometry(r, 20, 12), 'Clasp_Cap'); cap.position.copy(bodyCurve.getPoint(t)); clasp.add(cap);
  }
  // spring gate: slimmer bar set slightly inward, with thumb lever
  const gatePts = []; for (let i = 0; i <= 12; i++) { const p = bodyCurve.getPoint(gate0 + (gate1 - gate0) * (i / 12)); p.x += 0.35; gatePts.push(p); }
  clasp.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(gatePts), 40, 0.95, 16, false), 'Clasp_Gate', metalDark));
  const lever = mesh(new THREE.CapsuleGeometry(0.9, 2.6, 6, 16), 'Clasp_Lever', metalDark);
  const lp = bodyCurve.getPoint(gate0 + 0.015); lever.position.set(lp.x - 1.4, lp.y + 0.6, 0); lever.rotation.z = Math.PI / 2 + 0.5; clasp.add(lever);
  clasp.scale.z = 0.72;
  hw.add(clasp);

  // swivel barrel + eye
  const prof = [[0, -20.6], [1.45, -20.6], [1.45, -22.9], [2.2, -23.3], [2.45, -23.9], [2.45, -26.9], [2.2, -27.5], [1.2, -27.9], [1.0, -28.5], [0, -28.5]].map(([x, y]) => new THREE.Vector2(x, y));
  hw.add(mesh(new THREE.LatheGeometry(prof, 40), 'Swivel'));
  const eyeR = 3.0, eyeW = 0.85, eyeY = -28.5 - eyeR + 0.35;
  const eye = mesh(new THREE.TorusGeometry(eyeR, eyeW, 16, 56), 'Swivel_Eye'); eye.rotation.y = Math.PI / 2; eye.position.y = eyeY; hw.add(eye);

  // split ring: flat wire, two turns
  const SR = 12.5, SW = 0.7, flat = 0.55;
  const srY = eyeY - (eyeR - eyeW) - SW - SR;
  const helix = new Helix(SR, 1.94, 2 * SW * 2 * 0.98, -Math.PI / 2 + 0.55);
  const ring = new THREE.Group(); ring.name = 'Split_Ring'; ring.position.y = srY; ring.scale.z = flat;
  ring.add(mesh(new THREE.TubeGeometry(helix, 400, SW, 14, false), 'Split_Ring_Wire'));
  for (const t of [0, 1]) { const c = mesh(new THREE.SphereGeometry(SW, 14, 10), 'Split_Ring_End'); c.position.copy(helix.getPoint(t)); ring.add(c); }
  hw.add(ring);
  const ringPoint = (deg) => { const a = THREE.MathUtils.degToRad(deg); return new THREE.Vector3(SR * Math.cos(a), srY + SR * Math.sin(a), 0.3); };

  const JR = 4.0, JW = 0.55;
  const jumpRing = (name, center, tilt) => {
    const j = mesh(new THREE.TorusGeometry(JR, JW, 14, 56), name);
    j.rotation.set(tilt, Math.PI / 2, 0, 'XYZ'); j.position.copy(center); hw.add(j); return j;
  };
  const down = (tilt) => new THREE.Vector3(0, -Math.cos(tilt), Math.sin(tilt));

  // Rings hang physically: the upper wire of each ring rests on the wire it hangs from;
  // a charm's hole edge rests on its jump ring's lower wire.
  const anchors = {};
  const hole = (c, d) => c.clone().addScaledVector(d, JR).add(new THREE.Vector3(0, JW - 1.5, 0));
  { // Bobo: jump ring on the split ring, tipped back so the cat sits behind the can
    const tilt = -0.3, d = down(tilt), p = ringPoint(-124);
    const c = p.clone().addScaledVector(d, JR - JW - SW);
    jumpRing('Jump_Ring_Bobo', c, -tilt);
    anchors.bobo = hole(c, d);
  }
  { // Eclipse: jump ring + three-link chain + jump ring, tipped forward
    const p = ringPoint(-56), d0 = down(0);
    const c1 = p.clone().addScaledVector(d0, JR - JW - SW);
    jumpRing('Jump_Ring_Eclipse_Top', c1, 0);
    const LA = 1.7, LB = 2.75, LW = 0.45, link = ovalCurve(LA, LB);
    let bottom = c1.y - JR, w = JW;
    for (let i = 0; i < 3; i++) {
      const l = mesh(new THREE.TubeGeometry(link, 64, LW, 12, true), `Chain_Link_${i + 1}`);
      l.position.set(c1.x, bottom + w + LW - LB, c1.z);
      if (i % 2 === 1) l.rotation.y = Math.PI / 2; // links alternate XY / YZ planes (jump rings are YZ)
      hw.add(l);
      bottom = l.position.y - LB; w = LW;
    }
    const tilt = 0.28, d = down(tilt);
    const c2 = new THREE.Vector3(c1.x, bottom, c1.z).addScaledVector(d, JR - JW - LW);
    jumpRing('Jump_Ring_Eclipse', c2, -tilt);
    anchors.eclipse = hole(c2, d);
  }
  return { hw, anchors };
}

// ---------- assemble ----------
export async function buildKeychain({ base, qr, acrylicMode = 'transmission' }) {
  const meta = await (await fetch(`${base}/meta.json`)).json();
  const [catImg, canImg] = await Promise.all([loadImage(`${base}/charm-bobo.png`), loadImage(`${base}/charm-eclipse.png`)]);
  const cat = printLayer(imageData(catImg)), can = printLayer(imageData(canImg));
  const mb = meta['charm-bobo'], me = meta['charm-eclipse'];

  const catTex = texture(toCanvas(cat.out), 'Print_Bobo');
  const canFrontTex = texture(toCanvas(can.out), 'Print_Eclipse_Front');
  const BACK_SCALE = 1024 / me.h;
  const canBackCanvas = toCanvas(readableBack(can), BACK_SCALE);
  drawQrLabel(canBackCanvas, qr, 224 * BACK_SCALE, 495 * BACK_SCALE, 110 * BACK_SCALE); // over the moon logo
  const canBackTex = texture(canBackCanvas, 'Print_Eclipse_Back');

  const acrylic = new THREE.MeshPhysicalMaterial({
    name: 'Acrylic_Clear', color: 0xffffff, metalness: 0, roughness: 0.03, ior: 1.49, specularIntensity: 1,
    transmission: acrylicMode === 'blend' ? 0 : 1, transparent: true, opacity: 0.2, side: THREE.FrontSide, depthWrite: false,
  });
  // Polished acrylic edges read bright and glassy (internal reflection), so they get their own material.
  const edge = new THREE.MeshPhysicalMaterial({
    name: 'Acrylic_Polished_Edge', color: 0xe4ecf7, metalness: 0, roughness: 0.14, ior: 1.49, clearcoat: 1, clearcoatRoughness: 0.04,
    transparent: true, opacity: 0.62, depthWrite: false,
  });
  const metal = new THREE.MeshStandardMaterial({ name: 'Metal_Nickel', color: 0xdfe2e6, metalness: 1, roughness: 0.24 });
  const metalDark = new THREE.MeshStandardMaterial({ name: 'Metal_Nickel_Brushed', color: 0xc9cdd3, metalness: 1, roughness: 0.34 });

  const charm = (name, img, metaC, poly, front, backTex, backMode) => {
    const g = new THREE.Group(); g.name = name;
    const geo = acrylicGeometry(poly, metaC);
    const body = new THREE.Mesh(geo.faces, acrylic); body.name = `${name}_Acrylic`; body.renderOrder = 2;
    const rim = new THREE.Mesh(geo.edge, edge); rim.name = `${name}_Edge`; rim.renderOrder = 1;
    const f = printPlane(metaC, front, printMaterial(`${name}_Print_Front`, front), false); f.name = `${name}_Print_Front`;
    const b = printPlane(metaC, backTex, backTex === front ? f.material : printMaterial(`${name}_Print_Back`, backTex), backMode); b.name = `${name}_Print_Back`;
    g.add(f, b, rim, body);
    return g;
  };
  const catPoly = outlinePolygon(cat.inside, mb.w, mb.h);
  const canPoly = outlinePolygon(can.inside, me.w, me.h);
  const bobo = charm('Charm_Bobo', catImg, mb, catPoly, catTex, catTex, 'mirror');
  const eclipse = charm('Charm_Eclipse', canImg, me, canPoly, canFrontTex, canBackTex, 'readable');

  const { hw, anchors } = buildHardware(metal, metalDark);
  bobo.position.copy(anchors.bobo); bobo.rotation.z = THREE.MathUtils.degToRad(-11);
  eclipse.position.copy(anchors.eclipse); eclipse.rotation.z = THREE.MathUtils.degToRad(9);

  const root = new THREE.Group(); root.name = 'EVADE_Keychain';
  root.add(hw, bobo, eclipse);
  toMetres(root);
  root.userData = { units: 'metres', pivot: 'origin = top of clasp; Charm_* origins = hole centres', points: { bobo: catPoly.length, eclipse: canPoly.length } };
  return root;
}

function toMetres(root) {
  const s = 0.001;
  root.traverse((o) => { if (o !== root) o.position.multiplyScalar(s); if (o.isMesh) o.geometry.scale(s, s, s); });
}
