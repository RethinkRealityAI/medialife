// The outside of Happi's house: a New York brownstone the Japan Parade has moved into. Brick front with a stone
// base and a cream cornice, a vermilion torii framing the arched door, red paper lanterns, tiled machiya eaves over
// shoji-style windows with bonsai on the sills, a cherry tree and a stone lantern in a raked-gravel garden, stepping
// stones to the door and a rooftop water tank. An original design (no logos, no copied artwork). Flat colours only.
//
// Split in two so the portal can hide what would otherwise stand inside the (much bigger) room:
//   front  everything at z >= -0.2 (the facade, the door frame, windows, garden): always drawn
//   body   the house behind the facade (side and back walls, the roof, the water tank, the side tree): hidden while
//          you're inside. Its walls are single-sided and face outwards, so looking in through the door you never
//          see their inner faces: you see the room.
import * as THREE from 'three';
import { RAINBOW } from '../fx';
import { COT, DOOR, DOOR_H0, DOOR_R } from './dims';
import { Builder, M, archShape, bandShape, box, cyl, dome, extrude, puff, starShape } from './geo';
import { HP, bonsai, chochin, sakura, torii, toro, waterTower } from '../../../happi/kit3d';

export const COL = {
  wall: HP.brick, wallSide: HP.brickDark, trim: HP.cream, roof: 0x3b4252, cloud: 0xffffff, cloudLilac: HP.sakuraLight,
  door: HP.woodDark, pane: HP.sky, heart: HP.sakuraDeep, leaf: HP.leafLight, leafDark: HP.leaf, lilac: HP.woodDark,
  chimney: HP.woodDark, sun: 0xffc93c, sunRay: HP.orange, stone: [HP.stone, 0xc9c4ba, HP.stoneDark, 0xb0aba1],
};

/** Facade height (flat top: a brownstone, not a gable). */
const FH = 3.4;

/** The house's front outline, bottom at y = 0. */
export function facadeShape(withDoor: boolean): THREE.Shape {
  const s = new THREE.Shape(), w = COT.w / 2;
  s.moveTo(-w, 0);
  s.lineTo(w, 0);
  s.lineTo(w, FH);
  s.lineTo(-w, FH);
  s.lineTo(-w, 0);
  if (withDoor) {
    const hole = new THREE.Path();
    archShape(DOOR.w, DOOR.h, hole, true);
    s.holes.push(hole);
  }
  return s;
}

/** Height of the roof line at x (flat). */
export function gableY(_x: number): number {
  return FH;
}

/** A door frame of six arched bands (inner trim first), legs to the floor, facing +z. */
export function rainbowFrame(b: Builder, m: THREE.Matrix4, ri0: number, h0: number, band: number, depth: number, trim = 0.05, cols: number[] = RAINBOW, trimCol = COL.trim): void {
  b.add(extrude(bandShape(ri0, ri0 + trim, h0), depth), trimCol, m);
  for (let i = 0; i < 6; i++) {
    const ri = ri0 + trim + i * band;
    b.add(extrude(bandShape(ri, ri + band, h0), depth + 0.004 * (6 - i)), cols[5 - i], m);
  }
}

export interface Exterior {
  front: THREE.BufferGeometry;
  body: THREE.BufferGeometry;
  /** Unlit bits (the sun). */
  glow: THREE.BufferGeometry;
  /** Where the roof puffs from (door-local): the top of the water tank. */
  chimneyTop: THREE.Vector3;
  /** The sun's centre (door-local); its mesh is built separately so it can turn. */
  sunAt: THREE.Vector3;
}

/** A tiled machiya eave (hisashi) from x0 to x1 at height y, sloping down towards +z. */
function eave(b: Builder, x0: number, x1: number, y: number): void {
  const len = x1 - x0, cx = (x0 + x1) / 2, depth = 0.55, tilt = 0.42;
  b.add(box(len, 0.05, depth), COL.roof, M(cx, y, depth / 2 - 0.02, tilt));
  const n = Math.max(3, Math.round(len / 0.13));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (len * i) / n;
    b.add(cyl(0.028, 0.028, depth, 6), 0x4a5262, M(x, y + 0.035, depth / 2 - 0.02, tilt + Math.PI / 2));
  }
  b.add(cyl(0.04, 0.04, len + 0.04, 8), 0x2c3240, M(cx, y - Math.sin(tilt) * depth * 0.5 + 0.01, depth - 0.02, 0, 0, Math.PI / 2));
  b.add(box(len, 0.05, 0.08), 0x2c3240, M(cx, y + Math.sin(tilt) * depth * 0.5 + 0.02, 0.02));
}

/** A shoji-style window: cream stone surround, dark frame, sky glass with a white lattice. */
function shojiWindow(b: Builder, x: number, y: number, w: number, h: number): void {
  b.add(box(w + 0.18, h + 0.18, 0.04), COL.trim, M(x, y, 0.02));
  b.add(box(w + 0.04, h + 0.04, 0.05), HP.woodDark, M(x, y, 0.03));
  b.add(box(w, h, 0.02), COL.pane, M(x, y, 0.05));
  for (let i = 1; i < 3; i++) b.add(box(0.018, h, 0.02), 0xffffff, M(x - w / 2 + (w * i) / 3, y, 0.065));
  for (let j = 1; j < 4; j++) b.add(box(w, 0.018, 0.02), 0xffffff, M(x, y - h / 2 + (h * j) / 4, 0.065));
  b.add(box(w + 0.3, 0.1, 0.12), COL.trim, M(x, y + h / 2 + 0.14, 0.06)); // lintel
}

