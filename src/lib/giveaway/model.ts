// Points giveaways ("complete tasks, earn points, 1 point = 1 ticket in the draw").
// Client-safe: types, constants, labels and small pure helpers. Server logic is in
// *.server.ts; the pages call the server functions in *.functions.ts.
//
// Verification model (see the recommendation doc linked in README.md):
//   verified tasks  — we can prove them: confirmed email, mailing-list opt-in,
//                     referrals, Discord server membership, secret codes.
//   honour tasks    — Instagram / TikTok / X / YouTube follows: no network lets
//                     anyone check who follows an account, so the entrant opens
//                     the profile and types their handle. The team checks the
//                     winner's handles by hand before a prize goes out.

export const GIVEAWAY = {
  base: "/giveaway",
  sessionTtlMs: 60 * 24 * 60 * 60 * 1000, // 60 days: a campaign can run for weeks
  linkTtlMs: 7 * 24 * 60 * 60 * 1000, // the confirm link in the entry email
  /** An honour task's button must be opened at least this long before "I did it". */
  minOpenMs: 3000,
  /** Winner has this long to answer the skill-testing question and claim. */
  claimDays: 7,
  alternates: 5,
  maxTasks: 30,
  maxPrizes: 10,
  supportEmail: "hello@medialife.ai",
} as const;

export const GIVEAWAY_ROUTES = {
  campaign: (slug: string) => `/giveaway/${slug}`,
  rules: (slug: string) => `/giveaway/${slug}/rules`,
  auth: "/giveaway/auth",
  admin: "/admin/giveaways",
  adminCampaign: (id: string) => `/admin/giveaways/${id}`,
} as const;

/* ── Tasks ───────────────────────────────────────────────────────────────── */

export const TASK_KINDS = ["newsletter", "follow", "visit", "discord", "code"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  newsletter: "Join a mailing list",
  follow: "Follow an account",
  visit: "Visit a link / watch a video",
  discord: "Join a Discord server",
  code: "Enter a secret code",
};

/** True when we can prove the action; false = honour system + winner check. */
export const TASK_VERIFIED: Record<TaskKind, boolean> = {
  newsletter: true,
  follow: false,
  visit: false,
  discord: true,
  code: true,
};

export const FOLLOW_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "x",
  "twitch",
  "roblox",
  "other",
] as const;
export type FollowPlatform = (typeof FOLLOW_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<FollowPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
  twitch: "Twitch",
  roblox: "Roblox",
  other: "Other",
};

export type GiveawayTask = {
  id: string;
  kind: TaskKind;
  title: string;
  /** One short line under the title. */
  description: string;
  points: number;
  /** follow / visit: the profile or page to open. discord: the invite link. */
  url: string;
  /** follow */
  platform: FollowPlatform | null;
  /** newsletter: which opt-in list it ticks. */
  listId: string | null;
  /** discord: the server (guild) id to check membership of. */
  guildId: string | null;
  /** code: accepted codes (case-insensitive). Admin only; never sent to entrants. */
  codes: string[];
  /** code: where people find it, shown to entrants ("Scan the QR on your keychain"). */
  codeHint: string;
  enabled: boolean;
};

/* ── Campaign ────────────────────────────────────────────────────────────── */

export const CAMPAIGN_STATUSES = ["draft", "live", "closed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  live: "Live",
  closed: "Closed",
};

export type GiveawayPrize = {
  id: string;
  title: string;
  description: string;
  /** Approximate retail value, whole currency units. Required by Canada's Competition Act. */
  retailValue: number;
  quantity: number;
};

export type OptInList = { id: string; label: string };

export type GiveawayCampaign = {
  id: string;
  slug: string;
  status: CampaignStatus;
  title: string;
  /** One line under the title on the campaign page. */
  tagline: string;
  /** Who runs it (legal sponsor), e.g. "MEDIALIFE Inc." */
  sponsor: string;
  sponsorAddress: string;
  /** Brands shown on the page and in rules ("MEDIALIFE × EVADE"). */
  brandLine: string;
  heroImage: string;
  startsAt: number | null;
  endsAt: number | null;
  drawAt: number | null;
  /** Shown next to dates in the rules, e.g. "Eastern Time (ET)". */
  timeZoneLabel: string;
  prizes: GiveawayPrize[];
  currency: string;
  /** ISO country codes that may enter. */
  countries: string[];
  /** Region codes excluded (e.g. "CA-QC"). */
  excludedRegions: string[];
  minAge: number;
  /** Points for confirming the entry email. */
  entryPoints: number;
  referralPoints: number;
  referralCap: number;
  /** Cap on points from honour-system tasks, so faking them gains little. 0 = no cap. */
  honourCap: number;
  optIns: OptInList[];
  tasks: GiveawayTask[];
  /** Extra plain-text paragraphs appended to the official rules. */
  rulesExtra: string;
  createdAt: number;
  updatedAt: number;
};

/* ── Entrants ────────────────────────────────────────────────────────────── */

export type LedgerKind = "entry" | "task" | "referral" | "adjust";
export type LedgerRow = {
  id: string;
  at: number;
  kind: LedgerKind;
  taskId: string | null;
  /** referral: the friend's entrant id. */
  refEntrantId: string | null;
  points: number;
  note: string;
  voided: boolean;
};

export type Consent = { listId: string; label: string; at: number; ipHash: string };

export type EntrantStatus = "pending" | "confirmed" | "void";

