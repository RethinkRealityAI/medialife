/**
 * The homepage hero: "Point. It comes alive."
 *
 * One real MEDIALIFE piece at a time floats in a dark room as a hologram
 * (blue or magenta, alternating). The visitor holds a big, realistic phone: on
 * desktop it follows the mouse, on touch it is dragged (or tapped into place).
 * Its screen is a window onto the same scene in full colour, drawn from the
 * same camera, so it lines up exactly with the hologram around it: the real
 * tee, the real poster, seen through the phone. When the phone is over a
 * design, the brackets lock on and the design's AR video plays on the piece
 * itself, visible only through the phone, like real image-target AR. Move away
 * and it stops. Once a design is alive the phone holds still, so the visitor can
 * use its button (or the game's joystick); moving the mouse off the phone picks
 * it up again. Nobody touching it? The phone tours the designs by itself.
 *
 * The EVADE charms go further: Bobo and three cola cans pop out into the room,
 * the joystick on the phone steers Bobo, and three cans unlock a digital reward.
 *
 * Rendering, per frame:
 *  1. the scene in colour (pieces, AR videos, pop-outs) from the main camera,
 *     to a target that only the phone's screen shows (screen-space, scissored
 *     to the phone);
 *  2. the pieces from the same camera to a target, then one full-screen pass
 *     turns them into the hologram over the room grid;
 *  3. the phone and anything that has popped out, in colour, on top.
 *
 * Plain three.js, loaded on demand by Hero.tsx so it never touches SSR or the
 * first paint. The page shows a static poster until the first frame is ready.
 */
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CANS, type HeroSlide, type HeroSpot } from "./hero-slides";

export type Track = "build" | "search" | "lock" | "alive";
export type PhoneRect = { x: number; y: number; w: number; h: number; angle: number };

export type ArEvents = {
  /** First frame with the first piece drawn. */
  onReady?: () => void;
  /** The slide changed (the new one starts building in). */
  onSlide?: (index: number) => void;
  /** Tracking, for the hints on the phone: building, searching, locking on, alive. */
  onTrack?: (t: Track) => void;
  /** Which design (spot) of the piece the phone is on. */
  onSpot?: (spot: number) => void;
  /** Each frame: the phone's screen on the page (CSS px centre and size, roll). */
  onPhone?: (r: PhoneRect) => void;
  /** Mouse click on a live design: open its button (the spot's CTA). */
  onActivate?: (spot: number) => void;
  /** The phone follows the mouse (true), or holds still on a live design (false). */
  onFollow?: (following: boolean) => void;
  /** On resize: the stage area (CSS px, relative to the canvas). */
  onLayout?: (r: { x: number; y: number; w: number; h: number }) => void;
  /** Each frame while it shows: the NFC hotspot on the page (CSS px), and whether the phone covers it. */
  onHotspot?: (h: { x: number; y: number; r: number; covered: boolean } | null) => void;
  /** Bobo collected a can (0 when the game resets). */
  onScore?: (n: number) => void;
  /** All the cans are collected: the digital reward unlocks. */
  onReward?: () => void;
  /** Each frame: how far the tour is through the current design (0..1). */
  onProgress?: (p: number) => void;
};

/* Layers: what each pass draws. */
const L_PIECE = 0; // the pieces: hologram (main) + colour (phone)
const L_AR = 1; // AR videos: phone only
const L_POP = 2; // pop-outs: both, in colour
const L_PHONE = 3; // the phone: main only

const Z_PIECE = -1.2;
const Z_BACK = -3.2;
const Z_POP = 0.3;
const Z_PHONE = 3.2;
const CAM_Z = 9;
const FOV = 30;
/** The hero's content never spreads wider than this (CSS px), centred. */
const MAX_W = 1480;
/** Room left under the stage for the tabs (CSS px). */
const TABS_H = 50;

/* Phone proportions (a modern 6.1" phone, in its own units). */
const PH_W = 0.71;
const PH_H = 1.47;
const PH_D = 0.078;
const BEZEL = 0.024;
const SCR_W = PH_W - 2 * BEZEL;
const SCR_H = PH_H - 2 * BEZEL;

/* Timings (s) */
const IN_T = 0.8;
const SCAN_T = 0.7;
const OUT_T = 0.5;
/** The game on the tour: at most this long, or a few seconds after the reward */
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

/** One design on a piece, with its own AR video. */
type Spot = {
  def: HeroSpot;
  /** What counts as the design, on screen */
  bracket: THREE.Object3D | null;
  /** The AR video, on the design (layer L_AR: phone only) */
  overlay: THREE.Mesh | null;
  mat: THREE.MeshBasicMaterial | null;
  /** Reveal wipe: keeps y >= -constant */
  reveal: THREE.Plane;
  still: THREE.Texture | null;
  video: HTMLVideoElement | null;
  videoTex: THREE.VideoTexture | null;
  /** The video is actually showing frames (seconds since, or -1) */
  playT: number;
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
  spots: Spot[];
  pop: Pop | null;
  /** The NFC hotspot, if the piece has one */
  hotspot: THREE.Group | null;
  /** What stands behind a pop-out (Bobo's Hideout) */
  hub: THREE.Group | null;
};

