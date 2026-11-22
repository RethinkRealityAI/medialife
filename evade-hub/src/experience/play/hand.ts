// Heart Hoops "in hand" (polish-4, after Dapo's phone test: "show the hearts so users know what they're flicking and
// how many they have"). Modelled on Bobo Hoops:
//
//   held heart  the next heart, a real 3D heart held low in the middle of the view. It is drawn with the kit's
//               instanced hearts (the toys' one program: nothing compiles), pops in after each throw, leans and lifts
//               with your finger while you drag (or wind up with Space) and is the exact spot the throw leaves from.
//   aim arc     a dotted arc (DOM dots at projected points, so no shader) while you drag: Short (default), Full or Off.
//   coach       a finger sliding up from the heart along a dotted arc (computer: a Space key pressing), repeating gently
//               until the first throw and again after a long idle, with "Swipe up to throw!" (computer: "Hold Space,
//               then let go") in the hint pill. The words go in the HUD's hint pill, not by the heart: the app's talk
//               button puts its own bubbles ("Hold to talk", your live words) just above the bottom right, which a
//               pill under the heart ran into at 390 px.
//   slow swipe  the shared gesture helper only reports FAST upward swipes as flicks; a slow, deliberate drag up from
//               the heart throws too (children drag slowly).
//
// Late placement: in AR the engine moves the camera AFTER the modes' per-frame update (measured in the simulator: the
// pose a frame renders with is the one the next update sees), so a heart placed in update would trail the view by a
// frame and swim. The held heart (and the aim dots) are placed again in the scene's onBeforeRender, with the camera
// the frame actually renders with (chained: any earlier handler still runs first; unhooked on dispose).
//
// Listeners sit on the experience root (bubble phase, passive): they only watch drags that start on the scene canvas
// and never stop events, so the modes' own gesture handling is untouched.
import * as THREE from 'three';
import { PAL } from '../scene/fx';
import type { PlayHost } from './game';
import type { PickDraw } from './kit';

export type AimGuide = 'off' | 'short' | 'full';
const AIM_KEY = 'cbx.play.aim';
export function readAimGuide(): AimGuide {
  try {
    const v = localStorage.getItem(AIM_KEY);
    return v === 'off' || v === 'full' ? v : 'short';
  } catch { return 'short'; }
}
export function writeAimGuide(v: AimGuide): void {
  try { localStorage.setItem(AIM_KEY, v); } catch { /* private mode */ }
}

/** Held heart: its centre at this share of the screen height (never lower than ~100 px above the rack). */
const HOLD_Y = 0.7;
const HOLD_R_PX = 30;
/** How far in front of the camera the held heart floats (metres). */
const DEPTH_M = 0.42;
const DOTS = 13;
const UP = new THREE.Vector3(0, 1, 0);
const HEART_HEX = PAL.pink;
const GOLD_HEX = PAL.yellow;
/** The coach comes back after this long without a throw. */
const IDLE_COACH_S = 9;

const FINGER = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="20" cy="12" r="10" fill="#fff" fill-opacity="0.35"/><path fill="#fff" stroke="#3b2140" stroke-width="2.2" stroke-linejoin="round" d="M17 12.5a3 3 0 0 1 6 0V25l1.4-.6a3 3 0 0 1 2.4 0l.6.3V23a3 3 0 0 1 5.2-2 3 3 0 0 1 5.2 2v1.2a3 3 0 0 1 4.4 2.6V34c0 6.6-4.4 11-10.6 11h-3.2c-3.9 0-6.4-1.6-8.6-4.4l-6.2-8a3 3 0 0 1 4.4-4l2.4 2.4Z"/></svg>';
const easeOutBack = (k: number) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

export interface HandOpts {
  desktop: boolean;
  /** A slow upward drag that the gesture helper did not report: throw it (power 0..1, lean radians). */
  onSwipe(power: number, side: number): boolean;
  /** The arc a throw would follow from `o` (stage-local points; short: towards the ring, full: to the floor). */
  predict(power: number, side: number, o: THREE.Vector3, out: THREE.Vector3[], full: boolean): number;
  /** Last throw time (performance.now()). */
  lastThrow(): number;
}

