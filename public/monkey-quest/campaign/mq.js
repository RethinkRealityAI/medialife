/* Monkey Quest, Activated: page interactions (no framework). The 3D hero and the keychain stage are mq3d.js. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ── starfield: flat dots on the page background, slow parallax with scroll ── */
  const cv = $("#stars");
  const g = cv.getContext("2d");
  let W = 0, H = 0, stars = [];
  function sizeStars() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((W * H) / 5200);
    stars = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H * 3, r: Math.random() < 0.08 ? 1.8 : Math.random() * 1.1 + 0.4, z: Math.random() * 0.6 + 0.2, tw: Math.random() * 6.28, gold: Math.random() < 0.07 }));
  }
  function drawStars(t) {
    g.clearRect(0, 0, W, H);
    const sy = scrollY;
    for (const s of stars) {
      const y = (((s.y - sy * s.z * 0.35) % (H * 3)) + H * 3) % (H * 3);
      if (y > H) continue;
      g.globalAlpha = reduce ? 0.7 : 0.45 + 0.4 * Math.sin(t / 900 + s.tw);
      g.fillStyle = s.gold ? "#ffc21f" : "#ffffff";
      g.fillRect(s.x, y, s.r, s.r);
    }
    g.globalAlpha = 1;
  }
  sizeStars();
  addEventListener("resize", sizeStars);
  (function loop(t) { drawStars(t); requestAnimationFrame(loop); })(0);

  /* ── progress + nav ───────────────────────────────────────────────── */
  const prog = $("#progress"), nav = $("#nav"), hero = $("#top");
  const links = $$("a", nav), secs = links.map((a) => $(a.getAttribute("href")));
  function onScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    nav.classList.toggle("show", scrollY > hero.offsetHeight * 0.6);
    let cur = -1;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < innerHeight * 0.4) cur = i; });
    links.forEach((a, i) => a.classList.toggle("on", i === cur));
    if (cur >= 0) {
      const r = links[cur].getBoundingClientRect(), nr = nav.getBoundingClientRect();
      if (r.left < nr.left || r.right > nr.right) nav.scrollLeft += r.left - nr.left - 20;
    }
  }
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── reveal ───────────────────────────────────────────────────────── */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".rv").forEach((el) => io.observe(el));

  /* ── videos: load + play only on screen ───────────────────────────── */
  const vio = new IntersectionObserver((es) => es.forEach((e) => {
    const v = e.target;
    if (e.isIntersecting) { if (!v.src && v.dataset.src) v.src = v.dataset.src; v.play().catch(() => {}); } else if (!v.paused) v.pause();
  }), { threshold: 0.25 });
  $$("video[data-src]").forEach((v) => vio.observe(v));

  /* ── stat count-up ────────────────────────────────────────────────── */
  const sio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    sio.unobserve(e.target);
    const el = e.target, [a, b] = el.dataset.count.split("-").map(Number), suf = el.dataset.suf || "";
    if (reduce) return;
    const t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / 1200), ease = 1 - Math.pow(1 - k, 3);
      el.textContent = b ? `${Math.round(a * ease)}–${Math.round(b * ease)}${suf}` : `${Math.round(a * ease)}${suf}`;
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }), { threshold: 0.6 });
  $$(".stat .v[data-count]").forEach((el) => sio.observe(el));

  /* ── QR to the live Hub ───────────────────────────────────────────── */
  addEventListener("load", () => {
    const el = $("#hubQr");
    if (!el || !window.QRCode) return;
    QRCode.toString(location.origin + "/monkey-quest/hub/", { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b1630", light: "#ffffff" } }, (err, svg) => { if (!err) el.innerHTML = svg; });
  });

  /* ── the pop-up in 3D: load the activated-retail engine on demand ─── */
  const go = $("#popGo");
  go?.addEventListener("click", () => {
    const f = document.createElement("iframe");
    f.src = "/activated-retail/engine/?template=monkey-quest-popup&embed=1&notour=1";
    f.title = "The Monkey Quest activated pop-up in 3D";
    f.allow = "fullscreen; xr-spatial-tracking";
    f.loading = "eager";
    $("#popFrame").appendChild(f);
    go.remove();
    $("#popCap").textContent = "Drag to walk around · switch pop-up shop / convention · tap the glowing markers";
  });
})();
