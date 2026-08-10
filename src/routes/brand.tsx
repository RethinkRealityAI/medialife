import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/site/Logo";

export const Route = createFileRoute("/brand")({
  head: () => ({
    meta: [
      { title: "Brand Guidelines — MediaLife.AI" },
      {
        name: "description",
        content:
          "Official MediaLife.AI brand system: logo lockups, color, typography, tone of voice and logo usage.",
      },
      { property: "og:title", content: "Brand Guidelines — MediaLife.AI" },
      {
        property: "og:description",
        content: "Logos, colour, type and tone for the MediaLife.AI brand.",
      },
    ],
  }),
  component: BrandPage,
});

const COLORS: { name: string; token: string; hex: string; role: string; bg: string; fg: string }[] =
  [
    {
      name: "Ember Black",
      token: "--background",
      hex: "#0A0A12",
      role: "Primary surface",
      bg: "#0A0A12",
      fg: "#fff",
    },
    {
      name: "Signal White",
      token: "--foreground",
      hex: "#F4F4F8",
      role: "Primary text",
      bg: "#F4F4F8",
      fg: "#0A0A12",
    },
    {
      name: "Field Blue",
      token: "--primary",
      hex: "#3FA8E8",
      role: "Primary brand",
      bg: "#3FA8E8",
      fg: "#0A0A12",
    },
    {
      name: "Pulse Magenta",
      token: "--accent",
      hex: "#E8409A",
      role: "Accent / emphasis",
      bg: "#E8409A",
      fg: "#0A0A12",
    },
    {
      name: "Stack Slate",
      token: "--secondary",
      hex: "#1F1F2A",
      role: "Cards & surfaces",
      bg: "#1F1F2A",
      fg: "#F4F4F8",
    },
    {
      name: "Edge Border",
      token: "--border",
      hex: "#2A2A38",
      role: "Dividers / outlines",
      bg: "#2A2A38",
      fg: "#F4F4F8",
    },
  ];

const TONE = [
  { do: "Confident", dont: "Boastful", note: "We've shipped at scale. State it plainly." },
  { do: "Technical", dont: "Jargon-heavy", note: "Name the tech. Skip the buzzwords." },
  { do: "Cinematic", dont: "Theatrical", note: "Big moments, lean copy." },
  { do: "Human", dont: "Corporate", note: "We build for fans. Sound like one." },
];

const USAGE_DO = [
  "Maintain clear-space equal to the height of the icon ring on all sides.",
  "Use the gradient mark on dark surfaces and the monochrome mark on photography.",
  "Pair the wordmark with the icon at all sizes above 24px.",
];
const USAGE_DONT = [
  "Don't rotate, skew or recolor the icon outside the brand palette.",
  "Don't place the gradient mark on low-contrast backgrounds.",
  "Don't reflow the wordmark — `MediaLife.AI` is one lockup.",
];

