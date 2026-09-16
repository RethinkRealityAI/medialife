/**
 * MEDIALIFE x Roblox creator program - page behaviour.
 *
 * Progressive enhancement throughout: every fact on the page is already in the
 * HTML. This layer adds the Drop Studio, the projection model, the Drop Pass
 * and the multi-step application. If any of it fails, the page still reads.
 */

import { PRODUCTS, COLORWAYS, ACTIVATIONS, PROGRAM, MODEL, project, money, count } from './program.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// tiny interface synth - no audio assets, off until the visitor asks for it
// ---------------------------------------------------------------------------
const Sound = (() => {
  let ctx = null;
  let enabled = false;

  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  function blip({ f = 620, to = f, dur = 0.07, type = 'sine', vol = 0.05 }) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, c.currentTime);
    if (to !== f) osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), c.currentTime + dur);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  }

  function noise({ dur = 0.14, vol = 0.05, hp = 900 }) {
    if (!enabled) return;
    const c = ensure();
    if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
  }

  return {
    get enabled() { return enabled; },
    set enabled(v) { enabled = v; if (v) ensure(); },
    tap: () => blip({ f: 540, to: 720, dur: 0.05, vol: 0.035 }),
    toggle: () => blip({ f: 380, to: 620, dur: 0.07, type: 'triangle', vol: 0.04 }),
    drop: () => blip({ f: 880, to: 320, dur: 0.16, type: 'triangle', vol: 0.045 }),
    shutter: () => noise({ dur: 0.1, vol: 0.06, hp: 1600 }),
    whoosh: () => noise({ dur: 0.5, vol: 0.035, hp: 320 }),
    chime: () => { blip({ f: 660, dur: 0.16, vol: 0.035 }); setTimeout(() => blip({ f: 990, dur: 0.22, vol: 0.03 }), 90); },
  };
})();

// ---------------------------------------------------------------------------
// toast
// ---------------------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  $('#toastText').textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// ---------------------------------------------------------------------------
// scroll reveal, nav, loop stepper, stat count-up
// ---------------------------------------------------------------------------
function initScroll() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
  );
  $$('.rv, .phase').forEach((el) => io.observe(el));

  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 12);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // section highlighting
  const links = $$('.nav-links a');
  const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  if (targets.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${en.target.id}`));
        }
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    targets.forEach((t) => spy.observe(t));
  }
}

function initLoop() {
  const steps = $$('#loopTrack .loop-step');
  if (!steps.length) return;
  let i = 0;
  const set = (n) => steps.forEach((s, k) => s.classList.toggle('is-on', k === n));
  set(0);
  if (REDUCED) { steps.forEach((s) => s.classList.add('is-on')); return; }

  let timer = null;
  const track = $('#loopTrack');
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !timer) {
      timer = setInterval(() => { i = (i + 1) % steps.length; set(i); }, 2600);
    } else if (!en.isIntersecting && timer) {
      clearInterval(timer); timer = null;
    }
  }, { threshold: 0.25 });
  io.observe(track);

  steps.forEach((s, k) =>
    s.addEventListener('pointerenter', () => { i = k; set(k); })
  );
}

function initCounters() {
  if (REDUCED) return;
  const els = $$('.stat b[data-count]');
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        const raw = en.target.dataset.count;
        const m = raw.match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
        if (!m) continue;
        const [, sign, numStr, suffix] = m;
        const target = parseFloat(numStr);
        const decimals = (numStr.split('.')[1] || '').length;
        const t0 = performance.now();
        const dur = 1100;
        const tick = (now) => {
          const p = Math.min((now - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          en.target.textContent = sign + (target * eased).toFixed(decimals) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    },
    { threshold: 0.4 }
  );
  els.forEach((el) => io.observe(el));
}

/** Lightweight 2D particle field over the hero art - no second WebGL context. */
function initHeroCanvas() {
  const c = $('#heroCanvas');
  if (!c || REDUCED) return;
  const ctx = c.getContext('2d');
  const stage = c.parentElement;
  let w = 0, h = 0, raf = 0, running = false;
  const N = 64;
  const parts = Array.from({ length: N }, () => ({
    x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.5,
    v: 0.00018 + Math.random() * 0.00055, a: Math.random() * 0.5 + 0.12,
    hue: Math.random() < 0.5 ? '25,175,254' : '255,55,174',
  }));

  const size = () => {
    const r = Math.min(devicePixelRatio || 1, 2);
    w = stage.clientWidth; h = stage.clientHeight;
    c.width = w * r; c.height = h * r;
    c.style.width = `${w}px`; c.style.height = `${h}px`;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.y -= p.v * 16;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
      const x = p.x * w + Math.sin(p.y * 9 + p.s) * 10;
      const y = p.y * h;
      ctx.beginPath();
      ctx.arc(x, y, p.s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.hue},${p.a * (1 - Math.abs(p.y - 0.5) * 0.9)})`;
      ctx.fill();
    }
  };

  const ro = new ResizeObserver(size);
  ro.observe(stage);
  size();

  new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !running) { running = true; raf = requestAnimationFrame(frame); }
    else if (!en.isIntersecting && running) { running = false; cancelAnimationFrame(raf); }
  }).observe(stage);
}

