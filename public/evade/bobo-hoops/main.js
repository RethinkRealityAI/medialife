// Bobo Hoops: from an image target to world-tracked AR in one session.
//
//  1. find     Point at the Eclipse can charm (kc-can / kc-can-back, the Off the Chain targets). A scan line sweeps the
//              charm (Bobo X-Ray's scanner), the printed can turns into a dark cut-out with a cyan rim, and the 3D
//              Eclipse can (the same Blender GLB as Off the Chain) pops out of it and hovers, fizzing.
//  2. ready    "Play Some Hoops".
//  3. grow     The can leaves the charm, grows and spins out in front of the phone.
//  4. placing  "Point at the floor": the can hovers over a ring on the floor (or a table), pinch to size it, Place.
//  5. drop     It slams down, its lid pops off: an open-top can.
//  6. play     10 balls. Swipe up from the bottom: the camera aims (yaw and how high the arc starts), the length of
//              the swipe is the power. Optional dotted aim arc (Off / Short / Full). Physics is a small custom solver
//              against the can's real profile (body, shoulder, rim torus, inner wall, floor).
//
// ONE ENGINE: 8th Wall's distributed engine binary (@8thwall/engine-binary, Niantic Spatial licence) runs image
// targets and SLAM together (XrController.configure({ disableWorldTracking: false, imageTargetData })), and gives the
// image target's pose in the same world frame as the floor. So the handoff is just "take the can's world transform
// off the charm and keep animating it in world space": no second engine, no restart, no recentre.
// The image target pose is in SLAM units, not the print's real size, so at the handoff the can is slid along the
// camera ray to a believable distance (same picture on screen, see takeOffCharm).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.THREE = THREE;                         // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KC = '/evade/keychain-ar/';             // Off the Chain: image targets
const LIVE_SITE = /(^|\.)medialife\.ai$/i.test(location.hostname);
const SHOW_DIAG = params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname);
// phones and tablets only: a touchscreen laptop is NOT a phone (the engine refuses it with "No valid session manager")
const PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const easeOut = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const easeInOut = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const easeOutBack = (x) => { x = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* no haptics */ } };
const store = { get(k, d) { try { const v = localStorage.getItem('bobo-hoops-' + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bobo-hoops-' + k, String(v)); } catch (e) { /* none */ } } };

// ---------------------------------------------------------------- the keychain and the can (metres)
const TARGETS = ['kc-can', 'kc-can-back'];
const PXM = 14000;                            // charm pictures: 14 px per mm (as Off the Chain)
const CHARM = { w: 434 / PXM, h: 805 / PXM }; // the can charm's frame
// The can GLB is 0.99 units tall; its profile (radius against height, model units), measured from the mesh:
// straight body to 0.79, shoulder in to the neck (0.222) at 0.945, where the lid was. The lid is cut off in play.
const TOP_Y = 0.945, NECK_R = 0.222, BODY_R = 0.2705, BASE_Y = 0.07, RIM_T = 0.013;
const rOut = (y) => (y < 0.79 ? BODY_R : y < TOP_Y ? lerp(BODY_R, NECK_R, (y - 0.79) / (TOP_Y - 0.79)) : NECK_R);
const rIn = (y) => rOut(y) - 0.012;
// hoop size: the can's height on the floor (pinch while placing)
const HOOP_MIN = 0.25, HOOP_MAX = 1.2;
let hoopH = clamp(+store.get('hoop', 0.6) || 0.6, HOOP_MIN, HOOP_MAX);
const CAM_H = 1.3;                            // camera start height (sets the world scale: ~1 unit = 1 m on a floor)
const G = 9.8;                                // real gravity, metres
const BALLS = 10;
let guideMode = ['off', 'short', 'full'].includes(store.get('guide', 'short')) ? store.get('guide', 'short') : 'short';

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
  rumble(d = 1.6) { this.tone(46, 96, d, 0.3, 'sawtooth'); this.tone(69, 150, d, 0.12, 'square'); this.noise(d, 0.05, 60, 420); this.tone(300, 2400, d * 0.92, 0.05, 'triangle', d * 0.08); },
  ballPop() { const f = 380 + Math.random() * 260; this.tone(f, f * 2.2, 0.09, 0.07, 'triangle'); this.noise(0.05, 0.04, 2000, 9000); },
  scan() { for (let i = 0; i < 6; i++) this.tone(1500 + i * 120, 1500 + i * 120, 0.05, 0.03, 'square', i * 0.11); },
  pop() { this.tone(240, 900, 0.16, 0.12, 'triangle'); this.noise(0.12, 0.08, 1500, 8000); },
  fizz() { this.noise(0.7, 0.1, 3000, 12000); this.tone(1400, 2600, 0.12, 0.03, 'sine', 0.05); },
  grow() { this.tone(160, 640, 1.1, 0.09, 'sawtooth'); this.noise(1.1, 0.05, 400, 3000); },
  thud() { this.tone(120, 40, 0.35, 0.3, 'sine'); this.noise(0.25, 0.14, 60, 900); },
  lid() { this.tone(900, 1900, 0.09, 0.06, 'triangle'); this.noise(0.4, 0.09, 2500, 12000, 0.03); },
  throwIt() { this.noise(0.18, 0.05, 1500, 6000); },
  rim(v) { const f = 1700 + Math.random() * 300; this.tone(f, f * 0.98, 0.35, Math.min(0.08, 0.02 + v * 0.02), 'triangle'); this.tone(f * 1.51, f * 1.5, 0.25, 0.02, 'sine'); },
  wall(v) { if (v > 0.4) this.tone(420, 300, 0.12, Math.min(0.08, 0.02 + v * 0.015), 'triangle'); },
  bounce(v) { if (v > 0.5) this.tone(260 + v * 40, 160, 0.08, Math.min(0.07, 0.015 + v * 0.012), 'sine'); },
  swish() { this.noise(0.35, 0.12, 2500, 9000); },
  score(n) { [784, 988, 1175, 1568].slice(0, 2 + Math.min(n, 2)).forEach((f, i) => this.tone(f, f, 0.14, 0.06, 'triangle', i * 0.07)); },
  cheer() { this.noise(1.4, 0.06, 500, 4000); for (let i = 0; i < 4; i++) this.tone(600 + Math.random() * 500, 700 + Math.random() * 500, 0.2, 0.02, 'triangle', 0.1 + i * 0.18); },
  miss() { this.tone(330, 220, 0.25, 0.05, 'triangle'); },
  mew() { this.tone(620, 880, 0.14, 0.07, 'triangle'); this.tone(880, 560, 0.22, 0.07, 'triangle', 0.13); },
  click() { this.tone(1200, 900, 0.05, 0.05, 'triangle'); },
};

// ---------------------------------------------------------------- loading
const loadTex = (src) => new Promise((res, rej) => new THREE.TextureLoader().load(src, res, undefined, rej));
const getJson = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); });
const gl = new GLTFLoader();
const assets = Promise.all([
  getJson(KC + 'image-targets/layout.json'),
  Promise.all(TARGETS.map((n) => getJson(KC + `image-targets/${n}.json`))),
  gl.loadAsync('/evade/keychain/ar/eclipse-can.glb'),
]).then(async ([layout, tdata, can]) => {
  // each charm picture's portal mask = the WHOLE acrylic piece (Off the Chain's masks). The can-shaped silhouette in
  // the GLB left the charm's light acrylic edge bare round the cut-out: the "white border" on first scan (Dapo,
  // 2026-11-22). flipY off: the glTF uv convention, like the model's own mask.
  const masks = {};
  await Promise.all(TARGETS.map((n) => { const mk = layout.targets[n] && layout.targets[n].mask; if (!mk) return null;
    return new THREE.TextureLoader().loadAsync(KC + 'image-targets/' + mk.src).then((t) => { t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; masks[n] = t; }).catch(() => { /* falls back to the model's silhouette */ }); }));
  return { layout, tdata, can, masks };
});
const boboAsset = assets.then(() => gl.loadAsync('/evade/keychain/ar/bobo-keychain.glb')).catch(() => null);   // Bobo cheers by the can (after the can: it is not needed to start)
const xrReady = new Promise((res) => (window.XR8 ? res() : window.addEventListener('xrloaded', () => res(), { once: true })));
let loaded = false;
Promise.all([assets, xrReady]).then(() => { loaded = true; $('b-start').disabled = false; $('b-start').textContent = 'Start'; $('load').hidden = true; })
  .catch((e) => showError('Couldn\'t load Bobo Hoops', String((e && e.message) || e)));
setTimeout(() => { if (!window.XR8) showError('The AR engine didn\'t load', 'Check your connection and try again.'); }, 30000);

// ---------------------------------------------------------------- scene
let scene, camera, renderer;
const A = new THREE.Group();                  // follows the charm picture (children in metres of the print)
const CF = new THREE.Group(); A.add(CF);      // the can charm's frame inside the picture
const canRoot = new THREE.Group();            // the can: model units inside (0.99 tall); its transform says where and how big
let canModel = null, canMixer = null, canClips = {}, canMats = [], bindPose = [];
let lie = null;                               // where the can lies exactly over its print, in the charm frame
let portal = null;                            // the activation on the charm: glowing rim + swirling portal (Off the Chain's shader)
const burst = [];                             // the basketballs that burst out of the portal before the can
let sparks = null;
const inner = new THREE.Group();              // the open top: inner wall, inner floor, rim (shown once the lid is off)
let lidFly = null;                            // the lid that pops off
const clipTop = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);   // cuts the lid off the can (world space)
const reticle = new THREE.Group();
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
const dust = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
const hoop = { pos: new THREE.Vector3(), yaw: 0, s: 1 };   // the placed can (world): floor point, facing, metres per model unit
let bobo = null, boboMixer = null, boboClips = {}, boboAct = null;

