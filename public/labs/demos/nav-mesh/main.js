// Robot Path: a little world on your floor; tap a spot and the robot walks there, staying on the walkable areas
// (from the 8th Wall "nav-mesh" sample, A-Frame -> plain three.js).
//
// Kept from the sample (src/nav-mesh.js, body.html): the environment model (Kenney Platformer Kit pieces) and a
// separate invisible nav mesh built on top of it in Blender; the character's height comes from a ray cast down onto
// the nav mesh every step, so it walks up ramps and over bridges and never leaves the walkable area; the three.js
// robot. Changed: the sample drove the robot with a joystick and the nav mesh only blocked it; here you TAP a spot
// and it finds its own way: the nav mesh is sampled once into a height grid (cells 0.25 world units, neighbours
// joined when the step is under 0.6), A* (8 directions) finds the route, the route is smoothed by skipping
// waypoints while the straight line between them stays on the grid. The world sits on a placed stage (about 1.2 m
// across); Move keeps the robot where it is in it.
import { createDemo, THREE, MEDIA, loadGLB, fitTo, contactShadow } from '../shared/shell.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const WORLD_M = 1.2;           // the world is ~1.2 m across at size 1
const CELL = 0.25, STEP = 0.6; // grid cell and max height step (world units, the sample's model units)
const SPEED = 2.2;             // world units per second
let env, nav, robotG, robotProto, world, robot, mixer, acts = {}, k = 1;
let grid = null, path = [], marker, trail;
const down = new THREE.Vector3(0, -1, 0), rc = new THREE.Raycaster();

const demo = createDemo({
  slug: 'nav-mesh', mode: 'world', tag: 'Nav mesh',
  title: 'Robot Path', titleHtml: 'Robot <span>Path</span>',
  lead: 'Put a little world on your floor and tap where the robot should go. It finds its own way.',
  heroSvg: `<svg class="art" viewBox="0 0 300 300"><path d="M60 220h70l30-50h80" fill="none" stroke="#4fd6e8" stroke-width="10" stroke-dasharray="4 14" stroke-linecap="round"/><circle cx="60" cy="220" r="16" fill="#fff"/><circle cx="240" cy="170" r="12" fill="none" stroke="#fff" stroke-width="6"/></svg>`,
  how: [
    '<b>Find the floor</b>, pinch to size the little world, then tap <b>Place here</b>.',
    '<b>Tap</b> anywhere on the paths, bridges or ramps: the robot walks there by itself.',
    '<b>Move</b> (bottom right) puts the world somewhere else, robot and all.',
  ],
  size: [0.5, 3, 1],
  placeHint: 'Pinch to size it, then tap Place here',
  async load(d) {
    const [e, n, r] = await Promise.all([loadGLB(MEDIA + 'nav-env.glb'), loadGLB(MEDIA + 'nav-mesh.glb'), loadGLB(MEDIA + 'robot.glb')]);
    env = e.scene; nav = n.scene; robotG = r; d.progress(0.9);
  },
  hero() { const g = env.clone(true); return g; },
  build(d) {
    // world units -> metres: the environment is ~17 units across
    const b = new THREE.Box3().setFromObject(env), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    k = WORLD_M / Math.max(s.x, s.z);
    world = new THREE.Group(); world.scale.setScalar(k); world.position.set(-c.x * k, 0, -c.z * k); d.stage.add(world);
    env.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); world.add(env);
    nav.visible = false; world.add(nav); // invisible, but rays still hit it
    d.stage.updateMatrixWorld(true);
    buildGrid();
    // the robot (the sample's 0.25 scale ~ 1.1 units tall)
    robot = new THREE.Group(); world.add(robot);
    const body = robotG.scene; fitTo(body, 1.1); robot.add(body);
    const sh = contactShadow(0.45, 0.4); robot.add(sh);
    mixer = new THREE.AnimationMixer(body);
    for (const n of ['Idle', 'Walking']) { acts[n] = mixer.clipAction(robotG.animations.find((a) => a.name === n)); acts[n].play(); acts[n].weight = n === 'Idle' ? 1 : 0; }
    const start = nearestWalkable(0, 0); robot.position.set(start.x, start.h, start.z);
    // target marker + route dots (flat)
    marker = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 32), new THREE.MeshBasicMaterial({ color: 0x4fd6e8, depthWrite: false, transparent: true }));
    marker.rotation.x = -Math.PI / 2; marker.visible = false; world.add(marker);
    trail = new THREE.InstancedMesh(new THREE.CircleGeometry(0.07, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, transparent: true, opacity: 0.85 }), 200);
    trail.count = 0; trail.frustumCulled = false; world.add(trail);
  },
  onPlaced(d, first) { if (first) { d.hint('Tap where the robot should go'); setTimeout(() => d.hint(''), 3500); } },
  onTap(ndc, d) {
    if (d.state !== 'placed') return false;
    d.rayFrom(ndc);
    // the nav mesh first; else anything in the little world (a tree, a wall): walk to the nearest walkable spot
    const hit = d.raycaster.intersectObject(nav, true)[0] || d.raycaster.intersectObject(env, true)[0];
    if (!hit) { d.toast('Tap the paths, bridges or ramps'); return true; }
    const p = world.worldToLocal(hit.point.clone());
    goTo(p.x, p.z);
    return true;
  },
  update(dt, d, now) {
    if (!robot) return;
    let walking = false;
    if (path.length) {
      const wp = path[0], dx = wp.x - robot.position.x, dz = wp.z - robot.position.z, dist = Math.hypot(dx, dz);
      const stepLen = SPEED * dt;
      if (dist <= stepLen) { robot.position.x = wp.x; robot.position.z = wp.z; path.shift(); drawTrail(); }
      else {
        robot.position.x += dx / dist * stepLen; robot.position.z += dz / dist * stepLen;
        let dy = Math.atan2(dx, dz) - robot.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        robot.rotation.y += dy * (1 - Math.exp(-10 * dt));
      }
      walking = true;
      if (!path.length) marker.visible = false;
    }
    // the sample's constraint: height from a ray cast down onto the nav mesh
    const h = heightAt(robot.position.x, robot.position.z, robot.position.y);
    if (h !== null) robot.position.y += (h - robot.position.y) * (1 - Math.exp(-18 * dt));
    acts.Walking.weight += ((walking ? 1 : 0) - acts.Walking.weight) * (1 - Math.exp(-8 * dt));
    acts.Idle.weight = 1 - acts.Walking.weight;
    if (marker.visible) marker.scale.setScalar(1 + 0.12 * Math.sin(now / 180));
    mixer.update(dt);
  },
});

