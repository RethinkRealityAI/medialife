// Spray Bobo's room modes: your painting, out in the room (world tracking on the 8th Wall engine binary).
//   Hang      your painting (or a sticker) goes up as a poster on a wall, or stands up as a cut-out on the floor.
//   Stamp     tap any surface to stamp your art on it, ink and all.
//   Graffiti  spray straight onto walls and floors: the footprint grows with distance, wet paint drips down.
//
// How walls are found (the engine has NO vertical plane detection: its hit tests return feature points only,
// a position with no rotation; probed in the simulator 2026-11-17). Every frame a few hit tests around the aim
// collect 3D points; a plane is fitted to the recent ones (PCA) and snapped: upright if it is nearly upright
// (walls), flat if nearly flat (tables), else kept as it is (a slanted object, for stamps). The floor is the
// plane y = 0 (responsive scale, camera starts at CAM_H). A plain wall with too few points still gets a depth
// (the engine fills it in from nearby detail), and then it is taken as a wall facing the phone.
//
// Spray Bobo (main.js) owns the camera session, the shutter, the options sheet and the sound context; this
// module owns the room HUD (#room, ids r-*) and everything placed in the room. Things placed stay in the room
// when you go back to the merch, and are still there when you come back.
import * as THREE from 'three';

export const CAM_H = 1.3;                     // camera start height: ~1 unit = 1 m on a floor (responsive scale)

