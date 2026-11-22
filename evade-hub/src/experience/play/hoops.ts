// Paw Hoops (from Bobo Hoops): Bobo sets up a ring on a big Eclipse can and you get 10 hearts to throw through it with a
// swipe up (the heart toss's flick gesture and its toy physics: the same pooled hearts, the same solver).
//
//   through the ring = 2, clean through without touching it (a swish) = 3, a long shot +1, from the 3rd in a row +1,
//   the 10th heart (gold sparkles) counts double. The ring moves after every heart that goes in.
//
// The swipe's lean picks the direction and its length the distance (a short swipe falls short, a long one flies
// past); there is a little aim help for small hands, less than the free toy. The ring's edge is 14 static spheres in
// the stage's toy world, so hearts really bounce off it. Everything is stage-local.
//
// polish-4 (Dapo: "it's not really clear they're meant to be flicking"): the next heart sits in your hand (a 3D heart
// low in the middle of the view, see hand.ts), a rack at the bottom shows the hearts left (the 10th gold, "x2"), a
// finger + arc coach shows the swipe until the first throw, a dotted aim arc follows your drag, slow drags throw too,
// and scoring got louder: "+3 Swish!" at the ring, the ring flashes and pulses, "So close!" for near misses.
import * as THREE from 'three';
import type { PlayStatus } from '../../shared/contracts';
import type { Body } from '../physics/world';
import { PAL, RAINBOW } from '../scene/fx';
import { PlayGame, mulberry32, type PlayHost } from './game';
import { HOOP_BAND, HOOP_R, RIM_N, houseBounds } from './kit';
import { HoopsHand, readAimGuide, writeAimGuide, type AimGuide } from './hand';

const BALLS = 10;
const UP = new THREE.Vector3(0, 1, 0);
/** Ring distances from you, in metres. */
const DIST_M = { min: 2.2, max: 4.6, arMin: 0.9, arMax: 2.4 };

interface Shot {
  b: Body;
  age: number;
  side: number;
  prev: THREE.Vector3;
  done: boolean;
  scored: boolean;
  touched: boolean;
  from: number;
  money: boolean;
  rimT: number;
  /** Crossed the ring's plane just outside the opening (a near miss). */
  near: boolean;
}

export class PawHoops extends PlayGame {
  readonly id = 'heart-hoops' as const;
  readonly label = 'Paw Hoops';
  readonly showStick = false;
  protected readonly roundS = null;
  protected readonly starAt = [8, 18, 28] as const;
  protected readonly balls = BALLS;
  protected readonly goLine: string;
  /** The 3D camera holds still on the court while this runs. */
  readonly view = { wide: 2.2, pitch: 0.16 as number | null, focus: true };
  readonly flicks = true;
  thrown = 0;
  resolved = 0;
  made = 0;
  swishes = 0;
  streak = 0;
  private shots: Shot[] = [];
  private last = -1e9;
  private rng = mulberry32(7);
  /** Ring centre (stage-local) and where it is going. */
  readonly ring = new THREE.Vector3();
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private moveT = 1;
  private ringK = 0;
  private dist = { min: 3, max: 5 };
  /** His spot beside the ring. */
  private stand = new THREE.Vector3();
  private n = new THREE.Vector3(0, 0, 1);
  private right = new THREE.Vector3(1, 0, 0);
  private o = new THREE.Vector3();
  private v = new THREE.Vector3();
  private d = new THREE.Vector3();
  private t = new THREE.Vector3();
  private house = new THREE.Box3();
  private field = { x: 0, z: 0, r: 2.6 };
  private sparkT = 0;
  private cc = new THREE.Vector3();
  /** The heart in your hand, the aim arc and the swipe coach (hand.ts). */
  hand: HoopsHand | null = null;
  /** performance.now() of the last throw. */
  lastThrowAt = 0;
  /** Ring flash after a score (1 -> 0) and whether it was a swish (gold). */
  private flashK = 0;
  private flashGold = false;
  /** His side of the ring (+1 = the ring's right as you look at it). */
  private herSide = 1;
  private aimO = new THREE.Vector3();
  private aimV = new THREE.Vector3();
  private aimD = new THREE.Vector3();
  private q0 = new THREE.Vector3();
  private q1 = new THREE.Vector3();
  private q2 = new THREE.Vector3();
  private sa = new THREE.Vector2();
  private sb = new THREE.Vector2();

