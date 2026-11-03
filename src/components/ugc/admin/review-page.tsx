import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clapperboard,
  Keyboard,
  Loader2,
  MessageSquareWarning,
  PartyPopper,
  XCircle,
} from "lucide-react";

import { relativeTime } from "@/components/admin/format";
import { Avatar, EmptyState, PageBody, PageHeader, Panel, well } from "@/components/admin/kit";
import { CheckRow, outlineBtn, useRun } from "@/components/admin/creators/ui";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adminReviewUgcSubmission } from "@/lib/ugc/admin.functions";
import {
  UGC,
  UGC_POST_PLATFORM_LABELS,
  UGC_SUBMISSION_STATUS_LABELS,
  aspectHint,
  formatBytes,
  type UgcSubmissionStatus,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { CommentThread, LiveUrlForm } from "./creator-tabs";
import { DownloadButton, PosterThumb, SubmissionMedia } from "./media";
import type { ReviewItem } from "./types";
import { SubmissionPill, formatSeconds } from "./ui";

export const REVIEW_FILTERS = [
  "in-review",
  "changes-requested",
  "approved",
  "posted",
  "rejected",
  "all",
] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

const FILTER_LABEL = (f: ReviewFilter) =>
  f === "all" ? "Everything" : UGC_SUBMISSION_STATUS_LABELS[f as UgcSubmissionStatus];

const waitedSince = (i: ReviewItem) => i.submission.completedAt ?? i.submission.createdAt;

export function ReviewPage({
  items,
  filter,
  selectedId,
  onFilter,
  onSelect,
}: {
  items: ReviewItem[];
  filter: ReviewFilter;
  selectedId: string | undefined;
  onFilter: (f: ReviewFilter) => void;
  onSelect: (id: string | undefined) => void;
}) {
  // Keep the position when the current item leaves the list (approved, say), so the next one opens.
  const lastIndex = useRef(0);
  const found = items.findIndex((i) => i.submission.id === selectedId);
  const index = found >= 0 ? found : Math.min(lastIndex.current, items.length - 1);
  const current = index >= 0 ? items[index] : undefined;
  useEffect(() => {
    if (index >= 0) lastIndex.current = index;
  }, [index]);

  const go = (d: number) => {
    if (!items.length) return;
    const next = items[Math.max(0, Math.min(items.length - 1, index + d))];
    onSelect(next.submission.id);
  };

  return (
    <>
      <PageHeader
        title="Review queue"
        icon={Clapperboard}
        tone="violet"
        description="Uploads waiting for a decision, oldest first. Approving tells the creator to post; asking for changes sends your comment."
        actions={
          <Select value={filter} onValueChange={(v) => onFilter(v as ReviewFilter)}>
            <SelectTrigger className="h-9 w-52 bg-black/30 backdrop-blur" aria-label="Show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_FILTERS.map((f) => (
                <SelectItem key={f} value={f}>
                  {FILTER_LABEL(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <PageBody>
        {!items.length || !current ? (
          <EmptyState
            icon={filter === "in-review" ? PartyPopper : CircleDashed}
            tone={filter === "in-review" ? "mint" : "slate"}
            title={
              filter === "in-review"
                ? "All caught up"
                : `Nothing ${FILTER_LABEL(filter).toLowerCase()}`
            }
            action={
              filter !== "all" ? (
                <Button variant="outline" className={outlineBtn} onClick={() => onFilter("all")}>
                  Show everything
                </Button>
              ) : null
            }
          >
            {filter === "in-review"
              ? "New uploads land here as soon as a creator's file finishes uploading."
              : "Try another filter."}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @5xl/inset:grid-cols-[18rem_minmax(0,1fr)] @7xl/inset:grid-cols-[20rem_minmax(0,1fr)]">
            <QueueList items={items} current={current} onSelect={onSelect} />
            <ReviewDetail
              key={current.submission.id}
              item={current}
              index={index}
              total={items.length}
              onPrev={() => go(-1)}
              onNext={() => go(1)}
            />
          </div>
        )}
      </PageBody>
    </>
  );
}

function QueueList({
  items,
  current,
  onSelect,
}: {
  items: ReviewItem[];
  current: ReviewItem;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel className="overflow-hidden @5xl/inset:sticky @5xl/inset:top-[4.5rem]">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {items.length} upload{items.length === 1 ? "" : "s"} · oldest first
        </span>
        <span
          className="hidden items-center gap-1 @5xl/inset:inline-flex"
          title="Keyboard: J next, K previous, A approve"
        >
          <Keyboard className="size-3.5" aria-hidden />
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <Kbd>A</Kbd>
        </span>
      </div>
      <ol
        aria-label="Uploads"
        className="flex gap-2 overflow-x-auto p-2 [scrollbar-width:none] @5xl/inset:block @5xl/inset:max-h-[calc(100dvh-12rem)] @5xl/inset:space-y-1 @5xl/inset:overflow-y-auto [&::-webkit-scrollbar]:hidden"
      >
        {items.map((i) => {
          const on = i.submission.id === current.submission.id;
          return (
            <li key={i.submission.id} className="w-64 shrink-0 @5xl/inset:w-auto">
              <button
                type="button"
                onClick={() => onSelect(i.submission.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl p-2 text-left ring-1 transition-colors ring-inset focus-visible:outline-2 focus-visible:outline-[color:var(--partner)]",
                  on
                    ? "bg-[color-mix(in_oklab,var(--partner)_14%,transparent)] ring-[color-mix(in_oklab,var(--partner)_45%,transparent)]"
                    : "ring-transparent hover:bg-white/[0.04]",
                )}
              >
                <PosterThumb s={i.submission} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {i.creator?.creatorName || i.creator?.name || "Unknown creator"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.submission.name}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="whitespace-nowrap" suppressHydrationWarning>
                      {relativeTime(waitedSince(i))}
                    </span>
                    {i.submission.status !== "in-review" ? (
                      <SubmissionPill status={i.submission.status} />
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="mono grid h-5 min-w-5 place-items-center rounded border border-white/15 bg-white/[0.05] px-1 text-[10px] text-white/80">
      {children}
    </kbd>
  );
}

type Decision = "approve" | "changes" | "reject";

function ReviewDetail({
  item,
  index,
  total,
  onPrev,
  onNext,
}: {
  item: ReviewItem;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const uid = useId();
  const { run, pending } = useRun();
  const s = item.submission;
  const [comment, setComment] = useState("");
  const [notify, setNotify] = useState(true);
  const [confirmReject, setConfirmReject] = useState(false);
  const [needComment, setNeedComment] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const decidable = s.status === "in-review" || s.status === "changes-requested";

  async function decide(decision: Decision) {
    if (decision === "changes" && !comment.trim()) {
      setNeedComment(true);
      commentRef.current?.focus();
      return;
    }
    const r = await run(
      decision,
      () =>
        adminReviewUgcSubmission({
          data: { submissionId: s.id, decision, comment: comment.trim() || undefined, notify },
        }),
      decision === "approve"
        ? `Approved ${s.name}`
        : decision === "changes"
          ? "Changes requested"
          : "Marked as not used",
    );
    if (r) setComment("");
  }

  // J / K move through the queue, A approves. Ignored while typing.
  const keys = useRef({ onPrev, onNext, decide, decidable });
  keys.current = { onPrev, onNext, decide, decidable };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("[role=dialog],[role=alertdialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "j") keys.current.onNext();
      else if (k === "k") keys.current.onPrev();
      else if (k === "a" && keys.current.decidable) void keys.current.decide("approve");
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shots = item.campaign?.shots ?? [];
  const covered = new Set(s.shotIds);
  const missingRequired = shots.filter((x) => x.required && !covered.has(x.id));
  const hint = item.campaign ? aspectHint(s.aspect, item.campaign.preferredAspect) : null;
  const facts: [string, string | null, string?][] = [
    ["Aspect", s.aspect ? (s.aspect === "other" ? "Custom" : s.aspect) : null, hint ?? undefined],
    ["Duration", s.mediaType === "video" ? formatSeconds(s.durationS) : "Photo"],
    ["Size", formatBytes(s.size)],
    ["Resolution", s.width && s.height ? `${s.width}×${s.height}` : null],
    ["For", s.platform ? UGC_POST_PLATFORM_LABELS[s.platform] : null],
    ["Brief", `v${s.briefVersion}`],
  ];

  return (
    <Panel className="min-w-0 overflow-hidden" aria-label="Upload under review">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] px-4 py-3 sm:px-5">
        {item.creator ? (
          <Link
            to="/admin/ugc/creators/$creatorId"
            params={{ creatorId: item.creator.id }}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-90"
          >
            <Avatar name={item.creator.creatorName || item.creator.name} />
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {item.creator.creatorName || item.creator.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.campaign?.title ?? "No campaign"} ·{" "}
                <span suppressHydrationWarning>uploaded {relativeTime(waitedSince(item))}</span>
              </span>
            </span>
          </Link>
        ) : (
          <span className="flex-1 text-sm text-muted-foreground">Creator deleted</span>
        )}
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground tabular-nums">
            {index + 1} of {total}
          </span>
          <Button
            variant="outline"
            size="icon"
            className={cn("size-9", outlineBtn)}
            onClick={onPrev}
            disabled={index === 0}
            aria-label="Previous (K)"
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={cn("size-9", outlineBtn)}
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label="Next (J)"
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>

      {/* Wide: player and feedback on the left, facts and the decision in a column on the right.
          Narrow: player, then the decision, then the feedback thread. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 p-4 sm:p-5 @6xl/inset:grid-cols-[minmax(0,1fr)_20rem] @6xl/inset:grid-rows-[auto_1fr]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-2xl bg-black/40 p-2 ring-1 ring-white/[0.06]">
            <SubmissionMedia s={s} className="max-h-[62vh] rounded-lg ring-0" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-medium" title={s.name}>
                {s.name}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <SubmissionPill status={s.status} />
              <DownloadButton file={s} />
            </div>
          </div>
          {s.note ? (
            <p className={cn("p-3 text-sm whitespace-pre-wrap", well)}>
              <span className="mb-0.5 block text-xs text-muted-foreground">
                Note from the creator
              </span>
              {s.note}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4 @6xl/inset:col-start-2 @6xl/inset:row-span-2 @6xl/inset:row-start-1">
          <dl className={cn("grid grid-cols-2 gap-px overflow-hidden", well)}>
            {facts.map(([k, v, warn]) => (
              <div key={k} className="bg-white/[0.015] px-3 py-2">
                <dt className="text-[11px] text-muted-foreground">{k}</dt>
                <dd className={cn("text-sm font-medium", warn && "text-amber-200")} title={warn}>
                  {v ?? <span className="font-normal text-muted-foreground/70">–</span>}
                </dd>
              </div>
            ))}
          </dl>
          {hint ? <p className="-mt-2 text-xs text-amber-200">{hint}</p> : null}

          {shots.length ? (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Shots covered ({shots.filter((x) => covered.has(x.id)).length} of {shots.length})
              </div>
              <ul className="space-y-1.5 text-sm">
                {shots.map((x) => {
                  const on = covered.has(x.id);
                  return (
                    <li key={x.id} className="flex items-start gap-2">
                      {on ? (
                        <Check
                          className="mt-0.5 size-4 shrink-0 text-emerald-300"
                          aria-label="Covered"
                        />
                      ) : (
                        <CircleDashed
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            x.required ? "text-amber-300" : "text-white/30",
                          )}
                          aria-label="Not covered"
                        />
                      )}
                      <span className={cn(!on && "text-muted-foreground")}>
                        {x.label}
                        {x.required ? (
                          <span
                            className={cn(
                              "ml-1.5 text-[10px] font-semibold tracking-wide uppercase",
                              on ? "text-white/40" : "text-amber-300",
                            )}
                          >
                            Required
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {missingRequired.length ? (
                <p className="mt-2 text-xs text-amber-200">
                  The creator didn't tick a required shot. Check the video before approving.
                </p>
              ) : null}
            </div>
          ) : null}

          {decidable ? (
            <div className={cn("space-y-3 p-3", well)}>
              <label htmlFor={`${uid}-comment`} className="text-sm font-medium">
                Comment for the creator
              </label>
              <Textarea
                ref={commentRef}
                id={`${uid}-comment`}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  if (e.target.value.trim()) setNeedComment(false);
                }}
                rows={3}
                maxLength={UGC.maxCommentChars}
                placeholder="Optional for approve. Required to request changes: say what to fix."
                aria-invalid={needComment || undefined}
                className={cn(needComment && "border-amber-400/60 ring-1 ring-amber-400/40")}
              />
              {needComment ? (
                <p className="text-xs text-amber-200">
                  Say what needs to change before sending it back.
                </p>
              ) : null}
              <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
                Email the creator
              </CheckRow>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  onClick={() => void decide("approve")}
                  disabled={!!pending}
                  className="sm:col-span-2"
                >
                  {pending === "approve" ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Check aria-hidden />
                  )}
                  Approve
                  <Kbd>A</Kbd>
                </Button>
                <Button
                  variant="outline"
                  className="border-amber-400/40 bg-transparent text-amber-100 hover:bg-amber-400/10 hover:text-amber-50"
                  onClick={() => void decide("changes")}
                  disabled={!!pending}
                >
                  {pending === "changes" ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <MessageSquareWarning aria-hidden />
                  )}
                  Request changes
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-200/90 hover:bg-red-400/10 hover:text-red-100"
                  onClick={() => setConfirmReject(true)}
                  disabled={!!pending}
                >
                  <XCircle aria-hidden />
                  Not used
                </Button>
              </div>
            </div>
          ) : s.status === "approved" ? (
            <LiveUrlForm s={s} />
          ) : s.liveUrl ? (
            <a
              href={s.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm text-emerald-300 hover:underline"
            >
              {s.liveUrl}
            </a>
          ) : null}
        </div>

        <div className="min-w-0 @6xl/inset:col-start-1">
          <CommentThread submissionId={s.id} comments={s.comments} />
        </div>
      </div>

      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Don't use {s.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The creator is told it won't be used{comment.trim() ? ", with your comment" : ""}.
              Their file stays in the hub; if it was their only upload they go back to “Content
              due”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmReject(false);
                void decide("reject");
              }}
            >
              Mark not used
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
