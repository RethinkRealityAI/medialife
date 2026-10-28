import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { ArrowUpRight, Handshake, Lock, Mail, Sparkles, Ticket, Zap } from "lucide-react";

import { HubLink } from "@/components/hub/app/hub-link";
import { CopyButton } from "@/components/hub/app/ui";
import { Card, EmptyState, Page, PageHead, Section } from "@/components/ugc/creator/kit";
import { UgcPageSkeleton, UgcRouteError } from "@/components/ugc/creator/states";
import { dayDate } from "@/components/ugc/shared/format";
import { UGC_ART, btnGhost, btnGold, btnTeal, card } from "@/components/ugc/shared/look";
import { listUgcPerks } from "@/lib/ugc/creator.functions";
import { UGC, UGC_ROUTES, daysLeft, type UgcPerk } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const app = getRouteApi("/ugc-hub/_app");

export const Route = createFileRoute("/ugc-hub/_app/perks")({
  loader: () => listUgcPerks(),
  head: () => ({ meta: [{ title: "Perks · EVADE UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <UgcPageSkeleton />,
  errorComponent: UgcRouteError,
  component: PerksPage,
});

function PerksPage() {
  const perks = Route.useLoaderData();
  const home = app.useLoaderData();
  const discounts = perks.filter((p) => p.kind === "discount");
  const early = perks.filter((p) => p.kind === "early-access");
  const collabs = perks.filter((p) => p.kind === "collab");
  const posted = home.creator.status === "posted";
  const preFilm = ["applied", "approved", "shipped", "delivered"].includes(home.creator.status);

  return (
    <Page>
      <PageHead kicker="Perks" title={perks.length ? "Your perks" : "Perks for the crew"}>
        {perks.length
          ? "Thanks for creating with EVADE. Here's what you've unlocked."
          : "Codes, early access and collabs unlock as your content goes live."}
      </PageHead>

      {!perks.length ? (
        <EmptyState
          className="mt-6"
          art="bobo"
          title={posted ? "Your perk is on its way" : "Perks unlock when you go live"}
          action={
            <HubLink to={preFilm ? UGC_ROUTES.brief : UGC_ROUTES.upload} className={btnGold}>
              {posted ? "See my content" : preFilm ? "Read the brief" : "Upload your content"}
            </HubLink>
          }
        >
          {posted
            ? "The team adds your discount code within a couple of days of your post. We'll email you."
            : "Upload, get approved, post with #ad and paste your live link. Your discount code lands here."}
        </EmptyState>
      ) : null}

      {discounts.length ? (
        <Section
          id="codes"
          icon={Ticket}
          title="Discount codes"
          description="Share them with your audience, or use them yourself."
        >
          <ul className="grid gap-4 md:grid-cols-2">
            {discounts.map((p) => (
              <DiscountTicket key={p.id} perk={p} />
            ))}
          </ul>
        </Section>
      ) : null}

      {early.length ? (
        <Section id="early" icon={Zap} title="Early access">
          <ul className="grid gap-4 md:grid-cols-2">
            {early.map((p) => (
              <PerkCard key={p.id} perk={p} tone="teal" icon={Zap} />
            ))}
          </ul>
        </Section>
      ) : null}

      {collabs.length ? (
        <Section id="collabs" icon={Handshake} title="Collab opportunities">
          <ul className="grid gap-4 md:grid-cols-2">
            {collabs.map((p) => (
              <PerkCard key={p.id} perk={p} tone="magenta" icon={Handshake} />
            ))}
          </ul>
        </Section>
      ) : null}

      <Section id="next" icon={Sparkles} title="Next drops" description="Crew members hear first.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Teaser
            art={UGC_ART.can}
            label="Drop 02"
            title="Under wraps"
            body="The next EVADE merch drop. You'll get the brief before it's public."
          />
          <Teaser
            art={UGC_ART.bobo}
            label="Cola Run"
            title="New levels"
            body="Fresh Cola Run content for your channel, with early clips in your asset kit."
          />
        </div>
      </Section>
    </Page>
  );
}

function expiry(p: UgcPerk) {
  if (!p.expiresAt) return { text: "No expiry", expired: false, soon: false };
  const d = daysLeft(p.expiresAt) ?? 0;
  if (d < 0) return { text: `Expired ${dayDate(p.expiresAt)}`, expired: true, soon: false };
  if (d === 0) return { text: "Expires today", expired: false, soon: true };
  return {
    text: `Expires ${dayDate(p.expiresAt)} · ${d} day${d === 1 ? "" : "s"} left`,
    expired: false,
    soon: d <= 7,
  };
}

function DiscountTicket({ perk: p }: { perk: UgcPerk }) {
  const e = expiry(p);
  return (
    <li
      className={cn(
        card,
        "relative isolate flex overflow-hidden",
        e.expired ? "opacity-60" : "border-[#f6c344]/35",
      )}
    >
      <div className="relative flex w-24 shrink-0 flex-col items-center justify-center bg-[linear-gradient(180deg,#ffe48a_0%,#f6c344_45%,#e0a21a_100%)] px-2 text-[#1a1203] sm:w-28">
        {p.percentOff ? (
          <>
            <span className="text-[34px] leading-none font-bold tracking-[-0.05em] tabular-nums">
              {p.percentOff}
              <span className="text-xl">%</span>
            </span>
            <span className="mt-1 font-mono text-[10px] font-semibold tracking-[0.16em] uppercase">
              off
            </span>
          </>
        ) : (
          <Ticket className="size-9" aria-hidden />
        )}
        {/* ticket notches */}
        <span aria-hidden className="absolute -top-3 -right-3 size-6 rounded-full bg-[#05080a]" />
        <span
          aria-hidden
          className="absolute -right-3 -bottom-3 size-6 rounded-full bg-[#05080a]"
        />
      </div>
      <div className="min-w-0 flex-1 border-l-2 border-dashed border-[#f6c344]/30 p-4 sm:p-5">
        <p className="text-[15px] leading-snug font-semibold text-pretty">{p.title}</p>
        {p.description ? (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
        ) : null}
        {p.code ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-xl bg-black/40 px-3 py-2 font-mono text-base font-semibold tracking-[0.08em] text-[#ffe48a] ring-1 ring-[#f6c344]/30 ring-inset">
              {p.code}
            </code>
            <CopyButton
              value={p.code}
              label="Copy"
              toastText={`Copied ${p.code}`}
              variant="ghost"
              className="h-11 rounded-full border border-white/15 px-4"
              ariaLabel={`Copy code ${p.code}`}
            />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p
            className={cn(
              "text-xs tabular-nums",
              e.expired ? "text-rose-300" : e.soon ? "text-amber-300" : "text-muted-foreground",
            )}
          >
            {e.text}
          </p>
          {p.url && !e.expired ? (
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#bff7f4] hover:text-white focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
            >
              Shop <ArrowUpRight className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function PerkCard({
  perk: p,
  tone,
  icon: Icon,
}: {
  perk: UgcPerk;
  tone: "teal" | "magenta";
  icon: typeof Zap;
}) {
  const e = expiry(p);
  const teal = tone === "teal";
  return (
    <li
      className={cn(
        card,
        "flex flex-col p-5",
        teal ? "border-[#3fe6e0]/25" : "border-[#ff37ae]/25",
      )}
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-xl ring-1 ring-inset",
          teal
            ? "bg-[#3fe6e0]/10 text-[#3fe6e0] ring-[#3fe6e0]/30"
            : "bg-[#ff37ae]/10 text-[#ff8fcf] ring-[#ff37ae]/30",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-pretty">{p.title}</p>
      {p.description ? (
        <p className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{p.description}</p>
      ) : (
        <span className="flex-1" />
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {p.expiresAt ? (
          <span className="text-xs text-muted-foreground tabular-nums">{e.text}</span>
        ) : (
          <span />
        )}
        {p.url ? (
          <a href={p.url} target="_blank" rel="noreferrer" className={teal ? btnTeal : btnGhost}>
            {teal ? "Get early access" : "Find out more"} <ArrowUpRight aria-hidden />
          </a>
        ) : (
          <a
            href={`mailto:${UGC.supportEmail}?subject=${encodeURIComponent(p.title)}`}
            className={btnGhost}
          >
            <Mail aria-hidden /> I'm interested
          </a>
        )}
      </div>
    </li>
  );
}

function Teaser({
  art,
  label,
  title,
  body,
}: {
  art: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <Card className="relative isolate flex min-h-40 items-end overflow-hidden p-5">
      <img
        src={art}
        alt=""
        aria-hidden
        className="absolute -top-4 -right-4 -z-10 h-44 w-auto rotate-12 opacity-40 blur-[3px] saturate-50"
      />
      <span
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#0b1318_35%,transparent)]"
      />
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase backdrop-blur">
          <Lock className="size-3" aria-hidden /> {label}
        </span>
        <p className="mt-3 text-lg font-bold tracking-[-0.02em]">{title}</p>
        <p className="mt-1 max-w-[28ch] text-sm leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </Card>
  );
}
