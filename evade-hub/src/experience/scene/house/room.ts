// The room behind Happi's door, life size: a New York loft done the Japanese way. Shoji-panel walls over hinoki
// panelling with a brand-colour rail, a tatami floor with a round blossom rug, a wooden ceiling with beams, a string
// of paper-lantern lights, an arched window onto the New York sky, the TV playing the theme, the jukebox, his hinoki
// tub, lacquer mirror and stepped tansu chest (code-built, src/happi/kit3d.ts), a navy sofa, a paper floor lamp, a
// futon, a photo wall of this session's pictures, a toy chest and a blossom mobile.
//
// Built once per stage at load: a few merged meshes (one flat colour per piece) and a handful of shared materials,
// all clipped to the doorway by the same four planes (src/experience/scene/house/index.ts). Door-local metres.
import * as THREE from 'three';
import type { PropKit } from '../props';
import type { Media } from '../media';
import { PAL } from '../fx';
/** Brand colours in place of the hub's rainbow: red, orange, gold, white, sky, navy. */
const RAINBOW = [0xd8312a, 0xf37321, 0xe6b54a, 0xffffff, 0xa9e0f5, 0x283a8f];
const WOODS = [0x5a3a2e, 0x6b4129, 0x8c5838, 0x9a6440, 0x8c5838, 0x6b4129];
const LAMPS = [0xd8312a, 0xffffff, 0xf37321, 0xffe08a];
import { DOOR, DOOR_H0, DOOR_R, ROOM } from './dims';
import { COL, rainbowFrame } from './exterior';
import { Builder, M, archShape, bandShape, box, canvasHeart, canvasStar, canvasTexture, cloudShape, cyl, extrude, heart, hex, puff, ribbon, roomOutline, roundRect, starShape } from './geo';
import { photoWall } from './photos';
import type { DoorClip } from './clip';

export type RoomItem = 'tv' | 'jukebox' | 'tub' | 'chest' | 'mirror' | 'lamp' | 'photos' | 'shelf' | 'bed' | 'sofa' | 'window';

export interface RoomMats {
  /** Lambert, vertex colours (most of the room). */
  lam: THREE.MeshLambertMaterial;
  /** Unlit, vertex colours (ceiling, lights, glowing bits); per-mesh copies tint it. */
  glow: THREE.MeshBasicMaterial;
  wall: THREE.MeshLambertMaterial;
  floor: THREE.MeshLambertMaterial;
  /** Unlit with a map (the TV screen, the window sky, the photo wall). */
  screen: (map: THREE.Texture) => THREE.MeshBasicMaterial;
  /** A glow material copy (its own colour). */
  tint: (hex: number) => THREE.MeshBasicMaterial;
  /** The doorway clip every room material shares. */
  clip: DoorClip;
}

export interface Room {
  group: THREE.Group;
  hits: Partial<Record<RoomItem, THREE.Box3>>;
  /** Where things happen (door-local). */
  spots: Record<'tvScreen' | 'jukebox' | 'tub' | 'chest' | 'mirror' | 'lamp' | 'photos', THREE.Vector3>;
  tvScreen: THREE.Mesh;
  playIcon: THREE.Mesh;
  /** Jukebox: the six arch light bars and the eight level bars. */
  arch: THREE.Mesh[];
  eq: THREE.Mesh[];
  jukeHeart: THREE.Mesh;
  chestLid: THREE.Object3D;
  lampStar: THREE.Object3D;
  lampHalo: THREE.Mesh;
  mobile: THREE.Object3D;
  bulbs: THREE.InstancedMesh;
  bulbCount: number;
  sky: THREE.Texture;
  mirrorShine: THREE.Mesh;
}

