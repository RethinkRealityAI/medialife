/* MEDIALIFE x EVADE · creator crew landing page.
 *
 * Everything except the 3D stage (stage.js owns #dropStage). Sections:
 *   chrome (nav, reveal, mobile CTA) · hero keychain tilt · "activated" phone demo
 *   · stage hooks · gameplay video slot · quick intake form (contact, channels, address) · analytics.
 *
 * Form: POSTs urlencoded to /__forms.html as Netlify form "evade-ugc-creator"
 * (declared in public/__forms.html; keep field names in sync).
 * Local testing: on localhost/127.0.0.1, or with ?mockSubmit=1, the POST is simulated
 * as a success; ?mockSubmit=fail simulates a failure so the retry path can be checked.
 */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const params = new URLSearchParams(location.search);

/* ---------------------------------------------------------------- analytics */
function track(name, props) {
  try {
    window.ARTrack?.event(name, props);
  } catch {
    /* analytics never breaks the page */
  }
}
function initTracking() {
  try {
    window.ARTrack?.init({ demo: "evade-creators" });
  } catch {
    /* ignore */
  }
}
if (window.ARTrack) initTracking();
else addEventListener("DOMContentLoaded", initTracking, { once: true });

/* ---------------------------------------------------------------- chrome */
const nav = $("#nav");
const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const revealIO = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("is-in");
        revealIO.unobserve(e.target);
      }
    }
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
);
$$(".rv").forEach((el) => revealIO.observe(el));

// floating CTA on phones: visible after the hero, hidden while the form is on screen
(() => {
  const cta = $("#mobileCta");
  const hero = $(".hero");
  const join = $("#join");
  let heroOut = false;
  let joinIn = false;
  let stageIn = false;
  const sync = () => cta.classList.toggle("is-on", heroOut && !joinIn && !stageIn);
  // the 3D stage has its own controls along its bottom edge; never cover them
  const stageEl = $("#dropStage");
  if (stageEl)
    new IntersectionObserver(([e]) => {
      stageIn = e.isIntersecting;
      sync();
    }, { rootMargin: "0px 0px -10% 0px" }).observe(stageEl);
  new IntersectionObserver(([e]) => {
    heroOut = !e.isIntersecting;
    sync();
  }).observe(hero);
  new IntersectionObserver(
    ([e]) => {
      joinIn = e.isIntersecting;
      sync();
    },
    { rootMargin: "0px 0px -20% 0px" },
  ).observe(join);
  cta.addEventListener("click", () => track("cta_click", { where: "mobile_bar" }));
})();
$$('a[href="#join"]').forEach((a) =>
  a.addEventListener("click", () => track("cta_click", { where: a.closest("section, header")?.id || "nav" })),
);

/* ---------------------------------------------------------------- qr codes */
// The keychain's real code: Cola Run at evade.medialife.ai (the same target as the printed QR).
const COLA_URL = "https://evade.medialife.ai";
const qrSvg = (dark = "#0a0a0a") =>
  import("qrcode").then((m) => (m.default || m).toString(COLA_URL, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark, light: "#ffffff" } }));
qrSvg()
  .then((svg) => {
    for (const id of ["heroQr", "realQr"]) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = svg;
    }
  })
  .catch(() => {
    /* the link under the code still works */
  });

/* ---------------------------------------------------------------- hero keychain */
(() => {
  const kc = $("#heroKeychain");
  if (!kc) return;
  const tilt = $(".kc-tilt", kc);
  const hit = $("#kcHit");
  let t = 0;
  // tap (or Enter): the can flips to its QR back, NFC waves pulse out, Bobo hops
  function activate(user) {
    clearTimeout(t);
    kc.classList.remove("is-act");
    void kc.offsetWidth;
    kc.classList.add("is-act");
    if (user) {
      kc.classList.add("was-tapped");
      try {
        navigator.vibrate?.(12);
      } catch {
        /* ignore */
      }
      track("hero_keychain_tap");
    }
    t = setTimeout(() => kc.classList.remove("is-act"), 3200);
  }
  hit.addEventListener("click", () => activate(true));
  // play it once by itself so the interaction is discoverable
  if (!REDUCED) {
    new IntersectionObserver(
      ([e], io) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        setTimeout(() => !kc.classList.contains("was-tapped") && activate(false), 1800);
      },
      { threshold: 0.6 },
    ).observe(kc);
  }
  if (REDUCED || !matchMedia("(pointer: fine)").matches) return;
  let raf = 0;
  const hero = $(".hero");
  const poster = $(".hs-poster");
  hero.addEventListener("pointermove", (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = kc.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / innerWidth;
      const y = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      tilt.style.setProperty("--ry", `${(x * 22).toFixed(2)}deg`);
      tilt.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
      // the splash behind leans less, so the two read as layers
      poster?.style.setProperty("--sy", `${(x * 8).toFixed(2)}deg`);
      poster?.style.setProperty("--sx", `${(-y * 5).toFixed(2)}deg`);
    });
  });
  hero.addEventListener("pointerleave", () => {
    tilt.style.setProperty("--ry", "0deg");
    tilt.style.setProperty("--rx", "0deg");
    poster?.style.setProperty("--sy", "0deg");
    poster?.style.setProperty("--sx", "0deg");
  });
})();

