/**
 * The homepage hero: "Point. It comes alive."
 *
 * One real MEDIALIFE piece at a time floats in a dark room as a hologram
 * (blue or magenta, alternating). The visitor holds a realistic phone: drag it
 * (or tap where it should go) and its screen is a live camera feed of whatever
 * is behind it. Only when it is over the piece do the brackets find the design,
 * lock, and the design comes alive on the phone, exactly like image-target AR;
 * move it away and the experience stops. Nobody touching it? The phone shows
 * them once, then the tour moves on. The EVADE charms go further: Bobo and three
 * cola cans pop out, the joystick on the phone steers Bobo, and three cans
 * unlock a digital reward.
 *
 * Rendering, per frame:
 *  1. the phone's camera renders the scene in colour (pieces, AR overlays,
 *     pop-outs) to a small target that the phone screen shows;
 *  2. the main camera renders the piece to a target, and one full-screen pass
 *     turns it into the hologram over the room grid;
 *  3. the phone and anything that has popped out are drawn on top, in colour.
 *
 * Plain three.js, loaded on demand by Hero.tsx so it never touches SSR or the
 * first paint. The page shows a static poster until the first frame is ready.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CANS, type HeroSlide } from "./hero-slides";

export type Track = "build" | "search" | "lock" | "alive";
export type PhoneRect = { x: number; y: number; w: number; h: number; angle: number };

export type ArEvents = {
  /** First frame with the first piece drawn. */
  onReady?: () => void;
  /** The slide changed (the new one starts building in). */
  onSlide?: (index: number) => void;
  /** The current slide's AR came alive (true) or is leaving (false). */
  onAlive?: (index: number, alive: boolean) => void;
  /** Tracking, for the hints on the phone: building, searching, locking on, alive. */
  onTrack?: (t: Track) => void;
  /** Each frame: the phone's screen on the page (CSS px centre and size, roll). */
  onPhone?: (r: PhoneRect) => void;
  /** On resize: the stage area (CSS px, relative to the canvas). */
  onLayout?: (r: { x: number; y: number; w: number; h: number }) => void;
  /** Bobo collected a can (0 when the game resets). */
  onScore?: (n: number) => void;
  /** All the cans are collected: the digital reward unlocks. */
  onReward?: () => void;
  /** Each frame: how far the current slide is towards auto-advancing (0..1). */
  onProgress?: (p: number) => void;
};

/* Layers: what each camera draws. */
const L_PIECE = 0; // the piece: hologram (main) + colour (phone)
const L_AR = 1; // AR overlays: phone only
const L_POP = 2; // pop-outs: both, in colour
const L_PHONE = 3; // the phone: main only

const Z_PIECE = -1.2;
const Z_BACK = -3.2;
const Z_POP = 0.3;
const Z_PHONE = 3.2;
const CAM_Z = 9;
const FOV = 30;

/* Phone proportions (a modern 6.1" phone, in its own units). */
const PH_W = 0.71;
const PH_H = 1.47;
const PH_D = 0.078;
const BEZEL = 0.024;

/* Timings (s) */
const IN_T = 0.8;
const SCAN_T = 1.1;
const OUT_T = 0.5;
/** The game on the auto tour: at most this long, or a few seconds after the reward */
const GAME_MAX_T = 30;
const GAME_AFTER_REWARD_T = 4;

