// ONE 8th Wall engine-binary session for every camera mode (ported from medialife labs/demos/shared/shell.js, swap
// mode, and the immersive skill's "Camera swap: world + face in ONE session").
//
//   world (back camera, SLAM)  <->  face (front camera, face effects)
//   XR8.stop() -> XR8.removeCameraPipelineModules(['reality'] | ['facecontroller']) -> configure + add the other
//   tracker -> XR8.run({ cameraConfig: { direction: BACK | FRONT } })
//
// Every XR8.run hands over a NEW three.js scene, camera and renderer (same GL context): the engine re-adds the
// persistent roots (`addRoot`), hands the GL textures of the old renderer to the new one (no re-upload), frees the old
// renderer's programs and buffers before the stop, builds the environment map once, and compiles the roots' shaders
// AND uploads all their textures in the run's very first callback (onStart), before SLAM has processed a frame, so
// nothing heavy happens while tracking initialises or once it has settled (ar-4: the old order compiled 36 programs
// the moment SLAM first settled and then trickled 22 texture uploads through the next seconds; in the simulator
// tracking dropped to LIMITED during exactly that window). Content stays hidden and Place waits for `settled()`.
// Going back to the 3D showcase stops the engine (camera off); the next camera mode runs it again.
import { recorder } from '../capture/recorder';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CameraKind, EngineView, FaceEvent, XrScene } from '../types';
import { qs, now } from './device';
import { worldHealth, type WorldHealth } from './world-health';