  constructor(host: PlayHost, emit: (s: PlayStatus) => void, exit: () => void, private desktop = false) {
    super(host, emit, exit);
    this.goLine = desktop ? 'Hold Space, let go to throw' : 'Swipe up through the ring!';
  }

  // ------------------------------------------------------------------ round
  protected setup(): void {
    this.rng = mulberry32((Math.random() * 4294967296) >>> 0);
    this.thrown = this.resolved = this.made = this.swishes = this.streak = 0;
    this.shots.length = 0;
    this.host.stage.play.clear();
    this.host.field(this.field);
    const u = this.host.unitsPerM, ar = this.host.variant === 'ar';
    this.dist = { min: (ar ? DIST_M.arMin : DIST_M.min) * u, max: (ar ? DIST_M.arMax : DIST_M.max) * u };
    this.pickSpot(this.to, true);
    this.ring.copy(this.to);
    this.from.copy(this.to);
    this.moveT = 1;
    this.ringK = 0;
    this.standBeside();
    this.ui.setBalls(0);
    this.ui.showRack(true);
    this.ui.streak(0);
    this.flashK = 0;
    this.lastThrowAt = 0;
    this.hand ??= new HoopsHand(this.host, {
      desktop: this.desktop,
      onSwipe: (power, side) => this.flick(power, side),
      predict: (power, side, o, out, full) => this.predict(power, side, o, out, full),
      lastThrow: () => this.lastThrowAt,
    });
    this.hand.reset();
    this.hand.next(false, 0.1); // the first heart is in your hand for the countdown
  }

  /** A new place for the ring: in front of you at a varying distance, inside the play area, clear of the house. */
  private pickSpot(out: THREE.Vector3, first = false): void {
    const st = this.host.stage;
    const cam = this.cc.copy(st.cam), f = this.d.copy(st.camDir);
    this.host.court?.(cam, f);
    f.setY(0);
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const r = this.t.set(-f.z, 0, f.x);
    const hb = houseBounds(st, 0.5, this.house);
    const F = this.field;
    // keep the whole ring on screen (a portrait phone is narrow: the old ±13 % sideways put it half off the edge) and
    // put his on the side towards the middle, so the pair sits in view
    const tanX = this.viewTanX();
    const ringW = HOOP_R + HOOP_BAND + 0.06;
    const side = this.rng() < 0.5 ? -1 : 1;
    let best = -1;
    for (let i = 0; i < 40; i++) {
      const k = first ? 0.25 + this.rng() * 0.2 : this.rng();
      const dd = this.dist.min + (this.dist.max - this.dist.min) * k;
      const room = tanX * dd * 0.94 - ringW;
      if (room < 0 && i < 32) continue; // too close for this screen's width: try further away
      const lat = side * Math.max(0, Math.min(dd * 0.13, room)) * (0.45 + 0.55 * this.rng());
      const x = cam.x + f.x * dd + r.x * lat, z = cam.z + f.z * dd + r.z * lat;
      if (Math.hypot(x - F.x, z - F.z) > F.r) continue;
      if (hb && x > hb.min.x - 0.2 && x < hb.max.x + 0.2 && z > hb.min.z - 0.2 && z < hb.max.z + 0.2) continue;
      // not right where it was
      if (!first && Math.hypot(x - this.ring.x, z - this.ring.z) < 0.6) continue;
      out.set(x, 0.75 + this.rng() * 0.6, z);
      // he stands on the inner side (towards the middle) on a narrow screen; on a wide one, outside the ring when it
      // fits, so the middle of the view (where the heart in your hand is) stays clear
      // (his centre stands HOOP_R + 0.3 out, about 0.2 past the ring's edge; he is about 0.6 wide)
      this.herSide = room - Math.abs(lat) > HOOP_R + 0.3 - ringW + 0.36 ? side : -side;
      best = i;
      break;
    }
    if (best < 0) {
      // nothing fits (AR: far from the stage): the field's near edge, towards you
      const dx = cam.x - F.x, dz = cam.z - F.z, l = Math.hypot(dx, dz) || 1;
      out.set(F.x + (dx / l) * F.r * 0.3, 0.9, F.z + (dz / l) * F.r * 0.3);
    }
  }

