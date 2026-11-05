/**
 * A small stand-in for the parts of @zcomponent/core and @zcomponent/three
 * that OrbHuntGame.ts uses, so the real game file can run in the browser test
 * lab (/evade/cola-run-lab/) without the Mattercraft runtime.
 *
 * It is NOT a Mattercraft runtime. It covers exactly what the game touches,
 * and copies Mattercraft's behaviour where the game depends on it:
 *
 *  - Observable: a handler passed to the constructor fires on change only;
 *    `register(observable, fn)` also calls `fn` straight away with the current
 *    value (Observable.addListener's default in @zcomponent/core 1.29).
 *    Setting `value` to undefined restores the default.
 *  - classNameForAlignment: same class names as core, so core's
 *    zcomponent.css rules (reproduced in the lab's CSS) apply.
 *  - SphereTrigger: pairs a trigger with a collider (different isTrigger,
 *    a shared tag); world radius = the element's world scale. Overlaps are
 *    checked once per frame by LabContext.step().
 *  - useOnBeforeRender: dt in milliseconds.
 *
 * Build: node scripts/build-cola-capture.mjs (bundles OrbHuntGame.ts with
 * these aliases into public/evade/cola-run-lab/assets/orb-hunt-game.js).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- a loose stand-in for untyped Mattercraft APIs */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* ── events and observables ───────────────────────────────────────────── */

type Fn = (...args: any[]) => void;

