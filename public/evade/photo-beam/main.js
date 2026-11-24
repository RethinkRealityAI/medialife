// Photo Beam: snap a selfie and beam it onto the EVADE keychain. Start opens our own front camera (not the AR
// engine yet): snap (or switch camera, or pick from the library), give it a style, press Ready to beam. Then the
// selfie stream is stopped and the AR engine starts on the rear camera; the photo waits in a card at the bottom and an
// aiming ray runs from it to a reticle at the centre of the screen. Every photo slot (Bobo's visor, the Eclipse can's
// label, Roblox Bobo's cap) on a tracked charm glows; aim the centre at one (or tap it) and the ray locks on, turns
// yellow, buzzes: Beam ready. Press Beam: the photo becomes a few thousand pixels that stream down a beam of light and
// land on their own spot, and a materialise sweep prints it on. It stays on that charm (this phone only, IndexedDB).
//
// The slots are measured from the target pictures (scripts/build-photo-beam/build_slots.py -> slots/slots.json):
// each picture has its own slot in its own uv, so a photo reads the right way round on both sides of a charm.
// The visor and cap are a grid that bulges gently out of the print (fabric round a head); the can's label is the front
// half of a cylinder whose silhouette is the drawn can (X-Ray's lathe idea), standing proud of the print, and it spins.
// The printed photo is multiplied by the print's own shading (slots/*-shade.png) so it looks printed on the merch.
//
// Base: Bobo X-Ray (public/evade/xray-bobo): engine, tracking rules (Spray Bobo PR #47), camera handling, recorder,
// sound, options, logs. Nothing is uploaded: the photo never leaves the phone (the recorder's globe send is off).
import * as THREE from 'three';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
// the browser's own camera call, taken before the iPhone lens patch below wraps it (that patch is for the AR camera)
const GUM = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) : null;
const params = new URLSearchParams(location.search);
const KC = '/evade/keychain-ar/';             // Off the Chain: engine, image targets
const HERE = '/evade/photo-beam/';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('photo-beam-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('photo-beam-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- what is tracked
// A piece is one photo holder (one photo, one IndexedDB key) and the target pictures it shows on; a picture can carry
// several slots. pal: the slot whose palette the styles use. EVADE's keychain only: MEDIALIFE's own products (the
// Sukeban tee) were taken out on 2026-11-24 (Dapo: no MEDIALIFE products in EVADE experiences).
const PIECES = {
  bobo: { k: 'bobo', name: 'Bobo', where: "Bobo's visor", spot: "Bobo's visor", targets: ['kc-bobo', 'kc-bobo-l'], pal: 'kc-bobo' },
  can: { k: 'can', name: 'the can', where: "the can's label", spot: 'the Eclipse can', targets: ['kc-can', 'kc-can-back'], pal: 'kc-can-back' },
  old: { k: 'old', name: 'Roblox Bobo', where: "Bobo's cap", spot: "Roblox Bobo's cap", targets: ['kc-old', 'kc-old-l'], pal: 'kc-old' },
};
for (const P of Object.values(PIECES)) Object.assign(P, { status: 'empty', src: null, params: null, label: null, tex: null, spin: 0, spinV: 0, slots: [] });
const TARGETS = [...new Set(Object.values(PIECES).flatMap((P) => P.targets))];   // 6 pictures (the engine's limit is 10)
const TDIR = () => KC + 'image-targets/';
// The face-fit code below (a face-shaped slot: eye line, chin, Match skin, "On <character>" preview) is kept for a
// future face slot; no piece has face: true now, so it is idle and the editor's view switch is hidden.
// Losing the print: the last pose is held this long, and only while the phone is still (Spray Bobo's numbers)
const HOLD_STILL_MS = 250, HOLD_BLIND_MS = 120, STILL_DEG = 25, STILL_ACC = 1.2;
const REOPEN_AFTER_MS = 2500;                 // lost longer than this: the photo re-materialises when found
const COL = { x: 0x4fd6e8, xs: '#4fd6e8', y: 0xf6c344, ys: '#f6c344', ink: '#0f1519' };
const ED_ASP = 1.4;                           // the editor's neutral shape (the photo fits whichever slot it is beamed to)
const LOOKS = { soft: 0.35, printed: 0.7, bold: 1 };
let look = LOOKS[store.get('look', 'printed')] != null ? store.get('look', 'printed') : 'printed';
const BULGE = 0.09;                           // the visor's bulge out of the print, a share of its width (slots.json may set its own)
const CAN_Z = 0.5;                            // the can's label stands this share of its radius proud of the print
const CAN_WRAP = 1.25;                        // the label's width over the can's drawn width (it wraps round)
const LABEL_MAX = 1024;                       // the printed photo's long side, px
const N_PART = 4500;                          // pixels that fly down the beam
// the beam (seconds after launch); the card shrink before it. Reduced motion: shorter and softer, same steps.
const BT = REDUCED
  ? { card: 0.25, grow: 0.18, launch: 0.1, spread: 0.4, fly: 0.35, sweep0: 0.42, sweep1: 1.1, retract0: 0.85, retract1: 1.05, end: 1.2, swirl: 0.25 }
  : { card: 0.38, grow: 0.25, launch: 0.15, spread: 0.75, fly: 0.5, sweep0: 0.72, sweep1: 1.82, retract0: 1.3, retract1: 1.6, end: 1.86, swirl: 1 };
const REMAT_S = 0.6;                          // found again: the short sweep

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') === '1', master: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); }
    } catch (e) { /* no audio */ }
  },
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
  // the beam leaving the phone: an airy rush with a rising sweep under it
  whoosh() {
    if (!this.ctx || !this.on) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * 0.8), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = this.ctx.createBufferSource(); s.buffer = b; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(5200, t + 0.7);
    const g = this.ctx.createGain(); g.gain.value = 0.16; s.connect(f).connect(g).connect(this.master); s.start(t);
    this.tone(180, 1500, 0.6, 0.05, 'triangle'); this.tone(360, 2600, 0.55, 0.025, 'sine', 0.05);
  },
  shimmer(n = 12) { for (let i = 0; i < n; i++) { const f = 2200 + Math.random() * 2600; this.tone(f, f * 1.03, 0.09, 0.016, 'triangle', i * 0.045); } },
  land() { this.tone(240, 70, 0.32, 0.12, 'sine'); this.noise(0.16, 0.07, 900, 5000); },
  chime() { [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.55, 0.045, 'triangle', i * 0.07)); },
  pop() { this.tone(900, 1800, 0.14, 0.035, 'triangle'); this.shimmer(4); },
  click() { this.tone(1200, 900, 0.05, 0.05, 'triangle'); },
  lock() { this.tone(1200, 900, 0.04, 0.06, 'square'); this.tone(880, 1760, 0.1, 0.05, 'triangle', 0.04); this.tone(1760, 1760, 0.14, 0.04, 'triangle', 0.12); },
  unlock() { this.tone(700, 420, 0.08, 0.03, 'triangle'); },
  shutter() { this.noise(0.05, 0.22, 2000, 9000); this.noise(0.07, 0.16, 1200, 6000, 0.08); },
};

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const texLoader = new THREE.TextureLoader();
const loadTex = (u) => new Promise((res, rej) => texLoader.load(u, res, undefined, rej));
let SL = null, LAYOUT = null;
const SLREC = {};                             // every slot record by id
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  Promise.all(TARGETS.map((n) => getJson(TDIR(n) + `${n}.json`))),
  getJson(HERE + 'slots/slots.json'),
]).then(async ([layout, tdata, slots]) => {
  LAYOUT = layout; SL = slots;
  const recs = TARGETS.flatMap((n) => slots.targets[n].map((r) => Object.assign(r, { target: n })));
  const tex = await Promise.all(recs.map((r) => Promise.all([loadTex(HERE + 'slots/' + r.mask), loadTex(HERE + 'slots/' + r.shade)])));
  recs.forEach((r, i) => { r.maskTex = tex[i][0]; r.shadeTex = tex[i][1]; SLREC[r.id] = r; });
  for (const P of Object.values(PIECES)) {
    const rec = recOf(P, P.targets[0]), L = layout.targets[P.targets[0]];
    P.aspect = labelAspect(rec, L.widthM, L.heightM);
    P.palette = SLREC[P.pal].palette;
  }
  // the capture guide has the face slot's shape, with her eye line, so a face framed in it fits her face
  const F = Object.values(PIECES).find((P) => P.face);
  if (!F) {
    // no face slot: a plain face frame (no inner oval or eye line)
    document.documentElement.classList.add('noface');
    $('cap-t').textContent = 'Fit your face in the frame';
    return { tdata };
  }
  const fr = recOf(F, F.targets[0]), lb = labelBox(fr);
  F.eyeT = (fr.eye - lb.va) / (lb.vb - lb.va);
  // her chin: the lowest point of the face mask near the middle (the mask runs a little over the jaw)
  const mid = fr.geo.filter((c) => Math.abs(c[0] - (lb.ua + lb.ub) / 2) < (lb.ub - lb.ua) * 0.12);
  F.chinT = clamp((Math.max(...mid.map((c) => c[2])) - lb.va) / (lb.vb - lb.va) - 0.03, 0.7, 0.98);
  const ds = document.documentElement.style, o = faceOval(FACE_W.normal);
  ds.setProperty('--ga', String(F.aspect));
  ds.setProperty('--ge', (F.eyeT * 100).toFixed(1) + '%');
  ds.setProperty('--fl', ((o.cx - o.rx) * 100).toFixed(1) + '%'); ds.setProperty('--fw', (o.rx * 200).toFixed(1) + '%');
  ds.setProperty('--ft', ((o.cy - o.ry) * 100).toFixed(1) + '%'); ds.setProperty('--fh', (o.ry * 200).toFixed(1) + '%');
  return { tdata };
});
function recOf(P, n) { return SL.targets[n].find((r) => r.piece === P.k); }
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => {
  loaded = true; $('load').hidden = true; $('b-start').disabled = false; $('b-start').textContent = boothSrc ? 'Make it yours' : 'Start';
}).catch((e) => { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); });
const savedReady = assets.then(loadSaved).catch(() => {});
// From the Bobo Booth (/evade/bobo-booth/, "Beam it onto your merch"): the booth leaves its photo in this page's
// IndexedDB under 'handoff' and opens ?from=booth. We take it once (then delete it) and open Make it yours with it,
// skipping the selfie step. Older than 30 minutes is ignored.
const FROM_BOOTH = params.get('from') === 'booth';
// Inside the Bobo Booth (?embed=booth): the booth loads this page in a full-screen frame and hands over its photo by
// postMessage; there is no splash and no selfie step: the photo goes straight to aiming. See "embedded" below.
const EMBED = params.get('embed') === 'booth' && window.parent !== window;
if (EMBED) document.documentElement.classList.add('embed');
const handoff = FROM_BOOTH ? (async () => {
  try {
    const db = await idb();
    const rec = await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get('handoff'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
    db.transaction('kv', 'readwrite').objectStore('kv').delete('handoff');
    if (!rec || !rec.src || Date.now() - (rec.at || 0) > 30 * 60 * 1000) return null;
    return await decodeImage(rec.src);
  } catch (e) { console.warn('handoff', e); return null; }
})() : Promise.resolve(null);
let boothSrc = null;
handoff.then((src) => {
  if (!src) { if (FROM_BOOTH) history.replaceState(null, '', location.pathname + location.search.replace(/([?&])from=booth&?/, '$1').replace(/[?&]$/, '')); return; }
  boothSrc = src; diag.booth = 1;
  $('o-booth').hidden = false; $('ed-back').textContent = 'Back to the booth';   // came from the booth: that is where a retake happens
  // the splash says what is about to happen, with the photo itself
  const th = $('booth-shot'); th.width = 132; th.height = Math.round(132 * src.height / src.width);
  th.getContext('2d').drawImage(src, 0, 0, th.width, th.height);
  $('booth').hidden = false; $('splash').classList.add('from-booth');
  $('title').innerHTML = 'Beam your <span>booth photo</span>';
  $('lead').textContent = 'Style it, then point at your keychain and lock on. It beams onto Bobo\'s visor, the Eclipse can or Roblox Bobo\'s cap.';
  if (loaded) $('b-start').textContent = 'Make it yours';
});

// ---------------------------------------------------------------- slot geometry (metres of the print, y up, z out)
// band: the label (photo) covers the band's bounding box and the band's shape cuts it; can: the label wraps the front
// half of the can, s round it (left to right), t down it.
function labelBox(rec) {
  const g = rec.geo;
  if (rec.kind !== 'can') return { ua: g[0][0], ub: g[g.length - 1][0], va: Math.min(...g.map((c) => c[1])), vb: Math.max(...g.map((c) => c[2])) };
  return { va: g[0][0], vb: g[g.length - 1][0], ua: Math.min(...g.map((r) => r[1])), ub: Math.max(...g.map((r) => r[2])) };
}
function labelAspect(rec, W, H) {
  const b = labelBox(rec);
  if (rec.kind !== 'can') return ((b.ub - b.ua) * W) / ((b.vb - b.va) * H);
  const hw = rec.geo.reduce((a, r) => a + (r[2] - r[1]) / 2, 0) / rec.geo.length;
  return (2 * hw * W * CAN_WRAP) / ((b.vb - b.va) * H);
}
function interp(arr, key, x, cols) {   // linear in a sorted table: arr rows, key column, value columns
  if (x <= arr[0][key]) return cols.map((c) => arr[0][c]);
  for (let i = 1; i < arr.length; i++) if (x <= arr[i][key]) { const a = arr[i - 1], b = arr[i], k = (x - a[key]) / Math.max(b[key] - a[key], 1e-9); return cols.map((c) => lerp(a[c], b[c], k)); }
  return cols.map((c) => arr[arr.length - 1][c]);
}
// a point of the print's picture (u, v) on the slot's surface
function surf(S, u, v, out = new THREE.Vector3()) {
  const { W, H, rec, lb } = S;
  if (rec.kind !== 'can') {
    const x = clamp((u - (lb.ua + lb.ub) / 2) / ((lb.ub - lb.ua) / 2), -1, 1);
    return out.set((u - 0.5) * W, (0.5 - v) * H, (rec.bulge != null ? rec.bulge : BULGE) * (lb.ub - lb.ua) * W * (1 - x * x) + 0.0004);
  }
  return out.set((u - 0.5) * W, (0.5 - v) * H, 0.0004);
}
// a point of the label (s across, t down) on the slot
function fromLabel(S, s, t, out = new THREE.Vector3()) {
  const { W, H, rec, lb } = S;
  if (rec.kind !== 'can') return surf(S, lerp(lb.ua, lb.ub, s), lerp(lb.va, lb.vb, t), out);
  const v = lerp(lb.va, lb.vb, t), [uL, uR] = interp(rec.geo, 0, v, [1, 2]), c = (uL + uR) / 2, hw = (uR - uL) / 2, th = (s - 0.5) * Math.PI;
  return out.set((c + hw * Math.sin(th) - 0.5) * W, (0.5 - v) * H, hw * W * Math.cos(th) * CAN_Z + 0.0004);
}
function inLabel(S, s, t) {
  if (S.rec.kind === 'can') return true;
  const { lb, rec } = S, u = lerp(lb.ua, lb.ub, s), v = lerp(lb.va, lb.vb, t), [a, b] = interp(rec.geo, 0, u, [1, 2]);
  return v >= a && v <= b;
}
function slotGeometry(S) {
  const { rec, lb } = S, pos = [], uv = [], box = [], idx = [], p = new THREE.Vector3();
  const bx = rec.box, boxUv = (u, v) => [(u - bx[0]) / (bx[2] - bx[0]), 1 - (v - bx[1]) / (bx[3] - bx[1])];
  let NI, NJ;
  if (rec.kind !== 'can') {
    NI = rec.geo.length; NJ = 14;
    for (const [u, a, b] of rec.geo) for (let j = 0; j <= NJ; j++) {
      const v = lerp(a, b, j / NJ); surf(S, u, v, p); pos.push(p.x, p.y, p.z);
      uv.push((u - lb.ua) / (lb.ub - lb.ua), 1 - (v - lb.va) / (lb.vb - lb.va)); box.push(...boxUv(u, v));
    }
  } else {
    NI = rec.geo.length; NJ = 40;
    for (let i = 0; i < NI; i++) for (let j = 0; j <= NJ; j++) {
      const s = j / NJ, t = (rec.geo[i][0] - lb.va) / (lb.vb - lb.va); fromLabel(S, s, t, p); pos.push(p.x, p.y, p.z);
      uv.push(s, 1 - t); box.push(...boxUv(p.x / S.W + 0.5, 0.5 - p.y / S.H));
    }
  }
  // counter-clockwise seen from the front: the band's grid runs across then down, the can's down then across
  const band = rec.kind !== 'can';
  for (let i = 0; i < NI - 1; i++) for (let j = 0; j < NJ; j++) { const a = i * (NJ + 1) + j, b = a + NJ + 1; if (band) idx.push(a, a + 1, b, a + 1, b + 1, b); else idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aBox', new THREE.Float32BufferAttribute(box, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// the slot's edge in 3D (counter-clockwise seen from the front)
function slotEdge(S) {
  const { rec, lb } = S, pts = [];
  if (rec.kind !== 'can') {
    for (const [u, a] of rec.geo) pts.push(surf(S, u, a));
    for (const [u, , b] of rec.geo.slice().reverse()) pts.push(surf(S, u, b));
  } else {
    const N = 24, ts = rec.geo.map((r) => (r[0] - lb.va) / (lb.vb - lb.va));
    for (const t of ts) pts.push(fromLabel(S, 0, t));
    for (let i = 1; i < N; i++) pts.push(fromLabel(S, i / N, 1));
    for (const t of ts.slice().reverse()) pts.push(fromLabel(S, 1, t));
    for (let i = N - 1; i > 0; i--) pts.push(fromLabel(S, i / N, 0));
  }
  let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a.x * b.y - b.x * a.y; }
  return area < 0 ? pts.reverse() : pts;
}
// a closed flat ribbon of width w on the outside of a counter-clockwise outline (X-Ray's ribbon, keeping each point's z)
function ribbon(pts, w) {
  const n = pts.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const d1 = new THREE.Vector2(p.x - a.x, p.y - a.y).normalize(), d2 = new THREE.Vector2(b.x - p.x, b.y - p.y).normalize();
    const n1 = new THREE.Vector2(d1.y, -d1.x), n2 = new THREE.Vector2(d2.y, -d2.x);
    const m = n1.clone().add(n2); const ml = m.length(); if (ml < 1e-6) m.copy(n1); else m.divideScalar(ml);
    const k = Math.min(1 / Math.max(m.dot(n1), 0.35), 2.5);
    pos.push(p.x, p.y, p.z + 0.0002, p.x + m.x * w * k, p.y + m.y * w * k, p.z + 0.0002);
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, a = i * 2, b = j * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}

// ---------------------------------------------------------------- the printed photo: one shader per slot
// Empty: a flat see-through cyan fill that pulses (the glowing spot). With a photo: the photo times the print's own
// shading, a stepped gloss band on the can that moves with the view, and the materialise sweep (X-Ray's makeBurn:
// a front from the landing point out, white-hot edge, cyan rim, one flat tint band, then the photo). Flat steps only.
const SLOT_VS = `
attribute vec2 aBox;
varying vec2 vUv, vBox; varying vec3 vN, vV;
void main() {
  vUv = uv; vBox = aBox;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;
const SLOT_FS = `
uniform sampler2D uMap, uShade, uMask; uniform vec3 uCyan, uFill; uniform float uFillA, uHas, uP, uStr, uPulse, uSpin, uCan, uAsp, uUseMask;
varying vec2 vUv, vBox; varying vec3 vN, vV;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1 + 7.3) * 0.3 + vnoise(p * 4.3 + 1.7) * 0.15; }
void main() {
  float mk = uUseMask > 0.5 ? texture2D(uMask, vBox).r : 1.0;
  if (mk < 0.12) discard;
  float ma = clamp((mk - 0.12) / 0.5, 0.0, 1.0);   // a one or two pixel soft edge (hair strands, fingers)
  if (uHas < 0.5) {
    gl_FragColor = vec4(uFill, uFillA * ma);
    #include <colorspace_fragment>
    return;
  }
  vec2 d = (vUv - 0.5) * vec2(uAsp, 1.0);
  float r = length(d) / (0.5 * length(vec2(uAsp, 1.0)));
  float n = fbm(vUv * vec2(uAsp, 1.0) * 5.0);
  float e = uP * 1.35 - 0.1 - (r * 0.85 + n * 0.25);   // > 0: printed
  if (e < 0.0) discard;
  vec3 col = texture2D(uMap, vec2(vUv.x + uSpin, vUv.y)).rgb;
  float sh = texture2D(uShade, vBox).r * 2.0;
  col *= mix(1.0, sh, uStr);
  if (uCan > 0.5) {                                     // gloss: a narrow band where the label faces the light's mirror
    vec3 N = normalize(vN), V = normalize(vV), Hh = normalize(normalize(vec3(-0.35, 0.55, 1.0)) + V);
    float sp = dot(N, Hh);
    if (sp > 0.992) col = mix(col, vec3(1.0), 0.45);
    else if (sp > 0.97) col = mix(col, vec3(1.0), 0.16);
  }
  if (!gl_FrontFacing) col = vec3(0.04, 0.07, 0.09);   // the inside of the label sleeve
  if (e < 0.03) col = vec3(1.0);                        // white-hot edge
  else if (e < 0.07) col = uCyan;                       // its cyan rim
  else if (e < 0.11) col = mix(col, uCyan, 0.4);        // one flat tint band
  gl_FragColor = vec4(col, ma);
  #include <colorspace_fragment>
}`;
const blankTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blankTex.needsUpdate = true;
function slotMaterial(S) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: blankTex }, uShade: { value: S.rec.shadeTex }, uMask: { value: S.rec.maskTex }, uCyan: { value: new THREE.Color(COL.x) }, uFill: { value: new THREE.Color(COL.x) }, uFillA: { value: 0.2 },
      uHas: { value: 0 }, uP: { value: 0 }, uStr: { value: LOOKS[look] }, uPulse: { value: 0 }, uSpin: { value: 0 },
      uCan: { value: S.rec.kind === 'can' ? 1 : 0 }, uAsp: { value: S.aspect }, uUseMask: { value: S.rec.kind !== 'can' ? 1 : 0 },
    },
    vertexShader: SLOT_VS, fragmentShader: SLOT_FS, side: THREE.DoubleSide, transparent: true, toneMapped: false,
  });
}

// ---------------------------------------------------------------- the scene
let scene, camera, renderer;
const A = new THREE.Group();                  // follows the print (units: metres of the real print)
const SLOT = {};                              // every slot by id
const TSL = {};                               // per target picture: its slots
const TG = {};                                // per target picture: its group
const fx = { beamG: null, pts: null, layers: [] };
function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false;
  for (const n of TARGETS) {
    const L = LAYOUT.targets[n], g = TG[n] = new THREE.Group(); g.visible = false; A.add(g); TSL[n] = [];
    for (const rec of SL.targets[n]) {
    const P = PIECES[rec.piece];
    const S = { name: rec.id, target: n, P, W: L.widthM, H: L.heightM, rec, lb: labelBox(rec), aspect: labelAspect(rec, L.widthM, L.heightM), matP: 0, g };
    S.mat = slotMaterial(S);
    S.mesh = new THREE.Mesh(slotGeometry(S), S.mat); S.mesh.renderOrder = 4; S.mesh.frustumCulled = false; S.g.add(S.mesh);
    S.outline = new THREE.Mesh(ribbon(slotEdge(S), S.H * 0.008), new THREE.MeshBasicMaterial({ color: COL.x, toneMapped: false, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
    S.outline.renderOrder = 6; S.g.add(S.outline);
    S.land = fromLabel(S, 0.5, 0.5);
    S.size = Math.max((S.lb.ub - S.lb.ua) * S.W, (S.lb.vb - S.lb.va) * S.H);
    // the landing ring and the sparkle burst
    S.ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: COL.x, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    S.ring.position.copy(S.land).setZ(S.land.z + 0.0008); S.ring.visible = false; S.ring.renderOrder = 8; S.g.add(S.ring);
    S.sparks = makeSparks(); S.sparks.position.copy(S.land); S.g.add(S.sparks);
    SLOT[rec.id] = S; TSL[n].push(S); P.slots.push(rec.id);
    }
  }
  for (const P of Object.values(PIECES)) if (P.tex) bindTex(P);
  buildBeam();
}
// sparkles: 70 flat squares (white and cyan) bursting from the landing point
function makeSparks() {
  const N = 70, geo = new THREE.BufferGeometry(), p = new Float32Array(N * 3), c = new Float32Array(N * 3), dir = [];
  const w = new THREE.Color(0xffffff), cy = new THREE.Color(COL.x);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random(); dir.push(new THREE.Vector3(Math.cos(a) * s, Math.sin(a) * s * 0.8, 0.3 + Math.random() * 0.8)); (i % 3 ? cy : w).toArray(c, i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.PointsMaterial({ size: 0.001, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.renderOrder = 9; pts.visible = false; pts.userData = { dir, t: -1 };
  return pts;
}
// the beam: three open cylinders (wide at the phone, narrow at the charm), a white core and two flat see-through cyan sleeves (stepped, no blends)
function buildBeam() {
  fx.beamG = new THREE.Group(); fx.beamG.visible = false; scene.add(fx.beamG);
  fx.layers = [[0.3, 0xffffff, 0.95], [0.6, COL.x, 0.42], [1, COL.x, 0.16]].map(([k, c, o]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 1, 1, 14, 1, true).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.userData.k = k; m.renderOrder = 20; m.frustumCulled = false; fx.beamG.add(m); return m;
  });
}
function bindTex(P) { for (const id of P.slots) SLOT[id].mat.uniforms.uMap.value = P.tex || blankTex; }

// ---------------------------------------------------------------- the pixels that fly (one Points draw)
// Each pixel starts at its spot on the card (at the bottom of the screen, a little in front of the phone), streams
// down the beam in a loose spiral, and lands on its own spot on the slot. The centre goes first, so the picture
// assembles from the middle out, ahead of the materialise sweep; a landed pixel hides once the sweep passes it.
const PART_VS = `
uniform float uT, uLaunch, uSpread, uFly, uSwirl, uCardW, uCardH, uCardSize, uSize, uPx, uP;
uniform vec3 uOrigin, uRight, uUp; uniform mat4 uSlot;
attribute vec2 aST; attribute vec3 aLocal, aCol; attribute vec4 aRnd; attribute float aSweep;
varying vec3 vCol; varying float vFly;
void main() {
  vec3 tgt = (uSlot * vec4(aLocal, 1.0)).xyz;
  vec3 card = uOrigin + uRight * (aST.x - 0.5) * uCardW + uUp * (0.5 - aST.y) * uCardH;
  float delay = (aSweep * 0.75 + aRnd.x * 0.25) * uSpread;
  float k = clamp((uT - uLaunch - delay) / uFly, 0.0, 1.0);
  float ke = k * k * (3.0 - 2.0 * k);
  vec3 dir = tgt - card, a = normalize(cross(dir, uUp + vec3(1e-4))), b = normalize(cross(dir, a));
  float ang = aRnd.y * 6.2832 + k * 9.0, rad = sin(3.14159 * k) * length(dir) * 0.06 * uSwirl * (0.3 + aRnd.z * 0.7);
  vec3 p = mix(card, tgt, ke) + (a * cos(ang) + b * sin(ang)) * rad;
  vCol = aCol; vFly = k;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float sz = mix(uCardSize, uSize, ke) * (1.0 + sin(3.14159 * k) * 0.7);
  bool passed = k >= 1.0 && (uP * 1.35 - 0.1) > (aSweep * 0.85 + 0.3);
  gl_PointSize = passed ? 0.0 : min(sz * uPx / max(-mv.z, 1e-4), 48.0);
  gl_Position = projectionMatrix * mv;
}`;
const PART_FS = `
varying vec3 vCol; varying float vFly;
void main() {
  vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard;
  vec3 col = vCol; if (vFly > 0.0 && vFly < 1.0) col = mix(col, vec3(1.0), 0.3);   // lit while flying (one flat step)
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
function buildParticles(P, S) {
  if (fx.pts) { scene.remove(fx.pts); fx.pts.geometry.dispose(); }
  const asp = P.aspect, cols = Math.max(8, Math.round(Math.sqrt(N_PART * asp))), rows = Math.max(4, Math.round(N_PART / cols));
  const c = document.createElement('canvas'); c.width = cols; c.height = rows; const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(P.label, 0, 0, cols, rows); const px = g.getImageData(0, 0, cols, rows).data;
  const st = [], col = [], rnd = [], sw = [], tmp = new THREE.Color(), half = 0.5 * Math.hypot(asp, 1);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const s = (i + 0.5) / cols, t = (j + 0.5) / rows; if (!inLabel(S, s, t)) continue;
    const o = (j * cols + i) * 4; tmp.setRGB(px[o] / 255, px[o + 1] / 255, px[o + 2] / 255, THREE.SRGBColorSpace);
    st.push(s, t); col.push(tmp.r, tmp.g, tmp.b); rnd.push(Math.random(), Math.random(), Math.random(), Math.random());
    sw.push(Math.hypot((s - 0.5) * asp, 0.5 - t) / half);
  }
  const n = st.length / 2, geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aST', new THREE.Float32BufferAttribute(st, 2)); geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4)); geo.setAttribute('aSweep', new THREE.Float32BufferAttribute(sw, 1));
  geo.setAttribute('aLocal', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const m = fx.pmat || (fx.pmat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uLaunch: { value: BT.launch }, uSpread: { value: BT.spread }, uFly: { value: BT.fly }, uSwirl: { value: BT.swirl }, uCardW: { value: 0.01 }, uCardH: { value: 0.01 }, uCardSize: { value: 0.0005 }, uSize: { value: 0.0005 }, uPx: { value: 500 }, uP: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3(1, 0, 0) }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uSlot: { value: new THREE.Matrix4() } },
    vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, toneMapped: false,
  }));
  fx.pts = new THREE.Points(geo, m); fx.pts.frustumCulled = false; fx.pts.renderOrder = 12; fx.pts.userData = { cols, rows, n }; scene.add(fx.pts);
  aimParticles(S);
}
function aimParticles(S) {   // where each pixel lands on this picture's slot
  const a = fx.pts.geometry.attributes, st = a.aST.array, out = a.aLocal.array, p = new THREE.Vector3();
  for (let i = 0; i < st.length / 2; i++) { fromLabel(S, st[i * 2], st[i * 2 + 1], p); out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z + 0.0005; }
  a.aLocal.needsUpdate = true; fx.pts.userData.S = S;
}