// ---------------------------------------------------------------- the activation (Off the Chain's portal shader)
// One quad over the whole acrylic piece, cut by its mask. uGlow lights a border round the piece, uPortal fills it with
// a swirling portal. Copied from /evade/keychain-ar/main.js (keep the two in step); colours: basketball orange, EVADE
// gold, Bobo Hoops cyan. The soft halo is baked once (bakeMask: red = mask, green = halo) so the live shader reads one
// texel per pixel.
const HALO_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uAspect;
  void main() {
    float halo = 0.0;
    for (int i = 0; i < 12; i++) {
      float an = float(i) * 0.5236; vec2 d = vec2(cos(an), sin(an) * uAspect);
      halo += texture2D(map, vUv + d * 0.022).a + texture2D(map, vUv + d * 0.05).a * 0.7;
    }
    gl_FragColor = vec4(texture2D(map, vUv).a, halo / 20.4, 0.0, 1.0);
  }`;
const PORTAL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D map; uniform float uTime, uGlow, uPortal, uBlack, uAspect;
  uniform vec3 uA, uB, uC;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value noise that repeats every P cells across (and every 256 down, which also keeps the hash inputs small)
  float noise(vec2 p, float P) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, P), x1 = mod(i.x + 1.0, P), y0 = mod(i.y, 256.0), y1 = mod(i.y + 1.0, 256.0);
    return mix(mix(hash(vec2(x0, y0)), hash(vec2(x1, y0)), f.x), mix(hash(vec2(x0, y1)), hash(vec2(x1, y1)), f.x), f.y); }
  float fbm(vec2 p, float P) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p, P); p = p * 2.0 + 7.1; P *= 2.0; a *= 0.5; } return v; }
  void main() {
    vec2 m = texture2D(map, vUv).rg; float a = m.r, halo = m.g;
    vec2 q = (vUv - 0.5) * vec2(1.0, 1.0 / uAspect); float r = length(q), ang = atan(q.y, q.x);
    float rim = smoothstep(0.0, 0.55, halo) * (1.0 - a);                    // outside the cut-out
    float edge = a * (1.0 - smoothstep(0.55, 1.0, halo));                   // just inside it
    float sweep = 0.5 + 0.5 * sin(ang * 2.0 - uTime * 3.2);
    vec3 rimCol = mix(uA, uC, sweep) * (1.1 + 0.5 * sin(uTime * 9.0 + ang * 5.0));
    // portal: a spiral falling into the middle (8 and 16 noise cells round the circle: seamless)
    float sw = ang + 1.6 / (r + 0.18) - uTime * 1.5;
    float n = fbm(vec2(sw * 1.27324, r * 5.0 - uTime * 0.9), 8.0);
    float n2 = fbm(vec2(sw * 2.54648 + 3.0, r * 9.0 + uTime * 0.6), 16.0);
    vec3 pc = mix(uB * 0.35, uA, smoothstep(0.25, 0.75, n));
    pc = mix(pc, uC, smoothstep(0.55, 0.9, n2) * 0.8);
    pc += vec3(1.0) * pow(n * n2 * 2.2, 3.0) * 0.9;                         // sparks in the swirl
    pc *= mix(0.12, 1.25, smoothstep(0.0, 0.42, r));                        // dark at the centre: it has depth
    pc += rimCol * edge * 1.4;
    float inA = a * max(uBlack, uPortal);
    vec3 inside = pc * uPortal * a + rimCol * edge * uGlow * 0.9 * a;
    vec3 glow = rimCol * rim * uGlow * 1.5;
    gl_FragColor = vec4(inside + glow, inA);                                // premultiplied: the glow is additive
  }`;
// mask picture -> a small texture holding the mask (red) and its halo (green), rendered once on the GPU
function bakeMask(map, aspect) {
  const img = map.image || {};
  const k = Math.min(1, 512 / Math.max(img.width || 512, img.height || 512));
  const rt = new THREE.WebGLRenderTarget(
    Math.max(2, Math.round((img.width || 512) * k)),
    Math.max(2, Math.round((img.height || 512) * k)),
    { depthBuffer: false },
  );
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, uAspect: { value: aspect } },
    fragmentShader: HALO_FRAG,
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const sc = new THREE.Scene();
  sc.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, new THREE.Camera());
  renderer.setRenderTarget(prev);
  quad.geometry.dispose();
  // the material is NOT disposed: 8th Wall restores the GL program it last saw after its own draws, and a deleted program
  // there logs "useProgram: attempt to use a deleted object" every frame (Bobo Hoops sim, 2026-11-22)
  return rt.texture;
}
function portalMaterial(baked, aspect, a, b, c) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: baked },
      uTime: { value: 0 },
      uGlow: { value: 0 },
      uPortal: { value: 0 },
      uBlack: { value: 0 },
      uAspect: { value: aspect },
      uA: { value: new THREE.Color(a) },
      uB: { value: new THREE.Color(b) },
      uC: { value: new THREE.Color(c) },
    },
    vertexShader:
      "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: PORTAL_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  return m;
}
const PORTAL_COLOURS = [0xff8a2a, 0x6a2a0c, 0x4fd6e8];   // rim/portal: basketball orange, deep court brown, Bobo Hoops cyan
const PORTAL_REST = 1, GLOW_REST = 0.55;                 // once the can is out the portal keeps swirling behind it
const fx = { glow: 0, portal: 0, shake: 0, time: 0 };
// a flat round dot (sparks): one colour, no falloff
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

function buildScene(xr, data) {
  ({ scene, camera, renderer } = xr);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.localClippingEnabled = true;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.65;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x66584a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2, 5, 3); scene.add(sun);
  camera.position.set(0, CAM_H, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  scene.add(A); A.visible = false;
  buildBalls(); buildCan(data.can, data.masks);
  // the floor: reticle ring, the can's shadow, the landing dust ring
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56), ringM), dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), ringM);
  for (const m of [ring, dot]) { m.rotation.x = -Math.PI / 2; reticle.add(m); }
  reticle.visible = false; scene.add(reticle);
  for (const m of [shadow, dust]) { m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m); }
  boboAsset.then((g) => { if (g) { buildBobo(g); warmUp(bobo.userData.wrap); } });
  warmUp();
}
// Compile every shader and upload every texture now, while the camera is still just looking for the charm. Compiling
// at the moment the portal, the balls or the can first appear stalls the engine on a phone (a frozen, smeared frame:
// immersive skill pitfall 13). renderer.compile walks hidden meshes too. The open-top clipping plane is a different
// shader for the can's materials: warm that variant with clones (same program key, so the real ones reuse it).
// Rendered, not just compiled: compile() can't warm clipping variants (three.js reads the clip count only while drawing)
// and its keys can differ from the real draw. So everything is drawn once into a 1x1 scissor of the real canvas (same
// tone mapping and colour space as the real frames; the camera feed covers it next frame), with the scene's lights:
// the hidden pieces shown for that one draw, plus clones of the can with its top cut off and a game ball.
function warmUp(root) {
  try {
    const shown = [], g = new THREE.Group();
    (root || scene).traverse((o) => { if (!o.visible) { o.visible = true; shown.push(o); } });
    if (!root) {
      const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 99);
      for (const m of canMats) { const c = m.clone(); c.clippingPlanes = [cut]; g.add(new THREE.Mesh(ballGeo, c)); }
      g.add(new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: ballTex.base, roughness: 0.55, metalness: 0 })));
      camera.getWorldDirection(_v); g.position.copy(camera.position).addScaledVector(_v, 1); g.scale.setScalar(0.01);
      scene.add(g);
    }
    const cull = []; scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; cull.push(o); } });
    const sz = renderer.getSize(new THREE.Vector2()), ac = renderer.autoClear;
    renderer.setScissorTest(true); renderer.setScissor(0, 0, 1, 1); renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.setScissorTest(false); renderer.setScissor(0, 0, sz.x, sz.y); renderer.autoClear = ac;
    for (const o of cull) o.frustumCulled = true;
    for (const o of shown) o.visible = false;
    scene.remove(g);
    if (renderer.initTexture) (root || scene).traverse((o) => { const m = o.material; if (m) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]) renderer.initTexture(m[k]); if (m && m.uniforms && m.uniforms.map && m.uniforms.map.value) renderer.initTexture(m.uniforms.map.value); });
    diag.programs = renderer.info.programs ? renderer.info.programs.length : null;
  } catch (e) { diag.errors.push('warm: ' + String(e && e.message).slice(0, 120)); }
}

