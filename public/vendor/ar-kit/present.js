/* ar-kit/present.js: presentation mode for the activated-retail pages (a looping, captioned
 * walkthrough for a meeting-room screen or a kiosk).
 *
 *   <script defer src="/vendor/ar-kit/present.js"></script>
 *   ARPresent.start({
 *     steps: 6,
 *     go: (i) => showStep(i),                    // camera move, theme switch… for step i
 *     dwell: (i) => 12000,                       // ms on each step (default 9000)
 *     caption: (i) => ({ title, body, eyebrow }), // large lower third (optional; eyebrow optional)
 *     onStop: (reason) => restoreUi(),
 *     onPause: (paused) => {},                   // optional: hold any camera drift while paused
 *     source: 'url',                             // analytics only
 *   });
 *   ARPresent.stop();  ARPresent.active  ARPresent.paused  ARPresent.index
 *
 * While active, <body> has class "ar-presenting" (the page's own CSS hides its chrome), the page
 * asks for full screen and a screen wake lock where the browser allows it, and a slim control bar
 * (previous / pause / next / full screen / stop) shows on pointer movement. Keys: Esc stops, Space
 * pauses, ← → (and a clicker's Page Up / Page Down) step. It loops; a tap, drag or scroll on the
 * page pauses it and it picks up again after 20 s without input. Leaving full screen stops it.
 * ARTrack events: present_start {source, steps}, present_stop {reason, secs, steps}.
 * Self-contained (injected CSS picks up the page's --accent, --display, --body, --mono), never throws.
 */
