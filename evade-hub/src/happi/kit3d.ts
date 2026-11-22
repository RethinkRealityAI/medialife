// Happi's world kit: everything built in code from three.js primitives (flat colours, vertex colours, no textures,
// no gradients), so nothing in his world comes from another brand's assets. A New York street that the Japan Parade
// has come to: brownstones and a water tower next to a vermilion torii, cherry trees, bonsai, stone and paper
// lanterns, a red post box and a yellow cab with a lantern on the roof.
//
// Pieces are merged per object into one geometry (Builder from the house kit) and drawn with one Standard material.
import * as THREE from 'three';
import { Builder, M, box, cyl, dome, puff, roundRect, extrude } from '../experience/scene/house/geo';

export const HP = {
  orange: 0xf37321, navy: 0x283a8f, sky: 0xa9e0f5, red: 0xd8312a, vermilion: 0xe0452b, white: 0xffffff,
  ink: 0x1b2340, wood: 0x9a6440, woodDark: 0x6b4129, hinoki: 0xe8c08a, hinokiDark: 0xc99a62,
  sakura: 0xffb7c9, sakuraDeep: 0xff94b0, sakuraLight: 0xffd9e3, bark: 0x5a3a2e,
  leaf: 0x4f8f4a, leafLight: 0x6fae5c, stone: 0xbdb8ae, stoneDark: 0x8f8a80, brick: 0xa4533c, brickDark: 0x7d3a2a,
  cream: 0xf4ead8, tatami: 0xcdbf83, tatamiEdge: 0x2f4a33, gold: 0xe6b54a, cab: 0xf6c21a, iron: 0x2b2b30,
  paper: 0xfff4e2, water: 0x8fd0e8, pot: 0x2f4f7a,
};

let MAT: THREE.MeshStandardMaterial | null = null;
/** The one shared material for code-built pieces (vertex colours, matte). */
export function kitMat(): THREE.MeshStandardMaterial {
  return (MAT ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 }));
}
export function meshOf(b: Builder, name: string): THREE.Mesh {
  const m = new THREE.Mesh(b.build(), kitMat());
  m.name = name;
  m.castShadow = false;
  return m;
}

// ------------------------------------------------------------------ reusable pieces (add into a Builder at a matrix)
const T = new THREE.Matrix4();
const at = (base: THREE.Matrix4 | undefined, m: THREE.Matrix4) => (base ? T.multiplyMatrices(base, m).clone() : m);

/** A cherry tree: a leaning trunk with two branches and clusters of blossom (about `h` tall). */
export function sakura(b: Builder, base?: THREE.Matrix4, h = 2.2, seed = 0): void {
  const s = h / 2.2, r = (k: number) => Math.sin(seed * 12.9 + k * 78.2) * 0.5 + 0.5;
  b.add(cyl(0.07 * s, 0.12 * s, 1.2 * s, 9), HP.bark, at(base, M(0, 0.6 * s, 0, 0, 0, 0.08)));
  b.add(cyl(0.045 * s, 0.07 * s, 0.75 * s, 8), HP.bark, at(base, M(-0.28 * s, 1.35 * s, 0, 0, 0, 0.75)));
  b.add(cyl(0.04 * s, 0.065 * s, 0.7 * s, 8), HP.bark, at(base, M(0.25 * s, 1.4 * s, 0.05 * s, 0.2, 0, -0.65)));
  b.add(dome(0.2 * s, 0.5, 10), HP.leaf, at(base, M(0, 0, 0)));
  const puffs: Array<[number, number, number, number]> = [
    [0, 1.85, 0, 0.5], [-0.55, 1.62, 0.05, 0.4], [0.52, 1.66, 0.1, 0.42], [-0.2, 2.02, -0.2, 0.36],
    [0.25, 2.05, 0.15, 0.34], [0.05, 1.55, 0.35, 0.34], [-0.4, 1.8, -0.3, 0.3], [0.45, 1.88, -0.25, 0.3],
  ];
  puffs.forEach(([x, y, z, rr], i) => {
    const c = i % 3 === 0 ? HP.sakuraDeep : i % 3 === 1 ? HP.sakura : HP.sakuraLight;
    b.add(puff(rr * s * (0.9 + 0.2 * r(i)), 0.82, 12), c, at(base, M(x * s, y * s, z * s)));
  });
}

