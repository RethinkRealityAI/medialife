/**
 * The drop stage: the EVADE creators page's 3D centrepiece.
 *
 * Contract with the page:
 *   <div id="dropStage" class="drop-stage" data-gameplay-url="…"></div>
 *   <link rel="stylesheet" href="/evade/creators/assets/css/stage.css">
 *   importmap: three, three/addons/, qrcode (same as /merch-shelf/)
 *   <script type="module" src="/evade/creators/assets/js/stage.js"></script>
 *
 * Self-boots: poster + loader immediately; three.js and the models only once
 * the stage nears the viewport. Rendering pauses offscreen and in hidden tabs.
 * Static fallback (2D art) when WebGL is unavailable or the 3D fails.
 *
 * Events on #dropStage: stage:ready, stage:select {detail:{id}} (id null when
 * back to the overview), stage:bobo (Bobo tapped).
 * window.EvadeStage = { select(id), reset(), ids }.
 */

const IMG = "/evade/creators/assets/img/";
/**
 * The production keychain model, when it exists (nodes Charm_Bobo, Charm_Eclipse
 * pivoting at their holes, plus Hardware; metres, Y up). Until it ships, the
 * stage builds the charms procedurally from the art. Set to "" to skip the check.
 */
export const KEYCHAIN_GLB = "/evade/keychain/evade-keychain.glb";

export const ITEMS = [
  {
    id: "keychain",
    status: "live",
    short: "Charm set",
    name: "Bobo × Eclipse charm set",
    line: "Scan the back → play Cola Run, starring Bobo",
    meta: "Double-sided acrylic · QR on the back · silver clasp",
  },
  { id: "tee", status: "soon", short: "Tee", name: "Activated Tee", line: "Same tag, new unlocks" },
  { id: "hoodie", status: "soon", short: "Hoodie", name: "Activated Hoodie", line: "Same tag, new unlocks" },
  { id: "cap", status: "soon", short: "Cap", name: "Activated Cap", line: "Same tag, new unlocks" },
  { id: "deskmat", status: "soon", short: "Desk mat", name: "Activated Desk Mat", line: "Same tag, new unlocks" },
];

