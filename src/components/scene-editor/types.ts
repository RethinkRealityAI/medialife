// The scene editor's shapes. The scene contract (SceneItem: millimetres of the real print, origin at the
// centre of the 3:4 picture, x right, y up, z out of the print, degrees in XYZ order) lives in the Spray
// model; this is the only import to change when the editor is copied into another tool.
export type { Asset, SceneItem, SceneItemKind } from "@/lib/spray/model";
import type { Asset, SceneItem, SceneItemKind } from "@/lib/spray/model";

/** What the editor needs to know about the tracked picture. */
export type ScenePrint = {
  /** Colour picture of the print (3:4). */
  image: string;
  /** Optional PNG, alpha = the part that gets tinted (Spray Bobo: the paintable area). */
  mask?: string | null;
  /** Optional JSON { points: [[u, v], ...] } (picture fractions, v down): the cut line. */
  outline?: string | null;
};

export type SceneEditorProps = {
  title: string;
  /** Real print height in millimetres (the picture is heightMm * 3/4 wide). */
  heightMm: number;
  /** When set, the print size can't be changed here; the text says why. */
  heightLocked?: string | null;
  print: ScenePrint;
  scene: SceneItem[];
  maxItems: number;
  maxBytes: Record<SceneItemKind, number>;
  /** Upload one file; resolves with its public path and size. */
  upload: (
    file: File,
    kind: SceneItemKind,
    onProgress?: (fraction: number) => void,
  ) => Promise<{ file: string; bytes: number }>;
  /** Save the scene (and the print height). Throw with a plain message on failure. */
  save: (v: { scene: SceneItem[]; heightMm: number }) => Promise<void>;
  onClose: () => void;
  /** The shared asset library ("From your assets"); leave out to hide the picker. */
  library?: () => Promise<Asset[]>;
};

/** What the editor measured about an item's file (not saved: measured again on load). */
export type AssetInfo = {
  bytes: number | null;
  /** Models: triangles, animation names, and the bounding box size in the model's own units. */
  triangles?: number;
  clips?: string[];
  box?: { w: number; h: number; d: number };
  /** Pictures and video: width / height. */
  aspect?: number;
  error?: string;
};

export type View = "front" | "side" | "top" | "three" | "phone";
export type Mode = "translate" | "rotate" | "scale";

export const HEAVY_TRIANGLES = 150_000;
export const HEAVY_BYTES = 5 * 1024 * 1024;
