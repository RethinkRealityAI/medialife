/**
 * Browser side of UGC Hub uploads and downloads (HTTP contract in
 * src/lib/ugc/uploads.server.ts). Built like the Creator Hub's uploadHubFile()
 * (src/lib/hub/upload-client.ts), plus what multi-GB phone uploads need:
 *
 *  - pause / resume: abort the AbortSignal to pause; call again with the same
 *    File to resume. The upload id is kept in localStorage (keyed by name, size
 *    and lastModified), and the server says which chunks it already has, so a
 *    reload or a flaky connection resumes instead of starting over.
 *  - 3 chunks in flight, each retried with backoff on network errors and 5xx.
 *  - a screen wake lock while uploading (where the browser supports it).
 *  - an optional poster frame, sent right after init so the card has a picture.
 *
 *   const ctrl = new AbortController();
 *   const meta = await readUgcMedia(file);                 // media-client.ts
 *   const res = await uploadUgcFile(file, {
 *     target: "submission", platform: "tiktok", shotIds: ["scan-reveal"],
 *     meta, poster: meta.poster, signal: ctrl.signal,
 *     onProgress: (p) => setPct(p.fraction),
 *   });
 *   // pause: ctrl.abort()  → rejects with UgcUploadError { paused: true }
 *   // resume: uploadUgcFile(file, sameOptionsWithNewSignal)
 *
 * Or use UgcUploadTask for a queue (start / pause / resume / cancel + state).
 */
import { fetchRanged, saveBlob } from "@/lib/hub/download-client";
import {
  UGC,
  formatBytes,
  type UgcAssetGroup,
  type UgcAssetView,
  type UgcPostPlatform,
  type UgcQuota,
  type UgcSubmissionView,
} from "./model";

export type UgcUploadTarget =
  | {
      target: "submission";
      /** Defaults to the creator's current campaign. */
      campaignId?: string;
      platform?: UgcPostPlatform | null;
      shotIds?: string[];
      note?: string;
      /** From readUgcMedia(): duration and dimensions. */
      meta?: { durationS: number | null; width: number | null; height: number | null } | null;
      /** A small JPEG/PNG/WebP poster frame (readUgcMedia().poster). */
      poster?: Blob | null;
      /** fingerprintUgcFile(file), for spotting duplicates. */
      fingerprint?: string | null;
    }
  | { target: "asset"; campaignId: string; group?: UgcAssetGroup; note?: string };

export type UgcUploadProgress = {
  phase: "starting" | "uploading" | "finishing" | "done";
  fraction: number;
  sentBytes: number;
  totalBytes: number;
};

export type UgcUploadOptions = UgcUploadTarget & {
  onProgress?: (p: UgcUploadProgress) => void;
  /** Called once the server has an id for the upload (new or resumed). */
  onStarted?: (id: string) => void;
  /** Abort to pause. */
  signal?: AbortSignal;
  /** Resume this upload id instead of looking it up by the file. */
  resumeId?: string | null;
  /** Chunks in flight at once (default 3). */
  concurrency?: number;
};

export type UgcUploadResult =
  | { kind: "submission"; id: string; submission: UgcSubmissionView }
  | { kind: "asset"; id: string; asset: UgcAssetView };

export class UgcUploadError extends Error {
  constructor(
    message: string,
    /** HTTP status (0 for network errors). 413 = over a limit, 415 = wrong type. */
    public status: number,
    /** True when the signal was aborted: the upload can be resumed. */
    public paused = false,
    public uploadId: string | null = null,
    public quota: UgcQuota | null = null,
  ) {
    super(message);
    this.name = "UgcUploadError";
  }
}

const HEADERS = { "x-ugc": "1" };