const ICON = {
  keychain:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.5" r="2.2"/><path d="M12 6.7v2.3"/><path d="M8.2 10.5c0-1 .8-1.6 1.6-1.6h4.4c.9 0 1.6.7 1.6 1.6v7.8a3 3 0 0 1-3 3h-1.6a3 3 0 0 1-3-3z"/><path d="M10 14.5h4"/></svg>',
  tee: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 3.5 4 6l1.8 4 2-1V20h8.4V9l2 1L20 6l-4.5-2.5c-.6 1.5-2 2.5-3.5 2.5s-2.9-1-3.5-2.5z"/></svg>',
  hoodie:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4c.7-1 1.8-1.5 3-1.5S14.3 3 15 4l4.5 2.5L18 11l-1.6-.7V20H7.6v-9.7L6 11 4.5 6.5z"/><path d="M9 4c0 2 1.3 3.5 3 3.5S15 6 15 4"/><path d="M11 8v3M13 8v3"/></svg>',
  cap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 15a7.5 7.5 0 0 1 15 0z"/><path d="M19.5 15c1.6 0 2.5.6 2.5 1.2s-2 1.3-5 1.3H4.5"/><path d="M12 7.5V6.3"/></svg>',
  deskmat:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="7" width="19" height="10" rx="2"/><path d="M15.5 10.2a1.6 1.6 0 1 1 0 3.2"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  qr: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6" height="6" rx="1"/><rect x="14.5" y="3.5" width="6" height="6" rx="1"/><rect x="3.5" y="14.5" width="6" height="6" rx="1"/><path d="M14.5 14.5h2.5v2.5M20.5 14.5v6h-6M17 20.5"/></svg>',
  paw: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.5" rx="4.3" ry="3.6"/><circle cx="6.3" cy="10.2" r="1.8"/><circle cx="9.6" cy="6.6" r="1.8"/><circle cx="14.4" cy="6.6" r="1.8"/><circle cx="17.7" cy="10.2" r="1.8"/></svg>',
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function ensureNeonFont() {
  if ([...document.querySelectorAll("link[href]")].some((l) => /Tilt\+Neon/.test(l.href))) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Tilt+Neon&display=swap";
  document.head.appendChild(l);
}

function posterHTML(fallback) {
  return `
    <div class="ds-poster${fallback ? " is-fallback" : ""}" aria-hidden="${fallback ? "false" : "true"}">
      <div class="ds-poster-grid"></div>
      <div class="ds-poster-glow"></div>
      <div class="ds-poster-art">
        <div class="ds-poster-ring"></div>
        <img class="ds-poster-bobo" src="${IMG}bobo-cat.webp" alt="${fallback ? "Bobo the cat charm" : ""}" width="944" height="1032" decoding="async">
        <img class="ds-poster-can" src="${IMG}eclipse-can.webp" alt="${fallback ? "Eclipse soda can charm" : ""}" width="743" height="871" decoding="async">
      </div>
      ${
        fallback
          ? `<div class="ds-poster-labels">
              <p class="ds-pill ds-pill-live"><span class="ds-dot"></span>Current drop · Live now</p>
              <p class="ds-poster-name">Bobo × Eclipse charm set</p>
              <p class="ds-poster-line">Scan the back → play Cola Run, starring Bobo</p>
              <p class="ds-pill ds-pill-soon">Future drops · Tee · Hoodie · Cap · Desk mat — coming soon</p>
            </div>`
          : `<div class="ds-loader" role="progressbar" aria-label="Loading the drop" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>`
      }
    </div>`;
}

function overlayHTML(gameplayUrl) {
  const live = ITEMS[0];
  const btn = (it) => `
      <button type="button" class="ds-opt ${it.status === "live" ? "ds-opt-live" : "ds-opt-soon"}" data-id="${it.id}" aria-pressed="false"
        aria-label="${esc(it.name)} — ${it.status === "live" ? "current drop, live now" : "future drop, coming soon"}">
        <span class="ds-opt-icon">${ICON[it.id]}</span>
        <span class="ds-opt-label">${esc(it.short)}</span>
        ${it.status === "live" ? '<span class="ds-opt-tag"><span class="ds-dot"></span>Live now</span>' : ""}
      </button>`;
  return `
    <div class="ds-ui">
      <button type="button" class="ds-hint" hidden aria-label="Tap Bobo">${ICON.paw}<span>Tap Bobo</span></button>
      <div class="ds-toast" role="status" aria-live="polite"></div>
      <section class="ds-caption" aria-live="polite" aria-atomic="true" hidden>
        <button type="button" class="ds-close" aria-label="Back to the drop">${ICON.close}</button>
        <p class="ds-pill"></p>
        <h3 class="ds-cap-name"></h3>
        <p class="ds-cap-line"></p>
        <p class="ds-cap-meta"></p>
        ${gameplayUrl ? `<a class="ds-cap-cta" href="${esc(gameplayUrl)}" hidden>${ICON.qr}<span>See Cola Run in action</span></a>` : ""}
      </section>
      <nav class="ds-bar" aria-label="The drop">
        <div class="ds-group ds-group-live">
          <p class="ds-group-label">Current drop</p>
          <div class="ds-row">${btn(live)}</div>
        </div>
        <div class="ds-group ds-group-soon">
          <p class="ds-group-label">Future drops <span>· coming soon</span></p>
          <div class="ds-row">${ITEMS.slice(1).map(btn).join("")}</div>
        </div>
      </nav>
    </div>`;
}

function boot(el) {
  if (el.dataset.stageBooted) return;
  el.dataset.stageBooted = "1";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gameplayUrl = el.dataset.gameplayUrl || "";
  el.classList.add("drop-stage");
  el.setAttribute("role", "region");
  if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", "The drop: activated EVADE merch in 3D");

  if (!hasWebGL()) {
    el.classList.add("is-fallback");
    el.innerHTML = posterHTML(true);
    return;
  }
  ensureNeonFont();
  el.innerHTML = `<canvas class="ds-canvas" aria-hidden="true"></canvas>${posterHTML(false)}${overlayHTML(gameplayUrl)}`;
  const canvas = el.querySelector(".ds-canvas");
  const poster = el.querySelector(".ds-poster");
  const loaderBar = el.querySelector(".ds-loader");
  const caption = el.querySelector(".ds-caption");
  const toastEl = el.querySelector(".ds-toast");
  const hint = el.querySelector(".ds-hint");
  const opts = [...el.querySelectorAll(".ds-opt")];
  const fire = (type, detail) => el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));

  let stage = null;
  let current = null;
  let pendingSelect = null;
  let toastTimer = 0;

  const setProgress = (p) => {
    if (!loaderBar) return;
    loaderBar.style.setProperty("--p", String(p));
    loaderBar.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  };

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2600);
  }

  function showCaption(id) {
    const it = ITEMS.find((x) => x.id === id);
    if (!it) {
      caption.hidden = true;
      el.classList.remove("is-focus");
      return;
    }
    el.classList.add("is-focus");
    const pill = caption.querySelector(".ds-pill");
    pill.className = `ds-pill ${it.status === "live" ? "ds-pill-live" : "ds-pill-soon"}`;
    pill.innerHTML = it.status === "live" ? '<span class="ds-dot"></span>Current drop · Live now' : "Future drop · Coming soon";
    caption.querySelector(".ds-cap-name").textContent = it.name;
    caption.querySelector(".ds-cap-line").textContent = it.line;
    const meta = caption.querySelector(".ds-cap-meta");
    meta.textContent = it.meta || "";
    meta.hidden = !it.meta;
    const cta = caption.querySelector(".ds-cap-cta");
    if (cta) cta.hidden = it.id !== "keychain";
    caption.hidden = false;
    caption.classList.remove("in");
    void caption.offsetWidth;
    caption.classList.add("in");
  }

  function select(id, { fromScene = false } = {}) {
    if (id && !ITEMS.some((x) => x.id === id)) return;
    if (!id) return reset();
    if (!stage) {
      pendingSelect = id;
      return;
    }
    if (current === id) return;
    current = id;
    stage.select(id);
    opts.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
    showCaption(id);
    fire("stage:select", { id });
    if (fromScene) opts.find((b) => b.dataset.id === id)?.focus({ preventScroll: true });
  }
  function reset() {
    pendingSelect = null;
    if (!stage || !current) return;
    const prev = current;
    current = null;
    stage.reset();
    opts.forEach((b) => b.setAttribute("aria-pressed", "false"));
    showCaption(null);
    fire("stage:select", { id: null });
    if (caption.contains(document.activeElement)) opts.find((b) => b.dataset.id === prev)?.focus({ preventScroll: true });
  }

  opts.forEach((b) =>
    b.addEventListener("click", () => (current === b.dataset.id ? reset() : select(b.dataset.id))),
  );
  caption.querySelector(".ds-close").addEventListener("click", reset);
  document.addEventListener("keydown", (e) => {
    // Esc returns to the overview when the stage (or nothing in particular) has focus
    const a = document.activeElement;
    const ours = !a || a === document.body || el.contains(a);
    if (e.key === "Escape" && current && ours && !e.defaultPrevented) {
      e.preventDefault();
      reset();
    }
  });
  hint.addEventListener("click", () => {
    if (!stage) return;
    stage.debug.bobo?.tap();
    onBobo();
  });

  let tapped = false;
  function onBobo() {
    tapped = true;
    hint.hidden = true;
    toast("Bobo, hero of Cola Run");
    fire("stage:bobo", {});
  }

  window.EvadeStage = {
    ids: ITEMS.map((x) => x.id),
    select: (id) => select(id),
    reset: () => reset(),
  };

  // ---- lazy 3D -------------------------------------------------------------------
  let inView = false;
  let starting = false;
  const visibility = () => stage?.setActive(inView && !document.hidden);

  async function start() {
    if (starting) return;
    starting = true;
    setProgress(0.12);
    try {
      const { createStage } = await import("./stage/engine.js");
      setProgress(0.25);
      stage = await createStage({
        canvas,
        el,
        reduced,
        keychainUrl: KEYCHAIN_GLB,
        onProgress: (p) => setProgress(0.25 + p * 0.75),
        onSelect: (id) => (id ? select(id, { fromScene: true }) : reset()),
        onBobo,
        onBoboReady: () => {
          if (!tapped) setTimeout(() => (hint.hidden = tapped), 2500);
        },
      });
      window.EvadeStage.debug = stage.debug;
      el.classList.add("is-ready");
      poster.classList.add("out");
      setTimeout(() => poster.remove(), 900);
      visibility();
      fire("stage:ready", { ids: ITEMS.map((x) => x.id) });
      if (pendingSelect) {
        const id = pendingSelect;
        pendingSelect = null;
        select(id);
      }
    } catch (e) {
      console.warn("[stage] 3D unavailable, showing the poster:", e?.message || e);
      el.classList.add("is-fallback");
      el.innerHTML = posterHTML(true);
      fire("stage:ready", { ids: ITEMS.map((x) => x.id), fallback: true });
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) start();
      }
    },
    { rootMargin: "400px 0px" },
  );
  io.observe(el);
  // a second observer with no margin decides whether to render
  const io2 = new IntersectionObserver(
    (entries) => {
      for (const en of entries) inView = en.isIntersecting;
      visibility();
    },
    { rootMargin: "40px 0px" },
  );
  io2.observe(el);
  document.addEventListener("visibilitychange", visibility);
}

function init() {
  const el = document.getElementById("dropStage");
  if (el) boot(el);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
