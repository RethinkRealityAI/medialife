// AR: walking into Bobo's Hideout (scene/house/, src/evade/world/hideout.ts). A freestanding door frame (an Eclipse
// can opened up into a doorway) stands on the stage a metre or so behind Bobo; a beat after Place its door swings
// open and through it you see the hideout's hall, life size, with Bobo's Arcade along its walls and the Collector Hub
// can at the back. You walk in through the door with your phone (the portal notices the crossing) and Bobo pops in
// to greet you; walk back out (or tap Leave) and your own room is back.
//
// For anyone who can't walk a few metres (small room, wheelchair, sitting down), "Step inside" (or a tap on the
// door) brings the hall to you: the doorway glides over the phone, so you end up inside exactly as if you had walked.
// Leave glides it back out over you and home.
//
// Bobo can walk in first (joystick through the doorway): he waits just inside, until you come.
import * as THREE from 'three';
import type { Stage } from '../../scene/stage';
import type { MomentRunner } from '../../scene/moments';
import type { Shared } from '../shared';
import { PAL } from '../../scene/fx';
import { angleTo, ease } from '../../core/timeline';
import { COT, DOOR } from '../../scene/house/dims';
import { HALL } from '../../../evade/world/hideout';

interface Pose { pos: THREE.Vector3; yaw: number }
interface Glide { to: Pose | (() => Pose); dur: number; from?: Pose; fromL?: THREE.Vector3; t: number; then?: () => void }

export interface WalkHost {
  hint(text: string, seconds: number): void;
  syncHud(): void;
  tapAction(name: string): void;
  /** Tracking is calm right now (the door only opens then: the room starts drawing behind it). */
  calm(): boolean;
  /** A breadcrumb for ?diag. */
  note(what: string): void;
  /** A machine was tapped (inside, or through the open door): Bobo walks over, then its card opens. */
  goToCabinet(id: string): void;
  /** Bobo is at a machine and the Play pill was tapped. */
  openArcade(id: string, source: 'walk'): void;
}

const V = new THREE.Vector3(), V2 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
const FC = new THREE.Vector3(), FF = new THREE.Vector3();
const TIP_INSIDE = 'Tap a machine to play';
const BACK_IN = 'Walk Bobo to the door to go back in';

export class HouseWalk {
  readonly stepBtn: HTMLButtonElement;
  /** Bobo walked in ahead of you and waits just inside the door. */
  bearIn = false;
  /** Test only (?test): the camera's pose in door-local metres, applied over the tracked pose every frame. */
  testPose: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;
  private glides: Glide[] = [];
  private openIn = 0;
  private doorWait = 0;
  private hop: { at: number; to: THREE.Vector3; yaw: number; then?: () => void } | null = null;
  private tipT = 0;
  private playBtn: HTMLButtonElement;
  private near: string | null = null;

  constructor(private sh: Shared, private st: Stage, private runner: MomentRunner, private host: WalkHost) {
    this.stepBtn = sh.hud.pill('Step inside', () => this.stepInside());
    this.stepBtn.dataset.cmd = 'step-inside';
    this.playBtn = sh.hud.pill('Play', () => { if (this.near) host.openArcade(this.near, 'walk'); });
    this.playBtn.dataset.cmd = 'play-near';
    st.houseSet.onCross = (inside) => this.crossed(inside);
  }

  get inside(): boolean {
    return this.st.houseSet.inside;
  }
  /** The house is gliding (step inside / leave). */
  get busy(): boolean {
    return this.glides.length > 0;
  }

  /** Placed (or placed again): the door opens a beat later. */
  placed(): void {
    if (this.st.houseSet.openTarget < 1) { this.openIn = 0.9; this.doorWait = 0; }
  }

