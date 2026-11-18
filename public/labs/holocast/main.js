// MEDIALIFE Holocast: a holo projector on your floor or table that beams live screens into the room.
//
//   notice board  typed in the control room (pinned one big, the rest as a feed), types itself in
//   live sketch   strokes stream in while someone draws them, from any number of devices
//   Where is Bobo? a hologram globe with the real sighting pins (/api/bobo/feed.json): drag to spin,
//                 tap a pin to play that clip beside it
//   photo drop    the newest photo big; tap to flip through the last six
//   live poll     3D bars that grow as people vote; tap a bar to vote (one vote a phone, can change)
//   captions      the control room's mic, typed across a ribbon as they speak
//   reactions     tap one (right edge): it floats up out of the projector on every phone watching, and
//                 shows up in the control room
//   live          the control room's camera (Go live): every other screen folds away and one big holo screen
//                 shows the feed (WebRTC, ./live.js), with scanlines, flicker and the theme tint
//   ticker        a ring round the projector with real MEDIALIFE activity (scans across our experiences)
//
// Data: one room record on the server (src/lib/holocast/server.ts) polled by ./room.js. Things sent with a
// "fling" (swiped up in the control room) shoot out of the projector; everything else rides up the beam as
// a packet of light. The room persists: reopen tomorrow and it's all still there.
//
// World tracking (SLAM) from 8th Wall's engine binary, the same set-up as Bobo Hoops / Spray Bobo Street:
// responsive scale (camera starts CAM_H above the floor plane y = 0), floor = ray from the screen to y = 0.
import * as THREE from 'three';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';
import { Room, CODE_RE, createRoom, savedRoom, saveRoom, keyFromHash, controlUrl, viewUrl, ago, THEMES, REACTIONS } from './room.js?v=2';
import { LiveViewer } from './live.js?v=1';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const backOut = (x) => { const c = 1.7; x = clamp(x, 0, 1) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('hc-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('hc-' + k, v); } catch (e) { /* none */ } } };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FONT = '"Space Grotesk", system-ui, sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
const CAM_H = 1.3;
const SCALE = { min: 0.3, max: 1.4, def: 0.8 };   // the whole rig; 1 = screens at 0.9-1.7 m (floor), ~0.4 on a desk

// ---------------------------------------------------------------- sound (made here, no files)
const sound = {
  ctx: null, on: store.get('sound', '1') !== '0', master: null, hum: null,
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)(); this.ctx.resume();
      if (!this.master) { this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 1 : 0; this.master.connect(this.ctx.destination); }
    } catch (e) { /* no audio */ }
  },
  setOn(v) { this.on = v; store.set('sound', v ? '1' : '0'); if (this.master) this.master.gain.setTargetAtTime(v ? 1 : 0, this.ctx.currentTime, 0.05); },
  tone(f0, f1, dur, vol = 0.15, type = 'sine', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, hp, lp, when = 0) {
    if (!this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * dur), b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
    const s = this.ctx.createBufferSource(); s.buffer = b; const g = this.ctx.createGain(); g.gain.value = vol;
    const f1 = this.ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = hp;
    const f2 = this.ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp;
    s.connect(f1).connect(f2).connect(g).connect(this.master); s.start(this.ctx.currentTime + when);
  },
  startHum() {   // a quiet two-oscillator hum while the projector runs
    if (!this.ctx || this.hum) return;
    const g = this.ctx.createGain(); g.gain.value = 0; g.connect(this.master);
    const a = this.ctx.createOscillator(), b = this.ctx.createOscillator(); a.frequency.value = 55; b.frequency.value = 110.6; b.type = 'triangle';
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    a.connect(lp); b.connect(lp); lp.connect(g); a.start(); b.start();
    g.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.8); this.hum = g;
  },
  powerUp() { this.tone(80, 640, 1.4, 0.12, 'sawtooth'); this.tone(160, 1280, 1.4, 0.05, 'sine', 0.1); this.noise(1.2, 0.05, 1500, 8000, 0.1); },
  screen(i = 0) { this.tone(900 + i * 140, 1800 + i * 200, 0.12, 0.06, 'square', 0.02); },
  arrive() { this.tone(1320, 1980, 0.08, 0.08, 'triangle'); this.tone(1980, 2640, 0.1, 0.06, 'triangle', 0.07); },
  slam() { this.noise(0.18, 0.3, 120, 3000); this.tone(160, 60, 0.22, 0.25, 'triangle'); },
  whoosh() { this.noise(0.4, 0.09, 700, 6000); },
  pop() { this.tone(500, 900, 0.08, 0.08, 'triangle'); },
  pulse() { this.tone(60, 240, 0.6, 0.2, 'sawtooth'); this.noise(0.6, 0.08, 400, 4000); },
  vote() { this.tone(660, 990, 0.09, 0.08, 'triangle'); },
  type() { this.tone(2400 + Math.random() * 600, 2200, 0.02, 0.025, 'square'); },
};

// ---------------------------------------------------------------- the room
let room = null;
let theme = THEMES.cyan;
const col = () => new THREE.Color(theme.c);
const roomReady = (async () => {
  const p = (params.get('room') || '').toUpperCase(), hk = keyFromHash(), saved = savedRoom();
  if (CODE_RE.test(p)) {
    saveRoom(p, hk); const s = savedRoom();
    if (hk) history.replaceState(null, '', location.pathname + location.search);   // the key stays out of the address bar
    return { code: p, key: (s && s.code === p && s.key) || hk || '' };
  }
  if (saved) return saved;
  return null;   // made on Start (so nobody makes rooms just by visiting)
})();
async function openRoom() {
  let r = await roomReady;
  if (!r) {
    const made = await createRoom(); saveRoom(made.code, made.key); r = { code: made.code, key: made.key };
    history.replaceState(null, '', `?room=${r.code}`);
  }
  room = new Room(r.code, r.key, { role: 'viewer' });
  room.on(onRoom);
  room.start();
  $('o-control').href = controlUrl(room.code, room.key);
  return room;
}
function setRoomChip() {
  const s = room && room.state, el = $('b-room');
  if (!room) return;
  el.classList.toggle('on', !!s && !room.offline); el.classList.toggle('off', !!room.offline);
  $('room-t').textContent = room.offline ? `${room.code} · offline` : s ? `${room.code} · ${s.watching || 1} watching` : room.code;
}

// what changed in the room -> what moves in the hologram
const panelOf = { notices: 'notice', sketch: 'sketch', 'sketch-reset': 'sketch', photos: 'photo', poll: 'poll', caption: 'caption' };
function onRoom(what, r, prev) {
  const s = r.state;
  if (what === 'gone') { toast('This room was closed. Start a fresh one from Options.', 4000); return; }
  if (what === 'offline' || what === 'online' || what === 'presence') { setRoomChip(); return; }
  if (what === 'error') return;
  if (!s) return;
  setRoomChip();
  if (what === 'init') { applyTheme(s.theme, true); drawAll(); syncLive(); return; }
  if (what === 'theme') { applyTheme(s.theme); toast(`Colour: ${theme.name}`); return; }
  if (what === 'title') { drawTitle(); return; }
  if (what === 'pulse') { if (placed) pulseBeam(); return; }
  if (what === 'reactions') { incomingReactions(prev); return; }
  if (what === 'notices') {
    const before = new Set((prev ? prev.notices : []).map((n) => n.id));
    const fresh = s.notices.filter((n) => !before.has(n.id));
    if (fresh.length) {
      const n = fresh[fresh.length - 1]; typing = { id: n.id, t0: performance.now() + (n.fling ? 900 : 650) };
      deliver('notice', n.fling, () => drawNotice());
      toast(`New notice from ${n.from}`);
    } else drawNotice();
    return;
  }
  if (what === 'photos') {
    const before = new Set((prev ? prev.photos : []).map((p) => p.id));
    const fresh = s.photos.filter((p) => !before.has(p.id));
    if (fresh.length) { const p = fresh[fresh.length - 1]; photoIdx = 0; loadPhoto(p).then(() => deliver('photo', p.fling, () => drawPhoto())); toast(`Photo from ${p.from}`); }
    else { photoIdx = 0; drawPhoto(); }
    return;
  }
  if (what === 'sketch' || what === 'sketch-reset') {
    if (what === 'sketch-reset') sketchDirty = 'full'; else if (sketchDirty !== 'full') sketchDirty = 'more';
    if (placed && booted && fx && fx.packets.length < 3) packetTo('sketch');
    return;
  }
  if (what === 'poll') {
    const was = prev && prev.poll, now = s.poll;
    if (now && (!was || was.id !== now.id)) { myVote = -1; deliver('poll', false, () => buildPoll()); toast('Live poll: tap a bar to vote'); }
    else if (!now) hidePoll(); else updatePoll();
    return;
  }
  if (what === 'caption') { onCaption(); return; }
  if (what === 'live') { syncLive(); return; }
}

// ---------------------------------------------------------------- scene
let scene, camera, renderer;
const rig = new THREE.Group();                // the projector + every screen, stood on the floor
const ghost = new THREE.Group();              // placing: the reticle + a see-through projector
const worldFx = new THREE.Group();            // things in world space (focused screens, flung cards)
let reticle;
const tick = [];                              // per-frame callbacks (dt, t)
const mats = { theme: [], themeLine: [] };    // materials that take the theme colour
function themeMat(o = {}) { const m = new THREE.MeshBasicMaterial({ color: col(), transparent: true, depthWrite: false, ...o }); mats.theme.push(m); return m; }
function themeLine(op = 0.8) { const m = new THREE.LineBasicMaterial({ color: col(), transparent: true, opacity: op, depthWrite: false }); mats.themeLine.push(m); return m; }
function applyTheme(name, quiet) {
  theme = THEMES[name] || THEMES.cyan; const c = col();
  for (const m of mats.theme) m.color.copy(c);
  for (const m of mats.themeLine) m.color.copy(c);
  if (live.mat) live.mat.uniforms.uTint.value.copy(c);
  document.documentElement.style.setProperty('--h', theme.c);
  if (!quiet) { drawAll(); if (placed) pulseBeam(0.6); }
}

function buildScene(xr) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  camera.position.set(0, CAM_H, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20242c, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(0.6, 2, 1.2); scene.add(sun);
  scene.add(rig); scene.add(ghost); scene.add(worldFx);
  rig.visible = false;
  // reticle on the floor
  reticle = new THREE.Group();
  const r1 = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.22, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  const r2 = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.235, 64), new THREE.MeshBasicMaterial({ color: 0x05070c, transparent: true, opacity: 0.45, depthWrite: false }));
  const r3 = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.112, 6), themeMat({ opacity: 0.9 }));
  for (const m of [r1, r2, r3]) { m.rotation.x = -Math.PI / 2; reticle.add(m); }
  ghost.add(reticle);
  buildRig();
  const g = buildProjector(true); ghost.add(g); ghost.userData.proj = g;
  ghost.visible = false;
}

