// Camera Swap: a cube on your floor with the back camera, shades and face paint with the selfie camera, one Flip
// button between them (from the 8th Wall "swap-camera" three.js sample).
//
// The swap is the sample's swapCamera(), done by the shell's swap mode in ONE engine session (engine binary, which
// ships both the slam and the face chunks): XR8.stop() -> XR8.removeCameraPipelineModules(['reality'] or
// ['facecontroller']) -> configure the other tracker -> XR8.addCameraPipelineModule(it) -> XR8.run() with
// cameraConfig.direction BACK or FRONT. No page reload; the splash stays gone and the state stays.
//
// Kept from the sample (threejs-world-scene-init.js, threejs-face-scene-init.js, swapbutton.html): world = a purple
// (0xAD50FF) cube standing on the floor with a shadow under it; face = the stereo-glasses.glb frame at 1.1x on the
// nose bridge, +0.05 up, a yellow and a purple lens (BackSide planes 0.55 x 0.25, half opacity, roughness 0.25),
// the face mesh drawn with art at 0.8 opacity through the soft eyes-and-mouth alpha mask, and the head occluder
// (1.1, 1.1, 1.4 at z +0.25, depth only); a round swap button.
// Changed: the cube's texture and the face tattoo were 8th Wall's logo (and its CDN is gone), so both are our own
// flat designs; the cube is 35 cm and is placed with the reticle (tap or Place here) instead of sitting at the origin;
// the swap button is the shell's Flip (bottom left), the shutter is bottom centre and Move bottom right. New: one
// colour runs through both cameras (tap the cube or pick a chip): the cube and the right lens share it, which shows
// the state surviving the swap.
import { createDemo, THREE, MEDIA, loadGLB, texture, contactShadow, backOut } from '../shared/shell.js';

const COLOURS = [
  { n: 'Purple', c: 0xad50ff }, { n: 'Yellow', c: 0xffc828 }, { n: 'Cyan', c: 0x4fd6e8 }, { n: 'Lime', c: 0xc9f25a },
];
const CUBE = 0.35; // metres
let ci = 0, glassesProto = null, occluderProto = null, alphaTex = null, paintTex = null, cubeTex = null;
let cube = null, cubeMat = null, pop = 1, squash = 0, faceIdx = null, faceUvs = null, rig = null;
const lensMats = [];

