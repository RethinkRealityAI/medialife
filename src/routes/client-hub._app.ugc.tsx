import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import {
  Clapperboard,
  Download,
  ExternalLink,
  Heart,
  Loader2,
  PencilLine,
  Play,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import {
  ClientHeader,
  ClientPage,
  Chip,
  Empty,
  btnGhost,
  btnPrimary,
  bytes,
  card,
  cardHover,
  compact,
  day,
  duration,
} from "@/components/client/ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getClientUgc, saveUgcFeedbackFn } from "@/lib/client/hub.functions";
import { UGC_VERDICT_LABELS, UGC_VERDICTS, type UgcVerdict } from "@/lib/client/model";
import type { ClientUgcVideo } from "@/lib/client/content.server";
import {
  UGC_PLATFORM_LABELS,
  UGC_POST_PLATFORM_LABELS,
  UGC_STATUS_LABELS,
  UGC_SUBMISSION_STATUS_LABELS,
  type UgcPlatform,
  type UgcPostPlatform,
  type UgcSubmissionStatus,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/ugc")({
  validateSearch: z.object({
    tab: z.enum(["videos", "creators"]).optional().catch(undefined),
    video: z.string().max(60).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: "UGC creators · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientUgc(),
  staleTime: 15_000,
  component: Ugc,
});

type Filter = "all" | "needs" | UgcSubmissionStatus;

const statusTone = (s: UgcSubmissionStatus) =>
  s === "posted" || s === "approved"
    ? ("good" as const)
    : s === "changes-requested"
      ? ("warn" as const)
      : s === "rejected"
        ? ("bad" as const)
        : ("accent" as const);

const verdictTone = (v: UgcVerdict) =>
  v === "love" ? ("good" as const) : v === "changes" ? ("warn" as const) : ("bad" as const);

function Ugc() {
  const data = Route.useLoaderData();
  const { tab = "videos", video } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [filter, setFilter] = useState<Filter>("all");

  const videos = useMemo(
    () =>
      data.videos.filter((v) =>
        filter === "all"
          ? true
          : filter === "needs"
            ? v.status === "in-review" && !v.feedback?.verdict
            : v.status === filter,
      ),
    [data.videos, filter],
  );
  const open = data.videos.find((v) => v.id === video) ?? null;
  const needs = data.videos.filter((v) => v.status === "in-review" && !v.feedback?.verdict).length;

  const filters: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: data.videos.length },
    { id: "needs", label: "Waiting on you", n: needs },
    ...(["in-review", "approved", "posted", "changes-requested"] as const).map((s) => ({
      id: s as Filter,
      label: UGC_SUBMISSION_STATUS_LABELS[s],
      n: data.videos.filter((v) => v.status === s).length,
    })),
  ];

  return (
    <ClientPage>
      <ClientHeader
        eyebrow="UGC program"
        title="Creators and their videos"
        description="Every video creators upload, as it lands. Tell us what you think of each one: MEDIALIFE makes the final call with the creator, so your notes never go to them directly."
      />

      <div
        role="tablist"
        aria-label="View"
        className="mt-6 inline-flex rounded-full border border-white/10 p-1"
      >
        {(
          [
            ["videos", "Videos", data.videos.length],
            ["creators", "Creators", data.creators.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() =>
              navigate({ search: (s) => ({ ...s, tab: id === "videos" ? undefined : id }) })
            }
            className={cn(
              "h-9 rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none",
              tab === id
                ? "bg-[var(--client)] text-[var(--client-ink)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {tab === "videos" ? (
        <>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Filter videos">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none",
                  filter === f.id
                    ? "border-[var(--client)] bg-[color-mix(in_oklab,var(--client)_16%,transparent)] text-foreground"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label} <span className="tabular-nums opacity-70">{f.n}</span>
              </button>
            ))}
          </div>
          {videos.length ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {videos.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ search: (s) => ({ ...s, video: v.id }) })}
                    className={cn(card, cardHover, "block w-full overflow-hidden text-left")}
                  >
                    <div className="relative aspect-[9/16] bg-black">
                      {v.posterUrl ? (
                        <img
                          src={v.posterUrl}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 size-full object-cover"
                        />
                      ) : null}
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="grid size-11 place-items-center rounded-full bg-black/60 text-white">
                          <Play className="size-5" aria-hidden />
                        </span>
                      </span>
                      {v.durationS ? (
                        <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
                          {duration(v.durationS)}
                        </span>
                      ) : null}
                      {v.feedback?.verdict ? (
                        <span className="absolute top-2 left-2">
                          <Chip tone={verdictTone(v.feedback.verdict)}>
                            {UGC_VERDICT_LABELS[v.feedback.verdict]}
                          </Chip>
                        </span>
                      ) : null}
                    </div>
                    <div className="p-3">
                      <div className="truncate text-sm font-medium">{v.creatorName}</div>
                      <div className="mt-1.5">
                        <Chip tone={statusTone(v.status)}>
                          {UGC_SUBMISSION_STATUS_LABELS[v.status]}
                        </Chip>
                      </div>
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        {day(v.submittedAt)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <Empty
                icon={Clapperboard}
                title={data.videos.length ? "Nothing here" : "No videos yet"}
              >
                {data.videos.length
                  ? "No videos match this filter."
                  : "Creators upload once their package arrives. Each video shows up here as soon as it's in."}
              </Empty>
            </div>
          )}
        </>
      ) : (
        <Creators creators={data.creators} />
      )}

      <VideoDialog
        video={open}
        onClose={() => navigate({ search: (s) => ({ ...s, video: undefined }), replace: true })}
      />
    </ClientPage>
  );
}

