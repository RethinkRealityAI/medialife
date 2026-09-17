/**
 * Mock data for the Activated Merchandise Program partner portal.
 *
 * Every figure here is either taken from the MEDIALIFE × Roblox commercialization
 * proposal (pilot shape, economics, measures, operating responsibilities) or is
 * illustrative sample data standing in for a live pilot that has not run yet.
 * The portal shows a persistent demo banner for exactly that reason.
 *
 * EVADE is the one real property: MEDIALIFE has secured the licensing rights and
 * begun product and immersive development, and it is the proposal's first pilot.
 * The other rows in the submission queue are placeholder properties, invented to
 * show what the queue looks like with more than one thing in it.
 *
 * When this becomes a real product, this module is the seam: swap it for API
 * calls and every screen keeps working.
 */

/* ---------------------------------------------------------------------------
   Program shape
   --------------------------------------------------------------------------- */

export const PROGRAM = {
  name: "Activated Merchandising Program",
  short: "AMP",
  partner: "Roblox",
  reviewDays: 90,
  /** What a property moves through, in order. From the proposal's onboarding workflow. */
  stages: [
    {
      id: "review",
      name: "Review",
      blurb: "IP, ownership, game and audience information is submitted and assessed for fit.",
    },
    {
      id: "product",
      name: "Product development",
      blurb: "Assortment design, sampling, sourcing and the immersive experience build.",
    },
    {
      id: "commerce",
      name: "Commerce validation",
      blurb: "A limited assortment goes live for a defined test period against defined measures.",
    },
    {
      id: "retail",
      name: "Retail consideration",
      blurb: "Properties that clear the measures are assessed for wholesale and retail channels.",
    },
  ],
} as const;

export type StageId = (typeof PROGRAM.stages)[number]["id"];

/* ---------------------------------------------------------------------------
   Economics — the modelling assumptions from the proposal
   --------------------------------------------------------------------------- */

export const ECONOMICS = {
  categoriesModelled: 6,
  priceFloor: 15,
  priceCeiling: 70,
  onPlatform: {
    label: "On-platform",
    robloxEconomics: 0.08,
    ipRoyalty: 0.1,
    commerceFee: 0.0275,
    contingency: 0.02,
    marginLow: 0.17,
    marginHigh: 0.51,
  },
  retail: {
    label: "Retail / wholesale",
    robloxEconomics: 0.05,
    ipRoyalty: 0.04,
    commerceFee: null,
    contingency: 0.02,
    marginLow: 0.12,
    marginHigh: 0.59,
  },
  leadTimes: [
    { region: "U.S. production", weeks: "4–7", use: "Speed and low minimums" },
    { region: "China production", weeks: "6–13", use: "Unit cost at volume" },
  ],
  disclaimer:
    "Illustrative working model based on current sourcing, royalty and channel assumptions. " +
    "Final economics are subject to SKU selection, production quotations and Roblox / IP-holder terms.",
} as const;

/* ---------------------------------------------------------------------------
   Who does what
   --------------------------------------------------------------------------- */

export const RESPONSIBILITIES = [
  {
    party: "MEDIALIFE",
    tone: "primary" as const,
    items: [
      "Product and assortment development",
      "Production and supplier management",
      "Inventory planning",
      "Immersive experience production",
      "Order fulfillment",
      "Analytics and program reporting",
      "Retail recommendation for validated products",
    ],
  },
  {
    party: "IP holders",
    tone: "accent" as const,
    items: ["Property selection", "IP and creative approvals", "Commerce integration"],
  },
  {
    party: "Roblox",
    tone: "muted" as const,
    items: ["AMP onboarding / authorization", "Appropriate commerce and platform support"],
  },
];

/* ---------------------------------------------------------------------------
   Properties in the program
   --------------------------------------------------------------------------- */

export type Submission = {
  id: string;
  property: string;
  studio: string;
  /** Path under public/, or null to fall back to a generated monogram. */
  logo: string | null;
  genre: string;
  submitted: string;
  stage: StageId;
  /** 0–100 within the current stage. */
  stageProgress: number;
  status: "active" | "in-review" | "approved" | "needs-info";
  monthlyVisits: number;
  skus: number;
  /** Only set once a property is live in commerce validation. */
  liveSince: string | null;
  note: string;
};

