/**
 * "See what fans experience": an in-page cinematic. A phone slides in, its
 * camera scans the tag on the product, then the experience plays inside the
 * phone according to activation.kind:
 *   ar     the creator's mark pops out of the product, in 3D, over the phone
 *   model  a 3D collectible coin spins up
 *   video  a looping "video drop" with captions and player UI (canvas, no file)
 *   game   a 10-second tap game: catch the falling logos
 *   unlock a reward card flips over
 * …ending on "Reward unlocked: {reward}". Opened from #activate=<id> on a phone,
 * the phone frame drops away and the experience fills the screen.
 */
import {
  $,
  esc,
  ICON,
  KIND_ICON,
  KIND_LABEL,
  openLayer,
  closeLayer,
  isOpen,
  reducedMotion,
  track,
} from "./ui.js";
import { drawQR, makeCanvas, FONT_SANS } from "./art.js";

export function createActivation(app) {
  const el = $("activation");
  let run = null;

  function stop() {
    if (!run) return;
    run.timers.forEach(clearTimeout);
    run.rafs.forEach((r) => cancelAnimationFrame(r.id));
    run.cleanup.forEach((f) => f());
    run = null;
  }

  const later = (ms, fn) => {
    const r = run;
    const t = setTimeout(() => r === run && fn(), reducedMotion() ? Math.min(ms, 600) : ms);
    run?.timers.push(t);
  };
  /** A rAF loop that stops with the run. fn(dt, t) returns false to end. */
  const loop = (fn) => {
    const r = run;
    const h = { id: 0 };
    let last = performance.now();
    let t = 0;
    const step = (now) => {
      if (r !== run) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (fn(dt, t) === false) return;
      h.id = requestAnimationFrame(step);
    };
    h.id = requestAnimationFrame(step);
    run.rafs.push(h);
  };

  function setStep(i) {
    el.querySelectorAll(".act-steps li").forEach((li, k) => {
      li.classList.toggle("on", k === i);
      li.classList.toggle("done", k < i);
    });
  }
  function show(id) {
    el.querySelectorAll(".scr").forEach((s) => s.classList.toggle("on", s.id === id));
  }

  /* ---- confetti --------------------------------------------------------------- */
  function confetti(burst = 140) {
    if (reducedMotion()) return;
    const c = el.querySelector(".confetti");
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = r.width * dpr;
    c.height = r.height * dpr;
    const ctx = c.getContext("2d");
    const cols = [app.config.theme.accent, app.config.theme.neon, "#ffffff", "#ffd27a"];
    const ps = Array.from({ length: burst }, () => ({
      x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.2,
      y: c.height * 0.38,
      vx: (Math.random() - 0.5) * c.width * 1.6,
      vy: -Math.random() * c.height * 1.3 - c.height * 0.2,
      s: (4 + Math.random() * 6) * dpr,
      a: Math.random() * 6,
      va: (Math.random() - 0.5) * 12,
      col: cols[(Math.random() * cols.length) | 0],
    }));
    loop((dt, t) => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.vy += c.height * 1.6 * dt;
        p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.a += p.va * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.globalAlpha = Math.max(0, 1 - t / 3.2);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (t > 3.3) {
        ctx.clearRect(0, 0, c.width, c.height);
        return false;
      }
    });
  }

  /* ---- experiences ---------------------------------------------------------------- */
  const logoUrl = () => app.kit.logo("light").toDataURL("image/png");

  function playAR(h) {
    const scr = $("scrCam");
    scr.classList.add("ar-live");
    scr.querySelector(".cam-hint").textContent = "";
    scr.querySelector(".cam-chip").innerHTML =
      `${ICON.ar}<span>${esc(h.product.activation.title)}</span>`;
    const pop = el.querySelector(".pop");
    const url = logoUrl();
    const inner = pop.querySelector(".pop-inner");
    const N = 9;
    inner.innerHTML = Array.from(
      { length: N },
      (_, i) =>
        `<div class="layer" style="background-image:url(${url});transform:translateZ(${(i - N) * 2.2}px);filter:brightness(${i === N - 1 ? 1 : 0.28 + (i / N) * 0.35}) drop-shadow(0 0 ${i === N - 1 ? 14 : 0}px ${app.config.theme.accent})"></div>`,
    ).join("");
    pop.hidden = false;
    requestAnimationFrame(() => pop.classList.add("go"));
    // sparkles around it
    const sp = pop.querySelector(".sparkles");
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = sp.getBoundingClientRect();
    sp.width = r.width * dpr;
    sp.height = r.height * dpr;
    const ctx = sp.getContext("2d");
    const dots = Array.from({ length: 46 }, () => ({
      a: Math.random() * 6.28,
      d: 0.15 + Math.random() * 0.35,
      s: Math.random(),
      sp: 0.3 + Math.random(),
    }));
    loop((dt, t) => {
      ctx.clearRect(0, 0, sp.width, sp.height);
      for (const d of dots) {
        const a = d.a + t * d.sp * 0.6;
        const x = sp.width / 2 + Math.cos(a) * d.d * sp.width;
        const y = sp.height * 0.36 + Math.sin(a) * d.d * sp.height * 0.6 - t * 6 * dpr * d.s;
        const tw = 0.5 + 0.5 * Math.sin(t * 4 + d.s * 20);
        ctx.fillStyle = d.s > 0.5 ? app.config.theme.accent : app.config.theme.neon;
        ctx.globalAlpha = Math.min(1, t) * tw;
        ctx.beginPath();
        ctx.arc(x, y, (1.5 + d.s * 2.5) * dpr, 0, 6.28);
        ctx.fill();
      }
    });
    later(5200, () => reward(h));
  }

  function playModel(h) {
    const exp = $("scrExp");
    const badge = app.kit.badge().toDataURL("image/png");
    const N = 14;
    exp.innerHTML = `
      <div class="exp-top"><span class="live"></span>3D collectible</div>
      <p class="exp-title">${esc(h.product.activation.title)}</p>
      <div class="exp-body">
        <div class="coin-stage"><div class="rays"></div>
          <div class="coin">
            ${Array.from({ length: N }, (_, i) => `<div class="disc" style="transform:translateZ(${(i - N / 2) * 0.8}px);filter:brightness(${0.6 + (i % 3) * 0.12})"></div>`).join("")}
            <div class="face" style="background-image:url(${badge});transform:translateZ(${N * 0.4 + 0.5}px)"></div>
            <div class="face back" style="background-image:url(${badge});transform:rotateY(180deg) translateZ(${N * 0.4 + 0.5}px)"></div>
          </div>
          <div class="coin-base"></div>
        </div>
      </div>
      <div class="exp-foot"><button type="button" class="btn btn-primary" data-act="collect">Add to my collection</button></div>`;
    show("scrExp");
    exp.querySelector('[data-act="collect"]').onclick = () => reward(h);
    later(6500, () => reward(h));
  }

  function playVideo(h) {
    const exp = $("scrExp");
    exp.innerHTML = `
      <div class="exp-top"><span class="live"></span>Video drop · buyers only</div>
      <p class="exp-title">${esc(h.product.activation.title)}</p>
      <div class="exp-body">
        <div class="vid">
          <canvas class="full"></canvas>
          <div class="vid-ui">
            <p class="vid-cap" aria-live="polite"></p>
            <div class="vid-bar"><i></i></div>
            <div class="vid-row"><span class="vid-play">${'<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>'}</span><span class="vid-time">0:00 / 0:08</span></div>
          </div>
        </div>
      </div>
      <div class="exp-foot"></div>`;
    show("scrExp");
    const c = exp.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.max(10, r.width * dpr);
    c.height = Math.max(10, r.height * dpr);
    const ctx = c.getContext("2d");
    const logo = app.kit.logo("light");
    const { accent, neon } = app.config.theme;
    const name = app.config.creator.name;
    const caps = [
      `Hey — it's ${name}.`,
      "If you're watching this, you've got the drop.",
      "This clip only plays for people holding the merch.",
      "Your reward's waiting below. ↓",
    ];
    const capEl = exp.querySelector(".vid-cap");
    const bar = exp.querySelector(".vid-bar i");
    const time = exp.querySelector(".vid-time");
    const D = 8;
    let lastCap = -1;
    loop((dt, t) => {
      const W = c.width;
      const H = c.height;
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#0b0c18");
      g.addColorStop(1, "#1a0d22");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // bokeh lights
      for (let i = 0; i < 9; i++) {
        const x = (W * (i * 0.13 + 0.05 + 0.03 * Math.sin(t * 0.5 + i))) % W;
        const y = H * (0.2 + 0.5 * ((i * 0.37) % 1));
        const rr = W * (0.08 + 0.05 * ((i * 0.53) % 1));
        const gr = ctx.createRadialGradient(x, y, 0, x, y, rr);
        gr.addColorStop(0, i % 2 ? accent + "55" : neon + "44");
        gr.addColorStop(1, "transparent");
        ctx.fillStyle = gr;
        ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      // the "creator": a silhouette at a desk with a neon edge
      ctx.save();
      ctx.translate(W * 0.5, H * 0.5);
      const bob = Math.sin(t * 2.2) * H * 0.006;
      ctx.fillStyle = "#05060a";
      ctx.strokeStyle = neon;
      ctx.lineWidth = 2 * dpr;
      ctx.shadowColor = neon;
      ctx.shadowBlur = 12 * dpr;
      ctx.beginPath();
      ctx.arc(0, -H * 0.2 + bob, W * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, H * 0.07 + bob, W * 0.27, H * 0.17, 0, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // logo bug, top-left
      const s = (W * 0.24) / logo.width;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(logo, W * 0.06, H * 0.05, logo.width * s, logo.height * s);
      ctx.globalAlpha = 1;
      // voice waveform
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      const bars = 26;
      for (let i = 0; i < bars; i++) {
        const a = Math.abs(Math.sin(t * 7 + i * 0.7) * Math.sin(t * 2.3 + i * 0.3));
        const bh = H * 0.02 + a * H * 0.06;
        ctx.fillRect(
          W * 0.12 + (i * W * 0.76) / bars,
          H * 0.6 - bh / 2,
          (W * 0.76) / bars - 2 * dpr,
          bh,
        );
      }
      // REC
      ctx.fillStyle = "#ff375f";
      if (Math.floor(t * 2) % 2) {
        ctx.beginPath();
        ctx.arc(W * 0.86, H * 0.08, 5 * dpr, 0, 6.28);
        ctx.fill();
      }
      const k = Math.min(1, t / D);
      bar.style.width = `${k * 100}%`;
      time.textContent = `0:0${Math.min(D, Math.floor(t))} / 0:0${D}`;
      const ci = Math.min(caps.length - 1, Math.floor((t / D) * caps.length));
      if (ci !== lastCap) {
        lastCap = ci;
        capEl.textContent = caps[ci];
      }
      if (t >= D) {
        reward(h);
        return false;
      }
    });
  }

  function playGame(h) {
    const exp = $("scrExp");
    exp.innerHTML = `
      <div class="exp-top"><span class="live"></span>Mini-game · 10 seconds</div>
      <p class="exp-title">Catch the ${esc(app.config.creator.name)} drops</p>
      <div class="exp-body">
        <canvas class="full" aria-label="Tap the falling logos to catch them"></canvas>
        <div class="game-hud" aria-live="polite"><span>Score <b class="g-score">0</b></span><span>⏱ <b class="g-time">10</b>s</span></div>
        <div class="game-start"><div><p>Tap the falling logos before they hit the floor.</p><button type="button" class="btn btn-primary" data-act="play">Play</button></div></div>
      </div>`;
    show("scrExp");
    const c = exp.querySelector("canvas");
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = Math.max(10, r.width * dpr);
    c.height = Math.max(10, r.height * dpr);
    const ctx = c.getContext("2d");
    const badge = app.kit.badge();
    const scoreEl = exp.querySelector(".g-score");
    const timeEl = exp.querySelector(".g-time");
    let items = [];
    let bursts = [];
    let score = 0;
    let playing = false;
    const R = c.width * 0.085;
    const spawn = () =>
      items.push({
        x: R + Math.random() * (c.width - R * 2),
        y: -R,
        v: c.height * (0.28 + Math.random() * 0.25),
        a: Math.random() * 6,
        va: (Math.random() - 0.5) * 3,
      });
    const hit = (px, py) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (Math.hypot(px - it.x, py - it.y) < R * 1.35) {
          items.splice(i, 1);
          score++;
          scoreEl.textContent = String(score);
          bursts.push({ x: it.x, y: it.y, t: 0 });
          navigator.vibrate?.(12);
          return;
        }
      }
    };
    const onDown = (e) => {
      if (!playing) return;
      const b = c.getBoundingClientRect();
      hit(((e.clientX - b.left) / b.width) * c.width, ((e.clientY - b.top) / b.height) * c.height);
    };
    c.addEventListener("pointerdown", onDown);
    run.cleanup.push(() => c.removeEventListener("pointerdown", onDown));
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const g = ctx.createLinearGradient(0, 0, 0, c.height);
      g.addColorStop(0, "#0b0d1c");
      g.addColorStop(1, "#1b0a20");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, c.height - 6 * dpr, c.width, 6 * dpr);
      for (const it of items) {
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.a);
        ctx.shadowColor = app.config.theme.accent;
        ctx.shadowBlur = 14 * dpr;
        ctx.drawImage(badge, -R, -R, R * 2, R * 2);
        ctx.restore();
      }
      for (const b of bursts) {
        ctx.strokeStyle = app.config.theme.neon;
        ctx.globalAlpha = 1 - b.t / 0.4;
        ctx.lineWidth = 3 * dpr;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R * (1 + b.t * 4), 0, 6.28);
        ctx.stroke();
        ctx.font = `700 ${18 * dpr}px ${FONT_SANS}`;
        ctx.fillStyle = "#fff";
        ctx.fillText("+1", b.x - 8 * dpr, b.y - R - b.t * 60 * dpr);
        ctx.globalAlpha = 1;
      }
    };
    draw();
    const start = () => {
      exp.querySelector(".game-start").hidden = true;
      playing = true;
      track("game_start", { id: h.id });
      let left = 10;
      let acc = 0;
      loop((dt) => {
        left -= dt;
        acc += dt;
        if (acc > 0.42) {
          acc = 0;
          spawn();
          if (Math.random() > 0.6) spawn();
        }
        for (const it of items) {
          it.y += it.v * dt;
          it.a += it.va * dt;
        }
        items = items.filter((it) => it.y < c.height + R);
        bursts.forEach((b) => (b.t += dt));
        bursts = bursts.filter((b) => b.t < 0.4);
        timeEl.textContent = String(Math.max(0, Math.ceil(left)));
        draw();
        if (left <= 0) {
          playing = false;
          track("game_end", { id: h.id, score });
          reward(h, { score });
          return false;
        }
      });
    };
    exp.querySelector('[data-act="play"]').onclick = start;
    setTimeout(() => exp.querySelector('[data-act="play"]')?.focus(), 50);
    if (app.autoplayGame) later(900, start);
  }

  function playUnlock(h) {
    const exp = $("scrExp");
    const code = `${
      app.config.creator.name
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 6)
        .toUpperCase() || "DROP"
    }-${(Math.random() * 9000 + 1000) | 0}`;
    exp.innerHTML = `
      <div class="exp-top"><span class="live"></span>Reward unlock</div>
      <p class="exp-title">${esc(h.product.activation.title)}</p>
      <div class="exp-body">
        <div class="flip-stage">
          <button type="button" class="flip" aria-label="Flip the card to reveal your reward">
            <span class="side front-side">${ICON.gift}<b>Tap to reveal</b></span>
            <span class="side back-side"><small>REWARD UNLOCKED</small><strong>${esc(h.product.activation.reward || "A reward")}</strong><code>${code}</code></span>
          </button>
        </div>
      </div>`;
    show("scrExp");
    const flip = exp.querySelector(".flip");
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      flip.classList.add("flipped");
      later(500, () => confetti(120));
      later(2600, () => reward(h));
    };
    flip.onclick = go;
    later(1600, go);
  }

  /* ---- reward ------------------------------------------------------------------- */
  function reward(h, { score = null } = {}) {
    if (!run || run.rewarded) return;
    run.rewarded = true;
    setStep(2);
    const scr = $("scrReward");
    const a = h.product.activation;
    scr.innerHTML = `
      <div class="badge">${ICON.gift}</div>
      <h3>Reward unlocked</h3>
      <p>${score != null ? `You caught ${score}! ` : ""}${esc(a.reward || "A reward only fans with the merch can get.")}</p>
      <button type="button" class="btn btn-primary" data-act="cta">Make this real${ICON.arrow}</button>
      <button type="button" class="btn btn-ghost" data-act="close">${run.native ? "Explore the shelf" : "Back to the shelf"}</button>`;
    el.querySelector(".pop").classList.remove("go");
    el.querySelector(".pop").hidden = true;
    show("scrReward");
    later(150, () => confetti());
    track("reward_redeem", { id: h.id, kind: a.kind });
  }

  /* ---- shell ----------------------------------------------------------------------- */
  function render(h, native) {
    const a = h.product.activation;
    const product = h.product.name;
    el.classList.toggle("native", native);
    el.innerHTML = `
      <button type="button" class="icon-btn close" data-act="close" aria-label="Close">${ICON.close}</button>
      <div class="act-copy">
        <p class="kicker">What fans experience · ${esc(KIND_LABEL[a.kind])}</p>
        <h2>${esc(a.title)}</h2>
        <p>${esc(a.description)}</p>
        <ol class="act-steps">
          <li class="on"><i>1</i>A fan scans the tag on the ${esc(product)}</li>
          <li><i>2</i>${esc(KIND_LABEL[a.kind])} opens in the browser — no app</li>
          <li><i>3</i>Reward unlocked${a.reward ? `: ${esc(a.reward)}` : ""}</li>
        </ol>
        <div class="act-actions">
          <button type="button" class="btn btn-ghost" data-act="replay">${ICON.replay}Replay</button>
          <a class="btn btn-primary" href="${esc(app.joinUrl())}" data-act="cta">Make this real${ICON.arrow}</a>
        </div>
        <div class="act-qr">
          <canvas width="192" height="192" role="img" aria-label="QR code that opens this experience on your phone"></canvas>
          <p><b>Try it on your phone</b>Scan with your camera — this exact experience opens full-screen.</p>
        </div>
      </div>
      <div class="phone-wrap">
        <div class="phone">
          <div class="notch" aria-hidden="true"></div>
          <div class="screen">
            <div class="statusbar" aria-hidden="true"><span>9:41</span><span>5G ▮▮▮</span></div>
            <div class="scr cam on" id="scrCam">
              <div class="feed" style="background-image:url(${h.thumbLarge || ""})"></div>
              <p class="cam-hint">${native ? "Tag detected" : "Point your camera at the tag"}</p>
              <div class="brackets" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
              <div class="scanline" aria-hidden="true"></div>
              <div class="ripple" aria-hidden="true"></div>
              <div class="cam-chip">${ICON.nfc}<span>medialife.ai/a/${esc(h.id)}</span></div>
            </div>
            <div class="scr exp" id="scrExp"></div>
            <div class="scr reward" id="scrReward" aria-live="polite"></div>
            <canvas class="confetti" aria-hidden="true"></canvas>
          </div>
        </div>
        <div class="pop" aria-hidden="true" hidden><canvas class="sparkles"></canvas><div class="pop-shadow"></div><div class="pop-inner"></div></div>
      </div>`;
    const qr = el.querySelector(".act-qr canvas");
    if (qr && !native && matchMedia("(min-width: 761px)").matches) {
      drawQR(qr.getContext("2d"), app.activateUrl(h.id), 0, 0, 192, {
        dark: "#111216",
        light: "#ffffff",
        margin: 1,
      });
      track("ar_qr", { id: h.id });
    }
  }

  function start(h, native) {
    stop();
    run = { id: h.id, timers: [], rafs: [], cleanup: [], native, rewarded: false };
    render(h, native);
    setStep(0);
    const kind = h.product.activation.kind;
    const t0 = native ? 200 : 900;
    later(t0, () => $("scrCam").classList.add("locking"));
    later(native ? 700 : 2100, () => {
      $("scrCam").classList.add("found");
      navigator.vibrate?.(30);
    });
    later(native ? 1500 : 3000, () => {
      setStep(1);
      track("activation_launch", { id: h.id, kind });
      ({ ar: playAR, model: playModel, video: playVideo, game: playGame, unlock: playUnlock })[
        kind
      ](h);
    });
  }

  el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    if (t.dataset.act === "close") api.close();
    if (t.dataset.act === "replay" && run) start(app.products.get(run.id), run.native);
    if (t.dataset.act === "cta") {
      track("apply_open", { from: "activation" });
      if (t.tagName === "BUTTON") location.href = app.joinUrl();
    }
  });

  const api = {
    open(id, { native = false } = {}) {
      const h = app.products.get(id);
      if (!h) return;
      track("activation_open", { id, kind: h.product.activation.kind, native });
      h.thumbLarge = h.thumbLarge || app.thumbnail(id, 384, "#2a2622");
      start(h, native);
      if (!isOpen(el)) {
        app.scene?.setPaused(true);
        openLayer(el, {
          focus: native ? '[data-act="close"]' : ".act-copy h2",
          onClose: () => {
            stop();
            app.scene?.setPaused(false);
          },
        });
        el.querySelector(".act-copy h2")?.setAttribute("tabindex", "-1");
      }
    },
    close() {
      closeLayer(el);
    },
    get isOpen() {
      return isOpen(el);
    },
  };
  return api;
}
