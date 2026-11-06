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
  const dark = toon("#a32d1b");
  const road = toon("#59606a");
  const H = 1; // tower height
  const towerX = 0.62;
  const deckY = 0.26;
  const half = 1.3; // half the length
  // deck: a road on an orange stiffening truss
  g.add(box(half * 2, 0.02, 0.17, road, 0, deckY + 0.01, 0));
  g.add(box(half * 2, 0.06, 0.15, orange, 0, deckY - 0.03, 0));
  for (let x = -half + 0.05; x < half; x += 0.1) g.add(box(0.012, 0.055, 0.155, dark, x, deckY - 0.03, 0));
  // art-deco towers: two legs that step in as they rise, joined by portal struts
  for (const sx of [-1, 1]) {
    const x = sx * towerX;
    const tiers = [
      [0, 0.38, 0.085],
      [0.38, 0.66, 0.072],
      [0.66, 0.86, 0.062],
      [0.86, H, 0.052],
    ];
    for (const sz of [-1, 1]) {
      for (const [y0, y1, w] of tiers) g.add(box(w, y1 - y0, w * 0.75, orange, x, (y0 + y1) / 2, sz * 0.085));
      // recessed vertical panel lines
      g.add(box(0.012, H * 0.9, 0.066, dark, x, H * 0.47, sz * 0.085));
    }
    for (const [y, h] of [[0.44, 0.05], [0.66, 0.06], [0.84, 0.055], [0.985, 0.04]]) {
      g.add(box(0.06, h, 0.24, orange, x, y, 0));
      g.add(box(0.064, h * 0.35, 0.2, dark, x, y, 0));
    }
    g.add(box(0.18, 0.1, 0.28, toon("#8a949c"), x, 0.03, 0)); // pier
  }
  // anchorages and the headlands at each end
  for (const sx of [-1, 1]) {
    g.add(box(0.16, 0.16, 0.22, toon("#a7adb2"), sx * (half - 0.04), deckY - 0.06, 0));
    const hill = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon("#6f9a4c"));
    hill.scale.set(1, 0.6, 0.8);
    hill.position.set(sx * (half + 0.12), 0, 0);
    g.add(hill);
  }
  // main cables (catenaries over the towers) and suspenders
  const cable = toon("#d4442a");
  for (const sz of [-1, 1]) {
    const z = sz * 0.085;
    const pts = [];
    const top = H * 0.97;
    const sag = deckY + 0.05;
    for (let i = 0; i <= 80; i++) {
      const x = -half + (i / 80) * half * 2;
      let y;
      if (Math.abs(x) <= towerX) {
        const t = x / towerX;
        y = sag + (top - sag) * t * t;
      } else {
        const t = (Math.abs(x) - towerX) / (half - towerX);
        y = top - (top - deckY - 0.02) * Math.pow(t, 0.75);
      }
      pts.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 100, 0.014, 6, false), cable);
    tube.userData.noInk = true;
    g.add(tube);
    for (let x = -half + 0.08; x < half - 0.05; x += 0.06) {
      const p = pts.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
      const h = p.y - deckY;
      if (h < 0.03) continue;
      const sus = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, h, 4), cable);
      sus.position.set(x, deckY + h / 2, z);
      sus.userData.noInk = true;
      g.add(sus);
    }
  }
  // the bay beneath
  const bay = new THREE.Mesh(new THREE.CircleGeometry(1, 40), toon("#3fb6e0"));
  bay.scale.set(half + 0.1, 0.45, 1);
  bay.rotation.x = -Math.PI / 2;
  bay.position.y = 0.004;
  bay.userData.noInk = true;
  g.add(bay);
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
  const concrete = toon("#ece7de");
  const shade = toon("#c4bcb0");
  const pod = toon("#7f8a95");
  const podTop = toon("#d9d5ce");
  const glass = toon("#ffd36a", { emissive: "#ffb020", emissiveIntensity: 0.55 });
  const red = toon("#e8452f");
  // a little plaza it stands on
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 24), toon("#9aa3ab"));
  plaza.position.y = 0.015;
  g.add(plaza);
  // the hexagonal core, slim and tall: the main pod sits at 62% of the height
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.05, 0.62, 6), concrete);
  core.position.y = 0.31;
  g.add(core);
  // three legs of the Y that flare out at the bottom and fade into the core
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.042, 0.44, 4), shade);
    leg.scale.set(1, 1, 0.42);
    leg.position.set(Math.cos(a) * 0.055, 0.22, Math.sin(a) * 0.055);
    leg.rotation.y = -a;
    leg.rotation.z = Math.cos(a) * 0.08;
    leg.rotation.x = -Math.sin(a) * 0.08;
    g.add(leg);
  }
  // the main pod: grey turret below, a glowing window ring, white observation decks above
  const under = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.05, 0.06, 28), pod);
  under.position.y = 0.6;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.022, 10, 36), pod);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.64;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.028, 32), glass);
  band.position.y = 0.665;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.128, 0.03, 32), podTop);
  deck.position.y = 0.693;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.025, 28), pod);
  cap.position.y = 0.72;
  g.add(under, ring, band, deck, cap);
  // the shaft carries on to the SkyPod (81%)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.11, 6), concrete);
  shaft.position.y = 0.785;
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.026, 18), pod);
  sky.position.y = 0.85;
  const skyGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.012, 18), glass);
  skyGlass.position.y = 0.86;
  g.add(shaft, sky, skyGlass);
  // antenna, red and white
  for (let i = 0; i < 5; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.0055 - i * 0.0008, 0.0075 - i * 0.0008, 0.03, 6), i % 2 ? concrete : red);
    seg.position.y = 0.885 + i * 0.03;
    seg.userData.noInk = true;
    g.add(seg);
  }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), toon("#ff5a4a", { emissive: "#ff2a1a", emissiveIntensity: 1 }));
  beacon.position.y = 1.04;
  beacon.userData.noInk = true;
  beacon.userData.blink = true;
  g.add(beacon);
  outline(g);
  g.userData.tick = (time) => {
    beacon.material.emissiveIntensity = 0.4 + 0.8 * (Math.sin(time * 3) > 0 ? 1 : 0);
  };
  return g;
}

