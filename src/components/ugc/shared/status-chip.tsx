/**
 * Status chips for UGC creators and their uploads. Every chip carries a word
 * and an icon as well as a colour, so the state reads without colour.
 * Used by the creator app and the admin pages.
 */
import {
  CheckCircle2,
  CircleDashed,
  CirclePause,
  Clock3,
  Eye,
  Loader2,
  MessageSquareWarning,
  Package,
  PackageCheck,
  Radio,
  Truck,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import {
  UGC_STATUS_LABELS,
  UGC_STATUS_TONES,
  UGC_SUBMISSION_STATUS_LABELS,
  type UgcStatus,
  type UgcSubmissionStatus,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export type UgcTone = "slate" | "sky" | "violet" | "amber" | "emerald" | "rose" | "teal" | "gold";

export const UGC_TONE_CLASSES: Record<UgcTone, string> = {
  slate: "border-white/15 bg-white/[0.05] text-slate-300",
  sky: "border-sky-400/40 bg-sky-400/10 text-sky-200",
  violet: "border-violet-400/40 bg-violet-400/10 text-violet-200",
  amber: "border-amber-400/45 bg-amber-400/10 text-amber-200",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  rose: "border-rose-400/45 bg-rose-400/10 text-rose-200",
  teal: "border-[#3fe6e0]/40 bg-[#3fe6e0]/10 text-[#bff7f4]",
  gold: "border-[#f6c344]/45 bg-[#f6c344]/10 text-[#ffe48a]",
};

export function Chip({
  tone = "slate",
  icon: Icon,
  children,
  className,
  spin,
}: {
  tone?: UgcTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  spin?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
        UGC_TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon className={cn("size-3.5 shrink-0", spin && "motion-safe:animate-spin")} aria-hidden />
      ) : (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

const CREATOR_ICONS: Record<UgcStatus, LucideIcon> = {
  applied: CircleDashed,
  approved: CheckCircle2,
  shipped: Truck,
  delivered: PackageCheck,
  "content-due": Clock3,
  submitted: Eye,
  "changes-requested": MessageSquareWarning,
  "approved-content": CheckCircle2,
  posted: Radio,
  declined: XCircle,
  paused: CirclePause,
};

export function CreatorStatusChip({
  status,
  className,
}: {
  status: UgcStatus;
  className?: string;
}) {
  return (
    <Chip tone={UGC_STATUS_TONES[status]} icon={CREATOR_ICONS[status]} className={className}>
      {UGC_STATUS_LABELS[status]}
    </Chip>
  );
}

export const SUBMISSION_TONES: Record<UgcSubmissionStatus, UgcTone> = {
  uploading: "sky",
  "in-review": "violet",
  "changes-requested": "amber",
  approved: "emerald",
  posted: "teal",
  rejected: "slate",
};

const SUBMISSION_ICONS: Record<UgcSubmissionStatus, LucideIcon> = {
  uploading: Loader2,
  "in-review": Eye,
  "changes-requested": MessageSquareWarning,
  approved: CheckCircle2,
  posted: Radio,
  rejected: XCircle,
};

export function SubmissionStatusChip({
  status,
  className,
  paused,
}: {
  status: UgcSubmissionStatus;
  className?: string;
  /** An upload that isn't moving right now (no spinner). */
  paused?: boolean;
}) {
  return (
    <Chip
      tone={SUBMISSION_TONES[status]}
      icon={status === "uploading" && paused ? Package : SUBMISSION_ICONS[status]}
      spin={status === "uploading" && !paused}
      className={className}
    >
      {status === "uploading" && paused ? "Unfinished" : UGC_SUBMISSION_STATUS_LABELS[status]}
    </Chip>
  );
}
