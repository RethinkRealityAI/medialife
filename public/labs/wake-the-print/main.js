// Wake the Print (POC): image-tracked AR on the open-source 8th Wall engine (@8thwall/engine 0.1.0, MIT) + plain
// three.js, built from the immersive skill's 8th Wall template. Engine boot, pose maths, follow(), grace/stale
// handling, canvas sizing, photo, test log and error sheets are the template's, unchanged. The CONTENT is Spark:
//   - pops out of the print the first time it is found (mascot.js: the Meshy mascot, with spark.js as the fallback), stands over it
//   - "sees" the room on the phone (senses.js: MediaPipe object detector, brightness, main colour)
//   - talks by voice (voice.js: ElevenLabs agent with four client tools: act, look_around, set_color, remember)
//   - hops onto an open palm (senses.js: MediaPipe hand landmarker) and back onto the print
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
const PERCH_OPEN_MS = 350;     // an open hand seen this long -> hop on
const PERCH_LOST_MS = 700;     // hand not seen this long -> hop back
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
diag.wtp = { item: ITEM, senses: { hands: 'off', objects: 'off' }, hand: null, perch: 0, handRejected: 0, tools: toolCalls, voice: [], visits: mem.visits, vision: null };

// ---------------------------------------------------------------- Spark, senses, voice
const spark = createSpark();
spark.root.visible = false;
const senses = createSenses({ onStatus: (s) => { diag.wtp.senses = s; if (s.objects === 'ready' && firstLookDone) doLook(false); } });
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
  const fresh = palmAt > 0 && performance.now() - palmAt < PERCH_LOST_MS;
  parts.push(`A hand is in view: ${fresh ? (senses.hand.open ? 'yes, open' : 'yes') : 'no'}.`);
  parts.push(perch > 0.5 ? "I am standing on the fan's palm." : printShown ? 'I am standing on the print.' : 'I am back inside the print.');
  return parts.join(' ');
}
const plural = (name, n) => (n === 1 ? name : name === 'person' ? 'people' : /s$/.test(name) ? name : name + 's');
let chipsTimer = 0;
function chips(l) {
  const box = $('sees'); box.textContent = '';
  const add = (text, q) => { const s = document.createElement('span'); s.textContent = text; if (q) s.className = 'q'; box.appendChild(s); };
  for (const t of l.things.slice(0, 4)) add(t.n === 1 ? t.name : `${t.n} ${plural(t.name, t.n)}`);
  if (l.vision !== 'ready') add(l.vision === 'failed' ? 'vision off' : 'vision loading', true);
  if (l.light) add(l.light === 'normal' ? 'normal light' : `${l.light} room`);
  if (l.colour && l.colour !== 'neutral') add(l.colour);
  clearTimeout(chipsTimer); chipsTimer = setTimeout(() => { box.textContent = ''; }, CHIPS_MS);
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
    onFound() {
      if (!firstPop) {
        firstPop = true; spark.pop(); ringT = 0;
        mem.visits++; mem.last = Date.now(); saveMem(); diag.wtp.visits = mem.visits; fillSheet();
        setTimeout(() => { firstLookDone = true; doLook(true); }, LOOK_AFTER_MS);
        enableMic();
      } else spark.arrive();
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
    t.snap = true; t.content.onFound && t.content.onFound();
    const g = diag.targets[d.name]; g.found++; if (g.firstFoundS == null) g.firstFoundS = +((Date.now() - diag.t0) / 1000).toFixed(1);
    hint(null);
  } else t.gap += (Math.min(Math.max(now - t.at, 8), 400) - t.gap) * 0.2;   // how often the engine updates it
  t.tracked = true; t.at = now;
}
function onLost(d) { const t = TS[d.name]; if (t && t.tracked) { t.tracked = false; t.lostAt = performance.now(); diag.targets[d.name].lost++; } }

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
    if (t.tracked && now - t.at > Math.min(Math.max(t.gap * 3, STALE_MIN), STALE_MAX)) { t.tracked = false; t.lostAt = now; }   // the engine went quiet
    const show = t.tracked || now - t.lostAt < GRACE_MS;
    if (t.tracked) follow(t);
    if (!show) t.snap = true;
    t.anchor.visible = show;
    if (show) { any = true; printT = t; t.content.update(dt, time); diag.targets[t.def.name].trackedS += dt; }
  }
  printShown = any;
  senses.tick(now);
  if (fake) Object.assign(senses.hand, { seen: true, at: now, open: fake.open, cx: fake.cx, cy: fake.cy, palmPx: fake.palmPx });
  const visible = updateSpark(dt, now);
  updateHint(visible, now);
  if (now - statsAt > 1000) { statsAt = now; diag.wtp.hand = senses.stats(); }
  diag.fps.n++; diag.fps.sum += dt;
}

// ---------------------------------------------------------------- Spark placement: print <-> palm
let printT = null, printShown = false, perch = 0, perchWant = false, openSince = 0, statsAt = 0, fake = null;
let lastHandAt = -1, palmOk = false, palmAt = 0;   // palmAt: time of the last hand sample that passed the checks
const V = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() };
const printPos = new THREE.Vector3(), printQ = new THREE.Quaternion(); let printScale = 0;
const palmPos = new THREE.Vector3(), palmRaw = new THREE.Vector3(); let palmScale = 0;
const invProj = new THREE.Matrix4(), camFwd = new THREE.Vector3(), camUp = new THREE.Vector3(), lookV = new THREE.Vector3();
const smooth = (x) => x * x * (3 - 2 * x);

