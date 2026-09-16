/**
 * Parametric garment meshes for the Drop Studio.
 *
 * The rest of the catalogue (keychain, plush, stickers, deskmat) is built by
 * inflating a 2D outline, which suits flat and blobby forms. Apparel is not
 * flat: a t-shirt has a torso with real depth, sleeves that are tubes, a neck
 * hole you can see through, and a collar. Inflating an outline cannot produce
 * any of those, which is why garments get their own builder.
 *
 * Construction:
 *   torso   a closed cross-section swept from hem to shoulder
 *   yoke    the shoulder, closing inward and rising to a neck opening
 *   collar  a rib band folded around the neck opening
 *   sleeves tapered tubes that start inside the torso, so no boolean is needed
 *   hood    (hoodie only) a bag swept back and up from the neck
 *
 * UVs use a front/back planar split: the front of the garment maps to the top
 * half of the texture and the back to the bottom half, so a chest print can be
 * painted on the front only. Each ring is built as two separate arcs, front and
 * back, which puts the UV seam exactly where a real side seam goes and keeps
 * the texture from smearing across it.
 */

import * as THREE from "three";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t) => t * t * (3 - 2 * t);

/** Catmull-Rom through control values, for readable body profiles. */
function profile(stops) {
  return (t) => {
    const x = clamp01(t) * (stops.length - 1);
    const i = Math.min(Math.floor(x), stops.length - 2);
    const f = x - i;
    const p0 = stops[Math.max(i - 1, 0)];
    const p1 = stops[i];
    const p2 = stops[i + 1];
    const p3 = stops[Math.min(i + 2, stops.length - 1)];
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * f +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
        (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
    );
  };
}

/**
 * A squircle cross-section. `power` 2 is an ellipse; higher values flatten the
 * front and back into panels, which is what a torso in a t-shirt actually is.
 */
function section(theta, halfWidth, halfDepth, power = 2.6) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / power;
  return [
    halfWidth * Math.sign(c) * Math.pow(Math.abs(c), e),
    halfDepth * Math.sign(s) * Math.pow(Math.abs(s), e),
  ];
}

/**
 * Builds one ring as two arcs (front then back) with duplicated vertices at the
 * sides. `SEG` is per arc, so a ring holds 2 * (SEG + 1) vertices.
 */
const SEG = 24;

function ringAngles() {
  const front = [];
  const back = [];
  for (let i = 0; i <= SEG; i++) {
    // front arc runs -90deg..+90deg, back arc continues +90deg..+270deg
    front.push(-Math.PI / 2 + (i / SEG) * Math.PI);
    back.push(Math.PI / 2 + (i / SEG) * Math.PI);
  }
  return { front, back };
}

const ANGLES = ringAngles();

/**
 * Accumulates rings into an indexed mesh. Each ring must be pushed with the
 * same vertex count; strips are stitched within an arc only, never across the
 * side seam.
 */
class Sweep {
  constructor() {
    this.pos = [];
    this.uvSrc = []; // [x, y, z] kept so UVs can be assigned after bounds are known
    this.index = [];
    this.rings = [];
    this.ao = []; // per-vertex occlusion, baked into a colour attribute
    this.uvSide = [];
  }

  /**
   * @param {Array<[number,number,number]>} verts one ring, front arc then back arc
   * @param {number} ringAO occlusion for surfaces the ring builds, e.g. the
   *   inside of a folded collar or cuff, which never sees the light
   */
  addRing(verts, ringAO = 1, uvSide = 0) {
    const start = this.pos.length / 3;
    for (const [x, y, z] of verts) {
      this.pos.push(x, y, z);
      this.uvSrc.push(x, y, z);
      this.ao.push(ringAO);
      this.uvSide.push(uvSide); // 0 auto, 1 force front, -1 force back
    }
    this.rings.push(start);
    return start;
  }

