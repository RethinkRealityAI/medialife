import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { SHOP_URL } from "@/components/site/Nav";
import { CountUp } from "@/components/site/CountUp";
import {
  ShowcaseProvider,
  ShowcaseStage,
  useShowcase,
  type Goto,
} from "@/components/program/showcase";
import { AWARD, PERFORMANCE, RETAIL_UNITS } from "@/lib/capabilities";
import { HUB } from "@/lib/hub/model";
import { Reveal } from "@/components/home/Reveal";
import {
  CARD,
  CtaBand,
  EYEBROW,
  Eyebrow,
  H1,
  PillLink,
  SECTION as COLUMN,
  SectionHead,
  TEXT,
} from "@/components/site/kit";

const TITLE = "Activated Retail Program | MEDIALIFE";
const DESC =
  "Get your merch activated, and we'll build the fixture: a branded retail display where every product opens a digital experience. For stores, pop-ups and convention floors.";

export const Route = createFileRoute("/activated-retail")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      {
        property: "og:image",
        content: "https://medialife.ai/medialife/activated-retail/page/og.jpg",
      },
      {
        name: "twitter:image",
        content: "https://medialife.ai/medialife/activated-retail/page/og.jpg",
      },
    ],
    links: [
      { rel: "canonical", href: "https://medialife.ai/activated-retail" },
      {
        rel: "preload",
        as: "image",
        href: "/medialife/activated-retail/page/showcase-poster.webp",
        media: "(min-width: 768px)",
      },
    ],
    // "View in AR" opens from this page (the phone viewers, or a QR sheet on desktop)
    scripts: [
      { src: "/vendor/ar-kit/qrcode.min.js", defer: true },
      { src: "/vendor/ar-kit/ar-launch.js", defer: true },
    ],
  }),
  component: ProgramPage,
});

const SECTION = `${COLUMN} scroll-mt-20 py-20 lg:py-28`;
const WRAP = COLUMN;

function ProgramPage() {
  return (
    <ShowcaseProvider>
      <Hero />
      <HowItWorks />
      <Anatomy />
      <Merch />
      <Venues />
      <YourIP />
      <Benefits />
      <Faq />
      <FinalCta />
    </ShowcaseProvider>
  );
}

/* ─────────────────────────── HERO + LIVE SHOWCASE ─────────────────────────── */
function Hero() {
  const sc = useShowcase();
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[1100px] max-w-[160vw] -translate-x-1/2 rounded-full bg-primary opacity-30 blur-[120px]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 grid-bg opacity-25" />
      <div className={`relative ${WRAP} pt-14 pb-10 sm:pt-20`}>
        <Reveal>
          <Eyebrow hue="blue">Activated Retail Program</Eyebrow>
        </Reveal>
        <div className="mt-6 grid gap-8 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-8">
            <h1 className={H1}>
              Get your merch activated. <span className={TEXT.blue}>We build this.</span>
            </h1>
          </Reveal>
          <Reveal delay={120} className="lg:col-span-4">
            <p className="text-muted-foreground lg:text-lg">
              A branded retail fixture where every product opens a digital experience. Fans tap,
              scan and unlock. You see every scan.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PillLink to="/contact">Book a call</PillLink>
              <button
                type="button"
                onClick={() => sc.tour()}
                className="btn-pill btn-glass px-7 py-4 text-sm font-medium"
              >
                Take the tour
              </button>
            </div>
          </Reveal>
        </div>
      </div>

      <div id="showcase" className={`relative ${WRAP} pb-6 scroll-mt-24`}>
        <div className="overflow-hidden rounded-[26px] ring-1 ring-white/10">
          <ShowcaseStage />
        </div>
        <ShowcaseBar />
      </div>
    </section>
  );
}

