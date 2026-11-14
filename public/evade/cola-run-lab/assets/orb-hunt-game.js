// GENERATED from mattercraft/cola-run/OrbHuntGame.ts by scripts/build-cola-capture.mjs. Don't edit.
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// mattercraft/lab-shim/zcomponent.ts
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
var Emitter = class {
  constructor() {
    __publicField(this, "_fns", []);
  }
  addListener(fn, _priority) {
    if (!this._fns.includes(fn)) this._fns.push(fn);
  }
  removeListener(fn) {
    this._fns = this._fns.filter((f) => f !== fn);
  }
  _emit(...args) {
    for (const f of this._fns.slice()) {
      try {
        f(...args);
      } catch (e) {
        console.error(e);
      }
    }
  }
};
var Event = class extends Emitter {
  emit(...args) {
    this._emit(...args);
  }
};
var Observable = class extends Emitter {
  constructor(def, handler) {
    super();
    __publicField(this, "_v");
    __publicField(this, "_def");
    __publicField(this, "__z_is_observable", true);
    this._def = def;
    this._v = def;
    if (handler) super.addListener(handler);
  }
  get value() {
    return this._v;
  }
  set value(v) {
    v = v ?? this._def;
    const changed = v !== this._v;
    this._v = Array.isArray(v) ? v.slice() : v;
    if (changed) this._emit(this._v);
  }
  addListener(fn, priority, callImmediately = true) {
    super.addListener(fn, priority);
    if (callImmediately) {
      try {
        fn(this._v);
      } catch (e) {
        console.error(e);
      }
    }
  }
};
var H_CLASS = {
  left: "zcomponent-h-left",
  leftSafe: "zcomponent-h-left-safe",
  center: "zcomponent-h-center",
  right: "zcomponent-h-right",
  rightSafe: "zcomponent-h-right-safe"
};
var V_CLASS = {
  top: "zcomponent-v-top",
  topSafe: "zcomponent-v-top-safe",
  center: "zcomponent-v-center",
  bottom: "zcomponent-v-bottom",
  bottomSafe: "zcomponent-v-bottom-safe"
};
function classNameForAlignment(h, v) {
  const hc = h === "center" /* center */;
  const vc = v === "center" /* center */;
  const t = hc && vc ? "zcomponent-hc-vc" : hc ? "zcomponent-hc-v" : vc ? "zcomponent-h-vc" : "zcomponent-h-v";
  return ["zcomponent-align", H_CLASS[h], V_CLASS[v], t].join(" ");
}
var LayerClip = class {
  constructor(_c) {
    this._c = _c;
    __publicField(this, "layer");
    __publicField(this, "clip", { _streamTracks: [] });
    const layer = {
      active: null,
      setActive: (c) => {
        layer.active = c;
      }
    };
    this.layer = layer;
  }
  seek(_t, _o) {
  }
  play() {
    this.layer.active = this;
    this._c.play();
  }
  stop() {
    this._c.stop?.();
  }
};
var LabContext = class {
  constructor(o) {
    __publicField(this, "overlay");
    __publicField(this, "camera");
    __publicField(this, "audioContext");
    __publicField(this, "audioLayer");
    __publicField(this, "loader");
    __publicField(this, "canvas");
    __publicField(this, "renderer");
    __publicField(this, "scene");
    __publicField(this, "beforeRender", new Event());
    __publicField(this, "nodes", /* @__PURE__ */ new Map());
    __publicField(this, "layerClipByID", /* @__PURE__ */ new Map());
    __publicField(this, "triggers", /* @__PURE__ */ new Set());
    __publicField(this, "_constructed");
    __publicField(this, "constructed", new Promise((r) => this._constructed = r));
    __publicField(this, "_pa", new THREE.Vector3());
    __publicField(this, "_pb", new THREE.Vector3());
    __publicField(this, "_sa", new THREE.Vector3());
    this.overlay = new Observable(o.overlay);
    this.camera = new Observable(o.camera);
    this.audioContext = o.audioContext;
    this.audioLayer = o.audioLayer;
    this.loader = o.loader ?? new GLTFLoader();
    this.canvas = o.canvas ?? document.createElement("canvas");
    this.renderer = o.renderer ?? null;
    this.scene = o.scene ?? null;
  }
  /** Make a plain three.js object pickable by node id (e.g. Player Node). */
  addNode(id, element, children = []) {
    this.nodes.set(id, { element, children });
  }
  /** Make a component pickable by node id (what resolveNodeID returns in Mattercraft). */
  addComponent(id, comp) {
    this.nodes.set(id, comp);
  }
  /** Offer a timeline by id (what a Timeline/State dropdown would hold). */
  addClip(id, clip) {
    this.layerClipByID.set(id, new LayerClip(clip));
  }
  /** Call once every prop is set: the game binds its player and opens the intro. */
  markConstructed() {
    this._constructed();
  }
  get(ctx) {
    if (ctx === AudioContextContext) return { getLayer: () => this.audioLayer };
    throw new Error("Not available in the lab");
  }
  /** One frame: triggers first, then the game's onBeforeRender (dt in seconds). */
  step(dtSeconds) {
    this._stepTriggers();
    this.beforeRender.emit(dtSeconds * 1e3);
  }
  _stepTriggers() {
    const list = [...this.triggers].filter((t) => t.enabled.value && t.element.parent);
    for (const t of list) t.element.updateWorldMatrix(true, false);
    for (const a of list) {
      if (!a.isTrigger.value) continue;
      for (const b of list) {
        if (b.isTrigger.value) continue;
        if (!a.tags.value.some((tag) => b.tags.value.includes(tag))) continue;
        a.element.getWorldPosition(this._pa);
        b.element.getWorldPosition(this._pb);
        const ra = a.element.getWorldScale(this._sa).x;
        const rb = b.element.getWorldScale(this._sa).x;
        const touching = visibleInWorld(a.element) && visibleInWorld(b.element) && this._pa.distanceTo(this._pb) <= ra + rb;
        const was = a._touching.has(b);
        if (touching && !was) {
          a._touching.add(b);
          b._touching.add(a);
          a.onCollisionEnter.emit({ otherTrigger: b });
          b.onCollisionEnter.emit({ otherTrigger: a });
        } else if (!touching && was) {
          a._touching.delete(b);
          b._touching.delete(a);
          a.onCollisionExit.emit({ otherTrigger: b });
          b.onCollisionExit.emit({ otherTrigger: a });
        }
      }
    }
  }
};
function visibleInWorld(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
var useOverlay = (cm) => cm.overlay;
var useOnBeforeRender = (cm) => cm.beforeRender;
var useCamera = (cm) => cm.camera;
var useAudioContext = (cm) => cm.audioContext;
var useCanvas = (cm) => cm.canvas;
var useRenderer = (cm) => cm.renderer;
var useScene = (cm) => cm.scene;
var isDesignTime = (_cm) => false;
var AudioContextContext = { name: "AudioContextContext" };
var Component = class {
  constructor(contextManager, constructorProps = {}) {
    this.contextManager = contextManager;
    this.constructorProps = constructorProps;
    __publicField(this, "children", []);
    __publicField(this, "_registered", []);
  }
  register(e, fn, _o) {
    if (this._registered.some(([a, b]) => a === e && b === fn)) return;
    this._registered.push([e, fn]);
    e.addListener(fn);
  }
  unregister(e, fn) {
    e.removeListener(fn);
    this._registered = this._registered.filter(([a, b]) => a !== e || b !== fn);
  }
  getZComponentInstance() {
    const cm = this.contextManager;
    return {
      constructed: cm.constructed,
      // Every component the lab registered, so a walk of the tree finds them (as in Mattercraft).
      get children() {
        return [...cm.nodes.values()];
      },
      resolveNodeID: (id) => cm.nodes.get(id),
      animation: { layerClipByID: cm.layerClipByID }
    };
  }
  dispose() {
    for (const [e, fn] of this._registered) e.removeListener(fn);
    this._registered = [];
  }
};
var Object3D = class extends Component {
  constructor() {
    super(...arguments);
    __publicField(this, "element", new THREE.Group());
  }
};
var Group2 = class extends Object3D {
  constructor() {
    super(...arguments);
    __publicField(this, "element", new THREE.Group());
  }
};
var Audio = class extends Component {
  constructor(cm, props) {
    super(cm, props);
    __publicField(this, "loop", new Observable(false));
    __publicField(this, "volume", new Observable(
      1,
      (v) => this._el && (this._el.volume = Math.max(0, Math.min(1, v)))
    ));
    __publicField(this, "_el");
    if (props.source) {
      this._el = new window.Audio(props.source);
      this._el.crossOrigin = "anonymous";
      try {
        cm.audioContext.createMediaElementSource(this._el).connect(cm.audioLayer);
      } catch {
      }
    }
  }
  play(o) {
    if (!this._el) return;
    this._el.loop = o?.loop ?? this.loop.value;
    this._el.playbackRate = o?.speed ?? 1;
    void this._el.play().catch(() => void 0);
  }
  stop() {
    if (!this._el) return;
    this._el.pause();
    this._el.currentTime = 0;
  }
  seek(t) {
    if (this._el) this._el.currentTime = t;
  }
  dispose() {
    this.stop();
    return super.dispose();
  }
};
var GLTF = class extends Group2 {
  constructor(cm, props) {
    super(cm, props);
    __publicField(this, "animationClips", new Observable(/* @__PURE__ */ new Map()));
    __publicField(this, "nodesByName", new Observable(/* @__PURE__ */ new Map()));
    __publicField(this, "mixer", new Observable(void 0));
    __publicField(this, "streams", {});
    __publicField(this, "loaded");
    this.loaded = cm.loader.loadAsync(props.source).then((g) => {
      const root = g.scene;
      if (props.frustumCulled === false) root.traverse((o) => o.frustumCulled = false);
      this.element.add(root);
      const names = /* @__PURE__ */ new Map();
      root.traverse((o) => o.name && names.set(o.name, o));
      this.nodesByName.value = names;
      this.animationClips.value = new Map(g.animations.map((a) => [a.name, a]));
    });
  }
};
var Image = class extends Group2 {
  constructor(cm, props) {
    super(cm, props);
    __publicField(this, "_src");
    this._src = props.source;
  }
  async _load() {
    const tex = await new THREE.TextureLoader().loadAsync(this._src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = tex.image;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(
        img.width / Math.max(img.width, img.height),
        img.height / Math.max(img.width, img.height)
      ),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    this.element.add(m);
  }
};
var SphereTrigger = class extends Object3D {
  constructor(cm, props) {
    super(cm, props);
    __publicField(this, "isTrigger", new Observable(false));
    __publicField(this, "tags", new Observable([]));
    __publicField(this, "enabled", new Observable(true));
    __publicField(this, "onCollisionEnter", new Event());
    __publicField(this, "onCollisionExit", new Event());
    /** @internal */
    __publicField(this, "_touching", /* @__PURE__ */ new Set());
    cm.triggers.add(this);
  }
  dispose() {
    this.contextManager.triggers.delete(this);
    for (const o of this._touching) o._touching.delete(this);
    this.element.removeFromParent();
    return super.dispose();
  }
};

// mattercraft/cola-run/OrbHuntGame.ts
import * as THREE2 from "three";
var NOISE3 = (
  /* glsl */
  `
float hash31(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 rotY(vec3 p, float a){
  float c = cos(a), s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}
float fbm3(vec3 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * vnoise3(p);
    p = rotY(p, 0.7) * 2.03;
    a *= 0.5;
  }
  return v;
}`
);
var ORB_VERT = (
  /* glsl */
  `
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main(){
  vLocal   = position;
  vNormalV = normalize(normalMatrix * normal);
  vec4 mv  = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`
);
var ORB_FRAG = (
  /* glsl */
  `
precision highp float;
varying vec3 vLocal;
varying vec3 vNormalV;
varying vec3 vViewPos;
uniform float uTime;
uniform vec3  uColorCore;
uniform vec3  uColorInner;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform float uHueBlend;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uTurbulence;
uniform float uSurfaceSharpness;
uniform float uSurfaceEnergy;
uniform float uCoreGlow;
uniform float uDensity;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uBrightness;
uniform float uOpacity;
uniform float uPulse;
uniform float uFlare;
uniform float uFlareBoost;
__NOISE3__
void main(){
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  float fres = 1.0 - clamp(dot(N, V), 0.0, 1.0);
  float t = uTime * uSpeed;
  vec3  q = vLocal * uNoiseScale;
  q.y -= t * 0.6;
  q = rotY(q, t * 0.35);
  float w = fbm3(q + vec3(1.7, 9.2, 4.3));
  float n = fbm3(q + (w - 0.5) * uTurbulence);
  float veins = 1.0 - abs(n * 2.0 - 1.0);
  veins = pow(clamp(veins, 0.0, 1.0), uSurfaceSharpness);
  float flare  = uFlare * uFlareBoost;
  float rim    = pow(fres, uRimPower) * uRimIntensity * (1.0 + flare);
  float energy = veins * uSurfaceEnergy * (1.0 + flare * 0.6) + rim;
  float k = clamp(energy, 0.0, 1.6);
  vec3 hue = mix(uColorInner, uColorMid, smoothstep(uHueBlend - 0.35, uHueBlend + 0.35, fres));
  vec3 col = mix(uColorCore, hue,        smoothstep(0.00, 0.50, k));
  col      = mix(col,        uColorEdge, smoothstep(0.50, 1.10, k));
  col *= (uCoreGlow + energy);
  col *= uBrightness * uPulse * (1.0 + flare);
  float alpha = clamp(uDensity + energy, 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(col, alpha);
}`
);
var GLOW_VERT = (
  /* glsl */
  `
varying vec3  vViewPos;
varying vec3  vCenterV;
varying float vOuter;
void main(){
  vec4 mv  = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vCenterV = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vOuter   = length(modelViewMatrix[0].xyz) * 0.5;
  gl_Position = projectionMatrix * mv;
}`
);
var GLOW_FRAG = (
  /* glsl */
  `
precision highp float;
varying vec3  vViewPos;
varying vec3  vCenterV;
varying float vOuter;
uniform vec3  uColor;
uniform float uFalloff;
uniform float uIntensity;
uniform float uCoreFrac;
uniform float uPulse;
uniform float uFlare;
uniform float uFlareBoost;
uniform float uOpacity;
void main(){
  vec3  D  = normalize(vViewPos);
  float d  = length(vCenterV - D * dot(vCenterV, D));
  float nr = clamp(d / max(vOuter, 0.0001), 0.0, 1.0);
  float g  = clamp((nr - uCoreFrac) / max(1.0 - uCoreFrac, 0.0001), 0.0, 1.0);
  float f  = pow(1.0 - g, uFalloff);
  float a  = f * uIntensity * uPulse * (1.0 + uFlare * uFlareBoost) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`
);
var BEACON_VERT = (
  /* glsl */
  `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
);
var BEACON_FRAG = (
  /* glsl */
  `
precision highp float;
varying vec2 vUv;
uniform vec3  uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uRingWidth;
uniform float uPoolStrength;
uniform float uWaveSpeed;
uniform float uOpacity;
uniform float uPhase;
void main(){
  vec2  p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float outer = 1.0 - smoothstep(0.95, 1.0, r);

  // static ring near the rim
  float hw   = max(uRingWidth, 0.01);
  float ring = 1.0 - smoothstep(0.0, hw, abs(r - 0.78));

  // soft pool filling the middle
  float pool = (1.0 - smoothstep(0.0, 0.85, r)) * uPoolStrength;

  // one wave travelling outward
  float w    = fract(uTime * uWaveSpeed + uPhase);
  float wave = (1.0 - smoothstep(0.0, 0.13, abs(r - w))) * (1.0 - w);

  float a = (ring + pool + wave * 0.85) * uIntensity * outer;
  gl_FragColor = vec4(uColor * a, a * uOpacity);
}`
);
var PORTAL_VERT = (
  /* glsl */
  `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
);
var PORTAL_FRAG = (
  /* glsl */
  `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3  uColorCore;
uniform vec3  uColorInner;
uniform vec3  uColorMid;
uniform vec3  uColorEdge;
uniform float uHueBlend;
uniform float uRadius;
uniform float uSwirl;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uTurbulence;
uniform float uArmSharpness;
uniform float uCoreSize;
uniform float uCoreDarkness;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uEdgeWobble;
uniform float uEdgeWobbleSpeed;
uniform float uStarDensity;
uniform float uStarIntensity;
uniform float uHaloSize;
uniform float uHaloIntensity;
uniform float uBrightness;
uniform float uOpacity;
const float TAU = 6.28318530718;
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){
    v += a * vnoise(p);
    p = vec2(p.x * 1.62 + p.y * 1.18, -p.x * 1.18 + p.y * 1.62);
    a *= 0.5;
  }
  return v;
}
vec2 rot(vec2 p, float t){
  float c = cos(t), s = sin(t);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}
void main(){
  vec2  p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime * uSpeed;
  vec2  ring = vec2(cos(a), sin(a)) * 2.4;
  float wob  = fbm(ring + vec2(t * uEdgeWobbleSpeed)) - 0.5;
  float R    = max(uRadius * (1.0 + wob * uEdgeWobble), 0.001);
  float nr   = r / R;
  float disc = 1.0 - smoothstep(0.93, 1.0, nr);
  float twist = uSwirl * log(max(nr, 0.05)) - t;
  vec2  sp    = rot(p / R, twist);
  vec2 warp = vec2(
    fbm(sp * uNoiseScale + vec2(0.0, t * 0.35)),
    fbm(sp * uNoiseScale + vec2(5.2, 1.3) - t * 0.22)
  );
  float n = fbm(sp * uNoiseScale + (warp - 0.5) * uTurbulence);
  float arms = 1.0 - abs(n * 2.0 - 1.0);
  arms = pow(clamp(arms, 0.0, 1.0), uArmSharpness);
  float hole = smoothstep(0.0, max(uCoreSize, 0.001), nr);
  float rim  = pow(clamp(nr, 0.0, 1.0), uRimPower);
  float body = arms * hole * (0.30 + 0.70 * rim);
  float lip  = smoothstep(0.55, 1.0, nr) * rim * uRimIntensity;
  float energy = (body + lip) * disc;
  vec2  g  = p * uStarDensity;
  vec2  gi = floor(g);
  vec2  gf = fract(g) - 0.5;
  float h  = hash21(gi);
  vec2  jitter = (vec2(hash21(gi + 1.7), hash21(gi + 4.3)) - 0.5) * 0.7;
  float star = step(0.90, h) * smoothstep(0.16, 0.0, length(gf - jitter));
  star *= 0.45 + 0.55 * sin(uTime * 2.6 + h * TAU * 9.0);
  star *= disc * smoothstep(0.0, 0.35, nr) * (1.0 - smoothstep(0.75, 1.0, nr));
  float halo = exp(-pow(max(nr - 0.92, 0.0) / max(uHaloSize, 0.001), 1.6)) *
               smoothstep(0.45, 1.0, nr) * uHaloIntensity;
  float k = clamp(energy, 0.0, 1.6);
  float hueMix = smoothstep(uHueBlend - 0.35, uHueBlend + 0.35, nr);
  vec3 hue = mix(uColorInner, uColorMid, hueMix);
  vec3 col = mix(uColorCore, hue,        smoothstep(0.02, 0.50, k));
  col      = mix(col,        uColorEdge, smoothstep(0.50, 1.10, k));
  col *= energy;
  col += uColorEdge * (star * uStarIntensity + halo);
  col += hue * halo * 0.45;
  col *= uBrightness;
  float alpha = clamp(energy + halo + star * uStarIntensity, 0.0, 1.0);
  alpha = max(alpha, disc * uCoreDarkness);
  gl_FragColor = vec4(col, alpha * uOpacity);
}`
);
function setColor(target, v) {
  return target.setRGB(v[0], v[1], v[2]);
}
function mulberry32(a) {
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function annulusRadius(rnd, minR, maxR) {
  const a = minR * minR;
  const b = maxR * maxR;
  return Math.sqrt(a + rnd() * (b - a));
}
function shadeForWhiteText(rgb, target = 4.8) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const ratio = (c) => {
    const l = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    return 1.05 / (l + 0.05);
  };
  let out = [rgb[0], rgb[1], rgb[2]];
  for (let i = 0; i < 60 && ratio(out) < target; i++) {
    out = [out[0] * 0.95, out[1] * 0.95, out[2] * 0.95];
  }
  return [Math.round(out[0]), Math.round(out[1]), Math.round(out[2])];
}
function bestTextOn(rgb) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.06 ? "#fff" : "#04121b";
}
function runningAnimKeys(models) {
  const out = /* @__PURE__ */ new Set();
  models.forEach((m, i) => {
    const mixer = m.mixer.value;
    if (!mixer) return;
    for (const [name, clip] of m.animationClips.value) {
      const a = mixer.existingAction(clip);
      if (a && !a.paused && a.isRunning()) out.add(i + ":" + name);
    }
  });
  return out;
}
function firstExternalAnim(running, owned, ambient, clipStreams, models) {
  for (const key of running) {
    if (owned.has(key) || ambient.has(key)) continue;
    const sep = key.indexOf(":");
    const stream = models[+key.slice(0, sep)]?.streams[key.slice(sep + 1)];
    if (stream && clipStreams.has(stream)) continue;
    return key;
  }
  return void 0;
}
function stopLoungeAnims(models, owned) {
  models.forEach((m, i) => {
    const mixer = m.mixer.value;
    for (const [name, clip] of m.animationClips.value) {
      const a = mixer?.existingAction(clip);
      const parked = !!a && a.enabled && a.paused;
      if (parked || owned.has(i + ":" + name)) m.streams[name]?.stop?.();
    }
  });
}
function fitToDiameter(obj, diameter) {
  obj.updateMatrixWorld(true);
  const toLocal = new THREE2.Matrix4().copy(obj.matrixWorld).invert();
  const rel = new THREE2.Matrix4();
  const box = new THREE2.Box3();
  const bb = new THREE2.Box3();
  obj.traverse((c) => {
    const geom = c.geometry;
    if (!geom) return;
    if (!geom.boundingBox) geom.computeBoundingBox();
    if (!geom.boundingBox) return;
    bb.copy(geom.boundingBox).applyMatrix4(rel.multiplyMatrices(toLocal, c.matrixWorld));
    box.union(bb);
  });
  if (box.isEmpty()) return 0;
  const size = box.getSize(new THREE2.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0) || !isFinite(longest)) return 0;
  obj.position.copy(box.getCenter(new THREE2.Vector3())).negate();
  const scale = diameter / longest;
  const wrapper = obj.parent;
  if (wrapper) wrapper.scale.setScalar(scale);
  else obj.scale.setScalar(scale);
  return scale;
}
function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}
function rgbChannels(hex, fallback) {
  const h = (hex || "").trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return fallback;
  const n = parseInt(full, 16);
  return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`;
}
var MUSIC_CHORDS = [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]];
var MUSIC_ARP = [0, -1, 1, 2, -1, 1, 0, -1];
var GameAudio = class {
  constructor(ctx, out) {
    __publicField(this, "sfxOn", true);
    __publicField(this, "musicOn", true);
    __publicField(this, "musicLevel", 0.5);
    __publicField(this, "_ctx");
    __publicField(this, "_master");
    __publicField(this, "_sfx");
    __publicField(this, "_music");
    __publicField(this, "_hum", null);
    __publicField(this, "_nextBeat", 0);
    __publicField(this, "_beat", 0);
    this._ctx = ctx;
    this._master = ctx.createGain();
    this._master.gain.value = 0.8;
    this._master.connect(out);
    this._sfx = ctx.createGain();
    this._sfx.gain.value = 1;
    this._sfx.connect(this._master);
    this._music = ctx.createGain();
    this._music.gain.value = 1e-4;
    this._music.connect(this._master);
    this._nextBeat = ctx.currentTime + 0.1;
  }
  setMasterVolume(v) {
    this._master.gain.value = v;
  }
  setSfx(on) {
    this.sfxOn = on;
    const t = this._ctx.currentTime;
    this._sfx.gain.cancelScheduledValues(t);
    this._sfx.gain.linearRampToValueAtTime(on ? 1 : 1e-4, t + 0.15);
  }
  setMusic(on) {
    this.musicOn = on;
    const t = this._ctx.currentTime;
    this._music.gain.cancelScheduledValues(t);
    this._music.gain.setValueAtTime(Math.max(1e-4, this._music.gain.value), t);
    this._music.gain.linearRampToValueAtTime(on ? Math.max(1e-4, this.musicLevel) : 1e-4, t + (on ? 1.4 : 0.6));
  }
  _note(bus, o) {
    const t0 = o.at ?? this._ctx.currentTime;
    const dur = o.dur ?? 0.3;
    const atk = Math.min(o.attack ?? 0.01, dur * 0.9);
    const gain = Math.max(2e-4, o.gain ?? 0.2);
    const osc = this._ctx.createOscillator();
    const g = this._ctx.createGain();
    osc.type = o.type ?? "sine";
    if (o.detune) osc.detune.value = o.detune;
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
    g.gain.setValueAtTime(1e-4, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    let tail = osc;
    if (o.filter) {
      const f = this._ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.filter;
      osc.connect(f);
      tail = f;
    }
    tail.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.06);
  }
  /** Rises in pitch with the streak, so a run of pickups reads as a combo. */
  collect(streak, step) {
    if (!this.sfxOn) return;
    const f = 523.25 * Math.pow(1 + step, Math.min(Math.max(streak, 1) - 1, 12));
    this._note(this._sfx, { freq: f, dur: 0.26, type: "triangle", gain: 0.24, slideTo: f * 1.5, attack: 6e-3 });
    this._note(this._sfx, { freq: f * 2, dur: 0.17, type: "sine", gain: 0.1, attack: 4e-3 });
  }
  win() {
    if (!this.sfxOn) return;
    const t = this._ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._note(this._sfx, { freq: f, dur: 0.7, type: "sine", gain: 0.19, attack: 0.012, at: t + i * 0.09 });
      this._note(this._sfx, { freq: f / 2, dur: 0.85, type: "triangle", gain: 0.07, attack: 0.02, at: t + i * 0.09 });
    });
    this._note(this._sfx, { freq: 110, dur: 1.5, type: "sine", gain: 0.15, slideTo: 220, attack: 0.3, at: t });
  }
  /**
   * The unlock sting. Deliberately different in character from `win()` — that
   * one is a rising major arpeggio, this is a bell stack over a swell, so the
   * two read as two events rather than one long jingle when they overlap.
   */
  reward() {
    if (!this.sfxOn) return;
    const t = this._ctx.currentTime;
    [1, 2.02, 2.99, 4.21, 5.43].forEach((r, i) => {
      this._note(this._sfx, {
        freq: 880 * r,
        dur: 1.6 - i * 0.2,
        type: "sine",
        gain: 0.14 / (i + 1.4),
        attack: 6e-3,
        at: t
      });
    });
    this._note(this._sfx, {
      freq: 220,
      dur: 1.4,
      type: "triangle",
      gain: 0.12,
      slideTo: 440,
      attack: 0.25,
      at: t + 0.04
    });
    this._note(this._sfx, { freq: 1318.5, dur: 0.5, type: "sine", gain: 0.1, attack: 8e-3, at: t + 0.42 });
    this._note(this._sfx, { freq: 1760, dur: 0.7, type: "sine", gain: 0.09, attack: 8e-3, at: t + 0.58 });
  }
  warn() {
    if (!this.sfxOn) return;
    this._note(this._sfx, { freq: 380, dur: 0.1, type: "square", gain: 0.09 });
  }
  fail() {
    if (!this.sfxOn) return;
    this._note(this._sfx, { freq: 300, dur: 0.8, type: "sawtooth", gain: 0.13, slideTo: 80, filter: 900 });
    this._note(this._sfx, { freq: 150, dur: 0.9, type: "sine", gain: 0.1, slideTo: 45 });
  }
  /** Low detuned drone while the portal stands open. Fades, never clicks. */
  portalHum(on) {
    if (on && !this._hum) {
      const g = this._ctx.createGain();
      g.gain.value = 1e-4;
      g.connect(this._sfx);
      const f = this._ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 460;
      f.Q.value = 3.5;
      f.connect(g);
      const oscs = [-9, 0, 7].map((d) => {
        const o = this._ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = 82.4;
        o.detune.value = d;
        o.connect(f);
        o.start();
        return o;
      });
      const lfo = this._ctx.createOscillator();
      const lg = this._ctx.createGain();
      lfo.frequency.value = 0.22;
      lg.gain.value = 170;
      lfo.connect(lg);
      lg.connect(f.frequency);
      lfo.start();
      g.gain.exponentialRampToValueAtTime(0.05, this._ctx.currentTime + 1.4);
      this._hum = { g, oscs, lfo };
    } else if (!on && this._hum) {
      const h = this._hum;
      this._hum = null;
      const t = this._ctx.currentTime;
      h.g.gain.cancelScheduledValues(t);
      h.g.gain.setValueAtTime(Math.max(1e-4, h.g.gain.value), t);
      h.g.gain.exponentialRampToValueAtTime(1e-4, t + 0.5);
      const stopAt = t + 0.7;
      h.oscs.forEach((o) => o.stop(stopAt));
      h.lfo.stop(stopAt);
    }
  }
  /**
   * Generative loop, scheduled ~0.4s ahead of the audio clock. Call once per
   * frame: WebAudio timing is sample-accurate, so a dropped frame never
   * disturbs the groove.
   */
  musicTick() {
    if (!this.musicOn) return;
    const now = this._ctx.currentTime;
    let guard = 0;
    while (this._nextBeat < now + 0.4 && guard++ < 32) {
      const t = Math.max(this._nextBeat, now + 0.02);
      const b = this._beat;
      const chord = MUSIC_CHORDS[Math.floor(b / 16) % MUSIC_CHORDS.length];
      if (b % 16 === 0) {
        chord.forEach(
          (semi, i) => this._note(this._music, {
            freq: 110 * Math.pow(2, semi / 12),
            dur: 8.6,
            type: "sine",
            gain: 0.075,
            attack: 2.4,
            at: t,
            detune: (i - 1) * 7,
            filter: 850
          })
        );
      }
      const step = MUSIC_ARP[b % MUSIC_ARP.length];
      if (step >= 0) {
        const octave = b % 8 === 4 ? 24 : 12;
        const semi = chord[step % chord.length] + octave;
        this._note(this._music, {
          freq: 110 * Math.pow(2, semi / 12),
          dur: 1.15,
          type: "triangle",
          gain: 0.05,
          attack: 0.02,
          at: t,
          filter: 2400
        });
      }
      this._beat++;
      this._nextBeat = t + 0.42;
    }
  }
  dispose() {
    this.portalHum(false);
    try {
      this._master.disconnect();
    } catch {
    }
  }
};
var _OrbHuntGame = class _OrbHuntGame extends Group2 {
  constructor(contextManager, constructorProps) {
    super(contextManager, constructorProps);
    this.constructorProps = constructorProps;
    /* ══ Setup ══════════════════════════════════════════════════════════ */
    /**
     * Your character — the node that collects orbs by walking into them.
     * Usually the root of your joystick-driven rig.
     *
     * @zui
     * @zgroup Game Setup
     * @zgrouppriority 200
     * @zpriority 100
     * @zvalues nodeids three/Object3D/**
     */
    __publicField(this, "playerNode", new Observable(void 0, () => this._bindPlayer()));
    /**
     * How collection is detected.
     *
     * Trigger uses Mattercraft's native SphereTrigger pair — one sphere-sphere
     * overlap per orb per frame, with proper enter/leave hysteresis. Distance is
     * an identical-cost fallback that skips the trigger system entirely; switch
     * to it if triggers don't behave in your scene.
     *
     * @zui
     * @zgroup Game Setup
     * @zgrouppriority 200
     * @zpriority 90
     * @zdefault trigger
     */
    __publicField(this, "collisionMode", new Observable("trigger" /* Trigger */, () => this._rebuildTriggers()));
    /**
     * Pickup radius around your character, in scene units. Compensated for the
     * player node's world scale, so this is a real-world distance either way.
     *
     * @zui
     * @zgroup Game Setup
     * @zgrouppriority 200
     * @zpriority 80
     * @zdefault 0.7
     */
    __publicField(this, "playerRadius", new Observable(0.7, () => this._sizePlayerTrigger()));
    /**
     * How far above the player node's origin the pickup sphere sits, in scene
     * units. Character rigs are almost always anchored at the feet, so a sphere
     * centred on the origin can't reach an orb floating at head height — leave
     * this near chest height for the character. Set it to 0 if your player node
     * is already at the character's centre. Clamped to 0–5.
     *
     * @zui
     * @zgroup Game Setup
     * @zgrouppriority 200
     * @zpriority 75
     * @zdefault 0.9
     */
    __publicField(this, "playerHeightOffset", new Observable(0.9, (v) => {
      const n = Math.max(0, Math.min(5, v));
      if (n !== v) this.playerHeightOffset.value = n;
      this._sizePlayerTrigger();
      this._layout();
    }));
    /**
     * What the collectibles are. Orb is the built-in shader; Model and Image use
     * the files picked in Pickup Model / Pickup Image, which live under
     * Constructor Props because loading a file rebuilds the scene.
     *
     * Whatever you choose keeps the same size, bob, pickup radius and ground
     * ring — only the thing you see changes.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 105
     * @zdefault orb
     */
    __publicField(this, "pickupKind", new Observable("orb" /* Orb */, () => this._applyPickupKind()));
    /**
     * Size multiplier for a custom model or image, on top of Orb Size. Use it
     * when the automatic fit reads too big or too small for a particular shape —
     * a long thin object normalises to the same box as a chunky one and can look
     * smaller than it measures. Clamped to 0.1–5.
     *
     * It changes what you see, not what you can reach: the pickup radius stays
     * tied to Orb Size. Scale a pickup up a long way and use Orb Pickup Radius
     * if collection starts to feel tight.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 104
     * @zdefault 1
     */
    __publicField(this, "pickupScale", new Observable(1, (v) => {
      const n = Math.max(0.1, Math.min(5, v));
      if (n !== v) this.pickupScale.value = n;
      this._fitPickup();
    }));
    /**
     * How fast a custom model or image turns, in turns per second. Rotation is
     * what stops a static mesh reading as scenery. Set 0 to hold it still.
     * Images face the camera, so this only tilts them — leave it at 0 for those.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 103
     * @zdefault 0.15
     */
    __publicField(this, "pickupSpin", new Observable(0.15));
    /**
     * Pickup radius around each orb, as a multiple of the orb's own radius.
     * 1 means "touching the orb"; higher is more forgiving, which mobile
     * joysticks generally need.
     *
     * @zui
     * @zgroup Game Setup
     * @zgrouppriority 200
     * @zpriority 70
     * @zdefault 1.8
     */
    __publicField(this, "orbPickupRadius", new Observable(1.8, () => {
      this._sizeOrbTriggers();
      this._layout();
    }));
    /**
     * Tag used to pair the player and orb triggers. Mattercraft only tests
     * triggers that share a tag, so this must be unique to this game — change it
     * only if it clashes with triggers elsewhere in your project. Prefix with
     * `local:` to scope it to this ZComponent instance rather than globally.
     *
     * @zui
     * @zgroup Game Setup
     * @zgrouppriority 200
     * @zpriority 60
     * @zdefault orbhunt-pickup
     */
    __publicField(this, "triggerTag", new Observable("orbhunt-pickup", () => this._retagTriggers()));
    /* ══ Spawning ═══════════════════════════════════════════════════════ */
    /**
     * Layout seed. The same seed always produces the same course — change it for
     * a different arrangement, keep it to rehearse a demo or tune difficulty.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 100
     * @zdefault 1337
     */
    __publicField(this, "seed", new Observable(1337, () => {
      this._roundSeed = this.seed.value | 0;
      this._rng = mulberry32(this._roundSeed ^ 2654435769);
      this._layout();
    }));
    /**
     * Draw a fresh layout every round instead of replaying the seeded one. Leave
     * this on for anything the public will play twice — a course that's
     * identical on every restart is solved after one go. Turn it off when you
     * need the same board every time: a demo you're rehearsing, a bug you're
     * chasing, a comparison screenshot. The Seed then decides the layout.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 95
     * @zdefault true
     */
    __publicField(this, "randomizeEachRound", new Observable(true));
    /**
     * How many orbs appear. Clamped to the Max Orbs pool size.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 90
     * @zdefault 8
     */
    __publicField(this, "orbCount", new Observable(8, () => this._layout()));
    /**
     * How many the player must collect to open the portal. Set this below Orbs
     * To Spawn to let them miss a few.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 80
     * @zdefault 6
     */
    __publicField(this, "targetCount", new Observable(6, () => this._syncHud()));
    /**
     * Shape the orbs are scattered through, measured from this node's origin.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 70
     * @zdefault disc
     */
    __publicField(this, "spawnArea", new Observable("disc" /* Disc */, () => this._layout()));
    /**
     * Closest an orb can spawn to the ORIGIN — the centre of the board, not the
     * player. Use Spawn Clearance for the player; this one shapes the field.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 60
     * @zdefault 4
     */
    __publicField(this, "spawnMinRadius", new Observable(4, () => this._layout()));
    /**
     * How much room to leave around the PLAYER when the board is drawn, in
     * scene units, measured from the edge of their pickup radius.
     *
     * Minimum Spawn Radius keeps orbs away from the origin, which is only the
     * same thing as keeping them away from the player on the very first frame
     * of the very first round. Replay a round after walking somewhere and the
     * board is redrawn around the origin while the player stands wherever they
     * finished — so an orb lands on them and is collected before they see it,
     * which reads as a can that never spawned.
     *
     * A respawning orb has always avoided the player. This is the same rule
     * applied to the initial layout, off the same property, so the two can't
     * drift.
     *
     * 0 turns it off. Raise it if your character moves fast enough to make 1.5
     * units feel like no warning at all.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 58
     * @zdefault 1.5
     */
    __publicField(this, "spawnClearance", new Observable(1.5, (v) => {
      const n = Math.max(0, Math.min(20, v));
      if (n !== v) this.spawnClearance.value = n;
      this._layout();
    }));
    /**
     * Furthest an orb can spawn from the origin.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 50
     * @zdefault 16
     */
    __publicField(this, "spawnMaxRadius", new Observable(16, () => this._layout()));
    /**
     * How high orbs float above this node's ground plane.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 40
     * @zdefault 1.1
     */
    __publicField(this, "spawnHeight", new Observable(1.1, () => this._layout()));
    /**
     * Random variation applied to the float height, so the field isn't flat.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 30
     * @zdefault 0.5
     */
    __publicField(this, "spawnHeightJitter", new Observable(0.5, () => this._layout()));
    /**
     * Minimum ground distance between two orbs. Placement rejection-samples
     * against this, so orbs never clump into an accidental freebie.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 20
     * @zdefault 3
     */
    __publicField(this, "minSeparation", new Observable(3, () => this._layout()));
    /**
     * Furthest an orb may land from its nearest neighbour, in scene units. This
     * is what keeps the field together: without it, orbs scatter across the
     * whole spawn ring and the player spends the round walking rather than
     * collecting — especially in AR, where the ring is bigger than the room.
     *
     * Set 0 to switch it off and let them spread across the full ring. Values
     * below Minimum Separation are impossible to satisfy, so they're raised to
     * it automatically.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 18
     * @zdefault 6
     */
    __publicField(this, "maxSpacing", new Observable(6, () => this._layout()));
    /**
     * Respawn each orb somewhere new after it's collected, so the field never
     * empties. The target count still ends the round.
     *
     * @zui
     * @zgroup Game Spawning
     * @zgrouppriority 190
     * @zpriority 10
     * @zdefault false
     */
    __publicField(this, "respawnCollected", new Observable(false));
    /* ══ Round ══════════════════════════════════════════════════════════ */
    /**
     * Start the round as soon as the experience loads, instead of waiting for
     * the Play button. Leave this off on mobile: the Play tap is also what
     * unlocks the browser's audio context, so autostarting means the first
     * collect sound is silently swallowed.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 100
     * @zdefault false
     */
    __publicField(this, "autoStart", new Observable(false));
    /**
     * Run a countdown. Off means the portal opens purely on the target count.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 90
     * @zdefault true
     */
    __publicField(this, "timerEnabled", new Observable(true, () => {
      this._applyUiVisibility();
      this._syncIntro();
      this._syncHud();
    }));
    /**
     * Length of the round.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 80
     * @ztype time-seconds
     * @zdefault 45
     */
    __publicField(this, "roundTime", new Observable(45));
    /**
     * A 3-2-1 before each round starts, so nobody loses seconds while the
     * scene changes over (Bobo's Hideout folds away during it). The clock
     * starts on GO. 0 turns it off.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 75
     * @ztype time-seconds
     * @zdefault 3
     */
    __publicField(this, "countdown", new Observable(3));
    /**
     * How much time is left when the warning cue starts.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 70
     * @ztype time-seconds
     * @zdefault 10
     */
    __publicField(this, "warningTime", new Observable(10));
    /**
     * What happens when the clock hits zero.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 60
     * @zdefault resetAndIdle
     */
    __publicField(this, "timeoutAction", new Observable("resetAndIdle" /* ResetAndIdle */));
    /**
     * Pause on the fail state for this long before resetting, so a fail
     * timeline has room to play.
     *
     * @zui
     * @zgroup Game Round
     * @zgrouppriority 180
     * @zpriority 50
     * @ztype time-seconds
     * @zdefault 2
     */
    __publicField(this, "resetDelay", new Observable(2));
    /* ══ Placement ══════════════════════════════════════════════════════ */
    /**
     * Show the built-in Place and Reset buttons, replacing the HTML nodes you'd
     * otherwise wire up by hand. The round waits until the scene is placed, so
     * nobody burns clock hunting for a flat surface.
     *
     * Turn this off if your project handles placement some other way — the game
     * then starts straight from the intro as before.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "placementEnabled", new Observable(true, () => this._applyPlacementUi()));
    /**
     * Start the round the moment placement is confirmed. Off leaves the game
     * idle so the player starts it from the menu themselves.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 90
     * @zdefault true
     */
    __publicField(this, "startRoundOnPlace", new Observable(true));
    /**
     * The AR anchor that Place and Reset placement move, driven directly (no
     * timeline needed). Pick a World Tracker's User Placement Anchor Group for
     * the steadiest tracking (it finds real floors and holds room-sized content
     * still), or an Instant World Tracker. Leave empty to keep driving
     * placement with Place / Reset Timeline as before.
     *
     * With a User Placement Anchor Group, turn off its own Show Place Button
     * and Show Restart Placement Button: the game's buttons do that job, and
     * Place waits until the camera is pointing at a floor it has found.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 85
     * @zvalues nodeids three/Object3D/**
     */
    __publicField(this, "placementAnchor", new Observable(
      void 0,
      () => this._bindPlacementAnchor()
    ));
    /**
     * Timeline or state played when the player taps Place. This is where your
     * existing placement animation goes.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "placeTimeline", new Observable(void 0));
    /**
     * Timeline or state played when the player taps Reset placement.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 70
     * @zvalues layerclipids
     */
    __publicField(this, "resetTimeline", new Observable(void 0));
    /**
     * Label on the Place button.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 60
     * @zdefault Place
     */
    __publicField(this, "placeButtonLabel", new Observable("Place", () => this._syncPlacement()));
    /**
     * Show the orienting line of text above the Place button.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 50
     * @zdefault true
     */
    __publicField(this, "showPlaceHint", new Observable(true, () => this._syncPlacement()));
    /**
     * What that line says. Line breaks are preserved.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 40
     * @ztype text-multiline
     * @zdefault Point the white circle at any flat surface and tap to place.
     */
    __publicField(this, "placeHintText", new Observable(
      "Point the white circle at any flat surface and tap to place.",
      () => this._syncPlacement()
    ));
    /**
     * A second, quieter line under the placement instruction.
     *
     * It exists to get ahead of the one failure every AR session has: tracking
     * drifts, the board ends up in a wall, and the player has no idea that is
     * recoverable. The Reset control only appears AFTER placing, so this is the
     * only moment it can be mentioned before it is needed.
     *
     * Its own property rather than two sentences in Place Hint, so it can carry
     * a quieter treatment, be turned off on its own, and be reworded if you move
     * the Reset button out of the bottom-right corner. Blank hides it.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 38
     * @ztype text-multiline
     * @zdefault Lose tracking later? Tap Reset placement, bottom right.
     */
    __publicField(this, "placeHintTip", new Observable(
      "Lose tracking later? Tap Reset placement, bottom right.",
      () => this._syncPlacement()
    ));
    /**
     * Extra space between the hint and the Place button, in pixels.
     *
     * Lifts the text without moving the button, which is the pairing you
     * usually want: the button belongs near the thumb, the instruction wants to
     * be clear of it and further up the view where the camera feed is.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 36
     * @zdefault 18
     */
    __publicField(this, "placeHintLift", new Observable(18, (v) => {
      const n = Math.max(0, Math.min(240, v));
      if (n !== v) this.placeHintLift.value = n;
      this._syncPlacement();
    }));
    /**
     * Caption under the circular Reset button.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 30
     * @zdefault Reset placement
     */
    __publicField(this, "resetButtonLabel", new Observable("Reset placement", () => this._syncPlacement()));
    /**
     * Which corner the Reset button sits in during play. Bottom right keeps it
     * clear of a bottom-left joystick and the top-right menu.
     *
     * @zui
     * @zgroup Game Placement
     * @zgrouppriority 195
     * @zpriority 20
     * @zdefault bottomRight
     */
    __publicField(this, "resetCorner", new Observable("bottomRight" /* BottomRight */, () => this._applyCorner()));
    /* ══ Portal ═════════════════════════════════════════════════════════ */
    /**
     * Where the portal appears, relative to this node.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 100
     * @zdefault [0, 1.7, -14]
     */
    __publicField(this, "portalPosition", new Observable([0, 1.7, -14], (v) => {
      this._portal.position.set(v[0], v[1], v[2]);
    }));
    /**
     * Which way the portal faces.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 90
     * @ztype angle-degrees
     * @zdefault 0
     */
    __publicField(this, "portalRotationY", new Observable(0, (v) => {
      this._portal.rotation.y = v * Math.PI / 180;
    }));
    /**
     * Diameter of the portal once fully open.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 80
     * @zdefault 3.4
     */
    __publicField(this, "portalSize", new Observable(3.4));
    /**
     * How long the portal takes to swell open.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 70
     * @ztype time-seconds
     * @zdefault 1.8
     */
    __publicField(this, "portalOpenTime", new Observable(1.8));
    /**
     * Show the portal from the start instead of hiding it until the target is
     * reached. Useful for signposting where the player is heading.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 60
     * @zdefault false
     */
    __publicField(this, "portalVisibleFromStart", new Observable(false, () => this._applyPortalVisibility()));
    /**
     * Portal rim / highlight colour.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 50
     * @ztype color-norm-rgb
     * @zdefault [0.81, 0.91, 1]
     */
    __publicField(this, "portalColorEdge", new Observable([0.81, 0.91, 1], (v) => {
      setColor(this._portalU.uColorEdge.value, v);
    }));
    /**
     * Portal outer arm colour.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 40
     * @ztype color-norm-rgb
     * @zdefault [0.11, 0.44, 0.94]
     */
    __publicField(this, "portalColorMid", new Observable([0.11, 0.44, 0.94], (v) => {
      setColor(this._portalU.uColorMid.value, v);
    }));
    /**
     * Portal inner arm colour.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 30
     * @ztype color-norm-rgb
     * @zdefault [0.08, 0.82, 0.76]
     */
    __publicField(this, "portalColorInner", new Observable([0.08, 0.82, 0.76], (v) => {
      setColor(this._portalU.uColorInner.value, v);
    }));
    /**
     * Portal output gain.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 20
     * @zdefault 1.05
     */
    __publicField(this, "portalBrightness", new Observable(1.05, (v) => {
      this._portalU.uBrightness.value = v;
    }));
    /* ══ Orb look ═══════════════════════════════════════════════════════ */
    /**
     * Diameter of each orb.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 100
     * @zdefault 0.85
     */
    __publicField(this, "orbSize", new Observable(0.85, () => {
      this._sizeOrbTriggers();
      this._fitPickup();
      this._layout();
    }));
    /**
     * Orb highlight colour.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 90
     * @ztype color-norm-rgb
     * @zdefault [0.87, 0.95, 1]
     */
    __publicField(this, "orbColorEdge", new Observable([0.87, 0.95, 1], (v) => {
      setColor(this._orbU.uColorEdge.value, v);
    }));
    /**
     * Orb silhouette colour. Also tints the halo.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 80
     * @ztype color-norm-rgb
     * @zdefault [0.11, 0.44, 0.94]
     */
    __publicField(this, "orbColorMid", new Observable([0.11, 0.44, 0.94], (v) => {
      setColor(this._orbU.uColorMid.value, v);
      setColor(this._glowU.uColor.value, v);
    }));
    /**
     * Orb colour where it faces the camera.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 70
     * @ztype color-norm-rgb
     * @zdefault [0.09, 0.8, 0.84]
     */
    __publicField(this, "orbColorInner", new Observable([0.09, 0.8, 0.84], (v) => {
      setColor(this._orbU.uColorInner.value, v);
    }));
    /**
     * Orb output gain.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 60
     * @zdefault 1
     */
    __publicField(this, "orbBrightness", new Observable(1, (v) => {
      this._orbU.uBrightness.value = v;
    }));
    /**
     * How fast the plasma churns across each orb.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 50
     * @zdefault 0.3
     */
    __publicField(this, "orbSpeed", new Observable(0.3, (v) => {
      this._orbU.uSpeed.value = v;
    }));
    /**
     * How far each orb bobs up and down as it idles.
     *
     * @zui
     * @zgroup Game Orb Look
     * @zgrouppriority 160
     * @zpriority 40
     * @zdefault 0.12
     */
    __publicField(this, "orbBob", new Observable(0.12, () => this._layout()));
    // moves the spawn ceiling
    /* ══ Beacon ═════════════════════════════════════════════════════════ */
    /**
     * Show a glowing ring on the ground under each orb. Tells the player where
     * to walk and stops floating orbs reading as pasted on.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "beaconEnabled", new Observable(true));
    /**
     * Diameter of the ground ring.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 90
     * @zdefault 2.4
     */
    __publicField(this, "beaconSize", new Observable(2.4, (v) => {
      for (const o of this._orbs) o.beacon.scale.setScalar(v);
    }));
    /**
     * Ground ring colour.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 80
     * @ztype color-norm-rgb
     * @zdefault [0.12, 0.73, 0.94]
     */
    __publicField(this, "beaconColor", new Observable([0.12, 0.73, 0.94], (v) => {
      setColor(this._beaconU.uColor.value, v);
    }));
    /**
     * Ground ring brightness.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 70
     * @zdefault 0.85
     */
    __publicField(this, "beaconIntensity", new Observable(0.85, (v) => {
      this._beaconU.uIntensity.value = v;
    }));
    /**
     * Thickness of the ring's outline.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 60
     * @ztype proportion
     * @zdefault 0.09
     */
    __publicField(this, "beaconRingWidth", new Observable(0.09, (v) => {
      this._beaconU.uRingWidth.value = v;
    }));
    /**
     * How strongly the middle of the ring is filled in.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 50
     * @ztype proportion
     * @zdefault 0.16
     */
    __publicField(this, "beaconPool", new Observable(0.16, (v) => {
      this._beaconU.uPoolStrength.value = v;
    }));
    /**
     * Speed of the pulse travelling outward through the ring.
     *
     * @zui
     * @zgroup Game Beacon
     * @zgrouppriority 150
     * @zpriority 40
     * @zdefault 0.5
     */
    __publicField(this, "beaconWaveSpeed", new Observable(0.5, (v) => {
      this._beaconU.uWaveSpeed.value = v;
    }));
    /* ══ Interface ══════════════════════════════════════════════════════ */
    /**
     * Show the built-in menu button and HUD. Turn this off to build your own UI
     * in Mattercraft's 2D layer and drive the game from the events below.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "uiEnabled", new Observable(true, () => this._applyUiVisibility()));
    /**
     * Which corner the glowing menu button sits in. All four use the notch-safe
     * insets, so nothing lands under a camera cutout.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 90
     * @zdefault topRight
     */
    __publicField(this, "menuCorner", new Observable("topRight" /* TopRight */, () => this._applyCorner()));
    /**
     * Where the score and timer readout sits.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 80
     * @zdefault top
     */
    __publicField(this, "hudPosition", new Observable("top" /* Top */, () => this._applyHudPosition()));
    /**
     * Which side of the screen the HUD column sits on. Centre by default,
     * directly under nothing; Left and Right tuck it into a corner instead,
     * clear of the notch.
     *
     * Watch what else lives in the corner you pick: the menu button is top
     * right, mute bottom left, reset bottom right.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 78
     * @zdefault center
     */
    __publicField(this, "hudAlign", new Observable("center" /* Center */, () => this._applyHudPosition()));
    /**
     * Space between the clock and the count beneath it, in pixels. 0 butts them
     * together into one slab; 40 or so reads as two separate readouts. Clamped
     * to 0–120.
     *
     * Only the gap is yours to set — the count's actual offset is the clock's
     * measured height plus this, so it stays put if the clock's type size ever
     * changes.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 74
     * @zdefault 10
     */
    __publicField(this, "hudGap", new Observable(10, (v) => {
      const n = Math.max(0, Math.min(120, v));
      if (n !== v) this.hudGap.value = n;
      this._applyHudStack();
      this._applyLogoClearance();
    }));
    /**
     * How far down the screen the whole HUD column sits — clock and count
     * together — as a percentage of screen height. Clamped to 0–40, and applied
     * to the bottom edge instead when HUD Position is Bottom.
     *
     * The device's safe-area inset is a FLOOR, not an addition: the column sits
     * wherever you put it, and the inset only stops it climbing under a notch
     * or, in a WebXR session, under the browser's own exit control. So the
     * number here describes where the HUD is rather than where it starts from.
     *
     * Being a percentage rather than pixels is what keeps the placement looking
     * the same on a phone and a tablet.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 75
     * @zdefault 2
     */
    __publicField(this, "timerOffset", new Observable(2, (v) => {
      const n = Math.max(0, Math.min(40, v));
      if (n !== v) this.timerOffset.value = n;
      this._applyTimerOffset();
      this._applyHudStack();
      this._applyLogoClearance();
    }));
    /**
     * Accent colour for the UI — button glow, progress bar, active text.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 70
     * @ztype color-norm-rgb
     * @zdefault [0.31, 0.84, 0.91]
     */
    __publicField(this, "uiAccent", new Observable(
      [0.31, 0.84, 0.91],
      () => this._applyMode()
    ));
    /**
     * The interface colour while Lounge mode is open.
     *
     * The whole UI switches to it — menu, toggles, the Join button, the Place
     * button, the menu button itself — so at any moment the colour tells you
     * which mode you're in without reading a word. That's the job: mode is
     * otherwise invisible state, and invisible state is what makes people press
     * the wrong thing.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 76
     * @ztype color-norm-rgb
     * @zdefault [1, 0.36, 0.71]
     */
    __publicField(this, "loungeAccent", new Observable(
      [1, 0.36, 0.71],
      // The reward panel's lounge row wears it too, so that row stays
      // recognisable as the same destination the menu offers.
      () => {
        this._applyMode();
        this._syncRewardModalTheme();
      }
    ));
    /**
     * Title shown at the top of the menu.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 60
     * @zdefault Cola Run
     */
    __publicField(this, "menuTitle", new Observable("Cola Run", () => this._syncMenu()));
    /**
     * Word above the score in the HUD. It named the pickup back when the pickup
     * was always an orb; with Pickup Kind able to be anything, it has to be
     * yours. Keep it short — it sits in a narrow top-left block.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 58
     * @zdefault Cans
     */
    __publicField(this, "scoreLabel", new Observable("Cans", () => this._syncHudLabels()));
    /**
     * Word above the countdown in the HUD.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 57
     * @zdefault Time
     */
    __publicField(this, "timeLabel", new Observable("Time", () => this._syncHudLabels()));
    /**
     * Show a quick mute button, so players can silence the game without opening
     * the menu. It mutes music and effects together and stays in sync with the
     * two toggles inside the menu.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 50
     * @zdefault true
     */
    __publicField(this, "soundToggleEnabled", new Observable(true, () => this._applyUiVisibility()));
    /**
     * Which corner the quick mute button sits in. Check this against your own
     * on-screen controls — a bottom-left joystick will want it moved.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 40
     * @zdefault bottomLeft
     */
    __publicField(this, "soundToggleCorner", new Observable("bottomLeft" /* BottomLeft */, () => this._applyCorner()));
    /**
     * How high the dialogs sit above everything else on screen.
     *
     * Mattercraft's overlay gives its children no stacking order of their own,
     * so whatever was added to the scene LAST paints on top — which is how an
     * on-screen joystick ends up drawn over a modal's own buttons, swallowing
     * the taps meant for them. This component stacks itself explicitly instead:
     * the logo at the bottom, then the HUD, then the corner controls, then the
     * celebration, then every dialog at this number, and the image viewer one
     * above that.
     *
     * The default clears anything you are realistically stacking against. Raise
     * it only if something else in your scene sets a z-index higher still.
     *
     * @zui
     * @zgroup Game Interface
     * @zgrouppriority 140
     * @zpriority 30
     * @zdefault 2000000
     */
    __publicField(this, "modalLayer", new Observable(2e6, () => this._applyLayerOrder()));
    /* ══ Logo ═══════════════════════════════════════════════════════════ */
    /**
     * Your logo, watermarked over the AR view. Pick a project file or paste a
     * URL. Leave it empty and nothing is drawn at all.
     *
     * A transparent PNG or an SVG works best — the view behind it is a live
     * camera feed, so a logo on a solid white rectangle will look pasted on.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 100
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "logoImage", new Observable("", () => this._applyLogo()));
    /**
     * Where tapping the logo goes. Blank makes it a plain watermark again.
     *
     * It always opens in a NEW tab, and that is not a property. Navigating the
     * current tab away ends the WebXR session, drops the placed board and puts
     * the player back at the camera-permission prompt if they return — an
     * unrecoverable exit dressed up as a link.
     *
     * Only the image itself becomes tappable, never its anchor: the anchor is a
     * full-width overlay child, and Mattercraft's core CSS forces
     * pointer-events:auto on those with an ID selector no class can outrank, so
     * making the wrapper interactive would swallow every tap on the AR view
     * behind it.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 55
     * @zdefault https://medialife.ai/
     */
    __publicField(this, "logoUrl", new Observable("https://medialife.ai/", () => this._applyLogo()));
    /**
     * What a screen reader announces for that link. A link whose only content
     * is an image with no alt text is announced as its URL, which is no help to
     * anybody. Ignored when Logo URL is blank.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 54
     * @zdefault Visit MEDIALIFE
     */
    __publicField(this, "logoLinkLabel", new Observable("Visit MEDIALIFE", () => this._applyLogo()));
    /**
     * Which corner the logo sits in. Top left by default.
     *
     * The score block and the timer both move down to make room rather than
     * sitting under the logo, so top left stays usable at any logo size.
     *
     * The other three corners hold controls that do NOT move out of the way —
     * the menu button top right, mute bottom left, reset bottom right — so
     * check the logo against those before putting a large one there.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 90
     * @zdefault topLeft
     */
    __publicField(this, "logoCorner", new Observable("topLeft" /* TopLeft */, () => this._applyLogo()));
    /**
     * Logo width, as a percentage of the screen's SHORTER side.
     *
     * Measuring against the shorter side is what makes it survive rotation: a
     * percentage of width would double in size when a phone turns landscape.
     * Pair it with Logo Max Width so it stops growing on a desktop monitor.
     * Clamped to 4–60.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 80
     * @zdefault 22
     */
    __publicField(this, "logoSize", new Observable(22, (v) => {
      const n = Math.max(4, Math.min(60, v));
      if (n !== v) this.logoSize.value = n;
      this._applyLogo();
    }));
    /**
     * Ceiling on the logo's width in pixels, so it doesn't become a billboard
     * on a large screen. Clamped to 24–600.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 70
     * @zdefault 160
     */
    __publicField(this, "logoMaxWidth", new Observable(160, (v) => {
      const n = Math.max(24, Math.min(600, v));
      if (n !== v) this.logoMaxWidth.value = n;
      this._applyLogo();
    }));
    /**
     * Gap between the logo and the screen edge, sideways, in pixels. Measured
     * from inside the notch, so it never lands under a camera cutout.
     * Clamped to 0–200.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 60
     * @zdefault 14
     */
    __publicField(this, "logoOffsetX", new Observable(14, (v) => {
      const n = Math.max(0, Math.min(200, v));
      if (n !== v) this.logoOffsetX.value = n;
      this._applyLogo();
    }));
    /**
     * Gap between the logo and the top or bottom edge, in pixels. Clamped to
     * 0–200.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 50
     * @zdefault 14
     */
    __publicField(this, "logoOffsetY", new Observable(14, (v) => {
      const n = Math.max(0, Math.min(200, v));
      if (n !== v) this.logoOffsetY.value = n;
      this._applyLogo();
    }));
    /**
     * Logo opacity. Dropping it to around 0.8 keeps a logo present without it
     * competing with the game for attention.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 40
     * @ztype proportion
     * @zdefault 1
     */
    __publicField(this, "logoOpacity", new Observable(1, () => this._applyLogo()));
    /**
     * Keep the logo on screen during a round. Off shows it only when the game
     * is not being played — the intro, the menu, the lounge, the placement
     * step — which keeps the playfield clear.
     *
     * @zui
     * @zgroup Game Logo
     * @zgrouppriority 145
     * @zpriority 30
     * @zdefault true
     */
    __publicField(this, "logoInGame", new Observable(true, () => this._applyUiVisibility()));
    /* ══ Audio ══════════════════════════════════════════════════════════ */
    /**
     * Master volume for all four game sounds.
     *
     * @zui
     * @zgroup Game Audio
     * @zgrouppriority 130
     * @zpriority 100
     * @ztype proportion
     * @zdefault 0.7
     */
    __publicField(this, "volume", new Observable(0.7, (v) => {
      this._sfxCollect.volume.value = v;
      this._sfxWin.volume.value = v;
      this._sfxReward.volume.value = v;
      this._sfxWarn.volume.value = v;
      this._sfxFail.volume.value = v;
      this._sfxHum.volume.value = v;
      this._audio?.setMasterVolume(v);
    }));
    /**
     * How much the collect sound pitches up with each orb in a streak. 0 plays
     * the same pitch every time; 0.06 gives a rising combo without going shrill.
     * Capped at 12 steps.
     *
     * @zui
     * @zgroup Game Audio
     * @zgrouppriority 130
     * @zpriority 90
     * @zdefault 0.06
     */
    __publicField(this, "collectPitchStep", new Observable(0.06));
    /**
     * Sound effects on. Also exposed as a toggle in the player's menu, and the
     * two stay in sync in both directions.
     *
     * @zui
     * @zgroup Game Audio
     * @zgrouppriority 130
     * @zpriority 80
     * @zdefault true
     */
    __publicField(this, "soundEnabled", new Observable(true, (v) => {
      this._audio?.setSfx(v);
      this._syncToggles();
    }));
    /**
     * Background music on. Also a toggle in the player's menu.
     *
     * @zui
     * @zgroup Game Audio
     * @zgrouppriority 130
     * @zpriority 70
     * @zdefault true
     */
    __publicField(this, "musicEnabled", new Observable(true, (v) => {
      this._audio?.setMusic(v);
      this._applyMusicSource();
      this._syncToggles();
    }));
    /**
     * Level of the background music, relative to the master volume.
     *
     * @zui
     * @zgroup Game Audio
     * @zgrouppriority 130
     * @zpriority 60
     * @ztype proportion
     * @zdefault 0.5
     */
    /**
     * When the background music starts. On Load begins as soon as the browser
     * unlocks audio; On Game Start keeps the intro screen quiet and only brings
     * the music in once a round begins.
     *
     * @zui
     * @zgroup Game Audio
     * @zgrouppriority 130
     * @zpriority 55
     * @zdefault onGameStart
     */
    __publicField(this, "musicStart", new Observable("onGameStart" /* OnGameStart */, () => this._applyMusicSource()));
    __publicField(this, "musicVolume", new Observable(0.5, (v) => {
      if (this._audio) {
        this._audio.musicLevel = v;
        if (this.musicEnabled.value) this._audio.setMusic(true);
      }
      this._sfxMusic.volume.value = v;
    }));
    /* ══ Intro ══════════════════════════════════════════════════════════ */
    /**
     * Show the how-to-play modal when the experience loads. Recommended: its
     * Start button is the user gesture that unlocks browser audio, so the first
     * collect sound is actually audible.
     *
     * @zui
     * @zgroup Game Intro
     * @zgrouppriority 125
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "showIntroOnLoad", new Observable(true));
    /**
     * Heading on the intro modal.
     *
     * @zui
     * @zgroup Game Intro
     * @zgrouppriority 125
     * @zpriority 90
     * @zdefault Cola Run
     */
    __publicField(this, "introTitle", new Observable("Cola Run", () => this._syncIntro()));
    /**
     * Intro copy, shown under the heading. Line breaks are preserved.
     *
     * @zui
     * @zgroup Game Intro
     * @zgrouppriority 125
     * @zpriority 80
     * @ztype text-multiline
     * @zdefault Gather these scattered Cola cans before the clock runs out. Collect enough and the portal will open.
     */
    __publicField(this, "introBody", new Observable(
      "Gather these scattered Cola cans before the clock runs out. Collect enough and the portal will open.",
      () => this._syncIntro()
    ));
    /**
     * Label on the intro's primary button.
     *
     * @zui
     * @zgroup Game Intro
     * @zgrouppriority 125
     * @zpriority 70
     * @zdefault Start playing
     */
    __publicField(this, "introButtonLabel", new Observable("Start playing", () => this._syncIntro()));
    /**
     * Label on the intro's secondary button when Lounge mode is off. With it on,
     * Lounge Button Label is used instead.
     *
     * @zui
     * @zgroup Game Intro
     * @zgrouppriority 125
     * @zpriority 55
     * @zdefault Maybe later
     */
    __publicField(this, "introDismissLabel", new Observable("Maybe later", () => this._syncIntro()));
    /**
     * Artwork across the top of the intro modal. 16:9 crops best. Pick a project
     * file or paste a URL; leave blank to hide the image and show text only.
     *
     * @zui
     * @zgroup Game Intro
     * @zgrouppriority 125
     * @zpriority 60
     * @zvalues files *.+(jpg|jpeg|png|webp)
     */
    __publicField(this, "introImage", new Observable("", () => this._applyIntroImage()));
    /* ── Legend row 1 ── */
    /**
     * Row 1 of the intro legend.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 1
     * @zgrouppriority 124
     * @zpriority 100
     * @zdefault can
     */
    __publicField(this, "legend1Icon", new Observable("can" /* Can */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 1
     * @zgrouppriority 124
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend1IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 1
     * @zgrouppriority 124
     * @zpriority 80
     * @zdefault Collect the cans
     */
    __publicField(this, "legend1Title", new Observable("Collect the cans", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 1
     * @zgrouppriority 124
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault Walk into a can to pick it up. Look for the ring of light on the ground beneath each one.
     */
    __publicField(this, "legend1Text", new Observable("Walk into a can to pick it up. Look for the ring of light on the ground beneath each one.", () => this._syncIntro()));
    /* ── Legend row 2 ── */
    /**
     * Row 2 of the intro legend.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 2
     * @zgrouppriority 123
     * @zpriority 100
     * @zdefault score
     */
    __publicField(this, "legend2Icon", new Observable("score" /* Score */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 2
     * @zgrouppriority 123
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend2IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 2
     * @zgrouppriority 123
     * @zpriority 80
     * @zdefault Score \u2014 top left
     */
    __publicField(this, "legend2Title", new Observable("Score \u2014 top left", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 2
     * @zgrouppriority 123
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault How many you've gathered, and how many you still need.
     */
    __publicField(this, "legend2Text", new Observable("How many you've gathered, and how many you still need.", () => this._syncIntro()));
    /* ── Legend row 3 ── */
    /**
     * Row 3 of the intro legend.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 3
     * @zgrouppriority 122
     * @zpriority 100
     * @zdefault timer
     */
    __publicField(this, "legend3Icon", new Observable("timer" /* Timer */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 3
     * @zgrouppriority 122
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend3IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 3
     * @zgrouppriority 122
     * @zpriority 80
     * @zdefault Timer \u2014 top centre
     */
    __publicField(this, "legend3Title", new Observable("Timer \u2014 top centre", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 3
     * @zgrouppriority 122
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault Seconds remaining. It turns orange when you're running out.
     */
    __publicField(this, "legend3Text", new Observable("Seconds remaining. It turns orange when you're running out.", () => this._syncIntro()));
    /* ── Legend row 4 ── */
    /**
     * Row 4 of the intro legend.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 4
     * @zgrouppriority 121
     * @zpriority 100
     * @zdefault menu
     */
    __publicField(this, "legend4Icon", new Observable("menu" /* Menu */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 4
     * @zgrouppriority 121
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend4IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 4
     * @zgrouppriority 121
     * @zpriority 80
     * @zdefault Menu button
     */
    __publicField(this, "legend4Title", new Observable("Menu button", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 4
     * @zgrouppriority 121
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault Tap the glowing button in the corner for play, pause, restart and sound.
     */
    __publicField(this, "legend4Text", new Observable("Tap the glowing button in the corner for play, pause, restart and sound.", () => this._syncIntro()));
    /* ── Legend row 5 ── */
    /**
     * A spare row. Give it a title or some text and it appears in the intro; leave both blank and it stays hidden.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 5
     * @zgrouppriority 120
     * @zpriority 100
     * @zdefault none
     */
    __publicField(this, "legend5Icon", new Observable("none" /* None */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 5
     * @zgrouppriority 120
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend5IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 5
     * @zgrouppriority 120
     * @zpriority 80
     * @zdefault 
     */
    __publicField(this, "legend5Title", new Observable("", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 5
     * @zgrouppriority 120
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault 
     */
    __publicField(this, "legend5Text", new Observable("", () => this._syncIntro()));
    /* ── Legend row 6 ── */
    /**
     * A spare row. Give it a title or some text and it appears in the intro; leave both blank and it stays hidden.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 6
     * @zgrouppriority 119
     * @zpriority 100
     * @zdefault none
     */
    __publicField(this, "legend6Icon", new Observable("none" /* None */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 6
     * @zgrouppriority 119
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend6IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 6
     * @zgrouppriority 119
     * @zpriority 80
     * @zdefault 
     */
    __publicField(this, "legend6Title", new Observable("", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 6
     * @zgrouppriority 119
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault 
     */
    __publicField(this, "legend6Text", new Observable("", () => this._syncIntro()));
    /* ── Legend row 7 ── */
    /**
     * A spare row. Give it a title or some text and it appears in the intro; leave both blank and it stays hidden.
     *
     * Icon for this row. Score and Timer draw the round's live values.
     *
     * @zui
     * @zgroup Intro Legend 7
     * @zgrouppriority 118
     * @zpriority 100
     * @zdefault none
     */
    __publicField(this, "legend7Icon", new Observable("none" /* None */, () => this._syncIntro()));
    /**
     * Optional image for this row, overriding the icon above. Square artwork
     * works best. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Intro Legend 7
     * @zgrouppriority 118
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|svg)
     */
    __publicField(this, "legend7IconImage", new Observable("", () => this._syncIntro()));
    /**
     * Bold heading for this row.
     *
     * @zui
     * @zgroup Intro Legend 7
     * @zgrouppriority 118
     * @zpriority 80
     * @zdefault 
     */
    __publicField(this, "legend7Title", new Observable("", () => this._syncIntro()));
    /**
     * Explanatory line under the heading. Blank both this and the heading to
     * hide the row entirely.
     *
     * @zui
     * @zgroup Intro Legend 7
     * @zgrouppriority 118
     * @zpriority 70
     * @ztype text-multiline
     * @zdefault 
     */
    __publicField(this, "legend7Text", new Observable("", () => this._syncIntro()));
    /* ══ Digital Exclusive ══════════════════════════════════════════════
       The reward moment: a celebration when the target is reached, and a
       standing Claim call-to-action in the menu. The CTA does NOT depend on
       finishing the round — the exclusive is already theirs; the game is the
       experience around it.                                                  */
    /**
     * Show a celebration when the target is reached and the portal opens.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "rewardEnabled", new Observable(true));
    /**
     * How long the portal's hum keeps playing after it opens, in seconds. The
     * drone is atmosphere for the reveal, not a permanent state — left running
     * it becomes the sound of the app being stuck.
     *
     * 0 keeps it going until the round resets. If Portal Hide After is set, the
     * hum stops with the portal regardless of this. Clamped to 0–120.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 25
     * @zdefault 6
     */
    __publicField(this, "portalHumSeconds", new Observable(6, (v) => {
      const n = Math.max(0, Math.min(120, v));
      if (n !== v) this.portalHumSeconds.value = n;
    }));
    /**
     * Seconds the portal stays open before closing itself, counted from the
     * moment it finishes opening. 0 leaves it open until the round resets.
     *
     * It closes with the same animation it opened with, in reverse, and takes
     * the hum with it — so if you set this, you don't need to think about the
     * sound at all.
     *
     * @zui
     * @zgroup Game Portal
     * @zgrouppriority 170
     * @zpriority 24
     * @zdefault 0
     */
    __publicField(this, "portalHideAfter", new Observable(0, (v) => {
      const n = Math.max(0, Math.min(300, v));
      if (n !== v) this.portalHideAfter.value = n;
    }));
    /**
     * Show the full-screen gradient wordmark — cinematic, best when the reveal
     * itself is the hero.
     *
     * The three pieces of the reward moment are independent switches rather than
     * one dropdown, so any combination works: wordmark only, modal only, badge
     * plus modal, or all three in sequence. Turn everything off here and use
     * Reward Timeline if you'd rather author the whole moment yourself.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 97
     * @zdefault true
     */
    __publicField(this, "rewardWordmark", new Observable(true));
    /**
     * Show the console-style achievement pill at the bottom of the screen. It
     * stays out of the way, so it reads well over a portal reveal.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 96
     * @zdefault true
     */
    __publicField(this, "rewardBadge", new Observable(true));
    /**
     * Small line above the headline. Keep it short — it's set in wide caps.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 92
     * @zdefault Unlocked
     */
    __publicField(this, "rewardKicker", new Observable("Unlocked", () => this._syncReward()));
    /**
     * The headline itself. Short, punchy and uppercase reads best in the
     * wordmark style — long sentences shrink to fit and lose their impact.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 88
     * @zdefault DIGITAL EXCLUSIVE
     */
    __publicField(this, "rewardTitle", new Observable("DIGITAL EXCLUSIVE", () => this._syncReward()));
    /**
     * Supporting line under the headline, and the second line on the badge.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 84
     * @ztype text-multiline
     * @zdefault You've unlocked your digital exclusive.
     */
    __publicField(this, "rewardMessage", new Observable(
      "You've unlocked your digital exclusive.",
      () => this._syncReward()
    ));
    /**
     * Emblem shown on the badge and above the wordmark.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 80
     * @zdefault trophy
     */
    __publicField(this, "rewardIcon", new Observable("trophy" /* Trophy */, () => this._syncReward()));
    /**
     * Start of the headline gradient — the colour at the top of the letters.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 76
     * @ztype color
     * @zdefault #6ff2ff
     */
    __publicField(this, "rewardColorA", new Observable("#6ff2ff", () => this._syncRewardTheme()));
    /**
     * End of the headline gradient — the colour at the bottom of the letters.
     * A hue shift between the two is what makes the wordmark read as a gradient
     * rather than a flat tint.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 72
     * @ztype color
     * @zdefault #a07bff
     */
    __publicField(this, "rewardColorB", new Observable("#a07bff", () => this._syncRewardTheme()));
    /**
     * Icon colour, and the tint of the badge's glow.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 68
     * @ztype color
     * @zdefault #eafcff
     */
    __publicField(this, "rewardIconColor", new Observable("#eafcff", () => this._syncRewardTheme()));
    /**
     * Electric treatment — a light sweep across the letters, arcing filaments
     * and a burst of sparks. Turn it off for a calmer, more premium reveal.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 64
     * @zdefault true
     */
    __publicField(this, "rewardElectric", new Observable(true, () => this._syncRewardTheme()));
    /**
     * Beat of silence between the portal opening and the celebration, in
     * seconds. A short pause lets the portal register before the text lands.
     * Clamped to 0–5.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 60
     * @zdefault 0.45
     */
    __publicField(this, "rewardDelay", new Observable(0.45, (v) => {
      const n = Math.max(0, Math.min(5, v));
      if (n !== v) this.rewardDelay.value = n;
    }));
    /**
     * How long the celebration stays on screen, in seconds. In Both mode this
     * is the wordmark's time; the badge holds for a little longer. Clamped to
     * 1–20.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 56
     * @zdefault 3.4
     */
    __publicField(this, "rewardDuration", new Observable(3.4, (v) => {
      const n = Math.max(1, Math.min(20, v));
      if (n !== v) this.rewardDuration.value = n;
    }));
    /* ── the reward modal ──────────────────────────────────────────────── */
    /**
     * Show a centred modal at the end of the round — glass panel, glowing
     * border, artwork and a claim button. This is the conversion moment: the
     * wordmark and badge celebrate, the modal is what someone acts on.
     *
     * It appears after the wordmark has finished, so the two never fight.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "rewardModal", new Observable(true, () => this._syncRewardModal()));
    /* ══ Instructions ═══════════════════════════════════════════════════ */
    /**
     * What the reward panel shows when the round is won.
     *
     * Reward is the celebration: artwork, a headline and the Claim button.
     * Instructions is the same panel carrying the redemption steps instead —
     * for a prize that lives somewhere else, the moment someone wins is the
     * moment they want to know how to get it, and sending them hunting through
     * a menu for that loses people.
     *
     * The steps themselves are the same ones the How To Claim screen shows, so
     * there is one set of copy to keep right rather than two.
     *
     * @zui
     * @zgroup Game Instructions
     * @zgrouppriority 162
     * @zpriority 100
     * @zdefault reward
     */
    __publicField(this, "rewardModalContent", new Observable(
      "reward" /* Reward */,
      () => this._syncRewardModal()
    ));
    /**
     * Heading on the How To Claim screen.
     *
     * @zui
     * @zgroup Game Instructions
     * @zgrouppriority 162
     * @zpriority 95
     * @zdefault How to claim your item
     */
    __publicField(this, "instructionsTitle", new Observable(
      "How to claim your item",
      () => this._syncInstructions()
    ));
    /**
     * Label on the menu row that opens the How To Claim screen. Blank hides
     * the row, leaving the reward panel as the only route to the steps.
     *
     * @zui
     * @zgroup Game Instructions
     * @zgrouppriority 162
     * @zpriority 90
     * @zdefault How to claim
     */
    __publicField(this, "instructionsMenuLabel", new Observable(
      "How to claim",
      () => {
        this._syncInstructions();
        this._syncMenu();
      }
    ));
    /**
     * Label on the button that closes the How To Claim screen.
     *
     * @zui
     * @zgroup Game Instructions
     * @zgrouppriority 162
     * @zpriority 85
     * @zdefault Got it
     */
    __publicField(this, "instructionsCloseLabel", new Observable(
      "Got it",
      () => this._syncInstructions()
    ));
    /**
     * What a screen reader announces for a step's screenshot.
     *
     * Every screenshot in the steps is tappable — at step width they're too
     * small to read the thing they point at, so tapping one opens it full
     * screen with a zoom. This is the name of that control. It lives here
     * rather than hardcoded so a non-English build can translate it.
     *
     * @zui
     * @zgroup Game Instructions
     * @zgrouppriority 162
     * @zpriority 80
     * @zdefault View image full screen
     */
    __publicField(this, "imageViewerOpenLabel", new Observable(
      "View image full screen",
      () => this._syncInstructions()
    ));
    /**
     * Step 1. A step with no text is skipped entirely, so blank the ones you
     * don't need rather than hiding them some other way.
     *
     * @zui
     * @zgroup Instruction Step 1
     * @zgrouppriority 161
     * @zpriority 100
     * @ztype text-multiline
     * @zdefault Join Evade on Roblox.
     */
    __publicField(this, "step1Text", new Observable(
      "Join Evade on Roblox.",
      () => this._syncInstructions()
    ));
    /**
     * Screenshot shown under step 1. Pick a project file or paste a URL.
     *
     * @zui
     * @zgroup Instruction Step 1
     * @zgrouppriority 161
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|gif)
     */
    __publicField(this, "step1Image", new Observable("", () => this._syncInstructions()));
    /**
     * A link button under step 1 — where "Join Evade" actually goes. Leave it
     * blank for no button. A tappable button beats a pasted URL: nobody types
     * a roblox.com link off a phone screen.
     *
     * @zui
     * @zgroup Instruction Step 1
     * @zgrouppriority 161
     * @zpriority 80
     * @zdefault https://www.roblox.com/games/9872472334/Evade
     */
    __publicField(this, "step1Link", new Observable(
      "https://www.roblox.com/games/9872472334/Evade",
      () => this._syncInstructions()
    ));
    /**
     * Label on step 1's link button.
     *
     * @zui
     * @zgroup Instruction Step 1
     * @zgrouppriority 161
     * @zpriority 70
     * @zdefault Open Evade on Roblox
     */
    __publicField(this, "step1LinkLabel", new Observable(
      "Open Evade on Roblox",
      () => this._syncInstructions()
    ));
    /**
     * Step 2.
     *
     * @zui
     * @zgroup Instruction Step 2
     * @zgrouppriority 160
     * @zpriority 100
     * @ztype text-multiline
     * @zdefault Open the Codes panel — it's the bird icon on the right of the main menu.
     */
    __publicField(this, "step2Text", new Observable(
      "Open the Codes panel \u2014 it's the bird icon on the right of the main menu.",
      () => this._syncInstructions()
    ));
    /**
     * Screenshot shown under step 2.
     *
     * @zui
     * @zgroup Instruction Step 2
     * @zgrouppriority 160
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|gif)
     */
    __publicField(this, "step2Image", new Observable("", () => this._syncInstructions()));
    /**
     * Step 3.
     *
     * @zui
     * @zgroup Instruction Step 3
     * @zgrouppriority 159
     * @zpriority 100
     * @ztype text-multiline
     * @zdefault Enter BOBO_COLA_RDC26 to claim your free UGC item.
     */
    __publicField(this, "step3Text", new Observable(
      "Enter BOBO_COLA_RDC26 to claim your free UGC item.",
      () => this._syncInstructions()
    ));
    /**
     * Screenshot shown under step 3.
     *
     * @zui
     * @zgroup Instruction Step 3
     * @zgrouppriority 159
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|gif)
     */
    __publicField(this, "step3Image", new Observable("", () => this._syncInstructions()));
    /**
     * The code itself, shown as a copyable chip in whichever step mentions it.
     * Blank to leave it out. Tapping it copies the code to the clipboard.
     *
     * @zui
     * @zgroup Instruction Step 3
     * @zgrouppriority 159
     * @zpriority 80
     * @zdefault BOBO_COLA_RDC26
     */
    __publicField(this, "claimCode", new Observable("BOBO_COLA_RDC26", () => this._syncInstructions()));
    /**
     * Step 4, blank by default — room for one more step without a rebuild.
     *
     * @zui
     * @zgroup Instruction Step 4
     * @zgrouppriority 158
     * @zpriority 100
     * @ztype text-multiline
     */
    __publicField(this, "step4Text", new Observable("", () => this._syncInstructions()));
    /**
     * Screenshot shown under step 4.
     *
     * @zui
     * @zgroup Instruction Step 4
     * @zgrouppriority 158
     * @zpriority 90
     * @zvalues files *.+(jpg|jpeg|png|webp|gif)
     */
    __publicField(this, "step4Image", new Observable("", () => this._syncInstructions()));
    /* ══ Timeout ════════════════════════════════════════════════════════ */
    /**
     * Show a panel when the clock runs out, offering a rematch.
     *
     * Without it the round just stops — the fail sound plays, the board either
     * freezes or quietly resets, and the player is left looking at an AR view
     * with no idea what happened or what to do. The panel names the outcome and
     * gives two ways forward.
     *
     * It takes over from Timeout Action: with the panel on, the round waits for
     * the player instead of resetting itself, because a board that rebuilds
     * underneath an open dialog reads as a glitch.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "timeoutModal", new Observable(true, () => this._syncTimeoutModal()));
    /**
     * Heading on the timeout panel. Short — it's the loudest line on screen.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 90
     * @zdefault Out of time
     */
    __publicField(this, "timeoutTitle", new Observable("Out of time", () => this._syncTimeoutModal()));
    /**
     * The line under the heading. Say what happened in the player's terms.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 80
     * @ztype text-multiline
     * @zdefault You didn't collect enough cans in time.
     */
    __publicField(this, "timeoutBody", new Observable(
      "You didn't collect enough cans in time.",
      () => this._syncTimeoutModal()
    ));
    /**
     * Label on the primary button, which starts a fresh round.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 70
     * @zdefault Retry
     */
    __publicField(this, "timeoutRetryLabel", new Observable("Retry", () => this._syncTimeoutModal()));
    /**
     * Label on the second button, which opens Lounge mode. The button hides
     * itself when Lounge Mode is off, leaving Retry as the only way on.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 60
     * @zdefault Go to lounge mode
     */
    __publicField(this, "timeoutLoungeLabel", new Observable(
      "Go to lounge mode",
      () => this._syncTimeoutModal()
    ));
    /**
     * Seconds between the clock hitting zero and the panel appearing. A short
     * pause lets the fail sound and the fail timeline land first — arriving on
     * the same frame as the buzzer reads as an error message. Clamped to 0–10.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 50
     * @zdefault 0.8
     */
    __publicField(this, "timeoutDelay", new Observable(0.8, (v) => {
      const n = Math.max(0, Math.min(10, v));
      if (n !== v) this.timeoutDelay.value = n;
    }));
    /**
     * Edge light and glow colour for the timeout panel. Warm by default, so it
     * reads as a setback at a glance rather than as another reward.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 40
     * @ztype color-hex
     * @zdefault #ff8a6b
     */
    __publicField(this, "timeoutAccent", new Observable("#ff8a6b", () => this._syncTimeoutTheme()));
    /**
     * Second colour in the timeout panel's edge gradient.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 30
     * @ztype color-hex
     * @zdefault #ff5470
     */
    __publicField(this, "timeoutAccent2", new Observable("#ff5470", () => this._syncTimeoutTheme()));
    /**
     * Seconds between whatever ran before the modal finishing and the modal
     * opening. With the wordmark on, that's measured from the end of the
     * wordmark; with nothing before it, from the moment the round is won.
     *
     * Measuring from the end rather than from the win is deliberate: changing
     * Reward Duration would otherwise silently pull the modal back on top of
     * the celebration it was set to follow. Clamped to 0–30.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 98
     * @zdefault 0.35
     */
    __publicField(this, "rewardModalDelay", new Observable(0.35, (v) => {
      const n = Math.max(0, Math.min(30, v));
      if (n !== v) this.rewardModalDelay.value = n;
    }));
    /**
     * Small line above the modal's heading. Blank to hide it.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 96
     * @zdefault Congratulations
     */
    __publicField(this, "rewardModalKicker", new Observable("Congratulations", () => this._syncRewardModal()));
    /**
     * The modal's heading.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 92
     * @zdefault Evade Exclusive Unlocked
     */
    __publicField(this, "rewardModalTitle", new Observable("Evade Exclusive Unlocked", () => this._syncRewardModal()));
    /**
     * Body copy under the heading. Keep it to a line or two — this is a moment,
     * not a page.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 88
     * @ztype text-multiline
     * @zdefault You've earned it. Claim your digital exclusive to keep it.
     */
    __publicField(this, "rewardModalBody", new Observable(
      "You've earned it. Claim your digital exclusive to keep it.",
      () => this._syncRewardModal()
    ));
    /**
     * What the modal's primary button does.
     *
     * **How to Claim** (the default) opens the step-by-step screen. The item is
     * redeemed with a code typed into another app, so a player dropped at that
     * app's front door without the code has been sent nowhere — the steps are
     * the actual claim, and this is the moment they'll follow them.
     *
     * **Open Link** follows Claim URL instead, for a prize that genuinely is one
     * link away. Either way, Claim Timeline still plays and On Claimed still
     * fires, so a scene reacting to the claim doesn't care which you picked.
     *
     * Set this and Claim Button Label together — a button reading "How to
     * Claim" that leaves for a website is the kind of surprise people stop
     * trusting a button over.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 86
     * @zdefault instructions
     */
    __publicField(this, "rewardModalButtonAction", new Observable(
      "instructions" /* Instructions */,
      () => this._syncRewardModal()
    ));
    /**
     * Label on the modal's primary button. Blank hides the button entirely,
     * leaving the close row as the only way out of the panel.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 84
     * @zdefault How to Claim
     */
    __publicField(this, "rewardModalButtonLabel", new Observable(
      "How to Claim",
      () => this._syncRewardModal()
    ));
    /**
     * Offer another round straight from the reward panel.
     *
     * On by default. Winning is the moment somebody most wants to go again, and
     * without this the only way back to a round is the menu — two taps and a
     * scan of a list, which is enough friction to end the session there.
     *
     * The rows read Replay, Lounge, then Claim last — the two free, reversible
     * choices first and the commercial one at the end of the list, where it is
     * also the only filled row and the last thing the eye passes over.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 83
     * @zdefault true
     */
    __publicField(this, "rewardModalReplay", new Observable(true, () => this._syncRewardModal()));
    /**
     * Label on that button. Blank hides it, same as turning the toggle off.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 82
     * @zdefault Replay
     */
    __publicField(this, "rewardModalReplayLabel", new Observable(
      "Replay",
      () => this._syncRewardModal()
    ));
    /**
     * Offer the lounge from the reward panel too.
     *
     * On by default, and it disappears on its own when Lounge Mode is off, so
     * there is never a row leading somewhere that doesn't exist.
     *
     * With this the panel covers all three things a player might want after a
     * win — go again, take the prize, or just hang out with Bobo — and none of
     * them costs a trip through the menu. It wears the lounge's own colour, so
     * the row is recognisable as the same destination the menu offers.
     *
     * It reuses **Lounge Button Label** rather than adding a second copy of the
     * same words: two labels for one destination is two things to keep in step,
     * and they drift the first time one of them is edited.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 81
     * @zdefault true
     */
    __publicField(this, "rewardModalLounge", new Observable(true, () => this._syncRewardModal()));
    /**
     * Fill colour for the panel's Claim button.
     *
     * A pale blue by default, deliberately unlike the other two rows: Replay
     * wears the panel's own accent and Lounge wears the lounge pink, so three
     * destinations read as three destinations at a glance rather than as a
     * stack of identical buttons.
     *
     * The label colour is not a property. It's chosen by measuring contrast
     * against whatever you pick — black on a pale fill, white on a deep one —
     * because a fill this light with white text on it is illegible, and that is
     * not a trade worth exposing as a setting.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 79
     * @ztype color-norm-rgb
     * @zdefault [0.55, 0.82, 0.98]
     */
    __publicField(this, "rewardModalClaimColor", new Observable(
      [0.55, 0.82, 0.98],
      () => this._syncRewardModalTheme()
    ));
    /**
     * Label on the modal's dismiss button. Blank to hide it — but leave a way
     * out: a modal over a camera feed with no exit is a trap, and the scrim tap
     * isn't discoverable on its own.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 80
     * @zdefault Not now
     */
    __publicField(this, "rewardModalCloseLabel", new Observable("Not now", () => this._syncRewardModal()));
    /**
     * Main modal colour — the glow, the border and the button. Teal and
     * aquamarine read as "unlocked" without the alarm of a warm colour.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 76
     * @ztype color
     * @zdefault #4fe3d0
     */
    __publicField(this, "rewardModalAccent", new Observable("#4fe3d0", () => this._syncRewardModalTheme()));
    /**
     * Second colour in the modal's border and glow. A hue apart from the main
     * colour is what makes the border read as light rather than as a stroke.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 72
     * @ztype color
     * @zdefault #2f8fff
     */
    __publicField(this, "rewardModalAccent2", new Observable("#2f8fff", () => this._syncRewardModalTheme()));
    /**
     * Rotate the border light around the panel. Off leaves a static gradient
     * border, which is calmer and cheaper on old phones.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 68
     * @zdefault true
     */
    __publicField(this, "rewardModalAnimate", new Observable(true, () => this._syncRewardModalTheme()));
    /**
     * Frosted glass behind the panel. Off falls back to a solid dark surface —
     * worth trying if the modal looks muddy over a busy camera feed, and on very
     * old devices where a full-screen blur costs frames.
     *
     * @zui
     * @zgroup Reward Modal
     * @zgrouppriority 164
     * @zpriority 64
     * @zdefault true
     */
    __publicField(this, "rewardModalGlass", new Observable(true, () => this._syncRewardModalTheme()));
    /**
     * Show the Claim button in the game menu. It's there from the first open,
     * whether or not the round has been played — the exclusive is already
     * theirs, and burying the claim behind a win costs conversions.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 52
     * @zdefault true
     */
    __publicField(this, "claimEnabled", new Observable(true, () => this._syncClaim()));
    /**
     * Label on the claim button.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 48
     * @zdefault Join Evade
     */
    __publicField(this, "claimLabel", new Observable("Join Evade", () => this._syncClaim()));
    /**
     * Where the claim button sends people — your redemption page, wallet drop,
     * shop link or form.
     *
     * Left blank it falls back to Step 1's link, so the button and the
     * instructions send people to the same place without you keeping two URLs
     * in step. Set it only when the claim button should go somewhere the
     * instructions don't.
     *
     * With both blank the button still fires Claim Timeline and the On Claim
     * event, so you can handle it in the editor instead.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 44
     * @zdefault
     */
    __publicField(this, "claimUrl", new Observable("", () => this._syncClaim()));
    /**
     * Open the claim link in a new tab. Leave this on: an AR session that
     * navigates away is a session the player has to re-place and re-start.
     *
     * @zui
     * @zgroup Digital Exclusive
     * @zgrouppriority 165
     * @zpriority 40
     * @zdefault true
     */
    __publicField(this, "claimNewTab", new Observable(true));
    /* ══ Lounge Mode ════════════════════════════════════════════════════
       A no-pressure mode reached from the intro's secondary button. No clock,
       no orbs, no score — just the character and a row of things to ask them
       to do, each firing a timeline you authored. It exists because not every
       visitor wants a timed game, and "Maybe later" used to send those people
       into one anyway.                                                       */
    /**
     * Turn the intro's secondary button into Lounge mode. Off, it goes back to
     * being a plain dismiss.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 100
     * @zdefault true
     */
    __publicField(this, "loungeEnabled", new Observable(true, () => {
      this._syncIntro();
      this._syncLounge();
      this._syncTimeoutModal();
      this._syncMenu();
      this._syncRewardModal();
    }));
    /**
     * Label on the intro button that opens Lounge mode.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 90
     * @zdefault Lounge with Bobo Cat
     */
    __publicField(this, "loungeButtonLabel", new Observable(
      "Lounge with Bobo Cat",
      // Three places wear this label now — the intro, the menu row and the
      // reward panel — because one destination gets one set of words.
      () => {
        this._syncIntro();
        this._syncMenu();
        this._syncRewardModal();
      }
    ));
    /**
     * Timeline or state played when Lounge mode opens — the character settling
     * in, the lighting changing, whatever the mode's entrance is.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "loungeTimeline", new Observable(void 0));
    /**
     * Your character's model — the node whose animations the lounge buttons
     * play (Bobo Cat). Point this at the GLTF node, or any group above it.
     *
     * Setting it is what makes switching between lounge animations clean.
     * Mattercraft plays a model animation by giving it weight in a mixer, and a
     * finished or interrupted animation KEEPS its weight, frozen at its last
     * pose — so without this reference, pressing Purr after Sleep blends the
     * sleeping pose into the purr and the cat comes out wrong. With it, every
     * button press stops all of the model's animations dead before starting
     * the new one from frame zero.
     *
     * You do not need per-animation Animation behaviours with weights for
     * this — setting weights to 0 doesn't help, because a paused animation
     * still applies its pose regardless.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 75
     * @zvalues nodeids three/Object3D/**
     */
    __publicField(this, "loungeCharacter", new Observable(void 0));
    /**
     * Label on the small link that leaves Lounge mode and starts a round.
     * Leave it blank, or turn Show Exit Link off, to hide it — but then the
     * only way out is the menu, which is a lot to ask of a first-time visitor.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 70
     * @zdefault Start Cola Run
     */
    __publicField(this, "loungeExitLabel", new Observable("Start Cola Run", () => this._syncLounge()));
    /**
     * How far up from the bottom of the screen the lounge buttons sit, as a
     * percentage of screen height. The default lifts them clear of an on-screen
     * joystick, which usually lives in the bottom corners. Clamped to 0–70.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 58
     * @zdefault 30
     */
    __publicField(this, "loungeOffset", new Observable(30, (v) => {
      const n = Math.max(0, Math.min(70, v));
      if (n !== v) this.loungeOffset.value = n;
      this._applyLoungeOffset();
    }));
    /**
     * Which side of the screen the lounge buttons sit on. Move them away from
     * your joystick if lifting them isn't enough.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 57
     * @zdefault center
     */
    __publicField(this, "loungeAlign", new Observable("center" /* Center */, () => this._applyCorner()));
    /**
     * Show the link out of Lounge mode above the action buttons.
     *
     * @zui
     * @zgroup Lounge Mode
     * @zgrouppriority 158
     * @zpriority 60
     * @zdefault true
     */
    __publicField(this, "showLoungeExit", new Observable(true, () => this._syncLounge()));
    /**
     * Caption under action 1's button. Keep it to a word or two; it sits
     * under a circular button and a long label makes the row wrap.
     *
     * @zui
     * @zgroup Lounge Action 1
     * @zgrouppriority 157
     * @zpriority 100
     * @zdefault Sleep
     */
    __publicField(this, "lounge1Label", new Observable("Sleep", () => this._syncLounge()));
    /**
     * Icon on action 1's button.
     *
     * @zui
     * @zgroup Lounge Action 1
     * @zgrouppriority 157
     * @zpriority 90
     * @zdefault sleep
     */
    __publicField(this, "lounge1Icon", new Observable("sleep" /* Sleep */, () => this._syncLounge()));
    /**
     * Timeline or state played when action 1 is tapped. This is where Bobo
     * actually does the thing.
     *
     * @zui
     * @zgroup Lounge Action 1
     * @zgrouppriority 157
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "lounge1Timeline", new Observable(void 0));
    /**
     * Caption under action 2's button. Keep it to a word or two; it sits
     * under a circular button and a long label makes the row wrap.
     *
     * @zui
     * @zgroup Lounge Action 2
     * @zgrouppriority 156
     * @zpriority 100
     * @zdefault Excited
     */
    __publicField(this, "lounge2Label", new Observable("Excited", () => this._syncLounge()));
    /**
     * Icon on action 2's button.
     *
     * @zui
     * @zgroup Lounge Action 2
     * @zgrouppriority 156
     * @zpriority 90
     * @zdefault bolt
     */
    __publicField(this, "lounge2Icon", new Observable("bolt" /* Bolt */, () => this._syncLounge()));
    /**
     * Timeline or state played when action 2 is tapped. This is where Bobo
     * actually does the thing.
     *
     * @zui
     * @zgroup Lounge Action 2
     * @zgrouppriority 156
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "lounge2Timeline", new Observable(void 0));
    /**
     * Caption under action 3's button. Keep it to a word or two; it sits under a
     * circular button and a long label makes the row wrap.
     *
     * @zui
     * @zgroup Lounge Action 3
     * @zgrouppriority 155
     * @zpriority 100
     * @zdefault Purr
     */
    __publicField(this, "lounge3Label", new Observable("Purr", () => this._syncLounge()));
    /**
     * Icon on action 3's button.
     *
     * @zui
     * @zgroup Lounge Action 3
     * @zgrouppriority 155
     * @zpriority 90
     * @zdefault paw
     */
    __publicField(this, "lounge3Icon", new Observable("paw" /* Paw */, () => this._syncLounge()));
    /**
     * Timeline or state played when action 3 is tapped. This is where Bobo
     * actually does the thing.
     *
     * @zui
     * @zgroup Lounge Action 3
     * @zgrouppriority 155
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "lounge3Timeline", new Observable(void 0));
    /**
     * Caption under action 4's button. Blank by default — give it a label to make it appear. Keep it to a word or two; it sits
     * under a circular button and a long label makes the row wrap.
     *
     * @zui
     * @zgroup Lounge Action 4
     * @zgrouppriority 154
     * @zpriority 100
     * @zdefault 
     */
    __publicField(this, "lounge4Label", new Observable("", () => this._syncLounge()));
    /**
     * Icon on action 4's button.
     *
     * @zui
     * @zgroup Lounge Action 4
     * @zgrouppriority 154
     * @zpriority 90
     * @zdefault none
     */
    __publicField(this, "lounge4Icon", new Observable("none" /* None */, () => this._syncLounge()));
    /**
     * Timeline or state played when action 4 is tapped. This is where Bobo
     * actually does the thing.
     *
     * @zui
     * @zgroup Lounge Action 4
     * @zgrouppriority 154
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "lounge4Timeline", new Observable(void 0));
    /* ══ Bobo's Hideout ═════════════════════════════════════════════════
       A third mode next to the round and the lounge: the Collector Hub room
       (CollectorHubMode.ts). The game owns the mode — the intro button, the
       menu row, placement and the HUD — and the hideout component owns the
       room. Without a CollectorHubMode in the scene nothing here shows.       */
    /**
     * Offer Bobo's Hideout on the intro card and in the menu. CollectorHubMode
     * switches this on for you when it finds the game, so you only need it if
     * you open the room from your own behaviours.
     *
     * @zui
     * @zgroup Bobo's Hideout
     * @zgrouppriority 153
     * @zpriority 100
     * @zdefault false
     */
    __publicField(this, "hideoutEnabled", new Observable(false, () => {
      this._syncIntro();
      this._syncMenu();
    }));
    /**
     * Label on the intro button and the menu row that open the hideout.
     *
     * @zui
     * @zgroup Bobo's Hideout
     * @zgrouppriority 153
     * @zpriority 90
     * @zdefault Visit Bobo's Hideout
     */
    __publicField(this, "hideoutButtonLabel", new Observable(
      "Visit Bobo's Hideout",
      () => {
        this._syncIntro();
        this._syncMenu();
      }
    ));
    /**
     * The interface colour while the hideout is open, and the colour of the
     * buttons that lead there. EVADE yellow by default, so the three modes are
     * three colours: the round, the lounge and the hideout.
     *
     * @zui
     * @zgroup Bobo's Hideout
     * @zgrouppriority 153
     * @zpriority 80
     * @ztype color-norm-rgb
     * @zdefault [1, 0.77, 0.18]
     */
    __publicField(this, "hideoutAccent", new Observable(
      [1, 0.77, 0.18],
      () => this._applyMode()
    ));
    /* ══ Timelines ══════════════════════════════════════════════════════ */
    /**
     * Timeline or state played the moment the portal opens. This is your win
     * cinematic — camera move, reveal, UI, whatever you've authored.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 100
     * @zvalues layerclipids
     */
    __publicField(this, "winTimeline", new Observable(void 0));
    /**
     * Timeline or state played when the round timer runs out.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 90
     * @zvalues layerclipids
     */
    __publicField(this, "failTimeline", new Observable(void 0));
    /**
     * Timeline or state played when a round starts.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 80
     * @zvalues layerclipids
     */
    __publicField(this, "startTimeline", new Observable(void 0));
    /**
     * Timeline or state played when the celebration appears. Use it to move the
     * camera onto the portal, dim the scene, or fire your own particles.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 70
     * @zvalues layerclipids
     */
    __publicField(this, "rewardTimeline", new Observable(void 0));
    /**
     * Timeline or state played when the claim button is tapped — fires whether
     * or not Claim URL is set, so you can handle the claim entirely in-scene.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 60
     * @zvalues layerclipids
     */
    __publicField(this, "claimTimeline", new Observable(void 0));
    /**
     * Timeline or state played when the reward modal opens.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 55
     * @zvalues layerclipids
     */
    __publicField(this, "rewardModalTimeline", new Observable(void 0));
    /**
     * Timeline or state played when Replay is pressed on the reward panel.
     *
     * Its own hook rather than reusing Start Timeline, because the two are
     * different moments: Start Timeline runs for every round however it began,
     * while this one only runs for somebody choosing to go again straight after
     * a win. Both fire on a replay, so put the shared part in Start Timeline and
     * keep this one for whatever is specific to the second run.
     *
     * @zui
     * @zgroup Game Timelines
     * @zgrouppriority 110
     * @zpriority 52
     * @zvalues layerclipids
     */
    __publicField(this, "replayTimeline", new Observable(void 0));
    /* ══ Events ═════════════════════════════════════════════════════════
       Wire these to behaviours from the editor without touching code.        */
    /** Fired when a round begins. @zui */
    __publicField(this, "onGameStart", new Event());
    /** Fired for every orb collected, with the running score and the target. @zui */
    __publicField(this, "onOrbCollected", new Event());
    /** Fired the instant the target count is reached, before the portal animates. @zui */
    __publicField(this, "onTargetReached", new Event());
    /** Fired when the portal has finished opening. @zui */
    __publicField(this, "onPortalOpen", new Event());
    /** Fired when the portal has finished closing itself. @zui */
    __publicField(this, "onPortalClosed", new Event());
    /** Fired when the round timer reaches zero. @zui */
    __publicField(this, "onTimeUp", new Event());
    /** Fired when the board is reset back to idle. @zui */
    __publicField(this, "onGameReset", new Event());
    /** Fired when the player confirms placement. @zui */
    __publicField(this, "onPlace", new Event());
    /** Fired when the player resets placement. @zui */
    __publicField(this, "onResetPlacement", new Event());
    /** Fired when the digital-exclusive celebration appears. @zui */
    __publicField(this, "onRewardShown", new Event());
    /** Fired when the reward modal opens. @zui */
    __publicField(this, "onRewardModalShown", new Event());
    /** Fired when the reward modal is dismissed without claiming. @zui */
    __publicField(this, "onRewardModalDismissed", new Event());
    /** Fired when the claim button is tapped, before the link opens. @zui */
    __publicField(this, "onClaimed", new Event());
    /** Fired when Replay is pressed on the reward panel. @zui */
    __publicField(this, "onReplay", new Event());
    /** Fired when Lounge mode opens. @zui */
    __publicField(this, "onLoungeEnter", new Event());
    /** Fired when Lounge mode closes. @zui */
    __publicField(this, "onLoungeExit", new Event());
    /** Fired when a lounge action is tapped, with its 1-based slot and label. @zui */
    __publicField(this, "onLoungeAction", new Event());
    /** Fired when the player picks Bobo's Hideout (before placement, if it still needs placing). @zui */
    __publicField(this, "onHideoutEnter", new Event());
    /** Fired when the player leaves Bobo's Hideout for the round or the lounge. @zui */
    __publicField(this, "onHideoutExit", new Event());
    /** Fired when the intro / how-to-play card closes. @zui */
    __publicField(this, "onIntroClose", new Event());
    /**
     * Which Bobo's Hideout release this game file belongs to (CollectorHubMode
     * checks it matches its own HubCore.ts).
     */
    __publicField(this, "hideoutVersion", "6");
    // eslint-disable-next-line @typescript-eslint/member-ordering -- grouped with setShell
    __publicField(this, "_shell", null);
    // eslint-disable-next-line @typescript-eslint/member-ordering -- the countdown's state
    __publicField(this, "_cdLeft", -1);
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_cdHeld", false);
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_cdShown", -1);
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_cdGoAt", -1);
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_cdSeeded", false);
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_cdWrap");
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_earned", false);
    // eslint-disable-next-line @typescript-eslint/member-ordering
    __publicField(this, "_roundAfterPlace", false);
    /* ══ Internals ══════════════════════════════════════════════════════ */
    __publicField(this, "_zc", this.getZComponentInstance());
    /**
     * Seed for the current round's layout. Equal to the Seed prop unless
     * Randomize Each Round is on, in which case a fresh one is drawn when the
     * round starts — the board stays stable while you're editing props, and only
     * changes when the player actually replays.
     */
    __publicField(this, "_roundSeed", 0);
    /** Long-lived stream for respawns, so successive respawns never repeat. */
    __publicField(this, "_rng", mulberry32(0));
    __publicField(this, "_state", "idle" /* Idle */);
    __publicField(this, "_score", 0);
    __publicField(this, "_streak", 0);
    __publicField(this, "_timeLeft", 0);
    __publicField(this, "_time", 0);
    __publicField(this, "_warned", false);
    __publicField(this, "_nextWarnAt", 0);
    __publicField(this, "_portalOpen", 0);
    __publicField(this, "_portalDone", false);
    /** Scheduled on _time, so a reset cancels them the way everything else does. */
    __publicField(this, "_humStopAt", -1);
    __publicField(this, "_portalCloseAt", -1);
    __publicField(this, "_portalClosing", false);
    __publicField(this, "_resetAt", -1);
    __publicField(this, "_warnedNoPlayer", false);
    __publicField(this, "_warnedReach", false);
    __publicField(this, "_warnedPickup", false);
    __publicField(this, "_warnedSkinned", false);
    /** Whether the glow would be on if the pickup were an orb. */
    __publicField(this, "_glowWanted", true);
    /** The lounge timeline last started, so the next press can reset it. */
    __publicField(this, "_loungeClipId");
    /** Animation keys the current lounge timeline started. */
    __publicField(this, "_loungeAnims", /* @__PURE__ */ new Set());
    /** Animations already running at press time — exempt while they keep running. */
    __publicField(this, "_loungeAmbient", /* @__PURE__ */ new Set());
    /** Stream objects the latched timeline drives (covers late-starting blocks). */
    __publicField(this, "_loungeClipStreams", /* @__PURE__ */ new Set());
    __publicField(this, "_pickupGltf");
    __publicField(this, "_pickupImage");
    __publicField(this, "_pickupModel");
    __publicField(this, "_pickupImageObj");
    __publicField(this, "_camera");
    __publicField(this, "_nextHudAt", 0);
    __publicField(this, "_orbU", {
      uTime: { value: 0 },
      uColorCore: { value: new THREE2.Color(0.03, 0.1, 0.19) },
      uColorInner: { value: new THREE2.Color(0.09, 0.8, 0.84) },
      uColorMid: { value: new THREE2.Color(0.11, 0.44, 0.94) },
      uColorEdge: { value: new THREE2.Color(0.87, 0.95, 1) },
      uHueBlend: { value: 0.42 },
      uSpeed: { value: 0.3 },
      uNoiseScale: { value: 3.4 },
      uTurbulence: { value: 1.3 },
      uSurfaceSharpness: { value: 2.8 },
      uSurfaceEnergy: { value: 0.75 },
      uCoreGlow: { value: 0.32 },
      uDensity: { value: 0.88 },
      uRimPower: { value: 3.6 },
      uRimIntensity: { value: 0.55 },
      uBrightness: { value: 1 },
      uOpacity: { value: 1 },
      uPulse: { value: 1 },
      uFlare: { value: 0 },
      uFlareBoost: { value: 0.85 }
    });
    __publicField(this, "_glowU", {
      uColor: { value: new THREE2.Color(0.11, 0.44, 0.94) },
      uFalloff: { value: 2.6 },
      uIntensity: { value: 0.9 },
      uCoreFrac: { value: 1 / 1.7 },
      uPulse: { value: 1 },
      uFlare: { value: 0 },
      uFlareBoost: { value: 0.85 },
      uOpacity: { value: 1 }
    });
    __publicField(this, "_beaconU", {
      uColor: { value: new THREE2.Color(0.12, 0.73, 0.94) },
      uTime: { value: 0 },
      uIntensity: { value: 0.85 },
      uRingWidth: { value: 0.09 },
      uPoolStrength: { value: 0.16 },
      uWaveSpeed: { value: 0.5 },
      uOpacity: { value: 1 },
      uPhase: { value: 0 }
    });
    __publicField(this, "_portalU", {
      uTime: { value: 0 },
      uColorCore: { value: new THREE2.Color(0.02, 0.04, 0.09) },
      uColorInner: { value: new THREE2.Color(0.08, 0.82, 0.76) },
      uColorMid: { value: new THREE2.Color(0.11, 0.44, 0.94) },
      uColorEdge: { value: new THREE2.Color(0.81, 0.91, 1) },
      uHueBlend: { value: 0.6 },
      uRadius: { value: 0.72 },
      uSwirl: { value: 2.2 },
      uSpeed: { value: 0.16 },
      uNoiseScale: { value: 2.6 },
      uTurbulence: { value: 1.5 },
      uArmSharpness: { value: 3.2 },
      uCoreSize: { value: 0.3 },
      uCoreDarkness: { value: 0.55 },
      uRimPower: { value: 2.8 },
      uRimIntensity: { value: 0.88 },
      uEdgeWobble: { value: 0.13 },
      uEdgeWobbleSpeed: { value: 0.3 },
      uStarDensity: { value: 22 },
      uStarIntensity: { value: 1 },
      uHaloSize: { value: 0.16 },
      uHaloIntensity: { value: 0.55 },
      uBrightness: { value: 1.05 },
      uOpacity: { value: 0 }
    });
    // One material of each kind serves every orb — a 30-orb field is still four
    // materials. Per-orb variety comes from a random orientation (the noise is
    // sampled in object space) plus a per-orb pulse phase on the CPU.
    __publicField(this, "_orbMat");
    __publicField(this, "_glowMat");
    __publicField(this, "_beaconMat");
    __publicField(this, "_portalMat");
    __publicField(this, "_orbGeom");
    __publicField(this, "_glowGeom");
    __publicField(this, "_beaconGeom");
    __publicField(this, "_portalGeom");
    __publicField(this, "_portal");
    __publicField(this, "_orbs", []);
    __publicField(this, "_playerObj");
    __publicField(this, "_playerTrigger");
    __publicField(this, "_sfxCollect");
    __publicField(this, "_sfxWin");
    __publicField(this, "_sfxReward");
    __publicField(this, "_sfxWarn");
    __publicField(this, "_sfxFail");
    __publicField(this, "_sfxHum");
    __publicField(this, "_sfxMusic");
    __publicField(this, "_audio");
    __publicField(this, "_humPlaying", false);
    __publicField(this, "_root", document.createElement("div"));
    __publicField(this, "_scoreWrap");
    __publicField(this, "_timeWrap");
    /**
     * Fires when the timeout panel appears — hook a sound or a timeline to it.
     *
     * @zui
     * @zgroup Game Timeout
     * @zgrouppriority 163
     * @zpriority 20
     */
    __publicField(this, "onTimeoutModalShown", new Event());
    __publicField(this, "_logoWrap");
    __publicField(this, "_logoImg");
    __publicField(this, "_toWrap");
    __publicField(this, "_insWrap");
    /** Watches the two HUD cards so the stack can never go stale. */
    __publicField(this, "_hudRO");
    __publicField(this, "_hudRaf", 0);
    /** True while the steps are showing as a detour FROM the reward panel. */
    __publicField(this, "_insFromReward", false);
    /** Full-screen viewer for a step's screenshot. */
    __publicField(this, "_lightWrap");
    __publicField(this, "_lightImg");
    /** The control that opened the viewer, so focus can go back to it. */
    __publicField(this, "_lightOpener");
    /** Game clock at which the timeout panel should open; -1 when idle. */
    __publicField(this, "_timeoutAt", -1);
    __publicField(this, "_scoreLblEl");
    __publicField(this, "_timeLblEl");
    __publicField(this, "_menuWrap");
    __publicField(this, "_introWrap");
    __publicField(this, "_placeWrap");
    __publicField(this, "_resetWrap");
    __publicField(this, "_soundWrap");
    __publicField(this, "_rewardWrap");
    __publicField(this, "_rwModalWrap");
    __publicField(this, "_rwModalAt", -1);
    __publicField(this, "_rwWord");
    __publicField(this, "_rwBadge");
    /** Scheduled on `_time`, not setTimeout, so it can't outlive a reset. */
    __publicField(this, "_rewardAt", -1);
    __publicField(this, "_rwWordHideAt", -1);
    __publicField(this, "_rwBadgeHideAt", -1);
    __publicField(this, "_iconBtn");
    __publicField(this, "_menu");
    __publicField(this, "_introEl");
    __publicField(this, "_introImg");
    __publicField(this, "_introH1");
    __publicField(this, "_introLead");
    __publicField(this, "_scoreEl");
    __publicField(this, "_timeEl");
    __publicField(this, "_barEl");
    __publicField(this, "_titleEl");
    __publicField(this, "_msgEl");
    __publicField(this, "_statusEl");
    __publicField(this, "_menuOpen", false);
    __publicField(this, "_placed", false);
    __publicField(this, "_lounge", false);
    __publicField(this, "_hideout", false);
    __publicField(this, "_loungeWrap");
    __publicField(this, "_v1", new THREE2.Vector3());
    __publicField(this, "_v2", new THREE2.Vector3());
    __publicField(this, "_onResize", () => {
      this._fitReward();
      this._applyLoungeOffset();
      this._applyHudStack();
      this._applyLogoClearance();
    });
    /**
     * Escape closes the image viewer.
     *
     * Only the viewer: it's the one layer that opens on top of another dialog,
     * so Escape there has an unambiguous meaning. Wiring Escape to the menu as
     * well would make one key close two things at once, and on a phone nobody
     * has a key to press anyway — this is for whoever previews the build on a
     * laptop.
     */
    __publicField(this, "_onKeyDown", (e) => {
      if (e.key !== "Escape") return;
      if (!this._lightWrap?.classList.contains("on")) return;
      e.stopPropagation();
      this._closeImage();
    });
    /* ── frame ────────────────────────────────────────────────────────── */
    __publicField(this, "_anchorBound", false);
    /* ── the AR anchor Place / Reset drive (Placement Anchor) ── */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zappar anchors, duck-typed
    __publicField(this, "_anchorComp", null);
    __publicField(this, "_anchorOff", null);
    this._orbMat = new THREE2.ShaderMaterial({
      uniforms: this._orbU,
      vertexShader: ORB_VERT,
      fragmentShader: ORB_FRAG.replace("__NOISE3__", NOISE3),
      transparent: true,
      depthWrite: true
    });
    this._orbMat.toneMapped = false;
    this._glowMat = new THREE2.ShaderMaterial({
      uniforms: this._glowU,
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE2.AdditiveBlending,
      side: THREE2.BackSide
    });
    this._glowMat.toneMapped = false;
    this._beaconMat = new THREE2.ShaderMaterial({
      uniforms: this._beaconU,
      vertexShader: BEACON_VERT,
      fragmentShader: BEACON_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE2.AdditiveBlending,
      side: THREE2.DoubleSide
    });
    this._beaconMat.toneMapped = false;
    this._portalMat = new THREE2.ShaderMaterial({
      uniforms: this._portalU,
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE2.DoubleSide
    });
    this._portalMat.toneMapped = false;
    const detail = clampInt(constructorProps.orbDetail ?? 32, 8, 96);
    this._orbGeom = new THREE2.SphereGeometry(0.5, detail, Math.round(detail * 0.75));
    this._glowGeom = new THREE2.SphereGeometry(0.5, 24, 16);
    this._beaconGeom = new THREE2.PlaneGeometry(1, 1);
    this._portalGeom = new THREE2.PlaneGeometry(1, 1);
    this._portal = new THREE2.Mesh(this._portalGeom, this._portalMat);
    this._portal.position.set(0, 1.7, -14);
    this._portal.scale.setScalar(3.4);
    this._portal.visible = false;
    this.element.add(this._portal);
    const pool = clampInt(constructorProps.maxOrbs ?? 32, 1, 200);
    for (let i = 0; i < pool; i++) this._orbs.push(this._makeOrb());
    this._sfxCollect = new Audio(contextManager, { source: constructorProps.collectSound });
    this._sfxWin = new Audio(contextManager, { source: constructorProps.winSound });
    this._sfxReward = new Audio(contextManager, { source: constructorProps.rewardSound });
    this._sfxWarn = new Audio(contextManager, { source: constructorProps.warningSound });
    this._sfxFail = new Audio(contextManager, { source: constructorProps.failSound });
    this._sfxHum = new Audio(contextManager, { source: constructorProps.portalHumSound });
    this._sfxMusic = new Audio(contextManager, { source: constructorProps.musicTrack });
    this._sfxMusic.loop.value = true;
    try {
      const actx = useAudioContext(contextManager);
      const layer = contextManager.get(AudioContextContext).getLayer(void 0);
      this._audio = new GameAudio(actx, layer);
      this._audio.musicLevel = this.musicVolume.value;
      this._audio.setSfx(this.soundEnabled.value);
    } catch (e) {
      console.warn("[OrbHuntGame] No audio context available; running silent.", e);
    }
    this._roundSeed = this.seed.value | 0;
    this._rng = mulberry32(this._roundSeed ^ 2654435769);
    this._loadPickup(contextManager);
    const cam = useCamera(contextManager);
    this._camera = cam.value;
    this.register(cam, (c) => {
      this._camera = c;
    });
    this._buildUi(contextManager);
    this._layout();
    this._applyPortalVisibility();
    this._applyCorner();
    this._applyLayerOrder();
    this._observeHud();
    this._applyMode();
    this._applyHudPosition();
    this._applyLogo();
    this._applyTimerOffset();
    this._applyLoungeOffset();
    this._applyUiVisibility();
    this._syncMenu();
    this._syncIntro();
    this._syncReward();
    this._syncRewardTheme();
    this._syncRewardModal();
    this._syncRewardModalTheme();
    this._syncTimeoutModal();
    this._syncTimeoutTheme();
    this._syncInstructions();
    this._syncClaim();
    this._syncLounge();
    this._applyPlacementUi();
    this._applyPickupKind();
    this._syncHud();
    this._zc.constructed.then(() => {
      this._bindPlayer();
      this._applyMusicSource();
      if (this.showIntroOnLoad.value && this.uiEnabled.value && !this._shell) this._openIntro();
      else this._afterIntroDismissed();
      if (this.autoStart.value) this._beginRound();
    });
    this.register(useOnBeforeRender(contextManager), (dt) => this._tick(dt * 1e-3));
  }
  /* ══ Public API — call these from a behaviour or a Call Function track ══ */
  /** Start (or restart) a round. @zui */
  startGame() {
    this._beginRound();
  }
  /** Pause a running round. @zui */
  pauseGame() {
    if (this._cdLeft > 0) this._cdHeld = true;
    if (this._state === "playing" /* Playing */) this._setState("paused" /* Paused */);
  }
  /** Resume a paused round. @zui */
  resumeGame() {
    this._cdHeld = false;
    if (this._state === "paused" /* Paused */) this._setState("playing" /* Playing */);
  }
  /** Reset the board to idle without starting. @zui */
  resetGame() {
    this._reset();
  }
  /** Open the how-to-play modal. @zui */
  showIntro() {
    this._openIntro();
  }
  /** Open the game menu. @zui */
  showMenu() {
    this._openMenu();
  }
  /** Confirm placement, as if the player tapped Place. @zui */
  place() {
    this._place();
  }
  /** Return to placement mode, as if the player tapped Reset. @zui */
  resetPlacement() {
    this._resetPlacement();
  }
  /** Play the digital-exclusive celebration now, without winning. @zui */
  showReward() {
    this._showReward();
  }
  /** Hide the celebration immediately. @zui */
  hideReward() {
    this._hideReward(true);
  }
  /** Close the portal now, with its opening animation reversed. @zui */
  closePortal() {
    if (this._state === "won" /* Won */ && this._portal.visible) this._portalClosing = true;
  }
  /** Open the reward modal now. @zui */
  showRewardModal() {
    this._openRewardModal();
  }
  /** Close the reward modal. @zui */
  hideRewardModal() {
    this._closeRewardModal(false);
  }
  /** Trigger the claim action, as if the button were tapped. @zui */
  claim() {
    this._claim();
  }
  /** Open Lounge mode. @zui */
  enterLounge() {
    this._enterLounge();
  }
  /** Leave Lounge mode without starting a round. @zui */
  exitLounge() {
    this._exitLounge();
  }
  /** True while Lounge mode is open. */
  get isLounging() {
    return this._lounge;
  }
  /** Open Bobo's Hideout mode (placement first, if the scene isn't placed yet). @zui */
  enterHideout() {
    this._enterHideout();
  }
  /** Leave Bobo's Hideout mode without starting a round or the lounge. @zui */
  exitHideout() {
    this._exitHideout();
  }
  /** True while Bobo's Hideout mode is open. */
  get isInHideout() {
    return this._hideout;
  }
  /**
   * BOBO OS as the game's home screen (CollectorHubMode, once a fan has
   * activated Bobo's Hideout). The game's own menu button, intro card,
   * sound toggle, reset button and lounge row step aside: the home sheet
   * has all of it, and Bobo's moves sit behind one action button. Call with
   * null to give the game its own UI back.
   */
  setShell(shell) {
    this._shell = shell;
    if (shell) {
      this._closeMenu();
      if (this.isIntroOpen) {
        this._closeIntro();
        this._afterIntroDismissed();
      }
    }
    this._applyUiVisibility();
  }
  get hasShell() {
    return !!this._shell;
  }
  /** Bobo's moves (the lounge actions) for an action button of the host's own. */
  get loungeMoves() {
    return this._loungeSlots().filter((a) => a.label.trim() || a.icon !== "none" /* None */).map((a) => ({ id: String(a.n), label: a.label.trim() || `Move ${a.n}`, svg: this._loungeSvg(a.icon) }));
  }
  loungeMove(id) {
    this._loungeAction(Number(id));
  }
  /** For the home sheet's status line. */
  get roundStatus() {
    const target = clampInt(this.targetCount.value, 1, 999);
    return { score: this._score, target, left: Math.max(0, target - this._score), time: this.timeRemaining };
  }
  /** True during the 3-2-1 before a round (see Countdown). */
  get isCountingDown() {
    return this._cdLeft > 0;
  }
  /** True while a menu is holding the countdown. */
  get isCountdownHeld() {
    return this._cdLeft > 0 && this._cdHeld;
  }
  /**
   * True once this device has won the digital exclusive (remembered), so a
   * home screen can always lead back to How to claim.
   */
  get rewardEarned() {
    try {
      return localStorage.getItem("ohg-reward-earned") === "1";
    } catch {
      return this._earned;
    }
  }
  /**
   * Play a character timeline (an emote) the way the lounge buttons do: it
   * stops the last one cleanly first, and lets go the moment the joystick
   * takes over. Bobo's Hideout uses it for his build-in and room animations.
   * Needs Lounge Character set. @zui
   */
  playCharacterClip(id) {
    this._playLoungeClip(id);
  }
  /** True while the intro / how-to-play card is open. */
  get isIntroOpen() {
    return !!this._introWrap?.classList.contains("on");
  }
  /**
   * Log what the custom-pickup path actually did, in your scene.
   *
   * The pickup path cannot be tested outside the editor — the loaders, the
   * file pickers and the scene graph above this component only exist there —
   * so when a model misbehaves this is the way to find out why instead of
   * guessing. Run it after the round has started and paste the output.
   *
   * It names the failure rather than dumping numbers: the source never
   * arrived, the clones were never built, every pickup is stacked on the
   * component origin (which looks exactly like one model that "won't move"),
   * or the model is fine and sitting where it should be.
   *
   * @zui
   */
  auditPickup() {
    const kind = this.pickupKind.value;
    const src = this._pickupSource();
    const P = "[OrbHuntGame]";
    console.log(`${P} Pickup Kind: ${kind} | Pickup Model prop: ${this.constructorProps.pickupModel || "(empty)"} | Pickup Image prop: ${this.constructorProps.pickupImage || "(empty)"}`);
    if (kind === "orb" /* Orb */) {
      console.log(`${P} Pickup Kind is Orb \u2014 the shader orb is showing by design.`);
      return;
    }
    if (!src) {
      console.warn(`${P} DIAGNOSIS: the source never arrived. Either the file is still loading, the prop is empty, or the load threw \u2014 look further up the console for a "failed to load" line. Orbs are showing as the fallback, which is why you still see orbs.`);
      return;
    }
    const d = this._describePickupSource(src);
    console.log(`${P} source: ${d.text}`);
    if (d.meshes === 0) {
      console.warn(`${P} DIAGNOSIS: the loaded object contains no meshes, so every clone is empty and nothing can render. The load succeeded \u2014 this is what the file has in it. Open the same file in any glTF viewer and you will see the same thing.`);
      return;
    }
    this.element.updateMatrixWorld(true);
    const gp = new THREE2.Vector3();
    const cp = new THREE2.Vector3();
    const rows = this._orbs.map((o, i) => {
      const fit = o.custom.children[0];
      const clone = fit?.children[0];
      o.group.getWorldPosition(gp);
      if (clone) clone.getWorldPosition(cp);
      else cp.set(NaN, NaN, NaN);
      return {
        i,
        active: o.active,
        orbVisible: o.group.visible,
        customVisible: o.custom.visible,
        cloneBuilt: !!clone,
        fitScale: fit ? +fit.scale.x.toFixed(4) : null,
        orbAt: `${gp.x.toFixed(2)},${gp.y.toFixed(2)},${gp.z.toFixed(2)}`,
        modelAt: clone ? `${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)}` : "\u2014",
        driftFromOrb: clone ? +cp.distanceTo(gp).toFixed(3) : null
      };
    });
    const live = rows.filter((r) => r.active);
    console.table(live);
    const built = live.filter((r) => r.cloneBuilt);
    if (!built.length) {
      console.warn(`${P} DIAGNOSIS: the source loaded but no clones were built. _applyPickupKind ran before the orb pool existed, or hasn't run since the file arrived.`);
      return;
    }
    if (built.length < live.length) {
      console.warn(`${P} DIAGNOSIS: only ${built.length} of ${live.length} live pickups have a model. The rest are empty slots.`);
    }
    const zeroScale = built.filter((r) => !r.fitScale);
    if (zeroScale.length) {
      console.warn(`${P} DIAGNOSIS: ${zeroScale.length} pickup(s) have a zero fit scale \u2014 fitToDiameter found no measurable geometry, so the model is there but has no size.`);
    }
    const spots = new Set(built.map((r) => r.modelAt));
    if (spots.size === 1 && built.length > 1) {
      console.warn(`${P} DIAGNOSIS: all ${built.length} pickups are at the same world position (${built[0].modelAt}). That is why you see one model that never moves \u2014 they are stacked. The orbs' own positions are ${new Set(built.map((r) => r.orbAt)).size === 1 ? "ALSO identical, so the layout never ran" : "spread out, so the models are not following their orbs"}.`);
      return;
    }
    const drifted = built.filter((r) => (r.driftFromOrb ?? 0) > this.orbSize.value * 2);
    if (drifted.length) {
      console.warn(`${P} DIAGNOSIS: ${drifted.length} model(s) sit more than two orb-widths from the orb they belong to, so the pickup and its ground ring are in different places:`, drifted);
      return;
    }
    console.log(`${P} pickups look correct: ${built.length} model(s), each on its own orb, spread across ${spots.size} position(s).`);
    return rows;
  }
  /**
   * Log a per-orb diagnostic to the browser console: position, whether the orb
   * is within the player's vertical reach, and the state of its trigger and
   * beacon. Use this when one orb misbehaves — it turns "that one won't
   * collect" into a specific broken invariant.
   *
   * @zui
   */
  auditOrbs() {
    const reach = this._reachHeight();
    const rows = this._orbs.map((o, i) => ({
      i,
      active: o.active,
      alive: o.alive,
      visible: o.group.visible,
      beaconVisible: o.beacon.visible,
      x: +o.home.x.toFixed(2),
      y: +o.home.y.toFixed(2),
      z: +o.home.z.toFixed(2),
      trigger: o.trigger ? o.trigger.enabled.value ? "enabled" : "DISABLED" : "none",
      withinReach: o.home.y + Math.abs(this.orbBob.value) <= reach
    }));
    const live = rows.filter((r) => r.active);
    console.log(
      `[OrbHuntGame] round seed ${this._roundSeed}${this.randomizeEachRound.value ? " (randomised each round)" : " (fixed by the Seed prop)"}`
    );
    console.log(
      `[OrbHuntGame] player reach ${reach.toFixed(2)} = offset ${this.playerHeightOffset.value} + radius ${this.playerRadius.value} + orb ${this._orbRadius().toFixed(2)} | mode ${this.collisionMode.value} | player node ${this._playerObj ? "bound" : "NOT BOUND"} | player trigger ${this._playerTrigger ? "present" : "none"}`
    );
    console.table(live);
    const bad = live.filter((r) => !r.withinReach || r.alive && r.trigger === "DISABLED");
    if (bad.length) {
      console.warn(`[OrbHuntGame] ${bad.length} orb(s) cannot be collected:`, bad);
    } else {
      console.log("[OrbHuntGame] every live orb is reachable with an enabled trigger.");
    }
    return rows;
  }
  /** True once the scene has been placed. */
  get isPlaced() {
    return this._placed;
  }
  /**
   * The seed that produced the current layout. With Randomize Each Round on
   * this changes every round — read it back to reproduce a board a player
   * reported, by pasting it into Seed and turning randomising off.
   */
  get roundSeed() {
    return this._roundSeed;
  }
  /** Current score. */
  get score() {
    return this._score;
  }
  /** Seconds remaining, or Infinity when the timer is off. */
  get timeRemaining() {
    return this.timerEnabled.value ? this._timeLeft : Infinity;
  }
  /** Where the round is up to. */
  get gameState() {
    return this._state;
  }
  /** Neither mode has a round: no orbs, no clock, no score. */
  get _noRound() {
    return this._lounge || this._hideout;
  }
  /* ── construction helpers ─────────────────────────────────────────── */
  _makeOrb() {
    const group = new THREE2.Group();
    const inner = new THREE2.Group();
    group.add(inner);
    const mesh = new THREE2.Mesh(this._orbGeom, this._orbMat);
    inner.add(mesh);
    const glow = new THREE2.Mesh(this._glowGeom, this._glowMat);
    glow.scale.setScalar(1.7);
    glow.renderOrder = 1;
    glow.raycast = () => void 0;
    inner.add(glow);
    const beacon = new THREE2.Mesh(this._beaconGeom, this._beaconMat);
    beacon.rotation.x = -Math.PI / 2;
    beacon.renderOrder = 2;
    beacon.raycast = () => void 0;
    group.add(beacon);
    const custom = new THREE2.Group();
    custom.visible = false;
    group.add(custom);
    group.visible = false;
    this.element.add(group);
    return {
      group,
      inner,
      mesh,
      glow,
      beacon,
      custom,
      home: new THREE2.Vector3(),
      phase: 0,
      alive: false,
      active: false,
      burst: 0
    };
  }
  /* ── custom pickups ───────────────────────────────────────────────── */
  /**
   * Load the model or image once and clone it per orb.
   *
   * One loader component for the whole board, not one per orb: thirty GLTF
   * components would mean thirty loads of the same file, and `Object3D.clone`
   * shares geometry and materials by reference, so the clones cost almost
   * nothing.
   */
  _loadPickup(mgr) {
    const modelSrc = this.constructorProps.pickupModel;
    const imageSrc = this.constructorProps.pickupImage;
    if (modelSrc) {
      const gltf = new GLTF(mgr, { source: modelSrc, frustumCulled: false });
      this._pickupGltf = gltf;
      gltf.loaded.then(() => {
        this._pickupModel = gltf.element;
        this._applyPickupKind();
      }).catch((e) => console.warn(`[OrbHuntGame] Pickup Model failed to load (${modelSrc}):`, e));
    }
    if (imageSrc) {
      const img = new Image(mgr, { source: imageSrc, transparent: true });
      this._pickupImage = img;
      Promise.resolve(img._load()).then(() => {
        this._pickupImageObj = img.element;
        this._applyPickupKind();
      }).catch((e) => console.warn(`[OrbHuntGame] Pickup Image failed to load (${imageSrc}):`, e));
    }
  }
  /**
   * Describe what the loader actually handed us.
   *
   * When a pickup file "loads" but nothing renders, the useful question is
   * what is inside the object, not whether a promise resolved. GLTF._load()
   * adds the cloned scene to its element before it resolves, and `disposed`
   * is only ever set by an explicit dispose() — so an element with no
   * geometry means the glTF scene itself has none. That is almost always a
   * file that exports cameras, empties, bones or animation but no mesh:
   * a Blender scene exported with the wrong collection selected, a model
   * whose geometry sits behind a compression extension the decoder skipped,
   * or simply the wrong file picked in the property.
   *
   * Naming the nodes is what turns "it doesn't work" into "that file has
   * three Empties and a camera in it".
   */
  _describePickupSource(src) {
    let meshes = 0, nodes = 0;
    const kinds = /* @__PURE__ */ new Map();
    const names = [];
    src.traverse((c) => {
      nodes++;
      kinds.set(c.type, (kinds.get(c.type) ?? 0) + 1);
      if (c.geometry) meshes++;
      if (names.length < 12 && c !== src) names.push(`${c.name || "(unnamed)"}:${c.type}`);
    });
    const gltf = this._pickupGltf;
    return {
      meshes,
      nodes,
      text: `${meshes} mesh(es), ${nodes} node(s) total. Types: ${[...kinds].map(([k, n]) => `${k}\xD7${n}`).join(", ") || "none"}. Nodes: ${names.join(", ") || "(the object is empty)"}. ` + (gltf ? `Loader: ${gltf.element.children.length} direct child(ren), ${gltf.nodesByName.value.size} named node(s), ${gltf.animationClips.value.size} animation clip(s), disposed=${gltf.disposed}. ` : "") + `File: ${this.constructorProps.pickupModel || this.constructorProps.pickupImage || "(none)"}`
    };
  }
  /** Which source object the current Pickup Kind wants, if it has arrived. */
  _pickupSource() {
    switch (this.pickupKind.value) {
      case "model" /* Model */:
        return this._pickupModel;
      case "image" /* Image */:
        return this._pickupImageObj;
      default:
        return void 0;
    }
  }
  _applyPickupKind() {
    if (!this._orbs.length) return;
    const kind = this.pickupKind.value;
    const src = this._pickupSource();
    if (kind !== "orb" /* Orb */ && !src) {
      const prop = kind === "model" /* Model */ ? "Pickup Model" : "Pickup Image";
      const set = kind === "model" /* Model */ ? this.constructorProps.pickupModel : this.constructorProps.pickupImage;
      if (!set && !this._warnedPickup) {
        this._warnedPickup = true;
        console.warn(`[OrbHuntGame] Pickup Kind is ${kind} but no ${prop} is set \u2014 showing orbs. Pick a file in Constructor Props.`);
      }
    }
    const useCustom = !!src;
    for (const o of this._orbs) {
      for (const child of o.custom.children.slice()) o.custom.remove(child);
      if (useCustom) {
        const fit = new THREE2.Group();
        const clone = src.clone(true);
        clone.traverse((c) => {
          c.raycast = () => void 0;
        });
        fit.add(clone);
        o.custom.add(fit);
      }
      o.custom.visible = useCustom;
      o.inner.visible = !useCustom;
      o.glow.visible = !useCustom && this._glowWanted;
    }
    if (useCustom) this._warnSkinned(src);
    this._fitPickup();
  }
  /** Normalise every clone to the orb's size. Cheap: it's a scale per orb. */
  _fitPickup() {
    const src = this._pickupSource();
    if (!src) return;
    const target = Math.max(0.01, this.orbSize.value * this.pickupScale.value);
    for (const o of this._orbs) {
      const clone = o.custom.children[0]?.children[0];
      if (clone) fitToDiameter(clone, target);
    }
  }
  _warnSkinned(src) {
    if (this._warnedSkinned) return;
    let skinned = false;
    src.traverse((c) => {
      if (c.isSkinnedMesh) skinned = true;
    });
    if (!skinned) return;
    this._warnedSkinned = true;
    console.warn("[OrbHuntGame] The pickup model is rigged. Clones share the original skeleton, so every pickup renders in bind pose and none of them animate. Export a static mesh for pickups.");
  }
  /* ── triggers ─────────────────────────────────────────────────────── */
  /**
   * Mattercraft pairs triggers by tag and requires the two sides to have
   * DIFFERENT `isTrigger` values — two `isTrigger = true` nodes never collide.
   * Orbs are the triggers, the player is the collider.
   */
  _rebuildTriggers() {
    const wantTriggers = this.collisionMode.value === "trigger" /* Trigger */;
    for (const o of this._orbs) {
      if (wantTriggers && !o.trigger) {
        const t = new SphereTrigger(this.contextManager, {});
        t.isTrigger.value = true;
        t.tags.value = [this.triggerTag.value];
        o.group.add(t.element);
        o.onHit = (evt) => {
          if (this._state !== "playing" /* Playing */) return;
          if (this._playerTrigger && evt.otherTrigger !== this._playerTrigger) return;
          if (!o.alive) return;
          this._collect(o);
        };
        this.register(t.onCollisionEnter, o.onHit);
        o.trigger = t;
      } else if (!wantTriggers && o.trigger) {
        if (o.onHit) this.unregister(o.trigger.onCollisionEnter, o.onHit);
        o.onHit = void 0;
        o.trigger.dispose();
        o.trigger = void 0;
      }
    }
    if (wantTriggers && !this._playerTrigger && this._playerObj) {
      const t = new SphereTrigger(this.contextManager, {});
      t.isTrigger.value = false;
      t.tags.value = [this.triggerTag.value];
      this._playerObj.add(t.element);
      this._playerTrigger = t;
    } else if (!wantTriggers && this._playerTrigger) {
      this._playerTrigger.dispose();
      this._playerTrigger = void 0;
    }
    for (const o of this._orbs) if (o.trigger) o.trigger.enabled.value = o.active;
    this._sizeOrbTriggers();
    this._sizePlayerTrigger();
  }
  _retagTriggers() {
    const tag = this.triggerTag.value;
    for (const o of this._orbs) if (o.trigger) o.trigger.tags.value = [tag];
    if (this._playerTrigger) this._playerTrigger.tags.value = [tag];
  }
  /** A SphereTrigger's world radius is 1 × its element's world scale. */
  _sizeOrbTriggers() {
    const r = 0.5 * this.orbSize.value * this.orbPickupRadius.value;
    for (const o of this._orbs) {
      o.inner.scale.setScalar(this.orbSize.value);
      if (o.trigger) o.trigger.element.scale.setScalar(r);
    }
  }
  _sizePlayerTrigger() {
    if (!this._playerTrigger || !this._playerObj) return;
    this._playerObj.getWorldScale(this._v1);
    const s = Math.max(1e-4, (this._v1.x + this._v1.y + this._v1.z) / 3);
    this._playerTrigger.element.scale.setScalar(this.playerRadius.value / s);
    this._playerTrigger.element.position.y = this.playerHeightOffset.value / s;
  }
  /** Highest orb centre the player can ever touch, in scene units. */
  _reachHeight() {
    return this.playerHeightOffset.value + this.playerRadius.value + this._orbRadius();
  }
  /**
   * Highest resting height an orb may be given. Below `_reachHeight()` by the
   * bob amplitude, because an orb parked exactly at the limit is only
   * collectable during part of its bob cycle — the player walks into it and it
   * takes, or doesn't, depending on the phase. Intermittent is worse than
   * impossible: it reads as a flaky game rather than a tuning mistake.
   */
  _spawnCeiling() {
    return this._reachHeight() - Math.abs(this.orbBob.value) - 0.08;
  }
  _orbRadius() {
    return 0.5 * this.orbSize.value * this.orbPickupRadius.value;
  }
  _bindPlayer() {
    const id = this.playerNode.value;
    if (this._playerTrigger) {
      this._playerTrigger.dispose();
      this._playerTrigger = void 0;
    }
    this._playerObj = void 0;
    if (!id) return;
    const comp = this._zc.resolveNodeID(id);
    this._playerObj = comp?.element;
    this._rebuildTriggers();
  }
  /* ── layout ───────────────────────────────────────────────────────── */
  /**
   * How far a spawn has to stay from the player, squared, and where they are.
   *
   * One rule, read by both the initial layout and a respawn. They used to
   * disagree: a respawning orb avoided the player, a freshly laid-out board
   * did not — so replaying a round after walking away dropped a can on the
   * player's head and it was collected on the first frame.
   *
   * Returns null when there is no player to avoid (no character assigned, or
   * the clearance turned off), so callers can skip the term entirely rather
   * than score against a position that means nothing.
   */
  _playerKeepOut(out) {
    const clear = Math.max(0, this.spawnClearance.value);
    if (clear <= 0 || !this._playerObj) return null;
    this._playerObj.getWorldPosition(out);
    this.element.worldToLocal(out);
    const d = this.playerRadius.value + this._orbRadius() + clear;
    return d * d;
  }
  _layout() {
    const count = clampInt(this.orbCount.value, 0, this._orbs.length);
    const rnd = mulberry32(this._roundSeed);
    const minR = Math.max(0, this.spawnMinRadius.value);
    const maxR = Math.max(minR, this.spawnMaxRadius.value);
    const sep2 = this.minSeparation.value * this.minSeparation.value;
    const cohere = this.maxSpacing.value > 0 ? Math.max(this.maxSpacing.value, this.minSeparation.value * 1.15) : 0;
    const cohere2 = cohere * cohere;
    const placed = [];
    const reach = this._spawnCeiling();
    let clampedAny = false;
    const keepOut2 = this._playerKeepOut(this._v1);
    this._orbs.forEach((o, i) => {
      if (i >= count) {
        o.active = false;
        o.alive = false;
        o.burst = 0;
        o.group.visible = false;
        if (o.trigger) o.trigger.enabled.value = false;
        return;
      }
      let px = 0, pz = 0, py = 0, bestScore = -Infinity;
      for (let attempt = 0; attempt < 40; attempt++) {
        const ang = rnd() * Math.PI * 2;
        const area = this.spawnArea.value;
        const rad = area === "ring" /* Ring */ ? maxR : annulusRadius(rnd, minR, maxR);
        const cx = Math.cos(ang) * rad;
        const cz = Math.sin(ang) * rad;
        let cy = this.spawnHeight.value + (rnd() - 0.5) * 2 * this.spawnHeightJitter.value;
        if (area === "dome" /* Dome */) {
          const t = maxR > 0 ? 1 - Math.min(1, rad / maxR) : 0;
          cy += t * t * this.spawnHeight.value * 1.5;
        }
        let nearest2 = Infinity;
        for (const q of placed) {
          const d2 = (q.x - cx) ** 2 + (q.z - cz) ** 2;
          if (d2 < nearest2) nearest2 = d2;
        }
        const sepOk = placed.length === 0 || sep2 <= 0 ? 1 : nearest2 / sep2;
        const cohOk = placed.length === 0 || cohere2 <= 0 ? 1 : Math.min(1, cohere2 / Math.max(nearest2, 1e-6));
        const plrOk = keepOut2 === null ? 1 : Math.min(
          1,
          ((cx - this._v1.x) ** 2 + (cz - this._v1.z) ** 2) / keepOut2
        );
        const score = Math.min(sepOk, 1) * 2 + cohOk + plrOk * 3;
        if (score > bestScore) {
          bestScore = score;
          px = cx;
          pz = cz;
          py = cy;
        }
        if (sepOk >= 1 && cohOk >= 1 && plrOk >= 1) break;
      }
      const capped = Math.min(py, reach);
      if (capped < py - 1e-4) clampedAny = true;
      py = Math.max(0.05, capped);
      const p = new THREE2.Vector3(px, py, pz);
      placed.push(p);
      o.home.copy(p);
      o.group.position.copy(p);
      o.phase = rnd();
      o.inner.rotation.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283);
      o.inner.scale.setScalar(this.orbSize.value);
      o.custom.scale.setScalar(1);
      o.beacon.scale.setScalar(this.beaconSize.value);
      o.active = true;
      o.alive = true;
      o.burst = 0;
      o.group.visible = true;
      if (o.trigger) o.trigger.enabled.value = true;
    });
    if (this._noRound) this._applyLoungeBoard();
    if (clampedAny && !this._warnedReach) {
      this._warnedReach = true;
      console.warn(
        `[OrbHuntGame] Some orbs spawned above the player's reach (${reach.toFixed(2)}) and were lowered. Reach = Player Height Offset (${this.playerHeightOffset.value}) + Player Pickup Radius (${this.playerRadius.value}) + orb radius (${this._orbRadius().toFixed(2)}). Lower Spawn Height / Spawn Height Jitter, or raise one of those, to place them where you intended.`
      );
    }
    this._sizeOrbTriggers();
    this._syncHud();
  }
  /**
   * Move a collected orb somewhere new.
   *
   * Draws from the round's live stream rather than re-seeding from the score,
   * so a one-orb board doesn't walk a fixed circuit — with `seed + score * 977`
   * the Nth pickup of every round landed in exactly the same place.
   *
   * Two rejections, best-of-N rather than first-fit: don't land on the player
   * (an orb that respawns on top of them is collected instantly and reads as a
   * skipped pickup), and don't land on another live orb.
   */
  _respawn(o) {
    const rnd = this._rng;
    const minR = Math.max(0, this.spawnMinRadius.value);
    const maxR = Math.max(minR, this.spawnMaxRadius.value);
    const sep2 = this.minSeparation.value * this.minSeparation.value;
    const keepOut2 = this._playerKeepOut(this._v1);
    let bestX = 0, bestZ = 0, bestPy = this.spawnHeight.value, bestScore = -Infinity;
    for (let attempt = 0; attempt < 14; attempt++) {
      const ang = rnd() * Math.PI * 2;
      const rad = this.spawnArea.value === "ring" /* Ring */ ? maxR : annulusRadius(rnd, minR, maxR);
      const px = Math.cos(ang) * rad, pz = Math.sin(ang) * rad;
      const py = this.spawnHeight.value + (rnd() - 0.5) * 2 * this.spawnHeightJitter.value;
      const plr = keepOut2 === null ? Infinity : ((px - this._v1.x) ** 2 + (pz - this._v1.z) ** 2) / keepOut2;
      let dOrb = Infinity;
      for (const q of this._orbs) {
        if (q === o || !q.active || !q.alive) continue;
        dOrb = Math.min(dOrb, (q.home.x - px) ** 2 + (q.home.z - pz) ** 2);
      }
      const cohere = this.maxSpacing.value > 0 ? Math.max(this.maxSpacing.value, this.minSeparation.value * 1.15) : 0;
      const cohesion = cohere > 0 && isFinite(dOrb) ? Math.min(1, cohere * cohere / Math.max(dOrb, 1e-6)) : 1;
      const score = Math.min(
        plr,
        sep2 > 0 ? dOrb / sep2 : Infinity,
        cohesion
      );
      if (score > bestScore) {
        bestScore = score;
        bestX = px;
        bestZ = pz;
        bestPy = py;
      }
      if (score >= 1) break;
    }
    o.home.set(
      bestX,
      Math.max(0.05, Math.min(bestPy, this._spawnCeiling())),
      bestZ
    );
    o.group.position.copy(o.home);
    o.active = true;
    o.alive = true;
    o.burst = 0;
    o.group.visible = !this._noRound;
    o.beacon.scale.setScalar(this.beaconSize.value);
    o.inner.scale.setScalar(this.orbSize.value);
    o.custom.scale.setScalar(1);
    if (o.trigger) o.trigger.enabled.value = !this._noRound;
  }
  /* ── round flow ───────────────────────────────────────────────────── */
  _start() {
    this._exitLounge();
    this._exitHideout();
    if (this._cdSeeded) this._rng = mulberry32(this._roundSeed ^ 2654435769);
    else this._newRoundSeed();
    this._cdSeeded = false;
    this._cdLeft = -1;
    this._cdHeld = false;
    this._portalHum(false);
    this._score = 0;
    this._streak = 0;
    this._warned = false;
    this._nextWarnAt = 0;
    this._timeLeft = this.roundTime.value;
    this._portalOpen = 0;
    this._portalDone = false;
    this._portalClosing = false;
    this._humStopAt = -1;
    this._portalCloseAt = -1;
    this._resetAt = -1;
    this._closeTimeout();
    this._hideReward(true);
    this._portalU.uOpacity.value = 0;
    this._layout();
    this._applyPortalVisibility();
    this._setState("playing" /* Playing */);
    this._closeMenu();
    this._playClip(this.startTimeline.value);
    this.onGameStart.emit();
  }
  /**
   * Start a round the way a player sees it: the mode changes at once (the
   * lounge or the hideout makes way), a 3-2-1 plays over the board, and the
   * clock starts on GO. Without a countdown (or UI) it's _start() directly.
   */
  _beginRound() {
    this._roundAfterPlace = false;
    if (this.placementEnabled.value && !this._placed) {
      this._cancelCountdown();
      this._exitLounge();
      this._exitHideout();
      this._closeIntro();
      this._closeMenu();
      this._reset();
      this._roundAfterPlace = true;
      return;
    }
    const secs = clampInt(this.countdown.value, 0, 10);
    if (secs <= 0 || !this.uiEnabled.value || !this._cdWrap) {
      this._cancelCountdown();
      this._start();
      return;
    }
    this._exitLounge();
    this._exitHideout();
    this._closeIntro();
    this._closeMenu();
    this._closeRewardModal(false);
    this._newRoundSeed();
    this._reset();
    this._cdSeeded = true;
    this._cdLeft = secs;
    this._cdHeld = false;
    this._cdShown = -1;
    this._cdGoAt = -1;
    this._syncCountdown(false);
    this._cdWrap.classList.add("on");
    this._applyUiVisibility();
  }
  /** Stop a countdown that hasn't reached GO (another mode took over). */
  _cancelCountdown() {
    this._roundAfterPlace = false;
    this._cdLeft = -1;
    this._cdHeld = false;
    this._cdGoAt = -1;
    this._cdSeeded = false;
    this._cdWrap?.classList.remove("on");
  }
  _syncCountdown(go) {
    const el = this._cdWrap;
    if (!el) return;
    const n = go ? 0 : Math.max(1, Math.ceil(this._cdLeft));
    if (n === this._cdShown) return;
    this._cdShown = n;
    const num = el.querySelector(".ohg-cdNum");
    num.textContent = go ? "GO!" : String(n);
    el.classList.toggle("ohg-cdGo", go);
    num.classList.remove("ohg-cdPop");
    void num.offsetWidth;
    num.classList.add("ohg-cdPop");
    el.querySelector(".ohg-cdTitle").textContent = this.menuTitle.value.trim() || "Cola Run";
    const target = clampInt(this.targetCount.value, 1, 999);
    const what = (this.scoreLabel.value.trim() || "cans").toLowerCase();
    el.querySelector(".ohg-cdSub").textContent = this.timerEnabled.value ? `Grab ${target} ${what} in ${Math.round(this.roundTime.value)} seconds` : `Grab ${target} ${what}`;
    if (go)
      this._play(
        this._sfxCollect,
        this.constructorProps.collectSound,
        () => this._audio?.collect(4, this.collectPitchStep.value),
        1.3
      );
    else this._play(this._sfxWarn, this.constructorProps.warningSound, () => this._audio?.warn());
  }
  /** Once a frame: run the countdown down; GO starts the round. */
  _stepCountdown(dt) {
    if (this._cdLeft > 0 && !this._cdHeld) {
      this._cdLeft -= dt;
      if (this._cdLeft <= 0) {
        this._syncCountdown(true);
        this._cdGoAt = this._time + 0.75;
        this._start();
      } else this._syncCountdown(false);
    }
    if (this._cdGoAt > 0 && this._time >= this._cdGoAt) {
      this._cdGoAt = -1;
      this._cdWrap?.classList.remove("on");
    }
  }
  /**
   * Roll the seed the next layout will use.
   *
   * Mattercraft ships no RNG, so the entropy has to come from Math.random().
   * That's the only unseeded call in the component and it's deliberately
   * confined here: everything downstream is still a reproducible mulberry32
   * stream, so a round can be replayed exactly by reading _roundSeed back out.
   */
  _newRoundSeed() {
    this._roundSeed = this.randomizeEachRound.value ? Math.random() * 4294967296 >>> 0 : this.seed.value | 0;
    this._rng = mulberry32(this._roundSeed ^ 2654435769);
  }
  _reset() {
    this._portalHum(false);
    this._score = 0;
    this._streak = 0;
    this._timeLeft = this.roundTime.value;
    this._portalOpen = 0;
    this._portalDone = false;
    this._portalClosing = false;
    this._humStopAt = -1;
    this._portalCloseAt = -1;
    this._resetAt = -1;
    this._closeTimeout();
    this._hideReward(true);
    this._portalU.uOpacity.value = 0;
    this._layout();
    this._applyPortalVisibility();
    this._setState(this.placementEnabled.value && !this._placed ? "placing" /* Placing */ : "idle" /* Idle */);
    this.onGameReset.emit();
  }
  _collect(o) {
    o.alive = false;
    o.burst = 1e-4;
    if (o.trigger) o.trigger.enabled.value = false;
    this._score++;
    this._streak++;
    const step = this.collectPitchStep.value;
    const speed = 1 + step * Math.min(this._streak - 1, 12);
    this._play(
      this._sfxCollect,
      this.constructorProps.collectSound,
      () => this._audio?.collect(this._streak, step),
      speed
    );
    this.onOrbCollected.emit({ score: this._score, target: this.targetCount.value });
    this._syncHud();
    if (this._score >= clampInt(this.targetCount.value, 1, 999)) this._win();
    else if (this.respawnCollected.value) this._respawn(o);
  }
  _win() {
    this._setState("won" /* Won */);
    if (this.rewardEnabled.value) {
      this._earned = true;
      try {
        localStorage.setItem("ohg-reward-earned", "1");
      } catch {
      }
    }
    this._play(this._sfxWin, this.constructorProps.winSound, () => this._audio?.win());
    this._portalHum(true);
    if (this.portalHumSeconds.value > 0) {
      this._humStopAt = this._time + this.portalHumSeconds.value;
    }
    this._portal.visible = true;
    this.onTargetReached.emit();
    this._playClip(this.winTimeline.value);
    if (this.rewardEnabled.value) {
      this._rewardAt = this._time + Math.max(0, Math.min(5, this.rewardDelay.value));
    }
  }
  /* ── digital exclusive ─────────────────────────────────────────────── */
  _showReward() {
    this._rewardAt = -1;
    const word = this.rewardWordmark.value;
    const badge = this.rewardBadge.value;
    const dur = Math.max(1, Math.min(20, this.rewardDuration.value));
    this._syncReward();
    this._syncRewardTheme();
    this._fitReward();
    if (word) {
      this._rwWord.classList.remove("on");
      void this._rwWord.offsetWidth;
      this._rwWord.classList.add("on");
      this._rwWordHideAt = this._time + dur;
      this._duckHud(true);
    }
    if (badge && !word) {
      this._rwBadge.classList.remove("on");
      void this._rwBadge.offsetWidth;
      this._rwBadge.classList.add("on");
      this._rwBadgeHideAt = this._time + dur;
    } else if (badge && word) {
      this._rwBadgeHideAt = this._time + dur + 4.25;
      this._rwBadge.classList.remove("on");
      window.setTimeout(() => {
        if (this._rwBadgeHideAt > 0) this._rwBadge.classList.add("on");
      }, Math.round(dur * 1e3 + 250));
    }
    if (this.rewardModal.value) {
      const gap = Math.max(0, Math.min(30, this.rewardModalDelay.value));
      const runsFirst = word ? dur : 0;
      this._rwModalAt = this._time + runsFirst + gap;
    }
    this._play(
      this._sfxReward,
      this.constructorProps.rewardSound,
      () => this._audio?.reward()
    );
    this._playClip(this.rewardTimeline.value);
    this.onRewardShown.emit();
  }
  /* ── reward modal ─────────────────────────────────────────────────── */
  /**
   * The redemption steps, built once and used in two places: the How To Claim
   * screen and the reward panel in Instructions mode. One builder because one
   * set of copy — two renderers would drift the moment a step changed.
   *
   * A step with no text is skipped, so blanking Step 4 removes it rather than
   * leaving an empty numbered row.
   */
  _stepsHtml() {
    const E = _OrbHuntGame._esc;
    const steps = [
      [this.step1Text.value, this.step1Image.value],
      [this.step2Text.value, this.step2Image.value],
      [this.step3Text.value, this.step3Image.value],
      [this.step4Text.value, this.step4Image.value]
    ];
    const link = this.step1Link.value.trim();
    const code = this.claimCode.value.trim();
    let n = 0;
    return steps.filter(([t, img]) => t.trim() || img.trim()).map(([text, img], i) => {
      n++;
      const isFirst = i === 0;
      const showsCode = !!code && text.includes(code);
      const body = showsCode ? E(text).replace(
        E(code),
        `<button class="ohg-stepCode" type="button" data-code="1">${E(code)}</button>`
      ) : E(text);
      return `<li class="ohg-step">
          <span class="ohg-stepNum" aria-hidden="true">${n}</span>
          <div class="ohg-stepBody">
            <p class="ohg-stepText">${body}</p>
            ${isFirst && link ? `<a class="ohg-stepLink" href="${E(link)}" target="_blank" rel="noopener">${E(this.step1LinkLabel.value.trim() || "Open link")}</a>` : ""}
            ${img.trim() ? `<button class="ohg-shot" type="button" data-shot="${E(img)}"
                         aria-label="${E(this.imageViewerOpenLabel.value.trim() || "View image full screen")}">
                   <img class="ohg-stepImg" src="${E(img)}" alt="" loading="lazy" />
                   <span class="ohg-shotHint" aria-hidden="true">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                          stroke-width="2.2" stroke-linecap="round">
                       <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>
                     </svg>
                   </span>
                 </button>` : ""}
          </div>
        </li>`;
    }).join("");
  }
  /**
   * Wire a freshly rendered step list.
   *
   * Both renderers call this ONE function rather than each remembering to
   * call the code binder and the image binder. Two call sites that each have
   * to list every binding is how the reward panel ends up with live steps and
   * dead screenshots the first time a third binding is added.
   */
  _bindSteps(root) {
    this._bindStepCodes(root);
    this._bindStepShots(root);
  }
  /** Copy the claim code, and say so — a silent copy reads as a dead button. */
  _bindStepCodes(root) {
    root.querySelectorAll(".ohg-stepCode").forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = this.claimCode.value.trim();
        const done = () => {
          const was = btn.textContent;
          btn.textContent = "Copied";
          btn.classList.add("ohg-copied");
          window.setTimeout(() => {
            btn.textContent = was;
            btn.classList.remove("ohg-copied");
          }, 1400);
        };
        navigator.clipboard?.writeText(code).then(done, () => {
          console.warn("[OrbHuntGame] Clipboard refused; the code is still on screen.");
        });
      });
    });
  }
  /* ── image viewer ─────────────────────────────────────────────────── */
  /** Every step screenshot opens the viewer. */
  _bindStepShots(root) {
    root.querySelectorAll(".ohg-shot").forEach((btn) => {
      btn.addEventListener("click", () => this._openImage(btn.dataset.shot ?? "", btn));
    });
  }
  /**
   * Show one image full screen.
   *
   * It opens at "fit" — the whole picture inside the viewport — because the
   * first thing anyone wants is to see all of it at a readable size. A second
   * tap goes to 2× and the frame becomes scrollable, which is how you read a
   * small label in the corner of a screenshot. Native scrolling does the
   * panning: no drag maths, and momentum, bounce and trackpads all behave the
   * way the platform already does.
   */
  _openImage(src, opener) {
    if (!src || !this._lightWrap) return;
    this._lightOpener = opener;
    this._lightImg.src = src;
    this._setImageZoom(false);
    this._lightWrap.classList.add("on");
    this._lightWrap.querySelector(".ohg-lightX")?.focus();
  }
  _closeImage() {
    if (!this._lightWrap) return;
    this._lightWrap.classList.remove("on");
    this._setImageZoom(false);
    this._lightOpener?.focus();
    this._lightOpener = void 0;
    this._lightImg.removeAttribute("src");
  }
  _setImageZoom(on) {
    const frame = this._lightWrap.querySelector(".ohg-lightFrame");
    this._lightWrap.classList.toggle("ohg-zoomed", on);
    const zoom = this._lightWrap.querySelector(".ohg-lightZoom");
    if (zoom) {
      zoom.setAttribute("aria-pressed", String(on));
      zoom.setAttribute("aria-label", on ? "Fit image to screen" : "Zoom in");
    }
    if (frame && !on) {
      frame.scrollLeft = 0;
      frame.scrollTop = 0;
    } else if (frame && on) {
      frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
      frame.scrollTop = (frame.scrollHeight - frame.clientHeight) / 2;
    }
  }
  _syncInstructions() {
    if (!this._insWrap) return;
    const q = (sel) => this._insWrap.querySelector(sel);
    q(".ohg-insTitle").textContent = this.instructionsTitle.value;
    q(".ohg-insClose").textContent = this.instructionsCloseLabel.value.trim() || "Close";
    const list = q(".ohg-steps");
    list.innerHTML = this._stepsHtml();
    this._bindSteps(list);
    if (this._rwModalWrap) this._syncRewardModal();
  }
  /**
   * Open the How To Claim screen.
   *
   * `returnToReward` is declared by the CALLER rather than inferred from
   * whether the reward panel happens to be open, because by the time this runs
   * the panel has already been closed to make room for the steps. Every entry
   * point therefore says where it came from, and a new one has to say too.
   */
  _openInstructions(returnToReward = false) {
    if (!this._insWrap || !this.uiEnabled.value) return;
    this._insFromReward = returnToReward;
    this._syncInstructions();
    this._insWrap.classList.remove("on");
    void this._insWrap.offsetWidth;
    this._insWrap.classList.add("on");
  }
  _closeInstructions() {
    if (this._insWrap) this._insWrap.classList.remove("on");
    if (this._insFromReward) {
      this._insFromReward = false;
      this._reopenRewardModal();
      return;
    }
    this._resumeIfPaused();
  }
  /**
   * Put the reward panel back without replaying the whole arrival.
   *
   * Not `_openRewardModal`: that restarts the entrance animation and emits
   * On Reward Modal Shown a second time, so a behaviour counting wins would
   * count this one twice and the panel would pop as though it were news. This
   * is a return to something the player already saw.
   */
  _reopenRewardModal() {
    if (!this._rwModalWrap || !this.uiEnabled.value) return;
    this._syncRewardModal();
    this._syncRewardModalTheme();
    this._rwModalWrap.classList.add("on");
  }
  /** Open the How To Claim screen. @zui */
  showInstructions() {
    this._openInstructions();
  }
  /** Close the How To Claim screen. @zui */
  hideInstructions() {
    this._closeInstructions();
  }
  /** True while the How To Claim screen is on. @zui */
  instructionsOpen() {
    return !!this._insWrap && this._insWrap.classList.contains("on");
  }
  _syncTimeoutModal() {
    if (!this._toWrap) return;
    const q = (sel) => this._toWrap.querySelector(sel);
    q(".ohg-toTitle").textContent = this.timeoutTitle.value;
    const body = q(".ohg-toBody");
    body.textContent = this.timeoutBody.value;
    body.style.display = this.timeoutBody.value.trim() ? "" : "none";
    q(".ohg-toRetry").textContent = this.timeoutRetryLabel.value.trim() || "Retry";
    const lounge = q(".ohg-toLounge");
    lounge.style.display = this.loungeEnabled.value ? "" : "none";
    lounge.textContent = this.timeoutLoungeLabel.value.trim() || "Lounge";
  }
  _syncTimeoutTheme() {
    if (!this._toWrap) return;
    const shell = this._toWrap.querySelector(".ohg-rwmShell");
    if (!shell) return;
    const st = shell.style;
    st.setProperty("--ohg-rwmA", this.timeoutAccent.value);
    st.setProperty("--ohg-rwmB", this.timeoutAccent2.value);
    st.setProperty("--ohg-rwmArgb", rgbChannels(this.timeoutAccent.value, "255,138,107"));
    st.setProperty("--ohg-rwmBrgb", rgbChannels(this.timeoutAccent2.value, "255,84,112"));
  }
  _openTimeout() {
    if (!this._toWrap || !this.uiEnabled.value) return;
    this._timeoutAt = -1;
    this._syncTimeoutModal();
    this._syncTimeoutTheme();
    this._toWrap.classList.remove("on");
    void this._toWrap.offsetWidth;
    this._toWrap.classList.add("on");
    this.onTimeoutModalShown.emit();
  }
  _closeTimeout() {
    if (!this._toWrap) return;
    this._timeoutAt = -1;
    this._toWrap.classList.remove("on");
  }
  /** True while the timeout panel is on screen. @zui */
  timeoutModalOpen() {
    return !!this._toWrap && this._toWrap.classList.contains("on");
  }
  /** Show the timeout panel now, without losing a round. @zui */
  showTimeoutModal() {
    this._openTimeout();
  }
  /** Hide the timeout panel immediately. @zui */
  hideTimeoutModal() {
    this._closeTimeout();
  }
  _openRewardModal() {
    if (!this._rwModalWrap || !this.uiEnabled.value) return;
    this._rwModalAt = -1;
    this._syncRewardModal();
    this._syncRewardModalTheme();
    this._rwModalWrap.classList.remove("on");
    void this._rwModalWrap.offsetWidth;
    this._rwModalWrap.classList.add("on");
    this._playClip(this.rewardModalTimeline.value);
    this.onRewardModalShown.emit();
  }
  _closeRewardModal(dismissed) {
    if (!this._rwModalWrap) return;
    this._rwModalAt = -1;
    const wasOpen = this._rwModalWrap.classList.contains("on");
    this._rwModalWrap.classList.remove("on");
    if (dismissed) this._insFromReward = false;
    if (wasOpen && dismissed) this.onRewardModalDismissed.emit();
  }
  _syncRewardModal() {
    if (!this._rwModalWrap) return;
    const q = (sel) => this._rwModalWrap.querySelector(sel);
    const set = (sel, text) => {
      const el = q(sel);
      el.textContent = text;
      el.style.display = text.trim() ? "" : "none";
    };
    set(".ohg-rwmKicker", this.rewardModalKicker.value);
    set(".ohg-rwmTitle", this.rewardModalTitle.value);
    set(".ohg-rwmBody", this.rewardModalBody.value);
    set(".ohg-rwmClose", this.rewardModalCloseLabel.value);
    const art = q(".ohg-rwmArt");
    const src = this.constructorProps.rewardModalImage;
    art.innerHTML = src ? `<img alt="" src="${src.replace(/"/g, "&quot;")}" />` : _OrbHuntGame._goldBadgeSvg();
    const steps = q(".ohg-rwmSteps");
    const asSteps = this.rewardModalContent.value === "instructions" /* Instructions */;
    steps.innerHTML = asSteps ? this._stepsHtml() : "";
    steps.style.display = asSteps ? "" : "none";
    if (asSteps) this._bindSteps(steps);
    art.style.display = asSteps ? "none" : "";
    q(".ohg-rwmBody").style.display = asSteps || !this.rewardModalBody.value.trim() ? "none" : "";
    this._rwModalWrap.classList.toggle("ohg-rwmWide", asSteps);
    const lounge = q(".ohg-rwmLounge");
    const loungeLabel = this.loungeButtonLabel.value.trim();
    lounge.textContent = loungeLabel;
    lounge.style.display = this.rewardModalLounge.value && this.loungeEnabled.value && loungeLabel ? "" : "none";
    const replay = q(".ohg-rwmReplay");
    const replayLabel = this.rewardModalReplayLabel.value.trim();
    replay.textContent = replayLabel;
    replay.style.display = this.rewardModalReplay.value && replayLabel ? "" : "none";
    const claim = q(".ohg-rwmClaim");
    const redundant = asSteps && this.rewardModalButtonAction.value === "instructions" /* Instructions */;
    claim.querySelector(".ohg-claimLbl").textContent = this.rewardModalButtonLabel.value;
    claim.style.display = !redundant && this.rewardModalButtonLabel.value.trim() ? "" : "none";
  }
  _syncRewardModalTheme() {
    if (!this._rwModalWrap) return;
    const shell = this._rwModalWrap.querySelector(".ohg-rwmShell");
    if (!shell) return;
    const st = shell.style;
    st.setProperty("--ohg-rwmA", this.rewardModalAccent.value);
    st.setProperty("--ohg-rwmB", this.rewardModalAccent2.value);
    st.setProperty("--ohg-rwmArgb", rgbChannels(this.rewardModalAccent.value, "79,227,208"));
    st.setProperty("--ohg-rwmBrgb", rgbChannels(this.rewardModalAccent2.value, "47,143,255"));
    const claim = this.rewardModalClaimColor.value;
    const cr = [
      Math.round(Math.max(0, Math.min(1, claim[0])) * 255),
      Math.round(Math.max(0, Math.min(1, claim[1])) * 255),
      Math.round(Math.max(0, Math.min(1, claim[2])) * 255)
    ];
    const lift = (k) => cr.map((v) => Math.round(v + (255 - v) * k)).join(",");
    const sink = (k) => cr.map((v) => Math.round(v * k)).join(",");
    st.setProperty("--ohg-rwmClaimRgb", cr.join(","));
    st.setProperty("--ohg-rwmClaimLight", `rgb(${lift(0.22)})`);
    st.setProperty("--ohg-rwmClaimDeep", `rgb(${sink(0.86)})`);
    st.setProperty("--ohg-rwmClaimOn", bestTextOn(cr));
    const lounge = this.loungeAccent.value;
    st.setProperty("--ohg-rwmLoungeRgb", [
      Math.round(Math.max(0, Math.min(1, lounge[0])) * 255),
      Math.round(Math.max(0, Math.min(1, lounge[1])) * 255),
      Math.round(Math.max(0, Math.min(1, lounge[2])) * 255)
    ].join(","));
    this._rwModalWrap.classList.toggle("ohg-rwmSpinning", this.rewardModalAnimate.value);
    this._rwModalWrap.classList.toggle("ohg-rwmFrosted", this.rewardModalGlass.value);
  }
  /**
   * The default artwork: a gold medallion, drawn rather than shipped.
   *
   * A bundled PNG would be another asset to load and would blur when the modal
   * scales up on a tablet. The metal read comes from three things a flat gold
   * fill doesn't give you: a diagonal gradient with a light band across the
   * middle, a darker rim with a bright inner edge, and a specular highlight
   * that sits off-centre.
   */
  static _goldBadgeSvg() {
    return `
    <svg viewBox="0 0 120 120" class="ohg-rwmBadge" aria-hidden="true">
      <defs>
        <linearGradient id="ohgGold" x1="18%" y1="0%" x2="82%" y2="100%">
          <stop offset="0%"   stop-color="#fff3c4"/>
          <stop offset="22%"  stop-color="#f7d982"/>
          <stop offset="24%"  stop-color="#f2ca63"/>
          <stop offset="46%"  stop-color="#c9922b"/>
          <stop offset="55%"  stop-color="#ffe9a8"/>
          <stop offset="70%"  stop-color="#d9a13c"/>
          <stop offset="100%" stop-color="#8a5f16"/>
        </linearGradient>
        <linearGradient id="ohgRim" x1="0%" y1="0%" x2="60%" y2="100%">
          <stop offset="0%"   stop-color="#ffe9a8"/>
          <stop offset="50%"  stop-color="#a4761f"/>
          <stop offset="100%" stop-color="#6d4a12"/>
        </linearGradient>
        <radialGradient id="ohgSpec" cx="34%" cy="28%" r="42%">
          <stop offset="0%"   stop-color="#ffffff" stop-opacity=".85"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="52" fill="url(#ohgRim)"/>
      <circle cx="60" cy="60" r="45" fill="url(#ohgGold)"/>
      <circle cx="60" cy="60" r="45" fill="none" stroke="#fff2c9"
              stroke-opacity=".55" stroke-width="1.5"/>
      <path d="M60 30l7.6 15.9 17.2 2.5-12.5 12.4 3 17.4L60 70l-15.3 8.2 3-17.4
               L35.2 48.4l17.2-2.5L60 30z" fill="#fff6d8" fill-opacity=".92"/>
      <circle cx="60" cy="60" r="52" fill="url(#ohgSpec)"/>
    </svg>`;
  }
  _duckHud(on) {
    [this._scoreWrap, this._timeWrap].forEach((e) => e?.classList.toggle("ohg-ducked", on));
  }
  _hideReward(immediate = false) {
    this._rewardAt = -1;
    this._insFromReward = false;
    this._closeRewardModal(false);
    this._rwWordHideAt = -1;
    this._rwBadgeHideAt = -1;
    this._rwWord.classList.remove("on");
    this._rwBadge.classList.remove("on");
    this._duckHud(false);
    if (immediate) {
      [this._rwWord, this._rwBadge].forEach((e) => {
        e.classList.add("ohg-noAnim");
        void e.offsetWidth;
        e.classList.remove("ohg-noAnim");
      });
    }
  }
  /** Text and emblem. Cheap, so it just rewrites rather than diffing. */
  _syncReward() {
    if (!this._rwWord) return;
    const q = (s) => this._rewardWrap.querySelector(s);
    const title = this.rewardTitle.value;
    const msg = this.rewardMessage.value;
    const kick = this.rewardKicker.value;
    const emblem = this._emblemSvg(this.rewardIcon.value);
    q(".ohg-rwEmblem").innerHTML = emblem;
    q(".ohg-rwEmblem").style.display = emblem ? "" : "none";
    q(".ohg-rwKicker").textContent = kick;
    q(".ohg-rwKicker").style.display = kick ? "" : "none";
    q(".ohg-rwTitle").textContent = title;
    q(".ohg-rwPlate").style.display = title ? "" : "none";
    q(".ohg-rwMsg").textContent = msg;
    q(".ohg-rwMsg").style.display = msg ? "" : "none";
    q(".ohg-rwBadgeIc").innerHTML = emblem;
    q(".ohg-rwBadgeTitle").textContent = title || kick;
    q(".ohg-rwBadgeSub").textContent = msg;
    q(".ohg-rwBadgeSub").style.display = msg ? "" : "none";
    this._fitReward();
  }
  /**
   * Shrink the headline until it fits on one line.
   *
   * Measured, not estimated: a character count can't know the font, and the
   * first version of this guessed 0.62em per character and clipped
   * "DIGITAL EXCLUSIVE" on a phone. `scrollWidth` is the real typeset width
   * even while the layer is hidden (visibility, not display), so this is safe
   * to call before the reveal.
   */
  _fitReward() {
    if (!this._rwWord) return;
    const t = this._rewardWrap.querySelector(".ohg-rwTitle");
    if (!t || !t.textContent) return;
    if (this._rwWord.clientWidth <= 0) return;
    let scale = 1;
    this._rwWord.style.setProperty("--ohg-rwScale", "1");
    for (let i = 0; i < 4; i++) {
      const avail = t.clientWidth, need = t.scrollWidth;
      if (!need || !avail || need <= avail) break;
      scale = Math.max(0.18, scale * (avail / need) * 0.985);
      this._rwWord.style.setProperty("--ohg-rwScale", scale.toFixed(4));
    }
  }
  /** Colours and the electric switch — separate so a colour tweak is cheap. */
  _syncRewardTheme() {
    if (!this._rwWord) return;
    const s = this._rewardWrap.style;
    s.setProperty("--ohg-rwA", this.rewardColorA.value);
    s.setProperty("--ohg-rwB", this.rewardColorB.value);
    s.setProperty("--ohg-rwIc", this.rewardIconColor.value);
    s.setProperty("--ohg-rwArgb", rgbChannels(this.rewardColorA.value, "111,242,255"));
    s.setProperty("--ohg-rwBrgb", rgbChannels(this.rewardColorB.value, "160,123,255"));
    this._rewardWrap.classList.toggle("ohg-electric", this.rewardElectric.value);
  }
  _emblemSvg(i) {
    const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    switch (i) {
      case "trophy" /* Trophy */:
        return S(`<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/><path d="M12 14v3"/><path d="M9 20h6"/><path d="M10 17h4l1 3H9l1-3z"/>`);
      case "medal" /* Medal */:
        return S(`<circle cx="12" cy="14.5" r="5.5"/><path d="m8.5 9.5-3-6.5h5l2 4"/><path d="m15.5 9.5 3-6.5h-5l-2 4"/><path d="m12 12 .9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1.4-2L8.7 14.2l2-.3L12 12z"/>`);
      case "star" /* Star */:
        return S(`<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9L12 3z"/>`);
      case "bolt" /* Bolt */:
        return S(`<path d="M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2z"/>`);
      case "orb" /* Orb */:
        return `<span class="ohg-rwOrb" aria-hidden="true"></span>`;
      case "gift" /* Gift */:
        return S(`<rect x="3" y="9" width="18" height="12" rx="1.6"/><path d="M3 13.5h18"/><path d="M12 9v12"/><path d="M12 9S10.5 3 8 3a2.4 2.4 0 0 0 0 6"/><path d="M12 9s1.5-6 4-6a2.4 2.4 0 0 1 0 6"/>`);
      case "sparkle" /* Sparkle */:
        return S(`<path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5L3.5 11 10 9l2-6.5z"/><path d="M19 3.5 19.8 6l2.5.8-2.5.8L19 10l-.8-2.4L15.7 6.8 18.2 6 19 3.5z"/>`);
      default:
        return "";
    }
  }
  _syncClaim() {
    if (!this._menuWrap) return;
    const b = this._menuWrap.querySelector(".ohg-claim");
    if (!b) return;
    b.style.display = this.claimEnabled.value ? "" : "none";
    b.querySelector(".ohg-claimLbl").textContent = this.claimLabel.value || "Claim Digital Exclusive";
  }
  _claim() {
    this.onClaimed.emit();
    this._playClip(this.claimTimeline.value);
    const url = this.claimUrl.value.trim() || this.step1Link.value.trim();
    if (!url) return;
    if (this.claimNewTab.value) window.open(url, "_blank", "noopener,noreferrer");
    else window.location.href = url;
  }
  /**
   * Another round, straight from the reward panel.
   *
   * `_start()` already closes this panel and clears the celebration on its way
   * through `_hideReward(true)`, so there is nothing to tear down here — and
   * doing it twice would restart the entrance animation of a panel that is on
   * its way out.
   *
   * The event and the timeline fire BEFORE the round starts, so a behaviour
   * hanging off either one is looking at the panel that was just dismissed
   * rather than at a board that has already been rebuilt underneath it.
   */
  _replay() {
    this.onReplay.emit();
    this._playClip(this.replayTimeline.value);
    this.startGame();
  }
  /**
   * The reward panel's primary button.
   *
   * Its default is the steps rather than the link, because the item is
   * redeemed by typing a code into another app: sending someone to that app
   * with no code is sending them nowhere, and they will not come back to an
   * AR session they've already navigated away from to find out what it was.
   *
   * Both branches emit On Claimed and play Claim Timeline. The claim is the
   * player's intent, not the mechanism, so a scene reacting to it — a sound,
   * an analytics ping, an animation — doesn't have to care which route the
   * author picked.
   */
  _rewardModalClaim() {
    if (this.rewardModalButtonAction.value === "openLink" /* OpenLink */) {
      this._claim();
      this._closeRewardModal(false);
      return;
    }
    this.onClaimed.emit();
    this._playClip(this.claimTimeline.value);
    this._closeRewardModal(false);
    this._openInstructions(true);
  }
  _fail() {
    this._setState("failed" /* Failed */);
    this._play(this._sfxFail, this.constructorProps.failSound, () => this._audio?.fail());
    this.onTimeUp.emit();
    this._playClip(this.failTimeline.value);
    if (this.timeoutModal.value && this.uiEnabled.value) {
      this._timeoutAt = this._time + Math.max(0, this.timeoutDelay.value);
    } else if (this.timeoutAction.value === "resetAndIdle" /* ResetAndIdle */) {
      this._resetAt = this._time + Math.max(0, this.resetDelay.value);
    }
  }
  /**
   * Play a file if one was supplied for this cue, otherwise fall back to the
   * built-in synth. `seek(0)` first — without the rewind a retrigger is a
   * silent no-op, which is the trap Zappar's own PlaySound behaviour guards.
   */
  _play(a, source, synth, speed = 1) {
    if (!this.soundEnabled.value) return;
    if (source) {
      a.seek(0);
      a.play({ speed });
    } else {
      synth();
    }
  }
  _portalHum(on) {
    if (on === this._humPlaying) return;
    this._humPlaying = on;
    if (this.constructorProps.portalHumSound) {
      if (on) {
        this._sfxHum.loop.value = true;
        this._sfxHum.seek(0);
        this._sfxHum.play();
      } else this._sfxHum.stop();
    } else {
      this._audio?.portalHum(on);
    }
  }
  /** Music comes from a file when one is supplied, otherwise from the synth. */
  _applyMusicSource() {
    const gate = this.musicStart.value === "onLoad" /* OnLoad */ || this._state !== "idle" /* Idle */ && this._state !== "placing" /* Placing */;
    const on = this.musicEnabled.value && gate;
    if (this.constructorProps.musicTrack) {
      this._audio?.setMusic(false);
      if (on) {
        this._sfxMusic.loop.value = true;
        this._sfxMusic.play({ loop: true });
      } else this._sfxMusic.stop();
    } else {
      this._sfxMusic.stop();
      this._audio?.setMusic(on);
    }
  }
  /** Timelines and States are the same runtime object — both resolve here. */
  /**
   * Every GLTF under the Lounge Character node (or the node itself).
   * Resolved fresh each press — the reference is cheap and the scene can
   * change under us in the editor.
   */
  _loungeGltfs() {
    const id = this.loungeCharacter.value;
    if (!id) return [];
    const root = this._zc.resolveNodeID(id);
    if (!root) return [];
    const out = [];
    const walk = (c) => {
      if (c instanceof GLTF) out.push(c);
      for (const child of c.children) walk(child);
    };
    walk(root);
    return out;
  }
  /**
   * Put the lounge character back to a clean animation state.
   *
   * Two separate things hold a stale pose, and both have to be released —
   * this is all verified from @zcomponent/core's animation source:
   *
   * 1. THE MIXER. A timeline drives a model animation through a StreamTrack,
   *    which ends up at a THREE.AnimationAction with clampWhenFinished on.
   *    When the timeline ends or is interrupted the track calls pause(), not
   *    stop() — and a paused action still applies its pose at full weight
   *    every frame. LayerClip.stop() doesn't save you either: it reports the
   *    stop at an absolute time the track can't map to a block, so the track
   *    pauses again. The ONLY reliable release is stopping the model's
   *    streams directly, which is what the Lounge Character reference is for.
   *
   * 2. THE LAYER. A timeline that keyframes node properties keeps applying
   *    them while it is its layer's active clip, playing or not. Stopping
   *    the clip and handing the layer a null entry releases that influence
   *    (with the layer's own fade, so it lets go smoothly).
   *
   * What it deliberately does NOT do: stop a running animation the lounge
   * didn't start. The joystick's walk keeps walking through a button press —
   * only the lounge's own animations and parked poses are cleared.
   */
  _resetLoungeAnimations(exceptId) {
    const prevId = this._loungeClipId;
    if (prevId && prevId !== exceptId) {
      const prev = this._zc.animation.layerClipByID.get(prevId);
      if (prev) {
        prev.stop();
        if (prev.layer.active === prev) prev.layer.setActive(null);
      }
    }
    stopLoungeAnims(this._loungeGltfs(), this._loungeAnims);
    this._loungeAnims.clear();
    this._loungeClipStreams.clear();
  }
  /**
   * Every stream object the timeline drives, including through nested clips.
   * `_streamTracks` is internal API, read from @zcomponent/core 1.29 — hence
   * the defensive chaining, and hence this being a *second* line of defence
   * behind the running-set snapshot rather than the only one.
   */
  _clipStreamObjects(id) {
    const out = /* @__PURE__ */ new Set();
    if (!id) return out;
    const lc = this._zc.animation.layerClipByID.get(id);
    const walk = (clip) => {
      const tracks = clip?._streamTracks ?? [];
      for (const t of tracks) {
        const st = t;
        if (st.stream) out.add(st.stream);
        if (st.clip) walk(st.clip);
      }
    };
    walk(lc?.clip);
    return out;
  }
  /**
   * Lounge timelines are exclusive: starting one resets whatever the last
   * one did, then plays from frame zero. Game timelines go through
   * _playClip unchanged — they're fire-and-forget by design.
   *
   * The three bookkeeping sets are what lets the watchdog below tell the
   * joystick's walk apart from everything else: `owned` is what this press
   * started (play() reaches the mixer synchronously, so a before/after
   * snapshot catches it), `ambient` is what was already running (a tail-idle
   * loop must never trigger a release), and `clipStreams` covers an owned
   * animation whose block starts partway into the timeline.
   */
  _playLoungeClip(id) {
    const models = this._loungeGltfs();
    const before = runningAnimKeys(models);
    this._resetLoungeAnimations(id);
    this._loungeClipId = id;
    this._playClip(id);
    const after = runningAnimKeys(models);
    this._loungeAnims = new Set([...after].filter((k) => !before.has(k)));
    this._loungeAmbient = new Set([...before].filter((k) => after.has(k)));
    this._loungeClipStreams = this._clipStreamObjects(id);
  }
  /**
   * Let go of whatever pose the lounge animations left on the character.
   *
   * Runs by itself the moment another system starts an animation on the
   * character — in practice, the joystick playing its walk — so the walk
   * never blends with a parked Sleep or Purr. It's also callable from
   * events or the console if a controller drives the character some way
   * the watchdog can't see.
   *
   * @zui
   */
  releaseLoungePose() {
    this._resetLoungeAnimations();
    this._loungeClipId = void 0;
    this._loungeAmbient.clear();
  }
  /**
   * The detector. While a lounge animation is latched, any animation that
   * starts running on the character that the lounge can't account for means
   * another system has taken over — release our pose and get out of its way.
   * Ambient animations stay exempt only while they keep running: a walk that
   * was mid-stride at button-press time, then stopped, then started again is
   * a fresh takeover, not ambience.
   */
  _loungeWatchdog() {
    if (!this._lounge && !this._hideout || this._loungeClipId === void 0) return;
    if (!this.loungeCharacter.value) return;
    const models = this._loungeGltfs();
    const running = runningAnimKeys(models);
    for (const k of [...this._loungeAmbient]) {
      if (!running.has(k)) this._loungeAmbient.delete(k);
    }
    const external = firstExternalAnim(
      running,
      this._loungeAnims,
      this._loungeAmbient,
      this._loungeClipStreams,
      models
    );
    if (external !== void 0) this.releaseLoungePose();
  }
  _playClip(id) {
    if (!id) return;
    const clip = this._zc.animation.layerClipByID.get(id);
    if (!clip) return;
    clip.seek(0, { dontActivateLayer: true });
    clip.play();
  }
  _setState(s) {
    const was = this._state;
    this._state = s;
    const inRound = (g) => g !== "idle" /* Idle */ && g !== "placing" /* Placing */;
    if (inRound(was) !== inRound(s)) this._applyMusicSource();
    this._syncMenu();
    this._syncHud();
    this._restackHud();
  }
  _tick(dt) {
    if (!this._anchorBound) {
      this._anchorBound = true;
      if (this.placementAnchor.value) this._bindPlacementAnchor();
    }
    this._time += dt;
    this._orbU.uTime.value = this._time;
    this._beaconU.uTime.value = this._time;
    this._portalU.uTime.value = this._time;
    this._audio?.musicTick();
    this._stepCountdown(dt);
    this._loungeWatchdog();
    if (this._state === "playing" /* Playing */ && this.timerEnabled.value) {
      this._timeLeft -= dt;
      if (this._timeLeft <= this.warningTime.value && !this._warned) {
        this._warned = true;
        this._nextWarnAt = this._time;
      }
      if (this._warned && this._timeLeft > 0 && this._time >= this._nextWarnAt) {
        this._nextWarnAt = this._time + 1;
        this._play(this._sfxWarn, this.constructorProps.warningSound, () => this._audio?.warn());
      }
      if (this._timeLeft <= 0) {
        this._timeLeft = 0;
        this._fail();
      }
      if (this._time >= this._nextHudAt) {
        this._nextHudAt = this._time + 0.1;
        this._syncHud();
      }
    }
    if (this._timeoutAt > 0 && this._time >= this._timeoutAt) {
      this._timeoutAt = -1;
      this._openTimeout();
    }
    if (this._resetAt > 0 && this._time >= this._resetAt) {
      this._resetAt = -1;
      this._reset();
    }
    if (this._rewardAt > 0 && this._time >= this._rewardAt) this._showReward();
    if (this._rwWordHideAt > 0 && this._time >= this._rwWordHideAt) {
      this._rwWordHideAt = -1;
      this._rwWord.classList.remove("on");
      this._duckHud(false);
    }
    if (this._rwBadgeHideAt > 0 && this._time >= this._rwBadgeHideAt) {
      this._rwBadgeHideAt = -1;
      this._rwBadge.classList.remove("on");
    }
    if (this._rwModalAt > 0 && this._time >= this._rwModalAt) this._openRewardModal();
    if (this._portalCloseAt > 0 && this._time >= this._portalCloseAt) {
      this._portalCloseAt = -1;
      this._portalClosing = true;
    }
    const playing = this._state === "playing" /* Playing */;
    const distanceMode = this.collisionMode.value === "distance" /* Distance */;
    let haveP = false;
    if (playing && !this._playerObj && !this._warnedNoPlayer) {
      this._warnedNoPlayer = true;
      console.warn("[OrbHuntGame] No Player Node set \u2014 orbs can never be collected.");
    }
    if (playing && distanceMode && this._playerObj) {
      this._playerObj.getWorldPosition(this._v1);
      this._v1.y += this.playerHeightOffset.value;
      haveP = true;
    }
    const bob = this.orbBob.value;
    const beaconOn = this._beaconsAllowed();
    const billboard = this.pickupKind.value === "image" /* Image */;
    const spin = this.pickupSpin.value;
    for (const o of this._orbs) {
      if (!o.active || this._noRound) continue;
      const wave = Math.sin((this._time + o.phase * 4) * Math.PI * 2 * 0.35);
      o.group.position.y = o.home.y + wave * bob;
      o.inner.rotation.y += dt * 0.35;
      if (o.custom.visible) {
        if (billboard && this._camera) {
          this._camera.getWorldPosition(this._v2);
          o.custom.getWorldPosition(this._v1);
          o.custom.rotation.set(0, Math.atan2(
            this._v2.x - this._v1.x,
            this._v2.z - this._v1.z
          ), 0);
        } else if (spin !== 0) {
          o.custom.rotation.y += dt * spin * Math.PI * 2;
        }
      }
      o.beacon.position.y = -o.group.position.y + 0.03;
      if (o.alive) {
        o.inner.scale.setScalar(this.orbSize.value * (1 + wave * 0.045));
        if (playing && distanceMode && haveP) {
          o.group.getWorldPosition(this._v2);
          const rr = this.playerRadius.value + this._orbRadius();
          if (this._v2.distanceToSquared(this._v1) < rr * rr) this._collect(o);
        }
      } else if (o.burst > 0) {
        o.burst += dt * 3.2;
        const k = Math.min(1, o.burst);
        if (o.custom.visible) o.custom.scale.setScalar(1 + k * 1.6);
        else o.inner.scale.setScalar(this.orbSize.value * (1 + k * 1.6));
        o.beacon.scale.setScalar(this.beaconSize.value * (1 + k * 0.8));
        if (k >= 1) {
          o.burst = 0;
          o.group.visible = false;
          o.custom.scale.setScalar(1);
          o.beacon.scale.setScalar(this.beaconSize.value);
        }
      }
      o.beacon.visible = beaconOn && o.group.visible;
    }
    if (this._humStopAt > 0 && this._time >= this._humStopAt) {
      this._humStopAt = -1;
      this._portalHum(false);
    }
    if (this._state === "won" /* Won */ && this._portalClosing) {
      this._portalOpen = Math.max(0, this._portalOpen - dt / Math.max(0.05, this.portalOpenTime.value));
      const e = 1 - Math.pow(1 - this._portalOpen, 3);
      this._portal.scale.setScalar(this.portalSize.value * (0.15 + 0.85 * e));
      this._portalU.uOpacity.value = e;
      this._portalU.uSpeed.value = 0.16 + (1 - e) * 1.6;
      if (this._portalOpen <= 0) {
        this._portalClosing = false;
        this._portal.visible = false;
        this._humStopAt = -1;
        this._portalHum(false);
        this.onPortalClosed.emit();
      }
    } else if (this._state === "won" /* Won */ && this._portalOpen < 1) {
      this._portalOpen = Math.min(1, this._portalOpen + dt / Math.max(0.05, this.portalOpenTime.value));
      const e = 1 - Math.pow(1 - this._portalOpen, 3);
      this._portal.scale.setScalar(this.portalSize.value * (0.15 + 0.85 * e));
      this._portalU.uOpacity.value = e;
      this._portalU.uSpeed.value = 0.16 + (1 - e) * 1.6;
      if (this._portalOpen >= 1 && !this._portalDone) {
        this._portalDone = true;
        this.onPortalOpen.emit();
        if (this.portalHideAfter.value > 0) {
          this._portalCloseAt = this._time + this.portalHideAfter.value;
        }
      }
    } else if (this.portalVisibleFromStart.value && this._state !== "won" /* Won */) {
      this._portal.scale.setScalar(this.portalSize.value);
      this._portalU.uOpacity.value = 1;
      this._portalU.uSpeed.value = 0.16;
    }
  }
  _applyPortalVisibility() {
    const show = !this._noRound && (this.portalVisibleFromStart.value || this._state === "won" /* Won */);
    this._portal.visible = show;
    if (this.portalVisibleFromStart.value && this._state !== "won" /* Won */) {
      this._portalU.uOpacity.value = 1;
      this._portal.scale.setScalar(this.portalSize.value);
    }
  }
  /* ══ Screen-space UI ═══════════════════════════════════════════════
       Plain DOM in Mattercraft's overlay div — the same route Zappar's own
       SnapshotUI and VideoRecorderUI take. `useOverlay` is an Observable, so we
       re-append if the overlay is swapped (entering WebXR does exactly that).
       `classNameForAlignment` gives notch-safe anchoring for free.
  
       Layout: score anchored top-left, timer top-centre, menu button in the
       corner you choose, and both modals centred and independently scrollable
       so they survive short landscape viewports.                            */
  _buildUi(mgr) {
    if (!document.getElementById(_OrbHuntGame._STYLE_ID)) {
      const style = document.createElement("style");
      style.id = _OrbHuntGame._STYLE_ID;
      style.textContent = _OrbHuntGame._CSS;
      document.head.appendChild(style);
    }
    this._root.innerHTML = `<button class="ohg-icon" type="button" aria-label="Open game menu"><span class="ohg-orb" aria-hidden="true"></span><span class="ohg-bars" aria-hidden="true"><i></i><i></i><i></i></span></button>`;
    this._iconBtn = this._root.querySelector(".ohg-icon");
    this._iconBtn.addEventListener("click", () => {
      this._menuOpen ? this._dismissMenu() : this._openMenu();
    });
    this._scoreWrap = document.createElement("div");
    this._scoreWrap.innerHTML = `
      <div class="ohg-hud">
        <span class="ohg-lbl ohg-scoreLbl"></span>
        <span class="ohg-valRow"><span class="ohg-hudOrb"></span><span class="ohg-val ohg-score">0 / 0</span></span>
        <div class="ohg-bar"><div class="ohg-fill"></div></div>
      </div>`;
    this._scoreEl = this._scoreWrap.querySelector(".ohg-score");
    this._barEl = this._scoreWrap.querySelector(".ohg-fill");
    this._scoreLblEl = this._scoreWrap.querySelector(".ohg-scoreLbl");
    this._timeWrap = document.createElement("div");
    this._timeWrap.innerHTML = `
      <div class="ohg-hud ohg-centre">
        <span class="ohg-lbl ohg-timeLbl"></span>
        <span class="ohg-val ohg-big ohg-time">0.0</span>
      </div>`;
    this._timeEl = this._timeWrap.querySelector(".ohg-time");
    this._timeLblEl = this._timeWrap.querySelector(".ohg-timeLbl");
    this._syncHudLabels();
    this._menuWrap = document.createElement("div");
    this._menuWrap.className = "ohg-layer";
    this._menuWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-modal ohg-menu" role="dialog" aria-modal="true">
        <div class="ohg-menuGlow" aria-hidden="true"></div>
        <div class="ohg-menuHead">
          <span class="ohg-menuOrb" aria-hidden="true"></span>
          <div class="ohg-title"></div>
        </div>
        <button class="ohg-menuX" data-a="close" type="button" aria-label="Close menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </button>
        <div class="ohg-status"><span class="ohg-dot" aria-hidden="true"></span><span class="ohg-statusTxt"></span></div>
        <div class="ohg-msg"></div>
        <button class="ohg-btn"             data-a="restart"  type="button">Restart</button>
        <button class="ohg-btn ohg-ghost"   data-a="howto"    type="button">How to play</button>
        <button class="ohg-btn ohg-ghost ohg-howclaim" data-a="howclaim" type="button"></button>
        <button class="ohg-btn ohg-lounge"  data-a="lounge"   type="button"></button>
        <button class="ohg-btn ohg-primary ohg-start" data-a="start" type="button"></button>
        <button class="ohg-btn ohg-hideout" data-a="hideout" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/></svg><span class="ohg-hideLbl"></span></button>
        <div class="ohg-div"></div>
        <div class="ohg-toggle" data-t="music"><span>Music</span><div class="ohg-sw"></div></div>
        <div class="ohg-toggle" data-t="sound"><span>Sound effects</span><div class="ohg-sw"></div></div>
        <div class="ohg-div"></div>
        <button class="ohg-btn ohg-claim"   data-a="claim"   type="button">
          <span class="ohg-claimGlow" aria-hidden="true"></span>
          <span class="ohg-claimLbl">Claim Digital Exclusive</span>
        </button>
      </div>`;
    this._menu = this._menuWrap.querySelector(".ohg-menu");
    this._titleEl = this._menuWrap.querySelector(".ohg-title");
    this._statusEl = this._menuWrap.querySelector(".ohg-status");
    this._msgEl = this._menuWrap.querySelector(".ohg-msg");
    this._menuWrap.querySelector(".ohg-scrim").addEventListener("click", () => this._dismissMenu());
    this._introWrap = document.createElement("div");
    this._introWrap.className = "ohg-layer";
    this._introWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-modal ohg-intro" role="dialog" aria-modal="true">
        <div class="ohg-hero"><img alt="" /></div>
        <div class="ohg-introBody">
          <h1 class="ohg-h1"></h1>
          <p class="ohg-lead"></p>
          <div class="ohg-legend"></div>
          <button class="ohg-btn ohg-primary" data-a="introPlay"  type="button">Start playing</button>
          <button class="ohg-btn ohg-ghost"   data-a="introClose" type="button">Maybe later</button>
          <button class="ohg-btn ohg-hideout" data-a="introHideout" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M10 20v-5.5h4V20"/></svg><span class="ohg-hideLbl"></span></button>
        </div>
      </div>`;
    this._introEl = this._introWrap.querySelector(".ohg-intro");
    this._introImg = this._introWrap.querySelector(".ohg-hero img");
    this._introH1 = this._introWrap.querySelector(".ohg-h1");
    this._introLead = this._introWrap.querySelector(".ohg-lead");
    this._introWrap.querySelector(".ohg-scrim").addEventListener("click", () => this._closeIntro());
    this._rewardWrap = document.createElement("div");
    this._rewardWrap.className = "ohg-rwLayer";
    this._rewardWrap.innerHTML = `
      <div class="ohg-rwWord" aria-hidden="true">
        <div class="ohg-rwRays"></div>
        <div class="ohg-rwEmblem"></div>
        <div class="ohg-rwKicker"></div>
        <div class="ohg-rwPlate">
          <div class="ohg-rwTitle"></div>
          <div class="ohg-rwSweep"></div>
        </div>
        <div class="ohg-rwMsg"></div>
        <div class="ohg-rwArcs"><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div class="ohg-rwBadge" role="status" aria-live="polite">
        <span class="ohg-rwBadgeIc"></span>
        <span class="ohg-rwBadgeTxt">
          <strong class="ohg-rwBadgeTitle"></strong>
          <span class="ohg-rwBadgeSub"></span>
        </span>
      </div>`;
    this._rwWord = this._rewardWrap.querySelector(".ohg-rwWord");
    this._cdWrap = document.createElement("div");
    this._cdWrap.className = "ohg-cdLayer";
    this._cdWrap.setAttribute("role", "status");
    this._cdWrap.setAttribute("aria-live", "assertive");
    this._cdWrap.innerHTML = `
      <div class="ohg-cd">
        <div class="ohg-cdTitle"></div>
        <div class="ohg-cdNum"></div>
        <div class="ohg-cdSub"></div>
      </div>`;
    this._rwBadge = this._rewardWrap.querySelector(".ohg-rwBadge");
    this._rwModalWrap = document.createElement("div");
    this._rwModalWrap.className = "ohg-layer";
    this._insWrap = document.createElement("div");
    this._insWrap.className = "ohg-layer ohg-insLayer";
    this._insWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-modal ohg-ins" role="dialog" aria-modal="true">
        <div class="ohg-menuGlow" aria-hidden="true"></div>
        <h2 class="ohg-insTitle"></h2>
        <ol class="ohg-steps"></ol>
        <button class="ohg-btn ohg-primary ohg-insClose" type="button"></button>
      </div>`;
    this._insWrap.querySelector(".ohg-scrim").addEventListener("click", () => this._closeInstructions());
    this._insWrap.querySelector(".ohg-insClose").addEventListener("click", () => this._closeInstructions());
    this._lightWrap = document.createElement("div");
    this._lightWrap.className = "ohg-layer ohg-lightLayer";
    this._lightWrap.innerHTML = `
      <div class="ohg-scrim ohg-lightScrim"></div>
      <div class="ohg-lightBox" role="dialog" aria-modal="true" aria-label="Image viewer">
        <div class="ohg-lightFrame">
          <img class="ohg-lightImg" alt="" />
        </div>
        <div class="ohg-lightBar">
          <button class="ohg-lightZoom" type="button" aria-pressed="false" aria-label="Zoom in">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
              <path class="ohg-lightPlus" d="M11 8v6M8 11h6"/>
              <path class="ohg-lightMinus" d="M8 11h6"/>
            </svg>
          </button>
          <button class="ohg-lightX" type="button" aria-label="Close image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
          </button>
        </div>
      </div>`;
    this._lightImg = this._lightWrap.querySelector(".ohg-lightImg");
    this._lightWrap.addEventListener("click", (e) => {
      const t = e.target;
      const background = t.classList.contains("ohg-lightScrim") || t.classList.contains("ohg-lightBox") || t.classList.contains("ohg-lightFrame");
      if (!background) return;
      if (this._lightWrap.classList.contains("ohg-zoomed")) return;
      this._closeImage();
    });
    this._lightWrap.querySelector(".ohg-lightX").addEventListener("click", () => this._closeImage());
    this._lightWrap.querySelector(".ohg-lightZoom").addEventListener("click", () => this._setImageZoom(!this._lightWrap.classList.contains("ohg-zoomed")));
    this._lightImg.addEventListener("click", () => this._setImageZoom(!this._lightWrap.classList.contains("ohg-zoomed")));
    this._toWrap = document.createElement("div");
    this._toWrap.className = "ohg-layer ohg-toLayer ohg-rwmSpinning ohg-rwmFrosted";
    this._toWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-rwmShell" role="alertdialog" aria-modal="true">
        <div class="ohg-rwmSpin" aria-hidden="true"></div>
        <div class="ohg-rwmGlass">
          <div class="ohg-rwmSheen" aria-hidden="true"></div>
          <div class="ohg-rwmBevel" aria-hidden="true"></div>
          <div class="ohg-toArt" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/>
              <path d="M9 2h6"/><path d="m19.5 5.5-1.6 1.6"/>
            </svg>
          </div>
          <h2 class="ohg-rwmTitle ohg-toTitle"></h2>
          <p class="ohg-rwmBody ohg-toBody"></p>
          <button class="ohg-btn ohg-primary ohg-toRetry" type="button"></button>
          <button class="ohg-btn ohg-ghost ohg-toLounge" type="button"></button>
        </div>
      </div>`;
    this._toWrap.querySelector(".ohg-toRetry").addEventListener("click", () => {
      this._closeTimeout();
      this.startGame();
    });
    this._toWrap.querySelector(".ohg-toLounge").addEventListener("click", () => {
      this._closeTimeout();
      this._enterLounge();
    });
    this._rwModalWrap.innerHTML = `
      <div class="ohg-scrim"></div>
      <div class="ohg-rwmShell" role="dialog" aria-modal="true">
        <div class="ohg-rwmSpin" aria-hidden="true"></div>
        <div class="ohg-rwmGlass">
          <div class="ohg-rwmSheen" aria-hidden="true"></div>
          <div class="ohg-rwmBevel" aria-hidden="true"></div>
          <div class="ohg-rwmArt"></div>
          <div class="ohg-rwmKicker"></div>
          <h2 class="ohg-rwmTitle"></h2>
          <p class="ohg-rwmBody"></p>
          <ol class="ohg-steps ohg-rwmSteps"></ol>
          <button class="ohg-btn ohg-rwmReplay" type="button"></button>
          <button class="ohg-btn ohg-rwmLounge" type="button"></button>
          <button class="ohg-btn ohg-claim ohg-rwmClaim" type="button">
            <span class="ohg-claimGlow" aria-hidden="true"></span>
            <span class="ohg-claimLbl"></span>
          </button>
          <button class="ohg-btn ohg-ghost ohg-rwmClose" type="button"></button>
        </div>
      </div>`;
    this._rwModalWrap.querySelector(".ohg-scrim").addEventListener("click", () => this._closeRewardModal(true));
    this._rwModalWrap.querySelector(".ohg-rwmClose").addEventListener("click", () => this._closeRewardModal(true));
    this._rwModalWrap.querySelector(".ohg-rwmReplay").addEventListener("click", () => this._replay());
    this._rwModalWrap.querySelector(".ohg-rwmLounge").addEventListener("click", () => {
      this._closeRewardModal(false);
      this._enterLounge();
    });
    this._rwModalWrap.querySelector(".ohg-rwmClaim").addEventListener("click", () => this._rewardModalClaim());
    [this._menuWrap, this._introWrap].forEach(
      (w) => w.querySelectorAll("[data-a]").forEach(
        (b) => b.addEventListener("click", () => this._uiAction(b.dataset.a ?? ""))
      )
    );
    this._menuWrap.querySelectorAll(".ohg-toggle").forEach((row) => {
      row.addEventListener("click", () => {
        const on = !row.querySelector(".ohg-sw").classList.contains("on");
        if (row.dataset.t === "music") this.musicEnabled.value = on;
        else this.soundEnabled.value = on;
        this._syncToggles();
      });
    });
    this._placeWrap = document.createElement("div");
    this._placeWrap.innerHTML = `
      <div class="ohg-placeBar">
        <div class="ohg-hint">
          <span class="ohg-hintMain"></span>
          <span class="ohg-hintTip"></span>
        </div>
        <button class="ohg-place" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>
          </svg><span class="ohg-placeLbl">Place</span>
        </button>
      </div>`;
    this._placeWrap.querySelector(".ohg-place").addEventListener("click", () => this._place());
    this._resetWrap = document.createElement("div");
    this._resetWrap.innerHTML = `
      <div class="ohg-resetBox">
        <button class="ohg-round" type="button" aria-label="Reset placement">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.5 3.5V9h-5.5"/>
          </svg>
        </button>
        <span class="ohg-roundLbl"></span>
      </div>`;
    this._resetWrap.querySelector(".ohg-round").addEventListener("click", () => this._resetPlacement());
    this._loungeWrap = document.createElement("div");
    this._loungeWrap.innerHTML = `
      <div class="ohg-loungeBar">
        <button class="ohg-loungeExit" type="button"></button>
        <div class="ohg-loungeRow"></div>
      </div>`;
    this._loungeWrap.querySelector(".ohg-loungeExit").addEventListener("click", () => {
      this._exitLounge();
      this.startGame();
    });
    this._logoWrap = document.createElement("div");
    this._logoWrap.innerHTML = `<a class="ohg-logoLink" rel="noopener noreferrer" target="_blank"><img class="ohg-logoImg" alt="" /></a>`;
    this._logoImg = this._logoWrap.querySelector(".ohg-logoImg");
    this._logoImg.addEventListener("load", () => this._applyLogoClearance());
    this._logoImg.addEventListener("error", () => {
      if (!this.logoImage.value) return;
      console.warn(`[OrbHuntGame] Logo image failed to load: ${this.logoImage.value}`);
      this._logoWrap.style.display = "none";
      this._applyLogoClearance();
    });
    this._soundWrap = document.createElement("div");
    this._soundWrap.innerHTML = `
      <button class="ohg-mute" type="button" aria-label="Toggle sound">
        <svg class="ohg-on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/>
        </svg>
        <svg class="ohg-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m17 9 5 6"/><path d="m22 9-5 6"/>
        </svg>
      </button>`;
    this._soundWrap.querySelector(".ohg-mute").addEventListener("click", () => {
      const on = !(this.soundEnabled.value || this.musicEnabled.value);
      this.soundEnabled.value = on;
      this.musicEnabled.value = on;
      this._syncToggles();
    });
    const attach = (overlay) => {
      overlay.appendChild(this._logoWrap);
      overlay.appendChild(this._scoreWrap);
      overlay.appendChild(this._timeWrap);
      overlay.appendChild(this._root);
      overlay.appendChild(this._placeWrap);
      overlay.appendChild(this._resetWrap);
      overlay.appendChild(this._soundWrap);
      overlay.appendChild(this._loungeWrap);
      overlay.appendChild(this._rewardWrap);
      if (this._cdWrap) overlay.appendChild(this._cdWrap);
      overlay.appendChild(this._rwModalWrap);
      overlay.appendChild(this._toWrap);
      overlay.appendChild(this._insWrap);
      overlay.appendChild(this._menuWrap);
      overlay.appendChild(this._introWrap);
      overlay.appendChild(this._lightWrap);
    };
    window.addEventListener("resize", this._onResize);
    window.addEventListener("keydown", this._onKeyDown);
    const overlayObs = useOverlay(mgr);
    attach(overlayObs.value);
    this.register(overlayObs, (o) => {
      [
        this._logoWrap,
        this._scoreWrap,
        this._timeWrap,
        this._root,
        this._placeWrap,
        this._resetWrap,
        this._soundWrap,
        this._loungeWrap,
        this._rewardWrap,
        this._rwModalWrap,
        this._toWrap,
        this._insWrap,
        this._menuWrap,
        this._introWrap,
        this._lightWrap
      ].forEach((e) => e.remove());
      attach(o);
    });
  }
  _uiAction(a) {
    switch (a) {
      case "restart":
        this.startGame();
        this._closeMenu();
        break;
      // Claiming closes the menu: on mobile the new tab takes focus anyway, and
      // returning to a still-open menu over the AR view reads as stuck.
      case "claim":
        this._claim();
        this._closeMenu();
        break;
      // One button, both directions. In a round it offers the lounge; in the
      // lounge it offers the round — a control that only works one way leaves
      // the player hunting for the way back.
      // Two rows now, one destination each, rather than one row that changed
      // meaning depending on where you were. A control whose label flips is a
      // control people have to read before every press.
      case "lounge":
        this._enterLounge();
        this._closeMenu();
        break;
      case "start":
        this.startGame();
        this._closeMenu();
        break;
      case "hideout":
        this._closeMenu();
        this._enterHideout();
        break;
      case "introHideout":
        this._closeIntro();
        this._enterHideout();
        break;
      case "howclaim":
        this._closeMenu();
        this._openInstructions();
        break;
      case "howto":
        this._closeMenu();
        this._openIntro();
        break;
      case "close":
        this._dismissMenu();
        break;
      case "introPlay":
        this._closeIntro();
        if (this.placementEnabled.value && !this._placed) this._afterIntroDismissed();
        else this.startGame();
        break;
      case "introClose":
        this._closeIntro();
        if (this.loungeEnabled.value) this._enterLounge();
        this._afterIntroDismissed();
        break;
    }
    this._syncMenu();
  }
  _openMenu() {
    if (this._shell) {
      if (this._state === "playing" /* Playing */) this.pauseGame();
      this._shell.openHome();
      return;
    }
    this._menuOpen = true;
    this._menuWrap.classList.add("on");
    this._iconBtn.classList.add("on");
    if (this._state === "playing" /* Playing */) this.pauseGame();
    this._syncMenu();
  }
  _closeMenu() {
    this._menuOpen = false;
    this._menuWrap.classList.remove("on");
    this._iconBtn.classList.remove("on");
  }
  /**
   * Close the menu and carry on playing.
   *
   * Opening the menu pauses the round, and the Resume button used to be the
   * way back. With that row gone, dismissing IS resuming — otherwise a player
   * who opened the menu to read something would be stuck on a frozen clock
   * with no control that unfreezes it.
   *
   * Separate from _closeMenu because closing to open another panel must NOT
   * resume: How To Play and How To Claim both close the menu on their way to
   * a modal, and a clock ticking behind an open dialog is the bug this
   * distinction exists to prevent.
   */
  _dismissMenu() {
    this._closeMenu();
    this._resumeIfPaused();
  }
  /** Hand the round back after a panel that paused it goes away. */
  _resumeIfPaused() {
    this._cdHeld = false;
    if (this._state === "paused" /* Paused */) this.resumeGame();
  }
  /** HUD captions. Separate from the values, which change every frame. */
  _syncHudLabels() {
    if (this._scoreLblEl) this._scoreLblEl.textContent = this.scoreLabel.value;
    if (this._timeLblEl) this._timeLblEl.textContent = this.timeLabel.value;
  }
  /**
   * Placement gates the round: the intro hands off to Place, and only a
   * confirmed placement starts the clock. Without that the timer would run
   * while the player is still hunting for a flat surface.
   */
  _afterIntroDismissed() {
    if (this.placementEnabled.value && !this._placed) {
      this._setState("placing" /* Placing */);
      return;
    }
    this._resumeIfPaused();
  }
  _place() {
    if (this._placed) return;
    if (this._anchorComp?.placementValid?.value === false) return;
    this._placed = true;
    this._driveAnchor();
    this._playClip(this.placeTimeline.value);
    this.onPlace.emit();
    this._applyPlacementUi();
    if ((this.startRoundOnPlace.value || this._roundAfterPlace) && !this._noRound) this._beginRound();
    else this._setState("idle" /* Idle */);
  }
  _bindPlacementAnchor() {
    this._anchorOff?.();
    this._anchorOff = null;
    const id = this.placementAnchor.value;
    let comp = null;
    try {
      comp = id ? this._zc.resolveNodeID(id) : null;
    } catch {
      comp = null;
    }
    this._anchorComp = comp?.placementMode?.value !== void 0 ? comp : null;
    if (id && !this._anchorComp)
      console.warn("[OrbHuntGame] Placement Anchor has no placement mode; pick an Instant World Tracker or a User Placement Anchor Group");
    const valid = this._anchorComp?.placementValid;
    if (valid?.addListener) {
      const fn = () => this._syncPlaceReady();
      valid.addListener(fn);
      this._anchorOff = () => valid.removeListener?.(fn);
    }
    this._driveAnchor();
    this._syncPlaceReady();
  }
  /** Placing: the anchor follows the floor in front of the camera. Placed: it holds still. */
  _driveAnchor() {
    const pm = this._anchorComp?.placementMode;
    if (!pm || !this.placementEnabled.value) return;
    const want = !this._placed;
    if (pm.value !== want) pm.value = want;
  }
  _syncPlaceReady() {
    const btn = this._placeWrap?.querySelector(".ohg-place");
    if (!btn) return;
    const valid = this._anchorComp?.placementValid;
    const ok = !valid || valid.value !== false;
    btn.disabled = !ok;
    btn.classList.toggle("ohg-placeWait", !ok);
  }
  _resetPlacement() {
    this._cancelCountdown();
    this._playClip(this.resetTimeline.value);
    this.onResetPlacement.emit();
    this._placed = false;
    this._driveAnchor();
    this._reset();
    this._setState("placing" /* Placing */);
    this._applyPlacementUi();
  }
  _openIntro() {
    if (this._state === "playing" /* Playing */) this.pauseGame();
    this._introWrap.classList.add("on");
    this._syncIntro();
    this._applyPlacementUi();
  }
  _closeIntro() {
    const was = this._introWrap.classList.contains("on");
    this._introWrap.classList.remove("on");
    this._applyPlacementUi();
    if (was) this.onIntroClose.emit();
  }
  static _cornerClass(c) {
    const left = c === "topLeft" /* TopLeft */ || c === "bottomLeft" /* BottomLeft */;
    const top = c === "topLeft" /* TopLeft */ || c === "topRight" /* TopRight */;
    return classNameForAlignment(
      left ? "leftSafe" /* leftSafe */ : "rightSafe" /* rightSafe */,
      top ? "topSafe" /* topSafe */ : "bottomSafe" /* bottomSafe */
    );
  }
  /**
   * Push the current mode's palette onto every overlay layer.
   *
   * Every layer, not just the root: the accent variable is declared on
   * `.ohg-root, .ohg-anchor` AND `.ohg-layer`, and a custom property declared
   * on an element beats one inherited from a parent — so setting it in one
   * place reached one place. That's why the UI Accent property only ever
   * recoloured the menu button, which nobody noticed because its default
   * matched the stylesheet.
   */
  _applyMode() {
    const v = this._hideout ? this.hideoutAccent.value : this._lounge ? this.loungeAccent.value : this.uiAccent.value;
    const rgb = [
      Math.round(Math.max(0, Math.min(1, v[0])) * 255),
      Math.round(Math.max(0, Math.min(1, v[1])) * 255),
      Math.round(Math.max(0, Math.min(1, v[2])) * 255)
    ];
    const channels = rgb.join(",");
    const deep = shadeForWhiteText(rgb);
    const deeper = shadeForWhiteText(rgb, 6.5);
    const scale = (c, k) => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];
    const lighten = (c, k) => [
      Math.round(c[0] + (255 - c[0]) * k),
      Math.round(c[1] + (255 - c[1]) * k),
      Math.round(c[2] + (255 - c[2]) * k)
    ];
    const other = this._lounge ? this.uiAccent.value : this.loungeAccent.value;
    const to255 = (c) => c.map((x) => Math.round(Math.max(0, Math.min(1, x)) * 255)).join(",");
    const alt = to255(other).split(",").map(Number);
    for (const el of this._modeLayers()) {
      if (!el) continue;
      const st = el.style;
      st.setProperty("--ohg-accent", `rgb(${channels})`);
      st.setProperty("--ohg-accentRgb", channels);
      st.setProperty("--ohg-claimA", `rgb(${deep.join(",")})`);
      st.setProperty("--ohg-claimB", `rgb(${deeper.join(",")})`);
      st.setProperty("--ohg-altRgb", alt.join(","));
      st.setProperty("--ohg-uiRgb", to255(this.uiAccent.value));
      st.setProperty("--ohg-loungeRgb", to255(this.loungeAccent.value));
      st.setProperty("--ohg-hideRgb", to255(this.hideoutAccent.value));
      st.setProperty("--ohg-tintLight", `rgb(${lighten(rgb, 0.45).join(",")})`);
      st.setProperty("--ohg-tintDeep", `rgb(${scale(rgb, 0.74).join(",")})`);
      st.setProperty("--ohg-onTint", bestTextOn(rgb));
      el.classList.toggle("ohg-loungeMode", this._lounge);
      el.classList.toggle("ohg-hideoutMode", this._hideout);
    }
  }
  /** Every overlay child that declares its own accent, so all of them move. */
  _modeLayers() {
    return [
      this._root,
      this._scoreWrap,
      this._timeWrap,
      this._placeWrap,
      this._resetWrap,
      this._soundWrap,
      this._loungeWrap,
      this._logoWrap,
      this._rewardWrap,
      this._rwModalWrap,
      this._toWrap,
      this._insWrap,
      this._menuWrap,
      this._introWrap,
      this._lightWrap,
      this._cdWrap
    ];
  }
  /**
   * Stack the overlay explicitly, because Mattercraft doesn't.
   *
   * `#zcomponent-overlay > *` gets `position:absolute` and nothing else, so
   * every child paints with `z-index:auto` and the winner is decided by DOM
   * order — i.e. by whatever the scene tree happens to add last. A joystick
   * added after this component therefore draws over an open dialog and eats
   * the taps aimed at its buttons. There is no ordering to negotiate with
   * once a real z-index is in play: any positive value beats `auto`.
   *
   * The bands are deliberately far apart so a future layer can be slotted in
   * without renumbering, and the dialog band is the author-facing one.
   */
  _applyLayerOrder() {
    const modal = Math.max(1, Math.round(this.modalLayer.value));
    const put = (el, z) => {
      if (el) el.style.zIndex = String(z);
    };
    put(this._logoWrap, 10);
    put(this._scoreWrap, 20);
    put(this._timeWrap, 20);
    put(this._root, 30);
    put(this._placeWrap, 30);
    put(this._resetWrap, 30);
    put(this._soundWrap, 30);
    put(this._loungeWrap, 40);
    put(this._rewardWrap, 50);
    put(this._cdWrap, 50);
    for (const el of [
      this._rwModalWrap,
      this._toWrap,
      this._insWrap,
      this._menuWrap,
      this._introWrap
    ]) put(el, modal);
    put(this._lightWrap, modal + 1);
  }
  _applyCorner() {
    this._root.className = "ohg-root " + _OrbHuntGame._cornerClass(this.menuCorner.value);
    if (this._resetWrap)
      this._resetWrap.className = "ohg-anchor " + _OrbHuntGame._cornerClass(this.resetCorner.value);
    if (this._soundWrap)
      this._soundWrap.className = "ohg-anchor " + _OrbHuntGame._cornerClass(this.soundToggleCorner.value);
    if (this._placeWrap)
      this._placeWrap.className = "ohg-anchor ohg-placeAnchor " + classNameForAlignment("center" /* center */, "bottomSafe" /* bottomSafe */);
    if (this._loungeWrap) {
      const h = this.loungeAlign.value === "left" /* Left */ ? "leftSafe" /* leftSafe */ : this.loungeAlign.value === "right" /* Right */ ? "rightSafe" /* rightSafe */ : "center" /* center */;
      this._loungeWrap.className = "ohg-anchor ohg-loungeAnchor " + classNameForAlignment(h, "bottomSafe" /* bottomSafe */);
      this._applyLoungeOffset();
    }
  }
  /**
   * Place and size the logo.
   *
   * Responsive the way a watermark has to be: the width is
   * `min(<size>vmin, <max>px)`. vmin is the SHORTER viewport side, so the
   * logo keeps its size when a phone rotates — a percentage of width would
   * balloon in landscape. The px cap stops it becoming a billboard on a
   * desktop monitor. Height follows from the aspect ratio, so any artwork
   * shape works without a second property.
   *
   * The whole wrap is `pointer-events: none`. Core CSS forces
   * `pointer-events: auto` on every direct child of the overlay with an ID
   * selector no class can outrank, so a full-width logo anchor would
   * silently eat taps on the AR view behind it.
   */
  _applyLogo() {
    if (!this._logoWrap) return;
    const src = this.logoImage.value.trim();
    this._logoWrap.className = "ohg-anchor ohg-logo " + _OrbHuntGame._cornerClass(this.logoCorner.value);
    this._logoWrap.style.display = src ? "" : "none";
    this._logoWrap.style.margin = `${this.logoOffsetY.value}px ${this.logoOffsetX.value}px`;
    this._logoImg.style.width = `min(${this.logoSize.value}vmin, ${this.logoMaxWidth.value}px)`;
    this._logoImg.style.opacity = String(Math.max(0, Math.min(1, this.logoOpacity.value)));
    const link = this._logoWrap.querySelector(".ohg-logoLink");
    const url = this.logoUrl.value.trim();
    if (link) {
      if (url) {
        link.href = url;
        link.setAttribute("aria-label", this.logoLinkLabel.value.trim() || "Open link");
      } else {
        link.removeAttribute("href");
        link.removeAttribute("aria-label");
      }
      this._logoWrap.classList.toggle("ohg-logoTap", !!url);
    }
    if (this._logoImg.getAttribute("src") !== src) {
      if (src) this._logoImg.setAttribute("src", src);
      else this._logoImg.removeAttribute("src");
    }
    this._applyLogoClearance();
    this._applyUiVisibility();
  }
  /**
   * Move the score block clear of the logo when they share a corner.
   *
   * Measured rather than assumed. The logo's height depends on the artwork's
   * aspect ratio and on a viewport-relative width, so no constant is right
   * for two different logos — and a HUD sitting on top of someone's brand is
   * the kind of thing that gets noticed in a demo.
   */
  _applyLogoClearance() {
    if (!this._scoreWrap || !this._logoWrap) return;
    const c = this.logoCorner.value;
    const logoTop = c === "topLeft" /* TopLeft */ || c === "topRight" /* TopRight */;
    const hudTop = this.hudPosition.value !== "bottom" /* Bottom */;
    const shown = this.logoImage.value.trim() !== "" && this._logoWrap.style.display !== "none" && this._logoWrap.offsetParent !== null;
    for (const el of [this._timeWrap, this._scoreWrap]) {
      el.style.setProperty("--ohg-logoDrop", "0px");
    }
    const lBox = this._logoWrap.getBoundingClientRect();
    const sBox = this._scoreWrap.getBoundingClientRect();
    const tBox = this._timeWrap.getBoundingClientRect();
    const hits = (b) => b.width > 0 && lBox.right > b.left - 8 && lBox.left < b.right + 8 && lBox.bottom > b.top - 8 && lBox.top < b.bottom + 8;
    const reaches = shown && (hits(sBox) || hits(tBox));
    let drop = 0;
    if (shown && logoTop === hudTop && reaches && lBox.height > 0) {
      const pad = this.logoOffsetY.value;
      const need = hudTop ? lBox.bottom + pad - Math.min(tBox.top, sBox.top) : Math.max(tBox.bottom, sBox.bottom) + pad - lBox.top;
      drop = Math.max(0, Math.round(need));
    }
    for (const el of [this._timeWrap, this._scoreWrap]) {
      el.style.setProperty("--ohg-logoDrop", `${drop}px`);
    }
  }
  _applyHudPosition() {
    if (!this._scoreWrap) return;
    const bottom = this.hudPosition.value === "bottom" /* Bottom */;
    const v = bottom ? "bottomSafe" /* bottomSafe */ : "topSafe" /* topSafe */;
    const a = this.hudAlign.value;
    const hz = a === "left" /* Left */ ? "leftSafe" /* leftSafe */ : a === "right" /* Right */ ? "rightSafe" /* rightSafe */ : "center" /* center */;
    const side = a === "left" /* Left */ ? "ohg-hudLeft " : a === "right" /* Right */ ? "ohg-hudRight " : "";
    this._scoreWrap.className = "ohg-anchor ohg-timeAnchor ohg-hudStack " + side + (bottom ? "ohg-fromBottom " : "") + classNameForAlignment(hz, v);
    this._timeWrap.className = "ohg-anchor ohg-timeAnchor " + side + (bottom ? "ohg-fromBottom " : "") + classNameForAlignment(hz, v);
    this._applyTimerOffset();
    this._applyHudStack();
    this._applyLogoClearance();
    this._applyUiVisibility();
  }
  /**
   * Sit the score block directly under the clock.
   *
   * The two are separate overlay anchors — they have to be, because each needs
   * its own alignment class from Mattercraft's helper — so stacking them means
   * offsetting the score by the clock's height plus the gap.
   *
   * One measurement, of the CLOCK CARD, and the answer is exact.
   *
   * This used to estimate from the clock WRAP's height (which includes the
   * anchor's 14px padding, so it overshot by 28px), write that, measure the
   * real card-to-card distance and correct by the difference. Two passes, and
   * the second one wrote whatever it read. When it read a collapsed box — a
   * frame where the score card had no layout, which is what entering an XR
   * session, a canvas resize or a mid-transition overlay all produce — the
   * "correction" landed at 225px against a true value of 75px. That is the
   * exaggerated gap: it stuck until the next call happened to run on a settled
   * layout, and then snapped back, which reads as random.
   *
   * Both anchors carry the same top, the same padding and the same offset
   * variables, so the score card's top is the clock card's top plus this
   * offset. The gap between them is therefore `stack - clockCardHeight`, and
   * `stack = clockCardHeight + gap` is the whole calculation. Nothing is
   * written before it's known, so a bad frame can no longer poison the value —
   * it just leaves the last good one in place until the observer below
   * re-measures.
   *
   * When the timer is off or hidden there is nothing to clear, and the score
   * takes the clock's place at the top of the column rather than leaving a gap
   * where a clock isn't.
   */
  _applyHudStack() {
    if (!this._scoreWrap || !this._timeWrap) return;
    const timerShown = this._timeWrap.style.display !== "none" && this._timeWrap.offsetParent !== null;
    if (!timerShown) {
      this._scoreWrap.style.setProperty("--ohg-hudStack", "0px");
      return;
    }
    const gap = Math.max(0, Math.min(120, this.hudGap.value));
    const clock = this._timeWrap.querySelector(".ohg-hud");
    if (!clock) return;
    const h = clock.getBoundingClientRect().height;
    if (h <= 0) return;
    this._scoreWrap.style.setProperty("--ohg-hudStack", `${Math.round(h + gap)}px`);
  }
  /**
   * Re-measure whenever either card's box actually changes.
   *
   * The stack was previously computed on prop changes, on window resize and
   * on entering or leaving the lounge — and then trusted forever. Everything
   * else that changes the clock's box went unnoticed: crossing the 520px
   * breakpoint (the clock drops from 38px to 30px), the safe-area inset
   * changing, an XR session starting, a label being edited, the font settling.
   * Each of those left the gap describing a layout that no longer existed,
   * which is the other half of "it stops respecting the props once the game
   * starts".
   *
   * A ResizeObserver on the two cards closes that off completely: the browser
   * tells us when the boxes change and we re-measure, so the value cannot go
   * stale no matter what caused the change. It fires once on observe, which
   * also gives a free correct measurement after first layout.
   */
  _observeHud() {
    if (this._hudRO || typeof ResizeObserver === "undefined") return;
    const clock = this._timeWrap?.querySelector(".ohg-hud");
    const count = this._scoreWrap?.querySelector(".ohg-hud");
    if (!clock || !count) return;
    this._hudRO = new ResizeObserver(() => {
      if (this._hudRaf) cancelAnimationFrame(this._hudRaf);
      this._hudRaf = requestAnimationFrame(() => {
        this._hudRaf = 0;
        this._applyHudStack();
        this._applyLogoClearance();
      });
    });
    this._hudRO.observe(clock);
    this._hudRO.observe(count);
  }
  _applyLoungeOffset() {
    if (!this._loungeWrap) return;
    let n = Math.max(0, Math.min(70, this.loungeOffset.value));
    const box = this._loungeWrap.getBoundingClientRect();
    const overlayH = this._loungeWrap.parentElement?.clientHeight || 0;
    if (overlayH > 0 && box.height > 0) {
      const maxPct = (overlayH - box.height - 8) / overlayH * 100;
      n = Math.max(0, Math.min(n, maxPct));
    }
    this._loungeWrap.style.setProperty("--ohg-loungeLift", `${n.toFixed(2)}%`);
  }
  /** Re-measure the stack whenever the clock's box could have changed. */
  _restackHud() {
    this._applyHudStack();
    this._applyLogoClearance();
  }
  _applyTimerOffset() {
    if (!this._timeWrap) return;
    const n = Math.max(0, Math.min(40, this.timerOffset.value));
    this._timeWrap.style.setProperty("--ohg-timerDrop", `${n}%`);
    this._scoreWrap.style.setProperty("--ohg-timerDrop", `${n}%`);
  }
  _applyUiVisibility() {
    if (!this._scoreWrap) return;
    const on = this.uiEnabled.value;
    const hud = on && this.hudPosition.value !== "hidden" /* Hidden */;
    this._root.style.display = on && !this._shell ? "" : "none";
    this._scoreWrap.style.display = hud && !this._noRound ? "" : "none";
    this._timeWrap.style.display = hud && !this._noRound && this.timerEnabled.value ? "" : "none";
    this._applyHudStack();
    this._soundWrap.style.display = on && this.soundToggleEnabled.value && !this._shell ? "" : "none";
    const playing = this._state === "playing" /* Playing */ && !this._lounge;
    const logoOn = on && !!this.logoImage.value.trim() && !this._hideout && (this.logoInGame.value || !playing);
    if (this._logoWrap) this._logoWrap.style.display = logoOn ? "" : "none";
    if (!on) {
      this._closeMenu();
      this._closeIntro();
      this._closeRewardModal(false);
      this._closeTimeout();
      this._closeInstructions();
    }
    this._applyPlacementUi();
  }
  /**
   * Place and Reset are mutually exclusive: Place while the scene is unplaced,
   * Reset once it is. Two near-identical buttons on screen at once reads as a
   * mistake rather than as flexibility.
   */
  _applyPlacementUi() {
    if (!this._placeWrap) return;
    const on = this.uiEnabled.value && this.placementEnabled.value;
    const placing = on && !this._placed && !this._introWrap.classList.contains("on");
    this._placeWrap.style.display = placing ? "" : "none";
    this._resetWrap.style.display = on && this._placed && !this._shell ? "" : "none";
    const loungeReady = this.uiEnabled.value && this._lounge && !this._shell && !this._introWrap.classList.contains("on") && (!this.placementEnabled.value || this._placed);
    this._loungeWrap.style.display = loungeReady ? "" : "none";
    this._syncPlacement();
    this._syncLounge();
    this._liftReward(loungeReady);
  }
  _syncPlacement() {
    if (!this._placeWrap) return;
    const lbl = this._placeWrap.querySelector(".ohg-placeLbl");
    if (lbl) lbl.textContent = this.placeButtonLabel.value;
    const hint = this._placeWrap.querySelector(".ohg-hint");
    if (hint) {
      const main = hint.querySelector(".ohg-hintMain");
      const tip = hint.querySelector(".ohg-hintTip");
      const mainTxt = this.placeHintText.value;
      const tipTxt = this._shell && this.placeHintTip.value.trim() ? "Lose tracking later? Open BOBO OS and tap Move scene." : this.placeHintTip.value;
      if (main) {
        main.textContent = mainTxt;
        main.style.display = mainTxt.trim() ? "" : "none";
      }
      if (tip) {
        tip.textContent = tipTxt;
        tip.style.display = tipTxt.trim() ? "" : "none";
      }
      hint.style.display = this.showPlaceHint.value && (mainTxt.trim() || tipTxt.trim()) ? "" : "none";
      const lift = Math.max(0, Math.round(this.placeHintLift.value)) + (this._shell ? 56 : 0);
      hint.style.setProperty("--ohg-hintLift", `${lift}px`);
    }
    const rl = this._resetWrap.querySelector(".ohg-roundLbl");
    if (rl) {
      rl.textContent = this.resetButtonLabel.value;
      rl.style.display = this.resetButtonLabel.value.trim() ? "" : "none";
    }
  }
  /* ── lounge mode ───────────────────────────────────────────────────── */
  _enterLounge() {
    if (this._lounge) return;
    this._cancelCountdown();
    this._exitHideout();
    this._lounge = true;
    this._reset();
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._closeMenu();
    this._closeTimeout();
    if (this.placementEnabled.value && !this._placed) this._setState("placing" /* Placing */);
    else this._setState("idle" /* Idle */);
    this._applyUiVisibility();
    this._playLoungeClip(this.loungeTimeline.value);
    this.onLoungeEnter.emit();
  }
  _exitLounge() {
    if (!this._lounge) return;
    this._lounge = false;
    this._resetLoungeAnimations();
    this._loungeClipId = void 0;
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._applyUiVisibility();
    this.onLoungeExit.emit();
  }
  /* ── Bobo's Hideout mode ───────────────────────────────────────────── */
  /**
   * The hideout is a mode like the lounge: no clock, no orbs, the HUD off.
   * What stays on screen is what the player needs in any mode — the menu
   * button, the sound toggle and Place / Reset placement — so moving the
   * room works exactly the way moving the round does.
   *
   * The room itself belongs to CollectorHubMode, which listens for
   * onHideoutEnter / onPlace / onResetPlacement / onHideoutExit.
   */
  _enterHideout() {
    if (this._hideout) return;
    this._cancelCountdown();
    if (this._lounge) this._exitLounge();
    this._hideout = true;
    this._closeIntro();
    this._reset();
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._closeMenu();
    this._closeTimeout();
    if (this.placementEnabled.value && !this._placed) this._setState("placing" /* Placing */);
    else this._setState("idle" /* Idle */);
    this._applyUiVisibility();
    this._syncMenu();
    this.onHideoutEnter.emit();
  }
  _exitHideout() {
    if (!this._hideout) return;
    this._hideout = false;
    this._resetLoungeAnimations();
    this._loungeClipId = void 0;
    this._applyLoungeBoard();
    this._applyPortalVisibility();
    this._applyMode();
    this._applyUiVisibility();
    this._syncMenu();
    this.onHideoutExit.emit();
  }
  /**
   * Clear the orb board while lounging. Orbs can only be collected during a
   * round, so leaving them floating there is a false affordance — the player
   * walks into one, nothing happens, and the game looks broken.
   */
  /**
   * Whether the ground rings should be drawn at all right now.
   *
   * Off during placement: the rings are pinned to the floor of a scene the
   * player hasn't put down yet, so they hang in mid-air over the room and
   * point at nothing. They're a wayfinding cue for a live round — before the
   * board exists they're just glowing litter.
   */
  _beaconsAllowed() {
    const settled = !this.placementEnabled.value || this._placed;
    return this.beaconEnabled.value && !this._noRound && this._state !== "placing" /* Placing */ && settled;
  }
  _applyLoungeBoard() {
    for (const o of this._orbs) {
      const show = o.active && !this._noRound;
      o.group.visible = show;
      o.beacon.visible = show && this._beaconsAllowed();
      if (o.trigger) o.trigger.enabled.value = show;
    }
  }
  /**
   * Keep the achievement badge off the lounge bar. Measured, not assumed: the
   * bar's height depends on the action count and on whether the row wrapped,
   * so any constant would be wrong for some configuration.
   */
  _liftReward(loungeVisible) {
    if (!this._rewardWrap) return;
    const h = loungeVisible ? this._loungeWrap.getBoundingClientRect().height : 0;
    this._rewardWrap.style.setProperty("--ohg-rwLift", h ? `${Math.round(h)}px` : "0px");
  }
  _loungeSlots() {
    return [
      { n: 1, label: this.lounge1Label.value, icon: this.lounge1Icon.value, clip: this.lounge1Timeline.value },
      { n: 2, label: this.lounge2Label.value, icon: this.lounge2Icon.value, clip: this.lounge2Timeline.value },
      { n: 3, label: this.lounge3Label.value, icon: this.lounge3Icon.value, clip: this.lounge3Timeline.value },
      { n: 4, label: this.lounge4Label.value, icon: this.lounge4Icon.value, clip: this.lounge4Timeline.value }
    ];
  }
  _syncLounge() {
    if (!this._loungeWrap) return;
    const exit = this._loungeWrap.querySelector(".ohg-loungeExit");
    const label = this.loungeExitLabel.value.trim();
    exit.textContent = label;
    exit.style.display = this.showLoungeExit.value && label ? "" : "none";
    const live = this._loungeSlots().filter((a) => a.label.trim() || a.icon !== "none" /* None */);
    const row = this._loungeWrap.querySelector(".ohg-loungeRow");
    row.innerHTML = live.map((a) => `
      <div class="ohg-loungeItem">
        <button class="ohg-round ohg-loungeBtn" type="button" data-la="${a.n}"
                aria-label="${(a.label || `Action ${a.n}`).replace(/"/g, "&quot;")}">
          ${this._loungeSvg(a.icon)}
        </button>
        <span class="ohg-roundLbl">${a.label.replace(/</g, "&lt;")}</span>
      </div>`).join("");
    row.querySelectorAll(".ohg-loungeBtn").forEach((b) => b.addEventListener("click", () => this._loungeAction(Number(b.dataset.la))));
    this._applyLoungeOffset();
  }
  _loungeAction(n) {
    const slot = this._loungeSlots().find((a) => a.n === n);
    if (!slot) return;
    this._playLoungeClip(slot.clip);
    this.onLoungeAction.emit({ action: n, label: slot.label });
  }
  _loungeSvg(i) {
    const S = (d, w = "1.9") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const PAW = `<g fill="currentColor" stroke="none"><ellipse cx="7.6" cy="10.4" rx="1.75" ry="2.25"/><ellipse cx="12" cy="9.1" rx="1.8" ry="2.35"/><ellipse cx="16.4" cy="10.4" rx="1.75" ry="2.25"/><path d="M12 12.9c3 0 5.2 2 5.2 4.3 0 1.9-1.7 3-3.6 3h-3.2c-1.9 0-3.6-1.1-3.6-3 0-2.3 2.2-4.3 5.2-4.3z"/></g>`;
    switch (i) {
      case "sleep" /* Sleep */:
        return S(`<g transform="translate(-2.1 1.6) scale(0.84)">${PAW}</g><path d="M14.4 2.6h5l-5 5.4h5" stroke-width="2"/><path d="M19.6 9.6h3.1l-3.1 3.3h3.1" stroke-width="1.8"/>`);
      case "paw" /* Paw */:
        return S(PAW);
      case "excited" /* Excited */:
        return S(`<path d="M10.5 2.6 12.2 7.5l4.9 1.7-4.9 1.7-1.7 4.9-1.7-4.9L3.9 9.2l4.9-1.7 1.7-4.9z"/><path d="M18 13.4l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9.9-2.5z"/><path d="M3.2 16.6h2.2M4.9 20.1l1.6-1.5M8.7 21.4v-2.1" stroke-width="1.6"/>`);
      case "heart" /* Heart */:
        return S(`<path d="M12 20.3s-7.4-4.6-7.4-9.6A4.2 4.2 0 0 1 12 8.2a4.2 4.2 0 0 1 7.4 2.5c0 5-7.4 9.6-7.4 9.6z"/>`);
      case "play" /* Play */:
        return S(`<path d="M8 5.5 18.5 12 8 18.5V5.5z"/>`);
      case "star" /* Star */:
        return S(`<path d="m12 3 2.7 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.3 6.5 20.2l1.1-6.2L3 9.6l6.3-.9L12 3z"/>`);
      case "bolt" /* Bolt */:
        return S(`<path d="M13.5 2 4 13.5h6L9.5 22 20 10.5h-6.5L13.5 2z"/>`);
      case "fish" /* Fish */:
        return S(`<path d="M15.5 12c0 3-3.1 5.4-6.6 5.4S3 15 3 12s2.4-5.4 5.9-5.4S15.5 9 15.5 12z"/><path d="m15.5 12 5.5-3.6v7.2L15.5 12z"/><path d="M7 11.4h.01" stroke-width="2.4"/>`);
      case "ball" /* Ball */:
        return S(`<circle cx="12" cy="12" r="8.4"/><path d="M4.4 9.4c5 .6 9.8 3.4 12.6 7.6"/><path d="M7.2 5.2c3.6 2.6 6.2 6.5 7.2 10.9"/><path d="M19.6 14.6c-4.3-.9-8.9.1-12.4 2.8"/>`);
      case "orb" /* Orb */:
        return `<span class="ohg-rwOrb" aria-hidden="true"></span>`;
      default:
        return "";
    }
  }
  _syncToggles() {
    const mute = this._soundWrap?.querySelector(".ohg-mute");
    mute?.classList.toggle("ohg-muted", !this.soundEnabled.value && !this.musicEnabled.value);
    if (!this._menuWrap) return;
    const m = this._menuWrap.querySelector('.ohg-toggle[data-t="music"] .ohg-sw');
    const s = this._menuWrap.querySelector('.ohg-toggle[data-t="sound"] .ohg-sw');
    m?.classList.toggle("on", this.musicEnabled.value);
    s?.classList.toggle("on", this.soundEnabled.value);
  }
  _applyIntroImage() {
    if (!this._introWrap) return;
    const src = this.introImage.value;
    const hero = this._introWrap.querySelector(".ohg-hero");
    if (src) {
      this._introImg.src = src;
      if (hero) hero.style.display = "";
    } else if (hero) hero.style.display = "none";
    this._introEl?.classList.toggle("ohg-noHero", !src);
  }
  /** Escape prop text before it goes near innerHTML. */
  static _esc(v) {
    return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /**
   * The legend is authored entirely from props, so it's rebuilt rather than
   * patched. Seven rows; a row with no title and no text is skipped, which is
   * what keeps the three spare rows invisible until someone fills them in.
   */
  _legendHtml() {
    const target = clampInt(this.targetCount.value, 1, 999);
    const secs = String(Math.round(this.roundTime.value));
    const E = _OrbHuntGame._esc;
    const rows = [
      [this.legend1Icon.value, this.legend1IconImage.value, this.legend1Title.value, this.legend1Text.value],
      [this.legend2Icon.value, this.legend2IconImage.value, this.legend2Title.value, this.legend2Text.value],
      [this.legend3Icon.value, this.legend3IconImage.value, this.legend3Title.value, this.legend3Text.value],
      [this.legend4Icon.value, this.legend4IconImage.value, this.legend4Title.value, this.legend4Text.value],
      [this.legend5Icon.value, this.legend5IconImage.value, this.legend5Title.value, this.legend5Text.value],
      [this.legend6Icon.value, this.legend6IconImage.value, this.legend6Title.value, this.legend6Text.value],
      [this.legend7Icon.value, this.legend7IconImage.value, this.legend7Title.value, this.legend7Text.value]
    ];
    const glyph = (icon, img) => {
      if (img) return `<img class="ohg-legImg" src="${E(img)}" alt="" />`;
      switch (icon) {
        case "orb" /* Orb */:
          return `<span class="ohg-legOrb"></span>`;
        case "can" /* Can */:
          return `<span class="ohg-legCan"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse class="ohg-cb" cx="12" cy="18.5" rx="4.5" ry="1.7"/><rect class="ohg-cb" x="7.5" y="7.9" width="9" height="10.6"/><path class="ohg-cb" d="M8.6 5.4h6.8l1.1 2.5H7.5z"/><rect class="ohg-cd" x="7.5" y="10.7" width="9" height="3.4"/><ellipse class="ohg-cl" cx="12" cy="5.4" rx="3.4" ry="1.28"/><ellipse class="ohg-cr" cx="12" cy="5.4" rx="2.2" ry="0.8"/><rect class="ohg-cs" x="9.1" y="9" width="1.3" height="7.6" rx="0.65"/></svg></span>`;
        case "menu" /* Menu */:
          return `<span class="ohg-legMenu"><i></i><i></i><i></i></span>`;
        case "joystick" /* Joystick */:
          return `<span class="ohg-legPad"></span>`;
        case "portal" /* Portal */:
          return `<span class="ohg-legPortal"></span>`;
        case "score" /* Score */:
          return `<span class="ohg-legNum">0/${target}</span>`;
        case "timer" /* Timer */:
          return `<span class="ohg-legNum">${secs}</span>`;
        case "star" /* Star */:
          return `<span class="ohg-legGlyph">&#9733;</span>`;
        case "clock" /* Clock */:
          return `<span class="ohg-legGlyph">&#9201;</span>`;
        case "bolt" /* Bolt */:
          return `<span class="ohg-legGlyph">&#9889;</span>`;
        default:
          return "";
      }
    };
    return rows.filter(([icon, , title, text]) => {
      if (!title.trim() && !text.trim()) return false;
      if (icon === "timer" /* Timer */ && !this.timerEnabled.value) return false;
      return true;
    }).map(([icon, img, title, text]) => {
      const g = glyph(icon, img);
      return `<div class="ohg-row">` + (g ? `<span class="ohg-ic">${g}</span>` : `<span class="ohg-ic ohg-noIc"></span>`) + `<div>` + (title.trim() ? `<strong>${E(title)}</strong>` : "") + (text.trim() ? `<span>${E(text)}</span>` : "") + `</div></div>`;
    }).join("");
  }
  _syncIntro() {
    if (!this._introWrap) return;
    this._introH1.textContent = this.introTitle.value;
    this._introLead.textContent = this.introBody.value;
    const legend = this._introWrap.querySelector(".ohg-legend");
    if (legend) legend.innerHTML = this._legendHtml();
    const play = this._introWrap.querySelector('[data-a="introPlay"]');
    if (play) play.textContent = this.introButtonLabel.value;
    const second = this._introWrap.querySelector('[data-a="introClose"]');
    if (second) {
      const lounge = this.loungeEnabled.value;
      const label = lounge ? this.loungeButtonLabel.value : this.introDismissLabel.value;
      second.textContent = label;
      second.classList.toggle("ohg-ghost", !lounge);
      second.classList.toggle("ohg-lounge", lounge);
      second.style.display = label.trim() ? "" : "none";
    }
    const hide = this._introWrap.querySelector('[data-a="introHideout"]');
    if (hide) {
      const label = this.hideoutButtonLabel.value.trim();
      hide.querySelector(".ohg-hideLbl").textContent = label;
      hide.style.display = this.hideoutEnabled.value && label ? "" : "none";
      this._introEl?.classList.toggle("ohg-three", this.hideoutEnabled.value && !!label);
    }
    this._applyIntroImage();
  }
  _syncMenu() {
    if (!this._menu) return;
    this._titleEl.textContent = this.menuTitle.value;
    const s = this._state;
    const startBtn = this._menu.querySelector(".ohg-start");
    if (startBtn) {
      startBtn.textContent = this.loungeExitLabel.value.trim() || "Start";
      startBtn.style.display = this._noRound ? "" : "none";
      startBtn.disabled = s === "placing" /* Placing */;
    }
    const status = this._lounge ? "Lounging" : this._hideout ? "In Bobo's Hideout" : s === "paused" /* Paused */ ? "Paused" : s === "won" /* Won */ ? "Portal open" : s === "failed" /* Failed */ ? "Out of time" : "";
    this._statusEl.classList.toggle("ohg-on", !!status);
    this._statusEl.classList.toggle("ohg-warn", s === "failed" /* Failed */);
    this._statusEl.classList.toggle("ohg-good", s === "won" /* Won */);
    this._statusEl.querySelector(".ohg-statusTxt").textContent = status;
    const restartBtn = this._menu.querySelector('[data-a="restart"]');
    if (restartBtn) restartBtn.style.display = this._noRound ? "none" : "";
    const howClaim = this._menu.querySelector(".ohg-howclaim");
    if (howClaim) {
      const label = this.instructionsMenuLabel.value.trim();
      howClaim.style.display = label ? "" : "none";
      howClaim.textContent = label;
    }
    const loungeBtn = this._menu.querySelector(".ohg-lounge");
    if (loungeBtn) {
      loungeBtn.style.display = this.loungeEnabled.value && !this._lounge ? "" : "none";
      loungeBtn.textContent = this.loungeButtonLabel.value.trim() || "Lounge";
    }
    const hideBtn = this._menu.querySelector(".ohg-hideout");
    if (hideBtn) {
      const label = this.hideoutButtonLabel.value.trim() || "Bobo's Hideout";
      hideBtn.querySelector(".ohg-hideLbl").textContent = label;
      hideBtn.style.display = this.hideoutEnabled.value && !this._hideout ? "" : "none";
    }
    const target = clampInt(this.targetCount.value, 1, 999);
    const noun = (this.scoreLabel.value.trim() || "orbs").toLowerCase();
    this._msgEl.textContent = this._lounge ? "Hanging out. No clock, nothing to collect." : this._hideout && s === "placing" /* Placing */ ? "Tap Place, and Bobo's room opens where you put him." : this._hideout ? "Bobo's room. Reset placement to move it, or pick another mode." : s === "placing" /* Placing */ ? "Tap Place to drop the game into your space." : s === "idle" /* Idle */ ? `Collect the ${noun} before the clock runs out.` : s === "paused" /* Paused */ ? `The clock is stopped. ${Math.max(0, target - this._score)} ${noun} left to find.` : s === "playing" /* Playing */ ? `Find ${Math.max(0, target - this._score)} more.` : s === "won" /* Won */ ? "You made it. The portal is open." : "The clock beat you. Try again?";
    this._syncToggles();
  }
  _syncHud() {
    if (!this._scoreEl) return;
    const target = clampInt(this.targetCount.value, 1, 999);
    this._scoreEl.textContent = `${this._score} / ${target}`;
    this._barEl.style.width = `${Math.min(100, this._score / target * 100)}%`;
    const timed = this.timerEnabled.value;
    this._timeEl.textContent = timed ? this._timeLeft.toFixed(1) : "\u221E";
    this._timeEl.classList.toggle("ohg-warn", timed && this._timeLeft <= this.warningTime.value);
    const hide = this._state === "idle" /* Idle */ || this._state === "placing" /* Placing */ ? "0" : "1";
    this._scoreWrap.style.opacity = hide;
    this._timeWrap.style.opacity = hide;
  }
  /* ── teardown ─────────────────────────────────────────────────────── */
  dispose() {
    this._anchorOff?.();
    this._anchorOff = null;
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onKeyDown);
    this._hudRO?.disconnect();
    if (this._hudRaf) cancelAnimationFrame(this._hudRaf);
    for (const o of this._orbs) o.trigger?.dispose();
    this._playerTrigger?.dispose();
    this._orbGeom.dispose();
    this._glowGeom.dispose();
    this._beaconGeom.dispose();
    this._portalGeom.dispose();
    this._orbMat.dispose();
    this._glowMat.dispose();
    this._beaconMat.dispose();
    this._portalMat.dispose();
    this._pickupGltf?.dispose();
    this._pickupImage?.dispose();
    this._sfxCollect.dispose();
    this._sfxWin.dispose();
    this._sfxReward.dispose();
    this._sfxWarn.dispose();
    this._sfxFail.dispose();
    this._sfxHum.dispose();
    this._sfxMusic.dispose();
    this._audio?.dispose();
    [this._root, this._scoreWrap, this._timeWrap, this._menuWrap, this._introWrap].forEach((e) => e?.remove());
    return super.dispose();
  }
};
__publicField(_OrbHuntGame, "_STYLE_ID", "ohg-styles");
__publicField(_OrbHuntGame, "_CSS", `
/* Scoped box-sizing reset. This CSS is injected into the host page, which may
   not have a global reset \u2014 without this, padding is added on top of the
   modal's max-height and a short landscape viewport overflows. */
.ohg-root,.ohg-anchor,.ohg-layer,.ohg-rwLayer,.ohg-cdLayer,
.ohg-root *,.ohg-anchor *,.ohg-layer *,.ohg-rwLayer *,.ohg-cdLayer *{box-sizing:border-box}
/* ---- 3-2-1 before a round (pointer-transparent: the joystick stays live) ---- */
.ohg-cdLayer{--ohg-accent:#4fd6e8;--ohg-accentRgb:79,214,232;position:absolute;left:0;top:0;width:100%;height:100%;
  display:grid;place-items:center;pointer-events:none!important;opacity:0;visibility:hidden;
  transition:opacity .3s,visibility 0s .3s;
  background:radial-gradient(ellipse at 50% 45%,rgba(6,9,14,.55) 0%,rgba(6,9,14,.22) 45%,transparent 75%);
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
.ohg-cdLayer *{pointer-events:none!important}
.ohg-cdLayer.on{opacity:1;visibility:visible;transition:opacity .2s}
.ohg-cd{display:flex;flex-direction:column;align-items:center;gap:4px;padding:0 24px;margin-top:-6vh;text-align:center;color:#fff}
.ohg-cdTitle{font-size:13px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:var(--ohg-accent);
  text-shadow:0 1px 10px rgba(0,0,0,.6)}
.ohg-cdNum{font-size:120px;line-height:1.05;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;
  color:#fff;text-shadow:0 0 28px rgba(var(--ohg-accentRgb),.75),0 6px 26px rgba(0,0,0,.45)}
.ohg-cdGo .ohg-cdNum{font-size:92px;color:var(--ohg-accent);text-shadow:0 0 30px rgba(var(--ohg-accentRgb),.9),0 6px 26px rgba(0,0,0,.45)}
.ohg-cdSub{font-size:15px;font-weight:700;color:#eef8fb;max-width:300px;text-shadow:0 1px 10px rgba(0,0,0,.7)}
.ohg-cdPop{animation:ohgCdPop .9s cubic-bezier(.2,1.3,.4,1) both}
@keyframes ohgCdPop{0%{transform:scale(1.7);opacity:0}22%{transform:scale(1);opacity:1}100%{transform:scale(.96);opacity:1}}
@media (prefers-reduced-motion:reduce){.ohg-cdPop{animation:none}}
.ohg-root,.ohg-anchor{--ohg-accent:#4fd6e8;--ohg-accentRgb:79,214,232;padding:14px;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
/* Overrides #zcomponent-overlay > * { pointer-events:auto } from core CSS \u2014
   an ID selector we can't outrank with a class, and letting the HUD or a
   hidden modal layer eat canvas taps would break joystick input. */
.ohg-anchor{pointer-events:none!important;transition:opacity .3s}
/* Reads as a menu button at a glance \u2014 three bars \u2014 but the orb glows behind
   them so it still belongs to the game rather than to a settings dialog.
   The bars morph into a close X while the menu is open. */
.ohg-icon{position:relative;width:54px;height:54px;border-radius:16px;cursor:pointer;padding:0;
  display:grid;place-items:center;overflow:hidden;
  border:1px solid rgba(var(--ohg-accentRgb),.34);background:rgba(20,22,26,.86);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:transform .18s,border-color .18s,box-shadow .18s}
.ohg-icon:hover,.ohg-icon.on{transform:scale(1.06);border-color:var(--ohg-accent);
  box-shadow:0 0 18px 2px rgba(var(--ohg-accentRgb),.28)}
.ohg-orb{position:absolute;width:34px;height:34px;border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  filter:blur(5px);opacity:.85;animation:ohgPulse 2.6s ease-in-out infinite}
.ohg-bars{position:relative;display:flex;flex-direction:column;gap:4px;align-items:center}
.ohg-bars i{display:block;width:20px;height:2.5px;border-radius:2px;background:#f2fbff;
  box-shadow:0 0 6px rgba(234,252,255,.9);transition:width .18s,transform .18s,opacity .18s}
.ohg-bars i:nth-child(2){width:14px}
.ohg-icon:hover .ohg-bars i:nth-child(2){width:20px}
.ohg-icon.on .ohg-bars i:nth-child(1){transform:translateY(6.5px) rotate(45deg)}
.ohg-icon.on .ohg-bars i:nth-child(2){opacity:0}
.ohg-icon.on .ohg-bars i:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}
@keyframes ohgPulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.16);opacity:1}}

/* @section logo */
/* A watermark, not a control. pointer-events:none is load-bearing: core CSS
   forces pointer-events:auto on every direct child of #zcomponent-overlay
   with an ID selector no class can outrank, so this anchor would otherwise
   swallow taps on the AR view behind it. */
.ohg-logo{pointer-events:none}
.ohg-logo *{pointer-events:none}
/* The ONE exception, and it is deliberately narrow: with a Logo URL set, the
   link and the image take taps. Measured, the two share a box exactly, so the
   pair adds no target the player can hit by accident.
   The WRAP stays inert. It is not full-bleed \u2014 overlay children shrink-wrap,
   so it is the image plus the anchor's own 14px padding \u2014 but that padding is
   a band of dead space over the camera feed on all four sides of the logo, and
   a tap landing in it should reach the scene, not a link.
   Specificity (0,2,1) beats the .ohg-logo star blanket without !important. */
.ohg-logo.ohg-logoTap .ohg-logoLink,
.ohg-logo.ohg-logoTap .ohg-logoImg{pointer-events:auto}
.ohg-logo.ohg-logoTap .ohg-logoImg{cursor:pointer;
  transition:transform .16s ease,filter .16s ease}
.ohg-logo.ohg-logoTap .ohg-logoImg:hover{transform:scale(1.04);
  filter:drop-shadow(0 2px 14px rgba(0,0,0,.55))}
.ohg-logo.ohg-logoTap .ohg-logoLink{display:block}
.ohg-logo.ohg-logoTap .ohg-logoLink:focus-visible{outline:2px solid var(--ohg-accent);
  outline-offset:3px;border-radius:6px;pointer-events:auto}
@media (prefers-reduced-motion:reduce){
  .ohg-logo.ohg-logoTap .ohg-logoImg{transition:none}
}
/* min(vmin, px) is set inline. vmin tracks the SHORTER viewport side, so the
   logo holds its size through a rotation instead of doubling in landscape. */
.ohg-logoImg{display:block;height:auto;width:22vmin;
  filter:drop-shadow(0 2px 10px rgba(0,0,0,.45))}
/* Kept as state hooks only \u2014 the offset itself is applied by the single
   .ohg-timeAnchor margin rule below, so these must NOT set margin. */
/* @end logo */

.ohg-hud{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 14px;border-radius:12px;
  background:rgba(20,22,26,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid #2a2f38}
.ohg-hud.ohg-centre{align-items:center}
/* Drop the centred timer clear of the corner score block. A percentage in
   \`top\` resolves against the overlay's height, which is what we want; a
   percentage in \`padding\` would resolve against its WIDTH. Overriding the
   alignment class needs !important, and uses Mattercraft's --safe-area vars
   rather than env(), which WebXR Chrome doesn't set correctly. */
/* max(), not safe + offset.
   Adding them meant the safe-area inset was silently bolted onto whatever the
   author set, so the column sat somewhere neither value described. That is
   invisible on a desktop preview, where the inset is 0 \u2014 and then Mattercraft
   ships an :xr-overlay rule setting --safe-area-inset-top to 45px, so the
   moment a WebXR
   session starts (i.e. right after the scene is placed) the whole HUD drops
   45px and Timer Offset stops matching where the HUD actually is.
   As a floor instead, the prop positions the column and the inset only stops
   it climbing under a notch or the XR exit control. */
.ohg-timeAnchor{
  top:max(var(--safe-area-inset-top, 0px), var(--ohg-timerDrop, 2%))!important}
.ohg-timeAnchor.ohg-fromBottom{top:auto!important;
  bottom:max(var(--safe-area-inset-bottom, 0px), var(--ohg-timerDrop, 2%))!important}
/* There used to be an 88px floor on narrow screens here, from when the score
   block sat in the top-left corner and a centred clock had to clear it. The
   score is directly UNDER the clock now, so nothing needs clearing \u2014 and the
   floor had become a bug: it pinned the column at 88px on a phone whatever
   Timer Offset said, so the one property meant to move it up did nothing.
   The offset is the whole story now; safe-area insets keep it off the notch. */
/* The HUD column's offset from its edge, in ONE rule.
   Two contributions: the room a logo needs, and (for the score) the clock it
   sits under. They were separate rules for a while and both set margin-top,
   so whichever came last in the stylesheet silently won and the score landed
   on top of the clock. Summing them in a single declaration is the fix. */
.ohg-anchor.ohg-timeAnchor{
  margin-top:calc(var(--ohg-logoDrop,0px) + var(--ohg-hudStack,0px))}
.ohg-anchor.ohg-timeAnchor.ohg-fromBottom{margin-top:0;
  margin-bottom:calc(var(--ohg-logoDrop,0px) + var(--ohg-hudStack,0px))}
/* Centred under a centred clock, the left-aligned label and bar read as
   misaligned, so the whole block centres with it \u2014 and flips back when the
   column is anchored to a side. */
.ohg-hudStack .ohg-hud{align-items:center}
.ohg-hudStack .ohg-lbl{text-align:center}
.ohg-hudLeft .ohg-hud{align-items:flex-start}
.ohg-hudLeft .ohg-lbl{text-align:left}
.ohg-hudRight .ohg-hud{align-items:flex-end}
.ohg-hudRight .ohg-lbl{text-align:right}
.ohg-lbl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a93a3;line-height:1}
.ohg-valRow{display:flex;align-items:center;gap:8px}
.ohg-hudOrb{width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 10px 2px rgba(var(--ohg-accentRgb),.5);animation:ohgPulse 2.6s ease-in-out infinite}
.ohg-val{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--ohg-accent);line-height:1.15}
.ohg-val.ohg-big{font-size:38px}
.ohg-val.ohg-warn{color:#ff8a6b}
.ohg-bar{width:126px;height:4px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:3px}
.ohg-fill{height:100%;width:0%;border-radius:4px;background:var(--ohg-accent);
  transition:width .25s cubic-bezier(.4,0,.2,1)}

.ohg-layer{--ohg-accent:#4fd6e8;--ohg-accentRgb:79,214,232;position:absolute;left:0;top:0;width:100%;height:100%;
  pointer-events:none!important;opacity:0;transition:opacity .22s;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
.ohg-layer.on{opacity:1;pointer-events:auto!important}
.ohg-scrim{position:absolute;inset:0;background:rgba(5,7,11,.66);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.ohg-modal{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
  max-height:calc(100% - 28px);overflow-y:auto;-webkit-overflow-scrolling:touch;
  border-radius:20px;border:1px solid #2a2f38;box-shadow:0 26px 80px rgba(0,0,0,.72);color:#e8ecf2}
.ohg-menu{position:relative;width:min(340px,calc(100% - 40px));padding:24px 22px 20px;
  display:flex;flex-direction:column;gap:9px;overflow:hidden;
  background:
    radial-gradient(120% 70% at 50% -18%, rgba(var(--ohg-accentRgb),.16) 0%, transparent 62%),
    rgba(18,20,24,.975);
  border-color:rgba(var(--ohg-accentRgb),.22);
  box-shadow:0 26px 80px rgba(0,0,0,.72), 0 0 0 1px rgba(var(--ohg-accentRgb),.06) inset;
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
/* hairline of accent light along the top edge */
.ohg-menuGlow{position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--ohg-accent),transparent);opacity:.85}
.ohg-menuHead{display:flex;align-items:center;gap:11px}
.ohg-menuOrb{width:26px;height:26px;border-radius:50%;flex:0 0 auto;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 14px 3px rgba(var(--ohg-accentRgb),.45);animation:ohgPulse 2.6s ease-in-out infinite}
.ohg-title{font-size:22px;font-weight:800;letter-spacing:-.01em}
/* Status pill \u2014 this is what tells the player the clock has stopped, now that
   there's no Pause button to imply it. */
.ohg-status{display:none;align-items:center;gap:8px;align-self:flex-start;
  margin-top:2px;padding:7px 13px 7px 11px;border-radius:999px;
  font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
  color:var(--ohg-accent);background:rgba(var(--ohg-accentRgb),.13);
  border:1px solid rgba(var(--ohg-accentRgb),.38)}
.ohg-status.ohg-on{display:flex}
.ohg-status.ohg-good{color:#7ff0b8;background:rgba(127,240,184,.12);border-color:rgba(127,240,184,.38)}
.ohg-status.ohg-warn{color:#ff8a6b;background:rgba(255,138,107,.12);border-color:rgba(255,138,107,.38)}
.ohg-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:0 0 auto;
  box-shadow:0 0 9px currentColor;animation:ohgBlink 1.6s ease-in-out infinite}
@keyframes ohgBlink{0%,100%{opacity:1}50%{opacity:.28}}
.ohg-msg{font-size:13px;color:#98a2b1;line-height:1.55;margin-bottom:8px}
/* One label treatment for every button: centred, white. Colour-coding the
   labels made Resume teal, Restart white and Claim near-black, which read as
   three different kinds of control rather than one menu. Emphasis now comes
   from the fill, the border and the glow \u2014 not from the text. */
.ohg-btn{padding:14px 18px;border-radius:12px;border:1px solid #2a2f38;background:#1b1e24;color:#fff;
  font:600 15px/1 inherit;cursor:pointer;transition:.15s;text-align:center;width:100%;
  /* The menu is a flex column that scrolls; without this, a short landscape
     viewport squashes every button instead of scrolling the list. */
  flex:0 0 auto}
/* Hover brightens the frame, not the text \u2014 the label stays white. */
.ohg-btn:hover:not(:disabled){border-color:var(--ohg-accent);background:#22262e}
.ohg-btn:disabled{opacity:.32;cursor:default}
.ohg-btn.ohg-primary{background:rgba(var(--ohg-accentRgb),.18);border-color:rgba(var(--ohg-accentRgb),.48);
  color:#fff}
.ohg-btn.ohg-primary:hover:not(:disabled){background:rgba(var(--ohg-accentRgb),.26)}
/* Tertiary actions stay white too; their lower weight comes from having no
   fill and no border, and from the smaller type. */
/* 44px is the minimum comfortable touch target. A ghost button is visually
   quiet but still has to be hittable \u2014 and in the reward modal it's the only
   way out. */
.ohg-btn.ohg-ghost{background:none;border-color:transparent;color:#fff;padding:12px 18px;
  font-size:13px;min-height:44px}
.ohg-btn.ohg-ghost:hover:not(:disabled){background:rgba(255,255,255,.06);border-color:transparent}
/* The intro's two buttons are a genuine choice between two modes, not an
   action and a dismissal \u2014 so they match in size and weight and differ only
   in hue. Sized here rather than on .ohg-btn so the menu's denser stack of
   rows is left alone. */
.ohg-intro .ohg-btn.ohg-primary,
.ohg-intro .ohg-btn.ohg-lounge,
.ohg-intro .ohg-btn.ohg-hideout{font-size:17px;font-weight:700;
  letter-spacing:.01em;padding:16px 20px;min-height:54px}
/* Three choices: a little air between them so they read as three. */
.ohg-intro .ohg-btn + .ohg-btn{margin-top:10px}
/* No hero image: the body's lift into the image would clip the title. */
.ohg-intro.ohg-noHero .ohg-introBody{margin-top:0;padding-top:26px}

/* The mode-switch rows \u2014 Lounge from a round, Start from the lounge \u2014 share
   one treatment and wear --ohg-altRgb: the colour of the mode they lead to.
   Only one of them is ever on screen, so they can't clash, and the button
   previewing its destination is what makes the colour mean something. */
.ohg-btn.ohg-lounge,.ohg-menu .ohg-btn.ohg-start,.ohg-btn.ohg-hideout{
  --ohg-rowRgb:var(--ohg-loungeRgb,var(--ohg-altRgb,255,92,180));
  background:rgba(var(--ohg-rowRgb),.18);
  border-color:rgba(var(--ohg-rowRgb),.62);
  color:#fff;
  box-shadow:0 0 18px rgba(var(--ohg-rowRgb),.34),
             inset 0 1px 0 rgba(255,255,255,.14)}
.ohg-menu .ohg-btn.ohg-start{--ohg-rowRgb:var(--ohg-uiRgb,var(--ohg-altRgb,79,214,232))}
.ohg-btn.ohg-hideout{--ohg-rowRgb:var(--ohg-hideRgb,255,196,46);
  display:flex;align-items:center;justify-content:center;gap:9px}
.ohg-btn.ohg-hideout svg{width:18px;height:18px;flex:0 0 auto}
.ohg-btn.ohg-lounge:hover:not(:disabled),
.ohg-menu .ohg-btn.ohg-start:hover:not(:disabled),
.ohg-btn.ohg-hideout:hover:not(:disabled){
  background:rgba(var(--ohg-rowRgb),.28);
  border-color:rgba(var(--ohg-rowRgb),.85);
  box-shadow:0 0 26px rgba(var(--ohg-rowRgb),.48),
             inset 0 1px 0 rgba(255,255,255,.18)}


/* The menu's close affordance. A 44px target in the corner, plus the scrim,
   replaces a Close row at the bottom of a list people had to scroll past. */
.ohg-menuX{position:absolute;top:10px;right:10px;z-index:2;
  width:38px;height:38px;padding:8px;border-radius:11px;
  display:grid;place-items:center;cursor:pointer;
  background:rgba(255,255,255,.05);border:1px solid #2a2f38;color:#c3ccd9}
.ohg-menuX:hover{background:rgba(255,255,255,.11);color:#fff;
  border-color:var(--ohg-accent)}
.ohg-menuX svg{width:18px;height:18px}
/* The title has to stop before the X, or a long game name runs under it. */
.ohg-menu .ohg-menuHead{padding-right:44px}

/* @section claim */
/* \u2500\u2500 Claim CTA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   The one commercial action in the whole UI, so it is deliberately the
   loudest thing in the menu: filled rather than outlined, its own glow, and
   a slow sheen so it reads as live. It sits directly under Play because the
   exclusive is already unlocked \u2014 gating it behind a win would cost claims
   from everyone who never finishes a round.                                */
/* White needs a 4.5:1 background at 15px bold. The old cyan\u2192blue fill gave
   white 1.33:1 at the light end, so the fill is deeper now \u2014 4.5:1 at the
   lightest stop, 5.4:1 at the darkest. It still reads as the bright one in
   the menu because the glow, the inset highlight and the sheen do that work;
   a near-white fill was never what made it loud. */
.ohg-btn.ohg-claim{position:relative;overflow:hidden;
  margin-top:2px;border:0;color:#fff;font-weight:800;font-size:15px;letter-spacing:.01em;
  /* Filled with the MODE's colour, darkened by script until white text on it
     clears 4.5:1 \u2014 see shadeForWhiteText. The hue still reads as the mode;
     the glow below carries it at full strength, where nothing has to be
     legible on top of it. */
  background:linear-gradient(135deg,
    var(--ohg-claimA,#2f6bff) 0%, var(--ohg-claimA,#2467f0) 46%,
    var(--ohg-claimB,#1a63dd) 100%);
  box-shadow:0 0 0 1px rgba(255,255,255,.34) inset,
             0 8px 26px -6px rgba(var(--ohg-accentRgb),.75),
             0 0 34px -8px rgba(var(--ohg-accentRgb),.65);
  animation:ohgClaimPulse 2.8s ease-in-out infinite}
.ohg-btn.ohg-claim:hover:not(:disabled){color:#fff;filter:brightness(1.12)}
.ohg-claimLbl{position:relative;z-index:1}
/* Sheen, confined to a gloss band across the top.
   A full-height sweep put 62% white directly behind the label twice every
   cycle, dropping white-on-fill from 4.6:1 to 1.8:1 \u2014 unreadable for a
   fraction of a second, repeatedly. Invisible when the label was dark; a real
   defect now that it's white. Keeping the highlight above the text band gets
   the same "this is live" read with none of that. */
.ohg-claimGlow{position:absolute;top:0;height:30%;width:38%;left:-50%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);
  transform:skewX(-18deg);animation:ohgClaimSheen 3.6s ease-in-out infinite}
/* The pulse animates the glow, so it has to carry the mode colour too \u2014 a
   hardcoded blue here left the button's halo blue in every mode while the
   fill changed underneath it. */
@keyframes ohgClaimPulse{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.34) inset,
                     0 8px 26px -6px rgba(var(--ohg-accentRgb),.75),
                     0 0 34px -8px rgba(var(--ohg-accentRgb),.65)}
  50%    {box-shadow:0 0 0 1px rgba(255,255,255,.5) inset,
                     0 8px 30px -4px rgba(var(--ohg-accentRgb),.95),
                     0 0 52px -6px rgba(var(--ohg-accentRgb),.85)}}
@keyframes ohgClaimSheen{0%{left:-50%}55%,100%{left:120%}}

/* @end claim */
.ohg-div{height:1px;background:#2a2f38;margin:4px 0}
.ohg-toggle{display:flex;align-items:center;justify-content:space-between;padding:7px 2px;
  font-size:14px;cursor:pointer}
.ohg-sw{position:relative;width:44px;height:26px;border-radius:999px;background:#2a2f38;
  transition:background .18s;flex:0 0 auto}
.ohg-sw::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;
  background:#8892a4;transition:.18s}
.ohg-sw.on{background:rgba(var(--ohg-accentRgb),.4)}
.ohg-sw.on::after{left:21px;background:var(--ohg-accent)}

.ohg-intro{width:min(560px,calc(100% - 28px));background:#14161a}
.ohg-hero{position:relative;aspect-ratio:16/9;background:#10141a;overflow:hidden}
.ohg-hero img{width:100%;height:100%;object-fit:cover;display:block}
.ohg-hero::after{content:"";position:absolute;inset:0;
  background:linear-gradient(to bottom,transparent 55%,#14161a 100%)}
.ohg-introBody{padding:4px 24px 24px;position:relative;z-index:1;margin-top:-26px}
.ohg-h1{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px}
.ohg-lead{font-size:14px;line-height:1.6;color:#b8c1cf;margin:0 0 18px;white-space:pre-line}
.ohg-legend{display:flex;flex-direction:column;gap:13px;margin-bottom:22px}
.ohg-row{display:flex;gap:13px;align-items:flex-start}
.ohg-row strong{display:block;font-size:13.5px;font-weight:700;margin-bottom:2px}
.ohg-row div>span{display:block;font-size:12.5px;line-height:1.5;color:#8a93a3}
.ohg-ic{flex:0 0 42px;width:42px;height:42px;border-radius:11px;display:grid;place-items:center;
  background:#1b1e24;border:1px solid #2a2f38}
.ohg-legOrb{width:22px;height:22px;border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 10px 2px rgba(var(--ohg-accentRgb),.44)}
.ohg-legOrb.ohg-sm{width:15px;height:15px}
/* Drinks can. Tinted from --ohg-accent so it follows the UI colour, built from
   flat shapes rather than gradients because it has to read at 26px: a necked
   body, a brighter lid with a darker inner rim, a label band and one highlight.
   Every class is namespaced \u2014 these live in the page's global stylesheet. */
.ohg-legCan,.ohg-legCan svg{display:block;width:28px;height:28px}
.ohg-legCan .ohg-cb{fill:var(--ohg-accent);opacity:.62}
.ohg-legCan .ohg-cd{fill:var(--ohg-accent);opacity:.95}
.ohg-legCan .ohg-cl{fill:var(--ohg-accent)}
.ohg-legCan .ohg-cr{fill:#0a0d12;opacity:.3}
.ohg-legCan .ohg-cs{fill:#eafcff;opacity:.42}
.ohg-legImg{width:26px;height:26px;object-fit:contain;display:block;border-radius:6px}
.ohg-legGlyph{font-size:19px;line-height:1;color:var(--ohg-accent)}
.ohg-legMenu{display:flex;flex-direction:column;gap:3px;align-items:center}
.ohg-legMenu i{display:block;width:16px;height:2px;border-radius:2px;background:var(--ohg-accent)}
.ohg-legMenu i:nth-child(2){width:11px}
.ohg-legPad{width:22px;height:22px;border-radius:50%;border:1.5px solid #8a93a3;position:relative}
.ohg-legPad::after{content:"";position:absolute;left:50%;top:50%;width:10px;height:10px;
  margin:-5px 0 0 -5px;border-radius:50%;background:rgba(var(--ohg-accentRgb),.6)}
.ohg-legPortal{width:22px;height:22px;border-radius:50%;
  background:conic-gradient(from 0deg,#eafcff,#1b6ff0,#37e0d8,#eafcff);
  -webkit-mask:radial-gradient(circle,transparent 42%,#000 46%);
  mask:radial-gradient(circle,transparent 42%,#000 46%)}
.ohg-noIc{background:none;border-color:transparent}

/* \u2500\u2500 placement: hint + Place button, bottom-centre \u2500\u2500 */
.ohg-placeAnchor{pointer-events:none!important}
/* The bar carries the width, not the hint.
   Overlay children are position:absolute with no width, so this anchor
   shrink-wraps its content \u2014 which is the Place button, about 167px. The
   hint's max-width could never bind against that, so the instruction was
   folding onto four lines on a 360px phone no matter what the cap said.
   Giving the bar a real width is what actually widens the hint; align-items
   keeps the button its own natural size, centred, exactly where it was. */
.ohg-placeBar{display:flex;flex-direction:column;align-items:center;gap:12px;
  width:min(420px,92vw);
  pointer-events:none;animation:ohgRise .3s ease-out}
@keyframes ohgRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
/* Wider than it was, and lifted clear of the Place button. 320px forced the
   one instruction anybody reads onto three ragged lines on a phone; 420 caps
   it at two, and 92vw keeps the margins on a 360px screen. The lift is a
   margin under the card rather than a change to the bar's gap, so the button
   stays exactly where the thumb expects it. */
.ohg-hint{width:100%;text-align:center;font-size:13px;line-height:1.5;color:#e8ecf2;
  white-space:pre-line;padding:10px 16px;border-radius:12px;
  margin-bottom:var(--ohg-hintLift,18px);
  display:flex;flex-direction:column;gap:5px;
  background:rgba(20,22,26,.82);border:1px solid #2a2f38;
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
/* The tip is advice about a control that isn't on screen yet, so it reads
   quieter than the instruction it sits under \u2014 and a hairline keeps the two
   from running together as one paragraph. */
.ohg-hintTip{font-size:12px;line-height:1.45;color:#9aa4b2;
  padding-top:5px;border-top:1px solid rgba(255,255,255,.09)}
/* With nothing above it there is nothing to divide. */
.ohg-hintMain[style*="none"] + .ohg-hintTip{border-top:0;padding-top:0}
@media (max-height:430px){
  /* Landscape has the height to spare least of all, and the hint is the one
     thing here that can give some back. */
  .ohg-hint{margin-bottom:min(var(--ohg-hintLift,18px),8px);font-size:12.5px}
  .ohg-hintTip{font-size:11.5px}
}
.ohg-place{pointer-events:auto!important;display:flex;align-items:center;gap:9px;cursor:pointer;
  padding:15px 30px;border-radius:999px;font:700 16px/1 inherit;
  color:var(--ohg-onTint,#04121b);
  border:1px solid rgba(255,255,255,.55);
  /* All three stops derive from the mode's accent, and the label colour is
     picked by contrast \u2014 a hardcoded pale stop left this pill half cyan in
     a pink interface. */
  background:linear-gradient(180deg,var(--ohg-tintLight,#7ceaf6) 0%,
    var(--ohg-accent) 55%,var(--ohg-tintDeep,#25b6d6) 100%);
  box-shadow:0 0 22px 3px rgba(var(--ohg-accentRgb),.4),0 6px 22px rgba(0,0,0,.45);
  animation:ohgPlacePulse 2.4s ease-in-out infinite;transition:transform .15s}
.ohg-place:hover{transform:scale(1.04)}
.ohg-place:active{transform:scale(.97)}
.ohg-place svg{width:19px;height:19px}
/* A World Tracker anchor hasn't found a floor under the reticle yet. */
.ohg-place.ohg-placeWait,.ohg-place:disabled{opacity:.5;filter:saturate(.4);animation:none;cursor:default;transform:none}
@keyframes ohgPlacePulse{0%,100%{box-shadow:0 0 22px 3px rgba(var(--ohg-accentRgb),.4),0 6px 22px rgba(0,0,0,.45)}
  50%{box-shadow:0 0 34px 7px rgba(var(--ohg-accentRgb),.6),0 6px 22px rgba(0,0,0,.45)}}

/* \u2500\u2500 placement: circular Reset \u2500\u2500 */
.ohg-resetBox{display:flex;flex-direction:column;align-items:center;gap:7px;pointer-events:none}
.ohg-round{pointer-events:auto!important;width:54px;height:54px;border-radius:50%;cursor:pointer;padding:0;
  display:grid;place-items:center;color:var(--ohg-accent);
  border:1px solid rgba(var(--ohg-accentRgb),.34);background:rgba(20,22,26,.86);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:transform .18s,border-color .18s,box-shadow .18s}
.ohg-round:hover{transform:scale(1.07);border-color:var(--ohg-accent);
  box-shadow:0 0 18px 2px rgba(var(--ohg-accentRgb),.28)}
.ohg-round:active{transform:scale(.95)}
.ohg-round svg{width:24px;height:24px}
.ohg-roundLbl{font-size:11px;font-weight:600;letter-spacing:.02em;color:#c3ccd9;text-align:center;
  max-width:96px;line-height:1.3;text-shadow:0 1px 6px rgba(0,0,0,.8)}

/* @section rwmodal */
/* \u2500\u2500 reward modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Liquid glass: a translucent surface with its own light rather than a flat
   panel. Four layers do the work \u2014 a rotating conic gradient for the border
   light, the glass itself, a bevel drawn as inset shadows (light from the top
   left, shadow from the bottom right, which is what makes an edge read as
   chamfered), and a slow specular sweep. */
.ohg-rwmShell{--ohg-rwmA:#4fe3d0;--ohg-rwmB:#2f8fff;
  --ohg-rwmArgb:79,227,208;--ohg-rwmBrgb:47,143,255;
  position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.92);
  width:min(390px,calc(100% - 34px));max-height:calc(100% - 28px);
  padding:1.6px;                       /* the border light shows through here */
  border-radius:30px;overflow:hidden;opacity:0;
  transition:opacity .26s ease, transform .42s cubic-bezier(.16,.9,.3,1);
  box-shadow:0 30px 90px rgba(0,0,0,.62),
             0 0 60px -12px rgba(var(--ohg-rwmArgb),.55)}
.ohg-layer.on .ohg-rwmShell{opacity:1;transform:translate(-50%,-50%) scale(1)}

/* Border light. A conic gradient on a square twice the panel's diagonal,
   rotated behind it \u2014 animating a conic gradient's angle directly needs
   @property, which isn't safe to rely on in a WebView. */
.ohg-rwmSpin{position:absolute;top:50%;left:50%;width:220%;aspect-ratio:1;
  margin:-110% 0 0 -110%;
  background:conic-gradient(from 0deg,
    rgba(var(--ohg-rwmArgb),0) 0deg, var(--ohg-rwmA) 55deg,
    var(--ohg-rwmB) 120deg, rgba(var(--ohg-rwmBrgb),0) 190deg,
    rgba(var(--ohg-rwmArgb),0) 250deg, var(--ohg-rwmA) 320deg,
    rgba(var(--ohg-rwmArgb),0) 360deg)}
.ohg-rwmSpinning .ohg-rwmSpin{animation:ohgRwmSpin 7s linear infinite}
@keyframes ohgRwmSpin{to{transform:rotate(1turn)}}

.ohg-rwmGlass{position:relative;border-radius:28.4px;overflow:hidden;
  padding:26px 24px 20px;display:flex;flex-direction:column;align-items:center;
  max-height:calc(100vh - 34px);overflow-y:auto;-webkit-overflow-scrolling:touch;
  /* Opaque base under the tint: this panel carries text, and a camera feed
     behind a purely translucent surface makes it unreadable. */
  background:
    linear-gradient(160deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.03) 38%,
                    rgba(var(--ohg-rwmArgb),.07) 100%),
    linear-gradient(rgba(16,22,28,.90), rgba(10,14,19,.94))}
.ohg-rwmFrosted .ohg-rwmGlass{backdrop-filter:blur(22px) saturate(1.35);
  -webkit-backdrop-filter:blur(22px) saturate(1.35)}
/* The bevel. Inset highlight top-left, inset shade bottom-right, plus a
   hairline of the accent \u2014 an edge lit from one side reads as chamfered where
   a plain border reads as a sticker. */
.ohg-rwmBevel{position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  box-shadow:inset 1.5px 1.5px 0 rgba(255,255,255,.34),
             inset -1.5px -1.5px 0 rgba(0,0,0,.42),
             inset 0 0 0 1px rgba(var(--ohg-rwmArgb),.18),
             inset 0 22px 44px -26px rgba(255,255,255,.5)}
/* Specular sweep across the glass. */
/* Taller than the panel on purpose: at 70% height its lower edge cut a hard
   horizontal line across the glass, which read as a rendering artefact rather
   than as light. */
.ohg-rwmSheen{position:absolute;top:-40%;height:180%;width:46%;left:-60%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent);
  transform:skewX(-16deg);pointer-events:none}
.ohg-rwmSpinning .ohg-rwmSheen{animation:ohgRwmSheen 6.5s ease-in-out infinite}
@keyframes ohgRwmSheen{0%{left:-60%}45%,100%{left:150%}}

.ohg-rwmArt{position:relative;width:min(150px,42vw);aspect-ratio:1;
  display:grid;place-items:center;margin:2px 0 14px;
  filter:drop-shadow(0 10px 24px rgba(0,0,0,.55))
         drop-shadow(0 0 26px rgba(var(--ohg-rwmArgb),.35))}
.ohg-rwmArt img,.ohg-rwmBadge{width:100%;height:100%;object-fit:contain;display:block}
.ohg-layer.on .ohg-rwmArt{animation:ohgRwmPop .7s cubic-bezier(.2,1.5,.4,1) both}
@keyframes ohgRwmPop{0%{opacity:0;transform:scale(.55)}100%{opacity:1;transform:none}}


.ohg-rwmKicker{position:relative;font-size:11.5px;font-weight:800;letter-spacing:.34em;
  text-indent:.34em;text-transform:uppercase;color:var(--ohg-rwmA);margin-bottom:8px}
.ohg-rwmTitle{position:relative;margin:0 0 10px;text-align:center;
  font-size:clamp(21px,5.6vw,26px);font-weight:800;letter-spacing:-.01em;color:#fff;
  line-height:1.2}
.ohg-rwmBody{position:relative;margin:0 0 20px;text-align:center;font-size:14px;
  line-height:1.6;color:#c2cddb;max-width:30ch}
.ohg-rwmReplay,.ohg-rwmClaim,.ohg-rwmLounge,.ohg-rwmClose{position:relative}
/* \u2500\u2500 Three destinations, three colours \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Replay keeps the panel accent, Claim takes its own pale blue, Lounge takes
   the lounge pink \u2014 the same colour that row wears in the menu, so it reads
   as the same place. Only Claim is filled: it's still the commercial action,
   and outlining the other two keeps the hierarchy intact now there are three
   of them rather than one. */
.ohg-btn.ohg-claim.ohg-rwmClaim{
  color:var(--ohg-rwmClaimOn,#04121b);
  background:linear-gradient(135deg,
    var(--ohg-rwmClaimLight,#b6e4fe) 0%,
    rgb(var(--ohg-rwmClaimRgb,140,209,250)) 52%,
    var(--ohg-rwmClaimDeep,#79b4d8) 100%);
  box-shadow:0 0 0 1px rgba(255,255,255,.4) inset,
             0 8px 26px -6px rgba(var(--ohg-rwmClaimRgb,140,209,250),.75),
             0 0 34px -8px rgba(var(--ohg-rwmClaimRgb,140,209,250),.6);
  animation:ohgRwmClaimPulse 2.8s ease-in-out infinite}
.ohg-btn.ohg-claim.ohg-rwmClaim:hover:not(:disabled){
  color:var(--ohg-rwmClaimOn,#04121b);filter:brightness(1.06)}
/* The sheen is a white band. On a pale fill it is invisible at .55 and, more
   to the point, the label here is DARK \u2014 so the band has to be dimmed or it
   washes out the one thing that has to stay readable. */
.ohg-rwmClaim .ohg-claimGlow{
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.3),transparent)}
@keyframes ohgRwmClaimPulse{
  0%,100%{box-shadow:0 0 0 1px rgba(255,255,255,.4) inset,
                     0 8px 26px -6px rgba(var(--ohg-rwmClaimRgb,140,209,250),.75),
                     0 0 34px -8px rgba(var(--ohg-rwmClaimRgb,140,209,250),.6)}
  50%    {box-shadow:0 0 0 1px rgba(255,255,255,.62) inset,
                     0 8px 30px -4px rgba(var(--ohg-rwmClaimRgb,140,209,250),.95),
                     0 0 52px -6px rgba(var(--ohg-rwmClaimRgb,140,209,250),.8)}}
.ohg-rwmLounge{margin-top:2px;color:#fff;font-weight:700;
  background:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.16);
  border-color:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.58);
  box-shadow:0 0 16px -4px rgba(var(--ohg-rwmLoungeRgb,255,92,180),.5),
             inset 0 1px 0 rgba(255,255,255,.12)}
.ohg-rwmLounge:hover:not(:disabled){
  background:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.26);
  border-color:rgba(var(--ohg-rwmLoungeRgb,255,92,180),.88)}
.ohg-rwmClose{margin-top:2px}
/* Replay and Lounge sit ABOVE Claim, so they have to read as real, pressable
   choices without stealing the emphasis: outlines in their own accents, next
   to a ghost dismiss row. Claim keeps the only filled gradient on the sheet
   and sits last, which is both the end of the list and the strongest
   treatment on it. */
.ohg-rwmReplay{margin-top:2px;color:#fff;font-weight:700;
  background:rgba(var(--ohg-rwmArgb),.14);
  border-color:rgba(var(--ohg-rwmArgb),.55);
  box-shadow:0 0 16px -4px rgba(var(--ohg-rwmArgb),.5),
             inset 0 1px 0 rgba(255,255,255,.12)}
.ohg-rwmReplay:hover:not(:disabled){background:rgba(var(--ohg-rwmArgb),.24);
  border-color:rgba(var(--ohg-rwmArgb),.85)}

@media (max-height:520px){
  .ohg-rwmGlass{padding:18px 20px 14px}
  .ohg-rwmArt{width:min(96px,26vw);margin-bottom:10px}
  .ohg-rwmBody{margin-bottom:14px;font-size:13px}
}
/* A landscape phone is ~356px of usable panel, and this sheet now carries a
   third row. Before Replay it fitted by luck: the content already overflowed
   and the dismiss row happened to land on the last visible pixels. Adding a
   row pushed it under the fold, and a dismiss control you have to scroll a
   glass panel to find \u2014 over a live camera feed \u2014 is the trap the rest of
   this file keeps warning about.
   So the panel is made to FIT at this height rather than to scroll: the
   medallion is decoration and gives up the most space, the copy tightens, and
   the rows keep a 44px target because that is not negotiable. */
@media (max-height:430px){
  .ohg-rwmGlass{padding:12px 18px 10px}
  .ohg-rwmArt{width:min(58px,16vw);margin-bottom:4px}
  .ohg-rwmKicker{font-size:10px;letter-spacing:.26em;margin-bottom:4px}
  .ohg-rwmTitle{font-size:19px;margin-bottom:5px}
  .ohg-rwmBody{margin-bottom:8px;font-size:12.5px;line-height:1.4}
  .ohg-rwmReplay,.ohg-rwmClaim,.ohg-rwmLounge,.ohg-rwmClose{
    min-height:44px;padding:10px 16px;margin-top:1px;font-size:14px}
}
/* Respect the OS setting: keep the panel, drop the moving light. */
@media (prefers-reduced-motion:reduce){
  .ohg-rwmSpinning .ohg-rwmSpin,.ohg-rwmSpinning .ohg-rwmSheen,
  .ohg-layer.on .ohg-rwmArt{animation:none}
}
/* @end rwmodal */

/* @section instructions */
/* \u2500\u2500 How to claim: a numbered list that carries screenshots \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   The images are the whole point of this panel, so the sheet is wider than
   the others and scrolls internally \u2014 a step you have to scroll the PAGE to
   reach is a step people miss. */
/* .ohg-modal carries no padding of its own \u2014 each sheet sets its own, and a
   sheet that forgets puts its text 1px from the border. The menu's 24/22 is
   the house measure; this one keeps it and tightens on a short screen. */
.ohg-ins{position:relative;width:min(460px,calc(100% - 28px));
  max-height:calc(100% - 32px);padding:22px 20px 18px;overflow:hidden;
  display:flex;flex-direction:column;text-align:left;
  background:linear-gradient(180deg,#171a20 0%,#101318 100%)}
.ohg-insTitle{font-size:20px;font-weight:800;margin:0 0 14px;color:#fff;
  letter-spacing:-.01em;position:relative;z-index:1}
.ohg-steps{list-style:none;margin:0 0 16px;padding:0;overflow-y:auto;
  -webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:16px;
  position:relative;z-index:1}
.ohg-step{display:flex;gap:12px;align-items:flex-start}
/* The number is the spine of the list \u2014 fixed width so every step's text
   starts on the same line however many steps there are. */
.ohg-stepNum{flex:0 0 26px;width:26px;height:26px;border-radius:50%;
  display:grid;place-items:center;font-size:13px;font-weight:800;
  color:#04121a;background:var(--ohg-accent);
  box-shadow:0 0 12px rgba(var(--ohg-accentRgb),.45)}
.ohg-stepBody{flex:1 1 auto;min-width:0}
.ohg-stepText{margin:2px 0 0;font-size:14px;line-height:1.55;color:#cfd6e2}
.ohg-stepImg{display:block;width:100%;height:auto;margin-top:10px;
  border-radius:10px;border:1px solid #2a2f38;background:#0d1014}
.ohg-stepLink{display:inline-block;margin-top:9px;padding:9px 14px;
  border-radius:10px;font-size:13.5px;font-weight:700;color:#fff;
  text-decoration:none;background:rgba(var(--ohg-accentRgb),.16);
  border:1px solid rgba(var(--ohg-accentRgb),.5);min-height:40px;line-height:22px}
.ohg-stepLink:hover{background:rgba(var(--ohg-accentRgb),.26)}
/* The code is a button because it copies. Monospace so O and 0 can be told
   apart \u2014 this one gets retyped into another app by hand. */
.ohg-stepCode{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:13.5px;font-weight:700;letter-spacing:.04em;color:#fff;
  background:rgba(255,255,255,.07);border:1px dashed #4b5563;
  border-radius:7px;padding:3px 8px;cursor:pointer;white-space:nowrap}
.ohg-stepCode:hover{background:rgba(255,255,255,.13);border-color:var(--ohg-accent)}
.ohg-stepCode.ohg-copied{color:#7ff0b8;border-color:#7ff0b8;border-style:solid}
/* In the reward panel the steps sit in a centred column, so they get their
   own alignment back and the sheet widens to hold the screenshots. */
.ohg-rwmSteps{text-align:left;margin:4px 0 14px;width:100%}
.ohg-layer.ohg-rwmWide .ohg-rwmShell{width:min(460px,calc(100% - 26px))}
/* The screenshot is a button so it can be focused and pressed. It carries no
   button chrome of its own \u2014 the image IS the affordance \u2014 but it does get a
   focus ring, because an invisible focus stop is worse than no focus stop. */
.ohg-shot{display:block;width:100%;padding:0;margin:0;border:0;background:none;
  position:relative;cursor:zoom-in;border-radius:10px;-webkit-tap-highlight-color:transparent}
.ohg-shot:focus-visible{outline:2px solid var(--ohg-accent);outline-offset:3px}
.ohg-shot .ohg-stepImg{transition:border-color .16s ease,transform .16s ease}
.ohg-shot:hover .ohg-stepImg{border-color:rgba(var(--ohg-accentRgb),.75)}
/* A magnifier in the corner, because "this image is tappable" is not
   something a still picture communicates on a phone. Small, dark and out of
   the way \u2014 it sits over a screenshot, not over content anyone is reading. */
.ohg-shotHint{position:absolute;right:8px;bottom:8px;width:30px;height:30px;
  border-radius:9px;display:grid;place-items:center;color:#fff;pointer-events:none;
  background:rgba(8,12,18,.72);border:1px solid rgba(255,255,255,.22);
  box-shadow:0 2px 10px rgba(0,0,0,.4)}
.ohg-shotHint svg{width:16px;height:16px}
@media (prefers-reduced-motion:reduce){.ohg-shot .ohg-stepImg{transition:none}}
@media (max-height:430px){
  .ohg-ins{padding:16px 16px 14px}
  .ohg-insTitle{font-size:17px;margin-bottom:10px}
  .ohg-steps{gap:12px}
  .ohg-stepImg{margin-top:7px}
}
/* @end instructions */

/* @section lightbox */
/* \u2500\u2500 The image viewer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Opens at fit, one tap goes to 2\xD7, and the frame scrolls at 2\xD7 so panning
   is the platform's own scrolling rather than drag maths of ours. */
.ohg-lightLayer .ohg-lightScrim{background:rgba(2,5,9,.9)}
.ohg-lightBox{position:absolute;inset:0;display:flex;
  align-items:center;justify-content:center;padding:0}
/* The frame is the viewport onto the image. At fit it clips nothing; zoomed,
   it becomes the scroll container. */
/* Flex, not grid. A max-height of 100% on a GRID item resolves against its row,
   and an auto-sized row is indefinite, so the percentage is dropped and a
   landscape phone gets a 455px-tall image in a 366px frame. A flex item's
   percentage resolves against the container, whose height is definite here
   because the insets give it one. Caught on the 844x390 viewport. */
.ohg-lightFrame{position:absolute;inset:calc(12px + env(safe-area-inset-top)) 12px
  calc(12px + env(safe-area-inset-bottom));
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.ohg-lightImg{display:block;flex:0 0 auto;max-width:100%;max-height:100%;
  width:auto;height:auto;object-fit:contain;cursor:zoom-in;
  border-radius:12px;background:#0d1014;
  box-shadow:0 24px 70px -18px rgba(0,0,0,.9)}
/* Zoomed: the image stops fitting and starts overflowing, which is what makes
   the frame scrollable. place-items goes to start so the top-left of an
   overflowing image isn't centred out of reach of the scroll range. */
.ohg-lightLayer.ohg-zoomed .ohg-lightFrame{overflow:auto;
  align-items:flex-start;justify-content:flex-start}
/* margin:auto rather than centring the flex line. Centring an item that
   overflows its scroll container makes the leading edge unreachable \u2014 you can
   scroll right but never back to the left of the image. Auto margins centre it
   only in the axis where there IS room, so a wide screenshot pans all the way
   and a short one still sits mid-screen instead of pinned to the top with a
   gap under it. */
.ohg-lightLayer.ohg-zoomed .ohg-lightImg{max-width:none;max-height:none;
  width:200%;height:auto;margin:auto;cursor:zoom-out;border-radius:0}
.ohg-lightLayer.ohg-zoomed .ohg-lightPlus{display:none}
.ohg-lightLayer:not(.ohg-zoomed) .ohg-lightMinus{display:none}
/* The controls float over the image rather than reserving a strip, so the
   picture gets the whole screen. Both are 44px targets. */
.ohg-lightBar{position:absolute;top:calc(10px + env(safe-area-inset-top));
  right:calc(10px + env(safe-area-inset-right));display:flex;gap:8px;z-index:2}
.ohg-lightZoom,.ohg-lightX{width:44px;height:44px;padding:11px;border-radius:12px;
  display:grid;place-items:center;cursor:pointer;color:#e8ecf2;
  background:rgba(10,14,20,.78);border:1px solid rgba(255,255,255,.2);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.ohg-lightZoom:hover,.ohg-lightX:hover{background:rgba(255,255,255,.14);color:#fff;
  border-color:var(--ohg-accent)}
.ohg-lightZoom:focus-visible,.ohg-lightX:focus-visible{
  outline:2px solid var(--ohg-accent);outline-offset:2px}
.ohg-lightZoom svg,.ohg-lightX svg{width:20px;height:20px}
/* @end lightbox */

/* @section timeout */
/* The timeout panel reuses the reward panel's shell wholesale and only
   re-tints it, so everything already proven about that glass \u2014 the 4.5:1
   contrast with the sheen sweeping across, the 44px touch targets, fitting a
   landscape phone \u2014 holds here for free. This block is only what differs. */
.ohg-toArt{width:74px;height:74px;margin:2px 0 12px;display:grid;place-items:center;
  border-radius:50%;color:var(--ohg-rwmA);
  background:radial-gradient(circle at 50% 40%,rgba(var(--ohg-rwmArgb),.26),
    rgba(var(--ohg-rwmArgb),.05) 70%,transparent);
  filter:drop-shadow(0 0 18px rgba(var(--ohg-rwmArgb),.4))}
.ohg-toArt svg{width:40px;height:40px}
.ohg-layer.on .ohg-toArt{animation:ohgRwmPop .7s cubic-bezier(.2,1.5,.4,1) both}
/* Two real choices, so the second one is a visible button rather than the
   near-invisible dismissal a ghost usually means. */
.ohg-toLayer .ohg-btn.ohg-ghost{background:rgba(255,255,255,.05);
  border-color:#39414e;font-size:14px}
.ohg-toLayer .ohg-btn.ohg-ghost:hover:not(:disabled){border-color:var(--ohg-rwmA);
  background:rgba(255,255,255,.09)}
@media (max-height:430px){
  .ohg-toArt{width:52px;height:52px;margin:0 0 8px}
  .ohg-toArt svg{width:29px;height:29px}
}
/* @end timeout */

/* @section lounge */
/* \u2500\u2500 lounge mode \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Bottom-centre, between the mute (bottom-left) and reset (bottom-right)
   controls. The row wraps rather than overflowing, because four actions plus
   captions do not fit across a 360px phone in one line. */
/* The row is lifted clear of the corner controls, so it can use most of the
   width. It was capped at 100vw-150px to squeeze between the mute and reset
   buttons, which made three actions wrap on a phone for no reason. */
.ohg-loungeBar{display:flex;flex-direction:column;align-items:center;gap:10px;
  pointer-events:none;max-width:min(520px,calc(100vw - 32px))}
/* width:max-content matters. The bar is a shrink-to-fit column, so without it
   the row inherits the width of the widest OTHER child \u2014 the exit pill \u2014 and
   wraps to fit that rather than to fit the screen. Three buttons were stacking
   2+1 inside a 167px column on a 390px phone. */
.ohg-loungeRow{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 18px;
  width:max-content;max-width:100%;pointer-events:none}
.ohg-loungeItem{display:flex;flex-direction:column;align-items:center;gap:7px;
  pointer-events:none}
/* Reuses the Reset control's circular button, so the two read as one family. */
.ohg-loungeBtn{width:58px;height:58px}
.ohg-loungeBtn svg{width:27px;height:27px}
.ohg-loungeBtn .ohg-rwOrb{width:26px;height:26px}
.ohg-loungeExit{pointer-events:auto!important;cursor:pointer;
  padding:7px 15px;border-radius:999px;font:600 12.5px/1 inherit;letter-spacing:.02em;
  color:#fff;background:rgba(20,22,26,.82);
  border:1px solid rgba(var(--ohg-accentRgb),.3);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:border-color .18s,transform .18s}
.ohg-loungeExit:hover{border-color:var(--ohg-accent);transform:translateY(-1px)}
/* Lift the whole row off the bottom edge. A percentage in the bottom property
   resolves against the overlay's HEIGHT, which is what we want; a percentage
   in margin-bottom would resolve against its WIDTH. Overriding the alignment
   class needs !important, and the safe-area var is Mattercraft's, not env(),
   which WebXR Chrome doesn't set correctly.
   The default clears an on-screen joystick \u2014 the row used to sit in the same
   band as the thumbstick, so in the real game you'd drag the stick and hit
   "Sleep". */
.ohg-loungeAnchor{
  bottom:calc(var(--safe-area-inset-bottom, 0px) + var(--ohg-loungeLift, 30%))!important}
/* Floor it in pixels on a narrow screen: at a small percentage the row would
   still land on the mute and reset controls, and a wrapped second row needs
   more clearance than a single one. */
@media (max-width:560px){
  /* 96px is the Reset control's full height \u2014 a 54px button plus its caption
     plus the anchor padding \u2014 so even a lift of 0 stays off it. */
  .ohg-loungeAnchor{
    bottom:calc(var(--safe-area-inset-bottom, 0px) + max(var(--ohg-loungeLift, 30%), 96px))!important}
}
@media (max-width:420px){
  .ohg-loungeRow{gap:10px 12px}
  .ohg-loungeBtn{width:50px;height:50px}
  .ohg-loungeBtn svg{width:23px;height:23px}
}
/* @end lounge */

/* \u2500\u2500 quick mute \u2500\u2500 */
.ohg-mute{pointer-events:auto!important;width:46px;height:46px;border-radius:14px;cursor:pointer;padding:0;
  display:grid;place-items:center;color:var(--ohg-accent);
  border:1px solid rgba(var(--ohg-accentRgb),.28);background:rgba(20,22,26,.82);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  transition:transform .18s,border-color .18s,color .18s}
.ohg-mute:hover{transform:scale(1.06);border-color:var(--ohg-accent)}
.ohg-mute svg{width:21px;height:21px;grid-area:1/1}
.ohg-mute .ohg-off{display:none}
.ohg-mute.ohg-muted{color:#8a93a3}
.ohg-mute.ohg-muted .ohg-on{display:none}
.ohg-mute.ohg-muted .ohg-off{display:block}
.ohg-legNum{font-size:13px;font-weight:700;color:var(--ohg-accent);font-variant-numeric:tabular-nums}

/* @section reward */
/* \u2500\u2500 digital-exclusive celebration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Never interactive. pointer-events:none!important beats core CSS's
   #zcomponent-overlay > * {pointer-events:auto}, which no class selector
   can outrank \u2014 without it this full-bleed layer would swallow every tap on
   the AR view for as long as it's mounted, visible or not.                 */
.ohg-rwLayer{--ohg-rwA:#6ff2ff;--ohg-rwB:#a07bff;--ohg-rwIc:#eafcff;
  --ohg-rwArgb:111,242,255;--ohg-rwBrgb:160,123,255;
  position:absolute;left:0;top:0;width:100%;height:100%;
  pointer-events:none!important;overflow:hidden;
  font:500 13px/1.4 ui-sans-serif,-apple-system,"SF Pro Text",Inter,Segoe UI,Roboto,sans-serif}
.ohg-noAnim,.ohg-noAnim *{transition:none!important;animation:none!important}

/* ---- wordmark ---- */
.ohg-rwWord{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:10px;padding:0 18px;
  opacity:0;visibility:hidden;transition:opacity .45s ease, visibility 0s .45s}
.ohg-rwWord.on{opacity:1;visibility:visible;transition:opacity .38s ease}
/* Light behind the type. Sized in vmax so it fills the frame in either
   orientation instead of leaving a visible disc edge in landscape. */
.ohg-rwRays{position:absolute;width:150vmax;height:150vmax;border-radius:50%;
  background:radial-gradient(circle,
    rgba(var(--ohg-rwArgb),.26) 0%,
    rgba(var(--ohg-rwBrgb),.12) 26%,transparent 58%);
  opacity:0;transform:scale(.4)}
.ohg-rwWord.on .ohg-rwRays{animation:ohgRwRays 1.5s cubic-bezier(.16,.84,.32,1) forwards}
@keyframes ohgRwRays{0%{opacity:0;transform:scale(.35)}
  22%{opacity:1}100%{opacity:.5;transform:scale(1)}}
.ohg-rwEmblem{position:relative;color:var(--ohg-rwIc);
  filter:drop-shadow(0 0 16px rgba(var(--ohg-rwArgb),.7))}
.ohg-rwEmblem svg{width:clamp(38px,8vmin,58px);height:clamp(38px,8vmin,58px);display:block}
.ohg-rwWord.on .ohg-rwEmblem{animation:ohgRwPop .7s cubic-bezier(.2,1.5,.4,1) both}
@keyframes ohgRwPop{0%{opacity:0;transform:scale(.3) rotate(-16deg)}
  100%{opacity:1;transform:scale(1) rotate(0)}}
.ohg-rwOrb{display:block;width:clamp(38px,8vmin,58px);height:clamp(38px,8vmin,58px);border-radius:50%;
  background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ohg-accentRgb)) 38%,rgba(var(--ohg-accentRgb),.45) 74%,#06121a 100%);
  box-shadow:0 0 26px 6px rgba(var(--ohg-accentRgb),.5)}
.ohg-rwKicker{position:relative;font-size:clamp(11px,2.4vmin,14px);font-weight:800;
  letter-spacing:.42em;text-indent:.42em;text-transform:uppercase;color:var(--ohg-rwIc);
  opacity:.92;text-shadow:0 2px 14px rgba(0,0,0,.7)}
.ohg-rwWord.on .ohg-rwKicker{animation:ohgRwUp .6s cubic-bezier(.16,.84,.32,1) .08s both}

/* The plate is what stops a bright gradient wordmark from disappearing into
   a bright camera feed \u2014 the reference frame does the same thing. */
.ohg-rwPlate{position:relative;overflow:hidden;max-width:100%;
  padding:.16em .4em .2em;border-radius:14px;
  background:linear-gradient(180deg,rgba(12,13,17,.9),rgba(12,13,17,.82));
  box-shadow:0 18px 60px rgba(0,0,0,.6)}
.ohg-rwWord.on .ohg-rwPlate{animation:ohgRwUp .62s cubic-bezier(.16,.84,.32,1) .12s both}
.ohg-rwTitle{font-size:calc(clamp(26px,10.5vw,84px) * var(--ohg-rwScale,1));
  line-height:1;font-weight:900;letter-spacing:.03em;white-space:nowrap;
  background:linear-gradient(180deg,var(--ohg-rwA) 4%,var(--ohg-rwB) 96%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  -webkit-text-fill-color:transparent}
/* Sweep is masked by the plate's overflow, so it reads as light crossing the
   letters rather than a bar flying over the screen. */
.ohg-rwSweep{display:none;position:absolute;top:-40%;bottom:-40%;width:30%;left:-40%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);
  transform:skewX(-16deg);mix-blend-mode:overlay}
.ohg-electric .ohg-rwWord.on .ohg-rwSweep{display:block;
  animation:ohgRwSweep 1.15s cubic-bezier(.4,0,.25,1) .34s 2}
@keyframes ohgRwSweep{0%{left:-40%}100%{left:120%}}
.ohg-rwMsg{position:relative;max-width:min(520px,88%);text-align:center;
  font-size:clamp(13px,2.9vmin,17px);font-weight:600;color:#e8ecf2;
  text-shadow:0 2px 14px rgba(0,0,0,.85)}
.ohg-rwWord.on .ohg-rwMsg{animation:ohgRwUp .6s cubic-bezier(.16,.84,.32,1) .2s both}
@keyframes ohgRwUp{0%{opacity:0;transform:translateY(14px)}100%{opacity:1;transform:none}}

/* Filaments. Each i element is a hairline rotated around the centre and flung
   outward; staggered so they read as a discharge, not a starburst frame. */
.ohg-rwArcs{display:none;position:absolute;left:50%;top:50%;width:0;height:0}
.ohg-electric .ohg-rwWord.on .ohg-rwArcs{display:block}
.ohg-rwArcs i{position:absolute;left:0;top:0;width:2px;height:clamp(40px,9vmin,80px);
  margin-left:-1px;border-radius:2px;transform-origin:50% 0;opacity:0;
  background:linear-gradient(180deg,var(--ohg-rwA),transparent);
  filter:drop-shadow(0 0 6px var(--ohg-rwA))}
.ohg-electric .ohg-rwWord.on .ohg-rwArcs i{animation:ohgRwArc .9s ease-out both}
.ohg-rwArcs i:nth-child(1){transform:rotate(18deg)  translateY(6vmin);animation-delay:.30s}
.ohg-rwArcs i:nth-child(2){transform:rotate(74deg)  translateY(7vmin);animation-delay:.38s}
.ohg-rwArcs i:nth-child(3){transform:rotate(131deg) translateY(6vmin);animation-delay:.34s}
.ohg-rwArcs i:nth-child(4){transform:rotate(206deg) translateY(7vmin);animation-delay:.44s}
.ohg-rwArcs i:nth-child(5){transform:rotate(258deg) translateY(6vmin);animation-delay:.36s}
.ohg-rwArcs i:nth-child(6){transform:rotate(322deg) translateY(7vmin);animation-delay:.42s}
@keyframes ohgRwArc{0%{opacity:0;scale:1 .2}
  30%{opacity:1;scale:1 1}100%{opacity:0;scale:1 1.5}}

/* ---- achievement badge ----
   Bottom-centre, clear of the mute (bottom-left) and reset (bottom-right)
   buttons, and clear of the timer at top-centre. */
.ohg-rwBadge{position:absolute;left:50%;
  /* 104px clears the Reset control, which is a 54px button plus its caption
     \u2014 measuring only the button leaves the badge sitting on the label.
     --ohg-rwLift is the lounge bar's measured height when that's on screen. */
  bottom:calc(var(--safe-area-inset-bottom, 0px) + 104px + var(--ohg-rwLift, 0px));
  width:min(430px,calc(100% - 28px));display:flex;align-items:center;gap:13px;
  padding:11px 20px 11px 11px;border-radius:999px;
  transform:translate(-50%,26px);opacity:0;visibility:hidden;
  transition:opacity .34s ease, transform .44s cubic-bezier(.16,.84,.32,1), visibility 0s .44s;
  /* Two layers, not color-mix: the tint rides on an OPAQUE base so the pill
     still paints on WebViews without color-mix support. Content sits on this
     surface, so a transparent fallback would be unreadable, not just off-hue. */
  background:
    linear-gradient(135deg,rgba(var(--ohg-rwArgb),.22) 0%,transparent 58%,
                    rgba(var(--ohg-rwBrgb),.24) 100%),
    linear-gradient(rgba(14,16,20,.94),rgba(14,16,20,.94));
  border:1px solid rgba(var(--ohg-rwArgb),.42);
  box-shadow:0 14px 44px rgba(0,0,0,.6),
             0 0 42px -10px rgba(var(--ohg-rwArgb),.8);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.ohg-rwBadge.on{opacity:1;visibility:visible;transform:translate(-50%,0);
  transition:opacity .3s ease, transform .5s cubic-bezier(.16,.84,.32,1)}
.ohg-rwBadgeIc{width:46px;height:46px;border-radius:50%;flex:0 0 auto;
  display:grid;place-items:center;color:var(--ohg-rwIc);
  background:radial-gradient(circle at 34% 30%,rgba(255,255,255,.92) 0%,
    var(--ohg-rwA) 42%,var(--ohg-rwB) 100%);
  box-shadow:0 0 20px -2px rgba(var(--ohg-rwArgb),.85)}
.ohg-rwBadgeIc svg{width:25px;height:25px}
.ohg-rwBadgeIc .ohg-rwOrb{width:30px;height:30px;box-shadow:none}
.ohg-electric .ohg-rwBadge.on .ohg-rwBadgeIc{animation:ohgRwSpark 1.8s ease-in-out 2}
@keyframes ohgRwSpark{0%,100%{box-shadow:0 0 20px -2px rgba(var(--ohg-rwArgb),.85)}
  50%{box-shadow:0 0 34px 2px rgba(var(--ohg-rwArgb),.95)}}
.ohg-rwBadgeTxt{display:flex;flex-direction:column;gap:2px;min-width:0}
.ohg-rwBadgeTitle{font-size:14px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:#f2f7ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ohg-rwBadgeSub{font-size:12.5px;font-weight:500;color:#b8c3d2;line-height:1.35}
/* @end reward */

/* HUD ducked behind the wordmark. Not display:none \u2014 it fades, and it has to
   come back if the player restarts. */
.ohg-anchor.ohg-ducked{opacity:0}

/* Short viewport (landscape phones): the vertical stack has nowhere to go, so
   drop the emblem, tighten the type and lift the badge. */
@media (max-height:480px){
  .ohg-rwWord{gap:6px}
  .ohg-rwEmblem{display:none}
  .ohg-rwTitle{font-size:calc(clamp(22px,7.4vw,52px) * var(--ohg-rwScale,1))}
  .ohg-rwKicker{font-size:10px;letter-spacing:.34em;text-indent:.34em}
  /* The badge carries the same line, and at this height the headline plus its
     kicker is the whole story. Keeping both puts text under the badge. */
  .ohg-rwMsg{display:none}
  .ohg-rwBadge{bottom:calc(var(--safe-area-inset-bottom, 0px) + 92px + var(--ohg-rwLift, 0px));
    padding:8px 16px 8px 8px}
  .ohg-rwBadgeIc{width:38px;height:38px}
  .ohg-rwBadgeIc svg{width:21px;height:21px}
}

/* Respect the OS setting: keep the reveal, drop the motion. */
@media (prefers-reduced-motion:reduce){
  .ohg-rwWord.on .ohg-rwRays,.ohg-rwWord.on .ohg-rwEmblem,.ohg-rwWord.on .ohg-rwKicker,
  .ohg-rwWord.on .ohg-rwPlate,.ohg-rwWord.on .ohg-rwMsg,
  .ohg-electric .ohg-rwWord.on .ohg-rwSweep,
  .ohg-electric .ohg-rwWord.on .ohg-rwArcs i,
  .ohg-electric .ohg-rwBadge.on .ohg-rwBadgeIc,
  .ohg-btn.ohg-claim,.ohg-claimGlow{animation:none}
  .ohg-rwWord.on .ohg-rwRays{opacity:.5;transform:scale(1)}
  .ohg-rwBadge{transition:opacity .3s ease}
}

@media (max-width:520px){
  .ohg-introBody{padding:4px 18px 20px}
  .ohg-h1{font-size:24px}
  .ohg-lead{font-size:13px;margin-bottom:14px}
  .ohg-legend{gap:11px;margin-bottom:18px}
  .ohg-ic{flex-basis:36px;width:36px;height:36px}
  .ohg-val{font-size:22px}
  .ohg-val.ohg-big{font-size:30px}
  .ohg-hudOrb{width:18px;height:18px}
  .ohg-menu{padding:18px}
}
@media (max-height:560px){
  .ohg-hero{aspect-ratio:auto;height:120px}
  .ohg-introBody{margin-top:-18px}
  .ohg-legend{gap:9px}
}
/* Three mode buttons: a shorter hero on laptop-height screens, so all three
   choices are on screen without scrolling the card. */
@media (min-height:561px) and (max-height:940px){
  .ohg-intro.ohg-three .ohg-hero{aspect-ratio:auto;height:clamp(130px,24vh,260px)}
}
`);
var OrbHuntGame = _OrbHuntGame;

// mattercraft/cola-run/CollectorHubMode.ts
import * as THREE4 from "three";
import { GLTFLoader as GLTFLoader2 } from "three/addons/loaders/GLTFLoader.js";

// mattercraft/cola-run/HubCore.ts
import * as THREE3 from "three";
var HIDEOUT_VERSION = "6";
var CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function formatCodeInput(v) {
  let raw = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("BOBO")) raw = raw.slice(4);
  else if ("BOBO".startsWith(raw)) return raw;
  raw = raw.slice(0, 8);
  return "BOBO-" + raw.slice(0, 4) + (raw.length > 4 ? "-" + raw.slice(4) : "");
}
function checkCode(v) {
  let raw = (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.startsWith("BOBO")) raw = raw.slice(4);
  if (!raw) return { ok: false, message: "Enter the code from your card." };
  if (/[01OIL]/.test(raw))
    return {
      ok: false,
      message: "Codes never use 0, 1, O, I or L. Check those characters on your card."
    };
  if (raw.length !== 8)
    return { ok: false, message: "Codes have 8 characters after BOBO, like BOBO-K7RM-9XQC." };
  for (const ch of raw)
    if (!CODE_ALPHABET.includes(ch))
      return { ok: false, message: "That doesn't look like a code." };
  return { ok: true, code: "BOBO-" + raw.slice(0, 4) + "-" + raw.slice(4) };
}
var esc = (s) => String(s ?? "").replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
);
function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1e3);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
var flag = (cc) => /^[A-Z]{2}$/.test(cc || "") ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : "\u{1F310}";
var safeLink = (u) => {
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
};
var store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
    }
  }
};
var clamp01 = (t) => Math.min(1, Math.max(0, t));
var ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
var smooth01 = (t) => t * t * (3 - 2 * t);
var OPEN_YAW = Math.PI / 4;
var UP = new THREE3.Vector3(0, 1, 0);
var backOut = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
function srgb(tex) {
  const T = THREE3;
  if ("colorSpace" in tex && T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  else tex.encoding = 3001;
}
function rgbTriplet(c) {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (h) {
    const x = h[1].length === 3 ? [...h[1]].map((d) => d + d).join("") : h[1];
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)).join(",");
  }
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c.trim());
  return m ? `${m[1]},${m[2]},${m[3]}` : null;
}
var svg = (d) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
var ICON = {
  alerts: svg(
    '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'
  ),
  globe: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  ),
  leaderboard: svg(
    '<path d="M8 21V11M16 21V7M12 21v-6M4 21h16"/><path d="m12 3 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>'
  ),
  colarun: svg(
    '<rect x="2.5" y="7" width="19" height="11" rx="4"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".9"/><circle cx="18" cy="13.8" r=".9"/>'
  ),
  collection: svg('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M12 21 8.5 9 12 3l3.5 6z"/>'),
  shop: svg(
    '<path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>'
  ),
  me: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  power: svg('<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  home: svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>'),
  exit: svg(
    '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l-5-5 5-5M5 12h11"/>'
  ),
  lock: svg(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
  ),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  wifi: svg(
    '<path d="M2 8.8a15 15 0 0 1 20 0M5 12.3a10 10 0 0 1 14 0M8.5 15.8a5 5 0 0 1 7 0"/><path d="M12 19.5h.01"/>'
  ),
  paw: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g fill="currentColor"><ellipse cx="7.4" cy="10.2" rx="1.9" ry="2.4"/><ellipse cx="12" cy="8.7" rx="1.95" ry="2.5"/><ellipse cx="16.6" cy="10.2" rx="1.9" ry="2.4"/><path d="M12 12.8c3.1 0 5.4 2.1 5.4 4.5 0 2-1.8 3.1-3.8 3.1h-3.2c-2 0-3.8-1.1-3.8-3.1 0-2.4 2.3-4.5 5.4-4.5z"/></g></svg>',
  music: svg(
    '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'
  ),
  sound: svg(
    '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'
  ),
  move: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.5 3.5V9h-5.5"/>'),
  help: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8"/><path d="M12 17.2h.01"/>'
  ),
  play: svg('<path d="M8 5.5 18.5 12 8 18.5z"/>'),
  pause: svg('<path d="M9 5.5v13M15 5.5v13"/>'),
  resize: svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  ccw: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.49-6.01"/><path d="M3.5 3.5V9H9"/>'),
  cw: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"/><path d="M20.5 3.5V9H15"/>'),
  trophy: svg(
    '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 13v4M8.5 20.5h7M9.5 17h5"/>'
  ),
  chev: svg('<path d="m9 6 6 6-6 6"/>'),
  external: svg(
    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
  )
};
var APPS = [
  { id: "alerts", name: "Alerts", color: "#ff4fa3", g: ["#ff7ab8", "#c2186a"], w: 420, h: 520 },
  {
    id: "globe",
    name: "Where's Bobo?",
    color: "#36e3ff",
    g: ["#2a5bd7", "#0b1f6b"],
    w: 820,
    h: 560
  },
  {
    id: "leaderboard",
    name: "Leaderboard",
    color: "#ffc42e",
    g: ["#7a3cff", "#2b0d77"],
    w: 460,
    h: 560
  },
  { id: "colarun", name: "Cola Run", color: "#ff5b5b", g: ["#ffd84d", "#ff7a1a"], w: 440, h: 500 },
  {
    id: "collection",
    name: "Digital Collection",
    color: "#9b7bff",
    g: ["#1e2a4f", "#070b1e"],
    w: 980,
    h: 640
  },
  { id: "shop", name: "Shop", color: "#4fe0a5", g: ["#3df0b0", "#078a61"], w: 420, h: 460 },
  { id: "me", name: "Me", color: "#8fb3ff", g: ["#6f8cff", "#2d3fa8"], w: 380, h: 400 }
];
var tileFor = (a, badge = false) => `<span class="mlh-tile" style="--a:${a.g[0]};--b:${a.g[1]}">${ICON3D[a.id]}${badge ? '<span class="mlh-badge" data-badge hidden></span>' : ""}</span>`;
var DEFS = `<svg class="mlh-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="mlhg-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d6e4ff"/></linearGradient>
<linearGradient id="mlhg-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffcf3a"/><stop offset="1" stop-color="#c97d00"/></linearGradient>
<radialGradient id="mlhg-globe" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e9fdff"/><stop offset=".45" stop-color="#5ae8ff"/><stop offset="1" stop-color="#0a6aa8"/></radialGradient>
<linearGradient id="mlhg-can" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a0f1d"/><stop offset=".3" stop-color="#ff4b5c"/><stop offset=".55" stop-color="#ffb3ba"/><stop offset=".75" stop-color="#e3243a"/><stop offset="1" stop-color="#6d0b18"/></linearGradient>
<linearGradient id="mlhg-alu" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f9aad"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#7d889b"/></linearGradient>
<linearGradient id="mlhg-gem1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecff"/><stop offset="1" stop-color="#b79bff"/></linearGradient>
<linearGradient id="mlhg-gem2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a98bff"/><stop offset="1" stop-color="#5a33d6"/></linearGradient>
<linearGradient id="mlhg-bag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b8f5dc"/></linearGradient>
<radialGradient id="mlhg-head" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#b9cdff"/></radialGradient>
</defs></svg>`;
var OS_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="mlhg-mk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5df2ff"/><stop offset="1" stop-color="#ff5fb1"/></linearGradient></defs><path d="M6 9 4 3l7 4h10l7-4-2 6c1.3 1.8 2 4 2 6.4C28 22.4 22.6 28 16 28S4 22.4 4 15.4C4 13 4.7 10.8 6 9z" fill="url(#mlhg-mk)"/><circle cx="11.5" cy="15.5" r="2" fill="#061024"/><circle cx="20.5" cy="15.5" r="2" fill="#061024"/><path d="M14 20.5c1.2 1 2.8 1 4 0" stroke="#061024" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
var g3 = (d) => `<svg viewBox="0 0 48 48" class="g3" aria-hidden="true">${d}</svg>`;
var ICON3D = {
  alerts: g3(
    '<path d="M24 7c-6.6 0-11 5-11 11.5v6.8c0 2-1 3.6-2.6 5L9 31.6c-.9.9-.3 2.4 1 2.4h28c1.3 0 1.9-1.5 1-2.4l-1.4-1.3c-1.6-1.4-2.6-3-2.6-5v-6.8C35 12 30.6 7 24 7z" fill="url(#mlhg-w)"/><path d="M15.5 19c.4-4.4 3.4-8 8.5-8.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".9"/><ellipse cx="24" cy="38.5" rx="4.6" ry="3.4" fill="url(#mlhg-gold)"/><circle cx="35" cy="12" r="5" fill="#ff2d6f" stroke="#fff" stroke-width="2"/>'
  ),
  globe: g3(
    '<circle cx="24" cy="24" r="15" fill="url(#mlhg-globe)"/><path d="M9 24h30M24 9c5 4.5 5 25.5 0 30M24 9c-5 4.5-5 25.5 0 30M12 16h24M12 32h24" stroke="#063a63" stroke-opacity=".45" stroke-width="1.6" fill="none"/><ellipse cx="24" cy="24" rx="22" ry="7" transform="rotate(-20 24 24)" fill="none" stroke="#fff" stroke-width="2" stroke-opacity=".85"/><circle cx="41.5" cy="17.5" r="2.6" fill="#ffd23a"/><path d="M18 13.5c2.5-1.6 5.5-2 8-1.6" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".8"/>'
  ),
  leaderboard: g3(
    '<path d="M15 9h18v9.5c0 5.2-4 9.5-9 9.5s-9-4.3-9-9.5z" fill="url(#mlhg-gold)"/><path d="M15 12H9.5c0 5 2.6 8 6.5 8.6M33 12h5.5c0 5-2.6 8-6.5 8.6" stroke="#ffd85a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M21.5 28h5l1 6h-7z" fill="#e7a300"/><rect x="15" y="34" width="18" height="5.5" rx="2" fill="url(#mlhg-gold)"/><path d="m24 13 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" opacity=".95"/><path d="M18 11.5v6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>'
  ),
  colarun: g3(
    '<ellipse cx="24" cy="39" rx="9.5" ry="3" fill="#000" opacity=".25"/><path d="M14.5 12.5h19v23.5c0 1.9-4.3 3.5-9.5 3.5s-9.5-1.6-9.5-3.5z" fill="url(#mlhg-can)"/><ellipse cx="24" cy="12.5" rx="9.5" ry="3.2" fill="url(#mlhg-alu)"/><ellipse cx="24" cy="12.3" rx="7" ry="2.1" fill="#c9d1de"/><rect x="21.5" y="10.6" width="5" height="2.6" rx="1.3" fill="#7d889b"/><path d="M14.5 20.5c3 1.6 16 1.6 19 0v7c-3 1.6-16 1.6-19 0z" fill="#fff" opacity=".92"/><path d="m21.5 22.3 5 2.2-5 2.2z" fill="#e3243a"/><path d="M17.5 15v19" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".45"/>'
  ),
  collection: g3(
    '<path d="M12 18 18 10h12l6 8-12 21z" fill="url(#mlhg-gem2)"/><path d="M12 18h24L24 39z" fill="url(#mlhg-gem2)"/><path d="M18 10l-6 8h9.5zM30 10l6 8h-9.5zM18 10h12l-3.5 8h-5z" fill="url(#mlhg-gem1)"/><path d="M21.5 18h5L24 39z" fill="#d6c6ff"/><path d="M12 18h9.5L24 39z" fill="#7b55ef"/><path d="M19.5 12.5l-3 4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="37" cy="9" r="1.8" fill="#fff"/><circle cx="10" cy="31" r="1.3" fill="#fff" opacity=".8"/>'
  ),
  shop: g3(
    '<path d="M11 17h26l-1.6 20.5a2.5 2.5 0 0 1-2.5 2.3H15.1a2.5 2.5 0 0 1-2.5-2.3z" fill="url(#mlhg-bag)"/><path d="M11 17h26l-.4 4.5H11.4z" fill="#fff"/><path d="M18 21v-6a6 6 0 0 1 12 0v6" stroke="#0e7a53" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="18" cy="21.5" r="1.8" fill="#0e7a53"/><circle cx="30" cy="21.5" r="1.8" fill="#0e7a53"/><path d="m24 26.5 1.4 2.9 3.2.5-2.3 2.2.5 3.1-2.8-1.5-2.8 1.5.5-3.1-2.3-2.2 3.2-.5z" fill="#14b87d"/>'
  ),
  me: g3(
    '<circle cx="24" cy="18" r="8" fill="url(#mlhg-head)"/><path d="M9.5 39c1.2-7.4 7.2-12 14.5-12s13.3 4.6 14.5 12z" fill="url(#mlhg-head)"/><path d="M19.5 14.5c1.2-1.6 3-2.4 5-2.2" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M16 12.5l-2-5 5 2.5M32 12.5l2-5-5 2.5" fill="#dfe8ff"/>'
  )
};
var KIND_LABEL = {
  drop: "New drop",
  event: "Event",
  reward: "Reward",
  news: "News"
};
var KIND_COLOR = {
  drop: "#ff4fa3",
  event: "#36e3ff",
  reward: "#ffc42e",
  news: "#9b7bff"
};
var ROOM_ITEMS = {
  hub_cola_collectible: {
    title: "Eclipse Cola",
    sub: "Room piece",
    body: "The can that started it all. Every product you activate adds something to this room."
  },
  hub_trophy_colarun: {
    title: "Cola Run trophy",
    sub: "Room piece",
    body: "For the Cola Run regulars. Play a round from Bobo's computer any time.",
    action: "colarun"
  },
  hub_snowglobe_sf: {
    title: "San Francisco snow globe",
    sub: "Where's Bobo? souvenir",
    body: "Bobo was spotted at the Golden Gate. Every city on the globe is a place Bobo has been.",
    action: "globe"
  },
  hub_poster_colarun: {
    title: "Cola Run poster",
    sub: "Room poster",
    body: "Play Cola Run, record a run, and your clip can put your city on the Where's Bobo? globe.",
    action: "colarun"
  },
  hub_poster_bobo: {
    title: "Bobo poster",
    sub: "Room poster",
    body: "Bobo, chilling. As one does."
  },
  hub_window: {
    title: "Eclipse skyline",
    sub: "Window",
    body: "The night outside the can. The moon is always mid-eclipse here."
  },
  hub_sign_evade: {
    title: "EVADE sign",
    sub: "Loft rail",
    body: "Bobo's Hideout is EVADE's room in the MEDIALIFE Collector Hub."
  },
  hub_ladder: {
    title: "Loft ladder",
    sub: "Room piece",
    body: "Up to Bobo's desk and computer. Tap the screen to boot BOBO OS."
  },
  hub_rug: { title: "Bobo's rug", sub: "Room piece", body: "Where Bobo naps between runs." },
  hub_cat_bed: { title: "Bobo's bed", sub: "Room piece", body: "Where Bobo naps between runs." }
};
var ALIAS = {
  hub_alert_light: "hub_computer",
  hub_spawn_pad: "hub_portal",
  hub_keychain_case: "hub_collection",
  hub_keychain: "hub_collection"
};
var SPOT_COLOR = {
  cola: "#2ec5ff",
  red: "#ff3b4e",
  evade: "#ffc42e",
  bobo: "#6f86ff"
};
var SPOT_ICON = {
  pc: svg(
    '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="m8.5 10 2 2 4-4"/>'
  ),
  vault: ICON_GEM(),
  paw: svg(
    '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M12 11.5c-3 0-5.5 3.2-5.5 5.6 0 1.6 1.3 2.4 2.8 2.4 1.1 0 1.7-.6 2.7-.6s1.6.6 2.7.6c1.5 0 2.8-.8 2.8-2.4 0-2.4-2.5-5.6-5.5-5.6z"/>'
  ),
  play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
  globe: svg(
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
  ),
  fizz: svg(
    '<circle cx="9" cy="15" r="4"/><circle cx="16" cy="8" r="2.6"/><circle cx="17" cy="16.5" r="1.6"/><circle cx="8.5" cy="5.5" r="1.3"/>'
  )
};
function ICON_GEM() {
  return svg('<path d="M6 3h12l3 6-9 12L3 9z"/><path d="M3 9h18M12 21 8.5 9 12 3l3.5 6z"/>');
}
var SPOTS = [
  {
    id: "hub_bobo",
    label: "Bobo",
    color: SPOT_COLOR.bobo,
    icon: SPOT_ICON.paw,
    lift: 0.75,
    tour: {
      title: "Meet Bobo",
      body: "This is Bobo's room and he lives here. Tap him any time to say hi.",
      distance: 3
    }
  },
  {
    id: "hub_computer",
    label: "BOBO OS",
    color: SPOT_COLOR.cola,
    icon: SPOT_ICON.pc,
    tour: {
      title: "Bobo's computer",
      body: "BOBO OS has alerts from the EVADE team, the Where's Bobo? globe, the leaderboard and Cola Run. The monitor glows when there's something new.",
      distance: 3.2
    }
  },
  {
    id: "hub_collection",
    label: "Digital Collection",
    color: SPOT_COLOR.evade,
    icon: SPOT_ICON.vault,
    tour: {
      title: "Your Digital Collection",
      body: "Every EVADE piece you own lives in your vault. The ones you don't have yet show as holograms until you activate them.",
      distance: 3.2
    }
  },
  {
    id: "hub_trophy_colarun",
    label: "Cola Run",
    color: SPOT_COLOR.red,
    icon: SPOT_ICON.play,
    lift: 0.6,
    tour: {
      title: "Cola Run",
      body: "Play a round or record a clip from here. Your clips can put your city on the Where's Bobo? globe.",
      distance: 2.9
    }
  },
  {
    id: "hub_snowglobe_sf",
    label: "Where's Bobo?",
    color: SPOT_COLOR.cola,
    icon: SPOT_ICON.globe,
    lift: 0.6,
    tour: {
      title: "Where's Bobo?",
      body: "Every souvenir is a city Bobo has visited. Open the globe to see where fans have spotted him.",
      distance: 2.9
    }
  },
  { id: "hub_cola_lamp", label: "Fizz lamp", color: SPOT_COLOR.red, icon: SPOT_ICON.fizz }
];
var TOUR_INTRO = {
  title: "Welcome to Bobo's Hideout",
  body: "Your room lives inside a giant Eclipse can, and it grows with every EVADE piece you own. Here's a quick look around."
};
var TOUR_OUTRO = {
  title: "You're all set",
  body: "Tap any glowing dot to open it, or use the list button at the top for everything in the room. You can replay this tour from there too."
};
var REVEAL_COMMON = (
  /* glsl */
  `
uniform float uSolid; uniform float uWire; uniform float uGhost; uniform vec3 uOrigin; uniform vec3 uGlow;
uniform float uFloor;
varying vec3 vRevealPos;
float revealNoise(vec3 p) {
  vec3 q = floor(p * 12.0);
  return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}
// The wireframe draws out from the portal...
float revealDist(vec3 p) { return length(p - uOrigin) + (revealNoise(p) - 0.5) * 0.22; }
// ...then the room materialises floor to ceiling behind a glowing scan line.
float solidDist(vec3 p) { return (p.y - uFloor) + (revealNoise(p) - 0.5) * 0.08; }`
);
var REVEAL_VERT = (
  /* glsl */
  `
vec4 revealP = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  revealP = instanceMatrix * revealP;
#endif
vRevealPos = (uRoomInv * modelMatrix * revealP).xyz;`
);
var HOLO_VERT = (
  /* glsl */
  `
uniform mat4 uRoomInv;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = (uRoomInv * wp).y;
  vN = normalize(normalMatrix * normal);
  vec4 mv = viewMatrix * wp;
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
);
var HOLO_FRAG = (
  /* glsl */
  `
uniform float uTime; uniform float uAlpha; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV; varying float vY;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  float scan = 0.55 + 0.45 * sin(vY * 160.0 - uTime * 5.0);
  float flick = 0.88 + 0.12 * sin(uTime * 23.0) * sin(uTime * 7.3);
  float a = (0.16 + 0.7 * f) * scan * flick * uAlpha;
  gl_FragColor = vec4(uColor * (0.55 + 1.1 * f), a);
}`
);
var CARD_VERT = (
  /* glsl */
  `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
);
var CARD_FRAG = (
  /* glsl */
  `
uniform sampler2D uMap; uniform float uTime; uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uMap, vUv);
  float scan = 0.86 + 0.14 * sin(vUv.y * 420.0 - uTime * 9.0);
  float sweep = smoothstep(0.06, 0.0, abs(fract(uTime * 0.35) * 1.4 - 0.2 - vUv.y)) * 0.35;
  float flick = 0.93 + 0.07 * sin(uTime * 31.0);
  vec3 col = c.rgb * scan * flick + vec3(0.21, 0.89, 1.0) * sweep * c.a;
  gl_FragColor = vec4(col, c.a * uAlpha);
}`
);
var BEAM_VERT = (
  /* glsl */
  `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
);
var BEAM_FRAG = (
  /* glsl */
  `
uniform float uTime; uniform float uAlpha;
varying vec2 vUv;
void main() {
  float stripes = 0.55 + 0.45 * sin(vUv.y * 40.0 - uTime * 14.0);
  float edge = 0.35 + 0.65 * pow(abs(sin(vUv.x * 3.14159 * 6.0)), 6.0);
  float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
  gl_FragColor = vec4(vec3(0.21, 0.89, 1.0) * 1.4, 0.24 * stripes * edge * fade * uAlpha);
}`
);
var CSS = (
  /* css */
  `
.mlh{position:absolute;inset:0;z-index:2000100;pointer-events:none!important;font:500 15px/1.5 ui-sans-serif,-apple-system,"SF Pro Text",Inter,"Segoe UI",Roboto,sans-serif;color:#eef3ff;-webkit-font-smoothing:antialiased;--cyan:#36e3ff;--pink:#ff4fa3;--gold:#ffc42e;--panel:rgba(9,14,36,.9);--line:rgba(130,200,255,.2);--muted:#a7b3d6}
.mlh *,.mlh *::before,.mlh *::after{box-sizing:border-box}
.mlh button{font:inherit;color:inherit;cursor:pointer}
.mlh [hidden]{display:none!important}
.mlh-live{pointer-events:auto!important}
.mlh-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.07);color:#eef3ff;font-weight:700;text-decoration:none;white-space:nowrap}
.mlh-btn:hover{background:rgba(255,255,255,.13)}
.mlh-btn:focus-visible,.mlh-icon:focus-visible,.mlh-dock button:focus-visible,.mlh-dicon:focus-visible,.mlh-dot:focus-visible,.mlh-link:focus-visible{outline:2px solid #fff;outline-offset:2px}
.mlh-btn.pri{background:linear-gradient(90deg,var(--cyan),#9af1ff 55%,var(--pink));border:0;color:#041824}
.mlh-btn.pri:hover{filter:brightness(1.06)}
.mlh-btn[disabled],.mlh-btn[aria-disabled="true"]{opacity:.5;pointer-events:none}
.mlh-btn svg{width:18px;height:18px}
.mlh-link{background:none;border:0;padding:6px 2px;color:var(--cyan);font-weight:700;text-decoration:underline;text-underline-offset:3px}
.mlh-icon{width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--panel);display:grid;place-items:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.mlh-icon svg{width:20px;height:20px}
.mlh-kicker{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--cyan)}

/* hud */
.mlh-hud{position:absolute;left:0;right:0;top:0;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 12px + var(--mlh-top,0px)) calc(14px + var(--mlh-hud-r,0px)) 0 calc(14px + var(--mlh-hud-l,0px));pointer-events:none!important;opacity:0;transform:translateY(-8px);transition:opacity .35s,transform .35s}
.mlh-hud.on{opacity:1;transform:none}
.mlh-hud.on>*{pointer-events:auto!important}
.mlh-title{display:flex;align-items:center;gap:10px;padding:8px 14px 8px 10px;border-radius:14px;border:1px solid var(--line);background:var(--panel);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);text-align:left;min-height:44px}
.mlh-title b{display:block;font-size:15px;line-height:1.2}
.mlh-title small{display:block;color:var(--muted);font-size:12px;line-height:1.3}
.mlh-ring{width:30px;height:30px;flex:none}
.mlh-actions{display:flex;gap:8px}
.mlh-prompt{position:absolute;left:50%;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 22px);transform:translate(-50%,10px);display:flex;flex-direction:column;align-items:center;gap:10px;width:min(440px,calc(100% - 32px));text-align:center;opacity:0;transition:opacity .3s,transform .3s;pointer-events:none!important}
.mlh-prompt.on{opacity:1;transform:translate(-50%,0)}
.mlh-prompt.on .mlh-btn{pointer-events:auto!important}
.mlh-prompt p{margin:0;padding:9px 14px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-size:14px;color:#dfe7ff;backdrop-filter:blur(8px)}
.mlh-prompt .mlh-btn.pri{min-height:54px;padding:0 28px;border-radius:999px;font-size:17px;box-shadow:0 0 28px rgba(54,227,255,.4)}
.mlh-skip{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 22px);pointer-events:auto!important;background:var(--panel);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mlh-mode{position:absolute;left:14px;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + var(--mlh-mode-bottom,78px));display:flex;align-items:center;gap:0;height:48px;max-width:48px;padding:3px;overflow:hidden;border-radius:999px;border:1px solid rgba(54,227,255,.42);background:rgba(9,14,36,.8);color:#fff;font-weight:800;font-size:13.5px;text-align:left;white-space:nowrap;box-shadow:0 0 16px rgba(54,227,255,.22);pointer-events:auto!important;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:mlh-pop .4s cubic-bezier(.2,1.6,.4,1);transition:max-width .4s cubic-bezier(.2,1,.3,1),gap .4s,padding .4s}
.mlh-mode i{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--pink));color:#041824}
.mlh-mode i svg{width:21px;height:21px}
.mlh-mode>span{opacity:0;transition:opacity .25s}
.mlh-mode small{display:block;font-size:11px;font-weight:600;color:var(--muted);line-height:1.2}
.mlh-mode.peek,.mlh-mode:focus-visible{max-width:280px;gap:10px;padding-right:16px}
.mlh-mode.peek>span,.mlh-mode:focus-visible>span{opacity:1}
@media (hover:hover){.mlh-mode:hover{max-width:280px;gap:10px;padding-right:16px}.mlh-mode:hover>span{opacity:1}}
.mlh-mode:focus-visible{outline:2px solid #fff;outline-offset:2px}
.mlh-mode.mlh-mode-t{bottom:auto;top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + var(--mlh-mode-top,78px))}
.mlh-mode.mlh-mode-r{left:auto;right:17px;flex-direction:row-reverse;text-align:right}
.mlh-mode.mlh-mode-r.peek,.mlh-mode.mlh-mode-r:focus-visible{padding-right:3px;padding-left:16px}
@media (hover:hover){.mlh-mode.mlh-mode-r:hover{padding-right:3px;padding-left:16px}}
.mlh-toast{position:absolute;left:50%;top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 74px + var(--mlh-top,0px));transform:translate(-50%,-8px);opacity:0;padding:10px 16px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-weight:700;transition:opacity .25s,transform .25s;max-width:calc(100% - 32px);text-align:center;pointer-events:none!important}
.mlh-toast.on{opacity:1;transform:translate(-50%,0)}

/* layers (gate, sheet, collection, os) */
.mlh-layer{position:absolute;inset:0;display:grid;place-items:center;padding:16px;background:rgba(3,6,18,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;visibility:hidden;transition:opacity .22s,visibility 0s .22s;pointer-events:none!important}
.mlh-layer.open{opacity:1;visibility:visible;transition:opacity .22s;pointer-events:auto!important}
.mlh-card{position:relative;width:min(440px,100%);max-height:calc(100% - 8px);overflow:auto;background:linear-gradient(180deg,rgba(16,26,62,.97),rgba(8,13,34,.97));border:1px solid var(--line);border-radius:22px;padding:22px 20px 18px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(54,227,255,.06) inset;transform:translateY(12px) scale(.98);transition:transform .25s}
.mlh-layer.open .mlh-card{transform:none}
.mlh-card h2{margin:4px 40px 6px 0;font-size:22px;line-height:1.2}
.mlh-card p{margin:0 0 12px;color:#cfd8f3;font-size:14.5px}
.mlh-x{position:absolute;right:12px;top:12px;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.05);display:grid;place-items:center}
.mlh-x svg{width:18px;height:18px}
.mlh-field{display:block;margin:12px 0 0}
.mlh-field span{display:block;font-size:13px;font-weight:700;color:#cfd8f3;margin-bottom:6px}
.mlh-field input{width:100%;height:50px;border-radius:12px;border:1px solid rgba(160,200,255,.28);background:rgba(4,8,22,.7);color:#fff;padding:0 14px;font:600 16px/1 inherit;outline:none}
.mlh-field input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(54,227,255,.2)}
.mlh-field input.code{font:700 21px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase}
.mlh-field input[aria-invalid="true"]{border-color:#ff6b8a}
.mlh-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0 0;font-size:13.5px;color:#cfd8f3}
.mlh-check input{width:20px;height:20px;margin:1px 0 0;accent-color:#36e3ff;flex:none}
.mlh-err{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:rgba(255,80,120,.12);border:1px solid rgba(255,107,138,.4);color:#ffd2dc;font-size:14px}
.mlh-help{margin:10px 0 0;padding:12px;border-radius:12px;background:rgba(54,227,255,.07);border:1px solid rgba(54,227,255,.2);font-size:13.5px;color:#d6e6ff}
.mlh-help p{margin:0 0 6px;font-size:13.5px}
.mlh-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:16px}
.mlh-row .mlh-btn.pri{flex:1}
.mlh-test{margin-top:12px;font-size:12.5px;color:var(--muted)}
.mlh-test code{font:700 13px ui-monospace,Menlo,monospace;color:#fff;background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px}
.mlh-ok{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;margin:6px auto 12px;background:linear-gradient(135deg,var(--cyan),var(--pink));color:#041824;animation:mlh-pop .5s cubic-bezier(.2,1.6,.4,1)}
.mlh-ok svg{width:34px;height:34px;stroke-width:3}
.mlh-center{text-align:center}
.mlh-center h2{margin-right:0}
.mlh-keycode{display:inline-block;font:700 20px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;padding:12px 16px;border-radius:12px;background:#16245a;border:1px solid var(--cyan);margin:4px 0 12px}
@keyframes mlh-pop{from{transform:scale(.3);opacity:0}to{transform:none;opacity:1}}

/* item sheet */
.mlh-sheet{place-items:end center;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;padding-bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 16px)}
.mlh-pill{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:rgba(54,227,255,.14);color:#9cf0ff}
.mlh-sub{color:var(--muted);font-size:13.5px;margin:-2px 0 10px}

/* collection */
.mlh-col{width:min(680px,100%)}
.mlh-prog{display:flex;align-items:center;gap:12px;margin:6px 0 16px}
.mlh-bar{flex:1;height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.mlh-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--cyan),var(--pink));transition:width .6s}
.mlh-prog b{font-size:14px;white-space:nowrap}
.mlh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.mlh-slot{position:relative;border-radius:16px;padding:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);min-height:150px;display:flex;flex-direction:column;gap:6px}
.mlh-slot .art{height:70px;border-radius:12px;display:grid;place-items:center;background:radial-gradient(circle at 50% 70%,rgba(54,227,255,.25),transparent 70%);color:var(--cyan)}
.mlh-slot .art svg{width:40px;height:40px}
.mlh-slot b{font-size:14px;line-height:1.25}
.mlh-slot small{color:var(--muted);font-size:12px;line-height:1.35}
.mlh-slot.owned{border-color:rgba(54,227,255,.55);background:linear-gradient(180deg,rgba(54,227,255,.12),rgba(255,79,163,.06))}
.mlh-slot.owned .art{background:radial-gradient(circle at 50% 60%,rgba(255,79,163,.3),transparent 70%);color:#fff}
.mlh-slot.locked .art{opacity:.75;animation:mlh-holo 2.6s ease-in-out infinite}
.mlh-slot .tag{position:absolute;top:10px;right:10px;font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.08);color:var(--muted)}
.mlh-slot.owned .tag{background:var(--cyan);color:#041824}
.mlh-reward{display:flex;gap:14px;align-items:center;margin-top:14px;padding:14px;border-radius:16px;border:1px dashed rgba(255,196,46,.5);background:linear-gradient(90deg,rgba(255,196,46,.1),rgba(255,196,46,.02))}
.mlh-reward .medal{width:54px;height:54px;flex:none;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#fff3c4,#ffc42e 45%,#a86a00);color:#3a2400;font-weight:900;font-size:22px;box-shadow:0 0 24px rgba(255,196,46,.35)}
.mlh-reward.done{border-style:solid}
.mlh-reward b{display:block}
.mlh-reward small{color:#e9dcb4;font-size:13px}
@keyframes mlh-holo{0%,100%{opacity:.55;filter:drop-shadow(0 0 0 rgba(54,227,255,0))}50%{opacity:.95;filter:drop-shadow(0 0 8px rgba(54,227,255,.7))}}

/* Digital Collection vault */
.mlh-vaultcard{width:min(1080px,100%)!important;padding:18px 18px 16px!important}
.mlh-vhead{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-right:44px}
.mlh-vhead h2{margin:2px 0 0!important}
.mlh-vhead .mlh-prog{min-width:220px;flex:0 1 300px;margin:0}
.mlh-vault{position:relative;margin:14px 0 10px;height:min(62vh,600px);border-radius:16px;overflow:hidden;background:#05080b;border:1px solid rgba(54,227,255,.25);box-shadow:0 0 40px -12px rgba(54,227,255,.45)}
.mlh-vnote{font-size:13px!important;color:#aab8d8!important;margin:0 0 10px!important}
.mlh-list summary{cursor:pointer;color:#9fe9ff;font-weight:700;font-size:13.5px;margin-bottom:10px}
.mlh-win .mlh-vwrap{display:flex;flex-direction:column;height:100%}
.mlh-win .mlh-vwrap .mlh-vault{flex:1;margin:0;height:auto;border-radius:0;border:0}
.mlh-win .mlh-vbar{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid rgba(255,255,255,.08);font-size:13px;color:#cfd8f3}
.mlh-win .mlh-vbar .mlh-prog{flex:1;margin:0}
.mlh-win .mlh-vbar .mlh-btn{min-height:36px;padding:0 14px;font-size:13px}

/* BOBO OS v2: glass, depth and light */
.mlh-defs{position:absolute;width:0;height:0;overflow:hidden}
.mlh-layer.mlh-os{padding:0;background:rgba(3,6,18,var(--mlh-os-dim,.18));backdrop-filter:none;-webkit-backdrop-filter:none;--mlh-os-st:0px;--mlh-os-sb:0px}
.mlh-layer.mlh-os.full{--mlh-os-st:var(--safe-area-inset-top,env(safe-area-inset-top,0px));--mlh-os-sb:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))}
.mlh-screen{position:relative;width:min(1600px,calc(100% * var(--mlh-os-size,.8)));height:min(1000px,calc(100% * var(--mlh-os-size,.8)));border-radius:26px;overflow:hidden;isolation:isolate;background:rgba(5,8,23,calc(var(--mlh-os-alpha,.88) * .55));backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);
  box-shadow:0 0 0 1px rgba(140,220,255,.25),0 0 0 8px #070b19,0 0 0 9px rgba(255,255,255,.08),0 0 60px rgba(54,227,255,.18),0 50px 120px rgba(0,0,0,.7);
  transform:perspective(1400px) rotateX(6deg) scale(.94);opacity:0;transition:transform .5s cubic-bezier(.2,1,.25,1),opacity .3s}
.mlh-os.open .mlh-screen{transform:none;opacity:1}
.mlh-screen::after{content:"";position:absolute;inset:0;pointer-events:none;z-index:30;border-radius:inherit;
  background:linear-gradient(180deg,rgba(255,255,255,.06),transparent 18%),repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px);mix-blend-mode:screen}
.mlh-wallp{position:absolute;inset:0;z-index:0;overflow:hidden;opacity:var(--mlh-os-alpha,.88);background:radial-gradient(120% 90% at 50% 120%,#1a0b3a,#060a1d 55%,#03050f)}
.mlh-wallp i{position:absolute;border-radius:50%;filter:blur(60px);opacity:.75;animation:mlh-drift 18s ease-in-out infinite alternate}
.mlh-wallp .a1{width:55%;height:60%;left:-10%;top:-15%;background:radial-gradient(circle,#00d5ff 0%,rgba(0,213,255,0) 70%)}
.mlh-wallp .a2{width:50%;height:55%;right:-12%;bottom:-10%;background:radial-gradient(circle,#ff3fa4 0%,rgba(255,63,164,0) 70%);animation-delay:-6s}
.mlh-wallp .a3{width:40%;height:40%;left:35%;top:25%;background:radial-gradient(circle,#6a3cff 0%,rgba(106,60,255,0) 70%);opacity:.5;animation-delay:-11s}
@keyframes mlh-drift{to{transform:translate(8%,6%) scale(1.15)}}
.mlh-wallp .floor{position:absolute;left:-50%;right:-50%;bottom:-8%;height:55%;transform:perspective(500px) rotateX(62deg);transform-origin:50% 100%;
  background-image:linear-gradient(rgba(54,227,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(54,227,255,.35) 1px,transparent 1px);background-size:56px 56px;
  -webkit-mask-image:linear-gradient(0deg,#000 10%,transparent 85%);mask-image:linear-gradient(0deg,#000 10%,transparent 85%);animation:mlh-floor 6s linear infinite}
@keyframes mlh-floor{to{background-position:0 56px}}
.mlh-wall{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font:900 clamp(70px,13vw,190px)/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;color:transparent;-webkit-text-stroke:1px rgba(140,230,255,.13);pointer-events:none;user-select:none;white-space:nowrap}
.mlh-menubar{position:absolute;left:10px;right:10px;top:10px;height:40px;display:flex;align-items:center;gap:10px;padding:0 8px 0 12px;border-radius:14px;
  background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);font-size:13px;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.mlh-menubar .logo{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.14em;font-size:12.5px;color:#eaf6ff}
.mlh-menubar .logo b{font-weight:900;margin-left:3px;background:linear-gradient(90deg,#5df2ff,#ff5fb1);-webkit-background-clip:text;background-clip:text;color:transparent}
.mlh-menubar .lg-mark svg{width:22px;height:22px;display:block;filter:drop-shadow(0 0 6px rgba(93,242,255,.55))}
.mlh-menubar .app{font-weight:700;color:#cfe0ff;padding-left:10px;border-left:1px solid rgba(255,255,255,.14)}
.mlh-menubar .sp{flex:1}
.mlh-menubar .chip{display:flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;background:rgba(40,200,120,.12);border:1px solid rgba(80,240,160,.3);color:#9ff5c9;font-size:11.5px;font-weight:700;letter-spacing:.04em}
.mlh-menubar .chip i{width:7px;height:7px;border-radius:50%;background:#3dff9a;box-shadow:0 0 8px #3dff9a;animation:mlh-pulse 2s ease-in-out infinite}
@keyframes mlh-pulse{50%{opacity:.35}}
.mlh-menubar .tray{display:flex;align-items:center;gap:6px;color:#dbe6ff;font-variant-numeric:tabular-nums;font-weight:600}
.mlh-menubar .tray svg{width:16px;height:16px}
.mlh-menubar button.tb{position:relative;display:grid;place-items:center;width:34px;height:30px;border-radius:10px;border:0;background:transparent;color:#eef3ff}
.mlh-menubar button.tb:hover{background:rgba(255,255,255,.12)}
.mlh-menubar button.tb svg{width:17px;height:17px}
.mlh-badge{position:absolute;top:-2px;right:-2px;min-width:17px;height:17px;padding:0 4px;border-radius:999px;background:linear-gradient(180deg,#ff5b93,#e0175c);color:#fff;font-size:10.5px;font-weight:800;line-height:17px;text-align:center;box-shadow:0 0 0 2px #0b1027,0 0 10px rgba(255,60,130,.6)}
.mlh-desk{position:absolute;left:0;right:0;top:56px;bottom:0;z-index:2}
.mlh-icons{position:absolute;left:18px;top:18px;display:grid;grid-template-columns:repeat(2,96px);grid-auto-rows:118px;gap:6px 8px;align-content:start}
.mlh-dicon{width:96px;height:116px;border:0;border-radius:18px;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:8px;padding:8px 2px 4px;color:#f1f6ff;font-size:12px;line-height:1.2;font-weight:700;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,.8);transition:background .15s}
.mlh-dicon:hover{background:rgba(255,255,255,.07)}
.mlh-dicon:hover .mlh-tile{transform:translateY(-3px) rotateX(8deg)}
.mlh-tile{position:relative;flex:none;width:58px;height:58px;border-radius:17px;display:grid;place-items:center;color:#fff;
  background:radial-gradient(120% 90% at 30% 15%,rgba(255,255,255,.35),transparent 45%),linear-gradient(160deg,var(--a),var(--b));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -3px 6px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.12),0 10px 18px -6px rgba(0,0,0,.7),0 0 18px -4px var(--a);
  transition:transform .2s cubic-bezier(.2,1,.3,1);transform-style:preserve-3d}
.mlh-tile::after{content:"";position:absolute;left:8%;right:8%;top:4%;height:42%;border-radius:14px 14px 40% 40%;background:linear-gradient(180deg,rgba(255,255,255,.38),rgba(255,255,255,0));pointer-events:none}
.mlh-tile .g3{width:78%;height:78%;filter:drop-shadow(0 3px 3px rgba(0,0,0,.35));position:relative;z-index:1}
.mlh-tile.sm{width:40px;height:40px;border-radius:12px}
.mlh-tile .mlh-badge{top:-6px;right:-6px;z-index:2}
.mlh-widgets{position:absolute;right:18px;top:18px;width:268px;display:grid;gap:12px}
.mlh-wg{position:relative;padding:14px 16px;border-radius:20px;background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.13);backdrop-filter:blur(20px) saturate(1.3);-webkit-backdrop-filter:blur(20px) saturate(1.3);box-shadow:0 14px 30px rgba(0,0,0,.3);text-align:left;color:#eef4ff;width:100%;font:inherit}
button.mlh-wg{cursor:pointer;transition:transform .15s,border-color .15s}
button.mlh-wg:hover{transform:translateY(-2px);border-color:rgba(93,242,255,.45)}
.mlh-wg .k{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#8fe9ff;font-weight:800}
.mlh-wg .big{font:800 40px/1.05 ui-sans-serif,system-ui,sans-serif;letter-spacing:-.02em;font-variant-numeric:tabular-nums;margin-top:4px}
.mlh-wg small{display:block;color:#b8c6e6;font-size:12.5px;margin-top:2px}
.mlh-wg .row{display:flex;align-items:center;gap:12px;margin-top:6px}
.mlh-ring{--p:0;width:58px;height:58px;flex:none;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#5df2ff calc(var(--p)*1%),#ff5fb1 calc(var(--p)*1%),rgba(255,255,255,.08) 0);-webkit-mask:radial-gradient(circle,transparent 21px,#000 22px);mask:radial-gradient(circle,transparent 21px,#000 22px)}
.mlh-ringwrap{position:relative;width:58px;height:58px;flex:none}
.mlh-ringwrap b{position:absolute;inset:0;display:grid;place-items:center;font-size:14px}
.mlh-wg .al{display:flex;gap:10px;align-items:flex-start;margin-top:8px}
.mlh-wg .al b{display:block;font-size:13.5px;line-height:1.3}
.mlh-dock{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:10px;padding:10px 12px;border-radius:24px;
  background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(22px) saturate(1.5);-webkit-backdrop-filter:blur(22px) saturate(1.5);z-index:4;max-width:calc(100% - 20px);box-shadow:0 20px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.2)}
.mlh-dock::before{content:"";position:absolute;left:12%;right:12%;bottom:-14px;height:14px;background:radial-gradient(50% 100% at 50% 0,rgba(93,242,255,.35),transparent);filter:blur(4px);pointer-events:none}
.mlh-dock button{position:relative;border:0;background:transparent;padding:0;border-radius:17px;transition:transform .2s cubic-bezier(.2,1,.3,1)}
.mlh-dock button:hover{transform:translateY(-10px) scale(1.18)}
.mlh-dock button:hover::before{content:attr(aria-label);position:absolute;bottom:calc(100% + 10px);left:50%;transform:translateX(-50%);padding:4px 9px;border-radius:8px;background:rgba(8,12,30,.9);border:1px solid rgba(255,255,255,.15);font-size:11.5px;font-weight:700;white-space:nowrap;color:#fff}
.mlh-dock button.run::after{content:"";position:absolute;left:50%;bottom:-7px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:#5df2ff;box-shadow:0 0 8px #5df2ff}
.mlh-win{position:absolute;display:flex;flex-direction:column;min-width:280px;border-radius:20px;overflow:hidden;
  background:linear-gradient(165deg,rgba(26,36,78,.92),rgba(10,14,36,.94));border:1px solid rgba(160,210,255,.2);box-shadow:0 30px 70px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(24px) saturate(1.4);-webkit-backdrop-filter:blur(24px) saturate(1.4);animation:mlh-open .28s cubic-bezier(.2,1,.3,1);z-index:3}
.mlh-win::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(93,242,255,.0),rgba(93,242,255,0));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;transition:background .2s}
.mlh-win.focus{z-index:4;box-shadow:0 40px 90px rgba(0,0,0,.65),0 0 40px -10px rgba(93,242,255,.35),inset 0 1px 0 rgba(255,255,255,.14)}
.mlh-win.focus::before{background:linear-gradient(135deg,rgba(93,242,255,.8),rgba(255,95,177,.55) 60%,rgba(255,255,255,.1))}
.mlh-win.max{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0}
.mlh-win.closing{animation:mlh-close .16s ease-in forwards}
.mlh-bar2{flex:none;height:46px;display:flex;align-items:center;gap:10px;padding:0 14px;background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.02));border-bottom:1px solid rgba(255,255,255,.08);cursor:grab;user-select:none;touch-action:none}
.mlh-bar2:active{cursor:grabbing}
.mlh-dots{display:flex;gap:8px}
.mlh-dot{width:13px;height:13px;padding:0;border-radius:50%;border:0;display:block;box-shadow:inset 0 1px 1px rgba(255,255,255,.5),0 0 6px currentColor}
.mlh-dot.c{background:#ff5f7a;color:rgba(255,95,122,.5)}.mlh-dot.m{background:#ffc94a;color:rgba(255,201,74,.45)}.mlh-dot.x{background:#3ddc97;color:rgba(61,220,151,.45)}
.mlh-bar2 .t{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13.5px;font-weight:700;color:#e6eeff;margin-right:62px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlh-bar2 .mi{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;flex:none;background:linear-gradient(160deg,var(--a),var(--b));box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}
.mlh-bar2 .mi .g3{width:84%;height:84%}
.mlh-body{flex:1;overflow:auto;padding:18px;overscroll-behavior:contain}
.mlh-body.flush{padding:0;overflow:hidden}
.mlh-body h3{margin:0 0 4px;font-size:19px;letter-spacing:-.01em}
.mlh-body p{margin:0 0 10px;color:#cfd8f3;font-size:14px}
@keyframes mlh-open{from{transform:scale(.88) translateY(14px);opacity:0;filter:blur(6px)}to{transform:none;opacity:1;filter:none}}
@keyframes mlh-close{to{transform:scale(.9) translateY(8px);opacity:0;filter:blur(4px)}}
.mlh-notif{position:absolute;right:14px;top:62px;width:min(350px,calc(100% - 28px));display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:linear-gradient(160deg,rgba(32,44,92,.95),rgba(14,20,48,.96));border:1px solid rgba(93,242,255,.4);box-shadow:0 20px 50px rgba(0,0,0,.55),0 0 30px -8px rgba(93,242,255,.5);z-index:6;text-align:left;transform:translateX(130%);transition:transform .4s cubic-bezier(.2,1,.3,1);color:#fff}
.mlh-notif.on{transform:none}
.mlh-notif b{display:block;font-size:14px}
.mlh-notif small{display:block;color:#cfd8f3;font-size:12.5px}
.mlh-boot{position:absolute;inset:0;display:grid;place-items:center;background:radial-gradient(60% 60% at 50% 45%,#0e1a44,#03050f);z-index:20;transition:opacity .4s}
.mlh-boot.off{opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s,visibility 0s .4s}
.mlh-boot .in{text-align:center}
.mlh-boot .mk svg{width:74px;height:74px;filter:drop-shadow(0 0 22px rgba(93,242,255,.6));animation:mlh-bootmk .9s cubic-bezier(.2,1,.3,1)}
@keyframes mlh-bootmk{from{transform:scale(.6);opacity:0}}
.mlh-boot .lg{margin-top:14px;font:800 30px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.3em;color:#eaf6ff}
.mlh-boot .lg b{background:linear-gradient(90deg,#5df2ff,#ff5fb1);-webkit-background-clip:text;background-clip:text;color:transparent}
.mlh-boot .ver{margin-top:8px;font-size:11px;letter-spacing:.3em;color:#7f92c4}
.mlh-boot .bb{width:200px;height:3px;border-radius:9px;background:rgba(255,255,255,.1);margin:20px auto 0;overflow:hidden}
.mlh-boot .bb i{display:block;height:100%;width:0;background:linear-gradient(90deg,#5df2ff,#ff5fb1);box-shadow:0 0 10px #5df2ff;animation:mlh-boot .8s ease-out forwards}
@keyframes mlh-boot{to{width:100%}}

/* app content */
.mlh-alert{display:flex;gap:12px;padding:12px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);margin-bottom:10px}
.mlh-alert.unread{border-color:rgba(54,227,255,.4);background:rgba(54,227,255,.07)}
.mlh-alert.hl{animation:mlh-hl 1.6s ease-out}
@keyframes mlh-hl{0%{box-shadow:0 0 0 3px rgba(54,227,255,.8)}100%{box-shadow:0 0 0 0 rgba(54,227,255,0)}}
.mlh-alert .k{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#fff}
.mlh-alert .k svg{width:22px;height:22px}
.mlh-alert b{display:block;font-size:15px;line-height:1.3}
.mlh-alert .meta{font-size:12px;color:var(--muted);margin:2px 0 6px}
.mlh-alert p{margin:0 0 8px;font-size:14px}
.mlh-alert .mlh-btn{min-height:36px;padding:0 12px;font-size:13.5px;border-radius:10px}
.mlh-empty{text-align:center;color:var(--muted);padding:30px 10px}
.mlh-empty svg{width:42px;height:42px;opacity:.6}
.mlh-frame{width:100%;height:100%;border:0;display:block;background:#05081a}
.mlh-load{display:grid;place-items:center;height:100%;color:var(--muted)}
.mlh-tabs{display:flex;gap:6px;padding:4px;border-radius:12px;background:rgba(255,255,255,.06);margin:10px 0 12px}
.mlh-tabs button{flex:1;min-height:36px;border:0;border-radius:9px;background:transparent;font-weight:700;font-size:13.5px;color:#cfd8f3}
.mlh-tabs button[aria-selected="true"]{background:rgba(54,227,255,.18);color:#fff}
.mlh-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mlh-stats div{padding:10px;border-radius:12px;background:rgba(255,255,255,.05);text-align:center}
.mlh-stats b{display:block;font-size:20px}
.mlh-stats small{color:var(--muted);font-size:11.5px}
.mlh-lb{list-style:none;margin:0;padding:0}
.mlh-lb li{display:flex;align-items:center;gap:12px;padding:10px 8px;border-bottom:1px solid rgba(255,255,255,.06)}
.mlh-lb .r{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:13px;background:rgba(255,255,255,.08)}
.mlh-lb li:nth-child(1) .r{background:#ffc42e;color:#3a2400}.mlh-lb li:nth-child(2) .r{background:#cfd8e8;color:#1b2235}.mlh-lb li:nth-child(3) .r{background:#d58a4f;color:#2b1405}
.mlh-lb .f{font-size:22px;line-height:1}
.mlh-lb .n{flex:1;min-width:0}
.mlh-lb .n b{display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlh-lb .n small{color:var(--muted);font-size:12px}
.mlh-lb .s{font-weight:800;font-size:15px}
.mlh-hero{height:150px;border-radius:14px;margin:-2px 0 14px;display:grid;place-items:center;background:radial-gradient(circle at 30% 30%,rgba(255,91,91,.55),transparent 60%),radial-gradient(circle at 75% 70%,rgba(54,227,255,.5),transparent 60%),#121a44;font:900 30px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-align:center}
.mlh-hero small{display:block;font-size:12px;letter-spacing:.2em;color:#cfe;margin-top:6px}
.mlh-stack{display:grid;gap:10px}
.mlh-stack .mlh-btn{width:100%}
.mlh-me{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.mlh-av{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--cyan),var(--pink));color:#041824;font-weight:900;font-size:22px}
.mlh-kv{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07);font-size:14px}
.mlh-kv span{color:var(--muted)}

@media (max-width:440px){
  .mlh-actions{gap:6px}
  .mlh-hud .mlh-icon{width:40px;height:40px;border-radius:11px}
  .mlh-title{padding:6px 10px 6px 7px;gap:8px;min-height:40px}
  .mlh-title b{font-size:14px;white-space:nowrap}
  .mlh-title small{white-space:nowrap}
  .mlh-ring{width:26px;height:26px}
  /* The host's menu button sits in the top bar and offers the way out. */
  .mlh-hostmenu [data-r=exit]{display:none!important}
}
@media (max-width:700px){
  /* Phones keep the width (the desktop needs it) and take OS Size as the height. */
  .mlh-screen{width:max(calc(100% * var(--mlh-os-size,.8)),calc(100% - 24px));border-radius:20px;box-shadow:0 0 0 1px rgba(140,220,255,.25),0 30px 80px rgba(0,0,0,.6)}
  .mlh-os.full .mlh-screen{border-radius:0;box-shadow:none}
  .mlh-icons{grid-template-columns:repeat(4,1fr);grid-auto-rows:108px;left:10px;right:10px;top:176px}
  .mlh-menubar .app{display:none}
  .mlh-menubar .tray{white-space:nowrap}
  .mlh-wg{height:150px;overflow:hidden}
  .mlh-wg small{font-size:11.5px}
  .mlh-dicon{width:auto;height:98px}
  .mlh-widgets{left:12px;right:12px;top:12px;width:auto;grid-template-columns:1fr 1fr;gap:10px}
  .mlh-widgets .mlh-wg:nth-child(n+3){display:none}
  .mlh-wg{padding:10px 12px;border-radius:16px}
  .mlh-wg .big{font-size:28px}
  .mlh-menubar .chip{display:none}
  .mlh-screen{transform:none}
  .mlh-win{left:0!important;top:0!important;width:100%!important;height:100%!important;border-radius:0;min-width:0}
  .mlh-bar2{cursor:default;height:48px}
  .mlh-dot{width:18px;height:18px}
  .mlh-menubar{left:0;right:0;top:0;border-radius:0;border-width:0 0 1px;padding-top:var(--mlh-os-st);height:calc(44px + var(--mlh-os-st))}
  .mlh-desk{top:calc(44px + var(--mlh-os-st))}
  .mlh-dock{bottom:calc(10px + var(--mlh-os-sb));gap:6px;padding:6px}
  .mlh-dock{gap:7px;padding:8px}
  .mlh-dock .mlh-tile{width:40px;height:40px;border-radius:12px}
  .mlh-dock .mlh-tile::after{border-radius:10px 10px 40% 40%}
  .mlh-dock button:hover{transform:none}
  .mlh-dock button:hover::before{display:none}
  .mlh-title small{display:none}
}
/* \u2500\u2500 hotspots \u2500\u2500 */
.mlh-spots{position:absolute;inset:0;pointer-events:none!important;overflow:hidden}
.mlh-spot{position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#071022;
  background:radial-gradient(circle at 34% 28%,#fff 0,color-mix(in srgb,var(--c) 55%,#fff) 22%,var(--c) 62%,color-mix(in srgb,var(--c) 70%,#000) 100%);
  box-shadow:0 0 0 2.5px rgba(6,10,28,.7),0 0 0 4px color-mix(in srgb,var(--c) 55%,transparent),0 0 22px 2px color-mix(in srgb,var(--c) 70%,transparent),0 6px 14px rgba(0,0,0,.45);
  pointer-events:auto!important;transition:opacity .3s,width .25s,height .25s,margin .25s;will-change:transform}
.mlh-spot::before{content:"";position:absolute;inset:-5px;border-radius:50%;border:2px solid var(--c);opacity:0;animation:mlh-ping 2.4s cubic-bezier(.2,.7,.3,1) infinite;pointer-events:none}
@keyframes mlh-ping{0%{transform:scale(.75);opacity:.85}80%,100%{transform:scale(1.75);opacity:0}}
.mlh-spot svg{width:17px;height:17px;stroke-width:2.3}
.mlh-spot span{position:absolute;left:calc(100% + 9px);top:50%;transform:translate(-4px,-50%);white-space:nowrap;padding:5px 11px;border-radius:999px;background:rgba(8,13,34,.88);
  border:1px solid color-mix(in srgb,var(--c) 55%,transparent);color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.01em;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;
  box-shadow:0 6px 18px rgba(0,0,0,.35)}
.mlh-spot:hover span,.mlh-spot:focus-visible span,.mlh-spot.focus span{opacity:1;transform:translate(0,-50%)}
.mlh-spot:focus-visible{outline:2px solid #fff;outline-offset:3px}
.mlh-spot.gone{opacity:0;pointer-events:none!important}
.mlh-spots.off .mlh-spot{opacity:0;pointer-events:none!important}
.mlh-spots.touring .mlh-spot{opacity:.28;pointer-events:none!important}
.mlh-spots.touring .mlh-spot.focus{opacity:1;width:44px;height:44px;margin:-22px 0 0 -22px}
.mlh-spots.touring .mlh-spot.gone{opacity:0}
/* \u2500\u2500 welcome tour \u2500\u2500 */
.mlh-tour{position:absolute;left:50%;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 20px);transform:translate(-50%,12px);width:min(470px,calc(100% - 28px));
  padding:16px 18px 14px;border-radius:20px;background:linear-gradient(160deg,rgba(26,38,84,.94),rgba(10,15,38,.95));border:1px solid rgba(110,200,255,.28);
  box-shadow:0 24px 60px rgba(0,0,0,.5),0 0 40px -12px rgba(54,227,255,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  opacity:0;transition:opacity .3s,transform .3s;pointer-events:auto!important}
.mlh-tour.on{opacity:1;transform:translate(-50%,0)}
.mlh-tour[hidden]{display:block!important;visibility:hidden}
.mlh-tour .mlh-kicker{margin:0 0 4px}
.mlh-tour h3{margin:0 0 6px;font-size:19px;line-height:1.25;letter-spacing:-.01em}
.mlh-tour p{margin:0 0 14px;color:#c9d5f2;font-size:14.5px;line-height:1.5}
.mlh-tour-row{display:flex;align-items:center;gap:8px}
.mlh-tour-row .mlh-btn{min-height:42px}
.mlh-tour-row .mlh-btn.pri{min-width:96px}
.mlh-tour-skip{all:unset;cursor:pointer;color:#9fb0d8;font-size:13.5px;font-weight:600;padding:8px 4px;border-radius:8px}
.mlh-tour-skip:hover{color:#fff}
.mlh-tour-skip:focus-visible{outline:2px solid var(--cyan)}
.mlh-tour-dots{flex:1;display:flex;justify-content:center;gap:5px}
.mlh-tour-dots i{width:6px;height:6px;border-radius:99px;background:rgba(255,255,255,.22);transition:width .25s,background .25s}
.mlh-tour-dots i.on{width:18px;background:linear-gradient(90deg,var(--cyan),var(--pink))}
@media (max-width:520px){.mlh-tour{padding:14px 14px 12px}.mlh-tour h3{font-size:17px}.mlh-tour p{font-size:14px}.mlh-tour-dots{display:none}.mlh-tour-row .mlh-btn{flex:1}.mlh-spot span{display:none}.mlh-spot.focus span{display:block}}
/* \u2500\u2500 Home: BOBO OS as the game's home screen (setHome) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
   Same materials as the game's own menu (dark glass, hairline accent, white
   labels) so it reads as one product; each mode keeps the game's colour. */
.mlh{--hp:79,214,232;--hl:255,92,181;--hr:255,196,46;--ha:var(--hp)}
.mlh.mlh-m-lounge{--ha:var(--hl)}
.mlh.mlh-m-room{--ha:var(--hr)}
.mlh.mlh-homed [data-r="pc"],.mlh.mlh-homed [data-r="exit"]{display:none}
.mlh-hdock{position:absolute;right:16px;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 18px);display:flex;align-items:flex-end;gap:14px;pointer-events:none!important}
.mlh-hdock.l{right:auto;left:16px;flex-direction:row-reverse}
.mlh-hdock>button{pointer-events:auto!important}
.mlh-homeb{position:relative;width:58px;height:58px;padding:0;border-radius:18px;display:grid;place-items:center;border:1px solid rgba(var(--ha),.42);background:rgba(20,22,26,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 18px rgba(var(--ha),.18);transition:transform .18s,border-color .18s,box-shadow .18s}
.mlh-homeb::before{content:"";position:absolute;inset:10px;border-radius:50%;background:radial-gradient(circle at 36% 32%,#f2fbff 0%,rgb(var(--ha)) 38%,rgba(var(--ha),.4) 74%,transparent 100%);filter:blur(7px);opacity:.55;animation:mlh-hpulse 2.6s ease-in-out infinite}
.mlh-homeb svg{position:relative;width:32px;height:32px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.4))}
.mlh-homeb:hover,.mlh-homeb.on{transform:scale(1.05);border-color:rgb(var(--ha));box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 22px rgba(var(--ha),.35)}
.mlh-homeb .mlh-badge{top:-5px;right:-5px}
@keyframes mlh-hpulse{0%,100%{transform:scale(1);opacity:.45}50%{transform:scale(1.14);opacity:.7}}
.mlh-act{position:relative;width:58px;height:58px;padding:0;border-radius:50%;display:grid;place-items:center;border:0;color:#fff;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),transparent 55%),linear-gradient(145deg,rgb(var(--ha)),rgba(var(--ha),.55));box-shadow:0 8px 24px rgba(0,0,0,.35),0 0 0 3px rgba(20,22,26,.55),0 0 22px rgba(var(--ha),.45);transition:transform .2s cubic-bezier(.2,1.4,.4,1),box-shadow .2s}
.mlh-act svg{width:28px;height:28px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35));transition:transform .25s,opacity .2s}
.mlh-act .x{position:absolute;opacity:0;transform:rotate(-90deg) scale(.6)}
.mlh-act[aria-expanded="true"]{transform:scale(.92)}
.mlh-act[aria-expanded="true"] .p{opacity:0;transform:rotate(90deg) scale(.6)}
.mlh-act[aria-expanded="true"] .x{opacity:1;transform:none}
.mlh-act:focus-visible,.mlh-homeb:focus-visible,.mlh-fan button:focus-visible,.mlh-hs button:focus-visible{outline:2px solid #fff;outline-offset:3px}
.mlh-fan{position:absolute;width:0;height:0;pointer-events:none!important}
.mlh-fan .it{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:4px;width:76px;margin:-26px 0 0 -38px;transform:translate(0,0) scale(.3);opacity:0;visibility:hidden;transition:transform .32s cubic-bezier(.2,1.5,.4,1),opacity .2s,visibility 0s .32s}
.mlh-fan.open .it{transform:translate(var(--x),var(--y)) scale(1);opacity:1;visibility:visible;transition-delay:calc(var(--i) * 35ms),calc(var(--i) * 35ms),0s}
.mlh-fan.open .it button{pointer-events:auto!important}
.mlh-fan button{width:52px;height:52px;padding:0;border-radius:50%;display:grid;place-items:center;color:#fff;border:1px solid rgba(var(--ha),.5);background:rgba(20,22,26,.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 18px rgba(0,0,0,.4)}
.mlh-fan button:hover,.mlh-fan button:active{border-color:rgb(var(--ha));background:rgba(var(--ha),.25)}
.mlh-fan button svg{width:24px;height:24px}
.mlh-fan .it span{max-width:76px;padding:2px 8px;border-radius:999px;background:rgba(10,12,16,.72);font-size:11.5px;font-weight:700;line-height:1.35;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.5)}
html.mlh-modal .crc-anchor,html.mlh-modal .mlh-hdock,html.mlh-modal .mlh-mtop{visibility:hidden}
/* The BOBO OS button in the top right: the usual home of a game's menu and pause. */
.mlh-mtop{position:absolute;top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 12px + var(--mlh-top,0px));right:calc(var(--safe-area-inset-right,env(safe-area-inset-right,0px)) + 14px);pointer-events:none!important}
.mlh-mtop>button{pointer-events:auto!important}
.mlh-mtop .mlh-homeb{width:52px;height:52px;border-radius:16px}
.mlh-mtop .mlh-homeb svg{width:30px;height:30px}
.mlh-homeb .pz{display:none;position:relative;color:#fff}
.mlh-homeb .pz svg{width:24px;height:24px;stroke-width:2.6}
.mlh-homeb.pzm>svg{display:none}
.mlh-homeb.pzm .pz{display:grid;place-items:center}
.mlh-homeb.pzm .mlh-badge{display:none!important}
.mlh-homeb.pzm::before{opacity:.28;animation:none}
/* Adjust room: above the joystick, so the room stays in view and nothing covers the stick. */
html.mlh-adjusting .crc-anchor,html.mlh-adjusting .mlh-hdock,html.mlh-adjusting .mlh-mtop{visibility:hidden}
.mlh-adj{position:absolute;left:12px;right:12px;margin:0 auto;max-width:420px;bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + var(--mlh-stick-clear,0px) + 12px);padding:12px 14px 10px;border-radius:22px;color:#e8ecf2;pointer-events:auto!important;border:1px solid rgba(var(--hr),.35);background:radial-gradient(120% 60% at 50% -20%,rgba(var(--hr),.16),transparent 60%),rgba(18,20,24,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 18px 50px rgba(0,0,0,.55);opacity:0;transform:translateY(14px);transition:opacity .25s,transform .3s cubic-bezier(.2,1,.3,1)}
.mlh-adj.open{opacity:1;transform:none}
.mlh-adj[hidden]{display:none}
.mlh-adj-h{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.mlh-adj-h .ic{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;color:#101215;background:rgb(var(--hr));box-shadow:0 0 14px rgba(var(--hr),.45)}
.mlh-adj-h .ic svg{width:18px;height:18px}
.mlh-adj-h b{flex:1;font-size:16px;font-weight:800}
.mlh-adj-done{min-height:40px;padding:0 18px;border-radius:999px;border:0;font-weight:800;font-size:14.5px;color:#101215;background:rgb(var(--hr));box-shadow:0 0 16px rgba(var(--hr),.4)}
.mlh-adj-row{display:flex;align-items:center;gap:8px;min-height:50px}
.mlh-adj-row .lbl{width:38px;flex:none;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#98a2b1}
.mlh-adj-b{flex:none;width:44px;height:44px;padding:0;border-radius:14px;display:grid;place-items:center;color:#fff;border:1px solid #2f343e;background:#1d2027}
.mlh-adj-b:active{background:rgba(var(--hr),.22);border-color:rgba(var(--hr),.6)}
.mlh-adj-b svg{width:20px;height:20px}
.mlh-adj-b.w{flex:1;width:auto}
.mlh-adj-row input[type=range]{flex:1;min-width:0;height:44px;margin:0;background:none;accent-color:rgb(var(--hr));touch-action:none}
.mlh-adj-row output{width:46px;flex:none;text-align:right;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.mlh-adj-reset{flex:none;min-height:44px;padding:0 14px;border-radius:14px;border:1px solid #2f343e;background:none;font-size:13.5px;font-weight:700;color:#c9d1dc}
.mlh-adj-tip{margin:4px 2px 0;font-size:12px;line-height:1.35;color:#8d97a6;text-align:center}
.mlh-adj button:focus-visible,.mlh-adj input:focus-visible{outline:2px solid #fff;outline-offset:2px}
/* The game's reward banner clears the joystick and the record button. */
/* Over the joystick, never under it: the room's hint and the game's place hint. */
html.mlh-homed .mlh .mlh-prompt{bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + max(22px,var(--mlh-stick-clear,0px) + 12px))}
html.mlh-homed .mlh.mlh-docked .mlh-prompt{bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + max(92px,var(--mlh-stick-clear,0px) + 12px))}
html.mlh-homed .ohg-hint{margin-bottom:max(var(--ohg-hintLift,18px),calc(var(--mlh-stick-clear,0px) - 66px - var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))))}
html.mlh-homed .ohg-rwBadge{bottom:calc(var(--safe-area-inset-bottom,0px) + max(104px,var(--mlh-stick-clear,0px) + 16px))}
/* A reward still to claim, at the top of the sheet. */
.mlh-hs-reward{width:100%;display:flex;align-items:center;gap:12px;margin:0 0 12px;padding:10px 12px;min-height:60px;border-radius:16px;text-align:left;border:1px solid rgba(var(--hr),.5);background:linear-gradient(110deg,rgba(var(--hr),.22),rgba(var(--hp),.1)),#17191e;box-shadow:0 0 20px rgba(var(--hr),.16)}
.mlh-hs-reward i{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;color:#101215;background:rgb(var(--hr))}
.mlh-hs-reward i svg{width:22px;height:22px}
.mlh-hs-reward span{flex:1;min-width:0}
.mlh-hs-reward b{display:block;font-size:14.5px;line-height:1.25}
.mlh-hs-reward small{display:block;font-size:12.5px;color:#c4ccd6}
.mlh-hs-reward>svg{flex:none;width:18px;height:18px;opacity:.7}
html.mlh-homed .crc-anchor.crc-tr,html.mlh-homed .crc-anchor.crc-tl{top:calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px)) + 12px + var(--crc-dy,0px))}
.mlh.mlh-docked .mlh-prompt{bottom:calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 92px)}
.mlh-layer.mlh-home{align-items:end;padding:0 8px calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)) + 8px);background:rgba(3,6,12,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.mlh-hs{position:relative;width:min(440px,100%);max-height:calc(100% - var(--safe-area-inset-top,env(safe-area-inset-top,0px)) - 20px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:8px 16px 16px;border-radius:26px;color:#e8ecf2;border:1px solid rgba(var(--ha),.24);background:radial-gradient(120% 50% at 50% -12%,rgba(var(--ha),.17),transparent 62%),rgba(18,20,24,.975);box-shadow:0 26px 80px rgba(0,0,0,.72);transform:translateY(24px);transition:transform .32s cubic-bezier(.2,1,.3,1)}
.mlh-home.open .mlh-hs{transform:none}
.mlh-hs::before{content:"";position:absolute;top:0;left:12%;right:12%;height:1px;background:linear-gradient(90deg,transparent,rgb(var(--ha)),transparent);opacity:.85}
.mlh-hs-grab{width:40px;height:5px;margin:0 auto 6px;border-radius:99px;background:rgba(255,255,255,.22);touch-action:none}
.mlh-hs-head{display:flex;align-items:center;gap:12px;padding:4px 0 12px;touch-action:none}
.mlh-hs-head .mk{flex:none;width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}
.mlh-hs-head .mk svg{width:28px;height:28px}
.mlh-hs-head .t{flex:1;min-width:0}
.mlh-hs-head b{display:block;font-size:19px;font-weight:800;letter-spacing:.02em;line-height:1.2}
.mlh-hs-head b i{font-style:normal;background:linear-gradient(90deg,var(--cyan),var(--pink));-webkit-background-clip:text;background-clip:text;color:transparent}
.mlh-hs-head small{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:#98a2b1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mlh-hs-head small::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:rgb(var(--ha));box-shadow:0 0 8px rgb(var(--ha))}
.mlh-hs-x{flex:none;width:44px;height:44px;border-radius:13px;border:1px solid #2a2f38;background:#1b1e24;display:grid;place-items:center}
.mlh-hs-x svg{width:20px;height:20px}
.mlh-hs-resume{display:flex;gap:8px;margin:0 0 12px}
.mlh-hs-resume button{flex:1;min-height:52px;border-radius:14px;border:1px solid rgba(var(--hp),.5);background:rgba(var(--hp),.2);font-weight:700;font-size:16px;display:flex;align-items:center;justify-content:center;gap:8px}
.mlh-hs-resume button+button{flex:0 0 auto;padding:0 18px;border-color:#2a2f38;background:#1b1e24;font-size:14px}
.mlh-hs-resume svg{width:18px;height:18px}
.mlh-hs-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mlh-hs-modes button{position:relative;--c:var(--hp);display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-height:104px;padding:12px 10px 10px;border-radius:16px;text-align:left;border:1px solid rgba(var(--c),.3);background:linear-gradient(160deg,rgba(var(--c),.16),rgba(var(--c),.04) 70%),#17191e;transition:transform .15s,border-color .15s,background .15s}
.mlh-hs-modes button:active{transform:scale(.97)}
.mlh-hs-modes button[data-go="lounge"]{--c:var(--hl)}
.mlh-hs-modes button[data-go="room"]{--c:var(--hr)}
.mlh-hs-modes i{display:grid;place-items:center;width:36px;height:36px;margin-bottom:auto;border-radius:11px;color:#101215;background:rgb(var(--c));box-shadow:0 0 14px rgba(var(--c),.45)}
.mlh-hs-modes i svg{width:20px;height:20px}
.mlh-hs-modes b{margin-top:10px;font-size:14.5px;line-height:1.2}
.mlh-hs-modes small{font-size:11.5px;line-height:1.3;color:#98a2b1}
.mlh-hs-modes button.cur{border-color:rgb(var(--c));box-shadow:0 0 0 1px rgb(var(--c)) inset,0 0 18px rgba(var(--c),.22)}
.mlh-hs-modes button.cur::after{content:"Now";position:absolute;top:10px;right:10px;padding:2px 7px;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#101215;background:rgb(var(--c))}
.mlh-hs-h{margin:16px 2px 8px;font-size:11.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#7d8696}
.mlh-hs-apps{display:grid;grid-template-columns:repeat(3,1fr);gap:4px 6px}
.mlh-hs-apps button{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:8px 2px 6px;border:0;border-radius:14px;background:none;font-size:12.5px;font-weight:600;color:#dfe5ee;line-height:1.25;text-align:center}
.mlh-hs-apps button:active{background:rgba(255,255,255,.06)}
.mlh-hs-apps .mlh-tile{width:54px;height:54px}
.mlh-hs-quick{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:8px}
.mlh-hs-quick button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:72px;padding:8px 4px;border-radius:14px;border:1px solid #2a2f38;background:#1b1e24;font-size:11.5px;font-weight:600;color:#c9d1dc;line-height:1.2}
.mlh-hs-quick svg{width:22px;height:22px}
.mlh-hs-quick button[aria-pressed="true"]{color:#fff;border-color:rgba(var(--hp),.55);background:rgba(var(--hp),.16)}
.mlh-hs-quick button[aria-pressed="false"] svg{opacity:.45}
.mlh-hs-join{position:relative;width:100%;min-height:54px;margin-top:14px;border-radius:14px;border:1px solid rgba(var(--hp),.55);overflow:hidden;font-size:16px;font-weight:700;letter-spacing:.01em;background:linear-gradient(180deg,rgba(var(--hp),.42),rgba(var(--hp),.22));box-shadow:0 0 22px rgba(var(--hp),.22);display:flex;align-items:center;justify-content:center;gap:8px}
.mlh-hs-join svg{width:17px;height:17px;opacity:.85}
@media (min-width:700px) and (min-height:560px){.mlh-layer.mlh-home{align-items:center}}
@media (max-height:640px){.mlh-hs-modes button{min-height:88px}.mlh-hs-quick button{min-height:62px}.mlh-hs-h{margin-top:12px}}
@media (prefers-reduced-motion:reduce){
  .mlh *{animation:none!important;transition:none!important}
}
`
);
function hash2(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647 | 0;
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function vnoise(u, v, px, seed, py = px) {
  const x = u * px;
  const y = v * py;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wx = (n) => (n % px + px) % px;
  const wy = (n) => (n % py + py) % py;
  const a = hash2(wx(x0), wy(y0), seed);
  const b = hash2(wx(x0 + 1), wy(y0), seed);
  const c = hash2(wx(x0), wy(y0 + 1), seed);
  const d = hash2(wx(x0 + 1), wy(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
var HEIGHTS = {
  // brushed aluminium: long fine streaks
  brushed: (u, v) => 0.65 * vnoise(u, v, 3, 2, 220) + 0.35 * vnoise(u, v, 8, 3, 90),
  // painted plaster
  plaster: (u, v) => 0.55 * vnoise(u, v, 24, 4) + 0.3 * vnoise(u, v, 64, 5) + 0.15 * vnoise(u, v, 160, 6),
  // woven fabric
  fabric: (u, v) => {
    const a = Math.sin(u * Math.PI * 2 * 96) * 0.5 + 0.5;
    const b = Math.sin(v * Math.PI * 2 * 96) * 0.5 + 0.5;
    return 0.45 * (Math.floor(u * 96 + v * 96) % 2 ? a : b) + 0.55 * vnoise(u, v, 48, 7);
  },
  // satin plastic / lacquer: almost flat, a little orange peel
  peel: (u, v) => 0.7 * vnoise(u, v, 48, 8) + 0.3 * vnoise(u, v, 128, 9)
};
function heightField(size, fn) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) h[y * size + x] = fn(x / size, y / size);
  return h;
}
function dataTexture(size, data) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.putImageData(new ImageData(data, size, size), 0, 0);
  const t = new THREE3.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE3.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function detailMaps(size, h, rough) {
  const n = new Uint8ClampedArray(size * size * 4);
  const r = new Uint8ClampedArray(size * size * 4);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const at = (x, y) => h[(y + size) % size * size + (x + size) % size];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / span;
      const dy = (at(x, y + 1) - at(x, y - 1)) / span;
      const len = Math.hypot(dx * 6, dy * 6, 1);
      const i = (y * size + x) * 4;
      n[i] = -dx * 6 / len * 127 + 128;
      n[i + 1] = dy * 6 / len * 127 + 128;
      n[i + 2] = 1 / len * 127 + 128;
      n[i + 3] = 255;
      const k = (at(x, y) - lo) / span;
      const g = (rough[0] + (rough[1] - rough[0]) * k) * 255;
      r[i] = r[i + 1] = r[i + 2] = g;
      r[i + 3] = 255;
    }
  return { normal: dataTexture(size, n), rough: dataTexture(size, r) };
}
function normalFromImage(img, max = 512) {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(4, Math.round(img.width * k));
  const hgt = Math.max(4, Math.round(img.height * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hgt;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, hgt);
  const px = ctx.getImageData(0, 0, w, hgt).data;
  const lum = new Float32Array(w * hgt);
  for (let i = 0; i < w * hgt; i++)
    lum[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255;
  const out = new Uint8ClampedArray(w * hgt * 4);
  const rough = new Uint8ClampedArray(w * hgt * 4);
  const at = (x, y) => lum[(y + hgt) % hgt * w + (x + w) % w];
  for (let y = 0; y < hgt; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = -dx / len * 127 + 128;
      out[i + 1] = dy / len * 127 + 128;
      out[i + 2] = 1 / len * 127 + 128;
      out[i + 3] = 255;
      const g = (0.62 - at(x, y) * 0.3) * 255;
      rough[i] = rough[i + 1] = rough[i + 2] = g;
      rough[i + 3] = 255;
    }
  const make = (d) => {
    const cc = document.createElement("canvas");
    cc.width = w;
    cc.height = hgt;
    cc.getContext("2d").putImageData(new ImageData(d, w, hgt), 0, 0);
    const t = new THREE3.CanvasTexture(cc);
    t.wrapS = t.wrapT = THREE3.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  return { normal: make(out), rough: make(rough) };
}
function studioEnv() {
  const W = 512;
  const H = 256;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#2a3350");
  sky.addColorStop(0.48, "#121828");
  sky.addColorStop(0.52, "#0c0f19");
  sky.addColorStop(1, "#07080d");
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const box = (x, y, w, h, col, a = 1) => {
    const gr = g.createRadialGradient(
      x + w / 2,
      y + h / 2,
      2,
      x + w / 2,
      y + h / 2,
      Math.max(w, h) * 0.75
    );
    gr.addColorStop(0, col);
    gr.addColorStop(0.55, col);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.fillRect(x - w * 0.25, y - h * 0.25, w * 1.5, h * 1.5);
    g.globalAlpha = 1;
  };
  box(70, 40, 120, 60, "#fff4e6");
  box(330, 55, 90, 50, "#dfe9ff", 0.75);
  box(250, 6, 160, 18, "#ffffff", 0.55);
  g.fillStyle = "rgba(54,227,255,.85)";
  g.fillRect(0, 118, W, 3);
  g.fillStyle = "rgba(255,79,163,.7)";
  g.fillRect(200, 98, 46, 40);
  const t = new THREE3.CanvasTexture(c);
  t.mapping = THREE3.EquirectangularReflectionMapping;
  srgb(t);
  return t;
}
var PRODUCT_ICON = {
  keychain: svg('<circle cx="8" cy="8" r="4"/><path d="m11 11 9 9M17 17l2-2M15 15l2-2"/>'),
  hoodie: svg(
    '<path d="M8 4c0 2 1.8 3.5 4 3.5S16 6 16 4l4 3-2 4-1.5-.8V20H7.5v-9.8L6 11 4 7z"/><path d="M10 15h4"/>'
  ),
  tee: svg('<path d="M8 4c0 1.6 1.8 2.5 4 2.5S16 5.6 16 4l5 3-2 4-2-1v10H7V10l-2 1-2-4z"/>'),
  deskmat: svg(
    '<rect x="3" y="7" width="18" height="10" rx="2.5"/><circle cx="15.5" cy="12" r="2"/>'
  ),
  mystery: svg(
    '<path d="M9.2 9a3 3 0 1 1 4.2 2.8c-.9.4-1.4 1.1-1.4 2v.7"/><path d="M12 18.5h.01"/><rect x="3" y="3" width="18" height="18" rx="4"/>'
  )
};
var CollectorHub = class {
  constructor(opts) {
    __publicField(this, "root", new THREE3.Group());
    __publicField(this, "opts");
    __publicField(this, "roomId");
    __publicField(this, "_state", "hidden");
    __publicField(this, "_room");
    __publicField(this, "_loaded");
    __publicField(this, "_disposed", false);
    /* reveal */
    __publicField(this, "_reveal", {
      uSolid: { value: 1e3 },
      uWire: { value: 1e3 },
      uGhost: { value: 0 },
      uOrigin: { value: new THREE3.Vector3() },
      uFloor: { value: 0 },
      uGlow: { value: new THREE3.Color(3597311) },
      uRoomInv: { value: new THREE3.Matrix4() }
    });
    __publicField(this, "_maxDist", 6);
    /** The room's bounds in room space, and its outer radius on the floor. */
    __publicField(this, "_box", new THREE3.Box3());
    __publicField(this, "_radius", 1.9);
    __publicField(this, "_buildSpeed", 1);
    __publicField(this, "_ghostFrom", 0);
    __publicField(this, "_warmed", false);
    /** Room height above uFloor: how far the materialise scan line travels. */
    __publicField(this, "_maxH", 3);
    __publicField(this, "_wireMat");
    __publicField(this, "_wires", []);
    __publicField(this, "_patched", []);
    __publicField(this, "_owned", []);
    // materials this core created (disposed with it)
    __publicField(this, "_geos", []);
    __publicField(this, "_texs", []);
    /* bobo + sequence */
    __publicField(this, "_bobo");
    __publicField(this, "_mixer");
    __publicField(this, "_actions", {});
    __publicField(this, "_current");
    __publicField(this, "_boboHome", { pos: new THREE3.Vector3(), quat: new THREE3.Quaternion() });
    __publicField(this, "_walk");
    __publicField(this, "_seqT", 0);
    __publicField(this, "_walkIn", true);
    __publicField(this, "_leaveSpeed", 1);
    __publicField(this, "_peeked", false);
    __publicField(this, "_peekTimer");
    __publicField(this, "_look", {
      osSize: 0.8,
      osOpacity: 0.88,
      osDim: 0.18,
      hudInsetRight: 0,
      hudInsetLeft: 0,
      zIndex: 2000100,
      modeBottom: 78,
      modeCorner: "bottomLeft",
      modeTop: 78,
      modeAvoid: "",
      brightness: 1,
      exitButton: true,
      topOffset: 0,
      joystickSide: "left",
      menuSpot: "top",
      stickClear: 0,
      accents: {}
    });
    /** The room's world scale and brightness the lights were last set for. */
    __publicField(this, "_lit", { scale: -1, brightness: -1 });
    __publicField(this, "_leaveResolve");
    __publicField(this, "_portalT", 0);
    __publicField(this, "_portalShut", false);
    __publicField(this, "_steps", []);
    /* room pieces */
    __publicField(this, "_portal");
    __publicField(this, "_pad");
    __publicField(this, "_swirl");
    __publicField(this, "_swirlAxis", new THREE3.Vector3(0, 1, 0));
    __publicField(this, "_orbitCans");
    __publicField(this, "_alertMat");
    __publicField(this, "_screenMat");
    __publicField(this, "_screenBase", 1);
    __publicField(this, "_screenCenter", new THREE3.Vector3());
    // room space
    __publicField(this, "_lampPos", new THREE3.Vector3());
    // room space
    __publicField(this, "_pullTab");
    __publicField(this, "_pullRest", 0);
    __publicField(this, "_tabWiggle", 0);
    __publicField(this, "_fizz", []);
    __publicField(this, "_pickables", []);
    __publicField(this, "_lights", []);
    /** Height of the loft's floor in room units (for sizing the room to the viewer). */
    __publicField(this, "_loftY", 0);
    /** Bobo's bed: kept Bobo-sized in a room scaled up for people. */
    __publicField(this, "_bed");
    __publicField(this, "_bedScale", 1);
    /* collection */
    __publicField(this, "_holoMat");
    __publicField(this, "_holoUniforms", {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uColor: { value: new THREE3.Color(3597311) },
      uRoomInv: this._reveal.uRoomInv
    });
    __publicField(this, "_slots", []);
    /* monitor + alerts */
    __publicField(this, "_screenCanvas");
    __publicField(this, "_screenTex");
    __publicField(this, "_screenImg");
    __publicField(this, "_screenDirty", true);
    __publicField(this, "_screenClock", "");
    __publicField(this, "_notifT", -1);
    // seconds since the monitor's pop-up started
    __publicField(this, "_notif");
    __publicField(this, "_alerts", []);
    __publicField(this, "_known", /* @__PURE__ */ new Set());
    __publicField(this, "_read", /* @__PURE__ */ new Set());
    __publicField(this, "_pollTimer");
    __publicField(this, "_greeted", false);
    __publicField(this, "_polled", false);
    /* hologram beam */
    __publicField(this, "_card");
    __publicField(this, "_cardTex");
    __publicField(this, "_cardCanvas");
    __publicField(this, "_beam");
    __publicField(this, "_cardU", {
      uMap: { value: null },
      uTime: { value: 0 },
      uAlpha: { value: 0 }
    });
    __publicField(this, "_beamU", { uTime: { value: 0 }, uAlpha: { value: 0 } });
    __publicField(this, "_beamAlert");
    __publicField(this, "_beamT", -1);
    __publicField(this, "_beamPhase", "out");
    __publicField(this, "_flash", 0);
    /* fizz burst */
    __publicField(this, "_burst");
    __publicField(this, "_bubbles", []);
    /* access */
    __publicField(this, "_token", null);
    __publicField(this, "_me", null);
    /* ui */
    __publicField(this, "_ui");
    __publicField(this, "_style");
    __publicField(this, "_el", {});
    __publicField(this, "_lastFocus", null);
    __publicField(this, "_toastTimer");
    __publicField(this, "_hintTimer");
    __publicField(this, "_gateResolve");
    __publicField(this, "_ac");
    __publicField(this, "_off", []);
    /* os */
    __publicField(this, "_wins", /* @__PURE__ */ new Map());
    __publicField(this, "_z", 10);
    __publicField(this, "_booted", false);
    __publicField(this, "_focused");
    __publicField(this, "_feed", null);
    __publicField(this, "_lbTab", "cities");
    __publicField(this, "_t", {
      v: new THREE3.Vector3(),
      v2: new THREE3.Vector3(),
      q: new THREE3.Quaternion(),
      m: new THREE3.Matrix4()
    });
    __publicField(this, "_time", 0);
    __publicField(this, "_reduceMotion");
    /* hotspots + tour */
    __publicField(this, "_spots", []);
    __publicField(this, "_spotFrame", 0);
    __publicField(this, "_tourI", -1);
    __publicField(this, "_afterTour", null);
    /* home screen (setHome) */
    __publicField(this, "_home", null);
    __publicField(this, "_fitter", null);
    __publicField(this, "_adjusting", false);
    __publicField(this, "_fanOpen", false);
    __publicField(this, "_dockKey", "");
    __publicField(this, "_homeMode", "");
    /** How far the last placeAround pushed the room back from Bobo's spot (parent units). */
    __publicField(this, "lastPush", new THREE3.Vector3());
    __publicField(this, "_floorPlane", new THREE3.Plane());
    __publicField(this, "_solidCache", {});
    __publicField(this, "_ray", new THREE3.Raycaster());
    __publicField(this, "_ndc", new THREE3.Vector2());
    this.opts = { lights: true, room: "evade", exitLabel: "Exit", ...opts };
    this.roomId = this.opts.room || "evade";
    this._ac = opts.audioContext ?? null;
    this._reduceMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.root.name = "CollectorHub";
    this.root.visible = false;
    this.opts.parent.add(this.root);
    const saved = this._loadSession();
    this._token = saved?.token ?? null;
    this._me = saved?.me ?? null;
    try {
      this._known = new Set(JSON.parse(store.get(this._k("known")) || "[]"));
      this._read = new Set(JSON.parse(store.get(this._k("read")) || "[]"));
    } catch {
    }
    this._buildUI();
    this._bindTaps();
    this.configure({
      ...opts.modeBottom != null ? { modeBottom: opts.modeBottom } : {},
      ...opts.hudOffset ? { topOffset: opts.hudOffset } : {},
      ...opts.look
    });
    const os = this._el.os;
    const osClick = (e) => {
      if (e.target === os) this.closeOS();
    };
    os.addEventListener("click", osClick);
    this._off.push(() => os.removeEventListener("click", osClick));
  }
  /* ── public API ───────────────────────────────────────────────────── */
  get state() {
    return this._state;
  }
  get me() {
    return this._me;
  }
  get signedIn() {
    return !!this._token;
  }
  get loaded() {
    return !!this._room;
  }
  /** Height of the room's Bobo in room units (for matching the player's size). */
  boboHeight() {
    if (!this._bobo) return 0.78;
    const b = new THREE3.Box3().setFromObject(this._bobo);
    const s = this.root.getWorldScale(this._t.v).y || 1;
    return (b.max.y - b.min.y) / s;
  }
  load() {
    this._loaded ?? (this._loaded = this.opts.loader.loadAsync(this.opts.modelUrl).then((g) => this._onLoaded(g)));
    return this._loaded;
  }
  /**
   * Make sure the fan can open the room: a saved key that still works, or
   * the unlock form. Resolves false if they close the form.
   */
  async ensureAccess() {
    const code = this.opts.hubCode ? checkCode(this.opts.hubCode) : null;
    const known = this._knownCodes();
    if (this._token && !(code?.ok && !known.includes(code.code))) {
      const ok = await this._refreshMe();
      if (ok) return true;
    }
    return this.openGate(this._token ? "add" : "unlock");
  }
  /** Show the unlock form. "add" = signed in already, adding another item. */
  openGate(mode = "unlock") {
    this._gateResolve?.(false);
    this._showGateForm(mode);
    this._open(this._el.gate);
    return new Promise((res) => this._gateResolve = res);
  }
  get _portalOn() {
    return this.opts.portal !== false;
  }
  get _ownBobo() {
    return this.opts.ownBobo !== false;
  }
  /** Everything hidden, room visible: the start of every build. */
  _arm(ghost) {
    this._closeAllLayers();
    if (this._tourI >= 0) this._tourEnd(false);
    this._el.spots.classList.add("off");
    this.root.visible = true;
    this._reveal.uSolid.value = -1;
    this._reveal.uWire.value = -1;
    this._reveal.uGhost.value = ghost;
    for (const w of this._wires) w.visible = true;
    if (this._bobo) this._bobo.visible = false;
    this._holoUniforms.uAlpha.value = 0;
    this._hideBeam(true);
    this._setShadows(false);
    this._hud(false);
    this._el.skip.hidden = true;
    this._startPolling();
  }
  /** Only the portal: the room is waiting to be built. (Without a portal: nothing yet.) */
  showPortal() {
    if (!this._room) return;
    this._arm(0);
    this._portalT = 0;
    if (!this._portalOn) this._portalScale(0);
    this._setState("portal");
  }
  /**
   * The room as a faint wireframe, nothing solid: while the host moves it
   * (AR re-placement: the outline follows the reticle with Bobo). enter()
   * builds it back from there.
   */
  preview() {
    if (!this._room) return;
    this._arm(0.3);
    this._portalScale(0);
    this.prompt(null);
    this._setState("preview");
  }
  /**
   * Build the room. With the portal, Bobo goes through it and the room builds
   * around him. Without it the wireframe races out from `origin` (a world
   * point, normally the host's Bobo), then the room materialises floor to
   * ceiling. quick: about twice as fast (a rebuild after moving the room).
   */
  enter(opts = {}) {
    if (!this._room || this._state === "building" || this._state === "live") return;
    this._ghostFrom = this._state === "preview" ? this._reveal.uGhost.value : 0;
    if (this._state === "hidden" || this._state === "preview" || this._state === "leaving") {
      this.showPortal();
      if (this._ghostFrom) this._reveal.uGhost.value = this._ghostFrom;
    }
    if (opts.origin) this._setOrigin(opts.origin);
    else if (this._portal) this._setOrigin(this._portal.getWorldPosition(this._t.v), 0.5);
    this._walkIn = opts.walk !== false && this._portalOn && this._ownBobo;
    this._buildSpeed = opts.quick ? 2 : 1;
    this._seqT = 0;
    this._portalShut = !this._portalOn;
    if (this._bobo) this._bobo.visible = false;
    this.prompt(null);
    this._setState("building");
    this._el.skip.hidden = false;
    this._sfx("whoosh");
    if (this._reduceMotion) this._buildSpeed = Math.max(this._buildSpeed, 2.2);
  }
  /** Where the wireframe draws out from (world point; lift in room units). */
  _setOrigin(world, lift = 0.4) {
    const room = this._room;
    if (!room) return;
    room.updateWorldMatrix(true, false);
    const o = this._reveal.uOrigin.value.copy(world).applyMatrix4(this._t.m.copy(room.matrixWorld).invert());
    o.y += lift;
    let d = 0;
    const b = this._box;
    for (const x of [b.min.x, b.max.x])
      for (const y of [b.min.y, b.max.y])
        for (const z of [b.min.z, b.max.z]) d = Math.max(d, this._t.v2.set(x, y, z).distanceTo(o));
    this._maxDist = d + 0.3;
  }
  /**
   * Compile the room's shaders and upload its textures ahead of time, so the
   * first build doesn't stall the frame (the "freeze, then the room pops in").
   * Call once the model has loaded, while the room is still hidden; pass the
   * scene it will render in, so the lights match. Safe to call more than once.
   */
  async warm(renderer, camera, scene) {
    if (this._warmed || !this._room || !renderer || !camera || this._disposed) return;
    this._warmed = true;
    let target = scene ?? null;
    for (let p = this.root; !target && p; p = p.parent)
      if (p.isScene) target = p;
    const flipped = [];
    this.root.traverse((o) => {
      if (!o.visible) {
        flipped.push(o);
        o.visible = true;
      }
    });
    let done = Promise.resolve();
    try {
      if (typeof renderer.compileAsync === "function")
        done = renderer.compileAsync(this.root, camera, target ?? this.root);
      else renderer.compile?.(this.root, camera, target ?? this.root);
    } catch (e) {
      console.warn("[CollectorHub] shader warm-up skipped", e);
    }
    for (const o of flipped) o.visible = false;
    await done.catch(() => void 0);
    if (typeof renderer.initTexture !== "function") return;
    const seen = /* @__PURE__ */ new Set();
    this.root.traverse((o) => {
      const mats = o.material ? Array.isArray(o.material) ? o.material : [o.material] : [];
      for (const m of mats)
        for (const k of Object.keys(m)) {
          const t = m[k];
          if (t && t.isTexture && !t.isRenderTargetTexture) seen.add(t);
        }
    });
    for (const t of seen) {
      if (this._disposed) return;
      try {
        renderer.initTexture(t);
      } catch {
      }
      await new Promise(
        (r) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 16)
      );
    }
  }
  /** Jump to the finished room. */
  skip() {
    if (!this._room) return;
    this._finishBuild();
  }
  /**
   * Bobo walks back out and the room folds away into the portal.
   * fast: fold in about a second without the walk-out (the host shows its own
   * player straight away, e.g. because a round is starting).
   */
  leave(opts = {}) {
    if (this._state !== "live" && this._state !== "building") {
      return Promise.resolve();
    }
    if (opts.origin) this._setOrigin(opts.origin);
    this._leaveSpeed = opts.fast ? 3 : 1;
    if (opts.fast && this._bobo) this._bobo.visible = false;
    if (this._tourI >= 0) this._tourEnd(false);
    this._closeAllLayers();
    this._hideBeam(false);
    this._seqT = 0;
    this._el.skip.hidden = true;
    this._hud(false);
    this._setShadows(false);
    this._setState("leaving");
    const done = new Promise((res) => this._leaveResolve = res);
    if (this._reduceMotion) this._finishLeave();
    return done;
  }
  /**
   * The "Bobo's Hideout" mode button: a small round icon (bottom left) whose
   * label slides out the first time it appears, and on hover or focus.
   * Pass null to hide it.
   */
  modeButton(onClick, label = "Bobo's Hideout", sub) {
    const b = this._el.mode;
    const was = !b.hidden;
    b.hidden = !onClick;
    if (!onClick) {
      b.classList.remove("peek");
      return;
    }
    this._el.modeLabel.textContent = label;
    this._el.modeSub.textContent = sub ?? (this._token ? "Your room" : "Unlock with your code");
    b.setAttribute("aria-label", label);
    b.title = label;
    if (!was && !this._peeked) {
      this._peeked = true;
      b.classList.add("peek");
      clearTimeout(this._peekTimer);
      this._peekTimer = setTimeout(() => b.classList.remove("peek"), 3600);
    }
    b.onclick = () => {
      this._unlockAudio();
      onClick();
    };
    this._placeMode();
  }
  /**
   * Step the mode button past any modeAvoid button in its corner (stacked
   * under it at the top, over it at the bottom), measured on screen so it
   * follows that button's own nudges and safe areas.
   */
  /** Re-measure the mode button's spot (other buttons come and go). Cheap. */
  layoutModeButton() {
    if (this._el.mode && !this._el.mode.hidden) this._placeMode();
  }
  _placeMode() {
    const b = this._el.mode;
    const ui = this._ui;
    if (!b || !ui) return;
    b.style.top = "";
    b.style.bottom = "";
    const sel = this._look.modeAvoid;
    if (!sel || b.hidden || typeof document === "undefined") return;
    const top = this._look.modeCorner.startsWith("top");
    const host = ui.getBoundingClientRect();
    const mine = b.getBoundingClientRect();
    if (!mine.width) return;
    const others = Array.from(document.querySelectorAll(sel)).filter((el) => el !== b && !b.contains(el)).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility === "hidden" || cs.display === "none" ? null : r;
    }).filter((r) => !!r && r.width > 0 && r.height > 0).filter((r) => r.right > mine.left - 4 && r.left < mine.right + 4);
    let lo = mine.top;
    let hi = mine.bottom;
    let moved = false;
    for (let pass = 0; pass < 3; pass++)
      for (const r of others) {
        if (r.bottom + 10 <= lo || r.top - 10 >= hi) continue;
        const h = hi - lo;
        if (top) {
          lo = r.bottom + 10;
          hi = lo + h;
        } else {
          hi = r.top - 10;
          lo = hi - h;
        }
        moved = true;
      }
    if (!moved) return;
    if (top) b.style.top = `${lo - host.top}px`;
    else b.style.bottom = `${host.bottom - hi}px`;
  }
  /** Change the look and layout knobs (see HubLook) at any time. */
  configure(look) {
    const L = this._look;
    const num = (v, lo, hi, d) => typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
    if (look.osSize !== void 0) L.osSize = num(look.osSize, 0.5, 1, 0.8);
    if (look.osOpacity !== void 0) L.osOpacity = num(look.osOpacity, 0.4, 1, 0.88);
    if (look.osDim !== void 0) L.osDim = num(look.osDim, 0, 0.8, 0.18);
    if (look.hudInsetRight !== void 0) L.hudInsetRight = num(look.hudInsetRight, 0, 400, 0);
    if (look.hudInsetLeft !== void 0) L.hudInsetLeft = num(look.hudInsetLeft, 0, 400, 0);
    if (look.zIndex !== void 0) L.zIndex = Math.round(num(look.zIndex, 1, 2147483e3, 2000100));
    if (look.modeBottom !== void 0) L.modeBottom = num(look.modeBottom, 0, 600, 78);
    if (look.modeTop !== void 0) L.modeTop = num(look.modeTop, 0, 600, 78);
    if (look.modeCorner !== void 0)
      L.modeCorner = ["topLeft", "topRight", "bottomLeft", "bottomRight"].includes(look.modeCorner) ? look.modeCorner : "bottomLeft";
    if (look.brightness !== void 0) L.brightness = num(look.brightness, 0.5, 3, 1);
    if (look.modeAvoid !== void 0) L.modeAvoid = String(look.modeAvoid || "");
    if (look.exitButton !== void 0) L.exitButton = !!look.exitButton;
    if (look.topOffset !== void 0) L.topOffset = num(look.topOffset, 0, 400, 0);
    if (look.joystickSide !== void 0)
      L.joystickSide = look.joystickSide === "right" ? "right" : "left";
    if (look.accents) L.accents = { ...L.accents, ...look.accents };
    if (look.menuSpot !== void 0) L.menuSpot = look.menuSpot === "dock" ? "dock" : "top";
    if (look.stickClear !== void 0) L.stickClear = num(look.stickClear, 0, 600, 0);
    const ui = this._ui;
    if (!ui) return;
    document.documentElement.style.setProperty(
      "--mlh-stick-clear",
      `${Math.round(L.stickClear)}px`
    );
    const hb = this._el.homeb;
    const holder = L.menuSpot === "dock" ? this._el.hdock : this._el.mtop;
    if (hb && holder && hb.parentElement !== holder) holder.appendChild(hb);
    for (const [k, v] of [
      ["--hp", L.accents.play],
      ["--hl", L.accents.lounge],
      ["--hr", L.accents.room]
    ]) {
      const rgb = v && rgbTriplet(v);
      if (rgb) ui.style.setProperty(k, rgb);
    }
    this._el.hdock?.classList.toggle("l", L.joystickSide === "right");
    this._dockKey = "";
    ui.style.setProperty("--mlh-os-size", String(L.osSize));
    ui.style.setProperty("--mlh-os-alpha", String(L.osOpacity));
    ui.style.setProperty("--mlh-os-dim", String(L.osDim));
    ui.style.setProperty("--mlh-hud-r", `${L.hudInsetRight}px`);
    ui.style.setProperty("--mlh-hud-l", `${L.hudInsetLeft}px`);
    ui.style.setProperty("--mlh-mode-bottom", `${L.modeBottom}px`);
    ui.style.setProperty("--mlh-mode-top", `${L.modeTop}px`);
    const mode = this._el.mode;
    if (mode) {
      mode.classList.toggle("mlh-mode-t", L.modeCorner.startsWith("top"));
      mode.classList.toggle("mlh-mode-r", L.modeCorner.endsWith("Right"));
      this._placeMode();
    }
    this._applyLights();
    ui.style.zIndex = String(L.zIndex);
    ui.classList.toggle("mlh-hostmenu", L.hudInsetRight > 0 || L.hudInsetLeft > 0);
    ui.style.setProperty("--mlh-top", `${L.topOffset}px`);
    this._el.os?.classList.toggle("full", L.osSize >= 0.97);
    if (this._el.exit) this._el.exit.hidden = !this.opts.exitLabel || !L.exitButton;
  }
  /** Remove the room from view (no animation). */
  hide() {
    this.endAdjust();
    if (this._tourI >= 0) this._tourEnd(false);
    this._fanToggle(false);
    this._closeAllLayers();
    this._el.spots.classList.add("off");
    this.root.visible = false;
    this._hud(false);
    this.prompt(null);
    this._el.skip.hidden = true;
    this._stopPolling();
    this._setState("hidden");
  }
  /** World position of the portal's mouth (on the floor in front of it). */
  portalPosition(target = new THREE3.Vector3()) {
    if (!this._portal) return target.copy(this.root.position);
    return this._portal.getWorldPosition(target);
  }
  /**
   * Put the room so its portal stands `distance` in front of the player, on
   * the far side from the camera, facing the camera. scale = room units → world.
   */
  placeNear(playerWorld, cameraWorld, distance, scale) {
    const parent = this.root.parent;
    let player = playerWorld.clone();
    let cameraPos = cameraWorld.clone();
    let ps = 1;
    if (parent) {
      parent.updateMatrixWorld(true);
      ps = parent.getWorldScale(new THREE3.Vector3()).x || 1;
      player = parent.worldToLocal(player);
      cameraPos = parent.worldToLocal(cameraPos);
    }
    scale /= ps;
    distance /= ps;
    const dir = this._t.v.set(cameraPos.x - player.x, 0, cameraPos.z - player.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    this.root.rotation.set(0, yaw, 0);
    this.root.scale.setScalar(scale);
    const portalLocal = this._portal ? this._portal.position.clone() : new THREE3.Vector3(0, 0, 2);
    const off = portalLocal.multiplyScalar(scale).applyAxisAngle(new THREE3.Vector3(0, 1, 0), yaw);
    const portalWorld = this._t.v2.copy(player).addScaledVector(dir, -distance);
    this.root.position.set(portalWorld.x - off.x, player.y - off.y, portalWorld.z - off.z);
    this.root.updateMatrixWorld(true);
  }
  /**
   * Stand the room around `center` (Bobo's spot, in `parent`'s space) with its
   * open side toward the camera, so the desk and the big screen face the
   * viewer. The room joins `parent`: in AR that's the space the placed scene
   * lives in, so the room is locked to the same anchor as Bobo and can't drift
   * away from him.
   *
   * scale: room units → parent units (the smallest the room may be).
   * wrapViewer: make room for the person holding the phone too. The room
   * slides toward them (Bobo ends up in the back half, by his desk) and grows,
   * up to maxScale, until both of them are inside it, so in AR it builds
   * around the viewer. It stays centred on the line from the camera to Bobo,
   * which is the middle of the screen at placement. Returns the scale used.
   */
  placeAround(o) {
    const parent = o.parent ?? this.root.parent;
    if (parent && this.root.parent !== parent) parent.add(this.root);
    parent?.updateMatrixWorld(true);
    const cam = parent ? parent.worldToLocal(o.cameraWorld.clone()) : o.cameraWorld.clone();
    const dx = cam.x - o.center.x;
    const dz = cam.z - o.center.z;
    const d = Math.hypot(dx, dz);
    const yaw = (d > 1e-6 ? Math.atan2(dx, dz) : 0) - OPEN_YAW;
    const inner = this._radius * 0.92;
    const max = Math.max(o.scale, o.maxScale ?? o.scale * 4);
    let s = Math.max(1e-4, o.scale);
    if (o.eyeLevel && this._loftY > 0) {
      const eye = cam.y - o.center.y + (o.drop ?? 0);
      if (eye > 1e-3) s = Math.min(max, Math.max(s, eye * o.eyeLevel / this._loftY));
    }
    const home = new THREE3.Vector3();
    if (this._bed) home.set(this._bed.position.x, 0, this._bed.position.z);
    home.applyAxisAngle(UP, yaw);
    const pos = new THREE3.Vector3();
    const spot = Math.min(1.1, Math.max(0.3, o.viewerSpot ?? 0.8));
    const place = () => {
      let shift = 0;
      if (o.wrapViewer && d > 1e-6) {
        const CAM = spot;
        const BOBO = 0.5;
        const R = inner * s;
        if (d > R * CAM) shift = Math.min(BOBO * R, Math.max(0, d - CAM * R));
      }
      pos.set(
        o.center.x + (d > 1e-6 ? dx / d * shift : 0) - home.x * s,
        o.center.y,
        o.center.z + (d > 1e-6 ? dz / d * shift : 0) - home.z * s
      );
      return Math.hypot(cam.x - pos.x, cam.z - pos.z) / (inner * s);
    };
    const sized = !!(o.eyeLevel && this._loftY > 0);
    let out = place();
    for (let i = 0; o.wrapViewer && !sized && out > spot && s < max && i < 40; i++) {
      s = Math.min(max, s * 1.06);
      out = place();
    }
    this.lastPush.set(0, 0, 0);
    if (o.wrapViewer && (out < spot || sized && out > spot)) {
      let vx = pos.x - cam.x;
      let vz = pos.z - cam.z;
      let len = Math.hypot(vx, vz);
      if (len < 1e-6 && d > 1e-6) {
        vx = -dx;
        vz = -dz;
        len = d;
      }
      if (len > 1e-6) {
        const extra = Math.max(-2 * inner * s, (spot - out) * inner * s);
        this.lastPush.set(vx / len * extra, 0, vz / len * extra);
        pos.add(this.lastPush);
      }
    }
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.scale.setScalar(s);
    if (this._bed)
      this._bed.scale.setScalar(
        this._bedScale * Math.min(1, Math.max(0.15, (o.boboScale ?? s) / s))
      );
    this.root.updateMatrixWorld(true);
    this._applyLights();
    return s;
  }
  /**
   * Keep the room equally lit at any size and apply the brightness knob.
   * A point light's reach and falloff are in world units, not the room's,
   * so a room scaled up 4x would otherwise be lit like a quarter-size one:
   * reach grows with the scale and intensity with scale^decay.
   */
  _applyLights() {
    if (!this._room) return;
    const ws = this.root.getWorldScale(this._t.v).x || 1;
    const b = this._look.brightness;
    if (Math.abs(ws - this._lit.scale) < 1e-3 * ws && b === this._lit.brightness) return;
    const envChanged = b !== this._lit.brightness;
    this._lit.scale = ws;
    this._lit.brightness = b;
    for (const l of this._lights) {
      const base = l.userData.mlhBase;
      if (!base) continue;
      const pl = l;
      if (pl.isPointLight) {
        pl.distance = base.distance * ws;
        pl.intensity = base.intensity * b * Math.pow(ws, pl.decay || 0);
      } else l.intensity = base.intensity * b;
    }
    if (!envChanged) return;
    const env = Math.min(2, 0.6 + 0.4 * b);
    this._room.traverse((o) => {
      var _a;
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m || m.envMapIntensity === void 0) continue;
        (_a = m.userData).mlhEnv ?? (_a.mlhEnv = m.envMapIntensity);
        m.envMapIntensity = m.userData.mlhEnv * env;
      }
    });
  }
  /**
   * Keep Bobo's bed his size at the room's current scale (boboScale: the
   * scale at which the furniture is Bobo-sized, as in placeAround).
   */
  fitBed(boboScale) {
    if (!this._bed) return;
    const s = this.root.scale.x || 1;
    this._bed.scale.setScalar(this._bedScale * Math.min(1, Math.max(0.15, boboScale / s)));
  }
  /** The room's inner floor radius, in the room parent's units (for keeping Bobo inside). */
  floorRadius() {
    return this._radius * 0.9 * this.root.scale.x;
  }
  /** Horizontal distance from a world point to the portal. */
  distanceToPortal(p) {
    const q = this.portalPosition(this._t.v);
    return Math.hypot(p.x - q.x, p.z - q.z);
  }
  /** A good look at the room for hosts that drive their own camera. */
  focus() {
    const target = this.root.localToWorld(new THREE3.Vector3(-0.2, 1.25, 0.4));
    const radius = 3.6 * this.root.getWorldScale(this._t.v).x;
    return { target, radius, yaw: this.root.rotation.y };
  }
  /** A short message (and an optional button) at the bottom of the screen. */
  prompt(text, button) {
    const p = this._el.prompt;
    if (!text && !button) {
      p.classList.remove("on");
      return;
    }
    const msg = p.querySelector("p");
    msg.textContent = text || "";
    msg.hidden = !text;
    const b = p.querySelector("button");
    b.hidden = !button;
    if (button) {
      b.textContent = button.label;
      b.onclick = () => {
        this._unlockAudio();
        button.onClick();
      };
    }
    p.classList.add("on");
  }
  toast(msg) {
    const t = this._el.toast;
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("on"), 2400);
  }
  /* ── Home screen: BOBO OS as the host's home (see HubHome) ───────────── */
  /**
   * Make BOBO OS the host's home screen (null: back to a plain hideout).
   * The hub then draws one home button and Bobo's moves button in the
   * bottom corner away from the joystick; the host's own menu, sound and
   * reset buttons should step aside (they're all in the sheet).
   */
  setHome(home) {
    this._home = home;
    this._ui?.classList.toggle("mlh-homed", !!home);
    document.documentElement.classList.toggle("mlh-homed", !!home);
    if (!home) {
      this.closeHome(true);
      this._fanToggle(false);
    }
    this._dockKey = "";
    this.syncHome();
  }
  get homeOpen() {
    return !!this._el.home?.classList.contains("open");
  }
  /**
   * Bring the dock in line with the host (cheap: call it whenever the host
   * changes mode, or a few times a second).
   */
  syncHome() {
    this._syncModal();
    const h = this._home;
    const dock = this._el.hdock;
    if (!dock) return;
    const mode = h ? h.mode() : "";
    if (this._adjusting && (mode !== "room" || this._state !== "live")) this.endAdjust();
    const moves = h && h.movesReady() && this._tourI < 0 ? h.moves() : [];
    const show = !!h && this._tourI < 0 && !this._el.gate.classList.contains("open") && !this._adjusting;
    const top = this._look.menuSpot !== "dock";
    const key = `${show}|${mode}|${top}|${moves.map((m) => m.id + m.label).join(",")}`;
    if (key === this._dockKey) return;
    this._dockKey = key;
    if (mode !== this._homeMode) {
      this._homeMode = mode;
      this._ui.classList.toggle("mlh-m-lounge", mode === "lounge");
      this._ui.classList.toggle("mlh-m-room", mode === "room");
    }
    const dockOn = show && (!top || moves.length > 0);
    dock.hidden = !dockOn;
    if (this._el.mtop) this._el.mtop.hidden = !(show && top);
    this._ui.classList.toggle("mlh-docked", dockOn);
    const hb = this._el.homeb;
    const pz = mode === "play";
    hb.classList.toggle("pzm", pz);
    hb.setAttribute("aria-label", pz ? "Pause the round and open BOBO OS" : "Open BOBO OS");
    hb.title = pz ? "Pause" : "BOBO OS";
    this._el.act.hidden = !moves.length;
    if (!moves.length) this._fanToggle(false);
    this._renderFan(moves);
    if (this.homeOpen) this._renderHome();
  }
  openHome() {
    const h = this._home;
    if (!h) return;
    this._fanToggle(false);
    this.closeOS();
    if (this.homeOpen) return this._renderHome();
    this._closeLayer(this._el.sheet);
    this._closeLayer(this._el.col);
    this._renderHome();
    this._open(this._el.home);
    this._el.homeb.classList.add("on");
    this._el.homeb.setAttribute("aria-expanded", "true");
    this._sfx("click");
    h.opened?.();
  }
  /** quiet: closing on the way to something else (no closed() call, no focus return). */
  closeHome(quiet = false) {
    const el = this._el.home;
    if (!el?.classList.contains("open")) return;
    el.classList.remove("open");
    this._syncModal();
    this._el.homeb.classList.remove("on");
    this._el.homeb.setAttribute("aria-expanded", "false");
    if (quiet) return;
    this._lastFocus?.focus?.({ preventScroll: true });
    this._home?.closed?.();
  }
  /* ── Adjust room: resize, turn and move it (see RoomFitter) ───────── */
  /** Let the fan resize, turn and move the room (null: they can't). */
  setFitter(f) {
    this._fitter = f;
    if (!f) this.endAdjust();
  }
  get adjusting() {
    return this._adjusting;
  }
  /** Open the Adjust room panel (room built and on screen only). */
  startAdjust() {
    if (!this._fitter || this._state !== "live" || this._adjusting) return;
    this.closeHome(true);
    this._fanToggle(false);
    this._closeAllLayers();
    if (this._tourI >= 0) this._tourEnd(false);
    this.prompt(null);
    this._adjusting = true;
    const el = this._el.adj;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("open"));
    this._ui.classList.add("mlh-adjusting");
    document.documentElement.classList.add("mlh-adjusting");
    this._hud(false);
    this._syncAdj();
    this._dockKey = "";
    this.syncHome();
    this._sfx("click");
    setTimeout(() => this._el.adjDone?.focus({ preventScroll: true }), 60);
    this._emit("adjust", { on: true });
  }
  endAdjust() {
    if (!this._adjusting) return;
    this._adjusting = false;
    const el = this._el.adj;
    el.classList.remove("open");
    el.hidden = true;
    this._ui.classList.remove("mlh-adjusting");
    document.documentElement.classList.remove("mlh-adjusting");
    if (this._state === "live") this._hud(true);
    this._dockKey = "";
    this.syncHome();
    this._emit("adjust", { on: false });
  }
  /** The panel shows what the room is now. */
  _syncAdj() {
    const f = this._fitter;
    if (!f || !this._el.adj) return;
    const { size } = f.get();
    const [lo, hi] = f.range();
    const t = Math.log(size / lo) / Math.log(hi / lo);
    const input = this._el.adjSize;
    if (document.activeElement !== input)
      input.value = String(Math.round(Math.min(1, Math.max(0, t)) * 1e3));
    this._el.adjPct.textContent = `${Math.round(size * 100)}%`;
  }
  _bindAdjust() {
    const el = this._el.adj;
    if (!el) return;
    const f = () => this._fitter;
    const sizeFrom = (v) => {
      const fit = f();
      if (!fit) return 1;
      const [lo, hi] = fit.range();
      return lo * Math.pow(hi / lo, v / 1e3);
    };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-adj]");
      const fit = f();
      if (!b || !fit) return;
      const k = fit.get().size;
      const a = b.dataset.adj;
      if (a === "smaller") fit.setSize(k / 1.1);
      else if (a === "bigger") fit.setSize(k * 1.1);
      else if (a === "ccw") fit.turn(Math.PI / 12);
      else if (a === "cw") fit.turn(-Math.PI / 12);
      else if (a === "reset") fit.reset();
      this._sfx("click");
      this._syncAdj();
    });
    const input = this._el.adjSize;
    input.addEventListener("input", () => {
      f()?.setSize(sizeFrom(Number(input.value)));
      this._el.adjPct.textContent = `${Math.round((f()?.get().size ?? 1) * 100)}%`;
    });
    input.addEventListener("change", () => this._syncAdj());
    this._el.adjDone.addEventListener("click", () => this.endAdjust());
  }
  /** Where a screen point meets the room's floor (world), or null. */
  _floorHit(x, y, out) {
    const cam = this.opts.getCamera();
    if (!cam) return null;
    const r = this.opts.canvas.getBoundingClientRect();
    this._ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, cam);
    const floorY = this.root.getWorldPosition(this._t.v2).y;
    this._floorPlane.set(UP, -floorY);
    return this._ray.ray.intersectPlane(this._floorPlane, out);
  }
  _renderFan(moves) {
    const fan = this._el.fan;
    const n = moves.length;
    const left = this._look.joystickSide === "right";
    const corner = this._look.menuSpot !== "dock";
    const R = corner ? n > 3 ? 185 : 150 : n > 3 ? 128 : 112;
    const a0 = corner ? n > 3 ? 50 : n > 2 ? 52 : 60 : n > 2 ? 62 : 80;
    const a1 = corner ? n > 2 ? 96 : 92 : n > 2 ? 158 : 140;
    fan.innerHTML = moves.map((m, i) => {
      const deg = n > 1 ? a0 + (a1 - a0) * i / (n - 1) : 90;
      const r = deg * Math.PI / 180;
      const x = Math.round(Math.cos(r) * R * (left !== corner ? -1 : 1));
      const y = Math.round(-Math.sin(r) * R);
      return `<div class="it" style="--x:${x}px;--y:${y}px;--i:${i}"><button type="button" role="menuitem" data-mv="${esc(m.id)}" aria-label="${esc(m.label)}" tabindex="-1">${m.svg}</button><span aria-hidden="true">${esc(m.label)}</span></div>`;
    }).join("");
    for (const b of fan.querySelectorAll("[data-mv]"))
      b.addEventListener("click", () => {
        this._fanToggle(false, true);
        this._sfx("click");
        this._home?.move(b.dataset.mv);
      });
    this._placeFan();
  }
  /** The fan is centred on the moves button. */
  _placeFan() {
    const fan = this._el.fan;
    const act = this._el.act;
    if (act.hidden) return;
    fan.style.left = `${act.offsetLeft + act.offsetWidth / 2}px`;
    fan.style.top = `${act.offsetTop + act.offsetHeight / 2}px`;
  }
  _fanToggle(open = !this._fanOpen, focusBack = false) {
    if (!this._el.fan) return;
    if (open && (!this._home || this._el.act.hidden)) open = false;
    if (open === this._fanOpen) return;
    this._fanOpen = open;
    this._placeFan();
    this._el.fan.classList.toggle("open", open);
    this._el.act.setAttribute("aria-expanded", String(open));
    this._el.act.setAttribute("aria-label", open ? "Close Bobo's moves" : "Bobo's moves");
    const items = this._el.fan.querySelectorAll("[data-mv]");
    items.forEach((b) => b.tabIndex = open ? 0 : -1);
    if (open) {
      this._sfx("click");
      setTimeout(() => items[0]?.focus({ preventScroll: true }), 60);
    } else if (focusBack) this._el.act.focus({ preventScroll: true });
  }
  _renderHome() {
    const h = this._home;
    const box = this._el.hs;
    if (!h || !box) return;
    const mode = h.mode();
    const au = h.audio();
    const join = h.join();
    const reward = h.reward?.() ?? null;
    const canFit = !!this._fitter && mode === "room" && this._state === "live";
    const inRound = mode === "play" || mode === "paused";
    const modes = [
      {
        go: "play",
        name: "Cola Run",
        sub: inRound ? "Your round" : "Grab the cans",
        icon: ICON.play,
        cur: inRound
      },
      {
        go: "lounge",
        name: "Lounge",
        sub: "Hang out with Bobo",
        icon: ICON.paw,
        cur: mode === "lounge"
      },
      { go: "room", name: "My Room", sub: "Bobo's Hideout", icon: ICON.home, cur: mode === "room" }
    ];
    const apps = APPS.filter((a) => a.id !== "colarun");
    box.innerHTML = `
<div class="mlh-hs-grab" aria-hidden="true"></div>
<div class="mlh-hs-head">
  <span class="mk">${OS_MARK}</span>
  <div class="t"><b>BOBO <i>OS</i></b><small>${esc(h.status())}</small></div>
  <button type="button" class="mlh-hs-x" data-hx aria-label="Close BOBO OS">${ICON.close}</button>
</div>
${mode === "paused" ? `<div class="mlh-hs-resume"><button type="button" data-go="resume">${ICON.play}Resume round</button><button type="button" data-go="restart">Restart</button></div>` : ""}${reward ? `<button type="button" class="mlh-hs-reward" data-q="reward"><i>${ICON.trophy}</i><span><b>${esc(reward.title)}</b><small>${esc(reward.sub)}</small></span>${ICON.chev}</button>` : ""}
<div class="mlh-hs-modes" role="group" aria-label="Modes">${modes.map(
      (m) => `<button type="button" data-go="${m.go}" class="${m.cur ? "cur" : ""}"${m.cur ? ' aria-current="true"' : ""}><i>${m.icon}</i><b>${m.name}</b><small>${m.sub}</small></button>`
    ).join("")}</div>
<div class="mlh-hs-h" id="mlh-hs-apps">Apps</div>
<div class="mlh-hs-apps" role="group" aria-labelledby="mlh-hs-apps">${apps.map(
      (a) => `<button type="button" data-app="${a.id}">${tileFor(a, a.id === "alerts")}<span>${esc(a.name)}</span></button>`
    ).join("")}</div>
<div class="mlh-hs-h" id="mlh-hs-q">Settings</div>
<div class="mlh-hs-quick" role="group" aria-labelledby="mlh-hs-q">
  <button type="button" data-q="music" aria-pressed="${au.music}">${ICON.music}Music</button>
  <button type="button" data-q="sound" aria-pressed="${au.sound}">${ICON.sound}Sound</button>
  ${canFit ? `<button type="button" data-q="fit">${ICON.resize}Resize room</button>` : ""}
  <button type="button" data-q="move">${ICON.move}Move scene</button>
  <button type="button" data-q="help">${ICON.help}How to play</button>
</div>
${join ? `<button type="button" class="mlh-hs-join" data-q="join">${esc(join.label)}${ICON.external}</button>` : ""}`;
    this._renderTray();
    const go = (fn) => () => {
      this.closeHome(true);
      fn();
      this.syncHome();
    };
    box.querySelector("[data-hx]").addEventListener("click", () => this.closeHome());
    for (const b of box.querySelectorAll("[data-go]")) {
      const to = b.dataset.go;
      b.addEventListener(
        "click",
        to === "play" && inRound || to === "lounge" && mode === "lounge" || to === "room" && mode === "room" ? () => this.closeHome() : go(() => h.go(to))
      );
    }
    for (const b of box.querySelectorAll("[data-app]"))
      b.addEventListener("click", () => this.openOS(b.dataset.app));
    for (const b of box.querySelectorAll("[data-q]"))
      b.addEventListener("click", () => {
        const q = b.dataset.q;
        if (q === "music" || q === "sound") {
          const on = b.getAttribute("aria-pressed") !== "true";
          h.setAudio(q, on);
          b.setAttribute("aria-pressed", String(on));
          this._sfx("click");
        } else if (q === "move") go(() => h.replace())();
        else if (q === "fit") this.startAdjust();
        else if (q === "reward") go(() => h.doReward?.())();
        else if (q === "help") go(() => h.howTo())();
        else if (q === "join") h.doJoin();
      });
    const head = box.querySelector(".mlh-hs-head");
    const grab = box.querySelector(".mlh-hs-grab");
    let y0 = -1;
    const down = (e) => {
      if (e.target.closest("button")) return;
      y0 = e.clientY;
      box.style.transition = "none";
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (y0 < 0) return;
      box.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`;
    };
    const up = (e) => {
      if (y0 < 0) return;
      const dy = e.clientY - y0;
      y0 = -1;
      box.style.transition = "";
      box.style.transform = "";
      if (dy > 70) this.closeHome();
    };
    for (const el of [head, grab]) {
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    }
  }
  openOS(app) {
    if (this._state !== "live" && !(this._home && this._token)) return;
    this.closeHome(true);
    this._hideBeam(false);
    this._closeLayer(this._el.sheet);
    this._closeLayer(this._el.col);
    const os = this._el.os;
    const first = !os.classList.contains("open");
    if (first) {
      this._lastFocus = document.activeElement;
      os.classList.add("open");
      this._syncModal();
      this._sfx("boot");
      this._emit("osOpen", void 0);
      const boot = this._el.boot;
      if (!this._booted && !this._reduceMotion) {
        boot.classList.remove("off");
        setTimeout(() => boot.classList.add("off"), 900);
      } else boot.classList.add("off");
      this._booted = true;
      this._el.os.querySelector(".mlh-dicon")?.focus({
        preventScroll: true
      });
    }
    this._renderTray();
    if (app)
      setTimeout(
        () => this._openApp(app),
        first && !this._reduceMotion && this._el.boot.classList.contains("off") === false ? 950 : 0
      );
  }
  closeOS() {
    const os = this._el.os;
    if (!os.classList.contains("open")) return;
    os.classList.remove("open");
    this._syncModal();
    for (const id of [...this._wins.keys()]) this._closeApp(id, true);
    this._emit("osClose", void 0);
    this._lastFocus?.focus?.({ preventScroll: true });
  }
  openCollection(focus) {
    if (this._state !== "live" && this._state !== "portal") return;
    this._closeLayer(this._el.sheet);
    this._renderCollection(this._el.colBody, focus);
    this._open(this._el.col);
  }
  signOut() {
    this._token = null;
    this._me = null;
    store.set(this._k("session"), null);
    this._applyOwnership();
    this._renderHud();
    this.closeOS();
    this._emit("signedOut", void 0);
  }
  /** Per frame, from the host's loop. dt in seconds. */
  update(dt) {
    if (this._disposed || !this._room || !this.root.visible) return;
    dt = Math.min(dt, 0.1);
    this._time += dt;
    this._room.updateWorldMatrix(true, false);
    this._reveal.uRoomInv.value.copy(this._room.matrixWorld).invert();
    this._applyLights();
    if (this._state === "portal") this._updatePortal(dt);
    else if (this._state === "building") this._updateBuild(dt);
    else if (this._state === "leaving") this._updateLeave(dt);
    if (this._spots.length) this._updateSpots();
    this._mixer?.update(dt);
    const still = this._reduceMotion;
    if (this._swirl && !still)
      this._swirl.rotateOnAxis(
        this._swirlAxis,
        dt * (this._state === "building" || this._state === "leaving" ? 4 : 1.4)
      );
    if (this._orbitCans && !still) this._orbitCans.rotation.y += dt * 0.18;
    if (!still)
      for (const f of this._fizz)
        f.o.position.y = f.y + Math.sin(this._time * 1.3 + f.phase) * f.amp;
    if (this._alertMat)
      this._alertMat.emissiveIntensity = this._unread() ? 1.4 + 1.4 * Math.sin(this._time * 5) : 0.5;
    if (this._tabWiggle > 0 && this._pullTab) {
      this._pullTab.rotation.z = this._pullRest + Math.sin(this._tabWiggle * 30) * 0.12 * this._tabWiggle;
      this._tabWiggle = Math.max(0, this._tabWiggle - dt * 1.2);
    }
    this._holoUniforms.uTime.value = this._time;
    const wantHolo = this._state === "live" ? 1 : 0;
    this._holoUniforms.uAlpha.value += (wantHolo - this._holoUniforms.uAlpha.value) * (1 - Math.exp(-3 * dt));
    if (!still)
      for (const s of this._slots) {
        if (!s.holo) continue;
        s.holo.rotation.y += dt * 0.7;
        s.holo.position.y = s.y + Math.sin(this._time * 1.6 + s.phase) * 0.012;
      }
    if (this._screenMat) {
      this._flash = Math.max(0, this._flash - dt * 1.8);
      this._screenMat.emissiveIntensity = this._screenBase * (1 + this._flash * 2.2);
    }
    this._updateScreen(dt);
    this._updateBeam(dt);
    this._updateBurst(dt);
  }
  /** Tap at a screen point. Returns true if it hit something in the room. */
  tap(clientX, clientY) {
    const id = this._pick(clientX, clientY);
    if (!id) return false;
    this._unlockAudio();
    this._onTap(id);
    return true;
  }
  dispose() {
    this._disposed = true;
    this._stopPolling();
    for (const off of this._off) off();
    document.documentElement.classList.remove("mlh-modal", "mlh-homed", "mlh-adjusting");
    document.documentElement.style.removeProperty("--mlh-stick-clear");
    this._gateResolve?.(false);
    this._leaveResolve?.();
    this.root.parent?.remove(this.root);
    this._room?.traverse((o) => {
      if (o.isMesh || o.isLine) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose();
          m.dispose();
        }
      }
    });
    for (const m of this._owned) m.dispose();
    for (const g of this._geos) g.dispose();
    for (const t of this._texs) t.dispose();
    this._ui.remove();
    this._style?.remove();
  }
  /* ── loading ──────────────────────────────────────────────────────── */
  _onLoaded(gltf) {
    if (this._disposed) return;
    const room = this._room = gltf.scene;
    this.root.add(room);
    room.updateMatrixWorld(true);
    const roomInv = new THREE3.Matrix4().copy(room.matrixWorld).invert();
    const local = (o, out = new THREE3.Vector3()) => o.getWorldPosition(out).applyMatrix4(roomInv);
    this._portal = room.getObjectByName("hub_portal");
    this._pad = room.getObjectByName("hub_spawn_pad");
    this._bobo = room.getObjectByName("hub_bobo");
    this._bed = room.getObjectByName("hub_cat_bed") ?? void 0;
    const loft = room.getObjectByName("Loft_Floor");
    if (loft) {
      room.updateMatrixWorld(true);
      const lb = new THREE3.Box3().setFromObject(loft);
      this._loftY = lb.isEmpty() ? 1.85 : room.worldToLocal(new THREE3.Vector3(0, lb.max.y, 0)).y;
    } else this._loftY = 1.85;
    if (this._bed) this._bedScale = this._bed.scale.x || 1;
    this._swirl = room.getObjectByName("Portal_Swirl");
    this._orbitCans = room.getObjectByName("hub_orbit_cans");
    this._pullTab = room.getObjectByName("hub_pull_tab");
    this._pullRest = this._pullTab?.rotation.z ?? 0;
    const lamp = room.getObjectByName("hub_cola_lamp");
    if (lamp) {
      const b = new THREE3.Box3().setFromObject(lamp);
      b.getCenter(this._lampPos).applyMatrix4(roomInv);
    }
    if (this._portal) local(this._portal, this._reveal.uOrigin.value).y += 0.5;
    const box = new THREE3.Box3().setFromObject(room).applyMatrix4(roomInv);
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          this._maxDist = Math.max(
            this._maxDist,
            this._t.v.set(x, y, z).distanceTo(this._reveal.uOrigin.value)
          );
    this._maxDist += 0.3;
    this._box.copy(box);
    const wall = room.getObjectByName("Can_Wall");
    const wb = wall ? new THREE3.Box3().setFromObject(wall).applyMatrix4(roomInv) : box;
    this._radius = Math.max(-wb.min.x, wb.max.x, -wb.min.z, wb.max.z, 0.5);
    this._reveal.uFloor.value = box.min.y;
    this._maxH = box.max.y - box.min.y + 0.15;
    if (this._swirl && this._swirl.geometry) {
      const g = this._swirl.geometry;
      g.computeBoundingBox();
      const s = g.boundingBox.getSize(this._t.v);
      const dims = [s.x, s.y, s.z];
      this._swirlAxis.set(0, 0, 0).setComponent(dims.indexOf(Math.min(...dims)), 1);
    }
    const stepNodes = [0, 1, 2, 3].map((i) => room.getObjectByName("Step_" + i)).filter(Boolean);
    for (const n of [this._portal, this._pad, ...stepNodes])
      n?.traverse((o) => {
        if (!o.isMesh) return;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      });
    if (this.opts.pbr !== false) this._upgradeMaterials(room);
    this._makeWireMaterial();
    this._makeHoloMaterial();
    const inSub = (o, n) => {
      for (let p = o; p; p = p.parent) if (p === n) return true;
      return false;
    };
    room.traverse((o) => {
      if (o.name?.startsWith("Fizz_"))
        this._fizz.push({
          o,
          y: o.position.y,
          phase: Math.random() * 6.28,
          amp: 0.05 + Math.random() * 0.07
        });
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.transmission > 0) {
          m.transmission = 0;
          m.transparent = true;
          m.opacity = Math.min(m.opacity, 0.28);
          m.depthWrite = false;
        }
        if (/^(Neon_|Lamp_Blob)/.test(m.name))
          m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 2.2);
        if (m.name === "Bulb_Warm") m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 3);
        if (m.name === "Portal_Swirl") m.emissiveIntensity = 1.3;
        if (m.name === "Sign_EVADE") m.emissiveIntensity = 1.2;
        if (m.name === "Porthole_Sky") m.emissiveIntensity = 0.9;
        if (m.name === "Hologram_Ghost")
          m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 1, 1.2);
        if (m.name === "Glass" || m.name === "Acrylic_Clear") {
          m.opacity = 0.1;
          m.roughness = 0.05;
        }
      }
      if (o.name === "hub_alert_light") {
        o.material = o.material.clone();
        this._alertMat = o.material;
        this._owned.push(o.material);
      }
      if (inSub(o, this._bobo)) {
        o.frustumCulled = false;
        if (this._ownBobo) this._pickables.push(o);
        return;
      }
      this._pickables.push(o);
      if (inSub(o, this._portal) || inSub(o, this._pad) || stepNodes.some((n) => inSub(o, n)))
        return;
      for (const m of mats) this._patch(m);
      if (!o.isSkinnedMesh && o.geometry.attributes.position.count < 6e4 && !/_Holo|Holo_/.test(o.parent?.name || "")) {
        const eg = new THREE3.EdgesGeometry(o.geometry, 30);
        this._geos.push(eg);
        const line = new THREE3.LineSegments(eg, this._wireMat);
        line.raycast = () => void 0;
        line.renderOrder = 2;
        o.add(line);
        this._wires.push(line);
      }
    });
    this._setupSlots();
    this._setupScreen(local);
    this._setupBeam();
    this._setupBurst();
    if (this.opts.lights) {
      const add = (l, p) => {
        l.position.copy(p);
        l.userData.mlhBase = { intensity: l.intensity, distance: l.distance ?? 0 };
        room.add(l);
        this._lights.push(l);
      };
      add(new THREE3.HemisphereLight(16774116, 3812424, 0.85), new THREE3.Vector3(0, 3, 0));
      add(new THREE3.PointLight(16766896, 2.4, 6, 1.6), new THREE3.Vector3(0, 1.4, 0.2));
      add(new THREE3.PointLight(10480127, 1.6, 5, 1.6), new THREE3.Vector3(-0.6, 3, -0.6));
      add(
        new THREE3.PointLight(16736174, 1.4, 2.5, 1.6),
        this._lampPos.clone().add(new THREE3.Vector3(0, 0.2, 0))
      );
    }
    this._mixer = new THREE3.AnimationMixer(room);
    for (const clip of gltf.animations) this._actions[clip.name] = this._mixer.clipAction(clip);
    if (this._bobo) {
      this._boboHome.pos.copy(this._bobo.position);
      this._boboHome.quat.copy(this._bobo.quaternion);
    }
    this._buildWalk(local);
    if (!this._portalOn) {
      for (const n of [this._portal, this._pad, ...stepNodes]) if (n) n.visible = false;
      this._swirl = void 0;
    }
    if (!this._ownBobo && this._bobo) this._bobo.visible = false;
    this._applyOwnership();
    this._setShadows(false);
    this._buildSpots();
    this._renderHud();
  }
  /**
   * Make the room read more like real materials: shiny brushed aluminium,
   * a clear-coated printed can, real-feeling wood grain, plaster and fabric.
   */
  _upgradeMaterials(room) {
    const env = studioEnv();
    this._texs.push(env);
    const maps = {};
    const detail = (kind, rough, size = 256) => {
      const key = kind + rough.join();
      if (!maps[key]) {
        maps[key] = detailMaps(size, heightField(size, HEIGHTS[kind]), rough);
        this._texs.push(maps[key].normal, maps[key].rough);
      }
      return maps[key];
    };
    const swap = /* @__PURE__ */ new Map();
    const metal = (m, rough, tint) => {
      m.metalness = 1;
      m.roughness = rough;
      if (tint !== void 0) m.color.setHex(tint);
      const d = detail("brushed", [0.55, 1], 256);
      m.roughnessMap = d.rough;
      m.normalMap = d.normal;
      m.normalScale = new THREE3.Vector2(0.12, 0.12);
      m.envMap = env;
      m.envMapIntensity = 1.15;
    };
    const surface = (m, kind, rough, n, rep = 4) => {
      const d = detail(kind, [0.7, 1]);
      const nm = d.normal.clone();
      const rm = d.rough.clone();
      nm.repeat.set(rep, rep);
      rm.repeat.set(rep, rep);
      nm.needsUpdate = rm.needsUpdate = true;
      this._texs.push(nm, rm);
      m.normalMap = nm;
      m.normalScale = new THREE3.Vector2(n, n);
      m.roughnessMap = rm;
      m.roughness = rough;
      m.envMap = env;
      m.envMapIntensity = 0.5;
    };
    room.traverse((o) => {
      if (!o.isMesh) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const next = list.map((m) => {
        if (!m?.isMeshStandardMaterial) return m;
        if (swap.has(m)) return swap.get(m);
        let out = m;
        switch (m.name) {
          case "Can_Aluminium":
          case "Diorama_Rim":
            metal(m, 0.2, 14672874);
            break;
          case "Metal_Silver":
          case "Metal_Nickel":
            metal(m, 0.16);
            break;
          case "Metal_Nickel_Brushed":
            metal(m, 0.3);
            break;
          case "Gold":
          case "Trophy_Gold":
            metal(m, 0.18);
            break;
          case "Can_Label": {
            const p = new THREE3.MeshPhysicalMaterial();
            THREE3.MeshStandardMaterial.prototype.copy.call(p, m);
            p.metalness = 0.42;
            p.roughness = 0.24;
            p.clearcoat = 1;
            p.clearcoatRoughness = 0.05;
            p.envMap = env;
            p.envMapIntensity = 1.7;
            out = p;
            this._owned.push(p);
            break;
          }
          case "Wood_Floor":
          case "Wood_Dark": {
            const img = m.map?.image;
            if (img && img.width) {
              const d = normalFromImage(img);
              this._texs.push(d.normal, d.rough);
              d.normal.repeat.copy(m.map.repeat);
              d.rough.repeat.copy(m.map.repeat);
              d.normal.offset.copy(m.map.offset);
              d.rough.offset.copy(m.map.offset);
              m.normalMap = d.normal;
              m.normalScale = new THREE3.Vector2(0.55, 0.55);
              m.roughnessMap = d.rough;
              m.roughness = 1;
            } else surface(m, "plaster", 0.55, 0.2);
            m.envMap = env;
            m.envMapIntensity = 0.6;
            break;
          }
          case "Wall_Inside_Navy":
          case "Wall_Wainscot":
            surface(m, "plaster", 0.82, 0.35, 6);
            break;
          case "Rug_White":
          case "Rug_Navy":
          case "Rug_Cyan":
          case "CatBed_Cream":
          case "CatBed_Blue":
          case "Beanbag_Purple":
          case "Felt_Case":
          case "Chair_Blue":
          case "Chair_Dark":
            surface(m, "fabric", 0.95, 0.45, 5);
            break;
          case "Desk_Black":
          case "Plastic_Dark":
            surface(m, "peel", 0.32, 0.08, 3);
            m.envMapIntensity = 0.8;
            break;
          case "Pot_Cream":
          case "Eclipse_Red":
          case "Eclipse_White":
          case "Eclipse_Blue":
          case "Bridge_Orange":
            m.roughness = Math.min(m.roughness, 0.3);
            m.envMap = env;
            m.envMapIntensity = 0.8;
            break;
          case "Leaf_Green":
            m.roughness = 0.45;
            m.envMap = env;
            m.envMapIntensity = 0.5;
            break;
          case "Glass":
          case "Acrylic_Clear":
          case "Rail_Glass":
          case "Lamp_Glass":
            m.envMap = env;
            m.envMapIntensity = 1.4;
            break;
          default:
            if (!m.envMap) {
              m.envMap = env;
              m.envMapIntensity = 0.45;
            }
        }
        m.needsUpdate = true;
        swap.set(m, out);
        return out;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }
  /**
   * The room casts shadows only once it is solid (the reveal's cut-away would
   * cast too). Receiving is always on, so every shader is compiled with shadows
   * up front and nothing stalls the moment the room finishes building.
   */
  _setShadows(on) {
    if (!this.opts.shadows || !this._room) return;
    this._room.traverse((o) => {
      if (!o.isMesh) return;
      const glass = o.material?.transparent;
      o.castShadow = on && !glass;
      o.receiveShadow = true;
    });
    if (this._bobo)
      this._bobo.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
  }
  _patch(material) {
    if (material.userData.mlhReveal) return;
    material.userData.mlhReveal = true;
    this._patched.push(material);
    const u = this._reveal;
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      prev?.call(material, shader, r);
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform mat4 uRoomInv;\nvarying vec3 vRevealPos;"
      ).replace("#include <project_vertex>", "#include <project_vertex>\n" + REVEAL_VERT);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + REVEAL_COMMON).replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\n  float rd = solidDist(vRevealPos);\n  if (rd > uSolid) discard;"
      ).replace(
        "#include <dithering_fragment>",
        "#include <dithering_fragment>\n  float edge = 1.0 - smoothstep(0.0, 0.12, uSolid - rd);\n  gl_FragColor.rgb = mix(gl_FragColor.rgb, uGlow * 2.6, edge * 0.9);"
      );
    };
    material.customProgramCacheKey = () => "mlh-reveal";
    material.needsUpdate = true;
  }
  _makeWireMaterial() {
    const u = this._reveal;
    const m = this._wireMat = new THREE3.LineBasicMaterial({
      color: 3597311,
      transparent: true,
      depthWrite: false,
      blending: THREE3.AdditiveBlending
    });
    this._owned.push(m);
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nuniform mat4 uRoomInv;\nvarying vec3 vRevealPos;"
      ).replace("#include <project_vertex>", "#include <project_vertex>\n" + REVEAL_VERT);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + REVEAL_COMMON).replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
  float rd = revealDist(vRevealPos);
  float lit = step(rd, uWire);
  float front = 1.0 - smoothstep(0.0, 0.5, uWire - rd);
  float fade = 1.0 - smoothstep(0.0, 0.35, uSolid - solidDist(vRevealPos));
  float a = max(lit * (0.4 + 0.5 * front) * fade, uGhost * (1.0 - lit));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uGlow * (0.9 + 2.0 * front * lit), a);`
      );
    };
    m.customProgramCacheKey = () => "mlh-wire";
  }
  _makeHoloMaterial() {
    this._holoMat = new THREE3.ShaderMaterial({
      uniforms: this._holoUniforms,
      vertexShader: HOLO_VERT,
      fragmentShader: HOLO_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE3.AdditiveBlending,
      side: THREE3.DoubleSide
    });
    this._owned.push(this._holoMat);
  }
  /** Collection wall: unowned products are holograms, owned ones are solid. */
  _setupSlots() {
    const room = this._room;
    const ids = ["keychain", "hoodie", "tee", "deskmat", "mystery"];
    for (const id of ids) {
      const holo = id === "keychain" ? room.getObjectByName("hub_keychain_Asset") : room.getObjectByName(`hub_slot_${id}_Holo`);
      if (!holo) continue;
      const meshes = [];
      holo.traverse((o) => o.isMesh && meshes.push(o));
      this._slots.push({
        id,
        holo: id === "keychain" ? void 0 : holo,
        meshes,
        orig: meshes.map((m) => m.material),
        y: holo.position.y,
        phase: Math.random() * 6
      });
    }
  }
  _applyOwnership() {
    if (!this._room) return;
    const owned = new Set((this._me?.items || []).map((i) => i.product));
    for (const s of this._slots) {
      const has = owned.has(s.id);
      s.meshes.forEach((m, i) => {
        if (has) {
          m.material = s.id === "keychain" ? s.orig[i] : this._solidFor(s.id, s.orig[i]);
        } else m.material = this._holoMat;
        m.renderOrder = has ? 0 : 3;
      });
    }
  }
  _solidFor(id, orig) {
    const name = (Array.isArray(orig) ? orig[0] : orig)?.name || "";
    const key = id + name;
    if (!this._solidCache[key]) {
      const pink = /pink|logo/i.test(name);
      const m = new THREE3.MeshStandardMaterial({
        color: pink ? 16732067 : 2768010,
        roughness: 0.6,
        emissive: pink ? 16732067 : 3597311,
        emissiveIntensity: pink ? 0.6 : 0.12
      });
      this._owned.push(m);
      this._patch(m);
      this._solidCache[key] = m;
    }
    return this._solidCache[key];
  }
  _buildWalk(local) {
    if (!this._bobo || !this._portal || !this._room) return;
    const space = this._bobo.parent || this._room;
    const toSpace = (roomP) => this._room.localToWorld(roomP.clone()).applyMatrix4(
      this._t.m.copy(space.matrixWorld).invert()
    );
    const portal = local(this._portal);
    const pts = [portal.clone()];
    const steps = [0, 1, 2, 3].map((i) => this._room.getObjectByName("Step_" + i)).filter(Boolean);
    this._steps.push(...steps);
    if (steps.length) {
      const first = local(steps[0]);
      pts.push(portal.clone().lerp(first, 0.55).setY(portal.y));
      for (const s of steps) pts.push(local(s).add(new THREE3.Vector3(0, 0.03, 0)));
    }
    const home = this._boboHome.pos.clone();
    const last = pts[pts.length - 1];
    const entry = last.clone().lerp(home, 0.18).setY(0);
    pts.push(entry, home.clone().lerp(entry, 0.35).setY(0.02), home.clone());
    this._walk = new THREE3.CatmullRomCurve3(
      pts.map((p, i) => i === pts.length - 1 ? p : toSpace(p)),
      false,
      "centripetal"
    );
  }
  /* ── sequences ────────────────────────────────────────────────────── */
  _setState(s) {
    if (this._state === s) return;
    this._state = s;
    this._emit("state", s);
  }
  _play(name, fade = 0.3, once = false) {
    const next = this._actions[name];
    if (!next || next === this._current) return next;
    next.reset();
    if (once) {
      next.setLoop(THREE3.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else next.setLoop(THREE3.LoopRepeat, Infinity);
    next.enabled = true;
    next.fadeIn(fade).play();
    this._current?.fadeOut(fade);
    this._current = next;
    return next;
  }
  _updatePortal(dt) {
    this._portalT += dt;
    const p = clamp01(this._portalT / 0.7);
    this._portalScale(p < 1 ? backOut(p) : 1);
  }
  /** The portal only exists until Bobo is home: it opens, he steps through, it closes. */
  _portalScale(s, steps = s) {
    if (!this._portalOn) s = steps = 0;
    const on = s > 2e-3;
    this._steps.forEach((st, i) => {
      const k = clamp01(steps * this._steps.length - (this._steps.length - 1 - i));
      st.visible = k > 2e-3;
      st.scale.setScalar(Math.max(1e-3, k));
    });
    for (const n of [this._portal, this._pad]) {
      if (!n) continue;
      n.visible = on;
      n.scale.setScalar(Math.max(1e-3, s));
    }
  }
  _updateBuild(dt) {
    this._seqT += dt * this._buildSpeed;
    const t = this._seqT;
    const WIRE0 = 0.4, WIRE_T = 2, SOLID0 = 2.7, SOLID_T = 3.2;
    const u = this._reveal;
    u.uWire.value = ease(clamp01((t - WIRE0) / WIRE_T)) * this._maxDist;
    u.uSolid.value = smooth01(clamp01((t - SOLID0) / SOLID_T)) * this._maxH;
    u.uGhost.value = this._ghostFrom * (1 - clamp01((t - WIRE0) / 0.6));
    if (!this._ownBobo) {
      if (t >= SOLID0 + SOLID_T + 0.25) this._finishBuild();
      return;
    }
    const bobo = this._bobo;
    const POP = this._walkIn ? 0.5 : 0.1;
    const WALK0 = POP + 0.4;
    const WALK = 6.6;
    if (bobo && this._walk && t >= POP) {
      if (!bobo.visible) {
        bobo.visible = true;
        this._play("Walk", 0.15);
      }
      const p = clamp01((t - POP) / 0.35);
      bobo.scale.setScalar(p < 1 ? 0.2 + 0.8 * backOut(p) : 1);
      const w = clamp01((t - WALK0) / WALK);
      this._walk.getPointAt(w, bobo.position);
      if (w < 0.97) this._faceAlong(w, dt, false);
      else {
        bobo.quaternion.slerp(this._boboHome.quat, 1 - Math.pow(2e-3, dt));
        if (this._current !== this._actions.Sit) this._play("Sit", 0.5);
      }
    }
    const shut = clamp01((t - (WALK0 + WALK * 0.3)) / 0.8);
    const stepsGone = clamp01((t - (WALK0 + WALK * 0.62)) / 1);
    this._portalScale(shut <= 0 ? 1 : 1 - ease(shut), 1 - ease(stepsGone));
    if (shut > 0 && !this._portalShut) {
      this._portalShut = true;
      this._sfx("whoosh");
    }
    if (t >= 8.6) this._finishBuild();
  }
  _faceAlong(w, dt, reverse) {
    const bobo = this._bobo;
    this._walk.getTangentAt(w, this._t.v);
    if (reverse) this._t.v.negate();
    this._t.v.y = 0;
    if (this._t.v.lengthSq() < 1e-6) return;
    this._t.q.setFromAxisAngle(new THREE3.Vector3(0, 1, 0), Math.atan2(this._t.v.x, this._t.v.z));
    bobo.quaternion.slerp(this._t.q, 1 - Math.pow(1e-3, dt));
  }
  _finishBuild() {
    const u = this._reveal;
    u.uSolid.value = 1e3;
    u.uWire.value = 1e3;
    u.uGhost.value = 0;
    for (const w of this._wires) w.visible = false;
    this._portalScale(0);
    this._portalShut = true;
    this._setShadows(true);
    const bobo = this._ownBobo ? this._bobo : void 0;
    if (bobo) {
      bobo.visible = true;
      bobo.scale.setScalar(1);
      bobo.position.copy(this._boboHome.pos);
      bobo.quaternion.copy(this._boboHome.quat);
    }
    if (bobo) this._play("Sit", 0.4);
    this._el.skip.hidden = true;
    this._setState("live");
    this._hud(true);
    this._renderHud();
    const greet = () => {
      if (this._greeted) return;
      this._greeted = true;
      const fresh = this._alerts.find((a) => !this._read.has(a.id));
      if (fresh) setTimeout(() => this._state === "live" && this._beamAlertOut(fresh), 1400);
    };
    if (this.opts.tour !== false && store.get(this._k("toured")) !== "1") {
      this._afterTour = greet;
      setTimeout(() => this._state === "live" && this._tourI < 0 && this.startTour(), 900);
    } else {
      this._showHint();
      greet();
    }
  }
  _updateLeave(dt) {
    this._seqT += dt * this._leaveSpeed;
    const t = this._seqT;
    const DUR = 3.2;
    const u = this._reveal;
    u.uSolid.value = (1 - ease(clamp01(t / (DUR - 0.5)))) * this._maxH;
    u.uWire.value = (1 - ease(clamp01((t - 0.5) / (DUR - 0.5)))) * this._maxDist;
    for (const w of this._wires) w.visible = true;
    u.uGhost.value = 0;
    const open = clamp01(t / 0.7);
    this._portalScale(open < 1 ? backOut(open) : 1);
    const bobo = this._ownBobo ? this._bobo : void 0;
    if (bobo && this._walk && bobo.visible) {
      if (this._current !== this._actions.Walk) this._play("Walk", 0.2);
      const w = 1 - clamp01(t / (DUR - 0.2));
      this._walk.getPointAt(w, bobo.position);
      this._faceAlong(Math.min(0.999, w), dt, true);
      const shrink = clamp01((t - (DUR - 0.5)) / 0.4);
      bobo.scale.setScalar(Math.max(1e-3, 1 - shrink));
    }
    if (t >= DUR + 0.2) this._finishLeave();
  }
  _finishLeave() {
    if (this._bobo) this._bobo.visible = false;
    this._reveal.uSolid.value = -1;
    this._reveal.uWire.value = -1;
    if (this._portalOn) {
      this._setState("portal");
      this._portalT = 1;
      this._portalScale(1);
    } else this.hide();
    const r = this._leaveResolve;
    this._leaveResolve = void 0;
    r?.();
  }
  /* ── access ───────────────────────────────────────────────────────── */
  _k(name) {
    return `ml.collector.${this.roomId}.${name}`;
  }
  _loadSession() {
    try {
      const s = JSON.parse(store.get(this._k("session")) || "null");
      return s && typeof s.token === "string" ? s : null;
    } catch {
      return null;
    }
  }
  _knownCodes() {
    return this._loadSession()?.codes ?? [];
  }
  _saveSession(token, me, email, code) {
    const prev = this._loadSession();
    const codes = [.../* @__PURE__ */ new Set([...prev?.codes ?? [], ...code ? [code] : []])].slice(-20);
    store.set(
      this._k("session"),
      JSON.stringify({ token, me, email: email ?? prev?.email, codes })
    );
  }
  _url(path) {
    return (this.opts.api || "").replace(/\/+$/, "") + path;
  }
  /** Check the saved key against the site. Offline counts as fine. */
  async _refreshMe() {
    if (!this._token) return false;
    try {
      const ctl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), 7e3);
      const r = await fetch(
        this._url(`/api/collector/me?room=${encodeURIComponent(this.roomId)}`),
        {
          headers: { authorization: `Bearer ${this._token}` },
          signal: ctl?.signal
        }
      );
      clearTimeout(timer);
      if (r.status === 401) {
        this._token = null;
        this._me = null;
        store.set(this._k("session"), null);
        this._applyOwnership();
        return false;
      }
      if (!r.ok) return !!this._me;
      const j = await r.json();
      this._me = j.me;
      this._saveSession(this._token, j.me);
      this._applyOwnership();
      this._renderHud();
      return true;
    } catch {
      return !!this._me;
    }
  }
  /* ── UI scaffolding ───────────────────────────────────────────────── */
  _buildUI() {
    if (!document.getElementById("mlh-css")) {
      this._style = document.createElement("style");
      this._style.id = "mlh-css";
      this._style.textContent = CSS;
      document.head.appendChild(this._style);
    }
    const ui = this._ui = document.createElement("div");
    ui.className = "mlh";
    ui.style.setProperty("pointer-events", "none", "important");
    if (this.opts.host === document.body) ui.style.position = "fixed";
    if (this.opts.hudOffset) ui.style.setProperty("--mlh-top", `${this.opts.hudOffset}px`);
    if (this.opts.modeBottom != null)
      ui.style.setProperty("--mlh-mode-bottom", `${this.opts.modeBottom}px`);
    ui.innerHTML = `${DEFS}
<div class="mlh-hud" data-r="hud">
  <button type="button" class="mlh-title" data-r="title" aria-label="Your collection">
    <svg class="mlh-ring" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="4"/><circle data-r="ring" cx="18" cy="18" r="15" fill="none" stroke="url(#mlhg)" stroke-width="4" stroke-linecap="round" stroke-dasharray="94.2" stroke-dashoffset="94.2" transform="rotate(-90 18 18)"/><defs><linearGradient id="mlhg"><stop offset="0" stop-color="#36e3ff"/><stop offset="1" stop-color="#ff4fa3"/></linearGradient></defs></svg>
    <span><b>Bobo's Hideout</b><small data-r="sub">EVADE \xB7 Collector Hub</small></span>
  </button>
  <div class="mlh-actions">
    <button type="button" class="mlh-icon" data-r="items" aria-label="Room items" title="Room items">${ICON.list}</button>
    <button type="button" class="mlh-icon" data-r="pc" aria-label="Open Bobo's computer" title="Bobo's computer">${ICON.colarun}</button>
    <button type="button" class="mlh-icon" data-r="exit" aria-label="Exit the hideout" title="Exit">${ICON.exit}</button>
  </div>
</div>
<div class="mlh-prompt" data-r="prompt"><p></p><button type="button" class="mlh-btn pri" hidden></button></div>
<button type="button" class="mlh-btn mlh-skip" data-r="skip" hidden>Skip</button>
<button type="button" class="mlh-mode" data-r="mode" hidden><i>${ICON.home}</i><span><span data-r="modeLabel">Bobo's Hideout</span><small data-r="modeSub">Your room</small></span></button>
<div class="mlh-toast" data-r="toast" role="status" aria-live="polite"></div>
<div class="mlh-spots" data-r="spots"></div>
<div class="mlh-tour" data-r="tour" role="dialog" aria-modal="false" aria-labelledby="mlh-tour-h" hidden>
  <div class="mlh-kicker" data-r="tourKick"></div>
  <h3 id="mlh-tour-h" data-r="tourTitle"></h3>
  <p data-r="tourBody"></p>
  <div class="mlh-tour-row">
    <button type="button" class="mlh-tour-skip" data-r="tourSkip">Skip tour</button>
    <span class="mlh-tour-dots" data-r="tourDots" aria-hidden="true"></span>
    <button type="button" class="mlh-btn" data-r="tourBack">Back</button>
    <button type="button" class="mlh-btn pri" data-r="tourNext">Next</button>
  </div>
</div>

<div class="mlh-layer" data-r="gate" role="dialog" aria-modal="true" aria-labelledby="mlh-gate-h">
  <div class="mlh-card" data-r="gateCard"></div>
</div>

<div class="mlh-layer mlh-sheet" data-r="sheet" role="dialog" aria-modal="false" aria-labelledby="mlh-sheet-h">
  <div class="mlh-card">
    <button type="button" class="mlh-x" data-close aria-label="Close">${ICON.close}</button>
    <span class="mlh-pill" data-r="sheetPill"></span>
    <h2 id="mlh-sheet-h" data-r="sheetTitle"></h2>
    <p class="mlh-sub" data-r="sheetSub"></p>
    <p data-r="sheetBody"></p>
    <div class="mlh-row" data-r="sheetRow"></div>
  </div>
</div>

<div class="mlh-layer" data-r="col" role="dialog" aria-modal="true" aria-labelledby="mlh-col-h">
  <div class="mlh-card mlh-col mlh-vaultcard">
    <button type="button" class="mlh-x" data-close aria-label="Close">${ICON.close}</button>
    <div data-r="colBody"></div>
  </div>
</div>

<!-- over the room's dots and the tour; under the computer -->
<div class="mlh-mtop" data-r="mtop" hidden></div>
<div class="mlh-hdock" data-r="hdock" hidden>
  <div class="mlh-fan" data-r="fan" role="menu" aria-label="Bobo's moves"></div>
  <button type="button" class="mlh-act" data-r="act" aria-haspopup="menu" aria-expanded="false" aria-label="Bobo's moves" title="Bobo's moves"><span class="p">${ICON.paw}</span><span class="x">${ICON.close}</span></button>
  <button type="button" class="mlh-homeb" data-r="homeb" aria-haspopup="dialog" aria-label="Open BOBO OS" title="BOBO OS">${OS_MARK}<span class="pz" aria-hidden="true">${ICON.pause}</span><span class="mlh-badge" data-r="homeBadge" hidden></span></button>
</div>
<div class="mlh-adj" data-r="adj" role="dialog" aria-labelledby="mlh-adj-t" hidden>
  <div class="mlh-adj-h"><span class="ic">${ICON.resize}</span><b id="mlh-adj-t">Adjust your room</b><button type="button" class="mlh-adj-done" data-r="adjDone">Done</button></div>
  <div class="mlh-adj-row"><span class="lbl">Size</span><button type="button" class="mlh-adj-b" data-adj="smaller" aria-label="Smaller">${ICON.minus}</button><input type="range" min="0" max="1000" step="1" data-r="adjSize" aria-label="Room size"><button type="button" class="mlh-adj-b" data-adj="bigger" aria-label="Bigger">${ICON.plus}</button><output data-r="adjPct">100%</output></div>
  <div class="mlh-adj-row"><span class="lbl">Turn</span><button type="button" class="mlh-adj-b w" data-adj="ccw" aria-label="Turn anticlockwise">${ICON.ccw}</button><button type="button" class="mlh-adj-b w" data-adj="cw" aria-label="Turn clockwise">${ICON.cw}</button><button type="button" class="mlh-adj-reset" data-adj="reset">Reset</button></div>
  <p class="mlh-adj-tip">Drag the room to move it. Pinch to resize, twist to turn.</p>
</div>
<div class="mlh-layer mlh-home" data-r="home" role="dialog" aria-modal="true" aria-label="BOBO OS">
  <div class="mlh-hs" data-r="hs"></div>
</div>
<div class="mlh-layer mlh-os" data-r="os" role="dialog" aria-modal="true" aria-label="Bobo's computer">
  <div class="mlh-screen" data-r="screen">
    <div class="mlh-wallp" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="floor"></div><div class="mlh-wall">\u03A3VAD\u03A3</div></div>
    <div class="mlh-menubar">
      <span class="logo"><span class="lg-mark">${OS_MARK}</span>BOBO<b>OS</b></span><span class="app" data-r="appName">Desktop</span>
      <span class="sp"></span>
      <span class="chip live"><i></i>Online</span>
      <span class="tray">${ICON.wifi}<span data-r="clock"></span></span>
      <button type="button" class="tb" data-r="bell" aria-label="Alerts">${ICON.alerts}<span class="mlh-badge" data-r="bellBadge" hidden></span></button>
      <button type="button" class="tb" data-r="power" aria-label="Turn off the computer" title="Back to the room">${ICON.power}</button>
    </div>
    <div class="mlh-desk" data-r="desk">
      <div class="mlh-icons" data-r="icons"></div>
      <aside class="mlh-widgets" data-r="widgets" aria-label="Widgets"></aside>
      <div class="mlh-dock" data-r="dock" role="toolbar" aria-label="Apps"></div>
    </div>
    <button type="button" class="mlh-notif" data-r="notif" aria-live="polite"></button>
    <div class="mlh-boot off" data-r="boot" aria-hidden="true"><div class="in"><div class="mk">${OS_MARK}</div><div class="lg">BOBO<b>OS</b></div><div class="ver">v2 \xB7 EVADE EDITION</div><div class="bb"><i></i></div></div></div>
  </div>
</div>`;
    for (const el of ui.querySelectorAll("[data-r]")) this._el[el.dataset.r] = el;
    this.opts.host.appendChild(ui);
    const icons = this._el.icons;
    const dock = this._el.dock;
    for (const a of APPS) {
      const tile = tileFor(a, a.id === "alerts");
      const d = document.createElement("button");
      d.type = "button";
      d.className = "mlh-dicon";
      d.innerHTML = `${tile}<span>${esc(a.name)}</span>`;
      d.addEventListener("click", () => this._openApp(a.id));
      icons.appendChild(d);
      const k = document.createElement("button");
      k.type = "button";
      k.dataset.app = a.id;
      k.setAttribute("aria-label", a.name);
      k.title = a.name;
      k.innerHTML = tile;
      k.addEventListener("click", () => this._openApp(a.id));
      dock.appendChild(k);
    }
    const on = (el, ev, fn) => {
      el.addEventListener(ev, fn);
      this._off.push(() => el.removeEventListener(ev, fn));
    };
    on(this._el.title, "click", () => this.openCollection());
    on(this._el.items, "click", () => this._openItems());
    on(this._el.pc, "click", () => this.openOS());
    on(this._el.exit, "click", () => this._emit("exit", void 0));
    on(this._el.skip, "click", () => this.skip());
    on(this._el.tourNext, "click", () => this._tourGo(this._tourI + 1));
    on(this._el.tourBack, "click", () => this._tourGo(this._tourI - 1));
    on(this._el.tourSkip, "click", () => this._tourEnd(true));
    on(this._el.bell, "click", () => this._openApp("alerts"));
    on(this._el.homeb, "click", () => this.homeOpen ? this.closeHome() : this.openHome());
    on(this._el.act, "click", () => this._fanToggle());
    this._bindAdjust();
    on(this._el.home, "click", (e) => e.target === this._el.home && this.closeHome());
    const away = (e) => {
      if (!this._fanOpen) return;
      const t = e.target;
      if (t && (this._el.fan.contains(t) || this._el.act.contains(t))) return;
      this._fanToggle(false);
    };
    document.addEventListener("pointerdown", away, true);
    this._off.push(() => document.removeEventListener("pointerdown", away, true));
    on(this._el.power, "click", () => this.closeOS());
    on(this._el.os, "click", (e) => e.target === this._el.os && this.closeOS());
    on(
      this._el.col,
      "click",
      (e) => e.target === this._el.col && this._closeLayer(this._el.col)
    );
    on(
      this._el.sheet,
      "click",
      (e) => e.target === this._el.sheet && this._closeLayer(this._el.sheet)
    );
    on(this._el.notif, "click", () => {
      this._el.notif.classList.remove("on");
      this._openApp("alerts", this._el.notif.dataset.id);
    });
    for (const x of ui.querySelectorAll("[data-close]"))
      on(x, "click", () => this._closeLayer(x.closest(".mlh-layer")));
    on(window, "keydown", (e) => {
      if (this._tourI >= 0) {
        if (e.key === "Escape") this._tourEnd(true);
        else if (e.key === "ArrowRight") this._tourGo(this._tourI + 1);
        else if (e.key === "ArrowLeft") this._tourGo(this._tourI - 1);
        return;
      }
      if (e.key !== "Escape") return;
      if (this._adjusting) return this.endAdjust();
      if (this._fanOpen) return this._fanToggle(false, true);
      if (this.homeOpen && !this._el.os.classList.contains("open")) return this.closeHome();
      if (this._el.os.classList.contains("open")) {
        if (this._focused) this._closeApp(this._focused);
        else this.closeOS();
      } else if (this._el.gate.classList.contains("open")) this._cancelGate();
      else {
        this._closeLayer(this._el.col);
        this._closeLayer(this._el.sheet);
      }
    });
    const clock = () => {
      const s = (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      this._el.clock.textContent = s;
      if (s !== this._screenClock) {
        this._screenClock = s;
        this._screenDirty = true;
        this._renderWidgets();
      }
    };
    clock();
    const ct = setInterval(clock, 15e3);
    this._off.push(() => clearInterval(ct));
    this._el.exit.hidden = !this.opts.exitLabel;
    if (this.opts.exitLabel) this._el.exit.setAttribute("aria-label", this.opts.exitLabel);
  }
  _emit(name, payload) {
    try {
      this.opts.on?.(name, payload);
    } catch (e) {
      console.error("[hub]", e);
    }
  }
  /**
   * While a hub dialog is open, a host's floating buttons (the record
   * button) step out of the way instead of sitting on its close button.
   */
  _syncModal() {
    const open = ["gate", "sheet", "col", "os", "home"].some(
      (k) => this._el[k]?.classList.contains("open")
    );
    document.documentElement.classList.toggle("mlh-modal", open);
  }
  _open(layer) {
    this._lastFocus = document.activeElement;
    layer.classList.add("open");
    this._syncModal();
    const f = layer.querySelector("input,button.mlh-btn.pri,button");
    setTimeout(() => f?.focus({ preventScroll: true }), 50);
  }
  _closeLayer(layer) {
    if (!layer.classList.contains("open")) return;
    if (layer === this._el.gate) return this._cancelGate();
    layer.classList.remove("open");
    this._syncModal();
    this._lastFocus?.focus?.({ preventScroll: true });
  }
  _closeAllLayers() {
    this.closeOS();
    this._closeLayer(this._el.sheet);
    this._closeLayer(this._el.col);
  }
  _hud(on) {
    this._el.hud.classList.toggle("on", on);
    this._el.hud.setAttribute("aria-hidden", String(!on));
    for (const b of this._el.hud.querySelectorAll("button"))
      b.tabIndex = on ? 0 : -1;
  }
  _renderHud() {
    const me = this._me;
    const total = me?.collection?.products.length ?? me?.total ?? 5;
    const owned = me?.owned ?? 0;
    this._el.sub.textContent = me ? `${owned} of ${total} collected` : "EVADE \xB7 Collector Hub";
    this._el.ring.setAttribute(
      "stroke-dashoffset",
      String(94.2 * (1 - owned / Math.max(1, total)))
    );
  }
  _showHint() {
    clearTimeout(this._hintTimer);
    this.prompt(
      this._spots.length ? this._fitter ? "Tap a glowing dot to explore. Pinch to resize the room, twist to turn it." : "Tap a glowing dot, or anything in the room." : "Tap anything in the room. Tap the computer for BOBO OS."
    );
    this._hintTimer = setTimeout(() => this._state === "live" && this.prompt(null), 5500);
  }
  /* ── hotspots ─────────────────────────────────────────────────────── */
  _buildSpots() {
    if (this.opts.hotspots === false || !this._room) return;
    const box = new THREE3.Box3();
    for (const def of SPOTS) {
      const node = this._room.getObjectByName(def.id);
      if (!node) continue;
      node.updateWorldMatrix(true, true);
      box.setFromObject(node);
      if (box.isEmpty()) continue;
      const c = box.getCenter(new THREE3.Vector3());
      c.y += (box.max.y - c.y) * (def.lift ?? 0.35);
      const local = node.worldToLocal(c);
      const el = document.createElement("button");
      el.type = "button";
      el.className = "mlh-spot gone";
      el.style.setProperty("--c", def.color);
      el.setAttribute("aria-label", def.label);
      el.innerHTML = `${def.icon}<span>${esc(def.label)}</span>`;
      el.addEventListener("click", () => this._onTap(def.id));
      this._el.spots.appendChild(el);
      this._spots.push({ def, node, local, el, hidden: true });
    }
  }
  _layerOpen() {
    const e = this._el;
    return this._adjusting || e.os.classList.contains("open") || e.col.classList.contains("open") || e.sheet.classList.contains("open") || e.gate.classList.contains("open");
  }
  _updateSpots() {
    const cam = this.opts.getCamera();
    const show = this._state === "live" && !!cam && !this._layerOpen();
    this._el.spots.classList.toggle("off", !show);
    if (!show || !cam) return;
    const r = this.opts.canvas.getBoundingClientRect();
    const host = this._el.spots.getBoundingClientRect();
    const check = this._spotFrame++ % this._spots.length;
    const camPos = cam.getWorldPosition(this._t.v2);
    const placed = [];
    this._spots.forEach((s, i) => {
      const w = s.node.localToWorld(this._t.v.copy(s.local));
      if (i === check || i === (check + 3) % this._spots.length) {
        const dir = w.clone().sub(camPos);
        const dist = dir.length();
        this._ray.set(camPos, dir.normalize());
        this._ray.far = dist - 0.05;
        let blocked = false;
        for (const hit of this._ray.intersectObjects(this._pickables, false)) {
          const o = hit.object;
          if (!o.visible || o.material?.transparent && o.material.opacity < 0.5) continue;
          if (this._isUnder(o, s.node)) break;
          if (hit.distance < dist - 0.25) blocked = true;
          break;
        }
        this._ray.far = Infinity;
        s.hidden = blocked;
      }
      const p = w.project(cam);
      let off = p.z > 1 || Math.abs(p.x) > 1.05 || Math.abs(p.y) > 1.05 || s.hidden;
      const x = r.left - host.left + (p.x + 1) / 2 * r.width;
      const y = r.top - host.top + (1 - p.y) / 2 * r.height;
      if (!off && placed.some((q) => Math.hypot(q.x - x, q.y - y) < 40)) off = true;
      s.el.classList.toggle("gone", off);
      if (off) return;
      placed.push({ x, y });
      s.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    });
  }
  /* ── welcome tour ─────────────────────────────────────────────────── */
  /** Walk a first-timer round the room: a card per stop, the camera follows. */
  startTour() {
    if (this._state !== "live") return;
    this._closeAllLayers();
    this.prompt(null);
    clearTimeout(this._hintTimer);
    this._tourI = 0;
    this._el.tour.hidden = false;
    requestAnimationFrame(() => this._el.tour.classList.add("on"));
    this._el.spots.classList.add("touring");
    this._emit("tour", "start");
    this._tourGo(0);
  }
  _tourStops() {
    const stops = [TOUR_INTRO];
    for (const s of this._spots) if (s.def.tour) stops.push({ ...s.def.tour, spot: s });
    stops.push(TOUR_OUTRO);
    return stops;
  }
  _tourGo(i) {
    if (this._tourI < 0) return;
    const stops = this._tourStops();
    if (i >= stops.length) return this._tourEnd(true);
    i = Math.max(0, i);
    this._tourI = i;
    const st = stops[i];
    this._el.tourKick.textContent = `Welcome tour \xB7 ${i + 1} of ${stops.length}`;
    this._el.tourTitle.textContent = st.title;
    this._el.tourBody.textContent = st.body;
    this._el.tourBack.hidden = i === 0;
    this._el.tourNext.textContent = i === 0 ? "Show me" : i === stops.length - 1 ? "Start exploring" : "Next";
    this._el.tourDots.innerHTML = stops.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    for (const s of this._spots) s.el.classList.toggle("focus", s === st.spot);
    if (st.spot) {
      const scale = this.root.getWorldScale(this._t.v).x;
      const distance = (st.spot.def.tour?.distance ?? 3) * scale;
      const target = st.spot.node.localToWorld(st.spot.local.clone());
      target.y -= distance * 0.13;
      this._emit("focus", { target, distance });
      if (st.spot.def.id === "hub_bobo") this._tapBobo();
    } else this._emit("focus", null);
    this._sfx("click");
    setTimeout(() => this._el.tourNext.focus({ preventScroll: true }), 60);
  }
  _tourEnd(remember) {
    if (this._tourI < 0) return;
    this._tourI = -1;
    if (remember) store.set(this._k("toured"), "1");
    this._el.tour.classList.remove("on");
    setTimeout(() => this._tourI < 0 && (this._el.tour.hidden = true), 320);
    this._el.spots.classList.remove("touring");
    for (const s of this._spots) s.el.classList.remove("focus");
    this._emit("focus", null);
    this._emit("tour", "end");
    if (this._state === "live") {
      const after = this._afterTour;
      this._afterTour = null;
      after?.();
    }
  }
  /* ── unlock form ──────────────────────────────────────────────────── */
  _showGateForm(mode, error) {
    const saved = this._loadSession();
    const prefCode = this.opts.hubCode ? formatCodeInput(this.opts.hubCode) : "";
    const age = store.get(this._k("age")) === "1";
    const card = this._el.gateCard;
    card.innerHTML = `
<button type="button" class="mlh-x" data-cancel aria-label="Close">${ICON.close}</button>
<div class="mlh-kicker">Bobo's Hideout</div>
<h2 id="mlh-gate-h">${mode === "add" ? "Add an item to your room" : "Unlock your room"}</h2>
<p>${mode === "add" ? "Enter the code from your new item's card, with the email your room is linked to." : "Enter the code from the card that came with your EVADE merch, plus your email. After this, your code and email open your room on any device."}</p>
<form novalidate>
  <label class="mlh-field"><span>Code</span>
    <input class="code" name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" maxlength="14" placeholder="BOBO-XXXX-XXXX" value="${esc(prefCode)}" aria-describedby="mlh-gate-err">
  </label>
  <label class="mlh-field"><span>Email</span>
    <input name="email" type="email" required autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(saved?.email || "")}" aria-describedby="mlh-gate-err">
  </label>
  <label class="mlh-check"${age ? " hidden" : ""}><input type="checkbox" name="age"${age ? " checked" : ""}> <span>I'm 13 or older, and it's OK to email me my key.</span></label>
  <div class="mlh-err" id="mlh-gate-err" role="alert"${error ? "" : " hidden"}>${esc(error || "")}</div>
  <div class="mlh-row">
    <button type="submit" class="mlh-btn pri">${mode === "add" ? "Add to my room" : "Unlock my room"}</button>
  </div>
  <button type="button" class="mlh-link" data-help aria-expanded="false">Where's my code?</button>
  <div class="mlh-help" hidden>
    <p><b>On the card in your merch box,</b> under the QR code. It starts with BOBO.</p>
    <p><b>Unlocked before?</b> Use the same code and email. They work as your password, on any device.</p>
    <p style="margin:0">Codes never use 0, 1, O, I or L, so there's nothing to mix up.</p>
  </div>
  ${this.opts.testHint ? `<div class="mlh-test">Testing? Use <code>${esc(this.opts.testHint)}</code> with any email.</div>` : ""}
</form>`;
    const form = card.querySelector("form");
    const codeIn = form.elements.namedItem("code");
    const emailIn = form.elements.namedItem("email");
    const ageIn = form.elements.namedItem("age");
    const err = card.querySelector(".mlh-err");
    const submit = form.querySelector("button[type=submit]");
    const showErr = (msg, field) => {
      err.textContent = msg;
      err.hidden = false;
      codeIn.removeAttribute("aria-invalid");
      emailIn.removeAttribute("aria-invalid");
      if (field) {
        field.setAttribute("aria-invalid", "true");
        field.focus();
      }
    };
    codeIn.addEventListener("input", () => {
      codeIn.value = formatCodeInput(codeIn.value);
      codeIn.removeAttribute("aria-invalid");
    });
    card.querySelector("[data-cancel]").addEventListener("click", () => this._cancelGate());
    const help = card.querySelector("[data-help]");
    help.addEventListener("click", () => {
      const box = card.querySelector(".mlh-help");
      box.hidden = !box.hidden;
      help.setAttribute("aria-expanded", String(!box.hidden));
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      this._unlockAudio();
      const c = checkCode(codeIn.value);
      if (!c.ok) return showErr(c.message, codeIn);
      const email = emailIn.value.trim().toLowerCase();
      if (!EMAIL_RE.test(email))
        return showErr("Enter the email you want your room linked to.", emailIn);
      if (!ageIn.checked) return showErr("Please confirm you're 13 or older.", ageIn);
      store.set(this._k("age"), "1");
      err.hidden = true;
      submit.disabled = true;
      submit.textContent = "Checking your code\u2026";
      try {
        const r = await fetch(this._url("/api/collector/unlock"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ room: this.roomId, code: c.code, email })
        });
        const j = await r.json().catch(() => ({ ok: false, message: "Something went wrong. Try again." }));
        if (!j.ok) {
          submit.disabled = false;
          submit.textContent = mode === "add" ? "Add to my room" : "Unlock my room";
          return showErr(
            j.message || "That didn't work. Try again.",
            j.error === "bad-email" ? emailIn : codeIn
          );
        }
        this._token = j.token;
        this._me = j.me;
        this._saveSession(j.token, j.me, email, j.code);
        this.opts.hubCode = null;
        this._applyOwnership();
        this._renderHud();
        this._sfx("unlock");
        this._emit("unlocked", { me: j.me, firstClaim: !!j.firstClaim, emailed: !!j.emailed });
        this._showGateDone(j, mode);
      } catch {
        submit.disabled = false;
        submit.textContent = mode === "add" ? "Add to my room" : "Unlock my room";
        showErr("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }
  _showGateDone(j, mode) {
    const card = this._el.gateCard;
    const item = j.me.items[j.me.items.length - 1];
    const prod = j.me.collection?.products.find((p) => p.id === item?.product);
    const welcomeBack = !j.firstClaim;
    const title = welcomeBack ? "Welcome back" : mode === "add" ? `${prod?.name || "New item"} added` : "Your room is unlocked";
    const line = welcomeBack ? `You're signed in as ${esc(j.me.email)}.` : j.emailed ? `We emailed your key to ${esc(j.me.email)}. Your code is your password, so keep it somewhere safe.` : `Your code is your password for this room, together with ${esc(j.me.email)}. Keep it somewhere safe.`;
    card.innerHTML = `
<div class="mlh-center">
  <div class="mlh-ok">${ICON.check}</div>
  <div class="mlh-kicker">Bobo's Hideout</div>
  <h2 id="mlh-gate-h">${esc(title)}</h2>
  ${welcomeBack ? "" : `<div class="mlh-keycode">${esc(j.code)}</div>`}
  <p>${line}</p>
  <div class="mlh-row"><button type="button" class="mlh-btn pri" data-go>${this._state === "live" ? "Back to my room" : "Open the portal"}</button></div>
</div>`;
    const go = card.querySelector("[data-go]");
    go.addEventListener("click", () => {
      this._el.gate.classList.remove("open");
      this._syncModal();
      const r = this._gateResolve;
      this._gateResolve = void 0;
      r?.(true);
      if (this._state === "live" && mode === "add" && j.firstClaim) {
        this._celebrate(prod?.name);
      }
    });
    setTimeout(() => go.focus({ preventScroll: true }), 50);
  }
  _cancelGate() {
    this._el.gate.classList.remove("open");
    this._syncModal();
    const r = this._gateResolve;
    this._gateResolve = void 0;
    r?.(false);
    this._lastFocus?.focus?.({ preventScroll: true });
  }
  _celebrate(name) {
    this.toast(`${name || "New item"} is in your collection!`);
    this._burstFizz(
      this._room?.getObjectByName("hub_collection") ? new THREE3.Vector3(-0.6, 1.1, -1.2) : this._lampPos
    );
    const a = this._play("Excited", 0.2, true);
    if (a) this._backToSit(a);
  }
  /* ── room taps ────────────────────────────────────────────────────── */
  _bindTaps() {
    const c = this.opts.canvas;
    let down = null;
    const pts = /* @__PURE__ */ new Map();
    let pinch = null;
    let drag = null;
    const two = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    const canFit = () => !!this._fitter && this._state === "live" && this.root.visible;
    const pd = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      if (pts.size === 2 && canFit() && (this._adjusting || !this._layerOpen())) {
        down = null;
        drag = null;
        const g = two();
        pinch = { d0: Math.max(10, g.d), k0: this._fitter.get().size, a: g.a };
      } else if (pts.size === 1 && this._adjusting && this._fitter) {
        drag = this._floorHit(e.clientX, e.clientY, new THREE3.Vector3());
      }
    };
    const gmove = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const fit = this._fitter;
      if (!fit) return;
      if (pinch && pts.size >= 2) {
        const g = two();
        fit.setSize(pinch.k0 * g.d / pinch.d0);
        let da = g.a - pinch.a;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        pinch.a = g.a;
        if (Math.abs(da) > 1e-4) fit.turn(-da);
        if (this._adjusting) this._syncAdj();
      } else if (drag && pts.size === 1) {
        const hit = this._floorHit(e.clientX, e.clientY, new THREE3.Vector3());
        if (hit) {
          fit.move(drag, hit);
          drag = hit;
        }
      }
    };
    const gup = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) drag = null;
    };
    c.addEventListener("pointermove", gmove);
    c.addEventListener("pointerup", gup);
    c.addEventListener("pointercancel", gup);
    this._off.push(() => {
      c.removeEventListener("pointermove", gmove);
      c.removeEventListener("pointerup", gup);
      c.removeEventListener("pointercancel", gup);
    });
    const pu = (e) => {
      if (this._adjusting) return;
      if (!down || e.pointerId !== down.id || !this.root.visible) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 450;
      down = null;
      if (moved > 10 || !quick) return;
      if (!this.tap(e.clientX, e.clientY) && this._state === "live")
        this._closeLayer(this._el.sheet);
    };
    const pm = (e) => {
      if (e.pointerType !== "mouse" || down || !this.root.visible || this._state !== "live") return;
      c.style.cursor = this._pick(e.clientX, e.clientY) ? "pointer" : "";
    };
    c.addEventListener("pointerdown", pd);
    c.addEventListener("pointerup", pu);
    c.addEventListener("pointermove", pm);
    this._off.push(() => {
      c.removeEventListener("pointerdown", pd);
      c.removeEventListener("pointerup", pu);
      c.removeEventListener("pointermove", pm);
    });
  }
  _pick(x, y) {
    const cam = this.opts.getCamera();
    if (!cam || !this._room || !this.root.visible) return null;
    const r = this.opts.canvas.getBoundingClientRect();
    this._ndc.set((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, cam);
    if (this._card?.visible && this._ray.intersectObject(this._card, false).length)
      return "hub_hologram";
    for (const hit of this._ray.intersectObjects(this._pickables, false)) {
      const o = hit.object;
      if (!o.visible) continue;
      const isPortal = this._isUnder(o, this._portal) || this._isUnder(o, this._pad);
      if (isPortal && !this._portal?.visible) continue;
      if (this._state !== "live") {
        if (isPortal) return "hub_portal";
        continue;
      }
      if (o.material?.transparent && o.material.opacity < 0.4 && o.material !== this._holoMat)
        continue;
      const id = this._hubId(o);
      if (id) return id;
      return null;
    }
    return null;
  }
  _isUnder(o, n) {
    for (let p = o; p; p = p.parent) if (p === n) return true;
    return false;
  }
  _hubId(o) {
    for (let p = o; p; p = p.parent) {
      const n = p.name || "";
      if (n.startsWith("hub_")) {
        if (n.startsWith("hub_slot_")) return "hub_collection";
        const id = n.replace(/_(Asset|Art|Frame|Glow)$/, "");
        return ALIAS[id] || id;
      }
    }
    return null;
  }
  _onTap(id) {
    if (id === "hub_portal") {
      if (this._state === "portal") this._emit("portal", void 0);
      return;
    }
    if (this._state !== "live" || this._tourI >= 0) return;
    switch (id) {
      case "hub_hologram":
        return this.openOS("alerts");
      case "hub_bobo":
        return this._tapBobo();
      case "hub_computer":
        return this.openOS();
      case "hub_collection":
        return this.openCollection();
      case "hub_cola_lamp":
        this._burstFizz(this._lampPos);
        this._sfx("fizz");
        return this.toast("Fizz!");
      case "hub_pull_tab":
        this._tabWiggle = 1;
        this._burstFizz(new THREE3.Vector3(0, 3.6, 0));
        this._sfx("fizz");
        return this.toast("Pssst!");
    }
    this._openSheet(id);
  }
  _tapBobo() {
    const lines = [
      "Mrrp!",
      "Purrrr\u2026",
      "Bobo approves.",
      "Bobo wants a cola.",
      "Bobo is plotting his next run."
    ];
    this.toast(lines[Math.floor(Math.random() * lines.length)]);
    this._sfx("mrrp");
    const a = this._play(Math.random() < 0.5 ? "Excited" : "Spin", 0.2, true);
    if (a) this._backToSit(a);
  }
  _backToSit(a) {
    const m = this._mixer;
    const back = (ev) => {
      if (ev.action !== a) return;
      m.removeEventListener("finished", back);
      if (this._state === "live") this._play("Sit", 0.4);
    };
    m.addEventListener("finished", back);
  }
  _openSheet(id) {
    const it = ROOM_ITEMS[id];
    if (!it) return;
    this._el.sheetPill.textContent = it.sub;
    this._el.sheetTitle.textContent = it.title;
    this._el.sheetSub.textContent = "";
    this._el.sheetSub.hidden = true;
    this._el.sheetBody.textContent = it.body;
    const row = this._el.sheetRow;
    row.replaceChildren();
    if (it.action) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mlh-btn pri";
      b.textContent = it.action === "globe" ? "Open Where's Bobo?" : it.action === "colarun" ? "Open Cola Run" : "My collection";
      b.onclick = () => {
        this._closeLayer(this._el.sheet);
        if (it.action === "collection") this.openCollection();
        else this.openOS(it.action);
      };
      row.appendChild(b);
    }
    row.hidden = !row.children.length;
    this._open(this._el.sheet);
  }
  /** Room items list: the keyboard / screen reader way to everything tappable. */
  _openItems() {
    this._el.sheetPill.textContent = "Your room";
    this._el.sheetTitle.textContent = "Room items";
    this._el.sheetSub.hidden = false;
    this._el.sheetSub.textContent = "Everything you can open in Bobo's Hideout";
    this._el.sheetBody.textContent = "";
    const row = this._el.sheetRow;
    row.replaceChildren();
    row.hidden = false;
    const add = (label, fn) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mlh-btn";
      b.textContent = label;
      b.onclick = () => {
        this._closeLayer(this._el.sheet);
        fn();
      };
      row.appendChild(b);
    };
    if (this.opts.tour !== false) add("Take the tour", () => this.startTour());
    add("Bobo's computer", () => this.openOS());
    add("My collection", () => this.openCollection());
    add("Bobo", () => this._tapBobo());
    for (const [id, it] of Object.entries(ROOM_ITEMS))
      if (id !== "hub_cat_bed") add(it.title, () => this._openSheet(id));
    this._open(this._el.sheet);
  }
  /* ── collection ───────────────────────────────────────────────────── */
  /** The vault page for this fan: owned pieces are real, the rest holograms. */
  _vaultSrc(focus) {
    const base = this.opts.vaultUrl || `${this.opts.api || ""}/evade/vault/index.html`;
    const items = this._me?.items || [];
    const owned = [...new Set(items.map((i) => i.product))].filter((p) => /^[a-z]+$/.test(p));
    const serials = items.filter((i) => /^[a-z]+$/.test(i.product)).map((i) => `${i.product}:${i.serial}`).join(",");
    const q = new URLSearchParams({ owned: owned.join(",") });
    if (serials) q.set("s", serials);
    if (focus) q.set("focus", focus);
    return `${base}?${q}`;
  }
  _renderCollection(box, focus) {
    const me = this._me;
    const col = me?.collection ?? {
      name: "EVADE Merch Collection",
      reward: "The Golden Bobo",
      rewardBlurb: "Collect the full set to unlock a golden Bobo for your room and early access to the next drop.",
      products: []
    };
    const owned = /* @__PURE__ */ new Map();
    for (const i of me?.items || []) if (!owned.has(i.product)) owned.set(i.product, i);
    const total = col.products.length || me?.total || 5;
    const n = me?.owned ?? owned.size;
    const cards = col.products.map((p) => {
      const it = owned.get(p.id);
      const tag = it ? "Owned" : p.released ? "Locked" : "Coming soon";
      const detail = it ? `#${String(it.serial).padStart(5, "0")}${it.test ? " \xB7 test unlock" : ""} \xB7 ${new Date(it.claimedAt).toLocaleDateString()}` : p.blurb;
      return `<div class="mlh-slot ${it ? "owned" : "locked"}" data-p="${esc(p.id)}">
  <span class="tag">${tag}</span>
  <div class="art">${PRODUCT_ICON[p.id] || ICON.collection}</div>
  <b>${esc(p.name)}</b><small>${esc(detail)}</small>
</div>`;
    }).join("");
    box.innerHTML = `
<div class="mlh-vhead">
  <div><div class="mlh-kicker">Bobo's Hideout \xB7 Vault</div>
  <h2 id="mlh-col-h">EVADE Digital Collection</h2></div>
  <div class="mlh-prog"><div class="mlh-bar"><i style="width:${Math.round(100 * n / Math.max(1, total))}%"></i></div><b>${n} of ${total}</b></div>
</div>
<div class="mlh-vault"><iframe class="mlh-frame" title="Your EVADE Digital Collection in 3D" src="${esc(this._vaultSrc(focus))}" allow="autoplay" loading="lazy"></iframe></div>
<p class="mlh-vnote">Every activated piece of EVADE merch lands here for real. Locked pieces show as holograms until you activate one. Collect the set for an exclusive reward.</p>
<details class="mlh-list"><summary>List view</summary><div class="mlh-grid">${cards}</div></details>
<div class="mlh-reward${me?.complete ? " done" : ""}">
  <div class="medal">${me?.complete ? "\u2605" : ICON.lock}</div>
  <div><b>${esc(col.reward)}${me?.complete ? " \xB7 unlocked!" : ""}</b><small>${esc(col.rewardBlurb)}</small></div>
</div>
<div class="mlh-row"><button type="button" class="mlh-btn" data-add>Add an item with a code</button></div>`;
    box.querySelector("[data-add]").addEventListener("click", () => {
      this._closeLayer(this._el.col);
      this.closeOS();
      this.openGate("add");
    });
    if (focus)
      box.querySelector(`[data-p="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }
  /* ── BOBO OS ──────────────────────────────────────────────────────── */
  _openApp(id, highlight) {
    if (!this._el.os.classList.contains("open")) return this.openOS(id);
    const existing = this._wins.get(id);
    if (existing) {
      existing.el.hidden = false;
      this._focusApp(id);
      if (id === "alerts") this._renderApp(id, existing.body, highlight);
      return;
    }
    const app = APPS.find((a) => a.id === id);
    const desk = this._el.desk.getBoundingClientRect();
    const narrow = desk.width < 700;
    const w = Math.min(app.w, desk.width - 24);
    const h = Math.min(app.h, desk.height - 100);
    const n = this._wins.size;
    const left = Math.max(
      12,
      Math.min(desk.width - w - 12, (desk.width - w) / 2 + (n - 1) * 28 + 40)
    );
    const top = Math.max(10, Math.min(desk.height - h - 80, (desk.height - h) / 2 - 30 + n * 24));
    const el = document.createElement("section");
    el.className = "mlh-win";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", app.name);
    el.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
    el.innerHTML = `
<div class="mlh-bar2">
  <div class="mlh-dots"><button type="button" class="mlh-dot c" aria-label="Close ${esc(app.name)}"></button><button type="button" class="mlh-dot m" aria-label="Minimise"></button><button type="button" class="mlh-dot x" aria-label="Full size"></button></div>
  <div class="t"><span class="mi" style="--a:${app.g[0]};--b:${app.g[1]}">${ICON3D[id]}</span>${esc(app.name)}</div>
</div>
<div class="mlh-body${id === "globe" || id === "collection" ? " flush" : ""}"></div>`;
    const body = el.querySelector(".mlh-body");
    this._el.desk.appendChild(el);
    this._wins.set(id, { el, body });
    el.addEventListener("pointerdown", () => this._focusApp(id), true);
    el.querySelector(".mlh-dot.c").addEventListener("click", () => this._closeApp(id));
    el.querySelector(".mlh-dot.m").addEventListener("click", () => {
      el.hidden = true;
      this._focused = void 0;
      this._el.appName.textContent = "Desktop";
    });
    el.querySelector(".mlh-dot.x").addEventListener("click", () => el.classList.toggle("max"));
    const bar = el.querySelector(".mlh-bar2");
    bar.addEventListener("dblclick", () => el.classList.toggle("max"));
    if (!narrow) this._dragWindow(el, bar);
    this._renderApp(id, body, highlight);
    this._focusApp(id);
    this._renderTray();
    this._sfx("click");
  }
  _dragWindow(el, bar) {
    let start = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || el.classList.contains("max")) return;
      start = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop, id: e.pointerId };
      bar.setPointerCapture(e.pointerId);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const d = this._el.desk;
      const l = Math.max(
        -el.offsetWidth + 80,
        Math.min(d.clientWidth - 80, start.l + e.clientX - start.x)
      );
      const t = Math.max(0, Math.min(d.clientHeight - 40, start.t + e.clientY - start.y));
      el.style.left = l + "px";
      el.style.top = t + "px";
    });
    const end = (e) => {
      if (start && e.pointerId === start.id) start = null;
    };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }
  _focusApp(id) {
    for (const [k, w2] of this._wins) w2.el.classList.toggle("focus", k === id);
    const w = this._wins.get(id);
    if (w) w.el.style.zIndex = String(++this._z);
    this._focused = id;
    this._el.appName.textContent = APPS.find((a) => a.id === id).name;
  }
  _closeApp(id, instant = false) {
    const w = this._wins.get(id);
    if (!w) return;
    this._wins.delete(id);
    if (this._focused === id) {
      this._focused = void 0;
      this._el.appName.textContent = "Desktop";
    }
    if (instant || this._reduceMotion) w.el.remove();
    else {
      w.el.classList.add("closing");
      setTimeout(() => w.el.remove(), 170);
    }
    this._renderTray();
  }
  _renderTray() {
    const n = this._unread();
    const bb = this._el.bellBadge;
    bb.textContent = String(n);
    bb.hidden = !n;
    const hb = this._el.homeBadge;
    if (hb) {
      hb.textContent = String(n);
      hb.hidden = !n;
    }
    for (const b of this._ui.querySelectorAll("[data-badge]")) {
      b.textContent = String(n);
      b.hidden = !n;
    }
    for (const b of this._el.dock.querySelectorAll("button"))
      b.classList.toggle("run", this._wins.has(b.dataset.app));
    this._renderWidgets();
  }
  /** Desktop widgets: time, collection progress, newest alert. */
  _renderWidgets() {
    const box = this._el.widgets;
    if (!box || !this._el.os.classList.contains("open")) return;
    const now = /* @__PURE__ */ new Date();
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    const me = this._me;
    const total = me?.collection?.products.length || me?.total || 5;
    const n = me?.owned ?? 0;
    const pct = Math.round(100 * n / Math.max(1, total));
    const latest = this._alerts[0];
    const unread = this._unread();
    box.innerHTML = `
<div class="mlh-wg"><div class="k">Bobo's Hideout</div><div class="big">${esc(time)}</div><small>${esc(date)} \xB7 Bobo is home</small></div>
<button type="button" class="mlh-wg" data-w="collection"><div class="k">Digital Collection</div>
  <div class="row"><div class="mlh-ringwrap"><div class="mlh-ring" style="--p:${pct}"></div><b>${n}/${total}</b></div>
  <div><b>${n} of ${total} collected</b><small>Collect all for an exclusive reward</small></div></div></button>
<button type="button" class="mlh-wg" data-w="alerts"><div class="k">${unread ? `${unread} new alert${unread > 1 ? "s" : ""}` : "Alerts"}</div>
  ${latest ? `<div class="al"><span class="mlh-tile sm" style="--a:${KIND_COLOR[latest.kind]};--b:#1a1440">${ICON3D.alerts}</span><div><b>${esc(latest.title)}</b><small>${esc(KIND_LABEL[latest.kind])} \xB7 ${esc(ago(latest.at))}</small></div></div>` : "<small>No alerts yet. New drops and events land here.</small>"}</button>`;
    box.querySelector('[data-w="collection"]').addEventListener("click", () => this._openApp("collection"));
    box.querySelector('[data-w="alerts"]').addEventListener("click", () => this._openApp("alerts"));
  }
  _renderApp(id, body, highlight) {
    switch (id) {
      case "alerts":
        return this._appAlerts(body, highlight);
      case "globe":
        body.innerHTML = `<iframe class="mlh-frame" title="Where's Bobo? globe" src="${esc(this.opts.globeUrl)}" loading="lazy" allow="fullscreen"></iframe>`;
        return;
      case "leaderboard":
        return this._appLeaderboard(body);
      case "colarun":
        body.innerHTML = `
<div class="mlh-hero">COLA RUN<small>EVADE \xD7 MEDIALIFE</small></div>
<h3>Grab the cans before the clock runs out</h3>
<p>Play a round, or record your run. Clips you send can put your city on the Where's Bobo? globe.</p>
<div class="mlh-stack">
  <button type="button" class="mlh-btn pri" data-play>Play Cola Run</button>
  <button type="button" class="mlh-btn" data-rec><span style="width:10px;height:10px;border-radius:50%;background:#ff3b4e;display:inline-block"></span> Record a run</button>
</div>`;
        body.querySelector("[data-play]").addEventListener("click", () => this._play2(false));
        body.querySelector("[data-rec]").addEventListener("click", () => this._play2(true));
        return;
      case "collection": {
        const me = this._me;
        const total = me?.collection?.products.length || me?.total || 5;
        const n = me?.owned ?? 0;
        body.innerHTML = `<div class="mlh-vwrap"><div class="mlh-vault"><iframe class="mlh-frame" title="Your EVADE Digital Collection in 3D" src="${esc(this._vaultSrc())}"></iframe></div>
<div class="mlh-vbar"><div class="mlh-prog"><div class="mlh-bar"><i style="width:${Math.round(100 * n / Math.max(1, total))}%"></i></div><b>${n} of ${total} collected \xB7 collect all for an exclusive reward</b></div><button type="button" class="mlh-btn" data-add>Add an item</button></div></div>`;
        body.querySelector("[data-add]").addEventListener("click", () => {
          this.closeOS();
          this.openGate("add");
        });
        return;
      }
      case "shop":
        body.innerHTML = `
<div class="mlh-empty">${ICON.shop}</div>
<h3>The shop opens soon</h3>
<p>Hoodie, tee and desk mat drops are on the way. You'll get an alert on Bobo's computer the moment they land.</p>
<div class="mlh-stack"><button type="button" class="mlh-btn" data-col>See what's in the collection</button></div>`;
        body.querySelector("[data-col]").addEventListener("click", () => this._openApp("collection"));
        return;
      case "me": {
        const me = this._me;
        body.innerHTML = me ? `<div class="mlh-me"><div class="mlh-av">${esc(me.email.slice(0, 1).toUpperCase())}</div><div><b>${esc(me.email)}</b><div style="color:var(--muted);font-size:13px">Owner of Bobo's Hideout</div></div></div>
<div class="mlh-kv"><span>Collected</span><b>${me.owned} of ${me.collection?.products.length ?? me.total}</b></div>
<div class="mlh-kv"><span>Sign in with</span><b>Your code + this email</b></div>
<div class="mlh-stack" style="margin-top:16px"><button type="button" class="mlh-btn" data-add>Add an item with a code</button><button type="button" class="mlh-btn" data-out>Sign out on this device</button></div>` : `<p>You're not signed in on this device.</p>`;
        body.querySelector("[data-add]")?.addEventListener("click", () => {
          this.closeOS();
          this.openGate("add");
        });
        body.querySelector("[data-out]")?.addEventListener("click", () => {
          this.signOut();
          this._emit("exit", void 0);
        });
        return;
      }
    }
  }
  _play2(record) {
    this.closeOS();
    this._emit("play", { record });
  }
  _appAlerts(body, highlight) {
    const list = this._alerts;
    if (!list.length) {
      body.innerHTML = `<div class="mlh-empty">${ICON.alerts}<p>No alerts yet. The EVADE team posts drops, events and rewards here, live.</p></div>`;
      return;
    }
    body.innerHTML = list.map((a) => {
      const link = safeLink(a.linkUrl);
      return `<article class="mlh-alert${this._read.has(a.id) ? "" : " unread"}${a.id === highlight ? " hl" : ""}" data-id="${esc(a.id)}">
  <div class="k" style="background:${KIND_COLOR[a.kind] || "#36e3ff"}">${a.kind === "reward" ? ICON.collection : a.kind === "event" ? ICON.globe : a.kind === "drop" ? ICON.shop : ICON.alerts}</div>
  <div style="min-width:0;flex:1"><b>${esc(a.title)}</b><div class="meta">${KIND_LABEL[a.kind] || "News"} \xB7 ${ago(a.at)}</div>
  ${a.body ? `<p>${esc(a.body)}</p>` : ""}
  ${link ? `<a class="mlh-btn" href="${esc(this._abs(link))}" target="_blank" rel="noopener">${esc(a.linkLabel || "Open")} ${ICON.external}</a>` : ""}</div>
</article>`;
    }).join("");
    if (highlight)
      body.querySelector(`[data-id="${CSS_escape(highlight)}"]`)?.scrollIntoView({ block: "nearest" });
    let changed = false;
    for (const a of list)
      if (!this._read.has(a.id)) {
        this._read.add(a.id);
        changed = true;
      }
    if (changed) {
      store.set(this._k("read"), JSON.stringify([...this._read].slice(-200)));
      this._screenDirty = true;
      this._renderTray();
    }
  }
  _abs(link) {
    return link.startsWith("/") && this.opts.api ? this._url(link) : link;
  }
  async _appLeaderboard(body) {
    if (!this._feed) {
      body.innerHTML = `<div class="mlh-load">Loading the board\u2026</div>`;
      try {
        const r = await fetch(this._url("/api/bobo/feed.json"));
        this._feed = await r.json();
      } catch {
        body.innerHTML = `<div class="mlh-empty"><p>Couldn't load the leaderboard. Check your connection.</p><button type="button" class="mlh-btn" data-retry>Try again</button></div>`;
        body.querySelector("[data-retry]").addEventListener("click", () => this._appLeaderboard(body));
        return;
      }
    }
    const f = this._feed;
    const places = f.places || [];
    const score = (p) => (p.media?.length || 0) * 10 + (p.events || 0);
    let rows;
    if (this._lbTab === "cities") {
      rows = places.map((p) => ({
        name: p.city || p.country,
        sub: [p.region, p.country].filter(Boolean).join(", "),
        flag: flag(p.countryCode),
        n: score(p)
      })).sort((a, b) => b.n - a.n);
    } else {
      const by = /* @__PURE__ */ new Map();
      for (const p of places) {
        const k = p.countryCode || p.country;
        const r = by.get(k) || {
          name: p.country,
          sub: "",
          flag: flag(p.countryCode),
          n: 0,
          cities: 0
        };
        r.n += score(p);
        r.cities++;
        r.sub = `${r.cities} ${r.cities === 1 ? "city" : "cities"}`;
        by.set(k, r);
      }
      rows = [...by.values()].sort((a, b) => b.n - a.n);
    }
    const s = f.stats || {};
    body.innerHTML = `
<h3>Where's Bobo? leaderboard</h3>
<p>Every clip and check-in puts a place on the board. Most Bobo sightings wins.</p>
<div class="mlh-stats"><div><b>${s.places ?? 0}</b><small>places</small></div><div><b>${s.countries ?? 0}</b><small>countries</small></div><div><b>${(s.km ?? 0).toLocaleString()}</b><small>km travelled</small></div></div>
<div class="mlh-tabs" role="tablist"><button type="button" role="tab" aria-selected="${this._lbTab === "cities"}" data-tab="cities">Top cities</button><button type="button" role="tab" aria-selected="${this._lbTab === "countries"}" data-tab="countries">Top countries</button></div>
${rows.length ? `<ol class="mlh-lb">${rows.slice(0, 20).map(
      (r, i) => `<li><span class="r">${i + 1}</span><span class="f" aria-hidden="true">${r.flag}</span><span class="n"><b>${esc(r.name)}</b><small>${esc(r.sub)}</small></span><span class="s">${r.n}</span></li>`
    ).join("")}</ol>` : `<div class="mlh-empty"><p>No sightings yet. Be the first.</p></div>`}
<div class="mlh-stack" style="margin-top:14px"><button type="button" class="mlh-btn pri" data-rec>Put your city on the board</button><button type="button" class="mlh-btn" data-globe>Open the globe</button></div>`;
    for (const b of body.querySelectorAll("[data-tab]"))
      b.addEventListener("click", () => {
        this._lbTab = b.dataset.tab;
        this._appLeaderboard(body);
      });
    body.querySelector("[data-rec]").addEventListener("click", () => this._play2(true));
    body.querySelector("[data-globe]").addEventListener("click", () => this._openApp("globe"));
  }
  /* ── alerts ───────────────────────────────────────────────────────── */
  _unread() {
    return this._alerts.filter((a) => !this._read.has(a.id)).length;
  }
  _startPolling() {
    if (this._pollTimer) return;
    this._poll();
    this._pollTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      this._poll();
    }, 15e3);
  }
  _stopPolling() {
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._pollTimer = void 0;
  }
  /** Fetch the alerts feed now (also used by tests). */
  async pollAlerts() {
    await this._poll();
  }
  async _poll() {
    try {
      const r = await fetch(
        this._url(`/api/collector/alerts.json?room=${encodeURIComponent(this.roomId)}`)
      );
      if (!r.ok) return;
      const j = await r.json();
      const list = Array.isArray(j.alerts) ? j.alerts : [];
      const firstLoad = !this._polled && !this._known.size;
      this._polled = true;
      const fresh = list.filter((a) => !this._known.has(a.id));
      this._alerts = list;
      for (const a of list) this._known.add(a.id);
      store.set(this._k("known"), JSON.stringify([...this._known].slice(-200)));
      this._screenDirty = true;
      this._renderTray();
      const w = this._wins.get("alerts");
      if (w && !fresh.length) this._appAlerts(w.body);
      if (!fresh.length || firstLoad) return;
      const newest = fresh[0];
      this._emit("alert", newest);
      this._sfx("ping");
      this._notif = newest;
      this._notifT = 0;
      if (this._el.os.classList.contains("open")) {
        if (w) this._appAlerts(w.body, newest.id);
        else this._osNotify(newest);
      } else if (this._state === "live") this._beamAlertOut(newest);
    } catch {
    }
  }
  _osNotify(a) {
    const n = this._el.notif;
    n.dataset.id = a.id;
    n.innerHTML = `<span class="mlh-tile sm" style="--a:${KIND_COLOR[a.kind]};--b:#1a1440">${ICON3D.alerts}</span><span><b>${esc(a.title)}</b><small>${esc(a.body || KIND_LABEL[a.kind])}</small></span>`;
    n.classList.add("on");
    setTimeout(() => n.classList.remove("on"), 6e3);
  }
  /* ── monitor ──────────────────────────────────────────────────────── */
  _setupScreen(local) {
    const mesh = this._room.getObjectByName("Monitor_Screen");
    if (!mesh) return;
    const mat = mesh.material.clone();
    mesh.material = mat;
    delete mat.userData.mlhReveal;
    this._patch(mat);
    this._owned.push(mat);
    this._screenMat = mat;
    this._screenBase = Math.min(mat.emissiveIntensity || 1, 1.1);
    const b = new THREE3.Box3().setFromObject(mesh);
    b.getCenter(this._screenCenter).applyMatrix4(this._t.m.copy(this._room.matrixWorld).invert());
    void local;
    const img = mat.map?.image || mat.emissiveMap?.image;
    if (!img || !img.width) return;
    const scale = Math.min(1, 1600 / img.width);
    const c = this._screenCanvas = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    this._screenImg = img;
    const tex = this._screenTex = new THREE3.CanvasTexture(c);
    tex.flipY = mat.map ? mat.map.flipY : false;
    srgb(tex);
    this._texs.push(tex);
    if (mat.map) mat.map = tex;
    if (mat.emissiveMap) mat.emissiveMap = tex;
    mat.needsUpdate = true;
    this._screenDirty = true;
  }
  /** Redraw the monitor: live alerts tile, clock, and the pop-up card. */
  _updateScreen(dt) {
    const c = this._screenCanvas;
    if (!c || !this._screenImg) return;
    let animating = false;
    if (this._notifT >= 0) {
      this._notifT += dt;
      animating = this._notifT < 0.6 || this._notifT > 7.4 && this._notifT < 8.2;
      if (this._notifT > 8.2) {
        this._notifT = -1;
        this._screenDirty = true;
      }
    }
    if (!this._screenDirty && !animating) return;
    this._screenDirty = false;
    const g = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    const k = W / 1600;
    g.drawImage(this._screenImg, 0, 0, W, H);
    const S = (v) => v * k;
    const font = (w, px) => `${w} ${Math.round(S(px))}px ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif`;
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(S(x + r), S(y));
      g.arcTo(S(x + w), S(y), S(x + w), S(y + h), S(r));
      g.arcTo(S(x + w), S(y + h), S(x), S(y + h), S(r));
      g.arcTo(S(x), S(y + h), S(x), S(y), S(r));
      g.arcTo(S(x), S(y), S(x + w), S(y), S(r));
      g.closePath();
    };
    g.fillStyle = "rgb(5,9,24)";
    g.fillRect(S(1400), 0, S(200), S(54));
    g.fillStyle = "#dce6ff";
    g.font = font(600, 26);
    g.textAlign = "right";
    g.textBaseline = "middle";
    g.fillText(this._screenClock, S(1572), S(28));
    g.textAlign = "left";
    rr(40, 90, 520, 470, 26);
    g.fillStyle = "rgb(10,18,44)";
    g.fill();
    g.lineWidth = S(3);
    g.strokeStyle = "rgba(54,227,255,.7)";
    g.stroke();
    g.fillStyle = "#fff";
    g.font = font(800, 44);
    g.textBaseline = "alphabetic";
    g.fillText("ALERTS", S(72), S(160));
    const n = this._unread();
    if (n) {
      g.fillStyle = "#ff4fa3";
      g.beginPath();
      g.arc(S(295), S(143), S(27), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = font(800, 34);
      g.textAlign = "center";
      g.fillText(String(Math.min(n, 9)), S(295), S(155));
      g.textAlign = "left";
    }
    const items = this._alerts.slice(0, 2);
    if (!items.length) {
      g.fillStyle = "#9fb0dc";
      g.font = font(600, 28);
      g.fillText("No alerts yet", S(72), S(250));
    }
    items.forEach((a, i) => {
      const y = 210 + i * 160;
      rr(70, y, 460, 132, 18);
      g.fillStyle = this._read.has(a.id) ? "rgb(20,32,70)" : "rgb(30,52,110)";
      g.fill();
      g.fillStyle = KIND_COLOR[a.kind] || "#36e3ff";
      g.beginPath();
      g.arc(S(120), S(y + 66), S(30), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#fff";
      g.font = font(800, 32);
      g.fillText(this._clip(g, a.title, S(330)), S(172), S(y + 58));
      g.fillStyle = "#b4c4ec";
      g.font = font(600, 24);
      g.fillText(this._clip(g, a.body || KIND_LABEL[a.kind], S(330)), S(172), S(y + 98));
    });
    if (this._notifT >= 0 && this._notif) {
      const t = this._notifT;
      const inK = backOut(clamp01(t / 0.6));
      const outK = 1 - ease(clamp01((t - 7.4) / 0.8));
      const y = -150 + 220 * Math.min(inK, 1) * outK + (inK > 1 ? (inK - 1) * 40 : 0);
      const x = 900;
      g.save();
      g.shadowColor = "rgba(0,0,0,.6)";
      g.shadowBlur = S(30);
      rr(x, y, 660, 150, 24);
      g.fillStyle = "rgba(16,26,66,.97)";
      g.fill();
      g.restore();
      rr(x, y, 660, 150, 24);
      g.lineWidth = S(4);
      g.strokeStyle = KIND_COLOR[this._notif.kind] || "#36e3ff";
      g.stroke();
      g.fillStyle = KIND_COLOR[this._notif.kind] || "#36e3ff";
      g.font = font(800, 22);
      g.fillText(KIND_LABEL[this._notif.kind].toUpperCase() + "  \xB7  NEW", S(x + 30), S(y + 44));
      g.fillStyle = "#fff";
      g.font = font(800, 36);
      g.fillText(this._clip(g, this._notif.title, S(600)), S(x + 30), S(y + 90));
      g.fillStyle = "#c4d2f4";
      g.font = font(600, 24);
      g.fillText(
        this._clip(g, this._notif.body || "Tap the computer to read it", S(600)),
        S(x + 30),
        S(y + 126)
      );
    }
    if (this._screenTex) this._screenTex.needsUpdate = true;
  }
  _clip(g, s, w) {
    if (g.measureText(s).width <= w) return s;
    let t = s;
    while (t.length > 1 && g.measureText(t + "\u2026").width > w) t = t.slice(0, -1);
    return t.trimEnd() + "\u2026";
  }
  /* ── hologram beam (the wow) ──────────────────────────────────────── */
  _setupBeam() {
    const cc = this._cardCanvas = document.createElement("canvas");
    cc.width = 1024;
    cc.height = 600;
    const tex = this._cardTex = new THREE3.CanvasTexture(cc);
    srgb(tex);
    this._texs.push(tex);
    this._cardU.uMap.value = tex;
    const geo = new THREE3.PlaneGeometry(1.5, 1.5 * (600 / 1024));
    this._geos.push(geo);
    const mat = new THREE3.ShaderMaterial({
      uniforms: this._cardU,
      vertexShader: CARD_VERT,
      fragmentShader: CARD_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE3.DoubleSide
    });
    this._owned.push(mat);
    this._card = new THREE3.Mesh(geo, mat);
    this._card.visible = false;
    this._card.renderOrder = 10;
    this._room.add(this._card);
    const bg = new THREE3.CylinderGeometry(0.62, 0.08, 1, 32, 1, true);
    bg.translate(0, 0.5, 0);
    this._geos.push(bg);
    const bm = new THREE3.ShaderMaterial({
      uniforms: this._beamU,
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE3.AdditiveBlending,
      side: THREE3.DoubleSide
    });
    this._owned.push(bm);
    this._beam = new THREE3.Mesh(bg, bm);
    this._beam.visible = false;
    this._beam.renderOrder = 9;
    this._beam.raycast = () => void 0;
    this._room.add(this._beam);
  }
  _drawCard(a) {
    const c = this._cardCanvas;
    const g = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    const col = KIND_COLOR[a.kind] || "#36e3ff";
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "rgba(10,30,70,.88)");
    grad.addColorStop(1, "rgba(40,10,60,.88)");
    rr(16, 16, W - 32, H - 32, 44);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = "rgba(54,227,255,.95)";
    g.shadowColor = "#36e3ff";
    g.shadowBlur = 26;
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = col;
    g.lineWidth = 10;
    for (const [x, y, dx, dy] of [
      [40, 40, 1, 1],
      [W - 40, 40, -1, 1],
      [40, H - 40, 1, -1],
      [W - 40, H - 40, -1, -1]
    ]) {
      g.beginPath();
      g.moveTo(x, y + dy * 50);
      g.lineTo(x, y);
      g.lineTo(x + dx * 50, y);
      g.stroke();
    }
    const F = (w, px) => `${w} ${px}px ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif`;
    g.fillStyle = col;
    rr(70, 70, 250, 54, 27);
    g.fill();
    g.fillStyle = "#061226";
    g.font = F(800, 28);
    g.textBaseline = "middle";
    g.fillText(KIND_LABEL[a.kind].toUpperCase(), 92, 98);
    g.fillStyle = "#9cf0ff";
    g.font = F(700, 26);
    g.textAlign = "right";
    g.fillText("INCOMING \xB7 BOBO OS", W - 70, 98);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillStyle = "#ffffff";
    g.font = F(800, 64);
    const lines = (text, max, n) => {
      const words = text.split(/\s+/);
      const out = [];
      let line = "";
      for (const w of words) {
        const t = line ? line + " " + w : w;
        if (g.measureText(t).width > max && line) {
          out.push(line);
          line = w;
          if (out.length === n) break;
        } else line = t;
      }
      if (out.length < n && line) out.push(line);
      if (out.length === n && words.join(" ") !== out.join(" "))
        out[n - 1] = this._clip(g, out[n - 1] + " \u2026", max);
      return out;
    };
    const tl = lines(a.title, W - 140, 2);
    tl.forEach((l, i) => g.fillText(l, 70, 210 + i * 72));
    g.fillStyle = "#d4def8";
    g.font = F(600, 36);
    const by = 210 + tl.length * 72 + 10;
    lines(a.body || "", W - 140, 2).forEach((l, i) => g.fillText(l, 70, by + i * 48));
    g.fillStyle = "#36e3ff";
    g.font = F(800, 30);
    g.fillText("Tap to open  \u2192", 70, H - 66);
    this._cardTex.needsUpdate = true;
  }
  _beamAlertOut(a) {
    if (!this._card || !this._room || this._reduceMotion) {
      this.toast(`New alert: ${a.title}`);
      return;
    }
    this._beamAlert = a;
    this._drawCard(a);
    this._beamT = 0;
    this._beamPhase = "out";
    this._card.visible = true;
    this._beam.visible = true;
    this._flash = 1;
    this._burstFizz(this._screenCenter.clone().add(new THREE3.Vector3(0, 0, 0.15)));
    this._sfx("beam");
    const act = this._play("Excited", 0.2, true);
    if (act) this._backToSit(act);
    this.prompt(`New alert: ${a.title}`, {
      label: "Read it",
      onClick: () => this.openOS("alerts")
    });
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => this._state === "live" && this.prompt(null), 7e3);
  }
  _hideBeam(instant) {
    if (!this._card?.visible) return;
    if (instant) {
      this._card.visible = false;
      this._beam.visible = false;
      this._beamT = -1;
      return;
    }
    if (this._beamPhase !== "in") {
      this._beamPhase = "in";
      this._beamT = 0;
    }
  }
  _updateBeam(dt) {
    if (!this._card || !this._card.visible || this._beamT < 0) return;
    this._beamT += dt;
    this._cardU.uTime.value += dt;
    this._beamU.uTime.value += dt;
    const from = this._screenCenter;
    const to = this._t.v2.set(0.25, 1.6, 2.05);
    let k;
    if (this._beamPhase === "out") {
      k = clamp01(this._beamT / 1);
      if (k >= 1) {
        this._beamPhase = "hold";
        this._beamT = 0;
      }
    } else if (this._beamPhase === "hold") {
      k = 1;
      if (this._beamT > 9) {
        this._beamPhase = "in";
        this._beamT = 0;
      }
    } else {
      k = 1 - clamp01(this._beamT / 0.7);
      if (k <= 0) {
        this._card.visible = false;
        this._beam.visible = false;
        this._beamT = -1;
        return;
      }
    }
    const e = this._beamPhase === "in" ? ease(k) : backOut(k);
    const pos = this._t.v.copy(from).lerp(to, e);
    pos.y += Math.sin(Math.PI * k) * 0.25 + (this._beamPhase === "hold" ? Math.sin(this._time * 1.8) * 0.03 : 0);
    this._card.position.copy(pos);
    this._card.scale.setScalar(Math.max(0.02, Math.min(e, 1.08)));
    const cam = this.opts.getCamera();
    if (cam) {
      const cw = cam.getWorldPosition(new THREE3.Vector3());
      this._room.worldToLocal(cw);
      this._card.rotation.set(0, Math.atan2(cw.x - pos.x, cw.z - pos.z), 0);
    }
    this._cardU.uAlpha.value = Math.min(1, k * 1.6);
    const dir = new THREE3.Vector3().subVectors(pos, from);
    const len = dir.length();
    const beam = this._beam;
    beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(new THREE3.Vector3(0, 1, 0), dir.normalize());
    beam.scale.set(0.9 * e + 0.1, Math.max(1e-3, len), 0.9 * e + 0.1);
    this._beamU.uAlpha.value = this._beamPhase === "hold" ? 0.55 + 0.25 * Math.sin(this._time * 3) : k;
  }
  /* ── fizz burst ───────────────────────────────────────────────────── */
  _setupBurst() {
    const g = new THREE3.SphereGeometry(0.025, 10, 8);
    const m = new THREE3.MeshBasicMaterial({
      color: 12577535,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    this._geos.push(g);
    this._owned.push(m);
    const b = this._burst = new THREE3.InstancedMesh(g, m, 48);
    b.count = 0;
    b.frustumCulled = false;
    b.raycast = () => void 0;
    this._room.add(b);
  }
  _burstFizz(from) {
    this._bubbles.length = 0;
    for (let i = 0; i < 48; i++)
      this._bubbles.push({
        p: from.clone().add(new THREE3.Vector3((Math.random() - 0.5) * 0.15, 0.1, (Math.random() - 0.5) * 0.15)),
        v: new THREE3.Vector3(
          (Math.random() - 0.5) * 0.4,
          0.5 + Math.random() * 0.8,
          (Math.random() - 0.5) * 0.4
        ),
        life: 1.2 + Math.random() * 0.8,
        s: 0.5 + Math.random()
      });
  }
  _updateBurst(dt) {
    const b = this._burst;
    if (!b) return;
    let n = 0;
    const m = this._t.m;
    for (const p of this._bubbles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.v.y += dt * 0.3;
      p.p.addScaledVector(p.v, dt);
      m.makeScale(p.s, p.s, p.s).setPosition(p.p);
      b.setMatrixAt(n++, m);
    }
    b.count = n;
    b.instanceMatrix.needsUpdate = true;
  }
  /* ── sound ────────────────────────────────────────────────────────── */
  _unlockAudio() {
    if (this._ac) {
      if (this._ac.state === "suspended") this._ac.resume().catch(() => void 0);
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this._ac = new AC();
    } catch {
    }
  }
  _sfx(kind) {
    const ac = this._ac;
    if (!ac || ac.state !== "running") return;
    const t = ac.currentTime;
    const tone = (f, at, d, type = "sine", v = 0.12, f2) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t + at);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + d);
      g.gain.setValueAtTime(1e-4, t + at);
      g.gain.exponentialRampToValueAtTime(v, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(1e-4, t + at + d);
      o.connect(g).connect(ac.destination);
      o.start(t + at);
      o.stop(t + at + d + 0.05);
    };
    switch (kind) {
      case "ping":
        tone(988, 0, 0.18, "sine", 0.14);
        tone(1480, 0.09, 0.3, "sine", 0.12);
        break;
      case "beam":
        tone(220, 0, 0.9, "sawtooth", 0.035, 1760);
        tone(1320, 0.5, 0.4, "sine", 0.1);
        tone(1976, 0.62, 0.5, "sine", 0.08);
        break;
      case "boot":
        tone(523, 0, 0.16, "triangle", 0.1);
        tone(784, 0.12, 0.16, "triangle", 0.1);
        tone(1047, 0.24, 0.35, "triangle", 0.1);
        break;
      case "click":
        tone(1400, 0, 0.05, "square", 0.03);
        break;
      case "fizz":
        tone(2400, 0, 0.25, "sawtooth", 0.02, 600);
        break;
      case "unlock":
        tone(660, 0, 0.14, "sine", 0.12);
        tone(880, 0.1, 0.14, "sine", 0.12);
        tone(1320, 0.2, 0.4, "sine", 0.12);
        break;
      case "whoosh":
        tone(120, 0, 1.2, "sawtooth", 0.03, 900);
        break;
      case "mrrp":
        tone(520, 0, 0.18, "triangle", 0.08, 760);
        break;
    }
  }
};
function CSS_escape(s) {
  return s.replace(/["\\\]]/g, "\\$&");
}

// mattercraft/cola-run/CollectorHubMode.ts
var VERSION_LABEL = `v${HIDEOUT_VERSION} \xB7 2026-11-09`;
var clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
var smooth = (t) => t * t * (3 - 2 * t);
var UP2 = new THREE4.Vector3(0, 1, 0);
var FIT_KEY = "mlh-room-fit";
var FIT_MIN = 0.5;
var FIT_MAX = 1.6;
var nextFrame = () => new Promise(
  (r) => typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => r()) : setTimeout(r, 16)
);
var idle = (fn, ms) => setTimeout(() => {
  const ric = globalThis.requestIdleCallback;
  if (typeof ric === "function") ric(fn, { timeout: 2500 });
  else fn();
}, ms);
var CollectorHubMode = class extends Group2 {
  constructor(contextManager, constructorProps) {
    super(contextManager, constructorProps);
    this.constructorProps = constructorProps;
    /* ══ Game ════════════════════════════════════════════════════════════ */
    /**
     * Which Bobo's Hideout files this project has: v4 or later is the release
     * with no portal. If this field isn't here, or the room still shows a
     * portal, the project is still running older copies of the three files:
     * replace CollectorHubMode.ts, HubCore.ts and OrbHuntGame.ts (same names,
     * same folder) and reload the preview.
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 110
     * @zdefault v4 · 2026-11-06
     */
    __publicField(this, "version", new Observable(VERSION_LABEL, (v) => {
      if (v !== VERSION_LABEL) this.version.value = VERSION_LABEL;
    }));
    /**
     * Your Cola Run game node. Leave empty and the hideout finds the game itself.
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 100
     * @zvalues nodeids three/Object3D/**
     */
    __publicField(this, "gameNode", new Observable(void 0));
    /**
     * Bobo in the room. Leave empty to use the game's own Player Node (the
     * joystick character), which is what you want: one Bobo in every mode.
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 90
     * @zvalues nodeids three/Object3D/**
     */
    __publicField(this, "playerNode", new Observable(void 0));
    /**
     * Offer "Visit Bobo's Hideout" on the game's opening card and in its menu.
     * (Sets the game's own Hideout Enabled for you.)
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 85
     * @zdefault true
     */
    __publicField(this, "showInMenus", new Observable(true, () => this._syncGameMenus()));
    /**
     * Show the small round hideout icon in the corner between rounds (lounge,
     * menus, after a round). Turn off to rely on the menus, or open the room
     * from your own UI (call open()).
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 80
     * @zdefault true
     */
    __publicField(this, "showButton", new Observable(true, () => this._syncButton()));
    /**
     * Where the icon sits. Under Menu (default) stacks it under the game's
     * menu button and the record button, well away from a joystick in the
     * bottom corners.
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 78
     * @zdefault underMenu
     */
    __publicField(this, "buttonCorner", new Observable(
      "underMenu" /* UnderMenu */,
      () => this._applyLook()
    ));
    /**
     * Hide the game's own buttons (menu, sound, Reset placement) while Bobo is
     * in his room. Off by default, so moving the room with Reset placement and
     * switching modes from the menu work in the room as everywhere else.
     *
     * @zui
     * @zgroup Game
     * @zgrouppriority 300
     * @zpriority 70
     * @zdefault false
     */
    __publicField(this, "hideGameUi", new Observable(false, () => this._applyLook()));
    /* ══ Home (BOBO OS) ═════════════════════════════════════════════════ */
    /**
     * Make BOBO OS the home screen of the whole game. One button (bottom
     * corner, away from the joystick) opens a sheet with every mode (Cola
     * Run, Lounge, My Room), the apps, music, sound, Move scene, How to play
     * and Join EVADE; Bobo's moves sit behind one action button. The game's
     * own menu, intro card, sound, reset and lounge buttons step aside.
     * After Activation (default): once this phone has unlocked the hideout.
     *
     * @zui
     * @zgroup Home (BOBO OS)
     * @zgrouppriority 250
     * @zpriority 100
     * @zdefault afterActivation
     */
    __publicField(this, "homeScreen", new Observable(
      "afterActivation" /* AfterActivation */,
      () => this._syncShell()
    ));
    /**
     * Where an activated fan lands when they open the experience: My Room
     * (default), the Lounge, or Cola Run.
     *
     * @zui
     * @zgroup Home (BOBO OS)
     * @zgrouppriority 250
     * @zpriority 90
     * @zdefault myRoom
     */
    __publicField(this, "startIn", new Observable("myRoom" /* MyRoom */));
    /**
     * Which side your on-screen joystick is on. The home button and Bobo's
     * moves button sit in the other bottom corner, under the thumb that
     * isn't steering. Auto (default) finds the JoystickController on screen
     * and checks again if it moves; with none found it assumes bottom right,
     * the JoystickController's own default.
     *
     * @zui
     * @zgroup Home (BOBO OS)
     * @zgrouppriority 250
     * @zpriority 80
     * @zdefault auto
     */
    __publicField(this, "joystickSide", new Observable("auto" /* Auto */, () => this._applyLook()));
    /**
     * Where the BOBO OS button sits. Top Right (default) is where a game's
     * menu and pause button usually are: out of the thumbs' way mid-round,
     * and it turns into the pause button while a round is on. The sheet it
     * opens comes up from the bottom, in reach of a thumb. Bottom Corner puts
     * it next to Bobo's moves, away from the joystick.
     *
     * @zui
     * @zgroup Home (BOBO OS)
     * @zgrouppriority 250
     * @zpriority 75
     * @zdefault top
     */
    __publicField(this, "menuButton", new Observable(
      "top" /* TopRight */,
      () => this._applyLook()
    ));
    /**
     * Where the record button (ColaRunRecorder) goes with BOBO OS as home.
     * Bottom Centre (default): a camera-style shutter in the thumb's reach,
     * clear of the joystick. It steps aside while the scene is being placed
     * (Place sits there) and in the room. Recorder Setting keeps the
     * recorder's own Corner.
     *
     * @zui
     * @zgroup Home (BOBO OS)
     * @zgrouppriority 250
     * @zpriority 70
     * @zdefault bottomCenter
     */
    __publicField(this, "recordButton", new Observable("bottomCenter" /* BottomCentre */));
    /* ══ Room ════════════════════════════════════════════════════════════ */
    /**
     * Let fans resize, turn and move their room: pinch and twist with two
     * fingers in the room, or Resize room in BOBO OS for a one-handed panel
     * (drag the room to move it there). Their choice is remembered on the
     * phone and comes back every time the room builds.
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 110
     * @zdefault true
     */
    __publicField(this, "allowAdjust", new Observable(
      true,
      (v) => this._hub?.setFitter(v ? this._makeFitter() : null)
    ));
    /**
     * How big the room gets.
     *  - Both Floors (default): sized to the person holding the phone. The
     *    loft sits just under their eye level (Eye Level) and they stand at the
     *    open edge (Viewer Spot), so they see both floors at once.
     *  - Around Viewer: Room Scale, grown (up to Max Room Scale) until they're
     *    standing inside it.
     *  - Match Bobo: Room Scale only.
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 100
     * @zdefault bothFloors
     */
    __publicField(this, "roomFit", new Observable("bothFloors" /* BothFloors */));
    /**
     * How big the room is, in Bobo-sized rooms: 1 = the room's own Bobo would
     * be exactly as tall as yours. Default 2.7: a walk-in, room-scale space
     * around Bobo that the person holding the phone stands inside. Placing
     * the scene bigger or smaller resizes the room with it. (0.5 to 10)
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 90
     * @zdefault 2.7
     */
    __publicField(this, "roomScale", new Observable(2.7));
    /**
     * With Around Viewer: the biggest the room may grow to fit the viewer in
     * too, in Bobo-sized rooms. Someone standing further away than that just
     * walks in. Never smaller than Room Scale. (1 to 20)
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 85
     * @zdefault 7.2
     */
    __publicField(this, "maxRoomScale", new Observable(7.2));
    /**
     * Where the person holding the phone stands, from the middle of the room
     * (0) to its open edge (1). Default 1.05: just outside the opening, far
     * enough back to see both floors. The room is pushed back (Bobo glides
     * with it, in his bed), brought closer, or grows to put them there.
     * (0.3 to 1.1)
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 84
     * @zdefault 1.05
     */
    __publicField(this, "viewerSpot", new Observable(1.05));
    /**
     * Lower the room (and Bobo with it) this many Bobo heights below the
     * placed floor as it builds, so the loft sits lower in view. 0 keeps it
     * on the floor. (0 to 3)
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 83
     * @zdefault 0.5
     */
    __publicField(this, "roomDrop", new Observable(0.5));
    /**
     * With Both Floors: how high the loft's floor sits, as a share of the
     * viewer's eye height. 0.85 is just under eye level, so they look slightly
     * down into the loft. Lower makes the room smaller. (0.3 to 1.5)
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 82.5
     * @zdefault 0.85
     */
    __publicField(this, "eyeLevel", new Observable(0.85));
    /**
     * How bright the room is. Camera feeds are bright, so the default lifts it
     * above its on-screen look: 1 is the room as modelled. (0.5 to 3)
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 82
     * @zdefault 1.6
     */
    __publicField(this, "brightness", new Observable(1.6, () => this._applyLook()));
    /**
     * Keep Bobo inside his room: the joystick stops him at the wall.
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 80
     * @zdefault true
     */
    __publicField(this, "keepBoboInside", new Observable(true));
    /**
     * Timeline or state played on Bobo when his room starts building (his
     * excited animation suits it). Played like a lounge button: set the game's
     * Lounge Character so it blends cleanly with the joystick.
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 75
     * @zvalues layerclipids
     */
    __publicField(this, "buildTimeline", new Observable(void 0));
    /**
     * Timeline or state played on Bobo once the room is finished (sitting
     * down, a purr). Walking off with the joystick ends it.
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 74
     * @zvalues layerclipids
     */
    __publicField(this, "roomTimeline", new Observable(void 0));
    /**
     * Push the hideout's top bar down (px) if it collides with something else
     * in the top corners.
     *
     * @zui
     * @zgroup Room
     * @zgrouppriority 200
     * @zpriority 70
     * @zdefault 0
     */
    __publicField(this, "topOffset", new Observable(0, () => this._applyLook()));
    /* ══ BOBO OS ═════════════════════════════════════════════════════════ */
    /**
     * How much of the screen Bobo's computer takes. 0.8 = 80% of the screen,
     * with the room still in view around it. 1 = full screen. (0.5 to 1)
     *
     * @zui
     * @zgroup BOBO OS
     * @zgrouppriority 150
     * @zpriority 100
     * @ztype proportion
     * @zdefault 0.8
     */
    __publicField(this, "osSize", new Observable(0.8, () => this._applyLook()));
    /**
     * How solid the computer's screen is. 1 = fully solid; lower lets the room
     * show through behind the desktop (windows stay readable). (0.4 to 1)
     *
     * @zui
     * @zgroup BOBO OS
     * @zgrouppriority 150
     * @zpriority 90
     * @ztype proportion
     * @zdefault 0.88
     */
    __publicField(this, "osOpacity", new Observable(0.88, () => this._applyLook()));
    /**
     * How much the room around the computer is darkened while it's open.
     * 0 = not at all. (0 to 0.8)
     *
     * @zui
     * @zgroup BOBO OS
     * @zgrouppriority 150
     * @zpriority 80
     * @ztype proportion
     * @zdefault 0.18
     */
    __publicField(this, "osDim", new Observable(0.18, () => this._applyLook()));
    /* ══ Site ════════════════════════════════════════════════════════════ */
    /**
     * The MEDIALIFE site that holds the codes, alerts and leaderboard. A preview
     * deploy's address works for testing.
     *
     * @zui
     * @zgroup Site
     * @zgrouppriority 100
     * @zpriority 100
     * @ztype url
     * @zdefault https://medialife.ai
     */
    __publicField(this, "endpoint", new Observable("https://medialife.ai"));
    /**
     * The room model.
     *
     * @zui
     * @zgroup Site
     * @zgrouppriority 100
     * @zpriority 90
     * @ztype url
     * @zdefault https://medialife.ai/hub/evade/room.glb
     */
    __publicField(this, "modelUrl", new Observable("https://medialife.ai/hub/evade/room.glb"));
    /**
     * The Where's Bobo? globe, embedded in BOBO OS.
     *
     * @zui
     * @zgroup Site
     * @zgrouppriority 100
     * @zpriority 80
     * @ztype url
     * @zdefault https://medialife.ai/evade/where-is-bobo/
     */
    __publicField(this, "globeUrl", new Observable("https://medialife.ai/evade/where-is-bobo/"));
    /**
     * Print the shared test code under the unlock form. For test builds only:
     * the code is switched off on medialife.ai unless the team turns it on.
     *
     * @zui
     * @zgroup Site
     * @zgrouppriority 100
     * @zpriority 70
     * @zdefault false
     */
    __publicField(this, "showTestCode", new Observable(false));
    /* ══ Events ══════════════════════════════════════════════════════════ */
    /** The room started building around Bobo (the code was accepted). */
    __publicField(this, "onEnter", new Event());
    /** The room finished building. */
    __publicField(this, "onRoomReady", new Event());
    /** Reset placement in the room: it's an outline now, waiting for Place. */
    __publicField(this, "onRoomMoving", new Event());
    /** The room folded away. */
    __publicField(this, "onLeave", new Event());
    /** A fan unlocked their room (or added an item). */
    __publicField(this, "onUnlocked", new Event());
    /** A live alert from the EVADE team arrived while the room was open. */
    __publicField(this, "onAlert", new Event());
    /** A move picked on BOBO OS's action button (the game's lounge action number). */
    __publicField(this, "onBoboMove", new Event());
    __publicField(this, "_hub", null);
    __publicField(this, "_camera");
    __publicField(this, "_renderer", null);
    __publicField(this, "_scene", null);
    __publicField(this, "_game", null);
    __publicField(this, "_player");
    __publicField(this, "_playerComp", null);
    /** The room is opening or up (unlock form, building, live, leaving). */
    __publicField(this, "_active", false);
    /** Bumped whenever the room is torn down, so anything in flight knows it lost. */
    __publicField(this, "_seq", 0);
    /** Reset placement happened in the room: the next Place rebuilds it straight away. */
    __publicField(this, "_rebuild", false);
    /** Where Bobo stood when the scene was placed (his parent's space): the room's centre. */
    __publicField(this, "_home", new THREE4.Vector3());
    __publicField(this, "_homeSet", false);
    __publicField(this, "_uiWas");
    __publicField(this, "_offGame", []);
    __publicField(this, "_v", new THREE4.Vector3());
    __publicField(this, "_v2", new THREE4.Vector3());
    /* ── getting ready ── */
    __publicField(this, "_prepared");
    /* ── the fan's own size, turn and spot (Adjust room) ── */
    __publicField(this, "_fit", { k: 1, r: 0, ox: 0, oz: 0 });
    __publicField(this, "_baseYaw", 0);
    __publicField(this, "_baseScale", 1);
    __publicField(this, "_boboUnit", 1);
    __publicField(this, "_pivot", new THREE4.Vector3());
    __publicField(this, "_v3", new THREE4.Vector3());
    /* ── closing ── */
    /**
     * The room folds back into Bobo.
     *  exit:          then the game goes to the lounge (or idle)
     *  play / record: quick fold, then a round (and the recorder)
     *  game:          the game already changed mode (menu): quick fold, nothing else
     */
    __publicField(this, "_leavingNow", false);
    /** The Adjust room panel opened or closed: the joystick steps aside meanwhile. */
    __publicField(this, "_stickWas", []);
    __publicField(this, "_layoutT", 0);
    /* The room's settle-back glide (push back + drop), shared with Bobo. */
    __publicField(this, "_glide", new THREE4.Vector3());
    __publicField(this, "_glideBase", new THREE4.Vector3());
    __publicField(this, "_glideK", 0);
    __publicField(this, "_glideTo", 0);
    __publicField(this, "_groundY", 0);
    __publicField(this, "_homeT", -1);
    __publicField(this, "_homeFrom", new THREE4.Vector3());
    __publicField(this, "_failedAt", -1e9);
    __publicField(this, "_fails", 0);
    /* ── BOBO OS as the game's home screen ── */
    __publicField(this, "_layoutKey", "");
    __publicField(this, "_recCornerWas");
    __publicField(this, "_shellOn", false);
    __publicField(this, "_pausedByHome", false);
    __publicField(this, "_startedHome", false);
    __publicField(this, "_heights", /* @__PURE__ */ new WeakMap());
    __publicField(this, "_recWas");
    __publicField(this, "_gone", false);
    if (isDesignTime(contextManager)) return;
    const overlay = useOverlay(contextManager);
    const cam = useCamera(contextManager);
    this._camera = cam.value;
    this.register(cam, (c) => this._camera = c);
    try {
      this._renderer = useRenderer(contextManager);
      this._scene = useScene(contextManager);
    } catch {
    }
    this.register(useOnBeforeRender(contextManager), (dt) => this._tick(dt * 1e-3));
    this.getZComponentInstance().constructed.then(() => {
      if (this._gone) return;
      const qs = new URLSearchParams(location.search);
      const loader = new GLTFLoader2();
      this._hub = new CollectorHub({
        parent: this.element,
        host: overlay.value,
        canvas: useCanvas(contextManager),
        getCamera: () => this._camera,
        loader: { loadAsync: (url) => loader.loadAsync(url) },
        api: this.endpoint.value,
        modelUrl: this.modelUrl.value,
        globeUrl: this.globeUrl.value,
        testHint: this.showTestCode.value ? "BOBO-TEST-CATS" : null,
        hubCode: qs.get("hub"),
        exitLabel: "Back to Cola Run",
        hudOffset: this.topOffset.value,
        portal: false,
        ownBobo: false,
        on: (name, p) => this._onHub(name, p)
      });
      this._loadFit();
      if (this.allowAdjust.value) this._hub.setFitter(this._makeFitter());
      this._bindGame();
      this._syncShell();
      this._syncGameMenus();
      this._applyLook();
      this._syncButton();
      idle(() => void this._prepare(), 1500);
      if (qs.get("hub")) setTimeout(() => this.open(), 600);
    });
  }
  /** The hub itself (for hosts that drive their own camera, like the labs). */
  get hub() {
    return this._hub;
  }
  /**
   * Open the hideout. With the game in the scene this switches the game to
   * its hideout mode (placement first if the scene isn't placed yet); the
   * room opens from there.
   */
  open() {
    const g = this._game;
    if (g?.enterHideout) {
      if (g.isInHideout) this._maybeOpen();
      else g.enterHideout();
    } else void this._open();
  }
  /** The room folds back into Bobo and the game goes back to the lounge. */
  leave(then) {
    return this._leaveRoom(then ?? "exit");
  }
  /** Load the model and warm its shaders and textures. Runs once. */
  _prepare() {
    const hub = this._hub;
    if (!hub) return Promise.resolve();
    this._prepared ?? (this._prepared = hub.load().then(() => hub.warm(this._renderer, this._camera, this._scene)).catch((e) => console.warn("[CollectorHubMode] room preload failed", e)));
    return this._prepared;
  }
  /* ── opening ── */
  _placedOk() {
    const g = this._game;
    return !g || !g.placementEnabled?.value || !!g.isPlaced;
  }
  /** Open the room if the game is in hideout mode and the scene is placed. */
  _maybeOpen() {
    if (this._active || !this._game?.isInHideout || !this._placedOk()) return;
    void this._open();
  }
  _stillWanted() {
    const g = this._game;
    return (!g || !g.enterHideout || g.isInHideout) && this._placedOk();
  }
  async _open() {
    const hub = this._hub;
    if (!hub || this._active) return;
    this._active = true;
    const seq = ++this._seq;
    const rebuild = this._rebuild;
    this._rebuild = false;
    this._syncButton();
    try {
      if (!hub.loaded) {
        hub.prompt("Getting Bobo's room ready\u2026");
        await this._prepare();
        hub.prompt(null);
      }
      if (seq !== this._seq) return;
      if (!hub.loaded) throw new Error("the room model didn't load");
      if (!(rebuild && hub.signedIn) && !await hub.ensureAccess()) {
        if (seq === this._seq) this._cancelled();
        return;
      }
      if (seq !== this._seq) return;
      if (!this._stillWanted()) return this._close();
      await this._settle();
      if (seq !== this._seq || !this._stillWanted()) return this._close();
      const player = this._findPlayer();
      if (!player || !this._camera) {
        console.warn("[CollectorHubMode] no player node or camera; set Player Node");
        return this._close();
      }
      this._placeRoom(player);
      if (this.hideGameUi.value && this._game?.uiEnabled) {
        this._uiWas = this._game.uiEnabled.value;
        this._game.uiEnabled.value = false;
      }
      this._setRecorderVisible(false);
      player.getWorldPosition(this._v);
      hub.enter({ origin: this._v, quick: rebuild });
      this._playCharacter(this.buildTimeline.value);
      this.onEnter.emit();
      this._fails = 0;
    } catch (e) {
      console.error("[CollectorHubMode]", e);
      this._failedAt = performance.now();
      this._fails++;
      hub.prompt(null);
      if (seq === this._seq) this._close();
    }
  }
  /**
   * Stand the room on Bobo's placed spot, in his own space (the AR anchor),
   * open side to the camera. Bobo is brought home first if he's wandered
   * further than the room reaches.
   */
  _placeRoom(player) {
    const hub = this._hub;
    this._snapGlide();
    const parent = player.parent;
    const center = (this._homeSet ? this._home : player.position).clone();
    center.y = this._feetY(player, center.y);
    const bobo = this._playerHeight(player) / (parent ? parent.getWorldScale(this._v).y || 1 : 1);
    const unit = bobo / hub.boboHeight();
    const both = this.roomFit.value === "bothFloors" /* BothFloors */;
    const size = both ? 0.5 : clamp(this.roomScale.value, 0.5, 10);
    const drop = clamp(this.roomDrop.value, 0, 3) * bobo;
    hub.placeAround({
      parent,
      center,
      cameraWorld: this._camera.getWorldPosition(this._v),
      scale: unit * size,
      wrapViewer: this.roomFit.value !== "matchBobo" /* MatchBobo */,
      maxScale: unit * Math.max(size, clamp(this.maxRoomScale.value, 1, 20)),
      boboScale: unit,
      viewerSpot: clamp(this.viewerSpot.value, 0.3, 1.1),
      eyeLevel: both ? clamp(this.eyeLevel.value, 0.3, 1.5) : void 0,
      drop: both ? drop : void 0
    });
    this._groundY = player.position.y;
    this._glide.set(hub.lastPush.x, -drop, hub.lastPush.z);
    this._glideBase.copy(hub.root.position).sub(this._glide);
    this._baseYaw = hub.root.rotation.y;
    this._baseScale = hub.root.scale.x || 1;
    this._pivot.copy(hub.root.position);
    this._boboUnit = unit;
    this._glideK = 0;
    this._glideTo = 1;
    this._poseRoom();
    const spot = this._xf(this._v2.copy(center), this._v2);
    const c = hub.root.position;
    const dx = player.position.x - c.x;
    const dz = player.position.z - c.z;
    if (this._fit.ox || this._fit.oz || Math.hypot(dx, dz) > hub.floorRadius() * 0.8)
      this._setPlayerPos(spot.x, player.position.y, spot.z);
  }
  /** A point of the fitted room (parent space) where the fan's adjustments put it. */
  _xf(v, out) {
    const f = this._fit;
    const p = this._pivot;
    const o = this._v3.set(f.ox, 0, f.oz).multiplyScalar(this._baseScale);
    o.applyAxisAngle(UP2, this._baseYaw);
    return out.copy(v).sub(p).multiplyScalar(f.k).applyAxisAngle(UP2, f.r).add(p).add(o);
  }
  /** Where the room's root is at glide k (0 = where it starts building, 1 = settled). */
  _roomAt(k, out) {
    return this._xf(out.copy(this._glideBase).addScaledVector(this._glide, k), out);
  }
  /** Put the room where the glide and the fan's adjustments say. */
  _poseRoom() {
    const hub = this._hub;
    if (!hub) return;
    this._roomAt(smooth(this._glideK), hub.root.position);
    hub.root.rotation.set(0, this._baseYaw + this._fit.r, 0);
    hub.root.scale.setScalar(this._baseScale * this._fit.k);
    hub.fitBed(this._boboUnit);
    hub.root.updateMatrixWorld(true);
  }
  _loadFit() {
    try {
      const j = JSON.parse(localStorage.getItem(FIT_KEY) || "null");
      if (!j) return;
      this._fit.k = clamp(Number(j.k) || 1, FIT_MIN, FIT_MAX);
      this._fit.r = Number(j.r) || 0;
      this._fit.ox = clamp(Number(j.ox) || 0, -20, 20);
      this._fit.oz = clamp(Number(j.oz) || 0, -20, 20);
    } catch {
    }
  }
  _saveFit() {
    try {
      localStorage.setItem(FIT_KEY, JSON.stringify(this._fit));
    } catch {
    }
  }
  /**
   * Change the fan's adjustments. While the room is up it moves at once and
   * Bobo goes with it (he keeps his spot in the room, on its floor).
   */
  _changeFit(p) {
    const hub = this._hub;
    if (!hub) return;
    const up = hub.state !== "hidden" && hub.root.visible;
    const player = up ? this._findPlayer() : void 0;
    const carry = !!player && player.parent === hub.root.parent;
    let local = null;
    const y0 = hub.root.position.y;
    if (carry) {
      hub.root.updateMatrixWorld(true);
      local = hub.root.worldToLocal(player.getWorldPosition(new THREE4.Vector3()));
    }
    Object.assign(this._fit, p);
    this._saveFit();
    if (!up) return;
    this._poseRoom();
    if (carry && local) {
      const w = hub.root.localToWorld(local);
      const q = player.parent.worldToLocal(w);
      this._setPlayerPos(q.x, player.position.y + (hub.root.position.y - y0), q.z);
    }
  }
  _makeFitter() {
    return {
      get: () => ({ size: this._fit.k, turn: this._fit.r }),
      range: () => [FIT_MIN, FIT_MAX],
      setSize: (k) => this._changeFit({ k: clamp(k, FIT_MIN, FIT_MAX) }),
      turn: (rad) => {
        let r = this._fit.r + rad;
        r = Math.atan2(Math.sin(r), Math.cos(r));
        this._changeFit({ r });
      },
      move: (from, to) => {
        const hub = this._hub;
        const parent = hub?.root.parent;
        if (!hub || !parent) return;
        const a = parent.worldToLocal(from.clone());
        const b = parent.worldToLocal(to.clone());
        const d = b.sub(a).applyAxisAngle(UP2, -this._baseYaw).divideScalar(this._baseScale);
        let ox = this._fit.ox + d.x;
        let oz = this._fit.oz + d.z;
        const lim = hub.floorRadius() / (this._baseScale * this._fit.k || 1) * 0.85;
        const len = Math.hypot(ox, oz);
        if (len > lim) {
          ox *= lim / len;
          oz *= lim / len;
        }
        this._changeFit({ ox, oz });
      },
      reset: () => this._changeFit({ k: 1, r: 0, ox: 0, oz: 0 })
    };
  }
  /** Up to half a second for the placement animation to put Bobo down. */
  async _settle() {
    const p = this._findPlayer();
    await nextFrame();
    if (!p) return;
    const last = p.getWorldPosition(new THREE4.Vector3());
    for (let i = 0; i < 30; i++) {
      await nextFrame();
      const now = p.getWorldPosition(this._v);
      if (now.distanceTo(last) < 1e-4) return;
      last.copy(now);
    }
  }
  /** They closed the unlock form: back to the lounge (or the game's idle state). */
  _cancelled() {
    this._close();
    const g = this._game;
    if (!g?.isInHideout) return;
    if (g.loungeEnabled?.value && g.enterLounge) g.enterLounge();
    else g.exitHideout?.();
  }
  async _leaveRoom(then) {
    const hub = this._hub;
    if (!hub) return;
    const showing = hub.state !== "hidden";
    if (!this._active && !showing) return;
    this._leavingNow = true;
    try {
      await this._leaveRoomInner(hub, then);
    } finally {
      this._leavingNow = false;
    }
  }
  async _leaveRoomInner(hub, then) {
    const seq = ++this._seq;
    this._rebuild = false;
    this._glideTo = 0;
    this._walkHome();
    const inside = hub.state === "building" || hub.state === "live";
    if (inside) {
      const p = this._findPlayer();
      const origin = p ? p.getWorldPosition(this._v) : void 0;
      await hub.leave({ fast: then !== "exit", origin });
      if (seq !== this._seq) return;
    }
    hub.hide();
    this._unpin();
    this._close();
    this.onLeave.emit();
    const g = this._game;
    if (!g) return;
    if (then === "play" || then === "record") {
      g.startGame?.();
      if (then === "record") setTimeout(() => this._recorder()?.startRecording?.(), 500);
    } else if (then === "exit" && g.isInHideout) {
      if (g.loungeEnabled?.value && g.enterLounge) g.enterLounge();
      else g.exitHideout?.();
    }
  }
  /**
   * Reset placement. In the room: it becomes an outline that moves with the
   * reticle and Bobo (it lives on the same anchor), and the next Place builds
   * it back in there. Anywhere else (the unlock form): just stop.
   */
  _onReset() {
    const hub = this._hub;
    if (!hub) return;
    const s = hub.state;
    if (s === "leaving") return;
    if (s === "building" || s === "live" || s === "preview") {
      ++this._seq;
      this._rebuild = true;
      this._homeSet = false;
      this._glideTo = 0;
      hub.preview();
      this._unpin();
      this._active = false;
      this._syncButton();
      this.onRoomMoving.emit();
      return;
    }
    if (this._active) {
      ++this._seq;
      hub.hide();
      this._unpin();
      this._close();
    }
  }
  _unpin() {
    this._restoreGameUi();
    this._setRecorderVisible(true);
  }
  _close() {
    this._active = false;
    this._hub?.prompt(null);
    this._syncButton();
  }
  _onHub(name, p) {
    if (name === "exit") void this._leaveRoom("exit");
    else if (name === "signedOut") {
      void this._leaveRoom("exit");
      this._syncShell();
    } else if (name === "play") this._startRound(!!p.record);
    else if (name === "adjust") this._onAdjust(!!p.on);
    else if (name === "osClose") this._resumeAfterHome();
    else if (name === "unlocked") {
      this.onUnlocked.emit({ firstClaim: !!p.firstClaim, owned: p.me?.owned ?? 0 });
      this._syncShell();
    } else if (name === "alert") this.onAlert.emit({ title: p.title });
    else if (name === "state" && p === "live") {
      this._playCharacter(this.roomTimeline.value);
      this.onRoomReady.emit();
    }
  }
  /**
   * Start a Cola Run round from anywhere. The game changes mode at once and
   * counts down, and the room (if it's up) folds away during the count.
   * Games without the countdown: the room folds first, then the round.
   */
  _startRound(record) {
    const g = this._game;
    if (!g) return;
    this._pausedByHome = false;
    const counts = g.countdown !== void 0;
    if (counts || this._hub?.state === "hidden") {
      g.startGame?.();
      this._syncButton();
      if (record) setTimeout(() => this._recorder()?.startRecording?.(), counts ? 150 : 500);
    } else void this._leaveRoom(record ? "record" : "play");
  }
  _onAdjust(on) {
    if (on) {
      this._stickWas = [];
      for (const j of globalThis.__mattercraftJoysticks ?? []) {
        const el = j?.joystickContainer;
        const obs = typeof j?.visible?.value === "boolean" ? j.visible : void 0;
        if (obs?.value === false) continue;
        this._stickWas.push({ j, v: obs?.value, el, vis: el?.style.visibility ?? "" });
        if (obs) obs.value = false;
        if (el) el.style.visibility = "hidden";
      }
    } else {
      for (const { j, v, el, vis } of this._stickWas) {
        if (typeof v === "boolean") j.visible.value = v;
        if (el) el.style.visibility = vis;
      }
      this._stickWas = [];
    }
    this._applyLook();
  }
  _tick(dt) {
    const hub = this._hub;
    if (!hub) return;
    this._stepGlide(dt);
    this._stepHome(dt);
    hub.update(dt);
    if ((this._layoutT += dt) > 0.25) {
      this._layoutT = 0;
      hub.layoutModeButton();
      this._reconcile();
      if (this._lookKey() !== this._layoutKey) this._applyLook();
      this._syncRecorder();
      this._syncButton();
      hub.syncHome();
    }
    if (!this.keepBoboInside.value) return;
    const s = hub.state;
    if (s !== "building" && s !== "live") return;
    const p = this._findPlayer();
    if (!p || p.parent !== hub.root.parent) return;
    const c = hub.root.position;
    const r = hub.floorRadius() * 0.82;
    const dx = p.position.x - c.x;
    const dz = p.position.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > r) this._setPlayerPos(c.x + dx / d * r, p.position.y, c.z + dz / d * r);
  }
  // Bobo's height on the real floor, in his parent's space
  /** Move the glide toward its target; Bobo moves by the same amount. */
  _stepGlide(dt) {
    if (this._glideK === this._glideTo) return;
    const prev = this._glideK;
    const rate = dt / (this._glideTo > prev ? 1.6 : 0.7);
    this._glideK = this._glideTo > prev ? Math.min(this._glideTo, prev + rate) : Math.max(this._glideTo, prev - rate);
    this._applyGlide(smooth(prev), smooth(this._glideK));
  }
  _applyGlide(from, to) {
    const hub = this._hub;
    const d = to - from;
    if (!hub || Math.abs(d) < 1e-6) return;
    const p = this._findPlayer();
    const a = this._roomAt(from, new THREE4.Vector3());
    const b = this._roomAt(to, new THREE4.Vector3());
    const zero = this._roomAt(0, new THREE4.Vector3());
    if (p && p.parent === hub.root.parent)
      this._setPlayerPos(
        p.position.x + (d > 0 ? b.x - a.x : 0),
        this._groundY + (b.y - zero.y),
        p.position.z + (d > 0 ? b.z - a.z : 0)
      );
    if (hub.state !== "hidden") this._poseRoom();
  }
  /** Glide Bobo back to where he was placed (the room may have taken him a long way). */
  _walkHome() {
    const p = this._findPlayer();
    const hub = this._hub;
    if (!p || !hub || !this._homeSet || p.parent !== hub.root.parent) return;
    if (Math.hypot(p.position.x - this._home.x, p.position.z - this._home.z) < 1e-3) return;
    this._homeFrom.copy(p.position);
    this._homeT = 0;
  }
  _stepHome(dt) {
    if (this._homeT < 0) return;
    const p = this._findPlayer();
    if (!p) {
      this._homeT = -1;
      return;
    }
    this._homeT = Math.min(1, this._homeT + dt / 0.8);
    const k = smooth(this._homeT);
    const f = this._homeFrom;
    const h = this._home;
    this._setPlayerPos(f.x + (h.x - f.x) * k, p.position.y, f.z + (h.z - f.z) * k);
    if (this._homeT >= 1) this._homeT = -1;
  }
  /** Put Bobo straight back where the glide started (before re-placing). */
  _snapGlide() {
    const k = this._glideK;
    this._glideK = this._glideTo = 0;
    this._applyGlide(smooth(k), 0);
  }
  /**
   * The safety net under the event wiring: four times a second, check that
   * the room matches what the game is doing, and fix it if an event was
   * missed (a timeline that places the scene without the game's Place
   * button, events arriving out of order, a failed open).
   *  - Hideout mode, scene placed, room only an outline or not there: build it.
   *  - Not hideout mode any more, room still up: fold it away.
   *  - The scene went back to placing without a Reset: outline mode.
   */
  _reconcile() {
    const hub = this._hub;
    const g = this._game;
    if (!hub || !g?.enterHideout || !hub.loaded) return;
    const s = hub.state;
    const now = performance.now();
    if (!g.isInHideout) {
      if ((s === "live" || s === "building" || s === "preview") && !this._leavingNow)
        void this._leaveRoom("game");
      return;
    }
    if (!this._placedOk()) {
      if (s === "live" || s === "building") this._onReset();
      return;
    }
    if (this._active || s === "building" || s === "live" || s === "leaving") return;
    if (now - this._failedAt < 3e3 * Math.min(4, this._fails)) return;
    if (s === "preview") this._rebuild = true;
    void this._open();
  }
  /**
   * Move Bobo. Through his component's position when he has one: a joystick
   * behaviour integrates position.value, so writing only the three.js
   * object would be undone on its next frame.
   */
  _setPlayerPos(x, y, z) {
    const p = this._findPlayer();
    if (!p) return;
    const pos = this._playerComp?.position;
    if (pos && Array.isArray(pos.value)) pos.value = [x, y, z];
    p.position.set(x, y, z);
  }
  _playCharacter(id) {
    if (!id) return;
    const g = this._game;
    if (g?.playCharacterClip) return g.playCharacterClip(id);
    const clip = this.getZComponentInstance().animation?.layerClipByID?.get(id);
    if (!clip) return;
    clip.seek(0, { dontActivateLayer: true });
    clip.play();
  }
  _restoreGameUi() {
    if (this._uiWas !== void 0 && this._game?.uiEnabled)
      this._game.uiEnabled.value = this._uiWas;
    this._uiWas = void 0;
  }
  /* ── the icon, the menus and the look ── */
  _syncButton() {
    const hub = this._hub;
    if (!hub) return;
    const g = this._game;
    const st = g?.gameState ?? g?._state;
    const busy = !!g && (st === "placing" || !!g.isInHideout || !!g.isIntroOpen || // the card offers the hideout itself
    !!g.isCountingDown || // a round is about to start
    !g.isLounging && (st === "playing" || st === "paused"));
    const show = this.showButton.value && !this._active && !busy && !this._shellOn;
    hub.modeButton(show ? () => this.open() : null);
  }
  _syncGameMenus() {
    const g = this._game;
    if (g?.hideoutEnabled) g.hideoutEnabled.value = !!this.showInMenus.value;
  }
  /** What the layout depends on that can change under us (the joystick, the record button). */
  _lookKey() {
    return `${this._stickSide()}${this._recCorner()}${this._stickClear()}`;
  }
  /** How much of the bottom of the screen the joystick takes (px), 0 with none showing. */
  _stickClear() {
    if (typeof document === "undefined") return 0;
    let clear = 0;
    for (const j of globalThis.__mattercraftJoysticks ?? []) {
      const el = j?.joystickContainer;
      if (!el?.isConnected || j?.visible?.value === false) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      clear = Math.max(clear, innerHeight - r.top);
    }
    return Math.round(clamp(clear, 0, 400) / 4) * 4;
  }
  /**
   * The record button with BOBO OS as home: a shutter at the bottom centre
   * (Record Button), and out of the way while the scene is being placed
   * (Place sits there) and while the room is up (it's for runs).
   */
  _syncRecorder() {
    const r = this._recorder();
    if (!r) return;
    const bc = this._shellOn && this.recordButton.value === "bottomCenter" /* BottomCentre */;
    if (r.corner) {
      if (bc) {
        if (this._recCornerWas === void 0) this._recCornerWas = r.corner.value;
        if (r.corner.value !== "bottomCenter") r.corner.value = "bottomCenter";
      } else if (this._recCornerWas !== void 0) {
        r.corner.value = this._recCornerWas;
        this._recCornerWas = void 0;
      }
    }
    const hub = this._hub;
    const roomUp = this._active || !!hub && hub.state !== "hidden";
    const placing = this._game?.gameState === "placing";
    this._setRecorderVisible(!(roomUp || bc && placing));
  }
  /** The record button's corner (ColaRunRecorder), when BOBO OS is home and it's in a top one. */
  _recCorner() {
    if (!this._shellOn || typeof document === "undefined") return "";
    const el = document.querySelector(".crc-anchor");
    return el?.classList.contains("crc-tr") ? "tr" : el?.classList.contains("crc-tl") ? "tl" : "";
  }
  /** Where the joystick is: the property, or (Auto) where it is on screen. */
  _stickSide() {
    const pick = this.joystickSide.value;
    if (pick === "left" /* Left */ || pick === "right" /* Right */) return pick;
    const list = globalThis.__mattercraftJoysticks;
    for (const j of list ?? []) {
      const el = j?.joystickContainer;
      if (!el?.isConnected || j?.visible?.value === false) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      return r.left + r.width / 2 > innerWidth * 0.6 ? "right" : "left";
    }
    return "right";
  }
  /** Turn the home screen on or off to match Home Screen and the sign-in. */
  _syncShell() {
    const hub = this._hub;
    const g = this._game;
    if (!hub) return;
    const pick = this.homeScreen.value;
    const want = !!g?.setShell && (pick === "always" /* Always */ || pick !== "off" /* Off */ && hub.signedIn);
    if (want === this._shellOn) return;
    this._shellOn = want;
    if (!want && this._pausedByHome) {
      this._pausedByHome = false;
      if (g && (g.gameState === "paused" || g.isCountdownHeld)) setTimeout(() => g.showMenu?.(), 0);
    }
    hub.setHome(want ? this._homeHost() : null);
    g?.setShell?.(want ? { openHome: () => hub.openHome() } : null);
    this._applyLook();
    this._syncButton();
    this._syncRecorder();
    if (want && !this._startedHome && g && !g.isInHideout && !g.isLounging) {
      const st = g.gameState;
      if (st !== "playing" && st !== "paused") {
        if (this.startIn.value === "myRoom" /* MyRoom */) this.open();
        else if (this.startIn.value === "lounge" /* Lounge */ && g.loungeEnabled?.value !== false)
          g.enterLounge?.();
      }
    }
    this._startedHome = true;
  }
  /** Give the round back once nothing of BOBO OS is open over it. */
  _resumeAfterHome() {
    const hub = this._hub;
    const g = this._game;
    if (!this._pausedByHome || !hub || !g) return;
    if (hub.homeOpen || g.isIntroOpen) return;
    this._pausedByHome = false;
    if (g.gameState === "paused" || g.isCountdownHeld) g.resumeGame?.();
  }
  _homeHost() {
    const game = () => this._game;
    const mode = () => {
      const g = game();
      if (!g) return "idle";
      if (g.isInHideout) return "room";
      if (g.isLounging) return "lounge";
      if (g.isCountingDown) return g.isCountdownHeld ? "paused" : "play";
      const st = g.gameState;
      if (st === "playing") return "play";
      if (st === "paused") return "paused";
      if (st === "placing") return "placing";
      return "idle";
    };
    return {
      mode,
      status: () => {
        const g = game();
        const placing = g?.gameState === "placing";
        switch (mode()) {
          case "room": {
            if (placing) return "Point at the floor, then tap Place";
            const me = this._hub?.me;
            const total = me?.collection?.products.length || me?.total || 0;
            return total ? `In your room \xB7 ${me?.owned ?? 0} of ${total} collected` : "In your room";
          }
          case "lounge":
            return placing ? "Point at the floor, then tap Place" : "Hanging out with Bobo";
          case "play": {
            const r = g?.roundStatus;
            return r ? `Cola Run \xB7 ${r.score} of ${r.target} cans` : "Cola Run";
          }
          case "paused": {
            const r = g?.roundStatus;
            return r ? `Paused \xB7 ${r.left} ${r.left === 1 ? "can" : "cans"} to go` : "Paused";
          }
          case "placing":
            return "Point at the floor, then tap Place";
          default:
            return g?.gameState === "won" ? "Round won \xB7 your reward is waiting" : "Ready when you are";
        }
      },
      moves: () => game()?.loungeMoves ?? [],
      move: (id) => {
        const g = game();
        if (!g) return;
        g.loungeMove?.(id);
        this.onBoboMove.emit({ move: id });
      },
      movesReady: () => {
        const g = game();
        if (!g || g.gameState === "placing") return false;
        if (g.isLounging) return true;
        return !!g.isInHideout && this._hub?.state === "live";
      },
      go: (to) => {
        const g = game();
        if (!g) return;
        this._pausedByHome = false;
        if (to === "resume") g.resumeGame?.();
        else if (to === "restart") g.startGame?.();
        else if (to === "play") this._startRound(false);
        else if (to === "lounge") g.enterLounge?.();
        else if (to === "room") this.open();
      },
      howTo: () => game()?.showIntro?.(),
      replace: () => {
        this._pausedByHome = false;
        game()?.resetPlacement?.();
      },
      join: () => {
        const g = game();
        return g && g.claimEnabled?.value !== false ? { label: String(g.claimLabel?.value || "Join EVADE") } : null;
      },
      doJoin: () => game()?.claim?.(),
      reward: () => {
        const g = game();
        if (!g?.rewardEarned || g.rewardEnabled?.value === false) return null;
        return {
          title: String(g.rewardModalTitle?.value || "Your reward"),
          sub: `${String(g.instructionsMenuLabel?.value || "How to claim")} \xB7 your code is inside`
        };
      },
      doReward: () => {
        this._pausedByHome = false;
        game()?.showInstructions?.();
      },
      audio: () => ({
        music: game()?.musicEnabled?.value !== false,
        sound: game()?.soundEnabled?.value !== false
      }),
      setAudio: (kind, on) => {
        const g = game();
        const o = kind === "music" ? g?.musicEnabled : g?.soundEnabled;
        if (o) o.value = on;
      },
      opened: () => {
        const g = game();
        const st = g?.gameState;
        const counting = !!g?.isCountingDown;
        if (st === "playing" || counting) g.pauseGame?.();
        if (st === "playing" || st === "paused" || counting) this._pausedByHome = true;
      },
      closed: () => this._resumeAfterHome()
    };
  }
  /** Fit the hideout's UI around the game's: corner buttons, stacking, BOBO OS. */
  _applyLook() {
    const hub = this._hub;
    if (!hub) return;
    const g = this._game;
    const gameUi = !!g && g.uiEnabled?.value !== false && !this.hideGameUi.value && !this._shellOn;
    const rgb = (v) => Array.isArray(v) && v.length >= 3 ? `rgb(${v.slice(0, 3).map((x) => Math.round(clamp(Number(x), 0, 1) * 255)).join(",")})` : void 0;
    const corner = g?.menuCorner?.value ?? "";
    const soundCorner = g?.soundToggleCorner?.value ?? "";
    const soundOn = !!g && g.soundToggleEnabled?.value !== false;
    const z = Number(g?.modalLayer?.value);
    this._layoutKey = this._lookKey();
    const menuTop = this._shellOn && this.menuButton.value !== "dock" /* BottomCorner */;
    hub.configure({
      osSize: clamp(this.osSize.value, 0.5, 1),
      osOpacity: clamp(this.osOpacity.value, 0.4, 1),
      osDim: clamp(this.osDim.value, 0, 0.8),
      // The game's menu button stays in its corner in the room: keep the top bar clear of it.
      // With BOBO OS as home the record button moves up into that corner instead.
      hudInsetRight: gameUi && corner === "topRight" ? 62 : menuTop ? 66 : this._recCorner() === "tr" ? 58 : 0,
      hudInsetLeft: gameUi && corner === "topLeft" ? 62 : this._recCorner() === "tl" ? 58 : 0,
      menuSpot: menuTop || !this._shellOn ? "top" : "dock",
      stickClear: this._stickClear(),
      // Under the game's dialogs (its menu opens over the room), over its corner buttons.
      zIndex: Number.isFinite(z) && z > 200 ? z - 100 : 2000100,
      ...this._iconSpot(gameUi, corner, soundOn ? soundCorner : ""),
      brightness: clamp(Number(this.brightness.value), 0.5, 3),
      topOffset: Number(this.topOffset.value) || 0,
      joystickSide: this._stickSide(),
      // The game's own mode colours, so BOBO OS and the game read as one.
      accents: {
        play: rgb(g?.uiAccent?.value),
        lounge: rgb(g?.loungeAccent?.value),
        room: rgb(g?.hideoutAccent?.value)
      }
    });
  }
  /**
   * Where the round icon goes. Under Menu: the game menu's corner, below the
   * menu button and the record button. Other corners step past whatever of
   * the game's own buttons share them, so the icon never sits on a joystick
   * (bottom corners are left to it unless picked) or on another button.
   */
  _iconSpot(gameUi, menuCorner, soundCorner) {
    const g = this._game;
    const pick = this.buttonCorner.value;
    const corner = pick === "underMenu" /* UnderMenu */ || !pick ? menuCorner || "topRight" : pick;
    let gap = 14;
    if (gameUi && menuCorner === corner) gap = 78;
    const modeAvoid = ".crc-anchor";
    if (corner.startsWith("bottom")) {
      if (g && soundCorner === corner) gap = Math.max(gap, 74);
      if (g && g.resetCorner?.value === corner) gap = Math.max(gap, 74);
      return { modeCorner: corner, modeBottom: gap, modeAvoid };
    }
    return { modeCorner: corner, modeTop: gap, modeAvoid };
  }
  /* ── finding things ── */
  _bindGame() {
    for (const off of this._offGame) off();
    this._offGame = [];
    const zc = this.getZComponentInstance();
    const id = this.gameNode.value;
    let g = id ? zc.resolveNodeID(id) : null;
    if (!g) {
      const seen = /* @__PURE__ */ new Set();
      const walk = (c) => {
        if (!c || seen.has(c)) return null;
        seen.add(c);
        if (c.onGameStart && c.enterLounge && c.playerNode) return c;
        for (const k of c.children ?? []) {
          const hit = walk(k);
          if (hit) return hit;
        }
        return null;
      };
      g = walk(zc);
    }
    this._game = g;
    if (!g) {
      console.warn(
        "[CollectorHubMode] couldn't find the Cola Run game; set Game to your OrbHuntGame node"
      );
      return;
    }
    if (g.hideoutVersion !== HIDEOUT_VERSION) {
      const msg = "Bobo's Hideout files don't match: replace OrbHuntGame.ts, CollectorHubMode.ts and HubCore.ts with the same release";
      console.warn("[CollectorHubMode] " + msg, { game: g.hideoutVersion, hub: HIDEOUT_VERSION });
      setTimeout(() => this._hub?.toast(msg), 1500);
    }
    if (!g.enterHideout || !g.playCharacterClip)
      console.warn(
        "[CollectorHubMode] this OrbHuntGame.ts is older than the hideout; copy in the new one so the hideout shows in its menus and follows placement"
      );
    const on = (evt, fn) => {
      if (!evt?.addListener) return;
      evt.addListener(fn);
      this._offGame.push(() => evt.removeListener?.(fn));
    };
    const sync = () => setTimeout(() => {
      this._syncButton();
      this._hub?.syncHome();
    });
    for (const e of [
      g.onGameStart,
      g.onLoungeEnter,
      g.onLoungeExit,
      g.onGameEnd,
      g.onTimeUp,
      g.onTargetReached,
      g.onGameReset,
      g.onRewardModalDismissed,
      g.onIntroClose
    ])
      on(e, sync);
    on(g.onIntroClose, () => this._resumeAfterHome());
    on(g.onHideoutEnter, () => {
      sync();
      this._maybeOpen();
    });
    on(g.onHideoutExit, () => {
      sync();
      void this._leaveRoom("game");
    });
    on(g.onPlace, () => {
      sync();
      void this._settle().then(() => {
        this._rememberHome();
        this._maybeOpen();
      });
    });
    on(g.onResetPlacement, () => {
      this._onReset();
      sync();
    });
    for (const o of [
      g.menuCorner,
      g.soundToggleCorner,
      g.resetCorner,
      g.soundToggleEnabled,
      g.uiEnabled,
      g.modalLayer
    ])
      if (o?.addListener) {
        const fn = () => this._applyLook();
        o.addListener(fn);
        this._offGame.push(() => o.removeListener?.(fn));
      }
  }
  _rememberHome() {
    const p = this._findPlayer();
    if (!p) return;
    this._home.copy(p.position);
    this._homeSet = true;
  }
  _findPlayer() {
    if (this._player?.parent) return this._player;
    const zc = this.getZComponentInstance();
    const id = this.playerNode.value || this._game?.playerNode?.value;
    const comp = id ? zc.resolveNodeID(id) : null;
    this._playerComp = comp;
    this._player = comp?.element;
    return this._player;
  }
  /** Bobo's height in world units (measured once in his parent's space). */
  _playerHeight(p) {
    const ws = (p.parent ? p.parent.getWorldScale(this._v2).y : 1) || 1;
    let h = this._heights.get(p);
    if (!h) {
      const b = new THREE4.Box3().setFromObject(p);
      h = Math.max(0.05, b.max.y - b.min.y) / ws;
      this._heights.set(p, h);
    }
    return h * ws;
  }
  /**
   * The height of Bobo's feet in his parent's space: the bottom of his
   * bounds, under where he stands. Falls back to his position when the
   * bounds are odd (nothing visible, or far from him).
   */
  _feetY(p, fallback) {
    const parent = p.parent;
    if (!parent) return fallback;
    const b = new THREE4.Box3().setFromObject(p);
    if (b.isEmpty()) return fallback;
    p.getWorldPosition(this._v2);
    this._v2.y = b.min.y;
    const y = parent.worldToLocal(this._v2).y;
    const h = this._playerHeight(p) / (parent.getWorldScale(this._v2).y || 1);
    return Math.abs(y - fallback) <= h ? y : fallback;
  }
  _recorder() {
    const zc = this.getZComponentInstance();
    const seen = /* @__PURE__ */ new Set();
    const walk = (c) => {
      if (!c || seen.has(c)) return null;
      seen.add(c);
      if (c.onRecordStart && c.buttonVisible) return c;
      for (const k of c.children ?? []) {
        const hit = walk(k);
        if (hit) return hit;
      }
      return null;
    };
    return walk(zc);
  }
  _setRecorderVisible(v) {
    const r = this._recorder();
    if (!r?.buttonVisible) return;
    if (!v) {
      if (this._recWas === void 0) this._recWas = r.buttonVisible.value;
      r.buttonVisible.value = false;
    } else if (this._recWas !== void 0) {
      r.buttonVisible.value = this._recWas;
      this._recWas = void 0;
    }
  }
  dispose() {
    this._gone = true;
    for (const off of this._offGame) off();
    this._offGame = [];
    this._restoreGameUi();
    this._hub?.dispose();
    this._hub = null;
    if (this._stickWas.length) this._onAdjust(false);
    return super.dispose();
  }
};
export {
  CollectorHubMode,
  LabContext,
  OrbHuntGame
};
