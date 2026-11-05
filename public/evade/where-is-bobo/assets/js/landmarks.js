/**
 * Cartoon 3D landmarks that pop out of the globe when a sighting's venue is a
 * famous place ("Golden Gate Bridge" in the Media Library's venue field).
 *
 * Built from primitives in code (no downloaded or generated models), toon
 * shaded to match the planet. Each builder returns a group whose base sits on
 * y = 0 and whose height is about 1 unit; the caller scales and places it.
 */
import * as THREE from "three";

/* ── materials ────────────────────────────────────────────────────────────── */

let gradient = null;
function toon(color, opts = {}) {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts });
}

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
};

/** A dark, slightly larger back-face copy: the cartoon ink outline. */
function outline(group, thickness = 0.012) {
  const ink = new THREE.MeshBasicMaterial({ color: 0x0a1a24, side: THREE.BackSide });
  const shells = [];
  group.traverse((o) => {
    if (!o.isMesh || o.userData.noInk) return;
    const s = new THREE.Mesh(o.geometry, ink);
    s.userData.noInk = true;
    o.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    o.geometry.boundingBox.getSize(size);
    s.scale.set(1 + thickness / Math.max(size.x, 1e-3), 1 + thickness / Math.max(size.y, 1e-3), 1 + thickness / Math.max(size.z, 1e-3));
    shells.push([o, s]);
  });
  for (const [o, s] of shells) o.add(s);
  return group;
}

/* ── builders ─────────────────────────────────────────────────────────────── */

function goldenGate() {
  const g = new THREE.Group();
  const orange = toon("#e4472b");
  const dark = toon("#a8301d");
  const H = 1; // tower height
  const towerX = 0.62;
  const deckY = 0.26;
  const half = 1.25; // half the length
  // deck and its truss
  g.add(box(half * 2, 0.045, 0.16, orange, 0, deckY, 0));
  g.add(box(half * 2, 0.05, 0.12, dark, 0, deckY - 0.045, 0));
  // towers: two legs, portal struts, a stepped top
  for (const sx of [-1, 1]) {
    const x = sx * towerX;
    for (const sz of [-1, 1]) {
      g.add(box(0.07, H, 0.05, orange, x, H / 2, sz * 0.075));
      g.add(box(0.075, 0.06, 0.055, dark, x, H * 0.55, sz * 0.075));
    }
    for (const y of [0.42, 0.62, 0.8, 0.97]) g.add(box(0.06, 0.05, 0.2, orange, x, y, 0));
    g.add(box(0.14, 0.12, 0.22, toon("#7d8a93"), x, 0.02, 0)); // pier
  }
  // main cables (catenaries over the towers) and suspenders
  const cable = toon("#c93a24");
  for (const sz of [-1, 1]) {
    const z = sz * 0.075;
    const pts = [];
    const top = H * 0.96;
    const sag = deckY + 0.06;
    for (let i = 0; i <= 60; i++) {
      const x = -half + (i / 60) * half * 2;
      let y;
      if (Math.abs(x) <= towerX) {
        const t = x / towerX;
        y = sag + (top - sag) * t * t;
      } else {
        const t = (Math.abs(x) - towerX) / (half - towerX);
        y = top - (top - deckY - 0.02) * Math.pow(t, 0.8);
      }
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.012, 6, false), cable);
    tube.userData.noInk = true;
    g.add(tube);
    for (let x = -half + 0.08; x < half; x += 0.085) {
      const p = pts.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
      const h = p.y - deckY;
      if (h < 0.03) continue;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, h, 4), cable);
      s.position.set(x, deckY + h / 2, z);
      s.userData.noInk = true;
      g.add(s);
    }
  }
  return outline(g);
}

function eiffelTower() {
  const g = new THREE.Group();
  const iron = toon("#9a6a3f");
  const light = toon("#c08a52");
  // four splayed legs up to the first platform
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.42, 4), iron);
    leg.position.set(sx * 0.17, 0.2, sz * 0.17);
    leg.rotation.set(sz * 0.42, 0, -sx * 0.42);
    g.add(leg);
  }
  g.add(box(0.36, 0.05, 0.36, light, 0, 0.4, 0));
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.15, 0.3, 4), iron);
  mid.position.y = 0.57;
  mid.rotation.y = Math.PI / 4;
  g.add(mid, box(0.2, 0.04, 0.2, light, 0, 0.72, 0));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.07, 0.26, 4), iron);
  top.position.y = 0.86;
  top.rotation.y = Math.PI / 4;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 0.1, 6), light);
  tip.position.y = 1.03;
  g.add(top, tip);
  return outline(g);
}

