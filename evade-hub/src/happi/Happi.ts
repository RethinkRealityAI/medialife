// Happi, the Japan Parade & Street Fair mascot, as the app's character (same BearCharacter contract as Happi,
// so every mode, game and moment works unchanged). Body: the Meshy-rigged model with library clips (see
// tools/blender/build_happi.py). Face: a live canvas on the face panel (src/happi/faceArt.ts) driven by lip sync,
// blinking, look-at and the four official expression heads. Tail: three bones that sway and bounce with him.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { BearCharacter, BearClip, BearExpression, VisemeFrame } from '../shared/contracts';
import { LipSyncEngine, type LipSyncConfig } from '../lipsync';
import { getAudioContext } from '../audio/context';
import { drawFace, faceKey, FACE_H, FACE_W, type FaceLook, type FaceState } from './faceArt';

export interface LoadHappiOptions {
  onProgress?: (p: number) => void;
  url?: string;
  height?: number;
  lipSync?: Partial<LipSyncConfig>;
}

export const HAPPI_MODEL_URL = '/evade/hub/models/happi.glb';

/** Logical clip -> GLB clip names (first found wins) and whether it loops. */
const CLIP_MAP: Record<BearClip, { names: string[]; loop: boolean }> = {
  idle: { names: ['idle'], loop: true },
  talkIdle: { names: ['talkIdle', 'idle'], loop: true },
  wave: { names: ['wave', 'waveSmall'], loop: false },
  walk: { names: ['walk'], loop: true },
  run: { names: ['run', 'walk'], loop: true },
  dance: { names: ['dance', 'popDance', 'groove', 'joyDance'], loop: true },
  cheer: { names: ['cheer', 'victory', 'cheer2', 'fistPump'], loop: false },
  sway: { names: ['sway'], loop: true },
  present: { names: ['bow'], loop: false },
  sleep: { names: ['sleep'], loop: true },
  wakeUp: { names: ['wakeUp'], loop: false },
  shiver: { names: ['scratch'], loop: false },
};

const CLIP_FACE: Partial<Record<BearClip, BearExpression>> = {
  cheer: 'happy', dance: 'happy', wave: 'happy', sway: 'happy', shiver: 'cold', present: 'happy',
};

/** Contract expressions -> the official heads. 'cold' shows the grumpy head. */
const LOOK_OF: Record<BearExpression, FaceLook> = {
  neutral: 'neutral', happy: 'happy', surprised: 'surprised', sleepy: 'sleepy', cold: 'grumpy', wink: 'wink', love: 'love', excited: 'excited',
};

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

let sharedLoader: GLTFLoader | null = null;

export class Happi implements BearCharacter {
  private variantTurn: Partial<Record<BearClip, number>> = {};
  /** 'front' (Dapo, 2026-11-20): standing up straight, a gentle side-to-side sway facing you, now and then a little
   *  wave or a chatty bob, all facing the camera. 'roam': the Meshy idle that looks around (the house). */
  private idleStyle: 'front' | 'roam' = 'front';
  private idleT = 0;
  private idleNext = 9;
  readonly object: THREE.Group;
  readonly height: number;
  readonly lipSync: LipSyncEngine;
  readonly clipNames: string[];
  /** The live face canvas (also used by the selfie decals and the splash). */
  readonly faceCanvas: HTMLCanvasElement;

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
  private clipExpression: BearExpression = 'neutral';
  private expressionUntil = 0;

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
  private tail: THREE.Object3D[] = [];
  private additiveBase: Array<[THREE.Object3D, THREE.Quaternion]> = [];
  private lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0;
  private headPitch = 0;
  private eyeX = 0;
  private eyeY = 0;
  private disposed = false;

  // face
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: THREE.CanvasTexture;
  private faceState: FaceState = { look: 'neutral', blink: 0, open: 0, round: 0, lookX: 0, lookY: 0 };
  private lastKey = '';
  private blinkT = 2 + Math.random() * 2;
  private blinkPhase = -1;
  private mouthOpen = 0;
  private mouthRound = 0;
  // tail spring
  private hipPrev = new THREE.Vector3();
  private tailKick = 0;
  private tailAcc = new THREE.Vector3();
  private tailVelPrev = new THREE.Vector3();
  private tailActive = 0;
  private tailYawPrev = 0;
  private tailYawRate = 0;
  private tailSpring: Array<{ s: number; sv: number; l: number; lv: number }> = [];

