import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, CheckCircle2, CircleDot, Clock, Factory } from "lucide-react";

import {
  KeyValues,
  PageHeader,
  Panel,
  Pill,
  Section,
  Stat,
  StageBar,
} from "@/components/portal/kit";
import {
  ACTIVE,
  ACTIVITY,
  COMMERCIAL_MEASURES,
  ENGAGEMENT_MEASURES,
  PROGRAM,
  REVIEW,
  compact,
  shortDate,
} from "@/lib/roblox-portal";

export const Route = createFileRoute("/roblox/portal/")({
  component: PortalHome,
});

/** The four steps between applying and a build starting, from the onboarding flow. */
const ONBOARDING = [
  { day: "Day 0", label: "Submit", body: "Four steps, about four minutes." },
  { day: "Day 1–2", label: "Qualify", body: "A named specialist inside 48 hours." },
  { day: "Day 3–5", label: "Scope", body: "Products, how it opens, reward." },
  { day: "Day 6–10", label: "Sign", body: "Agreement, then both tracks open." },
];

const ACTIVITY_ICON = {
  milestone: BadgeCheck,
  approval: CheckCircle2,
  data: CircleDot,
  production: Factory,
} as const;

function PortalHome() {
  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden border-b border-border">
        {/* Until the content box itself is wide enough, the art is a banner ABOVE
            the copy rather than behind it.
            The scrim is horizontal, so it only protects legibility while the
            box is wide enough to keep the copy over the artwork's dark left
            third; narrower than that the crop centres on the product and the
            text lands on it. Darkening it enough to fix that would hide the product the
            image exists to show, so the two get their own space instead. */}
        <picture className="block @5xl/inset:absolute @5xl/inset:inset-0 @5xl/inset:-z-10">
          <source srcSet="/roblox/portal/img/hero.webp" type="image/webp" />
          <img
            src="/roblox/portal/img/hero.jpg"
            alt="A stylised game world on the left, light trails passing through a glowing portal, and blank physical merchandise on the right — a t-shirt carrying a dashed 'your IP here' safe-area placeholder, a keychain and a folded hoodie."
            width={1920}
            height={1074}
            className="aspect-[16/9] max-h-[44vh] w-full object-cover @5xl/inset:aspect-auto @5xl/inset:max-h-none @5xl/inset:h-full"
            fetchPriority="high"
          />
        </picture>
        <div
          aria-hidden
          className="hidden @5xl/inset:absolute @5xl/inset:inset-0 @5xl/inset:-z-10 @5xl/inset:block"
          style={{
            background:
              "linear-gradient(90deg, var(--color-background) 8%, color-mix(in srgb, var(--color-background) 72%, transparent) 46%, transparent 78%)",
          }}
        />

        <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-xl">
            <Pill tone="live">Licensing secured · pilot live</Pill>
            <h1 className="mt-5 text-4xl font-medium tracking-tight text-balance md:text-5xl">
              Bring {ACTIVE.property} to the <span className="ember-text">physical world</span>.
            </h1>
            <p className="mt-5 text-muted-foreground md:text-lg">
              Your property is live in commerce validation. Four products, an activation in every
              unit, and a measured path back into the experience — with{" "}
              {REVIEW.totalDays - REVIEW.dayOf} days left before the program review.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/roblox/portal/performance"
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_40px_-12px_var(--color-glow)] transition-transform hover:scale-[1.02]"
                style={{ background: "var(--gradient-ember-btn)" }}
              >
                View performance <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                to="/roblox/portal/apply"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-5 py-2.5 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
              >
                Submit another property
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* WHERE THE PROPERTY SITS */}
      <Section
        title={`${ACTIVE.property} is in ${PROGRAM.stages.find((s) => s.id === ACTIVE.stage)?.name.toLowerCase()}`}
        actions={
          <Link
            to="/roblox/portal/status"
            className="mono inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
          >
            Full status <ArrowRight className="size-3" aria-hidden />
          </Link>
        }
      >
        <StageBar stage={ACTIVE.stage} progress={ACTIVE.stageProgress} />
      </Section>

      {/* THE TWO FAMILIES OF MEASURES */}
      <Section
        title="How the pilot is performing"
        actions={
          <Link
            to="/roblox/portal/performance"
            className="mono inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
          >
            All measures <ArrowRight className="size-3" aria-hidden />
          </Link>
        }
        className="border-t border-border"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            COMMERCIAL_MEASURES[2],
            COMMERCIAL_MEASURES[3],
            ENGAGEMENT_MEASURES[2],
            ENGAGEMENT_MEASURES[5],
          ].map((m) => (
            <Stat key={m.id} label={m.label} value={m.value} delta={m.delta} hint={m.hint} />
          ))}
        </div>
      </Section>

      <div className="grid gap-0 border-t border-border lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ACTIVITY */}
        <Section title="Recent activity" className="lg:border-r lg:border-border">
          <ol className="space-y-1">
            {ACTIVITY.map((a) => {
              const Icon = ACTIVITY_ICON[a.kind];
              return (
                <li
                  key={a.id}
                  className="flex gap-3.5 rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-white/[0.02]"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border border-border bg-surface text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="text-sm font-medium">{a.title}</span>
                      <span className="mono text-[10px] tracking-wider text-muted-foreground uppercase">
                        {a.when}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        {/* AT A GLANCE + THE PATH IN */}
        <div>
          <Section title="At a glance">
            <Panel className="p-4" glow>
              <KeyValues
                rows={[
                  ["Property", ACTIVE.property],
                  ["Studio", ACTIVE.studio],
                  ["Monthly visits", compact(ACTIVE.monthlyVisits)],
                  ["SKUs in program", String(ACTIVE.skus)],
                  ["Live since", ACTIVE.liveSince ? shortDate(ACTIVE.liveSince) : "—"],
                  [
                    "Review window",
                    <span key="w" className="inline-flex items-center gap-2">
                      <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                      Day {REVIEW.dayOf} of {REVIEW.totalDays}
                    </span>,
                  ],
                ]}
              />
            </Panel>
          </Section>

          <Section title="Adding another property?">
            <ol className="space-y-2">
              {ONBOARDING.map((o) => (
                <li key={o.day} className="flex items-baseline gap-3 text-sm">
                  <span className="mono w-16 shrink-0 text-[10px] tracking-[0.1em] text-primary uppercase">
                    {o.day}
                  </span>
                  <span className="font-medium">{o.label}</span>
                  <span className="min-w-0 text-muted-foreground">{o.body}</span>
                </li>
              ))}
            </ol>
            <Link
              to="/roblox/portal/apply"
              className="mono mt-5 inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
            >
              Start an application <ArrowRight className="size-3" aria-hidden />
            </Link>
          </Section>
        </div>
      </div>
    </>
  );
}