function BrandPage() {
  return (
    <>
      {/* HERO */}
      <section className="relative border-b border-border overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="absolute inset-0" style={{ background: "var(--gradient-radial)" }} />
        <div className="relative mx-auto max-w-[1400px] px-6 pt-24 pb-20">
          <div className="mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            / Brand Guidelines · v2.0
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-medium tracking-tight text-balance leading-[0.95]">
            The system behind <span className="ember-text">the signal</span>.
          </h1>
          <p className="mt-8 max-w-2xl text-lg text-muted-foreground">
            MediaLife.AI is a precision system: one mark, two colours, one voice. These guidelines
            define how the brand is built, spoken and applied across every surface a fan, partner or
            press contact will meet it on.
          </p>
        </div>
      </section>

      {/* LOGO LOCKUPS */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <SectionHead
            num="01"
            kicker="Identity"
            title="Logo lockups"
            copy="Three approved lockups. Pick by available space, never by preference."
          />
          <div className="mt-10 grid md:grid-cols-3 gap-px bg-border border border-border">
            <LockupCell
              label="Horizontal"
              subtitle="Default · all digital nav, signatures, partner decks"
            >
              <Logo variant="horizontal" />
            </LockupCell>
            <LockupCell label="Vertical" subtitle="Stacked · square placements, merch, posters">
              <Logo variant="vertical" />
            </LockupCell>
            <LockupCell label="Icon" subtitle="Standalone mark · favicons, app icons, lens shells">
              <Logo variant="icon" />
            </LockupCell>
          </div>
        </div>
      </section>

      {/* LOGO USAGE — on black / white / colour / image */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <SectionHead
            num="02"
            kicker="Application"
            title="Logo usage"
            copy="The mark must hold its presence across every background it lands on. Use these four treatments as the canonical set."
          />

          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
            {/* On black */}
            <UsageCell tag="On Black" hex="#0A0A12" bg="#0A0A12">
              <Logo variant="horizontal" />
            </UsageCell>

            {/* On white */}
            <UsageCell tag="On White" hex="#F4F4F8" bg="#F4F4F8" dark>
              <Logo variant="horizontal" monochrome="black" />
            </UsageCell>

            {/* On brand colour */}
            <UsageCell tag="On Brand" hex="Field Blue" bg="#3FA8E8" dark>
              <Logo variant="horizontal" monochrome="white" />
            </UsageCell>

            {/* On image */}
            <UsageCell
              tag="Over Image"
              hex="Photography"
              bg='url("https://framerusercontent.com/images/AEuJBqEZaAim8bbcLp7eItF0.jpg") center/cover'
              overlay
            >
              <Logo variant="horizontal" monochrome="white" />
            </UsageCell>
          </div>

          {/* Do / Don't */}
          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border border-border">
            <div className="bg-background p-6">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary">/ Do</div>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {USAGE_DO.map((x) => (
                  <li key={x} className="flex gap-3">
                    <span className="text-primary">+</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-background p-6">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-accent">
                / Don't
              </div>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {USAGE_DONT.map((x) => (
                  <li key={x} className="flex gap-3">
                    <span className="text-accent">×</span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* COLOUR */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <SectionHead
            num="03"
            kicker="Palette"
            title="Colour system"
            copy="Six tokens. Field Blue leads, Pulse Magenta amplifies, the neutrals do everything else. No off-brand colour ever enters production."
          />
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
            {COLORS.map((c) => (
              <div key={c.name} className="bg-background overflow-hidden">
                <div className="h-32 relative" style={{ background: c.bg }}>
                  <div
                    className="absolute bottom-2 right-2 mono text-[10px] uppercase tracking-widest px-2 py-0.5 backdrop-blur"
                    style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }}
                  >
                    {c.hex}
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-base font-medium">{c.name}</h4>
                    <span className="mono text-[10px] text-muted-foreground">{c.token}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.role}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Gradient */}
          <div className="mt-8 border border-border">
            <div className="h-24" style={{ background: "var(--gradient-ember)" }} />
            <div className="p-5 flex items-baseline justify-between bg-background">
              <h4 className="text-base font-medium">Ember Gradient</h4>
              <span className="mono text-[10px] text-muted-foreground">
                --gradient-ember · 135° · Field Blue → Pulse Magenta
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <SectionHead
            num="04"
            kicker="Typography"
            title="Type system"
            copy="Two typefaces. Space Grotesk leads everything human-facing; JetBrains Mono carries data, captions and the system layer."
          />
          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border border-border">
            <div className="bg-background p-8">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / Display & body
              </div>
              <div className="mt-4 text-6xl font-medium tracking-tight">Aa</div>
              <div className="mt-6 text-2xl font-medium">Space Grotesk</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Weights 400 · 500 · 700. Used for all headlines, body copy and UI text.
              </p>
              <div className="mt-6 mono text-[10px] uppercase tracking-widest text-muted-foreground">
                abcdefghijklmnopqrstuvwxyz · 0123456789
              </div>
            </div>
            <div className="bg-background p-8">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                / Mono / system
              </div>
              <div className="mt-4 text-6xl font-medium tracking-tight mono">Aa</div>
              <div className="mt-6 text-2xl font-medium mono">JetBrains Mono</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Eyebrow labels, file numbers, data callouts and code. Always uppercase + tracked.
              </p>
              <div className="mt-6 mono text-[10px] uppercase tracking-widest text-muted-foreground">
                / 01 — system · /02 — telemetry
              </div>
            </div>
          </div>

          {/* Type scale */}
          <div className="mt-8 border border-border bg-background p-8 space-y-5">
            <ScaleRow label="Display / 72" cls="text-7xl font-medium tracking-tight">
              You'll experience it.
            </ScaleRow>
            <ScaleRow label="H1 / 48" cls="text-5xl font-medium tracking-tight">
              Augmented reality, deployed.
            </ScaleRow>
            <ScaleRow label="H2 / 32" cls="text-3xl font-medium">
              Five disciplines. One agency.
            </ScaleRow>
            <ScaleRow label="Body / 16" cls="text-base text-muted-foreground">
              MediaLife.AI is the AI Augmented Reality agency.
            </ScaleRow>
            <ScaleRow
              label="Mono / 11"
              cls="mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground"
            >
              / 01 — Captured in the wild
            </ScaleRow>
          </div>
        </div>
      </section>

      {/* TONE OF VOICE */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-[1400px] px-6 py-20">
          <SectionHead
            num="05"
            kicker="Voice"
            title="Tone of voice"
            copy="We write like we ship: precise, confident, no filler. Every sentence earns its place."
          />
          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border border-border">
            {TONE.map((t) => (
              <div key={t.do} className="bg-background p-6">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl font-medium">{t.do}</div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground line-through">
                    {t.dont}
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{t.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 grid md:grid-cols-2 gap-px bg-border border border-border">
            <div className="bg-background p-8">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-primary">
                / On brand
              </div>
              <p className="mt-4 text-lg leading-relaxed">
                "Six layers. One deployment. Fans walk away with a one-of-one moment — and you walk
                away with the data."
              </p>
            </div>
            <div className="bg-background p-8">
              <div className="mono text-[10px] uppercase tracking-[0.25em] text-accent">
                / Off brand
              </div>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground line-through decoration-accent">
                "We synergise next-generation immersive paradigms to disrupt the future of fan
                engagement at scale."
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-[1400px] px-6 py-16 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              / Brand requests
            </div>
            <h2 className="mt-3 text-3xl font-medium">
              Need assets, partner lockups, or press materials?
            </h2>
          </div>
          <a
            href="mailto:brand@medialife.ai"
            className="inline-flex items-center gap-3 bg-primary text-primary-foreground px-6 py-3.5 mono text-xs uppercase tracking-[0.2em] hover:bg-accent hover:text-accent-foreground transition"
          >
            brand@medialife.ai →
          </a>
        </div>
      </section>
    </>
  );
}

function SectionHead({
  num,
  kicker,
  title,
  copy,
}: {
  num: string;
  kicker: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="grid md:grid-cols-12 gap-8">
      <div className="md:col-span-4">
        <div className="mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          /{num} — {kicker}
        </div>
        <h2 className="mt-4 text-3xl md:text-4xl font-medium tracking-tight text-balance">
          {title}
        </h2>
      </div>
      <p className="md:col-span-8 text-muted-foreground max-w-2xl md:pt-2">{copy}</p>
    </div>
  );
}

function LockupCell({
  label,
  subtitle,
  children,
}: {
  label: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background">
      <div className="min-h-[200px] grid place-items-center p-10 border-b border-border bg-surface">
        {children}
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between">
          <h4 className="text-base font-medium">{label}</h4>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            SVG · PNG
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function UsageCell({
  tag,
  hex,
  bg,
  children,
  dark,
  overlay,
}: {
  tag: string;
  hex: string;
  bg: string;
  children: React.ReactNode;
  dark?: boolean;
  overlay?: boolean;
}) {
  return (
    <div className="bg-background">
      <div
        className="relative min-h-[200px] grid place-items-center p-10"
        style={{ background: bg }}
      >
        {overlay && <div className="absolute inset-0 bg-black/30" />}
        <div className="relative">{children}</div>
      </div>
      <div className="p-4 flex items-center justify-between">
        <div
          className="mono text-[10px] uppercase tracking-widest"
          style={{ color: dark ? undefined : undefined }}
        >
          {tag}
        </div>
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {hex}
        </div>
      </div>
    </div>
  );
}

function ScaleRow({
  label,
  cls,
  children,
}: {
  label: string;
  cls: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 gap-6 items-baseline border-b border-border pb-4 last:border-0 last:pb-0">
      <div className="col-span-3 mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className={`col-span-9 ${cls}`}>{children}</div>
    </div>
  );
}
