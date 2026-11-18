// MEDIALIFE AR Player: one runtime for every image-target experience under /labs/x/<slug>/.
// Each experience is a folder with index.html (thin), experience.json (everything about it), image-targets/ and
// target/ (test pictures). This file reads ../<slug>/experience.json and builds the splash, the camera and the
// content. Engine: the open-source image tracker (MIT), vendored at /evade/keychain-ar/vendor/xr/, image targets
// only (disableWorldTracking). three.js r180 via the import map.
//
// Units: like the original A-Frame scenes, each target's anchor is scaled by the engine's `scale`, so 1 unit =
// the height of the tracked picture (a portrait 3:4 target is 0.75 x 1). Content sizes come straight from the old
// <a-plane width height position>. `scale: [mx, my]` sizes a plane relative to the target frame instead (the old
// xrextras-target-video-fade width/height multipliers; cylinder targets use the engine's own label geometry).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.THREE = THREE;   // the engine's three.js pipeline module looks for a global THREE

// ---------------------------------------------------------------- shared state (top of module: early callbacks use it)
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const BASE = new URL('./', location.href);
const url = (p) => new URL(p, BASE).href;
const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const DESK = !PHONE && !params.has('desktop');
const GRACE_MS = 120, STALE_MIN = 120, STALE_MAX = 300;
const DRAW_DPR = Math.min(devicePixelRatio || 1, parseFloat(params.get('dpr')) || 1);
const ACT_BY = '/activated-merch/media/ar/activated-by.webp';
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const LOG_ON = !params.has('nolog') && (params.has('diag') || !LIVE_SITE);

let X = null;                      // experience.json
let scene, camera, renderer, started = false, camLive = false, last = 0, startTapped = false;
const TS = {};                     // per target name: tracking state + content items
const VIDS = new Map();            // src -> { el, tex, sound }
const MODELS = new Map();          // src -> gltf scene (loaded before Start)
let soundOn = false;
const diag = { page: 'labs-x', sid: Math.random().toString(36).slice(2, 12), t0: Date.now(), targets: {}, errors: [], fps: { n: 0, sum: 0 } };
const canvas = $('cam');

// ---------------------------------------------------------------- chroma key (same shader as the original campaigns)
const CK_VERT = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const CK_FRAG = `uniform sampler2D tex; uniform vec3 keyColor; uniform float similarity; uniform float smoothness; uniform float spill; uniform float opacity;
varying vec2 vUv;
vec2 RGBtoUV(vec3 rgb){ return vec2(rgb.r*-0.169+rgb.g*-0.331+rgb.b*0.5+0.5, rgb.r*0.5+rgb.g*-0.419+rgb.b*-0.081+0.5); }
void main(){
  vec4 rgba = texture2D(tex, vUv);
  float chromaDist = distance(RGBtoUV(rgba.rgb), RGBtoUV(keyColor));
  float baseMask = chromaDist - similarity;
  float fullMask = pow(clamp(baseMask / smoothness, 0., 1.), 1.5);
  float spillVal = pow(clamp(baseMask / spill, 0., 1.), 1.5);
  float desat = clamp(rgba.r*0.2126 + rgba.g*0.7152 + rgba.b*0.0722, 0., 1.);
  gl_FragColor = vec4(mix(vec3(desat), rgba.rgb, spillVal), fullMask * opacity);
  #include <colorspace_fragment>
}`;
function chromaMaterial(tex, ck = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: tex }, keyColor: { value: new THREE.Color(ck.color || '#19ae31') }, opacity: { value: 1 },
      similarity: { value: ck.similarity ?? 0.159 }, smoothness: { value: ck.smoothness ?? 0.082 }, spill: { value: ck.spill ?? 0.214 },
    },
    vertexShader: CK_VERT, fragmentShader: CK_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// ---------------------------------------------------------------- media
