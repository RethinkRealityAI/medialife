import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

// Storage for the activated-retail tools (analytics sessions, client links,
// builder projects and uploaded assets).
//
// Production runs on Netlify, where Netlify Blobs is available to every
// function with no setup and no migrations. Local dev (plain `vite dev`) has no
// Blobs context, so the same API falls back to files under .data/ar/.
//
// Data is split by namespace so testing on deploy previews never mixes with
// what real clients do on medialife.ai:
//   prod    — medialife.ai / www.medialife.ai
//   preview — deploy previews and branch deploys (*.netlify.app)
//   dev     — localhost

export type ArNamespace = "prod" | "preview" | "dev";
export type ArKind = "sessions" | "links" | "projects" | "assets" | "chunks";

export function arNamespace(host: string | null | undefined): ArNamespace {
  const h = (host ?? "").toLowerCase().split(":")[0];
  if (h === "medialife.ai" || h === "www.medialife.ai") return "prod";
  if (!h || h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return "dev";
  return "preview";
}

export function namespaceFromRequest(request: Request): ArNamespace {
  // Netlify forwards the public host; fall back to the URL the function saw.
  const fwd = request.headers.get("x-forwarded-host");
  let host = fwd?.split(",")[0]?.trim();
  if (!host) {
    try {
      host = new URL(request.url).host;
    } catch {
      host = "";
    }
  }
  return arNamespace(host);
}

export interface ArStore {
  getJSON<T = unknown>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  getBytes(key: string): Promise<ArrayBuffer | null>;
  setBytes(
    key: string,
    value: ArrayBuffer | Uint8Array,
    metadata?: Record<string, string>,
  ): Promise<void>;
  /** Keys under a prefix ("" for all). */
  list(prefix?: string): Promise<string[]>;
  del(key: string): Promise<void>;
}

type BlobsModule = typeof import("@netlify/blobs");
let blobsMod: Promise<BlobsModule | null> | null = null;
function loadBlobs(): Promise<BlobsModule | null> {
  if (!blobsMod) blobsMod = import("@netlify/blobs").catch(() => null);
  return blobsMod;
}

function netlifyStore(mod: BlobsModule, name: string): ArStore | null {
  let store: ReturnType<BlobsModule["getStore"]>;
  try {
    // strong consistency: analytics appends read-modify-write the session record
    store = mod.getStore({ name, consistency: "strong" });
  } catch {
    return null; // no Blobs context (local dev)
  }
  return {
    async getJSON(key) {
      return ((await store.get(key, { type: "json" })) as never) ?? null;
    },
    async setJSON(key, value) {
      await store.setJSON(key, value);
    },
    async getBytes(key) {
      return (await store.get(key, { type: "arrayBuffer" })) ?? null;
    },
    async setBytes(key, value, metadata) {
      const buf = value instanceof Uint8Array ? value.slice().buffer : value;
      await store.set(key, buf as ArrayBuffer, metadata ? { metadata } : undefined);
    },
    async list(prefix = "") {
      const { blobs } = await store.list(prefix ? { prefix } : undefined);
      return blobs.map((b) => b.key);
    },
    async del(key) {
      await store.delete(key);
    },
  };
}

function fileStore(name: string): ArStore {
  const root = path.join(process.cwd(), ".data", "ar", name);
  // keys may contain "/" (used as folders); keep them inside root
  const file = (key: string) => {
    const safe = key
      .split("/")
      .map((p) => p.replace(/[^a-zA-Z0-9._-]/g, "_"))
      .filter((p) => p && p !== "." && p !== "..")
      .join(path.sep);
    return path.join(root, safe);
  };
  const walk = async (dir: string, base: string): Promise<string[]> => {
    let out: string[] = [];
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return out;
    }
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out = out.concat(await walk(path.join(dir, e.name), rel));
      else out.push(rel);
    }
    return out;
  };
  return {
    async getJSON(key) {
      try {
        return JSON.parse(await fs.readFile(file(key), "utf8"));
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), JSON.stringify(value));
    },
    async getBytes(key) {
      try {
        const b = await fs.readFile(file(key));
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      } catch {
        return null;
      }
    },
    async setBytes(key, value) {
      await fs.mkdir(path.dirname(file(key)), { recursive: true });
      await fs.writeFile(file(key), value instanceof Uint8Array ? value : new Uint8Array(value));
    },
    async list(prefix = "") {
      return (await walk(root, "")).filter((k) => k.startsWith(prefix)).sort();
    },
    async del(key) {
      await fs.rm(file(key), { force: true });
    },
  };
}

const cache = new Map<string, Promise<ArStore>>();

/** The store for one kind of record in one namespace. */
export function arStore(kind: ArKind, ns: ArNamespace): Promise<ArStore> {
  const name = `ar-${kind}-${ns}`;
  let p = cache.get(name);
  if (!p) {
    p = loadBlobs().then((mod) => (mod && netlifyStore(mod, name)) || fileStore(name));
    cache.set(name, p);
  }
  return p;
}
