import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  useBlocker,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  ExternalLink,
  Eye,
  Images,
  Link2,
  Loader2,
  MoreHorizontal,
  Rocket,
  Settings2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { AssetLibrary } from "@/components/ar-builder/asset-library";
import type { LibraryRequest } from "@/components/ar-builder/editor-context";
import { FieldShell, Group, inputClass } from "@/components/ar-builder/fields";
import { ShelfForm, SlugInput } from "@/components/admin/shelves/editor-form";
import { ShelfPreviewPane } from "@/components/admin/shelves/preview";
import {
  SHELF_SECTIONS,
  sectionOfPath,
  shelfFieldId,
  type ShelfSectionId,
} from "@/components/admin/shelves/sections";
import { useShelfPreview } from "@/components/admin/shelves/use-shelf-preview";
import { PublishShelfDialog } from "@/components/admin/shelves/publish-dialog";
import {
  absoluteUrl,
  copyText,
  useHost,
  shelvesQueryKey,
  STATUS_LABEL,
} from "@/components/admin/shelves/shared";
import {
  useShelfAutosave,
  type ShelfSaveStatus,
} from "@/components/admin/shelves/use-shelf-autosave";
import { Pill } from "@/components/portal/kit";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { shelfConfigSchema, type ShelfConfig } from "@/lib/shelf/config";
import {
  getShelfFn,
  moveShelfFn,
  renameShelfFn,
  unpublishShelfFn,
} from "@/lib/shelf/shelves.functions";
import {
  isValidShelfSlug,
  shelfDemoId,
  shelfDraftHref,
  shelfPath,
  type ShelfDoc,
  type ShelfStatus,
  type ShelfSummary,
} from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

// The shelf editor: settings on the left, the real shelf page in a live preview
// iframe on the right (driven over postMessage on every change). Edits autosave;
// Publish snapshots the preview for link previews and puts the draft live at
// /shelf/<slug>.

