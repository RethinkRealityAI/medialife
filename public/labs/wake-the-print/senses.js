// Senses: on-device AI that runs beside 8th Wall on the same camera video.
//   - hand tracking (MediaPipe Hand Landmarker) at ~12 Hz: palm position, open/closed  -> palm perch
//   - object detection (MediaPipe Object Detector, 80 everyday classes) on demand      -> "what Spark sees"
//   - brightness + main colour from a 32 px copy of the frame
// 8th Wall stays the source of truth for where the print is; these only add understanding.
// Nothing here leaves the phone. Models load after the camera starts, never blocking Start.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const OBJ_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';
const HAND_HZ = 12;

export function createSenses({ onStatus } = {}) {
  let video = null, hands = null, detector = null, lib = null, fileset = null;
  let lastHandAt = 0, handRuns = 0, handMs = 0;
  const status = { hands: 'off', objects: 'off' };
  const hand = { seen: false, at: 0, open: false, cx: 0, cy: 0, palmPx: 0, landmarks: null };
  const tiny = document.createElement('canvas'); tiny.width = tiny.height = 32;
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  const say = (k, v) => { status[k] = v; onStatus && onStatus({ ...status }); };

  async function load() {
    try {
      lib = await import(/* @vite-ignore */ `${MP}/vision_bundle.mjs`);
      fileset = await lib.FilesetResolver.forVisionTasks(`${MP}/wasm`);
    } catch (e) { say('hands', 'failed'); say('objects', 'failed'); console.warn('senses: library', e); return; }
    say('hands', 'loading');
    const mk = async (delegate) => lib.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.55, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.5,
    });
    try { hands = await mk('GPU'); say('hands', 'ready'); }
    catch (e) { try { hands = await mk('CPU'); say('hands', 'ready'); } catch (e2) { say('hands', 'failed'); console.warn('senses: hands', e2); } }
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

  // called every frame; runs the hand model at HAND_HZ
  function tick(now) {
    if (!hands || !ready() || now - lastHandAt < 1000 / HAND_HZ) return;
    lastHandAt = now;
    let res; const t0 = performance.now();
    try { res = hands.detectForVideo(video, now); } catch (e) { return; }
    handMs += performance.now() - t0; handRuns++;
    const lm = res && res.landmarks && res.landmarks[0];
    if (!lm) { hand.seen = false; return; }
    setHand(lm, now);
  }
  // landmarks: 21 points, x/y in 0..1 of the video frame
  function setHand(lm, now) {
    const vw = video ? video.videoWidth : 1, vh = video ? video.videoHeight : 1;
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * vw, (lm[a].y - lm[b].y) * vh);
    // open hand: at least 3 of 4 fingertips further from the wrist than their middle joint
    let ext = 0; for (const [tip, pip] of [[8, 6], [12, 10], [16, 14], [20, 18]]) if (d(tip, 0) > d(pip, 0) * 1.08) ext++;
    hand.seen = true; hand.at = now; hand.open = ext >= 3; hand.landmarks = lm;
    hand.cx = (lm[0].x + lm[5].x + lm[17].x) / 3; hand.cy = (lm[0].y + lm[5].y + lm[17].y) / 3;
    // palm size in video pixels: the larger of two bone lengths, scaled to a common "palm width" (foreshortening
    // only ever makes a bone look shorter, so the larger estimate is the better one)
    hand.palmPx = Math.max(d(5, 17), d(0, 9) * (0.075 / 0.095));
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
    load, loadDetector, setVideo, tick, look, hand, status, setHand,
    stats: () => ({ handHz: handRuns ? +(1000 / Math.max(1, (performance.now() - (stats0 || performance.now())) / handRuns)).toFixed(1) : 0, handMsAvg: handRuns ? +(handMs / handRuns).toFixed(1) : null, handRuns }),
  };
}
const stats0 = performance.now();