// ---------------------------------------------------------------- tracking (Spray Bobo PR #47, as in Bobo X-Ray)
const TS = {};
function initTargets(targets) { for (const t of targets) TS[t.name] = { name: t.name, pr: t.properties, H: LAYOUT.targets[t.name].heightM, tracked: false, at: 0, gap: 40, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 }; }
let testBlind = false;                        // ?test only: pretend the camera lost every print
function onTarget(d) {
  const t = TS[d.name]; if (!t || testBlind) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;          // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.p.set(d.position.x, d.position.y, d.position.z);
  t.s = t.pr.height * upp / t.H;                                       // world units per metre of the print
  const now = performance.now();
  if (!t.tracked) { diag.found++; tDiag(t.name).found++; } else t.gap += (clamp(now - t.at, 8, 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; diag.lost++; tDiag(d.name).lost++; } }
// the side in view: whichever is tracked; with both, keep the current one
let side = null;
function pickSide() {
  const on = Object.values(TS).filter((t) => t.tracked);
  if (!on.length) return side;
  if (!side || !TS[side].tracked) side = on[0].name;
  return side;
}
const motion = { seen: 0, moved: 0 };
function onMotion(e) {
  const r = e.rotationRate, l = e.acceleration, a = e.accelerationIncludingGravity;
  const turn = r && r.alpha != null ? Math.hypot(r.alpha, r.beta, r.gamma) : null;
  const push = l && l.x != null ? Math.hypot(l.x, l.y, l.z) : a && a.x != null ? Math.abs(Math.hypot(a.x, a.y, a.z) - 9.81) : null;
  if (turn == null && push == null) return;
  const now = performance.now(); motion.seen = now;
  if ((turn != null && turn > STILL_DEG) || (push != null && push > STILL_ACC)) motion.moved = now;
}
const pose = { state: 'none', lostAt: 0, snap: true, last: null, valid: false, goneAt: 0 };
function updatePose(now) {
  for (const x of Object.values(TS)) if (x.tracked && now - x.at > clamp(x.gap * 3, 120, 300)) x.tracked = false;   // the engine went quiet
  const n = pickSide(), t = n && TS[n];
  let st;
  if (t && t.tracked) { st = 'track'; pose.last = n; pose.lostAt = now; follow(t.p, t.q, t.s); }
  else if (pose.last) {
    const gone = now - pose.lostAt, sensed = now - motion.seen < 400, still = sensed ? now - motion.moved > 150 : true;
    st = still && gone < (sensed ? HOLD_STILL_MS : HOLD_BLIND_MS) ? 'hold' : 'none';
  } else st = 'none';
  if (st === 'none' && pose.state !== 'none') pose.goneAt = now;
  if (st === 'none') pose.snap = true;
  const fresh = st !== 'none' && pose.state === 'none';
  if (fresh) arrived(now);
  pose.state = st; pose.valid = st !== 'none';
  A.visible = pose.valid && mode !== 'capture';
  for (const k in TG) TG[k].visible = k === n;
}
// follow real movement at once, only smooth sub-millimetre jitter (Spray Bobo's follow)
function follow(p, q, s) {
  const aP = pose.snap ? 1 : clamp(A.position.distanceTo(p) / s / 0.0015, 0.5, 1);
  const aR = pose.snap ? 1 : clamp(A.quaternion.angleTo(q) / 0.03, 0.5, 1);
  const aS = pose.snap ? 1 : clamp(Math.abs(A.scale.x - s) / s / 0.02, 0.5, 1);
  pose.snap = false;
  A.position.lerp(p, aP); A.quaternion.slerp(q, aR); A.scale.setScalar(lerp(A.scale.x, s, aS));
  A.updateMatrixWorld(true);
}
// the slots in view (one picture can carry several), and the one the person means: under the aim point, else the
// one nearest the centre of the screen
const curSlots = () => (pose.valid && side && TSL[side]) || [];
function focusSlot(list) {
  if (list.length < 2) return list[0] || null;
  const [cx, cy] = aimPoint();
  return pickHit(list, cx, cy, 0) || list.reduce((a, b) => (dist2(a, cx, cy) <= dist2(b, cx, cy) ? a : b));
}
function dist2(S, x, y) { const [sx, sy] = toScreen(S, S.land); return (sx - x) ** 2 + (sy - y) ** 2; }
const cur = () => focusSlot(curSlots());

// ---------------------------------------------------------------- what happens
// modes: capture (our selfie camera), find / seen (AR, no photo waiting), aim (a photo waits: aim and lock on), beam
let mode = 'find', everFound = false, lastP = null;
const HELD = { src: null, params: null, face: null };   // the photo waiting to be beamed (it stays for Beam again)
// the photo's settings for a piece: Sukeban's face has its own fit (from the face guide, or set in its preview)
const paramsFor = (P, H = HELD) => (P && P.face && H.face ? { ...H.params, ...H.face } : { ...H.params });
function setMode(m) {
  mode = m; $('hud').dataset.mode = m;
  const aiming = m === 'aim' || m === 'beam';
  $('b-shutter').hidden = aiming; $('b-beam').hidden = !aiming;
  $('shoot-t').textContent = aiming ? (m === 'beam' ? 'Beaming…' : 'Lock on, then Beam') : 'Tap: photo · Hold: video';
  if (m === 'aim') { showCard(); if (!aim.S) $('aim-t').textContent = 'AIM AT A GLOWING SPOT'; } else if (m !== 'beam') { $('beamcard').hidden = true; $('beamcard').classList.remove('hold', 'lock', 'wait'); }
  if (m !== 'aim') setLock(null, false, true);
  syncEmbed();
}
function arrived(now) {
  const away = now - (pose.goneAt || 0);
  if (!everFound || away > REOPEN_AFTER_MS) for (const S of Object.values(SLOT)) S.matP = 0;   // the photo re-materialises
  if (!everFound) { postEvent('found', {}); buzz([10, 40, 18]); }
  everFound = true; if (mode === 'find') setMode('seen');
  diag.firstFoundS = diag.firstFoundS || +((now - camStartAt) / 1000).toFixed(1);
}
let lostFor = 0, toastT = 0;
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }
function toast(text, ms = 2600) { const el = $('toast'); el.textContent = text; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
const sheetOpen = () => !$('edit').hidden || !$('opts').hidden || !$('how').hidden || !$('shot').hidden || CAP.open;

const clock = { t: 0 };
function tick(dt) {
  clock.t += dt;
  const now = performance.now();
  updatePose(now);
  const list = curSlots(), S = focusSlot(list), P = S && S.P;
  if (P) lastP = P;
  $('hud').classList.toggle('lost', !pose.valid);
  if (!pose.valid) {
    lostFor += dt;
    if (mode === 'seen' && lostFor > 0.6) setMode('find');
    if (mode === 'find') hint(everFound ? 'Find a charm again' : 'Point at your keychain');
    if (mode === 'aim' && lostFor > 0.4) hint('Point at a keychain charm');
  } else { lostFor = 0; if (mode === 'find') setMode('seen'); }

  // the slots in view. Each glows (flat cyan outline and fill) while it can take the photo; yellow once locked on.
  const pulse = REDUCED ? 0.6 : 0.5 + 0.5 * Math.sin(clock.t * 4.2);
  for (const Q of list) {
    const QP = Q.P, m = Q.mat.uniforms, inBeam = beam && beam.P === QP && beam.t >= 0, locked = mode === 'aim' && aim.S === Q;
    if (QP.status === 'shown' && !inBeam) {
      if (Q.matP === 0) sound.pop();
      Q.matP = Math.min(1, Q.matP + dt / REMAT_S);
      m.uHas.value = 1; m.uP.value = Q.matP;
    } else if (!inBeam) { m.uHas.value = 0; m.uP.value = 0; }
    m.uPulse.value = pulse; m.uStr.value = LOOKS[look] * (Q.rec.shadeK != null ? Q.rec.shadeK : 1);
    const col = locked ? COL.y : COL.x;
    Q.outline.visible = !inBeam && (mode === 'aim' || m.uHas.value < 0.5);
    Q.outline.material.color.setHex(col); m.uFill.value.setHex(col);
    Q.outline.material.opacity = locked ? 1 : 0.55 + 0.45 * pulse;
    m.uFillA.value = locked ? 0.32 : mode === 'aim' ? 0.14 + 0.2 * pulse : 0.1 + 0.12 * pulse;
    // the can's label spins with inertia
    if (QP.k === 'can') {
      if (!spin.drag) { QP.spin += QP.spinV * dt; QP.spinV *= Math.pow(0.12, dt); }
      m.uSpin.value = QP.spin;
    }
  }
  if (S) {
    if (mode === 'seen' && !beam) hint(P.status === 'shown' ? (P.k === 'can' ? 'Drag across the can to spin your photo' : 'Press the shutter to keep a picture') : 'Press New photo to beam a selfie here');
    if (mode === 'aim') hint('');
  }
  tickAim(dt, list);
  tickBeam(dt, list);
  tickFx(dt);
  const showChips = !!(S && P.status === 'shown' && !beam && mode === 'seen');
  if ($('chips').hidden === showChips) $('chips').hidden = !showChips;
  $('c-again').hidden = !HELD.src;
  recTick();
  diag.fpsN++;
}

// ---------------------------------------------------------------- AIMING: the ray, the reticle, the lock
// The ray runs from the photo card (bottom centre) to a reticle at the centre of the screen. The centre ray is
// tested against the tracked slot's mesh (with a forgiving box around it). Locking needs a short steady hit;
// once locked, a wider box keeps it and it only lets go after a short miss, so it does not flicker.
const aim = { S: null, cand: null, drawn: false, tap: false, candT: 0, missT: 0, k: 1, x: -1, y: -1, bx: 0, by: 0, bw: 64, bh: 64, shown: null };
const ACQ_S = REDUCED ? 0 : 0.12, LOSE_S = 0.35;
let testAim = null;                           // ?test only: aim somewhere other than the screen centre
const aimPoint = () => testAim || [innerWidth / 2, innerHeight / 2];
function setLock(S, tap = false, quiet = false) {
  const was = aim.S; aim.S = S; aim.tap = !!(S && tap); aim.candT = 0; aim.missT = 0;
  if (S === was) return;
  const b = $('b-beam'); b.disabled = !S;
  b.setAttribute('aria-label', S ? `Beam your photo onto ${S.P.spot}` : 'Beam your photo. Aim at a glowing spot first');
  $('aim').classList.toggle('lock', !!S); $('aim-t').classList.toggle('lock', !!S); $('beamcard').classList.toggle('lock', !!S);
  if (S) {
    aim.k = REDUCED ? 1 : 0; b.classList.remove('arm'); void b.offsetWidth; b.classList.add('arm');
    $('aim-t').textContent = `BEAM READY · ${S.P.spot.toUpperCase()}`;
    showCard(S.P); sound.lock(); buzz([14, 40, 14]); diag.locks++;
  } else {
    $('aim-t').textContent = 'AIM AT A GLOWING SPOT';
    if (!quiet) { if (mode === 'aim') showCard(); if (was) { sound.unlock(); buzz(6); } }
  }
}
function tickAim(dt, list) {
  // a one-frame tracking drop keeps the last drawing (and the lock) instead of blinking
  const on = mode === 'aim' && (list.length > 0 || (aim.drawn && lostFor < 0.4));
  if ($('aim').hidden === on) { $('aim').hidden = !on; $('aim-t').hidden = !on; }
  if (mode !== 'aim') { aim.drawn = false; return; }
  if (!list.length) { if (aim.S && lostFor > LOSE_S) setLock(null); if (!on) aim.drawn = false; return; }
  aim.drawn = true;
  if (aim.S && !list.includes(aim.S)) setLock(null);
  const [cx, cy] = aimPoint();
  // several slots on one picture (the tee): the ray picks the one it is on (the mesh first, then the nearest box)
  const hit = pickHit(list, cx, cy, aim.S ? 0.6 : 0.2);
  if (aim.S) {
    const other = pickHit(list, cx, cy, 0);    // squarely on another slot: move the lock there
    if (other && other !== aim.S && !aim.tap) { if ((aim.candT += dt) >= ACQ_S + 0.1) setLock(other); }
    else aim.candT = 0;
    if (aim.tap || hit === aim.S || hitSlot(aim.S, cx, cy, 0.6)) aim.missT = 0;
    else if ((aim.missT += dt) > LOSE_S) setLock(null);
  } else if (hit) { if (aim.cand !== hit) { aim.cand = hit; aim.candT = 0; } if ((aim.candT += dt) >= ACQ_S) setLock(hit); }
  else aim.candT = 0;
  drawAim(dt, aim.S || list[0]);
}
const _pp = new THREE.Vector3();
function toScreen(S, v) { const p = S.g.localToWorld(_pp.copy(v)).project(camera); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; }
function drawAim(dt, S) {
  const [cx, cy] = aimPoint(), L = aim.S === S;
  let tx = cx, ty = cy, bw = 64, bh = 64;
  if (L) {                                   // the slot's box on the screen
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      if (!inLabel(S, i / 4, j / 4) && i % 4 && j % 4) continue;
      const [x, y] = toScreen(S, fromLabel(S, i / 4, j / 4, _w)); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    [tx, ty] = toScreen(S, S.land); bw = Math.max(x1 - x0 + 20, 56); bh = Math.max(y1 - y0 + 20, 56);
    tx = (x0 + x1) / 2; ty = (y0 + y1) / 2;
    aim.k = Math.min(1, aim.k + dt / 0.28);
  }
  const f = REDUCED || aim.x < 0 ? 1 : 1 - Math.exp(-dt * 20);
  aim.x = lerp(aim.x < 0 ? tx : aim.x, tx, f); aim.y = lerp(aim.y < 0 ? ty : aim.y, ty, f);
  aim.bw = lerp(aim.bw, bw, f); aim.bh = lerp(aim.bh, bh, f);
  // the lock-on: the brackets close in from wide; unlocked they breathe a little
  const close = L ? 1 + 0.7 * Math.pow(1 - aim.k, 2) : 1 + (REDUCED ? 0 : 0.08 * Math.sin(clock.t * 4.2));
  const w = aim.bw * close, h = aim.bh * close, x = aim.x, y = aim.y, l = Math.min(w, h) * 0.3, X0 = x - w / 2, X1 = x + w / 2, Y0 = y - h / 2, Y1 = y + h / 2;
  $('rt-tl').setAttribute('d', `M${X0} ${Y0 + l}V${Y0}H${X0 + l}`); $('rt-tr').setAttribute('d', `M${X1 - l} ${Y0}H${X1}V${Y0 + l}`);
  $('rt-br').setAttribute('d', `M${X1} ${Y1 - l}V${Y1}H${X1 - l}`); $('rt-bl').setAttribute('d', `M${X0 + l} ${Y1}H${X0}V${Y1 - l}`);
  $('rt-dot').setAttribute('cx', x); $('rt-dot').setAttribute('cy', y);
  // the ray: from the card's top to the reticle, wide at the phone, thin at the far end (two flat layers)
  // from the card's edge that faces the scene: its top, or (landscape, card at the right) its left side
  const r = $('beamcard').getBoundingClientRect(), onR = r.left + r.width / 2 > innerWidth * 0.7;
  const ox = onR ? r.left + 2 : r.left + r.width / 2, oy = onR ? r.top + r.height / 2 : r.top + 2, ex = x, ey = L || onR ? y : y + h / 2 + 4;
  const ray = (id, w0, w1) => {
    const dx = ex - ox, dy = ey - oy, n = Math.hypot(dx, dy) || 1, nx = -dy / n, ny = dx / n;
    $(id).setAttribute('points', `${ox + nx * w0},${oy + ny * w0} ${ex + nx * w1},${ey + ny * w1} ${ex - nx * w1},${ey - ny * w1} ${ox - nx * w0},${oy - ny * w0}`);
  };
  const fl = L && !REDUCED ? 1 + 0.15 * Math.sin(clock.t * 40) : 1;
  ray('ray-o', 16 * fl, L ? 7 : 4); ray('ray-i', 3.5, L ? 2.5 : 1.2);
  const at = $('aim-t'), above = Y0 - 44 > 64;   // above the brackets (clear of the charm's face), else below
  at.style.top = (above ? Y0 - 44 : Math.min(Y1 + 14, r.top - 44)) + 'px';
}
// the card holds the waiting photo: in the neutral shape, or (locked) cut to that slot's shape
function showCard(P) {
  if (!HELD.src) return;
  const cv = $('beamcard-cv'), asp = P ? P.aspect : ED_ASP, w = 320;
  renderLabel(HELD.src, paramsFor(P), asp, (P || PIECES.bobo).palette, w, cv);
  const card = $('beamcard'); card.classList.add('hold'); card.classList.remove('go', 'wait'); card.hidden = false;
}

// ---------------------------------------------------------------- THE BEAM
let beam = null;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _nd = new THREE.Vector2(), _ray = new THREE.Raycaster(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
function startBeam(P) {
  if (beam) endBeam(true);
  P.spin = 0; P.spinV = 0; P.status = 'beaming';
  const cv = $('beamcard-cv'), w = 320, h = Math.max(24, Math.round(w / P.aspect));
  cv.width = w; cv.height = h; cv.getContext('2d').drawImage(P.label, 0, 0, w, h);
  const card = $('beamcard'); card.classList.add('hold'); card.classList.remove('lock'); card.hidden = false;
  beam = { P, t: -1, armAt: performance.now() + (REDUCED ? 60 : 140), S: null, landed: false, retracted: false, sx: 0, sy: 0, cw: 84, ch: 30 };
  setMode('beam'); $('b-beam').disabled = true; hint('');
  diag.beams++;
}
// Beam: the locked slot takes the waiting photo (replacing any photo it had) and the beam fires
function fire() {
  const S = aim.S; if (!S || !HELD.src || beam || mode !== 'aim') return;
  const P = S.P; sound.init();
  P.src = HELD.src; P.params = paramsFor(P); setLabel(P);
  savePhoto(P).then(syncRemove);
  for (const id of P.slots) SLOT[id].matP = 0;
  startBeam(P);
}
function launch(S) {
  const r = $('beamcard').getBoundingClientRect();
  beam.sx = r.left + r.width / 2; beam.sy = r.top + r.height / 2; beam.cw = r.width; beam.ch = r.height;
  $('beamcard').hidden = true; $('beamcard').classList.remove('wait');
  buildParticles(beam.P, S); beam.S = S; beam.t = 0;
  sound.whoosh(); buzz(15);
}
function tickBeam(dt, list) {
  const S = beam ? list.find((Q) => Q.P === beam.P) || null : null;
  if (!beam) { if (fx.beamG) fx.beamG.visible = false; return; }
  const ok = !!S;
  if (beam.t < 0) {                           // the card is shrinking, or waiting for the charm
    const ready = performance.now() >= beam.armAt;
    if (!ready || !ok) {
      if (ready) { $('beamcard').classList.add('wait'); hint(`Point at ${beam.P.name} to beam it`); }
      return;
    }
    launch(S);
  }
  if (!ok) {                                  // tracking lost: everything waits, hidden; resumes where it was
    fx.pts.visible = false; fx.beamG.visible = false;
    hint(`Find ${beam.P.name} again to finish`);
    return;
  }
  if (beam.S !== S) { aimParticles(S); beam.S = S; }
  hint('');
  beam.t += dt; const t = beam.t;
  // where the phone end is: the card's spot on the screen, a little in front of the camera
  camera.updateMatrixWorld();
  const land = S.g.localToWorld(_w.copy(S.land));
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld), dist = camPos.distanceTo(land);
  const D = Math.max(dist * 0.32, 1e-4), P5 = camera.projectionMatrix.elements[5], wpp = 2 * D / (P5 * innerHeight);
  _nd.set(beam.sx / innerWidth * 2 - 1, -(beam.sy / innerHeight * 2 - 1)); _ray.setFromCamera(_nd, camera);
  const origin = _ray.ray.origin.clone().addScaledVector(_ray.ray.direction, D);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize(), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  // the pixels
  const u = fx.pts.material.uniforms, s = A.scale.x, cols = fx.pts.userData.cols;
  u.uT.value = t; u.uOrigin.value.copy(origin); u.uRight.value.copy(right); u.uUp.value.copy(up);
  u.uCardW.value = beam.cw * wpp; u.uCardH.value = beam.ch * wpp; u.uCardSize.value = beam.cw * wpp / cols * 1.6;
  u.uSize.value = (S.lb.ub - S.lb.ua) * S.W * (S.rec.kind === 'can' ? CAN_WRAP : 1) / cols * s * 1.05;
  u.uPx.value = P5 * renderer.domElement.height / 2; u.uSlot.value.copy(S.g.matrixWorld);
  const sweep = clamp((t - BT.sweep0) / (BT.sweep1 - BT.sweep0), 0, 1);
  u.uP.value = sweep; fx.pts.visible = true;
  const m = S.mat.uniforms; m.uHas.value = 1; m.uP.value = sweep; S.outline.visible = t < BT.launch + BT.fly;
  // the beam of light: grows from the phone to the charm, then pulls in after the last pixel
  const grow = easeInOut(t / BT.grow), back = easeInOut((t - BT.retract0) / (BT.retract1 - BT.retract0));
  const a = origin.clone().lerp(land, back), b = origin.clone().lerp(land, grow), len = a.distanceTo(b);
  fx.beamG.visible = len > 1e-6 && t < BT.retract1;
  if (fx.beamG.visible) {
    _v.subVectors(b, a).normalize(); _q.setFromUnitVectors(_up, _v);
    const r0 = beam.cw * wpp * 0.2 * (1 - back * 0.7), flick = REDUCED ? 1 : 1 + Math.sin(t * 47) * 0.08;
    for (const L of fx.layers) { L.position.copy(a); L.quaternion.copy(_q); L.scale.set(r0 * L.userData.k * flick, len, r0 * L.userData.k * flick); }
  }
  // the first pixels land: a ring shockwave and a sparkle burst on the slot
  if (!beam.landed && t >= BT.launch + BT.fly) { beam.landed = true; sound.land(); sound.shimmer(); buzz(18); S.ring.userData.t = 0; S.sparks.userData.t = 0; }
  if (beam.landed && !beam.chimed && t >= BT.sweep0 + 0.2) { beam.chimed = true; sound.shimmer(8); }
  if (t >= BT.end) endBeam(false);
}
function endBeam(abort) {
  const b = beam; beam = null;
  if (fx.pts) { scene.remove(fx.pts); fx.pts.geometry.dispose(); fx.pts = null; }
  if (fx.beamG) fx.beamG.visible = false;
  $('beamcard').hidden = true;
  if (!b) return;
  if (b.P.status === 'beaming') b.P.status = b.P.src ? 'shown' : 'empty';
  if (abort) return;
  if (b.S) b.S.matP = 1;
  sound.chime(); buzz([12, 40, 22]); setMode(pose.valid ? 'seen' : 'find');
  postEvent('custom', { action: 'photo-beam-beamed', piece: b.P.k, style: b.P.params && b.P.params.style });
  diag.beamsDone++;
}
function tickFx(dt) {
  for (const S of Object.values(SLOT)) {
    const R = S.ring, k = R.userData.t;
    if (k != null && k >= 0) {
      R.userData.t += dt / (REDUCED ? 0.4 : 0.6); const x = R.userData.t;
      R.visible = x < 1; R.scale.setScalar(S.size * lerp(0.12, REDUCED ? 0.5 : 0.75, x)); R.material.opacity = 1 - x;
      if (x >= 1) R.userData.t = -1;
    }
    const sp = S.sparks, d = sp.userData;
    if (d.t >= 0) {
      d.t += dt / (REDUCED ? 0.5 : 0.8); const x = d.t, p = sp.geometry.attributes.position.array, r = S.size * 0.55 * (1 - Math.pow(1 - Math.min(x, 1), 3));
      d.dir.forEach((v, i) => { p[i * 3] = v.x * r; p[i * 3 + 1] = v.y * r; p[i * 3 + 2] = v.z * r * 0.6; });
      sp.geometry.attributes.position.needsUpdate = true;
      sp.material.size = S.H * 0.012 * A.scale.x; sp.material.opacity = x < 0.6 ? 1 : 1 - (x - 0.6) / 0.4;
      sp.visible = x < 1 && !REDUCED; if (x >= 1) d.t = -1;
    }
  }
}

// ---------------------------------------------------------------- taps and the can's spin
const spin = { id: null, x: 0, lx: 0, t: 0, moved: 0, drag: false };
const canvas = $('cam');
canvas.addEventListener('pointerdown', (e) => { spin.id = e.pointerId; spin.x = spin.lx = e.clientX; spin.t = performance.now(); spin.moved = 0; });
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== spin.id) return;
  const dx = e.clientX - spin.lx; spin.lx = e.clientX; spin.moved += Math.abs(dx);
  const S = cur(); if (!S || S.P.k !== 'can' || S.P.status !== 'shown' || spin.moved < 8) return;
  spin.drag = true; const d = -dx / innerWidth * 0.9; S.P.spin += d; S.P.spinV = d / (1 / 60);
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerId !== spin.id) return; spin.id = null;
  const was = spin.drag; spin.drag = false;
  if (!was && spin.moved < 12 && performance.now() - spin.t < 450) tapAt(e.clientX, e.clientY);
});
canvas.addEventListener('pointercancel', () => { spin.id = null; spin.drag = false; });
function tapAt(x, y) {
  const list = curSlots(); if (!list.length || beam || sheetOpen()) return;
  const S = pickHit(list, x, y, 0.25);
  if (!S) { if (mode === 'aim') hint('Aim the centre at a glowing spot, or tap it'); return; }
  sound.click(); buzz(8);
  if (mode === 'aim') setLock(S, true);       // tapping a glowing spot locks it (no aiming needed)
  else openCapture();                        // no photo waiting: take one for it
}
// the slot under a screen point: a mesh hit wins (nearest), else a hit on a slot's box grown by `grow` (nearest centre)
function pickHit(list, x, y, grow = 0.25) {
  let best = null, bd = Infinity;
  for (const S of list) { const d = meshHit(S, x, y); if (d != null && d < bd) { bd = d; best = S; } }
  if (best || !grow) return best;
  for (const S of list) if (hitSlot(S, x, y, grow)) { const d = dist2(S, x, y); if (d < bd) { bd = d; best = S; } }
  return best;
}
function meshHit(S, x, y) {
  const r = canvas.getBoundingClientRect(); _nd.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_nd, camera); A.updateMatrixWorld(true);
  const h = _ray.intersectObject(S.mesh, false); return h.length ? h[0].distance : null;
}
function hitSlot(S, x, y, grow = 0.25) {
  const r = canvas.getBoundingClientRect(); _nd.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  _ray.setFromCamera(_nd, camera); A.updateMatrixWorld(true);
  if (_ray.intersectObject(S.mesh, false).length) return true;
  // a forgiving fallback: anywhere in the slot's box (grown a quarter) on the print plane
  const o = S.g.worldToLocal(_ray.ray.origin.clone()), d = S.g.worldToLocal(_ray.ray.origin.clone().add(_ray.ray.direction)).sub(o);
  if (Math.abs(d.z) < 1e-9) return false;
  const k = -o.z / d.z; if (k < 0) return false;
  const p = o.addScaledVector(d, k), u = p.x / S.W + 0.5, v = 0.5 - p.y / S.H, b = S.rec.box, gu = (b[2] - b[0]) * grow, gv = (b[3] - b[1]) * grow;
  return u > b[0] - gu && u < b[2] + gu && v > b[1] - gv && v < b[3] + gv;
}

