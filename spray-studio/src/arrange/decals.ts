/**
 * Decals on the Studio's card: the same library and the same rules as the AR page
 * (public/evade/spray-bobo/main.js, "decals"), so a decal stuck on here sits in the same place there and in
 * the share viewer.
 *
 *   - The library is /evade/spray-bobo/decals/decals.json (cats Wear / Fun / EVADE).
 *   - A decal is kept in the picture's frame: u, v = its middle as fractions of the picture (v down),
 *     w = its width as a share of the picture's width, r = turn in radians (counter-clockwise),
 *     f = 1, or -1 when mirrored. Saved with the painting as `decals` (back to front).
 *   - Its art is drawn once into a canvas, with a white die-cut edge for `border` stickers; the drawn
 *     width is w * pictureWidth * grow (grow: the edge's extra width), height width / aspect.
 *   - "Wear" decals carry `fit`: a placement drawn for Bobo. It is used on Bobo only (the AR page checks
 *     the piece is bobo); a same-`slot` decal there swaps the old one. Anything else lands near the
 *     middle of the stencil, a little turned, never right on top of the last one.
 *
 * The decals ride the card as flat planes just in front of the print, never in the painter's way
 * (no-op raycast), and are picked by `pick()`.
 */
import * as THREE from 'three';
import { cards } from '../paint/sprayModel';

export const DECAL_BASE = '/evade/spray-bobo/decals/';
/** Same limit as the server (MAX_DECALS in the site model) and the AR page. */
export const MAX_DECALS = 14;

export type Decal = { id: string; u: number; v: number; w: number; r: number; f: 1 | -1 };
export type DecalDef = {
  id: string;
  name: string;
  cat: string;
  file: string;
  aspect: number;
  word: string;
  border: boolean;
  fit?: { u: number; v: number; w: number; r: number };
  slot?: string;
};
export type DecalLibrary = { cats: { k: string; n: string }[]; decals: DecalDef[]; by: Record<string, DecalDef> };

