/**
 * The homepage hero: "the Activation Lens".
 *
 * A field of real MEDIALIFE touchpoints (activated apparel, the EVADE × Bobo
 * keychain, an activated print, AR stickers, the retail fixture, a phone with
 * Cola Run) floats in a dark room as blue holograms. A liquid-glass lens drifts
 * over them, and whatever sits under the glass comes alive: full colour,
 * refracted at the rim like iOS liquid glass. It is the company in one image:
 * MEDIALIFE is the layer that makes physical things come alive.
 *
 * Rendering: the scene goes to an MSAA render target; one full-screen pass then
 * draws the room (pixel grid), turns everything outside the lens into a
 * hologram (luminance + edges + scanlines, in solid MEDIALIFE blue) and draws
 * the glass (magnify, rim refraction, a little chromatic split, specular rim,
 * soft drop shadow). Tone mapping + sRGB happen in that pass because three only
 * applies them when drawing straight to the screen.
 *
 * Plain three.js, loaded on demand by Hero.tsx so it never touches SSR or the
 * first paint. The page shows a static poster until the first frame is ready.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type LensItem = {
  key: string;
  /** What it is, e.g. "Activated apparel" */
  kind: string;
  /** Which one, e.g. "Syndicate AR tee" */
  name: string;
  href: string;
  /** A GLB, or an image shown as a thin card / phone screen */
  src: string;
  shape: "glb" | "card" | "phone";
  /** Turn so the print faces the camera */
  rotY?: number;
  /** Relative size in the field */
  size?: number;
  /** Image aspect (w/h) for cards and phone screens */
  aspect?: number;
};

type Slot = {
  item: LensItem;
  group: THREE.Group;
  inner: THREE.Group;
  /** Anchor in normalised field coords (-1..1) */
  ax: number;
  ay: number;
  z: number;
  phase: number;
  loaded: boolean;
  screen: THREE.Vector2;
  radiusPx: number;
  pop: number;
};

export type LensEvents = {
  /** The item under the glass changed (null = nothing under it). */
  onFocus?: (item: LensItem | null) => void;
  /** Each frame: where the lens is, in CSS px relative to the canvas. */
  onLens?: (x: number, y: number, r: number) => void;
  /** First frame with at least one model drawn. */
  onReady?: () => void;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));

/* Layout of the field, as anchors in [-1, 1] across the canvas. Two layouts:
   wide (text on the left, field on the right) and tall (field above the text). */
const WIDE: [number, number, number][] = [
  [-0.55, 0.42, 0.0], // tee
  [0.25, 0.62, -0.3], // keychain
  [0.88, 0.3, -0.2], // print
  [-0.05, -0.25, 0.1], // phone
  [0.78, -0.48, -0.1], // retail
  [-0.72, -0.62, -0.3], // stickers
];
const TALL: [number, number, number][] = [
  [-0.68, 0.62, 0.0], // tee
  [0.02, 0.78, -0.3], // keychain
  [0.7, 0.55, -0.1], // print
  [-0.05, -0.55, 0.1], // phone
  [0.7, -0.75, -0.2], // retail
  [-0.72, -0.8, -0.3], // stickers
];

