/** A small switcher for creators on more than one campaign (rare; hidden otherwise). */
import { useRouter } from "@tanstack/react-router";

import { select } from "@/components/ugc/shared/look";
import { cn } from "@/lib/utils";

export function CampaignSwitch({
  current,
  others,
  path,
  className,
}: {
  current: { id: string; title: string };
  others: { id: string; title: string }[];
  /** The page to reload with ?campaign=. */
  path: string;
  className?: string;
}) {
  const router = useRouter();
  if (!others.length) return null;
  return (
    <label className={cn("block max-w-xs", className)}>
      <span className="sr-only">Campaign</span>
      <select
        className={cn(select, "h-11")}
        value={current.id}
        onChange={(e) =>
          void router.navigate({ href: `${path}?campaign=${encodeURIComponent(e.target.value)}` })
        }
      >
        {[current, ...others].map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
    </label>
  );
}