// ---------------------------------------------------------------- the projector
const EMIT_Y = 0.235;                         // the lens, where every beam starts
let proj, beam, beamRings = [], lens, segs = [];
function buildProjector(isGhost) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a212d, metalness: 0.75, roughness: 0.35, transparent: isGhost, opacity: isGhost ? 0.55 : 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0f16, metalness: 0.4, roughness: 0.6, transparent: isGhost, opacity: isGhost ? 0.55 : 1 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.06, 48), metal); base.position.y = 0.03; g.add(base);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.17, 0.05, 48), dark); skirt.position.y = 0.085; g.add(skirt);
  const col1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.09, 32), metal); col1.position.y = 0.155; g.add(col1);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.03, 32), dark); cap.position.y = 0.215; g.add(cap);
  // the glowing ring of segments round the skirt (they chase while it runs)
  const segG = new THREE.BoxGeometry(0.05, 0.016, 0.01);
  const ring = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, m = new THREE.Mesh(segG, isGhost ? new THREE.MeshBasicMaterial({ color: col(), transparent: true, opacity: 0.5 }) : themeMat({ opacity: 0.35, depthWrite: true }));
    m.position.set(Math.sin(a) * 0.168, 0.088, Math.cos(a) * 0.168); m.rotation.y = a; ring.add(m); if (!isGhost) segs.push(m);
  }
  g.add(ring);
  const lensM = new THREE.Mesh(new THREE.CircleGeometry(0.06, 40), isGhost ? new THREE.MeshBasicMaterial({ color: col(), transparent: true, opacity: 0.5 }) : themeMat({ opacity: 0.95, depthWrite: true }));
  lensM.rotation.x = -Math.PI / 2; lensM.position.y = EMIT_Y - 0.004; g.add(lensM);
  // three little vents
  for (let i = 0; i < 3; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.004), dark); const a = i * 2.1 + 0.4; v.position.set(Math.sin(a) * 0.186, 0.03, Math.cos(a) * 0.186); v.rotation.y = a; g.add(v); }
  if (!isGhost) lens = lensM;
  return g;
}
function buildBeam() {
  const geo = new THREE.CylinderGeometry(0.62, 0.05, 1.0, 48, 1, true); geo.translate(0, 0.5, 0);
  beam = new THREE.Mesh(geo, themeMat({ opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  beam.position.y = EMIT_Y; beam.scale.y = 0.001; beam.renderOrder = 1; rig.add(beam);
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 64), themeMat({ opacity: 0, blending: THREE.AdditiveBlending }));
    r.rotation.x = Math.PI / 2; r.userData.k = i / 3; rig.add(r); beamRings.push(r);
  }
}

// ---------------------------------------------------------------- screens
// layout in the rig (projector at the origin, the viewer was towards +z when it was placed)
const LAYOUT = {
  notice: { p: V(-0.62, 1.38, 0.1), w: 0.64, h: 0.44, yaw: 0.42, title: 'NOTICE BOARD' },
  globe: { p: V(0, 1.55, -0.12), w: 0.46, h: 0.5, yaw: 0, title: 'WHERE IS BOBO?' },
  sketch: { p: V(0.62, 1.38, 0.1), w: 0.5, h: 0.5, yaw: -0.42, title: 'LIVE SKETCH' },
  photo: { p: V(-0.66, 0.82, 0.22), w: 0.44, h: 0.46, yaw: 0.5, title: 'PHOTO DROP' },
  poll: { p: V(0.66, 0.84, 0.22), w: 0.52, h: 0.52, yaw: -0.5, title: 'LIVE POLL' },
  caption: { p: V(0, 1.06, 0.34), w: 0.92, h: 0.13, yaw: 0, title: '' },
};
const PANELS = {};
const PX = 1100;                              // canvas pixels per metre of screen
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.round(w * PX); c.height = Math.round(h * PX); return c; }
function makePanel(name) {
  const L = LAYOUT[name], g = new THREE.Group();
  g.position.copy(L.p); g.rotation.y = L.yaw;
  const inner = new THREE.Group(); g.add(inner);              // what scales in / flickers
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), new THREE.MeshBasicMaterial({ color: 0x03080d, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }));
  bg.renderOrder = 3; inner.add(bg);
  const canvas = makeCanvas(L.w, L.h), tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(L.w, L.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  face.position.z = 0.002; face.renderOrder = 5; inner.add(face);
  // frame: a thin outline + bright corner brackets
  const hw = L.w / 2, hh = L.h / 2, k = Math.min(L.w, L.h) * 0.14;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(L.w, L.h)), themeLine(0.45)); edge.position.z = 0.003; inner.add(edge);
  const br = []; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * hw, y = sy * hh; br.push(x, y - sy * k, 0, x, y, 0, x, y, 0, x - sx * k, y, 0); }
  const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(br, 3));
  const brackets = new THREE.LineSegments(bgeo, themeLine(1)); brackets.position.z = 0.004; inner.add(brackets);
  // a hit plane a bit bigger than the screen (taps)
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(L.w * 1.06, L.h * 1.1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  hit.userData.panel = name; inner.add(hit);
  // the light ray from the lens to the bottom of the screen
  const rayGeo = new THREE.BufferGeometry().setFromPoints([V(), V()]);
  const rayLine = new THREE.Line(rayGeo, themeLine(0.32)); rig.add(rayLine);
  const P = { name, L, g, inner, bg, face, tex, canvas, ctx: canvas.getContext('2d'), hit, rayLine, on: 0, show: false, flick: 0, shake: 0, home: { p: g.position.clone(), q: g.quaternion.clone() }, focus: null };
  PANELS[name] = P; rig.add(g); g.visible = false; inner.scale.set(1, 0.001, 1);
  return P;
}
const _a = V(), _b = V();
function rayEnds(P) {   // lens -> bottom centre of the screen, in rig space
  _a.set(0, EMIT_Y, 0); _b.set(0, -P.L.h / 2, 0).applyQuaternion(P.g.quaternion).add(P.g.position);
  return [_a, _b];
}
function updateRay(P) {
  const pos = P.rayLine.geometry.attributes.position; const [a, b] = rayEnds(P);
  pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
  P.rayLine.visible = P.g.visible && !P.focus && P.on > 0.5 && P.name !== 'caption';
}

// ---------------------------------------------------------------- 2D drawing helpers
function header(P, right) {
  const c = P.ctx, W = P.canvas.width;
  c.fillStyle = theme.c; c.font = `700 30px ${MONO}`; c.textBaseline = 'middle';
  c.fillText(P.L.title, 34, 40);
  // the live dot
  const lw = right ? c.measureText(right).width : 0;
  c.font = `500 24px ${MONO}`; if (right) { c.globalAlpha = 0.75; c.fillText(right, W - 34 - c.measureText(right).width, 40); c.globalAlpha = 1; }
  c.fillStyle = '#ff2fae'; c.beginPath(); c.arc(W - 46 - (right ? c.measureText(right).width + 8 : 0), 40, 8, 0, Math.PI * 2); c.fill();
  c.fillStyle = theme.c; c.globalAlpha = 0.35; c.fillRect(34, 70, W - 68, 2); c.globalAlpha = 1;
  return lw;
}
function wrap(c, text, maxW, maxLines) {
  const words = String(text).split(/\s+/), lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (c.measureText(t).width <= maxW || !line) line = t; else { lines.push(line); line = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) { let l = lines[maxLines - 1]; while (c.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); lines[maxLines - 1] = l + '…'; }
  return lines;
}
function fitText(c, text, maxW, maxLines, big, small, weight = 700) {
  for (let s = big; s >= small; s -= 4) { c.font = `${weight} ${s}px ${FONT}`; const lines = wrap(c, text, maxW, 99); if (lines.length <= maxLines) return { s, lines }; }
  c.font = `${weight} ${small}px ${FONT}`; return { s: small, lines: wrap(c, text, maxW, maxLines) };
}
function clear(P) { P.ctx.clearRect(0, 0, P.canvas.width, P.canvas.height); }
function scanlines(P) { const c = P.ctx; c.fillStyle = '#ffffff'; c.globalAlpha = 0.025; for (let y = 0; y < P.canvas.height; y += 6) c.fillRect(0, y, P.canvas.width, 2); c.globalAlpha = 1; }

