import { purgeDemoContentCache } from "./cdn.server";
import {
  demoContentSchema,
  emptyDemoDoc,
  normalizeDemoContent,
  type DemoContent,
  type DemoContentDoc,
} from "./demo-content";
import type { DemoId } from "./demo-tours";
import { arStore, type ArNamespace } from "./store.server";

// Tour-copy overrides for the live demos: one DemoContentDoc per demo in the
// "content" store, key "<demo>.json". The draft autosaves; publishing copies it to
// `published`, which the pages fetch from GET /api/ar/demo-content/<demo>.

const key = (demo: DemoId) => `${demo}.json`;
const store = (ns: ArNamespace) => arStore("content", ns);

export async function readDemoContent(ns: ArNamespace, demo: DemoId): Promise<DemoContentDoc> {
  return (await (await store(ns)).getJSON<DemoContentDoc>(key(demo))) ?? emptyDemoDoc();
}

async function write(ns: ArNamespace, demo: DemoId, doc: DemoContentDoc) {
  await (await store(ns)).setJSON(key(demo), doc);
}

const bump = (doc: DemoContentDoc) => Math.max(Date.now(), doc.updatedAt + 1);

export type DemoSaveResult =
  | { ok: true; doc: DemoContentDoc }
  | { ok: false; error: "invalid"; message: string }
  | { ok: false; error: "conflict"; updatedAt: number };

/**
 * Store a draft. `base` is the updatedAt the editor last saw; a save from another
 * tab in between is refused (unless `force`) instead of silently overwritten.
 */
export async function saveDemoDraft(
  ns: ArNamespace,
  demo: DemoId,
  input: unknown,
  opts: { base?: number; force?: boolean } = {},
): Promise<DemoSaveResult> {
  const parsed = demoContentSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: "invalid", message: `${i.path.join(".")}: ${i.message}` };
  }
  const doc = await readDemoContent(ns, demo);
  if (!opts.force && opts.base != null && opts.base !== doc.updatedAt) {
    return { ok: false, error: "conflict", updatedAt: doc.updatedAt };
  }
  doc.draft = normalizeDemoContent(demo, parsed.data);
  doc.updatedAt = bump(doc);
  await write(ns, demo, doc);
  return { ok: true, doc };
}

export async function publishDemoContent(ns: ArNamespace, demo: DemoId): Promise<DemoContentDoc> {
  const doc = await readDemoContent(ns, demo);
  doc.published = normalizeDemoContent(demo, doc.draft);
  doc.publishedAt = Date.now();
  doc.updatedAt = bump(doc);
  await write(ns, demo, doc);
  await purgeDemoContentCache(demo);
  return doc;
}

/** Clients see the page's own copy again; the draft stays for later. */
export async function unpublishDemoContent(ns: ArNamespace, demo: DemoId): Promise<DemoContentDoc> {
  const doc = await readDemoContent(ns, demo);
  doc.published = null;
  doc.publishedAt = null;
  doc.updatedAt = bump(doc);
  await write(ns, demo, doc);
  await purgeDemoContentCache(demo);
  return doc;
}

/** Throw away the draft: back to what is live ("published") or to the page's own copy. */
export async function resetDemoDraft(
  ns: ArNamespace,
  demo: DemoId,
  to: "published" | "defaults",
): Promise<DemoContentDoc> {
  const doc = await readDemoContent(ns, demo);
  doc.draft = to === "published" && doc.published ? structuredClone(doc.published) : {};
  doc.updatedAt = bump(doc);
  await write(ns, demo, doc);
  return doc;
}

export const publicDemoContent = (doc: DemoContentDoc): DemoContent => doc.published ?? {};
