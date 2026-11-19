// Wake the Print (POC): image-tracked AR on the open-source 8th Wall engine (@8thwall/engine 0.1.0, MIT) + plain
// three.js, built from the immersive skill's 8th Wall template. Engine boot, pose maths, follow(), grace/stale
// handling, canvas sizing, photo, test log and error sheets are the template's, unchanged. The CONTENT is Spark:
//   - pops out of the print the first time it is found (mascot.js: the Meshy mascot, with spark.js as the fallback), stands over it
//   - "sees" the room on the phone (senses.js: MediaPipe object detector, brightness, main colour)
//   - talks by voice (voice.js: ElevenLabs agent with four client tools: act, look_around, set_color, remember)
//   - reacts to hand gestures held beside the print (senses.js: MediaPipe gesture recognizer): thumbs up, peace
//     sign, pointing up, I-love-you sign, fist, thumbs down, a wave; hops onto an open palm held still, and back
//   - remembers the fan between visits (localStorage, keyed by ?item=)
//
// Coordinates: the print ANCHOR's children are in METRES OF THE REAL PRINT, origin = centre of the target
// picture, x right, y up (along the picture), z out of the print toward the viewer. Spark itself lives at scene
// level (not under the anchor) so it can travel between the print and the palm; its world transform is computed
// from the anchor (or the palm) every frame.
import * as THREE from 'three';
import { createSpark, SPARK_COLORS } from './mascot.js';
import { createSenses } from './senses.js';
import { createVoice } from './voice.js';

window.THREE = THREE;   // XR8.Threejs.pipelineModule() looks for a global THREE

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TEXT = params.has('text');     // mic sessions are text-only and the typing bar shows from the start
const PAGE = 'wake-the-print';   // goes into the test log records (page: ...) and photo file names

// ---------------------------------------------------------------- targets
// The Sukeban tee from Spray Bobo (print 304.8 x 406.4 mm). heightMm = the whole 3:4 target frame.
const TARGETS = [
  { name: 'tee-sukeban', json: '/evade/spray-bobo/targets/tee-sukeban.json', heightMm: 406.4 },
];
const BY_NAME = Object.fromEntries(TARGETS.map((t) => [t.name, t]));

// ---------------------------------------------------------------- tracking tunables (proven defaults)
const GRACE_MS = 120;        // keep showing this long after a loss (stops one-frame flicker; longer = content rides the phone)
const STALE_MIN = 120, STALE_MAX = 300;   // no update for 3 of its usual update gaps (clamped) = lost, even without imagelost
const DRAW_DPR = Math.min(devicePixelRatio || 1, parseFloat(params.get('dpr')) || 1);   // 1x: fastest pickup; ?dpr=2 sharper

// ---------------------------------------------------------------- Spark tunables
const SPARK_H = 0.32;          // Spark's height on the print, as a fraction of the print height
const PALM_M = 0.075;          // Spark's height on the palm, real metres (about a palm width)
const PERCH_OPEN_MS = 700;     // an open palm held still this long -> hop on
const PERCH_STILL = 0.05;      // "still": the palm centre stays within 5% of the video frame of where the hold began
const PERCH_LOST_MS = 700;     // hand not seen this long -> hop back
const PERCH_NEAR = 0.92;       // perch: the hand must read nearer than 0.92 x the print's distance (when the print is in view)
const ART_NEAR = 0.8;          // a hand whose centre is inside the print's outline is the ARTWORK unless it reads nearer than this
const HAND_NEAR_MS = 500;      // a real hand counts as "in view" this long after its last accepted sample
// gestures: held GESTURE_HOLD_MS with score >= GESTURE_SCORE -> fires once; then nothing for GESTURE_COOLDOWN_MS
const GESTURE_HOLD_MS = 400, GESTURE_SCORE = 0.6, GESTURE_GAP_MS = 250, GESTURE_COOLDOWN_MS = 2500;
const WAVE_MS = 1200, WAVE_AMP = 0.08, WAVE_TURNS = 2, WAVE_STEP = 0.025;   // wave: 2 turns in 1.2 s, >= 8% of frame width
const GESTURES = {
  Thumb_Up: { act: 'confetti', label: 'Thumbs up', say: 'The fan gave you a thumbs up' },
  Victory: { act: 'dance', label: 'Peace sign', say: 'The fan showed you a peace sign' },
  Pointing_Up: { act: 'jump', label: 'Pointing up', say: 'The fan pointed up' },
  ILoveYou: { act: 'spin', label: 'Love you sign', say: 'The fan made the I love you sign with their hand' },
  Closed_Fist: { act: 'nod', label: 'Fist', say: 'The fan held up a fist' },
  Thumb_Down: { act: 'shake', label: 'Thumbs down', say: 'The fan gave you a thumbs down' },
  wave: { act: 'wave', label: 'Wave', say: 'The fan waved at you' },
};
const OPEN_LABEL = 'Open hand';
const GESTURE_HINT_MS = 6000;  // the gesture hint shows this long after the pop finishes (once per page load; the mic hint comes first)
const PERCH_S = 0.45;          // hop duration
const LOOK_AFTER_MS = 1500;    // first look around after the pop
const CHIPS_MS = 5000, CAP_MS = 7000;

// ---------------------------------------------------------------- state
let scene, camera, renderer, started = false, last = 0;
const TS = {};   // per target: { def, anchor, tracked, at, gap, lostAt, snap, p, q, s }
const diag = { page: PAGE, sid: Math.random().toString(36).slice(2, 12), t0: Date.now(), targets: {}, errors: [], fps: { n: 0, sum: 0 } };
const LOG_ON = !params.has('nolog') && (params.has('diag') || /^(localhost$|127\.|deploy-preview-)/.test(location.hostname));

