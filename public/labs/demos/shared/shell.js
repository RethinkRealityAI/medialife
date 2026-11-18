// MEDIALIFE Labs tech demos: the one shared shell.
//
// Every demo page is: a tiny index.html (engine <script>, import map, <div id="app">) + main.js that calls
// createDemo({...}). The shell owns everything that is the same in every demo, copied from the live pages:
//   splash (Bobo Hoops / Spray Bobo Street): wordmark, live 3D hero (or flat SVG), title, lead, Start disabled
//     "Loading…" until ready, loading bar, "Activated by MEDIALIFE"; computers see a QR on the splash and get the
//     open-on-phone sheet on Start (openOnPhone(), Spray Bobo Street). `?desktop` skips it (simulator).
//   engine boot (Cola Run World): world = 8th Wall engine binary (SLAM, responsive scale, camera at CAM_H) with the
//     back camera; face = the vendored MIT engine's face chunk with the front camera (Bobo Booth). Canvas drawing
//     size set to the screen (pitfall: 300x150 stretched camera). Motion permission asked inside the Start tap.
//   placement: reticle on the floor (y = 0) under the screen's aim point; the demo's `stage` follows it until Place
//     (button or a tap), then the Move button (bottom right, always on screen once placed) picks the stage up again
//     with everything on it as it is (house rule: moving keeps state).
//   HUD: wordmark + tag top left, menu top right (How it works, Restart, More demos, Licences -> /evade/licences/),
//     hint pill, toast, bottom dock (demo panel, action button, bar with the shutter bottom centre).
//   photo: XR8.CanvasScreenshot + MEDIALIFE marks, share/save sheet.
// No 8th Wall / Niantic names are shown to users: licences only behind the menu's Licences link.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.THREE = THREE; // XR8.Threejs.pipelineModule() looks for a global THREE
export { THREE };

export const $ = (id) => document.getElementById(id);
export const qs = new URLSearchParams(location.search);
// a phone by device, not by touch (touchscreen laptops pass a touch check, then the engine binary fails)
export const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const clamp = THREE.MathUtils.clamp;
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
export const backOut = (x) => { const c = 1.7; x = clamp(x, 0, 1) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
export const MEDIA = '/labs/demos/media/';
export const CAM_H = 1.3; // camera start height: with responsive scale 1 unit is about 1 m on a floor

const DIAG = qs.has('diag');
const ICONS = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  move: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
export function loadGLB(url) { return loader.loadAsync(url); }
export function texture(url, srgb = true) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, rej));
}
// scale an object to a height and stand it on y = 0, centred on x/z
export function fitTo(obj, height, { centre = true } = {}) {
  obj.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(obj);
  obj.scale.multiplyScalar(height / Math.max(1e-4, b.max.y - b.min.y));
  obj.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(obj);
  const c = b.getCenter(new THREE.Vector3());
  if (centre) { obj.position.x -= c.x; obj.position.z -= c.z; }
  obj.position.y -= b.min.y;
  return obj;
}
// a soft contact shadow: ONE colour (black) with an alpha falloff computed per pixel (no gradient API, house rule)
let shadowTex = null;
export function contactShadow(radius = 0.3, opacity = 0.35) {
  if (!shadowTex) {
    const n = 64, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = d >= 1 ? 0 : Math.pow(1 - d * d, 1.6);
      img.data.set([0, 0, 0, Math.round(a * 255)], (y * n + x) * 4);
    }
    g.putImageData(img, 0, 0); shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = -1;
  return m;
}

