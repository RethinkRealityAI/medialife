/**
 * The Partner Hub's merch shelf builder. It opens on the team's current shelf
 * (their starting Snowday-style shelf the first time) with the live 3D preview
 * already running, so there's something to show before anything is touched.
 * Edits autosave; "Save as new" keeps this one and starts a copy for another
 * creator; "New shelf" starts from the team's design, this shelf, or MEDIALIFE's.
 *
 * The form, preview and publish flow are the admin's (src/components/admin/
 * shelves/*), pointed at the partner's own server functions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  CopyPlus,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  Rocket,
  RotateCcw,
  SlidersHorizontal,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ShelfForm } from "@/components/admin/shelves/editor-form";
import { ShelfPreviewPane } from "@/components/admin/shelves/preview";
import { PublishShelfDialog } from "@/components/admin/shelves/publish-dialog";
import {
  SHELF_SECTIONS,
  sectionOfPath,
  shelfFieldId,
  type ShelfSectionId,
} from "@/components/admin/shelves/sections";
import { STATUS_LABEL, copyText } from "@/components/admin/shelves/shared";
import {
  useShelfAutosave,
  type ShelfSaveStatus,
} from "@/components/admin/shelves/use-shelf-autosave";
import { useShelfPreview } from "@/components/admin/shelves/use-shelf-preview";
import type { LibraryRequest } from "@/components/ar-builder/editor-context";
import { Tag } from "@/components/partner/ui";
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { AssetListItem } from "@/lib/ar/assets";
import { shelfConfigSchema, type ShelfConfig } from "@/lib/shelf/config";
import {
  partnerCreateShelfFn,
  partnerDeleteShelfFn,
  partnerPublishShelfFn,
  partnerRenameShelfFn,
  partnerResetShelfFn,
  partnerSaveShelfDraftFn,
} from "@/lib/shelf/partner-shelves.functions";
import { shelfPath, type ShelfDoc, type ShelfSummary } from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

import { ShelfActivitySheet, useShelfOpens } from "./shelf-activity";
import { SHELF_IMAGE_TYPES, imageSize, uploadShelfImage } from "./shelf-upload";

type Start = "preset" | "copy" | "blank";

function friendly(issue: { code: string; message: string }): string {
  if (issue.code === "too_small") return "Required";
  if (issue.code === "too_big") return "Too long";
  if (issue.code === "invalid_string") return "Not a valid value";
  return issue.message;
}

export function PartnerShelfEditor({
  doc,
  summary: initialSummary,
  shelves,
  invites,
  partnerName,
}: {
  doc: ShelfDoc;
  summary: ShelfSummary;
  shelves: ShelfSummary[];
  invites: { code: string; rep: string }[];
  partnerName: string;
}) {
  const slug = doc.slug;
  const router = useRouter();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ShelfConfig>(doc.draft);
  const [summary, setSummary] = useState(initialSummary);
  const [published, setPublished] = useState<ShelfConfig | null>(doc.published);
  const [section, setSection] = useState<ShelfSectionId>("creator");
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  // Phones: the shelf first, so it "loads immediately".
  const [pane, setPane] = useState<"preview" | "settings">("preview");
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState<Start | null>(null);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activity, setActivity] = useState(false);
  const opens = useShelfOpens(slug)?.opens ?? 0;
  const fileInput = useRef<HTMLInputElement>(null);
  const picking = useRef<LibraryRequest | null>(null);

  const parsed = useMemo(() => shelfConfigSchema.safeParse(draft), [draft]);
  const issues = useMemo(() => {
    const m = new Map<string, string>();
    if (!parsed.success) {
      for (const i of parsed.error.issues) {
        const k = i.path.join(".");
        if (!m.has(k)) m.set(k, friendly(i));
      }
    }
    return m;
  }, [parsed]);
  const canPublish = !parsed.success
    ? "Some fields need fixing first (they're highlighted)."
    : draft.products.some((p) => p.enabled)
      ? null
      : "Turn on at least one product first.";

  const preview = useShelfPreview();
  const { setConfig } = preview;
  useEffect(() => {
    if (parsed.success) setConfig(parsed.data);
  }, [parsed, setConfig]);

  const autosave = useShelfAutosave({
    slug,
    draft,
    valid: parsed.success,
    updatedAt: doc.updatedAt,
    onSaved: (r) => setSummary(r.summary),
    save: partnerSaveShelfDraftFn as Parameters<typeof useShelfAutosave>[0]["save"],
  });

  useBlocker({
    shouldBlockFn: async () => {
      if (await autosave.flush()) return false;
      return !window.confirm("Your latest changes couldn't be saved. Leave anyway?");
    },
    enableBeforeUnload: false,
  });

  const update = useCallback((fn: (d: ShelfConfig) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  /** Image fields: pick a file and upload it (partners have no shared library). */
  const openLibrary = useCallback((req: LibraryRequest) => {
    picking.current = req;
    fileInput.current?.click();
  }, []);

  async function onFile(file: File | undefined) {
    const req = picking.current;
    picking.current = null;
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !req) return;
    if (!SHELF_IMAGE_TYPES.includes(file.type)) {
      toast.error("Use a PNG, JPEG or WebP image. A transparent PNG works best for logos.");
      return;
    }
    setUploading(true);
    try {
      const a = await uploadShelfImage(file, {
        name: file.name,
        mime: file.type,
        ...(await imageSize(file)),
      });
      req.onPick({ id: a.id } as AssetListItem);
      toast.success("Image added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't upload that image. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function jumpTo(path: string) {
    setPane("settings");
    setSection(sectionOfPath(path));
    const m = /^products\.(\d+)/.exec(path);
    if (m) setOpenProduct(draft.products[Number(m[1])]?.id ?? null);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(shelfFieldId(path));
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      }),
    );
  }

  const live = !!published;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicUrl = `${origin}${shelfPath(slug)}`;
  const firstIssue = issues.keys().next().value as string | undefined;
  const go = (to: string) =>
    navigate({ to: "/partner-hub/shelves", search: { shelf: to }, resetScroll: false });

  async function saveAsNew() {
    await autosave.flush();
    setCreating("copy");
  }

  async function copyLink() {
    if (!live) {
      toast.message("Publish it first", { description: "The link works once it's published." });
      return;
    }
    if (await copyText(publicUrl)) toast.success("Shelf link copied");
  }

  const sharing = (
    <PartnerSharing
      slug={slug}
      label={summary.name}
      live={live}
      url={publicUrl}
      flush={autosave.flush}
      onRenamed={(s, updatedAt) => {
        setSummary(s);
        autosave.setBase(updatedAt);
      }}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[480px] flex-col max-md:h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom)-5.75rem)]">
      {/* Toolbar */}
      <div className="glass z-10 mx-2 mt-2 flex shrink-0 flex-wrap items-center gap-2 rounded-[22px] px-2 py-1.5 sm:mx-3">
        <ShelfSwitcher
          shelves={shelves}
          current={slug}
          name={draft.creator.name}
          neon={draft.theme.neon}
          onPick={(s) => void go(s)}
          onNew={() => setCreating("preset")}
        />
        <Tag
          tone={
            summary.status === "published"
              ? "mint"
              : summary.status === "changed"
                ? "amber"
                : "blue"
          }
          className="hidden sm:inline-flex"
        >
          {STATUS_LABEL[summary.status]}
        </Tag>
        <SaveIndicator
          status={autosave.status}
          error={autosave.error}
          onRetry={() => void autosave.retry()}
          onReload={() => void router.invalidate()}
          onOverwrite={() => void autosave.overwrite()}
          onFix={firstIssue ? () => jumpTo(firstIssue) : undefined}
        />
        {uploading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Uploading…
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full max-sm:hidden"
            onClick={() => setActivity(true)}
            aria-label={opens > 0 ? `Activity: ${opens} open${opens === 1 ? "" : "s"}` : "Activity"}
            title="Who opened this shelf"
          >
            <Eye aria-hidden /> <span className="hidden lg:inline">Activity</span>
            {opens > 0 ? (
              <span
                aria-hidden
                className="min-w-5 rounded-full bg-[var(--partner)] px-1.5 text-center text-[11px] leading-5 font-semibold text-[var(--partner-ink)] tabular-nums"
              >
                {opens > 999 ? "999+" : opens}
              </span>
            ) : null}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full max-sm:hidden"
            onClick={() => void saveAsNew()}
            aria-label="Save as new"
          >
            <CopyPlus aria-hidden /> <span className="hidden lg:inline">Save as new</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-full max-sm:hidden"
            onClick={() => setCreating("preset")}
            aria-label="New shelf"
          >
            <Plus aria-hidden /> <span className="hidden lg:inline">New shelf</span>
          </Button>
          <Button
            size="sm"
            className="h-9 rounded-full"
            onClick={() => setPublishing(true)}
            disabled={summary.status === "published" && autosave.status === "saved"}
          >
            <Rocket aria-hidden />
            <span className="hidden sm:inline">
              {summary.status === "draft"
                ? "Publish"
                : summary.status === "changed"
                  ? "Publish changes"
                  : "Published"}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label="More">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onSelect={() => void saveAsNew()} className="sm:hidden">
                <CopyPlus aria-hidden /> Save as new
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCreating("preset")} className="sm:hidden">
                <Plus aria-hidden /> New shelf
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setActivity(true)} className="sm:hidden">
                <Eye aria-hidden /> Who opened this
                {opens > 0 ? (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {opens}
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="sm:hidden" />
              <DropdownMenuItem onSelect={() => void copyLink()}>
                <Copy aria-hidden /> Copy shelf link
              </DropdownMenuItem>
              {live ? (
                <DropdownMenuItem asChild>
                  <a href={`${shelfPath(slug)}?notrack=1`} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden /> Open the live shelf
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <a
                  href={`${shelfPath(slug)}?draft=1&notrack=1`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => void autosave.flush()}
                >
                  <Eye aria-hidden /> Open the draft
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {summary.isDefault ? (
                <DropdownMenuItem onSelect={() => setConfirm("reset")}>
                  <RotateCcw aria-hidden /> Reset to the {partnerName} design
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onSelect={() => setConfirm("delete")}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 aria-hidden /> Delete this shelf
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Phones: one pane at a time, the shelf first */}
      <div
        className="mx-2 mt-2 flex shrink-0 gap-1 rounded-full p-1 lg:hidden glass"
        role="tablist"
      >
        {(
          [
            ["preview", Store, "Shelf"],
            ["settings", SlidersHorizontal, "Customise"],
          ] as const
        ).map(([p, Icon, label]) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={cn(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--partner)]",
              pane === p ? "glass-pill text-[var(--partner)]" : "text-muted-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="relative mt-2 flex min-h-0 flex-1 gap-3 px-2 pb-2 sm:px-3 sm:pb-3">
        <div
          className={cn(
            "glass flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[22px] lg:w-[420px] lg:shrink-0 xl:w-[460px]",
            pane !== "settings" && "max-lg:hidden",
          )}
        >
          <nav
            aria-label="Shelf settings"
            className="flex shrink-0 gap-1 border-b border-white/[0.06] p-2"
          >
            {SHELF_SECTIONS.map((s) => {
              const bad = [...issues.keys()].some((k) => sectionOfPath(k) === s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={section === s.id ? "page" : undefined}
                  onClick={() => setSection(s.id)}
                  className={cn(
                    "relative inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--partner)] [&_svg]:size-3.5",
                    section === s.id
                      ? "glass-pill text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <s.icon aria-hidden />
                  {s.label}
                  {bad ? (
                    <span
                      aria-label="has a problem"
                      className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive"
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ShelfForm
              draft={draft}
              update={update}
              issues={issues}
              section={section}
              openLibrary={openLibrary}
              openProduct={openProduct}
              setOpenProduct={setOpenProduct}
              sharing={sharing}
              inviteOptions={invites.map((i) => ({
                code: i.code,
                label: i.rep ? `${i.rep} (${i.code})` : `${partnerName} (${i.code})`,
              }))}
            />
          </div>
        </div>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden rounded-[22px] border border-white/[0.08] shadow-[0_24px_60px_-30px_rgb(0_0_0/0.9)]",
            // kept mounted while hidden: the 3D scene survives the switch
            pane !== "preview" && "max-lg:invisible max-lg:absolute max-lg:inset-0",
          )}
        >
          <ShelfPreviewPane preview={preview} invalid={!parsed.success} />
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={SHELF_IMAGE_TYPES.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <ShelfActivitySheet slug={slug} open={activity} onOpenChange={setActivity} />

      <PublishShelfDialog
        open={publishing}
        onOpenChange={setPublishing}
        slug={slug}
        canPublish={canPublish}
        preview={preview}
        flush={autosave.flush}
        publish={partnerPublishShelfFn as Parameters<typeof PublishShelfDialog>[0]["publish"]}
        upload={(blob, meta) => uploadShelfImage(blob, meta)}
        doneLinks={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`${shelfPath(slug)}?notrack=1`} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Open
              </a>
            </Button>
          </div>
        }
        onPublished={(d, s) => {
          autosave.markSaved(d.draft, d.updatedAt);
          setDraft(d.draft);
          setPublished(d.published);
          setSummary(s);
        }}
      />

      <NewShelfDialog
        start={creating}
        onClose={() => setCreating(null)}
        partnerName={partnerName}
        currentName={draft.creator.name}
        onCreate={async (input) => {
          const r = await partnerCreateShelfFn({ data: { ...input, from: slug } });
          if (!r.ok) return r.error;
          toast.success(input.start === "copy" ? "Saved as a new shelf" : "New shelf ready");
          await go(r.slug);
          return null;
        }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "reset" ? `Reset to the ${partnerName} design?` : "Delete this shelf?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "reset"
                ? "Your changes to this shelf's draft are replaced. What's published stays live until you publish again."
                : `${shelfPath(slug)} stops working for anyone who has it.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={confirm === "delete" ? "bg-destructive text-destructive-foreground" : ""}
              onClick={async () => {
                const what = confirm;
                setConfirm(null);
                // Let a save in flight land first, so it can't undo this.
                await autosave.flush();
                if (what === "reset") {
                  const r = await partnerResetShelfFn({ data: { slug } });
                  if (!r.ok) return void toast.error("Couldn't reset it. Try again.");
                  toast.success("Back to the original design");
                  await router.invalidate();
                } else if (what === "delete") {
                  const r = await partnerDeleteShelfFn({ data: { slug } });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Shelf deleted");
                  await navigate({ to: "/partner-hub/shelves", search: {} });
                }
              }}
            >
              {confirm === "reset" ? "Reset" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Pieces
   --------------------------------------------------------------------------- */

function ShelfSwitcher({
  shelves,
  current,
  name,
  neon,
  onPick,
  onNew,
}: {
  shelves: ShelfSummary[];
  current: string;
  name: string;
  neon: string;
  onPick: (slug: string) => void;
  onNew: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 min-w-0 items-center gap-2 rounded-full px-3 text-sm font-medium hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--partner)]"
          aria-label={`Shelf: ${name}. Switch shelf`}
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: neon, boxShadow: `0 0 10px ${neon}` }}
          />
          <span className="max-w-[9rem] truncate sm:max-w-[16rem]">{name || "Untitled"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Your shelves
        </DropdownMenuLabel>
        {shelves.map((s) => (
          <DropdownMenuItem key={s.slug} onSelect={() => onPick(s.slug)} className="gap-2.5">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: s.neon, boxShadow: `0 0 8px ${s.neon}` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.creator}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {s.isDefault ? "Your own shelf" : s.name} · {STATUS_LABEL[s.status]}
              </span>
            </span>
            {s.slug === current ? (
              <Check className="size-4 text-[var(--partner)]" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onNew}>
          <Plus aria-hidden /> New shelf…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const STARTS: { id: Start; title: string; body: (p: string) => string }[] = [
  { id: "preset", title: "Our look", body: (p) => `${p}'s colours, their name on the merch` },
  { id: "copy", title: "This shelf", body: () => "A copy of everything set up here" },
  { id: "blank", title: "MEDIALIFE classic", body: () => "The original look, with your invite" },
];

function NewShelfDialog({
  start,
  onClose,
  partnerName,
  currentName,
  onCreate,
}: {
  start: Start | null;
  onClose: () => void;
  partnerName: string;
  currentName: string;
  onCreate: (input: { creator: string; label?: string; start: Start }) => Promise<string | null>;
}) {
  const [creator, setCreator] = useState("");
  const [choice, setChoice] = useState<Start>("preset");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!start) return;
    setChoice(start);
    setCreator("");
    setError(null);
    setBusy(false);
  }, [start]);
  const saveAs = start === "copy";

  return (
    <Dialog open={!!start} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="glass-strong max-w-lg rounded-[28px]">
        <DialogTitle>{saveAs ? "Save as a new shelf" : "New shelf"}</DialogTitle>
        <DialogDescription>
          {saveAs
            ? `Same look as “${currentName}”, with another creator's name. This one stays as it is.`
            : "Make a shelf for a creator you're pitching. You can change everything after."}
        </DialogDescription>
        <form
          className="mt-2 grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!creator.trim() || busy) return;
            setBusy(true);
            setError(null);
            const err = await onCreate({ creator: creator.trim(), start: choice });
            if (err) {
              setError(err);
              setBusy(false);
            } else onClose();
          }}
        >
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Creator's name</span>
            <Input
              autoFocus
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              maxLength={28}
              placeholder="e.g. PixelPine"
            />
            <span className="text-xs text-muted-foreground">
              Goes on the neon sign and their merch. Up to 28 characters.
            </span>
          </label>
          {saveAs ? null : (
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-sm font-medium">Start from</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {STARTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={choice === s.id}
                    onClick={() => setChoice(s.id)}
                    className={cn(
                      "rounded-2xl border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--partner)]",
                      choice === s.id
                        ? "glass-pill border-[var(--partner)]/60"
                        : "border-white/[0.08] hover:border-white/20",
                    )}
                  >
                    <span className="block font-medium">{s.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {s.body(partnerName)}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {error ? (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!creator.trim() || busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
              {saveAs ? "Save as new" : "Create shelf"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PartnerSharing({
  slug,
  label,
  live,
  url,
  flush,
  onRenamed,
}: {
  slug: string;
  label: string;
  live: boolean;
  url: string;
  flush: () => Promise<boolean>;
  onRenamed: (s: ShelfSummary, updatedAt: number) => void;
}) {
  const [value, setValue] = useState(label);
  useEffect(() => setValue(label), [label]);
  async function save() {
    const v = value.trim();
    if (!v || v === label) return setValue(label);
    if (!(await flush())) return void toast.error("Save your changes first");
    const r = await partnerRenameShelfFn({ data: { slug, name: v } }).catch(() => null);
    if (r?.ok) {
      onRenamed(r.summary, r.updatedAt);
      toast.success("Label saved");
    } else toast.error("Couldn't rename. Try again.");
  }
  return (
    <section className="mx-4 mt-6 mb-4 grid gap-3 rounded-2xl border border-white/[0.08] p-4">
      <h3 className="text-sm font-medium">Label &amp; link</h3>
      <label className="grid gap-1.5 text-sm">
        <span className="text-xs text-muted-foreground">Label (only your team sees it)</span>
        <Input
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
      </label>
      <div className="flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {url.replace(/^https?:\/\//, "")}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!live}
          onClick={async () => {
            if (await copyText(url)) toast.success("Shelf link copied");
          }}
        >
          <Copy aria-hidden /> Copy
        </Button>
      </div>
      {live ? null : (
        <p className="text-xs text-muted-foreground">The link works once you publish.</p>
      )}
    </section>
  );
}

function SaveIndicator({
  status,
  error,
  onRetry,
  onReload,
  onOverwrite,
  onFix,
}: {
  status: ShelfSaveStatus;
  error: string | null;
  onRetry: () => void;
  onReload: () => void;
  onOverwrite: () => void;
  onFix?: () => void;
}) {
  const base = "inline-flex h-8 items-center gap-1.5 px-1.5 text-xs whitespace-nowrap";
  if (status === "saved")
    return (
      <span className={cn(base, "text-muted-foreground")} role="status" data-save="saved">
        <Check className="size-3.5 text-emerald-400" aria-hidden />
        <span className="hidden sm:inline">Saved</span>
      </span>
    );
  if (status === "pending" || status === "saving")
    return (
      <span className={cn(base, "text-muted-foreground")} role="status" data-save="saving">
        {status === "saving" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : (
          <Cloud className="size-3.5" aria-hidden />
        )}
        <span className="hidden sm:inline">Saving…</span>
      </span>
    );
  if (status === "invalid")
    return (
      <button
        type="button"
        onClick={onFix}
        className={cn(base, "rounded-md text-amber-300 hover:bg-amber-400/10")}
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Fix to save</span>
      </button>
    );
  if (status === "conflict")
    return (
      <span className={cn(base, "text-amber-300")}>
        <AlertTriangle className="size-3.5" aria-hidden />
        Changed elsewhere
        <button type="button" onClick={onReload} className="underline hover:text-foreground">
          Load theirs
        </button>
        <button type="button" onClick={onOverwrite} className="underline hover:text-foreground">
          Keep mine
        </button>
      </span>
    );
  if (status === "signed-out")
    return (
      <span className={cn(base, "text-destructive")}>
        <AlertTriangle className="size-3.5" aria-hidden />
        <a href="/creator-hub/sign-in?next=%2Fpartner-hub%2Fshelves" className="underline">
          Sign in again
        </a>
      </span>
    );
  return (
    <span className={cn(base, "text-destructive")} title={error ?? undefined}>
      <AlertTriangle className="size-3.5" aria-hidden />
      {error && error.length < 60 ? error : "Not saved"}
      <button type="button" onClick={onRetry} className="underline hover:text-foreground">
        Retry
      </button>
    </span>
  );
}