/** A bonsai in a low navy pot (about `h` tall): a twisting trunk and flat cloud pads of leaves. */
export function bonsai(b: Builder, base?: THREE.Matrix4, h = 0.55): void {
  const s = h / 0.55;
  b.add(box(0.4 * s, 0.1 * s, 0.26 * s), HP.pot, at(base, M(0, 0.05 * s, 0)));
  b.add(box(0.44 * s, 0.025 * s, 0.3 * s), HP.ink, at(base, M(0, 0.1 * s, 0)));
  b.add(box(0.38 * s, 0.01 * s, 0.22 * s), 0x6b5a45, at(base, M(0, 0.115 * s, 0)));
  b.add(cyl(0.025 * s, 0.04 * s, 0.22 * s, 7), HP.bark, at(base, M(0.03 * s, 0.22 * s, 0, 0, 0, -0.35)));
  b.add(cyl(0.02 * s, 0.03 * s, 0.2 * s, 7), HP.bark, at(base, M(0.02 * s, 0.38 * s, 0, 0, 0, 0.6)));
  b.add(puff(0.14 * s, 0.45, 10), HP.leaf, at(base, M(-0.08 * s, 0.47 * s, 0)));
  b.add(puff(0.1 * s, 0.45, 10), HP.leafLight, at(base, M(0.12 * s, 0.38 * s, 0.03 * s)));
  b.add(puff(0.09 * s, 0.45, 10), HP.leafLight, at(base, M(-0.02 * s, 0.53 * s, -0.04 * s)));
}

/** A stone lantern (toro), about `h` tall. */
export function toro(b: Builder, base?: THREE.Matrix4, h = 0.9): void {
  const s = h / 0.9;
  b.add(cyl(0.16 * s, 0.18 * s, 0.08 * s, 6), HP.stoneDark, at(base, M(0, 0.04 * s, 0)));
  b.add(cyl(0.06 * s, 0.07 * s, 0.34 * s, 8), HP.stone, at(base, M(0, 0.25 * s, 0)));
  b.add(cyl(0.17 * s, 0.12 * s, 0.06 * s, 6), HP.stoneDark, at(base, M(0, 0.45 * s, 0)));
  b.add(box(0.2 * s, 0.16 * s, 0.2 * s), HP.stone, at(base, M(0, 0.56 * s, 0)));
  b.add(box(0.1 * s, 0.08 * s, 0.205 * s), 0xffd77a, at(base, M(0, 0.56 * s, 0)));
  b.add(cyl(0.02 * s, 0.26 * s, 0.14 * s, 6), HP.stoneDark, at(base, M(0, 0.71 * s, 0)));
  b.add(puff(0.04 * s, 1, 8), HP.stone, at(base, M(0, 0.8 * s, 0)));
}

/** A round paper lantern (chochin), red with a white band, hanging from y = 0 down by `h`. */
export function chochin(b: Builder, base?: THREE.Matrix4, h = 0.34, col = HP.red): void {
  const s = h / 0.34;
  b.add(cyl(0.05 * s, 0.05 * s, 0.03 * s, 10), HP.ink, at(base, M(0, -0.015 * s, 0)));
  b.add(puff(0.13 * s, 1.15, 14), col, at(base, M(0, -0.17 * s, 0)));
  b.add(cyl(0.132 * s, 0.132 * s, 0.05 * s, 16, true), HP.white, at(base, M(0, -0.17 * s, 0)));
  b.add(cyl(0.05 * s, 0.05 * s, 0.03 * s, 10), HP.ink, at(base, M(0, -0.32 * s, 0)));
}

/** A vermilion torii gate, posts at x = +-w/2, top at h. */
export function torii(b: Builder, base?: THREE.Matrix4, w = 2.4, h = 2.6): void {
  const p = 0.13;
  for (const sx of [-1, 1]) {
    b.add(cyl(p * 0.8, p, h - 0.25, 14), HP.vermilion, at(base, M(sx * w / 2, (h - 0.25) / 2, 0)));
    b.add(cyl(p * 1.15, p * 1.15, 0.22, 14), HP.ink, at(base, M(sx * w / 2, 0.11, 0)));
  }
  // nuki (lower tie beam) and kasagi (curved top, black cap)
  b.add(box(w + 0.5, 0.14, 0.14), HP.vermilion, at(base, M(0, h - 0.62, 0)));
  b.add(box(0.16, 0.42, 0.1), HP.vermilion, at(base, M(0, h - 0.4, 0)));
  const top = new THREE.Shape();
  const L = w / 2 + 0.55;
  top.moveTo(-L, 0.06); top.quadraticCurveTo(0, -0.12, L, 0.06); top.lineTo(L + 0.02, 0.22); top.quadraticCurveTo(0, 0.04, -L - 0.02, 0.22); top.closePath();
  b.add(extrude(top, 0.22), HP.vermilion, at(base, M(0, h - 0.24, -0.11)));
  const cap = new THREE.Shape();
  cap.moveTo(-L - 0.02, 0.2); cap.quadraticCurveTo(0, 0.02, L + 0.02, 0.2); cap.lineTo(L + 0.06, 0.3); cap.quadraticCurveTo(0, 0.1, -L - 0.06, 0.3); cap.closePath();
  b.add(extrude(cap, 0.26), HP.ink, at(base, M(0, h - 0.24, -0.13)));
  // the plaque (gakuzuka) under the top: navy with a white circle
  b.add(box(0.36, 0.3, 0.05), HP.navy, at(base, M(0, h - 0.38, 0.08)));
  b.add(cyl(0.08, 0.08, 0.01, 18), HP.white, at(base, M(0, h - 0.38, 0.11, Math.PI / 2)));
}