/** Moving water: a striped canvas texture that scrolls down. */
function waterTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const x = c.getContext("2d");
  const grad = x.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#3fb9ec");
  grad.addColorStop(1, "#e6faff");
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

/** A flat horseshoe band between radii r0..r1 (angles as CylinderGeometry: x = r sin a, z = r cos a). */
function arcSlab(r0, r1, a0, len, depth) {
  const sh = new THREE.Shape();
  const n = 32;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (len * i) / n;
    const p = [r1 * Math.sin(a), -r1 * Math.cos(a)];
    if (i === 0) sh.moveTo(...p);
    else sh.lineTo(...p);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + (len * i) / n;
    sh.lineTo(r0 * Math.sin(a), -r0 * Math.cos(a));
  }
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function niagaraFalls() {
  const g = new THREE.Group();
  const grass = toon("#6fae4a");
  const cliff = toon("#8a6d4f");
  const cliffDark = toon("#6b523b");
  const river = toon("#3fb6e0");
  const foam = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false });
  const water = waterTexture();
  // the Horseshoe: a curved cliff with water pouring over its lip, opening towards the camera
  const R = 0.42;
  const arc = Math.PI * 0.95;
  const start = Math.PI - arc / 2;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.02, 0.36, 40, 1, true, start, arc), cliff.clone());
  wall.material.side = THREE.DoubleSide;
  wall.position.y = 0.18;
  // the land above: the river comes in from behind and spills over the lip
  const top = new THREE.Mesh(arcSlab(R, R + 0.24, start - 0.12, arc + 0.24, 0.06), grass);
  top.position.y = 0.33;
  // the river above the lip, running into the curtain
  const upstream = new THREE.Mesh(arcSlab(R - 0.01, R + 0.14, start + 0.05, arc - 0.1, 0.012), toon("#57c6ef"));
  upstream.position.y = 0.392;
  upstream.userData.noInk = true;
  const curtain = new THREE.Mesh(
    new THREE.CylinderGeometry(R - 0.012, R - 0.05, 0.35, 40, 1, true, start + 0.04, arc - 0.08),
    new THREE.MeshBasicMaterial({ map: water, side: THREE.DoubleSide }),
  );
  curtain.position.y = 0.18;
  curtain.userData.noInk = true;
  // the gorge: a pool, white foam where the water lands, the river flowing out to the camera
  const pool = new THREE.Mesh(new THREE.CircleGeometry(R + 0.16, 40), river);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.006;
  pool.userData.noInk = true;
  const outflow = box(0.36, 0.008, 0.3, river, 0, 0.006, R + 0.18);
  outflow.userData.noInk = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 0.07, 0.035, 8, 40, arc - 0.1), foam);
  ring.rotation.x = Math.PI / 2;
  ring.rotation.z = start + 0.05 - Math.PI / 2;
  ring.position.y = 0.02;
  ring.userData.noInk = true;
  g.add(wall, top, upstream, curtain, pool, outflow, ring);
  // spray rising off the plunge
  const mistMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5, depthWrite: false });
  const mist = [];
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.03, 10, 8), mistMat);
    const a = start + ((i + 0.5) / 9) * arc;
    m.position.set(Math.sin(a) * (R - 0.12), 0.06 + (i % 2) * 0.05, Math.cos(a) * (R - 0.12));
    m.userData.noInk = true;
    m.userData.base = m.position.y;
    mist.push(m);
    g.add(m);
  }
  // the Maid of the Mist, nosing towards the falls
  const boat = new THREE.Group();
  const hull = box(0.12, 0.035, 0.05, toon("#2f6fd0"), 0, 0.02, 0);
  const cabin = box(0.07, 0.03, 0.04, toon("#ffffff"), -0.005, 0.05, 0);
  const crowd = box(0.05, 0.012, 0.036, toon("#4fa6ff"), -0.005, 0.071, 0);
  boat.add(hull, cabin, crowd);
  boat.position.set(0.05, 0, R * 0.55);
  boat.rotation.y = 0.5;
  g.add(boat);
  outline(g);
  g.userData.tick = (time) => {
    water.offset.y = (time * 0.9) % 1;
    boat.position.y = Math.sin(time * 2.2) * 0.006;
    boat.rotation.z = Math.sin(time * 1.7) * 0.06;
    mist.forEach((m, i) => {
      m.position.y = m.userData.base + Math.sin(time * 1.3 + i) * 0.02;
      m.scale.setScalar(1 + Math.sin(time * 0.9 + i * 1.7) * 0.1);
    });
  };
  return g;
}

