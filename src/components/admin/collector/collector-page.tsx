import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Gem,
  KeyRound,
  Loader2,
  Pause,
  Play,
  QrCode,
  Send,
  Sheet,
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
import { Textarea } from "@/components/ui/textarea";
import {
  collectorOverviewFn,
  createBatchFn,
  deleteAlertFn,
  sendAlertFn,
  setBatchStatusFn,
} from "@/lib/collector/admin.functions";
import { ROOMS, type AlertKind, type CollectorAlert } from "@/lib/collector/model";
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
} from "../kit";

// /admin/collector: the team's controls for the MEDIALIFE Collector Hub.
//   - Live alerts: what every fan's room computer shows (and pops up) next.
//   - Unlock codes: batches of BOBO-XXXX-XXXX codes per product, as a CSV and a
//     printable QR sheet for the factory.

const ROOM = ROOMS.evade;
const KIND_LABEL: Record<AlertKind, string> = {
  drop: "New drop",
  event: "Event",
  reward: "Reward",
  news: "News",
};
const KIND_DOT: Record<AlertKind, string> = {
  drop: "bg-amber-300",
  event: "bg-cyan-300",
  reward: "bg-pink-400",
  news: "bg-violet-300",
};

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const ago = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function CollectorPage() {
  const q = useQuery({
    queryKey: ["collector-overview"],
    queryFn: () => collectorOverviewFn(),
    retry: (n, err) => !isUnauthorized(err) && n < 2,
  });
  const data = q.data;

  return (
    <>
      <Toaster theme="dark" position="bottom-right" />
      <PageHeader
        title="Collector Hub"
        icon={Gem}
        tone="sky"
        badge={<NamespaceBadge ns={data?.ns} />}
      >
        <p className="mt-1 max-w-2xl text-sm text-white/65">
          Fans unlock {ROOM.name} with the code that ships with their {ROOM.ip} merch. Send alerts
          to every room's computer, and make code batches for the factory.
        </p>
      </PageHeader>

      <div className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {q.isError && isUnauthorized(q.error) ? (
          <SignInAgain />
        ) : q.isError ? (
          <Panel className="mx-auto max-w-md p-6 text-center">
            <h2 className="text-base font-medium">Couldn't load the Collector Hub</h2>
            <Button className="mt-4" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </Panel>
        ) : !data ? (
          <Panel className="h-72 animate-pulse" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Unlocked rooms" value={data.owners} icon={Users} tone="sky" />
              <StatTile
                label="Codes made"
                value={data.batches.reduce((s, b) => s + b.count, 0)}
                hint={`${data.batches.reduce((s, b) => s + b.claimed, 0)} claimed`}
                icon={KeyRound}
                tone="violet"
              />
              <StatTile label="Live alerts" value={data.alerts.length} icon={Bell} tone="amber" />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <AlertsPanel alerts={data.alerts} />
              <CodesPanel
                batches={data.batches}
                testCode={data.testCode}
                codesReady={data.codesReady}
                secretSet={data.codeSecretSet}
                ns={data.ns}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ── Alerts ──────────────────────────────────────────────────────────────── */

function AlertsPanel({ alerts }: { alerts: CollectorAlert[] }) {
  const id = useId();
  const qc = useQueryClient();
  const [kind, setKind] = useState<AlertKind>("drop");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const send = useMutation({
    mutationFn: () =>
      sendAlertFn({
        data: {
          room: ROOM.id,
          kind,
          title,
          body,
          linkLabel: linkLabel || undefined,
          linkUrl: linkUrl || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Sent. Open rooms show it within about 15 seconds.");
      setTitle("");
      setBody("");
      setLinkLabel("");
      setLinkUrl("");
      void qc.invalidateQueries({ queryKey: ["collector-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send"),
  });
  const del = useMutation({
    mutationFn: (alertId: string) => deleteAlertFn({ data: { room: ROOM.id, id: alertId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["collector-overview"] }),
  });

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Live alerts"
        sub={`Pops up on the computer in every ${ROOM.name} that's open, and waits in the Alerts app.`}
        icon={Bell}
        tone="amber"
      />
      <form
        className="mt-4 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) send.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Type" htmlFor={`${id}-kind`}>
            <Select value={kind} onValueChange={(v) => setKind(v as AlertKind)}>
              <SelectTrigger id={`${id}-kind`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title" htmlFor={`${id}-title`} hint={`${title.length}/60`}>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Hoodie drop this Friday"
              required
            />
          </Field>
        </div>
        <Field label="Message" htmlFor={`${id}-body`} hint={`${body.length}/180`}>
          <Textarea
            id={`${id}-body`}
            value={body}
            maxLength={180}
            rows={2}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Your hoodie slot lights up the moment you unlock one."
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <Field label="Button (optional)" htmlFor={`${id}-ll`}>
            <Input
              id={`${id}-ll`}
              value={linkLabel}
              maxLength={24}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Shop now"
            />
          </Field>
          <Field label="Button link" htmlFor={`${id}-lu`} hint="https:// or a path on this site">
            <Input
              id={`${id}-lu`}
              value={linkUrl}
              maxLength={400}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={!title.trim() || send.isPending}>
            {send.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            Send to every room
          </Button>
        </div>
      </form>

      <ul className="mt-5 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {alerts.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">
            No alerts yet. Rooms say "No alerts yet" until you send one.
          </li>
        ) : (
          alerts.map((a) => (
            <li key={a.id} className="flex items-start gap-3 p-3">
              <span
                className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", KIND_DOT[a.kind])}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.title}</p>
                {a.body ? <p className="text-xs text-muted-foreground">{a.body}</p> : null}
                <p className="mt-1 text-[11px] text-white/45">
                  {KIND_LABEL[a.kind]} · {ago(a.at)}
                  {a.linkUrl ? ` · ${a.linkLabel} → ${a.linkUrl}` : ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete "${a.title}"`}
                disabled={del.isPending}
                onClick={() => del.mutate(a.id)}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}

/* ── Codes ───────────────────────────────────────────────────────────────── */

type BatchRow = Awaited<ReturnType<typeof collectorOverviewFn>>["batches"][number];

function CodesPanel({
  batches,
  testCode,
  codesReady,
  secretSet,
  ns,
}: {
  batches: BatchRow[];
  testCode: string | null;
  codesReady: boolean;
  secretSet: boolean;
  ns: string;
}) {
  const id = useId();
  const qc = useQueryClient();
  const released = ROOM.products.filter((p) => p.released);
  const [product, setProduct] = useState(released[0]?.id ?? "keychain");
  const [count, setCount] = useState(500);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://medialife.ai/labs/collector-hub/");

  const create = useMutation({
    mutationFn: () =>
      createBatchFn({ data: { room: ROOM.id, product, count, label, experienceUrl: url } }),
    onSuccess: (b) => {
      toast.success(`Batch ${b.key} ready: ${b.count} codes`);
      setLabel("");
      void qc.invalidateQueries({ queryKey: ["collector-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't make the batch"),
  });
  const status = useMutation({
    mutationFn: (v: { key: string; status: "active" | "paused" }) => setBatchStatusFn({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["collector-overview"] }),
  });

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Unlock codes"
        sub="One code per product unit. The first email to use it owns that room; email + code signs them in anywhere."
        icon={KeyRound}
        tone="violet"
      />

      {testCode ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Test code <span className="font-mono tracking-wider">{testCode}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Works with any email and unlocks the keychain as #00412.{" "}
              {ns === "prod"
                ? "On because COLLECTOR_TEST_CODE=on."
                : "Off on medialife.ai unless COLLECTOR_TEST_CODE=on."}
            </p>
          </div>
          <CopyButton text={testCode} label="Copy test code" />
        </div>
      ) : null}

      {!codesReady ? (
        <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] p-3 text-sm text-amber-100">
          Add <code>COLLECTOR_CODE_SECRET</code> (any random 32+ characters) to Netlify before
          making real codes. Keep it forever: changing it breaks every printed code.
        </p>
      ) : !secretSet ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Using a development secret on this {ns} site. Codes made here only work here.
        </p>
      ) : null}

      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Product" htmlFor={`${id}-p`}>
          <Select value={product} onValueChange={setProduct}>
            <SelectTrigger id={`${id}-p`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROOM.products.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={!p.released}>
                  {p.name}
                  {p.released ? "" : " (not released)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="How many codes" htmlFor={`${id}-n`} hint="1 to 5,000 per batch">
          <Input
            id={`${id}-n`}
            type="number"
            min={1}
            max={5000}
            value={count}
            onChange={(e) =>
              setCount(Math.max(1, Math.min(5000, Math.round(Number(e.target.value) || 1))))
            }
          />
        </Field>
        <Field label="Name" htmlFor={`${id}-l`}>
          <Input
            id={`${id}-l`}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Keychain, first factory run"
          />
        </Field>
        <Field label="QR opens" htmlFor={`${id}-u`} hint="The code is added as ?hub=BOBO-…">
          <Input id={`${id}-u`} value={url} onChange={(e) => setUrl(e.target.value)} />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={!codesReady || create.isPending}>
            {create.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <KeyRound aria-hidden />
            )}
            Make codes
          </Button>
        </div>
      </form>

      <ul className="mt-5 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
        {batches.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No batches yet.</li>
        ) : (
          batches.map((b) => (
            <li key={b.key} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {b.label}{" "}
                  {b.status === "paused" ? (
                    <span className="ml-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] text-amber-200">
                      Paused
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Batch {b.key} · {b.claimed} of {b.count} claimed ·{" "}
                  {new Date(b.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/collector/admin/batches/${b.key}?format=csv`} download>
                    <Sheet aria-hidden />
                    CSV
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/api/collector/admin/batches/${b.key}?format=qr`}
                    target="_blank"
                    rel="noopener"
                  >
                    <QrCode aria-hidden />
                    QR sheet
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={status.isPending}
                  onClick={() =>
                    status.mutate({
                      key: b.key,
                      status: b.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {b.status === "active" ? <Pause aria-hidden /> : <Play aria-hidden />}
                  {b.status === "active" ? "Pause" : "Resume"}
                </Button>
              </div>
            </li>
          ))
        )}
      </ul>
    </Panel>
  );
}
