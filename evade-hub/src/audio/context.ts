// ONE AudioContext for the whole app (iOS Safari allows only a few, and each one created outside a gesture starts
// "suspended"). Everyone imports `getAudioContext()` from here; nobody calls `new AudioContext()` anywhere else.
//
// `unlockAudio()` must run inside a user gesture (tap / click / keydown). It resumes the context and plays one
// silent buffer, which is what iOS needs to let later audio (including WebRTC analysis) through.

let ctx: AudioContext | null = null;
let unlocked = false;
const listeners = new Set<(running: boolean) => void>();

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** The shared AudioContext (created lazily; may be 'suspended' until `unlockAudio()` runs in a gesture). */
export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) throw new Error('Web Audio is not supported in this browser');
    // 'interactive' keeps output latency low; the sample rate is left to the device (forcing one costs a resampler).
    ctx = new Ctor({ latencyHint: 'interactive' });
    ctx.addEventListener('statechange', () => {
      const running = ctx?.state === 'running';
      listeners.forEach((cb) => cb(running));
    });
  }
  return ctx;
}

/** True once the context is running. */
export function isAudioRunning(): boolean {
  return !!ctx && ctx.state === 'running';
}

/** Called whenever the context starts or stops running (for example after an iOS interruption). */
export function onAudioStateChange(cb: (running: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Call inside a user gesture. Safe to call many times. */
export function unlockAudio(): void {
  let c: AudioContext;
  try {
    c = getAudioContext();
  } catch {
    return;
  }
  if (c.state !== 'running') void c.resume().catch(() => undefined);
  if (!unlocked) {
    unlocked = true;
    try {
      // A one-sample silent buffer started in the gesture is what actually unlocks output on iOS.
      const b = c.createBuffer(1, 1, c.sampleRate);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }
}

/** Resume after an interruption (call from any later gesture; cheap when already running). */
export function ensureAudioRunning(): Promise<void> {
  const c = getAudioContext();
  return c.state === 'running' ? Promise.resolve() : c.resume().catch(() => undefined);
}

// iOS suspends ("interrupted") the context when the app is backgrounded or a call takes the audio session. Try to
// resume when the page becomes visible again; if that is refused, the next tap that calls `unlockAudio()` fixes it.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running' && unlocked) {
      void ctx.resume().catch(() => undefined);
    }
  });
}