// ---------------------------------------------------------------- memory (per item, this browser only)
const ITEM = (params.get('item') || 'demo').replace(/[^\w-]/g, '').slice(0, 40) || 'demo';
const MEM_KEY = `wtp:${ITEM}`;
function loadMem() {
  try {
    const m = JSON.parse(localStorage.getItem(MEM_KEY) || 'null');
    if (m && typeof m === 'object') return { visits: Math.max(0, m.visits | 0), facts: Array.isArray(m.facts) ? m.facts.filter((f) => typeof f === 'string').slice(-8) : [], last: m.last || null };
  } catch (e) { /* no storage */ }
  return { visits: 0, facts: [], last: null };
}
let mem = loadMem();
function saveMem() { try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { /* no storage: works for this visit only */ } }

// ---------------------------------------------------------------- test log extras
const toolCalls = { act: 0, look_around: 0, set_color: 0, remember: 0 };
diag.wtp = {
  item: ITEM, senses: { hands: 'off', objects: 'off' }, hand: null, perch: 0, tools: toolCalls, voice: [], visits: mem.visits, vision: null,
  // hand samples (one per model run with a hand; a fake hand gives one per frame):
  handSeen: 0, handOpen: 0,
  handAccepted: 0,      // a real hand: gestures may fire
  handRejected: 0,      // read as the artwork (centre inside the print's outline and not clearly nearer)
  handNoPrint: 0,       // no print pose to judge by (print not seen in the last second, Spark not on the hand)
  handOverPrint: 0,     // centre inside the print's on-screen outline
  perchTooFar: 0,       // real, but not nearer than PERCH_NEAR x print distance: may gesture, may not perch
  depthOverPrint: null, // [min, max] hand distance / print distance for samples over the print
  palmPxMin: null, palmPxMax: null,
  gestures: {},         // samples per gesture name the model reported (any score)
  fired: {},            // actions fired by gestures
  lostWithHand: 0,      // print losses while a real hand was in view
  handDelegate: null,   // 'GPU' | 'CPU': the hand model's delegate now
  handCanary: [],       // one entry per hand model tried: { model, delegate, ok, hands, gesture, score, ms[, error] }
  handSwitched: false,  // the GPU watchdog switched to CPU (no hand in the first 60 video runs)
};

// ---------------------------------------------------------------- Spark, senses, voice
const spark = createSpark();
spark.root.visible = false;
// ?hand=cpu|gpu forces the hand model's delegate (compare on a phone). Test only: ?canaryfail=gesture-GPU,... makes those
// canary runs report no hands; ?handwatch=n fires the GPU watchdog after n runs (see senses.js).
const senses = createSenses({
  hand: params.get('hand'),
  test: params.has('test') ? { canaryFail: (params.get('canaryfail') || '').split(',').filter(Boolean), watchRuns: parseInt(params.get('handwatch'), 10) || 0 } : null,
  onStatus: (s) => {
    const { handCanary, handSwitched, ...rest } = s;
    diag.wtp.senses = rest; diag.wtp.handDelegate = s.handDelegate; diag.wtp.handCanary = handCanary; diag.wtp.handSwitched = handSwitched;
    if (s.objects === 'ready' && firstLookDone) doLook(false);
  },
});
let seenText = '', firstLookDone = false;

const tools = {
  act: ({ action } = {}) => {
    toolCalls.act++;
    const a = String(action || '').toLowerCase().trim();
    return spark.act(a) ? `Done: ${a}.` : `Unknown action "${a}". Use one of: ${spark.ACTIONS.join(', ')}.`;
  },
  look_around: async () => {
    toolCalls.look_around++;
    const l = await doLook(true);
    return describe(l);
  },
  set_color: ({ color } = {}) => {
    toolCalls.set_color++;
    const c = String(color || '').toLowerCase().trim().replace(/^pink$/, 'magenta').replace(/^grey$|^gray$/, 'white');
    return spark.setColor(c) ? `Spark is now ${c}.` : `Unknown colour "${color}". Use one of: ${Object.keys(SPARK_COLORS).join(', ')}.`;
  },
  remember: ({ fact } = {}) => {
    toolCalls.remember++;
    const f = String(fact || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!f) return 'Nothing to remember.';
    mem.facts = mem.facts.filter((x) => x.toLowerCase() !== f.toLowerCase());
    mem.facts.push(f); mem.facts = mem.facts.slice(-8);
    saveMem(); fillSheet();
    return 'Saved. You will remember this next visit.';
  },
};
const getVars = () => ({
  visit_count: mem.visits,
  memory: mem.facts.join('; ') || 'nothing yet, this is a new friend',
  seen: seenText || 'not looked yet',
});
const voice = createVoice({
  tools, getVars,
  onState: (s, detail) => {
    $('mic').dataset.s = s;
    $('mic').setAttribute('aria-label', s === 'off' ? 'Talk to Spark' : 'Stop talking to Spark');
    $('energy').hidden = s === 'off';
    diag.wtp.voice.push({ s, r: detail || '', t: +((Date.now() - diag.t0) / 1000).toFixed(1) });
    if (diag.wtp.voice.length > 40) diag.wtp.voice.shift();
    if (s === 'off') { spark.setMouth(0); spark.setListening(false); }
  },
  onCaption: (who, text) => caption(who, text),
  onEnergy: (left) => { $('energy').firstElementChild.style.transform = `scaleX(${Math.max(0, Math.min(1, left))})`; },
});

