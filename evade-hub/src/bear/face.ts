// The face layer: visemes + jaw, expressions, blinking, eye look and small idle "life".
// It writes morph target influences and the CB_* eye/lid/lash bones AFTER the body mixer has run, and the body clips
// never touch either (no morph tracks, no tracks on those bones), so the face and the body never fight.
import * as THREE from 'three';
import type { BearExpression, Viseme, VisemeFrame } from '../shared/contracts';
import { VISEMES } from '../shared/contracts';

export interface RigInfo {
  lidClose: { L: number; R: number };
  lashClose: { L: number; R: number };
  lashPush: number;
  eyeLimits: { yaw: number; pitch: number };
  visemeJaw: Partial<Record<Viseme, number>>;
}

const DEFAULT_RIG: RigInfo = {
  lidClose: { L: 1.8, R: 1.8 },
  lashClose: { L: 1.15, R: 1.15 },
  lashPush: 0.12,
  eyeLimits: { yaw: 0.45, pitch: 0.3 },
  visemeJaw: { aa: 0.62, E: 0.34, I: 0.2, O: 0.42, U: 0.16, PP: 0, FF: 0.06, TH: 0.16, DD: 0.22, kk: 0.26, CH: 0.16, SS: 0.08, nn: 0.13, RR: 0.16 },
};

type Shapes = Record<string, number>;
interface ExpressionDef {
  shapes: Shapes;
  /** Extra lid closure 0..1 per side. */
  lid?: [number, number];
  /** How much of the mouth part survives while she talks (0..1). */
  talkKeep?: number;
}

const both = (name: string, w: number): Shapes => ({ [name + 'Left']: w, [name + 'Right']: w });

/** Expressions as ARKit shape weights (all well inside the range where the shapes are clean). */
export const EXPRESSIONS: Record<BearExpression, ExpressionDef> = {
  neutral: { shapes: { ...both('mouthSmile', 0.14), ...both('cheekSquint', 0.08) }, talkKeep: 0.8 },
  happy: {
    shapes: { ...both('mouthSmile', 0.55), ...both('cheekSquint', 0.55), ...both('eyeSquint', 0.25), browInnerUp: 0.15 },
    lid: [0.12, 0.12],
    talkKeep: 0.7,
  },
  surprised: {
    shapes: { ...both('eyeWide', 0.85), browInnerUp: 0.8, ...both('browOuterUp', 0.75), jawOpen: 0.22, mouthFunnel: 0.35 },
    talkKeep: 0.3,
  },
  sleepy: { shapes: { ...both('browDown', 0.25), ...both('mouthSmile', 0.1), browInnerUp: 0.2 }, lid: [0.55, 0.55], talkKeep: 0.8 },
  cold: {
    shapes: { browInnerUp: 0.75, ...both('mouthStretch', 0.45), ...both('mouthFrown', 0.3), ...both('mouthPress', 0.25), ...both('eyeSquint', 0.2) },
    lid: [0.1, 0.1],
    talkKeep: 0.4,
  },
  wink: {
    shapes: { mouthSmileLeft: 0.6, mouthSmileRight: 0.3, cheekSquintLeft: 0.65, browDownLeft: 0.2, browOuterUpRight: 0.25 },
    lid: [1, 0],
    talkKeep: 0.7,
  },
  love: { shapes: { ...both('mouthSmile', 0.55), ...both('cheekSquint', 0.55) }, lid: [0.1, 0.1], talkKeep: 0.4 },
  excited: { shapes: { ...both('mouthSmile', 0.6), browInnerUp: 0.3 }, talkKeep: 0.4 },
};

/** Shapes that belong to the mouth (scaled down while talking so visemes read clearly). */
const MOUTH = /^(mouth|jaw|tongue|cheekPuff)/;

interface MorphSlot {
  mesh: THREE.Mesh;
  index: number;
}

interface EyeBones {
  eye: THREE.Bone;
  lid: THREE.Bone;
  lash: THREE.Bone;
  eyeQ: THREE.Quaternion;
  lidQ: THREE.Quaternion;
  lashQ: THREE.Quaternion;
  lashS: THREE.Vector3;
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();

export class FaceRig {
  readonly rig: RigInfo;
  private slots = new Map<string, MorphSlot[]>();
  private weights = new Map<string, number>();
  private eyes: Record<'L' | 'R', EyeBones> | null = null;

  // visemes (already smoothed by the engine or the Bear)
  private vis: Partial<Record<Viseme, number>> = {};
  private talk = 0;

  // expressions: current blend weights per expression
  private expr: Record<BearExpression, number> = { neutral: 1, happy: 0, surprised: 0, sleepy: 0, cold: 0, wink: 0, love: 0, excited: 0 };
  private exprTarget: BearExpression = 'neutral';
  private exprHold = 0;

