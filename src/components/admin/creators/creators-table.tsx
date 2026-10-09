import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PLATFORMS,
  SKUS,
  compact,
  type CreatorStatus,
  type PlatformId,
  type SkuId,
} from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { Panel } from "../kit";
import type { CreatorRow } from "./types";
import { Ago, StatusPill } from "./ui";

export const LIST_TABS = [
  "all",
  "submitted",
  "approved",
  "waitlist",
  "declined",
  "paused",
  "draft",
] as const;
export type ListTab = (typeof LIST_TABS)[number];

const TAB_LABEL: Record<ListTab, string> = {
  all: "All",
  submitted: "To review",
  approved: "Active",
  waitlist: "Waitlist",
  declined: "Declined",
  paused: "Paused",
  draft: "Drafts",
};

export type Filters = { status: ListTab; q: string; agency: string };

/** Agency filter values besides agency names. */
const ANY = "";
const DIRECT = "__direct";

const PLATFORM_SHORT: Partial<Record<PlatformId, string>> = {
  youtube: "YT",
  twitch: "Twitch",
  tiktok: "TikTok",
  x: "X",
  instagram: "IG",
  kick: "Kick",
  discord: "Discord",
};

function Platforms({ c }: { c: CreatorRow }) {
  const ps = [...new Set(c.platforms)] as PlatformId[];
  if (!ps.length) return <span className="text-muted-foreground/70">No channels yet</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ps.map((p) => (
        <span
          key={p}
          title={PLATFORMS[p]?.label ?? p}
          className="mono rounded border border-border bg-white/[0.03] px-1.5 py-px text-[10px] text-muted-foreground"
        >
          {PLATFORM_SHORT[p] ?? PLATFORMS[p]?.label ?? p}
        </span>
      ))}
      {c.audience ? (
        <span className="ml-0.5 text-xs font-medium tabular-nums" title="Total reported audience">
          {compact(c.audience)}
        </span>
      ) : null}
    </div>
  );
}

function Skus({ skus }: { skus: string[] }) {
  if (!skus.length) return <span className="text-muted-foreground/70">–</span>;
  return (
    <span className="text-xs text-muted-foreground">
      {skus.map((s) => SKUS[s as SkuId]?.short ?? s).join(", ")}
    </span>
  );
}

function Applied({ c }: { c: CreatorRow }) {
  if (c.status === "draft") {
    return <Ago ts={c.createdAt} prefix="Started " className="text-xs text-muted-foreground" />;
  }
  const at = c.submittedAt ?? c.createdAt;
  return <Ago ts={at} className="text-xs whitespace-nowrap" />;
}

