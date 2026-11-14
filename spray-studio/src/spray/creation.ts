/**
 * Saving a Studio painting to the Spray Bobo CMS (/api/spray/creations): the paint layer's card strip
 * at Spray Bobo's own paint size, plus what the AR page and the viewer need to show it the same way.
 */
import type { SprayPaintable } from '../paint/objectCatalog';
import { paintableId } from '../paint/objectCatalog';
import { exportPaint } from '../paint/sprayModel';
import type { TargetObjectType } from '../types';

const q = new URLSearchParams(window.location.search);
/** ?set=<paintable id> opens the studio on that piece of merch; Bobo otherwise. */
export const startSet: TargetObjectType = paintableId(/^[A-Za-z0-9]{2,40}$/.test(q.get('set') || '') ? q.get('set')! : 'bobo');
/** ?kiosk=1: pop-up / mall mode (attract screen, idle reset). */
export const isKiosk = q.get('kiosk') === '1';
/** ?event=<name>: tags every painting saved from this screen (e.g. "Mall pop-up, Toronto"). */
export const eventTag = (q.get('event') || '').slice(0, 80);

export interface SavedCreation {
  id: string;
  /** Absolute share link (what the QR encodes). */
  url: string;
  paintable: SprayPaintable;
  image: HTMLCanvasElement;
}

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });

/** Share of the canvas with paint on it, and the colours used most (from the pixels themselves). */
async function measure(paint: HTMLCanvasElement, maskUrl: string) {
  const W = 96,
    H = 128;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(paint, 0, 0, W, H);
  const p = g.getImageData(0, 0, W, H).data;
  g.clearRect(0, 0, W, H);
  let m: Uint8ClampedArray | null = null;
  try {
    g.drawImage(await loadImg(maskUrl), 0, 0, W, H);
    m = g.getImageData(0, 0, W, H).data;
  } catch {
    /* no mask: count the whole card */
  }
  let inside = 0,
    painted = 0;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < W * H; i++) {
    if (m && m[i * 4 + 3] < 128) continue;
    inside++;
    if (p[i * 4 + 3] < 60) continue;
    painted++;
    const key = ((p[i * 4] >> 5) << 6) | ((p[i * 4 + 1] >> 5) << 3) | (p[i * 4 + 2] >> 5);
    const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += p[i * 4];
    b.g += p[i * 4 + 1];
    b.b += p[i * 4 + 2];
    bins.set(key, b);
  }
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  const colours = [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((b) => `#${hex(b.r / b.n)}${hex(b.g / b.n)}${hex(b.b / b.n)}`);
  return { coverage: inside ? painted / inside : 0, colours, painted };
}

export async function saveCreation(
  paintCanvas: HTMLCanvasElement,
  paintable: SprayPaintable,
  opts: { primer: boolean; linesOn: boolean },
): Promise<SavedCreation> {
  const image = exportPaint(paintCanvas);
  const { coverage, colours, painted } = await measure(image, paintable.files.mask);
  if (painted < 12) throw new Error('Spray something first, then save.');
  const blob = await new Promise<Blob>((res, rej) => image.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image'))), 'image/png'));
  const form = new FormData();
  form.set('paintable', paintable.id);
  form.set('paint', blob, 'paint.png');
  form.set('primer', opts.primer ? '1' : '0');
  form.set('linesOn', opts.linesOn ? '1' : '0');
  form.set('colours', colours.join(','));
  form.set('coverage', coverage.toFixed(3));
  form.set('source', 'studio');
  if (eventTag) form.set('event', eventTag);
  const r = await fetch('/api/spray/creations', { method: 'POST', body: form, headers: { 'x-spray': '1' }, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('You are signed out. Sign in again at /admin/login, then save.');
  if (!r.ok) throw new Error(j.error || 'Could not save. Try again.');
  return { id: j.creation.id, url: `${window.location.origin}/sb/${j.creation.id}`, paintable, image };
}
