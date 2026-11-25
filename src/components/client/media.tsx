/**
 * The client's Media Library files: a thumbnail grid and a viewer dialog with
 * play, download and the team's usage notes.
 */
import { Download, FileText, Image as ImageIcon, Music, Play, X } from "lucide-react";
import { useState } from "react";

import {
  Chip,
  btnGhost,
  btnPrimary,
  bytes,
  card,
  cardHover,
  day,
  duration,
} from "@/components/client/ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ClientMediaItem } from "@/lib/client/content.server";
import { MEDIA_KIND_LABELS, MEDIA_PURPOSE_LABELS } from "@/lib/media/model";
import { cn } from "@/lib/utils";

const KIND_ICON = { video: Play, image: ImageIcon, audio: Music } as const;

export function MediaGrid({ items, tall }: { items: ClientMediaItem[]; tall?: boolean }) {
  const [open, setOpen] = useState<ClientMediaItem | null>(null);
  return (
    <>
      <ul
        className={cn(
          "grid gap-3",
          tall
            ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
            : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
        )}
      >
        {items.map((m) => {
          const Icon = KIND_ICON[m.kind as keyof typeof KIND_ICON] ?? FileText;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpen(m)}
                className={cn(card, cardHover, "block w-full overflow-hidden text-left")}
              >
                <div
                  className="relative aspect-video bg-black"
                  style={m.color ? { backgroundColor: m.color } : undefined}
                >
                  {m.thumbUrl ? (
                    <img
                      src={m.thumbUrl}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 size-full object-cover"
                    />
                  ) : (
                    <span className="absolute inset-0 grid place-items-center text-white/60">
                      <Icon className="size-8" aria-hidden />
                    </span>
                  )}
                  {m.kind === "video" ? (
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid size-10 place-items-center rounded-full bg-black/60 text-white">
                        <Play className="size-4" aria-hidden />
                      </span>
                    </span>
                  ) : null}
                  {m.durationS ? (
                    <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                      {duration(m.durationS)}
                    </span>
                  ) : null}
                </div>
                <div className="p-3">
                  <div className="line-clamp-2 text-sm font-medium">{m.title}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {m.collection || MEDIA_KIND_LABELS[m.kind]} · {bytes(m.size)}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] w-[min(96vw,1000px)] max-w-none overflow-y-auto border-white/10 bg-[#0b0e14] p-0 sm:rounded-2xl [&>button]:hidden">
          {open ? <Viewer item={open} onClose={() => setOpen(null)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Viewer({ item, onClose }: { item: ClientMediaItem; onClose: () => void }) {
  return (
    <div>
      <div className="flex items-center justify-center bg-black sm:rounded-t-2xl">
        {item.kind === "video" ? (
          <video
            src={item.url}
            poster={item.thumbUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-[64dvh] w-full object-contain"
          />
        ) : item.kind === "image" ? (
          <img
            src={item.url}
            alt={item.description || item.title}
            className="max-h-[64dvh] w-full object-contain"
          />
        ) : item.kind === "audio" ? (
          <audio src={item.url} controls className="m-8 w-full max-w-md" />
        ) : item.mime === "application/pdf" ? (
          <iframe src={item.url} title={item.title} className="h-[64dvh] w-full bg-white" />
        ) : (
          <div className="grid h-48 w-full place-items-center text-muted-foreground">
            <FileText className="size-10" aria-hidden />
          </div>
        )}
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold">{item.title}</DialogTitle>
            <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
              {[
                MEDIA_KIND_LABELS[item.kind],
                bytes(item.size),
                item.width && item.height ? `${item.width}×${item.height}` : "",
                day(item.createdAt),
              ]
                .filter(Boolean)
                .join(" · ")}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.collection ? <Chip>{item.collection}</Chip> : null}
          {item.purpose ? <Chip>{MEDIA_PURPOSE_LABELS[item.purpose]}</Chip> : null}
          {item.tags.slice(0, 8).map((t) => (
            <Chip key={t}>#{t}</Chip>
          ))}
        </div>
        {item.description ? (
          <p className="mt-4 text-sm leading-relaxed text-white/80">{item.description}</p>
        ) : null}
        {item.usageNotes ? (
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-3 text-sm">
            <div className="text-xs font-semibold text-amber-300">How to use it</div>
            <p className="mt-1 text-white/80">{item.usageNotes}</p>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={item.downloadUrl} className={btnPrimary}>
            <Download className="size-4" aria-hidden /> Download
          </a>
          {item.kind !== "video" ? (
            <a href={item.url} target="_blank" rel="noreferrer" className={btnGhost}>
              Open in a new tab
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