// ---------------------------------------------------------------------------
// shared drop configuration
// ---------------------------------------------------------------------------
const cfg = {
  skus: ['tee', 'hoodie'],
  view: 'tee',
  color: COLORWAYS[0].id,
  activation: 'both',
  prices: Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price])),
  mark: 'bolt',
  markName: '',
  scale: 1,
  markY: 0,
  ink: 'auto',
  showTag: true,
  visits: MODEL.defaults.monthlyVisits,
  attach: MODEL.defaults.attachRate,
};

const CFG_KEY = 'ml-roblox-drop-v1';
const APP_KEY = 'ml-roblox-application-v1';

/** URL-safe base64 of the shareable subset of the config. */
function encodeCfg() {
  const slim = {
    s: cfg.skus, w: cfg.view, c: cfg.color, a: cfg.activation,
    p: cfg.prices, m: cfg.mark, k: cfg.scale, y: cfg.markY, i: cfg.ink,
    v: cfg.visits, t: cfg.attach,
  };
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(slim))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch { return ''; }
}

function decodeCfg(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (Array.isArray(o.s) && o.s.length) cfg.skus = o.s.filter((id) => byId[id]);
    if (o.c && COLORWAYS.some((c) => c.id === o.c)) cfg.color = o.c;
    if (o.a && ACTIVATIONS.some((a) => a.id === o.a)) cfg.activation = o.a;
    if (o.p && typeof o.p === 'object') {
      for (const [id, v] of Object.entries(o.p)) {
        const p = byId[id];
        if (p && Number.isFinite(+v)) cfg.prices[id] = Math.min(Math.max(+v, p.min), p.max);
      }
    }
    if (typeof o.m === 'string') cfg.mark = o.m;
    if (Number.isFinite(+o.k)) cfg.scale = Math.min(Math.max(+o.k, 0.4), 1.7);
    if (Number.isFinite(+o.y)) cfg.markY = Math.min(Math.max(+o.y, -1), 1);
    if (typeof o.i === 'string') cfg.ink = o.i;
    if (Number.isFinite(+o.v)) cfg.visits = Math.min(Math.max(+o.v, MODEL.visitsRange.min), MODEL.visitsRange.max);
    if (Number.isFinite(+o.t)) cfg.attach = Math.min(Math.max(+o.t, MODEL.attachRange.min), MODEL.attachRange.max);
    // the product on screen is part of the shared build, even when it is not
    // in the assortment -- the recipient should see what the sender was viewing
    if (typeof o.w === 'string' && byId[o.w]) cfg.view = o.w;
    else if (!cfg.skus.includes(cfg.view)) cfg.view = cfg.skus[0] || 'tee';
    return true;
  } catch { return false; }
}

function saveCfg() {
  try { localStorage.setItem(CFG_KEY, encodeCfg()); } catch { /* private mode */ }
}

