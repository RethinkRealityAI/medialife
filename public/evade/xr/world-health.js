// World-tracking health for 8th Wall engine-binary pages (SLAM): keeps the frame rate up so tracking holds,
// tells the page when SLAM has settled, and logs what happened on the phone.
//
// Why (Android world-tracking investigation, 2026-11-18): on the same Samsung phone the light world pages
// (Bobo Hoops, Bobo Portal) held NORMAL tracking at ~57 fps, while the walk-in hideout dropped to 25-40 fps with
// 0.5-10 s main-thread stalls and sat in LIMITED for minutes; on iPhone the hideout ran at 5-15 fps while it loaded
// and the camera path drifted 14 m upward. SLAM needs every camera frame and on-time motion samples: long frames
// and stalls (shader compiles, texture uploads, GLB parsing) during the first seconds or while walking make the
// map slip, so content "travels with you" or "flies away". Samsung Internet also gets only a 640x480 camera from
// the engine (Chrome gets 960x720+), which gives SLAM fewer features to hold on to.
//
// Use (plain ES module, no dependencies):
//   import { worldHealth } from '/evade/xr/world-health.js';
//   const wh = worldHealth({ page: 'cola-run', canvas, baseDpr: 1.5 });   // call BEFORE XR8.run (camera wrap)
//   XR8.addCameraPipelineModules([..., XR8.XrController.pipelineModule(), wh.module, app]);
//   wh.sizeCanvas();                    // instead of the page's own canvas sizing (adaptive pixel ratio)
//   if (!wh.settled()) { /* keep Place disabled: "Hold still a moment…" */ }
//   wh.busy(true) / wh.busy(false)      // around heavy work (loading a room); stalls are logged against it
//   wh.restart()                        // after XR8.stop() + XR8.run() (camera swap): SLAM starts over
//   diagBody.health = wh.snapshot()     // pages with their own kc-diag record; or { post: true } to post here
//
// URL knobs for phone A/B tests: ?dpr=1|1.25|1.5|2 (start / max pixel ratio), ?adapt=0 (fixed ratio),
// ?cam=720 (ask Android for a 960x720 camera, the engine's Chrome size, also on Samsung Internet), ?diag (overlay).

const qs = new URLSearchParams(location.search);
const now = () => performance.now();

// Pass-through camera wrapper: records what the camera really delivers (label, size, fps), and with ?cam=720
// asks Android for the size the engine already uses on Chrome. Installed once, before XR8.run.
const cam = { label: '', width: 0, height: 0, frameRate: 0, asked: '' };
let wrapped = false;
function wrapCamera() {
  if (wrapped || !navigator.mediaDevices?.getUserMedia) return;
  wrapped = true;
  const md = navigator.mediaDevices;
  const orig = md.getUserMedia.bind(md);
  const android = /Android/i.test(navigator.userAgent);
  md.getUserMedia = (c) => {
    if (c && c.video && typeof c.video === 'object' && android && qs.get('cam') === '720') {
      c = { ...c, video: { ...c.video, width: { ideal: 960 }, height: { ideal: 720 } } };
      cam.asked = '960x720';
    }
    return orig(c).then((stream) => {
      const t = stream.getVideoTracks?.()[0];
      if (t) {
        const s = t.getSettings?.() || {};
        Object.assign(cam, { label: t.label || '', width: s.width || 0, height: s.height || 0, frameRate: Math.round(s.frameRate || 0) });
      }
      return stream;
    });
  };
}

