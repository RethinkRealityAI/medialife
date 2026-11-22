// Bobo, EVADE's cat, as the hub's character (the same BearCharacter contract the experience was built on, so every
// mode, game and moment drives him unchanged). Body: the Roblox-rigged catbobo.glb (Sit / Walk / Excited / Sleep /
// Chill) plus the animation-only bobo-clips.glb (Idle / Run / Alert / Purr), which binds to the same skeleton by bone
// name (the activated-retail display, the creators page and Where is Bobo? use the same pair).
//
// Bobo is a 3D cat: no face canvas, no lip sync, no voice. say() resolves at once, setVisemes / setSpeechStream do
// nothing. Expressions become little body beats (an ear flick, a head tilt); lookAt turns his head a little.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { BearCharacter, BearClip, BearExpression, VisemeFrame } from '../../shared/contracts';

export const BOBO_MODEL_URL = '/roblox/activated-retail/models/catbobo.glb';
export const BOBO_CLIPS_URL = '/evade/creators/assets/models/bobo-clips.glb';

/** Bobo's own moves, by their clip names (the Actions sheet and the moments play these). */
export type BoboMove = 'Idle' | 'Walk' | 'Run' | 'Sit' | 'Chill' | 'Sleep' | 'Excited' | 'Alert' | 'Purr';

/** Logical clip -> Bobo clip (first found wins), whether it loops, and a playback speed. */
const CLIP_MAP: Record<BearClip, { names: BoboMove[]; loop: boolean; speed?: number }> = {
  idle: { names: ['Idle', 'Chill'], loop: true },
  talkIdle: { names: ['Idle', 'Chill'], loop: true },
  wave: { names: ['Excited'], loop: false },
  walk: { names: ['Walk'], loop: true },
  run: { names: ['Run', 'Walk'], loop: true },
  dance: { names: ['Excited'], loop: true },
  cheer: { names: ['Excited'], loop: false },
  sway: { names: ['Purr', 'Chill'], loop: true },
  present: { names: ['Alert', 'Excited'], loop: false },
  sleep: { names: ['Sleep'], loop: true },
  wakeUp: { names: ['Alert', 'Excited'], loop: false },
  shiver: { names: ['Alert'], loop: false, speed: 1.6 },
};

export interface LoadBoboOptions {
  onProgress?: (p: number) => void;
  /** Height of `object` at scale 1 (the actor normalises it to 1 unit anyway). */
  height?: number;
}

let sharedLoader: GLTFLoader | null = null;
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
/** The contract wants +z. */
const MODEL_YAW = 0; // catbobo.glb faces +z once its clips play (checked in a render)

export class Bobo implements BearCharacter {
  readonly object: THREE.Group;
  readonly height: number;
  readonly clipNames: string[];
  readonly speaking = false;
  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentOnce = false;
  private loopName: string = 'Idle';
  private loopSpeed = 1;
  private onceResolvers: Array<() => void> = [];
  private head: THREE.Object3D | null = null;
  private ears: THREE.Object3D[] = [];
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0;
  private headPitch = 0;
  private flick = 0;
  private flickT = 3 + Math.random() * 3;
  private tilt = 0;
  private tiltTo = 0;
  private tiltUntil = 0;

  static async load(opts: LoadBoboOptions = {}): Promise<Bobo> {
    if (!sharedLoader) sharedLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    let a = 0, b = 0;
    const tick = () => opts.onProgress?.(Math.min(0.99, a * 0.85 + b * 0.15));
    const [body, extra] = await Promise.all([
      sharedLoader.loadAsync(BOBO_MODEL_URL, (e) => { if (e.total) { a = e.loaded / e.total; tick(); } }),
      sharedLoader.loadAsync(BOBO_CLIPS_URL, (e) => { if (e.total) { b = e.loaded / e.total; tick(); } }).catch((e) => {
        console.warn('[bobo] extra clips did not load; Idle/Run/Alert/Purr fall back', e);
        return null;
      }),
    ]);
    opts.onProgress?.(1);
    return new Bobo(body.scene, body.animations, extra?.animations ?? [], opts);
  }