function getVideo(src, sound) {
  let v = VIDS.get(src);
  if (v) { v.sound = v.sound || !!sound; return v; }
  const el = document.createElement('video');
  // iOS: set these BEFORE src, keep the element in the document, play muted first (skill pitfall)
  el.crossOrigin = 'anonymous'; el.muted = true; el.defaultMuted = true; el.playsInline = true; el.loop = true; el.preload = 'auto';
  el.setAttribute('playsinline', ''); el.setAttribute('webkit-playsinline', ''); el.setAttribute('muted', '');
  el.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  el.src = src; document.body.appendChild(el);
  const tex = new THREE.VideoTexture(el); tex.colorSpace = THREE.SRGBColorSpace;
  v = { el, tex, sound: !!sound, want: false };
  VIDS.set(src, v); return v;
}
const texLoader = new THREE.TextureLoader();
function getImage(src) { const t = texLoader.load(src); t.colorSpace = THREE.SRGBColorSpace; return t; }

// ---------------------------------------------------------------- content
// Built once per target in onStart. Each item gets: obj (added under the anchor), and lifecycle hooks.
function sizeOf(it, t) {
  if (it.scale) return [it.scale[0] * (t.sw || 0.75), it.scale[1] * (t.sh || 1)];
  return [it.width ?? (t.sw || 0.75), it.height ?? (t.sh || 1)];
}
function buildItem(it, t, order) {
  const holder = new THREE.Group();
  const off = it.offset || [0, 0, 0]; holder.position.set(off[0] || 0, off[1] || 0, off[2] || 0);
  if (it.rotation) holder.rotation.set(...it.rotation.map((d) => THREE.MathUtils.degToRad(d || 0)));
  t.anchor.add(holder);
  const st = { it, holder, opacity: 1, foundAt: 0, ready: () => true, mats: [] };
  const plane = (mat) => {
    let geo;
    if (t.cyl) {   // curved label: the engine's cylinder, like xrextras createCurvedGeometry
      const g = t.cyl, k = it.scale ? it.scale[0] : 1, len = g.arcLengthRadians * k;
      geo = new THREE.CylinderGeometry(g.radiusTop, g.radiusBottom, g.height * (it.scale ? it.scale[1] : 1), 50, 1, true, (2 * Math.PI - len) / 2 + Math.PI, len);
    } else {
      const [w, h] = sizeOf(it, t); geo = new THREE.PlaneGeometry(w, h);
    }
    const m = new THREE.Mesh(geo, mat); m.renderOrder = order; holder.add(m); st.mats.push(mat); return m;
  };
  const fade = (mat) => { mat.transparent = true; mat.depthWrite = false; mat.side = THREE.DoubleSide; return mat; };
  switch (it.type) {
    case 'video': {
      const v = getVideo(it.src, it.sound); st.video = v;
      plane(fade(new THREE.MeshBasicMaterial({ map: v.tex, toneMapped: false })));
      st.ready = () => v.el.readyState >= 2; break;
    }
    case 'chromakey-video': {
      const v = getVideo(it.src, it.sound); st.video = v;
      plane(chromaMaterial(v.tex, it.chroma)); st.ready = () => v.el.readyState >= 2; break;
    }
    case 'image': {
      const tex = getImage(it.src);
      plane(fade(new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, alphaTest: 0.01 }))); break;
    }
    case 'model': {
      const src = MODELS.get(it.src); if (!src) break;
      const spin = new THREE.Group(); const m = src.clone(true);
      const s = it.modelScale || [1, 1, 1]; m.scale.set(...s);
      spin.add(m); holder.add(spin); st.spin = spin; st.rotate = it.rotate;
      m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });   // shown/hidden whole (no fade: transparent models sort badly)
      break;
    }
    default: console.warn('unknown content type', it.type);
  }
  return st;
}
function setOpacity(st, a) {
  for (const m of st.mats) { if (m.uniforms && m.uniforms.opacity) m.uniforms.opacity.value = a; else m.opacity = a; }
  st.holder.visible = a > 0.001;
}
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);   // easeInOutQuad, like the old fade