function ShowcaseBar() {
  const sc = useShowcase();
  const { themes, theme, venue } = sc.state;
  const btn = "btn-pill btn-glass gap-2 px-4 py-2.5 text-sm font-medium";
  return (
    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <p className="text-sm text-muted-foreground">
        <span className="hidden sm:inline">Drag to orbit · </span>tap a glowing marker to pick up a
        product · switch the property, venue and lighting at the top.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => sc.activate()}>
          <span aria-hidden>◉</span> Try an activation
        </button>
        <button type="button" className={btn} onClick={() => sc.viewInAR()}>
          <span aria-hidden>▣</span> View in your space
        </button>
        <button type="button" className={btn} onClick={() => sc.goto({ view: "dashboard" })}>
          <span aria-hidden>▤</span> Open the dashboard
        </button>
      </div>
      {/* screen readers: what the display is showing */}
      <span className="sr-only" aria-live="polite">
        {theme && venue
          ? `Showing ${themes.find((t) => t.id === theme)?.name ?? theme} in the ${venue === "retail" ? "store" : venue} venue`
          : ""}
      </span>
    </div>
  );
}

/* ─────────────────────────── 01 · HOW IT WORKS ─────────────────────────── */
const STEPS = [
  {
    t: "Activate your merch",
    b: "We design and produce apparel, stickers, keychains and collectibles with NFC or QR built in.",
  },
  {
    t: "We build the fixture",
    b: "Your IP on lit towers, a header, a video wall and a hero screen. Modular, so it travels.",
  },
  {
    t: "Fans tap, scan, unlock",
    b: "One tap opens an immersive experience in the browser, with a reward at the end. Nothing to download.",
  },
  {
    t: "You see every scan",
    b: "A live dashboard reports scans, engagement and sales by product, place and hour.",
  },
];
function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={SECTION}>
      <SectionHead
        id="how-title"
        hue="magenta"
        eyebrow="How it works"
        title={
          <>
            From merch to <span className={TEXT.magenta}>measured.</span>
          </>
        }
        lead="Four steps, one team, from the first design to the live dashboard."
      />
      <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.t} delay={i * 80} className={`${CARD} p-7`}>
            <span
              className={`grid h-9 w-9 place-items-center rounded-full border border-white/15 mono text-[11px] ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
            >
              {i + 1}
            </span>
            <h3 className="mt-6 text-lg font-semibold text-white">{s.t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.b}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/* ─────────────────────────── 02 · INSIDE THE FIXTURE ─────────────────────────── */
const PARTS: { t: string; b: string; spec: string; go: Goto }[] = [
  {
    t: "Lit header",
    b: "Your IP in face-lit channel letters, or a full-colour lightbox.",
    spec: "2320 × 560 mm",
    go: { view: "aisle" },
  },
  {
    t: "Video wall + hero screen",
    b: "Trailers, drop countdowns and live scan counts, above the shelf.",
    spec: "12 tiles + 1190 mm screen",
    go: { view: "hero" },
  },
  {
    t: "Scan-to-unlock towers",
    b: "Backlit key art with a live QR code that works from the aisle.",
    spec: "760 × 600 × 2160 mm",
    go: { view: "qr" },
  },
  {
    t: "Merch bay",
    b: "LED-edged shelves with an activated product in every slot.",
    spec: "2280 × 440 × 830 mm",
    go: { view: "shelf" },
  },
  {
    t: "Digital totem",
    b: "A 75-inch portrait screen that pulls people in from a distance.",
    spec: '75" portrait screen',
    go: { view: "totem" },
  },
  {
    t: "Modular build",
    b: "Six modules bolt together on site, so each drop swaps graphics, not fixtures.",
    spec: "3.84 × 0.68 × 2.47 m",
    go: { mode: "build" },
  },
];
function Anatomy() {
  const sc = useShowcase();
  const [on, setOn] = useState<string | null>(null);
  return (
    <section id="fixture" aria-labelledby="fixture-title" className={SECTION}>
      <div className="grid gap-12 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <Eyebrow hue="blue">Inside the fixture</Eyebrow>
          <h2 id="fixture-title" className="mt-5 display text-[clamp(30px,3.4vw,54px)]">
            Every surface <span className={TEXT.blue}>earns its place.</span>
          </h2>
          <p className="mt-6 text-muted-foreground lg:text-lg">
            Pick a part and the camera flies to it in the showcase above.
          </p>
        </Reveal>
        <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-8">
          {PARTS.map((p) => (
            <li key={p.t}>
              <button
                type="button"
                onClick={() => {
                  setOn(p.t);
                  sc.goto(p.go.mode ? p.go : { mode: "explore", ...p.go });
                }}
                aria-pressed={on === p.t}
                className={`${CARD} group h-full w-full p-6 text-left transition-colors hover:border-white/25 aria-pressed:border-primary`}
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-semibold text-white transition-colors group-hover:text-primary">
                    {p.t}
                  </h3>
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-primary shrink-0 pt-1">
                    Show me →
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.b}</p>
                <div className={`mt-4 ${EYEBROW} text-[9px]`}>{p.spec}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── 03 · ACTIVATED MERCH ─────────────────────────── */
const A = "/medialife/activated-retail/assets";
const MERCH = [
  {
    name: "Sukeban AR Hoodie",
    img: `${A}/ml_reward_hoodie.webp`,
    how: "Scan the back print and she steps out of it in AR.",
    zone: "hoodie",
    shop: "https://shop.medialife.ai/products/black-hoodie-sukeban",
  },
  {
    name: "Trainwreck AR Tee",
    img: `${A}/ml_reward_tee.webp`,
    how: "Scan the print and the train scene comes alive.",
    zone: "tee",
    shop: "https://shop.medialife.ai/products/unisex-classic-tee",
  },
  {
    name: "Sukeban Keychain",
    img: `${A}/ml_reward_keychain.webp`,
    how: "The QR on the keychain opens the Sukeban experience.",
    zone: "keychain",
    shop: "https://shop.medialife.ai/products/sukeban-keychain",
  },
  {
    name: "Holo sticker",
    img: `${A}/ml_reward_sticker.webp`,
    how: "An NFC tag behind the art: tap a phone and it animates.",
    zone: "cap",
  },
  {
    name: "Vinyl collectible",
    img: `${A}/ml_reward_figure.webp`,
    how: "An NFC chip in the base unlocks an immersive experience and a digital twin.",
    zone: "plush",
  },
  {
    name: "Desk mat",
    img: `${A}/ml_reward_mat.webp`,
    how: "The QR lives inside the artwork, so the print is the trigger.",
    zone: "mousepad",
  },
];
function Merch() {
  const sc = useShowcase();
  return (
    <section id="merch" aria-labelledby="merch-title" className={SECTION}>
      <div>
        <SectionHead
          id="merch-title"
          hue="magenta"
          eyebrow="The activated merch"
          title={
            <>
              Real drops. <span className={TEXT.magenta}>Every one comes alive.</span>
            </>
          }
          lead={
            <>
              Three are in our shop today. The rest are formats we produce for your IP.{" "}
              <a
                href={SHOP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white underline underline-offset-4 hover:text-primary"
              >
                Shop activated merch ↗<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          }
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MERCH.map((m) => (
            <li key={m.name} className={`${CARD} flex flex-col overflow-hidden`}>
              <div className="relative aspect-[4/3] overflow-hidden bg-surface">
                <img
                  src={m.img}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                />
                <span
                  className={`absolute left-3 top-3 rounded-full px-2.5 py-1 mono text-[9px] uppercase tracking-[0.2em] backdrop-blur ${m.shop ? "bg-accent text-white" : "bg-black/60 text-white"}`}
                >
                  {m.shop ? "In the shop" : "Format"}
                </span>
              </div>
              <div className="p-6 flex flex-1 flex-col">
                <h3 className="text-lg font-semibold text-white">{m.name}</h3>
                <p className="mt-2 text-sm text-muted-foreground flex-1">{m.how}</p>
                <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2">
                  <button
                    type="button"
                    onClick={() => sc.goto({ zone: m.zone })}
                    className="mono text-[10px] uppercase tracking-[0.18em] text-primary hover:underline underline-offset-4"
                  >
                    See it on the shelf →
                  </button>
                  {m.shop && (
                    <a
                      href={m.shop}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
                    >
                      Buy it ↗
                      <span className="sr-only"> (opens the MEDIALIFE shop in a new tab)</span>
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── 04 · VENUES ─────────────────────────── */
const P = "/medialife/activated-retail/page";
const VENUES = [
  {
    id: "retail" as const,
    t: "Store aisle",
    b: "An endcap in specialty or mass retail. Display, sell and measure in one place.",
    img: `${P}/venue-retail.webp`,
  },
  {
    id: "popup" as const,
    t: "Pop-up shop",
    b: "Build a limited-time store around a drop. The fixture is the centrepiece.",
    img: `${P}/venue-popup.webp`,
  },
  {
    id: "convention" as const,
    t: "Convention booth",
    b: "Stand out on the show floor. Fans tap merch in line, and every scan counts.",
    img: `${P}/venue-convention.webp`,
  },
];
function Venues() {
  const sc = useShowcase();
  return (
    <section id="venues" aria-labelledby="venues-title" className={SECTION}>
      <div>
        <SectionHead
          id="venues-title"
          hue="blue"
          eyebrow="Anywhere fans gather"
          title={
            <>
              One fixture. <span className={TEXT.blue}>Any floor.</span>
            </>
          }
          lead="The same modular unit stands in a store, anchors a pop-up or becomes a convention booth. Pick one to see it there."
        />
        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {VENUES.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => sc.goto({ venue: v.id, view: "aisle" })}
                aria-pressed={sc.state.venue === v.id}
                className={`${CARD} group block w-full overflow-hidden text-left transition-colors hover:border-white/25 aria-pressed:border-primary`}
              >
                <div className="aspect-video overflow-hidden">
                  <img
                    src={v.img}
                    alt={`The fixture as a ${v.t.toLowerCase()}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">{v.t}</h3>
                    <span className="mono text-[10px] uppercase tracking-[0.18em] text-primary">
                      See it →
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{v.b}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className={`mt-6 ${EYEBROW}`}>
          Also: tour merch tables · flagship stores · festivals and venues
        </p>
      </div>
    </section>
  );
}