/* eslint-disable @typescript-eslint/no-explicit-any */
type XR8Api = any;
declare global {
  interface Window {
    XR8?: XR8Api;
    THREE?: unknown;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Camera start height for world tracking: with responsive scale, 1 unit is about 1 m on a floor. */
export const CAM_H = 1.3;

export type EngineFailure = 'permission' | 'unsupported' | 'error';
export class EngineError extends Error {
  constructor(readonly reason: EngineFailure, message: string) {
    super(message);
  }
}

export interface EngineHooks {
  /** A run handed over a new scene: re-attach, compile, etc. */
  onScene(xr: XrScene, kind: CameraKind): void;
  /** Each engine frame. */
  onUpdate(dt: number, now: number): void;
  onFace(ev: FaceEvent): void;
  /** An error after the camera was already live (lost camera, context loss...). */
  onRuntimeError(err: EngineError): void;
  /** Free GPU copies held by objects that manage their own (the bear) on a renderer that is going away. */
  releaseRenderer(renderer: THREE.WebGLRenderer): void;
}

const FACE_EVENTS = [
  'faceloading', 'facefound', 'faceupdated', 'facelost', 'mouthopened', 'mouthclosed', 'blinked',
  'lefteyewinked', 'righteyewinked', 'lefteyebrowraised', 'righteyebrowraised', 'lefteyebrowlowered',
  'righteyebrowlowered', 'earfound', 'earlost',
];

export class Engine implements EngineView {
  readonly canvas: HTMLCanvasElement;
  xr: XrScene | null = null;
  /** The camera the engine is running now ('none' = stopped). */
  kind: CameraKind = 'none';
  tracking = '';
  private trackerKind: CameraKind = 'none';
  private booted = false;
  private wh: WorldHealth;
  private roots = new Set<THREE.Object3D>();
  private envRT: THREE.WebGLRenderTarget | null = null;
  private pending: { resolve: () => void; reject: (e: EngineError) => void; timer: number } | null = null;
  private live = false; // camera has video in this run
  private last = 0;
  private prepared = false; // env + shaders done for this run
  private preparing = false;
  private settledLatch = false;
  private texQueue: THREE.Texture[] = [];
  /** While set, warm() uploads every texture at once (the run's first callback, before SLAM starts). */
  private burst = false;
  /** Extra lines for the ?diag overlay (set by the experience / modes). */
  diagLine: (() => string) | null = null;
  private xrReady: Promise<boolean>;
  private hiddenPaused = false;
  private lastRenderer: THREE.WebGLRenderer | null = null;
  readonly diag = { swaps: [] as number[], errors: [] as string[], runs: 0, adopted: 0, programs: 0 };

  constructor(private host: HTMLElement, private hooks: EngineHooks) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cbx-xr';
    this.canvas.setAttribute('aria-label', 'Camera view');
    this.canvas.hidden = true;
    host.appendChild(this.canvas);
    this.wh = worldHealth({
      page: 'cheer-bear', canvas: this.canvas, baseDpr: 1.5, minDpr: 1.25, // never below 1.25: Android dropped to 1 and Happi looked soft (Dapo, 2026-11-20)
      size: () => [Math.max(1, host.clientWidth), Math.max(1, host.clientHeight)],
      diagExtra: () => {
        const r = this.xr?.renderer;
        const base = r ? `draw ${r.info.render.calls} tris ${Math.round(r.info.render.triangles / 1000)}k prog ${r.info.programs?.length ?? 0} tex ${r.info.memory.textures}` : '';
        return [base, this.diagLine?.() ?? ''].filter(Boolean).join('\n');
      },
    });
    this.xrReady = new Promise<boolean>((res) => {
      if (window.XR8) return res(true);
      const t = window.setTimeout(() => res(!!window.XR8), 30000);
      window.addEventListener('xrloaded', () => { clearTimeout(t); res(true); }, { once: true });
    });
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** True once the engine script has loaded (it loads in the background on the splash). */
  get loaded(): boolean {
    return !!window.XR8;
  }
  whenLoaded(): Promise<boolean> {
    return this.xrReady;
  }

  get running(): boolean {
    return this.kind !== 'none';
  }

  // ------------------------------------------------------------------ roots
  /** Content that must be in every engine scene (each mode's root). */
  addRoot(o: THREE.Object3D): void {
    this.roots.add(o);
    if (this.xr && o.parent !== this.xr.scene) this.xr.scene.add(o);
  }
  removeRoot(o: THREE.Object3D): void {
    this.roots.delete(o);
    o.parent?.remove(o);
  }

  // ------------------------------------------------------------------ EngineView
  settled(): boolean {
    if (this.kind === 'face') return this.prepared;
    if (this.kind !== 'world') return false;
    if (this.settledLatch) return true;
    if (!this.prepared || !this.wh.settled()) return false;
    return (this.settledLatch = true);
  }
  busy(what: string): void {
    this.wh.busy(what);
  }
  /** Tracking is calm right now (not latched): NORMAL for a while, no stall in the last second. */
  calm(): boolean {
    return this.kind === 'world' && this.prepared && this.wh.settled();
  }
  /**
   * Restart SLAM where the phone is now (XR8.XrController.recenter: the camera goes back to the origin and tracking
   * starts over, so a scale that drifted while walking is thrown away) and re-arm the settled gate. Used by Move:
   * the next Place waits for freshly settled tracking. 8th Wall's own World Tracking Portal sample recentres on
   * place and on its recenter button.
   */
  recenter(): boolean {
    if (this.kind !== 'world' || !this.live) return false;
    let ok = false;
    if (!qs.has('norecenter')) {
      try { window.XR8.XrController.recenter(); ok = true; } catch (e) { this.diag.errors.push('recenter: ' + String(e)); }
    }
    this.settledLatch = false;
    this.wh.regate();
    this.wh.note(ok ? 'recenter' : 'regate');
    return ok;
  }
  note(what: string): void {
    this.wh.note(what);
  }
  private raycaster = new THREE.Raycaster();
  ray(ndc: THREE.Vector2): THREE.Raycaster {
    const cam = this.xr!.camera;
    // the engine writes projectionMatrix directly and leaves the inverse stale (shell.js: taps landed far left)
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.raycaster.setFromCamera(ndc, cam);
    return this.raycaster;
  }
  async screenshot(): Promise<HTMLImageElement> {
    const b64: string = await window.XR8.CanvasScreenshot.takeScreenshot();
    const img = new Image();
    img.src = 'data:image/jpeg;base64,' + b64;
    await img.decode();
    return img;
  }
  get fps(): number {
    return this.wh.fps;
  }
  health(): Record<string, unknown> {
    return { ...this.wh.snapshot(), engine: { ...this.diag } };
  }

  async warm(root: THREE.Object3D): Promise<void> {
    const xr = this.xr;
    if (!xr) return;
    const { renderer, camera, scene } = xr;
    const parent = root.parent;
    const wasVisible = root.visible;
    // compileAsync counts the target scene's lights AND the object's own when the object is inside the scene
    // (pitfall, three r180): detach it for the call, then put it back.
    parent?.remove(root);
    root.visible = true;
    // compile gathers lights with traverseVisible: a light under a hidden group (e.g. the AR stage before it is
    // placed) would be missed and every program built for the wrong light count, then rebuilt when it shows up.
    // Show the lights' ancestors for the (synchronous) gathering, then put them back.
    const forced: THREE.Object3D[] = [];
    root.traverse((o) => {
      if (!(o as THREE.Light).isLight) return;
      for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible) { p.visible = true; forced.push(p); }
    });
    const restore = () => {
      for (const o of forced) o.visible = false;
      forced.length = 0;
      if (root.parent !== parent) parent?.add(root);
      root.visible = wasVisible;
    };
    // Not compileAsync: its own poll keeps running after a quick mode swap has released this renderer and then
    // throws from a timer ("reading 'isReady'"). compile() starts the programs; we wait for them ourselves and
    // stop as soon as the renderer is no longer the live one.
    try {
      const pending = renderer.compile(root, camera, scene) as Set<THREE.Material>;
      restore();
      // textures right behind the programs: at a run's start all of them now (nothing is tracking yet), later a few
      // per frame
      this.uploadTextures(root, renderer);
      const t0 = performance.now();
      while (pending.size && this.xr?.renderer === renderer && performance.now() - t0 < 8000) {
        for (const m of [...pending]) {
          const prog = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } } | undefined)?.currentProgram;
          if (!prog || prog.isReady()) pending.delete(m);
        }
        if (pending.size) await new Promise((r) => setTimeout(r, 10));
      }
      if (this.xr?.renderer !== renderer) return;
    } catch {
      restore();
      this.uploadTextures(root, renderer);
    }
    glTidy(renderer);
    this.diag.programs = renderer.info.programs?.length ?? 0;
  }

  /** Every texture under `root`: uploaded now (`burst`, before SLAM starts) or queued a few per frame. */
  private uploadTextures(root: THREE.Object3D, renderer: THREE.WebGLRenderer): number {
    const seen = new Set<THREE.Texture>();
    let n = 0;
    root.traverse((o) => {
      const mats = ([] as THREE.Material[]).concat(((o as THREE.Mesh).material as THREE.Material | THREE.Material[]) ?? []);
      for (const m of mats) for (const v of Object.values(m)) {
        if (!v || !(v as THREE.Texture).isTexture || seen.has(v)) continue;
        seen.add(v);
        if (!this.burst) { this.texQueue.push(v); continue; }
        try { renderer.initTexture(v); n++; } catch { /* not ready (video) */ }
      }
    });
    glTidy(renderer);
    return n;
  }

  // ------------------------------------------------------------------ run / swap / stop
  /** Start (or switch to) a camera. Resolves when the camera has video. Call from a tap. */
  async start(kind: 'world' | 'face'): Promise<void> {
    if (this.pending) this.failPending(new EngineError('error', 'Superseded'));
    const ok = await this.xrReady;
    if (!ok || !window.XR8) throw new EngineError('unsupported', 'The camera engine did not load.');
    const XR8 = window.XR8;
    if (this.kind === kind && this.live) return;
    const t0 = now();
    if (this.kind !== 'none') this.halt();
    window.THREE = THREE; // XR8.Threejs.pipelineModule() looks for a global THREE
    this.wh.sizeCanvas();
    this.canvas.hidden = false;
    const result = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => this.failPending(new EngineError('error', 'The camera did not start.')), 15000);
      this.pending = { resolve: () => { this.diag.swaps.push(Math.round(now() - t0)); resolve(); }, reject, timer };
    });
    try {
      if (!this.booted) {
        XR8.addCameraPipelineModules([
          XR8.GlTextureRenderer.pipelineModule(),
          XR8.Threejs.pipelineModule(),
          ...this.trackerModules(kind),
          XR8.CanvasScreenshot.pipelineModule(),
          this.appModule,
        ]);
        this.booted = true;
      } else if (this.trackerKind !== kind) {
        XR8.removeCameraPipelineModules(this.trackerKind === 'world' ? ['reality', 'world-health'] : ['facecontroller']);
        XR8.addCameraPipelineModules(this.trackerModules(kind));
      } else {
        this.configureTracker(kind);
      }
      this.trackerKind = kind;
      this.kind = kind;
      this.live = false;
      this.prepared = false;
      this.preparing = false;
      this.settledLatch = false;
      this.diag.runs++;
      XR8.run({
        canvas: this.canvas,
        allowedDevices: kind === 'face' || qs.has('desktop') ? XR8.XrConfig.device().ANY : XR8.XrConfig.device().MOBILE_AND_HEADSETS,
        cameraConfig: { direction: kind === 'face' ? XR8.XrConfig.camera().FRONT : XR8.XrConfig.camera().BACK },
        verbose: qs.has('verbose'),
      });
      if (kind === 'world') this.wh.restart();
    } catch (e) {
      this.failPending(classify(e));
    }
    return result;
  }

  /** Stop the camera (back to the showcase). */
  stop(): void {
    if (this.pending) this.failPending(new EngineError('error', 'Stopped'));
    if (this.kind === 'none') return;
    this.halt();
    this.canvas.hidden = true;
  }

  private halt(): void {
    this.releaseGpu();
    try { window.XR8?.stop(); } catch (e) { this.diag.errors.push('stop: ' + String(e)); }
    this.kind = 'none';
    this.live = false;
    this.tracking = '';
  }

  private configureTracker(kind: 'world' | 'face'): void {
    const XR8 = window.XR8;
    if (kind === 'world') XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive' });
    else XR8.FaceController.configure({ meshGeometry: [XR8.FaceController.MeshGeometry.FACE], coordinates: { mirroredDisplay: true }, maxDetections: 1, enableEars: false });
  }
  private trackerModules(kind: 'world' | 'face'): unknown[] {
    const XR8 = window.XR8;
    this.configureTracker(kind);
    return kind === 'world' ? [XR8.XrController.pipelineModule(), this.wh.module] : [XR8.FaceController.pipelineModule()];
  }

  private failPending(err: EngineError): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    this.diag.errors.push(`${err.reason}: ${err.message}`.slice(0, 200));
    if (err.message !== 'Superseded' && err.message !== 'Stopped' && this.kind !== 'none') {
      this.halt();
      this.canvas.hidden = true;
    }
    p.reject(err);
  }

  // ------------------------------------------------------------------ GPU housekeeping
  // Free the dropped renderer's buffers, programs and bone textures (the next renderer builds its own). GL textures
  // are NOT freed: the next renderer adopts them (same context).
  private releaseGpu(): void {
    const r = this.xr?.renderer;
    if (!r) return;
    this.hooks.releaseRenderer(r);
    const seen = new Set<unknown>();
    for (const root of this.roots) root.traverse((o) => {
      if (o.userData.cbxOwnGpu) return; // the bear frees its own (releaseRenderer)
      const m = o as THREE.Mesh & THREE.SkinnedMesh;
      if (m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); m.geometry.dispose(); }
      if (m.isSkinnedMesh && m.skeleton?.boneTexture) m.skeleton.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        mat.dispose();
      }
    });
    glTidy(r);
    this.lastRenderer = r; // same canvas, same GL context: the next run's renderer adopts the textures
    this.xr = null;
    this.texQueue.length = 0;
  }

  private adoptTextures(from: THREE.WebGLRenderer, to: THREE.WebGLRenderer): number {
    let n = 0;
    const seen = new Set<THREE.Texture>();
    const one = (t: THREE.Texture) => {
      if (!t || !t.isTexture || seen.has(t)) return;
      seen.add(t);
      const a = from.properties.get(t) as Record<string, unknown>;
      if (!a.__webglTexture) return;
      const b = to.properties.get(t) as Record<string, unknown>;
      if (b.__webglTexture) return;
      b.__webglTexture = a.__webglTexture;
      b.__webglInit = true;
      b.__version = a.__version;
      n++;
    };
    if (this.envRT) one(this.envRT.texture);
    for (const root of this.roots) root.traverse((o) => {
      for (const m of ([] as THREE.Material[]).concat(((o as THREE.Mesh).material as THREE.Material) ?? [])) {
        for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture) one(v as THREE.Texture);
      }
    });
    return n;
  }

  private ensureEnv(): void {
    const xr = this.xr;
    if (!xr) return;
    if (!this.envRT) {
      this.wh.busy('env');
      const pm = new THREE.PMREMGenerator(xr.renderer);
      this.envRT = pm.fromScene(new RoomEnvironment(), 0.04);
      pm.dispose();
      glTidy(xr.renderer);
      this.wh.busy('');
    }
    xr.scene.environment = this.envRT.texture;
    xr.scene.environmentIntensity = 0.7;
  }

  /**
   * Once per run, in the run's first callback (onStart), before SLAM has seen a frame: the env map, every root's
   * shaders (issued now, finished in the background where the GPU driver compiles in parallel) and every texture
   * uploaded at once. The one long frame lands where it costs nothing: no map exists yet. Content stays hidden and
   * Place waits until the programs are ready AND tracking has settled.
   */
  private prepare(): void {
    if (this.prepared || this.preparing || !this.xr) return;
    this.preparing = true;
    const xr = this.xr;
    const t0 = now();
    this.ensureEnv();
    this.wh.busy('compile');
    this.burst = true;
    const all = Promise.all([...this.roots].map((r) => this.warm(r)));
    this.burst = false; // the synchronous part of every warm() has run (programs issued, textures uploaded)
    this.wh.note(`prepare ${Math.round(now() - t0)} ms`);
    all.finally(() => {
      this.wh.busy('');
      if (this.xr === xr) {
        this.prepared = true;
        this.wh.note(`programs ready ${Math.round(now() - t0)} ms, ${xr.renderer.info.programs?.length ?? 0}`);
      }
      this.preparing = false;
    });
  }

  // ------------------------------------------------------------------ the pipeline module
  private appModule = {
    name: 'cheerbear-experience',
    onStart: () => {
      try {
        const xr = window.XR8.Threejs.xrScene() as XrScene;
        this.setup(xr);
      } catch (e) {
        console.error('[experience] engine onStart failed', e);
        this.failPending(new EngineError('error', String((e as Error)?.message ?? e)));
      }
    },
    onRender: () => {
      // the engine shares three's GL context: leave the pixel-store flags at their defaults (canvas textures set
      // UNPACK_FLIP_Y; the face chunk then fails to upload its own textures)
      const r = this.xr?.renderer;
      if (r) {
        const gl = r.getContext();
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      }
      recorder.frame(this.canvas); // the frame is drawn (three renders before us): video clips copy it now
    },
    onUpdate: ({ processCpuResult }: { processCpuResult?: { reality?: { trackingStatus?: string } } }) => {
      const t = now();
      const dt = Math.min(0.1, this.last ? (t - this.last) / 1000 : 0.016);
      this.last = t;
      const r = processCpuResult?.reality;
      if (r?.trackingStatus) this.tracking = r.trackingStatus;
      if (!this.xr) return;
      // normally done in onStart (setup); this catches a run whose setup could not
      if (!this.prepared && !this.preparing) this.prepare();
      // textures (only roots warmed later, e.g. a mode built after the run started): two uploads per frame at most
      for (let i = 0; i < 2 && this.texQueue.length; i++) {
        const tex = this.texQueue.shift()!;
        try { this.xr.renderer.initTexture(tex); } catch { /* not ready (video) */ }
      }
      this.hooks.onUpdate(dt, t);
    },
    onCameraStatusChange: ({ status }: { status: string }) => {
      if (status === 'hasVideo') {
        if (this.live) return; // XR8.resume() fires it again
        this.live = true;
        const p = this.pending;
        if (p) {
          this.pending = null;
          clearTimeout(p.timer);
          p.resolve();
        }
      } else if (status === 'failed') {
        const err = new EngineError('permission', 'Camera access was blocked or the camera is busy.');
        if (this.pending) this.failPending(err);
        else if (this.live) this.hooks.onRuntimeError(err);
      }
    },
    onException: (e: unknown) => {
      const err = classify(e);
      console.warn('[experience] engine exception', err.reason, err.message);
      if (this.pending) this.failPending(err);
      else if (this.live) {
        this.diag.errors.push('XR: ' + err.message.slice(0, 200));
      }
    },
    listeners: [
      { event: 'reality.trackingstatus', process: ({ detail }: { detail: { status: string } }) => { this.tracking = detail.status; } },
      ...FACE_EVENTS.map((n) => ({
        event: 'facecontroller.' + n,
        process: ({ detail }: { detail: unknown }) => this.hooks.onFace({
          type: n === 'faceloading' ? 'loading' : n === 'facefound' ? 'found' : n === 'faceupdated' ? 'updated' : n === 'facelost' ? 'lost' : 'other',
          name: n, detail,
        }),
      })),
    ],
  };

  private setup(xr: XrScene): void {
    const prev = this.xr?.renderer ?? this.lastRenderer;
    this.lastRenderer = null;
    this.xr = xr;
    const { scene, camera, renderer } = xr;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    if (prev && prev !== renderer) this.diag.adopted = this.adoptTextures(prev, renderer);
    if (this.envRT) { scene.environment = this.envRT.texture; scene.environmentIntensity = 0.7; }
    for (const r of this.roots) scene.add(r);
    if (this.kind === 'world') {
      camera.position.set(0, CAM_H, 0);
      camera.quaternion.identity();
      window.XR8.XrController.updateCameraProjectionMatrix({ origin: camera.position, facing: camera.quaternion });
    } else {
      camera.position.set(0, 0, 0);
      camera.quaternion.identity();
    }
    const gl = renderer.getContext();
    this.canvas.addEventListener('webglcontextlost', this.onContextLost, { once: true });
    void gl;
    this.hooks.onScene(xr, this.kind);
    this.wh.note(`run ${this.kind}`);
    // compile + upload everything NOW, before SLAM has processed a frame (ar-4)
    this.prepare();
  }

  private onContextLost = () => {
    this.lastRenderer = null;
    this.diag.errors.push('webglcontextlost');
    this.hooks.onRuntimeError(new EngineError('error', 'The graphics restarted.'));
  };

  private onResize = () => {
    if (this.kind !== 'none') this.wh.sizeCanvas();
  };

  private onVisibility = () => {
    const XR8 = window.XR8;
    if (!XR8 || this.kind === 'none') return;
    try {
      if (document.visibilityState === 'hidden' && this.live) { XR8.pause(); this.hiddenPaused = true; }
      else if (document.visibilityState === 'visible' && this.hiddenPaused) { this.hiddenPaused = false; XR8.resume(); }
    } catch { /* not running */ }
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    try { window.XR8?.clearCameraPipelineModules(); } catch { /* none */ }
    this.envRT?.dispose();
    this.canvas.remove();
  }
}

/** Never leave a deleted program bound; leave pixel-store flags at their defaults (shared GL context). */
export function glTidy(r: THREE.WebGLRenderer): void {
  try {
    r.state.useProgram(null as unknown as WebGLProgram);
    const gl = r.getContext();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  } catch { /* lost context */ }
}

function classify(e: unknown): EngineError {
  const o = e as { type?: string; message?: string } | null;
  const msg = String(o?.message ?? (typeof e === 'object' ? JSON.stringify(e) : e));
  if (o && o.type === 'permission') return new EngineError('permission', 'Motion and camera access are needed.');
  if (/permission|denied|notallowed/i.test(msg)) return new EngineError('permission', msg);
  if (/session manager|not supported|unsupported|device/i.test(msg)) return new EngineError('unsupported', msg);
  return new EngineError('error', msg);
}
