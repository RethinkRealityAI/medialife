/**
 * EVADE UGC Hub: the shared model. Client-safe: types, constants, labels and
 * pure helpers only (no storage, no secrets). Server code lives in *.server.ts;
 * the pages call the server functions in *.functions.ts.
 *
 * The loop: applied → approved → package shipped → delivered → content due →
 * submitted → (changes requested →) content approved → posted → perk.
 *
 * See src/lib/ugc/README.md for the contract the UI is built on.
 */
import { HUB, type ShippingAddress } from "@/lib/hub/model";

export type { ShippingAddress } from "@/lib/hub/model";

const GiB = 1024 * 1024 * 1024;

export const UGC = {
  name: "EVADE UGC Hub",
  brand: "EVADE",
  /** Creator-facing app. */
  base: "/ugc-hub",
  /** Admin section. */
  adminBase: "/admin/ugc",
  supportEmail: "creators@medialife.ai",
  /** The Netlify form on the landing page (public/__forms.html). */
  formName: "evade-ugc-creator",
  /** Hard limit per uploaded file (creator submissions and admin brief assets). 2 GiB. */
  maxFileBytes: 2 * GiB,
  /** Hard limit per creator, all campaigns, completed + in-progress uploads. 5 GiB. */
  quotaBytes: 5 * GiB,
  /** Guidance shown to creators ("keep each file under ~1 GB"). */
  recommendedFileBytes: 1 * GiB,
  /** Same chunk size as the Creator Hub: keeps each request under Netlify's 6 MB body limit. */
  chunkBytes: HUB.chunkBytes,
  /** Largest single download response; players and downloads page through with Range. */
  maxResponseBytes: HUB.maxResponseBytes,
  /** Poster frames (client-extracted JPEG/PNG/WebP). */
  maxPosterBytes: 2 * 1024 * 1024,
  /** An upload still "uploading" this long after it started is stale and is cleared. */
  staleUploadMs: 48 * 60 * 60 * 1000,
  /** Shipping address is purged this long after delivery. */
  piiPurgeAfterDeliveryMs: 90 * 24 * 60 * 60 * 1000,
  /** Magic sign-in link lifetime, and the join link sent on approval. */
  loginLinkTtlMs: 30 * 60 * 1000,
  joinLinkTtlMs: 7 * 24 * 60 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,
  /** Comment length. */
  maxCommentChars: 2000,
} as const;

/** Every page the UI builds. Server code links to these (emails, next actions). */
export const UGC_ROUTES = {
  signIn: "/ugc-hub/sign-in",
  checkEmail: "/ugc-hub/check-email",
  /** Landing page for emailed sign-in and join links: /ugc-hub/auth?token=… */
  auth: "/ugc-hub/auth",
  home: "/ugc-hub",
  brief: "/ugc-hub/brief",
  assets: "/ugc-hub/assets",
  upload: "/ugc-hub/upload",
  perks: "/ugc-hub/perks",
  profile: "/ugc-hub/profile",
  admin: "/admin/ugc",
  adminCreator: (id: string) => `/admin/ugc/creators/${id}`,
  adminCampaigns: "/admin/ugc/campaigns",
  adminCampaign: (id: string) => `/admin/ugc/campaigns/${id}`,
  adminShipping: "/admin/ugc/shipping",
  adminReview: "/admin/ugc/review",
  adminImport: "/admin/ugc/import",
} as const;

/* ---------------------------------------------------------------------------
   Platforms
   --------------------------------------------------------------------------- */

/** The six platforms on the sign-up form, in its order. */
export const UGC_PLATFORMS = ["roblox", "instagram", "youtube", "discord", "x", "tiktok"] as const;
export type UgcPlatform = (typeof UGC_PLATFORMS)[number];

export const UGC_PLATFORM_LABELS: Record<UgcPlatform, string> = {
  roblox: "Roblox",
  instagram: "Instagram",
  youtube: "YouTube",
  discord: "Discord",
  x: "X",
  tiktok: "TikTok",
};

/** Where a submission will be posted. */
export const UGC_POST_PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "x",
  "roblox",
  "other",
] as const;
export type UgcPostPlatform = (typeof UGC_POST_PLATFORMS)[number];
export const UGC_POST_PLATFORM_LABELS: Record<UgcPostPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram Reels",
  youtube: "YouTube Shorts",
  x: "X",
  roblox: "Roblox",
  other: "Other",
};

