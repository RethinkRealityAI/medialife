// Effects for the moments, all built at load and drawn with ONE program each (no shader compiles when something
// appears, pitfall 13): a pooled particle system (sparkles, snow, Zs, music notes, hearts, confetti dots) in one
// Points draw, contact-shadow blobs, a flat-tile disco floor and the chroma-keyed portal video material.
// Flat colours only: glyphs are solid white shapes tinted per particle; the shadow is ONE colour fading out.
import * as THREE from 'three';

export const GLYPH = { sparkle: 0, snow: 1, z: 2, note: 3, heart: 4, dot: 5, star: 6, ring: 7 } as const;
export type Glyph = keyof typeof GLYPH;

/** Flat palette (sRGB, the theme tokens). */
export const PAL = {
  // EVADE flat palette (names kept so every moment reads the same): pink = hot pink, blue = Eclipse blue, sky = cyan
  pink: 0xff4f9a, pinkSoft: 0xffc2dc, blue: 0x2a5bd7, sky: 0x4fd6e8, yellow: 0xf6c344, orange: 0xff7a1a,
  green: 0x7bf1a8, purple: 0x6a32e8, red: 0xe3243a, white: 0xffffff, ice: 0xbfefff,
};
/** The EVADE accent set (the BOBO OS app colours), used for every celebration. */
export const RAINBOW = [0xe3243a, 0xff7a1a, 0xf6c344, 0x4fd6e8, 0x2a5bd7, 0x6a32e8];

// ------------------------------------------------------------------ glyph atlas (4 x 2 cells, white on clear)
let atlasTex: THREE.CanvasTexture | null = null;
function atlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const C = 128, c = document.createElement('canvas');
  c.width = C * 4; c.height = C * 2;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const cell = (i: number, draw: () => void) => {
    g.save(); g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2); draw(); g.restore();
  };
  // sparkle: four-point star
  cell(0, () => {
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 - Math.PI / 2, r = k % 2 ? 13 : 58;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  });
  // snowflake
  cell(1, () => {
    g.lineWidth = 9;
    for (let k = 0; k < 6; k++) {
      g.save(); g.rotate((k * Math.PI) / 3);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -52); g.moveTo(0, -32); g.lineTo(-14, -46); g.moveTo(0, -32); g.lineTo(14, -46); g.stroke();
      g.restore();
    }
  });
  // Z
  cell(2, () => {
    g.lineWidth = 15;
    g.beginPath(); g.moveTo(-34, -36); g.lineTo(34, -36); g.lineTo(-34, 36); g.lineTo(34, 36); g.stroke();
  });
  // music note
  cell(3, () => {
    g.beginPath(); g.ellipse(-16, 30, 22, 16, -0.4, 0, Math.PI * 2); g.fill();
    g.fillRect(2, -50, 11, 80);
    g.beginPath(); g.moveTo(13, -50); g.quadraticCurveTo(46, -36, 36, -6); g.quadraticCurveTo(34, -24, 13, -28); g.closePath(); g.fill();
  });
  // 'heart' slot: a heart (Bobo's love; flat)
  cell(4, () => {
    g.beginPath();
    g.moveTo(0, 50);
    g.bezierCurveTo(-60, 8, -52, -50, -16, -50);
    g.bezierCurveTo(-4, -50, 0, -40, 0, -32);
    g.bezierCurveTo(0, -40, 4, -50, 16, -50);
    g.bezierCurveTo(52, -50, 60, 8, 0, 50);
    g.fill();
  });
  // dot
  cell(5, () => { g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill(); });
  // five-point star
  cell(6, () => {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2, r = k % 2 ? 24 : 56;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  });
  // ring
  cell(7, () => { g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.stroke(); });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  return atlasTex;
}

const VERT = /* glsl */ `
attribute float size;
attribute vec4 tint;
attribute float glyph;
attribute float spin;
uniform float uScreenH;
varying vec4 vTint;
varying float vGlyph;
varying float vSpin;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = length(modelMatrix[0].xyz);
  gl_PointSize = size * s * projectionMatrix[1][1] * uScreenH * 0.5 / max(0.02, -mv.z);
  gl_Position = projectionMatrix * mv;
  vTint = tint; vGlyph = glyph; vSpin = spin;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec4 vTint;
varying float vGlyph;
varying float vSpin;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vSpin), s = sin(vSpin);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
  float col = mod(vGlyph, 4.0), row = floor(vGlyph / 4.0);
  vec2 uv = vec2((col + p.x) / 4.0, 1.0 - (row + p.y) / 2.0);
  vec4 t = texture2D(map, uv);
  float a = t.a * vTint.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vTint.rgb, a);
}`;