export const SUBMISSIONS: Submission[] = [
  {
    id: "amp-001",
    property: "EVADE",
    studio: "Hexagon Development",
    logo: "/work/evade-logo.webp",
    genre: "Horror / Survival",
    submitted: "2026-06-02",
    stage: "commerce",
    stageProgress: 62,
    status: "active",
    monthlyVisits: 41_800_000,
    skus: 4,
    liveSince: "2026-08-14",
    note: "Pilot property. Licensing secured; activated keychain and t-shirt live, hoodie in sampling.",
  },
  {
    id: "amp-002",
    property: "Neon Circuit",
    studio: "Sample Studio A",
    logo: null,
    genre: "Racing",
    submitted: "2026-08-19",
    stage: "product",
    stageProgress: 45,
    status: "active",
    monthlyVisits: 12_400_000,
    skus: 3,
    liveSince: null,
    note: "Sample row. Assortment locked at three SKUs; first samples due back from the factory.",
  },
  {
    id: "amp-003",
    property: "Tower Siege",
    studio: "Sample Studio B",
    logo: null,
    genre: "Tower defence",
    submitted: "2026-09-04",
    stage: "review",
    stageProgress: 80,
    status: "in-review",
    monthlyVisits: 6_900_000,
    skus: 0,
    liveSince: null,
    note: "Sample row. IP and ownership documentation received; assortment fit under assessment.",
  },
  {
    id: "amp-004",
    property: "Skybound Co.",
    studio: "Sample Studio C",
    logo: null,
    genre: "Simulator",
    submitted: "2026-09-11",
    stage: "review",
    stageProgress: 25,
    status: "needs-info",
    monthlyVisits: 3_100_000,
    skus: 0,
    liveSince: null,
    note: "Sample row. Waiting on proof of IP ownership and a creative asset pack.",
  },
];

/** The property the portal opens on. */
export const ACTIVE = SUBMISSIONS[0];

/* ---------------------------------------------------------------------------
   The assortment
   --------------------------------------------------------------------------- */

export type ProductStatus = "live" | "sampling" | "design" | "proposed";

export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  status: ProductStatus;
  activation: string;
  /** Where it is made, which drives the lead time. */
  sourcing: "U.S." | "China";
  leadWeeks: string;
  marginOnPlatform: number;
  unitsCommitted: number;
  note: string;
};

export const PRODUCTS: Product[] = [
  {
    id: "evade-keychain",
    name: "Activated Keychain",
    category: "Keychains / pins",
    price: 18,
    status: "live",
    activation: "NFC in the charm body + printed QR on the backing card",
    sourcing: "China",
    leadWeeks: "6–13",
    marginOnPlatform: 0.51,
    unitsCommitted: 2000,
    note: "Proven at RDC 2026 as the activated proof of concept. Highest attach rate in the assortment.",
  },
  {
    id: "evade-tee",
    name: "Activated T-Shirt",
    category: "T-shirts",
    price: 32,
    status: "live",
    activation: "Woven NFC label and a printed code on the inner hem",
    sourcing: "U.S.",
    leadWeeks: "4–7",
    marginOnPlatform: 0.38,
    unitsCommitted: 2000,
    note: "Volume driver. U.S. sourced for the pilot so replenishment can keep pace with the test.",
  },
  {
    id: "evade-hoodie",
    name: "Activated Hoodie",
    category: "Hoodies",
    price: 68,
    status: "sampling",
    activation: "NFC chip in the left cuff, code on the inner hem",
    sourcing: "China",
    leadWeeks: "6–13",
    marginOnPlatform: 0.44,
    unitsCommitted: 750,
    note: "First samples in hand; fit and hand-feel approval pending with the IP holder.",
  },
  {
    id: "evade-figure",
    name: "Activated Vinyl Figure",
    category: "Plush / figures",
    price: 42,
    status: "design",
    activation: "NFC in the base",
    sourcing: "China",
    leadWeeks: "6–13",
    marginOnPlatform: 0.29,
    unitsCommitted: 0,
    note: "Character sculpt in development. Needs IP-holder sign-off before tooling is committed.",
  },
  {
    id: "evade-stickers",
    name: "Activated Sticker Bundle",
    category: "Sticker bundles",
    price: 15,
    status: "proposed",
    activation: "Printed code on the backing card",
    sourcing: "U.S.",
    leadWeeks: "4–7",
    marginOnPlatform: 0.47,
    unitsCommitted: 0,
    note: "Entry price point. Proposed for the second wave if the pilot clears its measures.",
  },
  {
    id: "evade-mousepad",
    name: "Activated Deskmat",
    category: "Mousepads",
    price: 30,
    status: "proposed",
    activation: "NFC under the stitched edge",
    sourcing: "China",
    leadWeeks: "6–13",
    marginOnPlatform: 0.35,
    unitsCommitted: 0,
    note: "Sits under the mouse of the exact person who plays the experience. Second wave.",
  },
];