// ---------------------------------------------------------------- the photo: decode, style, label
function fitCanvas(src, max) {
  const w0 = src.naturalWidth || src.videoWidth || src.width, h0 = src.naturalHeight || src.videoHeight || src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c;
}
// any picture the phone gives us (HEIC included where the browser can decode it), capped at 1024 px
async function decodeImage(blob) {
  let bmp = null;
  try {
    const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const big = Math.max(probe.width, probe.height);
    if (big > 2 * LABEL_MAX) {               // very large: let the decoder shrink it (less memory on phones)
      const k = LABEL_MAX / big; probe.close && probe.close();
      bmp = await createImageBitmap(blob, { imageOrientation: 'from-image', resizeWidth: Math.round(probe.width * k) || 1, resizeHeight: Math.round(probe.height * k) || 1, resizeQuality: 'high' }).catch(() => createImageBitmap(blob));
    } else bmp = probe;
  } catch (e) { bmp = null; }
  if (!bmp) { const url = URL.createObjectURL(blob); try { bmp = await loadImg(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } }
  const c = fitCanvas(bmp, LABEL_MAX); try { bmp.close && bmp.close(); } catch (e) { /* none */ }
  return c;
}
// Sukeban's face is wider than a real one, so the selfie is cut to a real-face oval (width : height = faceW : 1) in
// her face: its eyes on her eye line, its chin on her chin; the rest of her face is her own flat skin pink.
// The oval is in label units (0..1 across and down), so it reaches above the label, under her fringe.
const FACE_W = { narrow: 0.72, normal: 0.8, wide: 0.9 };
function faceOval(fw) {
  const F = Object.values(PIECES).find((P) => P.face) || {}, eye = F.eyeT || 0.26, chin = F.chinT || 0.94, he = (chin - eye) / 0.58;   // eyes 42 % down a face
  return { cx: 0.5, cy: eye - 0.42 * he + he / 2, rx: fw * he / (F.aspect || 1.2) / 2, ry: he / 2 };
}
function faceClip(g, w, h, fw) {
  const rec = SLREC['tee-sukeban-face'], sk = hexRgb((rec && rec.skin) || '#edc8c2'), o = faceOval(fw);
  const img = g.getImageData(0, 0, w, h), d = img.data, cx = o.cx * w, cy = o.cy * h, rx = o.rx * w, ry = o.ry * h;
  const feather = Math.max(2, w * 0.012) / rx;    // a few px at the slot's own size: a soft edge, not a band
  for (let y = 0; y < h; y++) {
    const dy = (y + 0.5 - cy) / ry;
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / rx, r = Math.sqrt(dx * dx + dy * dy), a = clamp((r - 1 + feather) / feather, 0, 1);
      if (a <= 0) continue;
      const i = (y * w + x) * 4; d[i] += (sk[0] - d[i]) * a; d[i + 1] += (sk[1] - d[i + 1]) * a; d[i + 2] += (sk[2] - d[i + 2]) * a;
    }
  }
  g.putImageData(img, 0, 0);
}
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// the photo cut to the slot's aspect (pan and zoom), in a style, with a sticker on top
function renderLabel(src, prm, aspect, pal, maxSide, out) {
  const Lw = aspect >= 1 ? maxSide : Math.round(maxSide * aspect), Lh = aspect >= 1 ? Math.round(maxSide / aspect) : maxSide;
  const c = out || document.createElement('canvas'); if (c.width !== Lw) c.width = Lw; if (c.height !== Lh) c.height = Lh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, Lw, Lh);
  const sw = src.width, sh = src.height, sc = Math.max(Lw / sw, Lh / sh) * prm.zoom, dw = sw * sc, dh = sh * sc;
  const fx = dw - Lw, fy = dh - Lh;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, -fx / 2 + prm.px * fx / 2, -fy / 2 + prm.py * fy / 2, dw, dh);
  if (prm.match) matchSkin(g, Lw, Lh);
  if (prm.faceW) faceClip(g, Lw, Lh, prm.faceW);
  stylise(g, Lw, Lh, prm.style, prm.style === 'ink' ? INK_PAL() : pal);
  if (prm.sticker && STK.art[prm.sticker.id]) {
    const a = STK.art[prm.sticker.id], h = Math.min(Lw, Lh) * prm.sticker.s, w = h * a.width / a.height;
    g.drawImage(a, prm.sticker.u * Lw - w / 2, prm.sticker.v * Lh - h / 2, w, h);
  }
  return c;
}
// Match skin: shift the photo's tones toward Sukeban's skin (sampled from the tee): per-channel gains from the median
// colour of the middle of the photo (where the face is) to her skin, applied at 70 %. Pixel maths only.
const hexRgbA = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function matchSkin(g, w, h) {
  const rec = SLREC['tee-sukeban-face']; if (!rec || !rec.skin) return;
  const to = hexRgbA(rec.skin), img = g.getImageData(0, 0, w, h), d = img.data, ch = [[], [], []];
  for (let y = Math.floor(h * 0.3); y < h * 0.7; y += 3) for (let x = Math.floor(w * 0.35); x < w * 0.65; x += 3) { const o = (y * w + x) * 4; ch[0].push(d[o]); ch[1].push(d[o + 1]); ch[2].push(d[o + 2]); }
  const med = ch.map((a) => { a.sort((p, q) => p - q); return Math.max(a[a.length >> 1] || 1, 1); });
  const k = med.map((m, i) => 1 + (clamp(to[i] / m, 0.6, 1.7) - 1) * 0.7);
  for (let i = 0; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * k[0]); d[i + 1] = Math.min(255, d[i + 1] * k[1]); d[i + 2] = Math.min(255, d[i + 2] * k[2]); }
  g.putImageData(img, 0, 0);
}
// Ink: the tee's own look: her ink and two flat pinks, plus black ink lines where the photo has edges (Sobel)
const INK_PAL = () => (SLREC['tee-sukeban-face'] ? SLREC['tee-sukeban-face'].palette : ['#1a1214', '#ae8d89', '#edc8c2']);
function inkStyle(g, w, h, pal) {
  const img = g.getImageData(0, 0, w, h), d = img.data, n = w * h, L = new Float32Array(n), B = new Float32Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255; L[i] = l; hist[Math.round(l * 255)]++; }
  let lo = 0, hi = 1, acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc < n * 0.02) lo = i / 255; if (acc <= n * 0.98) hi = i / 255; }
  const span = Math.max(hi - lo, 0.05), r = Math.max(1, Math.round(Math.max(w, h) / 400));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {   // a small box blur so the lines follow shapes, not grain
    let s = 0, c = 0; for (let j = -r; j <= r; j += r) for (let i = -r; i <= r; i += r) { const xx = clamp(x + i, 0, w - 1), yy = clamp(y + j, 0, h - 1); s += L[yy * w + xx]; c++; }
    B[y * w + x] = s / c;
  }
  const M = new Float32Array(n), mh = new Uint32Array(256);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = B[i - w + 1] + 2 * B[i + 1] + B[i + w + 1] - B[i - w - 1] - 2 * B[i - 1] - B[i + w - 1], gy = B[i + w - 1] + 2 * B[i + w] + B[i + w + 1] - B[i - w - 1] - 2 * B[i - w] - B[i - w + 1];
    M[i] = Math.hypot(gx, gy); mh[Math.min(255, Math.round(M[i] * 160))]++;
  }
  let t = 0; acc = 0; for (let i = 0; i < 256; i++) { acc += mh[i]; if (acc > n * 0.9) { t = i / 160; break; } }
  t = Math.max(t, 0.12);
  const P = pal.map(hexRgb);
  for (let i = 0; i < n; i++) {
    const l = clamp((L[i] - lo) / span, 0, 1), c = M[i] > t || l < 0.16 ? P[0] : l < 0.55 ? P[1] : P[2];
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2];
  }
  g.putImageData(img, 0, 0);
}
// pixel filters only: Screen print (3 flat colours from the slot), Halftone dots, Mono, Ink. No generative anything.
function stylise(g, w, h, style, pal) {
  if (style === 'photo') return;
  if (style === 'ink') { inkStyle(g, w, h, pal); return; }
  const img = g.getImageData(0, 0, w, h), d = img.data, n = w * h;
  if (style === 'mono' || style === 'print') {
    const L = new Float32Array(n); let lo = 1, hi = 0;
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) { const l = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255; L[i] = l; hist[Math.round(l * 255)]++; }
    let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02 && lo === 1) lo = i / 255; if (acc > n * 0.98) { hi = i / 255; break; } }
    const span = Math.max(hi - lo, 0.05), P = pal.map(hexRgb);
    for (let i = 0; i < n; i++) {
      const l = clamp((L[i] - lo) / span, 0, 1);
      if (style === 'mono') { const v = clamp((l - 0.5) * 1.15 + 0.5, 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; }
      else { const c = l < 0.36 ? P[0] : l < 0.7 ? P[1] : P[2]; d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; }
    }
    g.putImageData(img, 0, 0); return;
  }
  if (style === 'dots') {                   // halftone: a dot per cell in that cell's own colour, sized by its darkness
    const cell = Math.max(5, Math.round(Math.max(w, h) / 64)), cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
    const t = document.createElement('canvas'); t.width = cw; t.height = ch; const tg = t.getContext('2d', { willReadFrequently: true });
    tg.drawImage(g.canvas, 0, 0, cw, ch); const s = tg.getImageData(0, 0, cw, ch).data;
    g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4, l = (s[o] * 0.299 + s[o + 1] * 0.587 + s[o + 2] * 0.114) / 255, r = cell * 0.5 * Math.sqrt(clamp(1.08 - l, 0.06, 1)) * 1.3;
      const k = 0.85;   // the ink a touch deeper than the photo
      g.fillStyle = `rgb(${s[o] * k | 0},${s[o + 1] * k | 0},${s[o + 2] * k | 0})`;
      g.beginPath(); g.arc((x + 0.5) * cell + (y % 2 ? cell / 2 : 0), (y + 0.5) * cell, r, 0, Math.PI * 2); g.fill();
    }
  }
}
function setLabel(P) {
  P.label = renderLabel(P.src, P.params, P.aspect, P.palette, LABEL_MAX, P.label);
  if (!P.tex) { P.tex = new THREE.CanvasTexture(P.label); P.tex.colorSpace = THREE.SRGBColorSpace; P.tex.wrapS = THREE.RepeatWrapping; P.tex.anisotropy = 4; }
  P.tex.image = P.label; P.tex.needsUpdate = true; bindTex(P);
}
const defaultParams = () => ({ zoom: 1, px: 0, py: 0, style: 'photo', sticker: null, match: false });

