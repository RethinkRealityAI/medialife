import { json, readGuard, type MediaCaller } from "./auth.server";
import { listAssets } from "./data.server";
import {
  MEDIA,
  MEDIA_KINDS,
  MEDIA_KIND_LABELS,
  MEDIA_ORIENTATIONS,
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_LABELS,
  MEDIA_SORTS,
  MEDIA_TYPES,
  aspectLabel,
  clientPolicy,
  embedSnippet,
  formatBytes,
  formatDuration,
  mediaFacets,
  mediaFileUrl,
  mediaPublicPath,
  mediaThumbUrl,
  orientationOf,
  searchMedia,
  type MediaAsset,
  type MediaFacets,
  type MediaKind,
  type MediaOrientation,
  type MediaPurpose,
  type MediaQuery,
  type MediaSort,
} from "./model";
import type { MediaNamespace } from "./store.server";

// The machine-readable catalogue: /api/media/index.json and /api/media/llms.txt.
// Same records, same filters; built for an LLM or an agent to find the right
// file and use it correctly (rights, AI policy, alt text, public URL).
//
// Auth: the admin cookie, or `Authorization: Bearer $MEDIA_API_TOKEN` (read-only).
// Without either: 401.

export type CatalogRecord = {
  id: string;
  title: string;
  filename: string;
  /** video | image | audio | model | document | archive | font | data */
  type: MediaKind;
  typeLabel: string;
  mime: string;
  size: number;
  sizeLabel: string;
  width: number | null;
  height: number | null;
  aspect: string | null;
  orientation: MediaOrientation | null;
  durationSeconds: number | null;
  tags: string[];
  collection: string | null;
  client: string | null;
  /** A rule for this client's assets that an agent must follow (e.g. no AI generation from them). */
  clientPolicy: string | null;
  purpose: MediaPurpose | null;
  purposeLabel: string | null;
  description: string;
  altText: string;
  usageNotes: string;
  rights: string | null;
  aiGenerated: boolean;
  public: boolean;
  /** Stable, unauthenticated, cacheable URL (Range-capable); null while private. */
  publicUrl: string | null;
  /** Ready-to-paste HTML for a public asset. */
  embedHtml: string | null;
  /** Needs the admin cookie or the bearer token. Supports Range; ?download=1 adds an attachment header. */
  downloadUrl: string;
  thumbnailUrl: string | null;
  color: string | null;
  uploader: string;
  createdAt: string;
  updatedAt: string;
  sample: boolean;
};

export type CatalogPage = {
  library: string;
  generatedAt: string;
  auth: MediaCaller["kind"];
  query: Record<string, string | number | boolean | string[]>;
  total: number;
  count: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  links: { json: string; llms: string; next: string | null };
  howToQuery: string[];
  facets: Omit<MediaFacets, "totalBytes"> & { totalBytes: number };
  items: CatalogRecord[];
};

/** The public origin of the request (Netlify forwards the host the visitor used). */
export function originOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return url.origin;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

const truthy = (v: string | null) =>
  v == null || v === ""
    ? undefined
    : /^(1|true|yes|on)$/i.test(v)
      ? true
      : /^(0|false|no|off)$/i.test(v)
        ? false
        : undefined;

const KIND_ALIASES: Record<string, MediaKind> = {
  "3d": "model",
  glb: "model",
  models: "model",
  pdf: "document",
  doc: "document",
  docs: "document",
  zip: "archive",
  text: "data",
  json: "data",
  csv: "data",
  videos: "video",
  images: "image",
  photo: "image",
  photos: "image",
};

/** Filters from a query string: q, tags (comma list or repeated tag=), type, collection, client, purpose, public, ai, orientation, sort, limit, offset. */
export function parseCatalogQuery(params: URLSearchParams): {
  query: MediaQuery & { mime?: string };
  limit: number;
  offset: number;
} {
  const q = params.get("q")?.trim() || undefined;
  const tags = [...params.getAll("tags"), ...params.getAll("tag")]
    .flatMap((t) => t.split(","))
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
  const rawType = (params.get("type") ?? params.get("kind") ?? "").trim().toLowerCase();
  let kind: MediaKind | undefined;
  let mime: string | undefined;
  if (rawType) {
    if ((MEDIA_KINDS as readonly string[]).includes(rawType)) kind = rawType as MediaKind;
    else if (KIND_ALIASES[rawType]) kind = KIND_ALIASES[rawType];
    else if (MEDIA_TYPES[rawType]) mime = rawType;
    else kind = "__none__" as MediaKind; // unknown type: match nothing rather than everything
  }
  const purposeRaw = params.get("purpose")?.trim().toLowerCase();
  // an unknown purpose matches nothing (like an unknown type), not everything
  const purpose = !purposeRaw
    ? undefined
    : (MEDIA_PURPOSES as readonly string[]).includes(purposeRaw)
      ? (purposeRaw as MediaPurpose)
      : ("__none__" as MediaPurpose);
  const orientationRaw = params.get("orientation")?.trim().toLowerCase();
  const orientation = (MEDIA_ORIENTATIONS as string[]).includes(orientationRaw ?? "")
    ? (orientationRaw as MediaOrientation)
    : undefined;
  const sortRaw = params.get("sort")?.trim();
  const sort = sortRaw && sortRaw in MEDIA_SORTS ? (sortRaw as MediaSort) : undefined;
  const client = params.get("client") ?? params.get("property") ?? undefined;
  const collection = params.get("collection") ?? undefined;
  const limit = Math.min(
    MEDIA.maxPageSize,
    Math.max(1, Math.floor(Number(params.get("limit")) || MEDIA.pageSize)),
  );
  const offset = Math.max(0, Math.floor(Number(params.get("offset")) || 0));
  return {
    query: {
      q,
      tags: tags.length ? tags : undefined,
      kind,
      mime,
      client: client?.trim() ? client.trim() : undefined,
      collection: collection?.trim() ? collection.trim() : undefined,
      purpose,
      public: truthy(params.get("public")),
      aiGenerated: truthy(params.get("ai") ?? params.get("aiGenerated")),
      orientation,
      sort,
    },
    limit,
    offset,
  };
}