export function CreatorsTable({
  creators,
  counts,
  filters,
  onFilters,
}: {
  creators: CreatorRow[];
  counts: Record<CreatorStatus, number>;
  filters: Filters;
  onFilters: (f: Partial<Filters>) => void;
}) {
  const navigate = useNavigate();
  const agencies = useMemo(
    () =>
      [...new Set(creators.map((c) => c.agency).filter((a): a is string => !!a))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [creators],
  );

  const q = filters.q.trim().toLowerCase();
  const shown = useMemo(() => {
    const rows = creators.filter((c) => {
      if (filters.status !== "all" && c.status !== filters.status) return false;
      if (filters.agency === DIRECT && c.agency) return false;
      if (filters.agency && filters.agency !== DIRECT && c.agency !== filters.agency) return false;
      if (q && !c.displayName.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q))
        return false;
      return true;
    });
    // drafts trail the real applications in "All"
    return filters.status === "all"
      ? [...rows.filter((c) => c.status !== "draft"), ...rows.filter((c) => c.status === "draft")]
      : rows;
  }, [creators, filters.status, filters.agency, q]);

  const count = (t: ListTab) => (t === "all" ? creators.length : counts[t]);
  const open = (id: string) =>
    void navigate({ to: "/admin/creators/$creatorId", params: { creatorId: id } });

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="-mx-1 max-w-full overflow-x-auto px-1">
          <Tabs value={filters.status} onValueChange={(v) => onFilters({ status: v as ListTab })}>
            <TabsList className="bg-white/[0.04]">
              {LIST_TABS.map((t) => (
                <TabsTrigger key={t} value={t} className="gap-1.5 px-2.5">
                  {TAB_LABEL[t]}
                  <span
                    className={cn(
                      "mono text-[10px] tabular-nums",
                      t === "submitted" && counts.submitted ? "text-sky-300" : "opacity-60",
                    )}
                  >
                    {count(t)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex w-full flex-wrap gap-2 @3xl/inset:w-auto">
          <div className="relative min-w-0 flex-1 @3xl/inset:w-56 @3xl/inset:flex-none">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={filters.q}
              onChange={(e) => onFilters({ q: e.target.value })}
              placeholder="Name or email"
              aria-label="Search creators by name or email"
              className="pl-8"
            />
          </div>
          <Select
            value={filters.agency || "__any"}
            onValueChange={(v) => onFilters({ agency: v === "__any" ? ANY : v })}
          >
            <SelectTrigger className="w-44" aria-label="Filter by agency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any">All agencies</SelectItem>
              <SelectItem value={DIRECT}>Direct (no agency)</SelectItem>
              {agencies.length ? <SelectSeparator /> : null}
              {agencies.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {filters.status === "draft" ? (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          Drafts have an account but haven't submitted their application yet.
        </p>
      ) : null}

      {!shown.length ? (
        <p className="border-t border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {!creators.length
            ? "No creators yet. Share an invite link below, or send creators to the Creator Hub."
            : q || filters.agency
              ? "No creators match these filters."
              : filters.status === "submitted"
                ? "Nothing to review. New applications appear here."
                : `No ${TAB_LABEL[filters.status].toLowerCase()} creators.`}
        </p>
      ) : (
        <>
          <div className="hidden border-t border-border @4xl/inset:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Creators</caption>
              <thead>
                <tr className="mono border-b border-border text-left text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
                  <th scope="col" className="px-5 py-2.5 font-normal">
                    Creator
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Channels · audience
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Interested in
                  </th>
                  <th scope="col" className="hidden px-3 py-2.5 font-normal @5xl/inset:table-cell">
                    Agency
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-normal">
                    Applied
                  </th>
                  <th scope="col" className="w-10 px-3 py-2.5">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => open(c.id)}
                    className={cn(
                      "cursor-pointer align-middle transition-colors hover:bg-white/[0.03]",
                      c.status === "draft" && "opacity-55 hover:opacity-80",
                    )}
                  >
                    <td className="max-w-[18rem] px-5 py-2.5">
                      <Link
                        to="/admin/creators/$creatorId"
                        params={{ creatorId: c.id }}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-medium outline-none hover:underline focus-visible:underline"
                      >
                        {c.displayName || "Unnamed"}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">{c.email}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Platforms c={c} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Skus skus={c.skus} />
                    </td>
                    <td className="hidden max-w-[12rem] truncate px-3 py-2.5 text-xs @5xl/inset:table-cell">
                      {c.agency ?? <span className="text-muted-foreground/70">Direct</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Applied c={c} />
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      <ChevronRight className="size-4" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border border-t border-border @4xl/inset:hidden">
            {shown.map((c) => (
              <li key={c.id} className={cn(c.status === "draft" && "opacity-55")}>
                <Link
                  to="/admin/creators/$creatorId"
                  params={{ creatorId: c.id }}
                  className="flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium">{c.displayName || "Unnamed"}</span>
                      <StatusPill status={c.status} />
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.email}
                      {c.agency ? ` · ${c.agency}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Platforms c={c} />
                      <Skus skus={c.skus} />
                      <Applied c={c} />
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