export const Route = createFileRoute("/admin/shelves/$slug")({
  loader: async ({ params }) => {
    const r = await getShelfFn({ data: { slug: params.slug } });
    if (!r) throw notFound();
    return r;
  },
  gcTime: 0,
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.doc.name ?? "Shelf"} · Merch shelves | MEDIALIFE` }],
  }),
  pendingComponent: EditorSkeleton,
  notFoundComponent: NotFound,
  component: EditorPage,
});

function EditorPage() {
  const data = Route.useLoaderData();
  return (
    <Editor key={`${data.doc.slug}:${data.doc.updatedAt}`} doc={data.doc} summary={data.summary} />
  );
}

function friendly(issue: { code: string; message: string }): string {
  if (issue.code === "too_small") return "Required";
  if (issue.code === "too_big") return "Too long";
  if (issue.code === "invalid_string") return "Not a valid value";
  return issue.message;
}

function Editor({ doc, summary: initialSummary }: { doc: ShelfDoc; summary: ShelfSummary }) {
  const slug = doc.slug;
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ShelfConfig>(doc.draft);
  const [summary, setSummary] = useState(initialSummary);
  const [published, setPublished] = useState<ShelfConfig | null>(doc.published);
  const [section, setSection] = useState<ShelfSectionId>("creator");
  const [openProduct, setOpenProduct] = useState<string | null>(null);
  const [pane, setPane] = useState<"settings" | "preview">("settings");
  const [library, setLibrary] = useState<{ open: boolean; req: LibraryRequest | null }>({
    open: false,
    req: null,
  });
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

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
  const enabledCount = draft.products.filter((p) => p.enabled).length;
  const canPublish = !parsed.success
    ? "Some fields need fixing first (they're highlighted)."
    : enabledCount === 0
      ? "Turn on at least one product first."
      : null;

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
  });

  // give the preview the room while editing; put the sidebar back afterwards
  const sidebar = useSidebar();
  const sidebarWasOpen = useRef(sidebar.open);
  const setSidebarOpen = sidebar.setOpen;
  useEffect(() => {
    const wasOpen = sidebarWasOpen.current;
    if (wasOpen) setSidebarOpen(false);
    return () => {
      if (wasOpen) setSidebarOpen(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const openLibrary = useCallback((req: LibraryRequest) => setLibrary({ open: true, req }), []);

  function jumpTo(path: string) {
    setPane("settings");
    const s = sectionOfPath(path);
    setSection(s);
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

  async function openDraft() {
    const w = window.open("about:blank", "_blank");
    await autosave.flush();
    if (w) {
      w.opener = null;
      w.location.href = shelfDraftHref(slug);
    } else window.open(shelfDraftHref(slug), "_blank", "noopener");
  }

  async function unpublish() {
    if (!(await autosave.flush())) {
      toast.error("Save your changes first");
      return;
    }
    try {
      const r = await unpublishShelfFn({ data: { slug } });
      if (!r.ok) throw new Error(r.error);
      setPublished(null);
      setSummary(r.summary);
      autosave.setBase(r.updatedAt);
      await qc.invalidateQueries({ queryKey: shelvesQueryKey });
      toast.success("Unpublished", {
        description: "The link now shows “This shelf isn't available”.",
      });
    } catch {
      toast.error("Couldn't unpublish. Try again.");
    }
  }

  const firstIssue = issues.keys().next().value as string | undefined;
  const status = summary.status;
  const live = !!published;
  const publicUrl = absoluteUrl(shelfPath(slug));
  const host = useHost();

  const sharing = (
    <SharingGroup
      slug={slug}
      name={summary.name}
      locked={!!(published || doc.publishedAt || summary.publishedAt)}
      live={live}
      flush={autosave.flush}
      onRenamed={(s, updatedAt) => {
        setSummary(s);
        autosave.setBase(updatedAt);
        void qc.invalidateQueries({ queryKey: shelvesQueryKey });
      }}
      onMoved={async (to) => {
        await qc.invalidateQueries({ queryKey: shelvesQueryKey });
        await navigate({ to: "/admin/shelves/$slug", params: { slug: to }, replace: true });
        toast.success("Link changed");
      }}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] min-h-[420px] flex-col">
      {/* header */}
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <Button asChild variant="ghost" size="sm" className="-ml-1 h-8 px-2 text-muted-foreground">
          <Link to="/admin/shelves">
            <ArrowLeft aria-hidden /> <span className="hidden sm:inline">Shelves</span>
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            aria-hidden
            className="hidden size-2.5 shrink-0 rounded-full sm:block"
            style={{ background: draft.theme.neon, boxShadow: `0 0 10px ${draft.theme.neon}` }}
          />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium" title={summary.name}>
              {draft.creator.name || "Untitled"}{" "}
              <span className="font-normal text-muted-foreground">· {summary.name}</span>
            </h1>
            <p className="mono truncate text-[10px] tracking-[0.06em] text-muted-foreground">
              {host}
              {shelfPath(slug)}
            </p>
          </div>
          <StatusPill status={status} />
        </div>
        <div className="flex items-center gap-1.5">
          <SaveIndicator
            status={autosave.status}
            error={autosave.error}
            onRetry={() => void autosave.retry()}
            onReload={() => void router.invalidate()}
            onOverwrite={() => void autosave.overwrite()}
            onFix={firstIssue ? () => jumpTo(firstIssue) : undefined}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 pointer-coarse:h-11"
            onClick={() => setLibrary({ open: true, req: null })}
          >
            <Images aria-hidden /> <span className="hidden xl:inline">Assets</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 pointer-coarse:h-11"
            onClick={() => void openDraft()}
          >
            <Eye aria-hidden /> <span className="hidden md:inline">Open draft</span>
          </Button>
          <Button
            size="sm"
            className="h-8 pointer-coarse:h-11"
            onClick={() => setPublishing(true)}
            disabled={status === "published" && autosave.status === "saved"}
          >
            <Rocket aria-hidden />
            {status === "draft"
              ? "Publish"
              : status === "changed"
                ? "Publish changes"
                : "Published"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 pointer-coarse:size-11"
                aria-label="More actions"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {live ? (
                <>
                  <DropdownMenuItem
                    onSelect={async () => {
                      if (await copyText(publicUrl)) toast.success("Link copied");
                    }}
                  >
                    <Copy aria-hidden /> Copy public link
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`${shelfPath(slug)}?notrack=1`} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden /> Open the live shelf
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/links" search={{ demo: shelfDemoId(slug) }}>
                      <Link2 aria-hidden /> Create personal link
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                onSelect={() => {
                  setPane("settings");
                  setSection("pitch");
                }}
              >
                <Settings2 aria-hidden /> Link &amp; label
              </DropdownMenuItem>
              {live ? (
                <DropdownMenuItem
                  onSelect={() => setUnpublishing(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Undo2 aria-hidden /> Unpublish…
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* phones and narrow windows: one pane at a time */}
      <div className="flex shrink-0 border-b border-border lg:hidden" role="tablist">
        {(["settings", "preview"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={pane === p}
            onClick={() => setPane(p)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium capitalize transition-colors",
              pane === p
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div
          className={cn(
            "flex min-h-0 w-full min-w-0 flex-col border-border lg:w-[440px] lg:shrink-0 lg:border-r xl:w-[480px]",
            pane !== "settings" && "max-lg:hidden",
          )}
        >
          <nav
            aria-label="Shelf settings"
            className="flex shrink-0 gap-1 border-b border-border px-3 py-2"
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
                    "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11 [&_svg]:size-3.5",
                    section === s.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
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
            />
          </div>
        </div>
        <div
          className={cn(
            "min-h-0 min-w-0 flex-1",
            // kept mounted while hidden: the WebGL scene survives the switch
            pane !== "preview" && "max-lg:invisible max-lg:absolute max-lg:inset-0",
          )}
        >
          <ShelfPreviewPane preview={preview} invalid={!parsed.success} />
        </div>
      </div>

      <AssetLibrary
        open={library.open}
        onOpenChange={(open) => setLibrary((l) => ({ ...l, open }))}
        request={library.req}
      />
      <PublishShelfDialog
        open={publishing}
        onOpenChange={setPublishing}
        slug={slug}
        canPublish={canPublish}
        preview={preview}
        flush={autosave.flush}
        onPublished={(d, s) => {
          autosave.markSaved(d.draft, d.updatedAt);
          setDraft(d.draft);
          setPublished(d.published);
          setSummary(s);
          void qc.invalidateQueries({ queryKey: shelvesQueryKey });
        }}
      />
      <AlertDialog open={unpublishing} onOpenChange={setUnpublishing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this shelf?</AlertDialogTitle>
            <AlertDialogDescription>
              {host}
              {shelfPath(slug)} stops working for everyone who has it, including personal links.
              Your draft stays here and you can publish again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pointer-coarse:[&_:is(button,a)]:h-11">
            <AlertDialogCancel>Keep it live</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void unpublish()}
            >
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusPill({ status }: { status: ShelfStatus }) {
  return (
    <Pill
      tone={status === "published" ? "live" : status === "changed" ? "watch" : "muted"}
      className="hidden shrink-0 sm:inline-flex"
    >
      {STATUS_LABEL[status]}
    </Pill>
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
        data-save="invalid"
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Fix to save</span>
      </button>
    );
  if (status === "conflict")
    return (
      <span className={cn(base, "text-amber-300")}>
        <AlertTriangle className="size-3.5" aria-hidden />
        Changed in another tab
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
        <Link to="/admin/login" className="underline">
          Sign in again
        </Link>
      </span>
    );
  return (
    <span className={cn(base, "text-destructive")} title={error ?? undefined}>
      <AlertTriangle className="size-3.5" aria-hidden />
      Not saved
      <button type="button" onClick={onRetry} className="underline hover:text-foreground">
        Retry
      </button>
    </span>
  );
}

function SharingGroup({
  slug,
  name,
  locked,
  live,
  flush,
  onRenamed,
  onMoved,
}: {
  slug: string;
  name: string;
  locked: boolean;
  live: boolean;
  flush: () => Promise<boolean>;
  onRenamed: (s: ShelfSummary, updatedAt: number) => void;
  onMoved: (to: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(name);
  const [nextSlug, setNextSlug] = useState(slug);
  const [busy, setBusy] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  useEffect(() => setLabel(name), [name]);

  async function saveLabel() {
    const v = label.trim();
    if (!v || v === name) return setLabel(name);
    if (!(await flush())) return toast.error("Save your changes first");
    const r = await renameShelfFn({ data: { slug, name: v } }).catch(() => null);
    if (r?.ok) {
      onRenamed(r.summary, r.updatedAt);
      toast.success("Label saved");
    } else toast.error("Couldn't rename. Try again.");
  }

  async function move() {
    setSlugError(null);
    if (!isValidShelfSlug(nextSlug))
      return setSlugError("2–40 lowercase letters, numbers and dashes (and not a reserved word).");
    if (!(await flush())) return setSlugError("Save your changes first.");
    setBusy(true);
    try {
      const r = await moveShelfFn({ data: { from: slug, to: nextSlug } });
      if (!r.ok) {
        setSlugError(
          r.error === "taken"
            ? "That link is taken. Try another."
            : r.error === "published"
              ? "It has been published, so the link can't change."
              : "Use lowercase letters, numbers and dashes.",
        );
        return;
      }
      await onMoved(r.slug);
    } catch {
      setSlugError("Couldn't change the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Group title="Link & label" description="The label is for the team; the creator never sees it.">
      <FieldShell id="shelf-label" label="Internal label">
        <Input
          id="shelf-label"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => void saveLabel()}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
          className={inputClass}
        />
      </FieldShell>
      <FieldShell
        id="shelf-slug"
        label="Link"
        error={slugError}
        hint={
          locked
            ? "Published links can't change: someone may already have it."
            : "You can change it until you publish."
        }
      >
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SlugInput value={nextSlug} onChange={setNextSlug} disabled={locked} />
          </div>
          {!locked && nextSlug !== slug ? (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void move()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Change
            </Button>
          ) : null}
        </div>
      </FieldShell>
      {live ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (await copyText(absoluteUrl(shelfPath(slug)))) toast.success("Link copied");
            }}
          >
            <Copy aria-hidden /> Copy public link
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/links" search={{ demo: shelfDemoId(slug) }}>
              <Link2 aria-hidden /> Create personal link
            </Link>
          </Button>
        </div>
      ) : null}
    </Group>
  );
}

function EditorSkeleton() {
  return (
    <div
      className="flex h-[calc(100svh-3.5rem)] flex-col"
      aria-busy="true"
      aria-label="Loading the editor"
    >
      <div className="flex h-14 items-center gap-3 border-b border-border px-3">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="ml-auto h-8 w-64" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[440px] shrink-0 space-y-4 border-r border-border p-5 lg:block">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex-1 bg-[oklch(0.1_0.008_280)]" />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <h1 className="text-lg font-medium">This shelf doesn't exist</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, or its link changed.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/admin/shelves">
          <ArrowLeft aria-hidden /> All shelves
        </Link>
      </Button>
    </div>
  );
}
