/**
 * "How it works" as the fan lives it: the phone that tapped the tag shows the
 * MEDIALIFE splash, grows to fill the screen, its camera finds the print and
 * the piece's real AR animation plays on top of it.
 *
 *   Splash  → the splash screen of our default AR experience, drawn into a 2D
 *             canvas. The tech section's 3D phone uses it as its screen
 *             texture and the DOM phone shows the same canvas, so the hand-off
 *             between them is seamless.
 *   ARView  → a second little scene: the piece as the phone's camera sees it,
 *             with the 8th Wall animation (a green-screen video) keyed onto the
 *             print exactly where the image target sits.
 *
 * Per-piece AR data lives in main.js (PRODUCTS[].ar). Pieces without it show
 * the Sukeban hoodie for now.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SoftGarment } from "./softbody.js";

const BASE = "/activated-merch/";
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const seg = (v, a, b) => clamp01((v - a) / (b - a));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

import { SCREEN_ASPECT, arPhases } from "./arlayout.js";
export { SCREEN_ASPECT, handoffRect, fullRect, arPhases } from "./arlayout.js";

/* ================================================================ splash */
export class Splash {
  constructor() {
    const c = (this.canvas = document.createElement("canvas"));
    c.width = 540;
    c.height = Math.round(540 / SCREEN_ASPECT);
    c.className = "splash-canvas";
    this.ctx = c.getContext("2d");
    this.word = new Image();
    this.word.src = "/brand/medialife-wordmark.webp";
    this.word.onload = () => (this.dirty = true);
    this.t0 = null;
    this.last = -1;
    this.texture = null;
    this.draw(0);
  }

  /** Restart the splash from the top (e.g. when scrolled back above the tap). */
  reset() {
    this.t0 = null;
  }

  /** Advance to wall-clock time t (s) once running; returns elapsed splash time. */
  tick(t) {
    if (this.t0 == null) this.t0 = t;
    const e = t - this.t0;
    // Redraw at ~30 fps; the type-on and spinner don't need more.
    if (e - this.last > 1 / 30 || this.dirty) {
      this.draw(e);
      this.last = e;
      this.dirty = false;
      if (this.texture) this.texture.needsUpdate = true;
    }
    return e;
  }

