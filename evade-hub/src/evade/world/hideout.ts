// Bobo's Hideout as one place, used by 3D (the world you walk Bobo round) and AR (the life-size room behind the door).
//
// The Collector Hub room (/hub/evade/room.glb: the two-storey Eclipse can with the desk, BOBO OS computer, shelf,
// collection wall, cat bed and fizz) stands at the back of a round arcade hall; Bobo's Arcade lines the hall's walls
// left and right (src/evade/world/arcade.ts), one machine per experience in src/evade/catalog.ts.
//
// Units: metres, "door-local": the hall's entrance is at the origin, the hall lies on -z (AR walks in through a door
// there; 3D simply puts Bobo inside). Everything is behind z < 0 (the portal rule: nothing pokes out of the door plane).
//
// Load once on the splash (`preloadHideout`), then every stage builds its own copy synchronously (`buildHideout`),
// sharing geometry and textures. No lights are added here (the stages carry theirs, so light counts never change).
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { arcadeState, withAccess, type ArcadeState } from '../catalog';
import { unlockVersion } from '../unlocks';
import { buildCabinets, loadThumbs, type Cabinet, CAB } from './arcade';

export const ROOM_URL = '/hub/evade/room.glb';

/** The hall (metres, door-local). */
export const HALL = {
  /** floor radius and centre (the circle touches the door plane at x = 0) */
  r: 4.6,
  cz: -4.6,
  h: 4.8,
  /** the can room: centre, turned so its open side faces the door */
  canZ: -5.15,
  canR: 1.9,
  /** the can's open side spans this half-angle round its front (measured on Can_Wall: 165° open) */
  canOpen: THREE.MathUtils.degToRad(80),
  /** cabinets stand on this circle round the hall centre, between these angles (from +z), left and right */
  cabR: 3.85,
  cabA0: THREE.MathUtils.degToRad(30),
  cabA1: THREE.MathUtils.degToRad(104), // no further back: the can would block the view of a machine behind it
  /** Bobo's home spot in 3D: on the can's ground floor, just inside its open front */
  home: new THREE.Vector3(0, 0, -3.9),
};
/** The room's open side faces +x+z (42.5° from +z) as modelled. */
const CAN_YAW = -THREE.MathUtils.degToRad(42.5);

interface Source {
  room: THREE.Group;
  items: ArcadeState[];
  thumbs: Map<string, HTMLImageElement | null>;
  fizz: THREE.Object3D[];
}
let source: Source | null = null;
let loading: Promise<void> | null = null;

/** Load the room GLB, the catalogue and the thumbnails (on the splash). Never rejects. */
export function preloadHideout(gltf: (url: string, onProgress?: (p: number) => void) => Promise<GLTF>, progress: (p: number) => void): Promise<void> {
  return (loading ||= (async () => {
    let pr = 0, pt = 0;
    const tick = () => progress(pr * 0.8 + pt * 0.2);
    const [g, items] = await Promise.all([
      gltf(ROOM_URL, (p) => { pr = p; tick(); }).catch((e) => { console.error('[hideout] room did not load', e); return null; }),
      arcadeState(),
    ]);
    const thumbs = await loadThumbs(items, (p) => { pt = p; tick(); });
    progress(1);
    const room = new THREE.Group();
    room.name = 'hideout-room';
    const fizz: THREE.Object3D[] = [];
    if (g) {
      prepareRoom(g.scene);
      room.add(g.scene);
      g.scene.traverse((o) => { if (o.name.startsWith('Fizz_')) fizz.push(o); });
    }
    source = { room, items, thumbs, fizz };
  })());
}

/** The arcade list as loaded (empty before `preloadHideout`). */
export function hideoutItems(): ArcadeState[] {
  return source?.items ?? [];
}