const portalMasks = {};
const BURST_N = 14;
function buildCan(gltf, masks) {
  canModel = gltf.scene;
  canModel.traverse((o) => {
    bindPose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.material = o.material.clone(); canMats.push(o.material);
  });
  canMixer = new THREE.AnimationMixer(canModel);
  for (const c of gltf.animations) canClips[c.name] = c;
  // the silhouette quad that ships in the GLB fixes where the model lies over its print: (charm frame) x (silhouette
  // matrix)^-1. Its picture is only the fallback portal mask (the can's shape): the charm pictures' own masks cover
  // the whole acrylic piece, so no bare acrylic edge shows round the portal.
  const s0 = canModel.getObjectByName('Silhouette'); s0.updateMatrix(); const silLocal = s0.matrix.clone(); s0.removeFromParent();
  const own = s0.material.map; own.wrapS = own.wrapT = THREE.ClampToEdgeWrapping; own.needsUpdate = true;
  portalMasks.own = { tex: bakeMask(own, CHARM.w / CHARM.h), w: CHARM.w, h: CHARM.h };
  for (const [n, tex] of Object.entries(masks || {})) { const mk = layout.targets[n].mask; portalMasks[n] = { tex: bakeMask(tex, mk.widthM / mk.heightM), w: mk.widthM, h: mk.heightM }; }
  portal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), portalMaterial(portalMasks.own.tex, CHARM.w / CHARM.h, ...PORTAL_COLOURS));
  portal.renderOrder = 3; portal.frustumCulled = false; portal.name = 'portal'; canRoot.name = 'canRoot';
  portal.position.z = 0.0004; portal.scale.set(CHARM.w, CHARM.h, 1); portal.userData.on = 'own';
  CF.add(portal);
  // the burst: balls (the game's own ball, at charm scale) and flat sparks, all in the charm frame
  for (let i = 0; i < BURST_N; i++) {
    const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: i % 5 === 4 ? ballTex.money : ballTex.base, roughness: 0.55, metalness: 0, transparent: true }));
    m.visible = false; m.renderOrder = 6; m.frustumCulled = false; CF.add(m); burst.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), t: -1, life: 1, at: 0 });
  }
  const N = 60, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), color: 0xffd27a, size: 0.0022, transparent: true, depthWrite: false, opacity: 0, alphaTest: 0.3 }));
  sparks.frustumCulled = false; sparks.renderOrder = 7; sparks.userData = { vel: new Float32Array(N * 3), life: new Float32Array(N), next: 0 }; CF.add(sparks);
  const L = new THREE.Matrix4().makeScale(CHARM.w, CHARM.h, 1).multiply(silLocal.clone().invert());
  lie = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), sc: new THREE.Vector3() }; L.decompose(lie.pos, lie.quat, lie.sc);
  lie.pos.z += 0.0025;
  canRoot.add(canModel); CF.add(canRoot); canRoot.visible = false;
  // the open top: an inner wall (back faces of a lathe a wall's thickness in), an inner floor, a rolled rim
  const alu = new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.75, roughness: 0.32 });
  const pts = []; for (let i = 0; i <= 24; i++) { const y = BASE_Y + (TOP_Y - BASE_Y) * i / 24; pts.push(new THREE.Vector2(rIn(y), y)); }
  const wall = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), new THREE.MeshStandardMaterial({ color: 0x7b848c, metalness: 0.6, roughness: 0.45, side: THREE.BackSide }));
  const floorIn = new THREE.Mesh(new THREE.CircleGeometry(rIn(BASE_Y), 40), new THREE.MeshStandardMaterial({ color: 0x4d555c, metalness: 0.5, roughness: 0.6 }));
  floorIn.rotation.x = -Math.PI / 2; floorIn.position.y = BASE_Y + 0.002;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(NECK_R, RIM_T, 10, 56), alu); rim.rotation.x = Math.PI / 2; rim.position.y = TOP_Y;
  const rimLine = new THREE.Mesh(new THREE.TorusGeometry(NECK_R, RIM_T * 1.45, 8, 56), new THREE.MeshBasicMaterial({ color: 0x15131a, side: THREE.BackSide }));
  rimLine.rotation.x = Math.PI / 2; rimLine.position.y = TOP_Y;
  inner.add(wall, floorIn, rim, rimLine); inner.visible = false; canRoot.add(inner);
  // the lid that pops off (a flat aluminium disc + the tab)
  lidFly = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(NECK_R, NECK_R, 0.02, 40), alu); lidFly.add(disc);
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.18), alu); tab.position.set(0, 0.016, 0.05); lidFly.add(tab);
  lidFly.visible = false; canRoot.add(lidFly);
}
function resetCanPose() { canMixer.stopAllAction(); for (const [o, p, q, s] of bindPose) { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); } }
function playCan(name, loop = true) {
  const c = canClips[name]; if (!c) return null;
  canMixer.stopAllAction(); const a = canMixer.clipAction(c); a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.play(); return a;
}
function setOpenTop(on) {
  inner.visible = on;
  for (const m of canMats) { m.clippingPlanes = on ? [clipTop] : null; m.needsUpdate = true; }
  for (const n of ['Can_Tab', 'Can_Rivet', 'Can_Opening']) { const o = canModel.getObjectByName(n); if (o) o.visible = !on; }
  for (let i = 1; i <= 7; i++) { const o = canModel.getObjectByName('Can_Fizz_' + i); if (o) o.visible = !on; }
}

function buildBobo(g) {
  bobo = g.scene; bobo.visible = false;
  const s0 = bobo.getObjectByName('Silhouette'); if (s0) s0.removeFromParent();
  bobo.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  boboMixer = new THREE.AnimationMixer(bobo);
  for (const c of g.animations) boboClips[c.name] = c;
  const sit = boboClips.Sit && boboMixer.clipAction(boboClips.Sit); if (sit) sit.play(); boboMixer.update(0); bobo.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bobo, true); bobo.userData.h = box.max.y - box.min.y; bobo.userData.y0 = box.min.y;
  bobo.userData.wrap = new THREE.Group(); bobo.userData.wrap.add(bobo); scene.add(bobo.userData.wrap);
  boboAct = sit;
}
function boboDo(name) {
  if (!bobo || !boboClips[name]) return;
  const a = boboMixer.clipAction(boboClips[name]); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true;
  a.crossFadeFrom(boboAct, 0.2, false); a.play();
  const back = () => { boboMixer.removeEventListener('finished', back); const s = boboMixer.clipAction(boboClips.Sit); s.reset(); s.play(); s.crossFadeFrom(a, 0.3, false); boboAct = s; };
  boboMixer.addEventListener('finished', back); boboAct = a;
}
function placeBobo(on) {
  if (!bobo) return; const w = bobo.userData.wrap;
  bobo.visible = on; if (!on) return;
  const h = hoopH * 0.62, k = h / bobo.userData.h;
  bobo.scale.setScalar(k); bobo.position.y = -bobo.userData.y0 * k;
  const side = new THREE.Vector3(Math.cos(hoop.yaw), 0, -Math.sin(hoop.yaw));   // the can's right (as the player sees it)
  w.position.copy(hoop.pos).addScaledVector(side, BODY_R * hoop.s + h * 0.55);
  w.rotation.y = hoop.yaw - 0.35;
  w.userData.pop = 0;
}

// ---------------------------------------------------------------- tracking (image target)
const TS = {};
let layout = null;
function initTargets(targets, lay) {
  layout = lay;
  for (const t of targets) {
    const c = lay.targets[t.name].charms.can;
    const local = new THREE.Matrix4().makeTranslation(c.x, c.y, 0).multiply(new THREE.Matrix4().makeRotationZ(c.rz)).multiply(new THREE.Matrix4().makeScale(c.mirror ? -c.s : c.s, c.s, c.s));
    TS[t.name] = { name: t.name, pr: t.properties, H: lay.targets[t.name].heightM, local, mirror: !!c.mirror, tracked: false, at: 0, gap: 40, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 };
  }
}
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  const upp = d.scale * (d.scaledHeight || 1) / t.pr.height;          // world units per target pixel
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w); t.p.set(d.position.x, d.position.y, d.position.z);
  t.s = t.pr.height * upp / t.H;                                       // world units per metre of the print
  const now = performance.now();
  if (!t.tracked) { diag.found++; } else t.gap += (clamp(now - t.at, 8, 400) - t.gap) * 0.2;
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; diag.lost++; } }
let side = null;
function pickSide() {
  const on = Object.values(TS).filter((t) => t.tracked);
  if (!on.length) return side;
  if (!side || !TS[side].tracked) side = on[0].name;
  return side;
}
const pose = { state: 'none', lostAt: 0, snap: true, goneAt: 0 };
function updatePose(now) {
  for (const x of Object.values(TS)) if (x.tracked && now - x.at > clamp(x.gap * 3, 120, 300)) x.tracked = false;   // the engine went quiet
  const n = pickSide(), t = n && TS[n];
  let st;
  if (t && t.tracked) { st = 'track'; pose.lostAt = now; follow(t); }
  else st = pose.state !== 'none' && now - pose.lostAt < 150 ? 'hold' : 'none';   // a blink only: nothing shows unless tracked now
  if (st === 'none' && pose.state !== 'none') pose.goneAt = now;
  if (st === 'none') pose.snap = true;
  const fresh = st !== 'none' && pose.state === 'none';
  pose.state = st; A.visible = st !== 'none';
  if (fresh) arrived(now);
}
function follow(t) {
  const s = t.s, p = t.p, q = t.q;
  const aP = pose.snap ? 1 : clamp(A.position.distanceTo(p) / s / 0.0015, 0.5, 1);
  const aR = pose.snap ? 1 : clamp(A.quaternion.angleTo(q) / 0.03, 0.5, 1);
  // scale snaps too on a fresh find. It used to read pose.snap AFTER clearing it, so the first frames lerped from the
  // previous scale (1 at the start, i.e. many times too big): the cut-out flashed up giant over the whole screen.
  const aS = pose.snap ? 1 : 0.6;
  pose.snap = false;
  A.position.lerp(p, aP); A.quaternion.slerp(q, aR); A.scale.setScalar(lerp(A.scale.x, s, aS));
  CF.matrix.copy(t.local); CF.matrix.decompose(CF.position, CF.quaternion, CF.scale);
  usePortalMask(t);
  // the back of the charm: the can turns round to show its back (QR side) rather than reading as a mirror image
  canModel.scale.z = t.mirror ? -1 : 1;
  A.updateMatrixWorld(true);
}

