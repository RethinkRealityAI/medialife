// Anpanman, Activated: place a concept product (keychain, standee, sticker sheet, shirt) in your room.
// Shared Labs shell, world mode: reticle on the floor, Place here (or tap), Move always on screen once placed
// (keeps the product, its size and turn), photo shutter bottom centre.
// Gestures work before AND after placing (Dapo 2026-11-24): two fingers pinch to size and twist to turn, one finger
// dragged sideways turns it. They act on `holder` (not the shell's stage), so the shell's own placing-only pinch is
// off (no cfg.size). Each product shows at a display size that reads well in a room (small items enlarged); pinch from
// a quarter of that to four times it. The picker swaps the product in place, keeping size and turn.
import { createDemo, THREE, loadGLB, fitTo, contactShadow, qs, $ } from '/labs/demos/shared/shell.js';

const P = {
  keychain: { name: 'Keychain', h: 0.27, note: 'Acrylic keychain · shown 3x real size' },
  standee: { name: 'Standee', h: 1.2, note: 'Character floor standee · 1.2 m' },
  sheet: { name: 'Stickers', h: 0.42, note: 'Sticker sheet · shown 2x real size' },
  shirt: { name: 'Shirt', h: 0.75, note: "Kids' tee · 75 cm" },
};
const KEYS = Object.keys(P);
let cur = P[qs.get('p')] ? qs.get('p') : 'keychain';
const models = {};
const holder = new THREE.Group();
let shadow = null;
const shadowBase = new THREE.Vector3(1, 1, 1);

const demo = createDemo({
  slug: 'anpanman-ar', mode: 'world', tag: 'Anpanman',
  kicker: 'Anpanman, activated by MEDIALIFE',
  title: 'See it in your space', titleHtml: 'See it in <span>your space</span>',
  lead: 'Put the Anpanman concept products in your room. Pinch to size them, twist to turn them, walk around them.',
  how: [
    'Point at the floor until the ring appears.',
    '<b>Pinch</b> to make it bigger or smaller, <b>twist</b> two fingers or drag one to turn it, then tap <b>Place here</b>.',
    'You can still pinch and turn it after it is placed.',
    'Pick another product at the bottom: it swaps in the same spot.',
    '<b>Move</b> (bottom right) picks it up to place it somewhere else.',
  ],
  placeHint: 'Pinch to size, twist to turn, then tap Place here',
  onPointerDown: (e) => gesture.down(e),
  onPointerMove: (e) => gesture.move(e),
  onPointerUp: (e) => gesture.up(e),
  async load(d) {
    const first = loadOne(cur);
    await first; d.progress(0.85);
    KEYS.filter((k) => k !== cur).forEach((k) => loadOne(k).catch(() => {}));
  },
  hero() { return models[cur].clone(true); },
  build(d) {
    d.stage.add(holder);
    shadow = contactShadow(0.3, 0.4); d.stage.add(shadow);
    show(cur);
    buildUi(d);
  },
});

function loadOne(k) {
  if (models[k]) return Promise.resolve(models[k]);
  return loadGLB(`../assets/ar/${k}.glb`).then((g) => {
    const o = g.scene;
    o.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
    fitTo(o, P[k].h);
    return (models[k] = o);
  });
}

async function show(k) {
  cur = k;
  document.querySelectorAll('.pseg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.p === k)));
  const note = $('psize'); if (note) note.textContent = P[k].note;
  try { history.replaceState(null, '', '?p=' + k + (qs.has('desktop') ? '&desktop' : '')); } catch (e) { /* none */ }
  const o = await loadOne(k);
  if (cur !== k) return;
  o.removeFromParent(); o.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()); // unscaled, before the holder
  holder.clear(); holder.add(o);
  shadowBase.setScalar(Math.max(0.2, Math.max(s.x, s.z) * 0.62) / 0.3);
  syncShadow();
}

function buildUi(d) {
  d.panel.innerHTML = `<div class="pseg" role="radiogroup" aria-label="Product">${KEYS.map((k) => `<button type="button" role="radio" data-p="${k}" aria-checked="${k === cur}">${P[k].name}</button>`).join('')}</div><p class="psize" id="psize">${P[cur].note}</p>`;
  d.panel.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && b.dataset.p !== cur) show(b.dataset.p); });
}

// this is a pitch page: the menu goes back to the proposal, never to Labs
const more = document.querySelector('#menu a[href="/labs/"]');
if (more) { more.href = '/anpanman/#products'; more.firstChild.textContent = 'Back to the proposal'; }

// ---------- gestures: pinch = size, twist = turn (two fingers), sideways drag = turn (one finger)
const MIN = 0.25, MAX = 4;
const gesture = (() => {
  const pts = new Map();
  let two = null, one = null;
  const pair = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) }; };
  const begin = () => {
    one = two = null;
    if (pts.size === 2) { const p = pair(); two = { d: Math.max(20, p.d), a: p.a, s: holder.scale.x, r: holder.rotation.y }; }
    else if (pts.size === 1) { const [p] = pts.values(); one = { x: p.x, r: holder.rotation.y }; }
  };
  return {
    down(e) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); begin(); },
    move(e) {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (two && pts.size === 2) {
        const p = pair();
        holder.scale.setScalar(THREE.MathUtils.clamp(two.s * (p.d / two.d), MIN, MAX));
        let da = p.a - two.a; da = Math.atan2(Math.sin(da), Math.cos(da));
        holder.rotation.y = two.r - da; // screen clockwise twist turns it clockwise seen from above
      } else if (one && pts.size === 1) {
        holder.rotation.y = one.r + ((e.clientX - one.x) / Math.max(320, innerWidth)) * Math.PI * 2;
      }
      syncShadow();
    },
    up(e) { pts.delete(e.pointerId); begin(); },
  };
})();
function syncShadow() { if (shadow) shadow.scale.copy(shadowBase).multiplyScalar(holder.scale.x); }