/** A New York brownstone front, about `w` wide and `h` tall: stoop, tall windows, cornice. Faces +z. */
export function brownstone(b: Builder, base?: THREE.Matrix4, w = 2.2, h = 4.2, col = HP.brick): void {
  b.add(box(w, h, 0.6), col, at(base, M(0, h / 2, -0.3)));
  b.add(box(w + 0.16, 0.18, 0.75), HP.cream, at(base, M(0, h + 0.02, -0.3))); // cornice
  for (let i = 0; i < 4; i++) b.add(box(0.08, 0.16, 0.12), HP.cream, at(base, M(-w / 2 + 0.2 + i * ((w - 0.4) / 3), h - 0.12, 0.05)));
  const rows = Math.max(1, Math.floor((h - 1.4) / 1.0));
  for (let r = 0; r < rows; r++) for (let c = 0; c < 3; c++) {
    const x = -w / 2 + w * (c + 0.5) / 3, y = 1.6 + r * 1.0;
    b.add(box(0.42, 0.66, 0.04), HP.cream, at(base, M(x, y, 0.01)));
    b.add(box(0.32, 0.56, 0.04), 0x34466b, at(base, M(x, y, 0.025)));
    b.add(box(0.32, 0.03, 0.05), HP.cream, at(base, M(x, y + 0.05, 0.03)));
  }
  // stoop
  for (let k = 0; k < 4; k++) b.add(box(0.8, 0.12, 0.25), HP.stoneDark, at(base, M(w / 2 - 0.55, 0.06 + k * 0.12, 0.6 - k * 0.2)));
  b.add(box(0.5, 0.9, 0.04), HP.woodDark, at(base, M(w / 2 - 0.55, 0.95, 0.01)));
}

/** A rooftop water tank on legs (the New York skyline's signature), about `h` tall. */
export function waterTower(b: Builder, base?: THREE.Matrix4, h = 1.2): void {
  const s = h / 1.2;
  for (const [x, z] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) b.add(cyl(0.025 * s, 0.025 * s, 0.4 * s, 6), HP.iron, at(base, M(x * s, 0.2 * s, z * s)));
  b.add(cyl(0.34 * s, 0.34 * s, 0.55 * s, 18), HP.woodDark, at(base, M(0, 0.68 * s, 0)));
  for (const y of [0.5, 0.68, 0.86]) b.add(cyl(0.345 * s, 0.345 * s, 0.025 * s, 18), HP.iron, at(base, M(0, y * s, 0)));
  b.add(cyl(0.02 * s, 0.38 * s, 0.25 * s, 18), HP.iron, at(base, M(0, 1.08 * s, 0)));
}

// ------------------------------------------------------------------ props (replace the old house props)
/** The TV: an orange retro set on a low wooden chest. 1 tall; the screen opening is 0.355 x 0.285 at (-0.058, 0.782),
 *  its plane at z = 0.215 (the same spot the room and party set put the theme video). */
function tv(): THREE.Object3D {
  const b = new Builder();
  b.add(box(0.7, 0.4, 0.42), HP.wood, M(0, 0.26, 0));
  for (const y of [0.17, 0.33]) {
    b.add(box(0.62, 0.006, 0.01), HP.woodDark, M(0, y + 0.08, 0.212));
    for (const x of [-0.17, 0.17]) b.add(box(0.08, 0.02, 0.02), HP.iron, M(x, y, 0.218));
  }
  for (const x of [-0.31, 0.31]) for (const z of [-0.17, 0.17]) b.add(box(0.05, 0.06, 0.05), HP.woodDark, M(x, 0.03, z));
  b.add(box(0.64, 0.46, 0.4), HP.orange, M(0, 0.71, 0));
  b.add(box(0.66, 0.03, 0.42), HP.navy, M(0, 0.95, 0));
  b.add(box(0.41, 0.33, 0.01), HP.navy, M(-0.058, 0.782, 0.204));
  b.add(box(0.13, 0.36, 0.01), 0xd95f17, M(0.22, 0.73, 0.204));
  for (const y of [0.84, 0.72]) b.add(cyl(0.035, 0.035, 0.02, 16), HP.white, M(0.22, y, 0.212, Math.PI / 2));
  for (let k = 0; k < 4; k++) b.add(box(0.09, 0.008, 0.006), HP.navy, M(0.22, 0.6 + k * 0.02, 0.21));
  const g = new THREE.Group();
  g.add(meshOf(b, 'tv-body'));
  return g;
}

