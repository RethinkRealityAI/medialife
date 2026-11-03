/**
 * Bulk upload for the Media Library.
 *
 *   1. Drop files anywhere on the page (or "Upload"): they're staged, not sent.
 *   2. Set the batch's client, collection, purpose, tags, rights, AI flag and
 *      visibility once; rename any file if you like. Then "Upload".
 *   3. The queue sends two files at a time (each in 4 MB chunks, three in
 *      flight), with a progress bar and pause / resume / cancel per file.
 *      Closing the dialog keeps uploading; a dock shows the progress.
 *   4. Each finished file has "Edit details" for anything file-specific.
 *
 * Resume after a reload: the server keeps unfinished uploads and the browser
 * remembers their ids per file, so adding the same file again picks up where
 * it stopped (the dialog lists what's unfinished).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  FilePlus2,
  Loader2,
  Pause,
  PencilLine,
  Play,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { well } from "@/components/admin/kit";
import { GLASS_TAB_BAR_CLEARANCE } from "@/components/glass/tab-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { MediaLibraryData } from "@/lib/media/admin.server";
import { readMediaMeta } from "@/lib/media/media-client";
import {
  MEDIA,
  MEDIA_ACCEPT,
  MEDIA_CLIENT_SUGGESTIONS,
  MEDIA_KIND_LABELS,
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_LABELS,
  MEDIA_RIGHTS_SUGGESTIONS,
  formatBytes,
  kindOf,
  resolveMediaMime,
  titleFromName,
  type MediaAssetView,
  type MediaPurpose,
} from "@/lib/media/model";
import {
  MediaUploadTask,
  cancelMediaUpload,
  pendingMediaUpload,
  type MediaUploadFields,
} from "@/lib/media/upload-client";
import { cn } from "@/lib/utils";

import { ComboField, FieldRow, KIND_ICON, TagEditor, mergeSuggestions, tap } from "./parts";

/* ── State ────────────────────────────────────────────────────────────────── */

type Item = {
  key: string;
  file: File;
  title: string;
  /** Not sent yet: still editable in the dialog. */
  staged: boolean;
  /** An unfinished upload of this file is remembered: it will resume. */
  resumes: boolean;
  task: MediaUploadTask | null;
  /** Reading poster / duration / dimensions before the upload starts. */
  reading: boolean;
  /** An object URL of the poster frame / thumbnail, once read. */
  preview?: string | null;
};

type Batch = {
  client: string;
  collection: string;
  purpose: MediaPurpose | "auto";
  tags: string[];
  rights: string;
  aiGenerated: boolean;
  public: boolean;
  uploader: string;
};

const PREFS_KEY = "media-upload-batch";
const EMPTY_BATCH: Batch = {
  client: "",
  collection: "",
  purpose: "auto",
  tags: [],
  rights: "",
  aiGenerated: false,
  public: false,
  uploader: "",
};

type Ctx = {
  open: (files?: File[]) => void;
  close: () => void;
  isOpen: boolean;
  items: Item[];
  /** Opens the drawer of an uploaded asset (set by the page). */
  onEdit: (a: MediaAssetView) => void;
  /** Hides the floating progress dock (while the selection bar is up). */
  setDockHidden: (hidden: boolean) => void;
};

const UploadCtx = createContext<Ctx | null>(null);

export function useMediaUpload() {
  const c = useContext(UploadCtx);
  if (!c) throw new Error("useMediaUpload outside MediaUploadProvider");
  return c;
}

const accepted = (f: File) => resolveMediaMime(f.name, f.type) !== null;

