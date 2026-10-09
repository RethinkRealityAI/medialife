/**
 * Creator Merch Shelf — boot + orchestration.
 *
 * Wires the config (config.js) to the stage (scene.js), the shelf, the neon
 * sign and the products, and owns the interaction state: hover, the product
 * focus (lift-out + sheet), the tour, the activation demo, the admin preview
 * protocol and the no-WebGL fallback. See README.md for the file map.
 */
import { resolveConfig, sanitize, loadDefaults, joinUrl, money, PRODUCT_META } from "./config.js";
import { $, esc, toast, track, isPhone, reducedMotion, closeLayer, topLayer } from "./ui.js";
import { ensureFonts } from "./art.js";
import { makeArtKit } from "./prints.js";

const params = new URLSearchParams(location.search);
const PREVIEW = params.get("preview") === "1";
const hashActivate = () => (location.hash.match(/activate=([a-z0-9-]{1,40})/) || [])[1] || null;

const app = {
  config: null,
  kit: null,
  scene: null,
  shelf: null,
  neon: null,
  products: new Map(),
  localLogo: null,
  localLogoName: "",
  focusedId: null,
  preview: PREVIEW,
  autoplayGame: false,
  joinUrl: () => joinUrl(app.config),
  enabledProducts: () => app.config.products.filter((p) => p.enabled),
  activateUrl: (id) =>
    `${location.origin}${location.pathname}${location.search}#activate=${encodeURIComponent(id)}`,
  greeting: () => app.config.pitch.preparedFor || app.linkName || "",
};
window.__shelfApp = app; // handy for debugging and tests

/* ------------------------------------------------------------------------- */
/* boot                                                                       */
/* ------------------------------------------------------------------------- */
function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function setHead(c) {
  const name = c.creator.name;
  document.title = `${name}’s activated merch · MEDIALIFE`;
  const set = (sel, v) => document.querySelector(sel)?.setAttribute("content", v);
  if (!window.__SHELF) {
    set('meta[property="og:title"]', document.title);
  }
}

function setChrome(c) {
  const greet = app.greeting();
  const p = $("prepared");
  if (greet || c.pitch.presentedBy) {
    p.innerHTML = `${greet ? `<span>Prepared for <b>${esc(greet)}</b></span>` : ""}${c.pitch.presentedBy ? `<span class="by">${esc(c.pitch.presentedBy)}</span>` : ""}`;
    p.hidden = false;
  } else p.hidden = true;
  $("ctaDock").href = app.joinUrl();
  $("loaderName").textContent = c.creator.name;
  $("loaderFor").textContent = greet ? `Prepared for ${greet}` : "Activated merch · preview";
  app.estimator?.sync();
}

function showFallback(c) {
  document.body.classList.remove("is-loading");
  $("app").hidden = true;
  const fb = $("fallback");
  fb.hidden = false;
  fb.style.setProperty("--neon", c.theme.neon);
  $("fbName").textContent = c.creator.name;
  $("fbHandle").textContent = c.creator.handle;
  const greet = app.greeting();
  $("fbFor").textContent = [greet && `Prepared for ${greet}`, c.pitch.presentedBy]
    .filter(Boolean)
    .join(" · ");
  $("fbCta").href = app.joinUrl();
  $("fbGrid").innerHTML = app
    .enabledProducts()
    .map(
      (
        p,
      ) => `<li><img src="/medialife/activated-retail/assets/${PRODUCT_META[p.type].fallback}" alt="" loading="lazy" width="450" height="450" />
        <div><h3>${esc(p.name)}</h3><p>${money(p.price)} · ${esc(p.blurb)}</p><p class="k">Activated · ${esc(p.activation.title)}</p></div></li>`,
    )
    .join("");
  track("enter", { mode: "fallback" });
}

