// Mascot: the rigged Meshy Spark (spark.glb) behind the same interface as the coded placeholder in spark.js
// (root, update, act, setColor, setMouth, setListening, setLook, pop, arrive, state, ACTIONS, ready).
// Until the GLB has loaded, and forever if it fails, the coded Spark is shown and every call goes to it.
//
// Local units: the character is ~1 unit tall, centred on its body. Front = +z, up = +y.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSpark as createCoded, SPARK_COLORS } from './spark.js';

export { SPARK_COLORS };

const GLB_URL = new URL('./spark.glb', import.meta.url).href;
const BASE_HUE = 199;     // degrees: the body blue measured from the texture (s 0.97, v 0.90)
const BASE_S = 0.97, BASE_V = 0.9;

// action -> clip, trimmed window (seconds), playback speed, fade back to Idle
const CLIPS = {
  wave: { clip: 'Big_Wave_Hello', from: 0.2, to: 3.6, speed: 1.5, out: 0.3 },
  jump: { clip: 'Regular_Jump', speed: 1, out: 0.2 },
  spin: { clip: '360_Power_Spin_Jump', speed: 1, out: 0.3 },
  dance: { clip: 'FunnyDancing_01', from: 1.6, to: 5.1, speed: 1, out: 0.3 },
  confetti: { clip: 'Cheer_with_Both_Hands_Up', speed: 1, out: 0.25 },
};
const DUR = { wave: 1.5, jump: 0.85, spin: 0.9, dance: 2.6, nod: 0.9, shake: 0.9, confetti: 1.7, sleep: 0.6 };   // coded-only actions
const FADE_IN = 0.15;

const ease = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 3);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// colour of the body: hue shift (radians), saturation and value scale, from the named flat colour
function tint(name) {
  if (name === 'white') return { hue: 0, sat: 0.06, val: 1.12 };
  if (name === 'blue') return { hue: 0, sat: 1, val: 1 };
  const x = SPARK_COLORS[name], hsl = {};
  const r = (x >> 16 & 255) / 255, g = (x >> 8 & 255) / 255, b = (x & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);   // hue in sRGB, as the shader works
  const s = mx ? (mx - mn) / mx : 0;
  return { hue: wrap((hsl.h * 360 - BASE_HUE) * Math.PI / 180), sat: s / BASE_S, val: Math.min(1.15, mx / BASE_V) };
}

