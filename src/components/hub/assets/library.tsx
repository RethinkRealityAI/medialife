/**
 * The asset library: everything a creator (or the team, for a creator) keeps
 * for making content and merch, sorted into sections, folders and tags.
 *
 *   - Places: All, Starred, From MEDIALIFE, then the sections. A section shows
 *     its folders first, then the files not in one. Search and filters look
 *     through the whole place, folders included.
 *   - Upload: drop files anywhere on the page, or "Upload". The upload dialog
 *     sorts each file and lets you change it before anything is sent.
 *   - Select: the checkbox on a tile, Shift-click for a range, Cmd/Ctrl+A for
 *     everything shown. Once something is selected, a tap selects instead of
 *     opening. Drag files onto a section or folder to move them.
 *
 * The place and filters live in the URL (the route passes `nav` and `onNav`),
 * so a view can be bookmarked, shared with the team, and survives a reload.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ArrowDownUp,
  ChevronLeft,
  Download,
  Filter,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Search,
  Star,
  Tags,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/hub/app/ui";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  ASSET_SECTIONS,
  MEDIA_LABEL,
  MEDIA_TYPES,
  SECTION_META,
  brandKit,
  inLibrary,
  mediaTypeOf,
  sectionOf,
  tagKey,
  tagsOf,
  type AssetSection,
  type MediaType,
} from "@/lib/hub/assets";
import { downloadHubFile, downloadZip } from "@/lib/hub/download-client";
import { shortDate, type AssetFolder, type HubFile } from "@/lib/hub/model";
import { UPLOAD_ACCEPT, deleteHubFile, formatBytes } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

import { AssetDetails, type UsedIn } from "./details";
import {
  BrandKit,
  DRAG_TYPE,
  DeleteFolderDialog,
  FolderCard,
  FolderDialog,
  FolderMenu,
  LibraryChips,
  LibrarySidebar,
  ManageTagsDialog,
  PLACE_LABEL,
  SelectionBar,
  type DropTarget,
  type Place,
} from "./library-parts";
import { AssetThumb, SECTION_ICON, VIEW_ICON, errorText, useAssetMutations } from "./shared";
import { TagChip } from "./tag-picker";
import { UploadDialog, type UploadTarget } from "./upload-dialog";

export type LibraryNav = {
  /** A Place; absent = all. */
  s?: string;
  folder?: string;
  q?: string;
  tag?: string;
  type?: string;
  /** The file open in the details panel. */
  file?: string;
};

type Sort = "new" | "old" | "name" | "size" | "type";
const SORTS: Record<Sort, string> = {
  new: "Newest first",
  old: "Oldest first",
  name: "Name",
  size: "Largest first",
  type: "Type",
};
type Prefs = { view: "grid" | "list"; sort: Sort };
const PREFS_KEY = "hub-assets-prefs";

function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>({ view: "grid", sort: "new" });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as Partial<Prefs> | null;
      if (saved) setPrefs((p) => ({ ...p, ...saved }));
    } catch {
      /* private mode: defaults */
    }
  }, []);
  const update = useCallback((p: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* fine */
      }
      return next;
    });
  }, []);
  return [prefs, update];
}

const isPlace = (s: string | undefined): s is Place =>
  s === "all" ||
  s === "starred" ||
  s === "medialife" ||
  (ASSET_SECTIONS as readonly string[]).includes(s ?? "");

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    /^(TEXTAREA|SELECT)$/.test(t.tagName) ||
    (t instanceof HTMLInputElement && !/^(checkbox|radio|button)$/.test(t.type)));

export type LibraryProduct = {
  id: string;
  name: string;
  artworkIds: string[];
  imageFileId: string | null;
};

