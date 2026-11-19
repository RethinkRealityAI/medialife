// Spray Bobo viewer: one fan's painting, opened from its share link (/sb/<id>) or QR. No camera.
// The merch print lies on the table as a card, the painting shows on it, then (as on the AR page after
// saving) it flashes, peels off as a 3D die-cut sticker, spins and settles hovering above the print, with
// paint drops in its colours orbiting it and a shine sweeping over the gloss now and then.
// Drag to spin (coasts, settles face-front), tap to hop, hold then let go for the big jump.
//
// The sticker, its shadow, the orbit, the splats, the paint composite and the artwork are copied from
// ../main.js (the AR page) and trimmed: this page must not import that file.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// ?embed=1: just the sticker (the Studio's share sheet shows it in a frame, with its own buttons around it)
if (params.get('embed') === '1') document.documentElement.classList.add('embed');
const clamp = THREE.MathUtils.clamp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeBack = (x) => { x = clamp(x, 0, 1); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const buzz = (p) => { try { const ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const FINE = matchMedia('(pointer: fine)').matches;
const RM = matchMedia('(prefers-reduced-motion: reduce)');
let REDUCED = RM.matches; try { RM.addEventListener('change', () => { REDUCED = RM.matches; }); } catch (e) { /* old Safari */ }
const TW = 768, TH = 1024;                    // paint texture
// the frame the copied code was tuned in: the Bobo charm's picture, in metres (sizes and speeds below assume it)
const W = 0.0601, H = 0.0801, S = 1 / H;      // S: world units per metre (the card is 1 unit tall)
const DEFAULT_COLS = ['#f6c344', '#3f9be6', '#e85bd8'];
document.title = "Spray Bobo: a fan's painting";

// ---------------------------------------------------------------- which painting
function creationId() {
  const m = location.pathname.match(/\/sb\/([A-Za-z0-9]{6,40})\/?$/);
  if (m) return m[1];
  const c = params.get('c');
  return c && /^[A-Za-z0-9]{6,40}$/.test(c) ? c : null;
}
const ID = creationId();
const shareUrl = () => `${location.origin}/sb/${ID}`;

// ---------------------------------------------------------------- sound (made here, no files; starts on the first tap)
const sound = {
  ctx: null, master: null, on: true,
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
  rattle(n = 4) { for (let i = 0; i < n; i++) { const w = i * 0.075 + Math.random() * 0.02; this.tone(2600, 1700, 0.035, 0.07, 'square', w); this.noise(0.04, 0.12, 2000, 7000, w); } },
  pssh() { this.noise(0.7, 0.16, 2500, 11000); },
  pop() { this.tone(260, 900, 0.16, 0.24); this.noise(0.12, 0.1, 900, 6000); },
  whoosh() { this.noise(0.35, 0.08, 900, 5000); this.tone(320, 760, 0.3, 0.035); },
  sparkle() { [1568, 2093, 2637, 3136, 3951, 4699].forEach((f, i) => this.tone(f, f * 1.01, 0.3, 0.04, 'sine', i * 0.055)); },
  mew() { this.tone(620, 880, 0.14, 0.08, 'triangle'); this.tone(880, 560, 0.22, 0.08, 'triangle', 0.13); },
  click() { this.tone(900, 600, 0.06, 0.05, 'triangle'); },
};
try { sound.on = localStorage.getItem('sb-view-sound') !== '0'; } catch (e) { /* none */ }
function syncSoundBtn() { const b = $('b-sound'); b.setAttribute('aria-pressed', String(sound.on)); b.setAttribute('aria-label', sound.on ? 'Sound on. Tap to mute' : 'Sound off. Tap to unmute'); }
syncSoundBtn();
$('b-sound').onclick = () => {
  sound.on = !sound.on; syncSoundBtn(); sound.init(); if (sound.on) sound.click(); syncSceneSound();
  try { localStorage.setItem('sb-view-sound', sound.on ? '1' : '0'); } catch (e) { /* none */ }
};
// the first touch anywhere unlocks the audio (browsers only allow sound after one)
const unlock = () => { sound.init(); removeEventListener('pointerdown', unlock, true); removeEventListener('keydown', unlock, true); };
addEventListener('pointerdown', unlock, true); addEventListener('keydown', unlock, true);

// ---------------------------------------------------------------- toast
let toastT = 0;
function toast(text, ms = 2200) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }

// ---------------------------------------------------------------- loading
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); });
const setState = (s) => { document.body.dataset.state = s; };
let C = null, P = null;                       // the creation, its paintable
const art = {};                               // print, mask, lines, paint (images), points (cut line)

async function load() {
  setState('loading');
  if (!ID) { setState('notfound'); return; }
  let r;
  try { r = await fetch(`/api/spray/creations/${encodeURIComponent(ID)}`, { headers: { accept: 'application/json' } }); }
  catch (e) { setState('error'); return; }
  if (r.status === 404) { setState('notfound'); return; }
  if (r.status === 410) { setState('gone'); return; }
  if (!r.ok) { setState('error'); return; }
  try {
    const d = await r.json(); C = d.creation; P = d.paintable;
    const f = P.files || {};
    const [print, mask, lines, outline, paintImg, decals] = await Promise.all([
      loadImg(f.print).catch(() => null),
      loadImg(f.mask),
      f.lines && C.linesOn ? loadImg(f.lines).catch(() => null) : null,
      getJson(f.outline).catch(() => null),
      loadImg(C.image),
      loadDecals(),
    ]);
    Object.assign(art, { print, mask, lines, paint: paintImg, decals, points: outline && Array.isArray(outline.points) && outline.points.length > 2 ? outline.points : null });
  } catch (e) { console.error(e); setState('error'); return; }
  fillCopy();
  setState('ready');
  start();
}
$('b-retry').onclick = () => load();

function fillCopy() {
  $('pname').textContent = P.name || 'EVADE merch';
  const sw = $('swatches'); sw.textContent = '';
  for (const c of cols()) { const i = document.createElement('i'); i.style.setProperty('--c', c); sw.appendChild(i); }
  $('b-ar').href = `/evade/spray-bobo/?c=${encodeURIComponent(ID)}&go=1`;   // go=1: straight to the camera, no second splash
  $('b-ar').setAttribute('aria-label', 'View on merch. Opens the camera page, needs the real EVADE merch and your camera');
}
const cols = () => (C && C.colours && C.colours.length ? C.colours : DEFAULT_COLS);

