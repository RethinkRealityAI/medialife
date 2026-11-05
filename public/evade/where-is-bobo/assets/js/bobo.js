/**
 * Bobo, walking on top of the globe. Same model, rig and clips as the
 * activated-retail display and the creators page (catbobo.glb + the
 * animation-only bobo-clips.glb). Bobo stays on one spot at the top-front of
 * the globe; the globe turns under his feet, so he walks, runs, turns to
 * watch a hologram, sits and naps.
 *
 * Clips: Walk, Run, Sit, Chill, Idle, Sleep, Alert, Purr, Excited.
 */
import * as THREE from "three";
import * as SkeletonUtils from "/vendor/three@0.170.0/jsm/utils/SkeletonUtils.js";

const MODEL = "/roblox/activated-retail/models/catbobo.glb";
const CLIPS = "/evade/creators/assets/models/bobo-clips.glb";

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param {{loader:any, parent:THREE.Object3D, anchor:THREE.Vector3, height:number, reduced:boolean}} o
 * anchor: unit vector of the spot on the globe (world space) where Bobo stands.
 */
export async function loadBobo({ loader, parent, anchor, height, reduced }) {
  const [a, extra] = await Promise.all([
    loader.loadAsync(MODEL),
    loader.loadAsync(CLIPS).catch(() => null),
  ]);
  const inner = SkeletonUtils.clone(a.scene);
  inner.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      if (o.material) {
        o.material.envMapIntensity = 0.45;
        // the fur texture is a pale butter yellow that the globe's lights wash
        // out to white: warm it back so Bobo reads as EVADE yellow
        if (o.material.map) o.material.color.setRGB(1, 0.86, 0.6);
      }
    }
  });
  const box = new THREE.Box3().setFromObject(inner);
  const sc = height / (box.max.y - box.min.y);
  inner.scale.setScalar(sc);
  inner.position.y = -box.min.y * sc;
  const center = box.getCenter(new THREE.Vector3());
  inner.position.x = -center.x * sc;
  inner.position.z = -center.z * sc;

  // heading: rotate around Bobo's own up axis
  const heading = new THREE.Group();
  heading.add(inner);
  // stand: placed on the globe, its +Y along the surface normal
  const stand = new THREE.Group();
  stand.add(heading);
  stand.position.copy(anchor);
  stand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.clone().normalize());
  parent.add(stand);

  // soft contact shadow so he sits on the dots instead of floating
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(height * 1.1, height * 1.3),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  stand.add(shadow);

  // big invisible tap target
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(height * 0.9, height * 1.1, height * 1.3),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = height * 0.5;
  hit.userData.bobo = true;
  stand.add(hit);

  const mixer = new THREE.AnimationMixer(inner);
  const clips = {};
  for (const clip of [...(a.animations || []), ...(extra?.animations || [])])
    clips[clip.name] ||= clip;
  const actions = {};
  const act = (n) => (clips[n] ? (actions[n] ||= mixer.clipAction(clips[n])) : null);

  const st = {
    cur: null,
    curName: "",
    mode: "auto", // auto | travel | watch | drag
    face: Math.PI / 2, // heading the body turns towards (radians around up)
    t: 0,
    restT: 6 + Math.random() * 6,
    resting: null,
    onceUntil: 0,
    speed: 0,
  };

  function play(name, fade = 0.3, once = false) {
    const x = act(name) || act("Idle") || act("Sit");
    if (!x) return;
    if (st.cur === x && !once) return;
    x.reset();
    x.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    x.clampWhenFinished = once;
    x.enabled = true;
    x.setEffectiveTimeScale(1);
    x.setEffectiveWeight(1);
    x.play();
    if (st.cur && st.cur !== x) st.cur.crossFadeTo(x, fade, false);
    st.cur = x;
    st.curName = name;
  }
  const dur = (n) => clips[n]?.duration || 2;

  heading.rotation.y = st.face;
  play("Walk", 0.01);

  /**
   * Called every frame with the surface velocity under Bobo, in his local
   * tangent frame (x = right on screen, z = towards camera), in globe radii/s.
   */
  // walking across the planet to a spot (world space, globe standing still)
  const UP = new THREE.Vector3(0, 1, 0);
  const radius = anchor.length();
  const here = anchor.clone().normalize();
  let walk = null; // { from, to, ang, t, done }
  const _p = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  function slerpDir(a, b, ang, t, out) {
    if (ang < 1e-4) return out.copy(b);
    const s = Math.sin(ang);
    return out
      .copy(a)
      .multiplyScalar(Math.sin((1 - t) * ang) / s)
      .addScaledVector(b, Math.sin(t * ang) / s)
      .normalize();
  }
  function stepWalk(dt) {
    const w = walk;
    const speed = 0.32; // radians per second at full stride
    w.t = Math.min(1, w.t + (dt * speed) / Math.max(w.ang, 0.05));
    // ease in and out so he sets off and pulls up like a cat, not a cursor
    const e = w.t < 0.5 ? 2 * w.t * w.t : 1 - Math.pow(-2 * w.t + 2, 2) / 2;
    slerpDir(w.from, w.to, w.ang, e, _n);
    here.copy(_n);
    stand.position.copy(_n).multiplyScalar(radius);
    stand.quaternion.setFromUnitVectors(UP, _n);
    // face the way he's going, in his own ground frame
    _p.copy(w.to).sub(_n).applyQuaternion(_q.copy(stand.quaternion).invert());
    if (Math.hypot(_p.x, _p.z) > 1e-4) st.face = Math.atan2(_p.x, _p.z);
    const pace = Math.sin(Math.PI * e);
    play(w.ang > 0.25 && pace > 0.35 ? "Run" : "Walk", 0.25);
    if (st.curName === "Walk") st.cur?.setEffectiveTimeScale(1.2);
    if (w.t >= 1) {
      walk = null;
      st.speed = 0;
      w.done?.();
    }
  }

  function update(dt, surface, now) {
    st.t += dt;
    if (walk) {
      stepWalk(dt);
      const dy = wrap(st.face - heading.rotation.y);
      heading.rotation.y += dy * Math.min(1, dt * 8);
      mixer.update(dt);
      return;
    }
    const sp = Math.hypot(surface.x, surface.z);
    st.speed += (sp - st.speed) * Math.min(1, dt * 6);
    // he walks against the ground's motion (it's a treadmill)
    if (st.mode !== "watch" && sp > 0.004) st.face = Math.atan2(-surface.x, -surface.z);
    const once = now < st.onceUntil;
    if (!once) {
      if (st.mode === "watch") {
        if (!["Sit", "Chill", "Idle", "Purr"].includes(st.curName)) play("Sit", 0.4);
      } else if (st.speed > 0.11) play("Run", 0.25);
      else if (st.speed > 0.006) {
        play("Walk", 0.3);
        st.resting = null;
      } else if (!reduced) {
        // standing still: sit, then chill or nap if nothing happens
        if (!st.resting) {
          st.resting = { since: st.t, pick: Math.random() };
          play("Idle", 0.4);
        } else if (st.t - st.resting.since > 2.5) {
          play(st.t - st.resting.since > 25 ? "Sleep" : st.resting.pick < 0.6 ? "Sit" : "Chill", 0.6);
        }
      } else play("Idle", 0.4);
    }
    // stride matches the ground speed so the paws don't skate
    if (st.curName === "Walk") st.cur?.setEffectiveTimeScale(THREE.MathUtils.clamp(st.speed / 0.035, 0.6, 1.6));
    if (st.curName === "Run") st.cur?.setEffectiveTimeScale(THREE.MathUtils.clamp(st.speed / 0.22, 0.8, 1.5));
    const dy = wrap(st.face - heading.rotation.y);
    heading.rotation.y += dy * Math.min(1, dt * (st.speed > 0.11 ? 9 : 5));
    mixer.update(dt);
  }

  return {
    root: stand,
    hit,
    update,
    /** "auto" while idle-spinning, "travel" while flying to a place, "watch" at a hologram. */
    setMode(m, faceRight = true) {
      st.mode = m;
      if (m === "watch") st.face = faceRight ? Math.PI / 2 - 0.6 : -Math.PI / 2 + 0.6;
    },
    /** A one-off reaction (tap, arrival). */
    react(name = "Excited", now = performance.now() / 1000) {
      if (!clips[name]) name = "Alert";
      play(name, 0.2, true);
      st.onceUntil = now + dur(name) - 0.2;
      st.resting = null;
    },
    faceCamera() {
      st.face = 0.25;
    },
    /** Walks across the planet to world direction `dir` (unit), then calls done. */
    walkTo(dir, done) {
      const to = dir.clone().normalize();
      const ang = here.angleTo(to);
      if (reduced || ang < 0.01) {
        here.copy(to);
        stand.position.copy(to).multiplyScalar(radius);
        stand.quaternion.setFromUnitVectors(UP, to);
        walk = null;
        done?.();
        return;
      }
      st.onceUntil = 0;
      st.resting = null;
      walk = { from: here.clone(), to, ang, t: 0, done };
    },
    get walking() {
      return !!walk;
    },
  };
}