  // blinking
  private blinkT = -1;
  private nextBlink = 1.5;
  private doubleBlink = false;
  /** Extra lid closure requested by the body (sleep), 0..1, smoothed. */
  sleepLid = 0;
  private sleepLidNow = 0;

  // eyes
  private lookYaw = 0;
  private lookPitch = 0;
  private sacYaw = 0;
  private sacPitch = 0;
  private nextSaccade = 1;
  private time = 0;
  private browLife = 0;
  private browLifeTarget = 0;
  private nextBrow = 3;

  constructor(root: THREE.Object3D, rig?: Partial<RigInfo>) {
    this.rig = { ...DEFAULT_RIG, ...rig, visemeJaw: { ...DEFAULT_RIG.visemeJaw, ...(rig?.visemeJaw ?? {}) } };
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences) {
        for (const [name, index] of Object.entries(m.morphTargetDictionary)) {
          let arr = this.slots.get(name);
          if (!arr) this.slots.set(name, (arr = []));
          arr.push({ mesh: m, index });
        }
      }
    });
    const bone = (n: string) => root.getObjectByName(n) as THREE.Bone | undefined;
    const mk = (s: 'L' | 'R'): EyeBones | null => {
      const eye = bone(`CB_Eye_${s}`);
      const lid = bone(`CB_Lid_${s}`);
      const lash = bone(`CB_Lash_${s}`);
      if (!eye || !lid || !lash) return null;
      return {
        eye, lid, lash,
        eyeQ: eye.quaternion.clone(), lidQ: lid.quaternion.clone(), lashQ: lash.quaternion.clone(), lashS: lash.scale.clone(),
      };
    };
    const L = mk('L');
    const R = mk('R');
    if (L && R) this.eyes = { L, R };
  }

  /** Morph target names present on the model (for the shape test). */
  get shapeNames(): string[] {
    return [...this.slots.keys()];
  }

  has(name: string): boolean {
    return this.slots.has(name);
  }

  setExpression(e: BearExpression, hold?: number): void {
    this.exprTarget = e;
    this.exprHold = hold && hold > 0 ? hold : 0;
  }

  get expression(): BearExpression {
    return this.exprTarget;
  }

  setVisemes(frame: VisemeFrame | null): void {
    this.vis = frame?.weights ?? {};
  }

  /** 0..1 how much she is talking (smoothed by the Bear); scales expressions' mouth parts down. */
  setTalk(t: number): void {
    this.talk = t;
  }

  /** Request an immediate blink (e.g. on a big expression change). */
  blink(): void {
    if (this.blinkT < 0) this.blinkT = 0;
  }

  /** Overrides for the shape test: name -> weight, or null to return to normal driving. */
  override: Shapes | null = null;
  /** Manual lid closure for tests (null = automatic). */
  lidOverride: number | null = null;

  update(dt: number, look: { yaw: number; pitch: number } | null): void {
    this.time += dt;
    const w = this.weights;
    w.clear();
    const add = (n: string, v: number) => w.set(n, (w.get(n) ?? 0) + v);

    if (this.override) {
      for (const [n, v] of Object.entries(this.override)) add(n, v);
      this.writeMorphs();
      this.updateEyes(dt, look, this.lidOverride ?? 0, this.lidOverride ?? 0);
      return;
    }

    // ---- expressions: ease toward the target (about 0.25 s), hold then return to neutral
    if (this.exprHold > 0) {
      this.exprHold -= dt;
      if (this.exprHold <= 0) this.exprTarget = 'neutral';
    }
    const ek = 1 - Math.exp(-dt / 0.12);
    let lidL = 0;
    let lidR = 0;
    for (const name of Object.keys(this.expr) as BearExpression[]) {
      const tgt = name === this.exprTarget ? 1 : 0;
      this.expr[name] += (tgt - this.expr[name]) * ek;
      const amt = this.expr[name];
      if (amt < 0.001) continue;
      const def = EXPRESSIONS[name];
      const keep = 1 - this.talk * (1 - (def.talkKeep ?? 0.6));
      for (const [s, v] of Object.entries(def.shapes)) add(s, v * amt * (MOUTH.test(s) ? keep : 1));
      if (def.lid) {
        lidL += def.lid[0] * amt;
        lidR += def.lid[1] * amt;
      }
    }

    // ---- idle life: an occasional small brow raise, more while talking
    this.nextBrow -= dt;
    if (this.nextBrow <= 0) {
      this.browLifeTarget = this.browLifeTarget > 0 ? 0 : 0.15 + Math.random() * (0.2 + this.talk * 0.25);
      this.nextBrow = this.browLifeTarget > 0 ? 0.6 + Math.random() * 0.8 : 2 + Math.random() * 4;
    }
    this.browLife += (this.browLifeTarget - this.browLife) * (1 - Math.exp(-dt / 0.18));
    add('browInnerUp', this.browLife * 0.7);
    add('browOuterUpLeft', this.browLife * 0.5);
    add('browOuterUpRight', this.browLife * 0.5);

    // ---- visemes: lips from viseme_* targets, jaw from each viseme's jaw share
    let jaw = 0;
    for (const v of VISEMES) {
      const x = this.vis[v] ?? 0;
      if (x <= 0) continue;
      add('viseme_' + v, x);
      jaw += x * (this.rig.visemeJaw[v] ?? 0);
    }
    add('jawOpen', jaw);

    this.writeMorphs();

    // ---- lids: blink + expression + sleep
    this.sleepLidNow += (this.sleepLid - this.sleepLidNow) * (1 - Math.exp(-dt / 0.35));
    const b = this.updateBlink(dt);
    const lo = this.lidOverride;
    const L = lo ?? Math.min(1, Math.max(b, lidL, this.sleepLidNow));
    const R = lo ?? Math.min(1, Math.max(b, lidR, this.sleepLidNow));
    this.updateEyes(dt, look, L, R);
  }

  private writeMorphs(): void {
    for (const [name, slots] of this.slots) {
      let v = this.weights.get(name) ?? 0;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      for (const s of slots) s.mesh.morphTargetInfluences![s.index] = v;
    }
  }

  private updateBlink(dt: number): number {
    if (this.blinkT < 0) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkT = 0;
        this.doubleBlink = Math.random() < 0.15;
      }
      return 0;
    }
    this.blinkT += dt;
    // close 70 ms, hold 40 ms, open 140 ms
    const t = this.blinkT;
    let b: number;
    if (t < 0.07) b = easeIn(t / 0.07);
    else if (t < 0.11) b = 1;
    else if (t < 0.25) b = 1 - easeOut((t - 0.11) / 0.14);
    else {
      b = 0;
      if (this.doubleBlink) {
        this.doubleBlink = false;
        this.blinkT = 0;
        return 0;
      }
      this.blinkT = -1;
      // Blink a little more often while talking, like people do.
      this.nextBlink = 1.8 + Math.random() * (this.talk > 0.5 ? 2.5 : 4);
    }
    return b;
  }

  private updateEyes(dt: number, look: { yaw: number; pitch: number } | null, lidL: number, lidR: number): void {
    if (!this.eyes) return;
    // idle saccades: small glances; fewer when looking at something
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      const amp = look ? 0.04 : 0.14;
      this.sacYaw = (Math.random() * 2 - 1) * amp;
      this.sacPitch = (Math.random() * 2 - 1) * amp * 0.5;
      this.nextSaccade = 0.8 + Math.random() * 2.4;
    }
    const lim = this.rig.eyeLimits;
    const ty = THREE.MathUtils.clamp((look?.yaw ?? 0) + this.sacYaw, -lim.yaw, lim.yaw);
    const tp = THREE.MathUtils.clamp((look?.pitch ?? 0) + this.sacPitch, -lim.pitch, lim.pitch);
    const k = 1 - Math.exp(-dt / 0.045); // saccades are fast
    this.lookYaw += (ty - this.lookYaw) * k;
    this.lookPitch += (tp - this.lookPitch) * k;
    for (const s of ['L', 'R'] as const) {
      const e = this.eyes[s];
      const lid = s === 'L' ? lidL : lidR;
      e.eye.quaternion.copy(e.eyeQ).multiply(_q.setFromAxisAngle(Y, this.lookYaw)).multiply(_q2.setFromAxisAngle(X, this.lookPitch));
      // Lids follow the eye a little when looking down (a natural, softer look).
      const lidAngle = this.rig.lidClose[s] * lid + Math.max(0, this.lookPitch) * 0.3 * (1 - lid);
      e.lid.quaternion.copy(e.lidQ).multiply(_q.setFromAxisAngle(X, lidAngle));
      e.lash.quaternion.copy(e.lashQ).multiply(_q.setFromAxisAngle(X, this.rig.lashClose[s] * lid));
      e.lash.scale.copy(e.lashS).multiplyScalar(1 + this.rig.lashPush * lid);
    }
  }

  /** Put every morph and the eye bones back to rest. */
  reset(): void {
    for (const slots of this.slots.values()) for (const s of slots) s.mesh.morphTargetInfluences![s.index] = 0;
    if (this.eyes) {
      for (const s of ['L', 'R'] as const) {
        const e = this.eyes[s];
        e.eye.quaternion.copy(e.eyeQ);
        e.lid.quaternion.copy(e.lidQ);
        e.lash.quaternion.copy(e.lashQ);
        e.lash.scale.copy(e.lashS);
      }
    }
    void _v;
  }
}

const easeIn = (x: number) => x * x;
const easeOut = (x: number) => 1 - (1 - x) * (1 - x);