// ---------------------------------------------------------------- the paint composite (from makePaint.composite)
// base coat (if primer), the paint, the outline (if linesOn), cut to the stencil
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function composite() {
  const D = mk(TW, TH), g = D.getContext('2d');
  if (C.primer) { g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, TW, TH); }
  g.drawImage(art.paint, 0, 0, TW, TH);
  if (C.linesOn && art.lines) g.drawImage(art.lines, 0, 0, TW, TH);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(art.mask, 0, 0, TW, TH); g.globalCompositeOperation = 'source-over';
  return D;
}
// the sticker's face (from bakeSticker): the painting; without the base coat the print shows under the paint
function bakeSticker(D) {
  const c = mk(TW, TH), g = c.getContext('2d');
  if (!C.primer) { if (art.print) g.drawImage(art.print, 0, 0, TW, TH); else { g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, TW, TH); } }
  g.drawImage(D, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(art.mask, 0, 0, TW, TH);
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, TW, TH);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// ---------------------------------------------------------------- three.js scene
let renderer = null, scene, camera, root, tilt, F;
let paintMesh, stickerPivot, sticker, shadow, splats, orbit, shine, cardGroup;
let stickerCanvas = null;
const clock = { t: 0 };
const stage = $('stage'), canvas = $('gl');

function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function shapeGeo(shape, w, h) {   // a flat shape with uv = its place in the w x h frame
  const geo = new THREE.ShapeGeometry(shape, 6), pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  uv.needsUpdate = true; return geo;
}