// ---------------------------------------------------------------- saved photos (IndexedDB, on this phone only)
function idb() {
  return new Promise((res, rej) => {
    try { const r = indexedDB.open('photo-beam', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  });
}
async function loadSaved() {
  try {
    const db = await idb();
    for (const P of Object.values(PIECES)) {
      const rec = await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(P.k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
      if (!rec || !rec.src) continue;
      try {
        if (rec.params && rec.params.sticker) await stickerArt(rec.params.sticker.id);
        P.src = await decodeImage(rec.src); P.params = { ...defaultParams(), ...rec.params }; setLabel(P); P.status = 'shown';
      } catch (e) { console.warn('saved photo', e); }
    }
  } catch (e) { /* none saved */ }
}
async function savePhoto(P, pending = false) {
  try {
    const blob = await new Promise((res) => P.src.toBlob(res, 'image/jpeg', 0.9));
    const db = await idb();
    await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ src: blob, params: P.params, pending, at: Date.now() }, P.k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    return true;
  } catch (e) { console.warn('save', e); return false; }
}
async function removePhoto(P) {
  if (!P) return;
  if (beam && beam.P === P) endBeam(true);
  try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').delete(P.k); } catch (e) { /* none */ }
  P.status = 'empty'; P.src = null; P.params = null; P.spin = P.spinV = 0;
  for (const id of P.slots) { SLOT[id].mat.uniforms.uHas.value = 0; SLOT[id].matP = 0; }
  syncRemove(); toast(`Photo removed from ${P.name}`); sound.click();
}
function syncRemove() {
  const P = lastP && lastP.status !== 'empty' ? lastP : Object.values(PIECES).find((x) => x.status !== 'empty');
  $('o-remove').disabled = !P; $('o-remove-s').textContent = P ? `Take it off ${P.name}` : 'Nothing to remove yet';
  $('o-remove').dataset.k = P ? P.k : '';
}

// ---------------------------------------------------------------- stickers (Spray Bobo's decal library)
const STK = { lib: null, art: {}, ready: null };
STK.ready = getJson('/evade/spray-bobo/decals/decals.json').then((m) => { STK.lib = m.decals.filter((d) => d.cat !== 'wear'); buildStickers(); }).catch(() => { STK.lib = []; });
function stickerArt(id) {   // the decal with a white die-cut edge, drawn once
  if (STK.art[id]) return Promise.resolve(STK.art[id]);
  const d = (STK.lib || []).find((x) => x.id === id) || { file: id + '.svg' };
  return loadImg('/evade/spray-bobo/decals/' + d.file).then((img) => {
    const iw = img.naturalWidth || 256, ih = img.naturalHeight || 256, k = 256 / Math.max(iw, ih), w = Math.round(iw * k), h = Math.round(ih * k), pad = 10;
    const c = document.createElement('canvas'); c.width = w + pad * 2; c.height = h + pad * 2; const g = c.getContext('2d');
    const t = document.createElement('canvas'); t.width = w; t.height = h; const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0, w, h); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, w, h);
    for (let a = 0; a < 16; a++) g.drawImage(t, pad + Math.cos(a * 0.3927) * pad * 0.9, pad + Math.sin(a * 0.3927) * pad * 0.9);
    g.drawImage(img, pad, pad, w, h); STK.art[id] = c; return c;
  });
}
function buildStickers() {
  const el = $('ed-stickers'); el.innerHTML = '';
  const mk = (id, html, label) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.id = id; b.setAttribute('aria-label', label); b.setAttribute('aria-checked', 'false'); b.innerHTML = html; el.appendChild(b); return b; };
  mk('', '<span>None</span>', 'No sticker').classList.add('none');
  for (const d of STK.lib) mk(d.id, `<img src="/evade/spray-bobo/decals/${d.file}" alt="" loading="lazy">`, d.name + ' sticker');
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b || !ED.src) return;
    const id = b.dataset.id; sound.click();
    if (!id) ED.params.sticker = null;
    else { await stickerArt(id).catch(() => null); ED.params.sticker = { id, u: 0.78, v: 0.66, s: 0.42 }; }
    syncStickers(); drawEditor();
  };
}
function syncStickers() { const id = (ED.params && ED.params.sticker && ED.params.sticker.id) || ''; document.querySelectorAll('#ed-stickers button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === id))); }

// ---------------------------------------------------------------- sheets
function openSheet(id) { $(id).hidden = false; const f = $(id).querySelector('.x, button'); if (f) f.focus(); }
function closeSheet(id) { $(id).hidden = true; }
document.querySelectorAll('[data-close]').forEach((el) => { el.addEventListener('click', () => { const bs = el.closest('.bs'); if (bs) { bs.hidden = true; if (bs.id === 'opts') $('b-opts').setAttribute('aria-expanded', 'false'); } }); });
addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!$('opts').hidden) closeSheet('opts'); else if (!$('edit').hidden) retake(); });

