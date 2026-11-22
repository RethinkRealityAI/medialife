import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { BearCharacter, BearClip, BearExpression, VisemeFrame } from '../shared/contracts';
import { LipSyncEngine, type LipSyncConfig } from '../lipsync';
import { getAudioContext } from '../audio/context';
import { FaceRig, type RigInfo } from './face';

export interface LoadBearOptions {
  onProgress?: (p: number) => void;
  /** Model URL (default /models/cheer-bear.glb). */
  url?: string;
  /** Height in metres at scale 1 (default 1). */
  height?: number;
  /** Lip sync tunables (see src/lipsync/config.ts). */
  lipSync?: Partial<LipSyncConfig>;
}

/** Logical clip -> GLB clip names (first found wins) and whether it loops by default. */
const CLIP_MAP: Record<BearClip, { names: string[]; loop: boolean }> = {
  idle: { names: ['idle'], loop: true },
  talkIdle: { names: ['talkIdle', 'idle'], loop: true },
  wave: { names: ['wave'], loop: false },
  walk: { names: ['walk'], loop: true },
  run: { names: ['run', 'walk'], loop: true },
  dance: { names: ['dance'], loop: true },
  cheer: { names: ['cheer'], loop: false },
  sway: { names: ['sway'], loop: true },
  present: { names: ['present'], loop: false },
  sleep: { names: ['sleep'], loop: true },
  wakeUp: { names: ['wakeUp'], loop: false },
  shiver: { names: ['shiver'], loop: false },
};

/** Expression that goes with a clip while it plays (unless one was set explicitly). */
const CLIP_FACE: Partial<Record<BearClip, BearExpression>> = {
  cheer: 'happy', dance: 'happy', wave: 'happy', sway: 'happy', shiver: 'cold', present: 'happy',
};

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

let sharedLoader: GLTFLoader | null = null;

export class Bear implements BearCharacter {
  readonly object: THREE.Group;
  readonly height: number;
  readonly face: FaceRig;
  readonly lipSync: LipSyncEngine;
  /** Names of the clips in the model (including extras such as 'backflip', 'sad', 'angry'). */
  readonly clipNames: string[];

  private model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentClip: BearClip = 'idle';
  private currentOnce = false;
  private loopClip: BearClip = 'idle';
  private onceResolvers: Array<() => void> = [];
  private autoTalk = false;
  private talkTime = 0;
  private silentTime = 0;
  private explicitExpression: BearExpression | null = null;

  private manualFrame: VisemeFrame | null = null;
  private manualSmoothed: VisemeFrame = { weights: {}, amplitude: 0, speaking: false };
  private _speaking = false;
  private talk = 0;
  private amp = 0;
  private ampSlow = 0;
  private nod = 0;
  private nodV = 0;
  private time = Math.random() * 10;
  private sayToken = 0;
  private saySource: AudioBufferSourceNode | null = null;
  private bufferCache = new Map<string, Promise<AudioBuffer>>();

  private head: THREE.Object3D | null = null;
  private neck: THREE.Object3D | null = null;
  private spine: THREE.Object3D | null = null;
  /**
   * The clip pose of the bones we add rotations to, saved after each mixer update. three.js only writes a bone when
   * its animated value CHANGES (PropertyMixer.apply), so on a held or constant track an additive rotation would
   * otherwise be applied on top of last frame's result and accumulate. Restoring this before the mixer runs fixes it.
   */
  private additiveBase: Array<[THREE.Object3D, THREE.Quaternion]> = [];
  private eyeMid = new THREE.Object3D();
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0;
  private headPitch = 0;
  private disposed = false;