  /** Stitch the last two rings pushed. */
  stitchLast(flip = false) {
    const n = this.rings.length;
    if (n < 2) return;
    this.stitch(this.rings[n - 2], this.rings[n - 1], flip);
  }

  stitch(a, b, flip = false) {
    const per = SEG + 1;
    for (let arc = 0; arc < 2; arc++) {
      const off = arc * per;
      for (let i = 0; i < SEG; i++) {
        const a0 = a + off + i;
        const a1 = a0 + 1;
        const b0 = b + off + i;
        const b1 = b0 + 1;
        if (flip) {
          this.index.push(a0, b0, b1, a0, b1, a1);
        } else {
          this.index.push(a0, b1, b0, a0, a1, b1);
        }
      }
    }
  }

  /** Close a ring down to a single point, e.g. the crown of a hood. */
  capToPoint(ringStart, point, flip = false) {
    const per = SEG + 1;
    const p = this.pos.length / 3;
    this.pos.push(point[0], point[1], point[2]);
    this.uvSrc.push(point[0], point[1], point[2]);
    this.ao.push(1);
    this.uvSide.push(0);
    for (let arc = 0; arc < 2; arc++) {
      const off = arc * per;
      for (let i = 0; i < SEG; i++) {
        const a0 = ringStart + off + i;
        const a1 = a0 + 1;
        if (flip) this.index.push(a0, a1, p);
        else this.index.push(a0, p, a1);
      }
    }
  }

  build(uvBounds, occlude) {
    const [minX, minY, maxX, maxY] = uvBounds;
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const uv = [];
    for (let i = 0; i < this.uvSrc.length; i += 3) {
      const x = this.uvSrc[i];
      const y = this.uvSrc[i + 1];
      const z = this.uvSrc[i + 2];
      const tx = clamp01((x - minX) / w);
      const ty = clamp01((y - minY) / h);
      // front of the garment -> top half of the texture, back -> bottom half
      const side = this.uvSide[i / 3] || (z >= 0 ? 1 : -1);
      if (side > 0) uv.push(tx, 0.5 + 0.5 * ty);
      else uv.push(1 - tx, 0.5 * ty);
    }

    // Occlusion is what stops a sleeve looking pasted on. It is folded into a
    // vertex colour, which the material multiplies over the base map.
    const col = [];
    for (let i = 0, v = 0; i < this.uvSrc.length; i += 3, v++) {
      const a =
        this.ao[v] * (occlude ? occlude(this.uvSrc[i], this.uvSrc[i + 1], this.uvSrc[i + 2]) : 1);
      col.push(a, a, a);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(this.index);
    geo.computeVertexNormals();
    smoothCoincidentNormals(geo);
    geo.computeBoundingSphere();
    return geo;
  }
}

/**
 * Average normals across vertices that share a position. The front and back
 * arcs are split for UV reasons, so without this the side seam renders as a
 * hard crease all the way down the garment.
 */
function smoothCoincidentNormals(geo, eps = 1e-4) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const buckets = new Map();
  const q = 1 / eps;
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = []));
    b.push(i);
  }
  for (const idxs of buckets.values()) {
    if (idxs.length < 2) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const i of idxs) {
      nx += nor.getX(i);
      ny += nor.getY(i);
      nz += nor.getZ(i);
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const i of idxs) nor.setXYZ(i, nx, ny, nz);
  }
  nor.needsUpdate = true;
}

const mix = (a, b, t) => a + (b - a) * t;

/**
 * Analytic ambient occlusion for a garment.
 *
 * A full AO bake would mean raycasting several thousand vertices against the
 * mesh on every product switch. The shadows that actually sell a t-shirt are
 * predictable — the armpit where the sleeve meets the body, the shoulder under
 * the collar, and the hem fold — so they are evaluated directly instead.
 */