// ---------------------------------------------------------------- what Spark sees
async function doLook(showChips) {
  let l;
  try { l = await senses.look(); } catch (e) { l = { things: [], light: null, colour: null, vision: 'failed' }; }
  diag.wtp.vision = { things: l.things, light: l.light, colour: l.colour, vision: l.vision };
  seenText = describe(l);
  if (showChips) chips(l);
  return l;
}
// an honest sentence for the agent: only what the phone actually measured
function describe(l) {
  const parts = [];
  if (l.vision === 'ready') parts.push(l.things.length ? `I can see: ${l.things.map((t) => `${t.n} ${t.name}`).join(', ')}.` : 'I can see: nothing I recognise.');
  else if (l.vision === 'failed') parts.push('My object vision did not load, so I cannot name things.');
  else parts.push('My vision is still loading, so I cannot name things yet.');
  if (l.light) parts.push(`Lighting: ${l.light}.`);
  if (l.colour) parts.push(`Main colour around: ${l.colour}.`);
  const g = handIn(performance.now()) ? (curGesture ? (GESTURES[curGesture] || { label: OPEN_LABEL }).label.toLowerCase() : senses.hand.open ? 'open' : '') : null;
  parts.push(`A hand is in view: ${g === null ? 'no' : g ? `yes, ${g}` : 'yes'}.`);
  parts.push(perch > 0.5 ? "I am standing on the fan's palm." : printShown ? 'I am standing on the print.' : 'I am back inside the print.');
  return parts.join(' ');
}
const plural = (name, n) => (n === 1 ? name : name === 'person' ? 'people' : /s$/.test(name) ? name : name + 's');
let chipsTimer = 0;
function chips(l) {
  const box = $('sees'), hc = $('hand-chip');
  for (const el of [...box.children]) if (el !== hc) el.remove();
  const add = (text, q) => { const s = document.createElement('span'); s.textContent = text; if (q) s.className = 'q'; box.insertBefore(s, hc); };
  for (const t of l.things.slice(0, 4)) add(t.n === 1 ? t.name : `${t.n} ${plural(t.name, t.n)}`);
  if (l.vision !== 'ready') add(l.vision === 'failed' ? 'vision off' : 'vision loading', true);
  if (l.light) add(l.light === 'normal' ? 'normal light' : `${l.light} room`);
  if (l.colour && l.colour !== 'neutral') add(l.colour);
  clearTimeout(chipsTimer); chipsTimer = setTimeout(() => { for (const el of [...box.children]) if (el.id !== 'hand-chip') el.remove(); }, CHIPS_MS);
}
// the hand chip: "Hand seen" while a real hand is in view, the gesture's name while one is recognised.
// Added to the #sees row only while shown (so it never counts as a "look" chip).
let handChipText = null;
function setHandChip(text, named) {
  if (text === handChipText) return; handChipText = text;
  let el = $('hand-chip');
  if (!text) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('span'); el.id = 'hand-chip'; $('sees').appendChild(el); }
  el.textContent = text; el.className = named ? 'g' : 'q';
}

// ---------------------------------------------------------------- captions
let capTimer = 0;
function caption(who, text) {
  const cap = $('cap'); cap.className = who === 'spark' ? 'spark' : who === 'you' ? 'you' : 'system';
  $('cap-who').textContent = who === 'spark' ? 'Spark' : who === 'you' ? 'You' : 'Note';
  $('cap-text').textContent = text; cap.hidden = false;
  armCap(CAP_MS);
}
function armCap(ms) {
  clearTimeout(capTimer);
  capTimer = setTimeout(() => { if (voice.state === 'speaking') armCap(1000); else $('cap').hidden = true; }, ms);
}

// ---------------------------------------------------------------- CONTENT
// Per target: the pop ring and the shadow disc live ON the print (anchor children, real metres).
// Spark is scene level and placed in updateSpark().
let firstPop = false, popDone = false, ringT = -1;
function buildContent(a, def) {
  const w = def.heightMm * 0.75 / 1000, h = def.heightMm / 1000;   // the 3:4 target frame in metres
  if (DEBUG) {   // the picture's frame, to check alignment on the real print (?debug)
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), new THREE.LineBasicMaterial({ color: 0x00ff88 }));
    a.add(edge);
  }
  const H = SPARK_H * h;
  // soft flat shadow under Spark (one colour, opacity only)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(H * 0.42, 40), shadowMat);
  shadow.position.z = 0.0005; shadow.renderOrder = 1; a.add(shadow);
  // the pop ring: flat magenta, expands and fades
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2fae, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 64), ringMat);
  ring.position.z = 0.001; ring.renderOrder = 2; ring.visible = false; a.add(ring);
  return {
    H,
    onFound(quiet) {
      if (!firstPop) {
        firstPop = true; spark.pop(); ringT = 0;
        mem.visits++; mem.last = Date.now(); saveMem(); diag.wtp.visits = mem.visits; fillSheet();
        setTimeout(() => { firstLookDone = true; doLook(true); }, LOOK_AFTER_MS);
        enableMic();
      } else if (!quiet) spark.arrive();   // quiet: back after a short loss while a hand was in view -> no re-climb
    },
    update(dt) {
      if (ringT >= 0) {
        ringT += dt; const k = Math.min(ringT / 0.9, 1), e = 1 - Math.pow(1 - k, 3);
        ring.visible = k < 1; ring.scale.setScalar(H * (0.25 + e * 1.1)); ringMat.opacity = 0.9 * (1 - k);
        if (k >= 1) ringT = -1;
      }
      shadowMat.opacity = 0.28 * (spark.root.userData.popLift || 0) * (1 - perch) * (spark.root.visible ? 1 : 0);
    },
  };
}

