/**
 * One upload in "My content": poster (tap to play), status, the format
 * check, which shots it covers, the feedback thread, and what to do next for
 * its status: fix and re-upload, paste the live link (with the disclosure
 * checkbox) once approved, or see it live.
 */
import { useId, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  BadgeCheck,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Radio,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommentThread } from "@/components/ugc/shared/comment-thread";
import { DownloadButton } from "@/components/ugc/shared/download-button";
import { dayDate, formatDuration } from "@/components/ugc/shared/format";
import { btnGhost, btnGold, btnIcon, card, field, textarea } from "@/components/ugc/shared/look";
import { MediaDialog, PosterTile } from "@/components/ugc/shared/media";
import { UgcPlatformIcon } from "@/components/ugc/shared/platform-icon";
import { SubmissionStatusChip } from "@/components/ugc/shared/status-chip";
import {
  deleteUgcSubmission,
  postUgcComment,
  setUgcLiveUrl,
  updateUgcSubmission,
} from "@/lib/ugc/creator.functions";
import {
  UGC_POST_PLATFORM_LABELS,
  aspectHint,
  formatBytes,
  liveUrlProblem,
  type UgcAspect,
  type UgcPostPlatform,
  type UgcShot,
  type UgcSubmissionView,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { PlatformField, ShotsField } from "./upload/fields";

export function SubmissionCard({
  sub,
  shots,
  preferredAspect,
  onResume,
  uploadsOff,
}: {
  sub: UgcSubmissionView;
  shots: UgcShot[];
  preferredAspect: UgcAspect;
  /** For an unfinished upload: pick the file again to carry on. */
  onResume?: (file: File) => void;
  uploadsOff?: boolean;
}) {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const resumeInput = useRef<HTMLInputElement>(null);

  const locked = sub.status === "approved" || sub.status === "posted";
  const uploading = sub.status === "uploading";
  const hint = aspectHint(sub.aspect, preferredAspect);
  const shotLabels = sub.shotIds
    .map((id) => shots.find((s) => s.id === id)?.label)
    .filter((x): x is string => !!x);
  const teamComments = sub.comments.filter((c) => c.author === "medialife");
  const dur = formatDuration(sub.durationS);
  const refresh = () => router.invalidate();

  async function remove() {
    setBusy(true);
    try {
      const r = await deleteUgcSubmission({ data: { submissionId: sub.id } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(uploading ? "Unfinished upload removed" : "Upload deleted");
        await refresh();
      }
    } catch {
      toast.error("Couldn't delete it. Check your connection and try again.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <li
      className={cn(
        card,
        "overflow-hidden",
        sub.status === "changes-requested" && "border-amber-400/35",
        sub.status === "approved" && "border-emerald-400/35",
        sub.status === "posted" && "border-[#3fe6e0]/30",
        sub.status === "rejected" && "opacity-80",
      )}
    >
      <div className="flex gap-4 p-4 sm:p-5">
        {sub.url ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play ${sub.name}`}
            className="group shrink-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3fe6e0]"
          >
            <PosterTile
              posterUrl={sub.posterUrl}
              mediaType={sub.mediaType}
              durationS={sub.durationS}
              playable={sub.mediaType === "video"}
              className="aspect-[3/4] w-24 sm:w-28"
            />
          </button>
        ) : (
          <PosterTile
            posterUrl={sub.posterUrl}
            mediaType={sub.mediaType}
            className="aspect-[3/4] w-24 shrink-0 sm:w-28"
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <SubmissionStatusChip status={sub.status} paused={uploading} />
              <p className="mt-2 truncate text-[15px] font-semibold" title={sub.name}>
                {sub.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {formatBytes(sub.size)}
                {dur ? ` · ${dur}` : ""}
                {sub.aspect && sub.aspect !== "other" ? ` · ${sub.aspect}` : ""}
                {" · "}
                <time dateTime={new Date(sub.createdAt).toISOString()} suppressHydrationWarning>
                  {dayDate(sub.completedAt ?? sub.createdAt)}
                </time>
              </p>
            </div>
            <CardMenu
              sub={sub}
              locked={locked}
              onEdit={() => setEditing(true)}
              onDelete={() => setConfirmDelete(true)}
            />
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {sub.platform ? (
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 text-xs ring-1 ring-white/10 ring-inset">
                <UgcPlatformIcon platform={sub.platform} className="size-3.5" />
                {UGC_POST_PLATFORM_LABELS[sub.platform]}
              </span>
            ) : null}
            {shotLabels.map((l) => (
              <span
                key={l}
                className="inline-flex h-7 items-center rounded-full bg-[#3fe6e0]/[0.08] px-2.5 text-xs text-[#bff7f4] ring-1 ring-[#3fe6e0]/25 ring-inset"
              >
                {l}
              </span>
            ))}
          </div>
          {hint && !locked && !uploading && sub.status !== "rejected" ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200">
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-300" aria-hidden />
              {hint}
            </p>
          ) : null}
        </div>
      </div>

      {/* What to do now, by status */}
      {uploading ? (
        <div className="border-t border-white/[0.07] px-4 py-4 sm:px-5">
          <p className="text-sm text-[#c9d1d8]">
            This upload stopped before it finished. Pick the same file again to carry on from where
            it left off.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnGold}
              disabled={uploadsOff || !onResume}
              onClick={() => resumeInput.current?.click()}
            >
              <UploadCloud aria-hidden /> Choose file to resume
            </button>
            <button type="button" className={btnGhost} onClick={() => setConfirmDelete(true)}>
              Discard
            </button>
            <input
              ref={resumeInput}
              type="file"
              className="hidden"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size !== sub.size)
                  return toast.error(
                    `That's a different file. Pick ${sub.name} (${formatBytes(sub.size)}).`,
                  );
                onResume?.(f);
              }}
            />
          </div>
        </div>
      ) : null}

      {sub.status === "changes-requested" ? (
        <div className="border-t border-amber-400/20 bg-amber-400/[0.05] px-4 py-3.5 text-sm text-amber-100 sm:px-5">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
            <span>
              Read the notes below, then upload a new version. You can delete this one once the new
              one is in.
            </span>
          </p>
        </div>
      ) : null}

      {sub.status === "approved" ? <LiveLinkForm sub={sub} onDone={refresh} /> : null}

      {sub.status === "posted" && sub.liveUrl ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-[#3fe6e0]/20 bg-[#3fe6e0]/[0.05] px-4 py-3.5 sm:px-5">
          <Radio className="size-4 shrink-0 text-[#3fe6e0]" aria-hidden />
          <span className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Live</span>
            {sub.postedAt ? (
              <span className="text-muted-foreground"> since {dayDate(sub.postedAt)}</span>
            ) : null}
            <a
              href={sub.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 block truncate text-[#bff7f4] underline decoration-[#3fe6e0]/40 underline-offset-4 hover:decoration-[#3fe6e0]"
            >
              {sub.liveUrl.replace(/^https:\/\//, "")}
            </a>
          </span>
          <a href={sub.liveUrl} target="_blank" rel="noreferrer" className={btnGhost}>
            Open <ExternalLink aria-hidden />
          </a>
        </div>
      ) : null}

      {sub.status === "rejected" ? (
        <p className="border-t border-white/[0.07] px-4 py-3.5 text-sm text-muted-foreground sm:px-5">
          We won't use this one for the campaign. Thanks for sending it.
        </p>
      ) : null}

      {!uploading ? (
        <Feedback
          sub={sub}
          openByDefault={sub.status === "changes-requested" || teamComments.length > 0}
        />
      ) : null}

      {sub.url ? (
        <MediaDialog
          open={playing}
          onOpenChange={setPlaying}
          title={sub.name}
          subtitle={[formatBytes(sub.size), dur, sub.aspect].filter(Boolean).join(" · ")}
          src={sub.url}
          poster={sub.posterUrl}
          kind={sub.mediaType}
          width={sub.width}
          height={sub.height}
          actions={
            sub.downloadUrl ? (
              <DownloadButton
                icon
                file={{
                  downloadUrl: sub.downloadUrl,
                  size: sub.size,
                  mime: sub.mime,
                  name: sub.name,
                }}
              />
            ) : null
          }
        />
      ) : null}

      <EditDialog
        open={editing}
        onOpenChange={setEditing}
        sub={sub}
        shots={shots}
        onSaved={refresh}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="rounded-3xl border-white/10 bg-[#0b1318]">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {uploading ? "Discard this unfinished upload?" : "Delete this upload?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {sub.name} ({formatBytes(sub.size)}) will be removed and its space freed. This can't
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11 rounded-full">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-11 rounded-full bg-rose-500 text-white hover:bg-rose-500/90"
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="motion-safe:animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function CardMenu({
  sub,
  locked,
  onEdit,
  onDelete,
}: {
  sub: UgcSubmissionView;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (sub.status === "uploading") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(btnIcon, "-mt-1 -mr-1 border-transparent bg-transparent")}
          aria-label={`More for ${sub.name}`}
        >
          <MoreHorizontal aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-56 rounded-2xl border-white/10">
        {sub.downloadUrl ? (
          <DropdownMenuItem asChild className="min-h-10">
            <a href={sub.downloadUrl} download={sub.name}>
              <UploadCloud className="size-4 rotate-180" aria-hidden /> Download
            </a>
          </DropdownMenuItem>
        ) : null}
        {!locked ? (
          <>
            <DropdownMenuItem onSelect={onEdit} className="min-h-10">
              <Pencil className="size-4" aria-hidden /> Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onDelete}
              className="min-h-10 text-rose-300 focus:text-rose-200"
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </DropdownMenuItem>
          </>
        ) : (
          <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
            Approved content stays in your record. Ask us if it needs to go.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Feedback({ sub, openByDefault }: { sub: UgcSubmissionView; openByDefault: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(openByDefault);
  const id = useId();
  const n = sub.comments.length;
  return (
    <div className="border-t border-white/[0.07]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-medium transition-colors hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3fe6e0] sm:px-5"
      >
        <MessageSquare className="size-4 text-[#3fe6e0]" aria-hidden />
        <span className="flex-1">
          Feedback{n ? <span className="text-muted-foreground tabular-nums"> · {n}</span> : null}
        </span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : n ? "Show" : "Message the team"}
        </span>
      </button>
      {open ? (
        <div id={id} className="px-4 pb-4 sm:px-5">
          <CommentThread
            comments={sub.comments}
            viewer="creator"
            placeholder="Message the team…"
            emptyText="No notes yet. The team writes here when they review."
            onPost={async (body) => {
              const r = await postUgcComment({ data: { submissionId: sub.id, body } });
              if (!r.ok) return r.error;
              await router.invalidate();
              return null;
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function LiveLinkForm({ sub, onDone }: { sub: UgcSubmissionView; onDone: () => Promise<void> }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [disclosed, setDisclosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = liveUrlProblem(url);
    if (problem) return setError(problem);
    if (!disclosed)
      return setError(
        "Tick the box to confirm your caption includes #ad or the paid-partnership label.",
      );
    setBusy(true);
    setError(null);
    try {
      const r = await setUgcLiveUrl({
        data: { submissionId: sub.id, url: url.trim(), disclosureConfirmed: true },
      });
      if (!r.ok) setError(r.error);
      else {
        toast.success("You're live! Thanks for posting.");
        await onDone();
      }
    } catch {
      setError("Couldn't save the link. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="border-t border-emerald-400/20 bg-[linear-gradient(180deg,rgb(52_211_153/0.07),transparent)] px-4 py-4 sm:px-5"
    >
      <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-200">
        <BadgeCheck className="size-[18px] text-emerald-300" aria-hidden /> Approved. Post it, then
        paste your live link
      </p>
      <label htmlFor={`${id}-url`} className="mt-3 mb-1.5 block text-sm font-medium">
        Link to your post
      </label>
      <div className="relative">
        <Link2
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://www.tiktok.com/@you/video/…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error && liveUrlProblem(url) ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className={cn(field, "pl-10")}
        />
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#f6c344]/30 bg-[#f6c344]/[0.06] p-3.5 text-sm leading-relaxed has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#3fe6e0]">
        <input
          type="checkbox"
          checked={disclosed}
          onChange={(e) => {
            setDisclosed(e.target.checked);
            if (error) setError(null);
          }}
          required
          className="mt-0.5 size-5 shrink-0 accent-[#f6c344]"
        />
        <span>
          My caption includes <strong className="font-mono text-[#ffe48a]">#ad</strong> or the
          platform's <strong className="text-[#ffe48a]">paid-partnership label</strong>.
          <span className="block text-xs text-muted-foreground">
            Required: you got the package for free.
          </span>
        </span>
      </label>
      <div aria-live="assertive">
        {error ? (
          <p id={`${id}-err`} className="mt-2 flex items-start gap-1.5 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className={cn(btnGold, "mt-3 w-full sm:w-auto")}
        aria-disabled={busy || undefined}
      >
        {busy ? (
          <Loader2 className="motion-safe:animate-spin" aria-hidden />
        ) : (
          <Radio aria-hidden />
        )}
        Mark as posted
      </button>
    </form>
  );
}

function EditDialog({
  open,
  onOpenChange,
  sub,
  shots,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sub: UgcSubmissionView;
  shots: UgcShot[];
  onSaved: () => Promise<void>;
}) {
  const id = useId();
  const [platform, setPlatform] = useState<UgcPostPlatform | null>(sub.platform);
  const [shotIds, setShotIds] = useState(sub.shotIds);
  const [note, setNote] = useState(sub.note);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const r = await updateUgcSubmission({
        data: { submissionId: sub.id, platform, shotIds, note },
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved");
        await onSaved();
        onOpenChange(false);
      }
    } catch {
      toast.error("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl border-white/10 bg-[#0b1318] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription className="truncate">{sub.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <PlatformField value={platform} onChange={setPlatform} />
          <ShotsField shots={shots} value={shotIds} onChange={setShotIds} />
          <div>
            <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium">
              Note for the team
            </label>
            <textarea
              id={`${id}-note`}
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={textarea}
            />
          </div>
        </div>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btnGhost} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button
            type="button"
            className={btnGold}
            onClick={save}
            aria-disabled={busy || undefined}
          >
            {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
