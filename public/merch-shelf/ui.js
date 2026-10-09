/**
 * DOM helpers shared by the panels: escaping, icons, a layer stack (Esc,
 * focus trap, focus return), toasts and the fly-to-cart flourish.
 */
export const $ = (id) => document.getElementById(id);
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isPhone = () => matchMedia("(max-width: 760px)").matches;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

const svg = (d, extra = "") => `<svg aria-hidden="true" viewBox="0 0 24 24"${extra}>${d}</svg>`;
export const ICON = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  prev: svg('<path d="M15 6l-6 6 6 6"/>'),
  next: svg('<path d="M9 6l6 6-6 6"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  gift: svg(
    '<path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13"/><path d="M12 7c-1.5-3-5-3.5-5-1.2C7 7 9 7 12 7zm0 0c1.5-3 5-3.5 5-1.2C17 7 15 7 12 7z"/>',
  ),
  ar: svg('<path d="M12 3l7 4v8l-7 4-7-4V7z"/><path d="M5 7l7 4 7-4M12 11v8"/>'),
  model: svg(
    '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="3" ry="7"/><path d="M5 12h14"/>',
  ),
  video: svg(
    '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor" stroke="none"/>',
  ),
  game: svg(
    '<path d="M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L14.5 13h-5l-1.1 1.8A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="16" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13" r=".6" fill="currentColor"/>',
  ),
  unlock: svg(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/>',
  ),
  scan: svg(
    '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  ),
  nfc: svg('<path d="M6 8.5a5 5 0 0 1 0 7M9.5 6a8.5 8.5 0 0 1 0 12M13 3.5a12 12 0 0 1 0 17"/>'),
  cart: svg(
    '<path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/>',
  ),
  link: svg(
    '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  ),
  image: svg(
    '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  ),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  replay: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  sparkle: svg('<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z"/>'),
};
export const KIND_ICON = {
  ar: ICON.ar,
  model: ICON.model,
  video: ICON.video,
  game: ICON.game,
  unlock: ICON.unlock,
};
export const KIND_LABEL = {
  ar: "AR moment",
  model: "3D collectible",
  video: "Video drop",
  game: "Mini-game",
  unlock: "Reward unlock",
};

/* ---- layers ------------------------------------------------------------------ */
const stack = [];
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Show a panel/modal. `modal` traps focus; Esc closes the topmost layer.
 * Returns a close function.
 */
export function openLayer(el, { modal = true, onClose, focus, openClass = "open" } = {}) {
  const prev = document.activeElement;
  el.hidden = false;
  void el.offsetWidth; // commit the closed state so the opening transition runs
  el.classList.add(openClass);
  const layer = { el, modal, onClose, prev, openClass };
  stack.push(layer);
  setTimeout(() => {
    const target = (focus && el.querySelector(focus)) || el.querySelector(FOCUSABLE);
    target?.focus({ preventScroll: true });
  }, 60);
  return () => closeLayer(el);
}

export function closeLayer(el, { restoreFocus = true, immediate = false } = {}) {
  const i = stack.findIndex((l) => l.el === el);
  if (i < 0) return false;
  const [layer] = stack.splice(i, 1);
  el.classList.remove(layer.openClass);
  const done = () => {
    if (!el.classList.contains(layer.openClass)) el.hidden = true;
  };
  if (immediate || reducedMotion()) done();
  else setTimeout(done, 480);
  if (restoreFocus && layer.prev && document.contains(layer.prev))
    layer.prev.focus?.({ preventScroll: true });
  layer.onClose?.();
  return true;
}

export const isOpen = (el) => stack.some((l) => l.el === el);
export const topLayer = () => stack[stack.length - 1]?.el || null;

document.addEventListener("keydown", (e) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === "Escape") {
    e.preventDefault();
    closeLayer(top.el);
    return;
  }
  if (e.key === "Tab" && top.modal) {
    const items = [...top.el.querySelectorAll(FOCUSABLE)].filter(
      (n) => n.offsetParent !== null || n === document.activeElement,
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (!top.el.contains(document.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }
});

/* ---- toast --------------------------------------------------------------------- */
let toastTimer = 0;
export function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), ms);
}

/* ---- fly to cart --------------------------------------------------------------- */
export function flyToCart(fromEl, img) {
  const to = $("btnCart");
  if (!fromEl || !to || reducedMotion()) {
    to?.classList.add("bump");
    setTimeout(() => to?.classList.remove("bump"), 600);
    return;
  }
  const a = fromEl.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.className = "fly";
  if (img) dot.style.backgroundImage = `url(${img})`;
  document.body.appendChild(dot);
  const x0 = a.left + a.width / 2 - 27;
  const y0 = a.top + a.height / 2 - 27;
  const x1 = b.left + b.width / 2 - 27;
  const y1 = b.top + b.height / 2 - 27;
  const anim = dot.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 30}px) scale(1.1)`, opacity: 1, offset: 0.2 },
      {
        transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 120}px) scale(0.9)`,
        offset: 0.6,
      },
      { transform: `translate(${x1}px, ${y1}px) scale(0.35)`, opacity: 0.6 },
    ],
    { duration: 850, easing: "cubic-bezier(.45,.05,.4,1)" },
  );
  anim.onfinish = () => {
    dot.remove();
    to.classList.add("bump");
    setTimeout(() => to.classList.remove("bump"), 600);
  };
}

/** Animate a number in an element. */
export function countTo(el, to, { format = (v) => String(Math.round(v)), ms = 700 } = {}) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = String(to);
  if (reducedMotion()) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  cancelAnimationFrame(Number(el.dataset.raf || 0));
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(from + (to - from) * e);
    if (k < 1) el.dataset.raf = String(requestAnimationFrame(step));
  };
  el.dataset.raf = String(requestAnimationFrame(step));
}

/** Safe localStorage. */
export const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

export function track(name, data) {
  try {
    window.ARTrack?.event(name, data);
  } catch {
    /* never break the page for analytics */
  }
}