// ---------------------------------------------------------------- scene
function buildScene({ scene: s, camera: c, renderer: r }) {
  scene = s; camera = c; renderer = r;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1.5, 3, 4); scene.add(key);
  // the engine needs to know where the three.js camera starts
  camera.position.set(0, 0, 0); camera.quaternion.identity();
  XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
  for (const def of TARGETS) {
    const anchor = new THREE.Group(); anchor.visible = false; anchor.matrixAutoUpdate = true; scene.add(anchor);
    TS[def.name] = { def, anchor, tracked: false, at: 0, gap: 40, lostAt: -1e9, snap: true, p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1, content: buildContent(anchor, def) };
    diag.targets[def.name] = { found: 0, lost: 0, firstFoundS: null, trackedS: 0 };
  }
  scene.add(spark.root);
}

// ---------------------------------------------------------------- tracking -> anchors
function onTarget(d) {
  const t = TS[d.name]; if (!t) return;
  t.p.set(d.position.x, d.position.y, d.position.z);                 // centre of the target picture
  t.q.set(d.rotation.x, d.rotation.y, d.rotation.z, d.rotation.w);
  t.s = d.scale * (d.scaledHeight || 1) / (t.def.heightMm / 1000);   // world units per real metre
  const now = performance.now();
  if (!t.tracked) {
    t.snap = true; t.content.onFound && t.content.onFound(now - t.lostAt < 1500 && handIn(now));
    const g = diag.targets[d.name]; g.found++; if (g.firstFoundS == null) g.firstFoundS = +((Date.now() - diag.t0) / 1000).toFixed(1);
    hint(null);
  } else t.gap += (Math.min(Math.max(now - t.at, 8), 400) - t.gap) * 0.2;   // how often the engine updates it
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; t.lostAt = performance.now(); diag.targets[d.name].lost++; lostHand(t.lostAt); } }
function lostHand(now) { if (handIn(now)) diag.wtp.lostWithHand++; }   // was a real hand in view when the print went?

// Stick to the print: follow real movement at once, smooth only sub-millimetre jitter (any lag here reads as
// the content sliding off the print).
function follow(t) {
  const a = t.anchor;
  const aP = t.snap ? 1 : Math.min(Math.max(a.position.distanceTo(t.p) / t.s / 0.0015, 0.5), 1);
  const aR = t.snap ? 1 : Math.min(Math.max(a.quaternion.angleTo(t.q) / 0.03, 0.5), 1);
  const aS = t.snap ? 1 : Math.min(Math.max(Math.abs(a.scale.x - t.s) / t.s / 0.02, 0.5), 1);
  t.snap = false;
  a.position.lerp(t.p, aP); a.quaternion.slerp(t.q, aR); a.scale.setScalar(THREE.MathUtils.lerp(a.scale.x, t.s, aS));
}

function tick(dt) {
  const now = performance.now(), time = now / 1000;
  let any = false;
  for (const t of Object.values(TS)) {
    if (t.tracked && now - t.at > Math.min(Math.max(t.gap * 3, STALE_MIN), STALE_MAX)) { t.tracked = false; t.lostAt = now; lostHand(now); }   // the engine went quiet
    const show = t.tracked || now - t.lostAt < GRACE_MS;
    if (t.tracked) follow(t);
    if (!show) t.snap = true;
    t.anchor.visible = show;
    if (show) { any = true; printT = t; t.content.update(dt, time); diag.targets[t.def.name].trackedS += dt; }
  }
  printShown = any;
  senses.tick(now);
  if (fake) Object.assign(senses.hand, { seen: true, at: now, open: fake.open, cx: fake.cx, cy: fake.cy, palmPx: fake.palmPx, gesture: fake.gesture, score: fake.score });
  const visible = updateSpark(dt, now);
  updateHint(visible, now);
  if (now - statsAt > 1000) { statsAt = now; diag.wtp.hand = senses.stats(); }
  diag.fps.n++; diag.fps.sum += dt;
}

// ---------------------------------------------------------------- Spark placement: print <-> palm
let printT = null, printShown = false, perch = 0, perchWant = false, openSince = 0, openN = 0, openX = 0, openY = 0, statsAt = 0, fake = null;
let lastHandAt = -1, palmOk = false, palmAt = 0;   // palmAt: time of the last hand sample good enough for the perch
let handAt = 0, handCls = null, curGesture = null;  // handAt: last sample accepted as a REAL hand; curGesture: its gesture (score >= GESTURE_SCORE)
let hold = null, lastFireAt = -1e9, waveAt = -1e9, waveLock = false, sampleGap = 100;   // sampleGap: ms between hand samples (smoothed)
const waveHist = [];                                 // open-palm samples { t, x } for wave detection
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
const printPos = new THREE.Vector3(), printQ = new THREE.Quaternion(); let printScale = 0;
const palmPos = new THREE.Vector3(), palmRaw = new THREE.Vector3(), handPos = new THREE.Vector3(); let palmScale = 0;
const invProj = new THREE.Matrix4(), camFwd = new THREE.Vector3(), camUp = new THREE.Vector3(), lookV = new THREE.Vector3();
const smooth = (x) => x * x * (3 - 2 * x);
// the time windows stretch on a phone whose hand model runs slowly (fewer samples a second)
const nearMs = () => Math.max(HAND_NEAR_MS, sampleGap * 2.5);
const gapMs = () => Math.max(GESTURE_GAP_MS, sampleGap * 1.5);
const handIn = (now) => handAt > 0 && now - handAt < nearMs();

