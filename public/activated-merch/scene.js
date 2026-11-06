/**
 * The fixed WebGL stage behind the first three sections:
 *   hero    → a 3D carousel of the activated apparel. Drag the piece to spin
 *             and pull it (it always springs back), drag beside it or use the
 *             buttons to browse. The first piece materialises from particles.
 *   details → the camera moves in on the print
 *   tech    → the camera dives to the piece's NFC tag spot, a cut-away opens,
 *             the small round tag and its patches lift out, and a phone taps it
 * main.js feeds it scroll progress and pointer input; it owns nothing in the
 * DOM except the label anchors it reports back.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SoftGarment } from "./softbody.js";
import { cottonTexture, nfcTexture, patchTexture, strokesTexture } from "./textures.js";

const BASE = "/activated-merch/";
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const seg = (v, a, b) => clamp01((v - a) / (b - a));
const wrap = (o, n) => ((((o + n / 2) % n) + n) % n) - n / 2;
const mod = (i, n) => ((i % n) + n) % n;

const TAG_D = 0.07; // a ~25 mm tag on a ~70 cm garment
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class Stage {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {{ items: {key:string, side:string, tag:object}[], reducedMotion?: boolean, onChange?: (i:number)=>void }} opts
   */
  constructor(canvasEl, { items, reducedMotion = false, onChange = () => {} }) {
    this.canvas = canvasEl;
    this.reduced = reducedMotion;
    this.onChange = onChange;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.22;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.02, 60);
    this.camera.position.set(0, 0, 4.4);
    this.lookAt = new THREE.Vector3();

    this.loader = new GLTFLoader();
    this.ring = new THREE.Group();
    this.scene.add(this.ring);
    this.slots = items.map((it, i) => {
      const group = new THREE.Group();
      group.visible = false;
      this.ring.add(group);
      return { it, i, group, g: null, loading: null, reveal: null, spot: null };
    });
    this.n = items.length;
    this.pos = 0; // continuous carousel position
    this.posVel = 0;
    this.target = 0;
    this.active = 0;
    this.drag = null;
    this.spin = 0;
    this.spinVel = 0;
    this.spinTarget = 0;
    this.wind = 0;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.state = { hero: 0, tech: 0 };
    this.clock = new THREE.Clock();
    this.t = 0;
    this.raycaster = new THREE.Raycaster();
    this.introDone = this.reduced;
    this.lensWorld = new THREE.Vector3();

    this._lights();
    this._backdrop();
    this._stack();
    this._phone();
    this.resize();
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xdfe4ff, 0x10111a, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(1.5, 2.5, 3);
    s.add(key);
    const back = new THREE.DirectionalLight(0xffffff, 0.7);
    back.position.set(-1, 1.5, -3);
    s.add(back);
    const rimBlue = new THREE.PointLight(0x3d6bff, 7, 9, 1.4);
    rimBlue.position.set(-2.4, 0.9, -1.2);
    s.add(rimBlue);
    const rimPink = (this.rimPink = new THREE.PointLight(0xff3d9a, 5, 9, 1.4));
    rimPink.position.set(2.4, -0.6, -1.0);
    s.add(rimPink);
    const front = new THREE.PointLight(0xffffff, 1.4, 7, 1.5);
    front.position.set(0, 0.3, 2.6);
    s.add(front);
  }

  _backdrop() {
    const mat = new THREE.MeshBasicMaterial({ map: strokesTexture(), transparent: true, depthWrite: false, opacity: 0.5 });
    this.strokes = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), mat);
    this.strokes.position.set(0, -0.1, -1.8);
    this.scene.add(this.strokes);
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 7;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3 - 0.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.dust);
  }

  /* --------------------------------------------------------- loading */
  /** Load a slot's garment (once). Resolves to the slot. */
  ensure(i) {
    const slot = this.slots[mod(i, this.n)];
    if (slot.loading) return slot.loading;
    slot.loading = this.loader
      .loadAsync(`${BASE}models/hero/${slot.it.key}.glb`)
      .then((gltf) => {
        const g = new SoftGarment(gltf.scene, { nodes: this.mobile ? 150 : 230 });
        if (g.material.map) g.material.map.anisotropy = 8;
        slot.g = g;
        // Show the print: back prints turn the piece around.
        g.base = slot.it.side === "back" ? Math.PI : 0;
        g.group.rotation.y = g.base;
        slot.group.add(g.group);
        slot.spot = g.surfaceSpot(slot.it.tag);
        // Everything starts as a hologram; the piece at the front materialises.
        g.uniforms.uHolo.value = 1;
        g.uniforms.uFade.value = 0;
        if (this.introDone && slot === this.current) this._scan(slot, "holo", 1.1);
        return slot;
      })
      .catch((err) => {
        console.warn("[activated] could not load", slot.it.key, err);
        slot.loading = null;
        throw err;
      });
    return slot.loading;
  }

  /** Load the first piece and play the intro. */
  async start(i = 0) {
    this.pos = this.target = this.active = i;
    const slot = await this.ensure(i);
    // The first piece arrives solid through the particle intro.
    slot.g.uniforms.uHolo.value = 0;
    if (this.reduced) slot.g.uniforms.uFade.value = 1;
    else this._intro(slot);
    // The rest load one at a time, nearest first, never while you are dragging,
    // so the page stays responsive on phones.
    const order = [1, -1, 2, -2, 3, -3].map((d) => i + d);
    const next = () => {
      if (!order.length) return;
      if (this.drag) return setTimeout(next, 300);
      this.ensure(order.shift())
        .catch(() => {})
        .then(() => setTimeout(next, 250));
    };
    setTimeout(next, this.reduced ? 0 : 1600);
    return slot;
  }

  /* ---------------------------------------------------- materialise */
  _intro(slot) {
    const g = slot.g;
    const count = this.mobile ? 6000 : 12000;
    const { P, C } = g.samplePoints(count);
    const start = new Float32Array(count * 3);
    const delay = new Float32Array(count);
    const rnd = new Float32Array(count);
    const bb = g.bounds;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 2.2;
      start[i * 3] = Math.cos(a) * r;
      start[i * 3 + 1] = (Math.random() - 0.5) * 3.2 + Math.sin(a) * 0.4;
      start[i * 3 + 2] = Math.sin(a) * r * 0.7;
      const yT = (bb.max.y - P[i * 3 + 1]) / (bb.max.y - bb.min.y);
      delay[i] = yT * 0.45 + Math.random() * 0.35;
      rnd[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(P, 3));
    geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(C, 3));
    geo.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
    geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uT: { value: 0 },
        uRevealY: { value: 99 },
        uSize: { value: this.mobile ? 12 : 14 },
        uPR: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aStart; attribute vec3 aColor; attribute float aDelay; attribute float aRnd;
        uniform float uT, uRevealY, uSize, uPR;
        varying vec3 vColor; varying float vA;
        void main() {
          float k = clamp((uT - aDelay) / 1.15, 0.0, 1.0);
          float e = 1.0 - pow(1.0 - k, 3.0);
          vec3 p = mix(aStart, position, e);
          float ang = (1.0 - e) * (2.6 + aRnd * 1.5);
          float c = cos(ang), s = sin(ang);
          p.xz = mat2(c, -s, s, c) * p.xz;
          p.y += (1.0 - e) * sin(uT * 3.0 + aRnd * 20.0) * 0.08;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          float shown = 1.0 - smoothstep(-0.04, 0.03, wp.y - uRevealY);
          vA = smoothstep(0.0, 0.2, k) * shown * (0.55 + 0.45 * aRnd);
          vColor = mix(vec3(0.5, 0.75, 1.0), aColor, e);
          gl_PointSize = min(9.0 * uPR, uSize * uPR * (0.5 + aRnd * 0.8) * (1.0 + (1.0 - e) * 0.6) / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          gl_FragColor = vec4(vColor * vA * smoothstep(0.25, 0.0, r) * 1.2, 1.0);
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    g.pivot.add(pts);
    g.uniforms.uHide.value = 1;
    g.uniforms.uRevealY.value = 99;
    g.uniforms.uDim.value = 1;
    g.uniforms.uFade.value = 1;
    this.intro = { slot, pts, t0: this.t, dur: 2.9, shoved: false };
  }

  _runIntro() {
    const I = this.intro;
    if (!I) return;
    // Scrolled on before it finished: complete it at once.
    if (this.state.hero > 0.3) I.t0 = Math.min(I.t0, this.t - I.dur - 0.01);
    const e = this.t - I.t0;
    const { g, group } = I.slot;
    I.pts.material.uniforms.uT.value = e;
    const wy = group.getWorldPosition(_v).y;
    const top = wy + g.bounds.max.y + 0.06;
    const bot = wy + g.bounds.min.y - 0.06;
    const k = seg(e, 1.15, 2.45);
    const y = k <= 0 ? 99 : lerp(top, bot, easeOut(k));
    g.uniforms.uRevealY.value = y;
    g.uniforms.uScan.value = k > 0 && k < 1 ? 1 : 0;
    I.pts.material.uniforms.uRevealY.value = y;
    if (k >= 1 && !I.shoved) {
      I.shoved = true;
      g.uniforms.uHide.value = 0;
      g.uniforms.uRevealY.value = -99;
      g.shove(0, 1.4);
    }
    if (e > I.dur) {
      I.pts.removeFromParent();
      I.pts.geometry.dispose();
      I.pts.material.dispose();
      this.intro = null;
      this.introDone = true;
      // Neighbours fade in as holograms on their own (see frame()).
    }
  }

  /** A scan line sweeps the piece. mode: "hide" appears as the line passes, "holo" turns hologram → solid. */
  _scan(slot, mode, dur = 0.85) {
    const u = slot.g.uniforms;
    if (this.reduced) {
      u.uHolo.value = mode === "holo" ? 0 : u.uHolo.value;
      return;
    }
    slot.reveal = { t0: this.t, dur, mode };
    u.uHide.value = mode === "hide" ? 1 : 0;
    u.uHoloScan.value = mode === "holo" ? 1 : 0;
    u.uRevealY.value = 99;
  }

  _runScan(slot) {
    const R = slot.reveal;
    if (!R || !slot.g) return;
    const u = slot.g.uniforms;
    const k = seg(this.t - R.t0, 0, R.dur);
    const wy = slot.group.getWorldPosition(_v).y;
    u.uRevealY.value = lerp(wy + slot.g.bounds.max.y + 0.05, wy + slot.g.bounds.min.y - 0.05, easeOut(k));
    u.uScan.value = 1 - k * 0.4;
    if (k >= 1) {
      u.uHide.value = 0;
      u.uScan.value = 0;
      u.uRevealY.value = -99;
      if (R.mode === "holo") {
        u.uHoloScan.value = 0;
        u.uHolo.value = 0;
      }
      slot.reveal = null;
    }
  }

  /* ---------------------------------------------------- tech props */
  _stack() {
    // The tag and the two patches that hold it, at real proportions.
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);
    const disc = (r, map, opts = {}) => {
      const geo = new THREE.CylinderGeometry(r, r, opts.h ?? 0.003, 64, 1);
      geo.rotateX(Math.PI / 2); // caps face ±Z
      const cap = new THREE.MeshPhysicalMaterial({
        map,
        roughness: opts.roughness ?? 0.85,
        metalness: 0,
        sheen: opts.sheen ?? 0.4,
        sheenColor: new THREE.Color(0x3c4680),
        clearcoat: opts.clearcoat ?? 0,
        emissive: opts.emissive ?? 0x000000,
        emissiveMap: opts.emissiveMap ?? null,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
        color: opts.color ?? 0xffffff,
      });
      const side = new THREE.MeshStandardMaterial({ color: opts.edge ?? 0x1a1c28, roughness: 0.8 });
      const m = new THREE.Mesh(geo, [side, cap, cap]);
      group.add(m);
      return m;
    };
    const R = TAG_D / 2;
    this.patchOuter = disc(R * 1.55, cottonTexture("#2a3150"), { h: 0.004 });
    const nfc = nfcTexture();
    this.tag = disc(R, nfc, { h: 0.0015, roughness: 0.3, clearcoat: 1, sheen: 0, emissive: 0xffffff, emissiveMap: nfc, emissiveIntensity: 0.4, edge: 0x2a3550 });
    this.patchInner = disc(R * 1.4, patchTexture(), { h: 0.003 });
    this.stack = group;
    this.stackParts = [this.patchOuter, this.tag, this.patchInner];
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R * 0.96, R * 1.06, 64),
        new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      group.add(ring);
      this.rings.push(ring);
    }
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: radialTexture(), color: 0x5fb0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow.scale.setScalar(TAG_D * 3);
    group.add(this.glow);
  }

  _phone() {
    const phone = new THREE.Group();
    const body = new THREE.Mesh(
      roundedSlab(0.42, 0.86, 0.04, 0.06),
      new THREE.MeshPhysicalMaterial({ color: 0x0b0c12, metalness: 0.6, roughness: 0.25, clearcoat: 1 }),
    );
    phone.add(body);
    const video = document.createElement("video");
    video.src = BASE + "media/fan-05.mp4";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    video.crossOrigin = "anonymous";
    this.phoneVideo = video;
    const vt = new THREE.VideoTexture(video);
    vt.colorSpace = THREE.SRGBColorSpace;
    const poster = new THREE.TextureLoader().load(BASE + "media/fan-05.webp");
    poster.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.82), new THREE.MeshBasicMaterial({ map: poster, color: 0x222222, toneMapped: false }));
    video.addEventListener("playing", () => {
      screen.material.map = vt;
      screen.material.needsUpdate = true;
    });
    screen.position.z = 0.032;
    phone.add(screen);
    this.phoneScreen = screen;
    phone.visible = false;
    this.phone = phone;
    this.scene.add(phone);
  }

  /* ----------------------------------------------------------- input */
  get current() {
    return this.slots[mod(this.active, this.n)];
  }

  setPointer(x, y) {
    this.pointerTarget.set(x, y);
  }

  /**
   * Pointer down at NDC. Returns 'grab' when it lands on the centre piece,
   * 'browse' when it should move the carousel, or null.
   */
  pointerDown(ndc, { canBrowse = true } = {}) {
    if (this.state.tech > 0.02) return null;
    const g = this.current.g;
    if (g && !(this.intro && !this.intro.shoved)) {
      this.camera.updateMatrixWorld();
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = this.raycaster.intersectObject(g.pick, false)[0];
      if (hit) {
        g.grab(g.pick.worldToLocal(hit.point.clone()));
        this.drag = { mode: "grab", depth: hit.point.clone().project(this.camera).z, spin0: this.spin, x0: ndc.x };
        return "grab";
      }
    }
    if (!canBrowse || this.state.hero > 0.2) return null;
    this.drag = { mode: "browse", pos0: this.pos, x0: ndc.x, lastX: ndc.x, lastT: performance.now(), vx: 0 };
    return "browse";
  }

  pointerMove(ndc) {
    const d = this.drag;
    if (!d) return;
    if (d.mode === "grab") {
      const g = this.current.g;
      if (!g) return;
      // Sideways drag spins the piece; the grabbed spot also follows the finger.
      this.spinTarget = d.spin0 + (ndc.x - d.x0) * (this.mobile ? 2.6 : 3.4);
      const w = new THREE.Vector3(ndc.x, ndc.y, d.depth).unproject(this.camera);
      g.pull(g.pick.worldToLocal(w));
    } else {
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      d.vx = lerp(d.vx, ((ndc.x - d.lastX) / dt) * 1000, 0.5);
      d.lastX = ndc.x;
      d.lastT = now;
      this.pos = d.pos0 - (ndc.x - d.x0) * (this.mobile ? 1.15 : 1.6);
      this.posVel = 0;
    }
  }

  pointerUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === "grab") {
      this.current.g?.release();
      this.spinTarget = 0; // always come home
    } else {
      const base = Math.round(d.pos0);
      let t = Math.round(this.pos - d.vx * 0.22);
      t = Math.max(base - 2, Math.min(base + 2, t));
      this.target = t;
    }
  }

  /** Drop any interaction so everything springs back (e.g. scrolling away). */
  settle() {
    if (this.drag) this.pointerUp();
  }

  go(delta) {
    this.target = Math.round(this.target) + delta;
  }

  goTo(i) {
    const cur = Math.round(this.target);
    this.target = cur + Math.round(wrap(i - mod(cur, this.n), this.n));
  }

  breeze(amount) {
    this.wind = Math.min(10, this.wind + amount);
  }

  /* ----------------------------------------------------------- frame */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.mobile = w < 760;
    this.camera.fov = this.mobile ? 44 : 32;
    this.camera.updateProjectionMatrix();
  }

  update(state) {
    Object.assign(this.state, state);
  }

  /** Screen anchors (px) for the DOM labels: outer patch, tag, inner patch, lens. */
  anchors() {
    const out = [];
    const v = new THREE.Vector3();
    const proj = () => {
      v.project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
    };
    // Points on each disc that stay visible once the layers fan out.
    const at = [[-0.55, 0.55], [0.85, 0], [0.8, -0.45]];
    for (const [k, m] of this.stackParts.entries()) {
      const r = m.geometry.parameters.radiusTop;
      v.set(r * at[k][0], r * at[k][1], 0.002);
      m.localToWorld(v);
      out.push(proj());
    }
    v.copy(this.lensWorld);
    out.push(proj());
    return out;
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.t += dt;
    const t = this.t;
    const { hero, tech } = this.state;
    const m = this.mobile;
    this.pointer.lerp(this.pointerTarget, 0.06);

    // --- carousel spring ---------------------------------------------------
    if (this.drag?.mode !== "browse") {
      const k = 55;
      this.posVel += (k * (this.target - this.pos) - 2 * Math.sqrt(k) * 0.92 * this.posVel) * dt;
      this.pos += this.posVel * dt;
    }
    const nearest = Math.round(this.pos);
    if (nearest !== this.active) {
      this.current.g?.release();
      if (this.drag?.mode === "grab") this.drag = null;
      this.active = nearest;
      this.spin = this.spinTarget = this.spinVel = 0;
      const slot = this.current;
      const dir = Math.sign(this.target - this.pos) || 1;
      this.ensure(nearest)
        .then(() => {
          if (this.current === slot && this.introDone) {
            if (!slot.reveal) this._scan(slot, "holo", 1.0);
            slot.g.shove(dir * -0.9, 1.2);
          }
        })
        .catch(() => {});
      this.ensure(nearest + 1).catch(() => {});
      this.ensure(nearest - 1).catch(() => {});
      this.onChange(mod(nearest, this.n));
    }

    // --- spin spring: snaps home after release ------------------------------
    const grabbing = this.drag?.mode === "grab";
    const ks = grabbing ? 260 : 38;
    const zs = grabbing ? 1 : 0.5;
    this.spinVel += (ks * (this.spinTarget - this.spin) - 2 * Math.sqrt(ks) * zs * this.spinVel) * dt;
    this.spin += this.spinVel * dt;
    this.wind *= Math.exp(-dt * 1.6);

    // --- choreography --------------------------------------------------------
    const h = ease(hero);
    const dive = ease(seg(tech, 0.02, 0.24));
    const lens = seg(tech, 0.1, 0.24);
    const explode = ease(seg(tech, 0.26, 0.52));
    const tap = ease(seg(tech, 0.58, 0.76));
    const after = seg(tech, 0.78, 1);

    // The front piece in the middle; the others stand back and off to the sides.
    const side = m ? 1.18 : 1.75;
    const gap = m ? 0.7 : 1.0;
    const spread = 1 + h * 1.6;
    this.ring.position.set(m ? 0 : lerp(0.32, 0.1, h), lerp(m ? 0.42 : 0.02, m ? 0.12 : -0.02, h), 0);
    const cur = this.current;
    for (const s of this.slots) {
      const o = wrap(s.i - this.pos, this.n);
      const ao = Math.abs(o);
      const near = Math.min(ao, 1);
      const x = Math.sign(o) * (near * side + Math.max(0, ao - 1) * gap) * spread;
      s.group.position.set(x, near * 0.08, -near * (m ? 1.5 : 1.7) - Math.max(0, ao - 1) * 1.1);
      s.group.rotation.y = -Math.sign(o) * near * 0.38;
      const isActive = s === cur;
      const fade = clamp01(1 - (ao - 0.5) * 0.45) * (1 - seg(hero, 0.05, 0.4));
      const maxO = m ? 1.6 : 2.6;
      s.group.visible = !!s.g && (isActive || (ao < maxO && fade > 0.02 && tech < 0.01 && s.g.uniforms.uFade.value > 0.02));
      if (!s.g) continue;
      const g = s.g;
      g.uniforms.uTime.value = t;
      if (!(this.intro && this.intro.slot === s)) {
        // Side pieces are holographic silhouettes in a pixel-dither fade.
        const k = 1 - Math.exp(-dt * 6);
        const vis = isActive ? 1 : this.introDone ? lerp(0.85, 0.45, clamp01(ao - 1)) * fade : 0;
        g.uniforms.uDim.value = lerp(g.uniforms.uDim.value, 1, k);
        g.uniforms.uFade.value = lerp(g.uniforms.uFade.value, vis, k);
        if (s.reveal?.mode !== "holo") g.uniforms.uHolo.value = lerp(g.uniforms.uHolo.value, isActive ? 0 : 1, 1 - Math.exp(-dt * 5));
      }
      const idle = this.reduced ? 0 : Math.sin(t * 0.45 + s.i) * 0.16;
      g.pivot.rotation.y = isActive ? this.spin + idle * (1 - h) : idle * 0.5;
      g.group.rotation.y = g.base + (isActive ? lerp(0, -0.42, h) : 0);
      g.omega = isActive ? THREE.MathUtils.clamp(this.spinVel, -7, 7) * 0.5 : 0;
      g.wind = isActive && !this.reduced ? 0.35 + this.wind : 0;
      if (!isActive && g.grabbing) g.release();
      if (isActive || !g.settled) g.step(dt, t);
      this._runScan(s);
    }
    this._runIntro();

    this.strokes.material.opacity = 0.5 * (1 - h * 0.6) * (1 - dive);
    this.strokes.position.x = this.pointer.x * -0.08;
    this.strokes.rotation.z = Math.sin(t * 0.1) * 0.02;
    this.dust.rotation.y = t * 0.02;
    this.dust.position.y = -tech * 0.6;

    // Camera: hero → details.
    const camZ = lerp(m ? 5.7 : 4.4, m ? 4.0 : 3.15, h);
    this.camera.position.set(lerp(0, m ? 0 : 0.1, h) + this.pointer.x * 0.12, lerp(0, m ? 0.05 : 0.08, h) + this.pointer.y * 0.08, camZ);
    this.lookAt.set(lerp(0, m ? 0 : 0.12, h), lerp(0, 0.04, h), 0);

    // --- tech: dive to the tag -----------------------------------------------
    const g = cur.g;
    const inTech = tech > 0.001 && g && cur.spot;
    this.stack.visible = !!inTech && lens > 0;
    if (inTech) {
      // Turn the tag side to the camera, at a 3/4 angle.
      const tagYaw = (cur.it.tag.side === "back" ? Math.PI : 0) + (m ? 0.3 : 0.45);
      g.group.rotation.y = lerp(g.group.rotation.y, tagYaw, dive);
      g.pivot.rotation.y *= 1 - dive;
      g.group.updateMatrixWorld(true);
      const sp = g.pick.localToWorld(cur.spot.p.clone());
      const sn = cur.spot.n.clone().transformDirection(g.pick.matrixWorld);
      this.lensWorld.copy(sp);
      g.uniforms.uLensPos.value.copy(sp);
      g.uniforms.uLensR.value = TAG_D * 0.95;
      g.uniforms.uLens.value = lens;
      g.uniforms.uDim.value = lerp(1, 0.72, dive) * lerp(1, 0.6, explode);
      // Oblique to the surface so the lifted layers separate on screen.
      const right = new THREE.Vector3().crossVectors(UP, sn).normalize();
      const dist = m ? 1.2 : 1.05;
      const view = sn.clone().multiplyScalar(0.82).addScaledVector(right, m ? 0.25 : 0.42).addScaledVector(UP, 0.38).normalize();
      const camT = sp.clone().addScaledVector(view, dist);
      const lookT = sp
        .clone()
        .addScaledVector(sn, 0.07 + explode * 0.06)
        .addScaledVector(right, m ? 0 : -0.14)
        .addScaledVector(UP, m ? -0.08 : 0);
      this.camera.position.lerp(camT, dive);
      this.lookAt.lerp(lookT, dive);
      // The stack sits in the cut-away, then lifts out along the normal.
      const st = this.stack;
      st.position.copy(sp);
      // Basis: x = screen-right along the surface, z = out of the fabric.
      const up2 = new THREE.Vector3().crossVectors(sn, right).normalize();
      st.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up2, sn));
      this.rimPink.intensity = 5 * (1 - dive * 0.8);
      st.scale.setScalar(lerp(1, m ? 1.45 : 1.55, explode));
      this.patchOuter.position.set(-0.055 * explode, 0.02 * explode, lerp(-0.004, 0.1, explode));
      this.tag.position.z = lerp(-0.014, 0.058, explode);
      this.patchInner.position.set(0.03 * explode, -0.01 * explode, lerp(-0.022, 0.02, explode));
      this.patchOuter.visible = this.patchInner.visible = explode > 0.02;
      this.patchOuter.rotation.z = (1 - explode) * 0.6;
      this.glow.position.z = this.tag.position.z - 0.003;
      this.glow.material.opacity = lens * (0.5 + tap * 0.4 + Math.sin(t * 4) * 0.08);
      this.tag.material[1].emissiveIntensity = 0.35 + lens * 0.3 + tap * (0.6 + Math.sin(t * 8) * 0.3);
      this.rings.forEach((r, i) => {
        const k = ((t * 0.9 + i / 3) % 1) * (tap > 0.85 ? 1 : 0);
        r.position.z = this.tag.position.z + 0.002;
        r.scale.setScalar(1 + k * 3.2);
        r.material.opacity = (1 - k) * 0.85 * tap * (1 - after * 0.4);
      });
      this.phoneFrame = { sn, right };
    } else {
      if (g) g.uniforms.uLens.value = 0;
      this.rimPink.intensity = 5;
    }
    this.camera.lookAt(this.lookAt);

    // --- phone tap -------------------------------------------------------------
    const ph = this.phone;
    ph.visible = !!inTech && tap > 0.001;
    if (ph.visible) {
      const { sn, right } = this.phoneFrame;
      const tagW = this.tag.getWorldPosition(new THREE.Vector3());
      const hover = tagW
        .clone()
        .addScaledVector(sn, 0.09 + Math.sin(t * 2) * 0.005)
        .addScaledVector(UP, m ? 0.07 : 0.08)
        .addScaledVector(right, m ? 0.03 : 0.1);
      const from = hover.clone().addScaledVector(right, 0.9).addScaledVector(UP, 0.6).addScaledVector(sn, 0.3);
      ph.position.lerpVectors(from, hover, tap);
      ph.quaternion.setFromUnitVectors(Z, sn);
      ph.rotateX(-0.9);
      ph.rotateY(0.25 + (1 - tap) * 0.5);
      ph.scale.setScalar(m ? 0.2 : 0.22);
      const lit = seg(tech, 0.7, 0.8);
      this.phoneScreen.material.color.setScalar(lerp(0.13, 1, lit));
      if (lit > 0 && this.phoneVideo.paused) this.phoneVideo.play().catch(() => {});
      if (lit === 0 && !this.phoneVideo.paused) this.phoneVideo.pause();
    } else if (!this.phoneVideo.paused) this.phoneVideo.pause();

    this.renderer.render(this.scene, this.camera);
  }
}

const _v = new THREE.Vector3();

function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundedSlab(w, h, d, r) {
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
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -d / 2);
  return g;
}
