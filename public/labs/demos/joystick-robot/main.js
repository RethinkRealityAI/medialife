// Robot Run: drive a robot round your floor with an on-screen joystick (from the 8th Wall "bunnyhop" /
// "rideordie" samples, A-Frame -> plain three.js).
//
// Kept from the sample (src/components.js): the joystick direction is turned by the camera's heading so "up" on the
// stick is always away from you, the character faces where it runs, Running while the stick is held and Idle when
// it is let go, a reset/recenter button. Changed: the stick is fixed at the bottom centre (house rule for joystick
// games) instead of appearing under the finger, Idle/Walking/Running blend by how far the stick is pushed, the
// robot can't wander more than RANGE from where it was placed, and Jump / Wave sit above the shutter (bottom right).
// Move (bottom left) picks the whole play area up; the robot keeps its spot on it.
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow, joystick, stickToWorld } from '../shared/shell.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const HEIGHT = 0.3;     // robot height in metres at size 1
const SPEED = 0.75;     // metres per second at full stick, size 1
const RANGE = 1.6;      // metres from the placed spot

let emoteW = 0;
let gltf, robot, body, mixer, acts = {}, stick, oneShot = null, moving = 0;
const dir = new THREE.Vector3(), local = new THREE.Vector3();

const demo = createDemo({
  slug: 'joystick-robot', mode: 'world', tag: 'Joystick', layout: 'joystick',
  title: 'Robot Run', titleHtml: 'Robot <span>Run</span>',
  lead: 'Put a little robot on your floor and drive it round your room with the joystick.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><circle cx="150" cy="150" r="62" fill="none" stroke="#4fd6e8" stroke-width="10"/><circle cx="150" cy="150" r="28" fill="#fff"/></svg>`,
  how: [
    '<b>Find the floor.</b> Move your phone slowly, then tap <b>Place here</b>. Pinch first to change the size.',
    '<b>Drive.</b> Push the joystick: up is always away from you. Push a little to walk, all the way to run.',
    '<b>Jump</b> and <b>Wave</b> are above the shutter. <b>Move</b> (bottom left) puts the robot somewhere else.',
  ],
  size: [0.5, 3, 1.5],
  placeHint: 'Tap Place here to put the robot down',
  async load(d) { gltf = await loadGLB(MEDIA + 'robot.glb'); d.progress(0.9); },
  hero() {
    const o = SkeletonUtils.clone(gltf.scene); fitTo(o, 1);
    const m = new THREE.AnimationMixer(o); m.clipAction(clip('Wave')).play(); o.userData.mixer = m; return o;
  },
  build(d) {
    robot = new THREE.Group(); d.stage.add(robot);
    body = gltf.scene; fitTo(body, HEIGHT); robot.add(body);
    robot.add(contactShadow(0.11, 0.42));
    body.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    mixer = new THREE.AnimationMixer(body);
    for (const n of ['Idle', 'Walking', 'Running']) { acts[n] = mixer.clipAction(clip(n)); acts[n].play(); acts[n].weight = n === 'Idle' ? 1 : 0; }
    mixer.addEventListener('finished', (e) => { if (e.action === oneShot) oneShot = null; });
    // a faint ring shows how far it can go
    const ring = new THREE.Mesh(new THREE.RingGeometry(RANGE - 0.012, RANGE, 96), new THREE.MeshBasicMaterial({ color: 0x4fd6e8, transparent: true, opacity: 0.35, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; d.stage.add(ring);
    stick = joystick(d, 'Joystick: drive the robot'); stick.el.hidden = true;
    const col = document.createElement('div'); col.className = 'acts';
    col.innerHTML = '<button type="button" class="tool" id="b-jump" aria-label="Jump"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg><span>Jump</span></button><button type="button" class="tool" id="b-wave" aria-label="Wave"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 12V9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a1.5 1.5 0 0 1 2.5-1.6L7 15"/></svg><span>Wave</span></button>';
    d.right.prepend(col); col.hidden = true; d.acts = col;
    col.querySelector('#b-jump').onclick = () => emote(moving > 0.3 ? 'WalkJump' : 'Jump');
    col.querySelector('#b-wave').onclick = () => emote('Wave');
  },
  onPlaced(d) { stick.el.hidden = false; d.acts.hidden = false; },
  onMove(d) { stick.el.hidden = true; d.acts.hidden = true; },
  update(dt, d) {
    if (!mixer) return;
    const v = stick.v, mag = d.state === 'placed' ? Math.min(1, v.length()) : 0;
    if (mag > 0.08) {
      stickToWorld(d, v, dir).normalize();
      // world direction -> the stage's own frame (the stage is turned to face you when placed)
      local.copy(dir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -d.stage.rotation.y);
      const sp = SPEED * mag * mag * dt; // per stage unit = metres at size 1
      robot.position.addScaledVector(local, sp);
      const r = Math.hypot(robot.position.x, robot.position.z);
      if (r > RANGE) robot.position.multiplyScalar(RANGE / r);
      let dy = Math.atan2(local.x, local.z) - robot.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      robot.rotation.y += dy * (1 - Math.exp(-12 * dt));
    }
    moving += (mag - moving) * (1 - Math.exp(-10 * dt));
    const run = THREE.MathUtils.smoothstep(moving, 0.55, 0.9), walk = THREE.MathUtils.smoothstep(moving, 0.08, 0.4) * (1 - run);
    // while a Jump / Wave plays it takes over the body; the base blend fades back after
    emoteW += ((oneShot && oneShot.isRunning() ? 1 : 0) - emoteW) * (1 - Math.exp(-14 * dt));
    const k = 1 - emoteW;
    acts.Running.weight = run * k; acts.Walking.weight = walk * k; acts.Idle.weight = Math.max(0, 1 - run - walk) * k;
    mixer.update(dt);
  },
});

function clip(n) { return gltf.animations.find((c) => c.name === n); }
function emote(n) {
  if (oneShot) oneShot.stop();
  const a = mixer.clipAction(clip(n)); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; a.weight = 1;
  a.fadeIn(0.15).play(); oneShot = a;
}

window.__robot = {
  get pos() { return robot.position.toArray().map((x) => +x.toFixed(3)); },
  get weights() { return Object.fromEntries(Object.entries(acts).map(([k, a]) => [k, +a.weight.toFixed(2)])); },
  push(x, y) { stick.v.set(x, y); },
  emote,
  get emoting() { return oneShot ? oneShot.getClip().name : null; },
};
