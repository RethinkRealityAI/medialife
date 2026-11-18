// Portal kit runtime: everything a walk-through portal experience shares, so each experience only builds its world.
//   splash -> Start (camera + motion in the same tap) -> point at the floor -> Place (pinch to size) -> the door opens
//   -> walk through -> the other world all round you -> walk back out through the door.
// Move (bottom right) is on screen from the moment the door is placed and picks the door up WITHOUT resetting the
// world (house rule for world-tracked AR). Shutter bottom centre: tap = photo, hold = video (the Cola Run recorder).
// Engine: 8th Wall distributed engine binary (SLAM), loaded unmodified from jsDelivr by the page.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ColaCapture } from '/evade/cola-run-lab/assets/capture-core.js';
import { Portal } from './portal.js';

window.THREE = THREE; // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const SHOW_DIAG = params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const ICON = {
  opts: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  how: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  link: '<path d="M10 14 21 3M15 3h6v6M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/>',
};
const svg = (d, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export function runPortal(cfg) {
  const store = { get(k, d) { try { const v = localStorage.getItem(cfg.id + '-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(cfg.id + '-' + k, String(v)); } catch (e) { /* none */ } } };
  const copy = Object.assign({
    findFloor: 'Point at the floor and move your phone slowly',
    aim: 'Pinch to size the door, then tap Place',
    walkIn: 'Walk through the door',
    step: 'Step through!',
    inside: 'Tap anything',
    back: 'Back in your room. Walk in again any time',
    place: 'Place the door',
  }, cfg.copy || {});

  // ---------------------------------------------------------------- the HUD and sheets (same on every portal)
  document.body.insertAdjacentHTML('beforeend', `
  <div id="hud" hidden data-mode="find">
    <div class="tl"><img src="${cfg.brandLogo}" alt="${cfg.brandName || ''}"></div>
    <div id="count" hidden aria-live="polite"><span id="count-l"></span><span class="pips" id="pips"></span></div>
    <div id="side"><button id="b-opts" class="ib" aria-haspopup="dialog" aria-controls="opts" aria-expanded="false" aria-label="Options">${svg(ICON.opts)}</button></div>
    <p id="size" hidden aria-live="polite"></p>
    <p id="hint" role="status" aria-live="polite"></p>
    <div id="toast" aria-live="polite"></div>
    <div id="bottom">
      <div class="b-left"><img src="/activated-merch/media/ar/activated-by.webp" alt="Activated by MEDIALIFE" width="102" height="40"></div>
      <div id="act">
        <button id="b-place" class="primary" hidden disabled>${copy.place}</button>
        <span id="rec-time" hidden>0:00</span>
        <button id="b-shutter" hidden aria-label="Take a photo. Press and hold to film"><svg viewBox="0 0 72 72" aria-hidden="true"><circle class="ring" cx="36" cy="36" r="33"/><circle id="rec-prog" class="prog" cx="36" cy="36" r="33"/></svg><i></i></button>
      </div>
      <div class="b-right"><button id="b-move" class="tool" type="button" hidden aria-label="Move the door (your world stays as it is)">${svg(ICON.move)}<span>Move</span></button></div>
    </div>
    <pre id="diagp" hidden aria-hidden="true"></pre>
  </div>
  <div id="wipe" aria-hidden="true">${(cfg.door.colors || []).concat(['#fff']).slice(0, 3).map((c, i) => `<i style="--c:${c};--dl:${i * 0.09}s"></i>`).join('')}</div>
  <div id="opts" hidden role="dialog" aria-modal="true" aria-labelledby="opts-t">
    <div class="scrim" data-close></div>
    <div class="panel">
      <div class="grab" aria-hidden="true"></div>
      <header><h2 id="opts-t">Options</h2><button type="button" class="x" data-close aria-label="Close options">${svg(ICON.x, 2.4)}</button></header>
      <button type="button" class="opt" id="o-sound" role="switch" aria-checked="true"><span class="oi">${svg(ICON.sound)}</span><span class="ol"><b>Sound</b><small>${cfg.soundLabel || 'Music and effects inside the world'}</small></span><i class="sw" aria-hidden="true"></i></button>
      <button type="button" class="opt" id="o-move"><span class="oi">${svg(ICON.move)}</span><span class="ol"><b>Move the door</b><small>Put it somewhere else. Your world stays as it is</small></span><i class="go" aria-hidden="true"></i></button>
      <button type="button" class="opt" id="o-how"><span class="oi">${svg(ICON.how)}</span><span class="ol"><b>How it works</b><small>${cfg.howLabel || 'Placing the door and walking in'}</small></span><i class="go" aria-hidden="true"></i></button>
      ${(cfg.links || []).map((l) => `<a class="opt" href="${l.href}" target="_blank" rel="noopener"><span class="oi">${svg(ICON.link)}</span><span class="ol"><b>${l.title}</b><small>${l.sub || ''}</small></span><i class="go" aria-hidden="true"></i></a>`).join('')}
      <a class="opt small" href="${cfg.licencesUrl || '/evade/licences/'}" target="_blank" rel="noopener"><span class="ol"><b>Licences</b></span></a>
    </div>
  </div>
  <div id="how" class="sheet-wrap" hidden role="dialog" aria-labelledby="how-t"><div class="sheet">
    <h2 id="how-t">${cfg.howTitle || 'How it works'}</h2>
    <ol class="how-steps">${(cfg.howSteps || []).map((s) => `<li>${s}</li>`).join('')}</ol>
    <p class="small">Give yourself about 2 metres of clear floor. Watch where you walk: the world is digital, the furniture isn't.</p>
    <button id="b-go" class="primary">Got it</button>
  </div></div>
  <div id="shot" class="sheet-wrap" hidden role="dialog" aria-labelledby="shot-t"><div class="sheet">
    <h2 id="shot-t">Your photo</h2><img id="shot-img" alt="Your photo">
    <div class="row"><button id="shot-share" class="primary" hidden>Share</button><a id="shot-save" class="btn" hidden>Save</a><button id="shot-close">Back</button></div>
  </div></div>
  <div id="fin" class="sheet-wrap" hidden role="dialog" aria-labelledby="fin-t"><div class="sheet" id="fin-body"></div></div>
  <div id="error" class="sheet-wrap" hidden role="alert"><div class="sheet">
    <h2 id="err-title">Something went wrong</h2><p id="err-body"></p><div id="err-qr" hidden></div>
    <button id="err-retry" class="primary">Try again</button>
  </div></div>
  <div id="flashw" aria-hidden="true"></div>`);

  const canvas = $('cam');
  const splash = $('splash');
  const startBtn = $('b-start');

  // ---------------------------------------------------------------- sound (WebAudio, made here, no files)
  const sound = {
    ctx: null, master: null, music: null, on: store.get('sound', '1') === '1',
    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext; this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(this.ctx.destination);
        this.music = this.ctx.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      } catch (e) { this.ctx = null; }
    },
    setOn(v) { this.on = v; store.set('sound', v ? '1' : '0'); if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05); },
    tone(f, d = 0.25, type = 'sine', vol = 0.18, when = 0, slide = 0) {
      const c = this.ctx; if (!c) return; const t = c.currentTime + when;
      const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
    },
    noise(d = 0.3, freq = 1200, vol = 0.2, when = 0, q = 0.8, sweep = 0) {
      const c = this.ctx; if (!c) return; const t = c.currentTime + when;
      const len = Math.ceil(c.sampleRate * d), b = c.createBuffer(1, len, c.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + d);
      const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + d + 0.05);
    },
    chord(fs, d = 0.6, type = 'triangle', vol = 0.08, gap = 0.06) { fs.forEach((f, i) => this.tone(f, d, type, vol, i * gap)); },
    whoosh() { this.noise(0.7, 300, 0.35, 0, 0.7, 8); this.tone(180, 0.6, 'sine', 0.12, 0, 3); },
    click() { this.tone(900, 0.05, 'square', 0.04); },
    shutter() { this.noise(0.08, 3000, 0.25); this.tone(1400, 0.05, 'square', 0.05, 0.03); },
    // a slow pad inside the world (fades with the inside state)
    pad(freqs, type = 'sine', vol = 0.05) {
      const c = this.ctx; if (!c) return;
      for (const f of freqs) {
        const o = c.createOscillator(), g = c.createGain(), l = c.createOscillator(), lg = c.createGain();
        o.type = type; o.frequency.value = f; g.gain.value = vol; l.frequency.value = 0.1 + Math.random() * 0.2; lg.gain.value = vol * 0.6;
        l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(this.music); o.start(); l.start();
      }
    },
    musicLevel(v, t = 0.8) { if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, t / 3); },
  };
  addEventListener('pointerdown', () => sound.ctx && sound.ctx.state === 'suspended' && sound.ctx.resume().catch(() => {}), { capture: true });

  // ---------------------------------------------------------------- small UI helpers
  let hintText = '';
  function hint(t) { t = t || ''; if (t !== hintText) { hintText = t; $('hint').textContent = t; } }
  let toastT = 0;
  function toast(title, small) {
    const el = $('toast'); el.innerHTML = ''; el.append(title); if (small) { const s = document.createElement('small'); s.textContent = small; el.append(s); }
    el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1700);
  }
  function setCounter(label, n, total) {
    const el = $('count'); el.hidden = false; $('count-l').textContent = label;
    const pips = $('pips'); if (pips.children.length !== total) pips.innerHTML = '<i></i>'.repeat(total);
    [...pips.children].forEach((p, i) => p.classList.toggle('on', i < n));
    el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 260);
  }
  function wipe() { if (REDUCED) return; const w = $('wipe'); w.classList.remove('on'); void w.offsetWidth; w.classList.add('on'); }
  function finale(html) { $('fin-body').innerHTML = html; $('fin').hidden = false; const b = $('fin-body').querySelector('[data-close]'); if (b) { b.onclick = () => { $('fin').hidden = true; }; b.focus(); } }
  function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; diag.errors.push(`${title}: ${body}`.slice(0, 200)); }
  $('err-retry').onclick = () => location.reload();
  function qrInto(el) {
    try { window.QRCode && QRCode.toString(location.href.replace(/[?&](test|desktop|nolog)\b[^&]*/g, ''), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, s) => { if (!err) { el.innerHTML = s; el.hidden = false; } }); } catch (e) { /* no QR */ }
  }
  function openOnPhone() {
    showError('Open this on your phone', `${cfg.title} needs your phone's camera and motion sensors to put the door on your floor. Scan this to open it there.`);
    qrInto($('err-qr'));
    $('err-retry').textContent = 'Close';
    $('err-retry').onclick = () => { $('error').hidden = true; started = false; startBtn.disabled = false; startBtn.textContent = 'Start'; };
  }

  // options
  const optsEl = $('opts');
  const openOpts = () => { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); };
  const closeOpts = () => { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); };
  $('b-opts').onclick = openOpts;
  optsEl.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeOpts));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeOpts(); $('how').hidden = true; $('shot').hidden = true; } });
  const sBtn = $('o-sound'); sBtn.setAttribute('aria-checked', String(sound.on));
  sBtn.onclick = () => { sound.setOn(!sound.on); sBtn.setAttribute('aria-checked', String(sound.on)); sound.click(); };
  $('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
  $('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
  $('o-move').onclick = () => { closeOpts(); if (placedOnce) pickUp(); };

  // ---------------------------------------------------------------- loading (Start waits for the engine + the world's assets)
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const xrReady = new Promise((res) => (window.XR8 ? res() : addEventListener('xrloaded', res, { once: true })));
  const assets = Promise.resolve(cfg.preload ? cfg.preload(loader) : null);
  let loaded = false, started = false;
  Promise.all([xrReady, assets]).then(() => { loaded = true; startBtn.disabled = false; startBtn.textContent = 'Start'; splash.classList.add('ready'); })
    .catch((e) => showError('Couldn\'t load the experience', String((e && e.message) || e)));
  setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);
  if (!PHONE && !params.has('desktop')) { $('desk').hidden = false; qrInto($('qr')); }

  // ---------------------------------------------------------------- the scene
  let scene, camera, renderer, portal, world = {}, reticle, built = false;
  const ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const CAM_H = 1.3;           // camera start height: responsive scale, ~1 unit = 1 m on a floor
  const [SIZE_MIN, SIZE_MAX] = cfg.sizeRange || [0.6, 1.4];
  let size = clamp(+store.get('size', cfg.defaultSize || 1) || 1, SIZE_MIN, SIZE_MAX);
  let mode = 'find', placedOnce = false, aimOk = false, everInside = false, enters = 0;
  const tappables = [];
  const ctx = {
    THREE, loader, sound, hint, toast, setCounter, finale, buzz, store, post: postEvent, reduced: REDUCED,
    tappables, get portal() { return portal; }, get world() { return portal.world; }, get scene() { return scene; }, get camera() { return camera; },
    get renderer() { return renderer; }, get inside() { return portal && portal.inside; }, get size() { return size; },
    register: (o) => portal.register(o),
    cameraLocal: () => portal.camLocal,
  };

  async function buildScene(xr) {
    ({ scene, camera, renderer } = xr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.6;
    camera.near = 0.02; camera.updateProjectionMatrix();
    camera.position.set(0, CAM_H, 0); camera.quaternion.identity();
    XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });

    // floor reticle: the door's footprint
    reticle = new THREE.Group();
    const rm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 48), rm); ring.rotation.x = -Math.PI / 2;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(cfg.door.width || 1, 0.05), rm); bar.rotation.x = -Math.PI / 2;
    const arrow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 3), rm); arrow.rotation.x = -Math.PI / 2; arrow.rotation.z = -Math.PI / 2; arrow.position.z = 0.3;
    reticle.add(ring, bar, arrow); reticle.visible = false; scene.add(reticle);

    portal = new Portal({ renderer, ...cfg.door });
    portal.group.visible = false;
    portal.onCross = (inside) => {
      wipe(); sound.whoosh(); buzz(inside ? [30, 40, 60] : 30);
      sound.musicLevel(inside ? 1 : 0.15);
      if (inside) { enters++; everInside = true; hint(copy.inside); world.onEnter && world.onEnter(enters); postEvent('play', { what: 'enter', n: enters }); if (cfg.doneFlag) try { localStorage.setItem(cfg.doneFlag, '1'); } catch (e) { /* none */ } }
      else { hint(copy.back); world.onExit && world.onExit(); }
      diag.steps.push([inside ? 'in' : 'out', Math.round(performance.now())]);
    };
    scene.add(portal.group);
    world = (await cfg.build(ctx)) || {};
    portal.register();
  }

  // ---------------------------------------------------------------- placing and moving the door
  function setMode(m) {
    mode = m; $('hud').dataset.mode = m;
    $('b-place').hidden = !(m === 'find' || m === 'aim');
    $('b-shutter').hidden = !(m === 'open');
    $('b-move').hidden = !placedOnce || m !== 'open';
    $('size').hidden = m !== 'aim';
    diag.steps.push([m, Math.round(performance.now())]);
  }
  const centre = new THREE.Vector2(0, 0);
  function tickAim(dt) {
    ray.setFromCamera(centre, camera);
    let ok = false;
    if (ray.ray.intersectPlane(floor, hit)) { const d = Math.hypot(hit.x - camera.position.x, hit.z - camera.position.z); ok = d > 0.5 && d < 7; }
    if (testFloor) ok = true, hit.copy(testFloor);
    const g = portal.group;
    if (ok) {
      const first = !g.visible;
      g.position.lerp(hit, first ? 1 : 1 - Math.exp(-14 * dt));
      g.rotation.y = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
      g.visible = true;
      reticle.position.copy(g.position).setY(0.003); reticle.rotation.y = g.rotation.y; reticle.scale.setScalar(size);
    }
    reticle.visible = ok;
    g.scale.setScalar(size);
    if (ok !== aimOk) { aimOk = ok; $('b-place').disabled = !ok; }
    if (mode === 'find' && ok) setMode('aim');
    hint(ok ? copy.aim : copy.findFloor);
    const label = `Door ${(cfg.door.height * size).toFixed(1)} m tall`; if ($('size').textContent !== label) $('size').textContent = label;
  }
  function place() {
    if (!aimOk) return;
    reticle.visible = false; portal.openTarget = 1; store.set('size', size.toFixed(2));
    sound.chord(cfg.openChord || [262, 330, 392, 523], 0.9, 'triangle', 0.09, 0.08); sound.noise(1.2, 500, 0.15, 0.1, 0.6, 4); buzz([20, 40, 20]);
    const first = !placedOnce; placedOnce = true; setMode('open');
    hint(copy.walkIn);
    if (first) { world.onPlaced && world.onPlaced(); postEvent('scan', { what: 'placed', size: +size.toFixed(2) }); }
  }
  function pickUp() {
    if (portal.inside) portal.setInside(false);
    portal.openTarget = 0; setMode('aim'); aimOk = false; $('b-place').disabled = true; sound.click();
    $('b-place').textContent = 'Put the door here';
  }
  $('b-place').onclick = place;
  $('b-move').onclick = pickUp;

  // pinch to size while aiming
  const touches = new Map(); let pinch0 = null, down = null;
  canvas.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, e);
    if (touches.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (touches.size === 2 && mode === 'aim') { const [a, b] = [...touches.values()]; pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), size }; down = null; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, e);
    if (pinch0 && touches.size === 2) { const [a, b] = [...touches.values()]; size = clamp(pinch0.size * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(20, pinch0.d), SIZE_MIN, SIZE_MAX); }
  });
  const endTouch = (e) => {
    const t = touches.get(e.pointerId); touches.delete(e.pointerId);
    if (touches.size < 2) pinch0 = null;
    if (e.type === 'pointerup' && down && t && touches.size === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 14 && performance.now() - down.t < 500) tapAt(e.clientX, e.clientY);
    if (touches.size === 0) down = null;
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  // ---------------------------------------------------------------- taps on things in the world
  const ndc = new THREE.Vector2();
  function tapAt(x, y) {
    if (!built || mode !== 'open') return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(tappables.filter((o) => o.visible !== false), true);
    for (const h of hits) {
      // outside, only things seen through the opening count (the rest is hidden behind the wall)
      if (!portal.inside && portal.world.worldToLocal(h.point.clone()).z > 0.01 && !h.object.userData.roomSide) continue;
      if (!portal.inside && !h.object.userData.roomSide && !throughOpening(h.point)) continue;
      let o = h.object; while (o && !o.userData.tap) o = o.parent;
      if (o) { o.userData.tap(h, o); diag.taps++; return; }
    }
    world.onTapNothing && world.onTapNothing(ray);
  }
  const _a = new THREE.Vector3();
  function throughOpening(p) {      // does the line from the camera to p pass through the door opening?
    const g = portal.group; const c = g.worldToLocal(camera.getWorldPosition(new THREE.Vector3())); const q = g.worldToLocal(_a.copy(p));
    if (c.z <= 0 || q.z >= 0) return true;
    const k = c.z / (c.z - q.z); const x = c.x + (q.x - c.x) * k, y = c.y + (q.y - c.y) * k;
    return Math.abs(x) < portal.W / 2 && y > 0 && y < portal.H;
  }

  // ---------------------------------------------------------------- the frame loop
  let lastTrack = '', limitedSince = 0, testFloor = null;
  const clock = { t: 0 };
  function tick(dt) {
    clock.t += dt;
    if (mode === 'find' || mode === 'aim') tickAim(dt);
    const lp = portal.update(dt, camera, clock.t);
    if (mode === 'open' && !portal.inside) {
      if (portal.open > 0.9 && portal.near > 0.75) hint(copy.step);
      else if (hintText === copy.step) hint(everInside ? copy.back : copy.walkIn);
    }
    world.tick && world.tick(dt, clock.t, lp);
    if (lastTrack === 'LIMITED') { if (!limitedSince) limitedSince = performance.now(); if (performance.now() - limitedSince > 1500) hint('Move your phone slowly so it can see the room again'); }
    else limitedSince = 0;
  }

  // ---------------------------------------------------------------- 8th Wall pipeline
  const DPR = clamp(+params.get('dpr') || 1.5, 1, 3);
  function sizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  let last = 0, camStartAt = 0;
  const appModule = () => ({
    name: cfg.id,
    onStart: () => {
      buildScene(XR8.Threejs.xrScene()).then(() => { built = true; $('hud').hidden = false; setMode('find'); hint(copy.findFloor); })
        .catch((e) => { console.error(e); showError('Couldn\'t start', String((e && e.message) || e)); });
    },
    onUpdate: ({ processCpuResult }) => {
      const now = performance.now(), dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
      const r = processCpuResult && processCpuResult.reality; if (r && r.trackingStatus) noteTracking(r.trackingStatus, r.trackingReason);
      if (built) { tick(dt); diag.fpsN++; }
      recTick(); flushDiag(false);
      if (SHOW_DIAG && now - (diag.drawAt || 0) > 500) drawDiag(now);
    },
    onCameraStatusChange: ({ status }) => {
      diag.steps.push(['cam:' + status, Math.round(performance.now())]);
      if (status === 'hasVideo') {
        camStartAt = performance.now();
        splash.classList.add('gone'); setTimeout(() => { splash.hidden = true; }, 650);
        if (store.get('how', '0') !== '1') { $('how').hidden = false; }
      }
      if (status === 'requesting') hint('Allow camera and motion access to begin');
      if (status === 'failed') camFailed('failed');
    },
    onException: (e) => {
      const msg = (e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : String(e));
      diag.errors.push('XR: ' + msg.slice(0, 200)); flushDiag(true, true);
      if (e && e.type === 'permission') return showError('Motion access is needed', `${cfg.title} uses your phone's motion sensors to keep the door on your floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.`);
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
  function start() {
    if (!loaded || started) return; started = true;
    startBtn.disabled = true; startBtn.textContent = 'Starting…';
    sound.init();
    if (!PHONE && !params.has('desktop')) return openOnPhone();
    sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
    XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' });
    XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), XR8.CanvasScreenshot.pipelineModule(), appModule()]);
    setTimeout(() => { if (!camStartAt) camFailed('no video after 15 s'); }, 15000);
    XR8.run({ canvas, allowedDevices: params.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS, cameraConfig: { direction: XR8.XrConfig.camera().BACK }, verbose: params.has('verbose') });
  }
  startBtn.onclick = () => { askMotion(); if (params.has('preview')) return previewRun(); start(); };
  // ?preview (team QA only, never linked): no camera, our own renderer and a camera we can move, to check the world
  function previewRun() {
    if (started) return; started = true; sound.init();
    sizeCanvas();
    const r = new THREE.WebGLRenderer({ canvas, antialias: true }); r.setClearColor('#3a3f47'); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight, false);
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.02, 200);
    cam.position.set(0, CAM_H, 2.4); cam.lookAt(0, 1.1, 0); sc.add(cam);
    window.XR8 = window.XR8 || {}; const real = window.XR8.XrController;
    window.XR8.XrController = Object.assign({}, real, { updateCameraProjectionMatrix() {} });
    const preview = { cam, set(x, y, z, yaw = 0, pitch = 0) { cam.position.set(x, y, z); cam.rotation.set(THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'YXZ'); } };
    window.__preview = preview;
    buildScene({ scene: sc, camera: cam, renderer: r }).then(() => {
      cam.position.set(0, CAM_H, 2.4); cam.lookAt(0, 1.1, 0);
      built = true; camStartAt = performance.now(); splash.hidden = true; $('hud').hidden = false; setMode('find');
      testFloor = new THREE.Vector3(0, 0, 0);
      let lt = performance.now();
      r.setAnimationLoop(() => { const now = performance.now(), dt = Math.min((now - lt) / 1000, 0.05); lt = now; tick(dt); r.render(sc, cam); });
    }).catch((e) => { console.error(e); showError('Preview failed', String(e && e.message || e)); });
  }
  function camFailed(why) {
    if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true);
    showError('The camera didn\'t start', 'Allow camera and motion access for this site, and close the Camera app or other tabs that use the camera, then tap Try again.');
  }

  // ---------------------------------------------------------------- photo + video (the Cola Run recorder)
  const LOGO = { brand: new Image(), act: new Image() };
  LOGO.brand.src = cfg.watermarkLogo || cfg.brandLogo; LOGO.act.src = '/activated-merch/media/ar/activated-by.webp';
  function drawWatermark(c, Wd, Hd) {
    const u = Math.min(Wd, Hd) / 720, pad = 26 * u;
    if (LOGO.brand.complete && LOGO.brand.naturalWidth) { const h = 40 * u, w = h * LOGO.brand.naturalWidth / LOGO.brand.naturalHeight; c.drawImage(LOGO.brand, pad, pad, w, h); }
    if (LOGO.act.complete && LOGO.act.naturalWidth) { const h = 50 * u, w = h * LOGO.act.naturalWidth / LOGO.act.naturalHeight; c.drawImage(LOGO.act, Wd - pad - w, Hd - pad - h, w, h); }
  }
  let capture = null, recFrom = 0, shots = 0;
  try {
    capture = new ColaCapture({
      canvas, host: document.body, endpoint: location.origin, globeUrl: cfg.capture.globeUrl || '/evade/where-is-bobo/', source: cfg.source || cfg.id, audioContext: null,
      connectAudio: (dest) => { const m = sound.master; if (!m) return () => {}; m.connect(dest); return () => { try { m.disconnect(dest); } catch (e) { /* gone */ } }; },
      overlay: (c, Wd, Hd) => drawWatermark(c, Wd, Hd),
      on: (name) => { if (name === 'recordStart') { buzz(25); recUi(true); } if (name === 'recordStop' || name === 'error') recUi(false); if (name === 'sent') postEvent('capture', { what: 'clip' }); },
    });
    Object.assign(capture.settings, { corner: 'topRight', offsetX: -5, offsetY: -6, maxSeconds: 30, backLabel: 'Back to the portal' }, cfg.capture);
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
      const file = new File([blob], `${cfg.capture.filePrefix || cfg.id}-${++shots}.jpg`, { type: 'image/jpeg' }), url = URL.createObjectURL(blob);
      $('shot-img').src = url; $('shot-save').href = url; $('shot-save').download = file.name; $('shot-save').hidden = false;
      const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
      $('shot-share').hidden = !canShare; $('shot-share').onclick = () => navigator.share({ files: [file], title: cfg.title }).catch(() => {});
      $('shot').hidden = false;
      postEvent('share', { what: 'photo', inside: !!(portal && portal.inside) });
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
    if (holding) { holding = false; clearTimeout(holdT); takePhoto(); }
  });
  sh.addEventListener('pointercancel', () => { holding = false; clearTimeout(holdT); if (capture && capture.status === 'recording') capture.stop(); });

  // ---------------------------------------------------------------- platform events (only when the experience has a source)
  let SID = store.get('sid', ''); if (!SID) { SID = cfg.id.slice(0, 3) + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); store.set('sid', SID); }
  function postEvent(type, props) {
    if (!cfg.source || params.has('nolog')) return;
    try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: cfg.source, sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
  }

  // ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
  const diag = { page: cfg.id, sid: SID, taps: 0, fpsN: 0, errors: [], steps: [], tracking: [], note: params.get('note') || '' };
  let flushAt = 0;
  function flushDiag(force, always = false) {
    const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
    if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
    const body = JSON.stringify({ ...diag, mode, inside: !!(portal && portal.inside), enters, size: +size.toFixed(2), world: world.stats ? world.stats() : null, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent });
    try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
  }
  addEventListener('pagehide', () => flushDiag(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
  addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });
  function drawDiag(now) {
    diag.drawAt = now; const el = $('diagp'); el.hidden = false;
    const fps = camStartAt ? diag.fpsN / Math.max((now - camStartAt) / 1000, 1) : 0;
    const lp = portal && portal.camLocal;
    el.textContent = `${mode} · track ${lastTrack || '-'} · fps ${fps.toFixed(0)} · ${portal && portal.inside ? 'INSIDE' : 'outside'}` + (lp ? ` · cam ${lp.x.toFixed(2)},${lp.y.toFixed(2)},${lp.z.toFixed(2)}` : '') + (world.stats ? '\n' + JSON.stringify(world.stats()) : '') + (diag.errors.length ? `\nerr: ${diag.errors.slice(-1)[0].slice(0, 70)}` : '');
  }

  // automated tests (?test): place the door, step in and out without walking
  if (params.has('test')) window.__portal = {
    get mode() { return mode; }, get inside() { return portal && portal.inside; }, get open() { return portal && portal.open; }, diag, ctx, get world() { return world; },
    floorAt(dx, dz) { const v = new THREE.Vector3(); camera.getWorldDirection(v); v.y = 0; v.normalize(); testFloor = new THREE.Vector3(camera.position.x + v.x * dz - v.z * dx, 0, camera.position.z + v.z * dz + v.x * dx); },
    place() { place(); testFloor = null; }, move: pickUp,
    // put the door so the camera stands `back` metres inside the world, looking in (no walking in a simulator)
    enter(back = 1.5) {
      const g = portal.group, v = new THREE.Vector3(); camera.getWorldDirection(v); v.y = 0; v.normalize();
      g.position.set(camera.position.x - v.x * back, 0, camera.position.z - v.z * back); g.rotation.y = Math.atan2(-v.x, -v.z);
      g.updateMatrixWorld(true); portal.wasOutside = false; portal.setInside(true);
    },
    exit() { portal.setInside(false); portal.wasOutside = true; },
    tapAt, tapObject(name) { const o = scene.getObjectByName(name); if (!o) return false; let p = o; while (p && !p.userData.tap) p = p.parent; if (!p) return false; p.userData.tap({ point: o.getWorldPosition(new THREE.Vector3()), object: o }, p); return true; },
    camera: () => camera, scene: () => scene,
  };
}
