/**
 * Client Hub: a private space for an IP client's own team (EVADE first) to see
 * and manage what MEDIALIFE runs for them: UGC creators and their videos, the
 * client's videos and files from the Media Library, updates, merch drops, and
 * links to every experience. Shared by the server, the Client Hub and /admin.
 *
 * Accounts are ordinary hub accounts (the Creator / Partner Hub sign-in). A
 * person joins a client team from an invitation and picks their own password;
 * nobody shares a password. The MEDIALIFE team manages everything from
 * /admin/clients and can open the hub as the client sees it.
 */

export const CLIENT_BASE = "/client-hub";
export const CLIENT_INVITE_DAYS = 14;

export type ClientRole = "admin" | "member";

export const CLIENT_ROLES: Record<ClientRole, { label: string; blurb: string }> = {
  admin: {
    label: "Admin",
    blurb: "Everything a member can do, plus inviting and removing teammates.",
  },
  member: {
    label: "Member",
    blurb: "Sees everything in the hub and leaves feedback on creator videos.",
  },
};

/** Sections MEDIALIFE can switch on or off per client. */
export const CLIENT_FEATURES = [
  "ugc",
  "updates",
  "merch",
  "videos",
  "files",
  "uploads",
  "experiences",
  "collector",
  "giveaways",
] as const;
export type ClientFeature = (typeof CLIENT_FEATURES)[number];

export const CLIENT_FEATURE_LABELS: Record<ClientFeature, string> = {
  ugc: "UGC creators and videos",
  updates: "Updates",
  merch: "Merch",
  videos: "Videos (Media Library)",
  files: "Files and documents",
  uploads: "Uploads from their team",
  experiences: "Experiences",
  collector: "Collector Hub numbers",
  giveaways: "Giveaways",
};

export type Client = {
  /** Slug, e.g. "evade". */
  id: string;
  name: string;
  status: "active" | "paused";
  /** Accent for buttons and highlights, and the ink it sits on. Flat colours only. */
  brand: { accent: string; ink: string };
  /** Logo shown in the hub header (a site path), or "" for a lettered mark. */
  logo: string;
  /** The Media Library "client" value whose files this client sees (e.g. "EVADE"). */
  mediaClient: string;
  /** The Labs catalogue "client" value for the Experiences page (e.g. "EVADE"). */
  catalogClient: string;
  /** Where the client's own experiences page lives (e.g. /evade/labs/). */
  experiencesUrl: string;
  features: Record<ClientFeature, boolean>;
  /** Media Library files of this client that the client does NOT see. */
  hiddenMedia: string[];
  /** Giveaway campaigns shown to the client. */
  giveawayIds: string[];
  /** A line under the greeting on the hub home. */
  welcome: string;
  /** The MEDIALIFE contact the client sees. */
  contact: { name: string; email: string };
  /** Internal only. */
  notes: string;
  createdAt: number;
  updatedAt: number;
};

/** The team list on a client (mirrors the user's membership). */
export type ClientMember = {
  userId: string;
  clientId: string;
  email: string;
  name: string;
  role: ClientRole;
  joinedAt: number;
  invitedBy: string;
};

/** A hub account's place on a client team (on the user record). */
export type ClientMembership = { id: string; role: ClientRole };

/** An invitation to a client team. The token's secret half is never stored. */
export type ClientInvite = {
  id: string;
  clientId: string;
  email: string;
  name: string;
  role: ClientRole;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
};

/* ---------------------------------------------------------------------------
   Content MEDIALIFE posts for the client
   --------------------------------------------------------------------------- */

export const POST_KINDS = ["update", "merch", "campaign", "document"] as const;
export type PostKind = (typeof POST_KINDS)[number];
export const POST_KIND_LABELS: Record<PostKind, string> = {
  update: "Update",
  merch: "Merch",
  campaign: "Campaign",
  document: "New document",
};

/** An update from MEDIALIFE to the client (news, a merch note, a new document…). */
export type ClientPost = {
  id: string;
  clientId: string;
  kind: PostKind;
  title: string;
  /** Plain text. Blank lines are paragraphs. */
  body: string;
  link: { label: string; url: string } | null;
  pinned: boolean;
  author: string;
  createdAt: number;
  updatedAt: number;
};

