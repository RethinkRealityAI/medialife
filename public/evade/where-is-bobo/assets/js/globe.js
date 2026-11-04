/**
 * The "Where is Bobo?" globe: a dotted planet (land dots light up in the
 * countries Bobo has been), glowing atmosphere, a starfield, hotspots for
 * every sighting, arcs tracing his trip in order, sparkles for live AR scans,
 * and Bobo himself walking on top while the globe turns under his feet.
 *
 * Vanilla three.js (r180, vendored), no post-processing: glows are additive
 * shaders so it holds 60 fps on mid-range phones. Pixel ratio adapts to the
 * frame rate. Rendering pauses while the tab is hidden.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { loadBobo } from "./bobo.js";
import { createHologram } from "./holo.js";

const D2R = Math.PI / 180;
const C = {
  teal: new THREE.Color("#3fe6e0"),
  blue: new THREE.Color("#19affe"),
  pink: new THREE.Color("#ff37ae"),
  gold: new THREE.Color("#f6c344"),
  dot: new THREE.Color("#2b4d5e"),
};

/** lat/lng → unit vector (lng 0 faces +z, the camera, at yaw 0). */
export function toVec(lat, lng, r = 1, out = new THREE.Vector3()) {
  const p = lat * D2R;
  const l = lng * D2R;
  return out.set(Math.cos(p) * Math.sin(l) * r, Math.sin(p) * r, Math.cos(p) * Math.cos(l) * r);
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;

/** Where Bobo stands (world space) and where a focused place is brought to. */
// Bobo stands on the top edge of the planet (in profile against space); a
// focused place is brought just to his right, where the beam goes up.
const ANCHOR = new THREE.Vector3(0, 1, 0.22).normalize();
const FOCUS = new THREE.Vector3(0.26, 1, 0.34).normalize();
/** Resting tilt: north pole towards the viewer, so the ground moves under Bobo as it spins. */
const REST_PITCH = 0.62;

/** yaw/pitch that bring local point p to world direction f (Rx(pitch)·Ry(yaw)). */
function orientFor(p, f, currentYaw = 0) {
  const A = Math.hypot(p.x, p.z);
  const alpha = Math.atan2(p.x, p.z);
  const s = A > 1e-4 ? clamp(f.x / A, -1, 1) : 0;
  let yaw = Math.asin(s) - alpha;
  yaw = currentYaw + wrap(yaw - currentYaw);
  const zp = A * Math.cos(alpha + yaw);
  const th1 = Math.atan2(p.y, zp);
  const th2 = Math.atan2(f.y, f.z);
  return { yaw, pitch: clamp(th1 - th2, -1.35, 1.35) };
}

/* ── shaders ──────────────────────────────────────────────────────────────── */

const bodyMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { uRim: { value: C.teal }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vL; varying vec3 vV;
      void main() {
        vL = position;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uRim; varying vec3 vN; varying vec3 vL; varying vec3 vV;
      float gridLine(float v, float step) {
        float x = v / step;
        float w = fwidth(x);
        return 1.0 - smoothstep(0.0, w * 1.4, abs(fract(x + 0.5) - 0.5));
      }
      void main() {
        float fres = 1.0 - max(dot(vN, vV), 0.0);
        vec3 base = mix(vec3(0.008, 0.02, 0.032), vec3(0.018, 0.06, 0.085), smoothstep(-0.3, 1.0, vN.y + vN.z * 0.3));
        float lat = asin(clamp(vL.y, -1.0, 1.0));
        float lng = atan(vL.x, vL.z);
        float g = max(gridLine(lat, 0.2618), gridLine(lng, 0.2618) * step(abs(vL.y), 0.97));
        vec3 col = base + uRim * g * 0.045 + uRim * pow(fres, 4.0) * 0.4;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

const atmoMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: C.blue.clone().lerp(C.teal, 0.4) } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
      void main() {
        // back faces: 0 at the outer edge of the halo, ~0.47 where it meets the globe
        float d = clamp(-dot(vN, vV), 0.0, 1.0);
        float i = pow(smoothstep(0.0, 0.5, d), 3.0) * 0.95;
        gl_FragColor = vec4(uColor, i);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

const dotsMat = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 11 },
      uPr: { value: 1 },
      uIntro: { value: 0 },
      uBase: { value: C.dot },
      uVisited: { value: C.teal },
      uHot: { value: C.gold },
      uFocus: { value: new THREE.Vector3(0, 0, 1) },
      uFocusOn: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aVisited; attribute float aHeat; attribute float aRand;
      uniform float uTime; uniform float uSize; uniform float uPr; uniform float uIntro;
      uniform vec3 uFocus; uniform float uFocusOn;
      varying float vV; varying float vHeat; varying float vFace; varying float vTw; varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * position);
        vFace = dot(n, normalize(-mv.xyz));
        vV = aVisited; vHeat = aHeat;
        vTw = 0.7 + 0.3 * sin(uTime * 2.2 + aRand * 40.0);
        // dots switch on from the focus point outward during the intro
        float d = acos(clamp(dot(normalize(position), vec3(0.0, 0.5, 0.86)), -1.0, 1.0));
        float on = smoothstep(d - 0.3, d, uIntro * 3.6);
        vF = uFocusOn * smoothstep(0.12, 0.0, acos(clamp(dot(normalize(position), uFocus), -1.0, 1.0)));
        float s = uSize * (1.0 + aVisited * 0.35 + aHeat * 0.9 + vF * 0.8) * on;
        gl_PointSize = s * uPr / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uVisited; uniform vec3 uHot;
      varying float vV; varying float vHeat; varying float vFace; varying float vTw; varying float vF;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        vec3 col = mix(uBase, uVisited * vTw, vV);
        col = mix(col, uHot, clamp(vHeat + vF, 0.0, 1.0) * 0.85);
        float edge = smoothstep(-0.05, 0.35, vFace);
        float a = smoothstep(0.5, 0.32, d) * (0.45 + 0.55 * edge) * (0.55 + vV * 0.45 + vHeat * 0.4);
        gl_FragColor = vec4(col * (1.0 + vHeat * 0.6), a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });

const arcMat = (delay) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uDelay: { value: delay },
      uA: { value: C.blue },
      uB: { value: C.pink },
      uHi: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying float vU;
      void main() { vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uReveal; uniform vec3 uA; uniform vec3 uB; uniform float uHi;
      varying float vU;
      void main() {
        if (vU > uReveal) discard;
        float dash = smoothstep(0.0, 0.25, fract(vU * 14.0 - uTime * 0.9)) * 0.55 + 0.45;
        float head = smoothstep(0.12, 0.0, abs(vU - uReveal)) * step(uReveal, 0.999);
        float ends = smoothstep(0.0, 0.06, vU) * smoothstep(1.0, 0.94, vU);
        vec3 col = mix(uA, uB, vU);
        float a = (0.32 + uHi * 0.4) * dash * ends + head;
        gl_FragColor = vec4(col * (1.0 + head * 2.0 + uHi * 0.5), a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

const rippleFrag = /* glsl */ `
  uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uSpeed;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    if (r > 1.0) discard;
    float t = fract(uTime * uSpeed);
    float a = smoothstep(0.1, 0.0, abs(r - t)) * (1.0 - t);
    gl_FragColor = vec4(uColor, a * uOpacity);
    #include <colorspace_fragment>
  }`;
const uvVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ── geography ────────────────────────────────────────────────────────────── */

async function loadGeo(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== "BOBO") throw new Error("bad globe.bin");
  const nC = dv.getUint16(6, true);
  const nDots = dv.getUint32(8, true);
  const nCoast = dv.getUint32(12, true);
  const nBorder = dv.getUint32(16, true);
  const codes = [];
  for (let i = 0; i < nC; i++)
    codes.push(String.fromCharCode(dv.getUint8(20 + i * 2), dv.getUint8(21 + i * 2)));
  let o = 20 + ((nC * 2 + 3) & ~3);
  const lat = new Int16Array(buf, o, nDots);
  o += nDots * 2;
  const lng = new Int16Array(buf, o, nDots);
  o += nDots * 2;
  const cc = new Uint8Array(buf, o, nDots);
  o += (nDots + 3) & ~3;
  const coast = new Int16Array(buf, o, nCoast * 2);
  o += nCoast * 4;
  const border = new Int16Array(buf, o, nBorder * 2);
  return { codes, lat, lng, cc, coast, border };
}

function linesGeometry(arr, r) {
  const n = arr.length / 2;
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    toVec(arr[i * 2] / 180, arr[i * 2 + 1] / 180, r, v);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  return g;
}

/* ── the globe ────────────────────────────────────────────────────────────── */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{labels:HTMLElement, reduced:boolean, mobile:boolean,
 *   onSelect:(key:string)=>void, onBobo:()=>void, onUserMove:()=>void, onArrive:(key:string)=>void,
 *   onHover?:(key:string|null)=>void}} opts
 */
export async function createGlobe(canvas, opts) {
  const { reduced, mobile } = opts;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: (window.devicePixelRatio || 1) < 2,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  let maxPr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
  let pr = maxPr;
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xbfefff, 0x1a1030, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.5, 3, 2.5);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 200);

  /* globe group */
  const globe = new THREE.Group();
  scene.add(globe);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), bodyMat()));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.13, 64, 48), atmoMat());
  scene.add(atmo);

  /* stars */
  {
    const n = mobile ? 900 : 1800;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.randomDirection().multiplyScalar(30 + Math.random() * 50);
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    var stars = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPr: { value: pr } },
        vertexShader: /* glsl */ `
          attribute float aSeed; uniform float uTime; uniform float uPr; varying float vA; varying float vS;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed * 2.0) + aSeed * 60.0));
            vS = aSeed;
            gl_PointSize = (1.0 + pow(aSeed, 6.0) * 3.5) * uPr;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          varying float vA; varying float vS;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            vec3 col = mix(vec3(0.75, 0.9, 1.0), vec3(1.0, 0.75, 0.9), step(0.85, vS));
            gl_FragColor = vec4(col, smoothstep(0.5, 0.0, d) * vA * 0.9);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    );
    scene.add(stars);
  }

  /* land dots, coastlines, borders */
  const geo = await loadGeo("/evade/where-is-bobo/assets/data/globe.bin");
  const nDots = geo.lat.length;
  const dotPos = new Float32Array(nDots * 3);
  const dotRand = new Float32Array(nDots);
  const dotVisited = new Float32Array(nDots);
  const dotHeat = new Float32Array(nDots);
  {
    const v = new THREE.Vector3();
    for (let i = 0; i < nDots; i++) {
      toVec(geo.lat[i] / 180, geo.lng[i] / 180, 1.004, v);
      dotPos.set([v.x, v.y, v.z], i * 3);
      dotRand[i] = Math.random();
    }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.BufferAttribute(dotPos, 3));
  dotGeo.setAttribute("aRand", new THREE.BufferAttribute(dotRand, 1));
  dotGeo.setAttribute("aVisited", new THREE.BufferAttribute(dotVisited, 1));
  dotGeo.setAttribute("aHeat", new THREE.BufferAttribute(dotHeat, 1));
  const dots = new THREE.Points(dotGeo, dotsMat());
  dots.renderOrder = 2;
  globe.add(dots);

  const coast = new THREE.LineSegments(
    linesGeometry(geo.coast, 1.0025),
    new THREE.LineBasicMaterial({ color: C.teal, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  const borders = new THREE.LineSegments(
    linesGeometry(geo.border, 1.0025),
    new THREE.LineBasicMaterial({ color: C.teal, transparent: true, opacity: 0.09, depthWrite: false }),
  );
  coast.renderOrder = borders.renderOrder = 1;
  globe.add(coast, borders);

  /* layers rebuilt from the feed */
  const glowTex = glowTexture();
  const hotspots = new Map(); // key → { place, local, group, hit, label, ripple, kind }
  const hitList = [];
  let arcs = [];
  let eventPoints = null;
  const pings = [];
  const pingGroup = new THREE.Group();
  globe.add(pingGroup);
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uColor: { value: C.pink },
          uSpeed: { value: 0 },
        },
        vertexShader: uvVert,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
          void main() {
            float r = length(vUv * 2.0 - 1.0);
            if (r > 1.0) discard;
            float a = smoothstep(0.12, 0.0, abs(r - uTime)) * (1.0 - uTime) + smoothstep(0.2, 0.0, r) * (1.0 - uTime);
            gl_FragColor = vec4(uColor, a * uOpacity);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    m.visible = false;
    m.renderOrder = 6;
    pingGroup.add(m);
    pings.push({ m, t: 1 });
  }

  /* Bobo */
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let bobo = null;
  const BOBO_H = 0.13;
  loadBobo({ loader, parent: scene, anchor: ANCHOR, height: BOBO_H, reduced })
    .then((b) => {
      bobo = b;
      hitList.push(b.hit);
    })
    .catch((e) => console.warn("Bobo didn't load", e));

  /* hologram */
  const holo = createHologram(scene, { reduced, maxTex: mobile ? 1024 : 2048 });

  /* ── state ──────────────────────────────────────────────────────────────── */
  const st = {
    yaw: -0.4,
    pitch: REST_PITCH,
    vYaw: 0,
    vPitch: 0,
    dragging: false,
    lastInput: -10,
    tween: null,
    focus: null, // key
    arrived: false,
    intro: 0,
    time: 0,
    // camera rig
    cam: { tx: 0, ty: 0.12, tz: 0, dist: 7, elev: 0.3, azim: 0 },
    goal: { tx: 0, ty: 0.12, tz: 0, dist: 3.6, elev: 0.3, azim: 0 },
    zoom: 1,
    shift: { x: 0, y: 0 },
    w: 1,
    h: 1,
    frameTimes: [],
  };
  const prevQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "XYZ");

  function overviewGoal() {
    const portrait = st.h > st.w * 1.1;
    const dist = (portrait ? 5.2 : st.w < 900 ? 4.3 : 3.9) * st.zoom;
    return { tx: 0, ty: portrait ? 0.12 : 0.1, tz: 0, dist, elev: 0.16, azim: 0 };
  }
  function focusGoal() {
    const portrait = st.h > st.w * 1.1;
    // frame Bobo, the beam and the screen above them, the planet's curve below
    return {
      tx: 0.12,
      ty: portrait ? 1.34 : 1.22,
      tz: 0.22,
      dist: (portrait ? 3.5 : 2.05) * clamp(st.zoom, 0.8, 1.3),
      elev: 0.12,
      azim: 0.06,
    };
  }

  function applyCamera() {
    const c = st.cam;
    const x = c.tx + Math.sin(c.azim) * Math.cos(c.elev) * c.dist;
    const y = c.ty + Math.sin(c.elev) * c.dist;
    const z = c.tz + Math.cos(c.azim) * Math.cos(c.elev) * c.dist;
    camera.position.set(x, y, z);
    camera.lookAt(c.tx, c.ty, c.tz);
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    st.w = Math.max(1, r.width);
    st.h = Math.max(1, r.height);
    renderer.setSize(st.w, st.h, false);
    camera.aspect = st.w / st.h;
    setView();
    if (!st.focus) Object.assign(st.goal, overviewGoal());
    else Object.assign(st.goal, focusGoal());
  }
  /** Moves the 3D centre by (x right, y up) pixels, so the globe sits in the space the UI leaves. */
  function setView() {
    const { x, y } = st.shift;
    if (x || y) {
      const a = Math.abs(x);
      const b = Math.abs(y);
      camera.setViewOffset(st.w + 2 * a, st.h + 2 * b, a - x, b + y, st.w, st.h);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  /* ── feed → layers ──────────────────────────────────────────────────────── */
  let feed = null;
  let latestKey = null;

  function clearLayers() {
    for (const h of hotspots.values()) {
      globe.remove(h.group);
      h.label?.remove();
    }
    hotspots.clear();
    hitList.length = 0;
    if (bobo) hitList.push(bobo.hit);
    for (const a of arcs) {
      globe.remove(a.mesh);
      a.mesh.geometry.dispose();
    }
    arcs = [];
    if (eventPoints) {
      globe.remove(eventPoints);
      eventPoints.geometry.dispose();
      eventPoints = null;
    }
  }

  function buildHotspot(p, isLatest) {
    const local = toVec(p.lat, p.lng, 1);
    const group = new THREE.Group();
    group.position.copy(local);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
    const color = isLatest ? C.gold : C.teal;
    const n = p.media.length;
    const h = 0.035 + Math.min(0.05, Math.log2(n + 1) * 0.014) + (isLatest ? 0.03 : 0);
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0022, h, 6, 1, true).translate(0, h / 2, 0),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    const head = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    head.scale.setScalar(isLatest ? 0.075 : 0.055);
    head.position.y = h;
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(isLatest ? 0.0085 : 0.0065, 12, 8),
      new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color("#fff"), 0.5), toneMapped: false }),
    );
    core.position.y = h;
    const ripple = new THREE.Mesh(
      new THREE.PlaneGeometry(0.11, 0.11),
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: Math.random() * 10 },
          uOpacity: { value: 0.9 },
          uColor: { value: color },
          uSpeed: { value: isLatest ? 0.7 : 0.45 },
        },
        vertexShader: uvVert,
        fragmentShader: rippleFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = 0.002;
    stick.renderOrder = ripple.renderOrder = head.renderOrder = 5;
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(mobile ? 0.065 : 0.05, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = h * 0.6;
    hit.userData.key = p.key;
    group.add(stick, head, core, ripple, hit);
    globe.add(group);
    hitList.push(hit);

    let label = null;
    if (opts.labels) {
      label = document.createElement("button");
      label.type = "button";
      label.className = `pin-label${isLatest ? " is-latest" : ""}`;
      label.tabIndex = -1;
      label.setAttribute("aria-hidden", "true");
      label.dataset.key = p.key;
      label.innerHTML = `${isLatest ? '<span class="pin-now">Bobo is here</span>' : ""}<span class="pin-city"></span>`;
      label.querySelector(".pin-city").textContent = p.city || p.country;
      label.addEventListener("click", () => opts.onSelect(p.key));
      opts.labels.appendChild(label);
    }
    hotspots.set(p.key, { place: p, local, group, hit, label, ripple, head, isLatest, top: h });
  }

  function buildArcs(journey) {
    const keys = journey.filter((k) => hotspots.has(k));
    for (let i = 1; i < keys.length; i++) {
      const a = hotspots.get(keys[i - 1]).local;
      const b = hotspots.get(keys[i]).local;
      const ang = a.angleTo(b);
      if (ang < 0.01) continue;
      const lift = 0.03 + 0.26 * (ang / Math.PI);
      const pts = [];
      const qa = new THREE.Quaternion();
      const axis = new THREE.Vector3().crossVectors(a, b).normalize();
      for (let k = 0; k <= 48; k++) {
        const t = k / 48;
        qa.setFromAxisAngle(axis, ang * t);
        pts.push(a.clone().applyQuaternion(qa).multiplyScalar(1.004 + Math.sin(Math.PI * t) * lift));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 64, mobile ? 0.0034 : 0.0028, 5, false),
        arcMat(i * 0.35),
      );
      mesh.renderOrder = 4;
      globe.add(mesh);
      arcs.push({ mesh, from: keys[i - 1], to: keys[i], curve });
    }
  }

  function buildEvents(places) {
    const ev = places.filter((p) => p.events > 0);
    if (!ev.length) return;
    const pos = new Float32Array(ev.length * 3);
    const size = new Float32Array(ev.length);
    const seed = new Float32Array(ev.length);
    const recent = new Float32Array(ev.length);
    const v = new THREE.Vector3();
    const now = Date.now();
    ev.forEach((p, i) => {
      toVec(p.lat, p.lng, 1.006, v);
      pos.set([v.x, v.y, v.z], i * 3);
      size[i] = 1 + Math.log10(p.events + 1) * 1.3;
      seed[i] = Math.random();
      const ago = p.lastSeen ? now - Date.parse(p.lastSeen) : Infinity;
      recent[i] = ago < 3600e3 ? 1 : ago < 86400e3 ? 0.5 : 0;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.setAttribute("aRecent", new THREE.BufferAttribute(recent, 1));
    eventPoints = new THREE.Points(
      g,
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uPr: { value: pr }, uA: { value: C.blue }, uB: { value: C.pink } },
        vertexShader: /* glsl */ `
          attribute float aSize; attribute float aSeed; attribute float aRecent;
          uniform float uTime; uniform float uPr; varying float vR; varying float vFace; varying float vTw;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vFace = dot(normalize(normalMatrix * position), normalize(-mv.xyz));
            vR = aRecent;
            vTw = 0.6 + 0.4 * sin(uTime * (2.0 + aRecent * 3.0) + aSeed * 50.0);
            gl_PointSize = aSize * 9.0 * uPr / -mv.z * (1.0 + aRecent * 0.4 * vTw);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uA; uniform vec3 uB; varying float vR; varying float vFace; varying float vTw;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            if (d > 0.5) discard;
            float core = smoothstep(0.18, 0.0, d);
            float halo = smoothstep(0.5, 0.0, d) * 0.5;
            vec3 col = mix(uA, uB, vR);
            gl_FragColor = vec4(col + core * 0.6, (core + halo) * vTw * smoothstep(-0.1, 0.3, vFace));
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    eventPoints.renderOrder = 3;
    globe.add(eventPoints);
  }

  function paintDots(f) {
    const media = new Set(f.places.filter((p) => p.media.length).map((p) => p.countryCode));
    const any = new Set(f.countries);
    const idx = new Map(geo.codes.map((c, i) => [c, i + 1]));
    const vis = new Uint8Array(geo.codes.length + 1);
    for (const c of any) if (idx.has(c)) vis[idx.get(c)] = media.has(c) ? 2 : 1;
    const hot = [...hotspots.values()].map((h) => h.local);
    const cosR = Math.cos(0.075);
    const v = new THREE.Vector3();
    for (let i = 0; i < nDots; i++) {
      const k = vis[geo.cc[i]];
      dotVisited[i] = k === 2 ? 1 : k === 1 ? 0.45 : 0;
      v.fromArray(dotPos, i * 3).normalize();
      let heat = 0;
      for (const h of hot) {
        const d = v.dot(h);
        if (d > cosR) heat = Math.max(heat, (d - cosR) / (1 - cosR));
      }
      dotHeat[i] = Math.min(1, heat * 1.4);
    }
    dotGeo.attributes.aVisited.needsUpdate = true;
    dotGeo.attributes.aHeat.needsUpdate = true;
  }

  function setFeed(f) {
    const firstTime = !feed;
    feed = f;
    const focusKey = st.focus;
    clearLayers();
    const mediaPlaces = f.places.filter((p) => p.media.length);
    latestKey = mediaPlaces[0]?.key ?? null;
    for (const p of mediaPlaces) buildHotspot(p, p.key === latestKey);
    buildArcs(f.journey);
    buildEvents(f.places);
    paintDots(f);
    if (firstTime && latestKey) {
      // start with the latest sighting turned towards the camera
      const o = orientFor(hotspots.get(latestKey).local, new THREE.Vector3(0.35, 0.25, 0.9).normalize(), st.yaw);
      st.yaw = o.yaw - 0.9;
      st.pitch = o.pitch;
      st.tween = { from: { yaw: st.yaw, pitch: st.pitch }, to: o, t: 0, dur: 2.6, key: null };
    }
    if (focusKey && !hotspots.has(focusKey)) clearFocus();
  }

  /* ── focus ──────────────────────────────────────────────────────────────── */
  function focus(key, { instant = false } = {}) {
    const h = hotspots.get(key);
    if (!h) return false;
    st.focus = key;
    st.arrived = false;
    const to = orientFor(h.local, FOCUS, st.yaw);
    const ang = Math.hypot(wrap(to.yaw - st.yaw), to.pitch - st.pitch);
    st.tween = {
      from: { yaw: st.yaw, pitch: st.pitch },
      to,
      t: 0,
      dur: instant || reduced ? 0.01 : clamp(0.7 + ang * 0.55, 0.8, 2.4),
      key,
    };
    st.vYaw = st.vPitch = 0;
    holo.hide();
    bobo?.setMode("travel");
    Object.assign(st.goal, focusGoal());
    for (const [k, x] of hotspots) x.label?.classList.toggle("is-focus", k === key);
    for (const a of arcs) a.mesh.material.uniforms.uHi.value = a.to === key || a.from === key ? 1 : 0;
    dots.material.uniforms.uFocus.value.copy(h.local);
    return true;
  }

  function showMedia(item) {
    if (!st.focus || !st.arrived) {
      st.pendingMedia = item;
      return;
    }
    holo.show(item);
  }

  function clearFocus() {
    if (!st.focus) return;
    st.focus = null;
    st.arrived = false;
    st.pendingMedia = null;
    st.tween = null;
    holo.hide();
    bobo?.setMode("auto");
    st.lastInput = st.time;
    Object.assign(st.goal, overviewGoal());
    for (const x of hotspots.values()) x.label?.classList.remove("is-focus");
    for (const a of arcs) a.mesh.material.uniforms.uHi.value = 0;
  }

  function ping(key) {
    const p = feed?.places.find((x) => x.key === key);
    if (!p) return;
    const slot = pings.find((x) => x.t >= 1) ?? pings[0];
    const v = toVec(p.lat, p.lng, 1.007);
    slot.m.position.copy(v);
    slot.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
    slot.m.visible = true;
    slot.t = 0;
  }

  /* ── input ──────────────────────────────────────────────────────────────── */
  const pointers = new Map();
  let down = null;
  let pinch = null;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(hitList, false);
    const camDir = camera.position.clone().normalize();
    for (const h of hits) {
      if (h.object.userData.bobo) return { bobo: true };
      const k = h.object.userData.key;
      const hs = hotspots.get(k);
      if (!hs) continue;
      const world = hs.local.clone().applyQuaternion(globe.quaternion);
      if (world.dot(camDir) > 0.05) return { key: k };
    }
    return null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.zoom };
      down = null;
      return;
    }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, lx: e.clientX, ly: e.clientY };
    st.dragging = true;
    st.vYaw = st.vPitch = 0;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.zoom = clamp((pinch.zoom * pinch.d) / Math.max(1, d), 0.6, 1.35);
      Object.assign(st.goal, st.focus ? focusGoal() : overviewGoal());
      return;
    }
    if (!down) {
      if (!mobile && e.pointerType === "mouse") {
        const p = pick(e.clientX, e.clientY);
        canvas.style.cursor = p ? "pointer" : "grab";
        opts.onHover?.(p?.key ?? null);
      }
      return;
    }
    const dx = e.clientX - down.lx;
    const dy = e.clientY - down.ly;
    down.lx = e.clientX;
    down.ly = e.clientY;
    down.moved += Math.abs(dx) + Math.abs(dy);
    if (down.moved > 6) {
      if (st.focus) {
        clearFocus();
        opts.onUserMove?.();
      }
      st.tween = null;
      const k = (st.cam.dist / 3.6) * (2.4 / Math.max(st.h, 300));
      const dYaw = dx * k * 1.35;
      const dPitch = dy * k * 1.35;
      st.yaw += dYaw;
      st.pitch = clamp(st.pitch + dPitch, -1.35, 1.35);
      const dt = Math.max(1 / 240, (performance.now() - (down.lt ?? down.t)) / 1000);
      down.lt = performance.now();
      st.vYaw = st.vYaw * 0.6 + (dYaw / dt) * 0.4;
      st.vPitch = st.vPitch * 0.6 + (dPitch / dt) * 0.4;
      st.lastInput = st.time;
      canvas.style.cursor = "grabbing";
    }
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!down) return;
    const tap = down.moved <= 6 && performance.now() - down.t < 600;
    down = null;
    st.dragging = false;
    canvas.style.cursor = "grab";
    if (tap) {
      st.vYaw = st.vPitch = 0;
      const p = pick(e.clientX, e.clientY);
      if (p?.key) opts.onSelect(p.key);
      else if (p?.bobo) {
        bobo?.react("Excited", st.time);
        opts.onBobo?.();
      }
    }
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      st.zoom = clamp(st.zoom * Math.exp(e.deltaY * 0.0012), 0.6, 1.35);
      Object.assign(st.goal, st.focus ? focusGoal() : overviewGoal());
    },
    { passive: false },
  );

  /* ── loop ───────────────────────────────────────────────────────────────── */
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const omega = new THREE.Vector3();
  const standInv = new THREE.Quaternion()
    .setFromUnitVectors(new THREE.Vector3(0, 1, 0), ANCHOR)
    .invert();
  let running = true;
  let raf = 0;
  let lastLabel = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 1 / 20);
    st.time += dt;
    const t = st.time;

    // intro
    st.intro = Math.min(1, st.intro + dt / (reduced ? 0.01 : 2.2));
    dots.material.uniforms.uIntro.value = ease(st.intro);

    // rotation
    const yaw0 = st.yaw;
    const pitch0 = st.pitch;
    if (st.tween) {
      const tw = st.tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = ease(tw.t);
      st.yaw = tw.from.yaw + wrap(tw.to.yaw - tw.from.yaw) * k;
      st.pitch = tw.from.pitch + (tw.to.pitch - tw.from.pitch) * k;
      if (tw.t >= 1) {
        st.tween = null;
        if (tw.key && tw.key === st.focus) {
          st.arrived = true;
          bobo?.react("Excited", t);
          setTimeout(() => {
            if (st.focus === tw.key) bobo?.setMode("watch");
          }, 900);
          if (st.pendingMedia) holo.show(st.pendingMedia);
          st.pendingMedia = null;
          opts.onArrive?.(tw.key);
        }
      }
    } else if (!st.dragging && !st.focus) {
      // inertia, then a gentle spin while nobody's touching it
      st.yaw += st.vYaw * dt;
      st.pitch = clamp(st.pitch + st.vPitch * dt, -1.35, 1.35);
      st.vYaw *= Math.pow(0.04, dt);
      st.vPitch *= Math.pow(0.04, dt);
      const idle = t - st.lastInput > 3.5 && !reduced;
      if (idle) {
        st.yaw += dt * 0.07;
        st.pitch += (REST_PITCH - st.pitch) * dt * 0.25;
      }
    }
    euler.set(st.pitch, st.yaw, 0);
    globe.quaternion.setFromEuler(euler);

    // the ground's velocity under Bobo → walk / run / rest
    if (bobo) {
      const dYaw = wrap(st.yaw - yaw0) / dt;
      const dPitch = (st.pitch - pitch0) / dt;
      tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), st.pitch);
      omega.set(0, 1, 0).applyQuaternion(tmpQ).multiplyScalar(dYaw);
      omega.x += dPitch;
      tmpV.crossVectors(omega, ANCHOR).applyQuaternion(standInv);
      bobo.update(dt, tmpV, t);
    }

    // camera
    const c = st.cam;
    const g = st.goal;
    const kc = 1 - Math.pow(0.02, dt);
    for (const f of ["tx", "ty", "tz", "dist", "elev", "azim"]) c[f] += (g[f] - c[f]) * kc;
    applyCamera();

    // shader clocks
    globe.children[0].material.uniforms.uTime.value = t;
    dots.material.uniforms.uTime.value = t;
    dots.material.uniforms.uFocusOn.value += ((st.focus && st.arrived ? 1 : 0) - dots.material.uniforms.uFocusOn.value) * kc;
    stars.material.uniforms.uTime.value = t;
    if (eventPoints) eventPoints.material.uniforms.uTime.value = t;
    for (const [i, a] of arcs.entries()) {
      const u = a.mesh.material.uniforms;
      u.uTime.value = t;
      u.uReveal.value = reduced ? 1 : clamp((st.intro * 2.2 - 0.6 - i * 0.18) / 0.9, 0, 1);
    }
    for (const h of hotspots.values()) {
      h.ripple.material.uniforms.uTime.value += dt;
      const s = (h.isLatest ? 0.075 : 0.055) * (1 + 0.12 * Math.sin(t * 3 + h.top * 50));
      h.head.scale.setScalar(st.focus === h.place.key ? s * 1.5 : s);
    }
    for (const p of pings) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 2.2);
      p.m.material.uniforms.uTime.value = p.t;
      p.m.material.uniforms.uOpacity.value = 1;
      if (p.t >= 1) p.m.visible = false;
    }

    // hologram at the focus point
    holo.update(dt, t, FOCUS, camera);

    renderer.render(scene, camera);

    // labels (HTML), ~30 fps is plenty
    if (opts.labels && t - lastLabel > 1 / 30) {
      lastLabel = t;
      placeLabels();
    }

    // adaptive resolution
    st.frameTimes.push(dt);
    if (st.frameTimes.length >= 90) {
      const avg = st.frameTimes.reduce((s, x) => s + x, 0) / st.frameTimes.length;
      st.frameTimes.length = 0;
      if (avg > 1 / 40 && pr > 1) setPr(Math.max(1, pr - 0.25));
      else if (avg < 1 / 58 && pr < maxPr) setPr(Math.min(maxPr, pr + 0.25));
    }
  }

  function setPr(v) {
    pr = v;
    renderer.setPixelRatio(pr);
    renderer.setSize(st.w, st.h, false);
    dots.material.uniforms.uPr.value = pr;
    stars.material.uniforms.uPr.value = pr;
    if (eventPoints) eventPoints.material.uniforms.uPr.value = pr;
    holo.setPixelRatio(pr);
  }

  const camDir = new THREE.Vector3();
  function placeLabels() {
    camDir.copy(camera.position).normalize();
    const showAll = !mobile || st.w > 700;
    // while the hologram stands on a pin, keep neighbours' labels off its beam
    let fx = null;
    let fy = 0;
    const fh = st.focus && holo.active && st.arrived ? hotspots.get(st.focus) : null;
    if (fh) {
      tmpV.copy(fh.local).multiplyScalar(1 + fh.top).applyQuaternion(globe.quaternion).project(camera);
      fx = (tmpV.x * 0.5 + 0.5) * st.w;
      fy = (-tmpV.y * 0.5 + 0.5) * st.h;
    }
    for (const h of hotspots.values()) {
      if (!h.label) continue;
      tmpV.copy(h.local).multiplyScalar(1 + h.top + 0.012).applyQuaternion(globe.quaternion);
      const facing = tmpV.clone().normalize().dot(camDir);
      const isFocus = st.focus === h.place.key;
      const visible =
        facing > 0.25 && (showAll || h.isLatest || isFocus) && !(isFocus && holo.active && st.arrived);
      h.label.classList.toggle("is-hidden", !visible);
      if (!visible) continue;
      tmpV.project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * st.w;
      const y = (-tmpV.y * 0.5 + 0.5) * st.h;
      if (fx !== null && Math.abs(x - fx) < 90 && y < fy + 40) {
        h.label.classList.add("is-hidden");
        continue;
      }
      h.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      h.label.style.opacity = String(clamp((facing - 0.25) * 4, 0, 1));
    }
  }

  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) clock.getDelta();
    const v = holo.video;
    if (v) running ? v.play().catch(() => {}) : v.pause();
  });
  window.addEventListener("resize", resize);
  resize();
  st.cam = { ...overviewGoal(), dist: overviewGoal().dist * (reduced ? 1 : 1.9) };
  Object.assign(st.goal, overviewGoal());
  frame();

  return {
    setFeed,
    focus,
    showMedia,
    clearFocus,
    ping,
    glitch: () => holo.glitch(),
    get video() {
      return holo.video;
    },
    get focused() {
      return st.focus;
    },
    /** Pixels the UI covers (bottom sheet, side panel), so the 3D centre moves into the free area. */
    setShift({ x = 0, y = 0 }) {
      st.shift = { x: Math.round(x), y: Math.round(y) };
      setView();
    },
    resize,
    /** Screen position of Bobo's head, for speech bubbles. */
    boboScreen() {
      const v = ANCHOR.clone().multiplyScalar(1 + BOBO_H * 1.15).project(camera);
      return { x: (v.x * 0.5 + 0.5) * st.w, y: (-v.y * 0.5 + 0.5) * st.h };
    },
    destroy() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