/* ---------------------------------------------------------------------------
   Measurement — the two families of measures from the proposal
   --------------------------------------------------------------------------- */

export type Measure = {
  id: string;
  label: string;
  value: string;
  /** Change against the previous 30 days. Null where there is no prior period. */
  delta: number | null;
  hint: string;
};

export const COMMERCIAL_MEASURES: Measure[] = [
  {
    id: "views",
    label: "Product views",
    value: "184,220",
    delta: 0.22,
    hint: "Views across the on-platform storefront in the last 30 days.",
  },
  {
    id: "conversion",
    label: "View-to-order conversion",
    value: "2.4%",
    delta: 0.003,
    hint: "Orders divided by product views.",
  },
  {
    id: "units",
    label: "Units sold",
    value: "4,418",
    delta: 0.31,
    hint: "Across all live SKUs since the pilot opened.",
  },
  {
    id: "sellthrough",
    label: "Sell-through",
    value: "68%",
    delta: 0.12,
    hint: "Against the limited inventory committed for the validation window.",
  },
  {
    id: "reorder",
    label: "Reorder velocity",
    value: "11 days",
    delta: -0.18,
    hint: "Median time between a buyer's first and second order. Lower is better.",
  },
  {
    id: "aov",
    label: "Average order value",
    value: "$41.80",
    delta: 0.06,
    hint: "Basket size across the live assortment.",
  },
];

export const ENGAGEMENT_MEASURES: Measure[] = [
  {
    id: "activations",
    label: "Unique activations",
    value: "3,004",
    delta: 0.27,
    hint: "Distinct units tapped or scanned at least once.",
  },
  {
    id: "activation-rate",
    label: "Activation rate",
    value: "68%",
    delta: 0.09,
    hint: "Share of units sold that have been activated at least once.",
  },
  {
    id: "repeat",
    label: "Repeat interactions",
    value: "5.46",
    delta: 0.14,
    hint: "Average activations per activated unit. A unit that keeps working.",
  },
  {
    id: "dwell",
    label: "Engagement time",
    value: "3:22",
    delta: 0.08,
    hint: "Median time inside the immersive experience per activation.",
  },
  {
    id: "cta",
    label: "Call-to-action rate",
    value: "35%",
    delta: 0.05,
    hint: "Share of experiences that ended on the reward or link being taken.",
  },
  {
    id: "outbound",
    label: "Outbound to Roblox",
    value: "1,052",
    delta: 0.24,
    hint: "Sessions routed from a physical product back into the experience.",
  },
];

/** Weekly series for the performance charts. Week 1 is the pilot's first live week. */
export const WEEKLY = [
  { week: "W1", units: 214, activations: 121, outbound: 38 },
  { week: "W2", units: 268, activations: 168, outbound: 52 },
  { week: "W3", units: 331, activations: 221, outbound: 74 },
  { week: "W4", units: 402, activations: 284, outbound: 96 },
  { week: "W5", units: 388, activations: 301, outbound: 108 },
  { week: "W6", units: 451, activations: 356, outbound: 129 },
  { week: "W7", units: 523, activations: 402, outbound: 151 },
  { week: "W8", units: 566, activations: 447, outbound: 168 },
  { week: "W9", units: 612, activations: 489, outbound: 186 },
  { week: "W10", units: 643, activations: 515, outbound: 200 },
];