export class HoopsHand {
  /** The held heart's centre (stage-local) and whether it is on screen this frame. */
  readonly pos = new THREE.Vector3();
  posOk = false;
  /** A heart is in hand and ready to throw. */
  get ready(): boolean { return this.has && this.t > 0.12; }
  money = false;
  guide: AimGuide = readAimGuide();
  /** Diagnostics for tests. */
  readonly diag = { slowSwipes: 0, coachShown: 0, heldPx: [0, 0, 0] as number[], dots: 0 };
  /** Thrown at least once this round (the coach stops). */
  thrownRound = false;
  private has = false;
  private t = 0;
  private wob = 0;
  private aim = { on: false, power: 0, side: 0, dx: 0, up: 0 };
  private drag: { id: number; x0: number; y0: number; t0: number; tl: number; yl: number; vy: number; x: number; y: number } | null = null;
  private spaceAt = 0;
  private idle = 0;
  private coachOn = false;
  private coachText: string;
  private hintMine = false;
  private showHeld = false;
  // DOM
  private coach: HTMLElement;
  /** "Last heart · x2" over the gold heart while it is in your hand. */
  private tag: HTMLElement;
  private tagOn = false;
  private dotsEl: HTMLElement;
  private dots: HTMLElement[] = [];
  private pts: THREE.Vector3[] = [];
  private rackTop = 0;
  private rackAt = -1;
  private heldY = -1;
  // scratch
  private f = new THREE.Vector3();
  private r = new THREE.Vector3();
  private u = new THREE.Vector3();
  private c = new THREE.Vector3();
  private p = new THREE.Vector3();
  private s2 = new THREE.Vector2();
  private s3 = new THREE.Vector2();
  private s4 = new THREE.Vector2();
  private draw: PickDraw = { kind: 'heart', x: 0, y: 0, z: 0, s: 0, yaw: 0, hex: HEART_HEX, beacon: -1, phase: 0 };
  private disposed = false;
  // late placement (see the header)
  private scene: THREE.Scene | null = null;
  private prevBR: THREE.Scene['onBeforeRender'] | null = null;
  private dotsWanted = false;
  private lateCam = new THREE.Vector3();
  private lateDir = new THREE.Vector3();
  private lateInv = new THREE.Matrix4();
  private readonly late: THREE.Scene['onBeforeRender'] = (...args) => {
    const camera = args[2];
    this.prevBR?.apply(args[1], args);
    if (this.disposed || !this.showHeld) return;
    try {
      const root = this.host.stage.root;
      const inv = this.lateInv.copy(root.matrixWorld).invert();
      camera.getWorldPosition(this.lateCam).applyMatrix4(inv);
      camera.getWorldDirection(this.lateDir).transformDirection(inv);
      this.place(this.lateCam, this.lateDir);
      this.drawHeld();
      if (this.dotsWanted && this.posOk) this.drawDots();
    } catch { /* never break a frame */ }
  };

