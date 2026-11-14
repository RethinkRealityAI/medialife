/**
 * A paintable's scene on the studio stage: the models, pictures and video placed around the print
 * (`scene` on /api/spray/sets, see src/lib/spray/model.ts in the site), shown around the card while painting
 * and edited in place in Arrange mode (src/arrange/).
 *
 * One coordinate system everywhere (the admin scene editor, the Studio, the share viewer, the AR page): the
 * origin is the centre of the 3:4 print, x right, y up, z out of the print towards the viewer, MILLIMETRES of
 * the real print, rotations in degrees (XYZ order). The layer's group is scaled by cardHeight / heightMm,
 * so a child of the card's group lands exactly as placed.
 *
 * Normalisation (as the admin editor's README says): a model's box is measured as loaded, before any
 * animation; height = size (a flat model: its largest side), the box centre lands on pos, rot turns about
 * it. Pictures and video are planes `size * aspect` wide and `size` tall.
 *
 * Scene items are never paintable and never block painting: every object under the group gets a no-op
 * `raycast` (the painter's and the stamp tool's raycasts skip them even when they sit in front of the card) and
 * `userData.sceneItem = true`. Arrange mode picks items with `pick()`, which tests each item's own box. A
 * failed asset is skipped with a console warning.
 *
 * `SceneLayer.set(items)` updates the stage in place: an item's body (its loaded file) is rebuilt only when
 * its file, kind, aspect, clip or sound change; position, turn, size and visibility just move it.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type SceneItem = {
  id: string;
  kind: 'model' | 'image' | 'video';
  name: string;
  file: string;
  pos: [number, number, number];
  rot: [number, number, number];
  size: number;
  aspect: number | null;
  clip: string | null;
  sound: boolean;
  visible: boolean;
};

/** What is known about a file: a model's box in its own units, clips, triangles. */
export type FileInfo = { box?: { w: number; h: number; d: number }; clips?: string[]; tris?: number; error?: string };

const KINDS = new Set(['model', 'image', 'video']);
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const trio = (a: unknown) => [0, 1, 2].map((i) => num(Array.isArray(a) ? a[i] : 0, 0)) as [number, number, number];
const noRaycast = () => {};
const ACCENT = 0xf6c344;

let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}
const gltfs = new Map<string, Promise<GLTF>>();
/** A GLB by URL, loaded once per page (each item gets its own clone). */
export function loadGltf(url: string): Promise<GLTF> {
  let p = gltfs.get(url);
  if (!p) {
    p = gltfLoader().loadAsync(url);
    p.catch(() => gltfs.delete(url));
    gltfs.set(url, p);
  }
  return p;
}
/** After an upload: reuse the parsed local file instead of downloading it again. */
export function primeGltf(url: string, gltf: GLTF) {
  gltfs.set(url, Promise.resolve(gltf));
}
const imgLoader = new THREE.ImageLoader();
imgLoader.setCrossOrigin('anonymous');

/** Keeps every object under `o` out of raycasts (painting goes through scene items to the card). */
export function inert(o: THREE.Object3D) {
  o.traverse((c) => {
    c.raycast = noRaycast;
    c.userData.sceneItem = true;
  });
}

// sound: videos marked `sound` unmute after the first tap or key (browsers allow it only then)
let heard = false;
const soundVideos = new Set<HTMLVideoElement>();
function onHeard() {
  heard = true;
  for (const v of soundVideos) {
    v.muted = false;
    if (v.paused) void v.play().catch(() => {});
  }
  for (const t of ['pointerup', 'touchend', 'keydown']) removeEventListener(t, onHeard, true);
}
if (typeof window !== 'undefined') for (const t of ['pointerup', 'touchend', 'keydown']) addEventListener(t, onHeard, true);

// videos pause while their card is off the stage (another paintable chosen) and play again when it is back
const watched = new Map<HTMLVideoElement, { seen: number }>();
let watchTimer = 0;
function watch(v: HTMLVideoElement, plane: THREE.Mesh) {
  const w = { seen: performance.now() };
  watched.set(v, w);
  plane.onBeforeRender = () => {
    w.seen = performance.now();
    if (v.paused && !document.hidden) void v.play().catch(() => {});
  };
  if (!watchTimer)
    watchTimer = window.setInterval(() => {
      const now = performance.now();
      for (const [vid, s] of watched) if (!vid.paused && now - s.seen > 800) vid.pause();
    }, 500);
}

