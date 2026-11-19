import type { AssetInfo, SceneItem, SceneItemKind } from "./types";

// Placement helpers in the scene's millimetres (no three.js here, so the editor's panel stays light).

export const printWidth = (heightMm: number) => (heightMm * 3) / 4;

export const round = (v: number, step = 0.1) => Math.round(v / step) * step;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const POS_LIMIT = 2000;
export const SIZE_MIN = 1;
export const SIZE_MAX = 3000;

export function newItemId() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/** The item's size in millimetres along its own width, height and depth (before turning). */
export function itemDims(item: SceneItem, info?: AssetInfo) {
  if (item.kind === "model") {
    const b = info?.box;
    if (!b) return { w: item.size, h: item.size, d: item.size };
    const h = b.h > 1e-6 ? b.h : Math.max(b.w, b.d, 1e-6);
    const s = item.size / h;
    return { w: b.w * s, h: b.h * s, d: b.d * s };
  }
  return { w: item.size * (item.aspect ?? 1), h: item.size, d: 0 };
}

/** Where a new item goes: centred on the print, 10% of the print height in front, 60% of it tall. */
export function defaultItem(
  kind: SceneItemKind,
  file: string,
  name: string,
  heightMm: number,
  info: AssetInfo,
): SceneItem {
  const size = round(heightMm * 0.6, 0.1);
  const item: SceneItem = {
    id: newItemId(),
    kind,
    name,
    file,
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    size,
    aspect: kind === "model" ? null : round(info.aspect ?? 1, 0.001),
    clip: kind === "model" ? (info.clips?.[0] ?? null) : null,
    sound: false,
    visible: true,
  };
  const d = itemDims(item, info).d;
  item.pos = [0, 0, round(heightMm * 0.1 + d / 2, 0.1)];
  return item;
}

/** Facing out of the print with its back against it. */
export function sitFlat(item: SceneItem, info?: AssetInfo): SceneItem {
  const d = itemDims(item, info).d;
  return { ...item, rot: [0, 0, 0], pos: [item.pos[0], item.pos[1], round(d / 2 + 0.5, 0.1)] };
}

/** Upright with the print as the floor (tipped 90 degrees forward, base touching the print). */
export function standUp(item: SceneItem, info?: AssetInfo): SceneItem {
  const h = itemDims(item, info).h;
  return { ...item, rot: [90, 0, 0], pos: [item.pos[0], item.pos[1], round(h / 2, 0.1)] };
}

export function centreOnPrint(item: SceneItem): SceneItem {
  return { ...item, pos: [0, 0, item.pos[2]] };
}

/** Keep everything the same on the print when the print's real size changes. */
export function scaleScene(items: SceneItem[], factor: number): SceneItem[] {
  return items.map((it) => ({
    ...it,
    pos: it.pos.map((v) =>
      clamp(round(v * factor, 0.01), -POS_LIMIT, POS_LIMIT),
    ) as SceneItem["pos"],
    size: clamp(round(it.size * factor, 0.01), SIZE_MIN, SIZE_MAX),
  }));
}

export function formatBytes(n: number | null | undefined) {
  if (n == null) return "";
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
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .trim()
      .slice(0, 60) || "Untitled"
  );
}