function buildTarget(t) {
  if (t.built) return; t.built = true;
  if (DEBUG) {   // the tracked picture's frame (?debug): check it sits on the print's edges
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, depthTest: false });
    const g = t.cyl ? new THREE.EdgesGeometry(new THREE.CylinderGeometry(t.cyl.radiusTop, t.cyl.radiusBottom, t.cyl.height, 24, 1, true, (2 * Math.PI - t.cyl.arcLengthRadians) / 2 + Math.PI, t.cyl.arcLengthRadians))
      : new THREE.EdgesGeometry(new THREE.PlaneGeometry(t.sw, t.sh));
    const l = new THREE.LineSegments(g, mat); l.renderOrder = 999; t.anchor.add(l);
  }
  t.items = (t.def.content || []).map((it, i) => buildItem(it, t, i + 1));
}

// ---------------------------------------------------------------- scene
function buildScene({ scene: s, camera: c, renderer: r }) {
  scene = s; camera = c; renderer = r;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  try { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6; } catch (e) { /* no env */ }
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1, 1, 1); scene.add(key);
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  for (const def of X.targets) {
    const anchor = new THREE.Group(); anchor.visible = false; scene.add(anchor);
    TS[def.name] = { def, anchor, tracked: false, at: 0, gap: 40, lostAt: -1e9, snap: true, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, sw: 0.75, sh: 1, cyl: null, built: false, items: [], wasShown: false };
    diag.targets[def.name] = { found: 0, lost: 0, firstFoundS: null, trackedS: 0 };
  }
}

// ---------------------------------------------------------------- tracking -> anchors (template logic)
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  if (!t.built) {
    if (d.type === 'CYLINDRICAL' || d.type === 'CONICAL') t.cyl = { radiusTop: d.radiusTop, radiusBottom: d.radiusBottom, height: d.height, arcLengthRadians: d.arcLengthRadians, arcStartRadians: d.arcStartRadians };
    if (d.scaledWidth) { t.sw = d.scaledWidth; t.sh = d.scaledHeight; }
    t.dtype = d.type; buildTarget(t);
  }
  t.p.set(d.position.x, d.position.y, d.position.z);
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.s = d.scale;
  const now = performance.now();
  if (!t.tracked) {
    t.snap = true;
    const g = diag.targets[d.name]; g.found++; if (g.firstFoundS == null) g.firstFoundS = +((Date.now() - diag.t0) / 1000).toFixed(1);
  } else t.gap += (Math.min(Math.max(now - t.at, 8), 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; t.lostAt = performance.now(); diag.targets[d.name].lost++; } }
function follow(t) {
  const a = t.anchor;
  const aP = t.snap ? 1 : Math.min(Math.max(a.position.distanceTo(t.p) / t.s / 0.004, 0.5), 1);
  const aR = t.snap ? 1 : Math.min(Math.max(a.quaternion.angleTo(t.q) / 0.03, 0.5), 1);
  const aS = t.snap ? 1 : Math.min(Math.max(Math.abs(a.scale.x - t.s) / t.s / 0.02, 0.5), 1);
  t.snap = false;
  a.position.lerp(t.p, aP); a.quaternion.slerp(t.q, aR); a.scale.setScalar(THREE.MathUtils.lerp(a.scale.x, t.s, aS));
}

function tick(dt) {
  const now = performance.now();
  let anyShown = false, soundVisible = false;
  for (const v of VIDS.values()) v.want = false;
  for (const t of Object.values(TS)) {
    if (t.tracked && now - t.at > Math.min(Math.max(t.gap * 3, STALE_MIN), STALE_MAX)) { t.tracked = false; t.lostAt = now; }
    const show = t.tracked || now - t.lostAt < GRACE_MS;
    if (t.tracked) follow(t);
    if (!show) t.snap = true;
    t.anchor.visible = show;
    if (show && !t.wasShown) for (const st of t.items) { st.foundAt = now; if (st.video && st.it.restart) { try { st.video.el.currentTime = 0; } catch (e) { /* not ready */ } } }
    if (!show && t.wasShown) for (const st of t.items) if (st.video && st.it.restart) { st.video.el.pause(); try { st.video.el.currentTime = 0; } catch (e) { /* none */ } }
    t.wasShown = show;
    if (!show) continue;
    anyShown = true; diag.targets[t.def.name].trackedS += dt;
    for (const st of t.items) {
      if (st.video) { st.video.want = true; if (st.video.sound) soundVisible = true; }
      if (!st.ready()) { setOpacity(st, 0); st.foundAt = now; continue; }
      const f = st.it.fadeIn ? Math.min(1, (now - st.foundAt) / st.it.fadeIn) : 1;
      setOpacity(st, st.it.fadeIn ? ease(f) : 1);
    }
  }
  for (const v of VIDS.values()) {
    if (v.want && v.el.paused) { v.el.muted = !(soundOn && v.sound); v.el.play().catch(() => {}); }
    else if (!v.want && !v.el.paused) v.el.pause();
  }
  hint(anyShown ? null : (X.hint || 'Point your camera at the print'));
  $('sound').hidden = !soundVisible;
  const ctas = $('ctas'); if (ctas.dataset.tracked === '1') ctas.classList.toggle('off', !anyShown);
  if (rec && rec.recording) rec.frame();
  diag.fps.n++; diag.fps.sum += dt;
}

