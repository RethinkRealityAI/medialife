import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  ExternalLink,
  Gift,
  Nfc,
  QrCode,
  Sparkles,
} from "lucide-react";

import {
  DateBlock,
  KeyValues,
  PageHeader,
  Panel,
  Pill,
  Section,
  StageSteps,
  type Tone,
} from "@/components/portal/kit";
import { RequirementsList } from "@/components/portal/requirements";
import {
  ACTIVATIONS,
  LAUNCH_METHODS,
  PROGRAM,
  REQUIREMENTS,
  SUBMISSIONS,
  compact,
  requirementSummary,
  shortDate,
} from "@/lib/roblox-portal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/roblox/portal/submissions/$id")({
  loader: ({ params }) => {
    const submission = SUBMISSIONS.find((s) => s.id === params.id);
    if (!submission) throw notFound();
    return {
      submission,
      activation: ACTIVATIONS[params.id] ?? null,
      requirements: REQUIREMENTS[params.id] ?? [],
    };
  },
  component: SubmissionDetail,
  notFoundComponent: () => (
    <>
      <PageHeader eyebrow="Program / My submissions" title="Not found" />
      <Section>
        <Link
          to="/roblox/portal/submissions"
          className="mono inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
        >
          <ArrowLeft className="size-3" aria-hidden /> Back to submissions
        </Link>
      </Section>
    </>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  "in-review": "In review",
  approved: "Approved",
  "needs-info": "Needs info",
};

/** Served as WebP with a JPEG fallback, like every other image in the portal. */
/**
 * WebP with a fallback for browsers that lack it. The fallback is a PNG for a
 * cut-out asset and a JPEG for a photograph — JPEG has no alpha, so serving one
 * for a cut-out would put a box of background back around the product.
 */
function Shot({
  name,
  alt,
  className,
  transparent = false,
}: {
  name: string;
  alt: string;
  className?: string;
  transparent?: boolean;
}) {
  return (
    <picture>
      <source srcSet={`/roblox/portal/img/evade/${name}.webp`} type="image/webp" />
      <img
        src={`/roblox/portal/img/evade/${name}.${transparent ? "png" : "jpg"}`}
        alt={alt}
        loading="lazy"
        className={className}
      />
    </picture>
  );
}

function SubmissionDetail() {
  const { submission: s, activation, requirements } = Route.useLoaderData();
  const need = requirements.length ? requirementSummary(requirements) : null;
  const stage = PROGRAM.stages.find((x) => x.id === s.stage);
  const launch = activation ? LAUNCH_METHODS[activation.launch] : null;
  const LaunchIcon = activation?.launch === "qr" ? QrCode : Nfc;

  return (
    <>
      <PageHeader
        eyebrow="Program / My submissions"
        title={s.property}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {need?.outstanding ? (
              <Pill tone="watch">
                {need.outstanding} {need.outstanding === 1 ? "item" : "items"} needed from you
              </Pill>
            ) : null}
            <Pill tone={s.status as Tone}>{STATUS_LABEL[s.status]}</Pill>
            <Link
              to="/roblox/portal/submissions"
              className="mono inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[11px] tracking-[0.12em] uppercase transition-colors hover:border-primary"
            >
              <ArrowLeft className="size-3" aria-hidden /> All submissions
            </Link>
          </div>
        }
      />

      {/* WHERE IT SITS */}
      <Section title={`In ${stage?.name.toLowerCase()}`} className="border-b border-border">
        <StageSteps stage={s.stage} progress={s.stageProgress} className="max-w-3xl" />
      </Section>

      {/* THE FACTS */}
      <Section className="border-b border-border">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Centred, so a property with one date does not leave a hole where
              its neighbour panel's extra rows are. */}
          <Panel className="flex flex-col justify-center p-4">
            <DateBlock iso={s.submitted} />
            {s.liveSince ? (
              <div className="mt-4 border-t border-border pt-4">
                <DateBlock iso={s.liveSince} label="Live since" />
              </div>
            ) : null}
          </Panel>
          <Panel className="p-4">
            <KeyValues
              rows={[
                ["Studio", s.studio],
                ["Genre", s.genre],
                ["Monthly visits", compact(s.monthlyVisits)],
                ["SKUs in program", s.skus ? String(s.skus) : "—"],
                ["Stage", stage?.name ?? "—"],
              ]}
            />
          </Panel>
        </div>
      </Section>

      {requirements.length ? (
        <Section title="Requirements" className="border-b border-border">
          <RequirementsList groups={requirements} />
        </Section>
      ) : null}

      {activation && launch ? (
        <>
          {/* HOW IT OPENS */}
          <Section title="Activation" className="border-b border-border">
            <div className="grid gap-3 lg:grid-cols-3">
              <Panel className="p-5">
                <span className="grid size-9 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                  <LaunchIcon className="size-4.5" aria-hidden />
                </span>
                <div className="mono mt-4 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Launch method
                </div>
                <h3 className="mt-1 text-base font-medium tracking-tight">{launch.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{launch.blurb}</p>
                <p className="mono mt-3 border-t border-border pt-3 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                  {activation.codePlacement}
                </p>
              </Panel>

              <Panel className="p-5">
                <span className="grid size-9 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
                  <Sparkles className="size-4.5" aria-hidden />
                </span>
                <div className="mono mt-4 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Attached experience
                </div>
                <h3 className="mt-1 text-base font-medium tracking-tight">
                  {activation.experience.name}
                </h3>
                <p className="mono mt-1 text-[10px] tracking-[0.1em] text-primary uppercase">
                  {activation.experience.kind}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {activation.experience.blurb}
                </p>
                {activation.experience.url ? (
                  <a
                    href={activation.experience.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mono mt-3 inline-flex items-center gap-1.5 border-t border-border pt-3 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
                  >
                    Open the experience <ExternalLink className="size-3" aria-hidden />
                  </a>
                ) : null}
              </Panel>

              <Panel className="p-5">
                <span className="grid size-9 place-items-center rounded-md border border-accent/40 bg-accent/10 text-accent">
                  <Gift className="size-4.5" aria-hidden />
                </span>
                <div className="mono mt-4 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Digital reward
                </div>
                <h3 className="mt-1 text-base font-medium tracking-tight">
                  {activation.reward.name}
                </h3>
                <p className="mono mt-1 text-[10px] tracking-[0.1em] text-accent uppercase">
                  {activation.reward.kind}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {activation.reward.blurb}
                </p>
              </Panel>
            </div>

            {/* THE FLOW, IN ORDER */}
            <Panel className="mt-3 p-5">
              <h3 className="text-sm font-medium">What a buyer actually does</h3>
              <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {activation.experience.beats.map((b, i) => (
                  <li key={b} className="relative">
                    <div className="mono text-[10px] tracking-[0.14em] text-primary">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <div className="mt-2 h-0.5 w-full rounded-full bg-primary/35" />
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{b}</p>
                  </li>
                ))}
              </ol>
            </Panel>
          </Section>

          {/* WHAT OPENS, AND WHAT THEY KEEP */}
          <Section className="border-b border-border">
            <div className="grid items-start gap-3 lg:grid-cols-2">
              <Panel className="overflow-hidden">
                {/* The art is a full-height column rather than a thumbnail with
                    dead space under it — these two cards are the payoff of the
                    whole page, so the imagery carries its own weight. */}
                <div className="flex flex-col sm:flex-row sm:items-start">
                  <div className="shrink-0 self-start sm:w-48">
                    <Shot
                      name={activation.experience.image}
                      alt={activation.experience.alt}
                      className="w-full border-b border-border object-cover sm:border-r sm:border-b-0"
                    />
                  </div>
                  <div className="min-w-0 p-5">
                    <Pill tone="primary">{activation.experience.kind}</Pill>
                    <h3 className="mt-3 text-base font-medium tracking-tight">
                      {activation.experience.name}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Opens in the browser straight from the camera. No app store, no download, no
                      account — the step that normally loses the buyer is the one that is not there.
                    </p>
                  </div>
                </div>
              </Panel>

              <Panel className="overflow-hidden" glow>
                <div className="flex flex-col sm:flex-row sm:items-start">
                  <div className="shrink-0 self-start sm:w-48">
                    <Shot
                      name={activation.reward.image}
                      alt={activation.reward.alt}
                      className="w-full border-b border-border object-cover sm:border-r sm:border-b-0"
                    />
                  </div>
                  <div className="min-w-0 p-5">
                    <Pill tone="accent">Reward unlock</Pill>
                    <h3 className="mt-3 text-base font-medium tracking-tight">
                      {activation.reward.name}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-foreground">
                      {activation.reward.unlock}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {activation.reward.blurb}
                    </p>
                  </div>
                </div>
              </Panel>
            </div>
          </Section>

          {/* THE PRODUCTS */}
          <Section
            title="Activated products"
            className="border-b border-border"
            actions={
              <Link
                to="/roblox/portal/products"
                className="mono inline-flex items-center gap-1.5 text-[11px] tracking-[0.12em] text-primary uppercase hover:underline"
              >
                Full assortment <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {activation.products.map((p) => {
                const method = p.launch ? LAUNCH_METHODS[p.launch] : null;
                const Icon = p.launch === "nfc" ? Nfc : QrCode;
                return (
                  <Panel key={p.id} className="flex flex-col overflow-hidden">
                    <Shot
                      name={p.image}
                      alt={p.alt}
                      transparent={p.transparent}
                      className={cn(
                        "aspect-square w-full border-b border-border",
                        p.transparent ? "object-contain p-4" : "object-cover",
                      )}
                    />
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium">{p.name}</h3>
                        {method ? (
                          <Pill tone="primary" dot={false}>
                            <Icon className="size-3" aria-hidden />
                            {method.short}
                          </Pill>
                        ) : null}
                      </div>
                      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
                        {p.detail}
                      </p>
                      {p.placement ? (
                        <p className="mono mt-3 border-t border-border pt-3 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
                          {p.placement}
                        </p>
                      ) : null}
                    </div>
                  </Panel>
                );
              })}
            </div>
          </Section>
        </>
      ) : (
        <Section title="Activation">
          <Panel className="max-w-2xl p-5">
            <span className="grid size-9 place-items-center rounded-md border border-border bg-white/[0.03] text-muted-foreground">
              <Boxes className="size-4.5" aria-hidden />
            </span>
            <h3 className="mt-4 text-base font-medium tracking-tight">Not scoped yet.</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Launch method, attached experience and digital reward are settled on the scoping call,
              which happens between days three and five. {s.property} has not reached it.
            </p>
            <p className="mono mt-4 border-t border-border pt-3 text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
              Submitted {shortDate(s.submitted)}
            </p>
          </Panel>
        </Section>
      )}
    </>
  );
}