function buildScene() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
  // softer than the AR page's lights: on a dark page the paint should keep its flat colours (no washed-out look)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5560, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(-1.5, 2.5, 3); scene.add(key);

  // root (scale: metres to world) > tilt (the card lies back a little, turned like the splash card; parallax) > F (the card's frame)
  root = new THREE.Group(); root.scale.setScalar(S); scene.add(root);
  tilt = new THREE.Group(); root.add(tilt);
  F = new THREE.Group(); tilt.add(F);

  // the card: the merch print, an ink rim and a flat shadow (no gradients: one flat colour, part see-through)
  cardGroup = new THREE.Group(); F.add(cardGroup);
  const printTex = art.print ? new THREE.Texture(art.print) : null;
  if (printTex) { printTex.colorSpace = THREE.SRGBColorSpace; printTex.anisotropy = 8; printTex.needsUpdate = true; }
  const card = new THREE.Mesh(shapeGeo(roundRect(W, H, 0.0045), W, H), new THREE.MeshBasicMaterial({ map: printTex, color: printTex ? 0xffffff : 0xfbfaf5, toneMapped: false }));
  card.renderOrder = 2; cardGroup.add(card);
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(W + 0.0032, H + 0.0032, 0.0062), 6), new THREE.MeshBasicMaterial({ color: 0x15131a, toneMapped: false }));
  rim.position.z = -0.0002; rim.renderOrder = 1; cardGroup.add(rim);
  const flat = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(W + 0.0032, H + 0.0032, 0.0062), 6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, toneMapped: false }));
  flat.position.set(0.0028, -0.0042, -0.0016); flat.renderOrder = 0; cardGroup.add(flat);

  // the painting on the card (from the AR page's canvas: spreads out from the middle, flashes, fades as the sticker lifts)
  const D = composite();
  const paintTex = new THREE.CanvasTexture(D); paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 4;
  const maskTex = new THREE.Texture(art.mask); maskTex.needsUpdate = true;
  const centre = maskCentre(art.mask);
  paintMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
    uniforms: { map: { value: paintTex }, mask: { value: maskTex }, uReveal: { value: 0 }, uFlash: { value: 0 }, uOpacity: { value: 1 }, uTime: { value: 0 },
      uEdge: { value: new THREE.Color('#f6c344') }, uInk: { value: new THREE.Color('#15131a') }, uC: { value: new THREE.Vector2(centre[0], 1 - centre[1]) }, uAsp: { value: W / H } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vUv;
      uniform sampler2D map, mask; uniform float uReveal, uFlash, uOpacity, uTime, uAsp; uniform vec3 uEdge, uInk; uniform vec2 uC;
      float hs(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main() {
        vec4 c = texture2D(map, vUv); float m = texture2D(mask, vUv).a;
        vec2 d = (vUv - uC) * vec2(uAsp, 1.0);
        float an = atan(d.y, d.x);
        float r = length(d) + (vn(vec2(an * 2.6 + 9.0, uTime * 1.3)) - 0.5) * 0.10 + (vn(vUv * 22.0) - 0.5) * 0.025;
        float R = uReveal * 0.82, going = step(0.001, uReveal) * step(uReveal, 0.999);
        float shown = step(r, R);
        float band = step(R, r) * step(r, R + 0.03) * going;
        float ink = step(R + 0.03, r) * step(r, R + 0.042) * going;
        vec3 col = mix(c.rgb, vec3(1.0), uFlash * 0.85);
        col = mix(col, uEdge, band); col = mix(col, uInk, ink);
        float a = max(c.a * shown, (band + ink) * m) * uOpacity;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
  paintMesh.position.z = 0.0003; paintMesh.renderOrder = 10; F.add(paintMesh);
  paintMesh.userData.centre = centre;

  // the finished painting as a 3D die-cut sticker, with a flat shine band that sweeps over it now and then
  stickerCanvas = bakeSticker(D);
  const stickerTex = new THREE.CanvasTexture(stickerCanvas); stickerTex.colorSpace = THREE.SRGBColorSpace; stickerTex.anisotropy = 8;
  stickerPivot = new THREE.Group(); F.add(stickerPivot); stickerPivot.visible = false;
  shine = { value: -1 };
  // a dimmer room than the AR page's: there the camera picture is behind him, here a dark page (else the gloss washes the paint out)
  const face = new THREE.MeshPhysicalMaterial({ map: stickerTex, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.3, side: THREE.DoubleSide });
  face.onBeforeCompile = (sh) => {
    sh.uniforms.uShine = shine;
    sh.fragmentShader = 'uniform float uShine;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n{ float sb = vMapUv.x * 0.55 + (1.0 - vMapUv.y); totalEmissiveRadiance += vec3(0.6) * (step(abs(sb - uShine), 0.045) + 0.7 * step(abs(sb - uShine + 0.12), 0.014)); }');
  };
  sticker = new THREE.Mesh(stickerGeometry(art.points || boxOutline(), W, H), [face, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })]);
  sticker.renderOrder = 12; stickerPivot.add(sticker);
  shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.95, H * 0.95), new THREE.MeshBasicMaterial({ map: shadowTexture(art.mask), transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
  shadow.position.z = 0.0002; shadow.renderOrder = 9; F.add(shadow);
  splats = makeSplats(); F.add(splats.points);
  orbit = makeOrbit(); F.add(orbit.mesh); colourOrbit(cols());
  buildDecals();
  buildSceneItems();

  new ResizeObserver(resize).observe(stage); resize();
}

// ---------------------------------------------------------------- the scene: models, pictures and video placed around the print
// P.scene, as the admin scene editor saves it. One coordinate system everywhere (editor, Studio, this page, the AR page):
// origin the centre of the 3:4 print, x right, y up, z out of the print towards the viewer, MILLIMETRES of the real print,
// rotations in degrees, XYZ order. The group hangs off F (the card's frame, H tall in metres), scaled by H / heightMm, so
// it lands and tilts with the card and stays put while only the sticker spins. GLTFLoader loads only when there is a model.
// The items pop in (staggered) once the reveal has settled; a failed asset is skipped (console.warn), never the page.
const SCENE_KINDS = new Set(['model', 'image', 'video']);
const scn = { group: null, items: [], shown: false, reach: { x: 0, y: 0 }, heard: false };
const fnum = (v, d) => (Number.isFinite(+v) ? +v : d);
const trio = (a) => [0, 1, 2].map((i) => fnum(Array.isArray(a) ? a[i] : 0, 0));
function sceneList() {
  const s = P && Array.isArray(P.scene) ? P.scene : [];
  return s.filter((it) => it && it.visible !== false && SCENE_KINDS.has(it.kind) && typeof it.file === 'string' && it.file && fnum(it.size, 0) > 0);
}
let gltfLoader = null;
const getGltf = () => gltfLoader || (gltfLoader = Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')])
  .then(([{ GLTFLoader }, { MeshoptDecoder }]) => { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return l; }));
function buildSceneItems() {
  const list = sceneList(); if (!list.length) return;
  const mm = H / (fnum(P.heightMm, 0) > 0 ? +P.heightMm : H * 1000);   // F units (metres of the card) per millimetre of the print
  const g = new THREE.Group(); g.name = 'scene'; g.scale.setScalar(mm); F.add(g); scn.group = g;
  list.forEach((it, i) => {
    const holder = new THREE.Group(), p = trio(it.pos), r = trio(it.rot).map(THREE.MathUtils.degToRad), size = +it.size;
    holder.name = `scene-${it.id || i}`; holder.position.set(p[0], p[1], p[2]); holder.rotation.set(r[0], r[1], r[2], 'XYZ'); holder.visible = false;
    g.add(holder);
    // how far it reaches from the print's centre (data only, so the framing is right from the first frame)
    const half = size / 2 * Math.max(1, it.kind === 'model' ? 1 : fnum(it.aspect, 1));
    scn.reach.x = Math.max(scn.reach.x, (Math.abs(p[0]) + half) * mm); scn.reach.y = Math.max(scn.reach.y, (Math.abs(p[1]) + half) * mm);
    const e = { holder, i, t: 0, ready: false, mixer: null, video: null, sound: it.kind === 'video' && it.sound === true };
    scn.items.push(e);
    const made = it.kind === 'model' ? getGltf().then((l) => l.loadAsync(it.file)).then((gl) => sceneModel(gl, it, size, e))
      : it.kind === 'image' ? loadImg(it.file).then((img) => { const t = new THREE.Texture(img); t.needsUpdate = true; scenePlane(t, fnum(it.aspect, 0) > 0 ? +it.aspect : img.naturalWidth / img.naturalHeight, size, e); })
        : sceneVideo(it, size, e);
    made.then(() => { e.ready = true; }).catch((err) => { console.warn('scene: skipped', it.file, err); holder.removeFromParent(); e.dead = true; });
  });
}
function sceneModel(gl, it, size, e) {
  // normalise in the rest pose: height = size, the bounding-box centre on pos, rot about that centre (the holder)
  const m = gl.scene, inner = new THREE.Group(); inner.add(m); inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), d = box.getSize(new THREE.Vector3());
  const h = d.y > 1e-9 ? d.y : Math.max(d.x, d.y, d.z);   // a flat model: its largest side (as the editor does)
  if (!(h > 1e-9)) throw new Error('empty model');
  const s = size / h, c = box.getCenter(new THREE.Vector3());
  inner.scale.setScalar(s); inner.position.copy(c).multiplyScalar(-s);
  m.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 11; } });
  if (it.clip) {
    const clip = THREE.AnimationClip.findByName(gl.animations || [], it.clip);
    if (clip) { e.mixer = new THREE.AnimationMixer(m); e.mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play(); }
    else console.warn('scene: no clip', it.clip, 'in', it.file);
  }
  e.holder.add(inner);
}
function scenePlane(tex, aspect, size, e) {
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  // transparent PNG / WebP keep their alpha; alphaTest keeps the clear parts out of the depth buffer
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * a, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, toneMapped: false }));
  mesh.renderOrder = 11; e.holder.add(mesh);
}
function sceneVideo(it, size, e) {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.defaultMuted = true; v.loop = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    let done = false;
    const ok = () => {
      if (done) return; done = true;
      const t = new THREE.VideoTexture(v);
      scenePlane(t, fnum(it.aspect, 0) > 0 ? +it.aspect : (v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9), size, e);
      e.video = v; syncSceneSound(); res();
    };
    v.addEventListener('loadeddata', ok, { once: true });
    v.addEventListener('error', () => { if (!done) { done = true; rej(new Error('video ' + it.file)); } }, { once: true });
    v.src = it.file; v.load();
    v.play().catch(() => { /* starts when shown / after a tap */ });
  });
}
// sound: videos marked `sound` unmute after the first tap or key (browsers allow it then), and follow the mute button
function syncSceneSound() {
  for (const e of scn.items) if (e.video && e.sound) { e.video.muted = !(scn.heard && sound.on); if (scn.shown && e.video.paused) e.video.play().catch(() => {}); }
}
function sceneHeard() {
  if (scn.heard) return; scn.heard = true; syncSceneSound();
  for (const t of ['pointerup', 'touchend', 'keydown']) removeEventListener(t, sceneHeard, true);
}
for (const t of ['pointerup', 'touchend', 'keydown']) addEventListener(t, sceneHeard, true);
document.addEventListener('visibilitychange', () => { for (const e of scn.items) if (e.video) { if (document.hidden) e.video.pause(); else if (scn.shown) e.video.play().catch(() => {}); } });
function sceneHide() {   // Replay: the items go and pop in again when the sticker has settled
  scn.shown = false;
  for (const e of scn.items) { e.holder.visible = false; e.t = 0; }
}
function tickScene(dt) {
  if (!scn.group) return;
  if (!scn.shown && life.phase === 'idle') {
    scn.shown = true;
    for (const e of scn.items) { e.t = REDUCED ? 0 : -e.i * 0.09; if (e.video) e.video.play().catch(() => {}); }
  }
  if (!scn.shown) return;
  for (const e of scn.items) {
    if (!e.ready || e.dead) continue;
    e.t += dt; if (e.t < 0) continue;
    const k = REDUCED ? 1 : easeBack(e.t / 0.42);
    e.holder.visible = true; e.holder.scale.setScalar(Math.max(1e-4, k));
    if (e.mixer) e.mixer.update(dt);
  }
}
// ---------------------------------------------------------------- decals (from the AR page's decalArt / makeLayer / placeLayer)
// C.decals, back to front: { id, u, v, w, r, f } in the picture's frame (u, v: the decal's middle as fractions of the
// picture, v down; w: its width as a share of the picture's; r: turn in radians, counter-clockwise as you look at it;
// f: -1 mirrored). The library (../decals/decals.json and its SVGs) loads only when there are decals. They pop on
// in order once the paint has spread, lie on the flat painting, then ride the 3D sticker from the peel on (they hop,
// spin and settle with it, and may stick out past its edge, as on the AR page). Save image draws them the same way.
// An unknown id or a picture that fails is skipped (console.warn), never the page.
const DEC_DIR = '/evade/spray-bobo/decals/';
const dec = { layers: [], group: null, on: 'flat', started: false };
function decalList() {
  const s = C && Array.isArray(C.decals) ? C.decals : [];
  return s.filter((x) => x && typeof x.id === 'string' && x.id);
}
async function loadDecals() {
  const list = decalList(); if (!list.length) return [];
  let lib;
  try { lib = await getJson(DEC_DIR + 'decals.json'); } catch (e) { console.warn('decals: no library', e); return []; }
  const by = {}; for (const d of (lib && Array.isArray(lib.decals) ? lib.decals : [])) if (d && d.id && d.file) by[d.id] = d;
  // texture size: crisp at 2x on a phone for how wide it is drawn (the card is at most about 850 device px wide)
  const px = {}; for (const s of list) px[s.id] = Math.max(px[s.id] || 0, clamp(+s.w || 0.3, 0.04, 1.6));
  const arts = {};
  const out = await Promise.all(list.map((s) => {
    const d = by[s.id]; if (!d) { console.warn('decals: unknown', s.id); return null; }
    const size = clamp(Math.ceil(px[s.id] * 900 / 64) * 64, 256, 1024);
    arts[s.id] = arts[s.id] || decalArt(d, size);
    return arts[s.id].then((a) => ({ id: s.id, u: fnum(s.u, 0.5), v: fnum(s.v, 0.5), w: clamp(+s.w || 0.3, 0.04, 1.6), r: fnum(s.r, 0), f: s.f === -1 ? -1 : 1, art: a }))
      .catch((e) => { console.warn('decals: skipped', s.id, e); return null; });
  }));
  return out.filter(Boolean);
}
// the decal's picture, drawn once into a canvas (with a white die-cut edge for the stickers); also used by Save image
function decalArt(d, size) {
  return loadImg(DEC_DIR + d.file).then((img) => {
    const iw = img.naturalWidth || img.width || 256, ih = img.naturalHeight || img.height || 256, k = size / Math.max(iw, ih);
    const w = Math.round(iw * k), h = Math.round(ih * k), pad = d.border ? Math.round(Math.max(w, h) * 0.05) : 2;
    const c = mk(w + pad * 2, h + pad * 2), g = c.getContext('2d');
    if (d.border) {
      const t = mk(w, h), tg = t.getContext('2d');
      tg.drawImage(img, 0, 0, w, h); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, w, h);
      for (let a = 0; a < 16; a++) g.drawImage(t, pad + Math.cos(a * 0.3927) * pad * 0.92, pad + Math.sin(a * 0.3927) * pad * 0.92);
    }
    g.drawImage(img, pad, pad, w, h);
    return { canvas: c, aspect: c.width / c.height, grow: c.width / w };
  });
}
function buildDecals() {
  if (!art.decals || !art.decals.length) return;
  dec.group = new THREE.Group(); dec.group.name = 'decals'; dec.group.visible = false;
  const geo = new THREE.PlaneGeometry(1, 1);
  dec.layers = art.decals.map((s, i) => {
    const tex = new THREE.CanvasTexture(s.art.canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.02, toneMapped: false }));
    mesh.name = `decal-${s.id}`; mesh.frustumCulled = false; mesh.renderOrder = 20 + i; mesh.visible = false; dec.group.add(mesh);
    return { ...s, mesh, i, pop: null };
  });
  decalHost('flat');
}
// where they are shown: flat on the card's painting, or riding the 3D sticker (its face, just in front of the gloss)
function decalHost(on) {
  const g = dec.group; if (!g) return; const parent = on === 'sticker' ? sticker : F;
  if (g.parent !== parent) parent.add(g);
  g.position.set(0, 0, on === 'sticker' ? 0.0018 : 0.0007); dec.on = on;
}
function decalsReset() {   // the reveal (again): back on the flat painting, hidden until the paint has spread
  if (!dec.group) return; dec.started = false; decalHost('flat');
  for (const L of dec.layers) { L.pop = null; L.mesh.visible = false; }
}
// a decal landing: from nothing, overshoots, settles, with a little twist (the AR page's popK)
const popK = (t) => { if (t <= 0) return 0; const k = clamp(t / 0.5, 0, 1), c = 2.2, x = k - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
function placeDecal(L) {
  let k = 1, tw = 0;
  if (L.pop) { k = popK(L.pop.t); tw = -0.5 * (1 - easeOut(L.pop.t / 0.5)); }
  k = Math.max(k, 1e-4); const ww = L.w * W * L.art.grow * k;
  // r turns counter-clockwise (y is up here); f mirrors it about its own upright, after the turn (as Save image does)
  L.mesh.position.set((L.u - 0.5) * W, (0.5 - L.v) * H, 0); L.mesh.rotation.set(0, 0, L.r + tw); L.mesh.scale.set(ww * L.f, ww / L.art.aspect, 1);
}
function tickDecals(dt) {
  if (!dec.group) return;
  // they pop on, in order, right after the paint has spread (at once with reduced motion)
  if (!dec.started && life.phase !== 'intro' && life.phase !== 'off') {
    dec.started = true;
    for (const L of dec.layers) { L.pop = REDUCED ? null : { t: -L.i * 0.11, sounded: false }; L.mesh.visible = REDUCED; }
  }
  for (const L of dec.layers) {
    if (L.pop) {
      L.pop.t += dt;
      if (L.pop.t >= 0 && !L.pop.sounded) { L.pop.sounded = true; L.mesh.visible = true; sound.tone(520 + L.i * 60, 980 + L.i * 60, 0.09, 0.05, 'triangle'); }
      if (L.pop.t > 0.6) L.pop = null;
    }
    placeDecal(L);
  }
  dec.group.visible = dec.started && (paintMesh.visible || stickerPivot.visible);
}
// Save image and the no-WebGL picture: the decals onto a 2D canvas, the picture's frame at x, y, w wide (3:4)
function drawDecals(g, x, y, w) {
  for (const L of art.decals || []) {
    const ww = L.w * w * L.art.grow, hh = ww / L.art.aspect;
    g.save(); g.translate(x + L.u * w, y + L.v * (w * TH / TW)); g.rotate(-L.r); g.scale(L.f, 1); g.drawImage(L.art.canvas, -ww / 2, -hh / 2, ww, hh); g.restore();
  }
}
function boxOutline() { return [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]]; }
function maskCentre(img) {   // the centroid of the stencil, in uv (y down)
  const c = mk(48, 64), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 48, 64);
  const d = g.getImageData(0, 0, 48, 64).data; let x = 0, y = 0, n = 0;
  for (let i = 0; i < 48 * 64; i++) if (d[i * 4 + 3] > 127) { x += i % 48; y += Math.floor(i / 48); n++; }
  return n ? [(x / n + 0.5) / 48, (y / n + 0.5) / 64] : [0.5, 0.5];
}
// paint drops in the creation's colours, orbiting the finished sticker (they pass behind it)
function makeOrbit() {
  const N = 7, mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshPhysicalMaterial({ roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }), N);
  mesh.visible = false; mesh.renderOrder = 13; mesh.frustumCulled = false;
  const c = new THREE.Color('#f6c344'); for (let i = 0; i < N; i++) mesh.setColorAt(i, c);
  return { mesh, N, on: 0 };
}
const _om = new THREE.Matrix4(), _oq = new THREE.Quaternion(), _op = new THREE.Vector3(), _os = new THREE.Vector3();
function tickOrbit(dt, zc) {
  const o = orbit;
  const want = life.phase === 'idle' ? 1 : 0;
  o.on += (want - o.on) * Math.min(1, dt * 3); o.mesh.visible = o.on > 0.02; if (!o.mesh.visible) return;
  const t = clock.t * (REDUCED ? 0.4 : 1), R = W * 0.62;
  for (let i = 0; i < o.N; i++) {
    const a = t * 0.9 + (i / o.N) * Math.PI * 2, r = 0.0016 + 0.0008 * Math.sin(i * 2.3);
    _op.set(Math.cos(a) * R, -H * 0.08 + Math.sin(a * 2 + i) * H * 0.06, zc + Math.sin(a) * R * 0.55);
    _os.setScalar(r * o.on * (1 + 0.15 * Math.sin(t * 6 + i)));
    o.mesh.setMatrixAt(i, _om.compose(_op, _oq, _os));
  }
  o.mesh.instanceMatrix.needsUpdate = true;
}
function colourOrbit(cs) { const c = new THREE.Color(); for (let i = 0; i < orbit.N; i++) { c.set(cs[i % cs.length]); orbit.mesh.setColorAt(i, c); } orbit.mesh.instanceColor.needsUpdate = true; }
function shadowTexture(maskImg) {   // the sticker's soft shadow on the print: its shape, blurred, in black
  const c = mk(192, 256), g = c.getContext('2d');
  g.filter = 'blur(10px)'; g.drawImage(maskImg, 16, 20, 160, 214); g.filter = 'none';
  g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, 192, 256);
  return new THREE.CanvasTexture(c);
}
function stickerGeometry(points, W, H) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2((u - 0.5) * W, (0.5 - v) * H)));
  const depth = 0.0022;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.0006, bevelSegments: 3, curveSegments: 2 });
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / H + 0.5);
  uv.needsUpdate = true; geo.translate(0, 0, -depth / 2); geo.computeVertexNormals();
  return geo;
}
// paint splats: a burst in the creation's colours
function makeSplats() {
  const N = 160, geo = new THREE.BufferGeometry();
  // unused drops wait far behind the card (at the origin they showed as a black fleck on the print mid-burst)
  const p0 = new Float32Array(N * 3); for (let i = 0; i < N; i++) p0[i * 3 + 2] = -10;
  geo.setAttribute('position', new THREE.BufferAttribute(p0, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const c = mk(64, 64), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.fill();
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; g.beginPath(); g.arc(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 6, 0, 7); g.fill(); }
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: false }));
  points.renderOrder = 14; points.frustumCulled = false; points.visible = false;
  return { points, N, vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 };
}
function burstSplats(colours, n = 70, at = new THREE.Vector3(0, 0, 0.004), speed = 0.09) {
  const pos = splats.points.geometry.attributes.position, col = splats.points.geometry.attributes.color, cc = new THREE.Color();
  if (REDUCED) { n = Math.round(n * 0.5); speed *= 0.6; }
  for (let i = 0; i < n; i++) {
    const j = splats.next; splats.next = (splats.next + 1) % splats.N;
    const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.2, s = speed * (0.4 + Math.random());
    pos.setXYZ(j, at.x + (Math.random() - 0.5) * W * 0.6, at.y + (Math.random() - 0.5) * H * 0.6, at.z);
    splats.vel[j * 3] = Math.cos(a) * Math.cos(e) * s; splats.vel[j * 3 + 1] = Math.sin(a) * Math.cos(e) * s; splats.vel[j * 3 + 2] = Math.sin(e) * s;
    splats.life[j] = 0.6 + Math.random() * 0.7;
    cc.set(colours[i % colours.length]); col.setXYZ(j, cc.r, cc.g, cc.b);
  }
  pos.needsUpdate = col.needsUpdate = true;
}
function tickSplats(dt) {
  const pos = splats.points.geometry.attributes.position; let alive = 0;
  for (let i = 0; i < splats.N; i++) {
    if (splats.life[i] <= 0) continue; splats.life[i] -= dt; alive++;
    splats.vel[i * 3 + 2] -= 0.25 * dt;                      // falls back toward the card
    pos.setXYZ(i, pos.getX(i) + splats.vel[i * 3] * dt, pos.getY(i) + splats.vel[i * 3 + 1] * dt, Math.max(0.0005, pos.getZ(i) + splats.vel[i * 3 + 2] * dt));
    if (splats.life[i] <= 0) pos.setXYZ(i, 0, 0, -10);
  }
  pos.needsUpdate = true; splats.points.visible = alive > 0;
  splats.points.material.size = 0.0032 * S * 2.4;   // the AR camera sits closer: same look on screen
}