  // ------------------------------------------------------------------ step inside / leave
  /** Camera in stage space, flat forward (shared scratch vectors: valid until the next call). */
  private camFlat(): { c: THREE.Vector3; f: THREE.Vector3 } {
    const c = FC.copy(this.st.cam).setY(0);
    const f = FF.copy(this.st.camDir).setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    return { c, f: f.normalize() };
  }
  /** The house pose that puts the camera at door-local z = `zc` on the door's axis, facing along `yaw`. */
  private poseFor(c: THREE.Vector3, yaw: number, zc: number): Pose {
    const k = this.st.houseSet.k;
    const off = V.set(0, 0, zc * k).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    return { pos: c.clone().sub(off).setY(0), yaw };
  }

  /** Bring the room to you: the doorway glides over the phone and you're inside. */
  stepInside(): void {
    const hs = this.st.houseSet;
    if (this.inside) return;
    this.glides.length = 0; // a Step inside tap while it's heading home turns straight round
    this.runner.cancel();
    this.host.note('step inside');
    hs.setOpen(true, hs.open < 0.6);
    this.openIn = 0;
    const { c, f } = this.camFlat();
    const yaw = Math.atan2(-f.x, -f.z); // the room (door-local -z) straight ahead
    this.glides.push(
      { to: this.poseFor(c, yaw, 1.7), dur: this.sh.reduced ? 0.5 : 1.0, t: 0 },
      { to: this.poseFor(c, yaw, -1.2), dur: this.sh.reduced ? 0.5 : 1.1, t: 0, then: () => { if (!this.inside) hs.setInside(true); } },
    );
    this.host.syncHud();
  }

  /** Back out of the house: the doorway passes back over you, then the house goes home. */
  leave(): void {
    const hs = this.st.houseSet;
    if (!this.inside) return;
    this.glides.length = 0; // a Leave tap mid-glide turns straight round
    const { c } = this.camFlat();
    const yaw = this.st.house.rotation.y;
    const lp = hs.cam;
    if (Math.abs(lp.x) > 0.3 || lp.z < -1.4) this.glides.push({ to: this.poseFor(c, yaw, -0.95), dur: this.sh.reduced ? 0.4 : 0.8, t: 0 });
    this.glides.push(
      { to: this.poseFor(c, yaw, 1.6), dur: this.sh.reduced ? 0.5 : 1.1, t: 0, then: () => { if (this.inside) hs.setInside(false); } },
      { to: () => ({ pos: hs.restPos(new THREE.Vector3()), yaw: 0 }), dur: this.sh.reduced ? 0.5 : 1.2, t: 0, then: () => { this.backToDoor(); this.host.hint(BACK_IN, 5); } },
    );
    this.host.syncHud();
  }

  /** At once: door home, you outside, Bobo by the door (Move, leaving AR, Start again, a game starting). */
  collapse(): void {
    const st = this.st, hs = st.houseSet;
    this.glides.length = 0;
    hs.posed = false;
    st.house.rotation.set(0, 0, 0);
    hs.restPos(st.house.position);
    const hadHop = !!this.hop;
    if (this.hop) { st.actor.scripted = Math.max(0, st.actor.scripted - 1); this.hop = null; }
    const wasIn = this.inside || this.bearIn;
    hs.setInside(false);
    // Bobo goes to the doorstep if you were in, he was waiting in there, a hop was cut short (you had just walked
    // out, his hop out was still pending and Move left him standing in the hidden hall), or he is in the hall
    hs.root.updateMatrix();
    const l = hs.fromStage(st.actor.position, V);
    const behind = l.z < -0.1 && Math.hypot(l.x, l.z - HALL.cz) < HALL.r + 0.3; // somewhere in the (hidden) hall
    if (wasIn || hadHop || behind) this.toDoor(st.actor.position);
    this.bearIn = false;
  }

  /** Start again / Move: also shut the door (it opens again a beat after Place, once tracking is calm). */
  reset(): void {
    this.collapse();
    this.st.houseSet.setOpen(false, true);
    this.openIn = 0;
  }

