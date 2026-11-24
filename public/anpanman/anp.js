/* Anpanman, Activated: page interactions (no framework). The 3D product stage is anp3d.js. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => "$" + Math.round(n).toLocaleString("en-US");

  /* ── flat SVG clouds that drift across the hero ─────────────────────── */
  const CLOUD =
    '<svg viewBox="0 0 200 90" aria-hidden="true"><path fill="#fff" d="M30 84c-16 0-28-10-28-24s12-24 27-24c3-17 18-30 37-30 16 0 30 9 35 23 5-4 12-6 19-6 19 0 34 14 34 31v1c14 2 24 13 24 25 0 2 0 3-1 4z"/></svg>';
  const clouds = $("#clouds");
  const cloudSet = [
    { x: 4, y: 14, w: 170, s: 0.35, z: 1 },
    { x: 70, y: 9, w: 120, s: 0.22, z: 1 },
    { x: 82, y: 52, w: 210, s: 0.5, z: 4 },
    { x: -4, y: 62, w: 150, s: 0.42, z: 4 },
    { x: 40, y: 30, w: 90, s: 0.18, z: 1 },
  ];
  const cloudEls = cloudSet.map((c) => {
    const el = document.createElement("div");
    el.className = "cloud";
    el.style.cssText = `left:${c.x}%;top:${c.y}%;width:clamp(${c.w * 0.5}px,${c.w / 12}vw,${c.w}px);z-index:${c.z}`;
    el.innerHTML = CLOUD;
    clouds.appendChild(el);
    return { el, ...c, off: Math.random() * 100 };
  });
  clouds.style.cssText = "position:absolute;inset:0;z-index:1;pointer-events:none";
  // clouds in front of the character sit above the stage
  cloudEls.filter((c) => c.z === 4).forEach((c) => (c.el.style.zIndex = 4));

  const heroChar = $("#heroChar");
  const hero = $("#top");
  let mx = 0,
    my = 0;
  addEventListener(
    "pointermove",
    (e) => {
      mx = e.clientX / innerWidth - 0.5;
      my = e.clientY / innerHeight - 0.5;
    },
    { passive: true },
  );
  let t0 = performance.now();
  function heroLoop(now) {
    const t = (now - t0) / 1000;
    const sy = scrollY;
    if (sy < innerHeight * 1.2) {
      cloudEls.forEach((c) => {
        const drift = ((t * c.s * 8 + c.off) % 140) - 20;
        c.el.style.transform = `translate3d(${drift}vw, ${-sy * c.s * 0.4 + my * c.z * -6}px, 0)`;
      });
      // Anpanman flies up and away as you scroll down
      const k = Math.min(1, sy / (innerHeight * 0.8));
      heroChar.style.transform = `translateX(-50%) translate3d(${mx * 26 + k * 120}px, ${-k * innerHeight * 0.55 + my * 10}px, 0) rotate(${k * 18}deg)`;
    }
    requestAnimationFrame(heroLoop);
  }
  requestAnimationFrame(heroLoop);

  /* ── scroll progress + section nav ──────────────────────────────────── */
  const prog = $("#progress");
  const nav = $("#nav");
  const navLinks = $$("a", nav);
  const sections = navLinks.map((a) => $(a.getAttribute("href")));
  function onScroll() {
    const h = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
    nav.classList.toggle("show", scrollY > hero.offsetHeight * 0.6);
    let cur = -1;
    sections.forEach((s, i) => {
      if (s && s.getBoundingClientRect().top < innerHeight * 0.4) cur = i;
    });
    navLinks.forEach((a, i) => a.classList.toggle("on", i === cur));
    if (cur >= 0) {
      const a = navLinks[cur];
      const r = a.getBoundingClientRect(),
        nr = nav.getBoundingClientRect();
      if (r.left < nr.left || r.right > nr.right) nav.scrollLeft += r.left - nr.left - 20;
    }
    trackProgress();
  }
  addEventListener("scroll", onScroll, { passive: true });

  /* ── reveal on scroll ───────────────────────────────────────────────── */
  const io = new IntersectionObserver(
    (ents) => {
      ents.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  $$(".rv").forEach((el) => io.observe(el));

  /* ── videos: load + play only while on screen ───────────────────────── */
  const vio = new IntersectionObserver(
    (ents) => {
      ents.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.src && v.dataset.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      });
    },
    { threshold: 0.25 },
  );
  $$("video[data-src]").forEach((v) => vio.observe(v));

  /* ── funnel dots ────────────────────────────────────────────────────── */
  $$(".fstep .dots").forEach((d) => {
    const n = +d.dataset.n,
      on = +d.dataset.on;
    d.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < on ? "on" : ""}"></i>`).join("");
  });

  /* ── experience tabs ────────────────────────────────────────────────── */
  const tabs = $$('[role="tab"]');
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        selectTab(n);
        n.focus();
      }
    });
  });

  /* ── stat count-up ──────────────────────────────────────────────────── */
  const sio = new IntersectionObserver(
    (ents) => {
      ents.forEach((e) => {
        if (!e.isIntersecting) return;
        sio.unobserve(e.target);
        const el = e.target;
        const parts = el.dataset.count.split("-").map(Number);
        const pre = el.dataset.pre || "",
          suf = el.dataset.suf || "";
        const final = el.textContent;
        if (reduce) return;
        const t1 = performance.now(),
          dur = 1300;
        (function step(now) {
          const k = Math.min(1, (now - t1) / dur);
          const ease = 1 - Math.pow(1 - k, 3);
          el.textContent = pre + parts.map((p) => Math.round(p * ease)).join("–") + suf;
          if (k < 1) requestAnimationFrame(step);
          else el.textContent = final;
        })(t1);
      });
    },
    { threshold: 0.6 },
  );
  $$("[data-count]").forEach((el) => sio.observe(el));

  /* ── packages: payment schedule ─────────────────────────────────────── */
  // 12-month packages: monthly = 25% kickoff deposit + 10 monthly payments from launch (as in the deck).
  // 6-month package: 25% kickoff + 5 monthly payments. Quarterly = equal payments in advance.
  const PKG = {
    hello: { price: 28000, months: 6, after: 5 },
    activated: { price: 50000, months: 12, after: 10 },
    across: { price: 95000, months: 12, after: 10 },
  };
  function priceFor(p, mode) {
    if (mode === "full") return { amt: fmt(p.price), unit: "total", det: "", total: true };
    if (mode === "quarterly") {
      const q = p.months / 3;
      return { amt: fmt(p.price / q), unit: "/ quarter", det: ` · ${q} payments, in advance` };
    }
    const dep = p.price * 0.25;
    return { amt: fmt((p.price - dep) / p.after), unit: "/ month", det: ` · ${fmt(dep)} at kickoff, then ${p.after} monthly payments` };
  }
  let payMode = "full";
  const paySeg = $("#paySeg");
  function renderPay() {
    $$("[data-pay]", paySeg).forEach((b) => b.setAttribute("aria-pressed", b.dataset.pay === payMode));
    $$(".pkg").forEach((card) => {
      const r = priceFor(PKG[card.dataset.pkg], payMode);
      $(".amt", card).textContent = r.amt;
      $(".unit", card).textContent = r.unit;
      $(".det", card).textContent = r.det;
      $(".permo", card).hidden = !!r.total;
    });
  }
  paySeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pay]");
    if (!b) return;
    payMode = b.dataset.pay;
    renderPay();
  });
  renderPay();

  /* ── timeline fill ──────────────────────────────────────────────────── */
  const track = $("#track"),
    fill = $("#trackFill"),
    steps = $$("#track li");
  function trackProgress() {
    const r = track.getBoundingClientRect();
    const k = Math.max(0, Math.min(1, (innerHeight * 0.75 - r.top) / (r.height + innerHeight * 0.25)));
    const wide = innerWidth >= 900;
    const done = Math.round(k * (steps.length - 1));
    steps.forEach((s, i) => s.classList.toggle("done", i <= done && k > 0.02));
    if (wide) {
      fill.style.height = "";
      fill.style.width = k * 100 + "%";
    } else {
      fill.style.width = "";
      fill.style.height = k * 100 + "%";
    }
  }
  onScroll();

})();