// the charm picture in view decides the portal's mask (its whole acrylic piece), placed in the charm frame
const _mm = new THREE.Matrix4();
function usePortalMask(t) {
  const want = portalMasks[t.name] ? t.name : 'own';
  if (!portal || portal.userData.on === want) return;
  const m = portalMasks[want], u = portal.material.uniforms; portal.userData.on = want;
  u.map.value = m.tex; u.uAspect.value = m.w / m.h;
  if (want === 'own') { portal.position.set(0, 0, 0.0004); portal.quaternion.identity(); portal.scale.set(m.w, m.h, 1); return; }
  _mm.copy(t.local).invert().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.0004)).multiply(new THREE.Matrix4().makeScale(m.w, m.h, 1));
  _mm.decompose(portal.position, portal.quaternion, portal.scale);
}

// ---------------------------------------------------------------- the flow
let mode = 'find';
function setMode(m) { mode = m; $('hud').dataset.mode = m; $('b-move-can').hidden = !(m === 'play' || m === 'drop'); diag.steps.push([m, Math.round(performance.now())]); }
const reveal = { t: -1 };
function arrived(now) {
  if (mode === 'find' || (mode === 'ready' && now - pose.goneAt > 2500)) {
    if (mode === 'find' && !diag.firstFoundS) { diag.firstFoundS = +((now - camStartAt) / 1000).toFixed(1); postEvent('found', {}); }
    setMode('reveal'); reveal.t = 0; reveal.popped = false; reveal.burst = false; hint('');
    resetCanPose(); canRoot.visible = false; Object.assign(fx, { glow: 0, portal: 0, shake: 0 });
    for (const b of burst) { b.t = -11; b.m.visible = false; }
    sound.rumble(CHARGE_S); buzz([70, 50, 70, 50, 90, 40, 160].map((x) => Math.round((x * CHARGE_S) / 1.7)));
    $('b-play').hidden = true;
  }
}
// reveal (Dapo, 2026-11-22): Off the Chain's shimmering activation (a rim lights up round the whole acrylic piece, it
// rumbles, a portal opens), then a burst of basketballs pops out of the portal, then the can pops out (PopOut clip).
const CHARGE_S = REDUCED ? 1.0 : 1.6, BURST_S = 0.55, CAN_AT = CHARGE_S + BURST_S + 0.55;   // the can waits for the balls to clear
function tickReveal(dt) {
  if (mode !== 'reveal' && mode !== 'ready') return;
  const vis = A.visible;
  if (mode === 'reveal') {
    reveal.t += dt; const t = reveal.t;
    // the build-up (Off the Chain's charge(): same curves)
    if (t < CHARGE_S) {
      const k = t / CHARGE_S;
      fx.glow = easeOut(k * 2.2) * (0.8 + 0.35 * k); fx.portal = easeInOut((k - 0.22) / 0.55); fx.shake = REDUCED ? 0 : easeInOut(k * 1.5) * (0.4 + 0.9 * k);
    } else {
      const k = clamp((t - CHARGE_S) / 0.8, 0, 1);
      fx.glow = lerp(1.15, GLOW_REST, easeInOut(k)); fx.portal = PORTAL_REST; fx.shake = 0;
    }
    // the basketballs: one after another out of the portal
    if (t >= CHARGE_S && !reveal.burst) { reveal.burst = true; launchBurst(); }
    canRoot.visible = t > CAN_AT;
    if (t > CAN_AT && !reveal.popped) {
      reveal.popped = true; placeOnCharm(0, 0.12); sound.pop(); sound.fizz(); buzz(20);
      const a = playCan('PopOut', false); reveal.popLen = a ? canClips.PopOut.duration : 0.8;
    }
    if (reveal.popped) {
      // lift off the print: the clip does the jump, we fill out its depth and float it a little in front
      const k2 = clamp((t - CAN_AT) / 0.6, 0, 1);
      placeOnCharm(0, lerp(0.12, 1, easeOut(k2)), 0.012 * easeOut(k2));
      if (t > CAN_AT + reveal.popLen) { playCan('Idle'); setMode('ready'); }
    }
  } else {
    fx.glow = GLOW_REST; fx.portal = PORTAL_REST;
    placeOnCharm(0, 1, 0.012 + Math.sin(clock.t * 2.4) * 0.002);
  }
  $('b-play').hidden = !(mode === 'ready' && vis);
  if (mode === 'ready') hint(vis ? '' : 'Point at the can again');
}
// push the activation into the shader (the build-up throbs in light rather than shaking the quad: a jittering quad
// read as the whole picture shaking on iPhone, Off the Chain 2026-11-11)
function tickPortal(dt) {
  if (!portal) return;
  fx.time += dt; const u = portal.material.uniforms;
  const throb = 1 + Math.min(fx.shake, 1.5) * 0.35 * Math.sin(fx.time * 22.0);
  u.uTime.value = fx.time; u.uGlow.value = fx.glow * (0.86 + 0.14 * Math.sin(fx.time * 5.0)) * throb; u.uPortal.value = fx.portal; u.uBlack.value = 0;
}
// The burst: ~14 balls (the game's own ball, at charm scale: about 9 mm across) leave the portal one after another,
// out towards the phone and up, arc under real "down" (gravity from the SLAM world, turned into the charm frame), spin,
// and shrink away. Gold balls, every fifth the cyan money ball.
const BALL_R = 0.0045, _g = new THREE.Vector3(), _qi = new THREE.Quaternion();
function launchBurst() {
  const mw = CHARM.w * 0.32, mh = CHARM.h * 0.32;
  burst.forEach((b, i) => {
    b.t = -(i / BURST_N) * BURST_S; b.life = 1.05 + Math.random() * 0.35; b.fired = false;
    const a = (i / BURST_N) * Math.PI * 2 + Math.random() * 0.5;
    b.m.position.set(Math.cos(a) * mw * 0.4, Math.sin(a) * mh * 0.3, 0.003);
    // a fountain: out of the portal, up and to the sides, a little towards the phone (not into it)
    const sp = 0.07 + Math.random() * 0.06;
    b.v.set(Math.cos(a) * sp, 0.13 + Math.random() * 0.1 + Math.max(0, Math.sin(a)) * 0.04, 0.07 + Math.random() * 0.06);
    b.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 6);
    b.m.scale.setScalar(0.001); b.m.visible = false; b.m.material.opacity = 1;
  });
}
function tickBurst(dt) {
  if (!burst.length || !burst.some((b) => b.t > -10)) return;
  // world down in the charm frame (the burst falls to the real floor, however the keychain is held)
  CF.getWorldQuaternion(_qi).invert(); _g.set(0, -1, 0).applyQuaternion(_qi).multiplyScalar(0.55);
  for (const b of burst) {
    if (b.t <= -10) continue;
    b.t += dt;
    if (b.t < 0) continue;
    if (!b.fired) { b.fired = true; b.m.visible = true; sound.ballPop(); burstSparks(b.m.position, 6); if (Math.random() < 0.4) buzz(8); }
    const k = b.t / b.life;
    if (k >= 1) { b.m.visible = false; b.t = -11; continue; }
    b.v.addScaledVector(_g, dt);
    b.m.position.addScaledVector(b.v, dt);
    b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
    const grow = easeOutBack(clamp(b.t / 0.18, 0, 1)), shrink = 1 - easeInOut((k - 0.7) / 0.3);
    b.m.scale.setScalar(Math.max(0.0001, BALL_R * grow * shrink));
  }
}
function burstSparks(at, n) {
  const pos = sparks.geometry.attributes.position, u = sparks.userData;
  for (let i = 0; i < n; i++) {
    const j = u.next; u.next = (u.next + 1) % u.life.length;
    const a = Math.random() * Math.PI * 2, sp = 0.03 + Math.random() * 0.05;
    pos.setXYZ(j, at.x, at.y, at.z + 0.002);
    u.vel[j * 3] = Math.cos(a) * sp; u.vel[j * 3 + 1] = Math.sin(a) * sp; u.vel[j * 3 + 2] = 0.02 + Math.random() * 0.04;
    u.life[j] = 0.35 + Math.random() * 0.3;
  }
  pos.needsUpdate = true; sparks.material.opacity = 1;
}
function tickSparks(dt) {
  if (!sparks || sparks.material.opacity === 0) return;
  const pos = sparks.geometry.attributes.position, u = sparks.userData; let any = false;
  for (let j = 0; j < u.life.length; j++) {
    if (u.life[j] <= 0) { pos.setXYZ(j, 0, 0, 50); continue; }   // parked 50 m out towards the viewer: behind the phone, never drawn
    u.life[j] -= dt; any = true;
    pos.setXYZ(j, pos.getX(j) + u.vel[j * 3] * dt, pos.getY(j) + u.vel[j * 3 + 1] * dt, pos.getZ(j) + u.vel[j * 3 + 2] * dt);
  }
  pos.needsUpdate = true; if (!any) sparks.material.opacity = 0;
}
function placeOnCharm(wiggle, depthK, lift = 0) {
  canRoot.position.copy(lie.pos); canRoot.position.z += lift;
  canRoot.quaternion.copy(lie.quat); if (wiggle) canRoot.rotateZ(wiggle);
  canRoot.scale.set(lie.sc.y, lie.sc.y, lie.sc.y * depthK);
}