// ---------------------------------------------------------------- DOM
function buildDom(cfg) {
  const app = document.createElement('div');
  app.innerHTML = `
  <canvas id="cam" aria-label="Camera view"></canvas>
  <section id="splash" aria-labelledby="title">
    <img class="brand" src="/brand/medialife-wordmark.webp" alt="MEDIALIFE" width="420" height="70">
    <div class="hero" aria-hidden="true"><div class="disc"></div>${cfg.heroSvg || ''}<canvas id="hero-c"></canvas></div>
    <div class="copy">
      <p class="kicker">${cfg.kicker || 'MEDIALIFE Labs · Tech demo'}</p>
      <h1 id="title">${cfg.titleHtml || cfg.title}</h1>
      <p class="lead">${cfg.lead}</p>
      <div id="desk" hidden>
        <div class="qr" id="qr-splash" aria-label="QR code that opens this page on your phone"></div>
        <p><b>Made for your phone.</b> ${cfg.mode === 'face' ? 'It works best with your phone\'s selfie camera.' : 'It needs your phone\'s camera and motion sensors to find your floor.'} Scan to open it there.</p>
      </div>
      <button id="b-start" class="primary" disabled>Loading…</button>
      <div id="load" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><i></i></div>
      <img class="act-by" src="/activated-merch/media/ar/activated-by.webp" alt="Activated by MEDIALIFE" width="148" height="58">
    </div>
  </section>
  <div id="hud" hidden>
    <div class="tl"><img src="/brand/medialife-wordmark.webp" alt="MEDIALIFE" width="96" height="16"><span class="tag">${cfg.tag || 'Labs'}</span></div>
    <div id="side"><button id="b-menu" class="ib" aria-haspopup="dialog" aria-controls="menu" aria-label="Menu">${ICONS.menu}</button></div>
    <p id="hint" role="status" aria-live="polite"></p>
    <div id="toast" aria-hidden="true"></div>
    <div id="dock">
      <div id="panel"></div>
      <button id="b-act" class="primary" type="button" hidden>Place here</button>
      <div id="bar"><div class="b-left"></div><div class="b-mid"></div><div class="b-right"></div></div>
    </div>
    <pre id="diagp" hidden aria-hidden="true"></pre>
  </div>
  <div id="menu" class="sheet-wrap" hidden role="dialog" aria-modal="true" aria-labelledby="menu-t">
    <div class="sheet">
      <h2 id="menu-t">${cfg.title.replace(/<[^>]+>/g, '')}</h2>
      <button type="button" class="mi" id="m-how">How it works<span aria-hidden="true">›</span></button>
      <button type="button" class="mi" id="m-restart">Start again<span aria-hidden="true">↺</span></button>
      <a class="mi" href="/labs/">More demos<span aria-hidden="true">›</span></a>
      <a class="mi small" href="/evade/licences/" target="_blank" rel="noopener">Licences</a>
      <button type="button" class="primary" id="m-close">Back</button>
    </div>
  </div>
  <div id="how" class="sheet-wrap" hidden role="dialog" aria-labelledby="how-t">
    <div class="sheet">
      <h2 id="how-t">How it works</h2>
      <ol class="how-steps">${(cfg.how || []).map((s) => `<li>${s}</li>`).join('')}</ol>
      <button id="how-go" class="primary">Got it</button>
    </div>
  </div>
  <div id="shot" class="sheet-wrap" hidden role="dialog" aria-labelledby="shot-t">
    <div class="sheet">
      <h2 id="shot-t">Your photo</h2>
      <img id="shot-img" alt="Your photo">
      <div class="row"><button id="shot-share" class="primary" hidden>Share</button><a id="shot-save" class="btn primary" hidden download="medialife-labs.jpg">Save</a><button id="shot-close">Back to camera</button></div>
    </div>
  </div>
  <div id="error" class="sheet-wrap" hidden role="alert">
    <div class="sheet">
      <h2 id="err-title">Something went wrong</h2>
      <p id="err-body"></p>
      <div id="qr" class="qr" hidden aria-label="QR code that opens this page on your phone"></div>
      <button id="err-retry" class="primary">Try again</button>
    </div>
  </div>
  <div id="flashw" aria-hidden="true"></div>`;
  while (app.firstChild) document.body.appendChild(app.firstChild);
}

function qrInto(el) {
  try {
    const url = location.href.replace(/[?&](test|desktop|diag)\b[^&]*/g, '');
    window.QRCode && QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) { el.innerHTML = svg; el.hidden = false; } });
  } catch (e) { /* no QR */ }
}