const BLUE = new THREE.Vector3(0.098, 0.686, 0.996); // #19AFFE, display values
const MAGENTA = new THREE.Vector3(1.0, 0.184, 0.682); // #FF2FAE
const accentVec = (a: HeroSlide["accent"]) => (a === "magenta" ? MAGENTA : BLUE);
const accentHex = (a: HeroSlide["accent"]) => (a === "magenta" ? 0xff2fae : 0x19afff);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const clampAbs = (v: number, m: number) => Math.max(-m, Math.min(m, v));
const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));
const ease = (t: number) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Ease out with a small overshoot: things "land". */
const backOut = (t: number) => {
  const c = 1.5;
  t = clamp01(t);
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

type Pop = {
  root: THREE.Group;
  ready: boolean;
  update(dt: number, t: number, live: boolean): void;
  dispose(): void;
};

type Slide = {
  def: HeroSlide;
  group: THREE.Group;
  /** The fitted piece (unit size) */
  inner: THREE.Group;
  /** Local bounds of the fitted piece */
  box: THREE.Box3;
  loaded: boolean;
  loading: boolean;
  /** Build-in / out wipe: keeps y <= constant */
  clip: THREE.Plane;
  /** AR overlay reveal: keeps y >= -constant */
  reveal: THREE.Plane;
  /** What the phone's brackets frame */
  bracket: THREE.Object3D | null;
  overlay: THREE.Mesh | null;
  overlayMat: THREE.MeshBasicMaterial | null;
  still: THREE.Texture | null;
  video: HTMLVideoElement | null;
  videoTex: THREE.VideoTexture | null;
  pop: Pop | null;
};

type Px = { x: number; y: number };
type Layout = {
  stage: { x: number; y: number; w: number; h: number };
  piece: Px;
  pieceH: number;
  pieceW: number;
  back: Px;
  /** Where the phone rests, beside the piece */
  phone: Px;
  phoneH: number;
  pop: Px;
  popR: number;
};

export class ArStage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  private phoneCam = new THREE.PerspectiveCamera(45, 0.46, 0.05, 80);
  private rtMain: THREE.WebGLRenderTarget;
  private rtPhone: THREE.WebGLRenderTarget;
  private post: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private phone: THREE.Group;
  private screenMat: THREE.ShaderMaterial;
  private scanLine: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private slides: Slide[];
  private loader: GLTFLoader;
  private gltfCache = new Map<string, Promise<GLTF>>();
  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private disposed = false;
  private ro: ResizeObserver;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private tall = false;
  private lay!: Layout;
  private copyRect: { x: number; y: number; w: number; h: number } | null = null;
  private t = 0;

  // carousel
  private cur = 0;
  private next = 0;
  private phase: "in" | "wait" | "alive" | "out" = "in";
  private pt = 0;
  private outFrom = 1;
  private paused = false;
  /** 0..1 while the phone is over the piece and locking on */
  private scanAmt = 0;
  /** How long the phone has been off the piece while it is alive */
  private offT = 0;
  /** Seconds alive that count towards auto-advancing (only while nobody is playing) */
  private dwellT = 0;
  private popAmt = 0;
  private popT = 0;
  private popGrow = 0;
  private popOffT = 9;
  private tint = BLUE.clone();
  private readyFired = false;
  private introT = 0;
  private firstGuide = true;
  private track: Track | null = null;

  // the phone, where the visitor holds it (CSS px on the canvas)
  private ph = { x: 0, y: 0 };
  private phGoal = { x: 0, y: 0 };
  private phVel = { x: 0, y: 0 };
  private phSet = false;
  private dragging = false;
  private dragOff = { x: 0, y: 0 };
  private manualUntil = -1;
  private guiding = false;
  private over = false;
  /** The phone's screen on the page, last frame */
  private scr = { x: 0, y: 0, w: 0, h: 0 };
  private tap: { x: number; y: number; id: number; touch: boolean } | null = null;
  readonly stick = { x: 0, y: 0, active: false, at: -99 };

  private reduced: boolean;
  private mobile: boolean;
  /** ?debug&fast: run the clock faster (headless browsers draw a few frames a second). */
  private speed = typeof location !== "undefined" && /fast/.test(location.search) ? 8 : 1;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private tmpBox = new THREE.Box3();
  private tmpBox2 = new THREE.Box3();

  constructor(
    private canvas: HTMLCanvasElement,
    defs: HeroSlide[],
    private events: ArEvents = {},
    opts: { reducedMotion?: boolean; start?: number } = {},
  ) {
    this.reduced = !!opts.reducedMotion;
    this.paused = this.reduced;
    this.mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 768;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.dpr = Math.min(window.devicePixelRatio || 1, this.mobile ? 1.5 : 2);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.localClippingEnabled = true;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.lights();

    this.rtMain = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples: this.mobile ? 2 : 4,
    });
    this.rtPhone = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      samples: this.mobile ? 2 : 4,
    });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), holoMaterial());
    this.postScene.add(this.post);

    this.screenMat = screenMaterial(this.rtPhone.texture);
    this.phone = buildPhone(this.screenMat);
    setLayer(this.phone, L_PHONE);
    this.scene.add(this.phone);

    this.scanLine = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffffff).multiplyScalar(2.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scanLine.layers.set(L_PIECE);
    this.scanLine.layers.enable(L_AR);
    this.scanLine.visible = false;
    this.scene.add(this.scanLine);

    this.camera.position.set(0, 0, CAM_Z);

    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.slides = defs.map((def) => {
      const group = new THREE.Group();
      const inner = new THREE.Group();
      group.add(inner);
      group.visible = false;
      this.scene.add(group);
      return {
        def,
        group,
        inner,
        box: new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)),
        loaded: false,
        loading: false,
        clip: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4),
        reveal: new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4),
        bracket: null,
        overlay: null,
        overlayMat: null,
        still: null,
        video: null,
        videoTex: null,
        pop: null,
      };
    });
    this.cur = this.next = Math.max(0, Math.min(defs.length - 1, opts.start ?? 0));
    this.tint.copy(accentVec(defs[this.cur].accent));

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancel);

    this.ensure(this.cur).then(() => this.ensure((this.cur + 1) % this.slides.length));
    if (location.search.includes("debug")) (window as unknown as { __ar: ArStage }).__ar = this;
  }

  /* ------------------------------------------------------------ public */
  go(i: number) {
    const n = this.slides.length;
    i = ((i % n) + n) % n;
    if (i === this.cur && this.phase !== "out") return;
    this.home();
    if (this.phase === "out") {
      this.next = i;
      return;
    }
    this.next = i;
    this.outFrom = this.buildAmt();
    this.leaveAlive();
    this.phase = "out";
    this.pt = this.reduced ? OUT_T : 0;
    this.ensure(i);
    if (!this.running) this.renderOnce();
  }
  nextSlide() {
    this.go((this.phase === "out" ? this.next : this.cur) + 1);
  }
  prevSlide() {
    this.go((this.phase === "out" ? this.next : this.cur) - 1);
  }
  setPaused(p: boolean) {
    this.paused = p;
  }
  /** Joystick input: x right, y up, both -1..1. */
  setStick(x: number, y: number, active: boolean) {
    this.stick.x = x;
    this.stick.y = y;
    this.stick.active = active;
    if (active) {
      this.stick.at = this.t;
      this.handsOn();
    }
  }
  /** The visitor picked the phone up at (x, y), CSS px on the canvas. */
  grab(x: number, y: number) {
    this.dragging = true;
    this.dragOff = { x: this.ph.x - x, y: this.ph.y - y };
    this.handsOn();
  }
  /** ...and moved it. */
  drag(x: number, y: number) {
    if (!this.dragging) return;
    this.phGoal = this.clampPhone(x + this.dragOff.x, y + this.dragOff.y);
    this.handsOn();
  }
  /** ...and let go. It stays where it was left. */
  release() {
    this.dragging = false;
    this.handsOn();
  }
  /** Point the phone at the current piece (the Scan button, Enter on the phone). */
  pointAtPiece() {
    const c = this.targetCentre();
    if (c) this.phGoal = this.clampPhone(c.x, c.y);
    this.handsOn();
  }
  /** Move the phone by (dx, dy) CSS px (arrow keys on the phone). */
  nudge(dx: number, dy: number) {
    this.phGoal = this.clampPhone(this.phGoal.x + dx, this.phGoal.y + dy);
    this.handsOn();
  }
  /** Where the hero copy sits (CSS px, relative to the canvas), so the stage avoids it. */
  setCopyRect(r: { x: number; y: number; w: number; h: number } | null) {
    this.copyRect = r;
    this.resize();
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.frame(Math.min(this.clock.getDelta(), 0.05) * this.speed);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    const s = this.slides[this.cur];
    s.video?.pause();
  }
  private renderOnce() {
    this.frame(0);
  }

  /** Someone is using the phone or the stick: no auto tour for a while. */
  private handsOn() {
    this.manualUntil = this.t + 10;
  }
  /** Send the phone back to where it rests, beside the piece. */
  private home() {
    if (!this.dragging && this.lay) this.phGoal = { ...this.lay.phone };
  }
  private clampPhone(x: number, y: number) {
    const ph = this.lay.phoneH;
    const pw = ph * (PH_W / PH_H);
    return {
      x: Math.min(this.w - pw * 0.4, Math.max(pw * 0.4, x)),
      y: Math.min(this.h - ph * 0.3, Math.max(ph * 0.3, y)),
    };
  }

  /* ------------------------------------------------------------ setup */
  private lights() {
    const s = this.scene;
    const add = (l: THREE.Light) => {
      l.layers.enableAll();
      s.add(l);
    };
    add(new THREE.HemisphereLight(0xe8ecff, 0x101220, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(2.5, 3.5, 5);
    add(key);
    const back = new THREE.DirectionalLight(0xc6dcff, 0.9);
    back.position.set(-3, 2, -3);
    add(back);
    const rim = new THREE.PointLight(0x4fb8ff, 10, 16, 1.4);
    rim.position.set(-4, 1.5, 2);
    add(rim);
    const rim2 = new THREE.PointLight(0xff4fb8, 6, 16, 1.4);
    rim2.position.set(4, -1, 2);
    add(rim2);
  }

  private gltf(src: string) {
    let p = this.gltfCache.get(src);
    if (!p) {
      p = this.loader.loadAsync(src);
      this.gltfCache.set(src, p);
    }
    return p;
  }

  /** Load a slide's piece and its AR content (once). */
  private async ensure(i: number) {
    const s = this.slides[i];
    if (s.loaded || s.loading || this.disposed) return;
    s.loading = true;
    const def = s.def;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const texLoader = new THREE.TextureLoader();
    const loadTex = async (src: string) => {
      const t = await texLoader.loadAsync(src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      return t;
    };
    try {
      // The piece
      let obj: THREE.Object3D;
      let face: THREE.Mesh | null = null;
      if (def.target.kind === "glb") {
        const g = await this.gltf(def.target.src);
        obj = g.scene;
        obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && "map" in m && m.map) m.map.anisotropy = Math.min(8, maxAniso);
          if (m) m.side = THREE.DoubleSide;
        });
      } else {
        const map = await loadTex(def.target.src);
        const c = card(map, def.target.aspect);
        obj = c.mesh;
        face = c.mesh;
      }
      if (this.disposed) return;
      const fitted = fit(obj, 1);
      if (def.target.kind === "glb" && def.target.rotY) fitted.rotation.y = def.target.rotY;
      s.inner.add(fitted);
      // all of it clips with the build wipe
      forMaterials(fitted, (m) => (m.clippingPlanes = [s.clip]));
      setLayer(fitted, L_PIECE);
      // local bounds, with the group at rest
      s.group.position.set(0, 0, 0);
      s.group.rotation.set(0, 0, 0);
      s.group.scale.setScalar(1);
      s.group.updateMatrixWorld(true);
      s.box.setFromObject(s.inner);
      s.bracket = s.inner;

      // AR
      const ar = def.ar;
      if (ar.kind === "video") {
        s.still = await loadTex(ar.still);
        const mat = new THREE.MeshBasicMaterial({
          map: s.still,
          side: THREE.DoubleSide,
          clippingPlanes: [s.clip, s.reveal],
          toneMapped: false,
        });
        let mesh: THREE.Mesh | null = null;
        if (ar.cloth) {
          const cloth = firstMesh(fitted);
          if (cloth) {
            fitted.updateMatrixWorld(true);
            mesh = new THREE.Mesh(clothSheet(cloth, ar.cloth.rect, ar.cloth.quad), mat);
            cloth.add(mesh);
          }
        } else if (face) {
          const p = face.geometry as THREE.BoxGeometry;
          const { width, height, depth } = p.parameters;
          mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
          mesh.position.z = depth / 2 + 0.002;
          face.add(mesh);
        }
        if (mesh) {
          mesh.layers.set(L_AR);
          mesh.visible = false;
          s.overlay = mesh;
          s.overlayMat = mat;
          s.bracket = mesh;
        }
      } else if (ar.kind === "bobo") {
        const game = new BoboGame(
          accentHex(def.accent),
          (n) => this.events.onScore?.(n),
          () => {
            // linger on the reward for a moment, then the tour can move on
            this.dwellT = Math.max(this.dwellT, GAME_MAX_T - GAME_AFTER_REWARD_T);
            this.events.onReward?.();
          },
        );
        game.stage = this;
        game.auto = false;
        s.pop = game;
        this.scene.add(game.root);
        Promise.all([this.gltf(ar.bobo), this.gltf(ar.anims), this.gltf(ar.can)])
          .then(
            ([b, a, c]) =>
              !this.disposed && game.setModels(b, [...a.animations, ...b.animations], c),
          )
          .catch((e) => console.warn("[ar] bobo", e));
      } else if (ar.kind === "display") {
        const d = new DisplayPop(accentHex(def.accent));
        s.pop = d;
        this.scene.add(d.root);
        this.gltf(ar.src)
          .then((g) => !this.disposed && d.setModel(g))
          .catch((e) => console.warn("[ar] display", e));
      }
      s.loaded = true;
      if (!this.running) this.renderOnce();
    } catch (err) {
      console.warn("[ar] could not load", def.key, err);
    } finally {
      s.loading = false;
    }
  }

  /* ------------------------------------------------------------ layout */
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.tall = this.w / this.h < 1.05;
    this.renderer.setSize(this.w, this.h, false);
    this.rtMain.setSize(Math.round(this.w * this.dpr), Math.round(this.h * this.dpr));
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.post.material.uniforms.uRes.value.set(this.w * this.dpr, this.h * this.dpr);
    this.post.material.uniforms.uDpr.value = this.dpr;
    this.lay = this.layout();
    // the phone's feed: its screen size on the page, at the pixel ratio
    const scrH = this.lay.phoneH * ((PH_H - 2 * BEZEL) / PH_H);
    const scrW = scrH * ((PH_W - 2 * BEZEL) / (PH_H - 2 * BEZEL));
    const k = Math.min(this.dpr * 1.2, 2.5);
    this.rtPhone.setSize(Math.max(64, Math.round(scrW * k)), Math.max(128, Math.round(scrH * k)));
    this.phoneCam.aspect = scrW / scrH;
    this.screenMat.uniforms.uAspect.value = scrW / scrH;
    // the phone: at rest the first time; afterwards kept on the page
    if (!this.phSet) {
      this.ph = { ...this.lay.phone };
      this.phGoal = { ...this.lay.phone };
      this.phSet = true;
    } else if (this.phase !== "alive" && !this.dragging && this.t >= this.manualUntil) {
      this.phGoal = { ...this.lay.phone };
    } else {
      this.phGoal = this.clampPhone(this.phGoal.x, this.phGoal.y);
    }
    this.events.onLayout?.(this.lay.stage);
    if (!this.running) this.renderOnce();
  }

  private layout(): Layout {
    const { w, h } = this;
    const c = this.copyRect;
    if (!this.tall) {
      // text on the left, stage on the right; the phone rests left of the piece
      const x0 = Math.min(w * 0.5, Math.max(w * 0.4, c ? c.x + c.w * 0.86 : w * 0.44));
      const st = { x: x0, y: h * 0.05, w: w - x0, h: h * 0.83 };
      const cx = st.x + st.w / 2;
      const cy = st.y + st.h / 2;
      const piece = { x: cx + st.w * 0.12, y: cy - st.h * 0.02 };
      return {
        stage: st,
        piece,
        pieceH: st.h * 0.84,
        pieceW: st.w * 0.56,
        back: { x: piece.x, y: cy - st.h * 0.3 },
        phone: { x: cx - st.w * 0.3, y: cy + st.h * 0.08 },
        phoneH: Math.min(st.h * 0.58, st.w * 0.6),
        pop: { x: piece.x, y: cy + st.h * 0.1 },
        popR: Math.min(st.w * 0.28, st.h * 0.42),
      };
    }
    // stage above the text
    const bottom = c ? Math.max(h * 0.36, c.y - 56) : h * 0.5;
    const st = { x: 0, y: h * 0.02, w, h: bottom - h * 0.02 };
    const cx = st.x + st.w / 2;
    const cy = st.y + st.h / 2;
    const piece = { x: cx + st.w * 0.16, y: cy };
    return {
      stage: st,
      piece,
      pieceH: st.h * 0.86,
      pieceW: st.w * 0.54,
      back: { x: piece.x, y: cy - st.h * 0.3 },
      phone: { x: cx - st.w * 0.28, y: cy + st.h * 0.06 },
      phoneH: Math.min(st.h * 0.66, st.w * 0.85),
      pop: { x: cx + st.w * 0.07, y: cy + st.h * 0.1 },
      popR: Math.min(st.w * 0.36, st.h * 0.42),
    };
  }

  /** A CSS-px point on the canvas, as a world point at depth z. */
  private toWorld(p: Px, z: number, out = new THREE.Vector3()) {
    const hh = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (CAM_Z - z);
    const hw = hh * this.camera.aspect;
    return out.set(((p.x / this.w) * 2 - 1) * hw, -((p.y / this.h) * 2 - 1) * hh, z);
  }
  /** World units per CSS px at depth z. */
  private wpp(z: number) {
    return (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * (CAM_Z - z)) / this.h;
  }

  /* ------------------------------------------------------------ input */
  // The phone itself is dragged through a DOM handle over it (Hero.tsx), so
  // touch scrolling still works everywhere else. On the canvas: a tap moves the
  // phone there; a horizontal swipe (touch) changes the piece.
  private onDown = (e: PointerEvent) => {
    this.tap = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== "mouse" };
  };
  private onUp = (e: PointerEvent) => {
    const s = this.tap;
    this.tap = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.touch && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) this.nextSlide();
      else this.prevSlide();
      return;
    }
    if (Math.hypot(dx, dy) > 10) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const st = this.lay.stage;
    if (x < st.x - 24 || y > st.y + st.h + 24) return; // the copy, not the stage
    this.phGoal = this.clampPhone(x, y);
    this.handsOn();
  };
  private onCancel = () => {
    this.tap = null;
  };

  /* ------------------------------------------------------------ carousel */
  private buildAmt() {
    if (this.phase === "in") return ease(this.pt / IN_T);
    if (this.phase === "out") return this.outFrom * (1 - ease(this.pt / OUT_T));
    return 1;
  }

  /** How long a piece plays on the auto tour before the next one. */
  private dwell(s: Slide) {
    if (s.def.ar.kind === "bobo") return GAME_MAX_T;
    if (s.def.ar.kind === "display") return 8;
    return s.video && s.video.duration > 1 ? Math.min(Math.max(s.video.duration, 7), 11) : 8;
  }

  private enterAlive(s: Slide) {
    this.popT = 0;
    this.dwellT = 0;
    this.firstGuide = false;
    if (s.overlay) s.overlay.visible = true;
    if (s.def.ar.kind === "video" && !this.reduced) this.playVideo(s);
    this.events.onAlive?.(this.cur, true);
  }

  private leaveAlive() {
    const s = this.slides[this.cur];
    if (s.video) s.video.pause();
    if (s.overlayMat && s.still) {
      s.overlayMat.map = s.still;
      s.overlayMat.needsUpdate = true;
    }
    if (this.phase === "alive") this.events.onAlive?.(this.cur, false);
  }

  private playVideo(s: Slide) {
    const ar = s.def.ar;
    if (ar.kind !== "video" || !s.overlayMat) return;
    if (!s.video) {
      const v = document.createElement("video");
      v.src = ar.src;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      v.setAttribute("playsinline", "");
      v.setAttribute("muted", "");
      s.video = v;
      const vt = new THREE.VideoTexture(v);
      vt.colorSpace = THREE.SRGBColorSpace;
      s.videoTex = vt;
      v.addEventListener("playing", () => {
        if (s.overlayMat && s.videoTex && this.phase === "alive" && this.slides[this.cur] === s) {
          s.overlayMat.map = s.videoTex;
          s.overlayMat.needsUpdate = true;
        }
      });
    }
    try {
      s.video.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
    s.video.play().catch(() => {
      /* autoplay refused (low power mode): the still stays */
    });
  }

  /** The current piece (or what popped out of it) on the page, CSS px. */
  private targetRect(s: Slide) {
    const b = this.tmpBox2.makeEmpty();
    if (s.loaded && s.bracket) b.setFromObject(s.bracket);
    const p = s.pop;
    if (p && p.ready && p.root.visible && this.popGrow > 0.5)
      b.union(this.tmpBox.setFromObject(p.root));
    if (b.isEmpty()) return null;
    let x0 = 1e9,
      y0 = 1e9,
      x1 = -1e9,
      y1 = -1e9;
    const v = this.tmpV;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
      const q = this.toPx(v);
      x0 = Math.min(x0, q.x);
      x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y);
      y1 = Math.max(y1, q.y);
    }
    return { x0, y0, x1, y1 };
  }
  /** Where to hold the phone to see the piece: the design, or the board once it popped out. */
  private targetCentre() {
    const s = this.slides[this.cur];
    if (s.pop && this.popGrow > 0.5) return { ...this.lay.pop };
    const r = this.targetRect(s);
    return r ? { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } : { ...this.lay.piece };
  }

  /* ------------------------------------------------------------ frame */
  private frame(dt: number) {
    this.t += dt;
    const t = this.t;
    const L = this.lay;
    const R = this.reduced;
    const manual = t < this.manualUntil || this.dragging || this.stick.active;
    const auto = !this.paused && !R && !manual;

    // --- the carousel: build in, wait for the phone, come alive, leave
    this.pt += dt;
    let s = this.slides[this.cur];
    if (this.phase === "out" && this.pt >= OUT_T) {
      s.group.visible = false;
      if (s.overlay) s.overlay.visible = false;
      this.cur = this.next;
      s = this.slides[this.cur];
      this.phase = "in";
      this.pt = R ? IN_T : 0;
      this.scanAmt = 0;
      this.popGrow = 0;
      this.popAmt = 0;
      if (s.pop instanceof BoboGame) s.pop.reset();
      this.ensure(this.cur).then(() => this.ensure((this.cur + 1) % this.slides.length));
      this.events.onSlide?.(this.cur);
    }
    if (this.phase === "in") {
      if (!s.loaded) this.pt = 0;
      else if (this.pt >= IN_T) {
        this.phase = "wait";
        this.pt = 0;
      }
    }

    // is the phone over the piece? (its screen centre, from the last frame)
    const tr = this.phase === "wait" || this.phase === "alive" ? this.targetRect(s) : null;
    if (tr && this.scr.w > 0) {
      const m = this.scr.w * (this.over ? 0.35 : 0.08);
      const { x, y } = this.scr;
      this.over = x > tr.x0 - m && x < tr.x1 + m && y > tr.y0 - m && y < tr.y1 + m;
    } else this.over = false;

    this.guiding = false;
    if (this.phase === "wait") {
      if (this.over) this.scanAmt = R ? 1 : this.scanAmt + dt / SCAN_T;
      else this.scanAmt = Math.max(0, this.scanAmt - dt * 1.5);
      if (this.scanAmt >= 1) {
        this.scanAmt = 1;
        this.phase = "alive";
        this.pt = 0;
        this.offT = 0;
        this.enterAlive(s);
      } else if (auto && this.pt > (this.firstGuide ? 2.4 : 1.2) && tr) {
        // nobody has picked the phone up: show them, point it at the piece
        this.phGoal = this.clampPhone((tr.x0 + tr.x1) / 2, (tr.y0 + tr.y1) / 2);
        this.guiding = true;
      }
    } else if (this.phase === "alive") {
      this.offT = this.over ? 0 : this.offT + dt;
      if (this.offT > 0.35) {
        // moved away: tracking lost, the experience stops
        this.leaveAlive();
        this.phase = "wait";
        this.pt = 0;
        this.scanAmt = 0.5;
      }
    }
    if (s.pop instanceof BoboGame) s.pop.auto = auto;

    let progress = 0;
    if (this.phase === "alive") {
      const d = this.dwell(s);
      if (auto) this.dwellT += dt;
      progress = clamp01(this.dwellT / d);
      if (auto && this.dwellT >= d) this.go(this.cur + 1);
    }
    this.events.onProgress?.(this.paused ? 0 : progress);

    const tr2: Track =
      this.phase === "alive"
        ? "alive"
        : this.phase === "wait"
          ? this.scanAmt > 0.02
            ? "lock"
            : "search"
          : "build";
    if (tr2 !== this.track) {
      this.track = tr2;
      this.events.onTrack?.(tr2);
    }

    const isPop = s.def.ar.kind !== "video";
    const popWant = isPop && this.phase === "alive" ? 1 : 0;
    this.popAmt = R || dt === 0 ? popWant : damp(this.popAmt, popWant, 3.2, dt);
    const popE = ease(this.popAmt);
    if (this.phase === "alive") this.popT += dt;

    // --- intro: the phone rises into place
    this.introT += dt;
    const intro = R ? 1 : ease(clamp01((this.introT - 0.15) / 1.1));

    // --- tint follows the slide
    const want = accentVec(s.def.accent);
    if (dt === 0) this.tint.copy(want);
    else this.tint.lerp(want, 1 - Math.exp(-4 * dt));

    // --- the piece
    for (const o of this.slides) if (o !== s) o.group.visible = false;
    const build = this.buildAmt();
    let pieceTop = 0;
    let pieceBottom = 0;
    let pieceWidth = 1;
    if (s.loaded) {
      const g = s.group;
      g.visible = true;
      const bw = s.box.max.x - s.box.min.x;
      const bh = s.box.max.y - s.box.min.y;
      const sz = Math.min((L.pieceH * this.wpp(Z_PIECE)) / bh, (L.pieceW * this.wpp(Z_PIECE)) / bw);
      const pz = lerp(Z_PIECE, Z_BACK, popE);
      const base = this.toWorld(L.piece, Z_PIECE, this.tmpV);
      const back = this.toWorld(L.back, Z_BACK, this.tmpV2);
      // slide in from the right, out to the left
      const slide =
        this.phase === "in"
          ? (1 - ease(this.pt / IN_T)) * 0.6
          : this.phase === "out"
            ? -ease(this.pt / OUT_T) * 0.6
            : 0;
      const bob = R ? 0 : Math.sin(t * 0.8) * 0.025;
      g.position.set(
        lerp(base.x, back.x, popE) + (R ? 0 : slide),
        lerp(base.y, back.y, popE) + bob,
        pz,
      );
      const scale = sz * lerp(1, 0.5, popE);
      g.scale.setScalar(scale);
      const sway = R ? 0 : Math.sin(t * 0.45) * (s.def.target.kind === "glb" ? 0.16 : 0.08);
      g.rotation.set(R ? 0 : Math.sin(t * 0.6) * 0.03, sway + (R ? 0 : slide * 0.8), 0);
      pieceBottom = g.position.y + s.box.min.y * scale;
      pieceTop = g.position.y + s.box.max.y * scale;
      pieceWidth = bw * scale;
      // build wipe, bottom to top (and back down on the way out)
      const pad = (pieceTop - pieceBottom) * 0.04;
      const cy = lerp(pieceBottom - pad, pieceTop + pad, build);
      s.clip.constant = build >= 0.999 ? 1e4 : cy;
      const sl = this.scanLine;
      sl.visible = build > 0.001 && build < 0.999;
      sl.position.set(g.position.x, cy, pz + 0.2);
      sl.scale.set(pieceWidth * 1.25, Math.max(0.008, (pieceTop - pieceBottom) * 0.006), 1);
      sl.material.color.setRGB(this.tint.x * 2.4, this.tint.y * 2.4, this.tint.z * 2.4);
      // AR reveal: top to bottom over the first 0.7 s alive
      if (s.overlay) {
        const rv = this.phase === "alive" ? (R ? 1 : smooth(0, 0.7, this.pt)) : 0;
        s.reveal.constant = rv >= 0.999 ? 1e4 : -lerp(pieceTop + pad, pieceBottom - pad, rv);
        s.overlay.visible = this.phase === "alive";
      }
    }

    // --- pop-outs: out of the piece, onto a board in front of it
    for (const o of this.slides) {
      const p = o.pop;
      if (!p) continue;
      const mine = o === s;
      const live = mine && this.phase === "alive";
      let grow = 0;
      if (mine) {
        if (this.phase === "alive") {
          this.popOffT = 0;
          grow = this.popGrow = R ? 1 : backOut(this.popT / 0.8);
        } else {
          this.popOffT += dt;
          grow = this.popGrow * (1 - (R ? 1 : ease(this.popOffT / 0.4)));
          if (grow < 0.001) this.popGrow = 0;
        }
      }
      p.root.visible = grow > 0.001 && p.ready;
      if (!p.root.visible) continue;
      const from = s.group.position;
      const to = this.toWorld(L.pop, Z_POP, this.tmpV);
      const k = R || this.phase !== "alive" ? 1 : smooth(0, 0.6, this.popT);
      p.root.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k), lerp(from.z, to.z, k));
      p.root.scale.setScalar(Math.max(1e-3, L.popR * this.wpp(Z_POP) * grow));
      p.update(dt, t, live);
    }

    // --- the phone: follows the hand (or the tour)
    if (dt === 0 || R) {
      this.ph = { ...this.phGoal };
      this.phVel = { x: 0, y: 0 };
    } else {
      const k = this.dragging ? 30 : this.guiding ? 3.6 : 9;
      const nx = damp(this.ph.x, this.phGoal.x, k, dt);
      const ny = damp(this.ph.y, this.phGoal.y, k, dt);
      this.phVel.x = damp(this.phVel.x, (nx - this.ph.x) / dt, 12, dt);
      this.phVel.y = damp(this.phVel.y, (ny - this.ph.y) / dt, 12, dt);
      this.ph = { x: nx, y: ny };
    }
    const pos = this.toWorld(this.ph, Z_PHONE, new THREE.Vector3());
    // rise in from below
    pos.y -= (1 - intro) * L.phoneH * this.wpp(Z_PHONE) * 1.4;
    if (!R && !this.dragging) pos.y += Math.sin(t * 1.1) * 0.01;
    this.phone.scale.setScalar((L.phoneH * this.wpp(Z_PHONE)) / PH_H);
    this.phone.position.copy(pos);

    // what the phone's camera looks at: straight through the phone, turning
    // onto the design as it locks (or onto what popped out)
    const lk = this.phase === "alive" ? 1 : this.phase === "wait" ? ease(this.scanAmt) : 0;
    const tc = new THREE.Vector3(pos.x, pos.y, Z_PIECE);
    let dockH = L.pieceH * this.wpp(Z_PIECE);
    if (s.loaded && s.bracket) {
      this.tmpBox.setFromObject(s.bracket);
      if (!this.tmpBox.isEmpty()) {
        const c = this.tmpBox.getCenter(this.tmpV2);
        tc.lerp(c, lk * 0.9);
        const sz = this.tmpBox.getSize(this.tmpV2);
        dockH = Math.max(sz.y, sz.x / this.phoneCam.aspect) * 1.05;
      }
    }
    const popC = this.toWorld(L.pop, Z_POP, new THREE.Vector3());
    popC.y += L.popR * this.wpp(Z_POP) * 0.12;
    const aim = tc.lerp(popC, popE);
    // the phone looks where its camera looks: its back faces the target
    this.phone.lookAt(this.tmpV.copy(pos).multiplyScalar(2).sub(aim));
    this.phone.rotateZ(
      -0.04 + (R ? 0 : Math.sin(t * 0.7) * 0.01) - clampAbs(this.phVel.x * 0.00022, 0.18),
    );
    this.phone.rotateX(clampAbs(this.phVel.y * 0.00018, 0.15));
    // its camera looks where the phone points
    this.phoneCam.position.copy(pos);
    this.phoneCam.quaternion.copy(this.phone.quaternion);
    // the body turns a little towards us, so it reads as a 3D object
    this.phone.rotateY(0.24);
    if (intro < 1) this.phone.rotateX((1 - intro) * 0.9);
    this.phone.updateMatrixWorld(true);
    const dist = Math.max(0.5, pos.distanceTo(aim));
    // framing: what is behind the phone (a little wider, like a real camera),
    // then the design once locked, then the pop-out
    const scrPx = L.phoneH * ((PH_H - 2 * BEZEL) / PH_H);
    const seeH = scrPx * this.wpp(Z_PIECE) * 1.3;
    const fitH = dockH / 0.8;
    const popH = (L.popR * this.wpp(Z_POP) * 1.95) / Math.min(1, this.phoneCam.aspect * 1.6) / 0.8;
    const frameH = lerp(lerp(seeH, fitH, lk), popH, popE);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan((frameH * 0.5) / dist));
    this.phoneCam.fov = Math.min(80, Math.max(12, fov));
    this.phoneCam.updateProjectionMatrix();
    this.phoneCam.updateMatrixWorld(true);
    this.phoneCam.layers.set(L_PIECE);
    this.phoneCam.layers.enable(L_AR);
    this.phoneCam.layers.enable(L_POP);

    // brackets: searching, then locking onto where the design sits in the feed
    const u = this.screenMat.uniforms;
    if (s.loaded && s.bracket) {
      this.tmpBox.setFromObject(s.bracket);
      const r = projectBox(this.tmpBox, this.phoneCam);
      u.uRect.value.set(r[0], r[1], r[2], r[3]);
    }
    u.uLock.value = lk;
    u.uBr.value =
      this.phase === "alive"
        ? 1 - smooth(1.0, 1.6, this.pt)
        : this.phase === "out"
          ? 0
          : this.phase === "in"
            ? smooth(0.2, 0.6, this.pt)
            : 1;
    u.uFlash.value = this.phase === "alive" && !R ? 1 - smooth(0, 0.5, this.pt) : 0;
    u.uTime.value = R ? 0 : t;
    u.uAccent.value.copy(this.tint);
    u.uOn.value = R ? 1 : smooth(0.6, 1.3, this.introT);

    // the phone's screen on the page (for the DOM layer: handle, joystick, cards)
    {
      const sw = PH_W - 2 * BEZEL;
      const sh = PH_H - 2 * BEZEL;
      const z = PH_D / 2;
      const mw = this.phone.matrixWorld;
      const at = (x: number, y: number) => this.toPx(this.tmpV.set(x, y, z).applyMatrix4(mw));
      const c = at(0, 0);
      const l = at(-sw / 2, 0);
      const r = at(sw / 2, 0);
      const tp = at(0, sh / 2);
      const bt = at(0, -sh / 2);
      const sr = {
        x: c.x,
        y: c.y,
        w: Math.hypot(r.x - l.x, r.y - l.y),
        h: Math.hypot(tp.x - bt.x, tp.y - bt.y),
        angle: Math.atan2(r.y - l.y, r.x - l.x),
      };
      this.scr = sr;
      this.events.onPhone?.(sr);
    }

    // --- hologram tint
    const pu = this.post.material.uniforms;
    pu.uTint.value.copy(this.tint);
    pu.uTime.value = R ? 0 : t;

    // --- draw
    const rd = this.renderer;
    // 1. the phone's feed
    rd.setRenderTarget(this.rtPhone);
    rd.setClearColor(0x000000, 0);
    rd.clear();
    rd.render(this.scene, this.phoneCam);
    // 2. the hologram
    this.camera.layers.set(L_PIECE);
    rd.setRenderTarget(this.rtMain);
    rd.clear();
    rd.render(this.scene, this.camera);
    rd.setRenderTarget(null);
    pu.tScene.value = this.rtMain.texture;
    rd.render(this.postScene, this.postCam);
    // 3. phone + pop-outs, in colour, on top
    rd.autoClear = false;
    rd.clearDepth();
    this.camera.layers.set(L_POP);
    this.camera.layers.enable(L_PHONE);
    rd.render(this.scene, this.camera);
    rd.autoClear = true;

    if (!this.readyFired && this.slides[this.cur].loaded && dt > 0) {
      this.readyFired = true;
      requestAnimationFrame(() => this.events.onReady?.());
    }
  }

  private toPx(v: THREE.Vector3) {
    const p = this.tmpV2.copy(v).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h };
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.ro.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    for (const s of this.slides) {
      if (s.video) {
        s.video.pause();
        s.video.removeAttribute("src");
        s.video.load();
      }
      s.videoTex?.dispose();
      s.still?.dispose();
      s.pop?.dispose();
    }
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
    this.rtMain.dispose();
    this.rtPhone.dispose();
    this.post.material.dispose();
    this.renderer.dispose();
  }
}