export type Entrant = {
  id: string;
  campaignId: string;
  email: string;
  /** Folded email (lowercase, Gmail dots and +tags removed): one entry per person. */
  emailKey: string;
  name: string;
  country: string;
  region: string;
  ageConfirmed: boolean;
  status: EntrantStatus;
  voidReason: string;
  refCode: string;
  referredBy: string | null;
  ipHash: string;
  deviceHash: string;
  /** Opted-in lists. */
  consents: Consent[];
  /** taskId → when its button was opened (honour tasks). */
  opened: Record<string, number>;
  /** taskId → completion details. */
  completed: Record<string, { at: number; handle: string; detail: string }>;
  ledger: LedgerRow[];
  /** Cached sum of non-void ledger rows (recomputed on every write). */
  points: number;
  createdAt: number;
  confirmedAt: number | null;
  lastSeenAt: number;
};

export const pointsOf = (ledger: LedgerRow[]) =>
  ledger.reduce((sum, r) => (r.voided ? sum : sum + r.points), 0);

/* ── Draw ────────────────────────────────────────────────────────────────── */

export type WinnerStatus = "pending" | "verified" | "claimed" | "forfeited";
export const WINNER_STATUS_LABELS: Record<WinnerStatus, string> = {
  pending: "To check",
  verified: "Checked, email sent",
  claimed: "Claimed",
  forfeited: "Forfeited",
};

export type DrawPick = {
  entrantId: string;
  tickets: number;
  /** "winner" picks hold a prize; "alternate" picks step in, in order, when a winner forfeits. */
  role: "winner" | "alternate";
  prizeId: string | null;
  status: WinnerStatus;
  skillQuestion: string;
  skillAnswer: number;
  notes: string;
  updatedAt: number;
};

export type GiveawayDraw = {
  id: string;
  campaignId: string;
  at: number;
  /** Hex seed; with the snapshot it reproduces the draw exactly. */
  seed: string;
  entrants: number;
  totalTickets: number;
  /** SHA-256 of the ticket snapshot ("id:tickets" lines, sorted by id). */
  snapshotHash: string;
  picks: DrawPick[];
};

/* ── Eligibility ─────────────────────────────────────────────────────────── */

export const COUNTRY_LABELS: Record<string, string> = {
  CA: "Canada",
  US: "United States",
  GB: "United Kingdom",
  AU: "Australia",
  MX: "Mexico",
  BR: "Brazil",
  PH: "Philippines",
  ID: "Indonesia",
};

export const CA_PROVINCES: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

export function regionLabel(code: string): string {
  const [c, r] = code.split("-");
  if (c === "CA" && r && CA_PROVINCES[r]) return CA_PROVINCES[r];
  return code;
}

/** Why someone can't enter, or null. */
export function eligibilityProblem(
  c: Pick<GiveawayCampaign, "countries" | "excludedRegions">,
  country: string,
  region: string,
): string | null {
  if (!c.countries.includes(country))
    return "Sorry, this giveaway isn't open where you live. Check the official rules for who can enter.";
  if (region && c.excludedRegions.includes(`${country}-${region}`))
    return `Sorry, residents of ${regionLabel(`${country}-${region}`)} can't enter this giveaway.`;
  return null;
}

/* ── Email ───────────────────────────────────────────────────────────────── */

/** One key per mailbox: lowercase, +tags dropped, Gmail dots dropped. */
export function foldEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  local = local.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

const DISPOSABLE = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "tempmail.net",
  "tempmailo.com",
  "tempail.com",
  "yopmail.com",
  "yopmail.net",
  "trashmail.com",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "maildrop.cc",
  "throwawaymail.com",
  "fakeinbox.com",
  "mintemail.com",
  "mohmal.com",
  "emailondeck.com",
  "burnermail.io",
  "mailnesia.com",
  "moakt.com",
  "spamgourmet.com",
  "mailcatch.com",
  "trashmail.de",
  "discard.email",
  "inboxkitten.com",
  "1secmail.com",
  "emailfake.com",
]);

export const isDisposableEmail = (email: string) =>
  DISPOSABLE.has(email.trim().toLowerCase().split("@").pop() ?? "");

/** Masked for admin lists and leaderboards: "da•••@gmail.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(1, Math.min(4, local.length - 2)))}@${domain}`;
}

/* ── Misc ────────────────────────────────────────────────────────────────── */

export const slugProblem = (slug: string) =>
  /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug)
    ? null
    : "Use 3 to 48 lowercase letters, numbers and dashes.";

export function campaignPhase(
  c: Pick<GiveawayCampaign, "status" | "startsAt" | "endsAt">,
  now = Date.now(),
): "draft" | "upcoming" | "open" | "ended" {
  if (c.status === "draft") return "draft";
  if (c.status === "closed") return "ended";
  if (c.startsAt && now < c.startsAt) return "upcoming";
  if (c.endsAt && now >= c.endsAt) return "ended";
  return "open";
}

export const totalPrizeValue = (c: Pick<GiveawayCampaign, "prizes">) =>
  c.prizes.reduce((s, p) => s + p.retailValue * p.quantity, 0);

export const prizeCount = (c: Pick<GiveawayCampaign, "prizes">) =>
  c.prizes.reduce((s, p) => s + p.quantity, 0);

export function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency,
      maximumFractionDigits: n % 1 ? 2 : 0,
    }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

/** The task as entrants see it (no codes). */
export type PublicTask = Omit<GiveawayTask, "codes" | "enabled"> & { verified: boolean };

export function publicTask(t: GiveawayTask): PublicTask {
  const { codes: _codes, enabled: _enabled, ...rest } = t;
  return { ...rest, verified: TASK_VERIFIED[t.kind] };
}

export function blankTask(id: string, kind: TaskKind): GiveawayTask {
  return {
    id,
    kind,
    title: "",
    description: "",
    points: 5,
    url: "",
    platform: kind === "follow" ? "instagram" : null,
    listId: null,
    guildId: null,
    codes: [],
    codeHint: "",
    enabled: true,
  };
}
