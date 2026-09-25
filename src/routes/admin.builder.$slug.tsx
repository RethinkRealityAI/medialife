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
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { assetsQueryKey, draftPreviewHref, projectsQueryKey } from "@/components/ar-builder/api";
import { PaneTabs, SplitDivider } from "@/components/ar-builder/layout";
import { AssetLibrary } from "@/components/ar-builder/asset-library";
import {
  EditorContext,
  pathKey,
  setIn,
  type EditorContextValue,
  type LibraryRequest,
} from "@/components/ar-builder/editor-context";
import { EditorHeader } from "@/components/ar-builder/editor-header";
import { PreviewPane } from "@/components/ar-builder/preview-pane";
import { PublishDialog } from "@/components/ar-builder/publish-dialog";
import { SettingsPanel } from "@/components/ar-builder/settings-panel";
import { useAutosave } from "@/components/ar-builder/use-autosave";
import { useEngine } from "@/components/ar-builder/use-engine";
import {
  useEditorLayout,
  useStoredState,
  type LayoutInfo,
} from "@/components/ar-builder/use-layout";
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
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  VIEWS,
  ZONES,
  type Project,
  type ProjectDoc,
  type ViewId,
  type ZoneId,
} from "@/lib/ar/project";
import {
  fieldId,
  projectIssues,
  sectionForPath,
  type Path,
  type ProjectSummary,
  type SectionId,
} from "@/lib/ar/projects";
import { getProjectFn, renameProjectFn, unpublishProjectFn } from "@/lib/ar/projects.functions";
import { cn } from "@/lib/utils";

// The endcap editor: settings and the live engine preview, arranged for the
// screen (side by side, stacked with a divider, or one at a time on phones; see
// components/ar-builder/use-layout.ts). Edits autosave; Publish makes the AR
// files and puts the draft live.

