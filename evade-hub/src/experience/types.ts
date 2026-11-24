// The experience's internal contracts: how a mode plugs into the engine and the HUD.
//
// A mode is one way of seeing Bobo (3D showcase, AR in the room, selfie filter, 3D photo). The experience
// (src/experience/index.ts) owns ONE engine session, ONE HUD and ONE bear; modes borrow them through `ModeContext`.
//
//   showcase  camera 'none'  : its own three.js renderer, works on computers (src/experience/modes/showcase)
//   ar        camera 'world' : 8th Wall engine binary SLAM, back camera     (src/experience/modes/ar)
//   face      camera 'face'  : face effects, front camera                   (src/experience/modes/face, xr-capture)
//   photo     camera 'world' : 3D photo with the back camera                (src/experience/modes/photo, xr-capture)
//
// Adding a mode: export `createMode(ctx: ModeContext): Mode` (default export works too) from
// `src/experience/modes/<id>/index.ts`. The experience finds `modes/face/index.ts` and `modes/photo/index.ts` with
// import.meta.glob, so no file outside your folder needs to change; until they exist, placeholders run
// (src/experience/placeholders/). See docs/handoff/xr-core.md for a worked example.
import type * as THREE from 'three';
import type { BearCharacter, ExperienceEvents, ExperienceMode } from '../shared/contracts';

export type CameraKind = 'none' | 'world' | 'face';

/** What the engine hands over on every `XR8.run` (a NEW scene, camera and renderer each time). */
export interface XrScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