async function boot() {
  if (!PREVIEW) {
    try {
      window.ARTrack?.init({
        demo: window.__SHELF_SLUG
          ? `shelf:${String(window.__SHELF_SLUG).toLowerCase()}`
          : "merch-shelf",
      });
    } catch {
      /* analytics must never block */
    }
  }
  const { config, source, slug } = await resolveConfig();
  app.config = config;
  app.source = source;
  app.slug = slug;
  setHead(config);
  setChrome(config);
  window.ARTrack?.link?.then((l) => {
    if (l?.name && !config.pitch.preparedFor) {
      app.linkName = l.name;
      setChrome(app.config);
    }
  });

  if (PREVIEW) {
    $("previewBadge").hidden = false;
    $("loader").classList.add("done");
  }

  if (!webglOK()) {
    showFallback(config);
    return;
  }
  let modules;
  try {
    modules = await loadModules();
    startStage(modules);
  } catch (e) {
    console.error("[shelf] 3D failed, showing the static shelf", e);
    showFallback(config);
    return;
  }
  track("enter", {
    source,
    slug: slug || "",
    name: config.creator.name,
    products: app.enabledProducts().length,
  });
}

async function loadModules() {
  const [
    scene,
    shelf,
    neon,
    products,
    sheet,
    cart,
    activation,
    tour,
    customise,
    estimator,
    snapshot,
  ] = await Promise.all([
    import("./scene.js"),
    import("./shelf.js"),
    import("./neon.js"),
    import("./products.js"),
    import("./sheet.js"),
    import("./cart.js"),
    import("./activation.js"),
    import("./tour.js"),
    import("./customise.js"),
    import("./estimator.js"),
    import("./snapshot.js"),
  ]);
  return {
    scene,
    shelf,
    neon,
    products,
    sheet,
    cart,
    activation,
    tour,
    customise,
    estimator,
    snapshot,
  };
}

/* ------------------------------------------------------------------------- */
/* stage                                                                      */
/* ------------------------------------------------------------------------- */
let M = null; // modules
let THREE = null;
const quality = () =>
  matchMedia("(pointer: coarse)").matches || innerWidth < 760 ? "low" : "high";

function startStage(modules) {
  M = modules;
  const q = quality();
  app.quality = q;
  app.scene = M.scene.createScene({
    canvas: $("scene"),
    quality: q,
    reduced: reducedMotion(),
    onHover,
    onPick,
    onFocusDrag,
    onUserMove: () => hideHint(),
  });
  THREE = app.scene.THREE;
  app.sheet = M.sheet.createSheet(app);
  app.cart = M.cart.createCart(app);
  app.activation = M.activation.createActivation(app);
  app.tour = M.tour.createTour(app);
  app.customise = M.customise.createCustomise(app);
  app.estimator = M.estimator.createEstimator(app);
  app.estimator.sync();
  $("btnTour").addEventListener("click", () => app.tour.start(0));
  $("ctaDock").addEventListener("click", () => track("apply_open", { from: "dock" }));

  app.scene.addUpdater(tick);
  measureInsets();
  addEventListener("resize", onResize);

  if (PREVIEW) setupPreview();
  render(app.config, { first: true });
}

app.measureInsets = () => measureInsets();
function measureInsets() {
  const bar = $("bar").getBoundingClientRect();
  const dock = $("dock").getBoundingClientRect();
  app.scene.setInsets({ top: bar.height + 8, bottom: Math.max(0, innerHeight - dock.top) + 4 });
}

let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    measureInsets();
    const want = layoutFor(app.enabledProducts().length);
    if (!app.layout || want.cols !== app.layout.cols) render(app.config);
    else {
      app.scene.setContentBounds(app.bounds);
      if (app.focusedId) refocus();
    }
  }, 200);
}

function layoutFor(n) {
  const { width, height } = app.scene.size;
  const top = $("bar").getBoundingClientRect().height;
  const bottom = innerHeight - $("dock").getBoundingClientRect().top;
  return M.shelf.computeLayout(n, width / Math.max(200, height - top - bottom));
}

/* ------------------------------------------------------------------------- */
/* render / re-render (live config changes reuse what they can)              */
/* ------------------------------------------------------------------------- */
let gen = 0;
let keys = {};
let settled = Promise.resolve();
let loaderDone = PREVIEW;

