// The jukebox's ears: an AnalyserNode on the theme song, so its light bars pulse to the music. The theme video's
// audio is routed through the shared AudioContext only once the jukebox is first tapped (a gesture, with the context
// running): from then on the element plays through Web Audio (createMediaElementSource can only be called once per
// element). Until then, or if routing fails, the bars follow a soft made-up beat while the theme plays.
import { getAudioContext, unlockAudio } from '../../../audio/context';

let analyser: AnalyserNode | null = null;
let routed: HTMLMediaElement | null = null;
let bins: Uint8Array<ArrayBuffer> | null = null;
let failed = false;

/** Call from a tap: route the theme through an analyser (once). Safe to call many times. */
export function listenTo(el: HTMLMediaElement): void {
  if (routed === el || failed) return;
  try {
    unlockAudio();
    const ctx = getAudioContext();
    if (ctx.state !== 'running') { void ctx.resume().catch(() => undefined); }
    const src = ctx.createMediaElementSource(el);
    const an = ctx.createAnalyser();
    an.fftSize = 64;
    an.smoothingTimeConstant = 0.72;
    src.connect(an);
    an.connect(ctx.destination);
    analyser = an;
    routed = el;
    bins = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
  } catch (e) {
    failed = true;
    console.warn('[house] jukebox analyser unavailable, using a soft beat', e);
  }
}

/**
 * Fill `out` (0..1 per bar) with the music's level in `out.length` bands. Returns false when there is no real
 * signal (not routed, silent or muted): the caller then animates a made-up beat.
 */
export function levels(out: Float32Array): boolean {
  if (!analyser || !bins) return false;
  analyser.getByteFrequencyData(bins);
  const n = out.length, usable = Math.floor(bins.length * 0.75);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * usable), b = Math.max(a + 1, Math.floor(((i + 1) / n) * usable));
    let m = 0;
    for (let k = a; k < b; k++) m = Math.max(m, bins[k]);
    out[i] = m / 255;
    sum += m;
  }
  return sum > 4;
}

/** A made-up beat (about 112 bpm) for when there is no analyser. */
export function fakeLevels(out: Float32Array, t: number, on: boolean): void {
  const beat = (t * 112) / 60;
  const kick = Math.pow(1 - (beat % 1), 3);
  for (let i = 0; i < out.length; i++) {
    const w = 0.5 + 0.5 * Math.sin(t * (2.3 + i * 0.7) + i * 1.7);
    out[i] = on ? Math.min(1, 0.18 + kick * (0.75 - i * 0.05) + w * 0.3) : 0;
  }
}
