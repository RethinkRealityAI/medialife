// A walk-through doorway for world-tracked AR (8th Wall engine binary + three.js).
//
// Layout (portal-local units, 1 = 1 m at size 1): the door stands on the floor (y = 0) at z = 0, its opening is
// W wide and H tall, centred on x = 0. The real room is on +z (where the visitor starts), the other world is on -z.
//
// How the illusion works without a stencil buffer (the engine's GL context has none, see the immersive skill):
//  - OUTSIDE: a huge depth-only wall at z = 0 with a door-shaped hole draws first. Anything of the other world
//    behind it fails the depth test, so you see the camera feed, except through the hole. Anything of the world
//    in FRONT of z = 0 (the sky dome, the floor disc) is cut by a clipping plane that keeps only z < 0.
//  - INSIDE (after walking through the opening): the wall and the clip go away, so the world surrounds you, and a
//    depth-only panel fills the opening from the back, so looking back through the door shows your real room.
//  - The side is decided like 8th Wall's own portal sample: you are only "inside" after crossing z = 0 WITHIN the
//    opening; stepping out round the side of the frame keeps you where you were.
// The membrane (the swirl in the opening) is a flat-colour band shader: no gradients (house rule).
import * as THREE from 'three';

const DEPTH_ONLY = () => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });

export class Portal {
  constructor({ renderer, width = 1.0, height = 2.1, colors = ['#19affe', '#ff2fae', '#ffffff'], frame = '#14161f', trim = null, radius = 0.12 }) {
    this.W = width; this.H = height;
    this.renderer = renderer; renderer.localClippingEnabled = true;
    this.group = new THREE.Group(); this.group.name = 'portal';
    this.world = new THREE.Group(); this.world.name = 'portal-world';
    this.group.add(this.world);
    this.inside = false; this.wasOutside = true; this.open = 0; this.openTarget = 0; this.near = 0;
    this.onCross = null;               // (inside: boolean) => void
    this.clip = new THREE.Plane();
    this._local = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.002);
    this._cam = new THREE.Vector3();
    this._clipped = new WeakSet();
    this.colors = colors.map((c) => new THREE.Color(c));

    // the wall with the door-shaped hole (outside view), 400 x 400, far bigger than the world
    const S = 200, w = width / 2, h = height, r = Math.min(radius, w * 0.9);
    const outer = new THREE.Shape(); outer.moveTo(-S, -S); outer.lineTo(S, -S); outer.lineTo(S, S); outer.lineTo(-S, S); outer.lineTo(-S, -S);
    const hole = new THREE.Path(); hole.moveTo(-w, 0); hole.lineTo(w, 0); hole.lineTo(w, h - r); hole.quadraticCurveTo(w, h, w - r, h); hole.lineTo(-w + r, h); hole.quadraticCurveTo(-w, h, -w, h - r); hole.lineTo(-w, 0);
    outer.holes.push(hole);
    this.wallOut = new THREE.Mesh(new THREE.ShapeGeometry(outer, 16), DEPTH_ONLY());
    this.wallOut.renderOrder = -100; this.wallOut.name = 'occluder-out';
    // the opening seen from inside, pushed a hair into the room side
    const openShape = new THREE.Shape(); openShape.moveTo(-w, 0); openShape.lineTo(w, 0); openShape.lineTo(w, h - r); openShape.quadraticCurveTo(w, h, w - r, h); openShape.lineTo(-w + r, h); openShape.quadraticCurveTo(-w, h, -w, h - r); openShape.lineTo(-w, 0);
    this.openGeo = new THREE.ShapeGeometry(openShape, 16);
    this.wallIn = new THREE.Mesh(this.openGeo, DEPTH_ONLY());
    this.wallIn.position.z = 0.004; this.wallIn.renderOrder = -100; this.wallIn.visible = false; this.wallIn.name = 'occluder-in';
    // Inside, the room shows through the opening only; the rest of the back wall is the world, so the occluder
    // for "everything behind me that is the room" is just the opening. The wall is a separate object so the
    // portal group's scale/pose applies to both.
    this.group.add(this.wallOut, this.wallIn);