export function buildExterior(): Exterior {
  const F = new Builder(), B = new Builder();
  const w = COT.w / 2, t = COT.t, d = COT.d;

  // ---- facade (with the door hole), extruded towards the room
  F.add(extrude(facadeShape(true), t, 0, 24), COL.wall, M(0, 0, -t));
  // brick courses (skip the doorway)
  const gap = DOOR_R + 0.24;
  for (let y = 0.62; y < FH - 0.2; y += 0.2) {
    if (y < DOOR.h + 0.1) {
      for (const sx of [-1, 1]) F.add(box(w - gap, 0.014, 0.006), HP.brickDark, M(sx * (gap + w) / 2, y, 0.003));
    } else F.add(box(2 * w, 0.014, 0.006), HP.brickDark, M(0, y, 0.003));
  }
  // stone base either side of the door, cream cornice with dentils on top
  for (const sx of [-1, 1]) F.add(box(w - gap + 0.02, 0.5, 0.06), HP.stoneDark, M(sx * (gap + w) / 2, 0.25, 0.03));
  F.add(box(2 * w + 0.3, 0.24, 0.42), COL.trim, M(0, FH + 0.08, 0.0));
  F.add(box(2 * w + 0.36, 0.06, 0.48), HP.cream, M(0, FH + 0.22, 0.0));
  for (let i = 0; i < 16; i++) F.add(box(0.07, 0.08, 0.06), COL.trim, M(-w + 0.1 + (i * (2 * w - 0.2)) / 15, FH - 0.08, 0.2));
  // corner quoins
  for (const sx of [-1, 1]) for (let k = 0; k < 8; k++) F.add(box(k % 2 ? 0.2 : 0.3, 0.18, 0.04), COL.trim, M(sx * (w - (k % 2 ? 0.1 : 0.15)), 0.62 + k * 0.33, 0.02));

  // ---- the torii round the arched door, with the door's own wooden surround
  F.add(extrude(bandShape(DOOR_R, DOOR_R + 0.07, DOOR_H0), 0.05), HP.woodDark, M(0, 0, 0));
  torii(F, M(0, 0, 0.16), 2 * (DOOR_R + 0.2), 2.95);
  // red lanterns hanging either side from little iron brackets
  for (const sx of [-1, 1]) {
    const x = sx * (DOOR_R + 0.52);
    F.add(box(0.025, 0.025, 0.36), HP.iron, M(x, 2.28, 0.18));
    F.add(cyl(0.006, 0.006, 0.1, 4), HP.iron, M(x, 2.23, 0.35));
    chochin(F, M(x, 2.18, 0.35), 0.38);
  }

  // ---- shoji windows under tiled eaves, bonsai on the sills, small windows above
  for (const sx of [-1, 1]) {
    const x = sx * 1.36;
    shojiWindow(F, x, 1.38, 0.66, 0.86);
    F.add(box(0.86, 0.06, 0.24), COL.trim, M(x, 0.9, 0.1));
    bonsai(F, M(x, 0.93, 0.11), 0.36);
    eave(F, sx > 0 ? DOOR_R + 0.42 : -w - 0.08, sx > 0 ? w + 0.08 : -DOOR_R - 0.42, 2.12);
    shojiWindow(F, x, 2.78, 0.56, 0.5);
  }

  // ---- the doorstep, stepping stones and the raked-gravel garden
  F.add(new THREE.CylinderGeometry(0.82, 0.86, 0.06, 36, 1, false, -Math.PI / 2, Math.PI), HP.stone, M(0, 0.03, 0));
  [[0.06, 1.0, 0.36], [-0.1, 1.62, 0.32], [0.08, 2.2, 0.34], [-0.04, 2.8, 0.3]].forEach(([x, z, r], i) => {
    F.add(cyl(r, r * 1.04, 0.035, 18), COL.stone[i % COL.stone.length], M(x, 0.0175, z, 0, i * 0.7, 0, 1, 1, 0.8));
  });
  for (const sx of [-1, 1]) {
    const gx = sx * (w - 0.55);
    F.add(box(1.25, 0.012, 1.0), 0xe9e5dc, M(gx, 0.006, 0.62));
    for (let k = 0; k < 6; k++) F.add(box(1.2, 0.006, 0.02), 0xd3cec3, M(gx, 0.014, 0.2 + k * 0.17));
    F.add(dome(0.2, 0.65, 12), HP.stoneDark, M(gx + sx * 0.25, 0.01, 0.75));
    F.add(dome(0.12, 0.7, 10), HP.stone, M(gx + sx * 0.02, 0.01, 0.92));
    // clipped round shrubs along the wall
    F.add(puff(0.2, 0.75, 12), HP.leaf, M(sx * (DOOR_R + 0.42), 0.12, 0.2));
    F.add(puff(0.16, 0.75, 12), HP.leafLight, M(sx * (w - 0.12), 0.1, 0.22));
  }
  toro(F, M(w - 0.3, 0, 0.75), 0.85);
  sakura(F, M(-w - 0.15, 0, 0.75), 2.7, 1);

  // ---- body: side and back walls (single-sided, facing out), the flat roof, the water tank
  for (const sx of [-1, 1]) {
    const pg = new THREE.PlaneGeometry(d - t, FH);
    B.add(pg, COL.wallSide, M(sx * w, FH / 2, -t - (d - t) / 2, 0, sx * Math.PI / 2));
    // a round window (marumado) on each side
    const ring = new THREE.RingGeometry(0.22, 0.3, 28);
    B.add(ring, COL.trim, M(sx * (w + 0.005), 1.5, -d * 0.55, 0, sx * Math.PI / 2));
    B.add(new THREE.CircleGeometry(0.22, 28), COL.pane, M(sx * (w + 0.004), 1.5, -d * 0.55, 0, sx * Math.PI / 2));
    B.add(box(0.01, 0.44, 0.02), 0xffffff, M(sx * (w + 0.008), 1.5, -d * 0.55));
    B.add(box(0.01, 0.02, 0.44), 0xffffff, M(sx * (w + 0.008), 1.5, -d * 0.55));
    for (let y = 0.62; y < FH - 0.2; y += 0.2) B.add(box(0.006, 0.014, d - t), HP.brickDark, M(sx * (w + 0.003), y, -t - (d - t) / 2));
  }
  B.add(new THREE.ShapeGeometry(facadeShape(false), 4), COL.wallSide, M(0, 0, -d, 0, Math.PI));
  B.add(box(2 * w + 0.1, 0.12, d + 0.05), 0x5b4a44, M(0, FH + 0.02, -d / 2));
  for (const sx of [-1, 1]) B.add(box(0.12, 0.3, d), COL.trim, M(sx * (w - 0.02), FH + 0.15, -d / 2 - 0.1));
  const tx = 0.75, tz = -d * 0.6, th = 1.25;
  waterTower(B, M(tx, FH + 0.08, tz), th);
  // a cherry tree beside the house
  sakura(B, M(w + 0.85, 0, -d * 0.55), 2.6, 2);

  // ---- the sun (unlit), drawn separately so it can turn
  const G = new Builder();
  G.add(extrude(new THREE.Shape().absarc(0, 0, 0.3, 0, Math.PI * 2, false) as THREE.Shape, 0.06, 0.015, 32), COL.sun);
  G.add(extrude(new THREE.Shape().absarc(0, 0, 0.21, 0, Math.PI * 2, false) as THREE.Shape, 0.02, 0, 32), 0xffe08a, M(0, 0, 0.075));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, len = i % 2 ? 0.15 : 0.22;
    const s = new THREE.Shape();
    s.moveTo(-0.06, 0); s.lineTo(0.06, 0); s.lineTo(0, len); s.closePath();
    G.add(extrude(s, 0.04), i % 2 ? COL.sunRay : COL.sun, M(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.01, 0, 0, a - Math.PI / 2));
  }
  G.add(extrude(starShape(0.07, 0.03), 0.01), 0xffffff, M(-0.1, 0.1, 0.1));

  return {
    front: F.build(), body: B.build(), glow: G.build(),
    chimneyTop: new THREE.Vector3(tx, FH + 0.08 + th + 0.1, tz),
    sunAt: new THREE.Vector3(-w - 0.4, FH + 0.9, 0.2),
  };
}