  /** The door popped back after a game: if Bobo stands where its frame is, he hops out to the doorstep. */
  evict(): void {
    const hs = this.st.houseSet, a = this.st.actor;
    const l = hs.fromStage(a.position, V);
    const hw = COT.w / 2 + 0.25;
    if (Math.abs(l.x) < hw && l.z < 0.35 && l.z > -COT.d - 0.3) this.hopTo(this.toDoor(new THREE.Vector3()), a.heading, 0.2);
  }

  /** The door is home again after Leave: Bobo pops out in front of it, facing you (never left in the hall). */
  private backToDoor(): void {
    const st = this.st, hs = st.houseSet;
    const to = this.toDoor(new THREE.Vector3());
    const c = this.camFlat().c;
    const yaw = Math.atan2(c.x - to.x, c.z - to.z);
    if (st.actor.position.distanceTo(to) > 0.2) this.hopTo(to, yaw, 0.05);
    void hs;
  }

  private toDoor(out: THREE.Vector3): THREE.Vector3 {
    return this.st.houseSet.toStage(V2.set(0.55, 0, 1.0), out).setY(0);
  }

  // ------------------------------------------------------------------ crossing
  private crossed(inside: boolean): void {
    const st = this.st, hs = st.houseSet, a = st.actor;
    this.runner.cancel();
    this.host.note(inside ? 'crossed in' : 'crossed out');
    if (inside) {
      // Bobo pops in front of you and waves
      const lp = hs.cam;
      const fwd = hs.fromStage(V.copy(st.cam).add(st.camDir), new THREE.Vector3()).sub(hs.fromStage(V2.copy(st.cam), new THREE.Vector3())).setY(0);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      const spot = hs.clampToRoom(new THREE.Vector3(lp.x, 0, lp.z).addScaledVector(fwd, 1.3));
      const yaw = Math.atan2(lp.x - spot.x, lp.z - spot.z) + st.house.rotation.y;
      this.hopTo(hs.toStage(spot, new THREE.Vector3()), yaw, 0.35, () => { if (this.runner.trigger('Wave')) this.host.tapAction('Wave'); });
      this.bearIn = false;
      this.host.hint("You're in Bobo's Hideout!", 4);
      this.tipT = 4.5;
    } else {
      const out = this.toDoor(new THREE.Vector3());
      const lp = hs.cam;
      const yaw = Math.atan2(lp.x - 0.55, lp.z - 1.0) + st.house.rotation.y;
      if (a.position.distanceTo(out) > 0.2) this.hopTo(out, yaw, 0.25);
      this.bearIn = false;
      this.tipT = 0;
      // the way back in is always there: the Step inside pill comes back, and the hint says so
      this.host.hint(BACK_IN, 5);
    }
    this.host.syncHud();
  }

  private hopTo(to: THREE.Vector3, yaw: number, delay: number, then?: () => void): void {
    const a = this.st.actor;
    if (!this.hop) a.scripted++;
    this.hop = { at: delay, to: to.clone(), yaw, then };
  }

