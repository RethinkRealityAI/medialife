import { useMemo, useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Box,
  Check,
  Copy,
  Download,
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HEAVY_MODEL_BYTES, formatBytes, isGenerated, type AssetListItem } from "@/lib/ar/assets";
import { assetUrl } from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { assetsQueryKey, copyText, deleteAssetRequest } from "./api";
import { assetPreviewUrl, useAssets } from "./assets-query";
import type { LibraryRequest } from "./editor-context";
import { Segmented } from "./fields";
import { MediaError, uploadFile } from "./media";

// The asset library: every uploaded model and image, shared by all endcaps.
// Opened from the header (manage) or from a picker (choose one file).

interface QueueItem {
  key: string;
  name: string;
  size: number;
  progress: number;
  label: string;
  status: "working" | "done" | "error";
  error?: string;
  warning?: string;
  assetId?: string;
}

const CHECKER =
  "bg-[conic-gradient(oklch(0.18_0.01_280)_25%,oklch(0.14_0.01_280)_0_50%,oklch(0.18_0.01_280)_0_75%,oklch(0.14_0.01_280)_0)] bg-[length:16px_16px]";

export function AssetLibrary({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** set when choosing a file for a picker */
  request?: LibraryRequest | null;
}) {
  const qc = useQueryClient();
  const assets = useAssets();
  const [filter, setFilter] = useState<"all" | "model" | "image">("all");
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<AssetListItem | null>(null);
  const dragDepth = useRef(0);
  const search = useRef<HTMLInputElement>(null);
  const lastConfirmed = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const picking = !!request;
  const kind = request?.accept ?? filter;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets.data ?? [])
      .filter((a) => !isGenerated(a))
      .filter((a) => kind === "all" || a.kind === kind)
      .filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [assets.data, kind, query]);

  const patch = (key: string, p: Partial<QueueItem>) =>
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...p } : it)));

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    const entries = files.map((f, i) => ({
      file: f,
      item: {
        key: `${Date.now()}-${i}-${f.name}`,
        name: f.name,
        size: f.size,
        progress: 0,
        label: "Waiting",
        status: "working" as const,
      },
    }));
    setQueue((q) => [...entries.map((e) => e.item), ...q.filter((x) => x.status !== "done")]);
    // two at a time: fast enough, and gentle on the thumbnail renderer
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const { file, item } = entries[next++];
        try {
          const r = await uploadFile(file, (f, label) =>
            patch(item.key, { progress: Math.round(f * 100), label }),
          );
          patch(item.key, {
            status: "done",
            progress: 100,
            label: "Uploaded",
            warning: r.warning,
            assetId: r.asset.id,
          });
          await qc.invalidateQueries({ queryKey: assetsQueryKey });
        } catch (e) {
          const msg =
            e instanceof MediaError
              ? e.message
              : e instanceof Error
                ? `${file.name}: ${e.message}`
                : `${file.name}: upload failed`;
          patch(item.key, { status: "error", error: msg, label: "Failed" });
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  const onDrag = (e: DragEvent, kindOf: "enter" | "leave" | "over" | "drop") => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    if (kindOf === "enter") dragDepth.current++;
    if (kindOf === "leave") dragDepth.current--;
    if (kindOf === "drop") {
      dragDepth.current = 0;
      void addFiles(e.dataTransfer.files);
    }
    setDragging(dragDepth.current > 0);
  };

  async function doDelete(a: AssetListItem) {
    try {
      const r = await deleteAssetRequest(a.id, true);
      if (r.ok) toast.success(`Deleted ${a.name}`);
      await qc.invalidateQueries({ queryKey: assetsQueryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete the file");
    }
  }

  const title = picking
    ? (request?.title ?? (request?.accept === "model" ? "Choose a 3D model" : "Choose an image"))
    : "Asset library";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-[min(780px,92vh)] w-[min(1100px,96vw)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
          onDragEnter={(e) => onDrag(e, "enter")}
          onDragLeave={(e) => onDrag(e, "leave")}
          onDragOver={(e) => onDrag(e, "over")}
          onDrop={(e) => onDrag(e, "drop")}
        >
          <DialogHeader className="border-b border-border px-5 pt-5 pb-4 text-left">
            <DialogTitle className="text-base font-medium">{title}</DialogTitle>
            <DialogDescription className="text-xs">
              {picking
                ? "Pick a file, or drop new ones here to upload them."
                : "3D models (.glb) and images shared by every endcap. Drop files anywhere here to upload."}
            </DialogDescription>
            <div className="flex flex-wrap items-center gap-2 pt-3">
              <div className="relative min-w-0 flex-1 basis-56">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by file name"
                  aria-label="Search files"
                  className="bg-background/60 pl-8"
                />
              </div>
              {!picking ? (
                <div className="w-[300px] shrink-0">
                  <Segmented
                    label="Show"
                    hideLabel
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: "All" },
                      { value: "model", label: "Models", icon: <Box aria-hidden /> },
                      { value: "image", label: "Images", icon: <ImageIcon aria-hidden /> },
                    ]}
                  />
                </div>
              ) : null}
              <Button onClick={() => fileInput.current?.click()} className="shrink-0">
                <Upload aria-hidden /> Upload files
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                accept={
                  request?.accept === "model"
                    ? ".glb,model/gltf-binary"
                    : request?.accept === "image"
                      ? "image/png,image/jpeg,image/webp"
                      : ".glb,model/gltf-binary,image/png,image/jpeg,image/webp"
                }
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </DialogHeader>

          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {queue.length ? (
              <UploadQueue
                items={queue}
                onClear={() => setQueue((q) => q.filter((x) => x.status === "working"))}
              />
            ) : null}

            <div className="p-5">
              {assets.isPending ? (
                <Grid>
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className="overflow-hidden rounded-lg border border-border">
                      <Skeleton className="aspect-square rounded-none" />
                      <div className="space-y-1.5 p-2.5">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </Grid>
              ) : assets.isError ? (
                <Empty
                  icon={<AlertTriangle aria-hidden />}
                  title="Couldn't load the library"
                  body={assets.error instanceof Error ? assets.error.message : "Try again."}
                  action={
                    <Button variant="outline" onClick={() => assets.refetch()}>
                      Try again
                    </Button>
                  }
                />
              ) : items.length === 0 ? (
                <Empty
                  icon={<Upload aria-hidden />}
                  title={query ? "Nothing matches that search" : "No files yet"}
                  body={
                    query
                      ? "Try another name, or upload the file."
                      : request?.accept === "model"
                        ? "Drop a .glb model here, or use Upload files."
                        : request?.accept === "image"
                          ? "Drop a PNG, JPEG or WebP here, or use Upload files. Transparent PNGs work for cut-outs."
                          : "Drop .glb models and PNG, JPEG or WebP images here, or use Upload files."
                  }
                  action={
                    query ? null : (
                      <Button onClick={() => fileInput.current?.click()}>
                        <Upload aria-hidden /> Upload files
                      </Button>
                    )
                  }
                />
              ) : (
                <Grid>
                  {items.map((a) => (
                    <Tile
                      key={a.id}
                      asset={a}
                      picking={picking}
                      selected={request?.currentId === a.id}
                      onPick={() => {
                        request?.onPick(a);
                        onOpenChange(false);
                      }}
                      onDelete={() => {
                        lastConfirmed.current = a.id;
                        setConfirm(a);
                      }}
                    />
                  ))}
                </Grid>
              )}
            </div>

            {dragging ? (
              <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-xl border-2 border-dashed border-primary/70 bg-background/85 backdrop-blur-sm">
                <div className="text-center">
                  <Upload className="mx-auto size-7 text-primary" aria-hidden />
                  <p className="mt-2 text-sm font-medium">Drop to upload</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    .glb up to 20 MB · images up to 10 MB
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            // the menu item that opened this is gone: back to the file's menu
            // button (or the search box if the file was deleted), inside the library
            e.preventDefault();
            const id = lastConfirmed.current;
            const btn = id
              ? document.querySelector<HTMLElement>(`[data-asset-actions="${id}"]`)
              : null;
            (btn ?? search.current)?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {confirm?.usedBy.length ? (
                  <>
                    <p>
                      It's used in{" "}
                      {confirm.usedBy.length === 1
                        ? "this endcap"
                        : `${confirm.usedBy.length} endcaps`}
                      , including any published versions. They'll show a gap until you choose
                      another file:
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5 text-foreground">
                      {confirm.usedBy.map((u) => (
                        <li key={u.slug}>{u.name}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>No endcap uses it. This can't be undone.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirm && void doDelete(confirm)}
            >
              {confirm?.usedBy.length ? "Delete anyway" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <ul role="list" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
      {children}
    </ul>
  );
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-16 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-border bg-white/[0.03] text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

function Tile({
  asset: a,
  picking,
  selected,
  onPick,
  onDelete,
}: {
  asset: AssetListItem;
  picking: boolean;
  selected: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const preview = assetPreviewUrl(a);
  const heavy = a.kind === "model" && a.size > HEAVY_MODEL_BYTES;
  const media = (
    <div className={cn("relative grid aspect-square place-items-center", CHECKER)}>
      {preview ? (
        <img
          src={preview}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain p-2"
        />
      ) : (
        <Box className="size-8 text-muted-foreground" aria-hidden />
      )}
      {selected ? (
        <span className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" aria-hidden />
        </span>
      ) : null}
    </div>
  );
  const meta = (
    <div className="min-w-0 p-2.5">
      <p className="truncate text-xs font-medium" title={a.name}>
        {a.name}
      </p>
      <p className="mono mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground uppercase">
        <span>{a.kind === "model" ? "GLB" : a.mime.split("/")[1]}</span>
        <span aria-hidden>·</span>
        <span className={cn(heavy && "text-amber-300")}>{formatBytes(a.size)}</span>
        {a.width && a.height ? (
          <>
            <span aria-hidden>·</span>
            <span>
              {a.width}×{a.height}
            </span>
          </>
        ) : null}
      </p>
      {(heavy || a.usedBy.length) && !picking ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {heavy ? (
            <span
              className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300"
              title="Over 10 MB: may load slowly on phones"
            >
              Heavy
            </span>
          ) : null}
          {a.usedBy.length ? (
            <span
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={a.usedBy.map((u) => u.name).join(", ")}
            >
              Used in {a.usedBy.length}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (picking) {
    return (
      <li>
        <button
          type="button"
          onClick={onPick}
          aria-pressed={selected}
          className={cn(
            "group block w-full overflow-hidden rounded-lg border bg-card text-left transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            selected ? "border-primary" : "border-border",
          )}
        >
          {media}
          {meta}
        </button>
      </li>
    );
  }

  const url = assetUrl(a.id);
  return (
    <li className="group relative overflow-hidden rounded-lg border border-border bg-card">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Open ${a.name}`}
      >
        {media}
      </a>
      {meta}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Actions for ${a.name}`}
            data-asset-actions={a.id}
            className="absolute top-2 right-2 grid size-7 place-items-center rounded-md border border-border bg-background/80 text-muted-foreground opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={async () => {
              if (await copyText(`${window.location.origin}${url}`)) toast.success("Link copied");
            }}
          >
            <Copy aria-hidden /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={url} download={a.name}>
              <Download aria-hidden /> Download
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 aria-hidden /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function UploadQueue({ items, onClear }: { items: QueueItem[]; onClear: () => void }) {
  const busy = items.some((i) => i.status === "working");
  return (
    <div className="border-b border-border bg-white/[0.015] px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          {busy ? "Uploading" : "Uploads"}
        </p>
        {!busy ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
          >
            Clear
          </button>
        ) : null}
      </div>
      <ul className="space-y-2" aria-live="polite">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-3 text-xs">
            <span className="grid size-5 shrink-0 place-items-center">
              {it.status === "working" ? (
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              ) : it.status === "done" ? (
                <Check className="size-4 text-emerald-400" aria-hidden />
              ) : (
                <X className="size-4 text-destructive" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-medium">{it.name}</span>
                <span className="mono shrink-0 text-[10px] text-muted-foreground">
                  {formatBytes(it.size)} ·{" "}
                  {it.status === "working" ? `${it.label} ${it.progress}%` : it.label}
                </span>
              </div>
              {it.status === "working" ? (
                <div
                  className="mt-1 h-1 overflow-hidden rounded-full bg-primary/15"
                  role="progressbar"
                  aria-label={`Uploading ${it.name}`}
                  aria-valuenow={it.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${it.progress}%` }}
                  />
                </div>
              ) : null}
              {it.error ? <p className="mt-0.5 text-destructive">{it.error}</p> : null}
              {it.warning ? <p className="mt-0.5 text-amber-300">{it.warning}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
