/**
 * Activated Merch landing page: DOM wiring, scroll choreography, the fan
 * reel and the product lineup. The 3D stage lives in scene.js.
 */
const SHOP = "https://shop.medialife.ai/products/";
const BASE = "/activated-merch/";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Prices and names as listed on shop.medialife.ai (USD), Nov 2026.
const PRODUCTS = [
  { key: "sukeban-hoodie", name: "Sukeban AR Hoodie", price: 90, type: "apparel", tags: ["NFC", "AR"], handle: "black-hoodie-sukeban", hang: true },
  { key: "syndicate-tee", name: "Syndicate AR Tee", price: 75, type: "apparel", tags: ["NFC", "AR"], handle: "syndicate-ar-tee", hang: true },
  { key: "trainwreck-tee", name: "Trainwreck AR Tee", price: 75, type: "apparel", tags: ["NFC", "AR"], handle: "unisex-classic-tee", hang: true },
  { key: "trainwreck-hoodie", name: "Trainwreck AR Hoodie", price: 90, type: "apparel", tags: ["NFC", "AR"], handle: "unisex-hoodie" },
  { key: "sukeban-cardigan", name: "Sukeban AR Corduroy Cardigan", price: 120, type: "apparel", tags: ["NFC", "AR"], handle: "sukeban-ar-corduroy-cardigan" },
  { key: "syndicate-ls", name: "Syndicate L/S Tee", price: 75, type: "apparel", tags: ["NFC", "AR"], handle: "syndicate-l-s-tee" },
  { key: "syndicate-zip", name: "Syndicate Zip Hoodie", price: 90, type: "apparel", tags: ["NFC", "AR"], handle: "syndicate-zip-hoodie" },
  { key: "evade-charms", name: "EVADE Eclipse Charm Set", price: 14.99, type: "keychain", tags: ["QR", "Game"], handle: "bobo-eclipse-ar-keychain-set" },
  { key: "sukeban-keychain", name: "Sukeban Keychain", price: 14.99, type: "keychain", tags: ["QR"], handle: "sukeban-keychain" },
  { key: "syndicate-keychain", name: "Syndicate Keychain", price: 14.99, type: "keychain", tags: ["QR"], handle: "syndicate-keychain" },
  { key: "ar-stickers", name: "AR Sticker 3 Pack", price: 15, type: "sticker", tags: ["NFC", "AR"], handle: "sukeban-ii-sticker-3-pack" },
];
const HANG = PRODUCTS.filter((p) => p.hang);

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
let specs = null;
let currentKey = HANG[0].key;

async function boot3D() {
  const canvas = $("#stage");
  try {
    const gl = canvas.getContext("webgl2");
    if (!gl) throw new Error("no webgl2");
    const { Stage } = await import("./scene.js");
    stage = new Stage(canvas, { reducedMotion: reduced });
    specs = await fetch(BASE + "garments.json").then((r) => r.json());
    await showPiece(currentKey, true);
    document.body.classList.add("has-3d");
    requestAnimationFrame(loop);
  } catch (err) {
    console.warn("[activated] 3D unavailable:", err);
    canvas.remove();
    $("#fallback").hidden = false;
    $("#hint").hidden = true;
  }
}