export function catalogRecord(a: MediaAsset, origin: string): CatalogRecord {
  const publicUrl = a.public ? `${origin}${mediaPublicPath(a)}` : null;
  const thumb = mediaThumbUrl(a);
  const aspect = aspectLabel(a.width, a.height);
  return {
    id: a.id,
    title: a.title,
    filename: a.name,
    type: a.kind,
    typeLabel: MEDIA_KIND_LABELS[a.kind],
    mime: a.mime,
    size: a.size,
    sizeLabel: formatBytes(a.size),
    width: a.width,
    height: a.height,
    aspect,
    orientation: orientationOf(a.width, a.height),
    durationSeconds: a.durationS,
    tags: a.tags,
    collection: a.collection || null,
    client: a.client || null,
    clientPolicy: clientPolicy(a.client),
    purpose: a.purpose,
    purposeLabel: a.purpose ? MEDIA_PURPOSE_LABELS[a.purpose] : null,
    description: a.description,
    altText: a.description || a.title,
    usageNotes: a.usageNotes,
    rights: a.rights || null,
    aiGenerated: a.aiGenerated,
    public: a.public,
    publicUrl,
    embedHtml: publicUrl ? embedSnippet({ ...a, hasThumb: !!a.thumb }, publicUrl, origin) : null,
    downloadUrl: `${origin}${mediaFileUrl(a.id)}`,
    thumbnailUrl: thumb ? `${origin}${thumb}` : null,
    color: a.color,
    uploader: a.uploader,
    createdAt: new Date(a.createdAt).toISOString(),
    updatedAt: new Date(a.updatedAt).toISOString(),
    sample: !!a.sample,
  };
}

const HOW_TO = [
  "Filter with query parameters: q (words, all must match title/filename/tags/description/client/collection/notes), tags (comma list; all must match), type (video|image|audio|model|document|archive|font|data, or a MIME type), client, collection, purpose (marketing|gameplay|product-shot|logo-brand|ugc|3d-model|audio|doc|other), public (true|false), ai (true|false: AI-generated), orientation (landscape|portrait|square), sort (relevance|new|old|updated|title|size|duration), limit (≤ 5000), offset.",
  "Use publicUrl (or embedHtml) on web pages; it needs no auth and is cacheable. Private files have publicUrl null: ask an admin to make them public, or fetch downloadUrl with the bearer token for development.",
  "Always respect rights, usageNotes and clientPolicy. If clientPolicy says no generative use (EVADE), never feed that file into image-to-image, image-to-video or image-to-3D generation.",
  "Use altText as the alt attribute. aiGenerated tells you whether the asset itself was made with AI.",
];

/** The filtered, paged catalogue. */
export async function catalogPage(
  ns: MediaNamespace,
  caller: MediaCaller,
  request: Request,
): Promise<CatalogPage> {
  const url = new URL(request.url);
  const origin = originOf(request);
  const { query, limit, offset } = parseCatalogQuery(url.searchParams);
  const all = await listAssets(ns);
  const matched = searchMedia(query.mime ? all.filter((a) => a.mime === query.mime) : all, query);
  const items = matched.slice(offset, offset + limit).map((a) => catalogRecord(a, origin));
  const nextOffset = offset + limit < matched.length ? offset + limit : null;
  const shown: CatalogPage["query"] = {};
  for (const [k, v] of Object.entries(query)) if (v !== undefined) shown[k] = v as never;
  const qs = new URLSearchParams(url.searchParams);
  const linkTo = (path: string, extra?: Record<string, string>) => {
    const p = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    const s = p.toString();
    return `${origin}${path}${s ? `?${s}` : ""}`;
  };
  return {
    library: "MEDIALIFE Media Library",
    generatedAt: new Date().toISOString(),
    auth: caller.kind,
    query: shown,
    total: matched.length,
    count: items.length,
    offset,
    limit,
    nextOffset,
    links: {
      json: linkTo("/api/media/index.json"),
      llms: linkTo("/api/media/llms.txt"),
      next:
        nextOffset != null ? linkTo("/api/media/index.json", { offset: String(nextOffset) }) : null,
    },
    howToQuery: HOW_TO,
    facets: mediaFacets(matched),
    items,
  };
}

