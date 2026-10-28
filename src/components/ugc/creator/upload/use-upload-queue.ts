/**
 * The upload queue behind Upload + My content. Each picked file becomes an
 * item: read locally first (poster frame, aspect ratio, duration), then sent
 * with a UgcUploadTask (chunked, 3 in flight, pause / resume / cancel).
 *
 * Survives what phones do to uploads:
 *  - a reload: the server keeps the unfinished upload and the browser keeps
 *    its id (localStorage, per file); picking the same file again resumes it.
 *  - going offline or switching apps: a task stopped by a network error
 *    resumes by itself on "online" and when the tab is visible again.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { fingerprintUgcFile, readUgcMedia, type UgcMediaMeta } from "@/lib/ugc/media-client";
import {
  UGC,
  aspectHint,
  formatBytes,
  resolveUgcMime,
  type UgcAspect,
  type UgcPostPlatform,
  type UgcSubmissionView,
} from "@/lib/ugc/model";
import { UgcUploadTask, pendingUploadId } from "@/lib/ugc/upload-client";

export type QueueItem = {
  key: string;
  file: File;
  /** null while the file is being read. */
  meta: UgcMediaMeta | null;
  posterUrl: string | null;
  hint: string | null;
  /** A problem that stops this file from being sent at all. */
  blocked: string | null;
  /** A heads-up that doesn't block (big file). */
  warn: string | null;
  platform: UgcPostPlatform;
  shotIds: string[];
  note: string;
  /** An unfinished upload of this exact file exists on the server. */
  resumeId: string | null;
  task: UgcUploadTask | null;
};

export type QueueSpeed = { bps: number; etaS: number | null };

let seq = 0;

