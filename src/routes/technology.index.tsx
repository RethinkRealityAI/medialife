import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/home/Reveal";
import { LayerStack, type Layer } from "@/components/site/LayerStack";
import {
  CARD,
  CtaBand,
  EYEBROW,
  Eyebrow,
  H2,
  PageHero,
  SECTION,
  SectionHead,
  Stat,
  TEXT,
} from "@/components/site/kit";
import { TECH_STACKS } from "@/lib/tech-stacks";

export const Route = createFileRoute("/technology/")({
  head: () => ({
    meta: [
      { title: "Technology | MEDIALIFE" },
      {
        name: "description",
        content:
          "How MEDIALIFE experiences work: a QR, NFC tap or the art itself opens WebAR in the phone browser, with characters, games and real-time analytics built in.",
      },
      { property: "og:title", content: "Technology | MEDIALIFE" },
      {
        property: "og:description",
        content: "App-free WebAR, built per IP, measured on every scan.",
      },
    ],
    links: [{ rel: "canonical", href: "https://medialife.ai/technology" }],
  }),
  component: Technology,
});

const LAYERS: Layer[] = [
  {
    name: "Trigger",
    mark: "Scan · Tap",
    line: "The product is the link.",
    body: "A QR code, an NFC disc built into the design, or the printed art itself. Fans point a phone or tap, and the experience starts. Nothing to download first.",
    tools: ["QR", "NFC", "Image targets"],
  },
  {
    name: "Runtime",
    mark: "No app",
    line: "Opens straight in the browser.",
    body: "WebAR that runs in the phone's own browser on iPhone and Android, tracking the poster, the product or the room around the fan.",
    tools: ["WebGL", "three.js", "8th Wall engine", "Zappar Mattercraft"],
  },
  {
    name: "Experience",
    mark: "Play",
    line: "Characters, games and worlds.",
    body: "Each experience is built around the IP: 3D characters that pop out of the product, browser games, collector hubs, and places to find on a live map.",
    tools: ["glTF 3D", "Blender", "Mini games", "Spatial audio"],
  },
  {
    name: "Delivery",
    mark: "Fast",
    line: "Light enough for a phone on 4G.",
    body: "Compressed 3D and video, loaded only when they are needed, served from a global edge network so the first frame shows up quickly.",
    tools: ["Edge hosting", "Meshopt 3D", "Lazy loading"],
  },
  {
    name: "Insight",
    mark: "Measure",
    line: "Every scan counted.",
    body: "Each scan, tap, replay and share is logged per unit, per store and per event, in dashboards brand teams read during the activation, not weeks later.",
    tools: ["Event pipeline", "Live dashboards", "Per-unit tracking"],
  },
];

/** The six formats, in more depth than the homepage gives them: what starts each, what it tracks, what it suits, where to try one. */
const FORMATS: {
  name: string;
  trigger: string;
  tracks: string;
  best: string;
  live: { label: string; href: string; external?: boolean };
}[] = [
  {
    name: "Image-tracked AR",
    trigger: "The printed art itself, or its QR",
    tracks: "A poster, print, garment or charm",
    best: "Posters, apparel, packaging, collectibles",
    live: { label: "Off the Chain (EVADE keychain)", href: "/evade/keychain-ar/" },
  },
  {
    name: "World-tracked AR",
    trigger: "A QR or NFC tap on the product",
    tracks: "The floor and the room around the fan",
    best: "Life-size characters and photo moments",
    live: { label: "Bobo sightings on the globe", href: "/evade/where-is-bobo/" },
  },
  {
    name: "Geospatial",
    trigger: "Being at the place, then a scan",
    tracks: "A real building, street or venue",
    best: "Landmarks, storefronts, city-wide hunts",
    live: { label: "Sakamoto Days storefront clip", href: "/fan-reactions" },
  },
  {
    name: "Immersive mini-games",
    trigger: "A QR or NFC tap on the product",
    tracks: "Touch controls, no camera needed",
    best: "Replay value and rewards",
    live: { label: "EVADE Cola Run", href: "https://evade.medialife.ai", external: true },
  },
  {
    name: "3D collector hubs",
    trigger: "Owning the product, unlocked with its code",
    tracks: "What each fan owns and has unlocked",
    best: "Collections, new drops, owner perks",
    live: { label: "Bobo's Hideout (coming soon)", href: "/evade/#hideout" },
  },
  {
    name: "Fan rewards",
    trigger: "Scans, plays and shares",
    tracks: "Points and progress per fan",
    best: "Bringing fans back for the next drop",
    live: { label: "The Cola Run reward card", href: "/evade/" },
  },
];

