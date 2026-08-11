import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MediaLife.AI — Augmented Reality, Deployed at Scale" },
      {
        name: "description",
        content:
          "Turnkey AR media infrastructure transforming merchandise, live events and print into immersive fan experiences.",
      },
    ],
    links: [
      ...FAN_GIFS.map((href) => ({
        rel: "preload" as const,
        as: "image" as const,
        href,
        fetchpriority: "high" as const,
      })),
      { rel: "preconnect", href: "https://framerusercontent.com", crossorigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://framerusercontent.com" },
    ],
  }),
  component: Home,
});

const FAN_GIFS = [
  "https://framerusercontent.com/images/NqCy3mPVKQMKDufaM8S8R391MQ.gif",
  "https://framerusercontent.com/images/eRU3BYCVAoDOa97AqKQfyFLWuFg.gif",
  "https://framerusercontent.com/images/nbDc4peZes8YcOMwGUjJn0JxxqQ.gif",
  "https://framerusercontent.com/images/6JPnl8xKolTHId6veAegVcNBAcg.gif",
  "https://framerusercontent.com/images/Fl5k7LHWCXny6RJSOjywigkiX4.gif",
  "https://framerusercontent.com/images/9C7rbeiGjyeI5w32YBlKaPoQU.gif",
];

const LOGOS = [
  "https://framerusercontent.com/images/qUfRGP9uj07bKO0dNcv0tkhLok.png",
  "https://framerusercontent.com/images/QQjZpjhhX2YgCrYX1JfTCEnxp04.png",
  "https://framerusercontent.com/images/9ysMaU73GOaKmyu88e2QQveNpg.png",
  "https://framerusercontent.com/images/dFNvgOInEetXdYXwRqulR0Rs.png",
  "https://framerusercontent.com/images/QwZ1wzFdXNw9j9qiIKZts1x0YU.png",
  "https://framerusercontent.com/images/ixAgwiRiUJSQsuysPbqonFzYsFA.png",
  "https://framerusercontent.com/images/ptcg7af1bZezBsEpdH52oT1SatE.png",
  "https://framerusercontent.com/images/Ib1YTprOlcGUcMubBW9WT9OB21I.png",
  "https://framerusercontent.com/images/tddeO2vJbRAtktw5LOsDnxjWwg.png",
];

const STATS = [
  { event: "Anime NYC", v: "86%", l: "AR interactions converted" },
  { event: "AWA", v: "6.2", l: "repeat interactions per product" },
  { event: "Kawaii Kon", v: "50%", l: "shared AR with others" },
  { event: "Sakura Con", v: "120s", l: "avg. engagement time" },
  { event: "Anime Expo", v: "90%", l: "interaction rate" },
];

