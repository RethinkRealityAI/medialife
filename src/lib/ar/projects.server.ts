import { releaseGenerated } from "./assets.server";
import { gateHash, projectSchema, type Project, type ProjectDoc } from "./project";
import {
  assetIdFromRef,
  blankProject,
  fromTemplate,
  isValidSlug,
  parseDraft,
  projectIssues,
  sameJSON,
  type Issue,
  type ProjectSummary,
} from "./projects";
import { arStore, type ArNamespace } from "./store.server";

// Builder projects: one ProjectDoc per endcap in the "projects" store, key
// "<slug>.json". The draft autosaves; publishing copies it to `published`, which
// is what /x/<slug> serves.

const docKey = (slug: string) => `${slug}.json`;
const store = (ns: ArNamespace) => arStore("projects", ns);

type Fail<E extends string = string> = { ok: false; error: E; issues?: Issue[] };

export async function readProject(ns: ArNamespace, slug: string): Promise<ProjectDoc | null> {
  if (!isValidSlug(slug)) return null;
  return (await store(ns)).getJSON<ProjectDoc>(docKey(slug));
}

async function writeProject(ns: ArNamespace, doc: ProjectDoc) {
  await (await store(ns)).setJSON(docKey(doc.slug), doc);
}

export function hasUnpublishedChanges(doc: ProjectDoc): boolean {
  return !!doc.published && !sameJSON(doc.draft, doc.published);
}

export function summarize(doc: ProjectDoc): ProjectSummary {
  const changed = hasUnpublishedChanges(doc);
  return {
    slug: doc.slug,
    name: doc.draft?.name || doc.slug,
    client: doc.draft?.client || null,
    thumb: doc.thumb,
    publishedAt: doc.publishedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    hasUnpublishedChanges: changed,
    status: !doc.published ? "draft" : changed ? "changed" : "published",
  };
}

