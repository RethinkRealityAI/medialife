// Street Kit: pick a model from a tray and tap the floor to place as many as you like (from the 8th Wall
// "taptoplace" sample, A-Frame -> plain three.js).
//
// Kept from the sample (src/js/selection-place.js): a tray of four (bench, bin, lamp post, eraser), tap the floor
// where you want one, each pops in with an elastic scale, the eraser shrinks away whatever you tap, a 200 ms
// cooldown between drops. Changed: the floor is the world-tracked y = 0 plane (no 1000 m shadow box), the ring
// under your aim shows where things will land, a placed item turns to face you, and Move (bottom right, once
// something is down) picks up the last thing you placed so you can put it somewhere else.
import { createDemo, THREE, MEDIA, loadGLB, contactShadow, fitTo, backOut, clamp } from '../shared/shell.js';

const KIT = [
  { id: 'bench', label: 'Bench', url: MEDIA + 'street/bench.gltf', icon: MEDIA + 'street/icon-bench.jpg', h: 0.32 },
  { id: 'bin', label: 'Bin', url: MEDIA + 'street/trashcan.gltf', icon: MEDIA + 'street/icon-trash.jpg', h: 0.3 },
  { id: 'lamp', label: 'Lamp', url: MEDIA + 'street/lantern.gltf', icon: MEDIA + 'street/icon-lamp.jpg', h: 0.75 },
  { id: 'eraser', label: 'Eraser', icon: MEDIA + 'street/icon-eraser.jpg' },
];
const MAX_ITEMS = 40;
const items = []; // { root, born, dying }
let current = 0, cooldown = 0, carry = null;
const proto = {};
const tmp = new THREE.Vector3();

const demo = createDemo({
  slug: 'tap-to-place', mode: 'world', tag: 'Tap to place',
  title: 'Street Kit', titleHtml: 'Street <span>Kit</span>',
  lead: 'Pick a bench, a bin or a lamp post and tap your floor to build a little street.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="80" y="170" width="140" height="16" rx="6" fill="#4fd6e8"/><rect x="92" y="186" width="10" height="34" fill="#4fd6e8"/><rect x="198" y="186" width="10" height="34" fill="#4fd6e8"/><rect x="226" y="80" width="8" height="140" fill="#fff"/></svg>`,
  how: [
    '<b>Pick</b> something from the tray at the bottom.',
    '<b>Tap the floor</b> where you want it. Tap again for another.',
    '<b>Eraser</b>: pick it, then tap a thing to remove it.',
    '<b>Move</b> (bottom right) picks up the last thing you placed. Aim and tap to put it down.',
  ],
  placement: 'custom', reticleAlways: true, reticleSize: 0.12,
  async load(d) {
    let n = 0;
    await Promise.all(KIT.filter((k) => k.url).map(async (k) => {
      const g = await loadGLB(k.url);
      g.scene.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; } });
      proto[k.id] = fitTo(g.scene, k.h);
      d.progress(0.3 + 0.2 * ++n);
    }));
  },
  hero() {
    const g = new THREE.Group();
    const b = proto.bench.clone(); b.position.x -= 0.12; g.add(b);
    const l = proto.lamp.clone(); l.position.x += 0.22; l.position.z -= 0.06; g.add(l);
    const t = proto.bin.clone(); t.position.x -= 0.32; t.position.z += 0.1; g.add(t);
    return g;
  },
  build(d) { buildTray(d); },
  onLive(d) { d.reticle.visible = false; hintFor(d); },
  onTap(ndc, d) {
    if (carry) { dropCarry(d); return true; }
    if (performance.now() < cooldown) return true;
    if (KIT[current].id === 'eraser') { erase(ndc, d); return true; }
    const p = d.floorHit(ndc, new THREE.Vector3(), 30);
    if (!p) { d.toast('Tap the floor'); return true; }
    spawn(d, KIT[current].id, p);
    return true;
  },
  onMove(d) {
    const last = [...items].reverse().find((i) => !i.dying);
    if (!last) return;
    carry = last; d.hint('Aim at the new spot and tap the screen');
    d.moveBtn.querySelector('span').textContent = 'Drop';
    d.moveBtn.onclick = () => dropCarry(d);
  },
  update(dt, d, now) {
    if (carry) { // the carried item rides the aim ring
      if (d.reticle.visible) { carry.root.position.lerp(d.reticle.position, 1 - Math.exp(-14 * dt)); carry.root.position.y = 0.04 + 0.01 * Math.sin(now / 150); faceCamera(carry.root, d); }
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i], t = (now - it.born) / 800;
      if (it.dying) {
        const k = 1 - clamp((now - it.dying) / 300, 0, 1); it.root.scale.setScalar(Math.max(1e-4, k * k));
        if (k <= 0) { d.scene.remove(it.root); items.splice(i, 1); }
      } else it.root.scale.setScalar(Math.max(1e-4, elastic(t)));
    }
    if (!carry && !d.hint.lock) hintFor(d);
  },
});

