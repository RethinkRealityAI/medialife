import { useState } from "react";
import { Dices, Gift, Settings2, Users } from "lucide-react";

import {
  AdminTab,
  AdminTabs,
  BackLink,
  NamespaceBadge,
  PageBody,
  PageHeader,
  StatTile,
  TabCount,
} from "@/components/admin/kit";
import type { adminGetGiveaway } from "@/lib/giveaway/admin.functions";

import { DrawTab } from "./draw-tab";
import { EntrantsTab } from "./entrants-tab";
import { StatusTag } from "./list-page";
import { SetupTab } from "./setup-tab";

type Data = NonNullable<Awaited<ReturnType<typeof adminGetGiveaway>>>;
type TabId = "setup" | "entrants" | "draw";

export function GiveawayDetailPage({ data }: { data: Data }) {
  const { campaign: c, stats } = data;
  const [tab, setTab] = useState<TabId>(stats.entrants ? "entrants" : "setup");
  const missing = [
    !data.setup.email && "RESEND_API_KEY (confirm emails)",
    !data.setup.turnstile && "TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY (bot check)",
    !data.setup.discord &&
      c.tasks.some((t) => t.enabled && t.kind === "discord") &&
      "DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET (Discord check)",
  ].filter(Boolean);
  return (
    <>
      <PageHeader
        back={<BackLink to="/admin/giveaways">Giveaways</BackLink>}
        title={c.title || "Untitled giveaway"}
        icon={Gift}
        tone="rose"
        badge={
          <span className="flex items-center gap-2">
            <StatusTag status={c.status} />
            <NamespaceBadge ns={data.ns} />
          </span>
        }
        description={`${data.origin}/giveaway/${c.slug}`}
      />
      <PageBody>
        {missing.length ? (
          <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
            Before launch, add on Netlify: {missing.join(" · ")}.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="Confirmed entries"
            value={stats.confirmed}
            icon={Users}
            tone="mint"
            hint={`${stats.pending} not confirmed yet`}
          />
          <StatTile label="Tickets in the draw" value={stats.tickets} icon={Dices} tone="rose" />
          <StatTile
            label="Flagged"
            value={stats.flagged}
            tone="amber"
            hint="Shared network or device, bursts, held referrals"
          />
          <StatTile
            label="Mailing-list sign-ups"
            value={Object.values(stats.optIns).reduce((a, b) => a + b, 0)}
            tone="sky"
            hint={Object.entries(stats.optIns)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          />
        </div>
        <AdminTabs<TabId>
          label="Giveaway"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: "setup",
              label: "Setup",
              icon: Settings2,
              badge: data.problems.length ? (
                <TabCount n={data.problems.length} alert="amber" />
              ) : undefined,
            },
            {
              id: "entrants",
              label: "Entrants",
              icon: Users,
              badge: <TabCount n={stats.entrants} />,
            },
            { id: "draw", label: "Draw", icon: Dices },
          ]}
        >
          <AdminTab value="setup">
            <SetupTab key={c.updatedAt} campaign={c} origin={data.origin} />
          </AdminTab>
          <AdminTab value="entrants">
            <EntrantsTab campaign={c} rows={data.rows} flagLabels={data.flagLabels} />
          </AdminTab>
          <AdminTab value="draw">
            <DrawTab
              campaign={c}
              draws={data.draws}
              rows={data.rows}
              tickets={stats.tickets}
              confirmed={stats.confirmed}
            />
          </AdminTab>
        </AdminTabs>
      </PageBody>
    </>
  );
}