export interface EmitOptions {
  count: number;
  glyph: Glyph | Glyph[];
  colors: number[];
  /** Spawn centre (parent space). */
  at: THREE.Vector3;
  /** Spawn box half-size (or radius for 'ring'). */
  spread?: [number, number, number];
  /** Spawn on a horizontal ring of this radius instead of a box. */
  ring?: number;
  vel?: [number, number, number];
  velSpread?: [number, number, number];
  /** Outward speed from the centre (bursts). */
  burst?: number;
  gravity?: number;
  drag?: number;
  life?: [number, number];
  size?: [number, number];
  spin?: number;
  /** Sideways sway amplitude (snow, notes, Zs). */
  sway?: number;
  delay?: number;
  /** Bounce on (or land on) a floor at this height (stage space). */
  floor?: number;
  /** Floor bounciness 0..1 (0 = lands and stays, like snow). Default 0.45. */
  bounce?: number;
  /** Seconds a landed particle stays before it fades (default: the rest of its life). */
  rest?: number;
  /** Also land on top of this sphere (snow on his head). The object is read live, keep it. */
  perch?: THREE.Sphere;
}

interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; glyph: number; r: number; g: number; b: number;
  spin: number; spinV: number; grav: number; drag: number; sway: number; phase: number; alive: boolean;
  fy: number; bnc: number; restS: number; landed: boolean; perch: THREE.Sphere | null;
}

/** One pooled particle system, one draw call, one program. Lives in a stage's local space. */
export class Particles {
  readonly points: THREE.Points;
  private pool: P[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private tint: Float32Array;
  private size: Float32Array;
  private glyph: Float32Array;
  private spin: Float32Array;
  private mat: THREE.ShaderMaterial;
  private col = new THREE.Color();
  private dir = new THREE.Vector3();
  private cursor = 0;
  scale = 1; // reduced motion: fewer particles
  constructor(readonly capacity = 600) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.tint = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.glyph = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    const dyn = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('tint', dyn(this.tint, 4));
    this.geo.setAttribute('size', dyn(this.size, 1));
    this.geo.setAttribute('glyph', dyn(this.glyph, 1));
    this.geo.setAttribute('spin', dyn(this.spin, 1));
    this.geo.setDrawRange(0, 0);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas() }, uScreenH: { value: 800 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    const v = new THREE.Vector2();
    this.points.onBeforeRender = (r) => { this.mat.uniforms.uScreenH.value = r.getDrawingBufferSize(v).y; };
  }

  get alive(): number {
    let n = 0;
    for (const p of this.pool) if (p.alive) n++;
    return n;
  }

  emit(o: EmitOptions): void {
    const n = Math.max(1, Math.round(o.count * this.scale));
    const glyphs = ([] as Glyph[]).concat(o.glyph);
    const rnd = (a: number) => (Math.random() * 2 - 1) * a;
    const [lo, hi] = o.life ?? [1.2, 2];
    const [s0, s1] = o.size ?? [0.06, 0.12];
    for (let i = 0; i < n; i++) {
      let p: P | null = null;
      // round-robin search for a free slot (no closure per particle)
      for (let k = 0; k < this.pool.length; k++) {
        const q = this.pool[(this.cursor + k) % this.pool.length];
        if (!q.alive) { p = q; this.cursor = (this.cursor + k + 1) % this.pool.length; break; }
      }
      if (!p) {
        if (this.pool.length >= this.capacity) return;
        p = {} as P;
        this.pool.push(p);
      }
      let x = o.at.x, y = o.at.y, z = o.at.z;
      if (o.ring) {
        const a = Math.random() * Math.PI * 2;
        x += Math.cos(a) * o.ring; z += Math.sin(a) * o.ring; y += rnd(o.spread?.[1] ?? 0);
      } else if (o.spread) {
        x += rnd(o.spread[0]); y += rnd(o.spread[1]); z += rnd(o.spread[2]);
      }
      const vs = o.velSpread ?? [0, 0, 0];
      let vx = (o.vel?.[0] ?? 0) + rnd(vs[0]), vy = (o.vel?.[1] ?? 0) + rnd(vs[1]), vz = (o.vel?.[2] ?? 0) + rnd(vs[2]);
      if (o.burst) {
        const d = this.dir.set(rnd(1), rnd(1) * 0.8 + 0.2, rnd(1)).normalize().multiplyScalar(o.burst * (0.5 + Math.random() * 0.5));
        vx += d.x; vy += d.y; vz += d.z;
      }
      this.col.setHex(o.colors[Math.floor(Math.random() * o.colors.length)], THREE.LinearSRGBColorSpace); // raw sRGB bytes
      Object.assign(p, {
        x, y, z, vx, vy, vz, age: -(o.delay ?? 0) * Math.random(), life: lo + Math.random() * (hi - lo),
        size: s0 + Math.random() * (s1 - s0), glyph: GLYPH[glyphs[Math.floor(Math.random() * glyphs.length)]],
        r: this.col.r, g: this.col.g, b: this.col.b, spin: Math.random() * 6.28, spinV: rnd(o.spin ?? 1.5),
        grav: o.gravity ?? 0, drag: o.drag ?? 0.6, sway: o.sway ?? 0, phase: Math.random() * 6.28, alive: true,
        fy: o.floor ?? NaN, bnc: o.bounce ?? 0.45, restS: o.rest ?? -1, landed: false, perch: o.perch ?? null,
      });
    }
  }

