/**
 * Tiny synthesised sound effects and haptics for "Where is Bobo?". No audio
 * files: every sound is a few Web Audio oscillators, so they cost nothing to
 * load. Nothing plays until the visitor's first tap or click (browsers require
 * it anyway), everything is quiet, and one toggle mutes sound and vibration
 * together (remembered on this device).
 */

const KEY = "bobo-sfx";
let ctx = null;
let master = null;
let muted = false;
try {
  muted = localStorage.getItem(KEY) === "off";
} catch {
  /* storage blocked: default on */
}
const listeners = new Set();

function ensure() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  // a soft compressor keeps stacked sounds from clipping
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  return ctx;
}
// unlock on the first gesture
for (const ev of ["pointerdown", "keydown"])
  addEventListener(ev, () => !muted && ensure(), { once: true, capture: true });

/** One enveloped oscillator note. */
function tone({ f = 440, f2 = null, type = "sine", t = 0, dur = 0.12, vol = 0.5, attack = 0.005, q = null }) {
  if (muted || !ensure() || ctx.state !== "running") return;
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node = o;
  if (q) {
    const bq = ctx.createBiquadFilter();
    bq.type = "lowpass";
    bq.frequency.value = q;
    node.connect(bq);
    node = bq;
  }
  node.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.05);
}

/** Filtered noise sweep: whooshes. */
function noise({ t = 0, dur = 0.6, from = 300, to = 2400, vol = 0.25 }) {
  if (muted || !ensure() || ctx.state !== "running") return;
  const now = ctx.currentTime + t;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(from, now);
  bp.frequency.exponentialRampToValueAtTime(to, now + dur * 0.6);
  bp.frequency.exponentialRampToValueAtTime(from * 0.8, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(bp).connect(g).connect(master);
  src.start(now);
  src.stop(now + dur + 0.05);
}

function buzz(pattern) {
  // browsers refuse (and log) vibration before the first tap
  if (muted || navigator.userActivation?.hasBeenActive === false) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported (iOS Safari): fine */
  }
}

export const sfx = {
  get muted() {
    return muted;
  },
  setMuted(v) {
    muted = !!v;
    try {
      localStorage.setItem(KEY, muted ? "off" : "on");
    } catch {
      /* ignore */
    }
    if (!muted) ensure();
    for (const fn of listeners) fn(muted);
  },
  onChange(fn) {
    listeners.add(fn);
  },
  /** UI press: a soft wooden tick. */
  tap() {
    tone({ f: 1250, f2: 900, type: "triangle", dur: 0.06, vol: 0.28 });
    buzz(6);
  },
  /** Pointer over a pin: barely there. */
  hover() {
    tone({ f: 1900, type: "sine", dur: 0.05, vol: 0.08 });
  },
  /** Picking a place: a bright two-note blip. */
  select() {
    tone({ f: 660, type: "triangle", dur: 0.09, vol: 0.32 });
    tone({ f: 990, type: "triangle", t: 0.06, dur: 0.12, vol: 0.28 });
    buzz(10);
  },
  /** The globe turning to a place. */
  whoosh(dur = 0.7) {
    noise({ dur, from: 260, to: 1900, vol: 0.2 });
  },
  /** Landing + hologram materialising: a shimmering arpeggio. */
  arrive() {
    [880, 1109, 1319, 1760].forEach((f, i) => tone({ f, type: "sine", t: i * 0.055, dur: 0.35, vol: 0.18 }));
    tone({ f: 220, f2: 110, type: "sine", dur: 0.25, vol: 0.25 });
    buzz([12, 40, 18]);
  },
  /** A landmark popping out of the ground. */
  pop() {
    tone({ f: 180, f2: 520, type: "sine", dur: 0.16, vol: 0.4 });
    tone({ f: 1400, f2: 2200, type: "triangle", t: 0.12, dur: 0.1, vol: 0.12 });
    buzz(22);
  },
  /** Bobo tapped: a cute rising chirp-chirp. */
  chirp() {
    tone({ f: 900, f2: 1500, type: "sine", dur: 0.09, vol: 0.3 });
    tone({ f: 1100, f2: 1900, type: "sine", t: 0.11, dur: 0.11, vol: 0.28 });
    buzz([8, 30, 8]);
  },
  /** A live scan landing somewhere: a tiny sparkle. */
  ping() {
    tone({ f: 2400, f2: 3000, type: "sine", dur: 0.08, vol: 0.05 });
  },
  /** Bobo arrives in your city: a little fanfare. */
  fanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => tone({ f, type: "triangle", t: i * 0.09, dur: i === notes.length - 1 ? 0.6 : 0.16, vol: 0.22, q: 3200 }));
    [1568, 2093, 2637].forEach((f, i) => tone({ f, type: "sine", t: 0.55 + i * 0.07, dur: 0.5, vol: 0.08 }));
    buzz([20, 60, 20, 60, 40]);
  },
  /** A new clip beaming down from space: a falling shimmer, then an impact thump. */
  beam() {
    noise({ dur: 0.85, from: 3200, to: 700, vol: 0.16 });
    [2637, 2093, 1568, 1319].forEach((f, i) => tone({ f, type: "sine", t: i * 0.11, dur: 0.22, vol: 0.06 }));
  },
  impact() {
    tone({ f: 140, f2: 48, type: "sine", dur: 0.42, vol: 0.5 });
    tone({ f: 660, type: "triangle", t: 0.04, dur: 0.12, vol: 0.2 });
    tone({ f: 990, type: "triangle", t: 0.1, dur: 0.16, vol: 0.18 });
    [1319, 1760, 2349].forEach((f, i) => tone({ f, type: "sine", t: 0.18 + i * 0.06, dur: 0.4, vol: 0.08 }));
    buzz([30, 40, 16]);
  },
  buzz,
};
