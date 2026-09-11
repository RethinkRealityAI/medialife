/**
 * Campaign registry for LIVE NOW.
 *
 * Add or retire campaigns by editing this file — the homepage section and the
 * /live route both read from it, so rotating what is in market never requires
 * touching layout code.
 *
 * `status` drives placement and is deliberately not free text:
 *   live        → LIVE NOW section on the homepage, LIVE block on /live
 *   coming-soon → IN DEVELOPMENT block on /live. Never labelled live.
 *   archive     → SELECTED WORK on /live. Retire a campaign by moving it here
 *                 rather than deleting it.
 *
 * Roblox may be named ONLY as a factual descriptor of Evade itself ("one of
 * the biggest games on Roblox"). It must never appear in a sentence describing
 * MEDIALIFE's own commerce, entitlements or infrastructure — that would imply a
 * platform relationship the approved brief says is not cleared.
 *
 * Claims discipline: every line here is either publicly verifiable or drawn
 * from approved MEDIALIFE materials. Do not add distribution quantities,
 * performance data, retailer counts, campaign dates, platform approvals or
 * partner-relationship language that has not been approved.
 */

export type CampaignStatus = "live" | "coming-soon" | "archive";

export type Campaign = {
  slug: string;
  status: CampaignStatus;
  /** Short status chip, e.g. "LIVE NOW" */
  statusLabel: string;
  /** IP or program name */
  name: string;
  /** Format descriptor under the name */
  kicker: string;
  headline: string;
  body: string[];
  /** Small mono facts. Keep to approved claims only. */
  facts: { k: string; v: string }[];
  cta?: { label: string; href: string; external?: boolean };
  secondary?: { label: string; href: string; external?: boolean };
  /**
   * Optional key art. Drop a file into public/live/ and reference it here —
   * the layout falls back to a typographic treatment when absent, so a
   * campaign can go up before artwork clears approval.
   */
  image?: { src: string; alt: string; large?: string; caption?: string };
  /** Shown as a muted note under the card. Use for approval caveats. */
  note?: string;
};

export const CAMPAIGNS: Campaign[] = [
  {
    slug: "one-piece",
    status: "live",
    statusLabel: "Live now",
    name: "ONE PIECE",
    kicker: "Activated print · App-free immersive media",
    headline: "ONE PIECE, activated in the physical world.",
    body: [
      "MEDIALIFE is currently deploying an app-free immersive experience around ONE PIECE, turning promotional media into an interactive entry point for fans.",
      "Scan the activated physical media to launch the experience directly in the mobile browser — no app required.",
    ],
    facts: [
      { k: "Format", v: "Activated print" },
      { k: "Access", v: "Scan QR to activate" },
      { k: "Surface", v: "Promotional media" },
    ],
    cta: { label: "Experience it", href: "https://netflix.medialife.ai/", external: true },
    secondary: { label: "Activate Your IP", href: "/contact" },
    image: {
      src: "/live/one-piece-poster.webp",
      large: "/live/one-piece-poster-large.webp",
      alt: "THE ONE PIECE activated poster — Den of Geek animation special edition in partnership with Netflix, carrying a scan-to-begin QR code",
      caption: "Activated poster · Scan to begin your journey",
    },
  },
  {
    slug: "evade",
    status: "coming-soon",
    statusLabel: "Coming soon",
    name: "EVADE",
    kicker: "Game-native merch · Activated collectible",
    headline: "EVADE / GAME-NATIVE MERCH",
    body: [
      "MEDIALIFE is developing a limited-edition activated acrylic keychain co-produced with Evade, one of the biggest games on Roblox, combining physical merchandise, an immersive QR-activated experience, and game-native commerce infrastructure.",
    ],
    facts: [
      { k: "Format", v: "Activated collectible" },
      { k: "Access", v: "QR-activated experience" },
      { k: "Status", v: "Coming soon" },
    ],
    secondary: { label: "Get notified", href: "/contact" },
    image: {
      src: "/merch/keychain-cutout.webp",
      alt: "BOBO and ΣCLIPSE acrylic keychain set from the MediaLife.AI × EVADE program",
    },
    note: "Platform-specific commerce features and digital benefits are subject to applicable approvals.",
  },
];

export const liveCampaigns = () => CAMPAIGNS.filter((c) => c.status === "live");
export const comingSoonCampaigns = () => CAMPAIGNS.filter((c) => c.status === "coming-soon");
export const archivedCampaigns = () => CAMPAIGNS.filter((c) => c.status === "archive");
