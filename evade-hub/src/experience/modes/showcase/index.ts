// Showcase: Bobo in his hideout, no camera. Its own WebGL canvas and renderer (works on computers); the engine is
// stopped while it runs, and this renderer is disposed (context released) whenever a camera mode runs.
//
// The world is Bobo's Hideout (scene/house + src/evade/world/hideout.ts): the Collector Hub's two-storey can room at
// the back of a round hall, Bobo's Arcade lining the hall (one machine per EVADE experience). Bobo lives on the can's
// ground floor.
//
// Also renders the splash: Bobo stands inside the splash's transparent "hero window" (setViewOffset framing), then
// the camera eases out to the play framing when Start slides the splash away.
//
// Controls: joystick (or arrow keys / WASD) walks him, the camera follows; drag to look around; pinch or scroll to
// zoom within limits; tap him for a reaction; tap a machine (Bobo walks over, the camera glides to it, its card
// opens) or walk Bobo up to one and tap Play.
import { haptic } from '../../../evade/world/haptics';
import { recorder } from '../../capture/recorder';
import * as THREE from 'three';
import { ARCADE_ICON, MOVES_ICON } from '../../../evade/world/moves';
import type { Cabinet } from '../../../evade/world/arcade';
import { HALL } from '../../../evade/world/hideout';
import { SHOW_K } from '../../scene/house';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ExperienceMode } from '../../../shared/contracts';
import type { Mode } from '../../types';
import type { Stage } from '../../scene/stage';
import type { MomentRunner } from '../../scene/moments';
import { damp, ease } from '../../core/timeline';
import { IS_PHONE } from '../../core/device';
import { bindGestures, keyStick, type Shared } from '../shared';
import { HeartToss, hugBear } from '../../physics/toss';
import { PlayKit, type PlayGame, type PlayHost } from '../../play';

/** The "throw hearts" hint shows once per visit (after the look-around hint). */
let tossHinted = false;

