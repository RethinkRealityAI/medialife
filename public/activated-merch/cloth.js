/**
 * A hanging garment with real cloth physics.
 *
 * The garment is built from the product photo itself: a mask grid (see
 * garments.json, made from the shop's flat-lay photos) defines the silhouette.
 * Two sheets are generated from that grid, a back panel (the printed artwork)
 * and a front panel, sewn together along the silhouette so it reads as a real
 * piece of clothing with volume rather than a flat card.
 *
 * Simulation: position-based Verlet. Per sheet: structural, shear and bend
 * constraints. Between sheets: a soft "loft" constraint keeps the panels
 * apart so the garment stays full. Long-range tethers to the hanger stop the
 * cotton from stretching like rubber, the way a real heavyweight tee hangs.
 * Wind is applied per triangle along its normal, so it billows, not slides.
 */
import * as THREE from "three";

const STEP = 1 / 60;

export class Garment {
  /**
   * @param {object} spec  an entry of garments.json
   * @param {{back: THREE.Texture, front: THREE.Texture, normal?: THREE.Texture}} tex
   * @param {{width?: number}} [opts]
   */
  constructor(spec, tex, opts = {}) {
    this.spec = spec;
    this.width = opts.width ?? 1.6;
    this.group = new THREE.Group();
    this.rig = new THREE.Object3D(); // the hanger: pins follow its transform
    this.time = 0;
    this.acc = 0;
    this.wind = new THREE.Vector3();
    this.gust = new THREE.Vector3();
    this.grab = null;
    this.iterations = opts.iterations ?? 10;
    this._build(tex);
  }

  /* ------------------------------------------------------------------ build */
  _build(tex) {
    const { cols, rows } = this.spec;
    const grid = largestComponent(this.spec.grid.map((r) => [...r].map((c) => c === "1")));
    const inside = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && grid[j][i];
    const s = this.width / cols;
    this.cell = s;
    const H = rows * s;

    // A vertex exists at a cell corner if any of its 4 cells is inside.
    const vid = (i, j) => j * (cols + 1) + i;
    const exists = new Uint8Array((cols + 1) * (rows + 1));
    const boundary = new Uint8Array((cols + 1) * (rows + 1));
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const c = [inside(i - 1, j - 1), inside(i, j - 1), inside(i - 1, j), inside(i, j)];
        const n = c.filter(Boolean).length;
        if (n) exists[vid(i, j)] = 1;
        if (n && n < 4) boundary[vid(i, j)] = 1;
      }

