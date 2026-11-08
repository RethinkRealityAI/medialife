// GENERATED from mattercraft/loot-break/LootBreakGame.ts by scripts/build-loot-break.mjs. Don't edit.
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

// mattercraft/loot-break/LootBreakGame.ts
import * as THREE2 from "three";
var TIERS = [
  { name: "Common", at: 0, color: "#c9ced6", glow: "#ffffff" },
  { name: "Uncommon", at: 5500, color: "#6fdc5a", glow: "#a8ff8f" },
  { name: "Rare", at: 1e4, color: "#4aa8ff", glow: "#9fd3ff" },
  { name: "Legendary", at: 14500, color: "#ffc53d", glow: "#ffe28a" },
  { name: "Immortal", at: 19e3, color: "#ff4d4d", glow: "#ff9a8a" },
  { name: "Arcana", at: 22500, color: "#ff5ad1", glow: "#ffa6ea" },
  { name: "Beyond", at: 25500, color: "#33e6e6", glow: "#a6fbfb" },
  { name: "Celestial", at: 28500, color: "#f3e3a0", glow: "#fff6cf" },
  { name: "Divine", at: 31500, color: "#ffffff", glow: "#fff8e8" },
  { name: "Cosmic", at: 35e3, color: "#c79bff", glow: "#e9d8ff" }
];
var PAL = {
  a: "#3f2631",
  b: "#c0cbdc",
  c: "#8b9bb4",
  d: "#52607c",
  e: "#bd6c4a",
  f: "#763b36",
  g: "#25956a",
  h: "#43e1b3",
  i: "#f7c282",
  j: "#e19a65",
  k: "#262b44",
  l: "#9b4ca3",
  m: "#d176d0",
  n: "#aab7cc",
  o: "#eaa56c",
  p: "#ffffff",
  q: "#69ffd4",
  r: "#e84537",
  s: "#ff706d",
  t: "#5a6988",
  u: "#b4a98b",
  v: "#dcd4c0",
  w: "#bd9d4a",
  x: "#75e3ff",
  y: "#0099db",
  z: "#c669ff",
  A: "#a543e1",
  B: "#6a2595",
  C: "#914abd",
  D: "#ba6cea",
  E: "#d1c0dc",
  F: "#cb75ff",
  G: "#8800db"
};
var SPRITES = {
  /** Tiny Dungeon tile_0096. */
  knight: [
    "................",
    "......aaaa......",
    "....aaaaaaaa....",
    "...aaaabbaaaa...",
    "..aaacbbbbcaaa..",
    "..aadcbbbbcdaa..",
    "..aaccccccccaa..",
    "..aaccacacacaa..",
    "..aaccacacacaa..",
    "..aaccccccccaa..",
    ".aabbaaaaaabbaa.",
    "aaabbcbbbbcbbaaa",
    "aaddccbddbccddaa",
    "aaddaeeeeeeaddaa",
    "aaaaaddaaddaaaaa",
    ".aaaabbaabbaaaa."
  ],
  /** Tiny Dungeon tile_0112. */
  ranger: [
    "......aaaaa.....",
    "....aaaaaaaa....",
    "...aaaaeeeaaa...",
    "..aaafeeeefaaa..",
    "..aafeeeeeefaa..",
    "..aaggghhhggaa..",
    "..aaeiijjjiiaa..",
    "..aaiikiiikiaa..",
    "..aajikiiikjaa..",
    "..aaajifffjeaa..",
    ".aaagfffeffgaaa.",
    "aaaeggaaaaggeaaa",
    "aaejegeegggejeaa",
    "aaeeagggeegaeeaa",
    "aaaaaffaaffaaaaa",
    ".aaaaeeaaeeaaaa."
  ],
  /** Tiny Dungeon tile_0084. */
  sorcerer: [
    "...aaaaaa.......",
    "..aaaaaaaaa.....",
    ".aaallllaaaa....",
    ".aalalllllaaaa..",
    ".aaaallllllaaaa.",
    ".aalmmmmmmmmlaa.",
    ".aamlaaaaaalmaa.",
    ".aalciiiiiiclaa.",
    ".aaacikkikkiaaa.",
    ".aaaaiibbbiaaa..",
    "aaaaliciiiclaaa.",
    "aaiillbbbbbliiaa",
    "aaiillbbbbbliiaa",
    "aallaebbbbballaa",
    "aallallbbnlallaa",
    ".aaallbbbllaaaa."
  ],
  /** Tiny Dungeon tile_0099. */
  priest: [
    "................",
    "....aaaaaaaa....",
    "...aaaaaaaaaa...",
    "..aaafieeefaaa..",
    "..aaeieieeeeaa..",
    ".aaaeeieeeeeaaa.",
    ".aafeeeeeiiefaa.",
    ".aaeeekiiikieaa.",
    ".aaeeikiiikioaa.",
    ".aaeeiiijiiieaa.",
    ".aaeeeiiiiifeaa.",
    "aaaieejjjjfliaaa",
    "aaiiiellmlliiiaa",
    "aaiiaemmemmaiiaa",
    "aaaaallllllaaaaa",
    ".aaallllmllaaaa."
  ],
  /** Tiny Dungeon tile_0109. */
  brute: [
    "....aaaaaaaa....",
    "...aaaaaaaaaa...",
    "..aaaeiiiieaaa..",
    "..aaepiiiiieaa..",
    "..aaiiiiiiiiaa..",
    "..aaiijjjjjiaa..",
    "..aaiiipkpiiaa..",
    "..aajiipkpijaa..",
    ".aaaaiiiiiieaaa.",
    "aaaieeeeeeeiiaaa",
    "aaiiieaaaaiiiiaa",
    "aaiijiffiiijiiaa",
    "aaiiaiiffiiaiiaa",
    "aaeeafeeeefaeeaa",
    "aaiiaeeaaeeaiiaa",
    "aaaaaeeaaeeaaaaa"
  ],
  /** Tiny Dungeon tile_0108. */
  slime: [
    "................",
    "................",
    ".....aaaaaa.....",
    "....aaaaaaaa....",
    "...aaaqqqqaaa...",
    "...aahqqqqhaa...",
    "...aahhhhhhaa...",
    "..aaahahhahaaa..",
    "..aaghahhahgaa..",
    ".aaaghhhhhhgaaa.",
    ".aahghhaahhghaa.",
    ".aahghhaahhghaa.",
    ".aaaahhhhhhaaaa.",
    "...aaahhhhaaa...",
    "................",
    "................"
  ],
  /** Tiny Dungeon tile_0120. */
  bat: [
    "................",
    "................",
    ".....aaaaaa.....",
    "..aaaaaaaaaaaa..",
    ".aaaaaoaaoaaaaa.",
    "aaaeaaeooeaaeaaa",
    "aaeeefoooofeeeaa",
    "aaeeefpoopfeeeaa",
    "aaeeoeooooeoeeaa",
    "aaeeeaooooaeeeaa",
    "aaoaoaeeeeaoaoaa",
    "aaaaaaoaaoaaaaaa",
    ".aaaaaaaaaaaaaa.",
    ".....aaaaaa.....",
    "................",
    "................"
  ],
  /** Tiny Dungeon tile_0110. */
  boss: [
    "..aaaaaaaaaaaa..",
    ".aaaaaaaaaaaaaa.",
    "aaaraarssraaraaa",
    "aarasrrssrrsaraa",
    "aaaaarrssrraaaaa",
    "aaararrrrrraraaa",
    "aarasffffffsaraa",
    "aaaafiiiiiifaaaa",
    "aaareiaiiaieraaa",
    "aaraaaieeiaaaraa",
    "aassraaaaaarssaa",
    "aassrraaaarrssaa",
    "aarraaaaaaaarraa",
    "aaarrraaaarrraaa",
    ".aaaaaaaaaaaaaa.",
    "..aaaaa..aaaaa.."
  ],
  /** Tiny Dungeon tile_0090. */
  chest: [
    "................",
    "................",
    ".aaaaaaaaaaaaaa.",
    "aaaaaaaaaaaaaaaa",
    "aaecceeeeeecceaa",
    "aaebboooooobbeaa",
    "aaeccebbbbecceaa",
    "aabbbtbkkbtbbbaa",
    "aabbbtbkkbtbbbaa",
    "aafaaabbbbaaafaa",
    "aafaaaaaaaaaafaa",
    "aaeaaaaaaaaaaeaa",
    "aaeeeeeeeeeeeeaa",
    "aatfffffffffftaa",
    "aabeeeeeeeeeebaa",
    "aabbbbbbbbbbbbaa"
  ],
  /** Tiny Dungeon tile_0089. */
  chestOpen: [
    "................",
    "................",
    ".aaaaaaaaaaaaaa.",
    "aaaaaaaaaaaaaaaa",
    "aaecceeeeeecceaa",
    "aaebboooooobbeaa",
    "aaebboooooobbeaa",
    "aaebboooooobbeaa",
    "aaebboooooobbeaa",
    "aaecceeeeeecceaa",
    "aaeccebbbbecceaa",
    "aabbbtbkkbtbbbaa",
    "aabbbtbkkbtbbbaa",
    "aatfffbbbbffftaa",
    "aabeeeffffeeebaa",
    "aabbbbbbbbbbbbaa"
  ],
  /** Tiny Dungeon tile_0101, recoloured gold. */
  coin: [
    "................",
    "................",
    "................",
    "....aaaaaaaa....",
    "...aaaaaaaaaa...",
    "...aauvvvvuaa...",
    "...aavwwwwvaa...",
    "...aavwvvwvaa...",
    "...aavwvvwvaa...",
    "...aavwwwwvaa...",
    "...aauvvvvuaa...",
    "...aaaaaaaaaa...",
    "....aaaaaaaa....",
    "................",
    "................",
    "................"
  ],
  /** Tiny Dungeon tile_0102. */
  shield: [
    "................",
    "................",
    "................",
    "...aaaaaaaaaa...",
    "...aaaaaaaaaa...",
    "...aacbbbbcaa...",
    "...aabbbccbaa...",
    "...aabbbccbaa...",
    "...aabccbbbaa...",
    "...aabccbbbaa...",
    "...aaabbbbaaa...",
    "....aaaaaaaa....",
    ".....aaaaaa.....",
    "................",
    "................",
    "................"
  ],
  /** Tiny Dungeon tile_0104. */
  sword: [
    ".......aaa......",
    "......aaaaa.....",
    ".....aaabaa.....",
    ".....aabbaa.....",
    ".....aabbaa.....",
    ".....aabbaa.....",
    ".....aabbaa.....",
    ".....aabbaa.....",
    ".....aabbaa.....",
    ".....aabbaa.....",
    "....aaaccaaa....",
    "....aabbbbaa....",
    "....aaaeeaaa....",
    ".....aaeeaa.....",
    ".....aaaaaa.....",
    "......aaaa......"
  ],
  /** Tiny Dungeon tile_0118. */
  axe: [
    "...aaaaaaaaaa...",
    "..aaaaaaaaaaaa..",
    ".aaabbaeeabbaaa.",
    "aaabcaaeeaacbaaa",
    "aabcccdoodcccbaa",
    "aabcccdeedcccbaa",
    "aabcccdeedcccbaa",
    "aabcccdoodcccbaa",
    "aaabcaaeeaacbaaa",
    ".aaabbaeeabbaaa.",
    "..aaaaaeeaaaaa..",
    "...aaaaeeaaaa...",
    ".....aaeeaa.....",
    ".....aaeeaa.....",
    ".....aaaaaa.....",
    "......aaaa......"
  ],
  /** Tiny Dungeon tile_0116. */
  potion: [
    "................",
    "................",
    ".....aaaaaa.....",
    "....aaaaaaaa....",
    "....aaeooeaa....",
    "....aaeooeaa....",
    "....aaaccaaa....",
    "....aaabbaaa....",
    "...aaaxxxxaaa...",
    "...aayxxxxyaa...",
    "...aayyyyyyaa...",
    "...aayyyyyyaa...",
    "...aaayyyyaaa...",
    "....aaaaaaaa....",
    ".....aaaaaa.....",
    "................"
  ],
  /** Tiny Dungeon tile_0115. */
  elixir: [
    "................",
    "................",
    ".....aaaaaa.....",
    "....aaaaaaaa....",
    "....aaeooeaa....",
    "....aaeooeaa....",
    "....aaaccaaa....",
    "....aaabbaaa....",
    "...aaassssaaa...",
    "...aarssssraa...",
    "...aarrrrrraa...",
    "...aarrrrrraa...",
    "...aaarrrraaa...",
    "....aaaaaaaa....",
    ".....aaaaaa.....",
    "................"
  ],
  /** Tiny Dungeon tile_0108, recoloured purple. */
  cursed: [
    "................",
    "................",
    ".....aaaaaa.....",
    "....aaaaaaaa....",
    "...aaazzzzaaa...",
    "...aaAzzzzAaa...",
    "...aaAAAAAAaa...",
    "..aaaAaAAaAaaa..",
    "..aaBAaAAaABaa..",
    ".aaaBAAAAAABaaa.",
    ".aaABAAaaAABAaa.",
    ".aaABAAaaAABAaa.",
    ".aaaaAAAAAAaaaa.",
    "...aaaAAAAaaa...",
    "................",
    "................"
  ],
  /** Tiny Dungeon tile_0116, recoloured purple. */
  cosmic: [
    "................",
    "................",
    ".....aaaaaa.....",
    "....aaaaaaaa....",
    "....aaCDDCaa....",
    "....aaCDDCaa....",
    "....aaaccaaa....",
    "....aaaEEaaa....",
    "...aaaFFFFaaa...",
    "...aaGFFFFGaa...",
    "...aaGGGGGGaa...",
    "...aaGGGGGGaa...",
    "...aaaGGGGaaa...",
    "....aaaaaaaa....",
    ".....aaaaaa.....",
    "................"
  ]
};
var LOOT = [
  { name: "Iron Buckler", icon: "shield", tier: 0, weight: 30 },
  { name: "Rusty Blade", icon: "sword", tier: 0, weight: 26 },
  { name: "Hunter's Axe", icon: "axe", tier: 1, weight: 18 },
  { name: "Knight's Shield", icon: "shield", tier: 2, weight: 12 },
  { name: "Sky Potion", icon: "potion", tier: 2, weight: 9 },
  { name: "Storm Blade", icon: "sword", tier: 3, weight: 5 },
  { name: "Ember Elixir", icon: "elixir", tier: 4, weight: 2.5 },
  { name: "Arcana Axe", icon: "axe", tier: 5, weight: 1.2 },
  { name: "Cosmic Potion", icon: "cosmic", tier: 9, weight: 0.3 }
];
var MONSTER_STATS = {
  slime: { hp: 4, speed: 0.16, dps: 2.6, score: 100, px: 1 },
  bat: { hp: 3, speed: 0.26, dps: 2, score: 120, px: 1 },
  brute: { hp: 6, speed: 0.13, dps: 3.6, score: 160, px: 1 },
  /** Tapping it curses the player (combo and party HP). Leave it to the heroes. */
  cursed: { hp: 3, speed: 0.17, dps: 2, score: 60, px: 1 },
  boss: { hp: 65, speed: 0.055, dps: 11, score: 3e3, px: 1.9 }
};
var TUNE = {
  /** Seconds between each hero's automatic attacks. */
  heroCd: { knight: 1.4, ranger: 1.8, sorcerer: 2.9, priest: 2.8 },
  /** Party HP the priest heals per cast (only when the party is hurt). */
  priestHeal: 2,
  /** Monster damage grows by this share over the round (1 = double by 12:59). */
  pressureRamp: 0.55,
  /** The boss shrugs off most party damage: heroes deal this share to it. */
  bossPartyDmg: 0.25,
  /** Weak spot: damage, seconds visible (at difficulty 0), seconds hidden. */
  weakDmg: 6,
  weakOn: 1.5,
  weakOff: 0.55,
  /** Cursed slime: party HP lost when tapped. Spawn chance after 12:12. */
  curseHp: 10,
  /** Three misses inside this many seconds jam the cursor for jamSecs. */
  jamWindow: 1.2,
  jamSecs: 0.9,
  cursedChance: 0.13,
  /** Ultimate meter: charge per player hit (times the combo multiplier). */
  ultPerHit: 1.7,
  /**
   * Portal shield: monsters can't be hit until they're this far out of the
   * portal (lane units; the lane is 0.53 long), so camping the portal doesn't
   * work. A tap on a shielded monster is a miss. They also burst out faster.
   */
  shieldZone: 0.14,
  portalBurst: 1.6,
  /** Seconds a player's hit holds a monster in place (was 0.4: tapping one could hold it forever). */
  hitStun: 0.22,
  /** ...and only once every this many seconds, so the monster keeps fighting between taps. */
  stunEvery: 0.6,
  /** Chance that a spawn comes as a wave of 2 or 3, and the gap between them (s). */
  waveChance: 0.35,
  waveGap: 0.28,
  /** The gap after a wave is this many normal gaps. */
  waveRest: 1.6,
  ultPerWeak: 6,
  ultPerLoot: 4
};
var ULTS = {
  knight: { name: "SHIELD WALL", label: "Shield", key: "1" },
  ranger: { name: "ARROW VOLLEY", label: "Volley", key: "2" },
  sorcerer: { name: "METEOR", label: "Meteor", key: "3" },
  priest: { name: "SANCTUARY", label: "Heal", key: "4" }
};
var ULT_HELP = {
  knight: "Knight: the party takes no damage for 6 seconds",
  ranger: "Ranger: a volley of 14 arrows, strong against the boss",
  sorcerer: "Sorcerer: a meteor that hits every monster on the lane",
  priest: "Priest: heals the party by half"
};
var BADGES = [
  { id: "boss", name: "Boss slain", pts: 1500 },
  { id: "iron", name: "Iron party", pts: 1e3, hint: "Party above half" },
  { id: "combo", name: "Combo x30", pts: 1e3 }
];
function setSRGB(t) {
  const any = t;
  if ("colorSpace" in any) any.colorSpace = "srgb";
  else any.encoding = 3001;
}
function pixelCanvas(rows, mode = "color") {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      g.fillStyle = mode === "white" ? "#ffffff" : PAL[ch] ?? PAL[ch.toLowerCase()] ?? "#ff00ff";
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}
var RETICLE = { w: 124, h: 60, fps: 8 };
function drawReticle(c, step) {
  const W = c.width;
  const H = c.height;
  const g = c.getContext("2d");
  g.clearRect(0, 0, W, H);
  const m = 2;
  const arm = 12;
  const t = 2;
  g.fillStyle = "rgba(111,216,255,0.16)";
  for (let y = m + t + 1; y < H - m - t - 1; y++)
    for (let x = m + t + 1; x < W - m - t - 1; x++) if ((x + y) % 2 === 0) g.fillRect(x, y, 1, 1);
  const layers = { white: /* @__PURE__ */ new Set(), cyan: /* @__PURE__ */ new Set(), gold: /* @__PURE__ */ new Set() };
  const put = (layer, x, y) => {
    if (x >= 0 && y >= 0 && x < W && y < H) layers[layer].add(y * W + x);
  };
  for (const [cx2, sx] of [[m, 1], [W - 1 - m, -1]])
    for (const [cy2, sy] of [[m, 1], [H - 1 - m, -1]])
      for (let i = 0; i < arm; i++)
        for (let k = 0; k < t; k++) {
          put("white", cx2 + sx * i, cy2 + sy * k);
          put("white", cx2 + sx * k, cy2 + sy * i);
        }
  const dash = (i) => ((i + step) % 6 + 6) % 6 < 3;
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const gap = 7;
  for (let x = m + arm + 2; x < W - m - arm - 2; x++) {
    if (Math.abs(x - cx) < gap) continue;
    if (dash(-x)) put("cyan", x, m);
    if (dash(x)) put("cyan", x, H - 1 - m);
  }
  for (let y = m + arm + 2; y < H - m - arm - 2; y++) {
    if (Math.abs(y - cy) < gap) continue;
    if (dash(y)) put("cyan", m, y);
    if (dash(-y)) put("cyan", W - 1 - m, y);
  }
  const bob = step % 4 < 2 ? 0 : 1;
  for (let i = 0; i < 4; i++)
    for (let k = -i; k <= i; k++) {
      put("gold", cx + k, m + 4 - i + bob);
      put("gold", cx + k, H - 1 - m - 4 + i - bob);
      put("gold", m + 4 - i + bob, cy + k);
      put("gold", W - 1 - m - 4 + i - bob, cy + k);
    }
  const all = /* @__PURE__ */ new Set();
  for (const l of Object.values(layers)) for (const v of l) all.add(v);
  g.fillStyle = "rgba(22,18,29,0.85)";
  for (const v of all) {
    const x = v % W;
    const y = (v - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || all.has(ny * W + nx)) continue;
        g.clearRect(nx, ny, 1, 1);
        g.fillRect(nx, ny, 1, 1);
      }
  }
  const colours = { cyan: "#6fd8ff", white: "#ffffff", gold: "#ffc53d" };
  for (const [l, set] of Object.entries(layers)) {
    g.fillStyle = colours[l];
    for (const v of set) {
      const x = v % W;
      g.fillRect(x, (v - x) / W, 1, 1);
    }
  }
}
function nearestTex(c) {
  const t = new THREE2.CanvasTexture(c);
  t.magFilter = THREE2.NearestFilter;
  t.minFilter = THREE2.NearestFilter;
  t.generateMipmaps = false;
  setSRGB(t);
  return t;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
var fmt = (n) => Math.round(n).toLocaleString("en-US");
function todayKey() {
  const d = /* @__PURE__ */ new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function store(key, v) {
  try {
    if (v !== void 0) localStorage.setItem(key, String(v));
    return Number(localStorage.getItem(key) || 0);
  } catch {
    return 0;
  }
}
var Sfx = class {
  constructor(ctx) {
    this.ctx = ctx;
    __publicField(this, "muted", false);
    /** Let sound play through the iPhone's silent switch (Safari 16.4+). */
    __publicField(this, "ignoreSilentSwitch", true);
    __publicField(this, "out", null);
    __publicField(this, "_unlocked", false);
    this.out = ctx?.destination ?? null;
  }
  /**
   * iOS only starts Web Audio from inside a real tap (touchend / click, not
   * touchstart), and keeps it silent on the silent switch unless the page
   * asks for playback audio. Called from every tap; cheap once running.
   */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.out = this.ctx.destination;
      }
      const session = navigator.audioSession;
      if (session && this.ignoreSilentSwitch && session.type !== "playback") session.type = "playback";
      const ctx = this.ctx;
      if (ctx.state !== "running") void ctx.resume().catch(() => void 0);
      if (!this._unlocked) {
        const b = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.connect(ctx.destination);
        src.start(0);
        this._unlocked = true;
      }
    } catch {
    }
  }
  _ok() {
    return !this.muted && this.ctx && this.out && this.ctx.state === "running";
  }
  tone(freq, dur = 0.08, type = "square", vol = 0.08, slide = 0, delay = 0) {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  noise(dur = 0.12, vol = 0.1, delay = 0) {
    if (!this._ok()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource();
    s.buffer = b;
    const g = ctx.createGain();
    g.gain.value = vol;
    s.connect(g).connect(this.out);
    s.start(t);
  }
  hit(combo) {
    this.tone(330 * Math.pow(1.04, Math.min(combo, 30)), 0.06, "square", 0.06, 120);
  }
  kill() {
    this.noise(0.1, 0.09);
    this.tone(180, 0.12, "triangle", 0.1, -120);
  }
  coin() {
    this.tone(988, 0.05, "square", 0.05);
    this.tone(1319, 0.12, "square", 0.05, 0, 0.05);
  }
  loot() {
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.1, "square", 0.05, 0, i * 0.06));
  }
  beep(high = false) {
    this.tone(high ? 880 : 440, 0.14, "square", 0.07);
  }
  boss() {
    this.tone(110, 0.5, "sawtooth", 0.08, -40);
    this.tone(82, 0.7, "sawtooth", 0.06, -20, 0.25);
  }
  hurt() {
    this.tone(140, 0.08, "square", 0.04, -60);
  }
  ult() {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, "square", 0.06, 0, i * 0.045));
    this.noise(0.25, 0.05, 0.2);
  }
  crit() {
    this.tone(1175, 0.06, "square", 0.07);
    this.tone(1568, 0.14, "square", 0.06, -400, 0.05);
    this.noise(0.08, 0.08);
  }
  curse() {
    this.tone(220, 0.25, "sawtooth", 0.07, -150);
    this.tone(233, 0.3, "sawtooth", 0.05, -160, 0.05);
  }
  boom() {
    this.noise(0.5, 0.14);
    this.tone(90, 0.5, "triangle", 0.12, -60);
  }
  chest(tier) {
    const base = [523, 659, 784, 1047, 1319, 1568];
    const n = 3 + Math.min(3, Math.floor(tier / 3));
    for (let i = 0; i < n; i++) this.tone(base[i], 0.16, "square", 0.06, 0, i * 0.09);
    if (tier >= 6) this.noise(0.5, 0.05, n * 0.09);
  }
};
var _LootBreakGame = class _LootBreakGame extends Group2 {
  constructor(contextManager, constructorProps) {
    super(contextManager, constructorProps);
    /* ── Round ───────────────────────────────────────────────────────────── */
    /**
     * How long one round lasts, in seconds (20 to 180). The taskbar clock always
     * runs from 12:00 to 12:59 whatever the length.
     *
     * @zui
     * @zgroup Round
     * @zgrouppriority 100
     * @zpriority 10
     * @zdefault 60
     */
    __publicField(this, "roundSeconds", new Observable(60, (v) => {
      const c = clamp(Math.round(v || 60), 20, 180);
      if (c !== v) this.roundSeconds.value = c;
    }));
    /**
     * When the boss arrives, as a share of the round (0.75 = 45 s into a 60 s round).
     *
     * @zui
     * @zgroup Round
     * @zpriority 9
     * @ztype proportion
     * @zdefault 0.75
     */
    __publicField(this, "bossAt", new Observable(0.75));
    /**
     * How hard the monsters push: 0 is relaxed, 1 is frantic.
     *
     * @zui
     * @zgroup Round
     * @zpriority 8
     * @ztype proportion
     * @zdefault 0.5
     */
    __publicField(this, "difficulty", new Observable(0.5));
    /**
     * Multiplies every rarity threshold. Raise it (e.g. 1.3) if too many players
     * reach Cosmic, lower it (e.g. 0.8) if nobody gets past Rare.
     *
     * @zui
     * @zgroup Round
     * @zpriority 7
     * @zdefault 1
     */
    __publicField(this, "tierScale", new Observable(1, (v) => {
      const c = clamp(v || 1, 0.3, 3);
      if (c !== v) this.tierScale.value = c;
    }));
    /* ── Look ────────────────────────────────────────────────────────────── */
    /**
     * Size of the whole scene. 1 makes the taskbar lane about 1 unit long; scale
     * it to fit your tracker (a desk is roughly 0.4 to 0.6 in metres).
     *
     * @zui
     * @zgroup Look
     * @zgrouppriority 90
     * @zpriority 10
     * @zdefault 1
     */
    __publicField(this, "sceneScale", new Observable(1, (v) => this._scaleRoot.scale.setScalar(clamp(v || 1, 0.05, 20))));
    /**
     * Show the Windows-style taskbar on the front of the lane (start button,
     * tray and the live round clock).
     *
     * @zui
     * @zgroup Look
     * @zpriority 9
     * @zdefault true
     */
    __publicField(this, "showTaskbar", new Observable(true, (v) => this._taskbarFace.visible = !!v));
    /**
     * Turn the sprites to face the phone as it moves around the desk.
     *
     * @zui
     * @zgroup Look
     * @zpriority 8
     * @zdefault true
     */
    __publicField(this, "faceCamera", new Observable(true));
    /* ── Screens ─────────────────────────────────────────────────────────── */
    /**
     * Show the intro card (title, how to play, Start) when the scene loads. Turn
     * off to start rounds yourself with startRound(), e.g. after placement.
     *
     * @zui
     * @zgroup Screens
     * @zgrouppriority 80
     * @zpriority 10
     * @zdefault true
     */
    __publicField(this, "showIntroOnLoad", new Observable(true));
    /**
     * Game title on the intro and results screens.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 9
     * @zdefault LOOT BREAK
     */
    __publicField(this, "title", new Observable("LOOT BREAK", () => this._syncText()));
    /**
     * Line under the title on the intro card.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 8
     * @zdefault A 60-second lunch-break raid on your desk
     */
    __publicField(this, "subtitle", new Observable("A 60-second lunch-break raid on your desk", () => this._syncText()));
    /**
     * Small footer on the results card.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 7
     * @zdefault Activated by MEDIALIFE
     */
    __publicField(this, "footer", new Observable("Activated by MEDIALIFE", () => this._syncText()));
    /**
     * Link the Share button sends with the result. Empty uses this page's address.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 6
     * @zdefault
     */
    __publicField(this, "shareUrl", new Observable(""));
    /**
     * Optional link for keychain owners (redeem your code / open HERO OS). The
     * results card shows a third button when this is set.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 5
     * @zdefault
     */
    __publicField(this, "redeemUrl", new Observable("", () => this._syncText()));
    /**
     * Label of the redeem button.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 4
     * @zdefault Redeem my reward
     */
    __publicField(this, "redeemLabel", new Observable("Redeem my reward", () => this._syncText()));
    /**
     * Sound effects on at the start. Players can still mute with the speaker button.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 3
     * @zdefault true
     */
    __publicField(this, "sound", new Observable(true, (v) => this._setMuted(!v)));
    /**
     * On iPhone, play the sound even with the silent switch on (Safari 16.4+).
     * Players can still mute with the speaker button. Off follows the switch.
     *
     * @zui
     * @zgroup Screens
     * @zpriority 2
     * @zdefault true
     */
    __publicField(this, "playOnSilent", new Observable(true, (v) => {
      if (this._sfx) this._sfx.ignoreSilentSwitch = !!v;
    }));
    /* ── Placement ─────────────────────────────────────────────────────── */
    /**
     * The game's own Place and Re-place buttons. No round starts until the
     * player taps Place, like EVADE. The game drives the Instant World Tracker
     * (or User Placement Anchor Group) it sits inside: placementMode on while
     * placing, off on Place. Remove or hide the template's own place buttons.
     * Turn off only if something else handles placement and starts rounds.
     *
     * @zui
     * @zgroup Placement
     * @zgrouppriority 85
     * @zpriority 10
     * @zdefault true
     */
    __publicField(this, "placementEnabled", new Observable(true, () => this._bindPlacement()));
    /**
     * The Instant World Tracker (or User Placement Anchor Group) to drive.
     * Leave empty and the game uses the one it sits inside, else the first one
     * in the scene.
     *
     * @zui
     * @zgroup Placement
     * @zpriority 9
     * @zvalues nodeids three/Object3D/Group/**
     */
    __publicField(this, "placementGroup", new Observable(void 0, () => this._bindPlacement()));
    /**
     * What the player is told while finding a surface.
     *
     * @zui
     * @zgroup Placement
     * @zpriority 8
     * @zdefault Point your phone where you want the lane, then tap Place.
     */
    __publicField(this, "placeHint", new Observable(
      "Point your phone where you want the lane, then tap Place.",
      () => this._syncPlacementUi()
    ));
    /**
     * Label on the Place button.
     *
     * @zui
     * @zgroup Placement
     * @zpriority 7
     * @zdefault Place on desk
     */
    __publicField(this, "placeButtonLabel", new Observable("Place on desk", () => this._syncPlacementUi()));
    /**
     * Caption under the Re-place button (shown during a round, top right).
     * Blank hides the caption, not the button.
     *
     * @zui
     * @zgroup Placement
     * @zpriority 6
     * @zdefault Re-place
     */
    __publicField(this, "replaceButtonLabel", new Observable("Re-place", () => this._syncPlacementUi()));
    /**
     * Timeline or state played when the player taps Place.
     *
     * @zui
     * @zgroup Placement
     * @zpriority 5
     * @zvalues layerclipids
     */
    __publicField(this, "placeTimeline", new Observable(void 0));
    /**
     * Timeline or state played when the player taps Re-place.
     *
     * @zui
     * @zgroup Placement
     * @zpriority 4
     * @zvalues layerclipids
     */
    __publicField(this, "resetTimeline", new Observable(void 0));
    /* ── Rewards ─────────────────────────────────────────────────────────── */
    /**
     * Discount codes for high rarities and the bonus quest (follow + share for
     * an extra code). The offer, codes and quest accounts are run from the
     * MEDIALIFE admin (Admin > LOOT BREAK). Off hides all of it.
     *
     * @zui
     * @zgroup Rewards
     * @zgrouppriority 75
     * @zpriority 10
     * @zdefault true
     */
    __publicField(this, "rewardsEnabled", new Observable(true, () => this._rewards?.load()));
    /**
     * The site that makes and checks the codes. Keep https://medialife.ai for
     * the live game; a deploy-preview address tests against that preview's codes.
     *
     * @zui
     * @zgroup Rewards
     * @zpriority 9
     * @zdefault https://medialife.ai
     */
    __publicField(this, "rewardsApi", new Observable("https://medialife.ai", () => this._rewards?.load()));
    /* ── Read-only state and events (for timelines, other components) ───── */
    /** The current score. */
    __publicField(this, "score", new Observable(0));
    /** Index into the rarity ladder the score has reached (0 Common … 9 Cosmic). */
    __publicField(this, "tierIndex", new Observable(0));
    /** Fires when a round starts (after the countdown). */
    __publicField(this, "onRoundStart", new Event());
    /** Fires when the boss appears. */
    __publicField(this, "onBoss", new Event());
    /** Fires when the chest has opened: score and rarity name. */
    __publicField(this, "onRoundEnd", new Event());
    /** Fires when the player confirms placement with the Place button. */
    __publicField(this, "onPlace", new Event());
    /** Fires when the player taps Re-place. */
    __publicField(this, "onResetPlacement", new Event());
    /**
     * Fires on reward moments: action ("offer", "claim", "upgrade", "quest_claim",
     * "quest_step_N", "save", "shop") and the percent off (0 when there isn't one).
     */
    __publicField(this, "onReward", new Event());
    /* ── internals ───────────────────────────────────────────────────────── */
    __publicField(this, "_scaleRoot", new THREE2.Group());
    __publicField(this, "_shake", new THREE2.Group());
    __publicField(this, "_world", new THREE2.Group());
    // lane space
    __publicField(this, "_billboards", []);
    __publicField(this, "_taskbarFace");
    __publicField(this, "_taskbarCanvas");
    __publicField(this, "_taskbarTex");
    __publicField(this, "_groundTex");
    __publicField(this, "_portal");
    __publicField(this, "_portalRings", []);
    __publicField(this, "_chest", null);
    __publicField(this, "_chestOpenTex");
    __publicField(this, "_beam", null);
    __publicField(this, "_rays", null);
    __publicField(this, "_disposables", []);
    __publicField(this, "_texCache", /* @__PURE__ */ new Map());
    __publicField(this, "_shadowTex");
    __publicField(this, "_glowTex");
    __publicField(this, "_heroes", []);
    __publicField(this, "_monsters", []);
    __publicField(this, "_shots", []);
    __publicField(this, "_drops", []);
    __publicField(this, "_parts", []);
    __publicField(this, "_floaters", []);
    __publicField(this, "_phase", "idle");
    __publicField(this, "_t", 0);
    // seconds into the round
    __publicField(this, "_phaseT", 0);
    __publicField(this, "_spawnT", 0);
    __publicField(this, "_waveLeft", 0);
    __publicField(this, "_bossSpawned", false);
    __publicField(this, "_partyHp", 100);
    __publicField(this, "_combo", 0);
    __publicField(this, "_misses", 0);
    /** Recent miss times; three quick misses jam the cursor briefly (anti-mashing). */
    __publicField(this, "_missAt", []);
    __publicField(this, "_jamT", 0);
    __publicField(this, "_comboT", 0);
    __publicField(this, "_bestCombo", 0);
    __publicField(this, "_kills", 0);
    __publicField(this, "_lootFound", 0);
    __publicField(this, "_shakeAmt", 0);
    __publicField(this, "_rand", rng(1));
    __publicField(this, "_lastClock", "");
    __publicField(this, "_resultTier", 0);
    /* skill layer: ultimates, the boss's weak spot, cursed slimes, badges */
    __publicField(this, "_ult", 0);
    // 0..100
    __publicField(this, "_ultsUsed", 0);
    __publicField(this, "_shieldT", 0);
    __publicField(this, "_shieldMesh", null);
    __publicField(this, "_volleyLeft", 0);
    __publicField(this, "_volleyT", 0);
    __publicField(this, "_meteor", null);
    __publicField(this, "_weak", null);
    __publicField(this, "_weakHits", 0);
    __publicField(this, "_cursedHits", 0);
    __publicField(this, "_playerHits", 0);
    __publicField(this, "_minHp", 100);
    __publicField(this, "_bossOutcome", "none");
    __publicField(this, "_badges", []);
    __publicField(this, "_bonus", 0);
    __publicField(this, "_wiped", false);
    __publicField(this, "_scoreTier", 0);
    // the rarity the score reached, before a boss escape
    __publicField(this, "_coachKey", "");
    __publicField(this, "_coachT", 0);
    /** Coach tips already shown this session, so each one appears once. */
    __publicField(this, "_coached", /* @__PURE__ */ new Set());
    __publicField(this, "_weakHitting", false);
    __publicField(this, "_weakTex");
    __publicField(this, "_sfx");
    __publicField(this, "_rewards", null);
    __publicField(this, "_cam");
    // DOM
    __publicField(this, "_ui");
    __publicField(this, "_el", {});
    __publicField(this, "_overlayParent", null);
    __publicField(this, "_onPointer", (e) => this._handlePointer(e));
    __publicField(this, "_onUnlock", () => {
      if (!this._sfx.muted) this._sfx.unlock();
    });
    __publicField(this, "_onKey", (e) => {
      if (this._phase !== "playing") return;
      if (e.key === " ") {
        if (!this.tapWeakPoint()) this._tapNearest();
        e.preventDefault();
      } else {
        const id = Object.keys(ULTS).find((k) => ULTS[k].key === e.key);
        if (id) this.fireUlt(id);
      }
    });
    __publicField(this, "_rim");
    __publicField(this, "_padCanvas");
    __publicField(this, "_padTex");
    __publicField(this, "_padStep", -1);
    __publicField(this, "_placePad");
    __publicField(this, "_bannerT", 0);
    __publicField(this, "_toastT", 0);
    __publicField(this, "_v", new THREE2.Vector3());
    __publicField(this, "_cursorT", 0);
    __publicField(this, "_countdownShown", -1);
    /* placement state */
    __publicField(this, "_placed", false);
    /** The Zappar User Placement Anchor Group we drive, if there is one. */
    __publicField(this, "_pg", null);
    __publicField(this, "_pgUnsub", []);
    /** True while we are the ones changing the group's placementMode. */
    __publicField(this, "_pgWriting", false);
    __publicField(this, "_hurtT", 0);
    __publicField(this, "_camLocal", new THREE2.Vector3());
    __publicField(this, "_inv", new THREE2.Matrix4());
    this.element.add(this._scaleRoot);
    this._scaleRoot.add(this._shake);
    this._shake.add(this._world);
    this._cam = useCamera(contextManager);
    let ctx = null;
    try {
      ctx = useAudioContext(contextManager) ?? null;
    } catch {
      ctx = null;
    }
    this._sfx = new Sfx(ctx);
    this._buildTextures();
    this._buildLane();
    this._buildPortal();
    this._buildHeroes();
    this._ui = this._buildUI();
    this._rewards = new LootRewards({
      ui: this._ui,
      strip: this._el.rw,
      api: () => this.rewardsApi.value,
      enabled: () => !!this.rewardsEnabled.value,
      title: () => this.title.value,
      shareUrl: () => this.shareUrl.value || location.href,
      show: (sc) => this._show(sc),
      again: () => this.startRound(),
      emit: (a, p) => this.onReward.emit(a, p)
    });
    this._rewards.load();
    this.register(useOverlay(contextManager), (ov) => {
      if (ov && this._ui.parentElement !== ov) ov.appendChild(this._ui);
      this._overlayParent = ov;
    });
    window.addEventListener("pointerdown", this._onPointer, { capture: true });
    window.addEventListener("keydown", this._onKey);
    for (const t of _LootBreakGame.UNLOCK_EVENTS) window.addEventListener(t, this._onUnlock, { capture: true });
    this.register(useOnBeforeRender(contextManager), (dt) => this._tick(Math.min(dt * 1e-3, 0.1)));
    this._syncText();
    this._renderHud();
    if (this.showIntroOnLoad.value) this.showIntro();
    window.__lootBreak = this;
    this.getZComponentInstance().constructed.then(() => this._bindPlacement()).catch(() => void 0);
  }
  /* ══ public API ═══════════════════════════════════════════════════════ */
  /** Show the intro card (title, how to play, Start). */
  showIntro() {
    this._phase = "idle";
    this._show("intro");
  }
  /**
   * Start a round. If the lane hasn't been placed yet, the player places it
   * first and the countdown starts straight after.
   */
  startRound() {
    if (this._needsPlacement()) {
      this._reset();
      this._enterPlacing();
      return;
    }
    this._reset();
    this._phase = "countdown";
    this._phaseT = 0;
    this._show("hud");
    this._countdownShown = -1;
  }
  /** End the current round now and open the chest. */
  endRound() {
    if (this._phase === "playing") this._finish(false);
  }
  /** True once the lane has been placed (always true when there's nothing to place). */
  get isPlaced() {
    return this._placed || !this.placementEnabled.value;
  }
  /** Confirm placement where the lane is now and start the countdown. */
  place() {
    this._place();
  }
  /** Lift the lane back up so the player can put it somewhere else. Ends a round in progress. */
  resetPlacement() {
    this._resetPlacement(true);
  }
  /** True when the ultimate meter is full and a hero's move can be fired. */
  get ultReady() {
    return this._ult >= 100;
  }
  /**
   * Fire a hero's ultimate (needs a full meter, during a round):
   * knight = Shield Wall, ranger = Arrow Volley, sorcerer = Meteor, priest = Sanctuary.
   */
  fireUlt(id) {
    if (this._phase !== "playing" || this._ult < 100 || !ULTS[id]) return false;
    this._ult = 0;
    this._ultsUsed++;
    const hero = this._heroes.find((h) => h.id === id);
    hero.flash = 0.25;
    hero.lunge = 1;
    this._banner(ULTS[id].name, "is-ult");
    this._el.banner.style.color = "";
    this._sfx.ult();
    for (let i = 0; i < 14; i++) this._spark(new THREE2.Vector3(hero.x, hero.h * 0.6, 0.02), "#ffe28a", 0.35, 0.7);
    if (id === "knight") {
      this._shieldT = 6;
    } else if (id === "ranger") {
      this._volleyLeft = 14;
      this._volleyT = 0;
    } else if (id === "sorcerer") {
      this._castMeteor();
    } else {
      const before = this._partyHp;
      this._partyHp = Math.min(100, this._partyHp + 50);
      for (const k of this._heroes)
        for (let i = 0; i < 6; i++) this._spark(new THREE2.Vector3(k.x, k.h * 0.8, 0.02), "#9dffb0", 0.25, 0.8);
      const wp = new THREE2.Vector3();
      hero.body.getWorldPosition(wp);
      wp.y += hero.h * this._scaleRoot.scale.y * this._worldScale();
      this._floater(`+${Math.round(this._partyHp - before)} HP`, wp, "is-heal");
    }
    this._renderUlt();
    this._coachDone("ult");
    return true;
  }
  /** What happened in the last (or current) round, for analytics and timelines. */
  get roundStats() {
    const taps = this._playerHits + this._misses + this._cursedHits;
    return {
      score: this.score.value,
      tier: TIERS[this._resultTier].name,
      wiped: this._wiped,
      boss: this._bossOutcome,
      ults: this._ultsUsed,
      weakHits: this._weakHits,
      cursedHits: this._cursedHits,
      accuracy: taps ? Math.round(this._playerHits / taps * 100) : 0,
      bestCombo: this._bestCombo,
      kills: this._kills,
      badges: this._badges.slice(),
      bonus: this._bonus,
      minHp: Math.round(this._minHp)
    };
  }
  /** Test hook: tap the boss's weak spot if it is showing. */
  tapWeakPoint() {
    if (this._phase !== "playing" || !this._weak?.on) return false;
    this._hitWeak();
    return true;
  }
  /** Test hook: tap the front cursed slime, as a careless player would. */
  tapCursed() {
    const c = this._monsters.filter((m) => !m.dead && m.kind === "cursed").sort((a, b) => a.x - b.x)[0];
    if (c) this._hitMonster(c, "player");
    return !!c;
  }
  /** Test hook: jump the clock forward (seconds). */
  skip(seconds) {
    if (this._phase === "playing") this._t = Math.min(this._roundLen() - 0.01, this._t + seconds);
  }
  /** Test hook: hit the monster nearest the portal, as a player camping the portal would. */
  tapPortal() {
    const m = this._monsters.filter((x) => !x.dead && !x.shielded && x.kind !== "cursed" && x.kind !== "boss").sort((a, b) => b.x - a.x)[0];
    if (m) this._hitMonster(m, "player");
    return !!m;
  }
  /** Test hook: hit the monster nearest the front, as if tapped. */
  tapFront() {
    return this._tapNearest();
  }
  /** Test hook: state for scripts. */
  get debugState() {
    return {
      phase: this._phase,
      placed: this.isPlaced,
      t: this._t,
      score: this.score.value,
      tier: TIERS[this.tierIndex.value].name,
      monsters: this._monsters.filter((m) => !m.dead).length,
      partyHp: this._partyHp,
      combo: this._combo,
      bestCombo: this._bestCombo,
      misses: this._misses,
      kills: this._kills,
      loot: this._drops.length,
      ult: Math.round(this._ult),
      shield: this._shieldT > 0,
      weakOn: !!this._weak?.on,
      boss: this._bossOutcome,
      bossAlive: this._monsters.some((m) => m.kind === "boss" && !m.dead),
      bossHp: this._monsters.find((m) => m.kind === "boss" && !m.dead)?.hp ?? 0,
      cursedFront: this._frontMonster()?.kind === "cursed",
      cursed: this._monsters.filter((m) => !m.dead && m.kind === "cursed").length,
      weakHits: this._weakHits,
      cursedHits: this._cursedHits,
      ults: this._ultsUsed,
      minHp: Math.round(this._minHp),
      badges: this._badges.join(",")
    };
  }
  /** Rewards as the player sees them: whether they're on, the offer on screen, and the codes saved on this phone. */
  get rewardState() {
    const r = this._rewards;
    return {
      ready: !!r?.ready,
      offer: r?.ready ? this._el.rw.querySelector("[data-act=claim]") ? "claim" : "none" : "off",
      quest: !!r?.cfg?.quest,
      codes: r?.codes ?? {}
    };
  }
  /** Open the rewards screen: "codes" (saved codes), "claim" (the offer on the results card) or "quest". */
  openRewards(view = "codes") {
    return !!this._rewards?.open(view);
  }
  /** Test hook: collect every loot drop on the lane. */
  collectAllLoot() {
    for (const d of this._drops.slice()) this._collect(d);
  }
  /* ══ build: textures ══════════════════════════════════════════════════ */
  _sprite(name) {
    let s = this._texCache.get(name);
    if (!s) {
      const rows = SPRITES[name];
      const tex = nearestTex(pixelCanvas(rows));
      const white = nearestTex(pixelCanvas(rows, "white"));
      s = { tex, white, w: Math.max(...rows.map((r) => r.length)), h: rows.length };
      this._texCache.set(name, s);
      this._disposables.push(tex, white);
    }
    return s;
  }
  _buildTextures() {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, "rgba(0,0,0,0.55)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this._shadowTex = new THREE2.CanvasTexture(c);
    const c2 = document.createElement("canvas");
    c2.width = c2.height = 64;
    const g2 = c2.getContext("2d");
    const gr2 = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr2.addColorStop(0, "rgba(255,255,255,1)");
    gr2.addColorStop(0.35, "rgba(255,255,255,0.45)");
    gr2.addColorStop(1, "rgba(255,255,255,0)");
    g2.fillStyle = gr2;
    g2.fillRect(0, 0, 64, 64);
    this._glowTex = new THREE2.CanvasTexture(c2);
    this._disposables.push(this._shadowTex, this._glowTex);
    this._chestOpenTex = this._sprite("chestOpen").tex;
    this._weakTex = this._track(
      nearestTex(
        pixelCanvas([
          "....kkkkk....",
          "..kkxxxxxkk..",
          ".kxxgggggxxk.",
          ".kxgg...ggxk.",
          "kxgg..w..ggxk",
          "kxg..www..gxk",
          "kxg.wwwww.gxk",
          "kxg..www..gxk",
          "kxgg..w..ggxk",
          ".kxgg...ggxk.",
          ".kxxgggggxxk.",
          "..kkxxxxxkk..",
          "....kkkkk...."
        ])
      )
    );
  }
  _track(x) {
    this._disposables.push(x);
    return x;
  }
  /** A billboarded pixel sprite standing on y = 0, bottom-centre at its origin. */
  _makeActor(name, pxSize, parent = this._world) {
    const s = this._sprite(name);
    const w = s.w * pxSize;
    const h = s.h * pxSize;
    const geo = this._track(new THREE2.PlaneGeometry(w, h));
    geo.translate(0, h / 2, 0);
    const mat = this._track(
      new THREE2.MeshBasicMaterial({ map: s.tex, transparent: true, alphaTest: 0.5, toneMapped: false })
    );
    const body = new THREE2.Mesh(geo, mat);
    const root = new THREE2.Group();
    root.add(body);
    const sh = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(w * 0.9, w * 0.35)),
      this._track(
        new THREE2.MeshBasicMaterial({ map: this._shadowTex, transparent: true, depthWrite: false, toneMapped: false })
      )
    );
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 1e-3;
    sh.raycast = () => void 0;
    root.add(sh);
    parent.add(root);
    this._billboards.push(body);
    return { root, body, mat, tex: s.tex, white: s.white, flash: 0, h };
  }
  _removeActor(a) {
    a.root.removeFromParent();
    const i = this._billboards.indexOf(a.body);
    if (i >= 0) this._billboards.splice(i, 1);
  }
  _buildLane() {
    const { len, depth, height } = _LootBreakGame.LANE;
    const body = new THREE2.Mesh(
      this._track(new THREE2.BoxGeometry(len, height, depth)),
      this._track(new THREE2.MeshBasicMaterial({ color: 1711399, toneMapped: false }))
    );
    body.position.y = -height / 2;
    this._world.add(body);
    const gc = document.createElement("canvas");
    gc.width = 128;
    gc.height = 32;
    const g = gc.getContext("2d");
    const rand = rng(7);
    g.fillStyle = "#6c4a2c";
    g.fillRect(0, 0, 128, 32);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rand() < 0.5 ? "#7d5833" : "#5a3d24";
      g.fillRect(Math.floor(rand() * 128), Math.floor(rand() * 32), 1, 1);
    }
    g.fillStyle = "#5aa83c";
    g.fillRect(0, 0, 128, 7);
    g.fillRect(0, 25, 128, 7);
    for (let x = 0; x < 128; x++) {
      g.fillStyle = rand() < 0.5 ? "#4b9532" : "#7cc84e";
      g.fillRect(x, 7, 1, Math.floor(rand() * 3));
      g.fillRect(x, 25 - Math.floor(rand() * 3), 1, 3);
      if (rand() < 0.06) {
        g.fillStyle = rand() < 0.5 ? "#f2e36b" : "#f28fae";
        g.fillRect(x, 2 + Math.floor(rand() * 4), 1, 1);
      }
    }
    this._groundTex = this._track(new THREE2.CanvasTexture(gc));
    this._groundTex.magFilter = THREE2.NearestFilter;
    this._groundTex.minFilter = THREE2.NearestFilter;
    this._groundTex.generateMipmaps = false;
    this._groundTex.wrapS = THREE2.RepeatWrapping;
    this._groundTex.repeat.set(len / (128 * _LootBreakGame.PX * 0.9), 1);
    setSRGB(this._groundTex);
    const top = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(len, depth)),
      this._track(new THREE2.MeshBasicMaterial({ map: this._groundTex, toneMapped: false }))
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 5e-4;
    this._world.add(top);
    this._taskbarCanvas = document.createElement("canvas");
    this._taskbarCanvas.width = 1024;
    this._taskbarCanvas.height = 46;
    this._taskbarTex = this._track(new THREE2.CanvasTexture(this._taskbarCanvas));
    setSRGB(this._taskbarTex);
    this._taskbarTex.anisotropy = 4;
    this._taskbarFace = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(len, height)),
      this._track(new THREE2.MeshBasicMaterial({ map: this._taskbarTex, toneMapped: false }))
    );
    this._taskbarFace.position.set(0, -height / 2, depth / 2 + 6e-4);
    this._world.add(this._taskbarFace);
    this._drawTaskbar("12:00");
    const edge = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(len, 0.012)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: this._glowTex,
          color: 7330047,
          transparent: true,
          opacity: 0.6,
          blending: THREE2.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    edge.position.set(0, 0, depth / 2 + 2e-3);
    this._world.add(edge);
    const pool = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(len * 1.25, depth * 3)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: this._glowTex,
          color: 8088831,
          transparent: true,
          opacity: 0.35,
          blending: THREE2.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -height + 1e-3;
    this._world.add(pool);
    const pc = document.createElement("canvas");
    pc.width = RETICLE.w;
    pc.height = RETICLE.h;
    const padTex = this._track(nearestTex(pc));
    this._padCanvas = pc;
    this._padTex = padTex;
    drawReticle(pc, 0);
    this._placePad = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(len * 1.12, depth * 3.6)),
      this._track(new THREE2.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, toneMapped: false }))
    );
    this._placePad.rotation.x = -Math.PI / 2;
    this._placePad.position.y = -height + 2e-3;
    this._placePad.renderOrder = -1;
    this._placePad.visible = false;
    this._world.add(this._placePad);
    const rc = document.createElement("canvas");
    rc.width = 2;
    rc.height = 16;
    const rg = rc.getContext("2d");
    for (let y = 0; y < rc.height; y++) {
      if (y % 4 >= 2) continue;
      rg.fillStyle = "#c9a6ff";
      rg.fillRect(0, y, 2, 1);
    }
    const rim = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(8e-3, depth * 0.92)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: this._track(nearestTex(rc)),
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(_LootBreakGame.X_PORTAL - TUNE.shieldZone, 15e-4, 0);
    this._world.add(rim);
    this._rim = rim;
  }
  _drawTaskbar(clock) {
    if (clock === this._lastClock) return;
    this._lastClock = clock;
    const c = this._taskbarCanvas;
    const g = c.getContext("2d");
    const W = c.width;
    const H = c.height;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#2a3346");
    gr.addColorStop(1, "#141a26");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(111,216,255,0.55)";
    g.fillRect(0, 0, W, 2);
    const sx = 18;
    const sy = 10;
    const q = 12;
    g.fillStyle = "#4cc2ff";
    g.fillRect(sx, sy, q, q);
    g.fillRect(sx + q + 2, sy, q, q);
    g.fillRect(sx, sy + q + 2, q, q);
    g.fillRect(sx + q + 2, sy + q + 2, q, q);
    g.fillStyle = "rgba(255,255,255,0.08)";
    g.fillRect(62, 6, 190, H - 12);
    g.fillStyle = "#6fd8ff";
    g.fillRect(140, H - 8, 34, 3);
    g.fillStyle = "#e9eef5";
    g.font = "bold 20px 'Silkscreen', 'Segoe UI', sans-serif";
    g.textBaseline = "middle";
    g.fillText("TBH", 80, H / 2 + 1);
    g.font = "16px 'Segoe UI', sans-serif";
    g.fillText("TaskBarHero", 132, H / 2 + 1);
    g.fillStyle = "#c7d0dc";
    g.font = "16px 'Segoe UI', sans-serif";
    g.textAlign = "right";
    g.fillText("^   \u266A   \u2601", W - 150, H / 2 + 1);
    g.font = "bold 20px 'Segoe UI', sans-serif";
    g.fillStyle = "#ffffff";
    g.fillText(`PM ${clock}`, W - 18, H / 2 + 1);
    g.textAlign = "left";
    this._taskbarTex.needsUpdate = true;
  }
  _buildPortal() {
    const p = new THREE2.Group();
    p.position.set(_LootBreakGame.X_PORTAL, 0, 0);
    const ring = (r, col, seed) => {
      const c = document.createElement("canvas");
      c.width = c.height = 48;
      const g = c.getContext("2d");
      const rnd = rng(seed);
      for (let y = 0; y < 48; y++)
        for (let x = 0; x < 48; x++) {
          const dx = x - 23.5;
          const dy = y - 23.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          const a = Math.atan2(dy, dx);
          const band = Math.sin(a * 3 + d * 0.5);
          if (d < 22 && d > 6 && band > 0.1 - rnd() * 0.3) {
            g.fillStyle = d > 18 ? "#1c0f33" : band > 0.7 ? col : d < 12 ? "#f2d8ff" : "#7a3cff";
            g.fillRect(x, y, 1, 1);
          }
        }
      const t = this._track(nearestTex(c));
      const m = new THREE2.Mesh(
        this._track(new THREE2.PlaneGeometry(r, r)),
        this._track(new THREE2.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, toneMapped: false }))
      );
      return m;
    };
    const holder = new THREE2.Group();
    holder.position.y = 0.085;
    const r1 = ring(0.17, "#c79bff", 3);
    const r2 = ring(0.12, "#ff5ad1", 9);
    r2.position.z = 2e-3;
    holder.add(r1, r2);
    const glow = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(0.34, 0.34)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: this._glowTex,
          color: 10116351,
          transparent: true,
          opacity: 0.55,
          blending: THREE2.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    glow.position.z = -2e-3;
    holder.add(glow);
    p.add(holder);
    this._portalRings = [r1, r2];
    this._billboards.push(holder);
    this._world.add(p);
    this._portal = p;
  }
  _buildHeroes() {
    const ids = ["knight", "ranger", "sorcerer", "priest"];
    ids.forEach((id, i) => {
      const a = this._makeActor(id, LootBootPX());
      const x = _LootBreakGame.X_FRONT - i * 0.085;
      a.root.position.set(x, 0, 0.012 * (i % 2 ? -1 : 1));
      this._heroes.push({ ...a, id, x, cd: 0.3 + i * 0.2, lunge: 0 });
    });
  }
  /* ══ DOM UI ═══════════════════════════════════════════════════════════ */
  _buildUI() {
    injectFonts();
    injectCss();
    const ui = document.createElement("div");
    ui.className = "lb-root";
    ui.innerHTML = `
      <div class="lb-hud" data-screen="hud" hidden>
        <div class="lb-top">
          <div class="lb-chip lb-coins"><i class="lb-coin"></i><b data-k="score">0</b></div>
          <div class="lb-ribbon lb-ribbon-sm"><span data-k="titleSm">LOOT BREAK</span></div>
          <div class="lb-chip lb-clock"><span>PM</span><b data-k="clock">12:00</b></div>
        </div>
        <div class="lb-party" aria-label="Party health"><span>PARTY</span><div class="lb-bar"><i data-k="hp"></i></div></div>
        <button class="lb-iconbtn lb-mute" type="button" data-k="mute" aria-label="Mute sound">\u266A</button>
        <button class="lb-iconbtn lb-replace" type="button" data-k="replace" aria-label="Re-place the game" hidden>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" stroke-width="2"/><rect x="5" y="5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
          <span data-k="replaceLbl">Re-place</span>
        </button>
        <div class="lb-combo" data-k="combo" aria-live="polite"></div>
        <div class="lb-banner" data-k="banner"></div>
        <div class="lb-count" data-k="count"></div>
        <div class="lb-toast" data-k="toast"></div>
        <div class="lb-coach" data-k="coach" aria-live="polite"></div>
        <div class="lb-ults" data-k="ults" role="group" aria-label="Hero ultimates">
          <p class="lb-ults-lbl" data-k="ultLbl">ULT <b data-k="ultPct">0%</b></p>
          <div class="lb-ultbtns" data-k="ultBtns"></div>
        </div>
        <div class="lb-meter">
          <div class="lb-meter-label"><span data-k="tierNow">COMMON</span><span class="lb-arrow">\u25B8</span><span data-k="tierNext">UNCOMMON</span></div>
          <div class="lb-meter-bar"><i data-k="meter"></i></div>
        </div>
      </div>

      <div class="lb-place" data-screen="place" hidden>
        <div class="lb-placebox">
          <p class="lb-placehint" data-k="placeHint"></p>
          <button class="lb-btn lb-btn-go lb-btn-place" type="button" data-k="placeBtn"><span data-k="placeLbl">Place on desk</span></button>
        </div>
      </div>

      <div class="lb-card lb-intro" data-screen="intro" hidden>
        <div class="lb-frame">
          <div class="lb-ribbon"><span data-k="title">LOOT BREAK</span></div>
          <p class="lb-sub" data-k="subtitle"></p>
          <ul class="lb-how">
            <li><i class="lb-ico lb-ico-party"></i><span>Your party fights on its own, but <b>it can't win without you</b>.</span></li>
            <li><i class="lb-ico lb-ico-cursor"></i><span><b>You are the cursor.</b> Tap monsters and loot. A miss breaks your combo.</span></li>
            <li><i class="lb-ico lb-ico-ult"></i><span>Combos charge <b>ultimates</b>. When the bar is full, pick a hero.</span></li>
            <li><i class="lb-ico lb-ico-boss"></i><span>Hit the boss's glowing <b>weak spot</b>. Never tap <b class="lb-purple">purple slimes</b>.</span></li>
            <li><i class="lb-ico lb-ico-chest"></i><span>At 12:59 your chest opens: Common all the way to <b class="lb-cosmic">Cosmic</b>.</span></li>
          </ul>
          <button class="lb-btn lb-btn-go" type="button" data-k="start">Start lunch break</button>
          <p class="lb-best" data-k="bestIntro"></p>
        </div>
      </div>

      <div class="lb-card lb-results" data-screen="results" hidden>
        <div class="lb-frame">
          <div class="lb-ribbon"><span>LOOT!</span></div>
          <p class="lb-kicker" data-k="titleRes">LOOT BREAK</p>
          <div class="lb-tier" data-k="tier">COMMON</div>
          <div class="lb-scoreline"><b data-k="final">0</b><span data-k="bestLine"></span></div>
          <ol class="lb-ladder" data-k="ladder" aria-label="Rarity ladder"></ol>
          <p class="lb-ladder-cap" data-k="ladderCap"></p>
          <section class="lb-sec" data-k="rwSec" hidden>
            <h3 class="lb-sec-h">Rewards</h3>
            <div class="lb-reward" data-k="rw" hidden></div>
          </section>
          <section class="lb-sec lb-sec-round">
            <h3 class="lb-sec-h">Your round</h3>
            <div class="lb-stats">
              <div><b data-k="sKills">0</b><span>Monsters</span></div>
              <div><b data-k="sCombo">0</b><span>Best combo</span></div>
              <div><b data-k="sLoot">0</b><span>Loot found</span></div>
            </div>
            <ul class="lb-badges" data-k="badges" aria-label="Bonuses"></ul>
          </section>
          <div class="lb-actions">
            <button class="lb-btn" type="button" data-k="share">Share</button>
            <button class="lb-btn lb-btn-go" type="button" data-k="again">Play again</button>
          </div>
          <a class="lb-btn lb-btn-redeem" data-k="redeem" target="_blank" rel="noopener" hidden></a>
          <p class="lb-foot" data-k="footer"></p>
        </div>
      </div>
      <div class="lb-cursor" data-k="cursor"></div>
      <div class="lb-floaters" data-k="floaters"></div>
    `;
    ui.querySelectorAll("[data-k]").forEach((el) => this._el[el.dataset.k] = el);
    const ladder = this._el.ladder;
    for (let i = TIERS.length - 1; i >= 0; i--) {
      const li = document.createElement("li");
      li.textContent = TIERS[i].name;
      li.title = TIERS[i].name;
      li.style.setProperty("--c", TIERS[i].color);
      li.dataset.i = String(i);
      ladder.appendChild(li);
    }
    for (const id of Object.keys(ULTS)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lb-ultbtn";
      b.dataset.ult = id;
      b.disabled = true;
      b.setAttribute("aria-label", ULT_HELP[id]);
      b.title = ULT_HELP[id];
      const img = document.createElement("img");
      img.alt = "";
      try {
        img.src = pixelCanvas(SPRITES[id]).toDataURL();
      } catch {
      }
      const lbl = document.createElement("span");
      lbl.textContent = ULTS[id].label;
      b.append(img, lbl);
      b.addEventListener("click", () => this.fireUlt(id));
      this._el.ultBtns.appendChild(b);
    }
    this._el.start.addEventListener("click", () => this.startRound());
    this._el.again.addEventListener("click", () => this.startRound());
    this._el.share.addEventListener("click", () => void this._share());
    this._el.mute.addEventListener("click", () => this._setMuted(!this._sfx.muted));
    this._el.placeBtn.addEventListener("click", () => this._place());
    this._el.replace.addEventListener("click", () => this._resetPlacement(true));
    return ui;
  }
  _syncText() {
    if (!this._el.title) return;
    const t = this.title.value || "LOOT BREAK";
    this._el.title.textContent = t;
    this._el.titleSm.textContent = t;
    this._el.titleRes.textContent = t;
    this._el.subtitle.textContent = this.subtitle.value;
    this._el.footer.textContent = this.footer.value;
    const r = this._el.redeem;
    if (this.redeemUrl.value) {
      r.href = this.redeemUrl.value;
      r.textContent = this.redeemLabel.value || "Redeem my reward";
      r.hidden = false;
    } else r.hidden = true;
    const best = store("lootbreak.best");
    this._el.bestIntro.textContent = best ? `Your best: ${fmt(best)}` : "";
  }
  _setMuted(m) {
    this._sfx.muted = m;
    if (!m) this._sfx?.unlock();
    if (this._el.mute) {
      this._el.mute.classList.toggle("is-off", m);
      this._el.mute.setAttribute("aria-label", m ? "Turn sound on" : "Mute sound");
    }
  }
  _show(screen) {
    this._ui.querySelectorAll("[data-screen]").forEach((el) => {
      const on = el.dataset.screen === screen || (screen === "results" || screen === "reward") && el.dataset.screen === "hud";
      el.hidden = !on;
    });
    this._syncPlacementUi();
    this._ui.classList.toggle("lb-modal", screen === "intro" || screen === "results" || screen === "reward");
    this._ui.classList.toggle("lb-resulting", screen === "results" || screen === "reward");
  }
  _banner(text, cls = "") {
    const b = this._el.banner;
    b.textContent = text;
    b.className = `lb-banner is-on ${cls}`;
    this._bannerT = 1.6;
  }
  _toast(item) {
    const t = this._el.toast;
    const tier = TIERS[item.tier];
    t.innerHTML = `Obtained <b style="color:${tier.color}">${item.name}</b>`;
    t.classList.remove("is-on");
    void t.offsetWidth;
    t.classList.add("is-on");
    this._toastT = 2;
  }
  _renderHud() {
    const s = this.score.value;
    this._el.score.textContent = fmt(s);
    this._el.hp.style.width = `${clamp(this._partyHp, 0, 100)}%`;
    this._el.hp.classList.toggle("is-low", this._partyHp < 30);
    const ti = this._tierFor(s);
    const now = TIERS[ti];
    const next = TIERS[Math.min(ti + 1, TIERS.length - 1)];
    const a = now.at * this.tierScale.value;
    const b = next.at * this.tierScale.value;
    const p = ti === TIERS.length - 1 ? 1 : clamp((s - a) / Math.max(1, b - a), 0, 1);
    this._el.tierNow.textContent = now.name.toUpperCase();
    this._el.tierNow.style.color = now.color;
    this._el.tierNext.textContent = ti === TIERS.length - 1 ? "MAX" : next.name.toUpperCase();
    this._el.tierNext.style.color = next.color;
    const m = this._el.meter;
    m.style.width = `${p * 100}%`;
    m.style.background = `linear-gradient(90deg, ${now.color}, ${next.color})`;
    m.style.boxShadow = `0 0 12px ${next.glow}`;
  }
  _tierFor(score) {
    let ti = 0;
    for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].at * this.tierScale.value) ti = i;
    return ti;
  }
  _floater(text, pos, cls = "") {
    const el = document.createElement("div");
    el.className = `lb-float ${cls}`;
    el.textContent = text;
    this._el.floaters.appendChild(el);
    this._floaters.push({ el, pos: pos.clone(), life: 0, max: 0.8 });
    if (this._floaters.length > 24) {
      const f = this._floaters.shift();
      f.el.remove();
    }
  }
  async _share() {
    const tier = TIERS[this._resultTier].name;
    const text = `I pulled ${tier.toUpperCase()} in ${this.title.value} with ${fmt(this.score.value)} points. Beat my lunch break!`;
    const url = this.shareUrl.value || location.href;
    const nav = navigator;
    try {
      if (nav.share) await nav.share({ title: this.title.value, text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        this._el.share.textContent = "Copied!";
        setTimeout(() => this._el.share.textContent = "Share", 1600);
      }
    } catch {
    }
  }
  /* ══ input ════════════════════════════════════════════════════════════ */
  _handlePointer(e) {
    if (this._phase !== "playing") return;
    const target = e.target;
    const ok = !!target && (target.tagName === "CANVAS" || target === this._overlayParent || target === this._ui || target.classList?.contains("lb-hud") || target.closest?.(".lb-floaters") !== null);
    if (!ok || target?.closest?.("button, a, input, select, [role=button]")) return;
    const rect = this._ui.getBoundingClientRect();
    this._tapAt(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  }
  _toScreen(world, w, h) {
    const cam = this._cam.value;
    this._v.copy(world).project(cam);
    return { x: (this._v.x * 0.5 + 0.5) * w, y: (-this._v.y * 0.5 + 0.5) * h, front: this._v.z < 1 };
  }
  _tapAt(px, py, w, h) {
    this._cursorAt(px, py);
    if (this._jamT > 0) return;
    const reach = Math.max(56, Math.min(w, h) * 0.12);
    const wp = new THREE2.Vector3();
    let best = { d: Infinity };
    for (const d of this._drops) {
      d.mesh.getWorldPosition(wp);
      const s = this._toScreen(wp, w, h);
      const dist = Math.hypot(s.x - px, s.y - py);
      if (s.front && dist < reach * 1.1 && dist < best.d) best = { d: dist, drop: d };
    }
    if (best.drop) {
      this._collect(best.drop);
      return;
    }
    if (this._weak?.on) {
      this._weak.mesh.getWorldPosition(wp);
      const s = this._toScreen(wp, w, h);
      if (s.front && Math.hypot(s.x - px, s.y - py) < reach * 0.85) {
        this._hitWeak();
        return;
      }
    }
    for (const m of this._monsters) {
      if (m.dead) continue;
      m.body.getWorldPosition(wp);
      wp.y += m.h * 0.5 * this._scaleRoot.scale.y * this._worldScale();
      const s = this._toScreen(wp, w, h);
      const dist = Math.hypot(s.x - px, s.y - py);
      if (s.front && dist < reach * (m.kind === "boss" ? 2 : 1) && dist < best.d) best = { d: dist, mon: m };
    }
    if (best.mon) {
      this._hitMonster(best.mon, "player");
      return;
    }
    for (const hero of this._heroes) {
      hero.body.getWorldPosition(wp);
      wp.y += hero.h * 0.5 * this._scaleRoot.scale.y * this._worldScale();
      const s = this._toScreen(wp, w, h);
      if (s.front && Math.hypot(s.x - px, s.y - py) < reach * 0.8) {
        if (this.ultReady) this.fireUlt(hero.id);
        return;
      }
    }
    this._miss();
  }
  /** A tap that hits nothing breaks the combo, so spamming the screen doesn't pay. */
  _miss() {
    this._sfx.tone(220, 0.04, "triangle", 0.03);
    if (this._phase !== "playing") return;
    this._misses++;
    this._missAt = this._missAt.filter((t) => this._t - t < TUNE.jamWindow);
    this._missAt.push(this._t);
    if (this._missAt.length >= 3) {
      this._missAt = [];
      this._jamT = TUNE.jamSecs;
      this._combo = 0;
      this._comboT = 0;
      this._el.cursor.classList.add("is-jam");
      const c = this._el.combo;
      c.innerHTML = `<small>CURSOR</small>JAMMED`;
      c.className = "lb-combo";
      void c.offsetWidth;
      c.className = "lb-combo is-miss";
      this._sfx.tone(160, 0.2, "square", 0.05, -60);
      this._coach("jam", "Too many misses jam the cursor. Aim for the monsters!", 3);
      return;
    }
    if (this._combo >= 3) {
      this._combo = 0;
      this._comboT = 0;
      const c = this._el.combo;
      c.innerHTML = `<small>COMBO</small>MISS`;
      c.className = "lb-combo";
      void c.offsetWidth;
      c.className = "lb-combo is-miss";
    }
  }
  _worldScale() {
    const v = new THREE2.Vector3();
    this.element.getWorldScale(v);
    return (v.x + v.y + v.z) / 3;
  }
  _tapNearest() {
    const front = this._monsters.filter((m) => !m.dead && m.kind !== "cursed").sort((a, b) => (a.kind === "boss" ? -1 : 0) - (b.kind === "boss" ? -1 : 0) || a.x - b.x)[0];
    if (front) this._hitMonster(front, "player");
    return !!front;
  }
  _cursorAt(x, y) {
    const c = this._el.cursor;
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.classList.remove("is-click");
    void c.offsetWidth;
    c.classList.add("is-click");
    this._cursorT = 0.7;
  }
  /* ══ round flow ═══════════════════════════════════════════════════════ */
  _roundLen() {
    return this.roundSeconds.value;
  }
  _reset() {
    for (const m of this._monsters) this._removeActor(m);
    this._monsters.length = 0;
    for (const s of this._shots) s.mesh.removeFromParent();
    this._shots.length = 0;
    for (const d of this._drops) {
      d.mesh.removeFromParent();
      d.glow.removeFromParent();
    }
    this._drops.length = 0;
    for (const p of this._parts) p.mesh.removeFromParent();
    this._parts.length = 0;
    for (const f of this._floaters) f.el.remove();
    this._floaters.length = 0;
    if (this._chest) this._removeActor(this._chest);
    this._chest = null;
    this._beam?.removeFromParent();
    this._beam = null;
    this._rays?.removeFromParent();
    this._rays = null;
    for (const h of this._heroes) h.root.visible = true;
    this._t = 0;
    this._spawnT = 0.6;
    this._waveLeft = 0;
    this._bossSpawned = false;
    this._partyHp = 100;
    this._combo = 0;
    this._comboT = 0;
    this._bestCombo = 0;
    this._misses = 0;
    this._missAt = [];
    this._jamT = 0;
    this._el.cursor.classList.remove("is-jam");
    this._kills = 0;
    this._lootFound = 0;
    this._resultTier = 0;
    this._scoreTier = 0;
    this._ult = 0;
    this._ultsUsed = 0;
    this._shieldT = 0;
    if (this._shieldMesh) this._shieldMesh.visible = false;
    this._volleyLeft = 0;
    this._clearMeteor();
    this._weak = null;
    this._weakHits = 0;
    this._cursedHits = 0;
    this._playerHits = 0;
    this._minHp = 100;
    this._bossOutcome = "none";
    this._badges = [];
    this._bonus = 0;
    this._wiped = false;
    this._hideCoach();
    this._ui.classList.remove("lb-danger", "lb-hurt");
    this._renderUlt();
    this._rand = rng((Date.now() & 65535) + 11);
    this.score.value = 0;
    this.tierIndex.value = 0;
    this._el.combo.className = "lb-combo";
    this._drawTaskbar("12:00");
    this._el.clock.textContent = "12:00";
    this._renderHud();
  }
  _addScore(n) {
    this.score.value = this.score.value + Math.round(n);
    const ti = this._tierFor(this.score.value);
    if (ti !== this.tierIndex.value) {
      if (ti > this.tierIndex.value && this._phase === "playing") {
        this._banner(`${TIERS[ti].name.toUpperCase()}!`, "is-tier");
        this._el.banner.style.color = TIERS[ti].color;
        this._sfx.loot();
      }
      this.tierIndex.value = ti;
    }
  }
  _comboMult() {
    return 1 + Math.min(2, Math.floor(this._combo / 10) * 0.5);
  }
  _finish(wiped) {
    this._phase = "ending";
    this._phaseT = 0;
    this._wiped = wiped;
    const bossAlive = this._monsters.some((m) => m.kind === "boss" && !m.dead);
    if (bossAlive && !wiped) this._bossOutcome = "escaped";
    this._badges = [];
    if (this._bossOutcome === "slain") this._badges.push("boss");
    if (!wiped && this._minHp >= 50) this._badges.push("iron");
    if (this._bestCombo >= 30) this._badges.push("combo");
    this._bonus = BADGES.filter((b) => this._badges.includes(b.id)).reduce((a, b) => a + b.pts, 0);
    if (this._bonus) this._addScore(this._bonus);
    this._scoreTier = this._tierFor(this.score.value);
    this._resultTier = this._bossOutcome === "escaped" ? Math.max(0, this._scoreTier - 1) : this._scoreTier;
    this._banner(wiped ? "PARTY DOWN!" : this._bossOutcome === "escaped" ? "BOSS ESCAPED!" : "LUNCH IS OVER!", "is-end");
    this._el.banner.style.color = this._bossOutcome === "escaped" ? "#ff8a8a" : "";
    this._shieldT = 0;
    if (this._shieldMesh) this._shieldMesh.visible = false;
    this._volleyLeft = 0;
    this._clearMeteor();
    this._hideCoach();
    this._ui.classList.remove("lb-danger");
    for (const m of this._monsters) if (!m.dead) this._kill(m, false);
    for (const d of this._drops) {
      d.mesh.removeFromParent();
      d.glow.removeFromParent();
    }
    this._drops.length = 0;
    this._el.combo.className = "lb-combo";
    const ch = this._makeActor("chest", LootBootPX() * 2.2);
    ch.root.position.set(0.12, 0, 0.01);
    ch.root.scale.setScalar(1e-3);
    this._chest = ch;
  }
  _openChest() {
    if (!this._chest) return;
    const tier = TIERS[this._resultTier];
    this._chest.mat.map = this._chestOpenTex;
    this._chest.mat.needsUpdate = true;
    this._chest.flash = 0.2;
    this._sfx.chest(this._resultTier);
    this._shakeAmt = 6e-3 + this._resultTier * 1e-3;
    const bc = document.createElement("canvas");
    bc.width = 32;
    bc.height = 128;
    const g = bc.getContext("2d");
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 32, 128);
    const gx = g.getImageData(0, 0, 32, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 32; x++) {
        const k = Math.abs(x - 15.5) / 16;
        gx.data[(y * 32 + x) * 4 + 3] *= Math.pow(1 - k, 1.6);
      }
    g.putImageData(gx, 0, 0);
    const bt = this._track(new THREE2.CanvasTexture(bc));
    const beamH = 0.35 + this._resultTier * 0.045;
    const beam = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(0.11, beamH)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: bt,
          color: new THREE2.Color(tier.color),
          transparent: true,
          blending: THREE2.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    beam.geometry.translate(0, beamH / 2, 0);
    beam.position.set(0.12, 0.03, 0.012);
    beam.scale.y = 0.01;
    this._world.add(beam);
    this._billboards.push(beam);
    this._beam = beam;
    const rays = new THREE2.Group();
    rays.position.set(0.12, 0.06, 0.02);
    const n = 6 + this._resultTier;
    for (let i = 0; i < n; i++) {
      const r = new THREE2.Mesh(
        this._track(new THREE2.PlaneGeometry(0.012, 0.16 + this._resultTier * 0.01)),
        this._track(
          new THREE2.MeshBasicMaterial({
            map: this._glowTex,
            color: new THREE2.Color(tier.glow),
            transparent: true,
            opacity: 0.5,
            blending: THREE2.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
          })
        )
      );
      r.geometry.translate(0, 0.08, 0);
      r.rotation.z = i / n * Math.PI * 2;
      rays.add(r);
    }
    this._world.add(rays);
    this._billboards.push(rays);
    this._rays = rays;
    for (let i = 0; i < 26 + this._resultTier * 4; i++)
      this._spark(new THREE2.Vector3(0.12, 0.07, 0.01), tier.color, 0.5, 1.2);
  }
  _showResults() {
    this._phase = "results";
    const ti = this._resultTier;
    const tier = TIERS[ti];
    const s = this.score.value;
    const today = `lootbreak.best.${todayKey()}`;
    const prevBest = store("lootbreak.best");
    const prevToday = store(today);
    if (s > prevBest) store("lootbreak.best", s);
    if (s > prevToday) store(today, s);
    this._el.tier.textContent = tier.name.toUpperCase();
    this._el.tier.style.color = tier.color;
    this._el.tier.style.textShadow = `0 0 18px ${tier.glow}, 0 3px 0 #1a0d0f`;
    this._el.tier.classList.toggle("is-cosmic", ti === TIERS.length - 1);
    this._el.final.textContent = fmt(s);
    this._el.bestLine.textContent = s > prevBest && prevBest > 0 ? "New best!" : prevBest ? `Best ${fmt(Math.max(prevBest, s))}` : "";
    this._el.sKills.textContent = String(this._kills);
    this._el.sCombo.textContent = `x${this._bestCombo}`;
    this._el.sLoot.textContent = String(this._lootFound);
    const ul = this._el.badges;
    ul.innerHTML = "";
    const hints = { boss: "Kill the boss", iron: "Party above half", combo: "Reach x30" };
    for (const b of BADGES) {
      const li = document.createElement("li");
      if (b.id === "boss" && this._bossOutcome === "escaped") {
        li.className = "is-bad";
        li.innerHTML = `Boss escaped<b>-1 rarity</b>`;
      } else {
        const got = this._badges.includes(b.id);
        li.className = got ? "is-got" : "";
        li.innerHTML = `${b.name}<b>${got ? `+${fmt(b.pts)}` : hints[b.id]}</b>`;
      }
      ul.appendChild(li);
    }
    this._el.ladder.querySelectorAll("li").forEach((li) => {
      const i = Number(li.dataset.i);
      li.classList.toggle("is-got", i <= ti);
      li.classList.toggle("is-top", i === ti);
    });
    const nextTier = TIERS[ti + 1];
    this._el.ladderCap.textContent = nextTier ? `Rarity ${ti + 1} of ${TIERS.length} \xB7 Next: ${nextTier.name} at ${fmt(nextTier.at * this.tierScale.value)}` : `Rarity ${TIERS.length} of ${TIERS.length} \xB7 The top of the ladder`;
    this._syncText();
    this._rewards?.onResults(s, ti);
    this._show("results");
    this.onRoundEnd.emit(s, tier.name);
  }
  /* ══ simulation ═══════════════════════════════════════════════════════ */
  _spawn(kind) {
    const st = MONSTER_STATS[kind];
    const a = this._makeActor(kind, LootBootPX() * st.px);
    const x = _LootBreakGame.X_PORTAL - 0.02;
    a.root.position.set(x, 0, (this._rand() - 0.5) * 0.04);
    const barW = kind === "boss" ? 0.12 : 0.06;
    const bar = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(barW, 8e-3)),
      this._track(new THREE2.MeshBasicMaterial({ color: 1446429, toneMapped: false, depthTest: false }))
    );
    const fillGeo = this._track(new THREE2.PlaneGeometry(barW - 3e-3, 5e-3));
    fillGeo.translate((barW - 3e-3) / 2, 0, 0);
    const fill = new THREE2.Mesh(
      fillGeo,
      this._track(new THREE2.MeshBasicMaterial({ color: 16726843, toneMapped: false, depthTest: false }))
    );
    fill.position.set(-(barW - 3e-3) / 2, 0, 5e-4);
    bar.add(fill);
    bar.position.y = a.h + 0.012;
    bar.renderOrder = 10;
    fill.renderOrder = 11;
    bar.visible = false;
    a.body.add(bar);
    bar.position.set(0, a.h + 0.012, 1e-3);
    const m = {
      ...a,
      kind,
      hp: st.hp,
      maxHp: st.hp,
      x,
      stun: 0,
      dead: false,
      dying: 0,
      bob: this._rand() * 6,
      hpBar: bar,
      hpFill: fill
    };
    if (kind === "bat") m.body.position.y = 0.05;
    if (kind === "cursed") {
      const aura = new THREE2.Mesh(
        this._track(new THREE2.PlaneGeometry(a.h * 1.5, a.h * 1.2)),
        this._track(
          new THREE2.MeshBasicMaterial({
            map: this._glowTex,
            color: 10898943,
            transparent: true,
            opacity: 0.8,
            blending: THREE2.AdditiveBlending,
            depthWrite: false,
            toneMapped: false
          })
        )
      );
      aura.position.set(0, a.h * 0.35, -3e-3);
      a.body.add(aura);
      m.aura = aura;
      if (!this._coached.has("cursed")) this._coach("cursed", "Purple slimes are cursed. Don't tap them!", 3.5);
    }
    m.root.scale.setScalar(0.01);
    this._monsters.push(m);
    if (kind === "boss") {
      this._bossSpawned = true;
      this._banner("BOSS INCOMING", "is-boss");
      this._el.banner.style.color = "";
      this._sfx.boss();
      this._shakeAmt = 0.01;
      this.onBoss.emit();
      const weak = new THREE2.Mesh(
        this._track(new THREE2.PlaneGeometry(0.05, 0.05)),
        this._track(
          new THREE2.MeshBasicMaterial({ map: this._weakTex, transparent: true, alphaTest: 0.5, depthTest: false, toneMapped: false })
        )
      );
      weak.renderOrder = 12;
      weak.visible = false;
      m.body.add(weak);
      this._weak = { boss: m, mesh: weak, on: false, t: 1.2 };
    }
    return m;
  }
  _hitMonster(m, src, dmg = 1) {
    if (m.dead) return;
    const byPlayer = src === "player";
    if (byPlayer && m.shielded) {
      this._deflect(m);
      return;
    }
    if (byPlayer && m.kind === "cursed") {
      this._curse(m);
      return;
    }
    if (src === "hero" && m.kind === "boss") dmg *= TUNE.bossPartyDmg;
    if (byPlayer) {
      this._playerHits++;
      this._coachDone("tap");
      this._combo = this._comboT > 0 ? this._combo + 1 : 1;
      this._comboT = 1;
      this._bestCombo = Math.max(this._bestCombo, this._combo);
      dmg += this._combo >= 25 ? 2 : this._combo >= 10 ? 1 : 0;
      if (!((m.stunCd ?? 0) > 0)) {
        m.stun = Math.max(m.stun, m.kind === "boss" ? 0.12 : TUNE.hitStun);
        m.stunCd = TUNE.stunEvery;
      }
      m.x = Math.min(_LootBreakGame.X_PORTAL - TUNE.shieldZone - 5e-3, m.x + (m.kind === "boss" ? 2e-3 : 8e-3));
      this._addScore(10 * this._comboMult());
      this._chargeUlt(TUNE.ultPerHit * this._comboMult());
      this._sfx.hit(this._combo);
      this._renderCombo();
      const wp = new THREE2.Vector3();
      m.body.getWorldPosition(wp);
      wp.y += m.h * 0.7 * this._scaleRoot.scale.y * this._worldScale();
      if (!this._weakHitting) this._floater(dmg > 1 ? `-${dmg}!` : `-${dmg}`, wp, dmg > 1 ? "is-crit" : "");
      if (m.kind === "boss") this._shakeAmt = Math.max(this._shakeAmt, 3e-3);
    }
    m.hp -= dmg;
    m.flash = 0.09;
    m.hpBar.visible = true;
    m.hpFill.scale.x = Math.max(1e-3, m.hp / m.maxHp);
    for (let i = 0; i < (byPlayer ? 5 : 2); i++)
      this._spark(
        new THREE2.Vector3(m.x, m.h * 0.55 + (m.kind === "bat" ? 0.05 : 0), m.root.position.z + 0.01),
        byPlayer ? "#ffffff" : "#ffd34d",
        0.25,
        0.35
      );
    if (m.hp <= 0) this._kill(m, true);
  }
  /** A tap on a monster still inside the portal's shield: it bounces off and counts as a miss. */
  _deflect(m) {
    const wp = new THREE2.Vector3();
    m.body.getWorldPosition(wp);
    wp.y += m.h * 0.7 * this._scaleRoot.scale.y * this._worldScale();
    this._floater("BLOCKED", wp, "is-block");
    for (let i = 0; i < 4; i++)
      this._spark(new THREE2.Vector3(m.x, m.h * 0.55 + (m.kind === "bat" ? 0.05 : 0), m.root.position.z + 0.01), "#b48cff", 0.2, 0.3);
    this._sfx.tone(520, 0.05, "square", 0.03, -200);
    this._coach("shield", "Monsters are shielded inside the portal. Hit them out on the lane!", 3.5);
    this._miss();
  }
  _renderCombo() {
    const c = this._el.combo;
    if (this._combo < 3) {
      c.className = "lb-combo";
      return;
    }
    c.innerHTML = `<small>COMBO</small>x${this._combo}${this._comboMult() > 1 ? `<em>${this._comboMult()}\xD7 pts</em>` : ""}`;
    c.className = "lb-combo";
    void c.offsetWidth;
    c.className = `lb-combo is-on${this._combo >= 25 ? " is-hot" : ""}`;
  }
  _kill(m, scored) {
    if (m.dead) return;
    m.dead = true;
    m.dying = 0.35;
    m.hpBar.visible = false;
    if (this._weak?.boss === m) {
      this._weak.mesh.visible = false;
      this._weak = null;
    }
    if (!scored) return;
    if (m.kind === "boss") this._bossOutcome = "slain";
    this._kills++;
    const st = MONSTER_STATS[m.kind];
    const pts = st.score * this._comboMult();
    this._addScore(pts);
    this._sfx.kill();
    const wp = new THREE2.Vector3();
    m.body.getWorldPosition(wp);
    wp.y += m.h * this._scaleRoot.scale.y * this._worldScale();
    this._floater(`+${fmt(pts)}`, wp, "is-pts");
    for (let i = 0; i < 10; i++)
      this._spark(new THREE2.Vector3(m.x, m.h * 0.4, m.root.position.z), i % 2 ? "#ffc53d" : "#ffffff", 0.35, 0.6);
    this._sfx.coin();
    if (m.kind === "boss") {
      this._shakeAmt = 0.014;
      this._banner("BOSS DOWN!", "is-tier");
      this._el.banner.style.color = "#ffc53d";
      this._dropLoot(m.x, true);
      this._dropLoot(m.x - 0.05, true);
    } else if (m.kind !== "cursed" && this._rand() < 0.2) this._dropLoot(m.x, false);
  }
  /* ══ skill layer ══════════════════════════════════════════════════════ */
  /** The player tapped a cursed slime: it bursts, the combo breaks and the party is hurt. */
  _curse(m) {
    this._cursedHits++;
    this._combo = 0;
    this._comboT = 0;
    this._partyHp -= TUNE.curseHp;
    const c = this._el.combo;
    c.innerHTML = `<small>COMBO</small>CURSED`;
    c.className = "lb-combo";
    void c.offsetWidth;
    c.className = "lb-combo is-miss";
    const wp = new THREE2.Vector3();
    m.body.getWorldPosition(wp);
    wp.y += m.h * this._scaleRoot.scale.y * this._worldScale();
    this._floater(`CURSED -${TUNE.curseHp} HP`, wp, "is-curse");
    for (let i = 0; i < 16; i++)
      this._spark(new THREE2.Vector3(m.x, m.h * 0.4, m.root.position.z + 0.01), i % 2 ? "#a64dff" : "#ff3b3b", 0.4, 0.7);
    for (const h of this._heroes) h.flash = 0.1;
    this._sfx.curse();
    this._shakeAmt = Math.max(this._shakeAmt, 6e-3);
    this._flashUi("lb-hurt");
    this._kill(m, false);
  }
  /** A tap on the boss's weak spot: big damage, a stun, and ultimate charge. */
  _hitWeak() {
    const w = this._weak;
    if (!w || !w.on) return;
    const boss = w.boss;
    const wp = new THREE2.Vector3();
    w.mesh.getWorldPosition(wp);
    w.on = false;
    w.mesh.visible = false;
    w.t = TUNE.weakOff;
    this._weakHits++;
    this._coachDone("weak");
    this._weakHitting = true;
    this._hitMonster(boss, "player", TUNE.weakDmg);
    this._weakHitting = false;
    const total = TUNE.weakDmg + (this._combo >= 25 ? 2 : this._combo >= 10 ? 1 : 0);
    boss.stun = Math.max(boss.stun, 0.6);
    this._addScore(50 * this._comboMult());
    this._chargeUlt(TUNE.ultPerWeak);
    this._floater(`CRIT -${total}`, wp, "is-weak");
    this._sfx.crit();
    this._shakeAmt = Math.max(this._shakeAmt, 6e-3);
    const local = this._world.worldToLocal(wp.clone());
    for (let i = 0; i < 14; i++) this._spark(local, i % 2 ? "#ffe08a" : "#ff3b3b", 0.45, 0.6);
  }
  _chargeUlt(n) {
    if (this._phase !== "playing" || this._ult >= 100) return;
    this._ult = Math.min(100, this._ult + n);
    if (this._ult >= 100) {
      this._sfx.beep(true);
      this._coach("ult", "ULT READY! Pick a hero below.");
    }
    this._renderUlt();
  }
  _renderUlt() {
    const el = this._el.ults;
    if (!el) return;
    const ready = this._ult >= 100;
    el.style.setProperty("--ult", String(this._ult / 100));
    el.classList.toggle("is-ready", ready);
    this._el.ultPct.textContent = ready ? "READY" : `${Math.floor(this._ult)}%`;
    this._el.ultBtns.querySelectorAll("button").forEach((b) => b.disabled = !ready);
  }
  _castMeteor() {
    const live = this._monsters.filter((m) => !m.dead);
    const x = live.length ? clamp(live.reduce((a, m) => a + m.x, 0) / live.length, -0.02, 0.4) : 0.15;
    const glow = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(0.16, 0.16)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: this._glowTex,
          color: 16743214,
          transparent: true,
          blending: THREE2.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    const mesh = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(0.045, 0.045)),
      this._track(new THREE2.MeshBasicMaterial({ color: 16769162, toneMapped: false }))
    );
    mesh.rotation.z = Math.PI / 4;
    glow.position.set(x, 0.6, 0.02);
    mesh.position.set(x, 0.6, 0.021);
    this._world.add(glow, mesh);
    this._billboards.push(glow);
    this._meteor = { mesh, glow, t: 0.55, x };
  }
  _clearMeteor() {
    if (!this._meteor) return;
    const { mesh, glow } = this._meteor;
    mesh.removeFromParent();
    glow.removeFromParent();
    const i = this._billboards.indexOf(glow);
    if (i >= 0) this._billboards.splice(i, 1);
    this._meteor = null;
  }
  /** Ultimates in flight, the boss's weak spot. Runs while a round is playing. */
  _tickSkill(dt) {
    const now = performance.now() * 1e-3;
    if (this._shieldT > 0) {
      this._shieldT -= dt;
      if (!this._shieldMesh) {
        this._shieldMesh = new THREE2.Mesh(
          this._track(new THREE2.PlaneGeometry(0.42, 0.2)),
          this._track(
            new THREE2.MeshBasicMaterial({
              map: this._glowTex,
              color: 6539007,
              transparent: true,
              blending: THREE2.AdditiveBlending,
              depthWrite: false,
              toneMapped: false
            })
          )
        );
        this._shieldMesh.position.set(_LootBreakGame.X_FRONT - 0.13, 0.07, 0.03);
        this._world.add(this._shieldMesh);
        this._billboards.push(this._shieldMesh);
      }
      const fade = clamp(this._shieldT, 0, 1);
      this._shieldMesh.material.opacity = (0.55 + Math.sin(now * 8) * 0.15) * fade;
    }
    if (this._shieldMesh) this._shieldMesh.visible = this._shieldT > 0;
    if (this._volleyLeft > 0) {
      this._volleyT -= dt;
      if (this._volleyT <= 0) {
        const targets = this._monsters.filter((m) => !m.dead && m.kind !== "cursed");
        if (targets.length) {
          const boss = targets.find((m) => m.kind === "boss");
          const to = boss && this._rand() < 0.6 ? boss : targets[Math.floor(this._rand() * targets.length)];
          const ranger = this._heroes.find((h) => h.id === "ranger");
          ranger.lunge = 0.6;
          this._shoot(ranger, to, 2, "#ffe28a", false, "ult");
          this._sfx.tone(900, 0.04, "square", 0.03);
          this._volleyLeft--;
        }
        this._volleyT = 0.09;
      }
    }
    if (this._meteor) {
      const me = this._meteor;
      me.t -= dt;
      const k = clamp(1 - me.t / 0.55, 0, 1);
      const y = 0.6 - k * k * 0.56;
      me.mesh.position.y = y;
      me.glow.position.y = y;
      me.mesh.rotation.z += dt * 12;
      if (me.t <= 0) {
        const at = new THREE2.Vector3(me.x, 0.03, 0.02);
        this._clearMeteor();
        this._sfx.boom();
        this._shakeAmt = 0.016;
        for (let i = 0; i < 40; i++) this._spark(at, i % 3 ? "#ff7b2e" : "#ffe08a", 0.7, 0.9);
        for (const m of this._monsters.slice()) {
          if (m.dead) continue;
          if (m.kind === "cursed") this._kill(m, true);
          else this._hitMonster(m, "ult", m.kind === "boss" ? 10 : 8);
        }
      }
    }
    const w = this._weak;
    if (w && !w.boss.dead && w.boss.root.scale.x >= 1) {
      w.t -= dt;
      if (w.on) {
        w.mesh.scale.setScalar(1 + Math.sin(now * 14) * 0.14);
        if (w.t <= 0) {
          w.on = false;
          w.mesh.visible = false;
          w.t = TUNE.weakOff * (0.8 + this._rand() * 0.5);
        }
      } else if (w.t <= 0) {
        const size = w.boss.h;
        w.on = true;
        w.mesh.visible = true;
        w.t = TUNE.weakOn * (1 - this.difficulty.value * 0.35);
        w.mesh.position.set((this._rand() - 0.5) * size * 0.55, size * (0.3 + this._rand() * 0.5), 4e-3);
        this._coach("weak", "Tap the glowing weak spot!", 5);
      }
    }
  }
  /* coach tips: one line above the ultimate buttons, each shown once a session */
  _coach(key, text, secs = 0) {
    if (this._coached.has(key)) return;
    this._coached.add(key);
    this._coachKey = key;
    this._coachT = secs;
    const c = this._el.coach;
    c.textContent = text;
    c.className = "lb-coach";
    void c.offsetWidth;
    c.className = "lb-coach is-on";
  }
  _coachDone(key) {
    this._coached.add(key);
    if (this._coachKey === key) this._hideCoach();
  }
  _hideCoach() {
    this._coachKey = "";
    this._coachT = 0;
    if (this._el.coach) this._el.coach.className = "lb-coach";
  }
  _flashUi(cls) {
    this._ui.classList.remove(cls);
    void this._ui.offsetWidth;
    this._ui.classList.add(cls);
    setTimeout(() => this._ui.classList.remove(cls), 450);
  }
  _pickLoot(boss) {
    const pool = boss ? LOOT.filter((l) => l.tier >= 2) : LOOT;
    const total = pool.reduce((a, l) => a + l.weight, 0);
    let r = this._rand() * total;
    for (const l of pool) if ((r -= l.weight) <= 0) return l;
    return pool[0];
  }
  _dropLoot(x, boss) {
    const def = this._pickLoot(boss);
    const s = this._sprite(def.icon);
    const size = LootBootPX() * 1.5;
    const geo = this._track(new THREE2.PlaneGeometry(s.w * size, s.h * size));
    const mesh = new THREE2.Mesh(
      geo,
      this._track(new THREE2.MeshBasicMaterial({ map: s.tex, transparent: true, alphaTest: 0.5, toneMapped: false }))
    );
    const glow = new THREE2.Mesh(
      this._track(new THREE2.PlaneGeometry(0.09, 0.09)),
      this._track(
        new THREE2.MeshBasicMaterial({
          map: this._glowTex,
          color: new THREE2.Color(TIERS[def.tier].color),
          transparent: true,
          opacity: 0.85,
          blending: THREE2.AdditiveBlending,
          depthWrite: false,
          toneMapped: false
        })
      )
    );
    const xx = clamp(x, _LootBreakGame.X_ENGAGE + 0.02, _LootBreakGame.X_PORTAL - 0.08);
    mesh.position.set(xx, 0.05, 0.03);
    glow.position.set(xx, 0.05, 0.028);
    this._world.add(glow, mesh);
    this._billboards.push(mesh, glow);
    this._drops.push({ mesh, glow, def, x: xx, life: boss ? 4 : 3, age: 0 });
  }
  _collect(d) {
    const i = this._drops.indexOf(d);
    if (i < 0) return;
    this._drops.splice(i, 1);
    d.mesh.removeFromParent();
    d.glow.removeFromParent();
    this._lootFound++;
    const pts = (300 + d.def.tier * 250) * this._comboMult();
    this._addScore(pts);
    this._toast(d.def);
    this._sfx.loot();
    const wp = new THREE2.Vector3();
    d.mesh.getWorldPosition(wp);
    this._floater(`+${fmt(pts)}`, wp, "is-loot");
    for (let k = 0; k < 12; k++) this._spark(d.mesh.position.clone(), TIERS[d.def.tier].color, 0.4, 0.7);
  }
  _spark(at, color, speed, life) {
    if (this._parts.length > 140) return;
    const m = new THREE2.Mesh(
      _LootBreakGame._sparkGeo ?? (_LootBreakGame._sparkGeo = new THREE2.PlaneGeometry(8e-3, 8e-3)),
      this._track(new THREE2.MeshBasicMaterial({ color: new THREE2.Color(color), toneMapped: false }))
    );
    m.position.copy(at);
    this._world.add(m);
    const a = this._rand() * Math.PI * 2;
    const vel = new THREE2.Vector3(Math.cos(a) * speed * 0.4, (0.3 + this._rand()) * speed, Math.sin(a) * speed * 0.2);
    this._parts.push({ mesh: m, vel, life: 0, max: life * (0.6 + this._rand() * 0.6) });
  }
  _shoot(from, to, dmg, color, splash, src = "hero") {
    const m = new THREE2.Mesh(
      _LootBreakGame._shotGeo ?? (_LootBreakGame._shotGeo = new THREE2.PlaneGeometry(0.018, 8e-3)),
      this._track(
        new THREE2.MeshBasicMaterial({ color: new THREE2.Color(color), toneMapped: false, transparent: true })
      )
    );
    const p = new THREE2.Vector3(from.x + 0.03, from.h * 0.55, from.root.position.z + 0.01);
    m.position.copy(p);
    this._world.add(m);
    const dist = Math.abs(to.x - from.x);
    this._shots.push({ mesh: m, from: p, to, t: 0, dur: 0.12 + dist * 0.6, dmg, splash, src });
  }
  /* ══ frame ════════════════════════════════════════════════════════════ */
  _tick(dt) {
    const now = performance.now() * 1e-3;
    if (this._portalRings[0]) {
      this._portalRings[0].rotation.z -= dt * 1.2;
      this._portalRings[1].rotation.z += dt * 2.1;
    }
    for (const [i, h] of this._heroes.entries()) {
      const marching = this._phase === "playing" || this._phase === "countdown" || this._phase === "idle";
      const bob = marching ? Math.abs(Math.sin(now * 7 + i * 1.3)) * 6e-3 : 0;
      h.lunge = Math.max(0, h.lunge - dt * 4);
      const l = Math.sin(h.lunge * Math.PI) * 0.025;
      h.root.position.x = h.x + l;
      h.body.position.y = bob;
      h.body.scale.set(1 + (marching ? 0.03 * Math.sin(now * 14 + i) : 0), 1, 1);
      this._applyFlash(h, dt);
    }
    if (this._phase === "playing" || this._phase === "countdown" || this._phase === "idle") {
      this._groundTex.offset.x += dt * 0.08;
    }
    this._placePad.visible = this._phase === "placing";
    if (this._placePad.visible) {
      const step = Math.floor(now * RETICLE.fps);
      if (step !== this._padStep) {
        this._padStep = step;
        drawReticle(this._padCanvas, step);
        this._padTex.needsUpdate = true;
      }
    }
    switch (this._phase) {
      case "countdown":
        this._tickCountdown(dt);
        break;
      case "playing":
        this._tickPlay(dt);
        break;
      case "ending":
        this._tickEnding(dt);
        break;
      case "results":
        this._tickResults(dt, now);
        break;
    }
    this._tickMonsters(dt, now);
    this._tickFx(dt);
    this._billboard();
    this._tickUiTimers(dt);
  }
  _tickCountdown(dt) {
    this._phaseT += dt;
    const n = 3 - Math.floor(this._phaseT / 0.75);
    if (n !== this._countdownShown) {
      this._countdownShown = n;
      const el = this._el.count;
      el.textContent = n > 0 ? String(n) : "GO!";
      el.className = "lb-count";
      void el.offsetWidth;
      el.className = `lb-count is-on${n <= 0 ? " is-go" : ""}`;
      this._sfx.beep(n <= 0);
    }
    if (this._phaseT >= 3 * 0.75 + 0.35) {
      this._phase = "playing";
      this._el.count.className = "lb-count";
      this._rewards?.onRoundStart();
      this.onRoundStart.emit();
    }
  }
  _tickPlay(dt) {
    const len = this._roundLen();
    this._t += dt;
    const f = clamp(this._t / len, 0, 1);
    const mins = Math.min(59, Math.floor(f * 60));
    const clock = `12:${String(mins).padStart(2, "0")}`;
    if (this._el.clock.textContent !== clock) {
      this._el.clock.textContent = clock;
      this._el.clock.classList.toggle("is-late", mins >= 55);
      this._drawTaskbar(clock);
      if (mins >= 56) this._sfx.beep(false);
    }
    if (!this._bossSpawned && f >= this.bossAt.value) this._spawn("boss");
    this._spawnT -= dt;
    const d = this.difficulty.value;
    const bossAlive = this._monsters.some((m) => m.kind === "boss" && !m.dead);
    const alive = this._monsters.filter((m) => !m.dead).length;
    if (this._spawnT <= 0 && alive < 9) {
      const r = this._rand();
      let kind = f < 0.15 ? "slime" : r < 0.4 ? "slime" : r < 0.7 ? "brute" : "bat";
      if (f >= 0.2 && this._rand() < TUNE.cursedChance) kind = "cursed";
      this._spawn(kind);
      const base = 1.75 - f * 0.9;
      const gap = base * (1.25 - d * 0.5) * (bossAlive ? 1.6 : 1) * (0.75 + this._rand() * 0.5);
      if (this._waveLeft > 0) {
        this._waveLeft--;
        this._spawnT = this._waveLeft > 0 ? TUNE.waveGap : gap * TUNE.waveRest;
      } else {
        if (f >= 0.1 && !bossAlive && this._rand() < TUNE.waveChance) this._waveLeft = this._rand() < 0.6 ? 1 : 2;
        this._spawnT = this._waveLeft > 0 ? TUNE.waveGap : gap;
      }
    }
    if (this._jamT > 0) {
      this._jamT -= dt;
      if (this._jamT <= 0) this._el.cursor.classList.remove("is-jam");
    }
    if (this._comboT > 0) {
      this._comboT -= dt;
      if (this._comboT <= 0) {
        this._combo = 0;
        this._renderCombo();
      }
    }
    const front = this._frontMonster();
    for (const h of this._heroes) {
      h.cd -= dt;
      if (h.cd > 0) continue;
      if (h.id === "priest") {
        h.cd = TUNE.heroCd.priest;
        if (this._partyHp < 100) {
          this._partyHp = Math.min(100, this._partyHp + TUNE.priestHeal);
          h.flash = 0.12;
          for (const k of this._heroes)
            this._spark(new THREE2.Vector3(k.x, k.h * 0.8, 0.02), "#9dffb0", 0.18, 0.5);
        } else if (front) this._shoot(h, front, 1, "#fff3a6", false);
        continue;
      }
      if (!front) {
        h.cd = 0.2;
        continue;
      }
      if (h.id === "knight") {
        if (front.x - h.x < 0.12) {
          h.cd = TUNE.heroCd.knight;
          h.lunge = 1;
          this._hitMonster(front, "hero", 1);
        } else h.cd = 0.15;
      } else if (h.id === "ranger") {
        h.cd = TUNE.heroCd.ranger;
        this._shoot(h, front, 1, "#e9d38a", false);
      } else {
        h.cd = TUNE.heroCd.sorcerer;
        this._shoot(h, front, 2, "#ff8a3d", true);
      }
    }
    let dps = 0;
    for (const m of this._monsters)
      if (!m.dead && m.stun <= 0 && m.x <= _LootBreakGame.X_ENGAGE + 5e-3) dps += MONSTER_STATS[m.kind].dps;
    if (dps > 0 && this._shieldT > 0) {
      this._hurtT -= dt;
      if (this._hurtT <= 0) {
        this._hurtT = 0.3;
        this._spark(new THREE2.Vector3(_LootBreakGame.X_ENGAGE - 0.02, 0.05, 0.03), "#9fd3ff", 0.3, 0.4);
      }
    } else if (dps > 0) {
      this._partyHp -= dps * dt * (0.8 + d * 0.4) * (1 + f * TUNE.pressureRamp);
      this._hurtT -= dt;
      if (this._hurtT <= 0) {
        this._hurtT = 0.45;
        this._heroes[0].flash = 0.08;
        this._sfx.hurt();
      }
    }
    this._tickSkill(dt);
    this._minHp = Math.min(this._minHp, this._partyHp);
    const danger = this._partyHp < 35;
    this._ui.classList.toggle("lb-danger", danger);
    if (danger) this._coach("danger", this._ult >= 100 ? "Party in danger! Heal or shield them." : "Party in danger! Hit the front monsters.", 3);
    if (this._t > 2.5 && this._playerHits === 0) this._coach("tap", "Tap the monsters to help your party!");
    this._renderHud();
    if (this._partyHp <= 0) {
      this._partyHp = 0;
      this._finish(true);
    } else if (this._t >= len) this._finish(false);
  }
  _frontMonster() {
    let best = null;
    for (const m of this._monsters) if (!m.dead && (!best || m.x < best.x)) best = m;
    return best;
  }
  _tickMonsters(dt, now) {
    const live = this._monsters.filter((m) => !m.dead).sort((a, b) => a.x - b.x);
    let limit = _LootBreakGame.X_ENGAGE;
    const shieldEdge = _LootBreakGame.X_PORTAL - TUNE.shieldZone;
    const step = Math.floor(now * 8);
    for (const m of live) {
      const st = MONSTER_STATS[m.kind];
      if (m.root.scale.x < 1) m.root.scale.setScalar(Math.min(1, m.root.scale.x + dt * 5));
      const shielded = m.kind !== "boss" && m.x > shieldEdge;
      if ((m.stunCd ?? 0) > 0) m.stunCd = (m.stunCd ?? 0) - dt;
      if (m.stun > 0) m.stun -= dt;
      else if (this._phase === "playing") {
        const v = st.speed * (shielded ? TUNE.portalBurst : 1);
        m.x = Math.max(m.kind === "bat" ? _LootBreakGame.X_ENGAGE : limit, m.x - v * dt);
      }
      const queued = m.kind !== "bat" && m.x <= limit + 2e-3;
      if (queued) limit = m.x + (m.kind === "boss" ? 0.1 : 0.055);
      if (shielded !== !!m.shielded) {
        m.shielded = shielded;
        if (!shielded) {
          m.mat.color.setHex(16777215);
          m.mat.map = m.tex;
          m.mat.needsUpdate = true;
        }
      }
      if (shielded && m.flash <= 0) {
        const ghost = step % 2 === 0;
        const map = ghost ? m.white : m.tex;
        if (m.mat.map !== map) {
          m.mat.map = map;
          m.mat.needsUpdate = true;
        }
        m.mat.color.setHex(ghost ? 10976255 : 16777215);
      }
      m.root.position.x = m.x;
      const atFront = m.x <= _LootBreakGame.X_ENGAGE + 5e-3;
      const wob = m.stun > 0 ? Math.sin(now * 60) * 4e-3 : 0;
      if (m.kind === "bat") m.body.position.y = 0.05 + Math.sin(now * 6 + m.bob) * 0.012;
      else if (m.kind === "slime" || m.kind === "cursed") m.body.scale.set(1 + Math.sin(now * 8 + m.bob) * 0.08, 1 - Math.sin(now * 8 + m.bob) * 0.08, 1);
      else m.body.position.y = Math.abs(Math.sin(now * 6 + m.bob)) * 4e-3;
      m.body.position.x = wob + (atFront ? Math.sin(now * 9 + m.bob) * 6e-3 : 0);
      if (m.aura) m.aura.material.opacity = 0.55 + Math.sin(now * 6 + m.bob) * 0.3;
      this._applyFlash(m, dt);
    }
    for (let i = this._monsters.length - 1; i >= 0; i--) {
      const m = this._monsters[i];
      if (!m.dead) continue;
      m.dying -= dt;
      const k = clamp(m.dying / 0.35, 0, 1);
      m.root.scale.setScalar(0.2 + k * 0.9);
      m.body.position.y += dt * 0.15;
      m.mat.map = m.white;
      m.mat.opacity = k;
      if (m.dying <= 0) {
        this._removeActor(m);
        this._monsters.splice(i, 1);
      }
    }
  }
  _applyFlash(a, dt) {
    if (a.flash > 0) {
      a.flash -= dt;
      if (a.mat.map !== a.white) {
        a.mat.map = a.white;
        a.mat.needsUpdate = true;
      }
    } else if (a.mat.map === a.white && !a.dead && !a.shielded) {
      a.mat.map = a.tex;
      a.mat.needsUpdate = true;
    }
  }
  _tickFx(dt) {
    for (let i = this._shots.length - 1; i >= 0; i--) {
      const s = this._shots[i];
      s.t += dt;
      const k = clamp(s.t / s.dur, 0, 1);
      const tx = s.to.x;
      const ty = s.to.h * 0.5 + (s.to.kind === "bat" ? 0.05 : 0);
      s.mesh.position.set(
        s.from.x + (tx - s.from.x) * k,
        s.from.y + (ty - s.from.y) * k + Math.sin(k * Math.PI) * 0.03,
        s.from.z
      );
      if (k >= 1) {
        s.mesh.removeFromParent();
        this._shots.splice(i, 1);
        if (!s.to.dead) this._hitMonster(s.to, s.src, s.dmg);
        if (s.splash) {
          const next = this._monsters.find((m) => !m.dead && m !== s.to && Math.abs(m.x - s.to.x) < 0.08);
          if (next) this._hitMonster(next, s.src, 1);
        }
      }
    }
    for (let i = this._parts.length - 1; i >= 0; i--) {
      const p = this._parts[i];
      p.life += dt;
      p.vel.y -= dt * 1.2;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 2e-3) {
        p.mesh.position.y = 2e-3;
        p.vel.multiplyScalar(0.4);
      }
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(Math.max(0.01, k));
      if (p.life >= p.max) {
        p.mesh.removeFromParent();
        p.mesh.material.dispose();
        this._parts.splice(i, 1);
      }
    }
    for (let i = this._drops.length - 1; i >= 0; i--) {
      const d = this._drops[i];
      d.age += dt;
      const pop = Math.min(1, d.age * 5);
      d.mesh.position.y = 0.035 + Math.sin(d.age * 5) * 8e-3 + (1 - pop) * 0.04;
      d.glow.position.y = d.mesh.position.y;
      d.mesh.scale.setScalar(0.4 + pop * 0.6);
      const left = d.life - d.age;
      d.mesh.visible = left > 1 || Math.floor(d.age * 10) % 2 === 0;
      d.glow.scale.setScalar(1 + Math.sin(d.age * 8) * 0.12);
      if (left <= 0) {
        d.mesh.removeFromParent();
        d.glow.removeFromParent();
        this._drops.splice(i, 1);
      }
    }
    if (this._shakeAmt > 0) {
      this._shakeAmt = Math.max(0, this._shakeAmt - dt * 0.03);
      this._shake.position.set(
        (this._rand() - 0.5) * this._shakeAmt,
        (this._rand() - 0.5) * this._shakeAmt * 0.6,
        0
      );
    } else this._shake.position.set(0, 0, 0);
    const rect = this._ui.getBoundingClientRect();
    for (let i = this._floaters.length - 1; i >= 0; i--) {
      const f = this._floaters[i];
      f.life += dt;
      const s = this._toScreen(f.pos, rect.width, rect.height);
      const k = f.life / f.max;
      const half = f.el.offsetWidth / 2 + 6;
      const x = rect.width > half * 2 ? clamp(s.x, half, rect.width - half) : s.x;
      f.el.style.transform = `translate(${x}px, ${s.y - k * 46}px) translate(-50%,-50%) scale(${k < 0.15 ? 0.6 + k * 3 : 1})`;
      f.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
      if (f.life >= f.max) {
        f.el.remove();
        this._floaters.splice(i, 1);
      }
    }
  }
  _tickEnding(dt) {
    this._phaseT += dt;
    const ch = this._chest;
    if (!ch) return;
    const t = this._phaseT;
    if (t < 0.45) {
      const k = t / 0.45;
      const s = 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k);
      ch.root.scale.setScalar(Math.max(1e-3, k) * s);
    } else if (t < 1.6) {
      ch.root.scale.setScalar(1);
      const k = (t - 0.45) / 1.15;
      ch.body.rotation.z = Math.sin(t * 40) * 0.05 * k;
      if (Math.floor(t * 8) !== Math.floor((t - dt) * 8)) this._sfx.tone(300 + k * 300, 0.04, "square", 0.04);
    } else if (!this._beam) {
      ch.body.rotation.z = 0;
      this._openChest();
    } else {
      const k = clamp((t - 1.6) / 0.4, 0, 1);
      this._beam.scale.y = k;
      if (t > 2.4 && this._phase === "ending") this._showResults();
    }
  }
  _tickResults(dt, now) {
    if (this._rays) this._rays.children.forEach((r, i) => r.rotation.z += dt * (0.6 + i % 2 * 0.3));
    if (this._beam) {
      const m = this._beam.material;
      m.opacity = 0.75 + Math.sin(now * 3) * 0.2;
      if (this._resultTier === TIERS.length - 1) m.color.setHSL(now * 0.15 % 1, 0.8, 0.7);
    }
    if (this._chest) this._chest.body.position.y = Math.sin(now * 2) * 4e-3;
    if (Math.random() < dt * (4 + this._resultTier))
      this._spark(new THREE2.Vector3(0.12 + (Math.random() - 0.5) * 0.05, 0.06, 0.02), TIERS[this._resultTier].glow, 0.35, 1);
  }
  _tickUiTimers(dt) {
    if (this._bannerT > 0) {
      this._bannerT -= dt;
      if (this._bannerT <= 0) this._el.banner.className = "lb-banner";
    }
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this._el.toast.classList.remove("is-on");
    }
    if (this._coachT > 0) {
      this._coachT -= dt;
      if (this._coachT <= 0) this._hideCoach();
    }
    if (this._cursorT > 0) {
      this._cursorT -= dt;
      if (this._cursorT <= 0) this._el.cursor.classList.remove("is-click");
    }
  }
  _billboard() {
    if (!this.faceCamera.value) return;
    const cam = this._cam.value;
    if (!cam) return;
    this._world.updateWorldMatrix(true, false);
    cam.getWorldPosition(this._camLocal);
    this._inv.copy(this._world.matrixWorld).invert();
    this._camLocal.applyMatrix4(this._inv);
    for (const o of this._billboards) {
      const p = o.parent === this._world ? o.position : o.parent ? o.parent.position : o.position;
      const yaw = Math.atan2(this._camLocal.x - p.x, this._camLocal.z - p.z);
      o.rotation.y = clamp(yaw, -1.2, 1.2);
    }
  }
  /* ══ placement ════════════════════════════════════════════════════════ */
  /** Every first round waits for Place, whether or not a tracker was found (like EVADE). */
  _needsPlacement() {
    return this.placementEnabled.value && !this._placed;
  }
  /**
   * Find the tracker that places the lane: the picked node, else the nearest
   * Instant World Tracker or User Placement Anchor Group above this
   * component, else the first one anywhere in the scene. Duck-typed on
   * placementMode, so the game doesn't depend on the Zappar package to build.
   */
  _bindPlacement() {
    for (const u of this._pgUnsub) u();
    this._pgUnsub = [];
    const prev = this._pg;
    this._pg = null;
    if (prev) {
      if (prev.showPlaceButton) prev.showPlaceButton.value = true;
      if (prev.showRestartPlacementButton) prev.showRestartPlacementButton.value = true;
    }
    if (!this.placementEnabled.value) {
      this._syncPlacementUi();
      return;
    }
    let found = null;
    const id = this.placementGroup.value;
    if (id) {
      const c = this.getZComponentInstance().resolveNodeID(id);
      if (isPlacementGroup(c)) found = c;
    }
    let top = this;
    if (!found) {
      for (let p = this.parent; p; p = p.parent) {
        top = p;
        if (isPlacementGroup(p)) {
          found = p;
          break;
        }
      }
    }
    if (!found) found = findPlacementGroup(top);
    if (!found) {
      console.warn(
        "[LootBreakGame] No Instant World Tracker or placement group found. Place still gates the round; use placeTimeline / resetTimeline to move the content, or set placementGroup."
      );
      this._syncPlacementUi();
      return;
    }
    this._pg = found;
    if (found.showPlaceButton) found.showPlaceButton.value = false;
    if (found.showRestartPlacementButton) found.showRestartPlacementButton.value = false;
    this._placed = false;
    const onMode = (placing) => {
      if (this._pgWriting) return;
      if (placing && this._placed) this._resetPlacement(false);
      else if (!placing && this._phase === "placing") this._place();
    };
    found.placementMode.addListener(onMode);
    this._pgUnsub.push(() => found.placementMode.removeListener(onMode));
    if (this._phase === "placing" || this._phase === "idle") this._setPlacementMode(true);
    this._syncPlacementUi();
  }
  _setPlacementMode(on) {
    if (!this._pg) return;
    this._pgWriting = true;
    try {
      this._pg.placementMode.value = on;
    } finally {
      this._pgWriting = false;
    }
  }
  _enterPlacing() {
    this._phase = "placing";
    this._phaseT = 0;
    this._setPlacementMode(true);
    this._show("place");
  }
  _place() {
    if (this._phase !== "placing") return;
    this._setPlacementMode(false);
    this._placed = true;
    this._sfx.coin();
    this._playClip(this.placeTimeline.value);
    this.onPlace.emit();
    this.startRound();
  }
  /**
   * Back to placing. A round in progress is dropped (no score, no chest):
   * the lane is moving under the player, so the round can't fairly continue.
   */
  _resetPlacement(fromButton) {
    if (!this.placementEnabled.value) return;
    if (this._phase === "placing") return;
    if (fromButton && this._pg) {
      const restart = this._pg._restartPlacement;
      this._pgWriting = true;
      try {
        if (typeof restart === "function") restart.call(this._pg);
        else this._pg.placementMode.value = true;
      } finally {
        this._pgWriting = false;
      }
    }
    this._placed = false;
    this._playClip(this.resetTimeline.value);
    this.onResetPlacement.emit();
    const wasModal = this._phase === "idle";
    this._reset();
    if (wasModal && !this._ui.querySelector('[data-screen="intro"]').hidden) {
      this._phase = "idle";
      return;
    }
    this._enterPlacing();
  }
  _playClip(id) {
    if (!id) return;
    try {
      const clip = this.getZComponentInstance().animation?.layerClipByID?.get(id);
      if (!clip) return;
      clip.seek(0, { dontActivateLayer: true });
      clip.play();
    } catch {
    }
  }
  _syncPlacementUi() {
    const el = this._el;
    if (!el.placeBtn) return;
    el.placeHint.textContent = this.placeHint.value;
    el.placeLbl.textContent = this.placeButtonLabel.value;
    const lbl = this.replaceButtonLabel.value.trim();
    el.replaceLbl.textContent = lbl;
    el.replaceLbl.hidden = !lbl;
    el.replace.setAttribute("aria-label", lbl || "Re-place the game");
    const hud = this._ui.querySelector('[data-screen="hud"]');
    el.replace.hidden = !(this.placementEnabled.value && hud && !hud.hidden && this._phase !== "results");
  }
  /* ══ cleanup ══════════════════════════════════════════════════════════ */
  dispose() {
    for (const u of this._pgUnsub) u();
    this._pgUnsub = [];
    window.removeEventListener("pointerdown", this._onPointer, { capture: true });
    window.removeEventListener("keydown", this._onKey);
    for (const t of _LootBreakGame.UNLOCK_EVENTS)
      window.removeEventListener(t, this._onUnlock, { capture: true });
    this._ui.remove();
    for (const d of this._disposables) d.dispose();
    _LootBreakGame._sparkGeo?.dispose();
    _LootBreakGame._sparkGeo = null;
    _LootBreakGame._shotGeo?.dispose();
    _LootBreakGame._shotGeo = null;
    const w = window;
    if (w.__lootBreak === this) delete w.__lootBreak;
    return super.dispose();
  }
};
/** Events iOS counts as a user gesture for starting audio. */
__publicField(_LootBreakGame, "UNLOCK_EVENTS", ["touchend", "pointerup", "click", "keydown"]);
/* ══ build: lane, portal, heroes ══════════════════════════════════════ */
__publicField(_LootBreakGame, "LANE", { len: 1, depth: 0.15, height: 0.045 });
__publicField(_LootBreakGame, "PX", 58e-4);
// world units per sprite pixel
__publicField(_LootBreakGame, "X_FRONT", -0.13);
// knight's spot
__publicField(_LootBreakGame, "X_ENGAGE", -0.06);
// where monsters stop to fight
__publicField(_LootBreakGame, "X_PORTAL", 0.47);
__publicField(_LootBreakGame, "_sparkGeo", null);
__publicField(_LootBreakGame, "_shotGeo", null);
var LootBreakGame = _LootBreakGame;
function isPlacementGroup(x) {
  const g = x;
  if (!g || typeof g !== "object" || !g.placementMode) return false;
  const pm = g.placementMode;
  return typeof pm.addListener === "function" && typeof pm.value === "boolean";
}
function findPlacementGroup(root) {
  const seen = /* @__PURE__ */ new Set();
  const stack = [root];
  while (stack.length) {
    const c = stack.pop();
    if (!c || typeof c !== "object" || seen.has(c)) continue;
    seen.add(c);
    if (c !== root && isPlacementGroup(c)) return c;
    if (Array.isArray(c.children)) for (let i = c.children.length - 1; i >= 0; i--) stack.push(c.children[i]);
  }
  return null;
}
function LootBootPX() {
  return 58e-4;
}
var RW_LS = { email: "lootbreak.email", codes: "lootbreak.codes", steps: "lootbreak.questSteps" };
function lsGet(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || "null");
  } catch {
    return null;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
  }
}
var esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var HANDLE_OK = /^@?[A-Za-z0-9._]{1,30}$/;
var DISCORD_OK = /^@?(?:[A-Za-z0-9._]{2,32}|[^@#:\s][^@#:]{0,30}[^@#:\s]#\d{4})$/;
function rwPlatform(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
    if (h === "discord.gg" || h === "discord.com" || h.endsWith(".discord.com")) return "discord";
  } catch {
  }
  return "other";
}
var RW_STEP = {
  instagram: (l) => `Follow <b>${l}</b> on Instagram`,
  discord: (l) => `Join <b>${l}</b> on Discord`,
  other: (l) => `Follow <b>${l}</b>`
};
var isLive = (c) => !!c && c.status === "active" && Date.parse(c.expiresAt) > Date.now();
var dateLabel = (iso) => new Date(iso).toLocaleDateString(void 0, { day: "numeric", month: "short", year: "numeric" });
function rwRewardFor(rules, tier) {
  let best = null;
  for (const r of rules) if (tier >= r.tier && (!best || r.percent > best.percent)) best = r;
  return best;
}
function rwRawTier(score) {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].at) t = i;
  return t;
}
var LootRewards = class {
  constructor(host) {
    this.host = host;
    __publicField(this, "cfg", null);
    __publicField(this, "_ticket", null);
    __publicField(this, "_last", { score: 0, tier: 0 });
    __publicField(this, "_offer", null);
    __publicField(this, "_msg", "");
    __publicField(this, "_busy", false);
    __publicField(this, "_loadT", null);
    __publicField(this, "_card");
    __publicField(this, "_body");
    this._card = document.createElement("div");
    this._card.className = "lb-card lb-rw";
    this._card.dataset.screen = "reward";
    this._card.hidden = true;
    this._card.innerHTML = `<div class="lb-frame" role="dialog" aria-modal="true" aria-label="Rewards"><div data-rw="body"></div></div>`;
    this._body = this._card.querySelector("[data-rw=body]");
    host.ui.insertBefore(this._card, host.ui.querySelector(".lb-cursor"));
    this._card.addEventListener("click", (e) => this._onClick(e));
    this._card.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      void (f.dataset.form === "quest" ? this._claimQuest(f) : this._claimScore(f));
    });
    this._card.addEventListener("input", (e) => {
      if (e.target.closest("[data-form=quest]")) this._syncQuestSubmit();
    });
    host.strip.addEventListener("click", (e) => this._onClick(e));
  }
  /* ── public, called by the game ── */
  /** (Re)load the campaign. Coalesced, so props set right after construction win. */
  load() {
    if (this._loadT) clearTimeout(this._loadT);
    this._loadT = setTimeout(() => void this._load(), 0);
  }
  get ready() {
    return !!this.cfg?.active && this.host.enabled();
  }
  get codes() {
    return lsGet(RW_LS.codes) ?? {};
  }
  /** A round started: ask for its ticket now, so the claim can prove it was played. */
  onRoundStart() {
    this._ticket = null;
    if (!this.ready) return;
    this._ticket = this._post("round", {}).then((r) => r.ticket ?? null).catch(() => null);
  }
  /** The chest opened: fill the rewards strip on the results card. */
  onResults(score, tier) {
    this._last = { score, tier: Math.min(tier, rwRawTier(score)) };
    this._msg = "";
    this._renderStrip(true);
  }
  /** Test hook / timelines: open the rewards screen on a view. */
  open(view) {
    if (!this.ready) return false;
    if (view === "claim" && !this._offer) return false;
    if (view === "quest" && !this.cfg?.quest) return false;
    this._render(view);
    this.host.show("reward");
    return true;
  }
  /* ── network ── */
  async _load() {
    if (!this.host.enabled()) {
      this.cfg = null;
      this._renderStrip();
      return;
    }
    try {
      const r = await fetch(`${this._base()}/api/lootbreak/config`, { mode: "cors" });
      this.cfg = r.ok ? await r.json() : null;
    } catch {
      this.cfg = null;
    }
    this._renderStrip();
  }
  _base() {
    return (this.host.api() || "https://medialife.ai").replace(/\/+$/, "");
  }
  async _post(path, body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 12e3);
    try {
      const r = await fetch(`${this._base()}/api/lootbreak/${path}`, {
        method: "POST",
        mode: "cors",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal
      });
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  /* ── the strip on the results card ── */
  _renderStrip(fresh = false) {
    const s = this.host.strip;
    const sec = s.parentElement;
    if (!this.ready || !this.cfg.rewards.length) {
      s.hidden = true;
      if (sec) sec.hidden = true;
      this._offer = null;
      return;
    }
    const cfg = this.cfg;
    const { score, tier } = this._last;
    const codes = this.codes;
    const held = isLive(codes.score) ? codes.score.percent : 0;
    const reward = rwRewardFor(cfg.rewards, tier);
    const best = Math.max(held, reward?.percent ?? 0);
    const next = [...cfg.rewards].sort((a, b) => a.tier - b.tier).find((r) => r.tier > tier && r.percent > best);
    this._offer = reward && reward.percent > held ? reward : null;
    const hasCodes = isLive(codes.score) || isLive(codes.quest);
    let main;
    if (this._offer) {
      main = `
        <div class="lb-rw-row is-win">
          <i class="lb-rw-ico" aria-hidden="true"></i>
          <div class="lb-rw-txt"><b>${this._offer.percent}% OFF UNLOCKED</b><span>${held ? `Upgrades your ${held}% code` : `${esc(TIERS[tier].name)} pays out. Claim it!`}</span></div>
          <button class="lb-btn lb-btn-gold" type="button" data-act="claim">Claim</button>
        </div>`;
    } else if (held) {
      main = `
        <div class="lb-rw-row">
          <i class="lb-rw-ico is-held" aria-hidden="true"></i>
          <div class="lb-rw-txt"><b>YOUR ${held}% CODE IS SAFE</b><span>${next ? `Reach ${esc(TIERS[next.tier].name)} for ${next.percent}% off` : "You hold the top reward"}</span></div>
          <button class="lb-btn lb-btn-sm" type="button" data-act="codes">My code</button>
        </div>`;
    } else {
      const goal = next ?? cfg.rewards[0];
      const at = TIERS[goal.tier].at;
      const p = clamp(score / at, 0, 1);
      main = `
        <div class="lb-rw-row">
          <i class="lb-rw-ico is-locked" aria-hidden="true"></i>
          <div class="lb-rw-txt"><b>REACH ${esc(TIERS[goal.tier].name.toUpperCase())}</b><span>for ${goal.percent}% off TBH merch \xB7 ${fmt(Math.max(0, at - score))} to go</span>
            <span class="lb-rw-prog" aria-hidden="true"><i style="width:${(p * 100).toFixed(1)}%;--c:${TIERS[goal.tier].color}"></i></span></div>
          ${hasCodes ? `<button class="lb-btn lb-btn-sm" type="button" data-act="codes">My codes</button>` : ""}
        </div>`;
    }
    const q = cfg.quest;
    const quest = q && !isLive(codes.quest) ? `<button class="lb-rw-quest" type="button" data-act="quest">Want an extra ${q.percent}% off?<span aria-hidden="true">\u25B8</span></button>` : "";
    s.innerHTML = main + quest;
    s.hidden = false;
    if (sec) sec.hidden = false;
    if (fresh && this._offer) this.host.emit("offer", this._offer.percent);
  }
  /* ── the rewards screen ── */
  _onClick(e) {
    const b = e.target.closest("[data-act]");
    if (!b || this._busy) return;
    const act = b.dataset.act;
    if (act === "claim" || act === "codes" || act === "quest") {
      this.open(act);
    } else if (act === "back") {
      this._renderStrip();
      this.host.show("results");
    } else if (act === "again") {
      this.host.again();
    } else if (act === "copy") {
      void this._copy(b);
    } else if (act === "save") {
      const c = this.codes[b.dataset.kind];
      if (c) void this._saveCoupon(c, b);
    } else if (act === "shop") {
      this.host.emit("shop", 0);
    } else if (act === "follow") {
      const i = Number(b.dataset.i);
      const f = this.cfg?.quest?.follow[i];
      if (!f) return;
      window.open(f.url, "_blank", "noopener");
      this._markStep(i);
    } else if (act === "story") {
      void this._shareStory(b);
    }
  }
  _render(view) {
    const cfg = this.cfg;
    const email = lsGet(RW_LS.email) ?? "";
    const terms = cfg.terms ? `<p class="lb-rw-terms">${esc(cfg.terms)}</p>` : "";
    const err = `<p class="lb-rw-err" data-rw="err" role="alert"></p>`;
    const consent = `<label class="lb-rw-check"><input type="checkbox" name="consent"><span>Email me new TBH drops and rewards. Unsubscribe anytime.</span></label>`;
    const emailField = (id) => `
      <label class="lb-rw-lbl" for="${id}">Your email</label>
      <input class="lb-rw-in" id="${id}" name="email" type="email" inputmode="email" autocomplete="email"
        autocapitalize="off" spellcheck="false" maxlength="200" placeholder="you@email.com" value="${esc(email)}" required>`;
    if (view === "claim") {
      const o = this._offer;
      const held = isLive(this.codes.score) ? this.codes.score.percent : 0;
      this._body.innerHTML = `
        <div class="lb-ribbon"><span>${o.percent}% OFF</span></div>
        <p class="lb-rw-big" style="color:${TIERS[this._last.tier].color}">${held ? "UPGRADE!" : "UNLOCKED!"}</p>
        <p class="lb-rw-p">${held ? `Swap your ${held}% code for ${o.percent}% off. Your old code stops working.` : "Your code is made just for you and only works with your email, so nobody else can use it."}</p>
        <form class="lb-rw-form" data-form="score" novalidate>
          ${emailField("lbRwEmail")}
          ${consent}
          ${err}
          <button class="lb-btn lb-btn-go lb-rw-submit" type="submit">Get my code</button>
        </form>
        <button class="lb-rw-link" type="button" data-act="back">Not now</button>
        ${terms}`;
    } else if (view === "codes") {
      const codes = this.codes;
      const list = ["score", "quest"].map((k) => codes[k]).filter((c) => !!c);
      const q = cfg.quest;
      this._body.innerHTML = `
        <div class="lb-ribbon"><span>YOUR LOOT</span></div>
        ${this._msg ? `<p class="lb-rw-msg">${esc(this._msg)}</p>` : ""}
        ${list.map((c) => this._couponHtml(c)).join("")}
        ${cfg.shopUrl ? `<a class="lb-btn lb-btn-go lb-rw-wide" href="${esc(cfg.shopUrl)}" target="_blank" rel="noopener" data-act="shop">${esc(
        cfg.shopLabel || "Shop the drop"
      )}</a>` : ""}
        ${q && !isLive(codes.quest) ? `<button class="lb-rw-quest" type="button" data-act="quest">Want an extra ${q.percent}% off?<span aria-hidden="true">\u25B8</span></button>` : ""}
        <div class="lb-actions lb-rw-acts">
          <button class="lb-btn" type="button" data-act="back">Back</button>
          <button class="lb-btn lb-btn-go" type="button" data-act="again">Play again</button>
        </div>
        ${terms}`;
    } else {
      const q = cfg.quest;
      const steps = this._steps();
      const n = q.follow.length + 1;
      const plats = new Set(q.follow.map((f) => rwPlatform(f.url)));
      const ig = plats.has("instagram");
      const dc = plats.has("discord");
      const who = [ig ? "follows" : "", dc ? "Discord" : ""].filter(Boolean).join(" and ") || "follows";
      this._body.innerHTML = `
        <div class="lb-ribbon"><span>BONUS QUEST</span></div>
        <p class="lb-rw-big">+${q.percent}% OFF</p>
        <p class="lb-rw-p">Do all ${n} steps to unlock an extra ${q.percent}% off your next order.</p>
        <ol class="lb-rw-steps">
          ${q.follow.map(
        (f, i) => `
            <li><button type="button" class="lb-rw-step${steps[i] ? " is-done" : ""}" data-act="follow" data-i="${i}">
              <i aria-hidden="true">${steps[i] ? "\u2713" : i + 1}</i><span>${RW_STEP[rwPlatform(f.url)](esc(f.label))}</span><em aria-hidden="true">\u2197</em>
            </button></li>`
      ).join("")}
          <li><button type="button" class="lb-rw-step${steps[n - 1] ? " is-done" : ""}" data-act="story">
            <i aria-hidden="true">${steps[n - 1] ? "\u2713" : n}</i><span>Share your loot to your Instagram story${q.storyTags ? `<small>Tag ${esc(q.storyTags)}</small>` : ""}</span><em aria-hidden="true">\u2197</em>
          </button></li>
        </ol>
        <form class="lb-rw-form" data-form="quest" novalidate>
          ${ig ? `<label class="lb-rw-lbl" for="lbRwIg">Your Instagram</label>
          <input class="lb-rw-in" id="lbRwIg" name="handle" type="text" autocomplete="off" autocapitalize="off"
            spellcheck="false" maxlength="31" placeholder="@yourname" required>` : ""}
          ${dc ? `<label class="lb-rw-lbl" for="lbRwDc">Your Discord username</label>
          <input class="lb-rw-in" id="lbRwDc" name="discord" type="text" autocomplete="off" autocapitalize="off"
            spellcheck="false" maxlength="37" placeholder="yourname" required>` : ""}
          ${emailField("lbRwQEmail")}
          ${consent}
          ${err}
          <button class="lb-btn lb-btn-go lb-rw-submit" type="submit">Unlock bonus</button>
          <p class="lb-rw-note">We check your ${who} before your order ships, so use your real username${ig && dc ? "s" : ""}.</p>
        </form>
        <button class="lb-rw-link" type="button" data-act="back">Back</button>
        ${terms}`;
      this._syncQuestSubmit();
    }
    this._card.querySelector(".lb-frame").scrollTop = 0;
  }
  _couponHtml(c) {
    const live = isLive(c);
    const status = c.status === "redeemed" ? "Used" : c.status === "void" ? "No longer valid" : !live ? "Expired" : c.kind === "quest" && !c.verified ? "Checking your follows" : "";
    return `
      <div class="lb-coupon${live ? "" : " is-dead"}" style="--c:${c.kind === "quest" ? "#c79bff" : "#ffc53d"}">
        <div class="lb-coupon-top"><b>${c.percent}% OFF</b><span>${c.kind === "quest" ? "BONUS QUEST" : "TBH MERCH"}</span></div>
        <div class="lb-coupon-code" aria-label="Code ${esc(c.code.split("").join(" "))}">${esc(c.code)}</div>
        <p class="lb-coupon-meta">Only works with ${esc(c.email)} \xB7 Use by ${esc(dateLabel(c.expiresAt))}</p>
        ${status ? `<p class="lb-coupon-status">${esc(status)}</p>` : ""}
        ${live ? `<div class="lb-coupon-acts">
          <button class="lb-btn lb-btn-sm" type="button" data-act="copy" data-code="${esc(c.code)}">Copy code</button>
          <button class="lb-btn lb-btn-sm" type="button" data-act="save" data-kind="${c.kind}">Save coupon</button>
        </div>` : ""}
      </div>`;
  }
  _err(text) {
    const e = this._card.querySelector("[data-rw=err]");
    if (e) e.textContent = text;
  }
  _setBusy(on, label) {
    this._busy = on;
    const b = this._card.querySelector(".lb-rw-submit");
    if (!b) return;
    b.disabled = on;
    if (label) b.textContent = label;
    b.classList.toggle("is-busy", on);
  }
  /** Save what the server sent back and show it. */
  _gotCode(c, msg, email) {
    const codes = this.codes;
    codes[c.kind] = c;
    lsSet(RW_LS.codes, codes);
    lsSet(RW_LS.email, email);
    this._msg = msg;
    this._render("codes");
  }
  async _claimScore(f) {
    const email = String(new FormData(f).get("email") ?? "").trim().toLowerCase();
    const consent = !!f.elements.namedItem("consent")?.checked;
    if (!EMAIL_OK.test(email)) return this._err("Check your email address.");
    if (!this._offer) return;
    this._err("");
    this._setBusy(true, "Unlocking\u2026");
    try {
      const ticket = await this._ticket ?? null;
      const r = await this._post("claim", {
        kind: "score",
        ticket,
        tier: this._last.tier,
        score: Math.round(this._last.score),
        email,
        consent
      });
      if (r.code && (r.ok || r.error === "already-claimed")) {
        if (r.ok) this.host.emit(r.upgraded ? "upgrade" : "claim", r.code.percent);
        this._gotCode(r.code, r.message ?? "", email);
      } else {
        this._setBusy(false, "Get my code");
        this._err(r.message || "Something went wrong. Try again.");
      }
    } catch {
      this._setBusy(false, "Get my code");
      this._err("Can't reach the rewards right now. Check your connection and try again.");
    } finally {
      this._busy = false;
    }
  }
  /* ── bonus quest ── */
  _steps() {
    const n = (this.cfg?.quest?.follow.length ?? 0) + 1;
    const s = lsGet(RW_LS.steps) ?? [];
    return Array.from({ length: n }, (_, i) => !!s[i]);
  }
  _markStep(i) {
    const s = this._steps();
    if (s[i]) return;
    s[i] = true;
    lsSet(RW_LS.steps, s);
    const b = this._card.querySelectorAll(".lb-rw-step")[i];
    if (b) {
      b.classList.add("is-done");
      b.querySelector("i").textContent = "\u2713";
    }
    this.host.emit(`quest_step_${i + 1}`, 0);
    this._syncQuestSubmit();
  }
  _syncQuestSubmit() {
    const f = this._card.querySelector("[data-form=quest]");
    const b = f?.querySelector(".lb-rw-submit");
    if (!f || !b || this._busy) return;
    const left = this._steps().filter((x) => !x).length;
    b.disabled = left > 0;
    b.textContent = left > 0 ? `${left} step${left > 1 ? "s" : ""} to go` : "Unlock bonus";
  }
  async _claimQuest(f) {
    const fd = new FormData(f);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const handle = String(fd.get("handle") ?? "").trim();
    const discord = String(fd.get("discord") ?? "").trim();
    const needIg = !!f.elements.namedItem("handle");
    const needDc = !!f.elements.namedItem("discord");
    const consent = !!f.elements.namedItem("consent")?.checked;
    const steps = this._steps();
    if (steps.some((x) => !x)) return this._err("Finish every step first.");
    if (needIg && !HANDLE_OK.test(handle)) return this._err("Add your Instagram handle, like @yourname.");
    if (needDc && !DISCORD_OK.test(discord)) return this._err("Add your Discord username.");
    if (!EMAIL_OK.test(email)) return this._err("Check your email address.");
    this._err("");
    this._setBusy(true, "Unlocking\u2026");
    try {
      const ticket = await this._ticket ?? null;
      const r = await this._post("claim", { kind: "quest", ticket, email, handle, discord, consent, steps });
      if (r.ok && r.code) {
        if (!r.existing) this.host.emit("quest_claim", r.code.percent);
        this._gotCode(r.code, r.message ?? "", email);
      } else {
        this._setBusy(false);
        this._syncQuestSubmit();
        this._err(r.message || "Something went wrong. Try again.");
      }
    } catch {
      this._setBusy(false);
      this._syncQuestSubmit();
      this._err("Can't reach the rewards right now. Check your connection and try again.");
    } finally {
      this._busy = false;
    }
  }
  /* ── copy, save and share ── */
  async _copy(b) {
    const code = b.dataset.code ?? "";
    let ok = false;
    try {
      await navigator.clipboard.writeText(code);
      ok = true;
    } catch {
      ok = false;
    }
    b.textContent = ok ? "Copied!" : code;
    setTimeout(() => b.textContent = "Copy code", 1800);
  }
  /** Share a PNG (the phone's share sheet saves it to Photos or posts it), else download it. */
  async _sharePng(canvas, name, title) {
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return "cancelled";
    const file = new File([blob], name, { type: "image/png" });
    const nav = navigator;
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title });
        return "shared";
      } catch (e) {
        if (e?.name === "AbortError") return "cancelled";
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2e3);
    return "saved";
  }
  async _saveCoupon(c, b) {
    b.textContent = "\u2026";
    const canvas = await drawCoupon(c, this.cfg, this.host.title());
    const r = await this._sharePng(canvas, `${c.code}.png`, `${c.percent}% off: ${c.code}`);
    b.textContent = r === "saved" ? "Saved!" : r === "shared" ? "Done!" : "Save coupon";
    if (r !== "cancelled") this.host.emit("save", c.percent);
    setTimeout(() => b.textContent = "Save coupon", 1800);
  }
  async _shareStory(b) {
    const q = this.cfg?.quest;
    if (!q) return;
    const n = q.follow.length;
    const label = b.querySelector("span");
    const prev = label?.innerHTML ?? "";
    if (label) label.textContent = "Making your story\u2026";
    const canvas = await drawStory(this._last.score, this._last.tier, q.storyTags, this.host.title(), this.host.shareUrl());
    const r = await this._sharePng(canvas, "lootbreak-story.png", "My LOOT BREAK loot");
    if (label) label.innerHTML = prev;
    if (r === "cancelled") return;
    this._markStep(n);
    if (r === "saved") {
      const small = b.querySelector("small");
      if (small) small.textContent = `Saved. Post it to your story and tag ${q.storyTags || "us"}.`;
    }
  }
};
async function canvasFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 64px "Silkscreen"'),
      document.fonts.load('500 32px "Pixelify Sans"')
    ]);
  } catch {
  }
}
var PX_FONT = '"Silkscreen", ui-monospace, monospace';
var BODY_FONT = '"Pixelify Sans", system-ui, sans-serif';
function frame(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
function fitText(ctx, text, max, size, font, weight = 700) {
  let s = size;
  do
    ctx.font = `${weight} ${s}px ${font}`;
  while (ctx.measureText(text).width > max && (s -= 4) > 16);
}
async function drawCoupon(c, cfg, title) {
  await canvasFonts();
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d");
  const accent = c.kind === "quest" ? "#c79bff" : "#ffc53d";
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#2b2531");
  g.addColorStop(1, "#120f16");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#0b090e";
  x.fillRect(40, 40, W - 80, H - 80);
  x.fillStyle = "#55495f";
  x.fillRect(52, 52, W - 104, H - 104);
  x.fillStyle = "#1d1922";
  x.fillRect(64, 64, W - 128, H - 128);
  x.textAlign = "center";
  x.fillStyle = "#a99fb4";
  x.font = `700 34px ${PX_FONT}`;
  x.fillText((title || "LOOT BREAK").toUpperCase(), W / 2, 170);
  frame(x, 120, 230, W - 240, 640, 28);
  x.fillStyle = accent;
  x.fill();
  x.fillStyle = "#16121d";
  x.font = `700 170px ${PX_FONT}`;
  x.fillText(`${c.percent}% OFF`, W / 2, 440);
  x.font = `700 40px ${PX_FONT}`;
  x.fillText(c.kind === "quest" ? "BONUS QUEST REWARD" : "TBH MERCH", W / 2, 510);
  x.setLineDash([18, 16]);
  x.lineWidth = 6;
  x.strokeStyle = "rgba(22,18,29,.45)";
  x.beginPath();
  x.moveTo(160, 570);
  x.lineTo(W - 160, 570);
  x.stroke();
  x.setLineDash([]);
  frame(x, 170, 620, W - 340, 170, 18);
  x.fillStyle = "#16121d";
  x.fill();
  x.fillStyle = "#fff";
  fitText(x, c.code, W - 400, 96, PX_FONT);
  x.fillText(c.code, W / 2, 738);
  x.fillStyle = "#f4efe2";
  x.font = `500 40px ${BODY_FONT}`;
  x.fillText(`Only works with ${c.email}`, W / 2, 960);
  x.fillText(`Use by ${dateLabel(c.expiresAt)}`, W / 2, 1015);
  if (c.kind === "quest" && !c.verified) {
    x.fillStyle = "#d9c7ff";
    x.font = `500 32px ${BODY_FONT}`;
    x.fillText("We check your follows and story before your order ships.", W / 2, 1070);
  }
  if (cfg?.terms) {
    x.fillStyle = "#8d8496";
    x.font = `500 28px ${BODY_FONT}`;
    wrap(x, cfg.terms, W / 2, 1140, W - 240, 36);
  }
  if (cfg?.shopUrl) {
    x.fillStyle = accent;
    x.font = `700 30px ${PX_FONT}`;
    x.fillText(cfg.shopUrl.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, ""), W / 2, 1240);
  }
  return cv;
}
function wrap(x, text, cx, y, max, lh) {
  const words = text.split(/\s+/);
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > max && line) {
      x.fillText(line, cx, y);
      y += lh;
      line = w;
    } else line = t;
  }
  if (line) x.fillText(line, cx, y);
}
async function drawStory(score, tierIdx, tags, title, url) {
  await canvasFonts();
  const W = 1080;
  const H = 1920;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const x = cv.getContext("2d");
  const tier = TIERS[tierIdx];
  const g = x.createRadialGradient(W / 2, 820, 60, W / 2, 820, 1100);
  g.addColorStop(0, "#3a2d48");
  g.addColorStop(1, "#0d0b11");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.save();
  x.translate(W / 2, 820);
  x.globalAlpha = 0.16;
  x.fillStyle = tier.glow;
  for (let i = 0; i < 12; i++) {
    x.rotate(Math.PI / 6);
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(-70, -900);
    x.lineTo(70, -900);
    x.fill();
  }
  x.restore();
  x.textAlign = "center";
  x.fillStyle = "#b3242f";
  x.beginPath();
  x.moveTo(190, 300);
  x.lineTo(230, 240);
  x.lineTo(W - 230, 240);
  x.lineTo(W - 190, 300);
  x.lineTo(W - 230, 360);
  x.lineTo(230, 360);
  x.closePath();
  x.fill();
  x.fillStyle = "#ffd979";
  fitText(x, (title || "LOOT BREAK").toUpperCase(), W - 520, 64, PX_FONT);
  x.fillText((title || "LOOT BREAK").toUpperCase(), W / 2, 325);
  x.fillStyle = "#cfc6da";
  x.font = `700 46px ${PX_FONT}`;
  x.fillText("I PULLED", W / 2, 560);
  try {
    const chest = pixelCanvas(SPRITES.chestOpen);
    x.imageSmoothingEnabled = false;
    const s = 300 / Math.max(chest.width, chest.height);
    x.drawImage(chest, W / 2 - chest.width * s / 2, 920 - chest.height * s, chest.width * s, chest.height * s);
  } catch {
  }
  x.shadowColor = tier.glow;
  x.shadowBlur = 40;
  x.fillStyle = tier.color;
  fitText(x, tier.name.toUpperCase(), W - 140, 150, PX_FONT);
  x.fillText(tier.name.toUpperCase(), W / 2, 1110);
  x.shadowBlur = 0;
  x.fillStyle = "#ffe08a";
  x.font = `700 84px ${PX_FONT}`;
  x.fillText(fmt(score), W / 2, 1240);
  x.fillStyle = "#a99fb4";
  x.font = `700 34px ${PX_FONT}`;
  x.fillText("POINTS", W / 2, 1295);
  x.fillStyle = "#f4efe2";
  x.font = `500 52px ${BODY_FONT}`;
  x.fillText("Beat my lunch break.", W / 2, 1450);
  if (tags) {
    x.fillStyle = "#c79bff";
    fitText(x, tags, W - 160, 48, PX_FONT);
    x.fillText(tags, W / 2, 1560);
  }
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();
  if (host) {
    x.fillStyle = "#8d8496";
    x.font = `700 32px ${PX_FONT}`;
    x.fillText(`PLAY AT ${host.toUpperCase()}`, W / 2, 1680);
  }
  x.fillStyle = "#7f768a";
  x.font = `700 26px ${PX_FONT}`;
  x.fillText("ACTIVATED BY MEDIALIFE", W / 2, 1790);
  return cv;
}
function injectFonts() {
  if (document.getElementById("lb-fonts")) return;
  const l = document.createElement("link");
  l.id = "lb-fonts";
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Silkscreen:wght@400;700&display=swap";
  document.head.appendChild(l);
}
function injectCss() {
  if (document.getElementById("lb-css")) return;
  const s = document.createElement("style");
  s.id = "lb-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}
var CSS = `
#zcomponent-overlay > .lb-root, .lb-root{position:absolute;inset:0;pointer-events:none !important;z-index:20;
  font-family:'Pixelify Sans','Silkscreen',ui-monospace,monospace;color:#f4efe2;-webkit-user-select:none;user-select:none;font-variant-ligatures:none;
  --top:var(--safe-area-inset-top,env(safe-area-inset-top,0px));--bot:var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px));
  --iron:#2a2430;--iron2:#15121a;--gold:#f5c447;--red:#b3242f;--red2:#6e121c}
.lb-root *,.lb-root *::before,.lb-root *::after{box-sizing:border-box}
.lb-root [hidden]{display:none !important}
.lb-root button,.lb-root a{pointer-events:auto;font:inherit}
.lb-root.lb-modal .lb-card{pointer-events:auto}
.lb-hud{position:absolute;inset:0}

.lb-top{position:absolute;left:0;right:0;top:calc(var(--top) + 10px);display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 10px}
.lb-chip{display:flex;align-items:center;gap:6px;min-height:36px;padding:4px 12px;border-radius:8px;background:linear-gradient(#2c2633,#16131b);
  border:2px solid #0c0a10;box-shadow:inset 0 0 0 2px #51465a,0 3px 0 rgba(0,0,0,.45);font-family:'Silkscreen',monospace;font-size:15px;white-space:nowrap}
.lb-chip b{font-weight:700;color:#fff;letter-spacing:.02em}
@media (max-width:400px){.lb-chip{padding:4px 8px;font-size:13px}.lb-ribbon-sm{padding:5px 12px 6px;font-size:10px}}
.lb-coins b{color:#ffe08a;min-width:4.5ch;text-align:right}
.lb-coin{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6c9 0 18%,#f5c447 20% 60%,#a8731b 62%);box-shadow:0 0 0 2px #16121d}
.lb-clock span{font-size:11px;color:#a9b4c4}
.lb-clock b.is-late{color:#ff6b6b;animation:lbBlink .5s steps(2) infinite}
.lb-ribbon{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:6px 26px 7px;color:#ffd979;
  font-family:'Silkscreen',monospace;font-weight:700;letter-spacing:.06em;background:linear-gradient(#cf3440,#8c1823);
  clip-path:polygon(0 50%,12px 0,calc(100% - 12px) 0,100% 50%,calc(100% - 12px) 100%,12px 100%);
  text-shadow:0 2px 0 #3d0710;filter:drop-shadow(0 3px 0 rgba(0,0,0,.5))}
.lb-ribbon::before{content:"";position:absolute;inset:3px 10px;border-top:1px solid rgba(255,220,150,.35);border-bottom:1px solid rgba(0,0,0,.35);pointer-events:none}
.lb-ribbon-sm{flex:none;font-size:11px;letter-spacing:.03em;padding:5px 15px 6px;white-space:nowrap}
.lb-top .lb-chip{flex:0 1 auto;min-width:0}
.lb-ribbon-sm span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb-party{position:absolute;left:12px;right:12px;top:calc(var(--top) + 56px);display:flex;align-items:center;gap:8px;font-family:'Silkscreen',monospace;font-size:10px;color:#cdd3dc}
.lb-bar{flex:1;max-width:260px;height:10px;border-radius:3px;background:#16121d;box-shadow:inset 0 0 0 2px #0c0a10,0 0 0 1px #51465a}
.lb-bar i{display:block;height:100%;width:100%;border-radius:2px;background:linear-gradient(#7cf08a,#2f9e47);transition:width .15s}
.lb-bar i.is-low{background:linear-gradient(#ff8080,#c42b2b);animation:lbBlink .6s steps(2) infinite}
.lb-iconbtn{position:absolute;right:10px;top:calc(var(--top) + 52px);width:44px;height:44px;border-radius:10px;border:2px solid #0c0a10;
  background:linear-gradient(#a3622f,#6b3a16);box-shadow:inset 0 0 0 2px #d79a52,0 3px 0 rgba(0,0,0,.45);color:#ffe7b5;font-size:18px;cursor:pointer}
.lb-iconbtn.is-off{filter:grayscale(1) brightness(.7)}
.lb-replace{top:calc(var(--top) + 104px);display:flex;align-items:center;justify-content:center;padding:0}
.lb-replace[hidden]{display:none}
.lb-replace svg{width:20px;height:20px}
.lb-replace span{position:absolute;top:calc(100% + 4px);right:-6px;white-space:nowrap;font-family:'Silkscreen',monospace;font-size:9px;letter-spacing:.04em;color:#f4efe2;text-shadow:0 1px 0 #16121d,0 0 6px #16121d}
.lb-place{position:absolute;inset:0;pointer-events:none}
.lb-placebox{position:absolute;left:50%;bottom:calc(var(--bot) + max(32px, 9vh));transform:translateX(-50%);width:min(calc(100% - 24px),400px);
  padding:14px 14px 16px;border-radius:14px;text-align:center;pointer-events:auto;
  background:linear-gradient(rgba(43,37,49,.94),rgba(24,20,29,.94));border:3px solid #0b090e;box-shadow:inset 0 0 0 2px #55495f,0 10px 30px rgba(0,0,0,.5)}
.lb-placehint{margin:0 0 12px;font-size:15px;line-height:1.35;color:#f4efe2}
.lb-btn-place{width:100%;font-size:17px}
.lb-iconbtn.is-off::after{content:"";position:absolute;left:8px;right:8px;top:50%;height:3px;background:#ffe7b5;transform:rotate(-40deg)}

.lb-combo{position:absolute;right:14px;top:calc(var(--top) + 168px);text-align:right;font-family:'Silkscreen',monospace;font-size:34px;font-weight:700;color:#fff;
  text-shadow:0 3px 0 #16121d,0 0 14px rgba(255,200,80,.6);opacity:0;transform:scale(.6);transform-origin:right center}
.lb-combo small{display:block;font-size:12px;letter-spacing:.2em;color:#ffd979}
.lb-combo em{display:block;font-style:normal;font-size:12px;color:#ffe08a}
.lb-combo.is-on{animation:lbPunch .25s cubic-bezier(.2,1.6,.4,1) forwards}
.lb-combo.is-miss{color:#ff8a8a;animation:lbMiss .8s ease-out forwards}
@keyframes lbMiss{0%{opacity:1;transform:translateX(-6px)}15%{transform:translateX(5px)}30%{transform:none}70%{opacity:1}100%{opacity:0}}
.lb-combo.is-hot{color:#ffcf4a;text-shadow:0 3px 0 #16121d,0 0 18px #ff7b2e}

.lb-banner{position:absolute;left:50%;top:26%;transform:translate(-50%,-50%) scale(.6);opacity:0;font-family:'Silkscreen',monospace;font-weight:700;
  font-size:clamp(26px,7.5vw,48px);letter-spacing:.04em;color:#fff;white-space:nowrap;text-shadow:0 4px 0 #16121d,0 0 24px rgba(255,255,255,.4)}
.lb-banner.is-on{animation:lbBanner 1.6s cubic-bezier(.2,1.4,.4,1) forwards}
.lb-banner.is-boss{color:#ff5a5a;text-shadow:0 4px 0 #2a0508,0 0 26px rgba(255,40,40,.7)}
.lb-banner.is-end{color:#ffd979}
.lb-count{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-family:'Silkscreen',monospace;font-weight:700;font-size:96px;color:#fff;
  opacity:0;text-shadow:0 6px 0 #16121d,0 0 30px rgba(120,200,255,.6)}
.lb-count.is-on{animation:lbCount .75s ease-out forwards}
.lb-count.is-go{color:#ffd979;font-size:72px}

.lb-toast{position:absolute;left:50%;top:calc(var(--top) + 96px);transform:translate(-50%,-10px);opacity:0;padding:8px 16px;border-radius:999px;
  background:rgba(14,12,18,.88);border:1px solid rgba(255,255,255,.12);font-family:'Pixelify Sans',sans-serif;font-size:15px;white-space:nowrap}
.lb-toast.is-on{animation:lbToast 2s ease forwards}

.lb-meter{position:absolute;left:50%;bottom:calc(var(--bot) + 14px);transform:translateX(-50%);width:min(92%,420px);padding:8px 12px 10px;border-radius:10px;
  background:linear-gradient(#2c2633,#16131b);border:2px solid #0c0a10;box-shadow:inset 0 0 0 2px #51465a,0 3px 0 rgba(0,0,0,.45)}
.lb-meter-label{display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Silkscreen',monospace;font-size:12px;letter-spacing:.06em;margin-bottom:6px}
.lb-arrow{color:#8d8496}
.lb-meter-bar{height:10px;border-radius:3px;background:#0e0c12;box-shadow:inset 0 0 0 1px #3c3444;overflow:hidden}
.lb-meter-bar i{display:block;height:100%;width:0;transition:width .2s}

.lb-cursor{position:absolute;left:0;top:0;width:34px;height:44px;margin:-4px 0 0 -6px;opacity:0;transform-origin:6px 4px;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 16' shape-rendering='crispEdges'%3E%3Cpath d='M0 0h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1H7v1h1v2H7v1H6v-2H5v-1H4v1H3v1H1v1H0z' fill='%2316121d'/%3E%3Cpath d='M1 2h1v1h1v1h1v1h1v1h1v1h1v1h1v1h1v1H6v1h1v2H6v-2H5v-1H4v1H3v1H1z' fill='%23fff'/%3E%3C/svg%3E") no-repeat center/contain;
  image-rendering:pixelated;filter:drop-shadow(0 2px 0 rgba(0,0,0,.4))}
.lb-cursor.is-click{animation:lbClick .7s ease-out forwards}
.lb-cursor.is-jam{filter:drop-shadow(0 2px 0 rgba(0,0,0,.4)) sepia(1) saturate(6) hue-rotate(-50deg)}
.lb-floaters{position:absolute;inset:0;overflow:hidden}
.lb-float{position:absolute;left:0;top:0;font-family:'Silkscreen',monospace;font-weight:700;font-size:16px;color:#fff;text-shadow:0 2px 0 #16121d;white-space:nowrap}
.lb-float.is-crit{color:#ffcf4a;font-size:20px}
.lb-float.is-block{color:#c9a6ff;font-size:13px;letter-spacing:.08em}
.lb-float.is-pts{color:#ffe08a;font-size:18px}
.lb-float.is-loot{color:#9fd3ff;font-size:20px}

.lb-card{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:calc(var(--top) + 12px) 12px calc(var(--bot) + 12px);
  background:radial-gradient(ellipse at center,rgba(10,8,14,.35),rgba(10,8,14,.72))}
.lb-results{background:linear-gradient(rgba(10,8,14,0) 0,rgba(10,8,14,.55) 45%,rgba(10,8,14,.8));align-items:flex-end}
.lb-frame{position:relative;width:min(100%,400px);max-height:100%;overflow:auto;padding:16px 18px 18px;border-radius:14px;text-align:center;
  background:linear-gradient(#2b2531,#18141d);border:3px solid #0b090e;box-shadow:inset 0 0 0 3px #55495f,inset 0 0 0 6px #1a161f,0 10px 30px rgba(0,0,0,.6);
  animation:lbRise .35s cubic-bezier(.2,1.3,.4,1)}
.lb-frame>.lb-ribbon{display:flex;width:max-content;max-width:100%;min-width:62%;margin:0 auto 6px;font-size:20px;white-space:nowrap}
.lb-sub{margin:4px 0 12px;color:#c9c1d4;font-size:15px}
.lb-how{list-style:none;margin:0 0 16px;padding:0;text-align:left;display:grid;gap:8px}
.lb-how li{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;line-height:1.35;color:#ece6f3}
.lb-how b{color:#fff}
.lb-cosmic{background:linear-gradient(90deg,#c79bff,#33e6e6,#ff5ad1);-webkit-background-clip:text;background-clip:text;color:transparent !important}
.lb-ico{flex:0 0 28px;height:28px;border-radius:6px;background:#3a3242;box-shadow:inset 0 0 0 2px #55495f;position:relative}
.lb-ico::after{content:"";position:absolute;inset:6px;image-rendering:pixelated}
.lb-ico-party::after{background:linear-gradient(90deg,#cfd4dc 0 25%,#58a63e 25% 50%,#8a57d6 50% 75%,#f28fae 75%)}
.lb-ico-cursor::after{inset:5px 8px;background:#fff;clip-path:polygon(0 0,100% 70%,55% 70%,75% 100%,55% 100%,35% 75%,0 100%)}
.lb-ico-loot::after{border-radius:50%;background:radial-gradient(circle,#9fd3ff,#2b6fc4)}
.lb-ico-chest::after{background:linear-gradient(#f5c447 0 30%,#91603a 30%);box-shadow:0 0 0 2px #16121d}
.lb-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:10px;border:2px solid #0c0a10;
  background:linear-gradient(#a3622f,#6b3a16);box-shadow:inset 0 0 0 2px #d79a52,0 4px 0 #2a1608;color:#ffe7b5;font-family:'Silkscreen',monospace;
  font-weight:700;font-size:15px;letter-spacing:.03em;text-decoration:none;cursor:pointer;touch-action:manipulation}
.lb-btn:active{transform:translateY(2px);box-shadow:inset 0 0 0 2px #d79a52,0 2px 0 #2a1608}
.lb-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.lb-btn-go{background:linear-gradient(#d13b46,#8c1823);box-shadow:inset 0 0 0 2px #ff8a7a,0 4px 0 #3d0710;color:#fff1c9}
.lb-intro .lb-btn-go{width:100%;font-size:17px}
.lb-best{margin:10px 0 0;font-size:13px;color:#a99fb4;min-height:1em}
.lb-kicker{margin:0;font-family:'Silkscreen',monospace;font-size:11px;letter-spacing:.24em;color:#a99fb4}
.lb-tier{margin:2px 0 0;font-family:'Silkscreen',monospace;font-weight:700;font-size:clamp(34px,10vw,46px);letter-spacing:.03em;line-height:1.1}
.lb-tier.is-cosmic{background:linear-gradient(90deg,#c79bff,#33e6e6,#ff5ad1,#ffc53d,#c79bff);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent !important;animation:lbHue 3s linear infinite}
.lb-scoreline{display:flex;align-items:baseline;justify-content:center;gap:10px;margin-bottom:8px}
.lb-scoreline b{font-family:'Silkscreen',monospace;font-size:24px;color:#ffe08a}
.lb-scoreline span{font-size:13px;color:#a99fb4}
.lb-ladder{list-style:none;margin:2px auto 4px;padding:0;display:grid;grid-template-columns:repeat(10,1fr);gap:3px;max-width:300px;direction:rtl}
.lb-ladder li{height:10px;border-radius:2px;font-size:0;color:transparent;overflow:hidden;background:#1d1922;box-shadow:inset 0 0 0 1px #2e2836}
.lb-ladder li.is-got{background:var(--c);box-shadow:none}
.lb-ladder li.is-top{outline:2px solid #fff;outline-offset:1px;box-shadow:0 0 10px var(--c);animation:lbPulse 1.2s ease-in-out infinite}
.lb-ladder-cap{margin:0 0 12px;font-size:12px;color:#a99fb4}
.lb-sec{margin:0 0 12px;padding-top:10px;border-top:1px solid #2e2836;text-align:left}
.lb-sec-h{margin:0 0 8px;font-family:'Silkscreen',monospace;font-weight:400;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#7f768a}
.lb-sec .lb-reward{margin:0}
.lb-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px;text-align:center}
.lb-stats div{padding:6px 4px;border-radius:8px;background:#1d1922;box-shadow:inset 0 0 0 1px #2e2836}
.lb-stats b{display:block;font-family:'Silkscreen',monospace;font-size:17px;color:#fff}
.lb-stats span{font-size:11.5px;color:#a99fb4}
.lb-actions{display:grid;grid-template-columns:1fr 1.3fr;gap:8px}
.lb-btn-redeem{width:100%;margin-top:8px;background:linear-gradient(#3a7bd5,#1d4f9a);box-shadow:inset 0 0 0 2px #8fc2ff,0 4px 0 #0d2850;color:#eaf4ff}
.lb-foot{margin:12px 0 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#7f768a}

.lb-coach{position:absolute;left:50%;bottom:calc(var(--bot) + 140px);transform:translate(-50%,8px);opacity:0;width:max-content;max-width:calc(100% - 24px);
  padding:8px 14px;border-radius:10px;background:rgba(14,12,18,.92);border:2px solid #ffd979;color:#fff3c9;font-family:'Silkscreen',monospace;font-size:12px;
  letter-spacing:.03em;line-height:1.3;text-align:center;transition:opacity .2s,transform .2s}
.lb-coach.is-on{opacity:1;transform:translate(-50%,0);animation:lbNudge 1.2s ease-in-out infinite}
.lb-ults{position:absolute;left:50%;bottom:calc(var(--bot) + 76px);transform:translateX(-50%);width:min(92%,420px);display:flex;align-items:center;gap:8px;--ult:0}
.lb-ults-lbl{margin:0;flex:0 0 48px;font-family:'Silkscreen',monospace;font-size:10px;line-height:1.3;color:#cdd3dc;text-align:center;text-shadow:0 1px 0 #16121d}
.lb-ults-lbl b{display:block;font-size:12px;color:#ffe08a}
.lb-ultbtns{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.lb-ultbtn{position:relative;height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:0;border-radius:9px;
  border:2px solid #0c0a10;overflow:hidden;cursor:pointer;color:#cfc6da;font-family:'Silkscreen',monospace;font-size:9px;letter-spacing:.03em;
  background:#1d1922;box-shadow:inset 0 0 0 2px #3c3444,0 3px 0 rgba(0,0,0,.45);touch-action:manipulation}
.lb-ultbtn::before{content:"";position:absolute;left:0;right:0;bottom:0;height:calc(var(--ult) * 100%);background:linear-gradient(#6b4bc0,#33205f);transition:height .2s}
.lb-ultbtn img{position:relative;width:26px;height:26px;image-rendering:pixelated}
.lb-ultbtn span{position:relative}
.lb-ultbtn:disabled{cursor:default}
.lb-ultbtn:disabled img{filter:grayscale(.5) brightness(.85)}
.lb-ultbtn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.lb-ults.is-ready .lb-ultbtn{background:linear-gradient(#ffd25a,#c7861b);color:#2a1608;box-shadow:inset 0 0 0 2px #fff0b0,0 3px 0 #5a3a0a,0 0 14px rgba(255,200,80,.7);animation:lbReady .8s ease-in-out infinite}
.lb-ults.is-ready .lb-ultbtn::before{display:none}
.lb-ults.is-ready .lb-ults-lbl b{color:#fff;animation:lbBlink .6s steps(2) infinite}
.lb-resulting .lb-ults,.lb-resulting .lb-coach{display:none}
.lb-root.lb-danger::after,.lb-root.lb-hurt::after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 70px 12px rgba(255,40,40,.5)}
.lb-root.lb-danger::after{animation:lbBlink .9s ease-in-out infinite}
.lb-root.lb-hurt::after{box-shadow:inset 0 0 90px 20px rgba(166,77,255,.6)}
.lb-banner.is-ult{color:#ffe08a;text-shadow:0 4px 0 #3d2a08,0 0 26px rgba(255,200,80,.8)}
.lb-float.is-heal{color:#9dffb0;font-size:18px}
.lb-float.is-curse{color:#d08bff;font-size:17px}
.lb-float.is-weak{color:#ff5a5a;font-size:24px;text-shadow:0 2px 0 #16121d,0 0 12px rgba(255,200,80,.9)}
.lb-badges{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}
.lb-badges li{padding:5px 4px;border-radius:8px;background:#1d1922;box-shadow:inset 0 0 0 1px #2e2836;font-family:'Silkscreen',monospace;font-size:10px;line-height:1.3;color:#6d6477}
.lb-badges li b{display:block;font-size:10px;font-weight:400}
.lb-badges li.is-got{background:#2c2410;box-shadow:inset 0 0 0 1px #f5c447;color:#ffe08a}
.lb-badges li.is-bad{background:#2a0f14;box-shadow:inset 0 0 0 1px #ff5a5a;color:#ff9a9a}
.lb-ico-ult::after{background:linear-gradient(#ffd25a,#c7861b);clip-path:polygon(60% 0,15% 58%,45% 58%,35% 100%,85% 40%,55% 40%)}
.lb-ico-boss::after{border-radius:50%;background:radial-gradient(circle,#fff 0 18%,#f5c447 22% 40%,#ff3b3b 44% 62%,transparent 66%)}
.lb-purple{color:#c79bff !important}
@keyframes lbReady{50%{transform:translateY(-2px)}}
@keyframes lbNudge{50%{transform:translate(-50%,-3px)}}
@media (max-height:500px){.lb-ultbtn{height:38px}.lb-ultbtn span{display:none}.lb-ults{bottom:calc(var(--bot) + 64px)}.lb-coach{bottom:calc(var(--bot) + 110px)}}

/* rewards */
.lb-reward{margin:0 0 10px;display:grid;gap:6px;text-align:left}
.lb-rw-row{display:flex;align-items:center;gap:10px;padding:8px 8px 8px 10px;border-radius:10px;background:#1d1922;box-shadow:inset 0 0 0 1px #3c3444}
.lb-rw-row.is-win{background:linear-gradient(#3a2c10,#251c0b);box-shadow:inset 0 0 0 2px #f5c447,0 0 18px rgba(245,196,71,.35);animation:lbGlow 1.4s ease-in-out infinite}
.lb-rw-ico{flex:0 0 30px;height:30px;border-radius:6px;position:relative;background:#3a3242;box-shadow:inset 0 0 0 2px #55495f}
.lb-rw-ico::after{content:"%";position:absolute;inset:0;display:grid;place-items:center;font-family:'Silkscreen',monospace;font-weight:700;font-size:16px;color:#ffe08a}
.is-win .lb-rw-ico{background:#f5c447;box-shadow:inset 0 0 0 2px #fff0b0}
.is-win .lb-rw-ico::after{color:#2a1608}
.lb-rw-ico.is-locked::after{content:"?";color:#8d8496}
.lb-rw-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.lb-rw-txt b{font-family:'Silkscreen',monospace;font-size:13px;letter-spacing:.03em;color:#fff}
.is-win .lb-rw-txt b{color:#ffe08a}
.lb-rw-txt span{font-size:12.5px;line-height:1.25;color:#bdb4c8}
.lb-rw-prog{display:block;height:6px;margin-top:3px;border-radius:3px;background:#0e0c12;box-shadow:inset 0 0 0 1px #3c3444;overflow:hidden}
.lb-rw-prog i{display:block;height:100%;background:var(--c)}
.lb-btn-sm{min-height:40px;padding:0 12px;font-size:12px;flex:none}
.lb-btn-gold{flex:none;min-height:42px;padding:0 16px;font-size:14px;background:linear-gradient(#ffd25a,#c7861b);box-shadow:inset 0 0 0 2px #fff0b0,0 4px 0 #5a3a0a;color:#2a1608}
.lb-rw-quest{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:46px;padding:6px 14px;border-radius:10px;
  border:2px solid #8a57d6;background:linear-gradient(rgba(138,87,214,.28),rgba(138,87,214,.12));color:#efe4ff;font-family:'Silkscreen',monospace;font-size:13px;
  letter-spacing:.02em;text-align:left;cursor:pointer;touch-action:manipulation}
.lb-rw-quest span{color:#c79bff;font-size:16px}
.lb-rw-quest:focus-visible,.lb-rw-step:focus-visible,.lb-rw-link:focus-visible{outline:3px solid #fff;outline-offset:2px}
.lb-rw{align-items:center}
.lb-rw .lb-frame{text-align:center}
.lb-rw-big{margin:4px 0 2px;font-family:'Silkscreen',monospace;font-weight:700;font-size:clamp(30px,9vw,40px);letter-spacing:.03em;color:#ffe08a;text-shadow:0 3px 0 #1a0d0f}
.lb-rw-p{margin:0 0 12px;font-size:14.5px;line-height:1.35;color:#d8d0e2}
.lb-rw-form{display:grid;gap:6px;text-align:left;margin-top:4px}
.lb-rw-lbl{font-family:'Silkscreen',monospace;font-size:11px;letter-spacing:.06em;color:#a99fb4;margin-top:4px}
.lb-rw-in{width:100%;min-height:48px;padding:0 12px;border-radius:9px;border:2px solid #0c0a10;background:#100d14;color:#fff;box-shadow:inset 0 0 0 2px #3c3444;
  font-family:'Pixelify Sans',system-ui,sans-serif !important;font-size:17px;-webkit-user-select:text;user-select:text;pointer-events:auto;outline:none}
.lb-rw-in:focus{box-shadow:inset 0 0 0 2px #f5c447}
.lb-rw-in::placeholder{color:#6d6477}
.lb-rw-check{display:flex;align-items:flex-start;gap:10px;margin:6px 0 2px;font-size:13px;line-height:1.35;color:#cfc6da;cursor:pointer;pointer-events:auto}
.lb-rw-check input{flex:none;width:22px;height:22px;margin:0;accent-color:#f5c447;pointer-events:auto}
.lb-rw-err{min-height:1.2em;margin:2px 0;font-size:13px;color:#ff9a9a}
.lb-rw-err:empty{min-height:0;margin:0}
.lb-rw-submit{width:100%;font-size:16px;margin-top:4px}
.lb-rw-submit:disabled{filter:grayscale(.6) brightness(.8);cursor:default}
.lb-rw-submit.is-busy{animation:lbBlink .8s ease-in-out infinite}
.lb-rw-link{display:block;margin:10px auto 0;min-height:40px;padding:0 14px;border:0;background:none;color:#a99fb4;font-family:'Silkscreen',monospace;font-size:12px;
  letter-spacing:.06em;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.lb-rw-terms{margin:10px 0 0;font-size:11.5px;line-height:1.35;color:#7f768a}
.lb-rw-note{margin:4px 0 0;font-size:12px;line-height:1.35;color:#a99fb4;text-align:center}
.lb-rw-msg{margin:4px 0 10px;font-size:14px;color:#9dffb0}
.lb-rw-wide{width:100%;margin-top:4px}
.lb-rw-acts{margin-top:10px}
.lb-rw .lb-rw-quest{margin-top:8px}
.lb-coupon{position:relative;margin:0 0 10px;padding:12px 12px 12px;border-radius:12px;background:var(--c);color:#16121d;text-align:center;
  box-shadow:0 4px 0 rgba(0,0,0,.4)}
.lb-coupon::before,.lb-coupon::after{content:"";position:absolute;top:50%;width:18px;height:18px;margin-top:-9px;border-radius:50%;background:#1f1a25}
.lb-coupon::before{left:-9px}.lb-coupon::after{right:-9px}
.lb-coupon.is-dead{filter:grayscale(1) brightness(.7)}
.lb-coupon-top{display:flex;align-items:baseline;justify-content:center;gap:10px}
.lb-coupon-top b{font-family:'Silkscreen',monospace;font-size:28px}
.lb-coupon-top span{font-family:'Silkscreen',monospace;font-size:11px;letter-spacing:.1em}
.lb-coupon-code{margin:8px 0 6px;padding:12px 4px;border-radius:8px;background:#16121d;color:#fff;font-family:'Silkscreen',monospace;font-weight:700;
  font-size:clamp(14px,4.6vw,21px);letter-spacing:.02em;white-space:nowrap;-webkit-user-select:all;user-select:all;pointer-events:auto}
.lb-coupon-meta{margin:0;font-size:12px;line-height:1.35}
.lb-coupon-status{margin:4px 0 0;font-family:'Silkscreen',monospace;font-size:11px;letter-spacing:.04em}
.lb-coupon-acts{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
.lb-coupon-acts .lb-btn{background:linear-gradient(#2c2633,#16131b);box-shadow:inset 0 0 0 2px #51465a,0 3px 0 rgba(0,0,0,.45);color:#fff}
.lb-rw-steps{list-style:none;margin:0 0 6px;padding:0;display:grid;gap:6px}
.lb-rw-step{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:6px 12px 6px 8px;border-radius:10px;border:2px solid #0c0a10;background:#1d1922;
  box-shadow:inset 0 0 0 1px #3c3444;color:#f4efe2;font-family:'Pixelify Sans',sans-serif;font-size:14.5px;text-align:left;cursor:pointer;touch-action:manipulation}
.lb-rw-step i{flex:0 0 28px;height:28px;display:grid;place-items:center;border-radius:6px;background:#3a3242;font-family:'Silkscreen',monospace;font-style:normal;font-size:13px;color:#cfc6da}
.lb-rw-step span{flex:1;min-width:0}
.lb-rw-step small{display:block;font-size:12px;color:#a99fb4}
.lb-rw-step em{font-style:normal;color:#8d8496}
.lb-rw-step.is-done{box-shadow:inset 0 0 0 2px #6fdc5a;background:#16241a}
.lb-rw-step.is-done i{background:#6fdc5a;color:#16121d}
@keyframes lbGlow{50%{box-shadow:inset 0 0 0 2px #fff0b0,0 0 26px rgba(245,196,71,.55)}}

@keyframes lbPunch{0%{opacity:1;transform:scale(1.5)}100%{opacity:1;transform:scale(1)}}
@keyframes lbBanner{0%{opacity:0;transform:translate(-50%,-50%) scale(1.6)}15%{opacity:1;transform:translate(-50%,-50%) scale(1)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%) scale(1)}}
@keyframes lbCount{0%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}20%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(.9)}}
@keyframes lbToast{0%{opacity:0;transform:translate(-50%,-10px)}10%,80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-6px)}}
@keyframes lbClick{0%{opacity:1;transform:scale(.82)}18%{transform:scale(1)}70%{opacity:1}100%{opacity:0}}
@keyframes lbRise{0%{opacity:0;transform:translateY(30px) scale(.96)}100%{opacity:1;transform:none}}
@keyframes lbBlink{50%{opacity:.35}}
@keyframes lbPulse{50%{box-shadow:0 0 22px var(--c)}}
@keyframes lbHue{to{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){.lb-root *{animation-duration:.01ms !important;animation-iteration-count:1 !important}}
@media (max-height:600px){.lb-how li{font-size:13px}.lb-frame{padding-top:26px}}
`;
export {
  LabContext,
  LootBreakGame,
  Observable,
  TIERS
};
