import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  Check,
  Film,
  Image as ImageIcon,
  Loader2,
  Move,
  Redo2,
  Rotate3d,
  Ruler,
  Scaling,
  Smartphone,
  Undo2,
  Upload,
} from "lucide-react";
import { createPortal } from "react-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import { AssetPicker, LibraryIcon } from "./asset-picker";
import { useHistory } from "./history";
import { btn, btnOn, card, KIND_WORD } from "./ui";
import { Inspector, ItemList, SectionHead } from "./panel";
import {
  clamp,
  defaultItem,
  fileName,
  mm,
  newItemId,
  POS_LIMIT,
  printWidth,
  round,
  scaleScene,
} from "./scene-math";
import type {
  Asset,
  AssetInfo,
  Mode,
  SceneEditorProps,
  SceneItem,
  SceneItemKind,
  View,
} from "./types";

// The scene editor: place 3D models, pictures and video around a tracked print, in real millimetres,
// so what is placed here is exactly what fans see in AR. Self-contained: the host passes the print,
// the scene and two functions (upload, save). three.js loads only in the browser (stage.tsx, lazily).

const Stage = lazy(() => import("./stage"));

/** The phone frame in "Phone view" covers this much of the stage's height. */
const PHONE_FRAME = 0.9;

type Doc = { items: SceneItem[]; heightMm: number };

const VIEWS: { id: View; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "side", label: "Side" },
  { id: "top", label: "Top" },
  { id: "three", label: "3/4" },
];
const MODES: { id: Mode; label: string; key: string; icon: typeof Move }[] = [
  { id: "translate", label: "Move", key: "W", icon: Move },
  { id: "rotate", label: "Rotate", key: "E", icon: Rotate3d },
  { id: "scale", label: "Resize", key: "R", icon: Scaling },
];
const ACCEPT: Record<SceneItemKind, string> = {
  model: ".glb,model/gltf-binary",
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,.mp4",
};

const sameDoc = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);