function bigBen() {
  const g = new THREE.Group();
  const stone = toon("#d9b77a");
  const roof = toon("#3f5a52");
  const face = toon("#fff8e6");
  g.add(box(0.22, 0.62, 0.22, stone, 0, 0.31, 0));
  g.add(box(0.26, 0.2, 0.26, stone, 0, 0.72, 0));
  for (const [x, z, ry] of [[0, 0.131, 0], [0, -0.131, Math.PI], [0.131, 0, Math.PI / 2], [-0.131, 0, -Math.PI / 2]]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), face);
    c.position.set(x, 0.72, z);
    c.rotation.y = ry;
    c.userData.noInk = true;
    const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.06), toon("#1d1d1d"));
    hand.position.set(0, 0.02, 0.001);
    hand.userData.noInk = true;
    c.add(hand);
    g.add(c);
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.26, 4), roof);
  spire.position.y = 0.95;
  spire.rotation.y = Math.PI / 4;
  g.add(spire);
  return outline(g);
}

function tokyoTower() {
  const g = new THREE.Group();
  const red = toon("#ef4a2d");
  const white = toon("#f4f1ea");
  const bands = [
    [0.0, 0.2, 0.2, 0.13, red],
    [0.2, 0.36, 0.13, 0.095, white],
    [0.36, 0.5, 0.095, 0.07, red],
    [0.5, 0.64, 0.07, 0.05, white],
    [0.64, 0.78, 0.05, 0.03, red],
    [0.78, 0.9, 0.03, 0.015, white],
  ];
  for (const [y0, y1, r0, r1, m] of bands) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 4), m);
    seg.position.y = (y0 + y1) / 2;
    seg.rotation.y = Math.PI / 4;
    g.add(seg);
  }
  g.add(box(0.2, 0.05, 0.2, white, 0, 0.36, 0), box(0.12, 0.04, 0.12, white, 0, 0.64, 0));
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.01, 0.12, 6), red);
  tip.position.y = 0.96;
  g.add(tip);
  return outline(g);
}

function operaHouse() {
  const g = new THREE.Group();
  const shell = toon("#f7f4ec");
  const base = toon("#c9a27a");
  g.add(box(0.9, 0.08, 0.38, base, 0, 0.04, 0));
  const sizes = [0.42, 0.34, 0.26, 0.18];
  sizes.forEach((r, i) => {
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI, 0, Math.PI / 2), shell);
      s.scale.set(0.55, 1, 0.5);
      s.rotation.set(0, side > 0 ? 0 : Math.PI, -0.35 * side);
      s.position.set(-0.28 + i * 0.2, 0.08, side * 0.06);
      if (side > 0 || i % 2 === 0) g.add(s);
    }
  });
  return outline(g);
}

function liberty() {
  const g = new THREE.Group();
  const copper = toon("#7cc6a8");
  const stone = toon("#c9b28a");
  g.add(box(0.26, 0.32, 0.26, stone, 0, 0.16, 0), box(0.18, 0.1, 0.18, stone, 0, 0.37, 0));
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.36, 10), copper);
  robe.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), copper);
  head.position.y = 0.82;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.2, 6), copper);
  arm.position.set(0.06, 0.88, 0);
  arm.rotation.z = -0.25;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 8), toon("#ffc23d", { emissive: "#ff9a1f", emissiveIntensity: 0.6 }));
  flame.position.set(0.09, 1.0, 0);
  g.add(robe, head, arm, flame);
  for (let i = 0; i < 5; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 4), copper);
    const a = -0.9 + i * 0.45;
    spike.position.set(Math.sin(a) * 0.045, 0.86 + Math.cos(a) * 0.035, 0);
    spike.rotation.z = -a;
    spike.userData.noInk = true;
    g.add(spike);
  }
  return outline(g);
}