function restoreCfg() {
  const hash = location.hash.match(/(?:^|[#&])d=([A-Za-z0-9\-_]+)/);
  if (hash && decodeCfg(hash[1])) return 'link';
  try {
    const saved = localStorage.getItem(CFG_KEY);
    if (saved && decodeCfg(saved)) return 'saved';
  } catch { /* ignore */ }
  return 'default';
}

/** Selected SKUs with their live prices, ready for the projection model. */
const assortment = () =>
  cfg.skus.map((id) => ({ ...byId[id], price: cfg.prices[id] })).filter((p) => p.id);

// visits slider uses a log scale so the whole range is usable
const visitsFromSlider = (v) => {
  const { min, max } = MODEL.visitsRange;
  const value = min * Math.pow(max / min, v / 1000);
  const step = value > 5_000_000 ? 500_000 : value > 500_000 ? 50_000 : value > 50_000 ? 5_000 : 1_000;
  return Math.round(value / step) * step;
};
const sliderFromVisits = (n) => {
  const { min, max } = MODEL.visitsRange;
  return Math.round((Math.log(n / min) / Math.log(max / min)) * 1000);
};

// ---------------------------------------------------------------------------
// preset marks -> images the studio can print
// ---------------------------------------------------------------------------
const INK_HEX = { light: '#f4f5f8', dark: '#101014', ember: '#ff37ae' };

function inkColor() {
  if (cfg.ink !== 'auto') return INK_HEX[cfg.ink] || '#f4f5f8';
  const c = COLORWAYS.find((x) => x.id === cfg.color) || COLORWAYS[0];
  return c.ink;
}

/** Serialize a preset button's inline SVG into a recoloured <img>. */
function markImage(id, color) {
  return new Promise((resolve) => {
    const btn = $(`.mark[data-mark="${id}"]`);
    if (!btn) return resolve(null);
    const svg = btn.querySelector('svg');
    if (!svg) return resolve(null);
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', '512');
    clone.setAttribute('height', '512');
    const src = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, color);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
  });
}

// ---------------------------------------------------------------------------
// studio
// ---------------------------------------------------------------------------
let studio = null;
let uploadedMark = null; // an <img> the visitor supplied, wins over presets

async function applyMark() {
  if (!studio) return;
  if (uploadedMark) { studio.setDecal(uploadedMark); return; }
  const img = await markImage(cfg.mark, inkColor());
  studio.setDecal(img);
}

function syncProductUI() {
  $$('.prod').forEach((el) => {
    const id = el.dataset.product;
    const on = cfg.skus.includes(id);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('.check', el)?.setAttribute('aria-checked', on ? 'true' : 'false');
    el.classList.toggle('is-viewing', cfg.view === id);
    const price = $(`[data-price-for="${id}"]`, el);
    if (price) price.textContent = `$${cfg.prices[id]}`;
  });
  $('#skuCount').textContent = String(cfg.skus.length);
  $('#vpProduct').textContent = byId[cfg.view]?.name || '';

  const p = byId[cfg.view];
  const range = $('#priceRange');
  if (p && range) {
    range.min = p.min; range.max = p.max; range.value = cfg.prices[p.id];
    $('#priceLabel').textContent = `$${cfg.prices[p.id]}`;
  }
}

function syncNumbers() {
  const a = assortment();
  const r = project(a, cfg.visits, cfg.attach);

  $('#visitsLabel').textContent = count(cfg.visits);
  $('#attachLabel').textContent = `${(cfg.attach * 100).toFixed(2)}%`;
  $('#outUnits').textContent = r.units ? count(r.units) : '—';
  $('#outAov').textContent = r.aov ? money(r.aov) : '—';
  $('#outGmv').textContent = r.gmv ? money(r.gmv, { compact: r.gmv >= 100000 }) : '—';
  $('#outRoyalty').textContent = r.royalty ? money(r.royalty, { compact: r.royalty >= 100000 }) : '—';
  $('#capNote').hidden = !r.capped;

  $('#sumSkus').textContent = `${a.length} SKU${a.length === 1 ? '' : 's'}`;
  $('#sumRoyalty').textContent = r.royalty ? money(r.royalty, { compact: true }) : '—';

  renderDropSummary(r);
  return r;
}

function renderDropSummary(r) {
  const host = $('#dropSummary');
  if (!host) return;
  const a = assortment();
  const colour = COLORWAYS.find((c) => c.id === cfg.color)?.name || '—';
  const act = ACTIVATIONS.find((x) => x.id === cfg.activation)?.name || '—';

  host.innerHTML =
    (a.length
      ? a.map((p) => `<div class="review-row"><span class="k">${p.name}</span><span class="v">$${p.price} · ${p.tag}</span></div>`).join('')
      : '<div class="review-row"><span class="k">Assortment</span><span class="v"><em>Nothing selected yet</em></span></div>') +
    `<div class="review-row"><span class="k">Colourway</span><span class="v">${colour}</span></div>` +
    `<div class="review-row"><span class="k">Activation</span><span class="v">${act}</span></div>` +
    (r && r.royalty
      ? `<div class="review-row"><span class="k">Modelled royalty</span><span class="v">${money(r.royalty)} over ${PROGRAM.pilot.reviewDays} days <em>· illustrative</em></span></div>`
      : '');
}

function pushStudio() {
  if (!studio) return;
  studio.setProduct(cfg.view);
  const c = COLORWAYS.find((x) => x.id === cfg.color) || COLORWAYS[0];
  studio.setColor(c.hex, inkColor());
  studio.setActivation(cfg.activation);
  studio.setShowTag(cfg.showTag);
  studio.setDecalScale(cfg.scale);
  studio.setDecalY(cfg.markY);
  applyMark();
}

const pressGroup = (els, isOn) =>
  els.forEach((el) => el.setAttribute('aria-pressed', isOn(el) ? 'true' : 'false'));

function initStudioUI() {
  // --- tabs
  const tabs = $$('.panel-tabs [role="tab"]');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
      });
      Sound.tap();
    });
    tab.addEventListener('keydown', (ev) => {
      const i = tabs.indexOf(tab);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        const next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.focus(); next.click();
      }
    });
  });

  // --- products: the row selects what you are looking at, the tick toggles inclusion
  $$('.prod').forEach((el) => {
    const id = el.dataset.product;
    const check = $('.check', el);

    const toggleSku = () => {
      const i = cfg.skus.indexOf(id);
      if (i === -1) cfg.skus.push(id);
      else if (cfg.skus.length > 1) cfg.skus.splice(i, 1);
      else return toast('Keep at least one product in the drop.');
      Sound.toggle();
      syncProductUI(); syncNumbers(); saveCfg();
    };

    check.addEventListener('click', (ev) => { ev.stopPropagation(); toggleSku(); });
    check.addEventListener('keydown', (ev) => {
      if (ev.key !== ' ' && ev.key !== 'Enter') return;
      ev.preventDefault(); ev.stopPropagation();
      toggleSku();
    });

    // the row only changes what is on screen -- it never edits the assortment
    el.addEventListener('click', () => {
      if (cfg.view === id) return;
      cfg.view = id;
      Sound.tap();
      syncProductUI(); saveCfg(); pushStudio();
    });
  });

  // --- price
  const price = $('#priceRange');
  price.addEventListener('input', () => {
    cfg.prices[cfg.view] = +price.value;
    $('#priceLabel').textContent = `$${price.value}`;
    $(`[data-price-for="${cfg.view}"]`).textContent = `$${price.value}`;
    syncNumbers();
  });
  price.addEventListener('change', () => { saveCfg(); Sound.tap(); });

  // --- colourways
  const sws = $$('.sw');
  sws.forEach((sw) => sw.addEventListener('click', () => {
    cfg.color = sw.dataset.color;
    pressGroup(sws, (el) => el.dataset.color === cfg.color);
    Sound.toggle();
    const c = COLORWAYS.find((x) => x.id === cfg.color);
    studio?.setColor(c.hex, inkColor());
    applyMark();
    renderDropSummary();
    saveCfg();
  }));

  // --- activation
  const acts = $$('#actSeg button');
  acts.forEach((b) => b.addEventListener('click', () => {
    cfg.activation = b.dataset.activation;
    pressGroup(acts, (el) => el.dataset.activation === cfg.activation);
    $('#actBlurb').textContent = ACTIVATIONS.find((a) => a.id === cfg.activation)?.blurb || '';
    Sound.toggle();
    studio?.setActivation(cfg.activation);
    renderDropSummary();
    saveCfg();
  }));

  // --- tag visibility
  const tags = $$('#tagSeg button');
  tags.forEach((b) => b.addEventListener('click', () => {
    cfg.showTag = b.dataset.tag === 'on';
    pressGroup(tags, (el) => (el.dataset.tag === 'on') === cfg.showTag);
    $('#tagState').textContent = cfg.showTag ? 'On' : 'Off';
    $('#vpTagPill').hidden = !cfg.showTag;
    Sound.toggle();
    studio?.setShowTag(cfg.showTag);
    saveCfg();
  }));

  // --- preset marks
  const marks = $$('.mark');
  marks.forEach((m) => m.addEventListener('click', () => {
    cfg.mark = m.dataset.mark;
    uploadedMark = null;
    $('#decalPreview').hidden = true;
    pressGroup(marks, (el) => el.dataset.mark === cfg.mark);
    Sound.tap();
    applyMark();
    saveCfg();
  }));

  // --- ink
  const inks = $$('#inkSeg button');
  inks.forEach((b) => b.addEventListener('click', () => {
    cfg.ink = b.dataset.ink;
    pressGroup(inks, (el) => el.dataset.ink === cfg.ink);
    Sound.toggle();
    applyMark();
    saveCfg();
  }));

  // --- scale + position
  const scale = $('#scaleRange');
  scale.addEventListener('input', () => {
    cfg.scale = +scale.value / 100;
    $('#scaleLabel').textContent = `${scale.value}%`;
    studio?.setDecalScale(cfg.scale);
  });
  scale.addEventListener('change', saveCfg);

  const pos = $('#posRange');
  const posLabel = (v) => (v > 25 ? 'High' : v < -25 ? 'Low' : 'Centre');
  pos.addEventListener('input', () => {
    cfg.markY = +pos.value / 100;
    $('#posLabel').textContent = posLabel(+pos.value);
    studio?.setDecalY(cfg.markY);
  });
  pos.addEventListener('change', saveCfg);

  // --- upload
  const file = $('#fileInput');
  const zone = $('#dropzone');
  $('#btnUpload').addEventListener('click', () => file.click());
  file.addEventListener('change', () => file.files[0] && readMark(file.files[0]));

  ['dragenter', 'dragover'].forEach((t) =>
    zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) =>
    zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.remove('is-over'); }));
  zone.addEventListener('drop', (ev) => {
    const f = ev.dataTransfer?.files?.[0];
    if (f) readMark(f);
  });

  $('#btnClearDecal').addEventListener('click', () => {
    uploadedMark = null;
    $('#decalPreview').hidden = true;
    cfg.markName = '';
    applyMark();
    toast('Mark removed.');
  });

  // --- numbers
  const visits = $('#visitsRange');
  visits.value = sliderFromVisits(cfg.visits);
  visits.addEventListener('input', () => { cfg.visits = visitsFromSlider(+visits.value); syncNumbers(); });
  visits.addEventListener('change', saveCfg);

  const attach = $('#attachRange');
  attach.value = Math.round(cfg.attach * 10000);
  attach.addEventListener('input', () => { cfg.attach = +attach.value / 10000; syncNumbers(); });
  attach.addEventListener('change', saveCfg);

  // --- toolbar
  $('#btnSound').addEventListener('click', (ev) => {
    Sound.enabled = !Sound.enabled;
    ev.currentTarget.setAttribute('aria-pressed', Sound.enabled ? 'true' : 'false');
    ev.currentTarget.innerHTML = Sound.enabled
      ? '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.5 3 4.5 5.5H2.5v5h2L7.5 13z" fill="currentColor"/><path d="M10 6a2.6 2.6 0 0 1 0 4M12 4a5.3 5.3 0 0 1 0 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7.5 3 4.5 5.5H2.5v5h2L7.5 13z" fill="currentColor"/><path d="m10.5 6.5 3 3m0-3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    if (Sound.enabled) Sound.chime();
    toast(Sound.enabled ? 'Interface sound on.' : 'Interface sound off.');
  });

  $('#btnReset').addEventListener('click', () => {
    cfg.skus = ['tee', 'hoodie'];
    cfg.view = 'tee';
    cfg.color = COLORWAYS[0].id;
    cfg.activation = 'both';
    cfg.prices = Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price]));
    cfg.mark = 'bolt'; cfg.scale = 1; cfg.markY = 0; cfg.ink = 'auto'; cfg.showTag = true;
    cfg.visits = MODEL.defaults.monthlyVisits; cfg.attach = MODEL.defaults.attachRate;
    uploadedMark = null;
    $('#decalPreview').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
    hydrateControls();
    pushStudio();
    studio?.resetView();
    saveCfg();
    Sound.drop();
    toast('Studio reset.');
  });

  $('#btnFull').addEventListener('click', (ev) => {
    const vp = $('#viewport');
    const on = vp.classList.toggle('is-tall');
    vp.style.aspectRatio = on ? '16 / 10' : '';
    vp.style.minHeight = on ? 'min(78vh, 720px)' : '';
    ev.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
    requestAnimationFrame(() => studio?.resize());
    Sound.tap();
  });

  $('#btnActivate').addEventListener('click', () => {
    if (!studio) return toast('The 3D studio is not available in this browser.');
    if (studio.isActivating) { studio.stopActivation(); return; }
    Sound.whoosh();
    studio.startActivation();
  });

  $('#btnPass').addEventListener('click', openPass);
}

