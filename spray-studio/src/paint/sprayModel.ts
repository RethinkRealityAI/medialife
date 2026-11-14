/**
 * A Spray Bobo paintable as a 3D object on the studio stage: a flat card of the merch print (3:4) whose
 * paintable part (the CMS canvas overlay) takes the shared paint layer, with the overlay's outline lines
 * drawn over the paint, exactly as the AR page composites it on the real merch.
 *
 * The paint layer stays AiroHub's square 2048² canvas; the card's UVs use its middle 3:4 strip
 * (u 0.125..0.875) so paint dabs stay round. `exportPaint()` cuts that strip back out at 768x1024, the
 * Spray Bobo paint texture size, so a Studio painting lands in the same place on the real merch in AR.
 */
import * as THREE from 'three';
import type { SprayPaintable } from './objectCatalog';
import type { PaintUniforms } from './paintMaterial';
import { buildSceneGroup, sceneOf } from './sceneItems';

export const STRIP_X0 = 0.125;
export const STRIP_W = 0.75;
/** Base coat inside the canvas (Spray Bobo's "white base coat"). */
export const PRIMER = '#fbfaf5';

/** Shared toggles, flipped by the studio UI (outline lines on/off). */
export const sprayUniforms = { linesOn: { value: 1 } };

const texLoader = new THREE.TextureLoader();
const loadTex = (url: string, srgb: boolean) =>
  new Promise<THREE.Texture>((res, rej) =>
    texLoader.load(
      url,
      (t) => {
        t.flipY = false;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = 4;
        t.needsUpdate = true;
        res(t);
      },
      undefined,
      rej,
    ),
  );
const CLEAR = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export async function buildSprayModel(p: SprayPaintable, paintTexture: THREE.Texture | null, size = 11) {
  const [print, mask, lines] = await Promise.all([
    loadTex(p.files.print, true),
    loadTex(p.files.mask, false),
    p.files.lines ? loadTex(p.files.lines, true) : Promise.resolve(CLEAR),
  ]);
  const H = size,
    W = H * 0.75;
  // the card: picture uv (0..1, v down) mapped into the paint canvas's middle strip
  const geo = new THREE.PlaneGeometry(W, H, 1, 1);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, STRIP_X0 + uv.getX(i) * STRIP_W, 1 - uv.getY(i));
  uv.needsUpdate = true;

  const block: PaintUniforms = {
    paintMap: { value: paintTexture },
    primerMix: { value: 1 },
    primerColor: { value: new THREE.Color(PRIMER) },
    paintRoughness: { value: 0.62 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: THREE.FrontSide });
  // `vMapUv` only exists with a map: a 1x1 white one, the print is sampled below
  const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  white.needsUpdate = true;
  mat.map = white;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      paintMap: block.paintMap,
      primerMix: block.primerMix,
      primerColor: block.primerColor,
      printMap: { value: print },
      maskMap: { value: mask },
      linesMap: { value: lines },
      linesOn: sprayUniforms.linesOn,
    });
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D paintMap, printMap, maskMap, linesMap;
        uniform float primerMix, linesOn; uniform vec3 primerColor;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 picUv = vec2((vMapUv.x - ${STRIP_X0.toFixed(4)}) / ${STRIP_W.toFixed(4)}, vMapUv.y);
        float spM = texture2D(maskMap, picUv).a;
        vec3 spCol = texture2D(printMap, picUv).rgb;
        spCol = mix(spCol, primerColor, primerMix * spM);
        vec4 spPaint = texture2D(paintMap, vMapUv);
        spCol = mix(spCol, spPaint.rgb, spPaint.a * spM);
        vec4 spLine = texture2D(linesMap, picUv);
        spCol = mix(spCol, spLine.rgb, spLine.a * linesOn * spM);
        diffuseColor.rgb = spCol;`,
      );
  };
  mat.customProgramCacheKey = () => 'spray-card-v1';

  const card = new THREE.Mesh(geo, mat);
  card.name = 'spray-card';
  card.castShadow = true;
  card.receiveShadow = true;
  // a thin ink slab behind the print, so the card reads as a real object (not paintable)
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(W * 1.025, H * 1.02, H * 0.018),
    new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 0.5 }),
  );
  slab.position.z = -H * 0.0095;
  slab.raycast = () => {};
  slab.castShadow = true;
  const root = new THREE.Group();
  root.name = `spray-${p.id}`;
  root.add(slab, card);
  // the paintable's scene (models, pictures, video placed around the print, in millimetres): shown around the card,
  // never painted, never in the painter's way (paint/sceneItems.ts gives every scene object a no-op raycast)
  const scene = buildSceneGroup(sceneOf(p), H, p.heightMm);
  if (scene) root.add(scene);
  return { root, paintBlocks: [block], radius: Math.hypot(W, H) / 2, center: new THREE.Vector3() };
}

/** Points a paintable card's sampler at the current paint layer (a new surface after a reset). */
export function repointSprayPaint(root: THREE.Object3D, paintTexture: THREE.Texture | null, blocks: PaintUniforms[]) {
  void root;
  for (const b of blocks) b.paintMap.value = paintTexture;
}

/** The paint layer's card strip at Spray Bobo's paint size (768x1024 PNG data). */
export function exportPaint(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = 768;
  out.height = 1024;
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  const sx = canvas.width * STRIP_X0,
    sw = canvas.width * STRIP_W;
  g.drawImage(canvas, sx, 0, sw, canvas.height, 0, 0, 768, 1024);
  return out;
}

/** Loads a saved Spray Bobo painting (768x1024) back into the paint layer's strip. */
export function importPaint(target: HTMLCanvasElement, img: CanvasImageSource) {
  const g = target.getContext('2d')!;
  g.drawImage(img, target.width * STRIP_X0, 0, target.width * STRIP_W, target.height);
}