  constructor(model: THREE.Object3D, own: THREE.AnimationClip[], extra: THREE.AnimationClip[], opts: LoadBoboOptions = {}) {
    this.model = model;
    this.object = new THREE.Group();
    this.object.name = 'Bobo';

    // Bone and mesh nodes share names in this export (BackLeg the bone, BackLeg the mesh). The loader makes names
    // unique (one of each pair gets "_1"), so the extra clips could bind to a mesh. Give every bone its plain name,
    // every mesh a "-mesh" one, and rename the model's own tracks to match.
    const rename = new Map<string, string>();
    model.traverse((o) => {
      const base = o.name.replace(/_\d+$/, '');
      if ((o as THREE.Bone).isBone) {
        if (o.name !== base) rename.set(o.name, base);
        o.name = base;
      } else if ((o as THREE.Mesh).isMesh) {
        o.name = base + '-mesh';
        o.frustumCulled = false; // skinned bounds are the bind pose
        const mats = ([] as THREE.Material[]).concat((o as THREE.Mesh).material);
        for (const m of mats) {
          const s = m as THREE.MeshStandardMaterial;
          if ('envMapIntensity' in s) s.envMapIntensity = 0.9;
        }
      }
    });
    const boneNames = new Set<string>();
    model.traverse((o) => { if ((o as THREE.Bone).isBone) boneNames.add(o.name); });
    const fix = (clip: THREE.AnimationClip) => {
      for (const t of clip.tracks) {
        const dot = t.name.indexOf('.');
        const node = t.name.slice(0, dot);
        const base = node.replace(/_\d+$/, '');
        if (rename.has(node)) t.name = rename.get(node)! + t.name.slice(dot);
        else if (base !== node && boneNames.has(base)) t.name = base + t.name.slice(dot); // the clips file's own "_1"s
      }
      return clip;
    };

    // fit: `height` tall, feet on y = 0, centred, facing +z (measured in the bind pose)
    this.height = opts.height ?? 1;
    const inner = new THREE.Group();
    inner.rotation.y = MODEL_YAW;
    inner.add(model);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const s = this.height / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(s);
    model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    this.object.add(inner);

    this.mixer = new THREE.AnimationMixer(model);
    const all = [...own.map(fix), ...extra.map(fix)];
    const names: string[] = [];
    for (const clip of all) {
      if (this.actions.has(clip.name)) continue;
      // the clips move HRP (the root) up and down a little: keep that, it's the body bob
      const act = this.mixer.clipAction(clip);
      this.actions.set(clip.name, act);
      names.push(clip.name);
    }
    this.clipNames = names;
    this.mixer.addEventListener('finished', (e) => {
      const ev = e as unknown as { action: THREE.AnimationAction };
      if (ev.action !== this.current || !this.currentOnce) return;
      this.currentOnce = false;
      this.fadeTo(this.loopName, true, 0.3, this.loopSpeed);
      this.onceResolvers.splice(0).forEach((f) => f());
    });

    model.traverse((o) => {
      if (!(o as THREE.Bone).isBone) return;
      if (o.name === 'CatHead') this.head = o;
      if (o.name === 'Ear' || o.name === 'Ear2') this.ears.push(o);
    });

    this.fadeTo('Idle', true, 0, 1);
  }

  // ------------------------------------------------------------------ body
  play(clip: BearClip, opts: { once?: boolean; fade?: number; speed?: number } = {}): void {
    const spec = CLIP_MAP[clip];
    const name = spec.names.find((n) => this.actions.has(n)) ?? 'Idle';
    const once = opts.once ?? !spec.loop;
    this.playMove(name as BoboMove, { once, fade: opts.fade, speed: (opts.speed ?? 1) * (spec.speed ?? 1) * (clip === 'run' && name === 'Walk' ? 1.7 : 1) });
  }

  /** One of Bobo's own clips by name (Sit, Chill, Purr, Alert...). Loops unless `once`. */
  playMove(name: BoboMove, opts: { once?: boolean; fade?: number; speed?: number } = {}): void {
    if (!this.actions.has(name)) return;
    const once = opts.once ?? false;
    if (!once) {
      this.loopName = name;
      this.loopSpeed = opts.speed ?? 1;
      // finishing a pending "once" early: let its waiters go
      if (this.currentOnce) { this.currentOnce = false; this.onceResolvers.splice(0).forEach((f) => f()); }
    }
    this.fadeTo(name, !once, opts.fade ?? 0.3, opts.speed ?? 1);
    if (once) this.currentOnce = true;
  }