export const MERCH_STAGES = [
  "idea",
  "design",
  "sampling",
  "production",
  "live",
  "sold-out",
  "paused",
] as const;
export type MerchStage = (typeof MERCH_STAGES)[number];
export const MERCH_STAGE_LABELS: Record<MerchStage, string> = {
  idea: "Idea",
  design: "In design",
  sampling: "Sampling",
  production: "In production",
  live: "Live",
  "sold-out": "Sold out",
  paused: "On hold",
};
/** The stages a drop moves through, for the progress track. */
export const MERCH_TRACK: MerchStage[] = ["idea", "design", "sampling", "production", "live"];

export type MerchItem = {
  id: string;
  clientId: string;
  name: string;
  stage: MerchStage;
  description: string;
  /** A picture: a site path or https URL. */
  image: string;
  /** Free text, e.g. "Mid December" or "Q1 2027". */
  eta: string;
  link: { label: string; url: string } | null;
  /** Lower first. */
  order: number;
  createdAt: number;
  updatedAt: number;
};

export const LINK_KINDS = ["doc", "deck", "sheet", "design", "video", "link"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];
export const LINK_KIND_LABELS: Record<LinkKind, string> = {
  doc: "Document",
  deck: "Deck",
  sheet: "Spreadsheet",
  design: "Design",
  video: "Video",
  link: "Link",
};

/** A document or page shared by link (a deck, a Google Doc, a brief…). */
export type ClientLink = {
  id: string;
  clientId: string;
  title: string;
  url: string;
  description: string;
  kind: LinkKind;
  createdAt: number;
  updatedAt: number;
};

/* ---------------------------------------------------------------------------
   The client's feedback on creator videos
   --------------------------------------------------------------------------- */

export const UGC_VERDICTS = ["love", "changes", "pass"] as const;
export type UgcVerdict = (typeof UGC_VERDICTS)[number];
export const UGC_VERDICT_LABELS: Record<UgcVerdict, string> = {
  love: "Love it",
  changes: "Needs changes",
  pass: "Not for us",
};

/**
 * What the client's team thinks of one creator video. Seen by the client's
 * team and MEDIALIFE only, never by the creator: MEDIALIFE makes the call and
 * talks to the creator.
 */
export type UgcFeedback = {
  submissionId: string;
  clientId: string;
  verdict: UgcVerdict | null;
  note: string;
  byName: string;
  byUserId: string | null;
  at: number;
};

/* ---------------------------------------------------------------------------
   Defaults
   --------------------------------------------------------------------------- */

export const ALL_FEATURES_ON = Object.fromEntries(CLIENT_FEATURES.map((f) => [f, true])) as Record<
  ClientFeature,
  boolean
>;

/** EVADE exists without any setup: its record is created the first time it's read. */
export const DEFAULT_CLIENTS: Record<string, Omit<Client, "createdAt" | "updatedAt">> = {
  evade: {
    id: "evade",
    name: "EVADE",
    status: "active",
    brand: { accent: "#3d8bff", ink: "#05070d" },
    logo: "",
    mediaClient: "EVADE",
    catalogClient: "EVADE",
    experiencesUrl: "/evade/labs/",
    features: { ...ALL_FEATURES_ON },
    hiddenMedia: [],
    giveawayIds: [],
    welcome: "Everything MEDIALIFE is running for EVADE, in one place.",
    contact: { name: "MEDIALIFE team", email: "hello@medialife.ai" },
    notes: "",
  },
};

export const LIMITS = {
  name: 80,
  title: 140,
  body: 6000,
  description: 1200,
  url: 600,
  note: 1200,
  welcome: 240,
  notes: 4000,
} as const;

export function slugifyClient(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Only http(s) links and site paths; anything else becomes "". */
export function safeUrl(u: string): string {
  const s = u.trim();
  if (!s) return "";
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Client-side URLs for files the hub serves. */
export const clientUgcFileUrl = (id: string, download = false) =>
  `/api/client-hub/ugc/${id}${download ? "?download=1" : ""}`;
export const clientUgcPosterUrl = (id: string, v?: number) =>
  `/api/client-hub/ugc-poster/${id}${v ? `?v=${v}` : ""}`;
export const clientMediaUrl = (id: string, download = false) =>
  `/api/client-hub/media/${id}${download ? "?download=1" : ""}`;
export const clientMediaThumbUrl = (id: string, v?: number) =>
  `/api/client-hub/media-thumb/${id}${v ? `?v=${v}` : ""}`;