  static async load(opts: LoadBearOptions = {}): Promise<Bear> {
    if (!sharedLoader) {
      sharedLoader = new GLTFLoader();
      sharedLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    const gltf = await sharedLoader.loadAsync(opts.url ?? '/evade/hub/models/cheer-bear.glb', (e) => {
      if (e.total) opts.onProgress?.(Math.min(0.99, e.loaded / e.total));
    });
    opts.onProgress?.(1);
    return new Bear(gltf.scene, gltf.animations, opts);
  }

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], opts: LoadBearOptions = {}) {
    this.height = opts.height ?? 1;
    this.model = model;
    this.object = new THREE.Group();
    this.object.name = 'CheerBear';

    // Feet on y = 0, centred, `height` tall, facing +z (the model already faces +z).
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const s = this.height / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(s);
    model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    this.object.add(model);

    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        // Skinned bounds change with every clip; never cull the character.
        m.frustumCulled = false;
        m.castShadow = true;
      }
    });
    this.head = model.getObjectByName('mixamorigHead') ?? null;
    this.neck = model.getObjectByName('mixamorigNeck') ?? null;
    this.spine = model.getObjectByName('mixamorigSpine2') ?? null;
    for (const b of [this.head, this.neck, this.spine]) if (b) this.additiveBase.push([b, b.quaternion.clone()]);
    const eyeL = model.getObjectByName('CB_Eye_L');
    if (this.head && eyeL) {
      // A point between the eyes, riding on the head, for look-at maths.
      this.head.add(this.eyeMid);
      model.updateMatrixWorld(true);
      const p = eyeL.getWorldPosition(new THREE.Vector3());
      const pr = (model.getObjectByName('CB_Eye_R') ?? eyeL).getWorldPosition(new THREE.Vector3());
      this.eyeMid.position.copy(this.head.worldToLocal(p.add(pr).multiplyScalar(0.5)));
      // Orientation that maps the head's current frame to the bear's axes at rest.
      this.head.updateWorldMatrix(true, false);
      const headRest = this.head.getWorldQuaternion(new THREE.Quaternion());
      const rootQ = this.object.getWorldQuaternion(new THREE.Quaternion());
      this.eyeMid.quaternion.copy(headRest.invert().multiply(rootQ));
    }

    const rig = (model.userData?.cheerBearRig ?? {}) as Partial<RigInfo>;
    this.face = new FaceRig(model, rig);
    this.lipSync = new LipSyncEngine(opts.lipSync);

    this.mixer = new THREE.AnimationMixer(model);
    this.clipNames = clips.map((c) => c.name);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    this.mixer.addEventListener('finished', (e) => {
      if (this.current && e.action === this.current && this.currentOnce) {
        const back = this.loopClip;
        this.currentOnce = false;
        this.play(back, { fade: 0.45 });
        this.onceResolvers.splice(0).forEach((f) => f());
      }
    });
    this.play('idle', { fade: 0 });
  }

  get speaking(): boolean {
    return this._speaking;
  }

  /** The clip currently playing (logical name). */
  get clip(): BearClip {
    return this.currentClip;
  }

  // ------------------------------------------------------------------ body
  play(clip: BearClip, opts: { once?: boolean; fade?: number; speed?: number } = {}): void {
    const spec = CLIP_MAP[clip];
    const name = spec?.names.find((n) => this.actions.has(n)) ?? 'idle';
    this.playRaw(name, clip, opts.once ?? !spec?.loop, opts.fade ?? 0.35, opts.speed ?? 1);
    if (clip !== 'talkIdle') this.autoTalk = false;
  }

  /** Play any clip in the model by its file name (extras like 'backflip', 'sad'). */
  playByName(name: string, opts: { once?: boolean; fade?: number; speed?: number } = {}): void {
    if (!this.actions.has(name)) return;
    this.playRaw(name, 'idle', opts.once ?? true, opts.fade ?? 0.35, opts.speed ?? 1);
  }

  private playRaw(name: string, logical: BearClip, once: boolean, fade: number, speed: number): void {
    const a = this.actions.get(name);
    if (!a) return;
    // A new clip interrupts a one-shot: anyone waiting on it is released.
    if (this.currentOnce && this.current !== a) this.onceResolvers.splice(0).forEach((f) => f());
    if (!once) this.loopClip = logical;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.timeScale = speed;
    const prev = this.current;
    if (a === prev) {
      if (once) a.reset().play();
    } else {
      a.reset();
      a.setEffectiveWeight(1);
      a.play();
      if (prev && fade > 0) prev.crossFadeTo(a, fade, true);
      else if (prev) prev.stop();
    }
    this.current = a;
    this.currentClip = logical;
    this.currentOnce = once;
    // Body-linked face: eyes shut while asleep; a fitting expression for expressive clips.
    this.face.sleepLid = logical === 'sleep' ? 1 : 0;
    if (!this.explicitExpression) this.face.setExpression(CLIP_FACE[logical] ?? (logical === 'sleep' ? 'sleepy' : 'neutral'));
  }

  whenClipDone(): Promise<void> {
    if (!this.current || !this.currentOnce) return Promise.resolve();
    return new Promise((r) => this.onceResolvers.push(r));
  }

  // ------------------------------------------------------------------ face
  setExpression(e: BearExpression, opts?: { hold?: number }): void {
    this.explicitExpression = e === 'neutral' ? null : e;
    this.face.setExpression(e, opts?.hold);
    if (opts?.hold) {
      const hold = opts.hold;
      window.setTimeout(() => {
        if (this.explicitExpression === e) this.explicitExpression = null;
      }, hold * 1000);
    }
  }

  setVisemes(frame: VisemeFrame | null): void {
    this.manualFrame = frame;
  }

  /** Lip sync from a live stream. Only analysed, never played (the call SDK plays it). */
  setSpeechStream(stream: MediaStream | null): void {
    this.stopSay();
    if (!stream) {
      this.lipSync.detach();
      return;
    }
    this.lipSync.attachStream(stream);
  }

  /** Play a sound file out loud with lip sync. Resolves when it ends (at once if audio is still locked). */
  async say(audioUrl: string): Promise<void> {
    const ctx = getAudioContext();
    if (ctx.state !== 'running') return;
    const token = ++this.sayToken;
    let buf: AudioBuffer;
    try {
      buf = await this.loadBuffer(audioUrl);
    } catch {
      return;
    }
    if (token !== this.sayToken || this.disposed) return;
    await this.sayBuffer(buf, token);
  }

  /** Play a decoded buffer with lip sync (the lab uses this for phone-band renders). */
  sayBuffer(buf: AudioBuffer, token = ++this.sayToken): Promise<void> {
    const ctx = getAudioContext();
    this.stopSay();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    this.lipSync.attachNode(src);
    this.saySource = src;
    return new Promise<void>((resolve) => {
      src.onended = () => {
        if (this.saySource === src) {
          this.saySource = null;
          this.lipSync.detach();
        }
        resolve();
      };
      src.start();
      void token;
    });
  }

  private stopSay(): void {
    if (this.saySource) {
      const s = this.saySource;
      this.saySource = null;
      try {
        s.stop();
      } catch {
        /* not started */
      }
      s.disconnect();
    }
  }

  private loadBuffer(url: string): Promise<AudioBuffer> {
    let p = this.bufferCache.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${url}`);
          return r.arrayBuffer();
        })
        .then((d) => getAudioContext().decodeAudioData(d));
      p.catch(() => this.bufferCache.delete(url));
      this.bufferCache.set(url, p);
    }
    return p;
  }

  lookAt(target: THREE.Vector3 | null): void {
    this.lookTarget = target ? target.clone() : null;
  }

  // ------------------------------------------------------------------ frame
  update(dt: number): void {
    if (this.disposed) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;

    // 1. speech
    let frame: VisemeFrame;
    if (this.manualFrame !== null) frame = this.smoothManual(this.manualFrame, dt);
    else if (this.lipSync.attached) frame = this.lipSync.update(dt);
    else frame = this.lipSync.update(dt); // relaxes to a closed mouth
    const any = Object.values(frame.weights).some((w) => (w ?? 0) > 0.04);
    this._speaking = frame.speaking || any;
    this.talk += ((this._speaking ? 1 : 0) - this.talk) * (1 - Math.exp(-dt / (this._speaking ? 0.25 : 0.8)));
    this.amp = frame.amplitude;
    this.ampSlow += (this.amp - this.ampSlow) * (1 - Math.exp(-dt / 0.35));
    this.autoTalkBody(dt);

    // 2. body clips (bones with additive layers start from last frame's clip pose, see `additiveBase`)
    for (const [b, q] of this.additiveBase) b.quaternion.copy(q);
    this.mixer.update(dt);
    for (const [b, q] of this.additiveBase) q.copy(b.quaternion);
    this.model.updateMatrixWorld(true);

    // 3. additive layers on top of the clip: look-at + talking energy on the head/neck/spine
    const look = this.computeLook(dt);
    this.talkingEnergy(dt, look);

    // 4. face (morphs + eye/lid bones; no clip touches these)
    this.face.setTalk(this.talk);
    this.face.setVisemes(frame);
    this.face.update(dt, look);
  }

  /** Frames from setVisemes() may arrive at any rate: ease toward them so the mouth never pops. */
  private smoothManual(f: VisemeFrame, dt: number): VisemeFrame {
    const out = this.manualSmoothed;
    const k = 1 - Math.exp(-dt / 0.05);
    const w = out.weights as Record<string, number>;
    const keys = new Set([...Object.keys(w), ...Object.keys(f.weights)]);
    for (const key of keys) {
      const t = (f.weights as Record<string, number>)[key] ?? 0;
      const v = (w[key] ?? 0) + (t - (w[key] ?? 0)) * k;
      if (v < 0.002 && t === 0) delete w[key];
      else w[key] = v;
    }
    out.amplitude += (f.amplitude - out.amplitude) * k;
    out.speaking = f.speaking;
    return out;
  }

  /** While she talks from idle, switch to the gesturing talk idle; back to idle after a pause. */
  private autoTalkBody(dt: number): void {
    if (this._speaking) {
      this.talkTime += dt;
      this.silentTime = 0;
    } else {
      this.silentTime += dt;
      this.talkTime = 0;
    }
    if (!this.currentOnce && this.loopClip === 'idle' && this.currentClip === 'idle' && this.talkTime > 0.5) {
      this.play('talkIdle', { fade: 0.7 });
      this.loopClip = 'idle';
      this.autoTalk = true;
    } else if (this.autoTalk && this.currentClip === 'talkIdle' && this.silentTime > 1.6) {
      this.autoTalk = false;
      this.play('idle', { fade: 0.9 });
    }
  }

  private computeLook(dt: number): { yaw: number; pitch: number } | null {
    if (!this.lookTarget || !this.head) {
      this.headYaw += (0 - this.headYaw) * (1 - Math.exp(-dt / 0.4));
      this.headPitch += (0 - this.headPitch) * (1 - Math.exp(-dt / 0.4));
      return null;
    }
    // Target in a frame that rides on the head but keeps the bear's axes (+z ahead, +y up).
    this.eyeMid.updateWorldMatrix(true, false);
    _v.copy(this.lookTarget);
    this.eyeMid.worldToLocal(_v);
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = Math.atan2(-_v.y, Math.hypot(_v.x, _v.z));
    // The head takes part of a big look; the eyes do the rest.
    const k = 1 - Math.exp(-dt / 0.35);
    this.headYaw += (THREE.MathUtils.clamp(yaw * 0.6, -0.6, 0.6) - this.headYaw) * k;
    this.headPitch += (THREE.MathUtils.clamp(pitch * 0.45, -0.35, 0.35) - this.headPitch) * k;
    return { yaw: yaw - this.headYaw, pitch: pitch - this.headPitch };
  }

  private talkingEnergy(dt: number, _look: unknown): void {
    if (!this.head) return;
    const t = this.time;
    const talk = this.talk;
    // Emphasis nods: a spring kicked by loudness rising above its slow average (syllable stress).
    const kick = Math.max(0, this.amp - this.ampSlow - 0.08) * talk;
    const w = 14;
    const x0 = this.nod - kick * 0.5;
    const e = Math.exp(-w * dt);
    const j = (this.nodV + w * x0) * dt;
    this.nod = kick * 0.5 + (x0 + j) * e;
    this.nodV = (this.nodV - w * j) * e;

    const pitch = this.headPitch + this.nod * 0.16 + talk * (0.03 * Math.sin(t * 2.3) + 0.025 * this.ampSlow);
    const yaw = this.headYaw + talk * 0.05 * Math.sin(t * 0.83 + 1.1);
    const roll = talk * 0.04 * Math.sin(t * 1.37);
    this.rotateAboutBearAxis(this.head, RIGHT, pitch);
    this.rotateAboutBearAxis(this.head, UP, yaw);
    this.rotateAboutBearAxis(this.head, FWD, roll);
    if (this.neck) this.rotateAboutBearAxis(this.neck, UP, this.headYaw * 0.4);
    if (this.spine) this.rotateAboutBearAxis(this.spine, RIGHT, talk * 0.02 * this.ampSlow + this.nod * 0.04);
    this.model.updateMatrixWorld(true);
  }

  /** Rotate a bone by `angle` about one of the bear's own axes (independent of the bone's local axes). */
  private rotateAboutBearAxis(bone: THREE.Object3D, axisBear: THREE.Vector3, angle: number): void {
    if (Math.abs(angle) < 1e-5 || !bone.parent) return;
    const rootQ = this.object.getWorldQuaternion(_q2);
    const axisW = _v2.copy(axisBear).applyQuaternion(rootQ);
    const parentQ = bone.parent.getWorldQuaternion(_q);
    // local delta = parent^-1 * R(axisW) * parent
    const axisLocal = axisW.applyQuaternion(parentQ.invert());
    bone.quaternion.premultiply(_q.setFromAxisAngle(axisLocal, angle));
  }

  releaseRenderer(_renderer: THREE.WebGLRenderer): void {
    // GPU resources are re-uploaded lazily by whichever renderer draws the bear next; nothing renderer-specific is
    // cached here. (Disposing textures/geometries would also free them on the new renderer.)
  }

  dispose(): void {
    this.disposed = true;
    this.sayToken++;
    this.stopSay();
    this.lipSync.dispose();
    this.onceResolvers.splice(0).forEach((f) => f());
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.object.removeFromParent();
    this.object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        });
      }
    });
  }
}