function makeOccluder(spec, hw) {
  const { sleeve, shoulderY, hemY, neckX } = spec;
  const { attachY, r0, startFactor = 0.52 } = sleeve;
  const t0 = clamp01((attachY - hemY) / (shoulderY - hemY));
  const rootX = hw(t0) * startFactor;

  return (x, y, z) => {
    let ao = 1;

    // armpit: proximity to either sleeve root
    for (const side of [-1, 1]) {
      const d = Math.hypot(x - side * rootX, y - attachY, z);
      ao *= mix(0.42, 1, clamp01((d - r0 * 0.5) / (r0 * 2.4)));
    }

    // the collar throws a shadow across the top of the shoulder
    if (y > shoulderY - 0.16) {
      const radial = Math.hypot(x, z * 0.85);
      const under = clamp01((y - (shoulderY - 0.16)) / 0.2);
      ao *= mix(1, mix(0.66, 1, clamp01((radial - neckX) / 0.2)), under);
    }

    // hem fold
    ao *= mix(0.74, 1, clamp01((y - hemY) / 0.14));

    return ao;
  };
}

/** Subtle cloth relief so the surface is not a perfect extrusion. */
function drape(x, y, amount) {
  if (!amount) return 0;
  return (
    amount *
    (Math.sin(x * 6.1 + y * 2.3) * 0.5 +
      Math.sin(y * 4.7 - x * 3.1) * 0.35 +
      Math.sin(x * 11 + y * 7) * 0.15)
  );
}

/**
 * @typedef {Object} GarmentSpec
 * @property {number} hemY           bottom of the body
 * @property {number} shoulderY      top of the body, before the yoke
 * @property {number[]} halfWidth    body half-width control points, hem to shoulder
 * @property {number[]} halfDepth    body half-depth control points, hem to shoulder
 * @property {number} power          cross-section squareness
 * @property {number} neckX          neck opening half-width
 * @property {number} neckZ          neck opening half-depth
 * @property {number} neckRise       how far the neck sits above the shoulder
 * @property {number} collarH        rib collar height
 * @property {Object} sleeve         { attachY, r0, r1, length, droop, out, cuffRib }
 * @property {Object} [hood]         { length, rise, back, bulge }
 * @property {number} [hemRib]       hem band height
 * @property {number} [cloth]        drape amount
 */

/**
 * Build a garment mesh.
 * @param {GarmentSpec} spec
 * @param {[number,number,number,number]} uvBounds planar UV frame, shared with the painter
 */
