// Shared building blocks for portal worlds: flat (no-gradient) skies, toon materials, confetti, floor ripples,
// pop-apart shards, video screens, clip pinning for rigged characters. All sizes in portal units (1 = 1 m).
import * as THREE from 'three';

/** A 2- or 3-step toon ramp, so lit 3D reads as flat colour bands (no gradients, house rule). */
export function toonRamp(steps = 3) {
  const d = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) { const v = Math.round(110 + (145 * i) / Math.max(1, steps - 1)); d.set([v, v, v, 255], i * 4); }
  const t = new THREE.DataTexture(d, steps, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
export const toon = (color, ramp) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });

/** An equirect sky drawn with flat shapes on a canvas. draw(g, W, H) paints it. */
export function flatSky(draw, { radius = 30, w = 2048, h = 1024 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -50; m.name = 'sky';
  return m;
}
/** Stars: dots and a few four-point sparkles. */
export function drawStars(g, w, h, n = 520, cols = ['#ffffff'], top = 0, bottom = 0.62) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = (top + Math.random() * (bottom - top)) * h, r = Math.random() < 0.9 ? 1 + Math.random() * 1.6 : 2.6 + Math.random() * 2;
    g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (r > 3.2) { g.fillRect(x - r * 3, y - 0.8, r * 6, 1.6); g.fillRect(x - 0.8, y - r * 3, 1.6, r * 6); }
  }
}

/** Confetti burst: flat quads in the given colours, from a point. */
export class Confetti {
  constructor(parent, colors, n = 160) {
    this.n = n; this.live = 0;
    const geo = new THREE.PlaneGeometry(0.05, 0.08);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false; this.mesh.count = 0; parent.add(this.mesh);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, col.set(colors[i % colors.length]));
    this.p = Array.from({ length: n }, () => ({ pos: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: new THREE.Vector3(), life: 0 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._one = new THREE.Vector3(1, 1, 1);
  }
  burst(at, power = 3, up = 2.5, count = this.n) {
    for (let i = 0; i < count; i++) {
      const p = this.p[i]; p.pos.copy(at);
      const a = Math.random() * Math.PI * 2, s = power * (0.4 + Math.random() * 0.6);
      p.v.set(Math.cos(a) * s, up + Math.random() * up, Math.sin(a) * s);
      p.s.set(Math.random() * 8, Math.random() * 8, Math.random() * 8); p.r.set(Math.random() * 6, Math.random() * 6, 0); p.life = 3 + Math.random() * 2;
    }
    this.live = Math.max(this.live, count); this.mesh.count = this.live;
  }
  tick(dt) {
    if (!this.live) return;
    let alive = 0;
    for (let i = 0; i < this.live; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        p.life -= dt; alive++;
        p.v.y -= 3.0 * dt; p.v.multiplyScalar(1 - 1.2 * dt); if (p.v.y < -0.6) p.v.y = -0.6;
        p.pos.addScaledVector(p.v, dt); if (p.pos.y < 0.01) { p.pos.y = 0.01; p.v.set(0, 0, 0); }
        p.r.x += p.s.x * dt; p.r.y += p.s.y * dt;
      }
      this._q.setFromEuler(p.r);
      this._m.compose(p.pos, this._q, p.life > 0 ? this._one : new THREE.Vector3(0, 0, 0));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) { this.live = 0; this.mesh.count = 0; }
  }
}

/** Expanding flat rings on the floor (or any plane): ripple(at, color). */
export class Ripples {
  constructor(parent, max = 10) {
    this.items = [];
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; parent.add(m); this.items.push({ m, t: 1, dur: 1, max: 1 });
    }
    this.i = 0;
  }
  ripple(at, color = '#fff', max = 1.6, dur = 1.1, vertical = false) {
    const it = this.items[this.i++ % this.items.length];
    it.m.position.copy(at); it.m.position.y += vertical ? 0 : 0.006; it.m.material.color.set(color); it.t = 0; it.dur = dur; it.max = max; it.m.visible = true;
    it.m.rotation.set(vertical ? 0 : -Math.PI / 2, 0, 0);
    return it.m;
  }
  tick(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t += dt / it.dur; if (it.t >= 1) { it.m.visible = false; continue; }
      const k = 1 - Math.pow(1 - it.t, 3); it.m.scale.setScalar(0.05 + k * it.max); it.m.material.opacity = it.t < 0.7 ? 1 : 1 - (it.t - 0.7) / 0.3;
    }
  }
}

