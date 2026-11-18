// Wear It, Meet It: the example use of the camera swap. Selfie camera first: the fan wears the robot's visor and
// antenna (in the colour they pick) and takes a selfie. Flip: the same robot stands life-size in their room, holding
// that selfie up on a floating frame, and one photo captures the scene. Then flip back for a new selfie or a new
// colour; the robot, its spot, the selfie and the colour all carry over.
//
// One engine session (shell swap mode, engine binary with the slam + face chunks): XR8.stop() -> swap the tracker
// module ('facecontroller' <-> 'reality') -> XR8.run() with the FRONT or BACK camera. No reload, no second splash.
// Assets: the Labs robot (media/robot.glb, the CC0 "RobotExpressive" by Tomás Laulhé, as in Robot Run) and flat
// three.js shapes for the visor and antenna; the head occluder from the face-effects sample. No EVADE assets.
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow, backOut } from '../shared/shell.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const COLOURS = [
  { n: 'Amber', c: 0xf0a030 }, { n: 'Cyan', c: 0x4fd6e8 }, { n: 'Lime', c: 0xc9f25a }, { n: 'Coral', c: 0xff6b5e }, { n: 'Violet', c: 0xad50ff },
];
const ROBOT_H = 1.4;            // life-size, metres (pinch while placing: 0.4x to 1.3x)
const PHOTO_W = 0.4, PHOTO_H = PHOTO_W * 4 / 3;
const EMOTES = ['Wave', 'Yes', 'ThumbsUp', 'Dance', 'Jump'];
const UP = new THREE.Vector3(0, 1, 0);

let ci = 0, gltf = null, occluderProto = null, placeholderTex = null, selfieTex = null, selfieCount = 0, selfieURL = '';
let robot = null, mainMat = null, mixer = null, idle = null, oneShot = null, oneShotName = '', emoteI = 0;
let robotPlaced = false, frame = null, photoMat = null, borderMat = null, framePop = 1, rig = null, thumb = null;
const accentMats = []; // everything that wears the chosen colour (robot body, frame, visor, antenna ball)
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