export class LensStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private slots: Slot[] = [];
  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private disposed = false;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private tall = false;
  private halfW = 1;
  private halfH = 1;
  private t = 0;

  // lens state, CSS px from the canvas's top-left
  private lens = new THREE.Vector2(-999, -999);
  private lensTarget = new THREE.Vector2();
  private lensR = 120;
  private pointer: THREE.Vector2 | null = null;
  private pointerAt = -99;
  private tourIdx = 0;
  private tourAt = 0;
  private focused: Slot | null = null;
  private readyFired = false;
  private reduced: boolean;
  private mobile: boolean;
  private ro: ResizeObserver;
  private debugNoLens = typeof location !== "undefined" && location.search.includes("nolens");

  // Intro: a liquid-glass orb (a Higgsfield clip on black) drops in and the
  // lens opens where it lands. The clip is composited additively in the glass
  // pass, so black keys out exactly and it works in every browser (no alpha
  // video needed). -1 = not started; then seconds since start.
  private introT = -1;
  private introVideo: HTMLVideoElement | null = null;
  private introTex: THREE.VideoTexture | null = null;
  private grow = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private items: LensItem[],
    private events: LensEvents = {},
    opts: { reducedMotion?: boolean; introSrc?: string } = {},
  ) {
    this.reduced = !!opts.reducedMotion;
    this.mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 768;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Phones: cap the pixel ratio; the glass pass is per-pixel.
    this.dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
    this.lights();

    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples: this.mobile ? 2 : 4,
    });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial());
    this.postScene.add(this.post);

    this.camera.position.set(0, 0, 9);

    const layout = () => (this.tall ? TALL : WIDE);
    this.slots = items.map((item, i) => {
      const group = new THREE.Group();
      const inner = new THREE.Group();
      group.add(inner);
      this.scene.add(group);
      const [ax, ay, z] = layout()[i % 6];
      return {
        item,
        group,
        inner,
        ax,
        ay,
        z,
        phase: i * 1.7,
        loaded: false,
        screen: new THREE.Vector2(),
        radiusPx: 60,
        pop: 0,
      };
    });

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);

    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerleave", this.onLeave);

    this.prepIntro(opts.introSrc);
    this.load();
    if (location.search.includes("debug"))
      (window as unknown as { __lens: LensStage }).__lens = this;
  }

  /* ------------------------------------------------------------ intro */
  private prepIntro(src?: string) {
    // Reduced motion: no drop, the lens just fades open.
    if (!src || this.reduced || this.debugNoLens) return;
    const v = document.createElement("video");
    v.src = src;
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    this.introVideo = v;
    this.introTex = new THREE.VideoTexture(v);
    this.introTex.colorSpace = THREE.NoColorSpace;
    this.introTex.minFilter = THREE.LinearFilter;
    this.post.material.uniforms.tIntro.value = this.introTex;
  }

  /** Called when the first piece is in: play the orb, or open straight away. */
  private beginIntro() {
    const v = this.introVideo;
    if (!v) {
      this.introT = 99;
      return;
    }
    v.play().then(
      () => {
        this.introT = 0;
      },
      () => {
        this.introT = 99; // autoplay refused: skip it
      },
    );
  }

  /* ------------------------------------------------------------ setup */
  private lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe4e8ff, 0x0e0f18, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 3, 4);
    s.add(key);
    const back = new THREE.DirectionalLight(0xbfd8ff, 0.8);
    back.position.set(-2, 1.5, -3);
    s.add(back);
    const rim = new THREE.PointLight(0x3fb6ff, 9, 14, 1.4);
    rim.position.set(-3, 1, 1);
    s.add(rim);
  }

  private async load() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const tex = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Two at a time, in list order: the first pieces arrive quickly on a slow
    // phone link without the rest queuing behind one big file.
    const one = async (slot: Slot) => {
      if (this.disposed) return;
      const { item } = slot;
      try {
        let obj: THREE.Object3D;
        if (item.shape === "glb") {
          const gltf = await loader.loadAsync(item.src);
          obj = gltf.scene;
          obj.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (m && "map" in m && m.map) m.map.anisotropy = Math.min(8, maxAniso);
            if (m) m.side = THREE.DoubleSide;
          });
        } else {
          const map = await tex.loadAsync(item.src);
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = Math.min(8, maxAniso);
          obj =
            item.shape === "card" ? card(map, item.aspect ?? 0.75) : phone(map, item.aspect ?? 0.5);
        }
        if (this.disposed) return;
        const fitted = fit(obj, 1);
        if (item.rotY) fitted.rotation.y = item.rotY;
        slot.inner.add(fitted);
        slot.loaded = true;
        if (!this.readyFired) {
          this.readyFired = true;
          this.beginIntro();
          // Let the frame with it land before the poster fades.
          requestAnimationFrame(() => this.events.onReady?.());
        }
        if (!this.running) this.renderOnce();
      } catch (err) {
        console.warn("[lens] could not load", item.key, err);
      }
    };
    const queue = [...this.slots];
    const worker = async () => {
      while (queue.length) await one(queue.shift()!);
    };
    await Promise.all([worker(), worker()]);
  }

  /* ------------------------------------------------------------ layout */
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.tall = this.w / this.h < 1.05;
    this.renderer.setSize(this.w, this.h, false);
    this.rt.setSize(Math.round(this.w * this.dpr), Math.round(this.h * this.dpr));
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    // Half extents of the view at z = 0
    this.halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z;
    this.halfW = this.halfH * this.camera.aspect;
    const layout = this.tall ? TALL : WIDE;
    this.slots.forEach((s, i) => {
      [s.ax, s.ay, s.z] = layout[i % layout.length];
    });
    this.lensR = this.tall
      ? Math.min(this.w * 0.21, this.h * 0.115)
      : Math.min(this.h * 0.165, this.w * 0.11);
    this.lensR = Math.max(64, this.lensR);
    const u = this.post.material.uniforms;
    u.uRes.value.set(this.w * this.dpr, this.h * this.dpr);
    u.uDpr.value = this.dpr;
    if (this.lens.x < -900) this.lens.copy(this.anchorPx(this.slots[0]));
    if (!this.running) this.renderOnce();
  }

  /** Item size in world units, from the field size. */
  private unit() {
    // A piece at size 1 is about 1.3 lens radii across, so it fits the glass.
    return ((this.lensR * 1.3) / this.h) * this.halfH * 2;
  }

  private anchorWorld(s: Slot, out = new THREE.Vector3()) {
    if (this.tall) {
      // the top ~52% of the canvas (the copy sits below)
      out.set(
        s.ax * this.halfW * 0.7,
        lerp(this.halfH * 0.24, this.halfH * 0.84, (s.ay + 1) / 2),
        s.z,
      );
    } else {
      // the right ~52% of the canvas (the copy sits on the left)
      out.set(
        lerp(this.halfW * 0.08, this.halfW * 0.86, (s.ax + 1) / 2),
        s.ay * this.halfH * 0.68,
        s.z,
      );
    }
    return out;
  }

  private anchorPx(s: Slot) {
    const v = this.anchorWorld(s).project(this.camera);
    return new THREE.Vector2((v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h);
  }

  /* ------------------------------------------------------------ input */
  private onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = this.canvas.getBoundingClientRect();
    this.pointer = new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
    this.pointerAt = this.t;
  };
  private onDown = (e: PointerEvent) => {
    // Touch: tap to move the lens there; it stays a while, then the tour resumes.
    const r = this.canvas.getBoundingClientRect();
    this.pointer = new THREE.Vector2(e.clientX - r.left, e.clientY - r.top);
    this.pointerAt = this.t + (e.pointerType === "mouse" ? 0 : 3);
  };
  private onLeave = (e: PointerEvent) => {
    if (e.pointerType === "mouse") this.pointerAt = this.t - 1.5;
  };

  /** Point the lens at an item (from the caption buttons). */
  focusItem(key: string) {
    const i = this.slots.findIndex((s) => s.item.key === key);
    if (i < 0) return;
    this.tourIdx = i;
    this.tourAt = this.t;
    this.pointer = null;
    this.pointerAt = -99;
    if (!this.running) this.renderOnce();
  }

  /* ------------------------------------------------------------ frame */
  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.frame(Math.min(this.clock.getDelta(), 0.05));
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  private renderOnce() {
    this.frame(0);
  }

  private frame(dt: number) {
    this.t += dt;
    const t = this.t;
    const unit = this.unit();
    const tmp = new THREE.Vector3();

    // Float, turn, bob. Reduced motion: hold still (the lens still moves when
    // the visitor moves it, which is their own motion).
    for (const s of this.slots) {
      s.pop = damp(s.pop, s === this.focused ? 1 : 0, 5, dt || 1);
      const size = unit * (s.item.size ?? 1) * (1 + 0.08 * s.pop);
      this.anchorWorld(s, tmp);
      const bob = this.reduced ? 0 : Math.sin(t * 0.7 + s.phase) * 0.06 * unit;
      s.group.position.set(tmp.x, tmp.y + bob, tmp.z);
      s.group.scale.setScalar(size);
      const sway = this.reduced ? 0 : Math.sin(t * 0.35 + s.phase) * 0.45;
      s.group.rotation.set(this.reduced ? 0 : Math.sin(t * 0.5 + s.phase) * 0.05, sway, 0);
      // where it sits on screen, and roughly how big
      const v = s.group.position.clone().project(this.camera);
      s.screen.set((v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h);
      const edge = s.group.position
        .clone()
        .add(new THREE.Vector3(size * 0.5, 0, 0))
        .project(this.camera);
      s.radiusPx = Math.abs(edge.x - v.x) * 0.5 * this.w;
    }

    // Intro timeline: orb 0-2.2 s, then it hands over to the lens (2.1-2.8 s).
    let introAmt = 0;
    if (this.introT >= 0) {
      if (this.introT < 50) this.introT += dt;
      const it = this.introT;
      introAmt = Math.min(1, it / 0.15) * (1 - smooth(2.05, 2.55, it));
      this.grow = this.introVideo ? backOut(smooth(2.1, 2.8, it)) : smooth(0, 0.5, it);
      if (it < 2.8) this.tourAt = t; // the tour starts after the intro
    }
    const opened = this.grow > 0.9;

    // Where the lens goes: the pointer while it's active, otherwise a tour that
    // visits each loaded piece and rests on it.
    const loaded = this.slots.filter((s) => s.loaded);
    const usePointer = this.pointer && t - this.pointerAt < 1.2;
    if (usePointer && this.pointer) {
      this.lensTarget.copy(this.pointer);
    } else if (loaded.length) {
      const dwell = this.reduced ? 1e9 : 3.6;
      if (t - this.tourAt > dwell) {
        this.tourAt = t;
        this.tourIdx = (this.tourIdx + 1) % this.slots.length;
      }
      let s = this.slots[this.tourIdx % this.slots.length];
      if (!s.loaded) s = loaded[0];
      this.lensTarget.copy(s.screen);
    }
    if (this.debugNoLens) this.lensTarget.set(-600, -600);
    const k = usePointer ? 9 : this.reduced ? 30 : 2.4;
    const inIntro = this.introT >= 0 && this.introT < 2.8 && !usePointer;
    if (dt === 0 || inIntro || this.grow === 0) this.lens.copy(this.lensTarget);
    else {
      this.lens.x = damp(this.lens.x, this.lensTarget.x, k, dt);
      this.lens.y = damp(this.lens.y, this.lensTarget.y, k, dt);
    }

    // What's under the glass?
    let best: Slot | null = null;
    let bestD = Infinity;
    for (const s of loaded) {
      const d = s.screen.distanceTo(this.lens);
      if (d < this.lensR * 0.9 + s.radiusPx * 0.5 && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (!opened) best = null;
    if (best !== this.focused) {
      this.focused = best;
      this.events.onFocus?.(best ? best.item : null);
    }
    this.events.onLens?.(this.lens.x, this.lens.y, this.lensR * Math.max(this.grow, 0.01));

    // Draw
    const u = this.post.material.uniforms;
    u.uLens.value.set(this.lens.x * this.dpr, (this.h - this.lens.y) * this.dpr);
    u.uR.value = Math.max(0.5, this.lensR * this.grow * this.dpr);
    u.uIntroAmt.value = introAmt;
    // The orb sits at (0.5, 0.45 from the top) of its frame, about half the
    // frame wide when it lands: size the frame so it lands lens-sized.
    u.uIntroSize.value = this.lensR * 3.7 * this.dpr;
    u.uTime.value = this.reduced ? 0 : t;
    u.tScene.value = this.rt.texture;
    this.renderer.setRenderTarget(this.rt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.ro.disconnect();
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((mt) => {
        Object.values(mt).forEach(
          (v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose(),
        );
        mt.dispose();
      });
    });
    this.rt.dispose();
    this.introTex?.dispose();
    if (this.introVideo) {
      this.introVideo.pause();
      this.introVideo.removeAttribute("src");
      this.introVideo.load();
    }
    this.post.material.dispose();
    this.renderer.dispose();
  }

  /* ------------------------------------------------------------ the glass */
  private postMaterial() {
    return new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene: { value: null as THREE.Texture | null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uLens: { value: new THREE.Vector2(-9999, -9999) },
        uR: { value: 100 },
        uTime: { value: 0 },
        uDpr: { value: 1 },
        tIntro: { value: null as THREE.Texture | null },
        uIntroAmt: { value: 0 },
        uIntroSize: { value: 400 },
      },
      vertexShader: /* glsl */ `
        void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tScene;
        uniform vec2 uRes;
        uniform vec2 uLens;
        uniform float uR;
        uniform float uTime;
        uniform float uDpr;
        uniform sampler2D tIntro;
        uniform float uIntroAmt;
        uniform float uIntroSize;

        // MEDIALIFE blue, solid (no brand gradients).
        const vec3 BLUE = vec3(0.247, 0.714, 1.0);
        const vec3 BG = vec3(0.020, 0.024, 0.047);

        vec3 aces(vec3 x) {
          const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
        }
        vec3 toSRGB(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }

        // The room: near-black with a fine pixel grid (as on /activated-merch/).
        vec3 room(vec2 px) {
          vec2 g = mod(px / uDpr, 6.0);
          float line = step(g.x, 1.0) + step(g.y, 1.0);
          return BG + vec3(0.035, 0.04, 0.07) * min(line, 1.0);
        }

        vec4 scene(vec2 px) { return texture2D(tScene, px / uRes); }

        float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

        void main() {
          vec2 px = gl_FragCoord.xy;
          vec2 d = px - uLens;
          float dist = length(d);
          float r = dist / uR;
          vec2 dir = dist > 0.0 ? d / dist : vec2(0.0);

          // ---- outside: the hologram ------------------------------------
          vec4 s = scene(px);
          vec3 lit = aces(s.rgb * 1.1);
          float L = lum(lit);
          float o = 1.25 * uDpr;
          vec4 n1 = scene(px + vec2(o, 0.0)), n2 = scene(px - vec2(o, 0.0));
          vec4 n3 = scene(px + vec2(0.0, o)), n4 = scene(px - vec2(0.0, o));
          float e =
            abs(lum(aces(n1.rgb)) - lum(aces(n2.rgb))) + abs(lum(aces(n3.rgb)) - lum(aces(n4.rgb)));
          // silhouette: where coverage changes (so dark pieces still read)
          float sil = abs(n1.a - n2.a) + abs(n3.a - n4.a);
          float scan = 0.72 + 0.28 * sin((px.y / uDpr) * 2.1 - uTime * 3.0);
          vec3 holo = BLUE * (0.13 + pow(L, 0.8) * 0.85 + e * 1.8 + sil * 0.9) * scan;
          float flick = 0.94 + 0.06 * sin(uTime * 13.0 + px.y * 0.01);
          vec3 outside = mix(room(px), room(px) + holo * flick, s.a);

          // ---- inside: the glass ------------------------------------------
          // Magnify a touch, and bend harder near the rim (the liquid-glass edge).
          float rr = clamp(r, 0.0, 1.0);
          float bend = 0.93 + 0.07 * rr * rr;               // < 1 = magnify
          float rim = pow(rr, 7.0) * 0.16;                   // edge refraction
          vec2 base = uLens + d * bend;
          vec2 off = -dir * rim * uR;
          vec2 pR = base + off * 1.0;
          vec2 pG = base + off * 1.035;
          vec2 pB = base + off * 1.07;
          vec4 sR = scene(pR), sG = scene(pG), sB = scene(pB);
          vec3 real = vec3(
            mix(room(pR).r, toSRGB(aces(sR.rgb)).r, sR.a),
            mix(room(pG).g, toSRGB(aces(sG.rgb)).g, sG.a),
            mix(room(pB).b, toSRGB(aces(sB.rgb)).b, sB.a)
          );
          // faint clear tint + a lift toward the top, like light in the glass
          real += vec3(0.03, 0.035, 0.05) * (0.6 + 0.4 * dir.y * rr);

          // specular rim: bright top-left, soft bottom-right, thin dark inner line
          float band = smoothstep(0.90, 0.985, r) * (1.0 - smoothstep(0.985, 1.0, r));
          float light = 0.35 + 0.65 * max(0.0, dot(dir, normalize(vec2(-0.55, 0.85))));
          float light2 = 0.25 * max(0.0, dot(dir, normalize(vec2(0.6, -0.8))));
          real += vec3(1.0) * band * (light + light2) * 0.75;
          real = mix(real, real * 0.82, smoothstep(0.80, 0.93, r) * (1.0 - smoothstep(0.93, 0.99, r)) * 0.5);

          // ---- compose ---------------------------------------------------
          float aa = 1.5 * uDpr / uR;
          float inside = 1.0 - smoothstep(1.0 - aa, 1.0, r);
          vec3 col = mix(outside, real, inside);
          // soft shadow just outside the glass
          float sh = (1.0 - inside) * (1.0 - smoothstep(1.0, 1.32, r)) * 0.55;
          col *= 1.0 - sh;
          // hairline outer edge
          col += vec3(0.55, 0.75, 1.0) * (smoothstep(1.0 - aa, 1.0, r) * (1.0 - smoothstep(1.0, 1.0 + aa * 1.5, r))) * 0.35;
          // intro orb, added over the room (black adds nothing)
          if (uIntroAmt > 0.0) {
            vec2 q = (px - uLens) / uIntroSize + vec2(0.5, 0.55);
            if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
              vec3 v = texture2D(tIntro, q).rgb;
              v = max(v - 0.03, 0.0) * 1.04;
              col += v * uIntroAmt;
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }
}

/* ---------------------------------------------------------------- helpers */

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Ease out with a small overshoot: the glass "lands". */
const backOut = (t: number) => {
  const c = 1.4;
  return t <= 0 ? 0 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Centre an object and scale it so its largest side is `size`. */
function fit(obj: THREE.Object3D, size: number) {
  const wrap = new THREE.Group();
  const box = new THREE.Box3().setFromObject(obj);
  const dim = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  obj.position.sub(c);
  wrap.add(obj);
  wrap.scale.setScalar(size / Math.max(dim.x, dim.y, dim.z, 1e-6));
  return wrap;
}

/** A thin printed card (poster, magazine) with a slightly lighter edge. */
function card(map: THREE.Texture, aspect: number) {
  const w = aspect >= 1 ? 1 : aspect;
  const h = aspect >= 1 ? 1 / aspect : 1;
  const face = new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.8 });
  const back = new THREE.MeshStandardMaterial({ color: 0xd9d9e2, roughness: 0.8 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), [
    edge,
    edge,
    edge,
    edge,
    face,
    back,
  ]);
  return m;
}

/** A phone with an image on the screen (a browser game, an AR view). */
function phone(map: THREE.Texture, aspect: number) {
  const g = new THREE.Group();
  const h = 1;
  const w = 0.49;
  const shell = new THREE.Mesh(
    roundedSlab(w, h, 0.045, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x15161d, roughness: 0.35, metalness: 0.6 }),
  );
  g.add(shell);
  // fit the image to the screen, cover
  const sw = w * 0.9;
  const sh = h * 0.95;
  const scr = aspect / (sw / sh);
  if (scr > 1) {
    map.repeat.set(1 / scr, 1);
    map.offset.set((1 - 1 / scr) / 2, 0);
  } else {
    map.repeat.set(1, scr);
    map.offset.set(0, (1 - scr) / 2);
  }
  const screen = new THREE.Mesh(
    roundedPlane(sw, sh, 0.045),
    new THREE.MeshBasicMaterial({ map, toneMapped: false }),
  );
  screen.position.z = 0.045;
  g.add(screen);
  return g;
}

function roundedShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function roundedPlane(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 8);
  // UVs from position
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / w + 0.5;
    uv[i * 2 + 1] = p.getY(i) / h + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
function roundedSlab(w: number, h: number, depth: number, r: number) {
  const g = new THREE.ExtrudeGeometry(roundedShape(w, h, r), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 3,
    curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
