import { Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  CircleDollarSign,
  FileImage,
  FileSignature,
  MessageSquare,
  Rocket,
  ShoppingBag,
  Sparkles,
  ThumbsUp,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { type Activity, type ActivityKind } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { TimeAgo } from "./ui";

const ICONS: Record<ActivityKind, LucideIcon> = {
  account: UserRound,
  application: FileSignature,
  stage: Rocket,
  proof: BadgeCheck,
  decision: ThumbsUp,
  file: FileImage,
  experience: Sparkles,
  order: ShoppingBag,
  payout: CircleDollarSign,
  message: MessageSquare,
};

/**
 * The activity log. `compact` is one line per item for the Home card; the full
 * form (titles, bodies, times) is for the Activity drawer.
 */
export function ActivityFeed({
  items,
  limit,
  compact = false,
  onNavigate,
}: {
  items: Activity[];
  limit?: number;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  if (!shown.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Updates from the team will show up here.
      </p>
    );
  }
  return (
    <ol className={compact ? "space-y-0.5" : "space-y-1"}>
      {shown.map((a) => {
        const Icon = ICONS[a.kind] ?? Sparkles;
        const inner = (
          <>
            <span
              className={cn(
                "grid shrink-0 place-items-center rounded-full border",
                compact ? "size-7" : "mt-0.5 size-8",
                a.actionable
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-border bg-white/[0.03] text-muted-foreground",
              )}
            >
              <Icon className={compact ? "size-3.5" : "size-4"} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("flex items-baseline gap-x-2", compact ? "" : "flex-wrap")}>
                <span className={cn("text-sm", compact ? "truncate" : "font-medium")}>
                  {a.title}
                </span>
                {a.actionable && !compact ? (
                  <span className="text-xs font-medium text-amber-300">Needs you</span>
                ) : null}
              </span>
              {a.body && !compact ? (
                <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
                  {a.body}
                </span>
              ) : null}
              <TimeAgo
                ts={a.at}
                className={cn("block text-xs text-muted-foreground/80", !compact && "mt-1")}
              />
            </span>
            {a.actionable && compact ? (
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400"
                aria-label="Needs you"
              />
            ) : null}
          </>
        );
        const cls = cn(
          "flex items-start gap-3 rounded-lg",
          compact ? "px-1.5 py-1.5" : "p-2.5",
          a.actionable && !compact && "bg-amber-400/[0.05]",
        );
        return (
          <li key={a.id}>
            {a.productId ? (
              <Link
                to="/creator-hub/products/$productId"
                params={{ productId: a.productId }}
                onClick={onNavigate}
                className={cn(
                  cls,
                  "transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                )}
              >
                {inner}
              </Link>
            ) : (
              <div className={cls}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
