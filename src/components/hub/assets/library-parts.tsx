/**
 * The asset library's furniture: where-to-look navigation (a sidebar on wide
 * screens, chips on phones), folder cards and the folder dialog, the brand-kit
 * checklist, the bar for a multi-file selection, and tag management.
 */
import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  Circle,
  Download,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Pencil,
  Star,
  Tag,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ASSET_LIMITS,
  ASSET_SECTIONS,
  SECTION_META,
  type AssetSection,
  type KitItem,
} from "@/lib/hub/assets";
import type { AssetFolder } from "@/lib/hub/model";
import { formatBytes } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

import { SECTION_ICON, VIEW_ICON, errorText } from "./shared";
import { AddTagPopover } from "./tag-picker";

export const DRAG_TYPE = "application/x-hub-assets";

export type Place = "all" | "starred" | "medialife" | AssetSection;
export const PLACE_LABEL = (p: Place) =>
  p === "all"
    ? "All files"
    : p === "starred"
      ? "Starred"
      : p === "medialife"
        ? "From MEDIALIFE"
        : SECTION_META[p].label;

/** Where library files can be dropped: a section, or a folder in one. */
export type DropTarget = { section: AssetSection; folderId: string | null };

/** Props for a drop target that takes dragged library files. */
export function useDropTarget(onDropIds: (ids: string[]) => void) {
  const [over, setOver] = useState(false);
  const props = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG_TYPE);
      setOver(false);
      if (!raw) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids) && ids.length) onDropIds(ids);
      } catch {
        /* not ours */
      }
    },
  };
  return { over, props };
}

/* ---------------------------------------------------------------------------
   Navigation
   --------------------------------------------------------------------------- */

type NavProps = {
  place: Place;
  folderId: string | null;
  counts: Record<Place, number>;
  folders: AssetFolder[];
  folderCounts: Record<string, number>;
  showMedialife: boolean;
  totalBytes: number;
  totalFiles: number;
  onGo: (place: Place, folderId?: string | null) => void;
  onDropTo: (t: DropTarget, ids: string[]) => void;
  onNewFolder: (section: AssetSection) => void;
};