(function () {
  "use strict";
  if (window.ARPresent) return;

  var RESUME_MS = 20000,
    BAR_MS = 2600,
    DWELL = 9000;
  var S = null,
    ui = null,
    hideT = 0;
  var reduce = false;
  try {
    reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {}

  function track(n, p) {
    try {
      if (window.ARTrack) window.ARTrack.event(n, p);
    } catch (e) {}
  }
  function warn(e) {
    try {
      console.warn("ARPresent", e);
    } catch (_) {}
  }
  function call(fn, a) {
    if (typeof fn !== "function") return undefined;
    try {
      return fn(a);
    } catch (e) {
      warn(e);
      return undefined;
    }
  }
  function now() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  var CSS = [
    '.arp{position:fixed;inset:0;z-index:90;pointer-events:none;color:#fff;font-family:var(--body,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif);-webkit-font-smoothing:antialiased;}',
    ".arp[hidden]{display:none!important;}",
    ".arp-scrim{position:absolute;left:0;right:0;bottom:0;height:min(56vh,520px);background:linear-gradient(180deg,rgba(6,5,12,0) 0%,rgba(6,5,12,.5) 38%,rgba(6,5,12,.84) 78%,rgba(6,5,12,.9) 100%);opacity:0;transition:opacity .7s ease;}",
    ".arp.on .arp-scrim{opacity:1;}",
    ".arp-cap{position:absolute;box-sizing:border-box;left:max(clamp(16px,5.5vw,88px),env(safe-area-inset-left,0px));right:max(clamp(16px,5.5vw,88px),env(safe-area-inset-right,0px));bottom:calc(clamp(20px,6.5vh,72px) + env(safe-area-inset-bottom,0px));max-width:1040px;opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .6s cubic-bezier(.2,.8,.2,1);}",
    ".arp.on .arp-cap{opacity:1;transform:none;}",
    ".arp.on .arp-cap.swap{opacity:0;transform:translateY(10px);transition-duration:.22s,.22s;}",
    ".arp-cap[hidden]{display:none;}",
    ".arp-eyebrow{display:flex;align-items:center;gap:12px;font:500 12px/1.3 var(--mono,ui-monospace,Menlo,monospace);letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.78);min-width:0;}",
    '.arp-eyebrow::before{content:"";flex:0 0 auto;width:30px;height:2px;border-radius:2px;background:var(--accent,#9270ff);box-shadow:0 0 12px var(--accent,#9270ff);}',
    ".arp-ey{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}",
    ".arp-count{flex:0 0 auto;color:rgba(255,255,255,.55);font-variant-numeric:tabular-nums;}",
    ".arp-title{font:700 clamp(28px,4.3vw,60px)/1.05 var(--display,inherit);letter-spacing:-.02em;margin:16px 0 14px;text-wrap:balance;text-shadow:0 2px 30px rgba(0,0,0,.35);}",
    ".arp-body{margin:0;max-width:60ch;font-size:clamp(15.5px,1.5vw,21px);line-height:1.5;color:rgba(242,240,250,.9);text-wrap:pretty;text-shadow:0 1px 12px rgba(0,0,0,.3);}",
    ".arp-prog{margin-top:24px;width:min(420px,60%);height:3px;border-radius:3px;background:rgba(255,255,255,.16);overflow:hidden;}",
    ".arp-prog i{display:block;height:100%;border-radius:3px;background:var(--accent,#9270ff);box-shadow:0 0 10px var(--accent,#9270ff);transform:scaleX(0);transform-origin:0 50%;animation:arpProg linear forwards;}",
    ".arp.is-paused .arp-prog i{animation-play-state:paused;}",
    "@keyframes arpProg{to{transform:scaleX(1);}}",
    ".arp-bar{position:absolute;top:calc(16px + env(safe-area-inset-top,0px));left:50%;display:flex;align-items:center;gap:2px;padding:5px;border-radius:999px;box-sizing:border-box;max-width:calc(100vw - 32px);",
    "  background:rgba(14,12,27,.8);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),inset 0 1px 0 rgba(255,255,255,.2),0 12px 32px rgba(0,0,0,.35);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);",
    "  opacity:0;transform:translate(-50%,-10px);pointer-events:none;transition:opacity .3s ease,transform .35s cubic-bezier(.2,.8,.2,1);}",
    ".arp.bar-on .arp-bar,.arp.is-paused .arp-bar{opacity:1;transform:translate(-50%,0);pointer-events:auto;}",
    ".arp.on .arp-bar:has(:focus-visible){opacity:1;transform:translate(-50%,0);pointer-events:auto;}",
    ".arp-bar button{appearance:none;-webkit-appearance:none;border:0;margin:0;background:transparent;color:#fff;height:40px;min-width:40px;padding:0 10px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font:600 13.5px/1 var(--body,inherit);-webkit-tap-highlight-color:transparent;transition:background .2s;}",
    ".arp-bar button:hover{background:rgba(255,255,255,.12);}",
    ".arp-bar button:focus-visible{outline:2px solid #fff;outline-offset:-2px;}",
    ".arp-bar button[hidden]{display:none;}",
    ".arp-bar svg{width:18px;height:18px;flex:0 0 auto;}",
    ".arp-step{padding:0 10px;min-width:5ch;text-align:center;white-space:nowrap;font:500 12px/1 var(--mono,ui-monospace,Menlo,monospace);letter-spacing:.06em;color:rgba(255,255,255,.72);font-variant-numeric:tabular-nums;}",
    ".arp-sep{width:1px;height:22px;margin:0 4px;background:rgba(255,255,255,.16);flex:0 0 auto;}",
    ".arp-bar .arp-stop{background:rgba(255,255,255,.1);padding:0 14px;}",
    ".arp-stop kbd{font:500 10.5px/1 var(--mono,ui-monospace,Menlo,monospace);padding:3px 5px;border-radius:5px;border:1px solid rgba(255,255,255,.28);color:rgba(255,255,255,.75);}",
    ".arp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;}",
    "html.arp-idle,html.arp-idle *{cursor:none!important;}",
    "@media (pointer:coarse){.arp-stop kbd{display:none;}}",
    "@media (max-width:600px){",
    "  .arp-title{font-size:25px;margin:12px 0 10px;}",
    "  .arp-body{font-size:15px;line-height:1.45;}",
    "  .arp-eyebrow{font-size:10.5px;gap:10px;} .arp-eyebrow::before{width:22px;}",
    "  .arp-prog{margin-top:16px;}",
    "  .arp-bar button{height:38px;min-width:38px;padding:0 8px;} .arp-bar .arp-stop{padding:0 12px;} .arp-step{padding:0 6px;}",
    "}",
    "@media (max-height:520px){.arp-body{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;} .arp-title{font-size:24px;}}",
    "@media (prefers-reduced-motion:reduce){.arp-scrim,.arp-cap,.arp-bar{transition:none!important;} .arp.on .arp-cap.swap{opacity:1;transform:none;}}",
  ].join("\n");

  var ICON = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>',
    fsOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    fsOff:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  };

  function build() {
    if (ui) return ui;
    var st = document.createElement("style");
    st.id = "ar-present-css";
    st.textContent = CSS;
    document.head.appendChild(st);
    var root = document.createElement("div");
    root.className = "arp";
    root.hidden = true;
    root.innerHTML =
      '<div class="arp-scrim" aria-hidden="true"></div>' +
      '<section class="arp-cap" aria-live="polite" aria-atomic="true" aria-label="Presentation caption">' +
      '<div class="arp-eyebrow"><span class="arp-ey"></span><span class="arp-count"></span></div>' +
      '<h2 class="arp-title"></h2><p class="arp-body"></p>' +
      '<div class="arp-prog" aria-hidden="true"><i></i></div>' +
      "</section>" +
      '<div class="arp-bar" role="toolbar" aria-label="Presentation controls">' +
      '<button type="button" data-a="prev" aria-label="Previous step" aria-keyshortcuts="ArrowLeft">' +
      ICON.prev +
      "</button>" +
      '<button type="button" data-a="pause" aria-label="Pause" aria-keyshortcuts="Space">' +
      ICON.pause +
      "</button>" +
      '<button type="button" data-a="next" aria-label="Next step" aria-keyshortcuts="ArrowRight">' +
      ICON.next +
      "</button>" +
      '<span class="arp-step" aria-hidden="true"></span>' +
      '<button type="button" data-a="fs" aria-label="Full screen">' +
      ICON.fsOn +
      "</button>" +
      '<span class="arp-sep" aria-hidden="true"></span>' +
      '<button type="button" data-a="stop" class="arp-stop" aria-keyshortcuts="Escape">Stop<kbd>Esc</kbd></button>' +
      "</div>" +
      '<div class="arp-sr" role="status" aria-live="polite"></div>';
    document.body.appendChild(root);
    var q = function (s) {
      return root.querySelector(s);
    };
    ui = {
      root: root,
      cap: q(".arp-cap"),
      ey: q(".arp-ey"),
      count: q(".arp-count"),
      title: q(".arp-title"),
      body: q(".arp-body"),
      prog: q(".arp-prog"),
      bar: q(".arp-bar"),
      step: q(".arp-step"),
      pause: q('[data-a="pause"]'),
      fs: q('[data-a="fs"]'),
      sr: q(".arp-sr"),
    };
    ui.bar.addEventListener("click", function (e) {
      try {
        var b = e.target.closest && e.target.closest("button[data-a]");
        if (!b || !S) return;
        var a = b.getAttribute("data-a");
        if (a === "prev") step(-1);
        else if (a === "next") step(1);
        else if (a === "pause") toggleHold();
        else if (a === "fs") toggleFs();
        else if (a === "stop") stop("button");
        showBar();
      } catch (err) {
        warn(err);
      }
    });
    ui.bar.addEventListener("pointerenter", function () {
      if (S) S.overBar = true;
    });
    ui.bar.addEventListener("pointerleave", function () {
      if (S) {
        S.overBar = false;
        showBar();
      }
    });
    return ui;
  }

  // ---- full screen + wake lock (both optional: a browser may refuse either) ----
  function fsEl() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function fsAvailable() {
    var d = document.documentElement;
    return !!(
      (document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
      (d.requestFullscreen || d.webkitRequestFullscreen)
    );
  }
  function enterFs() {
    try {
      if (!S || fsEl() || !fsAvailable()) return;
      var d = document.documentElement;
      var p = d.requestFullscreen
        ? d.requestFullscreen({ navigationUI: "hide" })
        : d.webkitRequestFullscreen();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function exitFs() {
    try {
      if (!fsEl()) return;
      var p = document.exitFullscreen
        ? document.exitFullscreen()
        : document.webkitExitFullscreen && document.webkitExitFullscreen();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function toggleFs() {
    if (!S) return;
    if (fsEl()) {
      S.fsLeaving = true;
      exitFs();
    } else enterFs();
  }
  function syncFs() {
    if (!ui) return;
    var on = !!fsEl();
    ui.fs.hidden = !fsAvailable();
    ui.fs.innerHTML = on ? ICON.fsOff : ICON.fsOn;
    ui.fs.setAttribute("aria-label", on ? "Exit full screen" : "Full screen");
  }
  function onFsChange() {
    if (!S) return;
    if (fsEl()) S.fs = true;
    else {
      // Esc in full screen never reaches the page: the browser leaves full screen instead, so treat
      // leaving it (unless our own button did) as the stop the presenter asked for
      var byUs = S.fsLeaving;
      S.fsLeaving = false;
      if (S.fs && !byUs) {
        S.fs = false;
        stop("fullscreen_exit");
        return;
      }
      S.fs = false;
    }
    syncFs();
  }
  function lock() {
    try {
      if (!S || S.lock || document.hidden || !navigator.wakeLock || !navigator.wakeLock.request)
        return;
      navigator.wakeLock.request("screen").then(
        function (l) {
          if (!S) {
            l.release().catch(function () {});
            return;
          }
          S.lock = l;
          l.addEventListener("release", function () {
            if (S && S.lock === l) S.lock = null;
          });
        },
        function () {},
      );
    } catch (e) {}
  }
  function unlock(s) {
    try {
      if (s && s.lock) {
        s.lock.release().catch(function () {});
        s.lock = null;
      }
    } catch (e) {}
  }

  // ---- stepping ----
  function dwellOf(i) {
    var d = call(S.opts.dwell, i);
    d = +d;
    return d > 500 ? Math.min(d, 600000) : DWELL;
  }
  function arm() {
    clearTimeout(S.timer);
    if (S.paused) return;
    S.startedAt = now();
    S.timer = setTimeout(
      function () {
        try {
          if (S) show(S.i + 1);
        } catch (e) {
          warn(e);
        }
      },
      Math.max(0, S.remaining),
    );
  }
  function restartProgress(ms) {
    var old = ui.prog.firstChild,
      bar = document.createElement("i");
    bar.style.animationDuration = ms + "ms";
    if (old) ui.prog.replaceChild(bar, old);
    else ui.prog.appendChild(bar);
  }
  function caption(i) {
    var c = call(S.opts.caption, i);
    if (!c || (!c.title && !c.body)) {
      ui.cap.hidden = true;
      return;
    }
    ui.cap.hidden = false;
    var fill = function () {
      ui.ey.textContent = c.eyebrow ? String(c.eyebrow) : "";
      ui.count.textContent = i + 1 + " / " + S.n;
      ui.title.textContent = c.title ? String(c.title) : "";
      ui.body.textContent = c.body ? String(c.body) : "";
    };
    if (reduce || !S.shown) {
      fill();
      return;
    }
    ui.cap.classList.add("swap");
    clearTimeout(S.swapT);
    S.swapT = setTimeout(function () {
      if (!S) return;
      fill();
      void ui.cap.offsetWidth;
      ui.cap.classList.remove("swap");
    }, 230);
  }
  function show(i) {
    if (!S) return;
    S.i = ((i % S.n) + S.n) % S.n;
    S.dirty = false;
    S.seen++;
    call(S.opts.go, S.i);
    if (!S) return; // go() may have stopped the presentation
    caption(S.i);
    S.shown = true;
    ui.step.textContent = S.i + 1 + " / " + S.n;
    S.remaining = dwellOf(S.i);
    restartProgress(S.remaining);
    arm();
  }
  function step(d) {
    if (!S) return;
    if (!S.hold) {
      clearTimeout(S.resumeT);
      setPaused(false, true);
    }
    show(S.i + d);
  }
  function setPaused(p, quiet) {
    if (!S || S.paused === p) return;
    S.paused = p;
    ui.root.classList.toggle("is-paused", p);
    if (p) {
      clearTimeout(S.timer);
      S.remaining = Math.max(0, S.remaining - (now() - S.startedAt));
    }
    ui.pause.innerHTML = p ? ICON.play : ICON.pause;
    ui.pause.setAttribute("aria-label", p ? "Resume" : "Pause");
    if (!quiet) ui.sr.textContent = p ? "Presentation paused" : "Presentation resumed";
    call(S.opts.onPause, p);
    if (!p) arm();
    showBar();
  }
  function resume() {
    if (!S) return;
    clearTimeout(S.resumeT);
    S.hold = false;
    var fresh = S.dirty;
    setPaused(false, fresh);
    // after the viewer moved things, start the step again so the camera and caption line up
    if (fresh) show(S.i);
  }
  function toggleHold() {
    if (!S) return;
    if (S.paused) resume();
    else {
      S.hold = true;
      clearTimeout(S.resumeT);
      setPaused(true);
    }
  }
  function interacted() {
    if (!S) return;
    S.dirty = true;
    if (!S.paused) setPaused(true);
    if (!S.hold) {
      clearTimeout(S.resumeT);
      S.resumeT = setTimeout(resume, RESUME_MS);
    }
  }

  // ---- control bar visibility (and a hidden cursor while nothing moves) ----
  function showBar() {
    if (!S || !ui) return;
    ui.root.classList.add("bar-on");
    document.documentElement.classList.remove("arp-idle");
    clearTimeout(S.barT);
    S.barT = setTimeout(hideBar, BAR_MS);
  }
  function hideBar() {
    if (!S || !ui) return;
    var kb = false;
    try {
      kb = !!ui.bar.querySelector(":focus-visible");
    } catch (e) {}
    if (S.paused || S.overBar || kb) {
      clearTimeout(S.barT);
      S.barT = setTimeout(hideBar, BAR_MS);
      return;
    }
    ui.root.classList.remove("bar-on");
    document.documentElement.classList.add("arp-idle");
  }

  // ---- global input (installed once; inert unless a presentation is running) ----
  function inBar(t) {
    return !!(ui && t && t.nodeType === 1 && ui.bar.contains(t));
  }
  function typing(t) {
    return !!(
      t &&
      t.nodeType === 1 &&
      (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
    );
  }
  addEventListener(
    "keydown",
    function (e) {
      try {
        if (!S || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target))
          return;
        var k = e.key,
          handled = true;
        if (k === "Escape" || k === "Esc") stop("key");
        else if (k === " " || k === "Spacebar") {
          if (inBar(e.target)) return;
          toggleHold();
        } else if (k === "ArrowRight" || k === "PageDown") step(1);
        else if (k === "ArrowLeft" || k === "PageUp") step(-1);
        else {
          handled = false;
          if (k === "Tab") showBar();
        }
        if (handled) {
          e.preventDefault();
          e.stopImmediatePropagation();
          showBar();
        }
      } catch (err) {
        warn(err);
      }
    },
    true,
  );
  addEventListener(
    "pointerdown",
    function (e) {
      try {
        if (S && !inBar(e.target)) {
          interacted();
          showBar();
        }
      } catch (err) {
        warn(err);
      }
    },
    true,
  );
  addEventListener(
    "wheel",
    function (e) {
      try {
        if (S && !inBar(e.target)) interacted();
      } catch (err) {
        warn(err);
      }
    },
    { capture: true, passive: true },
  );
  addEventListener(
    "pointermove",
    function (e) {
      try {
        if (!S || e.pointerType === "touch") return;
        showBar();
        // still busy with the scene: keep the automatic resume at bay
        if (S.paused && !S.hold && S.dirty) {
          clearTimeout(S.resumeT);
          S.resumeT = setTimeout(resume, RESUME_MS);
        }
      } catch (err) {
        warn(err);
      }
    },
    { capture: true, passive: true },
  );
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);
  document.addEventListener("visibilitychange", function () {
    try {
      if (!S) return;
      if (document.hidden) {
        S.away = !S.paused;
        if (S.away) setPaused(true, true);
      } else {
        lock();
        if (S.away) {
          S.away = false;
          if (!S.hold) setPaused(false, true);
        }
      }
    } catch (e) {
      warn(e);
    }
  });

  // ---- public API ----
  function start(opts) {
    try {
      if (!opts || typeof opts.go !== "function") return false;
      var n = Math.floor(+opts.steps || 0);
      if (n < 1) return false;
      if (S) stop("restart");
      build();
      S = {
        opts: opts,
        n: n,
        i: 0,
        seen: 0,
        t0: Date.now(),
        paused: false,
        hold: false,
        dirty: false,
        shown: false,
        remaining: 0,
        startedAt: now(),
        timer: 0,
        resumeT: 0,
        barT: 0,
        swapT: 0,
        fs: false,
        fsLeaving: false,
        lock: null,
        opener: document.activeElement,
        source: String(opts.source || "unknown").slice(0, 40),
      };
      document.body.classList.add("ar-presenting");
      clearTimeout(hideT);
      ui.root.hidden = false;
      ui.root.classList.remove("is-paused", "on");
      ui.cap.classList.remove("swap");
      ui.pause.innerHTML = ICON.pause;
      ui.pause.setAttribute("aria-label", "Pause");
      void ui.root.offsetWidth;
      ui.root.classList.add("on");
      if (opts.fullscreen !== false) enterFs();
      syncFs();
      lock();
      track("present_start", { source: S.source, steps: n });
      show(typeof opts.from === "number" ? opts.from : 0);
      if (!S) return false;
      showBar();
      // Focus is not pulled into the bar: a focused button would keep it on screen for good. The
      // page's own chrome is hidden now, so drop focus from it; Tab reaches the bar, and the keys
      // work from anywhere.
      try {
        var ae = document.activeElement;
        if (ae && ae !== document.body && !ui.root.contains(ae) && ae.blur) ae.blur();
      } catch (e) {}
      ui.sr.textContent =
        "Presentation started. Press Escape to stop, Space to pause, arrow keys to step, Tab for the controls.";
      return true;
    } catch (e) {
      warn(e);
      try {
        stop("error");
      } catch (_) {}
      return false;
    }
  }

  function stop(reason) {
    var s = S;
    if (!s) return;
    S = null;
    try {
      clearTimeout(s.timer);
      clearTimeout(s.resumeT);
      clearTimeout(s.barT);
      clearTimeout(s.swapT);
      document.body.classList.remove("ar-presenting");
      document.documentElement.classList.remove("arp-idle");
      if (ui) {
        // fade the caption out with the page's chrome coming back, then take it out of the page
        ui.root.classList.remove("on", "bar-on", "is-paused");
        ui.sr.textContent = "";
        clearTimeout(hideT);
        hideT = setTimeout(
          function () {
            if (!S) ui.root.hidden = true;
          },
          reduce ? 0 : 700,
        );
      }
      unlock(s);
      if (s.fs && fsEl()) exitFs();
      track("present_stop", {
        reason: String(reason || "api").slice(0, 40),
        secs: Math.round((Date.now() - s.t0) / 1000),
        steps: s.seen,
      });
    } catch (e) {
      warn(e);
    }
    call(s.opts.onStop, reason || "api");
    // hand focus back to where it was, if that is still on screen
    try {
      var o = s.opener,
        ok =
          o &&
          o !== document.body &&
          o.isConnected &&
          o.getClientRects().length &&
          (typeof o.checkVisibility !== "function" ||
            o.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
      if (ok) o.focus({ preventScroll: true });
      else if (document.activeElement && ui && ui.root.contains(document.activeElement))
        document.activeElement.blur();
    } catch (e) {}
  }

  window.ARPresent = {
    start: start,
    stop: function (reason) {
      try {
        stop(reason || "api");
      } catch (e) {
        warn(e);
      }
    },
    next: function () {
      try {
        step(1);
      } catch (e) {
        warn(e);
      }
    },
    prev: function () {
      try {
        step(-1);
      } catch (e) {
        warn(e);
      }
    },
    pause: function () {
      try {
        if (S && !S.paused) toggleHold();
      } catch (e) {
        warn(e);
      }
    },
    resume: function () {
      try {
        if (S && S.paused) resume();
      } catch (e) {
        warn(e);
      }
    },
    get active() {
      return !!S;
    },
    get paused() {
      return !!(S && S.paused);
    },
    get index() {
      return S ? S.i : -1;
    },
  };
})();
