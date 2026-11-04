/**
 * Where is Bobo? · the page around the globe: loads the feed, builds the
 * place card, the sightings list, the live-scan ticker and the trip replay,
 * keeps the URL in sync (?at=<place>) and polls for new sightings.
 *
 * Data: GET /api/bobo/feed.json (src/lib/bobo/model.ts → BoboFeed).
 */
import { sfx } from "./sfx.js?v=4";

const FEED = "/api/bobo/feed.json";
const POLL_MS = 45_000;
const GAME = "https://evade.medialife.ai";

const $ = (id) => document.getElementById(id);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 719px)").matches || /Mobi|Android/i.test(navigator.userAgent);
const isWindows = /Windows/i.test(navigator.userAgent);

const track = (n, p) => {
  try {
    window.ARTrack?.event(n, p);
  } catch {
    /* analytics never breaks the page */
  }
};

/* ── formatting ───────────────────────────────────────────────────────────── */
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return "just now";
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return rtf.format(Math.round(s / 86400), "day");
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
const fmtN = (n) => Math.round(n).toLocaleString("en");
const flag = (cc) =>
  /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "";
const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
const EVENT_TEXT = {
  scan: "Keychain scanned",
  play: "Cola Run played",
  reward: "Reward unlocked",
  sighting: "Bobo spotted",
  share: "Bobo shared",
  capture: "New AR capture",
  custom: "New activity",
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/* ── state ────────────────────────────────────────────────────────────────── */
let feed = null;
let globe = null;
let current = null; // { key, i }
let tour = null;
const seenEvents = new Set();
const seenMedia = new Set();

const mediaPlaces = () => (feed ? feed.places.filter((p) => p.media.length) : []);
const placeBy = (key) => feed?.places.find((p) => p.key === key) ?? null;

/* ── boot ─────────────────────────────────────────────────────────────────── */
async function loadFeed() {
  try {
    const r = await fetch(FEED, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    console.warn("feed unavailable", e);
    return null;
  }
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

async function boot() {
  window.ARTrack?.init?.({ demo: "where-is-bobo" });
  const feedP = loadFeed();
  if (webglOk()) {
    try {
      const { createGlobe } = await import("./globe.js?v=4");
      globe = await createGlobe($("globe"), {
        labels: $("labels"),
        reduced,
        mobile,
        onSelect: (key) => select(key, { from: "globe" }),
        onBobo: () => {
          sfx.chirp();
          boboSays();
        },
        onHover: (key) => {
          if (key && key !== lastHover) sfx.hover();
          lastHover = key;
        },
        onLandmark: () => sfx.pop(),
        onSummoned: summoned,
    onSummonEnd: () => document.body.classList.remove("is-summon"),
        onUserMove: () => closeCard({ keepGlobe: true }),
        onArrive: () => {
          sfx.arrive();
          const p = current && placeBy(current.key);
          if (p) globe.showMedia(p.media[current.i]);
        },
      });
    } catch (e) {
      console.error(e);
      globe = null;
    }
  }
  if (!globe) {
    $("fallback").hidden = false;
    $("globe").hidden = true;
  }
  const f = await feedP;
  applyFeed(f ?? emptyFeed(), true);
  updateInsets();
  document.documentElement.classList.add("is-ready");

  // ?at=<key> opens a place; otherwise fly to the latest sighting after a beat
  const at = new URLSearchParams(location.search).get("at");
  const first = mediaPlaces()[0];
  if (at && placeBy(at)?.media.length) setTimeout(() => select(at, { from: "link" }), reduced ? 0 : 1600);
  else if (first && globe && !reduced)
    setTimeout(() => {
      if (!current && !userTouched) select(first.key, { from: "auto" });
    }, 3600);
  if (!globe) openList();

  setInterval(poll, POLL_MS);
  startTicker();
}

let userTouched = false;
let lastHover = null;
addEventListener("pointerdown", () => (userTouched = true), { once: true, capture: true });

function emptyFeed() {
  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    stats: { places: 0, countries: 0, media: 0, events: 0, km: 0 },
    places: [],
    journey: [],
    countries: [],
    recent: [],
    sample: false,
  };
}

function applyFeed(f, first = false) {
  const before = feed;
  feed = f;
  globe?.setFeed(f);
  renderStats(f.stats, first);
  renderList();
  $("samplePill").hidden = !f.sample;
  const hasMedia = mediaPlaces().length > 0;
  $("tourBtn").hidden = f.journey.length < 2 || !globe;
  $("sub").textContent = hasMedia
    ? "Follow EVADE's cat around the world. Every pin is a real sighting."
    : "Bobo's packing his bags. The first sightings land here soon.";
  // new sightings since the last poll
  if (!first && before) {
    const fresh = mediaPlaces().flatMap((p) => p.media.filter((m) => !seenMedia.has(m.id)).map((m) => [p, m]));
    if (fresh.length) {
      const [p] = fresh[0];
      toast(`New sighting in ${p.city || p.country}`, "See it", () => select(p.key, { from: "toast" }));
    }
    for (const e of f.recent) {
      const id = `${e.at}|${e.key}|${e.type}`;
      if (!seenEvents.has(id) && e.key) {
        globe?.ping(e.key);
        queueTick(e, true);
      }
    }
  }
  for (const p of mediaPlaces()) for (const m of p.media) seenMedia.add(m.id);
  for (const e of f.recent) seenEvents.add(`${e.at}|${e.key}|${e.type}`);
  if (current && !placeBy(current.key)?.media.length) closeCard();
}

async function poll() {
  if (document.hidden) return;
  const f = await loadFeed();
  if (f && f.generatedAt !== feed?.generatedAt) applyFeed(f);
}

/* ── stats ────────────────────────────────────────────────────────────────── */
function renderStats(s, animate) {
  for (const dd of document.querySelectorAll("[data-stat]")) {
    const to = s[dd.dataset.stat] ?? 0;
    const from = Number(dd.dataset.v || 0);
    dd.dataset.v = String(to);
    if (!animate || reduced || from === to) {
      dd.textContent = fmtN(to);
      continue;
    }
    const t0 = performance.now();
    const D = 1800;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D);
      const e = 1 - Math.pow(1 - k, 3);
      dd.textContent = fmtN(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* ── list ─────────────────────────────────────────────────────────────────── */
function thumbImg(m, alt = "") {
  const img = el("img");
  img.alt = alt;
  img.loading = "lazy";
  img.decoding = "async";
  img.src = m.poster || (m.kind === "image" ? m.url : "/evade/creators/assets/img/bobo-cat.webp");
  return img;
}

function renderList() {
  const list = $("placeList");
  list.textContent = "";
  const places = mediaPlaces();
  $("emptyList").hidden = places.length > 0;
  places.forEach((p, idx) => {
    const li = el("li");
    const b = el("button", "place-btn");
    b.type = "button";
    b.dataset.key = p.key;
    const th = el("span", "place-thumb");
    th.append(thumbImg(p.media[0]));
    const txt = el("span", "place-txt");
    const name = el("b", null, p.city || p.country);
    if (idx === 0) name.append(el("span", "place-now", "Now"));
    const sub = el("span", null, `${p.city ? `${p.country} · ` : ""}${ago(p.media[0].seenAt)}`);
    txt.append(name, sub);
    const n = el("span", "place-count", `${p.media.length}`);
    n.setAttribute("aria-label", `${p.media.length} ${p.media.length === 1 ? "sighting" : "sightings"}`);
    b.append(th, txt, n);
    b.addEventListener("click", () => {
      select(p.key, { from: "list" });
      if (mobile) closeList();
    });
    li.append(b);
    list.append(li);
  });
  // live scans by city
  const ev = feed.places.filter((p) => p.events > 0).sort((a, b) => b.events - a.events).slice(0, 12);
  $("scanTitle").hidden = !ev.length;
  const sl = $("scanList");
  sl.textContent = "";
  const max = ev[0]?.events || 1;
  for (const p of ev) {
    const li = el("li");
    li.append(el("span", "city", `${flag(p.countryCode)} ${p.city || p.country}`.trim()));
    const bar = el("span", "bar");
    const i = el("i");
    i.style.width = `${Math.max(4, (p.events / max) * 100)}%`;
    bar.append(i);
    li.append(bar, el("span", "n", fmtN(p.events)));
    sl.append(li);
  }
  markListCurrent();
}

function markListCurrent() {
  for (const b of document.querySelectorAll(".place-btn"))
    b.setAttribute("aria-current", String(b.dataset.key === current?.key));
}

function openList() {
  $("sightings").hidden = false;
  $("listBtn").setAttribute("aria-expanded", "true");
  document.body.classList.add("has-drawer");
  if (mobile) closeCard({ keepGlobe: false });
  updateInsets();
}
function closeList() {
  $("sightings").hidden = true;
  $("listBtn").setAttribute("aria-expanded", "false");
  document.body.classList.remove("has-drawer");
  updateInsets();
}
$("listBtn").addEventListener("click", () => ($("sightings").hidden ? openList() : closeList()));
$("listClose").addEventListener("click", () => {
  closeList();
  $("listBtn").focus();
});

/* ── place card ───────────────────────────────────────────────────────────── */
function select(key, { from = "ui", i = 0 } = {}) {
  const p = placeBy(key);
  if (!p?.media.length) return;
  if (from !== "tour") stopTour();
  if (from !== "auto" && from !== "link") sfx.select();
  if (current?.key !== key) sfx.whoosh(from === "tour" ? 1.1 : 0.8);
  globe?.endSummon();
  current = { key, i: Math.min(i, p.media.length - 1) };
  renderCard();
  $("card").hidden = false;
  document.body.classList.add("has-card");
  if (mobile) closeList();
  updateInsets();
  if (globe) {
    globe.focus(key);
    globe.showMedia(p.media[current.i]);
  }
  markListCurrent();
  const url = new URL(location.href);
  url.searchParams.set("at", key);
  history.replaceState(null, "", url);
  if (from === "list" || from === "keyboard") $("cardCity").focus({ preventScroll: true });
  track("hotspot", { place: key, from });
}

function renderCard() {
  const p = placeBy(current.key);
  const m = p.media[current.i];
  const f = isWindows ? "" : flag(p.countryCode);
  const fl = $("cardFlag");
  fl.textContent = f || p.countryCode;
  fl.classList.toggle("is-code", !f);
  $("cardCity").textContent = p.city || p.country;
  $("cardCountry").textContent = [p.city ? p.region : "", p.city ? p.country : ""].filter(Boolean).join(", ") || "Somewhere in " + p.country;
  $("cardWhen").textContent = [m.place, ago(m.seenAt)].filter(Boolean).join(" · ");
  $("cardTitle").textContent = m.title;
  $("cardDesc").textContent = m.description;
  $("cardDesc").hidden = !m.description;
  $("watchBtn").querySelector("span").textContent = m.kind === "video" ? "Watch with sound" : "View photo";
  // strip
  const strip = $("cardStrip");
  strip.textContent = "";
  strip.hidden = p.media.length < 2;
  p.media.forEach((x, idx) => {
    const b = el("button", "thumb");
    b.type = "button";
    b.setAttribute("role", "listitem");
    b.setAttribute("aria-label", `${x.title}${x.kind === "video" ? " (video)" : " (photo)"}`);
    b.setAttribute("aria-current", String(idx === current.i));
    b.append(thumbImg(x));
    if (x.kind === "video" && x.durationS) b.append(el("span", "dur", dur(x.durationS)));
    b.addEventListener("click", () => setMedia(idx));
    strip.append(b);
  });
  // scans here
  const sc = $("cardScans");
  sc.hidden = !p.events;
  if (p.events) {
    sc.innerHTML = "";
    sc.append(el("b", null, fmtN(p.events)), document.createTextNode(` keychain scans and plays here${p.lastSeen ? `, latest ${ago(p.lastSeen)}` : ""}.`));
  }
  // neighbours, in list order
  const list = mediaPlaces();
  const k = list.findIndex((x) => x.key === p.key);
  const prev = list[(k - 1 + list.length) % list.length];
  const next = list[(k + 1) % list.length];
  const one = list.length < 2;
  $("prevPlace").hidden = $("nextPlace").hidden = one;
  $("prevName").textContent = prev ? prev.city || prev.country : "";
  $("nextName").textContent = next ? next.city || next.country : "";
  $("prevPlace").onclick = () => select(prev.key, { from: "nav" });
  $("nextPlace").onclick = () => select(next.key, { from: "nav" });
}

function setMedia(i) {
  const p = placeBy(current.key);
  current.i = i;
  renderCard();
  globe?.showMedia(p.media[i]);
  globe?.glitch();
}

function closeCard({ keepGlobe = false } = {}) {
  if (!current && $("card").hidden) return;
  current = null;
  $("card").hidden = true;
  document.body.classList.remove("has-card");
  if (!keepGlobe) globe?.clearFocus();
  updateInsets();
  markListCurrent();
  const url = new URL(location.href);
  url.searchParams.delete("at");
  history.replaceState(null, "", url);
}
$("cardClose").addEventListener("click", () => {
  stopTour();
  closeCard();
});

$("watchBtn").addEventListener("click", () => {
  const p = placeBy(current.key);
  const m = p.media[current.i];
  openViewer(m, p);
});

$("shareBtn").addEventListener("click", async () => {
  const p = placeBy(current.key);
  const url = new URL(location.href);
  url.searchParams.set("at", p.key);
  const data = {
    title: `Bobo was in ${p.city || p.country}`,
    text: `Bobo was spotted in ${p.city || p.country}. Where is Bobo now?`,
    url: url.toString(),
  };
  track("share", { place: p.key });
  try {
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(data.url);
      toast("Link copied");
    }
  } catch {
    /* the share sheet was dismissed */
  }
});

/* swipe the sheet down to close (phones) */
{
  let y0 = null;
  const card = $("card");
  card.addEventListener("touchstart", (e) => {
    if (e.target.closest(".card-body") && $("card").querySelector(".card-body").scrollTop > 0) return;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  card.addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) card.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  card.addEventListener("touchend", (e) => {
    if (y0 == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
    card.style.transform = "";
    y0 = null;
    if (dy > 90) {
      stopTour();
      closeCard();
    }
  });
}

/* ── viewer (full screen, with sound) ─────────────────────────────────────── */
function openViewer(m, p) {
  const v = $("viewer");
  $("viewerTitle").textContent = `${m.title} · ${p.city || p.country}`;
  const box = $("viewerMedia");
  box.textContent = "";
  if (m.kind === "video") {
    const video = el("video");
    video.src = m.url;
    if (m.poster) video.poster = m.poster;
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    box.append(video);
    globe?.video?.pause();
  } else {
    const img = el("img");
    img.src = m.url;
    img.alt = m.description || m.title;
    box.append(img);
  }
  v.showModal();
  track("media_open", { id: m.id, place: p.key });
}
function closeViewer() {
  const v = $("viewer");
  $("viewerMedia").textContent = "";
  if (v.open) v.close();
  globe?.video?.play().catch(() => {});
}
$("viewerClose").addEventListener("click", closeViewer);
$("viewer").addEventListener("close", () => {
  $("viewerMedia").textContent = "";
  globe?.video?.play().catch(() => {});
});
$("viewer").addEventListener("click", (e) => {
  if (e.target === $("viewer")) closeViewer();
});

/* ── layout → globe insets ───────────────────────────────────────────────── */
function updateInsets() {
  if (!globe) return;
  const card = $("card");
  const drawer = $("sightings");
  const narrow = mobile || innerWidth < 720;
  let x = 0;
  let y = 0;
  if (narrow) {
    // phones: the sheet covers the bottom, the title the top
    if (!card.hidden) y = card.getBoundingClientRect().height / 2 - 30;
    else {
      // push the planet below the title so Bobo (on its top edge) is in clear sky
      const heroBottom = $("hero").getBoundingClientRect().bottom;
      y = -Math.min(210, Math.max(40, heroBottom - innerHeight * 0.13));
    }
  } else {
    if (!card.hidden) x -= (card.getBoundingClientRect().width + 24) / 2;
    if (!drawer.hidden) x += (drawer.getBoundingClientRect().width + 24) / 2;
    else if (card.hidden) x += Math.min(220, innerWidth * 0.12); // clear of the title
  }
  globe.setShift({ x, y });
}
addEventListener("resize", () => requestAnimationFrame(updateInsets));
new ResizeObserver(() => updateInsets()).observe($("card"));
new ResizeObserver(() => updateInsets()).observe($("sightings"));

/* ── trip replay ──────────────────────────────────────────────────────────── */
$("tourBtn").addEventListener("click", startTour);
$("tourStop").addEventListener("click", () => {
  stopTour();
});
function startTour() {
  const keys = feed.journey.filter((k) => placeBy(k)?.media.length);
  if (keys.length < 2) return;
  stopTour();
  tour = { keys, i: 0, timer: 0 };
  $("tourBar").hidden = false;
  closeList();
  track("tour_start", { stops: keys.length });
  tourStep();
}
function tourStep() {
  if (!tour) return;
  const k = tour.keys[tour.i];
  const p = placeBy(k);
  $("tourStep").textContent = `Stop ${tour.i + 1} of ${tour.keys.length} · ${p.city || p.country}`;
  // the trip goes in the order Bobo got there: oldest sighting at each stop
  select(k, { from: "tour", i: p.media.length - 1 });
  clearTimeout(tour.timer);
  tour.timer = setTimeout(() => {
    if (!tour) return;
    tour.i++;
    if (tour.i >= tour.keys.length) {
      stopTour();
      toast("That's the whole trip so far. Where will Bobo go next?");
      return;
    }
    tourStep();
  }, reduced ? 5000 : 7500);
}
function stopTour() {
  if (!tour) return;
  clearTimeout(tour.timer);
  tour = null;
  $("tourBar").hidden = true;
}

/* ── live ticker ──────────────────────────────────────────────────────────── */
const tickQueue = [];
let tickIdx = 0;
function queueTick(e, front = false) {
  front ? tickQueue.unshift(e) : tickQueue.push(e);
}
function showTick(e) {
  const t = $("ticker");
  const txt = $("tickerText");
  txt.textContent = "";
  txt.append(el("b", null, EVENT_TEXT[e.type] || "Activity"));
  txt.append(document.createTextNode(` in ${[e.city, e.country].filter(Boolean).join(", ") || "somewhere"} `));
  txt.append(el("span", "ago", `· ${ago(e.at)}`));
  t.hidden = false;
  t.classList.remove("is-swap");
  void t.offsetWidth;
  t.classList.add("is-swap");
  if (e.key) globe?.ping(e.key);
  if (userTouched) sfx.ping();
}
function startTicker() {
  // replays the latest real events so the globe feels alive; new ones jump the queue
  const step = () => {
    if (!document.hidden && feed?.recent.length) {
      const e = tickQueue.shift() ?? feed.recent[tickIdx++ % Math.min(feed.recent.length, 12)];
      showTick(e);
    }
    setTimeout(step, reduced ? 6000 : 3400);
  };
  setTimeout(step, 2400);
}

/* ── Bobo talks ───────────────────────────────────────────────────────────── */
const LINES = [
  "Meow! Scan a keychain to bring me to your city.",
  "Psst… play Cola Run with me.",
  "Where should I go next?",
  "I've got cola and I'm not afraid to run.",
];
let lineIdx = 0;
let bubbleT = 0;
function boboSays() {
  if (!globe) return;
  const b = $("bubble");
  const n = feed?.stats.places || 0;
  const lines = n > 1 ? [...LINES, `${n} cities so far. Catch me if you can!`] : LINES;
  b.textContent = lines[lineIdx++ % lines.length];
  const pos = globe.boboScreen();
  b.style.left = `${pos.x}px`;
  b.style.top = `${pos.y}px`;
  b.hidden = false;
  clearTimeout(bubbleT);
  bubbleT = setTimeout(() => (b.hidden = true), 3200);
  track("bobo_tap");
}

/* ── toast ────────────────────────────────────────────────────────────────── */
let toastT = 0;
function toast(text, action, fn) {
  const t = $("toast");
  t.textContent = "";
  t.append(el("span", null, text));
  if (action) {
    const b = el("button", null, action);
    b.type = "button";
    b.addEventListener("click", () => {
      t.hidden = true;
      fn();
    });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 5200);
}

/* ── keyboard ─────────────────────────────────────────────────────────────── */
addEventListener("keydown", (e) => {
  if ($("viewer").open) return;
  if (e.key === "Escape") {
    if (!$("card").hidden) {
      stopTour();
      closeCard();
    } else if (!$("sightings").hidden) closeList();
  }
  if (current && (e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.target.closest("input, textarea")) {
    const p = placeBy(current.key);
    if (p.media.length > 1) setMedia((current.i + (e.key === "ArrowRight" ? 1 : -1) + p.media.length) % p.media.length);
  }
});

// a soft tick and a tiny buzz on every button
document.addEventListener(
  "pointerdown",
  (e) => {
    const b = e.target.closest("button, .btn, a.nav-btn");
    if (b && !b.disabled && !b.matches("#soundBtn, #summonBtn")) sfx.tap();
  },
  { capture: true },
);

/* ── sound toggle ─────────────────────────────────────────────────────────── */
function paintSound() {
  const b = $("soundBtn");
  b.setAttribute("aria-pressed", String(!sfx.muted));
  b.setAttribute("aria-label", sfx.muted ? "Turn sound and vibration on" : "Turn sound and vibration off");
  b.classList.toggle("is-off", sfx.muted);
}
$("soundBtn").addEventListener("click", () => {
  sfx.setMuted(!sfx.muted);
  paintSound();
  if (!sfx.muted) sfx.chirp();
  track("sound", { on: !sfx.muted });
});
paintSound();

/* ── "Bring Bobo to me" ───────────────────────────────────────────────────── */
// The visitor's city comes from Netlify's IP lookup (no permission prompt);
// if that's unknown we ask the browser. Nothing is stored or sent anywhere else.
async function whereAmI() {
  try {
    const r = await fetch("/api/bobo/near", { cache: "no-store" });
    if (r.ok) return await r.json();
  } catch {
    /* fall through */
  }
  if (!navigator.geolocation) return null;
  return new Promise((res) =>
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        // name the nearest city (the coordinates aren't stored)
        const named = await fetch(`/api/bobo/near?lat=${lat.toFixed(2)}&lng=${lng.toFixed(2)}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        res(named ?? { city: "", country: "", countryCode: "", lat, lng });
      },
      () => res(null),
      { maximumAge: 600000, timeout: 8000 },
    ),
  );
}
let summoning = false;
async function summonBobo() {
  if (summoning || !globe) return;
  summoning = true;
  const btn = $("summonBtn");
  btn.classList.add("is-busy");
  btn.setAttribute("aria-busy", "true");
  sfx.select();
  stopTour();
  closeCard({ keepGlobe: true });
  if (mobile) closeList();
  const me = await whereAmI();
  btn.classList.remove("is-busy");
  btn.removeAttribute("aria-busy");
  if (!me) {
    summoning = false;
    toast("We couldn't tell where you are. Allow location to call Bobo over.");
    return;
  }
  sfx.whoosh(2.2);
  if (globe.summon(me)) document.body.classList.add("is-summon");
  track("summon", { cc: me.countryCode || null });
  setTimeout(() => (summoning = false), 1500);
}
function haversine(a, b) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function summoned(loc) {
  sfx.fanfare();
  const where = loc.city || "your city";
  const last = mediaPlaces()[0];
  const km = last ? haversine(last, loc) : 0;
  const b = $("bubble");
  b.textContent = `I made it to ${where}! Scan a keychain to make it official.`;
  const pos = globe.boboScreen();
  b.style.left = `${pos.x}px`;
  b.style.top = `${pos.y}px`;
  b.hidden = false;
  clearTimeout(bubbleT);
  bubbleT = setTimeout(() => (b.hidden = true), 5200);
  toast(last && km > 50 ? `Bobo ran ${fmtN(km)} km to ${where}!` : `Bobo ran to ${where}!`, "Share", () =>
    shareSummon(where),
  );
}
async function shareSummon(where) {
  const url = new URL("/evade/where-is-bobo/", location.origin).toString();
  const text = `I just called Bobo to ${where}. Where is Bobo?`;
  try {
    if (navigator.share) await navigator.share({ title: "Where is Bobo?", text, url });
    else if (await navigator.clipboard?.writeText(`${text} ${url}`).then(() => true)) toast("Link copied");
  } catch {
    /* cancelled */
  }
  track("summon_share");
}
$("summonBtn").addEventListener("click", summonBobo);

$("playCta").addEventListener("click", () => track("play_cola_run", { at: current?.key ?? null }));
$("playCta").href = GAME;

boot();
