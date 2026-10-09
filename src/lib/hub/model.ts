/**
 * Creator Hub — the shared model.
 *
 * Client-safe: types, the product catalogue, the production pipeline and the
 * pure maths (earnings, pipeline progress). Server code (storage, auth, Shopify)
 * lives in the *.server.ts files beside this one and imports from here, never
 * the other way round.
 *
 * The Creator Hub is the creator-facing side of the Activated Merchandise
 * Program: a creator applies, MEDIALIFE designs, produces and fulfils activated
 * merch with them, and the hub shows every product's progress, its immersive
 * experience and triggers, and the orders and earnings it brings in.
 */

/* ---------------------------------------------------------------------------
   Formatting
   --------------------------------------------------------------------------- */

export const money = (cents: number, currency = "USD") =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 && Math.abs(cents) >= 100_000 ? 0 : 2,
    maximumFractionDigits: 2,
  });

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** "Oct 9, 2026" from an ISO date or timestamp. */
export const shortDate = (iso: string | number) =>
  new Date(
    typeof iso === "number" ? iso : iso.length === 10 ? `${iso}T12:00:00Z` : iso,
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** "3 days ago", "just now" — for activity feeds. */
export function timeAgo(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return shortDate(ts);
}

/* ---------------------------------------------------------------------------
   The program
   --------------------------------------------------------------------------- */

export const HUB = {
  name: "Creator Hub",
  program: "Activated Merchandise Program",
  /** Where the creator-facing app lives. */
  base: "/creator-hub",
  supportEmail: "creators@medialife.ai",
  /** Days after an order before its earnings count as available for payout (returns window). */
  holdDays: 30,
  /** Used when an admin has not set a creator's share yet. Admin-editable per creator and per product. */
  defaultRevenueShare: 0.2,
  /** File uploads: max size, and the chunk size that keeps each request under Netlify's 6 MB. */
  maxUploadBytes: 50 * 1024 * 1024,
  chunkBytes: 4 * 1024 * 1024,
} as const;

/* ---------------------------------------------------------------------------
   The catalogue — what a creator can make with us today
   --------------------------------------------------------------------------- */

export type SkuId = "tee" | "keychain" | "sticker";

export type Sku = {
  id: SkuId;
  name: string;
  short: string;
  /** One line a creator reads on the landing page and the intake form. */
  pitch: string;
  /** How a fan gets from the object into the experience. */
  trigger: string;
  /** Indicative retail band, in whole dollars. */
  priceBand: [number, number];
  /** Indicative weeks from approved design to on-sale. */
  leadWeeks: string;
  image: string;
  alt: string;
};

const MERCH_IMG = "/medialife/activated-retail/assets";

export const SKUS: Record<SkuId, Sku> = {
  tee: {
    id: "tee",
    name: "Activated T-shirt",
    short: "T-shirt",
    pitch: "Your art on a premium tee. Fans scan the print and it comes alive.",
    trigger: "Printed QR in the artwork or an NFC patch on the sleeve",
    priceBand: [35, 45],
    leadWeeks: "4–6",
    image: `${MERCH_IMG}/ml_reward_tee.webp`,
    alt: "A black activated t-shirt with a bold front print.",
  },
  keychain: {
    id: "keychain",
    name: "Activated Keychain",
    short: "Keychain",
    pitch: "An acrylic charm of your character that unlocks a reward on every scan.",
    trigger: "Printed QR on the back of the charm",
    priceBand: [15, 22],
    leadWeeks: "3–5",
    image: `${MERCH_IMG}/ml_reward_keychain.webp`,
    alt: "An acrylic character keychain on a metal clasp.",
  },
  sticker: {
    id: "sticker",
    name: "Activated Sticker",
    short: "Sticker",
    pitch: "Holographic die-cut stickers. Tap or scan to open the experience.",
    trigger: "QR on the backing card or an NFC tag behind the art",
    priceBand: [6, 12],
    leadWeeks: "2–4",
    image: `${MERCH_IMG}/ml_reward_sticker.webp`,
    alt: "A holographic die-cut sticker.",
  },
};

export const SKU_IDS = Object.keys(SKUS) as SkuId[];

/* ---------------------------------------------------------------------------
   The production pipeline — every product moves through these, in order
   --------------------------------------------------------------------------- */

export const STAGES = [
  {
    id: "brief",
    name: "Brief",
    blurb: "We agree the product, the look and what the experience unlocks.",
    owner: "Both",
  },
  {
    id: "artwork",
    name: "Artwork",
    blurb: "You send your logo, characters and references. We prepare the design.",
    owner: "You",
  },
  {
    id: "approval",
    name: "Design approval",
    blurb: "We send a proof. You approve it or ask for changes. Nothing is made until you approve.",
    owner: "You",
  },
  {
    id: "sampling",
    name: "Sample",
    blurb: "A physical sample is made and checked, with the trigger tested on real phones.",
    owner: "MEDIALIFE",
  },
  {
    id: "production",
    name: "Production",
    blurb: "The run is manufactured and every QR or NFC tag is programmed.",
    owner: "MEDIALIFE",
  },
  {
    id: "shipping",
    name: "Shipping",
    blurb: "Stock ships to our fulfilment centre and is checked in.",
    owner: "MEDIALIFE",
  },
  {
    id: "live",
    name: "Live",
    blurb: "On sale. Orders, scans and earnings update here as they happen.",
    owner: "MEDIALIFE",
  },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
export const stageIndex = (id: StageId) => STAGE_IDS.indexOf(id);
export const stageOf = (id: StageId) => STAGES[stageIndex(id)];

/** Products that are being made but are not on sale yet. */
export const isInProduction = (s: StageId) => s !== "live";

/* ---------------------------------------------------------------------------
   Channels — where a creator publishes
   --------------------------------------------------------------------------- */

export type PlatformId =
  "youtube" | "twitch" | "tiktok" | "x" | "instagram" | "kick" | "discord" | "other";

export const PLATFORMS: Record<
  PlatformId,
  { label: string; placeholder: string; urlPrefix: string | null; audience: string }
> = {
  youtube: {
    label: "YouTube",
    placeholder: "@yourchannel",
    urlPrefix: "https://youtube.com/",
    audience: "Subscribers",
  },
  twitch: {
    label: "Twitch",
    placeholder: "yourname",
    urlPrefix: "https://twitch.tv/",
    audience: "Followers",
  },
  tiktok: {
    label: "TikTok",
    placeholder: "@yourname",
    urlPrefix: "https://tiktok.com/",
    audience: "Followers",
  },
  x: { label: "X", placeholder: "@yourname", urlPrefix: "https://x.com/", audience: "Followers" },
  instagram: {
    label: "Instagram",
    placeholder: "@yourname",
    urlPrefix: "https://instagram.com/",
    audience: "Followers",
  },
  kick: {
    label: "Kick",
    placeholder: "yourname",
    urlPrefix: "https://kick.com/",
    audience: "Followers",
  },
  discord: {
    label: "Discord server",
    placeholder: "discord.gg/invite",
    urlPrefix: null,
    audience: "Members",
  },
  other: { label: "Other", placeholder: "https://…", urlPrefix: null, audience: "Audience" },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as PlatformId[];

/** A best-effort link to a channel from what a creator typed. */
export function channelUrl(platform: PlatformId, handle: string): string | null {
  const h = handle.trim();
  if (!h) return null;
  if (/^https?:\/\//i.test(h)) return h;
  const p = PLATFORMS[platform];
  if (platform === "discord") return h.startsWith("discord") ? `https://${h}` : null;
  if (!p.urlPrefix) return null;
  const clean = h.replace(/^@/, "");
  if (platform === "youtube" || platform === "tiktok") return `${p.urlPrefix}@${clean}`;
  return `${p.urlPrefix}${clean}`;
}

export const CONTENT_CATEGORIES = [
  "Gaming",
  "Minecraft",
  "Roblox",
  "Fortnite",
  "Variety",
  "Commentary",
  "Animation / Art",
  "Music",
  "Lifestyle",
  "Comedy",
  "Education",
  "Sports",
  "Other",
] as const;

/* ---------------------------------------------------------------------------
   Records
   --------------------------------------------------------------------------- */

export type Channel = {
  platform: PlatformId;
  handle: string;
  url: string | null;
  /** Approximate audience size, as the creator reported it. */
  audience: number | null;
  primary: boolean;
};

/** Where a creator is in joining the program. */
export type CreatorStatus = "draft" | "submitted" | "approved" | "waitlist" | "declined" | "paused";

export const CREATOR_STATUS: Record<CreatorStatus, { label: string; tone: Tone }> = {
  draft: { label: "Application in progress", tone: "muted" },
  submitted: { label: "Application in review", tone: "primary" },
  approved: { label: "Active creator", tone: "live" },
  waitlist: { label: "Waitlist", tone: "watch" },
  declined: { label: "Not a fit right now", tone: "muted" },
  paused: { label: "Paused", tone: "watch" },
};

export type Tone = "live" | "primary" | "accent" | "watch" | "muted" | "danger";

export type CreatorProfile = {
  displayName: string;
  legalName: string;
  email: string;
  country: string;
  timezone: string;
  bio: string;
  categories: string[];
  /** Where most of their audience is, e.g. "US", "UK", "Global". */
  audienceRegions: string;
};

export type CreatorContact = {
  discordId: string;
  discordUsername: string;
  businessEmail: string;
  phone: string;
  /** Their manager or agency contact, if someone else handles deals. */
  managerName: string;
  managerEmail: string;
};

export type DesignSupport = "have-art" | "need-design" | "mix";

export type CreatorInterests = {
  skus: SkuId[];
  designSupport: DesignSupport;
  /** When they'd like the first drop on sale. */
  timing: "asap" | "1-3-months" | "3-6-months" | "exploring";
  hasExistingMerch: boolean;
  existingMerchUrl: string;
  /** What scanning should open, in their words: an AR moment, a 3D model, a video, a game, a reward… */
  experienceIdeas: string;
  notes: string;
};

export type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type Creator = {
  id: string;
  userId: string;
  status: CreatorStatus;
  createdAt: number;
  updatedAt: number;
  submittedAt: number | null;
  approvedAt: number | null;
  /** Which intake step a draft was last saved on, so a returning creator resumes there. */
  intakeStep: number;
  profile: CreatorProfile;
  channels: Channel[];
  contact: CreatorContact;
  interests: CreatorInterests;
  /** For samples. Optional until a product reaches sampling. */
  shipping: ShippingAddress | null;
  /** How we pay them: an email for PayPal / Wise. Bank details are never stored here. */
  payout: { method: "paypal" | "wise" | "other"; email: string; note: string } | null;
  /** The agency or partner that referred them, from an invite link. */
  agency: { id: string; name: string; rep: string } | null;
  inviteCode: string | null;
  /** Share of net merchandise revenue the creator earns, 0–1. Set by MEDIALIFE. */
  revenueShare: number;
  consent: { termsAt: number | null; marketing: boolean };
};

export type CreatorAdminFields = {
  /** Internal only: never sent to the creator. */
  internalNotes: string;
  /** The MEDIALIFE person looking after them. */
  manager: { name: string; email: string; discord: string };
  tags: string[];
};

/** A file in the hub: creator artwork, MEDIALIFE proofs, launch collateral. */
export type FileKind = "artwork" | "proof" | "collateral" | "mockup";

export type ArtworkCategory = "logo" | "character" | "reference" | "font" | "guidelines" | "other";

export const ARTWORK_CATEGORIES: Record<ArtworkCategory, string> = {
  logo: "Logos & wordmarks",
  character: "Characters & illustrations",
  reference: "References & moodboards",
  font: "Fonts",
  guidelines: "Brand guidelines",
  other: "Other",
};

export type CollateralKind = "poster" | "social" | "qr" | "mockup" | "video" | "other";

export const COLLATERAL_KINDS: Record<CollateralKind, string> = {
  poster: "Posters & print",
  social: "Social posts",
  qr: "QR & NFC artwork",
  mockup: "Product mockups",
  video: "Video",
  other: "Other",
};

export type HubFile = {
  id: string;
  creatorId: string;
  name: string;
  mime: string;
  size: number;
  kind: FileKind;
  /** artwork → ArtworkCategory; collateral → CollateralKind */
  category: string;
  /** Set when a file belongs to one product (a proof, product collateral). */
  productId: string | null;
  note: string;
  uploadedBy: "creator" | "medialife";
  createdAt: number;
  chunks: number;
  /** false while the chunks are still arriving. */
  complete: boolean;
};

export const fileUrl = (f: Pick<HubFile, "creatorId" | "id">, download = false) =>
  `/api/hub/files/${f.creatorId}/${f.id}${download ? "?download=1" : ""}`;

export const isImage = (mime: string) => /^image\/(png|jpe?g|webp|gif|svg\+xml|avif)$/.test(mime);

/** A design proof sent for approval. */
export type Proof = {
  id: string;
  version: number;
  fileId: string;
  note: string;
  createdAt: number;
  decision: "pending" | "approved" | "changes";
  decidedAt: number | null;
  feedback: string;
};

export type TriggerMethod = "qr" | "nfc" | "both";

export const TRIGGER_METHODS: Record<TriggerMethod, { label: string; blurb: string }> = {
  qr: { label: "QR code", blurb: "Printed on the product. Every phone camera opens it." },
  nfc: { label: "NFC tag", blurb: "A chip in the product. Fans tap their phone to it." },
  both: { label: "NFC + QR", blurb: "Tap or scan, so nobody is locked out by their phone." },
};

export type Product = {
  id: string;
  creatorId: string;
  sku: SkuId;
  name: string;
  /** The drop or campaign this product belongs to, e.g. "Winter Drop 2026". */
  campaign: string;
  stage: StageId;
  stageUpdatedAt: number;
  history: Array<{ stage: StageId; at: number; note: string }>;
  /** What MEDIALIFE needs from the creator right now, shown as the product's next step. */
  waitingOn: "creator" | "medialife";
  nextStep: string;
  /** Expected on-sale date (ISO yyyy-mm-dd) — an estimate the team keeps current. */
  eta: string | null;
  /** Retail price in cents. */
  price: number | null;
  currency: string;
  /** Overrides the creator's share for this product. */
  revenueShare: number | null;
  units: number | null;
  proofs: Proof[];
  /** Creator artwork chosen for this product. */
  artworkIds: string[];
  /** The hero image shown on cards: a mockup or proof file id. */
  imageFileId: string | null;
  experienceId: string | null;
  trigger: {
    method: TriggerMethod;
    /** Short code behind medialife.ai/go/<code>: what the QR encodes and the NFC tag opens. */
    code: string;
    placement: string;
  };
  commerce: {
    shopUrl: string;
    /** Matched against incoming orders. */
    shopifyProductIds: string[];
    skus: string[];
  };
  createdAt: number;
  updatedAt: number;
};

export type ExperienceKind = "ar" | "model" | "video" | "game" | "unlock" | "web";

export const EXPERIENCE_KINDS: Record<ExperienceKind, string> = {
  ar: "AR experience",
  model: "3D model",
  video: "Video / video overlay",
  game: "Mini-game",
  unlock: "Reward / unlock",
  web: "Web experience",
};

export type ExperienceStatus = "concept" | "in-build" | "review" | "live";

export const EXPERIENCE_STATUS: Record<ExperienceStatus, { label: string; tone: Tone }> = {
  concept: { label: "Concept", tone: "muted" },
  "in-build": { label: "In build", tone: "accent" },
  review: { label: "Ready for your review", tone: "watch" },
  live: { label: "Live", tone: "live" },
};

export type Experience = {
  id: string;
  creatorId: string;
  name: string;
  kind: ExperienceKind;
  status: ExperienceStatus;
  description: string;
  /** What a fan gets for scanning. */
  reward: string;
  /** Where /go/<code> sends a fan. Until it is live, a holding page. */
  url: string;
  /** Link for the creator to try it before launch. */
  previewUrl: string;
  imageFileId: string | null;
  createdAt: number;
  updatedAt: number;
};

/** One creator's slice of an order. A multi-creator order is stored once per creator. */
export type OrderLine = {
  productId: string;
  name: string;
  sku: string;
  qty: number;
  /** Per-unit price, cents. */
  unitPrice: number;
  /** Line discounts, cents. */
  discount: number;
  /** Refunded amount on this line, cents. */
  refunded: number;
  refundedQty: number;
  /** The creator's share for this line at the time of sale. */
  share: number;
};

export type OrderSource = "shopify" | "manual" | "other";

export type Order = {
  /** `${source}-${externalId}` — idempotent, so a re-delivered webhook overwrites. */
  id: string;
  creatorId: string;
  source: OrderSource;
  /** Store or channel name, e.g. "shop.medialife.ai" or "TikTok Shop". */
  channel: string;
  externalId: string;
  number: string;
  createdAt: number;
  currency: string;
  status: "paid" | "partially-refunded" | "refunded" | "cancelled";
  /** Buyer country (ISO 2), for the regional breakdown. No buyer names or emails are stored. */
  country: string | null;
  lines: OrderLine[];
};

export type Payout = {
  id: string;
  creatorId: string;
  /** cents */
  amount: number;
  currency: string;
  periodLabel: string;
  paidAt: number;
  reference: string;
};

export type ActivityKind =
  | "account"
  | "application"
  | "stage"
  | "proof"
  | "decision"
  | "file"
  | "experience"
  | "order"
  | "payout"
  | "message";

export type Activity = {
  id: string;
  kind: ActivityKind;
  at: number;
  title: string;
  body: string;
  productId: string | null;
  /** Something the creator has to act on. */
  actionable: boolean;
};

export type Message = {
  id: string;
  author: "creator" | "medialife";
  name: string;
  body: string;
  at: number;
};

export type Invite = {
  code: string;
  agencyId: string | null;
  agencyName: string | null;
  /** The person at the agency who sent it, for attribution. */
  rep: string;
  note: string;
  createdAt: number;
  uses: number;
  archived: boolean;
};

/** Daily scan counts for one product's trigger. */
export type ScanStats = {
  total: number;
  byDay: Record<string, number>;
  lastAt: number | null;
};

/* ---------------------------------------------------------------------------
   Earnings — pure, so the dashboard and the admin agree to the cent
   --------------------------------------------------------------------------- */

export const lineGross = (l: OrderLine) => l.unitPrice * l.qty;
/** Net merchandise revenue: price × qty, less discounts and refunds. Tax and shipping are never in it. */
export const lineNet = (l: OrderLine) => Math.max(0, lineGross(l) - l.discount - l.refunded);
export const lineEarning = (l: OrderLine) => Math.round(lineNet(l) * l.share);
export const lineUnits = (l: OrderLine) => Math.max(0, l.qty - l.refundedQty);

export type EarningsSummary = {
  currency: string;
  orders: number;
  units: number;
  gross: number;
  net: number;
  earned: number;
  /** Earned but still inside the returns window. */
  pending: number;
  /** Earned, out of the returns window, not yet paid. */
  available: number;
  paid: number;
};

export function summarizeEarnings(
  orders: Order[],
  payouts: Payout[],
  now = Date.now(),
  holdDays: number = HUB.holdDays,
): EarningsSummary {
  const holdMs = holdDays * 86_400_000;
  let units = 0;
  let gross = 0;
  let net = 0;
  let earned = 0;
  let matured = 0;
  let count = 0;
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    count++;
    let orderEarned = 0;
    for (const l of o.lines) {
      units += lineUnits(l);
      gross += lineGross(l);
      net += lineNet(l);
      orderEarned += lineEarning(l);
    }
    earned += orderEarned;
    if (now - o.createdAt >= holdMs) matured += orderEarned;
  }
  const paid = payouts.reduce((s, p) => s + p.amount, 0);
  return {
    currency: orders[0]?.currency ?? payouts[0]?.currency ?? "USD",
    orders: count,
    units,
    gross,
    net,
    earned,
    pending: earned - matured,
    available: Math.max(0, matured - paid),
    paid,
  };
}

/** Units and earnings per product, for the earnings table and product cards. */
export function earningsByProduct(orders: Order[]) {
  const out = new Map<string, { units: number; net: number; earned: number; orders: number }>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const seen = new Set<string>();
    for (const l of o.lines) {
      const r = out.get(l.productId) ?? { units: 0, net: 0, earned: 0, orders: 0 };
      r.units += lineUnits(l);
      r.net += lineNet(l);
      r.earned += lineEarning(l);
      if (!seen.has(l.productId)) {
        r.orders++;
        seen.add(l.productId);
      }
      out.set(l.productId, r);
    }
  }
  return out;
}

/** Daily net revenue and earnings, oldest first, for the chart. Days with no orders are zero. */
export function earningsByDay(orders: Order[], days: number, now = Date.now()) {
  const buckets = new Map<string, { date: string; net: number; earned: number; units: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(date, { date, net: 0, earned: 0, units: 0 });
  }
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const b = buckets.get(new Date(o.createdAt).toISOString().slice(0, 10));
    if (!b) continue;
    for (const l of o.lines) {
      b.net += lineNet(l);
      b.earned += lineEarning(l);
      b.units += lineUnits(l);
    }
  }
  return [...buckets.values()];
}

/* ---------------------------------------------------------------------------
   What the creator should do next
   --------------------------------------------------------------------------- */

/** Profile fields that make an application complete enough to submit. */
export function intakeGaps(c: Creator): string[] {
  const gaps: string[] = [];
  if (!c.profile.displayName.trim()) gaps.push("Your creator name");
  if (!c.profile.email.trim()) gaps.push("A contact email");
  if (!c.channels.some((ch) => ch.handle.trim())) gaps.push("At least one channel");
  if (!c.contact.discordUsername.trim() && !c.contact.discordId.trim()) gaps.push("Your Discord");
  if (!c.interests.skus.length) gaps.push("The products you're interested in");
  if (!c.consent.termsAt) gaps.push("Agreeing to the program terms");
  return gaps;
}

export function totalAudience(channels: Channel[]) {
  return channels.reduce((s, c) => s + (c.audience ?? 0), 0);
}

export const emptyCreator = (
  id: string,
  userId: string,
  email: string,
  now = Date.now(),
): Creator => ({
  id,
  userId,
  status: "draft",
  createdAt: now,
  updatedAt: now,
  submittedAt: null,
  approvedAt: null,
  intakeStep: 0,
  profile: {
    displayName: "",
    legalName: "",
    email,
    country: "",
    timezone: "",
    bio: "",
    categories: [],
    audienceRegions: "",
  },
  channels: [],
  contact: {
    discordId: "",
    discordUsername: "",
    businessEmail: "",
    phone: "",
    managerName: "",
    managerEmail: "",
  },
  interests: {
    skus: [],
    designSupport: "mix",
    timing: "1-3-months",
    hasExistingMerch: false,
    existingMerchUrl: "",
    experienceIdeas: "",
    notes: "",
  },
  shipping: null,
  payout: null,
  agency: null,
  inviteCode: null,
  revenueShare: HUB.defaultRevenueShare,
  consent: { termsAt: null, marketing: false },
});

/** The public activation link a product's QR code encodes and its NFC tag opens. */
export const triggerUrl = (origin: string, code: string) =>
  `${origin.replace(/\/$/, "")}/go/${code}`;
