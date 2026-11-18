// Face FX: selfie face effects on up to three faces (from the 8th Wall "face-effects" three.js sample).
// Engine: the open-source (MIT) 8th Wall engine's face chunk, vendored at /evade/keychain-ar/vendor/xr/ and booted
// the way Bobo Booth does it (front camera, mirroredDisplay, preload slam + face, no XrController module).
//
// Kept from the sample (src/face-scene.js, run-face-pipeline.js): a head per face id (maxDetections 3) anchored to
// the face transform; the stereo-glasses.glb frame at 1.1x on the nose bridge, +0.05 up, with a yellow and a purple
// lens (BackSide planes, 0.55 x 0.25, half opacity); the face mesh drawn with a texture and the sample's soft
// eyes-and-mouth alpha mask at 0.8 opacity; the head-occluder.glb as a depth-only occluder (renderOrder -1).
// Changed: the sample's tattoo art was 8th Wall's logo, so the paint and the mask are our own flat designs drawn on
// a canvas in the face's UV layout; looks are picked from a row of chips (Shades / Paint / Mask / All); the shutter
// takes a branded photo; MEDIALIFE watermark instead of the sample's.
import { createDemo, THREE, MEDIA, loadGLB, texture } from '../shared/shell.js';

const MAX_FACES = 3;
const LOOKS = [
  { id: 'shades', n: 'Shades', shades: true, paint: null },
  { id: 'paint', n: 'Paint', shades: false, paint: 'paint' },
  { id: 'mask', n: 'Mask', shades: false, paint: 'mask' },
  { id: 'all', n: 'All', shades: true, paint: 'paint' },
];
let look = 0, glassesProto = null, occluderProto = null, alphaTex = null, faceIdx = null, faceUvs = null;
const tex = {}; // paint / mask CanvasTextures
const rigs = new Map(); // id -> Rig

const demo = createDemo({
  slug: 'face-effects', mode: 'face', tag: 'Face',
  title: 'Face FX', titleHtml: 'Face <span>FX</span>',
  lead: 'Selfie face effects: try on 3D shades, face paint and a mask. Bring two friends.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="60" y="120" width="80" height="44" rx="14" fill="#ffc828"/><rect x="160" y="120" width="80" height="44" rx="14" fill="#ad50ff"/><rect x="136" y="132" width="28" height="10" fill="#fff"/></svg>`,
  how: [
    '<b>Look at your phone.</b> The effect appears on your face; up to three faces at once.',
    '<b>Pick a look</b> from the row: Shades, Paint, Mask or All.',
    '<b>Shutter</b> (bottom centre) takes a photo you can save or share.',
  ],
  faceConfig: { maxDetections: MAX_FACES },
  listeners: [
    { event: 'facecontroller.faceloading', process: ({ detail }) => onFaceLoading(detail) },
    { event: 'facecontroller.facefound', process: ({ detail }) => onFace(detail) },
    { event: 'facecontroller.faceupdated', process: ({ detail }) => onFace(detail) },
    { event: 'facecontroller.facelost', process: ({ detail }) => { const r = rigs.get(detail.id); if (r) r.hide(); } },
  ],
  async load(d) {
    const [g, o, a] = await Promise.all([loadGLB(MEDIA + 'stereo-glasses.glb'), loadGLB(MEDIA + 'head-occluder.glb'), texture(MEDIA + 'face-alpha.png', false)]);
    glassesProto = g.scene; occluderProto = o.scene; alphaTex = a;
    tex.paint = paintTexture(); tex.mask = maskTexture();
    d.progress(0.9);
  },
  hero() { const g = buildGlasses(); g.rotation.x = 0.15; return g; },
  build(d) {
    buildChips(d);
    if (faceIdx) for (const r of rigs.values()) r.makeMeshes();
  },
  onLive(d) { d.hint('Look at your phone'); },
  update(dt, d, now) {
    for (const [id, r] of rigs) if (r.anchor.visible && now - r.at > 400) r.hide(); // not updated: gone
    const any = [...rigs.values()].some((r) => r.anchor.visible);
    d.hint(any ? '' : 'Look at your phone');
  },
});

// ------------------------------------------------------------------ the sample's glasses
function buildGlasses() {
  const g = new THREE.Group();
  const frame = glassesProto.clone(true); frame.scale.setScalar(1.1); g.add(frame);
  const lens = (color, x) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.25, 1), new THREE.MeshStandardMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0.5, roughness: 0.25 }));
    m.position.set(x, -0.01, 0); return m;
  };
  g.add(lens(0xffc828, -0.3), lens(0xad50ff, 0.2));
  return g;
}

