/**
 * Media pieces for the UGC Hub (creator app and admin review): a poster tile
 * that frames any aspect ratio over a soft blurred copy of itself, an inline
 * video player that streams through the Range-capable file endpoints, and a
 * dialog that plays a submission or brief asset full size.
 */
import { useState, type ReactNode } from "react";
import { Film, ImageIcon, Play } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { formatDuration } from "./format";

/** A poster frame: the picture contained, over a blurred copy that fills the frame. */
export function PosterTile({
  posterUrl,
  mediaType = "video",
  durationS,
  label,
  className,
  children,
  playable,
}: {
  posterUrl: string | null;
  mediaType?: "video" | "image";
  durationS?: number | null;
  /** A small corner label, e.g. the aspect ratio. */
  label?: ReactNode;
  className?: string;
  children?: ReactNode;
  /** Show the round play mark in the middle. */
  playable?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const dur = formatDuration(durationS);
  const show = posterUrl && !broken;
  return (
    <span
      className={cn(
        "relative isolate block overflow-hidden rounded-2xl bg-[#071014] ring-1 ring-white/10 ring-inset",
        className,
      )}
    >
      {show ? (
        <>
          <img
            src={posterUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 size-full scale-125 object-cover opacity-50 blur-xl"
          />
          <img
            src={posterUrl}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
            className="absolute inset-0 size-full object-contain"
          />
        </>
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_30%_20%,rgb(63_230_224/0.18),transparent_60%),radial-gradient(ellipse_at_80%_90%,rgb(255_55_174/0.14),transparent_60%)]">
          {mediaType === "image" ? (
            <ImageIcon className="size-7 text-white/45" aria-hidden />
          ) : (
            <Film className="size-7 text-white/45" aria-hidden />
          )}
        </span>
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent"
      />
      {playable ? (
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/30 backdrop-blur-md transition-transform group-hover:scale-110 motion-reduce:transition-none"
        >
          <Play className="ml-0.5 size-4.5 fill-current" />
        </span>
      ) : null}
      {dur ? (
        <span className="absolute right-2 bottom-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] text-white tabular-nums backdrop-blur">
          {dur}
        </span>
      ) : null}
      {label ? (
        <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10.5px] text-white backdrop-blur">
          {label}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** An inline player. Streams with Range; never autoplays. */
export function VideoPlayer({
  src,
  poster,
  title,
  className,
  width,
  height,
}: {
  src: string;
  poster?: string | null;
  title: string;
  className?: string;
  width?: number | null;
  height?: number | null;
}) {
  const ratio = width && height ? `${width} / ${height}` : undefined;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ring-inset",
        className,
      )}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      <video
        src={poster || src.includes("#") ? src : `${src}#t=0.1`}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        aria-label={title}
        className="size-full object-contain"
      />
    </div>
  );
}

/** Full-size viewer for one video or image, with actions in the header. */
export function MediaDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  src,
  poster,
  kind,
  width,
  height,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: ReactNode;
  src: string;
  poster?: string | null;
  kind: "video" | "image";
  width?: number | null;
  height?: number | null;
  actions?: ReactNode;
}) {
  const portrait = width && height ? height > width : kind === "video";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 bg-[#05080a]/98 p-0 sm:max-h-[92vh] sm:w-auto sm:max-w-[min(94vw,64rem)] sm:rounded-3xl sm:border sm:border-white/10">
        <div className="flex items-center gap-3 border-b border-white/10 py-3 pr-14 pl-4 sm:pl-5">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base font-medium">{title}</DialogTitle>
            <DialogDescription className="truncate text-xs text-muted-foreground tabular-nums">
              {subtitle ?? (kind === "video" ? "Video" : "Image")}
            </DialogDescription>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
        <div className="grid min-h-0 flex-1 place-items-center bg-black p-2 sm:p-4">
          {kind === "video" ? (
            <video
              key={src}
              src={src}
              poster={poster ?? undefined}
              controls
              playsInline
              preload="metadata"
              aria-label={title}
              className={cn(
                "max-h-[calc(100dvh-5rem)] max-w-full rounded-xl sm:max-h-[calc(92vh-6rem)]",
                portrait ? "h-[calc(100dvh-5rem)] sm:h-[calc(92vh-6rem)]" : "w-full",
              )}
            />
          ) : (
            <img
              key={src}
              src={src}
              alt={title}
              className="max-h-[calc(100dvh-5rem)] max-w-full rounded-xl object-contain sm:max-h-[calc(92vh-6rem)]"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
