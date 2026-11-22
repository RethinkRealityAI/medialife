// Happi's house, built in code (see exterior.ts and room.ts), as a walk-through portal like the MEDIALIFE
// Portal / Bobo's Portal: the cottage stands in the garden; its door opens onto a life-size room that is much bigger
// than the cottage. From outside you only ever see the room through the doorway (DoorClip); you physically walk in
// through the door and the room is all around you (the cottage's back and roof hide, the room's own walls take
// over); walk back out through the door and you're in your own room again.
//
// Stability rules (portal kit + Cola Run hideout lessons): everything is built and compiled at load with the stage
// (no new materials, lights or shader inputs when the door opens: the clip is a fixed shader patch whose planes are
// uniforms), the stage's own two lights light the room, textures are small canvases without mipmaps (except the two
// tiling ones), and crossing is only counted inside the opening.
//
// One HouseSet per stage (showcase / AR). `root` is in door-local metres and scaled into stage units: AR keeps the
// house life size whatever size Happi is; the showcase uses a fixed scale that suits her 1-unit height.
import * as THREE from 'three';
import type { PropKit } from '../props';
import type { Media } from '../media';
import type { Stage } from '../stage';
import { PAL, RAINBOW } from '../fx';
/** Paper-lantern lights: red, white, orange, warm gold. */
const LAMPS = [0xd8312a, 0xffffff, 0xf37321, 0xffe08a];
/** Petals puffing from the rooftop tank. */
const PETALS = [0xffb7c9, 0xff94b0, 0xffffff, 0xffd9e3];
import { damp, ease } from '../../core/timeline';
import { COT, DOOR, DOOR_H0, DOOR_R, ROOM, ROOM_SLACK } from './dims';
import { buildDoorLeaf, buildExterior } from './exterior';
import { buildRoom, roomTextures, type Room, type RoomItem } from './room';
import { DoorClip } from './clip';
import { fakeLevels, levels, listenTo } from './music';
import { photoWall } from './photos';

export { addHousePhoto } from './photos';
export type HouseItem = RoomItem | 'door' | 'house';

/** Showcase: stage units per metre (she is 1 unit tall there; the door comes to about 1.5 of her). */
export const SHOW_K = 0.72;
/** Theme users (src/experience/scene/media.ts). */
const T_INSIDE = 'inside', T_JUKE = 'jukebox', T_TOUR = 'tour';

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), W = new THREE.Vector3();
const MX = new THREE.Matrix4(), INV = new THREE.Matrix4();
const R = new THREE.Ray();
const C4 = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const COLR = new THREE.Color();