/** Audience bands offered on the sign-up form. */
export const UGC_AUDIENCE_BANDS = ["Under 1K", "1K–10K", "10K–50K", "50K–250K", "250K+"] as const;

/** A link to a handle, best effort (handles are stored as the form sent them). */
export function ugcHandleUrl(platform: UgcPlatform, handle: string): string | null {
  const h = handle.trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  if (/^(www\.)?(youtube\.com|youtu\.be|roblox\.com)\//i.test(h)) return `https://${h}`;
  const bare = h.replace(/^@+/, "");
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${bare}`;
    case "x":
      return `https://x.com/${bare}`;
    case "tiktok":
      return `https://www.tiktok.com/@${bare}`;
    case "youtube":
      return `https://www.youtube.com/@${bare}`;
    case "roblox":
      return `https://www.roblox.com/search/users?keyword=${encodeURIComponent(bare)}`;
    case "discord":
      return null;
  }
}

/* ---------------------------------------------------------------------------
   Creator status pipeline
   --------------------------------------------------------------------------- */

export const UGC_STATUSES = [
  "applied",
  "approved",
  "shipped",
  "delivered",
  "content-due",
  "submitted",
  "changes-requested",
  "approved-content",
  "posted",
  "declined",
  "paused",
] as const;
export type UgcStatus = (typeof UGC_STATUSES)[number];

/** The pipeline in order (declined and paused sit outside it). */
export const UGC_PIPELINE: UgcStatus[] = [
  "applied",
  "approved",
  "shipped",
  "delivered",
  "content-due",
  "submitted",
  "changes-requested",
  "approved-content",
  "posted",
];

export const UGC_STATUS_LABELS: Record<UgcStatus, string> = {
  applied: "Applied",
  approved: "Approved",
  shipped: "Package shipped",
  delivered: "Delivered",
  "content-due": "Content due",
  submitted: "Submitted",
  "changes-requested": "Changes requested",
  "approved-content": "Content approved",
  posted: "Posted",
  declined: "Declined",
  paused: "Paused",
};

/** Suggested chip tone per status (matches the admin kit's tone names). */
export const UGC_STATUS_TONES: Record<
  UgcStatus,
  "slate" | "sky" | "violet" | "amber" | "emerald" | "rose"
> = {
  applied: "slate",
  approved: "sky",
  shipped: "sky",
  delivered: "sky",
  "content-due": "amber",
  submitted: "violet",
  "changes-requested": "amber",
  "approved-content": "emerald",
  posted: "emerald",
  declined: "rose",
  paused: "slate",
};

/** Statuses that may sign in to the hub. Applicants and declined creators can't. */
export const canSignIn = (s: UgcStatus) => s !== "applied" && s !== "declined";

/** Statuses that may upload. */
export const canUpload = (s: UgcStatus) =>
  canSignIn(s) && s !== "paused" && UGC_PIPELINE.indexOf(s) >= UGC_PIPELINE.indexOf("approved");

/**
 * Manual moves the admin pipeline allows without `force` (forward one step,
 * back one step for undo, decline, pause). Content statuses also move on their
 * own when submissions are uploaded, reviewed and posted.
 */
export const UGC_TRANSITIONS: Record<UgcStatus, UgcStatus[]> = {
  applied: ["approved", "declined", "paused"],
  approved: ["shipped", "applied", "declined", "paused"],
  shipped: ["delivered", "approved", "paused"],
  delivered: ["content-due", "shipped", "paused"],
  "content-due": ["submitted", "delivered", "paused"],
  submitted: ["changes-requested", "approved-content", "content-due", "paused"],
  "changes-requested": ["submitted", "approved-content", "paused"],
  "approved-content": ["posted", "changes-requested", "paused"],
  posted: ["approved-content", "paused"],
  declined: ["applied", "approved"],
  paused: UGC_PIPELINE,
};

export function canTransition(from: UgcStatus, to: UgcStatus): boolean {
  return from !== to && UGC_TRANSITIONS[from].includes(to);
}

/** The creator status implied by their submissions, or null when they have none that count. */
export function contentStatusFrom(subs: Pick<UgcSubmission, "status">[]): UgcStatus | null {
  const has = (s: UgcSubmissionStatus) => subs.some((x) => x.status === s);
  if (has("posted")) return "posted";
  if (has("approved")) return "approved-content";
  if (has("changes-requested")) return "changes-requested";
  if (has("in-review")) return "submitted";
  return null;
}

