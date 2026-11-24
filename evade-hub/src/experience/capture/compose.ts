// Taking the picture: the engine's screenshot (camera + 3D exactly as drawn, so a selfie is already the mirror image
// the user saw) composited with flat overlay art on a 2D canvas, then a JPEG blob.
import type { EngineView } from '../types';

export const JPEG_QUALITY = 0.9;
/** Long edge of the saved photo: at most this (the camera canvas is upscaled a little so the frame art stays crisp). */
export const MAX_EDGE = 1920;
const MIN_EDGE = 1600;

/** Draws overlay art on top of the photo. w/h = output size in pixels. */
export type OverlayFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Camera + 3D as drawn. Asks the engine for its best JPEG first (the engine's default is 75 % at 1280 px). */
export async function engineShot(engine: EngineView): Promise<HTMLImageElement> {
  try {
    // global engine config, harmless to repeat; xr-core's engine.ts adds the CanvasScreenshot module
    (window as unknown as { XR8?: { CanvasScreenshot?: { configure(o: object): void } } }).XR8?.CanvasScreenshot?.configure({
      maxDimension: MAX_EDGE,
      jpgCompression: 92,
    });
  } catch { /* older engine: defaults */ }
  return engine.screenshot();
}

export interface Composed {
  blob: Blob;
  width: number;
  height: number;
}

/** Composite `img` (screen-shaped) + overlay into a JPEG. The overlay is drawn in the output's pixel space. */
export async function compose(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }, overlay?: OverlayFn): Promise<Composed> {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) throw new Error('empty screenshot');
  const long = Math.max(iw, ih);
  const target = Math.min(MAX_EDGE, Math.max(long, MIN_EDGE));
  const k = target / long;
  const w = Math.round(iw * k), h = Math.round(ih * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  overlay?.(g, w, h);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', JPEG_QUALITY));
  c.width = c.height = 0; // free the backing store now (phones keep a few canvases around otherwise)
  if (!blob) throw new Error('toBlob failed');
  return { blob, width: w, height: h };
}

/** Draw `img` to cover the rectangle (centre crop), with an optional vertical bias (0 = centre, -1 = top). */
export function drawCover(g: CanvasRenderingContext2D, img: CanvasImageSource, iw: number, ih: number, x: number, y: number, w: number, h: number, biasY = 0): void {
  const s = Math.max(w / iw, h / ih);
  const sw = w / s, sh = h / s;
  const sx = (iw - sw) / 2;
  const sy = Math.max(0, Math.min(ih - sh, (ih - sh) / 2 + (biasY * (ih - sh)) / 2));
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