/** One-time fixes on the loaded room: hide the room's own Bobo, the portal bits; tame glass and glow. */
function prepareRoom(room: THREE.Object3D): void {
  const hide = new Set(['hub_bobo', 'hub_portal', 'hub_spawn_pad', 'Step_0', 'Step_1', 'Step_2', 'Step_3', 'Paw_0', 'Paw_1', 'Paw_2']);
  const gone: THREE.Object3D[] = [];
  room.traverse((o) => { if (hide.has(o.name)) gone.push(o); });
  for (const o of gone) o.removeFromParent(); // removed, not hidden: no skinned Bobo to compile or update
  const seen = new Set<THREE.Material>();
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = m.receiveShadow = false;
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const s = mat as THREE.MeshPhysicalMaterial;
      // (Collector Hub's own fixes) transmission is a second render pass on phones: plain see-through instead
      if (s.transmission > 0) { s.transmission = 0; s.transparent = true; s.opacity = Math.min(s.opacity, 0.28); s.depthWrite = false; }
      if (/^(Neon_|Lamp_Blob)/.test(s.name)) s.emissiveIntensity = Math.min(s.emissiveIntensity ?? 1, 2.2);
      if (s.name === 'Bulb_Warm') s.emissiveIntensity = Math.min(s.emissiveIntensity ?? 1, 3);
      if (s.name === 'Sign_EVADE') s.emissiveIntensity = 1.2;
      if (s.name === 'Porthole_Sky') s.emissiveIntensity = 0.9;
      if (s.name === 'Hologram_Ghost') s.emissiveIntensity = Math.min(s.emissiveIntensity ?? 1, 1.2);
      if (s.name === 'Glass' || s.name === 'Acrylic_Clear') { s.opacity = 0.1; s.roughness = 0.05; }
      if (s.map) s.map.anisotropy = 4;
    }
  });
}

// ------------------------------------------------------------------ the hall shell (shared geometry/textures)
let shellParts: { floor: THREE.BufferGeometry; wall: THREE.BufferGeometry; ceil: THREE.BufferGeometry; sill: THREE.BufferGeometry; trim: THREE.BufferGeometry; floorTex: THREE.Texture; wallTex: THREE.Texture; dots: THREE.BufferGeometry } | null = null;

function shellGeometry() {
  if (shellParts) return shellParts;
  const floor = new THREE.CircleGeometry(HALL.r, 72).rotateX(-Math.PI / 2).translate(0, -0.012, 0); // just under the can's own floor (no z-fighting)
  const wall = new THREE.CylinderGeometry(HALL.r, HALL.r, HALL.h, 72, 1, true);
  wall.translate(0, HALL.h / 2, 0);
  const ceil = new THREE.CircleGeometry(HALL.r, 72).rotateX(Math.PI / 2).translate(0, HALL.h, 0);
  // the doorway's sill: the floor circle only touches the door plane at one point
  const sill = new THREE.PlaneGeometry(1.6, 0.5).rotateX(-Math.PI / 2).translate(0, 0.001, -0.25);
  const trim = new THREE.TorusGeometry(HALL.r - 0.02, 0.025, 6, 96).rotateX(Math.PI / 2);
  // floor art: deep navy boards with two cyan rings and a yellow lane to the can (flat colours, small canvas)
  const n = 512, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const R = n / 2;
  g.fillStyle = '#0d2233'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#123049'; g.lineWidth = 2;
  for (let y = 0; y < n; y += 18) { g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke(); }
  g.strokeStyle = '#4fd6e8'; g.lineWidth = 5;
  g.beginPath(); g.arc(R, R, R * 0.93, 0, 7); g.stroke();
  g.lineWidth = 3;
  g.beginPath(); g.arc(R, R, R * 0.66, 0, 7); g.stroke();
  // checker lane from the door to the can (door is at the bottom of the canvas: +z)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i % 2 ? '#f6c344' : '#15131a';
    g.fillRect(R - 14, n - 12 - i * 14, 28, 12);
  }
  const floorTex = new THREE.CanvasTexture(c);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 4;
  // wall art: slate panels, a pink neon line at dado height and a row of EVADE tiles up top (flat)
  const wc = document.createElement('canvas');
  wc.width = 1024; wc.height = 256;
  const w = wc.getContext('2d')!;
  w.fillStyle = '#0a1c2a'; w.fillRect(0, 0, 1024, 256);
  w.fillStyle = '#0f2638';
  for (let x = 0; x < 1024; x += 64) w.fillRect(x + 3, 40, 58, 170);
  w.fillStyle = '#ff4f9a'; w.fillRect(0, 212, 1024, 5);
  w.fillStyle = '#4fd6e8'; w.fillRect(0, 26, 1024, 4);
  w.font = 'italic 900 22px system-ui, sans-serif';
  w.textAlign = 'center';
  w.textBaseline = 'middle';
  for (let x = 32; x < 1024; x += 128) { w.fillStyle = '#f6c344'; w.fillText('EVADE', x, 12); }
  const wallTex = new THREE.CanvasTexture(wc);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(3, 1);
  // ceiling "stars" (string lights look): one Points cloud
  const dots = new THREE.BufferGeometry();
  const pts: number[] = [];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (HALL.r - 0.3);
    pts.push(Math.cos(a) * r, HALL.h - 0.05, Math.sin(a) * r);
  }
  dots.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  shellParts = { floor, wall, ceil, sill, trim, floorTex, wallTex, dots };
  return shellParts;
}