export function createRoom(api) {
const $ = (id) => document.getElementById('r-' + id);
const root = document.getElementById('room');
const params = new URLSearchParams(location.search);
const HERE = '/evade/spray-bobo/';
// the brand (see main.js): MEDIALIFE Spray sets window.SPRAY_BRAND; its room keeps its own art and colours.
// hidePieces: paintings this brand's room leaves out (a Sukeban tee painted here before it moved to MEDIALIFE Spray)
const BRAND = Object.assign({ id: 'evade', db: 'spray-bobo', hideDecalCats: [], hidePieces: ['sukeban'] }, window.SPRAY_BRAND || {});
const ML = BRAND.id === 'medialife';
const clamp = THREE.MathUtils.clamp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const backOut = (x) => { const c = 1.9; x = clamp(x, 0, 1) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('sbs-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('sbs-' + k, v); } catch (e) { /* none */ } } };

const CAPS = ML ? [                           // MEDIALIFE Spray's colours, the same as its merch canvas
  { c: '#19afff', n: 'MEDIALIFE blue' }, { c: '#ff2fae', n: 'MEDIALIFE magenta' }, { c: '#f6c344', n: 'Yellow' }, { c: '#8cc8f8', n: 'Sky' },
  { c: '#ff3b4e', n: 'Red' }, { c: '#ff8a2a', n: 'Orange' }, { c: '#3ddc84', n: 'Green' }, { c: '#7a5cff', n: 'Purple' },
  { c: '#ffffff', n: 'White' }, { c: '#15131a', n: 'Black' },
] : [                                         // the colours ("caps"), the same as Spray Bobo
  { c: '#f6c344', n: 'EVADE yellow' }, { c: '#3f9be6', n: 'Bobo blue' }, { c: '#8cc8f8', n: 'Sky' }, { c: '#e85bd8', n: 'Magenta' },
  { c: '#ff3b4e', n: 'Red' }, { c: '#ff8a2a', n: 'Orange' }, { c: '#3ddc84', n: 'Green' }, { c: '#7a5cff', n: 'Purple' },
  { c: '#ffffff', n: 'White' }, { c: '#15131a', n: 'Black' },
];
// nozzles: the spray's half-angle. At 1 m: skinny ~3 cm wide, medium ~6 cm, fat ~12 cm
const NOZZLES = [{ n: 'Skinny', a: 1.8, dot: 7 }, { n: 'Medium', a: 3.5, dot: 11 }, { n: 'Fat', a: 7, dot: 16 }];
const PANEL_M = 3.2, PANEL_PX = 1280;         // a graffiti wall: 3.2 m square at 2.5 mm a pixel
const MAX_PANELS = 6, MAX_STAMPS = 40, MAX_HUNG = 12;
const SIZE = { hang: [0.15, 2.5, 0.55], stamp: [0.06, 1.2, 0.28] };   // min, max, default height (m)

// sound: made here (no files), on Spray Bobo's audio context, through its master (so clips record it)
const sound = {
  ctx: null, master: null, hiss: null,
  get on() { return api.soundOn(); },
  init() {
    try {
      if (this.master || !api.audio()) return;
      const { ctx, dest } = api.audio(); this.ctx = ctx;
      this.master = ctx.createGain(); this.master.connect(dest);
      const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
      const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 6500; bp.gain.value = 8;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(hp).connect(bp).connect(g).connect(this.master); s.start(); this.hiss = g;
    } catch (e) { /* no audio */ }
  },
  spray(level) { if (!this.hiss) return; this.hiss.gain.setTargetAtTime(this.on ? level * 0.16 : 0, this.ctx.currentTime, level ? 0.025 : 0.06); },
  tone(f0, f1, dur, vol = 0.2, type = 'sine', when = 0) {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, hp, lp, when = 0) {
    if (!this.ctx || !this.on) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.6);
    const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    s.connect(f1).connect(f2).connect(g).connect(this.master); s.start(this.ctx.currentTime + when);
  },
  slap() { this.noise(0.09, 0.4, 300, 5000); this.tone(180, 70, 0.12, 0.2); },
  thunk() { this.tone(140, 60, 0.1, 0.32, 'triangle'); this.noise(0.05, 0.22, 600, 4000); },
  whoosh() { this.noise(0.3, 0.07, 900, 5000); },
  pick() { this.tone(500, 900, 0.1, 0.08, 'triangle'); },
  click() { this.tone(900, 700, 0.05, 0.06, 'square'); },
  rattle() { for (let i = 0; i < 3; i++) { const w = i * 0.075; this.tone(2600, 1700, 0.035, 0.06, 'square', w); this.noise(0.04, 0.1, 2000, 7000, w); } },
  splat() { this.noise(0.14, 0.18, 200, 2500); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
  undo() { this.tone(700, 420, 0.12, 0.08, 'triangle'); },
};

// ---------------------------------------------------------------- the art: your paintings + the sticker library
// item: { id, kind: 'mine' | 'decal', name, canvas (die-cut, transparent), aspect, tex, colour (its main colour) }
const LIB = { mine: [], decals: [], cat: 'mine', sel: null };
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open(BRAND.db, 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
async function loadMine() {
  try {
    const db = await idb(); const st = () => db.transaction('kv').objectStore('kv');
    const keys = await new Promise((res) => { const q = st().getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    const recs = [];
    for (const k of keys) if (typeof k === 'string' && k.startsWith('street:') && !(BRAND.hidePieces || []).includes(k.slice(7))) {
      const r = await new Promise((res) => { const q = st().get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
      if (r && r.png) recs.push(r);
    }
    recs.sort((a, b) => (b.at || 0) - (a.at || 0));
    for (const r of recs) {
      try {
        const bmp = await createImageBitmap(r.png), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d').drawImage(bmp, 0, 0);
        LIB.mine.push(makeItem('mine:' + r.k, 'mine', r.title || 'My painting', c, r.k));
      } catch (e) { console.warn('street art', e); }
    }
  } catch (e) { /* none saved on this phone */ }
}
function mainColour(c) {
  try {
    const s = document.createElement('canvas'); s.width = s.height = 24; const g = s.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data; let best = null, bs = -1;
    for (let i = 0; i < d.length; i += 4) {   // the most saturated solid pixel
      if (d[i + 3] < 200) continue; const col = new THREE.Color(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255), hsl = {}; col.getHSL(hsl);
      const sc = hsl.s * (1 - Math.abs(hsl.l - 0.5) * 1.6); if (sc > bs) { bs = sc; best = col; }
    }
    return best ? '#' + best.getHexString() : '#f6c344';
  } catch (e) { return '#f6c344'; }
}
function makeItem(id, kind, name, canvas, k) {
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return { id, kind, name, canvas, k, aspect: canvas.width / canvas.height, tex, colour: mainColour(canvas) };
}
// a decal as a die-cut sticker: white border all round, like the Spray Bobo stickers
async function loadDecal(d) {
  const img = await loadImg(HERE + 'decals/' + d.file);
  const iw = img.naturalWidth || 256, ih = img.naturalHeight || 256, k = 480 / Math.max(iw, ih);
  const w = Math.round(iw * k), h = Math.round(ih * k), pad = Math.round(Math.max(w, h) * 0.06);
  const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; const g = c.getContext('2d');
  const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d');
  tg.drawImage(img, 0, 0, w, h); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, w, h);
  for (let a = 0; a < 16; a++) g.drawImage(t, pad + Math.cos(a * 0.3927) * pad * 0.9, pad + Math.sin(a * 0.3927) * pad * 0.9);
  g.drawImage(img, pad, pad, w, h);
  return makeItem('decal:' + d.id, 'decal', d.name, c);
}
async function loadDecals() {
  try {
    const lib = await fetch(HERE + 'decals/decals.json').then((r) => r.json());
    // fun stickers and EVADE icons first: they stand on their own on a wall (the "wear" ones are made for Bobo's face)
    const order = { fun: 0, game: 1, wear: 2 };
    const hide = new Set(BRAND.hideDecalCats);
    const list = lib.decals.filter((d) => !hide.has(d.cat)).sort((a, b) => (order[a.cat] ?? 3) - (order[b.cat] ?? 3));
    const items = await Promise.all(list.map((d) => loadDecal(d).catch(() => null)));
    LIB.decals = items.filter(Boolean);
  } catch (e) { console.warn('decals', e); }
}
// the tray steps aside once something is up (the Art button brings it back), so the room is in view
function trayAway() { if (!root.classList.contains('tray-off')) { root.classList.add('tray-off'); $('b-art').setAttribute('aria-expanded', 'false'); } }
function selectArt(it) {
  LIB.sel = it; renderTray(); ghostArt();
}
function renderTray() {
  root.querySelectorAll('.tcats button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.c === LIB.cat)));
  const L = $('tray').querySelector('.tlist'); L.innerHTML = '';
  const list = LIB.cat === 'mine' ? LIB.mine : LIB.decals;
  if (LIB.cat === 'mine' && !list.length) {
    const p = document.createElement('p'); p.className = 'tempty'; p.textContent = 'No paintings yet on this phone.'; L.appendChild(p);
  }
  for (const it of list) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tile'; b.setAttribute('aria-label', it.name); b.setAttribute('aria-pressed', String(LIB.sel === it));
    const t = document.createElement('canvas'); const s = 112, k = Math.min(s / it.canvas.width, s / it.canvas.height); t.width = s; t.height = s;
    t.getContext('2d').drawImage(it.canvas, (s - it.canvas.width * k) / 2, (s - it.canvas.height * k) / 2, it.canvas.width * k, it.canvas.height * k);
    b.appendChild(t); b.onclick = () => { sound.click(); if (carry) dropCarry(true); selectArt(it); };
    L.appendChild(b);
  }
  if (LIB.cat === 'mine') {
    const a = document.createElement('button'); a.type = 'button'; a.className = 'tile paint'; a.innerHTML = '<b>+</b><span>Paint one</span>'; a.setAttribute('aria-label', 'Paint a new one: back to your merch'); a.onclick = () => api.leave(); L.appendChild(a);
  }
}
root.querySelectorAll('.tcats button').forEach((b) => { b.onclick = () => { LIB.cat = b.dataset.c; renderTray(); }; });

// ---------------------------------------------------------------- scene
let scene = null, camera = null;
const world = new THREE.Group();              // everything placed
const ghost = new THREE.Group();              // what you are about to place, on the surface under the aim
let ghostRing, ghostArtMesh, ghostShadow, ghostCarry = null;
const V = () => new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let built = false;
// (re)attach to the engine's scene: the engine makes a new scene and camera each time the session restarts
function attach(sc, cam) {
  scene = sc; camera = cam;
  scene.add(world); scene.add(ghost);
  if (built) return; built = true;
  // the reticle: a ring lying on the surface + the art about to go up
  ghostRing = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.11, 48), new THREE.MeshBasicMaterial({ color: 0x15131a, transparent: true, opacity: 0.5, depthTest: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), new THREE.MeshBasicMaterial({ color: 0xf6c344, depthTest: false }));
  for (const m of [ring2, ring, dot]) { m.renderOrder = 50; ghostRing.add(m); }
  ghost.add(ghostRing);
  ghostShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  ghostArtMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  ghostArtMesh.renderOrder = 40; ghostShadow.renderOrder = 39;
  ghost.add(ghostShadow); ghost.add(ghostArtMesh);
  ghost.visible = false;
  makeSplats();
  ghostArt();
}
function ghostArt() {
  if (!ghostArtMesh) return;
  const it = carry && carry.art ? carry.art : LIB.sel;
  ghostArtMesh.material.map = it ? it.tex : null; ghostArtMesh.material.needsUpdate = true;
  ghostShadow.material.alphaMap = it ? it.tex : null; ghostShadow.material.needsUpdate = true;
}

// ---------------------------------------------------------------- surfaces: floor, walls, anything (see top)
const SURF = { ok: false, kind: '', p: V(), n: V(), dist: 0, rms: 0, npts: 0, pend: '', pendN: 0, src: '' };
const PTS = [];                               // recent hit points { p, t }
const RING = [[-0.08, 0], [0.08, 0], [0, -0.06], [0, 0.06], [-0.06, -0.05], [0.06, -0.05], [-0.06, 0.05], [0.06, 0.05], [-0.13, 0], [0.13, 0]];
let ringI = 0;
const ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(UP.clone(), 0);
function hitAt(x, y) {   // x, y: 0..1 of the screen; the engine's feature-point hit, or null
  try {
    const h = XR8.XrController.hitTest(x, y, ['FEATURE_POINT']);
    for (const a of h) if (a.distance > 0.15 && a.distance < 9) return new THREE.Vector3(a.position.x, a.position.y, a.position.z);
  } catch (e) { /* not ready */ }
  return null;
}
// plane fit: centroid + the covariance's smallest eigenvector (Jacobi on the 3x3)
function fitPlane(pts) {
  const n = pts.length; if (n < 4) return null;
  const c = V(); for (const p of pts) c.add(p); c.multiplyScalar(1 / n);
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) { const x = p.x - c.x, y = p.y - c.y, z = p.z - c.z; xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; }
  const A = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]], Vm = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 12; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) < 1e-12) continue;
      const th = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]), cs = Math.cos(th), sn = Math.sin(th);
      for (let k = 0; k < 3; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = cs * akp - sn * akq; A[k][q] = sn * akp + cs * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = cs * apk - sn * aqk; A[q][k] = sn * apk + cs * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = Vm[k][p], vkq = Vm[k][q]; Vm[k][p] = cs * vkp - sn * vkq; Vm[k][q] = sn * vkp + cs * vkq; }
    }
  }
  let mi = 0; for (let i = 1; i < 3; i++) if (A[i][i] < A[mi][mi]) mi = i;
  const nrm = new THREE.Vector3(Vm[0][mi], Vm[1][mi], Vm[2][mi]).normalize();
  const spread = Math.sqrt(Math.max(A[0][0] + A[1][1] + A[2][2] - A[mi][mi], 0) / n);
  return { c, n: nrm, rms: Math.sqrt(Math.max(A[mi][mi], 0) / n), spread };
}
const _dir = V(), _cam = V(), _p = V(), _n = V(), _t = V(), _pl = new THREE.Plane();
let testSurf = null;                          // ?test: a surface set from outside
function updateSurface(dt) {
  if (testSurf) { Object.assign(SURF, { ok: true, kind: testSurf.kind, dist: testSurf.p.distanceTo(camera.position), src: 'test' }); SURF.p.copy(testSurf.p); SURF.n.copy(testSurf.n); return; }
  const now = performance.now();
  camera.updateMatrixWorld(true); _cam.copy(camera.position);
  ray.setFromCamera(_ndc.set(0, 0), camera); _dir.copy(ray.ray.direction);
  const c = hitAt(0.5, 0.5);
  if (c) PTS.push({ p: c, t: now });
  for (let i = 0; i < 2; i++) { const [ox, oy] = RING[ringI++ % RING.length]; const h = hitAt(0.5 + ox, 0.5 + oy); if (h) PTS.push({ p: h, t: now }); }
  while (PTS.length && (now - PTS[0].t > 900 || PTS.length > 60)) PTS.shift();
  const floorT = _dir.y < -0.05 ? (0 - _cam.y) / _dir.y : Infinity;
  const cDist = c ? c.distanceTo(_cam) : Infinity;
  let kind = '', p = null, n = null, rms = 0, npts = 0, src = '';
  // the floor wins when it is nearer than the point the engine found (or that point is on the floor, about where
  // the ray meets it: a stray floor-level point far off must not turn a wall 3 m ahead into "floor, 7 m"); with no point at
  // all only when the phone looks well down (straight ahead at a plain wall gives no point, and the floor far behind it)
  if (c ? floorT < 7 && (floorT <= cDist * 1.08 || (c.y < 0.1 && floorT <= cDist * 1.3)) : floorT < 3.2) { kind = 'floor'; p = _p.copy(_cam).addScaledVector(_dir, floorT); n = _n.copy(UP); src = 'floor'; }
  else if (c) {
    const near = PTS.filter((e) => e.p.distanceTo(c) < Math.max(0.35, cDist * 0.3)).map((e) => e.p);
    let f = fitPlane(near); npts = near.length;
    if (f && near.length >= 7) {   // once more without the outliers (points off the plane by over 2x its spread)
      const keep = near.filter((q) => Math.abs(_t.copy(q).sub(f.c).dot(f.n)) < Math.max(2 * f.rms, 0.01));
      if (keep.length >= 5 && keep.length < near.length) { const f2 = fitPlane(keep); if (f2) { f = f2; npts = keep.length; } }
    }
    if (f) rms = f.rms;
    // a fit counts only if it is tight, spread out, and not seen edge-on: a fit at a grazing angle to the view
    // (a "table" at eye height straight ahead, seen on a repetitive brick wall in the simulator) is not trusted
    const facing = f ? Math.abs(f.n.dot(_dir)) : 0;
    const good = f && f.rms < Math.max(0.03, cDist * 0.015) && f.spread > 0.04 && facing > (Math.abs(f.n.y) > 0.82 ? 0.38 : 0.25);
    if (good && Math.abs(f.n.y) > 0.82) { kind = 'table'; n = _n.copy(UP); _pl.setFromNormalAndCoplanarPoint(n, f.c); src = 'fit'; }
    else if (good && Math.abs(f.n.y) < 0.5) {
      kind = 'wall'; n = _n.set(f.n.x, 0, f.n.z).normalize(); src = 'fit';
      // a wall fit's angle is noisy (in the simulator it ran 5 to 20 degrees off, now and then 60+). Unless the
      // evidence is strong (wide, tight, many points), keep it within 35 degrees of "facing the phone"
      const fx = -_dir.x, fz = -_dir.z, fl = Math.hypot(fx, fz) || 1;
      let a = Math.atan2(n.x, n.z) - Math.atan2(fx / fl, fz / fl);
      if (n.x * fx + n.z * fz < 0) a += Math.PI;   // the fit's normal may point away; compare the line, not the arrow
      a = Math.atan2(Math.sin(a), Math.cos(a)); if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      const strong = f.spread > 0.5 && npts >= 12 && f.rms < 0.015, lim = 35 * Math.PI / 180;
      if (!strong && Math.abs(a) > lim) {
        const y = Math.atan2(fx / fl, fz / fl) + Math.sign(a) * lim;
        n.set(Math.sin(y), 0, Math.cos(y)); src = 'fit~';
      }
      _pl.setFromNormalAndCoplanarPoint(n, f.c);
    }
    else if (good) { kind = 'slope'; n = _n.copy(f.n); _pl.setFromNormalAndCoplanarPoint(n, f.c); src = 'fit'; }
    else { kind = 'wall'; n = _n.set(-_dir.x, 0, -_dir.z).normalize(); _pl.setFromNormalAndCoplanarPoint(n, c); src = 'facing'; }
    if (n.dot(_t.copy(_cam).sub(c)) < 0) { n.negate(); _pl.negate(); }
    p = ray.ray.intersectPlane(_pl, _p) || _p.copy(c);
    if (p.distanceTo(c) > 0.6) p.copy(c);      // a grazing plane: stay on the real point
  }
  if (!kind) { SURF.ok = false; SURF.kind = ''; return; }
  // hysteresis: a new kind of surface has to show up 3 frames running (the first one is taken at once)
  if (SURF.ok && kind !== SURF.kind) { if (SURF.pend === kind) SURF.pendN++; else { SURF.pend = kind; SURF.pendN = 1; } if (SURF.pendN < 3) { SURF.dist = SURF.p.distanceTo(_cam); return; } }
  const snap = !SURF.ok || kind !== SURF.kind;
  SURF.pend = ''; SURF.pendN = 0;
  // position follows fast; the facing settles over ~0.3 s (wall fits jitter by a few degrees frame to frame)
  const k = snap ? 1 : 1 - Math.exp(-14 * dt), kn = snap ? 1 : 1 - Math.exp(-(kind === 'wall' ? 3.5 : 8) * dt);
  SURF.p.lerp(p, k); SURF.n.lerp(n, kn).normalize();
  Object.assign(SURF, { ok: true, kind, dist: SURF.p.distanceTo(_cam), rms, npts, src });
}
// an orientation on a surface: +z out of it, +y "up" (world up on a wall; away from the phone on a floor)
const _m4 = new THREE.Matrix4(), _x = V(), _y = V(), _q = new THREE.Quaternion();
function surfQuat(n, at, out, twist = 0) {
  _y.copy(UP).addScaledVector(n, -n.dot(UP));
  if (_y.lengthSq() < 0.04) { _y.copy(at).sub(camera.position); _y.addScaledVector(n, -n.dot(_y)); }
  _y.normalize(); _x.crossVectors(_y, n).normalize();
  _m4.makeBasis(_x, _y, n); out.setFromRotationMatrix(_m4);
  if (twist) out.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), twist));
  return out;
}
const flatKind = (k) => k === 'floor' || k === 'table';