/** Units by SKU, for the price-point read the proposal calls for. */
export const BY_SKU = [
  { sku: "Keychain", units: 2140, price: 18 },
  { sku: "T-Shirt", units: 1583, price: 32 },
  { sku: "Hoodie", units: 695, price: 68 },
];

/** Where demand is coming from. */
export const BY_REGION = [
  { region: "United States", units: 2438, share: 0.55 },
  { region: "United Kingdom", units: 619, share: 0.14 },
  { region: "Canada", units: 486, share: 0.11 },
  { region: "Australia", units: 353, share: 0.08 },
  { region: "Germany", units: 265, share: 0.06 },
  { region: "Rest of world", units: 257, share: 0.06 },
];

/* ---------------------------------------------------------------------------
   The 90-day review
   --------------------------------------------------------------------------- */

export type Gate = {
  id: string;
  measure: string;
  target: string;
  actual: string;
  /** Where the pilot stands against the gate today. */
  state: "clear" | "on-track" | "watch";
  note: string;
};

export const REVIEW = {
  windowStart: "2026-08-14",
  windowEnd: "2026-11-12",
  dayOf: 62,
  totalDays: 90,
  gates: [
    {
      id: "sellthrough",
      measure: "Sell-through",
      target: "≥ 60%",
      actual: "68%",
      state: "clear",
      note: "Clears the gate with four weeks still to run. Keychain is carrying it.",
    },
    {
      id: "activation",
      measure: "Activation rate",
      target: "≥ 50%",
      actual: "68%",
      state: "clear",
      note: "Well clear. Supports the case that the activation is the differentiator, not a novelty.",
    },
    {
      id: "outbound",
      measure: "Outbound to Roblox",
      target: "≥ 1,000 sessions",
      actual: "1,052",
      state: "clear",
      note: "Just cleared this week. The number Roblox cares about most.",
    },
    {
      id: "margin",
      measure: "Blended contribution margin",
      target: "≥ 35%",
      actual: "41%",
      state: "clear",
      note: "Ahead of model, helped by the keychain's mix share.",
    },
    {
      id: "repeat",
      measure: "Repeat interactions per unit",
      target: "≥ 3.0",
      actual: "5.46",
      state: "clear",
      note: "The strongest signal in the pilot.",
    },
    {
      id: "hoodie",
      measure: "Hoodie sell-through",
      target: "≥ 50%",
      actual: "34%",
      state: "watch",
      note: "The $68 price point is the slowest mover. Worth a read before the assortment widens.",
    },
  ] satisfies Gate[],
  decisions: [
    {
      id: "reorder",
      title: "Reorder the keychain",
      recommendation: "Recommended",
      body: "Sell-through and activation both clear by a wide margin, and it is the cheapest unit to make. A second run at volume lowers the unit cost further.",
    },
    {
      id: "widen",
      title: "Widen the assortment",
      recommendation: "Recommended",
      body: "Release the vinyl figure and sticker bundle into the second wave. Both are modelled above the margin floor and cover price points the pilot has not tested.",
    },
    {
      id: "retail",
      title: "Move to retail consideration",
      recommendation: "Recommended with conditions",
      body: "The commercial case holds at wholesale economics for the keychain and t-shirt. The hoodie should clear its own gate before it is quoted into a retail assortment.",
    },
    {
      id: "next",
      title: "Onboard the next property",
      recommendation: "Ready",
      body: "The operating model held through a full validation window. The workflow is repeatable for the next Roblox-native property without changes.",
    },
  ],
} as const;

/* ---------------------------------------------------------------------------
   Reference material
   --------------------------------------------------------------------------- */