// small shader patch: recolour only texels near the body blue, so the visor, white and magenta stay as they are
function patchMaterial(mat, uni) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHue = uni.uHue; sh.uniforms.uSat = uni.uSat; sh.uniforms.uVal = uni.uVal;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uHue; uniform float uSat; uniform float uVal;
vec3 mlRgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y); float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 mlHsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 hsv = mlRgb2hsv(pow(max(diffuseColor.rgb, 0.0), vec3(1.0 / 2.2)));
  float d = abs(fract(hsv.x - ${(BASE_HUE / 360).toFixed(4)} + 0.5) - 0.5);
  float w = (1.0 - smoothstep(0.07, 0.14, d)) * smoothstep(0.15, 0.35, hsv.y);
  hsv.x = fract(hsv.x + w * uHue / 6.2831853);
  hsv.y = clamp(mix(hsv.y, hsv.y * uSat, w), 0.0, 1.0);
  hsv.z = clamp(mix(hsv.z, hsv.z * uVal, w), 0.0, 1.0);
  diffuseColor.rgb = pow(mlHsv2rgb(hsv), vec3(2.2));
}`);
  };
  mat.customProgramCacheKey = () => 'ml-spark-tint';
  mat.needsUpdate = true;
}

// keep the clip in place: Hips X/Z pinned to one point, and any turn at the end eased out so Idle does not snap.
// keep (0..1): Idle turns the whole body away from the viewer, so only that share of its sway is kept.
function pinClip(clip, pin, yawOf, restYaw, keep) {
  for (const tr of clip.tracks) {
    if (tr.name === 'Hips.position') {
      for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] = pin.x; tr.values[i + 2] = pin.z; }
    }
    if (tr.name === 'Hips.quaternion') {
      const v = tr.values, n = v.length / 4, q = new THREE.Quaternion(), fix = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      const a0 = wrap(restYaw - yawOf(q.fromArray(v, 0))), a1 = wrap(restYaw - yawOf(q.fromArray(v, (n - 1) * 4)));
      const T = tr.times[n - 1] || 1;
      for (let i = 0; i < n; i++) {
        const k = tr.times[i] / T, s = k * k * (3 - 2 * k);
        const a = keep != null ? -wrap(yawOf(q.fromArray(v, i * 4)) - restYaw) * (1 - keep) : a0 + wrap(a1 - a0) * s;
        fix.setFromAxisAngle(up, a);
        q.fromArray(v, i * 4).premultiply(fix).toArray(v, i * 4);
      }
    }
  }
  return clip;
}

export function createSpark(opts = {}) {
  const url = opts.url || GLB_URL;
  const root = new THREE.Group();          // world transform set by the page (print hover or palm)
  const coded = createCoded(); root.add(coded.root);
  const rig = new THREE.Group(); rig.visible = false; root.add(rig);   // pop and talk squash scale this

  // listening ring under the feet: flat magenta, faint until listening
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff2fae, transparent: true, opacity: 0.22, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 8, 56), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.495; rig.add(ring);

  // confetti: flat squares, simple ballistic motion in root space (as spark.js)
  const CONF = 36, confGeo = new THREE.PlaneGeometry(0.05, 0.05);
  const confCols = [SPARK_COLORS.blue, SPARK_COLORS.magenta, 0xffffff];
  const conf = [];
  for (let i = 0; i < CONF; i++) {
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({ color: confCols[i % 3], side: THREE.DoubleSide }));
    m.visible = false; root.add(m); conf.push({ m, v: new THREE.Vector3(), life: 0, spin: 0 });
  }

  const st = {
    t: 0, mouth: 0, mouthTarget: 0, listening: 0, asleep: false, sleepK: 0, glb: false, color: 'blue',
    act: null, actT: 0, pop: 1, popping: false, look: new THREE.Vector2(), lookTarget: new THREE.Vector2(),
  };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uni = { uHue: { value: 0 }, uSat: { value: 1 }, uVal: { value: 1 } };

  let mixer = null, idle = null, cur = null, curAct = null, bones = {}, model = null;
  const slots = {};          // two actions per clip, so a repeat cross-fades instead of snapping

  // copy the coded Spark's state across while it is the one showing
  function sync() {
    const c = coded.state;
    st.act = c.act; st.asleep = c.asleep; st.pop = c.pop; st.popping = c.popping;
    st.mouth = c.mouth; st.mouthTarget = c.mouthTarget; st.listening = c.listening;
    st.look.copy(c.look); st.lookTarget.copy(c.lookTarget);
  }

  function burst() {
    for (const c of conf) {
      c.m.visible = true; c.life = 1.2 + Math.random() * 0.5; c.spin = (Math.random() - 0.5) * 14;
      c.m.position.set((Math.random() - 0.5) * 0.2, 0.45, (Math.random() - 0.5) * 0.2);
      c.v.set((Math.random() - 0.5) * 1.6, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6);
    }
  }

  function fadeTo(next) {
    const from = cur;
    next.enabled = true; next.setEffectiveWeight(1); next.setEffectiveTimeScale(next === idle ? idleSpeed() : next.userData.speed);
    if (next !== idle) next.reset();
    next.play();
    if (from && from !== next) from.crossFadeTo(next, next === idle ? curAct.out : FADE_IN, false);
    cur = next;
  }
  const idleSpeed = () => 1 - 0.6 * st.sleepK;

  function act(name) {
    if (!st.glb) { const ok = coded.act(name); sync(); return ok; }
    if (!DUR[name]) return false;
    st.asleep = name === 'sleep';
    st.act = name; st.actT = 0;
    const c = CLIPS[name];
    if (c) {
      const pair = slots[name], a = pair[0] === cur ? pair[1] : pair[0];
      curAct = c; fadeTo(a);
      st.actDur = a.getClip().duration / c.speed;
    } else {
      st.actDur = DUR[name];
      if (cur !== idle) { fadeTo(idle); }
      curAct = null;
    }
    if (name === 'confetti') burst();
    return true;
  }
  function setColor(name) {
    if (SPARK_COLORS[name] == null) return false;
    coded.setColor(name); st.color = name;
    const k = tint(name); uni.uHue.value = k.hue; uni.uSat.value = k.sat; uni.uVal.value = k.val;
    return true;
  }
  function setMouth(v) { if (!st.glb) { coded.setMouth(v); sync(); return; } st.mouthTarget = clamp(v, 0, 1); if (v > 0.05) st.asleep = false; }
  function setListening(v) { coded.setListening(v); st.listening = v ? 1 : 0; }
  function setLook(x, y) { if (!st.glb) { coded.setLook(x, y); sync(); return; } st.lookTarget.set(clamp(x, -1, 1), clamp(y, -1, 1)); }
  function pop() { if (!st.glb) { coded.pop(); sync(); return; } st.pop = 0; st.popping = true; }
  function arrive() { if (!st.glb) { coded.arrive(); sync(); return; } if (!st.popping) st.pop = Math.min(st.pop, 0.7); }

  // extra rotation E (in the model's frame) on top of a bone's animated pose
  const _p = new THREE.Quaternion(), _e = new THREE.Quaternion(), _eu = new THREE.Euler();
  function addRot(bone, x, y, z) {
    _p.identity();
    for (let o = bone.parent; o && o !== model; o = o.parent) _p.premultiply(o.quaternion);
    _e.setFromEuler(_eu.set(x, y, z, 'YXZ'));
    // L' = P^-1 * E * P * L
    bone.quaternion.premultiply(_p).premultiply(_e).premultiply(_p.invert());
  }

  function update(dt) {
    if (!st.glb) {
      coded.update(dt); sync();
      root.userData.popLift = coded.root.userData.popLift;
      return;
    }
    st.t += dt;
    const t = st.t;
    // ---- pop: pressed flat on the print, inflates, then springs up (page reads popLift for the hover height)
    if (st.pop < 1) { st.pop = Math.min(1, st.pop + dt / 1.1); if (st.pop >= 1) st.popping = false; }
    const inflate = ease(st.pop / 0.4), spring = st.pop < 0.4 ? 0 : ease((st.pop - 0.4) / 0.6);
    root.userData.popLift = spring;                       // 0 on the print, 1 at hover height
    const over = st.pop < 1 && st.pop > 0.4 ? Math.sin((st.pop - 0.4) / 0.6 * Math.PI) * 0.12 : 0;

    // ---- action timing: back to Idle when the clip is done
    let rx = 0, ry = 0;
    if (st.act) {
      st.actT += dt;
      const d = st.actDur, k = clamp(st.actT / d, 0, 1), env = Math.sin(k * Math.PI);
      if (st.act === 'nod') rx += Math.sin(st.actT * 11) * 0.28 * env;
      if (st.act === 'shake') ry += Math.sin(st.actT * 13) * 0.35 * env;
      if (curAct && cur !== idle && st.actT >= d - curAct.out) fadeTo(idle);
      if (k >= 1) { st.act = null; curAct = null; }
    }

    // ---- sleep: Idle slows, body slumps, head bows
    st.sleepK += ((st.asleep ? 1 : 0) - st.sleepK) * Math.min(1, dt * 3);
    idle.setEffectiveTimeScale(idleSpeed());
    mixer.update(dt);

    // ---- voice: smoothed level, small head bob and body squash
    st.mouth += (st.mouthTarget - st.mouth) * Math.min(1, dt * 12);
    const m = st.mouth;
    const talkTilt = reduced ? 0 : Math.sin(t * 5.3) * 0.05 * m;
    rig.scale.set((1 + over * 0.4) * (1 - m * 0.015), (1 + over) * (1 + m * 0.03), Math.max(0.06, inflate) * (1 - m * 0.015));

    // ---- head follows the phone a little, after the mixer, clamped
    st.look.lerp(st.lookTarget, 1 - Math.pow(0.001, dt));
    const sk = st.sleepK;
    const pitch = clamp(rx - st.look.y * 0.3 - m * 0.08 + sk * 0.45, -0.45, 0.6);
    const yaw = clamp(ry + st.look.x * 0.4 * (1 - sk), -0.6, 0.6);
    const roll = talkTilt + sk * 0.12;
    if (sk > 0.001) { addRot(bones.Spine01, sk * 0.1, 0, 0); addRot(bones.Spine, sk * 0.12, 0, 0); }
    addRot(bones.neck, pitch * 0.3, yaw * 0.3, roll * 0.3);
    addRot(bones.Head, pitch * 0.7, yaw * 0.7, roll * 0.7);

    // ---- listening ring pulses
    const li = st.listening * (st.asleep ? 0 : 1);
    ringMat.opacity = 0.22 + li * (0.55 + (reduced ? 0 : Math.sin(t * 9) * 0.2));
    ring.scale.setScalar(1 + li * (0.08 + (reduced ? 0 : Math.sin(t * 9) * 0.04)));

    // ---- confetti
    for (const c of conf) {
      if (!c.m.visible) continue;
      c.life -= dt; c.v.y -= 3.2 * dt; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * 0.7 * dt;
      if (c.life <= 0) c.m.visible = false;
    }
  }

  const ready = new Promise((resolve) => {
    new GLTFLoader().load(url, (gltf) => {
      try {
        model = gltf.scene;
        let mesh = null;
        model.traverse((o) => {
          if (o.isBone) bones[o.name] = o;
          if (o.isSkinnedMesh) mesh = o;
        });
        if (!mesh || !bones.Hips || !bones.Head || !bones.neck) throw new Error('spark.glb: missing mesh or bones');
        mesh.frustumCulled = false;
        const mat = mesh.material;
        mat.roughness = 0.6; mat.metalness = 0; mat.emissive.setHex(0x000000); mat.emissiveMap = null; mat.emissiveIntensity = 0;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        patchMaterial(mat, uni);

        // pin every clip to the Idle start point, facing the Idle start direction
        const byName = {}; for (const c of gltf.animations) byName[c.name] = c;
        if (!byName.Idle) throw new Error('spark.glb: no Idle clip');
        const hp = byName.Idle.tracks.find((tr) => tr.name === 'Hips.position');
        const hq = byName.Idle.tracks.find((tr) => tr.name === 'Hips.quaternion');
        const pin = hp ? { x: hp.values[0], z: hp.values[2] } : { x: bones.Hips.position.x, z: bones.Hips.position.z };
        const fwd = new THREE.Vector3();
        // the hips' forward axis, found from the rest pose: the bone axis that points most along +z
        const restQ = hq ? new THREE.Quaternion().fromArray(hq.values, 0) : bones.Hips.quaternion.clone();
        const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1)];
        const fAxis = axes.reduce((b, a) => (fwd.copy(a).applyQuaternion(restQ).z > fwd.copy(b).applyQuaternion(restQ).z ? a : b));
        const yawOf = (q) => { fwd.copy(fAxis).applyQuaternion(q); return Math.atan2(fwd.x, fwd.z); };
        const restYaw = yawOf(restQ);
        for (const c of gltf.animations) pinClip(c, pin, yawOf, restYaw, c.name === 'Idle' ? 0.2 : null);
        // Idle also turns the head right round: keep a share of the head and spine motion around the first frame
        const calm = { Head: 0.35, neck: 0.35, Spine: 0.6, Spine01: 0.6, Spine02: 0.6 };
        for (const tr of byName.Idle.tracks) {
          const [bone, prop] = tr.name.split('.');
          if (prop !== 'quaternion' || calm[bone] == null) continue;
          const q0 = new THREE.Quaternion().fromArray(tr.values, 0), q = new THREE.Quaternion();
          for (let i = 0; i < tr.values.length; i += 4) q.fromArray(tr.values, i).slerp(q0, 1 - calm[bone]).toArray(tr.values, i);
        }

        // centre the body on the root origin: feet at y = -0.5, hips over x = z = 0
        const s = model.getObjectByName('Armature')?.scale.x ?? 1;
        model.position.set(-pin.x * s, -0.5, -pin.z * s);
        rig.add(model);

        mixer = new THREE.AnimationMixer(model);
        idle = mixer.clipAction(byName.Idle); idle.play(); cur = idle;
        for (const [name, c] of Object.entries(CLIPS)) {
          const src = byName[c.clip]; if (!src) continue;
          const fps = 30, trimmed = c.from != null ? THREE.AnimationUtils.subclip(src, name, Math.round(c.from * fps), Math.round(c.to * fps), fps) : src;
          const pair = [trimmed, trimmed.clone()].map((cl) => {
            const a = mixer.clipAction(cl); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.userData = { speed: c.speed }; return a;
          });
          slots[name] = pair;
        }
        for (const name of Object.keys(CLIPS)) if (!slots[name]) throw new Error('spark.glb: missing clip for ' + name);
        mixer.update(0);

        // hand over from the coded Spark: carry its pop, sleep, look and voice state
        const c = coded.state;
        st.pop = c.pop; st.popping = c.popping; st.asleep = c.asleep; st.sleepK = c.asleep ? 1 : 0;
        st.look.copy(c.look); st.lookTarget.copy(c.lookTarget); st.mouth = c.mouth; st.mouthTarget = c.mouthTarget;
        st.act = null; st.glb = true;
        coded.root.visible = false; rig.visible = true;
        update(0);
        resolve(true);
      } catch (err) {
        console.warn('[mascot] spark.glb could not be used, keeping the coded Spark:', err.message);
        if (model && model.parent) model.parent.remove(model);
        resolve(false);
      }
    }, undefined, (err) => {
      console.warn('[mascot] spark.glb failed to load, keeping the coded Spark:', err && (err.message || err));
      resolve(false);
    });
  });

  return { root, update, act, setColor, setMouth, setListening, setLook, pop, arrive, state: st, ACTIONS: Object.keys(DUR), ready };
}
