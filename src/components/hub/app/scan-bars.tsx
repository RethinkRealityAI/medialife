/**
 * Daily scans as small bars. One series, so no legend; every bar has a hover
 * label and the whole thing has a text summary for screen readers.
 */
import { cn } from "@/lib/utils";

const label = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function lastDays(byDay: Record<string, number>, days: number, now = Date.now()) {
  const out: Array<{ date: string; n: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date, n: byDay[date] ?? 0 });
  }
  return out;
}

export function ScanBars({
  byDay,
  days = 14,
  className,
}: {
  byDay: Record<string, number>;
  days?: number;
  className?: string;
}) {
  const data = lastDays(byDay, days);
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);

  return (
    <figure className={cn("m-0", className)}>
      <div className="flex h-20 items-end gap-1" aria-hidden>
        {data.map((d) => (
          <div key={d.date} className="group relative flex h-full min-w-0 flex-1 items-end">
            <div
              className={cn(
                "w-full rounded-t-[3px]",
                d.n ? "bg-primary/80 group-hover:bg-primary" : "h-0.5 bg-white/10",
              )}
              style={d.n ? { height: `${Math.max(6, (d.n / max) * 100)}%` } : undefined}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap shadow-lg group-hover:block">
              {label(d.date)}: <span className="font-medium tabular-nums">{d.n}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
        <span>{label(data[0].date)}</span>
        <span>Today</span>
      </div>
      <figcaption className="sr-only">
        {total} scans in the last {days} days.{" "}
        {data
          .filter((d) => d.n)
          .map((d) => `${label(d.date)}: ${d.n}`)
          .join(", ")}
      </figcaption>
    </figure>
  );
}
