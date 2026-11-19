// Pin Bowl: bowling pins on your floor; tap to throw a ball at them (from the 8th Wall "physics-collider" sample,
// A-Frame + ammo.js -> plain three.js + cannon-es).
//
// Kept from the sample (src/body.html, game-logic.js): six bowling pins (pin.glb) in the sample's layout (one
// front, two, three at the back) and a soccer ball with the sample's texture on a static ground, a tap fires the
// action, a reset button puts the pins and the ball back. Changed: physics is cannon-es 0.20 (MIT, pinned from
// jsDelivr) instead of ammo.wasm; the tap throws a ball from the phone along where you tapped (the sample swung a
// boxing glove fixed to the camera); everything is real size on the tracked floor (pins 22 cm, about half
// real ones) and runs in the placed stage's own frame, so Move carries the pins with it as they are; a count of
// pins down.
import * as CANNON from 'cannon-es';
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow, texture } from '../shared/shell.js';

const PIN_H = 0.22, PIN_R = 0.038, BALL_R = 0.06, MAX_BALLS = 6, SPEED = 3.6;
// the sample's pin positions (x, -z) in its 1:1 units, scaled to the pin size: 1, 2, 3 rows
const RACK = [[0, 7], [-0.5, 8.5], [0.5, 8.5], [0, 10], [-1, 10], [1, 10]].map(([x, z]) => [x * 0.17, -(z - 7) * 0.17]);
let pinProto, ballTex, world, pins = [], balls = [], ground;
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

const demo = createDemo({
  slug: 'physics', mode: 'world', tag: 'Physics',
  title: 'Pin Bowl', titleHtml: 'Pin <span>Bowl</span>',
  lead: 'Set up six bowling pins on your floor and knock them down. Tap to throw.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><circle cx="90" cy="200" r="28" fill="#fff"/><rect x="160" y="110" width="22" height="90" rx="11" fill="#fff"/><rect x="200" y="110" width="22" height="90" rx="11" fill="#fff"/><rect x="180" y="96" width="22" height="90" rx="11" fill="#4fd6e8"/></svg>`,
  how: [
    '<b>Find the floor.</b> Move your phone slowly, then tap <b>Place here</b> about a metre or two away.',
    '<b>Throw.</b> Tap the screen: a ball flies from your phone toward where you tapped.',
    '<b>Reset</b> (bottom left) stands the pins back up. <b>Move</b> (bottom right) takes the alley somewhere else.',
  ],
  placeHint: 'Tap Place here to set up the pins',
  placeLabel: 'Set up pins here',
  faceOffset: 0,
  async load(d) {
    const [g, t] = await Promise.all([loadGLB(MEDIA + 'pin.glb'), texture(MEDIA + 'soccer.jpg')]);
    pinProto = fitTo(g.scene, PIN_H); ballTex = t; d.progress(0.9);
  },
  hero() {
    const g = new THREE.Group();
    RACK.forEach(([x, z]) => { const p = pinProto.clone(); p.position.set(x, 0, z); g.add(p); });
    const b = ballMesh(); b.position.set(-0.12, BALL_R, 0.22); g.add(b);
    return g;
  },
  build(d) {
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world); world.allowSleep = true;
    world.defaultContactMaterial.friction = 0.35; world.defaultContactMaterial.restitution = 0.25;
    ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0); world.addBody(ground);
    // a lane mark under the rack (flat)
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshBasicMaterial({ color: 0x4fd6e8, transparent: true, opacity: 0.18, depthWrite: false }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.002, -0.28); d.stage.add(lane);
    RACK.forEach(([x, z]) => {
      const mesh = new THREE.Group(); const m = pinProto.clone(); m.position.y -= PIN_H / 2; mesh.add(m);
      const sh = contactShadow(0.05, 0.35); sh.position.y = -PIN_H / 2 + 0.003; mesh.add(sh); mesh.userData.shadow = sh;
      d.stage.add(mesh);
      const body = new CANNON.Body({ mass: 0.15, shape: new CANNON.Cylinder(PIN_R * 0.7, PIN_R, PIN_H, 12), linearDamping: 0.05, angularDamping: 0.1, sleepSpeedLimit: 0.05 });
      world.addBody(body);
      pins.push({ mesh, body, home: [x, z] });
    });
    rack();
    // Reset bottom left
    const b = document.createElement('button'); b.className = 'tool'; b.id = 'b-reset'; b.type = 'button'; b.hidden = true; b.setAttribute('aria-label', 'Stand the pins back up');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg><span>Reset</span>';
    b.onclick = () => rack(); d.left.appendChild(b); d.resetBtn = b;
    const sc = document.createElement('div'); sc.className = 'score'; sc.id = 'score'; sc.setAttribute('aria-live', 'polite'); sc.hidden = true; document.getElementById('hud').appendChild(sc); d.score = sc;
  },
  onPlaced(d, first) { d.resetBtn.hidden = false; d.score.hidden = false; if (first) d.hint('Tap the screen to throw a ball'); setTimeout(() => d.hint(''), 3000); },
  onMove(d) { d.score.hidden = true; },
  onTap(ndc, d) {
    if (d.state !== 'placed') return false;
    throwBall(ndc, d); return true;
  },
  update(dt, d) {
    if (!world || d.state !== 'placed') return;
    world.step(1 / 60, dt, 4);
    for (const p of pins) {
      p.mesh.position.copy(p.body.position); p.mesh.quaternion.copy(p.body.quaternion);
      // keep the pin's contact shadow flat on the floor under it
      const sh = p.mesh.userData.shadow; p.mesh.updateMatrix();
      sh.position.set(0, -PIN_H / 2 + 0.003, 0);
      const up = tmpV.set(0, 1, 0).applyQuaternion(p.mesh.quaternion); sh.visible = up.y > 0.6;
    }
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i]; b.mesh.position.copy(b.body.position); b.mesh.quaternion.copy(b.body.quaternion);
      if (b.body.position.y < -2 || b.body.position.length() > 12) { removeBall(d, i); }
    }
    const down = pins.filter(isDown).length;
    const txt = `Pins down <b>${down}</b> / ${pins.length}` + (down === pins.length ? ' · Strike!' : '');
    if (d.score.innerHTML !== txt) d.score.innerHTML = txt;
  },
});