export function useUploadQueue({
  campaignId,
  preferredAspect,
  defaultPlatform,
  defaultShots,
  onUploaded,
}: {
  campaignId: string | null;
  preferredAspect: UgcAspect;
  defaultPlatform: UgcPostPlatform;
  defaultShots: string[];
  onUploaded: (s: UgcSubmissionView) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [, bump] = useState(0);
  const [announce, setAnnounce] = useState("");
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const speeds = useRef(new Map<string, { at: number; bytes: number; bps: number }>());
  const lastPct = useRef(new Map<string, number>());
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;

  const patch = useCallback((key: string, p: Partial<QueueItem>) => {
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }, []);

  const target = { target: "submission" as const, campaignId: campaignId ?? undefined };

  const addFiles = useCallback(
    (list: FileList | File[], opts: { resumeId?: string; autoStart?: boolean } = {}) => {
      const files = Array.from(list);
      const fresh: QueueItem[] = files.map((file) => {
        const mime = resolveUgcMime(file.name, file.type);
        const blocked = !mime
          ? "That's not a video or photo we can take. Use MP4, MOV, WebM, JPG, PNG, WebP or HEIC."
          : file.size > UGC.maxFileBytes
            ? `This file is ${formatBytes(file.size)}. Files can be up to ${formatBytes(UGC.maxFileBytes)}: export a smaller version.`
            : file.size === 0
              ? "This file is empty."
              : null;
        return {
          key: `f${++seq}`,
          file,
          meta: null,
          posterUrl: null,
          hint: null,
          blocked,
          warn:
            !blocked && file.size > UGC.recommendedFileBytes
              ? `${formatBytes(file.size)} is big. It'll work, but under ~1 GB uploads faster.`
              : null,
          platform: defaultPlatform,
          shotIds: defaultShots,
          note: "",
          resumeId: opts.resumeId ?? pendingUploadId(file, target),
          task: null,
        };
      });
      setItems((xs) => [...xs, ...fresh]);
      for (const it of fresh) {
        if (it.blocked) continue;
        void readUgcMedia(it.file).then((meta) => {
          const posterUrl = meta.poster ? URL.createObjectURL(meta.poster) : null;
          patch(it.key, { meta, posterUrl, hint: aspectHint(meta.aspect, preferredAspect) });
          if (opts.autoStart) {
            const cur = itemsRef.current.find((x) => x.key === it.key);
            if (cur) void startItem({ ...cur, meta, posterUrl });
          }
        });
      }
      setAnnounce(
        `${files.length} file${files.length === 1 ? "" : "s"} added. Check the details, then upload.`,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignId, preferredAspect, defaultPlatform, defaultShots.join(",")],
  );

  const startItem = useCallback(
    async (it: QueueItem) => {
      if (it.blocked || it.task?.state === "uploading") return;
      let task = it.task;
      if (!task || task.state === "cancelled") {
        const fingerprint = await fingerprintUgcFile(it.file).catch(() => null);
        task = new UgcUploadTask(it.file, {
          ...target,
          platform: it.platform,
          shotIds: it.shotIds,
          note: it.note,
          meta: it.meta,
          poster: it.meta?.poster ?? null,
          fingerprint,
        } as ConstructorParameters<typeof UgcUploadTask>[1]);
        if (it.resumeId) task.id = it.resumeId;
        const key = it.key;
        task.subscribe((t) => {
          const now = performance.now();
          const s = speeds.current.get(key);
          if (t.state === "uploading" && t.progress.phase === "uploading") {
            if (!s) speeds.current.set(key, { at: now, bytes: t.progress.sentBytes, bps: 0 });
            else if (now - s.at > 800) {
              const inst = ((t.progress.sentBytes - s.bytes) / (now - s.at)) * 1000;
              speeds.current.set(key, {
                at: now,
                bytes: t.progress.sentBytes,
                bps: s.bps ? s.bps * 0.7 + inst * 0.3 : inst,
              });
            }
          } else if (t.state !== "uploading") speeds.current.delete(key);
          const pct = Math.floor(t.progress.fraction * 4) * 25;
          if (t.state === "uploading" && pct !== lastPct.current.get(key) && pct > 0 && pct < 100) {
            lastPct.current.set(key, pct);
            setAnnounce(`${t.file.name}: ${pct}% uploaded`);
          }
          bump((n) => n + 1);
        });
        patch(it.key, { task });
      }
      setAnnounce(`Uploading ${it.file.name}`);
      const res = await task.start();
      const name = it.file.name;
      if (res?.kind === "submission") {
        setAnnounce(`${name} uploaded. It's in review.`);
        onUploadedRef.current(res.submission);
        setTimeout(() => {
          setItems((xs) => xs.filter((x) => x.key !== it.key));
          if (it.posterUrl) URL.revokeObjectURL(it.posterUrl);
        }, 1600);
      } else if (task.state === "paused") setAnnounce(`${name} paused`);
      else if (task.state === "error")
        setAnnounce(`${name} stopped: ${task.error?.message ?? "error"}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignId, patch],
  );

  const remove = useCallback(async (key: string) => {
    const it = itemsRef.current.find((x) => x.key === key);
    if (it?.task && it.task.state !== "done") await it.task.cancel();
    if (it?.posterUrl) URL.revokeObjectURL(it.posterUrl);
    setItems((xs) => xs.filter((x) => x.key !== key));
  }, []);

  // Network back, or the tab is visible again: carry on with stalled uploads.
  useEffect(() => {
    const kick = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      for (const it of itemsRef.current)
        if (it.task?.state === "error" && (it.task.error?.status ?? 0) === 0) void it.task.resume();
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, []);

  // Leaving with an upload running: the browser asks first (the upload can be resumed, but say so).
  const busy = items.some((x) => x.task?.state === "uploading");
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  const speedOf = (key: string): QueueSpeed | null => {
    const s = speeds.current.get(key);
    const it = items.find((x) => x.key === key);
    if (!s || !s.bps || !it?.task) return null;
    const left = it.task.progress.totalBytes - it.task.progress.sentBytes;
    return { bps: s.bps, etaS: left > 0 ? left / s.bps : 0 };
  };

  return { items, addFiles, startItem, remove, patch, announce, speedOf };
}