let lib: Promise<DecalLibrary> | null = null;
export function loadDecalLibrary(): Promise<DecalLibrary> {
  if (!lib)
    lib = fetch(`${DECAL_BASE}decals.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`decals ${r.status}`))))
      .then((m: { cats: DecalLibrary['cats']; decals: DecalDef[] }) => ({
        cats: m.cats,
        decals: m.decals,
        by: Object.fromEntries(m.decals.map((d) => [d.id, d])),
      }))
      .catch((e) => {
        lib = null;
        throw e;
      });
  return lib;
}

export type DecalArt = {
  canvas: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  aspect: number;
  grow: number;
  solid: (u: number, v: number) => boolean;
};
const arts = new Map<string, Promise<DecalArt>>();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The decal's picture, drawn once into a canvas (with a white die-cut edge for the stickers). */
export function decalArt(d: DecalDef): Promise<DecalArt> {
  const have = arts.get(d.id);
  if (have) return have;
  const p = new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = DECAL_BASE + d.file;
  }).then((img) => {
    const iw = img.naturalWidth || img.width || 256,
      ih = img.naturalHeight || img.height || 256,
      k = 512 / Math.max(iw, ih);
    const w = Math.round(iw * k),
      h = Math.round(ih * k),
      pad = d.border ? Math.round(Math.max(w, h) * 0.05) : 2;
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const g = c.getContext('2d')!;
    if (d.border) {
      const t = document.createElement('canvas');
      t.width = w;
      t.height = h;
      const tg = t.getContext('2d')!;
      tg.drawImage(img, 0, 0, w, h);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = '#ffffff';
      tg.fillRect(0, 0, w, h);
      for (let a = 0; a < 16; a++) g.drawImage(t, pad + Math.cos(a * 0.3927) * pad * 0.92, pad + Math.sin(a * 0.3927) * pad * 0.92);
    }
    g.drawImage(img, pad, pad, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    let alpha: Uint8ClampedArray | null = null;
    return {
      canvas: c,
      tex,
      aspect: c.width / c.height,
      grow: c.width / w,
      solid(u: number, v: number) {
        try {
          alpha = alpha || g.getImageData(0, 0, c.width, c.height).data;
        } catch {
          return true;
        }
        const x = clamp(Math.floor(u * c.width), 0, c.width - 1),
          y = clamp(Math.floor((1 - v) * c.height), 0, c.height - 1);
        return alpha[(y * c.width + x) * 4 + 3] > 24;
      },
    };
  });
  p.catch(() => arts.delete(d.id));
  arts.set(d.id, p);
  return p;
}

const centres = new Map<string, Promise<[number, number]>>();
/** The middle of the paintable stencil (uv, v down), from the mask's alpha, as the AR page measures it. */
export function maskCentre(maskUrl: string): Promise<[number, number]> {
  let p = centres.get(maskUrl);
  if (!p) {
    p = new Promise<[number, number]>((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 48;
          c.height = 64;
          const g = c.getContext('2d', { willReadFrequently: true })!;
          g.drawImage(img, 0, 0, 48, 64);
          const a = g.getImageData(0, 0, 48, 64).data;
          let x = 0,
            y = 0,
            n = 0;
          for (let i = 0; i < 48 * 64; i++)
            if (a[i * 4 + 3] > 127) {
              x += i % 48;
              y += Math.floor(i / 48);
              n++;
            }
          res(n ? [(x / n + 0.5) / 48, (y / n + 0.5) / 64] : [0.5, 0.5]);
        } catch {
          res([0.5, 0.5]);
        }
      };
      img.onerror = () => res([0.5, 0.5]);
      img.src = maskUrl;
    });
    centres.set(maskUrl, p);
  }
  return p;
}

/**
 * Where a new decal goes, as the AR page decides: `fit` on Bobo (swapping a same-slot one), otherwise near
 * the stencil's middle (or at `at`), a little turned. Returns the decal and the index it replaces (or -1).
 */
export function placeDecal(
  d: DecalDef,
  list: Decal[],
  by: Record<string, DecalDef>,
  piece: string,
  centre: [number, number],
  at?: [number, number],
): { decal: Decal; swap: number } {
  if (d.fit && piece === 'bobo' && !at) {
    const swap = list.findIndex((x) => by[x.id]?.slot && by[x.id].slot === d.slot);
    return { decal: { id: d.id, u: d.fit.u, v: d.fit.v, w: d.fit.w, r: d.fit.r, f: 1 }, swap };
  }
  const n = list.length,
    a = n * 2.4;
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const [u, v] = at ?? [centre[0] + (n ? Math.cos(a) * 0.14 : 0), centre[1] + (n ? Math.sin(a) * 0.12 : 0)];
  return {
    decal: { id: d.id, u: r4(clamp(u, -0.1, 1.1)), v: r4(clamp(v, -0.1, 1.1)), w: d.fit ? 0.46 : 0.3, r: Math.round((Math.random() - 0.5) * 350) / 1000, f: 1 },
    swap: -1,
  };
}

const GEO = new THREE.PlaneGeometry(1, 1);
const noRaycast = () => {};

type Slot = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; id: string; art: DecalArt | null };

/** The decals on one card. `set()` shows exactly a list (back to front), in place. */
export class DecalLayer {
  readonly group = new THREE.Group();
  private slots: Slot[] = [];
  private outline: THREE.LineLoop | null = null;
  private list: Decal[] = [];
  private selected: number | null = null;
  private by: Record<string, DecalDef> = {};

  constructor(
    readonly W: number,
    readonly H: number,
  ) {
    this.group.name = 'spray-decals';
    this.group.position.z = H * 0.0015;
    this.group.raycast = noRaycast;
    void loadDecalLibrary().then((l) => {
      this.by = l.by;
      this.set(this.list, this.selected);
    });
  }

  get decals() {
    return this.list;
  }

  set(list: Decal[], selected: number | null) {
    this.list = list;
    this.selected = selected;
    while (this.slots.length > list.length) {
      const s = this.slots.pop()!;
      s.mesh.removeFromParent();
      s.mesh.material.dispose();
    }
    list.forEach((d, i) => {
      let s = this.slots[i];
      if (!s) {
        const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: 0.02, toneMapped: false });
        const mesh = new THREE.Mesh(GEO, mat);
        mesh.raycast = noRaycast;
        mesh.frustumCulled = false;
        mesh.visible = false;
        mesh.userData.sceneItem = true;
        this.group.add(mesh);
        s = { mesh, id: '', art: null };
        this.slots[i] = s;
      }
      s.mesh.renderOrder = 20 + i;
      if (s.id !== d.id) {
        s.id = d.id;
        s.art = null;
        s.mesh.visible = false;
        const def = this.by[d.id];
        if (def) {
          const slot = s;
          void decalArt(def).then((art) => {
            if (slot.id !== def.id) return;
            slot.art = art;
            slot.mesh.material.map = art.tex;
            slot.mesh.material.needsUpdate = true;
            slot.mesh.visible = true;
            this.place(this.slots.indexOf(slot));
          });
        }
      }
      this.place(i);
    });
    this.drawOutline();
  }

  private place(i: number) {
    const s = this.slots[i];
    const d = this.list[i];
    if (!s || !d || !s.art) return;
    const ww = d.w * this.W * s.art.grow;
    s.mesh.position.set((d.u - 0.5) * this.W, (0.5 - d.v) * this.H, 0);
    s.mesh.rotation.set(0, 0, d.r);
    s.mesh.scale.set(ww * d.f, ww / s.art.aspect, 1);
  }

  private drawOutline() {
    const s = this.selected != null ? this.slots[this.selected] : null;
    if (!s) {
      this.outline?.removeFromParent();
      return;
    }
    if (!this.outline) {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, 0),
        new THREE.Vector3(0.5, -0.5, 0),
        new THREE.Vector3(0.5, 0.5, 0),
        new THREE.Vector3(-0.5, 0.5, 0),
      ]);
      this.outline = new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: 0xf6c344, depthTest: false, transparent: true }));
      this.outline.renderOrder = 999;
      this.outline.raycast = noRaycast;
      this.outline.frustumCulled = false;
    }
    if (this.outline.parent !== s.mesh) s.mesh.add(this.outline);
  }

  /** Index of the top decal a world ray hits: the top one with art under it, else the top one whose box it's in. */
  pick(ray: THREE.Ray): number | null {
    const inv = new THREE.Matrix4();
    const local = new THREE.Ray();
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.group.updateMatrixWorld(true);
    let boxHit: number | null = null;
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (!s.art || !s.mesh.visible) continue;
      inv.copy(s.mesh.matrixWorld).invert();
      local.copy(ray).applyMatrix4(inv);
      if (!local.intersectPlane(plane, hit)) continue;
      if (Math.abs(hit.x) > 0.5 || Math.abs(hit.y) > 0.5) continue;
      if (s.art.solid(hit.x + 0.5, hit.y + 0.5)) return i;
      if (boxHit == null) boxHit = i;
    }
    return boxHit;
  }

  /** A world ray -> picture uv (v down) on the card's plane, or null. */
  uvAt(ray: THREE.Ray): [number, number] | null {
    this.group.updateMatrixWorld(true);
    const parent = this.group.parent;
    if (!parent) return null;
    const n = new THREE.Vector3(0, 0, 1).transformDirection(parent.matrixWorld);
    const p = new THREE.Vector3().setFromMatrixPosition(this.group.matrixWorld);
    const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p), new THREE.Vector3());
    if (!hit) return null;
    const l = parent.worldToLocal(hit);
    return [l.x / this.W + 0.5, 0.5 - l.y / this.H];
  }

  /** Corners of decal i in world space (for the on-screen handle). */
  corners(i: number): THREE.Vector3[] | null {
    const s = this.slots[i];
    if (!s?.art) return null;
    s.mesh.updateMatrixWorld(true);
    return [
      [-0.5, 0.5],
      [0.5, 0.5],
      [0.5, -0.5],
      [-0.5, -0.5],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(s.mesh.matrixWorld));
  }
  centreWorld(i: number) {
    const s = this.slots[i];
    if (!s) return null;
    s.mesh.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(s.mesh.matrixWorld);
  }
}

const layers = new Map<string, DecalLayer>();
/** The decal layer on a built card (made on first use). */
export function getDecalLayer(paintableId: string): DecalLayer | null {
  const c = cards.get(paintableId);
  if (!c) return null;
  let l = layers.get(paintableId);
  if (!l) {
    l = new DecalLayer(c.W, c.H);
    layers.set(paintableId, l);
  }
  if (l.group.parent !== c.root) c.root.add(l.group);
  return l;
}

/** Draws decals onto a 2D picture of the print at (x, y, w, h), as the AR page's "art" image does. */
export async function drawDecals(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, list: Decal[]) {
  if (!list.length) return;
  const { by } = await loadDecalLibrary();
  for (const d of list) {
    const def = by[d.id];
    if (!def) continue;
    const art = await decalArt(def).catch(() => null);
    if (!art) continue;
    const ww = d.w * w * art.grow,
      hh = ww / art.aspect;
    g.save();
    g.translate(x + d.u * w, y + d.v * h);
    g.rotate(-d.r);
    g.scale(d.f, 1);
    g.drawImage(art.canvas, -ww / 2, -hh / 2, ww, hh);
    g.restore();
  }
}