// Where the hand is: screen point, real depth (from the palm's size in the video), world point, and whether its
// centre is inside the print's outline on screen. Needs a print pose (for the world scale). Reuses one object.
const HG = { x: 0, y: 0, onScreen: false, depthM: 0, printM: 0, inQuad: false, world: new THREE.Vector3() };
const quad = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
function handGeom(h) {
  const S = printT ? printT.s : 0; if (!S || !h.palmPx) return null;
  const rect = canvas.getBoundingClientRect(), cw = rect.width, ch = rect.height;
  const vw = (video && video.videoWidth) || cw, vh = (video && video.videoHeight) || ch;
  const s = Math.max(cw / vw, ch / vh);                         // the feed is drawn "cover": scaled, centred, cropped
  const px = (cw - vw * s) / 2 + h.cx * vw * s, py = (ch - vh * s) / 2 + h.cy * vh * s;
  const ndcX = px / cw * 2 - 1, ndcY = 1 - py / ch * 2;
  const fy = camera.projectionMatrix.elements[5] * ch / 2;      // focal length in CSS px
  HG.x = px; HG.y = py; HG.onScreen = px >= 0 && px <= cw && py >= 0 && py <= ch;   // the camera sees more than the screen shows
  HG.depthM = fy * PALM_M / (h.palmPx * s);                     // real metres from the phone
  HG.printM = camera.position.distanceTo(printT.anchor.position) / S;
  camera.updateMatrixWorld();
  invProj.copy(camera.projectionMatrix).invert();
  const dir = V.a.set(ndcX, ndcY, 0.5).applyMatrix4(invProj).applyMatrix4(camera.matrixWorld).sub(camera.position).normalize();
  camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  HG.world.copy(camera.position).addScaledVector(dir, HG.depthM * S / Math.max(0.2, dir.dot(camFwd)));
  // the print's outline (the whole 3:4 target frame) on screen, from the anchor's current pose
  const a = printT.anchor, w2 = printT.def.heightMm * 0.75 / 2000, h2 = printT.def.heightMm / 2000;
  a.updateMatrixWorld();
  quad[0].set(-w2, -h2, 0); quad[1].set(w2, -h2, 0); quad[2].set(w2, h2, 0); quad[3].set(-w2, h2, 0);
  let sign = 0; HG.inQuad = true;
  for (const q of quad) { q.applyMatrix4(a.matrixWorld).project(camera); q.set((q.x + 1) / 2 * cw, (1 - q.y) / 2 * ch, 0); }
  for (let i = 0; i < 4; i++) {
    const p = quad[i], n = quad[(i + 1) % 4], c = (n.x - p.x) * (py - p.y) - (n.y - p.y) * (px - p.x);
    if (!sign) sign = Math.sign(c); else if (c && Math.sign(c) !== sign) { HG.inQuad = false; break; }
  }
  return HG;
}

// Real hand or the artwork? The Sukeban art has two drawn hands and the hand model finds them. A drawn hand is
// always INSIDE the print's outline and reads as a small palm at (or behind) the print's distance. So:
//   centre inside the outline and not clearly nearer than the print (< ART_NEAR x print distance) -> artwork;
//   centre outside the outline -> real (a hand beside the print, at any distance).
// The perch keeps the older, stricter rule on top: nearer than PERCH_NEAR x print distance, wherever it is.
// Returns 'real' | 'art' | 'unknown' (no recent print pose to judge by).
function classifyHand(h, now) {
  const g = handGeom(h);
  if (!g) return 'unknown';
  const recent = printShown || now - printT.lostAt < 1000;     // the anchor still holds the print's last pose
  if (!recent) return perch > 0 ? 'real' : 'unknown';
  if (!g.inQuad) return 'real';
  const W = diag.wtp, r = +(g.depthM / g.printM).toFixed(2);
  W.handOverPrint++;
  W.depthOverPrint = W.depthOverPrint ? [Math.min(W.depthOverPrint[0], r), Math.max(W.depthOverPrint[1], r)] : [r, r];
  return g.depthM < g.printM * ART_NEAR ? 'real' : 'art';
}

// wave: direction changes of the palm's x (with a small dead band) and the range covered, in the last WAVE_MS
function waveStats() {
  let dir = 0, ext = waveHist[0].x, lo = ext, hi = ext, turns = 0;
  for (const s of waveHist) {
    lo = Math.min(lo, s.x); hi = Math.max(hi, s.x);
    if (!dir) { if (Math.abs(s.x - ext) > WAVE_STEP) { dir = Math.sign(s.x - ext); ext = s.x; } }
    else if ((s.x - ext) * dir > 0) ext = s.x;
    else if (Math.abs(s.x - ext) > WAVE_STEP) { turns++; dir = -dir; ext = s.x; }
  }
  return { turns, amp: hi - lo };
}

// a gesture -> its action, once, never during another action, never within the cooldown, only when Spark shows
function fire(name, now) {
  const G = GESTURES[name];
  if (!G || !popDone || !spark.root.visible || spark.state.act || now - lastFireAt < GESTURE_COOLDOWN_MS) return false;
  if (!spark.act(G.act)) return false;
  lastFireAt = now; gestureHintDone = true;
  const f = diag.wtp.fired; f[G.act] = (f[G.act] || 0) + 1;
  voice.event(G.say);
  return true;
}

