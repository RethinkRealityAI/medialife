/* eslint-disable @typescript-eslint/no-explicit-any -- duck-typed browser APIs and game nodes */
/**
 * Cola Run capture core: record the game, review the clip, send it to
 * "Where is Bobo?" (the Media Library's capture inbox), or save it.
 *
 * Framework-free on purpose. The same file is used, unchanged, by:
 *   - the Mattercraft component (ColaRunRecorder.ts imports it), and
 *   - the browser test lab (/evade/cola-run-lab/), compiled to
 *     capture-core.js by scripts/build-cola-capture.mjs.
 * Edit it here and rebuild; `node scripts/build-cola-capture.mjs --check`
 * fails if the lab's copy has drifted.
 *
 * How the recording works: every frame, right after the scene renders, the
 * WebGL canvas is drawn into a small 2D canvas together with a branded
 * overlay (game name, the player's score). That 2D canvas is what gets
 * recorded, so the video is branded even though the game's HTML HUD is not
 * part of the canvas. It has to happen in the render's own task: a WebGL
 * canvas without preserveDrawingBuffer is blank by the next task.
 *
 * Not available inside a WebXR immersive-ar session (Android Chrome after
 * placement): the camera image never reaches the page there, so the button
 * hides itself while one is running.
 */

/* ══ Types ══════════════════════════════════════════════════════════════ */

export type CaptureStatus = "idle" | "recording" | "review" | "sending" | "sent" | "error";

export type CaptureCorner = "topRight" | "topLeft" | "bottomRight" | "bottomLeft";

/** What the game tells the recorder, drawn onto the video and sent with the clip. */
export interface HudInfo {
  score?: number;
  target?: number;
  /** Short status such as "Complete!". */
  badge?: string;
}

export interface Clip {
  blob: Blob;
  /** Base MIME type ("video/mp4" or "video/webm"), no codecs. */
  mime: string;
  ext: "mp4" | "webm";
  seconds: number;
  width: number;
  height: number;
  poster: Blob | null;
  hud: HudInfo | null;
}

export interface CaptureEvents {
  recordStart: void;
  recordStop: Clip;
  reviewOpen: Clip;
  reviewClose: void;
  sent: { id: string };
  saved: void;
  error: { stage: "record" | "send"; message: string };
}

export interface ColaCaptureOptions {
  /** The WebGL canvas the game renders into. */
  canvas: HTMLCanvasElement;
  /** Where the button and review sheet go (Mattercraft's overlay, or document.body). */
  host: HTMLElement;
  /** Site that receives clips, e.g. https://medialife.ai (no trailing slash). */
  endpoint: string;
  /** "Where is Bobo?" page, opened from the success screen. */
  globeUrl: string;
  /** Tag stored with the clip ("cola-run"). */
  source: string;
  /** Route the game's sound into the recording; return a function that disconnects it. */
  connectAudio?: ((dest: MediaStreamAudioDestinationNode) => () => void) | null;
  audioContext?: AudioContext | null;
  /** True while a WebXR session is running (recording can't see the camera then). */
  isXR?: () => boolean;
  /** Fired for everything the UI does (analytics, pausing the game, Mattercraft Events). */
  on?: <K extends keyof CaptureEvents>(name: K, payload: CaptureEvents[K]) => void;
}

export interface CaptureSettings {
  maxSeconds: number;
  fps: number;
  /** Longest side of the recorded video in px (keeps phone uploads small). */
  maxLongSide: number;
  videoBitsPerSecond: number;
  corner: CaptureCorner;
  /** Nudge from the corner, px. Defaults put it right under the game's menu button. */
  offsetX: number;
  offsetY: number;
  accent: string;
  brandTitle: string;
  brandTagline: string;
  /** Draw the game name and score onto the video. */
  watermark: boolean;
  sendLabel: string;
  consentText: string;
  hintText: string;
  /** Hide the button while a WebXR session is running. */
  hideInXR: boolean;
  /** Sends clips to the endpoint. Off = save/share only. */
  sendEnabled: boolean;
}

export const DEFAULT_SETTINGS: CaptureSettings = {
  maxSeconds: 30,
  fps: 30,
  maxLongSide: 1280,
  videoBitsPerSecond: 4_000_000,
  corner: "topRight",
  offsetX: 0,
  offsetY: 0,
  accent: "#4fd6e8",
  brandTitle: "COLA RUN",
  brandTagline: "Where is Bobo? · EVADE",
  watermark: true,
  sendLabel: "Send to Where is Bobo?",
  consentText:
    "The EVADE team checks every clip first. If it's picked, it can show on the Where is Bobo? globe with your city, never your exact location.",
  hintText: "Record your run and send it to the Bobo globe",
  hideInXR: true,
  sendEnabled: true,
};

/* ══ Recorder ═══════════════════════════════════════════════════════════ */

const MIME_PREFERENCE = [
  // MP4 first: Safari only makes MP4, recent Chrome does too, and it plays everywhere.
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** Can this browser record a canvas at all? */
export function recordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).MediaRecorder === "function" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as any).captureStream === "function" &&
    pickMime() !== null
  );
}

export function pickMime(): string | null {
  const MR = (window as any).MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return null;
  for (const m of MIME_PREFERENCE) if (MR.isTypeSupported(m)) return m;
  return null;
}

