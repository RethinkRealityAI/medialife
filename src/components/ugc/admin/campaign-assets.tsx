import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  ImageIcon,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Panel, PanelTitle } from "@/components/admin/kit";
import { errorMessage, useRun } from "@/components/admin/creators/ui";
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
import {
  adminDeleteUgcAsset,
  adminSaveUgcCampaign,
  adminUpdateUgcAsset,
} from "@/lib/ugc/admin.functions";
import {
  UGC,
  UGC_ASSET_ACCEPT,
  UGC_ASSET_GROUP_LABELS,
  UGC_ASSET_GROUPS,
  formatBytes,
  type UgcAssetGroup,
  type UgcAssetView,
  type UgcCampaign,
} from "@/lib/ugc/model";
import { UgcUploadError, cancelUgcUpload, uploadUgcFile } from "@/lib/ugc/upload-client";
import { cn } from "@/lib/utils";

import { DownloadButton } from "./media";
import { plural } from "./ui";

// The campaign's asset library: chunked uploads with progress, group, cover,
// order and remove. Creators see these grouped on their Assets page.

type Upload = {
  key: string;
  name: string;
  size: number;
  fraction: number;
  state: "uploading" | "done" | "error" | "cancelled";
  error?: string;
  ctrl: AbortController;
  uploadId?: string;
};

function guessGroup(f: File): UgcAssetGroup {
  const n = f.name.toLowerCase();
  if (f.type === "application/zip" || n.endsWith(".zip")) return "zip";
  if (f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg)$/.test(n)) return "sounds";
  if (f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/.test(n))
    return /overlay/.test(n) ? "overlays" : "gameplay";
  if (/logo/.test(n)) return "logos";
  if (/splash/.test(n)) return "splash";
  if (/overlay/.test(n)) return "overlays";
  if (f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|heic)$/.test(n)) return "art";
  return "other";
}

const iconFor = (a: Pick<UgcAssetView, "mime" | "isImage" | "isVideo">) =>
  a.isImage
    ? ImageIcon
    : a.isVideo
      ? FileVideo
      : a.mime.startsWith("audio/")
        ? FileAudio
        : a.mime === "application/zip"
          ? FileArchive
          : FileText;