  draw(e) {
    const x = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    x.fillStyle = "#06060b";
    x.fillRect(0, 0, W, H);
    // Glow from the top, magenta haze at the floor.
    let g = x.createRadialGradient(W * 0.25, 0, 0, W * 0.25, 0, H * 0.55);
    g.addColorStop(0, "rgba(40,110,150,0.45)");
    g.addColorStop(1, "rgba(40,110,150,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(W * 0.7, H, 0, W * 0.7, H, H * 0.5);
    g.addColorStop(0, "rgba(200,40,130,0.42)");
    g.addColorStop(1, "rgba(200,40,130,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // Perspective grid on the floor, scrolling towards us.
    const hz = H * 0.6;
    x.save();
    x.lineWidth = 1.2;
    const scroll = (e * 0.35) % 1;
    for (let i = 0; i < 14; i++) {
      const k = (i + scroll) / 14;
      const y = hz + (H - hz) * k * k;
      x.strokeStyle = `rgba(90,150,255,${0.08 + k * 0.28})`;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(W, y);
      x.stroke();
    }
    for (let i = -9; i <= 9; i++) {
      x.strokeStyle = "rgba(120,110,255,0.22)";
      x.beginPath();
      x.moveTo(W / 2 + i * 14, hz);
      x.lineTo(W / 2 + i * W * 0.28, H);
      x.stroke();
    }
    // Faint grid in the sky too.
    for (let i = -9; i <= 9; i++) {
      x.strokeStyle = "rgba(90,150,255,0.07)";
      x.beginPath();
      x.moveTo(W / 2 + i * 14, hz);
      x.lineTo(W / 2 + i * W * 0.28, 0);
      x.stroke();
    }
    x.restore();

    const cy = H * 0.47;
    // Lens icon.
    const lensA = seg(e, 1.0, 1.5);
    if (lensA > 0) {
      const ly = cy - 150;
      x.save();
      x.globalAlpha = lensA;
      g = x.createRadialGradient(W / 2, ly, 0, W / 2, ly, 70);
      g.addColorStop(0, "rgba(255,61,154,0.35)");
      g.addColorStop(1, "rgba(255,61,154,0)");
      x.fillStyle = g;
      x.fillRect(W / 2 - 80, ly - 80, 160, 160);
      const ring = x.createLinearGradient(W / 2 - 40, ly - 40, W / 2 + 40, ly + 40);
      ring.addColorStop(0, "#c04dff");
      ring.addColorStop(1, "#ff3d9a");
      x.lineWidth = 7;
      x.strokeStyle = ring;
      x.beginPath();
      x.arc(W / 2, ly, 40, 0, Math.PI * 2);
      x.stroke();
      x.lineWidth = 5;
      x.strokeStyle = "#5a7dff";
      x.beginPath();
      x.arc(W / 2, ly, 27, 0, Math.PI * 2);
      x.stroke();
      g = x.createRadialGradient(W / 2 - 4, ly - 4, 2, W / 2, ly, 20);
      g.addColorStop(0, "#c8f4ff");
      g.addColorStop(0.5, "#33c8ff");
      g.addColorStop(1, "#1f5bd6");
      x.fillStyle = g;
      x.beginPath();
      x.arc(W / 2, ly, 19, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "rgba(255,255,255,0.85)";
      x.beginPath();
      x.arc(W / 2 - 7, ly - 7, 5, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
    // Wordmark types on, left to right.
    const ww = W * 0.72;
    const wh = ww * (70 / 420);
    const type = seg(e, 0.15, 0.95);
    if (this.word.complete && this.word.naturalWidth && type > 0) {
      x.save();
      x.beginPath();
      x.rect((W - ww) / 2, cy - wh / 2 - 4, ww * Math.min(1, Math.ceil(type * 9) / 9), wh + 8);
      x.clip();
      x.drawImage(this.word, (W - ww) / 2, cy - wh / 2, ww, wh);
      x.restore();
    }
    // Gradient rule.
    const rule = easeOut(seg(e, 0.9, 1.35));
    if (rule > 0) {
      const rw = ww * 0.92 * rule;
      g = x.createLinearGradient(W / 2 - rw / 2, 0, W / 2 + rw / 2, 0);
      g.addColorStop(0, "#3fb6ff");
      g.addColorStop(1, "#ff3d9a");
      x.fillStyle = g;
      x.fillRect(W / 2 - rw / 2, cy + wh / 2 + 22, rw, 3);
    }
    // Subtitle.
    const sub = seg(e, 1.2, 1.7);
    if (sub > 0) {
      x.save();
      x.globalAlpha = sub;
      x.font = "500 17px ui-monospace, 'JetBrains Mono', Menlo, monospace";
      x.textAlign = "center";
      x.textBaseline = "middle";
      const sy = cy + wh / 2 + 58;
      const a = "A C T I V A T E D";
      const b = "   P R O D U C T S   D E M O";
      const wa = x.measureText(a).width;
      const wb = x.measureText(b).width;
      const sx = W / 2 - (wa + wb) / 2;
      x.textAlign = "left";
      x.fillStyle = "#ff5aa8";
      x.fillText(a, sx, sy);
      x.fillStyle = "rgba(220,225,255,0.85)";
      x.fillText(b, sx + wa, sy);
      x.restore();
    }
    // "Starting camera" with a spinner.
    const sc = seg(e, 1.8, 2.2);
    if (sc > 0) {
      x.save();
      x.globalAlpha = sc;
      const sy = cy + wh / 2 + 150;
      x.font = "500 16px ui-monospace, 'JetBrains Mono', Menlo, monospace";
      x.textBaseline = "middle";
      const label = "S T A R T I N G   C A M E R A";
      const lw = x.measureText(label).width;
      const sx = W / 2 - (lw + 34) / 2;
      x.lineWidth = 3;
      const a0 = e * 5;
      x.strokeStyle = "#3fb6ff";
      x.beginPath();
      x.arc(sx + 10, sy, 10, a0, a0 + 2.2);
      x.stroke();
      x.strokeStyle = "#ff3d9a";
      x.beginPath();
      x.arc(sx + 10, sy, 10, a0 + Math.PI, a0 + Math.PI + 2.2);
      x.stroke();
      x.fillStyle = "rgba(200,210,240,0.8)";
      x.fillText(label, sx + 34, sy);
      x.restore();
    }
  }

  /** A texture of the canvas for the 3D phone. */
  getTexture() {
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.anisotropy = 4;
    }
    return this.texture;
  }
}

/* ============================================================== AR view */
const CHROMA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

// The whole video sits opaque over the print, like the 8th Wall experiences:
// the green is swapped for the print's own background colour (with the same
// keyer the 8th Wall projects use, Mugen87's green-screen shader), so the
// character comes alive in place and the original print never shows through.
// Plus a scan-line reveal from the top.
const CHROMA_FRAG = /* glsl */ `
  uniform sampler2D tex;
  uniform vec3 keyColor, bg;
  uniform float uKey, uFeather, gain, similarity, smoothness, spill, uReveal, uOpacity, uTime;
  varying vec2 vUv;
  vec2 RGBtoUV(vec3 rgb) {
    return vec2(
      rgb.r * -0.169 + rgb.g * -0.331 + rgb.b * 0.5 + 0.5,
      rgb.r * 0.5 + rgb.g * -0.419 + rgb.b * -0.081 + 0.5);
  }
  void main() {
    vec4 rgba = texture2D(tex, vUv);
    float chromaDist = distance(RGBtoUV(rgba.rgb), RGBtoUV(keyColor));
    float baseMask = chromaDist - similarity;
    float a = mix(1.0, pow(clamp(baseMask / smoothness, 0., 1.), 1.5), uKey);
    float spillVal = mix(1.0, pow(clamp(baseMask / spill, 0., 1.), 1.5), uKey);
    float desat = clamp(rgba.r * 0.2126 + rgba.g * 0.7152 + rgba.b * 0.0722, 0., 1.);
    rgba.rgb = mix(vec3(desat), rgba.rgb, spillVal);
    // Scan-line reveal, top to bottom, with a bright edge.
    float y = 1.0 - vUv.y;
    float edge = uReveal * 1.08 - 0.04;
    float shown = 1.0 - smoothstep(edge - 0.015, edge, y);
    float line = smoothstep(0.03, 0.0, abs(y - edge)) * step(uReveal, 0.999);
    vec3 col = rgba.rgb;
    col = mix(bg, col * gain, a) + vec3(0.35, 0.85, 1.0) * line * 1.4;
    // Anti-aliased outer edge, so the panel's border stays crisp but clean.
    vec2 e = min(vUv, 1.0 - vUv) / fwidth(vUv);
    float rim = clamp(min(e.x, e.y), 0.0, 1.0);
    // The background can fade out towards the edges (prints with no panel
    // behind the character); the character itself always stays solid.
    vec2 ed = min(vUv, 1.0 - vUv);
    float bgA = uFeather > 0.0 ? smoothstep(0.0, uFeather, min(ed.x, ed.y * 0.75)) : 1.0;
    float alpha = max(shown * max(a, bgA), line * 0.9) * rim;
    gl_FragColor = vec4(col, alpha * uOpacity);
  }`;

export class ARView {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ reduced?: boolean }} opts
   */
  constructor(renderer, { reduced = false } = {}) {
    this.renderer = renderer;
    this.reduced = reduced;
    this.scene = new THREE.Scene();
    this.scene.environment = null;
    this.camera = new THREE.PerspectiveCamera(42, SCREEN_ASPECT, 0.05, 30);
    this.loader = new GLTFLoader();
    this.item = null;
    this.ready = false;
    this.loading = null;
    this.focus = new THREE.Vector3();
    this.corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._room();
  }

  _room() {
    const s = this.scene;
    // A dim room: warm key from above, cool fill, a soft pool of light behind.
    s.add(new THREE.HemisphereLight(0xf2e9e1, 0x15161c, 0.85));
    const key = new THREE.DirectionalLight(0xfff1e2, 1.9);
    key.position.set(1.2, 2.6, 2.4);
    s.add(key);
    const fill = new THREE.DirectionalLight(0xa9c4ff, 0.55);
    fill.position.set(-2, 0.6, 1.5);
    s.add(fill);
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 512;
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#17171b");
    g.addColorStop(0.62, "#2a2a30");
    g.addColorStop(0.63, "#1c1c21");
    g.addColorStop(1, "#111114");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 512);
    const r = x.createRadialGradient(128, 230, 0, 128, 230, 200);
    r.addColorStop(0, "rgba(255,236,214,0.22)");
    r.addColorStop(1, "rgba(255,236,214,0)");
    x.fillStyle = r;
    x.fillRect(0, 0, 256, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9, 18), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    wall.position.set(0, -2.2, -2.2);
    s.add(wall);
    this.wall = wall;
  }

  /**
   * Load the piece and key its AR animation over the print (once per piece).
   * @param {{ key:string, side:string, ar:{ video:string, poster?:string, key?:number, rect:number[][] } }} item
   */
  load(item) {
    if (this.item === item && this.loading) return this.loading;
    this.item = item;
    this.ready = false;
    const myItem = item;
    this.loading = this.loader.loadAsync(`${BASE}models/hero/${item.key}.glb`).then((gltf) => {
      if (this.item !== myItem) return;
      if (this.g) {
        this.g.group.removeFromParent();
        this.video?.pause();
      }
      const g = new SoftGarment(gltf.scene, { nodes: 60 });
      if (g.material.map) g.material.map.anisotropy = 8;
      const u = g.uniforms;
      u.uFade.value = 1;
      u.uHolo.value = 0;
      u.uDim.value = 1;
      u.uHide.value = 0;
      u.uRevealY.value = -99;
      u.uLens.value = 0;
      // The print faces the phone.
      g.group.rotation.y = item.side === "back" ? Math.PI : 0;
      this.g = g;
      this.scene.add(g.group);
      this._overlay(g, item);
      this.ready = true;
    });
    return this.loading;
  }

  /** A curved sheet that hugs the print (raycast onto the rest pose) and plays the video. */
  _overlay(g, item) {
    const ar = item.ar;
    const back = item.side === "back";
    const bb = g.bounds;
    const [tl, tr, br, bl] = ar.rect; // surface (u, v) of the image target's corners
    // Where the video sits, in target units (0..1 = the image target). Most
    // cover the target exactly; some (landscape scenes) run past its sides.
    const [fx0, fy0, fx1, fy1] = ar.frame || [0, 0, 1, 1];
    const wide = fx1 - fx0 > 1.2;
    const NX = wide ? 25 : 11;
    const NY = 14;
    const pos = new Float32Array(NX * NY * 3);
    const uv = new Float32Array(NX * NY * 2);
    const rc = new THREE.Raycaster();
    g.group.updateMatrixWorld(true);
    const inv = g.pick.matrixWorld.clone().invert();
    const toWorld = (p) => p.clone().applyMatrix4(g.pick.matrixWorld);
    const dirW = new THREE.Vector3(0, 0, back ? 1 : -1).transformDirection(g.pick.matrixWorld);
    // A point on the cloth at target coords (s, t), or null off the garment.
    const onCloth = (s, t) => {
      // Bilinear (extrapolating past the target) in surface coords.
      const su = lerp(lerp(tl[0], tr[0], s), lerp(bl[0], br[0], s), t);
      const sv = lerp(lerp(tl[1], tr[1], s), lerp(bl[1], br[1], s), t);
      const lx = lerp(bb.min.x, bb.max.x, (su + 1) / 2);
      const ly = lerp(bb.min.y, bb.max.y, sv);
      const from = new THREE.Vector3(lx, ly, back ? bb.min.z - 0.5 : bb.max.z + 0.5);
      rc.set(toWorld(from), dirW);
      const hit = rc.intersectObject(g.pick, false)[0];
      const p = hit ? hit.point.applyMatrix4(inv) : new THREE.Vector3(lx, ly, NaN);
      // Lift off the cloth a touch so it never z-fights.
      p.z += back ? -0.006 : 0.006;
      return p;
    };
    const pts = [];
    for (let j = 0; j < NY; j++) {
      const t = lerp(fy0, fy1, j / (NY - 1));
      for (let i = 0; i < NX; i++) {
        const s = lerp(fx0, fx1, i / (NX - 1));
        pts.push(onCloth(s, t));
        uv[(j * NX + i) * 2] = i / (NX - 1);
        uv[(j * NX + i) * 2 + 1] = 1 - j / (NY - 1);
      }
    }
    // Off the garment, the video carries on flat from the nearest cloth in its row.
    const zs = pts.map((p) => p.z).filter((z) => !Number.isNaN(z)).sort((a, b) => a - b);
    const zMid = zs.length ? zs[zs.length >> 1] : back ? bb.min.z : bb.max.z;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const p = pts[j * NX + i];
        if (!Number.isNaN(p.z)) continue;
        let z = zMid;
        for (let d = 1; d < NX; d++) {
          const l = pts[j * NX + i - d];
          const r = pts[j * NX + i + d];
          if (i - d >= 0 && l && !Number.isNaN(l.z) && !l.flat) { z = l.z; break; }
          if (i + d < NX && r && !Number.isNaN(r.z) && !r.flat) { z = r.z; break; }
        }
        p.z = z;
        p.flat = true;
      }
    }
    pts.forEach((p, n) => {
      pos[n * 3] = p.x;
      pos[n * 3 + 1] = p.y;
      pos[n * 3 + 2] = p.z;
    });
    const idx = [];
    for (let j = 0; j < NY - 1; j++)
      for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i;
        idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);

    const video = document.createElement("video");
    video.src = BASE + ar.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    if (this.video) {
      // Let go of the previous piece's video.
      this.video.pause();
      this.video.removeAttribute("src");
      this.video.load();
    }
    this.video = video;
    this.warmed = false;
    const vt = new THREE.VideoTexture(video);
    vt.colorSpace = THREE.NoColorSpace; // key in the video's own values, like 8th Wall
    const poster = ar.poster ? new THREE.TextureLoader().load(BASE + ar.poster) : vt;
    this.videoTex = vt;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: poster },
        // Raw (display) values: the video texture isn't linearised either, so
        // the key has to be compared in the same space. Converting it to
        // linear made dark and grey pixels key out and the print show through.
        keyColor: { value: new THREE.Color().setHex(ar.key ?? 0x00ff00, THREE.NoColorSpace) },
        bg: { value: new THREE.Color().setHex(ar.bg ?? 0x4a787e, THREE.NoColorSpace) },
        uKey: { value: ar.key == null ? 0 : 1 },
        uFeather: { value: ar.feather ?? 0 },
        gain: { value: ar.gain ?? 0.94 },
        similarity: { value: 0.159 },
        smoothness: { value: 0.082 },
        spill: { value: 0.214 },
        uReveal: { value: 0 },
        uOpacity: { value: 1 },
        uTime: { value: 0 },
      },
      vertexShader: CHROMA_VERT,
      fragmentShader: CHROMA_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    video.addEventListener("playing", () => {
      mat.uniforms.tex.value = vt;
    });
    const sheet = new THREE.Mesh(geo, mat);
    sheet.renderOrder = 2;
    g.pivot.add(sheet);
    this.sheet = sheet;

    // Corners and centre (pivot-local) for the brackets and the camera.
    // The target itself (not the video frame): what the brackets lock onto and the camera frames.
    const T = (s, t) => {
      const p = onCloth(s, t);
      if (Number.isNaN(p.z)) p.z = zMid;
      return p;
    };
    this.localCorners = [T(0, 0), T(1, 0), T(1, 1), T(0, 1)];
    this.localCentre = T(0.5, 0.5);
    this.printH = this.localCorners[0].distanceTo(this.localCorners[3]);

    if (this.petals) {
      this.petals.removeFromParent();
      this.petals = null;
    }
    if (ar.petals) this._petals(g);
  }

  /** Blossom petals that drift out of the print towards the phone. */
  _petals(g) {
    const n = 46;
    const c = this.localCorners;
    const base = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const s = Math.random();
      const t = Math.random() * 0.7;
      const p = c[0].clone().lerp(c[1], s).lerp(c[3].clone().lerp(c[2], s), t);
      base.set([p.x, p.y, p.z], i * 3);
      rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(base, 3));
    geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
    const out = this.item.side === "back" ? -1 : 1;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uT: { value: 0 }, uA: { value: 0 }, uOut: { value: out }, uPR: { value: this.renderer.getPixelRatio() }, uH: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aRnd;
        uniform float uT, uA, uOut, uPR, uH;
        varying float vA; varying float vRot; varying float vHue;
        void main() {
          float life = 3.2 + aRnd.x * 2.4;
          float k = fract((uT + aRnd.y * life) / life);
          vec3 p = position;
          p.y -= k * 0.55;
          p.x += sin(uT * (0.8 + aRnd.z) + aRnd.w * 6.28) * 0.06 + (aRnd.z - 0.5) * k * 0.35;
          p.z += uOut * k * (0.25 + aRnd.w * 0.9);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = uA * smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.75, 1.0, k));
          vRot = uT * (1.0 + aRnd.x * 2.0) + aRnd.w * 6.28;
          vHue = aRnd.z;
          gl_PointSize = uH * uPR * (0.028 + aRnd.y * 0.02) / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vRot; varying float vHue;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          d = mat2(c, -s, s, c) * d;
          d.x *= 1.9;
          float r = length(d) * 2.0;
          if (r > 1.0) discard;
          vec3 col = mix(vec3(1.0, 0.72, 0.8), vec3(1.0, 0.86, 0.9), vHue) * (0.8 + 0.2 * (1.0 - r));
          gl_FragColor = vec4(col, vA * smoothstep(1.0, 0.7, r));
        }`,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    g.pivot.add(pts);
    this.petals = pts;
  }

  /** Make sure the video can start the moment the target locks. */
  warm() {
    if (this.video && !this.warmed) {
      this.warmed = true;
      this.video.load();
    }
  }

  /**
   * Render the camera view into the phone's screen rect.
   * @param {number} p section progress 0..1
   * @param {{x:number,y:number,w:number,h:number}} rect viewport px
   */
  frame(dt, t, p, rect) {
    if (!this.ready) return null;
    const ph = arPhases(p);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const g = this.g;
    g.pivot.updateMatrixWorld(true);
    const centre = this.localCentre.clone().applyMatrix4(g.pivot.matrixWorld);

    // Camera: frame the print at about half the screen's height; before the
    // lock it hunts for it (off-centre, tilted, further back) like a hand would.
    const cam = this.camera;
    cam.fov = 42;
    const dist = this.printH / (0.52 * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const hunt = 1 - ph.find;
    const sw = this.reduced ? 0 : 1;
    const sway = (a, f, o) => Math.sin(t * f + o) * a * sw;
    const cx = centre.x + hunt * 0.32 + sway(0.012, 0.9, 0) + sway(0.006, 2.3, 1);
    const cy = centre.y - hunt * 0.22 + sway(0.01, 1.1, 2) + sway(0.005, 2.9, 3);
    const cz = centre.z + dist * (1 + hunt * 0.35) - ph.out * dist * 0.08;
    cam.position.set(cx, cy, cz);
    cam.lookAt(centre.x + hunt * 0.1, centre.y - hunt * 0.05, centre.z);
    cam.rotateZ(hunt * 0.09 + sway(0.006, 0.7, 4));
    // Our screen rect is the "real" view; the canvas around it is the overscan.
    cam.aspect = rect.w / rect.h;
    cam.setViewOffset(rect.w, rect.h, -rect.x, -rect.y, W, H);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    // The animation: scans on at the lock, then plays.
    const m = this.sheet.material.uniforms;
    m.uReveal.value = this.reduced ? (ph.reveal > 0 ? 1 : 0) : easeOut(ph.reveal);
    m.uTime.value = t;
    const v = this.video;
    if (ph.reveal > 0 && p < 0.995) {
      if (v.paused) v.play().catch(() => {});
    } else if (!v.paused) {
      v.pause();
      if (ph.reveal === 0) v.currentTime = 0;
    }
    const pu = this.petals?.material.uniforms;
    if (pu) {
      pu.uT.value = t;
      pu.uA.value = this.reduced ? 0 : seg(p, 0.52, 0.6) * (1 - ph.out * 0.6);
      pu.uH.value = H * cam.zoom * (rect.h / H) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    }

    this.renderer.render(this.scene, cam);

    // Bracket targets (viewport px).
    const out = this.localCorners.map((c, i) => {
      const w = this.corners[i].copy(c).applyMatrix4(g.pivot.matrixWorld).project(cam);
      return { x: (w.x * 0.5 + 0.5) * W, y: (-w.y * 0.5 + 0.5) * H };
    });
    return out;
  }

  pause() {
    if (this.video && !this.video.paused) this.video.pause();
  }
}