// one new hand sample from the model (or the fake hand)
function onHandSample(h, now) {
  const W = diag.wtp;
  W.handSeen++; if (h.open) W.handOpen++;
  const pp = +h.palmPx.toFixed(1);
  if (pp > 0) { W.palmPxMin = W.palmPxMin == null ? pp : Math.min(W.palmPxMin, pp); W.palmPxMax = W.palmPxMax == null ? pp : Math.max(W.palmPxMax, pp); }
  if (h.gesture) W.gestures[h.gesture] = (W.gestures[h.gesture] || 0) + 1;
  handCls = classifyHand(h, now);
  if (handCls !== 'real') {
    if (handCls === 'art') W.handRejected++; else W.handNoPrint++;
    openSince = 0; waveHist.length = 0; hold = null; curGesture = null;   // artwork never builds up a gesture or a perch
    return;
  }
  if (handAt && h.at - handAt < 1000) sampleGap += (Math.min(Math.max(h.at - handAt, 16), 800) - sampleGap) * 0.3;
  W.handAccepted++; handAt = h.at; handPos.copy(HG.world);
  const named = h.gesture && h.score >= GESTURE_SCORE ? h.gesture : null;
  curGesture = named;
  const open = h.open || named === 'Open_Palm';
  // the perch: a real hand near enough and on screen (Spark never hops where nobody can see it), held open and still
  const perchOk = HG.onScreen && (!printShown || HG.depthM < HG.printM * PERCH_NEAR);
  if (perchOk) {
    palmRaw.copy(HG.world);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    palmRaw.addScaledVector(camUp, printT.s * PALM_M * 0.6);    // sit just above the palm centre
    palmScale = printT.s * PALM_M;
    if (!palmOk || perch === 0) palmPos.copy(palmRaw); else palmPos.lerp(palmRaw, 0.5);
    palmOk = true; palmAt = h.at;
  } else if (HG.onScreen) W.perchTooFar++;
  if (open && perchOk) {
    if (!openSince || Math.abs(h.cx - openX) > PERCH_STILL || Math.abs(h.cy - openY) > PERCH_STILL) { openSince = h.at; openN = 0; openX = h.cx; openY = h.cy; }
    openN++;
  } else openSince = 0;
  // the wave: an open palm moving side to side. It restarts the still timer above, so a wave never perches.
  if (open) {
    waveHist.push({ t: h.at, x: h.cx });
    while (waveHist.length && h.at - waveHist[0].t > WAVE_MS) waveHist.shift();
    const w = waveStats();
    if (w.turns === 0 && w.amp < WAVE_STEP) waveLock = false;      // the hand stopped: the next wave can fire
    if (!waveLock && w.turns >= WAVE_TURNS && w.amp >= WAVE_AMP && fire('wave', now)) {
      waveLock = true; waveAt = now; openSince = 0;
      if (perch < 1) perchWant = false;                             // the wave wins over a perch that has only just begun
    }
  } else { waveHist.length = 0; waveLock = false; }
  // held gestures (Open_Palm is the perch / wave, not an action)
  const g = named && named !== 'Open_Palm' ? named : null;
  if (g) { if (!hold || hold.name !== g) hold = { name: g, since: h.at, last: h.at, fired: false }; else hold.last = h.at; }
  else if (hold && h.at - hold.last > gapMs()) hold = null;
}

function updateSpark(dt, now) {
  const h = senses.hand;
  // print transform (world), from the smoothed anchor
  if (printT) {
    const a = printT.anchor, H = printT.content.H, lift = spark.root.userData.popLift || 0;
    V.b.set(0, 0, H * 0.08 + lift * H * 0.6).multiplyScalar(a.scale.x).applyQuaternion(a.quaternion);
    printPos.copy(a.position).add(V.b); printQ.copy(a.quaternion); printScale = a.scale.x * H;
  }
  if (!h.seen) { openSince = 0; waveHist.length = 0; }
  else if (h.at !== lastHandAt) { lastHandAt = h.at; onHandSample(h, now); }
  if (!handIn(now)) curGesture = null;
  if (hold && now - hold.last > gapMs()) hold = null;
  // a gesture held long enough fires once (a short print loss or a playing action only delays it)
  if (hold && !hold.fired && hold.last - hold.since >= GESTURE_HOLD_MS && fire(hold.name, now)) hold.fired = true;
  const handFresh = palmAt > 0 && now - palmAt < PERCH_LOST_MS;
  // perch decision: open palm held still for PERCH_OPEN_MS -> hop on; no hand for PERCH_LOST_MS -> hop back
  // (at least 4 still samples, and not right after a wave: a stalled frame must not make a waving palm look still)
  if (popDone && openSince && openN >= 4 && handFresh && now - openSince >= PERCH_OPEN_MS && now - waveAt > 1000) perchWant = true;
  if (!handFresh) perchWant = false;
  const was = perch;
  perch = Math.min(1, Math.max(0, perch + (perchWant ? dt : -dt) / PERCH_S));
  if (perch === 1 && was < 1) {
    diag.wtp.perch++; flash('Spark is on your hand', 3000);
    voice.event('The fan is holding you on their palm');
  }
  // the hand chip
  const inView = handIn(now);
  const label = !inView ? null : now - waveAt < 1500 ? GESTURES.wave.label : curGesture ? (GESTURES[curGesture] || { label: OPEN_LABEL }).label : null;
  setHandChip(inView && started ? label || 'Hand seen' : null, !!label);

  // house rule: Spark shows only while the print is tracked now (plus the template's grace), or on a fresh hand
  const visible = !!printT && (printShown || (perch > 0 && handFresh));
  spark.root.visible = visible;
  if (!visible) return false;

  const e = printShown ? smooth(perch) : 1;   // print out of view: Spark can only be on the palm
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  spark.root.position.lerpVectors(printPos, palmPos, e).addScaledVector(camUp, Math.sin(e * Math.PI) * Math.max(printScale, palmScale) * 0.8);   // a small hop
  spark.root.quaternion.slerpQuaternions(printQ, camera.quaternion, e);   // on the palm it faces the phone
  spark.root.scale.setScalar(THREE.MathUtils.lerp(printScale, palmScale, e));
  // look at the fan's hand while one is in view (and Spark is not standing on it), otherwise at the phone
  spark.root.updateMatrixWorld();
  lookV.copy(inView && perch < 0.5 ? handPos : camera.position); spark.root.worldToLocal(lookV);
  const len = lookV.length() || 1;
  spark.setLook(lookV.x / len * 2, lookV.y / len * 2);
  // voice -> face
  spark.setMouth(voice.state === 'speaking' ? voice.outLevel() * 2.2 : 0);
  spark.setListening(voice.state === 'listening' && voice.inLevel() > 0.06);
  spark.update(dt);
  if (!popDone && (spark.root.userData.popLift || 0) >= 1) { popDone = true; gestureHintAt = now + GESTURE_HINT_MS; }
  return true;
}

