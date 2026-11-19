// Product Viewer: place a product in your room, or switch to a 3D viewer and spin it; colour swatches repaint it
// (from the 8th Wall "3dar" sample, A-Frame -> plain three.js).
//
// Kept from the sample (src/components/change-scene.js, color-change.js): an AR / 3D switch; 3D mode stops the
// camera and shows the model on a plain background with orbit controls (auto-rotate, zoom 2-10x its size); back
// to AR re-centres it; five swatches (the sample's purple, orange, green, blue, black) recolour the mesh named
// "Car" (its paint) and the first one is applied on start. Changed: the camera is paused with XR8.pause() and the
// 3D view is its own small three.js renderer on top (the sample removed and re-added the whole xrweb component),
// the background is flat (the sample's sky was a gradient), the model is placed with the shared reticle and Move,
// and pinch while placing sizes it from toy to life size.
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow, $ } from '../shared/shell.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SWATCHES = [ // the sample's list, named
  { c: '#AD50FF', n: 'Purple' }, { c: '#ff9500', n: 'Orange' }, { c: '#66cc00', n: 'Green' }, { c: '#5ac8fa', n: 'Blue' }, { c: '#000000', n: 'Black' },
];
const LENGTH = 0.6; // metres at size 1 (pinch up to ~4.4 m, about a real car)
let gltf, car, paint = [], view = 'ar', colour = 0, viewer = null;

const demo = createDemo({
  slug: 'product-viewer', mode: 'world', tag: 'Product',
  title: 'Product Viewer', titleHtml: 'Product <span>Viewer</span>',
  lead: 'Park a car in your room or spin it in 3D, and change its paint with a tap.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="60" y="150" width="180" height="40" rx="14" fill="#4fd6e8"/><path d="M100 150l25-35h55l30 35z" fill="#4fd6e8"/><circle cx="105" cy="192" r="16" fill="#fff"/><circle cx="195" cy="192" r="16" fill="#fff"/></svg>`,
  how: [
    '<b>AR</b>: find the floor, pinch to size it (up to life size), tap <b>Place here</b>.',
    '<b>3D</b>: switch at the top of the panel to spin it with one finger and zoom with two.',
    '<b>Colours</b>: tap a swatch to repaint it. It stays that colour in both views.',
    '<b>Move</b> (bottom right) parks it somewhere else.',
  ],
  size: [0.4, 7.4, 1],
  placeHint: 'Pinch to size it, then tap Place here',
  async load(d) { gltf = await loadGLB(MEDIA + 'car.glb'); d.progress(0.9); },
  hero() { const o = gltf.scene.clone(true); fitLength(o, 1); return o; },
  build(d) {
    car = gltf.scene; fitLength(car, LENGTH);
    car.rotation.y = Math.PI / 6; // the sample's 30 deg turn
    car.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    // the paint: every mesh under the node named "Car" gets its own material we can recolour
    const body = car.getObjectByName('Car');
    body && body.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); paint.push(o.material); } });
    d.stage.add(car); d.stage.add(contactShadow(LENGTH * 0.62, 0.45));
    buildUi(d);
    setColour(0);
  },
  update(dt, d) { if (viewer) viewer.tick(dt); },
});

function fitLength(o, len) {
  o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  return fitTo(o, len * s.y / Math.max(s.x, s.z));
}
function setColour(i) {
  colour = i; const col = new THREE.Color(SWATCHES[i].c);
  paint.forEach((m) => m.color.copy(col));
  document.querySelectorAll('.sw').forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
}

function buildUi(d) {
  const p = document.createElement('div'); p.className = 'pv card-panel';
  p.innerHTML = `<div class="seg" role="radiogroup" aria-label="View"><button type="button" role="radio" data-v="ar" aria-checked="true">AR</button><button type="button" role="radio" data-v="3d" aria-checked="false">3D</button></div>
    <div class="sws" role="radiogroup" aria-label="Paint colour">${SWATCHES.map((s, i) => `<button type="button" role="radio" class="sw" aria-label="${s.n}" aria-checked="false" style="--c:${s.c}"></button>`).join('')}</div>`;
  d.panel.appendChild(p);
  p.querySelectorAll('.sw').forEach((b, i) => { b.onclick = () => setColour(i); });
  p.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => setView(d, b.dataset.v); });
}

// ------------------------------------------------------------------ 3D view: camera paused, own renderer on top
function setView(d, v) {
  if (v === view) return;
  view = v;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === v)));
  const shutter = $('b-shutter');
  if (v === '3d') {
    try { XR8.pause(); } catch (e) { /* not running */ }
    viewer = makeViewer(d);
    d.act.hidden = true; d.moveBtn.hidden = true; if (shutter) shutter.hidden = true; d.hint('');
  } else {
    viewer.dispose(); viewer = null;
    // back to AR: the car goes back on its spot in the room, re-centred and turned as the sample does
    car.position.set(0, 0, 0); car.rotation.set(0, Math.PI / 6, 0); car.scale.setScalar(car.userData.arScale);
    d.stage.add(car);
    try { XR8.resume(); } catch (e) { /* none */ }
    if (shutter) shutter.hidden = false;
    if (d.state === 'placed') d.moveBtn.hidden = false; else d.act.hidden = false;
  }
}
function makeViewer(d) {
  const c = document.createElement('canvas'); c.id = 'viewer'; c.setAttribute('aria-label', '3D view: drag to turn, pinch to zoom');
  document.body.appendChild(c);
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.setSize(innerWidth, innerHeight, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.NeutralToneMapping; r.setClearColor(0x2a2f36, 1);
  const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(r);
  sc.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; sc.environmentIntensity = 0.9;
  sc.add(new THREE.HemisphereLight(0xffffff, 0x404850, 1.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.6); dl.position.set(3, 6, 4); sc.add(dl);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 64), new THREE.MeshBasicMaterial({ color: 0x353b44 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
  car.userData.arScale = car.scale.x;
  car.scale.multiplyScalar(1 / LENGTH); car.position.set(0, 0, 0); // 1 unit long in the viewer
  sc.add(car); sc.add(contactShadow(0.62, 0.5));
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 100); cam.position.set(1.9, 1.1, 2.4);
  const ctl = new OrbitControls(cam, c);
  Object.assign(ctl, { enableDamping: true, autoRotate: true, autoRotateSpeed: 1, minDistance: 0.8, maxDistance: 5, zoomSpeed: 0.5, enablePan: false, maxPolarAngle: Math.PI * 0.49 });
  ctl.target.set(0, 0.15, 0);
  const onResize = () => { r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
  addEventListener('resize', onResize);
  let raf = 0; const loop = () => { ctl.update(); r.render(sc, cam); raf = requestAnimationFrame(loop); }; loop();
  return {
    tick() {}, cam,
    dispose() { cancelAnimationFrame(raf); removeEventListener('resize', onResize); ctl.dispose(); sc.remove(car); r.dispose(); pm.dispose(); c.remove(); },
  };
}

window.__pv = {
  setColour, setView: (v) => setView(demo, v),
  get view() { return view; },
  get paint() { return paint.map((m) => '#' + m.color.getHexString()); },
  get carParent() { return car.parent === demo.stage ? 'stage' : car.parent ? 'viewer' : 'none'; },
};