// ---------------------------------------------------------------- CAPTURE: our own camera, the front one first
// Not the AR engine: a plain getUserMedia stream (the raw call, before the iPhone lens patch). The preview is
// mirrored for the front camera and the photo is saved mirrored, as the person saw it. Before the AR camera starts
// (or resumes), every track is stopped and the video emptied, and iPhones get a moment to let the camera go.
const CAP = { open: false, stream: null, facing: 'user', mirror: true, cams: 0, timer: store.get('timer', '0') === '1', counting: false, gen: 0 };
const engine = { started: false, paused: false };
async function openCapture() {
  if (beam) endBeam(true);
  if (engine.started && !engine.paused) { try { XR8.pause(); } catch (e) { diag.errors.push('pause: ' + String(e).slice(0, 80)); } engine.paused = true; camLog('pause'); }
  if (!$('edit').hidden) closeEditor();
  CAP.open = true; $('capture').hidden = false; $('hud').hidden = true; $('cap-x').hidden = !engine.started;
  syncTimer(); setMode('capture'); diag.captures++;
  await camOpen(CAP.facing);
}
function camLive() { const t = CAP.stream && CAP.stream.getVideoTracks()[0]; return !!(t && t.readyState === 'live'); }
function camStop() {
  if (CAP.stream) { for (const t of CAP.stream.getTracks()) { try { t.stop(); } catch (e) { /* gone */ } } CAP.stream = null; }
  const v = $('cap-video'); try { v.pause(); } catch (e) { /* none */ } v.srcObject = null;
}
async function camOpen(facing, exact = false) {
  const gen = ++CAP.gen; camStop(); $('cap-err').hidden = true;
  if (!GUM) { capErr('NotSupportedError'); return false; }
  const base = { width: { ideal: 1280 }, height: { ideal: 960 } };
  let st = null, err = null;
  for (const fm of exact ? [{ exact: facing }, { ideal: facing }] : [{ ideal: facing }]) {
    try { st = await GUM({ audio: false, video: { ...base, facingMode: fm } }); break; } catch (e) { err = e; if (e && e.name === 'NotAllowedError') break; }
  }
  if (gen !== CAP.gen || !CAP.open) { if (st) st.getTracks().forEach((t) => t.stop()); return false; }
  if (!st) { capErr(err && err.name); return false; }
  CAP.stream = st; const v = $('cap-video'); v.muted = true; v.srcObject = st;
  try { await v.play(); } catch (e) { /* autoplay: muted inline plays */ }
  const tr = st.getVideoTracks()[0], set = (tr && tr.getSettings && tr.getSettings()) || {};
  CAP.facing = set.facingMode === 'environment' ? 'environment' : set.facingMode === 'user' ? 'user' : facing;
  CAP.mirror = set.facingMode ? set.facingMode === 'user' : facing === 'user';
  v.classList.toggle('mirror', CAP.mirror);
  try { const ds = await navigator.mediaDevices.enumerateDevices(); CAP.cams = ds.filter((d) => d.kind === 'videoinput').length; } catch (e) { CAP.cams = 1; }
  $('cap-flip').hidden = CAP.cams < 2;
  diag.selfie = { facing: CAP.facing, mirror: CAP.mirror, cams: CAP.cams, label: tr && tr.label, w: set.width, h: set.height };
  return true;
}
function capErr(name) {
  diag.capErr = name || 'unknown';
  const body = name === 'NotAllowedError' ? 'Camera access is off for this site. Pick a photo from your library instead, or allow the camera in your browser settings and try again.'
    : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'We couldn\'t find a camera to take your photo. Pick one from your library instead.'
      : name === 'NotReadableError' ? 'Another app may be using the camera. Close it and try again, or pick a photo from your library.'
        : name === 'NotSupportedError' ? 'This browser can\'t open the camera here. Pick a photo from your library instead.'
          : 'Something stopped the camera. Try again, or pick a photo from your library.';
  $('cap-err-b').textContent = body; $('cap-err').hidden = false; $('cap-err-lib').focus();
}
// leave capture for the AR camera: stop every track, empty the video, give the camera a moment to be free
async function leaveCapture() {
  CAP.gen++; CAP.counting = false; $('cap-count').hidden = true; $('cap-shutter').classList.remove('counting');
  camStop(); CAP.open = false; $('capture').hidden = true; $('cap-err').hidden = true;
  await wait(IOS ? 450 : 150);
}
async function flipCam() {
  const v = $('cap-video'); sound.click(); buzz(8);
  if (!REDUCED) { v.classList.add('flip'); await wait(170); }
  await camOpen(CAP.facing === 'user' ? 'environment' : 'user', true);
  v.classList.remove('flip');
}
function syncTimer() { $('cap-timer').setAttribute('aria-pressed', String(CAP.timer)); $('cap-timer').setAttribute('aria-label', CAP.timer ? '3 second timer on' : '3 second timer off'); }
async function shoot(noTimer = false) {
  if (CAP.counting || !camLive()) return;
  const v = $('cap-video');
  if (CAP.timer && !noTimer) {
    CAP.counting = true; $('cap-shutter').classList.add('counting'); const el = $('cap-count'); el.hidden = false;
    for (let n = 3; n > 0; n--) {
      if (!CAP.counting) return;
      el.textContent = String(n); el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); sound.click(); buzz(6);
      await wait(1000);
    }
    el.hidden = true; $('cap-shutter').classList.remove('counting');
    if (!CAP.counting) return; CAP.counting = false;
  }
  for (let i = 0; i < 15 && !v.videoWidth; i++) await wait(100);   // the stream just opened: wait for its first frame
  if (!v.videoWidth) { toast('The camera isn\'t ready yet'); return; }
  // what was on the screen: the cover crop of the video, mirrored as shown
  const W = innerWidth, H = innerHeight, vw = v.videoWidth, vh = v.videoHeight, sc = Math.max(W / vw, H / vh);
  const sw = W / sc, sh = H / sc, sx = (vw - sw) / 2, sy = (vh - sh) / 2, k = Math.min(1, LABEL_MAX / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  const g = c.getContext('2d'); if (CAP.mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
  // where the face guide was in the picture (it is centred, so mirroring keeps it in place)
  const gr = $('cap-guide').getBoundingClientRect(), guide = { x0: gr.left / W, y0: gr.top / H, x1: gr.right / W, y1: gr.bottom / H };
  const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 80); sound.init(); sound.shutter(); buzz(20);
  diag.snaps++; openEditor(c, null, guide);
}
$('cap-shutter').onclick = () => { if (CAP.counting) { CAP.counting = false; $('cap-count').hidden = true; $('cap-shutter').classList.remove('counting'); return; } shoot(); };
$('cap-flip').onclick = flipCam;
$('cap-timer').onclick = () => { CAP.timer = !CAP.timer; store.set('timer', CAP.timer ? '1' : '0'); syncTimer(); sound.click(); };
$('cap-x').onclick = async () => { await leaveCapture(); await backToAr(); };
$('cap-err-retry').onclick = () => camOpen(CAP.facing);

