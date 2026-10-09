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

const EYEBROW = "mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground";
const SECTION = "scroll-mt-20 border-b border-border";
const WRAP = "w-full px-6 sm:px-8 lg:px-16";

function ProgramPage() {
  return (
    <ShowcaseProvider>
      <Hero />
      <HowItWorks />
      <Anatomy />
      <Merch />
      <ForCreators />
      <Venues />
      <YourIP />
      <Benefits />
      <Proof />
      <Process />
      <Faq />
      <FinalCta />
    </ShowcaseProvider>
  );
}

/* ─────────────────────────── HERO + LIVE SHOWCASE ─────────────────────────── */
function Hero() {
  const sc = useShowcase();
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
      <div className={`relative ${WRAP} pt-14 pb-10`}>
        <div className="flex items-center gap-3 mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-accent animate-pulse-glow" />
          Activated Retail Program
        </div>
        <div className="mt-7 grid gap-8 lg:grid-cols-12 lg:items-end">
          <h1 className="lg:col-span-8 text-[2.1rem] sm:text-5xl lg:text-[4.1rem] font-medium tracking-tight leading-[0.98] text-balance">
            Get your merch activated, and we'll build <span className="ember-text">this.</span>
          </h1>
          <div className="lg:col-span-4">
            <p className="text-muted-foreground text-lg">
              A branded retail fixture where every product opens a digital experience. Fans tap,
              play and unlock. You see every scan.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/contact"
                className="group btn-pill btn-ember px-6 py-3.5 mono text-xs uppercase tracking-[0.18em] font-medium"
              >
                Book a call
                <span className="transition-transform group-hover:translate-x-1" aria-hidden>
                  →
                </span>
              </Link>
              <button
                type="button"
                onClick={() => sc.tour()}
                className="btn-pill btn-ember-outline px-6 py-3.5 mono text-xs uppercase tracking-[0.18em]"
              >
                Take the tour
              </button>
            </div>
          </div>
        </div>
      </div>

      <div id="showcase" className={`relative ${WRAP} pb-6 scroll-mt-24`}>
        <ShowcaseStage />
        <ShowcaseBar />
      </div>
    </section>
  );
}