/** A stepped tansu chest (kaidan-dansu) with a bonsai, a red daruma and books on its steps. */
function shelf(): THREE.Object3D {
  const b = new Builder();
  const W = 1.0, D = 0.42;
  for (let i = 0; i < 4; i++) {
    const x0 = -W / 2 + i * 0.25, hh = 0.3 * (4 - i);
    b.add(box(0.25, hh, D), i % 2 ? HP.wood : 0x8c5838, M(x0 + 0.125, hh / 2, 0));
    for (let r = 0; r < 4 - i; r++) {
      b.add(box(0.22, 0.004, 0.01), HP.woodDark, M(x0 + 0.125, 0.3 * (r + 1) - 0.005, D / 2 + 0.002));
      b.add(box(0.06, 0.018, 0.02), HP.iron, M(x0 + 0.125, 0.3 * r + 0.15, D / 2 + 0.008));
    }
  }
  // things on the steps (stepped down to the right)
  bonsai(b, M(-0.375, 1.2, 0), 0.34);
  b.add(puff(0.08, 1.05, 14), HP.red, M(-0.125, 0.98, 0.02));
  b.add(cyl(0.05, 0.05, 0.01, 14), HP.white, M(-0.125, 0.99, 0.095, Math.PI / 2));
  b.add(cyl(0.012, 0.012, 0.012, 8), HP.ink, M(-0.14, 1.0, 0.1, Math.PI / 2));
  b.add(cyl(0.012, 0.012, 0.012, 8), HP.ink, M(-0.11, 1.0, 0.1, Math.PI / 2));
  [HP.navy, HP.orange, HP.sky, HP.white, HP.red].forEach((c, i) => b.add(box(0.03, 0.17 - (i % 2) * 0.03, 0.16), c, M(0.06 + i * 0.033, 0.6 + (0.17 - (i % 2) * 0.03) / 2, 0)));
  b.add(cyl(0.06, 0.05, 0.1, 12), HP.white, M(0.375, 0.35, 0));
  b.add(puff(0.05, 0.6, 10), HP.leafLight, M(0.375, 0.42, 0));
  const g = new THREE.Group();
  g.add(meshOf(b, 'tansu'));
  return g;
}

/** A round hinoki wood tub with copper hoops, water, a little bucket and a yellow rubber duck. */
function tub(): THREE.Object3D {
  const b = new Builder();
  b.add(cyl(0.45, 0.42, 0.58, 28, true), HP.hinoki, M(0, 0.29, 0));
  b.add(cyl(0.4, 0.38, 0.56, 28, true), HP.hinokiDark, M(0, 0.29, 0, Math.PI));
  b.add(cyl(0.42, 0.42, 0.02, 28), HP.hinokiDark, M(0, 0.02, 0));
  for (const y of [0.12, 0.46]) b.add(cyl(0.455, 0.455, 0.035, 28, true), 0xb86b3a, M(0, y, 0));
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    b.add(box(0.006, 0.56, 0.006), HP.hinokiDark, M(Math.cos(a) * 0.437, 0.29, Math.sin(a) * 0.437, 0, -a));
  }
  b.add(cyl(0.39, 0.39, 0.01, 28), HP.water, M(0, 0.5, 0));
  b.add(puff(0.06, 0.9, 10), HP.cab, M(0.12, 0.54, 0.08));
  b.add(puff(0.04, 1, 10), HP.cab, M(0.17, 0.6, 0.1));
  b.add(box(0.03, 0.012, 0.03), HP.orange, M(0.215, 0.6, 0.11));
  b.add(cyl(0.12, 0.1, 0.16, 16), HP.hinoki, M(0.55, 0.08, 0.25));
  b.add(cyl(0.125, 0.125, 0.02, 16, true), 0xb86b3a, M(0.55, 0.13, 0.25));
  const g = new THREE.Group();
  g.add(meshOf(b, 'hinoki-tub'));
  return g;
}