type Body = { obj: THREE.Object3D; dispose: () => void };

/** A unit-tall plane (aspect wide), scaled by the item's size outside. */
function plane(tex: THREE.Texture, aspect: number) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  // transparent PNG / WebP keep their alpha; alphaTest keeps the clear parts out of the depth buffer
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(a, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

async function makeModel(it: SceneItem, onInfo: (info: FileInfo) => void): Promise<Body> {
  const gltf = await loadGltf(it.file);
  // normalise in the rest pose, to a height of 1: the bounding-box centre on the origin
  const scene = cloneSkinned(gltf.scene);
  const inner = new THREE.Group();
  inner.add(scene);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const d = box.getSize(new THREE.Vector3());
  const h = d.y > 1e-9 ? d.y : Math.max(d.x, d.y, d.z); // a flat model: its largest side (as the editor does)
  if (!(h > 1e-9)) throw new Error('empty model');
  inner.scale.setScalar(1 / h);
  inner.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1 / h);
  const meshes: THREE.Mesh[] = [];
  let tris = 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.frustumCulled = false;
      m.castShadow = true;
      meshes.push(m);
      const g = m.geometry;
      tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
    }
  });
  onInfo({ box: { w: d.x, h: d.y, d: d.z }, clips: gltf.animations.map((a) => a.name).filter(Boolean), tris: Math.round(tris) });
  let mixer: THREE.AnimationMixer | null = null;
  if (it.clip) {
    const clip = THREE.AnimationClip.findByName(gltf.animations || [], it.clip);
    if (clip && meshes.length) {
      mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
      // ticks while it is drawn (a mesh's onBeforeRender), from the time since its last tick
      let last = performance.now();
      const m = mixer;
      meshes[0].onBeforeRender = () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (dt > 0) m.update(dt);
      };
    } else console.warn('[scene] no clip', it.clip, 'in', it.file);
  }
  return { obj: inner, dispose: () => mixer?.stopAllAction() };
}

function makeImage(it: SceneItem): Promise<Body> {
  return new Promise((res, rej) =>
    imgLoader.load(
      it.file,
      (img) => {
        const t = new THREE.Texture(img);
        t.needsUpdate = true;
        const mesh = plane(t, num(it.aspect, 0) > 0 ? Number(it.aspect) : img.naturalWidth / img.naturalHeight);
        res({
          obj: mesh,
          dispose: () => {
            t.dispose();
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
          },
        });
      },
      undefined,
      rej,
    ),
  );
}

function makeVideo(it: SceneItem): Promise<Body> {
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.autoplay = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.addEventListener(
      'loadeddata',
      () => {
        const tex = new THREE.VideoTexture(v);
        const mesh = plane(
          tex,
          num(it.aspect, 0) > 0 ? Number(it.aspect) : v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9,
        );
        if (it.sound) {
          soundVideos.add(v);
          if (heard) v.muted = false;
        }
        watch(v, mesh);
        res({
          obj: mesh,
          dispose: () => {
            soundVideos.delete(v);
            watched.delete(v);
            v.pause();
            v.removeAttribute('src');
            v.load();
            tex.dispose();
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
          },
        });
      },
      { once: true },
    );
    v.addEventListener('error', () => rej(new Error(`video ${it.file}`)), { once: true });
    v.src = it.file;
    v.load();
    void v.play().catch(() => {});
  });
}

/** The visible, well-formed items of a paintable's scene (missing = none). */
export function sceneOf(p: object): SceneItem[] {
  return allSceneOf(p).filter((it) => it.visible !== false);
}
/** Every well-formed item, hidden ones too (Arrange mode edits them all). */
export function allSceneOf(p: object): SceneItem[] {
  const raw = (p as { scene?: unknown }).scene;
  const s = Array.isArray(raw) ? (raw as SceneItem[]) : [];
  return s.filter((it) => it && KINDS.has(it.kind) && typeof it.file === 'string' && !!it.file && num(it.size, 0) > 0);
}

/** The item's size in millimetres along its own width, height and depth (before turning). */
export function itemDims(item: SceneItem, info?: FileInfo) {
  if (item.kind === 'model') {
    const b = info?.box;
    if (!b) return { w: item.size, h: item.size, d: item.size };
    const h = b.h > 1e-6 ? b.h : Math.max(b.w, b.d, 1e-6);
    const s = item.size / h;
    return { w: b.w * s, h: b.h * s, d: b.d * s };
  }
  return { w: item.size * (item.aspect ?? 1), h: item.size, d: 0 };
}

