/**
 * Program agreements creators sign in the Creator Hub (step 2 of the journey).
 *
 * A template is versioned text in code; it's filled with the creator's own
 * terms (name, revenue share, referring partner) when shown, and the exact
 * text they signed is fingerprinted (SHA-256) into the signature record, so a
 * signature always points at precisely what was on screen.
 *
 * To change the terms: add a new version (never edit a published one), bump
 * CURRENT. Creators who signed an older version are asked to sign the new one.
 *
 * COUNSEL_REVIEWED marks whether a lawyer has approved the current text. The
 * admin shows a warning until it's true; creators never see it.
 */
import { HUB, type Creator } from "./model";

export const COUNSEL_REVIEWED = false;

export type AgreementTerms = {
  legalName: string;
  displayName: string;
  email: string;
  /** 0–1 */
  revenueShare: number;
  partnerName: string | null;
};

export type AgreementSection = { id: string; title: string; paragraphs: string[] };

export type AgreementTemplate = {
  id: "creator-program";
  version: string;
  title: string;
  summary: string[];
  sections: (t: AgreementTerms) => AgreementSection[];
};

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

const CREATOR_PROGRAM_V1: AgreementTemplate = {
  id: "creator-program",
  version: "2026-10.1",
  title: "Activated Merchandise Program agreement",
  summary: [
    "You keep your IP. MEDIALIFE may use it only to make, sell and promote your products.",
    "Nothing is produced until you approve the design in the Creator Hub.",
    "You earn your revenue share on every sale, shown live in the hub.",
    "Either side can end the agreement with 30 days' notice.",
  ],
  sections: (t) => [
    {
      id: "parties",
      title: "1. Who this is between",
      paragraphs: [
        `This agreement is between MEDIALIFE ("we", "us") and ${t.legalName || t.displayName} (${t.displayName}), reachable at ${t.email} ("you").`,
        ...(t.partnerName
          ? [
              `You were introduced to the program by ${t.partnerName}. ${t.partnerName} can see your program status, products, sales and earnings in the MEDIALIFE Partner Hub so they can support you. Any arrangement between you and ${t.partnerName} is separate from this agreement.`,
            ]
          : []),
      ],
    },
    {
      id: "program",
      title: "2. The program",
      paragraphs: [
        "We design physical merchandise with you, attach an immersive digital experience to each product (opened by NFC tag or QR code), produce the products, sell them through our store and approved channels, ship orders and handle customer service and returns.",
        "You give us the artwork, references and feedback we need, review and approve designs, and promote your launches to your audience in your own voice.",
      ],
    },
    {
      id: "ip",
      title: "3. Your intellectual property",
      paragraphs: [
        "You keep all rights to your name, likeness, characters, logos and artwork.",
        "You give us a non-exclusive, worldwide licence to use them only to design, produce, sell, promote and support the products you approve, for as long as this agreement runs and for the sell-off period in section 7.",
        "You confirm you own or have permission to license the material you send us. Designs we create for you are made for your products only; we won't use them for anyone else.",
      ],
    },
    {
      id: "approvals",
      title: "4. Approvals",
      paragraphs: [
        "Every product design, experience and launch plan is shown to you in the Creator Hub. Nothing is produced or published until you approve it there. You can ask for changes before approving.",
      ],
    },
    {
      id: "revenue",
      title: "5. Revenue share and payment",
      paragraphs: [
        `You earn ${pct(t.revenueShare)} of net merchandise revenue on your products, unless a different share is agreed in writing for a specific product and shown in the Creator Hub. Net revenue is what customers pay for the products, after discounts and refunds, excluding taxes and shipping charges.`,
        `Each order's earnings become payable once its ${HUB.holdDays}-day returns window has passed. We pay to the payout details you keep up to date in the Creator Hub. Every order and payout is visible to you there.`,
        "We cover the cost of design, production, the experience, fulfilment and customer service. You don't pay us anything to take part.",
      ],
    },
    {
      id: "promotion",
      title: "6. Promotion and conduct",
      paragraphs: [
        "You agree to tell your audience about launches in a way that follows the advertising rules of the platforms you use, including disclosing the partnership where required.",
        "We may name you and show your approved products in our own marketing and in pitches to partners and retailers.",
      ],
    },
    {
      id: "term",
      title: "7. Term and ending the agreement",
      paragraphs: [
        "This agreement starts when you sign it and continues until either of us ends it with 30 days' written notice (a message in the Creator Hub or an email counts).",
        "After it ends we stop producing your products and may sell remaining stock for up to 90 days. Orders already placed are fulfilled, and the earnings from them are still paid to you.",
      ],
    },
    {
      id: "privacy",
      title: "8. Privacy and confidentiality",
      paragraphs: [
        "We keep your personal details private and use them only to run the program. Customers' personal details are never shared with you; you see orders, countries and totals.",
        "Each of us keeps the other's non-public business information (unreleased designs, sales figures, terms) confidential.",
      ],
    },
    {
      id: "general",
      title: "9. General",
      paragraphs: [
        "This agreement, with the program terms published at medialife.ai/creator-hub/terms, is the whole agreement between us about the program. Changes need a new version signed by you in the Creator Hub.",
        "Neither of us is liable to the other for indirect or consequential losses. Nothing in this agreement limits liability that can't legally be limited.",
        "You confirm you are at least 18, or that a parent or guardian is signing with you.",
      ],
    },
  ],
};

export const AGREEMENTS = { "creator-program": CREATOR_PROGRAM_V1 } as const;
export const CURRENT = CREATOR_PROGRAM_V1;

/** The signed text, as one string: what the fingerprint is taken of. */
export function agreementText(tpl: AgreementTemplate, t: AgreementTerms) {
  return [
    `${tpl.title} (version ${tpl.version})`,
    ...tpl.sections(t).flatMap((s) => [s.title, ...s.paragraphs]),
  ].join("\n\n");
}

/** A signature, kept for the record. Never edited once written. */
export type Signature = {
  id: string;
  creatorId: string;
  agreementId: AgreementTemplate["id"];
  version: string;
  title: string;
  /** The name typed as the signature. */
  signedName: string;
  /** The legal name the agreement was made out to. */
  legalName: string;
  email: string;
  terms: AgreementTerms;
  /** SHA-256 of agreementText() at signing. */
  textHash: string;
  signedAt: number;
  ip: string;
  userAgent: string;
  /** For a creator under 18. */
  guardian: string | null;
};

/** The signature state of a creator for the current agreement. */
export function signatureStatus(signatures: Pick<Signature, "agreementId" | "version">[]) {
  const signedCurrent = signatures.some(
    (s) => s.agreementId === CURRENT.id && s.version === CURRENT.version,
  );
  const signedOlder = !signedCurrent && signatures.some((s) => s.agreementId === CURRENT.id);
  return { signedCurrent, signedOlder };
}

export const nameMatches = (typed: string, legal: string) =>
  typed.trim().replace(/\s+/g, " ").toLowerCase() ===
  legal.trim().replace(/\s+/g, " ").toLowerCase();

/** The terms an agreement is made out with, from the creator's record. */
export function termsFor(c: Creator): AgreementTerms {
  return {
    legalName: c.profile.legalName.trim(),
    displayName: c.profile.displayName.trim(),
    email: c.profile.email,
    revenueShare: c.revenueShare,
    partnerName: c.agency?.name ?? null,
  };
}
