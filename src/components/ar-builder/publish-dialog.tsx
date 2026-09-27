import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Circle, Copy, ExternalLink, Loader2, X } from "lucide-react";
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
import type { Project, ProjectDoc } from "@/lib/ar/project";
import { publishProjectFn } from "@/lib/ar/projects.functions";
import {
  assetUrl,
  describePath,
  projectIssues,
  type Issue,
  type Path,
  type ProjectSummary,
} from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { clientLinkHref, copyText, shareUrl } from "./api";
import { buildAndUploadAR } from "./ar-files";
import type { Engine } from "./use-engine";
import { uploadBlob } from "./upload";

// Publish: check → save → AR files → thumbnail → go live. AR problems don't
// block publishing; the team can go live without AR (or with the previous files).

type StepId = "check" | "save" | "ar" | "thumb" | "publish";
type StepState = "todo" | "doing" | "done" | "skipped" | "failed";
const STEPS: { id: StepId; label: string }[] = [
  { id: "check", label: "Check everything is filled in" },
  { id: "save", label: "Save the latest changes" },
  { id: "ar", label: "Make the AR files" },
  { id: "thumb", label: "Take a thumbnail" },
  { id: "publish", label: "Publish" },
];

type Phase =
  | { kind: "running" }
  | { kind: "invalid"; issues: Issue[] }
  | { kind: "ar-failed"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "done"; url: string };

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

