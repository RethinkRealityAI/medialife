/**
 * Where is Bobo? · the page around the globe: loads the feed, builds the
 * place card, the sightings list, the live-scan ticker and the trip replay,
 * keeps the URL in sync (?at=<place>) and polls for new sightings. New
 * clips beam down onto their city the moment they land.
 *
 * Data: GET /api/bobo/feed.json (src/lib/bobo/model.ts → BoboFeed), plus the
 * visitor's own game clips: the record button links here with
 * ?clip=<id>#k=<viewKey>, and GET /api/bobo/clips/<id>?k=… lets them watch it
 * while everyone else sees an "in review" pin.
 */
import { sfx } from "./sfx.js?v=7";

const FEED = "/api/bobo/feed.json";
const POLL_MS = 15_000;
const MINE_KEY = "bobo-my-clips";
const MINE_DAYS = 30;
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
  capture: "New clip from the game",
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
const reviewMedia = new Set(); // ids that were "in review" at the last poll
let pendingBeam = null; // beam this place when the camera gets there
let lastInputAt = 0;
addEventListener("pointerdown", () => (lastInputAt = performance.now()), { capture: true });
addEventListener("keydown", () => (lastInputAt = performance.now()), { capture: true });

/* ── your own clips (sent from the game on this phone) ──────────────────── */
const okId = (v) => typeof v === "string" && /^[A-Za-z0-9]{6,60}$/.test(v);
function readMine() {
  try {
    const v = JSON.parse(localStorage.getItem(MINE_KEY) || "[]");
    return Array.isArray(v)
      ? v.filter((x) => x && okId(x.id) && okId(x.k) && Date.now() - (x.at || 0) < MINE_DAYS * 864e5)
      : [];
  } catch {
    return [];
  }
}
function writeMine(list) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(-12)));
  } catch {
    /* storage blocked: the clip still shows for this visit */
  }
}
// "See it on the globe" from the game: ?clip=<id>#k=<view key>
const linkClip = okId(new URLSearchParams(location.search).get("clip"))
  ? new URLSearchParams(location.search).get("clip")
  : null;
