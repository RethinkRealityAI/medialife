/* MEDIALIFE x EVADE · creator crew landing page.
 *
 * Everything except the 3D stage (stage.js owns #dropStage). Sections:
 *   chrome (nav, reveal, mobile CTA) · hero keychain tilt · "activated" phone demo
 *   · stage hooks · gameplay video slot · onboarding form · analytics.
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
  hero.addEventListener("pointermove", (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const r = kc.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / innerWidth;
      const y = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      tilt.style.setProperty("--ry", `${(x * 22).toFixed(2)}deg`);
      tilt.style.setProperty("--rx", `${(-y * 14).toFixed(2)}deg`);
    });
  });
  hero.addEventListener("pointerleave", () => {
    tilt.style.setProperty("--ry", "0deg");
    tilt.style.setProperty("--rx", "0deg");
  });
})();

/* ---------------------------------------------------------------- how it comes alive */
// The retail display's activation demo, for EVADE: scan or tap → Cola Run opens → play and get rewarded.
(() => {
  const seq = $("#seq");
  if (!seq) return;
  const items = $$("#loopSteps li");
  const say = $("#seqSay");
  const LINES = ["Tapping the keychain on a phone", "Cola Run opens in the browser", "Playing Cola Run and unlocking a reward"];
  const DUR = [3000, 3400, 7200];
  let step = 0;
  let timer = 0;
  let auto = !REDUCED;
  let visible = false;

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
  items.forEach((li, k) => $("button", li).addEventListener("click", () => go(k, true)));
  new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible) go(REDUCED ? 2 : 0);
      else {
        clearTimeout(timer);
        pv?.pause();
      }
    },
    { threshold: 0.4 },
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
          if (!REDUCED) v.play().catch(() => (v.controls = true));
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
// Order matches the tiles. The follower count goes out as <platform>_audience (the field the UGC Hub import reads).
const PLATFORMS = {
  tiktok: { label: "TikTok", field: "TikTok handle", prefix: "@", ph: "yourhandle", audience: "Followers" },
  youtube: { label: "YouTube", field: "Channel @handle or URL", prefix: "", ph: "@yourchannel", audience: "Subscribers" },
  instagram: { label: "Instagram", field: "Instagram handle", prefix: "@", ph: "yourhandle", audience: "Followers" },
  twitch: { label: "Twitch", field: "Twitch username", prefix: "", ph: "yourchannel", audience: "Followers" },
  roblox: { label: "Roblox", field: "Roblox username", prefix: "", ph: "BoboFan123", audience: "Followers" },
  x: { label: "X", field: "X handle", prefix: "@", ph: "yourhandle", audience: "Followers" },
  discord: { label: "Discord", field: "Discord username", prefix: "", ph: "yourname", audience: "Server members" },
};
const ORDER = Object.keys(PLATFORMS);
const STORE_KEY = "evade-ugc-creator:v2";
const LABELS = ["About you", "Your platforms", "Shipping address", "Check and send"];

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
  if (!v) return `Add your ${PLATFORMS[p].field.replace(/^Channel /, "channel ")}.`;
  if (p === "instagram" || p === "x" || p === "tiktok") {
    if (!/^[A-Za-z0-9._]{1,30}$/.test(v)) return "Use letters, numbers, dots or underscores.";
  } else if (p === "youtube") {
    if (!/^@[A-Za-z0-9._-]{2,100}$/.test(v) && !/^(youtube\.com|youtu\.be)\/\S+$/i.test(v)) return "Use your @handle or paste the channel link.";
  } else if (p === "roblox") {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(v) && !/^roblox\.com\/\S+$/i.test(v)) return "Roblox usernames are 3 to 20 letters, numbers or underscores.";
  } else if (p === "twitch") {
    if (!/^[A-Za-z0-9_]{3,25}$/.test(v)) return "Twitch usernames are letters, numbers or underscores.";
  } else if (p === "discord") {
    if (!/^[A-Za-z0-9._#]{2,40}$/.test(v)) return "Use your Discord username, no spaces.";
  }
  return "";
}
/** "12.5k", "1,200", "1.2M" → "12,500" etc. Returns null when it isn't a count. */
function normaliseCount(raw) {
  const v = String(raw || "").trim().toLowerCase().replace(/\s+/g, "").replace(/^~/, "").replace(/\+$/, "");
  if (!v) return "";
  const m = v.match(/^(\d+(?:[.,]\d+)?)(k|m)$/);
  let n;
  if (m) n = parseFloat(m[1].replace(",", ".")) * (m[2] === "k" ? 1e3 : 1e6);
  else if (/^\d{1,3}([,.]\d{3})+$/.test(v) || /^\d+$/.test(v)) n = Number(v.replace(/[,.]/g, ""));
  else return null;
  if (!Number.isFinite(n) || n > 2e9) return null;
  return Math.round(n).toLocaleString("en-US");
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
  const panels = $("#platPanels");
  const tiles = $$(".ptile", form);
  const card = $("#joinCard");
  let current = 0;
  let maxReached = 0;
  let started = false;
  const touched = new Set();
  const panelCache = {};

  // utm + page context
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    if (params.get(k)) form.elements[k].value = params.get(k).slice(0, 120);
  }
  form.elements.page.value = location.pathname + (params.get("c") ? `?c=${params.get("c")}` : "");

  /* ---- platform panels ---- */
  function buildPanel(p) {
    if (panelCache[p]) return panelCache[p];
    const cfg = PLATFORMS[p];
    const el = document.createElement("div");
    el.className = "ppanel";
    el.dataset.p = p;
    el.innerHTML = `
      <div class="pp-head"><svg aria-hidden="true"><use href="#i-${p}"/></svg><b>${cfg.label}</b>
        <label class="pp-main"><input type="radio" name="main_platform" value="${p}" />Main platform</label></div>
      <div class="pp-row">
        <div class="field">
          <label for="h-${p}">${cfg.field}</label>
          <div class="ph-input${cfg.prefix ? "" : " no-pfx"}">${cfg.prefix ? `<span class="pfx" aria-hidden="true">${cfg.prefix}</span>` : ""}
            <input id="h-${p}" name="${p}_handle" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120" placeholder="${cfg.ph}" data-handle="${p}" aria-describedby="e-h-${p}" />
          </div>
          <p class="err" id="e-h-${p}"></p>
        </div>
        <div class="field">
          <label for="a-${p}">${cfg.audience}</label>
          <input id="a-${p}" name="${p}_audience" type="text" inputmode="decimal" autocomplete="off" maxlength="16" placeholder="e.g. 12.5K" data-count="${p}" aria-describedby="e-a-${p}" />
          <p class="err" id="e-a-${p}"></p>
        </div>
      </div>`;
    panelCache[p] = el;
    return el;
  }
  function selectedPlatforms() {
    return tiles.filter((t) => $("input", t).checked).map((t) => t.dataset.p);
  }
  function syncPanels(focusNew) {
    const sel = selectedPlatforms();
    tiles.forEach((t) => t.classList.toggle("is-on", $("input", t).checked));
    // keep DOM order = platform order; detach unselected panels (cached, so data survives a re-toggle)
    for (const p of ORDER) {
      const el = panelCache[p];
      if (sel.includes(p)) {
        const panel = buildPanel(p);
        if (!panel.isConnected) panels.appendChild(panel);
      } else if (el?.isConnected) el.remove();
    }
    ORDER.filter((p) => sel.includes(p)).forEach((p) => panels.appendChild(panelCache[p]));
    form.elements.platforms.value = sel.join(",");
    if (sel.length) setErr($("#e-platforms"), "");
    if (focusNew) $(`#h-${focusNew}`)?.focus({ preventScroll: true });
  }
  tiles.forEach((t) => {
    const cb = $("input", t);
    cb.addEventListener("change", () => {
      syncPanels(cb.checked ? t.dataset.p : null);
      if (cb.checked) {
        const panel = panelCache[t.dataset.p];
        panel.scrollIntoView({ block: "nearest", behavior: REDUCED ? "auto" : "smooth" });
      }
      save();
    });
  });

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
    const n = input.name;
    const v = input.value.trim();
    let msg = "";
    if (input.dataset.handle) {
      const p = input.dataset.handle;
      const norm = normaliseHandle(p, input.value);
      if (norm !== input.value) input.value = norm;
      msg = handleError(p, norm);
    } else if (input.dataset.count) {
      const c = normaliseCount(input.value);
      if (c) input.value = c;
      msg = c === "" ? (input.dataset.count === "discord" ? "" : "Add your follower count.") : c === null ? "Use a number, like 12500 or 12.5K." : "";
    } else if (n === "contact-name" || n === "ship_name") msg = v.length < 2 ? "Add your full name." : "";
    else if (n === "email") msg = !v ? "Add your email." : EMAIL.test(v) ? "" : "That email looks off. Check for typos.";
    else if (n === "phone") msg = v && !/^\+?[\d\s().-]{7,20}$/.test(v) ? "Use digits, with your country code (e.g. +44)." : "";
    else if (n === "country" || n === "address_country") msg = v ? "" : "Add your country.";
    else if (n === "address_line1") msg = v.length < 3 ? "Add your street address." : "";
    else if (n === "city") msg = v ? "" : "Add your city.";
    else if (n === "postal_code") msg = v ? "" : "Add your postal or ZIP code.";
    else if (n === "consent") msg = input.checked ? "" : "Tick this so we can contact you and ship your merch.";
    const errEl = $(`#${input.getAttribute("aria-describedby")?.split(" ").pop()}`);
    setErr(errEl, msg);
    if (input.type !== "checkbox") input.closest(".field")?.classList.toggle("is-ok", !msg && !!v);
    return !msg;
  }
  function validateStep(i) {
    let firstBad = null;
    const step = steps[i];
    let inputs = $$("input[name], select[name], textarea[name]", step).filter(
      (el) => el.type !== "hidden" && el.type !== "radio" && !el.closest(".hp") && el.tagName !== "SELECT" && el.name !== "notes" && el.name !== "address_line2" && el.name !== "region",
    );
    for (const el of inputs) {
      touched.add(el.name);
      if (!checkField(el) && !firstBad) firstBad = el;
    }
    if (i === 1) {
      const sel = selectedPlatforms();
      if (!sel.length) {
        setErr($("#e-platforms"), "Pick at least one platform.");
        firstBad = firstBad || $("input", tiles[0]);
      }
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
      if (!el.name || el.type === "hidden" || el.type === "radio" || el.tagName === "SELECT") return;
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
      const ok = el.dataset.handle ? !handleError(el.dataset.handle, normaliseHandle(el.dataset.handle, el.value)) : el.dataset.count ? !!normaliseCount(el.value) : checkFieldQuiet(el);
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
      if (!ac.value.trim()) ac.value = form.elements.country.value.trim();
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
      const firstInput = $("input:not([type=hidden]):not([type=checkbox]), select, textarea", steps[i]);
      if (i === 1) $("input", tiles.find((t) => !$("input", t).checked) || tiles[0]).focus({ preventScroll: true });
      else if (i === 3) $("legend", steps[i]).setAttribute("tabindex", "-1"), $("legend", steps[i]).focus({ preventScroll: true });
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
  // Enter in a text field advances (form submit does this natively); keep textarea newlines
  form.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.type === "checkbox" && e.target.closest(".ptile")) {
      e.preventDefault();
      e.target.click();
    }
  });

  /* ---- review ---- */
  function renderReview() {
    const f = form.elements;
    const sel = selectedPlatforms();
    const main = form.querySelector('input[name="main_platform"]:checked')?.value;
    const plats = sel
      .map((p) => {
        const h = f[`${p}_handle`]?.value || "";
        const shown = PLATFORMS[p].prefix && h ? "@" + h : h;
        const aud = panelCache[p]?.querySelector("[data-count]")?.value;
        return `<span class="${p === main ? "is-main" : ""}"><svg aria-hidden="true"><use href="#i-${p}"/></svg>${esc(shown)}${aud ? ` · ${esc(aud)}` : ""}${p === main ? " · main" : ""}</span>`;
      })
      .join("");
    const addr = [f.ship_name.value, f.address_line1.value, f.address_line2.value, [f.city.value, f.region.value, f.postal_code.value].filter(Boolean).join(", "), f.address_country.value]
      .map((s) => s.trim())
      .filter(Boolean);
    $("#review").innerHTML = `
      <div class="rv-block"><div class="rv-top"><span class="mono">You</span><button type="button" class="rv-edit" data-edit="0" aria-label="Edit your details">Edit</button></div>
        <p><b>${esc(f["contact-name"].value)}</b>${f.creator_name.value ? ` · ${esc(f.creator_name.value)}` : ""}</p>
        <p class="m">${esc(f.email.value)}${f.phone.value ? ` · ${esc(f.phone.value)}` : ""} · ${esc(f.country.value)}</p></div>
      <div class="rv-block"><div class="rv-top"><span class="mono">Platforms</span><button type="button" class="rv-edit" data-edit="1" aria-label="Edit your platforms">Edit</button></div>
        <div class="rv-plats">${plats}</div></div>
      <div class="rv-block"><div class="rv-top"><span class="mono">Ships to</span><button type="button" class="rv-edit" data-edit="2" aria-label="Edit your shipping address">Edit</button></div>
        <p>${addr.map(esc).join("<br>")}</p></div>`;
    $$(".rv-edit", $("#review")).forEach((b) => b.addEventListener("click", () => show(+b.dataset.edit, -1)));
  }

  /* ---- save / restore ---- */
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        const data = { _step: current, _max: maxReached, _platforms: selectedPlatforms() };
        for (const el of form.elements) {
          if (!el.name || el.type === "hidden" || el.name === "bot-field") continue;
          if (el.type === "radio") {
            if (el.checked) data[el.name] = el.value;
          } else if (el.type === "checkbox") data[el.name] = el.checked;
          else data[el.name] = el.value;
        }
        // panels that are detached still hold values; keep them
        for (const p of ORDER) {
          const pn = panelCache[p];
          if (pn && !pn.isConnected) {
            data[`${p}_handle`] = $("input[data-handle]", pn).value;
            data[`${p}_audience`] = $("[data-count]", pn).value;
          }
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
    if (!data) {
      if (!form.elements.country.value) form.elements.country.value = localeCountry();
      return 0;
    }
    for (const p of data._platforms || []) {
      const t = tiles.find((x) => x.dataset.p === p);
      if (t) $("input", t).checked = true;
    }
    syncPanels();
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("_")) continue;
      if (k === "main_platform") {
        const r = form.querySelector(`input[name="main_platform"][value="${CSS.escape(v)}"]`);
        if (r) r.checked = true;
        continue;
      }
      let el = form.elements[k];
      if (!el) {
        const p = k.split("_")[0];
        const pn = panelCache[p] || (PLATFORMS[p] ? buildPanel(p) : null);
        el = pn?.querySelector(`[name="${k}"]`);
      }
      if (!el || el instanceof RadioNodeList) continue;
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
      if (!el.name || el.disabled) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      let v = el.value;
      if (el.dataset.handle && PLATFORMS[el.dataset.handle].prefix && v) v = "@" + v.replace(/^@+/, "");
      body.append(el.name, v.trim ? v.trim() : v);
    }
    if (!body.has("main_platform")) body.append("main_platform", sel.length === 1 ? sel[0] : "");
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
      track("form_submit", { platforms: sel.join(","), count: sel.length, main: body.get("main_platform") || "" });
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
    const nm = (form.elements.creator_name.value || form.elements["contact-name"].value.split(" ")[0] || "").trim();
    $("#successName").textContent = nm ? `, ${nm}` : "";
    form.hidden = true;
    s.hidden = false;
    requestAnimationFrame(() => s.classList.add("is-on"));
    s.focus({ preventScroll: true });
    card.scrollIntoView({ block: "start", behavior: REDUCED ? "auto" : "smooth" });
  }

  // boot
  const startAt = restore();
  syncPanels();
  show(startAt, 1, true);
})();