const demo = createDemo({
  slug: 'wear-it-meet-it', mode: 'swap', startFacing: 'front', tag: 'Swap',
  title: 'Wear It, Meet It', titleHtml: 'Wear it, <span>meet it</span>',
  kicker: 'MEDIALIFE Labs · Camera swap',
  lead: 'Wear the robot\'s visor for a selfie, then flip your camera: the robot is in your room, holding your photo.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="95" y="90" width="80" height="120" rx="10" fill="#f0a030"/><rect x="185" y="110" width="60" height="80" rx="4" fill="#fff"/><rect x="192" y="117" width="46" height="66" fill="#4fd6e8"/></svg>`,
  how: [
    '<b>Pick a colour</b> and look at your phone: you\'re wearing the robot\'s visor.',
    '<b>Shutter</b> (bottom centre) takes your selfie.',
    '<b>Meet your robot.</b> The camera flips: aim at the floor and tap <b>Place here</b>. It\'s life-size, holding your selfie.',
    '<b>Shutter</b> again for the photo. <b>Flip</b> (bottom left) goes back for a new selfie; <b>Move</b> (bottom right) moves the robot.',
  ],
  size: [0.4, 1.3, 1], reticleSize: 0.4,
  placeLabel: 'Place here', placeHint: 'Tap Place here: your robot is life-size',
  listeners: [
    { event: 'facecontroller.facefound', process: ({ detail }) => rig && rig.update(detail) },
    { event: 'facecontroller.faceupdated', process: ({ detail }) => rig && rig.update(detail) },
    { event: 'facecontroller.facelost', process: () => rig && rig.hide() },
  ],
  async load(d) {
    const [g, o] = await Promise.all([loadGLB(MEDIA + 'robot.glb'), loadGLB(MEDIA + 'head-occluder.glb')]);
    gltf = g; occluderProto = o.scene;
    placeholderTex = placeholderTexture();
    d.progress(0.9);
  },
  hero() {
    const g = new THREE.Group();
    const o = SkeletonUtils.clone(gltf.scene); fitTo(o, 1); o.position.x -= 0.1; g.add(o);
    o.traverse((n) => { if (n.isMesh && n.material.name === 'Main') { n.material = n.material.clone(); n.material.color.setHex(COLOURS[0].c); } });
    const m = new THREE.AnimationMixer(o); m.clipAction(clip('Wave')).play(); g.userData.mixer = m;
    const f = buildFrame(true); f.scale.setScalar(0.75 / ROBOT_H); f.position.set(0.27, 0.58, 0.16); f.rotation.y = -0.2; g.add(f);
    return g;
  },
  build(d) {
    // ---- world: the robot, life-size, with the floating frame (aim a little higher: a person-sized robot wants room)
    d.aimNdc.set(0, -0.08);
    robot = new THREE.Group(); d.stage.add(robot);
    const body = gltf.scene; fitTo(body, ROBOT_H); robot.add(body);
    body.traverse((o) => {
      if (!o.isMesh) return; o.frustumCulled = false;
      if (o.material.name === 'Main') { if (!mainMat) { mainMat = o.material; accentMats.push(mainMat); } o.material = mainMat; }
    });
    d.stage.add(contactShadow(0.45, 0.42));
    mixer = new THREE.AnimationMixer(body);
    idle = mixer.clipAction(clip('Idle')); idle.play();
    mixer.addEventListener('finished', (e) => { if (e.action === oneShot) { oneShot = null; oneShotName = ''; idle.fadeIn(0.25); } });
    frame = buildFrame(false); frame.position.set(0.66, 1.08, 0.12); d.stage.add(frame);
    const fs = contactShadow(0.22, 0.2); fs.position.set(0.66, 0.003, 0.12); d.stage.add(fs);
    // ---- face: the visor + antenna rig on the shell's faceRoot
    rig = new Rig(d.faceRoot);
    // ---- UI: colour chips, selfie thumbnail (front, bottom right), Meet button (the shell's action button)
    buildChips(d);
    thumb = document.createElement('img'); thumb.className = 'selfie-thumb'; thumb.alt = 'Your selfie'; thumb.hidden = true;
    d.right.appendChild(thumb);
    d.act.onclick = () => { if (d.facing === 'front') meet(); else d.place(); };
    setColour(ci);
  },
  onLive(d) { showFrontUi(d); },
  onPlaced(d, first) { robotPlaced = true; if (first) framePop = 0; emote('Wave'); d.hint(''); },
  onSwapOut(d, to) { thumb.hidden = true; },
  onSwapped(d, facing) {
    if (facing === 'front') { showFrontUi(d); return; }
    if (d.state === 'placed') { emote('Wave'); d.toast(selfieTex ? 'Your robot has your new selfie' : 'Your robot is where you left it', 1600); }
  },
  onShutter(d) {
    if (d.facing === 'front') { takeSelfie(d); return true; }
    if (d.state === 'placed') emote('ThumbsUp');
    return false; // the shell's branded photo of the room
  },
  onTap(ndc, d) {
    if (d.facing !== 'back' || d.state !== 'placed') return false;
    if (d.rayFrom(ndc).intersectObject(robot, true).length) { emote(EMOTES[emoteI++ % EMOTES.length]); return true; }
    return false;
  },
  update(dt, d, now) {
    if (mixer) mixer.update(dt);
    if (d.facing === 'back' && d.camera && robot) {
      // the robot turns to you; the frame bobs and turns to you too
      d.camera.getWorldPosition(tmp); d.stage.worldToLocal(tmp);
      const want = Math.atan2(tmp.x - robot.position.x, tmp.z - robot.position.z);
      robot.rotation.y += Math.atan2(Math.sin(want - robot.rotation.y), Math.cos(want - robot.rotation.y)) * (1 - Math.exp(-3 * dt));
      framePop = Math.min(1, framePop + dt * 1.6);
      frame.scale.setScalar(Math.max(0.001, backOut(framePop)));
      frame.position.y = 1.08 + 0.03 * Math.sin(now / 700);
      frame.rotation.y = Math.atan2(tmp.x - frame.position.x, tmp.z - frame.position.z);
    }
    if (d.facing === 'front' && rig) {
      if (rig.anchor.visible && now - rig.at > 400) rig.hide();
      rig.tick(dt, now);
      d.hint(!rig.anchor.visible ? 'Look at your phone' : selfieTex ? '' : 'Pick a colour, then tap the shutter for your selfie');
    }
  },
});

function clip(n) { return gltf.animations.find((c) => c.name === n); }
function emote(n) {
  if (!mixer) return;
  if (oneShot) oneShot.stop();
  const a = mixer.clipAction(clip(n)); a.reset(); a.setLoop(THREE.LoopRepeat, n === 'Dance' ? 2 : 1); a.clampWhenFinished = false;
  idle.fadeOut(0.2); a.fadeIn(0.2).play(); oneShot = a; oneShotName = n;
}