async function showPiece(key, first = false) {
  const p = PRODUCTS.find((x) => x.key === key);
  currentKey = key;
  $("#piece-name").textContent = p.name;
  $("#piece-price").textContent = money(p.price);
  $("#piece-tags").textContent = p.tags.join(" + ");
  $("#shop-piece").href = SHOP + p.handle;
  $("#fallback").src = `${BASE}p/${key}.webp`;
  $("#fallback").alt = `${p.name}, back print`;
  $$("#switcher button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.key === key)));
  if (stage && specs) {
    const spec = specs.find((s) => s.key === key);
    if (spec) await stage.show(spec);
    if (!first) stage.poke(1.2);
  }
}

function buildSwitcher() {
  const sw = $("#switcher");
  for (const p of HANG) {
    const b = document.createElement("button");
    b.type = "button";
    b.role = "radio";
    b.dataset.key = p.key;
    b.setAttribute("aria-checked", String(p.key === currentKey));
    b.textContent = p.name.split(" ")[0];
    b.setAttribute("aria-label", p.name);
    b.addEventListener("click", () => showPiece(p.key));
    sw.append(b);
  }
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

let lastTech = -1;
function scrollState() {
  const y = scrollY;
  const hero = clamp01(y / Math.max(1, geom.details - (innerWidth < 760 ? vh * 0.2 : 0)));
  const tech = clamp01((y - geom.tech) / Math.max(1, geom.techH - vh));
  const off = y > geom.tech + geom.techH - vh * 0.55;
  return { hero, tech, off };
}

function updateDom({ hero, tech }) {
  // Spec list slides in as the camera reaches the print.
  const specsIn = hero > 0.45;
  els.specs.forEach((li, i) => {
    if (specsIn && !li.classList.contains("in")) setTimeout(() => li.classList.add("in"), reduced ? 0 : i * 90);
    if (!specsIn && hero < 0.3) li.classList.remove("in");
  });
  if (tech === lastTech && !stage) return;
  lastTech = tech;
  // Layer labels.
  const anchors = stage && !els.mobile ? stage.layerAnchors() : null;
  const tapping = tech > 0.6;
  let hot = -1;
  let floor = 70; // keep labels from overlapping each other (top → bottom)
  els.layerLabels.forEach((li, i) => {
    const on = tech > 0.26 + i * 0.07 && tech < 0.995;
    li.classList.toggle("in", on);
    if (on) hot = i;
    if (anchors) {
      const a = anchors[i];
      const h = li.offsetHeight;
      const x = Math.min(a.x + 54, innerWidth - li.offsetWidth - 16);
      const y = Math.max(a.y - h / 2, floor);
      floor = y + h + 8;
      li.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    }
  });
  if (tapping) hot = 2;
  els.layerLabels.forEach((li, i) => li.classList.toggle("hot", i === hot));
  els.tap.classList.toggle("in", tech > 0.72);
  els.tap.parentElement.parentElement.classList.toggle("tapping", tech > 0.7);
  els.techProgress.style.width = `${tech * 100}%`;
}

function loop() {
  const s = scrollState();
  els.canvas.classList.toggle("off", s.off);
  if (stage) {
    stage.update(s);
    if (!s.off && !document.hidden) stage.frame();
  }
  updateDom(s);
  requestAnimationFrame(loop);
}

/* ------------------------------------------------------------ pointer */
function wirePointer() {
  const zone = $("#hero");
  const details = $("#details");
  let dragging = null;
  const ndc = (e) => ({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 });
  const onMove = (e) => {
    if (!stage) return;
    const p = ndc(e);
    if (e.pointerType === "mouse") stage.setPointer(p.x, p.y);
    if (!dragging) return;
    if (dragging.grab) stage.dragTo(p);
    else {
      const dx = e.clientX - dragging.x;
      dragging.x = e.clientX;
      stage.nudge(dx * 0.05);
    }
  };
  for (const z of [zone, details]) {
    z.addEventListener("pointerdown", (e) => {
      if (!stage || e.target.closest("button, a")) return;
      const grab = stage.grabAt(ndc(e));
      dragging = { grab, x: e.clientX };
      $("#hint").style.opacity = "0";
      if (e.pointerType === "mouse") z.setPointerCapture(e.pointerId);
    });
  }
  addEventListener("pointermove", onMove, { passive: true });
  const end = () => {
    if (dragging?.grab) stage.release();
    dragging = null;
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
  // Scrolling through the hero stirs the cloth a little.
  let lastY = scrollY;
  addEventListener(
    "scroll",
    () => {
      const d = scrollY - lastY;
      lastY = scrollY;
      if (stage?.current && Math.abs(d) > 2 && scrollY < geom.tech) stage.current.gust.z += Math.min(0.4, Math.abs(d) * 0.01);
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
      <div class="card__stage"><img class="card__img" src="${BASE}p/${p.key}.webp" alt="${p.name}" loading="lazy" decoding="async" /></div>
      <div class="card__tags">${chips}</div>
      <div class="card__actions">
        ${p.hang ? `<button type="button" data-hang="${p.key}">Hang it in 3D</button>` : ""}
        <a href="${SHOP + p.handle}" target="_blank" rel="noopener">Shop <span aria-hidden="true">↗</span></a>
      </div>`;
    ul.append(li);
    const img = li.querySelector(".card__img");
    const stageEl = li.querySelector(".card__stage");
    if (!reduced) {
      li.addEventListener("pointermove", (e) => {
        const r = stageEl.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        img.style.transform = `rotateY(${x * 26}deg) rotateX(${-y * 16}deg) scale(1.04)`;
      });
      li.addEventListener("pointerleave", () => (img.style.transform = ""));
    }
  });
  ul.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hang]");
    if (!b) return;
    showPiece(b.dataset.hang);
    scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  });
  $$("#filters button").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#filters button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      const f = b.dataset.f;
      $$("#cards .card").forEach((c) => (c.hidden = f !== "all" && c.dataset.type !== f));
    }),
  );
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
  els.specs = $$(".specs li");
  els.layerLabels = $$("#layer-labels li");
  els.tap = $("#tech-tap");
  els.techProgress = $("#tech-progress");
  els.mobile = innerWidth < 760;
  buildSwitcher();
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
  boot3D().then(() => {
    if (!stage) requestAnimationFrame(loop);
  });
}
init();