function isDown(p) { tmpV.set(0, 1, 0).applyQuaternion(tmpQ.copy(p.body.quaternion)); return tmpV.y < 0.7 || Math.hypot(p.body.position.x - p.home[0], p.body.position.z - p.home[1]) > 0.08; }
function ballMesh() {
  const m = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 24, 16), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.6 }));
  return m;
}
function rack() {
  for (const p of pins) {
    p.body.position.set(p.home[0], PIN_H / 2 + 0.001, p.home[1]); p.body.quaternion.set(0, 0, 0, 1);
    p.body.velocity.setZero(); p.body.angularVelocity.setZero(); p.body.wakeUp();
    p.mesh.position.copy(p.body.position); p.mesh.quaternion.set(0, 0, 0, 1);
  }
  while (balls.length) removeBall(demo, 0);
}
function removeBall(d, i) { const b = balls[i]; world.removeBody(b.body); d.stage.remove(b.mesh); balls.splice(i, 1); }
function throwBall(ndc, d) {
  const ray = d.rayFrom(ndc).ray;
  // into the stage's frame (stage scale is 1 here: no pinch, so local units are metres)
  d.stage.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(d.stage.matrixWorld).invert();
  const from = ray.origin.clone().addScaledVector(ray.direction, 0.25).applyMatrix4(inv);
  const dir = ray.direction.clone().transformDirection(inv);
  dir.y += 0.12; dir.normalize(); // a little lob
  const body = new CANNON.Body({ mass: 0.45, shape: new CANNON.Sphere(BALL_R), linearDamping: 0.02, angularDamping: 0.2 });
  body.position.set(from.x, from.y, from.z); body.velocity.set(dir.x * SPEED, dir.y * SPEED, dir.z * SPEED);
  world.addBody(body);
  const mesh = ballMesh(); mesh.position.copy(from); d.stage.add(mesh);
  balls.push({ body, mesh });
  while (balls.length > MAX_BALLS) removeBall(d, 0);
}

window.__bowl = {
  get down() { return pins.filter(isDown).length; },
  get balls() { return balls.map((b) => b.body.position.toArray?.() || [b.body.position.x, b.body.position.y, b.body.position.z].map((v) => +v.toFixed(2))); },
  rack,
  // aim straight at the rack from the camera (test hook): the screen point of the front pin
  aimNdc() { const v = new THREE.Vector3(0, PIN_H * 0.5, -0.12).applyMatrix4(demo.stage.matrixWorld).project(demo.camera); return [v.x, v.y]; },
  throwAt(x, y) { throwBall(new THREE.Vector2(x, y), demo); },
};