export const Route = createFileRoute("/admin/builder/$slug")({
  loader: async ({ params }) => {
    const r = await getProjectFn({ data: { slug: params.slug } });
    if (!r) throw notFound();
    return r;
  },
  // always start from the stored draft, never a cached copy
  gcTime: 0,
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.doc.draft.name ?? "Endcap"} · Endcap builder | MEDIALIFE` }],
  }),
  pendingComponent: EditorSkeleton,
  notFoundComponent: NotFound,
  component: EditorPage,
});

function EditorPage() {
  const data = Route.useLoaderData();
  const layout = useEditorLayout();
  if (!layout) return <EditorSkeleton />;
  // remount when the stored doc is reloaded (e.g. "Load theirs" after a conflict)
  return (
    <Editor
      key={`${data.doc.slug}:${data.doc.updatedAt}`}
      doc={data.doc}
      summary={data.summary}
      ui={layout}
    />
  );
}

function Editor({
  doc,
  summary: initialSummary,
  ui,
}: {
  doc: ProjectDoc;
  summary: ProjectSummary;
  ui: LayoutInfo;
}) {
  const slug = doc.slug;
  const qc = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Project>(doc.draft);
  const [summary, setSummary] = useState(initialSummary);
  const [published, setPublished] = useState<Project | null>(doc.published);
  const [section, setSection] = useState<SectionId>("overview");
  // compact layouts (see use-layout.ts)
  const [pane, setPane] = useState<"settings" | "preview">("settings");
  const [panelOpen, setPanelOpen] = useStoredState("ar-builder-panel-open", true);
  const [split, setSplit] = useStoredState("ar-builder-split", 0.42);
  const [dragging, setDragging] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const layout = ui.layout;
  const [zone, setZone] = useState<ZoneId>("cap");
  const [themeIndex, setThemeIndex] = useState(() =>
    Math.max(
      0,
      doc.draft.themes.findIndex((t) => t.id === doc.draft.defaultTheme),
    ),
  );
  const [library, setLibrary] = useState<{ open: boolean; req: LibraryRequest | null }>({
    open: false,
    req: null,
  });
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [previewTheme, setPreviewTheme] = useState(doc.draft.defaultTheme);
  const [previewView, setPreviewView] = useState<ViewId | "">("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const sentZone = useRef<ZoneId | null>(null);

  const issueList = useMemo(() => projectIssues(draft), [draft]);
  const issues = useMemo(
    () => new Map(issueList.map((i) => [pathKey(i.path), i.message])),
    [issueList],
  );

  const engine = useEngine({
    onState: (s) => {
      if (s.theme) setPreviewTheme(s.theme);
      if (s.view && s.view in VIEWS) setPreviewView(s.view as ViewId);
      if (s.zone && s.zone in ZONES) {
        // a product clicked in the preview: show its settings, don't echo it back
        sentZone.current = s.zone as ZoneId;
        setZone(s.zone as ZoneId);
        setSection("shelves");
      }
    },
    onError: (m) => setWarnings((w) => (w[0] === m ? w : [m, ...w].slice(0, 20))),
  });
  const { setProject, goto } = engine;
  useEffect(() => setProject(draft), [draft, setProject]);

  // the product sheet follows the selected zone while Shelves is open
  useEffect(() => {
    const target = section === "shelves" ? zone : null;
    if (sentZone.current === target) return;
    sentZone.current = target;
    goto({ zone: target });
  }, [section, zone, goto]);

  const autosave = useAutosave({
    slug,
    draft,
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

  // leaving inside the app: save first; ask only if that fails
  useBlocker({
    shouldBlockFn: async () => {
      if (await autosave.flush()) return false;
      return !window.confirm("Your latest changes couldn't be saved. Leave anyway?");
    },
    enableBeforeUnload: false,
  });

  const update = useCallback((fn: (d: Project) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);
  const setAt = useCallback(
    (path: Path, value: unknown) => update((d) => setIn(d, path, value)),
    [update],
  );

  const openLibrary = useCallback((req: LibraryRequest) => setLibrary({ open: true, req }), []);

  const jumpTo = useCallback(
    (path: Path) => {
      setPane("settings");
      setPanelOpen(true);
      setSection(sectionForPath(path));
      if (path[0] === "zones" && typeof path[1] === "string") setZone(path[1] as ZoneId);
      if (path[0] === "themes" && typeof path[1] === "number") setThemeIndex(path[1]);
      // after the section renders: the closest field on the path
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          for (let n = path.length; n > 0; n--) {
            const el = document.getElementById(fieldId(path.slice(0, n)));
            if (el) {
              el.scrollIntoView({ block: "center", behavior: "smooth" });
              el.focus({ preventScroll: true });
              return;
            }
          }
        }),
      );
    },
    [setPanelOpen],
  );

  async function rename(to: string): Promise<string | null> {
    if (!(await autosave.flush())) return "Save your changes first (see the save status above).";
    try {
      const r = await renameProjectFn({ data: { from: slug, to } });
      if (!r.ok) {
        return r.error === "taken"
          ? "That link is taken. Try another."
          : r.error === "published"
            ? "It has been published, so the link can't change."
            : "Use lowercase letters, numbers and dashes.";
      }
      await qc.invalidateQueries({ queryKey: projectsQueryKey });
      await navigate({ to: "/admin/builder/$slug", params: { slug: r.slug }, replace: true });
      toast.success("Link changed");
      return null;
    } catch {
      return "Couldn't change the link. Try again.";
    }
  }

  async function openPreview() {
    // open synchronously (popup blockers), point it at the draft once it's saved
    const w = window.open("about:blank", "_blank");
    await autosave.flush();
    if (w) {
      w.opener = null;
      w.location.href = draftPreviewHref(slug);
    } else window.open(draftPreviewHref(slug), "_blank", "noopener");
  }

  async function unpublish() {
    if (!(await autosave.flush())) {
      toast.error("Save your changes first");
      return;
    }
    try {
      const r = await unpublishProjectFn({ data: { slug } });
      if (!r.ok) throw new Error(r.error);
      setPublished(null);
      setSummary(r.summary);
      autosave.markSaved(draft, r.summary.updatedAt);
      await qc.invalidateQueries({ queryKey: projectsQueryKey });
      toast.success("Unpublished", {
        description: "The link now shows “This endcap isn't available”.",
      });
    } catch {
      toast.error("Couldn't unpublish. Try again.");
    }
  }

  const ctx: EditorContextValue = {
    slug,
    draft,
    update,
    setAt,
    issues,
    locked: !!(published || doc.publishedAt || summary.publishedAt),
    section,
    setSection,
    zone,
    selectZone: (z) => setZone(z),
    themeIndex,
    setThemeIndex,
    openLibrary,
    jumpTo,
    engine,
    layout,
    // phones: flip to the preview pane (the other layouts always show it)
    showPreview: () => setPane("preview"),
  };

  const tabs = layout === "tabs";
  const stack = layout === "stack";
  const side = layout === "side";

  return (
    <EditorContext.Provider value={ctx}>
      <div data-layout={layout} className="flex h-[calc(100dvh-3.5rem)] min-h-[420px] flex-col">
        <EditorHeader
          slug={slug}
          name={draft.name}
          status={summary.status}
          save={{ status: autosave.status, error: autosave.error }}
          onRetry={() => void autosave.retry()}
          onReload={() => void router.invalidate()}
          onOverwrite={() => void autosave.overwrite()}
          onLibrary={() => setLibrary({ open: true, req: null })}
          onPreview={() => void openPreview()}
          onPublish={() => setPublishing(true)}
          onUnpublish={() => setUnpublishing(true)}
          compact={ui.compactHeader}
          tiny={ui.tinyHeader}
          panel={side ? { open: panelOpen, toggle: () => setPanelOpen(!panelOpen) } : null}
        />
        {tabs ? <PaneTabs value={pane} onChange={setPane} issues={issueList.length} /> : null}
        {/*
          One DOM order for every layout (settings, divider, preview) so the preview
          iframe never moves or remounts when the layout changes; CSS does the rest.
        */}
        <div
          ref={body}
          className={cn("relative flex min-h-0 flex-1", side ? "flex-row" : "flex-col-reverse")}
        >
          <div
            id="pane-settings"
            role={tabs ? "tabpanel" : undefined}
            aria-labelledby={tabs ? "pane-tab-settings" : undefined}
            className={cn(
              "min-h-0 min-w-0",
              side && (panelOpen ? "shrink-0" : "hidden"),
              stack && "flex-1",
              tabs && "absolute inset-0",
              tabs && pane !== "settings" && "invisible",
            )}
            style={side ? { width: ui.panelWidth } : undefined}
          >
            <SettingsPanel
              issues={issueList}
              published={published}
              onRename={rename}
              nav={ui.rail ? "rail" : "bar"}
            />
          </div>
          <div className={cn(!stack && "hidden")}>
            <SplitDivider
              fraction={split}
              onChange={setSplit}
              containerRef={body}
              onDragging={setDragging}
            />
          </div>
          <div
            id="pane-preview"
            role={tabs ? "tabpanel" : undefined}
            aria-labelledby={tabs ? "pane-tab-preview" : undefined}
            className={cn(
              "min-h-0 min-w-0",
              side && "flex-1",
              stack && "shrink-0",
              tabs && "absolute inset-0",
              // kept mounted and sized while hidden: the WebGL scene survives the switch
              tabs && pane !== "preview" && "invisible",
              dragging && "pointer-events-none",
            )}
            style={stack ? { height: `${Math.round(split * 100)}%` } : undefined}
          >
            <PreviewPane
              compact={ui.width < 700 || (side && ui.width - ui.panelWidth < 760)}
              engine={engine}
              draft={draft}
              theme={previewTheme}
              onTheme={(id) => {
                setPreviewTheme(id);
                goto({ theme: id });
              }}
              view={previewView}
              onView={(v) => {
                setPreviewView(v);
                goto({ view: v });
              }}
              warnings={warnings}
              onClearWarnings={() => setWarnings([])}
            />
          </div>
        </div>
      </div>

      <AssetLibrary
        open={library.open}
        onOpenChange={(open) => setLibrary((l) => ({ ...l, open }))}
        request={library.req}
      />
      <PublishDialog
        open={publishing}
        onOpenChange={setPublishing}
        slug={slug}
        draft={draft}
        published={published}
        engine={engine}
        flush={autosave.flush}
        onJump={jumpTo}
        onPublished={(d, s) => {
          autosave.markSaved(d.draft, d.updatedAt);
          setDraft(d.draft);
          setPublished(d.published);
          setSummary(s);
          void qc.invalidateQueries({ queryKey: projectsQueryKey });
          void qc.invalidateQueries({ queryKey: assetsQueryKey });
        }}
      />
      <AlertDialog open={unpublishing} onOpenChange={setUnpublishing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish this endcap?</AlertDialogTitle>
            <AlertDialogDescription>
              medialife.ai/x/{slug} stops working for everyone who has it, including client links.
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
    </EditorContext.Provider>
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
      <h1 className="text-lg font-medium">This endcap doesn't exist</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, or its link changed.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/admin/builder">
          <ArrowLeft aria-hidden /> All endcaps
        </Link>
      </Button>
    </div>
  );
}
