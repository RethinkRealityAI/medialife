import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
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

import type { ActionItem } from "./workspace";

const ICONS: Record<ActionItem["kind"], LucideIcon> = {
  proof: BadgeCheck,
  product: Hand,
  experience: Sparkles,
  verify: MailCheck,
  payout: CreditCard,
  shipping: Truck,
};

function ResendButton() {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  return (
    <Button
      type="button"
      size="sm"
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

export function NeedsYouList({ items, single = false }: { items: ActionItem[]; single?: boolean }) {
  return (
    <ul
      className={
        single ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 @3xl/inset:grid-cols-2"
      }
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind];
        const urgent = item.kind === "proof";
        return (
          <li
            key={item.id}
            className={
              urgent
                ? "flex gap-4 rounded-xl border border-amber-400/45 bg-amber-400/[0.06] p-4"
                : "flex gap-4 rounded-xl border border-border bg-white/[0.025] p-4"
            }
          >
            {item.image ? (
              <img
                src={item.image}
                alt=""
                className="size-14 shrink-0 rounded-lg border border-border object-cover"
              />
            ) : (
              <span className="grid grid-cols-1 size-14 shrink-0 place-items-center rounded-lg border border-border bg-white/[0.04]">
                <Icon className="size-6 text-amber-300" aria-hidden />
              </span>
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="font-medium">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              <div className="mt-3">
                {item.kind === "verify" ? (
                  <ResendButton />
                ) : item.link ? (
                  <Button asChild size="sm" variant={urgent ? "default" : "outline"}>
                    {item.link.to === "/creator-hub/products/$productId" ? (
                      <Link
                        to={item.link.to}
                        params={{ productId: item.link.productId }}
                        hash={item.link.hash}
                      >
                        {item.cta} <ArrowRight aria-hidden />
                      </Link>
                    ) : (
                      <Link to={item.link.to} hash={item.link.hash}>
                        {item.cta} <ArrowRight aria-hidden />
                      </Link>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