/**
 * The status a creator should have after their submissions changed. Paused and
 * declined are never changed automatically; before content exists the
 * logistics status (approved / shipped / delivered / content-due) stands.
 */
export function nextCreatorStatus(
  current: UgcStatus,
  subs: Pick<UgcSubmission, "status">[],
): UgcStatus {
  if (current === "paused" || current === "declined" || current === "applied") return current;
  const content = contentStatusFrom(subs);
  if (content) return content;
  // all submissions gone or rejected: back to "content due"
  const contentPhase: UgcStatus[] = [
    "submitted",
    "changes-requested",
    "approved-content",
    "posted",
  ];
  return contentPhase.includes(current) ? "content-due" : current;
}

/* ---------------------------------------------------------------------------
   Records
   --------------------------------------------------------------------------- */

export type UgcSource = {
  kind: "netlify-form" | "csv" | "manual" | "seed";
  /** Netlify submission id (or a stable hash for CSV rows without one). */
  submissionId: string | null;
  submittedAt: number | null;
  page: string;
  source: string;
  utm: Partial<Record<"source" | "medium" | "campaign" | "content" | "term", string>>;
};

/** Placeholder for the content licence (not decided yet; nothing user-facing uses it). */
export type UgcLicence = { signatureId: string; version: string; signedAt: number } | null;

export type UgcCreator = {
  id: string;
  status: UgcStatus;
  statusChangedAt: number;
  /** Campaigns assigned, most recent last. */
  campaignIds: string[];
  /** The person's name (form "contact-name"). */
  name: string;
  /** Their creator / channel name (form "creator_name"). */
  creatorName: string;
  email: string;
  country: string;
  platforms: UgcPlatform[];
  mainPlatform: UgcPlatform | null;
  handles: Partial<Record<UgcPlatform, string>>;
  audiences: Partial<Record<UgcPlatform, string>>;
  /** What they wrote in the form's notes box. */
  applicationNotes: string;
  consent: { contact: boolean; at: number | null };
  source: UgcSource;
  /** Placeholders: the age policy and the licence are not decided. Always null in v1. */
  ageBand: "18+" | "13-17" | null;
  licence?: UgcLicence;
  /** Optional link to a Creator Hub account (unused in v1). */
  hubUserId: string | null;
  deletionRequest: { at: number; note: string } | null;
  createdAt: number;
  updatedAt: number;
  approvedAt: number | null;
  /** First sign-in. */
  joinedAt: number | null;
  lastLoginAt: number | null;
  /** Seeded sample data. */
  sample?: boolean;
};

/** Admin-only, never sent to a creator. */
export type UgcAdminFields = { internalNotes: string; tags: string[] };

/** Admin-only phone and address (the creator reads and edits their own in Profile). */
export type UgcPii = {
  creatorId: string;
  phone: string;
  address: ShippingAddress | null;
  /** When the address is purged (90 days after delivery). */
  purgeAfter: number | null;
  purgedAt: number | null;
  updatedAt: number;
};

export type UgcShot = { id: string; label: string; required: boolean; tip?: string };

export type UgcAspect = "9:16" | "16:9" | "1:1" | "4:5" | "other";
export const UGC_ASPECTS: UgcAspect[] = ["9:16", "16:9", "1:1", "4:5", "other"];

export type UgcCampaignStatus = "draft" | "live" | "closed";

export type UgcCampaign = {
  id: string;
  title: string;
  /** The product drop, e.g. "Bobo + Eclipse can keychain". */
  drop: string;
  summary: string;
  status: UgcCampaignStatus;
  /** Bumped on every publish of a live brief. 0 until first published. */
  version: number;
  publishedAt: number | null;
  /** Content deadline (ms). */
  deadline: number | null;
  keyMessages: string[];
  dos: string[];
  donts: string[];
  hashtags: string[];
  mentions: string[];
  shots: UgcShot[];
  /** The "How to film the scan reveal" card. */
  howTo: { title: string; steps: string[]; exampleAssetId: string | null } | null;
  /** Shown on every brief. */
  disclosure: string;
  preferredAspect: UgcAspect;
  /** What's in the package. */
  items: string[];
  /** Brief assets, in display order (ids of UgcAsset in this campaign). */
  assetFileIds: string[];
  coverAssetId: string | null;
  /** A prebuilt "Download all" ZIP (an asset in group "zip"). */
  zipAssetId: string | null;
  createdAt: number;
  updatedAt: number;
  sample?: boolean;
};

