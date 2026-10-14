import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  FolderOpen,
  Hash,
  Inbox,
  MessageSquareText,
  Rocket,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { CopyButton, Monogram, Page, TimeAgo } from "@/components/hub/app/ui";
import { CreatorStatusPill, JourneyFunnel, JourneyTrack } from "@/components/partner/parts";
import { IconTile, Surface, lift, surface, type TileTone } from "@/components/partner/ui";
import { inviteFor, programUrl, usePartnerWorkspace } from "@/components/partner/workspace";
import { Button } from "@/components/ui/button";
import { kitFor, kitHero, kitLogo } from "@/lib/hub/collateral";
import { HUB, money } from "@/lib/hub/model";
import { JOURNEY, type JourneyStep } from "@/lib/hub/partners";
import { MEDIALIFE_GIFS, MEDIALIFE_VIDEOS } from "@/lib/hub/showcase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partner-hub/_app/")({
  head: () => ({ meta: [{ title: "Home · Partner Hub | MEDIALIFE" }] }),
  component: Home,
});

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Home() {
  const ws = usePartnerWorkspace();
  const first = (ws.me.name || ws.me.email).split(/[\s@(]/)[0];
  const invite = inviteFor(ws, ws.me.name);
  const logo = kitLogo(ws.partner.kit);
  const kit = kitFor(ws.partner.kit);
  const preview = (id: string) => {
    const i = kit.find((k) => k.id === id);
    return i ? (i.kind === "image" ? i.href : i.preview) : undefined;
  };

  const counts = Object.fromEntries(JOURNEY.map((s) => [s.id, 0])) as Record<JourneyStep, number>;
  for (const c of ws.creators) counts[c.journey]++;
  const gross = ws.creators.reduce((s, c) => s + c.earnings.gross, 0);
  const orders = ws.creators.reduce((s, c) => s + c.earnings.orders, 0);
  const currency = ws.creators.find((c) => c.earnings.orders)?.earnings.currency ?? "USD";
  const inProgress = counts.sign + counts.approve + counts.make;

  const nudges = ws.creators
    .map((c) => {
      if (c.status === "draft") return { c, why: "Started the application, hasn't sent it" };
      if (c.journey === "sign") return { c, why: "Approved: waiting on their signature" };
      if (c.waitingOnCreator)
        return {
          c,
          why: `${c.waitingOnCreator} product${c.waitingOnCreator === 1 ? " needs" : "s need"} their approval`,
        };
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 5);
  const fresh = ws.library.files
    .filter((f) => f.complete && Date.now() - f.createdAt < 21 * 86_400_000)
    .slice(0, 4);
  const recent = [...ws.creators].sort((a, b) => b.lastActivityAt - a.lastActivityAt).slice(0, 4);

  const kpis: {
    label: string;
    value: string;
    sub: string;
    icon: LucideIcon;
    tone: TileTone;
    step?: JourneyStep;
  }[] = [
    {
      label: "Creators",
      value: String(ws.creators.length),
      sub: "brought in by your team",
      icon: Users,
      tone: "ice",
    },
    {
      label: "In progress",
      value: String(inProgress),
      sub: "signing, approving or in production",
      icon: Rocket,
      tone: "blue",
    },
    {
      label: "Live and earning",
      value: String(counts.paid),
      sub: "selling activated merch",
      icon: Wallet,
      tone: "mint",
      step: "paid",
    },
    {
      label: "Sales",
      value: money(gross, currency),
      sub: `${orders} order${orders === 1 ? "" : "s"} so far`,
      icon: TrendingUp,
      tone: "violet",
    },
  ];

  const actions: {
    to: "/partner-hub/links" | "/partner-hub/playbook" | "/partner-hub/collateral";
    search?: { tab: "messages" };
    image?: string;
    /** How to crop the image; the top by default. */
    position?: string;
    icon: LucideIcon;
    title: string;
    body: string;
  }[] = [
    {
      to: "/partner-hub/links",
      image: "/partner-kit/medialife/shelf-preview.webp",
      icon: Box,
      title: "Make a 3D shop",
      body: "A personalised demo for any creator",
    },
    {
      to: "/partner-hub/playbook",
      search: { tab: "messages" },
      image: preview("fan-unlock-story"),
      position: "object-[50%_45%]",
      icon: MessageSquareText,
      title: "Send a message",
      body: "DM and email templates, filled in",
    },
    {
      to: "/partner-hub/collateral",
      image: preview("journey-wide") ?? preview("activated-experiences"),
      icon: FolderOpen,
      title: "Grab collateral",
      body: "One-pager, graphics and photography",
    },
    {
      to: "/partner-hub/links",
      image: preview("program-page"),
      icon: Sparkles,
      title: "Share your program page",
      body: "Explains it all and ends at the application",
    },
  ];

  return (
    <Page className="lg:pt-8">
      {/* Welcome */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-[color-mix(in_oklab,var(--partner)_32%,transparent)] bg-[var(--partner-ink)] shadow-[0_30px_60px_-30px_color-mix(in_oklab,var(--partner-2)_80%,black)]">
        <img
          src={kitHero(ws.partner.kit)}
          alt=""
          className="absolute inset-0 -z-10 size-full object-cover object-right opacity-80"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(8_10_24/0.97)_0%,rgb(8_10_24/0.85)_50%,rgb(8_10_24/0.1)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent"
        />
        <div className="max-w-xl p-6 sm:p-8">
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo.wordmark} alt={ws.partner.name} className="h-9 w-auto sm:h-10" />
            ) : (
              <span className="font-semibold">{ws.partner.name}</span>
            )}
            <span className="text-white/40" aria-hidden>
              ×
            </span>
            <img src="/brand/medialife-wordmark.webp" alt="MEDIALIFE" className="h-4 w-auto" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            {greeting()}, {first}.
          </h1>
          <p className="mt-1.5 text-sm text-white/70 sm:text-base">
            Bring creators into activated merch. Everything you need is one click away.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <CopyButton
              value={programUrl(ws, invite)}
              label="Copy your program link"
              copiedLabel="Copied"
              variant="default"
              size="default"
              toastText="Program link copied"
            />
            <Button asChild variant="outline" className="bg-black/30 backdrop-blur">
              <Link to="/partner-hub/links">
                <Box aria-hidden /> Make a 3D shop
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <ul className="mt-4 grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
        {kpis.map((k) => (
          <li key={k.label}>
            <Link
              to="/partner-hub/creators"
              search={k.step ? { step: k.step } : {}}
              className={cn(surface, lift, "flex h-full flex-col p-4")}
            >
              <span className="flex items-center justify-between">
                <IconTile icon={k.icon} tone={k.tone} size="sm" />
                <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden />
              </span>
              <span className="mt-3 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                {k.value}
              </span>
              <span className="text-sm font-medium">{k.label}</span>
              <span className="text-xs text-muted-foreground">{k.sub}</span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Quick actions */}
      <section aria-labelledby="actions-title" className="mt-8">
        <h2 id="actions-title" className="mb-3 text-lg font-semibold tracking-tight">
          Quick actions
        </h2>
        <ul className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
          {actions.map((a) => (
            <li key={a.title}>
              <Link
                to={a.to}
                search={a.search ?? {}}
                className={cn(surface, lift, "group flex h-full flex-col overflow-hidden")}
              >
                <span className="relative block aspect-[16/9] overflow-hidden bg-[var(--partner-ink)]">
                  {a.image ? (
                    <img
                      src={a.image}
                      alt=""
                      loading="lazy"
                      className={cn(
                        "size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none",
                        a.position ?? "object-top",
                      )}
                    />
                  ) : null}
                  <span className="absolute inset-0 bg-gradient-to-t from-[#0b0d1a]/80 via-transparent to-transparent" />
                  <span className="absolute bottom-2.5 left-2.5">
                    <IconTile
                      icon={a.icon}
                      tone="ice"
                      size="sm"
                      className="bg-black/50 backdrop-blur"
                    />
                  </span>
                </span>
                <span className="flex flex-1 items-end justify-between gap-2 p-3.5">
                  <span className="min-w-0">
                    <span className="block font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">{a.body}</span>
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--partner)]/15 text-[var(--partner)] transition-colors group-hover:bg-[var(--partner)] group-hover:text-[var(--partner-ink)]">
                    <ArrowRight className="size-4" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-2">
          {[
            { to: "/partner-hub/team" as const, icon: UserPlus, label: "Invite a teammate" },
            {
              to: "/partner-hub/playbook" as const,
              search: { tab: "discord" as const },
              icon: Hash,
              label: "Set up your Discord",
            },
          ].map((c) => (
            <li key={c.label}>
              <Link
                to={c.to}
                search={c.search ?? {}}
                className={cn(
                  surface,
                  lift,
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm",
                )}
              >
                <c.icon className="size-4 text-[var(--partner)]" aria-hidden /> {c.label}
              </Link>
            </li>
          ))}
          <li>
            <a
              href={`mailto:${HUB.supportEmail}?subject=${encodeURIComponent(`Request from ${ws.partner.name}`)}`}
              className={cn(
                surface,
                lift,
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm",
              )}
            >
              <Inbox className="size-4 text-[var(--partner)]" aria-hidden /> Ask MEDIALIFE for
              something
            </a>
          </li>
        </ul>
      </section>

      {/* Pipeline + what needs you */}
      <div className="mt-8 grid gap-4 @5xl/inset:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="grid h-fit gap-4">
          <Surface accent as="section" className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Pipeline</h2>
                <p className="text-sm text-muted-foreground">
                  Where your creators are. Pick a step to see who.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/partner-hub/creators">All creators</Link>
              </Button>
            </div>
            <JourneyFunnel counts={counts} linked />
          </Surface>

          <Surface as="section" className="p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Recently active</h2>
            {recent.length ? (
              <ul className="grid gap-2 @2xl/inset:grid-cols-2">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/partner-hub/creators/$creatorId"
                      params={{ creatorId: c.id }}
                      className={cn(surface, lift, "block rounded-xl p-3.5")}
                    >
                      <span className="flex items-center gap-2.5">
                        <Monogram name={c.displayName} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.displayName}</span>
                          <TimeAgo
                            ts={c.lastActivityAt}
                            className="text-xs text-muted-foreground"
                          />
                        </span>
                        <CreatorStatusPill status={c.status} />
                      </span>
                      <JourneyTrack current={c.journey} status={c.status} className="mt-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Creators who join with your links show up here.
              </p>
            )}
          </Surface>
        </div>

        <div className="order-first grid h-fit gap-4 @5xl/inset:order-none">
          <Surface as="section" className="p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <Bell className="size-4 text-amber-300" aria-hidden /> Worth a nudge
            </h2>
            {nudges.length ? (
              <ul className="mt-3 grid gap-2">
                {nudges.map(({ c, why }) => (
                  <li key={c.id}>
                    <Link
                      to="/partner-hub/creators/$creatorId"
                      params={{ creatorId: c.id }}
                      className="flex items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] p-3 transition-colors hover:border-amber-300/45 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
                    >
                      <Monogram name={c.displayName} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.displayName}</span>
                        <span className="block text-xs text-muted-foreground">{why}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Nobody's waiting on anything. Nice.
              </p>
            )}
          </Surface>

          <Surface as="section" className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold tracking-tight">From MEDIALIFE</h2>
              <Link
                to="/partner-hub/collateral"
                search={{ tab: "team" }}
                className="text-sm text-[var(--partner)] hover:underline"
              >
                See all
              </Link>
            </div>
            {fresh.length ? (
              <ul className="mt-3 grid gap-2">
                {fresh.map((f) => (
                  <li key={f.id}>
                    <Link
                      to="/partner-hub/collateral"
                      search={{ tab: "team" }}
                      className="flex items-center gap-3 rounded-xl p-2 hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
                    >
                      <IconTile icon={Sparkles} tone="violet" size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                      <TimeAgo ts={f.createdAt} className="text-xs text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Your kit is ready in Collateral. New files from the team show up here first.
              </p>
            )}
            <ul className="mt-3 grid gap-2">
              {[
                {
                  tab: "videos" as const,
                  title: "Activation videos",
                  sub: `${MEDIALIFE_VIDEOS.length} clips: standees, products, fans, creators`,
                  thumbs: MEDIALIFE_VIDEOS.slice(0, 3).map((v) => v.poster),
                },
                {
                  tab: "gifs" as const,
                  title: "Email GIFs",
                  sub: `${MEDIALIFE_GIFS.length} loops, ready for email and DMs`,
                  thumbs: MEDIALIFE_GIFS.slice(0, 3).map(
                    (g) => MEDIALIFE_VIDEOS.find((v) => v.id === g.from)?.poster ?? g.src,
                  ),
                },
              ].map((r) => (
                <li key={r.tab}>
                  <Link
                    to="/partner-hub/collateral"
                    search={{ tab: r.tab }}
                    className={cn(surface, lift, "flex items-center gap-3 rounded-xl p-2.5")}
                  >
                    <span className="flex -space-x-3" aria-hidden>
                      {r.thumbs.map((t) => (
                        <img
                          key={t}
                          src={t}
                          alt=""
                          loading="lazy"
                          className="h-12 w-8 rounded-md object-cover ring-2 ring-background"
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{r.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      </div>
    </Page>
  );
}