  static async load(opts: LoadHappiOptions = {}): Promise<Happi> {
    if (!sharedLoader) {
      sharedLoader = new GLTFLoader();
      sharedLoader.setMeshoptDecoder(MeshoptDecoder);
    }
    const gltf = await sharedLoader.loadAsync(opts.url ?? HAPPI_MODEL_URL, (e) => {
      if (e.total) opts.onProgress?.(Math.min(0.99, e.loaded / e.total));
    });
    opts.onProgress?.(1);
    return new Happi(gltf.scene, gltf.animations, opts);
  }

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], opts: LoadHappiOptions = {}) {
    this.height = opts.height ?? 1;
    this.model = model;
    this.object = new THREE.Group();
    this.object.name = 'Happi';

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const s = this.height / Math.max(1e-6, box.max.y - box.min.y);
    model.scale.multiplyScalar(s);
    model.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    this.object.add(model);

    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = FACE_W;
    this.faceCanvas.height = FACE_H;
    this.faceCtx = this.faceCanvas.getContext('2d')!;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.flipY = false; // glTF UVs have v down
    this.faceTex.anisotropy = 4;
    this.drawFaceNow();

    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.frustumCulled = false;
      m.castShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        if (mat.name === 'HappiFace' || m.name.startsWith('HappiFace')) {
          const fm = new THREE.MeshStandardMaterial({
            name: 'HappiFace', map: this.faceTex, roughness: 0.78, metalness: 0, alphaTest: 0.5,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          });
          m.material = fm;
          m.renderOrder = 1;
        } else if (mat.isMeshStandardMaterial) {
          // the rebuilt body's flat textures stay crisp at grazing angles (sleeves, coat sides) on every phone
          if (mat.map) mat.map.anisotropy = 8;
          // Meshy: soft matte vinyl, no baked glow
          mat.roughness = Math.max(mat.roughness, 0.68);
          mat.metalness = 0;
          mat.emissiveIntensity = Math.min(mat.emissiveIntensity, 0.05);
        }
      }
    });
    this.head = model.getObjectByName('Head') ?? null;
    this.neck = model.getObjectByName('neck') ?? null;
    this.spine = model.getObjectByName('Spine') ?? null;
    for (const n of ['Tail1', 'Tail2', 'Tail3']) {
      const b = model.getObjectByName(n);
      if (b) this.tail.push(b);
    }
    for (const b of [this.head, this.neck, this.spine, ...this.tail]) if (b) this.additiveBase.push([b, b.quaternion.clone()]);
    const hips = model.getObjectByName('Hips');
    hips?.getWorldPosition(this.hipPrev);

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

  get clip(): BearClip {
    return this.currentClip;
  }

  /** The face look showing right now (the selfie and the tests read it). */
  get faceLook(): FaceLook {
    return this.faceState.look;
  }

  // ------------------------------------------------------------------ body
  /** Pick the idle: 'front' faces you (photos, 3D, AR), 'roam' looks around (in the house). */
  setIdleStyle(s: 'front' | 'roam'): void {
    if (s === this.idleStyle) return;
    this.idleStyle = s;
    if (this.loopClip === 'idle' && this.currentClip === 'idle' && !this.currentOnce) this.play('idle', { fade: 0.6 });
  }

  play(clip: BearClip, opts: { once?: boolean; fade?: number; speed?: number } = {}): void {
    if (clip === 'idle') {
      this.idleT = 0;
      this.playRaw(this.idleStyle === 'front' && this.actions.has('sway') ? 'sway' : 'idle', 'idle', opts.once ?? false, opts.fade ?? 0.35, opts.speed ?? 1);
      this.autoTalk = false;
      return;
    }
    const spec = CLIP_MAP[clip];
    // clips with variants take turns, so the same moment looks fresh each time
    const have = spec?.names.filter((n) => this.actions.has(n)) ?? [];
    const turn = (this.variantTurn[clip] = ((this.variantTurn[clip] ?? -1) + 1) % Math.max(1, have.length));
    const name = have[turn] ?? 'idle';
    this.playRaw(name, clip, opts.once ?? !spec?.loop, opts.fade ?? 0.35, opts.speed ?? 1);
    if (clip !== 'talkIdle') this.autoTalk = false;
  }

  /** Any clip in the model by its file name (extras: 'jump', 'groove', 'fistPump', 'waveSmall', 'bow'). */
  playByName(name: string, opts: { once?: boolean; fade?: number; speed?: number } = {}): void {
    if (!this.actions.has(name)) return;
    this.playRaw(name, 'idle', opts.once ?? true, opts.fade ?? 0.35, opts.speed ?? 1);
  }

  private playRaw(name: string, logical: BearClip, once: boolean, fade: number, speed: number): void {
    const a = this.actions.get(name);
    if (!a) return;
    // some moves carry their own face: heart eyes for the heart gesture, star eyes for the big celebrations
    const face: BearExpression | null = name === 'love' ? 'love' : name === 'victory' || name === 'joyDance' || name === 'popDance' ? 'excited' : null;
    if (face) this.setExpression(face, { hold: Math.min(4, a.getClip().duration) });
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
    this.clipExpression = logical === 'sleep' ? 'sleepy' : CLIP_FACE[logical] ?? 'neutral';
    if (once) this.tailKick = 1;
  }

  whenClipDone(): Promise<void> {
    if (!this.current || !this.currentOnce) return Promise.resolve();
    return new Promise((r) => this.onceResolvers.push(r));
  }

  // ------------------------------------------------------------------ face
  setExpression(e: BearExpression, opts?: { hold?: number }): void {
    this.explicitExpression = e === 'neutral' ? null : e;
    this.expressionUntil = opts?.hold ? performance.now() + opts.hold * 1000 : 0;
  }

  setVisemes(frame: VisemeFrame | null): void {
    this.manualFrame = frame;
  }

  setSpeechStream(stream: MediaStream | null): void {
    this.stopSay();
    if (!stream) {
      this.lipSync.detach();
      return;
    }
    this.lipSync.attachStream(stream);
  }

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

    let frame: VisemeFrame;
    if (this.manualFrame !== null) frame = this.smoothManual(this.manualFrame, dt);
    else frame = this.lipSync.update(dt);
    const any = Object.values(frame.weights).some((w) => (w ?? 0) > 0.04);
    this._speaking = frame.speaking || any;
    this.talk += ((this._speaking ? 1 : 0) - this.talk) * (1 - Math.exp(-dt / (this._speaking ? 0.25 : 0.8)));
    this.amp = frame.amplitude;
    this.ampSlow += (this.amp - this.ampSlow) * (1 - Math.exp(-dt / 0.35));
    this.autoTalkBody(dt);
    this.idleCycle(dt);

    for (const [b, q] of this.additiveBase) b.quaternion.copy(q);
    this.mixer.update(dt);
    for (const [b, q] of this.additiveBase) q.copy(b.quaternion);
    this.model.updateMatrixWorld(true);

    const look = this.computeLook(dt);
    this.talkingEnergy(dt);
    this.tailSway(dt);
    this.updateFace(dt, frame, look);
  }

  private updateFace(dt: number, frame: VisemeFrame, look: { yaw: number; pitch: number } | null): void {
    if (this.expressionUntil && performance.now() > this.expressionUntil) {
      this.explicitExpression = null;
      this.expressionUntil = 0;
    }
    const expr = this.explicitExpression ?? this.clipExpression;
    let lk: FaceLook = LOOK_OF[expr] ?? 'neutral';
    if (this.currentClip === 'sleep' && !this.explicitExpression) lk = 'asleep';

    // blink every few seconds (a double blink now and then); none while asleep
    this.blinkT -= dt;
    if (this.blinkPhase < 0 && this.blinkT <= 0 && lk !== 'asleep') {
      this.blinkPhase = 0;
      this.blinkT = 2.2 + Math.random() * 3.2;
      if (Math.random() < 0.18) this.blinkT = 0.32;
    }
    let blink = 0;
    if (this.blinkPhase >= 0) {
      this.blinkPhase += dt / 0.16;
      blink = Math.sin(Math.min(1, this.blinkPhase) * Math.PI);
      if (this.blinkPhase >= 1) this.blinkPhase = -1;
    }

    // mouth from the visemes: open from the vowels and the jaw, round from O / U
    const w = frame.weights;
    const open = Math.min(1, (w.aa ?? 0) * 1.0 + (w.O ?? 0) * 0.8 + (w.E ?? 0) * 0.55 + (w.I ?? 0) * 0.35 + (w.U ?? 0) * 0.4
      + (w.DD ?? 0) * 0.35 + (w.kk ?? 0) * 0.4 + (w.CH ?? 0) * 0.3 + (w.nn ?? 0) * 0.25 + (w.RR ?? 0) * 0.3
      + (w.TH ?? 0) * 0.3 + (w.SS ?? 0) * 0.15 + (w.FF ?? 0) * 0.12);
    const round = Math.min(1, ((w.O ?? 0) + (w.U ?? 0) * 1.2) / Math.max(0.15, open + 0.05));
    const k = 1 - Math.exp(-dt / 0.045);
    this.mouthOpen += (open - this.mouthOpen) * k;
    this.mouthRound += (round - this.mouthRound) * k;

    // pupils follow the look target (what the head does not turn)
    const tx = look ? THREE.MathUtils.clamp(-look.yaw / 0.5, -1, 1) : Math.sin(this.time * 0.37) * 0.15;
    const ty = look ? THREE.MathUtils.clamp(look.pitch / 0.35, -1, 1) : 0;
    const ke = 1 - Math.exp(-dt / 0.08);
    this.eyeX += (tx - this.eyeX) * ke;
    this.eyeY += (ty - this.eyeY) * ke;

    const s = this.faceState;
    s.look = lk;
    s.blink = blink;
    s.open = this.mouthOpen;
    s.round = this.mouthRound;
    s.lookX = this.eyeX;
    s.lookY = this.eyeY;
    const key = faceKey(s);
    if (key !== this.lastKey) this.drawFaceNow(key);
  }

  private drawFaceNow(key = faceKey(this.faceState)): void {
    this.lastKey = key;
    drawFace(this.faceCtx, this.faceState);
    this.faceTex.needsUpdate = true;
  }

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

  /** Front idle: every 9-15 s a short front-facing extra (a small wave, a chatty bob), then back to the sway. */
  private idleCycle(dt: number): void {
    if (this.idleStyle !== 'front' || this.currentClip !== 'idle' || this.currentOnce || this.loopClip !== 'idle') { this.idleT = 0; return; }
    this.idleT += dt;
    if (this.idleT < this.idleNext) return;
    this.idleT = 0;
    this.idleNext = 9 + Math.random() * 6;
    const extra = ['waveSmall', 'talkIdle'].filter((n) => this.actions.has(n));
    if (!extra.length) return;
    const name = extra[(Math.random() * extra.length) | 0];
    this.playRaw(name, 'idle', true, 0.5, 1);
  }

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
    // target in the character's frame, from the head position
    this.head.getWorldPosition(_v2);
    _v.copy(this.lookTarget).sub(_v2);
    const rootQ = this.object.getWorldQuaternion(_q2);
    _v.applyQuaternion(_q.copy(rootQ).invert());
    const yaw = Math.atan2(_v.x, _v.z);
    const pitch = Math.atan2(-_v.y, Math.hypot(_v.x, _v.z));
    const k = 1 - Math.exp(-dt / 0.35);
    // a big hood: the head turns less, the eyes do more
    this.headYaw += (THREE.MathUtils.clamp(yaw * 0.45, -0.45, 0.45) - this.headYaw) * k;
    this.headPitch += (THREE.MathUtils.clamp(pitch * 0.35, -0.25, 0.25) - this.headPitch) * k;
    return { yaw: yaw - this.headYaw, pitch: pitch - this.headPitch };
  }

  private talkingEnergy(dt: number): void {
    if (!this.head) return;
    const t = this.time;
    const talk = this.talk;
    const kick = Math.max(0, this.amp - this.ampSlow - 0.08) * talk;
    const w = 14;
    const x0 = this.nod - kick * 0.5;
    const e = Math.exp(-w * dt);
    const j = (this.nodV + w * x0) * dt;
    this.nod = kick * 0.5 + (x0 + j) * e;
    this.nodV = (this.nodV - w * j) * e;
    const pitch = this.headPitch + this.nod * 0.12 + talk * (0.025 * Math.sin(t * 2.3) + 0.02 * this.ampSlow);
    const yaw = this.headYaw + talk * 0.05 * Math.sin(t * 0.83 + 1.1);
    const roll = talk * 0.05 * Math.sin(t * 1.37) + 0.025 * Math.sin(t * 0.6);
    this.rotateAbout(this.head, RIGHT, pitch);
    this.rotateAbout(this.head, UP, yaw);
    this.rotateAbout(this.head, FWD, roll);
    if (this.neck) this.rotateAbout(this.neck, UP, this.headYaw * 0.4);
    if (this.spine) this.rotateAbout(this.spine, RIGHT, talk * 0.02 * this.ampSlow + this.nod * 0.03);
    this.model.updateMatrixWorld(true);
  }

  /**
   * The big squirrel tail follows the body (Dapo, round 6: "have the tail move a little as he runs"): the hips'
   * motion in Happi's own space (bounce, sway, speeding up, turning) drives a chain of damped springs, root to tip,
   * so the tail lags, swings and settles like a real one; plus a slow wag that grows with how much Happi is moving,
   * and a flick when a one-shot move starts.
   */
  private tailSway(dt: number): void {
    if (!this.tail.length) return;
    const h = Math.min(0.05, Math.max(0, dt));
    const hips = this.model.getObjectByName('Hips');
    if (hips && h > 0) {
      hips.getWorldPosition(_v);
      const inv = this.object.getWorldQuaternion(_q2).invert();
      const vel = _v2.copy(_v).sub(this.hipPrev).divideScalar(h).applyQuaternion(inv);
      this.hipPrev.copy(_v);
      if (vel.lengthSq() > 400) vel.set(0, 0, 0); // a teleport (placing, Move): not motion
      const k = 1 - Math.exp(-h / 0.05);
      this.tailAcc.x += ((vel.x - this.tailVelPrev.x) / h - this.tailAcc.x) * k;
      this.tailAcc.y += ((vel.y - this.tailVelPrev.y) / h - this.tailAcc.y) * k;
      this.tailAcc.z += ((vel.z - this.tailVelPrev.z) / h - this.tailAcc.z) * k;
      this.tailVelPrev.copy(vel);
      const speed = Math.hypot(vel.x, vel.y, vel.z);
      this.tailActive += (Math.min(1, speed * 1.5) - this.tailActive) * (1 - Math.exp(-h / 0.4));
      hips.getWorldQuaternion(_q);
      const yaw = Math.atan2(2 * (_q.w * _q.y + _q.x * _q.z), 1 - 2 * (_q.y * _q.y + _q.x * _q.x));
      let dy = yaw - this.tailYawPrev;
      if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
      this.tailYawPrev = yaw;
      this.tailYawRate += (dy / h - this.tailYawRate) * k;
    }
    this.tailKick *= Math.exp(-h * 2.2);
    const t = this.time;
    const a = this.tailAcc;
    const wag = Math.sin(t * (1.6 + this.tailActive * 2.4)) * (0.06 + this.tailActive * 0.12 + this.talk * 0.03)
      + Math.sin(t * 9) * this.tailKick * 0.1;
    // inertia: the tail swings away from where the hips accelerate, and against a turn
    let side = THREE.MathUtils.clamp(-a.x * 0.03 - this.tailYawRate * 0.1, -0.4, 0.4) + wag;
    let lift = THREE.MathUtils.clamp(-a.y * 0.022 + a.z * 0.012, -0.35, 0.35);
    this.tail.forEach((b, i) => {
      const sp = this.tailSpring[i] ?? (this.tailSpring[i] = { s: 0, sv: 0, l: 0, lv: 0 });
      const w = 10 - i * 2.2, z = 0.32;
      sp.sv += (-(w * w) * (sp.s - side) - 2 * z * w * sp.sv) * h; sp.s += sp.sv * h;
      sp.lv += (-(w * w) * (sp.l - lift) - 2 * z * w * sp.lv) * h; sp.l += sp.lv * h;
      sp.s = THREE.MathUtils.clamp(sp.s, -0.6, 0.6); sp.l = THREE.MathUtils.clamp(sp.l, -0.5, 0.5);
      this.rotateAbout(b, UP, sp.s * (0.8 + i * 0.25));
      this.rotateAbout(b, RIGHT, sp.l * (0.7 + i * 0.2));
      side = sp.s; lift = sp.l; // the next segment follows this one (lag down the tail)
    });
    this.model.updateMatrixWorld(true);
  }

  private rotateAbout(bone: THREE.Object3D, axisChar: THREE.Vector3, angle: number): void {
    if (Math.abs(angle) < 1e-5 || !bone.parent) return;
    const rootQ = this.object.getWorldQuaternion(_q2);
    const axisW = _v2.copy(axisChar).applyQuaternion(rootQ);
    const parentQ = bone.parent.getWorldQuaternion(_q);
    const axisLocal = axisW.applyQuaternion(parentQ.invert());
    bone.quaternion.premultiply(_q.setFromAxisAngle(axisLocal, angle));
  }

  releaseRenderer(_renderer: THREE.WebGLRenderer): void {
    /* nothing renderer-specific is cached */
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
