import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  Clapperboard,
  ImageIcon,
  Loader2,
  Megaphone,
  Plus,
  Users,
} from "lucide-react";

import { formatDate } from "@/components/admin/format";
import { EmptyState, PageBody, PageHeader, lift, surface } from "@/components/admin/kit";
import { useRun } from "@/components/admin/creators/ui";
import { Button } from "@/components/ui/button";
import { adminSaveUgcCampaign } from "@/lib/ugc/admin.functions";
import { daysLeft, ugcAssetUrl } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import type { CampaignList } from "./types";
import { CampaignPill, plural } from "./ui";

const ORDER = { live: 0, draft: 1, closed: 2 } as const;

export function CampaignsPage({ campaigns }: { campaigns: CampaignList }) {
  const sorted = [...campaigns].sort(
    (a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt - a.updatedAt,
  );
  return (
    <>
      <PageHeader
        title="Campaigns"
        icon={Megaphone}
        tone="amber"
        description="Each campaign is a brief, a shot list and an asset library. Creators see the live campaign they're on."
        actions={<NewCampaignButton />}
      />
      <PageBody>
        {!sorted.length ? (
          <EmptyState
            icon={Megaphone}
            tone="amber"
            title="No campaigns yet"
            action={<NewCampaignButton />}
          >
            Write the first brief: key messages, do's and don'ts, the shot list and the assets
            creators can download.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 @3xl/inset:grid-cols-2 @6xl/inset:grid-cols-3">
            {sorted.map((c) => {
              const left = daysLeft(c.deadline);
              const required = c.shots.filter((s) => s.required).length;
              return (
                <li key={c.id}>
                  <Link
                    to="/admin/ugc/campaigns/$campaignId"
                    params={{ campaignId: c.id }}
                    className={cn(surface, lift, "flex h-full flex-col overflow-hidden")}
                  >
                    <div className="relative aspect-[16/7] bg-[linear-gradient(135deg,oklch(0.3_0.13_330),oklch(0.22_0.1_250))]">
                      {c.coverAssetId ? (
                        <img
                          src={ugcAssetUrl(c.id, c.coverAssetId)}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <ImageIcon
                          className="absolute inset-0 m-auto size-8 text-white/25"
                          aria-hidden
                        />
                      )}
                      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgb(0_0_0/0.65))]" />
                      <div className="absolute top-3 left-3">
                        <CampaignPill status={c.status} />
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      {c.drop ? (
                        <div className="text-[10px] font-semibold tracking-[0.14em] text-[var(--partner)] uppercase">
                          {c.drop}
                        </div>
                      ) : null}
                      <h2 className="mt-0.5 text-base font-semibold tracking-tight">{c.title}</h2>
                      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 pt-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-3.5" aria-hidden />
                          {plural(c.creatorCount, "creator")}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clapperboard className="size-3.5" aria-hidden />
                          {plural(c.shots.length, "shot")}
                          {required ? ` (${required} required)` : ""}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <ImageIcon className="size-3.5" aria-hidden />
                          {plural(c.assetFileIds.length, "asset")}
                        </span>
                        {c.deadline ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5",
                              c.status === "live" && left != null && left <= 3 && "text-amber-200",
                            )}
                            suppressHydrationWarning
                          >
                            <CalendarClock className="size-3.5" aria-hidden />
                            Due {formatDate(c.deadline)}
                          </span>
                        ) : null}
                        <span>{c.version ? `v${c.version}` : "Not published"}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}

function NewCampaignButton() {
  const navigate = useNavigate();
  const { run, busy } = useRun();
  return (
    <Button
      size="sm"
      className="h-9"
      disabled={busy}
      onClick={async () => {
        const r = await run(
          "new",
          () => adminSaveUgcCampaign({ data: { title: "Untitled campaign" } }),
          null,
        );
        if (r?.ok)
          void navigate({
            to: "/admin/ugc/campaigns/$campaignId",
            params: { campaignId: r.campaign.id },
          });
      }}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
      New campaign
    </Button>
  );
}