/* =================================================================== pop-outs */

/** A tilted round board: what pop-outs stand on. Unit radius. */
function board(accent: number) {
  const g = new THREE.Group();
  const size = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const x = cv.getContext("2d")!;
  const c = size / 2;
  x.fillStyle = "rgba(8,10,22,0.82)";
  x.beginPath();
  x.arc(c, c, c - 2, 0, Math.PI * 2);
  x.fill();
  const col = `#${accent.toString(16).padStart(6, "0")}`;
  x.strokeStyle = col;
  x.globalAlpha = 0.28;
  x.lineWidth = 2;
  for (let r = c / 4; r < c; r += c / 4) {
    x.beginPath();
    x.arc(c, c, r, 0, Math.PI * 2);
    x.stroke();
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    x.beginPath();
    x.moveTo(c + Math.cos(a) * c * 0.25, c + Math.sin(a) * c * 0.25);
    x.lineTo(c + Math.cos(a) * (c - 4), c + Math.sin(a) * (c - 4));
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  disc.rotation.x = -Math.PI / 2;
  g.add(disc);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.975, 1.0, 96),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accent).multiplyScalar(2.2),
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  g.add(ring);
  return g;
}

type Can = { obj: THREE.Object3D; x: number; z: number; state: "drop" | "idle" | "pop"; t: number };

