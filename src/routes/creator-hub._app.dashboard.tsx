import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Coins,
  Hourglass,
  Info,
  Package,
  PauseCircle,
  ScanLine,
  ShoppingBag,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { ActivityFeed } from "@/components/hub/app/activity-feed";
import { EarningsChart } from "@/components/hub/app/earnings-chart";
import { Kpi } from "@/components/hub/app/kpi";
import { ManagerCard } from "@/components/hub/app/manager-card";
import { NeedsYouList } from "@/components/hub/app/needs-you";
import { ProductRow } from "@/components/hub/app/product-card";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/hub/app/ui";
import {
  PRE_APPROVAL,
  needsYou,
  pipelineOrder,
  useHubSession,
  useWorkspace,
  type Workspace,
} from "@/components/hub/app/workspace";
import { Button } from "@/components/ui/button";
import { HUB, compact, money, shortDate } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/creator-hub/_app/dashboard")({
  head: () => ({ meta: [{ title: "Home · Creator Hub | MEDIALIFE" }] }),
  component: Dashboard,
});

function Dashboard() {
  const ws = useWorkspace();
  const session = useHubSession();
  const name = ws.creator.profile.displayName || "there";

  if (PRE_APPROVAL.has(ws.creator.status)) {
    return (
      <Page>
        <PageHeader eyebrow="Welcome to the Creator Hub" title={`Hi, ${name}`} />
        <StatusHero ws={ws} />
        <div className="mt-8 grid grid-cols-1 gap-6 @4xl/inset:grid-cols-2">
          {needsYou(ws, session).some((i) => i.kind === "verify") ? (
            <Section title="One thing to do" className="mt-0">
              <NeedsYouList
                items={needsYou(ws, session).filter((i) => i.kind === "verify")}
                single
              />
            </Section>
          ) : null}
          <ManagerCard manager={ws.manager} approved={false} />
        </div>
      </Page>
    );
  }

  const items = needsYou(ws, session);
  const products = [...ws.products].sort(pipelineOrder);
  const currency = ws.earnings.currency;
  const live = ws.products.filter((p) => p.stage === "live").length;
  const month = ws.trend.reduce((s, d) => s + d.earned, 0);

  return (
    <Page>
      <PageHeader
        eyebrow="Welcome back"
        title={`Hi, ${name}`}
        description={
          ws.products.length
            ? `${ws.products.length} product${ws.products.length === 1 ? "" : "s"} in your program · ${live} on sale`
            : "Your products will appear here once your manager sets them up."
        }
      />

      <Section
        id="needs-you"
        title={items.length ? `Needs you (${items.length})` : "Needs you"}
        description={
          items.length
            ? "Start with the first one. Everything else keeps moving without you."
            : undefined
        }
      >
        {items.length ? (
          <NeedsYouList items={items} />
        ) : (
          <Panel className="flex items-center gap-3 p-4">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-hidden />
            <p className="text-sm">
              <span className="font-medium">You're all caught up.</span>{" "}
              <span className="text-muted-foreground">
                We'll let you know when something needs you.
              </span>
            </p>
          </Panel>
        )}
      </Section>

      <Section title="At a glance" className="[&_h2]:sr-only">
        <div className="grid grid-cols-2 gap-3 @4xl/inset:grid-cols-4">
          <Kpi
            label="Earned all-time"
            icon={Coins}
            value={money(ws.earnings.earned, currency)}
            emphasis
          />
          <Kpi
            label="Ready to pay out"
            icon={Wallet}
            value={money(ws.earnings.available, currency)}
            explain={`Earnings from orders older than ${HUB.holdDays} days (the returns window) that we haven't paid you yet. They go out with the next payout.`}
          />
          <Kpi label="Units sold" icon={ShoppingBag} value={compact(ws.earnings.units)} />
          <Kpi
            label="Scans"
            icon={ScanLine}
            value={compact(ws.scansTotal)}
            explain="How many times fans opened an experience by scanning a QR code or tapping an NFC tag."
          />
        </div>
      </Section>

      <Section
        title="Your products"
        description="Where every product is, from brief to on sale."
        actions={
          ws.products.length ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/creator-hub/products">
                All products <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null
        }
      >
        {products.length ? (
          <ul className="space-y-3">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} currency={currency} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={Package} title="No products yet">
            Your manager sets up your first product after your welcome call. You'll see it here,
            stage by stage, from brief to on sale.
          </EmptyState>
        )}
      </Section>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:mt-12 @5xl/inset:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Panel className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm text-muted-foreground">Earnings, last 30 days</h2>
                <div className="mt-1 text-2xl font-medium tracking-tight tabular-nums">
                  {money(month, currency)}
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link to="/creator-hub/earnings">
                  Earnings <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
            <div className="mt-4">
              {month > 0 ? (
                <EarningsChart data={ws.trend} currency={currency} height={180} minimal />
              ) : (
                <div className="grid h-32 place-items-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
                  Your earnings show here from your first sale.
                </div>
              )}
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <h2 className="mb-3 text-sm text-muted-foreground">Recent activity</h2>
            <ActivityFeed items={ws.activity} limit={8} />
          </Panel>
        </div>
        <div className="space-y-6">
          <ManagerCard manager={ws.manager} approved />
        </div>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------------------
   Before approval: where the application is, and what happens next
   --------------------------------------------------------------------------- */

const HERO: Record<
  "submitted" | "waitlist" | "declined" | "paused",
  { icon: LucideIcon; title: string; body: (email: string) => string; tone: string }
> = {
  submitted: {
    icon: Clock3,
    title: "Your application is in review",
    body: (email) =>
      `Thanks for applying. A real person reads every application. You'll hear from us within 2 business days at ${email}. There's nothing else you need to do.`,
    tone: "border-primary/40 bg-primary/[0.06]",
  },
  waitlist: {
    icon: Hourglass,
    title: "You're on the waitlist",
    body: () =>
      "We launch creators in small groups so every drop gets proper attention. Your application is saved and we'll email you as soon as a spot opens. You don't need to reapply.",
    tone: "border-amber-400/40 bg-amber-400/[0.06]",
  },
  declined: {
    icon: Info,
    title: "Not a fit right now",
    body: () =>
      "Thanks for applying. We can't take your channel into the program at the moment. Channels grow and our catalogue changes, so if anything's different, update your details and write to us.",
    tone: "border-border bg-white/[0.03]",
  },
  paused: {
    icon: PauseCircle,
    title: "Your account is paused",
    body: () =>
      "Your products, files and earnings are safe. Nothing new is being made while the account is paused. Write to us and we'll explain what's needed to pick things back up.",
    tone: "border-amber-400/40 bg-amber-400/[0.06]",
  },
};

const STEPS = [
  { id: "applied", label: "You applied" },
  { id: "review", label: "We review your channel" },
  { id: "call", label: "Welcome call with your manager" },
  { id: "brief", label: "Your first product brief" },
];

function StatusHero({ ws }: { ws: Workspace }) {
  const status = ws.creator.status as keyof typeof HERO;
  const hero = HERO[status];
  const at = status === "submitted" || status === "waitlist" ? 1 : -1;

  return (
    <section
      aria-labelledby="status-title"
      className={cn("mt-6 rounded-2xl border p-5 sm:p-8", hero.tone)}
    >
      <hero.icon className="size-7 text-primary" aria-hidden />
      <h2 id="status-title" className="mt-4 text-xl font-medium tracking-tight sm:text-2xl">
        {hero.title}
      </h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">
        {hero.body(ws.creator.profile.email || "your email")}
      </p>

      {at >= 0 ? (
        <ol className="mt-6 grid grid-cols-1 gap-3 @3xl/inset:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-sm",
                i < at && "border-border bg-white/[0.03]",
                i === at && "border-primary/50 bg-background/40",
                i > at && "border-dashed border-border text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid grid-cols-1 size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  i < at
                    ? "bg-primary text-background"
                    : i === at
                      ? "border-2 border-primary"
                      : "border border-border",
                )}
              >
                {i < at ? <CheckCircle2 className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0">
                {status === "waitlist" && s.id === "review" ? "Waiting for a spot" : s.label}
                {i === 0 && ws.creator.submittedAt ? (
                  <span className="block text-xs text-muted-foreground">
                    {shortDate(ws.creator.submittedAt)}
                  </span>
                ) : null}
                <span className="sr-only">
                  {i < at ? " (done)" : i === at ? " (now)" : " (next)"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/creator-hub/account">Edit your application details</Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`mailto:${HUB.supportEmail}`}>Write to {HUB.supportEmail}</a>
        </Button>
      </div>
    </section>
  );
}
