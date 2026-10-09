/**
 * Browser side of Creator Hub uploads (see src/lib/hub/files.server.ts for the
 * HTTP contract). Used by the creator's Artwork page and the admin.
 *
 * Splits the file into the chunk size the server asks for, sends chunks two at
 * a time with a retry each, and reports progress as a 0–1 fraction.
 */
import type { FileKind, HubFile } from "./model";

export type UploadOptions = {
  kind: FileKind;
  category: string;
  productId?: string | null;
  note?: string;
  /** Admin uploads name the creator; creators always upload to themselves. */
  creatorId?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

const HEADERS = { "x-hub": "1" };

async function errorText(res: Response) {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Upload failed (${res.status})`;
  } catch {
    return `Upload failed (${res.status})`;
  }
}

export async function uploadHubFile(file: File, opts: UploadOptions): Promise<HubFile> {
  const init = await fetch("/api/hub/files", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      mime: file.type,
      kind: opts.kind,
      category: opts.category,
      productId: opts.productId ?? null,
      note: opts.note ?? "",
      creatorId: opts.creatorId,
    }),
    signal: opts.signal,
  });
  if (!init.ok) throw new Error(await errorText(init));
  const { id, creatorId, chunkSize, chunks } = (await init.json()) as {
    id: string;
    creatorId: string;
    chunkSize: number;
    chunks: number;
  };

  let done = 0;
  opts.onProgress?.(0);
  const send = async (n: number) => {
    const body = file.slice(n * chunkSize, Math.min(file.size, (n + 1) * chunkSize));
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`/api/hub/files/${creatorId}/${id}/chunks/${n}`, {
        method: "PUT",
        headers: { ...HEADERS, "content-type": "application/octet-stream" },
        body,
        signal: opts.signal,
      });
      if (res.ok) break;
      if (attempt >= 2 || res.status < 500) throw new Error(await errorText(res));
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
    done++;
    opts.onProgress?.(done / chunks);
  };

  let next = 0;
  const worker = async () => {
    while (next < chunks) await send(next++);
  };
  await Promise.all([worker(), worker()]);

  const complete = await fetch(`/api/hub/files/${creatorId}/${id}/complete`, {
    method: "POST",
    headers: HEADERS,
    signal: opts.signal,
  });
  if (!complete.ok) throw new Error(await errorText(complete));
  return ((await complete.json()) as { file: HubFile }).file;
}

export async function deleteHubFile(f: Pick<HubFile, "creatorId" | "id">) {
  const res = await fetch(`/api/hub/files/${f.creatorId}/${f.id}`, {
    method: "DELETE",
    headers: HEADERS,
  });
  if (!res.ok && res.status !== 204) throw new Error(await errorText(res));
}

export const formatBytes = (n: number) =>
  n >= 1_048_576
    ? `${(n / 1_048_576).toFixed(1)} MB`
    : n >= 1024
      ? `${Math.round(n / 1024)} KB`
      : `${n} B`;

/** For <input accept>. Mirrors ALLOWED in files.server.ts. */
export const UPLOAD_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.pdf,.mp4,.mov,.zip,.psd,.ai,.eps,.otf,.ttf,.woff,.woff2";
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.avif,.svg";
