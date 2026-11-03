import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  FolderOpen,
  Gift,
  HardDrive,
  History,
  Route as RouteIcon,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { HubLink } from "@/components/hub/app/hub-link";
import { ActivityFeed } from "@/components/ugc/creator/activity";
import { Card, Notice, Page } from "@/components/ugc/creator/kit";
import { NextUpCard } from "@/components/ugc/creator/next-up";
import { TimelineSummary, UgcTimeline } from "@/components/ugc/creator/timeline";
import { countdownLabel, deadlineTone, weekdayDate } from "@/components/ugc/shared/format";
import { UGC_ART, btnGhost, card } from "@/components/ugc/shared/look";
import { QuotaBar } from "@/components/ugc/shared/quota-bar";
import { CreatorStatusChip } from "@/components/ugc/shared/status-chip";
import { UGC_ROUTES } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const app = getRouteApi("/ugc-hub/_app");

export const Route = createFileRoute("/ugc-hub/_app/")({
  head: () => ({ meta: [{ title: "Home · EVADE UGC Hub | MEDIALIFE" }] }),
  component: Home,
});

function Home() {
  const home = app.useLoaderData();
  const c = home.creator;
  const campaign = home.campaign;
  const first = (c.creatorName || c.name || "").split(" ")[0];
  const inReview = home.submissionCounts["in-review"] ?? 0;
  const approved = (home.submissionCounts.approved ?? 0) + (home.submissionCounts.posted ?? 0);
  const changes = home.submissionCounts["changes-requested"] ?? 0;
  const left = countdownLabel(campaign?.deadline ?? null);
  const tone = deadlineTone(campaign?.deadline ?? null);

  return (
    <Page>
      {/* Hero: the campaign art behind a greeting. */}
      <header
        className={cn(
          card,
          "relative isolate overflow-hidden border-[#3fe6e0]/20 p-5 sm:p-8 lg:min-h-[248px]",
        )}
      >
        <img
          src={campaign?.coverUrl ?? UGC_ART.splash}
          alt=""
          className="absolute inset-0 -z-20 size-full object-cover object-[70%_40%] opacity-70 sm:left-auto sm:w-[70%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(5_8_10/0.35)_0%,rgb(5_8_10/0.92)_70%)] sm:bg-[linear-gradient(90deg,#05080a_25%,rgb(5_8_10/0.75)_55%,rgb(5_8_10/0.1)_100%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#3fe6e0] to-transparent opacity-70"
        />
        <div className="flex min-h-[160px] flex-col justify-end sm:min-h-0 sm:justify-start">
          <div className="flex flex-wrap items-center gap-2">
            <CreatorStatusChip status={c.status} />
            {campaign?.status === "live" ? (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#3fe6e0]/30 bg-black/30 px-2.5 text-xs font-medium text-[#bff7f4] backdrop-blur">
                <span className="size-1.5 rounded-full bg-[#3fe6e0] shadow-[0_0_0_3px_rgb(63_230_224/0.2)]" />
                Brief live
              </span>
            ) : null}
          </div>
          <h1 className="mt-4 text-[32px] leading-[0.98] font-bold tracking-[-0.045em] text-balance sm:text-[44px]">
            Hey {first || "there"}
            <span className="text-[#f6c344]">.</span>
          </h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-[#c9d1d8] sm:text-base">
            {campaign ? (
              <>
                You're on <span className="font-medium text-foreground">{campaign.title}</span>.
                {campaign.drop ? ` ${campaign.drop}.` : ""}
              </>
            ) : (
              "Welcome to the EVADE creator crew. Your brief lands here soon."
            )}
          </p>
        </div>
      </header>

      {home.briefUpdated ? (
        <Notice
          className="mt-4"
          tone="info"
          icon={Sparkles}
          title="The brief was updated"
          action={
            <HubLink to={UGC_ROUTES.brief} className={btnGhost}>
              See what changed
            </HubLink>
          }
        >
          Give it another look before you film.
        </Notice>
      ) : null}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <NextUpCard action={home.nextAction} />

        {/* At a glance: deadline, uploads, storage. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-4 text-[#3fe6e0]" aria-hidden />
              Deadline
            </div>
            {campaign?.deadline ? (
              <>
                <p className="mt-2 text-lg leading-tight font-semibold tabular-nums">
                  {weekdayDate(campaign.deadline)}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm tabular-nums",
                    tone === "late"
                      ? "text-rose-300"
                      : tone === "soon"
                        ? "text-amber-300"
                        : "text-[#bff7f4]",
                  )}
                >
                  {left}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Set when the brief goes live</p>
            )}
          </Card>
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UploadCloud className="size-4 text-[#3fe6e0]" aria-hidden />
              Your uploads
            </div>
            <p className="mt-2 text-lg leading-tight font-semibold tabular-nums">
              {approved
                ? `${approved} approved`
                : inReview
                  ? `${inReview} in review`
                  : changes
                    ? `${changes} to fix`
                    : "None yet"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {changes && approved
                ? `${changes} need changes`
                : inReview && approved
                  ? `${inReview} in review`
                  : approved || inReview
                    ? "Nice work"
                    : "Film the shot list first"}
            </p>
          </Card>
          <Card className="col-span-2 p-4 sm:p-5 lg:col-span-1">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <HardDrive className="size-4 text-[#3fe6e0]" aria-hidden />
              Storage
            </div>
            <QuotaBar quota={home.quota} />
          </Card>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card as="section" labelledBy="journey-title" className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="journey-title"
              className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]"
            >
              <RouteIcon className="size-[18px] text-[#3fe6e0]" aria-hidden />
              Your journey
            </h2>
            {home.shipment?.trackingUrl && !home.shipment.deliveredAt ? (
              <a
                href={home.shipment.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[#bff7f4] underline decoration-[#3fe6e0]/40 underline-offset-4 hover:decoration-[#3fe6e0]"
              >
                Tracking
              </a>
            ) : null}
          </div>
          <TimelineSummary steps={home.timeline} />
          <UgcTimeline steps={home.timeline} className="mt-5" />
        </Card>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          <nav aria-label="Shortcuts" className="grid grid-cols-2 gap-3">
            <Shortcut
              to={UGC_ROUTES.brief}
              icon={ClipboardList}
              title="Brief"
              body="Shot list & hashtags"
            />
            <Shortcut
              to={UGC_ROUTES.assets}
              icon={FolderOpen}
              title="Assets"
              body="Logos, art, clips"
            />
          </nav>

          {home.perks.length ? (
            <HubLink
              to={UGC_ROUTES.perks}
              className={cn(
                card,
                "group flex items-center gap-4 border-[#f6c344]/30 p-4 transition-colors hover:border-[#f6c344]/60 focus-visible:outline-2 focus-visible:outline-[#3fe6e0]",
              )}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f6c344]/12 text-[#ffe48a] ring-1 ring-[#f6c344]/30 ring-inset">
                <Gift className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {home.perks.length} perk{home.perks.length === 1 ? "" : "s"} unlocked
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {home.perks[0].title}
                </span>
              </span>
              <ArrowRight
                className="size-4 text-[#ffe48a] transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </HubLink>
          ) : null}

          <Card as="section" labelledBy="activity-title" className="p-5">
            <h2
              id="activity-title"
              className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]"
            >
              <History className="size-[18px] text-[#3fe6e0]" aria-hidden />
              Recent activity
            </h2>
            <ActivityFeed items={home.activity.slice(0, 8)} className="mt-3" />
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Shortcut({
  to,
  icon: Icon,
  title,
  body,
}: {
  to: string;
  icon: typeof ClipboardList;
  title: string;
  body: string;
}) {
  return (
    <HubLink
      to={to}
      className={cn(
        card,
        "group flex min-h-24 flex-col justify-between gap-3 p-4 transition-colors hover:border-[#3fe6e0]/40 focus-visible:outline-2 focus-visible:outline-[#3fe6e0]",
      )}
    >
      <Icon className="size-5 text-[#3fe6e0]" aria-hidden />
      <span>
        <span className="flex items-center gap-1 font-semibold">
          {title}
          <ArrowRight
            className="size-3.5 opacity-60 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </HubLink>
  );
}
