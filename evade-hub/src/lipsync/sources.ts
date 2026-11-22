// Helpers to get audio into the shared AudioContext for analysis.
import { getAudioContext } from '../audio/context';

const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

/**
 * A MediaElementAudioSourceNode for `el` (created once per element: the browser allows only one).
 * Note: once an element is routed through Web Audio, it is only heard if the node is connected to the destination.
 */
export function mediaElementSource(el: HTMLMediaElement): MediaElementAudioSourceNode {
  let n = elementSources.get(el);
  if (!n) {
    n = getAudioContext().createMediaElementSource(el);
    elementSources.set(el, n);
  }
  return n;
}

/**
 * Live "phone quality" chain on the shared context: 300-3400 Hz band-pass (4th order each side) and mild 8-bit
 * mu-law style quantisation. For files, `renderPhoneBand` does a real 8 kHz render instead.
 */
export function phoneBandFilter(): { input: AudioNode; output: AudioNode; dispose(): void } {
  const ctx = getAudioContext();
  const nodes: AudioNode[] = [];
  const mk = (type: BiquadFilterType, f: number) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = 0.707;
    nodes.push(b);
    return b;
  };
  const chain = [mk('highpass', 300), mk('highpass', 300), mk('lowpass', 3400), mk('lowpass', 3400), mk('lowpass', 3600)];
  const shaper = ctx.createWaveShaper();
  shaper.curve = muLawCurve();
  nodes.push(shaper);
  for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
  chain[chain.length - 1].connect(shaper);
  return {
    input: chain[0],
    output: shaper,
    dispose: () => nodes.forEach((n) => n.disconnect()),
  };
}

function muLawCurve(): Float32Array<ArrayBuffer> {
  const n = 4096;
  const c = new Float32Array(n);
  const mu = 255;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const y = (Math.sign(x) * Math.log(1 + mu * Math.abs(x))) / Math.log(1 + mu);
    const q = Math.round(y * 127) / 127;
    c[i] = (Math.sign(q) * (Math.pow(1 + mu, Math.abs(q)) - 1)) / mu;
  }
  return c;
}

/**
 * Re-render a buffer the way a PSTN call carries it: resampled to 8 kHz, band-limited to 300-3400 Hz, mu-law
 * quantised. Uses an OfflineAudioContext (not a live context, so it does not count against iOS's limit).
 */
export async function renderPhoneBand(buf: AudioBuffer): Promise<AudioBuffer> {
  const rate = 8000;
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  const hp1 = off.createBiquadFilter();
  hp1.type = 'highpass';
  hp1.frequency.value = 300;
  const hp2 = off.createBiquadFilter();
  hp2.type = 'highpass';
  hp2.frequency.value = 300;
  const lp1 = off.createBiquadFilter();
  lp1.type = 'lowpass';
  lp1.frequency.value = 3400;
  const lp2 = off.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = 3400;
  const sh = off.createWaveShaper();
  sh.curve = muLawCurve();
  src.connect(hp1).connect(hp2).connect(lp1).connect(lp2).connect(sh).connect(off.destination);
  src.start();
  return off.startRendering();
}
