// EVADE hero: the real keychain, dangling, the same one as the Bobo Off the Chain splash.
// The physics and touch live in the shared module (/evade/keychain/dangle.js); this file only frames it so it
// hangs exactly where the still render (#heroKc img) is. The still stays as the poster and the fallback
// (no WebGL, slow load, the model failing to load).
//   - it hangs free (Dapo: no cable line), already in place, and swings off on load as if someone had just
//     touched it; no drop-in, since without a cable a fall would look like it stops in mid-air.
//   - wide screens: the canvas covers the hero (room to swing); phones: only the hero stage, so it never
//     draws over the copy above.
// Drag or flick it to swing it, tap it to jiggle it. Every few seconds of calm it nudges itself.
import { dangleKeychain } from "/evade/keychain/dangle.js";

const hero = document.querySelector(".hero");
const stage = document.getElementById("heroStage");
const fig = document.getElementById("heroKc");
const img = fig && fig.querySelector("img");

if (hero && stage && fig && img) {
  // after the page has painted, so the 3D never competes with the first view
  const go = () => ("requestIdleCallback" in window ? requestIdleCallback(init, { timeout: 1500 }) : setTimeout(init, 300));
  if (document.readyState === "complete") go();
  else addEventListener("load", go, { once: true });
}

function init() {
  const wide = matchMedia("(min-width: 1100px)").matches;
  const canvas = document.createElement("canvas");
  canvas.className = wide ? "hk-3d" : "hk-3d hk-3d--stage";
  canvas.setAttribute("aria-hidden", "true");
  (wide ? hero : stage).appendChild(canvas);
  // hold the still where it rests (no entrance animation or sway), so the model lines up with it
  fig.classList.add("kc-live");

  const frame = () => {
    const cr = canvas.getBoundingClientRect(), ir = img.getBoundingClientRect();
    // in the still, the clasp top sits at 58.9% across and 1% down; the whole set is 97.57% of its height
    const x = ir.left - cr.left + 0.589 * ir.width, y = ir.top - cr.top + 0.01 * ir.height;
    return { clasp: { x, y }, height: 0.9757 * ir.height, hook: { x, y: y - 2 } };
  };

  let hintEl = null, touched = false;
  const kc = dangleKeychain({
    canvas,
    hitArea: hero,
    frame,
    onReady(api) {
      const r = api.rig;
      // free-hanging: no cable and no drop; it is already hanging and swings off as if just touched
      r.cable.visible = false;
      r.P.copy(r.rest); r.V.set(0, 0, 0); r.taut = true;
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) api.nudge(1, 1.25);
      fig.classList.add("is-3d");
      setTimeout(() => { if (!touched) hint(true); }, 2600);
    },
  });
  if (!kc) { canvas.remove(); fig.classList.remove("kc-live"); return; }

  // the "you can touch it" hint, and a grab cursor over the keychain
  function hint(on) {
    if (on && !hintEl) {
      hintEl = document.createElement("span");
      hintEl.className = "hk-hint mono";
      hintEl.setAttribute("aria-hidden", "true");
      hintEl.innerHTML = "<i></i>" + (matchMedia("(pointer: coarse)").matches ? "Tap or swipe it" : "Tap or drag it");
      fig.appendChild(hintEl);
      requestAnimationFrame(() => hintEl.classList.add("on"));
    } else if (!on && hintEl) hintEl.classList.remove("on");
  }
  const near = (e) => {
    const ir = img.getBoundingClientRect();
    return e.clientX > ir.left - ir.width * 0.15 && e.clientX < ir.right + ir.width * 0.15 && e.clientY > ir.top - 24 && e.clientY < ir.bottom + 12;
  };
  hero.addEventListener("pointerdown", (e) => {
    if (e.target.closest("a,button") || !near(e)) return;
    touched = true; hint(false);
    hero.classList.add("kc-grab");
  });
  hero.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") hero.classList.toggle("kc-hover", near(e)); });
  const release = () => hero.classList.remove("kc-grab");
  hero.addEventListener("pointerup", release);
  hero.addEventListener("pointercancel", release);
  hero.addEventListener("pointerleave", () => hero.classList.remove("kc-hover"));

  // debug handle (alignment test): hold it at rest and draw one frame
  window.__heroKc = {
    api: kc,
    rest() {
      const r = kc.rig; if (!r) return;
      Object.assign(r, { phi: 0, dphi: 0, psi: 0, dpsi: 0, tau: 0, dtau: 0, b: 0, db: 0, e: 0, de: 0, eb: 0, deb: 0 });
      r.P.copy(r.rest); r.V.set(0, 0, 0); window.__kc3dPause = true; kc.step(0);
    },
  };
}
