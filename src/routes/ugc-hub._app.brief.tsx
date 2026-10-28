import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  BadgeAlert,
  Check,
  ClipboardList,
  Copy,
  Hash,
  Megaphone,
  Package,
  Pin,
  ScanLine,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { z } from "zod";

import { copyText } from "@/components/hub/app/ui";
import { CampaignSwitch } from "@/components/ugc/creator/campaign-switch";
import { Card, Page } from "@/components/ugc/creator/kit";
import { ShotChecklist } from "@/components/ugc/creator/shot-list";
import { NoCampaign, UgcPageSkeleton, UgcRouteError } from "@/components/ugc/creator/states";
import { countdownLabel, deadlineTone, weekdayDate } from "@/components/ugc/shared/format";
import { UGC_ART, btnGhost, card, eyebrow } from "@/components/ugc/shared/look";
import { VideoPlayer } from "@/components/ugc/shared/media";
import { getUgcBrief } from "@/lib/ugc/creator.functions";
import { UGC_ROUTES, daysLeft } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ugc-hub/_app/brief")({
  validateSearch: z.object({ campaign: z.string().max(60).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ campaign: search.campaign }),
  loader: ({ deps }) => getUgcBrief({ data: { campaignId: deps.campaign ?? null } }),
  head: () => ({ meta: [{ title: "Brief · EVADE UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <UgcPageSkeleton hero />,
  errorComponent: UgcRouteError,
  component: BriefPage,
});

function BriefPage() {
  const brief = Route.useLoaderData();
  const router = useRouter();
  // Opening the brief marks it as seen: refresh the shell so the "New" badge clears.
  const [updated] = useState(
    () => !!brief && brief.lastSeenVersion > 0 && brief.lastSeenVersion < brief.campaign.version,
  );
  useEffect(() => {
    if (updated) void router.invalidate({ filter: (d) => d.routeId === "/ugc-hub/_app" });
  }, [updated, router]);

  if (!brief)
    return (
      <Page>
        <NoCampaign />
      </Page>
    );

  const c = brief.campaign;
  const left = daysLeft(c.deadline);
  const tone = deadlineTone(c.deadline);
  const tags = [...c.hashtags, ...c.mentions];

  return (
    <Page>
      <CampaignSwitch
        className="mb-4"
        current={c}
        others={brief.otherCampaigns}
        path={UGC_ROUTES.brief}
      />

      {/* Hero */}
      <header className={cn(card, "relative isolate overflow-hidden border-[#3fe6e0]/20")}>
        <img
          src={brief.cover?.url ?? UGC_ART.splash}
          alt=""
          className="absolute inset-0 -z-20 size-full object-cover opacity-65 sm:left-auto sm:w-[68%]"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(5_8_10/0.25)_0%,rgb(5_8_10/0.95)_72%)] sm:bg-[linear-gradient(90deg,#05080a_28%,rgb(5_8_10/0.72)_58%,rgb(5_8_10/0.1)_100%)]"
        />
        <div className="grid gap-6 p-5 pt-28 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-8 sm:pt-8">
          <div className="max-w-xl min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={eyebrow}>The brief</span>
              {updated ? (
                <span className="rounded-full bg-[#3fe6e0]/15 px-2 py-0.5 text-[11px] font-semibold text-[#bff7f4] ring-1 ring-[#3fe6e0]/40 ring-inset">
                  Updated
                </span>
              ) : null}
              <span className="font-mono text-[10.5px] text-muted-foreground">v{c.version}</span>
            </div>
            <h1 className="mt-2.5 text-[30px] leading-[1] font-bold tracking-[-0.045em] text-balance sm:text-[42px]">
              {c.title}
            </h1>
            {c.drop ? <p className="mt-2 font-medium text-[#ffe48a]">{c.drop}</p> : null}
            {c.summary ? (
              <p className="mt-3 text-[15px] leading-relaxed text-pretty text-[#c9d1d8]">
                {c.summary}
              </p>
            ) : null}
          </div>
          {c.deadline ? (
            <div
              className={cn(
                "flex items-center gap-4 rounded-2xl border bg-black/35 px-4 py-3 backdrop-blur-md sm:flex-col sm:items-start sm:gap-1 sm:px-5 sm:py-4",
                tone === "late"
                  ? "border-rose-400/40"
                  : tone === "soon"
                    ? "border-amber-400/45"
                    : "border-white/15",
              )}
            >
              <span className="text-[40px] leading-none font-bold tracking-[-0.04em] tabular-nums sm:text-[52px]">
                {left != null ? Math.abs(left) : "–"}
              </span>
              <span>
                <span
                  className={cn(
                    "block text-sm font-medium",
                    tone === "late"
                      ? "text-rose-300"
                      : tone === "soon"
                        ? "text-amber-300"
                        : "text-[#bff7f4]",
                  )}
                >
                  {left != null && left < 0
                    ? "days overdue"
                    : left === 1
                      ? "day left"
                      : left === 0
                        ? "due today"
                        : "days left"}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  Due {weekdayDate(c.deadline)}
                </span>
              </span>
              <span className="sr-only">{countdownLabel(c.deadline)}</span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        {/* Left column */}
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-4">
          {c.keyMessages.length ? (
            <Card as="section" labelledBy="msg-title" className="p-5 max-lg:order-1 sm:p-6">
              <SectionTitle id="msg-title" icon={Megaphone}>
                Key messages
              </SectionTitle>
              <ol className="mt-4 space-y-3">
                {c.keyMessages.map((m, i) => (
                  <li key={i} className="flex gap-3.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#19affe,#ff37ae)] font-mono text-sm font-semibold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.3)]">
                      {i + 1}
                    </span>
                    <p className="pt-1 text-[15px] leading-relaxed text-pretty">{m}</p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {c.shots.length ? (
            <Card as="section" labelledBy="shots-title" className="p-5 max-lg:order-3 sm:p-6">
              <SectionTitle id="shots-title" icon={ClipboardList}>
                Shot list
              </SectionTitle>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                Tick them off as you film. Your uploads remember which shots they cover.
              </p>
              <ShotChecklist campaignId={c.id} shots={c.shots} initial={brief.tickedShotIds} />
            </Card>
          ) : null}

          {c.dos.length || c.donts.length ? (
            <Card as="section" labelledBy="dd-title" className="p-5 max-lg:order-5 sm:p-6">
              <h2 id="dd-title" className="sr-only">
                Do and don't
              </h2>
              <div className="grid gap-6 sm:grid-cols-2">
                <DoList kind="do" items={c.dos} />
                <DoList kind="dont" items={c.donts} />
              </div>
            </Card>
          ) : null}
        </div>

        {/* Right column */}
        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-4">
          {c.howTo ? (
            <section
              aria-labelledby="howto-title"
              className={cn(
                card,
                "relative overflow-hidden border-[#3fe6e0]/35 p-5 max-lg:order-2 sm:p-6",
              )}
            >
              <span
                aria-hidden
                className="absolute -top-20 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(63_230_224/0.22),transparent)] blur-xl"
              />
              <div className="relative flex items-center gap-2 font-mono text-[10.5px] tracking-[0.18em] text-[#3fe6e0] uppercase">
                <Pin className="size-3.5 rotate-45" aria-hidden /> Pinned
              </div>
              <h2
                id="howto-title"
                className="relative mt-2 flex items-center gap-2 text-xl font-bold tracking-[-0.025em]"
              >
                <ScanLine className="size-5 text-[#3fe6e0]" aria-hidden />
                {c.howTo.title}
              </h2>
              {brief.howToExample?.isVideo ? (
                <VideoPlayer
                  src={brief.howToExample.url}
                  title={`Example: ${c.howTo.title}`}
                  className="relative mx-auto mt-4 aspect-[9/16] max-h-[420px] w-auto"
                />
              ) : null}
              <ol className="relative mt-4 space-y-2.5">
                {c.howTo.steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-[#3fe6e0]/45 font-mono text-[11px] text-[#bff7f4]">
                      {i + 1}
                    </span>
                    <span className="text-pretty">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {tags.length ? (
            <Card as="section" labelledBy="tags-title" className="p-5 max-lg:order-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle id="tags-title" icon={Hash}>
                  Hashtags & mentions
                </SectionTitle>
                <button
                  type="button"
                  className={cn(btnGhost, "min-h-10 px-3.5")}
                  onClick={() => copyText(tags.join(" "), "Copied all tags")}
                >
                  <Copy aria-hidden /> Copy all
                </button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Tap one to copy it.</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t}>
                    <TagChip value={t} />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <section
            aria-labelledby="disc-title"
            className="rounded-[22px] border border-[#f6c344]/40 bg-[linear-gradient(135deg,rgb(246_195_68/0.12),rgb(246_195_68/0.03))] p-5 max-lg:order-6 sm:p-6"
          >
            <h2
              id="disc-title"
              className="flex items-center gap-2 text-base font-bold text-[#ffe48a]"
            >
              <BadgeAlert className="size-5" aria-hidden /> Always disclose
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-pretty text-[#f4ead0]">
              {c.disclosure}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <TagChip value="#ad" gold />
              <span className="inline-flex h-10 items-center rounded-full border border-[#f6c344]/30 px-3.5 text-sm text-[#ffe48a]">
                or the Paid partnership label
              </span>
            </div>
          </section>

          {c.items.length ? (
            <Card as="section" labelledBy="pkg-title" className="p-5 max-lg:order-7 sm:p-6">
              <SectionTitle id="pkg-title" icon={Package}>
                In your package
              </SectionTitle>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {c.items.map((it, i) => (
                  <li
                    key={it}
                    className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-2.5"
                  >
                    <img
                      src={i % 2 ? UGC_ART.can : UGC_ART.bobo}
                      alt=""
                      className="size-11 shrink-0 object-contain"
                    />
                    <span className="text-[15px] font-medium">{it}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </Page>
  );
}

function SectionTitle({
  id,
  icon: Icon,
  children,
}: {
  id: string;
  icon: typeof Hash;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
      <Icon className="size-[18px] text-[#3fe6e0]" aria-hidden />
      {children}
    </h2>
  );
}

function TagChip({ value, gold }: { value: string; gold?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${value}`}
      onClick={async () => {
        if (await copyText(value, `Copied ${value}`)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 font-mono text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3fe6e0] active:scale-[0.97] motion-reduce:active:scale-100",
        gold
          ? "border-[#f6c344]/50 bg-[#f6c344]/15 text-[#ffe48a] hover:bg-[#f6c344]/25"
          : "border-white/15 bg-white/[0.05] text-foreground hover:border-[#3fe6e0]/50 hover:bg-[#3fe6e0]/10",
      )}
    >
      {value}
      {copied ? (
        <Check className="size-3.5 text-[#3fe6e0]" aria-hidden />
      ) : (
        <Copy className="size-3.5 opacity-50" aria-hidden />
      )}
    </button>
  );
}

function DoList({ kind, items }: { kind: "do" | "dont"; items: string[] }) {
  if (!items.length) return null;
  const doIt = kind === "do";
  return (
    <div>
      <h3
        className={cn(
          "flex items-center gap-2 text-base font-semibold",
          doIt ? "text-emerald-300" : "text-rose-300",
        )}
      >
        {doIt ? (
          <ThumbsUp className="size-4" aria-hidden />
        ) : (
          <ThumbsDown className="size-4" aria-hidden />
        )}
        {doIt ? "Do" : "Don't"}
      </h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
            <span
              aria-hidden
              className={cn(
                "mt-1 grid size-5 shrink-0 place-items-center rounded-full",
                doIt ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300",
              )}
            >
              {doIt ? (
                <Check className="size-3" strokeWidth={3} />
              ) : (
                <X className="size-3" strokeWidth={3} />
              )}
            </span>
            <span className="text-pretty">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