function cnTower() {
  const g = new THREE.Group();
  const concrete = toon("#e3ded5");
  const shade = toon("#bdb6ab");
  const pod = toon("#8d97a2");
  const glass = toon("#5fd6ff", { emissive: "#1aa8ff", emissiveIntensity: 0.55 });
  const red = toon("#e8452f");
  // the Y-shaped base: three fins around a tapering core
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.065, 0.62, 12), concrete);
  core.position.y = 0.31;
  g.add(core);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.05, 0.5, 4), shade);
    fin.scale.set(1, 1, 0.45);
    fin.position.set(Math.cos(a) * 0.05, 0.25, Math.sin(a) * 0.05);
    fin.rotation.y = -a;
    g.add(fin);
  }
  // the main pod: a fat doughnut with a glowing window band and the glass floor
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.08, 0.05, 24), pod);
  lower.position.y = 0.62;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.035, 24), glass);
  band.position.y = 0.66;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, 0.045, 24), pod);
  upper.position.y = 0.7;
  g.add(lower, band, upper);
  // the shaft carries on to the SkyPod
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.14, 10), concrete);
  shaft.position.y = 0.79;
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16), glass);
  sky.position.y = 0.87;
  g.add(shaft, sky);
  // antenna, red and white
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.006 - i * 0.001, 0.008 - i * 0.001, 0.035, 6), i % 2 ? concrete : red);
    seg.position.y = 0.9 + i * 0.035;
    seg.userData.noInk = true;
    g.add(seg);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), toon("#ff5a4a", { emissive: "#ff2a1a", emissiveIntensity: 1 }));
  beacon.position.y = 1.04;
  beacon.userData.noInk = true;
  g.add(beacon);
  return outline(g);
}

/** Moving water: a striped canvas texture that scrolls down. */
function waterTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const x = c.getContext("2d");
  const grad = x.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#7fe3ff");
  grad.addColorStop(1, "#d8f7ff");
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 128);
  x.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 26; i++) x.fillRect((i * 37) % 64, (i * 53) % 128, 2 + (i % 3), 18 + (i % 5) * 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function niagaraFalls() {
  const g = new THREE.Group();
  const rock = toon("#6d8a4e");
  const cliff = toon("#8a6d4f");
  const river = toon("#4fc3e8");
  const water = waterTexture();
  // the Horseshoe: a curved cliff with water pouring over its lip
  const R = 0.42;
  const arc = Math.PI * 0.95;
  // centred on the back (theta = PI is -z): the horseshoe opens towards the camera
  const start = Math.PI - arc / 2;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.34, 32, 1, true, start, arc), cliff);
  wall.material = cliff.clone();
  wall.material.side = THREE.DoubleSide;
  wall.position.y = 0.17;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 0.06, 32, 1, false, start, arc), rock);
  top.position.y = 0.34;
  const curtain = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.012, R - 0.04, 0.33, 32, 1, true, start, arc),
    new THREE.MeshBasicMaterial({ map: water, transparent: true, opacity: 0.94, side: THREE.DoubleSide }),
  );
  curtain.position.y = 0.17;
  curtain.userData.noInk = true;
  // the river below and the mist
  const pool = new THREE.Mesh(new THREE.CircleGeometry(R + 0.14, 32), river);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.005;
  pool.userData.noInk = true;
  g.add(wall, top, curtain, pool);
  const mistMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.42, depthWrite: false });
  const mist = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.07 + (i % 3) * 0.025, 10, 8), mistMat);
    const a = start + ((i + 0.5) / 7) * arc;
    m.position.set(Math.sin(a) * (R - 0.12), 0.05 + (i % 2) * 0.04, Math.cos(a) * (R - 0.12));
    m.userData.noInk = true;
    m.userData.base = m.position.y;
    mist.push(m);
    g.add(m);
  }
  // and the rainbow, because there always is one
  const rainbow = new THREE.Group();
  ["#ff4d4d", "#ffa63d", "#ffe14d", "#57d977", "#4db8ff", "#9d6bff"].forEach((col, i) => {
    const t = new THREE.Mesh(
      new THREE.TorusGeometry(0.26 - i * 0.014, 0.0075, 6, 40, Math.PI),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.62, depthWrite: false }),
    );
    t.userData.noInk = true;
    rainbow.add(t);
  });
  // off to one side, in the spray, so the falls stay the star
  rainbow.position.set(0.22, 0.02, 0.3);
  rainbow.rotation.y = -0.35;
  g.add(rainbow);
  outline(g);
  g.userData.tick = (time) => {
    water.offset.y = (time * 0.9) % 1;
    mist.forEach((m, i) => {
      m.position.y = m.userData.base + Math.sin(time * 1.3 + i) * 0.015;
      m.scale.setScalar(1 + Math.sin(time * 0.9 + i * 1.7) * 0.08);
    });
  };
  return g;
}

/** Toronto: the CN Tower, with Niagara Falls (and its rainbow) just down the road. */
function toronto() {
  const g = new THREE.Group();
  const tower = cnTower();
  tower.position.x = -0.3;
  const falls = niagaraFalls();
  falls.scale.setScalar(0.7);
  falls.position.set(0.3, 0, 0.08);
  g.add(tower, falls);
  g.userData.tick = (time) => falls.userData.tick?.(time);
  return g;
}

/**
 * Venue text (the Media Library's venue field) → builder; `city` is the
 * fallback when a sighting has no famous venue, so every clip from Toronto
 * gets the CN Tower and the Falls. `wide` scales it down to fit.
 */
