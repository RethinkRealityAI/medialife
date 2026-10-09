import { useEffect, useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, ChevronLeft, Loader2, MessageCircle } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminUpdateCreator } from "@/lib/hub/admin.functions";
import { CREATOR_STATUS, money, shortDate, type CreatorStatus } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../format";
import { Eyebrow } from "../kit";
import type { CreatorDetail } from "./types";
import { CheckRow, STATUS_SHORT, StatusPill, outlineBtn, useRun } from "./ui";

const STATUS_ORDER: CreatorStatus[] = [
  "submitted",
  "approved",
  "waitlist",
  "declined",
  "paused",
  "draft",
];

/** What the creator is told, mirroring adminUpdateCreator; null = no email for this status. */
const STATUS_EMAIL: Partial<Record<CreatorStatus, string>> = {
  approved: "“You're in”: your application was approved; your first products are being set up.",
  waitlist: "“You're on the waitlist”: we'll reach out when a production slot opens.",
  declined: "“Application update”: we're not able to take this on right now.",
  paused: "“Your account is paused”: your manager will be in touch.",
};

export function CreatorHeader({ data }: { data: CreatorDetail }) {
  const { creator, account, earnings } = data;
  const p = creator.profile;
  const discord = account?.discord?.username || creator.contact.discordUsername;
  const [target, setTarget] = useState<CreatorStatus | null>(null);

  return (
    <div className="border-b border-border px-4 pt-4 pb-5 sm:px-6 lg:px-8">
      <Link
        to="/admin/creators"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        Creators
      </Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-medium tracking-tight md:text-3xl">
              {p.displayName || p.email || "Unnamed creator"}
            </h1>
            <StatusPill status={creator.status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <a
                href={`mailto:${account?.email ?? p.email}`}
                className="text-foreground/90 hover:underline"
              >
                {account?.email ?? p.email}
              </a>
              {account?.emailVerified ? (
                <span
                  className="inline-flex items-center gap-0.5 text-xs text-emerald-300"
                  title="Email verified"
                >
                  <BadgeCheck className="size-3.5" aria-hidden />
                  Verified
                </span>
              ) : account ? (
                <span className="text-xs text-amber-300">Not verified</span>
              ) : null}
            </span>
            {discord ? (
              <span
                className="inline-flex items-center gap-1"
                title={account?.discord ? "Signed in with Discord" : "Discord, as entered"}
              >
                <MessageCircle className="size-3.5" aria-hidden />
                {discord}
              </span>
            ) : null}
            {creator.agency ? (
              <span>
                {creator.agency.name}
                {creator.agency.rep ? ` · via ${creator.agency.rep}` : ""}
              </span>
            ) : (
              <span>Direct</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span suppressHydrationWarning title={formatDateTime(creator.createdAt)}>
              Joined {shortDate(creator.createdAt)}
            </span>
            {creator.submittedAt ? (
              <span suppressHydrationWarning title={formatDateTime(creator.submittedAt)}>
                Applied {shortDate(creator.submittedAt)}
              </span>
            ) : (
              <span>Hasn't submitted yet</span>
            )}
            {creator.approvedAt ? (
              <span suppressHydrationWarning title={formatDateTime(creator.approvedAt)}>
                Approved {shortDate(creator.approvedAt)}
              </span>
            ) : null}
            {account?.lastLoginAt ? (
              <span suppressHydrationWarning title={formatDateTime(account.lastLoginAt)}>
                Last sign-in {shortDate(account.lastLoginAt)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="creator-status" className="text-xs text-muted-foreground">
              Status
            </Label>
            <Select
              value={creator.status}
              onValueChange={(v) => v !== creator.status && setTarget(v as CreatorStatus)}
            >
              <SelectTrigger id="creator-status" className="mt-1 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_SHORT[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ShareControl
            key={creator.revenueShare}
            creatorId={creator.id}
            share={creator.revenueShare}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip
          label="Earned"
          value={money(earnings.earned, earnings.currency)}
          hint={`${earnings.orders} orders · ${earnings.units} units`}
        />
        <Chip
          label="Available"
          value={money(earnings.available, earnings.currency)}
          hint="Out of the returns window, unpaid"
          strong={earnings.available > 0}
        />
        <Chip
          label="Pending"
          value={money(earnings.pending, earnings.currency)}
          hint="Inside the 30-day returns window"
        />
        <Chip label="Paid" value={money(earnings.paid, earnings.currency)} />
      </div>

      <StatusDialog
        creatorId={creator.id}
        name={p.displayName || p.email}
        from={creator.status}
        target={target}
        onClose={() => setTarget(null)}
      />
    </div>
  );
}

function Chip({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div
      title={hint}
      className={cn(
        "flex items-baseline gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-1.5",
        strong && "border-emerald-400/35 bg-emerald-400/[0.06]",
      )}
    >
      <Eyebrow>{label}</Eyebrow>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ShareControl({ creatorId, share }: { creatorId: string; share: number }) {
  const uid = useId();
  const { pending, run } = useRun();
  const initial = String(Math.round(share * 1000) / 10);
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100;
  const dirty = value !== initial;
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || !dirty) return;
        void run(
          "share",
          () =>
            adminUpdateCreator({
              data: { id: creatorId, revenueShare: Math.round(n * 10) / 1000 },
            }),
          `Revenue share set to ${n}%`,
        );
      }}
    >
      <div>
        <Label htmlFor={`${uid}-share`} className="text-xs text-muted-foreground">
          Revenue share
        </Label>
        <div className="relative mt-1">
          <Input
            id={`${uid}-share`}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!valid}
            className="w-24 [appearance:textfield] pr-7 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-sm text-muted-foreground">
            %
          </span>
        </div>
      </div>
      {dirty ? (
        <Button type="submit" size="sm" className="h-9" disabled={!valid || !!pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save
        </Button>
      ) : null}
    </form>
  );
}

function StatusDialog({
  creatorId,
  name,
  from,
  target,
  onClose,
}: {
  creatorId: string;
  name: string;
  from: CreatorStatus;
  target: CreatorStatus | null;
  onClose: () => void;
}) {
  const uid = useId();
  const { pending, run } = useRun();
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (target) {
      setMessage("");
      setNotify(true);
    }
  }, [target]);
  const email = target ? STATUS_EMAIL[target] : undefined;
  const danger = target === "declined" || target === "paused";

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {target === "declined"
              ? `Decline ${name}?`
              : target === "approved"
                ? `Approve ${name}?`
                : `Move ${name} to ${target ? STATUS_SHORT[target] : ""}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            From {STATUS_SHORT[from]} to {target ? STATUS_SHORT[target] : ""}. The creator sees “
            {target ? CREATOR_STATUS[target].label : ""}” in the hub.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {email ? (
          <div className="grid gap-3">
            <p className="rounded-md border border-border bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
              Added to their activity: {email}
            </p>
            <div>
              <Label htmlFor={`${uid}-msg`} className="text-sm">
                Message to the creator{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id={`${uid}-msg`}
                className="mt-1.5 min-h-0"
                rows={3}
                maxLength={1000}
                value={message}
                placeholder="Added under the standard text"
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
              Email the creator
            </CheckRow>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No email is sent for this status.</p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className={outlineBtn}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!!pending}
            className={cn(
              danger && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            onClick={async (e) => {
              e.preventDefault();
              if (!target) return;
              const r = await run(
                "status",
                () =>
                  adminUpdateCreator({
                    data: {
                      id: creatorId,
                      status: target,
                      ...(message.trim() ? { message: message.trim() } : {}),
                      notify: !!email && notify,
                    },
                  }),
                `${name} is now ${STATUS_SHORT[target]}`,
              );
              if (r) onClose();
            }}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {target === "declined"
              ? "Decline"
              : target === "approved"
                ? "Approve"
                : "Change status"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