// ------------------------------------------------------------------ nav grid
function heightAt(x, z, nearY = 10) {
  const o = new THREE.Vector3(x, nearY + 1.2, z).applyMatrix4(world.matrixWorld);
  rc.set(o, down); rc.far = 1e3;
  const hits = rc.intersectObject(nav, true);
  if (!hits.length) return null;
  return world.worldToLocal(hits[0].point).y;
}
function buildGrid() {
  const b = new THREE.Box3().setFromObject(nav);
  // in world-group local units
  const inv = new THREE.Matrix4().copy(world.matrixWorld).invert(); b.applyMatrix4(inv);
  const x0 = b.min.x, z0 = b.min.z, nx = Math.ceil((b.max.x - x0) / CELL) + 1, nz = Math.ceil((b.max.z - z0) / CELL) + 1;
  const H = new Float32Array(nx * nz).fill(NaN);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = heightAt(x0 + i * CELL, z0 + j * CELL, 20);
    if (h !== null) H[j * nx + i] = h;
  }
  grid = { x0, z0, nx, nz, H };
}
const cellOf = (x, z) => [Math.round((x - grid.x0) / CELL), Math.round((z - grid.z0) / CELL)];
const ok = (i, j) => i >= 0 && j >= 0 && i < grid.nx && j < grid.nz && !Number.isNaN(grid.H[j * grid.nx + i]);
const hOf = (i, j) => grid.H[j * grid.nx + i];
function nearestWalkable(x, z) {
  const [ci, cj] = cellOf(x, z); let best = null, bd = 1e9;
  for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) if (ok(i, j)) { const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < bd) { bd = d; best = [i, j]; } }
  return { i: best[0], j: best[1], x: grid.x0 + best[0] * CELL, z: grid.z0 + best[1] * CELL, h: hOf(best[0], best[1]) };
}
function astar(s, g) {
  const N = grid.nx * grid.nz, key = (i, j) => j * grid.nx + i;
  const gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [[0, s[0], s[1]]]; gS[key(...s)] = 0;
  const hfn = (i, j) => Math.hypot(i - g[0], j - g[1]);
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, i, j] = open.splice(bi, 1)[0]; const kk = key(i, j);
    if (closed[kk]) continue; closed[kk] = 1;
    if (i === g[0] && j === g[1]) break;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ni = i + di, nj = j + dj;
      if (!ok(ni, nj) || Math.abs(hOf(ni, nj) - hOf(i, j)) > STEP) continue;
      if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue; // no corner cutting
      const nk = key(ni, nj), c = gS[kk] + (di && dj ? Math.SQRT2 : 1);
      if (c < gS[nk]) { gS[nk] = c; from[nk] = kk; open.push([c + hfn(ni, nj), ni, nj]); }
    }
  }
  const gk = key(...g); if (from[gk] < 0 && gk !== key(...s)) return null;
  const out = []; for (let c = gk; c >= 0; c = from[c]) { out.push([c % grid.nx, Math.floor(c / grid.nx)]); if (c === key(...s)) break; }
  return out.reverse();
}
function lineClear(a, b) { // the straight line between two cells stays on walkable cells with small steps
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2); let prev = hOf(...a);
  for (let t = 1; t <= n; t++) {
    const i = Math.round(a[0] + (b[0] - a[0]) * t / n), j = Math.round(a[1] + (b[1] - a[1]) * t / n);
    if (!ok(i, j) || Math.abs(hOf(i, j) - prev) > STEP) return false; prev = hOf(i, j);
  }
  return true;
}
function goTo(x, z) {
  const s = cellOf(robot.position.x, robot.position.z), sN = ok(...s) ? s : (() => { const n = nearestWalkable(robot.position.x, robot.position.z); return [n.i, n.j]; })();
  const gN = (() => { const n = nearestWalkable(x, z); return [n.i, n.j]; })();
  const cells = astar(sN, gN);
  if (!cells) { demo.toast('Can\'t get there from here'); return false; }
  const smooth = [cells[0]]; let a = 0;
  while (a < cells.length - 1) { let b = cells.length - 1; while (b > a + 1 && !lineClear(cells[a], cells[b])) b--; smooth.push(cells[b]); a = b; }
  path = smooth.slice(1).map(([i, j]) => ({ x: grid.x0 + i * CELL, z: grid.z0 + j * CELL }));
  const last = path[path.length - 1] || { x, z };
  marker.position.set(last.x, (heightAt(last.x, last.z) ?? 0) + 0.03, last.z); marker.visible = true;
  routeCells = cells; drawTrail();
  return true;
}
let routeCells = [];
function drawTrail() { // dots along the remaining route
  const m = new THREE.Matrix4(); let n = 0;
  const rx = robot.position.x, rz = robot.position.z;
  const rest = path.length ? routeCells.filter(([i, j]) => { const x = grid.x0 + i * CELL, z = grid.z0 + j * CELL; return path.some((p) => Math.hypot(p.x - x, p.z - z) < 1e-6) || Math.hypot(x - rx, z - rz) > 0.3; }) : [];
  for (const [i, j] of rest) { if (n >= 200) break; if ((i + j) % 2) continue; m.makeTranslation(grid.x0 + i * CELL, hOf(i, j) + 0.03, grid.z0 + j * CELL); trail.setMatrixAt(n++, m); }
  trail.count = path.length ? n : 0; trail.instanceMatrix.needsUpdate = true;
}

window.__nav = {
  get robot() { return robot.position.toArray().map((v) => +v.toFixed(2)); },
  get walking() { return path.length > 0; },
  get grid() { let w = 0; for (const h of grid.H) if (!Number.isNaN(h)) w++; return { nx: grid.nx, nz: grid.nz, walkable: w }; },
  goTo,
  // highest walkable cell (a platform reached by ramps) as a test target
  highest() { let b = null; for (let j = 0; j < grid.nz; j++) for (let i = 0; i < grid.nx; i++) if (ok(i, j) && (!b || hOf(i, j) > b.h)) b = { x: grid.x0 + i * CELL, z: grid.z0 + j * CELL, h: hOf(i, j) }; return b; },
  screenOf(x, z) { const v = new THREE.Vector3(x, heightAt(x, z) ?? 0, z).applyMatrix4(world.matrixWorld).project(demo.camera); const r = demo.canvas.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
};
