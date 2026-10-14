/**
 * Partners: agencies and talent managers who bring creators into the
 * Activated Merchandise Program (Snowday Media first). Shared by the server
 * and the Partner Hub.
 *
 * A partner has a team (hub accounts with a partner role), creators tied to it
 * (creator.agency.id === partner.id, set by the partner's invite links or by
 * the MEDIALIFE team), referral links, and a collateral library: the
 * MEDIALIFE kit every partner gets plus files made for this partner.
 *
 * Partner ids are the agency slug invite links already use ("snowday-media"),
 * so creators who joined through an earlier invite link are tied up at once.
 */
import { HUB } from "./model";

export type PartnerRole = "admin" | "member";

export const PARTNER_ROLES: Record<PartnerRole, { label: string; blurb: string }> = {
  admin: {
    label: "Admin",
    blurb: "Everything a member can do, plus inviting and removing teammates.",
  },
  member: {
    label: "Member",
    blurb: "Sees creators and collateral, and makes invite and demo links.",
  },
};

export type Partner = {
  /** The agency slug, e.g. "snowday-media". */
  id: string;
  name: string;
  status: "active" | "paused";
  website: string;
  /** Their community server, for the playbook's Discord steps. */
  discordUrl: string;
  /** Colours for the Partner Hub accent and their co-branded collateral. */
  brand: { primary: string; accent: string; ink: string };
  /** Which curated collateral set they get (see collateral.ts). */
  kit: string;
  /** Internal only. */
  notes: string;
  createdAt: number;
  updatedAt: number;
};

/** A hub account's place on a partner team (on the user record). */
export type PartnerMembership = { id: string; role: PartnerRole };

/** The team list on a partner (mirrors the user's membership). */
export type PartnerMember = {
  userId: string;
  partnerId: string;
  email: string;
  name: string;
  role: PartnerRole;
  joinedAt: number;
  invitedBy: string;
};

/** An emailed invitation to join a partner team. The token's secret half is never stored. */
export type PartnerInvite = {
  id: string;
  partnerId: string;
  email: string;
  name: string;
  role: PartnerRole;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
  revokedAt: number | null;
};

export const PARTNER_INVITE_DAYS = 14;

export const PARTNER_BASE = "/partner-hub";

export const partnerIdOk = (s: string) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(s);

export const slugifyPartner = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/* ---------------------------------------------------------------------------
   Library owners. Files are stored per "owner" (files/<owner>/<id>): a
   creator id, the shared MEDIALIFE kit, or one partner's library.
   --------------------------------------------------------------------------- */

export const KIT_OWNER = "medialifekit";
export const partnerOwner = (partnerId: string) => `partner${partnerId.replace(/[^a-z0-9]/g, "")}`;
export const isLibraryOwner = (owner: string) => owner === KIT_OWNER || owner.startsWith("partner");

/* ---------------------------------------------------------------------------
   The creator journey partners explain, five steps. The hub's own stages map
   onto it, so a partner always knows where a creator is.
   --------------------------------------------------------------------------- */

export const JOURNEY = [
  {
    n: 1,
    id: "apply",
    title: "Sign up and onboard",
    short: "Sign up",
    body: "The creator joins the Creator Hub with your invite link and answers a five-step application: channels, audience, the products they'd like.",
    brief: "Joins with your link. A ten-minute application.",
    time: "10 minutes",
    you: "Join the Creator Hub and tell us about your channels, your audience and the products you'd like. About ten minutes.",
  },
  {
    n: 2,
    id: "sign",
    title: "Sign the agreement",
    short: "Sign",
    body: "Once approved, they read and sign the program agreement in the hub: revenue share, approvals, IP. No printing, no PDFs to chase.",
    brief: "Reads and signs the agreement in the hub.",
    time: "1–2 days",
    you: "Once you're approved, read your program agreement in the hub and sign it there: your share, approvals, your IP.",
  },
  {
    n: 3,
    id: "approve",
    title: "Approve the campaign",
    short: "Approve",
    body: "MEDIALIFE designs the products and the immersive experience. The creator reviews the designs, timeline and launch plan and signs each one off. Nothing is made without their yes.",
    brief: "Approves designs and the launch plan.",
    time: "2–4 weeks",
    you: "We design your merch and the experience fans unlock. You review the designs, timeline and launch plan, and nothing is made without your yes.",
  },
  {
    n: 4,
    id: "make",
    title: "Production and distribution",
    short: "Make & ship",
    body: "We produce the merch, program every NFC tag and QR code, launch the store and ship every order. Fans tap the product and the experience opens.",
    brief: "MEDIALIFE makes it, sells it and ships it.",
    time: "3–6 weeks",
    you: "We produce it, program every tag and QR code, open the store and ship every order. Fans tap it and the experience opens.",
  },
  {
    n: 5,
    id: "paid",
    title: "Get paid",
    short: "Get paid",
    body: `Every order and the creator's share show up live in the hub. Earnings are paid out once each order's ${HUB.holdDays}-day returns window has passed.`,
    brief: "Sales show live; paid after returns close.",
    time: "From launch",
    you: `Every order and your share show up live in the hub. Earnings are paid out once each order's ${HUB.holdDays}-day returns window has passed.`,
  },
] as const;

export type JourneyStep = (typeof JOURNEY)[number]["id"];

/** Where a creator is on the five-step journey, from what the hub knows. */
export function journeyStep(input: {
  status: string;
  signed: boolean;
  stages: string[];
  earned: number;
}): JourneyStep {
  if (input.status !== "approved") return "apply";
  if (!input.signed) return "sign";
  const making = ["sampling", "production", "shipping", "live"];
  if (input.stages.some((s) => s === "live") && input.earned > 0) return "paid";
  if (input.stages.some((s) => making.includes(s))) return "make";
  return "approve";
}

/** Snowday Media, the launch partner: what "Set up Snowday Media" fills in. */
export const SNOWDAY_PRESET = {
  id: "snowday-media",
  name: "Snowday Media",
  website: "https://www.snowdaymedia.ca/",
  discordUrl: "",
  brand: { primary: "#405d96", accent: "#96c8ec", ink: "#21254a" },
  kit: "snowday",
} as const;