async function render(config, { first = false } = {}) {
  const my = ++gen;
  const prev = app.config;
  app.config = config;
  setHead(config);
  setChrome(config);
  if (app.focusedId && !config.products.some((p) => p.id === app.focusedId && p.enabled))
    closeProduct({ instant: true });

  const enabled = app.enabledProducts();
  const layout = layoutFor(enabled.length);
  const c = config;
  const kitKey = [
    c.creator.name,
    c.creator.handle,
    c.theme.accent,
    c.theme.neon,
    c.creator.logo || "",
    app.localLogo ? app.localLogoId : "",
  ].join("|");
  const shelfKey = [c.theme.shelf, layout.cols, layout.rows, enabled.length].join("|");
  const signKey = [
    c.creator.name,
    c.creator.handle,
    c.theme.neon,
    c.theme.accent,
    layout.cols,
  ].join("|");
  const prodKey =
    JSON.stringify(
      enabled.map((p) => [p.id, p.type, p.name, p.price, p.print, p.backPrint, p.activation]),
    ) +
    kitKey +
    shelfKey;

  let resolveSettled;
  settled = new Promise((r) => (resolveSettled = r));

  // --- art kit
  if (keys.kit !== kitKey || !app.kit) {
    if (first) loaderText("Printing your art");
    const kit = await makeArtKit(c, { localLogo: app.localLogo });
    if (my !== gen) return;
    app.kit = kit;
    keys.kit = kitKey;
  }

  // --- shelf
  let rebuiltShelf = false;
  if (keys.shelf !== shelfKey || !app.shelf) {
    app.shelf?.dispose();
    app.shelf = M.shelf.buildShelf({
      count: enabled.length,
      cols: layout.cols,
      rows: layout.rows,
      finish: c.theme.shelf,
      accent: c.theme.accent,
      quality: app.quality,
    });
    app.scene.root.add(app.shelf.group);
    app.layout = layout;
    keys.shelf = shelfKey;
    keys.accent = c.theme.accent;
    rebuiltShelf = true;
  } else if (keys.accent !== c.theme.accent) {
    app.shelf.setAccent(c.theme.accent);
    keys.accent = c.theme.accent;
  }

  // --- neon sign
  if (keys.sign !== signKey || !app.neon || rebuiltShelf) {
    const wasLit = app.neon?.lit;
    app.neon?.dispose();
    app.neon = M.neon.buildSign({
      name: c.creator.name,
      handle: c.creator.handle,
      neon: c.theme.neon,
      accent: c.theme.accent,
      maxWidth: Math.max(1.3, app.shelf.size.w * 0.98),
      reduced: reducedMotion(),
    });
    const s = app.shelf.size;
    app.neon.group.position.set(0, s.h / 2 + 0.12 - app.neon.bounds.bottom, -s.d / 2 + 0.01);
    app.scene.root.add(app.neon.group);
    if (wasLit || (PREVIEW && !first)) app.neon.setLit(true);
    else if (PREVIEW) app.neon.setLit(true);
    keys.sign = signKey;
  }

  // --- bounds + backdrop
  const s = app.shelf.size;
  const signTop = app.neon.group.position.y + app.neon.bounds.top;
  const halfW = Math.max(s.w, app.neon.bounds.width) / 2;
  app.bounds = new THREE.Box3(
    new THREE.Vector3(-halfW, -s.h / 2 - 0.03, -s.d / 2),
    new THREE.Vector3(halfW, signTop + 0.02, s.d / 2),
  );
  app.scene.setContentBounds(app.bounds);
  if (keys.backdrop !== c.theme.backdrop + shelfKey + c.theme.accent + c.theme.neon) {
    app.scene.setBackdrop(c.theme.backdrop, { accent: c.theme.accent, neon: c.theme.neon });
    keys.backdrop = c.theme.backdrop + shelfKey + c.theme.accent + c.theme.neon;
  }

  // --- products
  if (keys.products !== prodKey) {
    keys.products = prodKey;
    for (const h of app.products.values()) h.dispose();
    app.products.clear();
    renderProductList();
    const progress = first && !PREVIEW;
    const pending = M.products.preloadModels(
      enabled.map((p) => p.type),
      (k, done, total) => progress && loaderProgress(k, done, total),
    );
    if (first && !PREVIEW) {
      // reveal once the shelf has something on it, at the latest after 2.6 s
      Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 2600))]).then(() =>
        revealSoon(),
      );
    }
    await Promise.all(
      enabled.map(async (p, i) => {
        const slot = app.shelf.slots[i];
        let h;
        try {
          h = await M.products.buildProduct({
            product: p,
            slot,
            kit: app.kit,
            accent: c.theme.accent,
            neon: c.theme.neon,
            activateUrl: app.activateUrl(p.id),
            quality: app.quality,
          });
        } catch (e) {
          console.warn("[shelf] could not build", p.id, e);
          return;
        }
        if (my !== gen) return h.dispose();
        app.scene.root.add(h.mount, h.item);
        h.slot = slot;
        h.rest = { pos: h.item.position.clone(), rot: h.item.rotation.clone() };
        app.products.set(p.id, h);
        h.item.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(h.item);
        h.centerOffset = box.getCenter(new THREE.Vector3()).sub(h.item.position);
        h.boxSize = box.getSize(new THREE.Vector3());
        if (loaderDone && !reducedMotion()) {
          h.item.scale.setScalar(0.001);
          app.scene.tween(0.6, (k) => h.item.scale.setScalar(Math.max(0.001, k)));
        }
        app.scene.setPickables([...app.products.values()].map((x) => x.hit));
        app.scene.updateShadows();
        app.scene.requestRender();
      }),
    );
    // empty cubbies get a framed print of the creator's mark
    decorateEmpty(my);
  } else {
    // colour-only changes
    for (const p of enabled) {
      const h = app.products.get(p.id);
      if (
        h &&
        h.color !== p.color &&
        (!prev || prev.products.find((x) => x.id === p.id)?.color !== p.color)
      )
        await h.setColor(p.color);
    }
  }
  if (my !== gen) return;
  app.scene.updateShadows();
  app.scene.requestRender();
  app.customise?.refresh();
  resolveSettled();
  if (first) afterFirstRender();
}