// ---------------------------------------------------------------- notice board
let typing = null;                            // { id, t0 }: the newest notice types itself in
function drawNotice() {
  const P = PANELS.notice; if (!P) return; clear(P); scanlines(P);
  const c = P.ctx, W = P.canvas.width, H = P.canvas.height, s = room && room.state;
  const list = s ? s.notices : [];
  header(P, `${list.length} ON THE BOARD`);
  if (!list.length) { c.fillStyle = '#9fb4c4'; c.font = `500 32px ${FONT}`; c.fillText('Nothing yet. Send one from the control room.', 34, H / 2); P.tex.needsUpdate = true; return; }
  const pinned = list.find((n) => n.pinned) || list[list.length - 1];
  const others = list.filter((n) => n !== pinned).slice(-3).reverse();
  const now = performance.now();
  const full = pinned.text;
  let shown = full;
  if (typing && typing.id === pinned.id) { const n = Math.floor(Math.max(0, now - typing.t0) / 28); shown = full.slice(0, n); if (n >= full.length) typing = null; }
  // the big one
  const top = 96, bigH = others.length ? H * 0.5 : H - 140;
  const { s: fs, lines } = fitText(c, full, W - 68, Math.max(2, Math.floor(bigH / 58)), 64, 34);
  c.font = `700 ${fs}px ${FONT}`; c.fillStyle = '#ffffff'; c.textBaseline = 'top';
  let left = shown.length;
  lines.forEach((ln, i) => { const part = ln.slice(0, Math.max(0, left)); left -= ln.length + 1; c.fillText(part, 34, top + i * fs * 1.12); });
  if (typing && Math.floor(now / 260) % 2) { const ln = Math.min(lines.length - 1, Math.max(0, lines.findIndex((l, i) => lines.slice(0, i + 1).join(' ').length >= shown.length))); c.fillStyle = theme.c; c.fillRect(34 + c.measureText(lines[ln].slice(0, Math.max(0, shown.length - lines.slice(0, ln).join(' ').length - (ln ? 1 : 0)))).width + 4, top + ln * fs * 1.12, 6, fs); }
  let y = top + lines.length * fs * 1.12 + 6;
  c.font = `500 24px ${MONO}`; c.fillStyle = theme.c; c.fillText(`${pinned.pinned ? 'PINNED · ' : ''}${pinned.from.toUpperCase()} · ${ago(pinned.at).toUpperCase()}`, 34, y);
  y += 46;
  // the feed
  for (const n of others) {
    if (y > H - 50) break;
    c.fillStyle = theme.c; c.globalAlpha = 0.3; c.fillRect(34, y - 10, W - 68, 2); c.globalAlpha = 1;
    c.font = `700 30px ${FONT}`; c.fillStyle = '#e6f3fb'; const l = wrap(c, n.text, W - 68 - 160, 1)[0];
    c.fillText(l, 34, y + 6);
    c.font = `500 20px ${MONO}`; c.fillStyle = '#8fb0c2'; const meta = ago(n.at); c.fillText(meta, W - 34 - c.measureText(meta).width, y + 12);
    y += 58;
  }
  c.textBaseline = 'middle';
  P.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- live sketch
const sk = { c: document.createElement('canvas'), g: null, drawn: new Map() };
sk.c.width = sk.c.height = 1000; sk.g = sk.c.getContext('2d');
let sketchDirty = 'full', penAt = null, penT = 0;
function strokeOn(g, s, from = 0) {
  const p = s.p; if (p.length < 2) return;
  g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w * 1.4; g.lineCap = 'round'; g.lineJoin = 'round';
  if (p.length === 2) { g.beginPath(); g.arc(p[0], p[1], s.w * 0.7, 0, Math.PI * 2); g.fill(); return; }
  g.beginPath(); const i0 = Math.max(0, from - 2); g.moveTo(p[i0], p[i0 + 1]);
  for (let i = i0 + 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.stroke();
}
function drawSketch() {
  const P = PANELS.sketch; if (!P || !room) return;
  if (sketchDirty === 'full') { sk.g.clearRect(0, 0, 1000, 1000); sk.drawn.clear(); }
  for (const [id, s] of room.strokes) {
    const have = sk.drawn.get(id) || 0; if (s.p.length <= have) continue;
    strokeOn(sk.g, s, have); sk.drawn.set(id, s.p.length);
    if (!s.done) { penAt = [s.p[s.p.length - 2], s.p[s.p.length - 1], s.c]; penT = performance.now(); }
  }
  sketchDirty = false;
  clear(P); scanlines(P);
  const c = P.ctx, W = P.canvas.width, H = P.canvas.height;
  header(P, room.strokes.size ? `${room.strokes.size} STROKES` : '');
  const top = 84, side = Math.min(W - 40, H - top - 20), x0 = (W - side) / 2;
  c.drawImage(sk.c, x0, top, side, side);
  if (!room.strokes.size) { c.fillStyle = '#9fb4c4'; c.font = `500 30px ${FONT}`; c.textAlign = 'center'; c.fillText('Draw in the control room.', W / 2, H / 2 + 10); c.fillText('It appears here as you draw.', W / 2, H / 2 + 52); c.textAlign = 'left'; }
  // someone's pen, while a stroke is still coming in
  if (penAt && performance.now() - penT < 1500) { c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.beginPath(); c.arc(x0 + penAt[0] / 1000 * side, top + penAt[1] / 1000 * side, 14, 0, Math.PI * 2); c.stroke(); }
  P.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- photo drop
const photoCache = new Map();                 // id -> Image
let photoIdx = 0;
function loadPhoto(p) {
  if (photoCache.has(p.id)) return Promise.resolve(photoCache.get(p.id));
  return new Promise((res) => { const i = new Image(); i.onload = () => { photoCache.set(p.id, i); res(i); }; i.onerror = () => res(null); i.src = room.photoUrl(p.id); });
}
async function drawPhoto() {
  const P = PANELS.photo; if (!P || !room || !room.state) return;
  const list = [...room.state.photos].reverse(); const p = list[photoIdx % Math.max(1, list.length)];
  const img = p ? await loadPhoto(p) : null;
  clear(P); scanlines(P);
  const c = P.ctx, W = P.canvas.width, H = P.canvas.height;
  header(P, list.length > 1 ? `${(photoIdx % list.length) + 1} / ${list.length}` : '');
  if (!img) { c.fillStyle = '#9fb4c4'; c.font = `500 30px ${FONT}`; c.textAlign = 'center'; c.fillText(list.length ? 'Loading…' : 'Drop a photo from the', W / 2, H / 2); if (!list.length) c.fillText('control room.', W / 2, H / 2 + 42); c.textAlign = 'left'; P.tex.needsUpdate = true; return; }
  const top = 84, bw = W - 52, bh = H - top - 70, k = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
  const w = img.naturalWidth * k, h = img.naturalHeight * k, x = (W - w) / 2, y = top + (bh - h) / 2;
  c.drawImage(img, x, y, w, h);
  c.strokeStyle = theme.c; c.lineWidth = 3; c.strokeRect(x, y, w, h);
  c.font = `500 22px ${MONO}`; c.fillStyle = theme.c; c.fillText(`${p.from.toUpperCase()} · ${ago(p.at).toUpperCase()}${list.length > 1 ? ' · TAP FOR NEXT' : ''}`, 26, H - 30);
  P.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- live poll: 3D bars
const poll = { g: new THREE.Group(), bars: [], id: null, labels: [] };
let myVote = -1;
const BAR_MAX = 0.2;
function buildPoll() {
  const P = PANELS.poll, s = room.state.poll; if (!P || !s) return;
  for (const b of poll.bars) { poll.g.remove(b.g); b.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  poll.bars = []; poll.id = s.id;
  if (!poll.g.parent) P.inner.add(poll.g);
  const n = s.options.length, span = P.L.w * 0.82, gap = span / n, bw = Math.min(0.08, gap * 0.6);
  s.options.forEach((o, i) => {
    const g = new THREE.Group(); g.position.set(-span / 2 + gap * (i + 0.5), -P.L.h / 2 + 0.085, 0.03);
    const box = new THREE.Mesh(new THREE.BoxGeometry(bw, 1, bw * 0.6), new THREE.MeshStandardMaterial({ color: col(), emissive: col(), emissiveIntensity: 0.55, transparent: true, opacity: 0.85 }));
    box.geometry.translate(0, 0.5, 0); box.scale.y = 0.004; g.add(box);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(bw * 1.3, 0.004), themeMat({ opacity: 1 })); cap.position.z = bw * 0.31; g.add(cap);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(gap * 0.95, BAR_MAX + 0.08, 0.08), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = (BAR_MAX + 0.08) / 2 - 0.04; hit.userData.vote = i; g.add(hit);
    poll.g.add(g); poll.bars.push({ g, box, cap, hit, h: 0, target: 0, bw });
  });
  showPanel('poll'); updatePoll();
}
function updatePoll() {
  const P = PANELS.poll, s = room && room.state && room.state.poll; if (!P || !s) return;
  if (s.id !== poll.id || s.options.length !== poll.bars.length) return buildPoll();
  const max = Math.max(1, ...s.counts);
  s.counts.forEach((n, i) => { poll.bars[i].target = s.total ? (n / max) * BAR_MAX : 0; });
  clear(P); scanlines(P);
  const c = P.ctx, W = P.canvas.width, H = P.canvas.height;
  header(P, !s.open ? 'CLOSED' : myVote < 0 ? 'TAP A BAR TO VOTE' : `${s.total} VOTE${s.total === 1 ? '' : 'S'}`);
  const { s: fs, lines } = fitText(c, s.q, W - 68, 2, 40, 26); c.font = `700 ${fs}px ${FONT}`; c.fillStyle = '#fff'; c.textBaseline = 'top';
  lines.forEach((l, i) => c.fillText(l, 34, 90 + i * fs * 1.1));
  // option labels under each bar, with counts
  const n = s.options.length, span = W * 0.82, gap = span / n;
  c.textAlign = 'center';
  s.options.forEach((o, i) => {
    const x = (W - span) / 2 + gap * (i + 0.5);
    c.font = `700 ${n > 3 ? 20 : 24}px ${FONT}`; c.fillStyle = i === myVote ? theme.c : '#dcebf5';
    c.fillText(wrap(c, o, gap - 10, 1)[0], x, H - 62);
    c.font = `500 20px ${MONO}`; c.fillStyle = '#8fb0c2'; c.fillText(`${s.counts[i]}${i === myVote ? ' · YOU' : ''}`, x, H - 34);
  });
  c.textAlign = 'left'; c.textBaseline = 'middle';
  P.tex.needsUpdate = true;
}
function hidePoll() { hidePanel('poll'); }
async function vote(i) {
  const s = room && room.state && room.state.poll; if (!s || !s.open) { toast('Voting has closed'); return; }
  if (myVote === i) return;
  myVote = i; sound.vote(); buzz(15); updatePoll();
  const b = poll.bars[i]; if (b) b.pop = 1;
  burstAt(b ? b.g.getWorldPosition(V()).add(V(0, b.h * rig.scale.y, 0)) : null, 10);
  await room.send({ op: 'vote', option: i }, { quiet: true });
}

// ---------------------------------------------------------------- captions (the control room's mic)
let capFade = 0;
function onCaption() { const c = room.state.caption; if (c) { showPanel('caption'); drawCaption(); capFade = 0; } else hidePanel('caption'); }
function drawCaption() {
  const P = PANELS.caption, cap = room && room.state && room.state.caption; if (!P) return;
  clear(P); const c = P.ctx, W = P.canvas.width, H = P.canvas.height;
  if (!cap) { P.tex.needsUpdate = true; return; }
  c.fillStyle = theme.c; c.fillRect(0, 0, 10, H);
  c.font = `500 20px ${MONO}`; c.fillStyle = theme.c; c.textBaseline = 'middle'; c.fillText(`● ${cap.from.toUpperCase()}`, 28, 26);
  c.font = `700 46px ${FONT}`; c.fillStyle = '#ffffff';
  let t = cap.text; while (c.measureText(t).width > W - 60 && t.length > 4) t = '…' + t.slice(4);   // keep the newest words in view
  c.fillText(t, 28, H * 0.62);
  if (!cap.final && Math.floor(performance.now() / 300) % 2) { c.fillStyle = theme.c; c.fillRect(30 + c.measureText(t).width, H * 0.62 - 22, 5, 44); }
  P.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- Where is Bobo? globe
const globe = { g: new THREE.Group(), spin: new THREE.Group(), pins: [], places: [], yawV: 0, feed: null, label: null, video: null, vPanel: null, open: null };
const GR = 0.17;
const D2R = Math.PI / 180;
const toVec = (lat, lng, r, out = V()) => out.set(Math.cos(lat * D2R) * Math.sin(lng * D2R) * r, Math.sin(lat * D2R) * r, Math.cos(lat * D2R) * Math.cos(lng * D2R) * r);
async function buildGlobe() {
  const P = PANELS.globe; P.inner.add(globe.g); globe.g.add(globe.spin); globe.g.position.set(0, -0.03, 0.02);
  globe.spin.rotation.x = 0.35;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(GR * 0.985, 40, 28), new THREE.MeshBasicMaterial({ color: 0x03141b, transparent: true, opacity: 0.55, depthWrite: true }));
  globe.spin.add(shell);
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(GR * 1.01, 2)), themeLine(0.12)); globe.spin.add(wire);
  try {
    const buf = await (await fetch('/evade/where-is-bobo/assets/data/globe.bin?v=4')).arrayBuffer(), dv = new DataView(buf);
    const nC = dv.getUint16(6, true), nDots = dv.getUint32(8, true);
    let o = 20 + ((nC * 2 + 3) & ~3);
    const lat = new Int16Array(buf, o, nDots); o += nDots * 2; const lng = new Int16Array(buf, o, nDots);
    const pos = []; const v = V();
    for (let i = 0; i < nDots; i += 2) { toVec(lat[i] / 180, lng[i] / 180, GR, v); pos.push(v.x, v.y, v.z); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: col(), size: 0.0042, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }); mats.theme.push(m);
    globe.spin.add(new THREE.Points(geo, m));
  } catch (e) { console.warn('globe dots', e); }
  // an orbit ring round it
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(GR * 1.28, 0.0016, 6, 96), themeMat({ opacity: 0.5 })); orbit.rotation.x = Math.PI / 2 - 0.25; globe.g.add(orbit); globe.orbit = orbit;
  loadFeed();
}
async function loadFeed() {
  try {
    const f = await fetch('/api/bobo/feed.json').then((r) => r.json()); globe.feed = f;
    for (const p of globe.pins) globe.spin.remove(p.g);
    globe.pins = [];
    for (const pl of f.places || []) {
      const g = new THREE.Group(); const n = toVec(pl.lat, pl.lng, 1);
      g.position.copy(n).multiplyScalar(GR); g.quaternion.setFromUnitVectors(V(0, 1, 0), n);
      const has = pl.media && pl.media.length;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, has ? 0.05 : 0.025, 6), new THREE.MeshBasicMaterial({ color: has ? 0xff2fae : 0xffc53d }));
      stem.position.y = (has ? 0.05 : 0.025) / 2; g.add(stem);
      const head = new THREE.Mesh(new THREE.SphereGeometry(has ? 0.009 : 0.006, 12, 8), new THREE.MeshBasicMaterial({ color: has ? 0xff2fae : 0xffc53d })); head.position.y = has ? 0.05 : 0.025; g.add(head);
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = has ? 0.05 : 0.025; hit.userData.place = pl.key; g.add(hit);
      globe.spin.add(g); globe.pins.push({ g, head, place: pl, hit });
    }
    // start with the newest sighting facing the viewer
    const newest = (f.places || []).find((p) => p.media && p.media.length);
    if (newest) globe.spinTarget = -newest.lng * D2R;
    drawGlobeLabel(); buildTicker();
  } catch (e) { console.warn('feed', e); drawGlobeLabel(); }
}
function drawGlobeLabel() {
  const P = PANELS.globe; if (!P) return; clear(P);
  const c = P.ctx, W = P.canvas.width, H = P.canvas.height, f = globe.feed;
  header(P, 'LIVE');
  c.font = `500 22px ${MONO}`; c.fillStyle = '#8fb0c2'; c.textAlign = 'center';
  const st = f && f.stats;
  c.fillText(st ? `${st.media} SIGHTINGS · ${st.countries} COUNTRIES · ${st.events} SCANS` : 'CONNECTING TO THE GLOBE…', W / 2, H - 52);
  c.fillStyle = theme.c; c.fillText(globe.open ? globe.open.city.toUpperCase() + ' · TAP AGAIN TO CLOSE' : 'DRAG TO SPIN · TAP A PIN', W / 2, H - 22);
  c.textAlign = 'left'; P.tex.needsUpdate = true;
}
function openPlace(key) {
  const pl = globe.pins.find((p) => p.place.key === key); if (!pl) return;
  if (globe.open && globe.open.key === key) return closePlace();
  globe.open = pl.place; globe.spinTarget = -pl.place.lng * D2R; sound.pop(); buzz(12);
  const m = pl.place.media && pl.place.media[0];
  closeVideo();
  if (m && m.kind === 'video') {
    // iOS: crossOrigin / playsinline / muted must be set BEFORE src (else the load is non-CORS and the texture stays
    // black, or it jumps to fullscreen), and the element has to be in the document for WebGL to get frames
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', '');
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
    v.src = m.url;
    v.play().then(() => { if (sound.on) v.muted = false; }).catch(() => { v.muted = true; v.play().catch(() => {}); });
    const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace;
    const ar = (m.width && m.height) ? m.width / m.height : 9 / 16, h = 0.4, w = h * ar;
    const g = new THREE.Group(); const q = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })); q.renderOrder = 6; g.add(q);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), themeLine(1)); g.add(e);
    const P = PANELS.globe; g.position.set(P.L.w / 2 + w / 2 + 0.04, 0, 0.04); g.scale.set(1, 0.001, 1); P.inner.add(g);
    globe.video = v; globe.vPanel = { g, t: 0 };
  }
  drawGlobeLabel();
}
function closeVideo() { if (globe.video) { globe.video.pause(); globe.video.removeAttribute('src'); globe.video.load(); globe.video.remove(); globe.video = null; } if (globe.vPanel) { globe.vPanel.g.parent.remove(globe.vPanel.g); globe.vPanel = null; } }
function closePlace() { globe.open = null; closeVideo(); drawGlobeLabel(); }