// Library: the phone's picker. Phones can pause or drop a camera while it is open, so check it after.
let picking = false;
function openLibrary() { picking = true; diag.picks++; $('file').value = ''; $('file').click(); }
$('cap-lib').onclick = openLibrary; $('cap-err-lib').onclick = openLibrary;
$('file').addEventListener('change', async () => {
  const f = $('file').files && $('file').files[0]; picking = false; afterPicker('picker');
  if (!f) return;
  try { openEditor(await decodeImage(f)); }
  catch (e) { console.warn('decode', e); diag.errors.push('decode: ' + String(e).slice(0, 80)); toast('Couldn\'t open that photo. Try another one.'); }
});
$('file').addEventListener('cancel', () => { picking = false; afterPicker('cancel'); });
addEventListener('focus', () => { if (picking) setTimeout(() => { if (picking) { picking = false; afterPicker('focus'); } }, 600); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => afterPicker('visible'), 400); });
function afterPicker(why) {
  if (CAP.open) { if (!camLive() && $('edit').hidden && $('cap-err').hidden) camOpen(CAP.facing); return; }
  if (camStartAt) ensureCamera(why);
}

// The editor: drag to pan, pinch / wheel to zoom, a style, a sticker, in a neutral rounded shape (the slot is
// chosen later, by aiming). The photo is cut to the slot's own shape when it is beamed.
const ED = { src: null, params: null, face: null, view: 'any', ptrs: new Map(), pinch: 0, mode: null, raf: 0 };
// The face guide on the capture screen has the shape of Sukeban's face slot, with her eye line: by default the part
// of the photo inside the guide is what lands in her face (cover fit, zoomed and panned to the guide's box).
function faceFromGuide(src, guide) {
  const F = Object.values(PIECES).find((P) => P.face) || {}, base = { faceW: FACE_W.normal, match: true };   // Match skin on for her face: no seam
  if (!guide || !F.aspect) return { zoom: 1, px: 0, py: 0, ...base };
  const Lw = 1000, Lh = Lw / F.aspect, sw = src.width, sh = src.height, sc0 = Math.max(Lw / sw, Lh / sh);
  const gw = (guide.x1 - guide.x0) * sw, gcx = (guide.x0 + guide.x1) / 2 * sw, gcy = (guide.y0 + guide.y1) / 2 * sh;
  const zoom = clamp(Lw / gw / sc0, 1, 5), sc = sc0 * zoom, fx = sw * sc - Lw, fy = sh * sc - Lh;
  const left = gcx - Lw / sc / 2, top = gcy - Lh / sc / 2;
  return { zoom, px: fx > 0.5 ? clamp(1 - 2 * left * sc / fx, -1, 1) : 0, py: fy > 0.5 ? clamp(1 - 2 * top * sc / fy, -1, 1) : 0, ...base };
}
function openEditor(src, prm, guide) {
  ED.src = src; ED.params = prm ? { ...prm } : HELD.params ? { ...HELD.params, zoom: 1, px: 0, py: 0 } : defaultParams();
  ED.face = faceFromGuide(src, guide);
  if (HELD.face && HELD.face.faceW) { ED.face.faceW = HELD.face.faceW; ED.face.match = HELD.face.match; }
  document.querySelectorAll('#ed-style button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ED.params.style)));
  syncStickers(); syncView();
  $('edit').hidden = false; drawEditor(); $('ed-go').focus();
}
function closeEditor() { $('edit').hidden = true; ED.src = null; }
function retake() { if (EMBED) { closeEditor(); setMode(HELD.src ? 'aim' : pose.valid ? 'seen' : 'find'); return; } if (FROM_BOOTH && !CAP.open && !engine.started) { location.href = '/evade/bobo-booth/'; return; } closeEditor(); if (!CAP.open && !engine.started) { openCapture(); return; } if (CAP.open && !camLive()) camOpen(CAP.facing); }
// On Sukeban shows her face controls: Match skin and the face width (both apply to her face only)
function syncView() {
  document.querySelectorAll('#ed-view button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ED.view)));
  const on = ED.view === 'face'; $('ed-face').hidden = !on; $('ed-match').hidden = !on;
  if (!ED.face) return;
  $('ed-match').setAttribute('aria-checked', String(!!ED.face.match));
  document.querySelectorAll('#ed-fw button').forEach((b) => b.setAttribute('aria-checked', String(FACE_W[b.dataset.v] === ED.face.faceW)));
}
// the preview's geometry: which settings the gestures move, the label's size, and its rectangle on the canvas
function edGeom() {
  const cv = $('ed-cv');
  if (ED.view !== 'face') return { prm: ED.params, Lw: cv.width, Lh: cv.height, rect: [0, 0, cv.width, cv.height] };
  const F = PIECES.sukeface, rec = SLREC['tee-sukeban-face'], lb = labelBox(rec), b = rec.box, bw = b[2] - b[0], bh = b[3] - b[1];
  const Lw = 640, Lh = Math.round(640 / F.aspect);
  return { prm: ED.face, Lw, Lh, rect: [(lb.ua - b[0]) / bw * cv.width, (lb.va - b[1]) / bh * cv.height, (lb.ub - lb.ua) / bw * cv.width, (lb.vb - lb.va) / bh * cv.height] };
}
// Sukeban's face preview: the tee's art round the slot, the selfie cut by the slot's mask, so her fringe, hair,
// earrings and fingers sit on top of it as they will on the tee
const SUKE = { art: null, mask: null };
function sukeAssets() {
  if (SUKE.art) return Promise.resolve();
  const rec = SLREC['tee-sukeban-face'];
  return Promise.all([loadImg(TEE + 'tee-sukeban.jpg'), loadImg(HERE + 'slots/' + rec.mask)]).then(([art, mk]) => {
    const c = document.createElement('canvas'); c.width = mk.width; c.height = mk.height; const g = c.getContext('2d');
    g.drawImage(mk, 0, 0); const d = g.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = a; }
    g.putImageData(d, 0, 0); SUKE.art = art; SUKE.mask = c;
  });
}
const edTmp = document.createElement('canvas'), edLab = document.createElement('canvas');
function drawEditor() {
  if (!ED.src) return;
  cancelAnimationFrame(ED.raf);
  ED.raf = requestAnimationFrame(() => {
    if (!ED.src) return;
    const cv = $('ed-cv');
    if (ED.view === 'face' && SUKE.art) {
      const rec = SLREC['tee-sukeban-face'], b = rec.box, F = PIECES.sukeface, aw = SUKE.art.width, ah = SUKE.art.height;
      const bw = (b[2] - b[0]) * aw, bh = (b[3] - b[1]) * ah, k = 640 / Math.max(bw, bh);
      cv.width = Math.round(bw * k); cv.height = Math.round(bh * k);
      const g = cv.getContext('2d'); g.drawImage(SUKE.art, b[0] * aw, b[1] * ah, bw, bh, 0, 0, cv.width, cv.height);
      const geo = edGeom(), [rx, ry, rw, rh] = geo.rect;
      renderLabel(ED.src, { ...ED.params, ...ED.face }, F.aspect, F.palette, 640, edLab);
      edTmp.width = cv.width; edTmp.height = cv.height; const t = edTmp.getContext('2d');
      t.clearRect(0, 0, cv.width, cv.height); t.drawImage(edLab, rx, ry, rw, rh);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(SUKE.mask, 0, 0, cv.width, cv.height); t.globalCompositeOperation = 'source-over';
      g.drawImage(edTmp, 0, 0);
      return;
    }
    renderLabel(ED.src, ED.params, ED_ASP, PIECES.bobo.palette || ['#06185f', '#8bc7fc', '#d5ebfe'], 640, cv);
    const g = cv.getContext('2d'), w = cv.width, h = cv.height, r = Math.min(w, h) * 0.12;
    g.save(); g.beginPath(); g.rect(0, 0, w, h);
    if (g.roundRect) g.roundRect(3, 3, w - 6, h - 6, r); else g.rect(3, 3, w - 6, h - 6);
    g.fillStyle = '#0b1216'; g.fill('evenodd');
    g.beginPath(); if (g.roundRect) g.roundRect(3, 3, w - 6, h - 6, r); else g.rect(3, 3, w - 6, h - 6);
    g.lineWidth = Math.max(3, w / 160); g.strokeStyle = COL.xs; g.stroke(); g.restore();
  });
}
document.querySelectorAll('#ed-view button').forEach((b) => { b.onclick = async () => { ED.view = b.dataset.v; syncView(); sound.click(); if (ED.view === 'face') await sukeAssets().catch(() => {}); drawEditor(); }; });
$('ed-match').onclick = () => { if (!ED.face) return; ED.face.match = !ED.face.match; syncView(); sound.click(); drawEditor(); };
document.querySelectorAll('#ed-fw button').forEach((b) => { b.onclick = () => { if (!ED.face) return; ED.face.faceW = FACE_W[b.dataset.v]; syncView(); sound.click(); drawEditor(); }; });
const edCv = $('ed-cv');
function edLocal(e) { const r = edCv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, r]; }
function onSticker(u, v) {
  const s = ED.params.sticker; if (ED.view === 'face' || !s || !STK.art[s.id]) return false;
  const a = STK.art[s.id], cw = edCv.width, ch = edCv.height, h = Math.min(cw, ch) * s.s, w = h * a.width / a.height;
  return Math.abs(u * cw - s.u * cw) < w / 2 && Math.abs(v * ch - s.v * ch) < h / 2;
}
edCv.addEventListener('pointerdown', (e) => {
  edCv.setPointerCapture(e.pointerId); const [u, v] = edLocal(e); ED.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  ED.mode = ED.ptrs.size === 1 && onSticker(u, v) ? 'sticker' : 'pan';
  if (ED.ptrs.size === 2) { const [a, b] = [...ED.ptrs.values()]; ED.pinch = Math.hypot(a.x - b.x, a.y - b.y); ED.mode = 'pinch'; }
});
edCv.addEventListener('pointermove', (e) => {
  const p = ED.ptrs.get(e.pointerId); if (!p || !ED.src) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  const r = edCv.getBoundingClientRect(), geo = edGeom(), prm = geo.prm;
  if (ED.mode === 'pinch' && ED.ptrs.size >= 2) {
    const [a, b] = [...ED.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (ED.pinch > 0) prm.zoom = clamp(prm.zoom * d / ED.pinch, 1, 5); ED.pinch = d;
  } else if (ED.mode === 'sticker') {
    prm.sticker.u = clamp(prm.sticker.u + dx / r.width, 0, 1); prm.sticker.v = clamp(prm.sticker.v + dy / r.height, 0, 1);
  } else {                                     // pan: the free space the zoomed photo has beyond the label, each way
    const src = ED.src, { Lw, Lh } = geo, sc = Math.max(Lw / src.width, Lh / src.height) * prm.zoom;
    const fxp = src.width * sc - Lw, fyp = src.height * sc - Lh, kx = Lw / (geo.rect[2] * r.width / edCv.width), ky = Lh / (geo.rect[3] * r.height / edCv.height);
    if (fxp > 0.5) prm.px = clamp(prm.px + 2 * dx * kx / fxp, -1, 1);
    if (fyp > 0.5) prm.py = clamp(prm.py + 2 * dy * ky / fyp, -1, 1);
  }
  drawEditor();
});
const edUp = (e) => { ED.ptrs.delete(e.pointerId); if (ED.ptrs.size < 2) ED.pinch = 0; if (!ED.ptrs.size) ED.mode = null; };
edCv.addEventListener('pointerup', edUp); edCv.addEventListener('pointercancel', edUp);
edCv.addEventListener('wheel', (e) => { e.preventDefault(); if (!ED.src) return; const p = edGeom().prm; p.zoom = clamp(p.zoom * Math.exp(-e.deltaY * 0.0015), 1, 5); drawEditor(); }, { passive: false });
document.querySelectorAll('#ed-style button').forEach((b) => { b.onclick = () => { ED.params.style = b.dataset.v; document.querySelectorAll('#ed-style button').forEach((x) => x.setAttribute('aria-checked', String(x === b))); sound.click(); drawEditor(); }; });
$('ed-x').onclick = retake;
$('ed-back').onclick = retake;
$('ed-go').onclick = () => readyToBeam();
// Ready to beam: the photo waits; the selfie camera goes, the AR camera comes (started, or resumed)
async function readyToBeam() {
  if (!ED.src) return;
  sound.init();
  HELD.src = ED.src; HELD.params = { ...ED.params }; HELD.face = { ...ED.face }; closeEditor();
  if (EMBED && engine.started && !engine.paused) { setMode('aim'); syncEmbed(); return; }   // styled in the booth: straight back to aiming
  postEvent('custom', { action: 'photo-beam-ready', style: HELD.params.style });
  await leaveCapture();
  await backToAr();
}
async function backToAr() {
  if (!engine.started) { await startEngine(); return; }   // its onStart shows the HUD in the right mode
  $('hud').hidden = false; setMode(HELD.src ? 'aim' : pose.valid ? 'seen' : 'find');
  await resumeEngine();
}

// ---------------------------------------------------------------- HUD buttons and options
$('b-photo').onclick = () => { sound.init(); if (EMBED) { toBooth(); return; } openCapture(); };

// ---------------------------------------------------------------- embedded in the Bobo Booth (?embed=booth)
// The booth (parent, same origin) pauses its face camera and posts { type: 'pb-beam', blob, delay }; we wait out the
// camera hand-over delay, then start (first time) or resume the rear-camera engine with the photo waiting to aim.
// 'pb-live' tells the booth the camera is up (it fades this frame in); Booth (bottom left) / Options > Back to the
// Bobo Booth pause our engine and post 'pb-back'. Style (bottom right) opens Make it yours on the waiting photo.
function toParent(msg) { try { window.parent.postMessage(msg, location.origin); } catch (e) { /* gone */ } }
function syncEmbed() { if (EMBED) $('b-style').hidden = !HELD.src || mode === 'beam'; }
async function waitLive(ms = 8000) {
  const t0 = performance.now(); let ct = -1;
  while (performance.now() - t0 < ms) {
    const v = engineVideo(); if (v && v.srcObject && !v.paused) { if (ct >= 0 && v.currentTime > ct) return true; ct = v.currentTime; }
    await wait(150);
  }
  return false;
}
async function fromBooth(blob, delay) {
  if (beam) endBeam(true);
  const src = await decodeImage(blob);
  HELD.src = src; HELD.params = defaultParams(); HELD.face = faceFromGuide(src, null);
  diag.booth = (diag.booth || 0) + 1; postEvent('custom', { action: 'photo-beam-from-booth' });
  await wait(delay);
  if (!engine.started) await startEngine();
  else { $('hud').hidden = false; setMode('aim'); await resumeEngine(); }
  syncEmbed();
  toParent({ type: 'pb-live', ok: await waitLive() });
}
async function toBooth() {
  if (beam) endBeam(true);
  closeEditor(); closeSheet('opts');
  if (engine.started && !engine.paused) { try { XR8.pause(); } catch (e) { /* not running */ } engine.paused = true; camLog('pause'); }
  setMode('find'); $('hud').hidden = true;
  toParent({ type: 'pb-back' });
}
if (EMBED) {
  $('splash').hidden = true;
  $('b-photo-t').textContent = 'Booth'; document.querySelector('#hud .tl .tag').textContent = 'BOOTH · BEAM'; $('b-photo').setAttribute('aria-label', 'Back to the Bobo Booth');
  $('o-booth').hidden = false; $('o-booth').onclick = (e) => { e.preventDefault(); toBooth(); };
  $('ed-back').textContent = 'Cancel'; $('ed-go').textContent = 'Done';
  $('b-style').onclick = () => { if (!HELD.src || beam) return; sound.init(); sound.click(); openEditor(HELD.src, HELD.params); };
  addEventListener('pointerdown', () => sound.init(), { once: true, capture: true });
  addEventListener('devicemotion', onMotion);   // the booth asked for motion permission on its Beam tap
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data) return;
    if (e.data.type === 'pb-beam' && e.data.blob) fromBooth(e.data.blob, e.data.delay || 150).catch((err) => { console.error(err); diag.errors.push('booth: ' + String(err).slice(0, 80)); toParent({ type: 'pb-live', ok: false }); });
  });
  Promise.all([assets, xrReady]).then(() => toParent({ type: 'pb-ready' })).catch(() => toParent({ type: 'pb-failed' }));
}
$('c-remove').onclick = () => { const S = cur(); if (S) removePhoto(S.P); };
$('c-again').onclick = () => { if (!HELD.src) return; sound.click(); buzz(8); setMode('aim'); };
$('b-beam').onclick = () => fire();
function segInit(id, curV, fn) {
  const btns = [...document.querySelectorAll(`#${id} button`)];
  const sync = (v) => btns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v))));
  sync(curV); btns.forEach((b) => { b.onclick = () => { sync(b.dataset.v); fn(b.dataset.v); sound.click(); }; });
}
segInit('seg-look', look, (v) => { look = v; store.set('look', v); });
function openOpts() { syncRemove(); $('opts').hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); $('opts').querySelector('.x').focus(); }
$('b-opts').onclick = openOpts;
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); };
$('o-remove').onclick = () => { const P = PIECES[$('o-remove').dataset.k]; closeSheet('opts'); removePhoto(P); };
$('o-how').onclick = () => { closeSheet('opts'); $('how').hidden = false; $('b-go').focus(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
$('err-retry').onclick = () => location.reload();
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; }

// ---------------------------------------------------------------- 8th Wall pipeline
const DPR = clamp(+params.get('dpr') || 1, 1, 3);   // 1x by default like Off the Chain (fastest pickup); ?dpr=2 sharper
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
// after a camera restart the engine may hand us a new three.js scene: move our things into it
function rebind() {
  const xr = XR8.Threejs.xrScene(); if (!xr || xr.scene === scene) return;
  const old = scene; ({ scene, camera, renderer } = xr); renderer.outputColorSpace = THREE.SRGBColorSpace;
  for (const o of [A, fx.beamG, fx.pts]) if (o) { old.remove(o); scene.add(o); }
  diag.rebinds++;
}
const appModule = () => ({
  name: 'photo-beam',
  onStart: () => { if (built) { rebind(); return; } buildScene(XR8.Threejs.xrScene()); built = true; if (!CAP.open) { $('hud').hidden = false; setMode(HELD.src ? 'aim' : 'find'); } },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (built) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video, stream }) => {
    camLog(status);
    if (status === 'hasStream') { kickVideo(); noteStream(stream); }
    if (status === 'hasVideo') {
      hideTapCam(); if (!camStartAt) camStartAt = performance.now(); tuneCamera(video);
    }
    if (status === 'requesting') hint('Allow camera access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => { console.error('XR', e); diag.errors.push('XR: ' + String((e && e.message) || e).slice(0, 200)); flushDiag(true, true); showError('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
  ],
});
async function askMotion() {
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) { const r = await DeviceMotionEvent.requestPermission(); diag.motion = r; if (r !== 'granted') return; }
    addEventListener('devicemotion', onMotion);
  } catch (e) { diag.motion = 'error:' + (e && e.name); }
}
const runConfig = () => ({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
// Start: the splash goes and capture opens (our own front camera). The AR engine starts later, at Ready to beam.
async function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init(); capture && capture.configure({ audioContext: sound.ctx }); await askMotion();
  postEvent('scan', {});
  $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
  if (boothSrc) { const src = boothSrc; boothSrc = null; postEvent('custom', { action: 'photo-beam-from-booth' }); openEditor(src); return; }
  await openCapture();
}
$('b-start').onclick = start;
async function startEngine() {
  if (engine.started) return; engine.started = true;
  const data = await assets;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  initTargets(data.tdata);
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: data.tdata });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(),
    appModule(),
    { name: 'pb-capture', onRender: () => { if (capture) capture.frame(); } },
  ]);
  camLog('run');
  setTimeout(() => { if (!camStartAt && !tapCamShown) camFailed('no video after 12 s'); }, 12000);
  XR8.run(runConfig());
}
// back from capture: resume the engine (it re-opens the rear camera) and check that frames flow again; if not,
// the restart path (pause, resume, play the video until it moves)
async function resumeEngine() {
  for (const t of Object.values(TS)) t.tracked = false;
  pose.snap = true; diag.resumes++; camLog('resume');
  try { XR8.resume(); } catch (e) { diag.errors.push('resume: ' + String(e).slice(0, 120)); }
  engine.paused = false;
  let t0 = -1;
  for (let i = 0; i < 10; i++) {
    await wait(300);
    if (CAP.open) return;                     // gone back to capture meanwhile
    const v = engineVideo(), tr = v && v.srcObject && v.srcObject.getVideoTracks()[0];
    if (v && v.srcObject && v.paused) { v.muted = true; v.play().catch(() => {}); }
    if (v && tr && tr.readyState === 'live' && !v.paused) { if (t0 >= 0 && v.currentTime > t0) { camLog('resumed'); return; } t0 = v.currentTime; }
  }
  restartCamera('resume');
}