  constructor(private host: PlayHost, private opts: HandOpts) {
    const desk = opts.desktop;
    this.coach = document.createElement('div');
    this.coach.className = 'cbp-coach' + (host.reduced ? ' soft' : '');
    this.coach.setAttribute('aria-hidden', 'true');
    this.coach.innerHTML = `<svg class="cbp-coach-arc" viewBox="0 0 120 170" aria-hidden="true"><path d="M60 160 C 60 110, 72 60, 92 14" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 13"/><path d="M84 12 L95 9 L97 21" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      + (desk ? '<i class="cbp-coach-key">Space</i>' : `<i class="cbp-coach-finger">${FINGER}</i>`);
    this.coachText = desk ? 'Hold Space, then let go' : 'Swipe up to throw!';
    this.dotsEl = document.createElement('div');
    this.dotsEl.className = 'cbp-aim';
    this.dotsEl.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < DOTS; i++) {
      const d = document.createElement('i');
      this.dots.push(d);
      this.dotsEl.appendChild(d);
      this.pts.push(new THREE.Vector3());
    }
    this.tag = document.createElement('div');
    this.tag.className = 'cbp-x2tag';
    this.tag.setAttribute('role', 'status');
    this.tag.innerHTML = 'Last blossom <b>x2</b>';
    host.layer.append(this.dotsEl, this.coach, this.tag);
    host.root.addEventListener('pointerdown', this.onDown);
    host.root.addEventListener('pointermove', this.onMove);
    host.root.addEventListener('pointerup', this.onUp);
    host.root.addEventListener('pointercancel', this.onCancel);
    if (host.variant === 'showcase') {
      window.addEventListener('keydown', this.onKey);
      window.addEventListener('keyup', this.onKeyUp);
      window.addEventListener('blur', this.onBlur);
    }
  }

  // ------------------------------------------------------------------ hearts
  /** A new round: the first heart arrives a beat after Go. */
  reset(): void {
    this.thrownRound = false;
    this.idle = 0;
    this.has = false;
    this.aim.on = false;
    this.drag = null;
    this.spaceAt = 0;
    this.setCoach(false);
  }

  /** The next heart pops into your hand (after `delay` s). */
  next(money: boolean, delay = 0.35): void {
    this.has = true;
    this.money = money;
    this.t = -delay;
  }

  /** Thrown: the hand is empty until `next`. */
  release(): void {
    this.has = false;
    this.thrownRound = true;
    this.idle = 0;
    this.aim.on = false;
    this.spaceAt = 0;
    this.setCoach(false);
    this.hideDots();
  }

  /** Empty hand, nothing drawn (results, teardown). */
  empty(): void {
    this.has = false;
    this.setCoach(false);
    this.hideDots();
  }

  /** Where the held heart is on screen (container px), for call-outs. */
  screen(out: THREE.Vector2): boolean {
    return this.posOk && this.host.project(this.pos, out);
  }

  // ------------------------------------------------------------------ per frame
  /**
   * `show`: the round is live (countdown, playing or paused). `playing`: throws allowed now (the coach may show).
   */
  update(dt: number, show: boolean, playing: boolean): void {
    if (this.disposed) return;
    this.showHeld = show && this.has;
    if (this.has) this.t += dt;
    if (this.spaceAt) {
      const held = (performance.now() - this.spaceAt) / 1000;
      this.aim.on = true;
      this.aim.power = Math.min(1.1, held / 1.1);
      this.aim.side = 0;
      this.aim.dx = 0;
      this.aim.up = this.aim.power * 120;
    }
    this.wob += dt;
    if (!this.scene) this.hookScene();
    this.place();
    this.drawHeld();
    // the aim arc while you drag / wind up
    this.dotsWanted = playing && this.ready && this.aim.on && this.guide !== 'off' && this.aim.power > 0.03;
    if (this.dotsWanted && this.posOk) this.drawDots();
    else this.hideDots();
    // the coach: until the first throw of the round, and again after a long idle
    if (playing && this.ready) this.idle += dt;
    const want = playing && this.ready && !this.aim.on && (!this.thrownRound ? this.t > 0.5 : this.idle > IDLE_COACH_S);
    this.setCoach(want);
    const tag = show && this.money && this.ready && this.posOk;
    if (tag !== this.tagOn) { this.tagOn = tag; this.tag.classList.toggle('on', tag); }
    if ((this.coachOn || this.tagOn) && this.heldY > 0) {
      const hy = `${Math.round(this.heldY)}px`;
      this.coach.style.setProperty('--hy', hy);
      this.tag.style.setProperty('--hy', hy);
    }
  }

  /** Chain onto the scene's onBeforeRender (once the stage is in a scene). */
  private hookScene(): void {
    let o: THREE.Object3D = this.host.stage.root;
    while (o.parent) o = o.parent;
    if (!(o as THREE.Scene).isScene) return;
    const sc = o as THREE.Scene;
    this.scene = sc;
    this.prevBR = sc.onBeforeRender;
    sc.onBeforeRender = this.late;
  }

  /**
   * The held heart's spot: low in the middle of the view, nudged by your finger. `cam` / `dir` (stage-local): the
   * camera this frame renders with (late placement); else the stage's copy from the last update.
   */
  private place(cam?: THREE.Vector3, dir?: THREE.Vector3): void {
    const st = this.host.stage, um = this.host.unitsPerM;
    const f = this.f.copy(dir ?? st.camDir);
    if (f.lengthSq() < 1e-6) { this.posOk = false; return; }
    f.normalize();
    const r = this.r.crossVectors(f, UP);
    if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
    r.normalize();
    const u = this.u.crossVectors(r, f).normalize();
    const D = DEPTH_M * um;
    const c = this.c.copy(cam ?? st.cam).addScaledVector(f, D);
    // the screen near c is linear in the plane D in front of the camera: measure how a step along r and along u moves
    // on screen (a 2x2 map, so a rolled AR camera is handled too) and solve for the spot under the target pixel
    const e = D * 0.1;
    if (!this.host.project(c, this.s2) || !this.host.project(this.p.copy(c).addScaledVector(r, e), this.s3)
      || !this.host.project(this.p.copy(c).addScaledVector(u, e), this.s4)) { this.posOk = false; return; }
    const jrx = (this.s3.x - this.s2.x) / e, jry = (this.s3.y - this.s2.y) / e;
    const jux = (this.s4.x - this.s2.x) / e, juy = (this.s4.y - this.s2.y) / e;
    const det = jrx * juy - jux * jry;
    const ppu = Math.sqrt(Math.abs(det)); // pixels per stage unit
    if (!(ppu > 1)) { this.posOk = false; return; }
    const H = this.host.root.clientHeight || 1;
    const now = performance.now();
    if (now - this.rackAt > 500) {
      this.rackAt = now;
      const rk = this.host.layer.querySelector('.cbp-rack') as HTMLElement | null;
      const rb = this.host.root.getBoundingClientRect();
      this.rackTop = rk ? rk.getBoundingClientRect().top - rb.top : H - 100;
    }
    let y = Math.min(H * HOLD_Y, this.rackTop - 104);
    let x = 0;
    if (this.aim.on) {
      y -= Math.min(this.aim.up * 0.22, 46);
      x = THREE.MathUtils.clamp(this.aim.dx * 0.3, -54, 54);
    }
    this.heldY = y;
    const W = this.host.root.clientWidth || 1;
    const tx = W / 2 + x - this.s2.x, ty = y - this.s2.y;
    const a = (tx * juy - jux * ty) / det, b = (jrx * ty - tx * jry) / det;
    this.pos.copy(c).addScaledVector(r, a).addScaledVector(u, b);
    this.posOk = true;
    // the size: ~60 px across, popping in with a little overshoot, a touch bigger while you hold it
    const k = this.has ? easeOutBack(THREE.MathUtils.clamp(this.t / 0.3, 0, 1)) : 0;
    const big = this.aim.on ? 1.12 : 1;
    this.draw.s = ((HOLD_R_PX * big) / ppu / 0.13) * Math.max(0, k);
    // test hook: where the heart really lands on screen (projected back)
    if (this.host.project(this.pos, this.s3)) this.diag.heldPx = [Math.round(this.s3.x), Math.round(this.s3.y), Math.round(HOLD_R_PX * big * k)];
  }

  private drawHeld(): void {
    const kit = this.host.kit;
    if (!this.showHeld || !this.posOk || this.t <= 0 || this.draw.s <= 0.001) { kit.draw([]); return; }
    const f = this.f;
    const d = this.draw;
    d.x = this.pos.x; d.y = this.pos.y; d.z = this.pos.z;
    // facing you, swaying gently (leaning with the swipe)
    const sway = this.host.reduced ? 0.06 : 0.16;
    d.yaw = Math.atan2(-f.x, -f.z) + Math.sin(this.wob * 2.2) * sway + (this.aim.on ? this.aim.side * 0.6 : 0);
    d.hex = this.money ? GOLD_HEX : HEART_HEX;
    kit.draw([d]);
  }

  private drawDots(): void {
    const full = this.guide === 'full';
    const n = this.opts.predict(this.aim.power, this.aim.side, this.pos, this.pts, full);
    let shown = 0;
    for (let i = 0; i < DOTS; i++) {
      const dEl = this.dots[i];
      if (i < n && this.host.project(this.pts[i], this.s2)) {
        const end = !full && i === n - 1; // the short arc ends on a target ring: where it meets the ring's distance
        if (dEl.classList.contains('end') !== end) dEl.classList.toggle('end', end);
        dEl.style.transform = `translate3d(${this.s2.x.toFixed(1)}px, ${this.s2.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        dEl.style.opacity = end ? '1' : (0.45 + (0.5 * i) / DOTS).toFixed(2);
        shown++;
      } else dEl.style.opacity = '0';
    }
    this.diag.dots = shown;
    this.dotsEl.classList.add('on');
  }