export function AssetLibrary({
  mode,
  creatorId,
  files: rawFiles,
  folders,
  products,
  nav,
  onNav,
  productHref,
}: {
  mode: "creator" | "admin";
  /** Admin only: whose library this is. */
  creatorId?: string;
  files: HubFile[];
  folders: AssetFolder[];
  products: LibraryProduct[];
  nav: LibraryNav;
  onNav: (next: LibraryNav, opts?: { replace?: boolean }) => void;
  productHref?: (id: string) => string;
}) {
  const m = useAssetMutations(mode === "admin" ? creatorId : undefined, folders);
  const [prefs, setPrefs] = usePrefs();
  const { merge } = m;
  const files = useMemo(() => merge(rawFiles).filter(inLibrary), [merge, rawFiles]);

  const place: Place = isPlace(nav.s) ? nav.s : "all";
  const section = (ASSET_SECTIONS as readonly string[]).includes(place)
    ? (place as AssetSection)
    : null;
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const folder = nav.folder ? (folderMap.get(nav.folder) ?? null) : null;
  const type = (MEDIA_TYPES as readonly string[]).includes(nav.type ?? "")
    ? (nav.type as MediaType)
    : null;
  // Search filters as you type; the URL catches up after a pause (each URL
  // change is a navigation, which re-checks the session).
  const [query, setQuery] = useState(nav.q ?? "");
  useEffect(() => setQuery(nav.q ?? ""), [nav.q]);
  const q = query.trim().toLowerCase();
  const filtering = !!(q || nav.tag || type);

  /* -- derived ---------------------------------------------------------- */

  const folderOf = useCallback(
    (f: HubFile) => (f.folderId ? (folderMap.get(f.folderId) ?? null) : null),
    [folderMap],
  );

  const counts = useMemo(() => {
    const c = { all: files.length, starred: 0, medialife: 0 } as Record<Place, number>;
    for (const s of ASSET_SECTIONS) c[s] = 0;
    const byFolder: Record<string, number> = {};
    for (const f of files) {
      c[sectionOf(f)]++;
      if (f.starred) c.starred++;
      if (f.uploadedBy === "medialife") c.medialife++;
      const fo = folderOf(f);
      if (fo) byFolder[fo.id] = (byFolder[fo.id] ?? 0) + 1;
    }
    return { places: c, byFolder };
  }, [files, folderOf]);

  const tagCounts = useMemo(() => {
    const m2 = new Map<string, { tag: string; count: number }>();
    for (const f of files)
      for (const t of tagsOf(f)) {
        const k = tagKey(t);
        const cur = m2.get(k);
        if (cur) cur.count++;
        else m2.set(k, { tag: t, count: 1 });
      }
    return [...m2.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [files]);
  const yourTags = useMemo(() => tagCounts.map((t) => t.tag), [tagCounts]);

  const inPlace = useMemo(() => {
    let xs = files;
    if (place === "starred") xs = xs.filter((f) => f.starred);
    else if (place === "medialife") xs = xs.filter((f) => f.uploadedBy === "medialife");
    else if (section) xs = xs.filter((f) => sectionOf(f) === section);
    if (folder) xs = xs.filter((f) => f.folderId === folder.id);
    return xs;
  }, [files, place, section, folder]);

  const shown = useMemo(() => {
    let xs = inPlace;
    // A section's root lists folders, then loose files; search reaches inside folders.
    if (section && !folder && !filtering) xs = xs.filter((f) => !folderOf(f));
    if (type) xs = xs.filter((f) => mediaTypeOf(f) === type);
    if (nav.tag) {
      const k = tagKey(nav.tag);
      xs = xs.filter((f) => tagsOf(f).some((t) => tagKey(t) === k));
    }
    if (q) {
      xs = xs.filter((f) =>
        [f.name, f.note, folderOf(f)?.name ?? "", ...tagsOf(f)].some((s) =>
          s.toLowerCase().includes(q),
        ),
      );
    }
    const by: Record<Sort, (a: HubFile, b: HubFile) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      old: (a, b) => a.createdAt - b.createdAt,
      name: (a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      size: (a, b) => b.size - a.size,
      type: (a, b) => mediaTypeOf(a).localeCompare(mediaTypeOf(b)) || b.createdAt - a.createdAt,
    };
    return [...xs].sort(by[prefs.sort]);
  }, [inPlace, section, folder, filtering, type, nav.tag, q, folderOf, prefs.sort]);

  const sectionFolders = useMemo(
    () => (section && !folder && !filtering ? folders.filter((f) => f.section === section) : []),
    [section, folder, filtering, folders],
  );

  const typesHere = useMemo(() => {
    const s = new Set(inPlace.map((f) => mediaTypeOf(f)));
    return MEDIA_TYPES.filter((t) => s.has(t));
  }, [inPlace]);

  const usedIn = useCallback(
    (f: HubFile): UsedIn[] =>
      products
        .filter((p) => p.artworkIds.includes(f.id) || p.imageFileId === f.id)
        .map((p) => ({ id: p.id, name: p.name, href: productHref?.(p.id) })),
    [products, productHref],
  );

  const mayDelete = (f: HubFile) => mode === "admin" || f.uploadedBy === "creator";
  const mayEdit = mayDelete;

  /* -- navigation --------------------------------------------------------- */

  const go = (p: Place, folderId?: string | null) =>
    onNav({
      s: p === "all" ? undefined : p,
      folder: folderId ?? undefined,
      q: nav.q,
      tag: nav.tag,
      type: nav.type,
    });
  const setFilter = (patch: Partial<LibraryNav>) =>
    onNav({ ...nav, file: undefined, ...patch }, { replace: true });
  const clearFilters = () => {
    setQuery("");
    onNav({ s: nav.s, folder: nav.folder }, { replace: true });
  };
  useEffect(() => {
    if ((nav.q ?? "") === query) return;
    const t = setTimeout(() => setFilter({ q: query || undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on the typed text only
  }, [query]);

  /* -- selection ---------------------------------------------------------- */

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const placeKey = `${place}|${folder?.id ?? ""}`;
  useEffect(() => setSelected(new Set()), [placeKey]);
  // Drop ids that are no longer shown (deleted, filtered away).
  useEffect(() => {
    setSelected((s) => {
      const ids = new Set(shown.map((f) => f.id));
      const next = new Set([...s].filter((id) => ids.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [shown]);

  const selecting = selected.size > 0;
  const selectedFiles = shown.filter((f) => selected.has(f.id));

  function toggle(f: HubFile, e?: { shiftKey?: boolean }) {
    setSelected((s) => {
      const next = new Set(s);
      if (e?.shiftKey && anchor.current) {
        const a = shown.findIndex((x) => x.id === anchor.current);
        const b = shown.findIndex((x) => x.id === f.id);
        if (a >= 0 && b >= 0) {
          for (const x of shown.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(x.id);
          return next;
        }
      }
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
    anchor.current = f.id;
  }

  /* -- dialogs ------------------------------------------------------------ */

  const [upload, setUpload] = useState<{ files: File[]; target: UploadTarget } | null>(null);
  const [append, setAppend] = useState<{ files: File[]; n: number } | undefined>();
  const [folderDialog, setFolderDialog] = useState<{
    folder: AssetFolder | null;
    section: AssetSection;
  } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<AssetFolder | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickTags = useRef<string[]>([]);

  const here: UploadTarget = { section, folderId: folder?.id ?? null };
  const openPicker = (tags: string[] = []) => {
    pickTags.current = tags;
    picker.current?.click();
  };
  const startUpload = (list: File[], tags: string[] = []) => {
    if (!list.length) return;
    setUpload({
      files: list,
      target: { ...here, section: here.section ?? (tags.length ? "branding" : null), tags },
    });
  };

  // Drop files anywhere on the page.
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  const uploadOpen = !!upload;
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setDropping(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setDropping(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDropping(false);
      const list = [...(e.dataTransfer?.files ?? [])];
      if (!list.length) return;
      if (uploadOpen) setAppend((a) => ({ files: list, n: (a?.n ?? 0) + 1 }));
      else startUpload(list);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  });

  // Esc clears the selection; Cmd/Ctrl+A selects everything shown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || document.querySelector("[role=dialog]")) return;
      if (e.key === "Escape" && selected.size) setSelected(new Set());
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && shown.length) {
        e.preventDefault();
        setSelected(new Set(shown.map((f) => f.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected.size, shown]);

  /* -- actions ------------------------------------------------------------ */

  const byIds = (ids: string[]) => files.filter((f) => ids.includes(f.id));

  async function moveTo(t: DropTarget, list: HubFile[]) {
    const where = t.folderId ? folderMap.get(t.folderId)?.name : SECTION_META[t.section].label;
    const moving = list.filter(
      (f) => sectionOf(f) !== t.section || (f.folderId ?? null) !== t.folderId,
    );
    if (!moving.length) return;
    const ok = await m.update(
      moving,
      t.folderId ? { folderId: t.folderId } : { section: t.section, folderId: null },
      `Moved ${moving.length === 1 ? "1 file" : `${moving.length} files`} to ${where}`,
    );
    if (ok) setSelected(new Set());
  }

  async function downloadSelection(list: HubFile[], name: string) {
    if (list.length === 1) {
      try {
        await downloadHubFile(list[0]);
      } catch (e) {
        toast.error(errorText(e, "Couldn't download the file."));
      }
      return;
    }
    setZipProgress(0);
    try {
      await downloadZip(
        list.map((f) => {
          const fo = folderOf(f);
          const dir =
            place === "all" || place === "starred" || place === "medialife"
              ? [SECTION_META[sectionOf(f)].label, fo?.name].filter(Boolean).join("/")
              : folder
                ? ""
                : (fo?.name ?? "");
          return { file: f, dir };
        }),
        name,
        { onProgress: setZipProgress },
      );
    } catch (e) {
      toast.error(errorText(e, "Couldn't build the ZIP. Try fewer files."));
    } finally {
      setZipProgress(null);
    }
  }

  async function deleteSelection() {
    const list = selectedFiles.filter(mayDelete);
    setBulkBusy(true);
    let ok = 0;
    const failed: string[] = [];
    for (const f of list) {
      try {
        await deleteHubFile(f);
        ok++;
      } catch (e) {
        failed.push(`${f.name}: ${errorText(e)}`);
      }
    }
    setBulkBusy(false);
    setConfirmDelete(false);
    setSelected(new Set());
    await m.reload();
    if (ok) toast.success(`Deleted ${ok === 1 ? "1 file" : `${ok} files`}`);
    if (failed.length)
      toast.error(failed[0] + (failed.length > 1 ? ` (and ${failed.length - 1} more)` : ""));
  }

  /* -- details ------------------------------------------------------------ */

  const detail = nav.file ? (files.find((f) => f.id === nav.file) ?? null) : null;
  const openFile = (f: HubFile) => onNav({ ...nav, file: f.id });
  const closeFile = () => onNav({ ...nav, file: undefined }, { replace: true });

  /* -- render ------------------------------------------------------------- */

  const title = folder ? folder.name : PLACE_LABEL(place);
  const blurb = folder
    ? `A folder in ${SECTION_META[folder.section as AssetSection].label}.`
    : section
      ? SECTION_META[section].blurb
      : place === "starred"
        ? "The files you reach for most. Star any file to keep it here."
        : place === "medialife"
          ? "Files the MEDIALIFE team added for you: mockups, launch assets, cleaned-up art."
          : "Everything in one place. Drop anything here and we'll sort it into sections.";
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  const navProps = {
    place,
    folderId: folder?.id ?? null,
    counts: counts.places,
    folders,
    folderCounts: counts.byFolder,
    showMedialife: counts.places.medialife > 0,
    totalBytes,
    totalFiles: files.length,
    onGo: go,
    onDropTo: (t: DropTarget, ids: string[]) => void moveTo(t, byIds(ids)),
    onNewFolder: (s: AssetSection) => setFolderDialog({ folder: null, section: s }),
  };
  const Icon = section
    ? SECTION_ICON[section]
    : place in VIEW_ICON
      ? VIEW_ICON[place as keyof typeof VIEW_ICON]
      : LayoutGrid;
  const kit = section === "branding" && !folder && !filtering ? brandKit(files) : null;

  return (
    <div className="@container/lib">
      <div className="grid gap-6 @4xl/lib:grid-cols-[13.5rem_minmax(0,1fr)]">
        <aside className="hidden @4xl/lib:block">
          <div className="sticky top-20 rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.05),rgb(255_255_255/0.01))] p-2 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_20px_40px_-24px_rgb(0_0_0/0.9)]">
            <LibrarySidebar {...navProps} />
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="@4xl/lib:hidden">
            <LibraryChips {...navProps} />
          </div>

          {/* Heading */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {folder ? (
                <button
                  type="button"
                  onClick={() => go(folder.section as AssetSection)}
                  className="mb-1 inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                  {SECTION_META[folder.section as AssetSection].label}
                </button>
              ) : null}
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Icon className="size-5 text-[var(--partner)]" aria-hidden />
                <span className="truncate">{title}</span>
                {folder ? (
                  <FolderMenu
                    name={folder.name}
                    className="mr-0"
                    onRename={() =>
                      setFolderDialog({ folder, section: folder.section as AssetSection })
                    }
                    onDelete={() => setDeletingFolder(folder)}
                  />
                ) : null}
              </h2>
              {/* Phones: the empty state carries the explanation; files come first. */}
              <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{blurb}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={() => openPicker()} className="rounded-full px-4">
                <Upload aria-hidden /> Upload
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="More library actions"
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem
                    onSelect={() =>
                      setFolderDialog({ folder: null, section: section ?? "branding" })
                    }
                  >
                    <FolderPlus aria-hidden /> New folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!inPlace.length || zipProgress !== null}
                    onSelect={() => void downloadSelection(filtering ? shown : inPlace, title)}
                  >
                    <Download aria-hidden />
                    {filtering
                      ? `Download these ${shown.length} as ZIP`
                      : `Download all ${inPlace.length} as ZIP`}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setTagsOpen(true)}>
                    <Tags aria-hidden /> Manage tags
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={picker}
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose files to upload"
                onChange={(e) => {
                  if (e.target.files) startUpload([...e.target.files], pickTags.current);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Search and filters */}
          {files.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 basis-56">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${folder ? folder.name : place === "all" ? "all files" : PLACE_LABEL(place)} by name, tag or note`}
                  aria-label="Search files"
                  className="h-9 pl-8"
                />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-9">
                    <Filter aria-hidden /> {type ? MEDIA_LABEL[type] : "Type"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>File type</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={type ?? ""}
                    onValueChange={(v) => setFilter({ type: v || undefined })}
                  >
                    <DropdownMenuRadioItem value="">Any type</DropdownMenuRadioItem>
                    {typesHere.map((t) => (
                      <DropdownMenuRadioItem key={t} value={t}>
                        {MEDIA_LABEL[t]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {tagCounts.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-9 max-w-44">
                      <Tags aria-hidden /> <span className="truncate">{nav.tag ?? "Tag"}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                    <DropdownMenuLabel>Tag</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={nav.tag ? tagKey(nav.tag) : ""}
                      onValueChange={(v) =>
                        setFilter({ tag: tagCounts.find((t) => tagKey(t.tag) === v)?.tag })
                      }
                    >
                      <DropdownMenuRadioItem value="">Any tag</DropdownMenuRadioItem>
                      {tagCounts.map((t) => (
                        <DropdownMenuRadioItem key={t.tag} value={tagKey(t.tag)}>
                          <span className="flex-1">{t.tag}</span>
                          <span className="ml-3 text-xs text-muted-foreground tabular-nums">
                            {t.count}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9"
                    aria-label={`Sort: ${SORTS[prefs.sort]}`}
                  >
                    <ArrowDownUp aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={prefs.sort}
                    onValueChange={(v) => setPrefs({ sort: v as Sort })}
                  >
                    {(Object.keys(SORTS) as Sort[]).map((s) => (
                      <DropdownMenuRadioItem key={s} value={s}>
                        {SORTS[s]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <div
                role="group"
                aria-label="View"
                className="flex rounded-md border border-border p-0.5"
              >
                {(["grid", "list"] as const).map((v) => {
                  const I = v === "grid" ? LayoutGrid : List;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={prefs.view === v}
                      aria-label={v === "grid" ? "Grid view" : "List view"}
                      onClick={() => setPrefs({ view: v })}
                      className={cn(
                        "grid size-7 place-items-center rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        prefs.view === v
                          ? "bg-white/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <I className="size-4" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {filtering ? (
            <div
              className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <span className="tabular-nums">
                {shown.length} match{shown.length === 1 ? "" : "es"}
              </span>
              {type ? (
                <TagChip tag={MEDIA_LABEL[type]} onRemove={() => setFilter({ type: undefined })} />
              ) : null}
              {nav.tag ? (
                <TagChip tag={`#${nav.tag}`} onRemove={() => setFilter({ tag: undefined })} />
              ) : null}
              {q ? (
                <TagChip
                  tag={`“${query.trim()}”`}
                  onRemove={() => {
                    setQuery("");
                    setFilter({ q: undefined });
                  }}
                />
              ) : null}
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-primary hover:underline"
              >
                Clear all
              </button>
            </div>
          ) : null}

          {kit ? <BrandKit items={kit} onAdd={(tags) => openPicker(tags)} /> : null}

          {sectionFolders.length ? (
            <ul className="grid grid-cols-1 gap-2 @md/lib:grid-cols-2 @3xl/lib:grid-cols-3 @6xl/lib:grid-cols-4">
              {sectionFolders.map((f) => (
                <FolderCard
                  key={f.id}
                  folder={f}
                  count={counts.byFolder[f.id] ?? 0}
                  onOpen={() => go(f.section as AssetSection, f.id)}
                  onRename={() =>
                    setFolderDialog({ folder: f, section: f.section as AssetSection })
                  }
                  onDelete={() => setDeletingFolder(f)}
                  onDropIds={(ids) =>
                    void moveTo({ section: f.section as AssetSection, folderId: f.id }, byIds(ids))
                  }
                />
              ))}
            </ul>
          ) : null}

          {/* Files */}
          {shown.length ? (
            prefs.view === "grid" ? (
              <ul className="grid grid-cols-2 gap-2.5 @md/lib:grid-cols-3 @3xl/lib:grid-cols-4 @5xl/lib:grid-cols-5">
                {shown.map((f) => (
                  <AssetTile
                    key={f.id}
                    file={f}
                    selected={selected.has(f.id)}
                    selecting={selecting}
                    folderName={!folder ? folderOf(f)?.name : undefined}
                    showSection={!section}
                    dragIds={() => (selected.has(f.id) ? [...selected] : [f.id])}
                    onToggle={(e) => toggle(f, e)}
                    onOpen={() => openFile(f)}
                    onStar={() => void m.update([f], { starred: !f.starred })}
                  />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {shown.map((f) => (
                  <AssetRow
                    key={f.id}
                    file={f}
                    selected={selected.has(f.id)}
                    selecting={selecting}
                    where={[
                      section ? null : SECTION_META[sectionOf(f)].label,
                      folder ? null : folderOf(f)?.name,
                    ]
                      .filter(Boolean)
                      .join(" › ")}
                    dragIds={() => (selected.has(f.id) ? [...selected] : [f.id])}
                    onToggle={(e) => toggle(f, e)}
                    onOpen={() => openFile(f)}
                    onStar={() => void m.update([f], { starred: !f.starred })}
                  />
                ))}
              </ul>
            )
          ) : filtering ? (
            <EmptyState
              icon={Search}
              title="No files match"
              action={
                <Button type="button" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            >
              Try another word, or look in All files.
            </EmptyState>
          ) : sectionFolders.length ? null : (
            <EmptyState
              icon={files.length ? Icon : UploadCloud}
              title={
                !files.length
                  ? "Your asset library is empty"
                  : place === "starred"
                    ? "Nothing starred yet"
                    : place === "medialife"
                      ? "Nothing from us yet"
                      : `Nothing in ${title} yet`
              }
              action={
                place === "starred" || place === "medialife" ? undefined : (
                  <Button type="button" onClick={() => openPicker()}>
                    <Upload aria-hidden /> Upload from computer
                  </Button>
                )
              }
            >
              {!files.length
                ? "Drop in logos, brand guidelines, social posts, photos, video, 3D models: anything you'd hand a designer. We sort it into sections for you, and use it to make your merch and experiences."
                : place === "starred"
                  ? "Star the files you use most, from any section, and they collect here."
                  : place === "medialife"
                    ? "Mockups, launch assets and cleaned-up art from the team will show up here."
                    : "Drag files onto this page, or choose them from your computer."}
            </EmptyState>
          )}
        </div>
      </div>

      {/* Page-wide drop target */}
      {dropping ? (
        <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-background/70 p-6 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-primary bg-primary/10 px-10 py-12 text-center">
            <UploadCloud className="size-10 text-primary" aria-hidden />
            <div className="text-lg font-medium">Drop to upload</div>
            <div className="text-sm text-muted-foreground">
              {uploadOpen
                ? "They'll join the files you're uploading."
                : folder
                  ? `Into ${folder.name}`
                  : section
                    ? `Into ${SECTION_META[section].label}`
                    : "We'll sort them into sections for you."}
            </div>
          </div>
        </div>
      ) : null}

      {zipProgress !== null ? (
        <div
          role="status"
          className="glass-strong fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] z-50 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm md:bottom-6"
        >
          <Loader2
            className="size-4 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
          Preparing ZIP… <span className="tabular-nums">{Math.round(zipProgress * 100)}%</span>
        </div>
      ) : null}

      {selecting ? (
        <SelectionBar
          count={selected.size}
          folders={folders}
          yourTags={yourTags}
          sharedTags={[
            ...new Map(selectedFiles.flatMap(tagsOf).map((t) => [tagKey(t), t])).values(),
          ]}
          allStarred={selectedFiles.every((f) => f.starred)}
          deletable={selectedFiles.filter(mayDelete).length}
          busy={bulkBusy || zipProgress !== null}
          onMove={(t) => void moveTo(t, selectedFiles)}
          onAddTag={(t) =>
            void m.update(
              selectedFiles,
              { addTags: [t] },
              `Tagged ${selectedFiles.length} with “${t}”`,
            )
          }
          onRemoveTag={(t) => void m.update(selectedFiles, { removeTags: [t] }, `Removed “${t}”`)}
          onStar={(on) => void m.update(selectedFiles, { starred: on })}
          onDownload={() =>
            void downloadSelection(selectedFiles, `${title} (${selectedFiles.length})`)
          }
          onDelete={() => setConfirmDelete(true)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !bulkBusy && setConfirmDelete(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete{" "}
              {selectedFiles.filter(mayDelete).length === 1
                ? "1 file"
                : `${selectedFiles.filter(mayDelete).length} files`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They're removed from the library for good, and taken off any product that uses them.
              Designs already made with them aren't affected.
              {selectedFiles.length > selectedFiles.filter(mayDelete).length
                ? ` ${selectedFiles.length - selectedFiles.filter(mayDelete).length} from MEDIALIFE stay: only the team can remove those.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Keep them</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                void deleteSelection();
              }}
            >
              {bulkBusy ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {upload ? (
        <UploadDialog
          open
          onOpenChange={(o) => !o && setUpload(null)}
          initial={upload.files}
          target={upload.target}
          library={files}
          folders={folders}
          yourTags={yourTags}
          creatorId={mode === "admin" ? creatorId : undefined}
          append={append}
          onUploaded={() => m.reload()}
        />
      ) : null}

      <FolderDialog
        open={!!folderDialog}
        onOpenChange={(o) => !o && setFolderDialog(null)}
        folder={folderDialog?.folder ?? null}
        section={folderDialog?.section ?? "branding"}
        onSubmit={async (name, s) => {
          if (folderDialog?.folder) {
            await m.folderOps.rename(folderDialog.folder.id, name);
            toast.success("Folder renamed");
          } else {
            const f = await m.folderOps.create(name, s);
            toast.success(`Created ${f.name}`);
            go(s, f.id);
          }
        }}
      />
      <DeleteFolderDialog
        folder={deletingFolder}
        count={deletingFolder ? (counts.byFolder[deletingFolder.id] ?? 0) : 0}
        onOpenChange={(o) => !o && setDeletingFolder(null)}
        onConfirm={async () => {
          const f = deletingFolder;
          if (!f) return;
          setDeletingFolder(null);
          try {
            await m.folderOps.remove(f.id);
            toast.success(`Deleted the ${f.name} folder`);
            if (folder?.id === f.id) go(f.section as AssetSection);
          } catch (e) {
            toast.error(errorText(e));
          }
        }}
      />
      <ManageTagsDialog
        open={tagsOpen}
        onOpenChange={setTagsOpen}
        tags={tagCounts}
        onRename={m.tagOps.rename}
      />

      <AssetDetails
        mode={mode}
        file={detail}
        open={!!detail}
        onOpenChange={(o) => !o && closeFile()}
        folders={folders}
        yourTags={yourTags}
        usedIn={detail ? usedIn(detail) : []}
        canEdit={!!detail && mayEdit(detail)}
        canDelete={!!detail && mayDelete(detail)}
        onPatch={(f, p, msg) => void m.update([f], p, msg)}
        onDeleted={() => {
          closeFile();
          void m.reload();
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Tiles and rows
   --------------------------------------------------------------------------- */

type ItemProps = {
  file: HubFile;
  selected: boolean;
  selecting: boolean;
  dragIds: () => string[];
  onToggle: (e: { shiftKey?: boolean }) => void;
  onOpen: () => void;
  onStar: () => void;
};

function useItemHandlers({ selecting, dragIds, onToggle, onOpen }: ItemProps) {
  return {
    onClick: (e: MouseEvent) => {
      // While selecting (or with a modifier), a click selects; otherwise it opens.
      if (selecting || e.shiftKey || e.metaKey || e.ctrlKey) onToggle(e);
      else onOpen();
    },
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds()));
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

function SelectBox({
  file,
  selected,
  onToggle,
  className,
}: {
  file: HubFile;
  selected: boolean;
  onToggle: (e: { shiftKey?: boolean }) => void;
  className?: string;
}) {
  return (
    <label
      className={cn("grid size-8 cursor-pointer place-items-center", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onToggle({ shiftKey: (e.nativeEvent as globalThis.MouseEvent).shiftKey })}
        className="size-4 cursor-pointer rounded accent-[var(--primary)]"
        aria-label={`Select ${file.name}`}
      />
    </label>
  );
}

function StarButton({
  file,
  onStar,
  className,
}: {
  file: HubFile;
  onStar: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onStar();
      }}
      aria-pressed={!!file.starred}
      aria-label={file.starred ? `Unstar ${file.name}` : `Star ${file.name}`}
      className={cn(
        "grid size-8 place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <Star
        className={cn("size-4", file.starred ? "fill-amber-300 text-amber-300" : "text-foreground")}
        aria-hidden
      />
    </button>
  );
}

function AssetTile(props: ItemProps & { folderName?: string; showSection: boolean }) {
  const { file: f, selected, selecting, folderName, showSection, onToggle, onStar } = props;
  const h = useItemHandlers(props);
  const tags = tagsOf(f);
  const reveal =
    selecting || selected
      ? "opacity-100"
      : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100";
  return (
    <li
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-2xl border bg-[linear-gradient(180deg,rgb(255_255_255/0.06),rgb(255_255_255/0.015))] shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06),0_18px_36px_-24px_rgb(0_0_0/0.9)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        selected
          ? "border-[var(--partner)] ring-1 ring-[var(--partner)]"
          : "border-white/[0.08] hover:border-[var(--partner)]/55",
      )}
    >
      <button
        type="button"
        {...h}
        className="block w-full text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        aria-label={selecting ? `${selected ? "Deselect" : "Select"} ${f.name}` : `Open ${f.name}`}
      >
        <AssetThumb file={f} className="aspect-square" />
        <span className="block min-w-0 p-2.5">
          <span className="block truncate text-xs font-medium" title={f.name}>
            {f.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
            {[
              f.uploadedBy === "medialife" ? "MEDIALIFE" : null,
              showSection ? SECTION_META[sectionOf(f)].label : null,
              folderName,
              formatBytes(f.size),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {tags.length ? (
            <span className="mt-1.5 flex min-w-0 gap-1 overflow-hidden">
              {tags.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="truncate rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
              {tags.length > 2 ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  +{tags.length - 2}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </button>
      <SelectBox
        file={f}
        selected={selected}
        onToggle={onToggle}
        className={cn(
          "absolute top-1 left-1 rounded-md bg-background/70 backdrop-blur transition-opacity",
          reveal,
        )}
      />
      <StarButton
        file={f}
        onStar={onStar}
        className={cn(
          "absolute top-1 right-1 bg-background/70 backdrop-blur transition-opacity",
          f.starred ? "opacity-100" : reveal,
        )}
      />
    </li>
  );
}

function AssetRow(props: ItemProps & { where: string }) {
  const { file: f, selected, where, onToggle, onStar } = props;
  const h = useItemHandlers(props);
  const tags = tagsOf(f);
  return (
    <li
      className={cn(
        "group flex items-center gap-2 pr-2 pl-1",
        selected ? "bg-primary/10" : "hover:bg-white/[0.03]",
      )}
    >
      <SelectBox file={f} selected={selected} onToggle={onToggle} />
      <button
        type="button"
        {...h}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <AssetThumb file={f} className="size-10 shrink-0 rounded-md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={f.name}>
            {f.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {[
              MEDIA_LABEL[mediaTypeOf(f)],
              where,
              f.uploadedBy === "medialife" ? "From MEDIALIFE" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="hidden min-w-0 flex-1 gap-1 overflow-hidden @3xl/lib:flex">
          {tags.slice(0, 3).map((t) => (
            <TagChip key={t} tag={t} className="h-5 text-[11px]" />
          ))}
        </span>
        <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums @xl/lib:block">
          {formatBytes(f.size)}
        </span>
        <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground @2xl/lib:block">
          {shortDate(f.createdAt).replace(/, \d{4}$/, "")}
        </span>
      </button>
      <StarButton
        file={f}
        onStar={onStar}
        className={f.starred ? "" : "opacity-60 group-hover:opacity-100"}
      />
    </li>
  );
}
