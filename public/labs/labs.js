/* MEDIALIFE Labs catalogue: renders /labs/catalog.json with search, faceted
   filters, section jump links and shareable URL params
   (?q=&client=&cat=&tech=&status=&year=, comma-separated, OR within a group,
   AND across groups). Entry shape and tag values: public/labs/README.md. */
(function () {
  "use strict";

  var LABELS = {
    cat: {
      anime: "Anime", sports: "Sports", gaming: "Gaming", comics: "Comics", beverage: "Beverage",
      apparel: "Apparel", print: "Print", packaging: "Packaging", streaming: "Streaming", events: "Events",
      agency: "Agency", showcase: "Showcase", "tech-demo": "Tech demo", collectibles: "Collectibles",
      "3d-character": "3D character", capture: "Photo & video", game: "Game", "live-data": "Live data"
    },
    tech: {
      "image-target": "Image target", world: "Place in room", face: "Face", sky: "Sky",
      "web-3d": "Web 3D", mattercraft: "Mattercraft", cms: "Studio / CMS"
    },
    status: { live: "Live", preview: "Preview", lab: "Lab", archive: "Archive" },
    tested: { phone: "Tested on phone", simulator: "Tested in simulator", "not yet": "Not tested yet" }
  };
  var STATUS_ORDER = { live: 0, preview: 1, lab: 2, archive: 3 };
  var GROUPS = [
    { key: "client", title: "Client", get: function (e) { return [e.client]; } },
    { key: "cat", title: "Category", get: function (e) { return e.categories || []; } },
    { key: "tech", title: "Tech", get: function (e) { return e.tech || []; } },
    { key: "status", title: "Status", get: function (e) { return [e.status]; } },
    { key: "year", title: "Year", get: function (e) { return e.year ? [String(e.year)] : []; } }
  ];
  /* Page sections: each entry lands in the first one that matches. */
  var SECTIONS = [
    { id: "mattercraft", title: "Mattercraft tests", short: "Mattercraft", note: "Plain three.js copies running the same code as the Mattercraft components.", test: function (e) { return has(e.tech, "mattercraft"); } },
    { id: "demos", title: "Tech demos", note: "Place-in-room and face building blocks, ready to brand for a client.", test: function (e) { return has(e.categories, "tech-demo"); } },
    { id: "evade", title: "EVADE", note: "Activated merch for EVADE: the keychain, the tees and Bobo's world.", test: function (e) { return e.client === "EVADE"; } },
    { id: "netflix", title: "Netflix", note: "Sakamoto Days campaign and event activations.", test: function (e) { return e.client === "Netflix"; } },
    { id: "animebae", title: "Animebae", note: "Anime apparel and prints that come alive.", test: function (e) { return e.client === "Animebae"; } },
    { id: "sports", title: "Sports", note: "Teams and sports media.", test: function (e) { return e.client === "Brooklyn Nets" || e.client === "Sport Magazine"; } },
    { id: "medialife", title: "MEDIALIFE originals", short: "MEDIALIFE", note: "Our own showcases, events and comics.", test: function (e) { return e.client === "MEDIALIFE"; } },
    { id: "brands", title: "Brands & agencies", short: "Brands", note: "Agency, beverage, comics and gaming clients.", test: function () { return true; } }
  ];
  var ORDER = ["featured", "evade", "netflix", "animebae", "sports", "brands", "medialife", "demos", "mattercraft"];

  var IS_PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  var $ = function (id) { return document.getElementById(id); };
  var data = [];
  var state = { q: "", client: [], cat: [], tech: [], status: [], year: [] };

  function has(list, v) { return (list || []).indexOf(v) !== -1; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function label(group, v) {
    if (group === "client" || group === "year") return v;
    return (LABELS[group] && LABELS[group][v]) || v;
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  /* ---------- URL <-> state ---------- */
  function readURL() {
    var p = new URLSearchParams(location.search);
    state.q = p.get("q") || "";
    GROUPS.forEach(function (g) {
      var raw = (p.get(g.key) || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      // Match case-insensitively against the values the catalogue really has.
      var known = values(g);
      state[g.key] = raw.map(function (r) {
        var hit = known.filter(function (k) { return norm(k) === norm(r) || norm(label(g.key, k)) === norm(r); })[0];
        return hit || null;
      }).filter(Boolean);
    });
  }
  function writeURL() {
    var p = new URLSearchParams();
    if (state.q.trim()) p.set("q", state.q.trim());
    GROUPS.forEach(function (g) { if (state[g.key].length) p.set(g.key, state[g.key].join(",")); });
    var qs = p.toString().replace(/%2C/g, ",").replace(/%20/g, "+");
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }

  /* ---------- Filtering ---------- */
  function haystack(e) {
    var parts = [e.title, e.lead, e.client, e.slug, e.year, e.status, label("status", e.status)];
    (e.categories || []).forEach(function (c) { parts.push(c, label("cat", c)); });
    (e.tech || []).forEach(function (t) { parts.push(t, label("tech", t)); });
    (e.notes || []).forEach(function (n) { parts.push(n); });
    return norm(parts.join(" "));
  }
  function matchesQuery(e) {
    var q = norm(state.q).trim();
    if (!q) return true;
    return q.split(/\s+/).every(function (t) { return e._h.indexOf(t) !== -1; });
  }
  function matches(e, skip) {
    if (!matchesQuery(e)) return false;
    return GROUPS.every(function (g) {
      if (g.key === skip || !state[g.key].length) return true;
      var vals = g.get(e);
      return state[g.key].some(function (v) { return vals.indexOf(v) !== -1; });
    });
  }
  function values(g) {
    var counts = {};
    data.forEach(function (e) { g.get(e).forEach(function (v) { counts[v] = (counts[v] || 0) + 1; }); });
    var keys = Object.keys(counts);
    if (g.key === "year") return keys.sort().reverse();
    if (g.key === "status") return keys.sort(function (a, b) { return (STATUS_ORDER[a] || 9) - (STATUS_ORDER[b] || 9); });
    if (g.key === "tech") { var o = Object.keys(LABELS.tech); return keys.sort(function (a, b) { return o.indexOf(a) - o.indexOf(b); }); }
    return keys.sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });
  }
  function activeCount() {
    return GROUPS.reduce(function (n, g) { return n + state[g.key].length; }, 0) + (state.q.trim() ? 1 : 0);
  }

  /* ---------- Rendering: filter panel ---------- */
  function renderChips() {
    var html = GROUPS.map(function (g) {
      var vals = values(g);
      var chips = vals.map(function (v) {
        var n = data.filter(function (e) { return matches(e, g.key) && g.get(e).indexOf(v) !== -1; }).length;
        var on = has(state[g.key], v);
        return '<button type="button" class="chip' + (n || on ? "" : " zero") + '" data-g="' + g.key + '" data-v="' + esc(v) +
          '" aria-pressed="' + on + '">' + esc(label(g.key, v)) + ' <span class="c" aria-label="' + n + ' results">' + n + "</span></button>";
      }).join("");
      return '<fieldset class="grp"><legend class="grp-t">' + g.title + '</legend><div class="chips">' + chips + "</div></fieldset>";
    }).join("");
    $("groups").innerHTML = html;
  }

  /* ---------- Rendering: cards ---------- */
  var QR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/></g><g fill="currentColor"><rect x="14" y="14" width="3" height="3"/><rect x="17.5" y="17.5" width="3" height="3"/><rect x="14" y="18.5" width="2" height="2"/><rect x="18.5" y="14" width="2" height="2"/><rect x="6" y="6" width="1.6" height="1.6"/><rect x="16.4" y="6" width="1.6" height="1.6"/><rect x="6" y="16.4" width="1.6" height="1.6"/></g></svg>';

  function card(e, i, prefix) {
    var acc = i % 2 ? "m" : "b";
    var id = prefix + "-" + e.slug;
    var tags = (e.tech || []).map(function (t) {
      return '<li><button type="button" class="tag tech" data-g="tech" data-v="' + esc(t) + '" aria-pressed="' + has(state.tech, t) +
        '" aria-label="Filter by ' + esc(label("tech", t)) + '">' + esc(label("tech", t)) + "</button></li>";
    }).concat((e.categories || []).map(function (c) {
      return '<li><button type="button" class="tag" data-g="cat" data-v="' + esc(c) + '" aria-pressed="' + has(state.cat, c) +
        '" aria-label="Filter by ' + esc(label("cat", c)) + '">' + esc(label("cat", c)) + "</button></li>";
    })).join("");
    var notes = (e.notes || []).map(function (n) { return '<span class="note">' + esc(n) + "</span>"; }).join("");
    var tested = e.tested === "phone" ? "ts-phone" : e.tested === "simulator" ? "ts-sim" : "ts-no";
    var extra = (e.extraLinks || []).map(function (l) {
      return '<a class="btn ghost" href="' + esc(l.url) + '">' + esc(l.label) + "</a>";
    }).join("");
    var qr = IS_PHONE ? "" :
      '<button type="button" class="btn qr" aria-expanded="false" aria-controls="qr-' + id + '" data-url="' + esc(e.url) +
      '" aria-label="Open ' + esc(e.title) + ' on your phone" title="Open on your phone">' + QR_ICON + "</button>" +
      '<div class="qrpop" id="qr-' + id + '" role="dialog" aria-label="Open ' + esc(e.title) + ' on your phone" hidden>' +
      '<div class="qr-box"></div><p>Scan with your phone camera to open it.</p><code></code></div>';
    var alt = e.alt || e.title;
    return '<article class="card" data-acc="' + acc + '" aria-labelledby="t-' + id + '">' +
      '<a class="thumb" href="' + esc(e.url) + '" tabindex="-1" aria-hidden="true">' +
      (e.thumb ? '<img src="' + esc(e.thumb) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async" width="640" height="360" data-title="' + esc(e.title) + '" data-client="' + esc(e.client) + '">' : ph(e)) +
      "</a>" +
      '<div class="body">' +
      '<div class="meta"><span class="client">' + esc(e.client) + "</span>" +
      '<span class="pillx st-' + esc(e.status) + '">' + esc(label("status", e.status)) + "</span>" +
      '<span class="pillx ' + tested + '">' + esc(LABELS.tested[e.tested] || "Not tested yet") + "</span></div>" +
      '<h3 id="t-' + id + '">' + esc(e.title) + "</h3>" +
      '<p class="lead">' + esc(e.lead) + "</p>" +
      '<ul class="tags" aria-label="Tags">' + tags + "</ul>" +
      (notes ? '<div class="tags">' + notes + "</div>" : "") +
      (e.source ? '<p class="src">Source: <code>' + esc(e.source) + "</code></p>" : "") +
      '<div class="actions"><a class="btn primary" href="' + esc(e.url) + '">Open it</a>' + extra + qr + "</div>" +
      "</div></article>";
  }
  function ph(e) {
    return '<div class="ph"><b>' + esc(e.title) + "</b><span>" + esc(e.client) + "</span></div>";
  }

  function sortEntries(list) {
    return list.slice().sort(function (a, b) {
      return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) ||
        (STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9) ||
        (b.year || 0) - (a.year || 0) || a._i - b._i;
    });
  }

  function render() {
    var shown = data.filter(function (e) { return matches(e); });
    var filtered = activeCount() > 0;
    var buckets = {};
    shown.forEach(function (e) {
      var s = SECTIONS.filter(function (x) { return x.test(e); })[0];
      (buckets[s.id] = buckets[s.id] || []).push(e);
    });
    var secs = [];
    if (!filtered) {
      var feat = shown.filter(function (e) { return e.featured; });
      if (feat.length) secs.push({ id: "featured", title: "Featured", note: "The ones to show first.", list: feat });
    }
    ORDER.forEach(function (id) {
      if (id === "featured" || !buckets[id]) return;
      var s = SECTIONS.filter(function (x) { return x.id === id; })[0];
      secs.push({ id: id, title: s.title, short: s.short, note: s.note, list: buckets[id] });
    });

    var out = $("results");
    if (!shown.length) {
      out.innerHTML = '<div class="empty" role="status"><h2>Nothing matches that</h2>' +
        "<p>Try fewer filters or a different word.</p>" +
        '<button type="button" class="btn" data-clear>Clear search and filters</button></div>';
    } else {
      out.innerHTML = secs.map(function (s, si) {
        return '<section class="sec" id="s-' + s.id + '" data-acc="' + (si % 2 ? "m" : "b") + '" aria-labelledby="h-' + s.id + '">' +
          '<div class="sec-h"><h2 id="h-' + s.id + '">' + esc(s.title) + '</h2><span class="n">' + s.list.length +
          (s.list.length === 1 ? " experience" : " experiences") + "</span>" + (s.note ? "<p>" + esc(s.note) + "</p>" : "") + "</div>" +
          '<div class="grid">' + sortEntries(s.list).map(function (e, i) { return card(e, i + si, s.id); }).join("") + "</div></section>";
      }).join("");
    }

    // Jump links
    $("jumps").innerHTML = secs.map(function (s) {
      return '<li><a href="#s-' + s.id + '" data-jump>' + esc(s.short || s.title) + "<span>" + s.list.length + "</span></a></li>";
    }).join("");
    $("jump").hidden = !secs.length;

    // Summary + clear
    var n = activeCount();
    $("count").innerHTML = "<b>" + shown.length + "</b> of " + data.length + " experiences";
    $("clear").hidden = n === 0;
    $("clearN").textContent = n;
    $("pillN").textContent = shown.length;
    $("pillLabel").textContent = n ? "Filters (" + n + ")" : "Filter & jump";
    if (n) $("pill").setAttribute("data-active", ""); else $("pill").removeAttribute("data-active");
    $("pill").setAttribute("aria-label", (n ? n + " filters on, " : "") + shown.length + " experiences shown. Open filters and jump links");

    renderChips();
    spy();
  }

  /* ---------- Events ---------- */
  function toggle(g, v) {
    var list = state[g];
    var i = list.indexOf(v);
    if (i === -1) list.push(v); else list.splice(i, 1);
    update();
  }
  function clearAll() {
    state.q = ""; $("q").value = ""; $("qx").hidden = true;
    GROUPS.forEach(function (g) { state[g.key] = []; });
    update();
  }
  function update() { writeURL(); render(); }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-g]");
    if (t) {
      var keep = t.classList.contains("chip") ? { g: t.dataset.g, v: t.dataset.v } : null;
      toggle(t.dataset.g, t.dataset.v);
      if (keep) { // keep keyboard focus on the same chip after re-render
        var again = document.querySelector('.chip[data-g="' + keep.g + '"][data-v="' + CSS.escape(keep.v) + '"]');
        if (again) again.focus();
      }
      return;
    }
    if (ev.target.closest("[data-clear]") || ev.target.closest("#clear")) { clearAll(); $("q").focus(); return; }
    var jump = ev.target.closest("[data-jump]");
    if (jump && document.body.classList.contains("sheet-open")) closeSheet(false);
    var qrb = ev.target.closest(".btn.qr");
    if (qrb) { toggleQR(qrb); return; }
    if (!ev.target.closest(".qrpop")) closeQRs();
  });

  /* QR popovers (computers only), drawn with the repo's vendored qrcode lib. */
  function closeQRs(except) {
    document.querySelectorAll(".btn.qr[aria-expanded='true']").forEach(function (b) {
      if (b === except) return;
      b.setAttribute("aria-expanded", "false");
      $(b.getAttribute("aria-controls")).hidden = true;
    });
  }
  function toggleQR(btn) {
    var pop = $(btn.getAttribute("aria-controls"));
    var open = btn.getAttribute("aria-expanded") === "true";
    closeQRs(btn);
    btn.setAttribute("aria-expanded", String(!open));
    pop.hidden = open;
    if (open) return;
    var abs = new URL(btn.dataset.url, location.origin).href;
    pop.querySelector("code").textContent = abs.replace(/^https?:\/\//, "");
    var box = pop.querySelector(".qr-box");
    if (box.dataset.done) return;
    try {
      window.QRCode.toString(abs, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#05060cff", light: "#ffffffff" } }, function (err, svg) {
        if (!err) { box.innerHTML = svg; box.dataset.done = "1"; }
      });
    } catch (e) { box.textContent = "QR unavailable"; }
  }

  // Broken / missing thumbnail -> flat typographic placeholder.
  document.addEventListener("error", function (ev) {
    var img = ev.target;
    if (!img || img.tagName !== "IMG" || !img.closest(".thumb")) return;
    img.outerHTML = ph({ title: img.dataset.title, client: img.dataset.client });
  }, true);

  var qTimer;
  function bindSearch() {
    var q = $("q");
    q.value = state.q;
    q.addEventListener("input", function () {
      state.q = q.value;
      $("qx").hidden = !q.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(update, 60);
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Escape" && q.value) { e.stopPropagation(); q.value = ""; state.q = ""; $("qx").hidden = true; update(); } });
    $("qx").hidden = !q.value;
    $("qx").addEventListener("click", function () { q.value = ""; state.q = ""; $("qx").hidden = true; update(); q.focus(); });
    $("search").addEventListener("submit", function (e) { e.preventDefault(); if (document.body.classList.contains("sheet-open")) closeSheet(true); });
  }

  /* ---------- Mobile sheet ---------- */
  var mq = window.matchMedia("(max-width: 1023.98px)");
  function syncSheetMode() {
    var dock = $("dock");
    if (mq.matches) {
      dock.setAttribute("role", "dialog");
      dock.setAttribute("aria-modal", "true");
      if (!document.body.classList.contains("sheet-open")) dock.setAttribute("inert", "");
    } else {
      dock.removeAttribute("role"); dock.removeAttribute("aria-modal"); dock.removeAttribute("inert");
      document.body.classList.remove("sheet-open");
    }
  }
  function openSheet() {
    var dock = $("dock");
    dock.removeAttribute("inert");
    document.body.classList.add("sheet-open");
    $("pill").setAttribute("aria-expanded", "true");
    setTimeout(function () { $("dockClose").focus({ preventScroll: true }); }, 30);
  }
  function closeSheet(refocus) {
    document.body.classList.remove("sheet-open");
    $("pill").setAttribute("aria-expanded", "false");
    if (mq.matches) $("dock").setAttribute("inert", "");
    if (refocus !== false) $("pill").focus();
  }
  function bindSheet() {
    $("pill").addEventListener("click", openSheet);
    $("dockClose").addEventListener("click", function () { closeSheet(); });
    $("scrim").addEventListener("click", function () { closeSheet(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".btn.qr[aria-expanded='true']")) { closeQRs(); return; }
      if (document.body.classList.contains("sheet-open")) closeSheet();
    });
    // Keep Tab inside the sheet while it is open.
    $("dock").addEventListener("keydown", function (e) {
      if (e.key !== "Tab" || !document.body.classList.contains("sheet-open")) return;
      var f = $("dock").querySelectorAll("button:not([hidden]), input, a[href]");
      f = Array.prototype.filter.call(f, function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    (mq.addEventListener ? mq.addEventListener("change", syncSheetMode) : mq.addListener(syncSheetMode));
    syncSheetMode();
  }

  /* ---------- Scroll spy for the jump links ---------- */
  var io;
  function spy() {
    if (io) io.disconnect();
    if (!("IntersectionObserver" in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        document.querySelectorAll("[data-jump]").forEach(function (a) {
          a.setAttribute("aria-current", a.getAttribute("href") === "#" + en.target.id ? "true" : "false");
        });
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    document.querySelectorAll(".sec").forEach(function (s) { io.observe(s); });
  }

  function stats() {
    var clients = {}, tech = {};
    data.forEach(function (e) { clients[e.client] = 1; (e.tech || []).forEach(function (t) { tech[t] = 1; }); });
    $("stats").innerHTML = "<li><b>" + data.length + "</b>experiences</li><li><b>" + Object.keys(clients).length +
      "</b>clients</li><li><b>" + Object.keys(tech).length + "</b>kinds of tech</li><li><b>" +
      data.filter(function (e) { return e.status === "live"; }).length + "</b>live now</li>";
  }

  fetch("/labs/catalog.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (list) {
      data = list.filter(function (e) { return e && e.slug && e.title && e.url; });
      data.forEach(function (e, i) { e._i = i; e._h = haystack(e); });
      readURL();
      bindSearch();
      bindSheet();
      stats();
      render();
      if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    })
    .catch(function () {
      $("results").innerHTML = '<div class="empty" role="alert"><h2>The catalogue didn\'t load</h2><p>Reload the page to try again.</p></div>';
    });
})();