  private hideDots(): void {
    if (!this.dotsEl.classList.contains('on')) return;
    this.dotsEl.classList.remove('on');
    this.diag.dots = 0;
  }

  private setCoach(on: boolean): void {
    if (on === this.coachOn) return;
    this.coachOn = on;
    this.coach.classList.toggle('on', on);
    if (on) {
      this.diag.coachShown++;
      this.host.hint(this.coachText);
      this.hintMine = true;
    } else if (this.hintMine) {
      this.hintMine = false;
      this.host.hint('');
    }
  }

  // ------------------------------------------------------------------ input (watch only)
  private onDown = (e: PointerEvent): void => {
    if (this.drag || !(e.target instanceof HTMLCanvasElement) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const t = performance.now();
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: t, tl: t, yl: e.clientY, vy: 0, x: e.clientX, y: e.clientY };
    this.aim.on = false;
  };

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const t = performance.now(), ddt = Math.max(1, t - d.tl);
    d.vy = d.vy * 0.5 + ((d.yl - e.clientY) / ddt) * 0.5;
    d.tl = t; d.yl = e.clientY; d.x = e.clientX; d.y = e.clientY;
    const up = d.y0 - e.clientY, dx = e.clientX - d.x0;
    this.aim.up = Math.max(0, up);
    this.aim.dx = dx;
    this.aim.on = up > 8 && up > Math.abs(dx) * 0.6;
    if (this.aim.on) {
      const pw = this.swipePower(up, d.vy);
      this.aim.power = pw;
      this.aim.side = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(up, 40)), -0.6, 0.6);
    }
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    this.aim.on = false;
    const up = d.y0 - e.clientY, dx = e.clientX - d.x0;
    // the gesture helper already threw it (a quick flick): nothing to do
    if (this.opts.lastThrow() >= d.t0) return;
    if (up > 40 && up > Math.abs(dx) * 1.1 && this.ready) {
      const side = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(up, 40)), -0.6, 0.6);
      if (this.opts.onSwipe(this.swipePower(up, d.vy), side)) this.diag.slowSwipes++;
    }
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.id) { this.drag = null; this.aim.on = false; }
  };

  /** The same strength as the gesture helper's flick: length (70 %) and release speed (30 %). */
  private swipePower(up: number, vy: number): number {
    const h = Math.max(320, this.host.root.clientHeight || 0);
    return THREE.MathUtils.clamp(0.7 * (up / (h * 0.4)) + 0.3 * Math.min(1, Math.max(0, vy) / 2.5), 0, 1);
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat || (e.target as HTMLElement)?.closest?.('input,textarea,select,button,[contenteditable]')) return;
    if (this.ready) this.spaceAt = performance.now();
  };
  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    this.spaceAt = 0;
    this.aim.on = false;
  };
  private onBlur = (): void => { this.spaceAt = 0; this.aim.on = false; };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const sc = this.scene;
    if (sc && sc.onBeforeRender === this.late) sc.onBeforeRender = this.prevBR ?? (() => undefined);
    this.scene = null;
    const root = this.host.root;
    root.removeEventListener('pointerdown', this.onDown);
    root.removeEventListener('pointermove', this.onMove);
    root.removeEventListener('pointerup', this.onUp);
    root.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.coach.remove();
    this.tag.remove();
    this.dotsEl.remove();
    this.host.kit.draw([]);
  }
}