// ---------------------------------------------------------------- the demo
export function createDemo(cfg) {
  buildDom(cfg);
  const mode = cfg.mode || 'world';
  const canvas = $('cam');
  const demo = {
    cfg, mode, canvas, THREE,
    scene: null, camera: null, renderer: null,
    stage: new THREE.Group(), // world: everything placed together lives here (moved by Move)
    reticle: new THREE.Group(),
    state: 'splash',          // splash -> starting -> placing -> placed (world) | live (face)
    tracking: '-',
    aimNdc: new THREE.Vector2(0, -0.2),
    size: cfg.size ? cfg.size[2] : 1,
    panel: $('panel'), act: $('b-act'),
    left: document.querySelector('#bar .b-left'), mid: document.querySelector('#bar .b-mid'), right: document.querySelector('#bar .b-right'),
    hint, toast, showError, loadGLB, texture, progress, diag: { errors: [], steps: [], fps: 0 },
    floorHit, ndcFromEvent, place, startMove, takePhoto, flash, sun: null,
  };
  window.__demo = demo;
  demo.stage.visible = false;

  // ---------- splash: QR on computers, loading progress
  if (!PHONE && !qs.has('desktop') && mode === 'world') { $('desk').hidden = false; qrInto($('qr-splash')); }
  let loadP = 0;
  function progress(f) { loadP = Math.max(loadP, clamp(f, 0, 1)); $('load').firstElementChild.style.width = (loadP * 100).toFixed(0) + '%'; $('load').setAttribute('aria-valuenow', Math.round(loadP * 100)); }
  progress(0.08);

  // ---------- hint / toast / errors
  let hintText = '';
  function hint(t) { t = t || ''; if (t !== hintText) { hintText = t; $('hint').textContent = t; } }
  let toastT = 0;
  function toast(t, ms = 1400) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms); }
  function showError(title, body) {
    $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false;
    demo.diag.errors.push(`${title}: ${body}`.slice(0, 200));
  }
  $('err-retry').onclick = () => location.reload();
  function openOnPhone() {
    showError('Open this on your phone', mode === 'face'
      ? `${cfg.title.replace(/<[^>]+>/g, '')} works best with your phone's selfie camera. Scan this to open it there.`
      : `${cfg.title.replace(/<[^>]+>/g, '')} needs your phone's camera and motion sensors to find your floor. Scan this to open it there.`);
    qrInto($('qr'));
    $('err-retry').textContent = 'Close';
    $('err-retry').onclick = () => { $('error').hidden = true; started = false; $('b-start').disabled = false; $('b-start').textContent = 'Start'; };
  }

  // ---------- menu
  const openSheet = (id) => { $(id).hidden = false; };
  $('b-menu').onclick = () => openSheet('menu');
  $('m-close').onclick = () => { $('menu').hidden = true; };
  $('menu').addEventListener('click', (e) => { if (e.target.id === 'menu') $('menu').hidden = true; });
  $('m-how').onclick = () => { $('menu').hidden = true; openSheet('how'); };
  $('m-restart').onclick = () => location.reload();
  $('how-go').onclick = () => { $('how').hidden = true; try { localStorage.setItem('labs-how-' + cfg.slug, '1'); } catch (e) { /* none */ } };

  // ---------- hero: a live turntable of the demo's own model, frozen to a still on Start (frees the GPU)
  let hero = null;
  function startHero(obj) {
    const c = $('hero-c');
    try {
      const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping;
      const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      const pm = new THREE.PMREMGenerator(r); sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.8;
      sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4)); const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(2, 4, 3); sc.add(dl);
      const spin = new THREE.Group(); spin.add(obj); sc.add(spin);
      const b = new THREE.Box3().setFromObject(spin), s = b.getSize(new THREE.Vector3()), ctr = b.getCenter(new THREE.Vector3());
      const R = Math.max(s.x, s.y, s.z) * 0.5;
      cam.position.set(ctr.x, ctr.y + R * 0.5, ctr.z + R * 4.1); cam.lookAt(ctr);
      const mixer = obj.userData.mixer || null;
      let last = performance.now(), raf = 0;
      const frame = () => {
        const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
        const w = c.clientWidth, h = c.clientHeight;
        if (w && h && (c.width !== Math.round(w * r.getPixelRatio()) || c.height !== Math.round(h * r.getPixelRatio()))) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
        spin.rotation.y += dt * 0.5; mixer && mixer.update(dt);
        r.render(sc, cam); raf = requestAnimationFrame(frame);
      };
      frame(); c.classList.add('on');
      const svg = document.querySelector('#splash .hero svg.art'); if (svg) svg.style.opacity = '0';
      hero = { stop() { cancelAnimationFrame(raf); try { const img = new Image(); img.className = 'still'; img.src = c.toDataURL('image/png'); c.parentNode.appendChild(img); c.remove(); } catch (e) { /* none */ } r.dispose(); pm.dispose(); } };
    } catch (e) { /* no WebGL on the splash: the flat SVG stays */ }
  }

  // ---------- loading: engine + the demo's assets
  const xrReady = new Promise((res) => (window.XR8 ? res() : addEventListener('xrloaded', res, { once: true })));
  xrReady.then(() => progress(Math.max(loadP, 0.5)));
  let loaded = false, started = false;
  Promise.all([xrReady, Promise.resolve(cfg.load ? cfg.load(demo) : null)]).then(() => {
    loaded = true; progress(1); $('load').classList.add('done');
    if (cfg.hero) { try { const h = cfg.hero(demo); if (h) startHero(h); } catch (e) { console.warn('hero', e); } }
    $('b-start').disabled = false; $('b-start').textContent = 'Start';
  }).catch((e) => showError('Couldn\'t load the demo', String((e && e.message) || e)));
  setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);

  // ---------- canvas drawing size (unsized = stretched blurry 300x150 camera)
  const DPR = clamp(+qs.get('dpr') || 1.5, 1, 3);
  function sizeCanvas() {
    const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // ---------- world helpers
  const ray = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _ndc = new THREE.Vector2();
  function floorHit(ndc, out = new THREE.Vector3(), maxD = 8 * CAM_H) {
    if (!demo.camera) return null;
    rayFrom(ndc);
    if (!ray.ray.intersectPlane(floor, out)) return null;
    const d = out.distanceTo(demo.camera.position);
    return d > 0.2 && d < maxD ? out : null;
  }
  // The engine writes camera.projectionMatrix directly and leaves projectionMatrixInverse stale, so
  // Raycaster.setFromCamera / Vector3.unproject land in the wrong place (off-centre taps went far left in the
  // simulator). Refresh the inverse before every screen -> world ray.
  function rayFrom(ndc) {
    demo.camera.projectionMatrixInverse.copy(demo.camera.projectionMatrix).invert();
    ray.setFromCamera(ndc, demo.camera);
    return ray;
  }
  demo.raycaster = ray; demo.rayFrom = rayFrom;
  function ndcFromEvent(e, out = _ndc) {
    const r = canvas.getBoundingClientRect(); // the canvas's box, not the window
    return out.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  demo.camYaw = () => { const f = new THREE.Vector3(); demo.camera.getWorldDirection(f); return Math.atan2(-f.x, -f.z); };

  // ---------- placement (world, cfg.placement === 'stage' or 'custom')
  const P = cfg.placement === undefined ? 'stage' : cfg.placement;
  const aimHit = new THREE.Vector3();
  let aimOk = false, placedOnce = false;
  function place() {
    if (demo.state !== 'placing' || !aimOk) return false;
    demo.state = 'placed';
    demo.stage.position.copy(aimHit);
    demo.stage.visible = true; demo.reticle.visible = false;
    demo.act.hidden = true; moveBtn.hidden = false;
    hint('');
    const first = !placedOnce; placedOnce = true;
    cfg.onPlaced && cfg.onPlaced(demo, first);
    return true;
  }
  function startMove() {
    if (P === 'custom') { cfg.onMove && cfg.onMove(demo); return; }
    if (demo.state !== 'placed') return;
    demo.state = 'placing';
    demo.act.hidden = false; demo.act.textContent = cfg.placeLabel || 'Place here';
    cfg.onMove && cfg.onMove(demo);
  }
  const moveBtn = document.createElement('button');
  moveBtn.id = 'b-move'; moveBtn.className = 'tool'; moveBtn.type = 'button'; moveBtn.hidden = true;
  moveBtn.setAttribute('aria-label', cfg.moveLabel || 'Move it somewhere else');
  moveBtn.innerHTML = `${ICONS.move}<span>Move</span>`;
  moveBtn.onclick = () => startMove();
  demo.moveBtn = moveBtn;
  demo.act.onclick = () => { if (P === 'stage') place(); };

  function tickPlacement(dt) {
    if (mode !== 'world') return;
    const placing = demo.state === 'placing' || (P === 'custom' && demo.state === 'placed' && cfg.reticleAlways);
    if (!placing) { demo.reticle.visible = false; return; }
    const h = floorHit(demo.aimNdc, aimHit);
    aimOk = !!h;
    if (aimOk) {
      demo.reticle.position.lerp(aimHit, demo.reticle.visible ? 1 - Math.exp(-16 * dt) : 1);
      demo.reticle.position.y = 0.004;
      demo.reticle.scale.setScalar(cfg.reticleSize || 0.25);
      demo.reticle.rotation.y += dt * 0.8;
      if (P === 'stage') {
        if (!demo.stage.visible) demo.stage.position.copy(aimHit);
        demo.stage.position.lerp(aimHit, 1 - Math.exp(-14 * dt));
        demo.stage.rotation.y = Math.atan2(demo.camera.position.x - demo.stage.position.x, demo.camera.position.z - demo.stage.position.z) + (cfg.faceOffset || 0);
        demo.stage.visible = true;
      }
    }
    demo.reticle.visible = aimOk;
    if (P === 'stage') {
      demo.act.disabled = !aimOk;
      hint(aimOk ? (cfg.placeHint || 'Tap Place here, or tap the screen') : 'Point your phone at the floor and move it slowly');
    }
  }
  let limitedSince = 0;

  // pinch to size the stage while placing (cfg.size = [min, max, default])
  const touches = new Map(); let pinch0 = null, tapStart = null;
  canvas.addEventListener('pointerdown', (e) => {
    touches.set(e.pointerId, e);
    tapStart = touches.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    if (touches.size === 2 && cfg.size && demo.state === 'placing') {
      const [a, b] = [...touches.values()];
      pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: demo.size };
    }
    cfg.onPointerDown && cfg.onPointerDown(e, demo);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return; touches.set(e.pointerId, e);
    if (pinch0 && touches.size === 2) {
      const [a, b] = [...touches.values()];
      demo.size = clamp(pinch0.s * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / Math.max(20, pinch0.d), cfg.size[0], cfg.size[1]);
      demo.stage.scale.setScalar(demo.size);
    }
    cfg.onPointerMove && cfg.onPointerMove(e, demo);
  });
  const endTouch = (e) => {
    const had = touches.delete(e.pointerId);
    if (touches.size < 2) pinch0 = null;
    if (had && e.type === 'pointerup' && tapStart && touches.size === 0 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 14 && performance.now() - tapStart.t < 500) onTap(e);
    if (touches.size === 0) tapStart = null;
    cfg.onPointerUp && cfg.onPointerUp(e, demo);
  };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  function onTap(e) {
    const ndc = ndcFromEvent(e, new THREE.Vector2());
    if (cfg.onTap && cfg.onTap(ndc, demo, e)) return;
    if (P === 'stage' && demo.state === 'placing') place();
  }
  demo.tapAt = (x, y) => onTap({ clientX: x, clientY: y }); // test hook

  // ---------- photo (shutter bottom centre unless the layout says otherwise)
  if (cfg.shutter !== false) {
    const sh = document.createElement('button');
    sh.id = 'b-shutter'; sh.type = 'button'; sh.setAttribute('aria-label', 'Take a photo'); sh.innerHTML = '<i></i>';
    sh.onclick = () => takePhoto();
    (cfg.layout === 'joystick' ? demo.right : demo.mid).appendChild(sh);
  }
  (cfg.layout === 'joystick' ? demo.left : demo.right).appendChild(moveBtn);
  const marks = { w: new Image(), a: new Image() };
  marks.w.src = '/brand/medialife-wordmark.webp'; marks.a.src = '/activated-merch/media/ar/activated-by.webp';
  function flash() { const f = $('flashw'); f.style.opacity = '0.85'; setTimeout(() => { f.style.opacity = '0'; }, 90); }
  async function takePhoto() {
    flash();
    try {
      const b64 = await XR8.CanvasScreenshot.takeScreenshot();
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const u = Math.min(c.width, c.height) / 720, pad = 26 * u;
      if (marks.w.naturalWidth) { const h = 22 * u; g.drawImage(marks.w, pad, pad, h * marks.w.naturalWidth / marks.w.naturalHeight, h); }
      if (marks.a.naturalWidth) { const h = 52 * u, w = h * marks.a.naturalWidth / marks.a.naturalHeight; g.drawImage(marks.a, c.width - pad - w, c.height - pad - h, w, h); }
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const url = URL.createObjectURL(blob);
      $('shot-img').src = url; $('shot-save').href = url; $('shot-save').hidden = false;
      const file = new File([blob], 'medialife-labs.jpg', { type: 'image/jpeg' });
      const canShare = navigator.canShare && navigator.canShare({ files: [file] });
      $('shot-share').hidden = !canShare;
      $('shot-share').onclick = () => navigator.share({ files: [file], title: 'MEDIALIFE Labs' }).catch(() => {});
      $('shot').hidden = false;
    } catch (e) { toast('Couldn\'t take the photo'); }
  }
  $('shot-close').onclick = () => { $('shot').hidden = true; };

  // ---------- the scene (inside the engine's three.js scene)
  function buildScene({ scene, camera, renderer }) {
    Object.assign(demo, { scene, camera, renderer });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5048, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(1.5, 4, 2); scene.add(sun); scene.add(sun.target); demo.sun = sun;
    if (mode === 'world') {
      camera.position.set(0, CAM_H, 0);
      camera.quaternion.identity();
      XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
      // reticle: flat ring + dot (accent colour)
      const m = new THREE.MeshBasicMaterial({ color: 0x4fd6e8, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), m);
      const tick = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.62, 48, 1, 0, Math.PI * 0.5), m);
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), m);
      for (const x of [ring, tick, dot]) { x.rotation.x = -Math.PI / 2; demo.reticle.add(x); }
      demo.reticle.visible = false; demo.reticle.renderOrder = 2;
      scene.add(demo.reticle);
      demo.stage.scale.setScalar(demo.size);
      scene.add(demo.stage);
    }
    else { camera.position.set(0, 0, 0); camera.quaternion.identity(); } // face: the camera sits at the origin (Bobo Booth)
    cfg.build && cfg.build(demo);
  }

  // ---------- engine pipeline
  let last = 0, built = false, camStartAt = 0, frames = 0, fpsT = 0;
  const appModule = {
    name: 'labs-demo',
    onStart: () => {
      try { buildScene(XR8.Threejs.xrScene()); built = true; $('hud').hidden = false; }
      catch (e) { console.error(e); showError('Couldn\'t start the demo', String((e && e.message) || e)); }
    },
    onUpdate: ({ processCpuResult }) => {
      const now = performance.now(), dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016); last = now;
      frames++; if (now - fpsT > 1000) { demo.diag.fps = frames * 1000 / (now - fpsT); frames = 0; fpsT = now; drawDiag(); }
      const r = processCpuResult && processCpuResult.reality;
      if (r && r.trackingStatus) demo.tracking = r.trackingStatus;
      if (!built) return;
      if (mode === 'world' && demo.state === 'placed' && demo.tracking === 'LIMITED') { if (!limitedSince) limitedSince = now; } else limitedSince = 0;
      if (limitedSince && now - limitedSince > 1500) hint('Move your phone slowly so it can see the floor again');
      tickPlacement(dt);
      if (demo.sun && mode === 'world') { demo.sun.target.position.copy(demo.stage.position); demo.sun.position.copy(demo.stage.position).add(new THREE.Vector3(1.5, 4, 2)); }
      cfg.update && cfg.update(dt, demo, now);
    },
    onCameraStatusChange: ({ status }) => {
      demo.diag.steps.push('cam:' + status);
      if (status === 'requesting') hint(mode === 'world' ? 'Allow camera and motion access to begin' : 'Allow camera access to begin');
      if (status === 'hasVideo' && camStartAt) { cfg.onResume && cfg.onResume(demo); return; } // XR8.resume(): keep the state
      if (status === 'hasVideo') {
        camStartAt = performance.now();
        $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
        if (mode === 'world' && P === 'stage') { demo.state = 'placing'; demo.act.hidden = false; demo.act.textContent = cfg.placeLabel || 'Place here'; }
        else demo.state = mode === 'world' ? 'placed' : 'live';
        hint('');
        let seen = false; try { seen = localStorage.getItem('labs-how-' + cfg.slug) === '1'; } catch (e) { /* none */ }
        if (!seen && !qs.has('test') && cfg.how && cfg.how.length) $('how').hidden = false;
        cfg.onLive && cfg.onLive(demo);
      }
      if (status === 'failed') camFailed();
    },
    onException: (e) => {
      const msg = String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e));
      demo.diag.errors.push('XR: ' + msg.slice(0, 200));
      if (e && e.type === 'permission') return showError('Motion access is needed', 'This demo uses your phone\'s motion sensors to keep things on your floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.');
      if (/session manager|not supported|unsupported|device/i.test(msg) && !camStartAt) { try { XR8.stop(); } catch (er) { /* not running */ } return openOnPhone(); }
      if (!camStartAt) showError('Something went wrong', msg);
    },
    listeners: [
      { event: 'reality.trackingstatus', process: ({ detail }) => { demo.tracking = detail.status; } },
      ...(cfg.listeners || []),
    ],
  };
  function camFailed() {
    if (camStartAt) return;
    showError('The camera didn\'t start', 'Allow camera' + (mode === 'world' ? ' and motion' : '') + ' access for this site, close other apps or tabs that use the camera, then tap Try again.');
  }
  function drawDiag() {
    if (!DIAG) return;
    const el = $('diagp'); el.hidden = false;
    el.textContent = `cam ${demo.diag.steps.slice(-1)[0] || '-'}  track ${demo.tracking}  ${demo.state}  fps ${demo.diag.fps.toFixed(0)}` + (demo.diag.errors.length ? `\nerr ${demo.diag.errors.slice(-1)[0]}` : '');
  }

  function askMotion() { // iPhone: must be asked inside the tap, before anything async. Ask, never return early.
    try { if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); } catch (e) { /* none */ }
    try { if (window.DeviceMotionEvent && DeviceMotionEvent.requestPermission) DeviceMotionEvent.requestPermission().catch(() => {}); } catch (e) { /* none */ }
  }
  function start() {
    if (!loaded || started) return; started = true;
    $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
    if (mode === 'world' && !PHONE && !qs.has('desktop')) return openOnPhone();
    hero && hero.stop(); hero = null;
    cfg.onStartTap && cfg.onStartTap(demo);
    sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
    const mods = [XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule()];
    if (mode === 'world') {
      XR8.XrController.configure(Object.assign({ disableWorldTracking: false, scale: 'responsive' }, cfg.xrConfig || {}));
      mods.push(XR8.XrController.pipelineModule());
    } else {
      XR8.FaceController.configure(Object.assign({ meshGeometry: [XR8.FaceController.MeshGeometry.FACE], coordinates: { mirroredDisplay: true }, maxDetections: 1 }, cfg.faceConfig || {}));
      mods.push(XR8.FaceController.pipelineModule());
    }
    mods.push(XR8.CanvasScreenshot.pipelineModule(), appModule);
    try {
      XR8.addCameraPipelineModules(mods);
      setTimeout(() => { if (!camStartAt) camFailed(); }, 15000);
      XR8.run({
        canvas,
        allowedDevices: mode === 'face' || qs.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
        cameraConfig: { direction: mode === 'face' ? XR8.XrConfig.camera().FRONT : XR8.XrConfig.camera().BACK },
        verbose: qs.has('verbose'),
      });
    } catch (e) { showError('AR couldn\'t start', String((e && e.message) || e)); }
  }
  $('b-start').onclick = () => { if (mode === 'world') askMotion(); start(); };
  return demo;
}

