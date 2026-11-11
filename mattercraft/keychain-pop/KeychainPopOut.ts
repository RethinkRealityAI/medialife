import { ContextManager, Observable, registerLoadable, useOnBeforeRender } from "@zcomponent/core";
import { Group } from "@zcomponent/three/lib/components/Group";
import { useCamera } from "@zcomponent/three/lib/scenecontext";
import { useRenderer } from "@zcomponent/three/lib/context";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

interface ConstructorProps {
  /**
   * Bobo model (GLB). Leave as is to use the hosted file, or drop the GLB into the project and
   * paste its URL here.
   * @zui
   * @zdefault https://medialife.ai/evade/keychain/ar/bobo-keychain.glb
   */
  boboModel?: string;
  /**
   * Eclipse can model (GLB).
   * @zui
   * @zdefault https://medialife.ai/evade/keychain/ar/eclipse-can.glb
   */
  canModel?: string;
}

const DEF_BOBO = "https://medialife.ai/evade/keychain/ar/bobo-keychain.glb";
const DEF_CAN = "https://medialife.ai/evade/keychain/ar/eclipse-can.glb";

type Char = {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Record<string, THREE.AnimationClip>;
  current: THREE.AnimationAction | null;
  height: number;
};

/**
 * Keychain pop-out: Bobo and the Eclipse can jump out of the EVADE keychain in 3D when the
 * keychain is found. Put this inside the Image Tracker that tracks the Bobo charm. Tap Bobo to
 * make him wave, tap the can to spin it.
 *
 * @zcomponent
 * @zicon pets
 * @ztag three/Object3D/Group/KeychainPopOut
 * @zparents three/Object3D/Group/**
 */
export class KeychainPopOut extends Group {
  /**
   * Play the pop-out automatically each time the keychain is found.
   * @zui
   * @zgroup Pop-out
   * @zgrouppriority 100
   * @zpriority 10
   * @zdefault true
   */
  public popOnFound = new Observable<boolean>(true);

  /**
   * Seconds the keychain can be out of view before the characters reset and pop out again
   * next time it is found.
   * @zui
   * @zgroup Pop-out
   * @zpriority 9
   * @zdefault 2
   */
  public resetAfterLost = new Observable<number>(2);

  /**
   * Bobo wave as soon as he lands.
   * @zui
   * @zgroup Pop-out
   * @zpriority 8
   * @zdefault true
   */
  public waveOnLanding = new Observable<boolean>(true);

  /**
   * Bobo's height when he has landed, in tracker units (1 = the height of the tracked image).
   * @zui
   * @zgroup Layout
   * @zgrouppriority 90
   * @zpriority 10
   * @zdefault 1.3
   */
  public boboHeight = new Observable<number>(1.3);

  /**
   * The can's height when it has landed, in tracker units.
   * @zui
   * @zgroup Layout
   * @zpriority 9
   * @zdefault 0.95
   */
  public canHeight = new Observable<number>(0.95);

  /**
   * Where Bobo lands, relative to the tracked image (x right, y up, z out of the image).
   * @zui
   * @zgroup Layout
   * @zpriority 8
   * @zdefault [-0.55, -0.9, 0.6]
   */
  public boboSpot = new Observable<[number, number, number]>([-0.55, -0.9, 0.6]);

  /**
   * Where the can lands, relative to the tracked image.
   * @zui
   * @zgroup Layout
   * @zpriority 7
   * @zdefault [0.6, -0.9, 0.55]
   */
  public canSpot = new Observable<[number, number, number]>([0.6, -0.9, 0.55]);

  /**
   * Where the can starts (its charm), relative to the tracked Bobo charm. The real charms swing,
   * so this is approximate.
   * @zui
   * @zgroup Layout
   * @zpriority 6
   * @zdefault [0.45, -0.15, 0.02]
   */
  public canCharmOffset = new Observable<[number, number, number]>([0.45, -0.15, 0.02]);

  /**
   * Show the glowing landing pads under the characters.
   * @zui
   * @zgroup Look
   * @zgrouppriority 80
   * @zdefault true
   */
  public showPads = new Observable<boolean>(true, (v) => { for (const p of this._pads) p.visible = v && this._shown; });