/** San Jose: the Winchester Mystery House (mustard walls, red trim, towers everywhere) under palms. */
function winchesterHouse() {
  const g = new THREE.Group();
  const wall = toon("#e7b548");
  const trim = toon("#b8402c");
  const roof = toon("#6e2f2a");
  const glass = toon("#7fd3e6");
  const white = toon("#fff3dc");
  const lawn = toon("#6fae4a");
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.82, 0.04, 40), lawn);
  base.position.y = 0.02;
  g.add(base);
  g.add(box(0.5, 0.012, 0.36, toon("#d9cdb3"), 0, 0.045, 0.5)); // front path
  // a hip roof: a 4-sided cone squashed to the floor plan
  const hip = (w, d, h, x, y, z) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.71, h, 4), roof);
    m.rotation.y = Math.PI / 4;
    m.scale.set(w, 1, d);
    m.position.set(x, y + h / 2, z);
    return m;
  };
  // ground floor, upper floor, each with a red band and a row of windows
  const floors = [
    [0.04, 0.26, 0.92, 0.42],
    [0.3, 0.22, 0.72, 0.36],
  ];
  for (const [y, h, w, d] of floors) {
    g.add(box(w, h, d, wall, 0, y + h / 2, 0));
    g.add(box(w + 0.02, 0.025, d + 0.02, trim, 0, y + h, 0));
    const n = Math.round(w / 0.16);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      g.add(box(0.06, h * 0.5, 0.01, white, x, y + h * 0.52, d / 2 + 0.004));
      g.add(box(0.044, h * 0.4, 0.012, glass, x, y + h * 0.52, d / 2 + 0.006));
    }
  }
  g.add(hip(0.8, 0.44, 0.2, 0, 0.545, 0));
  // front gable over the porch, with columns
  g.add(box(0.36, 0.02, 0.14, trim, 0, 0.3, 0.27));
  for (const x of [-0.16, 0, 0.16]) g.add(box(0.02, 0.26, 0.02, white, x, 0.17, 0.33));
  const gable = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 3), roof);
  gable.rotation.set(0, Math.PI, 0);
  gable.scale.set(1, 1, 0.5);
  gable.position.set(0, 0.38, 0.27);
  g.add(gable);
  // the towers that made it famous: a round turret, a square tower, a little cupola
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.62, 10), wall);
  turret.position.set(-0.46, 0.35, 0.08);
  const tCap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 10), roof);
  tCap.position.set(-0.46, 0.83, 0.08);
  g.add(turret, tCap, box(0.24, 0.025, 0.24, trim, -0.46, 0.62, 0.08));
  for (const y of [0.24, 0.48]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.112, 0.07, 10, 1, true, -0.5, 1), glass);
    w.position.set(-0.46, y, 0.08);
    g.add(w);
  }
  g.add(box(0.2, 0.5, 0.2, wall, 0.38, 0.55, -0.02), box(0.22, 0.025, 0.22, trim, 0.38, 0.8, -0.02));
  g.add(box(0.07, 0.14, 0.01, glass, 0.38, 0.62, 0.085));
  g.add(hip(0.3, 0.3, 0.26, 0.38, 0.81, -0.02));
  g.add(box(0.1, 0.08, 0.1, wall, -0.05, 0.7, -0.05), hip(0.14, 0.14, 0.12, -0.05, 0.74, -0.05));
  // a spire on each tower
  for (const [x, y, z] of [[-0.46, 1.0, 0.08], [0.38, 1.07, -0.02]]) g.add(box(0.012, 0.08, 0.012, trim, x, y, z));
  // palms (Circle of Palms), leaning out either side
  const palm = (x, z, h, lean) => {
    const p = new THREE.Group();
    const trunk = toon("#9c7448");
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, h / 6, 7), trunk);
      seg.position.set(Math.sin((i / 6) * 1.2) * lean, (h / 6) * (i + 0.5), 0);
      p.add(seg);
    }
    const leaf = toon("#3f9e45");
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), leaf);
      f.scale.set(1, 0.14, 0.32);
      const a = (i / 7) * Math.PI * 2;
      f.position.set(Math.sin(1.2) * lean + Math.cos(a) * 0.12, h - 0.02 - (i % 2) * 0.02, Math.sin(a) * 0.12);
      f.rotation.set(0, -a, (i % 2 ? -0.35 : -0.2));
      p.add(f);
    }
    p.position.set(x, 0.04, z);
    return p;
  };
  g.add(palm(-0.68, 0.32, 0.72, -0.08), palm(0.7, 0.28, 0.62, 0.07), palm(0.62, -0.34, 0.5, 0.05));
  return outline(g);
}

/** Toronto: the CN Tower, with Niagara Falls just down the road. */
function toronto() {
  const g = new THREE.Group();
  const tower = cnTower();
  tower.position.set(-0.34, 0, -0.05);
  tower.scale.setScalar(1.15);
  const falls = niagaraFalls();
  falls.scale.setScalar(0.72);
  falls.position.set(0.4, 0, 0.0);
  falls.rotation.y = -0.15;
  g.add(tower, falls);
  g.userData.tick = (time) => {
    tower.userData.tick?.(time);
    falls.userData.tick?.(time);
  };
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
  { id: "san-jose", re: /winchester/i, city: /^san\s*jos[eé]$/i, build: winchesterHouse, wide: true },
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

