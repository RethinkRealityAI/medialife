import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ClientRow, Dashboard } from "@/lib/ar/analytics.server";
import { cn } from "@/lib/utils";

import { formatDateTime, formatDuration, relativeTime } from "../format";
import { Panel, PanelTitle } from "../kit";
import { HighlightChips } from "./chips";

// One row per client link: the follow-up view. Who opened, when, for how long
// and what caught their eye. Links nobody opened yet stay listed ("sent, not
// opened" is a follow-up too). A row filters the whole page to that client.

const COLLAPSED = 12;

function subline(r: ClientRow, demoName: (id: string) => string) {
  const parts: string[] = [];
  if (r.demo) parts.push(demoName(r.demo));
  if (r.kind === "link" && r.code) parts.push(`?c=${r.code}`);
  if (!r.demo && r.opens) parts.push("several demos");
  if (r.kind === "name") parts.push("name only, no link code");
  if (r.kind === "direct") parts.push("no client link");
  const s = parts.join(" · ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StateTag({ state }: { state: ClientRow["linkState"] }) {
  if (state !== "archived" && state !== "deleted") return null;
  return (
    <span className="mono ml-2 rounded border border-border px-1.5 py-px text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
      {state}
    </span>
  );
}

function Visits({ r }: { r: ClientRow }) {
  const bounced = r.opens - r.visits;
  return (
    <span className="tabular-nums">
      <span className={cn("font-medium", !r.visits && "text-muted-foreground")}>{r.visits}</span>
      {bounced > 0 ? (
        <span className="ml-1.5 text-xs text-muted-foreground">+{bounced} bounced</span>
      ) : null}
    </span>
  );
}

function LastSeen({ r, now }: { r: ClientRow; now: number }) {
  if (!r.lastAt) return <span className="text-muted-foreground">Not opened yet</span>;
  return (
    <time dateTime={new Date(r.lastAt).toISOString()} title={formatDateTime(r.lastAt)}>
      {relativeTime(r.lastAt, now)}
    </time>
  );
}

export function ClientsTable({
  data,
  selected,
  onSelect,
  className,
}: {
  data: Dashboard;
  selected: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const demoLabels = new Map(data.filters.demos.map((d) => [d.id, d.label]));
  const demoName = (id: string) => demoLabels.get(id) ?? id;
  const [showAll, setShowAll] = useState(false);
  const all = data.clients;
  const rows = showAll ? all : all.slice(0, COLLAPSED);
  const now = data.generatedAt;
  const linkCount = all.filter((r) => r.kind === "link").length;

  return (
    <Panel className={className}>
      <div className="p-4 pb-3 sm:p-5 sm:pb-3">
        <PanelTitle
          title="Clients"
          sub="Everyone you sent a personal link to, most recent first. Select one to see only their visits."
          actions={
            <Button
              asChild
              variant="outline"
              size="sm"
              className="bg-transparent hover:bg-white/[0.06] hover:text-foreground"
            >
              <Link to="/admin/links">
                <Link2 aria-hidden />
                Client links
              </Link>
            </Button>
          }
        />
      </div>

      {!rows.length ? (
        <div className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground sm:px-5">
          No client links yet.{" "}
          <Link to="/admin/links" className="text-primary underline-offset-4 hover:underline">
            Create one
          </Link>{" "}
          so visits are attributed to a client.
        </div>
      ) : (
        <>
          {/* wide: a table */}
          <div className="hidden border-t border-border @3xl/inset:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Clients and what they did</caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-2.5 font-normal">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Visits
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Last seen
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Engaged
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Highlights
                  </th>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className={cn(
                      "group cursor-pointer align-top transition-colors hover:bg-white/[0.03]",
                      selected === r.id && "bg-primary/[0.06]",
                      !r.opens && "text-muted-foreground",
                    )}
                  >
                    <td className="max-w-[18rem] px-5 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(r.id);
                        }}
                        className="rounded-sm text-left font-medium text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {r.name}
                      </button>
                      <StateTag state={r.linkState} />
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {subline(r, demoName)}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <Visits r={r} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <LastSeen r={r} now={now} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                      {r.visits ? (
                        formatDuration(r.engagedMs)
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <HighlightChips
                        highlights={r}
                        empty={<span className="text-muted-foreground">–</span>}
                      />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      <ChevronRight
                        className="size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* narrow: cards */}
          <ul className="divide-y divide-border border-t border-border @3xl/inset:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    "block w-full px-4 py-3.5 text-left transition-colors outline-none hover:bg-white/[0.03] focus-visible:bg-white/[0.05]",
                    selected === r.id && "bg-primary/[0.06]",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate font-medium">
                      {r.name}
                      <StateTag state={r.linkState} />
                    </span>
                    <span className="shrink-0 text-xs">
                      <LastSeen r={r} now={now} />
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {subline(r, demoName)}
                  </div>
                  {r.opens ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                      <span className="tabular-nums">
                        <span className="font-medium">{r.visits}</span>{" "}
                        <span className="text-muted-foreground">
                          visit{r.visits === 1 ? "" : "s"}
                          {r.opens > r.visits ? ` +${r.opens - r.visits} bounced` : ""}
                        </span>
                      </span>
                      {r.visits ? (
                        <span className="tabular-nums">
                          {formatDuration(r.engagedMs)}{" "}
                          <span className="text-muted-foreground">engaged</span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <HighlightChips highlights={r} className="mt-2" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {all.length > COLLAPSED ? (
        <div className="border-t border-border px-4 py-2 sm:px-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
            className="-ml-2 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          >
            {showAll ? "Show fewer" : `Show all ${all.length} clients`}
          </Button>
        </div>
      ) : null}
      {linkCount === 0 && rows.length > 0 ? (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
          Tip:{" "}
          <Link to="/admin/links" className="text-primary underline-offset-4 hover:underline">
            create a client link
          </Link>{" "}
          for each person you send a demo to, and their visits show up here by name.
        </p>
      ) : null}
    </Panel>
  );
}
