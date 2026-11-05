/**
 * The hologram: a beam of light that shoots up from a hotspot, rings rippling
 * out on the ground, sparks rising, and a floating screen that plays the
 * sighting (video or photo) with scanlines, a colour split and a flicker.
 * Lives in world space at the focus point; the globe turns the place there.
 */
import * as THREE from "three";

// EVADE yellow hologram: gold light, amber falloff, a warm screen glow
const TEAL = new THREE.Color("#ffd75e");
const BLUE = new THREE.Color("#ff9f1a");
const PINK = new THREE.Color("#fff1b8");

const beamVert = /* glsl */ `
  varying vec2 vUv;
  varying float vFres;
  void main() {
    vUv = uv;
    vec3 n = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFres = 1.0 - abs(dot(n, normalize(-mv.xyz)));
    gl_Position = projectionMatrix * mv;
  }`;
const beamFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  varying vec2 vUv;
  varying float vFres;
  void main() {
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.6);
    float scan = 0.6 + 0.4 * sin(h * 90.0 - uTime * 9.0);
    float streak = smoothstep(0.92, 1.0, sin(vUv.x * 6.2832 * 6.0 + uTime * 1.5));
    float a = fade * (0.18 + 0.82 * pow(vFres, 1.5)) * scan + streak * fade * 0.25;
    vec3 col = mix(uColor, uColor2, h * 0.8) * (1.0 + streak);
    gl_FragColor = vec4(col, a * uOpacity);
    #include <colorspace_fragment>
  }`;

const ringFrag = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float t = fract(uTime * 0.55 + float(i) / 3.0);
      float d = abs(r - t);
      a += smoothstep(0.06, 0.0, d) * (1.0 - t);
    }
    a += smoothstep(0.22, 0.0, r) * 0.9;
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }`;
const uvVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const screenFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uReveal;
  uniform float uGlitch;
  uniform vec3 uTint;
  uniform vec2 uCover; // uv scale to "cover" the panel
  varying vec2 vUv;
  float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    if (vUv.y > uReveal) discard;
    vec2 uv = (vUv - 0.5) * uCover + 0.5;
    // horizontal tear now and then
    float band = step(0.985, rnd(vec2(floor(uTime * 12.0), floor(vUv.y * 24.0))));
    uv.x += band * (rnd(vec2(uTime)) - 0.5) * 0.08 * (0.3 + uGlitch);
    float split = 0.004 + uGlitch * 0.02;
    vec3 col = vec3(0.02, 0.06, 0.08);
    if (uHasMap > 0.5) {
      col.r = texture2D(uMap, uv + vec2(split, 0.0)).r;
      col.g = texture2D(uMap, uv).g;
      col.b = texture2D(uMap, uv - vec2(split, 0.0)).b;
    }
    float scan = 0.88 + 0.12 * sin(vUv.y * 420.0 + uTime * 6.0);
    float flicker = 0.94 + 0.06 * sin(uTime * 37.0) * sin(uTime * 13.0);
    col = mix(col, col * uTint * 1.6, 0.16) * scan * flicker;
    // edge glow + bright scan line while materialising
    vec2 e = min(vUv, 1.0 - vUv);
    float edge = smoothstep(0.035, 0.0, min(e.x, e.y));
    col += uTint * edge * 0.9;
    col += uTint * smoothstep(0.03, 0.0, abs(vUv.y - uReveal)) * step(uReveal, 0.999) * 2.0;
    float a = (0.9 + edge * 0.1) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`;

function corners(w, h, color) {
  // sci-fi brackets around the screen
  const L = Math.min(w, h) * 0.16;
  const pad = 0.012;
  const x = w / 2 + pad;
  const y = h / 2 + pad;
  const pts = [];
  for (const [sx, sy] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    pts.push(sx * x, sy * y, 0, sx * (x - L), sy * y, 0);
    pts.push(sx * x, sy * y, 0, sx * x, sy * (y - L), 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    g,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
  );
}

export function createHologram(scene, { reduced, maxTex = 1024 }) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const uni = { uTime: { value: 0 }, uOpacity: { value: 0 } };

  // beam
  const beamH = 0.34;
  const beamGeo = new THREE.CylinderGeometry(0.075, 0.018, beamH, 40, 1, true);
  beamGeo.translate(0, beamH / 2, 0);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.ShaderMaterial({
      uniforms: { ...uni, uColor: { value: TEAL }, uColor2: { value: BLUE } },
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  beam.renderOrder = 20;
  group.add(beam);

  // ground ripples
  const ring = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.34),
    new THREE.ShaderMaterial({
      uniforms: { ...uni, uColor: { value: TEAL } },
      vertexShader: uvVert,
      fragmentShader: ringFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  ring.renderOrder = 19;
  group.add(ring);

  // rising sparks
  const N = reduced ? 0 : 70;
  const sp = new Float32Array(N * 3);
  const seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.05;
    sp.set([Math.cos(a) * r, Math.random() * beamH, Math.sin(a) * r], i * 3);
    seeds[i] = Math.random();
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sparkGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.ShaderMaterial({
      uniforms: { ...uni, uPr: { value: 1 }, uColor: { value: PINK } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uPr; varying float vA;
        void main() {
          vec3 p = position;
          float t = fract(aSeed + uTime * (0.25 + aSeed * 0.3));
          p.y = t * ${beamH.toFixed(3)};
          p.xz *= 1.0 + t * 0.8;
          vA = sin(t * 3.1416);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (2.0 + aSeed * 3.0) * uPr * (2.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.4), smoothstep(0.5, 0.0, d) * vA * uOpacity);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sparks.renderOrder = 21;
  group.add(sparks);

  // the screen (billboarded towards the camera)
  const screen = new THREE.Group();
  screen.position.y = beamH + 0.02;
  group.add(screen);
  // wide screens: the screen floats beside the beam, tied to it by a light line
  const tetherGeo = new THREE.BufferGeometry();
  tetherGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const tether = new THREE.Line(
    tetherGeo,
    new THREE.LineBasicMaterial({ color: TEAL, transparent: true, opacity: 0, depthTest: false, blending: THREE.AdditiveBlending }),
  );
  tether.renderOrder = 29;
  tether.frustumCulled = false;
  group.add(tether);
  const _v = new THREE.Vector3();
  const _r = new THREE.Vector3();
  const _u = new THREE.Vector3();
  const screenUni = {
    ...uni,
    uMap: { value: null },
    uHasMap: { value: 0 },
    uReveal: { value: 0 },
    uGlitch: { value: 0 },
    uTint: { value: TEAL.clone() },
    uCover: { value: new THREE.Vector2(1, 1) },
  };
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      uniforms: screenUni,
      vertexShader: uvVert,
      fragmentShader: screenFrag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  panel.renderOrder = 30;
  screen.add(panel);
  let frame = null;

  let video = null;
  let tex = null;
  let state = { on: false, t: 0, panelW: 0.2, panelH: 0.4, revealT: 0 };

  function disposeMedia() {
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video = null;
    }
    if (tex) tex.dispose();
    tex = null;
    screenUni.uMap.value = null;
    screenUni.uHasMap.value = 0;
  }

  function sizePanel(w, h) {
    state.lastW = w;
    state.lastH = h;
    const ar = w && h ? w / h : 9 / 16;
    // portrait clips stand tall, landscape ones spread out
    const k = state.k || 1;
    const H = (ar < 1 ? 0.44 : 0.3) * k;
    const W = Math.min(0.56 * k, H * ar);
    const realH = W / ar;
    state.panelW = W;
    state.panelH = Math.min(H, realH);
    panel.scale.set(state.panelW, state.panelH, 1);
    panel.position.y = state.panelH / 2;
    screenUni.uCover.value.set(1, 1);
    if (frame) {
      screen.remove(frame);
      frame.geometry.dispose();
    }
    frame = corners(state.panelW, state.panelH, TEAL);
    frame.position.y = state.panelH / 2;
    frame.renderOrder = 31;
    frame.material.depthTest = false;
    screen.add(frame);
  }

  /** Shows a media item; resolves when it has a first frame (or fails quietly). */
  function show(item) {
    disposeMedia();
    sizePanel(item.width, item.height);
    state.on = true;
    state.revealT = 0;
    group.visible = true;
    screenUni.uGlitch.value = 1;
    if (item.kind === "video") {
      video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.src = item.url;
      const t = new THREE.VideoTexture(video);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      tex = t;
      screenUni.uMap.value = t;
      const v = video;
      v.addEventListener(
        "loadeddata",
        () => {
          if (v !== video) return;
          screenUni.uHasMap.value = 1;
          if (v.videoWidth && v.videoHeight) sizePanel(v.videoWidth, v.videoHeight);
        },
        { once: true },
      );
      v.play().catch(() => {
        /* autoplay blocked: the poster still shows in the card */
      });
      if (item.poster && !reduced) {
        // the poster fills the screen until the first frame arrives
        new THREE.TextureLoader().load(item.poster, (p) => {
          if (v !== video || screenUni.uHasMap.value) {
            p.dispose();
            return;
          }
          p.colorSpace = THREE.SRGBColorSpace;
          screenUni.uMap.value = p;
          screenUni.uHasMap.value = 1;
          v.addEventListener(
            "loadeddata",
            () => {
              if (v === video) screenUni.uMap.value = t;
              p.dispose();
            },
            { once: true },
          );
        });
      }
    } else {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(item.url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        // keep big photos within the GPU budget on phones
        const img = t.image;
        if (img && (img.width > maxTex || img.height > maxTex)) {
          const s = maxTex / Math.max(img.width, img.height);
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          t.image = c;
          t.needsUpdate = true;
        }
        if (tex) tex.dispose();
        tex = t;
        screenUni.uMap.value = t;
        screenUni.uHasMap.value = 1;
        sizePanel(img.width, img.height);
      });
    }
  }

  function hide() {
    state.on = false;
  }

  function setPixelRatio(pr) {
    sparks.material.uniforms.uPr.value = pr;
  }

  /** Each frame: place the hologram at `point` (unit vector) with `camera` for billboarding. */
  function update(dt, time, point, camera) {
    const target = state.on ? 1 : 0;
    const o = uni.uOpacity;
    o.value += (target - o.value) * Math.min(1, dt * (state.on ? 4 : 7));
    if (!state.on && o.value < 0.01) {
      group.visible = false;
      disposeMedia();
      return;
    }
    uni.uTime.value = time;
    if (point) {
      group.position.copy(point).multiplyScalar(1.001);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), point.clone().normalize());
    }
    // the screen faces the camera, upright in screen space
    group.updateMatrixWorld();
    const parentQ = group.getWorldQuaternion(new THREE.Quaternion()).invert();
    screen.quaternion.copy(parentQ.clone().multiply(camera.quaternion));
    // side layout: slide the screen along the camera's right/up axes
    const side = state.side || 0;
    _r.set(1, 0, 0).applyQuaternion(camera.quaternion).applyQuaternion(parentQ);
    _u.set(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(parentQ);
    const comp = state.comp || 1;
    screen.scale.setScalar(comp);
    const offX = side ? (state.panelW / 2) * comp + side : 0;
    const offY = side ? -state.panelH * 0.42 * comp : 0;
    screen.position.set(0, beamH + 0.02, 0).addScaledVector(_r, offX).addScaledVector(_u, offY);
    if (side) {
      const pos = tetherGeo.attributes.position;
      // from the top of the beam to the screen's near edge
      _v.copy(screen.position).addScaledVector(_r, (-state.panelW / 2) * comp).addScaledVector(_u, state.panelH * 0.5 * comp);
      pos.setXYZ(0, 0, beamH, 0);
      pos.setXYZ(1, _v.x, _v.y, _v.z);
      pos.needsUpdate = true;
    }
    tether.material.opacity = side ? 0.7 * o.value * Math.min(1, screenUni.uReveal.value * 2) : 0;
    // materialise: scan from bottom to top, glitch settles
    state.revealT += dt;
    screenUni.uReveal.value = reduced ? 1 : Math.min(1, Math.max(0, (state.revealT - 0.25) / 0.6));
    screenUni.uGlitch.value = Math.max(0, screenUni.uGlitch.value - dt * 1.5);
    const grow = reduced ? 1 : Math.min(1, state.revealT / 0.35);
    beam.scale.set(1, grow, 1);
    if (frame) frame.material.opacity = 0.95 * o.value * (screenUni.uReveal.value > 0.05 ? 1 : 0);
    if (video && tex && video.readyState >= 2) tex.needsUpdate = true;
  }

  return {
    group,
    panel,
    show,
    hide,
    update,
    setPixelRatio,
    /** A short glitch, e.g. when switching media. */
    glitch() {
      screenUni.uGlitch.value = 1;
    },
    get video() {
      return video;
    },
    get active() {
      return state.on;
    },
    /** 0 = the screen stands on the beam; > 0 = it floats this far to the right of it. */
    setSide(gap) {
      state.side = gap;
    },
    /** Extra scale for the screen, e.g. to keep its size on screen while zooming. */
    setComp(k) {
      state.comp = k;
    },
    /** Bigger screens get a bigger screen (1 = phone size). */
    setScale(k) {
      if (Math.abs((state.k || 1) - k) < 0.01) return;
      state.k = k;
      if (state.lastW !== undefined) sizePanel(state.lastW, state.lastH);
    },
    /** The screen's rectangle in CSS pixels (null while hidden). */
    screenRect(camera, w, h) {
      if (!state.on || uni.uOpacity.value < 0.05) return null;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const v = new THREE.Vector3();
      for (const [cx, cy] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ]) {
        panel.localToWorld(v.set(cx, cy, 0)).project(camera);
        const x = (v.x * 0.5 + 0.5) * w;
        const y = (-v.y * 0.5 + 0.5) * h;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      return { left: x0, top: y0, right: x1, bottom: y1, ready: screenUni.uReveal.value > 0.6 };
    },
    /** World position of the top of the screen, for pinning HTML to it. */
    topWorld(out = new THREE.Vector3()) {
      return panel.localToWorld(out.set(0, 0.5, 0));
    },
  };
}
