import process from "node:process";

import { UGC, type UgcStorageKind, type UgcStorageRef } from "./model";
import { ugcFileStore, type UgcNamespace } from "./store.server";

// Where UGC file bytes live, behind one small interface so the backend can
// change without touching the upload API, the records or the pages.
//
// v1: Netlify Blobs, through the same 4 MB chunk pipeline as the Creator Hub
// (each chunk is its own blob, "<key>/<0000>"; downloads stream the chunks back
// and answer Range requests in ≤16 MB pieces).
//
// TODO(r2): Cloudflare R2 with S3 presigned multipart, so bytes never pass
// through a Netlify function. To add it:
//   1. Implement UgcStorage with kind "r2": `plan()` returns
//      { mode: "presigned-multipart", partBytes, uploadId } after
//      CreateMultipartUpload; add `presignParts(ref, partNumbers)` and
//      `completeMultipart(ref, etags)`; `readHead` does a ranged GET of the first
//      bytes for sniffUgc(); `stream` becomes a 302 to a short-lived presigned GET.
//   2. Env: UGC_STORAGE=r2, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//      R2_BUCKET (bucket CORS limited to the medialife.ai origins).
//   3. The client helper (upload-client.ts) already branches on `plan.mode`;
//      add the presigned branch there (PUT parts straight to R2, keep ETags in
//      localStorage for resume).
// Records keep `storage: { kind, key }`, so blobs and r2 files can coexist.

export type UploadPlan =
  | { mode: "chunks"; chunkSize: number; chunks: number }
  /** Not implemented yet (see TODO above). */
  | { mode: "presigned-multipart"; partBytes: number; parts: number; uploadId: string };

export interface UgcStorage {
  readonly kind: UgcStorageKind;
  /** How the client should send a file of this size. */
  plan(ref: UgcStorageRef, size: number): Promise<UploadPlan>;
  /** Stores chunk n (chunks mode). */
  putChunk(ref: UgcStorageRef, n: number, bytes: Uint8Array): Promise<void>;
  /** Chunk indexes received so far (for resume and for completing). */
  receivedChunks(ref: UgcStorageRef): Promise<Set<number>>;
  /** The first bytes of the file, for the magic-byte check. */
  readHead(ref: UgcStorageRef, bytes?: number): Promise<Uint8Array | null>;
  /** Bytes start..end (inclusive) as a stream. */
  stream(ref: UgcStorageRef, start: number, end: number): ReadableStream<Uint8Array>;
  /** Deletes every byte of the file. */
  remove(ref: UgcStorageRef, chunks: number): Promise<void>;
  /** Small single objects (posters). */
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  getObject(key: string): Promise<ArrayBuffer | null>;
  removeObject(key: string): Promise<void>;
}

const chunkKey = (key: string, n: number) => `${key}/${String(n).padStart(4, "0")}`;

class BlobsStorage implements UgcStorage {
  readonly kind = "blobs" as const;
  constructor(private ns: UgcNamespace) {}

  private store() {
    return ugcFileStore(this.ns);
  }

  async plan(_ref: UgcStorageRef, size: number): Promise<UploadPlan> {
    return {
      mode: "chunks",
      chunkSize: UGC.chunkBytes,
      chunks: Math.max(1, Math.ceil(size / UGC.chunkBytes)),
    };
  }

  async putChunk(ref: UgcStorageRef, n: number, bytes: Uint8Array) {
    await (await this.store()).setBytes(chunkKey(ref.key, n), bytes);
  }

  async receivedChunks(ref: UgcStorageRef) {
    const keys = await (await this.store()).list(`${ref.key}/`);
    return new Set(keys.map((k) => Number(k.slice(ref.key.length + 1))).filter(Number.isInteger));
  }

  async readHead(ref: UgcStorageRef, bytes = 64) {
    const buf = await (await this.store()).getBytes(chunkKey(ref.key, 0));
    return buf ? new Uint8Array(buf.slice(0, bytes)) : null;
  }

  stream(ref: UgcStorageRef, start: number, end: number) {
    const cs = UGC.chunkBytes;
    const firstChunk = Math.floor(start / cs);
    const last = Math.floor(end / cs);
    let n = firstChunk;
    const storeP = this.store();
    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const buf = await (await storeP).getBytes(chunkKey(ref.key, n));
        if (!buf) return controller.error(new Error("missing chunk"));
        const from = n === firstChunk ? start - n * cs : 0;
        const to = n === last ? end - n * cs + 1 : buf.byteLength;
        controller.enqueue(new Uint8Array(buf, from, to - from));
        n++;
        if (n > last) controller.close();
      },
    });
  }

  async remove(ref: UgcStorageRef, chunks: number) {
    const store = await this.store();
    // also anything past `chunks` that a misbehaving client managed to write
    const keys = new Set(await store.list(`${ref.key}/`));
    for (let n = 0; n < chunks; n++) keys.add(chunkKey(ref.key, n));
    await Promise.all([...keys].map((k) => store.del(k)));
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

/** The configured backend for new uploads (UGC_STORAGE, default "blobs"). */
export function configuredStorageKind(): UgcStorageKind {
  const k = (process.env.UGC_STORAGE ?? "blobs").trim().toLowerCase();
  if (k === "r2") {
    console.warn("[ugc-hub] UGC_STORAGE=r2 is not implemented yet; using Netlify Blobs");
  }
  return "blobs";
}

/** The backend that holds a given file (by its record's storage.kind). */
export function ugcStorage(ns: UgcNamespace, kind: UgcStorageKind = "blobs"): UgcStorage {
  if (kind === "r2") throw new Error("R2 storage is not implemented yet (see storage.server.ts)");
  return new BlobsStorage(ns);
}