// one finger drag spins 3D models on the print (old `one-finger-rotate`, factor 3: dx scaled by 2 / (w + h))
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, id: e.pointerId }; });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = (e.clientX - drag.x) * 2 / (innerWidth + innerHeight); drag.x = e.clientX;
  for (const t of Object.values(TS)) if (t.anchor.visible) for (const st of t.items) if (st.spin && st.rotate) st.spin.rotation.y += dx * (st.rotate.factor || 3);
});
addEventListener('pointerup', () => { drag = null; }); addEventListener('pointercancel', () => { drag = null; });

// ---------------------------------------------------------------- UI shell
const ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function wordmarkHtml() { return `<span class="wordmark">${esc(X.wordmark || X.client)}</span>`; }

function renderShell() {
  document.documentElement.style.setProperty('--accent', X.accent || '#f6c344');
  if (X.onAccent) document.documentElement.style.setProperty('--on-accent', X.onAccent);
  if (X.background) document.documentElement.style.setProperty('--bg', X.background);
  document.title = `${X.title} · MEDIALIFE Labs`;
  const hero = X.hero || (X.targets[0] && X.targets[0].picture);
  const sp = $('splash');
  sp.innerHTML = `
    <div class="sp-top">${wordmarkHtml()}<button class="ib menu-btn" aria-haspopup="dialog" aria-label="Menu">${ICON_MENU}</button></div>
    <div class="hero" aria-hidden="true"><div class="card" style="--hero-ar:${esc(X.heroAspect || '3/4')}"><img src="${esc(url(hero))}" alt=""></div></div>
    <div class="copy">
      <p class="client">${esc(X.client)}</p>
      <h1 id="title">${esc(X.title)}</h1>
      <p class="lead">${esc(X.lead)}</p>
      <div id="desk" hidden><div id="qr" aria-label="QR code that opens this page on your phone"></div><p><b>Made for your phone.</b>Scan this with your phone's camera to open it there.</p></div>
      <button id="start" class="primary" disabled>Loading…</button>
      <div id="load" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <img class="act-by" src="${ACT_BY}" alt="Activated by MEDIALIFE" width="148" height="58">
    </div>`;
  const hud = $('hud');
  const cap = X.capture && (X.capture.photo || X.capture.video);
  hud.classList.toggle('has-cap', !!cap); hud.classList.toggle('has-banner', !!X.banner);
  hud.innerHTML = `
    <div class="hud-top">${wordmarkHtml()}<button class="ib menu-btn" aria-haspopup="dialog" aria-label="Menu">${ICON_MENU}</button></div>
    <button id="sound" hidden aria-pressed="false">${ICON_SOUND}<span>Tap for sound</span></button>
    <p id="hint" role="status" aria-live="polite" hidden></p>
    ${X.banner ? `<img id="banner" src="${esc(url(X.banner.src))}" alt="${esc(X.banner.alt || '')}">` : ''}
    <div id="ctas" data-tracked="${(X.cta || []).some((c) => c.whileTracked) ? 1 : 0}">${(X.cta || []).map((c, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="${esc(c.url)}" target="${c.url.startsWith('/') ? '_self' : '_blank'}" rel="noopener">${esc(c.label)}</a>`).join('')}</div>
    ${cap ? `<p id="cap-tip">${X.capture.video ? 'Tap for photo · Hold for video' : 'Tap for a photo'}</p><span id="rec-time" hidden>0:00</span>
      <button id="shutter" aria-label="${X.capture.video ? 'Take a photo. Press and hold to film' : 'Take a photo'}"><svg viewBox="0 0 96 96" aria-hidden="true"><circle id="rec-prog" cx="48" cy="48" r="42"/></svg></button>` : ''}`;
  if (!(X.cta || []).length) $('ctas').hidden = true;
  document.querySelectorAll('.menu-btn').forEach((b) => { b.onclick = openMenu; });
  $('sound').onclick = toggleSound;
  if (cap) wireShutter();
  if (DESK) {
    $('desk').hidden = false; $('start').classList.add('ghost');
    try { window.QRCode && QRCode.toString(location.href.replace(/[?&](test|desktop|nolog)\b[^&]*/g, ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) $('qr').innerHTML = svg; }); } catch (e) { /* no QR */ }
  }
  $('start').onclick = start;
}
function hint(text) { const el = $('hint'); if (!el) return; if (!text || !camLive) { el.hidden = true; return; } if (el.textContent !== text) el.textContent = text; el.hidden = false; }
function sheet(html, onWire) {
  const w = document.createElement('div'); w.className = 'sheet-wrap'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-modal', 'true');
  w.innerHTML = `<div class="sheet">${html}</div>`; document.body.appendChild(w);
  const close = () => { w.remove(); };
  w.addEventListener('click', (e) => { if (e.target === w) close(); });
  w.querySelectorAll('[data-close]').forEach((b) => { b.onclick = close; });
  onWire && onWire(w, close);
  const f = w.querySelector('a,button'); f && f.focus();
  return close;
}
function openMenu() {
  sheet(`<h2>${esc(X.title)}</h2><p>${esc(X.client)} · Activated by MEDIALIFE</p>
    <a class="btn" href="${esc(url('target/'))}" target="_blank" rel="noopener">Test picture</a>
    <a class="btn" href="/evade/licences/" target="_blank" rel="noopener">Licences</a>
    <a class="btn" href="/labs/">More from MEDIALIFE Labs</a>
    <button data-close>Close</button>`);
}
function showError(title, body, retry = true) {
  diag.errors.push(title); flushDiag(true);
  sheet(`<h2>${esc(title)}</h2><p>${esc(body)}</p>${retry ? '<button class="primary" data-retry>Try again</button>' : ''}<button data-close>Close</button>`,
    (w) => { const r = w.querySelector('[data-retry]'); if (r) r.onclick = () => location.reload(); });
}
function toggleSound() {
  soundOn = !soundOn;
  for (const v of VIDS.values()) if (v.sound) { v.el.muted = !soundOn; if (soundOn && !v.el.paused) v.el.play().catch(() => {}); }
  const b = $('sound'); b.classList.toggle('on-sound', soundOn); b.setAttribute('aria-pressed', String(soundOn));
  b.querySelector('span').textContent = soundOn ? 'Sound on' : 'Tap for sound';
  if (soundOn) ensureAudioGraph();
}

// ---------------------------------------------------------------- capture: photo (tap) and video (hold), watermarked
const WM = [];   // { img, pos, w }
function loadWatermarks() {
  const list = [...((X.capture && X.capture.watermark) || []), { src: ACT_BY, pos: 'bottom-right', w: 0.26 }];
  for (const m of list) { const img = new Image(); img.src = m.src.startsWith('/') ? m.src : url(m.src); WM.push({ img, pos: m.pos || 'bottom', w: m.w || 0.5 }); }
}
function drawWatermarks(c, W, H) {
  const pad = Math.min(W, H) * 0.035;
  for (const m of WM) {
    if (!m.img.complete || !m.img.naturalWidth) continue;
    const w = Math.min(W, H) * m.w, h = w * m.img.naturalHeight / m.img.naturalWidth;
    const x = m.pos === 'bottom-right' ? W - pad - w : m.pos === 'top-left' ? pad : (W - w) / 2;
    const y = m.pos === 'top-left' ? pad : H - pad - h - (m.pos === 'bottom' ? Math.min(W, H) * 0.12 : 0);
    try { c.drawImage(m.img, x, y, w, h); } catch (e) { /* not ready */ }
  }
}
let audio = null;   // { ctx, nodes: Map(video -> source) }
function ensureAudioGraph() {
  if (!(X.capture && X.capture.video) || audio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); audio = { ctx, nodes: new Map() };
    for (const v of VIDS.values()) if (v.sound) { const n = ctx.createMediaElementSource(v.el); n.connect(ctx.destination); audio.nodes.set(v, n); }
  } catch (e) { console.warn('audio graph', e); audio = null; }
}
class Recorder {
  constructor() { this.out = document.createElement('canvas'); this.g = this.out.getContext('2d', { alpha: false }); this.rec = null; }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
  start() {
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mime) throw new Error('This browser can\'t record video.');
    const k = Math.min(1, 1280 / Math.max(canvas.width, canvas.height));
    this.out.width = Math.round(canvas.width * k / 2) * 2; this.out.height = Math.round(canvas.height * k / 2) * 2;
    const stream = this.out.captureStream(30);
    if (audio && soundOn) {
      try { const dest = audio.ctx.createMediaStreamDestination(); for (const n of audio.nodes.values()) n.connect(dest); this.dest = dest; dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr)); } catch (e) { /* silent clip */ }
    }
    this.parts = []; this.mime = mime; this.t0 = performance.now();
    this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4e6 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.parts.push(e.data); };
    this.rec.onstop = () => { if (this.dest && audio) for (const n of audio.nodes.values()) try { n.disconnect(this.dest); } catch (e) { /* gone */ } this.dest = null; recUi(false); const blob = new Blob(this.parts, { type: this.mime.split(';')[0] }); this.rec = null; showCapture(blob, 'video'); };
    this.rec.start(1000); recUi(true);
  }
  frame() {
    const W = this.out.width, H = this.out.height, k = Math.max(W / canvas.width, H / canvas.height);
    try { this.g.drawImage(canvas, (W - canvas.width * k) / 2, (H - canvas.height * k) / 2, canvas.width * k, canvas.height * k); } catch (e) { /* not ready */ }
    drawWatermarks(this.g, W, H);
    const sec = (performance.now() - this.t0) / 1000, max = 15;
    const p = $('rec-prog'); if (p) p.style.strokeDashoffset = String(264 * (1 - Math.min(sec / max, 1)));
    const tl = `0:${String(Math.floor(sec)).padStart(2, '0')}`; if ($('rec-time').textContent !== tl) $('rec-time').textContent = tl;
    if (sec >= max) this.stop();
  }
  stop() { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); }
}
let rec = null;
function recUi(on) { $('shutter').classList.toggle('rec', on); $('rec-time').hidden = !on; $('cap-tip').style.opacity = on ? 0 : ''; if (!on) $('rec-prog').style.strokeDashoffset = '264'; }
async function takePhoto() {
  try {
    const fl = $('flash'); fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60);
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); drawWatermarks(g, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
    showCapture(blob, 'photo');
  } catch (e) { console.error('photo', e); }
}
let shots = 0;
function showCapture(blob, kind) {
  const ext = kind === 'photo' ? 'jpg' : (blob.type.includes('mp4') ? 'mp4' : 'webm');
  const name = `${X.capture.filePrefix || X.slug}-${++shots}.${ext}`, file = new File([blob], name, { type: blob.type }), u = URL.createObjectURL(blob);
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  sheet(`<h2>${kind === 'photo' ? 'Your photo' : 'Your video'}</h2>
    ${kind === 'photo' ? `<img class="prev" src="${u}" alt="Your photo">` : `<video class="prev" src="${u}" controls playsinline loop autoplay muted></video>`}
    ${canShare ? '<button class="primary" data-share>Share</button>' : ''}
    <a class="btn${canShare ? '' : ' primary'}" href="${u}" download="${esc(name)}">Save</a>
    <button data-close>Back to the camera</button>`, (w) => { const s = w.querySelector('[data-share]'); if (s) s.onclick = () => navigator.share({ files: [file], title: X.title }).catch(() => {}); });
}
function wireShutter() {
  const sh = $('shutter'); let holding = false, holdT = 0;
  setTimeout(() => { const t = $('cap-tip'); if (t) t.style.opacity = 0; }, 6000);
  sh.addEventListener('contextmenu', (e) => e.preventDefault());
  sh.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    if (rec && rec.recording) { holding = false; return; }
    holding = true; try { sh.setPointerCapture(e.pointerId); } catch (er) { /* old Safari */ }
    clearTimeout(holdT);
    if (X.capture.video) holdT = setTimeout(() => { if (!holding) return; try { rec = rec || new Recorder(); rec.start(); } catch (er) { holding = false; showError('Video isn\'t available', String(er.message || er), false); } }, 320);
  });
  sh.addEventListener('pointerup', () => {
    if (rec && rec.recording) { holding = false; clearTimeout(holdT); rec.stop(); return; }
    if (!holding) return; holding = false; clearTimeout(holdT); if (X.capture.photo !== false) takePhoto();
  });
  sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (rec && rec.recording) rec.stop(); });
  sh.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); takePhoto(); } });
}

// ---------------------------------------------------------------- test log (previews / localhost, or ?diag)
function flushDiag(force) {
  if (!LOG_ON || !started) return;
  const now = Date.now(); if (!force && now - (diag.sent || 0) < 10000) return; diag.sent = now;
  const body = JSON.stringify({ ...diag, fpsAvg: diag.fps.sum ? +(diag.fps.n / diag.fps.sum).toFixed(1) : null, screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent, note: params.get('note') || '' });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }).catch(() => {}); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) { flushDiag(true); for (const v of VIDS.values()) v.el.pause(); } });
addEventListener('error', (e) => diag.errors.push(String(e.message).slice(0, 200)));

// ---------------------------------------------------------------- engine
function sizeCanvas() {
  const w = Math.round(innerWidth * DRAW_DPR), h = Math.round(innerHeight * DRAW_DPR);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
const appModule = () => ({
  name: 'medialife-ar-player',
  onStart: () => { buildScene(XR8.Threejs.xrScene()); started = true; },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (scene) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status }) => {
    if (params.has('test')) console.log('camera', status);
    if (status === 'hasVideo' && !camLive) {
      camLive = true; $('hud').hidden = false; $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 500);
    }
    if (status === 'failed') showError('The camera didn\'t start', 'Another app may be using it. Close the Camera app and other tabs that use the camera, then try again. On iPhone use Safari, on Android use Chrome.');
  },
  onException: (e) => {
    const msg = String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e));
    console.error('XR', msg); diag.errors.push('XR: ' + msg.slice(0, 200));
    if (/session manager|not supported|unsupported|device/i.test(msg) && !camLive) return openOnPhone();
    if (!camLive) showError('Something went wrong', msg);
  },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
  ],
});
function openOnPhone() {
  sheet(`<h2>Open this on your phone</h2><p>${esc(X.title)} uses your phone's camera. Scan this to open it there.</p><div id="qr2" style="background:#fff;border-radius:12px;padding:12px;width:200px;height:200px;align-self:center"></div><button data-close>Close</button>`);
  try { window.QRCode && QRCode.toString(location.href.replace(/[?&](test|desktop|nolog)\b[^&]*/g, ''), { type: 'svg', margin: 0 }, (err, svg) => { if (!err) $('qr2').innerHTML = svg; }); } catch (e) { /* no QR */ }
  startTapped = false; $('start').disabled = false; $('start').textContent = DESK ? 'Use this computer\'s camera' : 'Start';
}

