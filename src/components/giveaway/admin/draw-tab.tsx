/**
 * The draw: run it once entries close, then work through each winner: check
 * their handles, send the skill-testing question, mark claimed, or forfeit (the
 * next alternate steps in). Every draw keeps its seed and ticket snapshot hash.
 */
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Dices, Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Panel, PanelTitle, Tag } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminEmailWinner, adminRunDraw, adminSetPick } from "@/lib/giveaway/admin.functions";
import type { AdminEntrantRow } from "@/lib/giveaway/giveaway.server";
import {
  GIVEAWAY,
  PLATFORM_LABELS,
  WINNER_STATUS_LABELS,
  campaignPhase,
  type GiveawayCampaign,
  type GiveawayDraw,
  type WinnerStatus,
} from "@/lib/giveaway/model";

const TONE: Record<WinnerStatus, "amber" | "sky" | "mint" | "rose"> = {
  pending: "amber",
  verified: "sky",
  claimed: "mint",
  forfeited: "rose",
};

export function DrawTab({
  campaign: c,
  draws,
  rows,
  tickets,
  confirmed,
}: {
  campaign: GiveawayCampaign;
  draws: GiveawayDraw[];
  rows: AdminEntrantRow[];
  tickets: number;
  confirmed: number;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const phase = campaignPhase(c);
  const latest = draws[0];

  async function run(
    key: string,
    fn: () => Promise<{ ok: boolean; error?: string; devLink?: string | null }>,
    done: string,
  ) {
    setBusy(key);
    try {
      const r = await fn();
      if (!r.ok) return toast.error(r.error ?? "Couldn't do that.");
      toast.success(
        done,
        r.devLink
          ? { description: "Test mode: no email service yet, so nothing was sent." }
          : undefined,
      );
      await router.invalidate();
    } finally {
      setBusy(null);
    }
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const prizeTitle = (id: string | null) => c.prizes.find((p) => p.id === id)?.title ?? "";

  return (
    <div className="grid gap-5">
      <Panel className="p-5">
        <PanelTitle
          icon={Dices}
          tone="rose"
          title="Run the draw"
          sub={`${confirmed} confirmed ${confirmed === 1 ? "entry" : "entries"}, ${tickets} tickets. Picks one winner per prize plus ${GIVEAWAY.alternates} alternates, weighted by points, without repeats.`}
          actions={
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!!busy || !c.prizes.length || !confirmed}
            >
              {busy === "draw" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Dices aria-hidden />
              )}{" "}
              {latest ? "Run a new draw" : "Run the draw"}
            </Button>
          }
        />
        {phase === "open" ? (
          <p className="mt-3 text-sm text-amber-200">
            Entries are still open. Normally you'd close entries first so everyone's points are
            final.
          </p>
        ) : null}
      </Panel>

      {!latest ? (
        <EmptyState icon={Dices} tone="rose" title="No draw yet">
          When entries close, run the draw here. Winners and alternates are saved with the random
          seed so the result can be reproduced.
        </EmptyState>
      ) : (
        <Panel className="p-5">
          <PanelTitle
            title={`Draw of ${new Date(latest.at).toLocaleString()}`}
            sub={`${latest.entrants} entries · ${latest.totalTickets} tickets · seed ${latest.seed.slice(0, 12)}… · snapshot ${latest.snapshotHash.slice(0, 12)}…`}
          />
          <ol className="mt-4 grid gap-3">
            {latest.picks.map((p, i) => {
              const r = byId.get(p.entrantId);
              return (
                <li key={p.entrantId} className="rounded-xl border border-white/[0.08] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                        <span className="font-semibold">{r?.name || r?.email || p.entrantId}</span>
                        <Tag tone={p.role === "winner" ? "rose" : "slate"}>
                          {p.role === "winner" ? `Winner: ${prizeTitle(p.prizeId)}` : "Alternate"}
                        </Tag>
                        <Tag tone={TONE[p.status]}>{WINNER_STATUS_LABELS[p.status]}</Tag>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r?.email} · {p.tickets} tickets
                      </p>
                      {r?.handles.length ? (
                        <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                          {r.handles.map((h) => (
                            <li key={h.taskId}>
                              <a
                                href={h.url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full bg-white/[0.05] px-2.5 py-1 hover:bg-white/[0.1]"
                              >
                                {h.platform
                                  ? PLATFORM_LABELS[h.platform as keyof typeof PLATFORM_LABELS]
                                  : h.title}
                                : @{h.handle}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {p.role === "winner" ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Skill-testing question: {p.skillQuestion} (answer {p.skillAnswer})
                        </p>
                      ) : null}
                    </div>
                    {p.role === "winner" && p.status !== "claimed" && p.status !== "forfeited" ? (
                      <div className="flex flex-wrap gap-2">
                        {p.status === "pending" ? (
                          <Button
                            size="sm"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                p.entrantId,
                                async () => {
                                  const m = await adminEmailWinner({
                                    data: {
                                      campaignId: c.id,
                                      drawId: latest.id,
                                      entrantId: p.entrantId,
                                    },
                                  });
                                  if (!m.ok) return m;
                                  const s = await adminSetPick({
                                    data: {
                                      campaignId: c.id,
                                      drawId: latest.id,
                                      entrantId: p.entrantId,
                                      status: "verified",
                                    },
                                  });
                                  return { ...s, devLink: m.devLink };
                                },
                                "Handles checked and winner emailed",
                              )
                            }
                          >
                            <ShieldCheck aria-hidden /> <Mail aria-hidden /> Checked, email winner
                          </Button>
                        ) : null}
                        {p.status === "verified" ? (
                          <Button
                            size="sm"
                            disabled={!!busy}
                            onClick={() =>
                              run(
                                p.entrantId,
                                () =>
                                  adminSetPick({
                                    data: {
                                      campaignId: c.id,
                                      drawId: latest.id,
                                      entrantId: p.entrantId,
                                      status: "claimed",
                                    },
                                  }),
                                "Marked as claimed",
                              )
                            }
                          >
                            Answered correctly, claimed
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => {
                            const notes = window.prompt(
                              "Why is this prize forfeited? (e.g. didn't follow, no reply in 7 days, wrong answer)",
                            );
                            if (notes != null)
                              void run(
                                p.entrantId,
                                () =>
                                  adminSetPick({
                                    data: {
                                      campaignId: c.id,
                                      drawId: latest.id,
                                      entrantId: p.entrantId,
                                      status: "forfeited",
                                      notes,
                                    },
                                  }),
                                "Forfeited: the next alternate is now the winner",
                              );
                          }}
                        >
                          Forfeit
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {p.notes ? (
                    <p className="mt-2 text-xs text-muted-foreground">Note: {p.notes}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Before emailing a winner, open each handle above and confirm they follow the account. If
            they don't, remove those points in the Entrants tab and forfeit, or forfeit and note
            why.
          </p>
        </Panel>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{latest ? "Run a new draw?" : "Run the draw?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {latest
                ? "The earlier draw stays on record, but this page will show the new one. Only redraw if the first was a mistake (for example, it ran before entries closed)."
                : `This picks the winners now from ${confirmed} confirmed entries. It's recorded with its random seed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                run("draw", () => adminRunDraw({ data: { campaignId: c.id } }), "Draw complete")
              }
            >
              Run the draw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