/** A standing round mirror in a vermilion lacquer frame. Faces +z. */
function mirror(): THREE.Object3D {
  const b = new Builder();
  b.add(new THREE.TorusGeometry(0.4, 0.05, 10, 40), HP.vermilion, M(0, 1.0, 0));
  b.add(new THREE.CircleGeometry(0.4, 40), 0xd9ecf4, M(0, 1.0, 0.004));
  b.add(new THREE.CircleGeometry(0.4, 40), HP.vermilion, M(0, 1.0, -0.004, 0, Math.PI));
  for (const sx of [-1, 1]) b.add(cyl(0.025, 0.03, 1.1, 8), HP.ink, M(sx * 0.46, 0.55, 0));
  b.add(box(1.06, 0.06, 0.32), HP.ink, M(0, 0.03, 0));
  b.add(box(0.12, 0.6, 0.004), HP.white, M(-0.14, 1.08, 0.006, 0, 0, 0.5));
  const g = new THREE.Group();
  g.add(meshOf(b, 'mirror'));
  return g;
}

/** A red cylindrical street post box with a black cap. */
function mailbox(): THREE.Object3D {
  const b = new Builder();
  b.add(cyl(0.22, 0.22, 0.06, 20), HP.iron, M(0, 0.03, 0));
  b.add(cyl(0.18, 0.18, 0.62, 24), HP.red, M(0, 0.37, 0));
  b.add(cyl(0.2, 0.2, 0.06, 24), HP.iron, M(0, 0.71, 0));
  b.add(dome(0.2, 0.35, 20), HP.iron, M(0, 0.74, 0));
  b.add(box(0.2, 0.03, 0.02), HP.iron, M(0, 0.6, 0.18));
  b.add(box(0.15, 0.12, 0.02), HP.white, M(0, 0.4, 0.175));
  b.add(box(0.1, 0.02, 0.022), HP.red, M(0, 0.42, 0.177));
  const g = new THREE.Group();
  g.add(meshOf(b, 'post-box'));
  return g;
}

/** A chunky yellow cab with a checker band and a red paper lantern on the roof. Faces +z. */
function car(): THREE.Object3D {
  const b = new Builder();
  const body = roundRect(0.7, 0.28, 0.1);
  b.add(extrude(body, 1.3, 0.03, 8), HP.cab, M(0, 0.32, -0.65));
  b.add(extrude(roundRect(0.6, 0.26, 0.09), 0.72, 0.02, 8), HP.cab, M(0, 0.56, -0.42));
  for (const sx of [-1, 1]) {
    b.add(box(0.012, 0.18, 0.62), HP.sky, M(sx * 0.311, 0.59, -0.06));
    b.add(box(0.014, 0.18, 0.03), HP.cab, M(sx * 0.312, 0.59, -0.06));
    for (let k = 0; k < 12; k++) b.add(box(0.012, 0.035, 0.1), k % 2 ? HP.ink : HP.white, M(sx * 0.372, 0.36, -0.55 + k * 0.1));
    for (const z of [-0.4, 0.42]) {
      b.add(cyl(0.13, 0.13, 0.1, 18), HP.iron, M(sx * 0.33, 0.13, z, 0, 0, Math.PI / 2));
      b.add(cyl(0.06, 0.06, 0.104, 14), HP.white, M(sx * 0.33, 0.13, z, 0, 0, Math.PI / 2));
    }
  }
  b.add(box(0.5, 0.17, 0.012), HP.sky, M(0, 0.6, 0.31));
  b.add(box(0.5, 0.17, 0.012), HP.sky, M(0, 0.6, -0.43));
  for (const sx of [-1, 1]) b.add(cyl(0.05, 0.05, 0.02, 14), HP.white, M(sx * 0.24, 0.38, 0.67, Math.PI / 2));
  b.add(box(0.5, 0.05, 0.03), HP.iron, M(0, 0.24, 0.68));
  b.add(box(0.5, 0.05, 0.03), HP.iron, M(0, 0.24, -0.68));
  b.add(cyl(0.02, 0.03, 0.05, 8), HP.ink, M(0, 0.71, -0.05));
  chochin(b, M(0, 0.93, -0.05), 0.2);
  const g = new THREE.Group();
  g.add(meshOf(b, 'cab'));
  return g;
}

/** Code-built stand-ins for the house props (null = load the GLB). */
export function happiProp(name: string): THREE.Object3D | null {
  switch (name) {
    case 'tv': return tv();
    case 'shelf': return shelf();
    case 'tub': return tub();
    case 'mirror': return mirror();
    case 'mailbox': return mailbox();
    case 'car': return car();
    default: return null;
  }
}