// ---------------------------------------------------------------- framing, parallax
const BASE_RX = -0.5, BASE_RZ = -0.07;            // the card lies back on the "table" and is turned a little
const par = { x: 0, y: 0, tx: 0, ty: 0 };
function resize() {
  if (!renderer) return;
  const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h;
  // fit the card, the hover and the orbit: about 1.5 card heights tall and 1.55 card widths wide
  // with a scene, wide enough for it too (from the placed sizes; at most about twice the card alone)
  const needH = Math.min(Math.max(H * 1.26, scn.reach.y * 2.16), H * 2.5) * S, needW = Math.min(Math.max(W * 1.48, scn.reach.x * 2.16), W * 2.9) * S, tn = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(needH / (2 * tn), needW / (2 * tn * camera.aspect));
  camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  root.position.y = -H * S * 0.04;
}
addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  par.tx = clamp(e.clientX / innerWidth * 2 - 1, -1, 1); par.ty = clamp(e.clientY / innerHeight * 2 - 1, -1, 1);
}, { passive: true });
document.addEventListener('mouseleave', () => { par.tx = par.ty = 0; });
// phones: follow the tilt, only where it needs no permission prompt (iOS asks, so it stays still there)
if (!FINE && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
  let base = null;
  addEventListener('deviceorientation', (e) => {
    if (e.beta == null || e.gamma == null) return;
    if (!base) base = { b: e.beta, g: e.gamma };
    base.b += (e.beta - base.b) * 0.02; base.g += (e.gamma - base.g) * 0.02;   // drifts back to the way the phone is held
    par.tx = clamp((e.gamma - base.g) / 20, -1, 1); par.ty = clamp((e.beta - base.b) / 20, -1, 1);
  }, { passive: true });
}