// ---------------------------------------------------------------- UI
let hintNow = null, flashText = '', flashUntil = 0, micUsed = false;
let gestureHintAt = 0, gestureHintDone = false;   // once per page load, a few seconds after the pop (skipped once a gesture has fired)
function hint(text) {
  const el = $('hint');
  if (text === hintNow) return; hintNow = text;
  if (!text) { el.hidden = true; return; } el.textContent = text; el.hidden = false;
}
function flash(text, ms) { flashText = text; flashUntil = performance.now() + ms; }
function updateHint(visible, now) {
  if (!started) return;
  if (visible && gestureHintAt && now >= gestureHintAt && !gestureHintDone) { gestureHintDone = true; flash('Show Spark a thumbs up beside the print', 6000); }
  if (!visible) hint('Point at the print');
  else if (now < flashUntil) hint(flashText);
  else if (!$('mic').disabled && !micUsed) hint('Tap the mic to talk to Spark');
  else hint(null);
}
function showError(title, body) { $('err-title').textContent = title; $('err-body').textContent = body; $('error').hidden = false; flushDiag(true); }
$('err-retry').onclick = () => location.reload();

async function takePhoto() {
  try {
    const b64 = await XR8.CanvasScreenshot.takeScreenshot();
    $('flash').style.opacity = 1; setTimeout(() => { $('flash').style.opacity = 0; }, 120);
    $('shot-img').src = 'data:image/jpeg;base64,' + b64; $('shot').hidden = false;
  } catch (e) { console.warn('photo', e); }
}
$('shutter').onclick = takePhoto;
$('shot-close').onclick = () => { $('shot').hidden = true; };
$('shot-save').onclick = async () => {
  const blob = await (await fetch($('shot-img').src)).blob();
  const file = new File([blob], `${PAGE}-${Date.now()}.jpg`, { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { /* cancelled */ } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
};

// mic: on after the first pop
function enableMic() { const m = $('mic'); m.disabled = false; if (!micUsed) m.classList.add('nudge'); }
$('mic').onclick = () => {
  micUsed = true; $('mic').classList.remove('nudge');
  try { navigator.vibrate && navigator.vibrate(8); } catch (e) { /* no haptics */ }
  if (voice.state === 'connecting') return;
  if (voice.active) voice.stop(); else voice.start({ textOnly: TEXT });
};

// typing bar
function setTypebar(on) {
  $('typebar').hidden = !on;
  $('opt-type').textContent = on ? 'Hide the typing bar' : 'Type instead of talking';
  $('hint').style.bottom = on ? 'calc(178px + env(safe-area-inset-bottom))' : '';
}
async function whenActive(ms) {
  const t0 = performance.now();
  while (!voice.active && voice.state !== 'off' && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  return voice.active;
}
$('typebar').onsubmit = async (ev) => {
  ev.preventDefault();
  const inp = $('type-in'), text = inp.value.trim(); if (!text) return;
  inp.value = '';
  micUsed = true; $('mic').classList.remove('nudge');
  if (!voice.active) {
    if (voice.state === 'off') voice.start({ textOnly: true });
    if (!(await whenActive(15000))) return;
  }
  voice.type(text);
};

// menu
function fillSheet() {
  const facts = mem.facts.join('; ');
  $('sheet-mem').textContent = facts ? `Visit ${mem.visits}. Spark remembers: ${facts}.` : (mem.visits ? `Visit ${mem.visits}. ` : '') + "Spark doesn't know you yet.";
}
$('menu').onclick = () => { fillSheet(); $('sheet').hidden = false; };
$('opt-close').onclick = () => { $('sheet').hidden = true; };
$('opt-type').onclick = () => { const on = $('typebar').hidden; setTypebar(on); $('sheet').hidden = true; if (on) $('type-in').focus(); };
$('opt-forget').onclick = () => {
  mem = { visits: 0, facts: [], last: null };
  try { localStorage.removeItem(MEM_KEY); } catch (e) { /* no storage */ }
  diag.wtp.visits = 0; fillSheet(); $('sheet').hidden = true;
  caption('system', 'Spark forgot you. Next time you meet, it starts fresh.');
  voice.event('The fan asked you to forget them. You no longer remember anything about them from before.', 0);
};
if (TEXT) setTypebar(true);

// tap Spark (anywhere on the camera view) for a jump: a small delight, and the no-voice fallback
const canvas = $('cam');
canvas.addEventListener('click', () => {
  if (!spark.root.visible) return;
  spark.act('jump');
  try { navigator.vibrate && navigator.vibrate(8); } catch (e) { /* no haptics */ }
});

// ---------------------------------------------------------------- test log (previews / localhost, or ?diag)
// Read back with GET /api/ar/kc-diag?limit=20 on a deploy preview (records with page: PAGE).
function flushDiag(force) {
  if (!LOG_ON) return;
  const now = Date.now(); if (!force && now - (diag.sent || 0) < 10000) return; diag.sent = now;
  const body = JSON.stringify({ ...diag, fpsAvg: diag.fps.sum ? +(diag.fps.n / diag.fps.sum).toFixed(1) : null, screen: [innerWidth, innerHeight, devicePixelRatio], note: params.get('note') || '' });
  try { if (!(navigator.sendBeacon && navigator.sendBeacon('/api/ar/kc-diag', new Blob([body], { type: 'application/json' })))) fetch('/api/ar/kc-diag', { method: 'POST', body, keepalive: true }); } catch (e) { /* offline */ }
}
addEventListener('pagehide', () => flushDiag(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDiag(true); });
addEventListener('error', (e) => diag.errors.push(String(e.message).slice(0, 200)));

// ---------------------------------------------------------------- engine
let video = null;
function sizeCanvas() {
  const w = Math.round(innerWidth * DRAW_DPR), h = Math.round(innerHeight * DRAW_DPR);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
const appModule = () => ({
  name: PAGE,
  onStart: () => { buildScene(XR8.Threejs.xrScene()); started = true; $('hud').hidden = false; hint('Point at the print'); },
  onUpdate: () => { const now = performance.now(); const dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; if (scene) tick(dt); flushDiag(false); },
  onCameraStatusChange: ({ status, video: v }) => {
    if (status === 'requesting') hint('Allow camera access to begin');
    if (status === 'hasVideo') {
      $('splash').classList.add('gone'); setTimeout(() => { $('splash').hidden = true; }, 500);
      if (v && !video) { video = v; senses.setVideo(v); senses.load().then(() => senses.loadDetector()).catch((e) => console.warn('senses', e)); }   // never blocks Start
    }
    if (status === 'failed') showError('The camera didn\'t start', 'Another app may be using it. Close the Camera app and other tabs that use the camera, then try again. On iPhone use Safari, on Android use Chrome.');
  },
  onException: (e) => { console.error('XR', e); diag.errors.push('XR: ' + String((e && e.message) || e).slice(0, 200)); showError('Something went wrong', String((e && e.message) || e)); },
  listeners: [
    { event: 'reality.imagefound', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imageupdated', process: ({ detail }) => onTarget(detail) },
    { event: 'reality.imagelost', process: ({ detail }) => onLost(detail) },
  ],
});

const xrReady = new Promise((res) => (window.XR8 ? res() : addEventListener('xrloaded', () => res(), { once: true })));
const targetData = Promise.all(TARGETS.map((t) => fetch(new URL(t.json, location.href)).then((r) => { if (!r.ok) throw new Error(t.json + ' ' + r.status); return r.json(); })));
Promise.all([xrReady, targetData]).then(() => { $('start').disabled = false; $('start').textContent = 'Start'; })
  .catch((e) => { console.error(e); showError('Could not load the experience', 'Check your connection and reload the page.'); });

// Start opens the camera in the SAME tap (iOS only shows permission prompts from a user gesture).
$('start').onclick = async () => {
  $('start').disabled = true; $('start').textContent = 'Starting…';
  try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission(); } catch (e) { /* optional */ }
  const data = await targetData;
  sizeCanvas(); addEventListener('resize', sizeCanvas); addEventListener('orientationchange', () => setTimeout(sizeCanvas, 300));
  XR8.XrController.configure({ disableWorldTracking: true, imageTargetData: data });   // image targets only: SLAM is not in the open-source build
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),   // draws the camera feed
    XR8.Threejs.pipelineModule(),             // gives us scene / camera / renderer, synced to the camera pose
    XR8.XrController.pipelineModule(),        // image target tracking
    XR8.CanvasScreenshot.pipelineModule(),    // photos (camera + 3D)
    appModule(),
  ]);
  setTimeout(() => { if (!started) showError('The camera didn\'t start', 'Close other apps or tabs using the camera, allow camera access for this site, then try again.'); }, 12000);
  XR8.run({ canvas, allowedDevices: XR8.XrConfig.device().ANY, cameraConfig: { direction: XR8.XrConfig.camera().BACK } });
};

if (params.has('test')) {
  window.__ar = { TS, diag, get scene() { return scene; } };   // for automated tests
  window.__wtp = {
    spark, senses, voice, tools, get mem() { return mem; }, getVars, describe, BY_NAME,
    get perch() { return perch; }, get camera() { return camera; }, get printShown() { return printShown; },
    // the last hand sample's verdict and geometry: { cls: 'real'|'art'|'unknown', inQuad, depthRatio, gesture, hold }
    get handInfo() { return { cls: handCls, inQuad: HG.inQuad, depthRatio: HG.printM ? +(HG.depthM / HG.printM).toFixed(2) : null, gesture: curGesture, hold: hold && { ...hold },
      at: [Math.round(HG.x), Math.round(HG.y)], onScreen: HG.onScreen, quad: quad.map((q) => [Math.round(q.x), Math.round(q.y)]), openSince, openN, perchWant, waveAt, sampleGap: Math.round(sampleGap) }; },
    // the same path as an engine 'reality.imagelost' event (the engine's next update finds the print again)
    lose(name = TARGETS[0].name) { onLost({ name }); },
    // feed senses.hand directly (no real hand needed); fakeHand(null) stops.
    // fakeHand(cx, cy, palmPx, open = true), or fakeHand(cx, cy, palmPx, { gesture: 'Thumb_Up', score: 0.9, open: false }):
    // open defaults to true for no gesture or Open_Palm, false for any other gesture; score defaults to 0.9.
    fakeHand(cx, cy, palmPx, opts = true) {
      if (cx === null || cx === undefined) { fake = null; senses.hand.seen = false; return; }
      const o = opts && typeof opts === 'object' ? opts : { open: opts !== false };
      const gesture = o.gesture || null;
      fake = { cx, cy, palmPx, gesture, score: gesture ? (o.score == null ? 0.9 : o.score) : 0, open: o.open == null ? (!gesture || gesture === 'Open_Palm') : !!o.open };
      Object.assign(senses.hand, { seen: true, at: performance.now(), ...fake });
    },
  };
}