function Home() {
  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-60" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-[80%] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />

        <div className="relative w-full px-8 lg:px-16 pt-16 pb-16">
          <div className="flex items-center gap-3 mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
            AI · Augmented Reality · Brand Activation Agency
          </div>

          <h1 className="mt-8 text-[1.875rem] md:text-[2.95rem] lg:text-[3.75rem] font-medium tracking-tight text-balance leading-[0.95]">
            You won't see augmented reality.
            <br />
            You'll <span className="ember-text">experience it</span>.
          </h1>

          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            MediaLife.AI is the AI Augmented Reality agency — fan engagement, brand activations,
            experiential interaction events, and the ultimate customer engagement, across retail,
            live events, print and broadcast.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/technology"
              className="group btn-pill btn-ember px-7 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
            >
              Explore the Stack
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              to="/fan-reactions"
              className="btn-pill btn-ember-outline px-7 py-4 mono text-xs uppercase tracking-[0.2em]"
            >
              See Fan Reactions
            </Link>
          </div>
        </div>
      </section>

      {/* FAN GIF MARQUEE — moved above stats so it's visible on landing */}
      <section className="relative border-b border-border py-8 overflow-hidden bg-surface">
        <div className="mb-5 px-8 lg:px-16 mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          / 01 — Captured in the wild · Fan uploads from Anime Expo, SDCC & Anime NYC
        </div>
        {/* 4 copies so each animated half (-50%) is at least 2 sets wide — guarantees no gap on any viewport */}
        <div
          className="flex gap-4 animate-marquee"
          style={{ width: "max-content", willChange: "transform" }}
        >
          {[...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS, ...FAN_GIFS].map((src, i) => (
            <div
              key={i}
              className="relative h-[280px] w-[160px] flex-shrink-0 overflow-hidden border border-border bg-secondary"
            >
              <img
                src={src}
                alt="Fan AR reaction"
                loading="eager"
                decoding="async"
                fetchPriority={i < 6 ? ("high" as const) : ("auto" as const)}
                width={160}
                height={280}
                className="h-full w-full object-cover"
              />
              <div className="absolute top-2 left-2 mono text-[9px] uppercase tracking-widest bg-background/80 backdrop-blur px-2 py-0.5">
                / Rec {((i % 9) + 1).toString().padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STATS — moved below carousel */}
      <section className="border-b border-border">
        <div className="w-full px-8 lg:px-16 py-16">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border">
            {STATS.map((s) => (
              <div
                key={s.event}
                className="bg-background p-6 hover:bg-secondary transition-colors group"
              >
                <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  / {s.event}
                </div>
                <div className="mt-3 text-3xl md:text-4xl font-medium tracking-tight ember-text group-hover:scale-105 transition-transform origin-left">
                  {s.v}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="border-b border-border">
        <div className="w-full px-8 lg:px-16 py-28">
          <div className="grid md:grid-cols-12 gap-12">
            <div className="md:col-span-4">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / 02 — Services
              </div>
              <h2 className="mt-6 text-4xl md:text-5xl font-medium tracking-tight text-balance">
                Five disciplines. <span className="ember-text">One agency.</span>
              </h2>
              <p className="mt-6 text-muted-foreground">
                We operate at the intersection of AI, augmented reality and live experience design —
                building activations that fans actually share and brands can actually measure.
              </p>
              <Link
                to="/technology"
                className="mt-8 inline-flex mono text-xs uppercase tracking-[0.2em] text-primary border-b border-primary pb-1"
              >
                Browse the tech stack →
              </Link>
            </div>

            <div className="md:col-span-8 grid sm:grid-cols-2 gap-px bg-border border border-border">
              {[
                {
                  n: "01",
                  t: "Augmented Reality",
                  d: "App-free WebAR, native ARKit/ARCore and social lenses across Snap, Meta and TikTok — engineered for scale.",
                },
                {
                  n: "02",
                  t: "AI Fan Engagement",
                  d: "Generative AI, character agents, voice cloning and personalised one-of-one artefacts per fan.",
                },
                {
                  n: "03",
                  t: "Brand Activations",
                  d: "Retail, print, OOH and direct mail reimagined as living, measurable AR storytelling surfaces.",
                },
                {
                  n: "04",
                  t: "Experiential Events",
                  d: "Festival, stadium and venue takeovers — multi-user spatial AR synced across thousands of fans.",
                },
                {
                  n: "05",
                  t: "Ultimate Customer Engagement",
                  d: "Always-on, data-rich AR loops that turn passive audiences into participants, advocates and repeat customers.",
                },
                {
                  n: "06",
                  t: "Measurement & Intel",
                  d: "Real-time telemetry, ROI attribution and cohort analytics shipped with every deployment.",
                },
              ].map((p) => (
                <div key={p.n} className="bg-background p-8 hover:bg-secondary transition group">
                  <div className="flex items-start justify-between">
                    <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      /{p.n}
                    </div>
                    <div className="h-6 w-6 border border-border rounded-full grid place-items-center text-xs group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition">
                      →
                    </div>
                  </div>
                  <h3 className="mt-8 text-xl font-medium">{p.t}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{p.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AS SEEN AT - logo marquee */}
      <section className="border-b border-border bg-surface py-12 overflow-hidden">
        <div className="px-8 lg:px-16 mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-8">
          / 03 — Deployed alongside
        </div>
        <div
          className="flex gap-16 items-center animate-marquee-slow"
          style={{ width: "max-content" }}
        >
          {[...LOGOS, ...LOGOS, ...LOGOS, ...LOGOS].map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              loading="lazy"
              className="h-12 w-auto opacity-50 hover:opacity-100 transition grayscale hover:grayscale-0"
            />
          ))}
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg-sm opacity-30" />
        <div className="relative w-full px-8 lg:px-16 py-32 grid md:grid-cols-2 gap-16">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary">
              / Manifesto
            </div>
            <h2 className="mt-6 text-4xl md:text-6xl font-medium tracking-tight text-balance">
              We play at the edge of <span className="ember-text">new format innovation</span>.
            </h2>
          </div>
          <div className="space-y-8 text-lg text-muted-foreground">
            <p>
              Fans are craving something different — experiences that feel personal, participatory,
              and lasting.
            </p>
            <p>
              By seamlessly merging the physical with the digital, augmented reality is redefining
              how global brands tell their stories.
            </p>
            <p>
              We turn physical fandom touchpoints into data-rich, dynamic storytelling portals that
              consistently outperform legacy media channels.
            </p>
            <Link
              to="/insights"
              className="inline-flex mono text-xs uppercase tracking-[0.2em] text-primary border-b border-primary pb-1 hover:gap-3"
            >
              Read the research →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