// ---------------------------------------------------------------- the reveal and life (from startAlive / tickAlive)
// intro: the card lands and the painting spreads over it; hold; flash; lift (peels off, spins, settles); idle.
const life = { t: 0, phase: 'off', hopAt: 4, hop: null, spin: null, lx: 0, ly: 0, uy: 0, uv: 0, dragging: false, press: false, squish: 0, wig: null, shineAt: 2.5, burst: false, intro: 0 };
const dur = (full, short) => (REDUCED ? short : full);
function play(fromIntro) {
  Object.assign(life, { t: 0, phase: fromIntro ? 'intro' : 'hold', hop: null, spin: null, hopAt: 5 + Math.random() * 3, uy: 0, uv: 0, press: false, squish: 0, wig: null, shineAt: 2.5, burst: false });
  const u = paintMesh.material.uniforms; u.uOpacity.value = 1; u.uFlash.value = 0; u.uReveal.value = fromIntro ? 0 : 1;
  paintMesh.visible = true; stickerPivot.visible = false; sticker.rotation.set(0, 0, 0); sticker.scale.set(1, 1, 1);
  stickerPivot.position.set(0, 0, 0.0012); shine.value = -1; sceneHide(); decalsReset();
  if (!fromIntro) { sound.rattle(3); }
  setHint('');
}
function jump(kind, power = 0) {   // 1: a hop; 2: the big one (after holding), with a spin and a burst
  const big = kind === 2;
  life.hop = { t: 0, big, k: big ? 1 + power * 0.6 : 1 }; sound.mew(); buzz(big ? [15, 30, 25] : 12);
  burstSplats(cols(), big ? 50 : 22, new THREE.Vector3(0, -H * 0.3, 0.004), big ? 0.08 : 0.05);
  touched();
}
function tickAlive(dt) {
  life.t += dt; const u = paintMesh.material.uniforms;
  const HOVER = 0.016;
  if (life.phase === 'intro') {   // the card lands, the painting spreads out from the middle with a wet yellow edge
    const k = clamp(life.t / dur(1.1, 0.25), 0, 1);
    const land = REDUCED ? 1 : easeBack(clamp(life.t / 0.6, 0, 1));
    cardIn(land);
    u.uReveal.value = easeOut(clamp((life.t - (REDUCED ? 0 : 0.25)) / dur(0.85, 0.25), 0, 1));
    if (!life.burst && life.t > (REDUCED ? 0 : 0.3)) { life.burst = true; sound.pssh(); burstSplats([cols()[0], '#ffffff', '#f6c344'], 40, centreLocal(0.003), 0.06); }
    if (k >= 1 && u.uReveal.value >= 1) { life.phase = 'hold'; life.t = 0; life.burst = false; cardIn(1); }
  }
  if (life.phase === 'hold' && life.t > dur(0.55, 0.15)) { life.phase = 'flash'; life.t = 0; flashScreen(); }
  if (life.phase === 'flash') {
    const k = life.t / dur(0.7, 0.3); u.uFlash.value = Math.sin(clamp(k, 0, 1) * Math.PI);
    if (k >= 0.55 && !life.burst) { life.burst = true; burstSplats(cols(), 70); sound.pop(); buzz([20, 60, 20]); }
    if (k >= 1) { life.phase = 'lift'; life.t = 0; life.burst = false; u.uFlash.value = 0; }
  }
  if (life.phase === 'lift') {
    if (!stickerPivot.visible) { stickerPivot.visible = true; decalHost('sticker'); sound.whoosh(); setTimeout(() => sound.sparkle(), REDUCED ? 150 : 500); }
    const k = clamp(life.t / dur(1.3, 0.5), 0, 1), e = easeInOut(k);
    u.uOpacity.value = 1 - easeOut(k * 3); paintMesh.visible = u.uOpacity.value > 0.01;
    stickerPivot.position.set(0, 0, 0.0012 + HOVER * e + (REDUCED ? 0 : Math.sin(k * Math.PI) * 0.012));
    sticker.rotation.set(0, REDUCED ? 0 : e * Math.PI * 2, 0);
    const sq = !REDUCED && k > 0.85 ? 1 + Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.06 : 1;
    sticker.scale.set(1 / sq, sq, 1);
    if (k >= 1) {
      life.phase = 'idle'; life.t = 0; sticker.rotation.set(0, 0, 0); sticker.scale.set(1, 1, 1); paintMesh.visible = false;
      burstSplats(cols(), 30, new THREE.Vector3(0, -H * 0.35, 0.002), 0.05);
      if (!life.touched) setHint(FINE ? 'Click to hop · hold, then let go · drag to spin' : 'Tap to hop · hold and let go · swipe to spin');
    }
  }
  if (life.phase === 'idle') {
    const t = life.t, calm = REDUCED ? 0.35 : 1;
    let z = HOVER + Math.sin(t * 1.7) * 0.0018 * calm, ry = Math.sin(t * 0.7) * 0.16 * calm, rx = Math.sin(t * 0.9 + 1) * 0.07 * calm, rz = 0, sy = 1 + Math.sin(t * 2.2) * 0.012 * calm;
    // it looks at you: turn the face part of the way toward the camera
    _cl.copy(camera.position); F.worldToLocal(_cl);
    const yaw = clamp(Math.atan2(_cl.x, _cl.z), -0.7, 0.7) * 0.5, pitch = clamp(Math.atan2(-_cl.y, _cl.z), -0.7, 0.7) * 0.4, f = Math.min(1, dt * 4);
    life.ly += (yaw - life.ly) * f; life.lx += (pitch - life.lx) * f; ry += life.ly; rx += life.lx;
    // drag to spin: coasts, then settles face-front on the nearest full turn
    if (!life.dragging) {
      life.uy += life.uv * dt; life.uv *= Math.pow(0.12, dt);
      if (Math.abs(life.uv) < 1.5) { const tgt = Math.round(life.uy / (Math.PI * 2)) * Math.PI * 2; life.uy += (tgt - life.uy) * Math.min(1, dt * 5); life.uv *= Math.pow(0.02, dt); }
    }
    ry += life.uy;
    // pressed: it squashes down, ready to jump
    life.squish += ((life.press ? 1 : 0) - life.squish) * Math.min(1, dt * (life.press ? 3 : 12));
    sy *= 1 - life.squish * 0.16; z -= life.squish * 0.004;
    if (!REDUCED && t > life.hopAt && !life.hop && !life.press && !life.dragging) { life.hop = { t: 0, big: false, k: 0.8 }; life.hopAt = t + 6 + Math.random() * 4; }
    if (life.hop) {                                   // a hop and a wiggle; the big one spins too
      const h = life.hop; h.t += dt; const k = h.t / (h.big ? 0.95 : 0.6);
      z += Math.sin(clamp(k, 0, 1) * Math.PI) * (h.big ? 0.022 : 0.009) * h.k;
      rz = Math.sin(k * Math.PI * 4) * 0.16 * (1 - clamp(k, 0, 1));
      sy *= k < 0.15 ? 1 - Math.sin(k / 0.15 * Math.PI) * 0.1 : 1;
      if (h.big && k > 0.15 && !h.spun) { h.spun = true; life.spin = { t: 0 }; }
      if (k >= 1) { life.hop = null; if (h.big) { burstSplats(cols(), 24, new THREE.Vector3(0, -H * 0.35, 0.002), 0.04); sound.pop(); } }
    }
    if (life.wig) { life.wig.t += dt; const k = clamp(life.wig.t / 0.7, 0, 1); rz += Math.sin(k * Math.PI * 9) * 0.22 * (1 - k); if (k >= 1) life.wig = null; }
    if (life.spin) { life.spin.t += dt; const k = clamp(life.spin.t / 0.8, 0, 1); ry += easeInOut(k) * Math.PI * 2; if (k >= 1) life.spin = null; }
    stickerPivot.position.set(0, 0, z); sticker.rotation.set(rx, ry, rz); sticker.scale.set(1 / Math.sqrt(sy), sy, 1);
    // the shine: a flat white band across the gloss every few seconds
    if (t > life.shineAt) { const k = (t - life.shineAt) / 0.9; shine.value = -0.4 + k * 2.2; if (k >= 1) { shine.value = -1; life.shineAt = t + 3.5 + Math.random() * 2; } }
  }
  shadow.material.opacity = stickerPivot.visible ? clamp(0.85 - stickerPivot.position.z * 18, 0.25, 0.8) : 0;
  const ss = 1 + stickerPivot.position.z * 6; shadow.scale.set(ss, ss, 1);
}
const _cl = new THREE.Vector3();
function centreLocal(z) { const c = paintMesh.userData.centre; return new THREE.Vector3((c[0] - 0.5) * W, (0.5 - c[1]) * H, z); }
function cardIn(k) {   // the card dropping onto the table: 0 (above, turned) .. 1 (landed); overshoots a little
  tilt.position.set(0, (1 - k) * 0.03, (1 - k) * 0.02);
  F.rotation.z = (1 - k) * 0.35; const s = 0.85 + 0.15 * k; F.scale.setScalar(s);
}
function flashScreen() { const fl = $('flashw'); if (REDUCED) return; fl.classList.add('on'); setTimeout(() => fl.classList.remove('on'), 60); }