// ---------------------------------------------------------------- the ticker ring (real MEDIALIFE activity)
let ticker = null;
function buildTicker() {
  const f = globe.feed; if (!f || !proj) return;
  const items = (f.recent || []).slice(0, 14).map((e) => `${{ scan: 'SCAN', play: 'PLAY', share: 'SHARE', capture: 'CLIP', sighting: 'SIGHTING', reward: 'REWARD', custom: 'PLAY' }[e.type] || String(e.type).toUpperCase()} · ${String(e.city || 'Somewhere').toUpperCase()} · ${ago(Date.parse(e.at)).toUpperCase()}`);
  if (!items.length) items.push('MEDIALIFE · LIVE ACTIVITY');
  const c = document.createElement('canvas'); c.width = 4096; c.height = 64; const g = c.getContext('2d');
  g.font = `700 34px ${MONO}`; g.textBaseline = 'middle';
  let x = 20, i = 0; const txt = '   ◆   ';
  while (x < c.width) { const s = items[i % items.length] + txt; g.fillStyle = i % 2 ? '#ffffff' : theme.c; g.fillText(s, x, 34); x += g.measureText(s).width; i++; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 4;
  if (ticker) { ticker.material.map.dispose(); ticker.material.map = tex; ticker.material.needsUpdate = true; return; }
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.045, 96, 1, true);
  ticker = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.05 }));
  ticker.position.y = 0.06; ticker.renderOrder = 4; rig.add(ticker);
  setInterval(loadFeed, 60000);
}

// ---------------------------------------------------------------- live: the control room's camera on one big holo screen
const live = { on: false, k: 0, viewer: null, id: null, aspect: 16 / 9, video: null, tex: null, frameTex: null, state: 'idle', g: null, mat: null, hit: null, sound: false, glitch: 0 };
const LIVE_Y = 1.22;
const HOLO_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HOLO_FS = `
uniform sampler2D map; uniform float uHas, uT, uOn, uGlitch; uniform vec3 uTint; varying vec2 vUv;
float h1(float n){ return fract(sin(n) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float row = floor(uv.y * 90.0);
  float gl = uGlitch * step(0.72, h1(row + floor(uT * 24.0)));
  uv.x += (h1(row * 1.7 + floor(uT * 30.0)) - 0.5) * 0.07 * gl;
  float roll = step(0.975, fract(uv.y * 1.3 - uT * 0.32));      // a bright band rolling up the screen
  uv.x += roll * 0.005;
  vec3 c;
  if (uHas > 0.5) {
    float ab = 0.0022 + gl * 0.012;                              // a touch of colour split, more when glitching
    c = vec3(texture2D(map, uv + vec2(ab, 0.0)).r, texture2D(map, uv).g, texture2D(map, uv - vec2(ab, 0.0)).b);
  } else {
    c = vec3(h2(floor(uv * vec2(160.0, 90.0)) + floor(uT * 20.0)) * 0.45);   // static while it tunes in
  }
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 holo = mix(c, uTint * (l * 1.3 + 0.06), 0.4);
  float scan = 0.8 + 0.2 * step(0.5, fract(vUv.y * 150.0 + uT * 1.5));
  float flick = 0.94 + 0.06 * step(0.55, h1(floor(uT * 15.0)));
  vec3 col = holo * scan * flick + uTint * roll * 0.22;
  float edge = clamp(step(vUv.x, 0.005) + step(0.995, vUv.x) + step(vUv.y, 0.009) + step(0.991, vUv.y), 0.0, 1.0);
  col = mix(col, uTint, edge * 0.85);
  gl_FragColor = vec4(col, (0.84 * scan + edge * 0.16) * uOn);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}`;
