import { useEffect, useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  Check,
  Download,
  Instagram,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Swords,
  Ticket,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  lootActionFn,
  lootExportFn,
  lootLookupFn,
  lootOverviewFn,
  lootSaveSettingsFn,
} from "@/lib/lootbreak/admin.functions";
import type { AdminCode, CodeAction } from "@/lib/lootbreak/admin.server";
import { LADDER, questReady, type LootSettings } from "@/lib/lootbreak/model";
import { cn } from "@/lib/utils";

import { isUnauthorized } from "../format";
import {
  CopyButton,
  NamespaceBadge,
  PageHeader,
  Panel,
  PanelTitle,
  SignInAgain,
  StatTile,
  Tag,
  well,
} from "../kit";

// /admin/lootbreak: the team's side of the LOOT BREAK rewards (TBH: Task Bar Hero).
//   - Check a code: paste what the customer sends, match the email, mark it used.
//   - Codes: every code the game gave out; bonus-quest codes wait here for the
//     team to check the Instagram follows and story.
//   - Campaign: reward ladder, bonus quest accounts, shop link, expiry, terms.

const QK = ["lootbreak-overview"];

function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : "");
const igUrl = (handle?: string) =>
  handle ? `https://www.instagram.com/${handle.replace(/^@/, "")}/` : "";

type Status = { label: string; tone: "mint" | "sky" | "amber" | "slate" | "rose" };
function statusOf(c: AdminCode): Status {
  if (c.status === "redeemed") return { label: "Used", tone: "slate" };
  if (c.status === "void") return { label: c.replacedBy ? "Upgraded" : "Cancelled", tone: "rose" };
  if (c.expired) return { label: "Expired", tone: "slate" };
  if (c.kind === "quest" && !c.verified) return { label: "Check follows", tone: "amber" };
  return { label: "Live", tone: "mint" };
}

function useCodeAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { code: string; action: CodeAction }) => lootActionFn({ data: v }),
    onSuccess: (c, v) => {
      const done: Record<CodeAction, string> = {
        redeem: `${c.code} marked used`,
        unredeem: `${c.code} is live again`,
        void: `${c.code} cancelled`,
        reactivate: `${c.code} is live again`,
        verify: `${c.handle} verified`,
        unverify: `${c.handle} back to "check follows"`,
      };
      toast.success(done[v.action]);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the code"),
  });
}