export const UGC_DEFAULT_DISCLOSURE =
  "You got this package for free, so your post must say so: add #ad to your caption or turn on the platform's paid-partnership label. This is required even though you weren't paid.";

export const UGC_ASSET_GROUPS = [
  "logos",
  "art",
  "gameplay",
  "sounds",
  "overlays",
  "splash",
  "zip",
  "other",
] as const;
export type UgcAssetGroup = (typeof UGC_ASSET_GROUPS)[number];
export const UGC_ASSET_GROUP_LABELS: Record<UgcAssetGroup, string> = {
  logos: "Logos",
  art: "Bobo + Eclipse can art",
  gameplay: "Cola Run gameplay clips",
  sounds: "Sounds",
  overlays: "Overlays",
  splash: "Splash screen",
  zip: "Download all",
  other: "Other",
};

export type UgcStorageKind = "blobs" | "r2";
export type UgcStorageRef = { kind: UgcStorageKind; key: string };

export type UgcAsset = {
  id: string;
  campaignId: string;
  name: string;
  mime: string;
  size: number;
  chunks: number;
  storage: UgcStorageRef;
  group: UgcAssetGroup;
  note: string;
  complete: boolean;
  createdAt: number;
  sample?: boolean;
};

export type UgcShipment = {
  /** One shipment per creator per campaign: the id is the campaign id. */
  id: string;
  creatorId: string;
  campaignId: string;
  items: string[];
  carrier: string;
  tracking: string;
  trackingUrl: string | null;
  packedAt: number | null;
  shippedAt: number | null;
  deliveredAt: number | null;
  updatedAt: number;
};

export const UGC_SUBMISSION_STATUSES = [
  "uploading",
  "in-review",
  "changes-requested",
  "approved",
  "posted",
  "rejected",
] as const;
export type UgcSubmissionStatus = (typeof UGC_SUBMISSION_STATUSES)[number];
export const UGC_SUBMISSION_STATUS_LABELS: Record<UgcSubmissionStatus, string> = {
  uploading: "Uploading",
  "in-review": "In review",
  "changes-requested": "Changes requested",
  approved: "Approved",
  posted: "Posted",
  rejected: "Not used",
};

export type UgcSubmission = {
  id: string;
  creatorId: string;
  campaignId: string;
  storage: UgcStorageRef;
  name: string;
  mime: string;
  size: number;
  chunks: number;
  mediaType: "video" | "image";
  durationS: number | null;
  width: number | null;
  height: number | null;
  aspect: UgcAspect | null;
  poster: { key: string; mime: string; size: number } | null;
  /** SHA-256 of size + first and last 4 MB (client side), for duplicate spotting. */
  fingerprint: string | null;
  shotIds: string[];
  platform: UgcPostPlatform | null;
  /** The creator's note for the reviewer. */
  note: string;
  status: UgcSubmissionStatus;
  liveUrl: string | null;
  disclosureConfirmed: boolean;
  postedAt: number | null;
  reviewedAt: number | null;
  /** Brief version the creator was on when they uploaded. */
  briefVersion: number;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  sample?: boolean;
};

export type UgcComment = {
  id: string;
  submissionId: string;
  author: "creator" | "medialife";
  name: string;
  body: string;
  /** v2: timestamped notes. Always null in v1. */
  atSeconds: number | null;
  at: number;
};

export const UGC_PERK_KINDS = ["discount", "early-access", "collab"] as const;
export type UgcPerkKind = (typeof UGC_PERK_KINDS)[number];
export const UGC_PERK_KIND_LABELS: Record<UgcPerkKind, string> = {
  discount: "Discount code",
  "early-access": "Early access",
  collab: "Collab opportunity",
};