function liveSize() { const a = live.aspect || 16 / 9; return a >= 1 ? { w: Math.min(1.3, 0.85 * a), h: Math.min(1.3, 0.85 * a) / a } : { w: 0.95 * a, h: 0.95 }; }
function buildLive() {
  const g = live.g = new THREE.Group(); g.position.set(0, LIVE_Y, -0.05); g.visible = false; rig.add(g);
  const inner = live.inner = new THREE.Group(); g.add(inner);
  live.mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uHas: { value: 0 }, uT: { value: 0 }, uOn: { value: 0 }, uGlitch: { value: 1 }, uTint: { value: col() } },
    vertexShader: HOLO_VS, fragmentShader: HOLO_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  live.screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), live.mat); live.screen.renderOrder = 6; inner.add(live.screen);
  live.back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x03080d, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
  live.back.position.z = -0.004; live.back.renderOrder = 5; inner.add(live.back);
  const br = []; for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * 0.5, y = sy * 0.5, k = 0.08; br.push(x, y - sy * k, 0, x, y, 0, x, y, 0, x - sx * k, y, 0); }
  const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(br, 3));
  live.brackets = new THREE.LineSegments(bgeo, themeLine(1)); live.brackets.position.z = 0.004; inner.add(live.brackets);
  live.hit = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 1.1), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })); live.hit.userData.live = true; inner.add(live.hit);
  // the label above it
  live.lc = document.createElement('canvas'); live.lc.width = 1200; live.lc.height = 100;
  live.ltex = new THREE.CanvasTexture(live.lc); live.ltex.colorSpace = THREE.SRGBColorSpace;
  live.label = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.085), new THREE.MeshBasicMaterial({ map: live.ltex, transparent: true, depthWrite: false })); live.label.renderOrder = 7; inner.add(live.label);
  // the projection: light from the lens to the screen's corners (flat colour, additive)
  live.cone = new THREE.Mesh(new THREE.BufferGeometry(), themeMat({ opacity: 0.05, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); live.cone.renderOrder = 2; rig.add(live.cone);
  live.coneLines = new THREE.LineSegments(new THREE.BufferGeometry(), themeLine(0.35)); rig.add(live.coneLines);
  live.cone.visible = live.coneLines.visible = false;
  sizeLive();
}
function sizeLive() {
  if (!live.g) return;
  const { w, h } = liveSize(); live.w = w; live.h = h;
  for (const m of [live.screen, live.back]) m.scale.set(w, h, 1);
  live.brackets.scale.set(w, h, 1); live.hit.scale.set(w, h, 1);
  live.label.scale.set(w, 1, 1); live.label.position.y = h / 2 + 0.06;
  // the cone, in rig space (the group faces the viewer, so take its corners through its transform)
  live.g.updateMatrix();
  const lensP = V(0, EMIT_Y, 0), cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => V(x * w / 2, y * h / 2, 0).applyMatrix4(live.g.matrix));
  const tri = []; for (let i = 0; i < 4; i++) { const a = cs[i], b = cs[(i + 1) % 4]; tri.push(lensP.x, lensP.y, lensP.z, a.x, a.y, a.z, b.x, b.y, b.z); }
  live.cone.geometry.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
  const ln = []; for (const c of cs) ln.push(lensP.x, lensP.y, lensP.z, c.x, c.y, c.z);
  live.coneLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(ln, 3));
  drawLiveLabel();
}
function drawLiveLabel() {
  if (!live.lc) return;
  const c = live.lc.getContext('2d'), W = live.lc.width, H = live.lc.height; c.clearRect(0, 0, W, H);
  const l = room && room.liveNow();
  c.font = `700 40px ${MONO}`; c.textBaseline = 'middle';
  c.fillStyle = '#ff2fae'; c.beginPath(); c.arc(26, H / 2, 13, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff'; c.fillText('LIVE', 52, H / 2);
  const st = live.state === 'live' ? (l && l.audio ? (live.sound ? 'SOUND ON · TAP TO MUTE' : 'TAP FOR SOUND') : '') : live.state === 'relay' ? 'LIGHT FEED · NO SOUND' : 'TUNING IN…';
  c.fillStyle = theme.c; c.fillText(((l ? ' · ' + l.from.toUpperCase() : '')).slice(0, 30), 52 + c.measureText('LIVE').width, H / 2);
  c.font = `500 34px ${MONO}`; c.textAlign = 'right'; c.globalAlpha = 0.85; c.fillText(st, W - 6, H / 2); c.globalAlpha = 1; c.textAlign = 'left';
  live.ltex.needsUpdate = true;
}
// start / stop following the room's live feed
function syncLive() {
  if (!room) return;
  const l = room.liveNow();
  const want = l && placedOnce;
  if (l && Math.abs(l.aspect - live.aspect) > 0.01) { live.aspect = l.aspect; sizeLive(); }
  if (want && live.id !== l.id) {
    stopLive(true);
    live.id = l.id; live.on = true; live.glitch = 1;
    unfocus(true); closePlace();
    if (!live.viewer) live.viewer = new LiveViewer(room, { onStream: liveStream, onFrame: liveFrame, onState: (st) => { live.state = st; drawLiveLabel(); if (st === 'live' || st === 'relay') { live.glitch = 1; sound.arrive(); } } });
    live.viewer.start(l.id);
    if (placed) { sound.whoosh(); pulseBeam(0.7); toast(`${l.from} is live`); }
    postEvent('custom', { what: 'holocast-live' });
    drawLiveLabel();
  } else if (!l && live.id) {
    stopLive(true); if (placed) toast('The live feed ended');
  }
}
function stopLive(quiet) {
  if (live.viewer) live.viewer.stop(quiet);
  if (live.video) { live.video.pause(); live.video.srcObject = null; live.video.remove(); live.video = null; }
  if (live.tex) { live.tex.dispose(); live.tex = null; }
  if (live.mat) { live.mat.uniforms.map.value = live.frameTex; live.mat.uniforms.uHas.value = 0; }
  live.id = null; live.on = false; live.sound = false; live.state = 'idle';
}
function liveStream(stream) {
  let v = live.video;
  if (!v) {
    v = live.video = document.createElement('video');
    v.muted = true; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
    document.body.appendChild(v);
  }
  v.srcObject = stream; v.muted = !live.sound; v.play().catch(() => { v.muted = true; live.sound = false; v.play().catch(() => {}); });
  if (!live.tex) { live.tex = new THREE.VideoTexture(v); live.tex.colorSpace = THREE.SRGBColorSpace; live.tex.minFilter = THREE.LinearFilter; live.tex.generateMipmaps = false; }
  live.mat.uniforms.map.value = live.tex; live.mat.uniforms.uHas.value = 1;
  v.onresize = () => { if (v.videoWidth && v.videoHeight) { const a = v.videoWidth / v.videoHeight; if (Math.abs(a - live.aspect) > 0.02) { live.aspect = a; sizeLive(); } } };
}
function liveFrame(img) {
  if (live.video) return;
  if (!live.frameTex) { live.frameTex = new THREE.Texture(img); live.frameTex.colorSpace = THREE.SRGBColorSpace; live.frameTex.minFilter = THREE.LinearFilter; live.frameTex.generateMipmaps = false; }
  live.frameTex.image = img; live.frameTex.needsUpdate = true;
  live.mat.uniforms.map.value = live.frameTex; live.mat.uniforms.uHas.value = 1;
  const a = img.naturalWidth / img.naturalHeight; if (a && Math.abs(a - live.aspect) > 0.02) { live.aspect = a; sizeLive(); }
}
function liveTap() {
  const l = room && room.liveNow();
  if (!live.video || !l || !l.audio) { live.glitch = 0.6; sound.pop(); return; }
  live.sound = !live.sound; live.video.muted = !live.sound; if (live.sound) live.video.play().catch(() => {});
  buzz(10); drawLiveLabel();
}
let liveCheckT = 0;
function tickLive(dt) {
  if (!live.g) return;
  liveCheckT += dt; if (liveCheckT > 1) { liveCheckT = 0; if (live.id || (room && room.state && room.state.live)) syncLive(); }
  const want = live.on && booted ? 1 : 0;
  live.k += (want - live.k) * Math.min(1, dt * (want ? 3 : 7));
  if (live.k < 0.01 && !want) { live.k = 0; live.g.visible = live.cone.visible = live.coneLines.visible = false; return; }
  live.g.visible = true; live.cone.visible = live.coneLines.visible = live.k > 0.2;
  live.inner.scale.set(Math.max(0.001, easeOut(live.k * 1.2)), Math.max(0.001, backOut(live.k)), 1);
  live.glitch = Math.max(0, live.glitch - dt * 0.9);
  const u = live.mat.uniforms; u.uT.value = tAll; u.uOn.value = live.k; u.uGlitch.value = Math.min(1, live.glitch + (live.state === 'connecting' ? 0.4 : 0) + (Math.random() < 0.004 ? 0.8 : 0));
  live.cone.material.opacity = 0.04 + Math.sin(tAll * 3) * 0.01 + pulseK * 0.08;
  live.g.position.y = LIVE_Y + Math.sin(tAll * 0.9) * 0.006;
}

// ---------------------------------------------------------------- the rig
function buildRig() {
  proj = buildProjector(false); rig.add(proj);
  buildBeam();
  for (const n of Object.keys(LAYOUT)) makePanel(n);
  buildGlobe();
  buildLive();
  // the screens face a point in front of the projector (where the viewer stood)
  for (const P of Object.values(PANELS)) { P.g.lookAt(V(P.L.p.x * 0.25, P.L.p.y - 0.15, 2.2)); P.home.q.copy(P.g.quaternion); }
  live.g.lookAt(V(0, LIVE_Y - 0.2, 2.2)); sizeLive();
  makeFx();
}
function drawTitle() { /* the title shows in the control room and the room sheet */ }
function drawAll() { drawNotice(); sketchDirty = 'full'; drawSketch(); drawPhoto(); drawGlobeLabel(); if (room && room.state && room.state.poll) buildPoll(); else hidePanel('poll'); onCaptionSafe(); buildTicker(); }
function onCaptionSafe() { if (room && room.state && room.state.caption) { showPanel('caption'); drawCaption(); } else hidePanel('caption'); }

// show / hide a screen (it scales up out of its ray with a flicker)
function showPanel(n) { const P = PANELS[n]; if (!P) return; P.show = true; if (placed && booted) { P.g.visible = true; } }
function hidePanel(n) { const P = PANELS[n]; if (!P) return; P.show = false; }
const ALWAYS = ['notice', 'globe', 'sketch', 'photo'];

// ---------------------------------------------------------------- effects: packets, flung cards, bursts, reactions
let fx;
function makeFx() {
  fx = { packets: [], cards: [], sparks: null, sparkData: [], floats: [] };
  const N = 160, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.012, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  fx.sparks = new THREE.Points(g, m); fx.sparks.frustumCulled = false; scene.add(fx.sparks);
  for (let i = 0; i < N; i++) fx.sparkData.push({ p: V(0, -99, 0), v: V(), life: 0 });
}
const pktGeo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
// a packet of light from the lens up the screen's ray; then the screen flickers and fn() runs
function packetTo(name, delay = 0, fn) {
  const P = PANELS[name]; if (!P || !placed) { fn && fn(); return; }
  const m = new THREE.Mesh(pktGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
  m.visible = false; rig.add(m);
  fx.packets.push({ m, P, t: -delay, dur: 0.55, fn });
}
// deliver new content: a packet (or a flung card) first, then redraw the screen
function deliver(name, fling, draw) {
  const P = PANELS[name];
  if (!placed || !booted || !P) { draw(); return; }
  if (name !== 'poll' && name !== 'caption') showPanel(name);
  if (fling) return flingTo(name, draw);
  packetTo(name, 0, () => { draw(); P.flick = 1; sound.arrive(); });
}
// a card shoots out of the lens, arcs and slams into the screen
function flingTo(name, draw) {
  const P = PANELS[name];
  draw();                                     // draw first so the card carries the new content
  const tex = new THREE.CanvasTexture(P.canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const card = new THREE.Mesh(new THREE.PlaneGeometry(P.L.w, P.L.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  const bgc = new THREE.Mesh(new THREE.PlaneGeometry(P.L.w, P.L.h), new THREE.MeshBasicMaterial({ color: 0x03080d, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  bgc.position.z = -0.002; card.add(bgc); card.renderOrder = 8;
  rig.add(card); card.scale.setScalar(0.05); card.position.set(0, EMIT_Y, 0);
  P.face.visible = false;                    // the screen shows the old frame until the card lands
  sound.whoosh(); buzz(10);
  fx.cards.push({ card, P, t: 0, dur: 0.75, spin: (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2 });
}
function burstAt(worldP, n = 24, colr) {
  if (!fx || !worldP) return;
  let k = 0; const c = colr ? new THREE.Color(colr) : null;
  for (const s of fx.sparkData) {
    if (s.life > 0) continue;
    s.p.copy(worldP); s.v.set((Math.random() - 0.5) * 1.2, Math.random() * 1.1 + 0.2, (Math.random() - 0.5) * 1.2).multiplyScalar(rig.scale.x || 1); s.life = 0.5 + Math.random() * 0.5;
    if (++k >= n) break;
  }
  if (c) fx.sparks.material.color.copy(c);
}
let pulseK = 0;
function pulseBeam(k = 1) { pulseK = Math.max(pulseK, k); sound.pulse(); buzz([15, 40, 25]); burstAt(lens ? lens.getWorldPosition(V()) : null, 40); }
// reactions: emoji sprites floating up out of the projector
const emojiTex = new Map();
function emojiMat(g) {
  if (!emojiTex.has(g)) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(g, 64, 72); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; emojiTex.set(g, t); }
  return new THREE.SpriteMaterial({ map: emojiTex.get(g), transparent: true, depthWrite: false });
}
function floatEmoji(e) {
  if (!placed || !fx) return;
  const g = (REACTIONS.find((r) => r.e === e) || {}).g || '✨';
  const s = new THREE.Sprite(emojiMat(g)); s.scale.setScalar(0.0001); s.position.set((Math.random() - 0.5) * 0.1, EMIT_Y + 0.02, (Math.random() - 0.5) * 0.1); s.renderOrder = 9;
  rig.add(s); fx.floats.push({ s, t: 0, dur: 2.6 + Math.random() * 0.6, dx: (Math.random() - 0.5) * 0.7, dz: Math.random() * 0.25 });
}
const mine = new Set();
function incomingReactions(prev) {
  const old = prev ? (prev.reactions.length ? prev.reactions[prev.reactions.length - 1].at : 0) : Date.now();
  const fresh = room.state.reactions.filter((r) => r.at > old && !mine.has(r.at));
  fresh.slice(-10).forEach((r, i) => setTimeout(() => floatEmoji(r.e), i * 140));
}
async function react(e) {
  floatEmoji(e); sound.pop(); buzz(8);
  const v = await room.send({ op: 'react', e, panel: focused ? focused.name : '' }, { quiet: true });
  if (v && v.reactions && v.reactions.length) mine.add(v.reactions[v.reactions.length - 1].at);
}
function buildReactBar() {
  const R = $('reacts'); R.innerHTML = '';
  for (const r of REACTIONS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = r.g; b.setAttribute('aria-label', 'React ' + r.e); b.onclick = () => react(r.e); R.appendChild(b); }
}

// ---------------------------------------------------------------- placing on the floor
let mode = 'placing', placed = false, placedOnce = false, booted = false, bootT = 0;
let scaleK = clamp(+store.get('scale', SCALE.def) || SCALE.def, SCALE.min, SCALE.max);
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(V(0, 1, 0), 0), floorHit = V(), _ndc = new THREE.Vector2();
let floorOk = false, testFloor = null;
function updateFloor() {
  if (testFloor) { floorHit.copy(testFloor); floorOk = true; return; }
  _ndc.set(0, -0.15); ray.setFromCamera(_ndc, camera);
  floorOk = false;
  if (ray.ray.intersectPlane(floorPlane, floorHit)) { const d = floorHit.distanceTo(camera.position); floorOk = d > 0.5 && d < 7; }
}
function faceCamYaw(at) { const d = V().subVectors(camera.position, at); return Math.atan2(d.x, d.z); }
function place() {
  if (!floorOk) return;
  rig.position.copy(floorHit); rig.rotation.set(0, faceCamYaw(floorHit), 0); rig.scale.setScalar(scaleK);
  placed = true; placedOnce = true; mode = 'live'; ghost.visible = false; rig.visible = true;
  store.set('scale', scaleK.toFixed(3));
  boot();
  syncUi();
  postEvent('custom', { what: 'holocast-place', scale: +scaleK.toFixed(2) });
}
function moveRig() {   // Move: back to placing. The content (and focus) stays as it is.
  unfocus(true); mode = 'placing'; placed = false; rig.visible = false; booted = false;
  syncUi(); hint('Point at the floor or a table');
}
// the power-up: ring chases, beam grows, screens unfold one by one
function boot() {
  bootT = performance.now(); booted = false; sound.powerUp(); sound.startHum(); buzz([20, 60, 20]);
  for (const P of Object.values(PANELS)) { P.on = 0; P.inner.scale.set(1, 0.001, 1); P.g.visible = false; }
  if (beam) beam.scale.y = 0.001;
  const order = ['globe', 'notice', 'sketch', 'photo', 'poll', 'caption'];
  order.forEach((n, i) => setTimeout(() => {
    if (!placed) return;
    const P = PANELS[n]; if (n === 'poll' || n === 'caption') { if (!P.show) return; }
    P.show = true; P.g.visible = true; P.bootIn = true; sound.screen(i);
  }, 900 + i * 260));
  setTimeout(() => { if (placed) { booted = true; if (store.get('how', '0') !== '1') { $('how').hidden = false; } } }, 900 + order.length * 260 + 300);
}

// ---------------------------------------------------------------- focus a screen (pull it closer to read)
let focused = null;
function focusPanel(P) {
  if (focused === P) return unfocus();
  unfocus(true);
  focused = P;
  // world pose: 0.7 m in front of the camera, at eye level, facing it (it stays there: not screen-locked)
  const f = V(); camera.getWorldDirection(f); f.y *= 0.3; f.normalize();
  // near enough that the screen fills ~80% of the narrower side of the view
  const pm = camera.projectionMatrix.elements, vf = 2 * Math.atan(1 / (pm[5] || 1.7)), hf = 2 * Math.atan(1 / (pm[0] || 1));   // the engine sets the projection, not .fov
  const dW = (P.L.w / 0.8) / (2 * Math.tan(hf / 2)), dH = (P.L.h / 0.6) / (2 * Math.tan(vf / 2));
  const target = camera.position.clone().addScaledVector(f, clamp(Math.max(dW, dH), 0.3, 2));
  P.focus = { t: 0, from: P.g.getWorldPosition(V()), fromQ: P.g.getWorldQuaternion(new THREE.Quaternion()), fromS: rig.scale.x, to: target, toQ: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(target, camera.position, V(0, 1, 0))).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI)), toS: 1 };
  worldFx.attach(P.g); sound.pop(); buzz(10);
  postEvent('custom', { what: 'holocast-focus', panel: P.name });
}
function unfocus(now) {
  const P = focused; if (!P) return; focused = null;
  rig.attach(P.g);
  P.focus = null;
  if (now) { P.g.position.copy(P.home.p); P.g.quaternion.copy(P.home.q); P.g.scale.setScalar(1); }
  else P.returning = { t: 0, p: P.g.position.clone(), q: P.g.quaternion.clone(), s: P.g.scale.x };
}

// ---------------------------------------------------------------- per frame
let lastTrack = '', limitedSince = 0, tAll = 0, capDrawT = 0, noticeDrawT = 0, sketchDrawT = 0;
const _wp = V(), _q = new THREE.Quaternion();
function frame(dt) {
  const now = performance.now(); tAll += dt;
  if (mode === 'placing') {
    updateFloor();
    ghost.visible = floorOk;
    if (floorOk) {
      ghost.position.copy(floorHit); ghost.rotation.y = faceCamYaw(floorHit);
      ghost.scale.setScalar(scaleK); ghost.userData.proj.position.y = 0.05 + Math.sin(tAll * 3) * 0.015;
      reticle.rotation.y += dt * 0.6;
    }
    $('b-place').disabled = !floorOk;
    if (!floorOk && now - camStartAt > 2000) hint('Point at the floor or a table'); else if (floorOk) hint('Pinch to size it, then tap Place');
  }
  if (placed) {
    const since = (now - bootT) / 1000;
    // beam grows over the first second
    if (beam) {
      const g = easeOut(since / 1.0); beam.scale.set(1, Math.max(0.001, g * 1.25), 1);
      pulseK = Math.max(0, pulseK - dt * 1.4);
      beam.material.opacity = (0.055 + Math.sin(tAll * 2.2) * 0.012) * g + pulseK * 0.18;
      beamRings.forEach((r) => { r.userData.k = (r.userData.k + dt * (0.35 + pulseK)) % 1; const k = r.userData.k; r.position.y = EMIT_Y + k * 1.2; const rad = 0.05 + k * 0.72; r.scale.set(rad, rad, 1 + pulseK * 2); r.material.opacity = (1 - k) * 0.5 * g + pulseK * 0.4; });
    }
    segs.forEach((m, i) => { const ph = (tAll * 6 - i) % 16; m.material.opacity = 0.25 + (ph > 0 && ph < 3 ? 0.75 : 0) + pulseK * 0.5; });
    if (lens) lens.material.opacity = 0.75 + Math.sin(tAll * 8) * 0.1 + pulseK * 0.25;
    if (ticker) ticker.material.map.offset.x = (ticker.material.map.offset.x + dt * 0.02) % 1;
    // screens: unfold, flicker on arrival, gentle bob
    for (const P of Object.values(PANELS)) {
      const want = P.show && !live.on && (booted || P.bootIn) ? 1 : 0;
      P.on += (want - P.on) * Math.min(1, dt * (want ? 5 : 8));
      if (P.on < 0.01 && !want) { P.g.visible = false; P.on = 0; } else if (want) P.g.visible = true;
      const sy = backOut(P.on); P.flick = Math.max(0, P.flick - dt * 2.2);
      const fl = P.flick > 0 ? (Math.random() < 0.35 ? 0.35 : 1) : 1;
      P.inner.scale.set(1, Math.max(0.001, sy), 1);
      P.face.material.opacity = fl; P.bg.material.opacity = 0.62 * fl;
      if (!P.focus && !P.returning && P.g.parent === rig) P.g.position.y = P.home.p.y + Math.sin(tAll * 1.1 + P.home.p.x * 3) * 0.008;
      if (P.focus) {
        P.focus.t = Math.min(1, P.focus.t + dt / 0.45); const k = easeOut(P.focus.t);
        P.g.position.lerpVectors(P.focus.from, P.focus.to, k); P.g.quaternion.slerpQuaternions(P.focus.fromQ, P.focus.toQ, k); P.g.scale.setScalar(lerp(P.focus.fromS, P.focus.toS, k));
      }
      if (P.returning) {
        P.returning.t = Math.min(1, P.returning.t + dt / 0.4); const k = easeOut(P.returning.t);
        P.g.position.lerpVectors(P.returning.p, P.home.p, k); P.g.quaternion.slerpQuaternions(P.returning.q, P.home.q, k); P.g.scale.setScalar(lerp(P.returning.s, 1, k));
        if (P.returning.t >= 1) P.returning = null;
      }
      updateRay(P);
    }
    tickLive(dt);
    // the globe spins; drag adds spin, a tap brings a place round
    if (globe.spin) {
      if (globe.spinTarget != null && !drag) { const d = Math.atan2(Math.sin(globe.spinTarget - globe.spin.rotation.y), Math.cos(globe.spinTarget - globe.spin.rotation.y)); globe.spin.rotation.y += d * Math.min(1, dt * 3); if (Math.abs(d) < 0.01) globe.spinTarget = null; }
      else if (!drag) { globe.spin.rotation.y += (REDUCED ? 0.03 : 0.12) * dt + globe.yawV * dt; globe.yawV *= Math.pow(0.15, dt); }
      if (globe.orbit) globe.orbit.rotation.z += dt * 0.4;
      for (const p of globe.pins) { const k = 1 + Math.sin(tAll * 4 + p.place.lng) * 0.18; p.head.scale.setScalar(globe.open && globe.open.key === p.place.key ? 1.8 : k); }
      if (globe.vPanel) { globe.vPanel.t = Math.min(1, globe.vPanel.t + dt * 3); globe.vPanel.g.scale.set(1, Math.max(0.001, backOut(globe.vPanel.t)), 1); }
    }
    // poll bars grow to their share
    for (const b of poll.bars) {
      b.h += (b.target - b.h) * Math.min(1, dt * 4); b.pop = Math.max(0, (b.pop || 0) - dt * 3);
      b.box.scale.set(1 + b.pop * 0.4, Math.max(0.004, b.h), 1 + b.pop * 0.4); b.cap.position.y = b.h + 0.002;
    }
    // animated redraws: the notice typing in, the caption cursor, a pen still drawing
    if (typing && now - noticeDrawT > 40) { noticeDrawT = now; drawNotice(); if (Math.random() < 0.5) sound.type(); }
    if (room && room.state && room.state.caption && now - capDrawT > 150) { capDrawT = now; drawCaption(); if (room.state.caption.final && Date.now() - room.state.caption.at > 9000) hidePanel('caption'); }
    if ((sketchDirty || (penAt && now - penT < 1600)) && now - sketchDrawT > 50) { sketchDrawT = now; drawSketch(); }
  }
  tickFx(dt);
  // tracking: lost for a while -> say how to get it back
  if (lastTrack === 'LIMITED') { if (!limitedSince) limitedSince = now; } else limitedSince = 0;
  if (limitedSince && now - limitedSince > 1500) hint('Move your phone slowly so it can see the room again');
  else if (placed && $('hint').textContent && !hintHold) hint('');
  recTick();
  if (params.has('diag') || (!LIVE_SITE && params.has('test'))) drawDiag(now);
  diag.fpsN++;
}
function tickFx(dt) {
  if (!fx) return;
  for (let i = fx.packets.length - 1; i >= 0; i--) {
    const k = fx.packets[i]; k.t += dt; if (k.t < 0) continue;
    const u = clamp(k.t / k.dur, 0, 1), [a, b] = rayEnds(k.P); k.m.visible = true;
    k.m.position.lerpVectors(a, b, easeOut(u)); k.m.rotation.set(u * 6, u * 8, 0); k.m.scale.setScalar(1 + Math.sin(u * Math.PI) * 0.8);
    if (u >= 1) { rig.remove(k.m); k.m.material.dispose(); fx.packets.splice(i, 1); k.fn && k.fn(); burstAt(k.P.g.getWorldPosition(V()).add(V(0, -k.P.L.h / 2 * rig.scale.y, 0)), 12, theme.c); }
  }
  for (let i = fx.cards.length - 1; i >= 0; i--) {
    const k = fx.cards[i]; k.t += dt; const u = clamp(k.t / k.dur, 0, 1), e = easeOut(u);
    const to = k.P.g.position, a = V(0, EMIT_Y, 0), mid = V(to.x * 0.4, to.y + 0.35, to.z + 0.5);
    // a quadratic arc: lens -> up and out towards the viewer -> the screen
    const p = V().copy(a).multiplyScalar((1 - e) * (1 - e)).addScaledVector(mid, 2 * (1 - e) * e).addScaledVector(to, e * e);
    k.card.position.copy(p); k.card.scale.setScalar(lerp(0.05, 1, e)); k.card.quaternion.copy(k.P.g.quaternion).multiply(_q.setFromAxisAngle(V(0, 1, 0), (1 - e) * k.spin));
    if (u >= 1) {
      rig.remove(k.card); k.card.material.map.dispose(); fx.cards.splice(i, 1);
      k.P.face.visible = true; k.P.tex.needsUpdate = true; k.P.flick = 0.6; k.P.shake = 1;
      sound.slam(); buzz([30, 20, 40]); burstAt(k.P.g.getWorldPosition(V()), 40, '#ffffff');
    }
  }
  for (const P of Object.values(PANELS)) if (P.shake > 0) { P.shake = Math.max(0, P.shake - dt * 3); P.inner.position.set((Math.random() - 0.5) * 0.02 * P.shake, (Math.random() - 0.5) * 0.02 * P.shake, -0.05 * P.shake); }
  // sparks
  const pos = fx.sparks.geometry.attributes.position;
  fx.sparkData.forEach((s, i) => {
    if (s.life > 0) { s.life -= dt; s.v.y -= 1.6 * dt * (rig.scale.x || 1); s.p.addScaledVector(s.v, dt); if (s.life <= 0) s.p.set(0, -99, 0); }
    pos.setXYZ(i, s.p.x, s.p.y, s.p.z);
  });
  pos.needsUpdate = true;
  // reactions floating up
  for (let i = fx.floats.length - 1; i >= 0; i--) {
    const f = fx.floats[i]; f.t += dt; const u = f.t / f.dur;
    f.s.position.y = EMIT_Y + 0.02 + easeOut(u) * 1.6; f.s.position.x += f.dx * dt * 0.4; f.s.position.z += f.dz * dt * 0.4;
    f.s.scale.setScalar(0.11 * backOut(Math.min(1, u * 5))); f.s.material.opacity = u > 0.75 ? (1 - u) / 0.25 : 1;
    if (u >= 1) { rig.remove(f.s); f.s.material.dispose(); fx.floats.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- touch: pinch to size (placing), tap / drag (live)
const cam = $('cam');
const touches = new Map(); let pinch0 = null, drag = null, tap0 = null;
const hitRay = new THREE.Raycaster();
function pick(x, y) {
  _ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); hitRay.setFromCamera(_ndc, camera);
  const objs = [];
  for (const b of poll.bars) if (PANELS.poll.g.visible) objs.push(b.hit);
  for (const p of globe.pins) if (PANELS.globe.g.visible) objs.push(p.hit);
  for (const P of Object.values(PANELS)) if (P.g.visible && P.on > 0.5) objs.push(P.hit);
  if (live.g && live.g.visible && live.k > 0.5) objs.push(live.hit);
  const h = hitRay.intersectObjects(objs, false);
  return h[0] ? h[0].object.userData : null;
}
cam.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (mode === 'placing' && touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scaleK }; return; }
  if (touches.size !== 1 || mode !== 'live') return;
  tap0 = { x: e.clientX, y: e.clientY, t: performance.now() };
  const u = pick(e.clientX, e.clientY);
  if (u && (u.panel === 'globe' || u.place)) drag = { x: e.clientX, last: e.clientX, t: performance.now(), moved: 0 };
});
cam.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId); if (!t) return; t.x = e.clientX; t.y = e.clientY;
  if (pinch0 && touches.size === 2) { const [a, b] = [...touches.values()]; scaleK = clamp(pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(20, pinch0.d), SCALE.min, SCALE.max); showSize(); return; }
  if (drag) { const dx = e.clientX - drag.last; drag.last = e.clientX; drag.moved += Math.abs(dx); globe.spin.rotation.y += dx * 0.012; globe.spinTarget = null; const dtt = Math.max(1, performance.now() - drag.t) / 1000; globe.yawV = clamp(dx * 0.012 / dtt, -6, 6); drag.t = performance.now(); }
});
const endPtr = (e) => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch0 = null;
  const wasDrag = drag && drag.moved > 12; drag = null;
  if (mode !== 'live' || !tap0 || wasDrag) { tap0 = null; return; }
  const moved = Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y), quick = performance.now() - tap0.t < 450; tap0 = null;
  if (moved > 14 || !quick || e.type === 'pointercancel') return;
  const u = pick(e.clientX, e.clientY);
  if (!u) { if (focused) unfocus(); return; }
  if (u.live) return liveTap();
  if (u.vote != null) return vote(u.vote);
  if (u.place) return openPlace(u.place);
  if (u.panel === 'photo' && room && room.state && room.state.photos.length > 1 && focused === PANELS.photo) { photoIdx++; drawPhoto(); sound.pop(); return; }
  if (u.panel === 'globe' && globe.open) return closePlace();
  if (u.panel) focusPanel(PANELS[u.panel]);
};
cam.addEventListener('pointerup', endPtr); cam.addEventListener('pointercancel', endPtr);
function showSize() { $('size').hidden = false; $('size').textContent = `Projector ${Math.round(38 * scaleK)} cm wide · screens up to ${(1.8 * scaleK).toFixed(1)} m`; clearTimeout(showSize.t); showSize.t = setTimeout(() => { $('size').hidden = true; }, 1600); }