export function LootBreakPage() {
  const q = useQuery({
    queryKey: QK,
    queryFn: () => lootOverviewFn(),
    retry: (n, err) => !isUnauthorized(err) && n < 2,
  });
  const data = q.data;

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <PageHeader
        title="LOOT BREAK rewards"
        icon={Swords}
        tone="amber"
        badge={<NamespaceBadge ns={data?.ns} />}
      >
        <p className="mt-1 max-w-2xl text-sm text-white/65">
          Players earn a one-time discount code for reaching a high rarity in the TBH game, plus a
          bonus code for following the accounts and sharing to their story. Every code is tied to
          the email that claimed it.
        </p>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {q.isError && isUnauthorized(q.error) ? (
          <SignInAgain />
        ) : q.isError ? (
          <Panel className="mx-auto max-w-md p-6 text-center">
            <h2 className="text-base font-medium">Couldn't load LOOT BREAK rewards</h2>
            <Button className="mt-4" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </Panel>
        ) : !data ? (
          <Panel className="h-72 animate-pulse" />
        ) : (
          <>
            {!data.settings.active ? (
              <p className="rounded-xl border border-amber-300/30 bg-amber-300/[0.07] p-3 text-sm text-amber-100">
                Rewards are paused. The game hides the rewards strip until you switch them back on
                under Campaign.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatTile
                label="Players with a code"
                value={data.stats.players}
                icon={Users}
                tone="sky"
              />
              <StatTile label="Live codes" value={data.stats.live} icon={Ticket} tone="mint" />
              <StatTile label="Used" value={data.stats.redeemed} icon={Check} tone="violet" />
              <StatTile
                label="Follows to check"
                value={data.stats.toVerify}
                icon={Instagram}
                tone="amber"
              />
              <StatTile
                label="Opted in to drops"
                value={data.stats.consent}
                icon={Mail}
                tone="rose"
                className="col-span-2 lg:col-span-1"
              />
            </div>
            <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:grid-rows-[auto_1fr] xl:items-start">
              <div className="min-w-0 xl:col-start-1 xl:row-start-1">
                <CheckPanel />
              </div>
              <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
                <CodesPanel codes={data.codes} total={data.total} shown={data.shown} />
              </div>
              <div className="min-w-0 xl:col-start-1 xl:row-start-2">
                <SettingsPanel settings={data.settings} />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Check a code ────────────────────────────────────────────────────────── */

function CheckPanel() {
  const id = useId();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const look = useMutation({
    mutationFn: (c: string) => lootLookupFn({ data: { code: c } }),
  });
  const act = useCodeAction();
  const found = act.data && act.data.code === look.data?.code ? act.data : look.data;
  const emailMatch = found && email.trim() ? found.email === email.trim().toLowerCase() : null;

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Check a code"
        sub="Paste the code a customer sends, with the email on their order. Mark it used once you've applied the discount."
        icon={Search}
        tone="sky"
      />
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim().length >= 4) look.mutate(code.trim());
        }}
      >
        <Field label="Code" htmlFor={`${id}-c`}>
          <Input
            id={`${id}-c`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="TBH10-7KQM-X3PF"
            className="font-mono uppercase tracking-wider"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Email on the order (optional)" htmlFor={`${id}-e`}>
          <Input
            id={`${id}-e`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={code.trim().length < 4 || look.isPending}>
            {look.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Search aria-hidden />
            )}
            Check
          </Button>
        </div>
      </form>

      {look.isError ? (
        <p className="mt-4 text-sm text-rose-300">Couldn't check that code. Try again.</p>
      ) : look.isSuccess && !found ? (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/[0.07] p-3 text-sm text-rose-100">
          <p className="font-medium">Not a LOOT BREAK code</p>
          <p className="mt-0.5 text-xs text-rose-100/75">
            The game never gave this out. It's mistyped or made up: don't honour it.
          </p>
        </div>
      ) : found ? (
        <div className={cn(well, "mt-4 p-4")}>
          <CodeSummary c={found} />
          {emailMatch !== null ? (
            <p
              className={cn(
                "mt-3 rounded-lg px-3 py-2 text-xs",
                emailMatch ? "bg-emerald-400/10 text-emerald-200" : "bg-rose-400/10 text-rose-200",
              )}
            >
              {emailMatch
                ? "Email matches. This is their code."
                : "Email doesn't match. The code was shared or the order uses another email."}
            </p>
          ) : null}
          <CodeActions c={found} act={act} className="mt-3" />
        </div>
      ) : null}
    </Panel>
  );
}

function CodeSummary({ c }: { c: AdminCode }) {
  const s = statusOf(c);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold tracking-wider">{c.code}</span>
        <CopyButton text={c.code} label="Copy code" />
        <Tag tone={s.tone}>{s.label}</Tag>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Discount</dt>
        <dd>
          {c.percent}% off ·{" "}
          {c.kind === "quest"
            ? "Bonus quest"
            : `${LADDER[c.tier ?? 0]?.name ?? "?"} (${(c.score ?? 0).toLocaleString()} pts)`}
        </dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd className="truncate">{c.email}</dd>
        {c.handle ? (
          <>
            <dt className="text-muted-foreground">Instagram</dt>
            <dd>
              <a
                href={igUrl(c.handle)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 underline-offset-2 hover:underline"
              >
                {c.handle}
              </a>
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Made</dt>
        <dd>
          {fmtDate(c.createdAt)} · {c.expired ? "expired" : "expires"} {fmtDate(c.expiresAt)}
        </dd>
        {c.redeemedAt ? (
          <>
            <dt className="text-muted-foreground">Used</dt>
            <dd>{fmtDate(c.redeemedAt)}</dd>
          </>
        ) : null}
        {c.replacedBy ? (
          <>
            <dt className="text-muted-foreground">Upgraded to</dt>
            <dd className="font-mono">{c.replacedBy}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

function CodeActions({
  c,
  act,
  className,
}: {
  c: AdminCode;
  act: ReturnType<typeof useCodeAction>;
  className?: string;
}) {
  const busy = act.isPending;
  const run = (action: CodeAction) => act.mutate({ code: c.code, action });
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {c.kind === "quest" && c.status === "active" ? (
        c.verified ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("unverify")}>
            <RotateCcw aria-hidden />
            Unverify
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run("verify")}>
            <BadgeCheck aria-hidden />
            Follows checked
          </Button>
        )
      ) : null}
      {c.status === "active" ? (
        <>
          <Button size="sm" disabled={busy || c.expired} onClick={() => run("redeem")}>
            <Check aria-hidden />
            Mark used
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("void")}>
            <Ban aria-hidden />
            Cancel code
          </Button>
        </>
      ) : c.status === "redeemed" ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("unredeem")}>
          <RotateCcw aria-hidden />
          Undo used
        </Button>
      ) : !c.replacedBy ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("reactivate")}>
          <RotateCcw aria-hidden />
          Make live again
        </Button>
      ) : null}
    </div>
  );
}