  private _bobo: Char | null = null;
  private _can: Char | null = null;
  private _pads: THREE.Group[] = [];
  private _shown = false;
  private _lostFor = 0;
  private _tweens: { t: number; dur: number; fn: (k: number) => void; done?: () => void }[] = [];
  private _disposables: { dispose(): void }[] = [];
  private _ray = new THREE.Raycaster();
  private _onTap = (e: PointerEvent) => this._tap(e);
  private _downAt: [number, number] | null = null;
  private _onDown = (e: PointerEvent) => { this._downAt = [e.clientX, e.clientY]; };

  constructor(mgr: ContextManager, public constructorProps: ConstructorProps) {
    super(mgr, constructorProps);
    registerLoadable(mgr, this._load());
    this.register(useOnBeforeRender(mgr), (dt: number) => this._tick(dt * 0.001));
    const canvas = (useRenderer(mgr) as THREE.WebGLRenderer).domElement;
    canvas.addEventListener("pointerdown", this._onDown);
    canvas.addEventListener("pointerup", this._onTap);
  }

  // ------------------------------------------------------------------ public actions
  /** Run the pop-out from the start. */
  public popOut() {
    if (!this._bobo || !this._can) return;
    this._shown = true;
    this._launch(this._bobo, new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(...this.boboSpot.value), this.boboHeight.value, 0, true);
    this._launch(this._can, new THREE.Vector3(...this.canCharmOffset.value), new THREE.Vector3(...this.canSpot.value), this.canHeight.value, 0.18, false);
  }
  /** Bobo raises his paw and waves. */
  public wave() {
    const b = this._bobo; if (!b || !this._shown) return;
    this._play(b, "PawRaise", false, 0.2, () => this._play(b, "Sit", true, 0.3));
  }
  /** Bobo wags his tail. */
  public wagTail() {
    const b = this._bobo; if (!b || !this._shown) return;
    this._play(b, "TailWag", false, 0.2, () => this._play(b, "Sit", true, 0.3));
  }
  /** Hide both characters (they pop out again on the next popOut). */
  public hideCharacters() {
    this._shown = false; this._tweens.length = 0;
    for (const c of [this._bobo, this._can]) if (c) c.root.visible = false;
    for (const p of this._pads) p.visible = false;
  }

  // ------------------------------------------------------------------ internals
  private async _load() {
    const loader = new GLTFLoader();
    const [b, c] = await Promise.all([
      loader.loadAsync(this.constructorProps.boboModel || DEF_BOBO),
      loader.loadAsync(this.constructorProps.canModel || DEF_CAN),
    ]);
    this._bobo = this._prep(b);
    this._can = this._prep(c);
    for (let i = 0; i < 2; i++) {
      const p = this._makePad(); p.visible = false; this.element.add(p); this._pads.push(p);
    }
  }