// ---------------------------------------------------------------- UI
const hud = $('hud');
let hintT = 0, hintHold = false;
function hint(text, ms = 0) { if ($('hint').textContent !== (text || '')) $('hint').textContent = text || ''; clearTimeout(hintT); hintHold = !!ms; if (ms) hintT = setTimeout(() => { hintHold = false; if ($('hint').textContent === text) $('hint').textContent = ''; }, ms); }
let toastT = 0;
function toast(text, ms = 1800) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
function syncUi() {
  hud.dataset.mode = mode;
  $('b-place').hidden = mode !== 'placing';
  $('b-shutter').hidden = mode !== 'live';
  $('b-move').hidden = !placed;                // house rule: Move always on screen once placed
  $('b-invite').hidden = !placed || !room || !room.canWrite;
  $('reacts').hidden = !placed;
  if (capture) capture.setVisible(false);
}
$('b-place').onclick = () => { sound.init(); place(); };
$('b-move').onclick = () => { sound.pop(); moveRig(); };
async function share(url, text) {
  try { if (navigator.share) { await navigator.share({ title: 'MEDIALIFE Holocast', text, url }); return true; } } catch (e) { if (e && e.name === 'AbortError') return false; }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); return true; } catch (e) { prompt('Copy this link', url); return false; }
}
const invite = () => { if (!room) return; if (!room.canWrite) { share(viewUrl(room.code), 'Watch my hologram live'); return; } share(controlUrl(room.code, room.key), 'Beam something into my hologram: type, draw, drop a photo'); postEvent('custom', { what: 'holocast-invite' }); };
$('b-invite').onclick = invite; $('o-invite').onclick = () => { closeOpts(); invite(); }; $('rs-invite').onclick = () => { $('roomsheet').hidden = true; invite(); };
$('o-watch').onclick = () => { closeOpts(); room && share(viewUrl(room.code), 'Watch my hologram live'); };
$('b-room').onclick = () => {
  if (!room) return; const s = room.state;
  $('rs-code').textContent = room.code;
  $('rs-body').textContent = s ? `${s.title}. ${s.watching || 1} watching now. ${s.stats.notices} notices, ${s.stats.strokes} strokes, ${s.stats.photos} photos and ${s.stats.reactions} reactions so far. Everything stays in this room until you start a fresh one.` : 'Connecting…';
  $('rs-invite').textContent = room.canWrite ? 'Invite to control' : 'Share the watch link';
  $('roomsheet').hidden = false;
};
$('rs-close').onclick = () => { $('roomsheet').hidden = true; };
const opts = $('opts');
function openOpts() { opts.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); $('o-sound').setAttribute('aria-checked', String(sound.on)); $('o-invite').hidden = !(room && room.canWrite); }
function closeOpts() { opts.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); disarm(); }
$('b-opts').onclick = openOpts; opts.querySelectorAll('[data-close]').forEach((el) => { el.onclick = closeOpts; });
$('o-sound').onclick = () => { sound.init(); sound.setOn(!sound.on); $('o-sound').setAttribute('aria-checked', String(sound.on)); if (globe.video) globe.video.muted = !sound.on; };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
$('o-lic').onclick = () => { closeOpts(); $('lic').hidden = false; }; $('lic-close').onclick = () => { $('lic').hidden = true; };
let armed = 0;
function disarm() { clearTimeout(armed); armed = 0; $('o-new').classList.remove('armed'); $('o-new-t').textContent = 'Start a fresh room'; $('o-new-s').textContent = 'A new, empty hologram with its own links'; }
$('o-new').onclick = async () => {
  if (!armed) { armed = setTimeout(disarm, 3500); $('o-new').classList.add('armed'); $('o-new-t').textContent = 'Tap again to start fresh'; $('o-new-s').textContent = 'This phone leaves the current room (it stays online for others)'; return; }
  disarm(); closeOpts();
  try {
    const made = await createRoom(); saveRoom(made.code, made.key);
    history.replaceState(null, '', `?room=${made.code}`);
    if (room) room.stop();
    room = new Room(made.code, made.key, { role: 'viewer' }); room.on(onRoom); room.start();
    $('o-control').href = controlUrl(room.code, room.key);
    photoCache.clear(); myVote = -1; syncUi(); toast(`New room ${made.code}`);
  } catch (e) { toast('Couldn\'t make a room. Check your connection.'); }
};
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOpts(); for (const id of ['how', 'lic', 'shot', 'roomsheet']) $(id).hidden = true; } });