// After the photo picker (or a trip to another app) the camera may be paused or gone: if the engine's video is not
// advancing, play it; if that does not help, pause and resume the engine (its resume re-opens the camera when the
// stream's tracks are no longer live; XR8.stop() + XR8.run() throws "No valid session manager" in this build).
let restarting = false;
async function ensureCamera(why) {
  if (!camStartAt || restarting || CAP.open || engine.paused) return;
  const v = engineVideo(); if (!v) return;
  const t0 = v.currentTime; await wait(900);
  const v2 = engineVideo(); if (v2 && v2 === v && v.currentTime !== t0 && !v.paused) return;
  camLog('stalled:' + why);
  try { v.muted = true; await v.play(); } catch (e) { /* blocked */ }
  const t1 = v.currentTime; await wait(900);
  if (v.currentTime !== t1 && !v.paused) { camLog('resumed'); return; }
  restartCamera(why);
}
async function restartCamera(why) {
  if (restarting) return; restarting = true; diag.restarts++; camLog('restart:' + why);
  try { if (!XR8.isPaused()) XR8.pause(); } catch (e) { /* not running */ }
  await wait(300);
  try { XR8.resume(); } catch (e) { diag.errors.push('resume: ' + String(e).slice(0, 120)); }
  // the new stream's video can sit paused (no gesture since): play it until frames flow
  for (let i = 0; i < 12; i++) {
    await wait(350);
    const v = engineVideo();
    if (v && v.srcObject && v.paused) { v.muted = true; v.play().catch(() => {}); }
    if (v && !v.paused && v.currentTime > 0) { camLog('restarted'); break; }
  }
  restarting = false;
}

