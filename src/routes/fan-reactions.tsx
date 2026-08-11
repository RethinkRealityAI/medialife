import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/fan-reactions")({
  head: () => ({
    meta: [
      { title: "Fan Reactions — MediaLife.AI" },
      {
        name: "description",
        content:
          "Live captures from Anime Expo, SDCC, Anime NYC and beyond. Real fans, real AR experiences, in the wild.",
      },
      { property: "og:title", content: "Fan Reactions — MediaLife.AI" },
      {
        property: "og:description",
        content: "AR media in the wild: fan-uploaded captures from global activations.",
      },
    ],
  }),
  component: FanReactions,
});

const GIFS = [
  "https://framerusercontent.com/images/NqCy3mPVKQMKDufaM8S8R391MQ.gif",
  "https://framerusercontent.com/images/eRU3BYCVAoDOa97AqKQfyFLWuFg.gif",
  "https://framerusercontent.com/images/nbDc4peZes8YcOMwGUjJn0JxxqQ.gif",
  "https://framerusercontent.com/images/6JPnl8xKolTHId6veAegVcNBAcg.gif",
  "https://framerusercontent.com/images/Fl5k7LHWCXny6RJSOjywigkiX4.gif",
  "https://framerusercontent.com/images/9C7rbeiGjyeI5w32YBlKaPoQU.gif",
  "https://framerusercontent.com/images/1DFxSvOiyY8GpU0eIhzQ6KqsIg.gif",
  "https://framerusercontent.com/images/AEuJBqEZaAim8bbcLp7eItF0.jpg",
];

const EVENTS = [
  "Anime Expo",
  "SDCC",
  "Anime NYC",
  "AWA",
  "Kawaii Kon",
  "Sakura Con",
  "C2E2",
  "Dragon Con",
];

function FanReactions() {
  // Build a tiled grid by repeating
  const tiles = Array.from({ length: 24 }, (_, i) => ({
    src: GIFS[i % GIFS.length],
    event: EVENTS[i % EVENTS.length],
    id: (i + 1).toString().padStart(3, "0"),
  }));

  return (
    <>
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative mx-auto max-w-[1400px] px-6 pt-24 pb-20">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            / Fan Reactions · In the wild
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-medium tracking-tight text-balance leading-[0.95]">
            For fans. <span className="ember-text">By fans.</span>
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            Real captures from global activations — Anime Expo, San Diego Comic Con, Anime NYC, and
            beyond. These are not renders. These are people meeting their heroes for the first time.
          </p>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
            {[
              ["6,200+", "captures uploaded"],
              ["48", "global activations"],
              ["120s", "avg. dwell"],
              ["50%", "shared with others"],
            ].map(([v, l]) => (
              <div key={l} className="bg-background p-6">
                <div className="text-3xl font-medium ember-text">{v}</div>
                <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground mt-2">
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-16">
          <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-8">
            / Latest captures · Auto-curated
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {tiles.map((t, i) => (
              <div
                key={i}
                className="relative group overflow-hidden border border-border bg-secondary aspect-[3/5]"
              >
                <img
                  src={t.src}
                  alt={`Fan AR capture ${t.id}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
                <div className="absolute top-2 left-2 mono text-[9px] uppercase tracking-widest bg-background/80 backdrop-blur px-2 py-0.5">
                  / {t.id}
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between mono text-[10px] uppercase tracking-widest">
                  <span className="text-foreground">{t.event}</span>
                  <span className="text-accent">● Live</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              / Submissions
            </div>
            <h2 className="mt-6 text-4xl md:text-5xl font-medium tracking-tight text-balance">
              Join the feed.
            </h2>
            <p className="mt-6 text-muted-foreground max-w-md">
              Upload your AR moment for a chance to be featured. Best captures rotate to the
              homepage.
            </p>
          </div>
          <div className="flex md:justify-end">
            <Link
              to="/contact"
              className="btn-pill btn-ember px-7 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
            >
              Submit your capture →
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
