/* medialife.ai main navigation for the static pages (/evade/, /activated-merch/).
 *
 * Usage, right after <body>:
 *   <link rel="stylesheet" href="/site-nav/site-nav.css" />   (in <head>)
 *   <header class="mlnav" id="site-nav"></header>
 *   <script src="/site-nav/site-nav.js"></script>
 * Add data-fixed to the header on pages whose hero sits under the bar.
 *
 * The items below are copied from src/lib/site-nav.json by
 * scripts/sync-site-nav.mjs on every build. Do not edit them here: edit the
 * JSON, which the React header (src/components/site/Nav.tsx) also reads.
 */
(function () {
  /* SITE_NAV:START (generated from src/lib/site-nav.json) */
  var NAV = {"items":[{"kind":"static","href":"/activated-merch/","label":"Activated Merch","short":"Merch","num":"01"},{"kind":"static","href":"/evade/","label":"EVADE","num":"02","isNew":true,"children":[{"href":"/evade/","label":"EVADE x MEDIALIFE","note":"The partnership and every experience"},{"href":"/evade/keychain-ar/","label":"Bobo Off the Chain","note":"Point your phone at the keychain"},{"href":"/evade/spray-bobo/","label":"Spray Bobo","note":"Your phone is the spray can"}]},{"kind":"route","href":"/live","label":"Live Now","num":"03"},{"kind":"anchor","href":"/#capabilities","label":"Production Capabilities","short":"Capabilities","num":"04"},{"kind":"route","href":"/activated-retail","label":"Retail Program","short":"Retail","num":"05"},{"kind":"route","href":"/creator-hub","label":"Creator Hub","num":"06"},{"kind":"route","href":"/case-studies","label":"Case Studies","num":"07"},{"kind":"external","href":"https://shop.medialife.ai/","label":"Shop","num":"08"}],"cta":{"href":"/contact","label":"Activate your IP"}};
  /* SITE_NAV:END */

  var host = document.getElementById("site-nav");
  if (!host) return;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function norm(p) { return p.replace(/\/+$/, "") || "/"; }
  var here = norm(location.pathname);
  function current(item) {
    if (item.kind === "external" || item.kind === "anchor") return "";
    var h = norm(item.href);
    return here === h || here.indexOf(h + "/") === 0 ? ' aria-current="page"' : "";
  }
  function ext(item) {
    return item.kind === "external" ? ' target="_blank" rel="noopener noreferrer"' : "";
  }
  var SR_SHOP = '<span class="sr-only">(opens the MEDIALIFE shop in a new tab)</span>';

  function childCurrent(c) { return here === norm(c.href) ? ' aria-current="page"' : ""; }

  var inline = NAV.items.map(function (it) {
    var label = it.short
      ? '<span class="mlnav-s">' + esc(it.short) + '</span><span class="mlnav-l">' + esc(it.label) + "</span>"
      : esc(it.label);
    var link = '<a href="' + esc(it.href) + '"' + ext(it) + current(it) + ">" +
      '<span class="mlnav-num">/' + esc(it.num) + "</span>" + label +
      (it.isNew ? '<span class="mlnav-new" role="img" aria-label="(new)"></span>' : "") +
      (it.kind === "external" ? '<span class="mlnav-ext" aria-hidden="true">↗</span>' + SR_SHOP : "") +
      "</a>";
    if (!it.children || !it.children.length) return link;
    /* Sub-pages: the parent stays a real link; the caret opens a small menu
       (hover, keyboard focus or tap). */
    var id = "mlnav-sub-" + esc(it.num);
    return '<div class="mlnav-has-sub">' + link +
      '<button type="button" class="mlnav-caret" aria-expanded="false" aria-controls="' + id + '" aria-label="' + esc(it.label) + ' pages"><span aria-hidden="true">▾</span></button>' +
      '<div class="mlnav-sub" id="' + id + '"><ul>' +
        it.children.map(function (c) {
          return '<li><a href="' + esc(c.href) + '"' + childCurrent(c) + '><span class="mlnav-sub-t">' + esc(c.label) + "</span>" +
            (c.note ? '<span class="mlnav-sub-n">' + esc(c.note) + "</span>" : "") + "</a></li>";
        }).join("") +
      "</ul></div></div>";
  }).join("");

  var panel = NAV.items.map(function (it) {
    return '<a href="' + esc(it.href) + '"' + ext(it) + current(it) + "><span>" + esc(it.label) +
      (it.isNew ? ' <span class="mlnav-pill">New</span>' : "") +
      (it.kind === "external" ? ' <span aria-hidden="true">↗</span>' + SR_SHOP : "") +
      '</span><span class="mlnav-num">/' + esc(it.num) + "</span></a>" +
      (it.children || []).filter(function (c) { return norm(c.href) !== norm(it.href); }).map(function (c) {
        return '<a class="mlnav-panel-sub" href="' + esc(c.href) + '"' + childCurrent(c) + "><span>" + esc(c.label) +
          '</span><span aria-hidden="true">→</span></a>';
      }).join("");
  }).join("");

  var cta = '<a class="mlnav-cta" href="' + esc(NAV.cta.href) + '">' + esc(NAV.cta.label) + ' <span aria-hidden="true">→</span></a>';

  host.innerHTML =
    '<div class="mlnav-row">' +
      '<a class="mlnav-logo" href="/" aria-label="MEDIALIFE home">' +
        '<span class="mlnav-orb" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<img src="/brand/medialife-lockup.webp" alt="" width="686" height="183" />' +
      "</a>" +
      '<nav class="mlnav-links" aria-label="Main">' + inline + "</nav>" +
      cta +
      '<button type="button" class="mlnav-menu" aria-expanded="false" aria-controls="site-nav-panel">Menu</button>' +
    "</div>" +
    '<nav class="mlnav-panel" id="site-nav-panel" aria-label="Main" hidden>' + panel +
      '<div class="mlnav-panel-cta">' + cta + "</div>" +
    "</nav>";

  var btn = host.querySelector(".mlnav-menu");
  var pnl = host.querySelector(".mlnav-panel");
  function set(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Menu";
    pnl.hidden = !open;
  }
  btn.addEventListener("click", function () { set(pnl.hidden); });
  pnl.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !pnl.hidden) { set(false); btn.focus(); }
  });
  /* Sub-page dropdowns */
  var subs = host.querySelectorAll(".mlnav-has-sub");
  function closeSubs(except) {
    for (var i = 0; i < subs.length; i++) {
      if (subs[i] !== except) {
        subs[i].classList.remove("is-open");
        subs[i].querySelector(".mlnav-caret").setAttribute("aria-expanded", "false");
      }
    }
  }
  function openSub(w, open) {
    closeSubs(w);
    w.classList.toggle("is-open", open);
    w.querySelector(".mlnav-caret").setAttribute("aria-expanded", open ? "true" : "false");
  }
  Array.prototype.forEach.call(subs, function (w) {
    var caret = w.querySelector(".mlnav-caret");
    caret.addEventListener("click", function () { openSub(w, !w.classList.contains("is-open")); });
    w.addEventListener("mouseenter", function () { openSub(w, true); });
    w.addEventListener("mouseleave", function () { openSub(w, false); });
    w.addEventListener("focusout", function (e) { if (!w.contains(e.relatedTarget)) openSub(w, false); });
    w.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && w.classList.contains("is-open")) { openSub(w, false); caret.focus(); }
    });
  });
  document.addEventListener("click", function (e) { if (!e.target.closest(".mlnav-has-sub")) closeSubs(null); });

  var wide = matchMedia("(min-width: 1024px)");
  var onWide = function (m) { if (m.matches) set(false); };
  if (wide.addEventListener) wide.addEventListener("change", onWide); else wide.addListener(onWide);
})();
