/**
 * Activated Merch landing page: DOM wiring, scroll choreography, the fan
 * reel and the product lineup. The 3D stage lives in scene.js.
 */
const SHOP = "https://shop.medialife.ai/products/";
const BASE = "/activated-merch/";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Prices and names as listed on shop.medialife.ai (USD), Nov 2026.
// `side` is where the main print is. `tag` is where the round NFC disc is
// embedded in the design (u: -1 … 1 across the garment, v: 0 hem … 1 top).
// It usually sits behind the character's head in the print, or under a front
// logo; it varies by product. Change spots here and nowhere else.
const HEAD = "Behind the character's head";
const head = (u, v, side = "back") => ({ u, v, side, where: HEAD });
// const LOGO = { u: 0.26, v: 0.62, side: "front", where: "Under the front logo" };
const PRODUCTS = [
  { key: "sukeban-hoodie", name: "Sukeban AR Hoodie", short: "Sukeban Hoodie", price: 90, type: "apparel", tags: ["NFC", "AR"], handle: "black-hoodie-sukeban", side: "back", tag: head(0.06, 0.53) },
  { key: "syndicate-tee", name: "Syndicate AR Tee", short: "Syndicate Tee", price: 75, type: "apparel", tags: ["NFC", "AR"], handle: "syndicate-ar-tee", side: "back", tag: head(0.02, 0.72) },
  { key: "trainwreck-tee", name: "Trainwreck AR Tee", short: "Trainwreck Tee", price: 75, type: "apparel", tags: ["NFC", "AR"], handle: "unisex-classic-tee", side: "back", tag: head(0.12, 0.61) },
  { key: "trainwreck-hoodie", name: "Trainwreck AR Hoodie", short: "Trainwreck Hoodie", price: 90, type: "apparel", tags: ["NFC", "AR"], handle: "unisex-hoodie", side: "back", tag: head(0.12, 0.52) },
  { key: "sukeban-cardigan", name: "Sukeban AR Corduroy Cardigan", short: "Sukeban Cardigan", price: 120, type: "apparel", tags: ["NFC", "AR"], handle: "sukeban-ar-corduroy-cardigan", side: "back", tag: head(0.06, 0.7) },
  { key: "syndicate-ls", name: "Syndicate L/S Tee", short: "Syndicate L/S", price: 75, type: "apparel", tags: ["NFC", "AR"], handle: "syndicate-l-s-tee", side: "front", tag: head(-0.02, 0.61, "front") },
  { key: "syndicate-zip", name: "Syndicate Zip Hoodie", short: "Syndicate Zip", price: 90, type: "apparel", tags: ["NFC", "AR"], handle: "syndicate-zip-hoodie", side: "back", tag: head(-0.1, 0.57) },
  { key: "evade-charms", name: "EVADE Eclipse Charm Set", price: 14.99, type: "keychain", tags: ["QR", "Game"], handle: "bobo-eclipse-ar-keychain-set", orbit: "-25deg 85deg auto" },
  { key: "sukeban-keychain", name: "Sukeban Keychain", price: 14.99, type: "keychain", tags: ["QR"], handle: "sukeban-keychain", orbit: "-25deg 85deg auto" },
  { key: "syndicate-keychain", name: "Syndicate Keychain", price: 14.99, type: "keychain", tags: ["QR"], handle: "syndicate-keychain", orbit: "-25deg 85deg auto" },
  { key: "ar-stickers", name: "AR Sticker 3 Pack", price: 15, type: "sticker", tags: ["NFC", "AR"], handle: "sukeban-ii-sticker-3-pack", orbit: "-25deg 85deg auto" },
];
const APPAREL = PRODUCTS.filter((p) => p.type === "apparel");
// Poster renders: back prints are shot from behind, the rest from the front.
const orbitOf = (p) => p.orbit || (p.side === "back" ? "140deg 85deg auto" : "-29deg 85deg auto");

const VIDEOS = [
  { n: 5, tag: "Anime NYC · Sukeban" },
  { n: 2, tag: "In the wild" },
  { n: 7, tag: "In the wild" },
  { n: 1, tag: "In the wild" },
  { n: 3, tag: "Print, activated" },
  { n: 6, tag: "Card, activated" },
  { n: 4, tag: "Shelf, activated" },
];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const money = (v) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