// ---------------------------------------------------------------- camera (the same handling as Off the Chain / Spray Bobo / X-Ray)
// iPhones: ask for the multi-lens camera (close focus for a keychain) at 1920x1440; no picture in 4 s: reload once
// with the standard camera.
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MACRO_LENSES = ['Back Triple Camera', 'Back Dual Wide Camera'];
let iosStd = false; try { iosStd = sessionStorage.getItem('xr-ios-std') === '1'; } catch (e) { /* none */ }
const IOS_MACRO = IOS && params.get('macro') !== '0' && !iosStd;
if (IOS && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const md = navigator.mediaDevices, orig = md.getUserMedia.bind(md);
  const lensId = () => (IOS_MACRO ? md.enumerateDevices().then((ds) => { for (const n of MACRO_LENSES) { const d = ds.find((x) => x.kind === 'videoinput' && x.label === n); if (d) return d.deviceId; } return null; }).catch(() => null) : Promise.resolve(null));
  md.getUserMedia = (c) => {
    const v = c && c.video; if (!v || v === true) return orig(c);
    return lensId().then((id) => {
      const nv = { ...v, width: { ...(v.width || {}), ideal: 1920 }, height: { ...(v.height || {}), ideal: 1440 } };
      if (id) { nv.deviceId = { exact: id }; delete nv.facingMode; }
      diag.asked = nv; return orig({ ...c, video: nv }).catch((e) => { diag.askFailed = String(e && e.name || e); return orig(c); });
    });
  };
}
function engineVideo() { return [...document.querySelectorAll('video')].find((v) => v.srcObject && v.id !== 'cap-video') || null; }
function tuneCamera(video) {
  try {
    const tr = video && video.srcObject && video.srcObject.getVideoTracks()[0]; if (!tr) return;
    const caps = tr.getCapabilities ? tr.getCapabilities() : {};
    if (caps.focusMode && caps.focusMode.includes('continuous')) tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
    if (IOS_MACRO && /Triple|Dual Wide/.test(tr.label) && caps.zoom) { const z = Math.min(Math.max(caps.zoom.min < 1 ? 1 : 2, caps.zoom.min), caps.zoom.max); tr.applyConstraints({ advanced: [{ zoom: z }] }).catch(() => {}); }
    const st = tr.getSettings ? tr.getSettings() : {};
    diag.camera = { label: tr.label, width: st.width || video.videoWidth, height: st.height || video.videoHeight, frameRate: st.frameRate, focusMode: st.focusMode, zoom: st.zoom };
  } catch (e) { diag.errors.push('tune: ' + String(e).slice(0, 120)); }
}
let tapCamShown = false;
function kickVideo() {
  setTimeout(() => {
    if (camStartAt) return; camLog('notPlaying');
    if (IOS_MACRO) { try { sessionStorage.setItem('xr-ios-std', '1'); } catch (e) { /* none */ } flushDiag(true, true); location.reload(); return; }
    showTapCam();
  }, 4000);
}
function noteStream(stream) { try { const t = stream && stream.getVideoTracks()[0]; diag.stream = t ? { label: t.label, state: t.readyState } : null; } catch (e) { /* none */ } }
function showTapCam() {
  if (camStartAt || tapCamShown) return; tapCamShown = true;
  const card = document.createElement('div'); card.id = 'tap-cam'; card.setAttribute('role', 'alert');
  card.innerHTML = '<h2>Waiting for the camera</h2><p>Another app or tab may be using it. Close the Camera app, any video call and other tabs that use the camera, then tap Try again.</p><div class="row"><button type="button" class="primary" data-a="reload">Try again</button><button type="button" data-a="play">Start camera here</button></div>';
  card.querySelector('[data-a=reload]').onclick = () => location.reload();
  card.querySelector('[data-a=play]').onclick = () => { const v = engineVideo(); if (v) { v.muted = true; v.play().catch(() => {}); } setTimeout(() => { if (!camStartAt) camFailed('no video after tap'); }, 8000); };
  document.body.appendChild(card); card.querySelector('button').focus();
}
function hideTapCam() { const el = $('tap-cam'); if (el) el.remove(); }
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true); hideTapCam();
  if (IOS_MACRO) try { sessionStorage.setItem('xr-ios-std', '1'); } catch (e) { /* none */ }
  showError('The camera didn\'t start', 'Another app or tab may be using it. Close the Camera app and other tabs that use the camera, then tap Try again. If it still won\'t start, allow camera access for this site in your browser settings.');
}

// ---------------------------------------------------------------- photo and video (the Cola Run recorder)
const LOGO = { evade: new Image(), act: new Image() };
LOGO.evade.src = '/brand/evade-logo.webp'; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawWatermark(c, Wd, Hd) {
  const u = Math.min(Wd, Hd) / 720, pad = 26 * u;
  if (LOGO.evade.complete && LOGO.evade.naturalWidth) { const h = 44 * u, w = h * LOGO.evade.naturalWidth / LOGO.evade.naturalHeight; c.drawImage(LOGO.evade, pad, pad, w, h); }
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/evade/where-is-bobo/', source: 'photo-beam', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  // the clip shows the user's own photo: save and share only, never sent anywhere
  Object.assign(capture.settings, {
    corner: 'topRight', offsetX: -5, offsetY: -6, accent: '#4fd6e8', maxSeconds: 30, sendEnabled: false,
    hintText: 'Film your charm wearing your photo', keepTitle: 'Keep your clip?', clipTitle: 'Photo Beam clip', filePrefix: 'photo-beam', backLabel: 'Back to the camera',
  });
  capture.apply(); capture.setVisible(false);
} catch (e) { console.warn('recorder', e); capture = null; }
function recUi(on) {
  $('b-shutter').classList.toggle('rec', on); $('rec-time').hidden = !on;
  $('b-shutter').setAttribute('aria-label', on ? 'Stop recording' : 'Take a photo. Press and hold to film');
  recFrom = on ? performance.now() : 0; if (!on) $('rec-prog').style.strokeDashoffset = '207';
}
function recTick() {
  if (!recFrom) return;
  const sec = (performance.now() - recFrom) / 1000, max = (capture && capture.settings.maxSeconds) || 30;
  $('rec-prog').style.strokeDashoffset = String(207 * (1 - Math.min(sec / max, 1)));
  const t = `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`; if ($('rec-time').textContent !== t) $('rec-time').textContent = t;
}
async function takePhoto() {
  try {
    sound.shutter(); buzz(20); const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    const file = new File([blob], `photo-beam-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'Photo Beam' }).catch(() => {});
    $('shot').hidden = false; postEvent('share', { what: 'photo-beam-photo' });
  } catch (e) { console.error(e); }
}
const HOLD_MS = 320; let holding = false, holdT = 0;
const sh = $('b-shutter');
sh.addEventListener('contextmenu', (e) => e.preventDefault());
sh.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  if (capture && capture.status === 'recording') { holding = false; return; }
  holding = true; try { sh.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  clearTimeout(holdT); holdT = setTimeout(() => { if (holding && capture) capture.start(); }, HOLD_MS);
});
sh.addEventListener('pointerup', () => {
  if (capture && capture.status === 'recording') { holding = false; clearTimeout(holdT); capture.stop(); return; }
  if (!holding) return; holding = false; clearTimeout(holdT); takePhoto();
});
sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });
sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takePhoto(); } });
$('shot-close').onclick = () => { $('shot').hidden = true; };

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous; never the photo)
const SID = 'pb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'photo-beam', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'photo-beam').
const diag = { page: 'photo-beam', sid: SID, found: 0, lost: 0, fpsN: 0, beams: 0, beamsDone: 0, captures: 0, snaps: 0, picks: 0, locks: 0, resumes: 0, restarts: 0, rebinds: 0, errors: [], steps: [], targets: {} };
function tDiag(n) { return diag.targets[n] || (diag.targets[n] = { found: 0, lost: 0 }); }
function camLog(s) { diag.steps.push([s, Math.round(performance.now())]); if (diag.steps.length > 40) diag.steps.shift(); }
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, look, photos: Object.values(PIECES).filter((P) => P.status !== 'empty').map((P) => P.k), screen: [innerWidth, innerHeight, devicePixelRatio] });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });

// automated tests (?test): drive capture, the editor, aiming and the beam; read the state
if (params.has('test')) window.__pb = {
  TS, diag, PIECES, SLOT,
  state: () => {
    const v = $('cap-video');
    return {
      pose: pose.state, mode, side, piece: (() => { const S = cur(); return S ? S.P.k : null; })(), held: !!HELD.src,
      pieces: Object.fromEntries(Object.values(PIECES).map((P) => [P.k, { status: P.status, spin: +P.spin.toFixed(3), aspect: +(P.aspect || 0).toFixed(3) }])),
      beam: beam ? { piece: beam.P.k, t: +beam.t.toFixed(3), landed: beam.landed, particles: fx.pts ? fx.pts.userData.n : 0 } : null,
      slots: Object.fromEntries(Object.values(SLOT).map((S) => [S.name, { has: S.mat.uniforms.uHas.value, p: +S.mat.uniforms.uP.value.toFixed(3), outline: S.outline.visible, visible: S.g.visible }])),
      capture: { open: CAP.open, live: camLive(), facing: CAP.facing, mirror: CAP.mirror, cams: CAP.cams, video: [v.videoWidth, v.videoHeight], flip: !$('cap-flip').hidden, err: $('cap-err').hidden ? null : diag.capErr },
      engine: { ...engine, xrPaused: engine.started ? XR8.isPaused() : null, video: (() => { const e = engineVideo(); const t = e && e.srcObject && e.srcObject.getVideoTracks()[0]; return e ? { paused: e.paused, t: +e.currentTime.toFixed(2), track: t && t.readyState } : null; })() },
      aim: { visible: !$('aim').hidden, locked: aim.S ? aim.S.name : null, tap: aim.tap, ready: !$('b-beam').disabled, label: $('aim-t').textContent },
      sheets: { edit: !$('edit').hidden, opts: !$('opts').hidden },
    };
  },
  openCapture: () => openCapture(), shoot: () => shoot(true), flip: () => flipCam(), retake: () => retake(),
  async library(url, prm, guide) { openEditor(await decodeImage(await (await fetch(url)).blob()), prm ? { ...defaultParams(), ...prm } : null, guide); return true; },
  view: (v) => { const b = document.querySelector(`#ed-view button[data-v="${v}"]`); if (b) b.click(); }, match: () => $('ed-match').click(), faceWidth: (v) => { const b = document.querySelector(`#ed-fw button[data-v="${v}"]`); if (b) b.click(); }, face: () => ({ ...ED.face }),
  guideRect: () => { const r = $('cap-guide').getBoundingClientRect(); return { x0: r.left / innerWidth, y0: r.top / innerHeight, x1: r.right / innerWidth, y1: r.bottom / innerHeight, eye: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ge')) / 100 }; },
  style: (v) => { const b = document.querySelector(`#ed-style button[data-v="${v}"]`); if (b) b.click(); },
  ready: () => readyToBeam(), fire: () => fire(), again: () => $('c-again').click(), lock: (n) => { const S = SLOT[n]; if (S) setLock(S, true); },
  remove: (k) => removePhoto(PIECES[k]), restartCamera: () => restartCamera('test'), ensureCamera: () => ensureCamera('test'),
  // the slot's box corners on the screen (to aim taps in tests)
  slotScreen(n) {
    const S = SLOT[n] || cur(); if (!S || !A.visible) return null;
    const pr = (v) => toScreen(S, v);
    return { centre: pr(S.land), corners: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([s, t]) => pr(fromLabel(S, s, t))) };
  },
  aimAt: (x, y) => { testAim = x == null ? null : [x, y]; },
  tap: (x, y) => tapAt(x, y), blind: (on) => { testBlind = !!on; },
  fake: (name, d) => onTarget({ name, position: d.position, rotation: d.rotation, scale: d.scale, scaledHeight: d.scaledHeight || 1 }),
};

// desktop: a QR to open it on the phone
if (!TOUCH) {
  $('desk').hidden = false;
  try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