/**
 * A tiny Cola Run: Bobo on a round board, three cans drop in, collect them and
 * the reward unlocks. A finite, clear experience (no endless respawn).
 * Steered by the joystick (stage.stick); on the auto tour, Bobo plays himself.
 */
class BoboGame implements Pop {
  root = new THREE.Group();
  ready = false;
  private boardG: THREE.Group;
  private bobo: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private idle: THREE.AnimationAction | null = null;
  private run: THREE.AnimationAction | null = null;
  private canTpl: THREE.Object3D | null = null;
  private cans: Can[] = [];
  private bursts: { m: THREE.Mesh; t: number }[] = [];
  private pos = new THREE.Vector2(0, 0.15);
  private vel = new THREE.Vector2();
  private heading = 0;
  private score = 0;
  private needSpawn = true;
  private done = false;
  private shadow: THREE.Mesh;
  auto = false;
  stage: { stick: { x: number; y: number; active: boolean; at: number } } | null = null;

  constructor(
    private accent: number,
    private onScore: (n: number) => void,
    private onDone: () => void,
  ) {
    this.boardG = board(accent);
    this.boardG.rotation.x = 0.5;
    this.root.add(this.boardG);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.11, 32),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.boardG.add(this.shadow);
    setLayer(this.root, L_POP);
    this.root.visible = false;
  }

  setModels(b: GLTF, anims: THREE.AnimationClip[], c: GLTF) {
    const bobo = fit(cloneSkinned(b.scene), 1);
    bobo.traverse((o) => (o.frustumCulled = false));
    // stand on the board, 0.42 tall
    const box = new THREE.Box3().setFromObject(bobo);
    const hgt = box.max.y - box.min.y;
    bobo.scale.multiplyScalar(0.42 / hgt);
    const box2 = new THREE.Box3().setFromObject(bobo);
    bobo.position.y -= box2.min.y;
    const holder = new THREE.Group();
    holder.add(bobo);
    this.bobo = holder;
    this.boardG.add(holder);
    this.mixer = new THREE.AnimationMixer(bobo);
    const clip = (n: string) => anims.find((a) => a.name === n);
    const ic = clip("Idle") ?? clip("Chill") ?? anims[0];
    const rc = clip("Run") ?? clip("Walk") ?? anims[1];
    if (ic) {
      this.idle = this.mixer.clipAction(ic);
      this.idle.play();
    }
    if (rc) {
      this.run = this.mixer.clipAction(rc);
      this.run.play();
      this.run.setEffectiveWeight(0);
    }
    const can = fit(cloneSkinned(c.scene), 1);
    can.traverse((o) => (o.frustumCulled = false));
    const cb = new THREE.Box3().setFromObject(can);
    can.scale.multiplyScalar(0.2 / (cb.max.y - cb.min.y));
    const cb2 = new THREE.Box3().setFromObject(can);
    can.position.y -= cb2.min.y;
    const tpl = new THREE.Group();
    tpl.add(can);
    this.canTpl = tpl;
    setLayer(this.root, L_POP);
    this.ready = true;
  }

  /** A new game: Bobo back in the middle, cans drop in when it next comes alive. */
  reset() {
    for (const c of this.cans) this.boardG.remove(c.obj);
    this.cans = [];
    for (const b of this.bursts) {
      this.boardG.remove(b.m);
      b.m.geometry.dispose();
      (b.m.material as THREE.Material).dispose();
    }
    this.bursts = [];
    this.pos.set(0, 0.15);
    this.vel.set(0, 0);
    this.heading = 0;
    this.score = 0;
    this.done = false;
    this.needSpawn = true;
    this.onScore(0);
  }

  /** Three cans, spread around the board and away from Bobo. */
  private spawnAll() {
    if (!this.canTpl) return;
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < CANS; i++) {
      const a = a0 + (i / CANS) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const r = 0.5 + Math.random() * 0.18;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const obj = cloneSkinned(this.canTpl);
      setLayer(obj, L_POP);
      obj.position.set(x, 0.9, z);
      obj.rotation.y = Math.random() * 6;
      obj.visible = false;
      this.boardG.add(obj);
      this.cans.push({ obj, x, z, state: "drop", t: -(0.45 + i * 0.22) });
    }
  }

  private burst(x: number, z: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.accent).multiplyScalar(2),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.01, z);
    m.layers.set(L_POP);
    this.boardG.add(m);
    this.bursts.push({ m, t: 0 });
  }

  update(dt: number, t: number, live: boolean) {
    if (!this.ready || !this.bobo) return;
    if (live && this.needSpawn) {
      this.needSpawn = false;
      this.spawnAll();
    }
    const st = this.stage?.stick;
    // input: the joystick, else (on the tour) Bobo plays himself
    const dir = new THREE.Vector2();
    let speed = 0.95;
    if (live && st && (st.active || t - st.at < 3.5)) {
      dir.set(st.x, -st.y);
      if (dir.length() > 1) dir.normalize();
    } else if (live && this.auto) {
      const near = this.cans
        .filter((c) => c.state === "idle")
        .sort(
          (a, b) =>
            Math.hypot(a.x - this.pos.x, a.z - this.pos.y) -
            Math.hypot(b.x - this.pos.x, b.z - this.pos.y),
        )[0];
      if (near) {
        dir.set(near.x - this.pos.x, near.z - this.pos.y);
        if (dir.length() > 0.02) dir.normalize();
        speed = 0.6;
      }
    }
    this.vel.lerp(dir.multiplyScalar(speed), 1 - Math.exp(-10 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const r = this.pos.length();
    if (r > 0.84) this.pos.multiplyScalar(0.84 / r);
    const v = this.vel.length();
    if (v > 0.05) {
      const want = Math.atan2(this.vel.x, this.vel.y);
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-12 * dt));
    }
    this.bobo.position.set(this.pos.x, 0, this.pos.y);
    this.bobo.rotation.set(-0.22, this.heading, 0, "XYZ");
    this.shadow.position.set(this.pos.x, 0.004, this.pos.y);
    const w = clamp01(v / 0.45);
    this.idle?.setEffectiveWeight(1 - w);
    this.run?.setEffectiveWeight(w);
    if (this.run) this.run.timeScale = 0.7 + v * 0.6;
    this.mixer?.update(dt);

    // cans: drop in, spin, and disappear when Bobo reaches them
    for (const c of [...this.cans]) {
      c.t += dt;
      if (c.state === "drop") {
        const k = clamp01(c.t / 0.55);
        c.obj.position.y = (1 - k * k) * 0.9;
        c.obj.visible = c.t >= 0;
        if (k >= 1) {
          c.state = "idle";
          c.t = 0;
        }
      } else if (c.state === "idle") {
        c.obj.rotation.x = -0.22;
        c.obj.rotation.y += dt * 2.2;
        c.obj.position.y = 0.02 + Math.sin(t * 3 + c.x * 9) * 0.015;
        if (live && Math.hypot(c.x - this.pos.x, c.z - this.pos.y) < 0.15) {
          c.state = "pop";
          c.t = 0;
          this.score += 1;
          this.onScore(this.score);
          this.burst(c.x, c.z);
        }
      } else {
        const k = clamp01(c.t / 0.3);
        c.obj.scale.setScalar(Math.max(1e-3, 1 + k * 0.4 - k * k * 1.4));
        c.obj.position.y = 0.02 + k * 0.25;
        c.obj.rotation.y += dt * 14;
        if (k >= 1) {
          this.boardG.remove(c.obj);
          this.cans.splice(this.cans.indexOf(c), 1);
        }
      }
    }
    if (!this.done && this.score >= CANS && this.cans.length === 0) {
      this.done = true;
      this.onDone();
    }
    for (const b of [...this.bursts]) {
      b.t += dt;
      const k = clamp01(b.t / 0.45);
      b.m.scale.setScalar(0.08 + k * 0.32);
      (b.m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k >= 1) {
        this.boardG.remove(b.m);
        b.m.geometry.dispose();
        (b.m.material as THREE.Material).dispose();
        this.bursts.splice(this.bursts.indexOf(b), 1);
      }
    }
  }

  dispose() {
    this.mixer?.stopAllAction();
  }
}