// ---------------------------------------------------------------- per frame
let last = 0, running = false;
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
  clock.t += dt; paintMesh.material.uniforms.uTime.value = clock.t;
  // parallax: the card follows the pointer / the phone's tilt a little
  const pk = REDUCED ? 0 : 1, f = Math.min(1, dt * 4);
  par.x += (par.tx * pk - par.x) * f; par.y += (par.ty * pk - par.y) * f;
  tilt.rotation.set(BASE_RX + par.y * 0.12, par.x * 0.2, BASE_RZ);
  tickAlive(dt);
  tickOrbit(dt, stickerPivot.position.z);
  tickSplats(dt);
  tickScene(dt);
  tickDecals(dt);
  renderer.render(scene, camera);
}
function runLoop(on) { if (on === running) return; running = on; last = 0; if (on) requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', () => runLoop(!document.hidden && !!renderer));

// ---------------------------------------------------------------- gestures: drag to spin, tap to hop, hold and let go to jump
const gest = { id: null, x: 0, y: 0, lx: 0, t: 0, lt: 0, drag: false };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || !renderer) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old Safari */ }
  Object.assign(gest, { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, t: performance.now(), lt: performance.now(), drag: false });
  if (life.phase === 'idle') { life.press = true; buzz(6); }
});
canvas.addEventListener('pointermove', (e) => {
  if (gest.id !== e.pointerId || life.phase !== 'idle') return;
  const now = performance.now(), dx = e.clientX - gest.lx;
  if (!gest.drag && Math.hypot(e.clientX - gest.x, e.clientY - gest.y) > 12) { gest.drag = true; life.press = false; }
  if (gest.drag) { const k = 0.014; life.uy += dx * k; life.uv = (dx * k) / Math.max((now - gest.lt) / 1000, 0.008); life.dragging = true; }
  gest.lx = e.clientX; gest.lt = now;
});
function endGesture(e) {
  if (gest.id !== e.pointerId) return;
  const held = performance.now() - gest.t; gest.id = null; life.dragging = false;
  if (life.phase !== 'idle') { life.press = false; return; }
  if (gest.drag) { if (performance.now() - gest.lt > 90) life.uv = 0; if (Math.abs(life.uv) > 6) { sound.whoosh(); buzz(8); } touched(); }
  else if (e.type === 'pointerup') { const sq = life.squish; life.press = false; jump(held > 260 ? 2 : 1, sq); }
  life.press = false;
}
canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);
// keyboard: Enter / Space hop (hold for the big jump), arrows spin
let keyDownAt = 0;
canvas.addEventListener('keydown', (e) => {
  if (life.phase !== 'idle') return;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) { keyDownAt = performance.now(); life.press = true; } }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); life.uv = (e.key === 'ArrowLeft' ? -1 : 1) * 22; sound.whoosh(); touched(); }
});
canvas.addEventListener('keyup', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && keyDownAt && life.phase === 'idle') { const held = performance.now() - keyDownAt; keyDownAt = 0; const sq = life.squish; life.press = false; jump(held > 260 ? 2 : 1, sq); }
});
canvas.addEventListener('blur', () => { life.press = false; keyDownAt = 0; });
let hintT = 0;
function setHint(t) { const h = $('hint'); h.textContent = t; h.classList.remove('gone'); clearTimeout(hintT); if (t) hintT = setTimeout(() => h.classList.add('gone'), 9000); }
function touched() { if (!life.touched) { life.touched = true; $('hint').classList.add('gone'); } }