function readMark(f) {
  if (!/^image\//.test(f.type)) return toast('Please choose a PNG, SVG or JPG.');
  if (f.size > 4 * 1024 * 1024) return toast('That file is over 4MB — try a smaller one.');
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      uploadedMark = img;
      cfg.markName = f.name;
      $('#decalImg').src = img.src;
      $('#decalName').textContent = f.name;
      $('#decalPreview').hidden = false;
      studio?.setDecal(img);
      Sound.drop();
      toast('Mark added. Drag it on the product to reposition.');
    };
    img.onerror = () => toast('That image could not be read.');
    // an SVG with no intrinsic size will not draw without explicit dimensions
    img.width = 512; img.height = 512;
    img.src = reader.result;
  };
  reader.onerror = () => toast('That file could not be read.');
  reader.readAsDataURL(f);
}

/** Push cfg into every control (used on load, restore and reset). */
function hydrateControls() {
  pressGroup($$('.sw'), (el) => el.dataset.color === cfg.color);
  pressGroup($$('#actSeg button'), (el) => el.dataset.activation === cfg.activation);
  pressGroup($$('#tagSeg button'), (el) => (el.dataset.tag === 'on') === cfg.showTag);
  pressGroup($$('.mark'), (el) => el.dataset.mark === cfg.mark);
  pressGroup($$('#inkSeg button'), (el) => el.dataset.ink === cfg.ink);

  $('#actBlurb').textContent = ACTIVATIONS.find((a) => a.id === cfg.activation)?.blurb || '';
  $('#tagState').textContent = cfg.showTag ? 'On' : 'Off';
  $('#vpTagPill').hidden = !cfg.showTag;
  $('#scaleRange').value = Math.round(cfg.scale * 100);
  $('#scaleLabel').textContent = `${Math.round(cfg.scale * 100)}%`;
  $('#posRange').value = Math.round(cfg.markY * 100);
  $('#posLabel').textContent = cfg.markY > 0.25 ? 'High' : cfg.markY < -0.25 ? 'Low' : 'Centre';
  $('#visitsRange').value = sliderFromVisits(cfg.visits);
  $('#attachRange').value = Math.round(cfg.attach * 10000);

  syncProductUI();
  syncNumbers();
}

