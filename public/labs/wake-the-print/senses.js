// Senses: on-device AI that runs beside 8th Wall on the same camera video.
//   - hands (MediaPipe Gesture Recognizer) at ~12 Hz: palm position, open/closed, and a gesture name
//     (Thumb_Up, Victory, Pointing_Up, ILoveYou, Closed_Fist, Thumb_Down, Open_Palm) -> gestures + palm perch.
//     If the gesture model does not load, the Hand Landmarker is used instead (no gesture names, perch still works).
//     Each model must find the hand in hand-check.jpg (the canary) before it is used; order gesture GPU, gesture CPU,
//     landmarker GPU, landmarker CPU. A GPU model that sees no hand in its first 60 video runs is swapped for CPU
//     once. On CPU the model gets a 384 px copy of the frame at 8 Hz.
//   - object detection (MediaPipe Object Detector, 80 everyday classes) on demand      -> "what Spark sees"
//   - brightness + main colour from a 32 px copy of the frame
// 8th Wall stays the source of truth for where the print is; these only add understanding.
// Nothing here leaves the phone. Models load after the camera starts, never blocking Start.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const OBJ_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';
const HAND_HZ = 12, HAND_HZ_CPU = 8;   // CPU: fewer runs a second so the phone keeps its frame rate
const CPU_SIDE = 384;                   // CPU: the model gets a copy of the frame with this long side (landmarks are 0..1)
const WATCH_RUNS = 60;                  // GPU: no hand in this many video runs -> switch to CPU once
// The canary: a real photo of a hand. Each new hand model must find a hand in it before it is used, because on some
// phones the GPU delegate creates fine, runs fast and silently returns no hands (Samsung, 2026-11-16).
const CANARY = new URL('./hand-check.jpg', import.meta.url).href;