export interface Hideout {
  /** Door-local metres. */
  root: THREE.Group;
  /** The hall shell (floor, wall, ceiling) and the can room, for the portal's clip patch. */
  room: THREE.Object3D;
  cabinets: Cabinet[];
  items: ArcadeState[];
  /** Fizz bubbles and orbiting cans (animated per frame). */
  update(dt: number): void;
}

/**
 * Build one copy of the hideout. `mat` lets the AR stage patch every material (the doorway clip) before anything
 * compiles; it is called once per distinct material and must return the material to use.
 */
export function buildHideout(mat: (m: THREE.Material) => THREE.Material = (m) => m): Hideout {
  const root = new THREE.Group();
  root.name = 'hideout';
  const content = new THREE.Group();
  content.name = 'hideout-content';
  root.add(content);
  const S = shellGeometry();
  const floorM = mat(new THREE.MeshLambertMaterial({ map: S.floorTex }));
  const wallM = mat(new THREE.MeshLambertMaterial({ map: S.wallTex, side: THREE.BackSide }));
  const ceilM = mat(new THREE.MeshBasicMaterial({ color: 0x07141f }));
  const trimM = mat(new THREE.MeshBasicMaterial({ color: 0x4fd6e8, toneMapped: false }));
  const centre = new THREE.Group();
  centre.position.set(0, 0, HALL.cz);
  const floor = new THREE.Mesh(S.floor, floorM);
  floor.name = 'hall-floor';
  floor.renderOrder = -2;
  const wall = new THREE.Mesh(S.wall, wallM);
  wall.name = 'hall-wall';
  const ceil = new THREE.Mesh(S.ceil, ceilM);
  ceil.name = 'hall-ceiling';
  const trim = new THREE.Mesh(S.trim, trimM);
  trim.position.y = 0.06;
  const trimTop = new THREE.Mesh(S.trim, trimM);
  trimTop.position.y = HALL.h - 0.25;
  const dots = new THREE.Points(S.dots, mat(new THREE.PointsMaterial({ color: 0xffe7a8, size: 0.06, sizeAttenuation: true })));
  centre.add(floor, wall, ceil, trim, trimTop, dots);
  const sill = new THREE.Mesh(S.sill, floorM);
  content.add(centre, sill);

  // the can room
  const can = new THREE.Group();
  can.name = 'hideout-can';
  can.position.set(0, 0, HALL.canZ);
  can.rotation.y = CAN_YAW;
  const orbit: THREE.Object3D[] = [];
  const fizz: Array<{ o: THREE.Object3D; y: number; ph: number; amp: number }> = [];
  if (source) {
    const copy = source.room.clone(true);
    const swapped = new Map<THREE.Material, THREE.Material>();
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const one = (x: THREE.Material) => { let y = swapped.get(x); if (!y) { y = mat(x); swapped.set(x, y); } return y; };
        m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
      }
      if (o.name === 'hub_orbit_cans') orbit.push(o);
      if (o.name.startsWith('Fizz_')) fizz.push({ o, y: o.position.y, ph: Math.random() * 6.28, amp: 0.05 + Math.random() * 0.07 });
    });
    can.add(copy);
  }
  content.add(can);

  // Bobo's Arcade: the machines along the hall's walls
  const items = source?.items ?? [];
  const { group: cabs, cabinets } = buildCabinets(items, source?.thumbs ?? new Map(), mat);
  layoutCabinets(cabinets);
  content.add(cabs);

  let t = 0;
  // a code claimed in the Arcade sheet (or rules arriving) re-draws the machines' screens in place; a machine that
  // just opened gets a bright pulse on its pad and screen for a couple of seconds
  let seenV = unlockVersion();
  const flash = new Map<Cabinet, number>();
  return {
    root,
    room: content,
    cabinets,
    items,
    update(dt: number) {
      t += dt;
      for (const o of orbit) o.rotation.y += dt * 0.12;
      for (const f of fizz) f.o.position.y = f.y + Math.sin(t * 1.3 + f.ph) * f.amp;
      if (unlockVersion() !== seenV) {
        seenV = unlockVersion();
        for (const c of cabinets) {
          const was = c.item.locked;
          const next = withAccess(c.item);
          c.redraw(next);
          if (was && !next.locked) flash.set(c, 2.4);
        }
      }
      for (const c of cabinets) {
        const f = flash.get(c);
        if (f !== undefined) {
          const left = f - dt;
          if (left <= 0) flash.delete(c); else flash.set(c, left);
          c.glow = Math.max(c.glow, 0.5 + 0.5 * Math.sin(t * 14) * Math.min(1, left));
        }
        c.tick(t);
      }
    },
  };
}

