// Anpanman, Activated: place a concept product (keychain, standee, sticker sheet, shirt) in your room.
// Shared Labs shell, world mode: reticle on the floor, pinch to size while placing, Place here (or tap), Move
// always on screen once placed (keeps the product and its size), photo shutter bottom centre.
// Each product shows at a display size that reads well in a room (small items enlarged); pinch from about a quarter
// of that to four times it. The picker swaps the product in place, so a placed product stays where it is.
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

const demo = createDemo({
  slug: 'anpanman-ar', mode: 'world', tag: 'Anpanman',
  kicker: 'Anpanman, activated by MEDIALIFE',
  title: 'See it in your space', titleHtml: 'See it in <span>your space</span>',
  lead: 'Put the Anpanman concept products in your room. Pinch to size them, walk around them.',
  how: [
    'Point at the floor until the ring appears.',
    '<b>Pinch</b> to make it bigger or smaller, then tap <b>Place here</b>.',
    'Pick another product at the bottom: it swaps in the same spot.',
    '<b>Move</b> (bottom right) picks it up to place it somewhere else.',
  ],
  size: [0.25, 4, 1],
  placeHint: 'Pinch to size it, then tap Place here',
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
  holder.clear(); holder.add(o);
  const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3());
  shadow.scale.setScalar(Math.max(0.2, Math.max(s.x, s.z) * 0.62) / 0.3);
}

function buildUi(d) {
  d.panel.innerHTML = `<div class="pseg" role="radiogroup" aria-label="Product">${KEYS.map((k) => `<button type="button" role="radio" data-p="${k}" aria-checked="${k === cur}">${P[k].name}</button>`).join('')}</div><p class="psize" id="psize">${P[cur].note}</p>`;
  d.panel.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && b.dataset.p !== cur) show(b.dataset.p); });
}

// this is a pitch page: the menu goes back to the proposal, never to Labs
const more = document.querySelector('#menu a[href="/labs/"]');
if (more) { more.href = '/anpanman/#products'; more.firstChild.textContent = 'Back to the proposal'; }