// Play Some Hoops: the can leaves the charm. Its world transform comes off the charm (scene.attach keeps it). The
// target pose is in SLAM units, which need not match the print's real size, so slide it along the camera ray to
// 30 cm away and shrink it by the same factor: the same picture on screen, now at a sensible depth to grow from.
const grow = { t: -1, p0: new THREE.Vector3(), q0: new THREE.Quaternion(), s0: 1 };
function takeOffCharm() {
  sound.click(); sound.grow(); buzz(15);
  $('b-play').hidden = true;
  scene.attach(canRoot); canModel.scale.z = 1;   // the label faces you from here on
  const cam = camera.position, d0 = canRoot.position.distanceTo(cam), k = 0.3 / Math.max(d0, 1e-3);
  grow.p0.copy(cam).addScaledVector(canRoot.position.clone().sub(cam), k);
  grow.q0.copy(canRoot.quaternion); grow.s0 = canRoot.scale.y * k;
  canRoot.position.copy(grow.p0); canRoot.scale.setScalar(grow.s0);
  grow.t = 0; setMode('grow');
  A.visible = false; aWanted = false;
  postEvent('custom', { action: 'hoops-play' });
}
let aWanted = true;                            // the charm's cut-out stays only while we're on the keychain
const GROW_S = 1.3;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function hoverPose(out) {                      // where the can floats while you place it
  if (reticle.visible) { out.p.copy(reticle.position); out.p.y += hoopH * (0.35 + 0.04 * Math.sin(clock.t * 3)); }
  else { camera.getWorldDirection(_v); out.p.copy(camera.position).addScaledVector(_v, 1.2); out.p.y -= 0.25; }
  const yaw = Math.atan2(camera.position.x - out.p.x, camera.position.z - out.p.z);
  out.q.setFromEuler(_e.set(0, yaw, 0)); out.s = hoopH / 0.99; out.yaw = yaw;
}
const hv = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, yaw: 0 };
function tickGrow(dt) {
  if (mode === 'grow') {
    grow.t += dt; const k = clamp(grow.t / GROW_S, 0, 1);
    hoverPose(hv);
    const e = easeOutBack(k), spin = (1 - easeOut(k)) * Math.PI * 3;
    canRoot.position.lerpVectors(grow.p0, hv.p, easeInOut(k)); canRoot.position.y += Math.sin(k * Math.PI) * 0.25;
    _q.slerpQuaternions(grow.q0, hv.q, easeInOut(k)); canRoot.quaternion.copy(_q); canRoot.rotateY(spin);
    canRoot.scale.setScalar(lerp(grow.s0, hv.s, e));
    if (k >= 1) { setMode('placing'); hint('Point at the floor or a table'); }
  } else if (mode === 'placing') {
    hoverPose(hv);
    const a = 1 - Math.exp(-8 * dt);
    canRoot.position.lerp(hv.p, a); canRoot.quaternion.slerp(hv.q, a); canRoot.scale.setScalar(lerp(canRoot.scale.x, hv.s, a));
    $('b-place').hidden = false; $('b-place').disabled = !reticle.visible;
    $('size').hidden = false; $('size').textContent = `Can ${Math.round(hoopH * 100)} cm tall · pinch to size`;
    if (!trackingBad()) hint(reticle.visible ? 'Tap Place when the ring is where you want it' : 'Point at the floor or a table');
  }
}
// the floor: a ray from the middle of the screen to the plane y = 0 (what 8th Wall's own examples do)
const ray = new THREE.Raycaster(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
function tickFloor(dt) {
  const placing = mode === 'grow' || mode === 'placing';
  if (!placing) { reticle.visible = false; return; }
  if (testFloor) { reticle.visible = true; shadow.visible = true; shadow.position.copy(reticle.position); shadow.scale.setScalar(BODY_R * hoopH / 0.99); return; }
  ray.setFromCamera(new THREE.Vector2(0, -0.15), camera);
  let ok = false;
  if (ray.ray.intersectPlane(floorPlane, hit)) { const d = hit.distanceTo(camera.position); ok = d > 0.45 && d < 7; }
  if (ok) {
    if (!reticle.visible) reticle.position.copy(hit); else reticle.position.lerp(hit, 1 - Math.exp(-16 * dt));
    reticle.position.y = 0.002; reticle.scale.setScalar(BODY_R * (hoopH / 0.99) * 1.25);
  }
  reticle.visible = ok;
  shadow.visible = ok; if (ok) { shadow.position.copy(reticle.position); shadow.position.y = 0.001; shadow.scale.setScalar(BODY_R * hoopH / 0.99); }
}
const drop = { t: -1, from: new THREE.Vector3() };
function placeCan() {
  if (!reticle.visible || mode !== 'placing') return;
  sound.click(); store.set('hoop', hoopH.toFixed(2));
  hoop.pos.copy(reticle.position); hoop.pos.y = 0; hoop.s = hoopH / 0.99;
  hoop.yaw = Math.atan2(camera.position.x - hoop.pos.x, camera.position.z - hoop.pos.z);
  drop.from.copy(canRoot.position); drop.q0 = canRoot.quaternion.clone(); drop.t = 0; drop.landed = false;
  $('b-place').hidden = true; $('size').hidden = true; hint('');
  setMode('drop');
}
const DROP_S = 0.42, LID_S = 0.7;
let topOff = false;
function tickDrop(dt) {
  if (mode !== 'drop') return;
  drop.t += dt; const t = drop.t;
  const q = new THREE.Quaternion().setFromEuler(_e.set(0, hoop.yaw, 0));
  if (t < DROP_S) {
    const k = t / DROP_S;
    canRoot.position.lerpVectors(drop.from, hoop.pos, k * k); canRoot.quaternion.slerpQuaternions(drop.q0, q, easeOut(k)); canRoot.scale.setScalar(hoop.s);
  } else {
    if (!drop.landed) {
      drop.landed = true; sound.thud(); buzz([30, 30, 20]);
      dust.visible = true; dust.position.copy(hoop.pos); dust.position.y = 0.003; dust.userData.t = 0;
      if (!topOff) {   // the lid pops off once: the can stays open-topped from then on, even when it is moved
        topOff = true; resetCanPose(); setOpenTop(true);
        lidFly.visible = true; lidFly.position.set(0, TOP_Y + 0.01, 0); lidFly.rotation.set(0, 0, 0); lidFly.userData.v = new THREE.Vector3(0.25, 2.2, 0.6); lidFly.userData.t = 0;
        sound.lid();
      }
    }
    const k = clamp((t - DROP_S) / 0.28, 0, 1);   // squash and stretch on landing
    const sq = 1 - 0.14 * Math.sin(k * Math.PI);
    canRoot.position.copy(hoop.pos); canRoot.quaternion.copy(q);
    canRoot.scale.set(hoop.s * (2 - sq), hoop.s * sq, hoop.s * (2 - sq));
    if (t > DROP_S + LID_S) { canRoot.scale.setScalar(hoop.s); startGame(); }
  }
}
function tickFx(dt) {
  if (dust.visible) {
    const u = dust.userData; u.t += dt; const k = u.t / 0.6;
    dust.scale.setScalar(BODY_R * hoop.s * (1.1 + 1.6 * easeOut(k))); dust.material.opacity = 0.7 * (1 - k);
    if (k >= 1) dust.visible = false;
  }
  if (lidFly.visible && lidFly.userData.v) {
    const u = lidFly.userData; u.t += dt;
    u.v.y -= 4 * dt; lidFly.position.addScaledVector(u.v, dt); lidFly.rotation.x += 9 * dt; lidFly.rotation.z += 4 * dt;
    if (u.t > 0.9) lidFly.visible = false;
  }
  if (bobo && bobo.visible) {
    const w = bobo.userData.wrap; w.userData.pop = Math.min(1, (w.userData.pop || 0) + dt / 0.45);
    w.scale.setScalar(REDUCED ? 1 : easeOutBack(w.userData.pop));
  }
}

// ---------------------------------------------------------------- the game
const BALL_COLS = { base: 0xf6c344, money: 0x4fd6e8 };
const balls = [];
let held = null, ballGeo = null, ballTex = {}, guide = null;
const game = { on: false, left: BALLS, thrown: 0, score: 0, made: 0, swish: 0, streak: 0, best: +store.get('best', 0) || 0, resolved: 0 };
const R = () => hoopH * 0.07;                 // ball radius: the opening is about 3.2 balls across
function ballTexture(col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#' + col.toString(16).padStart(6, '0'); g.fillRect(0, 0, 256, 128);
  g.strokeStyle = '#15131a'; g.lineWidth = 7;                   // the seams of a ball, flat
  g.beginPath(); g.moveTo(0, 64); g.lineTo(256, 64); g.stroke();
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.moveTo(192, 0); g.lineTo(192, 128); g.stroke();
  g.beginPath(); g.ellipse(128, 64, 44, 64, 0, 0, Math.PI * 2); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function buildBalls() {
  ballGeo = new THREE.SphereGeometry(1, 28, 18);
  ballTex.base = ballTexture(BALL_COLS.base); ballTex.money = ballTexture(BALL_COLS.money);
  // the aim arc: flat round dots
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
  const N = 28, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  guide = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 11, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, opacity: 0.9, alphaTest: 0.3 }));
  guide.frustumCulled = false; guide.visible = false; guide.renderOrder = 20; scene.add(guide);
}
const isMoney = (i) => i === BALLS - 1;
function makeBall(money) {
  const m = new THREE.Mesh(ballGeo, new THREE.MeshStandardMaterial({ map: money ? ballTex.money : ballTex.base, roughness: 0.55, metalness: 0 }));
  m.scale.setScalar(R()); scene.add(m); return m;
}
function startGame() {
  setMode('play');
  for (const b of balls) scene.remove(b.m); balls.length = 0;
  Object.assign(game, { on: true, left: BALLS, thrown: 0, score: 0, made: 0, swish: 0, streak: 0, resolved: 0 });
  $('board').hidden = false; $('rack').hidden = false; drawBoard(); drawRack();
  placeBobo(true);
  nextBall(0.2);
  hint('Swipe up to shoot. Longer swipe, more power');
  setTimeout(() => { if (mode === 'play' && game.thrown === 0) hint('Aim with your phone, then swipe up from the bottom'); }, 6000);
}
function nextBall(delay = 0.55) {
  if (held || game.thrown >= BALLS) return;
  held = { m: makeBall(isMoney(game.thrown)), t: -delay, money: isMoney(game.thrown) };
  held.m.visible = false;
}
// the held ball sits low in the middle of the view, rises a little while you swipe
const HOLD_OFF = new THREE.Vector3(0, -0.13, -0.36), HELD_R = 0.016;   // held up close it is drawn small; it grows to its real size as it flies off
function tickHeld(dt) {
  if (!held) return;
  held.t += dt; held.m.visible = held.t > 0;
  const k = easeOutBack(clamp(held.t / 0.3, 0, 1));
  const pull = aim.on ? aim.power : 0;
  _v.copy(HOLD_OFF); _v.y += -0.1 * (1 - k) + pull * 0.03; _v.x += aim.on ? aim.side * 0.04 : 0;
  held.m.position.copy(_v.applyMatrix4(camera.matrixWorld));
  held.m.scale.setScalar(HELD_R * Math.max(0.01, k));
  held.m.rotation.x += dt * 0.8;
}
// aiming: swipe up. power = the swipe's length (0..1 over 65% of the screen height) = how FAR the ball goes: it is
// mapped to a landing distance at the can's rim height (0.6 to 5 m), not to a raw speed, so the same swipe always
// carries the same distance whatever angle you hold the phone at (a raw-speed swipe was ~3 cm of landing per pixel:
// unplayable). side = the swipe's sideways lean.
const aim = { on: false, id: null, x0: 0, y0: 0, power: 0, side: 0 };
function aimFrom(e) {
  const up = aim.y0 - e.clientY, dx = e.clientX - aim.x0;
  aim.power = clamp(up / (innerHeight * 0.65), 0, 1);
  aim.side = clamp(Math.atan2(dx, Math.max(up, 40)), -0.6, 0.6);
}
function launchVelocity(power, sideAng, out) {
  camera.getWorldDirection(_v2);
  const pitch = Math.asin(clamp(_v2.y, -1, 1));
  const h = _v.set(_v2.x, 0, _v2.z); if (h.lengthSq() < 1e-6) h.set(0, 0, -1); h.normalize();
  h.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -sideAng * 0.75);
  let elev = clamp(0.8 + 0.55 * pitch, 0.3, 1.25);   // the arc starts higher when you look up, flatter when you look down
  const D = RANGE_MIN + power * (RANGE_MAX - RANGE_MIN);
  const y0 = launchPoint(_v3).y, yT = (hoopUp() ? hoop.pos.y + TOP_Y * hoop.s : y0 - 0.5);
  let den = D * Math.tan(elev) - (yT - y0);
  if (den < 0.05 * D) { elev = Math.atan((yT - y0 + 0.05 * D) / D + 0.05); den = D * Math.tan(elev) - (yT - y0); }
  const c = Math.cos(elev), speed = Math.min(14, Math.sqrt(G * D * D / (2 * c * c * Math.max(den, 1e-3))));
  return out.copy(h).multiplyScalar(c * speed).setY(Math.sin(elev) * speed);
}
const RANGE_MIN = 0.6, RANGE_MAX = 5;
const _v3 = new THREE.Vector3();
const hoopUp = () => mode === 'play' || mode === 'drop';
function launchPoint(out) { return out.copy(HOLD_OFF).applyMatrix4(camera.matrixWorld); }
function throwBall(power, sideAng) {
  if (!held || held.t < 0.15 || mode !== 'play') return false;
  const b = { m: held.m, p: launchPoint(new THREE.Vector3()), v: launchVelocity(power, sideAng, new THREE.Vector3()), inside: false, rim: 0, wall: 0, outer: 0, rattle: 0, done: false, age: 0, rest: 0, money: held.money, from: 0, idx: game.thrown };
  b.from = Math.hypot(b.p.x - hoop.pos.x, b.p.z - hoop.pos.z);
  balls.push(b); held = null; game.thrown++; game.left--; drawRack();
  sound.throwIt(); buzz(8); diag.throws++; hint('');
  nextBall();
  return true;
}
function predictArc(power, sideAng) {
  const pos = guide.geometry.attributes.position, N = pos.count;
  const p = launchPoint(new THREE.Vector3()), v = launchVelocity(power, sideAng, new THREE.Vector3());
  const tFull = (v.y + Math.sqrt(v.y * v.y + 2 * G * Math.max(0.05, p.y))) / G;   // until it would reach the floor
  const tMax = guideMode === 'full' ? tFull : tFull * 0.34;
  for (let i = 0; i < N; i++) { const t = (i + 1) / N * tMax; pos.setXYZ(i, p.x + v.x * t, p.y + v.y * t - 0.5 * G * t * t, p.z + v.z * t); }
  pos.needsUpdate = true;
}
const canvas = $('cam');
canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, e);
  if (mode === 'placing' && touches.size === 2) { const [a, b] = [...touches.values()]; pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), h: hoopH }; return; }
  if (mode !== 'play' || !held || aim.on) return;
  aim.on = true; aim.id = e.pointerId; aim.x0 = e.clientX; aim.y0 = e.clientY; aim.power = 0; aim.side = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* none */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, e);
  if (pinch0 && touches.size === 2) { const [a, b] = [...touches.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); hoopH = clamp(pinch0.h * d / Math.max(20, pinch0.d), HOOP_MIN, HOOP_MAX); return; }
  if (aim.on && e.pointerId === aim.id) aimFrom(e);
});
const endPointer = (e, cancel) => {
  touches.delete(e.pointerId); if (touches.size < 2) pinch0 = null;
  if (!aim.on || e.pointerId !== aim.id) return;
  aimFrom(e); aim.on = false; guide.visible = false;
  if (!cancel && aim.power > 0.06) throwBall(aim.power, aim.side);
};
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
const touches = new Map(); let pinch0 = null;

