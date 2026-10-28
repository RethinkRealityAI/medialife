/**
 * Browser side of Media Library uploads (HTTP contract in
 * src/lib/media/uploads.server.ts). The UGC Hub's resumable client
 * (src/lib/ugc/upload-client.ts) pointed at the media endpoints:
 *
 *  - pause / resume: abort the signal to pause; start again with the same File
 *    to resume. The upload id is kept in localStorage (name + size +
 *    lastModified) and the server says which chunks it has, so a reload or a
 *    dropped connection resumes instead of starting over.
 *  - 3 chunks in flight, each retried with backoff on network errors and 5xx.
 *  - a screen wake lock while uploading (where supported).
 *  - a thumbnail / poster frame, sent right after init.
 *
 *   const meta = await readMediaMeta(file);        // media-client.ts
 *   const task = new MediaUploadTask(file, { fields: { client: "EVADE", tags: ["Gameplay"] }, meta });
 *   task.subscribe((t) => render(t.state, t.progress.fraction));
 *   await task.start();  task.pause();  await task.resume();  await task.cancel();
 */
import { fetchRanged, saveBlob } from "@/lib/hub/download-client";

import { MEDIA, formatBytes, type MediaAssetView, type MediaPurpose } from "./model";

/** Metadata the browser read from the file (media-client.ts). */
export type MediaUploadMeta = {
  width: number | null;
  height: number | null;
  durationS: number | null;
  color: string | null;
  thumb: Blob | null;
};

/** The batch's classification, applied at init. */
export type MediaUploadFields = {
  title?: string;
  description?: string;
  usageNotes?: string;
  rights?: string;
  client?: string;
  collection?: string;
  purpose?: MediaPurpose | null;
  tags?: string[];
  aiGenerated?: boolean;
  public?: boolean;
  uploader?: string;
};

export type MediaUploadProgress = {
  phase: "starting" | "uploading" | "finishing" | "done";
  fraction: number;
  sentBytes: number;
  totalBytes: number;
};

export type MediaUploadOptions = {
  fields?: MediaUploadFields;
  meta?: MediaUploadMeta | null;
  fingerprint?: string | null;
  onProgress?: (p: MediaUploadProgress) => void;
  /** Called once the server has an id for the upload (new or resumed). */
  onStarted?: (id: string, info: { resumed: boolean; warning: string | null }) => void;
  /** Abort to pause. */
  signal?: AbortSignal;
  /** Resume this upload id instead of looking it up by the file. */
  resumeId?: string | null;
  /** Chunks in flight at once (default 3). */
  concurrency?: number;
};

export class MediaUploadError extends Error {
  constructor(
    message: string,
    /** HTTP status (0 for network errors). 413 = too big, 415 = wrong type. */
    public status: number,
    /** True when the signal was aborted: the upload can be resumed. */
    public paused = false,
    public uploadId: string | null = null,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

const HEADERS = { "x-media": "1" };

async function errorOf(res: Response, id: string | null) {
  try {
    const body = (await res.json()) as { error?: string };
    return new MediaUploadError(
      body.error ?? `Upload failed (${res.status})`,
      res.status,
      false,
      id,
    );
  } catch {
    return new MediaUploadError(
      res.status === 401
        ? "Your admin session has ended. Sign in again, then add the file to resume."
        : `Upload failed (${res.status})`,
      res.status,
      false,
      id,
    );
  }
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

export const resumeKey = (file: File) =>
  `media-upload:${file.name}:${file.size}:${file.lastModified}`;

const local = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* private mode */
    }
  },
};

/** An unfinished upload id remembered for this file, if any. */
export const pendingMediaUpload = (file: File) => local.get(resumeKey(file));
export const forgetMediaUpload = (file: File) => local.del(resumeKey(file));

