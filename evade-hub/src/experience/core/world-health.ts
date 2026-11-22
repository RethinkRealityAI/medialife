// World-tracking health for engine-binary pages (SLAM): keeps the frame rate up so tracking holds, tells the page
// when SLAM has settled, and records what happened (fps, tracking, stalls, pixel ratio, camera size).
//
// TypeScript port of medialife `public/evade/xr/world-health.js` (the immersive skill's snippets/world-health.js),
// with one change: the drawing size comes from a `size()` callback (our canvas fills the experience container,
// which is not always the window: on desktop the app's sidebar takes the right side).
//
// Why (Android world-tracking investigation, 2026-11-18): SLAM needs every camera frame and on-time motion samples.
// Long frames and stalls (shader compiles, texture uploads, GLB parsing) during the first seconds or while walking
// make the map slip, so content "travels with you" or "flies away".
//
//   const wh = worldHealth({ page: 'evade-hub', canvas, size: () => [w, h], baseDpr: 1.5 }); // before XR8.run
//   XR8.addCameraPipelineModules([..., XR8.XrController.pipelineModule(), wh.module, app]);
//   wh.sizeCanvas();          // adaptive pixel ratio
//   wh.settled()              // gate Place on it
//   wh.busy('loading') / wh.busy('')
//   wh.restart()              // after XR8.stop() + XR8.run(): SLAM starts over
//   wh.regate()               // after XR8.XrController.recenter() (Move): settled() must be earned again
//   wh.note('place')          // breadcrumbs (shown with ?diag, kept in snapshot().notes)
//
// URL knobs: ?dpr=1|1.25|1.5|2, ?adapt=0, ?cam=720 (Android: ask 960x720, also on Samsung Internet), ?diag.

const qs = new URLSearchParams(location.search);
const now = () => performance.now();