/* ------------------------------------------------------------ 3D stage */
let stage = null;
let current = 0;

async function boot3D() {
  const canvas = $("#stage");
  try {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("no webgl2");
    const { Stage } = await import("./scene.js");
    stage = new Stage(canvas, {
      items: APPAREL.map((p) => ({ key: p.key, side: p.side, tag: p.tag })),
      reducedMotion: reduced,
      onChange: (i) => showPiece(i, { fromStage: true }),
    });
    if (location.search.includes("debug")) window.__stage = stage;
    requestAnimationFrame(loop);
    await stage.start(current);
    document.body.classList.add("has-3d");
  } catch (err) {
    console.warn("[activated] 3D unavailable:", err);
    stage = null;
    canvas.remove();
    $("#fallback").hidden = false;
    $("#hint").hidden = true;
    requestAnimationFrame(loop);
  }
}

function showPiece(i, { fromStage = false } = {}) {
  const p = APPAREL[i];
  current = i;
  $("#piece-name").textContent = p.name;
  $("#piece-price").textContent = money(p.price);
  $("#piece-tags").textContent = p.tags.join(" + ");
  $("#piece-count").textContent = `${String(i + 1).padStart(2, "0")} / ${String(APPAREL.length).padStart(2, "0")}`;
  $("#dock-name").textContent = p.name;
  $("#shop-piece").href = SHOP + p.handle;
  $("#fallback").src = `${BASE}posters/${p.key}.webp`;
  $("#fallback").alt = p.name;
  $$(".tag-where").forEach((el) => (el.textContent = p.tag.where));
  $$("#switcher button").forEach((b) => b.setAttribute("aria-checked", String(Number(b.dataset.i) === i)));
  const sw = $("#switcher");
  const on = sw.children[i];
  if (on && sw.scrollWidth > sw.clientWidth) sw.scrollTo({ left: on.offsetLeft - sw.offsetLeft - (sw.clientWidth - on.offsetWidth) / 2, behavior: reduced ? "auto" : "smooth" });
  const name = $("#dock-name");
  name.classList.remove("swap");
  void name.offsetWidth;
  name.classList.add("swap");
  if (!fromStage) stage?.goTo(i);
}

function buildSwitcher() {
  const sw = $("#switcher");
  APPAREL.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.i = String(i);
    b.setAttribute("aria-checked", String(i === current));
    b.setAttribute("aria-label", p.name);
    b.title = p.name;
    b.innerHTML = `<img src="${BASE}posters/${p.key}.webp" alt="" width="40" height="40" decoding="async" />`;
    b.addEventListener("click", () => showPiece(i));
    sw.append(b);
  });
  const step = (d) => {
    if (stage) stage.go(d);
    else showPiece((current + d + APPAREL.length) % APPAREL.length);
  };
  $("#piece-prev").addEventListener("click", () => step(-1));
  $("#piece-next").addEventListener("click", () => step(1));
  sw.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
      setTimeout(() => $$("#switcher button")[current]?.focus(), 50);
    }
  });
}

/* ------------------------------------------------------- scroll state */
const els = {};
let vh = innerHeight;
let geom = {};
function measure() {
  vh = innerHeight;
  const top = (el) => el.getBoundingClientRect().top + scrollY;
  geom = {
    details: top(els.details),
    tech: top(els.tech),
    techH: els.tech.offsetHeight,
  };
}

function scrollState() {
  const y = scrollY;
  const hero = clamp01(y / Math.max(1, geom.details - (innerWidth < 760 ? vh * 0.2 : 0)));
  const tech = clamp01((y - geom.tech) / Math.max(1, geom.techH - vh));
  const off = y > geom.tech + geom.techH - vh * 0.55;
  return { hero, tech, off };
}