const mineKeys = new Map(readMine().map((x) => [x.id, x.k]));
{
  const k = new URLSearchParams(location.hash.slice(1)).get("k");
  if (linkClip && okId(k)) {
    mineKeys.set(linkClip, k);
    writeMine([...readMine().filter((x) => x.id !== linkClip), { id: linkClip, k, at: Date.now() }]);
  }
  if (k) {
    // keep the key out of the address bar (and out of anything the visitor shares)
    const u = new URL(location.href);
    u.hash = "";
    history.replaceState(null, "", u);
  }
}
const mineClips = new Map(); // id → OwnClip
async function fetchMine() {
  const gone = [];
  await Promise.all(
    [...mineKeys].map(async ([id, k]) => {
      // approved clips come with the public feed; only re-check the ones in review
      if (mineClips.has(id) && !mineClips.get(id).review) return;
      try {
        const r = await fetch(`/api/bobo/clips/${id}?k=${encodeURIComponent(k)}`, { cache: "no-store" });
        if (r.status === 404) gone.push(id);
        else if (r.ok) mineClips.set(id, await r.json());
      } catch {
        /* offline: try again at the next poll */
      }
    }),
  );
  if (gone.length) {
    for (const id of gone) {
      mineKeys.delete(id);
      mineClips.delete(id);
    }
    writeMine(readMine().filter((x) => !gone.includes(x.id)));
  }
}
/** The feed with this visitor's own clips playable on their pins (and added if the feed hasn't caught up). */
function mergeMine(f) {
  if (!mineClips.size) return f;
  const places = f.places.map((p) => ({ ...p, media: [...p.media] }));
  for (const c of mineClips.values()) {
    const { key, city, region, country, countryCode, lat, lng, ...media } = c;
    const m = { ...media, mine: true };
    let p = places.find((x) => x.key === key);
    if (!p) {
      p = { key, city, region, country, countryCode, lat, lng, media: [], events: 0, byType: {}, firstSeen: m.seenAt, lastSeen: m.seenAt };
      places.push(p);
    }
    const i = p.media.findIndex((x) => x.id === m.id);
    if (i < 0) p.media.push(m);
    // still in review for everyone else: play the visitor's own copy; approved: the public one
    else p.media[i] = p.media[i].review ? m : { ...p.media[i], mine: true };
    p.media.sort((a, b) => Date.parse(b.seenAt) - Date.parse(a.seenAt));
  }
  const withMedia = places.filter((p) => p.media.length);
  withMedia.sort((a, b) => Date.parse(b.media[0].seenAt) - Date.parse(a.media[0].seenAt));
  const journey = [...f.journey];
  for (const p of withMedia) if (!journey.includes(p.key)) journey.push(p.key);
  return {
    ...f,
    places: [...withMedia, ...places.filter((p) => !p.media.length)],
    journey,
    countries: [...new Set([...f.countries, ...withMedia.map((p) => p.countryCode)])].sort(),
    stats: { ...f.stats, places: withMedia.length },
  };
}

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
      const { createGlobe } = await import("./globe.js?v=7");
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
        onArrive: (key) => {
          sfx.arrive();
          const p = current && placeBy(current.key);
          if (p) globe.showMedia(holoItem(p.media[current.i]));
          if (pendingBeam && pendingBeam === key) {
            pendingBeam = null;
            beamIn(key);
          }
        },
        onBeamImpact: () => sfx.impact(),
        onHoloRect: dockCard,
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
  const [f] = await Promise.all([feedP, fetchMine()]);
  applyFeed(f ?? emptyFeed(), true);
  if (f) lastRaw = feedSig(f);
  updateInsets();
  document.documentElement.classList.add("is-ready");

  // the clip the visitor just sent from the game, a shared ?at=<place>, or else
  // the latest sighting: the globe always opens on the newest clip
  const at = new URLSearchParams(location.search).get("at");
  const first = mediaPlaces()[0];
  const sent = linkClip && mediaPlaces().find((p) => p.media.some((m) => m.id === linkClip));
  if (sent) {
    pendingBeam = sent.key;
    setTimeout(() => {
      select(sent.key, { from: "link", i: sent.media.findIndex((m) => m.id === linkClip) });
      if (sent.media.find((m) => m.id === linkClip)?.mine)
        toast(sent.media.find((m) => m.id === linkClip).review ? "Here's your clip. It's on the globe for everyone once the EVADE team has checked it." : "Here's your clip, live on the globe.");
    }, reduced ? 0 : 1400);
  } else if (at && placeBy(at)?.media.length) setTimeout(() => select(at, { from: "link" }), reduced ? 0 : 1600);
  else if (first && globe) {
    // a clip that landed in the last half hour beams in as the camera arrives
    if (Date.now() - Date.parse(first.media[0].seenAt) < 30 * 60_000) pendingBeam = first.key;
    setTimeout(() => {
      if (!current && !userTouched) select(first.key, { from: "auto" });
    }, reduced ? 600 : 3000);
  }
  if (!globe) openList();

  setInterval(poll, POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
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

function applyFeed(raw, first = false) {
  const before = feed;
  const f = mergeMine(raw);
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
  // new clips since the last poll beam down; approved ones light up again
  if (!first && before) {
    const fresh = mediaPlaces()
      .flatMap((p) => p.media.filter((m) => !seenMedia.has(m.id) || (reviewMedia.has(m.id) && !m.review)).map((m) => [p, m]))
      .sort((a, b) => Date.parse(b[1].seenAt) - Date.parse(a[1].seenAt));
    if (fresh.length) arrivals(fresh);
    const news = f.recent.filter((e) => !seenEvents.has(eventId(e)));
    if (news[0]) showTick(news[0], true);
    for (const e of news.slice(1)) if (e.key) globe?.ping(e.key);
  }
  reviewMedia.clear();
  for (const p of mediaPlaces())
    for (const m of p.media) {
      seenMedia.add(m.id);
      if (m.review) reviewMedia.add(m.id);
    }
  for (const e of f.recent) seenEvents.add(eventId(e));
  if (current && !placeBy(current.key)?.media.length) closeCard();
}

const eventId = (e) => `${e.at}|${e.key}|${e.type}`;
const feedSig = (f) => JSON.stringify([f.places, f.recent[0], [...mineClips.values()].map((c) => [c.id, c.review])]);

let polling = false;
let lastRaw = "";
async function poll() {
  if (document.hidden || polling) return;
  polling = true;
  try {
    const [f] = await Promise.all([loadFeed(), mineKeys.size ? fetchMine() : null]);
    if (!f) return;
    // generatedAt changes every build: compare what's drawn instead
    const sig = feedSig(f);
    if (sig !== lastRaw) {
      lastRaw = sig;
      applyFeed(f);
    }
  } finally {
    polling = false;
  }
}

/** New clips just landed: beam them in, and fly there if nobody's busy with the globe. */
function arrivals(fresh) {
  const [p, m] = fresh[0];
  const where = p.city || p.country;
  const idle =
    !current && !tour && !globe?.summoned && performance.now() - lastInputAt > 15_000 && (!mobile || $("sightings").hidden);
  const approved = !m.review && reviewMedia.has(m.id);
  const text = m.mine
    ? approved
      ? `Your clip from ${where} is live for everyone!`
      : `Your clip just landed in ${where}`
    : approved
      ? `A new sighting is live in ${where}`
      : `New clip just landed in ${where}`;
  if (idle && globe) {
    pendingBeam = p.key;
    select(p.key, { from: "live", i: p.media.indexOf(m) });
    toast(text);
  } else {
    // beam where it lands (the visitor can see it if that side faces them)
    const keys = [...new Set(fresh.map(([x]) => x.key))].slice(0, 3);
    keys.forEach((k, i) => setTimeout(() => beamIn(k), i * 700));
    toast(text, "See it", () => {
      pendingBeam = p.key;
      select(p.key, { from: "toast", i: placeBy(p.key)?.media.findIndex((x) => x.id === m.id) ?? 0 });
    });
  }
  track("live_clip", { place: p.key, review: !!m.review });
}

function beamIn(key) {
  if (!globe?.beam(key)) return;
  sfx.beam();
}

/** What the hologram shows: the clip, or for one in review, an "incoming" card. */
let reviewArt = null;
function holoItem(m) {
  if (!m.review || m.mine) return m;
  if (!reviewArt) {
    const c = document.createElement("canvas");
    c.width = 540;
    c.height = 960;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 960);
    g.addColorStop(0, "#0d1116");
    g.addColorStop(1, "#2a1a05");
    x.fillStyle = g;
    x.fillRect(0, 0, 540, 960);
    x.fillStyle = "rgba(255,255,255,0.05)";
    for (let y = 0; y < 960; y += 6) x.fillRect(0, y, 540, 2);
    // a can, drawn: the Cola Run collectible
    x.save();
    x.translate(270, 400);
    x.fillStyle = "#f6c344";
    x.beginPath();
    x.roundRect(-70, -120, 140, 240, 26);
    x.fill();
    x.fillStyle = "#ffffff";
    x.fillRect(-70, -30, 140, 46);
    x.fillStyle = "#1d1300";
    x.font = "700 30px 'Space Grotesk', system-ui, sans-serif";
    x.textAlign = "center";
    x.fillText("COLA", 0, 4);
    x.fillStyle = "rgba(255,255,255,0.35)";
    x.fillRect(-46, -110, 16, 220);
    x.restore();
    x.textAlign = "center";
    x.fillStyle = "#3fe6e0";
    x.font = "600 26px 'JetBrains Mono', ui-monospace, monospace";
    x.fillText("INCOMING CLIP", 270, 620);
    x.fillStyle = "#ffffff";
    x.font = "600 44px 'Space Grotesk', system-ui, sans-serif";
    x.fillText("Fresh from", 270, 690);
    x.fillText("Cola Run", 270, 744);
    x.fillStyle = "#c9d1d8";
    x.font = "500 26px 'Space Grotesk', system-ui, sans-serif";
    x.fillText("Plays here once it's checked", 270, 810);
    reviewArt = c.toDataURL("image/jpeg", 0.86);
  }
  return { ...m, kind: "image", url: reviewArt, width: 540, height: 960 };
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
    if (p.media.some((m) => m.mine)) name.append(el("span", "place-tag is-mine", "Your clip"));
    else if (p.media[0].review) name.append(el("span", "place-tag", "In review"));
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
  if (from !== "auto" && from !== "link" && from !== "live") sfx.select();
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
    globe.showMedia(holoItem(p.media[current.i]));
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
  const badge = $("cardBadge");
  badge.hidden = !m.review && !m.mine;
  badge.className = `card-badge${m.mine ? " is-mine" : ""}`;
  badge.textContent = m.mine ? (m.review ? "Your clip · in review" : "Your clip") : "In review";
  $("cardTitle").textContent = m.title;
  const desc = m.review
    ? m.mine
      ? "Only you can watch this until the EVADE team has checked it. Then it plays here for everyone."
      : "Just sent from the game. The EVADE team checks every clip, then it plays right here."
    : m.description;
  $("cardDesc").textContent = desc;
  $("cardDesc").hidden = !desc;
  // a clip in review has nothing to open, unless it's yours
  $("watchBtn").hidden = !!m.review && !m.mine;
  $("watchBtn").querySelector("span").textContent = m.kind === "video" ? "Watch with sound" : "View photo";
  // strip
  const strip = $("cardStrip");
  strip.textContent = "";
  strip.hidden = p.media.length < 2;
  p.media.forEach((x, idx) => {
    const b = el("button", "thumb");
    b.type = "button";
    b.setAttribute("role", "listitem");
    b.setAttribute("aria-label", `${x.title}${x.review ? " (in review)" : x.kind === "video" ? " (video)" : " (photo)"}`);
    b.setAttribute("aria-current", String(idx === current.i));
    b.append(thumbImg(x));
    if (x.kind === "video" && x.durationS) b.append(el("span", "dur", dur(x.durationS)));
    b.addEventListener("click", () => setMedia(idx));
    strip.append(b);
  });
  // the dossier: what the tracking network knows about this sighting
  const fileNo = (m.id || p.key).replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase().padStart(6, "0");
  $("cardFile").textContent = `SIGHTING FILE #${fileNo}`;
  const coord = (v, pos, neg) => `${Math.abs(v).toFixed(3)}°${v >= 0 ? pos : neg}`;
  const seen = new Date(m.seenAt);
  const intel = [
    ["Coordinates", `${coord(p.lat, "N", "S")} ${coord(p.lng, "E", "W")}`],
    ["Logged", Number.isNaN(+seen) ? "—" : `${seen.toISOString().slice(0, 10)} · ${seen.toISOString().slice(11, 16)} UTC`],
    ["Source", m.review || /game/i.test(m.title) ? "Cola Run · game clip" : m.kind === "video" ? "AR capture · video" : "AR capture · photo"],
    ["Footage", m.kind === "video" ? (m.durationS ? `${dur(m.durationS)} · ${m.width && m.height ? (m.width < m.height ? "vertical" : "wide") : "video"}` : "video") : "still image"],
    ["Signal", p.events ? `${fmtN(p.events)} ${p.events === 1 ? "scan" : "scans"} nearby` : "quiet"],
    ["Status", m.review ? "Pending review" : "Verified sighting"],
  ];
  const dl = $("cardIntel");
  dl.textContent = "";
  for (const [k, v] of intel) {
    const row = el("div", k === "Status" ? (m.review ? "is-pending" : "is-ok") : null);
    row.append(el("dt", null, k), el("dd", null, v));
    dl.append(row);
  }
  // scans here
  const sc = $("cardScans");
  sc.hidden = !p.events;
  if (p.events) {
    sc.innerHTML = "";
    sc.append(el("b", null, fmtN(p.events)), document.createTextNode(` ${p.events === 1 ? "keychain scan or play" : "keychain scans and plays"} here${p.lastSeen ? `, latest ${ago(p.lastSeen)}` : ""}.`));
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
  globe?.showMedia(holoItem(p.media[i]));
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

/* ── the dossier docks beside the hologram (wide screens) ────────────────── */
let docked = null;
function dockCard(rect) {
  const card = $("card");
  const wide = !mobile && innerWidth >= 720 && innerWidth > innerHeight * 1.1;
  if (!wide || !rect || !rect.ready || card.hidden) {
    if (docked) {
      docked = null;
      card.classList.remove("is-docked");
      card.style.transform = "";
    }
    return;
  }
  const r = card.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  const gap = 22;
  let x = rect.right + gap;
  let side = "right";
  if (x + w > innerWidth - 16) {
    x = rect.left - gap - w;
    side = "left";
  }
  const y = Math.max(76, Math.min(innerHeight - h - 16, rect.top + 6));
  const key = `${Math.round(x)},${Math.round(y)},${side}`;
  if (key === docked) return;
  docked = key;
  card.classList.add("is-docked");
  card.dataset.side = side;
  card.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
}

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
// Shows the newest real event and stays put; a new one swaps in (with a ping
// on the globe) when it actually happens. It never replays old events.
let tickShown = null;
function tickText(e) {
  const txt = $("tickerText");
  txt.textContent = "";
  txt.append(el("b", null, EVENT_TEXT[e.type] || "Activity"));
  txt.append(document.createTextNode(` in ${[e.city, e.country].filter(Boolean).join(", ") || "somewhere"} `));
  txt.append(el("span", "ago", `· ${ago(e.at)}`));
}
function showTick(e, fresh = false) {
  const t = $("ticker");
  tickShown = e;
  tickText(e);
  t.hidden = false;
  t.classList.toggle("is-new", fresh);
  t.classList.remove("is-swap");
  void t.offsetWidth;
  t.classList.add("is-swap");
  if (fresh) {
    if (e.key) globe?.ping(e.key);
    if (userTouched) sfx.ping();
    clearTimeout(showTick.t);
    showTick.t = setTimeout(() => t.classList.remove("is-new"), 6000);
  }
}
function startTicker() {
  setTimeout(() => {
    if (!tickShown && feed?.recent[0]) showTick(feed.recent[0]);
  }, 2400);
  // keep "· 3 minutes ago" honest
  setInterval(() => {
    if (tickShown && !document.hidden) tickText(tickShown);
  }, 30_000);
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
