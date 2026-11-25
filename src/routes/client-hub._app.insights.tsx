import { createFileRoute } from "@tanstack/react-router";
import { Gauge, Gem, Gift, KeyRound } from "lucide-react";

import {
  ClientHeader,
  ClientPage,
  ClientSection,
  Chip,
  Empty,
  Stat,
  card,
  day,
} from "@/components/client/ui";
import { getClientInsights } from "@/lib/client/hub.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/insights")({
  head: () => ({ meta: [{ title: "Numbers · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientInsights(),
  staleTime: 30_000,
  component: Insights,
});

function Insights() {
  const { collector, giveaways } = Route.useLoaderData();
  const codes = collector?.batches.reduce((s, b) => s + (b.size ?? 0), 0) ?? 0;
  const claimed = collector?.batches.reduce((s, b) => s + b.claimed, 0) ?? 0;
  return (
    <ClientPage>
      <ClientHeader
        eyebrow="Fans"
        title="Numbers"
        description="How fans are activating merch and joining campaigns. Updated live."
      />
      {collector ? (
        <ClientSection
          title="Collector Hub"
          description="Fans who scanned a merch code and opened Bobo's Hideout."
          className="mt-8"
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat icon={Gem} label="Owners" value={collector.owners} hint="Fans with a room" />
            <Stat
              icon={KeyRound}
              label="Codes claimed"
              value={claimed}
              hint={codes ? `of ${codes.toLocaleString()} printed` : "No batches yet"}
            />
            <Stat
              icon={Gauge}
              label="Claim rate"
              value={codes ? `${Math.round((claimed / codes) * 100)}%` : "–"}
              hint="Claimed ÷ printed"
            />
          </div>
          {collector.batches.length ? (
            <div className={cn(card, "mt-4 overflow-x-auto")}>
              <table className="w-full min-w-[480px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 text-right font-medium">Printed</th>
                    <th className="px-4 py-3 text-right font-medium">Claimed</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {collector.batches.map((b) => (
                    <tr key={b.key}>
                      <td className="px-4 py-3 font-medium">{b.label}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {b.size?.toLocaleString() ?? "–"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {b.claimed.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <Chip tone={b.status === "active" ? "good" : "muted"}>{b.status}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </ClientSection>
      ) : null}

      <ClientSection title="Giveaways">
        {giveaways.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {giveaways.map((g) => (
              <li key={g.id} className={cn(card, "flex items-center gap-4 p-4")}>
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.05]">
                  {g.heroImage ? (
                    <img src={g.heroImage} alt="" className="size-full object-cover" />
                  ) : (
                    <Gift className="size-6 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{g.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {g.startsAt ? day(g.startsAt) : "No start date"}
                    {g.endsAt ? ` to ${day(g.endsAt)}` : ""}
                  </span>
                  <span className="mt-1.5 inline-block">
                    <Chip tone={g.status === "live" ? "good" : "muted"}>{g.status}</Chip>
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-2xl font-semibold tabular-nums">
                    {g.entrants.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">entrants</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Gift} title="No giveaways shared yet">
            Campaigns we run for you show their entries here.
          </Empty>
        )}
      </ClientSection>
    </ClientPage>
  );
}
