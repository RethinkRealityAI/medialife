import { createContext, useContext, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Hand,
  MailCheck,
  Sparkles,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resendVerification } from "@/lib/hub/auth.functions";
import { cn } from "@/lib/utils";

import { ResponsiveDrawer } from "./responsive-drawer";
import type { ActionItem } from "./workspace";

export const ACTION_ICONS: Record<ActionItem["kind"], LucideIcon> = {
  proof: BadgeCheck,
  product: Hand,
  experience: Sparkles,
  verify: MailCheck,
  payout: CreditCard,
  shipping: Truck,
};

/* ---------------------------------------------------------------------------
   The drawer, opened from the top bar and from Home
   --------------------------------------------------------------------------- */

const NeedsYouContext = createContext<{ open: () => void; items: ActionItem[] }>({
  open: () => {},
  items: [],
});

export const useNeedsYou = () => useContext(NeedsYouContext);

export function NeedsYouProvider({
  items,
  children,
}: {
  items: ActionItem[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <NeedsYouContext.Provider value={{ open: () => setOpen(true), items }}>
      {children}
      <ResponsiveDrawer
        open={open}
        onOpenChange={setOpen}
        title={items.length ? `Needs you (${items.length})` : "Needs you"}
        description={
          items.length
            ? "Most important first. Everything else keeps moving without you."
            : undefined
        }
      >
        {items.length ? (
          <NeedsYouRows items={items} onAction={() => setOpen(false)} />
        ) : (
          <div className="flex flex-col items-center py-10 text-center">
            <CheckCircle2 className="size-8 text-emerald-400" aria-hidden />
            <p className="mt-3 font-medium">You're all caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">
              We'll let you know when something needs you.
            </p>
          </div>
        )}
      </ResponsiveDrawer>
    </NeedsYouContext.Provider>
  );
}

/* ---------------------------------------------------------------------------
   Actions
   --------------------------------------------------------------------------- */

function ResendButton({ size = "sm" }: { size?: "sm" | "default" | "lg" }) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  return (
    <Button
      type="button"
      size={size}
      variant="outline"
      disabled={state !== "idle"}
      onClick={async () => {
        setState("busy");
        try {
          const r = await resendVerification();
          if (!r.ok) {
            toast.error(r.error);
            setState("idle");
            return;
          }
          if (r.already) toast.success("Your email is already confirmed.");
          else toast.success("Sent. Check your inbox (and spam) for the link.");
          if (r.devLink) toast.message("Dev: verification link", { description: r.devLink });
          setState("sent");
        } catch {
          toast.error("Couldn't send the email. Try again in a moment.");
          setState("idle");
        }
      }}
    >
      {state === "busy" ? "Sending…" : state === "sent" ? "Email sent" : "Resend email"}
    </Button>
  );
}

/** The one button an action item needs: a link to where it's done, or the resend. */
export function ActionButton({
  item,
  size = "sm",
  variant = "default",
  className,
  onClick,
}: {
  item: ActionItem;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "secondary";
  className?: string;
  onClick?: () => void;
}) {
  if (item.kind === "verify") return <ResendButton size={size} />;
  const l = item.link;
  if (!l) return null;
  const label = (
    <>
      {item.cta} <ArrowRight aria-hidden />
    </>
  );
  return (
    <Button asChild size={size} variant={variant} className={className}>
      {l.to === "/creator-hub/products/$productId" ? (
        <Link
          to={l.to}
          params={{ productId: l.productId }}
          search={{ tab: l.tab, review: l.review || undefined }}
          onClick={onClick}
        >
          {label}
        </Link>
      ) : l.to === "/creator-hub/experiences" ? (
        <Link to={l.to} search={{ preview: l.preview }} onClick={onClick}>
          {label}
        </Link>
      ) : l.to === "/creator-hub/account" ? (
        <Link to={l.to} search={{ section: l.section }} onClick={onClick}>
          {label}
        </Link>
      ) : (
        <Link to={l.to} onClick={onClick}>
          {label}
        </Link>
      )}
    </Button>
  );
}

export function ActionThumb({ item, className }: { item: ActionItem; className?: string }) {
  const Icon = ACTION_ICONS[item.kind];
  return item.image ? (
    <img
      src={item.image}
      alt=""
      className={cn("shrink-0 rounded-lg border border-border object-cover", className)}
    />
  ) : (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border border-border bg-white/[0.04]",
        className,
      )}
    >
      <Icon className="size-5 text-amber-300" aria-hidden />
    </span>
  );
}

/** A compact list of every item, for the drawer. */
export function NeedsYouRows({ items, onAction }: { items: ActionItem[]; onAction?: () => void }) {
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li
          key={item.id}
          className={cn(
            "flex gap-3 rounded-xl border p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1",
            item.kind === "proof" ? "border-amber-400/40 bg-amber-400/[0.05]" : "border-border",
          )}
          style={{ animationDelay: `${i * 40}ms`, animationFillMode: "both" }}
        >
          <ActionThumb item={item} className="size-12" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{item.title}</h3>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            <div className="mt-2.5">
              <ActionButton
                item={item}
                variant={item.kind === "proof" ? "default" : "outline"}
                onClick={onAction}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
