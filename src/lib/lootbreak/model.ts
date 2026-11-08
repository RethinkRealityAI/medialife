// LOOT BREAK rewards: shared types and rules (server, admin page, and the
// Mattercraft game, which talks to /api/lootbreak/*).
//
//   Score rewards  A round that ends on a high enough rarity unlocks a one-time
//                  discount code (5 / 10 / 15 % by default). One score code per
//                  email: beating a higher reward later upgrades it (the old
//                  code is voided), so the code is worth replaying for.
//   Bonus quest    Follow the listed accounts (Instagram, or join a Discord) and
//                  share the result to a story for an extra code (10 % by
//                  default). Follows can't be checked through any API, so the
//                  code is issued straight away and marked "to verify": the team
//                  checks the Instagram handle / Discord username before
//                  honouring it.
//
// Codes are random (crypto), stored server-side and bound to the email that
// claimed them, so a code that isn't in the admin list, or arrives with a
// different email, is fake or shared.

/** TBH's rarity ladder, same thresholds as TIERS in mattercraft/loot-break/LootBreakGame.ts. */
export const LADDER = [
  { name: "Common", at: 0 },
  { name: "Uncommon", at: 6000 },
  { name: "Rare", at: 11000 },
  { name: "Legendary", at: 16000 },
  { name: "Immortal", at: 21000 },
  { name: "Arcana", at: 25000 },
  { name: "Beyond", at: 28500 },
  { name: "Celestial", at: 32000 },
  { name: "Divine", at: 35500 },
  { name: "Cosmic", at: 39000 },
] as const;

/** No real round scores more than this; anything above is refused. */
export const MAX_PLAUSIBLE_SCORE = 60000;
/** Well above the best bot run (about 650 points a second), so a real round never trips it. */
export const MAX_POINTS_PER_SEC = 1000;
/** A claim needs a round ticket at least this old (the shortest round is 20 s). */
export const MIN_ROUND_MS = 18_000;
export const MAX_TICKET_AGE_MS = 3 * 60 * 60 * 1000;

export type RewardRule = { tier: number; percent: number };
export type FollowAccount = { label: string; url: string };
export type FollowPlatform = "instagram" | "discord" | "other";

/** Which app a follow link opens, from its URL. */
export function platformOf(url: string): FollowPlatform {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
    if (h === "discord.gg" || h === "discord.com" || h.endsWith(".discord.com")) return "discord";
  } catch {
    /* not a URL */
  }
  return "other";
}

export type LootSettings = {
  active: boolean;
  /** Sorted by tier, low to high. The best rule the round reached applies. */
  rewards: RewardRule[];
  questEnabled: boolean;
  questPercent: number;
  /** Accounts the bonus quest asks players to follow. The quest only shows when all have a URL. */
  follow: FollowAccount[];
  /** What to tag in the story, e.g. "@medialife.ai @taskbarhero". */
  storyTags: string;
  /** Where codes are spent. */
  shopUrl: string;
  shopLabel: string;
  /** Code prefix, e.g. "TBH" → TBH10-7KQM-X3PF. */
  prefix: string;
  expiryDays: number;
  terms: string;
  updatedAt?: string;
};

export const DEFAULT_SETTINGS: LootSettings = {
  active: true,
  rewards: [
    { tier: 4, percent: 5 }, // Immortal
    { tier: 6, percent: 10 }, // Beyond
    { tier: 7, percent: 15 }, // Celestial
  ],
  questEnabled: true,
  questPercent: 10,
  follow: [
    { label: "MEDIALIFE", url: "https://www.instagram.com/medialife.ai" },
    // TBH's official server (invite from its Steam page); its fans live on Discord.
    { label: "Task Bar Hero", url: "https://discord.gg/8XFeyNYs3Y" },
    { label: "Snowday", url: "https://www.instagram.com/snowdaymediainc" },
  ],
  storyTags: "@medialife.ai @snowdaymediainc",
  shopUrl: "",
  shopLabel: "Shop the drop",
  prefix: "TBH",
  expiryDays: 60,
  terms: "One-time use, one code per order, on TBH merch. Can't be exchanged for cash.",
};

export type CodeKind = "score" | "quest";
export type CodeStatus = "active" | "redeemed" | "void";

export type LootCode = {
  code: string;
  kind: CodeKind;
  percent: number;
  email: string;
  emailHash: string;
  /** The player agreed to hear about drops (unticked by default). */
  consent: boolean;
  status: CodeStatus;
  createdAt: string;
  expiresAt: string;
  /** Score codes: the round that earned it. */
  tier?: number;
  score?: number;
  /** Quest codes: the Instagram handle and Discord username to check, and whether the team checked them. */
  handle?: string;
  discord?: string;
  verified?: boolean;
  redeemedAt?: string;
  /** A score code replaced by a better one. */
  replacedBy?: string;
  note?: string;
};

