// Realtime, audio-only lip sync: an audio source -> Oculus-style viseme weights (VisemeFrame), with no added latency
// beyond one analysis window (~21 ms) and the mouth's own motion smoothing.
//
// Pipeline per rendered frame:
//   level + noise floor -> speech gate (hysteresis + hold)
//   loudness relative to recent peaks (auto gain) -> how far the mouth opens (jaw envelope, viseme amount)
//   LPC formants F1/F2 (phone-safe, robust to strong low harmonics) -> soft vowel classification (aa, E, I, O, U, RR)
//   tilt / hiss / periodicity -> fricatives (SS, CH, FF);  level dips -> closures (PP);  murmur -> nn;  onsets -> DD/kk
//   critically damped motion per viseme (attack/release), caps so shapes blend
//
// It only ANALYSES audio. It never routes a call's audio to the speakers (the Twilio SDK already plays it).
import type { Viseme, VisemeFrame } from '../shared/contracts';
import { VISEMES } from '../shared/contracts';
import { getAudioContext } from '../audio/context';
import { DEFAULT_LIPSYNC_CONFIG, type LipSyncConfig } from './config';
import { FeatureExtractor, type Features } from './features';

type VisemeMap = Record<Viseme, number>;
const zeroMap = (): VisemeMap => Object.fromEntries(VISEMES.map((v) => [v, 0])) as VisemeMap;

/**
 * Vowel prototypes: (viseme, F1 Hz, F2 Hz) for an adult female voice (Peterson & Barney / Hillenbrand averages).
 * Several English vowels share a mouth shape, so each viseme has a few prototypes. Classification is a soft
 * nearest-prototype in log-formant space (log Hz is close to how vowel space scales between speakers).
 */
const VOWEL_PROTOS: Array<[Viseme, number, number]> = [
  ['aa', 850, 1220], // father
  ['aa', 760, 1400], // cup
  ['aa', 860, 2000], // cat
  ['E', 610, 2330], // bed
  ['E', 540, 2500], // bait
  ['I', 310, 2790], // beet
  ['I', 430, 2480], // bit
  ['O', 590, 920], // bought
  ['O', 500, 1000], // boat
  ['U', 370, 950], // boot
  ['U', 470, 1160], // book
  ['RR', 500, 1640], // bird
];
const PROTO_L = VOWEL_PROTOS.map(([v, f1, f2]) => [v, Math.log(f1), Math.log(f2)] as const);
/** Typical long-term mean of log F1 / log F2 in running speech (female); the speaker shift is measured against it. */
const REF_L1 = Math.log(540);
const REF_L2 = Math.log(1600);
/** Openness / frontness of each vowel viseme, for the debug read-out only. */
const OPEN: Partial<Record<Viseme, [number, number]>> = { aa: [1, 0.5], E: [0.6, 0.85], I: [0.2, 1], O: [0.6, 0.1], U: [0.2, 0.1], RR: [0.4, 0.5] };

/** Snapshot for meters and debugging. */
export interface LipSyncDebug {
  levelDb: number;
  floorDb: number;
  loudness: number;
  gate: boolean;
  openness: number;
  frontness: number;
  voicing: number;
  fricative: number;
  closure: number;
  fullBand: boolean;
  f1: number;
  f2: number;
}

