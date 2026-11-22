// Showcase: Happi in New York, no camera. Its own WebGL canvas and renderer (works on computers); the engine
// is stopped while it runs, and this renderer is disposed (context released) whenever a camera mode runs.
//
// Also renders the splash: the bear stands inside the splash's transparent "hero window" (setViewOffset framing),
// then the camera eases out to the play framing when Start slides the splash away.
//
// Controls: joystick (or arrow keys / WASD) walks her, the camera follows; drag to look around a little; pinch or
// scroll to zoom within limits; tap her for a reaction.
import { recorder } from '../../capture/recorder';
import * as THREE from 'three';
import { happiPlaza } from '../../../happi/plaza';
import { MOVES_ICON } from '../../../happi/moves';
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

const FOV_WIDE = 50; // portrait screens: a taller view shows more of New York
const FOV_LAND = 38;
const PLAY = { dist: 2.2, pitch: 0.12, targetY: 0.62 }; // looking a little above her: she stands in the lower half, clear of the top bar
const LIM = { yaw: 1.0, pitchMin: 0.02, pitchMax: 0.6, distMin: 1.3, distMax: 5, area: 3.4 };

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
  private yaw = 0;
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
  /** Swipe up to throw hearts at her (src/experience/physics/toss.ts). */
  readonly toss: HeartToss;
  private hintNext = '';
  /** Mini games (src/experience/play): this stage's game pieces, the running game, the HUD's Games button. */
  readonly kit: PlayKit;
  game: PlayGame | null = null;
  /** Set by the experience: open the game chooser (the Games button, bottom left). */
  onPickGame: (() => void) | null = null;
  /** Set by the experience: open Happi's actions (the Actions button, bottom right). */
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

  constructor(private sh: Shared, readonly stage: Stage, private runner: MomentRunner, backdrop: THREE.Texture) {
    stage.actor.soft = sh.reduced;
    this.toss = new HeartToss({
      stage, runner, layer: sh.hud.layer, reduced: sh.reduced,
      constrain: (p) => {
        const l = Math.hypot(p.x, p.z);
        if (l > LIM.area) { p.x *= LIM.area / l; p.z *= LIM.area / l; }
      },
    });
    backdrop.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = backdrop;
    // the panorama's floating island (its centre column) straight ahead of the default view
    this.scene.backgroundRotation.set(0, Math.PI / 2, 0);
    this.scene.add(stage.root);
    this.scene.add(happiPlaza());
    this.kit = new PlayKit(stage);
  }

  // ------------------------------------------------------------------ renderer life cycle
  /** Create the canvas + renderer (if needed), compile everything, start drawing. Resolves when the first frame is ready. */
  ensureRenderer(): Promise<void> {
    if (this.ready) return this.ready;
    const c = document.createElement('canvas');
    c.className = 'cbx-3d';
    c.setAttribute('aria-label', 'Happi in New York');
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
        // Heart Hoops holds the camera on the court: a slow drag up is a throw there, not a look (polish-4)
        if (!this.active || this.game?.flicks) return;
        this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.006, -LIM.yaw, LIM.yaw);
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, LIM.pitchMin, LIM.pitchMax);
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
    this.sh.hud.hint(IS_PHONE ? 'Drag to look around' : 'Drag to look, arrows walk');
    this.hintNext = tossHinted ? '' : IS_PHONE ? 'Swipe up to throw blossoms' : 'Press Space to throw blossoms';
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
    // while a mini game runs, her moments wait (they would walk her off the field)
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
      constrain: (p) => {
        const l = Math.hypot(p.x, p.z);
        if (l > LIM.area) { p.x *= LIM.area / l; p.z *= LIM.area / l; }
      },
      field: (o) => { o.x = 0; o.z = 0; o.r = LIM.area - 0.75; },
      unitsPerM: 1 / 0.9,
      get ready() { return self.active; },
      sync: () => this.syncPlay(),
      // where the camera settles for a game that holds it on the court (Heart Hoops)
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
      this.gamesBtn ??= this.sh.hud.toolButton({ label: 'Games', icon: GAMES_ICON, aria: 'Play a game with Happi', tone: 'orange', onClick: () => this.onPickGame?.() });
      this.gamesBtn.dataset.cmd = 'games';
      if (this.gamesBtn.parentElement !== this.sh.hud.right) this.sh.hud.right.prepend(this.gamesBtn);
    } else this.gamesBtn?.remove();
    if (!g && this.onPickMove) {
      this.movesBtn ??= this.sh.hud.toolButton({ label: 'Actions', icon: MOVES_ICON, aria: 'Pick something for Happi to do', tone: 'navy', onClick: () => this.onPickMove?.() });
      if (this.movesBtn.parentElement !== this.sh.hud.right) this.sh.hud.right.appendChild(this.movesBtn);
      // Games and Actions stack together at the bottom right (Dapo, 2026-11-20): Games at the bottom, Actions above
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

  /** Throw a heart at her (swipe up, Space, tests). */
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
    this.yaw = 0;
    this.pitch = PLAY.pitch;
    this.dist = PLAY.dist;
    this.target.set(0, PLAY.targetY, 0);
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
      if (this.v.lengthSq() > 0.01 && a.asleep) this.runner.nudge();
      if (this.game && !this.game.stickWalk) this.game.walk(dt);
      else a.drive(this.v, dt, (p) => {
        const l = Math.hypot(p.x, p.z);
        if (l > LIM.area) { p.x *= LIM.area / l; p.z *= LIM.area / l; }
      });
      if (this.hintT > 0 && !this.game && (this.hintT -= dt) <= 0) {
        // then, once: how to throw hearts
        if (this.hintNext) { this.sh.hud.hint(this.hintNext); this.hintNext = ''; tossHinted = true; this.hintT = 5; }
        else this.sh.hud.hint('');
      }
    }
    this.runner.update(dt);
    if (this.active) { if (this.game) this.game.update(dt); else this.toss.update(dt); }
    this.kit.tick(dt);
    // camera follows her (a game may hold it on the court instead, pull back and look down a little)
    const view = this.game?.view;
    const fx = view?.focus ? 0 : a.position.x, fz = view?.focus ? 0 : a.position.z;
    this.target.x += (fx - this.target.x) * damp(3.5, dt);
    this.target.z += (fz - this.target.z) * damp(3.5, dt);
    this.playPitch += ((view?.pitch ?? -1) - this.playPitch) * damp(2.5, dt);
    this.framing += (this.framingTo - this.framing) * (this.framingTo < this.framing ? damp(3.2, dt) : 1);
    // pull back a little while a big moment plays (the house, the party set, the rainbow, a lap)
    const wantWide = (WIDE[this.runner.current ?? ''] ?? 0) + (this.game?.view?.wide ?? 0);
    this.wide += (wantWide - this.wide) * damp(wantWide > this.wide ? 2.2 : 1.2, dt);
    this.placeCamera(dt);
    st.houseSet.applyTour(this.cam); // House moment: the camera glides into her house (scene/house)
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
    const yaw = this.yaw * (1 - k), pitch = pp * (1 - k) + 0.08 * k;
    let dist = this.dist + this.wide;
    let ty = PLAY.targetY + this.wide * 0.18;
    const W = Math.max(1, this.sh.container.clientWidth), H = Math.max(1, this.sh.container.clientHeight);
    if (this.hero && k > 0.001) {
      // splash framing: bear (1 unit + a margin) fills the hero window's height, centred in it
      const want = 1.38 / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2))) * (H / Math.max(60, this.hero.h));
      const wantW = 1.0 / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) * (W / H)) * (W / Math.max(60, this.hero.w));
      dist = dist * (1 - k) + Math.max(want, wantW) * k;
      ty = PLAY.targetY * (1 - k) + 0.52 * k;
      const ox = (W / 2 - (this.hero.x + this.hero.w / 2)) * k, oy = (H / 2 - (this.hero.y + this.hero.h / 2)) * k;
      this.cam.setViewOffset(W, H, ox, oy, W, H);
    } else if (this.cam.view) this.cam.clearViewOffset();
    const tgt = this.tmp.set(this.target.x, ty, this.target.z);
    this.cam.position.set(
      tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      tgt.y + Math.sin(pitch) * dist,
      tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    this.cam.lookAt(tgt);
    this.cam.updateMatrixWorld();
  }

  private playPitch = -1;

  /** Lower the pixel ratio once if frames are very slow (phones with big screens). */
  private adapt(dt: number): void {
    // only for really slow phones, and never below 1.5: dropping to 1.25 made Happi look soft on Android (2026-11-20)
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

  private ray = new THREE.Raycaster();
  private tap(x: number, y: number): void {
    if (!this.active || !this.canvas) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.ray.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.cam);
    // party balloons pop first (the stage sits at the origin here: world = stage space)
    if (this.stage.play.popRay(this.ray.ray)) return;
    const a = this.stage.actor;
    if (!a.bear || !this.hitsBear(this.ray.ray)) return;
    // a poke: she always jiggles; a reaction plays when she's free
    a.jiggle(0.14);
    if (this.game) return; // a game is on: just the jiggle
    const name = a.asleep ? 'WakeUp' : TAP_REACTIONS[Math.floor(Math.random() * TAP_REACTIONS.length)];
    if (this.runner.busy && !a.asleep) return;
    if (this.runner.trigger(name)) this.sh.tapAction(name);
  }

  private box = new THREE.Box3();
  private hitsBear(ray: THREE.Ray): boolean {
    // her body: a capsule-ish box around her spot (the skinned mesh bounds are unreliable for raycasts)
    const p = this.stage.actor.position;
    this.box.min.set(p.x - 0.32, 0, p.z - 0.32);
    this.box.max.set(p.x + 0.32, 1.02, p.z + 0.32);
    return ray.intersectsBox(this.box);
  }

  /** Long press on her: a hug (a squeeze, a ring of hearts). */
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
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

const TAP_REACTIONS = ['Wave', 'Cheer', 'Sparkle'];
/** The Games button's icon: a heart with speed lines (flat, currentColor). */
const GAMES_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="translate(14.5 12) scale(1.15) translate(-12 -12.6)"><g fill="currentColor"><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(0 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(72 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(144 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(216 12 12)"/><path d="M12 12C9.6 10.6 9.9 6.6 11.4 5.6L12 6.6l.6-1C14.1 6.6 14.4 10.6 12 12z" transform="rotate(288 12 12)"/></g></g><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1.5 8.5h3M1 12h2.5M1.5 15.5h3"/></g></svg>';
const WIDE: Record<string, number> = { House: 4.2, Party: 2.2, Rainbow: 1.5, Running: 1.8, Magic: 1.0, Cold: 0.6, Stare: 0.9 };


function collectTextures(root: THREE.Object3D): THREE.Texture[] {
  const out = new Set<THREE.Texture>();
  root.traverse((o) => {
    for (const m of ([] as THREE.Material[]).concat(((o as THREE.Mesh).material as THREE.Material) ?? [])) {
      for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture && !(v as THREE.VideoTexture).isVideoTexture) out.add(v as THREE.Texture);
    }
  });
  return [...out];
}