// ---------------------------------------------------------------- loading + 8th Wall pipeline
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
const fontsReady = (document.fonts ? Promise.all([document.fonts.load(`700 40px ${FONT}`), document.fonts.load(`500 20px ${MONO}`), document.fonts.load(`700 20px ${MONO}`)]).catch(() => {}) : Promise.resolve());
// computers: the QR (and the control room, which works great on a laptop) right on the splash
if (!PHONE && !params.has('desktop')) {
  $('desk').hidden = false; $('b-ctl-desk').hidden = false;
  roomReady.then((r) => { if (r) $('b-ctl-desk').href = controlUrl(r.code, r.key); });
  try { window.QRCode && QRCode.toString(location.href.replace(/[?&](test|desktop)\b[^&]*/g, ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
}
Promise.all([xrReady, fontsReady]).then(() => {
  loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start'; $('splash').classList.add('ready');
});
setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);

const canvas = cam;
const DPR = clamp(+params.get('dpr') || 1.5, 1, 3);
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
const appModule = () => ({
  name: 'holocast',
  onStart: () => { buildScene(XR8.Threejs.xrScene()); built = true; hud.hidden = false; buildReactBar(); syncUi(); if (room && room.state) { applyTheme(room.state.theme, true); drawAll(); } },
  onUpdate: ({ processCpuResult }) => {
    const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
    const r = processCpuResult && processCpuResult.reality; if (r && r.trackingStatus) noteTracking(r.trackingStatus, r.trackingReason);
    if (built) frame(dt); flushDiag(false);
  },
  onRender: () => { if (capture) capture.frame(); },
  onCameraStatusChange: ({ status }) => {
    diag.steps.push(['cam:' + status, Math.round(performance.now())]);
    if (status === 'hasVideo') { camStartAt = performance.now(); $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 500); }
    if (status === 'requesting') hint('Allow camera and motion access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => {
    diag.errors.push('XR: ' + (typeof e === 'object' ? JSON.stringify(e) : String(e)).slice(0, 200)); flushDiag(true, true);
    if (e && e.type === 'permission') return showError('Motion access is needed', 'Holocast uses your phone\'s motion sensors to keep the projector on your floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.');
    const msg = String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e));
    if (/session manager|not supported|unsupported|device/i.test(msg) && !camStartAt) { try { XR8.stop(); } catch (er) { /* not running */ } return openOnPhone(); }
    if (!camStartAt) showError('Something went wrong', msg);
  },
  listeners: [{ event: 'reality.trackingstatus', process: ({ detail }) => noteTracking(detail.status, detail.reason) }],
});
function noteTracking(st, why) { if (st !== lastTrack) { lastTrack = st; diag.tracking.push([st + (why && why !== 'UNSPECIFIED' ? ' ' + why : ''), Math.round(performance.now())]); if (diag.tracking.length > 30) diag.tracking.shift(); } }
function askMotion() {   // iPhone: must be asked inside the tap, before anything async
  try { if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().catch(() => {}); } catch (e) { /* none */ }
  try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (e) { /* none */ }
}
let started = false;
function start() {
  if (!loaded || started) return; started = true;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init();
  if (!PHONE && !params.has('desktop')) return openOnPhone();
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  openRoom().then(() => { setRoomChip(); syncUi(); }).catch((e) => { toast('Couldn\'t reach the room. Check your connection.', 4000); diag.errors.push('room: ' + e.message); });
  XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' });
  XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(), appModule()]);
  postEvent('scan', {});
  setTimeout(() => { if (!camStartAt) camFailed('no video after 15 s'); }, 15000);
  XR8.run({
    canvas,
    allowedDevices: params.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
    cameraConfig: { direction: XR8.XrConfig.camera().BACK }, verbose: params.has('verbose'),
  });
}
$('b-start').onclick = () => { askMotion(); start(); };
function openOnPhone() {
  showError('Open this on your phone', 'The hologram needs your phone\'s camera and motion sensors to put the projector in your room. Scan this to open it there. The control room works right here on your computer.');
  try { window.QRCode && QRCode.toString(location.href.replace(/[?&](test|desktop)\b[^&]*/g, ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) { $('err-qr').innerHTML = svg; $('err-qr').hidden = false; } }); } catch (e) { /* no QR */ }
  $('err-ctl').hidden = false; roomReady.then((r) => { if (r) $('err-ctl').href = controlUrl(r.code, r.key); });
  $('err-retry').textContent = 'Close'; $('err-retry').onclick = () => { $('error').hidden = true; started = false; $('b-start').disabled = false; $('b-start').textContent = 'Start'; };
}
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true);
  showError('The camera didn\'t start', 'Allow camera and motion access for this site, and close the Camera app or other tabs that use the camera, then tap Try again.');
}
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; diag.errors.push(`${title}: ${body}`.slice(0, 200)); }
$('err-retry').onclick = () => location.reload();