function Creators({
  creators,
}: {
  creators: Awaited<ReturnType<typeof getClientUgc>>["creators"];
}) {
  if (!creators.length)
    return (
      <div className="mt-6">
        <Empty icon={Users} title="No creators yet">
          Creators who join the program show up here with their channels and progress.
        </Empty>
      </div>
    );
  return (
    <div className={cn(card, "mt-6 overflow-hidden")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3 font-medium">Creator</th>
              <th className="px-4 py-3 font-medium">Channels</th>
              <th className="px-4 py-3 text-right font-medium">Reach</th>
              <th className="px-4 py-3 font-medium">Where they are</th>
              <th className="px-4 py-3 text-right font-medium">Videos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {creators.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.country}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(c.handles)
                      .filter(([, h]) => h)
                      .map(([p, h]) => (
                        <span
                          key={p}
                          className="rounded-md bg-white/[0.05] px-2 py-0.5 text-xs"
                          title={
                            c.followers[p] != null
                              ? `${c.followers[p]!.toLocaleString()} on ${UGC_PLATFORM_LABELS[p as UgcPlatform] ?? p}`
                              : undefined
                          }
                        >
                          <span className="text-muted-foreground">
                            {UGC_PLATFORM_LABELS[p as UgcPlatform] ?? p}
                          </span>{" "}
                          @{String(h).replace(/^@/, "")}
                          {c.followers[p] != null ? (
                            <span className="text-muted-foreground">
                              {" "}
                              · {compact(c.followers[p]!)}
                            </span>
                          ) : null}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {c.reach != null ? compact(c.reach) : "–"}
                </td>
                <td className="px-4 py-3">
                  <Chip
                    tone={
                      c.status === "posted"
                        ? "good"
                        : c.status === "declined" || c.status === "paused"
                          ? "muted"
                          : "accent"
                    }
                  >
                    {UGC_STATUS_LABELS[c.status]}
                  </Chip>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{c.videos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VideoDialog({ video, onClose }: { video: ClientUgcVideo | null; onClose: () => void }) {
  return (
    <Dialog open={!!video} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[min(96vw,960px)] max-w-none overflow-y-auto border-white/10 bg-[#0b0e14] p-0 sm:rounded-2xl [&>button]:hidden">
        {video ? <VideoDetail key={video.id} video={video} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function VideoDetail({ video, onClose }: { video: ClientUgcVideo; onClose: () => void }) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<UgcVerdict | null>(video.feedback?.verdict ?? null);
  const [note, setNote] = useState(video.feedback?.note ?? "");
  const [busy, setBusy] = useState(false);
  const dirty =
    verdict !== (video.feedback?.verdict ?? null) || note !== (video.feedback?.note ?? "");

  async function save() {
    setBusy(true);
    try {
      const r = await saveUgcFeedbackFn({ data: { submissionId: video.id, verdict, note } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Feedback saved. MEDIALIFE will see it.");
        await router.invalidate();
      }
    } catch {
      toast.error("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex items-center justify-center bg-black md:rounded-l-2xl">
        {video.mediaType === "video" ? (
          <video
            src={video.url}
            poster={video.posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-[70dvh] w-full object-contain md:max-h-[86dvh]"
          />
        ) : (
          <img src={video.url} alt={video.title} className="max-h-[70dvh] w-full object-contain" />
        )}
      </div>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-lg font-semibold">{video.creatorName}</DialogTitle>
            <DialogDescription className="mt-0.5 truncate text-sm text-muted-foreground">
              {video.title}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1">
              <Chip tone={statusTone(video.status)}>
                {UGC_SUBMISSION_STATUS_LABELS[video.status]}
              </Chip>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Uploaded</dt>
            <dd className="mt-1">{day(video.submittedAt)}</dd>
          </div>
          {video.campaign ? (
            <div>
              <dt className="text-xs text-muted-foreground">Campaign</dt>
              <dd className="mt-1">{video.campaign}</dd>
            </div>
          ) : null}
          {video.platform ? (
            <div>
              <dt className="text-xs text-muted-foreground">Posting on</dt>
              <dd className="mt-1">
                {UGC_POST_PLATFORM_LABELS[video.platform as UgcPostPlatform] ?? video.platform}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs text-muted-foreground">File</dt>
            <dd className="mt-1">
              {bytes(video.size)}
              {video.durationS ? ` · ${duration(video.durationS)}` : ""}
              {video.aspect ? ` · ${video.aspect}` : ""}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <a href={video.downloadUrl} className={btnGhost}>
            <Download className="size-4" aria-hidden /> Download
          </a>
          {video.liveUrl ? (
            <a href={video.liveUrl} target="_blank" rel="noreferrer" className={btnGhost}>
              <ExternalLink className="size-4" aria-hidden /> See the live post
            </a>
          ) : null}
        </div>

        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PencilLine className="size-4 text-[var(--client)]" aria-hidden /> Your feedback
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Only your team and MEDIALIFE see this. We'll pass anything the creator needs to change
            on to them.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Your verdict">
            {UGC_VERDICTS.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={verdict === v}
                onClick={() => setVerdict(verdict === v ? null : v)}
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none",
                  verdict === v
                    ? v === "love"
                      ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
                      : v === "changes"
                        ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                        : "border-red-400/60 bg-red-400/15 text-red-200"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "love" ? <Heart className="size-4" aria-hidden /> : null}
                {UGC_VERDICT_LABELS[v]}
              </button>
            ))}
          </div>
          <label
            htmlFor="ugc-note"
            className="mt-4 block text-xs font-medium text-muted-foreground"
          >
            Note (optional)
          </label>
          <Textarea
            id="ugc-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1200}
            rows={3}
            placeholder="What works, what to change, where you'd post it…"
            className="mt-1.5 border-white/10 bg-black/30"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              {video.feedback
                ? `Last saved by ${video.feedback.byName}, ${day(video.feedback.at)}`
                : ""}
            </span>
            <button type="button" onClick={save} disabled={busy || !dirty} className={btnPrimary}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save feedback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
