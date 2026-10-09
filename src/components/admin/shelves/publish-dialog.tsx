import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Circle, ExternalLink, Link2, Loader2, Minus, X } from "lucide-react";
import { toast } from "sonner";

import { uploadBlob } from "@/components/ar-builder/upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { publishShelfFn } from "@/lib/shelf/shelves.functions";
import { shelfDemoId, shelfPath, type ShelfDoc, type ShelfSummary } from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

import type { ShelfPreview } from "./use-shelf-preview";
import { absoluteUrl, copyText } from "./shared";

// Publish: save → snapshot the hero view (1200×630, the og:image every email,
// Discord and iMessage preview shows) → upload it → go live. A snapshot that
// fails doesn't stop the publish: the link preview falls back to the site card.

type StepId = "save" | "snapshot" | "upload" | "publish";
type StepState = "todo" | "doing" | "done" | "skipped" | "error";

const STEPS: { id: StepId; label: string }[] = [
  { id: "save", label: "Save the draft" },
  { id: "snapshot", label: "Take the link-preview image" },
  { id: "upload", label: "Upload it" },
  { id: "publish", label: "Put it live" },
];

const initial = (): Record<StepId, StepState> => ({
  save: "todo",
  snapshot: "todo",
  upload: "todo",
  publish: "todo",
});

export function PublishShelfDialog({
  open,
  onOpenChange,
  slug,
  canPublish,
  preview,
  flush,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  slug: string;
  /** null when it can, otherwise why not */
  canPublish: string | null;
  preview: ShelfPreview;
  flush: () => Promise<boolean>;
  onPublished: (doc: ShelfDoc, summary: ShelfSummary) => void;
}) {
  const [steps, setSteps] = useState(initial);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ snapshot: string | null; noImage: boolean } | null>(null);
  const url = absoluteUrl(shelfPath(slug));

  useEffect(() => {
    if (!open) return;
    setSteps(initial());
    setError(null);
    setDone(null);
  }, [open]);

  const mark = (id: StepId, s: StepState) => setSteps((x) => ({ ...x, [id]: s }));

  async function run() {
    setRunning(true);
    setError(null);
    setSteps(initial());
    try {
      mark("save", "doing");
      if (!(await flush())) {
        mark("save", "error");
        throw new Error("Your latest changes couldn't be saved. Check the save status.");
      }
      mark("save", "done");

      mark("snapshot", "doing");
      const dataUrl = await preview.snapshot(1200, 630);
      let snapshotAssetId: string | null = null;
      if (!dataUrl) {
        mark("snapshot", "skipped");
        mark("upload", "skipped");
      } else {
        mark("snapshot", "done");
        mark("upload", "doing");
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const ext =
            blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
          const a = await uploadBlob(blob, {
            name: `shelf-${slug}-preview.${ext}`,
            kind: "image",
            mime: blob.type || "image/png",
            // generated: stays out of the library grid, released when replaced
            tags: ["thumb"],
            width: 1200,
            height: 630,
          });
          snapshotAssetId = a.id;
          mark("upload", "done");
        } catch {
          mark("upload", "skipped");
        }
      }

      mark("publish", "doing");
      const r = await publishShelfFn({ data: { slug, snapshotAssetId } });
      if (!r.ok) {
        mark("publish", "error");
        throw new Error(
          r.message ??
            (r.error === "not-found"
              ? "This shelf was deleted."
              : "The draft has a problem. Fix the highlighted fields."),
        );
      }
      mark("publish", "done");
      onPublished(r.doc, r.summary);
      setDone({
        snapshot: r.summary.snapshot,
        noImage: !snapshotAssetId && !r.summary.snapshot,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't publish. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{done ? "Your shelf is live" : "Publish this shelf"}</DialogTitle>
          <DialogDescription>
            {done
              ? "Send the link as it is, or make a personal link so you can see when they open it."
              : "Puts the draft live at its link and takes the image link previews show."}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            {done.snapshot ? (
              <div className="overflow-hidden rounded-lg border border-border">
                <img
                  src={done.snapshot}
                  alt="Link preview"
                  className="aspect-[1200/630] w-full object-cover"
                />
              </div>
            ) : null}
            {done.noImage ? (
              <p className="rounded-md border border-amber-400/30 bg-amber-400/[0.06] p-2.5 text-xs leading-relaxed text-amber-200">
                The preview didn't send an image, so link previews show the MEDIALIFE card. Publish
                again once the preview has loaded to add one.
              </p>
            ) : null}
            <div className="flex gap-2">
              <Input
                readOnly
                value={url}
                className="mono text-xs"
                onFocus={(e) => e.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (await copyText(url)) toast.success("Link copied");
                }}
              >
                Copy
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={`${shelfPath(slug)}?notrack=1`} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden /> Open
                </a>
              </Button>
              <Button asChild size="sm">
                <Link to="/admin/links" search={{ demo: shelfDemoId(slug) }}>
                  <Link2 aria-hidden /> Create personal link
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {canPublish ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm"
                role="alert"
              >
                {canPublish}
              </p>
            ) : null}
            <ol className="space-y-2">
              {STEPS.map((s) => (
                <li key={s.id} className="flex items-center gap-2.5 text-sm">
                  <StepIcon state={steps[s.id]} />
                  <span
                    className={cn(
                      steps[s.id] === "todo" && "text-muted-foreground",
                      steps[s.id] === "skipped" && "text-muted-foreground line-through",
                    )}
                  >
                    {s.label}
                  </span>
                  {steps[s.id] === "skipped" ? (
                    <span className="text-xs text-muted-foreground">skipped</span>
                  ) : null}
                </li>
              ))}
            </ol>
            {error ? (
              <p
                className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm"
                role="alert"
              >
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 pointer-coarse:[&_:is(button,a)]:h-11">
          {done ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={running}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="button" disabled={running || !!canPublish} onClick={() => void run()}>
                {running ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {running ? "Publishing…" : "Publish"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepIcon({ state }: { state: StepState }) {
  const cls = "size-4 shrink-0";
  if (state === "doing")
    return <Loader2 className={cn(cls, "animate-spin text-primary")} aria-hidden />;
  if (state === "done") return <Check className={cn(cls, "text-emerald-400")} aria-hidden />;
  if (state === "skipped")
    return <Minus className={cn(cls, "text-muted-foreground")} aria-hidden />;
  if (state === "error") return <X className={cn(cls, "text-destructive")} aria-hidden />;
  return <Circle className={cn(cls, "text-muted-foreground/50")} aria-hidden />;
}
