import { useState } from "react";
import { Download, FileQuestion, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadUgcFile } from "@/lib/ugc/upload-client";
import {
  UGC_POST_PLATFORM_LABELS,
  aspectHint,
  formatBytes,
  type UgcAspect,
  type UgcSubmissionView,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { formatSeconds } from "./ui";

// A submission's file in the page: <video> streams through the Range-capable
// endpoint (submission.url), images show as they are.

export function SubmissionMedia({
  s,
  className,
  autoPlay,
}: {
  s: Pick<UgcSubmissionView, "id" | "url" | "posterUrl" | "mediaType" | "name" | "aspect">;
  className?: string;
  autoPlay?: boolean;
}) {
  const tall = s.aspect === "9:16" || s.aspect === "4:5";
  const frame = cn(
    "relative mx-auto grid w-full place-items-center overflow-hidden rounded-xl bg-black ring-1 ring-white/[0.08]",
    tall
      ? "aspect-[9/16] max-h-[70vh] w-auto max-w-full"
      : s.aspect === "1:1"
        ? "aspect-square max-h-[70vh] w-auto"
        : "aspect-video",
    className,
  );
  if (!s.url)
    return (
      <div className={frame}>
        {s.posterUrl ? (
          <img
            src={s.posterUrl}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-40"
          />
        ) : null}
        <span className="relative inline-flex items-center gap-2 text-sm text-white/70">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Still uploading
        </span>
      </div>
    );
  if (s.mediaType === "image")
    return (
      <div className={frame}>
        <img src={s.url} alt={s.name} className="size-full object-contain" />
      </div>
    );
  return (
    <div className={frame}>
      <video
        key={s.id}
        src={s.url}
        poster={s.posterUrl ?? undefined}
        controls
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
        className="size-full bg-black object-contain"
        aria-label={s.name}
      />
    </div>
  );
}

/** A small poster frame for lists. */
export function PosterThumb({
  s,
  className,
}: {
  s: Pick<UgcSubmissionView, "posterUrl" | "mediaType" | "url" | "aspect">;
  className?: string;
}) {
  const src = s.posterUrl ?? (s.mediaType === "image" ? s.url : null);
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.1]",
        s.aspect === "16:9" ? "aspect-video w-20" : "aspect-[9/16] w-11",
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <FileQuestion className="size-4 text-white/40" />
      )}
    </span>
  );
}

/** "9:16 · 0:42 · 18 MB · 1080×1920 · TikTok" */
export function mediaFacts(
  s: Pick<
    UgcSubmissionView,
    "aspect" | "durationS" | "size" | "width" | "height" | "platform" | "mediaType"
  >,
) {
  return [
    s.aspect && s.aspect !== "other" ? s.aspect : s.width && s.height ? "Custom ratio" : null,
    s.mediaType === "video" ? formatSeconds(s.durationS) : "Photo",
    formatBytes(s.size),
    s.width && s.height ? `${s.width}×${s.height}` : null,
    s.platform ? UGC_POST_PLATFORM_LABELS[s.platform] : null,
  ].filter(Boolean) as string[];
}

export function AspectWarning({
  actual,
  wanted,
  className,
}: {
  actual: UgcAspect | null;
  wanted: UgcAspect | null | undefined;
  className?: string;
}) {
  const hint = wanted ? aspectHint(actual, wanted) : null;
  if (!hint) return null;
  return <p className={cn("text-xs text-amber-200", className)}>{hint}</p>;
}

/** Download button that pages through big files with Range (downloadUgcFile). */
export function DownloadButton({
  file,
  label = "Download",
  className,
}: {
  file: { downloadUrl: string | null; size: number; mime: string; name: string };
  label?: string;
  className?: string;
}) {
  const [pct, setPct] = useState<number | null>(null);
  if (!file.downloadUrl) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("bg-transparent hover:bg-white/[0.06]", className)}
      disabled={pct !== null}
      aria-label={label ? undefined : `Download ${file.name}`}
      title={label ? undefined : "Download"}
      onClick={async () => {
        setPct(0);
        try {
          await downloadUgcFile(
            { downloadUrl: file.downloadUrl!, size: file.size, mime: file.mime, name: file.name },
            { onProgress: (f: number) => setPct(f) },
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Download failed.");
        } finally {
          setPct(null);
        }
      }}
    >
      {pct !== null ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {pct !== null && label ? `${Math.round(pct * 100)}%` : label || null}
    </Button>
  );
}
