/**
 * The intake form's client state: how it maps to and from the Creator record,
 * what each step validates, and the slice of the profile each step saves.
 *
 * Validation mirrors the zod schemas in src/lib/hub/creator.functions.ts so a
 * step that passes here never bounces off the server.
 */
import {
  PLATFORMS,
  type Creator,
  type CreatorInterests,
  type DesignSupport,
  type PlatformId,
  type SkuId,
} from "@/lib/hub/model";

export const STEPS = [
  { id: "about", label: "About you", title: "Tell us about you" },
  { id: "channels", label: "Your channels", title: "Where do your fans find you?" },
  { id: "contact", label: "Contact", title: "How do we reach you?" },
  { id: "products", label: "Products", title: "What would you like to make?" },
  { id: "review", label: "Review", title: "Check it over and send" },
] as const;

export const LAST_STEP = STEPS.length - 1;

export type ChannelRow = { key: string; platform: PlatformId; handle: string; audience: string };

export type IntakeForm = {
  displayName: string;
  legalName: string;
  country: string;
  timezone: string;
  categories: string[];
  bio: string;
  channels: ChannelRow[];
  primaryKey: string;
  audienceRegions: string;
  discordUsername: string;
  discordId: string;
  businessEmail: string;
  phone: string;
  managerName: string;
  managerEmail: string;
  skus: SkuId[];
  designSupport: DesignSupport;
  timing: CreatorInterests["timing"];
  hasExistingMerch: boolean;
  existingMerchUrl: string;
  experienceIdeas: string;
  notes: string;
};

export type Errors = Record<string, string>;

let rowSeq = 0;
export const newRowKey = () => `row-${Date.now().toString(36)}-${(rowSeq++).toString(36)}`;

export const LIMITS = {
  displayName: 80,
  legalName: 120,
  bio: 600,
  handle: 200,
  audienceRegions: 120,
  discordUsername: 40,
  phone: 40,
  managerName: 80,
  existingMerchUrl: 300,
  experienceIdeas: 1000,
  notes: 2000,
  channels: 12,
} as const;

export function fromCreator(c: Creator): IntakeForm {
  const channels: ChannelRow[] = c.channels.length
    ? c.channels.map((ch, i) => ({
        key: `saved-${i}`,
        platform: ch.platform,
        handle: ch.handle,
        audience: ch.audience == null ? "" : formatAudience(ch.audience),
      }))
    : [{ key: "saved-0", platform: "youtube", handle: "", audience: "" }];
  const primaryIndex = Math.max(
    0,
    c.channels.findIndex((ch) => ch.primary),
  );
  return {
    displayName: c.profile.displayName,
    legalName: c.profile.legalName,
    country: c.profile.country,
    timezone: c.profile.timezone,
    categories: c.profile.categories,
    bio: c.profile.bio,
    channels,
    primaryKey: channels[primaryIndex]?.key ?? channels[0].key,
    audienceRegions: c.profile.audienceRegions,
    discordUsername: c.contact.discordUsername,
    discordId: c.contact.discordId,
    businessEmail: c.contact.businessEmail,
    phone: c.contact.phone,
    managerName: c.contact.managerName,
    managerEmail: c.contact.managerEmail,
    skus: c.interests.skus,
    designSupport: c.interests.designSupport,
    timing: c.interests.timing,
    hasExistingMerch: c.interests.hasExistingMerch,
    existingMerchUrl: c.interests.existingMerchUrl,
    experienceIdeas: c.interests.experienceIdeas,
    notes: c.interests.notes,
  };
}

/* ---------------------------------------------------------------------------
   Audience numbers: "12k", "1.2M", "25,000" → 25000
   --------------------------------------------------------------------------- */

export function parseAudience(raw: string): number | null | "invalid" {
  const s = raw
    .trim()
    .replace(/[,\s_]/g, "")
    .toLowerCase();
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([km]?)\+?$/.exec(s);
  if (!m) return "invalid";
  const mult = m[2] === "m" ? 1_000_000 : m[2] === "k" ? 1_000 : 1;
  const n = Math.round(parseFloat(m[1]) * mult);
  if (!Number.isFinite(n) || n > 2_000_000_000) return "invalid";
  return n;
}

export const formatAudience = (n: number) => n.toLocaleString("en-US");