/** The door itself (separate so it can swing open into the room): hinge on the left, local x from 0 to the width.
 *  Dark wood with a round lattice window and a brass ring pull. */
export function buildDoorLeaf(): THREE.BufferGeometry {
  const L = new Builder(), w = DOOR.w - 0.03, h = DOOR.h - 0.015, dz = 0.05;
  const shape = archShape(w, h) as THREE.Shape;
  L.add(extrude(shape, dz, 0, 24), COL.door, M(w / 2, 0, -dz / 2));
  for (const side of [-1, 1]) {
    const z = side * (dz / 2 + 0.004);
    L.add(new THREE.RingGeometry(0.2, 0.25, 32), HP.wood, M(w / 2, 1.42, z, 0, side > 0 ? 0 : Math.PI));
    L.add(new THREE.CircleGeometry(0.2, 32), COL.pane, M(w / 2, 1.42, z - side * 0.002, 0, side > 0 ? 0 : Math.PI));
    L.add(box(0.02, 0.4, 0.012), 0xffffff, M(w / 2, 1.42, z));
    L.add(box(0.4, 0.02, 0.012), 0xffffff, M(w / 2, 1.42, z));
    for (const y of [0.35, 0.75]) L.add(box(w * 0.7, 0.025, 0.01), HP.wood, M(w / 2, y, z));
    L.add(new THREE.TorusGeometry(0.05, 0.012, 8, 20), HP.gold, M(w - 0.13, 1.0, side * 0.04));
  }
  return L.build();
}