export function MediaUploadProvider({
  data,
  onEdit,
  children,
}: {
  data: MediaLibraryData;
  onEdit: (a: MediaAssetView) => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [dockHidden, setDockHidden] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [batch, setBatchState] = useState<Batch>(EMPTY_BATCH);
  const [, force] = useState(0);
  const [announce, setAnnounce] = useState("");
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const batchRef = useRef(batch);
  batchRef.current = batch;
  const running = useRef(0);
  const invalidateTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const raf = useRef<number | null>(null);
  const milestone = useRef(-1);

  // the uploader's name and last batch settings are remembered per browser
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Batch> | null;
      if (saved) setBatchState((b) => ({ ...b, ...saved, tags: saved.tags ?? [] }));
    } catch {
      /* private mode */
    }
  }, []);
  const setBatch = useCallback((p: Partial<Batch>) => {
    setBatchState((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* fine */
      }
      return next;
    });
  }, []);

  const rerender = useCallback(() => {
    if (raf.current != null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      force((n) => n + 1);
    });
  }, []);

  const refreshSoon = useCallback(() => {
    clearTimeout(invalidateTimer.current);
    invalidateTimer.current = setTimeout(() => void router.invalidate(), 700);
  }, [router]);

  // warn before leaving while something is still sending
  const sending = items.some((i) => i.task?.state === "uploading" || (!i.staged && !i.task));
  useEffect(() => {
    if (!sending) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sending]);

  const stage = useCallback((files: File[]) => {
    const ok = files.filter(accepted);
    const bad = files.length - ok.length;
    if (bad)
      toast.error(
        bad === 1
          ? `${files.find((f) => !accepted(f))?.name} isn't a type the library takes.`
          : `${bad} files aren't types the library takes.`,
      );
    const tooBig = ok.filter((f) => f.size > MEDIA.maxFileBytes);
    for (const f of tooBig)
      toast.error(
        `${f.name} is ${formatBytes(f.size)}. Files can be up to ${formatBytes(MEDIA.maxFileBytes)}.`,
      );
    const fresh = ok
      .filter((f) => f.size <= MEDIA.maxFileBytes && f.size > 0)
      .filter(
        (f) =>
          !itemsRef.current.some(
            (i) =>
              i.file.name === f.name &&
              i.file.size === f.size &&
              i.file.lastModified === f.lastModified &&
              i.task?.state !== "cancelled",
          ),
      )
      .map<Item>((f) => ({
        key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        title: titleFromName(f.name),
        staged: true,
        resumes: !!pendingMediaUpload(f),
        task: null,
        reading: false,
      }));
    if (fresh.length) setItems((cur) => [...cur, ...fresh]);
  }, []);

  const open = useCallback(
    (files?: File[]) => {
      if (files?.length) stage(files);
      setOpen(true);
    },
    [stage],
  );

  const patch = (key: string, p: Partial<Item>) =>
    setItems((cur) => cur.map((i) => (i.key === key ? { ...i, ...p } : i)));

  const announceProgress = useCallback(() => {
    const live = itemsRef.current.filter((i) => i.task && !["cancelled"].includes(i.task.state));
    if (!live.length) return;
    const total = live.reduce((n, i) => n + i.file.size, 0);
    const sent = live.reduce((n, i) => n + (i.task?.progress.sentBytes ?? 0), 0);
    const pct = Math.floor(((total ? sent / total : 1) * 100) / 25) * 25;
    if (pct !== milestone.current && pct < 100) {
      milestone.current = pct;
      setAnnounce(`Uploading ${live.length} file${live.length === 1 ? "" : "s"}: ${pct}% sent.`);
    }
  }, []);

  /** Two files at a time; each file sends three chunks at once. */
  const pump = useCallback(async () => {
    while (running.current < 2) {
      const next = itemsRef.current.find((i) => !i.staged && !i.task && !i.reading);
      if (!next) return;
      running.current++;
      patch(next.key, { reading: true });
      itemsRef.current = itemsRef.current.map((i) =>
        i.key === next.key ? { ...i, reading: true } : i,
      );
      void (async () => {
        try {
          const b = batchRef.current;
          const meta = await readMediaMeta(next.file).catch(() => null);
          const fields: MediaUploadFields = {
            title: next.title,
            client: b.client,
            collection: b.collection,
            tags: b.tags,
            rights: b.rights,
            aiGenerated: b.aiGenerated,
            public: b.public,
            uploader: b.uploader,
            ...(b.purpose === "auto" ? {} : { purpose: b.purpose }),
          };
          const task = new MediaUploadTask(next.file, { fields, meta });
          task.subscribe(() => {
            rerender();
            announceProgress();
          });
          const preview = meta?.thumb ? URL.createObjectURL(meta.thumb) : null;
          patch(next.key, { task, reading: false, preview });
          itemsRef.current = itemsRef.current.map((i) =>
            i.key === next.key ? { ...i, task, reading: false, preview } : i,
          );
          const result = await task.start();
          if (result) {
            setAnnounce(`Uploaded ${result.title}.`);
            refreshSoon();
          } else if (task.state === "error") {
            setAnnounce(`${next.file.name} failed: ${task.error?.message ?? "upload failed"}`);
          }
        } finally {
          running.current--;
          void pump();
        }
      })();
    }
  }, [announceProgress, refreshSoon, rerender]);

  const startAll = useCallback(() => {
    setItems((cur) => cur.map((i) => (i.staged ? { ...i, staged: false } : i)));
    itemsRef.current = itemsRef.current.map((i) => (i.staged ? { ...i, staged: false } : i));
    milestone.current = -1;
    void pump();
  }, [pump]);

  // when the queue drains, say how it went once
  const settled =
    items.length > 0 &&
    items.every(
      (i) =>
        i.staged || (i.task && !["uploading"].includes(i.task.state) && i.task.state !== "queued"),
    );
  const doneCount = items.filter((i) => i.task?.state === "done").length;
  const prevSettled = useRef(false);
  useEffect(() => {
    if (settled && !prevSettled.current && doneCount) {
      const failed = items.filter((i) => i.task?.state === "error").length;
      if (failed) toast.warning(`Uploaded ${doneCount}; ${failed} need attention.`);
      else toast.success(`Uploaded ${doneCount} file${doneCount === 1 ? "" : "s"}`);
    }
    prevSettled.current = settled;
  }, [settled, doneCount, items]);

  const ctx: Ctx = useMemo(
    () => ({ open, close: () => setOpen(false), isOpen, items, onEdit, setDockHidden }),
    [open, isOpen, items, onEdit],
  );

  return (
    <UploadCtx.Provider value={ctx}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
      <UploadDialog
        open={isOpen}
        onOpenChange={setOpen}
        data={data}
        items={items}
        batch={batch}
        setBatch={setBatch}
        stage={stage}
        startAll={startAll}
        removeItem={(key) => setItems((cur) => cur.filter((i) => i.key !== key))}
        retitle={(key, title) => patch(key, { title })}
        retry={(it) => {
          void it.task?.resume().then((r) => {
            if (r) refreshSoon();
          });
        }}
        clearFinished={() =>
          setItems((cur) =>
            cur.filter((i) => i.staged || !i.task || !["done", "cancelled"].includes(i.task.state)),
          )
        }
        onEdit={(a) => {
          setOpen(false);
          onEdit(a);
        }}
        discardUnfinished={async (id) => {
          await cancelMediaUpload(id).catch(() => undefined);
          await router.invalidate();
          toast.success("Unfinished upload discarded");
        }}
      />
      <UploadDock items={items} hidden={isOpen || dockHidden} onOpen={() => setOpen(true)} />
    </UploadCtx.Provider>
  );
}

