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
        const drift = reduce ? 0 : ((t * c.s * 8 + c.off) % 140) - 20;
        c.el.style.transform = `translate3d(${drift}vw, ${-sy * c.s * 0.4 + my * c.z * -6}px, 0)`;
      });
      // Anpanman flies up and away as you scroll down
      const k = Math.min(1, sy / (innerHeight * 0.8));
      heroChar.style.transform = `translateX(-50%) translate3d(${mx * 26 + k * 120}px, ${-k * innerHeight * 0.55 + my * 10}px, 0) rotate(${k * 18}deg)`;
    }
    requestAnimationFrame(heroLoop);
  }
  requestAnimationFrame(heroLoop);
  if (reduce) cloudEls.forEach((c) => (c.el.style.left = c.x + "%"));

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
          if (!reduce) v.play().catch(() => {});
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

  /* ── hub: concept vs live, mode buttons, tilt ───────────────────────── */
  const hubImg = $("#hubImg"),
    hubVid = $("#hubVid"),
    hubUi = $("#hubUi"),
    hubPhone = $("#hubPhone");
  const bConcept = $("#hubConcept"),
    bLive = $("#hubLive");
  const modes = $$("#hubModes .hm");
  function showHub(src, vid) {
    hubImg.style.opacity = 0;
    setTimeout(() => {
      hubImg.src = src;
      hubImg.onload = () => (hubImg.style.opacity = 1);
      if (vid && !reduce) {
        hubVid.src = vid;
        hubVid.hidden = false;
        hubImg.hidden = true;
        hubVid.play().catch(() => {});
      } else {
        hubVid.pause();
        hubVid.hidden = true;
        hubImg.hidden = false;
      }
    }, 180);
  }
  function setConcept(on) {
    bConcept.setAttribute("aria-pressed", on);
    bLive.setAttribute("aria-pressed", !on);
    hubUi.hidden = !on;
    if (on) {
      modes.forEach((m) => m.setAttribute("aria-pressed", "false"));
      showHub("assets/anp-hubbg.webp");
      hubImg.alt = "Concept: the Anpanman hub";
    }
  }
  bConcept.addEventListener("click", () => setConcept(true));
  bLive.addEventListener("click", () => modes[0].click());
  modes.forEach((m) =>
    m.addEventListener("click", () => {
      setConcept(false);
      modes.forEach((x) => x.setAttribute("aria-pressed", x === m));
      showHub(m.dataset.img, m.dataset.vid);
      hubImg.alt = "Live Cheer Bear hub: " + $("b", m).textContent;
    }),
  );
  if (!reduce && matchMedia("(hover: hover)").matches) {
    const hubWrap = $(".hub-device");
    hubWrap.addEventListener("pointermove", (e) => {
      const r = hubWrap.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5,
        y = (e.clientY - r.top) / r.height - 0.5;
      hubPhone.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 12}deg)`;
    });
    hubWrap.addEventListener("pointerleave", () => (hubPhone.style.transform = ""));
  }

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
    hello: { price: 39000, months: 6, after: 5 },
    activated: { price: 90000, months: 12, after: 10 },
    across: { price: 195000, months: 12, after: 10 },
  };
  function payline(p, mode) {
    if (mode === "full") return `<b>${fmt(p.price * 0.95)}</b> once, an extra 5% off`;
    if (mode === "quarterly") {
      const q = p.months / 3;
      return `<b>${q} × ${fmt(p.price / q)}</b>, each quarter in advance`;
    }
    const dep = p.price * 0.25;
    return `<b>${fmt(dep)}</b> at kickoff, then <b>${p.after} × ${fmt((p.price - dep) / p.after)}</b> a month from launch`;
  }
  let payMode = "monthly";
  const paySeg = $("#paySeg");
  function renderPay() {
    $$("[data-pay]", paySeg).forEach((b) => b.setAttribute("aria-pressed", b.dataset.pay === payMode));
    $$(".pkg").forEach((card) => ($(".payline", card).innerHTML = payline(PKG[card.dataset.pkg], payMode)));
    const sel = $("#f-pay");
    sel.selectedIndex = { full: 0, quarterly: 1, monthly: 2 }[payMode];
    renderSummary();
  }
  paySeg.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pay]");
    if (!b) return;
    payMode = b.dataset.pay;
    renderPay();
  });
  const mio = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (e.isIntersecting) {
        const i = $(".meter i", e.target);
        i.style.width = i.dataset.w + "%";
        mio.unobserve(e.target);
      }
    });
  });
  $$(".pkg").forEach((c) => mio.observe(c));

  /* ── offer form ─────────────────────────────────────────────────────── */
  const form = $("#offerForm");
  const keyOf = (v) => (v.startsWith("Hello") ? "hello" : v.startsWith("Anpanman") ? "activated" : v.startsWith("Across") ? "across" : null);
  function renderSummary() {
    const pkg = form.package.value;
    const k = keyOf(pkg);
    const mode = ["full", "quarterly", "monthly"][$("#f-pay").selectedIndex];
    $("#summary").innerHTML = k ? `<b>${pkg.split(" (")[0]}</b><br>${payline(PKG[k], mode)}` : "We'll walk through the options on the call.";
  }
  form.addEventListener("change", (e) => {
    if (e.target.id === "f-pay") {
      payMode = ["full", "quarterly", "monthly"][e.target.selectedIndex];
      renderPay();
    } else renderSummary();
  });
  $$("[data-choose]").forEach((a) =>
    a.addEventListener("click", () => {
      const r = $$('input[name="package"]', form).find((i) => i.value === a.dataset.choose);
      if (r) r.checked = true;
      renderSummary();
    }),
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#formErr");
    err.hidden = true;
    if (!form.reportValidity()) return;
    const data = new URLSearchParams(new FormData(form));
    try {
      const res = await fetch("/__forms.html", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: data.toString() });
      if (!res.ok) throw new Error(res.status);
      $("#okPkg").textContent = form.package.value.split(" (")[0];
      form.hidden = true;
      const ok = $("#formOk");
      ok.hidden = false;
      ok.focus();
    } catch {
      err.textContent = "That didn't send. Please email dapo@medialife.ai and we'll reply the same day.";
      err.hidden = false;
    }
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

  /* ── Bread Toss (flat, code-drawn mini game) ────────────────────────── */
  const cv = $("#tossCanvas");
  const ctx = cv.getContext("2d");
  const hint = $("#tossHint");
  let W = 0,
    H = 0,
    dpr = 1;
  const S = { left: 10, served: 0, bread: null, flying: [], crumbs: [], plate: { x: 0.5, y: 0.34, dir: 1 }, drag: null, pops: [] };
  function size() {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(size).observe(cv);
  size();
  const home = () => ({ x: W * 0.5, y: H * 0.86, z: 0, vx: 0, vy: 0, vz: 0, rot: 0 });
  function newBread() {
    S.bread = S.left > 0 ? home() : null;
  }
  newBread();
  function drawBread(x, y, s, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.fillStyle = "#5A3220";
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#C97A2C";
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#E39A45";
    ctx.beginPath();
    ctx.ellipse(-4, -4, 22, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#FFE0A8";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (const dx of [-10, 2, 14]) {
      ctx.beginPath();
      ctx.moveTo(dx - 4, -10);
      ctx.lineTo(dx + 2, 4);
      ctx.stroke();
    }
    ctx.restore();
  }
  function plateXY() {
    return { x: W * S.plate.x, y: H * S.plate.y };
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // floor: flat blanket checks
    ctx.fillStyle = "#FFF6E5";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#8FD3F4";
    ctx.fillRect(0, 0, W, H * 0.16);
    const rows = 7,
      cols = 9,
      top = H * 0.16;
    for (let r = 0; r < rows; r++) {
      const y0 = top + ((H - top) * r) / rows,
        y1 = top + ((H - top) * (r + 1)) / rows;
      for (let c = 0; c < cols; c++) {
        if ((r + c) % 2) continue;
        const sq = (y) => 0.55 + 0.45 * ((y - top) / (H - top));
        const cx = W / 2;
        const xa = (x, y) => cx + (x - cx) * sq(y);
        ctx.fillStyle = "#F7D6D2";
        ctx.beginPath();
        ctx.moveTo(xa((W * c) / cols, y0), y0);
        ctx.lineTo(xa((W * (c + 1)) / cols, y0), y0);
        ctx.lineTo(xa((W * (c + 1)) / cols, y1), y1);
        ctx.lineTo(xa((W * c) / cols, y1), y1);
        ctx.fill();
      }
    }
    // plate
    const p = plateXY();
    const pr = Math.min(W, H) * 0.13;
    ctx.fillStyle = "rgba(43,26,18,0.12)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + pr * 0.18, pr * 1.08, pr * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, pr, pr * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#E3241B";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = "#FFD23F";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, pr * 0.68, pr * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
    // served bread stacked on the plate
    for (let i = 0; i < Math.min(S.served, 6); i++) drawBread(p.x + ((i % 3) - 1) * pr * 0.35, p.y - pr * 0.06 - Math.floor(i / 3) * 8, 0.55, (i * 0.7) % 1);
    // flying bread
    for (const b of S.flying) {
      const sc = 1 - Math.min(0.55, b.z / 900);
      ctx.fillStyle = "rgba(43,26,18,0.13)";
      ctx.beginPath();
      ctx.ellipse(b.x, b.gy, 26 * sc, 9 * sc, 0, 0, Math.PI * 2);
      ctx.fill();
      drawBread(b.x, b.y, sc, b.rot);
    }
    if (S.bread && !S.drag) drawBread(S.bread.x, S.bread.y, 1, 0);
    if (S.drag) {
      drawBread(S.drag.x, S.drag.y, 1.05, 0);
    }
    for (const c of S.crumbs) {
      ctx.fillStyle = c.col;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const t of S.pops) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = t.col;
      ctx.font = "700 22px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.txt, t.x, t.y);
      ctx.globalAlpha = 1;
    }
  }
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (!reduce) {
      S.plate.x += S.plate.dir * dt * 0.09;
      if (S.plate.x > 0.72 || S.plate.x < 0.28) S.plate.dir *= -1;
    }
    for (const b of S.flying) {
      b.t += dt;
      // simple flight from (x0,y0) to landing (lx, ly) with a parabolic arc
      const k = Math.min(1, b.t / b.dur);
      b.x = b.x0 + (b.lx - b.x0) * k;
      b.gy = b.y0 + (b.ly - b.y0) * k;
      b.y = b.gy - Math.sin(k * Math.PI) * b.arc;
      b.z = k * 600;
      b.rot += dt * 9;
      if (k >= 1 && !b.done) {
        b.done = true;
        const p = plateXY();
        const pr = Math.min(W, H) * 0.13;
        const hit = Math.hypot((b.lx - p.x) / pr, (b.ly - p.y) / (pr * 0.4)) < 1.05;
        if (hit) {
          S.served++;
          S.pops.push({ x: p.x, y: p.y - pr * 0.6, txt: ["Yum!", "Fresh!", "Thank you!", "Delicious!"][S.served % 4], life: 1.1, col: "#E3241B" });
        } else S.pops.push({ x: b.lx, y: b.ly - 20, txt: "Crumbs!", life: 0.9, col: "#5A3220" });
        for (let i = 0; i < 10; i++)
          S.crumbs.push({ x: b.lx, y: b.ly, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 160, r: 2 + Math.random() * 2.5, life: 0.7, col: hit ? "#FFD23F" : "#C97A2C" });
        updateScore();
      }
    }
    S.flying = S.flying.filter((b) => !b.done);
    for (const c of S.crumbs) {
      c.vy += 420 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt;
    }
    S.crumbs = S.crumbs.filter((c) => c.life > 0);
    for (const t of S.pops) {
      t.y -= 30 * dt;
      t.life -= dt;
    }
    S.pops = S.pops.filter((t) => t.life > 0);
    draw();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  function updateScore() {
    $("#tossScore").textContent = `${S.served} served`;
    $("#tossLeft").textContent = S.left > 0 ? `${S.left} roll${S.left === 1 ? "" : "s"} left` : S.served >= 7 ? "Master baker!" : "Out of bread";
  }
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  cv.addEventListener("pointerdown", (e) => {
    if (!S.bread) return;
    const q = pos(e);
    if (Math.hypot(q.x - S.bread.x, q.y - S.bread.y) > 70) return;
    cv.setPointerCapture(e.pointerId);
    S.drag = { x: q.x, y: q.y, hist: [{ ...q, t: performance.now() }] };
    hint.hidden = true;
  });
  cv.addEventListener("pointermove", (e) => {
    if (!S.drag) return;
    const q = pos(e);
    S.drag.x = q.x;
    S.drag.y = q.y;
    S.drag.hist.push({ ...q, t: performance.now() });
    if (S.drag.hist.length > 6) S.drag.hist.shift();
  });
  const release = () => {
    if (!S.drag) return;
    const h = S.drag.hist,
      a = h[0],
      b = h[h.length - 1];
    const dt = Math.max(16, b.t - a.t) / 1000;
    const vx = (b.x - a.x) / dt,
      vy = (b.y - a.y) / dt;
    const d = S.drag;
    S.drag = null;
    if (vy > -250) return; // not a flick upward: drop back
    const power = Math.min(1.6, -vy / 1400);
    const ly = Math.max(H * 0.2, H * 0.86 - power * H * 0.62);
    const lx = Math.max(20, Math.min(W - 20, d.x + vx * 0.22 * power));
    S.flying.push({ x0: d.x, y0: d.y, x: d.x, y: d.y, gy: d.y, lx, ly, arc: H * 0.28 * (0.6 + power * 0.4), dur: 0.55 + power * 0.2, t: 0, rot: 0, z: 0 });
    S.left--;
    newBread();
    updateScore();
  };
  cv.addEventListener("pointerup", release);
  cv.addEventListener("pointercancel", () => (S.drag = null));
  $("#tossReset").addEventListener("click", () => {
    S.left = 10;
    S.served = 0;
    newBread();
    updateScore();
  });
  // keyboard: Space tosses straight at the plate
  cv.tabIndex = 0;
  cv.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && S.bread) {
      e.preventDefault();
      const p = plateXY();
      S.flying.push({ x0: S.bread.x, y0: S.bread.y, x: S.bread.x, y: S.bread.y, gy: S.bread.y, lx: p.x, ly: p.y, arc: H * 0.3, dur: 0.7, t: 0, rot: 0, z: 0 });
      S.left--;
      newBread();
      updateScore();
    }
  });
  addEventListener("resize", () => {
    if (S.bread) S.bread = home();
  });
})();