const demo = createDemo({
  slug: 'camera-swap', mode: 'swap', startFacing: 'back', tag: 'Swap',
  title: 'Camera Swap', titleHtml: 'Camera <span>Swap</span>',
  lead: 'A cube on your floor, shades on your face: one tap flips between your phone\'s two cameras.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="70" y="120" width="90" height="90" rx="6" fill="#ad50ff"/><rect x="170" y="140" width="60" height="30" rx="10" fill="#ffc828"/></svg>`,
  how: [
    '<b>Find the floor.</b> Move your phone slowly, then tap <b>Place here</b>.',
    '<b>Tap the cube</b> or pick a colour to change it.',
    '<b>Flip</b> (bottom left) switches to your selfie camera: the shades wear the cube\'s colour. Flip again and the cube is still there.',
    '<b>Move</b> (bottom right) puts the cube somewhere else. The <b>shutter</b> takes a photo in either camera.',
  ],
  placeLabel: 'Place here', placeHint: 'Tap Place here to put the cube down',
  listeners: [
    { event: 'facecontroller.faceloading', process: ({ detail }) => onFaceLoading(detail) },
    { event: 'facecontroller.facefound', process: ({ detail }) => onFace(detail) },
    { event: 'facecontroller.faceupdated', process: ({ detail }) => onFace(detail) },
    { event: 'facecontroller.facelost', process: () => rig && rig.hide() },
  ],
  async load(d) {
    const [g, o, a] = await Promise.all([loadGLB(MEDIA + 'stereo-glasses.glb'), loadGLB(MEDIA + 'head-occluder.glb'), texture(MEDIA + 'face-alpha.png', false)]);
    glassesProto = g.scene; occluderProto = o.scene; alphaTex = a;
    paintTex = paintTexture(); cubeTex = cubeTexture();
    d.progress(0.9);
  },
  hero() {
    const g = new THREE.Group();
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: COLOURS[0].c, map: cubeTex, roughness: 0.6 }));
    c.position.set(-0.3, 0.4, 0); c.rotation.y = 0.5; g.add(c);
    const gl = buildGlasses(); gl.scale.setScalar(0.75); gl.position.set(0.4, 0.75, 0.15); gl.rotation.set(0.2, -0.3, 0); g.add(gl);
    return g;
  },
  build(d) {
    // world: the sample's cube (on the stage the shell places and moves)
    cubeMat = new THREE.MeshStandardMaterial({ color: COLOURS[ci].c, map: cubeTex, roughness: 0.6, metalness: 0 });
    cube = new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE, CUBE), cubeMat);
    cube.position.y = CUBE / 2; cube.frustumCulled = false;
    d.stage.add(cube, contactShadow(CUBE * 0.9, 0.45));
    // face: one rig on the shell's faceRoot (it moves into every new scene by itself)
    rig = new Rig(d.faceRoot);
    buildChips(d);
  },
  onPlaced(d, first) { if (first) pop = 0; d.hint(''); },
  onLive(d) { d.hint(d.facing === 'back' ? '' : 'Look at your phone'); },
  onSwapped(d, facing) {
    d.toast(facing === 'front' ? 'Selfie camera' : d.state === 'placed' ? 'Back camera: your cube is where you left it' : 'Back camera', 1600);
  },
  onTap(ndc, d) {
    if (d.facing !== 'back' || d.state !== 'placed') return false;
    if (d.rayFrom(ndc).intersectObject(cube, false).length) { setColour((ci + 1) % COLOURS.length); squash = 1; return true; }
    return false;
  },
  update(dt, d, now) {
    if (cube) {
      pop = Math.min(1, pop + dt * 2.2); squash = Math.max(0, squash - dt * 4);
      const s = backOut(pop), q = Math.sin(squash * Math.PI) * 0.18;
      cube.scale.set(s * (1 + q), s * (1 - q), s * (1 + q)); cube.position.y = CUBE / 2 * cube.scale.y;
    }
    if (d.facing === 'front' && rig) {
      if (rig.anchor.visible && now - rig.at > 400) rig.hide();
      d.hint(rig.anchor.visible ? '' : 'Look at your phone');
    }
  },
});

// ------------------------------------------------------------------ art (flat, no gradients)
function cubeTexture() { // white face with an inset frame and a dot: the material colour tints it
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(0, 0, S, 14); g.fillRect(0, S - 14, S, 14); g.fillRect(0, 0, 14, S); g.fillRect(S - 14, 0, 14, S);
  g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(40, 40, S - 80, S - 80);
  g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(52, 52, S - 104, S - 104);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(S / 2, S / 2, 26, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// face paint in the face UV layout (as Face FX): cheek stripes, brow dots, a nose diamond
function paintTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const P = (x, y) => [x * S, y * S];
  g.fillStyle = '#ffffff';
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    g.save(); g.translate(...P(0.5 + side * 0.2, 0.55 + i * 0.04)); g.rotate(side * 0.18);
    g.fillRect(-0.06 * S, -0.011 * S, 0.12 * S, 0.022 * S); g.restore();
  }
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(...P(0.5 + i * 0.045, 0.24 - Math.abs(i) * 0.006), 0.012 * S, 0, Math.PI * 2); g.fill(); }
  g.save(); g.translate(...P(0.5, 0.36)); g.rotate(Math.PI / 4); g.fillRect(-0.018 * S, -0.018 * S, 0.036 * S, 0.036 * S); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------------ the sample's glasses + head
