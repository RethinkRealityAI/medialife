/**
 * Entrants: leaderboard by points with fraud flags, a detail sheet with the
 * points ledger (void a row, add/remove points, void the whole entry), and CSV
 * exports for the entrant list and each mailing list.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, Download, Loader2, Search, ShieldOff, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Panel, Tag } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  adminAdjustPoints,
  adminExportCsv,
  adminGetEntrant,
  adminVoidEntrant,
} from "@/lib/giveaway/admin.functions";
import type { AdminEntrantRow, EntrantFlag } from "@/lib/giveaway/giveaway.server";
import { PLATFORM_LABELS, type Entrant, type GiveawayCampaign } from "@/lib/giveaway/model";
import { cn } from "@/lib/utils";

type Filter = "all" | "confirmed" | "pending" | "flagged" | "void";

export function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function EntrantsTab({
  campaign: c,
  rows,
  flagLabels,
}: {
  campaign: GiveawayCampaign;
  rows: AdminEntrantRow[];
  flagLabels: Record<EntrantFlag, string>;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        filter === "flagged"
          ? !(r.flags.length && r.status !== "void")
          : filter !== "all" && r.status !== filter
      )
        return false;
      return (
        !s ||
        r.email.includes(s) ||
        r.name.toLowerCase().includes(s) ||
        r.handles.some((h) => h.handle.toLowerCase().includes(s))
      );
    });
  }, [rows, q, filter]);

  async function exportCsv(kind: "entrants" | "subscribers", listId?: string) {
    const r = await adminExportCsv({ data: { campaignId: c.id, kind, listId } });
    if (r) download(r.filename, r.csv);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search email, name or handle"
            className="pl-9"
            aria-label="Search entrants"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter">
          {(["all", "confirmed", "pending", "flagged", "void"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "secondary" : "ghost"}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f === "void" ? "Voided" : f}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => exportCsv("entrants")}>
          <Download aria-hidden /> Entrants CSV
        </Button>
        {c.optIns.map((o) => (
          <Button
            key={o.id}
            variant="outline"
            size="sm"
            onClick={() => exportCsv("subscribers", o.id)}
          >
            <Download aria-hidden /> {o.id} subscribers
          </Button>
        ))}
      </div>

      {!shown.length ? (
        <EmptyState icon={Search} title={rows.length ? "No one matches" : "No entries yet"}>
          {rows.length
            ? "Try another search or filter."
            : "Entries appear here as soon as people enter on the public page."}
        </EmptyState>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b border-white/[0.07]">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Entrant</th>
                <th className="px-4 py-3 text-right font-medium">Points</th>
                <th className="px-4 py-3 font-medium">Tasks</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03]"
                  onClick={() => setOpen(r.id)}
                >
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-left focus-visible:underline focus-visible:outline-none"
                      onClick={() => setOpen(r.id)}
                    >
                      <span className="block font-medium">{r.name || r.email.split("@")[0]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.email} · {r.country}
                        {r.region ? `-${r.region}` : ""}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{r.points}</td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {r.tasksDone}
                    {r.referrals ? ` · ${r.referrals} ref` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Tag
                      tone={
                        r.status === "confirmed"
                          ? "mint"
                          : r.status === "pending"
                            ? "amber"
                            : "rose"
                      }
                    >
                      {r.status === "confirmed"
                        ? "Confirmed"
                        : r.status === "pending"
                          ? "Not confirmed"
                          : "Voided"}
                    </Tag>
                  </td>
                  <td className="px-4 py-3">
                    {r.flags.length ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-amber-300"
                        title={r.flags.map((f) => flagLabels[f]).join(", ")}
                      >
                        <AlertTriangle className="size-3.5" aria-hidden />{" "}
                        {r.flags.map((f) => flagLabels[f]).join(", ")}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <EntrantSheet
        campaign={c}
        entrantId={open}
        row={rows.find((r) => r.id === open) ?? null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function EntrantSheet({
  campaign: c,
  entrantId,
  row,
  onClose,
}: {
  campaign: GiveawayCampaign;
  entrantId: string | null;
  row: AdminEntrantRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [e, setE] = useState<Entrant | null>(null);
  const [pts, setPts] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setE(null);
    if (!entrantId) return;
    let live = true;
    void adminGetEntrant({ data: { campaignId: c.id, entrantId } }).then((x) => live && setE(x));
    return () => {
      live = false;
    };
  }, [c.id, entrantId]);

  async function refresh() {
    if (!entrantId) return;
    setE(await adminGetEntrant({ data: { campaignId: c.id, entrantId } }));
    await router.invalidate();
  }

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Couldn't do that.");
      else {
        toast.success(done);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const taskTitle = (id: string | null) => c.tasks.find((t) => t.id === id)?.title ?? "";
  return (
    <Sheet open={!!entrantId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{row?.name || row?.email || "Entrant"}</SheetTitle>
          <SheetDescription>{row?.email}</SheetDescription>
        </SheetHeader>
        {!e ? (
          <div className="grid place-items-center py-16">
            <Loader2 className="animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : (
          <div className="grid min-w-0 gap-5 px-4 pb-8 [&>*]:min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular-nums">{e.points}</span>
              <span className="text-sm text-muted-foreground">points</span>
              {e.status === "void" ? <Tag tone="rose">Voided: {e.voidReason}</Tag> : null}
            </div>

            {row?.handles.length ? (
              <section>
                <h3 className="text-sm font-semibold">Handles to check if they win</h3>
                <ul className="mt-2 grid gap-1.5 text-sm">
                  {row.handles.map((h) => (
                    <li
                      key={h.taskId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
                    >
                      <span>
                        {h.title}{" "}
                        <span className="text-muted-foreground">
                          (
                          {h.platform
                            ? PLATFORM_LABELS[h.platform as keyof typeof PLATFORM_LABELS]
                            : ""}
                          )
                        </span>
                      </span>
                      <span className="font-mono">@{h.handle}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="text-sm font-semibold">Points history</h3>
              <ul className="mt-2 grid gap-1.5 text-sm">
                {[...e.ledger].reverse().map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2",
                      r.voided && "opacity-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className={cn("block truncate", r.voided && "line-through")}>
                        {r.note || taskTitle(r.taskId) || r.kind}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(r.at).toLocaleString()}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="font-semibold tabular-nums">
                        {r.points > 0 ? `+${r.points}` : r.points}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              adminAdjustPoints({
                                data: {
                                  campaignId: c.id,
                                  entrantId: e.id,
                                  rowId: r.id,
                                  voided: !r.voided,
                                },
                              }),
                            r.voided ? "Points restored" : "Points removed",
                          )
                        }
                      >
                        {r.voided ? "Restore" : "Remove"}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="grid gap-2">
              <h3 className="text-sm font-semibold">Adjust points</h3>
              <div className="flex gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={pts}
                  onChange={(ev) => setPts(ev.target.value)}
                  placeholder="+5 or -5"
                  className="w-28"
                  aria-label="Points"
                />
                <Input
                  value={note}
                  onChange={(ev) => setNote(ev.target.value)}
                  placeholder="Why (shown in the history)"
                  aria-label="Reason"
                />
                <Button
                  disabled={busy || !Number(pts)}
                  onClick={() =>
                    run(async () => {
                      const r = await adminAdjustPoints({
                        data: { campaignId: c.id, entrantId: e.id, points: Number(pts), note },
                      });
                      if (r.ok) {
                        setPts("");
                        setNote("");
                      }
                      return r;
                    }, "Points adjusted")
                  }
                >
                  Apply
                </Button>
              </div>
            </section>

            <section className="grid gap-2 border-t border-white/[0.07] pt-4">
              {e.status === "void" ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        adminVoidEntrant({
                          data: { campaignId: c.id, entrantId: e.id, voided: false },
                        }),
                      "Entry restored",
                    )
                  }
                >
                  <Undo2 aria-hidden /> Restore this entry
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    const reason = window.prompt(
                      "Why are you voiding this entry? (kept for your records)",
                      "Duplicate or fake entry",
                    );
                    if (reason != null)
                      void run(
                        () =>
                          adminVoidEntrant({
                            data: { campaignId: c.id, entrantId: e.id, voided: true, reason },
                          }),
                        "Entry voided",
                      );
                  }}
                >
                  <ShieldOff aria-hidden /> Void this entry
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Entered {new Date(e.createdAt).toLocaleString()} ·{" "}
                {e.consents.length
                  ? `Mailing lists: ${e.consents.map((x) => x.listId).join(", ")}`
                  : "No mailing lists"}
              </p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