// ---------------------------------------------------------------------------
// activation caption overlay
// ---------------------------------------------------------------------------
function onActivationStep(step, p) {
  const overlay = $('#actOverlay');
  if (step < 0) {
    overlay.classList.remove('is-on');
    $('#btnActivate').innerHTML = $('#btnActivate').innerHTML.replace('Stop', 'Run the activation');
    return;
  }
  overlay.classList.add('is-on');
  const labels = [
    'A chip and a code, in the product',
    'The fan taps it with their phone',
    'The experience opens — no app, no account',
    'They land back in your game, with a reward',
    'Every tap comes back to you as data',
  ];
  $('#actIdx').textContent = String(step + 1).padStart(2, '0');
  $('#actText').textContent = labels[step] || '';
  $('#actProg').style.width = `${(p * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Drop Pass
// ---------------------------------------------------------------------------
let QR = null;

async function loadQR() {
  if (QR) return QR;
  try { QR = await import('qrcode'); } catch { QR = null; }
  return QR;
}

function shareUrl() {
  const base = location.origin + location.pathname;
  return `${base}#d=${encodeCfg()}`;
}

/** Composite the 3D render and the drop facts into one downloadable sheet. */
function buildSheet(shotUrl, r) {
  return new Promise((resolve) => {
    const W = 1200, H = 1560;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#020204';
    ctx.fillRect(0, 0, W, H);

    // grid, faded out behind the copy so the numbers stay legible
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
    const fade = ctx.createLinearGradient(0, 940, 0, 1120);
    fade.addColorStop(0, 'rgba(2,2,4,0)');
    fade.addColorStop(1, 'rgba(2,2,4,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 940, W, 180);
    ctx.fillStyle = '#020204';
    ctx.fillRect(0, 1120, W, H - 1120);
    ctx.restore();

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#19affe');
    grad.addColorStop(1, '#ff37ae');

    const mono = (size, weight = 500) => `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
    const sans = (size, weight = 600) => `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;

    // header
    ctx.fillStyle = grad;
    ctx.fillRect(56, 56, 40, 3);
    ctx.fillStyle = '#f4f5f8';
    ctx.font = mono(19, 600);
    ctx.letterSpacing = '4px';
    ctx.fillText('MEDIALIFE × ROBLOX', 56, 104);
    ctx.font = sans(46);
    ctx.letterSpacing = '-1px';
    ctx.fillText('Drop Pass', 56, 164);
    ctx.fillStyle = '#8c8e9c';
    ctx.font = mono(15);
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString('en-CA'), W - 56, 104);
    ctx.textAlign = 'left';

    const finish = () => {
      // facts
      let y = 1020;
      ctx.fillStyle = '#191a22';
      ctx.fillRect(56, y - 44, W - 112, 1);

      const a = assortment();
      ctx.font = mono(14, 500);
      ctx.letterSpacing = '3px';
      ctx.fillStyle = '#5d5f6d';
      ctx.fillText('YOUR ASSORTMENT', 56, y);
      y += 38;

      ctx.letterSpacing = '0px';
      for (const p of a) {
        ctx.fillStyle = '#f4f5f8';
        ctx.font = sans(25, 500);
        ctx.fillText(p.name, 56, y);
        ctx.fillStyle = '#8c8e9c';
        ctx.font = mono(19);
        ctx.textAlign = 'right';
        ctx.fillText(`$${p.price}`, 700, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#5d5f6d';
        ctx.font = mono(13);
        ctx.letterSpacing = '2px';
        ctx.fillText(p.tag.replace('®', '').toUpperCase(), 730, y - 2);
        ctx.letterSpacing = '0px';
        y += 44;
      }

      const colour = COLORWAYS.find((x) => x.id === cfg.color);
      const act = ACTIVATIONS.find((x) => x.id === cfg.activation);
      y += 16;
      ctx.fillStyle = '#191a22';
      ctx.fillRect(56, y - 26, W - 112, 1);

      const kv = [
        ['COLOURWAY', colour?.name || '—'],
        ['ACTIVATION', act?.name || '—'],
        ['PILOT', `${PROGRAM.pilot.reviewDays} days`],
        ['COST TO CREATOR', '$0'],
      ];
      let kx = 56;
      for (const [k, v] of kv) {
        ctx.fillStyle = '#5d5f6d';
        ctx.font = mono(12, 500);
        ctx.letterSpacing = '2px';
        ctx.fillText(k, kx, y + 18);
        ctx.fillStyle = '#f4f5f8';
        ctx.font = sans(24, 600);
        ctx.letterSpacing = '0px';
        ctx.fillText(v, kx, y + 52);
        kx += 272;
      }

      // royalty callout
      y += 104;
      const boxH = 132;
      ctx.fillStyle = 'rgba(255,55,174,0.10)';
      ctx.fillRect(56, y, W - 112, boxH);
      ctx.strokeStyle = 'rgba(255,55,174,0.35)';
      ctx.strokeRect(56.5, y + 0.5, W - 113, boxH - 1);
      ctx.fillStyle = '#8c8e9c';
      ctx.font = mono(13, 500);
      ctx.letterSpacing = '3px';
      ctx.fillText('MODELLED CREATOR ROYALTY · 90 DAYS', 88, y + 40);
      ctx.fillStyle = '#f4f5f8';
      ctx.font = sans(56, 600);
      ctx.letterSpacing = '-2px';
      ctx.fillText(r && r.royalty ? money(r.royalty) : '—', 88, y + 100);
      ctx.letterSpacing = '0px';
      ctx.fillStyle = '#8c8e9c';
      ctx.font = mono(14);
      ctx.textAlign = 'right';
      ctx.fillText(`${count(r?.units || 0)} units · ${count(cfg.visits)} monthly visits`, W - 88, y + 100);
      ctx.textAlign = 'left';

      // footer
      ctx.fillStyle = '#5d5f6d';
      ctx.font = mono(12);
      ctx.letterSpacing = '1px';
      ctx.fillText('Illustrative model, not a forecast. Royalty rate is indicative and set in your program agreement.', 56, H - 82);
      ctx.fillText('MEDIALIFE.AI  ·  ACTIVATED MERCHANDISE®  ·  CONFIDENTIAL', 56, H - 52);

      resolve(c.toDataURL('image/png'));
    };

    if (!shotUrl) { finish(); return; }
    const img = new Image();
    img.onload = () => {
      // fit the render into the upper plate
      const plateY = 200, plateH = 760;
      ctx.save();
      ctx.beginPath();
      ctx.rect(56, plateY, W - 112, plateH);
      ctx.clip();
      const scale = Math.max((W - 112) / img.width, plateH / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, 56 + (W - 112 - dw) / 2, plateY + (plateH - dh) / 2, dw, dh);
      ctx.restore();
      ctx.strokeStyle = '#191a22';
      ctx.strokeRect(56.5, plateY + 0.5, W - 113, plateH - 1);
      finish();
    };
    img.onerror = finish;
    img.src = shotUrl;
  });
}

let lastSheet = null;

async function openPass() {
  const modal = $('#passModal');
  const r = syncNumbers();
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('is-open'));
  document.body.classList.add('is-locked');
  Sound.shutter();

  const url = shareUrl();
  $('#passUrl').value = url;
  history.replaceState(null, '', `#d=${encodeCfg()}`);

  const shot = studio ? studio.capture(1200, 900) : null;
  lastSheet = await buildSheet(shot, r);
  $('#passShot').src = lastSheet;

  const qr = await loadQR();
  if (qr) {
    try {
      await qr.toCanvas($('#passQr'), url, {
        width: 192, margin: 1, errorCorrectionLevel: 'M',
        color: { dark: '#020204', light: '#ffffff' },
      });
    } catch { /* the link and sheet still work without it */ }
  }

  $('#passClose').focus();
}

