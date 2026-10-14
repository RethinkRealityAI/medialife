import { createFileRoute, notFound } from "@tanstack/react-router";
import { ArrowRight, Box, Check, Sparkles, Smartphone, Wand2 } from "lucide-react";
import { z } from "zod";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { kitHero, kitLogo } from "@/lib/hub/collateral";
import { HUB } from "@/lib/hub/model";
import { getPartnerLanding } from "@/lib/hub/partner.functions";
import { JOURNEY } from "@/lib/hub/partners";

// A co-branded program page partners send to creators: what activated merch
// is, how it works, proof, and the application. The partner's invite code
// rides along (?invite=), so every sign-up is credited to whoever shared it.

export const Route = createFileRoute("/with/$partnerId")({
  validateSearch: z.object({ invite: z.string().max(40).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ invite: search.invite }),
  loader: async ({ params, deps }) => {
    const d = await getPartnerLanding({ data: { id: params.partnerId, invite: deps.invite } });
    if (!d) throw notFound();
    return d;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.partner.name ?? "MEDIALIFE";
    const title = `Activated merch for creators · ${name} × MEDIALIFE`;
    const description =
      "Merch your fans can experience: tap it with a phone and something unlocks. You approve it; MEDIALIFE makes it, sells it and ships it.";
    const image = loaderData ? kitHero(loaderData.partner.kit) : undefined;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "noindex, nofollow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        ...(image ? [{ property: "og:image", content: image }] : []),
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  notFoundComponent: () => (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-center text-foreground">
      <div>
        <h1 className="text-2xl font-medium">This page isn't available</h1>
        <p className="mt-2 text-muted-foreground">
          Learn about activated merch at{" "}
          <a href="/creator-hub" className="text-primary underline">
            medialife.ai/creator-hub
          </a>
          .
        </p>
      </div>
    </main>
  ),
  component: ProgramPage,
});

const CREATOR_FAQ = [
  {
    q: "Does it cost me anything?",
    a: "No. MEDIALIFE covers design, production, the experience, the store, shipping and returns. You earn a share of every sale.",
  },
  {
    q: "What's my share?",
    a: "It's set with you and written into your agreement, which you read in the Creator Hub before you sign anything.",
  },
  {
    q: "Who owns my designs and characters?",
    a: "You do. MEDIALIFE only uses them to make and sell the products you approve.",
  },
  {
    q: "What do fans see when they tap?",
    a: "An experience that opens in their phone's browser, no app: an AR moment, a 3D scene, a video, a mini-game or a reward. It's designed with you, and it can change after launch without reprinting anything.",
  },
  {
    q: "What if a fan's phone can't tap?",
    a: "Every product also has a QR code that opens the same experience with any phone camera.",
  },
  {
    q: "How long does it take?",
    a: "Typically six to ten weeks from approval to launch, depending on the products. You see every date in the Creator Hub.",
  },
];

function ProgramPage() {
  const { partner, invite } = Route.useLoaderData();
  const join = `${HUB.base}/join${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
  const shelf = `/shelf${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
  const hero = kitHero(partner.kit);
  const kitDir = partner.kit === "snowday" ? "/partner-kit/snowday" : null;
  const style = {
    "--partner": partner.brand.accent,
    "--partner-2": partner.brand.primary,
  } as React.CSSProperties;

  return (
    <div style={style} className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/brand/medialife-lockup.webp" alt="MEDIALIFE" className="h-7 w-auto sm:h-8" />
          <span aria-hidden className="text-[var(--partner)]">
            ×
          </span>
          {kitLogo(partner.kit) ? (
            <img
              src={kitLogo(partner.kit)!.wordmark}
              alt={partner.name}
              className="h-8 w-auto sm:h-9"
            />
          ) : (
            <span className="truncate text-base font-semibold sm:text-lg">{partner.name}</span>
          )}
        </div>
        <a
          href={join}
          className="hidden h-10 shrink-0 items-center rounded-full bg-[var(--partner)] px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90 sm:inline-flex"
        >
          Apply
        </a>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <img
            src={hero}
            alt=""
            className="absolute inset-0 size-full object-cover object-[70%_center] opacity-60 sm:opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28 lg:py-36">
            <div className="max-w-xl">
              <p className="text-xs font-semibold tracking-[0.22em] text-[var(--partner)] uppercase">
                Activated merch for creators
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
                Merch your fans can <span className="text-[var(--partner)]">experience.</span>
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
                Premium merch with a tag inside. Fans tap it with their phone and something unlocks:
                a secret scene, a reward, a moment with you. You approve everything; MEDIALIFE makes
                it, sells it and ships it.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={join}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--partner)] px-6 font-semibold text-background transition-opacity hover:opacity-90"
                >
                  Apply in 10 minutes <ArrowRight className="size-4" aria-hidden />
                </a>
                <a
                  href={shelf}
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-background/40 px-6 font-medium backdrop-blur hover:bg-white/5"
                >
                  <Box className="size-4" aria-hidden /> See it in 3D
                </a>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                No upfront cost · Your IP stays yours · Nothing is made without your yes
              </p>
            </div>
          </div>
        </section>

        {/* What it is */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                The merch keeps working after it's bought.
              </h2>
              <ul className="mt-8 space-y-5">
                {[
                  {
                    icon: Smartphone,
                    t: "Tap or scan, no app",
                    b: "Every product carries an NFC tag and a QR code. The experience opens in the phone's browser.",
                  },
                  {
                    icon: Wand2,
                    t: "An experience that's yours",
                    b: "A hidden scene, AR, a mini-game, a reward, a message from you. Designed with you, and changeable after launch.",
                  },
                  {
                    icon: Sparkles,
                    t: "Fans come back to you",
                    b: "Each tap is a moment with your community, not the end of a sale.",
                  },
                ].map((x) => (
                  <li key={x.t} className="flex gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--partner)]/15">
                      <x.icon className="size-5 text-[var(--partner)]" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-medium">{x.t}</span>
                      <span className="mt-1 block text-muted-foreground">{x.b}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {kitDir ? (
              <img
                src={`${kitDir}/tap-charm.webp`}
                alt="A phone unlocking an experience from an acrylic charm"
                loading="lazy"
                className="w-full rounded-3xl border border-border object-cover lg:aspect-[4/5]"
              />
            ) : null}
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-border bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">How it works</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Five steps, all in the MEDIALIFE Creator Hub. You always know what's next.
            </p>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {JOURNEY.map((s) => (
                <li key={s.id} className="rounded-2xl border border-border bg-background/60 p-5">
                  <span className="grid size-9 place-items-center rounded-full bg-[var(--partner)] font-semibold text-background">
                    {s.n}
                  </span>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.you}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Who does what */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
          <div className="grid gap-6 lg:grid-cols-2">
            {[
              {
                title: "What MEDIALIFE does",
                items: [
                  "Designs the merch and the experience with you",
                  "Produces it and programs every tag and QR code",
                  "Runs the store, ships orders, handles returns",
                  "Shows every stage, order and payout in the hub",
                ],
              },
              {
                title: "What you do",
                items: [
                  "Share your art, or references we design from",
                  "Approve designs: nothing is made without your yes",
                  "Tell your community when it launches",
                  "Earn your share of every sale",
                ],
              },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold text-[var(--partner)]">{c.title}</h3>
                <ul className="mt-4 space-y-3">
                  {c.items.map((i) => (
                    <li key={i} className="flex gap-3">
                      <Check className="mt-0.5 size-5 shrink-0 text-[var(--partner)]" aria-hidden />
                      {i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {kitDir ? (
            <img
              src={`${kitDir}/merch-flatlay.webp`}
              alt="The activated lineup: hoodie, tee, cap, charm and stickers"
              loading="lazy"
              className="mt-10 aspect-[16/9] w-full rounded-3xl border border-border object-cover"
            />
          ) : null}
        </section>

        {/* Proof */}
        <section className="border-y border-border bg-white/[0.02]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Already proven at retail scale
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              MEDIALIFE's activated experiences have run for Netflix's Sakamoto Days (Pinnacle Award
              2025), One Piece, DC's The Dark Knight Returns and the Evade × Roblox proof of
              concept.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/partner-kit/medialife/medialife-activated-experiences.pdf"
                target="_blank"
                rel="noopener"
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 font-medium hover:bg-white/5"
              >
                See the work (PDF, scan the pages)
              </a>
              <a
                href={shelf}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-5 font-medium hover:bg-white/5"
              >
                <Box className="size-4" aria-hidden /> Try the 3D shop
              </a>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-16 sm:px-8 sm:py-24">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Questions</h2>
          <Accordion type="multiple" className="mt-6">
            {CREATOR_FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden">
          {kitDir ? (
            <img
              src={`${kitDir}/aurora-banner.webp`}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-60"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-8 sm:py-28">
            <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
              Ready when you are.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              The application takes about ten minutes. MEDIALIFE replies within two business days,
              and {partner.name} is with you the whole way.
            </p>
            <a
              href={join}
              className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--partner)] px-7 font-semibold text-background transition-opacity hover:opacity-90"
            >
              Apply now <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-8 pb-28 text-sm text-muted-foreground sm:px-8 sm:pb-8">
        <span>
          Questions? Ask your {partner.name} contact, or{" "}
          <a
            href={`mailto:${HUB.supportEmail}`}
            className="text-foreground underline underline-offset-4"
          >
            {HUB.supportEmail}
          </a>
        </span>
        <a href="/creator-hub/terms" className="hover:text-foreground">
          Program terms
        </a>
      </footer>

      {/* Phones: the apply button stays in reach. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 p-3 backdrop-blur sm:hidden"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <a
          href={join}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--partner)] font-semibold text-background"
        >
          Apply in 10 minutes <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}