class Emitter {
  protected _fns: Fn[] = [];
  addListener(fn: Fn, _priority?: number) {
    if (!this._fns.includes(fn)) this._fns.push(fn);
  }
  removeListener(fn: Fn) {
    this._fns = this._fns.filter((f) => f !== fn);
  }
  protected _emit(...args: any[]) {
    for (const f of this._fns.slice()) {
      try {
        f(...args);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

export class Event<A extends any[] = []> extends Emitter {
  emit(...args: A) {
    this._emit(...args);
  }
}

export class Observable<T = any> extends Emitter {
  private _v: T;
  private readonly _def: T;
  readonly __z_is_observable = true;
  constructor(def: T, handler?: (v: T) => void) {
    super();
    this._def = def;
    this._v = def;
    if (handler) super.addListener(handler);
  }
  get value(): T {
    return this._v;
  }
  set value(v: T) {
    v = (v ?? this._def) as T;
    const changed = v !== this._v;
    this._v = Array.isArray(v) ? (v.slice() as unknown as T) : v;
    if (changed) this._emit(this._v);
  }
  addListener(fn: Fn, priority?: number, callImmediately = true) {
    super.addListener(fn, priority);
    if (callImmediately) {
      try {
        fn(this._v);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

/* ── alignment (same class names as @zcomponent/core) ─────────────────── */

export enum HorizontalAlignment {
  left = "left",
  leftSafe = "leftSafe",
  center = "center",
  right = "right",
  rightSafe = "rightSafe",
}
export enum VerticalAlignment {
  top = "top",
  topSafe = "topSafe",
  center = "center",
  bottom = "bottom",
  bottomSafe = "bottomSafe",
}
const H_CLASS: Record<string, string> = {
  left: "zcomponent-h-left",
  leftSafe: "zcomponent-h-left-safe",
  center: "zcomponent-h-center",
  right: "zcomponent-h-right",
  rightSafe: "zcomponent-h-right-safe",
};
const V_CLASS: Record<string, string> = {
  top: "zcomponent-v-top",
  topSafe: "zcomponent-v-top-safe",
  center: "zcomponent-v-center",
  bottom: "zcomponent-v-bottom",
  bottomSafe: "zcomponent-v-bottom-safe",
};
export function classNameForAlignment(h: HorizontalAlignment, v: VerticalAlignment) {
  const hc = h === HorizontalAlignment.center;
  const vc = v === VerticalAlignment.center;
  const t =
    hc && vc
      ? "zcomponent-hc-vc"
      : hc
        ? "zcomponent-hc-v"
        : vc
          ? "zcomponent-h-vc"
          : "zcomponent-h-v";
  return ["zcomponent-align", H_CLASS[h], V_CLASS[v], t].join(" ");
}

/* ── the lab's "scene": what Mattercraft's contexts would provide ─────── */

/** A timeline the lab offers to the game (lounge poses, win, etc.). */
export interface LabClip {
  play(): void;
  stop?(): void;
}

class LayerClip {
  public layer: { active: LayerClip | null; setActive: (c: LayerClip | null) => void };
  public clip = { _streamTracks: [] as unknown[] };
  constructor(private readonly _c: LabClip) {
    const layer = {
      active: null as LayerClip | null,
      setActive: (c: LayerClip | null) => {
        layer.active = c;
      },
    };
    this.layer = layer;
  }
  seek(_t: number, _o?: unknown) {}
  play() {
    this.layer.active = this;
    this._c.play();
  }
  stop() {
    this._c.stop?.();
  }
}

export interface LabContextOptions {
  overlay: HTMLElement;
  camera: THREE.Camera;
  audioContext: AudioContext;
  /** Where the game's sound goes (the recorder taps this too). */
  audioLayer: AudioNode;
  loader?: GLTFLoader;
}

export class LabContext {
  readonly overlay: Observable<HTMLElement>;
  readonly camera: Observable<THREE.Camera>;
  readonly audioContext: AudioContext;
  readonly audioLayer: AudioNode;
  readonly loader: GLTFLoader;
  readonly beforeRender = new Event<[number]>();
  readonly nodes = new Map<string, { element: THREE.Object3D; children: unknown[] }>();
  readonly layerClipByID = new Map<string, LayerClip>();
  readonly triggers = new Set<SphereTrigger>();
  private _constructed!: () => void;
  readonly constructed = new Promise<void>((r) => (this._constructed = r));

  constructor(o: LabContextOptions) {
    this.overlay = new Observable(o.overlay);
    this.camera = new Observable(o.camera);
    this.audioContext = o.audioContext;
    this.audioLayer = o.audioLayer;
    this.loader = o.loader ?? new GLTFLoader();
  }

  /** Make a plain three.js object pickable by node id (e.g. Player Node). */
  addNode(id: string, element: THREE.Object3D, children: unknown[] = []) {
    this.nodes.set(id, { element, children });
  }
  /** Offer a timeline by id (what a Timeline/State dropdown would hold). */
  addClip(id: string, clip: LabClip) {
    this.layerClipByID.set(id, new LayerClip(clip));
  }
  /** Call once every prop is set: the game binds its player and opens the intro. */
  markConstructed() {
    this._constructed();
  }
  get(ctx: unknown) {
    if (ctx === AudioContextContext) return { getLayer: () => this.audioLayer };
    throw new Error("Not available in the lab");
  }

  /** One frame: triggers first, then the game's onBeforeRender (dt in seconds). */
  step(dtSeconds: number) {
    this._stepTriggers();
    this.beforeRender.emit(dtSeconds * 1000);
  }

  private readonly _pa = new THREE.Vector3();
  private readonly _pb = new THREE.Vector3();
  private readonly _sa = new THREE.Vector3();
  private _stepTriggers() {
    const list = [...this.triggers].filter((t) => t.enabled.value && t.element.parent);
    for (const t of list) t.element.updateWorldMatrix(true, false);
    for (const a of list) {
      if (!a.isTrigger.value) continue;
      for (const b of list) {
        if (b.isTrigger.value) continue;
        if (!a.tags.value.some((tag: string) => b.tags.value.includes(tag))) continue;
        a.element.getWorldPosition(this._pa);
        b.element.getWorldPosition(this._pb);
        const ra = a.element.getWorldScale(this._sa).x;
        const rb = b.element.getWorldScale(this._sa).x;
        const touching =
          visibleInWorld(a.element) &&
          visibleInWorld(b.element) &&
          this._pa.distanceTo(this._pb) <= ra + rb;
        const was = a._touching.has(b);
        if (touching && !was) {
          a._touching.add(b);
          b._touching.add(a);
          a.onCollisionEnter.emit({ otherTrigger: b });
          b.onCollisionEnter.emit({ otherTrigger: a });
        } else if (!touching && was) {
          a._touching.delete(b);
          b._touching.delete(a);
          a.onCollisionExit.emit({ otherTrigger: b });
          b.onCollisionExit.emit({ otherTrigger: a });
        }
      }
    }
  }
}

function visibleInWorld(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

export type ContextManager = LabContext;

/* ── hooks ────────────────────────────────────────────────────────────── */

export const useOverlay = (cm: LabContext) => cm.overlay;
export const useOnBeforeRender = (cm: LabContext) => cm.beforeRender;
export const useCamera = (cm: LabContext) => cm.camera;
export const useAudioContext = (cm: LabContext) => cm.audioContext;
export const AudioContextContext = { name: "AudioContextContext" };

/* ── components ───────────────────────────────────────────────────────── */

export class Component {
  public children: unknown[] = [];
  private _registered: [Emitter, Fn][] = [];
  constructor(
    public contextManager: LabContext,
    public constructorProps: any = {},
  ) {}
  register(e: Emitter, fn: Fn, _o?: unknown) {
    if (this._registered.some(([a, b]) => a === e && b === fn)) return;
    this._registered.push([e, fn]);
    e.addListener(fn);
  }
  unregister(e: Emitter, fn: Fn) {
    e.removeListener(fn);
    this._registered = this._registered.filter(([a, b]) => a !== e || b !== fn);
  }
  getZComponentInstance() {
    const cm = this.contextManager;
    return {
      constructed: cm.constructed,
      resolveNodeID: <T>(id: string) => cm.nodes.get(id) as unknown as T | undefined,
      animation: { layerClipByID: cm.layerClipByID },
    };
  }
  dispose() {
    for (const [e, fn] of this._registered) e.removeListener(fn);
    this._registered = [];
  }
}

export class Object3D extends Component {
  public element: THREE.Object3D = new THREE.Group();
}
export class Group extends Object3D {
  public element: THREE.Group = new THREE.Group();
}

export class Audio extends Component {
  public loop = new Observable(false);
  public volume = new Observable(
    1,
    (v) => this._el && (this._el.volume = Math.max(0, Math.min(1, v))),
  );
  private _el?: HTMLAudioElement;
  constructor(cm: LabContext, props: { source?: string }) {
    super(cm, props);
    if (props.source) {
      this._el = new window.Audio(props.source);
      this._el.crossOrigin = "anonymous";
      try {
        cm.audioContext.createMediaElementSource(this._el).connect(cm.audioLayer);
      } catch {
        /* plays straight to the speakers then */
      }
    }
  }
  play(o?: { speed?: number; loop?: boolean }) {
    if (!this._el) return;
    this._el.loop = o?.loop ?? this.loop.value;
    this._el.playbackRate = o?.speed ?? 1;
    void this._el.play().catch(() => undefined);
  }
  stop() {
    if (!this._el) return;
    this._el.pause();
    this._el.currentTime = 0;
  }
  seek(t: number) {
    if (this._el) this._el.currentTime = t;
  }
  dispose() {
    this.stop();
    return super.dispose();
  }
}

export class GLTF extends Group {
  public animationClips = new Observable(new Map<string, THREE.AnimationClip>());
  public nodesByName = new Observable(new Map<string, THREE.Object3D>());
  public mixer = new Observable<THREE.AnimationMixer | undefined>(undefined);
  public streams: Record<string, { stop?: () => void }> = {};
  public loaded: Promise<void>;
  constructor(cm: LabContext, props: { source: string; frustumCulled?: boolean }) {
    super(cm, props);
    this.loaded = cm.loader.loadAsync(props.source).then((g) => {
      const root = g.scene;
      if (props.frustumCulled === false) root.traverse((o) => (o.frustumCulled = false));
      this.element.add(root);
      const names = new Map<string, THREE.Object3D>();
      root.traverse((o) => o.name && names.set(o.name, o));
      this.nodesByName.value = names;
      this.animationClips.value = new Map(g.animations.map((a) => [a.name, a]));
    });
  }
}

export class Image extends Group {
  private readonly _src: string;
  constructor(cm: LabContext, props: { source: string; transparent?: boolean }) {
    super(cm, props);
    this._src = props.source;
  }
  async _load() {
    const tex = await new THREE.TextureLoader().loadAsync(this._src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = tex.image as { width: number; height: number };
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(
        img.width / Math.max(img.width, img.height),
        img.height / Math.max(img.width, img.height),
      ),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    );
    this.element.add(m);
  }
}

export interface CollisionEvent {
  otherTrigger: SphereTrigger;
}

export class SphereTrigger extends Object3D {
  public isTrigger = new Observable(false);
  public tags = new Observable<string[]>([]);
  public enabled = new Observable(true);
  public onCollisionEnter = new Event<[CollisionEvent]>();
  public onCollisionExit = new Event<[CollisionEvent]>();
  /** @internal */ _touching = new Set<SphereTrigger>();
  constructor(cm: LabContext, props: unknown) {
    super(cm, props);
    cm.triggers.add(this);
  }
  dispose() {
    this.contextManager.triggers.delete(this);
    for (const o of this._touching) o._touching.delete(this);
    this.element.removeFromParent();
    return super.dispose();
  }
}
