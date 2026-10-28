import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Box,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Gift,
  Link2,
  Loader2,
  MessageSquare,
  NotebookPen,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
  UploadCloud,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { formatDate, formatDateTime } from "@/components/admin/format";
import { CopyButton, EmptyState, IconTile, Panel, PanelTitle, well } from "@/components/admin/kit";
import {
  Ago,
  CheckRow,
  ChipsInput,
  Field,
  outlineBtn,
  parseNum,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  adminDeleteUgcPerk,
  adminMarkUgcPacked,
  adminPostUgcComment,
  adminSaveUgcNotes,
  adminSaveUgcPerk,
  adminSetUgcLiveUrl,
} from "@/lib/ugc/admin.functions";
import {
  UGC,
  UGC_PERK_KIND_LABELS,
  UGC_PERK_KINDS,
  UGC_PIPELINE,
  liveUrlProblem,
  type UgcActivityKind,
  type UgcComment,
  type UgcPerk,
  type UgcPerkKind,
  type UgcShipment,
  type UgcSubmissionView,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { DownloadButton, SubmissionMedia, mediaFacts } from "./media";
import { MarkDeliveredDialog, MarkShippedDialog, type ShipTarget } from "./shipping-kit";
import type { CreatorDetail } from "./types";
import { SubmissionPill, fromDateInput, toDateInput, useBulk } from "./ui";

const humanize = (id: string) => {
  const s = id.replace(/[-_]+/g, " ");
  return s ? s[0].toUpperCase() + s.slice(1) : id;
};

/* ── Content ──────────────────────────────────────────────────────────────── */

export function ContentTab({ data }: { data: CreatorDetail }) {
  const subs = [...data.submissions].sort((a, b) => b.createdAt - a.createdAt);
  if (!subs.length)
    return (
      <EmptyState icon={UploadCloud} tone="slate" title="No uploads yet">
        Their videos and photos land here, and in the review queue, as soon as they finish
        uploading.
      </EmptyState>
    );
  return (
    <div className="space-y-4">
      {subs.map((s) => (
        <SubmissionCard
          key={s.id}
          s={s}
          campaignTitle={data.campaigns.find((c) => c.id === s.campaignId)?.title}
        />
      ))}
    </div>
  );
}

function SubmissionCard({ s, campaignTitle }: { s: UgcSubmissionView; campaignTitle?: string }) {
  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-4 p-4 sm:p-5 @3xl/inset:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <SubmissionMedia s={s} className="max-h-[28rem]" />
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-medium" title={s.name}>
                {s.name}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{mediaFacts(s).join(" · ")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
                Uploaded {formatDateTime(s.completedAt ?? s.createdAt)}
                {campaignTitle ? ` · ${campaignTitle}` : ""} · brief v{s.briefVersion}
              </p>
            </div>
            <SubmissionPill status={s.status} />
          </div>
          {s.shotIds.length ? (
            <div className="flex flex-wrap gap-1.5">
              {s.shotIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex h-6 items-center gap-1 rounded-full bg-white/[0.05] px-2.5 text-[11px] text-white/75 ring-1 ring-white/[0.08] ring-inset"
                >
                  <CheckCircle2 className="size-3 text-emerald-300" aria-hidden />
                  {humanize(id)}
                </span>
              ))}
            </div>
          ) : null}
          {s.note ? (
            <p className={cn("p-3 text-sm whitespace-pre-wrap", well)}>
              <span className="mb-0.5 block text-xs text-muted-foreground">Their note</span>
              {s.note}
            </p>
          ) : null}
          {s.liveUrl ? (
            <a
              href={s.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 text-sm text-emerald-300 hover:underline"
            >
              <Link2 className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{s.liveUrl}</span>
              <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
            </a>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {s.status === "in-review" || s.status === "changes-requested" ? (
              <Button asChild size="sm">
                <Link
                  to="/admin/ugc/review"
                  search={{ id: s.id, status: s.status === "in-review" ? undefined : s.status }}
                >
                  <Clapperboard aria-hidden />
                  Review
                </Link>
              </Button>
            ) : null}
            <DownloadButton file={s} />
          </div>
          {s.status === "approved" ? <LiveUrlForm s={s} /> : null}
          <CommentThread submissionId={s.id} comments={s.comments} />
        </div>
      </div>
    </Panel>
  );
}

/** Record a live link for an approved upload, on the creator's behalf. */
export function LiveUrlForm({ s }: { s: Pick<UgcSubmissionView, "id"> }) {
  const uid = useId();
  const { run, busy } = useRun();
  const [url, setUrl] = useState("");
  const [disclosed, setDisclosed] = useState(false);
  const problem = url ? liveUrlProblem(url) : null;
  return (
    <form
      className={cn("space-y-2.5 p-3", well)}
      onSubmit={async (e) => {
        e.preventDefault();
        await run(
          "live",
          () =>
            adminSetUgcLiveUrl({
              data: { submissionId: s.id, url, disclosureConfirmed: disclosed },
            }),
          "Live link saved; marked as posted",
        );
      }}
    >
      <Field
        label="Live link"
        htmlFor={`${uid}-url`}
        hint="Approved and waiting for the post. Record it here if they sent the link another way."
        error={problem}
      >
        <Input
          id={`${uid}-url`}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@…"
        />
      </Field>
      <CheckRow id={`${uid}-disc`} checked={disclosed} onChange={setDisclosed}>
        The caption has #ad or the paid-partnership label
      </CheckRow>
      <Button type="submit" size="sm" disabled={busy || !url || !!problem || !disclosed}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
        Mark posted
      </Button>
    </form>
  );
}

/** The feedback thread on one upload, with a reply box. */
export function CommentThread({
  submissionId,
  comments,
  className,
}: {
  submissionId: string;
  comments: UgcComment[];
  className?: string;
}) {
  const uid = useId();
  const { run, busy } = useRun();
  const [body, setBody] = useState("");
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquare className="size-3.5" aria-hidden />
        {comments.length ? `Feedback (${comments.length})` : "Feedback"}
      </div>
      {comments.length ? (
        <ol className="space-y-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-sm",
                c.author === "medialife"
                  ? "ml-auto rounded-br-md bg-[color-mix(in_oklab,var(--partner)_16%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--partner)_30%,transparent)] ring-inset"
                  : "rounded-bl-md bg-white/[0.05] ring-1 ring-white/[0.08] ring-inset",
              )}
            >
              <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                <span className="font-medium text-white/80">
                  {c.author === "medialife" ? "MEDIALIFE" : c.name || "Creator"}
                </span>
                <Ago ts={c.at} />
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(
            "comment",
            () => adminPostUgcComment({ data: { submissionId, body } }),
            "Comment sent",
          );
          if (r) setBody("");
        }}
      >
        <label htmlFor={`${uid}-c`} className="sr-only">
          Write a comment
        </label>
        <Textarea
          id={`${uid}-c`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a comment for the creator"
          rows={1}
          maxLength={UGC.maxCommentChars}
          className="min-h-10 resize-y"
        />
        <Button
          type="submit"
          size="icon"
          disabled={busy || !body.trim()}
          aria-label="Send comment"
          className="size-10 shrink-0"
        >
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        </Button>
      </form>
    </div>
  );
}

