// On-screen view controls for the Collector Hub labs: zoom in/out, recentre
// and full screen, stacked on the right edge. Mouse, trackpad and touch
// gestures still work; these are for people who don't know them, and for
// presenting on a big screen.
//
//   mountViewControls({ onZoom: (dir) => {}, onRecenter: () => {} })
//   → { show(on), el }

const CSS = `
.mlv{position:fixed;right:max(14px,env(safe-area-inset-right));top:50%;transform:translateY(-50%);z-index:2000050;
  display:flex;flex-direction:column;gap:2px;padding:5px;border-radius:16px;
  background:rgba(12,18,40,.55);border:1px solid rgba(160,200,255,.16);
  backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);
  box-shadow:0 10px 30px rgba(0,0,0,.35);transition:opacity .3s,transform .3s}
.mlv[hidden]{display:flex!important;opacity:0;pointer-events:none;transform:translate(8px,-50%)}
.mlv button{all:unset;box-sizing:border-box;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;
  color:#dfe9ff;cursor:pointer;transition:background .15s,color .15s}
.mlv button:hover{background:rgba(120,190,255,.14);color:#fff}
.mlv button:active{transform:scale(.94)}
.mlv button:focus-visible{outline:2px solid #36e3ff;outline-offset:1px}
.mlv svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.mlv hr{all:unset;display:block;height:1px;margin:3px 8px;background:rgba(160,200,255,.14)}
.mlv-tip{position:fixed;right:max(70px,calc(env(safe-area-inset-right) + 70px));top:50%;transform:translateY(-50%);z-index:2000050;
  max-width:220px;padding:10px 12px;border-radius:12px;background:rgba(12,18,40,.82);border:1px solid rgba(160,200,255,.16);
  color:#cfdcf7;font:500 12.5px/1.45 ui-sans-serif,system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .3s}
.mlv-tip.on{opacity:1}
.mlv-tip b{color:#fff;font-weight:700}
/* Phones pinch to zoom, so only reset and full screen stay. */
@media (pointer:coarse){.mlv [data-v=in],.mlv [data-v=out],.mlv hr{display:none}}
@media (max-width:700px){.mlv{top:auto;bottom:calc(env(safe-area-inset-bottom) + 132px);transform:none}
  .mlv[hidden]{transform:translateX(8px)}.mlv button{width:38px;height:38px}.mlv-tip{display:none}}
`;

const ICONS = {
  in: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  center:
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  exitFull: '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
};

export function mountViewControls({ onZoom, onRecenter }) {
  if (!document.getElementById("mlv-css")) {
    const st = document.createElement("style");
    st.id = "mlv-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const el = document.createElement("div");
  el.className = "mlv";
  el.setAttribute("role", "toolbar");
  el.setAttribute("aria-label", "View controls");
  const canFull = !!document.fullscreenEnabled;
  el.innerHTML = `
    <button type="button" data-v="in" aria-label="Zoom in" title="Zoom in">${ICONS.in}</button>
    <button type="button" data-v="out" aria-label="Zoom out" title="Zoom out">${ICONS.out}</button>
    <hr>
    <button type="button" data-v="center" aria-label="Reset the view" title="Reset the view">${ICONS.center}</button>
    ${canFull ? `<button type="button" data-v="full" aria-label="Full screen" title="Full screen">${ICONS.full}</button>` : ""}`;
  el.hidden = true;
  document.body.appendChild(el);

  const tip = document.createElement("div");
  tip.className = "mlv-tip";
  const coarse = matchMedia("(pointer: coarse)").matches;
  tip.innerHTML = coarse
    ? "<b>Drag</b> to look around · <b>pinch</b> to zoom · <b>two fingers</b> to move"
    : "<b>Drag</b> to look around · <b>scroll</b> to zoom · <b>right-drag</b> or <b>shift-drag</b> to move";
  document.body.appendChild(tip);
  let tipTimer;
  const showTip = () => {
    tip.classList.add("on");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tip.classList.remove("on"), 4200);
  };

  // Holding + or − keeps zooming.
  let hold;
  const stopHold = () => clearInterval(hold);
  for (const dir of ["in", "out"]) {
    const b = el.querySelector(`[data-v=${dir}]`);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onZoom(dir === "in" ? 1 : -1);
      stopHold();
      hold = setInterval(() => onZoom(dir === "in" ? 1 : -1), 140);
    });
    b.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onZoom(dir === "in" ? 1 : -1);
      }
    });
  }
  addEventListener("pointerup", stopHold);
  addEventListener("pointercancel", stopHold);
  el.querySelector("[data-v=center]").addEventListener("click", () => onRecenter());
  const full = el.querySelector("[data-v=full]");
  if (full) {
    full.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    document.addEventListener("fullscreenchange", () => {
      const on = !!document.fullscreenElement;
      full.innerHTML = on ? ICONS.exitFull : ICONS.full;
      full.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
      full.title = on ? "Exit full screen" : "Full screen";
    });
  }

  let shown = false;
  return {
    el,
    show(on) {
      el.hidden = !on;
      if (on && !shown) showTip();
      if (!on) tip.classList.remove("on");
      shown = shown || on;
    },
  };
}
