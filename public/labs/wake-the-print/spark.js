// Spark: the placeholder MEDIALIFE host for the Wake the Print POC. Built in code (no GLB) in the logo blue
// and magenta, flat colours only. A designed mascot replaces this once Dapo picks one: keep the same interface
// (root, update, act, setColor, setMouth, setListening, pop) and the rest of the page does not change.
//
// Local units: the character is ~1 unit tall, centred on its body. Front = +z, up = +y.
import * as THREE from 'three';

export const SPARK_COLORS = {
  blue: 0x19afff, magenta: 0xff2fae, green: 0x35d07f, yellow: 0xffd23f, orange: 0xff8a3d, purple: 0x8a5cff, white: 0xf2f5f7,
};
const INK = 0x0b0b0f;

const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export function createSpark() {
  const root = new THREE.Group();          // world transform set by the page (print hover or palm)
  const rig = new THREE.Group(); root.add(rig);      // actions move this
  const head = new THREE.Group(); rig.add(head);     // looks at the phone

  const bodyMat = new THREE.MeshStandardMaterial({ color: SPARK_COLORS.blue, roughness: 0.42, metalness: 0.05 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 28), bodyMat);
  body.scale.set(1, 0.94, 0.9); head.add(body);

  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.25, metalness: 0.2 }));
  visor.scale.set(0.92, 0.6, 0.4); visor.position.set(0, 0.03, 0.235); head.add(visor);

  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyeGeo = new THREE.CircleGeometry(0.052, 20);
  const eyeL = new THREE.Mesh(eyeGeo, white), eyeR = new THREE.Mesh(eyeGeo, white);
  const eyes = new THREE.Group(); eyes.position.set(0, 0.06, 0.352); eyes.add(eyeL, eyeR); head.add(eyes);
  eyeL.position.x = -0.105; eyeR.position.x = 0.105; eyeL.scale.y = eyeR.scale.y = 1.35;
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), white);
  mouth.position.set(0, -0.055, 0.35); mouth.scale.set(1.6, 0.35, 1); head.add(mouth);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), new THREE.MeshStandardMaterial({ color: INK, roughness: 0.5 }));
  antenna.position.y = 0.4; head.add(antenna);
  const tipMat = new THREE.MeshStandardMaterial({ color: SPARK_COLORS.magenta, emissive: SPARK_COLORS.magenta, emissiveIntensity: 0.25, roughness: 0.35 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), tipMat); tip.position.y = 0.5; head.add(tip);

  const handGeo = new THREE.SphereGeometry(0.075, 16, 12);
  const handL = new THREE.Mesh(handGeo, bodyMat), handR = new THREE.Mesh(handGeo, bodyMat);
  rig.add(handL, handR);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 10, 40), new THREE.MeshStandardMaterial({ color: SPARK_COLORS.magenta, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.42; rig.add(ring);

  // confetti: flat squares, simple ballistic motion in rig space
  const CONF = 36, confGeo = new THREE.PlaneGeometry(0.05, 0.05);
  const confCols = [SPARK_COLORS.blue, SPARK_COLORS.magenta, 0xffffff];
  const conf = [];
  for (let i = 0; i < CONF; i++) {
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: confCols[i % 3], side: THREE.DoubleSide }));
    m.visible = false; root.add(m); conf.push({ m, v: new THREE.Vector3(), life: 0, spin: 0 });
  }

  const st = {
    t: 0, blinkAt: 1.5, blink: 0, mouth: 0, mouthTarget: 0, listening: 0, asleep: false,
    act: null, actT: 0, pop: 1, popping: false, look: new THREE.Vector2(), lookTarget: new THREE.Vector2(),
  };
  const DUR = { wave: 1.5, jump: 0.85, spin: 0.9, dance: 2.6, nod: 0.9, shake: 0.9, confetti: 1.7, sleep: 0.6 };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function act(name) {
    if (!DUR[name]) return false;
    st.asleep = name === 'sleep';
    st.act = name; st.actT = 0;
    if (name === 'confetti') {
      for (const c of conf) {
        c.m.visible = true; c.life = 1.2 + Math.random() * 0.5; c.spin = (Math.random() - 0.5) * 14;
        c.m.position.set((Math.random() - 0.5) * 0.2, 0.35, (Math.random() - 0.5) * 0.2);
        c.v.set((Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6);
      }
    }
    return true;
  }
  function setColor(name) { const c = SPARK_COLORS[name]; if (c == null) return false; bodyMat.color.setHex(c); return true; }
  function setMouth(v) { st.mouthTarget = clamp(v, 0, 1); if (v > 0.05) st.asleep = false; }
  function setListening(v) { st.listening = v ? 1 : 0; }
  function setLook(x, y) { st.lookTarget.set(clamp(x, -1, 1), clamp(y, -1, 1)); }
  function pop() { st.pop = 0; st.popping = true; }       // the first climb out of the print
  function arrive() { if (!st.popping) st.pop = Math.min(st.pop, 0.7); }   // re-found: a short settle, not the whole moment

  function update(dt) {
    st.t += dt;
    const t = st.t;
    // ---- pop: pressed flat on the print, inflates, then springs up (page reads popLift for the hover height)
    if (st.pop < 1) { st.pop = Math.min(1, st.pop + dt / 1.1); if (st.pop >= 1) st.popping = false; }
    const inflate = ease(st.pop / 0.4), spring = st.pop < 0.4 ? 0 : ease((st.pop - 0.4) / 0.6);
    root.userData.popLift = spring;                       // 0 on the print, 1 at hover height
    const over = st.pop < 1 && st.pop > 0.4 ? Math.sin((st.pop - 0.4) / 0.6 * Math.PI) * 0.12 : 0;
    rig.scale.set(1 + over * 0.4, 1 + over, Math.max(0.06, inflate));

    // ---- idle
    const bob = reduced ? 0 : Math.sin(t * 2.1) * 0.025;
    let px = 0, py = bob, rx = 0, ry = 0, rz = Math.sin(t * 1.3) * 0.03, sy = 1;
    let hLx = -0.47, hLy = -0.1 + Math.sin(t * 2.1 + 1) * 0.02, hRx = 0.47, hRy = -0.1 + Math.sin(t * 2.1 + 2) * 0.02, hRz = 0;

    // ---- action
    if (st.act) {
      st.actT += dt; const d = DUR[st.act], k = clamp(st.actT / d, 0, 1), env = Math.sin(k * Math.PI);
      switch (st.act) {
        case 'wave': hRx = 0.5; hRy = 0.2 + env * 0.25; hRz = Math.sin(st.actT * 14) * 0.12 * env; hRx += hRz; rz += env * -0.12; break;
        case 'jump': py += Math.sin(k * Math.PI) * 0.45; sy = 1 + Math.sin(k * Math.PI * 2) * 0.12; break;
        case 'spin': ry += ease(k) * Math.PI * 2; py += env * 0.08; break;
        case 'dance': px += Math.sin(st.actT * 7) * 0.09 * env; py += Math.abs(Math.sin(st.actT * 7)) * 0.1 * env; rz += Math.sin(st.actT * 7) * 0.2 * env;
          hLy += Math.sin(st.actT * 7) * 0.2 * env + 0.15 * env; hRy += -Math.sin(st.actT * 7) * 0.2 * env + 0.15 * env; break;
        case 'nod': rx += Math.sin(st.actT * 11) * 0.28 * env; break;
        case 'shake': ry += Math.sin(st.actT * 13) * 0.35 * env; break;
        case 'confetti': py += Math.sin(Math.min(k * 2, 1) * Math.PI) * 0.3; hLy += env * 0.4; hRy += env * 0.4; break;
        case 'sleep': break;
      }
      if (k >= 1) st.act = null;
    }
    if (st.asleep) { rz += 0.16; py -= 0.04; }
    rig.position.set(px, py, 0); rig.rotation.set(0, st.act === 'spin' ? ry : 0, rz); rig.scale.y *= sy;

    // ---- head follows the phone a little; eyes lead
    st.look.lerp(st.lookTarget, 1 - Math.pow(0.001, dt));
    head.rotation.set(rx - st.look.y * 0.3, (st.act === 'spin' ? 0 : ry) + st.look.x * 0.4, 0);
    eyes.position.x = st.look.x * 0.02; eyes.position.y = 0.06 + st.look.y * 0.015;

    // ---- blink / sleep
    if (t > st.blinkAt) { st.blink = 0.14; st.blinkAt = t + 2 + Math.random() * 3.5; }
    st.blink = Math.max(0, st.blink - dt);
    const lid = st.asleep ? 0.12 : (st.blink > 0 ? 0.12 : 1.35);
    eyeL.scale.y += (lid - eyeL.scale.y) * Math.min(1, dt * 30); eyeR.scale.y = eyeL.scale.y;

    // ---- mouth follows the voice; antenna tip glows while listening
    st.mouth += (st.mouthTarget - st.mouth) * Math.min(1, dt * 22);
    mouth.scale.set(1.6 - st.mouth * 0.5, 0.35 + st.mouth * 1.9, 1);
    tipMat.emissiveIntensity = st.asleep ? 0.05 : 0.25 + st.listening * (0.9 + Math.sin(t * 9) * 0.35);
    tip.scale.setScalar(1 + st.listening * 0.25);

    handL.position.set(hLx, hLy, 0.05); handR.position.set(hRx, hRy, 0.05);
    ring.rotation.z = t * 1.5; ring.position.y = -0.42 - bob * 0.5;

    // ---- confetti
    for (const c of conf) {
      if (!c.m.visible) continue;
      c.life -= dt; c.v.y -= 3.2 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * 0.7 * dt;
      if (c.life <= 0) c.m.visible = false;
    }
  }

  return { root, update, act, setColor, setMouth, setListening, setLook, pop, arrive, state: st, ACTIONS: Object.keys(DUR) };
}