/* ── Dialog ───────────────────────────────────────────────────────────────── */

function itemStatus(i: Item) {
  if (i.staged) return "staged" as const;
  if (!i.task) return i.reading ? ("reading" as const) : ("waiting" as const);
  return i.task.state;
}

function UploadDialog({
  open,
  onOpenChange,
  data,
  items,
  batch,
  setBatch,
  stage,
  startAll,
  removeItem,
  retitle,
  retry,
  clearFinished,
  onEdit,
  discardUnfinished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: MediaLibraryData;
  items: Item[];
  batch: Batch;
  setBatch: (p: Partial<Batch>) => void;
  stage: (files: File[]) => void;
  startAll: () => void;
  removeItem: (key: string) => void;
  retitle: (key: string, title: string) => void;
  retry: (i: Item) => void;
  clearFinished: () => void;
  onEdit: (a: MediaAssetView) => void;
  discardUnfinished: (id: string) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const staged = items.filter((i) => i.staged);
  const queue = items.filter((i) => !i.staged);
  const stagedBytes = staged.reduce((n, i) => n + i.file.size, 0);
  const finished = queue.filter(
    (i) => i.task && ["done", "cancelled"].includes(i.task.state),
  ).length;
  const unfinished = data.unfinished.filter(
    (u) => !items.some((i) => i.task?.id === u.id && i.task.state !== "error"),
  );
  const clients = mergeSuggestions(data.facets.clients, MEDIA_CLIENT_SUGGESTIONS);
  const collections = mergeSuggestions(data.facets.collections);
  const rights = mergeSuggestions([], MEDIA_RIGHTS_SUGGESTIONS);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden border-white/[0.1] bg-[linear-gradient(180deg,oklch(0.17_0.02_280),oklch(0.12_0.012_280))] p-0 sm:max-h-[calc(100dvh-4rem)]"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDrag(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDrag(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          stage([...e.dataTransfer.files]);
        }}
      >
        <DialogHeader className="border-b border-white/[0.07] px-5 pt-5 pb-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <UploadCloud className="size-5 text-violet-300" aria-hidden />
            Upload to the media library
          </DialogTitle>
          <DialogDescription>
            Any number of files, up to {formatBytes(MEDIA.maxFileBytes)} each. Uploads resume if the
            connection drops.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Drop zone */}
          <div
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors sm:flex-row sm:text-left",
              drag
                ? "border-[var(--partner)] bg-[color-mix(in_oklab,var(--partner)_10%,transparent)]"
                : "border-white/[0.16] bg-white/[0.02]",
            )}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-400/30 to-violet-400/[0.04] text-violet-200 ring-1 ring-violet-400/30 ring-inset">
              <FilePlus2 className="size-6" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Drop files here, or choose them</div>
              <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Video, images, audio, 3D (GLB, glTF, USDZ), PDF, ZIP, fonts, JSON, CSV, TXT.
              </div>
            </div>
            <Button type="button" className={tap} onClick={() => input.current?.click()}>
              <UploadCloud aria-hidden />
              Choose files
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={MEDIA_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose files to upload"
              data-testid="media-file-input"
              onChange={(e) => {
                stage([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>

          {unfinished.length ? (
            <section aria-labelledby="unfinished-h" className={cn(well, "p-3")}>
              <h3 id="unfinished-h" className="flex items-center gap-2 text-sm font-medium">
                <RotateCcw className="size-4 text-amber-300" aria-hidden />
                {unfinished.length === 1
                  ? "1 upload didn't finish"
                  : `${unfinished.length} uploads didn't finish`}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Add the same file again and it carries on from where it stopped. Unfinished uploads
                are cleared after 7 days.
              </p>
              <ul className="mt-2 divide-y divide-white/[0.06]">
                {unfinished.map((u) => {
                  const Icon = KIND_ICON[u.kind];
                  return (
                    <li key={u.id} className="flex items-center gap-3 py-2">
                      <Icon className="size-4 shrink-0 text-white/55" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatBytes(u.size)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 text-xs hover:bg-white/[0.06] sm:h-8"
                        onClick={() => input.current?.click()}
                      >
                        Resume
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 text-muted-foreground hover:bg-red-400/10 hover:text-red-200 sm:size-8"
                        aria-label={`Discard unfinished upload ${u.name}`}
                        onClick={() => void discardUnfinished(u.id)}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {staged.length ? (
            <>
              <section aria-labelledby="batch-h">
                <h3 id="batch-h" className="text-sm font-semibold">
                  Applies to all {staged.length} file{staged.length === 1 ? "" : "s"}
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Classify the batch once. Each file can be edited after it uploads.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <FieldRow label="Client / property" htmlFor="batch-client">
                    <ComboField
                      id="batch-client"
                      value={batch.client}
                      onChange={(client) => setBatch({ client })}
                      suggestions={clients}
                      placeholder="EVADE, MEDIALIFE…"
                      maxLength={MEDIA.limits.client}
                    />
                  </FieldRow>
                  <FieldRow label="Collection" htmlFor="batch-collection">
                    <ComboField
                      id="batch-collection"
                      value={batch.collection}
                      onChange={(collection) => setBatch({ collection })}
                      suggestions={collections}
                      placeholder="e.g. Cola Run gameplay"
                      maxLength={MEDIA.limits.collection}
                    />
                  </FieldRow>
                  <FieldRow label="Purpose" htmlFor="batch-purpose">
                    <Select
                      value={batch.purpose}
                      onValueChange={(v) => setBatch({ purpose: v as Batch["purpose"] })}
                    >
                      <SelectTrigger id="batch-purpose" className={cn(tap, "bg-black/20")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Guess from each file</SelectItem>
                        {MEDIA_PURPOSES.map((p) => (
                          <SelectItem key={p} value={p}>
                            {MEDIA_PURPOSE_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldRow>
                  <FieldRow label="Rights / source" htmlFor="batch-rights">
                    <ComboField
                      id="batch-rights"
                      value={batch.rights}
                      onChange={(r) => setBatch({ rights: r })}
                      suggestions={rights}
                      placeholder="Client-supplied, recorded in-house…"
                      maxLength={MEDIA.limits.rights}
                    />
                  </FieldRow>
                  <FieldRow label="Tags" id="batch-tags-l" className="sm:col-span-2">
                    <TagEditor
                      labelledBy="batch-tags-l"
                      value={batch.tags}
                      onChange={(tags) => setBatch({ tags })}
                      known={data.facets.tags}
                    />
                  </FieldRow>
                  <ToggleRow
                    id="batch-public"
                    label="Public"
                    hint="Gets a link pages can embed. Off: team and API token only."
                    checked={batch.public}
                    onChange={(v) => setBatch({ public: v })}
                  />
                  <ToggleRow
                    id="batch-ai"
                    label="AI-generated"
                    hint="Was this made with AI? Agents filter on it."
                    checked={batch.aiGenerated}
                    onChange={(v) => setBatch({ aiGenerated: v })}
                  />
                  <FieldRow label="Uploaded by" htmlFor="batch-uploader" className="sm:col-span-2">
                    <Input
                      id="batch-uploader"
                      value={batch.uploader}
                      onChange={(e) => setBatch({ uploader: e.target.value })}
                      placeholder="Your name (remembered on this device)"
                      maxLength={MEDIA.limits.uploader}
                      className={cn(tap, "bg-black/20")}
                    />
                  </FieldRow>
                </div>
              </section>

              <section aria-labelledby="staged-h">
                <h3 id="staged-h" className="text-sm font-semibold">
                  Ready to upload · {formatBytes(stagedBytes)}
                </h3>
                <ul className="mt-2 space-y-2">
                  {staged.map((i) => (
                    <StagedRow
                      key={i.key}
                      item={i}
                      onTitle={(t) => retitle(i.key, t)}
                      onRemove={() => removeItem(i.key)}
                    />
                  ))}
                </ul>
              </section>
            </>
          ) : null}

          {queue.length ? (
            <section aria-labelledby="queue-h">
              <div className="flex items-center justify-between gap-2">
                <h3 id="queue-h" className="text-sm font-semibold">
                  Queue
                </h3>
                {finished ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 text-xs text-muted-foreground hover:bg-white/[0.06] sm:h-8"
                    onClick={clearFinished}
                  >
                    Clear finished
                  </Button>
                ) : null}
              </div>
              <ul className="mt-2 space-y-2" aria-label="Upload queue">
                {queue.map((i) => (
                  <QueueRow
                    key={i.key}
                    item={i}
                    onRetry={() => retry(i)}
                    onRemove={() => removeItem(i.key)}
                    onEdit={onEdit}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {!items.length && !unfinished.length ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Nothing added yet. Big files are fine: each one goes up in 4 MB pieces.
            </p>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-white/[0.07] px-5 py-3 sm:justify-between">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {queue.length
              ? `${queue.filter((i) => i.task?.state === "done").length} of ${queue.length} uploaded`
              : staged.length
                ? `${staged.length} file${staged.length === 1 ? "" : "s"} staged`
                : ""}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className={cn(tap, "bg-transparent hover:bg-white/[0.06]")}
              onClick={() => onOpenChange(false)}
            >
              {queue.some((i) => i.task?.state === "uploading")
                ? "Keep uploading in background"
                : "Close"}
            </Button>
            {staged.length ? (
              <Button
                type="button"
                className={tap}
                onClick={startAll}
                data-testid="media-start-upload"
              >
                <UploadCloud aria-hidden />
                Upload {staged.length}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn(well, "flex items-center gap-3 px-3 py-2.5")}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function StagedRow({
  item,
  onTitle,
  onRemove,
}: {
  item: Item;
  onTitle: (t: string) => void;
  onRemove: () => void;
}) {
  const mime = resolveMediaMime(item.file.name, item.file.type);
  const kind = mime ? kindOf(mime) : "data";
  const Icon = KIND_ICON[kind];
  const big = item.file.size > MEDIA.warnFileBytes;
  return (
    <li className={cn(well, "px-3 py-2.5")}>
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08]">
          <Icon className="size-4 text-white/70" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Input
            value={item.title}
            onChange={(e) => onTitle(e.target.value)}
            aria-label={`Title for ${item.file.name}`}
            maxLength={MEDIA.limits.title}
            className="h-9 border-transparent bg-transparent px-1.5 text-sm font-medium shadow-none hover:border-white/10 focus-visible:border-input"
          />
          <div className="truncate px-1.5 text-[11px] text-muted-foreground">
            {item.file.name} · {MEDIA_KIND_LABELS[kind]} · {formatBytes(item.file.size)}
            {item.resumes ? " · resumes where it stopped" : ""}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-muted-foreground hover:bg-white/[0.06] sm:size-9"
          aria-label={`Remove ${item.file.name} from the batch`}
          onClick={onRemove}
        >
          <X aria-hidden />
        </Button>
      </div>
      {big ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          {formatBytes(item.file.size)} will upload fine, but a 1080p web export is usually under 1
          GB and loads faster on the site.
        </p>
      ) : null}
    </li>
  );
}

function QueueRow({
  item,
  onRetry,
  onRemove,
  onEdit,
}: {
  item: Item;
  onRetry: () => void;
  onRemove: () => void;
  onEdit: (a: MediaAssetView) => void;
}) {
  const t = item.task;
  const status = itemStatus(item);
  const pct = Math.round((t?.progress.fraction ?? 0) * 100);
  const sent = t?.progress.sentBytes ?? 0;
  const label =
    status === "reading"
      ? "Reading the file…"
      : status === "waiting"
        ? "Waiting"
        : status === "uploading"
          ? t?.progress.phase === "finishing"
            ? "Finishing…"
            : `${formatBytes(sent)} of ${formatBytes(item.file.size)}`
          : status === "paused"
            ? `Paused at ${pct}%`
            : status === "done"
              ? "Uploaded"
              : status === "cancelled"
                ? "Cancelled"
                : status === "error"
                  ? "Failed"
                  : "";
  const bar =
    status === "error"
      ? "bg-red-400"
      : status === "done"
        ? "bg-emerald-400"
        : status === "paused"
          ? "bg-amber-400"
          : "bg-[linear-gradient(90deg,var(--partner),var(--partner-2))]";
  return (
    <li className={cn(well, "px-3 py-2.5")} data-testid="media-queue-row" data-state={status}>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg",
            item.preview && "bg-black/40 ring-1 ring-white/[0.08]",
          )}
        >
          {item.preview ? (
            <img
              src={item.preview}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-80"
            />
          ) : null}
          {item.preview ? <span className="absolute inset-0 bg-black/35" aria-hidden /> : null}
          {status === "done" ? (
            <Check className="relative size-5 text-emerald-300" aria-hidden />
          ) : status === "error" ? (
            <CircleAlert className="relative size-5 text-red-300" aria-hidden />
          ) : status === "uploading" || status === "reading" ? (
            <Loader2
              className="relative size-5 animate-spin text-violet-200 motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <span className="relative text-xs font-semibold text-white/80 tabular-nums">
              {pct}%
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.title || item.file.name}</div>
          <div className="truncate text-[11px] text-muted-foreground tabular-nums">
            {label}
            {status === "uploading" ? ` · ${pct}%` : ""}
            {t?.resumed && status !== "done" ? " · resumed" : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {status === "uploading" ? (
            <IconBtn label={`Pause ${item.file.name}`} onClick={() => t?.pause()}>
              <Pause aria-hidden />
            </IconBtn>
          ) : null}
          {status === "paused" ? (
            <IconBtn label={`Resume ${item.file.name}`} onClick={onRetry}>
              <Play aria-hidden />
            </IconBtn>
          ) : null}
          {status === "error" && t?.error?.status !== 415 && t?.error?.status !== 413 ? (
            <IconBtn label={`Retry ${item.file.name}`} onClick={onRetry}>
              <RotateCcw aria-hidden />
            </IconBtn>
          ) : null}
          {status === "done" && t?.result ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 text-xs hover:bg-white/[0.06] sm:h-8"
              onClick={() => onEdit(t.result!)}
            >
              <PencilLine aria-hidden />
              Edit details
            </Button>
          ) : null}
          {status === "uploading" ||
          status === "paused" ||
          status === "error" ||
          status === "waiting" ? (
            <IconBtn
              label={`Cancel ${item.file.name}`}
              onClick={() => {
                if (t) void t.cancel();
                else onRemove();
              }}
            >
              <X aria-hidden />
            </IconBtn>
          ) : status === "cancelled" ? (
            <IconBtn label="Dismiss" onClick={onRemove}>
              <X aria-hidden />
            </IconBtn>
          ) : null}
        </div>
      </div>
      {status === "error" ? (
        <p className="mt-1.5 text-xs leading-relaxed text-red-200" role="alert">
          {t?.error?.message ?? "The upload failed."}
        </p>
      ) : status !== "done" && status !== "cancelled" ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${item.file.name} upload progress`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
              bar,
            )}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
      ) : null}
      {t?.warning && status !== "done" ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200">{t.warning}</p>
      ) : null}
    </li>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground sm:size-8"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/* ── Dock: progress while the dialog is closed ────────────────────────────── */

function UploadDock({
  items,
  hidden,
  onOpen,
}: {
  items: Item[];
  hidden: boolean;
  onOpen: () => void;
}) {
  const live = items.filter((i) => !i.staged && (!i.task || i.task.state !== "cancelled"));
  const active = live.filter((i) => !i.task || ["uploading", "queued"].includes(i.task.state));
  const failed = live.filter((i) => i.task?.state === "error").length;
  const paused = live.filter((i) => i.task?.state === "paused").length;
  if (hidden || (!active.length && !failed && !paused)) return null;
  const total = live.reduce((n, i) => n + i.file.size, 0);
  const sent = live.reduce((n, i) => n + (i.task?.progress.sentBytes ?? 0), 0);
  const frac = total ? sent / total : 0;
  const done = live.filter((i) => i.task?.state === "done").length;
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass-strong fixed right-4 bottom-[var(--dock-bottom)] z-40 flex h-14 items-center gap-3 rounded-2xl pr-4 pl-2 text-left focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none md:bottom-6"
      style={{ "--dock-bottom": GLASS_TAB_BAR_CLEARANCE } as React.CSSProperties}
      aria-label={`Uploads: ${done} of ${live.length} done, ${Math.round(frac * 100)}%. Open the upload queue.`}
      data-testid="media-upload-dock"
    >
      <svg viewBox="0 0 40 40" className="size-10 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r={r} className="fill-none stroke-white/10" strokeWidth="4" />
        <circle
          cx="20"
          cy="20"
          r={r}
          className={cn(
            "fill-none transition-[stroke-dashoffset] duration-300",
            failed ? "stroke-red-400" : "stroke-[var(--partner)]",
          )}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span className="min-w-0">
        <span className="block text-sm font-medium">
          {active.length
            ? `Uploading ${done + 1 > live.length ? live.length : done + 1} of ${live.length}`
            : failed
              ? `${failed} upload${failed === 1 ? "" : "s"} failed`
              : `${paused} paused`}
        </span>
        <span className="block text-xs text-muted-foreground tabular-nums">
          {Math.round(frac * 100)}% · {formatBytes(sent)} of {formatBytes(total)}
        </span>
      </span>
    </button>
  );
}
