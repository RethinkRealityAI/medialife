// What your face is doing, read from the engine's face data, gated so only deliberate gestures count (immersive skill,
// "Face triggers" / "From Bobo Booth": the engine's own flags are twitchy on real phones; talking, a toothy smile or a
// head shake must not fire anything).
//
//   smile      mouth corners wider and higher than YOUR resting face (calibrated for ~1.2 s after the face is found,
//              then slowly re-learned while you are neutral). On after 400 ms over the threshold, off below 60 % of it.
//   mouthWide  own lip gap (upperLip - lowerLip) > 0.2 face units (~28 mm, a wide "O"), held 350 ms; the engine's
//              `mouthopened` alone is not enough. Off below 75 % of the threshold (hysteresis).
//   browsUp    both eyebrows raised (engine flags) held 450 ms.
//   wink       the engine's left/right wink events, only while the head is steady and the mouth is not wide open.
//   roll       head tilt in screen space (radians, + = towards the screen's left), smoothed, with a dead zone.
// Every trick needs: face found for 1.5 s, a steady head (< ~60 deg/s). URL tuning on a phone: ?smile=0.07 &mouthgap=0.2.
// `diag` keeps the numbers seen so a phone test gives real thresholds.
import * as THREE from 'three';

type P = { x: number; y: number; z: number };
type Points = Record<string, { position: P } | undefined>;

const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const num = (k: string, d: number) => {
  const v = parseFloat(qs.get(k) ?? '');
  return Number.isFinite(v) ? v : d;
};

export const SMILE_ON = num('smile', 0.07);
export const MOUTH_GAP = num('mouthgap', 0.2);
const WARM_MS = 1500;
const CALIBRATE_MS = 1200;
const STEADY = 1.05; // rad/s
const ROLL_DEAD = 0.1;
const ROLL_MAX = 0.4;