  /** Floor / perch contact for particles that asked for it (bounce, or land and stay a moment). */
  private collide(p: P): void {
    // a point sprite is centred on its position: sit it on the floor, not half through it
    const lift = p.size * 0.3;
    let ny = p.fy + lift, hit = p.y < ny;
    const s = p.perch;
    if (!hit && s && p.vy < 0) {
      const dx = p.x - s.center.x, dy = p.y - s.center.y, dz = p.z - s.center.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (dy > s.radius * 0.35 && d2 < s.radius * s.radius) {
        hit = true;
        ny = s.center.y + Math.sqrt(Math.max(0, s.radius * s.radius - dx * dx - dz * dz)) + lift * 0.5;
      }
    }
    if (!hit) return;
    // keep where the sway had put it, so landing doesn't jump
    if (p.sway) { p.x += Math.sin(p.age * 3 + p.phase) * p.sway; p.z += Math.sin(p.age * 3 + p.phase) * p.sway * 0.3; p.sway = 0; }
    p.y = ny;
    if (p.bnc > 0 && -p.vy > 0.25) {
      p.vy = -p.vy * p.bnc;
      p.vx *= 0.7; p.vz *= 0.7;
      p.spinV *= 0.6;
      return;
    }
    p.landed = true;
    p.vx = p.vy = p.vz = 0;
    if (p.restS >= 0) p.life = p.age + p.restS;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
    this.geo.setDrawRange(0, 0);
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      if (p.age < 0) continue;
      if (!p.landed) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.spin += p.spinV * dt;
        if (p.fy === p.fy) this.collide(p);
      }
      const t = p.age / p.life;
      // pop in fast, fade out over the last 35 %
      // floor particles fade over their last half second (they land, rest, then go); the rest over the last 35 %
      const a = Math.min(1, p.age / 0.12) * (p.fy === p.fy ? Math.min(1, (p.life - p.age) / 0.5) : Math.min(1, (1 - t) / 0.35));
      const sw = p.sway && !p.landed ? Math.sin(p.age * 3 + p.phase) * p.sway : 0;
      const sz = p.size * (t < 0.15 ? 0.4 + (t / 0.15) * 0.6 : 1);
      this.pos[n * 3] = p.x + sw; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z + sw * 0.3;
      this.tint[n * 4] = p.r; this.tint[n * 4 + 1] = p.g; this.tint[n * 4 + 2] = p.b; this.tint[n * 4 + 3] = a;
      this.size[n] = sz; this.glyph[n] = p.glyph; this.spin[n] = p.glyph === GLYPH.note || p.glyph === GLYPH.z ? Math.sin(p.spin) * 0.35 : p.spin;
      n++;
    }
    this.geo.setDrawRange(0, n);
    if (n) for (const k of ['position', 'tint', 'size', 'glyph', 'spin']) {
      const at = this.geo.getAttribute(k) as THREE.BufferAttribute;
      at.clearUpdateRanges();
      at.addUpdateRange(0, n * at.itemSize);
      at.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------------ contact shadow (one colour fading out)
let shadowTex: THREE.CanvasTexture | null = null;
export function contactShadow(radius: number, opacity = 0.38): THREE.Mesh {
  if (!shadowTex) {
    const n = 64, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d')!, img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const a = d >= 1 ? 0 : Math.pow(1 - d * d, 1.6);
      img.data.set([40, 14, 48, Math.round(a * 255)], (y * n + x) * 4);
    }
    g.putImageData(img, 0, 0);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = -1;
  return m;
}

// ------------------------------------------------------------------ disco floor: flat tiles cycling colours
export class DiscoFloor {
  readonly mesh: THREE.Mesh;
  private tex: THREE.DataTexture;
  private data: Uint8Array;
  private t = 0;
  private step = -1;
  constructor(readonly tiles = 6, size = 2.4) {
    const px = tiles * 8;
    this.data = new Uint8Array(px * px * 4);
    this.tex = new THREE.DataTexture(this.data, px, px);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.generateMipmaps = false;
    this.paint(0);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 48), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = 0.006;
    this.mesh.renderOrder = -2;
    this.mesh.visible = false;
  }
  get material(): THREE.MeshBasicMaterial {
    return this.mesh.material as THREE.MeshBasicMaterial;
  }
  private paint(step: number): void {
    const px = this.tiles * 8;
    for (let ty = 0; ty < this.tiles; ty++) for (let tx = 0; tx < this.tiles; tx++) {
      const hex = RAINBOW[(tx + ty * 2 + step) % RAINBOW.length];
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      const on = (tx + ty + step) % 3 !== 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const edge = x === 0 || y === 0;
        const i = ((ty * 8 + y) * px + tx * 8 + x) * 4;
        if (edge) this.data.set([255, 255, 255, 255], i);
        else this.data.set(on ? [r, g, b, 255] : [255, 214, 234, 255], i);
      }
    }
    this.tex.needsUpdate = true;
  }
  update(dt: number): void {
    if (!this.mesh.visible) return;
    this.t += dt;
    const s = Math.floor(this.t * 3);
    if (s !== this.step) { this.step = s; this.paint(s); }
  }
}

