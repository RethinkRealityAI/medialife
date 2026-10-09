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

export function ActivityFeed({ items, limit = 8 }: { items: Activity[]; limit?: number }) {
  const shown = items.slice(0, limit);
  if (!shown.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing yet. Updates from the team will show up here.
      </p>
    );
  }
  return (
    <ol className="space-y-1">
      {shown.map((a) => {
        const Icon = ICONS[a.kind] ?? Sparkles;
        const inner = (
          <>
            <span
              className={cn(
                "mt-0.5 grid grid-cols-1 size-8 shrink-0 place-items-center rounded-full border",
                a.actionable
                  ? "border-amber-400/50 bg-amber-400/10 text-amber-300"
                  : "border-border bg-white/[0.03] text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{a.title}</span>
                {a.actionable ? (
                  <span className="text-xs font-medium text-amber-300">Needs you</span>
                ) : null}
              </span>
              {a.body ? (
                <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
                  {a.body}
                </span>
              ) : null}
              <TimeAgo ts={a.at} className="mt-1 block text-xs text-muted-foreground/80" />
            </span>
          </>
        );
        const cls = cn("flex gap-3 rounded-lg p-2.5", a.actionable && "bg-amber-400/[0.05]");
        return (
          <li key={a.id}>
            {a.productId ? (
              <Link
                to="/creator-hub/products/$productId"
                params={{ productId: a.productId }}
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
