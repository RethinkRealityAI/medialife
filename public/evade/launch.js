// EVADE launch page extras: the framed globe and the Bobo's Hideout panels.
(function () {
  // Touch screens: the globe sits under a cover until it's tapped, so a swipe
  // scrolls the page. The cover comes back once the globe leaves the screen.
  var ge = document.getElementById("globeEmbed");
  var cover = document.getElementById("geCover");
  if (ge && cover) {
    cover.addEventListener("click", function () {
      ge.classList.add("is-live");
      var f = ge.querySelector("iframe");
      if (f) f.focus();
    });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        if (!es[0].isIntersecting) ge.classList.remove("is-live");
      }).observe(ge);
    }
  }

  // The hideout panels lean towards the pointer (desktop, motion allowed).
  var stage = document.getElementById("hideoutStage");
  if (!stage) return;
  if (!matchMedia("(pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var raf = 0, mx = 0, my = 0;
  window.addEventListener("pointermove", function (e) {
    var r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
    my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
    if (!raf) raf = requestAnimationFrame(function () {
      raf = 0;
      stage.style.setProperty("--mx", mx.toFixed(3));
      stage.style.setProperty("--my", my.toFixed(3));
    });
  }, { passive: true });
})();

// Main navigation: the menu below 1280px (closes on a link, Escape or a wider screen).
(function () {
  var btn = document.getElementById("snavMenu");
  var panel = document.getElementById("snavPanel");
  if (!btn || !panel) return;
  function set(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Close" : "Menu";
    panel.hidden = !open;
  }
  btn.addEventListener("click", function () { set(panel.hidden); });
  panel.addEventListener("click", function (e) { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { set(false); btn.focus(); }
  });
  matchMedia("(min-width: 1280px)").addEventListener("change", function (m) { if (m.matches) set(false); });
})();

// Bobo's side nav: lights the section on screen (gold icon + its name).
(function () {
  var nav = document.getElementById("bnav");
  if (!nav) return;
  var list = nav.querySelector(".bnav-list");
  var links = [].slice.call(list.querySelectorAll("a"));
  var secs = links.map(function (a) { return document.getElementById(a.dataset.sec); });
  var small = matchMedia("(max-width: 899px)");
  var current = -1, tellT = 0, idleT = 0, ticking = false;

  function setActive(i) {
    if (i === current) return;
    current = i;
    links.forEach(function (a, k) {
      a.classList.toggle("is-active", k === i);
      a.classList.toggle("is-past", k < i);
      if (k === i) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current");
    });
    list.style.setProperty("--i", i);
    // phones: show the section's name for a moment after it changes
    nav.classList.add("is-told");
    clearTimeout(tellT);
    tellT = setTimeout(function () { nav.classList.remove("is-told"); }, 1800);
  }

  // the section whose box spans a line 40% down the screen is the current one
  function update() {
    ticking = false;
    var y = innerHeight * 0.4, i = 0;
    for (var k = 0; k < secs.length; k++) {
      if (secs[k] && secs[k].getBoundingClientRect().top <= y) i = k;
    }
    setActive(i);
    // phones: show the rail once the hero is mostly scrolled away
    var hero = secs[0];
    nav.classList.toggle("is-on", !small.matches || !hero || hero.getBoundingClientRect().bottom < innerHeight * 0.35);
  }
  // phones: the rail dims while the page is still
  function wake() {
    nav.classList.remove("is-idle");
    clearTimeout(idleT);
    idleT = setTimeout(function () { nav.classList.add("is-idle"); }, 1800);
  }
  function onScroll() {
    wake();
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll);
  small.addEventListener("change", onScroll);
  nav.addEventListener("pointerdown", wake);
  setTimeout(update, 400);
})();