/* ---------------------------------------------------------------- how it comes alive */
// The retail display's activation demo, for EVADE: scan or tap → Cola Run opens → play and get rewarded.
(() => {
  const seq = $("#seq");
  if (!seq) return;
  const loop = $("#loopSteps");
  const items = $$("li", loop);
  const say = $("#seqSay");
  const LINES = ["Tapping the keychain on a phone", "Cola Run opens in the browser", "Playing Cola Run and unlocking a reward"];
  const DUR = [3600, 4000, 7200];
  let step = 0;
  let timer = 0;
  let auto = !REDUCED;
  let visible = false;
  let played = false; // has the sequence started at least once?
  let leftAt = 0;
  let enterT = 0;

  // the gameplay screen plays a real phone recording of the experience
  const pv = $(".pp-video", seq);
  const footage = (pv?.dataset.src || "").trim();
  let videoReady = false;
  function startVideo() {
    if (!footage || REDUCED) return;
    if (!videoReady) {
      videoReady = true;
      pv.src = footage;
      pv.hidden = false;
      $(".pp-still", seq).hidden = true;
    }
    pv.currentTime = 0;
    pv.play().catch(() => {});
  }

  function go(i, user = false) {
    step = i;
    seq.dataset.step = String(i);
    items.forEach((li, k) => {
      li.classList.toggle("is-on", k === i);
      li.classList.toggle("is-done", k < i);
      $("button", li).setAttribute("aria-current", k === i ? "step" : "false");
    });
    say.textContent = LINES[i];
    loop.style.setProperty("--dur", `${DUR[i]}ms`);
    if (i === 2) startVideo();
    else pv?.pause();
    if (user) {
      track("activated_step", { step: i + 1 });
      auto = !REDUCED; // keep playing from the step they picked
    }
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (!auto || !visible) return;
    timer = setTimeout(() => go((step + 1) % items.length), DUR[step]);
  }
  items.forEach((li, k) =>
    $("button", li).addEventListener("click", () => {
      seq.classList.add("is-live");
      loop.classList.toggle("is-live", !REDUCED);
      go(k, true);
    }),
  );
  // Start from step 1 only once the phone is properly on screen (most of it, away from the
  // edges, for a moment), so people see the whole story instead of arriving at the end.
  // CSS keeps the screen animations paused until then (.seq:not(.is-live)).
  function start() {
    visible = true;
    seq.classList.add("is-live");
    loop.classList.toggle("is-live", !REDUCED);
    if (REDUCED) return go(2);
    if (played && Date.now() - leftAt < 4000) return go(step); // a quick scroll away: carry on
    played = true;
    seq.dataset.step = "";
    void seq.offsetWidth; // restart the step-1 animations from the top
    go(0);
  }
  new IntersectionObserver(
    ([e]) => {
      const inView = e.isIntersecting && e.intersectionRatio >= 0.6;
      clearTimeout(enterT);
      if (inView && !visible) enterT = setTimeout(start, 300);
      else if (!inView && visible) {
        visible = false;
        leftAt = Date.now();
        clearTimeout(timer);
        seq.classList.remove("is-live");
        loop.classList.remove("is-live");
        pv?.pause();
      }
    },
    { threshold: [0, 0.6, 0.8], rootMargin: "-12% 0px -12% 0px" },
  ).observe(seq);
})();

/* ---------------------------------------------------------------- 3D stage hooks */
(() => {
  const stage = $("#dropStage");
  const chip = $("#playChip");
  if (!stage) return;
  stage.addEventListener("stage:ready", () => {
    stage.classList.add("is-live");
    track("stage_ready");
  });
  stage.addEventListener("stage:select", (e) => track("stage_select", { id: String(e.detail?.id || "") }));
  stage.addEventListener("stage:bobo", () => {
    if (chip.hidden) {
      chip.hidden = false;
      track("stage_bobo");
    }
  });
  // if the module never boots, label the poster so it reads as intentional
  setTimeout(() => {
    if (!stage.classList.contains("is-live") && !stage.children.length) stage.classList.add("is-failed");
  }, 8000);
})();

