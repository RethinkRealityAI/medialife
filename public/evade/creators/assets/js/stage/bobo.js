/**
 * Bobo the cat, the hero of Cola Run, patrolling the floor in front of the
 * wardrobe. Same model and approach as the activated-retail display
 * (/roblox/activated-retail: catbobo.glb, SkeletonUtils.clone, clips merged by
 * name, crossFade between them). The extra clips (Idle, Run, Alert, Purr) come
 * from bobo-clips.glb, an animation-only copy of the retail page's catrun.glb
 * (same rig, meshes and textures stripped: ~54 KB instead of ~313 KB).
 *
 * Clips: Walk, Run, Sit, Chill, Idle, Sleep, Alert, Purr, Excited.
 */
import * as THREE from "three";
// the vendored r180 addons ship without SkeletonUtils; this copy only imports "three"
import * as SkeletonUtils from "/vendor/three@0.170.0/jsm/utils/SkeletonUtils.js";
import { radialCanvas } from "/merch-shelf/art.js";

const MODEL = "/roblox/activated-retail/models/catbobo.glb";
const CLIPS = "/evade/creators/assets/models/bobo-clips.glb";

export const BOBO_HEIGHT = 0.36;
const WALK = 0.2; // m/s at BOBO_HEIGHT
const RUN = 0.72;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a, b) => a + Math.random() * (b - a);

/**
 * @param {{loader:any, scene:THREE.Scene, bounds:{x0:number,x1:number,z0:number,z1:number}, home:THREE.Vector3, camera:THREE.Camera, reduced:boolean}} o
 */