// ---------------------------------------------------------------- splats (little paint flecks that fly on impact)
let splats = null;
function makeSplats() {
  const N = 90, geo = new THREE.CircleGeometry(1, 10), mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 45;
  splats = { mesh, N, parts: [], m: new THREE.Matrix4(), c: new THREE.Color() };
  for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
  world.add(mesh);
}
// flecks fly out along the surface from `at` and stick (n = surface normal)
function burst(at, n, cols, count = 24, reach = 0.25, size = 0.012) {
  const t1 = V(), t2 = V(); t1.set(1, 0, 0).addScaledVector(n, -n.x); if (t1.lengthSq() < 0.01) t1.set(0, 0, 1).addScaledVector(n, -n.z); t1.normalize(); t2.crossVectors(n, t1);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, r = reach * (0.35 + Math.random() * 0.65);
    const to = at.clone().addScaledVector(t1, Math.cos(a) * r).addScaledVector(t2, Math.sin(a) * r).addScaledVector(n, 0.004);
    splats.parts.push({ from: at.clone().addScaledVector(n, 0.05), to, n: n.clone(), t: 0, life: 0.22 + Math.random() * 0.12, stay: 1.2 + Math.random() * 0.8, s: size * (0.5 + Math.random()), col: cols[i % cols.length] });
  }
  if (splats.parts.length > splats.N) splats.parts.splice(0, splats.parts.length - splats.N);
}
const _sq = new THREE.Quaternion(), _sp = V(), _ss = V();
function tickSplats(dt) {
  if (!splats) return; const P = splats.parts;
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.t += dt; if (p.t > p.life + p.stay) P.splice(i, 1); }
  for (let i = 0; i < splats.N; i++) {
    const p = P[i];
    if (!p) { splats.mesh.setMatrixAt(i, splats.m.makeScale(0, 0, 0)); continue; }
    const k = clamp(p.t / p.life, 0, 1), e = easeOut(k), fade = p.t > p.life ? 1 - (p.t - p.life) / p.stay : 1;
    _sp.lerpVectors(p.from, p.to, e); _sp.addScaledVector(p.n, Math.sin(k * Math.PI) * 0.06);
    _sq.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.n);
    _ss.setScalar(p.s * (k < 1 ? 0.7 + k * 0.3 : 1) * Math.max(fade, 0.001));
    splats.mesh.setMatrixAt(i, splats.m.compose(_sp, _sq, _ss)); splats.mesh.setColorAt(i, splats.c.set(p.col));
  }
  splats.mesh.instanceMatrix.needsUpdate = true; if (splats.mesh.instanceColor) splats.mesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- Hang: posters on walls, cut-outs on floors