export function garmentGeometry(spec, uvBounds) {
  const {
    hemY,
    shoulderY,
    halfWidth,
    halfDepth,
    power = 2.6,
    neckX,
    neckZ,
    neckRise,
    collarH = 0.05,
    sleeve,
    hood,
    hemRib = 0,
    cloth = 0,
    bodyRings = 26,
    yokeRings = 7,
  } = spec;

  const hw = profile(halfWidth);
  const hd = profile(halfDepth);
  const sw = new Sweep();

  // ---- hem rib, a small inward fold so the opening reads as a finished edge
  if (hemRib > 0) {
    sw.addRing(
      [...ANGLES.front, ...ANGLES.back].map((a) => {
        const [x, z] = section(a, hw(0) * 0.94, hd(0) * 0.94, power);
        return [x, hemY + hemRib * 0.55, z];
      }),
    );
    sw.addRing(
      [...ANGLES.front, ...ANGLES.back].map((a) => {
        const [x, z] = section(a, hw(0), hd(0), power);
        return [x, hemY, z];
      }),
    );
    sw.stitchLast();
  }

  // ---- torso
  for (let i = 0; i <= bodyRings; i++) {
    const t = i / bodyRings;
    const y = hemY + (shoulderY - hemY) * t;
    const W = hw(t);
    const D = hd(t);
    sw.addRing(
      [...ANGLES.front, ...ANGLES.back].map((a) => {
        const [x, z] = section(a, W, D, power);
        const d = drape(x, y, cloth) * (z >= 0 ? 1 : -1);
        return [x, y, z + d];
      }),
    );
    if (i > 0 || hemRib > 0) sw.stitchLast();
  }

  // ---- shoulder yoke, closing in and up to the neck opening
  const neckY = shoulderY + neckRise;
  for (let k = 1; k <= yokeRings; k++) {
    const s = k / yokeRings;
    // stay flat across the shoulder, then turn up sharply at the neck
    const rise = Math.pow(s, 1.7);
    const y = shoulderY + neckRise * rise;
    const W = hw(1) + (neckX - hw(1)) * smoothstep(s);
    const D = hd(1) + (neckZ - hd(1)) * smoothstep(s);
    const p = power + (2 - power) * s; // relax toward an ellipse at the neck
    sw.addRing(
      [...ANGLES.front, ...ANGLES.back].map((a) => {
        const [x, z] = section(a, W, D, p);
        return [x, y, z];
      }),
    );
    sw.stitchLast();
  }

  // ---- collar: out, up, and back down, so the rim has thickness
  const collarSteps = [
    [1.0, 0.0],
    [1.07, 0.5],
    [1.09, 1.0],
    [0.97, 0.96],
    [0.86, 0.58],
  ];
  for (const [scale, up] of collarSteps) {
    sw.addRing(
      [...ANGLES.front, ...ANGLES.back].map((a) => {
        const [x, z] = section(a, neckX * scale, neckZ * scale, 2);
        return [x, neckY + collarH * up, z];
      }),
    );
    sw.stitchLast();
  }

  // ---- hood, swept back and up from the collar
  if (hood) {
    const { length: hl = 9, rise = 0.5, back = 0.5, bulge = 1.9 } = hood;
    let last = null;
    for (let k = 1; k <= hl; k++) {
      const s = k / hl;
      // up and back, bulging out then folding down behind the shoulders
      const y = neckY + collarH * 0.6 + rise * Math.sin(s * Math.PI * 0.96);
      const zOff = -back * Math.pow(s, 1.15);
      const scale = 1 + (bulge - 1) * Math.sin(s * Math.PI * 0.9);
      const ring = [...ANGLES.front, ...ANGLES.back].map((a) => {
        const [x, z] = section(a, neckX * scale, neckZ * scale * 1.15, 2.2);
        return [x, y, z + zOff];
      });
      // the whole hood takes the back half of the texture: straddling the seam
      // put a bright edge straight down the middle of it
      last = sw.addRing(ring, k === 1 ? 0.62 : 0.86, -1);
      sw.stitchLast();
      if (k === hl) {
        sw.capToPoint(last, [0, y - 0.1, zOff - neckZ * scale * 0.8]);
      }
    }
  }

  const occlude = makeOccluder(spec, hw);
  const geo = sw.build(uvBounds, occlude);

  // ---- sleeves, built separately so they can use their own ring count
  const sleeves = [];
  for (const side of [-1, 1]) {
    sleeves.push(sleeveGeometry(spec, side, uvBounds, hw, occlude));
  }

  return { body: geo, sleeves };
}

/**
 * A tapered tube from inside the torso out to the cuff.
 *
 * Each ring is built in the plane perpendicular to the sleeve's centreline,
 * using a frame derived from the local tangent. Shearing a vertical ring along
 * the axis instead — the obvious shortcut — produces a cylinder pointing at the
 * camera rather than a sleeve hanging off a shoulder.
 */
