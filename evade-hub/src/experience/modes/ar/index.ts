// AR: Happi and her house on your floor (world tracking, back camera).
//
//   placing  the stage follows a reticle on the floor; pinch to size it; Place is enabled once tracking has settled
//   placed   joystick walks her (camera-relative); Move (bottom left) is a full re-placement: out of the house,
//            the default size again, tracking restarted where you stand (a scale that drifted while you walked is
//            thrown away) and Place waits for freshly settled tracking; her state, a paused game and the photo wall
//            are kept;
//            tap her for a reaction; her house stands behind her, life size, and its door is a portal: walk in through
//            it with your phone (or tap "Step inside" / the house and the room comes to you), the TV plays the theme;
//            walk back out or tap Leave (./house-walk.ts, scene/house/)
//
// Leaving AR remembers where the stage stood relative to the phone; coming back (from 3D or Selfie) puts it back in
// the same place in front of you once tracking has settled again (a new run has a new world origin).
import { MOVES_ICON } from '../../../happi/moves';
import * as THREE from 'three';
import type { ExperienceMode } from '../../../shared/contracts';
import type { Mode, XrScene } from '../../types';
import type { Stage } from '../../scene/stage';
import { HouseWalk } from './house-walk';
import type { MomentRunner } from '../../scene/moments';
import { PAL } from '../../scene/fx';
import { angleTo, damp } from '../../core/timeline';
import { ICON } from '../../hud/icons';
import { bindGestures, type Shared } from '../shared';
import { HeartToss, hugBear } from '../../physics/toss';
import { PlayKit, type PlayGame, type PlayHost } from '../../play';

/** The "throw hearts" hint shows once per visit. */
let tossHinted = false;

const SCALE = { def: 0.85, min: 0.4, max: 1.6 }; // 0.85: Happi about a metre tall (Dapo 2026-11-20: near the 3D size), the house life size
/**
 * The pinch sizes her house too (ar-4, Dapo: "I can't really resize it"): life size at the default, from 0.6x to 1.6x.
 * Move puts both back to the default.
 */
const houseMul = (s: number) => THREE.MathUtils.clamp(s / SCALE.def, 0.6, 1.6);
const STEADY = 0.5; // seconds the reticle must sit steadily on the floor before Place lights up
const REACH = { min: 0.8, max: 3.6 }; // metres from the phone the reticle may sit
const AREA = 3.0; // stage units she may walk from the stage centre
const TAP_REACTIONS = ['Wave', 'Cheer', 'Sparkle'];
const TOSS_HINT = 'Swipe up to throw blossoms';

type State = 'placing' | 'placed';

export class ArMode implements Mode {
  readonly id = 'ar' as const;
  readonly camera = 'world' as const;
  readonly root = new THREE.Group();
  private anchor = new THREE.Group();
  private reticle = new THREE.Group();
  private state: State = 'placing';
  private scale = SCALE.def;
  private everPlaced = false;
  private resumePlaced = false;
  private saved: { fwd: number; side: number; yaw: number } | null = null;
  private restoring = false;
  private active = false;
  private live = false; // enter() has run for this activation
  // her house: walk in through the door (./house-walk.ts)
  readonly walk: HouseWalk;
  /** You're inside her house. */
  get inside(): boolean {
    return this.walk.inside;
  }
  /** 1 when the house is still (0 while it glides to you or back home). */
  private get houseT(): number {
    return this.walk.busy ? 0 : 1;
  }
  // HUD bits
  private placeBtn: HTMLButtonElement;
  private moveBtn: HTMLButtonElement;
  private leaveBtn: HTMLButtonElement;
  private stick: { readonly vector: THREE.Vector2; readonly active: boolean } | null = null;
  private unbind: (() => void) | null = null;
  private hintT = 0;
  private limitedT = 0;
  private lastHint = '';
  /** How long the reticle has sat on the floor without a break (Place waits for a steady half second). */
  private steadyT = 0;
  /** The floor point is past arm's reach (phone held level): the reticle would sit low on screen, so ask to tilt. */
  private aimLow = false;
  /** How long Happi has been off screen while placed (a hint offers Move to bring Happi back). */
  private lostT = 0;
  // scratch
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hit = new THREE.Vector3();
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private camFwd = new THREE.Vector3();
  private ndc = new THREE.Vector2(0, -0.12);
  private inv = new THREE.Matrix4();
  private tapRay = new THREE.Ray();
  private box = new THREE.Box3();
  private lp = new THREE.Vector2();
  /** Swipe up to throw hearts at her (src/experience/physics/toss.ts). */
  readonly toss: HeartToss;
  /** Mini games (src/experience/play): this stage's game pieces, the running game, the Games button. */
  readonly kit: PlayKit;
  game: PlayGame | null = null;
  /** Set by the experience: open the game chooser (the Games button, above Move). */
  onPickGame: (() => void) | null = null;
  onPickMove: (() => void) | null = null;
  private movesBtn: HTMLButtonElement | null = null;
  private gamesBtn: HTMLButtonElement | null = null;
  private pv = new THREE.Vector3();