  hasMove(name: string): boolean {
    return this.actions.has(name);
  }

  private fadeTo(name: string, loop: boolean, fade: number, speed: number): void {
    const a = this.actions.get(name);
    if (!a) return;
    const prev = this.current;
    if (prev === a && loop && a.loop === THREE.LoopRepeat && a.isRunning()) { a.timeScale = speed; return; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.setEffectiveWeight(1);
    a.play();
    if (prev && prev !== a) { if (fade > 0) prev.crossFadeTo(a, fade, false); else prev.stop(); }
    this.current = a;
  }

  whenClipDone(): Promise<void> {
    if (!this.current || !this.currentOnce) return Promise.resolve();
    return new Promise((r) => this.onceResolvers.push(r));
  }

  /** No face: an expression is a little beat (ears flick, head tilts). */
  setExpression(e: BearExpression, opts?: { hold?: number }): void {
    if (e === 'neutral') { this.tiltTo = 0; return; }
    this.flick = 1;
    this.tiltTo = e === 'surprised' || e === 'excited' ? 0.22 : e === 'sleepy' ? -0.12 : e === 'love' || e === 'happy' ? 0.14 : 0.08;
    this.tiltUntil = performance.now() + (opts?.hold ?? 1.2) * 1000;
  }

  /** Bobo doesn't talk. */
  setVisemes(_frame: VisemeFrame | null): void { /* no mouth */ }
  setSpeechStream(_stream: MediaStream | null): void { /* no voice */ }
  say(_audioUrl: string): Promise<void> { return Promise.resolve(); }

  lookAt(target: THREE.Vector3 | null): void {
    this.lookTarget = target ? (this.lookTarget ?? new THREE.Vector3()).copy(target) : null;
  }

  update(dt: number): void {
    this.mixer.update(dt);
    // head: turn a little towards the look target (after the clip has posed it)
    let yaw = 0, pitch = 0;
    if (this.lookTarget && this.head) {
      this.object.updateMatrixWorld(true);
      const local = _v.copy(this.lookTarget).applyMatrix4(_m.copy(this.object.matrixWorld).invert());
      const hy = 0.75; // head height (object units, roughly)
      yaw = THREE.MathUtils.clamp(Math.atan2(local.x, Math.max(0.05, local.z)), -0.6, 0.6);
      pitch = THREE.MathUtils.clamp(Math.atan2(local.y - hy, Math.hypot(local.x, local.z)), -0.3, 0.35);
      if (local.z < 0) { yaw = 0; pitch = 0; }
    }
    const k = 1 - Math.exp(-6 * dt);
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
    if (performance.now() > this.tiltUntil) this.tiltTo = 0;
    this.tilt += (this.tiltTo - this.tilt) * k;
    if (this.head) {
      // the model is turned 180° inside `object`, so its local yaw is the same sign and pitch flips
      this.head.quaternion.multiply(_q.setFromAxisAngle(UP, this.headYaw));
      this.head.quaternion.multiply(_q.setFromAxisAngle(RIGHT, this.headPitch * 0.8));
      this.head.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 0, 1), this.tilt));
    }
    // ear flicks now and then (and on an expression)
    this.flickT -= dt;
    if (this.flickT <= 0) { this.flickT = 2.5 + Math.random() * 4; this.flick = 1; }
    if (this.flick > 0) {
      this.flick = Math.max(0, this.flick - dt * 4);
      const f = Math.sin(this.flick * Math.PI) * 0.35;
      this.ears.forEach((e, i) => e.quaternion.multiply(_q.setFromAxisAngle(RIGHT, i ? f : f * 0.7)));
    }
  }

  releaseRenderer(_renderer: THREE.WebGLRenderer): void {
    /* nothing renderer-specific is cached */
  }

  dispose(): void {
    this.onceResolvers.splice(0).forEach((f) => f());
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.object.removeFromParent();
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material)) {
        for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
        mat.dispose();
      }
    });
  }
}
