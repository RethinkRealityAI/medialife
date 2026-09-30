import { useCallback, useState } from "react";
import { createFileRoute, useBlocker, useNavigate, useRouter } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  Check,
  CloudOff,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Segmented } from "@/components/ar-builder/fields";
import { ProgramShowcaseCard } from "@/components/ar-demos/program-showcase-card";
import { useDemoAutosave, type DemoSaveStatus } from "@/components/ar-demos/use-demo-autosave";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  TOUR_LIMITS,
  changedStops,
  resolveTour,
  sameContent,
  type DemoContent,
  type DemoContentDoc,
  type TourStepOverride,
} from "@/lib/ar/demo-content";
import {
  getDemoContentFn,
  publishDemoContentFn,
  resetDemoDraftFn,
  unpublishDemoContentFn,
} from "@/lib/ar/demo-content.functions";
import { DEMO_IDS, DEMO_TOURS, type DemoId } from "@/lib/ar/demo-tours";
import { cn } from "@/lib/utils";

// /admin/demos: edit the guided tour of the live static demos (/roblox/activated-retail,
// /monkey-quest/activated-retail) without code. The pages keep their own copy as the
// default; this edits overrides per stop (title, text, AR highlight, shown or hidden),
// autosaves a draft, previews it on the real page with ?draft=1, and publishes.

export const Route = createFileRoute("/admin/demos")({
  validateSearch: z.object({ demo: z.enum(DEMO_IDS as [DemoId, ...DemoId[]]).optional() }),
  loaderDeps: ({ search }) => ({ demo: search.demo ?? "roblox" }),
  loader: async ({ deps }) => ({
    demo: deps.demo,
    doc: await getDemoContentFn({ data: { demo: deps.demo } }),
  }),
  gcTime: 0,
  head: () => ({ meta: [{ title: "Live demos · Activated Retail | MEDIALIFE" }] }),
  pendingComponent: DemosSkeleton,
  component: DemosPage,
});

/** 44 px targets on touch screens */
const touch = "pointer-coarse:h-11";

function DemosPage() {
  const { demo, doc } = Route.useLoaderData();
  // a fresh editor per demo and per reload of the stored doc
  return (
    <>
      <ProgramShowcaseCard />
      <DemoEditor key={`${demo}:${doc.updatedAt}`} demo={demo} doc={doc} />
      <Toaster theme="dark" position="bottom-right" closeButton />
    </>
  );
}