export function worldHealth(opts = {}) {
  const page = opts.page || 'world';
  const canvas = opts.canvas;
  const maxDpr = Math.min(3, Math.max(1, +qs.get('dpr') || opts.baseDpr || 1.5));
  const minDpr = Math.min(maxDpr, opts.minDpr || 1);
  const adapt = qs.get('adapt') !== '0' && opts.adapt !== false;
  const settleMs = opts.settleMs || 1200;
  wrapCamera();

  const sid = `${page.slice(0, 12)}-${Math.random().toString(36).slice(2, 10)}`.replace(/[^a-z0-9-]/g, '');
  const t0 = now();
  const s = (t) => Math.round((t - t0) / 100) / 10; // seconds since load, 0.1 s
  let dpr = maxDpr;
  let runAt = 0, frames = 0, last = 0, secT = 0, secN = 0, fps = 0;
  let status = '', normalSince = 0, lastStall = -1e9, busyWhat = '';
  let lowFor = 0, highFor = 0;
  const log = { fps: [], tracking: [], stalls: [], dpr: [[0, dpr]], restarts: 0 };

  function sizeCanvas() {
    if (!canvas) return;
    const r = Math.min(devicePixelRatio || 1, dpr);
    const w = Math.round(innerWidth * r), h = Math.round(innerHeight * r);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function setDpr(v, why) {
    v = Math.round(Math.min(maxDpr, Math.max(minDpr, v)) * 100) / 100;
    if (v === dpr) return;
    dpr = v; log.dpr.push([s(now()), dpr, why]); sizeCanvas();
  }

  function frame() {
    const t = now();
    if (last) {
      const gap = t - last;
      if (gap > 250) { // a stall: the engine got no frame and no motion samples for this long
        lastStall = t;
        if (log.stalls.length < 40) log.stalls.push([s(t), Math.round(gap), busyWhat || '', status]);
      }
    }
    last = t; frames++; secN++;
    if (t - secT >= 1000) {
      fps = Math.round((secN * 1000) / (t - (secT || t - 1000)));
      secT = t; secN = 0;
      if (log.fps.length < 600) log.fps.push(fps);
      if (adapt && runAt && t - runAt > 3000) {
        // under 40 fps for 2 s: draw fewer pixels. Back up only after 8 s well over 55 fps.
        lowFor = fps < 40 ? lowFor + 1 : 0;
        highFor = fps > 55 ? highFor + 1 : 0;
        if (lowFor >= 2) { setDpr(dpr - 0.25, `fps ${fps}`); lowFor = 0; }
        else if (highFor >= 8 && dpr < maxDpr) { setDpr(dpr + 0.25, `fps ${fps}`); highFor = 0; }
      }
      drawDiag();
    }
  }

  function onStatus(st, reason) {
    const t = now();
    const v = st + (reason && reason !== 'UNSPECIFIED' ? ` (${reason})` : '');
    if (v === status) return;
    status = v;
    normalSince = st === 'NORMAL' ? t : 0;
    if (log.tracking.length < 80) log.tracking.push([s(t), v]);
  }

  const module = {
    name: 'world-health',
    onStart: () => { runAt = now() || 1; last = 0; normalSince = 0; status = ''; },
    onUpdate: ({ processCpuResult }) => {
      frame();
      const r = processCpuResult && processCpuResult.reality;
      if (r && r.trackingStatus) onStatus(r.trackingStatus, r.trackingReason);
    },
    listeners: [{ event: 'reality.trackingstatus', process: ({ detail }) => onStatus(detail.status, detail.reason) }],
  };

  // Settled = NORMAL for settleMs, no stall in the last second, and a few seconds of frames since this run began.
  function settled() {
    const t = now();
    return !!(normalSince && runAt && t - normalSince >= settleMs && t - lastStall > 1000 && t - runAt > 1500);
  }

  function snapshot() {
    return {
      v: 1, dpr, maxDpr, fpsNow: fps, tracking: status, cam: { ...cam },
      settled: settled(), restarts: log.restarts,
      fpsLog: log.fps.slice(-180), trackLog: log.tracking, stalls: log.stalls, dprLog: log.dpr,
    };
  }

  // Standalone posting (pages without their own kc-diag record): every 20 s and when the page hides.
  let posted = 0;
  function post() {
    if (!opts.post) return;
    const body = JSON.stringify({ page, sid, secs: Math.round((now() - t0) / 1000), health: snapshot(), screen: [innerWidth, innerHeight, devicePixelRatio], ua: navigator.userAgent, ...(opts.extra ? opts.extra() : {}) });
    if (body.length > 90000) return;
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' }))))
        fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true });
    } catch (e) { /* offline */ }
    posted = now();
  }
  if (opts.post) {
    setInterval(() => { if (runAt && now() - posted > 20000) post(); }, 5000);
    addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') post(); });
    addEventListener('pagehide', post);
  }

  let diagEl = null;
  function drawDiag() {
    if (!qs.has('diag')) return;
    if (!diagEl) {
      diagEl = document.createElement('pre');
      diagEl.setAttribute('aria-hidden', 'true');
      diagEl.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 56px);z-index:99;margin:0;padding:4px 6px;font:11px/1.3 ui-monospace,monospace;color:#fff;background:#000a;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(diagEl);
    }
    const st = log.stalls[log.stalls.length - 1];
    diagEl.textContent = `slam ${status || '-'}${settled() ? ' ✓' : ''}  fps ${fps}  dpr ${dpr}\ncam ${cam.width}x${cam.height}@${cam.frameRate}${cam.asked ? ' (asked ' + cam.asked + ')' : ''}` + (st ? `\nstall ${st[1]} ms @${st[0]}s ${st[2]}` : '');
  }

  return {
    module, sizeCanvas, settled, snapshot, post, sid,
    get fps() { return fps; },
    get dpr() { return dpr; },
    get tracking() { return status; },
    busy(what) { busyWhat = what ? String(what === true ? 'busy' : what) : ''; },
    restart() { log.restarts++; runAt = now() || 1; normalSince = 0; status = ''; last = 0; lowFor = highFor = 0; },
  };
}
