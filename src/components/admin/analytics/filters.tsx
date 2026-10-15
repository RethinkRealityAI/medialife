import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Dashboard, RangeId } from "@/lib/ar/analytics.server";

const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

const DEMO_GROUPS = [
  { kind: "demo", label: null },
  { kind: "endcap", label: "Builder endcaps" },
  { kind: "shelf", label: "Merch shelves" },
] as const;

export interface Filters {
  range: RangeId;
  demo: string;
  client: string;
}

/** One row above everything it scopes: range first, then demo and client. */
export function FilterBar({
  value,
  options,
  onChange,
}: {
  value: Filters;
  options: Dashboard["filters"] | undefined;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const demos = options?.demos ?? [];
  const clients = options?.clients ?? [];
  const links = clients.filter((c) => c.kind === "link");
  const names = clients.filter((c) => c.kind === "name");
  // keep the current choice selectable while options load or after it drops out of the range
  const clientKnown =
    value.client === "all" || value.client === "none" || clients.some((c) => c.id === value.client);
  const demoKnown = value.demo === "all" || demos.some((d) => d.id === value.demo);
  const filtered = value.demo !== "all" || value.client !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        value={value.range}
        onValueChange={(v) => v && onChange({ range: v as RangeId })}
        aria-label="Date range"
        className="h-10 w-full gap-0.5 rounded-xl bg-black/30 p-1 ring-1 ring-white/[0.08] ring-inset sm:w-auto"
      >
        {RANGES.map((r) => (
          <ToggleGroupItem
            key={r.id}
            value={r.id}
            className="h-8 flex-1 rounded-lg px-3 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground data-[state=on]:bg-white/[0.1] data-[state=on]:text-foreground data-[state=on]:shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] sm:flex-none"
          >
            {r.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Select value={value.demo} onValueChange={(v) => onChange({ demo: v })}>
          <SelectTrigger
            className="h-10 min-w-0 rounded-xl bg-black/30 text-xs sm:w-44"
            aria-label="Demo"
          >
            <SelectValue placeholder="All demos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All demos</SelectItem>
            {DEMO_GROUPS.map((g) => {
              const items = demos.filter((d) => (d.kind ?? "demo") === g.kind);
              if (!items.length) return null;
              const list = items.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ));
              // the sent demos stay ungrouped at the top, like before
              return g.label ? (
                <SelectGroup key={g.kind}>
                  <SelectSeparator />
                  <SelectLabel className="text-xs text-muted-foreground">{g.label}</SelectLabel>
                  {list}
                </SelectGroup>
              ) : (
                list
              );
            })}
            {!demoKnown ? <SelectItem value={value.demo}>{value.demo}</SelectItem> : null}
          </SelectContent>
        </Select>

        <Select value={value.client} onValueChange={(v) => onChange({ client: v })}>
          <SelectTrigger
            className="h-10 min-w-0 rounded-xl bg-black/30 text-xs sm:w-52"
            aria-label="Client"
          >
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All clients</SelectItem>
            <SelectItem value="none">No link (direct)</SelectItem>
            {links.length ? (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">Client links</SelectLabel>
                  {links.map((c) => (
                    <SelectItem key={c.id} value={c.id} title={c.hint ?? undefined}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            ) : null}
            {names.length ? (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel className="text-xs text-muted-foreground">
                    Names without a link
                  </SelectLabel>
                  {names.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            ) : null}
            {!clientKnown ? <SelectItem value={value.client}>{value.client}</SelectItem> : null}
          </SelectContent>
        </Select>
      </div>

      {filtered ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange({ demo: "all", client: "all" })}
          className="h-9 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
        >
          <X aria-hidden />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