/** One logged scan, as an example of what the Insight layer records. Illustrative values. */
const SCAN_EVENT: { k: string; v: string; note: string }[] = [
  { k: "event", v: "scan", note: "Scan, tap, play, replay, share or reward" },
  { k: "experience", v: "Cola Run", note: "Which experience opened" },
  { k: "unit", v: "keychain #00412", note: "The exact product, when it has its own code" },
  { k: "trigger", v: "QR", note: "QR, NFC or the art itself" },
  { k: "where", v: "Vancouver, CA", note: "Where the scan happened" },
  { k: "placement", v: "Store display", note: "Shelf, standee, convention booth, a fan's bag" },
  { k: "time in", v: "2m 14s", note: "How long the fan stayed" },
  { k: "next", v: "reward unlocked", note: "What they did at the end" },
];

function Technology() {
  return (
    <>
      <PageHero
        hue="blue"
        eyebrow="Technology"
        title={
          <>
            Scan it. <span className={TEXT.blue}>It comes alive.</span>
          </>
        }
        lead="What happens between a fan's phone and the experience: five layers, built and run by one team, with no app in the way."
        aside={
          <div className="relative mx-auto w-full max-w-[460px]">
            <div
              aria-hidden
              className="absolute inset-[14%] rounded-full bg-accent opacity-25 blur-[90px]"
            />
            <div
              aria-hidden
              className="absolute inset-[22%] translate-x-[18%] rounded-full bg-primary opacity-25 blur-[90px]"
            />
            <img
              src="/technology/scan-alive.webp"
              alt="MEDIALIFE's Sukeban character stepping out of a phone screen in AR"
              width={751}
              height={900}
              className="relative w-full animate-drift drop-shadow-[0_40px_60px_rgba(0,0,0,0.7)]"
            />
          </div>
        }
      />

      {/* the stack, interactive */}
      <section aria-labelledby="stack-title" className={`${SECTION} pb-24 lg:pb-32`}>
        <SectionHead
          id="stack-title"
          hue="magenta"
          eyebrow="The stack"
          title={
            <>
              Five layers, <span className={TEXT.magenta}>one tap.</span>
            </>
          }
          lead="Pick a layer to lift it out of the stack."
          className="mb-12"
        />
        <LayerStack layers={LAYERS} />
      </section>

      {/* formats in depth */}
      <section aria-labelledby="formats-title" className={`${SECTION} pb-24 lg:pb-32`}>
        <SectionHead
          id="formats-title"
          hue="blue"
          eyebrow="Formats in depth"
          title={
            <>
              Six formats, <span className={TEXT.blue}>side by side.</span>
            </>
          }
          lead="What starts each one, what it follows, what it suits, and where you can try one today."
          className="mb-12"
        />
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((f, i) => (
            <Reveal
              as="li"
              key={f.name}
              delay={(i % 3) * 80}
              className={`${CARD} flex flex-col p-6`}
            >
              <h3 className="display text-[clamp(20px,1.8vw,24px)]">
                <span
                  className={`mr-2 mono text-[11px] ${i % 2 === 0 ? "text-primary" : "text-accent"}`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {f.name}
              </h3>
              <dl className="mt-5 grid gap-3 text-sm">
                {(
                  [
                    ["Starts with", f.trigger],
                    ["Follows", f.tracks],
                    ["Best for", f.best],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="grid gap-0.5 border-b border-white/10 pb-3">
                    <dt className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                      {k}
                    </dt>
                    <dd className="text-white/90">{v}</dd>
                  </div>
                ))}
              </dl>
              <a
                href={f.live.href}
                {...(f.live.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`mt-auto inline-flex items-center gap-2 pt-5 text-sm font-medium hover:underline ${i % 2 === 0 ? "text-primary" : "text-accent"}`}
              >
                Try it: {f.live.label} <span aria-hidden>{f.live.external ? "↗" : "→"}</span>
                {f.live.external && <span className="sr-only">(opens in a new tab)</span>}
              </a>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* what one scan records */}
      <section aria-labelledby="event-title" className={`${SECTION} pb-24 lg:pb-32`}>
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <Eyebrow hue="magenta">Inside the Insight layer</Eyebrow>
            <h2 id="event-title" className={`mt-5 ${H2}`}>
              What one scan <span className={TEXT.magenta}>tells you.</span>
            </h2>
            <p className="mt-6 text-muted-foreground lg:text-lg">
              Every scan becomes one small event like this one. Add them up by product, store, event
              or city and you see what works while the activation is still running.
            </p>
          </Reveal>
          <Reveal className={`${CARD} overflow-hidden lg:col-span-7`}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Example event
              </span>
              <span className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.2em] text-accent">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-glow"
                  aria-hidden
                />
                Live
              </span>
            </div>
            <dl className="divide-y divide-white/[0.06]">
              {SCAN_EVENT.map((e) => (
                <div
                  key={e.k}
                  className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-4 gap-y-0.5 px-5 py-3 sm:grid-cols-[8rem_minmax(0,11rem)_minmax(0,1fr)]"
                >
                  <dt className="mono text-[11px] text-muted-foreground">{e.k}</dt>
                  <dd className="mono text-[13px] text-white">{e.v}</dd>
                  <dd className="col-start-2 text-xs text-muted-foreground sm:col-start-3">
                    {e.note}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-white/10 px-5 py-3 mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              Illustrative values
            </p>
          </Reveal>
        </div>
      </section>

      {/* field numbers (from the case studies) */}
      <section aria-labelledby="proof-title" className={`${SECTION} pb-24 lg:pb-32`}>
        <h2 id="proof-title" className={EYEBROW}>
          From the field
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat value="0" label="apps to install" hue="blue" />
          <Stat value="2+ min" label="average engagement" hue="magenta" note="Anime conventions" />
          <Stat value="90%" label="interaction rate" hue="blue" note="Anime conventions" />
          <Stat value="3m 22s" label="average on an NFC unit" hue="magenta" note="Sakamoto Days" />
        </div>
      </section>

      {/* the toolkit */}
      <section aria-labelledby="toolkit-title" className={`${SECTION} pb-24 lg:pb-32`}>
        <SectionHead
          id="toolkit-title"
          hue="blue"
          eyebrow="The toolkit"
          title={
            <>
              Six ways <span className={TEXT.blue}>to build it.</span>
            </>
          }
          lead="From browser AR to social lenses and generative AI. Open any one for the full brief."
          className="mb-12"
        />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TECH_STACKS.map((s, i) => (
            <Reveal key={s.slug} delay={(i % 3) * 80} className="h-full">
              <Link
                to="/technology/$slug"
                params={{ slug: s.slug }}
                className={`${CARD} group flex h-full flex-col p-7 transition-colors hover:border-white/25`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className={`${EYEBROW} text-[9px]`}>
                    {s.num} · {s.category}
                  </span>
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-sm transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-white"
                  >
                    →
                  </span>
                </div>
                <h3
                  className={`mt-8 display text-[clamp(22px,2vw,28px)] transition-colors ${i % 2 === 0 ? "group-hover:text-primary" : "group-hover:text-accent"}`}
                >
                  {s.name}
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">{s.tagline}</p>
                <ul className="mt-auto flex flex-wrap gap-1.5 pt-6" aria-label="Built with">
                  {s.partners.slice(0, 3).map((p) => (
                    <li
                      key={p}
                      className="rounded-full border border-white/10 px-2.5 py-1 mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaBand
        hue="blue"
        eyebrow="Build with us"
        title={
          <>
            Put it in <span className="text-primary">your next drop.</span>
          </>
        }
        lead="Tell us about the product and where fans meet it. We'll pick the format, build it and measure it."
      />
    </>
  );
}
