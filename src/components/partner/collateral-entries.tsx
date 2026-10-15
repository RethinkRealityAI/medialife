/**
 * Managed collateral pieces (src/lib/hub/collateral.ts), shared by the Partner
 * Hub and the admin's collateral manager: the card, a viewer, and the form to
 * add or edit one (with its upload).
 */
import { useEffect, useRef, useState } from "react";
import {
  Download,
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { CopyButton } from "@/components/hub/app/ui";
import { Tag, surface } from "@/components/partner/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COLLATERAL_TABS,
  COLLATERAL_TAB_IDS,
  youtubeIdOf,
  type CollateralEntry,
  type CollateralTab,
} from "@/lib/hub/collateral";
import { fileUrl, isImage, type HubFile } from "@/lib/hub/model";
import { VIDEO_CATEGORIES, type VideoCategory } from "@/lib/hub/showcase";
import { uploadHubFile } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Resolving a piece to what the card shows
   --------------------------------------------------------------------------- */

export type EntryView = {
  entry: CollateralEntry;
  file: HubFile | null;
  /** An image to show on the card. */
  cover: string | null;
  /** A hosted video to play. */
  video: string | null;
  youtube: string | null;
  /** Where "Open" goes, and the download (files only). */
  href: string;
  download: string | null;
  format: string;
};

const extOf = (name: string) => name.split(".").pop()?.toUpperCase() ?? "FILE";

export function entryView(entry: CollateralEntry, files: HubFile[]): EntryView {
  const byId = (id: string | null) => (id ? (files.find((f) => f.id === id) ?? null) : null);
  const file = byId(entry.fileId);
  const preview = byId(entry.previewFileId);
  const cover = preview ? fileUrl(preview) : null;
  if (file) {
    const video = file.mime.startsWith("video/") ? fileUrl(file) : null;
    return {
      entry,
      file,
      cover: cover ?? (isImage(file.mime) ? fileUrl(file) : null),
      video,
      youtube: null,
      href: fileUrl(file),
      download: fileUrl(file, true),
      format: extOf(file.name),
    };
  }
  const link = entry.link ?? "";
  const youtube = youtubeIdOf(link);
  return {
    entry,
    file: null,
    cover: cover ?? (youtube ? `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg` : null),
    video: null,
    youtube,
    href: link,
    download: null,
    format: youtube ? "YouTube" : "Link",
  };
}

const byline = (e: CollateralEntry, partnerName?: string) =>
  e.addedBy.kind === "medialife"
    ? "MEDIALIFE"
    : `${partnerName ?? "Your team"} · ${e.addedBy.name.split(/[\s(]/)[0]}`;

/* ---------------------------------------------------------------------------
   The card
   --------------------------------------------------------------------------- */