  private _prep(gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] }): Char {
    const root = new THREE.Group(); const model = gltf.scene;
    const mixer = new THREE.AnimationMixer(model);
    const clips: Record<string, THREE.AnimationClip> = {};
    for (const a of gltf.animations) clips[a.name] = a;
    // measure in the resting clip: Bobo's bind pose is on all fours, the keychain pose is sitting
    const restClip = clips.Sit || clips.Idle;
    if (restClip) { mixer.clipAction(restClip).play(); mixer.setTime(0); }
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    mixer.stopAllAction();
    const h = Math.max(1e-4, box.max.y - box.min.y);
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.frustumCulled = false; });
    root.add(model); root.visible = false; this.element.add(root);
    model.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if ((o as THREE.Mesh).geometry) this._disposables.push((o as THREE.Mesh).geometry);
      if (m) for (const mm of Array.isArray(m) ? m : [m]) this._disposables.push(mm);
    });
    return { root, model, mixer, clips, current: null, height: h };
  }

  private _makePad() {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(0.6, "rgba(0,0,0,.15)");
    gr.addColorStop(0.7, "rgba(79,180,255,.9)"); gr.addColorStop(0.78, "rgba(232,91,216,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.CircleGeometry(0.5, 48);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    this._disposables.push(tex, geo, mat);
    const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.raycast = () => undefined;
    const grp = new THREE.Group(); grp.add(m); return grp;
  }

  private _play(ch: Char, name: string, loop: boolean, fade: number, onDone?: () => void) {
    const clip = ch.clips[name]; if (!clip) return;
    const next = ch.mixer.clipAction(clip);
    next.reset(); next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = !loop; next.enabled = true; next.setEffectiveWeight(1);
    if (ch.current && ch.current !== next) {
      if (fade > 0) next.crossFadeFrom(ch.current, fade, false); else ch.current.stop();
    }
    next.play(); ch.current = next;
    if (onDone) {
      const h = (e: any) => { if (e.action === next) { ch.mixer.removeEventListener("finished", h); onDone(); } };
      ch.mixer.addEventListener("finished", h);
    }
  }

  private _launch(ch: Char, from: THREE.Vector3, to: THREE.Vector3, height: number, delay: number, isBobo: boolean) {
    const sFinal = height / ch.height;
    const s0 = (isBobo ? 1.0 : 0.85) / ch.height;     // starts the size of its flat charm
    const startFeet = from.clone().add(new THREE.Vector3(0, -0.5 * (isBobo ? 1.0 : 0.85), 0));
    const pad = this._pads[isBobo ? 0 : 1];
    ch.root.visible = false;
    this._tweens.push({ t: -delay, dur: 1.0, fn: (k) => {
      if (k <= 0) return;
      if (!ch.root.visible) {
        ch.root.visible = true; ch.root.rotation.set(0, 0, 0);
        this._play(ch, "PopOut", false, 0, () => {
          this._play(ch, isBobo ? "Sit" : "Idle", true, 0.3);
          if (isBobo && this.waveOnLanding.value) this._tweens.push({ t: 0, dur: 0.5, fn: () => undefined, done: () => this.wave() });
        });
      }
      const e = 1 - Math.pow(1 - k, 3);
      ch.root.position.lerpVectors(startFeet, to, e);
      ch.root.position.y += Math.sin(k * Math.PI) * 0.6;
      ch.root.scale.setScalar(THREE.MathUtils.lerp(s0, sFinal, e));
      pad.visible = this.showPads.value;
      pad.position.copy(to); pad.scale.setScalar(height * (isBobo ? 1.0 : 0.75) * (0.2 + 0.8 * e));
    } });
  }

  private _trackedVisible() {
    let o: THREE.Object3D | null = this.element;
    while (o) { if (!o.visible) return false; o = o.parent; }
    return true;
  }

  private _tick(dt: number) {
    const vis = this._trackedVisible();
    if (vis) {
      this._lostFor = 0;
      if (!this._shown && this.popOnFound.value && this._bobo && this._can) this.popOut();
    } else if (this._shown) {
      this._lostFor += dt;
      if (this._lostFor > this.resetAfterLost.value) this.hideCharacters();
    }
    for (let i = this._tweens.length - 1; i >= 0; i--) {
      const w = this._tweens[i]; w.t += dt; const k = Math.min(w.t / w.dur, 1); w.fn(k);
      if (k >= 1) { this._tweens.splice(i, 1); w.done?.(); }
    }
    this._bobo?.mixer.update(dt); this._can?.mixer.update(dt);
    for (const p of this._pads) p.rotation.y += dt * 0.6;
  }

  private _tap(e: PointerEvent) {
    if (!this._shown || !this._downAt) return;
    if (Math.hypot(e.clientX - this._downAt[0], e.clientY - this._downAt[1]) > 10) return;
    const cam = useCamera(this.contextManager).value; if (!cam) return;
    const el = e.target as HTMLElement; const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(ndc, cam);
    // skinned meshes: hit-test a box around each character
    const hit = (c: Char | null) => !!c && c.root.visible && this._ray.ray.intersectsBox(new THREE.Box3().setFromObject(c.root));
    if (hit(this._bobo)) this.wave();
    else if (hit(this._can) && this._can) {
      const c = this._can; const r0 = c.root.rotation.y; const y0 = c.root.position.y;
      this._tweens.push({ t: 0, dur: 0.9, fn: (k) => {
        const s = k * k * (3 - 2 * k);
        c.root.rotation.y = r0 + Math.PI * 2 * s; c.root.position.y = y0 + Math.sin(k * Math.PI) * 0.25;
      } });
    }
  }

  public dispose() {
    const canvas = (useRenderer(this.contextManager) as THREE.WebGLRenderer).domElement;
    canvas.removeEventListener("pointerdown", this._onDown);
    canvas.removeEventListener("pointerup", this._onTap);
    for (const d of this._disposables) d.dispose();
    return super.dispose();
  }
}