  // ------------------------------------------------------------------ Bobo walking (joystick) near / in the hideout
  /** Keep Bobo in the hall (you're in), just inside the door (he went in first) or off the frame; the doorway lets him in. */
  constrain(p: THREE.Vector3, door: boolean): void {
    const hs = this.st.houseSet;
    if (!hs.present) return; // hidden, or popped away for a game: its ground is free
    const l = hs.fromStage(p, V);
    if (this.inside) {
      p.copy(hs.toStage(hs.clampToRoom(l), V2)).setY(0);
      return;
    }
    const gap = DOOR.w / 2 - 0.16;
    if (this.bearIn) {
      if (l.z > -0.45 && Math.abs(l.x) < gap) {
        // in the doorway: he may walk back out
        l.x = THREE.MathUtils.clamp(l.x, -gap, gap);
        if (l.z > 0.3) this.bearIn = false;
      } else hs.clampToCottage(l);
      p.copy(hs.toStage(l.setY(0), V2)).setY(0);
      return;
    }
    const hw = COT.w / 2 + 0.2, z0 = -COT.d - 0.2, z1 = 0.16;
    // Bobo walks up to a shut door: it swings open by itself
    if (door && hs.openTarget < 1 && Math.abs(l.x) < DOOR.w / 2 + 0.35 && l.z > -0.1 && l.z < 0.9) {
      this.openIn = 0;
      this.host.note('door opens (Bobo)');
      hs.setOpen(true);
    }
    if (Math.abs(l.x) < hw && l.z > z0 && l.z < z1) {
      if (door && Math.abs(l.x) < gap && hs.open > 0.6) {
        // through the open door: in he goes
        if (l.z < -0.35) {
          this.bearIn = true;
          this.host.hint('Follow Bobo inside!', 4);
          this.host.syncHud();
        }
        return;
      }
      const px = hw - Math.abs(l.x), pzf = z1 - l.z, pzb = l.z - z0;
      if (px < Math.min(pzf, pzb)) l.x = Math.sign(l.x || 1) * hw;
      else if (pzf < pzb) l.z = z1;
      else l.z = z0;
      p.copy(hs.toStage(l.setY(0), V2)).setY(0);
    }
  }

  // ------------------------------------------------------------------ taps
  /** A tap (world ray): a machine, the door / its frame (step inside). True if it was ours. */
  tap(ray: THREE.Ray): boolean {
    const hs = this.st.houseSet;
    const item = hs.pick(ray);
    if (!item) return false;
    if (item === 'house' || item === 'door') {
      if (!this.inside) this.stepInside();
      return true;
    }
    if (item.startsWith('arcade:')) {
      if (this.tipT > 0) this.tipT = 0;
      this.host.goToCabinet(item.slice(7));
    }
    return true;
  }

  // ------------------------------------------------------------------ per frame
  /** Test only: put the camera at `testPose` (door-local metres). Call right after the engine has posed it. */
  applyTestPose(cam: THREE.Camera): void {
    const tp = this.testPose;
    if (!tp) return;
    const root = this.st.houseSet.root;
    root.updateMatrixWorld(true);
    const p = root.localToWorld(V.set(tp.x, tp.y, tp.z));
    const d = V2.set(-Math.sin(tp.yaw) * Math.cos(tp.pitch), Math.sin(tp.pitch), -Math.cos(tp.yaw) * Math.cos(tp.pitch)).transformDirection(root.matrixWorld);
    cam.position.copy(p);
    cam.up.set(0, 1, 0);
    cam.lookAt(p.clone().add(d));
    cam.updateMatrixWorld(true);
  }

