// Happi's voice level (0..1) for the UI: the talk button's rings and the call card avatar follow it.
// Sources, best first: an analyser on her remote stream, else the `amplitude` of the viseme frames. Nothing runs
// unless something subscribes (the orb subscribes only during a call), and subscribers get the value straight from
// a rAF loop, so React never re-renders for it.
import { getAudioContext } from '@/audio/context';

type Sub = (level: number, live: boolean) => void;

export class VoiceLevel {
  private src: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private sink: GainNode | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private amp = 0;
  private ampAt = 0;
  private level = 0;
  private lastSignal = 0;
  private subs = new Set<Sub>();
  private raf = 0;

  /** Her remote audio. A stream with no audio track (or none) just leaves the viseme amplitude as the source. */
  setStream(stream: MediaStream | null): void {
    this.detach();
    if (!stream || !stream.getAudioTracks?.().length) return;
    try {
      const ctx = getAudioContext();
      this.src = ctx.createMediaStreamSource(stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      this.buf = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
      // Safari only pulls an analyser that reaches the destination: through a muted gain
      this.sink = ctx.createGain();
      this.sink.gain.value = 0;
      this.src.connect(this.analyser);
      this.analyser.connect(this.sink);
      this.sink.connect(ctx.destination);
    } catch {
      this.detach();
    }
  }

  /** Viseme frame loudness (0..1), used when there is no analysable stream. */
  setAmplitude(a: number | null | undefined): void {
    this.amp = Math.max(0, Math.min(1, a ?? 0));
    this.ampAt = performance.now();
  }

  subscribe(cb: Sub): () => void {
    this.subs.add(cb);
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    return () => {
      this.subs.delete(cb);
      if (!this.subs.size && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; this.level = 0; }
    };
  }

  dispose(): void {
    this.detach();
    this.subs.clear();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private detach(): void {
    try { this.src?.disconnect(); this.analyser?.disconnect(); this.sink?.disconnect(); } catch { /* already gone */ }
    this.src = null; this.analyser = null; this.sink = null; this.buf = null;
  }

  private tick = (): void => {
    this.raf = requestAnimationFrame(this.tick);
    const now = performance.now();
    let raw = 0;
    if (this.analyser && this.buf) {
      this.analyser.getByteTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) { const v = (this.buf[i] - 128) / 128; sum += v * v; }
      raw = Math.min(1, Math.sqrt(sum / this.buf.length) * 4.5); // speech RMS ~0.05-0.2 -> 0.2-0.9
    }
    if (raw < 0.02 && now - this.ampAt < 400) raw = this.amp; // frames can come slowly (busy main thread)
    if (raw > 0.04) this.lastSignal = now;
    // fast attack, slow release: rings jump with syllables and settle between them
    this.level += (raw - this.level) * (raw > this.level ? 0.55 : 0.12);
    const live = now - this.lastSignal < 1200;
    for (const cb of this.subs) cb(this.level, live);
  };
}
