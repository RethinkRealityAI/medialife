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
  var NAV = {"items":[{"kind":"static","href":"/activated-merch/","label":"Activated Merch","short":"Merch","num":"01"},{"kind":"static","href":"/evade/","label":"EVADE","num":"02","isNew":true},{"kind":"route","href":"/live","label":"Live Now","num":"03"},{"kind":"anchor","href":"/#capabilities","label":"Production Capabilities","short":"Capabilities","num":"04"},{"kind":"route","href":"/activated-retail","label":"Retail Program","short":"Retail","num":"05"},{"kind":"route","href":"/creator-hub","label":"Creator Hub","num":"06"},{"kind":"route","href":"/case-studies","label":"Case Studies","num":"07"},{"kind":"external","href":"https://shop.medialife.ai/","label":"Shop","num":"08"}],"cta":{"href":"/contact","label":"Activate your IP"}};
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

  var inline = NAV.items.map(function (it) {
    var label = it.short
      ? '<span class="mlnav-s">' + esc(it.short) + '</span><span class="mlnav-l">' + esc(it.label) + "</span>"
      : esc(it.label);
    return '<a href="' + esc(it.href) + '"' + ext(it) + current(it) + ">" +
      '<span class="mlnav-num">/' + esc(it.num) + "</span>" + label +
      (it.isNew ? '<span class="mlnav-new" role="img" aria-label="(new)"></span>' : "") +
      (it.kind === "external" ? '<span class="mlnav-ext" aria-hidden="true">↗</span>' + SR_SHOP : "") +
      "</a>";
  }).join("");

  var panel = NAV.items.map(function (it) {
    return '<a href="' + esc(it.href) + '"' + ext(it) + current(it) + "><span>" + esc(it.label) +
      (it.isNew ? ' <span class="mlnav-pill">New</span>' : "") +
      (it.kind === "external" ? ' <span aria-hidden="true">↗</span>' + SR_SHOP : "") +
      '</span><span class="mlnav-num">/' + esc(it.num) + "</span></a>";
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
  var wide = matchMedia("(min-width: 1024px)");
  var onWide = function (m) { if (m.matches) set(false); };
  if (wide.addEventListener) wide.addEventListener("change", onWide); else wide.addListener(onWide);
})();