// physics: spheres against the can (in its own upright frame: the can stands on the floor, y up), the floor, each other
const SUB = 4;
function tickBalls(dt) {
  if (guide) { guide.visible = aim.on && guideMode !== 'off' && aim.power > 0.03 && mode === 'play'; if (guide.visible) predictArc(aim.power, aim.side); }
  if (!balls.length) return;
  const r = R(), s = hoop.s, cx = hoop.pos.x, cz = hoop.pos.z, fy = hoop.pos.y;
  const topY = fy + TOP_Y * s, neck = NECK_R * s, rimT = RIM_T * s, baseY = fy + BASE_Y * s;
  const h = dt / SUB;
  for (let st = 0; st < SUB; st++) {
    for (const b of balls) {
      if (b.done) continue;
      const py0 = b.p.y;
      b.v.y -= G * h; b.p.addScaledVector(b.v, h);
      let dx = b.p.x - cx, dz = b.p.z - cz, rho = Math.hypot(dx, dz);
      const ux = rho > 1e-6 ? dx / rho : 1, uz = rho > 1e-6 ? dz / rho : 0;
      const ly = (b.p.y - fy) / s;                     // height in can units
      // into the can through the opening
      if (!b.inside && py0 >= topY && b.p.y < topY && rho < neck - r * 0.25) b.inside = true;
      if (b.inside) {
        const lim = rIn(clamp(ly, BASE_Y, TOP_Y)) * s - r;
        if (b.p.y < topY + r && rho > lim) {           // the inner wall
          b.p.x = cx + ux * lim; b.p.z = cz + uz * lim;
          const vn = b.v.x * ux + b.v.z * uz; if (vn > 0) { b.v.x -= 1.5 * vn * ux; b.v.z -= 1.5 * vn * uz; b.wall++; if (b.p.y > topY - 0.3 * TOP_Y * s) b.rattle++; sound.wall(vn); }
        }
        if (b.p.y < baseY + r) { b.p.y = baseY + r; if (b.v.y < 0) { sound.bounce(-b.v.y); b.v.y *= -0.3; } b.v.x *= 0.9; b.v.z *= 0.9; }
        if (b.p.y > topY + r * 1.2) b.inside = false;  // bounced back out
      } else if (b.p.y < topY && rho < rOut(clamp(ly, 0, TOP_Y)) * s + r) {   // the outside of the can
        const lim = rOut(clamp(ly, 0, TOP_Y)) * s + r;
        b.p.x = cx + ux * lim; b.p.z = cz + uz * lim;
        const vn = b.v.x * ux + b.v.z * uz; if (vn < 0) { b.v.x -= 1.5 * vn * ux; b.v.z -= 1.5 * vn * uz; b.wall++; b.outer++; sound.wall(-vn); }
      }
      // the rim: a torus round the opening
      dx = b.p.x - cx; dz = b.p.z - cz; rho = Math.hypot(dx, dz);
      const qx = cx + (rho > 1e-6 ? dx / rho : 1) * neck, qz = cz + (rho > 1e-6 ? dz / rho : 0) * neck;
      _v.set(b.p.x - qx, b.p.y - topY, b.p.z - qz); const dl = _v.length();
      if (dl < r + rimT && dl > 1e-6) {
        _v.multiplyScalar(1 / dl); b.p.set(qx, topY, qz).addScaledVector(_v, r + rimT);
        const vn = b.v.dot(_v); if (vn < 0) { b.v.addScaledVector(_v, -1.55 * vn); b.v.multiplyScalar(0.92); b.rim++; sound.rim(-vn); }
      }
      // the floor round the can
      if (!b.inside && b.p.y < fy + r) {
        b.p.y = fy + r;
        if (b.v.y < 0) { sound.bounce(-b.v.y); b.v.y *= -0.5; }
        b.v.x *= 0.96; b.v.z *= 0.96;
      }
    }
    // ball against ball (a pile in the can)
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j]; if (a.done && c.done) continue;
      _v.subVectors(c.p, a.p); const d = _v.length(); if (d >= 2 * r || d < 1e-6) continue;
      _v.multiplyScalar(1 / d); const push = (2 * r - d) / 2;
      a.p.addScaledVector(_v, -push); c.p.addScaledVector(_v, push);
      const rel = _v2.subVectors(c.v, a.v).dot(_v); if (rel < 0) { a.v.addScaledVector(_v, rel * 0.8); c.v.addScaledVector(_v, -rel * 0.8); }
    }
  }
  for (const b of balls) {
    b.m.position.copy(b.p);
    if (b.done) continue;
    b.age += dt; b.m.rotation.x += b.v.length() * dt * 3;
    b.m.scale.setScalar(lerp(HELD_R, r, easeInOut(b.age / 0.35)));
    if (b.inside && !b.scored && b.p.y < topY - r * 1.6) score(b);
    const slow = b.v.lengthSq() < 0.05;
    b.rest = slow ? b.rest + dt : 0;
    if (b.scored && b.rest > 0.6) b.done = true;       // stays in the can (the pile)
    const far = Math.hypot(b.p.x - cx, b.p.z - cz) > 9 || b.p.y < fy - 3;
    if (!b.inside && !b.scored && (far || b.rest > 0.7 || b.age > 5)) missed(b);
  }
}
function score(b) {
  b.scored = true;
  const sw = b.rim === 0 && b.outer === 0 && b.rattle === 0;   // a swish: clean in (no rim, no outside, no rattle round the top of the wall)
  let pts = sw ? 3 : 2, label = sw ? 'SWISH!' : 'In!';
  const extras = [];
  if (b.from > 2.5) { pts += 1; extras.push('long shot +1'); }
  game.streak++; if (game.streak >= 3) { pts += 1; extras.push(`${game.streak} in a row +1`); }
  if (b.money) { pts *= 2; extras.push('money ball x2'); }
  game.score += pts; game.made++; if (sw) game.swish++;
  popWord(`${label} +${pts}`, extras.join(' · '), b.p, sw || b.money ? 'cyan' : '');
  if (sw) sound.swish(); sound.score(game.streak); buzz(sw ? [20, 30, 20] : 20);
  if (game.streak >= 3 || sw) sound.cheer();
  boboDo(sw ? 'TailWag' : 'PawRaise'); if (sw) sound.mew();
  diag.makes++; resolved();
  $('board').classList.remove('bump'); void $('board').offsetWidth; $('board').classList.add('bump');
}
function missed(b) {
  b.done = true; b.missed = true; game.streak = 0;
  popWord(b.rim ? 'Rimmed out' : 'Miss', '', b.p, 'miss'); sound.miss();
  setTimeout(() => { scene.remove(b.m); const i = balls.indexOf(b); if (i >= 0) balls.splice(i, 1); }, 400);
  resolved();
}
function resolved() {
  game.resolved++; drawBoard();
  if (game.resolved >= BALLS) setTimeout(endGame, 1100);
}
function endGame() {
  if (!game.on) return; game.on = false;
  const best = game.score > game.best; if (best) { game.best = game.score; store.set('best', game.best); }
  $('end-sc').textContent = game.score;
  $('end-line').textContent = `${game.made} of ${BALLS} in · ${game.swish} swish${game.swish === 1 ? '' : 'es'}`;
  $('end-best').textContent = best ? 'New best!' : `Your best: ${game.best}`;
  $('end').hidden = false; $('b-again').focus();
  if (best) sound.cheer();
  hint(''); postEvent('custom', { action: 'hoops-score', score: game.score, made: game.made, swish: game.swish, hoopCm: Math.round(hoopH * 100) });
  flushDiag(true);
}
function drawBoard() {
  $('sc').textContent = game.score; $('made').textContent = `${game.made}/${BALLS}`;
}
function drawRack() {
  const el = $('rack'); if (el.children.length !== BALLS) { el.innerHTML = ''; for (let i = 0; i < BALLS; i++) { const d = document.createElement('i'); if (isMoney(i)) d.className = 'money'; el.appendChild(d); } }
  [...el.children].forEach((d, i) => d.classList.toggle('used', i < game.thrown));
  el.setAttribute('aria-label', `${BALLS - game.thrown} balls left`);
}
function popWord(text, small, at, cls) {
  const p = at.clone().project(camera); if (p.z > 1) return;
  const el = document.createElement('div'); el.className = 'pop-word ' + (cls || '');
  el.textContent = text; if (small) { const s = document.createElement('small'); s.textContent = small; el.appendChild(s); }
  el.style.left = clamp((p.x + 1) / 2 * innerWidth, 80, innerWidth - 80) + 'px'; el.style.top = clamp((1 - p.y) / 2 * innerHeight, 90, innerHeight - 160) + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 1400);
}
function tickDist() {
  if (mode !== 'play' || !camera) return;
  const d = Math.hypot(camera.position.x - hoop.pos.x, camera.position.z - hoop.pos.z);
  const t = d.toFixed(1) + ' m'; if ($('dist').textContent !== t) $('dist').textContent = t;
}
function resetToPlacing() {
  $('end').hidden = true; game.on = false;
  for (const b of balls) scene.remove(b.m); balls.length = 0; if (held) { scene.remove(held.m); held = null; }
  $('board').hidden = true; $('rack').hidden = true; placeBobo(false);
  lidFly.visible = false;   // the top stays off (Dapo): no setOpenTop(false), no Idle clip
  setMode('placing');
}
$('b-play').onclick = takeOffCharm;
$('b-place').onclick = placeCan;
$('b-again').onclick = () => { $('end').hidden = true; if (held) { scene.remove(held.m); held = null; } startGame(); };
$('b-move').onclick = resetToPlacing;

