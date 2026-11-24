// Little synth sounds for the mini games (WebAudio oscillators on the app's ONE AudioContext; no audio files).
// Every note is a short envelope that stops itself; `dispose()` disconnects the bus so nothing outlives a game.
import { getAudioContext } from '@/audio/context';

interface Note { f: number; dur?: number; type?: OscillatorType; gain?: number; slide?: number; at?: number; attack?: number }

export class PlaySounds {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  muted = false;

  constructor(private soft = false) {
    try {
      this.ctx = getAudioContext();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = soft ? 0.5 : 0.7;
      this.bus.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  private note(o: Note): void {
    const c = this.ctx, bus = this.bus;
    if (!c || !bus || this.muted || c.state !== 'running') return;
    const t0 = o.at ?? c.currentTime, dur = o.dur ?? 0.2, g = Math.max(0.0002, o.gain ?? 0.16);
    try {
      const osc = c.createOscillator(), env = c.createGain();
      osc.type = o.type ?? 'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(g, t0 + Math.min(o.attack ?? 0.008, dur * 0.5));
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(env);
      env.connect(bus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      osc.onended = () => { try { osc.disconnect(); env.disconnect(); } catch { /* gone */ } };
    } catch { /* audio not available */ }
  }

  private get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** A pickup: the pitch climbs with the streak (a run of pickups reads as a combo). */
  blip(streak: number): void {
    const f = 587.3 * Math.pow(1.06, Math.min(Math.max(streak, 1) - 1, 14));
    this.note({ f, dur: 0.2, type: 'triangle', gain: 0.18, slide: f * 1.45 });
    this.note({ f: f * 2, dur: 0.12, gain: 0.06 });
  }
  /** Rainbow / star: a quick sparkly arpeggio. */
  sparkle(): void {
    const t = this.now;
    [784, 988, 1175, 1568].forEach((f, i) => this.note({ f, dur: 0.24, type: 'sine', gain: 0.12, at: t + i * 0.05 }));
  }
  /** A countdown tick (go = higher and longer). */
  tick(go = false): void {
    this.note(go ? { f: 1046.5, dur: 0.34, type: 'triangle', gain: 0.18 } : { f: 659.3, dur: 0.12, type: 'triangle', gain: 0.14 });
  }
  /** Lost something (the raincloud, a miss). */
  bump(): void {
    this.note({ f: 330, dur: 0.28, type: 'triangle', gain: 0.12, slide: 180 });
  }
  /** A whoosh-ish throw. */
  throw(): void {
    this.note({ f: 260, dur: 0.16, type: 'sine', gain: 0.07, slide: 520 });
  }
  /** Through the ring; a swish rings higher. */
  score(swish: boolean, streak: number): void {
    const t = this.now, base = 523.25 * Math.pow(1.05, Math.min(streak, 10));
    this.note({ f: base, dur: 0.22, type: 'triangle', gain: 0.17, at: t });
    this.note({ f: base * 1.26, dur: 0.22, type: 'triangle', gain: 0.15, at: t + 0.07 });
    if (swish) this.note({ f: base * 2, dur: 0.4, type: 'sine', gain: 0.1, at: t + 0.12 });
  }
  /** Touching the ring's edge. */
  rim(): void {
    this.note({ f: 1400 + Math.random() * 200, dur: 0.2, type: 'triangle', gain: 0.05 });
  }
  /** Time almost up. */
  warn(): void {
    this.note({ f: 880, dur: 0.07, type: 'square', gain: 0.04 });
  }
  /** Round over: a rising major arpeggio (stars = how far it climbs). */
  finish(stars: number): void {
    const t = this.now;
    const notes = [523.25, 659.25, 783.99, 1046.5].slice(0, 1 + Math.max(1, stars));
    notes.forEach((f, i) => this.note({ f, dur: 0.6, type: 'sine', gain: 0.15, at: t + i * 0.1 }));
  }

  dispose(): void {
    try { this.bus?.disconnect(); } catch { /* gone */ }
    this.bus = null;
    this.ctx = null;
  }
}
