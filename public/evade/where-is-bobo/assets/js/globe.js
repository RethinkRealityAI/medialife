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

import { loadBobo } from "./bobo.js?v=7";
import { createHologram } from "./holo.js?v=7";
import { createLandmarks } from "./landmarks.js?v=7";

const D2R = Math.PI / 180;
const C = {
  teal: new THREE.Color("#3fe6e0"),
  // EVADE yellow is the highlight; amber / orange stand in where blue and pink were
  blue: new THREE.Color("#ffb020"),
  pink: new THREE.Color("#ff8a1f"),
  sky: new THREE.Color("#19affe"),
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
const FOCUS_WIDE = new THREE.Vector3(0.52, 1, 0.3).normalize();
// phones: the beam stands closer to Bobo so both fit the narrow screen
const FOCUS_TALL = new THREE.Vector3(0.4, 1, 0.34).normalize();
const FOCUS = FOCUS_WIDE.clone();
/** Continents are raised this far above the ocean (globe radius 1). */
const LAND_H = 0.03;
const R_LAND = 1 + LAND_H;
const FOCUS_LAND = FOCUS.clone().multiplyScalar(R_LAND);
// where a landmark pops up: between Bobo and the beam, just behind the
// horizon, so it rises like a skyline without covering either of them
const LANDMARK = new THREE.Vector3(0.31, 1, -0.2).normalize();
let landmarkSize = 0.42;
function setFocusDir(portrait) {
  landmarkSize = portrait ? 0.32 : 0.42;
  FOCUS.copy(portrait ? FOCUS_TALL : FOCUS_WIDE);
  FOCUS_LAND.copy(FOCUS).multiplyScalar(R_LAND);
}
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
      uniform vec3 uRim; uniform float uTime; varying vec3 vN; varying vec3 vL; varying vec3 vV;
      float gridLine(float v, float step) {
        float x = v / step;
        float w = fwidth(x);
        return 1.0 - smoothstep(0.0, w * 1.4, abs(fract(x + 0.5) - 0.5));
      }
      void main() {
        float fres = 1.0 - max(dot(vN, vV), 0.0);
        // cartoon ocean: two-tone light bands, soft wave stripes, a bright rim
        float l = dot(vN, normalize(vec3(0.35, 0.8, 0.55)));
        float band = smoothstep(-0.05, 0.05, l) * 0.55 + smoothstep(0.55, 0.65, l) * 0.45;
        vec3 deep = vec3(0.012, 0.05, 0.14);
        vec3 shallow = vec3(0.03, 0.15, 0.34);
        vec3 base = mix(deep, shallow, band);
        float lat = asin(clamp(vL.y, -1.0, 1.0));
        float lng = atan(vL.x, vL.z);
        float wave = sin(lat * 60.0 + sin(lng * 9.0 + uTime * 0.4) * 1.6 + uTime * 0.6);
        base += vec3(0.05, 0.14, 0.2) * smoothstep(0.92, 1.0, wave) * 0.35;
        float g = max(gridLine(lat, 0.2618), gridLine(lng, 0.2618) * step(abs(vL.y), 0.97));
        vec3 col = base + uRim * g * 0.035 + uRim * pow(fres, 3.0) * 0.55;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });

const atmoMat = () =>
  new THREE.ShaderMaterial({
    uniforms: { uColor: { value: C.sky.clone().lerp(C.teal, 0.4) } },
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
      uBase: { value: new THREE.Color("#fff4c2") },
      uVisited: { value: new THREE.Color("#fff4c2") },
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
        float a = smoothstep(0.5, 0.32, d) * (0.45 + 0.55 * edge) * clamp(vV * 0.35 + vHeat + vF, 0.0, 1.0);
        gl_FragColor = vec4(col * (1.0 + vHeat * 0.6), a);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
  });

/** Cartoon land: flat toon bands, a colour per country, snow near the poles,
 * dark cliff walls, visited countries warmed to gold. */
