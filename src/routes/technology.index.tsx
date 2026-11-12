import { createFileRoute, Link } from "@tanstack/react-router";
import { Reveal } from "@/components/home/Reveal";
import { LayerStack, type Layer } from "@/components/site/LayerStack";
import {
  CARD,
  CtaBand,
  EYEBROW,
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
      />
    </>
  );
}