type WakeLockLike = { release(): Promise<void> };
async function wakeLock(): Promise<WakeLockLike | null> {
  try {
    const wl = (
      navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLockLike> } }
    ).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadMediaFile(
  file: File,
  opts: MediaUploadOptions = {},
): Promise<MediaAssetView> {
  if (file.size > MEDIA.maxFileBytes)
    throw new MediaUploadError(
      `That file is ${formatBytes(file.size)}. Files can be up to ${formatBytes(MEDIA.maxFileBytes)}; export it at 1080p for the web.`,
      413,
    );
  if (!file.size) throw new MediaUploadError("That file is empty.", 400);
  const key = resumeKey(file);
  const total = file.size;
  const report = (phase: MediaUploadProgress["phase"], sent: number) =>
    opts.onProgress?.({
      phase,
      fraction: total ? sent / total : 1,
      sentBytes: sent,
      totalBytes: total,
    });

  let id: string | null = opts.resumeId ?? local.get(key);
  let chunkSize: number = MEDIA.chunkBytes;
  let chunks = Math.max(1, Math.ceil(total / chunkSize));
  let received = new Set<number>();
  let resumed = false;
  let warning: string | null = null;
  const lock = await wakeLock();

  try {
    report("starting", 0);
    if (id) {
      const res = await fetch(`/api/media/uploads/${id}`, {
        headers: HEADERS,
        signal: opts.signal,
      });
      if (res.ok) {
        const st = (await res.json()) as {
          size: number;
          chunkSize: number;
          chunks: number;
          received: number[];
        };
        if (st.size === total) {
          chunkSize = st.chunkSize;
          chunks = st.chunks;
          received = new Set(st.received);
          resumed = true;
        } else id = null;
      } else if (res.status === 401) throw await errorOf(res, id);
      else id = null;
      if (!id) local.del(key);
    }
    if (!id) {
      const f = opts.fields ?? {};
      const init = await fetch("/api/media/uploads", {
        method: "POST",
        headers: { ...HEADERS, "content-type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: total,
          mime: file.type,
          ...f,
          width: opts.meta?.width ?? null,
          height: opts.meta?.height ?? null,
          durationS: opts.meta?.durationS ?? null,
          color: opts.meta?.color ?? null,
          fingerprint: opts.fingerprint ?? null,
        }),
        signal: opts.signal,
      });
      if (!init.ok) throw await errorOf(init, null);
      const r = (await init.json()) as {
        id: string;
        plan: { mode: string };
        chunkSize: number;
        chunks: number;
        warning: string | null;
      };
      // TODO(r2): branch here when the server plans "presigned-multipart".
      if (r.plan.mode !== "chunks")
        throw new MediaUploadError("This upload method isn't supported yet.", 501, false, r.id);
      id = r.id;
      chunkSize = r.chunkSize;
      chunks = r.chunks;
      warning = r.warning;
      local.set(key, id);
      if (opts.meta?.thumb) {
        await fetch(`/api/media/uploads/${id}/thumb`, {
          method: "PUT",
          headers: { ...HEADERS, "content-type": opts.meta.thumb.type || "image/jpeg" },
          body: opts.meta.thumb,
          signal: opts.signal,
        }).catch((e) => {
          if (isAbort(e)) throw e;
        });
      }
    }
    const uploadId = id;
    opts.onStarted?.(uploadId, { resumed, warning });

    const sizeOf = (n: number) => Math.min(total, (n + 1) * chunkSize) - n * chunkSize;
    let sent = [...received].reduce((s, n) => s + sizeOf(n), 0);
    report("uploading", sent);

    const sendChunk = async (n: number) => {
      const body = file.slice(n * chunkSize, Math.min(total, (n + 1) * chunkSize));
      for (let attempt = 0; ; attempt++) {
        let res: Response | null = null;
        try {
          res = await fetch(`/api/media/uploads/${uploadId}/chunks/${n}`, {
            method: "PUT",
            headers: { ...HEADERS, "content-type": "application/octet-stream" },
            body,
            signal: opts.signal,
          });
        } catch (e) {
          if (isAbort(e)) throw e;
          res = null; // network error: retry
        }
        if (res?.ok) break;
        if (res && res.status < 500 && res.status !== 429) {
          if (res.status === 415 || res.status === 404) local.del(key);
          throw await errorOf(res, uploadId);
        }
        if (attempt >= 4)
          throw res
            ? await errorOf(res, uploadId)
            : new MediaUploadError(
                "The connection dropped. Press resume to carry on from where it stopped.",
                0,
                false,
                uploadId,
              );
        await pause(800 * 2 ** attempt);
      }
      received.add(n);
      sent += sizeOf(n);
      report("uploading", sent);
    };

    const todo = Array.from({ length: chunks }, (_, n) => n).filter((n) => !received.has(n));
    // The first chunk goes alone: the server checks the file type on it.
    if (todo[0] === 0) await sendChunk(todo.shift()!);
    const workers = Math.max(1, Math.min(opts.concurrency ?? 3, 6));
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (todo.length) await sendChunk(todo.shift()!);
      }),
    );

    report("finishing", total);
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`/api/media/uploads/${uploadId}/complete`, {
        method: "POST",
        headers: HEADERS,
        signal: opts.signal,
      });
      if (res.ok) {
        local.del(key);
        report("done", total);
        return ((await res.json()) as { asset: MediaAssetView }).asset;
      }
      if (res.status === 409 && attempt < 2) {
        const { missing } = (await res.json().catch(() => ({}))) as { missing?: number };
        if (typeof missing === "number") {
          received.delete(missing);
          await sendChunk(missing);
          continue;
        }
      }
      if (res.status === 415 || res.status === 404) local.del(key);
      throw await errorOf(res, uploadId);
    }
  } catch (e) {
    if (isAbort(e)) throw new MediaUploadError("Paused", 0, true, id);
    throw e;
  } finally {
    await lock?.release().catch(() => undefined);
  }
}

