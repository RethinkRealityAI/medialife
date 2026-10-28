import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  CalendarDays,
  Clapperboard,
  Gift,
  Globe2,
  Loader2,
  Lock,
  Mail,
  Megaphone,
  NotebookPen,
  Pencil,
  RotateCw,
  ShieldAlert,
  Trash2,
  Truck,
  UserRound,
  UserX,
} from "lucide-react";

import { formatDate, formatDateTime } from "@/components/admin/format";
import {
  AdminTab,
  AdminTabs,
  Avatar,
  BackLink,
  EmptyState,
  Panel,
  PanelTitle,
  TabCount,
  Tag,
  accentEdge,
  well,
  type AdminTabDef,
} from "@/components/admin/kit";
import {
  Blank,
  CheckRow,
  DataList,
  Field,
  outlineBtn,
  useRun,
} from "@/components/admin/creators/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminAssignUgcCampaign,
  adminDeleteUgcCreatorData,
  adminEditUgcCreator,
  adminResendUgcJoinLink,
  adminSetUgcStatus,
} from "@/lib/ugc/admin.functions";
import {
  UGC_PLATFORM_LABELS,
  UGC_PLATFORMS,
  UGC_STATUS_LABELS,
  UGC_STATUSES,
  UGC_TRANSITIONS,
  canSignIn,
  formatBytes,
  type ShippingAddress,
  type UgcPlatform,
  type UgcStatus,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { ActivityTab, ContentTab, NotesTab, PerksTab, ShippingTab } from "./creator-tabs";
import type { CreatorDetail, PipelineCampaign } from "./types";
import {
  CampaignPill,
  HandleLink,
  JoinLinksDialog,
  UgcStatusPill,
  addressLines,
  useBulk,
} from "./ui";

export const UGC_DETAIL_TABS = [
  "overview",
  "content",
  "shipping",
  "perks",
  "activity",
  "notes",
] as const;
export type UgcDetailTab = (typeof UGC_DETAIL_TABS)[number];

export function defaultUgcTab(d: CreatorDetail): UgcDetailTab {
  return d.submissions.some((s) => s.status === "in-review") ? "content" : "overview";
}

export function UgcCreatorPage({
  data,
  campaigns,
  tab,
  onTab,
}: {
  data: CreatorDetail;
  campaigns: PipelineCampaign[];
  tab: UgcDetailTab;
  onTab: (t: UgcDetailTab) => void;
}) {
  const inReview = data.submissions.filter((s) => s.status === "in-review").length;
  const tabs: AdminTabDef<UgcDetailTab>[] = [
    { id: "overview", label: "Overview", icon: UserRound },
    {
      id: "content",
      label: "Content",
      icon: Clapperboard,
      badge: (
        <TabCount
          n={data.submissions.filter((s) => s.status !== "uploading").length}
          alert={inReview ? "amber" : undefined}
        />
      ),
    },
    {
      id: "shipping",
      label: "Shipping",
      icon: Truck,
      badge: data.shipments.length ? <TabCount n={data.shipments.length} /> : null,
    },
    { id: "perks", label: "Perks", icon: Gift, badge: <TabCount n={data.perks.length} /> },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "notes", label: "Notes", icon: NotebookPen },
  ];
  return (
    <>
      <UgcCreatorHeader data={data} />
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        <AdminTabs label="Creator sections" tabs={tabs} value={tab} onChange={onTab}>
          <AdminTab value="overview">
            <OverviewTab data={data} campaigns={campaigns} />
          </AdminTab>
          <AdminTab value="content">
            <ContentTab data={data} />
          </AdminTab>
          <AdminTab value="shipping">
            <ShippingTab data={data} />
          </AdminTab>
          <AdminTab value="perks">
            <PerksTab data={data} />
          </AdminTab>
          <AdminTab value="activity">
            <ActivityTab data={data} />
          </AdminTab>
          <AdminTab value="notes">
            <NotesTab data={data} />
          </AdminTab>
        </AdminTabs>
      </div>
    </>
  );
}

/* ── Header ───────────────────────────────────────────────────────────────── */