  private standBeside(): void {
    // beside the ring on the side towards the middle of your view (pickSpot), a step behind it (further from you),
    // so he never blocks the throw and the pair stays on screen
    this.faceBasis(this.to);
    this.stand.copy(this.to).addScaledVector(this.right, this.herSide * (HOOP_R + 0.3)).addScaledVector(this.n, -0.5).setY(0);
    this.host.constrain(this.stand);
  }

  /** tan(half the horizontal view), measured through the live projection (it only changes with the screen shape). */
  private viewTanX(): number {
    const st = this.host.stage;
    const f = this.q0.copy(st.camDir);
    if (f.lengthSq() < 1e-6) return 0.3;
    f.normalize();
    const r = this.q1.crossVectors(f, UP);
    if (r.lengthSq() < 1e-6) return 0.3;
    r.normalize();
    const p = this.q2.copy(st.cam).add(f);
    if (!this.host.project(p, this.sa) || !this.host.project(p.addScaledVector(r, 0.1), this.sb)) return 0.3;
    const ppu = (this.sb.x - this.sa.x) / 0.1;
    const W = this.host.root.clientWidth || 1;
    return ppu > 1 ? Math.min(1.5, W / 2 / ppu) : 0.3;
  }

  /** The ring faces you (yaw only): n points from the ring towards the camera. */
  private faceBasis(at: THREE.Vector3): void {
    const cam = this.host.stage.cam;
    this.n.set(cam.x - at.x, 0, cam.z - at.z);
    if (this.n.lengthSq() < 1e-6) this.n.set(0, 0, 1);
    this.n.normalize();
    this.right.set(this.n.z, 0, -this.n.x);
  }

  // ------------------------------------------------------------------ throwing
  flick(power: number, side: number): boolean {
    if (this.state !== 'playing' || this.thrown >= BALLS) return false;
    const now = performance.now();
    if (now - this.last < 420) return false;
    const hand = this.hand;
    // nothing in your hand yet (it pops in a beat after the last throw)
    if (hand && !hand.ready) return false;
    this.last = now;
    this.lastThrowAt = now;
    const st = this.host.stage;
    // from the heart in your hand (low in the middle of your view)
    this.launchFrom(this.o);
    const T = this.ring;
    const dist = this.aim(power, side, this.o, this.v);
    const money = this.thrown === BALLS - 1;
    const b = st.play.throwHeart(this.o, this.v, money ? PAL.yellow : PAL.pink);
    b.sense = false; // not catchable: this heart is for the ring
    this.faceBasis(T);
    this.shots.push({
      b, age: 0, side: this.t.subVectors(this.o, T).dot(this.n), prev: this.o.clone(), done: false, scored: false, touched: false,
      from: dist, money, rimT: 0, near: false,
    });
    this.thrown++;
    this.ui.setBalls(this.thrown);
    this.sounds.throw();
    try { navigator.vibrate?.(8); } catch { /* no haptics */ }
    if (hand) {
      hand.release();
      if (this.thrown < BALLS) {
        const nextMoney = this.thrown === BALLS - 1;
        hand.next(nextMoney, 0.35);
        // the last heart: gold, and it counts double. Say so as it lands in your hand.
        if (nextMoney) window.setTimeout(() => this.lastHeartCallout(), this.host.reduced ? 500 : 700);
      }
    }
    return true;
  }