  update(dt: number): void {
    const st = this.st, hs = st.houseSet, a = st.actor;
    // the door opens a beat after Place, and only while tracking is calm (the room starts drawing behind it)
    if (this.openIn > 0) {
      this.openIn -= dt;
      // not calm yet: try again shortly (but never keep the door shut for more than about 10 s)
      if (this.openIn <= 0 && (!hs.present || (!this.host.calm() && (this.doorWait += 0.25) < 10))) this.openIn = 0.25;
      else if (this.openIn <= 0) {
        this.openIn = 0;
        this.host.note('door opens');
        hs.setOpen(true);
        st.fx.emit({ count: 22, glyph: ['heart', 'sparkle'], colors: [PAL.pink, PAL.white, PAL.yellow], at: hs.toStage(V.set(0, DOOR.h * 0.6, 0.2)), spread: [0.3 * hs.k, 0.5 * hs.k, 0.05 * hs.k], burst: 0.4 * hs.k, drag: 1.5, life: [0.8, 1.3], size: [0.06 * hs.k, 0.11 * hs.k] });
      }
    }
    // the glide
    const g = this.glides[0];
    if (g) {
      hs.posed = true;
      // glide in the house's own frame: the phone moves in a straight line through the garden and the doorway
      // (lerping the house's position and turn separately would swing the phone through the frame)
      const c = this.camFlat().c;
      if (!g.from) {
        g.from = { pos: st.house.position.clone(), yaw: st.house.rotation.y };
        g.fromL = c.clone().sub(g.from.pos).applyAxisAngle(UP, -g.from.yaw);
      }
      if (typeof g.to === 'function') g.to = g.to();
      g.t = Math.min(1, g.t + dt / g.dur);
      const k = ease.inOut(g.t), to = g.to as Pose;
      const yaw = g.from.yaw + angleTo(g.from.yaw, to.yaw) * k;
      const L = V2.copy(c).sub(to.pos).applyAxisAngle(UP, -to.yaw).lerp(g.fromL!, 1 - k);
      st.house.position.copy(c).sub(L.applyAxisAngle(UP, yaw)).setY(0);
      st.house.rotation.y = yaw;
      if (g.t >= 1) {
        this.glides.shift();
        g.then?.();
        if (!this.glides.length) {
          // home again (the last leg went to the resting spot) or staying where it brought the room to you
          hs.posed = this.inside;
          this.host.syncHud();
        }
      }
    }
    // Bobo's pop (in to greet you, or out by the door)
    const hop = this.hop;
    if (hop && (hop.at -= dt) <= 0) {
      this.hop = null;
      st.fx.emit({ count: 16, glyph: ['sparkle', 'star'], colors: [PAL.pink, PAL.yellow, PAL.white], at: a.position.clone().setY(0.5), burst: 0.7, drag: 1.5, life: [0.6, 1], size: [0.06, 0.1] });
      a.position.copy(hop.to);
      a.setHeading(hop.yaw);
      st.fx.emit({ count: 22, glyph: ['sparkle', 'star', 'heart'], colors: [PAL.pink, PAL.yellow, PAL.white], at: hop.to.clone().setY(0.5), burst: 0.8, drag: 1.5, life: [0.7, 1.1], size: [0.06, 0.11] });
      a.scripted = Math.max(0, a.scripted - 1);
      a.settle();
      a.face('happy', 2);
      hop.then?.();
    }
    if (this.tipT > 0 && (this.tipT -= dt) <= 0 && this.inside) this.host.hint(TIP_INSIDE, 4);
  }

  /** The Step inside pill (above the bottom row) while Bobo is placed and you're outside; inside, the Play pill
   *  while he stands at a machine. */
  syncHud(walking: boolean): void {
    this.walking = walking;
    const show = walking && !this.inside && !this.busy && this.st.houseSet.present;
    if (show) this.sh.hud.above.appendChild(this.stepBtn);
    else this.stepBtn.remove();
    this.near = null;
    this.checkNear(false);
  }
  private walking = false;

  /** Bobo standing at a machine inside: the Play pill opens its card. `busy`: he's being walked there. */
  checkNear(busy: boolean): void {
    const a = this.st.actor, hs = this.st.houseSet;
    const cab = this.walking && this.inside && !busy && !a.walking && !this.hop ? hs.nearCabinet(a.position) : null;
    for (const c of hs.cabinets) if (c !== cab && c.glow > 0) c.glow = Math.max(0, c.glow - 0.05);
    const id = cab?.item.id ?? null;
    if (id === this.near && (!!id === !!this.playBtn.parentElement)) return;
    this.near = id;
    if (cab) {
      cab.glow = Math.max(cab.glow, 0.6);
      this.playBtn.textContent = `Play ${cab.item.name}`;
      this.playBtn.setAttribute('aria-label', `Open ${cab.item.name}`);
      this.sh.hud.above.appendChild(this.playBtn);
    } else this.playBtn.remove();
  }

  dispose(): void {
    this.stepBtn.remove();
    this.playBtn.remove();
    if (this.st.houseSet.onCross) this.st.houseSet.onCross = null;
  }
}
