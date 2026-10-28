import process from "node:process";

import { MEDIA, type MediaStorageKind, type MediaStorageRef } from "./model";
import { mediaFileStore, type MediaNamespace } from "./store.server";

// Where Media Library bytes live, behind one small interface so the backend
// can change without touching the upload API, the records or the pages. Same
// shape as the UGC Hub's UgcStorage (src/lib/ugc/storage.server.ts).
//
// v1: Netlify Blobs, through the Creator Hub's 4 MB chunk pipeline: each chunk
// is its own blob ("<key>/<0000>"), so a 5 GB file never meets the per-object
// limit; downloads stream the chunks back and answer Range requests in ≤16 MB
// pieces.
//
// TODO(r2): Cloudflare R2 with S3 presigned multipart, so bytes never pass
// through a Netlify function:
//   1. Implement MediaStorage with kind "r2": `plan()` returns
//      { mode: "presigned-multipart", partBytes, parts, uploadId } after
//      CreateMultipartUpload; add `presignParts(ref, partNumbers)` and
//      `completeMultipart(ref, etags)`; `readHead` is a ranged GET for
//      sniffMedia(); `stream` becomes a 302 to a short-lived presigned GET (and
//      public files can be served from an R2 custom domain).
//   2. Env: MEDIA_STORAGE=r2, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
//      R2_SECRET_ACCESS_KEY, R2_MEDIA_BUCKET (CORS limited to medialife.ai).
//   3. upload-client.ts already branches on `plan.mode`; add the presigned
//      branch there (PUT parts straight to R2, keep ETags for resume).
// Records keep `storage: { kind, key }`, so blobs and r2 files can coexist.

export type UploadPlan =
  | { mode: "chunks"; chunkSize: number; chunks: number }
  /** Not implemented yet (see TODO above). */
  | { mode: "presigned-multipart"; partBytes: number; parts: number; uploadId: string };

export interface MediaStorage {
  readonly kind: MediaStorageKind;
  /** How the client should send a file of this size. */
  plan(ref: MediaStorageRef, size: number): Promise<UploadPlan>;
  /** Stores chunk n (chunks mode). */
  putChunk(ref: MediaStorageRef, n: number, bytes: Uint8Array): Promise<void>;
  /** Chunk indexes received so far (for resume and for completing). */
  receivedChunks(ref: MediaStorageRef): Promise<Set<number>>;
  /** The first bytes of the file, for the magic-byte check and dimensions. */
  readHead(ref: MediaStorageRef, bytes: number): Promise<Uint8Array | null>;
  /** Bytes start..end (inclusive) as a stream. */
  stream(ref: MediaStorageRef, start: number, end: number): ReadableStream<Uint8Array>;
  /** Deletes every byte of the file. */
  remove(ref: MediaStorageRef, chunks: number): Promise<void>;
  /** Small single objects (thumbnails). */
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  getObject(key: string): Promise<ArrayBuffer | null>;
  removeObject(key: string): Promise<void>;
}

const chunkKey = (key: string, n: number) => `${key}/${String(n).padStart(5, "0")}`;

class BlobsStorage implements MediaStorage {
  readonly kind = "blobs" as const;
  constructor(private ns: MediaNamespace) {}

  private store() {
    return mediaFileStore(this.ns);
  }

  async plan(_ref: MediaStorageRef, size: number): Promise<UploadPlan> {
    return {
      mode: "chunks",
      chunkSize: MEDIA.chunkBytes,
      chunks: Math.max(1, Math.ceil(size / MEDIA.chunkBytes)),
    };
  }

  async putChunk(ref: MediaStorageRef, n: number, bytes: Uint8Array) {
    await (await this.store()).setBytes(chunkKey(ref.key, n), bytes);
  }

  async receivedChunks(ref: MediaStorageRef) {
    const keys = await (await this.store()).list(`${ref.key}/`);
    return new Set(keys.map((k) => Number(k.slice(ref.key.length + 1))).filter(Number.isInteger));
  }

  async readHead(ref: MediaStorageRef, bytes: number) {
    const buf = await (await this.store()).getBytes(chunkKey(ref.key, 0));
    return buf ? new Uint8Array(buf.slice(0, bytes)) : null;
  }

  stream(ref: MediaStorageRef, start: number, end: number) {
    const cs = MEDIA.chunkBytes;
    const first = Math.floor(start / cs);
    const last = Math.floor(end / cs);
    let n = first;
    const storeP = this.store();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const buf = await (await storeP).getBytes(chunkKey(ref.key, n));
        if (!buf) return controller.error(new Error("missing chunk"));
        const from = n === first ? start - n * cs : 0;
        const to = n === last ? end - n * cs + 1 : buf.byteLength;
        controller.enqueue(new Uint8Array(buf, from, to - from));
        n++;
        if (n > last) controller.close();
      },
    });
  }

  async remove(ref: MediaStorageRef, chunks: number) {
    const store = await this.store();
    // also anything past `chunks` that a misbehaving client managed to write
    const keys = new Set(await store.list(`${ref.key}/`));
    for (let n = 0; n < chunks; n++) keys.add(chunkKey(ref.key, n));
    const all = [...keys];
    for (let i = 0; i < all.length; i += 50)
      await Promise.all(all.slice(i, i + 50).map((k) => store.del(k)));
  }

  async putObject(key: string, bytes: Uint8Array) {
    await (await this.store()).setBytes(key, bytes);
  }

  async getObject(key: string) {
    return (await this.store()).getBytes(key);
  }

  async removeObject(key: string) {
    await (await this.store()).del(key);
  }
}

/** The configured backend for new uploads (MEDIA_STORAGE, default "blobs"). */
export function configuredMediaStorage(): MediaStorageKind {
  const k = (process.env.MEDIA_STORAGE ?? "blobs").trim().toLowerCase();
  if (k === "r2")
    console.warn("[media] MEDIA_STORAGE=r2 is not implemented yet; using Netlify Blobs");
  return "blobs";
}

/** The backend that holds a given file (by its record's storage.kind). */
export function mediaStorage(ns: MediaNamespace, kind: MediaStorageKind = "blobs"): MediaStorage {
  if (kind === "r2") throw new Error("R2 storage is not implemented yet (see storage.server.ts)");
  return new BlobsStorage(ns);
}