/** Cancels an unfinished upload and forgets it. */
export async function cancelMediaUpload(id: string) {
  const res = await fetch(`/api/media/uploads/${id}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok && res.status !== 204) throw await errorOf(res, id);
}

export type MediaTaskState = "queued" | "uploading" | "paused" | "done" | "error" | "cancelled";

/** One upload with state, for the queue. Subscribe to re-render. */
export class MediaUploadTask {
  state: MediaTaskState = "queued";
  progress: MediaUploadProgress;
  id: string | null;
  resumed = false;
  warning: string | null = null;
  error: MediaUploadError | null = null;
  result: MediaAssetView | null = null;
  private ctrl: AbortController | null = null;
  private listeners = new Set<(t: MediaUploadTask) => void>();

  constructor(
    public file: File,
    public opts: Omit<MediaUploadOptions, "signal" | "onProgress" | "onStarted">,
  ) {
    this.progress = { phase: "starting", fraction: 0, sentBytes: 0, totalBytes: file.size };
    this.id = pendingMediaUpload(file);
  }

  subscribe(fn: (t: MediaUploadTask) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** Starts or resumes. Resolves with the asset, or null when paused / cancelled / failed. */
  async start(): Promise<MediaAssetView | null> {
    if (this.state === "uploading" || this.state === "done" || this.state === "cancelled")
      return this.result;
    this.ctrl = new AbortController();
    this.state = "uploading";
    this.error = null;
    this.emit();
    try {
      this.result = await uploadMediaFile(this.file, {
        ...this.opts,
        resumeId: this.id,
        signal: this.ctrl.signal,
        onStarted: (id, info) => {
          this.id = id;
          this.resumed = info.resumed;
          this.warning = info.warning ?? this.warning;
          this.emit();
        },
        onProgress: (p) => {
          this.progress = p;
          this.emit();
        },
      });
      this.state = "done";
      return this.result;
    } catch (e) {
      const err =
        e instanceof MediaUploadError
          ? e
          : new MediaUploadError(String((e as Error)?.message ?? e), 0);
      if ((this.state as MediaTaskState) !== "cancelled") {
        this.state = err.paused ? "paused" : "error";
        this.error = err.paused ? null : err;
      }
      return null;
    } finally {
      this.ctrl = null;
      this.emit();
    }
  }

  pause() {
    this.ctrl?.abort();
  }

  resume() {
    return this.start();
  }

  async cancel() {
    const was = this.state;
    this.state = "cancelled";
    this.ctrl?.abort();
    forgetMediaUpload(this.file);
    if (this.id && was !== "done") await cancelMediaUpload(this.id).catch(() => undefined);
    this.emit();
  }
}

/**
 * Saves an asset's file. Small files go through a plain link; bigger ones are
 * read in Range pieces (a Netlify function response tops out near 20 MB).
 */
export async function downloadMediaFile(
  a: Pick<MediaAssetView, "downloadUrl" | "size" | "mime" | "name">,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
) {
  if (a.size <= MEDIA.maxResponseBytes) {
    const link = document.createElement("a");
    link.href = a.downloadUrl;
    link.download = a.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    opts.onProgress?.(1);
    return;
  }
  saveBlob(await fetchRanged(a.downloadUrl, a, opts), a.name);
}