/** The mini EVADE retail display, on a board, turning gently. */
class DisplayPop implements Pop {
  root = new THREE.Group();
  ready = false;
  private boardG: THREE.Group;
  private model: THREE.Object3D | null = null;

  constructor(accent: number) {
    this.boardG = board(accent);
    this.boardG.rotation.x = 0.32;
    this.root.add(this.boardG);
    setLayer(this.root, L_POP);
    this.root.visible = false;
  }

  setModel(g: GLTF) {
    const m = fit(g.scene, 1.75);
    const box = new THREE.Box3().setFromObject(m);
    m.position.y -= box.min.y;
    m.position.z += 0.05;
    const holder = new THREE.Group();
    holder.add(m);
    this.model = holder;
    this.boardG.add(holder);
    setLayer(this.root, L_POP);
    this.ready = true;
  }

  update(_dt: number, t: number, live: boolean) {
    if (this.model) this.model.rotation.y = live ? Math.sin(t * 0.45) * 0.42 : 0;
  }

  dispose() {}
}

/* =================================================================== the phone */

function buildPhone(screenMat: THREE.ShaderMaterial) {
  const g = new THREE.Group();
  const R = 0.11;
  const frame = new THREE.MeshPhysicalMaterial({
    color: 0x8d9096,
    metalness: 1,
    roughness: 0.26,
    envMapIntensity: 2.4,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  });
  const bevel = 0.014;
  const body = new THREE.Mesh(
    roundedSlab(PH_W - bevel * 2, PH_H - bevel * 2, PH_D - bevel * 2, R - bevel, bevel),
    frame,
  );
  g.add(body);
  // front glass: black, glossy
  const glass = new THREE.Mesh(
    roundedPlane(PH_W - 0.012, PH_H - 0.012, R - 0.006),
    new THREE.MeshPhysicalMaterial({
      color: 0x020203,
      roughness: 0.06,
      metalness: 0,
      clearcoat: 1,
      envMapIntensity: 1.2,
    }),
  );
  glass.position.z = PH_D / 2 + 0.0008;
  g.add(glass);
  // back glass: frosted
  const backG = new THREE.Mesh(
    roundedPlane(PH_W - 0.012, PH_H - 0.012, R - 0.006),
    new THREE.MeshPhysicalMaterial({ color: 0x2c2e33, roughness: 0.55, envMapIntensity: 1.5 }),
  );
  backG.position.z = -PH_D / 2 - 0.0008;
  backG.rotation.y = Math.PI;
  g.add(backG);
  // the screen
  const sw = PH_W - 2 * BEZEL;
  const sh = PH_H - 2 * BEZEL;
  const screen = new THREE.Mesh(roundedPlane(sw, sh, R - BEZEL + 0.004), screenMat);
  screen.position.z = PH_D / 2 + 0.0016;
  g.add(screen);
  // buttons
  const btn = (x: number, y: number, len: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, len, 0.034), frame);
    b.position.set(x, y, 0);
    g.add(b);
  };
  btn(-PH_W / 2 - 0.004, PH_H * 0.3, 0.06); // action
  btn(-PH_W / 2 - 0.004, PH_H * 0.2, 0.11); // volume up
  btn(-PH_W / 2 - 0.004, PH_H * 0.1, 0.11); // volume down
  btn(PH_W / 2 + 0.004, PH_H * 0.16, 0.17); // side
  return g;
}

