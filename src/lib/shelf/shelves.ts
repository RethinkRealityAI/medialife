import { z } from "zod";

import { BACKDROPS, DEFAULT_SHELF, type ShelfConfig } from "./config";

// Shared by /admin/shelves and the server (src/lib/shelf/shelves.server.ts):
// slug rules, the stored record's shape, and the quick-link builder.
//
// A shelf's demo id (analytics, client links) is "shelf:<slug>"; the quick-link
// page /shelf is the built-in demo "merch-shelf".

/** 2–40 characters: lowercase letters, numbers and dashes, no dash at either end. */
export const SHELF_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;

/** Slugs that would read as part of the site rather than a creator's name. */
export const RESERVED_SHELF_SLUGS: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "default",
  "draft",
  "drafts",
  "edit",
  "embed",
  "index",
  "login",
  "logout",
  "medialife",
  "merch-shelf",
  "new",
  "null",
  "preview",
  "settings",
  "shelf",
  "shelves",
  "static",
  "undefined",
  "vendor",
]);

export const shelfSlugSchema = z
  .string()
  .regex(SHELF_SLUG_RE, "2–40 lowercase letters, numbers and dashes")
  .refine((s) => !RESERVED_SHELF_SLUGS.has(s), "That word is reserved. Try another.");

export const isValidShelfSlug = (s: string) => shelfSlugSchema.safeParse(s).success;

/** "Pixel Pine × Snowday" → "pixel-pine-snowday" (may still need checking). */
export function shelfSlugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

/** While typing: lowercase, dashes for anything else, trailing dash allowed. */
export const cleanShelfSlugInput = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40);

export interface ShelfDoc {
  slug: string;
  /** internal label, e.g. "PixelPine · Snowday outreach" */
  name: string;
  draft: ShelfConfig;
  published: ShelfConfig | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** the 1200×630 og:image taken from the preview on publish */
  snapshotAssetId: string | null;
}

export type ShelfStatus = "draft" | "published" | "changed";

export interface ShelfSummary {
  slug: string;
  name: string;
  creator: string;
  handle: string;
  neon: string;
  status: ShelfStatus;
  /** "/api/ar/asset/<id>" or null */
  snapshot: string | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export const shelfDemoId = (slug: string) => `shelf:${slug}`;
export const SHELF_QUICK_DEMO = "merch-shelf";

export const shelfPath = (slug: string) => `/shelf/${slug}`;
/** The static page, for the editor's live preview. index.html spelled out: the dev
 *  server redirects "/merch-shelf/" to "/merch-shelf" (a 404), Netlify serves either. */
export const SHELF_PREVIEW_URL = "/merch-shelf/index.html?preview=1";
/** The draft in a new tab (?notrack=1 keeps the team's own visits out of analytics). */
export const shelfDraftHref = (slug: string) => `/shelf/${slug}?draft=1&notrack=1`;
/** /admin/links set up to make a personal link to this shelf. */
export const shelfLinkHref = (slug: string) =>
  `/admin/links?demo=${encodeURIComponent(shelfDemoId(slug))}`;

// ---------------------------------------------------------------------------
// Quick links: /shelf?name=PixelPine&neon=ff37ae&invite=snowday
// ---------------------------------------------------------------------------

/**
 * URL parameters the page reads at /shelf. Anything left out falls back to
 * DEFAULT_SHELF. Colours are 6-digit hex without "#".
 */
export const QUICK_LINK_PARAMS = {
  name: "Name on the neon sign (≤ 28 characters)",
  handle: "Handle under the sign, e.g. @pixelpine",
  neon: "Neon colour, hex without #",
  accent: "Accent colour, hex without #",
  backdrop: `One of ${BACKDROPS.join(", ")}`,
  invite: "Creator Hub invite code, carried to the application",
  for: "“Prepared for …” on the intro card",
  by: "“Presented by …” line, text only",
  shelf: "Shelf finish: walnut, black, white or maple",
  logo: "Logo as a site path (/api/ar/asset/<id>) or https URL",
  audience: "Starting audience for the earnings estimator",
  products: "Comma-separated product types to show, in order, e.g. tee,hoodie,cap",
} as const;

export interface QuickLinkInput {
  name?: string;
  handle?: string;
  neon?: string;
  accent?: string;
  backdrop?: string;
  invite?: string;
  for?: string;
  by?: string;
}

const hexParam = (v: string | undefined) => {
  const h = (v ?? "").trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(h) ? h : "";
};

/** "/shelf?name=…" with only the parameters that differ from the default shelf. */
export function quickLinkPath(input: QuickLinkInput): string {
  const p = new URLSearchParams();
  const name = (input.name ?? "").trim().slice(0, 28);
  if (name) p.set("name", name);
  const handle = (input.handle ?? "").trim().slice(0, 40);
  if (handle) p.set("handle", handle);
  const neon = hexParam(input.neon);
  if (neon && `#${neon}` !== DEFAULT_SHELF.theme.neon) p.set("neon", neon);
  const accent = hexParam(input.accent);
  if (accent && `#${accent}` !== DEFAULT_SHELF.theme.accent) p.set("accent", accent);
  if (
    input.backdrop &&
    (BACKDROPS as readonly string[]).includes(input.backdrop) &&
    input.backdrop !== DEFAULT_SHELF.theme.backdrop
  )
    p.set("backdrop", input.backdrop);
  const invite = (input.invite ?? "").trim().toLowerCase();
  if (/^[a-z0-9-]{2,40}$/.test(invite)) p.set("invite", invite);
  const forName = (input.for ?? "").trim().slice(0, 60);
  if (forName) p.set("for", forName);
  const by = (input.by ?? "").trim().slice(0, 60);
  if (by) p.set("by", by);
  const qs = p.toString().replace(/\+/g, "%20");
  return qs ? `/shelf?${qs}` : "/shelf";
}

// ---------------------------------------------------------------------------
// Theme presets for the editor
// ---------------------------------------------------------------------------

export const THEME_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  neon: string;
  accent: string;
  backdrop: ShelfConfig["theme"]["backdrop"];
  shelf: ShelfConfig["theme"]["shelf"];
}> = [
  {
    id: "medialife",
    label: "MEDIALIFE",
    neon: "#ff37ae",
    accent: "#19affe",
    backdrop: "midnight",
    shelf: "walnut",
  },
  {
    id: "snowday",
    label: "Snowday",
    neon: "#8fd8ff",
    accent: "#e9f6ff",
    backdrop: "snow",
    shelf: "black",
  },
  {
    id: "sunset",
    label: "Sunset",
    neon: "#ff8a3d",
    accent: "#ffd166",
    backdrop: "sunset",
    shelf: "maple",
  },
  {
    id: "arcade",
    label: "Arcade",
    neon: "#7cff4f",
    accent: "#b45cff",
    backdrop: "arcade",
    shelf: "black",
  },
  {
    id: "mono",
    label: "Mono",
    neon: "#f4f4f6",
    accent: "#9aa0ad",
    backdrop: "midnight",
    shelf: "black",
  },
];