// ------------------------------------------------------------------ textures (shared by both stages)
let tex: { wall: THREE.CanvasTexture; floor: THREE.CanvasTexture; sky: THREE.CanvasTexture } | null = null;
export function roomTextures() {
  if (tex) return tex;
  const wall = canvasTexture(256, 256, (g) => {
    // shoji: warm paper with a light wooden lattice, a blossom here and there
    g.fillStyle = '#f6eedd';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#c9a477';
    for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 5, 256);
    for (let y = 0; y < 256; y += 86) g.fillRect(0, y, 256, 5);
    g.fillStyle = '#ffc3d2';
    canvasHeart(g, 96, 128, 22); g.fill();
    canvasHeart(g, 224, 214, 16); g.fill();
    g.fillStyle = '#ffffff';
    canvasHeart(g, 30, 44, 14); g.fill();
  }, true);
  wall.repeat.set(1 / 0.62, 1 / 0.62);
  const floor = canvasTexture(256, 256, (g) => {
    // tatami: straw green-gold with a fine weave and dark cloth borders
    g.fillStyle = '#d3c58a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#c4b578';
    for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 256, 2);
    g.fillStyle = '#2f4a33';
    g.fillRect(0, 0, 256, 7);
    g.fillRect(0, 128, 256, 7);
    g.fillRect(0, 0, 7, 128);
    g.fillRect(128, 128, 7, 128);
  }, true);
  floor.repeat.set(1 / 1.6, 1 / 1.6);
  const sky = canvasTexture(512, 256, (g) => {
    g.fillStyle = '#8fd0ff';
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#b5e1ff';
    g.fillRect(0, 170, 512, 86);
    const cloud = (x: number, y: number, s: number) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x - 26 * s, y, 20 * s, 0, 7);
      g.arc(x, y - 12 * s, 28 * s, 0, 7);
      g.arc(x + 28 * s, y - 2 * s, 22 * s, 0, 7);
      g.fill();
      g.fillRect(x - 26 * s, y, 54 * s, 20 * s);
    };
    cloud(80, 90, 1.1); cloud(260, 150, 0.8); cloud(410, 70, 1.3); cloud(-60 + 512, 200, 0.7); cloud(170, 215, 0.6);
    // the New York skyline far away, with a water tank and a little torii
    g.fillStyle = '#5d79b8';
    [[0, 190, 60], [55, 160, 40], [92, 120, 34], [124, 175, 70], [190, 140, 30], [218, 95, 26], [242, 168, 64], [302, 130, 40], [338, 180, 80], [414, 110, 30], [442, 150, 70]].forEach(([x, y, w]) => g.fillRect(x, y, w, 256 - y));
    g.fillRect(229, 70, 4, 26);
    g.fillStyle = '#4a3a33';
    g.fillRect(140, 158, 22, 17);
    g.fillStyle = '#d8312a';
    g.fillRect(470, 196, 6, 60); g.fillRect(500, 196, 6, 60); g.fillRect(462, 194, 52, 7); g.fillRect(466, 206, 44, 4);
  }, true);
  tex = { wall, floor, sky };
  return tex;
}

/** The room's emissive lift (index.ts LIFT): its whites stay white under the stage's two lights. */
const PROP_LIFT = 0x221b25;

function hitOf(obj: THREE.Object3D, pad = 0.05): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj).expandByScalar(pad);
}

/**
 * Give a prop its own clipped materials (so the clip planes don't reach the same prop elsewhere). In the room they are
 * Lambert with the prop's own colour map (ar-4): the room is lit by the stage's flat sky + sun only and every other
 * surface in it is Lambert, so the props' PBR + environment-map shading cost a lot of fragment time when you stand
 * next to them for little visible difference (and the room needs one program fewer).
 */
function clipProp(obj: THREE.Object3D, clip: DoorClip): void {
  const seen = new Map<THREE.Material, THREE.Material>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const one = (mat: THREE.Material) => {
      let c = seen.get(mat);
      if (!c) {
        const src = mat as THREE.MeshStandardMaterial;
        const lam = src.isMeshStandardMaterial
          ? new THREE.MeshLambertMaterial({ map: src.map, color: src.color, emissive: PROP_LIFT, transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest, side: src.side, vertexColors: src.vertexColors })
          : mat.clone();
        c = clip.apply(lam);
        seen.set(mat, c);
      }
      return c;
    };
    m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
  });
}