// ---------------------------------------------------------------- start
function start() {
  try { buildScene(); }
  catch (e) {   // no WebGL: show the sticker as a flat picture, never nothing
    console.warn('webgl', e); renderer = null;
    const D = composite(); stickerCanvas = bakeSticker(D);
    const pic = mk(TW, TH), pg = pic.getContext('2d'); pg.drawImage(stickerCanvas, 0, 0); drawDecals(pg, 0, 0, TW);   // a copy: Save image draws the decals itself
    const img = new Image(); img.className = 'fallback'; img.alt = "The fan's painting as a sticker"; img.src = pic.toDataURL('image/png');
    stage.appendChild(img); canvas.hidden = true;
    return;
  }
  cardIn(0); play(true); runLoop(true);
  // ready the artwork now, so Save image can share it straight from the tap
  setTimeout(() => { artBlob = makeArtwork(); }, 600);
}

// ---------------------------------------------------------------- Save image: the sticker on EVADE yellow with both logos (from the AR page's Artwork)
const LOGO = { evade: loadImg('/brand/evade-logo.webp').catch(() => null), act: loadImg('/activated-merch/media/ar/activated-by.webp').catch(() => null) };
let artBlob = null;
async function makeArtwork() {
  await Promise.all([document.fonts.load('80px "Permanent Marker"'), document.fonts.load('700 28px "Space Grotesk"')]).catch(() => {});
  const [evade, act] = await Promise.all([LOGO.evade, LOGO.act]);
  const Wc = 1080, Hc = 1350, c = mk(Wc, Hc), g = c.getContext('2d');
  g.fillStyle = '#f6c344'; g.fillRect(0, 0, Wc, Hc);
  const aw = 700, ah = aw * TH / TW, ax = (Wc - aw) / 2, ay = 262;
  const silC = mk(TW, TH), sg = silC.getContext('2d');
  const sil = (col, r) => { sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, TW, TH); sg.drawImage(art.mask, 0, 0, TW, TH); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = col; sg.fillRect(0, 0, TW, TH); for (let a = 0; a < 16; a++) g.drawImage(silC, ax + Math.cos(a * 0.3927) * r, ay + Math.sin(a * 0.3927) * r, aw, ah); };
  g.save(); g.translate(Wc / 2, ay + ah / 2); g.rotate(-0.05); g.translate(-Wc / 2, -(ay + ah / 2));
  sil('#15131a', 30); sil('#ffffff', 22);
  // the face, cut to the stencil (the sticker canvas is white outside it; the silhouettes above are its die-cut edge)
  const cut = mk(TW, TH), cg = cut.getContext('2d'); cg.drawImage(stickerCanvas, 0, 0); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(art.mask, 0, 0, TW, TH);
  g.drawImage(cut, ax, ay, aw, ah);
  drawDecals(g, ax, ay, aw);   // the decals, where they sit on the sticker (as the AR page's Artwork)
  g.restore();
  g.fillStyle = '#15131a'; g.font = '400 92px "Permanent Marker", cursive'; g.textAlign = 'center';
  g.save(); g.translate(Wc / 2, 222); g.rotate(-0.04); g.fillText('FRESH PAINT', 0, 0); g.restore();
  // the EVADE logo in its own colours on an ink badge (its letters carry an ink outline: as a black silhouette it reads as a blob)
  if (evade) { const h = 50, w = h * evade.naturalWidth / evade.naturalHeight; g.fillStyle = '#15131a'; g.beginPath(); g.roundRect(54, 44, w + 40, h + 30, 20); g.fill(); g.drawImage(evade, 74, 59, w, h); }
  let actW = 0;
  if (act) { const h = 58, w = h * act.naturalWidth / act.naturalHeight; actW = w + 40; g.fillStyle = '#15131a'; g.beginPath(); g.roundRect(Wc - w - 74, Hc - h - 74, w + 40, h + 30, 20); g.fill(); g.drawImage(act, Wc - w - 54, Hc - h - 59, w, h); }
  g.fillStyle = '#15131a'; g.textAlign = 'left';
  const maxW = Wc - 54 - actW - 100;
  g.font = '700 28px "Space Grotesk", sans-serif'; fitText(g, `Sprayed on: ${P.name || 'EVADE merch'}`, 54, Hc - 100, maxW);
  g.font = '500 22px "Space Grotesk", sans-serif'; fitText(g, `${location.host}/sb/${ID}`, 54, Hc - 64, maxW);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}