  /** The throw's start: the held heart, else (no projection yet) low in front of the camera. */
  private launchFrom(out: THREE.Vector3): THREE.Vector3 {
    const h = this.hand;
    if (h?.posOk) return out.copy(h.pos);
    const st = this.host.stage, u = this.host.unitsPerM;
    out.copy(st.cam).addScaledVector(st.camDir, 0.5 * u);
    out.y = Math.max(0.15, out.y - 0.22 * u);
    return out;
  }

  /**
   * The launch velocity `v` for a swipe from `o`: aimed at the ring and turned by the swipe's lean (a straight swipe
   * goes straight at it; the camera may be looking anywhere in 3D). The distance is the skill. Returns the ring
   * distance. Shared by the throw and the aim arc, so the arc shows exactly where the heart will go.
   */
  private aim(power: number, side: number, o: THREE.Vector3, v: THREE.Vector3): number {
    const st = this.host.stage, u = this.host.unitsPerM;
    const T = this.ring;
    const d = this.aimD.subVectors(T, o).setY(0);
    const dist = Math.max(0.3, d.length());
    d.divideScalar(dist);
    const lean = THREE.MathUtils.clamp(side, -0.6, 0.6);
    v.copy(d).applyAxisAngle(UP, -(Math.abs(lean) < 0.07 ? 0 : lean - Math.sign(lean) * 0.07) * 0.7);
    // distance from the swipe's power: ~0.5 reaches the ring; within 9 % counts as spot on
    let D = dist * (0.5 + THREE.MathUtils.clamp(power, 0, 1.2) * 1.0);
    if (Math.abs(D / dist - 1) < 0.09) D = dist;
    // a lob that passes the ring's centre height after D
    const g = st.play.world.gravityY;
    const dy = T.y - o.y;
    let elev = 0.5;
    let den = D * Math.tan(elev) - dy;
    if (den < 0.15 * D) { elev = Math.atan((dy + 0.15 * D) / D) + 0.06; den = D * Math.tan(elev) - dy; }
    const c = Math.cos(elev);
    const speed = Math.min(18 * u, Math.sqrt((g * D * D) / (2 * c * c * Math.max(den, 1e-3))));
    v.multiplyScalar(c * speed).addScaledVector(UP, Math.sin(elev) * speed);
    return dist;
  }