function updateDom({ hero, tech }) {
  const specsIn = hero > 0.45;
  els.specs.forEach((li, i) => {
    if (specsIn && !li.classList.contains("in")) setTimeout(() => li.classList.add("in"), reduced ? 0 : i * 90);
    if (!specsIn && hero < 0.3) li.classList.remove("in");
  });
  els.dock.classList.toggle("away", hero > 0.12);
  // Tech labels: the placement note at the cut-away, then the three layers.
  const anchors = stage && !els.mobile && tech > 0 && tech < 1 ? stage.anchors() : null;
  // Labels are positioned inside the pinned panel; anchors are viewport px.
  const pin = anchors ? els.techPin.getBoundingClientRect() : { left: 0, top: 0 };
  const place = (el, x, y) => (el.style.transform = `translate(${Math.round(x - pin.left)}px, ${Math.round(y - pin.top)}px)`);
  const note = els.tagNote;
  const noteOn = tech > 0.12 && tech < 0.32;
  note.classList.toggle("in", noteOn);
  if (anchors && noteOn) {
    const a = anchors[3];
    const x = Math.min(a.x + 80, innerWidth - note.offsetWidth - 16);
    const y = Math.min(Math.max(a.y - note.offsetHeight / 2, 80), innerHeight - note.offsetHeight - 60);
    place(note, x, y);
  }
  let hot = -1;
  let floor = 70;
  const order = [0, 1, 2];
  if (anchors) order.sort((i, j) => anchors[i].y - anchors[j].y);
  const colX = anchors ? Math.max(anchors[0].x, anchors[1].x, anchors[2].x) + 56 : 0;
  order.forEach((i) => {
    const li = els.layerLabels[i];
    const on = tech > 0.36 + i * 0.06 && tech < 0.995;
    li.classList.toggle("in", on);
    if (on) hot = Math.max(hot, i);
    if (anchors) {
      const a = anchors[i];
      const h = li.offsetHeight;
      const x = Math.min(colX, innerWidth - li.offsetWidth - 16);
      li.style.setProperty("--lead", `${Math.max(14, Math.round(x - a.x))}px`);
      const y = Math.max(a.y - h / 2, floor);
      floor = y + h + 8;
      place(li, x, y);
    }
  });
  if (tech > 0.6) hot = 1;
  els.layerLabels.forEach((li, i) => li.classList.toggle("hot", i === hot));
  els.tap.classList.toggle("in", tech > 0.72);
  els.techPin.classList.toggle("tapping", tech > 0.7);
  els.techProgress.style.width = `${tech * 100}%`;
}