const bodyKey = (it: SceneItem) => `${it.kind}|${it.file}|${it.aspect ?? ''}|${it.clip ?? ''}|${it.sound ? 1 : 0}`;

type Entry = {
  item: SceneItem;
  holder: THREE.Group;
  scaler: THREE.Group;
  key: string;
  body: Body | null;
  /** Bumped when the body is rebuilt, so a late load of an old body is dropped. */
  gen: number;
};

function wireBox(w: number, h: number, d: number, color = ACCENT, opacity = 0.95) {
  const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity }));
  m.renderOrder = 999;
  m.frustumCulled = false;
  return m;
}
function disposeLines(o: THREE.LineSegments | null) {
  if (!o) return;
  o.removeFromParent();
  o.geometry.dispose();
  (o.material as THREE.Material).dispose();
}

export class SceneLayer {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  /** Per file: what was measured (models) or told (the asset library). */
  readonly info = new Map<string, FileInfo>();
  /** Called when a file's info arrives (a model finished loading). */
  onInfo: ((file: string) => void) | null = null;
  private selBox: THREE.LineSegments | null = null;
  private selKey = '';
  private selected: string | null = null;
  private previewBox: THREE.LineSegments | null = null;
  private previewKey = '';

  constructor(
    readonly cardHeight: number,
    readonly heightMm: number,
  ) {
    this.group.name = 'spray-scene';
    this.group.scale.setScalar(cardHeight / (heightMm > 0 ? heightMm : cardHeight));
    inert(this.group);
  }

  get items(): SceneItem[] {
    return [...this.entries.values()].map((e) => e.item);
  }

  setInfo(file: string, info: FileInfo) {
    this.info.set(file, { ...this.info.get(file), ...info });
  }

  /** Shows exactly these items (in place: unchanged files are not loaded again). */
  set(items: SceneItem[]) {
    const keep = new Set(items.map((it) => it.id));
    for (const [id, e] of this.entries) {
      if (keep.has(id)) continue;
      e.body?.dispose();
      e.holder.removeFromParent();
      this.entries.delete(id);
    }
    items.forEach((it, i) => {
      let e = this.entries.get(it.id);
      if (!e) {
        const holder = new THREE.Group();
        const scaler = new THREE.Group();
        holder.add(scaler);
        holder.name = `scene-${it.id || i}`;
        inert(holder);
        this.group.add(holder);
        e = { item: it, holder, scaler, key: '', body: null, gen: 0 };
        this.entries.set(it.id, e);
      }
      e.item = it;
      const p = trio(it.pos);
      const r = trio(it.rot).map(THREE.MathUtils.degToRad);
      e.holder.position.set(p[0], p[1], p[2]);
      e.holder.rotation.set(r[0], r[1], r[2], 'XYZ');
      e.holder.visible = it.visible !== false;
      e.scaler.scale.setScalar(Math.max(num(it.size, 1), 1e-3));
      const key = bodyKey(it);
      if (key !== e.key) this.rebuild(e, key);
    });
    this.refreshHelpers();
  }

  private rebuild(e: Entry, key: string) {
    e.key = key;
    e.body?.dispose();
    e.body?.obj.removeFromParent();
    e.body = null;
    const gen = ++e.gen;
    const it = e.item;
    const made =
      it.kind === 'model'
        ? makeModel(it, (info) => {
            this.setInfo(it.file, info);
            this.onInfo?.(it.file);
          })
        : it.kind === 'image'
          ? makeImage(it)
          : makeVideo(it);
    made
      .then((body) => {
        if (gen !== e.gen || this.entries.get(e.item.id) !== e) {
          body.dispose();
          return;
        }
        inert(body.obj);
        e.body = body;
        e.scaler.add(body.obj);
        this.refreshHelpers();
      })
      .catch((err) => {
        console.warn('[scene] skipped', it.file, err);
        if (it.kind === 'model') {
          this.setInfo(it.file, { error: 'Couldn’t load this file.' });
          this.onInfo?.(it.file);
        }
      });
  }

  /** Item size in mm (width, height, depth), from what is known about its file. */
  dims(item: SceneItem) {
    return itemDims(item, this.info.get(item.file));
  }

  /** The outline around the selected item (Arrange mode); null hides it. */
  select(id: string | null) {
    this.selected = id;
    this.refreshHelpers();
  }

