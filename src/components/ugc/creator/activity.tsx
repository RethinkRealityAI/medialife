/** Recent activity on Home: what happened, who did it, when. */
import {
  ClipboardList,
  Gift,
  MessageSquare,
  Radio,
  Sparkles,
  Truck,
  Upload,
  UserRound,
  BadgeCheck,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { TimeAgo } from "@/components/hub/app/ui";
import type { UgcActivity } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const ICONS: Record<UgcActivity["kind"], LucideIcon> = {
  account: Sparkles,
  status: RefreshCw,
  shipment: Truck,
  brief: ClipboardList,
  upload: Upload,
  review: BadgeCheck,
  comment: MessageSquare,
  posted: Radio,
  perk: Gift,
  profile: UserRound,
};

export function ActivityFeed({ items, className }: { items: UgcActivity[]; className?: string }) {
  if (!items.length)
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Nothing yet. Updates from you and the team show up here.
      </p>
    );
  return (
    <ol className={cn("space-y-1", className)}>
      {items.map((a) => {
        const Icon = ICONS[a.kind] ?? Sparkles;
        const team = a.actor === "medialife";
        return (
          <li key={a.id} className="flex gap-3 rounded-xl px-1 py-2.5">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
                team
                  ? "bg-[#f6c344]/10 text-[#ffe48a] ring-[#f6c344]/25"
                  : "bg-white/[0.05] text-[#bff7f4] ring-white/10",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug font-medium text-pretty [overflow-wrap:anywhere]">
                {a.title}
              </p>
              {a.body ? (
                <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                  {a.body}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {team ? "MEDIALIFE · " : ""}
                <TimeAgo ts={a.at} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