const ITEMS = [];                             // { type: 'poster'|'standee'|'stamp'|'panel', g, art, h, twist, anim, ... }
let carry = null;                             // a placed thing picked up by Move: { item, back: {p, q} }
const SIZES = { hang: +store.get('hang', SIZE.hang[2]), stamp: +store.get('stamp', SIZE.stamp[2]) };
let twist = 0;
function artMesh(it, h, opts = {}) {
  const g = new THREE.Group(), w = h * it.aspect;
  const geo = new THREE.PlaneGeometry(1, 1);
  const shadow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: it.tex, transparent: true, opacity: 0.3, depthWrite: false }));
  shadow.scale.set(w, h, 1); shadow.position.set(w * 0.025, -h * 0.03, 0.001); shadow.renderOrder = 9;
  const face = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: it.tex, transparent: true, alphaTest: 0.04, depthWrite: false, side: opts.both ? THREE.DoubleSide : THREE.FrontSide }));
  face.scale.set(w, h, 1); face.position.z = 0.006; face.renderOrder = 10;
  g.add(shadow); g.add(face); g.userData = { face, shadow };
  return g;
}
function newHung(it, h, kind) {
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot);
  const art = artMesh(it, h, { both: kind !== 'wall' });
  if (flatKind(kind)) {   // a cut-out: stands up on the floor, a small black foot and a shadow on the floor
    art.position.y = h / 2; art.userData.shadow.visible = false; pivot.add(art);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.16, h * 0.18, 0.012, 28), new THREE.MeshBasicMaterial({ color: 0x15131a }));
    foot.position.y = 0.006; pivot.add(foot);
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(h * 0.32 * it.aspect + 0.04, h * 0.18, 1); sh.position.y = 0.002; root.add(sh);
    return { type: 'standee', g: root, pivot, art: it, h, kind };
  }
  pivot.add(art);
  return { type: 'poster', g: root, pivot, art: it, h, kind };
}
// where a hung thing goes on the current surface
function hangPose(kind, out) {
  if (flatKind(kind)) {   // stands up, facing the phone
    out.p.copy(SURF.p); const yaw = Math.atan2(camera.position.x - SURF.p.x, camera.position.z - SURF.p.z) + twist;
    out.q.setFromAxisAngle(UP, yaw); return out;
  }
  out.p.copy(SURF.p).addScaledVector(SURF.n, 0.004); surfQuat(SURF.n, SURF.p, out.q, twist); return out;
}
function canPlace() { return SURF.ok && SURF.dist > 0.25 && SURF.dist < 7; }
function hangHere() {
  if (!canPlace()) { hint(pointHint(), 1800); return; }
  if (carry && carry.item.type !== 'panel' && carry.item.type !== 'stamp') return putCarry();
  const it = LIB.sel; if (!it) { hint('Pick something to hang first', 1800); return; }
  const kind = SURF.kind === 'slope' ? 'wall' : SURF.kind;
  const item = newHung(it, SIZES.hang, kind);
  const pose = hangPose(kind, { p: V(), q: new THREE.Quaternion() });
  world.add(item.g); ITEMS.push(item); trim('hang');
  flyIn(item, pose); trayAway();
  api.postEvent('custom', { action: 'street-hang', on: kind, art: it.kind === 'mine' ? it.k : 'sticker' });
}
// the throw: from just in front of the phone onto the surface, a spin, a slap and a squash
function flyIn(item, pose) {
  camera.updateMatrixWorld(true);
  const from = camera.position.clone().add(new THREE.Vector3(0, -0.12, -0.35).applyQuaternion(camera.quaternion));
  item.anim = { t: 0, dur: 0.34, from, fromQ: camera.quaternion.clone(), to: pose.p.clone(), toQ: pose.q.clone(), landed: false };
  item.g.position.copy(from); item.g.quaternion.copy(camera.quaternion); item.g.scale.setScalar(0.25);
  sound.whoosh();
}
function tickItems(dt) {
  for (const it of ITEMS) {
    const a = it.anim; if (!a) continue;
    a.t += dt; const k = clamp(a.t / a.dur, 0, 1), e = easeOut(k);
    if (!a.landed) {
      it.g.position.lerpVectors(a.from, a.to, e);
      it.g.quaternion.slerpQuaternions(a.fromQ, a.toQ, e);
      it.g.scale.setScalar(0.25 + 0.75 * e);
      it.pivot.rotation.z = (1 - e) * 1.6;
      if (k >= 1) {
        a.landed = true; a.t = 0; it.pivot.rotation.z = 0;
        const n = V().set(0, 0, 1).applyQuaternion(a.toQ);
        if (it.type === 'standee') { n.copy(UP); }
        sound.slap(); buzz([18, 30, 10]);
        burst(it.type === 'standee' ? a.to : a.to.clone().addScaledVector(n, 0.01), n, [it.art.colour, '#ffffff', '#f6c344'], 26, it.h * 0.7, it.h * 0.025);
        popWord(['SLAP!', 'BOOM!', 'FRESH!', 'UP!'][Math.floor(Math.random() * 4)], it.art.colour);
      }
    } else {
      // the squash and the paper wobble after it lands (a standee springs up from flat instead)
      const t = a.t;
      if (it.type === 'standee') { it.pivot.rotation.x = -Math.PI / 2 * Math.exp(-7 * t) * Math.cos(t * 9); }
      else { const s = 1 + 0.12 * Math.exp(-9 * t) * Math.cos(t * 30); it.pivot.scale.set(s, 2 - s, 1); it.pivot.rotation.x = 0.18 * Math.exp(-6 * t) * Math.sin(t * 22); }
      if (t > 1.2) { it.pivot.scale.set(1, 1, 1); it.pivot.rotation.x = 0; it.anim = null; }
    }
  }
}
function trim(kind) {
  const types = kind === 'hang' ? ['poster', 'standee'] : [kind];
  const mine = ITEMS.filter((i) => types.includes(i.type)); const max = kind === 'hang' ? MAX_HUNG : kind === 'stamp' ? MAX_STAMPS : MAX_PANELS;
  while (mine.length > max) { const old = mine.shift(); removeItem(old); }
}
function removeItem(it) { const i = ITEMS.indexOf(it); if (i >= 0) ITEMS.splice(i, 1); world.remove(it.g); it.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); if (it.tex) it.tex.dispose(); }

// ---------------------------------------------------------------- Stamp: inked prints of your art on anything
// the ink: the art's colours through a rubber-stamp grain (patchy coverage, a few bare specks), a fresh grain each time
function inkCanvas(it) {
  const src = it.canvas, k = Math.min(1, 384 / Math.max(src.width, src.height)), w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  // value noise at two scales for the patchiness, then speckle
  const N = 24, grid = new Float32Array((N + 1) * (N + 1)).map(() => Math.random());
  const nz = (x, y) => { const gx = x / w * N, gy = y / h * N, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, s = (a, b) => grid[b * (N + 1) + a];
    const a = s(ix, iy) + (s(ix + 1, iy) - s(ix, iy)) * fx, b = s(ix, iy + 1) + (s(ix + 1, iy + 1) - s(ix, iy + 1)) * fx; return a + (b - a) * fy; };
  const tilt = Math.random() * 0.5;            // one side pressed harder than the other
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; if (!px[i + 3]) continue;
    const press = 0.62 + 0.45 * nz(x, y) - tilt * (x / w) * 0.5;
    let a = clamp((press - 0.3) * 1.7, 0, 1); if (Math.random() < 0.06) a *= 0.15;
    // the white die-cut border doesn't print: a stamp only leaves the ink
    if (px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238) a = 0;
    px[i + 3] = px[i + 3] * a;
  }
  g.putImageData(d, 0, 0);
  return c;
}
let stampN = 0;
function stampHere() {
  if (!canPlace()) { hint(pointHint(), 1800); return; }
  if (carry && carry.item.type === 'stamp') return putCarry();
  const it = LIB.sel; if (!it) { hint('Pick something to stamp first', 1800); return; }
  const c = inkCanvas(it), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const h = SIZES.stamp * (0.94 + Math.random() * 0.12), w = h * c.width / c.height;
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 - (stampN % 20) * 0.1, polygonOffsetUnits: -2 }));
  mesh.scale.set(w, h, 1); mesh.renderOrder = 12 + (stampN++ % 200) * 0.001; pivot.add(mesh);
  const tw = twist + gauss() * 0.08;
  root.position.copy(SURF.p).addScaledVector(SURF.n, 0.002 + (stampN % 30) * 0.0002);
  surfQuat(SURF.n, SURF.p, root.quaternion, tw);
  const item = { type: 'stamp', g: root, pivot, art: it, h, tex, mesh, kind: SURF.kind, sanim: { t: 0 } };
  world.add(root); ITEMS.push(item); trim('stamp');
  // the press: the ghost pushes in, then the ink is there
  ghost.userData.press = 0.0001;
  sound.thunk(); buzz(22); trayAway();
  burst(SURF.p.clone(), SURF.n.clone(), [it.colour, it.colour, '#15131a'], 10, h * 0.6, h * 0.018);
  api.postEvent('custom', { action: 'street-stamp', on: SURF.kind, art: it.kind === 'mine' ? it.k : 'sticker' });
}
function tickStamps(dt) {
  for (const it of ITEMS) {
    if (it.type !== 'stamp' || !it.sanim) continue;
    const a = it.sanim; a.t += dt; const k = clamp((a.t - 0.07) / 0.16, 0, 1);
    it.mesh.material.opacity = easeOut(k); it.pivot.scale.setScalar(1.06 - 0.06 * easeOut(k));
    if (k >= 1) it.sanim = null;
  }
}