let decor = [];
function decorateEmpty(my) {
  decor.forEach((d) => d.dispose());
  decor = [];
  if (my !== gen) return;
  const n = app.enabledProducts().length;
  for (const slot of app.shelf.slots.slice(n)) {
    const g = new THREE.Group();
    const art = app.kit.back({ backPrint: null }, 0.75);
    const tex = new THREE.CanvasTexture(art);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x0e0f13,
      roughness: 0.4,
      metalness: 0.3,
    });
    const w = slot.width * 0.5;
    const hgt = w / 0.75;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, hgt + 0.03, 0.02), frameMat);
    const pic = new THREE.Mesh(
      new THREE.PlaneGeometry(w, hgt),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }),
    );
    pic.position.z = 0.011;
    g.add(frame, pic);
    g.position.set(slot.center.x, slot.floorY + hgt / 2 + 0.03, slot.backZ + 0.07);
    g.rotation.x = -0.12;
    frame.castShadow = true;
    app.scene.root.add(g);
    decor.push({
      dispose: () => {
        g.removeFromParent();
        tex.dispose();
        frameMat.dispose();
        frame.geometry.dispose();
        pic.geometry.dispose();
        pic.material.dispose();
      },
    });
  }
}

/** Wait until the current render has finished building. */
app.whenSettled = (ms = 9000) => Promise.race([settled, new Promise((r) => setTimeout(r, ms))]);

app.applyConfig = async (next) => {
  await render(sanitize(next, await loadDefaults()));
};

app.setLocalLogo = async (canvas, name = "") => {
  app.localLogo = canvas;
  app.localLogoName = name;
  app.localLogoId = canvas ? String(Date.now()) : "";
  await render(app.config);
};

/* ------------------------------------------------------------------------- */
/* loader                                                                     */
/* ------------------------------------------------------------------------- */
function loaderProgress(k, done, total) {
  const pct = Math.round(10 + k * 85);
  $("loaderBar").style.width = `${pct}%`;
  $("loaderPct").textContent = `${pct}%`;
  $("loader").setAttribute("aria-valuenow", String(pct));
  $("loaderText").textContent =
    done < total ? `Stocking the shelf · ${done}/${total}` : "Switching on the neon";
}
function loaderText(t) {
  $("loaderText").textContent = t;
}
let revealed = false;
function revealSoon() {
  if (revealed) return;
  revealed = true;
  $("loaderBar").style.width = "100%";
  $("loaderPct").textContent = "100%";
  setTimeout(() => {
    loaderDone = true;
    $("loader").classList.add("done");
    document.body.classList.remove("is-loading");
    onRevealed();
  }, 250);
}

