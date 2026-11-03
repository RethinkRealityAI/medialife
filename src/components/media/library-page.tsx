/**
 * /admin/media: the Media Library. Kind tabs, search, filters (inline on wide
 * screens, a sheet on phones), sort, grid or list, multi-select with bulk tag /
 * move / public / delete, a page-wide drop zone, and the detail drawer.
 * Filters live in the URL (the route passes them in and takes changes back).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  FolderInput,
  Globe,
  Images,
  LayoutGrid,
  List,
  Loader2,
  Lock,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";

import { useRun } from "@/components/admin/creators/ui";
import { formatDate } from "@/components/admin/format";
import {
  CopyButton,
  EmptyState,
  NamespaceBadge,
  PageBody,
  PageHeader,
  Tag,
  surface,
  well,
} from "@/components/admin/kit";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import type { MediaLibraryData } from "@/lib/media/admin.server";
import {
  adminDeleteMedia,
  adminSeedMediaSample,
  adminUpdateMedia,
} from "@/lib/media/admin.functions";
import {
  MEDIA,
  MEDIA_CLIENT_SUGGESTIONS,
  MEDIA_KINDS,
  MEDIA_KIND_PLURAL,
  MEDIA_ORIENTATIONS,
  MEDIA_ORIENTATION_LABELS,
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_LABELS,
  MEDIA_SORTS,
  extOf,
  formatBytes,
  formatDuration,
  searchMedia,
  tagKey,
  type MediaAssetView,
  type MediaKind,
  type MediaOrientation,
  type MediaPatch,
  type MediaPurpose,
  type MediaSort,
} from "@/lib/media/model";
import { cn } from "@/lib/utils";

import { AssetDrawer } from "./details";
import {
  AiBadge,
  ComboField,
  cmdItem,
  KIND_ICON,
  TagChip,
  TagEditor,
  ThumbChip,
  VisibilityBadge,
  AssetThumb,
  FieldRow,
  mergeSuggestions,
  tap,
  tapIcon,
} from "./parts";
import { MediaUploadProvider, useMediaUpload } from "./upload";

/* ── Filters (the URL's shape) ────────────────────────────────────────────── */

export type MediaFilters = {
  q: string;
  kind?: MediaKind;
  tags: string[];
  client?: string;
  collection?: string;
  purpose?: MediaPurpose;
  vis?: "public" | "private";
  ai?: "yes" | "no";
  orient?: MediaOrientation;
  sort?: MediaSort;
  view: "grid" | "list";
  asset?: string;
};
export type MediaFiltersPatch = { [K in keyof MediaFilters]?: MediaFilters[K] | undefined };

const PAGE = 120;
const ANY = "__any";

export function MediaLibraryPage({
  data,
  filters,
  onFilters,
}: {
  data: MediaLibraryData;
  filters: MediaFilters;
  onFilters: (p: MediaFiltersPatch) => void;
}) {
  // a just-uploaded file can be opened before the library reloads
  const [held, setHeld] = useState<MediaAssetView | null>(null);
  const onEdit = useCallback(
    (a: MediaAssetView) => {
      setHeld(a);
      onFilters({ asset: a.id });
    },
    [onFilters],
  );
  return (
    <MediaUploadProvider data={data} onEdit={onEdit}>
      <Library data={data} filters={filters} onFilters={onFilters} held={held} />
    </MediaUploadProvider>
  );
}