// opts.hand: 'cpu' | 'gpu' forces the delegate (no fallback to the other one, no watchdog; the canary still runs and
// is logged). opts.test (only with ?test): { canaryFail: ['gesture-GPU', ...] -> that attempt's canary reports no
// hands; watchRuns: n -> watchdog after n runs, counting every run as handless }.
export function createSenses({ onStatus, hand: force = null, test = null } = {}) {
  let video = null, hands = null, detector = null, lib = null, fileset = null, paused = false, lastTs = 0;
  let lastHandAt = 0, handRuns = 0, handMs = 0, handErrors = 0, gpuRuns = 0, gpuSeen = 0, switching = false;
  force = force === 'cpu' ? 'CPU' : force === 'gpu' ? 'GPU' : null;
  // handModel: 'gesture' | 'landmarker'; handDelegate: 'GPU' | 'CPU'; handCanary: one entry per model tried
  const status = { hands: 'off', objects: 'off', handModel: null, handDelegate: null, handForced: force, handCanary: [], handSwitched: false };
  const small = document.createElement('canvas'), sctx = small.getContext('2d');   // CPU input, reused
  // gesture: MediaPipe category name (null for none / 'None' / landmarker fallback); score: its confidence 0..1
  const hand = { seen: false, at: 0, open: false, cx: 0, cy: 0, palmPx: 0, landmarks: null, gesture: null, score: 0 };
  const tiny = document.createElement('canvas'); tiny.width = tiny.height = 32;
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  const say = (k, v) => { status[k] = v; onStatus && onStatus({ ...status }); };

  async function load() {
    try {
      lib = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
      fileset = await lib.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    } catch (e) { say('hands', 'failed'); say('objects', 'failed'); console.warn('senses: library', e); return; }
    say('hands', 'loading');
    // gesture GPU, gesture CPU, landmarker GPU, landmarker CPU (only the forced delegate with ?hand=)
    const order = [['gesture', 'GPU'], ['gesture', 'CPU'], ['landmarker', 'GPU'], ['landmarker', 'CPU']].filter(([, d]) => !force || d === force);
    if (!(await pick(order, !!force))) say('hands', 'failed');
  }
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  let canaryImg = null;
  // Try each [model, delegate] in turn; use the first whose canary finds a hand. anyOk: use the first that creates
  // even if its canary fails (forced delegate). Returns true when a model is in use.
  async function pick(order, anyOk) {
    if (!canaryImg) canaryImg = await loadImg(CANARY).then((i) => i.decode().then(() => i)).catch((e) => { console.warn('senses: canary photo', e); return null; });
    for (const [kind, delegate] of order) {
      const entry = { model: kind, delegate, ok: false, hands: 0, gesture: null, score: 0, ms: null };
      let m = null;
      try {
        const Task = kind === 'gesture' ? lib.GestureRecognizer : lib.HandLandmarker;
        m = await Task.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: kind === 'gesture' ? GESTURE_MODEL : HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
          minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.5,
        });
      } catch (e) { entry.error = String((e && e.message) || e).slice(0, 120); status.handCanary.push(entry); say('handCanary', status.handCanary); console.warn(`senses: ${kind} ${delegate}`, e); continue; }
      if (canaryImg) {
        // VIDEO mode: the canary takes a timestamp from the same rising clock as the video frames (see stamp())
        try {
          const t0 = performance.now(); let res = null;
          for (let i = 0; i < 2 && !(res && res.landmarks && res.landmarks.length); i++) res = infer(m, kind, canaryImg, stamp(performance.now()));
          entry.ms = Math.round(performance.now() - t0);
          if (test && test.canaryFail && test.canaryFail.includes(`${kind}-${delegate}`)) res = { landmarks: [], gestures: [] };   // test: a broken delegate
          const g = res && res.gestures && res.gestures[0] && res.gestures[0][0];
          entry.hands = (res && res.landmarks && res.landmarks.length) || 0; entry.ok = entry.hands > 0;
          if (g) { entry.gesture = g.categoryName; entry.score = +(g.score || 0).toFixed(2); }
        } catch (e) { entry.error = String((e && e.message) || e).slice(0, 120); }
      } else entry.error = 'no canary photo';
      status.handCanary.push(entry); say('handCanary', status.handCanary);
      if (entry.ok || anyOk || !canaryImg) {   // no photo (offline?): nothing to judge by, take the model
        hands = m; gpuRuns = gpuSeen = 0; status.handModel = kind; status.handDelegate = delegate; say('hands', 'ready');
        return true;
      }
      try { m.close(); } catch (e) { /* already gone */ }
    }
    return false;
  }
  // Runtime watchdog: a GPU model with no hand in its first WATCH_RUNS video runs is swapped for CPU, once.
  async function toCpu() {
    switching = true;
    const old = hands, kind = status.handModel; hands = null; hand.seen = false;
    try { old.close(); } catch (e) { /* ignore */ }
    console.warn(`senses: no hand in ${gpuRuns} GPU runs, switching to CPU`);
    status.handSwitched = true;
    const order = [[kind, 'CPU'], ...(kind === 'gesture' ? [['landmarker', 'CPU']] : [])];
    if (!(await pick(order, false))) say('hands', 'failed'); else say('handSwitched', true);
    switching = false;
  }
  async function loadDetector() {
    if (detector || !lib || status.objects === 'loading') return;
    say('objects', 'loading');
    try {
      detector = await lib.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: OBJ_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', scoreThreshold: 0.42, maxResults: 8,
      });
      say('objects', 'ready');
    } catch (e) { say('objects', 'failed'); console.warn('senses: objects', e); }
  }

  function setVideo(v) { video = v; }
  const ready = () => video && video.readyState >= 2 && video.videoWidth > 0;

  // VIDEO mode needs rising timestamps: one clock for the canary, the video frames and test pictures
  const stamp = (now) => (lastTs = Math.max(now, lastTs + 1));
  const infer = (m, kind, src, ts) => (kind === 'gesture' ? m.recognizeForVideo(src, ts) : m.detectForVideo(src, ts));
  // one model run on a video frame (or, for tests, any image/canvas); fills `hand`. fromVideo: counts for the watchdog.
  function run(src, now, sw, sh, fromVideo) {
    const ts = stamp(now);
    let res; const t0 = performance.now();
    try { res = infer(hands, status.handModel, src, ts); } catch (e) { if (++handErrors <= 3) console.warn('senses: hand run', e); return false; }
    handMs += performance.now() - t0; handRuns++;
    const lm = res && res.landmarks && res.landmarks[0];
    if (fromVideo && status.handDelegate === 'GPU' && !force && !status.handSwitched) {
      gpuRuns++; if (lm && !(test && test.watchRuns)) gpuSeen++;
      if (!gpuSeen && gpuRuns >= ((test && test.watchRuns) || WATCH_RUNS)) { toCpu(); return true; }
    }
    if (!lm) { hand.seen = false; hand.gesture = null; hand.score = 0; return true; }
    const g = res.gestures && res.gestures[0] && res.gestures[0][0];
    // hand.at = when the result is ready (not when the frame was taken), so freshness checks hold on a slow phone too
    setHand(lm, performance.now(), g && g.categoryName && g.categoryName !== 'None' ? g.categoryName : null, g ? g.score || 0 : 0, sw, sh);
    return true;
  }
  // called every frame; runs the hand model at HAND_HZ (HAND_HZ_CPU on CPU). The calls are synchronous, so the next
  // one is timed from when this one ENDS: a slow CPU call cannot make runs pile up frame after frame.
  function tick(now) {
    const cpu = status.handDelegate === 'CPU';
    if (!hands || switching || paused || !ready() || now - lastHandAt < 1000 / (cpu ? HAND_HZ_CPU : HAND_HZ)) return;
    let src = video;
    if (cpu) {   // CPU: a downscaled copy of the frame, same aspect ratio
      const vw = video.videoWidth, vh = video.videoHeight, k = Math.min(1, CPU_SIDE / Math.max(vw, vh));
      const w = Math.round(vw * k), h = Math.round(vh * k);
      if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
      try { sctx.drawImage(video, 0, 0, w, h); src = small; } catch (e) { src = video; }
    }
    run(src, now, 0, 0, true);   // sw/sh 0: palmPx etc. use the real video size (landmarks are 0..1)
    lastHandAt = performance.now();
  }
  // test hook: run the hand model once on an image / canvas, as if it were the camera frame. palmPx is scaled to
  // video pixels (as if the picture were stretched to the video's width). Returns a copy of `hand`.
  function analyse(src) {
    if (!hands) return null;
    const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
    run(src, performance.now(), sw, sh);
    return { ...hand, landmarks: undefined };
  }
  // landmarks: 21 points, x/y in 0..1 of the frame. gesture/score: from the gesture model (null/0 otherwise).
  function setHand(lm, now, gesture = null, score = 0, sw = 0, sh = 0) {
    const vw0 = video ? video.videoWidth : 1, vh0 = video ? video.videoHeight : 1;
    const vw = sw || vw0, vh = sh || vh0, k = sw ? vw0 / sw : 1;   // k: test pictures -> video pixels
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * vw, (lm[a].y - lm[b].y) * vh);
    // open hand: at least 3 of 4 fingertips further from the wrist than their middle joint
    let ext = 0; for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(tip, 0) > d(pip, 0) * 1.08) ext++;
    hand.seen = true; hand.at = now; hand.open = ext >= 3; hand.landmarks = lm; hand.gesture = gesture; hand.score = score;
    hand.cx = (lm[0].x + lm[5].x + lm[17].x) / 3; hand.cy = (lm[0].y + lm[5].y + lm[17].y) / 3;
    // palm size in video pixels: the larger of two bone lengths, scaled to a common "palm width" (foreshortening
    // only ever makes a bone look shorter, so the larger estimate is the better one)
    hand.palmPx = Math.max(d(5, 17), d(0, 9) * (0.075 / 0.095)) * k;
  }

  function frameStats() {
    if (!ready()) return null;
    try {
      tctx.drawImage(video, 0, 0, 32, 32);
      const px = tctx.getImageData(0, 0, 32, 32).data;
      let lum = 0, hx = 0, hy = 0, sat = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        lum += 0.2126 * r + 0.7152 * g + 0.0722 * b; n++;
        const c = mx - mn; if (c < 0.18) continue;
        let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4; h *= Math.PI / 3;
        hx += Math.cos(h) * c; hy += Math.sin(h) * c; sat += c;
      }
      lum /= n;
      let colour = 'neutral';
      if (sat / n > 0.05) {
        let deg = Math.atan2(hy, hx) * 180 / Math.PI; if (deg < 0) deg += 360;
        colour = deg < 20 || deg >= 340 ? 'red' : deg < 45 ? 'orange' : deg < 70 ? 'yellow' : deg < 160 ? 'green' : deg < 200 ? 'teal' : deg < 260 ? 'blue' : deg < 300 ? 'purple' : 'pink';
      }
      return { light: lum < 0.22 ? 'dim' : lum > 0.62 ? 'bright' : 'normal', colour };
    } catch (e) { return null; }
  }

  // one look: what is in the frame right now. Returns { things: [{name, n}], light, colour, vision }
  async function look() {
    const out = { things: [], light: null, colour: null, vision: status.objects };
    const fs = frameStats(); if (fs) { out.light = fs.light; out.colour = fs.colour; }
    if (!detector) { loadDetector(); return out; }
    if (!ready()) return out;
    try {
      const res = detector.detect(video);
      const counts = {};
      for (const det of res.detections || []) { const c = det.categories && det.categories[0]; if (c) counts[c.categoryName] = (counts[c.categoryName] || 0) + 1; }
      out.things = Object.entries(counts).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
      out.vision = 'ready';
    } catch (e) { console.warn('senses: detect', e); }
    return out;
  }

  return {
    load, loadDetector, setVideo, tick, look, hand, status, setHand, analyse,
    setPaused(v) { paused = !!v; if (paused) hand.seen = false; },   // tests: stop the model (slow in the simulator)
    stats: () => ({ handHz: handRuns ? +(1000 / Math.max(1, (performance.now() - (stats0 || performance.now())) / handRuns)).toFixed(1) : 0, handMsAvg: handRuns ? +(handMs / handRuns).toFixed(1) : null, handRuns, handErrors }),
  };
}
const stats0 = performance.now();