export async function listProjects(ns: ArNamespace): Promise<ProjectSummary[]> {
  const s = await store(ns);
  const keys = (await s.list("")).filter((k) => /^[a-z0-9-]+\.json$/.test(k));
  const docs = await Promise.all(keys.map((k) => s.getJSON<ProjectDoc>(k)));
  return docs
    .filter((d): d is ProjectDoc => !!d?.draft)
    .map(summarize)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** First free slug from `base`: base, base-2, base-3… */
export async function freeSlug(ns: ArNamespace, base: string): Promise<string> {
  const root = base.slice(0, 44).replace(/-+$/, "") || "endcap";
  for (let i = 1; i < 500; i++) {
    const slug = i === 1 ? root : `${root}-${i}`;
    if (!(await readProject(ns, slug))) return slug;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createProject(
  ns: ArNamespace,
  input: { slug: string; name: string; client?: string; source?: unknown },
): Promise<{ ok: true; doc: ProjectDoc } | Fail<"bad-slug" | "taken" | "invalid">> {
  if (!isValidSlug(input.slug)) return { ok: false, error: "bad-slug" };
  if (await readProject(ns, input.slug)) return { ok: false, error: "taken" };
  const base =
    input.source != null
      ? fromTemplate(input.source, input)
      : {
          ...blankProject(input.slug, input.name),
          ...(input.client ? { client: input.client } : {}),
        };
  const parsed = parseDraft(base);
  if (!parsed.ok) return { ok: false, error: "invalid", issues: parsed.issues };
  const now = Date.now();
  const doc: ProjectDoc = {
    slug: input.slug,
    draft: parsed.draft,
    published: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    thumb: null,
  };
  await writeProject(ns, doc);
  return { ok: true, doc };
}

export type SaveResult =
  | { ok: true; updatedAt: number; issues: Issue[]; summary: ProjectSummary }
  | Fail<"not-found" | "invalid">
  | { ok: false; error: "conflict"; updatedAt: number };

/**
 * Store a draft. `base` is the updatedAt the editor last saw: when someone else
 * saved in between, the save is refused (unless `force`) so edits in two tabs
 * never silently overwrite each other.
 */
export async function saveDraft(
  ns: ArNamespace,
  slug: string,
  input: unknown,
  opts: { base?: number; force?: boolean } = {},
): Promise<SaveResult> {
  const doc = await readProject(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  if (!opts.force && opts.base != null && opts.base !== doc.updatedAt) {
    return { ok: false, error: "conflict", updatedAt: doc.updatedAt };
  }
  if (!input || typeof input !== "object") return { ok: false, error: "invalid" };
  const parsed = parseDraft({ ...(input as object), slug });
  if (!parsed.ok) return { ok: false, error: "invalid", issues: parsed.issues };
  doc.draft = parsed.draft;
  // strictly increasing, so the conflict check can't miss a save in the same ms
  doc.updatedAt = Math.max(Date.now(), doc.updatedAt + 1);
  await writeProject(ns, doc);
  return { ok: true, updatedAt: doc.updatedAt, issues: parsed.issues, summary: summarize(doc) };
}

export async function duplicateProject(
  ns: ArNamespace,
  slug: string,
): Promise<{ ok: true; summary: ProjectSummary } | Fail<"not-found">> {
  const doc = await readProject(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  const copySlug = await freeSlug(ns, `${slug}-copy`);
  const name = `${doc.draft.name} (copy)`.slice(0, 80);
  const now = Date.now();
  const copy: ProjectDoc = {
    slug: copySlug,
    draft: { ...structuredClone(doc.draft), slug: copySlug, name },
    published: null,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    thumb: doc.thumb,
  };
  await writeProject(ns, copy);
  return { ok: true, summary: summarize(copy) };
}

/** Change the slug; only while the endcap has never been published (its link may be out). */
export async function renameProject(
  ns: ArNamespace,
  from: string,
  to: string,
): Promise<{ ok: true; doc: ProjectDoc } | Fail<"not-found" | "bad-slug" | "taken" | "published">> {
  const doc = await readProject(ns, from);
  if (!doc) return { ok: false, error: "not-found" };
  if (from === to) return { ok: true, doc };
  if (doc.published || doc.publishedAt) return { ok: false, error: "published" };
  if (!isValidSlug(to)) return { ok: false, error: "bad-slug" };
  if (await readProject(ns, to)) return { ok: false, error: "taken" };
  const moved: ProjectDoc = {
    ...doc,
    slug: to,
    draft: { ...doc.draft, slug: to },
    updatedAt: Math.max(Date.now(), doc.updatedAt + 1),
  };
  await writeProject(ns, moved);
  await (await store(ns)).del(docKey(from));
  return { ok: true, doc: moved };
}

export async function deleteProject(ns: ArNamespace, slug: string): Promise<{ ok: true }> {
  const doc = await readProject(ns, slug);
  if (!doc) return { ok: true };
  await (await store(ns)).del(docKey(slug));
  await releaseGenerated(ns, generatedRefs(doc)).catch(() => {});
  return { ok: true };
}

function generatedRefs(doc: ProjectDoc): (string | undefined | null)[] {
  return [
    doc.thumb,
    doc.draft?.ar?.glb,
    doc.draft?.ar?.usdz,
    doc.published?.ar?.glb,
    doc.published?.ar?.usdz,
  ];
}

export type PublishAR =
  | { mode: "new"; glb: string; usdz: string; generatedAt: number }
  /** keep the AR files the live version already has (or the draft's, after "Regenerate") */
  | { mode: "keep" }
  | { mode: "none" };

export async function publishProject(
  ns: ArNamespace,
  slug: string,
  opts: { ar: PublishAR; thumb?: string | null },
): Promise<{ ok: true; doc: ProjectDoc; summary: ProjectSummary } | Fail<"not-found" | "invalid">> {
  const doc = await readProject(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  const issues = projectIssues(doc.draft);
  if (issues.length) return { ok: false, error: "invalid", issues };

  const draft: Project = structuredClone(doc.draft);
  const pw = draft.access.password?.trim();
  // only the hash ships publicly (publicProject drops the plain password)
  draft.access = pw ? { password: pw, passwordHash: gateHash(pw) } : {};
  if (opts.ar.mode === "new") {
    const { glb, usdz, generatedAt } = opts.ar;
    if (!assetIdFromRef(glb) || !assetIdFromRef(usdz)) return { ok: false, error: "invalid" };
    draft.ar = { glb, usdz, generatedAt };
  } else if (opts.ar.mode === "none") {
    draft.ar = {};
  } else {
    draft.ar = doc.published?.ar?.glb ? { ...doc.published.ar } : { ...(draft.ar ?? {}) };
  }
  const published = projectSchema.parse(draft);

  const before = generatedRefs(doc);
  const now = Date.now();
  doc.draft = published;
  doc.published = published;
  doc.publishedAt = now;
  doc.updatedAt = Math.max(now, doc.updatedAt + 1);
  if (opts.thumb && assetIdFromRef(opts.thumb)) doc.thumb = opts.thumb;
  await writeProject(ns, doc);
  // previous AR files and thumbnail, unless something still uses them
  await releaseGenerated(ns, before).catch(() => {});
  return { ok: true, doc, summary: summarize(doc) };
}

export async function unpublishProject(
  ns: ArNamespace,
  slug: string,
): Promise<{ ok: true; summary: ProjectSummary } | Fail<"not-found">> {
  const doc = await readProject(ns, slug);
  if (!doc) return { ok: false, error: "not-found" };
  // publishedAt stays: the slug has been shared, so it remains locked
  doc.published = null;
  doc.updatedAt = Math.max(Date.now(), doc.updatedAt + 1);
  await writeProject(ns, doc);
  return { ok: true, summary: summarize(doc) };
}