const landMat = (stateTex) =>
  new THREE.ShaderMaterial({
    uniforms: {
      uState: { value: stateTex },
      uIntro: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aCc; attribute float aWall;
      uniform sampler2D uState; uniform float uIntro;
      varying vec3 vN; varying vec3 vL; varying float vWall; varying vec4 vState; varying float vCc;
      void main() {
        vL = normalize(position);
        vWall = aWall;
        vCc = aCc;
        vState = texture2D(uState, vec2((aCc + 0.5) / 256.0, 0.5));
        // the land rises out of the sea during the intro
        float d = acos(clamp(dot(vL, vec3(0.0, 0.5, 0.86)), -1.0, 1.0));
        float on = smoothstep(d - 0.6, d, uIntro * 3.8);
        vec3 p = vL * mix(0.985, length(position), on);
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vL; varying float vWall; varying vec4 vState; varying float vCc;
      float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
      void main() {
        vec3 nn = normalize(vN);
        if (vWall > 0.01 && !gl_FrontFacing) nn = -nn;
        float l = dot(nn, normalize(vec3(0.35, 0.8, 0.55)));
        float band = 0.55 + smoothstep(-0.1, 0.0, l) * 0.25 + smoothstep(0.5, 0.6, l) * 0.2;
        // a patchwork of greens and teals, one per country
        float h = hash(vCc + 1.0);
        vec3 green = mix(vec3(0.26, 0.78, 0.52), vec3(0.2, 0.74, 0.7), h);
        green = mix(green, vec3(0.55, 0.82, 0.42), step(0.72, h) * 0.6);
        float lat = abs(vL.y);
        vec3 top = mix(green, vec3(0.93, 0.97, 1.0), smoothstep(0.84, 0.9, lat));
        // visited: gold; with media: gold + a little pink; focus: brighter
        top = mix(top, vec3(1.0, 0.72, 0.16), vState.r * 0.85);
        top = mix(top, vec3(1.0, 0.45, 0.62), vState.g * 0.25);
        top *= 1.0 + vState.b * 0.35;
        vec3 wall = mix(vec3(0.05, 0.25, 0.3), vec3(0.42, 0.3, 0.12), vState.r * 0.6);
        vec3 col = mix(top, wall, vWall) * band;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
  });

async function loadLand(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== "BLND") throw new Error("bad land.bin");
  const nV = dv.getUint32(8, true);
  const nI = dv.getUint32(12, true);
  const nE = dv.getUint32(16, true);
  const pad4 = (n) => (n + 3) & ~3;
  let o = 20;
  const ll = new Int16Array(buf, o, nV * 2);
  o += nV * 4;
  const cc = new Uint8Array(buf, o, nV);
  o += pad4(nV);
  const index = new Uint16Array(buf, o, nI);
  o += pad4(nI * 2);
  const edges = new Int16Array(buf, o, nE * 4);
  o += nE * 8;
  const ecc = new Uint8Array(buf, o, nE);

  // surface: shared vertices at R_LAND; walls: a quad per edge from below the sea up
  const nWallV = nE * 4;
  const pos = new Float32Array((nV + nWallV) * 3);
  const nor = new Float32Array((nV + nWallV) * 3);
  const aCc = new Float32Array(nV + nWallV);
  const aWall = new Float32Array(nV + nWallV);
  const idx = new Uint32Array(nI + nE * 6);
  const v = new THREE.Vector3();
  for (let i = 0; i < nV; i++) {
    toVec(ll[i * 2] / 180, ll[i * 2 + 1] / 180, 1, v);
    nor.set([v.x, v.y, v.z], i * 3);
    pos.set([v.x * R_LAND, v.y * R_LAND, v.z * R_LAND], i * 3);
    aCc[i] = cc[i];
  }
  idx.set(index);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = new THREE.Vector3();
  const R0 = 0.992;
  for (let e = 0; e < nE; e++) {
    toVec(edges[e * 4] / 180, edges[e * 4 + 1] / 180, 1, a);
    toVec(edges[e * 4 + 2] / 180, edges[e * 4 + 3] / 180, 1, b);
    n.subVectors(b, a).cross(a).normalize(); // outward, sideways
    const base = nV + e * 4;
    const quad = [a.clone().multiplyScalar(R0), b.clone().multiplyScalar(R0), b.clone().multiplyScalar(R_LAND), a.clone().multiplyScalar(R_LAND)];
    quad.forEach((q, k) => {
      pos.set([q.x, q.y, q.z], (base + k) * 3);
      nor.set([n.x, n.y, n.z], (base + k) * 3);
      aCc[base + k] = ecc[e];
      aWall[base + k] = k < 2 ? 1 : 0.55;
    });
    // both windings, so the wall shows whichever way the ring ran
    idx.set([base, base + 1, base + 2, base, base + 2, base + 3], nI + e * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("aCc", new THREE.BufferAttribute(aCc, 1));
  g.setAttribute("aWall", new THREE.BufferAttribute(aWall, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

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
  renderer.toneMappingExposure = 1.0;
  let maxPr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
  let pr = maxPr;
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // softer, warmer light so Bobo's yellow fur reads as yellow, not blown-out white
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x2a1c10, 0.8));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.15);
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
  const geo = await loadGeo("/evade/where-is-bobo/assets/data/globe.bin?v=4");
  const nDots = geo.lat.length;
  const dotPos = new Float32Array(nDots * 3);
  const dotRand = new Float32Array(nDots);
  const dotVisited = new Float32Array(nDots);
  const dotHeat = new Float32Array(nDots);
  {
    const v = new THREE.Vector3();
    for (let i = 0; i < nDots; i++) {
      toVec(geo.lat[i] / 180, geo.lng[i] / 180, R_LAND + 0.003, v);
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

  // cartoon ink: dark outlines along the cliff tops and the borders
  const coast = new THREE.LineSegments(
    linesGeometry(geo.coast, R_LAND + 0.001),
    new THREE.LineBasicMaterial({ color: 0x06202c, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  const borders = new THREE.LineSegments(
    linesGeometry(geo.border, R_LAND + 0.001),
    new THREE.LineBasicMaterial({ color: 0x06202c, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  coast.renderOrder = borders.renderOrder = 1;
  globe.add(coast, borders);

  // raised continents (state texture: r visited, g has media, b focus; one texel per country)
  const landState = new Uint8Array(256 * 4);
  const landTex = new THREE.DataTexture(landState, 256, 1, THREE.RGBAFormat);
  landTex.needsUpdate = true;
  const land = new THREE.Mesh(await loadLand("/evade/where-is-bobo/assets/data/land.bin?v=4"), landMat(landTex));
  globe.add(land);
  const ccIndex = new Map(geo.codes.map((c, i) => [c, i + 1]));
  function paintLand(f, focusCc) {
    landState.fill(0);
    const media = new Set(f.places.filter((p) => p.media.length).map((p) => p.countryCode));
    for (const c of f.countries) {
      const i = ccIndex.get(c);
      if (!i) continue;
      landState[i * 4] = 255;
      landState[i * 4 + 1] = media.has(c) ? 255 : 0;
    }
    const fi = focusCc && ccIndex.get(focusCc);
    if (fi) landState[fi * 4 + 2] = 255;
    landTex.needsUpdate = true;
  }

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
  const BOBO_H = 0.3;
  loadBobo({ loader, parent: scene, anchor: ANCHOR.clone().multiplyScalar(R_LAND), height: BOBO_H, reduced })
    .then((b) => {
      bobo = b;
      hitList.push(b.hit);
    })
    .catch((e) => console.warn("Bobo didn't load", e));

  /* hologram */
  const holo = createHologram(scene, { reduced, maxTex: mobile ? 1024 : 2048 });
  const landmarks = createLandmarks(globe, { reduced });
  function showItem(item) {
    holo.show(item);
    const city = (st.focus && hotspots.get(st.focus)?.place.city) || "";
    if (landmarks.show(item.place, city, LANDMARK, R_LAND - 0.004, landmarkSize, camera))
      setTimeout(() => opts.onLandmark?.(), 120);
  }

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
    pan: { x: 0, y: 0 }, // right-drag / two-finger drag moves the planet on screen
    w: 1,
    h: 1,
    frameTimes: [],
  };
  const prevQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, "XYZ");

  function overviewGoal() {
    const portrait = st.h > st.w * 1.1;
    // The hero shot: Bobo big on the top of the planet with the newest pin beside
    // him. Wide screens crop the bottom of the globe; scroll / pinch to zoom out.
    if (portrait) return { tx: 0.12, ty: 0.86, tz: 0.18, dist: 3.9 * st.zoom, elev: 0.12, azim: 0.04 };
    const narrow = st.w < 900;
    return { tx: 0.06, ty: narrow ? 0.9 : 0.84, tz: 0.18, dist: (narrow ? 2.9 : 2.45) * st.zoom, elev: 0.13, azim: 0.05 };
  }
  function focusGoal() {
    const portrait = st.h > st.w * 1.1;
    // frame Bobo, the beam and the screen above them, the planet's curve below
    if (st.sideLayout)
      // the screen floats right of the pin and the report docks right of it:
      // planet high in the frame, everything at Bobo's eye level
      return { tx: st.w < 1100 ? 0.5 : st.w < 1700 ? 0.36 : 0.42, ty: 0.98, tz: 0.22, dist: 2.45 * clamp(st.zoom, 0.8, 1.6), elev: 0.12, azim: 0.06 };
    return {
      tx: portrait ? 0.2 : st.w < 1700 ? 0.0 : 0.14,
      ty: portrait ? 1.36 : 1.22,
      tz: 0.22,
      dist: (portrait ? 4.6 : 2.2) * clamp(st.zoom, 0.8, 1.6),
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
    setFocusDir(st.h > st.w * 1.1);
    // big screens: a big screen (video about half the window's height)
    const sideLayout = st.w >= 720 && st.w > st.h * 1.1;
    holo.setScale(sideLayout ? 1.7 : st.h > st.w * 1.1 ? 1 : 1.15);
    holo.setSide(sideLayout ? 0.12 : 0);
    st.sideLayout = sideLayout;
    setView();
    if (!st.focus) Object.assign(st.goal, overviewGoal());
    else Object.assign(st.goal, focusGoal());
  }
  /** Moves the 3D centre by (x right, y up) pixels, so the globe sits in the space the UI leaves. */
  function setView() {
    // insets (st.shift) frame the scene around the UI; panning (st.pan) slides
    // the view without zooming it
    const sx = st.shift.x;
    const sy = st.shift.y;
    const px = st.pan.x;
    const py = st.pan.y;
    if (sx || sy || px || py) {
      const a = Math.abs(sx);
      const b = Math.abs(sy);
      camera.setViewOffset(st.w + 2 * a, st.h + 2 * b, a - sx - px, b + sy + py, st.w, st.h);
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
    group.position.copy(local).multiplyScalar(R_LAND);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
    // in review: a clip the team hasn't checked (pink); yours plays for you
    const mine = p.media.some((m) => m.mine);
    const review = p.media.every((m) => m.review);
    const color = isLatest ? C.gold : review ? C.pink : C.teal;
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
      label.className = `pin-label${isLatest ? " is-latest" : ""}${review ? " is-review" : ""}`;
      label.tabIndex = -1;
      label.setAttribute("aria-hidden", "true");
      label.dataset.key = p.key;
      const chip = mine
        ? '<span class="pin-now pin-mine">Your clip</span>'
        : isLatest
          ? `<span class="pin-now">${review ? "Just landed" : "Bobo is here"}</span>`
          : review
            ? '<span class="pin-now pin-review">In review</span>'
            : "";
      label.innerHTML = `${chip}<span class="pin-city"></span>`;
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
        pts.push(a.clone().applyQuaternion(qa).multiplyScalar(R_LAND + 0.004 + Math.sin(Math.PI * t) * lift));
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
      toVec(p.lat, p.lng, R_LAND + 0.006, v);
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
    paintLand(f, focusKey && hotspots.get(focusKey)?.place.countryCode);
    if (firstTime && latestKey) {
      // start with the latest sighting turned towards the camera
      const o = orientFor(hotspots.get(latestKey).local, FOCUS, st.yaw);
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
    st.panBack = true; // a sighting always frames itself: glide any pan back
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
    landmarks.hide();
    bobo?.setMode("travel");
    Object.assign(st.goal, focusGoal());
    for (const [k, x] of hotspots) x.label?.classList.toggle("is-focus", k === key);
    for (const a of arcs) a.mesh.material.uniforms.uHi.value = a.to === key || a.from === key ? 1 : 0;
    dots.material.uniforms.uFocus.value.copy(h.local);
    paintLand(feed, h.place.countryCode);
    return true;
  }

  function showMedia(item) {
    if (!st.focus || !st.arrived) {
      st.pendingMedia = item;
      return;
    }
    showItem(item);
  }

  function clearFocus() {
    if (!st.focus) return;
    st.focus = null;
    st.arrived = false;
    st.pendingMedia = null;
    st.tween = null;
    holo.hide();
    landmarks.hide();
    bobo?.setMode("auto");
    st.lastInput = st.time;
    Object.assign(st.goal, overviewGoal());
    for (const x of hotspots.values()) x.label?.classList.remove("is-focus");
    for (const a of arcs) a.mesh.material.uniforms.uHi.value = 0;
    if (feed) paintLand(feed, null);
  }

  function ping(key) {
    const p = feed?.places.find((x) => x.key === key);
    if (!p) return;
    const slot = pings.find((x) => x.t >= 1) ?? pings[0];
    const v = toVec(p.lat, p.lng, R_LAND + 0.007);
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
    const camDir = camera.position.clone().normalize();
    // a beam that's still standing (or just landed) counts as its pin
    for (const b of beams) {
      if (b.t < 0 || !b.key || !hotspots.has(b.key)) continue;
      if (!ray.intersectObject(b.hitCol, false).length) continue;
      const world = hotspots.get(b.key).local.clone().applyQuaternion(globe.quaternion);
      if (world.dot(camDir) > -0.1) return { key: b.key };
    }
    const hits = ray.intersectObjects(hitList, false);
    for (const h of hits) {
      if (h.object.userData.bobo) return { bobo: true };
      const k = h.object.userData.key;
      const hs = hotspots.get(k);
      if (!hs) continue;
      const world = hs.local.clone().applyQuaternion(globe.quaternion);
      if (world.dot(camDir) > 0.05) return { key: k };
    }
    // forgiving taps: the nearest pin within a finger's reach of the tap
    const px = x - r.left;
    const py = y - r.top;
    const reach = mobile ? 34 : 26;
    let best = null;
    let bestD = reach * reach;
    const v = new THREE.Vector3();
    for (const [k, hs] of hotspots) {
      v.copy(hs.local).applyQuaternion(globe.quaternion);
      if (v.dot(camDir) < 0.15) continue;
      v.copy(hs.local).multiplyScalar(R_LAND + hs.top).applyQuaternion(globe.quaternion).project(camera);
      const dx = (v.x * 0.5 + 0.5) * r.width - px;
      const dy = (-v.y * 0.5 + 0.5) * r.height - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best ? { key: best } : null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: st.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      st.touched = true;
      down = null;
      return;
    }
    down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, lx: e.clientX, ly: e.clientY };
    down.pan = e.button === 2 || e.button === 1 || e.shiftKey;
    st.dragging = !down.pan;
    st.touched = true;
    st.vYaw = st.vPitch = 0;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      st.zoom = clamp((pinch.zoom * pinch.d) / Math.max(1, d), 0.75, 2.3);
      Object.assign(st.goal, st.focus ? focusGoal() : overviewGoal());
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      panBy(mx - pinch.mx, my - pinch.my);
      pinch.mx = mx;
      pinch.my = my;
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
    if (down.pan) {
      panBy(dx, dy);
      canvas.style.cursor = "move";
      return;
    }
    if (down.moved > 6) {
      if (st.summon && !st.tween) endSummon();
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
    const tap = !down.pan && down.moved <= 6 && performance.now() - down.t < 600;
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
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  /** Slides the planet across the screen (kept within reach so it can't be lost). */
  function panBy(dx, dy) {
    st.panBack = false;
    st.pan.x = clamp(st.pan.x + dx, -st.w * 0.45, st.w * 0.45);
    st.pan.y = clamp(st.pan.y - dy, -st.h * 0.45, st.h * 0.45);
    setView();
  }
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      st.zoom = clamp(st.zoom * Math.exp(e.deltaY * 0.0012), 0.75, 2.3);
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
    land.material.uniforms.uIntro.value = ease(st.intro);

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
        if (tw.summon) summonArrived();
        if (tw.key && tw.key === st.focus) {
          st.arrived = true;
          bobo?.react("Excited", t);
          setTimeout(() => {
            if (st.focus === tw.key) bobo?.setMode("watch");
          }, 900);
          if (st.pendingMedia) showItem(st.pendingMedia);
          st.pendingMedia = null;
          opts.onArrive?.(tw.key);
        }
      }
    } else if (!st.dragging && !st.focus && !st.summon) {
      // inertia, then a gentle spin while nobody's touching it
      st.yaw += st.vYaw * dt;
      st.pitch = clamp(st.pitch + st.vPitch * dt, -1.35, 1.35);
      st.vYaw *= Math.pow(0.04, dt);
      st.vPitch *= Math.pow(0.04, dt);
      const idle = !st.touched && t - st.lastInput > 3.5 && !reduced;
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
      // a pin that just beamed in waits underground, then springs up (easeOutBack)
      if (h.grow !== undefined && h.grow < 1) {
        const b = beams.find((x) => x.key === h.place.key && x.t >= 0);
        if (b && b.t < IMPACT) h.group.scale.setScalar(1e-3);
        else {
          h.grow = Math.min(1, h.grow + dt / 0.6);
          const g = h.grow - 1;
          h.group.scale.setScalar(Math.max(1e-3, 1 + 3.2 * g * g * g + 2.2 * g * g));
        }
      }
    }
    for (const p of pings) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / 2.2);
      p.m.material.uniforms.uTime.value = p.t;
      p.m.material.uniforms.uOpacity.value = 1;
      if (p.t >= 1) p.m.visible = false;
    }

    // hologram at the focus point
    if (st.panBack && (st.pan.x || st.pan.y)) {
      const k = Math.exp(-dt * 6);
      st.pan.x = Math.abs(st.pan.x) < 0.5 ? 0 : st.pan.x * k;
      st.pan.y = Math.abs(st.pan.y) < 0.5 ? 0 : st.pan.y * k;
      setView();
    } else st.panBack = false;
    // side layout: the screen keeps its size on screen however far you zoom
    holo.setComp(st.sideLayout ? clamp(st.cam.dist / 2.45, 0.45, 1.4) : 1);
    holo.update(dt, t, FOCUS_LAND, camera);
    opts.onHoloRect?.(holo.screenRect(camera, st.w, st.h));
    landmarks.update(dt, t);
    updateSummon(dt, t);
    updateBeams(dt, t);

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
      tmpV.copy(fh.local).multiplyScalar(R_LAND + fh.top).applyQuaternion(globe.quaternion).project(camera);
      fx = (tmpV.x * 0.5 + 0.5) * st.w;
      fy = (-tmpV.y * 0.5 + 0.5) * st.h;
    }
    const placed = []; // labels already shown this pass (newest sightings first)
    for (const h of hotspots.values()) {
      if (!h.label) continue;
      tmpV.copy(h.local).multiplyScalar(R_LAND + h.top + 0.012).applyQuaternion(globe.quaternion);
      const facing = tmpV.clone().normalize().dot(camDir);
      const isFocus = st.focus === h.place.key;
      // labels right where Bobo was summoned would sit on top of him
      const underBobo = st.summon && h.local.angleTo(st.summon.local) < 0.12;
      const visible =
        facing > 0.25 &&
        !underBobo &&
        (showAll || h.isLatest || isFocus) &&
        !(isFocus && holo.active && st.arrived);
      h.label.classList.toggle("is-hidden", !visible);
      if (!visible) continue;
      tmpV.project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * st.w;
      const y = (-tmpV.y * 0.5 + 0.5) * st.h;
      if (fx !== null && Math.abs(x - fx) < 90 && y < fy + 40) {
        h.label.classList.add("is-hidden");
        continue;
      }
      // neighbours (San Francisco and San Jose) would overlap: the newer one wins
      if (placed.some((q) => Math.abs(q[0] - x) < 95 && Math.abs(q[1] - y) < (h.isLatest ? 0 : 30))) {
        h.label.classList.add("is-hidden");
        continue;
      }
      placed.push([x, y]);
      h.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      h.label.style.opacity = String(clamp((facing - 0.25) * 4, 0, 1));
    }
  }

  /* ── beam-in: a new clip arriving from space ────────────────────────────── */
  // A comet of light falls onto the city, hits the ground with a flash and a
  // shockwave, sparks fly up, the pin springs out of the ground, and the beam
  // lingers for a moment before it fades. Pooled: a few can land at once.
  const beamColMat = () =>
    new THREE.ShaderMaterial({
      uniforms: {
        uHead: { value: 1 },
        uHold: { value: 0 },
        uTime: { value: 0 },
        uWide: { value: 0 },
        uA: { value: C.gold },
        uB: { value: C.pink },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying float vF;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uHead; uniform float uHold; uniform float uTime; uniform float uWide;
        uniform vec3 uA; uniform vec3 uB; varying vec2 vUv; varying float vF;
        void main() {
          float y = vUv.y;
          float lit = step(uHead, y);
          float trail = exp(-(y - uHead) * 3.2) * lit;
          float head = smoothstep(0.07, 0.0, abs(y - uHead)) * (1.0 - uHold);
          float hold = uHold * pow(1.0 - y, 0.9);
          float bands = 0.72 + 0.28 * sin(y * 70.0 + uTime * 16.0);
          float core = pow(vF, mix(2.6, 1.2, uWide));
          float a = (trail * 0.8 + hold) * bands * core + head * core * 2.2;
          vec3 col = mix(uA, uB, clamp(y * 1.4, 0.0, 1.0)) * (1.4 + head * 2.5);
          gl_FragColor = vec4(col, a * mix(1.0, 0.35, uWide));
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  const shockFrag = /* glsl */ `
    uniform float uR; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      if (r > 1.0) discard;
      float ring = smoothstep(0.09, 0.0, abs(r - uR)) + smoothstep(0.35, 0.0, abs(r - uR)) * 0.35;
      float fill = smoothstep(uR, 0.0, r) * 0.18;
      gl_FragColor = vec4(uColor * 1.5, (ring + fill) * uOpacity);
      #include <colorspace_fragment>
    }`;
  const BEAM_H = 1.5;
  const SPARKS = mobile ? 26 : 44;
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, BEAM_H, 16, 1, true).translate(0, BEAM_H / 2, 0), beamColMat());
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, BEAM_H, 16, 1, true).translate(0, BEAM_H / 2, 0), beamColMat());
    glow.material.uniforms.uWide.value = 1;
    const shock = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.5),
      new THREE.ShaderMaterial({
        uniforms: { uR: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: C.gold } },
        vertexShader: uvVert,
        fragmentShader: shockFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    shock.rotation.x = -Math.PI / 2;
    shock.position.y = 0.004;
    const flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, color: C.gold.clone().lerp(new THREE.Color("#fff"), 0.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    flash.position.y = 0.01;
    const sp = new Float32Array(SPARKS * 3);
    const sv = new Float32Array(SPARKS * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const sparks = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ map: glowTex, color: 0xffe9a8, size: mobile ? 0.03 : 0.024, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    );
    core.renderOrder = glow.renderOrder = 7;
    shock.renderOrder = flash.renderOrder = sparks.renderOrder = 8;
    // a fat invisible column so tapping anywhere on a fresh beam opens that clip
    const hitCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, BEAM_H * 0.7, 8, 1).translate(0, BEAM_H * 0.35, 0),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    g.add(glow, core, shock, flash, sparks, hitCol);
    g.visible = false;
    globe.add(g);
    beams.push({ g, core, glow, shock, flash, sparks, sp, sv, hitCol, t: -1, key: null, hit: false });
  }
  const IMPACT = 0.85;
  const BEAM_END = 3.4;
  /** Beams a new clip onto `key`'s pin. Returns false when that place isn't on the globe. */
  function beam(key) {
    const p = feed?.places.find((x) => x.key === key);
    if (!p) return false;
    const b = beams.find((x) => x.t < 0) ?? beams.reduce((a, x) => (x.t > a.t ? x : a));
    const local = toVec(p.lat, p.lng, 1);
    b.g.position.copy(local).multiplyScalar(R_LAND);
    b.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
    b.g.visible = true;
    b.t = reduced ? IMPACT : 0;
    b.key = key;
    b.hit = false;
    b.sparks.visible = false;
    const h = hotspots.get(key);
    if (h) h.grow = reduced ? 1 : 0;
    return true;
  }
  function updateBeams(dt, t) {
    for (const b of beams) {
      if (b.t < 0) continue;
      b.t += dt;
      const k = b.t;
      const fall = clamp(k / IMPACT, 0, 1);
      const head = 1 - fall * fall; // speeds up as it falls
      const hold = k < IMPACT ? 0 : clamp(1 - (k - IMPACT - 1.0) / (BEAM_END - IMPACT - 1.0), 0, 1);
      for (const m of [b.core, b.glow]) {
        const u = m.material.uniforms;
        u.uHead.value = head;
        u.uHold.value = k < IMPACT ? 0 : hold;
        u.uTime.value = t;
      }
      if (k >= IMPACT && !b.hit) {
        b.hit = true;
        b.sparks.visible = true;
        const v = new THREE.Vector3();
        for (let i = 0; i < SPARKS; i++) {
          b.sp.set([0, 0.01, 0], i * 3);
          const a = Math.random() * Math.PI * 2;
          const r = 0.15 + Math.random() * 0.35;
          v.set(Math.cos(a) * r, 0.35 + Math.random() * 0.75, Math.sin(a) * r).multiplyScalar(0.55);
          b.sv.set([v.x, v.y, v.z], i * 3);
        }
        opts.onBeamImpact?.(b.key);
      }
      // shockwave and flash
      const after = k - IMPACT;
      if (after >= 0) {
        const s = clamp(after / 1.1, 0, 1);
        b.shock.material.uniforms.uR.value = 0.08 + (1 - Math.pow(1 - s, 3)) * 0.9;
        b.shock.material.uniforms.uOpacity.value = (1 - s) * 1.2;
        const f = clamp(after / 0.45, 0, 1);
        b.flash.scale.setScalar(0.05 + Math.sin(f * Math.PI) * 0.32);
        b.flash.material.opacity = 1 - f;
        // sparks: up and out, then gravity pulls them back to the ground
        const life = clamp(after / 1.6, 0, 1);
        for (let i = 0; i < SPARKS; i++) {
          const o = i * 3;
          b.sv[o + 1] -= dt * 0.9;
          b.sp[o] += b.sv[o] * dt;
          b.sp[o + 1] = Math.max(0.004, b.sp[o + 1] + b.sv[o + 1] * dt);
          b.sp[o + 2] += b.sv[o + 2] * dt;
        }
        b.sparks.geometry.attributes.position.needsUpdate = true;
        b.sparks.material.opacity = 1 - life;
      } else {
        b.shock.material.uniforms.uOpacity.value = 0;
        b.flash.material.opacity = 0;
      }
      if (k > BEAM_END) {
        b.t = -1;
        b.g.visible = false;
      }
    }
  }

  /* ── "Bring Bobo to me" ─────────────────────────────────────────────────── */
  // A beacon shoots up at the visitor's city, an arc races there from Bobo's
  // latest sighting, the planet spins it under his feet while he runs, and he
  // lands in a burst of confetti.
  const beaconMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uColor: { value: C.pink } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOn; uniform vec3 uColor; varying vec2 vUv;
      void main() {
        float fade = pow(1.0 - vUv.y, 1.6);
        float bands = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 9.0);
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        gl_FragColor = vec4(uColor * 1.6, fade * bands * (0.35 + 0.65 * edge) * uOn);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beacon = new THREE.Group();
  {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, 0.9, 20, 1, true).translate(0, 0.45, 0), beaconMat);
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: C.pink }, uSpeed: { value: 0.9 } },
        vertexShader: uvVert,
        fragmentShader: rippleFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.003;
    col.renderOrder = ring.renderOrder = 6;
    beacon.add(col, ring);
    beacon.userData = { col, ring };
    beacon.visible = false;
    globe.add(beacon);
  }
  let summonArc = null;

  // confetti: brand colours, launched from Bobo, pulled back to the planet
  const CONF = mobile ? 140 : 220;
  const confPos = new Float32Array(CONF * 3);
  const confCol = new Float32Array(CONF * 3);
  const confVel = new Float32Array(CONF * 3);
  const confGeo = new THREE.BufferGeometry();
  confGeo.setAttribute("position", new THREE.BufferAttribute(confPos, 3));
  confGeo.setAttribute("color", new THREE.BufferAttribute(confCol, 3));
  const confetti = new THREE.Points(
    confGeo,
    new THREE.PointsMaterial({ size: mobile ? 0.03 : 0.024, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }),
  );
  confetti.visible = false;
  confetti.renderOrder = 8;
  scene.add(confetti);
  let confT = 0;
  function burst() {
    const palette = [C.gold, C.pink, C.teal, C.blue, new THREE.Color("#ffffff")];
    const origin = ANCHOR.clone().multiplyScalar(R_LAND + BOBO_H * 0.9);
    const up = ANCHOR.clone();
    const v = new THREE.Vector3();
    for (let i = 0; i < CONF; i++) {
      origin.toArray(confPos, i * 3);
      v.randomDirection().multiplyScalar(0.35 + Math.random() * 0.55).addScaledVector(up, 0.9 + Math.random() * 0.6);
      v.toArray(confVel, i * 3);
      palette[i % palette.length].toArray(confCol, i * 3);
    }
    confGeo.attributes.position.needsUpdate = true;
    confGeo.attributes.color.needsUpdate = true;
    confetti.visible = true;
    confT = 0;
  }

  function summon(loc) {
    if (!loc || !Number.isFinite(loc.lat)) return false;
    clearFocus();
    endSummon(true);
    const local = toVec(loc.lat, loc.lng, 1);
    beacon.position.copy(local).multiplyScalar(R_LAND);
    beacon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), local);
    beacon.visible = true;
    beacon.scale.set(1, 0.001, 1);
    // arc from the latest sighting to you
    const from = latestKey && hotspots.get(latestKey)?.local;
    if (from && from.angleTo(local) > 0.02) {
      const ang = from.angleTo(local);
      const axis = new THREE.Vector3().crossVectors(from, local).normalize();
      const pts = [];
      const q = new THREE.Quaternion();
      for (let k = 0; k <= 64; k++) {
        const t = k / 64;
        q.setFromAxisAngle(axis, ang * t);
        pts.push(from.clone().applyQuaternion(q).multiplyScalar(R_LAND + 0.005 + Math.sin(Math.PI * t) * (0.06 + 0.3 * (ang / Math.PI))));
      }
      const mat = arcMat(0);
      mat.uniforms.uA.value = C.gold;
      mat.uniforms.uB.value = C.pink;
      mat.uniforms.uHi.value = 1;
      summonArc = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, mobile ? 0.006 : 0.005, 6, false), mat);
      summonArc.renderOrder = 4;
      globe.add(summonArc);
    }
    const to = orientFor(local, ANCHOR, st.yaw);
    const ang = Math.hypot(wrap(to.yaw - st.yaw), to.pitch - st.pitch);
    st.summon = { loc, local, t: 0, arrived: false };
    st.tween = { from: { yaw: st.yaw, pitch: st.pitch }, to, t: 0, dur: reduced ? 0.01 : clamp(1.6 + ang * 0.9, 2.2, 4.2), key: null, summon: true };
    st.vYaw = st.vPitch = 0;
    bobo?.setMode("travel");
    const portrait = st.h > st.w * 1.1;
    // phones: pull back so Bobo stands mid-screen under the (compact) title
    Object.assign(st.goal, {
      tx: 0,
      ty: portrait ? 0.98 : 1.22,
      tz: 0.2,
      dist: portrait ? 3.6 : 2.3,
      elev: portrait ? 0.1 : 0.14,
      azim: -0.05,
    });
    return true;
  }
  function summonArrived() {
    if (!st.summon) return;
    st.summon.arrived = true;
    bobo?.react("Excited", st.time);
    setTimeout(() => st.summon?.arrived && bobo?.setMode("watch"), 1200);
    burst();
    opts.onSummoned?.(st.summon.loc);
  }
  function endSummon(silent = false) {
    if (!st.summon && !summonArc) return;
    st.summon = null;
    opts.onSummonEnd?.();
    beacon.visible = false;
    if (summonArc) {
      globe.remove(summonArc);
      summonArc.geometry.dispose();
      summonArc = null;
    }
    bobo?.setMode("auto");
    if (!silent) {
      st.lastInput = st.time;
      Object.assign(st.goal, overviewGoal());
    }
  }
  function updateSummon(dt, t) {
    beaconMat.uniforms.uTime.value = t;
    if (st.summon) {
      const s = st.summon;
      s.t += dt;
      // the beacon shoots up, then settles into a glowing ring under Bobo
      const rise = Math.min(1, s.t / 0.5);
      if (s.arrived && s.doneAt === undefined) s.doneAt = s.t;
      const settle = s.arrived ? 1 - Math.min(1, (s.t - s.doneAt) / 0.8) * 0.88 : 1;
      beacon.scale.set(1, rise * settle, 1);
      beaconMat.uniforms.uOn.value = rise;
      beacon.userData.ring.material.uniforms.uTime.value += dt;
      if (summonArc) {
        const u = summonArc.material.uniforms;
        u.uTime.value = t;
        u.uReveal.value = reduced ? 1 : clamp(s.t / 1.1, 0, 1);
      }
    }
    if (confetti.visible) {
      confT += dt;
      const g = new THREE.Vector3();
      for (let i = 0; i < CONF; i++) {
        const o = i * 3;
        g.set(confPos[o], confPos[o + 1], confPos[o + 2]).normalize().multiplyScalar(-1.6 * dt);
        confVel[o] = confVel[o] * (1 - dt * 1.2) + g.x;
        confVel[o + 1] = confVel[o + 1] * (1 - dt * 1.2) + g.y;
        confVel[o + 2] = confVel[o + 2] * (1 - dt * 1.2) + g.z;
        confPos[o] += confVel[o] * dt;
        confPos[o + 1] += confVel[o + 1] * dt;
        confPos[o + 2] += confVel[o + 2] * dt;
      }
      confGeo.attributes.position.needsUpdate = true;
      confetti.material.opacity = clamp(2.4 - confT, 0, 1);
      if (confT > 2.4) confetti.visible = false;
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
    summon,
    endSummon: () => endSummon(),
    get summoned() {
      return !!st.summon;
    },
    focus,
    showMedia,
    clearFocus,
    ping,
    beam,
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
      const v = ANCHOR.clone().multiplyScalar(R_LAND + BOBO_H * 1.15).project(camera);
      return { x: (v.x * 0.5 + 0.5) * st.w, y: (-v.y * 0.5 + 0.5) * st.h };
    },
    destroy() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
  };
}
