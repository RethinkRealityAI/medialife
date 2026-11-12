import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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

type Where = "Conventions" | "Stores" | "Out in the world";
type Capture = {
  src?: string;
  poster: string;
  alt: string;
  where: Where;
  tag: string;
  ratio: string;
};

const F = "/fan-reactions";
const V = "/evade/creators/assets/video";

// Real captures only. Clips that show partners not yet approved for public use
// are left out on purpose.
const CAPTURES: Capture[] = [
  {
    src: `${F}/anime-nyc-tee.mp4`,
    poster: `${F}/anime-nyc-tee.webp`,
    alt: "Logan Chitwood showing the Yujiro × Animebae activated tee at Anime NYC",
    where: "Conventions",
    tag: "Anime NYC",
    ratio: "480 / 822",
  },
  {
    src: `${V}/bobo-golden-gate.mp4`,
    poster: `${V}/bobo-golden-gate.webp`,
    alt: "Bobo in AR at the Golden Gate Bridge",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
  },
  {
    src: `${F}/sakamoto-poster.mp4`,
    poster: `${F}/sakamoto-poster.webp`,
    alt: "The Sakamoto Days activated poster coming alive in a comic store",
    where: "Stores",
    tag: "Sakamoto Days",
    ratio: "480 / 822",
  },
  {
    src: `${F}/sakamoto-facade.mp4`,
    poster: `${F}/sakamoto-facade.webp`,
    alt: "A Sakamoto Days tag painting itself across a storefront, seen through a phone",
    where: "Out in the world",
    tag: "Sakamoto Days",
    ratio: "480 / 936",
  },
  {
    poster: `${F}/sakamoto-javits.webp`,
    alt: "Cosplayers with a life-sized AR Mr. Sakamoto at the Javits Center",
    where: "Conventions",
    tag: "Anime NYC",
    ratio: "600 / 1036",
  },
  {
    src: `${V}/bobo-meetup.mp4`,
    poster: `${V}/bobo-meetup.webp`,
    alt: "Bobo in AR meeting a mascot outside an event",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
  },
  {
    src: `${F}/figure-shelf.mp4`,
    poster: `${F}/figure-shelf.webp`,
    alt: "An AR figure placed on a collector's shelf next to real figures",
    where: "Stores",
    tag: "Activated collectible",
    ratio: "480 / 816",
  },
  {
    src: `${F}/sakamoto-street.mp4`,
    poster: `${F}/sakamoto-street.webp`,
    alt: "A life-sized AR Mr. Sakamoto on the street outside a venue",
    where: "Out in the world",
    tag: "Sakamoto Days",
    ratio: "480 / 816",
  },
  {
    src: `${V}/bobo-exhibit.mp4`,
    poster: `${V}/bobo-exhibit.webp`,
    alt: "Bobo in AR running and flipping by an outdoor exhibit",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
  },
  {
    src: `${V}/bobo-bridge.mp4`,
    poster: `${V}/bobo-bridge.webp`,
    alt: "Bobo in AR on the Golden Gate Bridge walkway",
    where: "Out in the world",
    tag: "EVADE × Bobo",
    ratio: "9 / 16",
  },
];

const FILTERS: ("All" | Where)[] = ["All", "Conventions", "Stores", "Out in the world"];

function FanReactions() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
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
        lead="Recorded on fans' own phones, at conventions, in stores and out in the world. These are not renders."
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
              <CaptureTile c={c} />
            </li>
          ))}
        </ul>
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

      <CtaBand />
    </>
  );
}

/** A capture that plays only while it's on screen (and never with reduced motion). */
function CaptureTile({ c }: { c: Capture }) {
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
    <figure className="group relative overflow-hidden rounded-[18px] bg-secondary ring-1 ring-white/10">
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
      <figcaption className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 mono text-[9px] uppercase tracking-[0.18em] text-white">
        <span>{c.tag}</span>
        <span className="text-white/60">{c.where}</span>
      </figcaption>
    </figure>
  );
}
