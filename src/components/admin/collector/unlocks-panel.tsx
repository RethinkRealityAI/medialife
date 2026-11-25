import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Gamepad2, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getUnlocksFn, resetUnlocksFn, saveUnlocksFn } from "@/lib/collector/admin.functions";
import { ROOMS } from "@/lib/collector/model";
import {
  CHALLENGES,
  ruleFor,
  type UnlockConfig,
  type UnlockMode,
  type UnlockRule,
  type UnlockWay,
} from "@/lib/collector/unlocks";

import { CopyButton, Panel, PanelTitle } from "../kit";

// /admin/collector → "Bobo's Hideout unlocks": which arcade machines fans can play in the EVADE Hub
// (/evade/hub/) and what opens the locked ones (a merch code, or a mission done in another experience).
// The machine list is the live arcade catalogue (public/evade/arcade/games.json) plus the hub's two places.

const ROOM = ROOMS.evade;
const PLACES = [
  { id: "where-is-bobo", name: "Where is Bobo? (place)" },
  { id: "vault", name: "Digital Collection (place)" },
];
const MODE_LABEL: Record<UnlockMode, string> = {
  open: "Open to everyone",
  locked: "Locked",
  soon: "Coming soon",
  hidden: "Hidden",
};

type Machine = { id: string; name: string };

const sameWay = (a: UnlockWay, b: UnlockWay) =>
  a.kind === b.kind &&
  (a.kind === "merch" ? a.product === (b as typeof a).product : a.id === (b as typeof a).id);

