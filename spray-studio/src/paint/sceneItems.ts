/**
 * A paintable's scene on the studio stage: the models, pictures and video the admin placed around the print
 * (`scene` on /api/spray/sets, see src/lib/spray/model.ts in the site), shown around the card while painting.
 *
 * One coordinate system everywhere (the admin scene editor, the Studio, the share viewer, the AR page): the
 * origin is the centre of the 3:4 print, x right, y up, z out of the print towards the viewer, MILLIMETRES of
 * the real print, rotations in degrees (XYZ order). The group returned here is scaled by cardHeight / heightMm,
 * so a child of the card's group lands exactly as placed.
 *
 * Scene items are never paintable and never block painting: every object under the group gets a no-op
 * `raycast` (the painter's and the stamp tool's raycasts skip them even when they sit in front of the card) and
 * `userData.sceneItem = true`. A failed asset is skipped with a console warning.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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

const KINDS = new Set(['model', 'image', 'video']);
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const trio = (a: unknown) => [0, 1, 2].map((i) => num(Array.isArray(a) ? a[i] : 0, 0)) as [number, number, number];
const noRaycast = () => {};

let loader: GLTFLoader | null = null;
function gltfLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}
const imgLoader = new THREE.ImageLoader();

/** Keeps every object under `o` out of raycasts (painting goes through scene items to the card). */
function inert(o: THREE.Object3D) {
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

function plane(tex: THREE.Texture, aspect: number, size: number) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  // transparent PNG / WebP keep their alpha; alphaTest keeps the clear parts out of the depth buffer
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size * a, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, toneMapped: false }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

async function makeModel(it: SceneItem, size: number): Promise<THREE.Object3D> {
  const gltf = await gltfLoader().loadAsync(it.file);
  // normalise in the rest pose: height = size, the bounding-box centre on pos, rot about that centre (the holder)
  const inner = new THREE.Group();
  inner.add(gltf.scene);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const d = box.getSize(new THREE.Vector3());
  const h = d.y > 1e-9 ? d.y : Math.max(d.x, d.y, d.z); // a flat model: its largest side (as the editor does)
  if (!(h > 1e-9)) throw new Error('empty model');
  const s = size / h;
  inner.scale.setScalar(s);
  inner.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-s);
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.frustumCulled = false;
      m.castShadow = true;
      meshes.push(m);
    }
  });
  if (it.clip) {
    const clip = THREE.AnimationClip.findByName(gltf.animations || [], it.clip);
    if (clip && meshes.length) {
      const mixer = new THREE.AnimationMixer(gltf.scene);
      mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
      // ticks while it is drawn (a mesh's onBeforeRender), from the time since its last tick
      let last = performance.now();
      meshes[0].onBeforeRender = () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        if (dt > 0) mixer.update(dt);
      };
    } else console.warn('[scene] no clip', it.clip, 'in', it.file);
  }
  return inner;
}

function makeImage(it: SceneItem, size: number): Promise<THREE.Object3D> {
  return new Promise((res, rej) =>
    imgLoader.load(
      it.file,
      (img) => {
        const t = new THREE.Texture(img);
        t.needsUpdate = true;
        res(plane(t, num(it.aspect, 0) > 0 ? Number(it.aspect) : img.naturalWidth / img.naturalHeight, size));
      },
      undefined,
      rej,
    ),
  );
}

function makeVideo(it: SceneItem, size: number): Promise<THREE.Object3D> {
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
        const mesh = plane(
          new THREE.VideoTexture(v),
          num(it.aspect, 0) > 0 ? Number(it.aspect) : v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9,
          size,
        );
        if (it.sound) {
          soundVideos.add(v);
          if (heard) v.muted = false;
        }
        watch(v, mesh);
        res(mesh);
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
  const raw = (p as { scene?: unknown }).scene;
  const s = Array.isArray(raw) ? (raw as SceneItem[]) : [];
  return s.filter(
    (it) => it && it.visible !== false && KINDS.has(it.kind) && typeof it.file === 'string' && !!it.file && num(it.size, 0) > 0,
  );
}

/**
 * The scene group for a card `cardHeight` units tall standing for a print `heightMm` tall: add it to the
 * card's group (the card centred on the origin, facing +z). Items load in the background and appear as they
 * arrive. Returns null when there is nothing to show.
 */
export function buildSceneGroup(items: SceneItem[], cardHeight: number, heightMm: number): THREE.Group | null {
  if (!items.length) return null;
  const mm = cardHeight / (heightMm > 0 ? heightMm : cardHeight);
  const group = new THREE.Group();
  group.name = 'spray-scene';
  group.scale.setScalar(mm);
  inert(group);
  items.forEach((it, i) => {
    const holder = new THREE.Group();
    const p = trio(it.pos);
    const r = trio(it.rot).map(THREE.MathUtils.degToRad);
    holder.name = `scene-${it.id || i}`;
    holder.position.set(p[0], p[1], p[2]);
    holder.rotation.set(r[0], r[1], r[2], 'XYZ');
    inert(holder);
    group.add(holder);
    const size = Number(it.size);
    const made = it.kind === 'model' ? makeModel(it, size) : it.kind === 'image' ? makeImage(it, size) : makeVideo(it, size);
    made
      .then((obj) => {
        inert(obj);
        holder.add(obj);
      })
      .catch((err) => {
        console.warn('[scene] skipped', it.file, err);
        holder.removeFromParent();
      });
  });
  return group;
}
