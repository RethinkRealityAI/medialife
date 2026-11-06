/**
 * The fixed WebGL stage behind the first three sections:
 *   hero    → the activated garment, hanging with real cloth physics
 *   details → the camera moves in on the print
 *   tech    → the garment lifts away, the fabric layers explode apart, and a
 *             phone taps the NFC inlay; its screen plays a real fan capture
 * main.js feeds it scroll progress; it owns nothing in the DOM except the
 * label anchors it reports back.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Garment } from "./cloth.js";
import {
  knitNormal,
  cottonTexture,
  nfcTexture,
  labelTexture,
  roundedImage,
  strokesTexture,
} from "./textures.js";

const BASE = "/activated-merch/";
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (v, a, b) => clamp01((v - a) / (b - a));

export class Stage {
  constructor(canvasEl, { reducedMotion = false } = {}) {
    this.canvas = canvasEl;
    this.reduced = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.25;

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    this.camera.position.set(0, 0, 4);
    this.lookAt = new THREE.Vector3();

    this._lights();
    this.loader = new THREE.TextureLoader();
    this.normal = knitNormal();
    this.garments = new Map();
    this.current = null;
    this.pointer = new THREE.Vector2();
    this.pointerTarget = new THREE.Vector2();
    this.spin = 0; // user rotation of the hanger
    this.spinVel = 0;
    this.state = { hero: 0, tech: 0 };
    this.clock = new THREE.Clock();
    this.anchors = [];
    this.visible = true;

    this._backdrop();
    this._layers();
    this._phone();
    this.resize();
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xdfe4ff, 0x10111a, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 2.5, 3);
    s.add(key);
    const rimBlue = new THREE.PointLight(0x3d6bff, 5, 8, 1.6);
    rimBlue.position.set(-2.2, 0.8, -1.2);
    s.add(rimBlue);
    const rimPink = new THREE.PointLight(0xff3d9a, 4, 8, 1.6);
    rimPink.position.set(2.2, -0.6, -1.0);
    s.add(rimPink);
    this.front = new THREE.PointLight(0xffffff, 1.6, 6, 1.5);
    this.front.position.set(0, 0.3, 2.2);
    s.add(this.front);
  }

  _backdrop() {
    const mat = new THREE.MeshBasicMaterial({ map: strokesTexture(), transparent: true, depthWrite: false, opacity: 0.5 });
    this.strokes = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), mat);
    this.strokes.position.set(0, -0.1, -1.4);
    this.scene.add(this.strokes);
    // Dust motes.
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 3 - 0.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false }));
    this.scene.add(this.dust);
  }

  /* ---------------------------------------------------------------- garment */
  async load(spec) {
    if (this.garments.has(spec.key)) return this.garments.get(spec.key);
    const tex = (url) =>
      this.loader.loadAsync(BASE + url).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        return t;
      });
    const [back, front] = await Promise.all([tex(spec.back), tex(spec.front)]);
    const garment = new Garment(spec, { back, front, normal: this.normal }, { width: 1.7, iterations: window.innerWidth < 760 ? 6 : 10 });
    garment.warm(this.reduced ? 1.5 : 2.5);
    garment.backTex = back;
    this.garments.set(spec.key, garment);
    return garment;
  }

  async show(spec) {
    const g = await this.load(spec);
    if (this.current === g) return g;
    const old = this.current;
    this.current = g;
    this.holder ??= (() => {
      const h = new THREE.Group();
      this.scene.add(h);
      return h;
    })();
    if (old) this.holder.remove(old.group);
    this.holder.add(g.group);
    // A drop-in: the new piece starts lifted and swings into place.
    g.gust.set((Math.random() - 0.5) * 3, 0, 2.5);
    this.dropIn = 1;
    if (!this.printTex) this._setPrint(g.backTex);
    return g;
  }

  /* ----------------------------------------------------------------- layers */
  _layers() {
    const group = new THREE.Group();
    group.visible = false;
    this.scene.add(group);
    this.layerGroup = group;
    const mk = (map, opts = {}) => {
      const geo = new THREE.PlaneGeometry(1.1, 1.1, 40, 40);
      geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position;
      const phase = Math.random() * 6;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        p.setY(i, Math.sin(x * 3.2 + phase) * 0.025 + Math.cos(z * 2.6 + phase) * 0.02);
      }
      geo.computeVertexNormals();
      const mat = new THREE.MeshPhysicalMaterial({
        map,
        transparent: true,
        alphaTest: 0.02,
        roughness: opts.roughness ?? 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
        sheen: opts.sheen ?? 0.3,
        sheenColor: new THREE.Color(0x3c4680),
        transmission: opts.transmission ?? 0,
        emissive: opts.emissive ?? 0x000000,
        emissiveMap: opts.emissiveMap ?? null,
        emissiveIntensity: opts.emissiveIntensity ?? 0,
        normalMap: opts.normal ? this.normal : null,
        normalScale: new THREE.Vector2(0.6, 0.6),
        clearcoat: opts.clearcoat ?? 0,
      });
      const m = new THREE.Mesh(geo, mat);
      group.add(m);
      return m;
    };
    // Order top → bottom (outside of the garment → inside).
    this.layerPrint = mk(null, { roughness: 0.6, clearcoat: 0.35 });
    this.layerCotton = mk(cottonTexture(), { normal: true });
    const nfc = nfcTexture();
    this.layerNfc = mk(nfc, { roughness: 0.25, clearcoat: 1, emissive: 0xffffff, emissiveMap: nfc, emissiveIntensity: 0.35, sheen: 0 });
    this.layerLabel = mk(labelTexture(), { normal: true });
    this.layers = [this.layerPrint, this.layerCotton, this.layerNfc, this.layerLabel];
    // Label anchors: the near-right corner of each sheet.
    this.layerAnchor = new THREE.Vector3(0.56, 0, -0.05);

    // NFC field rings (shown during the tap).
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.1, 0.112, 64),
        new THREE.MeshBasicMaterial({ color: 0x7fd0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      this.rings.push(ring);
    }
  }

  _setPrint(img) {
    // Crop the artwork panel out of the garment's back photo.
    const image = img.image;
    this.printTex = roundedImage(image, { x: 0.27, y: 0.28, w: 0.46, h: 0.46 });
    this.layerPrint.material.map = this.printTex;
    this.layerPrint.material.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ phone */
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
    // Until the video is actually playing, show its poster frame.
    const poster = this.loader.load(BASE + "media/fan-05.webp");
    poster.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.38, 0.82),
      new THREE.MeshBasicMaterial({ map: poster, color: 0x222222, toneMapped: false }),
    );
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

  /* ----------------------------------------------------------------- input */
  setPointer(x, y) {
    this.pointerTarget.set(x, y);
  }

  /** Start dragging the cloth at a screen point (NDC). Returns true if hit. */
  grabAt(ndc) {
    const g = this.current;
    if (!g || this.state.tech > 0.05) return false;
    const k = g.pick(ndc, this.camera);
    if (k < 0) return false;
    g.grab = { k, target: new THREE.Vector3(), depth: 0 };
    const v = new THREE.Vector3(g.p[k * 3], g.p[k * 3 + 1], g.p[k * 3 + 2]);
    g.group.localToWorld(v);
    g.grab.depth = v.project(this.camera).z;
    this.dragTo(ndc);
    return true;
  }

  dragTo(ndc) {
    const g = this.current;
    if (!g?.grab) return;
    const v = new THREE.Vector3(ndc.x, ndc.y, g.grab.depth).unproject(this.camera);
    g.group.worldToLocal(v);
    g.grab.target.copy(v);
  }

  release() {
    if (this.current) this.current.grab = null;
  }

  /** Spin the hanger (inertial), e.g. from a horizontal drag. */
  nudge(dx) {
    this.spinVel += dx;
  }

  poke(strength = 1) {
    this.current?.gust.add(new THREE.Vector3((Math.random() - 0.5) * 2 * strength, 0, 2.2 * strength));
  }

  /* ---------------------------------------------------------------- frame */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.mobile = w < 760;
    this.camera.fov = this.mobile ? 42 : 32;
    this.camera.updateProjectionMatrix();
  }

  update(state) {
    Object.assign(this.state, state);
  }

  /** Screen positions (px) of the four layer anchors, for the DOM labels. */
  layerAnchors() {
    const out = [];
    const v = new THREE.Vector3();
    for (const m of this.layers) {
      v.copy(this.layerAnchor);
      m.localToWorld(v);
      v.project(this.camera);
      out.push({ x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight });
    }
    return out;
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    const { hero, tech } = this.state;
    const m = this.mobile;

    this.pointer.lerp(this.pointerTarget, 0.06);

    // Hanger: idle sway + user spin with inertia, settles back to facing us.
    this.spinVel *= 0.92;
    this.spin += this.spinVel * dt;
    this.spin *= 0.985;
    const g = this.current;
    if (g) {
      const idle = this.reduced ? 0 : Math.sin(t * 0.35) * 0.35;
      g.rig.rotation.y = idle + this.spin + this.pointer.x * 0.25 + lerp(0, -0.5, ease(hero));
      g.rig.position.y = 0;
      if (!this.reduced || hero < 0.01) g.step(dt, { calm: this.reduced });
      if (this.dropIn > 0) this.dropIn = Math.max(0, this.dropIn - dt * 1.5);
    }

    // --- choreography -------------------------------------------------
    const h = ease(hero);
    const lift = ease(seg(tech, 0, 0.14)); // garment leaves
    const rise = ease(seg(tech, 0.08, 0.26)); // layers arrive
    const explode = ease(seg(tech, 0.22, 0.55));
    const tap = ease(seg(tech, 0.6, 0.78));
    const after = seg(tech, 0.78, 1);

    if (this.holder) {
      const gx = m ? 0 : lerp(0.16, -0.15, h);
      const gy = lerp(m ? 0.18 : 0.02, m ? 0.1 : -0.02, h) + lift * 3.4 + this.dropIn * 0.3;
      this.holder.position.set(gx, gy, -lift * 0.8);
      this.holder.visible = lift < 0.999;
    }
    this.strokes.material.opacity = 0.5 * (1 - h * 0.6) * (1 - lift);
    this.strokes.position.x = this.pointer.x * -0.08;
    this.strokes.rotation.z = Math.sin(t * 0.1) * 0.02;
    this.dust.rotation.y = t * 0.02;
    this.dust.position.y = -tech * 0.6;

    // Camera
    const camZ = lerp(m ? 4.6 : 4.1, m ? 3.6 : 3.05, h);
    const camX = lerp(0, m ? 0 : 0.1, h);
    const camY = lerp(0, m ? 0.05 : 0.08, h);
    this.camera.position.set(camX + this.pointer.x * 0.12, camY + this.pointer.y * 0.08, camZ);
    this.lookAt.set(lerp(0, m ? 0 : 0.12, h), lerp(0, 0.04, h), 0);
    // During tech, look at the layer stack instead.
    const lg = this.layerGroup;
    lg.visible = rise > 0.001;
    if (lg.visible) {
      const sx = m ? 0 : 0.42;
      lg.position.set(sx, lerp(-2.2, m ? 0.12 : 0, rise), 0);
      lg.rotation.set(0.62 - tap * 0.1, -0.62 + Math.sin(t * 0.3) * 0.05 + this.pointer.x * 0.15, 0.06);
      const sep = lerp(0.03, m ? 0.22 : 0.26, explode);
      this.layers.forEach((L, i) => {
        L.position.y = (1.5 - i) * sep;
      });
      const scale = m ? 0.82 : 1;
      lg.scale.setScalar(scale);
      // NFC glow pulses once it is revealed.
      this.layerNfc.material.emissiveIntensity = 0.25 + explode * 0.4 + tap * (0.6 + Math.sin(t * 8) * 0.3);
      const blend = rise;
      this.camera.position.lerp(new THREE.Vector3(m ? 0 : 0.15, 0.35, m ? 4.2 : 3.6), blend);
      this.lookAt.lerp(new THREE.Vector3(m ? 0 : 0.2, m ? -0.05 : 0, 0), blend);
    }
    this.camera.lookAt(this.lookAt);

    // Phone tap.
    const ph = this.phone;
    ph.visible = tap > 0.001;
    if (ph.visible) {
      const topWorld = new THREE.Vector3(0.18, 0, 0.12);
      this.layerPrint.localToWorld(topWorld);
      const hover = topWorld.add(new THREE.Vector3(m ? 0.1 : 0.12, (m ? 0.3 : 0.24) + Math.sin(t * 2) * 0.012, 0.45));
      const start = new THREE.Vector3(m ? 1.6 : 2.4, 1.6, 1.2);
      ph.position.lerpVectors(start, hover, tap);
      ph.rotation.set(-0.55, -0.45 + (1 - tap) * 0.6, 0.18);
      ph.scale.setScalar(m ? 0.6 : 0.7);
      const lit = seg(tech, 0.7, 0.8);
      this.phoneScreen.material.color.setScalar(lerp(0.13, 1, lit));
      if (lit > 0 && this.phoneVideo.paused) this.phoneVideo.play().catch(() => {});
      if (lit === 0 && !this.phoneVideo.paused) this.phoneVideo.pause();
      this.rings.forEach((r, i) => {
        const k = ((t * 0.9 + i / 3) % 1) * (tap > 0.85 ? 1 : 0);
        r.position.set(0, this.layerNfc.position.y + 0.02, 0);
        r.scale.setScalar(0.4 + k * 4);
        r.material.opacity = (1 - k) * 0.8 * tap * (1 - after * 0.5);
      });
    } else if (this.phoneVideo && !this.phoneVideo.paused) this.phoneVideo.pause();

    this.renderer.render(this.scene, this.camera);
  }
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