    // Distance (in cells) from the seam, for the loft profile.
    const dist = new Float32Array((cols + 1) * (rows + 1)).fill(1e9);
    const q = [];
    for (let k = 0; k < dist.length; k++) if (boundary[k]) (dist[k] = 0), q.push(k);
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      const i = k % (cols + 1);
      const j = (k / (cols + 1)) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni > cols || nj > rows) continue;
        const nk = vid(ni, nj);
        if (!exists[nk] || dist[nk] <= dist[k] + 1) continue;
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }

    // Particles. Seam vertices are shared by both panels.
    const pos = [];
    const backIdx = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
    const frontIdx = new Int32Array((cols + 1) * (rows + 1)).fill(-1);
    const loft = 0.055 * this.width;
    const add = (x, y, z) => (pos.push(x, y, z), pos.length / 3 - 1);
    for (let j = 0; j <= rows; j++)
      for (let i = 0; i <= cols; i++) {
        const k = vid(i, j);
        if (!exists[k]) continue;
        const x = (i / cols - 0.5) * this.width;
        const y = H / 2 - j * s;
        if (boundary[k]) {
          backIdx[k] = frontIdx[k] = add(x, y, 0);
        } else {
          const b = loft * Math.min(1, Math.sqrt(dist[k] / 4));
          backIdx[k] = add(x, y, b);
          frontIdx[k] = add(x, y, -b);
        }
      }
    const n = pos.length / 3;
    this.n = n;
    this.p = new Float32Array(pos);
    this.prev = new Float32Array(pos);
    this.rest = new Float32Array(pos);
    this.invMass = new Float32Array(n).fill(1);
    this.force = new Float32Array(n * 3);

    // Constraints: [a, b, restLength, stiffness]
    const C = [];
    const link = (a, b, k) => {
      if (a < 0 || b < 0 || a === b) return;
      const dx = this.p[a * 3] - this.p[b * 3];
      const dy = this.p[a * 3 + 1] - this.p[b * 3 + 1];
      const dz = this.p[a * 3 + 2] - this.p[b * 3 + 2];
      C.push(a, b, Math.hypot(dx, dy, dz), k);
    };
    const seen = new Set();
    const linkOnce = (a, b, k) => {
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (seen.has(key)) return;
      seen.add(key);
      link(a, b, k);
    };
    for (const idx of [backIdx, frontIdx]) {
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          if (!inside(i, j)) continue;
          const a = idx[vid(i, j)];
          const b = idx[vid(i + 1, j)];
          const c = idx[vid(i, j + 1)];
          const d = idx[vid(i + 1, j + 1)];
          linkOnce(a, b, 1);
          linkOnce(a, c, 1);
          linkOnce(b, d, 1);
          linkOnce(c, d, 1);
          linkOnce(a, d, 0.7);
          linkOnce(b, c, 0.7);
        }
      // Bend: skip one vertex along rows and columns.
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= cols; i++) {
          const a = idx[vid(i, j)];
          if (a < 0) continue;
          if (i + 2 <= cols && idx[vid(i + 1, j)] >= 0) linkOnce(a, idx[vid(i + 2, j)], 0.25);
          if (j + 2 <= rows && idx[vid(i, j + 1)] >= 0) linkOnce(a, idx[vid(i, j + 2)], 0.25);
        }
    }
    // Loft between the panels.
    for (let k = 0; k < exists.length; k++)
      if (exists[k] && !boundary[k]) link(backIdx[k], frontIdx[k], 0.12);
    this.C = new Float32Array(C);

    // Pins: the top of the garment, across the shoulders, as on a hanger.
    let top = Infinity;
    const topOf = [];
    for (let i = 0; i <= cols; i++) {
      let t = -1;
      for (let j = 0; j <= rows; j++) if (exists[vid(i, j)]) { t = j; break; }
      topOf.push(t);
      if (t >= 0) top = Math.min(top, t);
    }
    const pins = [];
    for (let i = 0; i <= cols; i++) {
      const t = topOf[i];
      if (t < 0) continue;
      const u = i / cols;
      if (u < 0.17 || u > 0.83) continue;
      if (t - top > rows * 0.2) continue;
      pins.push(backIdx[vid(i, t)]);
    }
    this.pins = [...new Set(pins)];
    this.pinRest = this.pins.map((k) => new THREE.Vector3(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]));
    for (const k of this.pins) this.invMass[k] = 0;

    // Tethers: never further from the nearest pin than at rest (+3%).
    this.tether = new Int32Array(n);
    this.tetherLen = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let best = -1;
      let bd = Infinity;
      for (const pk of this.pins) {
        const d = Math.hypot(this.p[k * 3] - this.p[pk * 3], this.p[k * 3 + 1] - this.p[pk * 3 + 1]);
        if (d < bd) (bd = d), (best = pk);
      }
      this.tether[k] = best;
      this.tetherLen[k] = bd * 1.03;
    }

    // Meshes.
    const makeMesh = (idx, flipU, outward, map) => {
      const geo = new THREE.BufferGeometry();
      const position = new THREE.BufferAttribute(this.p, 3);
      position.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute("position", position);
      const uv = new Float32Array(n * 2);
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= cols; i++) {
          const k = idx[vid(i, j)];
          if (k < 0) continue;
          uv[k * 2] = flipU ? 1 - i / cols : i / cols;
          uv[k * 2 + 1] = 1 - j / rows;
        }
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      const tri = [];
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          if (!inside(i, j)) continue;
          const a = idx[vid(i, j)];
          const b = idx[vid(i + 1, j)];
          const c = idx[vid(i, j + 1)];
          const d = idx[vid(i + 1, j + 1)];
          if (outward > 0) tri.push(a, c, b, b, c, d);
          else tri.push(a, b, c, b, d, c);
        }
      geo.setIndex(tri);
      geo.computeVertexNormals();
      const mat = new THREE.MeshPhysicalMaterial({
        map,
        alphaTest: 0.5,
        roughness: 0.95,
        metalness: 0,
        sheen: 0.45,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(0x3c4680),
        normalMap: tex.normal || null,
        normalScale: new THREE.Vector2(0.45, 0.45),
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      return mesh;
    };
    // Each panel's uv for the shared seam vertices is set by whichever panel
    // writes last, so the panels need their own uv buffers: build separate
    // geometries that share one position buffer.
    this.back = makeMesh(backIdx, false, +1, tex.back);
    this.front = makeMesh(frontIdx, true, -1, tex.front);
    this.front.geometry.setAttribute("position", this.back.geometry.attributes.position);
    this.group.add(this.back, this.front);
    this.tris = [this.back.geometry.index.array, this.front.geometry.index.array];
    this.height = H;
  }

  /* ------------------------------------------------------------- simulate */
  /** Pins follow the hanger rig; call after moving `this.rig`. */
  _pinTargets() {
    this.rig.updateMatrix();
    const v = new THREE.Vector3();
    this.pins.forEach((k, i) => {
      v.copy(this.pinRest[i]).applyMatrix4(this.rig.matrix);
      this.p[k * 3] = v.x;
      this.p[k * 3 + 1] = v.y;
      this.p[k * 3 + 2] = v.z;
      this.prev[k * 3] = v.x;
      this.prev[k * 3 + 1] = v.y;
      this.prev[k * 3 + 2] = v.z;
    });
  }

  _windForces(t) {
    const f = this.force;
    f.fill(0);
    const p = this.p;
    const w = this.wind;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (const tri of this.tris)
      for (let i = 0; i < tri.length; i += 3) {
        const i0 = tri[i] * 3;
        const i1 = tri[i + 1] * 3;
        const i2 = tri[i + 2] * 3;
        a.set(p[i1] - p[i0], p[i1 + 1] - p[i0 + 1], p[i1 + 2] - p[i0 + 2]);
        b.set(p[i2] - p[i0], p[i2 + 1] - p[i0 + 1], p[i2 + 2] - p[i0 + 2]);
        nrm.crossVectors(a, b); // length = 2 * area
        const lx = (p[i0] + p[i1] + p[i2]) / 3;
        const ly = (p[i0 + 1] + p[i1 + 1] + p[i2 + 1]) / 3;
        // Turbulence: a travelling ripple so the cloth moves in waves.
        const turb = 0.65 + 0.35 * Math.sin(lx * 5.1 + ly * 3.3 + t * 2.3) * Math.cos(ly * 4.2 - t * 1.7);
        const d = (nrm.x * w.x + nrm.y * w.y + nrm.z * w.z) * turb;
        const len2 = nrm.lengthSq() || 1;
        const fx = (nrm.x * d) / Math.sqrt(len2);
        const fy = (nrm.y * d) / Math.sqrt(len2);
        const fz = (nrm.z * d) / Math.sqrt(len2);
        for (const k of [i0, i1, i2]) {
          f[k] += fx;
          f[k + 1] += fy;
          f[k + 2] += fz;
        }
      }
  }

  step(dt, opts = {}) {
    this.acc = Math.min(this.acc + dt, STEP * 4);
    let ran = false;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this._substep(STEP, opts);
      ran = true;
    }
    if (ran) {
      const g = this.back.geometry;
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      // The front panel shares positions but needs its own normals.
      this.front.geometry.computeVertexNormals();
    }
  }

  _substep(h, { calm = false } = {}) {
    this.time += h;
    const t = this.time;
    // Ambient breeze + decaying gusts (from the pointer and scroll).
    const amp = calm ? 0.25 : 1;
    this.wind.set(
      (Math.sin(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.25) * amp + this.gust.x,
      0,
      (0.9 + Math.sin(t * 0.43) * 0.6) * amp + this.gust.z,
    );
    this.gust.multiplyScalar(0.94);
    this._windForces(t);

    this._pinTargets();
    const p = this.p;
    const q = this.prev;
    const im = this.invMass;
    const f = this.force;
    const g = -7.5;
    const damp = 0.982;
    const windK = 9;
    for (let k = 0; k < this.n; k++) {
      if (!im[k]) continue;
      const i = k * 3;
      const ax = f[i] * windK;
      const ay = g + f[i + 1] * windK;
      const az = f[i + 2] * windK;
      const x = p[i];
      const y = p[i + 1];
      const z = p[i + 2];
      p[i] += (x - q[i]) * damp + ax * h * h;
      p[i + 1] += (y - q[i + 1]) * damp + ay * h * h;
      p[i + 2] += (z - q[i + 2]) * damp + az * h * h;
      q[i] = x;
      q[i + 1] = y;
      q[i + 2] = z;
    }

    // Pointer grab: drag one particle (and its neighbours by constraints).
    if (this.grab) {
      const { k, target } = this.grab;
      const i = k * 3;
      p[i] += (target.x - p[i]) * 0.6;
      p[i + 1] += (target.y - p[i + 1]) * 0.6;
      p[i + 2] += (target.z - p[i + 2]) * 0.6;
    }

    const C = this.C;
    for (let it = 0; it < this.iterations; it++) {
      for (let c = 0; c < C.length; c += 4) {
        const a = C[c] * 3;
        const b = C[c + 1] * 3;
        const wa = im[C[c]];
        const wb = im[C[c + 1]];
        const ws = wa + wb;
        if (!ws) continue;
        const dx = p[b] - p[a];
        const dy = p[b + 1] - p[a + 1];
        const dz = p[b + 2] - p[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((d - C[c + 2]) / d) * C[c + 3];
        const ka = (wa / ws) * diff;
        const kb = (wb / ws) * diff;
        p[a] += dx * ka;
        p[a + 1] += dy * ka;
        p[a + 2] += dz * ka;
        p[b] -= dx * kb;
        p[b + 1] -= dy * kb;
        p[b + 2] -= dz * kb;
      }
    }
    // Tethers (inextensible heavyweight cotton).
    for (let k = 0; k < this.n; k++) {
      if (!im[k]) continue;
      const i = k * 3;
      const j = this.tether[k] * 3;
      const dx = p[i] - p[j];
      const dy = p[i + 1] - p[j + 1];
      const dz = p[i + 2] - p[j + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const L = this.tetherLen[k];
      if (d > L) {
        const s = L / d;
        p[i] = p[j] + dx * s;
        p[i + 1] = p[j + 1] + dy * s;
        p[i + 2] = p[j + 2] + dz * s;
      }
    }
  }

  /** Nearest particle to a screen point (NDC), within `radius` NDC units. */
  pick(ndc, camera, radius = 0.12) {
    const v = new THREE.Vector3();
    let best = -1;
    let bd = radius * radius;
    this.group.updateMatrixWorld();
    for (let k = 0; k < this.n; k++) {
      if (!this.invMass[k]) continue;
      v.set(this.p[k * 3], this.p[k * 3 + 1], this.p[k * 3 + 2]).applyMatrix4(this.group.matrixWorld).project(camera);
      const d = (v.x - ndc.x) ** 2 + ((v.y - ndc.y) * 0.8) ** 2;
      if (d < bd) (bd = d), (best = k);
    }
    return best;
  }

  /** Settle the cloth so it does not start mid-fall. */
  warm(seconds = 2.5) {
    for (let t = 0; t < seconds; t += STEP) this._substep(STEP, { calm: true });
    this.back.geometry.attributes.position.needsUpdate = true;
    this.back.geometry.computeVertexNormals();
    this.front.geometry.computeVertexNormals();
  }

  dispose() {
    for (const m of [this.back, this.front]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}

function largestComponent(g) {
  const rows = g.length;
  const cols = g[0].length;
  const lab = g.map((r) => r.map(() => 0));
  let best = 0;
  let bestN = 0;
  let id = 0;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      if (!g[j][i] || lab[j][i]) continue;
      id++;
      let cnt = 0;
      const st = [[i, j]];
      lab[j][i] = id;
      while (st.length) {
        const [x, y] = st.pop();
        cnt++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (!g[ny][nx] || lab[ny][nx]) continue;
          lab[ny][nx] = id;
          st.push([nx, ny]);
        }
      }
      if (cnt > bestN) (bestN = cnt), (best = id);
    }
  return lab.map((r) => r.map((v) => v === best));
}