let targetData = null;
async function start() {
  if (startTapped) return; startTapped = true;
  $('start').disabled = true; $('start').textContent = 'Starting…';
  // unlock every video inside the tap (iOS), muted
  for (const v of VIDS.values()) { v.el.play().then(() => v.el.pause()).catch(() => {}); }
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: targetData });
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(),
    XR8.CanvasScreenshot.pipelineModule(), appModule(),
  ]);
  setTimeout(() => { if (!camLive) showError('The camera didn\'t start', 'Close other apps or tabs using the camera, allow camera access for this site, then try again.'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
}

// ---------------------------------------------------------------- boot: experience.json -> shell -> preload -> Start
let progress = { done: 0, total: 1 };
function bump(n = 1) { progress.done += n; const p = Math.min(100, Math.round(100 * progress.done / progress.total)); const i = document.querySelector('#load i'); if (i) i.style.width = p + '%'; const l = $('load'); if (l) l.setAttribute('aria-valuenow', String(p)); }
function loadGlb(src) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('GET', src); x.responseType = 'arraybuffer'; let seen = 0;
    x.onprogress = (e) => { if (e.lengthComputable) { const f = e.loaded / e.total; bump((f - seen) * 4); seen = f; } };
    x.onload = () => {
      if (x.status >= 400) return rej(new Error(src + ' ' + x.status));
      bump((1 - seen) * 4);
      const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
      loader.parse(x.response, src.replace(/[^/]*$/, ''), (g) => res(g.scene), rej);
    };
    x.onerror = () => rej(new Error('network ' + src)); x.send();
  });
}
async function boot() {
  try {
    X = await fetch(url('experience.json')).then((r) => { if (!r.ok) throw new Error('experience.json ' + r.status); return r.json(); });
  } catch (e) { document.body.insertAdjacentHTML('beforeend', '<p style="padding:24px">This experience could not be loaded. Check your connection and reload the page.</p>'); throw e; }
  diag.page = 'labs-x-' + (X.slug || BASE.pathname.split('/').filter(Boolean).pop());
  if (X.targets.length > 10) console.warn('more than 10 image targets: the engine only finds 10');
  renderShell(); loadWatermarks();
  const models = [...new Set(X.targets.flatMap((t) => (t.content || []).filter((c) => c.type === 'model').map((c) => c.src)))];
  progress.total = 3 + X.targets.length + models.length * 4;
  const xrReady = new Promise((res) => (window.XR8 ? res() : addEventListener('xrloaded', () => res(), { once: true }))).then(() => bump(3));
  const tj = Promise.all(X.targets.map((t) => fetch(url(t.json)).then((r) => { if (!r.ok) throw new Error(t.json + ' ' + r.status); return r.json(); }).then((j) => { bump(); return j; })));
  const md = Promise.all(models.map((m) => loadGlb(m).then((s) => MODELS.set(m, s))));
  // create the video elements now so they buffer while the person reads the splash
  for (const t of X.targets) for (const c of t.content || []) if (c.type === 'video' || c.type === 'chromakey-video') getVideo(c.src, c.sound);
  setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);
  try {
    [targetData] = await Promise.all([tj, xrReady, md]);
    $('start').disabled = false; $('start').textContent = DESK ? 'Use this computer\'s camera' : 'Start'; $('splash').classList.add('ready');
  } catch (e) { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); }
}
boot();

if (params.has('test')) window.__ar = {
  TS, diag, VIDS, get scene() { return scene; }, get camLive() { return camLive; }, get soundOn() { return soundOn; }, toggleSound,
  // where each tracked target's frame corners and content land on screen (CSS px), for alignment checks
  screen(name) {
    const t = TS[name]; if (!t || !t.anchor.visible || !camera) return null;
    const pts = [[-t.sw / 2, t.sh / 2], [t.sw / 2, t.sh / 2], [t.sw / 2, -t.sh / 2], [-t.sw / 2, -t.sh / 2]].map(([x, y]) => {
      const v = new THREE.Vector3(x, y, 0); t.anchor.localToWorld(v); v.project(camera); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)];
    });
    return { corners: pts, sw: t.sw, sh: t.sh, type: t.dtype, cyl: t.cyl, items: t.items.map((st) => ({ type: st.it.type, visible: st.holder.visible, opacity: st.mats[0] ? (st.mats[0].uniforms ? st.mats[0].uniforms.opacity.value : st.mats[0].opacity) : null, playing: st.video ? !st.video.el.paused : null, t: st.video ? +st.video.el.currentTime.toFixed(2) : null })) };
  },
  photo: takePhoto,
};