function afterFirstRender() {
  if (PREVIEW) {
    document.body.classList.remove("is-loading");
    app.neon.setLit(true);
    return;
  }
  if (!revealed) revealSoon();
}

function onRevealed() {
  const id = hashActivate();
  if (id && app.config.products.some((p) => p.id === id && p.enabled)) {
    // opened from the "Try it on your phone" QR: straight into the experience
    app.neon.setLit(true);
    const native = matchMedia("(pointer: coarse)").matches && innerWidth < 900;
    app.whenSettled().then(() => app.products.has(id) && app.activation.open(id, { native }));
    return;
  }
  setTimeout(() => app.neon.ignite(), 200);
  if (app.tour.shouldAutoStart()) setTimeout(() => app.tour.start(0), reducedMotion() ? 300 : 1500);
}
addEventListener("hashchange", () => {
  const id = hashActivate();
  if (id && app.products.has(id))
    app.activation.open(id, {
      native: matchMedia("(pointer: coarse)").matches && innerWidth < 900,
    });
});

/* ------------------------------------------------------------------------- */
/* product list (keyboard / screen reader mirror of the shelf)               */
/* ------------------------------------------------------------------------- */
function renderProductList() {
  const ul = $("productList");
  ul.innerHTML = app
    .enabledProducts()
    .map(
      (p, i) =>
        `<li><button type="button" data-id="${esc(p.id)}" data-i="${i}" aria-label="${esc(p.name)}, ${money(p.price)}. Activated: ${esc(p.activation.title)}"><span class="label" aria-hidden="true">${esc(p.name)} · ${money(p.price)}</span></button></li>`,
    )
    .join("");
}
document.querySelector(".skip-link")?.addEventListener("click", (e) => {
  e.preventDefault();
  $("productList").querySelector("button")?.focus();
});
$("productList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (b) openProduct(b.dataset.id);
});
$("productList").addEventListener("keydown", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  const list = [...$("productList").querySelectorAll("button")];
  const i = list.indexOf(b);
  const cols = app.layout?.cols || 1;
  const map = {
    ArrowRight: 1,
    ArrowLeft: -1,
    ArrowDown: cols,
    ArrowUp: -cols,
    Home: -i,
    End: list.length - 1 - i,
  };
  if (map[e.key] === undefined) return;
  e.preventDefault();
  const n = list[Math.max(0, Math.min(list.length - 1, i + map[e.key]))];
  n?.focus();
});
$("productList").addEventListener("focusin", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  placeListButton(b);
  setHover(b.dataset.id);
});
$("productList").addEventListener("focusout", () => setHover(null));

function screenRect(h) {
  const box = new THREE.Box3().setFromObject(h.item);
  const cam = app.scene.camera;
  const { width, height } = app.scene.size;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    const v = new THREE.Vector3(
      k & 1 ? box.max.x : box.min.x,
      k & 2 ? box.max.y : box.min.y,
      k & 4 ? box.max.z : box.min.z,
    ).project(cam);
    const x = ((v.x + 1) / 2) * width;
    const y = ((1 - v.y) / 2) * height;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0, top: y0 };
}

function placeListButton(b) {
  const h = app.products.get(b.dataset.id);
  if (!h) return;
  const r = screenRect(h);
  Object.assign(b.style, { left: `${r.x}px`, top: `${r.y}px` });
  b.style.setProperty("--w", `${Math.max(60, r.w + 16)}px`);
  b.style.setProperty("--h", `${Math.max(60, r.h + 16)}px`);
}

/* ------------------------------------------------------------------------- */
/* hover + tooltip                                                            */
/* ------------------------------------------------------------------------- */
let hoverId = null;
function setHover(id) {
  if (hoverId === id) return;
  const prev = hoverId && app.products.get(hoverId);
  if (prev) {
    prev.highlight(0);
    app.shelf.glow(prev.slot.index, 0);
  }
  hoverId = id;
  const h = id && app.products.get(id);
  if (h) {
    h.highlight(1);
    app.shelf.glow(h.slot.index, 1);
  }
  app.scene.requestRender();
}

