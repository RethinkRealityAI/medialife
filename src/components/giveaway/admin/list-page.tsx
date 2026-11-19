import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Gift, Loader2, Plus, Users } from "lucide-react";

import {
  EmptyState,
  NamespaceBadge,
  PageBody,
  PageHeader,
  Tag,
  lift,
  surface,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminCreateGiveaway, type adminListGiveaways } from "@/lib/giveaway/admin.functions";
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "@/lib/giveaway/model";
import { cn } from "@/lib/utils";

type Data = Awaited<ReturnType<typeof adminListGiveaways>>;
const TONE: Record<CampaignStatus, "mint" | "amber" | "slate"> = {
  live: "mint",
  draft: "amber",
  closed: "slate",
};

export function StatusTag({ status }: { status: CampaignStatus }) {
  return <Tag tone={TONE[status]}>{CAMPAIGN_STATUS_LABELS[status]}</Tag>;
}

const fmt = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Not set";

export function GiveawayListPage({ data }: { data: Data }) {
  const [open, setOpen] = useState(false);
  const order = { live: 0, draft: 1, closed: 2 } as const;
  const list = [...data.campaigns].sort(
    (a, b) => order[a.status] - order[b.status] || b.updatedAt - a.updatedAt,
  );
  const newBtn = (
    <Button onClick={() => setOpen(true)}>
      <Plus aria-hidden /> New giveaway
    </Button>
  );
  return (
    <>
      <PageHeader
        title="Giveaways"
        icon={Gift}
        tone="rose"
        badge={<NamespaceBadge ns={data.ns} />}
        description="Points campaigns: people complete tasks, every point is a ticket, and you run an audited draw at the end."
        actions={newBtn}
      />
      <PageBody>
        {!list.length ? (
          <EmptyState icon={Gift} tone="rose" title="No giveaways yet" action={newBtn}>
            A new giveaway starts with the agreed points table. Fill in the prize, dates, links and
            rules, then go live.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 @3xl/inset:grid-cols-2 @6xl/inset:grid-cols-3">
            {list.map((c) => (
              <li key={c.id}>
                <Link
                  to="/admin/giveaways/$campaignId"
                  params={{ campaignId: c.id }}
                  className={cn(surface, lift, "flex h-full flex-col overflow-hidden")}
                >
                  <div className="relative aspect-[16/7] bg-[oklch(0.24_0.09_290)]">
                    {c.heroImage ? (
                      <img
                        src={c.heroImage}
                        alt=""
                        className="absolute inset-0 size-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="absolute top-3 left-3">
                      <StatusTag status={c.status} />
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h2 className="text-base font-semibold tracking-tight">{c.title}</h2>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      /giveaway/{c.slug}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" aria-hidden /> {c.entrants}{" "}
                        {c.entrants === 1 ? "entry" : "entries"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="size-3.5" aria-hidden /> Ends {fmt(c.endsAt)}
                      </span>
                      {c.status === "draft" && c.problems ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-300">
                          <AlertTriangle className="size-3.5" aria-hidden /> {c.problems} to fill in
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageBody>
      <NewDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function NewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await adminCreateGiveaway({ data: { slug } });
      if (!r.ok) return setError(r.error);
      onOpenChange(false);
      await navigate({ to: "/admin/giveaways/$campaignId", params: { campaignId: r.id } });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={create}>
          <DialogHeader>
            <DialogTitle>New giveaway</DialogTitle>
            <DialogDescription>
              Pick its web address. It starts as a draft with the standard tasks and points; nothing
              is public until you go live.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-2">
            <Label htmlFor="gw-slug">Web address</Label>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="shrink-0 text-muted-foreground">medialife.ai/giveaway/</span>
              <Input
                id="gw-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                placeholder="evade-launch"
                autoFocus
                aria-invalid={!!error}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || slug.length < 3}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