  private refreshHelpers() {
    const e = this.selected ? this.entries.get(this.selected) : undefined;
    if (!e || e.item.visible === false) {
      disposeLines(this.selBox);
      this.selBox = null;
      this.selKey = '';
      return;
    }
    const d = this.dims(e.item);
    // a little outside the item, and planes get a little depth so the box reads
    const pad = Math.max(d.w, d.h) * 0.03;
    const key = `${e.item.id}|${d.w.toFixed(2)}|${d.h.toFixed(2)}|${d.d.toFixed(2)}`;
    if (key !== this.selKey || this.selBox?.parent !== e.holder) {
      disposeLines(this.selBox);
      this.selBox = wireBox(d.w + pad * 2, d.h + pad * 2, d.d + pad * 2);
      inert(this.selBox);
      e.holder.add(this.selBox);
      this.selKey = key;
    }
  }

  /** The drop preview: a box of `dims` (mm) at `pos`, or null to hide it. */
  preview(pos: [number, number, number] | null, dims?: { w: number; h: number; d: number }) {
    if (!pos || !dims) {
      disposeLines(this.previewBox);
      this.previewBox = null;
      this.previewKey = '';
      return;
    }
    const key = `${dims.w}|${dims.h}|${dims.d}`;
    if (key !== this.previewKey || !this.previewBox) {
      disposeLines(this.previewBox);
      this.previewBox = wireBox(dims.w, dims.h, Math.max(dims.d, 0.5), 0xffffff, 0.9);
      inert(this.previewBox);
      this.group.add(this.previewBox);
      this.previewKey = key;
    }
    this.previewBox.position.set(pos[0], pos[1], pos[2]);
  }

  /**
   * The nearest visible item a ray (world space) passes through, by each item's own box. When `prefer` (the
   * selected item) is among those hit it wins, so an item partly behind another can still be dragged.
   */
  pick(ray: THREE.Ray, prefer?: string | null): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    const inv = new THREE.Matrix4();
    const local = new THREE.Ray();
    const hit = new THREE.Vector3();
    this.group.updateMatrixWorld(true);
    for (const [id, e] of this.entries) {
      if (e.item.visible === false) continue;
      const d = this.dims(e.item);
      const t = Math.max(d.w, d.h) * 0.04; // planes have no depth: give them some, for fingers too
      const box = new THREE.Box3(
        new THREE.Vector3(-d.w / 2, -d.h / 2, -Math.max(d.d, t) / 2),
        new THREE.Vector3(d.w / 2, d.h / 2, Math.max(d.d, t) / 2),
      );
      inv.copy(e.holder.matrixWorld).invert();
      local.copy(ray).applyMatrix4(inv);
      if (!local.intersectBox(box, hit)) continue;
      hit.applyMatrix4(e.holder.matrixWorld);
      if (id === prefer) return id;
      const dist = hit.distanceTo(ray.origin);
      if (dist < bestD) {
        bestD = dist;
        best = id;
      }
    }
    return best;
  }

  /** World point -> the scene's millimetres. */
  toMm(world: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    return this.group.worldToLocal(world.clone());
  }
  /** The plane z = zMm (in the scene's millimetres) in world space. */
  planeAt(zMm: number, normalMm = new THREE.Vector3(0, 0, 1)) {
    this.group.updateMatrixWorld(true);
    const p = this.group.localToWorld(new THREE.Vector3(0, 0, zMm));
    const n = normalMm.clone().transformDirection(this.group.matrixWorld);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n, p);
  }

  dispose() {
    for (const e of this.entries.values()) e.body?.dispose();
    this.entries.clear();
    disposeLines(this.selBox);
    disposeLines(this.previewBox);
  }
}

/** Every built paintable's scene layer, by the paintable's CMS id (Arrange mode edits them live). */
const layers = new Map<string, SceneLayer>();
export const getSceneLayer = (paintableId: string) => layers.get(paintableId);

/**
 * The scene layer for a card `cardHeight` units tall standing for a print `heightMm` tall: add its group to
 * the card's group (the card centred on the origin, facing +z). Items load in the background and appear as
 * they arrive. Always made (empty too), so items can be added later.
 */
export function buildSceneLayer(paintableId: string, items: SceneItem[], cardHeight: number, heightMm: number) {
  layers.get(paintableId)?.dispose();
  const layer = new SceneLayer(cardHeight, heightMm);
  layer.set(items);
  layers.set(paintableId, layer);
  return layer;
}