const elastic = (x) => { x = clamp(x, 0, 1); return x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1; }; // easeOutElastic, as the sample

function hintFor(d) {
  if (!d.reticle.visible) return d.hint('Point your phone at the floor and move it slowly');
  if (!items.length) return d.hint(KIT[current].id === 'eraser' ? 'Pick something to place first' : `Tap the floor to place a ${KIT[current].label.toLowerCase()}`);
  d.hint('');
}
function faceCamera(o, d) { o.rotation.y = Math.atan2(d.camera.position.x - o.position.x, d.camera.position.z - o.position.z); }
function spawn(d, id, p) {
  const root = new THREE.Group(); root.position.copy(p);
  const m = proto[id].clone(); root.add(m); root.add(contactShadow(id === 'bench' ? 0.24 : 0.12, 0.35));
  // an invisible box round it to tap (a lamp post is too thin to hit by its mesh)
  const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sz.x, 0.14), sz.y, Math.max(sz.z, 0.14)), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.copy(c); root.add(hit); root.userData.hit = hit;
  root.userData.kind = id; root.scale.setScalar(1e-4); faceCamera(root, d);
  d.scene.add(root); items.push({ root, born: performance.now(), dying: 0 });
  while (items.filter((i) => !i.dying).length > MAX_ITEMS) items.find((i) => !i.dying).dying = performance.now();
  cooldown = performance.now() + 200; // the sample's 200 ms between drops
  d.moveBtn.hidden = false;
}
function erase(ndc, d) {
  d.rayFrom(ndc);
  const live = items.filter((i) => !i.dying);
  const hits = d.raycaster.intersectObjects(live.map((i) => i.root.userData.hit), false);
  if (!hits.length) { d.toast('Tap a thing to remove it'); return; }
  let o = hits[0].object; while (o && !live.some((i) => i.root === o)) o = o.parent;
  const it = live.find((i) => i.root === o); if (it) { it.dying = performance.now(); if (carry === it) carry = null; }
  cooldown = performance.now() + 200;
}
function dropCarry(d) {
  if (!carry) return;
  if (d.reticle.visible) carry.root.position.copy(d.reticle.position).setY(0);
  else carry.root.position.y = 0;
  carry.born = performance.now() - 300; carry = null;
  d.moveBtn.querySelector('span').textContent = 'Move'; d.moveBtn.onclick = () => d.startMove();
  d.hint('');
}
function buildTray(d) {
  const tray = document.createElement('div'); tray.className = 'tray card-panel'; tray.setAttribute('role', 'radiogroup'); tray.setAttribute('aria-label', 'What to place');
  tray.innerHTML = KIT.map((k, i) => `<button type="button" role="radio" class="kit" data-i="${i}" aria-checked="${i === current}" aria-label="${k.label}"><img src="${k.icon}" alt="" width="50" height="50"><span>${k.label}</span></button>`).join('');
  tray.addEventListener('click', (e) => {
    const b = e.target.closest('.kit'); if (!b) return;
    current = +b.dataset.i; tray.querySelectorAll('.kit').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  });
  d.panel.appendChild(tray);
}

window.__kit = {
  pick(id) { current = KIT.findIndex((k) => k.id === id); },
  get items() { return items.filter((i) => !i.dying).map((i) => ({ kind: i.root.userData.kind, p: i.root.position.toArray().map((x) => +x.toFixed(2)), s: +i.root.scale.x.toFixed(2) })); },
  get carrying() { return !!carry; },
  screenOf(i) { const it = items.filter((x) => !x.dying)[i]; tmp.copy(it.root.position).setY(0.3).project(demo.camera); const r = demo.canvas.getBoundingClientRect(); return [r.left + (tmp.x + 1) / 2 * r.width, r.top + (1 - tmp.y) / 2 * r.height]; },
};