export function buildRoom(kit: PropKit, media: Media, mats: RoomMats): Room {
  const T = roomTextures();
  const group = new THREE.Group();
  group.name = 'house-room';
  const L = new Builder(), G = new Builder();
  const { halfW, zFront, zBack, rc, h: H } = ROOM;
  const out = roomOutline(halfW, zFront, zBack, rc, 10);
  const hits: Room['hits'] = {};

  // ---- shell
  const RAIL0 = 0.9, RAIL = 0.022, RAIL1 = RAIL0 + 6 * RAIL;
  L.add(ribbon(out, 0, RAIL0), 0xd9b58a);
  L.add(ribbon(out, 0, 0.11, 0.012), COL.lilac);
  for (let k = 0; k < 6; k++) L.add(ribbon(out, RAIL0 + k * RAIL, RAIL0 + (k + 1) * RAIL, 0.008), RAINBOW[5 - k]);
  // white panel lines on the panelling
  {
    let acc = 0;
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1], b = out[i], seg = a.distanceTo(b);
      const nx = -(b.y - a.y) / seg, nz = (b.x - a.x) / seg;
      for (let s = 0.45 - (acc % 0.9); s < seg; s += 0.9) {
        if (s < 0) continue;
        const x = a.x + (b.x - a.x) * (s / seg) + nx * 0.01, z = a.y + (b.y - a.y) * (s / seg) + nz * 0.01;
        L.add(box(0.025, 0.62, 0.012), 0xb88a5c, M(x, 0.48, z, 0, Math.atan2(b.x - a.x, b.y - a.y) + Math.PI / 2));
      }
      acc += seg;
    }
  }
  const upper = new THREE.Mesh(ribbon(out, RAIL1, H), mats.wall);
  // the front wall (inside face, looking into the room), with the doorway
  {
    const side = halfW - DOOR_R;
    for (const sx of [-1, 1]) {
      const cx = sx * (DOOR_R + side / 2);
      L.add(new THREE.PlaneGeometry(side, RAIL0), 0xd9b58a, M(cx, RAIL0 / 2, zFront, 0, Math.PI));
      L.add(new THREE.PlaneGeometry(side, 0.11), COL.lilac, M(cx, 0.055, zFront - 0.012, 0, Math.PI));
      for (let k = 0; k < 6; k++) L.add(new THREE.PlaneGeometry(side, RAIL), RAINBOW[5 - k], M(cx, RAIL0 + (k + 0.5) * RAIL, zFront - 0.008, 0, Math.PI));
    }
    const s = new THREE.Shape();
    s.moveTo(-halfW, RAIL1);
    s.lineTo(-DOOR_R, RAIL1);
    s.lineTo(-DOOR_R, DOOR_H0);
    s.absarc(0, DOOR_H0, DOOR_R, Math.PI, 0, true);
    s.lineTo(DOOR_R, RAIL1);
    s.lineTo(halfW, RAIL1);
    s.lineTo(halfW, H);
    s.lineTo(-halfW, H);
    s.closePath();
    const fw = new THREE.ShapeGeometry(s, 24);
    fw.applyMatrix4(M(0, 0, zFront, 0, Math.PI));
    upper.geometry = mergeTwo(upper.geometry, fw);
    // the rainbow door frame on the inside too
    rainbowFrame(L, M(0, 0, zFront - 0.002, 0, Math.PI), DOOR_R, DOOR_H0, 0.05, 0.03, 0.05, [0x1b2340, 0xe0452b, 0xe0452b, 0xe0452b, 0xe0452b, 0x1b2340], 0x6b4129);
    // the door tunnel's floor (sill)
    L.add(box(DOOR.w + 0.02, 0.01, -zFront + 0.02), 0xffffff, M(0, 0.005, zFront / 2));
  }
  upper.name = 'room-wallpaper';
  group.add(upper);
  // floor + ceiling
  {
    const s = new THREE.Shape();
    s.moveTo(out[0].x, -out[0].y);
    for (let i = 1; i < out.length; i++) s.lineTo(out[i].x, -out[i].y);
    s.closePath();
    const fg = new THREE.ShapeGeometry(s, 12);
    fg.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(fg, mats.floor);
    floor.name = 'room-floor';
    group.add(floor);
    const c = new THREE.Shape();
    c.moveTo(out[0].x, out[0].y);
    for (let i = 1; i < out.length; i++) c.lineTo(out[i].x, out[i].y);
    c.closePath();
    const cg = new THREE.ShapeGeometry(c, 12);
    cg.rotateX(Math.PI / 2);
    cg.translate(0, H, 0);
    G.add(cg, 0xe7d3b2);
    // wooden beams across the ceiling, a dark cornice round the top of the walls (unlit, so they never go grey)
    for (let z = zFront - 0.5; z > zBack + 0.3; z -= 0.75) G.add(box(2 * halfW - 0.1, 0.1, 0.12), 0xa8784e, M(0, H - 0.05, z));
    G.add(ribbon(out, H - 0.14, H, 0.004), 0x6b4129);
    G.add(box(2 * halfW, 0.14, 0.02), 0x6b4129, M(0, H - 0.07, zFront - 0.01));
    // the round rug: navy, white and orange rings with a blossom in the middle
    L.add(cyl(1.2, 1.2, 0.008, 48), 0x283a8f, M(0, 0.004, -2.55));
    L.add(cyl(1.0, 1.0, 0.008, 48), 0xffffff, M(0, 0.009, -2.55));
    L.add(cyl(0.88, 0.88, 0.008, 48), 0xf37321, M(0, 0.014, -2.55));
    L.add(extrude(heart(1.2), 0.008), 0xffffff, M(0, 0.019, -2.55, -Math.PI / 2));
    L.add(extrude(heart(0.5), 0.008), 0xffb7c9, M(0, 0.024, -2.55, -Math.PI / 2));
  }

  // ---- the TV (Dapo's model) on the back wall, playing the theme
  const tvH = 1.5;
  const tv = kit.make('tv', tvH);
  clipProp(tv, mats.clip);
  tv.position.set(0, 0, zBack + 0.42);
  group.add(tv);
  const s = tvH;
  const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.355 * s, 0.285 * s), mats.screen(media.themeTexture));
  tvScreen.position.set(-0.058 * s, 0.782 * s, 0.215 * s);
  tvScreen.name = 'tv-screen';
  tv.add(tvScreen);
  const tri = new THREE.Shape();
  tri.moveTo(-0.05, -0.065); tri.lineTo(0.08, 0); tri.lineTo(-0.05, 0.065); tri.closePath();
  const playG = new Builder();
  playG.add(new THREE.CircleGeometry(0.11, 28), 0xff389b);
  playG.add(new THREE.ShapeGeometry(tri), 0xffffff, M(0.01, 0, 0.002));
  const playIcon = new THREE.Mesh(playG.build(), mats.glow);
  playIcon.position.copy(tvScreen.position).add(new THREE.Vector3(0, 0, 0.004));
  tv.add(playIcon);
  hits.tv = hitOf(tv, 0.05);
  // a cloud rug for the TV to stand on and a pot plant beside
  L.add(new THREE.CylinderGeometry(0.75, 0.75, 0.012, 32), 0x2f4a33, M(0, 0.006, zBack + 0.45));

  // ---- the jukebox (built here): an arched cabinet with rainbow light bars and level bars that pulse to the music
  const juke = new THREE.Group();
  juke.name = 'jukebox';
  juke.position.set(-1.22, 0, zBack + 0.36);
  group.add(juke);
  const JB = new Builder(), jw = 0.8, jh = 1.55, jd = 0.42, jr = jw / 2, jh0 = jh - jr;
  JB.add(extrude(archShape(jw, jh) as THREE.Shape, jd, 0.03, 28), 0x283a8f, M(0, 0, -jd / 2));
  JB.add(extrude(archShape(jw - 0.12, jh - 0.06) as THREE.Shape, 0.03, 0.01, 28), 0xf6eedd, M(0, 0.0, jd / 2 + 0.02));
  JB.add(extrude(roundRect(0.56, 0.24, 0.05, 0, 0.8), 0.02), 0x1b2340, M(0, 0, jd / 2 + 0.05));
  for (let k = 0; k < 5; k++) JB.add(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), [0xd8312a, 0xf37321, 0xe6b54a, 0xa9e0f5, 0xffffff][k], M(-0.2 + k * 0.1, 0.8, jd / 2 + 0.075, Math.PI / 2));
  JB.add(extrude(roundRect(0.6, 0.36, 0.05, 0, 0.45), 0.02), 0x1b2340, M(0, 0, jd / 2 + 0.05));
  JB.add(box(0.7, 0.2, 0.06), 0xe6b54a, M(0, 0.1, jd / 2 + 0.02));
  for (let k = 0; k < 6; k++) JB.add(box(0.5, 0.012, 0.01), 0xffffff, M(0, 0.05 + k * 0.022, jd / 2 + 0.055));
  JB.add(puff(0.04, 1, 10), PAL.yellow, M(0.26, 0.1, jd / 2 + 0.06));
  // a little tiled roof on top with a blossom
  JB.add(box(0.92, 0.05, 0.5), 0x3b4252, M(0, jh + 0.02, 0));
  JB.add(box(0.7, 0.05, 0.4), 0x2c3240, M(0, jh + 0.07, 0));
  JB.add(extrude(heart(0.2), 0.03, 0.01), 0xffb7c9, M(0, jh + 0.22, 0.0));
  const jukeBody = new THREE.Mesh(JB.build(), mats.lam);
  juke.add(jukeBody);
  // the light bars: six bands round the arch (rainbow), unlit, own colours
  const arch: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const ri = 0.08 + i * 0.043, ro = ri + 0.036;
    const bb = new Builder().add(extrude(bandShape(ri, ro, jh0 - 0.06, 1.05), 0.01), 0xffffff).build();
    const m = new THREE.Mesh(bb, mats.tint(RAINBOW[i]));
    m.position.z = jd / 2 + 0.05;
    m.userData.hex = RAINBOW[i];
    arch.push(m);
    juke.add(m);
  }
  const jukeHeart = new THREE.Mesh(new Builder().add(extrude(heart(0.12), 0.01), 0xffffff).build(), mats.tint(0xffffff));
  jukeHeart.position.set(0, jh0 - 0.06 + 0.005, jd / 2 + 0.06);
  juke.add(jukeHeart);
  const eq: THREE.Mesh[] = [];
  const barGeo = new Builder().add(box(0.045, 1, 0.012), 0xffffff, M(0, 0.5, 0)).build();
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(barGeo, mats.tint(RAINBOW[Math.floor(i * 0.75) % 6]));
    m.position.set(-0.2 + i * (0.4 / 7), 0.31, jd / 2 + 0.075);
    m.scale.y = 0.05;
    eq.push(m);
    juke.add(m);
  }
  hits.jukebox = hitOf(juke, 0.06);

  // ---- the shelf (Dapo's model), back wall right
  const shelf = kit.make('shelf', 1.32);
  clipProp(shelf, mats.clip);
  shelf.position.set(1.16, 0, zBack + 0.42);
  group.add(shelf);
  hits.shelf = hitOf(shelf);

  // ---- the tub (front left) and the mirror (front wall, right of the door)
  const tub = kit.make('tub', 0.62);
  clipProp(tub, mats.clip);
  tub.position.set(-1.9, 0, -1.3);
  tub.rotation.y = 0.45;
  group.add(tub);
  hits.tub = hitOf(tub);
  const mirror = kit.make('mirror', 1.5);
  clipProp(mirror, mats.clip);
  mirror.position.set(1.85, 0, zFront - 0.5);
  mirror.rotation.y = Math.PI;
  group.add(mirror);
  hits.mirror = hitOf(mirror);
  const shine = new THREE.Mesh(new Builder().add(box(0.08, 0.9, 0.004), 0xffffff, M(0, 0, 0, 0, 0, 0.5)).build(), mats.tint(0xffffff));
  shine.visible = false;
  group.add(shine);

  // ---- the rainbow window (left wall) with the sky behind, and the cloud sofa under it
  const win = new THREE.Group();
  win.position.set(-halfW + 0.012, 1.05, -2.85);
  win.rotation.y = Math.PI / 2;
  group.add(win);
  const ww = 1.25, wh = 1.3;
  const skyMesh = new THREE.Mesh(new THREE.ShapeGeometry(archShape(ww, wh) as THREE.Shape, 24), mats.screen(T.sky));
  T.sky.repeat.set(1 / 1.6, 1 / 1.2);
  win.add(skyMesh);
  const WB = new Builder();
  rainbowFrame(WB, M(0, 0, 0), ww / 2, wh - ww / 2, 0.042, 0.03, 0.045, WOODS, 0xf6eedd);
  WB.add(box(0.035, wh - 0.02, 0.02), 0x6b4129, M(0, wh / 2, 0.012));
  WB.add(box(ww, 0.035, 0.02), 0x6b4129, M(0, 0.62, 0.012));
  WB.add(box(ww + 0.5, 0.06, 0.16), 0x8c5838, M(0, -0.03, 0.06));
  win.add(new THREE.Mesh(WB.build(), mats.lam));
  hits.window = hitOf(win, 0.05);
  const sofa = new THREE.Group();
  sofa.position.set(-halfW + 0.45, 0, -2.85);
  sofa.rotation.y = Math.PI / 2;
  group.add(sofa);
  const SB = new Builder();
  SB.add(extrude(roundRect(1.7, 0.3, 0.1), 0.62, 0.04), 0x283a8f, M(0, 0.17, -0.31));
  for (let i = 0; i < 4; i++) SB.add(puff(0.3, 0.5, 14), 0x34479e, M(-0.6 + i * 0.4, 0.4, 0.05));
  for (let i = 0; i < 5; i++) SB.add(puff(0.3 + (i % 2) * 0.05, 0.9, 14), i % 2 ? 0x34479e : 0x2c3e92, M(-0.72 + i * 0.36, 0.72, -0.24));
  for (const sx of [-1, 1]) { SB.add(puff(0.25, 0.9, 14), 0x283a8f, M(sx * 0.88, 0.55, 0.0)); SB.add(puff(0.18, 0.9, 12), 0x34479e, M(sx * 0.9, 0.72, -0.18)); }
  SB.add(extrude(heart(0.34), 0.1, 0.03), 0xf37321, M(-0.42, 0.72, 0.02, -0.25, 0, 0.15));
  SB.add(extrude(roundRect(0.3, 0.3, 0.08), 0.08, 0.03), 0xf6eedd, M(0.4, 0.72, 0.02, -0.25, 0, -0.1));
  sofa.add(new THREE.Mesh(SB.build(), mats.lam));
  hits.sofa = hitOf(sofa);

  // ---- the star lamp (back left corner)
  const lamp = new THREE.Group();
  lamp.position.set(-2.12, 0, -4.02);
  group.add(lamp);
  const LB = new Builder();
  LB.add(cyl(0.18, 0.2, 0.06, 24), 0x1b2340, M(0, 0.03, 0));
  LB.add(cyl(0.022, 0.022, 1.45, 8), 0x1b2340, M(0, 0.75, 0));
  LB.add(puff(0.05, 1, 10), 0xd8312a, M(0, 1.47, 0));
  lamp.add(new THREE.Mesh(LB.build(), mats.lam));
  const lampStar = new THREE.Mesh(new Builder().add(puff(0.2, 1.2, 18), 0xfff1c9).add(cyl(0.202, 0.202, 0.03, 18, true), 0xd8312a, M(0, 0.12, 0)).add(cyl(0.202, 0.202, 0.03, 18, true), 0xd8312a, M(0, -0.12, 0)).build(), mats.glow);
  lampStar.position.y = 1.68;
  lamp.add(lampStar);
  const lampHalo = new THREE.Mesh(new Builder().add(new THREE.CircleGeometry(0.36, 32), 0xffffff).build(), mats.tint(0xfff1a8));
  (lampHalo.material as THREE.MeshBasicMaterial).transparent = true;
  (lampHalo.material as THREE.MeshBasicMaterial).opacity = 0.32;
  (lampHalo.material as THREE.MeshBasicMaterial).depthWrite = false;
  lampHalo.position.set(0, 1.68, -0.06);
  lamp.add(lampHalo);
  hits.lamp = hitOf(lamp, 0.12);

  // ---- the bed (right wall) with a heart pillow, and the photo wall above it
  const bed = new THREE.Group();
  bed.position.set(halfW - 0.52, 0, -2.95);
  group.add(bed);
  const BB = new Builder(), bl = 1.9, bw = 0.95;
  BB.add(box(bw, 0.26, bl), 0x8c5838, M(0, 0.15, 0));
  BB.add(box(bw - 0.06, 0.18, bl - 0.06), 0xf6eedd, M(0, 0.36, 0));
  BB.add(box(bw + 0.02, 0.07, bl * 0.58), 0x283a8f, M(0, 0.47, bl * 0.2));
  for (let k = 0; k < 6; k++) BB.add(box(bw + 0.03, 0.072, 0.035), k % 2 ? 0xffffff : 0x1b2340, M(0, 0.472, bl * 0.2 - bl * 0.29 + 0.05 + k * 0.035));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) BB.add(cyl(0.035, 0.03, 0.06, 8), 0x5a3a2e, M(x * (bw / 2 - 0.06), 0.03, z * (bl / 2 - 0.06)));
  BB.add(box(1.15, 0.9, 0.06), 0x6b4129, M(0, 0.57, -bl / 2 - 0.02));
  BB.add(box(1.0, 0.75, 0.02), 0xf6eedd, M(0, 0.57, -bl / 2 + 0.02));
  for (let k = 1; k < 4; k++) BB.add(box(0.014, 0.75, 0.024), 0xc9a477, M(-0.5 + k * 0.25, 0.57, -bl / 2 + 0.03));
  BB.add(box(1.0, 0.014, 0.024), 0xc9a477, M(0, 0.57, -bl / 2 + 0.03));
  BB.add(extrude(roundRect(0.55, 0.28, 0.1), 0.12, 0.05), 0xffffff, M(0, 0.62, -bl / 2 + 0.3, -1.15));
  BB.add(extrude(heart(0.16), 0.03, 0.01), 0xf37321, M(0.06, 0.66, -bl / 2 + 0.36, -1.15));
  // little hearts and stars scattered on the quilt
  [[-0.24, 0.42, 0xffb7c9], [0.2, 0.62, 0xffffff], [-0.12, 0.84, 0xffb7c9], [0.26, 0.28, 0xffffff]].forEach(([x, z, c], i) => {
    BB.add(extrude(heart(i % 2 ? 0.1 : 0.14), 0.006), c, M(x, 0.506, z, -Math.PI / 2, 0, i * 0.7));
  });
  bed.add(new THREE.Mesh(BB.build(), mats.lam));
  bed.rotation.y = 0;
  hits.bed = hitOf(bed);
  const pw = photoWall();
  const board = new THREE.Group();
  board.position.set(halfW - 0.02, 1.68, -2.75);
  board.rotation.y = -Math.PI / 2;
  group.add(board);
  const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.96), mats.screen(pw.texture));
  pm.position.z = 0.02;
  board.add(pm);
  const PB = new Builder();
  PB.add(box(1.82, 0.06, 0.04), 0x6b4129, M(0, 0.51, 0.02));
  PB.add(box(1.82, 0.06, 0.04), 0x6b4129, M(0, -0.51, 0.02));
  PB.add(box(0.06, 1.08, 0.04), 0x6b4129, M(-0.88, 0, 0.02));
  PB.add(box(0.06, 1.08, 0.04), 0x6b4129, M(0.88, 0, 0.02));
  board.add(new THREE.Mesh(PB.build(), mats.lam));
  hits.photos = hitOf(board, 0.05);

  // ---- the toy chest (foot of the bed), lid on a hinge
  const chest = new THREE.Group();
  chest.position.set(halfW - 0.5, 0, -1.55);
  chest.rotation.y = -Math.PI / 2;
  group.add(chest);
  const CB = new Builder(), cw = 0.72, ch = 0.4, cd = 0.44;
  CB.add(box(cw, ch, cd), 0x9a6440, M(0, ch / 2, 0));
  CB.add(box(cw + 0.02, 0.05, cd + 0.02), 0x2b2b30, M(0, 0.04, 0));
  CB.add(box(cw + 0.02, 0.04, cd + 0.02), 0x2b2b30, M(0, ch - 0.02, 0));
  CB.add(extrude(heart(0.18), 0.015, 0.005), 0xffb7c9, M(-0.2, 0.22, cd / 2));
  CB.add(extrude(heart(0.18), 0.015, 0.005), 0xffb7c9, M(0.2, 0.22, cd / 2));
  CB.add(new THREE.TorusGeometry(0.04, 0.01, 6, 16), 0xe6b54a, M(0, 0.24, cd / 2));
  chest.add(new THREE.Mesh(CB.build(), mats.lam));
  const chestLid = new THREE.Group();
  chestLid.position.set(0, ch, -cd / 2);
  chest.add(chestLid);
  const lidG = new Builder()
    .add(new THREE.CylinderGeometry(cd / 2, cd / 2, cw + 0.02, 20, 1, false, 0, Math.PI), 0x8c5838, M(0, 0, cd / 2, 0, 0, Math.PI / 2))
    .add(extrude(heart(0.12), 0.015, 0.005), 0xffb7c9, M(0, 0.14, cd / 2 + 0.17, -0.7))
    .build();
  const lid = new THREE.Mesh(lidG, mats.lam);
  chestLid.add(lid);
  hits.chest = hitOf(chest, 0.06);

  // ---- a star mobile over the rug
  const mobile = new THREE.Group();
  mobile.position.set(0, H, -2.5);
  group.add(mobile);
  const MB = new Builder();
  // high enough that the lowest star clears a grown-up's eyes (about 2.05 m)
  MB.add(cyl(0.008, 0.008, 0.14, 6), 0xffffff, M(0, -0.07, 0));
  MB.add(box(1.0, 0.016, 0.016), 0xffffff, M(0, -0.14, 0));
  MB.add(box(0.016, 0.016, 1.0), 0xffffff, M(0, -0.14, 0));
  [[0.48, 0, 0.16, 0xffb7c9], [-0.48, 0, 0.24, 0xffffff], [0, 0.48, 0.2, 0xff94b0], [0, -0.48, 0.12, 0xf37321]].forEach(([x, z, len, c]) => {
    MB.add(cyl(0.005, 0.005, len, 4), 0xffffff, M(x, -0.14 - len / 2, z));
    MB.add(extrude(heart(0.22), 0.04, 0.012), c, M(x, -0.14 - len - 0.08, z - 0.02));
  });
  MB.add(extrude(heart(0.2), 0.04, 0.012), 0xd8312a, M(0, -0.36, -0.02));
  MB.add(cyl(0.005, 0.005, 0.12, 4), 0xffffff, M(0, -0.2, 0));
  mobile.add(new THREE.Mesh(MB.build(), mats.lam));

  // ---- fairy lights along the side and back walls (instanced bulbs + a white wire)
  const bulbPts: THREE.Vector3[] = [];
  {
    const wire = out.slice(); // front-left -> back -> front-right
    let acc = 0;
    const total = wire.reduce((t, p, i) => (i ? t + p.distanceTo(wire[i - 1]) : 0), 0);
    const hook = 0.95, step = 0.16;
    for (let i = 1; i < wire.length; i++) {
      const a = wire[i - 1], b = wire[i], seg = a.distanceTo(b);
      const nx = -(b.y - a.y) / seg, nz = (b.x - a.x) / seg;
      for (let s4 = (step - (acc % step)) % step; s4 < seg; s4 += step) {
        const u = acc + s4;
        if (u < 0.35 || u > total - 0.35) continue;
        const sag = Math.sin(Math.PI * ((u % hook) / hook));
        bulbPts.push(new THREE.Vector3(a.x + (b.x - a.x) * (s4 / seg) + nx * 0.09, H - 0.26 - sag * 0.16, a.y + (b.y - a.y) * (s4 / seg) + nz * 0.09));
      }
      acc += seg;
    }
  }
  const bulbs = new THREE.InstancedMesh(new Builder().add(puff(0.045, 1.2, 10), 0xffffff).build(), mats.tint(0xffffff), bulbPts.length);
  const mtx = new THREE.Matrix4(), cc = new THREE.Color();
  bulbPts.forEach((p, i) => { mtx.makeTranslation(p.x, p.y, p.z); bulbs.setMatrixAt(i, mtx); bulbs.setColorAt(i, cc.setHex(LAMPS[i % 4])); });
  bulbs.instanceMatrix.needsUpdate = true;
  bulbs.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  bulbs.name = 'fairy-lights';
  bulbs.frustumCulled = false;
  group.add(bulbs);
  for (let i = 1; i < bulbPts.length; i++) {
    const a = bulbPts[i - 1], b = bulbPts[i], len = a.distanceTo(b);
    if (len > 0.4) continue;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(0.006, 0.006, len, 4);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    g.translate(mid.x, mid.y + 0.03, mid.z);
    G.add(g, 0xffffff);
  }

  // ---- merge and add the static meshes
  const lam = new THREE.Mesh(L.build(), mats.lam);
  lam.name = 'room-static';
  const glow = new THREE.Mesh(G.build(), mats.glow);
  glow.name = 'room-glow';
  group.add(lam, glow);

  return {
    group, hits,
    spots: {
      tvScreen: new THREE.Vector3(-0.058 * s, 0.782 * s, zBack + 0.42 + 0.215 * s),
      jukebox: new THREE.Vector3(-1.22, 1.2, zBack + 0.6),
      tub: tub.position.clone().setY(0.55),
      chest: new THREE.Vector3(halfW - 0.5, 0.45, -1.55),
      mirror: mirror.position.clone().setY(1.1).add(new THREE.Vector3(0, 0, -0.2)),
      lamp: new THREE.Vector3(-2.12, 1.68, -4.02),
      photos: new THREE.Vector3(halfW - 0.1, 1.68, -2.75),
    },
    tvScreen, playIcon, arch, eq, jukeHeart, chestLid, lampStar, lampHalo, mobile, bulbs, bulbCount: bulbPts.length,
    sky: T.sky, mirrorShine: shine,
  };
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const bb = new Builder();
  bb.add(a, 0xffffff);
  bb.add(b, 0xffffff);
  return bb.build();
}
