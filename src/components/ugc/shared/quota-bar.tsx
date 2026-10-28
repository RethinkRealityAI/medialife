/** Storage used against the 5 GB allowance, as a bar with the numbers in words. */
import { formatBytes, type UgcQuota } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { gradientFill } from "./look";

export function QuotaBar({
  quota,
  extraBytes = 0,
  className,
  compact,
}: {
  quota: UgcQuota;
  /** Bytes queued locally that the server doesn't count yet (shown as a lighter segment). */
  extraBytes?: number;
  className?: string;
  compact?: boolean;
}) {
  const used = Math.min(quota.usedBytes, quota.limitBytes);
  const pct = quota.limitBytes ? (used / quota.limitBytes) * 100 : 0;
  const extraPct = quota.limitBytes
    ? Math.min(100 - pct, (Math.max(0, extraBytes) / quota.limitBytes) * 100)
    : 0;
  const left = Math.max(0, quota.limitBytes - quota.usedBytes);
  const high = pct >= 85;
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium tabular-nums">
          {formatBytes(quota.usedBytes)}
          <span className="font-normal text-muted-foreground">
            {" "}
            of {formatBytes(quota.limitBytes)} used
          </span>
        </span>
        {!compact ? (
          <span
            className={cn(
              "text-xs tabular-nums",
              high ? "text-amber-300" : "text-muted-foreground",
            )}
          >
            {formatBytes(left)} left
          </span>
        ) : null}
      </div>
      <div
        role="meter"
        aria-label="Upload storage used"
        aria-valuemin={0}
        aria-valuemax={quota.limitBytes}
        aria-valuenow={used}
        aria-valuetext={`${formatBytes(quota.usedBytes)} of ${formatBytes(quota.limitBytes)} used`}
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.07]"
      >
        <span
          className={cn(
            "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
            high ? "bg-amber-400" : gradientFill,
          )}
          style={{ width: `${Math.max(pct, quota.usedBytes > 0 ? 1.5 : 0)}%` }}
        />
        {extraPct > 0 ? (
          <span className="h-full bg-white/25" style={{ width: `${extraPct}%` }} />
        ) : null}
      </div>
    </div>
  );
}