const FOV_WIDE = 58; // portrait screens: a taller (and so wider) view shows more of the hideout
const FOV_LAND = 38;
const PLAY = { dist: 3.1, pitch: 0.2, targetY: 0.6, yaw: 0.55 }; // looking a little above Bobo: he stands in the lower half, clear of the top bar
// Wider, freer look-around (Dapo, 2026-11-22): most of the way round, higher and further; the camera slides in when
// the can's wall would block it, and drags glide on with a little inertia.
const LIM = { yaw: 1.7, pitchMin: 0.02, pitchMax: 0.95, distMin: 1.2, distMax: 5.4 };
/** The camera stays inside the hall (stage units from Bobo's home): hall radius x SHOW_K, minus a margin. */
const CAM_R = 5.4;
/** The hall's centre in stage units relative to Bobo's home (scene/house restPos). */
const HALL_CZ = (HALL.cz - HALL.home.z) * SHOW_K;
/** The can room's centre and the radius the camera keeps outside its wall (stage units, relative to Bobo's home). */
const CAN_CZ = (HALL.canZ - HALL.home.z) * SHOW_K;
const CAN_KEEP = (HALL.canR + 0.3) * SHOW_K;
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class ShowcaseMode implements Mode {
  readonly id = 'showcase' as const;
  readonly camera = 'none' as const;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(FOV_LAND, 1, 0.05, 200);
  renderer: THREE.WebGLRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private env: THREE.WebGLRenderTarget | null = null;
  private ro: ResizeObserver | null = null;
  private unbind: (() => void) | null = null;
  private keys = keyStick();
  private active = false;
  private ready: Promise<void> | null = null;
  private last = 0;
  // camera rig
  private yaw = PLAY.yaw; // a little to Bobo's side: the can behind him, a row of machines beside it
  private pitch = PLAY.pitch;
  private dist = PLAY.dist;
  private target = new THREE.Vector3(0, PLAY.targetY, 0);
  /** 1 = splash framing (bear inside the hero window), 0 = play framing. */
  private framing = 1;
  private framingTo = 1;
  private hero: { x: number; y: number; w: number; h: number } | null = null;
  private dir = new THREE.Vector3();
  private v = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private slow = 0; // adaptive resolution
  private frames = 0;
  private dpr = 1;
  private hintT = 0;
  /** Smoothed frames per second (tests, diagnostics). */
  fps = 60;
  private wide = 0; // extra camera distance while a big moment plays
  private stick: { readonly vector: THREE.Vector2; readonly active: boolean } | null = null;
  /** Programs compiled after warm-up (pitfall 13 check: must not grow when moments appear). */
  programsAfterWarm = 0;
  /** Swipe up to throw hearts at his (src/experience/physics/toss.ts). */
  readonly toss: HeartToss;
  private hintNext = '';
  /** Mini games (src/experience/play): this stage's game pieces, the running game, the HUD's Games button. */
  readonly kit: PlayKit;
  game: PlayGame | null = null;
  /** Set by the experience: open the game chooser (the Games button, bottom left). */
  onPickGame: (() => void) | null = null;
  /** Set by the experience: a machine was picked in the world (emits the `arcade` event). */
  onArcade: ((id: string, source: 'cabinet' | 'walk') => void) | null = null;
  /** Set by the experience: open Bobo's actions (the Actions button, bottom right). */
  onPickMove: (() => void) | null = null;
  private movesBtn: HTMLButtonElement | null = null;
  private gamesBtn: HTMLButtonElement | null = null;
  private spaceAt = 0;
  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || !this.active || e.repeat) return;
    if ((e.target as HTMLElement)?.closest?.('input,textarea,select,button,[contenteditable]')) return;
    e.preventDefault();
    // a game that throws: hold Space to wind up, let go to throw (keyup)
    if (this.game?.flicks) { this.spaceAt = performance.now(); return; }
    this.throwHeart(0.42 + Math.random() * 0.16, (Math.random() - 0.5) * 0.2);
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || !this.active || !this.spaceAt) return;
    const held = (performance.now() - this.spaceAt) / 1000;
    this.spaceAt = 0;
    if (this.game?.flicks) this.game.flick(Math.min(1.1, held / 1.1), 0);
  };

  constructor(private sh: Shared, readonly stage: Stage, private runner: MomentRunner) {
    stage.actor.soft = sh.reduced;
    this.toss = new HeartToss({ stage, runner, layer: sh.hud.layer, reduced: sh.reduced, constrain: (p) => this.constrain(p) });
    // the hall is the whole world: a flat deep-navy backdrop shows only past its far wall
    this.scene.background = new THREE.Color(0x0a1c2a);
    this.scene.add(stage.root);
    this.kit = new PlayKit(stage);
    this.playBtn = sh.hud.pill('Play', () => this.playNear());
    this.playBtn.dataset.cmd = 'arcade-play';
  }

  /** Keep a stage point on the hideout's floor (in front of the machines, off the can's walls). */
  private cv = new THREE.Vector3();
  private constrain(p: THREE.Vector3): void {
    const hs = this.stage.houseSet;
    const l = hs.clampToRoom(hs.fromStage(p, this.cv));
    hs.toStage(l, p);
    p.y = 0;
  }

  // ------------------------------------------------------------------ renderer life cycle
  /** Create the canvas + renderer (if needed), compile everything, start drawing. Resolves when the first frame is ready. */
  ensureRenderer(): Promise<void> {
    if (this.ready) return this.ready;
    const c = document.createElement('canvas');
    c.className = 'cbx-3d';
    c.setAttribute('aria-label', "Bobo in his hideout");
    c.style.visibility = 'hidden';
    this.sh.container.insertBefore(c, this.sh.container.firstChild);
    this.canvas = c;
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    this.dpr = Math.min(window.devicePixelRatio || 1, IS_PHONE ? 2 : 1.75);
    r.setPixelRatio(this.dpr);
    this.renderer = r;
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.sh.container);
    // same light environment as the camera modes (the bear looks the same everywhere)
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04);
    pm.dispose();
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.7;
    this.unbind = bindGestures(c, {
      onTap: (x, y) => this.tap(x, y),
      onFlick: (power, side) => this.throwHeart(power, side),
      onLongPress: (x, y) => this.hug(x, y),
      onDrag: (dx, dy) => {
        // Paw Hoops holds the camera on the court: a slow drag up is a throw there, not a look (polish-4)
        if (!this.active || this.game?.flicks) return;
        this.unfocus();
        const dyaw = -dx * 0.0062, dpitch = dy * 0.0042;
        this.yaw = THREE.MathUtils.clamp(this.yaw + dyaw, -LIM.yaw, LIM.yaw);
        this.pitch = THREE.MathUtils.clamp(this.pitch + dpitch, LIM.pitchMin, LIM.pitchMax);
        // remember the swipe's speed for the glide after the finger lifts
        const now = performance.now(), gap = Math.max(8, now - this.dragAt);
        this.dragAt = now;
        this.yawV = this.yawV * 0.4 + (dyaw / gap) * 1000 * 0.6;
        this.pitchV = this.pitchV * 0.4 + (dpitch / gap) * 1000 * 0.6;
      },
      onPinch: (k) => { if (this.active) this.dist = THREE.MathUtils.clamp(this.dist / k, LIM.distMin, LIM.distMax); },
      onWheel: (d) => { if (this.active) this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(d * 0.0012), LIM.distMin, LIM.distMax); },
    });
    this.placeCamera(0);
    // compile every shader in the scene (hidden moment props too) before the first visible frame
    this.ready = r.compileAsync(this.scene, this.cam).catch(() => undefined).then(() => {
      if (this.renderer !== r) return;
      for (const t of collectTextures(this.scene)) r.initTexture(t);
      r.render(this.scene, this.cam);
      this.programsAfterWarm = r.info.programs?.length ?? 0;
      c.style.visibility = '';
      this.last = performance.now();
      r.setAnimationLoop(this.loop);
    });
    return this.ready;
  }

  /** Free the GPU (a camera mode is about to run; phones cannot hold two big contexts). */
  releaseRenderer(): void {
    const r = this.renderer;
    if (!r) return;
    r.setAnimationLoop(null);
    this.sh.bear()?.releaseRenderer?.(r);
    this.unbind?.();
    this.unbind = null;
    this.ro?.disconnect();
    this.ro = null;
    this.env?.dispose();
    this.env = null;
    this.scene.environment = null;
    r.dispose();
    r.forceContextLoss();
    this.canvas?.remove();
    this.canvas = null;
    this.renderer = null;
    this.ready = null;
  }

  private resize(): void {
    const r = this.renderer;
    if (!r) return;
    const w = Math.max(1, this.sh.container.clientWidth), h = Math.max(1, this.sh.container.clientHeight);
    r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.fov = w < h ? FOV_WIDE : FOV_LAND;
    this.cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ splash framing
  /** Frame the bear inside this CSS rect (the splash hero window); null = play framing. */
  setHero(rect: DOMRect | null): void {
    if (rect && rect.width > 10 && rect.height > 10) {
      const cr = this.sh.container.getBoundingClientRect();
      this.hero = { x: rect.left - cr.left, y: rect.top - cr.top, w: rect.width, h: rect.height };
      this.framingTo = 1;
      this.framing = 1;
    } else {
      this.framingTo = 0;
      if (this.sh.reduced) this.framing = 0;
    }
  }

  // ------------------------------------------------------------------ Mode
  async enter(_from: ExperienceMode | null): Promise<void> {
    await this.ensureRenderer();
    const bear = this.sh.bear();
    if (bear && !this.stage.actor.attached) this.stage.actor.attach(bear);
    this.active = true;
    this.setHero(null);
    this.stick = this.sh.hud.joystick(true);
    this.hintT = 5;
    this.sh.hud.hint(IS_PHONE ? 'Drag to see the arcade' : 'Drag to look, arrows walk');
    this.hintNext = tossHinted ? '' : IS_PHONE ? 'Tap a machine to play' : 'Click a machine to play';
    this.toss.show(true);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
    this.syncPlay();
  }

  exit(_to: ExperienceMode): void {
    this.active = false;
    this.runner.cancel();
    this.toss.show(false);
    this.toss.reset();
    this.stage.play.clear();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.gamesBtn?.remove();
    this.movesBtn?.remove();
    this.playBtn.remove();
    this.near = null;
    this.walkTo = null;
    this.focus = null;
    this.sh.hud.joystick(false);
    this.sh.hud.hint('');
    this.stick = null;
  }

  /** Splash preview: draw the bear (idle) before Start. */
  preview(): void {
    const bear = this.sh.bear();
    if (bear && !this.stage.actor.attached) this.stage.actor.attach(bear);
  }

  trigger(name: string): boolean {
    // while a mini game runs, his moments wait (they would walk his off the field)
    if (this.game && this.game.state !== 'won' && this.game.state !== 'over') return false;
    return this.runner.trigger(name);
  }

  // ------------------------------------------------------------------ mini games (src/experience/play)
  /** What a game needs from this mode. */
  playHost(): PlayHost | null {
    if (!this.active || !this.stage.actor.bear) return null;
    const self = this;
    return {
      variant: 'showcase', stage: this.stage, runner: this.runner, kit: this.kit, reduced: this.sh.reduced,
      layer: this.sh.hud.layer, root: this.sh.container,
      hint: (t) => this.sh.hud.hint(t),
      project: (p, out) => this.project(p, out),
      constrain: (p) => this.constrain(p),
      // the open floor in front of the can (the machines and the can walls stay out of it)
      field: (o) => { o.x = 0; o.z = 1.2; o.r = 2.1; },
      unitsPerM: 1 / 0.9,
      get ready() { return self.active; },
      sync: () => this.syncPlay(),
      // where the camera settles for a game that holds it on the court (Paw Hoops)
      court: (pos, dir) => {
        const wide = this.game?.view?.wide ?? 0;
        const pitch = Math.max(this.pitch, this.game?.view?.pitch ?? 0), dist = this.dist + wide;
        const tgt = this.tmp2.set(0, PLAY.targetY + wide * 0.18, 0);
        pos.set(tgt.x + Math.sin(this.yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(this.yaw) * Math.cos(pitch) * dist);
        dir.subVectors(tgt, pos).normalize();
      },
    };
  }

  setGame(g: PlayGame | null): void {
    this.game = g;
    this.spaceAt = 0;
    if (g) {
      this.runner.cancel();
      this.toss.reset();
      this.toss.show(false);
      this.hintNext = '';
      this.hintT = 0;
    } else if (this.active) this.toss.show(true);
    this.stage.houseSet.setAway(!!g); // ar-4: the house stays out of the game's way (it only shows in its moment here)
    this.syncPlay();
  }

  /** Voice / app commands for a running game (pause, resume, again). */
  command(name: string): boolean {
    const g = this.game;
    if (!g) return false;
    if (name === 'pause') return g.pause('user');
    if (name === 'resume') return g.resume('all');
    if (name === 'again') return g.again();
    return false;
  }

  /** Joystick and the Games button follow the game. */
  private syncPlay(): void {
    if (!this.active) return;
    const g = this.game;
    const stick = !g || g.showStick;
    this.stick = this.sh.hud.joystick(stick);
    if (!stick) this.stick = null;
    if (!g && this.onPickGame) {
      this.gamesBtn ??= this.sh.hud.toolButton({ label: 'Arcade', icon: ARCADE_ICON, aria: "Open Bobo's Arcade", tone: 'orange', onClick: () => this.onPickGame?.() });
      this.gamesBtn.dataset.cmd = 'arcade';
      if (this.gamesBtn.parentElement !== this.sh.hud.right) this.sh.hud.right.prepend(this.gamesBtn);
    } else this.gamesBtn?.remove();
    if (!g && this.onPickMove) {
      this.movesBtn ??= this.sh.hud.toolButton({ label: 'Actions', icon: MOVES_ICON, aria: 'Pick something for Bobo to do', tone: 'navy', onClick: () => this.onPickMove?.() });
      if (this.movesBtn.parentElement !== this.sh.hud.right) this.sh.hud.right.appendChild(this.movesBtn);
      // Arcade and Actions stack together at the bottom right (Dapo, 2026-11-20): Arcade at the bottom, Actions above
    } else this.movesBtn?.remove();
  }

  private pv = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private project(p: THREE.Vector3, out: THREE.Vector2): boolean {
    const v = this.pv.copy(p).applyMatrix4(this.cam.matrixWorldInverse);
    if (v.z > -0.05) return false;
    v.applyMatrix4(this.cam.projectionMatrix);
    const w = this.sh.container.clientWidth, h = this.sh.container.clientHeight;
    out.set((v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h);
    return true;
  }

  /** Throw a heart at his (swipe up, Space, tests). */
  throwHeart(power: number, side = 0): boolean {
    if (!this.active || !this.stage.actor.bear) return false;
    if (this.game) return this.game.flicks ? this.game.flick(power, side) : false;
    const ok = this.toss.throw(power, side);
    if (ok && this.hintNext) { tossHinted = true; this.hintNext = ''; this.hintT = 0; this.sh.hud.hint(''); }
    return ok;
  }

  reset(): void {
    this.toss.reset();
    this.runner.reset();
    const a = this.stage.actor;
    a.position.set(0, 0, 0);
    a.setHeading(0);
    this.yaw = PLAY.yaw;
    this.pitch = PLAY.pitch;
    this.dist = PLAY.dist;
    this.target.set(0, PLAY.targetY, 0);
    this.focus = null;
    this.walkTo = null;
  }

  update(): void {
    /* driven by its own animation loop */
  }

  private loop = (): void => {
    const r = this.renderer;
    if (!r) return;
    const t = performance.now();
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.fps += ((dt > 0 ? 1 / dt : 60) - this.fps) * 0.05;
    this.last = t;
    this.adapt(dt);
    const st = this.stage, a = st.actor;
    if (this.active) {
      // walking: joystick (or keys) relative to the camera
      const sv = this.stick?.active ? this.stick.vector : this.keys.vector;
      this.cam.getWorldDirection(this.dir).setY(0);
      if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
      this.dir.normalize();
      const right = this.tmp.set(-this.dir.z, 0, this.dir.x);
      this.v.copy(right).multiplyScalar(sv.x).addScaledVector(this.dir, -sv.y);
      if (this.v.lengthSq() > 0.01 && (a.asleep || this.runner.busy) && !this.game) this.runner.interrupt(); // the joystick always wins over a move
      if (this.game && !this.game.stickWalk) this.game.walk(dt);
      else if (this.walkTo && this.v.lengthSq() < 0.01) this.walkToCabinet(dt);
      else {
        if (this.v.lengthSq() > 0.01) { this.walkTo = null; this.unfocus(); }
        a.drive(this.v, dt, (p) => this.constrain(p));
      }
      this.checkNear();
      if (this.hintT > 0 && !this.game && (this.hintT -= dt) <= 0) {
        // then, once: how to throw hearts
        if (this.hintNext) { this.sh.hud.hint(this.hintNext); this.hintNext = ''; tossHinted = true; this.hintT = 5; }
        else this.sh.hud.hint('');
      }
    }
    this.runner.update(dt);
    if (this.active) { if (this.game) this.game.update(dt); else this.toss.update(dt); }
    this.kit.tick(dt);
    // camera follows his (a game may hold it on the court instead, pull back and look down a little)
    const view = this.game?.view;
    const fo = this.focus && !this.game ? this.focus : null;
    const fx = view?.focus ? 0 : fo ? fo.x : a.position.x, fz = view?.focus ? 0 : fo ? fo.z : a.position.z;
    this.target.x += (fx - this.target.x) * damp(3.5, dt);
    this.target.z += (fz - this.target.z) * damp(3.5, dt);
    this.playPitch += ((view?.pitch ?? -1) - this.playPitch) * damp(2.5, dt);
    this.framing += (this.framingTo - this.framing) * (this.framingTo < this.framing ? damp(3.2, dt) : 1);
    this.focusK += ((this.focus && !this.game ? 1 : 0) - this.focusK) * damp(this.sh.reduced ? 6 : 2.2, dt);
    // pull back a little while a big moment plays (the house, the party set, the rainbow, a lap)
    const wantWide = (WIDE[this.runner.current ?? ''] ?? 0) + (this.game?.view?.wide ?? 0);
    this.wide += (wantWide - this.wide) * damp(wantWide > this.wide ? 2.2 : 1.2, dt);
    if (!this.focus) this.glide(dt);
    this.side += ((this.active ? this.sideShift : 0) - this.side) * damp(this.sh.reduced ? 12 : 5, dt);
    this.placeCamera(dt);
    st.root.updateMatrixWorld();
    st.update(dt, this.cam);
    this.scene.backgroundIntensity = st.bg;
    a.update(dt, this.active ? this.cam.position : null);
    r.render(this.scene, this.cam);
    if (this.active) recorder.frame(r.domElement); // video clips / stills copy the frame while it is valid
  };

  private placeCamera(_dt: number): void {
    const k = ease.inOut(this.framing);
    // play framing
    // a game's camera pitch blends in (playPitch < 0 = none)
    const pp = this.playPitch > 0 ? Math.max(this.pitch, this.playPitch) : this.pitch;
    const fo = this.focus, fk = ease.inOut(this.focusK);
    let yaw = this.yaw * (1 - k), pitch = pp * (1 - k) + 0.1 * k;
    let dist = this.dist + this.wide;
    let ty = PLAY.targetY + this.wide * 0.18;
    if (fo && fk > 0) {
      yaw += angleDiff(yaw, fo.yaw) * fk;
      pitch += (0.16 - pitch) * fk;
      dist += (fo.dist - dist) * fk;
      ty += (fo.y - ty) * fk;
    }
    const W = Math.max(1, this.sh.container.clientWidth), H = Math.max(1, this.sh.container.clientHeight);
    if (this.hero && k > 0.001) {
      // splash framing: bear (1 unit + a margin) fills the hero window's height, centred in it
      const want = 1.38 / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2))) * (H / Math.max(60, this.hero.h));
      const wantW = 1.5 / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * (W / H)) * (W / Math.max(60, this.hero.w));
      dist = dist * (1 - k) + Math.max(want, wantW) * k;
      ty = ty * (1 - k) + 0.5 * k;
      const ox = (W / 2 - (this.hero.x + this.hero.w / 2)) * k, oy = (H / 2 - (this.hero.y + this.hero.h / 2)) * k;
      this.cam.setViewOffset(W, H, ox, oy, W, H);
    } else if (this.side > 0.002) {
      // Actions fan open: shift the picture so Bobo sits left of centre (a view offset, not a camera move)
      this.cam.setViewOffset(W, H, W * 0.27 * ease.inOut(this.side), 0, W, H);
    } else if (this.cam.view) this.cam.clearViewOffset();
    const tgt = this.tmp.set(this.target.x, ty, this.target.z);
    if (fo && fk > 0) { tgt.x += (fo.x - tgt.x) * fk; tgt.z += (fo.z - tgt.z) * fk; } // glide to the machine
    this.cam.position.set(
      tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      tgt.y + Math.sin(pitch) * dist,
      tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    // stay inside the hall (its centre is HALL.cz - home.z metres ahead of Bobo's home)
    const hx = this.cam.position.x, hz = this.cam.position.z - HALL_CZ;
    const hl = Math.hypot(hx, hz);
    if (hl > CAM_R) { this.cam.position.x = (hx / hl) * CAM_R; this.cam.position.z = HALL_CZ + (hz / hl) * CAM_R; }
    // never inside the can's wall (machines behind it are framed from the walkway between them and the can)
    if (fo && fk > 0) {
      const p = this.cam.position;
      for (let i = 0; i < 14 && Math.hypot(p.x, p.z - CAN_CZ) < CAN_KEEP && Math.abs(Math.atan2(p.x, p.z - CAN_CZ)) > HALL.canOpen; i++) p.lerp(tgt, 0.12);
    }
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
  }

  private playPitch = -1;
  /** 1 while the Actions fan is open: the view slides so Bobo stands in the left part of the screen, clear of it. */
  sideShift = 0;
  private side = 0;
  /** look-around inertia (rad/s) and when the last drag event came */
  private yawV = 0;
  private pitchV = 0;
  private dragAt = 0;

  /** After a drag ends, the view keeps turning a moment and eases to a stop. */
  private glide(dt: number): void {
    if (performance.now() - this.dragAt < 70) return; // still dragging
    if (Math.abs(this.yawV) < 0.01 && Math.abs(this.pitchV) < 0.01) { this.yawV = this.pitchV = 0; return; }
    const k = Math.exp(-(this.sh.reduced ? 14 : 5.5) * dt);
    this.yaw = THREE.MathUtils.clamp(this.yaw + this.yawV * dt, -LIM.yaw, LIM.yaw);
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchV * dt, LIM.pitchMin, LIM.pitchMax);
    if (Math.abs(this.yaw) >= LIM.yaw) this.yawV = 0;
    this.yawV *= k;
    this.pitchV *= k;
  }

  /** Lower the pixel ratio once if frames are very slow (phones with big screens). */
  private adapt(dt: number): void {
    // only for really slow phones, and never below 1.5: dropping to 1.25 made the character look soft on Android (2026-11-20)
    if (this.dpr <= 1.5 || !this.renderer) return;
    this.frames++;
    if (this.frames < 90) return;
    this.slow = this.slow * 0.97 + (dt > 0.034 ? 0.03 : 0);
    if (this.slow > 0.6) {
      this.dpr = 1.5;
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
    }
  }

  // ------------------------------------------------------------------ Bobo's Arcade
  /** Where the camera frames a picked machine (stage space), blended in by focusK. */
  private focus: { x: number; z: number; y: number; yaw: number; dist: number } | null = null;
  private focusK = 0;
  private walkTo: { cab: Cabinet; to: THREE.Vector3; t: number; arrived: number } | null = null;
  private near: Cabinet | null = null;
  private playBtn: HTMLButtonElement;
  private wv = new THREE.Vector3();

  /** Tap on a machine: Bobo walks to it, the camera glides to frame it, then its card opens. */
  goToCabinet(cab: Cabinet): void {
    const hs = this.stage.houseSet, a = this.stage.actor;
    if (a.asleep) this.runner.nudge();
    this.runner.cancel();
    const to = hs.cabinetFront(cab, new THREE.Vector3());
    this.constrain(to);
    this.walkTo = { cab, to, t: 0, arrived: -1 };
    cab.glow = 1;
    // the camera: in front of the machine, a little to Bobo's side, looking at its screen
    const scr = hs.cabinetScreen(cab, new THREE.Vector3());
    // looking past Bobo's shoulder: turned 0.5 rad off the machine's axis, to whichever side is further from the can
    const base = Math.atan2(to.x - scr.x, to.z - scr.z);
    const mid = this.wv.copy(scr).lerp(to, 0.35);
    const dist = 2.8;
    const far = (y: number) => Math.hypot(mid.x + Math.sin(y) * dist, mid.z + Math.cos(y) * dist - CAN_CZ);
    const yaw = far(base + 0.5) >= far(base - 0.5) ? base + 0.5 : base - 0.5;
    this.focus = { x: mid.x, z: mid.z, y: 0.5, yaw, dist };
    if (this.sh.reduced) { a.position.copy(to); this.walkTo.arrived = 0; }
  }

  private walkToCabinet(dt: number): void {
    const w = this.walkTo!, a = this.stage.actor;
    w.t += dt;
    const d = this.wv.copy(w.to).sub(a.position).setY(0);
    if (w.arrived < 0 && (d.length() < 0.12 || w.t > 6)) {
      if (w.t > 6) a.position.copy(w.to); // never stuck: he pops the rest of the way
      w.arrived = 0;
      a.drive(this.wv.set(0, 0, 0), dt);
    }
    if (w.arrived < 0) {
      d.normalize().multiplyScalar(0.7); // a brisk walk (under the run threshold)
      a.drive(d, dt, (p) => this.constrain(p));
      return;
    }
    a.drive(this.wv.set(0, 0, 0), dt);
    // face the machine, then open its card
    const scr = this.stage.houseSet.cabinetScreen(w.cab, this.wv);
    a.turnToPoint(scr, dt, 8);
    w.arrived += dt;
    if (w.arrived > 0.45) {
      this.walkTo = null;
      w.cab.glow = 0.6;
      this.onArcade?.(w.cab.item.id, 'cabinet');
    }
  }

  /** Drop the machine framing (the fan looks around or walks off). */
  private unfocus(): void {
    if (this.focus) { this.focus = null; this.yaw = this.lastYawFromFocus(); }
  }
  private lastYawFromFocus(): number {
    // keep looking from where the glide left the camera (no snap back)
    const c = this.cam.position, t = this.target;
    return THREE.MathUtils.clamp(Math.atan2(c.x - t.x, c.z - t.z), -LIM.yaw, LIM.yaw);
  }

  /** Bobo standing at a machine: the Play pill (bottom, above the joystick) opens its card. */
  private checkNear(): void {
    const a = this.stage.actor;
    // the zone counts as soon as he walks into it (no need to stop first): a buzz and a flash say "this one's live"
    const cab = this.walkTo || this.game ? null : this.stage.houseSet.nearCabinet(a.position);
    for (const c of this.stage.houseSet.cabinets) if (c !== cab && c.glow > 0 && (!this.walkTo || this.walkTo.cab !== c)) c.glow = Math.max(0, c.glow - 0.05);
    if (cab && cab.glow > 0.6) cab.glow = Math.max(0.6, cab.glow - 0.02); // the entry flash settles
    if (cab === this.near) return;
    this.near = cab;
    if (cab) {
      cab.glow = 1; // flash, then settles to the near glow
      haptic('zone');
      this.playBtn.classList.remove('pop'); void this.playBtn.offsetWidth; this.playBtn.classList.add('pop');
      this.playBtn.textContent = `Play ${cab.item.name}`;
      this.playBtn.setAttribute('aria-label', `Open ${cab.item.name}`);
      this.sh.hud.above.appendChild(this.playBtn);
    } else this.playBtn.remove();
  }

  private playNear(): void {
    const cab = this.near;
    if (!cab || !this.active) return;
    this.onArcade?.(cab.item.id, 'walk');
  }

  private ray = new THREE.Raycaster();
  private tap(x: number, y: number): void {
    if (!this.active || !this.canvas) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.cam);
    // party balloons pop first (the stage sits at the origin here: world = stage space)
    if (this.stage.play.popRay(this.ray.ray)) return;
    const a = this.stage.actor;
    if (!a.bear || !this.hitsBear(this.ray.ray)) {
      // a machine: Bobo walks over, the camera glides to it, then its card opens
      const cab = this.game ? null : this.stage.houseSet.pickCabinet(this.ray.ray);
      if (cab) this.goToCabinet(cab);
      return;
    }
    // a poke: he always jiggles; a reaction plays when he's free
    a.jiggle(0.14);
    if (this.game) return; // a game is on: just the jiggle
    const name = a.asleep ? 'WakeUp' : TAP_REACTIONS[Math.floor(Math.random() * TAP_REACTIONS.length)];
    if (this.runner.busy && !a.asleep) return;
    if (this.runner.trigger(name)) this.sh.tapAction(name);
  }

  private box = new THREE.Box3();
  private hitsBear(ray: THREE.Ray): boolean {
    // his body: a box around his spot (the skinned mesh bounds are unreliable for raycasts)
    const p = this.stage.actor.position;
    this.box.min.set(p.x - 0.45, 0, p.z - 0.45);
    this.box.max.set(p.x + 0.45, 1.0, p.z + 0.45);
    return ray.intersectsBox(this.box);
  }

  /** Long press on his: a hug (a squeeze, a ring of hearts). */
  private hug(x: number, y: number): void {
    if (!this.active || !this.canvas) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.cam);
    if (!this.stage.actor.bear || !this.hitsBear(this.ray.ray) || this.game) return;
    hugBear(this.stage, this.runner, this.sh.reduced);
  }

  dispose(): void {
    this.releaseRenderer();
    this.keys.dispose();
    this.toss.show(false);
    this.gamesBtn?.remove();
    this.movesBtn?.remove();
    this.playBtn.remove();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

const TAP_REACTIONS = ['Cheer', 'Purr', 'Alert'];
const WIDE: Record<string, number> = { Party: 1.6, Running: 1.4, Magic: 0.8 };


function collectTextures(root: THREE.Object3D): THREE.Texture[] {
  const out = new Set<THREE.Texture>();
  root.traverse((o) => {
    for (const m of ([] as THREE.Material[]).concat(((o as THREE.Mesh).material as THREE.Material) ?? [])) {
      for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture && !(v as THREE.VideoTexture).isVideoTexture) out.add(v as THREE.Texture);
    }
  });
  return [...out];
}