export class HouseSet {
  /** Door-local metres (the door at the origin, the room on -z). Child of `stage.house`. */
  readonly root = new THREE.Group();
  /** The cottage (front + body), for taps. */
  readonly exterior = new THREE.Group();
  readonly front: THREE.Mesh;
  readonly body: THREE.Group;
  readonly sun: THREE.Mesh;
  readonly room: Room;
  /** The door (swings into the room). */
  readonly leaf = new THREE.Group();
  readonly clip = new DoorClip();
  /** The camera is in the room (walked through the door, or the room was brought to you). */
  inside = false;
  /** Door: 0 shut .. 1 open. */
  open = 0;
  openTarget = 0;
  /** House-moment bounce (1 = at rest) and mailbox wobble (radians). */
  squash = 1;
  mailTilt = 0;
  /** Stage units per metre (AR: life size times `sizeMul`, whatever size Happi is). */
  k = 1;
  /** AR: the pinch's share of the house size (1 = life size, the default; Move resets it). Set by the AR mode. */
  sizeMul = 1;
  /** Away (a mini game is on): the house pops out of the way and gives its ground to the game. 1 = here, 0 = gone. */
  private awayK = 1;
  private awayTarget = 1;
  /** Inside: the room wears plain twins of its clipped materials (no discard: the GPU can skip hidden pixels). */
  private swaps: Array<[THREE.Mesh, THREE.Material, THREE.Material]> = [];
  private plain = false;
  /** Someone else poses `stage.house` (the AR walk-in glide). Otherwise AR keeps it at its resting spot. */
  posed = false;
  /** Showcase camera tour: blend `k` 0..1 towards `pos` looking at `look` (stage-local). */
  readonly tour = { k: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
  /** Crossing the doorway (either way). */
  onCross: ((inside: boolean) => void) | null = null;
  /** The camera in door-local metres (last update). */
  readonly cam = new THREE.Vector3();
  private wasOutside = true;
  private t = 0;
  private chimneyT = 0;
  private sunAt: THREE.Vector3;
  private chimneyTop: THREE.Vector3;
  private lv = new Float32Array(8);
  private party = 0;
  private partyMood = false;
  private twinkleT = 0;
  private twinkleStep = 0;
  private chestT = -1;
  private shineT = -1;
  private lampSpin = 0;
  private photoV = 0;

  constructor(private st: Stage, kit: PropKit, private media: Media) {
    this.root.name = 'house-set';
    const clip = this.clip;
    // ---- materials (one set per stage; the room's are all patched with the doorway clip)
    const extLam = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a141c });
    const extGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // the room only has the stage's sun and sky: a small emissive lift keeps its whites from going grey
    const LIFT = 0x221b25;
    const lam = clip.apply(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: LIFT }));
    const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const tint = (hex: number) => {
      const m = glow.clone();
      m.color.setHex(hex);
      return clip.apply(m);
    };
    clip.apply(glow);
    const RT = roomTextures();
    const wallM = clip.apply(new THREE.MeshLambertMaterial({ map: RT.wall, emissive: LIFT }));
    const floorM = clip.apply(new THREE.MeshLambertMaterial({ map: RT.floor, emissive: LIFT }));
    const screen = (map: THREE.Texture) => clip.apply(new THREE.MeshBasicMaterial({ map, toneMapped: false }));

    // ---- outside
    const ext = buildExterior();
    this.front = new THREE.Mesh(ext.front, extLam);
    this.front.name = 'house-front';
    const bodyMesh = new THREE.Mesh(ext.body, clip.applyCut(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a141c })));
    bodyMesh.name = 'house-body';
    this.body = new THREE.Group();
    this.body.add(bodyMesh);
    this.sun = new THREE.Mesh(ext.glow, extGlow);
    this.sun.position.copy(ext.sunAt);
    this.sun.name = 'house-sun';
    this.sunAt = ext.sunAt;
    this.chimneyTop = ext.chimneyTop;
    this.exterior.add(this.front, this.body, this.sun);
    this.root.add(this.exterior);

    // ---- the door
    const leafMesh = new THREE.Mesh(buildDoorLeaf(), lam);
    leafMesh.name = 'house-door';
    this.leaf.add(leafMesh);
    this.leaf.position.set(-DOOR_R + 0.015, 0, -0.1);
    this.root.add(this.leaf);

    // ---- inside
    this.room = buildRoom(kit, media, {
      lam, glow, wall: wallM, floor: floorM, screen, tint: (h) => tint(h), clip,
    });
    this.room.group.visible = false;
    this.root.add(this.room.group);
    this.room.mirrorShine.visible = false;

    // ---- plain twins for inside (compiled at load with everything else: they ride on a hidden holder)
    const tw = clip.twinHolder(this.root);
    this.swaps = tw.swaps;
    this.root.add(tw.holder);
  }

  /** The house is in the scene and not popped away for a game (taps, walls, the walk-in). */
  get present(): boolean {
    return this.st.house.visible && this.awayTarget > 0 && this.awayK > 0.001;
  }
  /** Fully popped away (a mini game is on). */
  get away(): boolean {
    return this.awayTarget === 0;
  }

  /**
   * A mini game is on: the house (and in AR its mailbox) pops away so the game has the whole floor; its walls stop
   * counting for pickups, the ring and her walking. `false` pops it back. Scale only: no material or shader changes.
   */
  setAway(on: boolean): void {
    const t = on ? 0 : 1;
    if (t === this.awayTarget) return;
    this.awayTarget = t;
    if (on && this.inside) this.setInside(false);
    const k = this.k, at = this.toStage(V.set(0, COT.peak * 0.45, -COT.d / 2), new THREE.Vector3());
    if (this.st.house.visible) {
      this.st.fx.emit({ count: on ? 26 : 30, glyph: ['sparkle', 'star', 'heart'], colors: [PAL.pink, PAL.white, PAL.yellow, 0xe6ccff], at, spread: [COT.w * 0.35 * k, COT.peak * 0.3 * k, COT.d * 0.3 * k], burst: 0.5 * k, drag: 1.4, life: [0.7, 1.2], size: [0.07 * k, 0.13 * k] });
    }
    if (!on) this.root.visible = true;
  }

  /** Inside: plain twins (no clip, no discard). Outside: the clipped ones. Material swap only: nothing compiles. */
  private wearPlain(on: boolean): void {
    if (on === this.plain) return;
    this.plain = on;
    for (const [mesh, clipped, plain] of this.swaps) {
      const want = on ? plain : clipped, was = mesh.material as THREE.Material;
      if (was === want) continue;
      // carry what the room animates per frame (light bar colours, the lamp halo's opacity)
      const a = was as THREE.MeshBasicMaterial, b = want as THREE.MeshBasicMaterial;
      if (a.color && b.color) b.color.copy(a.color);
      b.opacity = a.opacity;
      mesh.material = want;
    }
  }

  // ------------------------------------------------------------------ space
  /** Door-local metres -> stage-local. */
  toStage(local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    this.st.house.updateMatrix();
    this.root.updateMatrix();
    return out.copy(local).applyMatrix4(MX.multiplyMatrices(this.st.house.matrix, this.root.matrix));
  }
  /** Stage-local -> door-local metres. */
  fromStage(p: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    this.st.house.updateMatrix();
    this.root.updateMatrix();
    return out.copy(p).applyMatrix4(MX.multiplyMatrices(this.st.house.matrix, this.root.matrix).invert());
  }
  /** A direction (door-local, metres) in stage units. */
  dirToStage(d: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(d).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.st.house.rotation.y).multiplyScalar(this.k);
  }
  /** Yaw (stage) that faces along a door-local yaw. */
  yawToStage(yaw: number): number {
    return yaw + this.st.house.rotation.y;
  }

  /** AR: where the house rests on the stage (its footprint centre), about a metre behind her spot. */
  restPos(out = new THREE.Vector3()): THREE.Vector3 {
    const k = this.k;
    const front = THREE.MathUtils.clamp(0.95 * k, 1.25, 2.6);
    return out.set(0, 0, -front - (COT.d / 2) * k);
  }

  /** The cottage footprint in stage-local space (toys, game pickups, keeping her out of the walls). */
  bounds(out: THREE.Box3): THREE.Box3 | null {
    if (!this.st.house.visible || this.awayTarget === 0) return null;
    out.makeEmpty();
    const hw = COT.w / 2 + 0.25;
    for (const x of [-hw, hw]) for (const z of [-COT.d - 0.25, 0.3]) out.expandByPoint(this.toStage(V.set(x, 0, z), V2));
    out.min.y = 0;
    out.max.y = (COT.peak + 0.4) * this.k * this.squash;
    return out;
  }

  /** The room floor area she may walk in (door-local), a little in from the walls and furniture. */
  clampToRoom(p: THREE.Vector3): THREE.Vector3 {
    p.x = THREE.MathUtils.clamp(p.x, -ROOM.halfW + 1.05, ROOM.halfW - 1.15);
    p.z = THREE.MathUtils.clamp(p.z, ROOM.zBack + 1.1, ROOM.zFront - 0.35);
    p.y = 0;
    return p;
  }
  /** Inside the cottage's own walls (where she waits for you when she walks in first), door-local. */
  clampToCottage(p: THREE.Vector3): THREE.Vector3 {
    p.x = THREE.MathUtils.clamp(p.x, -COT.w / 2 + 0.45, COT.w / 2 - 0.45);
    p.z = THREE.MathUtils.clamp(p.z, -COT.d + 0.45, ROOM.zFront - 0.3);
    p.y = 0;
    return p;
  }

  // ------------------------------------------------------------------ the door
  setOpen(on: boolean, instant = false): void {
    this.openTarget = on ? 1 : 0;
    if (instant) this.open = this.openTarget;
  }

  /** Inside / outside (crossing the door, or forced by a glide or Move). Starts/stops the TV. */
  setInside(v: boolean): void {
    if (v === this.inside) return;
    this.inside = v;
    this.wearPlain(v);
    if (v) this.media.playTheme(T_INSIDE, true);
    else {
      this.media.stopTheme(T_INSIDE);
      this.endParty();
    }
    this.wasOutside = !v;
    this.onCross?.(v);
  }

  // ------------------------------------------------------------------ taps
  /** What a (world-space) ray hits: room things (inside, or seen through the open door), the door, the house. */
  pick(ray: THREE.Ray): HouseItem | null {
    if (!this.present) return null;
    this.root.updateMatrixWorld(true);
    R.copy(ray).applyMatrix4(INV.copy(this.root.matrixWorld).invert());
    let throughDoor = this.inside;
    let doorDist = Infinity;
    if (!this.inside) {
      if (R.origin.z > 0 && R.direction.z < 0) {
        const t = -R.origin.z / R.direction.z;
        const x = R.origin.x + R.direction.x * t, y = R.origin.y + R.direction.y * t;
        if (y >= 0 && Math.abs(x) < DOOR_R && (y < DOOR_H0 || Math.hypot(x, y - DOOR_H0) < DOOR_R)) {
          throughDoor = this.open > 0.5;
          doorDist = V.set(x, y, 0).distanceTo(R.origin);
          if (!throughDoor) return 'door';
        }
      }
    }
    if (throughDoor && this.room.group.visible) {
      let best: RoomItem | null = null, bd = Infinity;
      for (const [name, box] of Object.entries(this.room.hits) as [RoomItem, THREE.Box3][]) {
        const p = R.intersectBox(box, V2);
        if (!p) continue;
        const d = p.distanceTo(R.origin);
        if (d < bd) { bd = d; best = name; }
      }
      if (best) return best;
      if (!this.inside) return 'door';
      return null;
    }
    if (!this.inside) {
      const hw = COT.w / 2 + 0.2;
      const b = BOX.set(V.set(-hw, 0, -COT.d - 0.2), V2.set(hw, COT.peak + 0.6, 0.5));
      if (R.intersectsBox(b) && doorDist === Infinity) return 'house';
    }
    return null;
  }

  /** Play a tapped thing. Returns what she should do about it ('dance' for the jukebox party). */
  interact(item: HouseItem): 'dance' | 'cheer' | 'sparkle' | null {
    const st = this.st, k = this.k, fx = st.fx;
    const at = (v: THREE.Vector3) => this.toStage(v, new THREE.Vector3());
    const S = this.room.spots;
    switch (item) {
      case 'tv': {
        if (this.playing) {
          this.media.stopTheme(T_INSIDE);
          this.media.stopTheme(T_JUKE);
          this.endParty();
        } else this.media.playTheme(T_INSIDE);
        fx.emit({ count: 10, glyph: ['note', 'sparkle'], colors: [PAL.pink, PAL.blue, PAL.yellow, PAL.white], at: at(S.tvScreen), spread: [0.25 * k, 0.15 * k, 0.05 * k], vel: [0, 0.35 * k, 0.15 * k], velSpread: [0.15 * k, 0.1 * k, 0.1 * k], life: [0.9, 1.4], size: [0.07 * k, 0.11 * k] });
        return null;
      }
      case 'jukebox': {
        listenTo(this.media.theme);
        this.media.playTheme(T_JUKE);
        this.party = 9;
        if (st.moodName === 'normal' || this.partyMood) { st.setMood('party'); this.partyMood = true; }
        fx.emit({ count: 18, glyph: ['note', 'heart', 'star'], colors: RAINBOW, at: at(S.jukebox), spread: [0.25 * k, 0.2 * k, 0.1 * k], burst: 0.6 * k, vel: [0, 0.4 * k, 0.2 * k], drag: 1.2, life: [1.2, 1.8], size: [0.07 * k, 0.12 * k] });
        return 'dance';
      }
      case 'tub':
        fx.emit({ count: 34, glyph: ['dot', 'ring', 'dot'], colors: [0xffffff, PAL.sky, PAL.pinkSoft, 0xe6dcff], at: at(S.tub), spread: [0.38 * k, 0.05 * k, 0.22 * k], vel: [0, 0.32 * k, 0], velSpread: [0.1 * k, 0.12 * k, 0.1 * k], sway: 0.05 * k, drag: 0.4, life: [1.6, 2.8], size: [0.035 * k, 0.1 * k] });
        return 'cheer';
      case 'chest':
        this.popChest();
        return 'cheer';
      case 'mirror':
        this.shineT = 0;
        fx.emit({ count: 26, glyph: ['sparkle', 'star'], colors: [PAL.white, PAL.yellow, PAL.pinkSoft, PAL.sky], at: at(S.mirror), spread: [0.4 * k, 0.5 * k, 0.05 * k], burst: 0.25 * k, drag: 1.4, life: [0.6, 1.2], size: [0.05 * k, 0.1 * k] });
        return 'sparkle';
      case 'lamp':
        this.lampSpin = 3;
        fx.emit({ count: 16, glyph: ['star', 'sparkle'], colors: [PAL.yellow, PAL.white], at: at(S.lamp), burst: 0.5 * k, drag: 1.6, life: [0.7, 1.1], size: [0.05 * k, 0.09 * k] });
        return null;
      case 'photos':
      case 'bed':
      case 'sofa':
      case 'window':
      case 'shelf': {
        const p = item === 'photos' ? S.photos : item === 'window' ? V.set(-ROOM.halfW + 0.3, 1.7, -2.85) : null;
        if (p) fx.emit({ count: 14, glyph: ['heart', 'sparkle'], colors: [PAL.pink, PAL.white, PAL.yellow], at: at(p), burst: 0.35 * k, drag: 1.6, life: [0.7, 1.2], size: [0.05 * k, 0.09 * k] });
        return item === 'photos' ? 'cheer' : null;
      }
      default:
        return null;
    }
  }

  /** A burst of tiny hearts from the chimney (the House moment). */
  puffHearts(n: number): void {
    const k = this.k;
    this.st.fx.emit({ count: n, glyph: 'heart', colors: PETALS, at: this.toStage(this.chimneyTop, V), spread: [0.08 * k, 0.05 * k, 0.08 * k], vel: [0, 0.6 * k, 0], velSpread: [0.25 * k, 0.15 * k, 0.25 * k], sway: 0.06 * k, drag: 0.6, life: [1.8, 2.6], size: [0.1 * k, 0.16 * k] });
  }

  private popChest(): void {
    if (this.chestT >= 0 && this.chestT < 1.4) return;
    this.chestT = 0;
    const st = this.st, k = this.k, play = st.play;
    const from = this.toStage(V.copy(this.room.spots.chest).setY(0.62));
    const n = 7;
    for (let i = 0; i < n; i++) {
      // out of the chest towards the middle of the room, up and spreading
      const a = (i / (n - 1) - 0.5) * 1.4;
      const dir = V2.set(-Math.cos(a) * 1.1, 3.1 + Math.random() * 0.8, Math.sin(a) * 1.1);
      const vel = this.dirToStage(dir);
      const b = play.throwHeart(from.clone().add(this.dirToStage(V.set(-0.05, 0, (Math.random() - 0.5) * 0.3))), vel);
      b.sense = false;
      b.r *= 1.9;
    }
    st.fx.emit({ count: 20, glyph: ['heart', 'sparkle'], colors: [PAL.pink, PAL.red, PAL.white, PAL.yellow], at: from, burst: 0.7 * k, drag: 1.5, life: [0.6, 1.1], size: [0.05 * k, 0.1 * k] });
  }

  private get playing(): boolean {
    return this.media.themeOn && !this.media.theme.paused;
  }

  private endParty(): void {
    this.party = 0;
    this.media.stopTheme(T_JUKE);
    if (this.partyMood) {
      this.partyMood = false;
      if (this.st.moodName === 'party') this.st.setMood('normal');
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number, camObj: THREE.Camera | null): void {
    const st = this.st, h = st.house;
    const k = st.variant === 'ar' ? this.sizeMul / Math.max(0.05, st.root.scale.x) : SHOW_K;
    this.k = k;
    // popping away for a game / back afterwards (scale only)
    if (this.awayK !== this.awayTarget) {
      const soft = st.actor.soft;
      this.awayK = THREE.MathUtils.clamp(this.awayK + (this.awayTarget ? 1 : -1) * dt / (soft ? 0.25 : this.awayTarget ? 0.45 : 0.3), 0, 1);
      if (this.awayK === 0) this.root.visible = false;
    }
    const pop = this.awayK >= 1 ? 1 : this.awayTarget ? (st.actor.soft ? this.awayK : ease.backOut(this.awayK)) : (st.actor.soft ? this.awayK : 1 - ease.inOut(1 - this.awayK));
    const pk = Math.max(0.001, pop);
    if (st.variant === 'ar' && !this.posed) {
      this.restPos(h.position);
      h.rotation.set(0, 0, 0);
    }
    const sq = this.squash;
    this.root.scale.set(k * sq * pk, k * (2 - sq) * pk, k * sq * pk);
    this.root.position.set(0, 0, (COT.d / 2) * k);
    st.houseSize.set((COT.w + 0.3) * k, COT.peak * k, (COT.d + 0.3) * k);
    if (st.variant === 'ar' && st.mailbox) {
      // the mailbox stands at the garden's front left corner (life size too)
      const mb = st.mailbox;
      this.toStage(V.set(-COT.w / 2 - 0.55, 0, 0.95), mb.position);
      mb.scale.setScalar(((1.05 * k) / 0.78) * pk);
      mb.visible = this.awayK > 0.001;
      mb.rotation.set(0, h.rotation.y + 0.45, this.mailTilt);
    }
    this.toStage(V.set(0, 0, 0.45), st.door);
    h.updateMatrixWorld(true);
    if (!h.visible || !this.root.visible) return;

    this.t += dt;
    const t = this.t;
    // the door swings
    const prev = this.open;
    this.open += (this.openTarget - this.open) * damp(2.4, dt);
    if (Math.abs(this.openTarget - this.open) < 0.002) this.open = this.openTarget;
    // (compared with the target, not the last value: an instant shut (Move, Start again) left the leaf swung open)
    void prev;
    const leafY = ease.inOut(this.open) * 1.92;
    if (this.leaf.rotation.y !== leafY) this.leaf.rotation.y = leafY;
    // the sun turns and bobs
    this.sun.rotation.z -= dt * 0.25;
    this.sun.position.y = this.sunAt.y + Math.sin(t * 0.9) * 0.05;
    this.sun.rotation.y = Math.sin(t * 0.5) * 0.25;
    // tiny hearts from the chimney while you're outside
    if (!this.inside && this.body.visible) {
      this.chimneyT -= dt;
      if (this.chimneyT <= 0) {
        this.chimneyT = st.actor.soft ? 1.2 : 0.6;
        st.fx.emit({ count: 1, glyph: 'heart', colors: PETALS, at: this.toStage(this.chimneyTop, V), spread: [0.05 * k, 0, 0.05 * k], vel: [0.03 * k, 0.32 * k * this.squash, 0], velSpread: [0.05 * k, 0.06 * k, 0.05 * k], sway: 0.06 * k, drag: 0.2, life: [2.2, 2.8], size: [0.09 * k, 0.14 * k] });
      }
    }
    this.animateRoom(dt);
    this.portal(camObj);
  }

  private animateRoom(dt: number): void {
    const r = this.room, t = this.t;
    if (!r.group.visible) return;
    // window clouds drift
    r.sky.offset.x = (t * 0.01) % 1;
    r.mobile.rotation.y += dt * 0.22;
    // lamp
    this.lampSpin = Math.max(0, this.lampSpin - dt);
    r.lampStar.rotation.y += dt * (0.7 + this.lampSpin * 3);
    (r.lampHalo.material as THREE.MeshBasicMaterial).opacity = 0.26 + Math.sin(t * 2.2) * 0.06 + (this.party > 0 ? 0.1 : 0);
    // the theme: TV play icon, jukebox bars
    const playing = this.playing;
    r.playIcon.visible = !playing;
    const real = playing && levels(this.lv);
    if (!real) fakeLevels(this.lv, t, playing);
    for (let i = 0; i < r.arch.length; i++) {
      const m = r.arch[i].material as THREE.MeshBasicMaterial;
      const l = playing ? this.lv[(i + 1) % this.lv.length] : 0;
      m.color.setHex(r.arch[i].userData.hex as number).multiplyScalar(playing ? 0.45 + l * 0.85 : 0.5);
    }
    for (let i = 0; i < r.eq.length; i++) r.eq[i].scale.y = 0.03 + 0.3 * this.lv[i];
    const kick = playing ? this.lv[0] : 0;
    r.jukeHeart.scale.setScalar(1 + kick * 0.35);
    // fairy lights: a slow twinkle, a fast rainbow chase during a party
    this.twinkleT -= dt;
    if (this.twinkleT <= 0) {
      this.twinkleT = this.party > 0 ? 0.09 : 0.35;
      this.twinkleStep++;
      const n = r.bulbCount;
      for (let i = 0; i < n; i++) {
        if (this.party > 0) COLR.setHex(LAMPS[(i + this.twinkleStep) % 4]);
        else {
          COLR.setHex(LAMPS[i % 4]);
          const tw = ((i * 7 + this.twinkleStep) % 9) === 0;
          if (tw) COLR.setHex(0xffffff);
        }
        r.bulbs.setColorAt(i, COLR);
      }
      r.bulbs.instanceColor!.needsUpdate = true;
    }
    // jukebox party
    if (this.party > 0) {
      this.party -= dt;
      if (Math.floor(t * 2.5) !== Math.floor((t - dt) * 2.5)) {
        this.st.fx.emit({ count: 1, glyph: 'note', colors: [PAL.pink, PAL.blue, PAL.purple, PAL.yellow], at: this.toStage(V.copy(r.spots.jukebox).setY(1.75)), spread: [0.2 * this.k, 0.05 * this.k, 0.1 * this.k], vel: [0, 0.3 * this.k, 0.12 * this.k], velSpread: [0.12 * this.k, 0.05 * this.k, 0.08 * this.k], sway: 0.05 * this.k, life: [1.6, 2.2], size: [0.1 * this.k, 0.14 * this.k] });
      }
      if (this.party <= 0) this.endParty();
    }
    // chest lid
    if (this.chestT >= 0) {
      this.chestT += dt;
      const c = this.chestT;
      const a = c < 0.22 ? ease.backOut(c / 0.22) : c < 1.5 ? 1 : c < 1.9 ? 1 - ease.inOut((c - 1.5) / 0.4) : 0;
      r.chestLid.rotation.x = -1.25 * a;
      if (c >= 1.9) this.chestT = -1;
    }
    // mirror shine sweep
    if (this.shineT >= 0) {
      this.shineT += dt;
      const s = r.mirrorShine, u = this.shineT / 0.6;
      s.visible = u < 1;
      s.position.copy(r.spots.mirror).add(V.set(0.5 - u * 1.0, 0.25, -0.38));
      s.rotation.y = Math.PI;
      if (u >= 1) this.shineT = -1;
    }
    // a new photo on the wall: a little sparkle there
    const pw = photoWall();
    if (pw.version !== this.photoV) {
      this.photoV = pw.version;
      this.st.fx.emit({ count: 16, glyph: ['sparkle', 'heart'], colors: [PAL.white, PAL.pink, PAL.yellow], at: this.toStage(r.spots.photos, V), spread: [0.05 * this.k, 0.3 * this.k, 0.6 * this.k], burst: 0.25 * this.k, drag: 1.5, life: [0.6, 1], size: [0.05 * this.k, 0.09 * this.k] });
    }
  }

  /** The portal: which side the camera is on, what to draw, the doorway clip. */
  private portal(camObj: THREE.Camera | null): void {
    if (!camObj) return;
    camObj.getWorldPosition(W);
    const lp = this.root.worldToLocal(this.cam.copy(W));
    const inOpening = Math.abs(lp.x) < DOOR.w / 2 + 0.2 && lp.y < DOOR.h + 0.45 && lp.y > -1;
    const outsideNow = lp.z > 0;
    if (this.open > 0.5 && outsideNow !== this.wasOutside && inOpening) this.setInside(!outsideNow);
    else if (this.inside && ((outsideNow && lp.z > 0.05 && !inOpening) || Math.abs(lp.x) > ROOM.halfW + ROOM_SLACK || lp.z < ROOM.zBack - ROOM_SLACK)) {
      // walked out through a wall: you're outside (the room hides, the cottage comes back)
      this.setInside(false);
    }
    this.wasOutside = outsideNow;
    const front = lp.z > 0;
    this.room.group.visible = this.inside || (front && this.open > 0.01);
    this.leaf.visible = this.inside || front;
    this.body.visible = !this.inside;
    if (!this.room.group.visible && !this.leaf.visible) return;
    const m = this.root.matrixWorld;
    // the door plane, a hair inside the room, facing in (kept side = the room)
    DOORP.setFromNormalAndCoplanarPoint(V2.set(0, 0, -1).transformDirection(m), V.set(0, 0, -0.03).applyMatrix4(m));
    if (this.inside) this.clip.off();
    else if (front && lp.z < 0.08 && inOpening) this.clip.doorway(DOORP);
    else {
      const hw = DOOR.w / 2 + 0.012, yb = -0.6, yt = DOOR.h + 0.02;
      C4[0].set(-hw, yb, 0).applyMatrix4(m);
      C4[1].set(hw, yb, 0).applyMatrix4(m);
      C4[2].set(hw, yt, 0).applyMatrix4(m);
      C4[3].set(-hw, yt, 0).applyMatrix4(m);
      this.clip.through(W, C4, V.set(0, DOOR.h / 2, -1).applyMatrix4(m), DOORP);
    }
  }

  /** Showcase: blend the camera towards the tour pose (stage-local = world there). */
  applyTour(cam: THREE.PerspectiveCamera): void {
    const tk = this.tour.k;
    if (tk <= 0.0001) return;
    const e = ease.inOut(Math.min(1, tk));
    cam.getWorldDirection(V2).multiplyScalar(4).add(cam.position);
    cam.position.lerp(this.tour.pos, e);
    V2.lerp(this.tour.look, e);
    cam.lookAt(V2);
    cam.updateMatrixWorld();
  }

  /** The showcase tour: the TV is already playing as the camera glides in (the theme's 'tour' user). */
  tourTv(on: boolean): void {
    if (on) this.media.playTheme(T_TOUR);
    else this.media.stopTheme(T_TOUR);
  }

  /** Everything back to rest (Start again, Move): outside, door shut, no party. */
  reset(): void {
    this.tourTv(false);
    if (this.inside) this.setInside(false);
    this.endParty();
    this.squash = 1;
    this.mailTilt = 0;
    this.tour.k = 0;
    this.chestT = -1;
    this.room.chestLid.rotation.x = 0;
    this.shineT = -1;
    this.room.mirrorShine.visible = false;
  }
}

const BOX = new THREE.Box3();
const DOORP = new THREE.Plane();
