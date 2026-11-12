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
  /** One line for the homepage teaser. /live carries the full story, so keep this short and different. */
  teaser: string;
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
  /** /live only: how a fan tries it, step by step. */
  steps?: string[];
  /** /live only: every experience the campaign opens, each with its own link. */
  ways?: {
    title: string;
    body: string;
    href: string;
    external?: boolean;
    image: string;
    alt: string;
    /** e.g. "Coming soon". Absent means it works today. */
    status?: string;
  }[];
  /** /live only: where to read more about the wider program. */
  related?: { label: string; href: string };
};

export const CAMPAIGNS: Campaign[] = [
  {
    slug: "one-piece",
    status: "live",
    statusLabel: "Live now",
    name: "ONE PIECE",
    kicker: "Activated print · App-free immersive media",
    headline: "ONE PIECE, activated in the physical world.",
    teaser: "Scan the poster and the art comes alive in the phone browser.",
    body: [
      "MEDIALIFE is currently deploying an app-free immersive experience around ONE PIECE, turning promotional media into an interactive entry point for fans.",
      "Scan the poster and the experience opens straight in the phone browser. No app to install.",
    ],
    facts: [
      { k: "Format", v: "Activated print" },
      { k: "Access", v: "Scan QR to activate" },
      { k: "Surface", v: "Promotional media" },
    ],
    cta: { label: "Experience it", href: "https://netflix.medialife.ai/", external: true },
    image: {
      src: "/live/one-piece-poster.webp",
      large: "/live/one-piece-poster-large.webp",
      alt: "THE ONE PIECE activated poster — Den of Geek animation special edition in partnership with Netflix, carrying a scan-to-begin QR code",
      caption: "Activated poster · Scan to begin your journey",
    },
    steps: [
      "Find the activated ONE PIECE poster.",
      "Scan its QR with your phone camera.",
      "The experience opens in the browser. Nothing to install.",
    ],
    related: {
      label: "Same Netflix program: the Sakamoto Days results",
      href: "/case-studies#sakamoto-days",
    },
  },
  {
    slug: "evade",
    status: "live",
    statusLabel: "Out now",
    name: "EVADE × Bobo",
    kicker: "Activated collectible · Browser game",
    headline: "Bobo, off the screen.",
    teaser:
      "One keychain, two experiences: scan it for Cola Run, or point your camera and Bobo jumps Off the Chain.",
    body: [
      "Bobo the cat and the Eclipse can on one acrylic charm set, made with EVADE. One product opens two experiences: scan the QR on the back of the can for Cola Run, or point your camera at the charms and Bobo jumps Off the Chain.",
      "Every clip fans record lands on the Where is Bobo? globe, and owners get first access to Bobo's Hideout.",
    ],
    facts: [
      { k: "Format", v: "Activated collectible" },
      { k: "Access", v: "QR on the back of the can" },
      { k: "Unlocks", v: "Cola Run · Off the Chain" },
    ],
    cta: { label: "See the launch", href: "/evade/" },
    secondary: {
      label: "Get the keychain",
      href: "https://shop.medialife.ai/products/bobo-eclipse-ar-keychain-set",
      external: true,
    },
    image: {
      // The current keychain: Bobo the cat + the Eclipse can (the old
      // avatar-style /merch/keychain-cutout.webp is outdated).
      src: "/activated-merch/posters/evade-charms.webp",
      alt: "Bobo the cat and Eclipse can acrylic charm set from the MEDIALIFE × EVADE program",
    },
    steps: [
      "Get the Bobo × Eclipse charm set.",
      "Scan the QR on the back of the can to play Cola Run.",
      "Open Off the Chain and point your camera at the charms.",
    ],
    ways: [
      {
        title: "Cola Run",
        body: "Scan the QR on the back of the can. Fly with Bobo and grab every can, right in the browser.",
        href: "https://evade.medialife.ai",
        external: true,
        image: "/evade/creators/assets/img/cola-run-splash-sm.webp",
        alt: "The Cola Run start screen: Bobo flying through Eclipse cans",
      },
      {
        title: "Off the Chain",
        body: "Point your camera at the charms and Bobo and the Eclipse can jump off the keychain in 3D. Feed Bobo, then film it.",
        href: "/evade/keychain-ar/",
        image: "/evade/img/off-the-chain-card.webp",
        alt: "A phone pointed at the keychain shows the charms empty, with 3D Bobo and the Eclipse can standing in front of it",
      },
      {
        title: "Where is Bobo?",
        body: "Every Bobo clip fans record is pinned to a live 3D globe, at the place it was filmed.",
        href: "/evade/where-is-bobo/",
        image: "/evade/creators/assets/video/bobo-golden-gate.webp",
        alt: "Bobo in AR at the Golden Gate Bridge, recorded on a fan's phone",
      },
      {
        title: "Bobo's Hideout",
        body: "A collector hub for keychain owners: rewards, invites, giveaways and owner-only discounts.",
        href: "/evade/#hideout",
        image: "/evade/hideout/room.webp",
        alt: "Bobo's Hideout: a two-floor room inside a giant Eclipse can",
        status: "Coming soon",
      },
    ],
  },
];

export const liveCampaigns = () => CAMPAIGNS.filter((c) => c.status === "live");
export const comingSoonCampaigns = () => CAMPAIGNS.filter((c) => c.status === "coming-soon");
export const archivedCampaigns = () => CAMPAIGNS.filter((c) => c.status === "archive");
