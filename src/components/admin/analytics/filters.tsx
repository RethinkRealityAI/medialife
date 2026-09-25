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
        className="w-full gap-0.5 rounded-md border border-border p-0.5 sm:w-auto"
      >
        {RANGES.map((r) => (
          <ToggleGroupItem
            key={r.id}
            value={r.id}
            className="h-8 flex-1 px-3 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground data-[state=on]:bg-white/[0.1] data-[state=on]:text-foreground sm:flex-none"
          >
            {r.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Select value={value.demo} onValueChange={(v) => onChange({ demo: v })}>
          <SelectTrigger className="h-9 min-w-0 text-xs sm:w-44" aria-label="Demo">
            <SelectValue placeholder="All demos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All demos</SelectItem>
            {demos.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label}
              </SelectItem>
            ))}
            {!demoKnown ? <SelectItem value={value.demo}>{value.demo}</SelectItem> : null}
          </SelectContent>
        </Select>

        <Select value={value.client} onValueChange={(v) => onChange({ client: v })}>
          <SelectTrigger className="h-9 min-w-0 text-xs sm:w-52" aria-label="Client">
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