export type UgcPerk = {
  id: string;
  creatorId: string;
  kind: UgcPerkKind;
  title: string;
  description: string;
  /** Pasted from Shopify admin (no Shopify API in v1). */
  code: string | null;
  url: string | null;
  percentOff: number | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type UgcActivityKind =
  | "account"
  | "status"
  | "shipment"
  | "brief"
  | "upload"
  | "review"
  | "comment"
  | "posted"
  | "perk"
  | "profile";

export type UgcActivity = {
  id: string;
  at: number;
  kind: UgcActivityKind;
  title: string;
  body: string;
  actor: "creator" | "medialife" | "system";
  submissionId: string | null;
};

/* ---------------------------------------------------------------------------
   Views sent to the browser
   --------------------------------------------------------------------------- */

/** What a creator sees of their own record (no import internals). */
export type UgcCreatorView = Omit<UgcCreator, "source" | "hubUserId">;

export const creatorView = (c: UgcCreator): UgcCreatorView => {
  const { source: _s, hubUserId: _h, ...rest } = c;
  return rest;
};

export type UgcAssetView = UgcAsset & {
  /** Inline URL (images and video play in the page; honours Range). */
  url: string;
  /** Same file with content-disposition: attachment. */
  downloadUrl: string;
  isImage: boolean;
  isVideo: boolean;
};

export type UgcSubmissionView = UgcSubmission & {
  /** Inline playback URL (Range). null while uploading. */
  url: string | null;
  downloadUrl: string | null;
  posterUrl: string | null;
  comments: UgcComment[];
};

export const ugcSubmissionUrl = (id: string, download = false) =>
  `/api/ugc/files/submissions/${id}${download ? "?download=1" : ""}`;
export const ugcPosterUrl = (id: string, v?: number) =>
  `/api/ugc/files/posters/${id}${v ? `?v=${v}` : ""}`;
export const ugcAssetUrl = (campaignId: string, id: string, download = false) =>
  `/api/ugc/files/assets/${campaignId}/${id}${download ? "?download=1" : ""}`;

export function assetView(a: UgcAsset): UgcAssetView {
  return {
    ...a,
    url: ugcAssetUrl(a.campaignId, a.id),
    downloadUrl: ugcAssetUrl(a.campaignId, a.id, true),
    isImage: a.mime.startsWith("image/"),
    isVideo: a.mime.startsWith("video/"),
  };
}

export function submissionView(s: UgcSubmission, comments: UgcComment[] = []): UgcSubmissionView {
  const ready = s.status !== "uploading";
  return {
    ...s,
    url: ready ? ugcSubmissionUrl(s.id) : null,
    downloadUrl: ready ? ugcSubmissionUrl(s.id, true) : null,
    posterUrl: s.poster ? ugcPosterUrl(s.id, s.poster.size) : null,
    comments,
  };
}

/* ---------------------------------------------------------------------------
   File types
   --------------------------------------------------------------------------- */

/** What creators may upload: video and images only. */
export const UGC_SUBMISSION_TYPES: Record<string, { ext: string[]; media: "video" | "image" }> = {
  "video/mp4": { ext: ["mp4", "m4v"], media: "video" },
  "video/quicktime": { ext: ["mov"], media: "video" },
  "video/webm": { ext: ["webm"], media: "video" },
  "image/jpeg": { ext: ["jpg", "jpeg"], media: "image" },
  "image/png": { ext: ["png"], media: "image" },
  "image/webp": { ext: ["webp"], media: "image" },
  "image/heic": { ext: ["heic", "heif"], media: "image" },
};

/** What admins may put in a campaign's asset library. */
export const UGC_ASSET_TYPES: Record<string, { ext: string[] }> = {
  ...Object.fromEntries(Object.entries(UGC_SUBMISSION_TYPES).map(([m, v]) => [m, { ext: v.ext }])),
  "image/gif": { ext: ["gif"] },
  "image/svg+xml": { ext: ["svg"] },
  "audio/mpeg": { ext: ["mp3"] },
  "audio/wav": { ext: ["wav"] },
  "audio/mp4": { ext: ["m4a"] },
  "audio/aac": { ext: ["aac"] },
  "audio/ogg": { ext: ["ogg"] },
  "application/pdf": { ext: ["pdf"] },
  "application/zip": { ext: ["zip"] },
  "font/otf": { ext: ["otf"] },
  "font/ttf": { ext: ["ttf"] },
};

const acceptOf = (types: Record<string, { ext: string[] }>) =>
  Object.values(types)
    .flatMap((v) => v.ext.map((e) => `.${e}`))
    .join(",");

/** For <input accept>. */
export const UGC_SUBMISSION_ACCEPT = `${acceptOf(UGC_SUBMISSION_TYPES)},video/*,image/*`;
export const UGC_ASSET_ACCEPT = acceptOf(UGC_ASSET_TYPES);

/** The MIME type to store, from the name's extension (browsers report video types unreliably). */
export function resolveUgcMime(
  name: string,
  mime: string,
  types: Record<string, { ext: string[] }> = UGC_SUBMISSION_TYPES,
): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (types[mime]?.ext.includes(ext)) return mime;
  for (const [m, v] of Object.entries(types)) if (v.ext.includes(ext)) return m;
  return null;
}