function buildGlasses() {
  const g = new THREE.Group();
  const frame = glassesProto.clone(true); frame.scale.setScalar(1.1); g.add(frame);
  const lens = (color, x) => {
    const m = new THREE.MeshStandardMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0.5, roughness: 0.25 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.25, 1), m); p.position.set(x, -0.01, 0); return p;
  };
  const r = lens(COLOURS[ci].c, 0.2); g.userData.right = r.material;
  g.add(lens(0xffc828, -0.3), r);
  return g;
}
class Rig {
  constructor(parent) {
    this.at = 0;
    this.anchor = new THREE.Group(); this.anchor.visible = false; parent.add(this.anchor);
    const occ = occluderProto.clone(true); occ.scale.set(1.1, 1.1, 1.4); occ.position.set(-0.02, 0, 0.25);
    occ.traverse((n) => { if (n.isMesh) { n.material = new THREE.MeshBasicMaterial({ colorWrite: false }); n.renderOrder = -1; } });
    this.anchor.add(occ);
    this.nose = new THREE.Group(); this.anchor.add(this.nose);
    this.glasses = buildGlasses(); this.glasses.position.set(0, 0.05, 0); this.nose.add(this.glasses);
    lensMats.push(this.glasses.userData.right);
    this.makeMesh();
  }
  makeMesh() {
    if (this.paint || !faceIdx) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceIdx.n * 3), 3));
    geo.setIndex(faceIdx.idx);
    if (faceUvs) geo.setAttribute('uv', new THREE.BufferAttribute(faceUvs, 2));
    this.paint = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: paintTex, color: COLOURS[ci].c, alphaMap: alphaTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.paint.renderOrder = 1; this.paint.frustumCulled = false; this.anchor.add(this.paint);
  }
  update(d) {
    const t = d.transform; if (!t) return;
    this.anchor.position.set(t.position.x, t.position.y, t.position.z);
    this.anchor.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    this.anchor.scale.setScalar(t.scale);
    const nb = d.attachmentPoints && d.attachmentPoints.noseBridge;
    if (nb) this.nose.position.set(nb.position.x, nb.position.y, nb.position.z);
    if (d.vertices && this.paint) {
      const a = this.paint.geometry.attributes.position, n = Math.min(a.count, d.vertices.length);
      for (let i = 0; i < n; i++) { const v = d.vertices[i]; a.setXYZ(i, v.x, v.y, v.z); }
      a.needsUpdate = true;
    }
    this.anchor.visible = true; this.at = performance.now();
  }
  hide() { this.anchor.visible = false; }
}
function onFaceLoading(d) { // fires on every face start; the mesh layout never changes, so build it once
  if (faceIdx) return;
  const idx = []; for (const t of d.indices) { if (typeof t === 'number') idx.push(t); else idx.push(t.a, t.b, t.c); }
  faceIdx = { idx, n: d.pointsPerDetection };
  if (d.uvs && d.uvs.length) { faceUvs = new Float32Array(d.uvs.length * 2); d.uvs.forEach((t, i) => { faceUvs[i * 2] = t.u; faceUvs[i * 2 + 1] = t.v; }); }
  rig && rig.makeMesh();
}
function onFace(d) { if (rig) rig.update(d); }

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
  cubeMat && cubeMat.color.setHex(COLOURS[i].c);
  for (const m of lensMats) m.color.setHex(COLOURS[i].c);
  if (rig && rig.paint) rig.paint.material.color.setHex(COLOURS[i].c);
}

window.__cs = {
  setColour, swap: (to) => demo.swap(to),
  get colour() { return COLOURS[ci].n; },
  get facing() { return demo.facing; },
  get state() { return demo.state; },
  get face() { return !!(rig && rig.anchor.visible); },
  get cube() { const p = new THREE.Vector3(); cube && cube.getWorldPosition(p); return cube ? { visible: demo.stage.visible && demo.worldRoot.visible, x: +p.x.toFixed(3), z: +p.z.toFixed(3), colour: '#' + cubeMat.color.getHexString(), inScene: cube.parent && demo.stage.parent === demo.worldRoot && demo.worldRoot.parent === demo.scene } : null; },
  get lens() { return lensMats[0] ? '#' + lensMats[0].color.getHexString() : null; },
  // the cube's spot relative to the phone (metres ahead / right), to compare before and after a swap
  get rel() { if (!cube || !demo.camera) return null; const d = demo.stage.position.clone().sub(demo.camera.position); d.y = 0; d.applyAxisAngle(new THREE.Vector3(0, 1, 0), -demo.camYaw()); return { right: +d.x.toFixed(3), ahead: +(-d.z).toFixed(3) }; },
  get swaps() { return demo.diag.swaps; },
};
