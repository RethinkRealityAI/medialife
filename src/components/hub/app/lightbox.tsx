/**
 * A full-screen viewer for files: the image as large as the screen allows,
 * previous / next (buttons, arrow keys, and a thumbnail strip), and the file's
 * actions (download, delete…) in the header.
 */
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { fileUrl, isImage, shortDate, type HubFile } from "@/lib/hub/model";
import { formatBytes } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

export const LIGHTBOX_CONTENT =
  "flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 bg-background/98 p-0 sm:h-[92vh] sm:w-[94vw] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-border";

export function Lightbox({
  files,
  index,
  onIndexChange,
  open,
  onOpenChange,
  label,
  actions,
}: {
  files: HubFile[];
  index: number;
  onIndexChange: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A small label above the file name, e.g. its category. */
  label?: (f: HubFile) => string | undefined;
  actions?: (f: HubFile) => ReactNode;
}) {
  const f = files[index];
  const many = files.length > 1;
  const go = (d: number) => onIndexChange((index + d + files.length) % files.length);

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!f) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={LIGHTBOX_CONTENT}>
        <div className="flex items-center gap-3 border-b border-border py-3 pr-14 pl-4 sm:pl-5">
          <div className="min-w-0 flex-1">
            {label?.(f) ? <div className="text-xs text-primary">{label(f)}</div> : null}
            <DialogTitle className="truncate text-base font-medium">{f.name}</DialogTitle>
            <DialogDescription className="text-xs tabular-nums">
              {formatBytes(f.size)} · {shortDate(f.createdAt)}
              {f.uploadedBy === "medialife" ? " · from MEDIALIFE" : ""}
              {many ? ` · ${index + 1} of ${files.length}` : ""}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions?.(f)}
            <Button asChild size="sm">
              <a href={fileUrl(f, true)} download={f.name}>
                <Download aria-hidden /> <span className="hidden sm:inline">Download</span>
                <span className="sr-only sm:hidden">Download {f.name}</span>
              </a>
            </Button>
          </div>
        </div>

        <div className="relative grid min-h-0 flex-1 place-items-center bg-[conic-gradient(at_50%_50%,#121218_25%,#17171f_0_50%,#121218_0_75%,#17171f_0)] bg-[length:24px_24px] p-3 sm:p-6">
          {isImage(f.mime) ? (
            <img
              key={f.id}
              src={fileUrl(f)}
              alt={f.name}
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center">
              <FileText className="size-12 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">No preview for this file type.</p>
              <Button asChild variant="outline">
                <a href={fileUrl(f)} target="_blank" rel="noreferrer">
                  Open in a new tab <ExternalLink aria-hidden />
                </a>
              </Button>
            </div>
          )}
          {many ? (
            <>
              <NavButton side="left" onClick={() => go(-1)} />
              <NavButton side="right" onClick={() => go(1)} />
            </>
          ) : null}
        </div>

        {many ? (
          <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 [scrollbar-width:thin]">
            {files.map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => onIndexChange(i)}
                aria-label={`Show ${x.name}`}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "size-14 shrink-0 overflow-hidden rounded-md border-2 transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  i === index
                    ? "border-primary"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                {isImage(x.mime) ? (
                  <img src={fileUrl(x)} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center bg-white/5">
                    <FileText className="size-5 text-muted-foreground" aria-hidden />
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous file" : "Next file"}
      className={cn(
        "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/80 backdrop-blur transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