let wasOff = false;
function loop() {
  const s = scrollState();
  els.canvas?.classList.toggle("off", s.off);
  if (stage) {
    stage.update(s);
    if (s.off && !wasOff) stage.settle();
    if (!s.off && !document.hidden) stage.frame();
  }
  wasOff = s.off;
  updateDom(s);
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------ pointer */
function wirePointer() {
  const zones = [$("#hero"), $("#details")];
  let active = null; // { id, zone }
  const ndc = (e) => ({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 });
  const finish = () => {
    if (!active) return;
    active.zone.classList.remove("is-grabbing", "is-browsing");
    active = null;
    stage?.pointerUp();
  };
  for (const z of zones) {
    z.addEventListener("pointerdown", (e) => {
      if (!stage || active || e.button > 0 || e.target.closest("button, a, input")) return;
      const mode = stage.pointerDown(ndc(e), { canBrowse: z.id === "hero" });
      if (!mode) return;
      active = { id: e.pointerId, zone: z };
      z.classList.add(mode === "grab" ? "is-grabbing" : "is-browsing");
      try {
        z.setPointerCapture(e.pointerId);
      } catch {}
      els.hint.classList.add("used");
    });
    z.addEventListener("pointermove", (e) => {
      if (!stage) return;
      if (e.pointerType === "mouse") stage.setPointer(ndc(e).x, ndc(e).y);
      if (active && e.pointerId === active.id) stage.pointerMove(ndc(e));
    });
    const end = (e) => {
      if (active && e.pointerId === active.id) finish();
    };
    z.addEventListener("pointerup", end);
    z.addEventListener("pointercancel", end);
    z.addEventListener("lostpointercapture", end);
  }
  // Belt and braces: a release anywhere ends the interaction.
  addEventListener("pointerup", (e) => active && e.pointerId === active.id && finish());
  addEventListener("pointercancel", (e) => active && e.pointerId === active.id && finish());
  addEventListener("blur", () => {
    finish();
    stage?.settle();
  });
  // Scrolling stirs a breeze through the piece; it settles once you stop.
  let lastY = scrollY;
  addEventListener(
    "scroll",
    () => {
      const d = scrollY - lastY;
      lastY = scrollY;
      if (!stage) return;
      if (scrollY < geom.tech) stage.breeze(Math.min(2.2, Math.abs(d) * 0.05));
      if (active && Math.abs(d) > 30) finish();
    },
    { passive: true },
  );
}

/* ------------------------------------------------------------- the reel */
function buildReel() {
  const track = $("#reel-track");
  const cards = VIDEOS.map((v, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "reel__card";
    b.setAttribute("aria-label", `Play fan video: ${v.tag}`);
    const num = String(v.n).padStart(2, "0");
    b.innerHTML = `<video muted loop playsinline preload="none" poster="${BASE}media/fan-${num}.webp"></video><span class="tagline mono">${v.tag}</span>`;
    b.dataset.src = `${BASE}media/fan-${num}.mp4`;
    b.addEventListener("click", () => {
      if (i === center) openLightbox(b.dataset.src, v.tag);
      else go(i);
    });
    track.append(b);
    return b;
  });
  let center = 0;
  const layout = () => {
    const narrow = innerWidth < 760;
    cards.forEach((c, i) => {
      let d = i - center;
      const n = cards.length;
      if (d > n / 2) d -= n;
      if (d < -n / 2) d += n;
      const ad = Math.abs(d);
      const x = d * (narrow ? 62 : 78);
      c.style.transform = `translate(-50%, -50%) translateX(${x}%) translateZ(${-ad * 170}px) rotateY(${-d * 24}deg)`;
      c.style.opacity = ad > 3 ? "0" : String(1 - ad * 0.18);
      c.style.filter = ad ? `brightness(${1 - ad * 0.2}) saturate(${1 - ad * 0.25})` : "none";
      c.style.zIndex = String(10 - ad);
      c.classList.toggle("is-center", ad === 0);
      c.tabIndex = ad === 0 ? 0 : -1;
      const vid = c.querySelector("video");
      if (ad === 0 && reelVisible && !reduced) {
        if (!vid.src) vid.src = c.dataset.src;
        vid.play().catch(() => {});
      } else vid.pause();
    });
  };
  const go = (i) => {
    center = (i + cards.length) % cards.length;
    layout();
  };
  let reelVisible = false;
  new IntersectionObserver(([e]) => {
    reelVisible = e.isIntersecting;
    layout();
  }).observe(track);
  $(".reel__btn--prev").addEventListener("click", () => go(center - 1));
  $(".reel__btn--next").addEventListener("click", () => go(center + 1));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") go(center - 1);
    if (e.key === "ArrowRight") go(center + 1);
  });
  // Swipe.
  let sx = null;
  track.addEventListener("pointerdown", (e) => (sx = e.clientX));
  track.addEventListener("pointerup", (e) => {
    if (sx == null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) {
      e.preventDefault();
      go(center + (dx < 0 ? 1 : -1));
    }
  });
  addEventListener("resize", layout);
  layout();
}

function openLightbox(src, label) {
  const dlg = $("#lightbox");
  const v = dlg.querySelector("video");
  v.src = src;
  dlg.setAttribute("aria-label", `Fan video: ${label}`);
  dlg.showModal();
  v.play().catch(() => {});
}
function wireLightbox() {
  const dlg = $("#lightbox");
  const close = () => dlg.close();
  dlg.querySelector(".lightbox__close").addEventListener("click", close);
  dlg.addEventListener("click", (e) => e.target === dlg && close());
  dlg.addEventListener("close", () => dlg.querySelector("video").pause());
}