/* ── Codes list ──────────────────────────────────────────────────────────── */

type Filter = "all" | "verify" | "live" | "used" | "cancelled";
const FILTERS: { id: Filter; label: string; test: (c: AdminCode) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  {
    id: "verify",
    label: "Check follows",
    test: (c) => c.kind === "quest" && !c.verified && c.status === "active" && !c.expired,
  },
  { id: "live", label: "Live", test: (c) => c.status === "active" && !c.expired },
  { id: "used", label: "Used", test: (c) => c.status === "redeemed" },
  { id: "cancelled", label: "Cancelled / expired", test: (c) => c.status === "void" || c.expired },
];

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(name: string, rows: (string | number | boolean | undefined)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function CodesPanel({ codes, total, shown }: { codes: AdminCode[]; total: number; shown: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const act = useCodeAction();
  const [exporting, setExporting] = useState<null | "all" | "optin">(null);

  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const s = search.trim().toLowerCase().replace(/[\s-]/g, "");
    return codes.filter(
      (c) =>
        f.test(c) &&
        (!s ||
          c.code.toLowerCase().replace(/-/g, "").includes(s) ||
          c.email.includes(s) ||
          (c.handle ?? "").includes(s)),
    );
  }, [codes, filter, search]);

  async function exportCsv(kind: "all" | "optin") {
    setExporting(kind);
    try {
      const all = await lootExportFn();
      const day = new Date().toISOString().slice(0, 10);
      if (kind === "optin") {
        const seen = new Set<string>();
        const list = all.filter((c) => c.consent && !seen.has(c.email) && seen.add(c.email));
        downloadCsv(`lootbreak-opted-in-${day}.csv`, [
          ["email", "latest_code_at"],
          ...list.map((c) => [c.email, c.createdAt]),
        ]);
        toast.success(`${list.length} opted-in players exported`);
      } else {
        downloadCsv(`lootbreak-codes-${day}.csv`, [
          [
            "code",
            "kind",
            "percent",
            "status",
            "email",
            "consent",
            "rarity",
            "score",
            "instagram",
            "verified",
            "created",
            "expires",
            "used",
            "replaced_by",
          ],
          ...all.map((c) => [
            c.code,
            c.kind,
            c.percent,
            statusOf(c).label,
            c.email,
            c.consent,
            c.kind === "score" ? LADDER[c.tier ?? 0]?.name : "",
            c.score,
            c.handle,
            c.kind === "quest" ? c.verified : "",
            c.createdAt,
            c.expiresAt,
            c.redeemedAt,
            c.replacedBy,
          ]),
        ]);
        toast.success(`${all.length} codes exported`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't export");
    } finally {
      setExporting(null);
    }
  }

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Codes"
        sub={
          total > shown
            ? `Newest ${shown} of ${total}. Search or export for the rest.`
            : `${total} code${total === 1 ? "" : "s"} given out so far.`
        }
        icon={Ticket}
        tone="mint"
      />
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={!!exporting || total === 0}
          onClick={() => void exportCsv("all")}
        >
          {exporting === "all" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          Export CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!!exporting || total === 0}
          onClick={() => void exportCsv("optin")}
          title="Emails of players who ticked 'tell me about drops'"
        >
          {exporting === "optin" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Mail aria-hidden />
          )}
          Opted-in emails
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter codes">
          {FILTERS.map((f) => {
            const n = codes.filter(f.test).length;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium transition-colors",
                  filter === f.id
                    ? "bg-white/15 text-white"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-white",
                )}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, email or @handle"
          aria-label="Search codes"
          className="ml-auto h-8 w-full text-sm sm:w-64"
        />
      </div>

      <ul className="mt-3 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {rows.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">
            {codes.length === 0
              ? "No codes yet. They appear here the moment a player claims one in the game."
              : filter === "verify"
                ? "Nothing to check. Every bonus-quest code has been verified."
                : "No codes match."}
          </li>
        ) : (
          rows.slice(0, 200).map((c) => {
            const s = statusOf(c);
            return (
              <li key={c.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                <div className="min-w-[min(100%,16rem)] flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-medium tracking-wider whitespace-nowrap">
                      {c.code}
                    </span>
                    <Tag tone={s.tone}>{s.label}</Tag>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.percent}% ·{" "}
                    {c.kind === "quest" ? (
                      <>
                        Bonus quest ·{" "}
                        <a
                          href={igUrl(c.handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-300 hover:underline"
                        >
                          {c.handle}
                        </a>
                      </>
                    ) : (
                      `${LADDER[c.tier ?? 0]?.name} · ${(c.score ?? 0).toLocaleString()} pts`
                    )}{" "}
                    · {c.email} · {fmtDate(c.createdAt)}
                  </p>
                </div>
                <CodeActions c={c} act={act} />
              </li>
            );
          })
        )}
      </ul>
      {rows.length > 200 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing 200 of {rows.length}. Search to narrow it down.
        </p>
      ) : null}
    </Panel>
  );
}