function UgcCreatorHeader({ data }: { data: CreatorDetail }) {
  const c = data.creator;
  const dates: [string, number | null][] = [
    ["Signed up", c.createdAt],
    ["Approved", c.approvedAt],
    ["First sign-in", c.joinedAt],
    ["Last sign-in", c.lastLoginAt],
  ];
  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8">
      <header
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border bg-[var(--partner-ink)]",
          accentEdge,
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(60%_120%_at_100%_0%,color-mix(in_oklab,var(--partner-2)_28%,transparent),transparent_70%),radial-gradient(45%_90%_at_0%_100%,color-mix(in_oklab,var(--partner)_14%,transparent),transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent opacity-70"
        />
        <div className="p-5 sm:p-6">
          <BackLink to="/admin/ugc">Pipeline</BackLink>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
              <Avatar
                name={c.creatorName || c.name || c.email}
                size="lg"
                className="hidden sm:grid"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight md:text-[1.75rem]">
                    {c.creatorName || c.name || "Unnamed creator"}
                  </h1>
                  <UgcStatusPill status={c.status} />
                  {c.sample ? <Tag tone="amber">Sample</Tag> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/70">
                  {c.name ? (
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="size-3.5 text-white/55" aria-hidden />
                      {c.name}
                    </span>
                  ) : null}
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Mail className="size-3.5 shrink-0 text-white/55" aria-hidden />
                    <a
                      href={`mailto:${c.email}`}
                      className="truncate text-white/90 hover:underline"
                    >
                      {c.email}
                    </a>
                  </span>
                  {c.country ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Globe2 className="size-3.5 text-white/55" aria-hidden />
                      {c.country}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5 text-white/40" aria-hidden />
                  {dates.map(([label, at]) =>
                    at ? (
                      <span key={label} suppressHydrationWarning title={formatDateTime(at)}>
                        {label} {formatDate(at)}
                      </span>
                    ) : null,
                  )}
                  {!c.joinedAt && canSignIn(c.status) ? <span>Hasn't signed in yet</span> : null}
                </div>
              </div>
            </div>
            <StatusControl data={data} />
          </div>
        </div>
      </header>
      {c.deletionRequest ? <DeletionBanner data={data} /> : null}
    </div>
  );
}

const STATUS_EFFECT: Partial<Record<UgcStatus, string>> = {
  approved: "First approval assigns the live campaign and emails a one-time join link (7 days).",
  declined: "Signs them out; they can't sign in. Nothing is emailed.",
  paused: "They can still sign in and read the brief, but can't upload.",
  shipped: "Stamps the shipment as shipped (use Shipping to add tracking).",
  delivered: "Stamps the shipment as delivered; the address is purged in 90 days.",
};

function StatusControl({ data }: { data: CreatorDetail }) {
  const uid = useId();
  const c = data.creator;
  const bulk = useBulk();
  const [target, setTarget] = useState<UgcStatus | null>(null);
  const [override, setOverride] = useState(false);
  const [notify, setNotify] = useState(true);
  const [links, setLinks] = useState<{ name: string; email: string; devLink: string }[]>([]);
  const allowed = UGC_TRANSITIONS[c.status];
  const others = UGC_STATUSES.filter((s) => s !== c.status && !allowed.includes(s));
  const firstApproval =
    target === "approved" && (c.status === "applied" || c.status === "declined");
  const forced = target ? !allowed.includes(target) : false;
  const label = c.creatorName || c.name;

  async function apply() {
    if (!target) return;
    const r = await bulk.run(
      "status",
      () =>
        adminSetUgcStatus({
          data: { ids: [c.id], status: target, force: forced || undefined, notify },
        }),
      `Moved to ${UGC_STATUS_LABELS[target]}:`,
    );
    setTarget(null);
    const dev = r?.find((x) => x.devLink)?.devLink;
    if (dev) setLinks([{ name: label, email: c.email, devLink: dev }]);
  }
  async function resend() {
    const r = await bulk.run(
      "resend",
      async () => ({ results: [await adminResendUgcJoinLink({ data: { id: c.id } })] }),
      "Sent a new join link to",
    );
    const dev = r?.[0]?.devLink;
    if (dev) setLinks([{ name: label, email: c.email, devLink: dev }]);
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-3 rounded-2xl bg-black/30 p-3 ring-1 ring-white/[0.08] ring-inset sm:w-auto">
      <div className="w-full min-w-0 sm:w-56">
        <Label htmlFor={`${uid}-status`} className="text-xs text-muted-foreground">
          Move to
        </Label>
        <Select value="" onValueChange={(v) => setTarget(v as UgcStatus)}>
          <SelectTrigger id={`${uid}-status`} className="mt-1 h-10 bg-black/30">
            <SelectValue placeholder="Choose a status" />
          </SelectTrigger>
          <SelectContent>
            {allowed.map((s) => (
              <SelectItem key={s} value={s}>
                {UGC_STATUS_LABELS[s]}
              </SelectItem>
            ))}
            {override && others.length ? (
              <>
                <SelectSeparator />
                {others.map((s) => (
                  <SelectItem key={s} value={s}>
                    {UGC_STATUS_LABELS[s]} (override)
                  </SelectItem>
                ))}
              </>
            ) : null}
          </SelectContent>
        </Select>
        <CheckRow
          id={`${uid}-override`}
          checked={override}
          onChange={setOverride}
          className="mt-2 [&_label]:text-xs [&_label]:text-muted-foreground"
        >
          Allow any status
        </CheckRow>
      </div>
      {canSignIn(c.status) ? (
        <Button
          variant="outline"
          size="sm"
          className={cn("h-10", outlineBtn)}
          onClick={resend}
          disabled={bulk.busy}
          title="Email a new one-time sign-in link"
        >
          {bulk.pending === "resend" ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <RotateCw aria-hidden />
          )}
          Resend join link
        </Button>
      ) : null}

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {label} to {target ? UGC_STATUS_LABELS[target] : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(target && STATUS_EFFECT[target]) ??
                "Content statuses also move on their own as uploads are reviewed and posted."}
              {forced ? " This skips the usual pipeline order." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {firstApproval ? (
            <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
              Send the join email
            </CheckRow>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void apply();
              }}
              disabled={bulk.busy}
              className={
                target === "declined"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {bulk.pending === "status" ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Move to {target ? UGC_STATUS_LABELS[target] : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <JoinLinksDialog links={links} onClose={() => setLinks([])} />
    </div>
  );
}

function DeletionBanner({ data }: { data: CreatorDetail }) {
  const r = data.creator.deletionRequest!;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-red-400/35 bg-[linear-gradient(90deg,rgb(248_113_113/0.14),rgb(248_113_113/0.03))] px-4 py-3 text-sm">
      <ShieldAlert className="size-5 shrink-0 text-red-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          Asked for their data to be deleted{" "}
          <span suppressHydrationWarning className="font-normal text-muted-foreground">
            {formatDate(r.at)}
          </span>
        </div>
        {r.note ? <p className="mt-0.5 text-muted-foreground">“{r.note}”</p> : null}
      </div>
      <PurgeButtons data={data} compact />
    </div>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */

function OverviewTab({ data, campaigns }: { data: CreatorDetail; campaigns: PipelineCampaign[] }) {
  const c = data.creator;
  const [edit, setEdit] = useState(false);
  const platforms = UGC_PLATFORMS.filter((p) => c.platforms.includes(p) || c.handles[p]);
  const src = c.source;
  const utm = Object.entries(src.utm)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
  const used = data.quota.usedBytes / data.quota.limitBytes;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @5xl/inset:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Panel className="p-4 sm:p-5">
          <PanelTitle
            icon={UserRound}
            tone="sky"
            title="Profile"
            sub="What they sent on the landing page form. They can edit it in their profile."
            actions={
              <Button
                variant="outline"
                size="sm"
                className={outlineBtn}
                onClick={() => setEdit(true)}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
            }
          />
          <DataList
            className="mt-3"
            rows={[
              ["Name", c.name],
              ["Creator name", c.creatorName],
              [
                "Email",
                <a key="e" href={`mailto:${c.email}`} className="hover:underline">
                  {c.email}
                </a>,
              ],
              ["Country", c.country],
              ["Main platform", c.mainPlatform ? UGC_PLATFORM_LABELS[c.mainPlatform] : null],
              [
                "Contact consent",
                c.consent.contact
                  ? `Yes${c.consent.at ? `, ${formatDate(c.consent.at)}` : ""}`
                  : "No",
              ],
              [
                "Signed up via",
                <span key="s" className="text-sm">
                  {SOURCE_LABEL[src.kind]}
                  {src.page ? <span className="text-muted-foreground"> · {src.page}</span> : null}
                  {utm ? (
                    <span className="mono block text-[11px] text-muted-foreground">{utm}</span>
                  ) : null}
                </span>,
              ],
              [
                "Their notes",
                c.applicationNotes ? (
                  <span className="whitespace-pre-wrap">{c.applicationNotes}</span>
                ) : null,
              ],
            ]}
          />
        </Panel>

        <Panel className="p-4 sm:p-5">
          <PanelTitle
            icon={Globe2}
            tone="violet"
            title="Platforms"
            sub="Handles link to their profiles."
          />
          {platforms.length ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {platforms.map((p) => (
                <li key={p} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="w-24 shrink-0 font-medium">
                    {UGC_PLATFORM_LABELS[p]}
                    {c.mainPlatform === p ? (
                      <span className="ml-1.5 text-[10px] font-semibold tracking-wide text-amber-300 uppercase">
                        Main
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    {c.handles[p] ? (
                      <HandleLink platform={p} handle={c.handles[p]!} />
                    ) : (
                      <Blank>No handle</Blank>
                    )}
                  </span>
                  <span className="text-xs text-sky-200">{c.audiences[p] ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No platforms given.</p>
          )}
        </Panel>

        <CampaignsPanel data={data} campaigns={campaigns} />
      </div>

      <div className="space-y-4">
        <PiiCard data={data} />
        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title="Upload space"
            sub={`${formatBytes(data.quota.usedBytes)} of ${formatBytes(data.quota.limitBytes)} used · ${formatBytes(data.quota.fileLimitBytes)} per file`}
          />
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
            <div
              className={cn("h-full rounded-full", used > 0.9 ? "bg-red-400" : "bg-sky-400")}
              style={{ width: `${Math.min(100, used * 100)}%` }}
            />
          </div>
        </Panel>
      </div>
      <EditProfileDialog data={data} open={edit} onClose={() => setEdit(false)} />
    </div>
  );
}

const SOURCE_LABEL: Record<CreatorDetail["creator"]["source"]["kind"], string> = {
  "netlify-form": "Landing page form",
  csv: "CSV import",
  manual: "Added by the team",
  seed: "Sample data",
};

function CampaignsPanel({
  data,
  campaigns,
}: {
  data: CreatorDetail;
  campaigns: PipelineCampaign[];
}) {
  const { run, busy } = useRun();
  const c = data.creator;
  const addable = campaigns.filter((x) => !c.campaignIds.includes(x.id));
  return (
    <Panel className="p-4 sm:p-5">
      <PanelTitle
        icon={Megaphone}
        tone="amber"
        title="Campaigns"
        sub="Their brief is the newest live one."
        actions={
          addable.length ? (
            <Select
              value=""
              disabled={busy}
              onValueChange={(v) =>
                void run(
                  "assign",
                  () =>
                    adminAssignUgcCampaign({
                      data: { campaignId: v, creatorIds: [c.id], assign: true },
                    }),
                  "Added to the campaign",
                )
              }
            >
              <SelectTrigger className="h-8 w-auto gap-2 text-sm" aria-label="Add to a campaign">
                <span>Add to campaign</span>
              </SelectTrigger>
              <SelectContent>
                {addable.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />
      {data.campaigns.length ? (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {[...data.campaigns].reverse().map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-2.5">
              <Link
                to="/admin/ugc/campaigns/$campaignId"
                params={{ campaignId: x.id }}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {x.title}
              </Link>
              <CampaignPill status={x.status} />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                disabled={busy}
                onClick={() =>
                  void run(
                    "unassign",
                    () =>
                      adminAssignUgcCampaign({
                        data: { campaignId: x.id, creatorIds: [c.id], assign: false },
                      }),
                    "Removed from the campaign",
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Not on a campaign. Approving assigns the live one.
        </p>
      )}
    </Panel>
  );
}

function PiiCard({ data }: { data: CreatorDetail }) {
  const [edit, setEdit] = useState(false);
  const p = data.pii;
  const lines = addressLines(p.address);
  return (
    <Panel className="border-amber-400/30 p-4 sm:p-5">
      <PanelTitle
        icon={Lock}
        tone="amber"
        title="Phone and address"
        sub="Admin only. Used for shipping; never shown to EVADE."
        actions={
          <Button variant="outline" size="sm" className={outlineBtn} onClick={() => setEdit(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
        }
      />
      <div className={cn("mt-3 space-y-3 p-3 text-sm", well)}>
        <div>
          <div className="text-xs text-muted-foreground">Phone</div>
          <div className="mt-0.5">
            {p.phone ? (
              <a href={`tel:${p.phone}`} className="hover:underline">
                {p.phone}
              </a>
            ) : (
              <Blank />
            )}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Shipping address</div>
          {lines.length ? (
            <address className="mt-0.5 not-italic leading-relaxed">
              {lines.map((l, i) => (
                <span key={i} className="block">
                  {l}
                </span>
              ))}
            </address>
          ) : (
            <div className="mt-0.5">
              <Blank>{p.purgedAt ? `Deleted ${formatDate(p.purgedAt)}` : "Not given"}</Blank>
            </div>
          )}
        </div>
      </div>
      {p.purgeAfter && !p.purgedAt ? (
        <p className="mt-2 text-xs text-muted-foreground" suppressHydrationWarning>
          The address is deleted automatically on {formatDate(p.purgeAfter)} (90 days after
          delivery).
        </p>
      ) : null}
      <div className="mt-4 border-t border-white/[0.06] pt-4">
        <div className="text-xs font-medium text-red-200">Delete data</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          For a data-deletion request. Can't be undone.
        </p>
        <div className="mt-2.5">
          <PurgeButtons data={data} />
        </div>
      </div>
      <EditPiiDialog data={data} open={edit} onClose={() => setEdit(false)} />
    </Panel>
  );
}

function PurgeButtons({ data, compact }: { data: CreatorDetail; compact?: boolean }) {
  const navigate = useNavigate();
  const { run, busy } = useRun();
  const [mode, setMode] = useState<null | "pii" | "all">(null);
  const [typed, setTyped] = useState("");
  const c = data.creator;
  useEffect(() => setTyped(""), [mode]);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        className="border-red-400/40 bg-transparent text-red-200 hover:bg-red-400/10 hover:text-red-100"
        onClick={() => setMode("pii")}
      >
        <Trash2 aria-hidden />
        {compact ? "Purge phone + address" : "Delete phone + address"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-red-200/80 hover:bg-red-400/10 hover:text-red-100"
        onClick={() => setMode("all")}
      >
        <UserX aria-hidden />
        Delete everything
      </Button>
      <AlertDialog open={!!mode} onOpenChange={(o) => !o && setMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === "all"
                ? `Delete ${c.creatorName || c.name} entirely?`
                : "Delete phone and address?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "all"
                ? "Removes the creator, their uploads and files, perks, shipments and sessions. A later Netlify sync won't bring them back."
                : "Purges their phone number and shipping address now and closes the deletion request. Their uploads and profile stay."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mode === "all" ? (
            <Field label={`Type ${c.email} to confirm`} htmlFor="purge-confirm">
              <Input
                id="purge-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </Field>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || (mode === "all" && typed.trim().toLowerCase() !== c.email)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!mode) return;
                const r = await run(
                  "purge",
                  () => adminDeleteUgcCreatorData({ data: { id: c.id, mode } }),
                  mode === "all" ? "Creator deleted" : "Phone and address deleted",
                );
                setMode(null);
                if (r && mode === "all") void navigate({ to: "/admin/ugc" });
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Edit dialogs ─────────────────────────────────────────────────────────── */

function EditProfileDialog({
  data,
  open,
  onClose,
}: {
  data: CreatorDetail;
  open: boolean;
  onClose: () => void;
}) {
  const uid = useId();
  const { run, busy } = useRun();
  const c = data.creator;
  const [f, setF] = useState(() => profileForm(data));
  useEffect(() => {
    if (open) setF(profileForm(data));
  }, [open, data]);
  const set = <K extends keyof ReturnType<typeof profileForm>>(
    k: K,
    v: ReturnType<typeof profileForm>[K],
  ) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              "profile",
              () =>
                adminEditUgcCreator({
                  data: {
                    id: c.id,
                    name: f.name,
                    creatorName: f.creatorName,
                    email: f.email,
                    country: f.country,
                    handles: f.handles,
                    mainPlatform: f.mainPlatform || null,
                  },
                }),
              "Profile saved",
            );
            if (r) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Changes show in their hub straight away.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor={`${uid}-name`}>
              <Input
                id={`${uid}-name`}
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </Field>
            <Field label="Creator name" htmlFor={`${uid}-cn`}>
              <Input
                id={`${uid}-cn`}
                value={f.creatorName}
                onChange={(e) => set("creatorName", e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor={`${uid}-email`}>
              <Input
                id={`${uid}-email`}
                type="email"
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </Field>
            <Field label="Country" htmlFor={`${uid}-country`}>
              <Input
                id={`${uid}-country`}
                value={f.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </Field>
          </div>
          <fieldset className="space-y-2.5">
            <legend className="text-sm font-medium">Handles</legend>
            {UGC_PLATFORMS.map((p) => (
              <div key={p} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
                <Label
                  htmlFor={`${uid}-h-${p}`}
                  className="text-sm font-normal text-muted-foreground"
                >
                  {UGC_PLATFORM_LABELS[p]}
                </Label>
                <Input
                  id={`${uid}-h-${p}`}
                  value={f.handles[p] ?? ""}
                  onChange={(e) => set("handles", { ...f.handles, [p]: e.target.value })}
                  placeholder="@handle or link"
                />
              </div>
            ))}
          </fieldset>
          <Field label="Main platform" htmlFor={`${uid}-main`}>
            <Select
              value={f.mainPlatform || "__none"}
              onValueChange={(v) => set("mainPlatform", v === "__none" ? "" : (v as UgcPlatform))}
            >
              <SelectTrigger id={`${uid}-main`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not set</SelectItem>
                {UGC_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {UGC_PLATFORM_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const profileForm = (d: CreatorDetail) => ({
  name: d.creator.name,
  creatorName: d.creator.creatorName,
  email: d.creator.email,
  country: d.creator.country,
  handles: { ...d.creator.handles } as Partial<Record<UgcPlatform, string>>,
  mainPlatform: (d.creator.mainPlatform ?? "") as UgcPlatform | "",
});

const EMPTY_ADDRESS: ShippingAddress = {
  name: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
};

function EditPiiDialog({
  data,
  open,
  onClose,
}: {
  data: CreatorDetail;
  open: boolean;
  onClose: () => void;
}) {
  const uid = useId();
  const { run, busy } = useRun();
  const [phone, setPhone] = useState(data.pii.phone);
  const [a, setA] = useState<ShippingAddress>(data.pii.address ?? EMPTY_ADDRESS);
  useEffect(() => {
    if (!open) return;
    setPhone(data.pii.phone);
    setA(
      data.pii.address ?? {
        ...EMPTY_ADDRESS,
        name: data.creator.name,
        country: data.creator.country,
      },
    );
  }, [open, data]);
  const field = (k: keyof ShippingAddress, label: string, opt?: boolean) => (
    <Field label={label} htmlFor={`${uid}-${k}`} optional={opt}>
      <Input
        id={`${uid}-${k}`}
        value={a[k]}
        onChange={(e) => setA({ ...a, [k]: e.target.value })}
      />
    </Field>
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              "pii",
              () =>
                adminEditUgcCreator({
                  data: { id: data.creator.id, phone, address: a.line1.trim() ? a : null },
                }),
              "Phone and address saved",
            );
            if (r) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Phone and address</DialogTitle>
            <DialogDescription>
              Admin only. Clear the first line to remove the address.
            </DialogDescription>
          </DialogHeader>
          <Field label="Phone" htmlFor={`${uid}-phone`} optional>
            <Input
              id={`${uid}-phone`}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">{field("name", "Recipient")}</div>
            <div className="sm:col-span-2">{field("line1", "Address line 1")}</div>
            <div className="sm:col-span-2">{field("line2", "Address line 2", true)}</div>
            {field("city", "City")}
            {field("region", "State / region")}
            {field("postalCode", "Postal code")}
            {field("country", "Country")}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Route states ─────────────────────────────────────────────────────────── */

export function UgcCreatorNotFound() {
  return (
    <div className="mx-auto mt-10 max-w-md px-4">
      <EmptyState
        icon={UserX}
        tone="slate"
        title="Creator not found"
        action={
          <Button asChild>
            <Link to="/admin/ugc">Back to the pipeline</Link>
          </Button>
        }
      >
        They may have been deleted, or the link is wrong.
      </EmptyState>
    </div>
  );
}
