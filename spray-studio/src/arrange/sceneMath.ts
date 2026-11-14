/**
 * Placement helpers in the scene's millimetres, ported from the admin scene editor
 * (src/components/scene-editor/scene-math.ts in the site) so both editors place things the same way.
 * See that folder's README: new items are centred on the print, 60% of its height tall, 10% of its height
 * in front plus half their depth; Sit flat / Stand up rest them on the print.
 */
import { itemDims, type FileInfo, type SceneItem } from '../paint/sceneItems';

export const printWidth = (heightMm: number) => (heightMm * 3) / 4;
/** To a step, without float noise (0.30000000000000004 -> 0.3). */
export const round = (v: number, step = 0.1) => Number((Math.round(v / step) * step).toFixed(6));
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const POS_LIMIT = 2000;
export const SIZE_MIN = 1;
export const SIZE_MAX = 3000;
export const SCENE_MAX_ITEMS = 12;
export const SCENE_MAX_BYTES = { model: 8 * 1024 * 1024, image: 4 * 1024 * 1024, video: 20 * 1024 * 1024 };
export const HEAVY_TRIANGLES = 150_000;
export const HEAVY_BYTES = 5 * 1024 * 1024;

export { itemDims };

export function newItemId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export type Kind = SceneItem['kind'];

/** A new item: centred on the print (or at `at`, mm on the print), 60% of the print height tall. */
export function defaultItem(
  kind: Kind,
  file: string,
  name: string,
  heightMm: number,
  info: FileInfo & { aspect?: number | null; clips?: string[] },
  at?: [number, number],
): SceneItem {
  const size = round(heightMm * 0.6, 0.1);
  const item: SceneItem = {
    id: newItemId(),
    kind,
    name: name.slice(0, 80) || 'Untitled',
    file,
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    size,
    aspect: kind === 'model' ? null : round(info.aspect ?? 1, 0.001),
    clip: kind === 'model' ? (info.clips?.[0] ?? null) : null,
    sound: false,
    visible: true,
  };
  const d = itemDims(item, info).d;
  const x = at ? clamp(round(at[0], 0.1), -POS_LIMIT, POS_LIMIT) : 0;
  const y = at ? clamp(round(at[1], 0.1), -POS_LIMIT, POS_LIMIT) : 0;
  item.pos = [x, y, round(heightMm * 0.1 + d / 2, 0.1)];
  return item;
}

/** Facing out of the print with its back against it. */
export function sitFlat(item: SceneItem, info?: FileInfo): SceneItem {
  const d = itemDims(item, info).d;
  return { ...item, rot: [0, 0, 0], pos: [item.pos[0], item.pos[1], round(d / 2 + 0.5, 0.1)] };
}

/** Upright with the print as the floor (tipped 90 degrees forward, base touching the print). */
export function standUp(item: SceneItem, info?: FileInfo): SceneItem {
  const h = itemDims(item, info).h;
  return { ...item, rot: [90, 0, 0], pos: [item.pos[0], item.pos[1], round(h / 2, 0.1)] };
}

export function centreOnPrint(item: SceneItem): SceneItem {
  return { ...item, pos: [0, 0, item.pos[2]] };
}

export function formatBytes(n: number | null | undefined) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

export const mm = (v: number) => `${Number(v.toFixed(1))}`;

export function fileName(name: string) {
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, 60) || 'Untitled'
  );
}

export const KIND_WORD: Record<Kind, string> = { model: '3D model', image: 'Picture', video: 'Video' };