// ---------------------------------------------------------------- photo, video (the shared recorder, no "send to globe")
const LOGO = { ml: new Image(), act: new Image() };
LOGO.ml.src = '/brand/medialife-wordmark.webp'; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
function drawWatermark(c, Wd, Hd) {
  const u = Math.min(Wd, Hd) / 720, pad = 26 * u;
  if (LOGO.ml.complete && LOGO.ml.naturalWidth) { const h = 26 * u, w = h * LOGO.ml.naturalWidth / LOGO.ml.naturalHeight; c.drawImage(LOGO.ml, pad, pad, w, h); }
  if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
}
let capture = null, recFrom = 0, shots = 0;
try {
  capture = new ColaCapture({
    canvas, host: document.body, endpoint: location.origin, globeUrl: '/labs/holocast/', source: 'holocast', audioContext: null,
    connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
    overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
    on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); },
  });
  Object.assign(capture.settings, { corner: 'topRight', accent: '#3fe6ff', maxSeconds: 30, sendEnabled: false, brandTitle: 'HOLOCAST', brandTagline: 'MEDIALIFE', hintText: 'Film your hologram', keepTitle: 'Keep your clip?', clipTitle: 'Holocast clip', filePrefix: 'holocast', backLabel: 'Back to the camera' });
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
    buzz(20); const fl = $('flashw'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermark(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    const file = new File([blob], `holocast-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
    $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: 'My Holocast' }).catch(() => {});
    $('shot').hidden = false;
    postEvent('share', { what: 'holocast-photo' });
  } catch (e) { console.error(e); }
}
$('shot-close').onclick = () => { $('shot').hidden = true; };
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

// ---------------------------------------------------------------- platform events (city level, anonymous)
const SID = 'hc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'holocast', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
const diag = { page: 'holocast', sid: SID, fpsN: 0, errors: [], steps: [], tracking: [], note: params.get('note') || '' };
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, room: room && room.code, placed, scale: +scaleK.toFixed(2), secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { flushDiag(true); if (globe.video) globe.video.pause(); } });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });
function drawDiag(now) {
  const el = $('diagp'); el.hidden = false;
  const fps = camStartAt ? diag.fpsN / Math.max((now - camStartAt) / 1000, 1) : 0;
  el.textContent = `${mode} · track ${lastTrack || '-'} · fps ${fps.toFixed(0)} · room ${room ? room.code + ' r' + room.rev : '-'}${room && room.offline ? ' OFFLINE' : ''}\nfloor ${floorOk ? floorHit.toArray().map((v) => v.toFixed(2)).join(',') : '-'} · scale ${scaleK.toFixed(2)} · strokes ${room ? room.strokes.size : 0}`;
}

// automated tests (?test)
if (params.has('test')) window.__hc = {
  get mode() { return mode; }, get placed() { return placed; }, get booted() { return booted; }, get room() { return room; }, get tracking() { return lastTrack; },
  PANELS, globe, poll, camera: () => camera, rig,
  floorAt(dz = 1.8) { const f = V(); camera.getWorldDirection(f); f.y = 0; f.normalize(); testFloor = camera.position.clone().addScaledVector(f, dz).setY(0); },
  place: () => { updateFloor(); place(); }, move: moveRig, focus: (n) => focusPanel(PANELS[n]), unfocus: () => unfocus(), vote, react, openPlace, pulseBeam, live: () => ({ on: live.on, state: live.state, id: live.id, aspect: live.aspect, k: live.k }),
  setScale(s) { scaleK = s; },
};
