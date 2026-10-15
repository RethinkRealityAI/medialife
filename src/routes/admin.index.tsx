import type { ReactNode } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity as ActivityIcon,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  FileSignature,
  FolderOpen,
  Handshake,
  Inbox,
  Link2,
  Package,
  PenLine,
  Rocket,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Avatar,
  EmptyState,
  IconTile,
  PageBody,
  PageHeader,
  Panel,
  PanelTitle,
  SectionTitle,
  StatTile,
  Tag,
  type Tone,
} from "@/components/admin/kit";
import { Sparkline, TrendChart } from "@/components/hub/app/earnings-chart";
import { HubLink } from "@/components/hub/app/hub-link";
import { ImageAction } from "@/components/hub/app/look";
import { Button } from "@/components/ui/button";
import { adminHomeFn, type AdminHome } from "@/lib/hub/admin-home.functions";
import { kitLogo } from "@/lib/hub/collateral";
import {
  PLATFORMS,
  compact,
  money,
  timeAgo,
  type ActivityKind,
  type PlatformId,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

// The team's home: what needs us today first, then how the program is doing,
// partners, and the demos side. Everything links to the page that acts on it.

export const Route = createFileRoute("/admin/")({
  loader: () => adminHomeFn(),
  head: () => ({ meta: [{ title: "Home · Admin | MEDIALIFE" }] }),
  component: AdminHomePage,
});

const DAY = 86_400_000;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const waited = (since: number, now: number) => {
  const d = Math.floor((now - since) / DAY);
  return d < 1 ? "today" : d === 1 ? "1 day" : `${d} days`;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------------------------------------------------------------------------
   What needs the team, oldest first within each kind
   --------------------------------------------------------------------------- */

type Todo = {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  image?: string | null;
  title: string;
  detail: string;
  cta: string;
  to: string;
  urgent?: boolean;
};

function todos(d: AdminHome): Todo[] {
  const now = d.generatedAt;
  const out: Todo[] = [];
  for (const a of d.toReview.slice(0, 3)) {
    const wait = now - a.submittedAt;
    out.push({
      key: `app-${a.id}`,
      icon: Inbox,
      tone: "sky",
      title: `Review ${a.name}'s application`,
      detail: [
        a.platforms
          .slice(0, 2)
          .map((p) => PLATFORMS[p as PlatformId]?.label ?? p)
          .join(" · ") || null,
        a.audience ? `${compact(a.audience)} audience` : null,
        a.agency ? `via ${a.agency}` : null,
        `waiting ${waited(a.submittedAt, now)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      cta: "Review",
      to: `/admin/creators/${a.id}?tab=application`,
      urgent: wait > 3 * DAY,
    });
  }
  for (const p of d.waitingOnUs.slice(0, 4)) {
    out.push({
      key: `prod-${p.productId}`,
      icon: Package,
      tone: "violet",
      image: p.image,
      title: `${p.name}: ${p.stage}`,
      detail: `${p.creatorName} · waiting on us ${waited(p.since, now)}`,
      cta: "Open",
      to: `/admin/creators/${p.creatorId}?tab=products&product=${p.productId}`,
      urgent: now - p.since > 7 * DAY,
    });
  }
  for (const p of d.payouts.slice(0, 2)) {
    out.push({
      key: `pay-${p.creatorId}`,
      icon: Wallet,
      tone: "mint",
      title: `Pay ${p.name} ${money(p.amount, p.currency)}`,
      detail: "Out of the 30-day returns window and not paid yet",
      cta: "Pay",
      to: `/admin/creators/${p.creatorId}?tab=orders`,
    });
  }
  if (d.unsigned.length) {
    const names = d.unsigned.map((u) => u.name);
    out.push({
      key: "unsigned",
      icon: FileSignature,
      tone: "amber",
      title:
        d.unsigned.length === 1
          ? `${names[0]} hasn't signed the agreement`
          : `${d.unsigned.length} creators haven't signed the agreement`,
      detail:
        d.unsigned.length === 1
          ? "Approved, but nothing goes into production until they sign"
          : `${names.slice(0, 3).join(", ")}${names.length > 3 ? ` and ${names.length - 3} more` : ""}`,
      cta: "Nudge",
      to: `/admin/creators/${d.unsigned[0].id}?tab=application`,
    });
  }
  if (d.unmatched) {
    out.push({
      key: "unmatched",
      icon: TriangleAlert,
      tone: "amber",
      title: `${plural(d.unmatched, "order")} didn't match a product`,
      detail: "Match them so the creator gets credited",
      cta: "Match",
      to: "/admin/creators?view=unmatched",
      urgent: true,
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   Page
   --------------------------------------------------------------------------- */

function AdminHomePage() {
  const d = Route.useLoaderData();
  const navigate = useNavigate();
  const list = todos(d);
  const queued =
    d.toReview.length + d.waitingOnUsTotal + d.payouts.length + d.unsigned.length + d.unmatched;
  const s = d.sales;
  const change = s.prevNet > 0 ? (s.net - s.prevNet) / s.prevNet : null;
  const inFlight = d.pipeline.filter((p) => p.id !== "live").reduce((n, p) => n + p.count, 0);

  const summary = [
    d.counts.submitted ? plural(d.counts.submitted, "application") + " to review" : null,
    d.waitingOnUsTotal ? plural(d.waitingOnUsTotal, "product") + " waiting on us" : null,
    s.readyToPay ? `${money(s.readyToPay, s.currency)} ready to pay` : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="MEDIALIFE team"
        title={<span suppressHydrationWarning>{greeting()}.</span>}
        description={
          summary.length
            ? `Today: ${summary.join(", ")}.`
            : "Nothing is waiting on the team. Here's how the program is doing."
        }
        image="/partner-kit/medialife/videos/building-sakamoto.webp"
        imageClassName="object-[50%_35%]"
        actions={
          <>
            {d.counts.submitted ? (
              <Button asChild>
                <Link to="/admin/creators" search={{ status: "submitted" }}>
                  <Inbox aria-hidden /> Review applications
                  <span className="rounded-full bg-black/25 px-1.5 text-xs tabular-nums">
                    {d.counts.submitted}
                  </span>
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="bg-black/30 backdrop-blur">
              <Link to="/admin/analytics">
                <BarChart3 aria-hidden /> Analytics
              </Link>
            </Button>
          </>
        }
      >
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          <Chip>{plural(d.counts.approved, "active creator")}</Chip>
          <Chip>{plural(d.partners.length, "partner")}</Chip>
          <Chip>{plural(d.liveProducts, "product")} on sale</Chip>
          <Chip>{money(s.net, s.currency)} sales · 30 days</Chip>
        </ul>
      </PageHeader>

      <PageBody>
        {/* Phones: what needs us comes before the numbers. */}
        <div className="grid grid-cols-1 gap-5 @5xl/inset:grid-cols-3">
          <section
            aria-label="At a glance"
            className="order-2 min-w-0 @3xl/inset:order-1 @5xl/inset:col-span-3"
          >
            <ul className="grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @6xl/inset:grid-cols-6">
              <li className="flex min-w-0 [&>*]:flex-1">
                <StatTile
                  label="To review"
                  value={d.counts.submitted}
                  icon={Inbox}
                  tone={d.counts.submitted ? "amber" : "slate"}
                  hint={d.counts.waitlist ? `${d.counts.waitlist} on the waitlist` : "Applications"}
                  onClick={() =>
                    void navigate({ to: "/admin/creators", search: { status: "submitted" } })
                  }
                />
              </li>
              <li className="flex min-w-0 [&>*]:flex-1">
                <StatTile
                  label="Active creators"
                  value={d.counts.approved}
                  icon={Users}
                  tone="sky"
                  hint={d.counts.paused ? `${d.counts.paused} paused` : `${d.counts.total} in all`}
                  onClick={() =>
                    void navigate({ to: "/admin/creators", search: { status: "approved" } })
                  }
                />
              </li>
              <li className="flex min-w-0 [&>*]:flex-1">
                <StatTile
                  label="In production"
                  value={inFlight}
                  icon={Rocket}
                  tone="violet"
                  meter={inFlight ? d.waitingOnUsTotal / inFlight : null}
                  hint={`${d.waitingOnUsTotal} on us · ${d.waitingOnCreator} on creators`}
                />
              </li>
              <li className="flex min-w-0 [&>*]:flex-1">
                <StatTile
                  label="Sales · 30 days"
                  value={money(s.net, s.currency)}
                  icon={ShoppingBag}
                  tone="mint"
                  hint={
                    change === null
                      ? `${plural(s.orders, "order")}`
                      : `${change >= 0 ? "+" : ""}${Math.round(change * 100)}% · ${plural(s.orders, "order")}`
                  }
                />
              </li>
              <li className="flex min-w-0 [&>*]:flex-1">
                <StatTile
                  label="Ready to pay"
                  value={money(s.readyToPay, s.currency)}
                  icon={CircleDollarSign}
                  tone={s.readyToPay ? "amber" : "slate"}
                  hint={plural(d.payouts.length, "creator")}
                />
              </li>
              <li className="flex min-w-0 [&>*]:flex-1">
                <StatTile
                  label="Demo visits · 7 days"
                  value={d.demos ? d.demos.visits : "—"}
                  icon={BarChart3}
                  tone="rose"
                  hint={d.demos ? `${plural(d.demos.leads, "lead")}` : "Analytics unavailable"}
                  onClick={() => void navigate({ to: "/admin/analytics" })}
                />
              </li>
            </ul>
          </section>
          <NeedsTeam
            items={list}
            total={queued}
            className="order-1 @3xl/inset:order-2 @5xl/inset:col-span-2"
          />
          <DemosCard d={d} className="order-3" />
        </div>

        <section aria-labelledby="quick">
          <SectionTitle id="quick">Quick actions</SectionTitle>
          <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 @6xl/inset:grid-cols-6 [&::-webkit-scrollbar]:hidden">
            {QUICK.map((q) => (
              <li key={q.title} className="w-[62%] shrink-0 snap-start sm:w-auto">
                <ImageAction {...q} />
              </li>
            ))}
          </ul>
        </section>

        <div className="grid grid-cols-1 gap-5 @5xl/inset:grid-cols-3">
          <div className="min-w-0 space-y-5 @5xl/inset:col-span-2">
            <SalesCard d={d} change={change} />
            <PipelineCard d={d} />
          </div>
          <div className="min-w-0 space-y-5">
            <PartnersCard d={d} />
            <ActivityCard d={d} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="glass rounded-full px-2.5 py-1 font-medium text-white/85 tabular-nums">
      {children}
    </li>
  );
}

const QUICK: Parameters<typeof ImageAction>[0][] = [
  {
    href: "/admin/creators?status=submitted",
    image: "/medialife/activated-retail/assets/ml_phone_hero.webp",
    icon: Inbox,
    tone: "pink",
    title: "Review creators",
    body: "Applications, terms and products",
  },
  {
    href: "/admin/partners",
    image: "/partner-kit/snowday/hero-tap-hoodie.webp",
    imageClassName: "object-[50%_40%]",
    icon: Handshake,
    tone: "violet",
    title: "Partners",
    body: "Teams, their creators and libraries",
  },
  {
    href: "/admin/shelves",
    image: "/partner-kit/medialife/shelf-preview.webp",
    icon: Store,
    tone: "ice",
    title: "Build a merch shelf",
    body: "A 3D shop for one creator",
  },
  {
    href: "/admin/links",
    image: "/partner-kit/medialife/activated-experiences-preview.webp",
    imageClassName: "object-left",
    icon: Link2,
    tone: "amber",
    title: "Create a client link",
    body: "Track who opens a demo",
  },
  {
    href: "/admin/builder",
    image: "/partner-kit/medialife/videos/figures-bookshelf.webp",
    icon: Boxes,
    tone: "mint",
    title: "Endcap builder",
    body: "Retail displays for a pitch",
  },
  {
    href: "/admin/partners/collateral",
    image: "/partner-kit/medialife/videos/fans-merch-apparel.webp",
    imageClassName: "object-[50%_30%]",
    icon: FolderOpen,
    tone: "pink",
    title: "Partner collateral",
    body: "What every partner can share",
  },
];

/* ---------------------------------------------------------------------------
   Cards
   --------------------------------------------------------------------------- */

const cornerLink =
  "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium text-[var(--partner)] transition-colors hover:bg-[var(--partner)]/10 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none [&_svg]:size-3.5";

function NeedsTeam({
  items,
  total,
  className,
}: {
  items: Todo[];
  total: number;
  className?: string;
}) {
  return (
    <Panel accent={total > 0} className={cn("p-4 sm:p-5", className)} aria-labelledby="needs">
      <PanelTitle
        id="needs"
        icon={ClipboardCheck}
        tone={total ? "amber" : "mint"}
        title={
          <span className="flex items-center gap-2">
            Needs the team
            {total ? <Tag tone="amber">{total}</Tag> : null}
          </span>
        }
        sub={total ? "Waiting on MEDIALIFE, oldest first in each group" : undefined}
      />
      {items.length ? (
        <ul className="mt-4 grid grid-cols-1 gap-2">
          {items.map((t) => (
            <li key={t.key}>
              <HubLink
                to={t.to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-2.5 pr-3 transition-colors hover:border-[color-mix(in_oklab,var(--partner)_45%,transparent)] hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
                  t.urgent && "border-amber-400/25",
                )}
              >
                {t.image ? (
                  <span className="relative shrink-0">
                    <img
                      src={t.image}
                      alt=""
                      className="size-10 rounded-xl bg-white/[0.04] object-cover"
                    />
                    <IconTile
                      icon={t.icon}
                      tone={t.tone}
                      size="xs"
                      className="absolute -right-1.5 -bottom-1.5 bg-[#0b0d1a]"
                    />
                  </span>
                ) : (
                  <IconTile icon={t.icon} tone={t.tone} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.urgent ? <span className="text-amber-300">Overdue · </span> : null}
                    {t.detail}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--partner)]/12 px-3 py-1.5 text-xs font-medium text-[var(--partner)] transition-colors group-hover:bg-[var(--partner)] group-hover:text-[var(--partner-ink)]">
                  {t.cta}
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </HubLink>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CheckCircle2} tone="mint" title="All clear" className="mt-4 py-8">
          No applications, products, payouts or orders are waiting on the team.
        </EmptyState>
      )}
      {total > items.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {plural(total - items.length, "more item")} in{" "}
          <Link to="/admin/creators" className="text-foreground underline underline-offset-2">
            Creators
          </Link>
          .
        </p>
      ) : null}
    </Panel>
  );
}

function DemosCard({ d, className }: { d: AdminHome; className?: string }) {
  const demos = d.demos;
  return (
    <Panel className={cn("flex flex-col p-4 sm:p-5", className)} aria-labelledby="demos">
      <PanelTitle
        id="demos"
        icon={BarChart3}
        tone="rose"
        title="Demos · 7 days"
        sub="Who opened what you sent"
        actions={
          <Link to="/admin/analytics" className={cornerLink}>
            Analytics <ArrowRight aria-hidden />
          </Link>
        }
      />
      {demos && demos.hasAnyData ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                {demos.visits}
              </div>
              <div className="text-xs text-muted-foreground">
                visits · {plural(demos.visitors, "visitor")} · {plural(demos.leads, "lead")}
              </div>
            </div>
            <Sparkline
              values={demos.series}
              color="oklch(0.74 0.2 340)"
              className="h-12 w-32 shrink-0"
            />
          </div>
          {demos.topClients.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-1.5">
              {demos.topClients.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {plural(c.visits, "visit")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {demos
            ? "No demo visits yet. Send a client link and every open shows up here."
            : "Couldn't load demo analytics just now."}
        </p>
      )}
      <div className="mt-auto pt-4">
        <Link
          to="/admin/shelves"
          className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-2.5 transition-colors hover:border-[color-mix(in_oklab,var(--partner)_45%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
        >
          <IconTile icon={Store} tone="sky" size="sm" />
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">
              {plural(d.shelves.published, "merch shelf", "merch shelves")} live
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {d.shelves.partner
                ? `${d.shelves.partner} made by partners · ${d.shelves.total} in all`
                : `${d.shelves.total} in all`}
            </span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </Panel>
  );
}

function SalesCard({ d, change }: { d: AdminHome; change: number | null }) {
  const s = d.sales;
  return (
    <Panel className="p-4 sm:p-5" aria-labelledby="sales">
      <PanelTitle
        id="sales"
        icon={ShoppingBag}
        tone="mint"
        title="Sales · 30 days"
        sub="Net merch revenue across every creator"
      />
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">
          {money(s.net, s.currency)}
        </span>
        {change !== null ? (
          <Tag tone={change >= 0 ? "mint" : "rose"}>
            {change >= 0 ? "+" : ""}
            {Math.round(change * 100)}% vs previous 30 days
          </Tag>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {plural(s.units, "unit")} · creators earned {money(s.earned, s.currency)}
        </span>
      </div>
      {s.net > 0 ? (
        <TrendChart data={s.series} metric="net" currency={s.currency} className="mt-3 h-44" />
      ) : (
        <div className="mt-3 grid h-32 place-items-center rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">
          The chart starts with the first sale.
        </div>
      )}
      {s.top.length ? (
        <div className="mt-4">
          <h3 className="text-xs font-medium text-muted-foreground">Top creators</h3>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {s.top.map((c) => (
              <li key={c.id}>
                <Link
                  to="/admin/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  search={{ tab: "orders" }}
                  className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2 transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
                >
                  <Avatar name={c.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {money(c.net, s.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
}

const STAGE_TONE: Tone[] = ["slate", "sky", "amber", "violet", "rose", "sky", "mint"];

function PipelineCard({ d }: { d: AdminHome }) {
  const max = Math.max(1, ...d.pipeline.map((p) => p.count));
  return (
    <Panel className="p-4 sm:p-5" aria-labelledby="pipeline">
      <PanelTitle
        id="pipeline"
        icon={Rocket}
        tone="violet"
        title="Pipeline"
        sub={`${plural(d.waitingOnUsTotal, "product")} waiting on us · ${d.waitingOnCreator} on creators`}
        actions={
          <Link to="/admin/creators" search={{ status: "approved" }} className={cornerLink}>
            Creators <ArrowRight aria-hidden />
          </Link>
        }
      />
      <ol className="mt-4 grid grid-cols-4 gap-2 @5xl/inset:grid-cols-7">
        {d.pipeline.map((p, i) => (
          <li
            key={p.id}
            className={cn(
              "min-w-0 rounded-xl border border-white/[0.06] bg-black/20 p-2.5 sm:p-3",
              p.count && p.id === "live" && "border-emerald-400/25",
            )}
          >
            <div className="flex min-h-8 items-start gap-1.5 text-xs leading-4 text-muted-foreground">
              <span className="font-mono text-[10px] text-white/35">{i + 1}</span>
              <span className="min-w-0">{p.name}</span>
            </div>
            <div
              className={cn(
                "mt-1 text-2xl font-semibold tabular-nums",
                !p.count && "text-white/30",
              )}
            >
              {p.count}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
              <div
                className={cn(
                  "h-full rounded-full",
                  {
                    slate: "bg-white/60",
                    sky: "bg-sky-400",
                    amber: "bg-amber-400",
                    violet: "bg-violet-400",
                    rose: "bg-fuchsia-400",
                    mint: "bg-emerald-400",
                  }[STAGE_TONE[i] ?? "sky"],
                )}
                style={{ width: `${(p.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function PartnersCard({ d }: { d: AdminHome }) {
  return (
    <Panel className="p-4 sm:p-5" aria-labelledby="partners">
      <PanelTitle
        id="partners"
        icon={Handshake}
        tone="violet"
        title="Partners"
        sub="Agencies bringing creators in"
        actions={
          <Link to="/admin/partners" className={cornerLink}>
            All <ArrowRight aria-hidden />
          </Link>
        }
      />
      {d.partners.length ? (
        <ul className="mt-4 grid grid-cols-1 gap-2">
          {d.partners.map((p) => {
            const logo = kitLogo(p.kit);
            return (
              <li key={p.id}>
                <Link
                  to="/admin/partners/$partnerId"
                  params={{ partnerId: p.id }}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-2.5 transition-colors hover:border-[color-mix(in_oklab,var(--partner)_45%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl ring-1 ring-white/10"
                    style={{ background: p.brand.ink }}
                  >
                    {logo ? (
                      <img src={logo.mark} alt="" className="size-7 object-contain" />
                    ) : (
                      <span className="text-sm font-semibold" style={{ color: p.brand.accent }}>
                        {p.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {plural(p.creators, "creator")} · {p.active} active ·{" "}
                      {plural(p.members, "teammate")}
                    </span>
                  </span>
                  {p.toReview ? <Tag tone="amber">{p.toReview} to review</Tag> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={Handshake}
          tone="violet"
          title="No partners yet"
          className="mt-4 py-6"
          action={
            <Button asChild size="sm">
              <Link to="/admin/partners">Add a partner</Link>
            </Button>
          }
        >
          Partners get their own hub, collateral and invite links.
        </EmptyState>
      )}
    </Panel>
  );
}

const KIND: Record<ActivityKind, { icon: LucideIcon; tone: Tone }> = {
  account: { icon: Users, tone: "slate" },
  application: { icon: Sparkles, tone: "sky" },
  stage: { icon: Rocket, tone: "violet" },
  proof: { icon: PenLine, tone: "amber" },
  decision: { icon: CheckCircle2, tone: "mint" },
  file: { icon: FolderOpen, tone: "slate" },
  experience: { icon: Sparkles, tone: "rose" },
  order: { icon: ShoppingBag, tone: "mint" },
  payout: { icon: Wallet, tone: "mint" },
  message: { icon: ActivityIcon, tone: "slate" },
};

function ActivityCard({ d }: { d: AdminHome }) {
  return (
    <Panel className="p-4 sm:p-5" aria-labelledby="activity">
      <PanelTitle id="activity" icon={ActivityIcon} tone="sky" title="Recent activity" />
      {d.feed.length ? (
        <ol className="mt-4 grid grid-cols-1 gap-1">
          {d.feed.map((f) => {
            const k = KIND[f.kind];
            return (
              <li key={f.id}>
                <Link
                  to="/admin/creators/$creatorId"
                  params={{ creatorId: f.creatorId }}
                  search={{ tab: f.kind === "application" ? "application" : "activity" }}
                  className="flex items-start gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
                >
                  <IconTile icon={k.icon} tone={k.tone} size="xs" className="mt-0.5" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">
                      <span className="font-medium">{f.creatorName}</span>
                      <span className="text-muted-foreground"> · {f.title}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                      {timeAgo(f.at)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Applications, stage changes and orders show up here.
        </p>
      )}
    </Panel>
  );
}