/** Shards that fly apart where something popped. */
export class Shards {
  constructor(parent, n = 90) {
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.05), new THREE.MeshBasicMaterial(), n);
    this.mesh.frustumCulled = false; this.mesh.count = 0; parent.add(this.mesh);
    this.p = Array.from({ length: n }, () => ({ pos: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), life: 0 }));
    this.i = 0; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, this._c.set('#fff'));
  }
  pop(at, color, count = 14, speed = 2.2, size = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.i++ % this.p.length, p = this.p[i];
      p.pos.copy(at); p.v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      p.r.set(Math.random() * 6, Math.random() * 6, 0); p.life = 0.9 + Math.random() * 0.5; p.size = size * (0.6 + Math.random() * 0.8);
      this.mesh.setColorAt(i, this._c.set(Array.isArray(color) ? color[k % color.length] : color));
    }
    this.mesh.instanceColor.needsUpdate = true; this.mesh.count = this.p.length;
  }
  tick(dt) {
    if (!this.mesh.count) return;
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i]; if (p.life > 0) { p.life -= dt; p.v.y -= 4 * dt; p.pos.addScaledVector(p.v, dt); p.r.x += 9 * dt; p.r.y += 7 * dt; }
      this._q.setFromEuler(p.r); this._s.setScalar(p.life > 0 ? Math.min(1, p.life * 2) * (p.size || 1) : 0);
      this._m.compose(p.pos, this._q, this._s); this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A video on a flat screen with a flat-colour frame. The video starts on the first call to play() (inside a tap). */
export function videoScreen(src, { w = 0.48, h = 0.816, frame = '#ffffff', border = 0.025 } = {}) {
  const g = new THREE.Group();
  const v = document.createElement('video'); v.src = src; v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.crossOrigin = 'anonymous'; v.preload = 'auto';
  const tex = new THREE.VideoTexture(v); tex.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w + border * 2, h + border * 2), new THREE.MeshBasicMaterial({ color: frame, side: THREE.DoubleSide }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.position.z = 0.004; g.add(back, scr);
  g.userData.video = v; g.userData.play = () => v.play().catch(() => {});
  return g;
}

/** Remove the root drift from a rigged character's clips (keeps the hips over the origin). */
export function pinClips(clips, bone = 'Hips') {
  for (const c of clips) {
    const tr = c.tracks.find((t) => t.name === `${bone}.position`);
    if (!tr) continue;
    const x0 = tr.values[0], z0 = tr.values[2];
    for (let i = 0; i < tr.values.length; i += 3) { tr.values[i] = x0; tr.values[i + 2] = z0; }
  }
  return clips;
}

/** Scale an object so it is `height` tall with its feet at y = 0 and centred on x/z. */
export function fitHeight(obj, height) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), s = height / Math.max(1e-4, box.max.y - box.min.y);
  obj.scale.multiplyScalar(s); obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj), c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  return obj;
}

/** A flat label (canvas text) on a plane. */
export function label(text, { color = '#fff', bg = null, font = '800 64px "Space Grotesk", system-ui', h = 0.12, pad = 24 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = font;
  const tw = Math.ceil(g.measureText(text).width) + pad * 2; c.width = tw; c.height = 96;
  g.font = font; if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, tw, 96, 48); g.fill(); }
  g.fillStyle = color; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, tw / 2, 50);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * tw / 96, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  return m;
}

export const easeOutBack = (x) => { x = Math.min(1, Math.max(0, x)); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
export const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
/** turn obj (yaw only) towards a world point, smoothly */
const _wp = new THREE.Vector3();
export function faceTowards(obj, worldPoint, dt, speed = 4, offset = 0) {
  obj.getWorldPosition(_wp);
  const parentYaw = obj.parent ? new THREE.Euler().setFromQuaternion(obj.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0;
  let target = Math.atan2(worldPoint.x - _wp.x, worldPoint.z - _wp.z) - parentYaw + offset;
  let d = target - obj.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
  obj.rotation.y += d * (1 - Math.exp(-speed * dt));
}