export function SceneEditor(props: SceneEditorProps) {
  const initial = useMemo<Doc>(
    () => ({ items: props.scene, heightMm: props.heightMm }),
    // the editor is keyed by what it edits; later prop changes are its own saves
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const hist = useHistory<Doc>(initial);
  const doc = hist.doc;
  const docRef = useRef(doc);
  docRef.current = doc;
  const histSet = hist.set;
  const commit = useCallback(
    (next: Doc, merge?: string) => {
      docRef.current = next;
      histSet(next, merge);
    },
    [histSet],
  );

  const [saved, setSaved] = useState<Doc>(initial);
  const dirty = !sameDoc(doc, saved);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | { error: string }>(
    "idle",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("translate");
  const [snap, setSnap] = useState(true);
  const [view, setView] = useState<{ v: View; n: number }>({ v: "three", n: 0 });
  const [showPhone, setShowPhone] = useState(false);
  const [infos, setInfos] = useState<Record<string, AssetInfo>>({});
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [heightAsk, setHeightAsk] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sel = doc.items.find((i) => i.id === selected) ?? null;
  const H = doc.heightMm;
  const W = printWidth(H);
  const full = doc.items.length >= props.maxItems;

  const onInfo = useCallback((file: string, info: AssetInfo) => {
    setInfos((m) =>
      m[file] && !m[file].error && !info.error ? m : { ...m, [file]: { ...m[file], ...info } },
    );
  }, []);

  // file sizes of pictures and video already in the scene (models are measured when they load)
  useEffect(() => {
    for (const it of doc.items) {
      if (it.kind === "model" || infos[it.file]) continue;
      setInfos((m) => ({ ...m, [it.file]: { bytes: null, aspect: it.aspect ?? undefined } }));
      fetch(it.file, { headers: { range: "bytes=0-0" } })
        .then((r) => {
          const total = Number(r.headers.get("content-range")?.split("/")[1]);
          void r.body?.cancel();
          if (Number.isFinite(total) && total > 0)
            setInfos((m) => ({ ...m, [it.file]: { ...m[it.file], bytes: total } }));
        })
        .catch(() => {});
    }
  }, [doc.items, infos]);

  // ---------------------------------------------------------------- changes
  const updateItem = useCallback(
    (next: SceneItem, merge?: string) => {
      const d = docRef.current;
      commit({ ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) }, merge);
    },
    [commit],
  );
  const removeItem = (id: string) => {
    const d = docRef.current;
    commit({ ...d, items: d.items.filter((i) => i.id !== id) });
    if (selected === id) setSelected(null);
  };
  const duplicate = (it: SceneItem) => {
    const d = docRef.current;
    if (d.items.length >= props.maxItems) return;
    const copy: SceneItem = {
      ...it,
      id: newItemId(),
      name: `${it.name} copy`.slice(0, 80),
      pos: [clamp(round(it.pos[0] + 10, 0.01), -POS_LIMIT, POS_LIMIT), it.pos[1], it.pos[2]],
    };
    commit({ ...d, items: [...d.items, copy] });
    setSelected(copy.id);
  };
  const nudge = (axis: number, by: number) => {
    const it = docRef.current.items.find((i) => i.id === selected);
    if (!it) return;
    const pos = [...it.pos] as SceneItem["pos"];
    pos[axis] = clamp(round(pos[axis] + by, 0.01), -POS_LIMIT, POS_LIMIT);
    updateItem({ ...it, pos }, `nudge:${it.id}`);
  };

  // ---------------------------------------------------------------- adding files
  const addFiles = async (list: File[], want?: SceneItemKind) => {
    if (!list.length || busy) return;
    setAddError(null);
    const { kindOf, measureFile, primeModel } = await import("./assets");
    for (const file of list) {
      const kind = kindOf(file);
      if (!kind || (want && kind !== want)) {
        setAddError(
          `${file.name} isn't a file this can use. Add 3D models as .glb, pictures as PNG, JPEG or WebP, and video as MP4.`,
        );
        continue;
      }
      if (docRef.current.items.length >= props.maxItems) {
        setAddError(`A scene can hold ${props.maxItems} things. Delete one to add another.`);
        break;
      }
      const max = props.maxBytes[kind];
      if (file.size > max) {
        setAddError(
          `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. ${KIND_WORD[kind]}s can be up to ${Math.round(max / 1048576)} MB: make it smaller first.`,
        );
        continue;
      }
      try {
        setBusy({ label: `Opening ${file.name}`, progress: 0 });
        const measured = await measureFile(file, kind);
        setBusy({ label: `Uploading ${file.name}`, progress: 0 });
        const up = await props.upload(file, kind, (f) =>
          setBusy({ label: `Uploading ${file.name}`, progress: f }),
        );
        const info = { ...measured.info, bytes: up.bytes };
        if (measured.model) primeModel(up.file, { ...measured.model, info });
        setInfos((m) => ({ ...m, [up.file]: info }));
        const d = docRef.current;
        const item = defaultItem(kind, up.file, fileName(file.name), d.heightMm, info);
        commit({ ...d, items: [...d.items, item] });
        setSelected(item.id);
        setMode("translate");
        // frame the new item too (keeps the current view)
        setView((v) => ({ v: v.v, n: v.n + 1 }));
      } catch (e) {
        setAddError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
  };

  /** "From your assets": the library already measured it, so it goes straight in. */
  const addFromLibrary = (a: Asset) => {
    setPicking(false);
    setAddError(null);
    const d = docRef.current;
    if (d.items.length >= props.maxItems) {
      setAddError(`A scene can hold ${props.maxItems} things. Delete one to add another.`);
      return;
    }
    const info: AssetInfo = {
      bytes: a.bytes,
      aspect: a.aspect ?? undefined,
      clips: a.clips,
      triangles: a.tris ?? undefined,
      box: a.dims ? { w: a.dims[0], h: a.dims[1], d: a.dims[2] } : undefined,
    };
    setInfos((m) => ({ ...m, [a.file]: { ...m[a.file], ...info } }));
    const item = defaultItem(a.kind, a.file, a.name, d.heightMm, info);
    commit({ ...d, items: [...d.items, item] });
    setSelected(item.id);
    setMode("translate");
    setView((v) => ({ v: v.v, n: v.n + 1 }));
  };

  const inputs = {
    model: useRef<HTMLInputElement>(null),
    image: useRef<HTMLInputElement>(null),
    video: useRef<HTMLInputElement>(null),
  };

  // ---------------------------------------------------------------- saving and leaving
  const save = useCallback(async () => {
    const d = docRef.current;
    setSaveState("saving");
    try {
      await props.save({ scene: d.items, heightMm: d.heightMm });
      setSaved(d);
      setSaveState("saved");
    } catch (e) {
      setSaveState({ error: e instanceof Error ? e.message : String(e) });
    }
  }, [props]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const leave = () => (dirty ? setLeaving(true) : props.onClose());

  // ---------------------------------------------------------------- keyboard
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const typing = !!t?.closest("input, textarea, select, [contenteditable=true]");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (dirty && saveState !== "saving") void save();
      return;
    }
    if (typing || toDelete || leaving || heightAsk != null) return;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) hist.redo();
      else hist.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      hist.redo();
      return;
    }
    if (mod || e.altKey) return;
    const k = e.key;
    if (k === "Escape") setSelected(null);
    if (!sel) return;
    const step = e.shiftKey ? 10 : 1;
    if (k === "Delete" || k === "Backspace") {
      e.preventDefault();
      setToDelete(sel.id);
    } else if (k === "w" || k === "W") setMode("translate");
    else if (k === "e" || k === "E") setMode("rotate");
    else if (k === "r" || k === "R") setMode("scale");
    else if (k === "ArrowLeft") nudge(0, -step);
    else if (k === "ArrowRight") nudge(0, step);
    else if (k === "ArrowUp") nudge(1, step);
    else if (k === "ArrowDown") nudge(1, -step);
    else if (k === "PageUp") nudge(2, step);
    else if (k === "PageDown") nudge(2, -step);
    else return;
    e.preventDefault();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // keep the page behind from scrolling while the editor covers it
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---------------------------------------------------------------- print size
  const [heightText, setHeightText] = useState(String(H));
  useEffect(() => setHeightText(String(Number(H.toFixed(2)))), [H]);
  const newHeight = Number(heightText.replace(",", "."));
  const heightOk = Number.isFinite(newHeight) && newHeight >= 10 && newHeight <= 3000;
  const applyHeight = (v: number, scaleItems: boolean) => {
    const d = docRef.current;
    const h = round(v, 0.01);
    commit({
      heightMm: h,
      items: scaleItems ? scaleScene(d.items, h / d.heightMm) : d.items,
    });
  };

  const saveLabel =
    saveState === "saving" ? "Saving" : dirty ? "Save" : saveState === "saved" ? "Saved" : "Saved";

  // a portal, so the admin layout's sidebar and stacking don't cover it (dialogs open above it)
  if (!mounted) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#0f1013] text-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Scene for ${props.title}`}
    >
      {/* ------------------------------------------------ top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-white/[0.08] bg-[#141519] px-3 py-2 sm:px-4">
        <button type="button" className={cn(btn, "w-11 px-0 sm:w-auto sm:px-3")} onClick={leave}>
          <ArrowLeft aria-hidden />
          <span className="sr-only sm:not-sr-only">Back</span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            Scene <span className="text-white/50">·</span> {props.title}
          </h1>
          <p className="truncate text-xs text-white/55">
            Place things around the print in real millimetres. What you see here is what fans see.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(btn, "w-11 px-0")}
            onClick={hist.undo}
            disabled={!hist.canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 aria-hidden />
          </button>
          <button
            type="button"
            className={cn(btn, "w-11 px-0")}
            onClick={hist.redo}
            disabled={!hist.canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saveState === "saving"}
            className="inline-flex min-h-11 min-w-[104px] items-center justify-center gap-2 rounded-xl bg-[#f6c344] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#ffd25e] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:cursor-default disabled:bg-[#2a2b32] disabled:text-white/70"
          >
            {saveState === "saving" ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : !dirty ? (
              <Check aria-hidden className="size-4" />
            ) : null}
            {saveLabel}
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {saveState === "saving"
            ? "Saving"
            : typeof saveState === "object"
              ? `Couldn't save: ${saveState.error}`
              : dirty
                ? "Unsaved changes"
                : "All changes saved"}
        </p>
      </header>
      {typeof saveState === "object" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-rose-400/30 bg-rose-950 px-4 py-2 text-sm text-rose-100"
        >
          <span className="min-w-0 flex-1">Couldn't save: {saveState.error}</span>
          <button type="button" className={btn} onClick={() => void save()}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* ------------------------------------------------ stage */}
        <section
          aria-label="Stage"
          className={cn(
            // phones: the stage stays at the top while the panel scrolls under it
            "sticky top-0 z-10 h-[46vh] min-h-[320px] shrink-0 overflow-hidden border-b border-white/[0.08] bg-[#141519] lg:relative lg:h-auto lg:min-h-0 lg:flex-1 lg:border-b-0",
            dragOver && "outline-2 -outline-offset-4 outline-[#f6c344] outline-dashed",
          )}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {mounted ? (
            <Suspense fallback={<StageLoading />}>
              <Stage
                heightMm={H}
                print={props.print}
                items={doc.items}
                infos={infos}
                selected={selected}
                mode={mode}
                snap={snap}
                view={view.v}
                viewNonce={view.n}
                phoneFrame={PHONE_FRAME}
                showPhone={showPhone}
                onSelect={setSelected}
                onInfo={onInfo}
                onCommit={(id, v) => {
                  const it = docRef.current.items.find((i) => i.id === id);
                  if (it) updateItem({ ...it, ...v });
                }}
              />
            </Suspense>
          ) : (
            <StageLoading />
          )}

          {view.v === "phone" ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                className="rounded-[28px] border-2 border-white/70 shadow-[0_0_0_9999px_rgb(10_11_13/0.6)]"
                style={{ height: `${PHONE_FRAME * 100}%`, aspectRatio: "9 / 19.5" }}
              />
              <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white/85">
                A phone held about 30 cm away
              </span>
            </div>
          ) : null}

          {/* views */}
          <div className="absolute top-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-1.5">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={cn(btn, "bg-[#1b1c21]/95 px-3", view.v === v.id && btnOn)}
                aria-pressed={view.v === v.id}
                onClick={() => setView((s) => ({ v: v.id, n: s.n + 1 }))}
              >
                {v.label}
              </button>
            ))}
            <button
              type="button"
              className={cn(btn, "bg-[#1b1c21]/95 px-3", view.v === "phone" && btnOn)}
              aria-pressed={view.v === "phone"}
              onClick={() => setView((s) => ({ v: "phone", n: s.n + 1 }))}
            >
              <Smartphone aria-hidden />
              Phone view
            </button>
          </div>

          {/* ways to change the selected item */}
          {sel ? (
            <div
              className="absolute bottom-14 left-2 flex gap-1.5 sm:top-2 sm:right-2 sm:bottom-auto sm:left-auto"
              role="group"
              aria-label="What dragging does"
            >
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={cn(btn, "bg-[#1b1c21]/95 px-3", mode === m.id && btnOn)}
                  aria-pressed={mode === m.id}
                  title={`${m.label} (${m.key})`}
                  onClick={() => setMode(m.id)}
                >
                  <m.icon aria-hidden />
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* scale readout and toggles */}
          <div className="absolute right-2 bottom-2 left-2 flex flex-wrap items-end justify-between gap-1.5">
            <div className="flex min-h-11 items-center gap-2 rounded-xl bg-black/70 px-3 text-xs text-white/85 tabular-nums">
              <Ruler aria-hidden className="size-4 text-[#f6c344]" />
              Print: {mm(H)} x {mm(W)} mm
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                className={cn(btn, "bg-[#1b1c21]/95 px-3", snap && btnOn)}
                aria-pressed={snap}
                onClick={() => setSnap((s) => !s)}
                title="Dragging moves in whole millimetres and turns in 5 degree steps"
              >
                Snap to 1 mm / 5°
              </button>
              <button
                type="button"
                className={cn(btn, "bg-[#1b1c21]/95 px-3", showPhone && btnOn)}
                aria-pressed={showPhone}
                onClick={() => setShowPhone((s) => !s)}
                title="Show a phone beside the print for scale"
              >
                <Smartphone aria-hidden />
                <span className="hidden sm:inline">Phone for scale</span>
                <span className="sr-only sm:hidden">Phone for scale</span>
              </button>
            </div>
          </div>

          {!doc.items.length && !busy ? (
            <div className="pointer-events-none absolute inset-x-0 top-[4.5rem] flex justify-center px-6">
              <p className="max-w-sm rounded-2xl bg-black/70 px-4 py-3 text-center text-sm text-white/85">
                Add a 3D model, picture or video from the panel, or drop files here.
              </p>
            </div>
          ) : null}

          {busy ? (
            <div
              className="absolute top-16 left-1/2 w-[min(360px,calc(100%-1rem))] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#17181c] p-3 text-sm"
              role="status"
            >
              <div className="flex items-center gap-2">
                <Loader2 aria-hidden className="size-4 animate-spin text-[#f6c344]" />
                <span className="min-w-0 flex-1 truncate">{busy.label}</span>
                <span className="tabular-nums text-white/60">
                  {Math.round(busy.progress * 100)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-[#f6c344] transition-[width]"
                  style={{ width: `${Math.max(4, busy.progress * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </section>

        {/* ------------------------------------------------ side panel */}
        <aside className="w-full space-y-4 border-white/[0.08] p-3 sm:p-4 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-l">
          <section className={card}>
            <SectionHead
              title="Add to the scene"
              sub="Or drop files on the stage."
              right={
                <span className="text-xs text-white/55 tabular-nums">
                  {doc.items.length} of {props.maxItems}
                </span>
              }
            />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["model", "Model", Box],
                  ["image", "Picture", ImageIcon],
                  ["video", "Video", Film],
                ] as const
              ).map(([kind, label, Icon]) => (
                <button
                  key={kind}
                  type="button"
                  className={cn(btn, "flex-col gap-1 py-2")}
                  disabled={full || !!busy}
                  onClick={() => inputs[kind].current?.click()}
                  title={`Add ${KIND_WORD[kind].toLowerCase()} (up to ${Math.round(props.maxBytes[kind] / 1048576)} MB)`}
                >
                  <Icon aria-hidden />
                  <span>Add {label.toLowerCase()}</span>
                </button>
              ))}
            </div>
            {props.library ? (
              <button
                type="button"
                className={cn(btn, "mt-2 w-full")}
                disabled={full || !!busy}
                onClick={() => setPicking(true)}
              >
                <LibraryIcon aria-hidden />
                From your assets
              </button>
            ) : null}
            <p className="mt-2 text-xs text-white/50">
              3D models as .glb · pictures as PNG, JPEG or WebP · video as MP4
            </p>
            {(["model", "image", "video"] as const).map((kind) => (
              <input
                key={kind}
                ref={inputs[kind]}
                type="file"
                accept={ACCEPT[kind]}
                multiple
                className="hidden"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  void addFiles(files, kind);
                }}
              />
            ))}
            {full ? (
              <p className="mt-2 text-xs text-amber-200">
                The scene is full ({props.maxItems} things). Delete one to add another.
              </p>
            ) : null}
            {addError ? (
              <p
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
              >
                <Upload aria-hidden className="mt-0.5 size-4 shrink-0" />
                {addError}
              </p>
            ) : null}
          </section>

          <section className={card}>
            <SectionHead title="In the scene" sub="Tap one to change it, or tap it on the stage." />
            <ItemList
              items={doc.items}
              infos={infos}
              selected={selected}
              onSelect={(id) => setSelected(id)}
              onToggle={(id) => {
                const it = doc.items.find((i) => i.id === id);
                if (it) updateItem({ ...it, visible: !it.visible });
              }}
            />
          </section>

          {sel ? (
            <Inspector
              key={sel.id}
              item={sel}
              info={infos[sel.file]}
              onChange={updateItem}
              onDuplicate={() => duplicate(sel)}
              onDelete={() => setToDelete(sel.id)}
              canDuplicate={!full}
            />
          ) : null}

          <section className={card}>
            <SectionHead title="Print size" />
            <p className="mb-3 text-xs leading-relaxed text-white/65">
              Measure the printed picture on the real merch. Everything here is placed in real
              millimetres, so if this number is right the scene matches the merch exactly.
            </p>
            {props.heightLocked ? (
              <div className="rounded-xl border border-white/10 bg-[#0f1013] px-3 py-2.5 text-sm">
                <div className="tabular-nums">
                  {mm(H)} mm tall x {mm(W)} mm wide
                </div>
                <p className="mt-1 text-xs text-white/55">{props.heightLocked}</p>
              </div>
            ) : (
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!heightOk || Math.abs(newHeight - H) < 0.005) return;
                  if (doc.items.length) setHeightAsk(newHeight);
                  else applyHeight(newHeight, false);
                }}
              >
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="scene-print-height"
                    className="mb-1 block text-xs font-medium text-white/70"
                  >
                    Height of the printed picture
                  </label>
                  <div className="flex h-11 items-center rounded-xl border border-white/10 bg-[#0f1013] pr-3 focus-within:ring-2 focus-within:ring-[#f6c344]">
                    <input
                      id="scene-print-height"
                      inputMode="decimal"
                      autoComplete="off"
                      className="h-full w-full min-w-0 bg-transparent px-3 text-sm tabular-nums outline-none"
                      value={heightText}
                      aria-invalid={!heightOk || undefined}
                      onChange={(e) => setHeightText(e.target.value)}
                    />
                    <span className="text-xs text-white/50">mm</span>
                  </div>
                </div>
                <button
                  type="submit"
                  className={btn}
                  disabled={!heightOk || Math.abs(newHeight - H) < 0.005}
                >
                  Change
                </button>
              </form>
            )}
            {!props.heightLocked && !heightOk ? (
              <p className="mt-2 text-xs text-rose-200">Use a height from 10 to 3000 mm.</p>
            ) : (
              <p className="mt-2 text-xs text-white/50 tabular-nums">
                Width follows the 3:4 picture:{" "}
                {mm(heightOk && !props.heightLocked ? (newHeight * 3) / 4 : W)} mm.
              </p>
            )}
          </section>

          <section className="px-1 pb-4 text-xs leading-relaxed text-white/50">
            <h2 className="mb-1 font-semibold text-white/70">Keyboard</h2>
            Arrows move 1 mm (Shift: 10 mm), Page Up / Page Down move out from the print. W move, E
            rotate, R resize. Delete removes. Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+S save.
          </section>
        </aside>
      </div>

      {/* ------------------------------------------------ dialogs */}
      {props.library ? (
        <AssetPicker
          open={picking}
          onOpenChange={setPicking}
          load={props.library}
          onPick={addFromLibrary}
        />
      ) : null}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {doc.items.find((i) => i.id === toDelete)?.name ?? "this"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It comes out of the scene. Undo brings it back until you save; after saving, its file
              is removed if nothing else uses it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-rose-600 text-white hover:bg-rose-500"
              onClick={() => {
                if (toDelete) removeItem(toDelete);
                setToDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes to this scene haven't been saved and will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-rose-600 text-white hover:bg-rose-500"
              onClick={() => props.onClose()}
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={heightAsk != null} onOpenChange={(o) => !o && setHeightAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change the print from {mm(H)} mm to {mm(heightAsk ?? H)} mm tall?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Choose what happens to the things in the scene.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className={cn(btn, "h-auto flex-col items-start py-3 text-left")}
              onClick={() => {
                if (heightAsk != null) applyHeight(heightAsk, true);
                setHeightAsk(null);
              }}
            >
              <span className="font-semibold">Scale them with the print</span>
              <span className="text-xs font-normal whitespace-normal text-white/60">
                They keep their place and size on the picture. Use this when the old number was
                wrong.
              </span>
            </button>
            <button
              type="button"
              className={cn(btn, "h-auto flex-col items-start py-3 text-left")}
              onClick={() => {
                if (heightAsk != null) applyHeight(heightAsk, false);
                setHeightAsk(null);
              }}
            >
              <span className="font-semibold">Keep them the same real size</span>
              <span className="text-xs font-normal whitespace-normal text-white/60">
                They stay the same number of millimetres, so they look bigger or smaller next to the
                print.
              </span>
            </button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    document.body,
  );
}

function StageLoading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-white/60" aria-busy="true">
      <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
      Loading the stage
    </div>
  );
}