function DemoEditor({ demo, doc: initial }: { demo: DemoId; doc: DemoContentDoc }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [doc, setDoc] = useState(initial);
  const [draft, setDraft] = useState<DemoContent>(initial.draft);
  const [confirm, setConfirm] = useState<null | "publish" | "unpublish" | "defaults">(null);
  const [busy, setBusy] = useState(false);
  const autosave = useDemoAutosave({ demo, draft, updatedAt: initial.updatedAt, onSaved: setDoc });

  useBlocker({
    shouldBlockFn: async () => {
      if (await autosave.flush()) return false;
      return !window.confirm("Your latest changes couldn't be saved. Leave anyway?");
    },
    enableBeforeUnload: false,
  });

  const tour = DEMO_TOURS[demo];
  const steps = resolveTour(demo, draft);
  const shown = steps.filter((s) => !s.hidden).length;
  const live = !!doc.published;
  // what the server holds, normalized; compare the saved draft with what's live
  const unpublished = !sameContent(doc.draft, doc.published ?? {});

  const setStep = useCallback((id: string, patch: Partial<TourStepOverride>) => {
    setDraft((d) => {
      const cur = { ...(d.tour?.[id] ?? {}), ...patch };
      for (const k of Object.keys(cur) as (keyof TourStepOverride)[]) {
        if (cur[k] === undefined) delete cur[k];
      }
      const tourNext = { ...(d.tour ?? {}) };
      if (Object.keys(cur).length) tourNext[id] = cur;
      else delete tourNext[id];
      return { ...d, tour: tourNext };
    });
  }, []);

  async function openPreview() {
    // open synchronously (popup blockers), then point it at the saved draft
    const w = window.open("about:blank", "_blank");
    await autosave.flush();
    // index.html spelled out: the dev server redirects the bare folder URL
    const href = `${tour.path}index.html?draft=1&notrack=1`;
    if (w) {
      w.opener = null;
      w.location.href = href;
    } else window.open(href, "_blank", "noopener");
  }

  async function act(kind: "publish" | "unpublish" | "published" | "defaults") {
    setBusy(true);
    try {
      if (kind !== "published" && kind !== "defaults" && !(await autosave.flush())) {
        toast.error("Save your changes first (see the save status).");
        return;
      }
      const next =
        kind === "publish"
          ? await publishDemoContentFn({ data: { demo } })
          : kind === "unpublish"
            ? await unpublishDemoContentFn({ data: { demo } })
            : await resetDemoDraftFn({ data: { demo, to: kind } });
      setDoc(next);
      if (kind === "published" || kind === "defaults") {
        setDraft(next.draft);
        autosave.markSaved(next.draft, next.updatedAt);
      } else autosave.markSaved(draft, next.updatedAt);
      toast.success(
        kind === "publish"
          ? `Published: clients see the new ${tour.label} tour`
          : kind === "unpublish"
            ? `Clients see the ${tour.label} demo's original tour again`
            : kind === "published"
              ? "Draft changes discarded"
              : "Draft reset to the page's own copy",
      );
    } catch {
      toast.error("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:pt-8">
      <div className="mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
        Live demos
      </div>
      <h1 className="mt-2 text-2xl font-medium tracking-tight md:text-3xl">Guided tour</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
        Change the tour clients see in the demos, without a code change. Edits save as a draft;
        preview them on the real page, then publish.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <Segmented
            label="Demo"
            value={demo}
            onChange={async (d) => {
              await autosave.flush();
              void navigate({ to: "/admin/demos", search: { demo: d }, replace: true });
            }}
            options={DEMO_IDS.map((id) => ({ value: id, label: DEMO_TOURS[id].label }))}
          />
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" className={touch} onClick={() => void openPreview()}>
            <Eye aria-hidden /> Preview
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn("pointer-coarse:size-11")}
                aria-label="More actions"
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 pointer-coarse:[&_[role=menuitem]]:py-3"
            >
              <DropdownMenuItem
                disabled={!unpublished || !live}
                onSelect={() => void act("published")}
              >
                Discard draft changes
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!changedStops(draft)}
                onSelect={() => setConfirm("defaults")}
              >
                Reset the draft to the page's copy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!live}
                onSelect={() => setConfirm("unpublish")}
                className="text-destructive focus:text-destructive"
              >
                Unpublish changes…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className={cn("text-white", touch)}
            style={{ background: "var(--gradient-ember-btn)" }}
            disabled={busy || (!unpublished && autosave.status === "saved")}
            onClick={() => setConfirm("publish")}
          >
            <Rocket aria-hidden /> Publish
          </Button>
        </div>
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-white/[0.02] px-3 py-2.5 text-xs"
        role="status"
      >
        {live ? (
          <Pill tone={unpublished ? "watch" : "live"}>
            {unpublished ? "Unpublished changes" : "Published"}
          </Pill>
        ) : (
          <Pill tone={unpublished ? "watch" : "muted"}>
            {unpublished ? "Draft" : "Page's own copy"}
          </Pill>
        )}
        <span className="text-muted-foreground">
          {live && doc.publishedAt
            ? `Live since ${formatDistanceToNow(doc.publishedAt, { addSuffix: true })} · ${changedStops(doc.published)} ${changedStops(doc.published) === 1 ? "stop" : "stops"} changed`
            : "Clients see the tour written into the page."}
        </span>
        <span className="ml-auto">
          <SaveStatus
            status={autosave.status}
            onRetry={() => void autosave.retry()}
            onReload={() => void router.invalidate()}
            onOverwrite={() => void autosave.overwrite()}
          />
        </span>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        {shown} of {steps.length} stops shown · the camera, theme and dashboard for each stop stay
        as built.
      </p>

      <ol className="mt-3 space-y-4">
        {steps.map((s, i) => {
          const o = draft.tour?.[s.id] ?? {};
          const n = steps.slice(0, i + 1).filter((x) => !x.hidden).length;
          return (
            <li key={s.id}>
              <section
                aria-labelledby={`stop-${s.id}`}
                className={cn(
                  "rounded-xl border border-border bg-gradient-to-b from-white/[0.03] to-transparent",
                  s.hidden && "opacity-70",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <p className="mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      {s.hidden ? "Hidden" : `Stop ${n} of ${shown}`}
                    </p>
                    <h2 id={`stop-${s.id}`} className="mt-1 text-sm font-medium">
                      {s.label}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-xs font-medium">
                    {s.hidden ? (
                      <EyeOff className="size-3.5 text-muted-foreground" aria-hidden />
                    ) : null}
                    Show this stop
                    <Switch
                      checked={!s.hidden}
                      // the tour always keeps at least one stop
                      disabled={!s.hidden && shown <= 1}
                      onCheckedChange={(v) => setStep(s.id, { hidden: v ? undefined : true })}
                    />
                  </label>
                </div>
                {!s.hidden ? (
                  <div className="space-y-4 px-4 py-4">
                    <CopyField
                      id={`${s.id}-t`}
                      label="Title"
                      value={o.t ?? s.default.t}
                      fallback={s.default.t}
                      max={TOUR_LIMITS.t}
                      onChange={(v) => setStep(s.id, { t: v })}
                      onReset={() => setStep(s.id, { t: undefined })}
                    />
                    <CopyField
                      id={`${s.id}-b`}
                      label="Text"
                      multiline
                      value={o.b ?? s.default.b}
                      fallback={s.default.b}
                      max={TOUR_LIMITS.b}
                      onChange={(v) => setStep(s.id, { b: v })}
                      onReset={() => setStep(s.id, { b: undefined })}
                    />
                    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">Highlight View in AR</span>
                        <span className="block text-xs text-muted-foreground">
                          Lights up the AR button and adds a View in AR button to the tour card.
                          {s.ar !== s.default.ar ? " Changed from the page's copy." : ""}
                        </span>
                      </span>
                      <Switch
                        checked={s.ar}
                        onCheckedChange={(v) =>
                          setStep(s.id, { ar: v === s.default.ar ? undefined : v })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </section>
            </li>
          );
        })}
      </ol>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "publish"
                ? `Publish the ${tour.label} tour?`
                : confirm === "unpublish"
                  ? `Unpublish the ${tour.label} tour changes?`
                  : "Reset the draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "publish"
                ? "This changes the demo clients see, within a minute."
                : confirm === "unpublish"
                  ? "Clients see the tour written into the page again. Your draft stays here, so you can publish it later."
                  : "Every stop in the draft goes back to the page's own copy. What clients see doesn't change until you publish."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pointer-coarse:[&_:is(button,a)]:h-11">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm === "unpublish"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c) void act(c);
              }}
            >
              {confirm === "publish" ? "Publish" : confirm === "unpublish" ? "Unpublish" : "Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CopyField({
  id,
  label,
  value,
  fallback,
  max,
  multiline,
  onChange,
  onReset,
}: {
  id: string;
  label: string;
  value: string;
  fallback: string;
  max: number;
  multiline?: boolean;
  onChange: (v: string) => void;
  onReset: () => void;
}) {
  const changed = value.trim() !== "" && value.trim() !== fallback;
  const over = value.length > max;
  const common = {
    id,
    value,
    placeholder: fallback,
    "aria-invalid": over,
    "aria-describedby": `${id}-help`,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
    className: cn(
      "bg-background/60 aria-[invalid=true]:border-destructive/70",
      !multiline && touch,
    ),
  };
  return (
    <div>
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
          {changed ? <span className="ml-2 font-normal text-primary">Changed</span> : null}
        </label>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "mono text-[10px] tabular-nums",
              over ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {value.length}/{max}
          </span>
          {changed ? (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1 rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:-my-2 pointer-coarse:p-2"
            >
              <RotateCcw className="size-3" aria-hidden /> Reset
            </button>
          ) : null}
        </span>
      </div>
      {multiline ? (
        <Textarea {...common} rows={4} className={cn(common.className, "resize-y text-sm")} />
      ) : (
        <Input {...common} />
      )}
      <p
        id={`${id}-help`}
        className={cn("mt-1.5 text-xs", over ? "text-destructive" : "text-muted-foreground")}
      >
        {over
          ? `Keep it to ${max} characters.`
          : value.trim() === ""
            ? "Empty: the page's own copy is used."
            : null}
      </p>
    </div>
  );
}

function SaveStatus({
  status,
  onRetry,
  onReload,
  onOverwrite,
}: {
  status: DemoSaveStatus;
  onRetry: () => void;
  onReload: () => void;
  onOverwrite: () => void;
}) {
  const link =
    "rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:px-1 pointer-coarse:py-2.5";
  if (status === "saved")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Check className="size-3.5" aria-hidden /> Draft saved
      </span>
    );
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    );
  if (status === "conflict")
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-amber-300">
        <AlertCircle className="size-3.5" aria-hidden /> Changed in another tab ·
        <button type="button" className={link} onClick={onReload}>
          Load theirs
        </button>
        ·
        <button type="button" className={link} onClick={onOverwrite}>
          Keep mine
        </button>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-amber-300">
      <CloudOff className="size-3.5" aria-hidden />
      {status === "signed-out" ? "Signed out" : "Couldn't save"} ·
      <button type="button" className={link} onClick={onRetry}>
        Retry
      </button>
    </span>
  );
}

function DemosSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pt-8 sm:px-6 lg:px-8" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-44 w-full" />
      ))}
    </div>
  );
}
