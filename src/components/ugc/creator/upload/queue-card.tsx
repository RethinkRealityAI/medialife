/**
 * One file in the upload queue: its local poster, the format helper, the
 * details to fill in, then progress with pause / resume / cancel.
 */
import { useId, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Pause,
  Play,
  RotateCw,
  UploadCloud,
  X,
} from "lucide-react";

import { formatDuration } from "@/components/ugc/shared/format";
import {
  btnGhost,
  btnGold,
  btnIcon,
  card,
  gradientFill,
  textarea,
} from "@/components/ugc/shared/look";
import { PosterTile } from "@/components/ugc/shared/media";
import { formatBytes, type UgcShot } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { PlatformField, ShotsField } from "./fields";
import type { QueueItem, QueueSpeed } from "./use-upload-queue";

function eta(s: number | null | undefined) {
  if (s == null || !Number.isFinite(s)) return null;
  if (s < 50) return "under a minute left";
  const m = Math.round(s / 60);
  if (m < 60) return `about ${m} min left`;
  return `about ${Math.round(m / 6) / 10} h left`;
}

export function QueueCard({
  item,
  shots,
  speed,
  uploadsOff,
  onChange,
  onStart,
  onRemove,
}: {
  item: QueueItem;
  shots: UgcShot[];
  speed: QueueSpeed | null;
  uploadsOff?: boolean;
  onChange: (p: Partial<QueueItem>) => void;
  onStart: () => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [noteOpen, setNoteOpen] = useState(!!item.note);
  const t = item.task;
  const state = t?.state ?? "idle";
  const staged = !t || state === "idle" || state === "cancelled";
  const frac = t?.progress.fraction ?? 0;
  const pct = Math.round(frac * 100);
  const finishing = state === "uploading" && t?.progress.phase === "finishing";
  const done = state === "done";
  const reading = !item.meta && !item.blocked;
  const dur = formatDuration(item.meta?.durationS);

  return (
    <li
      className={cn(
        card,
        "overflow-hidden p-4 sm:p-5",
        item.blocked && "border-rose-400/35",
        state === "error" && "border-amber-400/40",
        done && "border-emerald-400/40",
      )}
      aria-labelledby={`${id}-name`}
    >
      <div className="flex gap-4">
        <PosterTile
          posterUrl={item.posterUrl}
          mediaType={item.meta?.mediaType ?? "video"}
          durationS={item.meta?.durationS}
          className="aspect-[3/4] w-20 shrink-0 sm:w-24"
        >
          {reading ? (
            <span className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="size-5 text-white/80 motion-safe:animate-spin" aria-hidden />
            </span>
          ) : null}
        </PosterTile>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p
                id={`${id}-name`}
                className="truncate text-[15px] font-semibold"
                title={item.file.name}
              >
                {item.file.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {formatBytes(item.file.size)}
                {item.meta?.width && item.meta.height
                  ? ` · ${item.meta.width}×${item.meta.height}`
                  : ""}
                {item.meta?.aspect && item.meta.aspect !== "other" ? ` · ${item.meta.aspect}` : ""}
                {dur ? ` · ${dur}` : ""}
                {reading ? " · reading…" : ""}
              </p>
            </div>
            {staged || state === "error" || item.blocked ? (
              <button
                type="button"
                onClick={onRemove}
                className={cn(btnIcon, "-mt-1 -mr-1 size-10 border-transparent bg-transparent")}
                aria-label={`Remove ${item.file.name}`}
              >
                <X aria-hidden />
              </button>
            ) : null}
          </div>

          {item.blocked ? (
            <p className="mt-2 flex items-start gap-1.5 text-sm text-rose-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {item.blocked}
            </p>
          ) : null}
          {item.hint ? (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-400/[0.08] px-2.5 py-1.5 text-sm text-amber-200 ring-1 ring-amber-400/25 ring-inset">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
              <span>{item.hint}</span>
            </p>
          ) : null}
          {item.warn && staged ? (
            <p className="mt-2 text-xs text-muted-foreground">{item.warn}</p>
          ) : null}
          {item.resumeId && staged ? (
            <p className="mt-2 text-sm text-[#bff7f4]">
              Found your unfinished upload of this file. It'll carry on where it stopped.
            </p>
          ) : null}
        </div>
      </div>

      {staged && !item.blocked ? (
        <div className="mt-4 space-y-4 border-t border-white/[0.07] pt-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <PlatformField value={item.platform} onChange={(platform) => onChange({ platform })} />
            <ShotsField
              shots={shots}
              value={item.shotIds}
              onChange={(shotIds) => onChange({ shotIds })}
            />
          </div>
          {noteOpen ? (
            <div>
              <label htmlFor={`${id}-note`} className="mb-1.5 block text-sm font-medium">
                Note for the team{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id={`${id}-note`}
                rows={2}
                maxLength={1000}
                value={item.note}
                onChange={(e) => onChange({ note: e.target.value })}
                placeholder="Anything we should know about this take?"
                className={textarea}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#bff7f4] hover:text-white focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
            >
              <ChevronDown className="size-4" aria-hidden /> Add a note for the team
            </button>
          )}
          <button
            type="button"
            onClick={onStart}
            disabled={reading || uploadsOff}
            className={cn(btnGold, "w-full sm:w-auto")}
          >
            <UploadCloud aria-hidden />
            {reading ? "Reading file…" : item.resumeId ? "Resume upload" : "Upload"}
          </button>
        </div>
      ) : null}

      {!staged ? (
        <div className="mt-4">
          <div
            role="progressbar"
            aria-label={`Upload progress for ${item.file.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
            className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]"
          >
            <span
              className={cn(
                "block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
                done
                  ? "bg-emerald-400"
                  : state === "error"
                    ? "bg-amber-400"
                    : state === "paused"
                      ? "bg-white/35"
                      : gradientFill,
              )}
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="text-sm tabular-nums">
              {done ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                  <CheckCircle2 className="size-4" aria-hidden /> Uploaded. It's in review.
                </span>
              ) : state === "error" ? (
                <span className="inline-flex items-start gap-1.5 text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
                  {t?.error?.message ?? "The upload stopped."}
                </span>
              ) : (
                <>
                  <span className="font-semibold">{finishing ? "Finishing…" : `${pct}%`}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {formatBytes(t?.progress.sentBytes ?? 0)} of {formatBytes(item.file.size)}
                    {state === "paused"
                      ? " · paused"
                      : speed && !finishing
                        ? ` · ${formatBytes(speed.bps)}/s · ${eta(speed.etaS) ?? ""}`
                        : t?.progress.phase === "starting"
                          ? " · starting"
                          : ""}
                  </span>
                </>
              )}
            </p>
            {!done ? (
              <div className="flex items-center gap-2">
                {state === "uploading" ? (
                  <button
                    type="button"
                    onClick={() => t?.pause()}
                    className={btnGhost}
                    disabled={finishing}
                  >
                    <Pause aria-hidden /> Pause
                  </button>
                ) : state === "paused" ? (
                  <button
                    type="button"
                    onClick={onStart}
                    className={btnGhost}
                    disabled={uploadsOff}
                  >
                    <Play aria-hidden /> Resume
                  </button>
                ) : state === "error" ? (
                  <button
                    type="button"
                    onClick={onStart}
                    className={btnGhost}
                    disabled={uploadsOff}
                  >
                    <RotateCw aria-hidden /> Try again
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onRemove}
                  className={cn(btnGhost, "text-muted-foreground")}
                  disabled={finishing}
                >
                  <X aria-hidden /> Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