export function EntryCard({
  view: v,
  origin,
  portrait,
  partnerName,
  canEdit,
  onOpen,
  onEdit,
  onDelete,
}: {
  view: EntryView;
  origin: string;
  /** Videos and GIFs: a tall card. */
  portrait?: boolean;
  partnerName?: string;
  canEdit?: boolean;
  onOpen: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const e = v.entry;
  const playable = !!(v.video || v.youtube);
  const absolute = v.href.startsWith("/") ? `${origin}${v.href}` : v.href;
  return (
    <li className={cn(surface, "group relative flex flex-col overflow-hidden")}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "relative block overflow-hidden bg-[var(--partner-ink,#0b0e1f)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none focus-visible:ring-inset",
          portrait ? "aspect-[9/14]" : "aspect-[16/10]",
        )}
        aria-label={`${playable ? "Play" : "Preview"} ${e.title}`}
      >
        {v.cover ? (
          <img
            src={v.cover}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        ) : v.video ? (
          <video
            src={`${v.video}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--partner)_30%,transparent),transparent_70%)]">
            {e.link ? (
              <Globe className="size-9 text-[var(--partner)]" aria-hidden />
            ) : (
              <FileText className="size-9 text-[var(--partner)]" aria-hidden />
            )}
          </span>
        )}
        {playable ? (
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 ring-1 ring-white/30 backdrop-blur-md"
          >
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        ) : null}
        <span className="absolute top-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
          {v.format}
        </span>
      </button>

      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
              aria-label={`Edit or remove ${e.title}`}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil className="size-4" aria-hidden /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDelete} className="text-red-300">
              <Trash2 className="size-4" aria-hidden /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-1.5">
          <Tag
            tone={e.addedBy.kind === "medialife" ? "violet" : "mint"}
            className="h-5 px-2 text-[10px]"
          >
            {byline(e, partnerName)}
          </Tag>
        </div>
        <h3 className="font-medium">{e.title}</h3>
        {e.when || e.what ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.when || e.what}</p>
        ) : null}
        {e.channels.length ? (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Works well on">
            {e.channels.map((c) => (
              <li key={c}>
                <Tag tone="blue" className="h-5 px-2 text-[10px]">
                  {c}
                </Tag>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {v.download ? (
            <Button asChild size="sm">
              <a href={v.download} download>
                <Download aria-hidden /> Download
              </a>
            </Button>
          ) : (
            <CopyButton value={absolute} label="Copy link" size="sm" variant="default" />
          )}
          <Button asChild size="sm" variant="outline">
            <a href={v.href} target="_blank" rel="noopener">
              <ExternalLink aria-hidden /> Open
            </a>
          </Button>
        </div>
      </div>
    </li>
  );
}

/** The dashed "add" tile at the end of a grid. */
export function AddTile({
  label,
  onClick,
  portrait,
}: {
  label: string;
  onClick: () => void;
  portrait?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "grid h-full w-full place-items-center rounded-2xl border border-dashed border-[var(--partner)]/40 bg-[var(--partner)]/[0.04] p-6 text-center transition-colors hover:border-[var(--partner)]/80 hover:bg-[var(--partner)]/10 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
          portrait ? "min-h-64" : "min-h-56",
        )}
      >
        <span>
          <span className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--partner)]/15 text-[var(--partner)]">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="mt-3 block text-sm font-medium">{label}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">A file or a link</span>
        </span>
      </button>
    </li>
  );
}

/* ---------------------------------------------------------------------------
   Viewing one
   --------------------------------------------------------------------------- */

export function EntryViewer({
  view: v,
  origin,
  onClose,
}: {
  view: EntryView | null;
  origin: string;
  onClose: () => void;
}) {
  const e = v?.entry;
  const absolute = v ? (v.href.startsWith("/") ? `${origin}${v.href}` : v.href) : "";
  return (
    <Dialog open={!!v} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-4xl gap-0 overflow-y-auto p-0">
        {v && e ? (
          <>
            <div className="grid min-h-48 place-items-center bg-black">
              {v.youtube ? (
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${v.youtube}?autoplay=1&rel=0&playsinline=1`}
                  title={e.title}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  className="aspect-video w-full"
                />
              ) : v.video ? (
                <video
                  src={v.video}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[70dvh] w-auto max-w-full"
                />
              ) : v.cover ? (
                <img src={v.cover} alt={e.title} className="max-h-[70dvh] w-auto object-contain" />
              ) : (
                <FileText className="size-12 text-[var(--partner)]" aria-hidden />
              )}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="max-w-2xl min-w-0">
                <DialogTitle className="text-lg">{e.title}</DialogTitle>
                <DialogDescription className="mt-1">{e.what || v.format}</DialogDescription>
                {e.when ? (
                  <p className="mt-2 text-sm">
                    <span className="font-medium text-[var(--partner)]">Use it: </span>
                    {e.when}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {v.download ? (
                  <Button asChild>
                    <a href={v.download} download>
                      <Download aria-hidden /> Download
                    </a>
                  </Button>
                ) : (
                  <CopyButton value={absolute} label="Copy link" variant="default" size="default" />
                )}
                <Button asChild variant="outline">
                  <a href={v.href} target="_blank" rel="noopener">
                    <ExternalLink aria-hidden /> Open
                  </a>
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Adding or editing one
   --------------------------------------------------------------------------- */

export type EntryInput = {
  id?: string;
  tab: CollateralTab;
  videoCategory?: VideoCategory;
  title: string;
  what: string;
  when: string;
  channels: string[];
  fileId: string | null;
  link: string | null;
  previewFileId: string | null;
};

type SaveResult = { ok: true } | { ok: false; error: string };

const SUGGESTED_CHANNELS = ["Discord", "DM", "Email", "Instagram", "TikTok", "X", "Calls", "Print"];

export function EntryDialog({
  open,
  onOpenChange,
  owner,
  initial,
  defaultTab,
  heading,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The library uploads go to. */
  owner: string;
  /** Editing this piece; omit to add one. */
  initial?: CollateralEntry | null;
  defaultTab: CollateralTab;
  heading?: string;
  onSave: (input: EntryInput) => Promise<SaveResult>;
}) {
  const [tab, setTab] = useState<CollateralTab>(defaultTab);
  const [videoCategory, setVideoCategory] = useState<VideoCategory>("product");
  const [title, setTitle] = useState("");
  const [what, setWhat] = useState("");
  const [when, setWhen] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [source, setSource] = useState<"file" | "link">("file");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  // Reset whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTab(initial?.tab ?? defaultTab);
    setVideoCategory(initial?.videoCategory ?? "product");
    setTitle(initial?.title ?? "");
    setWhat(initial?.what ?? "");
    setWhen(initial?.when ?? "");
    setChannels(initial?.channels ?? []);
    setSource(initial?.link ? "link" : "file");
    setLink(initial?.link ?? "");
    setFile(null);
    setCover(null);
    setError(null);
    setProgress(0);
    setBusy(false);
  }, [open, initial, defaultTab]);

  const keepsFile = !!initial?.fileId && source === "file" && !file;
  const ready =
    title.trim().length >= 2 &&
    (source === "link" ? /^https?:\/\/\S+\.\S+/.test(link.trim()) : !!file || keepsFile);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    abort.current = new AbortController();
    try {
      const up = async (f: File, share: [number, number]) =>
        uploadHubFile(f, {
          kind: "collateral",
          category: "partner-kit",
          creatorId: owner,
          signal: abort.current?.signal,
          onProgress: (p) => setProgress(share[0] + p * share[1]),
        });
      const total = (source === "file" && file ? 1 : 0) + (cover ? 1 : 0) || 1;
      let at = 0;
      let fileId = source === "file" ? (initial?.fileId ?? null) : null;
      if (source === "file" && file) {
        fileId = (await up(file, [0, 1 / total])).id;
        at = 1 / total;
      }
      let previewFileId = initial?.previewFileId ?? null;
      if (cover) previewFileId = (await up(cover, [at, 1 / total])).id;
      // An image file is its own cover.
      if (source === "file" && file && isImage(file.type) && !cover) previewFileId = null;
      const r = await onSave({
        id: initial?.id,
        tab,
        ...(tab === "videos" ? { videoCategory } : {}),
        title: title.trim(),
        what: what.trim(),
        when: when.trim(),
        channels,
        fileId,
        link: source === "link" ? link.trim() : null,
        previewFileId,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success(initial ? "Saved" : "Added to collateral");
      onOpenChange(false);
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        setError((err as Error).message || "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const toggleChannel = (c: string) =>
    setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c].slice(0, 6)));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) abort.current?.abort();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-xl overflow-y-auto">
        <DialogTitle>{heading ?? (initial ? "Edit collateral" : "Add collateral")}</DialogTitle>
        <DialogDescription>
          Upload a file (image, video, PDF, deck…) or add a link. It shows in the tab you pick.
        </DialogDescription>

        <form onSubmit={submit} className="mt-2 grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Tab</span>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as CollateralTab)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {COLLATERAL_TAB_IDS.map((t) => (
                  <option key={t} value={t}>
                    {COLLATERAL_TABS[t]}
                  </option>
                ))}
              </select>
            </label>
            {tab === "videos" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Video type</span>
                <select
                  value={videoCategory}
                  onChange={(e) => setVideoCategory(e.target.value as VideoCategory)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {(Object.keys(VIDEO_CATEGORIES) as VideoCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {VIDEO_CATEGORIES[c].title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div role="radiogroup" aria-label="Source" className="grid grid-cols-2 gap-2">
            {(
              [
                ["file", Upload, "Upload a file"],
                ["link", Link2, "Add a link"],
              ] as const
            ).map(([id, Icon, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={source === id}
                onClick={() => setSource(id)}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  source === id
                    ? "border-[var(--partner,var(--primary))] bg-[var(--partner,var(--primary))]/12"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          {source === "file" ? (
            <FilePick
              label={keepsFile ? "Replace the file (optional)" : "File"}
              file={file}
              onPick={(f) => {
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
              }}
            />
          ) : (
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Link</span>
              <Input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://… (YouTube links play right in the hub)"
                maxLength={500}
              />
            </label>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Title</span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">
              What it is <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Textarea
              value={what}
              onChange={(e) => setWhat(e.target.value)}
              maxLength={240}
              rows={2}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">
              When to use it <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <Input
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              maxLength={200}
              placeholder="e.g. After a first call, or pinned in Discord"
            />
          </label>
          <fieldset className="grid gap-1.5 text-sm">
            <legend className="mb-1.5 font-medium">Works well on</legend>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...SUGGESTED_CHANNELS, ...channels])].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={channels.includes(c)}
                  onClick={() => toggleChannel(c)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    channels.includes(c)
                      ? "border-[var(--partner,var(--primary))] bg-[var(--partner,var(--primary))]/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </fieldset>

          {source === "link" || (file && !isImage(file.type)) || (keepsFile && !cover) ? (
            <FilePick
              label="Cover image (optional)"
              accept="image/png,image/jpeg,image/webp,image/gif"
              file={cover}
              onPick={setCover}
            />
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            {busy ? (
              <span className="mr-auto text-xs text-muted-foreground tabular-nums">
                Uploading… {Math.round(progress * 100)}%
              </span>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || busy}>
              {busy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : initial ? (
                <Pencil aria-hidden />
              ) : (
                <Plus aria-hidden />
              )}
              {initial ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FilePick({
  label,
  file,
  onPick,
  accept,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
  accept?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
          <FileText className="size-4 shrink-0 text-[var(--partner,var(--primary))]" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {(file.size / 1_048_576).toFixed(1)} MB
          </span>
          <button
            type="button"
            onClick={() => {
              onPick(null);
              if (ref.current) ref.current.value = "";
            }}
            className="grid size-7 place-items-center rounded-md hover:bg-white/5"
            aria-label="Remove file"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="flex h-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground hover:border-[var(--partner,var(--primary))]/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Upload className="size-5" aria-hidden />
          <span className="text-xs">Choose a file (up to 250 MB)</span>
        </button>
      )}
    </div>
  );
}

/** Pieces for one tab, MEDIALIFE's first, then the partner team's. */
export function entriesFor(entries: CollateralEntry[], tab: CollateralTab) {
  const here = entries.filter((e) => e.tab === tab);
  return {
    medialife: here.filter((e) => e.addedBy.kind === "medialife"),
    team: here.filter((e) => e.addedBy.kind === "partner"),
  };
}