function closePass() {
  const modal = $('#passModal');
  modal.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  setTimeout(() => { modal.hidden = true; }, 360);
  $('#btnPass')?.focus();
}

function initPass() {
  $('#passClose').addEventListener('click', closePass);
  $('#passModal').addEventListener('click', (ev) => {
    if (ev.target === $('#passModal')) closePass();
  });
  addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && $('#passModal').classList.contains('is-open')) closePass();
  });

  $('#passCopy').addEventListener('click', async () => {
    const url = $('#passUrl').value;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied.');
    } catch {
      $('#passUrl').select();
      toast('Press ⌘/Ctrl + C to copy.');
    }
    Sound.tap();
  });

  $('#passDownload').addEventListener('click', () => {
    if (!lastSheet) return;
    const a = document.createElement('a');
    a.href = lastSheet;
    a.download = `medialife-drop-pass-${Date.now()}.png`;
    a.click();
    Sound.shutter();
    toast('Drop sheet downloaded.');
  });

  $('#passApply').addEventListener('click', () => {
    closePass();
    syncNumbers();
  });
}

// ---------------------------------------------------------------------------
// application flow
// ---------------------------------------------------------------------------
function initApply() {
  const form = $('#applyForm');
  if (!form) return;
  const steps = $$('.fstep', form);
  const dots = $$('#steps .step-dot');
  const back = $('#btnBack');
  const next = $('#btnNext');
  const submit = $('#btnSubmit');
  const saveMsg = $('#autosave');
  let at = 0;

  const show = (n) => {
    at = Math.max(0, Math.min(n, steps.length - 1));
    steps.forEach((s, i) => s.classList.toggle('is-on', i === at));
    dots.forEach((d, i) => {
      d.classList.toggle('is-on', i === at);
      d.classList.toggle('is-done', i < at);
    });
    back.hidden = at === 0;
    next.hidden = at === steps.length - 1;
    submit.hidden = at !== steps.length - 1;
    if (at === 2) renderDropSummary(syncNumbers());
    if (at === steps.length - 1) renderReview();
    const first = steps[at].querySelector('input, select, textarea, .chip');
    if (first && at > 0) first.focus({ preventScroll: true });
  };

  const required = (step) => $$('[required]', steps[step]);

  function validate(step) {
    let ok = true;
    for (const el of required(step)) {
      const fld = el.closest('.fld') || el.closest('.check-line');
      const good = el.type === 'checkbox' ? el.checked : el.checkValidity() && el.value.trim() !== '';
      if (fld) fld.classList.toggle('is-bad', !good);
      if (!good && ok) { el.focus({ preventScroll: true }); ok = false; }
    }
    return ok;
  }

  next.addEventListener('click', () => {
    if (!validate(at)) { toast('A couple of fields still need you.'); return; }
    Sound.tap();
    show(at + 1);
    $('#apply').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  });

  back.addEventListener('click', () => { Sound.tap(); show(at - 1); });

  // live validation clears the error as soon as it is fixed
  form.addEventListener('input', (ev) => {
    const fld = ev.target.closest('.fld') || ev.target.closest('.check-line');
    if (fld?.classList.contains('is-bad')) {
      const good = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.checkValidity();
      if (good) fld.classList.remove('is-bad');
    }
    scheduleSave();
  });
  form.addEventListener('change', scheduleSave);

  // chip groups write into a hidden input
  $$('.chip', form).forEach((chip) => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.chip;
      const group = $$(`.chip[data-chip="${name}"]`, form);
      group.forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      const hidden = form.elements[name];
      if (hidden) hidden.value = chip.dataset.value;
      Sound.toggle();
      scheduleSave();
    });
  });

  // --- autosave
  let saveTimer;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const data = {};
        new FormData(form).forEach((v, k) => { if (k !== 'form-name' && k !== 'company-website') data[k] = v; });
        localStorage.setItem(APP_KEY, JSON.stringify(data));
        saveMsg.textContent = 'Saved on this device';
      } catch { saveMsg.textContent = ''; }
    }, 500);
  }

  (function restore() {
    let data;
    try { data = JSON.parse(localStorage.getItem(APP_KEY) || 'null'); } catch { data = null; }
    if (!data) return;
    for (const [k, v] of Object.entries(data)) {
      const el = form.elements[k];
      if (!el || !v) continue;
      if (el.type === 'checkbox') el.checked = v === 'on' || v === true;
      else el.value = v;
      const chip = $(`.chip[data-chip="${k}"][data-value="${CSS.escape(String(v))}"]`, form);
      if (chip) chip.setAttribute('aria-pressed', 'true');
    }
    saveMsg.textContent = 'Restored your draft';
  })();

  function renderReview() {
    const host = $('#reviewOut');
    const fd = new FormData(form);
    const a = assortment();
    const r = project(a, cfg.visits, cfg.attach);
    const rows = [
      ['Experience', fd.get('experience-name')],
      ['Link', fd.get('experience-url')],
      ['Genre', fd.get('genre')],
      ['Monthly visits', fd.get('monthly-visits') ? count(+fd.get('monthly-visits')) : ''],
      ['Drop', a.map((p) => `${p.name} $${p.price}`).join(' · ')],
      ['Colourway', COLORWAYS.find((c) => c.id === cfg.color)?.name],
      ['Activation', ACTIVATIONS.find((x) => x.id === cfg.activation)?.name],
      ['Launch window', fd.get('launch-window')],
      ['Modelled royalty', r.royalty ? `${money(r.royalty)} over ${PROGRAM.pilot.reviewDays} days (illustrative)` : ''],
    ];
    host.innerHTML = rows
      .map(([k, v]) => `<div class="review-row"><span class="k">${k}</span><span class="v">${v ? String(v).replace(/[<>&]/g, '') : '<em>Not given</em>'}</span></div>`)
      .join('');
  }

  // --- submit
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!validate(steps.length - 1)) { toast('A couple of fields still need you.'); return; }

    const a = assortment();
    const r = project(a, cfg.visits, cfg.attach);
    $('#dropConfigField').value = JSON.stringify({
      skus: a.map((p) => ({ id: p.id, name: p.name, price: p.price })),
      colourway: cfg.color,
      activation: cfg.activation,
      mark: cfg.markName || cfg.mark,
      modelled: { visits: cfg.visits, attachRate: cfg.attach, units: r.units, gmv: Math.round(r.gmv), royalty: Math.round(r.royalty) },
      shareUrl: shareUrl(),
    });

    submit.setAttribute('aria-disabled', 'true');
    submit.textContent = 'Sending…';

    const body = new URLSearchParams();
    new FormData(form).forEach((v, k) => body.append(k, v));

    let delivered = false;
    try {
      // Netlify parses /__forms.html at deploy time; that is also the POST target
      const res = await fetch('/__forms.html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      delivered = res.ok;
    } catch { delivered = false; }

    form.hidden = true;
    const sent = $('#sent');
    sent.classList.add('is-on');
    Sound.chime();

    if (!delivered) {
      const payload = Object.fromEntries(body.entries());
      delete payload['form-name'];
      delete payload['company-website'];
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const subject = encodeURIComponent(`Roblox creator application — ${payload['experience-name'] || 'new property'}`);
      const fallback = document.createElement('div');
      fallback.className = 'note';
      fallback.style.cssText = 'max-width:440px;margin:24px auto 0;text-align:left';
      fallback.innerHTML =
        '<b>We could not reach the form service from here.</b> Nothing is lost — download your ' +
        'application and email it to us and we will pick it up from there.' +
        `<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">` +
        `<a class="btn btn--sm" download="roblox-creator-application.json" href="${href}">Download application</a>` +
        `<a class="btn btn--sm btn--primary" href="mailto:hello@medialife.ai?subject=${subject}">Email it to us</a></div>`;
      sent.querySelector('.next').after(fallback);
      sent.querySelector('h3').textContent = 'Almost there.';
      sent.querySelector('.sub').textContent =
        'Your application is ready, but it could not be delivered automatically from this page.';
    } else {
      try { localStorage.removeItem(APP_KEY); } catch { /* ignore */ }
      const payload = Object.fromEntries(body.entries());
      delete payload['form-name'];
      delete payload['company-website'];
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const keep = document.createElement('div');
      keep.style.cssText = 'margin-top:18px';
      keep.innerHTML =
        `<a class="btn btn--sm btn--ghost" download="roblox-creator-application.json" href="${href}">Keep a copy</a>`;
      sent.querySelector('.next').after(keep);
    }

    sent.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
  });

  $('#btnAnother').addEventListener('click', () => {
    form.reset();
    form.hidden = false;
    $('#sent').classList.remove('is-on');
    $$('.chip', form).forEach((c) => c.setAttribute('aria-pressed', 'false'));
    show(0);
    $('#apply').scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  });

  show(0);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