function onHover(id, x, y) {
  if (app.focusedId || app.tour.active) return (setHover(null), tip(null));
  setHover(id);
  tip(id, x, y);
}
function tip(id, x, y) {
  const t = $("tooltip");
  if (!id) return t.classList.remove("on");
  const h = app.products.get(id);
  if (!h) return;
  t.innerHTML = `<b>${esc(h.product.name)}</b><span>${money(h.product.price)}</span>`;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
  t.classList.add("on");
}

function hideHint() {
  $("hint").style.opacity = "0";
}

function onPick(id) {
  hideHint();
  if (app.tour.active) return;
  if (app.focusedId) {
    if (id && id !== app.focusedId) openProduct(id);
    else if (!id) closeProduct();
    return;
  }
  if (id) openProduct(id);
}

/* ------------------------------------------------------------------------- */
/* focus: lift a product out and inspect it                                  */
/* ------------------------------------------------------------------------- */
const turn = { drag: 0, vel: 0, base: 0, faceTimer: 0, autoFaced: false, t: 0, released: 0 };

function presentationPoint(h) {
  const slot = h.slot;
  return new THREE.Vector3(slot.center.x * 0.85, slot.center.y, slot.frontZ + 0.42);
}

async function liftOut(h, dur = 0.9) {
  const P = presentationPoint(h);
  const to = P.clone().sub(h.centerOffset);
  const p0 = h.item.position.clone();
  const r0 = h.item.rotation.clone();
  await app.scene.tween(dur, (k) => {
    h.item.position.lerpVectors(p0, to, k);
    h.item.position.y += Math.sin(k * Math.PI) * 0.04;
    h.item.rotation.set(r0.x * (1 - k), r0.y * (1 - k), r0.z * (1 - k));
  });
}

async function putBack(h, dur = 0.8) {
  const p0 = h.item.position.clone();
  const r0 = h.item.rotation.clone();
  // turn the shortest way home
  let s0 = h.spin.rotation.y % (Math.PI * 2);
  if (s0 > Math.PI) s0 -= Math.PI * 2;
  if (s0 < -Math.PI) s0 += Math.PI * 2;
  h.spin.rotation.y = s0;
  await app.scene.tween(dur, (k) => {
    h.item.position.lerpVectors(p0, h.rest.pos, k);
    h.item.rotation.set(
      r0.x + (h.rest.rot.x - r0.x) * k,
      r0.y + (h.rest.rot.y - r0.y) * k,
      r0.z + (h.rest.rot.z - r0.z) * k,
    );
    h.spin.rotation.y = s0 * (1 - k);
  });
  h.setFace("front");
  app.scene.updateShadows();
}

function cameraForFocus(h) {
  const P = presentationPoint(h);
  const fp = app.sheet.footprint();
  const size = h.boxSize.clone();
  size.x = Math.max(size.x, size.z); // it turns
  return app.scene.focusPose(P, size, { sheetSide: fp.side, sheetBottom: fp.bottom });
}

async function openProduct(id) {
  const h = app.products.get(id);
  if (!h) return;
  if (app.tour.active) app.tour.end();
  if (app.focusedId === id) return;
  setHover(null);
  tip(null);
  hideHint();
  const prevId = app.focusedId;
  app.focusedId = id;
  document.body.classList.add("is-focus");
  track("product_open", { id, type: h.product.type });
  app.sheet.open(id);
  app.scene.setMode("focus");
  Object.assign(turn, {
    drag: 0,
    vel: 0,
    base: 0,
    faceTimer: 0,
    autoFaced: false,
    t: 0,
    released: 0,
  });
  h.setFace("front");
  app.sheet.setFaceUI("front");
  const jobs = [];
  if (prevId) {
    const ph = app.products.get(prevId);
    if (ph) jobs.push(putBack(ph, 0.6));
  } else jobs.push(app.scene.setDim(true));
  jobs.push(liftOut(h));
  jobs.push(app.scene.flyTo(cameraForFocus(h), 1.0));
  await Promise.all(jobs);
}