  /**
   * The aim arc: `out` gets points of the flight from `o` (no drag). Short: the second half of the way to the ring,
   * ending where the heart reaches the ring's distance (in the ring = it goes in; above / below = too far / short).
   * Full: from just after your hand down to the floor. Seen from right behind, the first part of a lob climbs steeply
   * up the screen, so the short arc starts half-way, where it reads against the ring.
   */
  private predict(power: number, side: number, o: THREE.Vector3, out: THREE.Vector3[], full: boolean): number {
    if (this.state !== 'playing') return 0;
    const v = this.aimV;
    const dist = this.aim(power, side, this.aimO.copy(o), v);
    const g = this.host.stage.play.world.gravityY;
    const tFloor = (v.y + Math.sqrt(v.y * v.y + 2 * g * Math.max(0.02, o.y))) / g;
    const tRing = Math.min(tFloor, dist / Math.max(0.05, Math.hypot(v.x, v.z)));
    const tA = full ? tRing * 0.12 : tRing * 0.45, tB = full ? tFloor : tRing;
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const t = tA + ((tB - tA) * i) / (n - 1);
      out[i].set(o.x + v.x * t, o.y + v.y * t - 0.5 * g * t * t, o.z + v.z * t);
    }
    return n;
  }

  /** The gold heart lands in your hand (its "Last heart x2" tag is the hand's): a sparkle to go with it. */
  private lastHeartCallout(): void {
    const h = this.hand;
    if (this.state !== 'playing' || !h || !h.money) return;
    this.sounds.sparkle();
    if (h.screen(this.sa)) this.host.stage.fx.emit({ count: this.host.reduced ? 4 : 8, glyph: ['sparkle', 'star'], colors: [PAL.yellow, PAL.white], at: h.pos, spread: [0.02, 0.02, 0.02], vel: [0, 0.06, 0], velSpread: [0.06, 0.06, 0.06], life: [0.4, 0.7], size: [0.012, 0.02], drag: 3 });
  }

  // ------------------------------------------------------------------ per frame
  protected tick(dt: number): void {
    const st = this.host.stage;
    for (const s of this.shots) {
      if (s.done) continue;
      const b = s.b;
      s.age += dt;
      if (!b.alive) { this.resolve(s, false); continue; }
      if (b.landed && !s.touched) {
        s.touched = true;
        // touching the ring (not the floor) rings it
        if (b.p.y > b.r * 2 && Math.abs(this.t.subVectors(b.p, this.ring).dot(this.n)) < HOOP_BAND + b.r * 1.5) this.sounds.rim();
      }
      // crossing the ring's plane from your side: through the opening?
      this.faceBasis(this.ring);
      const sNow = this.t.subVectors(b.p, this.ring).dot(this.n);
      const sPrev = this.d.subVectors(s.prev, this.ring).dot(this.n);
      if (!s.scored && sPrev > 0 && sNow <= 0) {
        const k = sPrev / Math.max(1e-6, sPrev - sNow);
        const cx = s.prev.x + (b.p.x - s.prev.x) * k, cy = s.prev.y + (b.p.y - s.prev.y) * k, cz = s.prev.z + (b.p.z - s.prev.z) * k;
        const rr = Math.hypot(cx - this.ring.x, cy - this.ring.y, cz - this.ring.z);
        if (rr < HOOP_R - HOOP_BAND * 0.6 && this.ringK > 0.9 && this.moveT >= 1) this.score1(s, cx, cy, cz);
        else if (rr < HOOP_R * 1.75) s.near = true;
      }
      s.prev.copy(b.p);
      // a gold sparkle trail on the double heart
      if (s.money && !s.scored && (this.sparkT -= dt) <= 0) {
        this.sparkT = this.host.reduced ? 0.1 : 0.045;
        st.fx.emit({ count: 1, glyph: ['star', 'sparkle'], colors: [PAL.yellow, PAL.white], at: b.p, spread: [0.03, 0.03, 0.03], vel: [0, 0.1, 0], life: [0.35, 0.55], size: [0.05, 0.08], drag: 2 });
      }
      // on the floor (or too long in the air): done
      if (!s.scored && b.grounded) this.resolve(s, false);
      else if (s.age > 4.5) this.resolve(s, s.scored);
      else if (s.scored && (b.grounded || s.age > 3)) this.resolve(s, true);
    }
    if (this.thrown >= BALLS && this.resolved >= BALLS) this.finish();
  }

  private score1(s: Shot, x: number, y: number, z: number): void {
    const st = this.host.stage, a = st.actor, rm = this.host.reduced;
    s.scored = true;
    this.made++;
    this.streak++;
    const swish = !s.touched;
    if (swish) this.swishes++;
    let pts = swish ? 3 : 2;
    const extras: string[] = [];
    const longShot = s.from > this.dist.min + (this.dist.max - this.dist.min) * 0.62;
    if (longShot) { pts += 1; extras.push('long shot'); }
    if (this.streak >= 3) { pts += 1; extras.push(`${this.streak} in a row`); }
    if (s.money) { pts *= 2; extras.push('x2'); }
    this.score += pts;
    this.ui.streak(this.streak);
    this.sounds.score(swish, this.streak);
    const at = this.t.set(x, y, z);
    st.fx.emit({ count: rm ? 10 : 22, glyph: ['heart', 'star', 'sparkle'], colors: [...RAINBOW, PAL.pink], at, ring: HOOP_R * 0.9, vel: [0, 0.35, 0], velSpread: [0.25, 0.25, 0.25], drag: 2.2, life: [0.6, 1], size: [0.05, 0.1] });
    st.fx.emit({ count: 1, glyph: 'ring', colors: [swish ? PAL.yellow : PAL.white], at, life: [0.3, 0.34], size: [HOOP_R * 2.6, HOOP_R * 2.62], spin: 0 });
    this.popAt(this.t.set(x, y + HOOP_R + 0.1, z), `+${pts}${swish ? ' Swish!' : ''}`, s.money ? 'star big' : swish ? 'rainbow big' : 'big', extras.join(' · '));
    this.flashK = 1;
    this.flashGold = swish || s.money;
    a.face('happy', 2);
    a.jiggle(0.16);
    if (a.scripted === 0 && !a.walking) void a.once(this.streak >= 3 || swish ? 'cheer' : 'present', 2.2, 1.2);
    // the ring moves on (a beat later, so you see it go in)
    window.setTimeout(() => { if (this.state === 'playing' && this.made > 0 && this.thrown < BALLS) this.moveRing(); }, rm ? 350 : 650);
  }

  private resolve(s: Shot, scored: boolean): void {
    if (s.done) return;
    s.done = true;
    this.resolved++;
    if (!scored && !s.scored) {
      this.streak = 0;
      this.ui.streak(0);
      this.sounds.bump();
      const p = s.b.alive ? s.b.p : this.ring;
      const close = s.near || (s.touched && p.y > 0.4);
      // a near miss is said at the ring (where you were looking), a plain miss where it fell
      if (close) this.popAt(this.t.copy(this.ring).setY(this.ring.y + HOOP_R + 0.12), 'So close!', 'close');
      else this.popAt(this.t.copy(p).setY(Math.max(0.3, p.y + 0.25)), 'Miss', 'miss');
      const a = this.host.stage.actor;
      if (a.scripted === 0) a.face('surprised', 0.7);
    }
  }

  private moveRing(): void {
    this.from.copy(this.ring);
    this.pickSpot(this.to);
    this.moveT = 0;
    this.standBeside();
    const st = this.host.stage;
    // his magic: a sparkle stream from his to the ring's new place
    st.fx.emit({ count: this.host.reduced ? 8 : 16, glyph: ['sparkle', 'star'], colors: [PAL.pink, PAL.yellow, PAL.white], at: this.ring, ring: HOOP_R, life: [0.5, 0.8], size: [0.05, 0.09], drag: 2, vel: [0, 0.3, 0] });
  }

  /** He walks to his spot beside the ring, then faces you. */
  walk(dt: number): void {
    const a = this.host.stage.actor;
    const dx = this.stand.x - a.position.x, dz = this.stand.z - a.position.z, d = Math.hypot(dx, dz);
    if (d > 0.08 && a.scripted === 0) {
      const k = Math.min(1, d * 1.6);
      this.v.set((dx / d) * k, 0, (dz / d) * k);
      a.drive(this.v, dt, (p) => this.host.constrain(p));
    } else {
      a.drive(this.zero, dt);
      if (!a.walking && a.scripted === 0 && !this.host.runner.busy) a.turnToPoint(this.host.stage.cam, dt, 4);
    }
  }

  protected visuals(dt: number): void {
    const kit = this.host.kit, h = kit.hoop;
    const live = this.state !== 'idle' && !(this.state === 'won' || this.state === 'over');
    this.ringK = Math.max(0, Math.min(1, this.ringK + dt * (live ? 2.5 : -2)));
    if (this.moveT < 1) {
      this.moveT = Math.min(1, this.moveT + dt / (this.host.reduced ? 0.45 : 0.8));
      const k = this.moveT < 0.5 ? 2 * this.moveT * this.moveT : 1 - Math.pow(-2 * this.moveT + 2, 2) / 2;
      this.ring.lerpVectors(this.from, this.to, k);
      this.ring.y += Math.sin(this.moveT * Math.PI) * 0.35; // a hop over
    } else this.ring.copy(this.to);
    const tt = performance.now() / 1000;
    const bob = this.host.reduced ? 0.015 : 0.04;
    h.visible = this.ringK > 0.01;
    this.faceBasis(this.ring);
    h.position.copy(this.ring);
    h.position.y += Math.sin(tt * 1.6) * bob * (this.moveT >= 1 ? 1 : 0);
    h.rotation.set(0, Math.atan2(this.n.x, this.n.z), 0);
    const pop = this.ringK < 1 ? this.ringK * (1.12 - 0.12 * this.ringK) : 1;
    // a score flashes the ring (white, gold for a swish or the double heart) and gives it a little pulse
    this.flashK = Math.max(0, this.flashK - dt / (this.host.reduced ? 0.5 : 0.38));
    const fk = this.flashK * this.flashK;
    for (const band of kit.hoopBands) {
      const m = band.material as THREE.MeshStandardMaterial;
      if (fk > 0.001 || m.emissive.r > 0) m.emissive.setHex(this.flashGold ? PAL.yellow : 0xffffff).multiplyScalar(fk * 0.85);
    }
    const pulse = this.host.reduced ? 0 : Math.sin((1 - this.flashK) * Math.PI) * this.flashK * 0.14;
    h.scale.setScalar(Math.max(0.001, pop * (1 + pulse)));
    // the rim colliders follow the ring (only while it is fully there)
    const on = h.visible && this.ringK > 0.9;
    for (let i = 0; i < RIM_N; i++) {
      const s = kit.rim[i], ang = (i / RIM_N) * Math.PI * 2;
      s.on = on;
      s.r = HOOP_BAND;
      s.c.copy(h.position).addScaledVector(this.right, Math.cos(ang) * HOOP_R).addScaledVector(UP, Math.sin(ang) * HOOP_R);
    }
    // the heart in your hand (shown through the countdown and pauses; gone with the results)
    const show = this.state === 'countdown' || this.state === 'playing' || this.state === 'paused';
    if (this.hand) {
      if (!show) this.hand.empty();
      this.hand.update(dt, show, this.state === 'playing');
    }
  }

  /** The pause card's aim guide: the dotted arc while you swipe (Off / Short / Full, kept on this device). */
  protected pauseExtra(): HTMLElement | null {
    const wrap = document.createElement('div');
    wrap.className = 'cbp-aimset';
    const opts: [AimGuide, string][] = [['off', 'Off'], ['short', 'Short'], ['full', 'Full']];
    const cur = this.hand?.guide ?? readAimGuide();
    wrap.innerHTML = `<span id="cbp-aim-l">Aim guide</span><div class="cbp-seg" role="radiogroup" aria-labelledby="cbp-aim-l">${opts
      .map(([id, l]) => `<button type="button" role="radio" data-aim="${id}" aria-checked="${id === cur}">${l}</button>`).join('')}</div>`;
    wrap.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-aim]');
      if (!b) return;
      const g = b.dataset.aim as AimGuide;
      writeAimGuide(g);
      if (this.hand) this.hand.guide = g;
      wrap.querySelectorAll('[data-aim]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    return wrap;
  }

  protected summary(stars: number): { title: string; line: string } {
    const title = stars >= 3 ? 'Hoop hero!' : stars === 2 ? 'Great throwing!' : stars === 1 ? 'Nice throwing!' : 'Good try!';
    return { title, line: `${this.made} of ${BALLS} in · ${this.swishes} swish${this.swishes === 1 ? '' : 'es'}` };
  }

  protected clear(): void {
    this.shots.length = 0;
    const kit = this.host.kit;
    kit.hoop.visible = false;
    for (const r of kit.rim) r.on = false;
    for (const band of kit.hoopBands) (band.material as THREE.MeshStandardMaterial).emissive.setHex(0);
    this.hand?.dispose();
    this.hand = null;
  }
}