  constructor(private sh: Shared, readonly stage: Stage, private runner: MomentRunner) {
    stage.actor.soft = sh.reduced;
    this.toss = new HeartToss({ stage, runner, layer: sh.hud.layer, reduced: sh.reduced, constrain: (p) => this.constrain(p, false) });
    this.root.name = 'ar-root';
    this.root.visible = false;
    this.anchor.name = 'ar-anchor';
    this.anchor.add(stage.root);
    this.applyScale();
    this.anchor.visible = false;
    this.root.add(this.anchor, this.reticle);
    this.buildReticle();
    this.kit = new PlayKit(stage);

    const hud = sh.hud;
    this.placeBtn = hud.pill('Place Happi', () => this.place());
    this.moveBtn = hud.toolButton({ label: 'Move', icon: ICON.move, aria: 'Move Happi somewhere else', onClick: () => this.move() });
    this.placeBtn.dataset.cmd = 'place'; this.moveBtn.dataset.cmd = 'move'; // voice commands press these (../../commands.ts)
    this.leaveBtn = hud.toolButton({ label: 'Leave', icon: ICON.leave, aria: 'Leave the house', onClick: () => this.leaveHouse() });
    this.walk = new HouseWalk(sh, stage, runner, {
      hint: (t, sec) => this.flashHint(t, sec),
      syncHud: () => this.syncHud(),
      tapAction: (n) => sh.tapAction(n),
      calm: () => sh.ctx.engine.calm?.() ?? sh.ctx.engine.settled(),
      note: (w) => sh.ctx.engine.note?.(w),
    });
  }

  /** Her size (the pinch) and her house's (life size times houseMul). */
  private applyScale(): void {
    this.stage.root.scale.setScalar(this.scale);
    this.stage.houseSet.sizeMul = houseMul(this.scale);
  }
  /** Tests: the pinch scale and what it was reset to. */
  get pinchScale(): number {
    return this.scale;
  }
  static readonly DEFAULT_SCALE = SCALE.def;
  /** Times Move was pressed (tests). */
  moves = 0;

  get placed(): boolean {
    return this.state === 'placed';
  }
  /** Placed earlier, waiting for tracking to settle to put the stage back (after returning to AR). */
  get waitingToRestore(): boolean {
    return this.restoring;
  }
  get stageVisible(): boolean {
    return this.anchor.visible;
  }