function sleeveGeometry(spec, side, uvBounds, hw, occlude) {
  const { sleeve, cloth = 0 } = spec;
  const {
    attachY,
    r0,
    r1,
    length,
    droop = 0.45,
    curve = 0.3,
    cuffRib = 0.055,
    startFactor = 0.52,
    rings = 14,
  } = sleeve;

  const t0 = clamp01((attachY - spec.hemY) / (spec.shoulderY - spec.hemY));
  const startX = side * hw(t0) * startFactor;

  // centreline of the sleeve, drooping and curving as it leaves the shoulder
  const centre = (s) => {
    const a = length * s;
    return new THREE.Vector3(startX + side * a, attachY - droop * a - curve * a * a, 0);
  };

  const sw = new Sweep();
  const FRONT = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function ringAt(s, radius, slide = 0, squash = 0.86) {
    const c = centre(s);
    tmpA.copy(centre(Math.max(s - 0.02, 0)));
    tmpB.copy(centre(Math.min(s + 0.02, 1)));
    tangent.copy(tmpB).sub(tmpA).normalize();
    // FRONT x tangent stays in the XY plane, so a ring's z is purely its own
    // depth term and the front/back UV split keeps working
    perp.copy(FRONT).cross(tangent).normalize();
    if (slide) c.addScaledVector(tangent, slide);
    return [...ANGLES.front, ...ANGLES.back].map((th) => {
      const [w, f] = section(th, radius, radius * squash, 2.1);
      const d = drape(c.x + perp.x * w, c.y + perp.y * w, cloth * 0.5) * (f >= 0 ? 1 : -1);
      return [c.x + perp.x * w, c.y + perp.y * w, f + d];
    });
  }

  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    sw.addRing(ringAt(s, r0 + (r1 - r0) * smoothstep(s)));
    if (i > 0) sw.stitchLast();
  }

  // cuff rib: a short band that folds back inside, so the open end reads as a
  // finished hem rather than a length of pipe
  if (cuffRib > 0) {
    for (const [scale, slide, ao] of [
      [1.06, 0, 1],
      [1.06, cuffRib * 0.6, 0.95],
      [0.82, cuffRib * 0.85, 0.45],
      [0.55, cuffRib * 0.5, 0.26],
      [0.34, cuffRib * 0.1, 0.18],
    ]) {
      sw.addRing(ringAt(1, r1 * scale, slide), ao);
      sw.stitchLast();
    }
  }

  return sw.build(uvBounds, occlude);
}

/**
 * Catalogue of apparel. Shared UV bounds per garment keep the canvas painter
 * (collar dashes, hem line, print placement) aligned with the mesh.
 */
export const GARMENTS = {
  tee: {
    hemY: -1.02,
    shoulderY: 0.86,
    halfWidth: [0.615, 0.595, 0.605, 0.638, 0.665],
    halfDepth: [0.225, 0.238, 0.242, 0.222, 0.182],
    power: 2.15,
    neckX: 0.228,
    neckZ: 0.168,
    neckRise: 0.095,
    collarH: 0.036,
    hemRib: 0.045,
    cloth: 0.011,
    sleeve: {
      attachY: 0.63,
      r0: 0.235,
      r1: 0.192,
      length: 0.46,
      droop: 0.62,
      curve: 0.5,
      cuffRib: 0.05,
      startFactor: 0.82,
    },
  },
  hoodie: {
    hemY: -1.06,
    shoulderY: 0.88,
    halfWidth: [0.705, 0.685, 0.7, 0.735, 0.765],
    halfDepth: [0.272, 0.288, 0.292, 0.272, 0.235],
    power: 2.1,
    neckX: 0.262,
    neckZ: 0.2,
    neckRise: 0.085,
    collarH: 0.042,
    hemRib: 0.07,
    cloth: 0.014,
    sleeve: {
      attachY: 0.64,
      r0: 0.27,
      r1: 0.165,
      length: 0.88,
      droop: 0.66,
      curve: 0.38,
      cuffRib: 0.07,
      startFactor: 0.8,
    },
    hood: { length: 10, rise: 0.46, back: 0.66, bulge: 1.72 },
  },
};

/** Bounds used for the planar UV frame and for the canvas painter. */
export const GARMENT_BOUNDS = {
  tee: [-1.22, -1.16, 1.22, 1.1],
  hoodie: [-1.62, -1.26, 1.62, 1.3],
};
