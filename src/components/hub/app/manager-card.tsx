import { LifeBuoy, Mail, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HUB } from "@/lib/hub/model";

import { Monogram, Panel } from "./ui";

export function ManagerCard({
  manager,
  approved,
}: {
  manager: { name: string; email: string; discord: string } | null;
  approved: boolean;
}) {
  return (
    <Panel className="p-5">
      <h2 className="text-sm text-muted-foreground">Your manager</h2>
      {manager ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <Monogram name={manager.name || manager.email} className="size-11 text-sm" />
            <div className="min-w-0">
              <div className="truncate font-medium">{manager.name || "Your MEDIALIFE manager"}</div>
              <div className="truncate text-sm text-muted-foreground">
                Creator partnerships, MEDIALIFE
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Questions about a product, a date or a payout? Message them here on a product, or reach
            out directly.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {manager.email ? (
              <Button asChild variant="outline" className="justify-start">
                <a href={`mailto:${manager.email}`}>
                  <Mail aria-hidden />
                  <span className="truncate">{manager.email}</span>
                </a>
              </Button>
            ) : null}
            {manager.discord ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-border px-4 text-sm">
                <MessageCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">Discord:</span>
                <span className="truncate">{manager.discord}</span>
                <span className="ml-auto text-xs text-muted-foreground">Discord</span>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-3">
            <span className="grid grid-cols-1 size-11 shrink-0 place-items-center rounded-full border border-dashed border-border">
              <LifeBuoy className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {approved
                ? "We're assigning your manager now. They'll introduce themselves by email."
                : "Your manager will be assigned when you're approved."}
            </p>
          </div>
          <Button asChild variant="outline" className="mt-4 w-full justify-start">
            <a href={`mailto:${HUB.supportEmail}`}>
              <Mail aria-hidden /> {HUB.supportEmail}
            </a>
          </Button>
        </>
      )}
    </Panel>
  );
}