/* ---------------------------------------------------------------- Cola Run reel */
// Each clip loads when it first nears the viewport and only plays while it is on screen,
// so a phone never decodes four videos it can't see. Reduced motion: posters + controls, no autoplay.
(() => {
  const reel = $("#reel");
  if (!reel) return;
  let tracked = false;
  const io = new IntersectionObserver(
    (entries) => {
      for (const { target: v, isIntersecting } of entries) {
        if (isIntersecting) {
          if (!v.src) {
            v.src = v.dataset.src;
            if (REDUCED) v.controls = true;
          }
          if (!REDUCED) {
            v.muted = true; // some browsers only honour the attribute once set as a property
            // an interrupted play() (scrolled away mid-load) is not a failure; only a blocked autoplay gets controls
            v.play().catch((err) => err?.name === "NotAllowedError" && (v.controls = true));
          }
          if (!tracked) {
            tracked = true;
            track("gameplay_video");
          }
        } else v.pause();
      }
    },
    { threshold: 0.35 },
  );
  $$("video", reel).forEach((v) => io.observe(v));
})();

/* ---------------------------------------------------------------- perks: pointer spotlight */
if (matchMedia("(pointer: fine)").matches) {
  $$(".perk").forEach((card) =>
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    }),
  );
}

/* ---------------------------------------------------------------- countries */
const COUNTRIES =
  "Argentina|Australia|Austria|Bahrain|Belgium|Bolivia|Brazil|Bulgaria|Canada|Chile|China|Colombia|Costa Rica|Croatia|Cyprus|Czechia|Denmark|Dominican Republic|Ecuador|Egypt|El Salvador|Estonia|Finland|France|Germany|Ghana|Greece|Guatemala|Honduras|Hong Kong|Hungary|Iceland|India|Indonesia|Ireland|Israel|Italy|Jamaica|Japan|Jordan|Kenya|Kuwait|Latvia|Lithuania|Luxembourg|Malaysia|Malta|Mexico|Morocco|Netherlands|New Zealand|Nigeria|Norway|Oman|Pakistan|Panama|Paraguay|Peru|Philippines|Poland|Portugal|Puerto Rico|Qatar|Romania|Saudi Arabia|Serbia|Singapore|Slovakia|Slovenia|South Africa|South Korea|Spain|Sri Lanka|Sweden|Switzerland|Taiwan|Thailand|Trinidad and Tobago|Turkey|Ukraine|United Arab Emirates|United Kingdom|United States|Uruguay|Vietnam".split(
    "|",
  );
$("#countryList").innerHTML = COUNTRIES.map((c) => `<option value="${c}"></option>`).join("");
function localeCountry() {
  try {
    const region = new Intl.Locale(navigator.language || "").maximize().region;
    if (!region) return "";
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(region);
    return { US: "United States", GB: "United Kingdom", KR: "South Korea" }[region] || name || "";
  } catch {
    return "";
  }
}

/* ---------------------------------------------------------------- onboarding form */
// A quick intake: contact, channels (usernames), shipping address. Order matches the tiles.
// Each channel goes out as <platform>_handle (the field the UGC Hub import reads).
const PLATFORMS = {
  tiktok: { label: "TikTok", prefix: "@", ph: "yourhandle" },
  youtube: { label: "YouTube", prefix: "", ph: "@yourchannel or link" },
  instagram: { label: "Instagram", prefix: "@", ph: "yourhandle" },
  twitch: { label: "Twitch", prefix: "", ph: "yourchannel" },
  roblox: { label: "Roblox", prefix: "", ph: "BoboFan123" },
  x: { label: "X", prefix: "@", ph: "yourhandle" },
  discord: { label: "Discord", prefix: "", ph: "yourname" },
};
const ORDER = Object.keys(PLATFORMS);
const STORE_KEY = "evade-ugc-creator:v3";
const LABELS = ["About you", "Your channels", "Shipping address", "Check and send"];