export const RESOURCES = [
  {
    id: "artwork",
    title: "Artwork specification",
    kind: "Specification",
    body: "Print sizes, safe areas and file requirements for every product category in the catalogue.",
    action: "Open the Drop Studio",
    href: "/roblox/creators/#studio",
    external: true,
  },
  {
    id: "activation",
    title: "How activation works",
    kind: "Explainer",
    body: "What the chip does, what the buyer sees, and what comes back as data. The fan-side preview, end to end.",
    action: "Open the preview",
    href: "/roblox/creators/activate/",
    external: true,
  },
  {
    id: "economics",
    title: "Pilot economics model",
    kind: "Model",
    body: "Price bands, contribution margins and the royalty assumptions behind both the on-platform and retail cases.",
    action: "View assumptions",
    href: "/roblox/portal/performance",
    external: false,
  },
  {
    id: "program",
    title: "Program overview",
    kind: "Overview",
    body: "The creator-facing explanation of Activated Merchandise, the three steps, and what it costs to take part.",
    action: "Open the program page",
    href: "/roblox/creators/",
    external: true,
  },
];

export const GUIDELINES = [
  {
    id: "ip",
    title: "IP and ownership",
    rules: [
      "You must own or control the rights to the property you submit, including any characters, names and artwork used on product.",
      "Third-party IP inside your experience — music, licensed characters, brand marks — cannot be carried onto physical product without its own clearance.",
      "Every product and every immersive experience goes to the IP holder for written approval before production is committed.",
    ],
  },
  {
    id: "creative",
    title: "Creative and artwork",
    rules: [
      "Artwork is supplied as vector or 300 DPI raster with a transparent background, sized to the safe area for the product category.",
      "Anything outside the safe area cannot be reproduced. The Drop Studio clamps placement to it so what you see is what gets printed.",
      "MEDIALIFE's design team can build the assortment artwork with you from your characters, logo and in-game look if you do not have print-ready files.",
    ],
  },
  {
    id: "activation",
    title: "Activation and rewards",
    rules: [
      "Every unit ships with an NFC chip, a printed code, or both. The activation opens in a browser — there is no app to install.",
      "The immersive experience ends on a reward you approve, redeemed back inside your Roblox experience.",
      "Rewards must comply with Roblox platform policy. MEDIALIFE does not issue anything that has not been approved on both sides.",
    ],
  },
  {
    id: "data",
    title: "Data and reporting",
    rules: [
      "Activation data is measured at the unit level and reported in aggregate: activations, repeat interactions, engagement time and outbound sessions.",
      "No personally identifying information is collected from a buyer to activate a product.",
      "Commercial and engagement data is shared with the IP holder and, for program review, with Roblox.",
    ],
  },
];

/* ---------------------------------------------------------------------------
   Activity feed
   --------------------------------------------------------------------------- */

export type ActivityKind = "milestone" | "approval" | "data" | "production";

export const ACTIVITY: Array<{
  id: string;
  kind: ActivityKind;
  when: string;
  title: string;
  body: string;
}> = [
  {
    id: "a1",
    kind: "data",
    when: "2 hours ago",
    title: "Outbound sessions cleared 1,000",
    body: "EVADE passed the outbound-to-Roblox gate for the 90-day review with four weeks still to run.",
  },
  {
    id: "a2",
    kind: "production",
    when: "Yesterday",
    title: "Hoodie samples received",
    body: "First article samples are in hand from the factory. Fit and hand-feel approval is with the IP holder.",
  },
  {
    id: "a3",
    kind: "approval",
    when: "3 days ago",
    title: "Vinyl figure sculpt submitted for approval",
    body: "Character sculpt and turnaround sent for IP-holder sign-off. Tooling is not committed until it is approved.",
  },
  {
    id: "a4",
    kind: "milestone",
    when: "1 week ago",
    title: "Keychain reorder threshold reached",
    body: "Sell-through passed 60% on the keychain, which is the trigger to model a second production run.",
  },
  {
    id: "a5",
    kind: "data",
    when: "2 weeks ago",
    title: "Week 8 program report published",
    body: "Commercial and engagement measures for weeks 1–8 are available in the performance dashboard.",
  },
];

/* ---------------------------------------------------------------------------
   Formatting helpers
   --------------------------------------------------------------------------- */

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/** Index of a stage in the pipeline, for progress maths. */
export const stageIndex = (id: StageId) => PROGRAM.stages.findIndex((s) => s.id === id);