export async function loadBobo({ loader, scene, bounds, home, camera, reduced, onBytes }) {
  const [a, extra] = await Promise.all([
    loader.loadAsync(MODEL, (e) => onBytes?.("bobo", e.loaded, e.total)),
    loader.loadAsync(CLIPS).catch(() => null),
  ]);
  const inner = SkeletonUtils.clone(a.scene);
  const root = new THREE.Group();
  root.name = "bobo";
  root.add(inner);
  inner.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      if (o.material) o.material.envMapIntensity = 0.6;
    }
  });
  const b = new THREE.Box3().setFromObject(inner);
  const sc = BOBO_HEIGHT / (b.max.y - b.min.y);
  inner.scale.setScalar(sc);
  inner.position.y = -b.min.y * sc;

  // contact shadow + a faint cyan footprint glow, like the splash's rings
  const shTex = new THREE.CanvasTexture(
    radialCanvas([
      [0, "rgba(0,0,0,0.7)"],
      [0.5, "rgba(0,0,0,0.3)"],
      [1, "rgba(0,0,0,0)"],
    ]),
  );
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.42),
    new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  shadow.renderOrder = 3;
  root.add(shadow);

  // generous tap target (a skinned mesh is a small, moving target on a phone)
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, BOBO_HEIGHT * 1.05, 0.42),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = BOBO_HEIGHT / 2;
  hit.userData.bobo = true;
  root.add(hit);

  const mixer = new THREE.AnimationMixer(inner);
  const clips = {};
  for (const c of [...(a.animations || []), ...(extra?.animations || [])]) clips[c.name] ||= c;
  const actions = {};
  const act = (n) => (clips[n] ? (actions[n] ||= mixer.clipAction(clips[n])) : null);

  scene.add(root);

  const st = {
    state: "sit",
    t: 2,
    cur: null,
    target: null,
    speed: WALK,
    faceTo: null,
    focusPoint: null,
    onceCb: null,
  };

  function play(name, fade = 0.35, once = false) {
    const x = act(name) || act("Idle") || act("Sit");
    if (!x) return null;
    if (st.cur === x && !once) return x;
    x.reset();
    x.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    x.clampWhenFinished = once;
    x.enabled = true;
    x.setEffectiveTimeScale(1);
    x.setEffectiveWeight(1);
    x.play();
    if (st.cur && st.cur !== x) st.cur.crossFadeTo(x, fade, false);
    st.cur = x;
    return x;
  }
  const dur = (n) => clips[n]?.duration || 2;

  const faceCamera = () =>
    Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);

  function pickTarget() {
    // a third of the time head for the glow ring in front of the hero bay
    if (Math.random() < 0.33) return home.clone();
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Vector3(rand(bounds.x0, bounds.x1), 0, rand(bounds.z0, bounds.z1));
      if (p.distanceTo(root.position) > 0.45) return p;
    }
    return new THREE.Vector3(rand(bounds.x0, bounds.x1), 0, rand(bounds.z0, bounds.z1));
  }

  function rest(atHome) {
    st.target = null;
    st.faceTo = faceCamera() + rand(-0.4, 0.4);
    const r = Math.random();
    if (atHome && r < 0.2 && !reduced) {
      st.state = "sleep";
      st.t = rand(7, 10);
      play("Sleep", 0.5);
    } else if (r < 0.5) {
      st.state = "sit";
      st.t = rand(4, 7);
      play("Sit", 0.4);
    } else if (r < 0.72) {
      st.state = "chill";
      st.t = rand(3.5, 6);
      play("Chill", 0.4);
    } else if (r < 0.88) {
      st.state = "idle";
      st.t = rand(2.5, 4.5);
      play("Idle", 0.35);
    } else {
      st.state = "purr";
      st.t = rand(3, 5);
      play("Purr", 0.35);
    }
  }

  function go() {
    st.target = pickTarget();
    const far = st.target.distanceTo(root.position) > 1.1;
    const run = !reduced && far && Math.random() < 0.55;
    st.speed = run ? RUN : WALK;
    st.state = "walk";
    st.faceTo = null;
    play(run ? "Run" : "Walk", 0.3);
  }

  function once(name, fade, then, faceTo) {
    st.state = "once";
    st.target = null;
    st.faceTo = faceTo ?? faceCamera();
    play(name, fade, true);
    st.t = dur(name) - 0.15;
    st.onceCb = then;
  }

  // start on the ring, sitting, facing the camera
  root.position.copy(home).add(new THREE.Vector3(-0.55, 0, 0.02));
  root.rotation.y = faceCamera();
  play("Sit", 0.01);
  st.state = "sit";
  st.t = 2.5;

  function update(dt) {
    mixer.update(dt);
    st.t -= dt;
    if (st.state === "walk" && st.target) {
      const d = st.target.clone().sub(root.position);
      d.y = 0;
      const L = d.length();
      const want = Math.atan2(d.x, d.z);
      const dy = wrapAngle(want - root.rotation.y);
      root.rotation.y += dy * Math.min(1, dt * (st.speed > WALK ? 7 : 4.5));
      // slow down while turning hard, so he doesn't moonwalk sideways
      const sp = st.speed * dt * (Math.abs(dy) > 1 ? 0.35 : 1);
      if (L <= Math.max(sp, 0.01)) {
        root.position.copy(st.target);
        const arrive = st.arrive;
        st.arrive = null;
        if (arrive) arrive();
        else rest(st.target.distanceTo(home) < 0.05);
      } else root.position.addScaledVector(d.normalize(), sp);
    } else {
      if (st.faceTo !== null) {
        const dy = wrapAngle(st.faceTo - root.rotation.y);
        root.rotation.y += dy * Math.min(1, dt * 3);
      }
      if (st.t <= 0) {
        if (st.state === "once") {
          const cb = st.onceCb;
          st.onceCb = null;
          if (cb) cb();
          else rest(false);
        } else if (st.focusPoint) {
          st.state = "watch";
          st.t = 4;
          play(Math.random() < 0.5 ? "Sit" : "Idle", 0.4);
        } else go();
      }
    }
  }

  return {
    root,
    hit,
    clips: Object.keys(clips),
    update,
    /** Tapped: Excited, then a purr. */
    tap() {
      st.arrive = null;
      once("Excited", 0.2, () => {
        st.state = "purr";
        st.t = 2.6;
        play("Purr", 0.3);
      });
    },
    /** A product was picked: look up at it (Alert), then sit and watch. */
    watch(point) {
      st.focusPoint = point ? point.clone() : null;
      if (!point) {
        st.arrive = null;
        if (st.state === "watch") st.t = 0.5;
        return;
      }
      const lookUp = () => {
        const face = Math.atan2(point.x - root.position.x, point.z - root.position.z);
        // only turn partly away from the camera: he's still the show
        const mid = faceCamera() + wrapAngle(face - faceCamera()) * 0.75;
        once("Alert", 0.25, () => {
          st.state = "watch";
          st.t = 5;
          st.faceTo = mid;
          play("Sit", 0.4);
        }, mid);
      };
      // right under the product he'd block the view: trot to one side first
      if (Math.abs(root.position.x - point.x) < 0.55) {
        const side = root.position.x >= point.x ? 1 : -1;
        let x = point.x + side * 0.8;
        if (x > bounds.x1 || x < bounds.x0) x = point.x - side * 0.8;
        st.target = new THREE.Vector3(THREE.MathUtils.clamp(x, bounds.x0, bounds.x1), 0, bounds.z0 + 0.12);
        st.speed = reduced ? WALK : RUN;
        st.state = "walk";
        st.faceTo = null;
        st.arrive = lookUp;
        play(reduced ? "Walk" : "Run", 0.25);
      } else lookUp();
    },
    get walking() {
      return st.state === "walk";
    },
    get state() {
      return st.state;
    },
    /** For tests: start a walk now. */
    walkNow() {
      st.focusPoint = null;
      st.arrive = null;
      go();
    },
  };
}