export function AssetLibrary({
  campaign,
  assets,
}: {
  campaign: UgcCampaign;
  assets: UgcAssetView[];
}) {
  const router = useRouter();
  const { run, busy } = useRun();
  const [group, setGroup] = useState<UgcAssetGroup | "auto">("auto");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [drag, setDrag] = useState(false);
  const [removing, setRemoving] = useState<UgcAssetView | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const active = uploads.filter((u) => u.state === "uploading").length;

  // warn before leaving mid-upload
  useEffect(() => {
    if (!active) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [active]);

  const patch = (key: string, p: Partial<Upload>) =>
    setUploads((us) => us.map((u) => (u.key === key ? { ...u, ...p } : u)));

  async function start(files: File[]) {
    const ok = files.filter((f) => {
      if (f.size > UGC.maxFileBytes) {
        toast.error(`${f.name} is over ${formatBytes(UGC.maxFileBytes)}.`);
        return false;
      }
      return true;
    });
    const batch: Upload[] = ok.map((f) => ({
      key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      size: f.size,
      fraction: 0,
      state: "uploading",
      ctrl: new AbortController(),
    }));
    setUploads((us) => [
      ...batch,
      ...us.filter((u) => u.state === "uploading" || u.state === "error"),
    ]);
    let done = 0;
    // two at a time: each upload already sends 3 chunks in parallel
    const queue = ok.map((f, i) => ({ f, u: batch[i] }));
    async function worker() {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { f, u } = next;
        try {
          await uploadUgcFile(f, {
            target: "asset",
            campaignId: campaign.id,
            group: group === "auto" ? guessGroup(f) : group,
            signal: u.ctrl.signal,
            onStarted: (id) => patch(u.key, { uploadId: id }),
            onProgress: (p) => patch(u.key, { fraction: p.fraction }),
          });
          patch(u.key, { state: "done", fraction: 1 });
          done++;
        } catch (err) {
          if (u.ctrl.signal.aborted) patch(u.key, { state: "cancelled" });
          else
            patch(u.key, {
              state: "error",
              error:
                err instanceof UgcUploadError || err instanceof Error
                  ? err.message
                  : errorMessage(err),
            });
        }
      }
    }
    await Promise.all([worker(), worker()]);
    if (done) {
      toast.success(`Uploaded ${plural(done, "file")}`);
      await router.invalidate();
      setUploads((us) => us.filter((u) => u.state !== "done"));
    }
  }

  async function cancel(u: Upload) {
    u.ctrl.abort();
    patch(u.key, { state: "cancelled" });
    if (u.uploadId) await cancelUgcUpload(u.uploadId).catch(() => undefined);
    setUploads((us) => us.filter((x) => x.key !== u.key));
  }

  const move = (i: number, d: number) => {
    const ids = assets.map((a) => a.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run(
      "order",
      () => adminSaveUgcCampaign({ data: { id: campaign.id, assetFileIds: ids } }),
      null,
    );
  };

  return (
    <Panel>
      <PanelTitle
        className="p-4 sm:p-5"
        icon={ImageIcon}
        tone="violet"
        title="Asset library"
        sub={`Logos, art, gameplay clips, sounds and overlays creators can download. Up to ${formatBytes(UGC.maxFileBytes)} per file; a ZIP becomes “Download all”.`}
      />
      <div className="px-4 pb-4 sm:px-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void start([...e.dataTransfer.files]);
          }}
          className={cn(
            "flex flex-col items-center gap-3 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors sm:flex-row sm:text-left",
            drag
              ? "border-[var(--partner)] bg-[color-mix(in_oklab,var(--partner)_8%,transparent)]"
              : "border-white/[0.14] bg-white/[0.015]",
          )}
        >
          <UploadCloud className="size-8 shrink-0 text-violet-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Drop files here</div>
            <div className="text-xs text-muted-foreground">
              Uploads in 4 MB pieces; big clips are fine. Keep this tab open until they finish.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Select value={group} onValueChange={(v) => setGroup(v as UgcAssetGroup | "auto")}>
              <SelectTrigger className="h-9 w-48" aria-label="Group for new files">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Group: pick from file</SelectItem>
                {UGC_ASSET_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {UGC_ASSET_GROUP_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={() => input.current?.click()}>
              <UploadCloud aria-hidden />
              Choose files
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              accept={UGC_ASSET_ACCEPT}
              className="sr-only"
              data-testid="asset-input"
              onChange={(e) => {
                void start([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {uploads.length ? (
          <ul className="mt-3 space-y-2" aria-label="Uploads in progress">
            {uploads.map((u) => (
              <li
                key={u.key}
                className="rounded-xl border border-white/[0.07] bg-black/25 px-3 py-2.5"
              >
                <div className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {u.state === "error"
                      ? ""
                      : `${Math.round(u.fraction * 100)}% of ${formatBytes(u.size)}`}
                  </span>
                  {u.state === "uploading" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Cancel ${u.name}`}
                      onClick={() => void cancel(u)}
                    >
                      <X aria-hidden />
                    </Button>
                  ) : u.state === "error" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Dismiss"
                      onClick={() => setUploads((us) => us.filter((x) => x.key !== u.key))}
                    >
                      <X aria-hidden />
                    </Button>
                  ) : null}
                </div>
                {u.state === "error" ? (
                  <p className="mt-1 text-xs text-red-200">{u.error}</p>
                ) : (
                  <div
                    className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
                    role="progressbar"
                    aria-valuenow={Math.round(u.fraction * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${u.name}`}
                  >
                    <div
                      className="h-full rounded-full bg-violet-400 transition-[width] duration-300"
                      style={{ width: `${Math.max(2, u.fraction * 100)}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!assets.length ? (
        <div className="border-t border-white/[0.06] p-4 sm:p-5">
          <EmptyState icon={ImageIcon} tone="slate" title="No assets yet">
            Upload the logo, character art and a few gameplay clips. The first image can be the
            brief's cover.
          </EmptyState>
        </div>
      ) : (
        <ul
          className="divide-y divide-white/[0.06] border-t border-white/[0.06]"
          data-testid="asset-list"
        >
          {assets.map((a, i) => {
            const Icon = iconFor(a);
            const isCover = campaign.coverAssetId === a.id;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5"
              >
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/[0.08]">
                  {a.isImage ? (
                    <img src={a.url} alt="" className="size-full object-cover" loading="lazy" />
                  ) : a.isVideo ? (
                    <video
                      src={a.url}
                      muted
                      preload="metadata"
                      className="size-full object-cover"
                      aria-hidden
                    />
                  ) : (
                    <Icon className="size-5 text-white/55" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" title={a.name}>
                      {a.name}
                    </span>
                    {isCover ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200 ring-1 ring-amber-400/30">
                        <Star className="size-3" aria-hidden /> Cover
                      </span>
                    ) : null}
                    {campaign.zipAssetId === a.id ? (
                      <span className="shrink-0 rounded-full bg-sky-400/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200 ring-1 ring-sky-400/30">
                        Download all
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatBytes(a.size)}</div>
                </div>
                <Select
                  value={a.group}
                  onValueChange={(v) =>
                    void run(
                      `group-${a.id}`,
                      () =>
                        adminUpdateUgcAsset({
                          data: { campaignId: campaign.id, id: a.id, group: v as UgcAssetGroup },
                        }),
                      "Group changed",
                    )
                  }
                >
                  <SelectTrigger
                    className="h-8 w-full text-xs sm:w-44"
                    aria-label={`Group for ${a.name}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UGC_ASSET_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {UGC_ASSET_GROUP_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-0.5">
                  {a.isImage && !isCover ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs hover:bg-white/[0.06]"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          "cover",
                          () =>
                            adminSaveUgcCampaign({ data: { id: campaign.id, coverAssetId: a.id } }),
                          "Cover set",
                        )
                      }
                    >
                      <Star aria-hidden />
                      Cover
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-white/[0.06]"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${a.name} up`}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-white/[0.06]"
                    disabled={busy || i === assets.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${a.name} down`}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <DownloadButton file={a} label="" className="size-8 border-0 px-0" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:bg-red-400/10 hover:text-red-200"
                    onClick={() => setRemoving(a)}
                    aria-label={`Remove ${a.name}`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Creators can't download it any more. The file is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!removing) return;
                await run(
                  "remove",
                  () => adminDeleteUgcAsset({ data: { campaignId: campaign.id, id: removing.id } }),
                  "Asset removed",
                );
                setRemoving(null);
              }}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
