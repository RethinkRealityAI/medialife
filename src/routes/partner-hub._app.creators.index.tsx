import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, UsersRound } from "lucide-react";
import { z } from "zod";

import { EmptyState, Monogram, Page } from "@/components/hub/app/ui";
import { CreatorStatusPill, JourneyFunnel, JourneyTrack } from "@/components/partner/parts";
import { PartnerBanner } from "@/components/partner/ui";
import { usePartnerWorkspace } from "@/components/partner/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kitFor, kitHero } from "@/lib/hub/collateral";
import { PLATFORMS, money, shortDate } from "@/lib/hub/model";
import { JOURNEY, type JourneyStep } from "@/lib/hub/partners";

const STEP_IDS = JOURNEY.map((s) => s.id) as [JourneyStep, ...JourneyStep[]];

export const Route = createFileRoute("/partner-hub/_app/creators/")({
  validateSearch: z.object({ step: z.enum(STEP_IDS).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Creators · Partner Hub | MEDIALIFE" }] }),
  component: Creators,
});

const compact = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}K`
      : `${n}`;

function Creators() {
  const ws = usePartnerWorkspace();
  const { step } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");

  const counts = useMemo(() => {
    const c = Object.fromEntries(JOURNEY.map((s) => [s.id, 0])) as Record<JourneyStep, number>;
    for (const x of ws.creators) c[x.journey]++;
    return c;
  }, [ws.creators]);

  const shown = ws.creators
    .filter((c) => !step || c.journey === step)
    .filter((c) => {
      const s = q.trim().toLowerCase();
      return !s || [c.displayName, c.email, c.rep].some((v) => v.toLowerCase().includes(s));
    })
    .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

  return (
    <Page className="lg:pt-8">
      <PartnerBanner
        image={
          kitFor(ws.partner.kit).find((i) => i.id === "fan-unlock-story")?.href ??
          kitHero(ws.partner.kit)
        }
        imageClassName="object-[50%_42%]"
        eyebrow="Creators"
        title="Your creators"
        description="Everyone who joined through your links: where they are, what they're making and how it's selling."
      />

      <div className="mt-6">
        <JourneyFunnel
          counts={counts}
          active={step ?? null}
          onPick={(s) => void navigate({ search: { step: s ?? undefined }, replace: true })}
        />
      </div>

      {ws.creators.length ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-60">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, email or who brought them in"
                aria-label="Search creators"
                className="h-9 pl-8"
              />
            </div>
            {step ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ search: {}, replace: true })}
              >
                Show all steps
              </Button>
            ) : null}
          </div>

          {shown.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgb(255_255_255/0.05),rgb(255_255_255/0.015))] shadow-[0_20px_40px_-24px_rgb(0_0_0/0.9)]">
              {shown.map((c) => (
                <li key={c.id}>
                  <Link
                    to="/partner-hub/creators/$creatorId"
                    params={{ creatorId: c.id }}
                    className="grid grid-cols-1 gap-3 p-4 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset @3xl/inset:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_8rem] @3xl/inset:items-center"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Monogram name={c.displayName} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{c.displayName}</span>
                          <CreatorStatusPill status={c.status} />
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[
                            c.platforms.map((p) => PLATFORMS[p]?.label ?? p).join(", "),
                            c.audience ? `${compact(c.audience)} audience` : null,
                            c.rep ? `via ${c.rep}` : null,
                            `joined ${shortDate(c.joinedAt)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </span>
                    <JourneyTrack current={c.journey} status={c.status} />
                    <span className="text-sm tabular-nums @3xl/inset:text-right">
                      {c.products ? (
                        <>
                          <span className="block">
                            {c.live}/{c.products} live
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {money(c.earnings.gross, c.earnings.currency)} sales
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">No products yet</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">No creators match.</p>
          )}
        </>
      ) : (
        <EmptyState
          icon={UsersRound}
          title="No creators yet"
          className="mt-6"
          action={
            <Button asChild>
              <Link to="/partner-hub/links">Get your links</Link>
            </Button>
          }
        >
          Share your program link or a personalised 3D shop. Creators who sign up through them land
          here, and you can follow every step.
        </EmptyState>
      )}
    </Page>
  );
}
