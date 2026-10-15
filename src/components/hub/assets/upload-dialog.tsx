/**
 * The upload modal. Files arrive from a drop or "Upload from computer"; each is
 * sorted for you (a section and tags guessed from its name and type, or the
 * place you dropped it), and you can change any of it before uploading:
 * per file, or for all of them at once. Files already in the library (same
 * name and size) are skipped unless you say otherwise.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ASSET_SECTIONS,
  MEDIA_LABEL,
  SECTION_META,
  extOf,
  mediaTypeOf,
  normaliseTags,
  suggestFor,
  tagKey,
  type AssetSection,
} from "@/lib/hub/assets";
import { HUB, type AssetFolder, type HubFile } from "@/lib/hub/model";
import { UPLOAD_ACCEPT, formatBytes, uploadHubFile } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

import { TYPE_ICON } from "./shared";
import { AddTagPopover, TagChip } from "./tag-picker";

export type UploadTarget = {
  section: AssetSection | null;
  folderId: string | null;
  /** Added to every file (e.g. "Logo" from the brand-kit checklist). */
  tags?: string[];
};

type Item = {
  key: string;
  file: File;
  section: AssetSection;
  folderId: string | null;
  tags: string[];
  /** Set when the file can't be uploaded at all. */
  problem?: string;
  duplicate: boolean;
  /** For duplicates: upload it anyway. */
  keep: boolean;
  status: "ready" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  preview?: string;
};

const MAX_MB = `${Math.round(HUB.maxUploadBytes / 1_048_576)} MB`;
const ALLOWED_EXT = new Set(UPLOAD_ACCEPT.split(",").map((s) => s.slice(1)));
const PARALLEL = 2;

const selectClass =
  "h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

function makeItem(file: File, target: UploadTarget, library: HubFile[], i: number): Item {
  const ext = extOf(file.name);
  const guess = suggestFor(file.name, file.type);
  const problem = !ALLOWED_EXT.has(ext)
    ? `.${ext || "?"} files aren't supported. Zip it and upload the ZIP instead.`
    : file.size > HUB.maxUploadBytes
      ? `Too big: the limit is ${MAX_MB}. Zip it or send a smaller version.`
      : file.size === 0
        ? "This file is empty."
        : undefined;
  const duplicate = library.some((f) => f.name === file.name && f.size === file.size);
  return {
    key: `${Date.now()}-${i}-${file.name}-${file.size}`,
    file,
    // Where you dropped it wins; otherwise our guess.
    section: target.section ?? guess.section,
    folderId: target.section ? target.folderId : null,
    tags: normaliseTags([...(target.tags ?? []), ...guess.tags]),
    problem,
    duplicate,
    keep: false,
    status: problem ? "error" : "ready",
    progress: 0,
    error: problem,
    preview:
      !problem && /^image\/(png|jpe?g|webp|gif|avif|svg\+xml)$/.test(file.type)
        ? URL.createObjectURL(file)
        : undefined,
  };
}