type Px = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };
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
  private texLoader = new THREE.TextureLoader();
  private gltfCache = new Map<string, Promise<GLTF>>();
  private clock = new THREE.Clock();
  private raf = 0;
  private running = false;
  private disposed = false;
  private ro: ResizeObserver;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private bufW = 1;
  private bufH = 1;
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
  /** Which design the phone is on (or locking onto) */
  private spotI = 0;
  /** Which design the tour is showing */
  private tourSpot = 0;
  /** 0..1 while the phone is over a design and locking on */
  private scanAmt = 0;
  /** How long the phone has been off the design while it is alive */
  private offT = 0;
  /** Seconds alive that count towards the tour moving on (only while nobody is playing) */
  private dwellT = 0;
  private popAmt = 0;
  private popT = 0;
  private popGrow = 0;
  private popOffT = 9;
  /** The game: how long the mouse-held phone has been still (it settles after a moment) */
  private settleT = 0;
  private clothU = { uClothT: { value: 0 } };
  private hotSent = false;
  private tint = BLUE.clone();
  private readyFired = false;
  private introT = 0;
  private firstGuide = true;
  private track: Track | null = null;
  private spotSent = -1;

  // the phone, where the visitor holds it (CSS px on the canvas)
  private ph = { x: 0, y: 0 };
  private phGoal = { x: 0, y: 0 };
  private phVel = { x: 0, y: 0 };
  private phSet = false;
  private dragging = false;
  private dragOff = { x: 0, y: 0 };
  private manualUntil = -1;
  private guiding = false;
  /** The mouse is over the stage and the phone follows it */
  private mouseIn = false;
  /** The mouse is somewhere over the stage (the phone's own buttons included): no tour */
  private mouseOver = false;
  private mouse = { x: 0, y: 0 };
  /** The phone holds still on a live design (until the mouse leaves it) */
  private locked = false;
  private following: boolean | null = null;
  private cursor = "";
  /** The phone's screen on the page, last frame */
  private scr: PhoneRect = { x: 0, y: 0, w: 0, h: 0, angle: 0 };
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
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), colourMaterial());
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
        spots: def.spots.map((d) => ({
          def: d,
          bracket: null,
          overlay: null,
          mat: null,
          reveal: new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4),
          still: null,
          video: null,
          videoTex: null,
          playT: -1,
        })),
        pop: null,
        hotspot: null,
        hub: null,
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
    window.addEventListener("pointermove", this.onMouse, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onMouseOut);

    this.ensure(this.cur).then(() => this.ensure((this.cur + 1) % this.slides.length));
    if (location.search.includes("debug")) (window as unknown as { __ar: ArStage }).__ar = this;
  }

  /* ------------------------------------------------------------ public */
  go(i: number) {
    const n = this.slides.length;
    i = ((i % n) + n) % n;
    if (i === this.cur && this.phase !== "out") return;
    this.locked = false;
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
  /** Touch: the visitor picked the phone up at (x, y), CSS px on the canvas. */
  grab(x: number, y: number) {
    this.dragging = true;
    this.locked = false;
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
  /** Point the phone at the next design (the Scan button). */
  pointAtPiece() {
    const s = this.slides[this.cur];
    // already on one, and the piece has another? go to that one
    if (this.phase === "alive" && s.spots.length > 1)
      this.tourSpot = (this.spotI + 1) % s.spots.length;
    else this.tourSpot = this.phase === "alive" ? this.spotI : this.tourSpot;
    const c = this.spotCentre(this.tourSpot);
    this.phGoal = this.clampPhone(c.x, c.y);
    this.locked = true; // hold it there, even under the mouse
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
    for (const sp of this.slides[this.cur].spots) sp.video?.pause();
  }
  private renderOnce() {
    this.frame(0);
  }

  /** Someone is using the phone or the stick: no tour for a while. */
  private handsOn(s = 10) {
    this.manualUntil = Math.max(this.manualUntil, this.t + s);
  }
  /** Send the phone back to where it rests, beside the piece. */
  private home() {
    this.tourSpot = 0;
    if (!this.dragging && !this.mouseIn && this.lay) this.phGoal = { ...this.lay.phone };
  }
  private clampPhone(x: number, y: number) {
    const ph = this.lay.phoneH;
    const pw = ph * (PH_W / PH_H);
    const st = this.lay.stage;
    if (this.tall) {
      // on phones the whole phone stays inside the stage, above the tabs
      const lo = st.y + ph * 0.47;
      const hi = Math.max(lo, st.y + st.h - TABS_H - ph * 0.47);
      return {
        x: Math.min(this.w - pw * 0.35, Math.max(pw * 0.35, x)),
        y: Math.min(hi, Math.max(lo, y)),
      };
    }
    return {
      x: Math.min(this.w - pw * 0.35, Math.max(st.x + pw * 0.3, x)),
      // the bottom of the phone (its button, the joystick) stays clear of the tabs
      y: Math.min(st.y + st.h - TABS_H - ph * 0.46, Math.max(ph * 0.3, y)),
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
  private async tex(src: string) {
    const t = await this.texLoader.loadAsync(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  /** Load a slide's piece, its designs and their AR (once). */
  private async ensure(i: number) {
    const s = this.slides[i];
    if (s.loaded || s.loading || this.disposed) return;
    s.loading = true;
    const def = s.def;
    try {
      let fitted: THREE.Group;
      if (def.target.kind === "glb") {
        const g = await this.gltf(def.target.src);
        const obj = g.scene;
        const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
        obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m && "map" in m && m.map) m.map.anisotropy = Math.min(8, maxAniso);
          if (m) m.side = THREE.DoubleSide;
        });
        if (this.disposed) return;
        fitted = fit(obj, 1);
        if (def.target.rotY) fitted.rotation.y = def.target.rotY;
        s.inner.add(fitted);
        fitted.updateMatrixWorld(true);
        // a garment's video goes on its print
        const sp = s.spots[0];
        const cloth = sp?.def.video?.cloth ? firstMesh(fitted) : null;
        if (sp && cloth && sp.def.video?.cloth) {
          const mat = this.videoMat(s, sp);
          const mesh = new THREE.Mesh(
            clothSheet(cloth, sp.def.video.cloth.rect, sp.def.video.cloth.quad),
            mat,
          );
          cloth.add(mesh);
          this.addOverlay(sp, mesh, mat);
          // the cloth moves a little, as if worn in a breeze; the video moves with it
          clothWave(cloth, [cloth.material as THREE.Material, mat], this.clothU);
        } else if (sp) sp.bracket = fitted;
      } else {
        // printed cards, one per design, laid out as a little composition
        const comp = new THREE.Group();
        const maps = await Promise.all(
          s.spots.map((sp) => (sp.def.card ? this.tex(sp.def.card.src) : null)),
        );
        if (this.disposed) return;
        s.spots.forEach((sp, k) => {
          const c = sp.def.card;
          const map = maps[k];
          if (!c || !map) return;
          const ch = c.h;
          const cw = c.h * c.aspect;
          const holder = new THREE.Group();
          holder.position.set(c.x, c.y, c.sticker ? 0.06 : 0);
          holder.rotation.z = c.rot ?? 0;
          const made = c.sticker ? sticker(map, cw, ch) : card(map, cw, ch);
          holder.add(made.mesh);
          comp.add(holder);
          sp.bracket = made.mesh;
          if (sp.def.video) {
            const mat = this.videoMat(s, sp);
            const mesh = new THREE.Mesh(made.face, mat);
            mesh.position.z = made.front + 0.002;
            holder.add(mesh);
            this.addOverlay(sp, mesh, mat);
          }
        });
        fitted = fit(comp, 1);
        s.inner.add(fitted);
      }
      // all of it clips with the build wipe
      forMaterials(fitted, (m) => {
        m.clippingPlanes = [...(m.clippingPlanes ?? []).filter((p) => p !== s.clip), s.clip];
      });
      setLayer(fitted, L_PIECE);
      for (const sp of s.spots) if (sp.overlay) sp.overlay.layers.set(L_AR);
      // local bounds, with the group at rest
      s.group.position.set(0, 0, 0);
      s.group.rotation.set(0, 0, 0);
      s.group.scale.setScalar(1);
      s.group.updateMatrixWorld(true);
      s.box.setFromObject(s.inner);

      // an NFC hotspot on the piece: point the phone at it to start
      s.spots.forEach((sp) => {
        const h = sp.def.hotspot;
        if (!h) return;
        const hs = hotspot(accentHex(def.accent));
        hs.position.set(
          lerp(s.box.min.x, s.box.max.x, h.u),
          lerp(s.box.max.y, s.box.min.y, h.v),
          s.box.max.z + 0.01,
        );
        hs.scale.setScalar((s.box.max.y - s.box.min.y) * 0.075);
        setLayer(hs, L_PIECE);
        s.inner.add(hs);
        sp.bracket = hs.getObjectByName("target") ?? hs;
        s.hotspot = hs;
      });

      // what pops out
      const pop = def.pop;
      if (pop?.kind === "bobo") {
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
        s.pop = game;
        this.scene.add(game.root);
        Promise.all([this.gltf(pop.bobo), this.gltf(pop.anims), this.gltf(pop.can)])
          .then(
            ([b, a, c]) =>
              !this.disposed && game.setModels(b, [...a.animations, ...b.animations], c),
          )
          .catch((e) => console.warn("[ar] bobo", e));
        // Bobo's Hideout, behind the game
        if (pop.hub)
          this.gltf(pop.hub)
            .then((g) => {
              if (this.disposed) return;
              const room = fit(g.scene, 1);
              const hub = new THREE.Group();
              hub.add(room);
              hub.visible = false;
              setLayer(hub, L_POP);
              this.scene.add(hub);
              s.hub = hub;
            })
            .catch((e) => console.warn("[ar] hub", e));
      } else if (pop?.kind === "display") {
        const d = new DisplayPop(accentHex(def.accent));
        s.pop = d;
        this.scene.add(d.root);
        this.gltf(pop.src)
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

  /** The material a design's AR video plays in (starts empty; the still with reduced motion). */
  private videoMat(s: Slide, sp: Spot) {
    const mat = new THREE.MeshBasicMaterial({
      side: THREE.DoubleSide,
      clippingPlanes: [s.clip, sp.reveal],
      toneMapped: false,
      // always over the print it sits on: no fighting the cloth or the card for depth
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    if (this.reduced && sp.def.video)
      this.tex(sp.def.video.still)
        .then((t) => {
          sp.still = t;
          mat.map = t;
          mat.needsUpdate = true;
        })
        .catch(() => {});
    return mat;
  }
  private addOverlay(sp: Spot, mesh: THREE.Mesh, mat: THREE.MeshBasicMaterial) {
    mesh.visible = false;
    mesh.renderOrder = 5;
    sp.overlay = mesh;
    sp.mat = mat;
    sp.bracket = mesh;
  }

  /* ------------------------------------------------------------ layout */
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.tall = this.w / this.h < 1.05;
    this.renderer.setSize(this.w, this.h, false);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bufW = buf.x;
    this.bufH = buf.y;
    this.rtMain.setSize(buf.x, buf.y);
    this.rtPhone.setSize(buf.x, buf.y);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.post.material.uniforms.uRes.value.set(buf.x, buf.y);
    this.post.material.uniforms.uDpr.value = this.dpr;
    this.screenMat.uniforms.uRes.value.set(buf.x, buf.y);
    this.screenMat.uniforms.uDpr.value = this.dpr;
    this.screenMat.uniforms.uAspect.value = SCR_W / SCR_H;
    this.lay = this.layout();
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
    const ratio = PH_W / PH_H;
    if (!this.tall) {
      // text on the left, stage right beside it, all inside a centred column
      const right = w - Math.max(0, (w - MAX_W) / 2) - 24;
      const x0 = Math.max(w * 0.36, Math.min(c ? c.x + c.w + 28 : w * 0.45, w * 0.58));
      const st = { x: x0, y: h * 0.06, w: Math.max(240, right - x0), h: h * 0.86 };
      const cy = st.y + st.h / 2;
      const piece = { x: st.x + st.w * 0.6, y: cy };
      const phoneH = Math.min(st.h * 0.8, (st.w * 0.42) / ratio);
      return {
        stage: st,
        piece,
        pieceH: st.h * 0.82,
        pieceW: st.w * 0.6,
        back: { x: piece.x, y: cy - st.h * 0.3 },
        phone: { x: st.x + phoneH * ratio * 0.55, y: cy + st.h * 0.03 },
        phoneH,
        pop: { x: piece.x - st.w * 0.04, y: cy + st.h * 0.1 },
        popR: Math.min(st.w * 0.3, st.h * 0.42),
      };
    }
    // stage above the text
    const bottom = c ? Math.max(h * 0.36, c.y - 56) : h * 0.5;
    const st = { x: 0, y: h * 0.02, w, h: bottom - h * 0.02 };
    const use = st.h - TABS_H;
    const cx = st.x + st.w / 2;
    const cy = st.y + use / 2;
    const piece = { x: cx + st.w * 0.17, y: cy };
    const phoneH = Math.min(use * 0.94, (st.w * 0.36) / ratio);
    return {
      stage: st,
      piece,
      pieceH: use * 0.9,
      pieceW: st.w * 0.56,
      back: { x: piece.x, y: cy - use * 0.3 },
      phone: { x: st.x + phoneH * ratio * 0.6, y: cy },
      phoneH,
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
  private toPx(v: THREE.Vector3) {
    const p = this.tmpV2.copy(v).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.w, y: (-p.y * 0.5 + 0.5) * this.h };
  }
  /** A world box on the page, CSS px. */
  private boxPx(b: THREE.Box3): Rect {
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

  /* ------------------------------------------------------------ input */
  // Mouse: the phone follows the pointer over the stage (the phone IS the
  // cursor there). Touch: the phone is dragged through a DOM handle over it
  // (Hero.tsx), so scrolling still works everywhere else; a tap on the canvas
  // moves the phone there, and a horizontal swipe changes the piece.
  private onMouse = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !this.lay) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const st = this.lay.stage;
    const inside = x >= 0 && y >= 0 && x <= this.w && y <= this.h;
    const onStage = inside && (this.tall ? y <= st.y + st.h + 30 : x >= st.x - 30);
    // over the hero's buttons (tabs, copy, the phone's own UI): leave the phone be
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const onUi =
      !!el && el !== this.canvas && !!el.closest("a,button,[role=application],[role=dialog]");
    this.mouse = { x, y };
    if (this.locked) {
      // a live design holds the phone still; leaving the phone picks it up again
      const s = this.scr;
      const m = 4;
      const off = Math.abs(x - s.x) > s.w / 2 + m || Math.abs(y - s.y) > s.h / 2 + m || !onStage;
      if (off && !onUi) this.locked = false;
    }
    this.mouseIn = onStage && !onUi;
    this.mouseOver = onStage;
    if (this.mouseIn || this.locked) this.handsOn(2.5);
  };
  private onMouseOut = () => {
    this.mouseIn = false;
    this.mouseOver = false;
  };
  private onDown = (e: PointerEvent) => {
    this.tap = { x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== "mouse" };
  };
  /** A live design with a button, under the mouse-held phone: a click opens it. */
  private clickable() {
    return this.phase === "alive" && !this.slides[this.cur].def.pop && this.following === true;
  }
  private onUp = (e: PointerEvent) => {
    const s = this.tap;
    this.tap = null;
    if (!s || s.id !== e.pointerId) return;
    if (!s.touch) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8 && this.clickable())
        this.events.onActivate?.(this.spotI);
      return;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) this.nextSlide();
      else this.prevSlide();
      return;
    }
    if (Math.hypot(dx, dy) > 10) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const st = this.lay.stage;
    if (this.tall ? y > st.y + st.h + 24 : x < st.x - 24) return; // the copy, not the stage
    this.phGoal = this.clampPhone(x, y);
    this.locked = false;
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

  /** How long the tour stays on a design. */
  private dwell(s: Slide, sp: Spot | undefined) {
    if (s.def.pop?.kind === "bobo") return GAME_MAX_T;
    if (s.def.pop) return 8;
    const d = sp?.video?.duration;
    return d && d > 1 ? Math.max(6, d + 0.4) : 8;
  }

  private enterAlive(s: Slide) {
    this.popT = 0;
    this.dwellT = 0;
    this.firstGuide = false;
    // the tour carries on from the design the visitor is on
    this.tourSpot = this.spotI;
    // the game: the phone settles so the joystick can be used (the cursor
    // shows again); anything else keeps following the mouse, smoothly
    if (this.mouseOver && s.def.pop?.kind === "bobo") this.locked = true;
    const sp = s.spots[this.spotI];
    if (sp?.def.video && !this.reduced) this.playVideo(sp);
  }

  private leaveAlive() {
    for (const sp of this.slides[this.cur].spots) {
      sp.video?.pause();
      sp.playT = -1;
      if (sp.overlay) sp.overlay.visible = false;
    }
  }

  private playVideo(sp: Spot) {
    const v0 = sp.def.video;
    if (!v0 || !sp.mat) return;
    if (!sp.video) {
      const v = document.createElement("video");
      v.src = v0.src;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.crossOrigin = "anonymous";
      v.setAttribute("playsinline", "");
      v.setAttribute("muted", "");
      v.setAttribute("aria-hidden", "true");
      // in the document (invisible): some browsers throttle videos that aren't
      v.style.cssText =
        "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1";
      document.body.appendChild(v);
      sp.video = v;
      const vt = new THREE.VideoTexture(v);
      vt.colorSpace = THREE.SRGBColorSpace;
      sp.videoTex = vt;
      sp.mat.map = vt;
      sp.mat.needsUpdate = true;
      v.addEventListener("playing", () => {
        if (sp.playT < 0) sp.playT = 0;
      });
    }
    sp.playT = -1;
    try {
      sp.video.currentTime = 0;
    } catch {
      /* not seekable yet */
    }
    sp.video.play().catch(() => {
      /* autoplay refused (low power mode): show the still instead */
      if (!sp.still)
        this.tex(v0.still)
          .then((t) => {
            sp.still = t;
            if (sp.mat) {
              sp.mat.map = t;
              sp.mat.needsUpdate = true;
            }
            sp.playT = 0;
          })
          .catch(() => {});
    });
  }

  /** A design's place on the page (CSS px). */
  private spotRect(s: Slide, k: number): Rect | null {
    const sp = s.spots[k];
    if (!s.loaded || !sp?.bracket) return null;
    const b = this.tmpBox2.setFromObject(sp.bracket);
    const p = s.pop;
    if (k === 0 && p && p.ready && p.root.visible && this.popGrow > 0.5)
      b.union(this.tmpBox.setFromObject(p.root));
    return b.isEmpty() ? null : this.boxPx(b);
  }
  /** Where to hold the phone to see a design: its middle, or the board once it popped out. */
  private spotCentre(k: number) {
    const s = this.slides[this.cur];
    if (s.pop && this.popGrow > 0.5) return { ...this.lay.pop };
    const r = this.spotRect(s, k);
    return r ? { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } : { ...this.lay.piece };
  }
  /** Which design the phone's screen is on (-1: none). Smallest wins (stickers sit on posters). */
  private overSpot(s: Slide): number {
    if (this.scr.w <= 0) return -1;
    const { x, y } = this.scr;
    let best = -1;
    let bestA = 1e12;
    for (let k = 0; k < s.spots.length; k++) {
      const r = this.spotRect(s, k);
      if (!r) continue;
      const keep = this.phase === "alive" && k === this.spotI;
      let hit: boolean;
      if (s.spots[k].def.hotspot) {
        // an NFC tag: anywhere in the middle of the screen will do (it sits
        // low on the keychain, where the phone can't always centre on it)
        const cx = (r.x0 + r.x1) / 2;
        const cy = (r.y0 + r.y1) / 2;
        const f = keep ? 0.6 : 0.36;
        hit = Math.abs(cx - x) < this.scr.w * f && Math.abs(cy - y) < this.scr.h * (f + 0.06);
      } else {
        const m = this.scr.w * (keep ? 0.3 : 0.04);
        hit = x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m;
      }
      if (hit) {
        const a = (r.x1 - r.x0) * (r.y1 - r.y0) * (keep ? 0.6 : 1);
        if (a < bestA) {
          bestA = a;
          best = k;
        }
      }
    }
    return best;
  }

  /* ------------------------------------------------------------ frame */
  private frame(dt: number) {
    this.t += dt;
    const t = this.t;
    const L = this.lay;
    const R = this.reduced;
    const manual = t < this.manualUntil || this.dragging || this.stick.active || this.mouseOver;
    const auto = !this.paused && !R && !manual;

    // --- the carousel: build in, wait for the phone, come alive, leave
    this.pt += dt;
    let s = this.slides[this.cur];
    if (this.phase === "out" && this.pt >= OUT_T) {
      s.group.visible = false;
      this.leaveAlive();
      this.cur = this.next;
      s = this.slides[this.cur];
      this.phase = "in";
      this.pt = R ? IN_T : 0;
      this.scanAmt = 0;
      this.popGrow = 0;
      this.popAmt = 0;
      this.spotI = 0;
      this.tourSpot = 0;
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

    // which design is the phone over? (its screen centre, from the last frame)
    const over = this.phase === "wait" || this.phase === "alive" ? this.overSpot(s) : -1;

    this.guiding = false;
    if (this.phase === "wait") {
      if (over >= 0) {
        if (over !== this.spotI) {
          this.spotI = over;
          this.scanAmt = Math.min(this.scanAmt, 0.3);
        }
        this.scanAmt = R ? 1 : this.scanAmt + dt / SCAN_T;
      } else this.scanAmt = Math.max(0, this.scanAmt - dt * 1.5);
      if (this.scanAmt >= 1) {
        this.scanAmt = 1;
        this.phase = "alive";
        this.pt = 0;
        this.offT = 0;
        this.enterAlive(s);
      }
    } else if (this.phase === "alive") {
      if (over >= 0 && over !== this.spotI) {
        // onto another design of the same piece
        this.leaveAlive();
        this.spotI = over;
        this.phase = "wait";
        this.pt = 0;
        this.scanAmt = 0.5;
      } else {
        this.offT = over === this.spotI ? 0 : this.offT + dt;
        if (this.offT > 0.35) {
          // moved away: tracking lost, the experience stops
          this.leaveAlive();
          this.locked = false;
          this.phase = "wait";
          this.pt = 0;
          this.scanAmt = 0.5;
        }
      }
    }
    if (this.spotI !== this.spotSent) {
      this.spotSent = this.spotI;
      this.events.onSpot?.(this.spotI);
    }
    if (s.pop instanceof BoboGame) s.pop.auto = auto;

    // the tour: nobody is holding the phone, so show them
    if (auto && s.loaded) {
      const wantGuide =
        (this.phase === "wait" && this.pt > (this.firstGuide ? 2.4 : 1.2)) ||
        (this.phase === "alive" && this.tourSpot !== this.spotI);
      if (wantGuide) {
        const c = this.spotCentre(this.tourSpot);
        this.phGoal = this.clampPhone(c.x, c.y);
        this.guiding = true;
      }
    }

    let progress = 0;
    if (this.phase === "alive") {
      const sp = s.spots[this.spotI];
      const d = this.dwell(s, sp);
      if (auto && this.tourSpot === this.spotI) this.dwellT += dt;
      progress = clamp01(this.dwellT / d);
      if (auto && this.dwellT >= d) {
        if (this.spotI + 1 < s.spots.length) {
          this.tourSpot = this.spotI + 1;
          this.dwellT = 0;
        } else this.go(this.cur + 1);
      }
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

    const popWant = s.def.pop && this.phase === "alive" ? 1 : 0;
    this.popAmt = R || dt === 0 ? popWant : damp(this.popAmt, popWant, 3.2, dt);
    const popE = ease(this.popAmt);
    if (this.phase === "alive") this.popT += dt;

    // the game, mouse in hand: once the phone is held still for a moment it
    // settles, the cursor shows, and the joystick on it can be used
    const game = s.def.pop?.kind === "bobo";
    if (game && this.phase === "alive" && this.mouseIn && !this.locked && !this.dragging) {
      const still = Math.hypot(this.phVel.x, this.phVel.y) < 90;
      this.settleT = still ? this.settleT + dt : 0;
      if (this.settleT > 0.45) this.locked = true;
    } else this.settleT = 0;

    // the cloth breathes
    if (!R) this.clothU.uClothT.value = t;

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
      const bob = R ? 0 : Math.sin(t * 0.8) * 0.02;
      g.position.set(
        lerp(base.x, back.x, popE) + (R ? 0 : slide),
        lerp(base.y, back.y, popE) + bob,
        pz,
      );
      // with a hideout behind the game, the piece makes way for it entirely
      const scale = sz * lerp(1, s.def.pop?.kind === "bobo" && s.def.pop.hub ? 0.001 : 0.5, popE);
      g.scale.setScalar(scale);
      // a gentle sway (less while a video plays, so it reads like a real print)
      const still = this.phase === "alive" ? 0.45 : 1;
      const sway = R ? 0 : Math.sin(t * 0.45) * (s.def.target.kind === "glb" ? 0.16 : 0.07) * still;
      g.rotation.set(R ? 0 : Math.sin(t * 0.6) * 0.03 * still, sway + (R ? 0 : slide * 0.8), 0);
      const pieceBottom = g.position.y + s.box.min.y * scale;
      const pieceTop = g.position.y + s.box.max.y * scale;
      const pieceWidth = bw * scale;
      // build wipe, bottom to top (and back down on the way out)
      const pad = (pieceTop - pieceBottom) * 0.04;
      const cy = lerp(pieceBottom - pad, pieceTop + pad, build);
      s.clip.constant = build >= 0.999 ? 1e4 : cy;
      const sl = this.scanLine;
      sl.visible = build > 0.001 && build < 0.999;
      sl.position.set(g.position.x, cy, pz + 0.2);
      sl.scale.set(pieceWidth * 1.25, Math.max(0.008, (pieceTop - pieceBottom) * 0.006), 1);
      sl.material.color.setRGB(this.tint.x * 2.4, this.tint.y * 2.4, this.tint.z * 2.4);
      g.updateMatrixWorld(true);
      // AR: the design's video, on the design, wiping in from the top once it plays
      s.spots.forEach((sp, k) => {
        if (!sp.overlay) return;
        const on = this.phase === "alive" && k === this.spotI && (R || sp.playT >= 0);
        if (on && sp.playT >= 0) sp.playT += dt;
        sp.overlay.visible = on;
        if (!on) return;
        const b = this.tmpBox.setFromObject(sp.overlay);
        const p2 = (b.max.y - b.min.y) * 0.04;
        const rv = R ? 1 : smooth(0, 0.7, sp.playT);
        sp.reveal.constant = rv >= 0.999 ? 1e4 : -lerp(b.max.y + p2, b.min.y - p2, rv);
      });
    }

    // --- Bobo's Hideout: rises behind the game, and turns as the phone moves
    for (const o of this.slides) {
      const hub = o.hub;
      if (!hub) continue;
      const grow = o === s ? this.popGrow : 0;
      hub.visible = grow > 0.001;
      if (!hub.visible) continue;
      const at = this.toWorld(
        { x: L.piece.x + L.stage.w * 0.06, y: L.piece.y - L.stage.h * 0.02 },
        Z_BACK,
        this.tmpV,
      );
      hub.position.copy(at);
      hub.position.y -= (1 - Math.min(1, grow)) * 0.6;
      hub.scale.setScalar(Math.max(1e-3, L.pieceH * this.wpp(Z_BACK) * 0.95 * grow));
      const lean = clampAbs((this.ph.x - L.piece.x) / Math.max(1, L.stage.w), 0.6);
      const yaw = -0.55 + lean * 1.5 + (R ? 0 : Math.sin(t * 0.25) * 0.12);
      hub.rotation.set(0.14, dt === 0 || R ? yaw : damp(hub.rotation.y, yaw, 3, dt), 0);
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

    // --- the phone: follows the mouse, the hand, or the tour
    const follow = this.mouseIn && !this.locked && !this.dragging;
    if (follow) {
      // right under the pointer; at the edges it gives a little rather than stopping dead
      const c = this.clampPhone(this.mouse.x, this.mouse.y);
      this.phGoal = {
        x: c.x + (this.mouse.x - c.x) * 0.45,
        y: c.y + (this.mouse.y - c.y) * 0.45,
      };
    }
    if (follow !== this.following) {
      this.following = follow;
      this.events.onFollow?.(follow);
    }
    // the phone is the cursor; over a live design it's a hand: click to open its button
    const cur = follow ? (this.clickable() ? "pointer" : "none") : "";
    if (cur !== this.cursor) {
      this.cursor = cur;
      this.canvas.style.cursor = cur;
    }
    if (dt === 0 || R) {
      this.ph = { ...this.phGoal };
      this.phVel = { x: 0, y: 0 };
    } else {
      const k = this.dragging ? 30 : follow ? 26 : this.guiding ? 3.6 : 9;
      const nx = damp(this.ph.x, this.phGoal.x, k, dt);
      const ny = damp(this.ph.y, this.phGoal.y, k, dt);
      this.phVel.x = damp(this.phVel.x, (nx - this.ph.x) / dt, 12, dt);
      this.phVel.y = damp(this.phVel.y, (ny - this.ph.y) / dt, 12, dt);
      this.ph = { x: nx, y: ny };
    }
    const pos = this.toWorld(this.ph, Z_PHONE, new THREE.Vector3());
    // rise in from below
    pos.y -= (1 - intro) * L.phoneH * this.wpp(Z_PHONE) * 1.4;
    if (!R && !this.dragging && !follow) pos.y += Math.sin(t * 1.1) * 0.008;
    this.phone.scale.setScalar((L.phoneH * this.wpp(Z_PHONE)) / PH_H);
    this.phone.position.copy(pos);
    // held up facing us; turned a touch so it reads as a 3D object, and it
    // leans into the movement
    this.phone.rotation.set(0, 0, 0);
    this.phone.lookAt(this.tmpV.set(pos.x * 0.15, pos.y * 0.15, CAM_Z + 4));
    this.phone.rotateY(0.14);
    this.phone.rotateZ(
      -0.03 + (R ? 0 : Math.sin(t * 0.7) * 0.008) - clampAbs(this.phVel.x * 0.00012, 0.12),
    );
    this.phone.rotateX(clampAbs(this.phVel.y * 0.0001, 0.1));
    if (intro < 1) this.phone.rotateX((1 - intro) * 0.9);
    this.phone.updateMatrixWorld(true);

    // the phone's screen on the page (for the DOM layer and the brackets)
    {
      const z = PH_D / 2;
      const mw = this.phone.matrixWorld;
      const at = (x: number, y: number) => this.toPx(this.tmpV.set(x, y, z).applyMatrix4(mw));
      const c = at(0, 0);
      const l = at(-SCR_W / 2, 0);
      const r = at(SCR_W / 2, 0);
      const tp = at(0, SCR_H / 2);
      const bt = at(0, -SCR_H / 2);
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

    // the NFC hotspot: pulses until the phone brings the piece alive
    {
      const hs = s.hotspot;
      const show =
        !!hs && s.loaded && (this.phase === "wait" || (this.phase === "in" && build > 0.9));
      if (hs) {
        hs.visible = this.phase !== "alive" && this.popGrow < 0.05;
        const ring = hs.getObjectByName("pulse") as THREE.Mesh | undefined;
        if (ring) {
          const k = R ? 0.5 : (t * 0.9) % 1;
          ring.scale.setScalar(1 + k * 1.6);
          (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9;
        }
      }
      if (show && hs) {
        hs.getWorldPosition(this.tmpV);
        const c = this.toPx(this.tmpV);
        const r0 = this.spotRect(s, 0);
        const r = r0 ? (r0.x1 - r0.x0) / 2 : 12;
        const S2 = this.scr;
        const covered =
          c.x > S2.x - S2.w / 2 - 230 &&
          c.x < S2.x + S2.w / 2 + 10 &&
          Math.abs(c.y - S2.y) < S2.h / 2 + 20;
        this.events.onHotspot?.({ x: c.x, y: c.y, r, covered });
        this.hotSent = true;
      } else if (this.hotSent) {
        this.hotSent = false;
        this.events.onHotspot?.(null);
      }
    }

    // brackets, in page px (y up, as the shader sees them): searching inside
    // the screen, then locking onto the design (clipped to the screen)
    const u = this.screenMat.uniforms;
    const S = this.scr;
    const H = this.h;
    const sx0 = S.x - S.w / 2;
    const sx1 = S.x + S.w / 2;
    const syTop = S.y - S.h / 2;
    const syBot = S.y + S.h / 2;
    u.uSearch.value.set(
      sx0 + S.w * 0.14,
      H - (syBot - S.h * 0.24),
      sx1 - S.w * 0.14,
      H - (syTop + S.h * 0.24),
    );
    const lk = this.phase === "alive" ? 1 : this.phase === "wait" ? ease(this.scanAmt) : 0;
    const rr = s.loaded ? this.spotRect(s, this.spotI) : null;
    if (rr) {
      const m = 8;
      const ix = S.w * 0.05;
      const iy = S.h * 0.06;
      const x0 = Math.max(rr.x0 - m, sx0 + ix);
      const x1 = Math.min(rr.x1 + m, sx1 - ix);
      const y0 = Math.max(rr.y0 - m, syTop + iy);
      const y1 = Math.min(rr.y1 + m, syBot - iy);
      if (x1 - x0 > 20 && y1 - y0 > 20) u.uRect.value.set(x0, H - y1, x1, H - y0);
      else u.uRect.value.copy(u.uSearch.value);
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

    // --- hologram tint
    const pu = this.post.material.uniforms;

    // --- draw
    const rd = this.renderer;
    rd.setClearColor(0x000000, 0);
    // 1. the world in colour, from the same camera, only where the phone's
    //    screen is: the screen samples it in page space, so it lines up exactly
    {
      const rad = Math.abs(S.angle);
      const bw2 = (S.w * Math.cos(rad) + S.h * Math.sin(rad)) / 2 + 6;
      const bh2 = (S.w * Math.sin(rad) + S.h * Math.cos(rad)) / 2 + 6;
      const d = this.bufW / this.w;
      const x0 = Math.max(0, Math.floor((S.x - bw2) * d));
      const x1 = Math.min(this.bufW, Math.ceil((S.x + bw2) * d));
      const y0 = Math.max(0, Math.floor((H - (S.y + bh2)) * d));
      const y1 = Math.min(this.bufH, Math.ceil((H - (S.y - bh2)) * d));
      if (x1 > x0 && y1 > y0) {
        this.rtPhone.scissor.set(x0, y0, x1 - x0, y1 - y0);
        this.rtPhone.scissorTest = true;
        this.camera.layers.set(L_PIECE);
        this.camera.layers.enable(L_AR);
        this.camera.layers.enable(L_POP);
        rd.setRenderTarget(this.rtPhone);
        rd.clear();
        rd.render(this.scene, this.camera);
      }
    }
    // 2. the page view: the same world (without the AR), in colour
    this.camera.layers.set(L_PIECE);
    this.camera.layers.enable(L_POP);
    rd.setRenderTarget(this.rtMain);
    rd.clear();
    rd.render(this.scene, this.camera);
    rd.setRenderTarget(null);
    pu.tScene.value = this.rtMain.texture;
    rd.render(this.postScene, this.postCam);
    // 3. the phone, on top
    rd.autoClear = false;
    rd.clearDepth();
    this.camera.layers.set(L_PHONE);
    rd.render(this.scene, this.camera);
    rd.autoClear = true;

    if (!this.readyFired && this.slides[this.cur].loaded && dt > 0) {
      this.readyFired = true;
      requestAnimationFrame(() => this.events.onReady?.());
    }
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.ro.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    window.removeEventListener("pointermove", this.onMouse);
    document.documentElement.removeEventListener("pointerleave", this.onMouseOut);
    c.style.cursor = "";
    for (const s of this.slides) {
      for (const sp of s.spots) {
        if (sp.video) {
          sp.video.pause();
          sp.video.removeAttribute("src");
          sp.video.load();
          sp.video.remove();
        }
        sp.videoTex?.dispose();
        sp.still?.dispose();
      }
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

/**
 * The phone screen: a window onto the scene in colour. The feed was drawn from
 * the page's own camera, so the screen samples it at its own pixel on the page
 * and the real piece lines up exactly with its hologram around the phone.
 * On top: AR brackets (page px), the island, a glass sheen.
 */
function screenMaterial(feed: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tFeed: { value: feed },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uSearch: { value: new THREE.Vector4(0, 0, 1, 1) },
      uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
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
      uniform vec2 uRes;
      uniform vec4 uSearch, uRect;
      uniform float uDpr, uLock, uBr, uFlash, uTime, uAspect, uOn;
      uniform vec3 uAccent;
      varying vec2 vUv;

      ${LOOK}
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
        vec2 P = gl_FragCoord.xy / uDpr;
        vec4 f = texture2D(tFeed, gl_FragCoord.xy / uRes);
        // exactly what is behind the phone (same look as the page), plus the AR
        vec3 col = look(f, P);
        // a faint camera vignette, so it still reads as a screen
        vec2 c = vUv - 0.5;
        col *= 1.0 - 0.12 * pow(length(c * vec2(1.0, 0.8)) * 1.4, 2.4);

        // AR brackets: searching (a pulsing frame), then locking onto the design
        float pulse = 6.0 * sin(uTime * 4.0);
        vec4 search = uSearch + vec4(-pulse, -pulse, pulse, pulse);
        float lk = uLock * uLock * (3.0 - 2.0 * uLock);
        vec4 r = mix(search, uRect, lk);
        vec2 r0 = r.xy, r1 = r.zw;
        float L = min(30.0, 0.28 * min(r1.x - r0.x, r1.y - r0.y));
        float d = 1e4;
        d = min(d, min(seg(P, r0, r0 + vec2(L, 0.0)), seg(P, r0, r0 + vec2(0.0, L))));
        d = min(d, min(seg(P, vec2(r1.x, r0.y), vec2(r1.x - L, r0.y)), seg(P, vec2(r1.x, r0.y), vec2(r1.x, r0.y + L))));
        d = min(d, min(seg(P, r1, r1 - vec2(L, 0.0)), seg(P, r1, r1 - vec2(0.0, L))));
        d = min(d, min(seg(P, vec2(r0.x, r1.y), vec2(r0.x + L, r1.y)), seg(P, vec2(r0.x, r1.y), vec2(r0.x, r1.y - L))));
        float br = 1.0 - smoothstep(1.1, 2.1, d);
        vec3 brCol = mix(vec3(1.0), uAccent, lk);
        col = mix(col, brCol, br * uBr);
        // lock flash
        col += uAccent * uFlash * 0.2;

        // the island
        vec2 Q = vUv * vec2(uAspect, 1.0);
        float aa = fwidth(Q.y) * 1.2;
        vec2 ip = Q - vec2(0.5 * uAspect, 0.962);
        float isl = sdBox(ip, vec2(0.15 * uAspect, 0.019), 0.019);
        col = mix(col, vec3(0.0), 1.0 - smoothstep(-aa, aa, isl));

        // glass: a soft diagonal sheen
        float s = vUv.x * 0.55 + vUv.y * 0.85;
        col += vec3(0.045) * smoothstep(0.95, 1.15, s) * (1.0 - smoothstep(1.15, 1.4, s));
        col *= uOn;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/* =================================================================== hotspot + cloth */

/** An NFC hotspot: a glowing disc with a ring that pulses out. Unit radius. */
function hotspot(accent: number) {
  const g = new THREE.Group();
  const col = new THREE.Color(accent);
  const mat = (o: number) =>
    new THREE.MeshBasicMaterial({
      color: col.clone().multiplyScalar(1.6),
      transparent: true,
      opacity: o,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), mat(0.9));
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, toneMapped: false }),
  );
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 64), mat(0.95));
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 64), mat(0.8));
  pulse.name = "pulse";
  // what the phone has to be over: a little wider than the disc
  const target = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
  );
  target.name = "target";
  for (const [m, o] of [
    [target, 0],
    [disc, 1],
    [ring, 2],
    [pulse, 3],
    [core, 4],
  ] as const) {
    m.renderOrder = 20 + o;
    g.add(m);
  }
  return g;
}

/**
 * A gentle breeze on a garment, in the cloth's own space, applied the same way
 * to the cloth and to the AR video laid on it, so the video stays glued to the print.
 */
function clothWave(cloth: THREE.Mesh, mats: THREE.Material[], u: { uClothT: { value: number } }) {
  const geo = cloth.geometry;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const uniforms = {
    ...u,
    uClothY: { value: new THREE.Vector2(bb.min.y, bb.max.y) },
    uClothK: { value: new THREE.Vector2((Math.PI * 2 * 1.1) / w, (Math.PI * 2 * 0.8) / h) },
    uClothA: { value: h * 0.012 },
  };
  for (const m of mats) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uClothT, uClothA;
          uniform vec2 uClothY, uClothK;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            float hem = clamp((uClothY.y - position.y) / (uClothY.y - uClothY.x), 0.0, 1.0);
            float wv = sin(position.x * uClothK.x + uClothT * 1.6) * 0.6
              + sin(position.y * uClothK.y - uClothT * 1.15 + position.x * uClothK.x * 0.4) * 0.4;
            transformed.z += uClothA * wv * (0.25 + hem * hem);
          }`,
        );
    };
    m.customProgramCacheKey = () => "clothwave";
    m.needsUpdate = true;
  }
}

/* =================================================================== the look */

/**
 * How the scene reaches the page, shared by the page view and the phone's
 * screen so they match to the pixel: the dark room with its fine grid, and a
 * product-friendly tone curve (Khronos PBR Neutral: prints and videos keep
 * their true colours, only highlights roll off).
 */
const LOOK = /* glsl */ `
  const vec3 BG = vec3(0.020, 0.024, 0.047);
  vec3 room(vec2 P) {
    vec2 g = mod(P, 6.0);
    float line = step(g.x, 1.0) + step(g.y, 1.0);
    return BG + vec3(0.028, 0.032, 0.056) * min(line, 1.0);
  }
  vec3 neutral(vec3 c) {
    const float start = 0.76;
    const float desat = 0.15;
    float x = min(c.r, min(c.g, c.b));
    float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
    c -= off;
    float peak = max(c.r, max(c.g, c.b));
    if (peak < start) return c;
    const float d = 1.0 - start;
    float np = 1.0 - d * d / (peak + d - start);
    c *= np / peak;
    float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0);
    return mix(c, vec3(np), g);
  }
  vec3 toSrgb(vec3 c) {
    c = clamp(c, 0.0, 1.0);
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  vec3 look(vec4 s, vec2 P) {
    return mix(room(P), toSrgb(neutral(s.rgb)), clamp(s.a, 0.0, 1.0));
  }
`;

/** The page view: the scene in colour over the room. */
function colourMaterial() {
  return new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tScene: { value: null as THREE.Texture | null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
    },
    vertexShader: /* glsl */ `
      void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tScene;
      uniform vec2 uRes;
      uniform float uDpr;
      ${LOOK}
      void main() {
        vec4 s = texture2D(tScene, gl_FragCoord.xy / uRes);
        gl_FragColor = vec4(look(s, gl_FragCoord.xy / uDpr), 1.0);
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

type Made = { mesh: THREE.Object3D; face: THREE.BufferGeometry; front: number };

/** A thin printed card (poster): the print is unlit so it reads true on the phone. */
function card(map: THREE.Texture, w: number, h: number): Made {
  const d = 0.012;
  const face = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  const edge = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, roughness: 0.8 });
  const back = new THREE.MeshStandardMaterial({ color: 0xd9d9e2, roughness: 0.8 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [edge, edge, edge, edge, face, back]);
  return { mesh, face: new THREE.PlaneGeometry(w, h), front: d / 2 };
}

/** A die-cut sticker: the print with a white border and round corners, a little thicker. */
function sticker(map: THREE.Texture, w: number, h: number): Made {
  const b = Math.min(w, h) * 0.045; // the white border
  const r = Math.min(w, h) * 0.07;
  const W = w + 2 * b;
  const H = h + 2 * b;
  const g = new THREE.Group();
  const d = 0.008;
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f6, roughness: 0.55 });
  const slab = new THREE.Mesh(roundedSlab(W - 0.004, H - 0.004, d, r, 0.002), white);
  g.add(slab);
  // the print, inset in the border (unlit, like the poster)
  const face = roundedPlane(w, h, Math.max(0.001, r - b));
  const print = new THREE.Mesh(face, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  print.position.z = d / 2 + 0.003;
  g.add(print);
  // a glossy laminate over it all
  const gloss = new THREE.Mesh(
    roundedPlane(W, H, r),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      roughness: 0.15,
      clearcoat: 1,
      depthWrite: false,
    }),
  );
  gloss.position.z = d / 2 + 0.005;
  g.add(gloss);
  return { mesh: g, face, front: d / 2 + 0.004 };
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