export function PublishDialog({
  open,
  onOpenChange,
  slug,
  draft,
  published,
  engine,
  flush,
  onJump,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  draft: Project;
  published: Project | null;
  engine: Engine;
  flush: () => Promise<boolean>;
  onJump: (path: Path) => void;
  onPublished: (doc: ProjectDoc, summary: ProjectSummary) => void;
}) {
  const [steps, setSteps] = useState<Record<StepId, StepState>>(() => initial());
  const [detail, setDetail] = useState<string>("");
  const [phase, setPhase] = useState<Phase>({ kind: "running" });
  const run = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const arAbort = useRef<AbortController | null>(null);

  function initial(): Record<StepId, StepState> {
    return { check: "todo", save: "todo", ar: "todo", thumb: "todo", publish: "todo" };
  }
  const mark = (id: StepId, s: StepState) => setSteps((x) => ({ ...x, [id]: s }));

  async function start(from: "check" | "after-ar", arChoice?: "keep" | "none") {
    const me = ++run.current;
    const alive = () => run.current === me;
    setPhase({ kind: "running" });
    setDetail("");
    let ar:
      | { mode: "new"; glb: string; usdz: string; generatedAt: number }
      | { mode: "keep" }
      | { mode: "none" } = {
      mode: arChoice ?? "keep",
    };

    if (from === "check") {
      setSteps(initial());
      mark("check", "doing");
      const issues = projectIssues(draftRef.current);
      if (issues.length) {
        mark("check", "failed");
        setPhase({ kind: "invalid", issues });
        return;
      }
      mark("check", "done");

      mark("save", "doing");
      if (!(await flush())) {
        if (!alive()) return;
        mark("save", "failed");
        setPhase({
          kind: "failed",
          message: "The latest changes couldn't be saved. Check the save status and try again.",
        });
        return;
      }
      if (!alive()) return;
      mark("save", "done");

      mark("ar", "doing");
      arAbort.current = new AbortController();
      try {
        const files = await buildAndUploadAR(
          engine,
          draftRef.current,
          (label, f) => setDetail(f === undefined ? label : `${label} · ${Math.round(f * 100)}%`),
          arAbort.current.signal,
        );
        if (!alive()) return;
        ar = { mode: "new", ...files };
        mark("ar", "done");
      } catch (e) {
        if (!alive()) return;
        mark("ar", "failed");
        setDetail("");
        setPhase({
          kind: "ar-failed",
          message: e instanceof Error ? e.message : "Unknown problem",
        });
        return;
      }
    } else {
      mark("ar", "skipped");
    }

    mark("thumb", "doing");
    setDetail("");
    let thumb: string | null = null;
    try {
      const blob = await dataUrlToBlob(await engine.thumb(640));
      const t = await uploadBlob(blob, {
        name: `${slug}-thumb.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`,
        kind: "image",
        mime: blob.type || "image/jpeg",
        tags: ["thumb"],
      });
      thumb = assetUrl(t.id);
      mark("thumb", "done");
    } catch {
      mark("thumb", "skipped"); // the list shows a placeholder instead
    }
    if (!alive()) return;

    mark("publish", "doing");
    try {
      const r = await publishProjectFn({ data: { slug, ar, thumb } });
      if (!alive()) return;
      if (!r.ok) {
        mark("publish", "failed");
        if (r.error === "invalid" && r.issues?.length)
          setPhase({ kind: "invalid", issues: r.issues });
        else
          setPhase({
            kind: "failed",
            message:
              r.error === "not-found"
                ? "This endcap was deleted."
                : "The server refused the publish.",
          });
        return;
      }
      mark("publish", "done");
      onPublished(r.doc, r.summary);
      setPhase({ kind: "done", url: shareUrl(slug) });
    } catch (e) {
      if (!alive()) return;
      mark("publish", "failed");
      setPhase({
        kind: "failed",
        message:
          e instanceof Error && e.message !== "unauthorized"
            ? e.message
            : "Your session ended. Sign in again in another tab, then retry.",
      });
    }
  }

  useEffect(() => {
    if (open) void start("check");
    else run.current++;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const busy = phase.kind === "running";
  const hadAR = !!(published?.ar?.glb || draft.ar?.glb);
  /** Stop waiting for the AR files and publish with the previous ones (or none). */
  const skipAR = () => {
    arAbort.current?.abort();
    void start("after-ar", hadAR ? "keep" : "none");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!busy || !o ? onOpenChange(o) : undefined)}>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-1rem)] max-w-md gap-5 overflow-y-auto",
          busy && "[&>button:last-child]:hidden",
        )}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onInteractOutside={(e) => busy && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {phase.kind === "done"
              ? "Your endcap is live"
              : phase.kind === "invalid"
                ? "A few things to fix"
                : "Publishing"}
          </DialogTitle>
          <DialogDescription>
            {phase.kind === "done"
              ? "Anyone with the link can open it."
              : phase.kind === "invalid"
                ? "Fix these, then publish again."
                : "This takes a few seconds. Keep this tab open."}
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "invalid" ? (
          <ul className="max-h-72 space-y-1 overflow-auto" aria-label="Things to fix">
            {phase.issues.slice(0, 30).map((i, n) => (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => {
                    onOpenChange(false);
                    onJump(i.path);
                  }}
                  className="group flex w-full items-start gap-3 rounded-md px-2 py-2 text-left hover:bg-white/[0.04] focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-muted-foreground">
                      {describePath(i.path, draft)}
                    </span>
                    <span className="block text-sm">{i.message}</span>
                  </span>
                  <span className="shrink-0 text-xs text-primary group-hover:underline">Fix</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ol className="space-y-2.5" aria-live="polite">
            {STEPS.map((s) => {
              const st = steps[s.id];
              return (
                <li key={s.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                    {st === "doing" ? (
                      <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                    ) : st === "done" ? (
                      <Check className="size-4 text-emerald-400" aria-hidden />
                    ) : st === "failed" ? (
                      <X className="size-4 text-destructive" aria-hidden />
                    ) : st === "skipped" ? (
                      <Circle className="size-3 text-muted-foreground" aria-hidden />
                    ) : (
                      <Circle className="size-3 text-border" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        st === "todo" && "text-muted-foreground",
                        st === "skipped" && "text-muted-foreground line-through",
                      )}
                    >
                      {s.label}
                    </span>
                    {st === "doing" && detail ? (
                      <span className="block text-xs text-muted-foreground">{detail}</span>
                    ) : null}
                    <span className="sr-only"> — {st}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {phase.kind === "ar-failed" ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-400/[0.06] p-3 text-sm">
            <p className="font-medium">The AR files couldn't be made</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{phase.message}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {hadAR
                ? "You can publish and keep the previous AR files, which may not match your latest changes."
                : "You can publish without AR; the “View in AR” button stays hidden until the next publish."}
            </p>
          </div>
        ) : null}
        {phase.kind === "failed" ? (
          <p
            className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
            role="alert"
          >
            {phase.message}
          </p>
        ) : null}
        {phase.kind === "done" ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 p-1.5 pl-3">
            <span className="mono min-w-0 flex-1 truncate text-xs">
              {phase.url.replace(/^https?:\/\//, "")}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (await copyText(phase.url)) toast.success("Link copied");
              }}
            >
              <Copy aria-hidden /> Copy
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={phase.url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden /> Open
              </a>
            </Button>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0 pointer-coarse:[&_:is(button,a)]:h-11">
          {phase.kind === "ar-failed" ? (
            <>
              <Button variant="ghost" onClick={() => start("check")}>
                Try again
              </Button>
              <Button onClick={() => start("after-ar", hadAR ? "keep" : "none")}>
                {hadAR ? "Publish, keep previous AR" : "Publish without AR"}
              </Button>
            </>
          ) : phase.kind === "failed" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => start("check")}>Try again</Button>
            </>
          ) : phase.kind === "done" ? (
            <>
              <Button variant="ghost" asChild>
                <a href={clientLinkHref(slug)}>Make a client link</a>
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : phase.kind === "invalid" ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              {steps.ar === "doing" ? (
                <Button variant="ghost" onClick={skipAR}>
                  {hadAR ? "Keep the previous AR files" : "Skip AR for now"}
                </Button>
              ) : null}
              <Button disabled>
                <Loader2 className="animate-spin" aria-hidden /> Publishing…
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