export function UploadDialog({
  open,
  onOpenChange,
  initial,
  target,
  library,
  folders,
  yourTags,
  creatorId,
  onUploaded,
  append,
}: {
  /** More files dropped while the dialog is open; `n` changes with each drop. */
  append?: { files: File[]; n: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Files to start with (from a drop or the file picker). */
  initial: File[];
  target: UploadTarget;
  library: HubFile[];
  folders: AssetFolder[];
  yourTags: string[];
  /** Admin uploads name the creator. */
  creatorId?: string;
  onUploaded: (files: HubFile[]) => void | Promise<void>;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const more = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // A fresh batch each time the dialog opens with new files.
  useEffect(() => {
    if (!open) return;
    setItems(initial.map((f, i) => makeItem(f, target, library, seq.current++ * 1000 + i)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a new batch arrives
  }, [open, initial]);

  // Previews are object URLs: let them go with the items.
  const previews = useRef<string[]>([]);
  useEffect(() => {
    const now = items.map((i) => i.preview).filter(Boolean) as string[];
    for (const u of previews.current) if (!now.includes(u)) URL.revokeObjectURL(u);
    previews.current = now;
  }, [items]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  useEffect(() => {
    if (open && append?.files.length) add(append.files);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per drop
  }, [append?.n]);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const toSend = items.filter(
    (i) => !i.problem && (i.status === "ready" || i.status === "error") && (!i.duplicate || i.keep),
  );
  const skipped = items.filter((i) => i.duplicate && !i.keep && !i.problem && i.status !== "done");
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "error" && !i.problem);
  const overall = useMemo(() => {
    const active = items.filter((i) => i.status === "uploading" || i.status === "done");
    const bytes = active.reduce((s, i) => s + i.file.size, 0);
    return bytes ? active.reduce((s, i) => s + i.file.size * i.progress, 0) / bytes : 0;
  }, [items]);

  const sectionsInUse = new Set(items.map((i) => i.section));
  const allSection = sectionsInUse.size === 1 ? [...sectionsInUse][0] : "";
  const foldersFor = (s: AssetSection) => folders.filter((f) => f.section === s);

  function setAllSection(s: AssetSection) {
    setItems((xs) =>
      xs.map((x) =>
        x.status === "done"
          ? x
          : { ...x, section: s, folderId: x.section === s ? x.folderId : null },
      ),
    );
  }

  function add(files: FileList | File[]) {
    const list = [...files];
    if (!list.length) return;
    const t: UploadTarget = allSection
      ? {
          section: allSection,
          folderId: items.find((i) => i.section === allSection)?.folderId ?? null,
        }
      : target;
    setItems((xs) => [
      ...xs,
      ...list.map((f, i) => makeItem(f, t, library, seq.current++ * 1000 + i)),
    ]);
  }

  async function start() {
    const queue = [...toSend];
    if (!queue.length) return;
    setBusy(true);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const uploaded: HubFile[] = [];
    for (const i of queue) patch(i.key, { status: "uploading", progress: 0, error: undefined });

    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        const item = it;
        if (ctrl.signal.aborted) {
          patch(item.key, { status: "ready", progress: 0 });
          continue;
        }
        try {
          const f = await uploadHubFile(item.file, {
            kind: "artwork",
            category: "asset",
            section: item.section,
            folderId: item.folderId,
            tags: normaliseTags(item.tags),
            creatorId,
            signal: ctrl.signal,
            onProgress: (p) => patch(item.key, { progress: p }),
          });
          uploaded.push(f);
          patch(item.key, { status: "done", progress: 1 });
        } catch (e) {
          const cancelled = ctrl.signal.aborted;
          patch(item.key, {
            status: cancelled ? "ready" : "error",
            progress: 0,
            error: cancelled
              ? undefined
              : e instanceof Error
                ? e.message
                : "Upload failed. Try again.",
          });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    abort.current = null;
    setBusy(false);

    if (uploaded.length) {
      await onUploaded(uploaded);
      const where = new Set(uploaded.map((f) => f.section));
      const label =
        where.size === 1 ? SECTION_META[[...where][0] as AssetSection].label : "your library";
      toast.success(
        `${uploaded.length === 1 ? "1 file" : `${uploaded.length} files`} added to ${label}`,
      );
    }
    if (ctrl.signal.aborted) toast("Upload stopped. Files already sent are in your library.");
  }

  // Close by itself once everything went through.
  useEffect(() => {
    if (
      !busy &&
      items.length &&
      items.every((i) => i.status === "done" || (i.duplicate && !i.keep && !i.problem)) &&
      done.length
    )
      onOpenChange(false);
  }, [busy, items, done.length, onOpenChange]);

  const sendCount = toSend.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return; // stop first, so nothing is half-sent by accident
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col gap-0 p-0"
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-lg font-medium">
            {items.length === 1 ? "Upload 1 file" : `Upload ${items.length} files`}
          </DialogTitle>
          <DialogDescription>
            We sorted them by name and type. Check where they go and add tags, then upload.
          </DialogDescription>
        </DialogHeader>

        {/* Apply to all */}
        {items.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white/[0.02] px-5 py-3">
            <span className="text-xs font-medium text-muted-foreground">For all files</span>
            <label className="sr-only" htmlFor="up-all-section">
              Section for all files
            </label>
            <select
              id="up-all-section"
              className={selectClass}
              value={allSection}
              disabled={busy}
              onChange={(e) => setAllSection(e.target.value as AssetSection)}
            >
              {!allSection ? <option value="">Mixed sections</option> : null}
              {ASSET_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {SECTION_META[s].label}
                </option>
              ))}
            </select>
            {allSection && foldersFor(allSection).length ? (
              <>
                <label className="sr-only" htmlFor="up-all-folder">
                  Folder for all files
                </label>
                <select
                  id="up-all-folder"
                  className={selectClass}
                  disabled={busy}
                  value={
                    new Set(items.map((i) => i.folderId ?? "")).size === 1
                      ? (items[0]?.folderId ?? "")
                      : "__mixed"
                  }
                  onChange={(e) =>
                    setItems((xs) =>
                      xs.map((x) =>
                        x.status === "done" ? x : { ...x, folderId: e.target.value || null },
                      ),
                    )
                  }
                >
                  <option value="__mixed" disabled hidden>
                    Mixed folders
                  </option>
                  <option value="">No folder</option>
                  {foldersFor(allSection).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <AddTagPopover
              selected={[]}
              yourTags={yourTags}
              onAdd={(t) =>
                setItems((xs) =>
                  xs.map((x) =>
                    x.status === "done" ? x : { ...x, tags: normaliseTags([...x.tags, t]) },
                  ),
                )
              }
              trigger={
                <Button type="button" variant="outline" size="sm" className="h-8" disabled={busy}>
                  <Plus aria-hidden /> Tag all
                </Button>
              }
            />
          </div>
        ) : null}

        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto" aria-live="polite">
          {items.map((it) => (
            <UploadRow
              key={it.key}
              item={it}
              busy={busy}
              folders={foldersFor(it.section)}
              yourTags={yourTags}
              onChange={(p) => patch(it.key, p)}
              onRemove={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
            />
          ))}
        </ul>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => more.current?.click()}
              disabled={busy}
            >
              <Plus aria-hidden /> Add more
            </Button>
            <input
              ref={more}
              type="file"
              multiple
              accept={UPLOAD_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-label="Add more files"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {busy
                ? `${Math.round(overall * 100)}% · ${done.length} of ${done.length + items.filter((i) => i.status === "uploading").length} sent`
                : skipped.length
                  ? `${skipped.length} already in your library, skipped`
                  : failed.length
                    ? `${failed.length} didn't upload`
                    : `Up to ${MAX_MB} each`}
            </span>
          </div>
          <div className="flex gap-2">
            {busy ? (
              <Button type="button" variant="outline" onClick={() => abort.current?.abort()}>
                Stop
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {done.length ? "Done" : "Cancel"}
              </Button>
            )}
            <Button type="button" onClick={() => void start()} disabled={busy || !sendCount}>
              {busy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <Upload aria-hidden />
              )}
              {busy
                ? "Uploading…"
                : failed.length && sendCount === failed.length
                  ? `Retry ${sendCount}`
                  : `Upload ${sendCount || ""}`.trim()}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadRow({
  item: it,
  busy,
  folders,
  yourTags,
  onChange,
  onRemove,
}: {
  item: Item;
  busy: boolean;
  folders: AssetFolder[];
  yourTags: string[];
  onChange: (p: Partial<Item>) => void;
  onRemove: () => void;
}) {
  const type = mediaTypeOf({ name: it.file.name });
  const Icon = TYPE_ICON[type];
  const locked = busy || it.status === "done" || it.status === "uploading" || !!it.problem;
  const skip = it.duplicate && !it.keep && !it.problem;
  return (
    <li className={cn("flex gap-3 px-5 py-3", skip && "opacity-60")}>
      <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-white/[0.03]">
        {it.preview ? (
          <img src={it.preview} alt="" className="size-full object-contain" />
        ) : (
          <Icon className="size-5 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium" title={it.file.name}>
              {it.file.name}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {MEDIA_LABEL[type]} · {formatBytes(it.file.size)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            {it.status === "uploading" ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(it.progress * 100)}%
              </span>
            ) : it.status === "done" ? (
              <CheckCircle2 className="size-4 text-emerald-400" aria-label="Uploaded" />
            ) : null}
            {!busy && it.status !== "done" ? (
              <button
                type="button"
                onClick={onRemove}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Remove ${it.file.name}`}
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        {it.status === "uploading" ? (
          <div
            className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label={`Uploading ${it.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(it.progress * 100)}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.max(3, it.progress * 100)}%` }}
            />
          </div>
        ) : null}

        {it.error ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-300" role="alert">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden /> {it.error}
          </p>
        ) : null}

        {it.duplicate && !it.problem && it.status !== "done" ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-amber-300">
            <Copy className="size-3.5" aria-hidden />
            Already in your library.
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--primary)]"
                checked={it.keep}
                disabled={busy}
                onChange={(e) => onChange({ keep: e.target.checked })}
              />
              Upload again
            </label>
          </div>
        ) : null}

        {!it.problem ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <label className="sr-only" htmlFor={`sec-${it.key}`}>
              Section for {it.file.name}
            </label>
            <select
              id={`sec-${it.key}`}
              className={selectClass}
              value={it.section}
              disabled={locked}
              onChange={(e) =>
                onChange({ section: e.target.value as AssetSection, folderId: null })
              }
            >
              {ASSET_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {SECTION_META[s].label}
                </option>
              ))}
            </select>
            {folders.length ? (
              <>
                <label className="sr-only" htmlFor={`fol-${it.key}`}>
                  Folder for {it.file.name}
                </label>
                <select
                  id={`fol-${it.key}`}
                  className={selectClass}
                  value={it.folderId ?? ""}
                  disabled={locked}
                  onChange={(e) => onChange({ folderId: e.target.value || null })}
                >
                  <option value="">No folder</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {it.tags.map((t) => (
              <TagChip
                key={tagKey(t)}
                tag={t}
                onRemove={
                  locked ? undefined : () => onChange({ tags: it.tags.filter((x) => x !== t) })
                }
              />
            ))}
            {!locked ? (
              <AddTagPopover
                selected={it.tags}
                yourTags={yourTags}
                onAdd={(t) => onChange({ tags: normaliseTags([...it.tags, t]) })}
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Plus className="size-3" aria-hidden /> Tag
                  </button>
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