/** Put the machines round the hall: alternating right / left from the entrance inwards, all facing the hall centre. */
function layoutCabinets(cabs: Cabinet[]): void {
  const n = cabs.length;
  const right = Math.ceil(n / 2), left = n - right;
  const step = (k: number) => (k <= 1 ? 0 : (HALL.cabA1 - HALL.cabA0) / (k - 1));
  cabs.forEach((c, i) => {
    const side = i % 2 === 0 ? 1 : -1; // first machine on the right
    const j = Math.floor(i / 2);
    const k = side > 0 ? right : left;
    // the catalogue's first items stand nearest the entrance
    const a = (HALL.cabA0 + step(k) * j + (k === 1 ? (HALL.cabA1 - HALL.cabA0) / 2 : 0)) * side;
    const x = Math.sin(a) * HALL.cabR, z = HALL.cz + Math.cos(a) * HALL.cabR;
    c.group.position.set(x, 0, z);
    c.group.rotation.y = Math.atan2(-x, HALL.cz - z); // face the hall centre
    c.group.updateMatrix();
    c.front.set(0, 0, CAB.reach).applyMatrix4(c.group.matrix);
  });
}

/** Keep a door-local floor point where Bobo can stand: inside the hall, in front of the machines, out of the can's walls. */
export function clampToHall(p: THREE.Vector3, pad = 0.35): THREE.Vector3 {
  // hall: in front of the machines
  const rMax = HALL.cabR - Math.max(CAB.reach, CAB.depth / 2 + pad) + 0.01; // the machines' play spots are reachable
  let dx = p.x, dz = p.z - HALL.cz;
  let l = Math.hypot(dx, dz);
  if (l > rMax) { p.x = (dx / l) * rMax; p.z = HALL.cz + (dz / l) * rMax; }
  // the can: its wall is a circle open at the front; inside it Bobo stays off the wall, outside it he stays clear
  dx = p.x; dz = p.z - HALL.canZ;
  l = Math.hypot(dx, dz);
  const ang = Math.abs(Math.atan2(dx, dz));
  const inR = HALL.canR - 0.35, outR = HALL.canR + 0.25;
  if (ang > HALL.canOpen && l > inR && l < outR) {
    const k = l - inR < outR - l ? inR : outR;
    p.x = (dx / Math.max(1e-4, l)) * k;
    p.z = HALL.canZ + (dz / Math.max(1e-4, l)) * k;
  }
  // and never out through the door plane
  if (p.z > -0.35) p.z = -0.35;
  p.y = 0;
  return p;
}
