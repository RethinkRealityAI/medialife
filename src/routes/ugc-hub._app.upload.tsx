import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { CirclePause, Film, HardDrive, Info, Lock, UploadCloud } from "lucide-react";
import { z } from "zod";

import { Card, EmptyState, Notice, Page, PageHead, Section } from "@/components/ugc/creator/kit";
import { NoCampaign, UgcPageSkeleton, UgcRouteError } from "@/components/ugc/creator/states";
import { SubmissionCard } from "@/components/ugc/creator/submission-card";
import { DropZone } from "@/components/ugc/creator/upload/drop-zone";
import { QueueCard } from "@/components/ugc/creator/upload/queue-card";
import { useUploadQueue } from "@/components/ugc/creator/upload/use-upload-queue";
import { QuotaBar } from "@/components/ugc/shared/quota-bar";
import { SUBMISSION_TONES, UGC_TONE_CLASSES } from "@/components/ugc/shared/status-chip";
import { listUgcSubmissions } from "@/lib/ugc/creator.functions";
import {
  UGC,
  UGC_POST_PLATFORMS,
  UGC_SUBMISSION_STATUS_LABELS,
  canUpload,
  formatBytes,
  type UgcPostPlatform,
  type UgcSubmissionStatus,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

const app = getRouteApi("/ugc-hub/_app");

export const Route = createFileRoute("/ugc-hub/_app/upload")({
  validateSearch: z.object({ campaign: z.string().max(60).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ campaign: search.campaign }),
  loader: ({ deps }) => listUgcSubmissions({ data: { campaignId: deps.campaign ?? null } }),
  head: () => ({ meta: [{ title: "Upload · EVADE UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <UgcPageSkeleton />,
  errorComponent: UgcRouteError,
  component: UploadPage,
});

const ORDER: UgcSubmissionStatus[] = [
  "changes-requested",
  "approved",
  "uploading",
  "in-review",
  "posted",
  "rejected",
];

function UploadPage() {
  const data = Route.useLoaderData();
  const home = app.useLoaderData();
  const router = useRouter();
  const creator = home.creator;
  const campaign = data.campaign;
  const paused = creator.status === "paused";
  const closed = !!campaign && campaign.status !== "live";
  const uploadsOff = paused || !campaign || closed || !canUpload(creator.status);
  const main = creator.mainPlatform as string | null;
  const defaultPlatform: UgcPostPlatform = (UGC_POST_PLATFORMS as readonly string[]).includes(
    main ?? "",
  )
    ? (main as UgcPostPlatform)
    : "tiktok";

  const q = useUploadQueue({
    campaignId: campaign?.id ?? null,
    preferredAspect: campaign?.preferredAspect ?? "9:16",
    defaultPlatform,
    defaultShots: data.tickedShotIds,
    onUploaded: () => void router.invalidate(),
  });

  if (!campaign)
    return (
      <Page>
        <NoCampaign what="brief (and the upload page)" />
      </Page>
    );

  const localIds = new Set(q.items.map((i) => i.task?.id ?? i.resumeId).filter(Boolean));
  const subs = data.submissions.filter((s) => !(s.status === "uploading" && localIds.has(s.id)));
  const counts: Partial<Record<UgcSubmissionStatus, number>> = {};
  for (const s of subs) counts[s.status] = (counts[s.status] ?? 0) + 1;
  const sorted = [...subs].sort(
    (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.createdAt - a.createdAt,
  );
  const pendingBytes = q.items
    .filter((i) => !i.blocked && (!i.task || i.task.state === "idle"))
    .reduce((n, i) => n + i.file.size, 0);
  const staged = q.items.filter((i) => !i.blocked && !i.task && i.meta);
  // Something to act on (feedback, or a live link to paste): show My content first.
  const needsYou = !!(counts["changes-requested"] || counts.approved);
  const overQuota = data.quota.usedBytes + pendingBytes > data.quota.limitBytes;

  return (
    <Page>
      <PageHead kicker="Upload + my content" title="Send us your takes">
        Upload straight from your phone. Big files are fine: uploads pause, resume and survive a
        reload.
      </PageHead>

      <div className="mt-6 flex flex-col gap-10 sm:gap-12">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 space-y-4">
            {paused ? (
              <Notice
                tone="warn"
                icon={CirclePause}
                title="Uploads are off while your spot is paused"
              >
                Email {UGC.supportEmail} if you have questions.
              </Notice>
            ) : closed ? (
              <Notice tone="warn" icon={Lock} title="This campaign is closed">
                Uploads for {campaign.title} have ended. Thanks for taking part.
              </Notice>
            ) : null}

            <DropZone
              onFiles={(f) => q.addFiles(f)}
              disabled={uploadsOff}
              disabledReason={paused ? "Uploads are paused." : "Uploads are closed."}
              describedBy="upload-guide"
            />

            <p aria-live="polite" aria-atomic="true" className="sr-only">
              {q.announce}
            </p>

            {q.items.length ? (
              <section aria-labelledby="queue-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 id="queue-title" className="text-base font-semibold">
                    Your queue{" "}
                    <span className="text-muted-foreground tabular-nums">· {q.items.length}</span>
                  </h2>
                  {staged.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => staged.forEach((i) => void q.startItem(i))}
                      disabled={uploadsOff}
                      className="min-h-11 rounded-full px-3 text-sm font-medium text-[#ffe48a] hover:bg-[#f6c344]/10 focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
                    >
                      Upload all {staged.length}
                    </button>
                  ) : null}
                </div>
                <ul className="space-y-3">
                  {q.items.map((it) => (
                    <QueueCard
                      key={it.key}
                      item={it}
                      shots={data.shots}
                      speed={q.speedOf(it.key)}
                      uploadsOff={uploadsOff}
                      onChange={(p) => q.patch(it.key, p)}
                      onStart={() => void q.startItem(it)}
                      onRemove={() => void q.remove(it.key)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <Card as="aside" className="p-5 sm:p-6" id="upload-guide">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Film className="size-[18px] text-[#3fe6e0]" aria-hidden /> Export settings
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#c9d1d8]">
              Export{" "}
              <strong className="font-semibold text-foreground">
                1080p {campaign.preferredAspect}
              </strong>
              {campaign.preferredAspect === "9:16" ? " (vertical)" : ""} and keep each file under{" "}
              <strong className="font-semibold text-foreground">~1 GB</strong>.
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              {[
                ["Format", "MP4 or MOV"],
                ["Frame", `${campaign.preferredAspect}, 30 or 60 fps`],
                ["Max per file", formatBytes(UGC.maxFileBytes)],
                ["Photos", "JPG, PNG, HEIC"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.07] ring-inset"
                >
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="mt-0.5 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-white/[0.07] pt-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <HardDrive className="size-4 text-[#3fe6e0]" aria-hidden /> Your space
              </h3>
              <QuotaBar quota={data.quota} extraBytes={pendingBytes} />
              {overQuota ? (
                <p className="mt-2 text-sm text-amber-200">
                  That's more than the space you have left. Delete an older upload that isn't
                  approved, or send a smaller export.
                </p>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Everything you upload counts, including unfinished uploads. Deleting an upload
                  that isn't approved frees its space.
                </p>
              )}
            </div>
          </Card>
        </div>

        <Section
          id="mine"
          icon={UploadCloud}
          title="My content"
          className={cn("mt-0 sm:mt-0", needsYou && "order-first")}
          action={
            subs.length ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="Summary">
                {ORDER.filter((s) => counts[s]).map((s) => (
                  <li
                    key={s}
                    className={cn(
                      "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium tabular-nums",
                      UGC_TONE_CLASSES[SUBMISSION_TONES[s]],
                    )}
                  >
                    {counts[s]} {UGC_SUBMISSION_STATUS_LABELS[s].toLowerCase()}
                  </li>
                ))}
              </ul>
            ) : null
          }
        >
          {sorted.length ? (
            <ul className="grid gap-4 xl:grid-cols-2 xl:items-start">
              {sorted.map((s) => (
                <SubmissionCard
                  key={s.id}
                  sub={s}
                  shots={data.shots}
                  preferredAspect={campaign.preferredAspect}
                  uploadsOff={uploadsOff}
                  onResume={(file) => q.addFiles([file], { resumeId: s.id, autoStart: true })}
                />
              ))}
            </ul>
          ) : (
            <EmptyState art="bobo" title="Nothing uploaded yet" className="py-8 sm:py-10">
              Your uploads show up here with their status and the team's feedback.
            </EmptyState>
          )}
        </Section>
      </div>

      <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Only you and the MEDIALIFE team can see your uploads.
      </p>
    </Page>
  );
}