function refocus() {
  const h = app.products.get(app.focusedId);
  if (h) app.scene.flyTo(cameraForFocus(h), 0.4);
}

async function closeProduct({ fromSheet = false, instant = false } = {}) {
  const id = app.focusedId;
  if (!id) return;
  app.focusedId = null;
  if (!fromSheet) app.sheet.close();
  document.body.classList.remove("is-focus");
  const h = app.products.get(id);
  const jobs = [app.scene.setDim(false), app.scene.goHero(instant ? 0.01 : 1.0)];
  if (h) jobs.push(putBack(h, instant ? 0.01 : 0.8));
  await Promise.all(jobs);
  if (app.focusedId) return;
  app.scene.setMode("hero");
  const btn = $("productList").querySelector(`button[data-id="${CSS.escape(id)}"]`);
  if (btn && !topLayer() && document.activeElement === document.body) {
    placeListButton(btn);
    btn.focus({ preventScroll: true });
  }
}
app.openProduct = openProduct;
app.closeProduct = closeProduct;

app.setColor = async (id, hex, { persist = false } = {}) => {
  const h = app.products.get(id);
  if (!h) return;
  await h.setColor(hex);
  if (persist) {
    const p = app.config.products.find((x) => x.id === id);
    if (p) p.color = hex;
  }
  app.scene.requestRender();
};

app.setFace = (id, face) => {
  const h = app.products.get(id);
  if (!h) return;
  h.setFace(face);
  turn.autoFaced = true;
  turn.drag = 0;
};

function onFocusDrag(d, end) {
  const h = app.products.get(app.focusedId);
  if (!h) return;
  turn.autoFaced = true;
  if (end) {
    turn.released = turn.t;
    if (h.turnMode === "faces") {
      const a = (h.face === "back" ? Math.PI : 0) + turn.drag;
      const back = Math.cos(a) < 0;
      h.setFace(back ? "back" : "front");
      app.sheet.setFaceUI(back ? "back" : "front");
      // keep the visual angle; the offset decays toward the new face
      turn.drag = a - (back ? Math.PI : 0);
      turn.drag = Math.atan2(Math.sin(turn.drag), Math.cos(turn.drag));
    }
    return;
  }
  turn.drag += d * Math.PI;
  turn.vel = d * Math.PI * 30;
}

app.thumbnail = (id, size = 192, bg = "#e9e7e1") => {
  const h = app.products.get(id);
  if (!h) return null;
  const q = h.item.quaternion.clone();
  const sr = h.spin.rotation.y;
  const s = h.item.scale.clone();
  h.item.quaternion.identity();
  if (h.product.type === "deskmat") h.item.rotation.x = 0;
  h.spin.rotation.y = h.turnMode === "faces" ? -0.3 : h.product.type === "cap" ? 0.5 : 0;
  h.item.scale.setScalar(1);
  let url = null;
  try {
    url = app.scene.thumbnail(h.item, size, bg);
  } catch (e) {
    console.warn("[shelf] thumbnail failed", e);
  }
  h.item.quaternion.copy(q);
  h.spin.rotation.y = sr;
  h.item.scale.copy(s);
  return url;
};

