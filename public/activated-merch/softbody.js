/**
 * A garment from a Blender-built GLB, made soft.
 *
 * The mesh is skinned to a few hundred "nodes" sampled over its surface. Each
 * node is a damped spring that always pulls back to the rest pose, so whatever
 * the visitor does (grab, spin, scroll) the piece settles back to how it was
 * modelled. Front and back panels share nodes, so they can never pass through
 * each other. Node rotations come from shape matching their neighbourhood, so
 * the shading follows the folds.
 */
import * as THREE from "three";

const SUB = 1 / 120;

export class SoftGarment {
  /**
   * @param {THREE.Object3D} root   gltf.scene
   * @param {object} opts { height, maxWidth, nodes, printSide }
   */
  constructor(root, { height = 1.75, maxWidth = 1.95, nodes = 240 } = {}) {
    let src = null;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!src && o.isMesh) src = o;
    });
    if (!src) throw new Error("no mesh in garment");

    const geo = floatGeometry(src.geometry);
    geo.applyMatrix4(src.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    const s = Math.min(height / size.y, maxWidth / size.x);
    geo.translate(-c.x, -c.y, -c.z);
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    this.geometry = geo;
    this.bounds = geo.boundingBox.clone();

    const mat = src.material.clone();
    mat.side = THREE.DoubleSide;
    this.material = mat;
    this.uniforms = patchMaterial(mat);

    this.group = new THREE.Group();
    this.pivot = new THREE.Group(); // user spin lives here
    this.group.add(this.pivot);
    this._buildNodes(nodes);
    this._bind();

    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.frustumCulled = false;
    const bones = this.bones;
    const root0 = new THREE.Bone();
    bones.forEach((b) => root0.add(b));
    mesh.add(root0);
    const inv = this.rest.map((r) => new THREE.Matrix4().makeTranslation(-r.x, -r.y, -r.z));
    mesh.bind(new THREE.Skeleton(bones, inv), new THREE.Matrix4());
    this.mesh = mesh;
    this.pivot.add(mesh);
    // Rest-pose twin for picking (raycasting a skinned mesh is slow).
    this.pick = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    this.pivot.add(this.pick);

    this.grabbing = null;
    this.wind = 0;
    this.omega = 0;
    this.settled = true;
  }

  /* --------------------------------------------------------- set-up */
  _buildNodes(target) {
    const pos = this.geometry.attributes.position;
    const n = pos.count;
    const bb = this.bounds;
    const size = bb.getSize(new THREE.Vector3());
    // Voxel-sample the surface; grow the cell until we are near the target.
    let cell = Math.sqrt((size.x * size.y * 2.2) / target);
    let cells;
    for (let tries = 0; tries < 6; tries++) {
      cells = new Map();
      for (let i = 0; i < n; i++) {
        const k = `${Math.floor((pos.getX(i) - bb.min.x) / cell)},${Math.floor((pos.getY(i) - bb.min.y) / cell)},${Math.floor((pos.getZ(i) - bb.min.z) / (cell * 2.5))}`;
        let e = cells.get(k);
        if (!e) cells.set(k, (e = [0, 0, 0, 0]));
        e[0] += pos.getX(i);
        e[1] += pos.getY(i);
        e[2] += pos.getZ(i);
        e[3]++;
      }
      if (cells.size > target * 1.25) cell *= 1.12;
      else if (cells.size < target * 0.75) cell *= 0.9;
      else break;
    }
    const rest = [];
    for (const e of cells.values()) if (e[3] > 2) rest.push(new THREE.Vector3(e[0] / e[3], e[1] / e[3], e[2] / e[3]));
    const N = rest.length;
    this.rest = rest;
    this.N = N;
    this.bones = rest.map((r) => {
      const b = new THREE.Bone();
      b.position.copy(r);
      return b;
    });
    // Per-node freedom: the hem and cuffs move most, the shoulders least.
    const top = bb.max.y;
    const h = size.y;
    const hw = size.x / 2;
    this.free = new Float32Array(N);
    this.k = new Float32Array(N);
    this.c = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const f = THREE.MathUtils.clamp((top - rest[i].y) / h, 0, 1);
      const side = THREE.MathUtils.clamp(Math.abs(rest[i].x) / hw - 0.45, 0, 1);
      const free = Math.min(1, 0.18 + 0.82 * Math.pow(f, 1.15) + side * 0.35);
      this.free[i] = free;
      this.k[i] = THREE.MathUtils.lerp(110, 34, free);
      this.c[i] = 2 * Math.sqrt(this.k[i]) * 0.3;
    }
    // Neighbours (k nearest) for smoothing and shape matching.
    const K = 7;
    this.nbr = new Int32Array(N * K);
    this.K = K;
    for (let i = 0; i < N; i++) {
      const best = new Array(K).fill(-1);
      const bd = new Array(K).fill(Infinity);
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const d = rest[i].distanceToSquared(rest[j]);
        if (d < bd[K - 1]) {
          let p = K - 1;
          while (p > 0 && bd[p - 1] > d) {
            bd[p] = bd[p - 1];
            best[p] = best[p - 1];
            p--;
          }
          bd[p] = d;
          best[p] = j;
        }
      }
      for (let q = 0; q < K; q++) this.nbr[i * K + q] = best[q];
    }
    this.d = new Float32Array(N * 3); // displacement from rest
    this.v = new Float32Array(N * 3);
    this.tmp = new Float32Array(N * 3);
    this.q = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) this.q[i * 4 + 3] = 1;
  }

  _bind() {
    const pos = this.geometry.attributes.position;
    const n = pos.count;
    const rest = this.rest;
    const N = this.N;
    const idx = new Uint16Array(n * 4);
    const wts = new Float32Array(n * 4);
    const rx = new Float32Array(N);
    const ry = new Float32Array(N);
    const rz = new Float32Array(N);
    rest.forEach((r, i) => {
      rx[i] = r.x;
      ry[i] = r.y;
      rz[i] = r.z;
    });
    const bi = [0, 0, 0, 0];
    const bd = [0, 0, 0, 0];
    for (let v = 0; v < n; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      bd[0] = bd[1] = bd[2] = bd[3] = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = x - rx[i];
        const dy = y - ry[i];
        const dz = z - rz[i];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd[3]) {
          let p = 3;
          while (p > 0 && bd[p - 1] > d) {
            bd[p] = bd[p - 1];
            bi[p] = bi[p - 1];
            p--;
          }
          bd[p] = d;
          bi[p] = i;
        }
      }
      let sum = 0;
      for (let q = 0; q < 4; q++) {
        const w = 1 / (bd[q] + 1e-4);
        wts[v * 4 + q] = w;
        sum += w;
      }
      for (let q = 0; q < 4; q++) {
        idx[v * 4 + q] = bi[q];
        wts[v * 4 + q] /= sum;
      }
    }
    this.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
    this.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wts, 4));
  }

  /* ---------------------------------------------------------- input */
  /** Start a grab at a local-space point on the rest mesh. */
  grab(local) {
    const g = new Float32Array(this.N);
    const s2 = 2 * 0.3 * 0.3;
    for (let i = 0; i < this.N; i++) g[i] = Math.exp(-this.rest[i].distanceToSquared(local) / s2);
    this.grabbing = { at: local.clone(), g, D: new THREE.Vector3() };
  }

  /** Where the grabbed point should be, in local space (clamped). */
  pull(localTarget) {
    if (!this.grabbing) return;
    const D = this.grabbing.D.copy(localTarget).sub(this.grabbing.at);
    D.z *= 0.6;
    if (D.length() > 0.42) D.setLength(0.42);
  }

  release() {
    this.grabbing = null;
  }

  /** A shove to the whole piece, e.g. when it arrives or is switched to. */
  shove(x = 0, z = 1.6) {
    for (let i = 0; i < this.N; i++) {
      this.v[i * 3] += x * this.free[i];
      this.v[i * 3 + 2] += z * this.free[i];
    }
    this.settled = false;
  }

  /* --------------------------------------------------------- physics */
  step(dt, t) {
    const busy = this.grabbing || this.wind > 0.02 || Math.abs(this.omega) > 0.02;
    if (!busy && this.settled) return;
    let acc = Math.min(dt, 0.05);
    while (acc > 1e-6) {
      const h = Math.min(SUB, acc);
      this._sub(h, t);
      acc -= h;
    }
    this._smooth();
    const e = this._apply();
    this.settled = !busy && e < 1e-7;
    if (this.settled) this._rest();
  }

  _sub(h, t) {
    const { N, d, v, k, c, free, rest } = this;
    const G = this.grabbing;
    const w = this.wind;
    const om = this.omega;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const r = rest[i];
      let tx = 0;
      let ty = 0;
      let tz = 0;
      let kk = k[i];
      if (G) {
        const g = G.g[i];
        tx = G.D.x * g;
        ty = G.D.y * g;
        tz = G.D.z * g;
        kk = kk + 120 * g;
      }
      let ax = kk * (tx - d[i3]) - c[i] * v[i3];
      let ay = kk * (ty - d[i3 + 1]) - c[i] * v[i3 + 1];
      let az = kk * (tz - d[i3 + 2]) - c[i] * v[i3 + 2];
      const f = free[i];
      if (w > 0.001) {
        const n1 = Math.sin(t * 2.3 + r.y * 3.1 + r.x * 1.7);
        const n2 = Math.sin(t * 3.7 - r.x * 2.6 + r.y * 1.1);
        az += w * f * (0.55 + 0.45 * n1);
        ax += w * f * 0.25 * n2;
        ay += w * f * 0.12 * n1;
      }
      if (om !== 0) {
        // Cloth trails the spin and flares out a little.
        ax += -om * r.z * 1.6 * f + om * om * r.x * 0.35 * f;
        az += om * r.x * 1.6 * f + om * om * r.z * 0.35 * f;
      }
      v[i3] += ax * h;
      v[i3 + 1] += ay * h;
      v[i3 + 2] += az * h;
      d[i3] += v[i3] * h;
      d[i3 + 1] += v[i3 + 1] * h;
      d[i3 + 2] += v[i3 + 2] * h;
    }
  }

  _smooth() {
    const { N, d, tmp, nbr, K } = this;
    for (let i = 0; i < N; i++) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let q = 0; q < K; q++) {
        const j = nbr[i * K + q] * 3;
        sx += d[j];
        sy += d[j + 1];
        sz += d[j + 2];
      }
      const i3 = i * 3;
      tmp[i3] = d[i3] * 0.55 + (sx / K) * 0.45;
      tmp[i3 + 1] = d[i3 + 1] * 0.55 + (sy / K) * 0.45;
      tmp[i3 + 2] = d[i3 + 2] * 0.55 + (sz / K) * 0.45;
    }
    for (let i = 0; i < N * 3; i++) {
      let x = tmp[i];
      if (x > 0.5) x = 0.5;
      else if (x < -0.5) x = -0.5;
      d[i] = x;
    }
  }

  /** Write node displacements and rotations into the bones. */
  _apply() {
    const { N, d, v, rest, bones, nbr, K, q } = this;
    let energy = 0;
    const A = new Float32Array(9);
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      const r = rest[i];
      energy += d[i3] * d[i3] + d[i3 + 1] * d[i3 + 1] + d[i3 + 2] * d[i3 + 2] + (v[i3] * v[i3] + v[i3 + 1] * v[i3 + 1] + v[i3 + 2] * v[i3 + 2]) * 0.01;
      bones[i].position.set(r.x + d[i3], r.y + d[i3 + 1], r.z + d[i3 + 2]);
      // Shape matching: A = Σ (p_j - p_i)(r_j - r_i)^T, then its rotation.
      A.fill(0);
      for (let k = 0; k < K; k++) {
        const j = nbr[i * K + k];
        const rj = rest[j];
        const j3 = j * 3;
        const ex = rj.x - r.x;
        const ey = rj.y - r.y;
        const ez = rj.z - r.z;
        const px = ex + d[j3] - d[i3];
        const py = ey + d[j3 + 1] - d[i3 + 1];
        const pz = ez + d[j3 + 2] - d[i3 + 2];
        A[0] += px * ex; A[1] += px * ey; A[2] += px * ez;
        A[3] += py * ex; A[4] += py * ey; A[5] += py * ez;
        A[6] += pz * ex; A[7] += pz * ey; A[8] += pz * ez;
      }
      extractRotation(A, q, i * 4);
      bones[i].quaternion.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
    }
    return energy / N;
  }

  _rest() {
    this.d.fill(0);
    this.v.fill(0);
    for (let i = 0; i < this.N; i++) {
      this.bones[i].position.copy(this.rest[i]);
      this.bones[i].quaternion.identity();
      this.q[i * 4] = this.q[i * 4 + 1] = this.q[i * 4 + 2] = 0;
      this.q[i * 4 + 3] = 1;
    }
  }

  /* ---------------------------------------------------------- helpers */
  /** Nearest surface point to a spot given in normalised box coords. */
  surfaceSpot({ u, v, side }) {
    const bb = this.bounds;
    const want = new THREE.Vector3(
      THREE.MathUtils.lerp(bb.min.x, bb.max.x, (u + 1) / 2),
      THREE.MathUtils.lerp(bb.min.y, bb.max.y, v),
      side === "back" ? bb.min.z - 1 : bb.max.z + 1,
    );
    const pos = this.geometry.attributes.position;
    const nrm = this.geometry.attributes.normal;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - want.x;
      const dy = pos.getY(i) - want.y;
      const dz = (pos.getZ(i) - want.z) * 0.15;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const p = new THREE.Vector3().fromBufferAttribute(pos, best);
    const n = nrm ? new THREE.Vector3().fromBufferAttribute(nrm, best) : new THREE.Vector3(0, 0, side === "back" ? -1 : 1);
    if ((side === "back" && n.z > 0) || (side !== "back" && n.z < 0)) n.negate();
    return { p, n: n.normalize() };
  }

  /** Surface points + colours for the materialise effect. */
  samplePoints(count) {
    const pos = this.geometry.attributes.position;
    const uv = this.geometry.attributes.uv;
    const img = this.material.map?.image;
    let px = null;
    let W = 0;
    if (img) {
      W = 256;
      const cv = document.createElement("canvas");
      cv.width = cv.height = W;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      try {
        cx.drawImage(img, 0, 0, W, W);
        px = cx.getImageData(0, 0, W, W).data;
      } catch {
        px = null;
      }
    }
    const P = new Float32Array(count * 3);
    const C = new Float32Array(count * 3);
    const flipY = this.material.map?.flipY ?? false;
    for (let i = 0; i < count; i++) {
      const k = (Math.random() * pos.count) | 0;
      P[i * 3] = pos.getX(k);
      P[i * 3 + 1] = pos.getY(k);
      P[i * 3 + 2] = pos.getZ(k);
      let r = 0.35;
      let g = 0.4;
      let b = 0.6;
      if (px && uv) {
        const u = uv.getX(k) % 1;
        let vv = uv.getY(k) % 1;
        if (flipY) vv = 1 - vv;
        const x = Math.min(W - 1, Math.max(0, (u * W) | 0));
        const y = Math.min(W - 1, Math.max(0, (vv * W) | 0));
        const o = (y * W + x) * 4;
        r = px[o] / 255;
        g = px[o + 1] / 255;
        b = px[o + 2] / 255;
      }
      // Lift the darks so black cotton still reads as light.
      C[i * 3] = 0.25 + r * 0.9;
      C[i * 3 + 1] = 0.3 + g * 0.9;
      C[i * 3 + 2] = 0.55 + b * 0.8;
    }
    return { P, C };
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ------------------------------------------------------------------ utils */

/** Quantized GLB attributes → plain float attributes. */
function floatGeometry(src) {
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = src.attributes[name];
    if (!a) continue;
    const n = a.count;
    const s = a.itemSize;
    const out = new Float32Array(n * s);
    for (let i = 0; i < n; i++) {
      out[i * s] = a.getX(i);
      if (s > 1) out[i * s + 1] = a.getY(i);
      if (s > 2) out[i * s + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, s));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

/**
 * Müller et al. 2016, "A Robust Method to Extract the Rotational Part of
 * Deformations". Warm-started from the previous frame's quaternion.
 */
const _q = new THREE.Quaternion();
const _r = new THREE.Matrix4();
const _w = new THREE.Vector3();
const _dq = new THREE.Quaternion();
function extractRotation(A, Q, o) {
  _q.set(Q[o], Q[o + 1], Q[o + 2], Q[o + 3]);
  for (let it = 0; it < 4; it++) {
    _r.makeRotationFromQuaternion(_q);
    const e = _r.elements; // column-major: col0 = e0..2
    // columns of A (A is row-major in our array)
    const a0x = A[0], a0y = A[3], a0z = A[6];
    const a1x = A[1], a1y = A[4], a1z = A[7];
    const a2x = A[2], a2y = A[5], a2z = A[8];
    const r0x = e[0], r0y = e[1], r0z = e[2];
    const r1x = e[4], r1y = e[5], r1z = e[6];
    const r2x = e[8], r2y = e[9], r2z = e[10];
    const wx = r0y * a0z - r0z * a0y + (r1y * a1z - r1z * a1y) + (r2y * a2z - r2z * a2y);
    const wy = r0z * a0x - r0x * a0z + (r1z * a1x - r1x * a1z) + (r2z * a2x - r2x * a2z);
    const wz = r0x * a0y - r0y * a0x + (r1x * a1y - r1y * a1x) + (r2x * a2y - r2y * a2x);
    const den = Math.abs(r0x * a0x + r0y * a0y + r0z * a0z + r1x * a1x + r1y * a1y + r1z * a1z + r2x * a2x + r2y * a2y + r2z * a2z) + 1e-9;
    _w.set(wx / den, wy / den, wz / den);
    const ang = _w.length();
    if (ang < 1e-6) break;
    _dq.setFromAxisAngle(_w.divideScalar(ang), ang);
    _q.premultiply(_dq).normalize();
  }
  Q[o] = _q.x;
  Q[o + 1] = _q.y;
  Q[o + 2] = _q.z;
  Q[o + 3] = _q.w;
}

/**
 * Scan reveal, x-ray lens and dimming, injected into the GLB's material.
 *   uRevealY : world height of the scan line
 *   uHide    : 1 = hide everything below the line (materialise), 0 = just glow
 *   uScan    : strength of the scan band
 *   uLens*   : a round cut-away that shows what is inside the fabric
 *   uDim     : carousel neighbours sit in shadow
 */
function patchMaterial(mat) {
  const u = {
    uRevealY: { value: -10 },
    uHide: { value: 0 },
    uScan: { value: 0 },
    uScanColor: { value: new THREE.Color(0x7fb2ff) },
    uLensPos: { value: new THREE.Vector3(0, 0, -99) },
    uLensR: { value: 0.1 },
    uLens: { value: 0 },
    uLensColor: { value: new THREE.Color(0x7fd0ff) },
    uDim: { value: 1 },
    uFade: { value: 1 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWPos;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWPos;
uniform float uRevealY, uHide, uScan, uLensR, uLens, uDim, uFade;
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
uniform vec3 uScanColor, uLensPos, uLensColor;`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
if (uFade < 0.999 && bayer4(gl_FragCoord.xy) > uFade) discard;
float yRel = vWPos.y - uRevealY;
if (uHide > 0.5 && yRel < 0.0) discard;
float lensD = length(vWPos - uLensPos);
float lensR = uLensR * uLens;
if (uLens > 0.001 && lensD < lensR) discard;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
float band = exp(-pow(yRel / 0.03, 2.0)) * uScan;
float lines = step(0.82, fract(vWPos.y * 70.0)) * smoothstep(0.4, 0.0, yRel) * step(0.0, yRel) * uScan;
float rim = uLens > 0.001 ? exp(-pow((lensD - lensR) / 0.007, 2.0)) * uLens : 0.0;
totalEmissiveRadiance += uScanColor * (band * 3.0 + lines * 0.4) + uLensColor * rim * 2.2;`,
      )
      .replace("#include <opaque_fragment>", "#include <opaque_fragment>\ngl_FragColor.rgb *= uDim;");
  };
  mat.customProgramCacheKey = () => "soft-garment";
  return u;
}