// ------------------------------------------------------------------ paint + mask art (flat, in the face UV layout)
// The face UVs put v up the face; drawn with the default flipY, canvas y = (1 - v). The sample's alpha mask uses
// the same layout: eyes at about (0.33, 0.38) and (0.65, 0.38), mouth at y 0.69, face outline inside 0.05-0.95.
function paintTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (x, y) => [x * S, y * S];
  g.fillStyle = '#4fd6e8';
  for (const side of [-1, 1]) { // three cheek stripes each side, angled down and out
    for (let i = 0; i < 3; i++) {
      g.save(); g.translate(...P(0.5 + side * 0.2, 0.55 + i * 0.04)); g.rotate(side * 0.18);
      g.fillRect(-0.06 * S, -0.011 * S, 0.12 * S, 0.022 * S); g.restore();
    }
  }
  g.fillStyle = '#ffffff'; // a row of dots across the brow
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(...P(0.5 + i * 0.045, 0.24 - Math.abs(i) * 0.006), 0.012 * S, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#c9f25a'; // a small diamond on the nose bridge
  g.save(); g.translate(...P(0.5, 0.36)); g.rotate(Math.PI / 4); g.fillRect(-0.018 * S, -0.018 * S, 0.036 * S, 0.036 * S); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function maskTexture() { // a flat hero mask: one colour with a thin band at the eyes; its edge comes from the alpha
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#16323a'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#4fd6e8'; g.fillRect(0, 0.31 * S, S, 0.15 * S);
  g.fillStyle = '#16323a'; g.fillRect(0, 0.36 * S, S, 0.05 * S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ one rig per face id
function onFaceLoading(d) {
  const idx = []; for (const t of d.indices) { if (typeof t === 'number') idx.push(t); else idx.push(t.a, t.b, t.c); }
  faceIdx = { idx, n: d.pointsPerDetection };
  if (d.uvs && d.uvs.length) { faceUvs = new Float32Array(d.uvs.length * 2); d.uvs.forEach((t, i) => { faceUvs[i * 2] = t.u; faceUvs[i * 2 + 1] = t.v; }); }
  for (const r of rigs.values()) r.makeMeshes();
}
class Rig {
  constructor(id) {
    this.id = id; this.at = 0;
    this.anchor = new THREE.Group(); this.anchor.visible = false; demo.scene.add(this.anchor);
    const occ = occluderProto.clone(true); occ.scale.set(1, 1.1, 1); // the sample's occluder, depth only
    occ.traverse((n) => { if (n.isMesh) { n.material = new THREE.MeshBasicMaterial({ colorWrite: false }); n.renderOrder = -1; } });
    this.anchor.add(occ);
    this.nose = new THREE.Group(); this.anchor.add(this.nose);
    this.glasses = buildGlasses(); this.glasses.position.set(0, 0.05, 0); this.nose.add(this.glasses);
    this.makeMeshes(); this.apply();
  }
  makeMeshes() {
    if (this.paint || !faceIdx) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3));
    geo.setIndex(faceIdx.idx);
    if (faceUvs) geo.setAttribute('uv', new THREE.BufferAttribute(faceUvs, 2));
    this.paint = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, alphaMap: alphaTex, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.paint.renderOrder = 1; this.paint.frustumCulled = false; this.anchor.add(this.paint);
    this.apply();
  }
  apply() {
    const L = LOOKS[look];
    this.glasses.visible = L.shades;
    if (this.paint) {
      this.paint.visible = !!L.paint;
      if (L.paint) { this.paint.material.map = tex[L.paint]; this.paint.material.alphaMap = L.paint === 'mask' ? alphaTex : null; this.paint.material.opacity = L.paint === 'mask' ? 0.92 : 0.9; this.paint.material.needsUpdate = true; }
    }
  }
  update(d) {
    const t = d.transform; if (!t) return;
    this.anchor.position.set(t.position.x, t.position.y, t.position.z);
    this.anchor.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    this.anchor.scale.setScalar(t.scale);
    const nb = d.attachmentPoints && d.attachmentPoints.noseBridge;
    if (nb) this.nose.position.set(nb.position.x, nb.position.y, nb.position.z);
    if (d.vertices && this.paint) {
      const a = this.paint.geometry.attributes.position, n = Math.min(a.count, d.vertices.length);
      for (let i = 0; i < n; i++) { const v = d.vertices[i]; a.setXYZ(i, v.x, v.y, v.z); }
      a.needsUpdate = true;
    }
    this.anchor.visible = true; this.at = performance.now();
  }
  hide() { this.anchor.visible = false; }
}
function onFace(d) {
  if (!demo.scene) return;
  let r = rigs.get(d.id);
  if (!r) {
    // face ids change when a face is lost and found: drop rigs unseen for a while before making room
    for (const [id, x] of rigs) if (!x.anchor.visible && performance.now() - x.at > 1500) { demo.scene.remove(x.anchor); rigs.delete(id); }
    if (rigs.size >= MAX_FACES) return;
    r = new Rig(d.id); rigs.set(d.id, r);
  }
  r.update(d);
}

function buildChips(d) {
  const row = document.createElement('div'); row.className = 'chips card-panel looks'; row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', 'Look');
  row.innerHTML = LOOKS.map((l, i) => `<button type="button" class="chip" role="radio" aria-pressed="${i === look}" aria-checked="${i === look}" data-i="${i}">${l.n}</button>`).join('');
  row.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) setLook(+b.dataset.i); });
  d.panel.appendChild(row);
}
function setLook(i) {
  look = i;
  document.querySelectorAll('.looks .chip').forEach((b, j) => { b.setAttribute('aria-pressed', String(j === i)); b.setAttribute('aria-checked', String(j === i)); });
  for (const r of rigs.values()) r.apply();
}

window.__fx = {
  setLook: (id) => setLook(LOOKS.findIndex((l) => l.id === id)),
  get faces() { return [...rigs.values()].filter((r) => r.anchor.visible).length; },
  get look() { return LOOKS[look].id; },
  get state() { return [...rigs.values()].map((r) => ({ glasses: r.glasses.visible, paint: !!(r.paint && r.paint.visible), map: r.paint && r.paint.material.map === tex.mask ? 'mask' : r.paint && r.paint.material.map === tex.paint ? 'paint' : null })); },
};