    this.frame = this._buildFrame(frame, trim || colors[0], r);
    this.group.add(this.frame);
    this.membrane = this._buildMembrane(openShape, r);
    this.group.add(this.membrane);
    this.threshold = this._buildThreshold();
    this.group.add(this.threshold);
  }

  _buildFrame(frameCol, trimCol, r) {
    const g = new THREE.Group(); g.name = 'frame';
    const W = this.W, H = this.H, T = 0.09, D = 0.12;
    const body = new THREE.MeshStandardMaterial({ color: frameCol, roughness: 0.55, metalness: 0.35 });
    const trim = new THREE.MeshBasicMaterial({ color: trimCol });
    this.trimMat = trim;
    const post = new THREE.BoxGeometry(T, H + T, D);
    const l = new THREE.Mesh(post, body); l.position.set(-W / 2 - T / 2, (H + T) / 2, D / 2 + 0.003);
    const rr = l.clone(); rr.position.x = W / 2 + T / 2;
    const top = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * T, T, D), body); top.position.set(0, H + T / 2, D / 2 + 0.003);
    g.add(l, rr, top);
    // the neon trim around the opening (a thin flat-colour line, front and back)
    const pts = [];
    const w = W / 2 + 0.012, h = H + 0.012;
    pts.push(new THREE.Vector3(-w, 0, 0), new THREE.Vector3(-w, h, 0), new THREE.Vector3(w, h, 0), new THREE.Vector3(w, 0, 0));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02), 64, 0.014, 6, false);
    const tf = new THREE.Mesh(tube, trim); tf.position.z = D + 0.006;
    const tb = new THREE.Mesh(tube, trim); tb.position.z = 0.004;
    g.add(tf, tb);
    // little studs on the posts that light up in sequence
    this.studs = [];
    for (let i = 0; i < 7; i++) {
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(new THREE.CircleGeometry(0.018, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        s.position.set(sx * (W / 2 + T / 2), 0.25 + i * (H - 0.3) / 6, D + 0.008);
        s.userData.i = i; g.add(s); this.studs.push(s);
      }
    }
    return g;
  }

  _buildMembrane(shape) {
    const geo = new THREE.ShapeGeometry(shape, 16);
    const W = this.W, H = this.H;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 }, uOpen: { value: 0 }, uNear: { value: 0 }, uInside: { value: 0 },
        uSize: { value: new THREE.Vector2(W, H) },
        uC1: { value: this.colors[0] }, uC2: { value: this.colors[1] }, uC3: { value: this.colors[2] || new THREE.Color('#fff') },
      },
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        precision highp float;
        varying vec2 vP; uniform float uTime, uOpen, uNear, uInside; uniform vec2 uSize; uniform vec3 uC1, uC2, uC3;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
        void main(){
          vec2 c = vec2(0.0, uSize.y * 0.5);
          vec2 p = vP - c;
          float e = -sdBox(p, vec2(uSize.x * 0.5, uSize.y * 0.5));      // distance in from the edge
          float ang = atan(p.y, p.x);
          float wob = 0.022 * sin(ang * 7.0 + uTime * 2.6) + 0.012 * sin(ang * 13.0 - uTime * 3.7);
          float full = uSize.x * 0.5 + 0.05;
          float band = mix(full, mix(0.1, 0.045, uNear), uOpen) + wob * uOpen;
          if (uInside > 0.5) band = 0.035 + wob * 0.4;
          if (e > band + 0.012) discard;                                 // the open middle
          vec3 col;
          if (e > band) col = vec3(1.0);                                 // a crisp white rim on the iris
          else {
            float v = e * 22.0 - uTime * 1.7 + 0.9 * sin(ang * 3.0 + uTime * 0.9) + 0.4 * sin(length(p) * 9.0 - uTime * 2.2);
            float k = mod(floor(v), 3.0);
            col = k < 0.5 ? uC1 : (k < 1.5 ? uC2 : uC3);
            vec2 cell = floor(vP * 36.0);
            float s = hash(cell + floor(uTime * 6.0));
            if (s > 0.985) col = vec3(1.0);                             // sparkles
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(geo, mat); m.position.z = 0.012; m.renderOrder = 20; m.name = 'membrane';
    return m;
  }

  _buildThreshold() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(this.W + 0.18, 0.5), new THREE.MeshBasicMaterial({ color: this.colors[0], transparent: true, opacity: 0.35, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.003, 0.25); g.add(m);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(this.W + 0.18, 0.025), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
      s.rotation.x = -Math.PI / 2; s.position.set(0, 0.004, 0.06 + i * 0.16); s.userData.i = i; g.add(s);
    }
    this.thresholdStripes = g.children.slice(1);
    return g;
  }

  /** Clip every material in the world to the far side of the door (call after adding things; cheap to repeat). */
  register(obj = this.world) {
    obj.traverse((o) => {
      if (!o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (this._clipped.has(m)) continue;
        m.clippingPlanes = [this.clip]; m.needsUpdate = true; this._clipped.add(m);
      }
    });
  }

  setInside(v) {
    if (v === this.inside) return;
    this.inside = v;
    this.onCross && this.onCross(v);
  }

  update(dt, camera, t) {
    this.open += (this.openTarget - this.open) * (1 - Math.exp(-3.2 * dt));
    if (Math.abs(this.openTarget - this.open) < 0.002) this.open = this.openTarget;
    this.group.updateMatrixWorld(true);
    // which side is the camera on, in portal units
    camera.getWorldPosition(this._cam);
    const lp = this.group.worldToLocal(this._cam.clone());
    const outsideNow = lp.z > 0;
    const inOpening = Math.abs(lp.x) < this.W / 2 + 0.2 && lp.y < this.H + 0.4 && lp.y > -1.5;
    if (this.open > 0.5 && outsideNow !== this.wasOutside && inOpening) this.setInside(!outsideNow);
    this.wasOutside = outsideNow;
    const d = Math.hypot(lp.x, lp.z);
    this.near = THREE.MathUtils.clamp(1 - (d - 0.5) / 1.5, 0, 1);
    this.camLocal = lp;

    const showWorld = this.open > 0.02;
    this.world.visible = showWorld;
    this.wallOut.visible = !this.inside;
    this.wallIn.visible = this.inside && !outsideNow;
    // the clip: keep z < 0 while outside; nothing clipped inside
    this.clip.copy(this._local).applyMatrix4(this.group.matrixWorld);
    if (this.inside) this.clip.constant = 1e9;
    // membrane + frame animation
    const u = this.membrane.material.uniforms;
    u.uTime.value = t; u.uOpen.value = this.open; u.uNear.value = this.near; u.uInside.value = this.inside ? 1 : 0;
    const step = Math.floor(t * 6);
    for (const s of this.studs) s.material.color.copy(((step - s.userData.i) % 7 + 7) % 7 < 2 ? this.colors[1] : this.colors[2] || this.colors[0]);
    this.trimMat.color.copy(this.colors[Math.floor(t * 1.5) % 2 === 0 ? 0 : 1]);
    for (const s of this.thresholdStripes) s.material.opacity = ((Math.floor(t * 4) - s.userData.i) % 3 + 3) % 3 === 0 ? 0.95 : 0.25;
    return lp;
  }
}
