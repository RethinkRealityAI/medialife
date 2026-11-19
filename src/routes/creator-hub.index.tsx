import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { z } from "zod";
import {
  Boxes,
  Coins,
  ImageUp,
  MessagesSquare,
  QrCode,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import {
  HUB,
  PLATFORMS,
  PLATFORM_IDS,
  SKUS,
  SKU_IDS,
  STAGES,
  compact,
  money,
  stageIndex,
  stageOf,
  type StageId,
} from "@/lib/hub/model";
import { Reveal } from "@/components/home/Reveal";
import { CARD, CtaBand, Eyebrow, H1, SECTION as COLUMN, TEXT } from "@/components/site/kit";

const TITLE = "Creator Hub — Activated Merchandise for Creators | MEDIALIFE";
const DESC =
  "Activated merch for creators: t-shirts, keychains and stickers that open an experience when fans scan them. We design, produce and ship it with you. Track every stage, order and payout in the Creator Hub.";
const CANONICAL = "https://medialife.ai/creator-hub";
const OG_IMAGE = `https://medialife.ai${SKUS.tee.image}`;

export const Route = createFileRoute("/creator-hub/")({
  // Agency invite links land here as /creator-hub?invite=CODE; carry the code on to the application.
  validateSearch: z.object({
    invite: z.string().trim().min(1).max(64).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:url", content: CANONICAL },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESC },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: CreatorHubLanding,
});

const EYEBROW = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
const SECTION = "scroll-mt-20";
const WRAP = COLUMN;
const H2 = "mt-5 display text-[clamp(30px,3.4vw,54px)]";

/* The hub app's own routes. Plain links: the app sits outside the marketing site. */
const SIGN_IN = `${HUB.base}/sign-in`;
const joinHref = (invite?: string) =>
  `${HUB.base}/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;

function CreatorHubLanding() {
  const { invite } = Route.useSearch();
  const join = joinHref(invite);
  return (
    <>
      <Hero join={join} invited={!!invite} />
      <Different />
      <Products />
      <HowItWorks />
      <HubFeatures />
      <WhoFor />
      <Faq />
      <FinalCta join={join} />
    </>
  );
}

/* ─────────────────────────── CTAs ─────────────────────────── */
function Ctas({ join, big = false }: { join: string; big?: boolean }) {
  const pad = big ? "px-7 py-4" : "px-6 py-3.5";
  return (
    <div className="flex flex-wrap gap-3">
      <a href={join} className={`group btn-pill btn-solid ${pad} text-sm font-medium`}>
        Apply to join
        <span className="transition-transform group-hover:translate-x-1" aria-hidden>
          →
        </span>
      </a>
      <a href={SIGN_IN} className={`btn-pill btn-glass ${pad} text-sm font-medium`}>
        Sign in
      </a>
    </div>
  );
}

/* ─────────────────────────── HERO ─────────────────────────── */
function Hero({ join, invited }: { join: string; invited: boolean }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] max-w-[160vw] -translate-x-1/2 rounded-full bg-accent opacity-30 blur-[120px]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-25" />
      <div className={`relative ${WRAP} pt-14 pb-16 lg:pt-20 lg:pb-24`}>
        <div className="grid gap-12 xl:grid-cols-12 xl:items-center">
          <div className="xl:col-span-5">
            <Eyebrow hue="magenta">
              {HUB.program} · {HUB.name}
            </Eyebrow>
            <h1 className={`mt-6 ${H1}`}>
              Merch your fans can <span className={TEXT.magenta}>experience.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              T-shirts, keychains and stickers that open an immersive experience when fans scan
              them, with a reward only buyers can unlock. We design, make and ship it with you. You
              see it all in the hub.
            </p>
            <div className="mt-8">
              <Ctas join={join} />
            </div>
            {invited ? (
              <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-2 mono text-[10px] uppercase tracking-[0.18em] text-primary">
                <span aria-hidden>✓</span> Invite applied. It carries through when you apply.
              </p>
            ) : (
              <p className="mt-5 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Apply in 5 minutes · No app for fans · iPhone &amp; Android
              </p>
            )}
          </div>
          <div className="max-w-3xl xl:col-span-7 xl:max-w-none">
            <HubPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

/* A static, illustrative render of the dashboard. Decorative numbers, clearly labelled. */
const PREVIEW_STAGE: StageId = "sampling";

function HubPreview() {
  const current = stageIndex(PREVIEW_STAGE);
  const bars = [22, 30, 26, 41, 38, 55, 48, 62, 58, 74, 69, 88];
  return (
    <figure className="relative">
      <div className="lg-card relative overflow-hidden rounded-[26px] shadow-2xl" aria-hidden>
        {/* window bar */}
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: "#19afff" }} />
            <span className="truncate mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {HUB.name} / Overview
            </span>
          </div>
          <span className="shrink-0 mono text-[10px] uppercase tracking-[0.2em] text-accent">
            ● Live
          </span>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-5">
          {/* product in progress */}
          <div className="bg-background p-4 sm:col-span-3 sm:p-5">
            <div className="flex gap-4">
              <img
                src={SKUS.tee.image}
                alt=""
                width={900}
                height={900}
                className="h-20 w-20 shrink-0 object-cover sm:h-24 sm:w-24"
              />
              <div className="min-w-0">
                <div className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  Winter Drop
                </div>
                <div className="mt-1 font-medium">{SKUS.tee.name}</div>
                <div className="mt-2 inline-flex items-center gap-1.5 border border-primary/40 px-2 py-1 mono text-[9px] uppercase tracking-[0.18em] text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse-glow" />
                  {stageOf(PREVIEW_STAGE).name} · {current + 1}/{STAGES.length}
                </div>
              </div>
            </div>
            <ol className="mt-5 grid grid-cols-7 gap-1">
              {STAGES.map((s, i) => (
                <li key={s.id}>
                  <div
                    className={`h-1.5 ${i < current ? "bg-primary" : i === current ? "" : "bg-secondary"}`}
                    style={i === current ? { background: "#19afff" } : undefined}
                  />
                  <div
                    className={`mt-2 whitespace-nowrap mono text-[8px] uppercase tracking-[0.08em] ${i === current ? "text-foreground" : i < current ? "hidden truncate text-foreground sm:block" : i === STAGES.length - 1 ? "hidden truncate text-muted-foreground sm:block" : "invisible"}`}
                  >
                    {s.name.split(" ")[0]}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">{stageOf(PREVIEW_STAGE).blurb}</p>
          </div>

          {/* earnings */}
          <div className="bg-background p-4 sm:col-span-2 sm:p-5">
            <div className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Your earnings · 30 days
            </div>
            <div className="mt-2 text-2xl font-medium tracking-tight text-primary">
              {money(128460)}
            </div>
            <div className="mt-4 flex h-14 items-end gap-1">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className={`flex-1 ${i === bars.length - 1 ? "bg-accent" : "bg-primary/50"}`}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
              <span>312 orders</span>
              <span>Shopify synced</span>
            </div>
          </div>

          {/* live products + trigger */}
          <div className="bg-background p-4 sm:col-span-3 sm:p-5">
            <ul className="space-y-3">
              <PreviewRow
                img={SKUS.keychain.image}
                name={SKUS.keychain.name}
                tag="Live"
                tone="live"
                meta={`${compact(2431)} scans`}
              />
              <PreviewRow
                img={SKUS.sticker.image}
                name={SKUS.sticker.name}
                tag={stageOf("approval").name}
                tone="you"
                meta="Proof v2 ready"
              />
            </ul>
          </div>
          <div className="flex items-center gap-4 bg-background p-4 sm:col-span-2 sm:p-5">
            <FauxQr className="h-16 w-16 shrink-0 bg-foreground p-1 text-background" />
            <div className="min-w-0">
              <div className="mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                Launch kit
              </div>
              <div className="mt-1 truncate text-sm">medialife.ai/go/wd26</div>
              <div className="mt-1 mono text-[9px] uppercase tracking-[0.15em] text-primary">
                QR · NFC · Posters
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="relative mt-3 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        The Creator Hub dashboard · illustrative data
      </figcaption>
    </figure>
  );
}

function PreviewRow({
  img,
  name,
  tag,
  tone,
  meta,
}: {
  img: string;
  name: string;
  tag: string;
  tone: "live" | "you";
  meta: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <img src={img} alt="" width={900} height={900} className="h-10 w-10 shrink-0 object-cover" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{name}</div>
        <div className="mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
          {meta}
        </div>
      </div>
      <span
        className={`shrink-0 border px-2 py-1 mono text-[9px] uppercase tracking-[0.15em] ${tone === "live" ? "border-accent/50 text-accent" : "border-primary/50 text-primary"}`}
      >
        {tone === "you" ? "Your turn" : tag}
      </span>
    </li>
  );
}

/** A decorative QR-like pattern. Deterministic so server and client render the same; not a real code. */
function FauxQr({ className = "" }: { className?: string }) {
  const n = 21;
  const cells: ReactNode[] = [];
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      if (inBox(ox, oy)) {
        const dx = x - ox;
        const dy = y - oy;
        const ring = dx === 0 || dy === 0 || dx === 6 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core ? 1 : 0;
      }
      if (x >= ox - 1 && x <= ox + 7 && y >= oy - 1 && y <= oy + 7) return 0;
    }
    return -1;
  };
  let seed = 7;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const f = finder(x, y);
      const on = f === -1 ? (seed >> 8) % 5 < 2 : f === 1;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={className} fill="currentColor" aria-hidden>
      {cells}
    </svg>
  );
}

/* ─────────────────────────── WHY IT'S DIFFERENT ─────────────────────────── */
const DIFFERENT = [
  { t: "Every product comes alive", b: "Each one unlocks an experience, so fans come back to it." },
  { t: "No inventory to buy", b: "We handle production, fulfilment and customer service." },
  { t: "Nothing hidden", b: "Every stage, every order and your cut, live in the hub." },
  { t: "Ready to promote", b: "QR codes, links, NFC, posters and social assets for launch." },
];
function Different() {
  return (
    <section aria-labelledby="different" className={SECTION}>
      <h2 id="different" className="sr-only">
        Why activated merch
      </h2>
      <ul className={`${WRAP} grid gap-4 pb-8 sm:grid-cols-2 lg:grid-cols-4`}>
        {DIFFERENT.map((d, i) => (
          <li key={d.t} className={`${CARD} p-5`}>
            <span
              aria-hidden
              className={`block h-1.5 w-1.5 rounded-full ${i % 2 === 0 ? "bg-primary" : "bg-accent"}`}
            />
            <h3 className="mt-3 text-base font-semibold text-white">{d.t}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{d.b}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────── 01 · PRODUCTS ─────────────────────────── */
function Products() {
  return (
    <section id="products" className={SECTION}>
      <div className={`${WRAP} py-20 lg:py-28`}>
        <div className="max-w-3xl">
          <Eyebrow hue="blue">The products</Eyebrow>
          <h2 className={H2}>
            Three products. <span className={TEXT.blue}>Every one opens something.</span>
          </h2>
          <p className="mt-5 text-muted-foreground">
            Your art, your characters, your brand. Each one carries a QR code or NFC tag that opens
            the experience in the phone's browser.
          </p>
        </div>
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {SKU_IDS.map((id) => {
            const s = SKUS[id];
            return (
              <li key={id} className={`${CARD} flex flex-col overflow-hidden`}>
                <div className="aspect-[4/3] overflow-hidden bg-surface">
                  <img
                    src={s.image}
                    alt={s.alt}
                    width={900}
                    height={900}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 motion-safe:hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6 lg:p-7">
                  <h3 className="display text-[clamp(20px,1.8vw,26px)]">{s.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.pitch}</p>
                  <p className="mt-4 flex-1 text-sm">
                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-primary">
                      Trigger ·{" "}
                    </span>
                    {s.trigger}
                  </p>
                  <dl className="mt-6 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <dt className="mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                        Retail
                      </dt>
                      <dd className="mt-1 font-medium">
                        ${s.priceBand[0]}–{s.priceBand[1]}
                      </dd>
                    </div>
                    <div className="rounded-2xl bg-white/[0.04] p-3">
                      <dt className="mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                        Lead time
                      </dt>
                      <dd className="mt-1 font-medium">{s.leadWeeks} weeks</dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Indicative · retail price in USD and weeks from approved design to on sale · final terms
          agreed per product
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────── 02 · HOW IT WORKS ─────────────────────────── */
const STEPS = [
  { t: "Apply", b: "Five minutes: your channels, your audience and the products you want." },
  {
    t: "We design it with you",
    b: "Send your logo and art, or just references. We draft the product and the experience it unlocks.",
  },
  { t: "You approve", b: "Nothing is made until you sign off the design." },
  {
    t: "We make, ship and sell it",
    b: "Production, tag programming, fulfilment and customer service. All handled.",
  },
  {
    t: "You get paid, and see it live",
    b: "Every order and your share, in the hub as it happens.",
  },
];
function HowItWorks() {
  return (
    <section id="how" className={SECTION}>
      <div className={`${WRAP} py-20 lg:py-28`}>
        <Eyebrow hue="magenta">How it works</Eyebrow>
        <h2 className={`${H2} max-w-3xl`}>
          You bring the fans. <span className={TEXT.magenta}>We do the rest.</span>
        </h2>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.t} delay={i * 70} className={`${CARD} p-6`}>
              <span
                className={`grid h-9 w-9 place-items-center rounded-full border border-white/15 mono text-[11px] ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
              >
                {i + 1}
              </span>
              <h3 className="mt-6 text-lg font-semibold text-white">{s.t}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{s.b}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ─────────────────────────── 03 · THE HUB ─────────────────────────── */
const FEATURES: { t: string; b: string; icon: LucideIcon }[] = [
  {
    t: "Pipeline",
    b: "Every product's stage, what's next and who it's waiting on. Approve designs in one click.",
    icon: Boxes,
  },
  {
    t: "Experiences",
    b: "Preview the immersive experience your merch unlocks before fans ever see it.",
    icon: Sparkles,
  },
  {
    t: "Launch kit",
    b: "QR codes, links and NFC for every product, plus posters and social assets to promote it.",
    icon: QrCode,
  },
  {
    t: "Orders & earnings",
    b: "Every order, your cut and your payouts, synced from Shopify and our other sales channels.",
    icon: Coins,
  },
  {
    t: "Artwork",
    b: "Send your logos, characters and references once. Use them on every product.",
    icon: ImageUp,
  },
  {
    t: "Your manager",
    b: "One point of contact at MEDIALIFE, and every message in one thread.",
    icon: MessagesSquare,
  },
];
function HubFeatures() {
  return (
    <section id="hub" className={SECTION}>
      <div className={`${WRAP} grid gap-12 py-20 lg:grid-cols-12 lg:py-28`}>
        <div className="lg:col-span-4">
          <Eyebrow hue="blue">The hub</Eyebrow>
          <h2 className={H2}>
            Everything in <span className={TEXT.blue}>one hub.</span>
          </h2>
          <p className="mt-6 text-muted-foreground">
            Join the program and you get the Creator Hub: your products, your fans' scans and your
            money, in one place.
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          {FEATURES.map((f, i) => (
            <li key={f.t} className={`${CARD} p-6`}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.06]">
                <f.icon
                  className={`h-5 w-5 ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
                  strokeWidth={1.6}
                  aria-hidden
                />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{f.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.b}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── 05 · WHO IT'S FOR ─────────────────────────── */
const CREATOR_TYPES = [
  "YouTubers",
  "Streamers",
  "VTubers",
  "Gaming creators",
  "Artists & animators",
  "Podcasters",
];
function WhoFor() {
  const platforms = PLATFORM_IDS.filter((p) => p !== "other").map((p) => PLATFORMS[p].label);
  return (
    <section id="who" className={SECTION}>
      <div className={`${WRAP} grid gap-12 py-20 lg:grid-cols-12 lg:items-end lg:py-28`}>
        <div className="lg:col-span-6">
          <Eyebrow hue="magenta">Who it's for</Eyebrow>
          <h2 className={H2}>
            Built for creators <span className={TEXT.magenta}>with a community.</span>
          </h2>
          <p className="mt-6 max-w-xl text-muted-foreground">
            If your fans would wear it, clip it to a bag or stick it on a laptop, we can activate
            it. Agency partners can invite their creators and stay in the loop.
          </p>
        </div>
        <div className="lg:col-span-6 space-y-6">
          <ChipRow label="Who" items={CREATOR_TYPES} />
          <ChipRow label="Where you publish" items={platforms} />
        </div>
      </div>
    </section>
  );
}

function ChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className={EYEBROW}>{label}</div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((t) => (
          <li key={t} className="lg-chip rounded-full px-4 py-2 text-sm text-white/90">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────── 06 · FAQ ─────────────────────────── */
const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Do I pay anything upfront?",
    a: "No inventory to buy: we produce, store and ship. Your terms, including your share of each sale, are agreed before anything is made.",
  },
  {
    q: "Do fans need an app?",
    a: "No. A scan (QR) or a tap (NFC) opens the experience in the phone's browser, on iPhone and Android.",
  },
  {
    q: "What do I need to provide?",
    a: "Your logo and art, if you have them. If not, send references and we'll design from those.",
  },
  {
    q: "How do I get paid?",
    a: `You earn a share of net merch revenue on every sale. It's tracked live in the hub and paid out once an order clears the ${HUB.holdDays}-day returns window.`,
  },
  {
    q: "Who owns the designs?",
    a: "You keep your IP. We get a licence to produce and sell the products we make with you.",
  },
  {
    q: "How long does it take?",
    a: `From approved design to on sale, typically ${SKU_IDS.map(
      (id) => `${SKUS[id].leadWeeks} weeks for ${SKUS[id].short.toLowerCase()}s`,
    )
      .join(", ")
      .replace(/, ([^,]*)$/, " and $1")}.`,
  },
  {
    q: "Can my manager or agency see it?",
    a: "Yes. Agency partners can invite their creators and stay in the loop.",
  },
  {
    q: "We're a studio or brand. Is this for us?",
    a: (
      <>
        For game studios and IP holders, see the{" "}
        <Link to="/activated-retail" className="text-primary underline underline-offset-4">
          Activated Retail Program
        </Link>
        .
      </>
    ),
  },
];
function Faq() {
  return (
    <section id="faq" className={SECTION}>
      <div className={`${WRAP} grid gap-12 py-20 lg:grid-cols-12 lg:py-28`}>
        <div className="lg:col-span-4">
          <Eyebrow hue="blue">Questions</Eyebrow>
          <h2 className={H2}>
            Good to <span className={TEXT.blue}>know.</span>
          </h2>
        </div>
        <div className="grid gap-3 lg:col-span-8">
          {FAQ.map((f) => (
            <details key={f.q} className={`${CARD} group px-6`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-semibold text-white sm:text-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-primary transition-transform motion-reduce:transition-none group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-6 pr-10 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── CTA ─────────────────────────── */
function FinalCta({ join }: { join: string }) {
  return (
    <CtaBand
      id="hub-cta"
      hue="magenta"
      eyebrow="Apply in five minutes"
      title={
        <>
          Make merch your fans can <span className="text-accent">experience.</span>
        </>
      }
      lead={
        <>
          We review every application and reply by email. Questions?{" "}
          <a
            href={`mailto:${HUB.supportEmail}`}
            className="text-white underline underline-offset-4 hover:text-primary"
          >
            {HUB.supportEmail}
          </a>
        </>
      }
      actions={<Ctas join={join} big />}
    />
  );
}
