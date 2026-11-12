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
      a.parentNode.classList.toggle("is-cur", k === i);
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

  // phones: the folded button opens the rail; a name goes there and folds it again
  function open(v) { nav.classList.toggle("is-open", v); }
  nav.addEventListener("click", function (e) {
    if (!small.matches) return;
    if (!nav.classList.contains("is-open")) { e.preventDefault(); open(true); return; }
    if (e.target.closest("a")) setTimeout(function () { open(false); }, 200);
  });
  document.addEventListener("pointerdown", function (e) {
    if (nav.classList.contains("is-open") && !nav.querySelector(".bnav-rail").contains(e.target)) open(false);
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false); });
  small.addEventListener("change", function () { open(false); });
})();

// BOBO OS phone: flips between Alerts and the leaderboard while on screen.
(function () {
  var phone = document.getElementById("hsPhone");
  if (!phone) return;
  var tabs = [].slice.call(phone.querySelectorAll('[role="tab"]'));
  var views = tabs.map(function (t) { return document.getElementById(t.getAttribute("aria-controls")); });
  var bar = phone.querySelector(".hp-tabs");
  var cur = 0, timer = 0, visible = false, hold = 0;
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function show(i, focus) {
    cur = i;
    bar.dataset.tab = String(i);
    tabs.forEach(function (t, k) {
      t.setAttribute("aria-selected", k === i ? "true" : "false");
      t.tabIndex = k === i ? 0 : -1;
      views[k].hidden = k !== i;
    });
    if (focus) tabs[i].focus();
  }
  function tick() {
    clearTimeout(timer);
    if (still || !visible) return;
    timer = setTimeout(function () {
      if (Date.now() >= hold && !document.hidden) show((cur + 1) % tabs.length);
      tick();
    }, 4200);
  }
  tabs.forEach(function (t, k) {
    t.addEventListener("click", function () { hold = Date.now() + 9000; show(k); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      hold = Date.now() + 9000;
      show((cur + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length, true);
    });
  });
  phone.addEventListener("pointerenter", function () { hold = Infinity; });
  phone.addEventListener("pointerleave", function () { hold = Date.now() + 2500; });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; tick(); }, { threshold: 0.4 }).observe(phone);
  }
})();