async function errorOf(res: Response, id: string | null) {
  try {
    const body = (await res.json()) as { error?: string; quota?: UgcQuota };
    return new UgcUploadError(
      body.error ?? `Upload failed (${res.status})`,
      res.status,
      false,
      id,
      body.quota ?? null,
    );
  } catch {
    return new UgcUploadError(`Upload failed (${res.status})`, res.status, false, id);
  }
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** The localStorage key that remembers an unfinished upload of this file. */
type TargetKey = { target: UgcUploadTarget["target"]; campaignId?: string };

export function resumeKey(file: File, t: TargetKey) {
  return `ugc-upload:${t.target}:${t.campaignId ?? ""}:${file.name}:${file.size}:${file.lastModified}`;
}

const store = {
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
export const pendingUploadId = (file: File, t: TargetKey) => store.get(resumeKey(file, t));
export const forgetPendingUpload = (file: File, t: TargetKey) => store.del(resumeKey(file, t));

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

export async function uploadUgcFile(file: File, opts: UgcUploadOptions): Promise<UgcUploadResult> {
  if (file.size > UGC.maxFileBytes)
    throw new UgcUploadError(
      `That file is ${formatBytes(file.size)}. Files can be up to ${formatBytes(UGC.maxFileBytes)}.`,
      413,
    );
  const key = resumeKey(file, opts);
  const total = file.size;
  const report = (phase: UgcUploadProgress["phase"], sent: number) =>
    opts.onProgress?.({
      phase,
      fraction: total ? sent / total : 1,
      sentBytes: sent,
      totalBytes: total,
    });

  let id: string | null = opts.resumeId ?? store.get(key);
  let chunkSize: number = UGC.chunkBytes;
  let chunks = Math.max(1, Math.ceil(total / chunkSize));
  let received = new Set<number>();
  const lock = await wakeLock();

  try {
    report("starting", 0);
    // Resume: ask what the server already has.
    if (id) {
      const res = await fetch(`/api/ugc/uploads/${id}`, { headers: HEADERS, signal: opts.signal });
      if (res.ok) {
        const st = (await res.json()) as {
          size: number;
          chunkSize: number;
          chunks: number;
          received: number[];
          complete: boolean;
        };
        if (st.size === total) {
          chunkSize = st.chunkSize;
          chunks = st.chunks;
          received = new Set(st.received);
        } else id = null;
      } else id = null;
      if (!id) store.del(key);
    }
    if (!id) {
      const body =
        opts.target === "submission"
          ? {
              target: "submission",
              name: file.name,
              size: total,
              mime: file.type,
              campaignId: opts.campaignId,
              platform: opts.platform ?? null,
              shotIds: opts.shotIds ?? [],
              note: opts.note ?? "",
              durationS: opts.meta?.durationS ?? null,
              width: opts.meta?.width ?? null,
              height: opts.meta?.height ?? null,
              fingerprint: opts.fingerprint ?? null,
            }
          : {
              target: "asset",
              name: file.name,
              size: total,
              mime: file.type,
              campaignId: opts.campaignId,
              group: opts.group,
              note: opts.note ?? "",
            };
      const init = await fetch("/api/ugc/uploads", {
        method: "POST",
        headers: { ...HEADERS, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!init.ok) throw await errorOf(init, null);
      const r = (await init.json()) as {
        id: string;
        plan: { mode: string };
        chunkSize: number;
        chunks: number;
      };
      // TODO(r2): branch here when the server plans "presigned-multipart".
      if (r.plan.mode !== "chunks")
        throw new UgcUploadError("This upload method isn't supported yet.", 501, false, r.id);
      id = r.id;
      chunkSize = r.chunkSize;
      chunks = r.chunks;
      store.set(key, id);
      if (opts.target === "submission" && opts.poster) {
        await fetch(`/api/ugc/uploads/${id}/poster`, {
          method: "PUT",
          headers: { ...HEADERS, "content-type": opts.poster.type || "image/jpeg" },
          body: opts.poster,
          signal: opts.signal,
        }).catch((e) => {
          if (isAbort(e)) throw e;
        });
      }
    }
    const uploadId = id;
    opts.onStarted?.(uploadId);

    const sizeOf = (n: number) => Math.min(total, (n + 1) * chunkSize) - n * chunkSize;
    let sent = [...received].reduce((s, n) => s + sizeOf(n), 0);
    report("uploading", sent);

    const sendChunk = async (n: number) => {
      const body = file.slice(n * chunkSize, Math.min(total, (n + 1) * chunkSize));
      for (let attempt = 0; ; attempt++) {
        let res: Response | null = null;
        try {
          res = await fetch(`/api/ugc/uploads/${uploadId}/chunks/${n}`, {
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
          if (res.status === 415 || res.status === 404) store.del(key);
          throw await errorOf(res, uploadId);
        }
        if (attempt >= 4)
          throw res
            ? await errorOf(res, uploadId)
            : new UgcUploadError(
                "The connection dropped. Tap resume to carry on.",
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
      const res = await fetch(`/api/ugc/uploads/${uploadId}/complete`, {
        method: "POST",
        headers: HEADERS,
        signal: opts.signal,
      });
      if (res.ok) {
        store.del(key);
        report("done", total);
        const body = (await res.json()) as {
          submission?: UgcSubmissionView;
          asset?: UgcAssetView;
        };
        return body.submission
          ? { kind: "submission", id: uploadId, submission: body.submission }
          : { kind: "asset", id: uploadId, asset: body.asset! };
      }
      if (res.status === 409 && attempt < 2) {
        const { missing } = (await res.json().catch(() => ({}))) as { missing?: number };
        if (typeof missing === "number") {
          received.delete(missing);
          await sendChunk(missing);
          continue;
        }
      }
      if (res.status === 415) store.del(key);
      throw await errorOf(res, uploadId);
    }
  } catch (e) {
    if (isAbort(e)) throw new UgcUploadError("Paused", 0, true, id);
    throw e;
  } finally {
    await lock?.release().catch(() => undefined);
  }
}

/** Cancels an unfinished upload and forgets it. */
export async function cancelUgcUpload(id: string) {
  const res = await fetch(`/api/ugc/uploads/${id}`, { method: "DELETE", headers: HEADERS });
  if (!res.ok && res.status !== 204) throw await errorOf(res, id);
}

/**
 * One upload with state, for an upload queue. Survives a pause; resume() picks
 * up where it left off. Subscribe to re-render.
 */
export class UgcUploadTask {
  state: "idle" | "uploading" | "paused" | "done" | "error" | "cancelled" = "idle";
  progress: UgcUploadProgress;
  id: string | null = null;
  error: UgcUploadError | null = null;
  result: UgcUploadResult | null = null;
  private ctrl: AbortController | null = null;
  private listeners = new Set<(t: UgcUploadTask) => void>();

  constructor(
    public file: File,
    private opts: Omit<UgcUploadOptions, "signal" | "onProgress" | "onStarted">,
  ) {
    this.progress = { phase: "starting", fraction: 0, sentBytes: 0, totalBytes: file.size };
    this.id = pendingUploadId(file, opts);
  }

  subscribe(fn: (t: UgcUploadTask) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** Starts or resumes. Resolves with the result, or null when paused / cancelled / failed. */
  async start(): Promise<UgcUploadResult | null> {
    if (this.state === "uploading" || this.state === "done" || this.state === "cancelled")
      return this.result;
    this.ctrl = new AbortController();
    this.state = "uploading";
    this.error = null;
    this.emit();
    try {
      this.result = await uploadUgcFile(this.file, {
        ...this.opts,
        resumeId: this.id,
        signal: this.ctrl.signal,
        onStarted: (id) => {
          this.id = id;
          this.emit();
        },
        onProgress: (p) => {
          this.progress = p;
          this.emit();
        },
      } as UgcUploadOptions);
      this.state = "done";
      return this.result;
    } catch (e) {
      const err =
        e instanceof UgcUploadError ? e : new UgcUploadError(String((e as Error)?.message ?? e), 0);
      // cancel() may have run while the upload was in flight
      if ((this.state as UgcUploadTask["state"]) !== "cancelled") {
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
    this.state = "cancelled";
    this.ctrl?.abort();
    forgetPendingUpload(this.file, this.opts);
    if (this.id) await cancelUgcUpload(this.id).catch(() => undefined);
    this.emit();
  }
}

/* ---------------------------------------------------------------------------
   Downloads
   --------------------------------------------------------------------------- */

/**
 * Saves a brief asset or a submission. Small files go through a plain link;
 * bigger ones are read in Range pieces (a Netlify function response tops out
 * near 20 MB) and saved from memory.
 */
export async function downloadUgcFile(
  f: { downloadUrl: string; size: number; mime: string; name: string },
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
) {
  if (f.size <= UGC.maxResponseBytes) {
    const a = document.createElement("a");
    a.href = f.downloadUrl;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    opts.onProgress?.(1);
    return;
  }
  saveBlob(await fetchRanged(f.downloadUrl, f, opts), f.name);
}
