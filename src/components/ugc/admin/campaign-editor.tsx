import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  Clapperboard,
  Eye,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  Megaphone,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Rocket,
  ShieldCheck,
  Trash2,
  Undo2,
  Users,
  Video,
} from "lucide-react";

import { formatDate } from "@/components/admin/format";
import {
  AdminTab,
  AdminTabs,
  Avatar,
  BackLink,
  EmptyState,
  Panel,
  PanelTitle,
  TabCount,
  accentEdge,
  type AdminTabDef,
} from "@/components/admin/kit";
import { CheckRow, ChipsInput, Field, outlineBtn, useRun } from "@/components/admin/creators/ui";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  adminAssignUgcCampaign,
  adminDeleteUgcCampaign,
  adminSaveUgcCampaign,
  adminSetUgcCampaignStatus,
} from "@/lib/ugc/admin.functions";
import {
  UGC_ASPECTS,
  UGC_DEFAULT_DISCLOSURE,
  daysLeft,
  type UgcAspect,
  type UgcCampaign,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { AssetLibrary } from "./campaign-assets";
import { BriefPreview, ListEditor, ShotsEditor, type BriefDraft } from "./campaign-kit";
import type { CampaignDetail, CreatorSummary } from "./types";
import { CampaignPill, UgcStatusPill, fromDateInput, plural, toDateInput } from "./ui";

export const CAMPAIGN_TABS = ["brief", "assets", "creators", "preview"] as const;
export type CampaignTab = (typeof CAMPAIGN_TABS)[number];

const ASPECT_LABEL: Record<UgcAspect, string> = {
  "9:16": "9:16 vertical (TikTok, Reels, Shorts)",
  "16:9": "16:9 landscape (YouTube)",
  "1:1": "1:1 square",
  "4:5": "4:5 portrait (Instagram feed)",
  other: "Any shape",
};

function draftOf(c: UgcCampaign): BriefDraft {
  return {
    title: c.title,
    drop: c.drop,
    summary: c.summary,
    deadline: toDateInput(c.deadline),
    preferredAspect: c.preferredAspect,
    items: c.items,
    keyMessages: c.keyMessages,
    dos: c.dos,
    donts: c.donts,
    hashtags: c.hashtags,
    mentions: c.mentions,
    shots: c.shots.map((s) => ({
      key: s.id,
      id: s.id,
      label: s.label,
      required: s.required,
      tip: s.tip ?? "",
    })),
    howTo: c.howTo ? { ...c.howTo } : null,
    disclosure: c.disclosure,
  };
}

const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

/** Comparable form of a draft (ignores blank rows and the shot list's local keys). */
function normal(d: BriefDraft) {
  return JSON.stringify({
    ...d,
    title: d.title.trim(),
    drop: d.drop.trim(),
    summary: d.summary.trim(),
    disclosure: d.disclosure.trim(),
    items: clean(d.items),
    keyMessages: clean(d.keyMessages),
    dos: clean(d.dos),
    donts: clean(d.donts),
    shots: d.shots
      .filter((s) => s.label.trim())
      .map((s) => ({ id: s.id, label: s.label.trim(), required: s.required, tip: s.tip.trim() })),
    howTo: d.howTo
      ? { ...d.howTo, title: d.howTo.title.trim(), steps: clean(d.howTo.steps) }
      : null,
  });
}

function payload(d: BriefDraft) {
  return {
    title: d.title.trim() || "Untitled campaign",
    drop: d.drop,
    summary: d.summary,
    deadline: fromDateInput(d.deadline),
    preferredAspect: d.preferredAspect,
    items: clean(d.items),
    keyMessages: clean(d.keyMessages),
    dos: clean(d.dos),
    donts: clean(d.donts),
    hashtags: d.hashtags,
    mentions: d.mentions,
    shots: d.shots
      .filter((s) => s.label.trim())
      .map((s) => ({
        id: s.id,
        label: s.label.trim(),
        required: s.required,
        tip: s.tip.trim() || undefined,
      })),
    howTo: d.howTo
      ? {
          title: d.howTo.title.trim() || "How to film it",
          steps: clean(d.howTo.steps),
          exampleAssetId: d.howTo.exampleAssetId,
        }
      : null,
    disclosure: d.disclosure,
  };
}

export function CampaignEditor({
  data,
  allCreators,
  tab,
  onTab,
}: {
  data: CampaignDetail;
  allCreators: CreatorSummary[];
  tab: CampaignTab;
  onTab: (t: CampaignTab) => void;
}) {
  const c = data.campaign;
  const { run, pending } = useRun();
  const [draft, setDraft] = useState<BriefDraft>(() => draftOf(c));
  const [notify, setNotify] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const baseline = useMemo(() => normal(draftOf(c)), [c]);
  const dirty = normal(draft) !== baseline;

  // A reload (after saving an asset, say) refreshes the form unless there are unsaved edits.
  const lastBase = useRef(baseline);
  const lastId = useRef(c.id);
  useEffect(() => {
    if (c.id !== lastId.current || normal(draft) === lastBase.current) setDraft(draftOf(c));
    lastBase.current = baseline;
    lastId.current = c.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, baseline]);

  const set = <K extends keyof BriefDraft>(k: K, v: BriefDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const assigned = data.creators.length;
  const byId = new Map(data.assets.map((a) => [a.id, a]));
  const cover = c.coverAssetId ? (byId.get(c.coverAssetId) ?? null) : null;
  const example = draft.howTo?.exampleAssetId
    ? (byId.get(draft.howTo.exampleAssetId) ?? null)
    : null;

  async function save(opts: { quiet?: boolean } = {}) {
    return run(
      "save",
      () =>
        adminSaveUgcCampaign({
          data: { id: c.id, ...payload(draft), notify: c.status === "live" ? notify : undefined },
        }),
      opts.quiet
        ? null
        : (r) =>
            r.ok && r.bumped
              ? `Saved as version ${r.campaign.version}${r.notified ? `; ${plural(r.notified, "creator")} emailed` : ""}`
              : "Saved",
    );
  }

  const tabs: AdminTabDef<CampaignTab>[] = [
    {
      id: "brief",
      label: "Brief",
      icon: FileText,
      badge: dirty ? (
        <span className="size-2 rounded-full bg-amber-400">
          <span className="sr-only">(unsaved)</span>
        </span>
      ) : null,
    },
    { id: "assets", label: "Assets", icon: ImageIcon, badge: <TabCount n={data.assets.length} /> },
    { id: "creators", label: "Creators", icon: Users, badge: <TabCount n={assigned} /> },
    { id: "preview", label: "Preview", icon: Eye },
  ];

  return (
    <>
      <CampaignHeader data={data} dirty={dirty} onPublish={() => setPublishing(true)} />
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        <AdminTabs label="Campaign sections" tabs={tabs} value={tab} onChange={onTab}>
          <AdminTab value="brief">
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @6xl/inset:grid-cols-[minmax(0,1fr)_380px]">
              <BriefForm draft={draft} set={set} data={data} />
              <div className="hidden @6xl/inset:sticky @6xl/inset:top-[8.5rem] @6xl/inset:block">
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Eye className="size-3.5" aria-hidden /> Live preview
                </div>
                <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto rounded-[2rem] [scrollbar-width:thin]">
                  <BriefPreview draft={draft} cover={cover} example={example} version={c.version} />
                </div>
              </div>
            </div>
          </AdminTab>
          <AdminTab value="assets">
            <AssetLibrary campaign={c} assets={data.assets} />
          </AdminTab>
          <AdminTab value="creators">
            <CreatorsPanel data={data} allCreators={allCreators} />
          </AdminTab>
          <AdminTab value="preview">
            <p className="mb-3 text-center text-xs text-muted-foreground">
              What creators see on their Brief page{dirty ? ", including your unsaved edits" : ""}.
            </p>
            <BriefPreview draft={draft} cover={cover} example={example} version={c.version} />
          </AdminTab>
        </AdminTabs>
      </div>

      {dirty ? (
        <div className="pointer-events-none sticky bottom-[calc(var(--tabbar,0px)+0.75rem)] z-30 px-4 sm:px-6 md:bottom-4 lg:px-8">
          <div
            role="region"
            aria-label="Unsaved changes"
            className={cn(
              "glass-strong pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-3",
              accentEdge,
            )}
          >
            <span className="text-sm font-medium">Unsaved changes</span>
            {c.status === "live" ? (
              <CheckRow
                id="save-notify"
                checked={notify}
                onChange={setNotify}
                className="[&_label]:text-xs"
              >
                Email {plural(assigned, "assigned creator")} (version {c.version + 1})
              </CheckRow>
            ) : null}
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraft(draftOf(c))}
                disabled={!!pending}
              >
                <Undo2 aria-hidden />
                Discard
              </Button>
              <Button size="sm" onClick={() => void save()} disabled={!!pending}>
                {pending === "save" ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {c.status === "live" ? "Save and update brief" : "Save draft"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <PublishDialog
        open={publishing}
        onClose={() => setPublishing(false)}
        campaign={c}
        assigned={assigned}
        beforePublish={dirty ? async () => !!(await save({ quiet: true })) : undefined}
      />
    </>
  );
}

/* ── Header ───────────────────────────────────────────────────────────────── */

function CampaignHeader({
  data,
  dirty,
  onPublish,
}: {
  data: CampaignDetail;
  dirty: boolean;
  onPublish: () => void;
}) {
  const c = data.campaign;
  const navigate = useNavigate();
  const { run, pending } = useRun();
  const [confirm, setConfirm] = useState<null | "close" | "draft" | "delete">(null);
  const left = daysLeft(c.deadline);
  return (
    <div className="px-4 pt-4 sm:px-6 lg:px-8">
      <header
        className={cn(
          "relative isolate overflow-hidden rounded-3xl border bg-[var(--partner-ink)]",
          accentEdge,
        )}
      >
        {data.assets.find((a) => a.id === c.coverAssetId)?.isImage ? (
          <>
            <img
              src={data.assets.find((a) => a.id === c.coverAssetId)!.url}
              alt=""
              className="absolute inset-y-0 right-0 -z-10 h-full w-full object-cover opacity-45 sm:w-3/5"
            />
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(9_10_24/0.98)_0%,rgb(9_10_24/0.9)_45%,rgb(9_10_24/0.4)_100%)]"
            />
          </>
        ) : null}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[var(--partner)] to-transparent opacity-70"
        />
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-72">
            <BackLink to="/admin/ugc/campaigns">Campaigns</BackLink>
            {c.drop ? (
              <div className="mt-2 text-[11px] font-semibold tracking-[0.16em] text-[var(--partner)] uppercase">
                {c.drop}
              </div>
            ) : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
                {c.title}
              </h1>
              <CampaignPill status={c.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/65">
              <span>
                {c.version
                  ? `Version ${c.version}${c.publishedAt ? `, published ${formatDate(c.publishedAt)}` : ""}`
                  : "Never published"}
              </span>
              {c.deadline ? (
                <span className="inline-flex items-center gap-1" suppressHydrationWarning>
                  <CalendarClock className="size-3.5" aria-hidden />
                  Due {formatDate(c.deadline)}
                  {left != null && left >= 0
                    ? ` (${left} day${left === 1 ? "" : "s"})`
                    : left != null
                      ? " (passed)"
                      : ""}
                </span>
              ) : null}
              <span>{plural(data.creators.length, "creator")}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.status === "live" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 bg-black/30 backdrop-blur ${outlineBtn}`}
                  onClick={() => setConfirm("draft")}
                >
                  <RotateCcw aria-hidden />
                  Unpublish
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-9 bg-black/30 backdrop-blur ${outlineBtn}`}
                  onClick={() => setConfirm("close")}
                >
                  <Lock aria-hidden />
                  Close
                </Button>
              </>
            ) : (
              <>
                {c.status === "draft" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 text-red-200/90 hover:bg-red-400/10 hover:text-red-100"
                    onClick={() => setConfirm("delete")}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                ) : null}
                <Button size="sm" className="h-9" onClick={onPublish}>
                  <Rocket aria-hidden />
                  {c.status === "closed" ? "Reopen" : dirty ? "Save and publish" : "Publish"}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "close"
                ? "Close this campaign?"
                : confirm === "draft"
                  ? "Unpublish this brief?"
                  : "Delete this draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "close"
                ? "Creators can still read the brief and download assets, but it stops being their current campaign. Reopen it any time."
                : confirm === "draft"
                  ? "Creators stop seeing the brief and its assets until you publish again."
                  : "The draft and its assets are deleted. This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!pending}
              className={
                confirm === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
              onClick={async (e) => {
                e.preventDefault();
                if (confirm === "delete") {
                  const r = await run(
                    "delete",
                    () => adminDeleteUgcCampaign({ data: { id: c.id } }),
                    "Campaign deleted",
                  );
                  setConfirm(null);
                  if (r) void navigate({ to: "/admin/ugc/campaigns" });
                  return;
                }
                await run(
                  "status",
                  () =>
                    adminSetUgcCampaignStatus({
                      data: { id: c.id, status: confirm === "close" ? "closed" : "draft" },
                    }),
                  confirm === "close" ? "Campaign closed" : "Brief unpublished",
                );
                setConfirm(null);
              }}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {confirm === "close"
                ? "Close campaign"
                : confirm === "draft"
                  ? "Unpublish"
                  : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PublishDialog({
  open,
  onClose,
  campaign,
  assigned,
  beforePublish,
}: {
  open: boolean;
  onClose: () => void;
  campaign: UgcCampaign;
  assigned: number;
  beforePublish?: () => Promise<boolean>;
}) {
  const uid = useId();
  const { run, pending } = useRun();
  const [notify, setNotify] = useState(true);
  const problems = [
    !campaign.shots.length && "No shot list yet.",
    !campaign.deadline && "No deadline set.",
    !campaign.keyMessages.length && "No key messages yet.",
  ].filter(Boolean) as string[];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {campaign.status === "closed" ? "Reopen this campaign?" : "Publish this brief?"}
          </DialogTitle>
          <DialogDescription>
            Creators on this campaign see it straight away, with its assets. It becomes version{" "}
            {campaign.version + 1}.
          </DialogDescription>
        </DialogHeader>
        {problems.length && !beforePublish ? (
          <ul className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-sm text-amber-100">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {assigned ? (
          <CheckRow
            id={`${uid}-notify`}
            checked={notify}
            onChange={setNotify}
            hint="A short “Brief updated” email with a link."
          >
            Notify {plural(assigned, "assigned creator")}
          </CheckRow>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody is assigned yet. Creators you add later see this brief when they sign in.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!!pending}
            onClick={async () => {
              if (beforePublish && !(await beforePublish())) return;
              const r = await run(
                "publish",
                () =>
                  adminSetUgcCampaignStatus({
                    data: { id: campaign.id, status: "live", notify: notify && assigned > 0 },
                  }),
                (res) =>
                  res.ok
                    ? `Published version ${res.campaign.version}${res.notified ? `; ${plural(res.notified, "creator")} emailed` : ""}`
                    : null,
              );
              if (r) onClose();
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Rocket aria-hidden />}
            {beforePublish
              ? "Save and publish"
              : campaign.status === "closed"
                ? "Reopen"
                : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Brief form ───────────────────────────────────────────────────────────── */

function BriefForm({
  draft,
  set,
  data,
}: {
  draft: BriefDraft;
  set: <K extends keyof BriefDraft>(k: K, v: BriefDraft[K]) => void;
  data: CampaignDetail;
}) {
  const uid = useId();
  const videos = data.assets.filter((a) => a.isVideo);
  return (
    <div className="min-w-0 space-y-4">
      <Panel className="p-4 sm:p-5">
        <PanelTitle icon={Megaphone} tone="amber" title="Basics" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor={`${uid}-title`} className="sm:col-span-2">
            <Input
              id={`${uid}-title`}
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={140}
            />
          </Field>
          <Field
            label="Drop"
            htmlFor={`${uid}-drop`}
            hint="The product, e.g. Bobo + Eclipse can keychain."
          >
            <Input
              id={`${uid}-drop`}
              value={draft.drop}
              onChange={(e) => set("drop", e.target.value)}
              maxLength={140}
            />
          </Field>
          <Field
            label="Content deadline"
            htmlFor={`${uid}-deadline`}
            hint="Creators see a countdown."
          >
            <Input
              id={`${uid}-deadline`}
              type="date"
              className="[color-scheme:dark]"
              value={draft.deadline}
              onChange={(e) => set("deadline", e.target.value)}
            />
          </Field>
          <Field
            label="Summary"
            htmlFor={`${uid}-summary`}
            className="sm:col-span-2"
            hint="Two or three sentences at the top of the brief."
          >
            <Textarea
              id={`${uid}-summary`}
              value={draft.summary}
              onChange={(e) => set("summary", e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </Field>
          <Field
            label="Preferred shape"
            htmlFor={`${uid}-aspect`}
            hint="Uploads in another shape get a gentle warning."
          >
            <Select
              value={draft.preferredAspect}
              onValueChange={(v) => set("preferredAspect", v as UgcAspect)}
            >
              <SelectTrigger id={`${uid}-aspect`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UGC_ASPECTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {ASPECT_LABEL[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="In the package"
            htmlFor={`${uid}-items`}
            hint="Goes on the shipping export."
          >
            <ListEditor
              id={`${uid}-items`}
              value={draft.items}
              onChange={(v) => set("items", v)}
              placeholder="Bobo keychain"
              addLabel="Add item"
            />
          </Field>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={MessageSquareQuote}
          tone="sky"
          title="Messaging"
          sub="Keep it short: creators read this on their phone."
        />
        <div className="mt-4 space-y-4">
          <Field label="Key messages" htmlFor={`${uid}-msgs`} hint="Three is the sweet spot.">
            <ListEditor
              id={`${uid}-msgs`}
              value={draft.keyMessages}
              onChange={(v) => set("keyMessages", v)}
              placeholder="Tap or scan the keychain and you're in Cola Run"
              addLabel="Add message"
              max={10}
            />
          </Field>
          <div className="grid gap-4 @3xl/inset:grid-cols-2">
            <Field label="Do" htmlFor={`${uid}-dos`}>
              <ListEditor
                id={`${uid}-dos`}
                value={draft.dos}
                onChange={(v) => set("dos", v)}
                placeholder="Film vertical in good light"
                addLabel="Add a do"
              />
            </Field>
            <Field label="Don't" htmlFor={`${uid}-donts`}>
              <ListEditor
                id={`${uid}-donts`}
                value={draft.donts}
                onChange={(v) => set("donts", v)}
                placeholder="Show other brands' logos"
                addLabel="Add a don't"
              />
            </Field>
          </div>
          <div className="grid gap-4 @3xl/inset:grid-cols-2">
            <Field
              label="Hashtags"
              htmlFor={`${uid}-tags`}
              hint="Enter or comma to add. #ad stays on."
            >
              <ChipsInput
                id={`${uid}-tags`}
                value={draft.hashtags}
                onChange={(v) =>
                  set(
                    "hashtags",
                    v.map((h) => (h.startsWith("#") ? h : `#${h}`)),
                  )
                }
                placeholder="#EVADE"
                max={20}
                validate={(t) => (/\s/.test(t.trim()) ? "No spaces in a hashtag." : null)}
              />
            </Field>
            <Field label="Mentions" htmlFor={`${uid}-ments`} hint="Accounts to tag.">
              <ChipsInput
                id={`${uid}-ments`}
                value={draft.mentions}
                onChange={(v) =>
                  set(
                    "mentions",
                    v.map((h) => (h.startsWith("@") ? h : `@${h}`)),
                  )
                }
                placeholder="@playevade"
                max={20}
                validate={(t) => (/\s/.test(t.trim()) ? "No spaces in a handle." : null)}
              />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={Clapperboard}
          tone="violet"
          title="Shot list"
          sub="Creators tick shots off as they film. Required shots are flagged in review."
        />
        <div className="mt-4">
          <ShotsEditor value={draft.shots} onChange={(v) => set("shots", v)} />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={Video}
          tone="mint"
          title="How-to card"
          sub="Pinned to the top of the brief, with an example clip."
          actions={
            <div className="flex items-center gap-2">
              <Switch
                id={`${uid}-howto`}
                checked={!!draft.howTo}
                onCheckedChange={(on) =>
                  set(
                    "howTo",
                    on
                      ? { title: "How to film the scan reveal", steps: [], exampleAssetId: null }
                      : null,
                  )
                }
              />
              <label htmlFor={`${uid}-howto`} className="text-sm">
                Show
              </label>
            </div>
          }
        />
        {draft.howTo ? (
          <div className="mt-4 space-y-4">
            <Field label="Title" htmlFor={`${uid}-howto-title`}>
              <Input
                id={`${uid}-howto-title`}
                value={draft.howTo.title}
                onChange={(e) => set("howTo", { ...draft.howTo!, title: e.target.value })}
              />
            </Field>
            <Field label="Steps" htmlFor={`${uid}-howto-steps`}>
              <ListEditor
                id={`${uid}-howto-steps`}
                value={draft.howTo.steps}
                onChange={(v) => set("howTo", { ...draft.howTo!, steps: v })}
                placeholder="Phone in frame, keychain in your other hand"
                addLabel="Add step"
                max={12}
              />
            </Field>
            <Field
              label="Example clip"
              htmlFor={`${uid}-howto-ex`}
              hint={videos.length ? undefined : "Upload a video in Assets first."}
            >
              <Select
                value={draft.howTo.exampleAssetId ?? "__none"}
                onValueChange={(v) =>
                  set("howTo", { ...draft.howTo!, exampleAssetId: v === "__none" ? null : v })
                }
                disabled={!videos.length}
              >
                <SelectTrigger id={`${uid}-howto-ex`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {videos.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}
      </Panel>

      <Panel className="p-4 sm:p-5">
        <PanelTitle
          icon={ShieldCheck}
          tone="amber"
          title="Disclosure"
          sub="Shown on every brief. A free product is a material connection, so #ad is required."
          actions={
            draft.disclosure.trim() !== UGC_DEFAULT_DISCLOSURE ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => set("disclosure", UGC_DEFAULT_DISCLOSURE)}
              >
                <RotateCcw aria-hidden />
                Default
              </Button>
            ) : null
          }
        />
        <Textarea
          aria-label="Disclosure"
          className="mt-4"
          value={draft.disclosure}
          onChange={(e) => set("disclosure", e.target.value)}
          rows={3}
          maxLength={1000}
        />
      </Panel>
    </div>
  );
}

/* ── Creators ─────────────────────────────────────────────────────────────── */

function CreatorsPanel({
  data,
  allCreators,
}: {
  data: CampaignDetail;
  allCreators: CreatorSummary[];
}) {
  const { run, busy } = useRun();
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const c = data.campaign;
  const candidates = allCreators.filter(
    (x) => !x.campaignIds.includes(c.id) && x.status !== "declined" && x.status !== "applied",
  );
  const shown = candidates.filter(
    (x) => !q || `${x.creatorName} ${x.name} ${x.email}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        icon={Users}
        tone="sky"
        title="Creators on this campaign"
        sub="Approving a creator adds them to the live campaign automatically."
        actions={
          candidates.length ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add creators
            </Button>
          ) : null
        }
      />
      {!data.creators.length ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyState icon={Users} tone="slate" title="Nobody yet">
            Approve sign-ups in the pipeline, or add approved creators here.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {data.creators.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Avatar name={x.creatorName || x.name} size="sm" />
              <Link
                to="/admin/ugc/creators/$creatorId"
                params={{ creatorId: x.id }}
                className="min-w-0 flex-1"
              >
                <span className="block truncate text-sm font-medium hover:underline">
                  {x.creatorName || x.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{x.email}</span>
              </Link>
              <UgcStatusPill status={x.status} className="hidden sm:inline-flex" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                disabled={busy}
                onClick={() =>
                  void run(
                    "remove",
                    () =>
                      adminAssignUgcCampaign({
                        data: { campaignId: c.id, creatorIds: [x.id], assign: false },
                      }),
                    `Removed ${x.creatorName || x.name}`,
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={adding}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setPick(new Set());
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add creators</DialogTitle>
            <DialogDescription>Approved creators not on this campaign yet.</DialogDescription>
          </DialogHeader>
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search creators"
          />
          <ul className="max-h-72 divide-y divide-white/[0.06] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/25">
            {shown.map((x) => (
              <li key={x.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
                  <Checkbox
                    checked={pick.has(x.id)}
                    onCheckedChange={(v) =>
                      setPick((s) => {
                        const n = new Set(s);
                        if (v === true) n.add(x.id);
                        else n.delete(x.id);
                        return n;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{x.creatorName || x.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{x.email}</span>
                  </span>
                  <UgcStatusPill status={x.status} />
                </label>
              </li>
            ))}
            {!shown.length ? (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">No matches</li>
            ) : null}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !pick.size}
              onClick={async () => {
                const r = await run(
                  "add",
                  () =>
                    adminAssignUgcCampaign({
                      data: { campaignId: c.id, creatorIds: [...pick], assign: true },
                    }),
                  (res) => (res.ok ? `Added ${plural(res.updated, "creator")}` : null),
                );
                if (r) {
                  setAdding(false);
                  setPick(new Set());
                }
              }}
            >
              Add {pick.size ? plural(pick.size, "creator") : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
