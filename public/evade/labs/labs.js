/* EVADE Labs (/evade/labs/): the client-facing, EVADE-only view of /labs/catalog.json.
   Shows entries with client "EVADE" unless they carry "share": false. An entry's optional
   "share" object overrides what the client sees: title, lead, needs ("What you need" line),
   links (replaces extraLinks), section (start|merch|room|screen) and start (a number:
   puts the card in "Start here", in that order). Internal fields (notes, source, tested) are
   never shown, and links into /labs/ are dropped so nothing leads to other clients' work. */
(function () {
  "use strict";

  var CLIENT = "EVADE";
  var SECTIONS = [
    { id: "start", title: "Start here", short: "Start here", note: "The three to show first." },
    { id: "merch", title: "Point your phone at the merch", short: "On the merch", note: "Image-tracked AR on the Bobo & Eclipse keychain and the tees." },
    { id: "room", title: "In your room, and selfies", short: "Room & selfies", note: "Place it on the floor and walk around it, or flip to the front camera and wear Bobo." },
    { id: "screen", title: "Bobo's world on any screen", short: "Any screen", note: "No camera needed: phone, tablet or computer." }
  ];
  var TECH = { "image-target": "On the merch", world: "In your room", face: "Selfie", sky: "Sky AR", "web-3d": "Any screen" };
  var STATUS = { live: "Live", preview: "Preview", lab: "Preview" };

  var IS_PHONE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  var $ = function (id) { return document.getElementById(id); };
  function has(list, v) { return (list || []).indexOf(v) !== -1; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function internal(url) { return /^\/labs\/(?!img\/|collector-hub\/)/.test(url || ""); }

  /* Catalogue entry -> what the EVADE team sees. */
  function view(e) {
    var s = e.share || {};
    var links = (s.links || e.extraLinks || []).filter(function (l) { return l && l.url && !internal(l.url); });
    var section = s.section || (s.start ? "start" :
      has(e.tech, "image-target") || has(e.tech, "sky") ? "merch" :
      has(e.tech, "world") || has(e.tech, "face") ? "room" : "screen");
    return {
      slug: e.slug, url: e.url, thumb: e.thumb, alt: e.alt || e.title,
      title: s.title || e.title, lead: s.lead || e.lead, needs: s.needs || "",
      links: links, section: section, start: s.start || 0, i: e._i,
      status: STATUS[e.status] || "Preview", live: e.status === "live",
      game: has(e.categories, "game"),
      tags: (e.tech || []).map(function (t) { return TECH[t]; }).filter(Boolean)
    };
  }

  var QR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/></g><g fill="currentColor"><rect x="14" y="14" width="3" height="3"/><rect x="17.5" y="17.5" width="3" height="3"/><rect x="14" y="18.5" width="2" height="2"/><rect x="18.5" y="14" width="2" height="2"/></g></svg>';
  var NEED_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M5 7l2.5 2.5M19 7l-2.5 2.5"/><rect x="8" y="10" width="8" height="12" rx="2"/></g></svg>';

  function card(v, big) {
    var id = "c-" + v.slug;
    var tags = v.tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + (v.game ? "<li>Game</li>" : "");
    var extra = v.links.map(function (l) {
      return '<a class="btn btn--ghost btn--sm" href="' + esc(l.url) + '">' + esc(l.label) + "</a>";
    }).join("");
    var qr = IS_PHONE ? "" :
      '<button type="button" class="btn btn--ghost btn--sm qr" aria-expanded="false" aria-controls="qr-' + id + '" data-url="' + esc(v.url) +
      '" aria-label="Open ' + esc(v.title) + ' on your phone" title="Open on your phone">' + QR_ICON + "<span>On your phone</span></button>" +
      '<div class="qrpop" id="qr-' + id + '" role="dialog" aria-label="Open ' + esc(v.title) + ' on your phone" hidden>' +
      '<div class="qr-box"></div><p>Scan with your phone camera to open ' + esc(v.title) + ".</p></div>";
    return '<article class="card' + (big ? " card--big" : "") + '" aria-labelledby="t-' + id + '">' +
      '<a class="thumb" href="' + esc(v.url) + '" tabindex="-1" aria-hidden="true">' +
      (v.thumb ? '<img src="' + esc(v.thumb) + '" alt="' + esc(v.alt) + '" loading="lazy" decoding="async" width="640" height="360" data-title="' + esc(v.title) + '">' : ph(v.title)) +
      '<span class="st' + (v.live ? " st--live" : "") + '">' + esc(v.status) + "</span></a>" +
      '<div class="body">' +
      '<h3 id="t-' + id + '">' + esc(v.title) + "</h3>" +
      (v.needs ? '<p class="needs">' + NEED_ICON + "<span>" + esc(v.needs) + "</span></p>" : "") +
      '<p class="desc">' + esc(v.lead) + "</p>" +
      (tags ? '<ul class="tags" aria-label="Type">' + tags + "</ul>" : "") +
      '<div class="actions"><a class="btn btn--gold" href="' + esc(v.url) + '">Open it</a>' + extra + qr + "</div>" +
      "</div></article>";
  }
  function ph(title) { return '<div class="ph"><b>' + esc(title) + "</b></div>"; }

  function render(list) {
    var by = {};
    list.forEach(function (v) { (by[v.section] = by[v.section] || []).push(v); });
    var secs = SECTIONS.filter(function (s) { return by[s.id] && by[s.id].length; });
    $("results").innerHTML = secs.map(function (s) {
      var items = by[s.id].slice().sort(function (a, b) {
        return (a.start || 99) - (b.start || 99) || (b.live ? 1 : 0) - (a.live ? 1 : 0) || a.i - b.i;
      });
      return '<section class="sec" id="s-' + s.id + '" aria-labelledby="h-' + s.id + '">' +
        '<div class="sec-h"><h2 id="h-' + s.id + '">' + esc(s.title) + "</h2>" +
        '<span class="n mono">' + items.length + (items.length === 1 ? " experience" : " experiences") + "</span>" +
        "<p>" + esc(s.note) + "</p></div>" +
        '<div class="grid' + (s.id === "start" ? " grid--start" : items.length % 3 && items.length % 2 === 0 ? " grid--two" : "") + '">' +
        items.map(function (v) { return card(v, s.id === "start"); }).join("") + "</div></section>";
    }).join("");
    $("jumps").innerHTML = secs.map(function (s) {
      return '<li><a href="#s-' + s.id + '" data-jump>' + esc(s.short) + "<span>" + by[s.id].length + "</span></a></li>";
    }).join("");
    $("jump").hidden = secs.length < 2;
    $("stats").innerHTML =
      "<li><b>" + list.length + "</b>experiences</li>" +
      "<li><b>" + list.filter(function (v) { return v.live; }).length + "</b>live now</li>" +
      "<li><b>" + list.filter(function (v) { return v.game; }).length + "</b>games</li>";
    spy();
  }

  /* QR popovers (computers only). */
  function closeQRs(except) {
    document.querySelectorAll(".qr[aria-expanded='true']").forEach(function (b) {
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
    var box = pop.querySelector(".qr-box");
    if (box.dataset.done) return;
    var abs = new URL(btn.dataset.url, location.origin).href;
    try {
      window.QRCode.toString(abs, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#05080aff", light: "#ffffffff" } }, function (err, svg) {
        if (!err) { box.innerHTML = svg; box.dataset.done = "1"; }
      });
    } catch (e) { box.textContent = "QR unavailable"; }
  }
  document.addEventListener("click", function (ev) {
    var q = ev.target.closest(".qr");
    if (q) { toggleQR(q); return; }
    if (!ev.target.closest(".qrpop")) closeQRs();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeQRs(); });
  document.addEventListener("error", function (ev) {
    var img = ev.target;
    if (img && img.tagName === "IMG" && img.closest(".thumb")) img.outerHTML = ph(img.dataset.title);
  }, true);

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
    }, { rootMargin: "-35% 0px -60% 0px" });
    document.querySelectorAll(".sec").forEach(function (s) { io.observe(s); });
  }

  if (IS_PHONE) $("step1").textContent = "You're on a phone already: tap Open it on any card.";

  fetch("/labs/catalog.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (all) {
      var list = all.map(function (e, i) { if (e) e._i = i; return e; }).filter(function (e) {
        return e && e.slug && e.title && e.url && e.client === CLIENT && e.share !== false;
      }).map(view);
      render(list);
      if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); }
    })
    .catch(function () {
      $("results").innerHTML = '<p class="loading" role="alert">The experiences didn\'t load. Reload the page to try again.</p>';
    });
})();