// ---------------------------------------------------------------- frame
const clock = { t: 0 };
let lastTrack = '', limitedSince = 0;
function tick(dt) {
  const now = performance.now(); clock.t += dt; diag.fpsN++; camera.updateMatrixWorld();
  if (aWanted) updatePose(now); else A.visible = false;
  if (canMixer && (mode === 'reveal' || mode === 'ready' || mode === 'grow' || mode === 'placing')) canMixer.update(dt);
  if (boboMixer && bobo && bobo.visible) boboMixer.update(dt);
  if (topOff) clipTop.constant = canRoot.position.y + (TOP_Y - 0.002) * canRoot.scale.y;   // the cut follows the can wherever it goes
  tickReveal(dt); tickPortal(dt); tickBurst(dt); tickSparks(dt); tickFloor(dt); tickGrow(dt); tickDrop(dt); tickFx(dt);
  tickHeld(dt); tickBalls(dt); tickDist();
  // the world: tracking lost for a while -> say how to get it back (only once we're on the floor)
  if (mode !== 'find' && mode !== 'reveal' && mode !== 'ready') {
    if (lastTrack === 'LIMITED') { if (!limitedSince) limitedSince = now; if (now - limitedSince > 1500) hint('Move your phone slowly so it can see the floor again'); }
    else if (limitedSince) { limitedSince = 0; if (/slowly/.test($('hint').textContent)) hint(''); }
  }
  if (SHOW_DIAG && now - (diag.drawAt || 0) > 500) drawDiag(now);
}
function hint(text) { if ($('hint').textContent !== text) $('hint').textContent = text || ''; }
const trackingBad = () => lastTrack === 'LIMITED' && limitedSince && performance.now() - limitedSince > 1500;
let testFloor = false;

// ---------------------------------------------------------------- options
function segInit(id, cur, fn) {
  const el = $(id), bs = [...el.querySelectorAll('button')];
  const set = (v) => { for (const b of bs) b.setAttribute('aria-checked', String(b.dataset.v === v)); };
  set(cur); bs.forEach((b) => (b.onclick = () => { set(b.dataset.v); fn(b.dataset.v); sound.click(); }));
}
segInit('seg-guide', guideMode, (v) => { guideMode = v; store.set('guide', v); });
const optsEl = $('opts');
function openOpts() { optsEl.hidden = false; $('b-opts').setAttribute('aria-expanded', 'true'); optsEl.querySelector('.x').focus(); }
function closeOpts() { optsEl.hidden = true; $('b-opts').setAttribute('aria-expanded', 'false'); $('b-opts').focus(); }
$('b-opts').onclick = openOpts;
optsEl.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeOpts));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !optsEl.hidden) closeOpts(); });
const soundBtn = $('o-sound'); soundBtn.setAttribute('aria-checked', String(sound.on));
soundBtn.onclick = () => { sound.on = !sound.on; store.set('sound', sound.on ? '1' : '0'); soundBtn.setAttribute('aria-checked', String(sound.on)); sound.click(); };
$('o-how').onclick = () => { closeOpts(); $('how').hidden = false; $('b-go').focus(); };
$('o-move').onclick = () => { closeOpts(); if (['play', 'drop'].includes(mode) || !$('end').hidden) resetToPlacing(); };
// Move the can: always on screen once it is placed (house rule for world-tracked experiences), bottom right
$('b-move-can').onclick = () => { sound.click(); if (['play', 'drop'].includes(mode) || !$('end').hidden) resetToPlacing(); };
$('b-go').onclick = () => { $('how').hidden = true; store.set('how', '1'); };
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; diag.errors.push(`${title}: ${body}`.slice(0, 200)); }
$('err-retry').onclick = () => location.reload();