export function UnlocksPanel({ testCodes }: { testCodes: { code: string; label: string }[] }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["collector-unlocks"], queryFn: () => getUnlocksFn() });
  const games = useQuery({
    queryKey: ["arcade-games"],
    queryFn: async (): Promise<Machine[]> => {
      const r = await fetch("/evade/arcade/games.json", { cache: "no-cache" });
      const d = (await r.json()) as { games: Machine[] };
      return d.games.map((g) => ({ id: g.id, name: g.name }));
    },
  });
  const machines = useMemo(() => [...(games.data ?? []), ...PLACES], [games.data]);
  const [draft, setDraft] = useState<UnlockConfig | null>(null);
  useEffect(() => {
    if (q.data) setDraft(structuredClone(q.data));
  }, [q.data]);
  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data);

  const save = useMutation({
    mutationFn: () => saveUnlocksFn({ data: { openAll: draft!.openAll, rules: draft!.rules } }),
    onSuccess: (cfg) => {
      toast.success("Saved. Fans get the new rules within a minute.");
      qc.setQueryData(["collector-unlocks"], cfg);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });
  const reset = useMutation({
    mutationFn: () => resetUnlocksFn(),
    onSuccess: (cfg) => {
      toast.success("Back to the built-in rules");
      qc.setQueryData(["collector-unlocks"], cfg);
    },
  });

  const setRule = (id: string, patch: Partial<UnlockRule>) =>
    setDraft((d) => {
      if (!d) return d;
      const cur = ruleFor(d, id);
      return { ...d, rules: { ...d.rules, [id]: { ...cur, ...patch } } };
    });
  const toggleWay = (id: string, w: UnlockWay, on: boolean) => {
    const cur = draft ? ruleFor(draft, id) : null;
    const ways = (cur?.ways ?? []).filter((x) => !sameWay(x, w));
    setRule(id, { ways: on ? [...ways, w] : ways });
  };

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Bobo's Hideout unlocks"
        sub="Which arcade machines fans can play in the EVADE Hub, and what opens the rest. A locked machine opens when the fan has any one of its ticked ways."
        icon={Gamepad2}
        tone="amber"
      />
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <a
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5"
          href="/evade/hub/?arcade"
          target="_blank"
          rel="noopener"
        >
          Fan hub <ExternalLink className="size-3" aria-hidden />
        </a>
        <a
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5"
          href="/labs/evade-hub/?arcade"
          target="_blank"
          rel="noopener"
        >
          Team hub (all open) <ExternalLink className="size-3" aria-hidden />
        </a>
        <a
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 hover:bg-white/5"
          href="/evade/hub/?arcade&resetunlocks"
          target="_blank"
          rel="noopener"
        >
          Fan hub as a new fan (clears this browser) <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {testCodes.length ? (
        <div className="mt-4 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] p-3">
          <p className="text-sm font-medium">Test codes (any email)</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {testCodes.map((t) => (
              <li key={t.code} className="flex items-center gap-2 text-xs">
                <span className="font-mono tracking-wider">{t.code}</span>
                <span className="text-muted-foreground">{t.label}</span>
                <CopyButton text={t.code} label={`Copy ${t.label} test code`} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!draft ? (
        <div className="mt-4 h-40 animate-pulse rounded-xl bg-white/5" />
      ) : (
        <>
          <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] p-3">
            <span>
              <span className="block text-sm font-medium">Open everything for everyone</span>
              <span className="block text-xs text-muted-foreground">
                A free weekend or launch day. Rules below are kept for when you switch it off.
              </span>
            </span>
            <Switch
              checked={draft.openAll}
              onCheckedChange={(v) => setDraft({ ...draft, openAll: v })}
            />
          </label>

          <ul className="mt-4 space-y-3">
            {machines.map((m) => {
              const r = ruleFor(draft, m.id);
              return (
                <li key={m.id} className="rounded-xl border border-white/[0.08] p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1 text-sm font-medium">{m.name}</p>
                    <Select
                      value={r.mode}
                      onValueChange={(v) => setRule(m.id, { mode: v as UnlockMode })}
                    >
                      <SelectTrigger className="w-44" aria-label={`${m.name}: who can play`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(MODE_LABEL) as UnlockMode[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {MODE_LABEL[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {r.mode === "locked" ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <fieldset>
                        <legend className="text-xs text-muted-foreground">Merch code for</legend>
                        {ROOM.products.map((p) => {
                          const w: UnlockWay = { kind: "merch", product: p.id };
                          const on = (r.ways ?? []).some((x) => sameWay(x, w));
                          return (
                            <label key={p.id} className="mt-1.5 flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={on}
                                onCheckedChange={(v) => toggleWay(m.id, w, v === true)}
                              />
                              {p.name}
                              {p.released ? (
                                ""
                              ) : (
                                <span className="text-xs text-muted-foreground">(not out yet)</span>
                              )}
                            </label>
                          );
                        })}
                      </fieldset>
                      <fieldset>
                        <legend className="text-xs text-muted-foreground">Or a mission</legend>
                        {CHALLENGES.map((c) => {
                          const w: UnlockWay = { kind: "challenge", id: c.id };
                          const on = (r.ways ?? []).some((x) => sameWay(x, w));
                          return (
                            <label
                              key={c.id}
                              className="mt-1.5 flex items-center gap-2 text-sm"
                              title={`Set by ${c.setBy}`}
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={(v) => toggleWay(m.id, w, v === true)}
                              />
                              {c.task}
                            </label>
                          );
                        })}
                      </fieldset>
                      <Input
                        className="sm:col-span-2"
                        value={r.note ?? ""}
                        maxLength={90}
                        onChange={(e) => setRule(m.id, { note: e.target.value })}
                        placeholder="Optional line fans see instead of the ways, e.g. Comes with the winter hoodie"
                        aria-label={`${m.name}: note for fans`}
                      />
                      {!(r.ways ?? []).length ? (
                        <p className="text-xs text-amber-200 sm:col-span-2">
                          Tick at least one way, or fans see it as Coming soon.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
              <RotateCcw aria-hidden /> Built-in rules
            </Button>
            <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              Save unlocks
            </Button>
          </div>
          {draft.updatedAt ? (
            <p className="mt-2 text-right text-[11px] text-white/45">
              Last saved {new Date(draft.updatedAt).toLocaleString()}
            </p>
          ) : (
            <p className="mt-2 text-right text-[11px] text-white/45">Using the built-in rules</p>
          )}
        </>
      )}
    </Panel>
  );
}