const HEIF_BRANDS = [
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
];
const QT_ATOMS = ["ftyp", "moov", "wide", "mdat", "free", "skip", "pnot"];

/**
 * Magic-byte check on the first bytes of an upload, so a renamed file can't
 * pose as video or an image. `head` needs at least 16 bytes.
 */
export function sniffUgc(mime: string, head: Uint8Array): boolean {
  const at = (i: number, bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  const ascii = (i: number, n: number) => String.fromCharCode(...head.slice(i, i + n));
  switch (mime) {
    case "video/mp4":
      return ascii(4, 4) === "ftyp";
    case "video/quicktime":
      return QT_ATOMS.includes(ascii(4, 4));
    case "video/webm":
      return at(0, [0x1a, 0x45, 0xdf, 0xa3]);
    case "image/jpeg":
      return at(0, [0xff, 0xd8, 0xff]);
    case "image/png":
      return at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "image/heic":
      return ascii(4, 4) === "ftyp" && HEIF_BRANDS.includes(ascii(8, 4));
    case "image/gif":
      return ascii(0, 3) === "GIF";
    case "application/pdf":
      return ascii(0, 4) === "%PDF";
    case "application/zip":
      return at(0, [0x50, 0x4b]);
    default:
      // audio, fonts, svg: admin-only uploads, served as downloads or with a sandbox CSP
      return true;
  }
}

/* ---------------------------------------------------------------------------
   Quota
   --------------------------------------------------------------------------- */

export type UgcQuota = { usedBytes: number; limitBytes: number; fileLimitBytes: number };

/** Every stored submission counts, finished or still uploading. */
export const quotaUsed = (subs: Pick<UgcSubmission, "size">[]) =>
  subs.reduce((n, s) => n + s.size, 0);

/**
 * True when this submission takes the creator past the quota, counting
 * submissions in the order they were started. Two uploads started at once can
 * both pass the check at init; this decides which one is over on every chunk.
 */
export function overQuota(
  subs: Pick<UgcSubmission, "id" | "size" | "createdAt">[],
  id: string,
  limit: number = UGC.quotaBytes,
): boolean {
  const sorted = [...subs].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  let total = 0;
  for (const s of sorted) {
    total += s.size;
    if (s.id === id) return total > limit;
  }
  return false;
}

/* ---------------------------------------------------------------------------
   Helpers the pages use
   --------------------------------------------------------------------------- */

/** "1.4 GB", "820 MB", "12 KB". */
export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(n >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Classifies width × height (±4%). */
export function aspectOf(width: number | null, height: number | null): UgcAspect | null {
  if (!width || !height) return null;
  const r = width / height;
  const near = (x: number) => Math.abs(r - x) / x < 0.04;
  if (near(9 / 16)) return "9:16";
  if (near(16 / 9)) return "16:9";
  if (near(1)) return "1:1";
  if (near(4 / 5)) return "4:5";
  return "other";
}

/** "Looks like 16:9. This brief asks for 9:16." or null when it matches. */
export function aspectHint(actual: UgcAspect | null, wanted: UgcAspect): string | null {
  if (!actual || actual === wanted || wanted === "other") return null;
  if (actual === "other") return `This brief asks for ${wanted}. Check your export settings.`;
  return `Looks like ${actual}. This brief asks for ${wanted}.`;
}

/** Problem with a pasted live link, or null. Only https links to a real host. */
export function liveUrlProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Paste the link to your post.";
  if (v.length > 500) return "That link is too long.";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "That doesn't look like a link. Copy it from the post's share button.";
  }
  if (u.protocol !== "https:") return "Use the https:// link to your post.";
  if (!u.hostname.includes(".") || u.username || u.password) return "That link doesn't look right.";
  return null;
}

/** Days until a deadline, rounded up (negative once it's passed). */
export function daysLeft(deadline: number | null, now = Date.now()): number | null {
  if (deadline == null) return null;
  return Math.ceil((deadline - now) / 86_400_000);
}