// ---------------------------------------------------------------- 8th Wall pipeline
// The engine draws into the canvas at its own width/height: unsized it stays 300x150 and the camera looks
// stretched and blurry (Cola Run World phone test). CSS pins it to the screen; this sets the drawing size.
const DPR = clamp(+params.get('dpr') || 1.5, 1, 3);
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, DPR), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
let last = 0, camStartAt = 0, built = false;
const appModule = (data) => ({
  name: 'bobo-hoops',
  onStart: () => { buildScene(XR8.Threejs.xrScene(), data); built = true; $('hud').hidden = false; setMode('find'); hint('Point at the Eclipse can'); },
  onUpdate: ({ processCpuResult }) => {
    const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now;
    const r = processCpuResult && processCpuResult.reality; if (r && r.trackingStatus) noteTracking(r.trackingStatus, r.trackingReason);
    if (built) tick(dt); flushDiag(false);
  },
  onCameraStatusChange: ({ status }) => {
    diag.steps.push(['cam:' + status, Math.round(performance.now())]);
    if (status === 'hasVideo') {
      camStartAt = performance.now();
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 600);
    }
    if (status === 'requesting') hint('Allow camera and motion access to begin');
    if (status === 'failed') camFailed('failed');
  },
  onException: (e) => {
    diag.errors.push('XR: ' + (typeof e === 'object' ? JSON.stringify(e) : String(e)).slice(0, 200)); flushDiag(true, true);
    const msg = String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e));
    if (!camStartAt && /session manager|not supported|unsupported|device/i.test(msg)) return openOnPhone();
    if (e && e.type === 'permission') return showError('Motion access is needed', 'Bobo Hoops uses your phone\'s motion sensors to keep the can on your floor. Allow motion and orientation access (on iPhone, tap Allow when asked), then try again.');
    showError('Something went wrong', String((e && e.message) || (typeof e === 'object' ? JSON.stringify(e) : e)));
  },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
    { event: 'reality.trackingstatus', process: ({ detail }) => noteTracking(detail.status, detail.reason) },
  ],
});
function noteTracking(st, why) { if (st !== lastTrack) { lastTrack = st; diag.tracking.push([st + (why && why !== 'UNSPECIFIED' ? ' ' + why : ''), Math.round(performance.now())]); if (diag.tracking.length > 30) diag.tracking.shift(); } }
function start() {
  if (!loaded) return;
  $('b-start').disabled = true; $('b-start').textContent = 'Starting…';
  sound.init();
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  assets.then((data) => {
    initTargets(data.tdata, data.layout);
    // one engine for both: image targets on, world tracking on
    XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive', imageTargetData: data.tdata });
    XR8.addCameraPipelineModules([XR8.GlTextureRenderer.pipelineModule(), XR8.Threejs.pipelineModule(), XR8.XrController.pipelineModule(), appModule(data)]);
    postEvent('scan', {});
    setTimeout(() => { if (!camStartAt) camFailed('no video after 15 s'); }, 15000);
    XR8.run({
      canvas,
      allowedDevices: params.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
      cameraConfig: { direction: XR8.XrConfig.camera().BACK }, verbose: params.has('verbose'),
    });
  });
}
$('b-start').onclick = start;
function camFailed(why) {
  if (camStartAt || diag.camFailed) return; diag.camFailed = why; flushDiag(true, true);
  showError('The camera didn\'t start', 'Allow camera and motion access for this site, and close the Camera app or other tabs that use the camera, then tap Try again. A laptop can\'t run this one: open it on your phone.');
}

// ---------------------------------------------------------------- Where is Bobo? events (city level, anonymous)
const SID = 'bh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
function postEvent(type, props) {
  if (params.has('nolog')) return;
  try { fetch('/api/bobo/events', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, source: 'bobo-hoops', sessionId: SID, props }) }).catch(() => {}); } catch (e) { /* offline */ }
}

// ---------------------------------------------------------------- test log (previews and local dev only, or ?diag)
// Read back with GET /api/ar/kc-diag on a deploy preview (records carry page: 'bobo-hoops').
const diag = { page: 'bobo-hoops', sid: SID, found: 0, lost: 0, fpsN: 0, throws: 0, makes: 0, errors: [], steps: [], tracking: [], note: params.get('note') || '' };
let flushAt = 0;
function flushDiag(force, always = false) {
  const now = performance.now(); if (!force && now - flushAt < 10000) return; flushAt = now;
  if ((!camStartAt && !always) || params.has('nolog') || (LIVE_SITE && !params.has('diag'))) return;
  const body = JSON.stringify({ ...diag, mode, hoopCm: Math.round(hoopH * 100), score: game.score, guide: guideMode, secs: Math.round((now - (camStartAt || now)) / 1000), fps: camStartAt ? +(diag.fpsN / Math.max((now - camStartAt) / 1000, 1)).toFixed(1) : 0, screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => { diag.errors.push(String(e.message).slice(0, 200)); });
// the small status line at the top edge (previews / ?diag only; click-through so it never blocks a button)
function drawDiag(now) {
  diag.drawAt = now; const el = $('diagp'); el.hidden = false;
  const fps = camStartAt ? diag.fpsN / Math.max((now - camStartAt) / 1000, 1) : 0;
  el.textContent = `${mode} · track ${lastTrack || '-'} · target ${pose.state} · fps ${fps.toFixed(0)}\ncan ${Math.round(hoopH * 100)} cm` + (mode === 'play' ? ` · ${game.thrown}/${BALLS} thrown · ${game.score} pts` : '') + (diag.errors.length ? `\nerr: ${diag.errors.slice(-1)[0].slice(0, 60)}` : '');
}

// automated tests (?test)
if (params.has('test')) window.__bh = {
  get mode() { return mode; }, get pose() { return pose.state; }, get reveal() { return { t: +reveal.t.toFixed(2), glow: +fx.glow.toFixed(2), portal: +fx.portal.toFixed(2), balls: burst.filter((b) => b.m.visible).length, can: canRoot.visible, mask: portal && portal.userData.on, programs: renderer.info.programs.length }; }, get game() { return { ...game, balls: balls.length, inside: balls.filter((b) => b.inside).length }; },
  get tracking() { return lastTrack; }, scene: () => scene, programs: () => renderer.info.programs.map((p) => p.name), get topOff() { return topOff && inner.visible && canMats.every((m) => m.clippingPlanes && m.clippingPlanes.length); }, get endShown() { return !$('end').hidden; },
  balls: () => balls.map((b) => ({ p: b.p.toArray().map((x) => +x.toFixed(3)), inside: b.inside, scored: !!b.scored, done: b.done, rim: b.rim, wall: b.wall, rest: +b.rest.toFixed(2), age: +b.age.toFixed(1) })), diag, TS, hoop, camera: () => camera,
  play: takeOffCharm, place: placeCan,
  // the power that lands exactly at the can's rim (for the shot test)
  powerFor(dOff = 0) { const p = launchPoint(new THREE.Vector3()); const D = Math.hypot(p.x - hoop.pos.x, p.z - hoop.pos.z) + dOff; return (D - RANGE_MIN) / (RANGE_MAX - RANGE_MIN); },
  sideFor() { const p = launchPoint(new THREE.Vector3()); camera.getWorldDirection(_v2); const a = Math.atan2(hoop.pos.x - p.x, hoop.pos.z - p.z), b = Math.atan2(_v2.x, _v2.z); let d = a - b; d = Math.atan2(Math.sin(d), Math.cos(d)); return -d / 0.75; },
  // put the reticle (and so the can) at a point on the floor dx metres right, dz metres ahead of the camera
  floorAt(dx, dz) {   // dz metres ahead along the view, dx to the right
    testFloor = true; reticle.visible = true; camera.getWorldDirection(_v2); _v2.y = 0; _v2.normalize();
    reticle.position.set(camera.position.x + _v2.x * dz - _v2.z * dx, 0.002, camera.position.z + _v2.z * dz + _v2.x * dx);
  },
  shoot: (power, side = 0) => { if (held) held.t = 1; return throwBall(power, side); },
  aimAt: (power, side = 0) => { aim.on = true; aim.power = power; aim.side = side; },
  aimOff: () => { aim.on = false; },
  canScreen: () => { const p = new THREE.Vector3(); canRoot.getWorldPosition(p); const q = p.clone().project(camera); return { world: p.toArray(), screen: [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight], scale: canRoot.scale.x }; },
};

// desktop: a QR to open it on the phone
function qrInto(el) { try { window.QRCode && QRCode.toString(location.href, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }, (err, svg) => { if (!err) el.innerHTML = svg; }); } catch (e) { /* no QR */ } }
if (!PHONE) { $('desk').hidden = false; qrInto($('qr')); }
// this device can't run world tracking (e.g. a touchscreen laptop): stop the engine, offer the phone instead of a raw error
function openOnPhone() {
  try { window.XR8 && XR8.stop(); } catch (e) { /* already stopped */ }
  $('err-title').textContent = 'Open Bobo Hoops on your phone';
  $('err-body').textContent = 'This device can\'t put the can on your floor. Scan the code with your phone\'s camera to play there.';
  $('err-qr').hidden = false; qrInto($('err-qr')); $('err-retry').hidden = true; $('error').hidden = false;
  $('splash').hidden = false; $('splash').classList.remove('gone');
}