export type FaceCue = 'smile' | 'smileOff' | 'mouth' | 'mouthOff' | 'wink' | 'brows';

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export class FaceSignals {
  smile = false;
  mouthWide = false;
  browsUp = false;
  /** Smoothed head roll (screen space, radians, dead zone applied). */
  roll = 0;
  /** Test hooks: a fixed roll / smile / mouth instead of the measured ones (null = measured). */
  rollOverride: number | null = null;
  forced: { smile: boolean | null; mouth: boolean | null } = { smile: null, mouth: null };
  steady = false;
  private foundAt = 0;
  private lastAt = 0;
  private prevQ = new THREE.Quaternion();
  private hasPrev = false;
  private spin = 0;
  private base = { ratio: 0, lift: 0, n: 0 };
  private smileT = 0;
  private mouthT = 0;
  private browL = false;
  private browR = false;
  private browT = 0;
  private browAt = 0;
  private winkAt = 0;
  private rollRaw = 0;
  private up = new THREE.Vector3();
  readonly diag = { smileScore: 0, smileMax: 0, gap: 0, gapMax: 0, spin: 0, roll: 0, calibrated: false, cues: {} as Record<string, number> };

  constructor(private emit: (cue: FaceCue) => void) {}

  reset(): void {
    this.forced = { smile: null, mouth: null };
    this.foundAt = 0;
    this.hasPrev = false;
    this.base = { ratio: 0, lift: 0, n: 0 };
    this.diag.calibrated = false;
    if (this.smile) this.set('smile', false);
    if (this.mouthWide) this.set('mouth', false);
    this.browL = this.browR = this.browsUp = false;
    this.smileT = this.mouthT = this.browT = 0;
    this.roll = this.rollRaw = 0;
  }

  /** Every `faceupdated` (and `facefound`). */
  update(detail: { transform?: { rotation: { x: number; y: number; z: number; w: number } }; attachmentPoints?: Points }, now: number): void {
    const t = detail?.transform;
    if (!t) return;
    if (!this.foundAt) this.foundAt = now;
    const dt = this.lastAt ? Math.min(0.25, Math.max(0.001, (now - this.lastAt) / 1000)) : 0.033;
    this.lastAt = now;
    const q = new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    if (this.hasPrev) this.spin += (this.prevQ.angleTo(q) / dt - this.spin) * 0.25;
    this.prevQ.copy(q);
    this.hasPrev = true;
    this.steady = this.spin < STEADY;
    this.diag.spin = +this.spin.toFixed(2);

    // head roll: the face's up vector on the screen plane (the display is mirrored, and so is the transform)
    this.up.set(0, 1, 0).applyQuaternion(q);
    const raw = Math.atan2(-this.up.x, this.up.y);
    this.rollRaw += (raw - this.rollRaw) * (1 - Math.exp(-dt / 0.12));
    const r = Math.abs(this.rollRaw) < ROLL_DEAD ? 0 : Math.sign(this.rollRaw) * Math.min(ROLL_MAX, Math.abs(this.rollRaw) - ROLL_DEAD);
    this.roll = this.rollOverride ?? r;
    this.diag.roll = +this.rollRaw.toFixed(3);

    const ap = detail.attachmentPoints;
    if (!ap) return;
    const warm = now - this.foundAt > WARM_MS;

    // ---- mouth wide open (own measure, held, steady)
    const ul = ap.upperLip?.position, ll = ap.lowerLip?.position;
    if (ul && ll) {
      const gap = dist(ul, ll);
      this.diag.gap = +gap.toFixed(3);
      this.diag.gapMax = Math.max(this.diag.gapMax, this.diag.gap);
      const over = gap > (this.mouthWide ? MOUTH_GAP * 0.75 : MOUTH_GAP);
      if (this.forced.mouth !== null) { /* test hook holds it */ } else if (!this.mouthWide) {
        if (over && warm && this.steady) {
          if (!this.mouthT) this.mouthT = now;
          else if (now - this.mouthT > 350) this.set('mouth', true);
        } else this.mouthT = 0;
      } else if (!over) {
        this.mouthT = 0;
        this.set('mouth', false);
      }
    }

    // ---- smile against your own resting face
    const cl = ap.mouthLeftCorner?.position, cr = ap.mouthRightCorner?.position;
    const el = ap.leftEye?.position, er = ap.rightEye?.position, mc = ap.mouth?.position;
    if (cl && cr && el && er) {
      const eye = Math.max(1e-4, dist(el, er));
      const ratio = dist(cl, cr) / eye;
      const mid = mc ?? (ul && ll ? { x: (ul.x + ll.x) / 2, y: (ul.y + ll.y) / 2, z: (ul.z + ll.z) / 2 } : null);
      const lift = mid ? ((cl.y + cr.y) / 2 - mid.y) / eye : 0;
      const b = this.base;
      if (now - this.foundAt < CALIBRATE_MS) {
        // calibrate on the resting face
        b.n++;
        b.ratio += (ratio - b.ratio) / b.n;
        b.lift += (lift - b.lift) / b.n;
        return;
      }
      if (!this.diag.calibrated) this.diag.calibrated = b.n > 3;
      if (!b.n) return;
      const score = (ratio - b.ratio) / Math.max(1e-4, b.ratio) + 1.5 * (lift - b.lift);
      this.diag.smileScore = +score.toFixed(3);
      this.diag.smileMax = Math.max(this.diag.smileMax, this.diag.smileScore);
      // re-learn the resting face slowly while clearly neutral (people change their resting face / distance)
      if (!this.smile && score < SMILE_ON * 0.4 && !this.mouthWide) {
        const k = 1 - Math.exp(-dt / 10);
        b.ratio += (ratio - b.ratio) * k;
        b.lift += (lift - b.lift) * k;
      }
      if (this.forced.smile !== null) { /* test hook holds it */ } else if (!this.smile) {
        if (score > SMILE_ON && warm && this.steady && !this.mouthWide) {
          if (!this.smileT) this.smileT = now;
          else if (now - this.smileT > 400) this.set('smile', true);
        } else this.smileT = 0;
      } else if (score < SMILE_ON * 0.6 || this.mouthWide) {
        this.smileT = 0;
        this.set('smile', false);
      }
    }

    // ---- both eyebrows up, held
    if (this.browL && this.browR && warm && this.steady && !this.mouthWide) {
      if (!this.browT) this.browT = now;
      else if (now - this.browT > 450 && now - this.browAt > 2200) {
        this.browAt = now;
        this.browT = now + 1e9;
        this.cue('brows');
      }
    } else if (!(this.browL && this.browR)) this.browT = 0;
    this.browsUp = this.browL && this.browR;
  }

  /** The engine's own face events (`lefteyewinked`, `lefteyebrowraised`...). */
  event(name: string, now: number): void {
    switch (name) {
      case 'lefteyewinked':
      case 'righteyewinked':
        if (this.foundAt && now - this.foundAt > WARM_MS && this.steady && !this.mouthWide && now - this.winkAt > 1200) {
          this.winkAt = now;
          this.cue('wink');
        }
        break;
      case 'lefteyebrowraised': this.browL = true; break;
      case 'righteyebrowraised': this.browR = true; break;
      case 'lefteyebrowlowered': this.browL = false; break;
      case 'righteyebrowlowered': this.browR = false; break;
    }
  }

  lost(): void {
    this.reset();
  }

  /** Test hook: act as if the gesture happened (goes through the same reactions; no gates). */
  fire(cue: FaceCue): void {
    if (cue === 'smile' || cue === 'smileOff') {
      this.forced.smile = cue === 'smile' ? true : null;
      this.set('smile', cue === 'smile');
    } else if (cue === 'mouth' || cue === 'mouthOff') {
      this.forced.mouth = cue === 'mouth' ? true : null;
      this.set('mouth', cue === 'mouth');
    } else this.cue(cue);
  }

  private set(which: 'smile' | 'mouth', on: boolean): void {
    if (which === 'smile') {
      if (this.smile === on) return;
      this.smile = on;
      this.cue(on ? 'smile' : 'smileOff');
    } else {
      if (this.mouthWide === on) return;
      this.mouthWide = on;
      this.cue(on ? 'mouth' : 'mouthOff');
    }
  }

  private cue(c: FaceCue): void {
    this.diag.cues[c] = (this.diag.cues[c] ?? 0) + 1;
    this.emit(c);
  }
}