/* ------------------------------------------------------------------------- */
/* per-frame                                                                  */
/* ------------------------------------------------------------------------- */
let glintClock = 0;
function tick(dt, clock, raw = dt) {
  let active = false;
  if (app.neon && app.neon.update(Math.min(0.25, raw))) active = true;
  const reduced = reducedMotion();
  for (const h of app.products.values()) {
    if (h.id === app.focusedId) continue;
    if (!reduced && h.idle(dt)) active = true;
  }
  // the activation tags take turns catching the light
  if (!reduced && app.products.size) {
    glintClock += dt;
    const list = [...app.products.values()];
    const period = 2.4;
    const idx = Math.floor(glintClock / period) % list.length;
    const ph = (glintClock % period) / period;
    list.forEach((h, i) => h.glint(i === idx ? Math.sin(Math.min(1, ph * 2.2) * Math.PI) : 0));
  }
  const h = app.focusedId && app.products.get(app.focusedId);
  if (h) {
    turn.t += Math.min(0.25, raw);
    active = true;
    if (h.turnMode === "faces") {
      if (!turn.autoFaced && turn.t > 1.9) {
        turn.autoFaced = true;
        h.setFace("back");
        app.sheet.setFaceUI("back");
      }
      if (turn.t - turn.released > 1.2) turn.drag *= Math.exp(-dt * 2.2);
      const sway = reduced ? 0 : Math.sin(turn.t * 0.6) * 0.32;
      const target = (h.face === "back" ? Math.PI : 0) - 0.25 + sway + turn.drag;
      h.spin.rotation.y += (target - h.spin.rotation.y) * (1 - Math.exp(-dt * 3.2));
    } else if (h.turnMode === "sway") {
      if (turn.t - turn.released > 1.2) turn.drag *= Math.exp(-dt * 2);
      const target = (reduced ? 0 : Math.sin(turn.t * 0.55) * 0.45) + turn.drag;
      h.spin.rotation.y += (target - h.spin.rotation.y) * (1 - Math.exp(-dt * 3));
    } else {
      turn.vel *= Math.exp(-dt * 3);
      h.spin.rotation.y += dt * (reduced ? 0 : 0.5) + turn.vel * dt;
      h.spin.rotation.y += turn.drag;
      turn.drag = 0;
    }
    h.idle(dt);
  }
  return active;
}

/* ------------------------------------------------------------------------- */
/* tour helpers                                                               */
/* ------------------------------------------------------------------------- */
app.toHero = async () => {
  if (app.focusedId) return closeProduct();
  for (const h of app.products.values()) h.glint(0);
  app.peeking = null;
  await app.scene.goHero(1.0);
};

app.peekProduct = async (id, { glint = false } = {}) => {
  const h = app.products.get(id);
  if (!h) return;
  app.peeking = id;
  const center = h.item.position.clone().add(h.centerOffset);
  const size = h.slot
    ? new THREE.Vector3(h.slot.width * 1.1, h.slot.height * 1.05, 0.3)
    : h.boxSize;
  const fp = isPhone() ? { bottom: 260 } : { bottom: 200 };
  const pose = app.scene.focusPose(center, size, { sheetBottom: fp.bottom });
  app.scene.setMode("flight");
  await app.scene.flyTo(pose, 1.2);
  app.scene.setMode("tour");
  if (glint) {
    let t = 0;
    const off = app.scene.addUpdater((dt) => {
      t += dt;
      if (app.peeking !== id) {
        h.glint(0);
        off();
        return false;
      }
      h.glint(0.5 + 0.5 * Math.sin(t * 5));
      return true;
    });
  }
};

/* ------------------------------------------------------------------------- */
/* admin preview protocol                                                     */
/* ------------------------------------------------------------------------- */
let readyTimer = 0;
function setupPreview() {
  addEventListener("message", async (e) => {
    if (e.origin !== location.origin) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.type === "shelf:config" && d.config) {
      clearInterval(readyTimer);
      await app.applyConfig(d.config);
    } else if (d.type === "shelf:snapshot") {
      await app.whenSettled();
      app.neon?.setLit(true);
      app.neon?.update(0);
      const w = Math.max(64, Math.min(4096, Number(d.width) || 1200));
      const hgt = Math.max(64, Math.min(4096, Number(d.height) || 630));
      const dataUrl = M.snapshot.heroDataUrl(app, w, hgt);
      e.source?.postMessage({ type: "shelf:snapshot-result", dataUrl }, location.origin);
    }
  });
  // The builder may attach its listener after our first "ready", so keep
  // announcing until the first config arrives.
  if (window.parent && window.parent !== window) {
    const ready = () => window.parent.postMessage({ type: "shelf:ready" }, location.origin);
    ready();
    readyTimer = setInterval(ready, 500);
  }
}

/* Escape from focus mode when nothing else is open */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && app.focusedId && !topLayer()) closeProduct();
});

ensureFonts();
boot().catch((e) => {
  console.error("[shelf] boot failed", e);
  toast("Something went wrong loading the shelf.");
});
