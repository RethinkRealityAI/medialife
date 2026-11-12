// Splash: the real EVADE keychain drops in from the top, the cable catches it and it swings off as if
// someone just flicked it, then keeps a gentle sway. Drag or flick it to swing it, tap it to jiggle it.
// The physics and the model live in the shared module /evade/keychain/dangle.js (the EVADE hero uses it too);
// this file only says where it hangs on the splash and frees the GPU when the splash goes.
import { dangleKeychain } from '/evade/keychain/dangle.js';

const splash = document.getElementById('splash');
const canvas = document.getElementById('kc3d');

// portrait: hooked on the EVADE logo, filling the space down to the title plate (the desktop QR card makes it
// shorter); wide screens: on the left, hanging from the top edge
function frame(w, h) {
  if (w > h) return { clasp: { x: Math.min(w * 0.3, w / 2 - 230), y: h * 0.12 }, height: h * 0.7, hook: null };
  const lr = document.querySelector('#splash .brand img')?.getBoundingClientRect();
  const pr = document.getElementById('title')?.getBoundingClientRect();
  const room = lr && pr && pr.top > lr.bottom ? (pr.top - lr.bottom - 24) / h : 0.5;
  const frac = Math.min(Math.max(Math.min(room, (w / h) * 1.05), 0.22), 0.52);
  const has = lr && lr.height;
  return {
    clasp: { x: w / 2, y: has ? lr.bottom + 6 : h * 0.1 },
    height: frac * h,
    hook: has ? { x: w / 2, y: (lr.top + lr.bottom) / 2 } : null,
  };
}

const kc = canvas && dangleKeychain({ canvas, hitArea: splash, frame });
if (!kc) canvas && canvas.remove();
else {
  const mo = new MutationObserver(() => {
    if (!splash.hidden && !splash.classList.contains('gone')) return;
    mo.disconnect();
    setTimeout(() => { kc.dispose(); canvas.remove(); }, 700);   // after the splash fades
  });
  mo.observe(splash, { attributes: true, attributeFilter: ['class', 'hidden'] });
  window.__kc3d = { get rig() { return kc.rig; }, step: kc.step, nudge: kc.nudge };
}