function Library({
  data,
  filters: f,
  onFilters,
  held,
}: {
  data: MediaLibraryData;
  filters: MediaFilters;
  onFilters: (p: MediaFiltersPatch) => void;
  held: MediaAssetView | null;
}) {
  const upload = useMediaUpload();
  const { run, pending } = useRun();
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastClicked = useRef<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [apiOpen, setApiOpen] = useState(false);

  const results = useMemo(
    () =>
      searchMedia(data.assets, {
        q: f.q,
        kind: f.kind,
        tags: f.tags,
        client: f.client,
        collection: f.collection,
        purpose: f.purpose,
        public: f.vis === undefined ? undefined : f.vis === "public",
        aiGenerated: f.ai === undefined ? undefined : f.ai === "yes",
        orientation: f.orient,
        sort: f.sort,
      }),
    [data.assets, f],
  );
  const visible = results.slice(0, shown);
  useEffect(
    () => setShown(PAGE),
    [f.q, f.kind, f.tags, f.client, f.collection, f.purpose, f.vis, f.ai, f.orient, f.sort],
  );

  // drop selections that left the library (deleted elsewhere)
  useEffect(() => {
    setSelected((cur) => {
      const ids = new Set(data.assets.map((a) => a.id));
      const next = new Set([...cur].filter((id) => ids.has(id)));
      return next.size === cur.size ? cur : next;
    });
  }, [data.assets]);

  const selecting = selected.size > 0;
  const { setDockHidden } = upload;
  useEffect(() => {
    setDockHidden(selecting);
    return () => setDockHidden(false);
  }, [selecting, setDockHidden]);

  const toggle = useCallback(
    (id: string, range: boolean) => {
      setSelected((cur) => {
        const next = new Set(cur);
        if (range && lastClicked.current) {
          const ids = results.map((a) => a.id);
          const a = ids.indexOf(lastClicked.current);
          const b = ids.indexOf(id);
          if (a >= 0 && b >= 0) {
            for (const x of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x);
            lastClicked.current = id;
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        lastClicked.current = id;
        return next;
      });
    },
    [results],
  );

  const drawerAsset =
    (f.asset &&
      (data.assets.find((a) => a.id === f.asset) ?? (held?.id === f.asset ? held : null))) ||
    null;

  const activeCount =
    f.tags.length +
    [f.client, f.collection, f.purpose, f.vis, f.ai, f.orient].filter((v) => v !== undefined)
      .length;
  const clearAll = () =>
    onFilters({
      q: "",
      kind: undefined,
      tags: [],
      client: undefined,
      collection: undefined,
      purpose: undefined,
      vis: undefined,
      ai: undefined,
      orient: undefined,
    });
  const filtered = activeCount > 0 || !!f.q || !!f.kind;

  async function seed() {
    await run(
      "seed",
      () => adminSeedMediaSample({ data: {} }),
      (r) => (r.ok ? `Loaded ${r.count} sample files` : null),
    );
  }

  const empty = data.assets.length === 0;
  // uploads still running in this tab aren't "unfinished"
  const unfinished = data.unfinished.filter(
    (u) => !upload.items.some((i) => i.task?.id === u.id && i.task.state !== "error"),
  );

  return (
    <PageDropZone disabled={upload.isOpen} onFiles={(files) => upload.open(files)}>
      <PageHeader
        title="Media library"
        icon={Images}
        tone="violet"
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <Tag tone="slate">
              {data.facets.total.toLocaleString()} {data.facets.total === 1 ? "file" : "files"} ·{" "}
              {formatBytes(data.facets.totalBytes)}
            </Tag>
            <NamespaceBadge ns={data.ns} />
          </span>
        }
        description="Video, images, audio, 3D, documents and fonts for the site and for clients. Files are private until you switch on their public link."
        actions={
          <>
            <Button
              variant="outline"
              className={cn(tap, "bg-transparent hover:bg-white/[0.06]")}
              onClick={() => setApiOpen(true)}
            >
              <Bot aria-hidden /> Agent API
            </Button>
            <Button className={tap} onClick={() => upload.open()} data-testid="media-upload-button">
              <Upload aria-hidden /> Upload
            </Button>
          </>
        }
      />

      <PageBody className="pb-4">
        {unfinished.length ? (
          <div
            className={cn(
              well,
              "flex flex-wrap items-center gap-3 border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm",
            )}
            role="status"
          >
            <UploadCloud className="size-4 shrink-0 text-amber-300" aria-hidden />
            <p className="min-w-0 flex-1 text-amber-100/90">
              {unfinished.length === 1
                ? "1 upload didn't finish."
                : `${unfinished.length} uploads didn't finish.`}{" "}
              Add the same file again to pick up where it stopped.
            </p>
            <Button
              size="sm"
              variant="outline"
              className={cn(tap, "bg-transparent hover:bg-white/[0.06]")}
              onClick={() => upload.open()}
            >
              Review
            </Button>
          </div>
        ) : null}

        {empty ? (
          <EmptyState
            icon={Images}
            tone="violet"
            title="Your library is empty"
            className="py-16"
            action={
              <>
                <Button className={tap} onClick={() => upload.open()}>
                  <Upload aria-hidden /> Upload files
                </Button>
                {data.ns !== "prod" ? (
                  <Button
                    variant="outline"
                    className={cn(tap, "bg-transparent hover:bg-white/[0.06]")}
                    onClick={() => void seed()}
                    disabled={pending === "seed"}
                  >
                    {pending === "seed" ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Sparkles aria-hidden />
                    )}
                    Load sample data
                  </Button>
                ) : null}
              </>
            }
          >
            Drop files anywhere on this page, or choose them. Video up to{" "}
            {formatBytes(MEDIA.maxFileBytes)} a file; there's no limit on how many.
          </EmptyState>
        ) : (
          <>
            <KindTabs data={data} kind={f.kind} onKind={(kind) => onFilters({ kind })} />

            <div className="flex flex-wrap items-center gap-2">
              <SearchBox value={f.q} onChange={(q) => onFilters({ q })} />
              <Button
                variant="outline"
                className={cn(tap, "bg-transparent hover:bg-white/[0.06] lg:hidden")}
                onClick={() => setFiltersOpen(true)}
                aria-label={activeCount ? `Filters, ${activeCount} on` : "Filters"}
              >
                <SlidersHorizontal aria-hidden />
                Filters
                {activeCount ? (
                  <span className="grid size-5 place-items-center rounded-full bg-[var(--partner)] text-[11px] font-semibold text-black">
                    {activeCount}
                  </span>
                ) : null}
              </Button>
              <SortSelect
                sort={f.sort}
                hasQuery={!!f.q.trim()}
                onSort={(sort) => onFilters({ sort })}
              />
              <ViewToggle view={f.view} onView={(view) => onFilters({ view })} />
            </div>

            <div
              className="hidden flex-wrap items-center gap-2 lg:flex"
              aria-label="Filters"
              role="group"
            >
              <FilterControls data={data} f={f} onFilters={onFilters} layout="inline" />
            </div>

            <ActiveChips
              data={data}
              f={f}
              onFilters={onFilters}
              onClear={clearAll}
              count={results.length}
            />

            {results.length === 0 ? (
              <EmptyState
                icon={Search}
                tone="violet"
                title="Nothing matches"
                action={
                  filtered ? (
                    <Button
                      variant="outline"
                      className={cn(tap, "bg-transparent")}
                      onClick={clearAll}
                    >
                      Clear search and filters
                    </Button>
                  ) : null
                }
              >
                {f.q ? `No file mentions “${f.q}”` : "No files fit these filters"}. Search looks at
                titles, file names, tags, descriptions, clients and collections.
              </EmptyState>
            ) : f.view === "list" ? (
              <ListView
                items={visible}
                selected={selected}
                onToggle={toggle}
                onOpen={(a) => onFilters({ asset: a.id })}
                onSelectAll={(on) =>
                  setSelected(on ? new Set(results.map((a) => a.id)) : new Set())
                }
                allSelected={selected.size === results.length && results.length > 0}
              />
            ) : (
              <GridView
                items={visible}
                selected={selected}
                selecting={selecting}
                onToggle={toggle}
                onOpen={(a) => onFilters({ asset: a.id })}
              />
            )}

            {results.length > shown ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  className={cn(tap, "bg-transparent hover:bg-white/[0.06]")}
                  onClick={() => setShown((n) => n + PAGE)}
                >
                  Show more ({(results.length - shown).toLocaleString()} left)
                </Button>
              </div>
            ) : null}
          </>
        )}

        {selecting ? (
          <SelectionBar
            data={data}
            ids={[...selected]}
            total={results.length}
            onSelectAll={() => setSelected(new Set(results.map((a) => a.id)))}
            onClear={() => setSelected(new Set())}
            onDeleted={() => setSelected(new Set())}
          />
        ) : null}
      </PageBody>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[88dvh] gap-0 overflow-y-auto rounded-t-3xl border-white/[0.08] bg-[linear-gradient(180deg,oklch(0.17_0.018_280),oklch(0.12_0.01_280))] px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetTitle className="text-base">Filters</SheetTitle>
          <SheetDescription className="mt-0.5 text-xs">
            {results.length.toLocaleString()}{" "}
            {results.length === 1 ? "file matches" : "files match"}.
          </SheetDescription>
          <div className="mt-4 grid gap-4">
            <FilterControls data={data} f={f} onFilters={onFilters} layout="stack" />
          </div>
          <div className="mt-5 flex gap-2">
            <Button
              variant="outline"
              className="h-11 flex-1 bg-transparent"
              onClick={clearAll}
              disabled={!activeCount}
            >
              Clear all
            </Button>
            <Button className="h-11 flex-1" onClick={() => setFiltersOpen(false)}>
              Show {results.length.toLocaleString()}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AgentApiDialog open={apiOpen} onOpenChange={setApiOpen} data={data} />
      <AssetDrawer
        asset={drawerAsset}
        data={data}
        onClose={() => onFilters({ asset: undefined })}
      />
    </PageDropZone>
  );
}