function even(n: number) {
  return Math.max(2, Math.round(n / 2) * 2);
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const FONT = 'ui-sans-serif,-apple-system,"SF Pro Text",Inter,"Segoe UI",Roboto,sans-serif';

export class ClipRecorder {
  public hud: HudInfo | null = null;
  public onTick: ((seconds: number, fraction: number) => void) | null = null;
  public onStop: ((clip: Clip) => void) | null = null;
  public onError: ((message: string) => void) | null = null;

  private readonly _out = document.createElement("canvas");
  private readonly _ctx = this._out.getContext("2d", { alpha: false })!;
  private _rec: MediaRecorder | null = null;
  private _parts: Blob[] = [];
  private _mime = "";
  private _t0 = 0;
  private _seconds = 0;
  private _audioOff: (() => void) | null = null;
  private _stream: MediaStream | null = null;
  private _framed = false;

  constructor(
    private readonly _src: HTMLCanvasElement,
    private readonly _settings: () => CaptureSettings,
    /** Read when recording starts: the AudioContext may only exist after the first tap. */
    private readonly _audio: () => {
      ctx: AudioContext | null | undefined;
      connect: ColaCaptureOptions["connectAudio"];
    },
  ) {}

  get recording() {
    return !!this._rec && this._rec.state === "recording";
  }

  /** Begin recording. Throws (synchronously) when the browser can't. */
  start() {
    if (this._rec) return;
    const mime = pickMime();
    if (!mime) throw new Error("This browser can't record video.");
    const s = this._settings();
    // size the output once, from the canvas as it is now
    const sw = this._src.width || this._src.clientWidth || 720;
    const sh = this._src.height || this._src.clientHeight || 1280;
    const k = Math.min(1, s.maxLongSide / Math.max(sw, sh));
    this._out.width = even(sw * k);
    this._out.height = even(sh * k);
    this._ctx.fillStyle = "#000";
    this._ctx.fillRect(0, 0, this._out.width, this._out.height);
    this._framed = false;

    const stream: MediaStream = (this._out as any).captureStream(s.fps);
    const { ctx: ac, connect } = this._audio();
    if (ac && connect) {
      try {
        const dest = ac.createMediaStreamDestination();
        this._audioOff = connect(dest);
        for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
      } catch {
        this._audioOff = null; // a silent clip beats no clip
      }
    }
    this._stream = stream;
    this._parts = [];
    this._mime = mime;
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: s.videoBitsPerSecond,
    });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) this._parts.push(e.data);
    };
    rec.onerror = () => this._fail("Recording stopped unexpectedly.");
    rec.onstop = () => this._finish();
    this._rec = rec;
    this._t0 = performance.now();
    this._seconds = 0;
    rec.start(1000);
  }

  /** Call right after every render while the game runs. Cheap when not recording. */
  frame() {
    if (!this.recording) return;
    const s = this._settings();
    const c = this._ctx;
    const W = this._out.width;
    const H = this._out.height;
    const sw = this._src.width;
    const sh = this._src.height;
    if (sw && sh) {
      // cover-fit, so a rotated phone mid-clip crops instead of stretching
      const k = Math.max(W / sw, H / sh);
      const dw = sw * k;
      const dh = sh * k;
      try {
        c.drawImage(this._src, (W - dw) / 2, (H - dh) / 2, dw, dh);
        this._framed = true;
      } catch {
        /* a lost context draws nothing this frame */
      }
    }
    if (s.watermark) this._drawOverlay(c, W, H, s);
    this._seconds = (performance.now() - this._t0) / 1000;
    this.onTick?.(this._seconds, Math.min(1, this._seconds / s.maxSeconds));
    if (this._seconds >= s.maxSeconds) this.stop();
  }

  stop() {
    if (this._rec && this._rec.state !== "inactive") this._rec.stop();
  }

  /** Stop and throw the clip away (e.g. the page is closing). */
  cancel() {
    if (!this._rec) return;
    this._rec.onstop = null;
    try {
      if (this._rec.state !== "inactive") this._rec.stop();
    } catch {
      /* already stopped */
    }
    this._cleanup();
  }

  private _drawOverlay(c: CanvasRenderingContext2D, W: number, H: number, s: CaptureSettings) {
    const u = Math.min(W, H) / 720; // 1 unit = 1px on a 720p-wide clip
    const pad = 22 * u;
    c.save();
    c.textBaseline = "middle";

    // brand pill, bottom left
    const t1 = s.brandTitle;
    const t2 = s.brandTagline;
    c.font = `800 ${26 * u}px ${FONT}`;
    const w1 = c.measureText(t1).width;
    c.font = `600 ${17 * u}px ${FONT}`;
    const w2 = t2 ? c.measureText(t2).width : 0;
    const bw = Math.max(w1, w2) + 58 * u;
    const bh = (t2 ? 74 : 50) * u;
    const bx = pad;
    const by = H - pad - bh;
    c.fillStyle = "rgba(12,14,18,.62)";
    roundRect(c, bx, by, bw, bh, 18 * u);
    c.fill();
    c.strokeStyle = s.accent;
    c.globalAlpha = 0.55;
    c.lineWidth = 1.5 * u;
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = s.accent;
    c.beginPath();
    c.arc(bx + 24 * u, by + (t2 ? 26 : 25) * u, 7 * u, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.font = `800 ${26 * u}px ${FONT}`;
    c.fillText(t1, bx + 42 * u, by + (t2 ? 26 : 25) * u);
    if (t2) {
      c.fillStyle = "rgba(236,246,250,.82)";
      c.font = `600 ${17 * u}px ${FONT}`;
      c.fillText(t2, bx + 42 * u, by + 54 * u);
    }

    // score chip, top left
    const h = this.hud;
    if (h && (h.score !== undefined || h.badge)) {
      const count =
        h.score === undefined ? "" : h.target ? `${h.score} / ${h.target} cans` : `${h.score} cans`;
      const label = [count, h.badge].filter(Boolean).join("  ·  ");
      c.font = `800 ${24 * u}px ${FONT}`;
      const lw = c.measureText(label).width;
      const cw = lw + 64 * u;
      const ch = 48 * u;
      c.fillStyle = "rgba(12,14,18,.62)";
      roundRect(c, pad, pad, cw, ch, ch / 2);
      c.fill();
      if (count) {
        // a tiny can next to the score
        c.fillStyle = "#e8434f";
        roundRect(c, pad + 18 * u, pad + 12 * u, 16 * u, 24 * u, 4 * u);
        c.fill();
        c.fillStyle = "rgba(255,255,255,.85)";
        c.fillRect(pad + 18 * u, pad + 19 * u, 16 * u, 4 * u);
      } else {
        // no score (lounge): an accent dot instead
        c.fillStyle = s.accent;
        c.beginPath();
        c.arc(pad + 26 * u, pad + ch / 2, 7 * u, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#fff";
      c.fillText(label, pad + 46 * u, pad + ch / 2 + 1 * u);
    }
    c.restore();
  }

  private _finish() {
    const mime = this._mime;
    const base = mime.split(";")[0];
    const blob = new Blob(this._parts, { type: base });
    const seconds = Math.round(this._seconds * 10) / 10;
    const width = this._out.width;
    const height = this._out.height;
    const hud = this.hud ? { ...this.hud } : null;
    const framed = this._framed;
    const done = (poster: Blob | null) => {
      this._cleanup();
      if (!blob.size || !framed) {
        this._fail("Nothing was recorded. Try again once the game is on screen.");
        return;
      }
      this.onStop?.({
        blob,
        mime: base,
        ext: base === "video/mp4" ? "mp4" : "webm",
        seconds,
        width,
        height,
        poster,
        hud,
      });
    };
    // the last frame is the poster: usually the best moment (the win, the cans)
    try {
      this._out.toBlob((b) => done(b), "image/jpeg", 0.82);
    } catch {
      done(null);
    }
  }

  private _fail(message: string) {
    this._cleanup();
    this.onError?.(message);
  }

  private _cleanup() {
    try {
      this._audioOff?.();
    } catch {
      /* already disconnected */
    }
    this._audioOff = null;
    for (const t of this._stream?.getTracks() ?? []) t.stop();
    this._stream = null;
    this._rec = null;
  }
}

/* ══ Sending ════════════════════════════════════════════════════════════ */

export interface SendOptions {
  endpoint: string;
  source: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

async function api(url: string, init: RequestInit, signal?: AbortSignal, tries = 3): Promise<any> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    try {
      const r = await fetch(url, { ...init, mode: "cors", credentials: "omit", signal });
      const text = await r.text();
      const body = text ? JSON.parse(text) : null;
      if (r.ok) return body;
      const msg = body?.error || `HTTP ${r.status}`;
      // 4xx won't get better on a retry (except 429: try later)
      if (r.status < 500) throw Object.assign(new Error(msg), { fatal: true, status: r.status });
      last = new Error(msg);
    } catch (e: any) {
      if (e?.fatal || e?.name === "AbortError") throw e;
      last = e;
    }
    await new Promise((res) => setTimeout(res, 600 * 2 ** i));
  }
  throw last instanceof Error ? last : new Error("Network error");
}

/**
 * Upload a clip through the Media Library's chunked upload API as a web
 * capture. It lands private, tagged "Needs review", with the visitor's city.
 */
export async function sendClip(clip: Clip, o: SendOptions): Promise<{ id: string }> {
  const base = o.endpoint.replace(/\/+$/, "");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const h = clip.hud;
  const scoreText =
    h?.score !== undefined ? (h.target ? `${h.score}/${h.target} cans` : `${h.score} cans`) : "";
  const init = await api(
    `${base}/api/media/uploads`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: `cola-run-${stamp}.${clip.ext}`,
        size: clip.blob.size,
        mime: clip.mime,
        source: o.source,
        title: "Cola Run clip",
        description: [scoreText, `${Math.round(clip.seconds)} s`, h?.badge]
          .filter(Boolean)
          .join(" · "),
        width: clip.width,
        height: clip.height,
        durationS: clip.seconds,
      }),
    },
    o.signal,
    2,
  );
  if (!init?.id || !init.captureKey || init.plan?.mode !== "chunks")
    throw new Error("The globe isn't taking clips right now.");
  const key: string = init.captureKey;
  const size: number = init.chunkSize;
  const n: number = init.chunks;
  const auth = { "x-capture-key": key };
  const total = clip.blob.size + (clip.poster?.size ?? 0);
  let sent = 0;
  o.onProgress?.(0.02);
  for (let i = 0; i < n; i++) {
    const part = clip.blob.slice(i * size, Math.min(clip.blob.size, (i + 1) * size));
    await api(
      `${base}/api/media/uploads/${init.id}/chunks/${i}`,
      {
        method: "PUT",
        headers: { ...auth, "content-type": "application/octet-stream" },
        body: part,
      },
      o.signal,
    );
    sent += part.size;
    o.onProgress?.(Math.min(0.97, sent / total));
  }
  if (clip.poster) {
    // a poster frame makes review in the library quick; not worth failing over
    await api(
      `${base}/api/media/uploads/${init.id}/thumb`,
      { method: "PUT", headers: { ...auth, "content-type": "image/jpeg" }, body: clip.poster },
      o.signal,
      1,
    ).catch(() => null);
  }
  await api(
    `${base}/api/media/uploads/${init.id}/complete`,
    { method: "POST", headers: auth },
    o.signal,
  );
  o.onProgress?.(1);
  // a live "AR capture" blip on the globe's ticker (city level, anonymous)
  fetch(`${base}/api/bobo/events`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "capture",
      source: o.source,
      props: {
        seconds: Math.round(clip.seconds),
        ...(h?.score !== undefined ? { score: h.score } : {}),
      },
    }),
  }).catch(() => undefined);
  return { id: String(init.id) };
}