/* ─────────────────────────── 05 · YOUR IP ─────────────────────────── */
function YourIP() {
  const sc = useShowcase();
  const input = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const take = (f: File | undefined | null) => {
    setErr(null);
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) {
      setErr("Use a PNG, JPG, WebP or GIF image.");
      return;
    }
    if (f.size > 30e6) {
      setErr("That image is over 30 MB. Try a smaller one.");
      return;
    }
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
    if (!name)
      setName(
        f.name
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/[-_]+/g, " ")
          .slice(0, 28),
      );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      input.current?.click();
      return;
    }
    setBusy(true);
    sc.customIP(file, name);
  };
  const result = sc.ip;
  useEffect(() => {
    if (result) setBusy(false);
  }, [result]);

  return (
    <section id="your-ip" aria-labelledby="ip-title" className={SECTION}>
      <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
        <Reveal className="lg:col-span-5">
          <Eyebrow hue="magenta">Put your IP on it</Eyebrow>
          <h2 id="ip-title" className="mt-5 display text-[clamp(30px,3.4vw,54px)]">
            Your IP on the fixture, <span className={TEXT.magenta}>right now.</span>
          </h2>
          <p className="mt-6 text-muted-foreground lg:text-lg">
            Drop in key art. The towers, screens and lights re-skin around it in seconds. Your image
            stays on this device: nothing is uploaded.
          </p>
        </Reveal>
        <form onSubmit={submit} className={`${CARD} p-6 sm:p-8 lg:col-span-7`}>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              take(e.dataTransfer.files?.[0]);
            }}
            className="relative grid min-h-[200px] cursor-pointer place-items-center overflow-hidden rounded-[18px] border border-dashed border-white/20 transition hover:border-primary"
          >
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => take(e.target.files?.[0])}
            />
            {preview ? (
              <img
                src={preview}
                alt="Your key art"
                className="absolute inset-0 h-full w-full object-cover opacity-80"
              />
            ) : (
              <span className="px-6 text-center">
                <span className="block text-lg font-medium">Drop key art here</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  or <u>choose a file</u> · PNG, JPG or WebP · landscape works best
                </span>
              </span>
            )}
          </label>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <label className="flex-1">
              <span className="sr-only">Your IP's name</span>
              <input
                type="text"
                value={name}
                maxLength={28}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your IP's name"
                className="w-full rounded-full border border-white/15 bg-black/40 px-5 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="btn-pill btn-solid justify-center px-6 py-3 text-sm font-medium disabled:opacity-60"
            >
              {busy ? "Re-skinning…" : file ? "Re-skin the fixture" : "Choose key art"}
            </button>
          </div>
          <p className="mt-4 min-h-5 text-sm" role="status" aria-live="polite">
            {err ? (
              <span className="text-destructive">{err}</span>
            ) : result?.ok ? (
              <span>
                {result.name} is on the fixture above.{" "}
                <Link to="/contact" className="text-primary underline underline-offset-4">
                  Want the real one? Book a call →
                </Link>
              </span>
            ) : result && !result.ok ? (
              <span className="text-destructive">{result.message}</span>
            ) : null}
          </p>
        </form>
      </div>
    </section>
  );
}