function ShowcaseBar() {
  const sc = useShowcase();
  const { themes, theme, venue } = sc.state;
  const btn =
    "inline-flex items-center gap-2 border border-border px-4 py-2.5 text-sm hover:border-primary hover:text-primary transition";
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
    t: "Fans tap, play, unlock",
    b: "One tap opens a game, an AR moment or a reward in the browser. Nothing to download.",
  },
  {
    t: "You see every scan",
    b: "A live dashboard reports scans, plays and sales by product, place and hour.",
  },
];
function HowItWorks() {
  return (
    <section id="how" className={SECTION}>
      <div className={`${WRAP} py-20`}>
        <div className={EYEBROW}>/ 01 — How it works</div>
        <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance max-w-3xl">
          From merch to <span className="ember-text">measured</span>, in four steps.
        </h2>
        <ol className="mt-12 grid gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.t} className="bg-background p-7 lg:p-8">
              <div className="mono text-[11px] text-primary">0{i + 1}</div>
              <h3 className="mt-6 text-xl font-medium">{s.t}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{s.b}</p>
            </li>
          ))}
        </ol>
      </div>
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
    <section id="fixture" className={SECTION}>
      <div className={`${WRAP} py-20 grid gap-12 lg:grid-cols-12`}>
        <div className="lg:col-span-4">
          <div className={EYEBROW}>/ 02 — Inside the fixture</div>
          <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance">
            Every surface <span className="ember-text">earns its place.</span>
          </h2>
          <p className="mt-6 text-muted-foreground">
            Pick a part and the camera flies to it in the showcase above.
          </p>
        </div>
        <ul className="lg:col-span-8 grid gap-px bg-border border border-border sm:grid-cols-2">
          {PARTS.map((p) => (
            <li key={p.t} className="bg-background">
              <button
                type="button"
                onClick={() => {
                  setOn(p.t);
                  sc.goto(p.go.mode ? p.go : { mode: "explore", ...p.go });
                }}
                aria-pressed={on === p.t}
                className="group w-full text-left p-7 transition hover:bg-secondary aria-pressed:bg-secondary"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-lg font-medium group-hover:text-primary transition-colors">
                    {p.t}
                  </h3>
                  <span className="mono text-[10px] uppercase tracking-[0.18em] text-primary shrink-0 pt-1">
                    Show me →
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{p.b}</p>
                <div className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  {p.spec}
                </div>
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
    how: "An NFC chip in the base unlocks an AR moment and a digital twin.",
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
    <section id="merch" className={SECTION}>
      <div className={`${WRAP} py-20`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className={EYEBROW}>/ 03 — The activated merch</div>
            <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance">
              Real drops on the shelf. <span className="ember-text">Every one plays back.</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
              Three are in our shop today. The rest are formats we produce for your IP.
            </p>
          </div>
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[10px] uppercase tracking-[0.2em] text-primary border-b border-primary pb-1"
          >
            Shop activated merch ↗<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <ul className="mt-12 grid gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-3">
          {MERCH.map((m) => (
            <li key={m.name} className="bg-background flex flex-col">
              <div className="relative aspect-[4/3] overflow-hidden bg-surface">
                <img
                  src={m.img}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 hover:scale-105"
                />
                <span
                  className={`absolute top-3 left-3 mono text-[9px] uppercase tracking-[0.2em] px-2 py-1 backdrop-blur ${m.shop ? "bg-accent/90 text-accent-foreground" : "bg-background/80"}`}
                >
                  {m.shop ? "In the shop" : "Format"}
                </span>
              </div>
              <div className="p-6 flex flex-1 flex-col">
                <h3 className="text-lg font-medium">{m.name}</h3>
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

/* ─────────────────────────── FOR CREATORS ─────────────────────────── */
function ForCreators() {
  return (
    <section id="creators" className={`${SECTION} bg-surface`}>
      <div className={`${WRAP} py-12 grid gap-6 lg:grid-cols-12 lg:items-center`}>
        <div className="lg:col-span-8">
          <div className={EYEBROW}>/ For creators</div>
          <h2 className="mt-3 text-2xl md:text-3xl font-medium tracking-tight text-balance">
            Are you a creator? <span className="ember-text">There's a hub for that.</span>
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            We design, produce and fulfil activated merch with you. The {HUB.name} shows every
            stage, every order and your earnings, live.
          </p>
        </div>
        <div className="lg:col-span-4 flex flex-wrap gap-3 lg:justify-end">
          <Link
            to="/creator-hub"
            className="group btn-pill btn-ember px-6 py-3.5 mono text-xs uppercase tracking-[0.18em] font-medium"
          >
            Explore the {HUB.name}
            <span className="transition-transform group-hover:translate-x-1" aria-hidden>
              →
            </span>
          </Link>
          <a
            href={`${HUB.base}/join`}
            className="btn-pill btn-ember-outline px-6 py-3.5 mono text-xs uppercase tracking-[0.18em]"
          >
            Apply
          </a>
        </div>
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
    <section id="venues" className={SECTION}>
      <div className={`${WRAP} py-20`}>
        <div className="max-w-3xl">
          <div className={EYEBROW}>/ 04 — Anywhere fans gather</div>
          <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance">
            One fixture. <span className="ember-text">Any floor.</span>
          </h2>
          <p className="mt-5 text-muted-foreground">
            The same modular unit stands in a store, anchors a pop-up or becomes a convention booth.
            Pick one to see it there.
          </p>
        </div>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {VENUES.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => sc.goto({ venue: v.id, view: "aisle" })}
                aria-pressed={sc.state.venue === v.id}
                className="group block w-full text-left border border-border bg-background hover:border-primary transition aria-pressed:border-primary"
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
                    <h3 className="text-lg font-medium">{v.t}</h3>
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
        <p className="mt-6 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
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
    <section id="your-ip" className={`${SECTION} bg-surface`}>
      <div className={`${WRAP} py-20 grid gap-12 lg:grid-cols-12 lg:items-center`}>
        <div className="lg:col-span-5">
          <div className={EYEBROW}>/ 05 — Put your IP on it</div>
          <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance">
            See your IP on the fixture, <span className="ember-text">right now.</span>
          </h2>
          <p className="mt-6 text-muted-foreground">
            Drop in key art. The towers, screens and lights re-skin around it in seconds. Your image
            stays on this device: nothing is uploaded.
          </p>
        </div>
        <form
          onSubmit={submit}
          className="lg:col-span-7 border border-border bg-background p-6 sm:p-8"
        >
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              take(e.dataTransfer.files?.[0]);
            }}
            className="relative grid min-h-[200px] cursor-pointer place-items-center overflow-hidden border border-dashed border-border hover:border-primary transition"
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
                className="w-full border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="btn-pill btn-ember justify-center px-6 py-3 mono text-xs uppercase tracking-[0.18em] font-medium disabled:opacity-60"
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
  return (
    <section id="benefits" className={SECTION}>
      <div className={`${WRAP} py-20`}>
        <div className={EYEBROW}>/ 06 — What IP holders get</div>
        <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance max-w-3xl">
          More than a display. <span className="ember-text">A channel you own.</span>
        </h2>
        <ul className="mt-12 grid gap-px bg-border border border-border sm:grid-cols-2 lg:grid-cols-5">
          {BENEFITS.map((b) => (
            <li key={b.t} className="bg-background p-7">
              <h3 className="text-lg font-medium">{b.t}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{b.b}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ─────────────────────────── 07 · PROOF ─────────────────────────── */
const PROOF_KEYS = [
  "unique interactions per activated retail unit",
  "interaction rate",
  "repeat interactions per activated unit",
  "attendees engaging at Anime NYC",
];
function Proof() {
  const stats = PROOF_KEYS.map((k) => PERFORMANCE.find((p) => p.l === k)).filter(
    (s): s is (typeof PERFORMANCE)[number] => !!s,
  );
  return (
    <section id="proof" className={`${SECTION} bg-surface`}>
      <div className={`${WRAP} py-20`}>
        <div className={EYEBROW}>/ 07 — Proven on the floor</div>
        <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance max-w-3xl">
          Activated formats already <span className="ember-text">move fans.</span>
        </h2>
        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
          {stats.map((s) => (
            <div key={s.l} className="bg-background p-6">
              <CountUp
                value={s.v}
                className="block text-2xl md:text-3xl font-medium tracking-tight ember-text"
              />
              <div className="mt-2 text-xs text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Ranges across selected deployments · not a single campaign
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 border border-border bg-background p-6">
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Unique interactions per activated retail unit · Netflix / Sakamoto Days
            </div>
            <ul className="mt-4 grid gap-px bg-border border border-border sm:grid-cols-3">
              {RETAIL_UNITS.map((u) => (
                <li key={u.name} className="bg-background p-4">
                  <CountUp value={u.v} className="block text-2xl font-medium ember-text" />
                  <div className="mt-1 text-sm">{u.name}</div>
                  <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {u.city}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <a
            href={AWARD.href}
            target="_blank"
            rel="noopener noreferrer"
            className="lg:col-span-4 border border-border bg-background p-6 hover:border-primary transition flex flex-col justify-between"
          >
            <div className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {AWARD.year} · {AWARD.category}
            </div>
            <div className="mt-6 text-2xl font-medium">
              <span className="ember-text">{AWARD.tier}</span> {AWARD.name}
            </div>
            <div className="mt-4 mono text-[10px] uppercase tracking-[0.18em] text-primary">
              See the winners ↗<span className="sr-only"> (opens in a new tab)</span>
            </div>
          </a>
        </div>
        <Link
          to="/case-studies"
          className="mt-8 inline-block mono text-[10px] uppercase tracking-[0.2em] text-primary border-b border-primary pb-1"
        >
          Read the case studies →
        </Link>
      </div>
    </section>
  );
}

/* ─────────────────────────── 08 · PROCESS ─────────────────────────── */
const PROCESS = [
  { t: "Discover", b: "Your IP, fans, venues and goals." },
  { t: "Design", b: "Merch, activations and fixture graphics." },
  { t: "Produce", b: "Manufacture, program every tag, build the unit." },
  { t: "Deploy", b: "Install in stores, pop-ups or on the show floor." },
  { t: "Measure + refresh", b: "Live dashboard, then the next drop." },
];
function Process() {
  return (
    <section id="process" className={SECTION}>
      <div className={`${WRAP} py-20`}>
        <div className={EYEBROW}>/ 08 — How we work</div>
        <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight text-balance max-w-3xl">
          Brief to floor, <span className="ember-text">one team.</span>
        </h2>
        <ol className="mt-12 grid gap-8 md:grid-cols-5">
          {PROCESS.map((p, i) => (
            <li key={p.t} className="relative border-t border-border pt-6">
              <span
                className="absolute -top-[5px] left-0 h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--gradient-ember)" }}
                aria-hidden
              />
              <div className="mono text-[11px] text-muted-foreground">0{i + 1}</div>
              <h3 className="mt-3 text-lg font-medium">{p.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.b}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

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
    <section id="faq" className={SECTION}>
      <div className={`${WRAP} py-20 grid gap-12 lg:grid-cols-12`}>
        <div className="lg:col-span-4">
          <div className={EYEBROW}>/ 09 — Questions</div>
          <h2 className="mt-4 text-3xl md:text-5xl font-medium tracking-tight">
            Good to <span className="ember-text">know.</span>
          </h2>
        </div>
        <div className="lg:col-span-8 border-t border-border">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="mono text-primary transition-transform group-open:rotate-45"
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
    <section className="relative overflow-hidden border-b border-border">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-25"
        style={{ background: "var(--gradient-ember)" }}
        aria-hidden
      />
      <div className={`relative ${WRAP} py-24 text-center`}>
        <h2 className="mx-auto max-w-4xl text-4xl md:text-6xl font-medium tracking-tight text-balance">
          Get your merch activated, and we'll build <span className="ember-text">this.</span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
          Tell us about your IP, your fans and where you want to show up. We'll scope the merch, the
          fixture and the experience with you.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            to="/contact"
            className="group btn-pill btn-ember px-7 py-4 mono text-xs uppercase tracking-[0.2em] font-medium"
          >
            Book a call
            <span className="transition-transform group-hover:translate-x-1" aria-hidden>
              →
            </span>
          </Link>
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-pill btn-ember-outline px-7 py-4 mono text-xs uppercase tracking-[0.2em]"
          >
            Shop activated merch <span aria-hidden>↗</span>
            <span className="sr-only">(opens the MEDIALIFE shop in a new tab)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