function NavRow({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  drop,
  indent,
}: {
  icon: typeof FolderIcon;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  drop?: (ids: string[]) => void;
  indent?: boolean;
}) {
  const { over, props } = useDropTarget(drop ?? (() => {}));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      {...(drop ? props : {})}
      className={cn(
        "flex h-9 w-full min-w-0 items-center gap-2 rounded-xl px-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        indent && "pl-7",
        active
          ? "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--partner)_24%,transparent),transparent)] font-medium text-foreground shadow-[inset_2px_0_0_0_var(--partner)]"
          : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
        over && "bg-primary/20 text-foreground ring-1 ring-primary",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-[var(--partner)]")} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </button>
  );
}

/** Wide screens: a column of places, with the open section's folders under it. */
export function LibrarySidebar(p: NavProps) {
  const views: Place[] = ["all", "starred", ...(p.showMedialife ? (["medialife"] as const) : [])];
  return (
    <nav aria-label="Asset library" className="flex flex-col gap-4">
      <div className="space-y-0.5">
        {views.map((v) => (
          <NavRow
            key={v}
            icon={VIEW_ICON[v as keyof typeof VIEW_ICON]}
            label={PLACE_LABEL(v)}
            count={p.counts[v]}
            active={p.place === v}
            onClick={() => p.onGo(v)}
          />
        ))}
      </div>
      <div>
        <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Sections
        </div>
        <div className="space-y-0.5">
          {ASSET_SECTIONS.map((s) => {
            const open = p.place === s;
            const folders = p.folders.filter((f) => f.section === s);
            return (
              <div key={s}>
                <NavRow
                  icon={SECTION_ICON[s]}
                  label={SECTION_META[s].label}
                  count={p.counts[s]}
                  active={open && !p.folderId}
                  onClick={() => p.onGo(s)}
                  drop={(ids) => p.onDropTo({ section: s, folderId: null }, ids)}
                />
                {open ? (
                  <div className="mt-0.5 space-y-0.5">
                    {folders.map((f) => (
                      <NavRow
                        key={f.id}
                        indent
                        icon={FolderIcon}
                        label={f.name}
                        count={p.folderCounts[f.id] ?? 0}
                        active={p.folderId === f.id}
                        onClick={() => p.onGo(s, f.id)}
                        drop={(ids) => p.onDropTo({ section: s, folderId: f.id }, ids)}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => p.onNewFolder(s)}
                      className="flex h-8 w-full items-center gap-2 rounded-md pr-2 pl-7 text-left text-sm text-muted-foreground hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <FolderPlus className="size-4" aria-hidden /> New folder
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border px-2 pt-3 text-xs text-muted-foreground">
        <HardDrive className="size-3.5" aria-hidden />
        <span className="tabular-nums">
          {p.totalFiles} file{p.totalFiles === 1 ? "" : "s"} · {formatBytes(p.totalBytes)}
        </span>
      </div>
    </nav>
  );
}

/** Phones and narrow panes: one scrolling row of places. */
export function LibraryChips(p: NavProps) {
  const places: Place[] = [
    "all",
    "starred",
    ...(p.showMedialife ? (["medialife"] as const) : []),
    ...ASSET_SECTIONS,
  ];
  return (
    <nav
      aria-label="Asset library"
      className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 [scrollbar-width:none]"
    >
      <ul className="flex w-max gap-1.5 pb-1">
        {places.map((pl) => {
          const Icon =
            pl === "all" || pl === "starred" || pl === "medialife"
              ? VIEW_ICON[pl]
              : SECTION_ICON[pl];
          const active = p.place === pl;
          return (
            <li key={pl}>
              <button
                type="button"
                onClick={() => p.onGo(pl)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  active
                    ? "border-[var(--partner)]/55 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--partner)_24%,transparent),color-mix(in_oklab,var(--partner-2)_18%,transparent))] text-foreground"
                    : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden />
                {PLACE_LABEL(pl)}
                <span className="text-xs text-muted-foreground tabular-nums">{p.counts[pl]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---------------------------------------------------------------------------
   Folders
   --------------------------------------------------------------------------- */

export function FolderCard({
  folder,
  count,
  onOpen,
  onRename,
  onDelete,
  onDropIds,
}: {
  folder: AssetFolder;
  count: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropIds: (ids: string[]) => void;
}) {
  const { over, props } = useDropTarget(onDropIds);
  return (
    <li
      {...props}
      className={cn(
        "group relative flex min-w-0 items-center rounded-xl border border-border bg-white/[0.02] transition-colors hover:border-primary/50",
        over && "border-primary bg-primary/10",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12">
          <FolderIcon className="size-4 text-primary" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{folder.name}</span>
          <span className="block text-xs text-muted-foreground tabular-nums">
            {count} file{count === 1 ? "" : "s"}
          </span>
        </span>
      </button>
      <FolderMenu onRename={onRename} onDelete={onDelete} name={folder.name} />
    </li>
  );
}

export function FolderMenu({
  name,
  onRename,
  onDelete,
  className,
}: {
  name: string;
  onRename: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className,
          )}
          aria-label={`Folder options for ${name}`}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil aria-hidden /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete} className="text-red-300 focus:text-red-200">
          <Trash2 aria-hidden /> Delete folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** New folder, or rename one. */
export function FolderDialog({
  open,
  onOpenChange,
  folder,
  section: initialSection,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Set to rename. */
  folder: AssetFolder | null;
  section: AssetSection;
  onSubmit: (name: string, section: AssetSection) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [section, setSection] = useState<AssetSection>(initialSection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(folder?.name ?? "");
    setSection((folder?.section as AssetSection) ?? initialSection);
    setError(null);
  }, [open, folder, initialSection]);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return setError("Give the folder a name.");
            setBusy(true);
            setError(null);
            try {
              await onSubmit(name.trim(), section);
              onOpenChange(false);
            } catch (err) {
              setError(errorText(err, "Couldn't save the folder. Try again."));
            } finally {
              setBusy(false);
            }
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{folder ? "Rename folder" : "New folder"}</DialogTitle>
            <DialogDescription>
              {folder
                ? "Files inside keep their place."
                : "Folders keep a section tidy: a drop, a campaign, a character."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="folder-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="folder-name"
              value={name}
              autoFocus
              maxLength={ASSET_LIMITS.folderName}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer drop 2026"
              aria-invalid={!!error}
              aria-describedby={error ? "folder-error" : undefined}
            />
          </div>
          {!folder ? (
            <div className="grid gap-1.5">
              <label htmlFor="folder-section" className="text-sm font-medium">
                In section
              </label>
              <select
                id="folder-section"
                value={section}
                onChange={(e) => setSection(e.target.value as AssetSection)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {ASSET_SECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SECTION_META[s].label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {error ? (
            <p id="folder-error" role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              {folder ? "Save" : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFolderDialog({
  folder,
  count,
  onOpenChange,
  onConfirm,
}: {
  folder: AssetFolder | null;
  count: number;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog open={!!folder} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the “{folder?.name}” folder?</AlertDialogTitle>
          <AlertDialogDescription>
            {count
              ? `Its ${count === 1 ? "file stays" : `${count} files stay`} in ${SECTION_META[(folder?.section ?? "other") as AssetSection].label}, just not in a folder.`
              : "It's empty, so nothing else changes."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>Delete folder</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------------------------------------------------------------------
   Brand kit
   --------------------------------------------------------------------------- */

const KIT_TAGS: Record<string, string[]> = {
  "logo-vector": ["Logo"],
  "logo-png": ["Logo", "Transparent"],
  guidelines: ["Brand guidelines"],
  fonts: ["Typography"],
  character: ["Character"],
};

export function BrandKit({
  items,
  onAdd,
}: {
  items: KitItem[];
  /** Opens the file picker with these tags ready. */
  onAdd: (tags: string[]) => void;
}) {
  const have = items.filter((i) => i.have).length;
  if (have === items.length) return null;
  return (
    <section
      aria-labelledby="kit-title"
      className="rounded-xl border border-border bg-gradient-to-br from-primary/[0.08] to-transparent p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="kit-title" className="text-sm font-medium">
          Your brand kit · {have} of {items.length}
        </h3>
        <p className="text-xs text-muted-foreground">
          With these, we can design merch without waiting on anything.
        </p>
      </div>
      <ul className="mt-3 grid gap-2 @xl/lib:grid-cols-2 @4xl/lib:grid-cols-3">
        {items.map((i) => (
          <li key={i.id}>
            {i.have ? (
              <div className="flex items-start gap-2.5 rounded-lg px-2.5 py-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm">{i.label}</div>
                  <div className="text-xs text-muted-foreground">Done</div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAdd(KIT_TAGS[i.id] ?? [])}
                className="group flex w-full items-start gap-2.5 rounded-lg border border-dashed border-border px-2.5 py-2 text-left hover:border-primary/50 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{i.label}</div>
                  <div className="text-xs text-muted-foreground">{i.hint}</div>
                </div>
                <Upload
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-primary"
                  aria-hidden
                />
                <span className="sr-only">Upload</span>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Selection bar
   --------------------------------------------------------------------------- */

export function SelectionBar({
  count,
  folders,
  yourTags,
  sharedTags,
  allStarred,
  deletable,
  busy,
  onMove,
  onAddTag,
  onRemoveTag,
  onStar,
  onDownload,
  onDelete,
  onClear,
}: {
  count: number;
  folders: AssetFolder[];
  yourTags: string[];
  /** Tags on any selected file, for "Remove tag". */
  sharedTags: string[];
  allStarred: boolean;
  /** How many of the selection this viewer may delete. */
  deletable: number;
  busy: boolean;
  onMove: (t: DropTarget) => void;
  onAddTag: (t: string) => void;
  onRemoveTag: (t: string) => void;
  onStar: (on: boolean) => void;
  onDownload: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50";
  const label = "hidden @2xl/lib:inline";
  return (
    <div
      role="toolbar"
      aria-label={`${count} selected`}
      className="glass-strong fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-40 mx-auto flex max-w-max items-center gap-0.5 rounded-[22px] p-1.5 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 md:bottom-6"
    >
      <span className="px-2 text-sm font-medium tabular-nums whitespace-nowrap">
        {busy ? (
          <Loader2 className="inline size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : null}{" "}
        {count} selected
      </span>
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={btn} disabled={busy} aria-label="Move to">
            <FolderInput className="size-4" aria-hidden />
            <span className={label}>Move</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-56">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {ASSET_SECTIONS.map((s) => {
            const Icon = SECTION_ICON[s];
            const inS = folders.filter((f) => f.section === s);
            return inS.length ? (
              <DropdownMenuSub key={s}>
                <DropdownMenuSubTrigger>
                  <Icon aria-hidden /> {SECTION_META[s].label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => onMove({ section: s, folderId: null })}>
                    No folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {inS.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onSelect={() => onMove({ section: s, folderId: f.id })}
                    >
                      <FolderIcon aria-hidden /> {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem key={s} onSelect={() => onMove({ section: s, folderId: null })}>
                <Icon aria-hidden /> {SECTION_META[s].label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddTagPopover
        selected={[]}
        yourTags={yourTags}
        onAdd={onAddTag}
        align="center"
        trigger={
          <button type="button" className={btn} disabled={busy} aria-label="Add a tag">
            <Tag className="size-4" aria-hidden />
            <span className={label}>Tag</span>
          </button>
        }
      />
      {sharedTags.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btn} disabled={busy} aria-label="Remove a tag">
              <X className="size-4" aria-hidden />
              <span className={label}>Untag</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Remove tag</DropdownMenuLabel>
            {sharedTags.map((t) => (
              <DropdownMenuItem key={t} onSelect={() => onRemoveTag(t)}>
                {t}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={() => onStar(!allStarred)}
        aria-label={allStarred ? "Unstar" : "Star"}
      >
        <Star className={cn("size-4", allStarred && "fill-amber-300 text-amber-300")} aria-hidden />
        <span className={label}>{allStarred ? "Unstar" : "Star"}</span>
      </button>
      <button
        type="button"
        className={btn}
        disabled={busy}
        onClick={onDownload}
        aria-label="Download"
      >
        <Download className="size-4" aria-hidden />
        <span className={label}>Download</span>
      </button>
      {deletable ? (
        <button
          type="button"
          className={cn(btn, "hover:bg-red-400/10 hover:text-red-300")}
          disabled={busy}
          onClick={onDelete}
          aria-label="Delete"
        >
          <Trash2 className="size-4" aria-hidden />
          <span className={label}>Delete</span>
        </button>
      ) : null}
      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <button type="button" className={btn} onClick={onClear} aria-label="Clear selection (Esc)">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Tags: rename or remove one everywhere
   --------------------------------------------------------------------------- */

export function ManageTagsDialog({
  open,
  onOpenChange,
  tags,
  onRename,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tags: Array<{ tag: string; count: number }>;
  /** `to` null removes the tag from every file. */
  onRename: (from: string, to: string | null) => Promise<number>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(from: string, to: string | null) {
    setBusy(from);
    try {
      const n = await onRename(from, to);
      toast.success(
        to === null
          ? `Removed “${from}” from ${n} file${n === 1 ? "" : "s"}`
          : `Renamed to “${to}” on ${n} file${n === 1 ? "" : "s"}`,
      );
      setEditing(null);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] max-w-md flex-col">
        <DialogHeader>
          <DialogTitle>Tags</DialogTitle>
          <DialogDescription>
            Rename a tag to fix a typo or merge two (rename one to the other), or remove it from
            every file.
          </DialogDescription>
        </DialogHeader>
        {tags.length ? (
          <ul className="-mx-2 min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {tags.map(({ tag, count }) => (
              <li key={tag} className="flex items-center gap-2 px-2 py-2">
                {editing === tag ? (
                  <form
                    className="flex flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (value.trim() && value.trim() !== tag) void run(tag, value.trim());
                      else setEditing(null);
                    }}
                  >
                    <Input
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      maxLength={ASSET_LIMITS.tagLength}
                      autoFocus
                      aria-label={`New name for ${tag}`}
                      className="h-8"
                    />
                    <Button type="submit" size="sm" disabled={busy === tag}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{tag}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Rename ${tag}`}
                      onClick={() => {
                        setEditing(tag);
                        setValue(tag);
                      }}
                      disabled={!!busy}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${tag} from every file`}
                      onClick={() => void run(tag, null)}
                      disabled={!!busy}
                      className="hover:text-red-300"
                    >
                      {busy === tag ? (
                        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
                      ) : (
                        <Trash2 aria-hidden />
                      )}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
