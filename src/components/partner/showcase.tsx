/**
 * MEDIALIFE's proof in the Partner Hub: real activations on video, sorted by
 * type, and five GIFs ready for email. Hosted clips preview on hover and can
 * be downloaded; YouTube pieces play from YouTube and share as links.
 */
import { useRef, useState } from "react";
import { Download, ExternalLink, Play, Volume2 } from "lucide-react";

import { CopyButton } from "@/components/hub/app/ui";
import { Surface, Tag, lift, surface, type TileTone } from "@/components/partner/ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  MEDIALIFE_GIFS,
  MEDIALIFE_VIDEOS,
  PORTFOLIO_URL,
  PROOF_STATS,
  VIDEO_CATEGORIES,
  gifEmailHtml,
  videoShareUrl,
  youtubeUrl,
  type KitVideo,
  type VideoCategory,
} from "@/lib/hub/showcase";
import { cn } from "@/lib/utils";

const CAT_TONE: Record<VideoCategory, TileTone> = {
  standee: "violet",
  product: "ice",
  fans: "amber",
  creators: "mint",
};

export function VideosPanel({
  origin,
  hidden = new Set(),
}: {
  origin: string;
  /** Built-in videos the MEDIALIFE team has hidden for this partner. */
  hidden?: Set<string>;
}) {
  const videos = MEDIALIFE_VIDEOS.filter((v) => !hidden.has(v.id));
  const [cat, setCat] = useState<VideoCategory | "all">("all");
  const [open, setOpen] = useState<KitVideo | null>(null);
  const featured = videos[0];
  const shown = videos.filter((v) => cat === "all" || v.category === cat);
  const cats = Object.keys(VIDEO_CATEGORIES) as VideoCategory[];

  return (
    <>
      {/* The opener: the award-winning recap, with the numbers beside it. */}
      <div className="grid gap-4 @3xl/inset:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {featured ? (
          <button
            type="button"
            onClick={() => setOpen(featured)}
            className={cn(
              surface,
              lift,
              "group relative isolate flex min-h-64 items-end overflow-hidden text-left",
            )}
          >
            <img
              src={featured.poster}
              alt=""
              className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
            <span className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <PlayBadge className="absolute top-4 right-4 size-14" />
            <span className="block p-5">
              <Tag tone="amber">Start here · {featured.duration}</Tag>
              <span className="mt-2 block text-xl font-semibold tracking-tight text-balance">
                {featured.title}
              </span>
              <span className="mt-1 line-clamp-2 block text-sm text-white/75">{featured.what}</span>
            </span>
          </button>
        ) : null}

        <Surface accent className="flex flex-col p-5">
          <div className="text-[11px] font-semibold tracking-[0.18em] text-[var(--partner)] uppercase">
            Proven at live events and retail
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3">
            {PROOF_STATS.map((s) => (
              <li key={s.l} className="rounded-xl bg-white/[0.04] p-3">
                <div className="bg-gradient-to-r from-white to-[var(--partner)] bg-clip-text text-2xl font-semibold tracking-tight text-transparent tabular-nums">
                  {s.v}
                </div>
                <div className="text-xs text-muted-foreground">{s.l}</div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Real campaigns for Netflix, DC and others. Share them freely with creators; please don't
            edit or re-brand them.
          </p>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Button asChild variant="outline" size="sm">
              <a href={PORTFOLIO_URL} target="_blank" rel="noopener">
                <ExternalLink aria-hidden /> Full portfolio
              </a>
            </Button>
            <CopyButton
              value={PORTFOLIO_URL}
              label="Copy portfolio link"
              size="sm"
              variant="ghost"
            />
          </div>
        </Surface>
      </div>

      <div role="group" aria-label="Filter videos" className="mt-6 flex flex-wrap gap-1.5">
        {(["all", ...cats] as const).map((c) => {
          const n = videos.filter((v) => c === "all" || v.category === c).length;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
                cat === c
                  ? "border-[var(--partner)]/60 bg-[var(--partner)]/15 text-foreground"
                  : "border-white/[0.08] text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "all" ? "All videos" : VIDEO_CATEGORIES[c].title}
              <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>
      {cat !== "all" ? (
        <p className="mt-3 text-sm text-muted-foreground">{VIDEO_CATEGORIES[cat].blurb}</p>
      ) : null}

      <ul className="mt-4 grid grid-cols-2 gap-3 @2xl/inset:grid-cols-3 @4xl/inset:grid-cols-4 @6xl/inset:grid-cols-5">
        {shown.map((v) => (
          <VideoCard key={v.id} video={v} onOpen={() => setOpen(v)} />
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-3xl gap-0 overflow-y-auto p-0">
          {open ? (
            <div className="grid sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
              <div className="grid place-items-center bg-black">
                {open.youtube ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${open.youtube}?autoplay=1&rel=0&playsinline=1`}
                    title={open.title}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowFullScreen
                    className="aspect-[9/16] h-[min(78dvh,640px)] max-w-full"
                  />
                ) : (
                  <video
                    src={open.src}
                    poster={open.poster}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[min(78dvh,640px)] w-auto max-w-full"
                  />
                )}
              </div>
              <div className="flex flex-col p-5">
                <div className="flex flex-wrap gap-1.5 pr-8">
                  <Tag tone={CAT_TONE[open.category]}>{VIDEO_CATEGORIES[open.category].title}</Tag>
                  <Tag tone="blue">{open.tag}</Tag>
                </div>
                <DialogTitle className="mt-3 text-lg leading-snug">{open.title}</DialogTitle>
                <DialogDescription className="mt-1">{open.what}</DialogDescription>
                {open.sound ? (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Volume2 className="size-3.5" aria-hidden /> Best with sound on
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  {open.src ? (
                    <Button asChild size="sm">
                      <a href={open.src} download>
                        <Download aria-hidden /> Download
                      </a>
                    </Button>
                  ) : (
                    <Button asChild size="sm">
                      <a href={youtubeUrl(open.youtube!)} target="_blank" rel="noopener">
                        <ExternalLink aria-hidden /> Open on YouTube
                      </a>
                    </Button>
                  )}
                  <CopyButton
                    value={videoShareUrl(open, origin)}
                    label="Copy link"
                    size="sm"
                    variant="outline"
                    toastText="Video link copied"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function PlayBadge({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/30 backdrop-blur-md transition-transform group-hover:scale-110 motion-reduce:transition-none",
        className,
      )}
    >
      <Play className="ml-0.5 size-[40%] fill-current" />
    </span>
  );
}

function VideoCard({ video: v, onOpen }: { video: KitVideo; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Hosted clips play silently on hover, so the grid feels alive.
  const preview = (on: boolean) => {
    const el = ref.current;
    if (!el) return;
    if (on) void el.play().catch(() => {});
    else {
      el.pause();
      el.currentTime = 0;
    }
  };
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => preview(true)}
        onMouseLeave={() => preview(false)}
        onFocus={() => preview(true)}
        onBlur={() => preview(false)}
        className={cn(surface, lift, "group block w-full overflow-hidden text-left")}
        aria-label={`Play ${v.title}`}
      >
        <span className="relative block aspect-[9/14] overflow-hidden bg-black">
          <img
            src={v.poster}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
          {v.src ? (
            <video
              ref={ref}
              src={v.src}
              muted
              loop
              playsInline
              preload="none"
              className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          ) : null}
          <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
          <span className="absolute top-2 left-2">
            <Tag
              tone={CAT_TONE[v.category]}
              className="h-5 bg-black/50 px-2 text-[10px] backdrop-blur"
            >
              {v.tag}
            </Tag>
          </span>
          <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tabular-nums backdrop-blur">
            {v.youtube ? "YouTube" : v.duration}
          </span>
          <PlayBadge className="absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 opacity-90 group-hover:opacity-0" />
          <span className="absolute inset-x-0 bottom-0 p-3">
            <span className="line-clamp-2 block text-sm leading-snug font-medium">{v.title}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

export function GifsPanel({
  origin,
  link,
  hidden = new Set(),
}: {
  origin: string;
  link: string;
  hidden?: Set<string>;
}) {
  return (
    <>
      <Surface className="mb-4 grid gap-3 p-4 text-sm @3xl/inset:grid-cols-3">
        <p>
          <span className="font-medium text-[var(--partner)]">Gmail or Outlook: </span>
          <span className="text-muted-foreground">
            download a GIF and drag it into your message, then link it to your program page.
          </span>
        </p>
        <p>
          <span className="font-medium text-[var(--partner)]">Email tools: </span>
          <span className="text-muted-foreground">
            “Copy for email” gives HTML with the GIF already linked to your program page.
          </span>
        </p>
        <p>
          <span className="font-medium text-[var(--partner)]">Discord and DMs: </span>
          <span className="text-muted-foreground">drop the GIF in; it plays inline.</span>
        </p>
      </Surface>
      <ul className="grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @5xl/inset:grid-cols-5">
        {MEDIALIFE_GIFS.filter((g) => !hidden.has(g.id)).map((g) => (
          <li key={g.id} className={cn(surface, "flex flex-col overflow-hidden")}>
            <span className="relative block aspect-[9/16] overflow-hidden bg-black">
              <img src={g.src} alt={g.alt} loading="lazy" className="size-full object-cover" />
              <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
                GIF · {g.size}
              </span>
            </span>
            <div className="flex flex-1 flex-col p-3">
              <span className="text-sm font-medium">{g.title}</span>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                <Button asChild size="sm">
                  <a href={g.src} download aria-label={`Download ${g.title}`}>
                    <Download aria-hidden /> GIF
                  </a>
                </Button>
                <CopyButton
                  value={gifEmailHtml(g, origin, link)}
                  label="Copy for email"
                  size="sm"
                  variant="outline"
                  toastText="Email HTML copied, linked to your program page"
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
