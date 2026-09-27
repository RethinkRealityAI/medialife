import { createContext, useContext } from "react";

import type { AssetListItem } from "@/lib/ar/assets";
import type { Project, ZoneId } from "@/lib/ar/project";
import { fieldId, type Path, type SectionId } from "@/lib/ar/projects";

import type { Engine } from "./use-engine";
import type { EditorLayout } from "./use-layout";

// Shared state for the editor's panels. Fields address the draft by path
// (["zones","cap","product","price"]); the same path is the key for validation
// issues and the DOM id the publish check jumps to.

export interface LibraryRequest {
  accept: "model" | "image";
  onPick: (asset: AssetListItem) => void;
  /** asset id currently chosen, highlighted in the grid */
  currentId?: string | null;
  title?: string;
}

export interface EditorContextValue {
  slug: string;
  draft: Project;
  update: (fn: (d: Project) => void) => void;
  setAt: (path: Path, value: unknown) => void;
  issues: Map<string, string>;
  /** the slug has been shared (published at least once) */
  locked: boolean;
  section: SectionId;
  setSection: (s: SectionId) => void;
  zone: ZoneId;
  selectZone: (z: ZoneId, opts?: { fromPreview?: boolean }) => void;
  themeIndex: number;
  setThemeIndex: (i: number) => void;
  openLibrary: (req: LibraryRequest) => void;
  /** open the section holding `path` and focus its field */
  jumpTo: (path: Path) => void;
  engine: Engine;
  layout: EditorLayout;
  /** bring the live preview into view (phones: switches to the Preview pane) */
  showPreview: () => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const v = useContext(EditorContext);
  if (!v) throw new Error("useEditor outside the endcap editor");
  return v;
}

export const pathKey = (path: Path) => path.join(".");

export function getAt(obj: unknown, path: Path): unknown {
  let cur = obj as Record<string | number, unknown> | undefined;
  for (const p of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p] as Record<string | number, unknown> | undefined;
  }
  return cur;
}

/** Set a value in place; undefined deletes the key (optional fields stay absent, not ""). */
export function setIn(obj: unknown, path: Path, value: unknown) {
  let cur = obj as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i];
    if (cur[p] == null || typeof cur[p] !== "object")
      cur[p] = typeof path[i + 1] === "number" ? [] : {};
    cur = cur[p] as Record<string | number, unknown>;
  }
  const last = path[path.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

/** A draft value by path, with its setter, DOM id and validation message. */
export function useField<T>(path: Path) {
  const { draft, setAt, issues } = useEditor();
  return {
    id: fieldId(path),
    value: getAt(draft, path) as T,
    set: (v: T | undefined) => setAt(path, v),
    error: issues.get(pathKey(path)) ?? null,
  };
}