const CARRIERS: { match: RegExp; label: string; url: (t: string) => string }[] = [
  {
    match: /^usps$/i,
    label: "USPS",
    url: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`,
  },
  { match: /^ups$/i, label: "UPS", url: (t) => `https://www.ups.com/track?tracknum=${t}` },
  {
    match: /^fedex$/i,
    label: "FedEx",
    url: (t) => `https://www.fedex.com/fedextrack/?trknbr=${t}`,
  },
  {
    match: /^dhl/i,
    label: "DHL",
    url: (t) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${t}`,
  },
  {
    match: /^royal ?mail$/i,
    label: "Royal Mail",
    url: (t) => `https://www.royalmail.com/track-your-item#/tracking-results/${t}`,
  },
  {
    match: /^canada ?post$/i,
    label: "Canada Post",
    url: (t) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${t}`,
  },
  { match: /^evri$/i, label: "Evri", url: (t) => `https://www.evri.com/track/parcel/${t}` },
];

/** Carriers with a known tracking page (the admin's carrier field suggests these). */
export const UGC_CARRIERS = CARRIERS.map((c) => c.label);

/** A tracking page for common carriers, or null. */
export function trackingUrlFor(carrier: string, tracking: string): string | null {
  const t = encodeURIComponent(tracking.trim());
  if (!t) return null;
  const c = CARRIERS.find((x) => x.match.test(carrier.trim()));
  return c ? c.url(t) : null;
}

/* ---------------------------------------------------------------------------
   Home: the timeline and the "What's next" card
   --------------------------------------------------------------------------- */

export type UgcStageId =
  | "approved"
  | "packed"
  | "shipped"
  | "delivered"
  | "content-due"
  | "submitted"
  | "content-approved"
  | "posted"
  | "perk";

export type UgcTimelineStep = {
  id: UgcStageId;
  label: string;
  state: "done" | "current" | "upcoming";
  /** When it happened, when known. */
  at: number | null;
  /** A short line under the label (carrier + tracking, countdown…). */
  detail: string | null;
  /** A link for the step (the tracking page). */
  href: string | null;
};

export const UGC_STAGE_LABELS: Record<UgcStageId, string> = {
  approved: "Approved",
  packed: "Package packed",
  shipped: "Shipped",
  delivered: "Delivered",
  "content-due": "Content due",
  submitted: "Submitted",
  "content-approved": "Approved",
  posted: "Posted",
  perk: "Perk unlocked",
};

type TimelineInput = {
  creator: Pick<UgcCreator, "status" | "approvedAt">;
  campaign: Pick<UgcCampaign, "deadline"> | null;
  shipment: UgcShipment | null;
  submissions: Pick<UgcSubmission, "status" | "completedAt" | "reviewedAt" | "postedAt">[];
  perks: Pick<UgcPerk, "createdAt">[];
  now?: number;
};

export function ugcTimeline(i: TimelineInput): UgcTimelineStep[] {
  const now = i.now ?? Date.now();
  const sh = i.shipment;
  const subs = i.submissions;
  const first = (xs: (number | null | undefined)[]) => {
    const v = xs.filter((x): x is number => typeof x === "number");
    return v.length ? Math.min(...v) : null;
  };
  const sent = subs.filter((s) => s.status !== "uploading");
  const approved = subs.filter((s) => s.status === "approved" || s.status === "posted");
  const posted = subs.filter((s) => s.status === "posted");
  const left = daysLeft(i.campaign?.deadline ?? null, now);
  const countdown =
    left == null
      ? null
      : left > 1
        ? `${left} days left`
        : left === 1
          ? "Due tomorrow"
          : left === 0
            ? "Due today"
            : `${-left} day${left === -1 ? "" : "s"} overdue`;

  const raw: Omit<UgcTimelineStep, "state" | "label">[] = [];
  const done: boolean[] = [];
  const push = (step: Omit<UgcTimelineStep, "state" | "label">, isDone: boolean) => {
    raw.push(step);
    done.push(isDone);
  };
  const isApproved = i.creator.approvedAt != null || i.creator.status !== "applied";
  push({ id: "approved", at: i.creator.approvedAt, detail: null, href: null }, isApproved);
  push(
    { id: "packed", at: sh?.packedAt ?? sh?.shippedAt ?? null, detail: null, href: null },
    !!(sh?.packedAt || sh?.shippedAt),
  );
  push(
    {
      id: "shipped",
      at: sh?.shippedAt ?? null,
      detail: sh?.shippedAt ? [sh.carrier, sh.tracking].filter(Boolean).join(" · ") || null : null,
      href: sh?.shippedAt ? sh.trackingUrl : null,
    },
    !!sh?.shippedAt,
  );
  push(
    { id: "delivered", at: sh?.deliveredAt ?? null, detail: null, href: null },
    !!sh?.deliveredAt,
  );
  push(
    { id: "content-due", at: i.campaign?.deadline ?? null, detail: countdown, href: null },
    sent.length > 0,
  );
  push(
    { id: "submitted", at: first(sent.map((s) => s.completedAt)), detail: null, href: null },
    sent.length > 0,
  );
  push(
    {
      id: "content-approved",
      at: first(approved.map((s) => s.reviewedAt)),
      detail: null,
      href: null,
    },
    approved.length > 0,
  );
  push(
    { id: "posted", at: first(posted.map((s) => s.postedAt)), detail: null, href: null },
    posted.length > 0,
  );
  push(
    { id: "perk", at: first(i.perks.map((p) => p.createdAt)), detail: null, href: null },
    i.perks.length > 0,
  );

  // Everything up to the last done step counts as done (a package can be
  // delivered without anyone marking it packed); the next one is current.
  const lastDone = done.lastIndexOf(true);
  return raw.map((s, k) => ({
    ...s,
    label: UGC_STAGE_LABELS[s.id],
    state: k <= lastDone ? "done" : k === lastDone + 1 ? "current" : "upcoming",
  }));
}

export type UgcNextAction = {
  id:
    | "paused"
    | "fix-changes"
    | "post-live-link"
    | "packing"
    | "on-its-way"
    | "film-and-upload"
    | "in-review"
    | "enjoy-perks"
    | "read-brief";
  title: string;
  body: string;
  cta: { label: string; href: string; external?: boolean } | null;
  tone: "info" | "action" | "success" | "muted";
};

export function ugcNextAction(i: TimelineInput & { campaignTitle?: string }): UgcNextAction {
  const now = i.now ?? Date.now();
  const subs = i.submissions;
  const has = (s: UgcSubmissionStatus) => subs.some((x) => x.status === s);
  const sh = i.shipment;
  if (i.creator.status === "paused")
    return {
      id: "paused",
      title: "Your spot is paused",
      body: `We've paused your place in the program for now. Questions? Email ${UGC.supportEmail}.`,
      cta: null,
      tone: "muted",
    };
  if (has("changes-requested"))
    return {
      id: "fix-changes",
      title: "We asked for a few changes",
      body: "Read the feedback on your upload, then upload a new version.",
      cta: { label: "See feedback", href: UGC_ROUTES.upload },
      tone: "action",
    };
  if (has("approved"))
    return {
      id: "post-live-link",
      title: "Approved! Post it, then paste your live link",
      body: "Add #ad or the platform's paid-partnership label, then paste the link to your post.",
      cta: { label: "Add live link", href: UGC_ROUTES.upload },
      tone: "action",
    };
  if (!sh?.shippedAt && !has("in-review") && !has("posted"))
    return {
      id: "packing",
      title: "Your package is being packed",
      body: "We'll email you the tracking link as soon as it ships. Read the brief while you wait.",
      cta: { label: "Read the brief", href: UGC_ROUTES.brief },
      tone: "info",
    };
  if (sh?.shippedAt && !sh.deliveredAt && !has("in-review") && !has("posted"))
    return {
      id: "on-its-way",
      title: "Your package is on its way",
      body:
        [sh.carrier, sh.tracking].filter(Boolean).join(" · ") || "Tracking details coming soon.",
      cta: sh.trackingUrl ? { label: "Track package", href: sh.trackingUrl, external: true } : null,
      tone: "info",
    };
  if (has("in-review"))
    return {
      id: "in-review",
      title: "We're reviewing your content",
      body: "We'll email you when it's approved or if we need any changes.",
      cta: { label: "My content", href: UGC_ROUTES.upload },
      tone: "muted",
    };
  if (has("posted"))
    return {
      id: "enjoy-perks",
      title: "You're live. Thank you!",
      body: i.perks.length ? "Your perks are unlocked." : "Your perk is on its way.",
      cta: { label: "See perks", href: UGC_ROUTES.perks },
      tone: "success",
    };
  const left = daysLeft(i.campaign?.deadline ?? null, now);
  return {
    id: "film-and-upload",
    title: "Time to film",
    body:
      left == null
        ? "Follow the shot list in the brief, then upload your video here."
        : left >= 0
          ? `Follow the shot list in the brief. Due in ${left} day${left === 1 ? "" : "s"}.`
          : "The deadline has passed. Upload as soon as you can.",
    cta: { label: "Upload content", href: UGC_ROUTES.upload },
    tone: "action",
  };
}