/* ── Campaign settings ───────────────────────────────────────────────────── */

function SettingsPanel({ settings }: { settings: LootSettings }) {
  const id = useId();
  const qc = useQueryClient();
  const [s, setS] = useState<LootSettings>(settings);
  useEffect(() => setS(settings), [settings]);
  const set = <K extends keyof LootSettings>(k: K, v: LootSettings[K]) =>
    setS((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);

  const save = useMutation({
    mutationFn: () => {
      const { updatedAt: _u, ...rest } = s;
      return lootSaveSettingsFn({ data: rest });
    },
    onSuccess: () => {
      toast.success("Saved. The game picks it up within a minute.");
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save"),
  });

  const missing = s.follow.filter((f) => !f.url).map((f) => f.label);

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Campaign"
        sub="What the game offers. Changes apply to new codes only; codes already given out keep their terms."
        icon={Settings2}
        tone="violet"
      />
      <form
        className="mt-4 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Rewards on</span>
            <span className="block text-xs text-muted-foreground">
              Off hides the rewards in the game and stops new codes.
            </span>
          </span>
          <Switch checked={s.active} onCheckedChange={(v) => set("active", v)} />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Score rewards</legend>
          <p className="text-xs text-muted-foreground">
            The best rarity a round reaches wins its discount. One score code per email: a better
            round upgrades it.
          </p>
          <ul className="mt-2 space-y-2">
            {s.rewards.map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <Select
                  value={String(r.tier)}
                  onValueChange={(v) =>
                    set(
                      "rewards",
                      s.rewards.map((x, j) => (j === i ? { ...x, tier: Number(v) } : x)),
                    )
                  }
                >
                  <SelectTrigger className="flex-1" aria-label={`Reward ${i + 1} rarity`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LADDER.map((t, ti) =>
                      ti === 0 ? null : (
                        <SelectItem key={t.name} value={String(ti)}>
                          {t.name} ({t.at.toLocaleString()}+)
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <div className="relative w-24">
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={r.percent}
                    aria-label={`Reward ${i + 1} percent off`}
                    onChange={(e) =>
                      set(
                        "rewards",
                        s.rewards.map((x, j) =>
                          j === i ? { ...x, percent: Math.round(Number(e.target.value) || 0) } : x,
                        ),
                      )
                    }
                    className="pr-7"
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove reward ${i + 1}`}
                  onClick={() =>
                    set(
                      "rewards",
                      s.rewards.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {s.rewards.length < 6 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              onClick={() =>
                set("rewards", [
                  ...s.rewards,
                  { tier: Math.min(9, (s.rewards.at(-1)?.tier ?? 3) + 1), percent: 20 },
                ])
              }
            >
              <Plus aria-hidden />
              Add a reward
            </Button>
          ) : null}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="sr-only">Bonus quest</legend>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Bonus quest</span>
              <span className="block text-xs text-muted-foreground">
                Follow every account + share to a story = one extra code per email.
              </span>
            </span>
            <Switch checked={s.questEnabled} onCheckedChange={(v) => set("questEnabled", v)} />
          </label>
          {s.questEnabled && !questReady(s) ? (
            <p className="rounded-lg bg-amber-300/[0.08] px-3 py-2 text-xs text-amber-100">
              Hidden in the game until every account has a link
              {missing.length ? `: add ${missing.join(", ")}` : ""}.
            </p>
          ) : null}
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <Field label="Story tags" htmlFor={`${id}-tags`} hint="Shown on the story card">
              <Input
                id={`${id}-tags`}
                value={s.storyTags}
                maxLength={120}
                onChange={(e) => set("storyTags", e.target.value)}
                placeholder="@medialife.ai @taskbarhero"
              />
            </Field>
            <Field label="Bonus" htmlFor={`${id}-qp`}>
              <div className="relative">
                <Input
                  id={`${id}-qp`}
                  type="number"
                  min={1}
                  max={90}
                  value={s.questPercent}
                  onChange={(e) => set("questPercent", Math.round(Number(e.target.value) || 0))}
                  className="pr-7"
                />
                <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </Field>
          </div>
          <ul className="space-y-2">
            {s.follow.map((f, i) => (
              <li key={i} className="grid grid-cols-[110px_1fr_auto] items-center gap-2">
                <Input
                  value={f.label}
                  maxLength={40}
                  aria-label={`Account ${i + 1} name`}
                  onChange={(e) =>
                    set(
                      "follow",
                      s.follow.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  value={f.url}
                  aria-label={`${f.label || `Account ${i + 1}`} link`}
                  placeholder="https://www.instagram.com/…"
                  className={cn(!f.url && "border-amber-300/40")}
                  onChange={(e) =>
                    set(
                      "follow",
                      s.follow.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${f.label || `account ${i + 1}`}`}
                  onClick={() =>
                    set(
                      "follow",
                      s.follow.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {s.follow.length < 5 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => set("follow", [...s.follow, { label: "", url: "" }])}
            >
              <Plus aria-hidden />
              Add an account
            </Button>
          ) : null}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Field
            label="Shop link"
            htmlFor={`${id}-shop`}
            hint="Where players spend the code (https)"
          >
            <Input
              id={`${id}-shop`}
              value={s.shopUrl}
              onChange={(e) => set("shopUrl", e.target.value)}
              placeholder="https://shop.example.com/tbh"
            />
          </Field>
          <Field label="Button" htmlFor={`${id}-shopl`}>
            <Input
              id={`${id}-shopl`}
              value={s.shopLabel}
              maxLength={30}
              onChange={(e) => set("shopLabel", e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Code prefix"
            htmlFor={`${id}-pre`}
            hint={`${s.prefix || "TBH"}10-7KQM-X3PF`}
          >
            <Input
              id={`${id}-pre`}
              value={s.prefix}
              maxLength={6}
              onChange={(e) =>
                set("prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Codes last" htmlFor={`${id}-exp`} hint="Days, 1 to 365">
            <Input
              id={`${id}-exp`}
              type="number"
              min={1}
              max={365}
              value={s.expiryDays}
              onChange={(e) => set("expiryDays", Math.round(Number(e.target.value) || 0))}
            />
          </Field>
        </div>
        <Field
          label="Terms"
          htmlFor={`${id}-terms`}
          hint={`${s.terms.length}/300 · shown under every code`}
        >
          <Textarea
            id={`${id}-terms`}
            rows={2}
            maxLength={300}
            value={s.terms}
            onChange={(e) => set("terms", e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => setS(settings)}>
              Discard
            </Button>
          ) : null}
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            Save campaign
          </Button>
        </div>
      </form>
    </Panel>
  );
}
