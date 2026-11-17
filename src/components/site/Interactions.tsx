import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import { HEX } from "@/components/site/kit";
import { INTERACTIONS, absoluteUrl, type Interaction, type ShowcaseMap } from "@/lib/interactions";

// Interaction library cards. Full cards (/technology) carry a "Try it now"
// panel: a QR to open it on a phone, plus the picture to point the phone at.
// The rail (homepage) is a compact strip that links into /technology.

/* ── Media Library pick-up (shared by every card on the page, fetched once) ── */

let showcasePromise: Promise<ShowcaseMap> | null = null;
function loadShowcase(): Promise<ShowcaseMap> {
  showcasePromise ??= fetch("/api/showcase.json")
    .then((r) => (r.ok ? r.json() : { clips: {} }))
    .then((d: { clips?: ShowcaseMap }) => d.clips ?? {})
    .catch(() => ({}));
  return showcasePromise;
}

export function useShowcase(): ShowcaseMap {
  const [clips, setClips] = useState<ShowcaseMap>({});
  useEffect(() => {
    let alive = true;
    loadShowcase().then((c) => alive && setClips(c));
    return () => {
      alive = false;
    };
  }, []);
  return clips;
}

/* ── A silent vertical clip that only plays while on screen; falls back on error ── */

function PhoneClip({
  sources,
  poster,
  label,
}: {
  /** Tried in order: a library upload first, then the bundled clip */
  sources: string[];
  poster: string;
  label: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [i, setI] = useState(0);
  const src = sources[i];

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    v.muted = true;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (v.preload !== "auto") v.preload = "auto";
          v.play().catch(() => {});
        } else v.pause();
      },
      { rootMargin: "100px 0px", threshold: 0.2 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  // every source failed (or none): keep the still so the phone never shows black
  if (!src) return <img src={poster} alt={label} className="h-full w-full object-cover" />;
  return (
    <video
      key={src}
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="none"
      poster={poster}
      aria-label={label}
      // a library file this browser can't play (e.g. HEVC) drops back to the bundled clip
      onError={() => setI((n) => n + 1)}
      className="h-full w-full object-cover"
    />
  );
}

/* ── The media panel: the page's real still, with the phone recording on top ── */

