import type { InitUploadBody } from "@/lib/ar/assets";
import type { AssetMeta } from "@/lib/ar/project";

import { ApiError, completeUploadRequest, initUploadRequest } from "./api";

// Chunked upload: init → PUT each ≤4 MB chunk (XHR, for progress) → complete.
// A chunk that fails on the network or with a 5xx is retried a few times.

function putChunk(
  url: string,
  body: Blob,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-ar-admin", "1");
    xhr.setRequestHeader("content-type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = `Upload failed (${xhr.status})`;
      try {
        msg = JSON.parse(xhr.responseText).error ?? msg;
      } catch {
        /* not JSON */
      }
      reject(
        new ApiError(xhr.status, xhr.status === 401 ? "Your session ended. Sign in again." : msg),
      );
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error while uploading"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function uploadBlob(
  blob: Blob,
  meta: Omit<InitUploadBody, "size">,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<AssetMeta> {
  const { id, chunkSize, chunks } = await initUploadRequest({ ...meta, size: blob.size });
  let done = 0;
  for (let n = 0; n < chunks; n++) {
    const part = blob.slice(n * chunkSize, Math.min(blob.size, (n + 1) * chunkSize));
    for (let attempt = 0; ; attempt++) {
      try {
        await putChunk(
          `/api/ar/admin/assets/${id}/chunks/${n}`,
          part,
          (loaded) => opts.onProgress?.((done + loaded) / blob.size),
          opts.signal,
        );
        break;
      } catch (e) {
        const retryable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
        if (!retryable || attempt >= 3 || opts.signal?.aborted) throw e;
        await wait(600 * 2 ** attempt);
      }
    }
    done += part.size;
    opts.onProgress?.(done / blob.size);
  }
  return completeUploadRequest(id);
}