function fitText(g, s, x, y, max) { while (s.length > 4 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; g.fillText(s, x, y); }
$('b-save').onclick = async () => {
  const b = $('b-save'); if (b.disabled) return;
  b.disabled = true;
  try {
    if (!artBlob) artBlob = makeArtwork();
    const blob = await artBlob, name = `spray-bobo-${ID}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Spray Bobo' }); }
      catch (e) { if (e && e.name !== 'AbortError') download(blob, name); }
    } else download(blob, name);
  } catch (e) { console.error(e); artBlob = null; toast("Couldn't make the image. Try again"); }
  b.disabled = false;
};
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Image saved');
}

// ---------------------------------------------------------------- Share: the link
$('b-share').onclick = async () => {
  const url = shareUrl();
  if (navigator.share) {
    try { await navigator.share({ title: 'Spray Bobo', text: 'Look at this painting, sprayed on EVADE merch', url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  if (await copy(url)) toast('Link copied'); else toast(url, 6000);
};
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
  try {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}

// ---------------------------------------------------------------- Report
const rep = $('report');
let reported = false; try { reported = sessionStorage.getItem('sb-rep-' + ID) === '1'; } catch (e) { /* none */ }
function syncReport() { $('b-report').textContent = reported ? 'Reported' : 'Report'; $('b-report').setAttribute('aria-label', reported ? 'Reported. Thanks' : 'Report this painting'); }
syncReport();
$('b-report').onclick = () => {
  rep.querySelector('.rep-ask').hidden = reported; rep.querySelector('.rep-done').hidden = !reported; $('rep-err').hidden = true;
  if (rep.showModal) rep.showModal(); else rep.setAttribute('open', '');
};
$('rep-go').onclick = async () => {
  const b = $('rep-go'); b.disabled = true; $('rep-err').hidden = true;
  try {
    const r = await fetch(`/api/spray/creations/${encodeURIComponent(ID)}/report`, { method: 'POST' });
    if (!r.ok) throw new Error('report ' + r.status);
    reported = true; try { sessionStorage.setItem('sb-rep-' + ID, '1'); } catch (e) { /* none */ }
    syncReport(); rep.querySelector('.rep-ask').hidden = true; rep.querySelector('.rep-done').hidden = false;
    rep.querySelector('.rep-done .btn').focus();
  } catch (e) { $('rep-err').hidden = false; }
  b.disabled = false;
};
rep.addEventListener('click', (e) => { if (e.target === rep) rep.close(); });   // tap outside the sheet

// automated tests (?test): read the state from outside
if (params.has('test')) window.__sbv = { get phase() { return life.phase; }, get id() { return ID; }, art: () => artBlob, life, get scene() { return scn.group; }, get card() { return cardGroup; },
  decals: () => dec.layers.map((L) => ({ id: L.id, on: dec.on, shown: !!(dec.group && dec.group.visible) && L.mesh.visible, popping: !!L.pop, order: L.mesh.renderOrder, u: L.u, v: L.v, w: L.w, r: L.r, f: L.f, rotZ: L.mesh.rotation.z, sx: L.mesh.scale.x, sy: L.mesh.scale.y, tex: [L.art.canvas.width, L.art.canvas.height] })), get decalGroup() { return dec.group; } };

load();