function Media({
  it,
  clips,
  tall = false,
}: {
  it: Interaction;
  clips: ShowcaseMap;
  tall?: boolean;
}) {
  const lib = clips[it.slug];
  const sources = [lib?.src, it.clip?.src].filter(Boolean) as string[];
  const poster = (lib ? lib.poster : null) ?? it.clip?.poster ?? it.still;
  const hasClip = sources.length > 0;
  return (
    <div
      className={`relative overflow-hidden rounded-[20px] border border-white/10 bg-black ${tall ? "aspect-[4/3]" : "aspect-[16/10]"}`}
    >
      <img
        src={it.still}
        alt=""
        loading="lazy"
        decoding="async"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity ${hasClip ? "opacity-35" : "opacity-95"}`}
      />
      {hasClip && (
        <div className="absolute right-[7%] top-1/2 aspect-[9/19] h-[88%] -translate-y-1/2 overflow-hidden rounded-[18px] border-[3px] border-white/85 bg-black shadow-[0_24px_50px_rgba(0,0,0,.6)]">
          <PhoneClip sources={sources} poster={poster} label={`${it.name}, recorded on a phone`} />
        </div>
      )}
    </div>
  );
}

function Chip({ children, hue }: { children: React.ReactNode; hue?: string }) {
  return (
    <span className="lg-chip inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 mono text-[9px] uppercase tracking-[0.16em] text-white/85">
      {hue && <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: hue }} />}
      {children}
    </span>
  );
}

/* ── "Try it now": QR + the picture to point at, in a native <dialog> ── */

function TryDialog({
  it,
  hue,
  dialogRef,
  onClosed,
}: {
  it: Interaction;
  hue: string;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onClosed: () => void;
}) {
  const close = useCallback(() => dialogRef.current?.close(), [dialogRef]);
  const url = it.url ? absoluteUrl(it.url) : null;
  return (
    <dialog
      ref={dialogRef}
      onClose={onClosed}
      onClick={(e) => e.target === dialogRef.current && close()}
      aria-labelledby={`try-${it.slug}-title`}
      className="m-auto w-[min(860px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[28px] border border-white/15 bg-[#0b0d12] p-0 text-white backdrop:bg-black/80 backdrop:backdrop-blur-sm"
    >
      <div className="relative p-5 sm:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/15 text-sm hover:border-white/40"
        >
          ✕
        </button>
        <p className="mono text-[10px] uppercase tracking-[0.22em]" style={{ color: hue }}>
          Try it yourself · {it.tech}
        </p>
        <h3 id={`try-${it.slug}-title`} className="mt-2 pr-12 display text-[clamp(24px,3vw,36px)]">
          {it.name}
        </h3>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* 1: open it */}
          <div className="flex flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-medium">
              <span className="mono mr-2 text-[11px]" style={{ color: hue }}>
                01
              </span>
              {url ? "Scan with your phone camera" : "See it at a MEDIALIFE stand"}
            </p>
            {url ? (
              <>
                {/* QR is for a second screen: phones get the button instead */}
                <div className="mx-auto mt-5 hidden rounded-[18px] bg-white p-4 [@media(pointer:fine)]:block">
                  <QRCodeSVG value={url} size={176} level="M" marginSize={0} fgColor="#0b0d12" />
                </div>
                <a
                  href={it.url!}
                  className="btn-pill btn-solid mt-5 justify-center px-6 py-3 text-sm font-medium"
                >
                  Open it on this device <span aria-hidden>→</span>
                </a>
                <p className="mt-3 break-all text-center mono text-[10px] text-white/45">
                  {url.replace("https://", "")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed text-white/70">{it.targetNote}</p>
                <a
                  href="/contact"
                  className="btn-pill btn-solid mt-auto justify-center px-6 py-3 text-sm font-medium"
                >
                  Book a demo <span aria-hidden>→</span>
                </a>
              </>
            )}
          </div>

          {/* 2: what to point at */}
          <div className="flex flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm font-medium">
              <span className="mono mr-2 text-[11px]" style={{ color: hue }}>
                02
              </span>
              {it.target ? "Point it at this picture" : "What it reacts to"}
            </p>
            {it.target ? (
              <>
                <div className="mt-4 grid flex-1 place-items-center rounded-[16px] bg-white p-3">
                  <img
                    src={it.target.src}
                    alt={it.target.alt}
                    loading="lazy"
                    className="max-h-[300px] w-auto object-contain"
                  />
                </div>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  Works on this screen or printed. Real merch works best.
                  {it.target.page && (
                    <>
                      {" "}
                      <a
                        href={it.target.page}
                        className="underline underline-offset-4 hover:text-white"
                      >
                        Printable pictures
                      </a>
                    </>
                  )}
                </p>
              </>
            ) : (
              <div className="mt-4 grid flex-1 place-items-center rounded-[16px] border border-dashed border-white/15 p-6 text-center">
                <p className="max-w-[22ch] text-sm text-white/75">{it.targetNote}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/* ── Full card (/technology) ── */

export function InteractionCard({
  it,
  index,
  clips,
}: {
  it: Interaction;
  index: number;
  clips: ShowcaseMap;
}) {
  const hue = index % 2 ? HEX.magenta : HEX.blue;
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // /technology#try-<slug> opens that card's panel (links from the homepage rail)
  useEffect(() => {
    if (location.hash === `#try-${it.slug}`) {
      document.getElementById(it.slug)?.scrollIntoView({ block: "center" });
      dialogRef.current?.showModal();
      setOpen(true);
    }
  }, [it.slug]);

  return (
    <article
      id={it.slug}
      aria-labelledby={`${it.slug}-title`}
      className="lg-card flex h-full scroll-mt-24 flex-col rounded-[26px] p-3"
    >
      <div className="relative">
        <Media it={it} clips={clips} tall />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Chip hue={hue}>{it.tech}</Chip>
          {it.lab && <Chip>Lab</Chip>}
        </div>
      </div>
      <div className="flex flex-1 flex-col px-2.5 pb-2 pt-4">
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {it.name} · {it.client}
        </p>
        <h3 id={`${it.slug}-title`} className="mt-1.5 display text-[clamp(20px,1.8vw,26px)]">
          {it.verb}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-white/75">{it.line}</p>
        <dl className="mt-4 grid gap-3 text-[13px]">
          <div className="border-t border-white/10 pt-3">
            <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              How it works
            </dt>
            <dd className="mt-1 leading-relaxed text-white/70">{it.how}</dd>
          </div>
          <div className="border-t border-white/10 pt-3">
            <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              For the brand
            </dt>
            <dd className="mt-1 leading-relaxed text-white/90">{it.value}</dd>
          </div>
        </dl>
        <div className="mt-auto pt-5">
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              dialogRef.current?.showModal();
              setOpen(true);
            }}
            className="btn-pill btn-glass w-full justify-center px-5 py-3 text-sm font-medium"
            style={{ borderColor: hue }}
          >
            {it.url ? "Try it now" : "See how to try it"}
            <span aria-hidden className="ml-1 inline-block h-4 w-4">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2zM10 10h1.5M14 10v4h-4" />
              </svg>
            </span>
          </button>
        </div>
      </div>
      <TryDialog
        it={it}
        hue={hue}
        dialogRef={dialogRef}
        onClosed={() => {
          setOpen(false);
          triggerRef.current?.focus();
          if (location.hash === `#try-${it.slug}`)
            history.replaceState(null, "", location.pathname + location.search);
        }}
      />
    </article>
  );
}

export function InteractionGrid() {
  const clips = useShowcase();
  return (
    <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {INTERACTIONS.map((it, i) => (
        <li key={it.slug}>
          <InteractionCard it={it} index={i} clips={clips} />
        </li>
      ))}
    </ul>
  );
}

/* ── Homepage rail: compact, links into /technology where each one can be tried ── */

export function InteractionRail() {
  const clips = useShowcase();
  return (
    <ul className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {INTERACTIONS.map((it, i) => {
        const hue = i % 2 ? HEX.magenta : HEX.blue;
        return (
          <li key={it.slug} className="w-[68%] shrink-0 snap-start sm:w-[300px]">
            <a
              href={`/technology#try-${it.slug}`}
              className="group lg-card flex h-full flex-col rounded-[22px] p-2.5 transition-colors hover:border-white/25"
            >
              <div className="relative">
                <Media it={it} clips={clips} />
                <span className="absolute left-2.5 top-2.5">
                  <Chip hue={hue}>{it.tech}</Chip>
                </span>
              </div>
              <div className="px-1.5 pb-1.5 pt-3">
                <p className="text-[15px] font-medium text-white">{it.verb}</p>
                <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{it.name}</span>
                  <span
                    className="mono text-[9px] uppercase tracking-[0.16em] transition-colors group-hover:text-white"
                    style={{ color: hue }}
                  >
                    {it.url ? "Try it →" : "See it →"}
                  </span>
                </p>
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