const CATALOG = [
  { id: "toronto", re: null, city: /^toronto$/i, build: toronto },
  { id: "cn", re: /cn\s*tower/i, city: null, build: cnTower },
  { id: "niagara", re: /niagara/i, city: /^niagara(\s*falls)?$/i, build: niagaraFalls, wide: true },
  { id: "golden-gate", re: /golden\s*gate/i, city: /^san\s*francisco$/i, build: goldenGate, wide: true },
  { id: "eiffel", re: /eiffel/i, city: /^paris$/i, build: eiffelTower },
  { id: "big-ben", re: /big\s*ben|elizabeth\s*tower|westminster/i, city: /^london$/i, build: bigBen },
  { id: "tokyo", re: /tokyo\s*tower/i, city: /^tokyo$/i, build: tokyoTower },
  { id: "opera", re: /opera\s*house/i, city: /^sydney$/i, build: operaHouse, wide: true },
  { id: "liberty", re: /statue\s*of\s*liberty|liberty\s*island/i, city: /^new\s*york(\s*city)?$/i, build: liberty },
];

export function landmarkFor(place, city = "") {
  if (place) {
    const hit = CATALOG.find((c) => c.re?.test(place));
    if (hit) return hit;
  }
  const c = (city || "").trim();
  return c ? (CATALOG.find((x) => x.city?.test(c)) ?? null) : null;
}

/* ── the pop-up ───────────────────────────────────────────────────────────── */

/**
 * @param {THREE.Object3D} globe  the rotating globe group (landmarks ride on it)
 * @param {{reduced:boolean}} opts
 */
export function createLandmarks(globe, { reduced }) {
  const cache = new Map();
  let current = null; // { obj, t, out, size }
  const leaving = [];

  const m = new THREE.Matrix4();

  /**
   * Shows the landmark for `place` (or, failing that, `city`) standing at world direction `dir` (unit)
   * on a sphere of radius `r`, `size` tall, facing the camera.
   */
  function show(place, city, dir, r, size, camera) {
    const entry = landmarkFor(place, city);
    const key = entry ? entry.id : null;
    if (current?.key === key) return false;
    hide();
    if (!entry) return false;
    let obj = cache.get(key);
    // the same landmark may still be shrinking away from a moment ago: take it back
    if (obj) {
      const i = leaving.findIndex((l) => l.obj === obj);
      if (i >= 0) leaving.splice(i, 1);
    }
    if (!obj) {
      obj = new THREE.Group();
      obj.add(entry.build());
      cache.set(key, obj);
    }
    // basis: up = surface normal, x = the camera's right projected onto the ground
    // stand mostly upright on screen, leaning only a little with the curve
    const up = dir.clone().normalize();
    const stand = up.clone().lerp(new THREE.Vector3(0, 1, 0), 0.6).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.addScaledVector(stand, -right.dot(stand)).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, stand);
    m.makeBasis(right, stand, fwd);
    const worldQ = new THREE.Quaternion().setFromRotationMatrix(m);
    globe.updateMatrixWorld();
    const inv = globe.quaternion.clone().invert();
    obj.quaternion.copy(inv).multiply(worldQ);
    obj.position.copy(up).multiplyScalar(r).applyQuaternion(inv);
    obj.userData.size = entry.wide ? size * 0.62 : size;
    obj.scale.setScalar(1e-3);
    globe.add(obj);
    current = { key, obj, t: reduced ? 1 : 0 };
    return true;
  }

  function hide() {
    if (!current) return;
    leaving.push({ obj: current.obj, t: 1 });
    current = null;
  }

  // a springy pop: overshoot, then settle (easeOutBack)
  const pop = (t) => {
    const c1 = 2.2;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  function update(dt, time) {
    if (current) {
      current.t = Math.min(1, current.t + dt / 0.75);
      const k = reduced ? 1 : Math.max(0.001, pop(current.t));
      const s = current.obj.userData.size * k;
      current.obj.scale.setScalar(s);
      // a gentle idle bob so it feels alive
      const inner = current.obj.children[0];
      inner.rotation.y = Math.sin(time * 0.6) * 0.05;
      inner.userData.tick?.(time);
    }
    for (let i = leaving.length - 1; i >= 0; i--) {
      const l = leaving[i];
      l.t -= dt / 0.3;
      if (l.t <= 0) {
        globe.remove(l.obj);
        leaving.splice(i, 1);
      } else l.obj.scale.setScalar(l.obj.userData.size * l.t * l.t);
    }
  }

  return { show, hide, update, get active() { return !!current; } };
}
