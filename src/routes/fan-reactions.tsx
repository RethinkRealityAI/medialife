import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CAPTURES, type Capture, type Where } from "@/lib/fan-captures";
import { Reveal } from "@/components/home/Reveal";
import {
  CARD,
  CtaBand,
  PageHero,
  PillLink,
  SECTION,
  SectionHead,
  Stat,
  TEXT,
} from "@/components/site/kit";

export const Route = createFileRoute("/fan-reactions")({
  head: () => ({
    meta: [
      { title: "Fan Reactions | MEDIALIFE" },
      {
        name: "description",
        content:
          "Real captures from fans' phones: activated posters and merch at Anime NYC and in stores, and Bobo out in the world.",
      },
      { property: "og:title", content: "Fan Reactions | MEDIALIFE" },
      {
        property: "og:description",
        content: "Activated media in the wild, recorded on fans' phones.",
      },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/fan-reactions" }],
  }),
  component: FanReactions,
});

const FILTERS: ("All" | Where)[] = ["All", "Conventions", "Stores", "Out in the world"];

function FanReactions() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState<Capture | null>(null);
  const shown = CAPTURES.filter((c) => filter === "All" || c.where === filter);

  return (
    <>
      <PageHero
        hue="magenta"
        eyebrow="Fan reactions"
        title={
          <>
            For fans. <span className={TEXT.magenta}>By fans.</span>
          </>
        }
        lead="Recorded on fans' own phones, at conventions, in stores and out in the world. These are not renders. Open any clip for the story behind it."
      />

      <section aria-labelledby="wall-title" className={`${SECTION} pb-24`}>
        <h2 id="wall-title" className="sr-only">
          Captures
        </h2>
        <div role="group" aria-label="Show captures from" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                filter === f
                  ? "border-accent bg-accent/15 text-white"
                  : "border-white/15 text-white/75 hover:border-white/30"
              }`}
            >
              {f}
              <span className="ml-2 mono text-[10px] text-muted-foreground">
                {f === "All" ? CAPTURES.length : CAPTURES.filter((c) => c.where === f).length}
              </span>
            </button>
          ))}
        </div>

        <ul className="mt-8 columns-2 gap-3 md:columns-3 lg:columns-4 [&>li]:mb-3">
          {shown.map((c) => (
            <li key={c.poster} className="break-inside-avoid">
              <CaptureTile c={c} onOpen={() => setOpen(c)} />
            </li>
          ))}
        </ul>
        <CaptureDialog c={open} onClose={() => setOpen(null)} />
      </section>

      <section aria-labelledby="share-title" className={`${SECTION} pb-24`}>
        <SectionHead
          id="share-title"
          hue="blue"
          eyebrow="Why it spreads"
          title={
            <>
              Fans film it. <span className={TEXT.blue}>Then they share it.</span>
            </>
          }
          lead="When the poster or the merch comes alive, the phone is already out."
          className="mb-10"
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            value="50%"
            label="of AR experiences shared with others"
            hue="blue"
            note="Anime conventions"
          />
          <Stat value="2+ min" label="average engagement" hue="magenta" note="Anime conventions" />
          <Stat
            value="5.46×"
            label="interactions per NFC sticker"
            hue="blue"
            note="Sakamoto Days"
          />
          <Stat value="0" label="apps to install" hue="magenta" />
        </div>
        <Reveal className={`${CARD} mt-6 grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-12`}>
          <div className="lg:col-span-8">
            <h3 className="display text-[clamp(22px,2vw,30px)]">
              Every Bobo clip lands on <span className={TEXT.blue}>a live globe.</span>
            </h3>
            <p className="mt-2 text-muted-foreground">
              EVADE fans record Bobo wherever they are, and each clip is pinned to the place it was
              filmed.
            </p>
          </div>
          <div className="lg:col-span-4 lg:text-right">
            <PillLink href="/evade/where-is-bobo/">Where is Bobo?</PillLink>
          </div>
        </Reveal>
      </section>

      <CtaBand
        title={
          <>
            Give your fans <span className="text-accent">something to film.</span>
          </>
        }
        lead="Every activation is made to be filmed and shared, and every share brings in the next fan."
      />
    </>
  );
}

/** A capture that plays only while it's on screen (and never with reduced motion). */
function CaptureTile({ c, onOpen }: { c: Capture; onOpen: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (es) => {
        const on = es[0].isIntersecting;
        if (on) setNear(true);
        if (on && !calm) v.play().catch(() => {});
        else v.pause();
      },
      { rootMargin: "120px 0px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <figure className="group relative overflow-hidden rounded-[18px] bg-secondary ring-1 ring-white/10 transition-shadow hover:ring-white/30">
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-label={`${c.alt}. Open the story`}
        className="absolute inset-0 z-10 cursor-pointer rounded-[18px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      />
      {c.src ? (
        <video
          ref={ref}
          src={near ? c.src : undefined}
          poster={c.poster}
          muted
          loop
          playsInline
          preload="none"
          aria-label={c.alt}
          className="block w-full object-cover"
          style={{ aspectRatio: c.ratio }}
        />
      ) : (
        <img
          src={c.poster}
          alt={c.alt}
          loading="lazy"
          className="block w-full object-cover"
          style={{ aspectRatio: c.ratio }}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/75 to-transparent"
      />
      <figcaption className="absolute bottom-3 left-3 right-3 flex flex-col items-start gap-0.5 mono text-[9px] uppercase leading-tight tracking-[0.16em] text-white sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <span>{c.tag}</span>
        <span className="text-white/60">{c.where}</span>
        <span
          aria-hidden
          className="absolute -top-1 right-0 hidden rounded-full bg-white/15 px-2 py-1 text-[8px] backdrop-blur group-hover:block"
        >
          Story +
        </span>
      </figcaption>
    </figure>
  );
}

/** One clip, bigger, with what happened and where to go deeper. Native dialog: Esc and focus come for free. */
function CaptureDialog({ c, onClose }: { c: Capture | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (c && !d.open) d.showModal();
    if (!c && d.open) d.close();
  }, [c]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="capture-title"
      className="m-auto w-[min(920px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-auto rounded-[26px] border border-white/15 bg-[#0b0d12] p-0 text-white backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      {c && (
        <div className="grid gap-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="bg-black">
            {c.src ? (
              <video
                key={c.src}
                src={c.src}
                poster={c.poster}
                muted
                loop
                playsInline
                autoPlay
                controls
                aria-label={c.alt}
                className="block max-h-[70dvh] w-full object-contain sm:max-h-[80dvh]"
              />
            ) : (
              <img
                src={c.poster}
                alt={c.alt}
                className="block max-h-[70dvh] w-full object-contain sm:max-h-[80dvh]"
              />
            )}
          </div>
          <div className="flex flex-col gap-5 p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <p className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {c.tag} · {c.where}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-2 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/15 text-lg hover:bg-white/10"
              >
                ×
              </button>
            </div>
            <h3
              id="capture-title"
              className="text-[clamp(20px,2vw,26px)] font-semibold leading-snug"
            >
              {c.story}
            </h3>
            <dl className="grid gap-2">
              <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  Format
                </dt>
                <dd className="text-right text-sm">{c.format}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-2">
                <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  Filmed on
                </dt>
                <dd className="text-right text-sm">A fan's own phone</dd>
              </div>
            </dl>
            <div className="mt-auto">
              <PillLink href={c.link.href}>{c.link.label}</PillLink>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
