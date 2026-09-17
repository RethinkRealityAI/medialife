/**
 * What a project still needs, and what it already has.
 *
 * The screen has to answer one question before any other: what is owed, and by
 * whom. So outstanding items sort to the top of every group and are the only
 * rows that carry an action; everything else is evidence that the list is real.
 */
import { useState } from "react";
import { Check, FileUp, Loader2, Minus, Paperclip, Upload } from "lucide-react";

import { Panel, Pill, type Tone } from "@/components/portal/kit";
import { cn } from "@/lib/utils";
import {
  REQUIREMENT_STATES,
  type Requirement,
  type RequirementGroup,
  type RequirementState,
  requirementSummary,
  shortDate,
} from "@/lib/roblox-portal";

const STATE_ICON: Record<RequirementState, typeof Check> = {
  received: Check,
  "in-review": Loader2,
  outstanding: Upload,
  "not-yet": Minus,
};

function StateMark({ state }: { state: RequirementState }) {
  const Icon = STATE_ICON[state];
  return (
    <span
      className={cn(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border",
        state === "received"
          ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-400"
          : state === "in-review"
            ? "border-primary/45 bg-primary/10 text-primary"
            : state === "outstanding"
              ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
              : "border-border text-muted-foreground/50",
      )}
    >
      <Icon
        className={cn("size-3.5", state === "in-review" && "animate-spin [animation-duration:3s]")}
        strokeWidth={state === "received" ? 3 : 2}
        aria-hidden
      />
    </span>
  );
}

/** A file chip. In the live portal this is a download; here it is evidence. */
function Artifact({ name, meta }: { name: string; meta: string }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-white/[0.03] px-2.5 py-1.5">
      <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 break-all text-xs">{name}</span>
      <span className="mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        {meta}
      </span>
    </span>
  );
}

function Row({ item }: { item: Requirement }) {
  const [sent, setSent] = useState(false);
  const state = REQUIREMENT_STATES[item.state];
  const owed = item.state === "outstanding" && !sent;

  return (
    <li
      className={cn("flex gap-3.5 px-4 py-3.5 transition-colors", owed && "bg-amber-400/[0.035]")}
    >
      <StateMark state={sent ? "in-review" : item.state} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={cn("text-sm", item.state === "not-yet" && "text-muted-foreground")}>
            {item.label}
          </span>
          <Pill tone={(sent ? "primary" : state.tone) as Tone} dot={false}>
            {sent ? "Uploading" : state.label}
          </Pill>
        </div>

        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {item.detail}
        </p>

        {item.artifact && !sent ? (
          <div className="mt-2.5">
            <Artifact {...item.artifact} />
          </div>
        ) : null}

        {owed ? (
          <button
            type="button"
            onClick={() => setSent(true)}
            className="mono mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-amber-400/45 bg-amber-400/10 px-3 py-1.5 text-[10px] tracking-[0.12em] text-amber-300 uppercase transition-colors hover:border-amber-400/70 hover:bg-amber-400/15"
          >
            <FileUp className="size-3" aria-hidden /> Upload
          </button>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <div className="mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
          {item.owner}
        </div>
        <div
          className={cn(
            "mono mt-0.5 text-[10px] tracking-[0.08em] tabular-nums",
            owed ? "text-amber-300" : "text-muted-foreground/70",
          )}
        >
          {sent
            ? "Just now"
            : item.state === "outstanding" && item.neededBy
              ? `By ${shortDate(item.neededBy)}`
              : item.receivedOn
                ? shortDate(item.receivedOn)
                : "—"}
        </div>
      </div>
    </li>
  );
}

export function RequirementsList({ groups }: { groups: RequirementGroup[] }) {
  const s = requirementSummary(groups);

  return (
    <div className="space-y-3">
      {/* The headline: how much of the askable list is settled. Items whose
          stage has not opened are excluded — a creator cannot act on those, and
          counting them makes the bar move for reasons nobody caused. */}
      <Panel className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="text-sm">
            <span className="text-2xl font-medium tabular-nums">{s.received}</span>
            <span className="text-muted-foreground"> of {s.askable} in hand</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.outstanding ? <Pill tone="watch">{s.outstanding} needed from you</Pill> : null}
            {s.inReview ? <Pill tone="primary">{s.inReview} in review</Pill> : null}
            {s.notYet ? <Pill tone="muted">{s.notYet} not open yet</Pill> : null}
          </div>
        </div>
        <div className="mt-3 flex h-1.5 gap-1 overflow-hidden rounded-full">
          <span
            className="rounded-full bg-emerald-400"
            style={{ width: `${(s.received / s.askable) * 100}%` }}
          />
          <span
            className="rounded-full bg-primary"
            style={{ width: `${(s.inReview / s.askable) * 100}%` }}
          />
          <span
            className="rounded-full bg-amber-400"
            style={{ width: `${(s.outstanding / s.askable) * 100}%` }}
          />
          <span className="flex-1 rounded-full bg-white/10" />
        </div>
      </Panel>

      {groups.map((g) => {
        // Outstanding first: the list exists to be acted on.
        const items = [...g.items].sort(
          (a, b) => REQUIREMENT_STATES[a.state].order - REQUIREMENT_STATES[b.state].order,
        );
        const done = g.items.filter((i) => i.state === "received").length;
        const askable = g.items.filter((i) => i.state !== "not-yet").length;

        return (
          <Panel key={g.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <h3 className="text-sm font-medium">{g.name}</h3>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                  {g.blurb}
                </p>
              </div>
              <span className="mono shrink-0 text-[10px] tracking-[0.12em] text-muted-foreground uppercase tabular-nums">
                {done} / {askable}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <Row key={i.id} item={i} />
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