/* ── Shipping ─────────────────────────────────────────────────────────────── */

export function ShippingTab({ data }: { data: CreatorDetail }) {
  const c = data.creator;
  const bulk = useBulk();
  const [ship, setShip] = useState<(ShipTarget & { campaignId: string }) | null>(null);
  const [deliver, setDeliver] = useState<{ campaignId: string } | null>(null);
  const shippable =
    UGC_PIPELINE.indexOf(c.status) >= UGC_PIPELINE.indexOf("approved") || c.status === "paused";
  const current = c.campaignIds[c.campaignIds.length - 1] ?? null;
  const rows: (UgcShipment | { id: string; campaignId: string; pending: true })[] = [
    ...data.shipments,
  ];
  if (shippable && current && !data.shipments.some((s) => s.campaignId === current))
    rows.unshift({ id: current, campaignId: current, pending: true });
  const name = c.creatorName || c.name;
  const title = (id: string) => data.campaigns.find((x) => x.id === id)?.title ?? "Campaign";

  if (!rows.length)
    return (
      <EmptyState icon={Package} tone="slate" title="Nothing to ship yet">
        {shippable
          ? "Add them to a campaign first; the package belongs to a campaign."
          : "A package goes out once they're approved."}
      </EmptyState>
    );
  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const sh = "pending" in r ? null : r;
        const steps: [string, number | null, LucideIcon][] = [
          ["Packed", sh?.packedAt ?? null, Box],
          ["Shipped", sh?.shippedAt ?? null, Truck],
          ["Delivered", sh?.deliveredAt ?? null, PackageCheck],
        ];
        return (
          <Panel key={r.campaignId} className="p-4 sm:p-5">
            <PanelTitle
              icon={Package}
              tone="sky"
              title={title(r.campaignId)}
              sub={
                sh?.items.length ? sh.items.join(" + ") : "Package contents come from the campaign."
              }
            />
            <ol className="mt-4 grid gap-3 sm:grid-cols-3">
              {steps.map(([label, at, Icon]) => (
                <li key={label} className={cn("flex items-center gap-3 p-3", well)}>
                  <IconTile icon={Icon} size="sm" tone={at ? "mint" : "slate"} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                      {at ? formatDate(at) : "Not yet"}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {sh?.shippedAt && (sh.carrier || sh.tracking) ? (
              <p className="mt-3 text-sm">
                {sh.carrier} ·{" "}
                {sh.trackingUrl ? (
                  <a
                    href={sh.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mono text-sky-300 hover:underline"
                  >
                    {sh.tracking}
                  </a>
                ) : (
                  <span className="mono">{sh.tracking}</span>
                )}
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {!sh?.packedAt && !sh?.shippedAt ? (
                <Button
                  size="sm"
                  variant="outline"
                  className={outlineBtn}
                  disabled={bulk.busy}
                  onClick={() =>
                    void bulk.run(
                      "packed",
                      () =>
                        adminMarkUgcPacked({
                          data: { creatorIds: [c.id], campaignId: r.campaignId },
                        }),
                      "Marked packed:",
                    )
                  }
                >
                  <Box aria-hidden />
                  Mark packed
                </Button>
              ) : null}
              {!sh?.deliveredAt ? (
                <Button
                  size="sm"
                  variant={sh?.shippedAt ? "outline" : "default"}
                  className={sh?.shippedAt ? outlineBtn : undefined}
                  onClick={() =>
                    setShip({
                      creatorId: c.id,
                      name,
                      campaignId: r.campaignId,
                      carrier: sh?.carrier,
                      tracking: sh?.tracking,
                    })
                  }
                >
                  <Truck aria-hidden />
                  {sh?.shippedAt ? "Edit tracking" : "Mark shipped"}
                </Button>
              ) : null}
              {sh?.shippedAt && !sh.deliveredAt ? (
                <Button size="sm" onClick={() => setDeliver({ campaignId: r.campaignId })}>
                  <PackageCheck aria-hidden />
                  Mark delivered
                </Button>
              ) : null}
            </div>
          </Panel>
        );
      })}
      <MarkShippedDialog
        target={ship}
        campaignId={ship?.campaignId}
        onClose={() => setShip(null)}
      />
      <MarkDeliveredDialog
        targets={deliver ? [{ creatorId: c.id, name }] : []}
        campaignId={deliver?.campaignId}
        onClose={() => setDeliver(null)}
      />
    </div>
  );
}

/* ── Perks ────────────────────────────────────────────────────────────────── */

export function PerksTab({ data }: { data: CreatorDetail }) {
  const { run, busy } = useRun();
  const [editing, setEditing] = useState<UgcPerk | "new" | null>(null);
  const [removing, setRemoving] = useState<UgcPerk | null>(null);
  const perks = [...data.perks].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        icon={Gift}
        tone="rose"
        title="Perks"
        sub="Discount codes are made in Shopify admin and pasted here. They show on the creator's Perks page."
        actions={
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus aria-hidden />
            Add perk
          </Button>
        }
      />
      {!perks.length ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyState icon={Gift} tone="slate" title="No perks yet">
            Add a discount code, early access to the next drop or a collab once they've posted.
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {perks.map((p) => {
            const expired = p.expiresAt != null && p.expiresAt < Date.now();
            return (
              <li key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3.5 sm:px-5">
                <IconTile
                  icon={Gift}
                  size="sm"
                  tone={p.kind === "discount" ? "rose" : p.kind === "collab" ? "violet" : "sky"}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {UGC_PERK_KIND_LABELS[p.kind]}
                    </span>
                  </div>
                  {p.description ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {p.code ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-black/30 py-0.5 pr-0.5 pl-2 ring-1 ring-white/[0.08]">
                        <span className="mono text-[12px] text-white">{p.code}</span>
                        <CopyButton
                          text={p.code}
                          label="Copy code"
                          toastText="Code copied"
                          className="size-6"
                        />
                      </span>
                    ) : null}
                    {p.percentOff != null ? <span>{p.percentOff}% off</span> : null}
                    {p.expiresAt ? (
                      <span className={cn(expired && "text-amber-300")} suppressHydrationWarning>
                        {expired ? "Expired" : "Expires"} {formatDate(p.expiresAt)}
                      </span>
                    ) : null}
                    {p.url ? (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-300 hover:underline"
                      >
                        Link
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-white/[0.06]"
                    onClick={() => setEditing(p)}
                  >
                    <Pencil aria-hidden />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-red-400/10 hover:text-red-200"
                    aria-label={`Remove ${p.title}`}
                    onClick={() => setRemoving(p)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PerkDialog creatorId={data.creator.id} perk={editing} onClose={() => setEditing(null)} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from their Perks page. A discount code stays valid in Shopify until you
              turn it off there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!removing) return;
                await run(
                  "remove-perk",
                  () =>
                    adminDeleteUgcPerk({ data: { creatorId: data.creator.id, id: removing.id } }),
                  "Perk removed",
                );
                setRemoving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

function PerkDialog({
  creatorId,
  perk,
  onClose,
}: {
  creatorId: string;
  perk: UgcPerk | "new" | null;
  onClose: () => void;
}) {
  const uid = useId();
  const { run, busy } = useRun();
  const editing = perk && perk !== "new" ? perk : null;
  const [kind, setKind] = useState<UgcPerkKind>("discount");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [pct, setPct] = useState("");
  const [expires, setExpires] = useState("");
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (!perk) return;
    const p = perk === "new" ? null : perk;
    setKind(p?.kind ?? "discount");
    setTitle(p?.title ?? "");
    setDescription(p?.description ?? "");
    setCode(p?.code ?? "");
    setUrl(p?.url ?? "");
    setPct(p?.percentOff != null ? String(p.percentOff) : "");
    setExpires(toDateInput(p?.expiresAt));
    setNotify(true);
  }, [perk]);
  const pctNum = parseNum(pct);
  const pctBad = pctNum != null && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100);
  const urlBad = url.trim() ? liveUrlProblem(url) : null;
  return (
    <Dialog open={!!perk} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(
              "perk",
              () =>
                adminSaveUgcPerk({
                  data: {
                    creatorId,
                    id: editing?.id,
                    kind,
                    title,
                    description,
                    code: code.trim() || null,
                    url: url.trim() || null,
                    percentOff: pctNum,
                    expiresAt: expires ? fromDateInput(expires) : null,
                    notify: editing ? undefined : notify,
                  },
                }),
              editing ? "Perk saved" : "Perk added",
            );
            if (r) onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Edit perk" : "Add a perk"}</DialogTitle>
            <DialogDescription>Shows on their Perks page.</DialogDescription>
          </DialogHeader>
          <Field label="Kind" htmlFor={`${uid}-kind`}>
            <Select value={kind} onValueChange={(v) => setKind(v as UgcPerkKind)}>
              <SelectTrigger id={`${uid}-kind`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UGC_PERK_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {UGC_PERK_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title" htmlFor={`${uid}-title`}>
            <Input
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "discount"
                  ? "20% off the EVADE store"
                  : kind === "collab"
                    ? "Collab on the next drop"
                    : "Early access: next keychain"
              }
              required
            />
          </Field>
          <Field label="Description" htmlFor={`${uid}-desc`} optional>
            <Textarea
              id={`${uid}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          {kind === "discount" ? (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field label="Code" htmlFor={`${uid}-code`} hint="Paste it from Shopify admin.">
                <Input
                  id={`${uid}-code`}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="mono"
                />
              </Field>
              <Field
                label="% off"
                htmlFor={`${uid}-pct`}
                optional
                error={pctBad ? "0 to 100" : null}
              >
                <Input
                  id={`${uid}-pct`}
                  inputMode="decimal"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                />
              </Field>
            </div>
          ) : null}
          <Field label="Link" htmlFor={`${uid}-url`} optional error={urlBad}>
            <Input
              id={`${uid}-url`}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
            />
          </Field>
          <Field label="Expires" htmlFor={`${uid}-exp`} optional>
            <Input
              id={`${uid}-exp`}
              type="date"
              className="[color-scheme:dark]"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </Field>
          {!editing ? (
            <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
              Email them about it
            </CheckRow>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim() || pctBad || !!urlBad}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {editing ? "Save" : "Add perk"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Activity ─────────────────────────────────────────────────────────────── */

const ICONS: Record<UgcActivityKind, LucideIcon> = {
  account: UserRound,
  status: Activity,
  shipment: Truck,
  brief: NotebookPen,
  upload: UploadCloud,
  review: ShieldCheck,
  comment: MessageSquare,
  posted: Link2,
  perk: Gift,
  profile: UserRound,
};

export function ActivityTab({ data }: { data: CreatorDetail }) {
  const items = [...data.activity].sort((a, b) => b.at - a.at);
  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        icon={Activity}
        tone="sky"
        title="Timeline"
        sub="Everything that happened, newest first. The creator sees the same feed, minus the internal notes."
      />
      {!items.length ? (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">
          <EmptyState icon={Activity} tone="slate" title="Nothing yet">
            Approvals, shipments, uploads and reviews show up here.
          </EmptyState>
        </div>
      ) : (
        <ol className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-3 sm:px-5">
              <IconTile
                icon={ICONS[a.kind] ?? Activity}
                size="sm"
                tone={
                  a.actor === "creator"
                    ? "violet"
                    : a.kind === "posted" || a.kind === "perk"
                      ? "mint"
                      : a.kind === "review"
                        ? "amber"
                        : "slate"
                }
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.title}</div>
                {a.body ? (
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">
                    {a.body}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <Ago ts={a.at} />
                  <span>
                    {a.actor === "creator"
                      ? "By the creator"
                      : a.actor === "medialife"
                        ? "By the team"
                        : "Automatic"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/* ── Notes ────────────────────────────────────────────────────────────────── */

export function NotesTab({ data }: { data: CreatorDetail }) {
  const uid = useId();
  const { run, busy } = useRun();
  const a = data.admin;
  const [notes, setNotes] = useState(a.internalNotes);
  const [tags, setTags] = useState<string[]>(a.tags);
  useEffect(() => {
    setNotes(a.internalNotes);
    setTags(a.tags);
  }, [a]);
  const dirty = notes !== a.internalNotes || tags.join("\n") !== a.tags.join("\n");
  return (
    <Panel className="p-4 sm:p-5">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            "notes",
            () => adminSaveUgcNotes({ data: { id: data.creator.id, internalNotes: notes, tags } }),
            "Notes saved",
          );
        }}
      >
        <PanelTitle
          icon={NotebookPen}
          tone="amber"
          title="Internal notes"
          sub="Only the team sees these."
        />
        <Field label="Notes" htmlFor={`${uid}-notes`}>
          <Textarea
            id={`${uid}-notes`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={7}
            maxLength={5000}
          />
        </Field>
        <Field label="Tags" htmlFor={`${uid}-tags`} hint="Enter or comma to add.">
          <ChipsInput
            id={`${uid}-tags`}
            value={tags}
            onChange={setTags}
            placeholder="top-pick, uk, reshoot"
            max={20}
          />
        </Field>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save notes
          </Button>
          {dirty ? <span className="text-xs text-amber-200">Unsaved changes</span> : null}
        </div>
      </form>
    </Panel>
  );
}