/** Face events from the engine (`facecontroller.*`), forwarded to the active face-camera mode. */
export interface FaceEvent {
  type: 'loading' | 'found' | 'updated' | 'lost' | 'other';
  /** The engine's event name without the `facecontroller.` prefix (e.g. 'faceupdated', 'mouthopened'). */
  name: string;
  /** The engine's `detail` object as-is (transform, vertices, attachmentPoints, id...). */
  detail: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Mode {
  readonly id: ExperienceMode;
  /** Which camera the mode needs. 'world' and 'face' run in the one engine session; 'none' renders by itself. */
  readonly camera: CameraKind;
  /**
   * Persistent content for camera modes. The engine adds it to EVERY new engine scene (each `XR8.run` makes a new
   * scene/camera/renderer). Keep everything the mode shows under it. Hidden while the mode is not active.
   */
  readonly root?: THREE.Object3D;
  /** Optional: load the mode's assets. Called once, after the splash assets, in the background. */
  load?(): Promise<void>;
  /**
   * The engine started a run and handed over a new scene/camera/renderer (also on a camera swap back). Your
   * `root` is already in `xr.scene`. Compile shaders here (`ctx.engine.warm(root)`), never when something appears.
   */
  onScene?(xr: XrScene): void;
  /** The mode is now live (camera modes: the camera has video). `from` is the mode we came from. */
  enter(from: ExperienceMode | null): void | Promise<void>;
  /** Leaving: stop sounds, hide your HUD bits, remember what should survive (placement, state). */
  exit(to: ExperienceMode): void | Promise<void>;
  /** Once per rendered frame while active. dt in seconds (clamped), now = performance.now(). */
  update(dt: number, now: number): void;
  /** A trigger word arrived while this mode is active. Return false if this mode ignores it. */
  trigger?(name: string, source: 'api' | 'tap'): boolean;
  /** Face events (face camera modes only). */
  onFace?(ev: FaceEvent): void;
  /** Taps on the scene (not on HUD buttons), canvas-relative CSS pixels + NDC. Return true if handled. */
  onTap?(x: number, y: number, ndc: THREE.Vector2): boolean;
  /**
   * A voice / app command (ExperienceApi.command). Return true when handled. Optional: without it the experience
   * presses the mode's own shutter / data-cmd="place|move" buttons (src/experience/commands.ts).
   */
  command?(name: import('../shared/contracts').ExperienceCommand): boolean;
  /** Start again (menu): reset to a fresh state. */
  reset?(): void;
  dispose?(): void;
}

export type ModeFactory = (ctx: ModeContext) => Mode;

/** The engine session as a mode sees it (src/experience/core/engine.ts). */
export interface EngineView {
  /** Current engine scene/camera/renderer (null while the engine is not running). */
  readonly xr: XrScene | null;
  readonly canvas: HTMLCanvasElement;
  /** 'NORMAL' | 'LIMITED' | '' (world tracking only). */
  readonly tracking: string;
  /** World tracking has settled for this run (gate Place and restoring placed content on it). */
  settled(): boolean;
  /** Mark heavy work for the stall log: `busy('loading')` ... `busy('')`. */
  busy(what: string): void;
  /**
   * Compile `root`'s shaders for the current renderer without stalling the frame (KHR_parallel_shader_compile when
   * available) and upload its textures a few per frame. Everything under `root` is made visible for the compile.
   */
  warm(root: THREE.Object3D): Promise<void>;
  /** A ray from the camera through NDC (refreshes the engine camera's projection inverse first). */
  ray(ndc: THREE.Vector2): THREE.Raycaster;
  /** Camera + 3D as drawn (base64 JPEG decoded to an image). Camera modes only. */
  screenshot(): Promise<HTMLImageElement>;
  /** World: tracking is calm right now (NORMAL long enough, no recent stall). Not latched like `settled()`. (ar-4) */
  calm?(): boolean;
  /** World: restart SLAM where the phone is (XR8.XrController.recenter) and re-arm the settled gate. (ar-4) */
  recenter?(): boolean;
  /** A breadcrumb for the ?diag overlay and the health snapshot. (ar-4) */
  note?(what: string): void;
  /** The active mode's line in the ?diag overlay. (ar-4) */
  diagLine?: (() => string) | null;
}

/** HUD helpers (src/experience/hud/hud.ts). Everything is optional to use. */
export interface HudApi {
  /** The in-camera hint pill: about 5 words, white on black glass. '' hides it. */
  hint(text: string): void;
  /** A short toast in the middle of the screen. */
  toast(text: string, ms?: number): void;
  /** Bottom-left slot (Move lives here once placed). Append your buttons; the HUD removes nothing of yours. */
  readonly left: HTMLElement;
  /** Bottom-right slot (the Moves button in 3D and AR). */
  readonly right: HTMLElement;
  /** Bottom-centre slot: the joystick (walking modes) or the shutter (capture modes). Never put two things here. */
  readonly centre: HTMLElement;
  /** Above the bottom row, centred (contextual pills like Place, lens rows). */
  readonly above: HTMLElement;
  /** A full-width layer over the scene under the HUD chrome, for mode overlays (photo review, etc.). */
  readonly layer: HTMLElement;
  /** A standard round tool button (icon + short label). */
  toolButton(opts: { label: string; icon: string; aria?: string; onClick: () => void; tone?: 'orange' | 'navy' }): HTMLButtonElement;
  /** The standard white shutter button (76 px). Put it in `centre`. */
  /** With `hold`: tap = photo, press and hold = video. */
  shutter(onClick: () => void, aria?: string, hold?: { start(): boolean; stop(): void }): HTMLButtonElement;
  /** A white flash (photo taken). */
  flash(): void;
  /** Show a sheet with a title, text and buttons. Resolves with the index of the button pressed. */
  sheet(opts: { title: string; body: string; buttons: string[]; html?: string }): Promise<number>;
  /** Joystick (bottom centre). Read `vector` every frame: x right, y down, length <= 1. */
  joystick(show: boolean): { readonly vector: THREE.Vector2; readonly active: boolean };
}

export interface AssetLoader {
  /** GLTFLoader with Meshopt + Draco wired. Cached by URL. */
  gltf(url: string): Promise<import('three/examples/jsm/loaders/GLTFLoader.js').GLTF>;
  texture(url: string, srgb?: boolean): Promise<THREE.Texture>;
}

export interface ModeContext {
  readonly assets: AssetLoader;
  readonly hud: HudApi;
  readonly engine: EngineView;
  /** The one Bobo (null until loaded). Add `bear.object` to your root while active, give it back on exit. */
  readonly bear: BearCharacter | null;
  /** Emit an experience event (photo, action...). */
  emit<K extends keyof ExperienceEvents>(event: K, payload: ExperienceEvents[K]): void;
  /** Hand a finished photo to the app (emits `photo`). */
  capture(blob: Blob): void;
  /** The current mode id (the mode switch is complete once `enter` has resolved). */
  readonly mode: ExperienceMode;
  /** Ask the experience to switch mode (e.g. a mode's own "back" button). Must come from a tap for camera modes. */
  setMode(mode: ExperienceMode): Promise<void>;
  readonly reducedMotion: boolean;
  /** The experience's root element (for sizing, or to put a full-screen overlay in). */
  readonly container: HTMLElement;
}
