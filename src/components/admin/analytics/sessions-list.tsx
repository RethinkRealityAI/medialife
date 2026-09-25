import { useState } from "react";
import { ChevronRight, Monitor, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Dashboard, SessionRow } from "@/lib/ar/analytics.server";
import { cn } from "@/lib/utils";

import { formatDateTime, formatDuration, place, relativeTime } from "../format";
import { Panel, PanelTitle } from "../kit";
import { HighlightChips } from "./chips";

const PAGE = 20;

function When({ r, now }: { r: SessionRow; now: number }) {
  return (
    <time dateTime={new Date(r.startedAt).toISOString()} title={formatDateTime(r.startedAt)}>
      {relativeTime(r.startedAt, now)}
    </time>
  );
}

function Who({ r }: { r: SessionRow }) {
  return r.client ? (
    <span className="font-medium">{r.client}</span>
  ) : (
    <span className="text-muted-foreground">Direct</span>
  );
}

function Device({ r }: { r: SessionRow }) {
  const Icon = r.mobile ? Smartphone : Monitor;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {r.os}
    </span>
  );
}

function BouncedTag() {
  return (
    <span className="mono rounded border border-border px-1.5 py-px text-[9px] tracking-[0.1em] text-muted-foreground uppercase">
      Bounced
    </span>
  );
}

export function SessionsList({
  data,
  onOpen,
  className,
}: {
  data: Dashboard;
  onOpen: (key: string) => void;
  className?: string;
}) {
  const [limit, setLimit] = useState(PAGE);
  const demoLabels = new Map(data.filters.demos.map((d) => [d.id, d.label]));
  const rows = data.sessions.slice(0, limit);
  const now = data.generatedAt;

  return (
    <Panel className={className}>
      <div className="p-4 pb-3 sm:p-5 sm:pb-3">
        <PanelTitle
          title="Recent visits"
          sub="Newest first. Open one to see every step, in order."
        />
      </div>
      {!rows.length ? (
        <p className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No visits in this range
        </p>
      ) : (
        <>
          <div className="hidden border-t border-border @3xl/inset:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Recent visits</caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-2.5 font-normal">
                    When
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Demo
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Device
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 font-normal @5xl/inset:table-cell">
                    Location
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">
                    Engaged
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">
                    Actions
                  </th>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr
                    key={r.key}
                    onClick={() => onOpen(r.key)}
                    className={cn(
                      "group cursor-pointer transition-colors hover:bg-white/[0.03]",
                      r.bounced && "text-muted-foreground",
                    )}
                  >
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(r.key);
                        }}
                        className="rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        aria-label={`Open the visit from ${r.client ?? "a direct visitor"}, ${formatDateTime(r.startedAt)}`}
                      >
                        <When r={r} now={now} />
                      </button>
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5">
                      <Who r={r} />
                      {r.visitorVisits > 1 ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          visit {r.visitNo} of {r.visitorVisits}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {demoLabels.get(r.demo) ?? r.demo}
                    </td>
                    <td className="px-3 py-2.5">
                      <Device r={r} />
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-3 py-2.5 @5xl/inset:table-cell">
                      {place(r)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {r.bounced ? <BouncedTag /> : formatDuration(r.activeMs)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.actions}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
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

          <ul className="divide-y divide-border border-t border-border @3xl/inset:hidden">
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => onOpen(r.key)}
                  className="block w-full px-4 py-3 text-left transition-colors outline-none hover:bg-white/[0.03] focus-visible:bg-white/[0.05]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <Who r={r} />
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <When r={r} now={now} />
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{demoLabels.get(r.demo) ?? r.demo}</span>
                    <span aria-hidden>·</span>
                    <Device r={r} />
                    <span aria-hidden>·</span>
                    <span className="truncate">{place(r)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    {r.bounced ? (
                      <BouncedTag />
                    ) : (
                      <>
                        <span className="tabular-nums">
                          {formatDuration(r.activeMs)}{" "}
                          <span className="text-muted-foreground">engaged</span>
                        </span>
                        <span className="tabular-nums">
                          {r.actions} <span className="text-muted-foreground">actions</span>
                        </span>
                      </>
                    )}
                  </div>
                  {!r.bounced ? (
                    <HighlightChips highlights={r.highlights} className="mt-2" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {data.sessions.length > limit ? (
            <div className="border-t border-border px-4 py-2 sm:px-5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLimit((l) => l + PAGE * 2)}
                className="-ml-2 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                Show more ({data.sessions.length - limit} more)
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}