// ---------------------------------------------------------------- Graffiti: spray straight onto the room
// A panel is a 3.2 m square canvas on a surface, made the moment you first spray there. Rays hit the panels
// first (their planes are fixed, so a stroke stays steady), and a new one starts only off the existing ones.
let capIdx = 0, nozzle = 1, spraying = false, strokeOpen = false, sprayFrom = 'can';
const undoStack = [];
function makePanel(p, n, kind) {
  const c = document.createElement('canvas'); c.width = c.height = PANEL_PX;
  const g = c.getContext('2d', { willReadFrequently: true });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_M, PANEL_M), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  mesh.renderOrder = 5;
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot); pivot.add(mesh);
  root.position.copy(p).addScaledVector(n, 0.003); surfQuat(n, p, root.quaternion);
  const G = 64;
  const panel = { type: 'panel', g: root, pivot, mesh, tex, c, gx: g, kind, wet: new Float32Array(G * G), wetCells: new Set(), drips: [], dirty: false, used: new Map(), G };
  world.add(root); ITEMS.push(panel);
  const all = ITEMS.filter((i) => i.type === 'panel'); if (all.length > MAX_PANELS) { removeItem(all[0]); toast('Old wall art washed off'); }
  return panel;
}
const _pn = V(), _loc = V(), _hit = V(), _plane2 = new THREE.Plane();
// the panel a ray hits (nearest), with its uv
function rayPanel(r, out) {
  let best = null, bd = Infinity;
  for (const it of ITEMS) {
    if (it.type !== 'panel' || it === (carry && carry.item)) continue;
    it.g.updateMatrixWorld(true);
    _pn.set(0, 0, 1).applyQuaternion(it.g.quaternion); _plane2.setFromNormalAndCoplanarPoint(_pn, it.g.position);
    if (!r.intersectPlane(_plane2, _hit)) continue;
    if (_hit.y < -0.01) continue;          // below the floor: that part of a wall canvas is never visible
    const d = _hit.distanceTo(r.origin); if (d > bd || d > 9) continue;
    _loc.copy(_hit); it.pivot.worldToLocal(_loc);
    if (Math.abs(_loc.x) > PANEL_M / 2 - 0.02 || Math.abs(_loc.y) > PANEL_M / 2 - 0.02) continue;
    bd = d; best = it; out.u = _loc.x / PANEL_M + 0.5; out.v = 0.5 - _loc.y / PANEL_M; out.d = d; out.cos = Math.abs(r.direction.dot(_pn)); out.p = _hit.clone();
  }
  out.panel = best; return best;
}
// a brush: a soft dot in one colour (canvas paint, not UI)
const brushes = new Map();
function brush(col) {
  let b = brushes.get(col); if (b) return b;
  b = document.createElement('canvas'); b.width = b.height = 64; const g = b.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); const c = new THREE.Color(col);
  const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
  gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.45, `rgba(${rgb},.55)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); brushes.set(col, b); return b;
}
// one frame of spray at (u, v): r = footprint radius in px; close = metres to the wall (splatter when very close)
function sprayPanel(P, u, v, r, col, dt, close) {
  const x = u * PANEL_PX, y = v * PANEL_PX, f = clamp(dt * 60, 0.3, 3), g = P.gx;
  g.globalAlpha = Math.min(1, 0.42 * f * clamp(20 / r, 0.35, 1.4)); g.drawImage(brush(col), x - r, y - r, 2 * r, 2 * r);
  g.globalAlpha = 0.9; g.fillStyle = col;
  const n = Math.round((16 + r * 1.2) * f), dotS = Math.max(1, r / 24);
  for (let i = 0; i < n; i++) { const s = (0.6 + Math.random() * 1.3) * dotS; g.fillRect(x + gauss() * r * 0.5 - s / 2, y + gauss() * r * 0.5 - s / 2, s, s); }
  g.globalAlpha = 0.5;
  for (let i = 0, m = Math.round((3 + r * 0.3) * f); i < m; i++) { const s = dotS * (0.5 + Math.random() * 0.7); g.fillRect(x + gauss() * r * 1.1 - s / 2, y + gauss() * r * 1.1 - s / 2, s, s); }
  // up close the can spits: fat blobs with little satellites around the spot
  if (close < 0.3 && Math.random() < 0.35 * f) {
    g.globalAlpha = 0.95; const a = Math.random() * 7, d = r * (0.8 + Math.random() * 1.4), bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d, br = 1.5 + Math.random() * r * 0.12;
    g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
    for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(bx + Math.cos(a) * br * (2 + j * 1.4) + gauss(), by + Math.sin(a) * br * (2 + j * 1.4) + gauss(), br * (0.45 - j * 0.08), 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
  P.used.set(col, (P.used.get(col) || 0) + dt);
  // wet paint: a spot held long and close fills up and runs (physics in tickPanels)
  const G = P.G, cx = clamp(Math.floor(u * G), 0, G - 1), cy = clamp(Math.floor(v * G), 0, G - 1), ci = cy * G + cx;
  P.wet[ci] += f * 0.045 * clamp(26 / r, 0.3, 3); P.wetCells.add(ci);
  if (drips && P.wet[ci] > 1 && P.drips.length < 40 && Math.random() < 0.09 * f) {
    const m = Math.min(P.wet[ci] * 0.5, 1.4); P.wet[ci] -= m;
    P.drips.push({ x: x + gauss() * r * 0.3, y: y + r * 0.3, m, v: 0, col, w: 0.9 + r * 0.025 });
  }
  P.dirty = true;
}
// drips: a bead of paint with mass m slides down the wall. Gravity along the surface pulls it (k = how upright
// the panel stands), the wall's drag holds it, and it leaves paint behind as it goes, so it slows and stops,
// ending in a fat bead. On a floor (k ~ 0) the paint pools instead.
let drips = store.get('drips', '1') !== '0';
const PX_PER_M = PANEL_PX / PANEL_M, _wy = V();
function tickPanels(dt) {
  for (const P of ITEMS) {
    if (P.type !== 'panel') continue;
    for (const ci of P.wetCells) { P.wet[ci] *= Math.pow(0.45, dt); if (P.wet[ci] < 0.02) { P.wet[ci] = 0; P.wetCells.delete(ci); } }
    if (P.drips.length) {
      // which way is down on this canvas: world -y in the panel's frame
      const dn = new THREE.Vector3(0, -1, 0).applyQuaternion(P.g.quaternion.clone().invert());
      const k = Math.hypot(dn.x, dn.y), dx = k > 0.01 ? dn.x / k : 0, dy = k > 0.01 ? -dn.y / k : 1;
      const g = P.gx;
      // world height of a canvas pixel (affine): drips on a wall stop at the floor line instead of running on past it
      P.pivot.updateMatrixWorld(true);
      const wy = (x, y) => _wy.set((x / PANEL_PX - 0.5) * PANEL_M, (0.5 - y / PANEL_PX) * PANEL_M, 0).applyMatrix4(P.pivot.matrixWorld).y;
      const y0 = wy(0, 0), yx = wy(1, 0) - y0, yy = wy(0, 1) - y0;
      for (let i = P.drips.length - 1; i >= 0; i--) {
        const d = P.drips[i];
        g.fillStyle = d.col; g.globalAlpha = 0.96;
        if (k < 0.2) {          // lying flat: a puddle spreads a little and that's it
          g.beginPath(); g.arc(d.x, d.y, d.w * (1.4 + d.m), 0, 7); g.fill(); P.drips.splice(i, 1); P.dirty = true; continue;
        }
        const acc = 9.8 * k * 0.06 * PX_PER_M * Math.min(d.m, 1);     // a much slowed-down g (paint is thick)
        d.v += (acc - d.v * 2.4) * dt; const step = d.v * dt;
        const w = Math.max(0.9, d.w * Math.sqrt(d.m));
        let floored = false;
        for (let s = 0; s < step; s += 1) {
          if (y0 + yx * d.x + yy * d.y < 0.004) { floored = true; break; }
          g.beginPath(); g.arc(d.x, d.y, w, 0, 7); g.fill(); d.x += dx; d.y += dy; d.m -= 0.0016;
        }
        if (floored) { g.beginPath(); g.ellipse(d.x, d.y, w * (2.2 + d.m * 2), w * 1.2, 0, 0, 7); g.fill(); P.drips.splice(i, 1); P.dirty = true; continue; }
        if (d.m <= 0.12 || d.v < 2 && d.m < 0.3) { g.beginPath(); g.arc(d.x, d.y, w * 1.8, 0, 7); g.fill(); P.drips.splice(i, 1); }
        P.dirty = true;
      }
      g.globalAlpha = 1;
    }
    if (P.dirty) { P.dirty = false; P.tex.needsUpdate = true; }
  }
}
const aim = { has: false, rScreen: 30, d: 0 };
const _hitInfo = {};
function sprayTick(dt) {
  camera.updateMatrixWorld(true);
  ray.setFromCamera(_ndc.set(0, 0), camera);
  let P = rayPanel(ray.ray, _hitInfo);
  const noz = NOZZLES[nozzle];
  // the footprint: show it on the surface under the aim, whether or not there's a panel yet
  const d = P ? _hitInfo.d : SURF.ok ? SURF.dist : 0;
  aim.has = !!(P || SURF.ok) && d > 0.1 && d < 7; aim.d = d;
  const cos = P ? _hitInfo.cos : SURF.ok ? Math.abs(ray.ray.direction.dot(SURF.n)) : 1;
  const rM = d * Math.tan(noz.a * Math.PI / 180) / Math.sqrt(Math.max(cos, 0.3));
  if (aim.has) { const fy = camera.projectionMatrix.elements[5]; aim.rScreen = clamp(rM / d * fy * innerHeight / 2, 5, 220); }
  if (!spraying || carry) { sound.spray(0); return; }
  sound.spray(1); if (performance.now() - buzzT > 140) { buzzT = performance.now(); buzz(6); }
  emitMist(innerWidth / 2, innerHeight / 2, aim.has ? aim.rScreen : 40, dt);
  if (!aim.has) { aim.lu = aim.lv = null; return; }
  if (!P) {      // first paint on this spot: a new canvas on the surface
    if (!SURF.ok || SURF.dist > 6) return;
    const created = makePanel(SURF.p, SURF.n, SURF.kind);
    created.newInStroke = !strokeOpen;
    P = rayPanel(ray.ray, _hitInfo); if (!P) return;
    if (!strokeOpen) { undoStack.push({ panel: P, created: true }); strokeOpen = true; }
  }
  if (!strokeOpen) { try { undoStack.push({ panel: P, data: P.gx.getImageData(0, 0, PANEL_PX, PANEL_PX) }); if (undoStack.length > 6) undoStack.shift(); } catch (e) { /* memory */ } strokeOpen = true; }
  $('b-undo').disabled = !undoStack.length;
  const rPx = clamp(rM * PX_PER_M, 3, 260), col = CAPS[capIdx].c;
  const lu = aim.lu, lv = aim.lv, samePanel = aim.lp === P;
  const steps = lu == null || !samePanel ? 1 : clamp(Math.ceil(Math.hypot((_hitInfo.u - lu) * PANEL_PX, (_hitInfo.v - lv) * PANEL_PX) / Math.max(rPx * 0.5, 2)), 1, 14);
  for (let i = 1; i <= steps; i++) { const k = i / steps; sprayPanel(P, lu == null || !samePanel ? _hitInfo.u : lu + (_hitInfo.u - lu) * k, lv == null || !samePanel ? _hitInfo.v : lv + (_hitInfo.v - lv) * k, rPx, col, dt / steps, d); }
  aim.lu = _hitInfo.u; aim.lv = _hitInfo.v; aim.lp = P;
  sprayS += dt;
}
let buzzT = 0, sprayS = 0;
function startSpray(from) {
  if (mode !== 'graffiti' || carry) return; sound.init();
  spraying = true; sprayFrom = from; strokeOpen = false; aim.lu = aim.lv = null; $('can').dataset.state = 'spray'; $('aim').classList.add('spray');
}
function stopSpray() {
  if (!spraying) return; spraying = false; strokeOpen = false; sound.spray(0); $('can').dataset.state = mode === 'graffiti' ? 'idle' : 'away'; $('aim').classList.remove('spray');
  if (sprayS > 0.3) api.postEvent('custom', { action: 'street-spray', secs: Math.round(sprayS) }); sprayS = 0;
}
function undo() {
  const u = undoStack.pop(); if (!u) return;
  if (u.created) removeItem(u.panel);
  else if (ITEMS.includes(u.panel)) { u.panel.gx.putImageData(u.data, 0, 0); u.panel.drips.length = 0; u.panel.tex.needsUpdate = true; }
  sound.undo(); $('b-undo').disabled = !undoStack.length;
}
// ---------------------------------------------------------------- the spray on screen (flat dots)
const mist = { c: $('mist'), g: null, parts: [] };
function mistFrom() {
  if (sprayFrom === 'can') { const r = $('can').getBoundingClientRect(); if (r.width) return [r.left + r.width * 0.5, r.top + r.height * 0.05]; }
  return [innerWidth / 2, innerHeight + 30];
}
function emitMist(x, y, r, dt) {
  const col = CAPS[capIdx].c, f = clamp(dt * 60, 0.5, 2.5), [nx, ny] = mistFrom(), P = mist.parts;
  if (P.length > 420) P.splice(0, P.length - 420);
  for (let i = 0; i < Math.round(5 * f); i++) P.push({ k: 0, x0: nx + gauss() * 3, y0: ny + gauss() * 3, x1: x + gauss() * r * 0.4, y1: y + gauss() * r * 0.4, t: -Math.random() * 0.05, life: 0.15 + Math.random() * 0.08, s: 1.4 + Math.random() * 2.6, col });
  for (let i = 0; i < Math.round(2 * f); i++) P.push({ k: 1, x0: x + gauss() * r * 0.3, y0: y + gauss() * r * 0.3, vx: gauss() * r * 1.3, vy: gauss() * r * 1.3 - r * 0.5, t: 0, life: 0.4 + Math.random() * 0.3, s: r * (0.1 + Math.random() * 0.16) + 2, col });
}
function tickMist(dt) {
  const c = mist.c; if (!mist.g) mist.g = c.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const g = mist.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = mist.parts.length - 1; i >= 0; i--) {
    const p = mist.parts[i]; p.t += dt; if (p.t < 0) continue;
    const k = p.t / p.life; if (k >= 1) { mist.parts.splice(i, 1); continue; }
    let x, y, s, a; const e = easeOut(k);
    if (p.k === 0) { x = p.x0 + (p.x1 - p.x0) * e; y = p.y0 + (p.y1 - p.y0) * e; s = p.s * (0.6 + k * 0.8); a = 0.75 * (1 - k * k); }
    else { x = p.x0 + p.vx * e; y = p.y0 + p.vy * e; s = p.s * (1 + k * 1.4); a = 0.2 * (1 - k); }
    g.globalAlpha = a; g.fillStyle = p.col; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- Move: pick the last thing up, put it down elsewhere
function lastOf(m) {
  const types = m === 'hang' ? ['poster', 'standee'] : m === 'stamp' ? ['stamp'] : ['panel'];
  if (m === 'graffiti') { const u = undoStack.length && undoStack[undoStack.length - 1].panel; if (u && ITEMS.includes(u)) return u; }
  for (let i = ITEMS.length - 1; i >= 0; i--) if (types.includes(ITEMS[i].type)) return ITEMS[i];
  return null;
}
function pickUp() {
  if (carry) { dropCarry(true); return; }
  const it = lastOf(mode);
  if (!it) { hint(mode === 'hang' ? 'Nothing hung yet. Tap Hang it here first' : mode === 'stamp' ? 'Nothing stamped yet' : 'Spray something first, then you can move it', 2200); return; }
  stopSpray(); sound.pick(); buzz(10);
  carry = { item: it, back: { p: it.g.position.clone(), q: it.g.quaternion.clone() } };
  it.anim = null; if (it.pivot) { it.pivot.scale.set(1, 1, 1); it.pivot.rotation.set(0, 0, 0); }
  setOpacity(it, 0.6);
  syncUi();
  hint(it.type === 'panel' ? 'Point at a wall and tap to put your graffiti there' : 'Point where you want it and tap', 2600);
}
function setOpacity(it, o) { it.g.traverse((m) => { if (m.material) { if (m.userData.o0 == null) m.userData.o0 = m.material.opacity; m.material.opacity = o < 1 ? m.userData.o0 * o : m.userData.o0; m.material.needsUpdate = true; } }); }
function dropCarry(cancel) {
  if (!carry) return; const it = carry.item;
  if (cancel) { it.g.position.copy(carry.back.p); it.g.quaternion.copy(carry.back.q); }
  setOpacity(it, 1); carry = null; syncUi(); ghostArt();
}
function carryPose(out) {
  const it = carry.item;
  if (it.type === 'standee' || it.type === 'poster') {
    const kind = SURF.kind === 'slope' ? 'wall' : SURF.kind;
    if (flatKind(kind) !== (it.type === 'standee')) {   // a poster moved onto the floor stands up, and the other way round
      const rebuilt = newHung(it.art, it.h, kind); rebuilt.g.position.copy(it.g.position); rebuilt.g.quaternion.copy(it.g.quaternion);
      world.remove(it.g); it.g = rebuilt.g; it.pivot = rebuilt.pivot; it.type = rebuilt.type; it.kind = kind; world.add(it.g); setOpacity(it, 0.6);
    }
    return hangPose(kind, out);
  }
  out.p.copy(SURF.p).addScaledVector(SURF.n, it.type === 'panel' ? 0.003 : 0.002); surfQuat(SURF.n, SURF.p, out.q, it.type === 'panel' ? 0 : twist);
  return out;
}
const _cp = { p: V(), q: new THREE.Quaternion() };
function tickCarry(dt) {
  if (!carry || !SURF.ok) return;
  carryPose(_cp); const it = carry.item, k = 1 - Math.exp(-14 * dt);
  it.g.position.lerp(_cp.p, k); it.g.quaternion.slerp(_cp.q, k);
}
function putCarry() {
  if (!carry || !canPlace()) return;
  const it = carry.item; carryPose(_cp); it.g.position.copy(_cp.p); it.g.quaternion.copy(_cp.q);
  if (it.type === 'panel') it.kind = SURF.kind;
  setOpacity(it, 1); carry = null;
  sound.slap(); buzz([16, 30, 10]);
  const n = it.type === 'standee' ? UP.clone() : V().set(0, 0, 1).applyQuaternion(it.g.quaternion);
  burst(it.g.position.clone(), n, [it.art ? it.art.colour : CAPS[capIdx].c, '#ffffff'], 16, 0.25, 0.01);
  if (it.type === 'poster' || it.type === 'standee') it.anim = { landed: true, t: 0 };
  syncUi(); ghostArt();
  api.postEvent('custom', { action: 'street-move', what: it.type });
}


// ---------------------------------------------------------------- modes and UI
let mode = ['hang', 'stamp', 'graffiti'].includes(store.get('mode', 'hang')) ? store.get('mode', 'hang') : 'hang';
let active = false;                           // the room HUD is up (things placed keep living when it isn't)
function setMode(m) {
  if (carry) dropCarry(true);
  stopSpray(); mode = m; root.dataset.mode = m;
  root.querySelectorAll('#r-modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === m)));
  $('can').dataset.state = m === 'graffiti' ? 'idle' : 'away';
  api.closeOpts(); syncUi(); hint(modeHint(), 2400);
  store.set('mode', m);
}
function modeHint() {
  if (mode === 'hang') return LIB.sel ? 'Point at a wall or the floor, then tap Hang it here' : 'Pick something to hang';
  if (mode === 'stamp') return 'Point at anything and tap to stamp it';
  return 'Point at a wall and hold the can to spray';
}
function pointHint() { return mode === 'graffiti' ? 'Point at a wall or the floor' : 'Point at a wall, the floor or a table'; }
function syncUi() {
  const b = $('b-act');
  if (mode === 'hang') b.textContent = carry ? 'Put it here' : 'Hang it here';
  if (mode === 'stamp') b.textContent = carry ? 'Put it here' : 'Stamp';
  $('b-move').classList.toggle('carry', !!carry);
  $('b-move-t').textContent = carry ? 'Cancel' : mode === 'graffiti' ? 'Move art' : 'Move';
  $('b-move').setAttribute('aria-label', carry ? 'Put it back where it was' : 'Move the last thing you put up');
  root.classList.toggle('carry', !!carry);
  $('b-undo').hidden = mode !== 'graffiti'; $('b-undo').disabled = !undoStack.length;
}
let hintT = 0;
function hint(text, ms = 0) { $('hint').textContent = text || ''; clearTimeout(hintT); if (ms) hintT = setTimeout(() => { if ($('hint').textContent === text) $('hint').textContent = ''; }, ms); }
let toastT = 0;
function toast(text, ms = 1400) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function popWord(text, col) { const t = $('toast'); t.style.background = col || ''; toast(text, 900); setTimeout(() => { t.style.background = ''; }, 1300); }

// caps + nozzles (Graffiti)
function buildCaps() {
  const el = $('caps'); el.innerHTML = '';
  CAPS.forEach((c, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'cap'; b.style.setProperty('--c', c.c); b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c.n); b.setAttribute('aria-checked', String(i === capIdx)); b.onclick = () => setCap(i); el.appendChild(b); });
  const s = document.createElement('i'); s.className = 'sep'; s.setAttribute('aria-hidden', 'true'); el.appendChild(s);
  NOZZLES.forEach((z, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'noz'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', 'Nozzle: ' + z.n); b.setAttribute('aria-checked', String(i === nozzle)); b.innerHTML = `<i style="width:${z.dot}px;height:${z.dot}px;margin:auto"></i>`; b.onclick = () => setNozzle(i); el.appendChild(b); });
}
function setCap(i) { capIdx = i; root.style.setProperty('--cap', CAPS[i].c); root.querySelectorAll('.cap').forEach((b, j) => b.setAttribute('aria-checked', String(j === i))); sound.rattle(); buzz(8); }
function setNozzle(i) { nozzle = i; root.querySelectorAll('.noz').forEach((b, j) => b.setAttribute('aria-checked', String(j === i))); sound.click(); }
buildCaps(); setCap(0);


// ---------------------------------------------------------------- input
const cam = document.getElementById('cam');
const touches = new Map(); let gest = null, tapStart = null;
cam.addEventListener('pointerdown', (e) => {
  if (!active) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { cam.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  if (touches.size === 1) { tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }; if (mode === 'graffiti' && !carry) startSpray('finger'); }
  if (touches.size === 2) { stopSpray(); tapStart = null; const [a, b] = [...touches.values()]; gest = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), size: mode === 'stamp' ? SIZES.stamp : SIZES.hang, tw: twist }; }
});
cam.addEventListener('pointermove', (e) => {
  if (!active) return;
  if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gest && touches.size >= 2 && mode !== 'graffiti') {
    const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
    const [mn, mx] = mode === 'stamp' ? SIZE.stamp : SIZE.hang, s = clamp(gest.size * d / gest.d, mn, mx);
    if (!carry) { if (mode === 'stamp') SIZES.stamp = s; else SIZES.hang = s; }   // a picked-up thing keeps its size
    let dt = ang - gest.a; dt = Math.atan2(Math.sin(dt), Math.cos(dt)); twist = gest.tw - dt;
    showSize();
  }
});
const endPtr = (e) => {
  if (!active) { touches.clear(); gest = null; tapStart = null; return; }
  touches.delete(e.pointerId);
  if (touches.size < 2 && gest) { gest = null; store.set('hang', SIZES.hang.toFixed(2)); store.set('stamp', SIZES.stamp.toFixed(2)); setTimeout(() => { $('size').hidden = true; }, 900); }
  if (!touches.size) {
    if (sprayFrom === 'finger') stopSpray();
    if (tapStart && performance.now() - tapStart.t < 350 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 14) act();
    tapStart = null;
  }
};
cam.addEventListener('pointerup', endPtr); cam.addEventListener('pointercancel', endPtr);
function showSize() { const s = mode === 'stamp' ? SIZES.stamp : SIZES.hang; $('size').hidden = false; $('size').textContent = `${Math.round(s * 100)} cm${Math.abs(twist) > 0.03 ? ` · ${Math.round(-twist * 57.3)}°` : ''}`; }
function act() {
  if (!active || api.optsOpen()) return;
  if (carry) { if (canPlace()) putCarry(); else hint(pointHint(), 1600); return; }
  if (mode === 'hang') hangHere(); else if (mode === 'stamp') stampHere();
}
$('b-act').onclick = act;
const can = $('can');
can.addEventListener('contextmenu', (e) => e.preventDefault());
can.addEventListener('pointerdown', (e) => { e.preventDefault(); try { can.setPointerCapture(e.pointerId); } catch (err) { /* none */ } startSpray('can'); });
can.addEventListener('pointerup', stopSpray); can.addEventListener('pointercancel', stopSpray);
$('b-undo').onclick = undo;
$('b-move').onclick = pickUp;
$('b-art').onclick = () => { const off = root.classList.toggle('tray-off'); $('b-art').setAttribute('aria-expanded', String(!off)); };
$('b-colour').onclick = () => { const off = root.classList.toggle('caps-off'); $('b-colour').setAttribute('aria-expanded', String(!off)); };
root.querySelectorAll('#r-modes button').forEach((b) => { b.onclick = () => { if (b.dataset.m !== mode) { sound.click(); setMode(b.dataset.m); } }; });


// ---------------------------------------------------------------- per frame
let limitedSince = 0;
let enteredAt = 0;
function tick(dt) {
  if (!built) return;
  if (!active) { ghost.visible = false; tickItems(dt); tickStamps(dt); tickPanels(dt); tickSplats(dt); tickMist(dt); return; }
  const now = performance.now();
  updateSurface(dt);
  // the ghost: the reticle ring on the surface, and (Hang, Stamp) the art about to go up
  const placing = mode !== 'graffiti' || !!carry;
  ghost.visible = SURF.ok && !(mode === 'graffiti' && !carry && spraying);
  if (ghost.visible) {
    const kind = SURF.kind === 'slope' && mode === 'hang' ? 'wall' : SURF.kind;
    ghostRing.position.copy(SURF.p).addScaledVector(SURF.n, 0.003); surfQuat(SURF.n, SURF.p, ghostRing.quaternion);
    const rs = mode === 'graffiti' && !carry ? Math.max(aim.d * Math.tan(NOZZLES[nozzle].a * Math.PI / 180), 0.01) / 0.1 : clamp(SURF.dist * 0.18, 0.2, 1.2);
    ghostRing.scale.setScalar(rs);
    const showArt = placing && !carry && LIB.sel && mode !== 'graffiti';
    ghostArtMesh.visible = ghostShadow.visible = !!showArt;
    if (showArt) {
      const it = LIB.sel, h = mode === 'stamp' ? SIZES.stamp : SIZES.hang, w = h * it.aspect;
      let press = 1; if (ghost.userData.press) { ghost.userData.press += dt; const k = ghost.userData.press / 0.22; press = k < 0.4 ? 1 - 0.1 * (k / 0.4) : 0.9 + 0.1 * easeOut((k - 0.4) / 0.6); if (k >= 1) ghost.userData.press = 0; }
      ghostArtMesh.scale.set(w * press, h * press, 1); ghostShadow.scale.set(w, h, 1);
      ghostArtMesh.material.opacity = mode === 'stamp' && ghost.userData.press ? 0.25 : 0.55;
      if (mode === 'hang' && flatKind(kind)) {   // a cut-out stands up on the floor
        const pose = hangPose(kind, { p: V(), q: new THREE.Quaternion() });
        ghostArtMesh.position.copy(pose.p).add(new THREE.Vector3(0, h / 2, 0)); ghostArtMesh.quaternion.copy(pose.q);
        ghostShadow.visible = false;
      } else {
        ghostArtMesh.position.copy(SURF.p).addScaledVector(SURF.n, 0.008); surfQuat(SURF.n, SURF.p, ghostArtMesh.quaternion, twist);
        ghostShadow.position.copy(SURF.p).addScaledVector(SURF.n, 0.004); ghostShadow.quaternion.copy(ghostArtMesh.quaternion);
      }
    }
    // Graffiti shows the spray's footprint (the screen ring) instead of the surface ring
    ghostRing.visible = !(showArt && mode === 'hang' && flatKind(kind)) && !(mode === 'graffiti' && !carry);
  }
  $('b-act').disabled = !canPlace();
  // the screen aim + surface label
  const el = $('aim'); el.classList.toggle('on', mode === 'graffiti' && aim.has && !carry);
  el.style.setProperty('--r2', (aim.rScreen * 2).toFixed(0) + 'px');
  const lbl = SURF.ok ? `${{ floor: 'Floor', table: 'Table', wall: 'Wall', slope: 'Surface' }[SURF.kind]} · ${SURF.dist < 1 ? Math.round(SURF.dist * 100) + ' cm' : SURF.dist.toFixed(1) + ' m'}` : '';
  if ($('surf-t').textContent !== lbl) $('surf-t').textContent = lbl;
  // tracking: limited for a while -> say how to get it back
  if (api.tracking() === 'LIMITED') { if (!limitedSince) limitedSince = now; } else limitedSince = 0;
  if (limitedSince && now - limitedSince > 1500) hint('Move your phone slowly so it can see the room again');
  else if (!SURF.ok && !spraying && !$('hint').textContent && now - enteredAt > 2500) hint(pointHint());
  if (mode === 'graffiti') sprayTick(dt); else { aim.has = false; sound.spray(0); }
  tickCarry(dt); tickItems(dt); tickStamps(dt); tickPanels(dt); tickSplats(dt); tickMist(dt);
  if (api.diagOn()) drawDiag(now);
}

// ---------------------------------------------------------------- test-log surface stats
let surfAt = 0;
function drawDiag(now) {
  const d = api.diag(); d.surf = d.surf || {};
  if (now - surfAt > 500) { surfAt = now; const k = SURF.ok ? SURF.kind + '/' + SURF.src : 'none'; d.surf[k] = (d.surf[k] || 0) + 1; }
  const el = $('diagp'); el.hidden = false;
  el.textContent = `${mode} · track ${api.tracking() || '-'}\nsurf ${SURF.ok ? SURF.kind + ' (' + SURF.src + ')' : '-'} ${SURF.dist.toFixed(2)} m · n ${SURF.n.toArray().map((v) => v.toFixed(2)).join(',')} · pts ${SURF.npts} rms ${(SURF.rms * 100).toFixed(1)} cm`;
}

// ---------------------------------------------------------------- what Spray Bobo calls
let libP = null;
function loadLib() {
  if (!libP) libP = loadDecals();
  return libP;
}
// reload this phone's paintings (Spray Bobo writes 'street:<piece>' each time one comes alive); select `k` if given
async function refreshMine(k) {
  for (const it of LIB.mine) it.tex.dispose();
  LIB.mine = []; await loadMine();
  const want = k && LIB.mine.find((m) => m.k === k);
  if (want) { LIB.sel = want; LIB.cat = 'mine'; }
  else if (!LIB.sel || (LIB.sel.kind === 'mine' && !LIB.mine.includes(LIB.sel))) { LIB.sel = LIB.mine[0] || LIB.decals.find((d) => d.id === 'decal:splat') || LIB.decals[0] || null; LIB.cat = LIB.mine.length ? 'mine' : 'decals'; }
  if (built) { renderTray(); ghostArt(); }
}
let capsBuilt = false;
async function enter(m, k) {
  sound.init();
  if (!capsBuilt) { capsBuilt = true; buildCaps(); setCap(0); }
  active = true; root.hidden = false; enteredAt = performance.now();
  root.classList.remove('tray-off'); $('b-art').setAttribute('aria-expanded', 'true');
  PTS.length = 0; SURF.ok = false; SURF.kind = '';
  setMode(['hang', 'stamp', 'graffiti'].includes(m) ? m : mode);
  await loadLib(); await refreshMine(k);           // the HUD is up already; the tray fills in when this lands
  if (active) hint(modeHint(), 2400);
}
function exit() {
  if (carry) dropCarry(true);
  stopSpray(); active = false; root.hidden = true; ghost.visible = false; hint('');
  $('aim').classList.remove('on'); sound.spray(0);
}
function clearAll() { if (carry) dropCarry(true); for (const it of [...ITEMS]) removeItem(it); undoStack.length = 0; syncUi(); toast('Clean wall!'); }
function setDrips(on) { drips = on; store.set('drips', on ? '1' : '0'); }
const api2 = {
  attach, tick, enter, exit, clearAll, setDrips, loadLib,
  get active() { return active; }, get mode() { return mode; }, get drips() { return drips; }, get count() { return ITEMS.length; },
  drawMist(c, Wd, Hd) { if (active && mist.parts.length && mist.c.width) try { c.drawImage(mist.c, 0, 0, Wd, Hd); } catch (e) { /* none */ } },
  stopSpray,
};
if (params.has('test')) window.__st = {
  get mode() { return mode; }, setMode, get tracking() { return api.tracking(); }, SURF, ITEMS, LIB, get carry() { return carry; }, camera: () => camera, get active() { return active; },
  surf: () => ({ ok: SURF.ok, kind: SURF.kind, src: SURF.src, dist: +SURF.dist.toFixed(3), p: SURF.p.toArray().map((v) => +v.toFixed(3)), n: SURF.n.toArray().map((v) => +v.toFixed(3)), npts: SURF.npts, rms: +SURF.rms.toFixed(4) }),
  fakeSurf(kind, d) {
    if (!kind) { testSurf = null; return; }
    const f = V(); camera.getWorldDirection(f); f.y = 0; f.normalize();
    testSurf = kind === 'floor' ? { kind, p: camera.position.clone().addScaledVector(f, d).setY(0), n: UP.clone() } : { kind, p: camera.position.clone().addScaledVector(f, d), n: f.clone().negate() };
    if (kind !== 'floor') testSurf.p.y = camera.position.y - 0.2;
  },
  act, pickUp, undo, startSpray: () => startSpray('can'), stopSpray, selectArt: (i) => selectArt(LIB.decals[i] || LIB.mine[i]),
  paintCoverage(i = 0) { const P = ITEMS.filter((x) => x.type === 'panel')[i]; if (!P) return 0; const d = P.gx.getImageData(0, 0, PANEL_PX, PANEL_PX).data; let n = 0; for (let j = 3; j < d.length; j += 64) if (d[j] > 40) n++; return n / (d.length / 64); },
  drips: () => ITEMS.filter((x) => x.type === 'panel').map((P) => P.drips.length),
  sprayPath(path, rPx = 18, cap = 0, i = 0) { const P = ITEMS.filter((x) => x.type === 'panel')[i]; if (!P) return false; for (let j = 1; j < path.length; j++) { const [u0, v0] = path[j - 1], [u1, v1] = path[j]; const n = Math.ceil(Math.hypot(u1 - u0, v1 - v0) * PANEL_PX / (rPx * 0.4)); for (let k = 0; k <= n; k++) sprayPanel(P, u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n, rPx, CAPS[cap].c, 1 / 60, 1); } return true; },
  sprayAt(u, v, secs, rPx = 30) { const P = ITEMS.find((x) => x.type === 'panel'); if (!P) return -1; for (let t = 0; t < secs; t += 1 / 30) sprayPanel(P, u, v, rPx, CAPS[capIdx].c, 1 / 30, 1); return P.drips.length; },
};
return api2;
}