// ------------------------------------------------------------------ flat art (no gradients)
// the frame before there is a selfie: a flat "you, wearing the visor" figure and a line of text
function placeholderTexture() {
  const W = 600, H = 800, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#16323a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#4fd6e8'; g.beginPath(); g.arc(W / 2, 330, 130, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W / 2, 700, 230, 190, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#0a1c2a'; roundRect(g, W / 2 - 150, 290, 300, 70, 30); g.fill();
  g.fillStyle = '#ffffff'; roundRect(g, W / 2 - 95, 316, 70, 16, 8); g.fill(); roundRect(g, W / 2 + 25, 316, 70, 16, 8); g.fill();
  g.fillStyle = '#4fd6e8'; g.fillRect(W / 2 - 5, 130, 10, 80); g.beginPath(); g.arc(W / 2, 120, 24, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.font = '700 46px "Space Grotesk", system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('Flip for a selfie', W / 2, 560);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function roundedSlab(w, h, depth, r) { // a rounded-rectangle slab centred on the origin, facing +z
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -depth / 2); return g;
}

// the floating frame: a colour border, a white mat, the photo (3:4)
function buildFrame(hero) {
  const f = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: COLOURS[ci].c, roughness: 0.5 });
  const border = new THREE.Mesh(roundedSlab(PHOTO_W + 0.08, PHOTO_H + 0.08, 0.03, 0.03), bm); f.add(border);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO_W + 0.03, PHOTO_H + 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  mat.position.z = 0.0155; f.add(mat);
  const pm = new THREE.MeshBasicMaterial({ map: placeholderTex, toneMapped: false });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO_W, PHOTO_H), pm); photo.position.z = 0.017; f.add(photo);
  if (!hero) { borderMat = bm; photoMat = pm; accentMats.push(bm); }
  return f;
}

// ------------------------------------------------------------------ the face rig: visor + antenna + ear bolts
class Rig {
  constructor(parent) {
    this.at = 0;
    this.anchor = new THREE.Group(); this.anchor.visible = false; parent.add(this.anchor);
    const occ = occluderProto.clone(true); occ.scale.set(1.1, 1.1, 1.4); occ.position.set(-0.02, 0, 0.25); // the sample's occluder
    occ.traverse((n) => { if (n.isMesh) { n.material = new THREE.MeshBasicMaterial({ colorWrite: false }); n.renderOrder = -1; } });
    this.anchor.add(occ);
    const accent = new THREE.MeshStandardMaterial({ color: COLOURS[ci].c, roughness: 0.45 }); accentMats.push(accent);
    const grey = new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.5, metalness: 0.2 });
    // In face space (mirrored display) -z points out of the face towards the camera and +z into the head (the
    // sample's occluder sits at z +0.25).
    // visor across the eyes, on the nose bridge: a colour band with a see-through window and a scanner light
    this.nose = new THREE.Group(); this.anchor.add(this.nose);
    const visor = new THREE.Group(); visor.position.set(0, 0.05, -0.07); this.nose.add(visor);
    const band = new THREE.Group(); visor.add(band);
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), accent); m.position.set(x, y, 0); band.add(m); };
    bar(1.24, 0.07, 0, 0.135); bar(1.24, 0.07, 0, -0.135); bar(0.09, 0.34, -0.575, 0); bar(0.09, 0.34, 0.575, 0); bar(0.07, 0.2, 0, 0); // frame + bridge
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x4fd6e8, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) { const g = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.2), glassMat); g.position.set(sx * 0.29, 0, -0.01); g.rotation.y = Math.PI; g.renderOrder = 2; visor.add(g); }
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, side: THREE.DoubleSide }));
    this.scan.position.set(0, -0.135, -0.045); this.scan.renderOrder = 3; visor.add(this.scan);
    // antenna on top of the head, a little back
    this.antenna = new THREE.Group(); this.antenna.position.set(0, 0.7, 0.2); this.anchor.add(this.antenna);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 12), grey); stalk.position.y = 0.21; this.antenna.add(stalk);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14), accent); ball.position.y = 0.46; this.antenna.add(ball);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 20), grey); this.antenna.add(base);
    // ear bolts
    for (const sx of [-1, 1]) {
      const bolt = new THREE.Group(); bolt.position.set(sx * 0.72, 0.02, 0.32); bolt.rotation.z = Math.PI / 2; this.anchor.add(bolt);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 18), grey); bolt.add(b);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 18), accent); cap.position.y = sx * 0.06; bolt.add(cap);
    }
    this.prevQ = new THREE.Quaternion(); this.sway = 0; this.swayV = 0;
  }
  update(d) {
    const t = d.transform; if (!t) return;
    this.anchor.position.set(t.position.x, t.position.y, t.position.z);
    this.anchor.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    this.anchor.scale.setScalar(t.scale);
    const nb = d.attachmentPoints && d.attachmentPoints.noseBridge;
    if (nb) this.nose.position.set(nb.position.x, nb.position.y, nb.position.z);
    this.anchor.visible = true; this.at = performance.now();
  }
  tick(dt, now) { // the visor's scanner light runs side to side; the antenna springs when the head turns
    this.scan.position.x = 0.5 * Math.sin(now / 380);
    const turn = this.prevQ.angleTo(this.anchor.quaternion); this.prevQ.copy(this.anchor.quaternion);
    this.swayV += (Math.min(turn, 0.3) * 6 - this.sway * 40) * dt - this.swayV * 4 * dt;
    this.sway += this.swayV; this.antenna.rotation.z = THREE.MathUtils.clamp(this.sway, -0.4, 0.4) + 0.04 * Math.sin(now / 500);
  }
  hide() { this.anchor.visible = false; }
}

