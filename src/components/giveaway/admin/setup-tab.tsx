/**
 * The campaign builder: everything the team fills in for a giveaway (basics,
 * dates, prizes, who can enter, points, mailing lists, tasks, rules). Edits are
 * local until "Save"; going live is blocked until the checklist is clear.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ClipboardPaste,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Panel, PanelTitle } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { adminSaveGiveaway } from "@/lib/giveaway/admin.functions";
import {
  CA_PROVINCES,
  CAMPAIGN_STATUS_LABELS,
  COUNTRY_LABELS,
  FOLLOW_PLATFORMS,
  PLATFORM_LABELS,
  TASK_KINDS,
  TASK_KIND_LABELS,
  TASK_VERIFIED,
  blankTask,
  goLiveProblems,
  type CampaignStatus,
  type GiveawayCampaign,
  type GiveawayTask,
  type TaskKind,
} from "@/lib/giveaway/model";
import { generatedRules } from "@/lib/giveaway/rules";
import { cn } from "@/lib/utils";

const PROFILE_HINT: Record<string, string> = {
  instagram: "https://www.instagram.com/handle",
  tiktok: "https://www.tiktok.com/@handle",
  youtube: "https://www.youtube.com/@channel",
  x: "https://x.com/handle",
  twitch: "https://www.twitch.tv/handle",
  roblox: "https://www.roblox.com/communities/…",
  other: "https://…",
};

const rid = () => Math.random().toString(36).slice(2, 10);

const toLocal = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (v: string) => (v ? new Date(v).getTime() || null : null);

const select =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label className="text-[13px]">{label}</Label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Num({
  value,
  onChange,
  min = 0,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
}) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={min}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function SetupTab({ campaign, origin }: { campaign: GiveawayCampaign; origin: string }) {
  const router = useRouter();
  const [c, setC] = useState(campaign);
  const [busy, setBusy] = useState(false);
  const dirty = useMemo(() => JSON.stringify(c) !== JSON.stringify(campaign), [c, campaign]);
  const problems = goLiveProblems(c);
  const set = <K extends keyof GiveawayCampaign>(k: K, v: GiveawayCampaign[K]) =>
    setC((cur) => ({ ...cur, [k]: v }));
  const setTask = (i: number, patch: Partial<GiveawayTask>) =>
    setC((cur) => ({ ...cur, tasks: cur.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));

  async function save(status?: CampaignStatus) {
    const next = status ? { ...c, status } : c;
    setBusy(true);
    try {
      const r = await adminSaveGiveaway({ data: next });
      if (!r.ok) return toast.error(r.error);
      setC(r.campaign);
      toast.success(
        status === "live" ? "It's live." : status === "closed" ? "Entries closed." : "Saved",
      );
      await router.invalidate();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message.includes("Use")
          ? err.message
          : "Couldn't save. Check the fields marked in red.",
      );
    } finally {
      setBusy(false);
    }
  }

  function moveTask(i: number, d: -1 | 1) {
    setC((cur) => {
      const tasks = [...cur.tasks];
      const j = i + d;
      if (j < 0 || j >= tasks.length) return cur;
      [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
      return { ...cur, tasks };
    });
  }

  return (
    <div className="grid gap-5 pb-24">
      {/* Status */}
      <Panel className="p-5" accent={c.status === "live"}>
        <PanelTitle
          title={`Status: ${CAMPAIGN_STATUS_LABELS[c.status]}`}
          sub={
            c.status === "draft"
              ? "Only the team can see a draft (open the public page while signed in to preview it)."
              : c.status === "live"
                ? "Open for entries between the start and end dates."
                : "Closed: no new entries or points. You can still run the draw."
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`${origin}/giveaway/${campaign.slug}`} target="_blank" rel="noreferrer">
                  Open public page
                </a>
              </Button>
              {c.status !== "live" ? (
                <Button onClick={() => save("live")} disabled={busy || problems.length > 0}>
                  Go live
                </Button>
              ) : (
                <Button variant="outline" onClick={() => save("closed")} disabled={busy}>
                  Close entries
                </Button>
              )}
              {c.status !== "draft" ? (
                <Button variant="ghost" onClick={() => save("draft")} disabled={busy}>
                  Back to draft
                </Button>
              ) : null}
            </div>
          }
        />
        {problems.length ? (
          <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="text-sm font-medium text-amber-200">To go live, fill in:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100/90">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : c.status === "draft" ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="size-4" aria-hidden /> Everything required is filled in.
          </p>
        ) : null}
      </Panel>

      {/* Basics */}
      <Panel className="p-5">
        <PanelTitle title="Basics" sub="What people see at the top of the page." />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <Input value={c.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Web address" hint={`${origin}/giveaway/${c.slug}`}>
            <Input
              value={c.slug}
              onChange={(e) =>
                set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
              }
            />
          </Field>
          <Field label="Tagline" className="md:col-span-2">
            <Input value={c.tagline} onChange={(e) => set("tagline", e.target.value)} />
          </Field>
          <Field
            label="Brand line"
            hint="Top-left of the page and email eyebrow, e.g. MEDIALIFE × EVADE."
          >
            <Input value={c.brandLine} onChange={(e) => set("brandLine", e.target.value)} />
          </Field>
          <Field
            label="Hero image"
            hint="A /path on the site or an https:// link. Upload images in the Media library and paste the link."
          >
            <Input value={c.heroImage} onChange={(e) => set("heroImage", e.target.value)} />
          </Field>
          <Field
            label="Sponsor (legal name)"
            hint="Who runs the giveaway, as it appears in the rules."
          >
            <Input value={c.sponsor} onChange={(e) => set("sponsor", e.target.value)} />
          </Field>
          <Field label="Sponsor address">
            <Input
              value={c.sponsorAddress}
              onChange={(e) => set("sponsorAddress", e.target.value)}
            />
          </Field>
        </div>
      </Panel>

      {/* Dates */}
      <Panel className="p-5">
        <PanelTitle
          title="Dates"
          sub="In your computer's time zone. Entries and points only count between start and end."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Starts">
            <Input
              type="datetime-local"
              value={toLocal(c.startsAt)}
              onChange={(e) => set("startsAt", fromLocal(e.target.value))}
            />
          </Field>
          <Field label="Ends">
            <Input
              type="datetime-local"
              value={toLocal(c.endsAt)}
              onChange={(e) => set("endsAt", fromLocal(e.target.value))}
            />
          </Field>
          <Field label="Draw date">
            <Input
              type="datetime-local"
              value={toLocal(c.drawAt)}
              onChange={(e) => set("drawAt", fromLocal(e.target.value))}
            />
          </Field>
          <Field label="Time zone label" hint="Shown in the rules, e.g. ET.">
            <Input value={c.timeZoneLabel} onChange={(e) => set("timeZoneLabel", e.target.value)} />
          </Field>
        </div>
      </Panel>

      {/* Prizes */}
      <Panel className="p-5">
        <PanelTitle
          title="Prizes"
          sub="The draw picks one winner per prize. Retail value is required in the rules."
          actions={
            <div className="flex items-center gap-2">
              <Label htmlFor="gw-cur" className="text-xs text-muted-foreground">
                Currency
              </Label>
              <select
                id="gw-cur"
                className={cn(select, "w-24")}
                value={c.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                {["CAD", "USD", "EUR", "GBP"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          }
        />
        <div className="mt-4 grid gap-3">
          {c.prizes.map((p, i) => (
            <div
              key={p.id}
              className="grid gap-3 rounded-xl border border-white/[0.07] p-3 md:grid-cols-[2fr_3fr_1fr_1fr_auto] md:items-end"
            >
              <Field label="Prize">
                <Input
                  value={p.title}
                  onChange={(e) =>
                    set(
                      "prizes",
                      c.prizes.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              <Field label="Description">
                <Input
                  value={p.description}
                  onChange={(e) =>
                    set(
                      "prizes",
                      c.prizes.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              <Field label="Value each">
                <Num
                  value={p.retailValue}
                  onChange={(n) =>
                    set(
                      "prizes",
                      c.prizes.map((x, j) => (j === i ? { ...x, retailValue: n } : x)),
                    )
                  }
                />
              </Field>
              <Field label="How many">
                <Num
                  min={1}
                  value={p.quantity}
                  onChange={(n) =>
                    set(
                      "prizes",
                      c.prizes.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, n) } : x)),
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove prize"
                onClick={() =>
                  set(
                    "prizes",
                    c.prizes.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              set("prizes", [
                ...c.prizes,
                { id: rid(), title: "", description: "", retailValue: 0, quantity: 1 },
              ])
            }
          >
            <Plus aria-hidden /> Add prize
          </Button>
        </div>
      </Panel>

      {/* Eligibility */}
      <Panel className="p-5">
        <PanelTitle
          title="Who can enter"
          sub="Excluding Quebec avoids the Régie filing and fee for prizes over $100."
        />
        <div className="mt-4 grid gap-5 md:grid-cols-[2fr_2fr_1fr]">
          <Field label="Countries">
            <div className="flex flex-wrap gap-2">
              {Object.entries(COUNTRY_LABELS).map(([k, v]) => {
                const on = c.countries.includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "countries",
                        on ? c.countries.filter((x) => x !== k) : [...c.countries, k],
                      )
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs",
                      on
                        ? "border-[var(--partner)] bg-[var(--partner)]/15 text-white"
                        : "border-white/15 text-muted-foreground",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Excluded provinces" hint="Canada only.">
            <div className="flex flex-wrap gap-2">
              {Object.entries(CA_PROVINCES).map(([k, v]) => {
                const code = `CA-${k}`;
                const on = c.excludedRegions.includes(code);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "excludedRegions",
                        on
                          ? c.excludedRegions.filter((x) => x !== code)
                          : [...c.excludedRegions, code],
                      )
                    }
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs",
                      on
                        ? "border-rose-400/60 bg-rose-400/15 text-rose-100"
                        : "border-white/15 text-muted-foreground",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field
            label="Minimum age"
            hint="Under the age of majority need a parent's permission (in the rules)."
          >
            <Num min={13} value={c.minAge} onChange={(n) => set("minAge", n)} />
          </Field>
        </div>
      </Panel>

      {/* Points */}
      <Panel className="p-5">
        <PanelTitle
          title="Points"
          sub="1 point = 1 ticket. Confirming the email gives everyone at least one ticket (also the free way to enter)."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Confirmed entry">
            <Num value={c.entryPoints} onChange={(n) => set("entryPoints", n)} />
          </Field>
          <Field label="Per friend referred">
            <Num value={c.referralPoints} onChange={(n) => set("referralPoints", n)} />
          </Field>
          <Field label="Max friends that count">
            <Num value={c.referralCap} onChange={(n) => set("referralCap", n)} />
          </Field>
          <Field
            label="Cap on follow/visit points"
            hint="0 = no cap. Keeps unverifiable tasks from dominating."
          >
            <Num value={c.honourCap} onChange={(n) => set("honourCap", n)} />
          </Field>
        </div>
      </Panel>

      {/* Mailing lists */}
      <Panel className="p-5">
        <PanelTitle
          title="Mailing lists"
          sub="Each is its own unticked checkbox on the entry form (CASL). Export subscribers from the Entrants tab."
        />
        <div className="mt-4 grid gap-3">
          {c.optIns.map((o, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_3fr_auto] sm:items-end">
              <Field label="List ID">
                <Input
                  value={o.id}
                  onChange={(e) =>
                    set(
                      "optIns",
                      c.optIns.map((x, j) =>
                        j === i
                          ? { ...x, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }
                          : x,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Checkbox wording">
                <Input
                  value={o.label}
                  onChange={(e) =>
                    set(
                      "optIns",
                      c.optIns.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove list"
                onClick={() =>
                  set(
                    "optIns",
                    c.optIns.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              set("optIns", [...c.optIns, { id: `list-${c.optIns.length + 1}`, label: "" }])
            }
          >
            <Plus aria-hidden /> Add list
          </Button>
        </div>
      </Panel>

      {/* Tasks */}
      <Panel className="p-5">
        <PanelTitle
          title="Tasks"
          sub="Checked automatically: mailing list, Discord, codes. Honour system (winner check by hand): follows and visits."
        />
        <div className="mt-4 grid gap-3">
          {c.tasks.map((t, i) => (
            <TaskEditor
              key={t.id}
              task={t}
              optIns={c.optIns}
              onChange={(p) => setTask(i, p)}
              onRemove={() =>
                set(
                  "tasks",
                  c.tasks.filter((_, j) => j !== i),
                )
              }
              onMove={(d) => moveTask(i, d)}
              first={i === 0}
              last={i === c.tasks.length - 1}
            />
          ))}
          <AddTask
            onAdd={(kind) => set("tasks", [...c.tasks, { ...blankTask(rid(), kind), title: "" }])}
          />
        </div>
      </Panel>

      {/* Rules */}
      <Panel className="p-5">
        <PanelTitle
          title="Official rules"
          sub="Paste your reviewed rules here. Blank lines start paragraphs, lines starting “## ” are headings, “- ” makes a list. Leave empty to show rules generated from the settings above."
          actions={
            <Button variant="outline" onClick={() => set("rulesText", generatedRules(c))}>
              <ClipboardPaste aria-hidden /> Start from generated rules
            </Button>
          }
        />
        <Textarea
          className="mt-4 min-h-72 font-mono text-[13px]"
          value={c.rulesText}
          onChange={(e) => set("rulesText", e.target.value)}
          placeholder="Leave empty to use the generated rules."
        />
      </Panel>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[oklch(0.1_0.01_280/0.92)] px-4 py-3 backdrop-blur md:left-[var(--sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <Button variant="ghost" disabled={!dirty || busy} onClick={() => setC(campaign)}>
            Discard
          </Button>
          <Button disabled={!dirty || busy} onClick={() => save()}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddTask({ onAdd }: { onAdd: (k: TaskKind) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TASK_KINDS.map((k) => (
        <Button key={k} variant="outline" size="sm" onClick={() => onAdd(k)}>
          <Plus aria-hidden /> {TASK_KIND_LABELS[k]}
        </Button>
      ))}
    </div>
  );
}

function TaskEditor({
  task: t,
  optIns,
  onChange,
  onRemove,
  onMove,
  first,
  last,
}: {
  task: GiveawayTask;
  optIns: GiveawayCampaign["optIns"];
  onChange: (p: Partial<GiveawayTask>) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-white/[0.08] p-4", !t.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-white/85">{TASK_KIND_LABELS[t.kind]}</span>
          <span className={TASK_VERIFIED[t.kind] ? "text-emerald-300" : "text-amber-300"}>
            {TASK_VERIFIED[t.kind] ? "· checked automatically" : "· honour system"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <label className="mr-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={t.enabled}
              onCheckedChange={(v) => onChange({ enabled: v })}
              aria-label="Task on"
            />{" "}
            {t.enabled ? "On" : "Off"}
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Move up"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Move down"
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Remove task"
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[3fr_1fr]">
        <Field label="Title">
          <Input value={t.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label="Points">
          <Num value={t.points} onChange={(n) => onChange({ points: n })} />
        </Field>
        <Field label="Short description (optional)" className="md:col-span-2">
          <Input
            value={t.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </Field>
        {t.kind === "follow" ? (
          <>
            <Field label="Platform">
              <select
                className={select}
                value={t.platform ?? "instagram"}
                onChange={(e) => onChange({ platform: e.target.value as GiveawayTask["platform"] })}
              >
                {FOLLOW_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_LABELS[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Profile link">
              <Input
                value={t.url}
                onChange={(e) => onChange({ url: e.target.value.trim() })}
                placeholder={PROFILE_HINT[t.platform ?? "other"]}
              />
            </Field>
          </>
        ) : null}
        {t.kind === "visit" ? (
          <Field label="Link" className="md:col-span-2">
            <Input
              value={t.url}
              onChange={(e) => onChange({ url: e.target.value.trim() })}
              placeholder="https://…"
            />
          </Field>
        ) : null}
        {t.kind === "discord" ? (
          <>
            <Field label="Invite link">
              <Input
                value={t.url}
                onChange={(e) => onChange({ url: e.target.value.trim() })}
                placeholder="https://discord.gg/…"
              />
            </Field>
            <Field
              label="Server ID"
              hint="Discord: Server Settings → Widget, or right-click the server with Developer Mode on → Copy Server ID."
            >
              <Input
                value={t.guildId ?? ""}
                onChange={(e) => onChange({ guildId: e.target.value.replace(/\D/g, "") })}
              />
            </Field>
          </>
        ) : null}
        {t.kind === "newsletter" ? (
          <Field label="Mailing list" className="md:col-span-2">
            <select
              className={select}
              value={t.listId ?? ""}
              onChange={(e) => onChange({ listId: e.target.value || null })}
            >
              <option value="">Choose…</option>
              {optIns.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label || o.id}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {t.kind === "code" ? (
          <>
            <Field
              label="Accepted codes"
              hint="One per line, not case-sensitive. Never shown to entrants."
            >
              <Textarea
                className="min-h-20 font-mono text-[13px]"
                value={t.codes.join("\n")}
                onChange={(e) =>
                  onChange({ codes: e.target.value.split(/\n/).map((x) => x.toUpperCase()) })
                }
              />
            </Field>
            <Field label="Where to find it" hint="Shown above the code box.">
              <Textarea
                className="min-h-20"
                value={t.codeHint}
                onChange={(e) => onChange({ codeHint: e.target.value })}
              />
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}
