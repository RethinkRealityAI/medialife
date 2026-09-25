import type { Dashboard } from "@/lib/ar/analytics.server";

import { formatDuration, formatNumber, pct } from "../format";
import { StatTile } from "../kit";

const share = (n: number, of: number) => (of ? n / of : 0);

export function KpiRow({ data }: { data: Dashboard | undefined }) {
  const t = data?.totals;
  const loading = !t;
  const v = t?.visits ?? 0;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        loading={loading}
        label="Visits"
        value={formatNumber(v)}
        hint={
          t?.bounced
            ? `Plus ${t.bounced} bounced open${t.bounced === 1 ? "" : "s"}`
            : "No bounced opens"
        }
      />
      <StatTile
        loading={loading}
        label="Unique visitors"
        value={formatNumber(t?.visitors ?? 0)}
        hint="Counted per browser"
      />
      <StatTile
        loading={loading}
        label="Avg engaged time"
        value={formatDuration(t?.avgEngagedMs ?? 0)}
        hint={t ? `${formatDuration(t.engagedMs)} in total, tab visible` : undefined}
      />
      <StatTile
        loading={loading}
        label="Finished the tour"
        value={pct(t?.tourFinished ?? 0, v)}
        meter={v ? share(t?.tourFinished ?? 0, v) : null}
        hint={t ? `${pct(t.tourSkipped, v)} skipped it` : undefined}
      />
      <StatTile
        loading={loading}
        label="Opened a product"
        value={pct(t?.productVisits ?? 0, v)}
        meter={v ? share(t?.productVisits ?? 0, v) : null}
        hint={t ? `${t.productVisits} of ${v} visits` : undefined}
      />
      <StatTile
        loading={loading}
        label="Tried the activation"
        value={pct(t?.activationVisits ?? 0, v)}
        meter={v ? share(t?.activationVisits ?? 0, v) : null}
        hint={t ? `${t.activationVisits} of ${v} visits` : undefined}
      />
      <StatTile
        loading={loading}
        label="AR opens"
        value={formatNumber(t?.arOpens ?? 0)}
        hint={t ? `In ${t.arVisits} visit${t.arVisits === 1 ? "" : "s"}` : undefined}
      />
      <StatTile
        loading={loading}
        label="Leads"
        value={formatNumber(t?.leads ?? 0)}
        hint="Contact requests sent from a demo"
      />
    </div>
  );
}
