// Floor Lift: a robot on a pillar rises out of your floor and sinks back into it (from the 8th Wall
// "hidermaterial" three.js sample).
//
// Kept from the sample (src/threejs-scene-init.js): renderer shadows on, a directional light that casts them, a
// big ShadowMaterial plane (opacity 0.5) a little above a big "hider" plane at the floor (a material with
// colorWrite false: it writes depth only, so anything below the floor is hidden while the camera feed shows
// through), and an object that ping-pongs up and down through the floor with a sine. Changed: the object is a
// MEDIALIFE pillar with the robot riding on top (the sample's cube texture came from 8th Wall's CDN); the floor is
// the placed stage (so Move works) and the hider is a 30 m disc, not 2 km; a Hider switch turns the trick off so
// you can see what is under the floor; tap the screen to stop or start the lift.
import { createDemo, THREE, MEDIA, loadGLB, fitTo } from '../shared/shell.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const PILLAR_H = 0.55, PILLAR_W = 0.22;
let robotG, robot, mixer, lift, hider, shadowPlane, running = true, t = 0, hiderOn = true;

const demo = createDemo({
  slug: 'occlusion-floor', mode: 'world', tag: 'Occlusion',
  title: 'Floor Lift', titleHtml: 'Floor <span>Lift</span>',
  lead: 'A robot rides a pillar up out of your floor and back down into it.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><rect x="40" y="200" width="220" height="10" fill="#4fd6e8"/><rect x="120" y="110" width="60" height="90" fill="#16323a"/><circle cx="150" cy="92" r="18" fill="#fff"/></svg>`,
  how: [
    '<b>Find the floor</b> and tap <b>Place here</b>.',
    'The pillar comes up out of the floor and goes back down. <b>Tap the screen</b> to stop or start it.',
    '<b>Hider</b> switches the trick off so you can see the part under your floor.',
    '<b>Move</b> (bottom right) puts it somewhere else.',
  ],
  placeHint: 'Tap Place here to put the lift down',
  async load(d) { robotG = await loadGLB(MEDIA + 'robot.glb'); d.progress(0.9); },
  hero() {
    const g = new THREE.Group(); const p = pillar(); p.position.y = PILLAR_H / 2; g.add(p);
    const r = SkeletonUtils.clone(robotG.scene); fitTo(r, 0.3); r.position.y = PILLAR_H; g.add(r);
    const m = new THREE.AnimationMixer(r); m.clipAction(robotG.animations.find((a) => a.name === 'Wave')).play(); r.userData.mixer = m; g.userData.mixer = m;
    return g;
  },
  build(d) {
    d.renderer.shadowMap.enabled = true; d.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sun = d.sun; sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.1, far: 10 }); sun.shadow.bias = -0.0005;
    // the hider: depth only at the floor, drawn before everything else
    hider = new THREE.Mesh(new THREE.CircleGeometry(15, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false }));
    hider.renderOrder = -1; d.stage.add(hider);
    // the sample's shadow plane, a little above the hider
    shadowPlane = new THREE.Mesh(new THREE.CircleGeometry(3, 48).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.5 }));
    shadowPlane.position.y = 0.003; shadowPlane.receiveShadow = true; d.stage.add(shadowPlane);
    // a flat ring marks the hole
    const ring = new THREE.Mesh(new THREE.RingGeometry(PILLAR_W * 0.8, PILLAR_W * 0.86, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4fd6e8 }));
    ring.position.y = 0.004; d.stage.add(ring);
    lift = new THREE.Group(); d.stage.add(lift);
    const p = pillar(); p.position.y = PILLAR_H / 2; p.castShadow = true; lift.add(p);
    robot = robotG.scene; fitTo(robot, 0.3); robot.position.y = PILLAR_H; lift.add(robot);
    robot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    mixer = new THREE.AnimationMixer(robot); mixer.clipAction(robotG.animations.find((a) => a.name === 'Dance')).play();
    lift.position.y = -PILLAR_H - 0.35;
    // Hider switch, bottom left
    const b = document.createElement('button'); b.className = 'tool'; b.id = 'b-hider'; b.type = 'button'; b.hidden = true;
    b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', 'true'); b.setAttribute('aria-label', 'Hider: hide what is under the floor');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 15h18"/><path d="M8 15V9h8v6" /><path d="M8 15v5h8v-5" stroke-dasharray="2 2"/></svg><span>Hider on</span>';
    b.onclick = () => setHider(!hiderOn); d.left.appendChild(b); d.hiderBtn = b;
  },
  onPlaced(d) { d.hiderBtn.hidden = false; },
  onTap(ndc, d) { if (d.state !== 'placed') return false; running = !running; d.toast(running ? 'Lift on' : 'Lift stopped', 900); return true; },
  update(dt, d) {
    if (!lift) return;
    if (running) t += dt;
    // the sample's sine ping-pong, from fully under the floor to fully out
    const k = (Math.sin(t * 0.9 - Math.PI / 2) + 1) / 2;
    lift.position.y = -PILLAR_H - 0.35 + k * (PILLAR_H + 0.35);
    lift.rotation.y = t * 0.4;
    mixer.update(dt);
  },
});

function pillar() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 640; const g = c.getContext('2d');
  g.fillStyle = '#16323a'; g.fillRect(0, 0, 256, 640);
  g.fillStyle = '#4fd6e8'; g.fillRect(0, 0, 256, 18); g.fillRect(0, 622, 256, 18);
  const img = new Image(); img.src = '/brand/medialife-wordmark.webp';
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  img.onload = () => { g.save(); g.translate(128, 320); g.rotate(-Math.PI / 2); const w = 520, h = w * img.height / img.width; g.drawImage(img, -w / 2, -h / 2, w, h); g.restore(); tex.needsUpdate = true; };
  const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const top = new THREE.MeshStandardMaterial({ color: 0x4fd6e8, roughness: 0.5 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(PILLAR_W, PILLAR_H, PILLAR_W), [side, side, top, top, side, side]);
  return m;
}
function setHider(on) {
  hiderOn = on; hider.visible = on;
  demo.hiderBtn.setAttribute('aria-checked', String(on)); demo.hiderBtn.querySelector('span').textContent = on ? 'Hider on' : 'Hider off';
  demo.toast(on ? 'Hider on: the floor hides it' : 'Hider off: see under the floor', 1300);
}

window.__lift = {
  get y() { return +lift.position.y.toFixed(3); }, get running() { return running; }, get hider() { return hider.visible; },
  setT(v) { t = v; },
  // is the robot's head drawn? project and depth-test against the floor plane (simple check: above y=0 means visible)
  get robotWorldY() { return +robot.getWorldPosition(new THREE.Vector3()).y.toFixed(3); },
};