/* ─────────────────────────── 06 · BENEFITS ─────────────────────────── */
const BENEFITS = [
  {
    t: "New merch revenue",
    b: "Activated products sell on something fans can't get anywhere else: the experience inside.",
  },
  {
    t: "First-party fan data",
    b: "Scans, repeat visits and time spent, by product, place and hour. Yours, not a platform's.",
  },
  {
    t: "Always-fresh drops",
    b: "Swap graphics, rewards and collections without rebuilding the fixture.",
  },
  {
    t: "A bridge to your world",
    b: "Every product links to your game, show, store or community, one tap away.",
  },
  {
    t: "Proof, not promises",
    b: "A live dashboard from day one and a clear read at the end of every campaign.",
  },
];
function Benefits() {
  const stats = PROOF_KEYS.map((k) => PERFORMANCE.find((p) => p.l === k)).filter(
    (s): s is (typeof PERFORMANCE)[number] => !!s,
  );
  return (
    <section id="benefits" aria-labelledby="benefits-title" className={SECTION}>
      <SectionHead
        id="benefits-title"
        hue="blue"
        eyebrow="What IP holders get"
        title={
          <>
            More than a display. <span className={TEXT.blue}>A channel you own.</span>
          </>
        }
      />
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {BENEFITS.map((b, i) => (
          <Reveal as="li" key={b.t} delay={i * 60} className={`${CARD} p-6`}>
            <h3 className="font-semibold text-white">{b.t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{b.b}</p>
          </Reveal>
        ))}
      </ul>

      {/* proof from the field */}
      <div id="proof" className="mt-16 scroll-mt-24">
        <h3 className={EYEBROW}>Proven on the floor</h3>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.l} className={`${CARD} p-5 sm:p-6`}>
              <CountUp
                value={s.v}
                className={`display block text-[clamp(26px,2.6vw,40px)] ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
              />
              <p className="mt-2 text-sm text-white/85">{s.l}</p>
            </div>
          ))}
        </div>
        <p className={`mt-3 ${EYEBROW} text-[9px]`}>
          Ranges across selected deployments, not a single campaign
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          <div className={`${CARD} p-6 lg:col-span-8`}>
            <p className={`${EYEBROW} text-[9px]`}>
              Unique interactions per activated retail unit · Netflix / Sakamoto Days
            </p>
            <ul className="mt-5 grid gap-4 sm:grid-cols-3">
              {RETAIL_UNITS.map((u, i) => (
                <li key={u.name}>
                  <CountUp
                    value={u.v}
                    className={`display block text-3xl ${i % 2 === 0 ? TEXT.blue : TEXT.magenta}`}
                  />
                  <div className="mt-1 text-sm text-white">{u.name}</div>
                  <div className={`${EYEBROW} text-[9px]`}>{u.city}</div>
                </li>
              ))}
            </ul>
          </div>
          <a
            href={AWARD.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${CARD} flex flex-col justify-between p-6 transition-colors hover:border-white/25 lg:col-span-4`}
          >
            <span className={`${EYEBROW} text-[9px]`}>
              {AWARD.year} · {AWARD.category}
            </span>
            <span className="mt-6 display text-2xl">
              <span className={TEXT.magenta}>{AWARD.tier}</span> {AWARD.name}
            </span>
            <span className="mt-4 text-sm text-muted-foreground">
              See the winners ↗<span className="sr-only"> (opens in a new tab)</span>
            </span>
          </a>
        </div>
        <div className="mt-8">
          <PillLink to="/case-studies" variant="glass">
            Read the case studies
          </PillLink>
        </div>
      </div>
    </section>
  );
}