/** Share sheet (phones: "Save video") or a download. */
export async function saveClip(clip: Clip): Promise<"shared" | "downloaded" | "cancelled"> {
  const name = `cola-run-${Date.now()}.${clip.ext}`;
  const file = new File([clip.blob], name, { type: clip.mime });
  const nav = navigator as any;
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "My Cola Run" });
      return "shared";
    } catch (e: any) {
      if (e?.name === "AbortError") return "cancelled";
      // fall through to a download
    }
  }
  const url = URL.createObjectURL(clip.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

/* ══ UI ═════════════════════════════════════════════════════════════════ */

const STYLE_ID = "crc-styles";
const CSS = `
/* Scoped reset: this lands in someone else's page. */
.crc-anchor,.crc-layer,.crc-anchor *,.crc-layer *{box-sizing:border-box}
.crc-anchor,.crc-layer{--crc-accent:#4fd6e8;--crc-rec:#ff4d5e;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif;
  -webkit-tap-highlight-color:transparent}
/* Mattercraft's core CSS sets #zcomponent-overlay > * { pointer-events:auto },
   an ID selector a class can't outrank: without !important these wrappers
   would swallow every tap on the canvas, joystick included. */
.crc-anchor{position:absolute;z-index:1999990;pointer-events:none!important;display:flex;flex-direction:column;align-items:center;gap:6px;width:44px}
.crc-anchor.crc-tr{top:calc(var(--safe-area-inset-top,0px) + 78px + var(--crc-dy,0px));right:calc(var(--safe-area-inset-right,0px) + 19px + var(--crc-dx,0px))}
.crc-anchor.crc-tl{top:calc(var(--safe-area-inset-top,0px) + 78px + var(--crc-dy,0px));left:calc(var(--safe-area-inset-left,0px) + 19px + var(--crc-dx,0px))}
.crc-anchor.crc-br{bottom:calc(var(--safe-area-inset-bottom,0px) + 78px + var(--crc-dy,0px));right:calc(var(--safe-area-inset-right,0px) + 19px + var(--crc-dx,0px));flex-direction:column-reverse}
.crc-anchor.crc-bl{bottom:calc(var(--safe-area-inset-bottom,0px) + 78px + var(--crc-dy,0px));left:calc(var(--safe-area-inset-left,0px) + 19px + var(--crc-dx,0px));flex-direction:column-reverse}
.crc-anchor.crc-hidden{display:none}
.crc-rec{pointer-events:auto!important;position:relative;width:44px;height:44px;border-radius:50%;padding:0;cursor:pointer;
  display:grid;place-items:center;border:1px solid rgba(255,255,255,.18);background:rgba(20,22,26,.78);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 14px rgba(0,0,0,.28);
  transition:transform .18s,border-color .18s,box-shadow .18s;touch-action:manipulation}
.crc-rec:hover{transform:scale(1.06);border-color:rgba(255,255,255,.34)}
.crc-rec:active{transform:scale(.94)}
.crc-rec:focus-visible{outline:2px solid var(--crc-accent);outline-offset:3px}
.crc-dot{width:16px;height:16px;border-radius:50%;background:var(--crc-rec);
  box-shadow:0 0 0 3px rgba(255,77,94,.18),0 0 10px rgba(255,77,94,.55);transition:border-radius .2s,width .2s,height .2s}
.crc-ring{position:absolute;inset:-1px;width:44px;height:44px;transform:rotate(-90deg);pointer-events:none;opacity:0;transition:opacity .2s}
.crc-ring circle{fill:none;stroke-width:3}
.crc-ring .crc-track{stroke:rgba(255,255,255,.14)}
.crc-ring .crc-prog{stroke:var(--crc-rec);stroke-linecap:round;stroke-dasharray:132;stroke-dashoffset:132}
.crc-on .crc-rec{border-color:rgba(255,77,94,.55)}
.crc-on .crc-dot{width:14px;height:14px;border-radius:4px;box-shadow:none;animation:crcBeat 1.2s ease-in-out infinite}
.crc-on .crc-ring{opacity:1}
@keyframes crcBeat{50%{opacity:.6}}
.crc-time{pointer-events:none;display:none;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;white-space:nowrap;
  background:rgba(20,22,26,.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  color:#fff;font-weight:700;font-size:12px;letter-spacing:.02em;font-variant-numeric:tabular-nums}
.crc-time i{width:7px;height:7px;border-radius:50%;background:var(--crc-rec);animation:crcBeat 1.2s ease-in-out infinite}
.crc-on .crc-time{display:inline-flex}
.crc-hint{pointer-events:auto!important;position:absolute;top:52px;width:max-content;max-width:min(210px,60vw);padding:9px 12px;border-radius:12px;cursor:pointer;
  background:rgba(20,22,26,.9);color:#eaf6fa;font-size:12.5px;line-height:1.35;font-weight:600;
  border:1px solid rgba(79,214,232,.35);box-shadow:0 6px 20px rgba(0,0,0,.3);
  opacity:0;transform:translateY(-4px);transition:opacity .25s,transform .25s;display:none}
.crc-hint::before{content:"";position:absolute;top:-6px;width:10px;height:10px;transform:rotate(45deg);
  background:inherit;border-left:1px solid rgba(79,214,232,.35);border-top:1px solid rgba(79,214,232,.35)}
.crc-tr .crc-hint,.crc-br .crc-hint{right:0}.crc-tr .crc-hint::before,.crc-br .crc-hint::before{right:17px}
.crc-tl .crc-hint,.crc-bl .crc-hint{left:0}.crc-tl .crc-hint::before,.crc-bl .crc-hint::before{left:17px}
.crc-br .crc-hint,.crc-bl .crc-hint{top:auto;bottom:52px}
.crc-br .crc-hint::before,.crc-bl .crc-hint::before{top:auto;bottom:-6px;transform:rotate(225deg)}
.crc-hint.crc-show{display:block;opacity:1;transform:none}
.crc-on .crc-hint{display:none}
.crc-toast{position:absolute;left:50%;top:calc(var(--safe-area-inset-top,0px) + 18px);transform:translate(-50%,-8px);
  z-index:2000002;max-width:min(90vw,360px);padding:10px 14px;border-radius:12px;background:rgba(20,22,26,.92);color:#fff;
  font-size:13px;font-weight:600;text-align:center;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none!important}
.crc-toast.crc-show{opacity:1;transform:translate(-50%,0)}

.crc-layer{position:absolute;inset:0;z-index:2000001;pointer-events:none!important;display:flex;
  align-items:flex-end;justify-content:center;padding:12px;padding-bottom:calc(var(--safe-area-inset-bottom,0px) + 12px);
  opacity:0;visibility:hidden;transition:opacity .22s,visibility 0s .22s}
.crc-layer.crc-open{pointer-events:auto!important;opacity:1;visibility:visible;transition:opacity .22s}
.crc-scrim{position:absolute;inset:0;background:rgba(4,6,10,.62)}
.crc-sheet{position:relative;width:100%;max-width:400px;max-height:calc(100% - var(--safe-area-inset-top,0px) - 12px);
  overflow:auto;border-radius:22px;padding:16px;color:#f2f6f8;
  background:linear-gradient(180deg,rgba(30,33,38,.98),rgba(18,20,24,.98));
  border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 60px rgba(0,0,0,.5);
  transform:translateY(16px);transition:transform .25s cubic-bezier(.2,.8,.2,1)}
.crc-open .crc-sheet{transform:none}
.crc-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:0;cursor:pointer;
  background:rgba(255,255,255,.08);color:#fff;display:grid;place-items:center;z-index:2}
.crc-x:focus-visible,.crc-btn:focus-visible{outline:2px solid var(--crc-accent);outline-offset:2px}
.crc-kicker{font-size:10.5px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:var(--crc-accent);margin:2px 0 4px}
.crc-title{font-size:19px;font-weight:800;line-height:1.2;margin:0 44px 12px 0}
.crc-video{position:relative;border-radius:14px;overflow:hidden;background:#000;margin-bottom:10px;
  display:flex;justify-content:center;max-height:min(46vh,420px)}
.crc-video video{display:block;max-width:100%;max-height:min(46vh,420px);object-fit:contain}
.crc-meta{font-size:12.5px;color:#9aa6b2;margin-bottom:12px}
.crc-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;padding:12px 16px;
  border-radius:14px;border:0;cursor:pointer;font:inherit;font-weight:800;font-size:15px;color:#06141a;
  background:var(--crc-accent);position:relative;overflow:hidden;transition:transform .12s,opacity .2s}
.crc-btn:active{transform:scale(.98)}
.crc-btn[disabled]{cursor:default;opacity:.85}
.crc-btn .crc-bar{position:absolute;left:0;top:0;bottom:0;width:0;background:rgba(255,255,255,.35);transition:width .2s}
.crc-btn span{position:relative}
.crc-row{display:flex;gap:8px;margin-top:8px}
.crc-ghost{background:rgba(255,255,255,.08);color:#f2f6f8;font-weight:700;font-size:14px}
.crc-fine{font-size:11.5px;line-height:1.45;color:#8b96a1;margin:10px 2px 0}
.crc-err{display:none;font-size:12.5px;color:#ffb3ba;background:rgba(255,77,94,.1);border-radius:10px;padding:8px 10px;margin-bottom:10px}
.crc-err.crc-show{display:block}
.crc-done{display:none;text-align:center;padding:8px 4px 2px}
.crc-check{width:56px;height:56px;margin:4px auto 10px;border-radius:50%;display:grid;place-items:center;
  background:rgba(79,214,232,.14);color:var(--crc-accent)}
.crc-done p{color:#aab5c0;font-size:13.5px;margin:0 0 14px}
.crc-sent .crc-main{display:none}
.crc-sent .crc-done{display:block}
a.crc-btn{text-decoration:none}
@media (max-height:520px){.crc-video,.crc-video video{max-height:34vh}.crc-title{font-size:17px;margin-bottom:8px}}
@media (prefers-reduced-motion:reduce){.crc-on .crc-dot,.crc-time i{animation:none}.crc-sheet{transition:none}}
`;

const ICON_GLOBE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>';
const ICON_SAVE =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const ICON_X =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const ICON_CHECK =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The whole feature: record button, recording indicator, review sheet,
 * sending. Construct it once; call frame() after every render; dispose() at
 * the end.
 */
export class ColaCapture {
  public settings: CaptureSettings = { ...DEFAULT_SETTINGS };
  public status: CaptureStatus = "idle";

  private readonly _rec: ClipRecorder;
  private readonly _anchor = document.createElement("div");
  private readonly _layer = document.createElement("div");
  private readonly _toast = document.createElement("div");
  private _btn!: HTMLButtonElement;
  private _prog!: SVGCircleElement;
  private _time!: HTMLElement;
  private _hint!: HTMLElement;
  private _clip: Clip | null = null;
  private _clipUrl: string | null = null;
  private _abort: AbortController | null = null;
  private _hintTimer = 0;
  private _toastTimer = 0;
  private _xr = false;
  private _visible = true;
  private _disposed = false;
  private _lastFocus: Element | null = null;

  constructor(private readonly _o: ColaCaptureOptions) {
    this._rec = new ClipRecorder(
      _o.canvas,
      () => this.settings,
      () => ({
        ctx: this._o.audioContext,
        connect: this._o.connectAudio,
      }),
    );
    this._rec.onTick = (sec, f) => this._onTick(sec, f);
    this._rec.onStop = (clip) => this._onClip(clip);
    this._rec.onError = (m) => this._onRecordError(m);
    this._ensureStyle();
    this._build();
    this.mount(_o.host);
    this.apply();
  }

  /* ── public ── */

  /** (Re)attach to a host; Mattercraft swaps its overlay when WebXR starts. */
  mount(host: HTMLElement) {
    this._o.host = host;
    host.appendChild(this._anchor);
    host.appendChild(this._layer);
    host.appendChild(this._toast);
  }

  /** Push settings changes into the DOM. */
  apply() {
    const s = this.settings;
    const cls = {
      topRight: "crc-tr",
      topLeft: "crc-tl",
      bottomRight: "crc-br",
      bottomLeft: "crc-bl",
    }[s.corner];
    this._anchor.className = `crc-anchor ${cls}`;
    for (const el of [this._anchor, this._layer]) {
      el.style.setProperty("--crc-accent", s.accent);
      el.style.setProperty("--crc-dx", `${s.offsetX | 0}px`);
      el.style.setProperty("--crc-dy", `${s.offsetY | 0}px`);
    }
    this._hint.textContent = s.hintText;
    this._layer.querySelector(".crc-sendLbl")!.textContent = s.sendLabel;
    this._layer.querySelector(".crc-fine")!.textContent = s.consentText;
    this._layer.querySelector(".crc-main .crc-title")!.textContent = s.sendEnabled
      ? "Send Bobo's run to the globe?"
      : "Nice run! Keep the clip?";
    (this._layer.querySelector(".crc-send") as HTMLElement).style.display = s.sendEnabled
      ? ""
      : "none";
    (this._layer.querySelector(".crc-fine") as HTMLElement).style.display = s.sendEnabled
      ? ""
      : "none";
    this._syncVisibility();
  }

  setVisible(v: boolean) {
    this._visible = v;
    this._syncVisibility();
  }

  /** Change where clips go (e.g. a preview deploy) without rebuilding the UI. */
  configure(
    p: Partial<Pick<ColaCaptureOptions, "endpoint" | "globeUrl" | "source" | "audioContext">>,
  ) {
    Object.assign(this._o, p);
  }

  setHud(h: HudInfo | null) {
    this._rec.hud = h;
  }

  /** Call right after every render. */
  frame() {
    const xr = !!this._o.isXR?.();
    if (xr !== this._xr) {
      this._xr = xr;
      if (xr && this._rec.recording) {
        this._rec.cancel();
        this._setRecordingUi(false);
        this.status = "idle";
        this._showToast("Recording stopped: it doesn't work in this AR mode.");
      }
      this._syncVisibility();
    }
    this._rec.frame();
  }

  /** One-time nudge next to the button (remembered per device). */
  showHint(force = false) {
    if (this.status !== "idle" || !this._anchorShown()) return;
    let seen = false;
    try {
      seen = localStorage.getItem("crc-hint-seen") === "1";
    } catch {
      /* private mode */
    }
    if (seen && !force) return;
    try {
      localStorage.setItem("crc-hint-seen", "1");
    } catch {
      /* private mode */
    }
    this._hint.classList.add("crc-show");
    clearTimeout(this._hintTimer);
    this._hintTimer = window.setTimeout(() => this._hint.classList.remove("crc-show"), 5500);
  }

  start() {
    if (this.status !== "idle" || this._disposed) return;
    this._hint.classList.remove("crc-show");
    if (!recordingSupported()) {
      this._showToast("Recording isn't supported in this browser.");
      return;
    }
    if (this._xr) {
      this._showToast("Recording doesn't work in this AR mode.");
      return;
    }
    try {
      this._rec.start();
    } catch (e: any) {
      this._onRecordError(e?.message || "Couldn't start recording.");
      return;
    }
    this.status = "recording";
    this._setRecordingUi(true);
    try {
      navigator.vibrate?.(12);
    } catch {
      /* iOS: no vibration */
    }
    this._emit("recordStart", undefined);
  }

  stop() {
    if (this.status === "recording") this._rec.stop();
  }

  toggle() {
    if (this.status === "recording") this.stop();
    else this.start();
  }

  /** Close the review sheet (discarding the clip). */
  close() {
    if (this.status === "idle" || this.status === "recording") return;
    this._abort?.abort();
    this._abort = null;
    this._layer.classList.remove("crc-open", "crc-sent");
    const v = this._layer.querySelector("video")!;
    v.pause();
    v.removeAttribute("src");
    v.load();
    if (this._clipUrl) URL.revokeObjectURL(this._clipUrl);
    this._clipUrl = null;
    this._clip = null;
    this.status = "idle";
    this._syncVisibility();
    (this._lastFocus as HTMLElement | null)?.focus?.();
    this._emit("reviewClose", undefined);
  }

  dispose() {
    this._disposed = true;
    this._rec.cancel();
    this._abort?.abort();
    clearTimeout(this._hintTimer);
    clearTimeout(this._toastTimer);
    if (this._clipUrl) URL.revokeObjectURL(this._clipUrl);
    this._anchor.remove();
    this._layer.remove();
    this._toast.remove();
  }

  /** For tests: the clip in review. */
  get clip() {
    return this._clip;
  }

  /* ── internals ── */

  private _emit<K extends keyof CaptureEvents>(name: K, payload: CaptureEvents[K]) {
    try {
      this._o.on?.(name, payload);
    } catch {
      /* a listener must never break recording */
    }
  }

  private _ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    (document.head ?? document.body).appendChild(st);
  }

  private _build() {
    this._anchor.innerHTML = `
      <button class="crc-rec" type="button" aria-label="Record a clip" aria-pressed="false">
        <svg class="crc-ring" viewBox="0 0 44 44" aria-hidden="true">
          <circle class="crc-track" cx="22" cy="22" r="21"></circle>
          <circle class="crc-prog" cx="22" cy="22" r="21"></circle>
        </svg>
        <span class="crc-dot" aria-hidden="true"></span>
      </button>
      <span class="crc-time" role="timer" aria-live="off"><i aria-hidden="true"></i><b>0:00</b></span>
      <span class="crc-hint" role="note"></span>`;
    this._btn = this._anchor.querySelector(".crc-rec")!;
    this._prog = this._anchor.querySelector(".crc-prog")!;
    this._time = this._anchor.querySelector(".crc-time b")!;
    this._hint = this._anchor.querySelector(".crc-hint")!;
    this._btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggle();
    });
    // a tap on the button must never reach the game (joystick, placement)
    for (const t of ["pointerdown", "pointerup", "touchstart", "touchend"])
      this._btn.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    this._hint.addEventListener("click", () => this._hint.classList.remove("crc-show"));

    this._layer.className = "crc-layer";
    this._layer.setAttribute("aria-hidden", "true");
    this._layer.innerHTML = `
      <div class="crc-scrim" data-a="close"></div>
      <div class="crc-sheet" role="dialog" aria-modal="true" aria-labelledby="crc-title">
        <button class="crc-x" type="button" data-a="close" aria-label="Close">${ICON_X}</button>
        <div class="crc-main">
          <div class="crc-kicker">Your clip</div>
          <h2 class="crc-title" id="crc-title">Send Bobo's run to the globe?</h2>
          <div class="crc-video"><video playsinline muted loop autoplay controls preload="auto"></video></div>
          <div class="crc-meta"></div>
          <div class="crc-err" role="alert"></div>
          <button class="crc-btn crc-send" type="button" data-a="send"><i class="crc-bar"></i>${ICON_GLOBE}<span class="crc-sendLbl"></span></button>
          <div class="crc-row">
            <button class="crc-btn crc-ghost" type="button" data-a="save">${ICON_SAVE}<span>Save</span></button>
            <button class="crc-btn crc-ghost" type="button" data-a="retake"><span>Record again</span></button>
          </div>
          <p class="crc-fine"></p>
        </div>
        <div class="crc-done" aria-live="polite">
          <div class="crc-check">${ICON_CHECK}</div>
          <h2 class="crc-title" style="margin:0 0 6px">Sent!</h2>
          <p>The EVADE team will check it. Picked clips show up on the Where is Bobo? globe.</p>
          <a class="crc-btn" data-a="globe" target="_blank" rel="noopener">${ICON_GLOBE}<span>See the globe</span></a>
          <div class="crc-row"><button class="crc-btn crc-ghost" type="button" data-a="close"><span>Back to the game</span></button></div>
        </div>
      </div>`;
    this._layer.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("[data-a]")?.getAttribute("data-a");
      if (a === "close") this.close();
      else if (a === "send") void this._send();
      else if (a === "save") void this._save();
      else if (a === "retake") {
        this.close();
        // straight back into recording: that's what "again" means
        setTimeout(() => this.start(), 60);
      } else if (a === "globe") {
        // leaving the page ends an AR session; a new tab keeps the game alive
        this._emit("reviewClose", undefined);
      }
    });
    for (const t of ["pointerdown", "pointerup", "touchstart", "touchend", "wheel"])
      this._layer.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    this._layer.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape") this.close();
    });

    this._toast.className = "crc-toast";
    this._toast.setAttribute("role", "status");
  }

  private _anchorShown() {
    return this._visible && !(this._xr && this.settings.hideInXR);
  }

  private _syncVisibility() {
    const show =
      this._anchorShown() &&
      this.status !== "review" &&
      this.status !== "sending" &&
      this.status !== "sent" &&
      this.status !== "error";
    this._anchor.classList.toggle("crc-hidden", !show && this.status !== "recording");
  }

  private _setRecordingUi(on: boolean) {
    this._anchor.classList.toggle("crc-on", on);
    this._btn.setAttribute("aria-pressed", String(on));
    this._btn.setAttribute("aria-label", on ? "Stop recording" : "Record a clip");
    this._prog.style.strokeDashoffset = "132";
    this._time.textContent = "0:00";
  }

  private _onTick(sec: number, f: number) {
    this._prog.style.strokeDashoffset = String(132 * (1 - f));
    const left = Math.max(0, this.settings.maxSeconds - sec);
    // the last seconds count down, so the auto-stop isn't a surprise
    this._time.textContent = left <= 5 ? `${Math.ceil(left)}s left` : fmt(sec);
  }

  private _onClip(clip: Clip) {
    this._setRecordingUi(false);
    if (this._disposed) return;
    if (clip.seconds < 1) {
      // a double tap, not a clip
      this.status = "idle";
      this._syncVisibility();
      this._showToast("That was too short. Tap once to start, and again to stop.");
      return;
    }
    this._clip = clip;
    this._emit("recordStop", clip);
    this._openReview(clip);
  }

  private _onRecordError(message: string) {
    this._setRecordingUi(false);
    this.status = "idle";
    this._syncVisibility();
    this._showToast(message);
    this._emit("error", { stage: "record", message });
  }

  private _openReview(clip: Clip) {
    this.status = "review";
    this._lastFocus = document.activeElement;
    if (this._clipUrl) URL.revokeObjectURL(this._clipUrl);
    this._clipUrl = URL.createObjectURL(clip.blob);
    const v = this._layer.querySelector("video")!;
    v.src = this._clipUrl;
    v.muted = true;
    v.play().catch(() => undefined);
    const h = clip.hud;
    const bits = [fmt(clip.seconds)];
    if (h?.score !== undefined)
      bits.push(h.target ? `${h.score}/${h.target} cans` : `${h.score} cans`);
    if (h?.badge) bits.push(h.badge);
    this._layer.querySelector(".crc-meta")!.textContent = bits.join(" · ");
    this._setError("");
    this._setSending(false, 0);
    (this._layer.querySelector('[data-a="globe"]') as HTMLAnchorElement).href = this._o.globeUrl;
    this._layer.classList.remove("crc-sent");
    this._layer.classList.add("crc-open");
    this._layer.setAttribute("aria-hidden", "false");
    this._syncVisibility();
    setTimeout(
      () =>
        (
          this._layer.querySelector(
            this.settings.sendEnabled ? ".crc-send" : '[data-a="save"]',
          ) as HTMLElement
        )?.focus(),
      50,
    );
    this._emit("reviewOpen", clip);
  }

  private _setError(msg: string) {
    const el = this._layer.querySelector(".crc-err")!;
    el.textContent = msg;
    el.classList.toggle("crc-show", !!msg);
  }

  private _setSending(on: boolean, f: number) {
    const b = this._layer.querySelector(".crc-send") as HTMLButtonElement;
    b.disabled = on;
    (b.querySelector(".crc-bar") as HTMLElement).style.width = on ? `${Math.round(f * 100)}%` : "0";
    this._layer.querySelector(".crc-sendLbl")!.textContent = on
      ? `Sending… ${Math.round(f * 100)}%`
      : this.status === "error"
        ? "Try again"
        : this.settings.sendLabel;
  }

  private async _send() {
    const clip = this._clip;
    if (!clip || this.status === "sending" || !this.settings.sendEnabled) return;
    this.status = "sending";
    this._setError("");
    this._setSending(true, 0);
    const ac = new AbortController();
    this._abort = ac;
    try {
      const r = await sendClip(clip, {
        endpoint: this._o.endpoint,
        source: this._o.source,
        signal: ac.signal,
        onProgress: (f) => this._setSending(true, f),
      });
      if (ac.signal.aborted) return;
      this.status = "sent";
      this._layer.classList.add("crc-sent");
      (this._layer.querySelector('.crc-done [data-a="close"]') as HTMLElement)?.focus();
      this._emit("sent", r);
    } catch (e: any) {
      if (e?.name === "AbortError" || ac.signal.aborted) return;
      this.status = "error";
      const msg =
        navigator.onLine === false
          ? "You're offline. Your clip is still here: try again when you're back online, or save it."
          : `Couldn't send it (${e?.message || "network error"}). Your clip is still here.`;
      this._setError(msg);
      this._setSending(false, 0);
      this._emit("error", { stage: "send", message: String(e?.message || e) });
    } finally {
      if (this._abort === ac) this._abort = null;
    }
  }

  private async _save() {
    if (!this._clip) return;
    const r = await saveClip(this._clip);
    if (r !== "cancelled") {
      this._emit("saved", undefined);
      if (r === "downloaded") this._showToast("Saved to your downloads.");
    }
  }

  private _showToast(msg: string) {
    this._toast.textContent = msg;
    this._toast.classList.add("crc-show");
    clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => this._toast.classList.remove("crc-show"), 3200);
  }
}
