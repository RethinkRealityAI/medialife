import { useId, useMemo, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
  Check,
  CloudDownload,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  Settings2,
  UploadCloud,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { formatDateTime } from "@/components/admin/format";
import { PageBody, PageHeader, Panel, PanelTitle, well } from "@/components/admin/kit";
import { CheckRow, Field, errorMessage, outlineBtn } from "@/components/admin/creators/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminAddUgcCreator,
  adminImportUgcCsv,
  adminSyncUgcNetlify,
} from "@/lib/ugc/admin.functions";
import { UGC_FORM_FIELDS, csvObjects, mapSignup, normaliseFields, toCsv } from "@/lib/ugc/import";
import {
  UGC,
  UGC_PLATFORM_LABELS,
  UGC_PLATFORMS,
  type ShippingAddress,
  type UgcPlatform,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import type { ImportStatus, PipelineCampaign } from "./types";
import { JoinLinksDialog, plural, saveText } from "./ui";

type RowResult = {
  submissionId: string | null;
  email: string;
  result: "created" | "duplicate-submission" | "duplicate-email" | "deleted-before" | "skipped";
  creatorId: string | null;
  reason?: string;
};
type Counts = {
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
  deleted?: number;
};

const RESULT_LABEL: Record<RowResult["result"], string> = {
  created: "Added",
  "duplicate-submission": "Already imported",
  "duplicate-email": "Email already here",
  "deleted-before": "Deleted earlier",
  skipped: "Skipped",
};

export function ImportPage({
  status,
  campaigns,
}: {
  status: ImportStatus;
  campaigns: PipelineCampaign[];
}) {
  return (
    <>
      <PageHeader
        title="Import sign-ups"
        icon={CloudDownload}
        tone="mint"
        description="Bring in the landing page's sign-ups. Imports are safe to repeat: nobody is added twice."
      />
      <PageBody>
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @5xl/inset:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-4">
            <NetlifyPanel status={status} />
            <CsvPanel />
          </div>
          <div className="space-y-4">
            <AddCreatorPanel campaigns={campaigns} />
            <HistoryPanel log={status.log} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

/* ── Netlify ──────────────────────────────────────────────────────────────── */

function NetlifyPanel({ status }: { status: ImportStatus }) {
  const uid = useId();
  const router = useRouter();
  const n = status.netlify;
  const [del, setDel] = useState(true);
  const [busy, setBusy] = useState<null | "dry" | "sync">(null);
  const [result, setResult] = useState<
    | { kind: "ok"; dry: boolean; counts: Counts; rows: RowResult[]; deleteErrors: number }
    | { kind: "error"; error: string }
    | { kind: "setup"; missing: string[]; help: string[] }
    | null
  >(null);

  async function sync(dryRun: boolean) {
    setBusy(dryRun ? "dry" : "sync");
    try {
      const r = await adminSyncUgcNetlify({ data: { dryRun, deleteAfterImport: !dryRun && del } });
      if (!r.configured) setResult({ kind: "setup", missing: r.missing, help: r.help });
      else if (!r.ok) setResult({ kind: "error", error: r.error });
      else {
        setResult({
          kind: "ok",
          dry: dryRun,
          counts: {
            total: r.total,
            created: r.created,
            duplicates: r.duplicates,
            skipped: r.skipped,
            deleted: r.deleted,
          },
          rows: r.rows,
          deleteErrors: r.deleteErrors,
        });
        if (!dryRun) {
          toast.success(
            r.created ? `Added ${plural(r.created, "new sign-up")}` : "No new sign-ups",
          );
          await router.invalidate();
        }
      }
    } catch (err) {
      setResult({ kind: "error", error: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  const missing = !n.configured ? n.missing : result?.kind === "setup" ? result.missing : [];
  const help = !n.configured ? n.help : result?.kind === "setup" ? result.help : [];
  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        icon={RefreshCw}
        tone="mint"
        title="Sync from Netlify Forms"
        sub={`Pulls every submission of the “${UGC.formName}” form on the landing page.`}
      />
      {missing.length ? (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-amber-100">
            <Settings2 className="size-4" aria-hidden />
            Not set up on this site yet
          </div>
          <p className="mt-1 text-muted-foreground">
            Missing{" "}
            {missing.map((m, i) => (
              <span key={m}>
                {i ? " and " : ""}
                <code className="mono rounded bg-black/40 px-1.5 py-0.5 text-xs text-amber-100">
                  {m}
                </code>
              </span>
            ))}
            . Until then, use the CSV export below.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-white/80 marker:text-amber-300">
            {help.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <CheckRow
            id={`${uid}-del`}
            checked={del}
            onChange={setDel}
            hint="Recommended: addresses then only live here (and are purged 90 days after delivery)."
          >
            Delete each submission from Netlify after it's imported
          </CheckRow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void sync(false)} disabled={!!busy}>
              {busy === "sync" ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              Sync now
            </Button>
            <Button
              variant="outline"
              className={outlineBtn}
              onClick={() => void sync(true)}
              disabled={!!busy}
            >
              {busy === "dry" ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Preview without importing
            </Button>
          </div>
        </div>
      )}
      {result?.kind === "error" ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/[0.06] p-3 text-sm text-red-100">
          {result.error}
        </p>
      ) : null}
      {result?.kind === "ok" ? (
        <ImportResult
          title={result.dry ? "Preview: nothing was imported" : "Sync finished"}
          counts={result.counts}
          rows={result.rows}
          note={
            result.deleteErrors
              ? `${plural(result.deleteErrors, "submission")} couldn't be deleted from Netlify.`
              : null
          }
        />
      ) : null}
    </Panel>
  );
}

/* ── CSV ──────────────────────────────────────────────────────────────────── */

type Preview = {
  headers: string[];
  matched: number;
  rows: {
    email: string;
    name: string;
    creatorName: string;
    platforms: string;
    problem: string | null;
  }[];
};

function previewCsv(text: string): Preview {
  const objects = csvObjects(text);
  const headers = objects.length ? Object.keys(objects[0]) : [];
  const matched = Object.keys(
    normaliseFields(Object.fromEntries(headers.map((h) => [h, "x"]))),
  ).length;
  return {
    headers,
    matched,
    rows: objects.map((o) => {
      const m = mapSignup(normaliseFields(o), { kind: "csv", submissionId: null });
      return m.ok
        ? {
            email: m.signup.creator.email,
            name: m.signup.creator.name,
            creatorName: m.signup.creator.creatorName,
            platforms: m.signup.creator.platforms.map((p) => UGC_PLATFORM_LABELS[p]).join(", "),
            problem: null,
          }
        : {
            email: String(o.email ?? o.Email ?? ""),
            name: "",
            creatorName: "",
            platforms: "",
            problem: m.reason,
          };
    }),
  };
}

function CsvPanel() {
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ counts: Counts; rows: RowResult[] } | null>(null);
  const preview = useMemo(() => (csv ? previewCsv(csv) : null), [csv]);
  const ok = preview?.rows.filter((r) => !r.problem).length ?? 0;

  async function load(f: File | undefined) {
    if (!f) return;
    if (f.size > 5_000_000) {
      toast.error("That file is over 5 MB. Split it and import the parts.");
      return;
    }
    setResult(null);
    setFileName(f.name);
    setCsv(await f.text());
  }

  async function importIt() {
    setBusy(true);
    try {
      const r = await adminImportUgcCsv({ data: { csv } });
      setResult({ counts: r, rows: r.rows });
      toast.success(
        r.created ? `Added ${plural(r.created, "new sign-up")}` : "No new sign-ups in that file",
      );
      await router.invalidate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        icon={FileSpreadsheet}
        tone="sky"
        title="Upload a CSV"
        sub="From Netlify: Forms → evade-ugc-creator → Download as CSV. Columns are matched to the form's field names."
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="text-sky-300 hover:bg-white/[0.06] hover:text-sky-200"
            onClick={() =>
              void saveText(toCsv([...UGC_FORM_FIELDS], []), "ugc-signups-template.csv")
            }
          >
            <Download aria-hidden />
            Template
          </Button>
        }
      />
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void load(e.dataTransfer.files[0]);
        }}
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center rounded-2xl border border-dashed px-4 py-7 text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--partner)]",
          drag
            ? "border-[var(--partner)] bg-[color-mix(in_oklab,var(--partner)_8%,transparent)]"
            : "border-white/[0.14] bg-white/[0.015] hover:bg-white/[0.03]",
        )}
      >
        <UploadCloud className="size-7 text-sky-300" aria-hidden />
        <span className="mt-2 text-sm font-medium">
          {fileName || "Drop the CSV here, or choose a file"}
        </span>
        <span className="mt-0.5 text-xs text-muted-foreground">
          Nothing is imported until you confirm.
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="csv-input"
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {preview && !result ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{plural(preview.rows.length, "row")}</span>
              <span className="text-muted-foreground">
                {" "}
                · {preview.matched} of {preview.headers.length} columns matched
                {preview.rows.length - ok ? ` · ${preview.rows.length - ok} will be skipped` : ""}
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCsv("");
                  setFileName("");
                }}
              >
                Clear
              </Button>
              <Button size="sm" onClick={importIt} disabled={busy || !ok}>
                {busy ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <UploadCloud aria-hidden />
                )}
                Import {plural(ok, "row")}
              </Button>
            </div>
          </div>
          {preview.matched === 0 ? (
            <p className="text-xs text-amber-200">
              None of the columns match the form. Check it's the export of “{UGC.formName}”, or use
              the template.
            </p>
          ) : null}
          <div className={cn("max-h-72 overflow-auto", well)}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[oklch(0.12_0.01_280)]">
                <tr className="text-left text-[10px] tracking-wide text-white/55 uppercase">
                  <th className="px-3 py-2 font-normal">Email</th>
                  <th className="px-3 py-2 font-normal">Creator</th>
                  <th className="hidden px-3 py-2 font-normal sm:table-cell">Platforms</th>
                  <th className="px-3 py-2 font-normal">
                    <span className="sr-only">Check</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {preview.rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className={cn(r.problem && "text-muted-foreground")}>
                    <td className="mono max-w-[12rem] truncate px-3 py-1.5">{r.email || "–"}</td>
                    <td className="max-w-[10rem] truncate px-3 py-1.5">
                      {r.creatorName || r.name || "–"}
                    </td>
                    <td className="hidden max-w-[10rem] truncate px-3 py-1.5 sm:table-cell">
                      {r.platforms || "–"}
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {r.problem ? (
                        <span className="text-amber-200">{r.problem}</span>
                      ) : (
                        <Check className="ml-auto size-3.5 text-emerald-300" aria-label="OK" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {result ? (
        <ImportResult
          title={`Imported ${fileName || "the CSV"}`}
          counts={result.counts}
          rows={result.rows}
          onReset={() => {
            setResult(null);
            setCsv("");
            setFileName("");
          }}
        />
      ) : null}
    </Panel>
  );
}

function ImportResult({
  title,
  counts,
  rows,
  note,
  onReset,
}: {
  title: string;
  counts: Counts;
  rows: RowResult[];
  note?: string | null;
  onReset?: () => void;
}) {
  const tiles: [string, number, string][] = [
    ["Rows", counts.total, "text-white"],
    ["Added", counts.created, "text-emerald-300"],
    ["Already here", counts.duplicates, "text-sky-200"],
    ["Skipped", counts.skipped, counts.skipped ? "text-amber-200" : "text-white/60"],
    ...(counts.deleted != null
      ? ([["Deleted from Netlify", counts.deleted, "text-white/80"]] as [string, number, string][])
      : []),
  ];
  return (
    <div className="mt-4 space-y-3" data-testid="import-result">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {onReset ? (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Import another
          </Button>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map(([k, v, tone]) => (
          <div key={k} className={cn("px-3 py-2.5", well)}>
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className={cn("text-xl font-semibold tabular-nums", tone)}>{v}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="text-xs text-amber-200">{note}</p> : null}
      {rows.length ? (
        <ul className={cn("max-h-60 divide-y divide-white/[0.05] overflow-y-auto text-xs", well)}>
          {rows.map((r, i) => (
            <li key={`${r.submissionId}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
              {r.result === "created" ? (
                <Check className="size-3.5 shrink-0 text-emerald-300" aria-hidden />
              ) : r.result === "skipped" ? (
                <X className="size-3.5 shrink-0 text-amber-300" aria-hidden />
              ) : (
                <span className="size-3.5 shrink-0" aria-hidden />
              )}
              {r.creatorId ? (
                <Link
                  to="/admin/ugc/creators/$creatorId"
                  params={{ creatorId: r.creatorId }}
                  className="mono min-w-0 flex-1 truncate hover:underline"
                >
                  {r.email || "(no email)"}
                </Link>
              ) : (
                <span className="mono min-w-0 flex-1 truncate">{r.email || "(no email)"}</span>
              )}
              <span className="shrink-0 text-muted-foreground">
                {RESULT_LABEL[r.result]}
                {r.reason ? `: ${r.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ── Add by hand ──────────────────────────────────────────────────────────── */

const EMPTY_ADDRESS: ShippingAddress = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

function AddCreatorPanel({ campaigns }: { campaigns: PipelineCampaign[] }) {
  const uid = useId();
  const router = useRouter();
  const live = campaigns.filter((c) => c.status === "live");
  const [name, setName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [handles, setHandles] = useState<Partial<Record<UgcPlatform, string>>>({});
  const [phone, setPhone] = useState("");
  const [withAddress, setWithAddress] = useState(false);
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"applied" | "approved">("applied");
  const [notify, setNotify] = useState(true);
  const [campaignId, setCampaignId] = useState(live.length === 1 ? live[0].id : "");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  const [links, setLinks] = useState<{ name: string; email: string; devLink: string }[]>([]);

  function reset() {
    setName("");
    setCreatorName("");
    setEmail("");
    setCountry("");
    setHandles({});
    setPhone("");
    setWithAddress(false);
    setAddress(EMPTY_ADDRESS);
    setNotes("");
  }

  const af = (k: keyof ShippingAddress, label: string, cls?: string) => (
    <Field label={label} htmlFor={`${uid}-a-${k}`} className={cls} optional={k === "line2"}>
      <Input
        id={`${uid}-a-${k}`}
        value={address[k]}
        onChange={(e) => setAddress({ ...address, [k]: e.target.value })}
      />
    </Field>
  );

  return (
    <Panel className="scroll-mt-24 p-4 sm:p-5" id="add">
      <PanelTitle
        icon={UserPlus}
        tone="violet"
        title="Add a creator by hand"
        sub="For someone who signed up another way (DM, event, email)."
      />
      <form
        className="mt-4 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await adminAddUgcCreator({
              data: {
                name,
                creatorName,
                email,
                country: country || undefined,
                handles: Object.fromEntries(Object.entries(handles).filter(([, v]) => v?.trim())),
                phone: phone || undefined,
                address:
                  withAddress && address.line1.trim()
                    ? { ...address, name: address.name || name }
                    : null,
                notes: notes || undefined,
                status,
                notify: status === "approved" ? notify : undefined,
                campaignId: status === "approved" && campaignId ? campaignId : undefined,
              },
            });
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success(`${creatorName || name} added`);
            setAdded({ id: r.creatorId, name: creatorName || name });
            if (r.devLink) setLinks([{ name: creatorName || name, email, devLink: r.devLink }]);
            reset();
            await router.invalidate();
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor={`${uid}-name`}>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Creator name" htmlFor={`${uid}-cn`}>
            <Input
              id={`${uid}-cn`}
              value={creatorName}
              onChange={(e) => setCreatorName(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Email" htmlFor={`${uid}-email`}>
            <Input
              id={`${uid}-email`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label="Country" htmlFor={`${uid}-country`} optional>
            <Input
              id={`${uid}-country`}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Handles</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {UGC_PLATFORMS.map((p) => (
              <div key={p} className="flex items-center gap-2">
                <Label
                  htmlFor={`${uid}-h-${p}`}
                  className="w-20 shrink-0 text-xs font-normal text-muted-foreground"
                >
                  {UGC_PLATFORM_LABELS[p]}
                </Label>
                <Input
                  id={`${uid}-h-${p}`}
                  value={handles[p] ?? ""}
                  onChange={(e) => setHandles({ ...handles, [p]: e.target.value })}
                  placeholder="@handle"
                  className="h-9"
                />
              </div>
            ))}
          </div>
        </fieldset>
        <Field label="Phone" htmlFor={`${uid}-phone`} optional>
          <Input
            id={`${uid}-phone`}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <CheckRow id={`${uid}-addr`} checked={withAddress} onChange={setWithAddress}>
          Add a shipping address
        </CheckRow>
        {withAddress ? (
          <div className={cn("grid gap-3 p-3 sm:grid-cols-2", well)}>
            {af("line1", "Address line 1", "sm:col-span-2")}
            {af("line2", "Address line 2", "sm:col-span-2")}
            {af("city", "City")}
            {af("region", "State / region")}
            {af("postalCode", "Postal code")}
            {af("country", "Country")}
          </div>
        ) : null}
        <Field label="Notes" htmlFor={`${uid}-notes`} optional>
          <Textarea
            id={`${uid}-notes`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </Field>
        <RadioGroup
          value={status}
          onValueChange={(v) => setStatus(v as "applied" | "approved")}
          className="gap-2"
        >
          <div className="flex items-start gap-2.5">
            <RadioGroupItem value="applied" id={`${uid}-applied`} className="mt-0.5" />
            <Label htmlFor={`${uid}-applied`} className="text-sm leading-snug font-normal">
              Add as a sign-up
              <span className="block text-xs text-muted-foreground">
                Review and approve later in the pipeline.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2.5">
            <RadioGroupItem value="approved" id={`${uid}-approved`} className="mt-0.5" />
            <Label htmlFor={`${uid}-approved`} className="text-sm leading-snug font-normal">
              Approve now
              <span className="block text-xs text-muted-foreground">Sends them a join link.</span>
            </Label>
          </div>
        </RadioGroup>
        {status === "approved" ? (
          <div className={cn("space-y-3 p-3", well)}>
            {campaigns.length ? (
              <Field label="Campaign" htmlFor={`${uid}-camp`}>
                <Select
                  value={campaignId || "__none"}
                  onValueChange={(v) => setCampaignId(v === "__none" ? "" : v)}
                >
                  <SelectTrigger id={`${uid}-camp`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">
                      {live.length === 1 ? "The live campaign" : "Don't assign yet"}
                    </SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
              Send the join email
            </CheckRow>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
            Add creator
          </Button>
          {added ? (
            <Link
              to="/admin/ugc/creators/$creatorId"
              params={{ creatorId: added.id }}
              className="text-sm text-sky-300 hover:underline"
            >
              Open {added.name}
            </Link>
          ) : null}
        </div>
      </form>
      <JoinLinksDialog links={links} onClose={() => setLinks([])} />
    </Panel>
  );
}

/* ── History ──────────────────────────────────────────────────────────────── */

function HistoryPanel({ log }: { log: ImportStatus["log"] }) {
  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle icon={History} tone="slate" title="Recent imports" />
      {log.length ? (
        <ul className="mt-3 divide-y divide-white/[0.06] text-sm">
          {log.slice(0, 12).map((l, i) => (
            <li
              key={i}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
            >
              <span>
                <span className="font-medium">
                  {String(l.kind).startsWith("netlify") ? "Netlify sync" : "CSV"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  · {l.created} added, {l.duplicates} already here
                  {l.skipped ? `, ${l.skipped} skipped` : ""}
                </span>
              </span>
              <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                {formatDateTime(l.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Nothing imported yet.</p>
      )}
    </Panel>
  );
}