/* proof figures shown under the benefits */
const PROOF_KEYS = [
  "unique interactions per activated retail unit",
  "interaction rate",
  "repeat interactions per activated unit",
  "attendees engaging at Anime NYC",
];
/* ─────────────────────────── 09 · FAQ ─────────────────────────── */
const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Do fans need an app?",
    a: "No. A tap (NFC) or a scan (QR) opens the experience in the phone's browser, on iPhone and Android.",
  },
  {
    q: "Can it carry our IP instead of MEDIALIFE's?",
    a: "Yes. The graphics, lights, merch, rewards and the experience itself all re-skin. Try it above with your own key art.",
  },
  {
    q: "Where can it go?",
    a: "Store aisles, pop-up shops, convention booths and live events. It is modular, so the same unit moves between them.",
  },
  {
    q: "What data do we get?",
    a: "Scans, repeat interactions, time spent and outbound clicks, by product, venue and hour, in a live dashboard.",
  },
  {
    q: "Do we need merch already?",
    a: "No. We design and produce activated merch with you, or activate products you already sell.",
  },
  {
    q: "I'm a creator, not a studio. Can I do this?",
    a: (
      <>
        Yes. Creators join through the{" "}
        <Link to="/creator-hub" className="text-primary underline underline-offset-4">
          {HUB.name}
        </Link>
        : we design, produce and ship activated merch with you, and you track it all live.
      </>
    ),
  },
  {
    q: "What does it cost?",
    a: "It depends on the formats, how many units and where they go. Book a call and we'll scope it with you.",
  },
];
function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className={SECTION}>
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Eyebrow hue="magenta">Questions</Eyebrow>
          <h2 id="faq-title" className="mt-5 display text-[clamp(30px,3.4vw,54px)]">
            Good to <span className={TEXT.magenta}>know.</span>
          </h2>
        </div>
        <div className="grid gap-3 lg:col-span-8">
          {FAQ.map((f) => (
            <details key={f.q} className={`${CARD} group px-6`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-semibold text-white sm:text-lg [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 text-primary transition-transform group-open:rotate-45"
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
function FinalCta() {
  return (
    <CtaBand
      id="retail-cta"
      hue="blue"
      eyebrow="Book a call"
      title={
        <>
          Get your merch activated. <span className="text-primary">We build the rest.</span>
        </>
      }
      lead="Tell us about your IP, your fans and where you want to show up. We'll scope the merch, the fixture and the experience with you."
      actions={
        <>
          <PillLink to="/contact">Book a call</PillLink>
          <PillLink href={SHOP_URL} external variant="glass">
            Shop activated merch
          </PillLink>
        </>
      }
    />
  );
}