interface CamInfo { label: string; width: number; height: number; frameRate: number; asked: string }
const cam: CamInfo = { label: '', width: 0, height: 0, frameRate: 0, asked: '' };
let wrapped = false;
function wrapCamera(): void {
  if (wrapped || !navigator.mediaDevices?.getUserMedia) return;
  wrapped = true;
  const md = navigator.mediaDevices;
  const orig = md.getUserMedia.bind(md);
  const android = /Android/i.test(navigator.userAgent);
  md.getUserMedia = (c?: MediaStreamConstraints) => {
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

export interface WorldHealthOptions {
  page?: string;
  canvas: HTMLCanvasElement;
  /** CSS size of the drawing area. Default: the window. */
  size?: () => [number, number];
  baseDpr?: number;
  minDpr?: number;
  adapt?: boolean;
  settleMs?: number;
  /** Extra lines for the ?diag overlay (app state: mode, inside, scale, programs...). */
  diagExtra?: () => string;
}

export interface PipelineModule {
  name: string;
  [k: string]: unknown;
}

export interface WorldHealth {
  module: PipelineModule;
  sizeCanvas(): void;
  settled(): boolean;
  snapshot(): Record<string, unknown>;
  readonly fps: number;
  readonly dpr: number;
  readonly tracking: string;
  busy(what: string): void;
  restart(): void;
  /** SLAM was recentred (tracking restarted inside the same run): settled() has to be earned again. */
  regate(): void;
  /** A breadcrumb (what the app did), with the time and the tracking state then. */
  note(what: string): void;
}

export function worldHealth(opts: WorldHealthOptions): WorldHealth {
  const canvas = opts.canvas;
  const getSize = opts.size ?? (() => [innerWidth, innerHeight] as [number, number]);
  const maxDpr = Math.min(3, Math.max(1, +(qs.get('dpr') ?? 0) || opts.baseDpr || 1.5));
  const minDpr = Math.min(maxDpr, opts.minDpr || 1);
  const adapt = qs.get('adapt') !== '0' && opts.adapt !== false;
  const settleMs = opts.settleMs || 1200;
  wrapCamera();

  const t0 = now();
  const s = (t: number) => Math.round((t - t0) / 100) / 10;
  let dpr = maxDpr;
  let runAt = 0, last = 0, secT = 0, secN = 0, fps = 0;
  let status = '', normalSince = 0, lastStall = -1e9, busyWhat = '';
  let lowFor = 0, highFor = 0;
  const log = {
    fps: [] as number[],
    tracking: [] as Array<[number, string]>,
    stalls: [] as Array<[number, number, string, string]>,
    dpr: [[0, dpr]] as Array<[number, number, string?]>,
    notes: [] as Array<[number, string, string]>,
    restarts: 0,
    regates: 0,
  };

  function sizeCanvas(): void {
    const [cw, ch] = getSize();
    const r = Math.min(devicePixelRatio || 1, dpr);
    const w = Math.max(1, Math.round(cw * r)), h = Math.max(1, Math.round(ch * r));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  function setDpr(v: number, why: string): void {
    v = Math.round(Math.min(maxDpr, Math.max(minDpr, v)) * 100) / 100;
    if (v === dpr) return;
    dpr = v;
    log.dpr.push([s(now()), dpr, why]);
    sizeCanvas();
  }

  function frame(): void {
    const t = now();
    if (last) {
      const gap = t - last;
      if (gap > 250) {
        lastStall = t;
        if (log.stalls.length < 40) log.stalls.push([s(t), Math.round(gap), busyWhat || '', status]);
      }
    }
    last = t;
    secN++;
    if (t - secT >= 1000) {
      fps = Math.round((secN * 1000) / (t - (secT || t - 1000)));
      secT = t;
      secN = 0;
      if (log.fps.length < 600) log.fps.push(fps);
      if (adapt && runAt && t - runAt > 3000) {
        lowFor = fps < 40 ? lowFor + 1 : 0;
        highFor = fps > 55 ? highFor + 1 : 0;
        if (lowFor >= 2) { setDpr(dpr - 0.25, `fps ${fps}`); lowFor = 0; }
        else if (highFor >= 8 && dpr < maxDpr) { setDpr(dpr + 0.25, `fps ${fps}`); highFor = 0; }
      }
      drawDiag();
    }
  }

  function onStatus(st: string, reason?: string): void {
    const t = now();
    const v = st + (reason && reason !== 'UNSPECIFIED' ? ` (${reason})` : '');
    if (v === status) return;
    status = v;
    normalSince = st === 'NORMAL' ? t : 0;
    if (log.tracking.length < 80) log.tracking.push([s(t), v]);
  }

  const module: PipelineModule = {
    name: 'world-health',
    onStart: () => { runAt = now() || 1; last = 0; normalSince = 0; status = ''; },
    onUpdate: ({ processCpuResult }: { processCpuResult?: { reality?: { trackingStatus?: string; trackingReason?: string } } }) => {
      frame();
      const r = processCpuResult && processCpuResult.reality;
      if (r && r.trackingStatus) onStatus(r.trackingStatus, r.trackingReason);
    },
    listeners: [{ event: 'reality.trackingstatus', process: ({ detail }: { detail: { status: string; reason?: string } }) => onStatus(detail.status, detail.reason) }],
  };

  function settled(): boolean {
    const t = now();
    return !!(normalSince && runAt && t - normalSince >= settleMs && t - lastStall > 1000 && t - runAt > 1500);
  }

  function snapshot(): Record<string, unknown> {
    return {
      v: 1, dpr, maxDpr, fpsNow: fps, tracking: status, cam: { ...cam },
      settled: settled(), restarts: log.restarts, regates: log.regates,
      fpsLog: log.fps.slice(-180), trackLog: log.tracking, stalls: log.stalls, dprLog: log.dpr, notes: log.notes,
    };
  }

  let diagEl: HTMLPreElement | null = null;
  function drawDiag(): void {
    if (!qs.has('diag')) return;
    if (!diagEl) {
      diagEl = document.createElement('pre');
      diagEl.setAttribute('aria-hidden', 'true');
      diagEl.style.cssText = 'position:fixed;left:8px;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:99;margin:0;padding:4px 6px;font:11px/1.3 ui-monospace,monospace;color:#fff;background:#000a;border-radius:6px;pointer-events:none;white-space:pre';
      document.body.appendChild(diagEl);
    }
    const st = log.stalls[log.stalls.length - 1];
    const notes = log.notes.slice(-5).map((n) => `${n[0]}s ${n[1]} [${n[2] || '-'}]`).join('\n');
    let extra = '';
    try { extra = opts.diagExtra?.() ?? ''; } catch { /* app not ready */ }
    diagEl.textContent = `slam ${status || '-'}${settled() ? ' ok' : ''}  fps ${fps}  dpr ${dpr}\ncam ${cam.width}x${cam.height}@${cam.frameRate}${cam.asked ? ' (asked ' + cam.asked + ')' : ''}`
      + `\nstalls ${log.stalls.length}` + (st ? `  last ${st[1]} ms @${st[0]}s ${st[2]}` : '')
      + (extra ? '\n' + extra : '') + (notes ? '\n' + notes : '');
  }

  return {
    module, sizeCanvas, settled, snapshot,
    get fps() { return fps; },
    get dpr() { return dpr; },
    get tracking() { return status; },
    busy(what: string) { busyWhat = what || ''; },
    restart() { log.restarts++; runAt = now() || 1; normalSince = 0; status = ''; last = 0; lowFor = highFor = 0; },
    regate() {
      log.regates++;
      // NORMAL from now on counts again from zero (a recenter may not send a status change)
      normalSince = status.startsWith('NORMAL') ? now() : 0;
    },
    note(what: string) {
      if (log.notes.length >= 80) log.notes.splice(0, 20);
      log.notes.push([s(now()), what, status]);
    },
  };
}
