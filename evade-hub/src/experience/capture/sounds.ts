// Capture sounds (polish-4): a soft tick for each countdown number and a camera shutter at the photo. WebAudio on the
// app's ONE AudioContext (no audio files): short envelopes that stop themselves. Silent when the context is not
// running (it is unlocked by the taps that got you here); never throws.
import { getAudioContext } from '@/audio/context';

function ctx(): AudioContext | null {
  try {
    const c = getAudioContext();
    if (c.state === 'suspended') void c.resume().catch(() => undefined);
    return c.state === 'running' ? c : null;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, f: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', slide = 0): void {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.03);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { /* gone */ } };
}

let noise: AudioBuffer | null = null;
function burst(c: AudioContext, at: number, dur: number, gain: number, freq: number): void {
  if (!noise || noise.sampleRate !== c.sampleRate) {
    noise = c.createBuffer(1, Math.round(c.sampleRate * 0.12), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise;
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 0.9;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(bp).connect(g).connect(c.destination);
  s.start(at);
  s.stop(at + dur + 0.02);
  s.onended = () => { try { s.disconnect(); bp.disconnect(); g.disconnect(); } catch { /* gone */ } };
}

/** A countdown number: a soft blip (`last` = the "1", a touch higher). */
export function tickSound(soft = false, last = false): void {
  const c = ctx();
  if (!c) return;
  try { tone(c, last ? 1046.5 : 784, c.currentTime, 0.11, soft ? 0.07 : 0.12, 'triangle'); } catch { /* no audio */ }
}

/** "Smile!": a quick rising two-note chime. */
export function smileSound(soft = false): void {
  const c = ctx();
  if (!c) return;
  try {
    const t = c.currentTime, g = soft ? 0.06 : 0.1;
    tone(c, 659.3, t, 0.16, g, 'sine');
    tone(c, 987.8, t + 0.09, 0.22, g, 'sine');
  } catch { /* no audio */ }
}

/** A camera shutter: two short clicks (the blades) over a low thump. */
export function shutterSound(soft = false): void {
  const c = ctx();
  if (!c) return;
  try {
    const t = c.currentTime, k = soft ? 0.5 : 1;
    burst(c, t, 0.045, 0.5 * k, 3200);
    tone(c, 140, t, 0.08, 0.18 * k, 'sine', 70);
    burst(c, t + 0.075, 0.06, 0.35 * k, 2200);
  } catch { /* no audio */ }
}