/* ── Drop anywhere ────────────────────────────────────────────────────────── */

function PageDropZone({
  children,
  onFiles,
  disabled,
}: {
  children: ReactNode;
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    if (disabled) {
      setOver(false);
      depth.current = 0;
      return;
    }
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [disabled, onFiles]);
  return (
    <>
      {children}
      {over ? (
        <div
          className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-[oklch(0.1_0.02_280/0.72)] p-6 backdrop-blur-sm"
          aria-hidden
        >
          <div className="grid w-full max-w-md place-items-center gap-3 rounded-3xl border-2 border-dashed border-[var(--partner)] bg-white/[0.03] px-8 py-14 text-center">
            <UploadCloud className="size-10 text-[var(--partner)]" />
            <p className="text-lg font-semibold">Drop to upload</p>
            <p className="text-sm text-muted-foreground">
              You can add tags, a client and a collection before it starts.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── Toolbar ──────────────────────────────────────────────────────────────── */

const KIND_TAB_LABEL: Record<MediaKind, string> = { ...MEDIA_KIND_PLURAL, model: "3D" };

function KindTabs({
  data,
  kind,
  onKind,
}: {
  data: MediaLibraryData;
  kind: MediaKind | undefined;
  onKind: (k: MediaKind | undefined) => void;
}) {
  const kinds = MEDIA_KINDS.filter((k) => (data.facets.kinds[k] ?? 0) > 0 || k === kind);
  const pill = (active: boolean) =>
    cn(
      "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none sm:h-9",
      active
        ? "border-[color-mix(in_oklab,var(--partner)_55%,transparent)] bg-[color-mix(in_oklab,var(--partner)_18%,transparent)] text-foreground"
        : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
    );
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2" role="group" aria-label="File type">
        <button
          type="button"
          className={pill(!kind)}
          aria-pressed={!kind}
          onClick={() => onKind(undefined)}
        >
          All <Count n={data.facets.total} />
        </button>
        {kinds.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              className={pill(kind === k)}
              aria-pressed={kind === k}
              onClick={() => onKind(kind === k ? undefined : k)}
            >
              <Icon className="size-4" aria-hidden />
              {KIND_TAB_LABEL[k]} <Count n={data.facets.kinds[k] ?? 0} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const Count = ({ n }: { n: number }) => (
  <span className="text-xs text-muted-foreground tabular-nums">{n.toLocaleString()}</span>
);

function SearchBox({ value, onChange }: { value: string; onChange: (q: string) => void }) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const last = useRef(value);
  // follow the URL when it changes from elsewhere (Clear all, back button)
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value);
    }
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const push = (q: string) => {
    last.current = q;
    onChange(q);
  };
  return (
    <div className="relative min-w-0 flex-1 basis-56">
      <label htmlFor="media-search" className="sr-only">
        Search the library
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id="media-search"
        type="search"
        value={text}
        placeholder="Search titles, tags, clients, descriptions…"
        className="h-11 rounded-full border-white/[0.1] bg-white/[0.03] pr-11 pl-9 sm:h-9 [&::-webkit-search-cancel-button]:hidden"
        onChange={(e) => {
          const q = e.target.value;
          setText(q);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => push(q), 220);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            clearTimeout(timer.current);
            push(text);
          }
          if (e.key === "Escape" && text) {
            e.preventDefault();
            clearTimeout(timer.current);
            setText("");
            push("");
          }
        }}
      />
      {text ? (
        <button
          type="button"
          className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none sm:size-7"
          aria-label="Clear search"
          onClick={() => {
            clearTimeout(timer.current);
            setText("");
            push("");
          }}
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function SortSelect({
  sort,
  hasQuery,
  onSort,
}: {
  sort: MediaSort | undefined;
  hasQuery: boolean;
  onSort: (s: MediaSort | undefined) => void;
}) {
  const current: MediaSort = sort ?? (hasQuery ? "relevance" : "new");
  return (
    <Select
      value={current}
      onValueChange={(v) =>
        onSort(v === (hasQuery ? "relevance" : "new") ? undefined : (v as MediaSort))
      }
    >
      <SelectTrigger
        className={cn(
          "w-auto min-w-0 gap-2 rounded-full border-white/[0.1] bg-white/[0.03] data-[size=default]:h-11 sm:data-[size=default]:h-9",
          "max-sm:flex-1",
        )}
        aria-label="Sort"
      >
        <span className="text-muted-foreground max-sm:hidden">Sort:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {(Object.keys(MEDIA_SORTS) as MediaSort[])
          .filter((s) => s !== "relevance" || hasQuery)
          .map((s) => (
            <SelectItem key={s} value={s}>
              {MEDIA_SORTS[s]}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

function ViewToggle({
  view,
  onView,
}: {
  view: "grid" | "list";
  onView: (v: "grid" | "list") => void;
}) {
  const btn = (v: "grid" | "list", Icon: typeof List, label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      aria-label={label}
      title={label}
      onClick={() => onView(v)}
      className={cn(
        "grid size-11 place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none sm:size-8",
        view === v
          ? "bg-white/[0.12] text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-white/[0.1] bg-white/[0.03] p-0.5"
      role="group"
      aria-label="Layout"
    >
      {btn("grid", LayoutGrid, "Grid")}
      {btn("list", List, "List")}
    </div>
  );
}

/* ── Filter controls (inline on desktop, stacked in the phone sheet) ─────── */

function FilterControls({
  data,
  f,
  onFilters,
  layout,
}: {
  data: MediaLibraryData;
  f: MediaFilters;
  onFilters: (p: MediaFiltersPatch) => void;
  layout: "inline" | "stack";
}) {
  const stack = layout === "stack";
  const purposes = MEDIA_PURPOSES.filter(
    (p) => (data.facets.purposes[p] ?? 0) > 0 || f.purpose === p,
  );
  return (
    <>
      <FilterSelect
        label="Client"
        stack={stack}
        value={f.client}
        onChange={(client) => onFilters({ client })}
        options={data.facets.clients.map((c) => ({
          value: c.value,
          label: c.value,
          count: c.count,
        }))}
      />
      <FilterSelect
        label="Collection"
        stack={stack}
        value={f.collection}
        onChange={(collection) => onFilters({ collection })}
        options={data.facets.collections.map((c) => ({
          value: c.value,
          label: c.value,
          count: c.count,
        }))}
      />
      <FilterSelect
        label="Purpose"
        stack={stack}
        value={f.purpose}
        onChange={(purpose) => onFilters({ purpose: purpose as MediaPurpose | undefined })}
        options={purposes.map((p) => ({
          value: p,
          label: MEDIA_PURPOSE_LABELS[p],
          count: data.facets.purposes[p] ?? 0,
        }))}
      />
      <FilterSelect
        label="Visibility"
        stack={stack}
        value={f.vis}
        onChange={(vis) => onFilters({ vis: vis as MediaFilters["vis"] })}
        options={[
          { value: "public", label: "Public", count: data.facets.publicCount },
          {
            value: "private",
            label: "Private",
            count: data.facets.total - data.facets.publicCount,
          },
        ]}
      />
      <FilterSelect
        label="AI-generated"
        anyLabel="AI or not"
        stack={stack}
        value={f.ai}
        onChange={(ai) => onFilters({ ai: ai as MediaFilters["ai"] })}
        options={[
          { value: "yes", label: "AI-generated", count: data.facets.aiCount },
          {
            value: "no",
            label: "Not AI-generated",
            count: data.facets.total - data.facets.aiCount,
          },
        ]}
      />
      <FilterSelect
        label="Orientation"
        stack={stack}
        value={f.orient}
        onChange={(orient) => onFilters({ orient: orient as MediaOrientation | undefined })}
        options={MEDIA_ORIENTATIONS.map((o) => ({ value: o, label: MEDIA_ORIENTATION_LABELS[o] }))}
      />
      <TagFilter data={data} tags={f.tags} onTags={(tags) => onFilters({ tags })} stack={stack} />
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  stack,
  anyLabel = `Any ${label.toLowerCase()}`,
}: {
  label: string;
  anyLabel?: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string; count?: number }[];
  stack: boolean;
}) {
  const id = `mf-${label.toLowerCase().replace(/[^a-z]+/g, "-")}-${stack ? "s" : "i"}`;
  const on = value !== undefined;
  const known = options.some((o) => o.value === value);
  const trigger = (
    <SelectTrigger
      id={id}
      aria-label={stack ? undefined : label}
      className={cn(
        "gap-2 rounded-full border-white/[0.1] bg-white/[0.03]",
        stack ? "w-full data-[size=default]:h-11" : "w-auto max-w-56 data-[size=default]:h-9",
        on &&
          "border-[color-mix(in_oklab,var(--partner)_55%,transparent)] bg-[color-mix(in_oklab,var(--partner)_14%,transparent)]",
      )}
    >
      {!stack ? (
        <span className={cn(on ? "text-white/70" : "text-muted-foreground")}>
          {label}
          {on ? ":" : ""}
        </span>
      ) : null}
      {on || stack ? (
        <SelectValue placeholder="Any">
          {on ? (options.find((o) => o.value === value)?.label ?? value) : undefined}
        </SelectValue>
      ) : null}
    </SelectTrigger>
  );
  const select = (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? undefined : v)}>
      {trigger}
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {!known && value !== undefined ? <SelectItem value={value}>{value}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span className="flex w-full items-center justify-between gap-4">
              <span className="truncate">{o.label}</span>
              {o.count !== undefined ? (
                <span className="text-xs text-muted-foreground tabular-nums">{o.count}</span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  if (!stack) return select;
  return (
    <FieldRow label={label} htmlFor={id}>
      {select}
    </FieldRow>
  );
}

function TagFilter({
  data,
  tags,
  onTags,
  stack,
}: {
  data: MediaLibraryData;
  tags: string[];
  onTags: (t: string[]) => void;
  stack: boolean;
}) {
  const [open, setOpen] = useState(false);
  const have = new Set(tags.map(tagKey));
  const toggle = (t: string) =>
    onTags(have.has(tagKey(t)) ? tags.filter((x) => tagKey(x) !== tagKey(t)) : [...tags, t]);
  const id = `mf-tags-${stack ? "s" : "i"}`;
  const button = (
    <PopoverTrigger asChild>
      <button
        id={id}
        type="button"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.03] px-3 text-sm focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
          stack ? "h-11 w-full justify-between" : "h-9",
          tags.length > 0 &&
            "border-[color-mix(in_oklab,var(--partner)_55%,transparent)] bg-[color-mix(in_oklab,var(--partner)_14%,transparent)]",
        )}
      >
        <span className="flex items-center gap-2">
          <Tags className="size-4 text-muted-foreground" aria-hidden />
          <span className={tags.length ? "" : "text-muted-foreground"}>
            {tags.length
              ? `${tags.length} tag${tags.length === 1 ? "" : "s"}`
              : stack
                ? "Any tags"
                : "Tags"}
          </span>
        </span>
        <ChevronDown className="size-4 opacity-50" aria-hidden />
      </button>
    </PopoverTrigger>
  );
  const pop = (
    <Popover open={open} onOpenChange={setOpen}>
      {button}
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a tag…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No tags yet.</CommandEmpty>
            <CommandGroup heading="Files must have every tag you pick">
              {data.facets.tags.map((t) => (
                <CommandItem
                  key={t.value}
                  value={t.value}
                  onSelect={() => toggle(t.value)}
                  className={cmdItem}
                >
                  <span
                    className={cn(
                      "grid size-4 place-items-center rounded border",
                      have.has(tagKey(t.value))
                        ? "border-[var(--partner)] bg-[var(--partner)] text-black"
                        : "border-white/25",
                    )}
                    aria-hidden
                  >
                    {have.has(tagKey(t.value)) ? <Check className="size-3" /> : null}
                  </span>
                  <span className="flex-1 truncate">{t.value}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{t.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
  if (!stack) return pop;
  return (
    <FieldRow label="Tags" htmlFor={id}>
      {pop}
    </FieldRow>
  );
}

function ActiveChips({
  data,
  f,
  onFilters,
  onClear,
  count,
}: {
  data: MediaLibraryData;
  f: MediaFilters;
  onFilters: (p: MediaFiltersPatch) => void;
  onClear: () => void;
  count: number;
}) {
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (f.client !== undefined)
    chips.push({
      key: "c",
      label: `Client: ${f.client || "none"}`,
      clear: () => onFilters({ client: undefined }),
    });
  if (f.collection !== undefined)
    chips.push({
      key: "col",
      label: `Collection: ${f.collection || "none"}`,
      clear: () => onFilters({ collection: undefined }),
    });
  if (f.purpose)
    chips.push({
      key: "p",
      label: MEDIA_PURPOSE_LABELS[f.purpose],
      clear: () => onFilters({ purpose: undefined }),
    });
  if (f.vis)
    chips.push({
      key: "v",
      label: f.vis === "public" ? "Public" : "Private",
      clear: () => onFilters({ vis: undefined }),
    });
  if (f.ai)
    chips.push({
      key: "a",
      label: f.ai === "yes" ? "AI-generated" : "Not AI-generated",
      clear: () => onFilters({ ai: undefined }),
    });
  if (f.orient)
    chips.push({
      key: "o",
      label: MEDIA_ORIENTATION_LABELS[f.orient],
      clear: () => onFilters({ orient: undefined }),
    });
  for (const t of f.tags)
    chips.push({
      key: `t:${t}`,
      label: `#${t}`,
      clear: () => onFilters({ tags: f.tags.filter((x) => x !== t) }),
    });
  const total = data.facets.total;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
      <span className="text-muted-foreground tabular-nums">
        {count === total
          ? `${total.toLocaleString()} ${total === 1 ? "file" : "files"}`
          : `${count.toLocaleString()} of ${total.toLocaleString()}`}
      </span>
      {chips.map((c) => (
        <TagChip
          key={c.key}
          tag={c.label}
          onRemove={c.clear}
          className="border-[color-mix(in_oklab,var(--partner)_35%,transparent)]"
        />
      ))}
      {chips.length > 1 || (chips.length && (f.q || f.kind)) ? (
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-full px-2 text-xs font-medium text-[var(--partner)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

/* ── Grid ─────────────────────────────────────────────────────────────────── */

function metaLine(a: MediaAssetView) {
  return (
    [a.client, a.collection].filter(Boolean).join(" · ") ||
    `${extOf(a.name).toUpperCase() || a.kind} · ${formatBytes(a.size)}`
  );
}

function SelectBox({
  a,
  checked,
  onToggle,
  className,
}: {
  a: MediaAssetView;
  checked: boolean;
  onToggle: (id: string, range: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Select ${a.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(a.id, e.shiftKey);
      }}
      className={cn(
        "group/sel grid size-11 place-items-center rounded-xl focus-visible:outline-none",
        className,
      )}
      data-testid="media-select"
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-md border-[1.5px] shadow-sm transition-colors group-focus-visible/sel:ring-2 group-focus-visible/sel:ring-[var(--partner)] group-focus-visible/sel:ring-offset-2 group-focus-visible/sel:ring-offset-black",
          checked
            ? "border-[var(--partner)] bg-[var(--partner)] text-black"
            : "border-white/70 bg-black/45 backdrop-blur",
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
      </span>
    </button>
  );
}

function GridView({
  items,
  selected,
  selecting,
  onToggle,
  onOpen,
}: {
  items: MediaAssetView[];
  selected: Set<string>;
  selecting: boolean;
  onToggle: (id: string, range: boolean) => void;
  onOpen: (a: MediaAssetView) => void;
}) {
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4 2xl:grid-cols-5"
      data-testid="media-grid"
    >
      {items.map((a) => {
        const checked = selected.has(a.id);
        const Icon = KIND_ICON[a.kind];
        const dur = formatDuration(a.durationS);
        return (
          <li
            key={a.id}
            className={cn(
              surface,
              "group relative min-w-0 overflow-hidden p-0 transition-[transform,box-shadow,border-color] [contain-intrinsic-size:auto_280px] [content-visibility:auto] hover:-translate-y-0.5 hover:border-white/[0.16] motion-reduce:hover:translate-y-0",
              checked && "border-[var(--partner)] ring-1 ring-[var(--partner)]",
            )}
          >
            <button
              type="button"
              onClick={(e) =>
                selecting || e.metaKey || e.ctrlKey || e.shiftKey
                  ? onToggle(a.id, e.shiftKey)
                  : onOpen(a)
              }
              className="block w-full text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-[var(--partner)]"
              aria-label={
                selecting ? `${checked ? "Deselect" : "Select"} ${a.title}` : `Open ${a.title}`
              }
              data-testid="media-card"
            >
              <AssetThumb a={a} className="aspect-[4/3] w-full" />
              <span className="block px-3 pt-2.5 pb-3">
                <span className="block truncate text-sm font-medium">{a.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {metaLine(a)}
                </span>
              </span>
            </button>
            <span className="pointer-events-none absolute top-2 right-2 flex gap-1">
              {a.aiGenerated ? <AiBadge className="h-6" /> : null}
              {a.public ? (
                <VisibilityBadge isPublic className="bg-emerald-950/70 backdrop-blur-md" />
              ) : null}
            </span>
            <span className="pointer-events-none absolute bottom-[calc(3.75rem+0.5rem)] left-2 flex gap-1">
              <ThumbChip>
                <Icon aria-hidden />
                {dur ?? (extOf(a.name).toUpperCase() || a.kind)}
              </ThumbChip>
            </span>
            <SelectBox
              a={a}
              checked={checked}
              onToggle={onToggle}
              className={cn(
                "absolute top-0.5 left-0.5 transition-opacity",
                checked || selecting
                  ? "opacity-100"
                  : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
              )}
            />
          </li>
        );
      })}
    </ul>
  );
}

/* ── List ─────────────────────────────────────────────────────────────────── */

function ListView({
  items,
  selected,
  onToggle,
  onOpen,
  onSelectAll,
  allSelected,
}: {
  items: MediaAssetView[];
  selected: Set<string>;
  onToggle: (id: string, range: boolean) => void;
  onOpen: (a: MediaAssetView) => void;
  onSelectAll: (on: boolean) => void;
  allSelected: boolean;
}) {
  const cols =
    "md:grid-cols-[2.75rem_3.5rem_minmax(0,2.2fr)_minmax(0,1.3fr)_6.5rem_7rem_6.5rem_6rem]";
  return (
    <div className={cn(surface, "overflow-hidden p-0")} data-testid="media-list">
      <div
        className={cn(
          "hidden items-center gap-3 border-b border-white/[0.06] px-2 py-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase md:grid",
          cols,
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={allSelected}
          aria-label={allSelected ? "Deselect all" : "Select all"}
          onClick={() => onSelectAll(!allSelected)}
          className="group/sel grid size-11 place-items-center focus-visible:outline-none"
        >
          <span
            className={cn(
              "grid size-5 place-items-center rounded-md border-[1.5px] group-focus-visible/sel:ring-2 group-focus-visible/sel:ring-[var(--partner)]",
              allSelected
                ? "border-[var(--partner)] bg-[var(--partner)] text-black"
                : "border-white/40",
            )}
          >
            {allSelected ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : null}
          </span>
        </button>
        <span />
        <span>Title</span>
        <span>Client · collection</span>
        <span>Type</span>
        <span>Size / length</span>
        <span>Visibility</span>
        <span className="text-right">Added</span>
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {items.map((a) => {
          const checked = selected.has(a.id);
          const facts = [
            a.width && a.height ? `${a.width}×${a.height}` : null,
            formatDuration(a.durationS),
          ].filter(Boolean);
          return (
            <li
              key={a.id}
              className={cn(
                "relative grid grid-cols-[2.75rem_3.5rem_minmax(0,1fr)] items-center gap-x-3 px-2 py-1.5 transition-colors [contain-intrinsic-size:auto_64px] [content-visibility:auto] hover:bg-white/[0.03]",
                cols,
                checked && "bg-[color-mix(in_oklab,var(--partner)_10%,transparent)]",
              )}
              data-testid="media-row"
            >
              <SelectBox a={a} checked={checked} onToggle={onToggle} className="relative z-10" />
              <AssetThumb a={a} className="size-14 rounded-lg" iconSize="size-5" />
              <button
                type="button"
                onClick={() => onOpen(a)}
                className="min-w-0 py-1 text-left focus-visible:outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-[var(--partner)] focus-visible:after:ring-inset"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{a.title}</span>
                  {a.aiGenerated ? (
                    <Sparkles
                      className="size-3.5 shrink-0 text-fuchsia-300"
                      aria-label="AI-generated"
                    />
                  ) : null}
                  {a.public ? (
                    <Globe
                      className="size-3.5 shrink-0 text-emerald-300 md:hidden"
                      aria-label="Public"
                    />
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.name}
                  <span className="md:hidden">
                    {" · "}
                    {[formatBytes(a.size), ...facts].join(" · ")}
                  </span>
                </span>
                {a.tags.length ? (
                  <span className="mt-1 hidden gap-1 overflow-hidden md:flex">
                    {a.tags.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="truncate rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/70"
                      >
                        {t}
                      </span>
                    ))}
                    {a.tags.length > 4 ? (
                      <span className="text-[11px] text-muted-foreground">
                        +{a.tags.length - 4}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </button>
              <span className="hidden truncate text-sm text-white/80 md:block">
                {[a.client, a.collection].filter(Boolean).join(" · ") || (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
              <span className="hidden text-sm text-white/80 md:block">
                {extOf(a.name).toUpperCase() || a.kind}
              </span>
              <span className="hidden text-xs leading-tight text-muted-foreground tabular-nums md:block">
                <span className="block text-sm text-white/80">{formatBytes(a.size)}</span>
                {facts.join(" · ")}
              </span>
              <span className="hidden md:block">
                <VisibilityBadge isPublic={a.public} />
              </span>
              <span className="hidden text-right text-xs text-muted-foreground tabular-nums md:block">
                {formatDate(a.createdAt)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Bulk actions ─────────────────────────────────────────────────────────── */

function SelectionBar({
  data,
  ids,
  total,
  onSelectAll,
  onClear,
  onDeleted,
}: {
  data: MediaLibraryData;
  ids: string[];
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onDeleted: () => void;
}) {
  const { run, pending } = useRun();
  const [dialog, setDialog] = useState<"tags" | "move" | "delete" | null>(null);
  const n = ids.length;
  const files = `${n} ${n === 1 ? "file" : "files"}`;

  const apply = (key: string, patch: MediaPatch, msg: string) =>
    run(
      key,
      () => adminUpdateMedia({ data: { ids, patch } }),
      (r) =>
        r.ok && r.results.some((x) => !x.ok)
          ? `${msg} (${r.results.filter((x) => !x.ok).length} skipped)`
          : msg,
    );

  const btn = cn(
    "h-11 shrink-0 gap-1.5 rounded-xl px-3 text-sm hover:bg-white/[0.08] sm:h-9 [&_svg]:size-4",
  );

  return (
    <>
      <div
        className="sticky bottom-[calc(var(--tabbar,0px)+0.25rem)] z-30 mt-2 md:bottom-6"
        role="region"
        aria-label="Selected files"
        data-testid="media-selection-bar"
      >
        <div className="glass-strong mx-auto flex max-w-3xl items-center gap-1 rounded-2xl bg-[oklch(0.15_0.016_280/0.94)]! p-1.5 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]">
          <Button
            variant="ghost"
            size="icon"
            className={cn(tapIcon, "shrink-0 rounded-xl")}
            onClick={onClear}
            aria-label="Clear selection"
          >
            <X aria-hidden />
          </Button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-sm font-medium tabular-nums" aria-live="polite">
              {n} selected
            </p>
            {n < total ? (
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs text-[var(--partner)] hover:underline focus-visible:underline focus-visible:outline-none"
              >
                Select all {total.toLocaleString()}
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              className={btn}
              onClick={() => setDialog("tags")}
              disabled={!!pending}
            >
              <Tags aria-hidden />
              <span className="max-sm:sr-only">Tags</span>
            </Button>
            <Button
              variant="ghost"
              className={btn}
              onClick={() => setDialog("move")}
              disabled={!!pending}
            >
              <FolderInput aria-hidden />
              <span className="max-sm:sr-only">Move</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className={btn}
                  disabled={!!pending}
                  aria-label="More actions"
                >
                  {pending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <MoreHorizontal aria-hidden />
                  )}
                  <span className="max-sm:sr-only">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuItem
                  className="min-h-10"
                  onSelect={() => void apply("pub", { public: true }, `${files} public`)}
                >
                  <Globe aria-hidden /> Make public
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-10"
                  onSelect={() => void apply("priv", { public: false }, `${files} private`)}
                >
                  <Lock aria-hidden /> Make private
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="min-h-10"
                  onSelect={() =>
                    void apply("ai", { aiGenerated: true }, `Marked ${files} as AI-generated`)
                  }
                >
                  <Sparkles aria-hidden /> Mark AI-generated
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="min-h-10"
                  onSelect={() =>
                    void apply(
                      "noai",
                      { aiGenerated: false },
                      `Marked ${files} as not AI-generated`,
                    )
                  }
                >
                  <CheckSquare aria-hidden /> Mark not AI-generated
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="min-h-10 text-red-300 focus:text-red-200"
                  onSelect={() => setDialog("delete")}
                >
                  <Trash2 aria-hidden /> Delete…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              className={cn(btn, "text-red-300 hover:text-red-200 max-sm:hidden")}
              onClick={() => setDialog("delete")}
              disabled={!!pending}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        </div>
      </div>

      <BulkTagsDialog
        open={dialog === "tags"}
        onOpenChange={(o) => setDialog(o ? "tags" : null)}
        data={data}
        ids={ids}
        onApply={async (addTags, removeTags) => {
          const parts = [
            addTags.length ? `added ${addTags.length}` : "",
            removeTags.length ? `removed ${removeTags.length}` : "",
          ].filter(Boolean);
          const r = await apply(
            "tags",
            { addTags, removeTags },
            `Tags ${parts.join(", ")} on ${files}`,
          );
          if (r) setDialog(null);
        }}
        busy={pending === "tags"}
      />
      <BulkMoveDialog
        open={dialog === "move"}
        onOpenChange={(o) => setDialog(o ? "move" : null)}
        data={data}
        count={n}
        busy={pending === "move"}
        onApply={async (patch) => {
          const r = await apply("move", patch, `Moved ${files}`);
          if (r) setDialog(null);
        }}
      />
      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => setDialog(o ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {files}?</AlertDialogTitle>
            <AlertDialogDescription>
              The files, their thumbnails and any public links go for good. Pages or emails that
              embed them will show a broken file. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-9">Keep them</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-red-500 text-white hover:bg-red-500/90 sm:h-9"
              disabled={pending === "delete"}
              data-testid="media-confirm-delete"
              onClick={async (e) => {
                e.preventDefault();
                const r = await run(
                  "delete",
                  () => adminDeleteMedia({ data: { ids } }),
                  `Deleted ${files}`,
                );
                if (r) {
                  setDialog(null);
                  onDeleted();
                }
              }}
            >
              {pending === "delete" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              Delete {files}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BulkTagsDialog({
  open,
  onOpenChange,
  data,
  ids,
  onApply,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: MediaLibraryData;
  ids: string[];
  onApply: (add: string[], remove: string[]) => Promise<void>;
  busy: boolean;
}) {
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (open) {
      setAdd([]);
      setRemove(new Set());
    }
  }, [open]);
  // the tags already on the selection, with how many of the files have each
  const onSelection = useMemo(() => {
    const pick = new Set(ids);
    const m = new Map<string, { value: string; count: number }>();
    for (const a of data.assets) {
      if (!pick.has(a.id)) continue;
      for (const t of a.tags) {
        const k = tagKey(t);
        const cur = m.get(k);
        if (cur) cur.count++;
        else m.set(k, { value: t, count: 1 });
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  }, [ids, data.assets]);
  const changed = add.length > 0 || remove.size > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            Tags for {ids.length} {ids.length === 1 ? "file" : "files"}
          </DialogTitle>
          <DialogDescription>
            Add tags to every selected file, or take tags off them. Other tags stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <p id="bulk-add-label" className="mb-2 text-xs font-medium text-white/75">
              Add
            </p>
            <TagEditor
              value={add}
              onChange={setAdd}
              known={data.facets.tags}
              labelledBy="bulk-add-label"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-white/75">Remove</p>
            {onSelection.length ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tags to remove">
                {onSelection.map((t) => {
                  const on = remove.has(tagKey(t.value));
                  return (
                    <button
                      key={t.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setRemove((cur) => {
                          const next = new Set(cur);
                          if (on) next.delete(tagKey(t.value));
                          else next.add(tagKey(t.value));
                          return next;
                        })
                      }
                      className={cn(
                        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-xs focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none sm:h-8",
                        on
                          ? "border-red-400/50 bg-red-500/15 text-red-200 line-through"
                          : "border-white/[0.1] bg-white/[0.04] text-white/85 hover:border-white/25",
                      )}
                    >
                      {t.value}
                      <span className="text-muted-foreground tabular-nums no-underline">
                        {t.count}/{ids.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">None of these files has tags yet.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-11 bg-transparent sm:h-9"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-11 sm:h-9"
            disabled={!changed || busy}
            onClick={() =>
              void onApply(
                add,
                onSelection.filter((t) => remove.has(tagKey(t.value))).map((t) => t.value),
              )
            }
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkMoveDialog({
  open,
  onOpenChange,
  data,
  count,
  onApply,
  busy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: MediaLibraryData;
  count: number;
  onApply: (p: MediaPatch) => Promise<void>;
  busy: boolean;
}) {
  type Choice = { mode: "keep" | "set" | "clear"; value: string };
  const [client, setClient] = useState<Choice>({ mode: "keep", value: "" });
  const [collection, setCollection] = useState<Choice>({ mode: "keep", value: "" });
  useEffect(() => {
    if (open) {
      setClient({ mode: "keep", value: "" });
      setCollection({ mode: "keep", value: "" });
    }
  }, [open]);
  const patch: MediaPatch = {};
  if (client.mode === "clear") patch.client = "";
  if (client.mode === "set" && client.value.trim()) patch.client = client.value;
  if (collection.mode === "clear") patch.collection = "";
  if (collection.mode === "set" && collection.value.trim()) patch.collection = collection.value;
  const changed = Object.keys(patch).length > 0;

  const row = (
    label: string,
    c: Choice,
    set: (c: Choice) => void,
    suggestions: { value: string; count?: number }[],
    max: number,
  ) => {
    const id = `bulk-${label.toLowerCase()}`;
    return (
      <FieldRow label={label} htmlFor={id}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ComboField
            id={id}
            value={c.mode === "set" ? c.value : ""}
            onChange={(v) => set(v ? { mode: "set", value: v } : { mode: "keep", value: "" })}
            suggestions={suggestions}
            placeholder={c.mode === "clear" ? `Remove ${label.toLowerCase()}` : "Keep as is"}
            maxLength={max}
            className="flex-1"
            emptyLabel="Keep as is"
          />
          <Button
            type="button"
            variant="outline"
            aria-pressed={c.mode === "clear"}
            className={cn(
              "h-11 bg-transparent sm:h-9",
              c.mode === "clear" && "border-red-400/50 bg-red-500/10 text-red-200",
            )}
            onClick={() =>
              set(c.mode === "clear" ? { mode: "keep", value: "" } : { mode: "clear", value: "" })
            }
          >
            {c.mode === "clear" ? "Will clear" : "Clear"}
          </Button>
        </div>
      </FieldRow>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>
            Move {count} {count === 1 ? "file" : "files"}
          </DialogTitle>
          <DialogDescription>
            Set the client / property and the collection. Leave a field alone to keep what each file
            has.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {row(
            "Client",
            client,
            setClient,
            mergeSuggestions(data.facets.clients, MEDIA_CLIENT_SUGGESTIONS),
            MEDIA.limits.client,
          )}
          {row(
            "Collection",
            collection,
            setCollection,
            mergeSuggestions(data.facets.collections),
            MEDIA.limits.collection,
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-11 bg-transparent sm:h-9"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="h-11 sm:h-9"
            disabled={!changed || busy}
            onClick={() => void onApply(patch)}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Agent API ────────────────────────────────────────────────────────────── */

function AgentApiDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: MediaLibraryData;
}) {
  const origin = typeof window === "undefined" ? "https://medialife.ai" : window.location.origin;
  const examples = [
    {
      label: "Every EVADE gameplay video (JSON)",
      cmd: `curl -H "Authorization: Bearer $MEDIA_API_TOKEN" \\\n  "${origin}/api/media/index.json?client=EVADE&type=video&tags=gameplay"`,
    },
    {
      label: "Public marketing images, as Markdown for an LLM",
      cmd: `curl -H "Authorization: Bearer $MEDIA_API_TOKEN" \\\n  "${origin}/api/media/llms.txt?type=image&purpose=marketing&public=true"`,
    },
    {
      label: "Search everything",
      cmd: `curl -H "Authorization: Bearer $MEDIA_API_TOKEN" \\\n  "${origin}/api/media/index.json?q=bobo+mascot&limit=50"`,
    },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Agent API</DialogTitle>
          <DialogDescription>
            Agents and scripts read the catalogue with a read-only token. It can list and download
            files; it can never upload, edit or delete.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div
            className={cn(
              well,
              "flex items-start gap-3 px-3 py-2.5",
              data.tokenConfigured ? "border-emerald-400/25" : "border-amber-400/25",
            )}
          >
            {data.tokenConfigured ? (
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
            ) : (
              <Lock className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
            )}
            <p className="text-white/80">
              {data.tokenConfigured ? (
                <>
                  <code className="mono">MEDIA_API_TOKEN</code> is set on this site. Send it as{" "}
                  <code className="mono">Authorization: Bearer …</code>.
                </>
              ) : (
                <>
                  No token yet. Set <code className="mono">MEDIA_API_TOKEN</code> (24+ random
                  characters) in the Netlify environment to let agents in. Until then only a
                  signed-in admin can read the catalogue.
                </>
              )}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                href: "/api/media/index.json",
                label: "index.json",
                hint: "Every field, filterable, paged",
              },
              {
                href: "/api/media/llms.txt",
                label: "llms.txt",
                hint: "The same catalogue as Markdown",
              },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  well,
                  "block px-3 py-2.5 transition-colors hover:border-white/20 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
                )}
              >
                <span className="mono block text-[13px] text-[var(--partner)]">{l.href}</span>
                <span className="text-xs text-muted-foreground">{l.hint}</span>
              </a>
            ))}
          </div>
          <p className="text-white/75">
            Filters: <code className="mono">q</code>, <code className="mono">tags</code> (comma
            list, all must match), <code className="mono">type</code> (video, image, audio, 3d,
            pdf…), <code className="mono">client</code> (or <code className="mono">property</code>),{" "}
            <code className="mono">collection</code>, <code className="mono">purpose</code>,{" "}
            <code className="mono">public</code>, <code className="mono">ai</code>,{" "}
            <code className="mono">orientation</code>, <code className="mono">sort</code>,{" "}
            <code className="mono">limit</code>, <code className="mono">offset</code>.
          </p>
          {examples.map((e) => (
            <div key={e.label}>
              <p className="mb-1 text-xs font-medium text-white/75">{e.label}</p>
              <div className={cn(well, "relative")}>
                <pre className="mono overflow-x-auto p-3 pr-11 text-[12px] leading-relaxed text-white/85">
                  {e.cmd}
                </pre>
                <CopyButton
                  text={e.cmd.replace(/\\\n\s+/g, "")}
                  label="Copy command"
                  className="absolute top-1.5 right-1.5 bg-[oklch(0.13_0.012_280)] shadow-[-8px_0_12px_oklch(0.13_0.012_280)]"
                />
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