// ------------------------------------------------------------------ selfie -> frame
async function takeSelfie(d) {
  if (!rig.anchor.visible) { d.toast('Look at your phone first'); return; }
  d.flash();
  try {
    const img = await d.grabShot(), W = img.naturalWidth, H = img.naturalHeight;
    // crop 3:4 round the tracked head (antenna included), as drawn on screen
    let cx = W / 2, cy = H * 0.42;
    rig.anchor.getWorldPosition(tmp).project(d.camera);
    if (Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2) { cx = (tmp.x + 1) / 2 * W; cy = (1 - tmp.y) / 2 * H; }
    const cw = Math.min(W * 0.92, H * 0.75 * 0.92), ch = cw * 4 / 3;
    const sx = THREE.MathUtils.clamp(cx - cw / 2, 0, W - cw), sy = THREE.MathUtils.clamp(cy - ch * 0.52, 0, H - ch);
    const c = document.createElement('canvas'); c.width = 600; c.height = 800;
    c.getContext('2d').drawImage(img, sx, sy, cw, ch, 0, 0, 600, 800);
    if (selfieTex) selfieTex.dispose();
    selfieTex = new THREE.CanvasTexture(c); selfieTex.colorSpace = THREE.SRGBColorSpace;
    photoMat.map = selfieTex; photoMat.needsUpdate = true; framePop = 0; selfieCount++;
    selfieURL = c.toDataURL('image/jpeg', 0.8); thumb.src = selfieURL; thumb.hidden = false;
    d.toast('Selfie saved'); showFrontUi(d);
  } catch (e) { d.toast('Couldn\'t take the selfie'); }
}
function meet() { demo.swap('back'); }
function showFrontUi(d) {
  if (d.facing !== 'front') return;
  thumb.hidden = !selfieTex;
  d.act.hidden = !selfieTex; d.act.disabled = false; d.act.textContent = robotPlaced ? 'Back to your robot' : 'Meet your robot';
}

// ------------------------------------------------------------------ one colour across both cameras
function buildChips(d) {
  const row = document.createElement('div'); row.className = 'chips card-panel swatches'; row.setAttribute('role', 'radiogroup'); row.setAttribute('aria-label', 'Colour');
  row.innerHTML = COLOURS.map((c, i) => `<button type="button" class="chip sw" role="radio" aria-label="${c.n}" aria-pressed="${i === ci}" aria-checked="${i === ci}" data-i="${i}" style="--c:#${c.c.toString(16).padStart(6, '0')}"><i></i></button>`).join('');
  row.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) setColour(+b.dataset.i); });
  d.panel.appendChild(row);
}
function setColour(i) {
  ci = i;
  document.querySelectorAll('.swatches .chip').forEach((b, j) => { b.setAttribute('aria-pressed', String(j === i)); b.setAttribute('aria-checked', String(j === i)); });
  for (const m of accentMats) m.color.setHex(COLOURS[i].c);
}

window.__wm = {
  setColour, swap: (to) => demo.swap(to), play: emote,
  get facing() { return demo.facing; },
  get state() { return demo.state; },
  get colour() { return COLOURS[ci].n; },
  get face() { return !!(rig && rig.anchor.visible); },
  get selfies() { return selfieCount; },
  get selfieURL() { return selfieURL; },
  get frameShowsSelfie() { return !!(photoMat && selfieTex && photoMat.map === selfieTex); },
  get robotColour() { return mainMat ? '#' + mainMat.color.getHexString() : null; },
  get visorColour() { return accentMats[2] ? '#' + accentMats[2].color.getHexString() : null; },
  get emote() { return oneShotName; },
  get robot() { if (!robot) return null; const p = new THREE.Vector3(); robot.getWorldPosition(p); return { visible: demo.stage.visible && demo.worldRoot.visible, x: +p.x.toFixed(3), z: +p.z.toFixed(3), inScene: demo.worldRoot.parent === demo.scene }; },
  screenOfRobot() { const p = new THREE.Vector3(); robot.getWorldPosition(p); p.y += ROBOT_H * demo.size * 0.5; p.project(demo.camera); const r = demo.canvas.getBoundingClientRect(); return [(p.x + 1) / 2 * r.width, (1 - p.y) / 2 * r.height]; },
};