// world point for the hand centre at its real depth (from the palm's size in the video)
function palmWorld(h, out) {
  const S = printT ? printT.s : 0; if (!S || !h.palmPx) return false;
  const rect = canvas.getBoundingClientRect(), cw = rect.width, ch = rect.height;
  const vw = (video && video.videoWidth) || cw, vh = (video && video.videoHeight) || ch;
  const s = Math.max(cw / vw, ch / vh);                         // the feed is drawn "cover": scaled, centred, cropped
  const px = (cw - vw * s) / 2 + h.cx * vw * s, py = (ch - vh * s) / 2 + h.cy * vh * s;
  const ndcX = px / cw * 2 - 1, ndcY = 1 - py / ch * 2;
  const fy = camera.projectionMatrix.elements[5] * ch / 2;      // focal length in CSS px
  const depthM = fy * PALM_M / (h.palmPx * s);                  // real metres from the phone
  // A real palm held up to Spark is nearer to the phone than the print. A hand DRAWN on the print (the Sukeban
  // art has two) reads as a tiny palm far behind the print: ignore it, or Spark hops onto the artwork.
  if (printShown && depthM > camera.position.distanceTo(printT.anchor.position) / S * 0.92) { diag.wtp.handRejected++; return false; }
  camera.updateMatrixWorld();
  invProj.copy(camera.projectionMatrix).invert();
  const dir = V.a.set(ndcX, ndcY, 0.5).applyMatrix4(invProj).applyMatrix4(camera.matrixWorld).sub(camera.position).normalize();
  camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const dist = depthM * S / Math.max(0.2, dir.dot(camFwd));
  out.copy(camera.position).addScaledVector(dir, dist);
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  out.addScaledVector(camUp, S * PALM_M * 0.6);                 // sit just above the palm centre
  palmScale = S * PALM_M;
  return true;
}

function updateSpark(dt, now) {
  const h = senses.hand;
  // print transform (world), from the smoothed anchor
  if (printT) {
    const a = printT.anchor, H = printT.content.H, lift = spark.root.userData.popLift || 0;
    V.b.set(0, 0, H * 0.08 + lift * H * 0.6).multiplyScalar(a.scale.x).applyQuaternion(a.quaternion);
    printPos.copy(a.position).add(V.b); printQ.copy(a.quaternion); printScale = a.scale.x * H;
  }
  // palm: each new hand sample -> new target (smoothed); a sample that fails the checks breaks the "open" streak
  if (!h.seen) openSince = 0;
  else if (h.at !== lastHandAt) {
    lastHandAt = h.at;
    const ok = palmWorld(h, palmRaw);
    if (ok) { if (!palmOk || perch === 0) palmPos.copy(palmRaw); else palmPos.lerp(palmRaw, 0.5); palmOk = true; palmAt = h.at; }
    if (ok && h.open) { if (!openSince) openSince = h.at; } else openSince = 0;
  }
  const handFresh = palmAt > 0 && now - palmAt < PERCH_LOST_MS;
  // perch decision: open hand for PERCH_OPEN_MS -> hop on; no hand for PERCH_LOST_MS -> hop back
  if (popDone && openSince && handFresh && now - openSince >= PERCH_OPEN_MS) perchWant = true;
  if (!handFresh) perchWant = false;
  const was = perch;
  perch = Math.min(1, Math.max(0, perch + (perchWant ? dt : -dt) / PERCH_S));
  if (perch === 1 && was < 1) {
    diag.wtp.perch++; flash('Spark is on your hand', 3000);
    voice.event('The fan is holding you on their palm');
  }
  const visible = !!printT && (printShown || (perch > 0 && handFresh));
  spark.root.visible = visible;
  if (!visible) return false;

  const e = printShown ? smooth(perch) : 1;   // print out of view: Spark can only be on the palm
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  spark.root.position.lerpVectors(printPos, palmPos, e).addScaledVector(camUp, Math.sin(e * Math.PI) * Math.max(printScale, palmScale) * 0.8);   // a small hop
  spark.root.quaternion.slerpQuaternions(printQ, camera.quaternion, e);   // on the palm it faces the phone
  spark.root.scale.setScalar(THREE.MathUtils.lerp(printScale, palmScale, e));
  // look at the phone
  spark.root.updateMatrixWorld();
  lookV.copy(camera.position); spark.root.worldToLocal(lookV);
  const len = lookV.length() || 1;
  spark.setLook(lookV.x / len * 2, lookV.y / len * 2);
  // voice -> face
  spark.setMouth(voice.state === 'speaking' ? voice.outLevel() * 2.2 : 0);
  spark.setListening(voice.state === 'listening' && voice.inLevel() > 0.06);
  spark.update(dt);
  if (!popDone && (spark.root.userData.popLift || 0) >= 1) popDone = true;
  return true;
}

// ---------------------------------------------------------------- UI
let hintNow = null, flashText = '', flashUntil = 0, micUsed = false;
function hint(text) {
  const el = $('hint');
  if (text === hintNow) return; hintNow = text;
  if (!text) { el.hidden = true; return; } el.textContent = text; el.hidden = false;
}
function flash(text, ms) { flashText = text; flashUntil = performance.now() + ms; }
function updateHint(visible, now) {
  if (!started) return;
  if (!visible) hint('Point your camera at the print');
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
  onStart: () => { buildScene(XR8.Threejs.xrScene()); started = true; $('hud').hidden = false; hint('Point your camera at the print'); },
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
    // feed senses.hand directly (no real hand needed); fakeHand(null) stops
    fakeHand(cx, cy, palmPx, open = true) {
      if (cx === null || cx === undefined) { fake = null; senses.hand.seen = false; return; }
      fake = { cx, cy, palmPx, open };
      Object.assign(senses.hand, { seen: true, at: performance.now(), open, cx, cy, palmPx });
    },
  };
}