/* ------------------------------------------------------------- lineup */
// Every card is a real 3D model. The poster render shows first; the
// model-viewer script and each model load only as the section comes near.
function buildLineup() {
  const ul = $("#cards");
  PRODUCTS.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "card rv";
    li.dataset.type = p.type;
    const chips = p.tags
      .map((t) => `<span class="chip ${t === "NFC" ? "chip--nfc" : t === "AR" ? "chip--ar" : ""}">${t === "NFC" ? "NFC tap" : t === "AR" ? "AR scan" : t === "QR" ? "QR scan" : t}</span>`)
      .join("");
    li.innerHTML = `
      <div class="card__head">
        <span class="card__n mono">${String(i + 1).padStart(2, "0")}</span>
        <h3 class="card__name">${p.name}</h3>
        <span class="card__price">${money(p.price)}</span>
      </div>
      <div class="card__stage">
        <model-viewer
          src="${BASE}models/${p.key}.glb"
          alt="3D model of the ${p.name}. Drag to turn it."
          loading="lazy"
          reveal="auto"
          camera-controls
          disable-zoom
          disable-pan
          touch-action="pan-y"
          interaction-prompt="none"
          auto-rotate
          auto-rotate-delay="1500"
          rotation-per-second="14deg"
          camera-orbit="${orbitOf(p)}"
          field-of-view="28deg"
          shadow-intensity="0.9"
          shadow-softness="1"
          exposure="1.05"
          environment-image="neutral"
          ar
          ar-modes="webxr scene-viewer quick-look"
        >
          <img slot="poster" class="card__poster" src="${BASE}posters/${p.key}.webp" alt="${p.name}" loading="lazy" decoding="async" width="760" height="760" />
          <button slot="ar-button" class="card__ar mono" type="button">View in your space</button>
          <span class="card__spin mono" aria-hidden="true">3D · drag to turn</span>
        </model-viewer>
      </div>
      <div class="card__tags">${chips}</div>
      <div class="card__actions">
        ${p.type === "apparel" ? `<button type="button" data-hang="${APPAREL.indexOf(p)}">See it up close</button>` : ""}
        <a href="${SHOP + p.handle}" target="_blank" rel="noopener">Shop <span aria-hidden="true">↗</span></a>
      </div>`;
    ul.append(li);
  });
  ul.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hang]");
    if (!b) return;
    showPiece(Number(b.dataset.hang));
    scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  });
  $$("#filters button").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#filters button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      const f = b.dataset.f;
      $$("#cards .card").forEach((c) => (c.hidden = f !== "all" && c.dataset.type !== f));
    }),
  );
  // Load the viewer itself only when the collection is about to be seen.
  let loaded = false;
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting || loaded) return;
      loaded = true;
      io.disconnect();
      import(`${BASE}vendor/model-viewer.min.js`).catch((err) => console.warn("[activated] model-viewer failed", err));
    },
    { rootMargin: "900px 0px" },
  );
  io.observe(ul);
}

/* ----------------------------------------------------------- stickers */
function wireSticker() {
  const art = $("#sticker-art");
  const s = $("#sticker3d");
  if (reduced) return;
  art.addEventListener("pointermove", (e) => {
    const r = art.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    s.style.transform = `rotateY(${x * 30}deg) rotateX(${-y * 22}deg)`;
    s.style.setProperty("--fx", `${50 + x * 100}%`);
    s.style.setProperty("--fy", `${50 + y * 100}%`);
  });
  art.addEventListener("pointerleave", () => (s.style.transform = ""));
}

/* ------------------------------------------------------------ reveals */
function wireReveals() {
  $$(".step, .brandbar, .stickers__copy, .case, .partner > *").forEach((el) => el.classList.add("rv"));
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -8% 0px" },
  );
  $$(".rv").forEach((el) => io.observe(el));
}

/* --------------------------------------------------------------- boot */
function init() {
  els.canvas = $("#stage");
  els.details = $("#details");
  els.tech = $("#tech");
  els.techPin = $(".tech__pin");
  els.specs = $$(".specs li");
  els.layerLabels = $$("#layer-labels li");
  els.tagNote = $("#tag-note");
  els.tap = $("#tech-tap");
  els.techProgress = $("#tech-progress");
  els.dock = $(".hero__dock");
  els.hint = $("#hint");
  els.mobile = innerWidth < 760;
  buildSwitcher();
  showPiece(0, { fromStage: true });
  buildReel();
  buildLineup();
  wireLightbox();
  wireSticker();
  wireReveals();
  wirePointer();
  measure();
  addEventListener("resize", () => {
    els.mobile = innerWidth < 760;
    measure();
    stage?.resize();
  });
  addEventListener("load", measure);
  boot3D();
}
init();