/** GET /api/media/index.json */
export async function handleIndexJson(ns: MediaNamespace, request: Request) {
  const c = await readGuard(request);
  if (c instanceof Response) return c;
  const page = await catalogPage(ns, c, request);
  return json(page);
}

const md = (s: string) => s.replace(/\s+/g, " ").trim();

/** The catalogue as Markdown, one section per asset. */
export function catalogMarkdown(page: CatalogPage): string {
  const filters = Object.entries(page.query)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
    .join(", ");
  const out: string[] = [
    "# MEDIALIFE Media Library",
    "",
    `> ${page.total} asset${page.total === 1 ? "" : "s"}${filters ? ` matching ${filters}` : ""}. ${page.count ? `Showing ${page.offset + 1}–${page.offset + page.count}.` : "Nothing on this page."} Generated ${page.generatedAt}.`,
    "",
    `JSON with the same filters: ${page.links.json}`,
    ...(page.links.next
      ? [`Next page: ${page.links.next.replace("/index.json", "/llms.txt")}`]
      : []),
    "",
    "## How to use this catalogue",
    "",
    ...page.howToQuery.map((h) => `- ${h}`),
    "",
  ];
  const kinds = Object.entries(page.facets.kinds)
    .map(([k, n]) => `${MEDIA_KIND_LABELS[k as MediaKind]} ${n}`)
    .join(" · ");
  if (page.total) {
    out.push("## Overview", "");
    out.push(`- Types: ${kinds}`);
    if (page.facets.clients.length)
      out.push(
        `- Clients: ${page.facets.clients.map((c) => `${c.value} (${c.count})`).join(", ")}`,
      );
    if (page.facets.collections.length)
      out.push(
        `- Collections: ${page.facets.collections.map((c) => `${c.value} (${c.count})`).join(", ")}`,
      );
    if (page.facets.tags.length)
      out.push(
        `- Tags: ${page.facets.tags
          .slice(0, 40)
          .map((c) => `${c.value} (${c.count})`)
          .join(", ")}`,
      );
    out.push(`- Public: ${page.facets.publicCount} · AI-generated: ${page.facets.aiCount}`, "");
  }
  out.push("## Assets", "");
  if (!page.items.length) out.push("No assets match.", "");
  for (const r of page.items) {
    const facts = [
      r.mime,
      r.width && r.height ? `${r.width}×${r.height}` : null,
      r.aspect,
      r.durationSeconds != null ? formatDuration(r.durationSeconds) : null,
      r.sizeLabel,
    ].filter(Boolean);
    out.push(`### ${md(r.title)} (\`${r.filename}\`)`, "");
    out.push(`- id: ${r.id} · type: ${r.typeLabel} · ${facts.join(" · ")}`);
    const cls = [
      r.client ? `client: ${r.client}` : null,
      r.collection ? `collection: ${r.collection}` : null,
      r.purposeLabel ? `purpose: ${r.purposeLabel}` : null,
      r.orientation ? `orientation: ${r.orientation}` : null,
    ].filter(Boolean);
    if (cls.length) out.push(`- ${cls.join(" · ")}`);
    if (r.tags.length) out.push(`- tags: ${r.tags.join(", ")}`);
    if (r.description) out.push(`- description / alt: ${md(r.description)}`);
    if (r.usageNotes) out.push(`- usage notes: ${md(r.usageNotes)}`);
    out.push(
      `- rights / source: ${r.rights ?? "not recorded"} · AI-generated: ${r.aiGenerated ? "yes" : "no"}${r.sample ? " · sample data" : ""}`,
    );
    if (r.clientPolicy) out.push(`- POLICY: ${r.clientPolicy}`);
    out.push(r.publicUrl ? `- public URL: ${r.publicUrl}` : "- public URL: none (private)");
    out.push(`- download (auth): ${r.downloadUrl}`);
    if (r.thumbnailUrl) out.push(`- thumbnail: ${r.thumbnailUrl}`);
    out.push(
      `- added ${r.createdAt.slice(0, 10)} by ${r.uploader} · updated ${r.updatedAt.slice(0, 10)}`,
      "",
    );
  }
  return out.join("\n");
}

/** GET /api/media/llms.txt */
export async function handleLlmsTxt(ns: MediaNamespace, request: Request) {
  const c = await readGuard(request);
  if (c instanceof Response) return c;
  const page = await catalogPage(ns, c, request);
  return new Response(catalogMarkdown(page), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export { json };