function boot() {
  initScroll();
  initLoop();
  initCounters();
  initHeroCanvas();
  initStudioUI();
  initPass();
  initApply();

  const source = restoreCfg();
  hydrateControls();
  if (source === 'link') toast('Drop loaded from your link.');

  const msg = $('#viewportMsg');
  const failStudio = () => {
    $('#vpSpin').style.display = 'none';
    $('#vpMsgText').style.display = 'none';
    $('#studioFallback').style.display = 'block';
    $('#vpHint').style.display = 'none';
    $$('#btnActivate, #btnFull').forEach((b) => b.setAttribute('aria-disabled', 'true'));
  };

  import('./studio.js')
    .then(({ createStudio }) => {
      // onReady fires synchronously from inside createStudio, before it has
      // returned, so it must not touch `studio`. The saved or shared config is
      // pushed below, once the instance actually exists.
      const instance = createStudio({
        canvas: $('#studioCanvas'),
        viewport: $('#viewport'),
        onReady: () => msg.classList.add('is-gone'),
        onFail: failStudio,
        onActivationStep,
        onDecalDrag: (v) => {
          cfg.markY = v;
          $('#posRange').value = Math.round(v * 100);
          $('#posLabel').textContent = v > 0.25 ? 'High' : v < -0.25 ? 'Low' : 'Centre';
        },
      });
      if (!instance) { failStudio(); return; }

      studio = instance;
      // handy when debugging the scene from the console on a live page
      window.__mlStudio = studio;
      pushStudio();
      if (REDUCED) studio.setAutoRotate(false);
      setTimeout(() => $('#vpHint')?.classList.add('is-hidden'), 6000);
    })
    .catch(failStudio);

  // hide the orbit hint once they have actually orbited
  $('#viewport')?.addEventListener('pointerdown', () => $('#vpHint')?.classList.add('is-hidden'), { once: true });
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
