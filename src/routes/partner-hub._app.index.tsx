import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Box, FolderOpen, Link2, Sparkles } from "lucide-react";

import { CopyButton, EmptyState, Page, Pill, Section, TimeAgo } from "@/components/hub/app/ui";
import { CreatorStatusPill, JourneyFunnel, JourneyTrack } from "@/components/partner/parts";
import {
  inviteFor,
  programUrl,
  shelfUrl,
  usePartnerWorkspace,
} from "@/components/partner/workspace";
import { Button } from "@/components/ui/button";
import { kitHero } from "@/lib/hub/collateral";
import { money } from "@/lib/hub/model";
import { JOURNEY, type JourneyStep } from "@/lib/hub/partners";

export const Route = createFileRoute("/partner-hub/_app/")({
  head: () => ({ meta: [{ title: "Home · Partner Hub | MEDIALIFE" }] }),
  component: Home,
});

function Home() {
  const ws = usePartnerWorkspace();
  const first = (ws.me.name || ws.me.email).split(/[\s@]/)[0];
  const invite = inviteFor(ws, ws.me.name);
  const counts = Object.fromEntries(JOURNEY.map((s) => [s.id, 0])) as Record<JourneyStep, number>;
  for (const c of ws.creators) counts[c.journey]++;
  const gross = ws.creators.reduce((s, c) => s + c.earnings.gross, 0);
  const currency = ws.creators.find((c) => c.earnings.orders)?.earnings.currency ?? "USD";

  // Who might need a nudge from the partner.
  const nudges = ws.creators
    .map((c) => {
      if (c.status === "draft")
        return { c, why: "Started the application but hasn't sent it.", tone: "watch" as const };
      if (c.journey === "sign")
        return {
          c,
          why: "Approved: waiting on them to sign the agreement.",
          tone: "watch" as const,
        };
      if (c.waitingOnCreator)
        return {
          c,
          why: `${c.waitingOnCreator} product${c.waitingOnCreator === 1 ? " needs" : "s need"} their input or approval.`,
          tone: "watch" as const,
        };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 6);
  const fresh = ws.library.files
    .filter((f) => Date.now() - f.createdAt < 21 * 86_400_000)
    .slice(0, 4);

  return (
    <Page className="lg:pt-8">
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-2xl border border-border">
        <img
          src={kitHero(ws.partner.kit)}
          alt=""
          className="absolute inset-0 size-full object-cover object-right opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/10" />
        <div className="relative max-w-xl p-6 sm:p-8">
          <div className="text-xs font-medium tracking-[0.18em] text-[var(--partner)] uppercase">
            {ws.partner.name} × MEDIALIFE
          </div>
          <h1 className="mt-2 text-2xl font-medium tracking-tight text-balance sm:text-3xl">
            Hi {first}. Everything you need to bring creators into activated merch.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Your collateral, the playbook, your links and every creator's progress, in one place. We
            add new materials here as they're made.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <CopyButton
              value={programUrl(ws, invite)}
              label="Copy your program link"
              copiedLabel="Copied"
              variant="default"
              toastText="Program link copied"
            />
            <Button asChild variant="outline">
              <Link to="/partner-hub/links">
                <Box aria-hidden /> Make a 3D shop
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Shortcuts */}
      <ul className="mt-4 grid grid-cols-1 gap-2 @xl/inset:grid-cols-3">
        {[
          {
            to: "/partner-hub/collateral" as const,
            icon: FolderOpen,
            title: "Collateral",
            body: "One-pager, graphics for Discord and socials, photography and the MEDIALIFE deck.",
          },
          {
            to: "/partner-hub/playbook" as const,
            icon: BookOpen,
            title: "Playbook",
            body: "The pitch, who's a fit, Discord set-up, message templates, timeline and FAQ.",
          },
          {
            to: "/partner-hub/links" as const,
            icon: Link2,
            title: "Links & demos",
            body: "Your program page, personalised 3D shops and QR codes, credited to you.",
          },
        ].map((s) => (
          <li key={s.to}>
            <Link
              to={s.to}
              className="group flex h-full gap-3 rounded-xl border border-border bg-white/[0.02] p-4 transition-colors hover:border-[var(--partner)]/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <s.icon className="mt-0.5 size-5 shrink-0 text-[var(--partner)]" aria-hidden />
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-medium">
                  {s.title}
                  <ArrowRight
                    className="size-4 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{s.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Section
        title="Your creators"
        description={
          ws.creators.length
            ? `${ws.creators.length} creator${ws.creators.length === 1 ? "" : "s"} you brought in${gross ? ` · ${money(gross, currency)} in sales so far` : ""}.`
            : "Creators who join with your links show up here, step by step."
        }
        actions={
          ws.creators.length ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/partner-hub/creators">See all</Link>
            </Button>
          ) : null
        }
      >
        <JourneyFunnel counts={counts} />
      </Section>

      {nudges.length ? (
        <Section
          title="Worth a nudge"
          description="Creators who are waiting on something from their side. A friendly DM usually does it."
        >
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {nudges.map(({ c, why }) => (
              <li key={c.id}>
                <Link
                  to="/partner-hub/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.displayName}</span>
                    <span className="block text-sm text-muted-foreground">{why}</span>
                  </span>
                  <JourneyTrack
                    current={c.journey}
                    status={c.status}
                    className="w-full @xl/inset:w-72"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        title="New in your collateral"
        description="The MEDIALIFE team adds materials here. Ask us any time for something you need."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/partner-hub/collateral">Open collateral</Link>
          </Button>
        }
      >
        {fresh.length ? (
          <ul className="grid grid-cols-1 gap-2 @xl/inset:grid-cols-2">
            {fresh.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-white/[0.02] p-3"
              >
                <Sparkles className="size-4 shrink-0 text-[var(--partner)]" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <Pill tone="primary">New</Pill>
                <TimeAgo ts={f.createdAt} className="text-xs text-muted-foreground" />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={FolderOpen} title="Your kit is ready" className="py-8 sm:py-10">
            A one-pager, the five-step graphics, Discord and social posts, photography and the
            MEDIALIFE deck are in Collateral. New uploads from the team will show here.
          </EmptyState>
        )}
      </Section>

      {ws.creators.length ? (
        <Section title="Recently active">
          <ul className="grid grid-cols-1 gap-2 @xl/inset:grid-cols-2">
            {[...ws.creators]
              .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
              .slice(0, 4)
              .map((c) => (
                <li key={c.id}>
                  <Link
                    to="/partner-hub/creators/$creatorId"
                    params={{ creatorId: c.id }}
                    className="block rounded-xl border border-border bg-white/[0.02] p-4 hover:border-[var(--partner)]/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.displayName}</span>
                      <CreatorStatusPill status={c.status} />
                    </span>
                    <JourneyTrack current={c.journey} status={c.status} className="mt-3" />
                  </Link>
                </li>
              ))}
          </ul>
        </Section>
      ) : null}

      <p className="mt-10 text-xs text-muted-foreground">
        Your 3D shop link for anyone you're pitching:{" "}
        <span className="font-mono">{shelfUrl(ws, invite).replace(/^https?:\/\//, "")}</span>
      </p>
    </Page>
  );
}