/** What the game shows for a code. Never includes the full email. */
export type PublicCode = Pick<LootCode, "code" | "kind" | "percent" | "status" | "expiresAt"> & {
  email: string;
  verified?: boolean;
};

export type PublicConfig = {
  active: boolean;
  ladder: string[];
  rewards: RewardRule[];
  quest: null | { percent: number; follow: FollowAccount[]; storyTags: string };
  shopUrl: string;
  shopLabel: string;
  expiryDays: number;
  terms: string;
};

export type ClaimResult =
  | { ok: true; code: PublicCode; upgraded?: boolean; existing?: boolean; message: string }
  | {
      ok: false;
      error:
        | "bad-request"
        | "inactive"
        | "no-reward"
        | "bad-ticket"
        | "too-fast"
        | "used-ticket"
        | "rate-limited"
        | "already-claimed";
      message: string;
      code?: PublicCode;
    };

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const HANDLE_RE = /^@?[A-Za-z0-9._]{1,30}$/;
/** Discord usernames (2-32 of a-z 0-9 . _), or a legacy name#1234. */
export const DISCORD_RE = /^@?(?:[A-Za-z0-9._]{2,32}|[^@#:\s][^@#:]{0,30}[^@#:\s]#\d{4})$/;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const normalizeHandle = (h: string) => `@${h.trim().replace(/^@+/, "").toLowerCase()}`;
export const normalizeDiscord = (d: string) => d.trim().replace(/^@+/, "").toLowerCase();
/** Codes are typed back by people: ignore case, spaces and dashes. */
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** No 0/O, 1/I/L, 5/S: easy to read off a phone and type at a till. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRTUVWXYZ";

export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "***";
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
}

/** The best reward a result reaches, or null. */
export function rewardFor(rules: RewardRule[], tier: number): RewardRule | null {
  let best: RewardRule | null = null;
  for (const r of rules) if (tier >= r.tier && (!best || r.percent > best.percent)) best = r;
  return best;
}

export function cleanSettings(s: Partial<LootSettings> | null | undefined): LootSettings {
  const d = DEFAULT_SETTINGS;
  const v = { ...d, ...(s ?? {}) };
  const clampInt = (n: unknown, a: number, b: number, f: number) => {
    const x = Math.round(Number(n));
    return Number.isFinite(x) ? Math.max(a, Math.min(b, x)) : f;
  };
  const rewards = (Array.isArray(v.rewards) ? v.rewards : d.rewards)
    .map((r) => ({
      tier: clampInt(r?.tier, 1, LADDER.length - 1, 4),
      percent: clampInt(r?.percent, 1, 90, 5),
    }))
    .sort((a, b) => a.tier - b.tier)
    .slice(0, 6);
  const follow = (Array.isArray(v.follow) ? v.follow : d.follow)
    .map((f) => ({
      label: String(f?.label ?? "")
        .trim()
        .slice(0, 40),
      url: cleanUrl(f?.url),
    }))
    .filter((f) => f.label)
    .slice(0, 5);
  return {
    active: !!v.active,
    rewards,
    questEnabled: !!v.questEnabled,
    questPercent: clampInt(v.questPercent, 1, 90, d.questPercent),
    follow,
    storyTags: String(v.storyTags ?? "")
      .trim()
      .slice(0, 120),
    shopUrl: cleanUrl(v.shopUrl),
    shopLabel: String(v.shopLabel || d.shopLabel)
      .trim()
      .slice(0, 30),
    prefix: (
      String(v.prefix || d.prefix)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "") || "TBH"
    ).slice(0, 6),
    expiryDays: clampInt(v.expiryDays, 1, 365, d.expiryDays),
    terms: String(v.terms ?? "")
      .trim()
      .slice(0, 300),
    updatedAt: v.updatedAt,
  };
}

/** https URLs only; anything else becomes "". */
export function cleanUrl(u: unknown): string {
  const s = String(u ?? "").trim();
  if (!s) return "";
  try {
    const url = new URL(s);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** The quest shows only when it's on and every account has a link. */
export function questReady(s: LootSettings): boolean {
  return s.questEnabled && s.follow.length > 0 && s.follow.every((f) => !!f.url);
}

export function publicConfig(s: LootSettings): PublicConfig {
  return {
    active: s.active,
    ladder: LADDER.map((t) => t.name),
    rewards: s.rewards,
    quest: questReady(s)
      ? { percent: s.questPercent, follow: s.follow, storyTags: s.storyTags }
      : null,
    shopUrl: s.shopUrl,
    shopLabel: s.shopLabel,
    expiryDays: s.expiryDays,
    terms: s.terms,
  };
}

export function publicCode(c: LootCode): PublicCode {
  return {
    code: c.code,
    kind: c.kind,
    percent: c.percent,
    status: c.status,
    expiresAt: c.expiresAt,
    email: maskEmail(c.email),
    verified: c.kind === "quest" ? !!c.verified : undefined,
  };
}