// ------------------------------------------------------------------ chroma-key video (portal)
// Keyed in raw sRGB (pitfall, 2026-11-19: in linear light the same thresholds key far too much): the VideoTexture
// stays NoColorSpace, the key colour is a raw sRGB Vector3, and the shader writes the result out unconverted.
const CK_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CK_FRAG = /* glsl */ `
uniform sampler2D tex; uniform vec3 keyColor; uniform float similarity; uniform float smoothness; uniform float spill; uniform float opacity;
varying vec2 vUv;
vec2 RGBtoUV(vec3 rgb) { return vec2(rgb.r * -0.169 + rgb.g * -0.331 + rgb.b * 0.5 + 0.5, rgb.r * 0.5 + rgb.g * -0.419 + rgb.b * -0.081 + 0.5); }
void main() {
  vec4 rgba = texture2D(tex, vUv);
  float baseMask = distance(RGBtoUV(rgba.rgb), RGBtoUV(keyColor)) - similarity;
  float fullMask = pow(clamp(baseMask / smoothness, 0., 1.), 1.5);
  float spillVal = pow(clamp(baseMask / spill, 0., 1.), 1.5);
  float desat = clamp(rgba.r * 0.2126 + rgba.g * 0.7152 + rgba.b * 0.0722, 0., 1.);
  rgba.rgb = mix(vec3(desat), rgba.rgb, spillVal);
  float a = fullMask * opacity;
  if (a < 0.02) discard;
  gl_FragColor = vec4(rgba.rgb, a);
}`;
export function chromaKeyMaterial(video: HTMLVideoElement, keyHex = 0x14d15d): THREE.ShaderMaterial {
  const tex = new THREE.VideoTexture(video);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const key = new THREE.Vector3(((keyHex >> 16) & 255) / 255, ((keyHex >> 8) & 255) / 255, (keyHex & 255) / 255);
  return new THREE.ShaderMaterial({
    uniforms: {
      tex: { value: tex }, keyColor: { value: key }, similarity: { value: 0.16 }, smoothness: { value: 0.08 },
      spill: { value: 0.2 }, opacity: { value: 1 },
    },
    vertexShader: CK_VERT, fragmentShader: CK_FRAG, transparent: true, depthWrite: false, toneMapped: false,
  });
}

/** A playsinline video element in the document (iOS: off-document videos stay black). Attributes before src. */
export function makeVideo(src: string, o: { loop?: boolean; muted?: boolean } = {}): HTMLVideoElement {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = o.muted ?? true;
  v.defaultMuted = o.muted ?? true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.loop = o.loop ?? false;
  v.preload = 'auto';
  v.src = src;
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(v);
  return v;
}