  private buildReticle(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.18, 48), mat);
    const pink = new THREE.MeshBasicMaterial({ color: PAL.pink, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), pink);
    for (const m of [ring, dot]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.003; m.renderOrder = 3; }
    this.reticle.add(ring, dot);
    this.reticle.visible = false;
    this.reticle.name = 'reticle';
  }

  // ------------------------------------------------------------------ Mode
  onScene(_xr: XrScene): void {
    // a new run has a new world origin: enter() puts the stage back relative to the phone once tracking settles
  }

  enter(_from: ExperienceMode | null): void {
    const bear = this.sh.bear();
    if (bear && !this.stage.actor.attached) this.stage.actor.attach(bear);
    this.active = true;
    this.live = true;
    this.root.visible = true;
    const canvas = this.sh.ctx.engine.canvas;
    this.unbind = bindGestures(canvas, {
      onPinch: (k) => {
        if (this.state !== 'placing') return;
        this.scale = THREE.MathUtils.clamp(this.scale * k, SCALE.min, SCALE.max);
        this.applyScale();
      },
      onFlick: (power, side) => { this.throwHeart(power, side); },
      onLongPress: (x, y) => {
        if (!this.active || this.state !== 'placed' || this.restoring) return;
        this.lp.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1);
        if (this.hitsBear(this.lp) && !this.game) hugBear(this.stage, this.runner, this.sh.reduced);
      },
    });
    this.toss.show(true);
    this.limitedT = 0;
    this.sh.ctx.engine.diagLine = () => {
      const hs = this.stage.houseSet;
      return `ar ${this.state}${this.restoring ? ' restoring' : ''} size ${this.scale.toFixed(2)} house ${(hs.k * this.scale).toFixed(2)}x${hs.inside ? ' INSIDE' : ''}${hs.away ? ' away' : ''} moves ${this.moves}`;
    };
    if (this.resumePlaced) {
      this.restoring = true;
      this.state = 'placed';
    } else this.state = 'placing';
    this.anchor.visible = false;
    this.syncHud();
  }

  exit(_to: ExperienceMode): void {
    (this.sh.ctx.bear as { setIdleStyle?: (s: 'front' | 'roam') => void } | null)?.setIdleStyle?.('front');
    this.active = false;
    this.live = false;
    this.runner.cancel();
    this.toss.show(false);
    this.toss.reset();
    this.stage.play.clear();
    this.collapseNow();
    this.remember();
    this.resumePlaced = this.state === 'placed' && !!this.saved;
    this.unbind?.();
    this.unbind = null;
    this.root.visible = false;
    this.sh.ctx.engine.diagLine = null;
    this.placeBtn.remove();
    this.moveBtn.remove();
    this.leaveBtn.remove();
    this.walk.syncHud(false);
    this.gamesBtn?.remove();
    this.movesBtn?.remove();
    this.sh.hud.joystick(false);
    this.sh.hud.hint('');
    this.stick = null;
  }

  trigger(name: string): boolean {
    // while a mini game runs, her moments wait (they would walk her off the field)
    if (this.game && this.game.state !== 'won' && this.game.state !== 'over') return false;
    return this.runner.trigger(name);
  }

  // ------------------------------------------------------------------ mini games (src/experience/play)
  /** What a game needs from this mode (a game may start before she is placed: it waits for Place). */
  playHost(): PlayHost | null {
    if (!this.active || !this.stage.actor.bear) return null;
    const self = this;
    return {
      variant: 'ar', stage: this.stage, runner: this.runner, kit: this.kit, reduced: this.sh.reduced,
      layer: this.sh.hud.layer, root: this.sh.container,
      hint: (t) => this.sh.hud.hint(t),
      project: (p, out) => this.project(p, out),
      constrain: (p) => this.constrain(p, false),
      // the placed stage's floor around her spot (about 1.5 m across each way at the default size), away from the house
      field: (o) => { o.x = 0; o.z = 0.35; o.r = Math.min(AREA - 0.45, 2.6); },
      get unitsPerM() { return 1 / Math.max(0.05, self.scale); },
      get ready() { return self.state === 'placed' && !self.restoring && self.houseT >= 1 && !self.inside; },
      sync: () => this.syncHud(),
    };
  }

  setGame(g: PlayGame | null): void {
    this.game = g;
    if (g) {
      this.runner.cancel();
      if (this.inside || this.walk.busy || this.walk.bearIn) this.collapseNow(); // out of the house first
      this.toss.reset();
      this.toss.show(false);
      this.hintT = 0;
    } else if (this.active) this.toss.show(true);
    // the house (and its mailbox) pops out of the way while a game runs and comes back when it ends (ar-4)
    this.stage.houseSet.setAway(!!g);
    if (!g) this.walk.evict();
    this.sh.ctx.engine.note?.(g ? `game ${g.id}` : 'game off');
    this.syncHud();
  }

  /** Voice / app commands for a running game (pause, resume, again). Place / Move press the buttons as usual. */
  command(name: string): boolean {
    const g = this.game;
    if (!g) return false;
    if (name === 'pause') return g.pause('user');
    if (name === 'resume') return g.resume('all');
    if (name === 'again') return g.again();
    return false;
  }

  private project(p: THREE.Vector3, out: THREE.Vector2): boolean {
    const xr = this.sh.ctx.engine.xr;
    if (!xr) return false;
    const v = this.stage.root.localToWorld(this.pv.copy(p));
    v.applyMatrix4(xr.camera.matrixWorldInverse);
    if (v.z > -0.02) return false;
    v.applyMatrix4(xr.camera.projectionMatrix);
    const w = this.sh.container.clientWidth, h = this.sh.container.clientHeight;
    out.set((v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h);
    return true;
  }

  onTap(_x: number, _y: number, ndc: THREE.Vector2): boolean {
    if (!this.active) return false;
    if (this.state === 'placing') {
      if (this.canPlace()) this.place();
      return true;
    }
    if (this.restoring) return false;
    // party balloons pop first
    if (this.stage.play.popRay(this.stageRay(ndc))) return true;
    const a = this.stage.actor;
    if (this.hitsBear(ndc)) {
      // a poke: she always jiggles; a reaction plays when she's free
      a.jiggle(0.14);
      if (this.game) return true; // a game is on: just the jiggle
      const name = a.asleep ? 'WakeUp' : TAP_REACTIONS[Math.floor(Math.random() * TAP_REACTIONS.length)];
      if ((!this.runner.busy || a.asleep) && this.runner.trigger(name)) this.sh.tapAction(name);
      return true;
    }
    if (!this.game && this.walk.tap(this.sh.ctx.engine.ray(ndc).ray)) return true;
    return false;
  }

  /** A ray through NDC in stage-local space. */
  private stageRay(ndc: THREE.Vector2): THREE.Ray {
    const r = this.tapRay.copy(this.sh.ctx.engine.ray(ndc).ray);
    this.stage.root.updateMatrixWorld();
    return r.applyMatrix4(this.inv.copy(this.stage.root.matrixWorld).invert());
  }

  private hitsBear(ndc: THREE.Vector2): boolean {
    const p = this.stage.actor.position;
    this.box.min.set(p.x - 0.32, 0, p.z - 0.32);
    this.box.max.set(p.x + 0.32, 1.02, p.z + 0.32);
    return this.stageRay(ndc).intersectsBox(this.box);
  }

  /** Throw a heart at her (swipe up, tests). Only once she's placed. */
  throwHeart(power: number, side = 0): boolean {
    if (!this.active || this.state !== 'placed' || this.restoring || this.houseT < 1) return false;
    if (this.game) return this.game.flicks ? this.game.flick(power, side) : false;
    const ok = this.toss.throw(power, side);
    if (ok && this.lastHint === TOSS_HINT) { this.hintT = 0; tossHinted = true; }
    return ok;
  }

  reset(): void {
    this.toss.reset();
    this.runner.reset();
    this.walk.reset();
    const a = this.stage.actor;
    a.position.set(0, 0, 0);
    a.setHeading(0);
    this.scale = SCALE.def;
    this.applyScale();
    this.everPlaced = false;
    this.resumePlaced = false;
    this.saved = null;
    this.restoring = false;
    this.state = 'placing';
    this.anchor.visible = false;
    if (this.live) this.syncHud();
  }

  // ------------------------------------------------------------------ placing
  private canPlace(): boolean {
    return this.state === 'placing' && this.sh.ctx.engine.settled() && this.reticle.visible && this.steadyT >= STEADY;
  }

  private place(): void {
    if (!this.canPlace()) return;
    this.sh.ctx.engine.note?.(`place ${this.scale.toFixed(2)}`);
    this.state = 'placed';
    this.reticle.visible = false;
    const first = !this.everPlaced;
    this.everPlaced = true;
    this.stage.fx.emit({ count: 30, glyph: ['sparkle', 'star'], colors: [PAL.pink, PAL.yellow, PAL.white, PAL.blue], at: this.stage.actor.position.clone().setY(0.1), ring: 0.5, vel: [0, 0.6, 0], velSpread: [0.2, 0.2, 0.2], life: [0.8, 1.3], size: [0.06, 0.12] });
    if (this.game) {
      // a game was waiting (Move, or started before Place): carry on with a fresh 3-2-1
      this.syncHud();
      this.game.placed();
      return;
    }
    if (first) this.runner.trigger('Wave');
    this.syncHud();
    this.walk.placed();
    this.flashHint('Walk Happi to the door', 5);
  }

  /**
   * Move = a full re-placement (ar-4). Out of the house first (inside, mid-glide or her waiting in there), the door
   * shut, the size back to the default (not the last pinch), the preview snapping to the new reticle, and SLAM
   * restarted where you stand (recenter) so a scale that drifted while you walked is gone; Place then waits for
   * freshly settled tracking. Her moments' state, a paused game and the photo wall are kept.
   */
  private move(): void {
    if (this.state !== 'placed' || this.restoring) return;
    this.moves++;
    this.runner.cancel();
    this.collapseNow();
    this.walk.reset();
    // Happi comes home to the stage's centre, facing you: the preview sits right on the reticle (Dapo, 2026-11-20:
    // after a reset Happi must always be in view, never left wherever the joystick took them)
    if (!this.game) {
      this.stage.actor.position.set(0, 0, 0);
      this.stage.actor.setHeading(0);
      this.stage.actor.settle();
    }
    this.steadyT = 0;
    this.lostT = 0;
    this.game?.pause('move'); // the round waits; Place carries on (the game keeps its state)
    this.scale = SCALE.def;
    this.applyScale();
    this.anchor.visible = false;
    this.reticle.visible = false;
    this.sh.ctx.engine.recenter?.();
    this.sh.ctx.engine.note?.('move');
    this.state = 'placing';
    this.syncHud();
  }

  /** Remember the stage relative to the phone (called when leaving AR). */
  private remember(): void {
    const xr = this.sh.ctx.engine.xr;
    if (!xr || this.state !== 'placed' || this.restoring) return;
    this.camBasis(xr.camera);
    this.v.copy(this.anchor.position).sub(this.camPos).setY(0);
    const right = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
    this.saved = { fwd: this.v.dot(this.camFwd), side: this.v.dot(right), yaw: angleTo(Math.atan2(this.camFwd.x, this.camFwd.z), this.anchor.rotation.y) };
  }

  private restore(cam: THREE.Camera): void {
    this.camBasis(cam);
    const s = this.saved ?? { fwd: 1.8, side: 0, yaw: Math.PI };
    const right = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
    this.anchor.position.copy(this.camPos).addScaledVector(this.camFwd, s.fwd).addScaledVector(right, s.side).setY(0);
    this.anchor.rotation.set(0, Math.atan2(this.camFwd.x, this.camFwd.z) + s.yaw, 0);
    this.restoring = false;
    this.anchor.visible = true;
    this.stage.fx.emit({ count: 24, glyph: ['sparkle', 'star'], colors: [PAL.pink, PAL.yellow, PAL.white], at: this.stage.actor.position.clone().setY(0.4), burst: 0.8, drag: 1.5, life: [0.8, 1.2], size: [0.06, 0.11] });
    this.syncHud();
  }

  private camBasis(cam: THREE.Camera): void {
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camFwd).setY(0);
    if (this.camFwd.lengthSq() < 1e-6) this.camFwd.set(0, 0, -1);
    this.camFwd.normalize();
  }

  // ------------------------------------------------------------------ house
  /** Bring the room to you (tap on the house, "Step inside", tests): you end up inside, facing the TV. */
  enterHouse(): void {
    if (this.inside || this.state !== 'placed' || this.restoring || !this.sh.ctx.engine.xr) return;
    this.walk.stepInside();
  }

  leaveHouse(): void {
    this.walk.leave();
  }

  /** Instantly back outside, the house home (Move, leaving AR, Start again, a game starting). */
  private collapseNow(): void {
    this.walk.collapse();
    if (this.live) this.syncHud();
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number): void {
    const xr = this.sh.ctx.engine.xr;
    if (!this.active || !xr) return;
    const eng = this.sh.ctx.engine, st = this.stage, a = st.actor;
    const settled = eng.settled();
    this.walk.applyTestPose(xr.camera); // ?test only: walk the camera through the door in the simulator

    if (this.restoring && settled) this.restore(xr.camera);

    if (this.state === 'placing') {
      const hasHit = settled && this.floorHit();
      this.reticle.visible = hasHit;
      this.steadyT = hasHit ? this.steadyT + dt : 0;
      if (hasHit) {
        const first = !this.anchor.visible;
        this.reticle.position.copy(this.hit);
        this.reticle.scale.setScalar(1 + Math.sin(performance.now() / 260) * 0.05);
        // the stage previews on the reticle, facing you
        this.camBasis(xr.camera);
        const yaw = Math.atan2(this.camPos.x - this.hit.x, this.camPos.z - this.hit.z);
        if (first) {
          this.anchor.position.copy(this.hit);
          this.anchor.rotation.y = yaw;
        } else {
          this.anchor.position.lerp(this.hit, damp(12, dt));
          this.anchor.rotation.y += angleTo(this.anchor.rotation.y, yaw) * damp(8, dt);
        }
        this.anchor.visible = true;
      }
      const ready = hasHit && this.steadyT >= STEADY;
      this.placeBtn.disabled = !ready;
      this.placeBtn.textContent = ready ? 'Place Happi' : 'Getting ready…';
    }

    // walking
    if (this.state === 'placed' && !this.restoring && this.stick) {
      const sv = this.stick.vector;
      this.camBasis(xr.camera);
      const right = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
      this.v.copy(right).multiplyScalar(sv.x).addScaledVector(this.camFwd, -sv.y);
      this.v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.anchor.rotation.y); // world -> stage-local
      if (this.v.lengthSq() > 0.01 && a.asleep) this.runner.nudge();
      if (this.game && !this.game.stickWalk) this.game.walk(dt);
      else if (this.houseT >= 1) a.drive(this.v, dt, (p) => this.constrain(p, !this.game));
    } else if (this.game && this.state === 'placed' && !this.restoring) this.game.walk(dt);
    else a.drive(this.v.set(0, 0, 0), dt);

    this.runner.update(dt);
    this.walk.update(dt);
    if (this.game) this.game.update(dt);
    else if (this.state === 'placed' && !this.restoring) this.toss.update(dt);
    this.kit.tick(dt);
    st.root.updateMatrixWorld();
    st.update(dt, xr.camera);
    a.update(dt, xr.camera.getWorldPosition(this.w));
    this.trackLost(dt, xr.camera);
    // facing you outside; looking around the room in the house
    (this.sh.ctx.bear as { setIdleStyle?: (s: 'front' | 'roam') => void } | null)?.setIdleStyle?.(this.inside ? 'roam' : 'front');
    this.hints(dt, eng.tracking, settled);
  }

  /** Count how long Happi has been off screen while placed (outside the house, no game). */
  private trackLost(dt: number, cam: THREE.Camera): void {
    if (this.state !== 'placed' || this.restoring || this.inside || this.game) { this.lostT = 0; return; }
    const p = this.stage.actor.holder.getWorldPosition(this.pv); p.y += 0.25 * this.scale;
    const v = this.pv2.copy(p).applyMatrix4(cam.matrixWorldInverse);
    let on = v.z < -0.05;
    if (on) { p.project(cam); on = Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05; }
    this.lostT = on ? 0 : this.lostT + dt;
  }
  private pv2 = new THREE.Vector3();

  /** Keep her in the play area and out of the house walls; the open doorway lets her in (./house-walk.ts). */
  private constrain(p: THREE.Vector3, door = true): void {
    if (!this.inside && !this.walk.bearIn) {
      const l = Math.hypot(p.x, p.z);
      if (l > AREA) { p.x *= AREA / l; p.z *= AREA / l; }
    }
    this.walk.constrain(p, door && this.state === 'placed');
  }

  private floorHit(): boolean {
    const r = this.sh.ctx.engine.ray(this.ndc);
    const xr = this.sh.ctx.engine.xr!;
    this.camBasis(xr.camera);
    const got = r.ray.intersectPlane(this.plane, this.hit);
    // looking up (no hit) or too far: keep it at a comfortable distance straight ahead
    let d: number;
    if (got) {
      this.v.copy(this.hit).sub(this.camPos).setY(0);
      d = this.v.length();
    } else d = REACH.max;
    this.aimLow = d > REACH.max;
    d = THREE.MathUtils.clamp(d, REACH.min, REACH.max);
    this.hit.copy(this.camPos).addScaledVector(this.camFwd, d).setY(0);
    if (got) {
      // keep the sideways offset of the real hit
      const side = this.w.set(-this.camFwd.z, 0, this.camFwd.x);
      const off = this.v.dot(side);
      this.hit.addScaledVector(side, THREE.MathUtils.clamp(off, -1, 1));
    }
    return true;
  }

  // ------------------------------------------------------------------ HUD
  private syncHud(): void {
    if (!this.live) return;
    const hud = this.sh.hud;
    const placing = this.state === 'placing';
    const walking = !placing && !this.restoring;
    if (placing) {
      this.placeBtn.disabled = !this.reticle.visible; // update() enables it once the reticle is on the floor
      hud.centre.appendChild(this.placeBtn);
    } else this.placeBtn.remove();
    const stick = walking && (!this.game || this.game.showStick);
    this.stick = stick ? hud.joystick(true) : null;
    if (!stick) hud.joystick(false);
    // Move: bottom left, always there once placed; Leave stacks above it while you're inside
    // (the left slot stacks bottom-up: first child sits at the bottom)
    if (walking) hud.left.appendChild(this.moveBtn);
    else this.moveBtn.remove();
    if (walking && this.inside) hud.left.appendChild(this.leaveBtn);
    else this.leaveBtn.remove();
    this.walk.syncHud(walking && !this.game);
    // Games and Actions stack together bottom right once Happi is placed (Games at the bottom), while no game runs
    if (walking && !this.inside && !this.game && this.onPickGame) {
      this.gamesBtn ??= hud.toolButton({ label: 'Games', icon: GAMES_ICON, aria: 'Play a game with Happi', tone: 'orange', onClick: () => this.onPickGame?.() });
      this.gamesBtn.dataset.cmd = 'games';
      hud.right.prepend(this.gamesBtn);
    } else this.gamesBtn?.remove();
    if (walking && !this.game && this.onPickMove) {
      this.movesBtn ??= hud.toolButton({ label: 'Actions', icon: MOVES_ICON, aria: 'Pick something for Happi to do', tone: 'navy', onClick: () => this.onPickMove?.() });
      hud.right.appendChild(this.movesBtn);
    } else this.movesBtn?.remove();
  }

  private flashHint(text: string, s: number): void {
    this.lastHint = text;
    this.hintT = s;
    this.sh.hud.hint(text);
  }

  private hints(dt: number, tracking: string, settled: boolean): void {
    let text = '';
    // a game owns the hint pill while she is placed (it shows its own short hints)
    if (this.game && this.state === 'placed' && !this.restoring && tracking !== 'LIMITED') { this.limitedT = 0; return; }
    this.limitedT = tracking === 'LIMITED' ? this.limitedT + dt : 0;
    if (this.limitedT > 1.5) text = 'Move your phone slowly';
    else if (this.restoring || (this.state === 'placing' && !settled)) text = 'Point at the floor';
    else if (this.state === 'placing' && this.aimLow) text = 'Tilt your phone down to the floor';
    else if (this.state === 'placing') text = 'Pinch to size, then Place';
    else if (this.lostT > 4 && !this.inside && !this.game) text = "Can't see Happi? Tap Move to bring Happi back";
    else if (this.hintT > 0) {
      this.hintT -= dt;
      text = this.hintT > 0 ? this.lastHint : '';
      // after the first hint: once, how to throw hearts
      if (this.hintT <= 0 && !tossHinted && this.lastHint !== TOSS_HINT && this.toss.thrown === 0) {
        tossHinted = true;
        this.lastHint = TOSS_HINT;
        this.hintT = 5;
        text = TOSS_HINT;
      }
    }
    this.sh.hud.hint(text);
  }

  dispose(): void {
    this.unbind?.();
    this.toss.show(false);
    this.placeBtn.remove();
    this.moveBtn.remove();
    this.leaveBtn.remove();
    this.gamesBtn?.remove();
    this.movesBtn?.remove();
    this.walk.dispose();
  }
}

/** The Games button's icon: a heart with speed lines (flat, currentColor). */
const GAMES_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="translate(14.5 12) scale(1.15) translate(-12 -12.6)"><g fill="currentColor"><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(0 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(72 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(144 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(216 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(288 12 12)"/></g></g><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 8.5h3M1 12h2.5M1.5 15.5h3"/></g></svg>';
