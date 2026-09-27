import {
  Box,
  Flag,
  Mail,
  MessageSquare,
  Package,
  ShoppingCart,
  SkipForward,
  Smartphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Highlights } from "@/lib/ar/analytics.server";
import { cn } from "@/lib/utils";

interface Chip {
  icon: LucideIcon;
  label: string;
  /** what a follow-up should notice first */
  strong?: boolean;
  muted?: boolean;
}

function chipsFor(h: Highlights): Chip[] {
  const out: Chip[] = [];
  if (h.leads)
    out.push({
      icon: Mail,
      label: h.leads > 1 ? `${h.leads} leads sent` : "Lead sent",
      strong: true,
    });
  else if (h.cta) out.push({ icon: MessageSquare, label: "Opened contact", strong: true });
  if (h.products)
    out.push({ icon: Package, label: `${h.products} product${h.products === 1 ? "" : "s"}` });
  if (h.launched) out.push({ icon: Smartphone, label: "Played activation" });
  else if (h.activation) out.push({ icon: Smartphone, label: "Tried activation" });
  if (h.ar) out.push({ icon: Box, label: "Launched AR" });
  if (h.cart) out.push({ icon: ShoppingCart, label: "Demo checkout" });
  if (h.tour === "finished") out.push({ icon: Flag, label: "Finished tour" });
  else if (h.tour === "skipped")
    out.push({ icon: SkipForward, label: "Skipped tour", muted: true });
  return out;
}

export function HighlightChips({
  highlights,
  className,
  empty = null,
}: {
  highlights: Highlights;
  className?: string;
  empty?: React.ReactNode;
}) {
  const chips = chipsFor(highlights);
  if (!chips.length) return <>{empty}</>;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {chips.map((c) => (
        <li
          key={c.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-5 whitespace-nowrap",
            c.strong
              ? "border-accent/45 bg-accent/10 text-foreground"
              : c.muted
                ? "border-border text-muted-foreground"
                : "border-border bg-white/[0.03] text-foreground/90",
          )}
        >
          <c.icon
            className={cn("size-3", c.strong ? "text-accent" : "text-muted-foreground")}
            aria-hidden
          />
          {c.label}
        </li>
      ))}
    </ul>
  );
}