// ---------------------------------------------------------------- shared joystick (centre of the bar)
// Returns { v: Vector2 (x right, y down, length <= 1), el }. Camera-relative mapping is the demo's job.
export function joystick(demo, label = 'Joystick: move') {
  const el = document.createElement('div'); el.className = 'stick'; el.setAttribute('role', 'application'); el.setAttribute('aria-label', label);
  el.innerHTML = '<span></span>'; const knob = el.firstChild;
  const v = new THREE.Vector2(); let id = null;
  const move = (e) => {
    const r = el.getBoundingClientRect();
    v.set((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height / 2)) / (r.height / 2));
    if (v.length() > 1) v.normalize();
    knob.style.transform = `translate(${v.x * 34}px,${v.y * 34}px)`;
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; el.setPointerCapture(e.pointerId); move(e); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; v.set(0, 0); knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  demo.mid.appendChild(el);
  return { v, el };
}

// camera-relative: screen up = away from the camera along the floor. Returns a world-space XZ direction.
export function stickToWorld(demo, v, out = new THREE.Vector3()) {
  const f = new THREE.Vector3(); demo.camera.getWorldDirection(f); f.y = 0;
  if (f.lengthSq() < 1e-6) f.set(0, 0, -1); f.normalize();
  const r = new THREE.Vector3(-f.z, 0, f.x);
  return out.copy(r).multiplyScalar(v.x).addScaledVector(f, -v.y);
}