/** Normalise what people paste: URLs, @@handles, stray spaces. */
function normaliseHandle(p, raw) {
  let v = String(raw || "").trim();
  if (!v) return "";
  const url = v.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.)/i, "");
  const hosts = {
    instagram: /^instagram\.com\/@?([^/?#]+)/i,
    x: /^(?:x|twitter)\.com\/@?([^/?#]+)/i,
    tiktok: /^tiktok\.com\/@?([^/?#]+)/i,
    twitch: /^twitch\.tv\/([^/?#]+)/i,
  };
  if (hosts[p]) {
    const m = url.match(hosts[p]);
    if (m) v = m[1];
    return v.replace(/^@+/, "").replace(/\s+/g, "");
  }
  if (p === "youtube") {
    if (/^(youtube\.com|youtu\.be)\//i.test(url)) return url.replace(/[?#].*$/, "").replace(/\/+$/, "");
    return "@" + v.replace(/^@+/, "").replace(/\s+/g, "");
  }
  if (p === "roblox") {
    if (/^roblox\.com\//i.test(url)) return url.replace(/[?#].*$/, "").replace(/\/+$/, "");
    return v.replace(/^@+/, "").replace(/\s+/g, "");
  }
  // discord
  return v.replace(/^@+/, "").replace(/\s+/g, "");
}
function handleError(p, v) {
  const L = PLATFORMS[p].label;
  if (!v || v === "@") return `Add your ${L} username.`;
  if (p === "instagram" || p === "x" || p === "tiktok") {
    if (!/^[A-Za-z0-9._]{1,30}$/.test(v)) return `${L} usernames use letters, numbers, dots or underscores.`;
  } else if (p === "youtube") {
    if (!/^@[A-Za-z0-9._-]{2,100}$/.test(v) && !/^(youtube\.com|youtu\.be)\/\S+$/i.test(v)) return "Use your YouTube @handle or paste the channel link.";
  } else if (p === "roblox") {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(v) && !/^roblox\.com\/\S+$/i.test(v)) return "Roblox usernames are 3 to 20 letters, numbers or underscores.";
  } else if (p === "twitch") {
    if (!/^[A-Za-z0-9_]{3,25}$/.test(v)) return "Twitch usernames are 3 to 25 letters, numbers or underscores.";
  } else if (p === "discord") {
    if (!/^[A-Za-z0-9._#]{2,40}$/.test(v)) return "Use your Discord username, no spaces.";
  }
  return "";
}
/** The shared username, typed once: strip a pasted profile link and any leading @. */
function cleanShared(raw) {
  let v = String(raw || "").trim();
  const url = v.replace(/^https?:\/\//i, "").replace(/^(www\.|m\.)/i, "");
  const m = url.match(/^(?:instagram\.com|x\.com|twitter\.com|tiktok\.com|twitch\.tv|youtube\.com)\/@?([^/?#]+)\/?$/i);
  if (m) v = m[1];
  return v.replace(/^@+/, "").replace(/\s+/g, "");
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

(() => {
  const form = $("#ugcForm");
  if (!form) return;
  const steps = $$(".step", form);
  const progItems = $$("#progSteps li");
  const progFill = $("#progFill");
  const announce = $("#stepAnnounce");
  const btnNext = $("#btnNext");
  const btnBack = $("#btnBack");
  const saveNote = $("#saveNote");
  const tiles = $$(".ptile", form);
  const card = $("#joinCard");
  const unames = $("#unames");
  const shared = $("#f-uname");
  const unWrap = $("#unWrap");
  const unLabel = $("#l-uname");
  const unApply = $("#unApply");
  const unChips = $("#unChips");
  const unOwn = $("#unOwn");
  const unRows = $("#unRows");
  const sharedErr = $("#e-uname");
  let current = 0;
  let maxReached = 0;
  let started = false;
  const touched = new Set();
  // Channels that use the shared username. A newly ticked channel joins it.
  const linked = new Set(ORDER);

  // utm + page context
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    if (params.get(k)) form.elements[k].value = params.get(k).slice(0, 120);
  }
  form.elements.page.value = location.pathname + (params.get("c") ? `?c=${params.get("c")}` : "");

  /* ---- usernames ---- */
  // One chip and one "different username" row per channel, built once and shown as needed.
  const chips = {};
  const rows = {};
  for (const p of ORDER) {
    const cfg = PLATFORMS[p];
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "un-chip";
    chip.dataset.p = p;
    chip.innerHTML = `<svg aria-hidden="true"><use href="#i-${p}"/></svg><span>${cfg.label}</span><i aria-hidden="true"><svg><use href="#i-check"/></svg></i>`;
    chip.hidden = true;
    chip.addEventListener("click", () => {
      if (linked.has(p)) {
        linked.delete(p);
        syncUsernames();
        rows[p].querySelector("input").focus({ preventScroll: true });
        rows[p].scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
      } else {
        linked.add(p);
        syncUsernames();
      }
      if (touched.has("username")) checkShared();
      save();
    });
    unChips.appendChild(chip);
    chips[p] = chip;

    const row = document.createElement("div");
    row.className = "un-row field";
    row.dataset.p = p;
    row.hidden = true;
    row.innerHTML = `
      <label for="h-${p}" class="sr-only">${cfg.label} username</label>
      <div class="un-line">
        <span class="un-ico" aria-hidden="true"><svg><use href="#i-${p}"/></svg></span>
        <div class="ph-input${cfg.prefix ? "" : " no-pfx"}">${cfg.prefix ? `<span class="pfx" aria-hidden="true">${cfg.prefix}</span>` : ""}
          <input id="h-${p}" name="${p}_handle" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120" placeholder="${cfg.ph}" data-handle="${p}" aria-describedby="e-h-${p}" disabled />
        </div>
        <button type="button" class="un-same" aria-label="Use the same username on ${cfg.label}" title="Use the same username">Same</button>
      </div>
      <p class="err" id="e-h-${p}"></p>`;
    $(".un-same", row).addEventListener("click", () => {
      linked.add(p);
      setErr($(`#e-h-${p}`), "");
      syncUsernames();
      chips[p].focus({ preventScroll: true });
      if (touched.has("username")) checkShared();
      save();
    });
    unRows.appendChild(row);
    rows[p] = row;
  }

  function selectedPlatforms() {
    return tiles.filter((t) => $("input", t).checked).map((t) => t.dataset.p);
  }
  /** Channels that read the shared field. With one channel, that field is simply "Your X username". */
  function sharedUsers(sel = selectedPlatforms()) {
    return sel.filter((p) => linked.has(p));
  }
  function syncUsernames() {
    const sel = selectedPlatforms();
    tiles.forEach((t) => t.classList.toggle("is-on", $("input", t).checked));
    form.elements.platforms.value = sel.join(",");
    unames.hidden = !sel.length;
    const single = sel.length === 1;
    // one channel: the shared field is simply "Your X username", so fold any own username into it
    if (single && !linked.has(sel[0])) {
      const own = rows[sel[0]].querySelector("input");
      if (own.value.trim()) shared.value = own.value.trim();
      own.value = "";
      linked.add(sel[0]);
    }
    unApply.hidden = single;
    const one = single ? PLATFORMS[sel[0]] : null;
    unLabel.textContent = one ? `Your ${one.label} username` : "Your username";
    shared.placeholder = one ? one.ph : "yourname";
    const pfx = one ? one.prefix : "@";
    $(".pfx", unWrap).hidden = !pfx;
    unWrap.classList.toggle("no-pfx", !pfx);
    for (const p of ORDER) {
      const on = sel.includes(p);
      chips[p].hidden = !on;
      chips[p].setAttribute("aria-pressed", String(linked.has(p)));
      chips[p].classList.toggle("is-on", linked.has(p));
      const own = on && !linked.has(p);
      rows[p].hidden = !own;
      rows[p].querySelector("input").disabled = !own;
    }
    unOwn.hidden = !sel.some((p) => !linked.has(p));
    if (sel.length) setErr($("#e-platforms"), "");
  }
  /** What a channel's username will be, as it is sent. */
  function handleFor(p) {
    const raw = linked.has(p) ? (selectedPlatforms().length === 1 ? shared.value : cleanShared(shared.value)) : rows[p].querySelector("input").value;
    return normaliseHandle(p, raw);
  }
  function sharedError() {
    const sel = selectedPlatforms();
    const users = sharedUsers(sel);
    if (!users.length) return "";
    if (!shared.value.trim()) return sel.length === 1 ? `Add your ${PLATFORMS[sel[0]].label} username.` : "Add your username.";
    for (const p of users) {
      const msg = handleError(p, handleFor(p));
      if (msg) return sel.length === 1 ? msg : `${msg} Tap ${PLATFORMS[p].label} above to give it a different one.`;
    }
    return "";
  }
  function checkShared() {
    const sel = selectedPlatforms();
    if (sel.length > 1) {
      const c = cleanShared(shared.value);
      if (c !== shared.value) shared.value = c;
    } else if (sel.length === 1 && PLATFORMS[sel[0]].prefix) {
      shared.value = shared.value.trim().replace(/^@+/, "");
    }
    const msg = sharedError();
    setErr(sharedErr, msg);
    shared.closest(".field").classList.toggle("is-ok", !msg && !!shared.value.trim());
    return !msg;
  }

  tiles.forEach((t) => {
    const cb = $("input", t);
    cb.addEventListener("change", () => {
      const p = t.dataset.p;
      // a channel you tick again starts on the shared username unless it has its own
      if (cb.checked && !rows[p].querySelector("input").value.trim()) linked.add(p);
      syncUsernames();
      if (cb.checked && selectedPlatforms().length === 1) shared.focus({ preventScroll: true });
      if (touched.has("username")) checkShared();
      save();
    });
  });

  /* ---- tee size ---- */
  const teeBtn = $("#teeGuideBtn");
  const teeGuide = $("#teeGuide");
  const teeRows = $$("#teeGuide tbody tr");
  // inches in the US (and Liberia, Myanmar), centimetres everywhere else
  const usesInches = (() => {
    try {
      const r = new Intl.Locale(navigator.language || "en-US").maximize().region;
      return ["US", "LR", "MM"].includes(r);
    } catch {
      return true;
    }
  })();
  function setUnit(u) {
    $$(".tee-units button", teeGuide).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.unit === u)));
    $$("tbody td", teeGuide).forEach((td) => (td.textContent = td.dataset[u]));
    $("caption", teeGuide).textContent = `T-shirt measurements in ${u === "in" ? "inches" : "centimetres"}, laid flat`;
  }
  function syncTee() {
    const v = form.elements.tee_size.value;
    teeRows.forEach((tr) => tr.classList.toggle("is-on", tr.dataset.size === v));
  }
  teeBtn.addEventListener("click", () => {
    const open = teeGuide.hidden;
    teeGuide.hidden = !open;
    teeBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      teeGuide.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
      track("size_guide_open");
    }
  });
  $$(".tee-units button", teeGuide).forEach((b) => b.addEventListener("click", () => setUnit(b.dataset.unit)));
  teeRows.forEach((tr) =>
    tr.addEventListener("click", () => {
      const r = form.querySelector(`input[name="tee_size"][value="${tr.dataset.size}"]`);
      r.checked = true;
      r.dispatchEvent(new Event("change", { bubbles: true }));
      r.dispatchEvent(new Event("input", { bubbles: true }));
    }),
  );
  form.addEventListener("change", (e) => e.target.name === "tee_size" && syncTee());
  setUnit(usesInches ? "in" : "cm");

  /* ---- validation ---- */
  function setErr(errEl, msg, field) {
    if (!errEl) return;
    errEl.textContent = msg;
    const wrap = field || errEl.closest(".field, .consent");
    if (wrap) wrap.classList.toggle("has-err", !!msg);
    const input = wrap?.querySelector("input, select, textarea");
    if (input && input.type !== "radio") input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function checkField(input) {
    if (input.dataset.shared) return checkShared();
    const n = input.name;
    const v = input.value.trim();
    let msg = "";
    if (input.dataset.handle) {
      const p = input.dataset.handle;
      const norm = normaliseHandle(p, input.value);
      const shown = PLATFORMS[p].prefix ? norm.replace(/^@+/, "") : norm;
      if (shown !== input.value) input.value = shown;
      msg = handleError(p, norm);
    } else if (n === "contact-name" || n === "ship_name") msg = v.length < 2 ? "Add your full name." : "";
    else if (n === "email") msg = !v ? "Add your email." : EMAIL.test(v) ? "" : "That email looks off. Check for typos.";
    else if (n === "phone") msg = v && !/^\+?[\d\s().-]{7,20}$/.test(v) ? "Use digits, with your country code (e.g. +44)." : "";
    else if (n === "tee_size") msg = form.elements.tee_size.value ? "" : "Pick your tee size.";
    else if (n === "address_country") msg = v ? "" : "Add your country.";
    else if (n === "address_line1") msg = v.length < 3 ? "Add your street address." : "";
    else if (n === "city") msg = v ? "" : "Add your city.";
    else if (n === "postal_code") msg = v ? "" : "Add your postal or ZIP code.";
    else if (n === "consent") msg = input.checked ? "" : "Tick this so we can contact you and ship your merch.";
    const errEl = $(`#${input.getAttribute("aria-describedby")?.split(" ").pop()}`);
    setErr(errEl, msg);
    if (input.type !== "checkbox") input.closest(".field")?.classList.toggle("is-ok", !msg && !!v);
    return !msg;
  }
  const OPTIONAL = new Set(["notes", "address_line2", "region"]);
  function validateStep(i) {
    let firstBad = null;
    const step = steps[i];
    const inputs = $$("input[name], textarea[name]", step).filter(
      (el) => el.type !== "hidden" && !el.disabled && !el.dataset.shared && !el.closest(".hp") && !OPTIONAL.has(el.name),
    );
    if (i === 1) {
      if (!selectedPlatforms().length) {
        setErr($("#e-platforms"), "Pick at least one channel.");
        firstBad = $("input", tiles[0]);
      } else {
        touched.add("username");
        if (!checkShared()) firstBad = shared;
      }
    }
    for (const el of inputs) {
      touched.add(el.name);
      if (!checkField(el) && !firstBad) firstBad = el;
    }
    if (firstBad) {
      firstBad.focus({ preventScroll: true });
      firstBad.closest(".field, .consent, .plat-tiles")?.scrollIntoView({ block: "center", behavior: REDUCED ? "auto" : "smooth" });
      track("form_error", { step: i + 1, field: firstBad.name || "platforms" });
      return false;
    }
    return true;
  }
  form.addEventListener(
    "blur",
    (e) => {
      const el = e.target;
      if (!el.name || el.type === "hidden" || el.type === "checkbox" || el.disabled) return;
      if (el.value.trim() || touched.has(el.name)) {
        touched.add(el.name);
        checkField(el);
      }
    },
    true,
  );
  form.addEventListener("input", (e) => {
    const el = e.target;
    // only clear an error while typing; new errors wait for blur or Next
    const wrap = el.closest(".field, .consent");
    if (wrap?.classList.contains("has-err")) {
      const ok = el.dataset.shared ? !sharedError() : el.dataset.handle ? !handleError(el.dataset.handle, normaliseHandle(el.dataset.handle, el.value)) : checkFieldQuiet(el);
      if (ok) checkField(el);
    }
    if (!started) {
      started = true;
      track("form_start");
    }
    save();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "consent") checkField(e.target);
    save();
  });
  function checkFieldQuiet(el) {
    const v = el.value.trim();
    switch (el.name) {
      case "email": return EMAIL.test(v);
      case "contact-name":
      case "ship_name": return v.length >= 2;
      case "address_line1": return v.length >= 3;
      case "phone": return !v || /^\+?[\d\s().-]{7,20}$/.test(v);
      case "consent": return el.checked;
      default: return !!v;
    }
  }

  /* ---- step navigation ---- */
  function show(i, dir = 1, quiet = false) {
    const prev = current;
    current = i;
    maxReached = Math.max(maxReached, i);
    steps.forEach((s, k) => {
      s.hidden = k !== i;
      s.classList.toggle("is-on", k === i);
      s.classList.toggle("is-back", k === i && dir < 0);
    });
    progItems.forEach((li, k) => {
      li.classList.toggle("is-on", k === i);
      li.classList.toggle("is-done", k < i || (k <= maxReached && k !== i));
      const b = $("button", li);
      b.disabled = !(k <= maxReached && k !== i);
      if (k === i) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
      b.setAttribute("aria-label", `Step ${k + 1}: ${LABELS[k]}${k < i ? ", done" : ""}`);
    });
    progFill.style.width = `${((i + 1) / steps.length) * 100}%`;
    btnBack.hidden = i === 0;
    const last = i === steps.length - 1;
    btnNext.innerHTML = last ? `Send it <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg>` : `Next <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg>`;
    announce.textContent = `Step ${i + 1} of ${steps.length}: ${LABELS[i]}`;
    if (i === 2) {
      const ac = form.elements.address_country;
      if (!ac.value.trim()) ac.value = localeCountry();
      const sn = form.elements.ship_name;
      if (!sn.value.trim()) sn.value = form.elements["contact-name"].value.trim();
    }
    $("#stepsScroll").scrollTop = 0;
    if (i === 3) renderReview();
    if (prev !== i && !quiet) {
      // keep the whole card (it is sized to the viewport) on screen below the nav
      const r = card.getBoundingClientRect();
      if (r.top < nav.offsetHeight || r.bottom > innerHeight + 2) card.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
      // move focus to the step heading region for keyboard and screen-reader users
      const firstInput = $("input:not([type=hidden]):not([type=checkbox]), textarea", steps[i]);
      if (i === 1) {
        if (!selectedPlatforms().length) $("input", tiles[0]).focus({ preventScroll: true });
        else $("legend", steps[i]).setAttribute("tabindex", "-1"), $("legend", steps[i]).focus({ preventScroll: true });
      } else if (i === 3) $("legend", steps[i]).setAttribute("tabindex", "-1"), $("legend", steps[i]).focus({ preventScroll: true });
      else if (firstInput && !firstInput.value) firstInput.focus({ preventScroll: true });
      else $("legend", steps[i]).setAttribute("tabindex", "-1"), $("legend", steps[i]).focus({ preventScroll: true });
      track("form_step", { step: i + 1 });
    }
    save();
  }
  btnBack.addEventListener("click", () => show(Math.max(0, current - 1), -1));
  progItems.forEach((li, k) =>
    $("button", li).addEventListener("click", () => {
      if (k <= maxReached && k !== current) {
        if (k > current && !validateStep(current)) return;
        show(k, k < current ? -1 : 1);
      }
    }),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateStep(current)) return;
    if (current < steps.length - 1) {
      show(current + 1, 1);
      return;
    }
    send();
  });
  // Enter on a focused tile toggles it instead of submitting
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.type === "checkbox" && e.target.closest(".ptile")) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* ---- review ---- */
  const shownHandle = (p) => {
    const h = handleFor(p);
    return PLATFORMS[p].prefix && h ? "@" + h.replace(/^@+/, "") : h;
  };
  function renderReview() {
    const f = form.elements;
    const plats = selectedPlatforms()
      .map((p) => `<span><svg aria-hidden="true"><use href="#i-${p}"/></svg>${esc(shownHandle(p))}</span>`)
      .join("");
    const addr = [f.ship_name.value, f.address_line1.value, f.address_line2.value, [f.city.value, f.region.value, f.postal_code.value].filter(Boolean).join(", "), f.address_country.value]
      .map((s) => s.trim())
      .filter(Boolean);
    const notes = f.notes.value.trim();
    $("#review").innerHTML = `
      <div class="rv-block"><div class="rv-top"><span class="mono">You</span><button type="button" class="rv-edit" data-edit="0" aria-label="Edit your details">Edit</button></div>
        <p><b>${esc(f["contact-name"].value)}</b></p>
        <p class="m">${esc(f.email.value)}${f.phone.value ? ` · ${esc(f.phone.value)}` : ""}</p></div>
      <div class="rv-block"><div class="rv-top"><span class="mono">Channels</span><button type="button" class="rv-edit" data-edit="1" aria-label="Edit your channels">Edit</button></div>
        <div class="rv-plats">${plats}</div></div>
      <div class="rv-block"><div class="rv-top"><span class="mono">Ships to</span><button type="button" class="rv-edit" data-edit="2" aria-label="Edit your shipping address">Edit</button></div>
        <p>${addr.map(esc).join("<br>")}</p>${notes ? `<p class="m">${esc(notes)}</p>` : ""}
        <p class="m">Tee size <b class="rv-size">${esc(f.tee_size.value)}</b></p></div>`;
    $$(".rv-edit", $("#review")).forEach((b) => b.addEventListener("click", () => show(+b.dataset.edit, -1)));
  }

  /* ---- save / restore ---- */
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        const data = { _step: current, _max: maxReached, _platforms: selectedPlatforms(), _own: ORDER.filter((p) => !linked.has(p)) };
        for (const el of form.elements) {
          if (!el.name || el.type === "hidden" || el.name === "bot-field") continue;
          if (el.type === "checkbox") data[el.name] = el.checked;
          else if (el.type === "radio") {
            if (el.checked) data[el.name] = el.value;
          } else data[el.name] = el.value;
        }
        localStorage.setItem(STORE_KEY, JSON.stringify(data));
        saveNote.textContent = "Saved on this device";
      } catch {
        saveNote.textContent = "";
      }
    }, 350);
  }
  function restore() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    } catch {
      data = null;
    }
    if (!data) return 0;
    for (const p of data._platforms || []) {
      const t = tiles.find((x) => x.dataset.p === p);
      if (t) $("input", t).checked = true;
    }
    for (const p of data._own || []) if (PLATFORMS[p]) linked.delete(p);
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("_")) continue;
      const el = form.elements[k];
      if (el instanceof RadioNodeList) {
        el.value = v ?? "";
        continue;
      }
      if (!el) continue;
      if (el.type === "checkbox") el.checked = !!v;
      else el.value = v ?? "";
    }
    maxReached = Math.min(3, data._max || 0);
    saveNote.textContent = "Picked up where you left off";
    return Math.min(3, data._step || 0);
  }

  /* ---- submit ---- */
  const MOCK = params.get("mockSubmit") || (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ? "1" : "");
  async function post(body) {
    if (MOCK) {
      await new Promise((r) => setTimeout(r, 900));
      if (MOCK === "fail") throw new Error("mock failure");
      return true;
    }
    const res = await fetch("/__forms.html", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  }
  async function send() {
    const err = $("#sendError");
    err.hidden = true;
    const sel = selectedPlatforms();
    form.elements.platforms.value = sel.join(",");
    const body = new URLSearchParams();
    for (const el of form.elements) {
      // usernames are added below, resolved per channel
      if (!el.name || el.dataset.handle || el.dataset.shared) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      body.append(el.name, el.value.trim());
    }
    for (const p of sel) body.append(`${p}_handle`, shownHandle(p));
    // the name the team sees first in the hub: the shared username, else the first channel's
    const first = sel[0] ? shownHandle(sel[0]).replace(/^@/, "") : "";
    body.append("creator_name", sharedUsers(sel).length ? cleanShared(shared.value) : first);
    if (!body.has("consent")) body.append("consent", "");
    btnNext.setAttribute("aria-busy", "true");
    btnNext.innerHTML = "Sending…";
    try {
      await post(body);
      try {
        localStorage.removeItem(STORE_KEY);
      } catch {
        /* ignore */
      }
      track("form_submit", { platforms: sel.join(","), count: sel.length, shared: sharedUsers(sel).length });
      success();
    } catch (e) {
      err.hidden = false;
      track("form_submit_error", { reason: String(e?.message || e).slice(0, 60) });
      btnNext.removeAttribute("aria-busy");
      btnNext.innerHTML = `Try again <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg>`;
      err.focus?.();
    }
  }
  function success() {
    const s = $("#success");
    const nm = (form.elements["contact-name"].value.split(" ")[0] || "").trim();
    $("#successName").textContent = nm ? `, ${nm}` : "";
    form.hidden = true;
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add("is-on"));
    s.focus({ preventScroll: true });
    card.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
  }

  // boot
  const startAt = restore();
  syncUsernames();
  syncTee();
  show(startAt, 1, true);
})();