/** The phone screen: the camera feed, AR brackets, the island, glass sheen. */
function screenMaterial(feed: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tFeed: { value: feed },
      uRect: { value: new THREE.Vector4(0.2, 0.3, 0.8, 0.7) },
      uLock: { value: 0 },
      uBr: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uAccent: { value: BLUE.clone() },
      uAspect: { value: 0.46 },
      uOn: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tFeed;
      uniform vec4 uRect;
      uniform float uLock, uBr, uFlash, uTime, uAspect, uOn;
      uniform vec3 uAccent;
      varying vec2 vUv;

      vec3 aces(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      float sdBox(vec2 p, vec2 b, float r) {
        vec2 q = abs(p) - b + r;
        return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
      }
      float seg(vec2 p, vec2 a, vec2 b) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h);
      }

      void main() {
        vec2 uv = vUv;
        vec4 f = texture2D(tFeed, uv);
        // the room through the camera: near-black with the grid, a touch of noise
        vec2 g = mod(uv * vec2(uAspect, 1.0) * 120.0, 1.0);
        float line = step(g.x, 0.09) + step(g.y, 0.09);
        vec3 room = vec3(0.028, 0.032, 0.058) + vec3(0.03, 0.035, 0.06) * min(line, 1.0);
        vec3 col = mix(room, pow(aces(f.rgb * 1.2), vec3(1.0 / 2.2)), clamp(f.a, 0.0, 1.0));
        // camera vignette
        vec2 c = uv - 0.5;
        col *= 1.0 - 0.32 * pow(length(c * vec2(1.0, 0.8)) * 1.4, 2.4);

        // AR brackets: searching (a pulsing frame), then locking onto the design
        vec2 P = uv * vec2(uAspect, 1.0);
        float pulse = 0.02 * sin(uTime * 4.0);
        vec4 search = vec4(0.14 - pulse, 0.26 - pulse, 0.86 + pulse, 0.74 + pulse);
        float lk = uLock * uLock * (3.0 - 2.0 * uLock);
        vec4 tgt = uRect + vec4(-0.03, -0.02, 0.03, 0.02);
        vec4 r = mix(search, tgt, lk);
        vec2 r0 = vec2(r.x * uAspect, r.y), r1 = vec2(r.z * uAspect, r.w);
        float L = min(0.09, 0.3 * min(r1.x - r0.x, r1.y - r0.y));
        float d = 1e3;
        d = min(d, min(seg(P, r0, r0 + vec2(L, 0.0)), seg(P, r0, r0 + vec2(0.0, L))));
        d = min(d, min(seg(P, vec2(r1.x, r0.y), vec2(r1.x - L, r0.y)), seg(P, vec2(r1.x, r0.y), vec2(r1.x, r0.y + L))));
        d = min(d, min(seg(P, r1, r1 - vec2(L, 0.0)), seg(P, r1, r1 - vec2(0.0, L))));
        d = min(d, min(seg(P, vec2(r0.x, r1.y), vec2(r0.x + L, r1.y)), seg(P, vec2(r0.x, r1.y), vec2(r0.x, r1.y - L))));
        float th = 0.0055;
        float aa = fwidth(P.y) * 1.2;
        float br = 1.0 - smoothstep(th - aa, th + aa, d);
        vec3 brCol = mix(vec3(1.0), uAccent, lk);
        col = mix(col, brCol, br * uBr);
        // lock flash
        col += uAccent * uFlash * 0.22;

        // the island
        vec2 ip = P - vec2(0.5 * uAspect, 0.962);
        float isl = sdBox(ip, vec2(0.15 * uAspect, 0.019), 0.019);
        col = mix(col, vec3(0.0), 1.0 - smoothstep(-aa, aa, isl));

        // glass: a soft diagonal sheen
        float s = uv.x * 0.55 + uv.y * 0.85;
        col += vec3(0.05) * smoothstep(0.95, 1.15, s) * (1.0 - smoothstep(1.15, 1.4, s));
        col *= uOn;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* =================================================================== hologram */

function holoMaterial() {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: null as THREE.Texture | null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uDpr: { value: 1 },
      uTint: { value: BLUE.clone() },
    },
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tScene;
      uniform vec2 uRes;
      uniform float uTime, uDpr;
      uniform vec3 uTint;

      const vec3 BG = vec3(0.020, 0.024, 0.047);
      vec3 aces(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }
      vec3 room(vec2 px) {
        vec2 g = mod(px / uDpr, 6.0);
        float line = step(g.x, 1.0) + step(g.y, 1.0);
        return BG + vec3(0.035, 0.04, 0.07) * min(line, 1.0);
      }
      vec4 scene(vec2 px) { return texture2D(tScene, px / uRes); }
      float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      void main() {
        vec2 px = gl_FragCoord.xy;
        vec4 s = scene(px);
        vec3 lit = aces(s.rgb * 1.1);
        float L = lum(lit);
        float o = 1.25 * uDpr;
        vec4 n1 = scene(px + vec2(o, 0.0)), n2 = scene(px - vec2(o, 0.0));
        vec4 n3 = scene(px + vec2(0.0, o)), n4 = scene(px - vec2(0.0, o));
        float e = abs(lum(aces(n1.rgb)) - lum(aces(n2.rgb))) + abs(lum(aces(n3.rgb)) - lum(aces(n4.rgb)));
        float sil = abs(n1.a - n2.a) + abs(n3.a - n4.a);
        float scan = 0.72 + 0.28 * sin((px.y / uDpr) * 2.1 - uTime * 3.0);
        vec3 holo = uTint * (0.14 + pow(L, 0.8) * 0.9 + e * 1.8 + sil * 0.9) * scan;
        float flick = 0.94 + 0.06 * sin(uTime * 13.0 + px.y * 0.01);
        vec3 col = mix(room(px), room(px) + holo * flick, clamp(s.a, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* =================================================================== helpers */

function setLayer(o: THREE.Object3D, layer: number) {
  o.traverse((c) => c.layers.set(layer));
}

function forMaterials(o: THREE.Object3D, fn: (m: THREE.Material) => void) {
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach(fn);
  });
}

function firstMesh(o: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  o.traverse((c) => {
    if (!found && (c as THREE.Mesh).isMesh) found = c as THREE.Mesh;
  });
  return found;
}

/** Project a world box with a camera, as a screen rect in uv (x0, y0, x1, y1). */
function projectBox(b: THREE.Box3, cam: THREE.Camera): [number, number, number, number] {
  let x0 = 1e9,
    y0 = 1e9,
    x1 = -1e9,
    y1 = -1e9;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
    v.project(cam);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  const u = (n: number) => Math.min(1.2, Math.max(-0.2, n * 0.5 + 0.5));
  return [u(x0), u(y0), u(x1), u(y1)];
}

/**
 * A sheet that hugs a garment's print and plays the AR video: the same
 * construction as /activated-merch/ (raycast the target's corners onto the
 * cloth), simplified. Built in the cloth mesh's own space.
 */
function clothSheet(cloth: THREE.Mesh, rect: number[][], quad: number[][]) {
  const geo0 = cloth.geometry;
  geo0.computeBoundingBox();
  const bb = geo0.boundingBox!;
  const [tl, tr, br, bl] = rect;
  const NX = 12;
  const NY = 14;
  const rc = new THREE.Raycaster();
  cloth.updateMatrixWorld(true);
  const m = cloth.matrixWorld;
  const inv = m.clone().invert();
  const dirW = new THREE.Vector3(0, 0, 1).transformDirection(m);
  const atQuad = (a: number, b: number) =>
    [0, 1].map((k) =>
      lerp(lerp(quad[0][k], quad[1][k], a), lerp(quad[3][k], quad[2][k], a), b),
    ) as [number, number];
  const pts: THREE.Vector3[] = [];
  const uv = new Float32Array(NX * NY * 2);
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const [s, t] = atQuad(i / (NX - 1), j / (NY - 1));
      const su = lerp(lerp(tl[0], tr[0], s), lerp(bl[0], br[0], s), t);
      const sv = lerp(lerp(tl[1], tr[1], s), lerp(bl[1], br[1], s), t);
      const lx = lerp(bb.min.x, bb.max.x, (su + 1) / 2);
      const ly = lerp(bb.min.y, bb.max.y, sv);
      const from = new THREE.Vector3(lx, ly, bb.min.z - 0.5).applyMatrix4(m);
      rc.set(from, dirW);
      const hit = rc.intersectObject(cloth, false)[0];
      const p = hit ? hit.point.applyMatrix4(inv) : new THREE.Vector3(lx, ly, NaN);
      p.z -= 0.006;
      pts.push(p);
      uv[(j * NX + i) * 2] = i / (NX - 1);
      uv[(j * NX + i) * 2 + 1] = 1 - j / (NY - 1);
    }
  }
  // off the cloth: carry on flat from the median
  const zs = pts
    .map((p) => p.z)
    .filter((z) => !Number.isNaN(z))
    .sort((a, b) => a - b);
  const zMid = zs.length ? zs[zs.length >> 1] : bb.min.z;
  const pos = new Float32Array(NX * NY * 3);
  pts.forEach((p, n) => {
    pos[n * 3] = p.x;
    pos[n * 3 + 1] = p.y;
    pos[n * 3 + 2] = Number.isNaN(p.z) ? zMid : p.z;
  });
  const idx: number[] = [];
  for (let j = 0; j < NY - 1; j++)
    for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i;
      idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

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

/** A thin printed card (poster, sign): the print is unlit so it reads true on the phone. */
function card(map: THREE.Texture, aspect: number) {
  const w = aspect >= 1 ? 1 : aspect;
  const h = aspect >= 1 ? 1 / aspect : 1;
  const face = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const edge = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.8 });
  const back = new THREE.MeshStandardMaterial({ color: 0xd9d9e2, roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), [
    edge,
    edge,
    edge,
    edge,
    face,
    back,
  ]);
  return { mesh };
}

function roundedShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
function roundedPlane(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 12);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / w + 0.5;
    uv[i * 2 + 1] = p.getY(i) / h + 0.5;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
function roundedSlab(w: number, h: number, depth: number, r: number, bevel: number) {
  const g = new THREE.ExtrudeGeometry(roundedShape(w, h, r), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