const VOWEL_VISEMES: Viseme[] = ['aa', 'E', 'I', 'O', 'U', 'RR'];
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export class LipSyncEngine {
  readonly config: LipSyncConfig;
  private analyser: AnalyserNode | null = null;
  private sink: GainNode | null = null;
  private input: AudioNode | null = null;
  private ownsInput = false;
  private holdEl: HTMLAudioElement | null = null;
  private fx: FeatureExtractor | null = null;

  // state
  private floorDb = -60;
  private peakDb = -30;
  private sylPeakDb = -60;
  private prevLevel = -120;
  private gate = false;
  private gateHeld = 0;
  private quietFor = 0;
  private dipFor = 0;
  private m1 = REF_L1;
  private m2 = REF_L2;
  private l1 = REF_L1;
  private l2 = REF_L2;
  private burst = 0;
  private burstKind: Viseme = 'DD';
  private target = zeroMap();
  private vw = zeroMap();
  private x = zeroMap();
  private v = zeroMap();
  private amp = 0;
  private ampV = 0;
  private frame: VisemeFrame = { weights: {}, amplitude: 0, speaking: false };
  readonly debug: LipSyncDebug = {
    levelDb: -120, floorDb: -60, loudness: 0, gate: false, openness: 0, frontness: 0, voicing: 0, fricative: 0,
    closure: 0, fullBand: false, f1: 0, f2: 0,
  };

  constructor(config?: Partial<LipSyncConfig>) {
    this.config = { ...DEFAULT_LIPSYNC_CONFIG, ...config };
  }

  /** Change tunables live. */
  setConfig(patch: Partial<LipSyncConfig>): void {
    const fftChanged = patch.fftSize !== undefined && patch.fftSize !== this.config.fftSize;
    Object.assign(this.config, patch);
    if (fftChanged && this.analyser) {
      this.analyser.fftSize = this.config.fftSize;
      this.fx = new FeatureExtractor(this.analyser, this.analyser.context.sampleRate);
    }
  }

  get attached(): boolean {
    return !!this.input;
  }

  /** The analyser input, for callers that want to tap the same signal (meters). */
  get analyserNode(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Analyse a live MediaStream (Happi's side of the call). Nothing is played: the stream is only analysed.
   * Chrome (and some Android browsers) deliver silence to Web Audio from a REMOTE WebRTC stream unless the stream is
   * also attached to a media element, so it is attached to a muted, never-shown <audio> as well.
   */
  attachStream(stream: MediaStream): void {
    const ctx = getAudioContext();
    this.attachNode(ctx.createMediaStreamSource(stream), true);
    const el = document.createElement('audio');
    el.muted = true;
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.srcObject = stream;
    void el.play().catch(() => undefined);
    this.holdEl = el;
  }

  /** Analyse any node already in the shared graph (a BufferSource from `say`, a media element source, a filter). */
  attachNode(node: AudioNode, owns = false): void {
    this.detach();
    const ctx = getAudioContext();
    const an = ctx.createAnalyser();
    an.fftSize = this.config.fftSize;
    an.smoothingTimeConstant = 0;
    an.minDecibels = -110;
    an.maxDecibels = -10;
    // Analysers are only guaranteed to run when pulled by the destination, so feed a silent gain into it.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    node.connect(an);
    an.connect(sink);
    sink.connect(ctx.destination);
    this.analyser = an;
    this.sink = sink;
    this.input = node;
    this.ownsInput = owns;
    this.fx = new FeatureExtractor(an, ctx.sampleRate);
    this.resetState();
  }

  detach(): void {
    try {
      if (this.input && this.analyser) this.input.disconnect(this.analyser);
    } catch {
      /* already gone */
    }
    if (this.ownsInput) {
      try {
        this.input?.disconnect();
      } catch {
        /* ignore */
      }
    }
    try {
      this.analyser?.disconnect();
      this.sink?.disconnect();
    } catch {
      /* ignore */
    }
    if (this.holdEl) {
      this.holdEl.pause();
      this.holdEl.srcObject = null;
      this.holdEl = null;
    }
    this.analyser = null;
    this.sink = null;
    this.input = null;
    this.fx = null;
    this.gate = false;
    for (const k of VISEMES) this.target[k] = 0;
  }

  private resetState(): void {
    this.floorDb = this.config.floorMinDb + 15;
    this.peakDb = this.floorDb + this.config.dynamicRangeDb;
    this.gate = false;
    this.gateHeld = 0;
    this.burst = 0;
  }

  /** Advance one rendered frame. Always returns a frame (closing the mouth when nothing is attached). */
  update(dt: number): VisemeFrame {
    dt = Math.min(Math.max(dt, 0.001), 0.1);
    const c = this.config;
    const t = this.target;
    for (const k of VISEMES) t[k] = 0;
    let loud = 0;

    if (this.fx) {
      const f = this.fx.compute(c.bandTopHz, dt);
      loud = this.analyse(f, dt);
    }
    // Motion: critically damped per viseme; attack when rising, release when falling.
    const wA = 3.9 / (c.attackMs / 1000);
    const wR = 3.9 / (c.releaseMs / 1000);
    const weights: Partial<Record<Viseme, number>> = {};
    for (const k of VISEMES) {
      const w = t[k] > this.x[k] ? wA : wR;
      [this.x[k], this.v[k]] = spring(this.x[k], this.v[k], t[k], w, dt);
      const val = clamp01(this.x[k]);
      if (val > 0.002) weights[k] = val;
    }
    const wJ = 3.9 / (c.jawMs / 1000);
    [this.amp, this.ampV] = spring(this.amp, this.ampV, loud, wJ, dt);
    this.frame = { weights, amplitude: clamp01(this.amp), speaking: this.gate };
    return this.frame;
  }

  get lastFrame(): VisemeFrame {
    return this.frame;
  }

  /** Features -> target weights. Returns the loudness (0..1) used for the jaw/energy envelope. */
  private analyse(f: Features, dt: number): number {
    const c = this.config;
    const d = this.debug;
    const lvl = Math.max(f.levelDb, -120);

    // ---- noise floor: falls instantly to quieter levels, rises slowly (faster while nobody talks)
    if (lvl < this.floorDb) this.floorDb = lvl;
    else this.floorDb += c.floorRiseDbPerSec * (this.gate ? 1 : 3) * dt;
    this.floorDb = Math.max(this.floorDb, c.floorMinDb);

    // ---- gate with hysteresis and hold
    const above = lvl - this.floorDb;
    if (above > c.gateOpenDb) {
      this.gate = true;
      this.gateHeld = 0;
    } else if (this.gate && above < c.gateCloseDb) {
      this.gateHeld += dt * 1000;
      if (this.gateHeld > c.gateHoldMs) this.gate = false;
    } else if (this.gate) {
      this.gateHeld = 0;
    }
    this.quietFor = this.gate ? 0 : this.quietFor + dt;

    // ---- loudness, auto-ranged between the gate and recent peaks
    this.peakDb = Math.max(lvl, this.peakDb - 4 * dt);
    // 1 at the recent peak, 0 at dynamicRangeDb below it (or at the gate, whichever is higher).
    const base = Math.max(this.floorDb + c.gateCloseDb, this.peakDb - c.dynamicRangeDb);
    let loud = clamp01((lvl - base) / Math.max(6, this.peakDb - base));
    loud = Math.pow(loud, c.loudnessGamma);
    // Syllable peak: decays fast, so a quick dip after a vowel shows up as a closure.
    this.sylPeakDb = Math.max(lvl, this.sylPeakDb - 45 * dt);
    const onsetRate = (lvl - this.prevLevel) / dt;
    this.prevLevel = lvl;

    d.levelDb = lvl;
    d.floorDb = this.floorDb;
    d.loudness = loud;
    d.gate = this.gate;
    d.voicing = f.voicing;
    d.fullBand = f.fullBand;
    d.f1 = f.f1;
    d.f2 = f.f2;

    if (!this.gate) {
      d.fricative = 0;
      d.closure = 0;
      this.burst = 0;
      return 0;
    }
    const t = this.target;
    const k = c.intensity;

    // ---- formants: smoothed in log Hz while voiced; speaker shift from their long-term mean (capped)
    const voiced = f.voicing > 0.45 && loud > 0.12 && f.f1 > 0;
    if (voiced) {
      const fa = 1 - Math.exp(-dt / 0.02);
      this.l1 += (Math.log(f.f1) - this.l1) * fa;
      if (f.f2 > 0) this.l2 += (Math.log(f.f2) - this.l2) * fa;
      const a = Math.min(1, dt / c.speakerAdaptSec);
      this.m1 += (this.l1 - this.m1) * a;
      this.m2 += (this.l2 - this.m2) * a;
    }
    const s1 = Math.max(-0.15, Math.min(0.15, this.m1 - REF_L1));
    const s2 = Math.max(-0.15, Math.min(0.15, this.m2 - REF_L2));
    const x1 = this.l1 - s1;
    const x2 = this.l2 - s2;

    // ---- fricatives (S/Z, SH/CH/J, F/V/TH): unvoiced-ish, energy tilted up
    const tiltScore = f.fullBand ? Math.max(f.tiltDb, f.hissDb + 6) : f.tiltDb;
    let fric = sigmoid((tiltScore + 4) / 2.5) * (1 - clamp01((f.voicing - 0.35) / 0.4));
    // Frication needs real energy: near the floor (pauses, digital silence) the tilt is meaningless.
    fric *= clamp01((above - c.gateCloseDb) / 6);
    fric = clamp01(fric * c.fricativeGain);
    d.fricative = fric;

    // ---- closures (P/B/M): a sharp dip below the syllable peak while still inside speech
    const dip = this.sylPeakDb - lvl;
    let closure = clamp01((dip - c.closureDipDb * 0.6) / (c.closureDipDb * 0.6)) * (1 - fric);
    // nasal murmur (m, n): voiced, quiet, all energy low
    const nasal = clamp01((f.nasalDb - 10) / 8) * clamp01((f.voicing - 0.4) / 0.3) * (1 - loud);
    // A stop closure lasts ~50-120 ms. A longer dip is a phrase ending or a pause, where the lips just rest.
    this.dipFor = closure > 0.25 ? this.dipFor + dt : 0;
    closure *= 1 - clamp01((this.dipFor - 0.08) / 0.07);
    closure = clamp01(closure + nasal * 0.5) * c.closureGain;
    d.closure = closure;

    // ---- bursts (T/D/K): a fast onset right after a closure
    // A plosive release is aperiodic; a voiced onset after a pause is just the vowel starting.
    if (onsetRate > 180 && dip < 4 && f.voicing < 0.55) {
      this.burst = 1;
      this.burstKind = this.l2 - s2 > Math.log(1500) ? 'DD' : 'kk';
    }
    this.burst = Math.max(0, this.burst - dt / 0.07);

    // ---- vowels: soft nearest-prototype classification in log-formant space
    const sharp = c.vowelSharpness;
    const s1w = 0.17 / sharp;
    const s2w = 0.13 / sharp;
    const vw = this.vw;
    for (const k of VOWEL_VISEMES) vw[k] = 0;
    let sum = 0;
    for (const [name, p1, p2] of PROTO_L) {
      const e = Math.exp(-0.5 * (((x1 - p1) / s1w) ** 2 + ((x2 - p2) / s2w) ** 2));
      vw[name] += e;
      sum += e;
    }
    // Far from every prototype (a glide, noise, a non-English vowel): fall back to a neutral open shape.
    const neutral = 0.02;
    vw.aa += neutral * 0.6;
    vw.E += neutral * 0.4;
    sum += neutral;
    let openness = 0;
    let frontness = 0;
    for (const k of VOWEL_VISEMES) {
      vw[k] /= sum;
      openness += vw[k] * OPEN[k]![0];
      frontness += vw[k] * OPEN[k]![1];
    }
    d.openness = openness;
    d.frontness = frontness;
    const vowelAmt = loud * (1 - fric) * (1 - closure) * k;
    for (const v of VOWEL_VISEMES) t[v] += vowelAmt * vw[v];

    // fricative shape: phone audio cannot see S (4-8 kHz), so S vs SH comes from where the 1.8-3.4 kHz energy sits
    const fricAmt = fric * k * (0.6 + 0.4 * clamp01(loud * 2));
    // S vs SH: with energy above 4.5 kHz (full band) S is the one that has most of it. On a phone line that band is
    // gone, so fall back to where the 1.8-3.4 kHz energy sits (SH a little lower); it is a soft guess, so blend.
    const sh = f.hissDb > -25 ? clamp01((-f.hissDb - 3) / 8) : 0.15 + 0.6 * clamp01((2650 - f.hiCentroid) / 500);
    // Quiet AND spectrally flat frication reads as F/V/TH (S/SH rise steeply toward the top of the band).
    const weak = clamp01((0.3 - loud) / 0.3) * clamp01((6 - f.tiltDb) / 6);
    t.SS += fricAmt * (1 - sh) * (1 - weak);
    t.CH += fricAmt * sh * (1 - weak);
    t.FF += fricAmt * weak;

    t.PP += closure * Math.max(0.5, 1 - nasal);
    t.nn += nasal * 0.6 * c.closureGain;
    t[this.burstKind] += this.burst * c.burstGain * k * 0.8;

    // ---- caps: shapes blend instead of fighting
    let total = 0;
    for (const v of VISEMES) {
      t[v] = Math.min(t[v], c.maxViseme);
      total += t[v];
    }
    if (total > c.maxTotal) {
      const s = c.maxTotal / total;
      for (const v of VISEMES) t[v] *= s;
    }
    return loud * k;
  }

  dispose(): void {
    this.detach();
  }
}

/** Exact step of a critically damped spring toward `target` (stable for any dt). */
function spring(x: number, v: number, target: number, w: number, dt: number): [number, number] {
  const x0 = x - target;
  const e = Math.exp(-w * dt);
  const j = (v + w * x0) * dt;
  return [target + (x0 + j) * e, (v - w * j) * e];
}