/* ---------------------------------------------------------------------------
   Validation, per step. Keys are the field keys the step renders; insertion
   order is screen order, so the first key is the first field to focus.
   --------------------------------------------------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidateCtx = { discordConnected: boolean };

export function validateStep(step: number, f: IntakeForm, ctx: ValidateCtx): Errors {
  const e: Errors = {};
  if (step === 0) {
    if (!f.displayName.trim()) e.displayName = "Add the name your fans know you by.";
    if (!f.country.trim()) e.country = "Pick the country you're based in.";
    if (f.bio.length > LIMITS.bio) e.bio = `Keep it under ${LIMITS.bio} characters.`;
  }
  if (step === 1) {
    const filled = f.channels.filter((r) => r.handle.trim());
    f.channels.forEach((r) => {
      const audience = parseAudience(r.audience);
      if (!r.handle.trim()) {
        if (!filled.length || r.audience.trim()) {
          e[`channel.${r.key}.handle`] = filled.length
            ? "Add the handle or link, or remove this channel."
            : "Add at least one channel — your main one is perfect.";
        }
      }
      if (audience === "invalid") {
        e[`channel.${r.key}.audience`] = "Use a number, like 25000 or 25k.";
      }
    });
  }
  if (step === 2) {
    if (!ctx.discordConnected && !f.discordUsername.trim() && !f.discordId.trim()) {
      e.discordUsername = "Add your Discord username — it's where we'll chat about your products.";
    }
    if (f.discordId.trim() && !/^\d{15,22}$/.test(f.discordId.trim())) {
      e.discordId = "A Discord user ID is 17–20 digits, numbers only.";
    }
    if (f.businessEmail.trim() && !EMAIL.test(f.businessEmail.trim())) {
      e.businessEmail = "That email doesn't look right.";
    }
    if (f.managerEmail.trim() && !EMAIL.test(f.managerEmail.trim())) {
      e.managerEmail = "That email doesn't look right.";
    }
  }
  if (step === 3) {
    if (!f.skus.length) e.skus = "Pick at least one product. You can change your mind later.";
  }
  return e;
}

/** The slice of the profile a step writes. The review step writes everything. */
export function payloadFor(step: number, f: IntakeForm) {
  const profile = {
    displayName: f.displayName.trim(),
    legalName: f.legalName.trim(),
    country: f.country.trim(),
    timezone: f.timezone.trim(),
    categories: f.categories,
    bio: f.bio.trim(),
  };
  const channels = f.channels.map((r) => {
    const a = parseAudience(r.audience);
    return {
      platform: r.platform,
      handle: r.handle.trim(),
      audience: typeof a === "number" ? a : null,
      primary: r.key === f.primaryKey,
    };
  });
  const contact = {
    discordUsername: f.discordUsername.trim(),
    discordId: f.discordId.trim(),
    businessEmail: f.businessEmail.trim(),
    phone: f.phone.trim(),
    managerName: f.managerName.trim(),
    managerEmail: f.managerEmail.trim(),
  };
  const interests = {
    skus: f.skus,
    designSupport: f.designSupport,
    timing: f.timing,
    hasExistingMerch: f.hasExistingMerch,
    existingMerchUrl: f.hasExistingMerch ? f.existingMerchUrl.trim() : "",
    experienceIdeas: f.experienceIdeas.trim(),
    notes: f.notes.trim(),
  };
  switch (step) {
    case 0:
      return { profile };
    case 1:
      return { channels, profile: { audienceRegions: f.audienceRegions.trim() } };
    case 2:
      return { contact };
    case 3:
      return { interests };
    default:
      return {
        profile: { ...profile, audienceRegions: f.audienceRegions.trim() },
        channels,
        contact,
        interests,
      };
  }
}

/** The DOM id for a field key (keys may contain dots). */
export const fid = (key: string) => `intake-${key.replace(/[^a-zA-Z0-9-]/g, "-")}`;

/* ---------------------------------------------------------------------------
   Choices
   --------------------------------------------------------------------------- */

export const DESIGN_SUPPORT: Record<DesignSupport, { label: string; blurb: string }> = {
  "have-art": {
    label: "I have artwork ready",
    blurb: "Logos, characters or finished designs. We adapt them for print and the trigger.",
  },
  "need-design": {
    label: "Design it from my references",
    blurb: "Send us your vibe, thumbnails and characters. Our designers do the rest.",
  },
  mix: {
    label: "A mix",
    blurb: "Some art is ready, some needs designing. We'll fill the gaps together.",
  },
};

export const TIMING: Record<CreatorInterests["timing"], string> = {
  asap: "As soon as possible",
  "1-3-months": "In 1–3 months",
  "3-6-months": "In 3–6 months",
  exploring: "Just exploring",
};

export const platformLabel = (p: PlatformId) => PLATFORMS[p].label;

/* ---------------------------------------------------------------------------
   Countries: ISO codes, named by the browser / Node (same ICU names on both).
   --------------------------------------------------------------------------- */

const COMMON = ["US", "GB", "CA", "AU", "IE", "NZ", "DE", "FR", "NL", "SE", "ES", "BR", "MX", "PH"];

const ALL_CODES =
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ AI AS AW BM CW FO GG GI GL GP GU IM JE KY MQ NC PF RE SX VG VI VA VC VE VN VU WS XK YE ZA ZM ZW".split(
    " ",
  );

function regionName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRIES = (() => {
  const named = ALL_CODES.map((code) => ({ code, name: regionName(code) }));
  const common = COMMON.map((code) => named.find((c) => c.code === code)!).filter(Boolean);
  const rest = named.slice().sort((a, b) => a.name.localeCompare(b.name, "en"));
  return { common, rest };
})();

/** "en-GB" → "United Kingdom", for a first guess at the country. */
export function guessCountry(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (region && ALL_CODES.includes(region)) return regionName(region);
  } catch {
    /* ignore */
  }
  return "";
}
