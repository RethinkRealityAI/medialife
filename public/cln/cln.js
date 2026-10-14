/* MEDIALIFE™ × cLaN — Activated Merchandise Partnership page.
   Static page: no build step. Submissions and uploads go straight to the SOW
   Supabase project (anon key = insert-only RLS on sow_submissions, and an
   insert-only policy on the private sow-uploads bucket under cln/). */
(() => {
  "use strict";

  const SB_URL = "https://zinvtbgzuurzadcupnro.supabase.co";
  const SB_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppbnZ0Ymd6dXVyemFkY3VwbnJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTg3OTksImV4cCI6MjA5MzIzNDc5OX0.zJrY7vG_EigmhyhlzbSt3bHPxMnEY-aBk-J4qAh-T3s";
  const BUCKET = "sow-uploads";
  const LS_KEY = "ml_sow_cln_activated_v1";
  const MAX_FILE = 100 * 1024 * 1024;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const money = (n, d = 0) =>
    "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const compact = (n) =>
    n >= 1e6
      ? "$" + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M"
      : n >= 1e3
        ? "$" + Math.round(n / 1e3) + "K"
        : money(n);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k) {
      try {
        return JSON.parse(localStorage.getItem(k));
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
        return true;
      } catch {
        return false;
      }
    },
    del(k) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* storage unavailable */
      }
    },
  };

  let toastT;
  function toast(html, ms = 2200) {
    const t = $("#toast");
    t.innerHTML = html;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), ms);
  }

  /* ── Count-up ───────────────────────────────────────────────────────── */
  function countUp(el) {
    if (el.dataset.done) return;
    el.dataset.done = "1";
    const to = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.dec || "0", 10);
    const sep = el.dataset.sep === "1";
    const fmt = (v) => (sep ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec));
    if (reduced) return void (el.textContent = fmt(to));
    const t0 = performance.now();
    const dur = 1400;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ── Reveal on scroll ───────────────────────────────────────────────── */
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        $$("[data-count]", e.target).forEach(countUp);
        if (e.target.matches("[data-count]")) countUp(e.target);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
  );
  $$(".rv, .cal, .journey, .record, .device, .h-deck").forEach((el) => io.observe(el));

  /* ── Nav, progress, active section ──────────────────────────────────── */
  const nav = $("#nav");
  const prog = $("#progress");
  const hero = $(".hero");
  const navLinks = $$(".nav-links a");
  const navTargets = navLinks.map((a) => $(a.getAttribute("href")));
  let ticking = false;
  function onScroll() {
    ticking = false;
    const y = scrollY;
    const navOn = y > hero.offsetHeight * 0.7;
    nav.classList.toggle("show", navOn);
    document.body.classList.toggle("nav-on", navOn);
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    let on = -1;
    navTargets.forEach((t, i) => {
      if (t && t.getBoundingClientRect().top < innerHeight * 0.4) on = i;
    });
    navLinks.forEach((a, i) => a.classList.toggle("on", i === on));
    const par = $("[data-parallax]");
    if (par && !reduced) {
      const r = par.parentElement.getBoundingClientRect();
      const k = parseFloat(par.dataset.parallax);
      par.style.transform = `translateY(${(r.top + r.height / 2 - innerHeight / 2) * -k}px)`;
    }
  }
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    },
    { passive: true },
  );
  onScroll();

  /* ── Hero pointer parallax ──────────────────────────────────────────── */
  if (!reduced && matchMedia("(pointer: fine)").matches) {
    const layers = $$(".hero [data-depth]");
    hero.addEventListener("pointermove", (e) => {
      const nx = e.clientX / innerWidth - 0.5;
      const ny = e.clientY / innerHeight - 0.5;
      layers.forEach((l) => {
        const d = parseFloat(l.dataset.depth);
        l.style.translate = `${nx * d}px ${ny * d * 0.5}px`;
      });
    });
  }

  /* ── 2027 calendar ──────────────────────────────────────────────────── */
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const CAL = [
    {
      row: "Evergreen core line",
      items: [{ s: 3, e: 12, c: "ev", t: "Always-on store · every VTuber" }],
    },
    {
      row: "Limited drops",
      items: [
        { s: 3, e: 3.8, c: "drop", t: "Launch drop" },
        { s: 6.3, e: 7.1, c: "drop", t: "Summer" },
        { s: 9.3, e: 10.4, c: "drop", t: "Halloween" },
        { s: 11, e: 11.85, c: "drop", t: "Holiday" },
      ],
    },
    {
      row: "Talent capsules",
      items: [
        { s: 4.1, e: 5.1, c: "season", t: "Birthday" },
        { s: 8, e: 9.2, c: "season", t: "Anniversary" },
        { s: 9.95, e: 10.95, c: "season", t: "Birthday" },
      ],
    },
    {
      row: "Convention exclusives",
      items: [
        { s: 4.8, e: 5.45, c: "con", t: "AN·KK" },
        { s: 6.03, e: 6.5, c: "con", t: "AX" },
        { s: 6.9, e: 7.55, c: "con", t: "AR*" },
        { s: 7.8, e: 8.3, c: "con", t: "NYC" },
      ],
    },
  ];
  (function buildCal() {
    const g = $("#calGrid");
    let h =
      '<div class="m" style="text-align:left">2027</div>' +
      MONTHS.map((m) => `<div class="m">${m}</div>`).join("");
    CAL.forEach((r, ri) => {
      h += `<div class="rowlbl">${r.row}</div><div class="cal-lane">`;
      r.items.forEach((it, i) => {
        h += `<span class="cal-bar k-${it.c}" title="${esc(it.t)}" style="left:${(it.s / 12) * 100}%;width:${((it.e - it.s) / 12) * 100}%;transition-delay:${0.15 * ri + 0.08 * i}s">${esc(it.t)}</span>`;
      });
      h += "</div>";
    });
    g.innerHTML = h;
    // On narrow screens, open the year at April — the launch — not an empty January.
    const sc = $("#calScroll");
    if (sc.scrollWidth > sc.clientWidth) sc.scrollLeft = 104 + 64 * 2.6;
  })();

  /* ── Activated loop: highlight one stop at a time ───────────────────── */
  (function loop() {
    const nodes = $$(".loop-node");
    let i = 0;
    const tick = () => {
      nodes.forEach((n, k) => n.classList.toggle("on", k === i));
      i = (i + 1) % nodes.length;
    };
    tick();
    if (!reduced) setInterval(tick, 1500);
  })();

  /* ── Map pins ↔ convention list ─────────────────────────────────────── */
  (function map() {
    const pins = $$(".pin");
    const items = $$(".con");
    const set = (i) => {
      pins.forEach((p) => p.classList.toggle("on", p.dataset.con === String(i)));
      items.forEach((c) => c.classList.toggle("on", c.dataset.con === String(i)));
    };
    [...pins, ...items].forEach((el) => {
      el.addEventListener("mouseenter", () => set(el.dataset.con));
      el.addEventListener("focus", () => set(el.dataset.con));
      el.addEventListener("click", () => set(el.dataset.con));
    });
    set(2);
  })();

  /* ── Track-record charts (redrawn from the store dashboards) ────────── */
  (function charts() {
    const C = [
      {
        what: "Collection A · launch window",
        amt: 133583.31,
        up: "1.5K%",
        rng: "Sep 26 – Oct 10, 2023",
        pts: [44, 30, 9, 6, 6.5, 4, 4.5, 3.5, 4, 3.6, 3.8, 4, 6, 12, 8],
      },
      {
        what: "Collection A · first 4 days",
        amt: 71575.71,
        up: "3.7K%",
        rng: "Sep 26 – 29, 2023",
        pts: [44, 40, 30, 18, 13, 12, 11, 9, 8, 7.5, 7.5, 8],
      },
      {
        what: "Collection B · first 5 days",
        amt: 206309.38,
        up: "2.2K%",
        rng: "Dec 1 – 5, 2023",
        pts: [140, 120, 70, 40, 28, 18, 15, 13, 11, 10, 9],
      },
      {
        what: "Collection B · launch window",
        amt: 353646.75,
        up: "850%",
        rng: "Dec 1 – 18, 2023",
        pts: [148, 60, 18, 12, 14, 10, 9, 8, 10, 9, 11, 14, 48, 22, 12, 9, 8, 7],
      },
    ];
    const W = 300,
      H = 92;
    $("#charts").innerHTML = C.map((c) => {
      const max = Math.max(...c.pts) * 1.08;
      const xy = c.pts.map((v, i) => [(i / (c.pts.length - 1)) * W, H - (v / max) * (H - 6) - 2]);
      const line = "M" + xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");
      return `<div class="chart">
        <div class="what">${c.what}</div>
        <div class="ttl" style="margin-top:8px"><span>Total sales</span><span aria-hidden="true">⌕</span></div>
        <div class="amt">${money(c.amt, 2)}<small>↗ ${c.up}</small></div>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="ar" d="${line} L${W},${H} L0,${H}Z"/><path class="ln" d="${line}"/></svg>
        <div class="rng">${c.rng}</div></div>`;
    }).join("");
  })();

  /* ── Revenue calculator ─────────────────────────────────────────────── */
  (function calc() {
    const ids = ["vt", "sku", "units", "aov"];
    const el = Object.fromEntries(ids.map((k) => [k, $("#c-" + k)]));
    const paint = (r) =>
      r.style.setProperty("--p", ((r.value - r.min) / (r.max - r.min)) * 100 + "%");
    function run() {
      ids.forEach((k) => paint(el[k]));
      const vt = +el.vt.value,
        sku = +el.sku.value,
        u = +el.units.value,
        aov = +el.aov.value;
      $("#o-vt").textContent = vt;
      $("#o-sku").textContent = sku;
      $("#o-units").textContent = u;
      $("#o-aov").textContent = "$" + aov;
      const units = vt * sku * u * 12;
      const gmv = units * aov;
      $("#r-units").textContent = units.toLocaleString("en-US");
      $("#r-gmv").textContent = compact(gmv);
      $("#r-share").textContent = compact(gmv * 0.2);
    }
    ids.forEach((k) => el[k].addEventListener("input", run));
    run();
  })();

  /* ══ STATEMENT OF WORK ════════════════════════════════════════════════ */
  const CATS = [
    "T-shirts",
    "Hoodies",
    "Acrylic keychains",
    "Acrylic standees",
    "Stickers",
    "Enamel pins",
    "Posters & prints",
    "Plushies",
    "Caps & beanies",
    "Jewelry",
    "Deskmats",
    "Specialty / limited",
  ];
  const CHANS = [
    "MEDIALIFE-operated cLaN store",
    "Convention booths",
    "Pop-ups & events",
    "Retail placement (future)",
  ];
  const CONS = [
    "Anime North · Toronto",
    "Kawaii Kon · Honolulu",
    "Anime Expo · Los Angeles",
    "Anime Revolution · Vancouver",
    "Anime NYC · New York",
  ];
  const PLATFORMS = ["YouTube", "Twitch", "TikTok", "X / Twitter", "Niconico", "Other"];
  const FIELDS = [
    "f-co",
    "f-name",
    "f-title",
    "f-email",
    "f-addr",
    "f-notes",
    "f-start",
    "f-launch",
    "f-sname",
    "f-stitle",
  ];

  const TERMS = [
    [
      "1. Scope",
      'MEDIALIFE™ will design, produce, sell and fulfil licensed merchandise for the participating cLaN Entertainment ("Client") VTubers and SKUs listed in this SOW, and develop the associated Activated Merchandise™ experiences. Additional VTubers, SKUs or services are added by written change order or by approval in the cLaN Hub.',
    ],
    [
      "2. License grant",
      "Client grants MEDIALIFE a non-transferable license, for the Term and Territory, to use the approved characters, names, logos and artwork of the participating VTubers solely to design, manufacture, market, sell and activate the approved SKUs. Whether the license is exclusive for merchandise in the Territory is set in the definitive license agreement. No other rights are granted, and the definitive agreement controls if it conflicts with this SOW.",
    ],
    [
      "3. Approvals & brand integrity",
      "Every design, sample, packaging, AR experience and marketing asset that uses Client IP requires Client's written approval (the cLaN Hub counts). Client will respond within five (5) business days; MEDIALIFE may follow up, and launch dates move with approval timing. Approved items may not be materially changed without re-approval.",
    ],
    [
      "4. Revenue share & reporting",
      'MEDIALIFE pays Client twenty percent (20%) of Net Merchandise Sales of licensed products. "Net Merchandise Sales" means gross sales, less sales taxes, shipping charges collected, refunds, returns and chargebacks; the final definition will be confirmed in the definitive agreement. MEDIALIFE provides monthly statements and live analytics in the cLaN Hub and pays quarterly, within thirty (30) days of each quarter end, in USD.',
    ],
    [
      "5. Audit",
      "Client may, once per year and on thirty (30) days' written notice, have an independent accountant review the records supporting revenue-share statements for the prior twenty-four (24) months. If an underpayment over 5% is found, MEDIALIFE pays it plus the reasonable cost of the review.",
    ],
    [
      "6. Costs & inventory",
      "MEDIALIFE bears all costs of design, sampling, production, inventory, AR development, e-commerce, fulfillment and customer service. Inventory is owned by MEDIALIFE, which carries the risk of unsold stock. Convention activations are planned and budgeted per event, subject to mutual approval.",
    ],
    [
      "7. Promotion",
      "Client will use reasonable efforts to have participating VTubers promote each launch and drop through their streams, social channels and community spaces, on a schedule agreed in the launch plan. Specific talent appearances are agreed per campaign.",
    ],
    [
      "8. Intellectual property",
      "Client and its talent retain all rights in their characters, likenesses, names and brand assets, and in any new artwork depicting them, which is assigned to (or exclusively licensed back to) Client on creation. MEDIALIFE retains all rights in its platform, activation technology, software, tooling and know-how. Each party may use the other's name and logo to describe the partnership, with approval.",
    ],
    [
      "9. Talent changes",
      "If a participating VTuber graduates, retires, is suspended or leaves Client, either party may remove that VTuber's SKUs from sale on written notice. MEDIALIFE will stop new production immediately and may sell through existing inventory for up to ninety (90) days unless Client requires an earlier takedown for reputational or legal reasons, in which case the parties will agree in good faith on the treatment of unsold stock.",
    ],
    [
      "10. Quality, safety & compliance",
      "MEDIALIFE is responsible for product quality, product safety and labelling compliance in the markets where it sells, and for consumer support, returns and refunds. MEDIALIFE will not use unauthorized third-party IP in any product.",
    ],
    [
      "11. Data & privacy",
      "Activated experiences use analytics to measure engagement (for example taps, session duration, interactions and outbound clicks). Personal data such as email opt-ins is collected only with consent, handled under applicable privacy law, and shared with Client for its talent's marketing where the fan has consented. MEDIALIFE does not sell personal data. This clause survives termination.",
    ],
    [
      "12. Confidentiality",
      "Each party will keep the other's non-public information — including sales data, talent plans, unreleased designs and commercial terms — confidential and use it only for this partnership. This obligation lasts three (3) years after termination.",
    ],
    [
      "13. Term & termination",
      "The Term is two (2) years from the first store launch, renewing for successive one-year periods unless either party gives ninety (90) days' notice. Either party may terminate for a material breach not cured within thirty (30) days of written notice. On expiry or termination MEDIALIFE may sell off existing approved inventory for ninety (90) days, paying the revenue share, unless otherwise agreed.",
    ],
    [
      "14. Warranties & liability",
      "Each party warrants it has authority to enter this SOW, and Client warrants it controls the rights it licenses. Except for breaches of confidentiality, IP infringement or indemnified claims, neither party is liable for indirect or consequential damages, and each party's total liability is capped at the revenue share paid or payable in the twelve (12) months before the claim.",
    ],
    [
      "15. Force majeure",
      "Neither party is liable for delays caused by events beyond its reasonable control, including natural disasters, government actions, carrier or supply-chain disruption, or the cancellation of a convention.",
    ],
    [
      "16. General",
      "This SOW, together with any executed change orders and the definitive license agreement, is the entire agreement on its subject. Amendments must be in writing and signed by both parties. Governed by the laws of the State of New York, USA.",
    ],
  ];

  const blankVt = () => ({
    id: Math.random().toString(36).slice(2, 9),
    name: "",
    handle: "",
    platform: "YouTube",
    url: "",
    links: "",
    debut: "",
    followers: "",
    lang: "",
    lore: "",
    brand: "",
    ideas: "",
    skus: [],
    files: [],
  });

  function newState() {
    return {
      v: 1,
      id:
        "SOW-CLN-" +
        Date.now().toString(36).slice(-4).toUpperCase() +
        Math.random().toString(36).slice(2, 5).toUpperCase(),
      created: new Date().toISOString(),
      fields: { "f-co": "cLaN Entertainment · Nippon TV Group" },
      sku: 4,
      cats: ["T-shirts", "Hoodies", "Acrylic keychains", "Stickers"],
      act: "NFC + QR",
      chans: ["MEDIALIFE-operated cLaN store", "Convention booths"],
      cons: CONS.slice(),
      roster: [blankVt(), blankVt(), blankVt()],
      brandFiles: [],
      sig: null,
      agree: false,
    };
  }
  let S = newState();

  /* ── Save / resume ──────────────────────────────────────────────────── */
  let saveT;
  function save(quiet) {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      collectFields();
      // Uploading/failed entries can't be resumed, so only finished files persist.
      const snap = JSON.parse(JSON.stringify(S));
      snap.roster.forEach((v) => (v.files = v.files.filter((f) => f.status === "ok")));
      snap.brandFiles = snap.brandFiles.filter((f) => f.status === "ok");
      snap.saved = Date.now();
      if (store.set(LS_KEY, snap) && !quiet) toast("<b>✓</b> Draft saved on this device", 1500);
      updateToc();
    }, 700);
  }
  function collectFields() {
    FIELDS.forEach((id) => (S.fields[id] = $("#" + id).value));
    S.agree = $("#f-agree").checked;
  }
  function applyFields() {
    FIELDS.forEach((id) => {
      if (S.fields[id] != null) $("#" + id).value = S.fields[id];
    });
    $("#f-agree").checked = !!S.agree;
  }

  /* ── Chips & segments ───────────────────────────────────────────────── */
  function chips(host, list, key) {
    host.innerHTML = list
      .map(
        (c) =>
          `<button type="button" class="chip" aria-pressed="${S[key].includes(c)}">${esc(c)}</button>`,
      )
      .join("");
    $$(".chip", host).forEach((b, i) =>
      b.addEventListener("click", () => {
        const v = list[i];
        const on = S[key].includes(v);
        S[key] = on ? S[key].filter((x) => x !== v) : [...S[key], v];
        b.setAttribute("aria-pressed", String(!on));
        save(true);
      }),
    );
  }
  function seg(host, key, num) {
    $$("button", host).forEach((b) =>
      b.addEventListener("click", () => {
        S[key] = num ? +b.dataset.v : b.dataset.v;
        syncSeg(host, key);
        scopeSummary();
        save(true);
      }),
    );
  }
  const syncSeg = (host, key) =>
    $$("button", host).forEach((b) =>
      b.setAttribute("aria-pressed", String(String(S[key]) === b.dataset.v)),
    );

  function scopeSummary() {
    const n = S.roster.length;
    $("#vtCount").textContent = n;
    $("#sumVt").textContent = n;
    $("#sumSku").textContent = S.sku;
    $("#sumTotal").textContent = n * S.sku;
    $("#commScope").textContent =
      `${n} VTuber${n === 1 ? "" : "s"} × ${S.sku} SKUs (${n * S.sku} SKUs) at launch`;
    $("#vtMinus").disabled = n <= 1;
    $("#vtPlus").disabled = n >= 15;
    $("#addVt").hidden = n >= 15;
    hubRefresh();
  }

  /* ── Roster ─────────────────────────────────────────────────────────── */
  const fileKind = (f) => (f.name.split(".").pop() || "file").slice(0, 4);
  const isImg = (t) => /^image\/(png|jpe?g|webp|gif)$/.test(t || "");
  const fmtSize = (b) =>
    b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
  const thumbs = new Map(); // file key → object URL (this session only)

  function vtCard(v, i, open) {
    const filled = [v.name, v.handle, v.url, v.lore].filter(Boolean).length;
    const skuChips = CATS.map(
      (c) =>
        `<button type="button" class="chip" data-sku="${esc(c)}" aria-pressed="${v.skus.includes(c)}">${esc(c)}</button>`,
    ).join("");
    const avImg = v.files.find((f) => thumbs.has(f.key));
    return `<details class="vt" data-i="${i}" ${open ? "open" : ""}>
      <summary>
        <span class="av" ${avImg ? `style="background-image:url('${thumbs.get(avImg.key)}')"` : ""}>${avImg ? "" : String(i + 1).padStart(2, "0")}</span>
        <span class="nm"><b>${esc(v.name) || "VTuber " + String(i + 1).padStart(2, "0")}</b><span>${v.handle ? esc(v.handle) + " · " : ""}${esc(v.platform)}</span></span>
        <span class="meter"><b>${v.files.filter((f) => f.status === "ok").length}</b> files · ${filled}/4 key details</span>
        <span class="chev" aria-hidden="true">⌄</span>
      </summary>
      <div class="vt-body">
        <div class="grid3" style="margin-top:16px">
          <label class="fld"><span>VTuber name<span class="req">*</span></span><input class="inp" data-k="name" value="${esc(v.name)}" placeholder="Stage name" /><span class="err">Please add a name.</span></label>
          <label class="fld"><span>Handle</span><input class="inp" data-k="handle" value="${esc(v.handle)}" placeholder="@handle" /></label>
          <label class="fld"><span>Primary platform</span><select class="inp" data-k="platform">${PLATFORMS.map((p) => `<option ${p === v.platform ? "selected" : ""}>${p}</option>`).join("")}</select></label>
          <label class="fld span2"><span>Main channel URL</span><input class="inp" data-k="url" type="url" inputmode="url" value="${esc(v.url)}" placeholder="https://youtube.com/@…" /></label>
          <label class="fld"><span>Other links</span><input class="inp" data-k="links" value="${esc(v.links)}" placeholder="X, TikTok, Discord…" /></label>
          <label class="fld"><span>Debut date</span><input class="inp" data-k="debut" type="date" value="${esc(v.debut)}" /></label>
          <label class="fld"><span>Followers (approx.)</span><input class="inp" data-k="followers" inputmode="numeric" value="${esc(v.followers)}" placeholder="e.g. 120K" /></label>
          <label class="fld"><span>Stream languages</span><input class="inp" data-k="lang" value="${esc(v.lang)}" placeholder="JP, EN" /></label>
          <label class="fld" style="grid-column:1/-1"><span>Persona &amp; lore</span><textarea class="inp" data-k="lore" placeholder="Personality, signature lines, running jokes, fan name, oshi mark, lore arcs…">${esc(v.lore)}</textarea></label>
          <label class="fld" style="grid-column:1/-1"><span>Brand guidelines — dos &amp; don'ts</span><textarea class="inp" data-k="brand" placeholder="Colours, poses or outfits to avoid, approval contacts…">${esc(v.brand)}</textarea></label>
          <label class="fld" style="grid-column:1/-1"><span>Product ideas &amp; fan favourites <span class="opt">(optional)</span></span><textarea class="inp" data-k="ideas" placeholder="Things fans ask for, past merch that sold well, upcoming milestones…">${esc(v.ideas)}</textarea></label>
        </div>
        <div class="sub-h" style="margin-top:20px">Preferred SKUs for this VTuber <span style="text-transform:none;letter-spacing:0;color:var(--dim);font-weight:500">(pick up to ${S.sku})</span></div>
        <div class="chips vt-skus">${skuChips}</div>
        <div class="sub-h">Assets</div>
        <div class="up" data-owner="${v.id}"></div>
        <div class="vt-actions">
          <span class="tiny">Model sheets, full-body art, expressions, logos, fonts, past merch — PNG, PSD, AI, PDF, ZIP, MP4.</span>
          ${S.roster.length > 1 ? `<button type="button" class="link-btn" data-remove>Remove this VTuber</button>` : ""}
        </div>
      </div>
    </details>`;
  }

  function renderRoster(openIdx) {
    const host = $("#roster");
    const opened = new Set($$(".vt[open]", host).map((d) => +d.dataset.i));
    if (openIdx != null) opened.add(openIdx);
    if (!host.children.length && openIdx == null) opened.add(0);
    host.innerHTML = S.roster.map((v, i) => vtCard(v, i, opened.has(i))).join("");
    $$(".vt", host).forEach((card) => {
      const i = +card.dataset.i;
      const v = S.roster[i];
      $$("[data-k]", card).forEach((inp) =>
        inp.addEventListener("input", () => {
          v[inp.dataset.k] = inp.value;
          if (
            inp.dataset.k === "name" ||
            inp.dataset.k === "handle" ||
            inp.dataset.k === "platform"
          ) {
            $(".nm b", card).textContent = v.name || "VTuber " + String(i + 1).padStart(2, "0");
            $(".nm span", card).textContent = (v.handle ? v.handle + " · " : "") + v.platform;
            if (v.name) inp.closest(".fld").classList.remove("bad");
            hubRefresh();
          }
          save(true);
        }),
      );
      $$(".vt-skus .chip", card).forEach((b) =>
        b.addEventListener("click", () => {
          const c = b.dataset.sku;
          if (v.skus.includes(c)) v.skus = v.skus.filter((x) => x !== c);
          else {
            if (v.skus.length >= S.sku)
              return toast(`Pick up to ${S.sku} — change "SKUs per VTuber" above for more`);
            v.skus.push(c);
          }
          b.setAttribute("aria-pressed", String(v.skus.includes(c)));
          save(true);
        }),
      );
      const rm = $("[data-remove]", card);
      if (rm)
        rm.addEventListener("click", () => {
          if (
            (v.name || v.files.length) &&
            !confirm(`Remove ${v.name || "this VTuber"} from the roster?`)
          )
            return;
          S.roster.splice(i, 1);
          renderRoster();
          scopeSummary();
          save();
        });
      mountUploader($(".up", card), v.files, v.id);
    });
  }

  function setCount(n) {
    n = Math.max(1, Math.min(15, n));
    if (n > S.roster.length) {
      while (S.roster.length < n) S.roster.push(blankVt());
      renderRoster(n - 1);
    } else if (n < S.roster.length) {
      const last = S.roster[S.roster.length - 1];
      if (
        (last.name || last.files.length) &&
        !confirm(`Remove ${last.name || "the last VTuber"} from the roster?`)
      )
        return;
      S.roster.pop();
      renderRoster();
    }
    scopeSummary();
    save(true);
  }

  /* ── Uploads → Supabase Storage (private bucket, insert-only) ───────── */
  function mountUploader(host, list, owner) {
    host.innerHTML = `<label class="drop">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21V6M10 12l6-6 6 6"/><path d="M5 20v5a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2v-5"/></svg>
        <b>Drop files here or browse</b><span>Up to 100 MB each · uploads start right away</span>
        <input type="file" multiple aria-label="Upload assets" />
      </label><ul class="files"></ul>`;
    const ul = $(".files", host);
    const drop = $(".drop", host);
    const input = $("input", host);
    const paint = () => (ul.innerHTML = list.map(fileRow).join(""));
    paint();
    const add = (files) => {
      for (const f of files) {
        if (f.size > MAX_FILE) {
          toast(`${esc(f.name)} is over 100 MB — share a link in the notes instead`, 3500);
          continue;
        }
        const key = Math.random().toString(36).slice(2, 10);
        const entry = {
          key,
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
          status: "up",
          p: 0,
          path: "",
        };
        if (isImg(f.type)) thumbs.set(key, URL.createObjectURL(f));
        list.push(entry);
        paint();
        upload(f, entry, owner, () => {
          paint();
          refreshMeters();
          save(true);
        });
      }
    };
    input.addEventListener("change", () => {
      add(input.files);
      input.value = "";
    });
    ["dragenter", "dragover"].forEach((t) =>
      drop.addEventListener(t, (e) => {
        e.preventDefault();
        drop.classList.add("over");
      }),
    );
    ["dragleave", "drop"].forEach((t) =>
      drop.addEventListener(t, () => drop.classList.remove("over")),
    );
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      add(e.dataTransfer.files);
    });
    ul.addEventListener("click", (e) => {
      const b = e.target.closest("[data-del]");
      if (!b) return;
      const idx = list.findIndex((f) => f.key === b.dataset.del);
      if (idx > -1) {
        const [f] = list.splice(idx, 1);
        f.removed = true;
      }
      paint();
      refreshMeters();
      save(true);
    });
    host._paint = paint;
  }
  function fileRow(f) {
    const th = thumbs.get(f.key);
    const st =
      f.status === "ok"
        ? "Uploaded"
        : f.status === "fail"
          ? "Upload failed — remove and try again"
          : `Uploading… ${f.p}%`;
    return `<li class="file ${f.status === "ok" ? "ok" : f.status === "fail" ? "fail" : ""}">
      <span class="th" ${th ? `style="background-image:url('${th}')"` : ""}>${th ? "" : esc(fileKind(f))}</span>
      <span class="nm"><b>${esc(f.name)}</b><small>${fmtSize(f.size)} · ${st}</small><span class="bar"><i style="--p:${f.status === "up" ? f.p : 100}%"></i></span></span>
      <button type="button" class="x" data-del="${f.key}" aria-label="Remove ${esc(f.name)}">×</button></li>`;
  }
  function upload(file, entry, owner, done) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-90);
    entry.path = `cln/${S.id}/${owner}/${Date.now()}-${safe}`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SB_URL}/storage/v1/object/${BUCKET}/${entry.path}`);
    xhr.setRequestHeader("apikey", SB_KEY);
    xhr.setRequestHeader("Authorization", "Bearer " + SB_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", entry.type);
    let last = 0;
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      entry.p = Math.round((e.loaded / e.total) * 100);
      if (entry.p - last >= 5) {
        last = entry.p;
        done();
      }
    };
    xhr.onload = () => {
      entry.status = xhr.status >= 200 && xhr.status < 300 ? "ok" : "fail";
      if (entry.status === "fail") console.warn("Upload failed", xhr.status, xhr.responseText);
      done();
    };
    xhr.onerror = () => {
      entry.status = "fail";
      done();
    };
    xhr.send(file);
  }
  function refreshMeters() {
    $$(".vt").forEach((card) => {
      const v = S.roster[+card.dataset.i];
      if (!v) return;
      const filled = [v.name, v.handle, v.url, v.lore].filter(Boolean).length;
      $(".meter", card).innerHTML =
        `<b>${v.files.filter((f) => f.status === "ok").length}</b> files · ${filled}/4 key details`;
      const img = v.files.find((f) => thumbs.has(f.key) && !f.removed);
      const av = $(".av", card);
      if (img) {
        av.style.backgroundImage = `url('${thumbs.get(img.key)}')`;
        av.textContent = "";
      }
    });
    hubRefresh();
  }
  const uploading = () =>
    [...S.brandFiles, ...S.roster.flatMap((v) => v.files)].some((f) => f.status === "up");

  /* ── Terms ──────────────────────────────────────────────────────────── */
  function renderTerms() {
    $("#terms").innerHTML = TERMS.map(
      ([h, p]) => `<details class="term"><summary>${esc(h)}</summary><p>${esc(p)}</p></details>`,
    ).join("");
    $("#expandTerms").addEventListener("click", (e) => {
      const all = $$(".term");
      const open = all.some((d) => !d.open);
      all.forEach((d) => (d.open = open));
      e.target.textContent = open ? "Collapse all" : "Expand all";
    });
  }

  /* ── Signature pad ──────────────────────────────────────────────────── */
  const pad = { c: null, ctx: null, drawing: false, dirty: false };
  function initPad() {
    pad.c = $("#padCanvas");
    pad.ctx = pad.c.getContext("2d");
    const size = () => {
      const r = pad.c.getBoundingClientRect();
      const d = devicePixelRatio || 1;
      const prev = pad.dirty ? pad.c.toDataURL() : S.sig;
      pad.c.width = r.width * d;
      pad.c.height = r.height * d;
      pad.ctx.setTransform(d, 0, 0, d, 0, 0);
      pad.ctx.lineWidth = 2.4;
      pad.ctx.lineCap = pad.ctx.lineJoin = "round";
      pad.ctx.strokeStyle = "#1a1a2e";
      if (prev) drawImg(prev);
    };
    const pos = (e) => {
      const r = pad.c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    pad.c.addEventListener("pointerdown", (e) => {
      pad.drawing = true;
      pad.c.setPointerCapture(e.pointerId);
      pad.ctx.beginPath();
      pad.ctx.moveTo(...pos(e));
      $("#padHint").hidden = true;
    });
    pad.c.addEventListener("pointermove", (e) => {
      if (!pad.drawing) return;
      pad.ctx.lineTo(...pos(e));
      pad.ctx.stroke();
      pad.dirty = true;
    });
    const end = () => {
      if (!pad.drawing) return;
      pad.drawing = false;
      if (pad.dirty) {
        S.sig = pad.c.toDataURL("image/png");
        stampDate();
        save(true);
      }
    };
    pad.c.addEventListener("pointerup", end);
    pad.c.addEventListener("pointercancel", end);
    $("#padClear").addEventListener("click", clearPad);
    $("#padType").addEventListener("click", () => {
      const name = $("#f-sname").value.trim() || prompt("Type your full name to sign");
      if (!name) return;
      if (!$("#f-sname").value) $("#f-sname").value = name;
      clearPad(true);
      const r = pad.c.getBoundingClientRect();
      pad.ctx.fillStyle = "#1a1a2e";
      pad.ctx.font = `italic 600 ${Math.min(46, r.width / (name.length * 0.5))}px "Barlow", cursive`;
      pad.ctx.textBaseline = "alphabetic";
      pad.ctx.fillText(name, 22, r.height - 44);
      pad.dirty = true;
      S.sig = pad.c.toDataURL("image/png");
      $("#padHint").hidden = true;
      stampDate();
      save(true);
    });
    new ResizeObserver(size).observe(pad.c);
  }
  function drawImg(src) {
    const im = new Image();
    im.onload = () => {
      const r = pad.c.getBoundingClientRect();
      pad.ctx.drawImage(im, 0, 0, r.width, r.height);
      $("#padHint").hidden = true;
      pad.dirty = true;
    };
    im.src = src;
  }
  function clearPad(keep) {
    pad.ctx.clearRect(0, 0, pad.c.width, pad.c.height);
    pad.dirty = false;
    if (keep !== true) {
      S.sig = null;
      $("#padHint").hidden = false;
      save(true);
    }
  }
  const today = () =>
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  function stampDate() {
    $("#f-sdate").value = today();
  }

  /* ── TOC progress ───────────────────────────────────────────────────── */
  const filled = (id) => ($("#" + id).value || "").trim().length > 0;
  function updateToc() {
    const done = {
      s1: filled("f-name") && filled("f-title") && /\S+@\S+\.\S+/.test($("#f-email").value),
      s2: S.cats.length > 0 && S.chans.length > 0,
      s3: S.roster.some((v) => v.name.trim()),
      s4: true,
      s5: true,
      s6: true,
      s7: true,
      s8: !!S.sig && filled("f-sname") && filled("f-stitle") && $("#f-agree").checked,
    };
    $$("#toc a").forEach((a) => a.classList.toggle("done", !!done[a.dataset.s]));
  }
  const tocIo = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting)
          $$("#toc a").forEach((a) => a.classList.toggle("on", a.dataset.s === e.target.id));
      }),
    { rootMargin: "-30% 0px -60% 0px" },
  );

  /* ── Validation & submit ────────────────────────────────────────────── */
  function validate() {
    const bad = [];
    const need = (id, ok) => {
      const f = $("#" + id).closest(".fld");
      f.classList.toggle("bad", !ok);
      if (!ok) bad.push(f);
    };
    need("f-name", filled("f-name"));
    need("f-title", filled("f-title"));
    need("f-email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($("#f-email").value.trim()));
    if (!S.roster.some((v) => v.name.trim())) {
      const card = $(".vt");
      card.open = true;
      const f = $('[data-k="name"]', card).closest(".fld");
      f.classList.add("bad");
      bad.push(f);
    }
    need("f-sname", filled("f-sname"));
    need("f-stitle", filled("f-stitle"));
    const msgs = [];
    if (!S.sig) msgs.push("Please sign in the signature box.");
    if (!$("#f-agree").checked) msgs.push("Please tick the confirmation box.");
    if (uploading()) msgs.push("Some files are still uploading — give them a moment.");
    if (bad.length) msgs.unshift("A few required details are missing (highlighted above).");
    const m = $("#formMsg");
    m.hidden = !msgs.length;
    m.textContent = msgs.join(" ");
    if (bad.length)
      bad[0].scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    return !msgs.length;
  }

  async function submit(e) {
    e.preventDefault();
    if ($("#hp").value) return; // honeypot
    collectFields();
    if (!validate()) return;
    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    const state = payload();
    try {
      const res = await fetch(`${SB_URL}/rest/v1/sow_submissions`, {
        method: "POST",
        headers: {
          apikey: SB_KEY,
          Authorization: "Bearer " + SB_KEY,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          client_name: S.fields["f-name"],
          client_email: S.fields["f-email"],
          package_name: `Activated Merchandise Partnership — ${S.roster.length} VTubers × ${S.sku} SKUs`,
          package_price: 0,
          vtubers: S.roster.map((v) => v.name).filter(Boolean),
          sow_date: S.fields["f-start"] || new Date().toISOString().slice(0, 10),
          signed_name: S.fields["f-sname"],
          signed_date: today(),
          full_state: state,
          status: "submitted",
        }),
      });
      if (!res.ok) throw new Error(res.status + " " + (await res.text()));
      S.submitted = new Date().toISOString();
      store.del(LS_KEY);
      $("#done").showModal();
    } catch (err) {
      console.error(err);
      save(true);
      const m = $("#formMsg");
      m.hidden = false;
      m.textContent =
        "We couldn't reach the server. Your progress is saved on this device — please try again, or email sofia@medialife.ai.";
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign & submit";
    }
  }
  function payload() {
    const files = (l) =>
      l
        .filter((f) => f.status === "ok")
        .map(({ name, size, type, path }) => ({ name, size, type, bucket: BUCKET, path }));
    return {
      sow_id: S.id,
      program: "Activated Merchandise Partnership",
      revenue_share_to_client: 0.2,
      client: {
        company: S.fields["f-co"],
        contact: S.fields["f-name"],
        title: S.fields["f-title"],
        email: S.fields["f-email"],
        address: S.fields["f-addr"],
      },
      scope: {
        vtubers: S.roster.length,
        skus_per_vtuber: S.sku,
        total_skus: S.roster.length * S.sku,
        categories: S.cats,
        activation: S.act,
        channels: S.chans,
        conventions: S.cons,
        notes: S.fields["f-notes"],
      },
      timeline: { agreement: S.fields["f-start"], launch: S.fields["f-launch"] },
      roster: S.roster.map((v) => ({ ...v, files: files(v.files) })),
      brand_files: files(S.brandFiles),
      signature: {
        name: S.fields["f-sname"],
        title: S.fields["f-stitle"],
        date: today(),
        image: S.sig,
      },
      medialife_signatory: "Sofia Gorenstein, Head of Corporate Development",
      source_url: location.href,
      user_agent: navigator.userAgent,
      submitted_at: new Date().toISOString(),
    };
  }

  /* ── PDF ────────────────────────────────────────────────────────────── */
  async function toDataUrl(src) {
    const im = new Image();
    im.src = src;
    await im.decode();
    const c = document.createElement("canvas");
    c.width = im.naturalWidth;
    c.height = im.naturalHeight;
    c.getContext("2d").drawImage(im, 0, 0);
    return c.toDataURL("image/png");
  }
  async function pdf() {
    collectFields();
    if (!window.jspdf) return toast("PDF tools are still loading — try again in a second");
    const { jsPDF } = window.jspdf;
    const d = new jsPDF({ unit: "pt", format: "letter" });
    const W = d.internal.pageSize.getWidth(),
      H = d.internal.pageSize.getHeight(),
      M = 50;
    let y = 0;
    const red = [230, 0, 18],
      gold = [168, 139, 90],
      ink = [20, 20, 22],
      grey = [110, 110, 110];
    const ensure = (h) => {
      if (y + h > H - 50) {
        d.addPage();
        y = 56;
      }
    };
    const text = (t, size = 10, color = ink, style = "normal", gap = 4) => {
      d.setFont("helvetica", style);
      d.setFontSize(size);
      d.setTextColor(...color);
      d.splitTextToSize(String(t || "—"), W - M * 2).forEach((ln) => {
        ensure(size + gap);
        d.text(ln, M, y);
        y += size + gap;
      });
    };
    const h2 = (t) => {
      y += 10;
      ensure(30);
      d.setFillColor(...red);
      d.rect(M, y - 10, 4, 14, "F");
      d.setFont("helvetica", "bold");
      d.setFontSize(12.5);
      d.setTextColor(...ink);
      d.text(t.toUpperCase(), M + 12, y + 1);
      y += 20;
    };
    const kv = (k, v) => {
      ensure(16);
      d.setFont("helvetica", "bold");
      d.setFontSize(9.5);
      d.setTextColor(...grey);
      d.text(k, M, y);
      d.setFont("helvetica", "normal");
      d.setTextColor(...ink);
      const lines = d.splitTextToSize(String(v || "—"), W - M * 2 - 150);
      d.text(lines, M + 150, y);
      y += Math.max(1, lines.length) * 13 + 3;
    };
    const bullet = (t) => {
      const lines = d.splitTextToSize(String(t), W - M * 2 - 14);
      ensure(lines.length * 13);
      d.setFillColor(...red);
      d.rect(M + 1, y - 6, 4, 4, "F");
      d.setFont("helvetica", "normal");
      d.setFontSize(10);
      d.setTextColor(...ink);
      d.text(lines, M + 12, y);
      y += lines.length * 13 + 2;
    };

    d.setFillColor(...red);
    d.rect(0, 0, W, 92, "F");
    d.setFillColor(10, 10, 11);
    d.rect(0, 92, W, 6, "F");
    d.setTextColor(255, 255, 255);
    d.setFont("helvetica", "bold");
    d.setFontSize(20);
    d.text("STATEMENT OF WORK", M, 44);
    d.setFont("helvetica", "normal");
    d.setFontSize(11);
    d.text("Activated Merchandise Partnership · cLaN Entertainment × MEDIALIFE™", M, 64);
    d.setFontSize(9);
    d.text(`${S.id}   ·   ${today()}`, M, 80);
    y = 128;

    h2("1. Overview & parties");
    text(
      "MEDIALIFE™ will build and operate an end-to-end Activated Merchandise™ program for cLaN Entertainment's participating VTubers — merchandise strategy and design, manufacturing, AR experiences, e-commerce, fulfillment, customer service, launch campaigns, convention activations and sales analytics — in exchange for a 20% revenue share to cLaN on merchandise sales.",
      10,
      ink,
      "normal",
      3.5,
    );
    y += 6;
    kv("Client", S.fields["f-co"]);
    kv(
      "Contact",
      [S.fields["f-name"], S.fields["f-title"], S.fields["f-email"]].filter(Boolean).join(" · "),
    );
    if (S.fields["f-addr"]) kv("Address", S.fields["f-addr"]);
    kv(
      "Service provider",
      "MEDIALIFE™ · Sofia Gorenstein, Head of Corporate Development · sofia@medialife.ai · Wilmington, Delaware, USA",
    );

    h2("2. Program scope");
    kv("VTubers × SKUs", `${S.roster.length} × ${S.sku} = ${S.roster.length * S.sku} launch SKUs`);
    kv("Categories", S.cats.join(", "));
    kv("Activation", S.act);
    kv("Sales channels", S.chans.join(", "));
    kv("2027 conventions", S.cons.join(", "));
    if (S.fields["f-notes"]) kv("Notes", S.fields["f-notes"]);

    h2("3. Talent roster & assets");
    S.roster.forEach((v, i) => {
      ensure(40);
      text(
        `${String(i + 1).padStart(2, "0")}  ${v.name || "(name pending)"}${v.handle ? "  ·  " + v.handle : ""}  ·  ${v.platform}`,
        10.5,
        ink,
        "bold",
        4,
      );
      const meta = [
        v.url,
        v.debut && "Debut " + v.debut,
        v.followers && v.followers + " followers",
        v.lang,
      ]
        .filter(Boolean)
        .join("  ·  ");
      if (meta) text(meta, 9.5, grey, "normal", 3);
      if (v.skus.length) text("Preferred SKUs: " + v.skus.join(", "), 9.5, ink, "normal", 3);
      const n = v.files.filter((f) => f.status === "ok").length;
      text(`Assets uploaded: ${n}`, 9.5, grey, "normal", 3);
      y += 4;
    });
    const nb = S.brandFiles.filter((f) => f.status === "ok").length;
    if (nb) text(`Shared brand assets uploaded: ${nb}`, 9.5, grey);

    h2("4. Deliverables & responsibilities");
    text("MEDIALIFE™ will deliver", 10, gold, "bold");
    $$("#s4 .dl-col:first-child li").forEach((li) => bullet(li.textContent.trim()));
    y += 4;
    text("cLaN Entertainment will provide", 10, gold, "bold");
    $$("#s4 .dl-col:last-child li").forEach((li) => bullet(li.textContent.trim()));

    h2("5. Timeline");
    if (S.fields["f-start"] || S.fields["f-launch"])
      kv(
        "Target dates",
        `Agreement ${S.fields["f-start"] || "TBC"} · Store launch ${S.fields["f-launch"] || "TBC"}`,
      );
    $$("#s5 .tl li").forEach((li) => {
      text($(".when", li).textContent, 9, gold, "bold", 3);
      text($("b", li).textContent + " — " + $("p", li).textContent, 10, ink, "normal", 3);
      y += 3;
    });

    h2("6. Commercial terms");
    $$("#s6 .comm tr").forEach((tr) => {
      const td = $("td", tr).cloneNode(true);
      $$(".flag", td).forEach((f) => f.replaceWith(" [to finalize] "));
      $$("br", td).forEach((br) => br.replaceWith(" "));
      kv($("th", tr).textContent, td.textContent.replace(/\s+/g, " ").trim());
    });

    h2("7. Terms & conditions");
    TERMS.forEach(([h, p]) => {
      ensure(48);
      text(h, 10, ink, "bold", 3);
      text(p, 9.5, [50, 50, 50], "normal", 3);
      y += 5;
    });

    h2("8. Signatures");
    ensure(170);
    const colW = (W - M * 2 - 20) / 2;
    const sy = y;
    d.setDrawColor(200);
    d.rect(M, sy, colW, 150);
    d.rect(M + colW + 20, sy, colW, 150);
    d.setFont("helvetica", "bold");
    d.setFontSize(9.5);
    d.setTextColor(...ink);
    d.text("cLaN ENTERTAINMENT · NIPPON TV GROUP", M + 10, sy + 16);
    d.text("MEDIALIFE™", M + colW + 30, sy + 16);
    if (S.sig)
      try {
        d.addImage(S.sig, "PNG", M + 10, sy + 24, colW - 20, 70);
      } catch {
        /* bad image */
      }
    try {
      d.addImage(
        await toDataUrl("assets/sofia-signature.png"),
        "PNG",
        M + colW + 30 + (colW - 20 - 80) / 2,
        sy + 22,
        80,
        70,
      );
    } catch {
      /* offline */
    }
    d.setFont("helvetica", "normal");
    d.setFontSize(9.5);
    d.text(
      [
        S.fields["f-sname"] || "Name: ________________",
        S.fields["f-stitle"] || "Title: ________________",
        S.sig ? "Date: " + ($("#f-sdate").value || today()) : "Date: ________________",
      ],
      M + 10,
      sy + 112,
    );
    d.text(
      ["Sofia Gorenstein", "Head of Corporate Development", "sofia@medialife.ai"],
      M + colW + 30,
      sy + 112,
    );

    const pages = d.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      d.setPage(i);
      d.setFontSize(8);
      d.setTextColor(...grey);
      d.text(`${S.id} · Confidential · Page ${i} of ${pages}`, M, H - 24);
      d.text("medialife.ai", W - M, H - 24, { align: "right" });
    }
    d.save(`${S.id}_cLaN-MEDIALIFE_Activated-Merchandise_SOW.pdf`);
  }

  /* ── cLaN Hub mock ──────────────────────────────────────────────────── */
  const HUB_IMGS = ["assets/hero-character.webp", "assets/clan-standee.webp"];
  const PRODUCT_IMGS = {
    Hoodie: "assets/hoodie.webp",
    Tee: "assets/flatlay.webp",
    Keychain: "assets/keychain.webp",
    Stickers: "assets/stickers.webp",
    Standee: "assets/clan-standee.webp",
  };
  let hubTab = "overview";
  const tname = (i) =>
    (S.roster[i] && S.roster[i].name.trim()) || "VTuber " + String(i + 1).padStart(2, "0");
  function hubPanels() {
    const n = Math.max(3, S.roster.length);
    const names = Array.from({ length: Math.min(n, 6) }, (_, i) => tname(i));
    const weeks = [22, 30, 26, 34, 31, 38, 52, 41, 44, 66, 58, 72];
    const act = [14, 19, 18, 24, 21, 27, 38, 31, 33, 49, 45, 57];
    const bars = weeks
      .map((h, i) => `<i style="--h:${h + 20}%;--i:${i}" title="Week ${i + 1}"></i>`)
      .join("");
    const abars = act.map((h, i) => `<i class="act" style="--h:${h + 20}%;--i:${i}"></i>`).join("");
    const share = [34, 26, 18, 12, 6, 4];
    const top = names
      .slice(0, 5)
      .map(
        (nm, i) =>
          `<div class="hbar"><span>${esc(nm)}</span><div><i style="--w:${share[i] * 2.6}%"></i></div><b>${share[i]}%</b></div>`,
      )
      .join("");
    const statuses = [
      ["Live", ""],
      ["Live", ""],
      ["Sampling", "y"],
      ["Design review", "b"],
      ["Awaiting assets", "r"],
      ["Awaiting assets", "r"],
    ];
    const talent = names
      .map((nm, i) => {
        const img = HUB_IMGS[i];
        return `<div class="tcard"><div class="tc-img ${img ? "" : "ph"}" ${img ? `style="background-image:url('${img}')"` : ""}>${img ? "" : "Upload art"}<span class="st ${statuses[i][1]}">${statuses[i][0]}</span></div>
        <div class="tc-b"><b>${esc(nm)}</b><span>${S.sku} SKUs · ${(S.roster[i] && S.roster[i].platform) || "YouTube"}</span>
        <div class="tc-row"><span>${["$48.2K", "$36.9K", "—", "—", "—", "—"][i]} sales</span><span>${["12.4K", "9.8K", "—", "—", "—", "—"][i]} taps</span></div></div></div>`;
      })
      .join("");
    const prods = [
      ["Hoodie", "Back-print hoodie", 0, "Live", "", 1240, 84320, "71%"],
      ["Keychain", "Holo acrylic keychain", 0, "Live", "", 2310, 41580, "64%"],
      ["Stickers", "Expression sticker sheet", 0, "Live", "", 3180, 31800, "58%"],
      ["Tee", "Washed graphic tee", 1, "Live", "", 960, 33600, "69%"],
      ["Standee", "Acrylic standee", 1, "Sampling", "y", 0, 0, "—"],
      ["Hoodie", "AX 2027 exclusive hoodie", 2, "Design review", "b", 0, 0, "—"],
    ];
    const prodRows = prods
      .map(
        (p) =>
          `<tr><td><span class="sku"><i style="background-image:url('${PRODUCT_IMGS[p[0]]}')"></i>${esc(p[1])}</span></td><td>${esc(tname(p[2]))}</td><td><span class="st ${p[4]}">${p[3]}</span></td><td class="num">${p[5] ? p[5].toLocaleString() : "—"}</td><td class="num">${p[6] ? money(p[6]) : "—"}</td><td class="num">${p[7]}</td></tr>`,
      )
      .join("");
    const gantt = [
      ["Spring launch drop", "0%", "22%", "var(--red)"],
      [`${tname(0)} birthday capsule`, "18%", "16%", "#b3125a"],
      ["Anime North + Kawaii Kon", "30%", "10%", "#1d8fb0"],
      ["Anime Expo exclusive", "48%", "12%", "#1d8fb0"],
      ["Summer drop", "56%", "18%", "var(--red)"],
      ["Anime NYC exclusive", "84%", "12%", "#1d8fb0"],
    ]
      .map(
        (g) =>
          `<div class="g"><span>${esc(g[0])}</span><div><i style="--l:${g[1]};--w:${g[2]};--bgc:${g[3]}"></i></div></div>`,
      )
      .join("");
    const assets = [
      ["assets/hero-character.webp", "Key art — full body.png", "Approved", ""],
      ["assets/sketch.webp", "Hoodie back — sketch v2", "Approved", ""],
      ["assets/hoodie.webp", "Hoodie — sample photo", "Needs review", "y"],
      ["assets/stickers.webp", "Sticker sheet — final", "Approved", ""],
      ["assets/keychain.webp", "Keychain — holo proof", "Needs review", "y"],
      ["assets/ar-phone.webp", "AR scene — wave + CTA", "In build", "b"],
      ["assets/clan-standee.webp", "Standee — print file", "Approved", ""],
    ]
      .map(
        (a) =>
          `<div class="asset"><div class="ai" style="background-image:url('${a[0]}')"><span class="st ${a[3]}">${a[2]}</span></div><div class="ab"><b>${esc(a[1])}</b><span>${esc(tname(0))}</span></div></div>`,
      )
      .join("");

    return {
      overview: `<div class="app-top"><div><h4>Program overview</h4><span>Last 90 days · all talent</span></div><span class="app-chip">Q2 2027 ▾</span></div>
        <div class="kpis"><div class="kpi"><div class="k">Net merch sales</div><div class="v">$184.2K</div><div class="d">▲ 31% vs last qtr</div></div><div class="kpi"><div class="k">cLaN revenue share</div><div class="v">$36.8K</div><div class="d">▲ 31%</div></div><div class="kpi"><div class="k">AR activations</div><div class="v">41.9K</div><div class="d">64% of units</div></div><div class="kpi"><div class="k">Visits sent to channels</div><div class="v">18.6K</div><div class="d">▲ 12%</div></div></div>
        <div class="two"><div class="box"><h5>Weekly sales vs activations <span>■ sales ■ taps</span></h5><div class="bars">${bars}</div><div class="bars" style="height:60px;margin-top:6px">${abars}</div></div><div class="box"><h5>Sales by VTuber</h5>${top}</div></div>`,
      talent: `<div class="app-top"><div><h4>Talent</h4><span>${n} VTubers in the program</span></div><span class="app-chip">+ Add talent</span></div><div class="talent-grid">${talent}</div>`,
      campaigns: `<div class="app-top"><div><h4>Campaigns &amp; activations</h4><span>Mar – Aug 2027</span></div><span class="app-chip">+ New campaign</span></div>
        <div class="box"><h5>Timeline <span>Mar · Apr · May · Jun · Jul · Aug</span></h5><div class="gantt">${gantt}</div></div>
        <div class="kpis" style="margin-top:10px;margin-bottom:0"><div class="kpi"><div class="k">Active campaigns</div><div class="v">3</div></div><div class="kpi"><div class="k">Awaiting cLaN approval</div><div class="v">2</div></div><div class="kpi"><div class="k">AR experiences live</div><div class="v">7</div></div><div class="kpi"><div class="k">Next launch</div><div class="v">12 days</div></div></div>`,
      products: `<div class="app-top"><div><h4>Products</h4><span>${n * S.sku} SKUs planned · 4 live</span></div><span class="app-chip">Filter: all talent ▾</span></div>
        <div class="box tbl-scroll"><table class="tbl"><thead><tr><th>SKU</th><th>Talent</th><th>Status</th><th style="text-align:right">Units</th><th style="text-align:right">Sales</th><th style="text-align:right">Activation</th></tr></thead><tbody>${prodRows}</tbody></table></div>`,
      assets: `<div class="app-top"><div><h4>Asset library</h4><span>Art, proofs, samples &amp; AR scenes — with approvals</span></div><span class="app-chip">2 need your review</span></div>
        <div class="assets">${assets}<div class="drop-zone-mock">＋<br/>Drop new art</div></div>`,
      analytics: `<div class="app-top"><div><h4>Analytics</h4><span>Commerce + engagement on one report</span></div><span class="app-chip">Export CSV</span></div>
        <div class="two"><div class="box"><h5>Merch → channel funnel <span>last 90 days</span></h5><div class="funnel"><div style="--w:100%"><span>Store &amp; booth visits</span><b>212,400</b></div><div style="--w:72%"><span>Units sold</span><b>6,540</b></div><div style="--w:56%"><span>Products activated</span><b>4,186</b></div><div style="--w:44%"><span>Visits sent to VTuber channels</span><b>18,612</b></div><div style="--w:30%"><span>Fan list opt-ins</span><b>3,904</b></div></div></div>
        <div class="box"><h5>Demand by region</h5><div class="hbar"><span>California</span><div><i style="--w:88%"></i></div><b>22%</b></div><div class="hbar"><span>Ontario</span><div><i style="--w:62%"></i></div><b>15%</b></div><div class="hbar"><span>New York</span><div><i style="--w:54%"></i></div><b>13%</b></div><div class="hbar"><span>Texas</span><div><i style="--w:40%"></i></div><b>10%</b></div><div class="hbar"><span>British Columbia</span><div><i style="--w:34%"></i></div><b>8%</b></div><div class="hbar"><span>Other</span><div><i style="--w:100%"></i></div><b>32%</b></div></div></div>
        <div class="kpis" style="margin-top:10px;margin-bottom:0"><div class="kpi"><div class="k">Avg. time in AR</div><div class="v">3:05</div></div><div class="kpi"><div class="k">Repeat taps / unit</div><div class="v">4.8</div></div><div class="kpi"><div class="k">Sell-through</div><div class="v">68%</div></div><div class="kpi"><div class="k">Avg. order value</div><div class="v">$46</div></div></div>`,
      payouts: `<div class="app-top"><div><h4>Revenue share</h4><span>20% of net merchandise sales</span></div><span class="app-chip">Download statement</span></div>
        <div class="kpis"><div class="kpi"><div class="k">Paid to date</div><div class="v">$29.4K</div></div><div class="kpi"><div class="k">This quarter (accruing)</div><div class="v">$36.8K</div></div><div class="kpi"><div class="k">Next payout</div><div class="v">Jul 30</div></div><div class="kpi"><div class="k">Units sold to date</div><div class="v">11.9K</div></div></div>
        <div class="box tbl-scroll"><table class="tbl"><thead><tr><th>Period</th><th style="text-align:right">Net sales</th><th style="text-align:right">cLaN 20%</th><th>Status</th></tr></thead><tbody>
        <tr><td>Q2 2027 (to date)</td><td class="num">$184,210</td><td class="num">$36,842</td><td><span class="st y">Accruing</span></td></tr>
        <tr><td>Apr 2027 — launch month</td><td class="num">$147,050</td><td class="num">$29,410</td><td><span class="st">Paid</span></td></tr>
        </tbody></table></div>`,
    };
  }
  function hubRender() {
    const panels = hubPanels();
    $("#appMain").innerHTML = Object.entries(panels)
      .map(
        ([k, h]) =>
          `<div class="panel ${k === hubTab ? "on" : ""}" role="tabpanel" id="p-${k}" aria-labelledby="t-${k}">${h}</div>`,
      )
      .join("");
    $("#talentCount").textContent = Math.max(3, S.roster.length);
  }
  let hubT;
  function hubRefresh() {
    clearTimeout(hubT);
    hubT = setTimeout(hubRender, 250);
  }
  function initHub() {
    const tabs = $$(".app-tab");
    tabs.forEach((t) =>
      t.addEventListener("click", () => {
        hubTab = t.id.slice(2);
        tabs.forEach((x) => x.setAttribute("aria-selected", String(x === t)));
        $$(".panel").forEach((p) => p.classList.toggle("on", p.id === "p-" + hubTab));
      }),
    );
    $(".app-side").addEventListener("keydown", (e) => {
      if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const n =
        tabs[
          (i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : tabs.length - 1)) %
            tabs.length
        ];
      n.focus();
      n.click();
    });
    hubRender();
  }

  /* ── Boot ───────────────────────────────────────────────────────────── */
  function renderAll() {
    applyFields();
    chips($("#catChips"), CATS, "cats");
    chips($("#chanChips"), CHANS, "chans");
    chips($("#conChips"), CONS, "cons");
    syncSeg($("#skuSeg"), "sku");
    syncSeg($("#actSeg"), "act");
    renderRoster();
    mountUploader($('.up[data-owner="brand"]'), S.brandFiles, "brand");
    $("#sowId").textContent = S.id;
    if (S.sig) (drawImg(S.sig), stampDate());
    scopeSummary();
    updateToc();
  }

  function boot() {
    $("#sowDate").textContent = today();
    renderTerms();
    seg($("#skuSeg"), "sku", true);
    seg($("#actSeg"), "act");
    $("#vtMinus").addEventListener("click", () => setCount(S.roster.length - 1));
    $("#vtPlus").addEventListener("click", () => setCount(S.roster.length + 1));
    $("#addVt").addEventListener("click", () => setCount(S.roster.length + 1));
    FIELDS.forEach((id) =>
      $("#" + id).addEventListener("input", () => {
        $("#" + id)
          .closest(".fld")
          ?.classList.remove("bad");
        save(true);
      }),
    );
    $("#f-agree").addEventListener("change", () => save(true));
    $("#sowForm").addEventListener("submit", submit);
    $("#pdfBtn").addEventListener("click", pdf);
    $("#pdfBtn2").addEventListener("click", pdf);
    $("#donePdf").addEventListener("click", pdf);
    $("#doneClose").addEventListener("click", () => $("#done").close());
    $$(".card").forEach((c) => tocIo.observe(c));
    initPad();
    initHub();
    renderAll();

    const saved = store.get(LS_KEY);
    if (saved && saved.v === 1 && !saved.submitted && saved.saved) {
      $("#resumeWhen").textContent = new Date(saved.saved).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      $("#resume").classList.add("show");
      $("#resumeYes").addEventListener("click", () => {
        S = Object.assign(newState(), saved);
        S.roster.forEach((v) => (v.files = v.files || []));
        renderAll();
        $("#resume").classList.remove("show");
        toast("<b>✓</b> Draft restored");
      });
      $("#resumeNo").addEventListener("click", () => {
        store.del(LS_KEY);
        $("#resume").classList.remove("show");
      });
    }
  }
  boot();
})();
