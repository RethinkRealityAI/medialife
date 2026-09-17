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
   Formatting helpers
   --------------------------------------------------------------------------- */

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export const money = (n: number, digits = 0) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

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

/* ---------------------------------------------------------------------------
   Program shape
   --------------------------------------------------------------------------- */

export const PROGRAM = {
  name: "Activated Merchandising Program",
  /** The acronym, for places that are already inside the program's own context. */
  short: "AMP",
  /** What a creator who has never seen the acronym should read. Used in chrome. */
  shortLabel: "Activated Merch",
  partner: "Roblox",
  reviewDays: 90,
  /**
   * What a property moves through, in order. From the proposal's onboarding
   * workflow. `short` is what the stepper shows on a phone, where the full name
   * is twice the width of its column and gets silently cut in half.
   */
  stages: [
    {
      id: "review",
      name: "Review",
      short: "Review",
      blurb: "IP, ownership, game and audience information is submitted and assessed for fit.",
    },
    {
      id: "product",
      name: "Product development",
      short: "Product",
      blurb: "Assortment design, sampling, sourcing and the immersive experience build.",
    },
    {
      id: "commerce",
      name: "Commerce validation",
      short: "Commerce",
      blurb: "A limited assortment goes live for a defined test period against defined measures.",
    },
    {
      id: "retail",
      name: "Retail consideration",
      short: "Retail",
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
    items: ["Program onboarding / authorization", "Appropriate commerce and platform support"],
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

/* ---------------------------------------------------------------------------
   Activations

   An activated product is three decisions, and a submission is not reviewable
   until all three are made: how a buyer opens it, what opens, and what they
   walk away with. The RDC 2026 proof of concept with EVADE is the worked
   example — a real acrylic keychain set with a code on the can that opens the
   Cola Run mini-game in the browser and unlocks a cosmetic.
   --------------------------------------------------------------------------- */

/** How a buyer gets from the physical object into the experience. */
export type LaunchMethod = "qr" | "nfc" | "both";

export const LAUNCH_METHODS: Record<LaunchMethod, { label: string; short: string; blurb: string }> =
  {
    qr: {
      label: "Printed QR code",
      short: "QR",
      blurb:
        "Printed directly on the product. Works on every phone camera with no hardware cost, which is what makes it right for a proof of concept.",
    },
    nfc: {
      label: "Embedded NFC",
      short: "NFC",
      blurb:
        "A chip in the product itself. Nothing visible on the artwork, and a tap rather than a scan — but it adds unit cost and needs a compatible phone.",
    },
    both: {
      label: "NFC + printed code",
      short: "NFC + QR",
      blurb:
        "The chip carries the interaction and the printed code is the fallback, so no buyer is locked out by their handset.",
    },
  };

export type ActivatedProduct = {
  id: string;
  name: string;
  detail: string;
  /** Basename under /roblox/portal/img/evade, served as .webp with a .jpg fallback. */
  image: string;
  alt: string;
};

export type Activation = {
  launch: LaunchMethod;
  /** Where the code physically sits on the product. */
  codePlacement: string;
  experience: {
    name: string;
    kind: string;
    url: string | null;
    blurb: string;
    image: string;
    alt: string;
    /** What a buyer does, in the order they do it. */
    beats: string[];
  };
  reward: {
    name: string;
    unlock: string;
    kind: string;
    blurb: string;
    image: string;
    alt: string;
  };
  products: ActivatedProduct[];
  /** Said plainly wherever the activation is shown. */
  caveats: string[];
};

export const ACTIVATIONS: Record<string, Activation> = {
  "amp-001": {
    launch: "qr",
    codePlacement: "Printed on the back of the ECLIPSE can charm",
    experience: {
      name: "Cola Run",
      kind: "Immersive mini-game",
      url: "https://evade.medialife.ai",
      blurb:
        "Opens in the browser from the camera app. No store, no download, no account — which is the whole reason the flow survives contact with a real buyer.",
      image: "cola-run",
      alt: "The Cola Run title card: Bobo the cat flying through floating ECLIPSE cola cans, over an ACTIVATED BY MEDIALIFE lockup.",
      beats: [
        "Buyer points a phone camera at the code on the can",
        "Cola Run opens in the browser in about a second",
        "They play the run and collect cans",
        "The cosmetic unlocks and follows them back into the experience",
      ],
    },
    reward: {
      name: "Orbiting Cat Bobo",
      unlock: "Cat Bobo orbits the user's head in a cute and bouncy way",
      kind: "Cosmetic",
      blurb:
        "A reward a player wears in front of other players is the one that does the work — it advertises the drop every time they load in.",
      image: "bobo-reward",
      alt: "Bobo the cat — a cream-coloured cat in a blue BOBO cap and hoodie — flying through floating ECLIPSE cans inside the Cola Run experience.",
    },
    products: [
      {
        id: "keychain-set",
        name: "Activated keychain set",
        detail: "Two charms: the EVADE character and the ECLIPSE can",
        image: "keychain-set",
        alt: "A hand holding the two-charm acrylic keychain set: an EVADE character charm and an ECLIPSE cola can charm.",
      },
      {
        id: "front-back",
        name: "Front and back",
        detail: "The code sits on the reverse of the can charm",
        image: "front-back",
        alt: "Both charms photographed front and back, with the scannable code printed on the back of the can charm.",
      },
      {
        id: "acrylic",
        name: "Acrylic finish",
        detail: "Double-sided print, clear acrylic, swivel clasp",
        image: "acrylic",
        alt: "The keychain set lit against black, showing the clear acrylic edge glow and the swivel clasp.",
      },
    ],
    caveats: [
      "Built as a demonstration for RDC 2026. Not commercially sold.",
      "The design changes to remove Roblox IP unless approval is granted.",
    ],
  },
};

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
    unitsCommitted: 2400,
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
    unitsCommitted: 0,
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

/** Weekly series for the performance charts. Week 1 is the pilot's first live week. */
/**
 * The weekly series, and the origin of every total on the performance screen.
 *
 * `activations` is FIRST activations — units activated for the first time that
 * week — so the column sums to unique activations rather than double-counting a
 * unit that gets tapped again. Nine weeks, because the review is on day 62 of 90.
 */
export const WEEKLY = [
  { week: "W1", units: 178, activations: 108, outbound: 42 },
  { week: "W2", units: 228, activations: 146, outbound: 58 },
  { week: "W3", units: 268, activations: 178, outbound: 76 },
  { week: "W4", units: 312, activations: 212, outbound: 94 },
  { week: "W5", units: 305, activations: 215, outbound: 102 },
  { week: "W6", units: 348, activations: 242, outbound: 124 },
  { week: "W7", units: 392, activations: 268, outbound: 146 },
  { week: "W8", units: 442, activations: 304, outbound: 184 },
  { week: "W9", units: 491, activations: 343, outbound: 226 },
];

/** Units by SKU, for the price-point read the proposal calls for. */
/**
 * Only the two live SKUs. The hoodie is still in sampling and the rest are in
 * design or proposed, so none of them can have sold a unit — putting them here
 * is the kind of detail a reviewer checks first.
 *
 * `units` sums to the WEEKLY units column, and `committed` mirrors each
 * product's `unitsCommitted`, so sell-through is the same number wherever it
 * is read.
 */
export const BY_SKU = [
  { sku: "Keychain", units: 2064, price: 18, committed: 2400, margin: 0.51 },
  { sku: "T-Shirt", units: 900, price: 32, committed: 2000, margin: 0.38 },
];

/** Where demand is coming from. */
/* ---------------------------------------------------------------------------
   The pilot's totals

   Every figure a reader can check with mental arithmetic is computed here from
   WEEKLY and BY_SKU rather than typed a second time somewhere else. This portal
   is shown to Roblox; a stated sell-through that does not equal units over
   inventory is the detail that costs the room its trust in the rest of it.

   The two anchors that cannot be derived — how many orders those units arrived
   in, and how many storefront views produced them — are declared, and basket
   size and conversion fall out of them.
   --------------------------------------------------------------------------- */

/** Orders the units arrived in. Basket size and conversion derive from it. */
const ORDERS = 1578;
/** Storefront views over the same window as the units, not a rolling 30 days. */
const STOREFRONT_VIEWS = 78_900;
/** Average activations per activated unit — a unit that keeps working. */
const REPEAT_PER_UNIT = 5.46;

const unitsSold = WEEKLY.reduce((n, w) => n + w.units, 0);
const uniqueActivations = WEEKLY.reduce((n, w) => n + w.activations, 0);
const outboundSessions = WEEKLY.reduce((n, w) => n + w.outbound, 0);
const unitsCommitted = BY_SKU.reduce((n, s) => n + s.committed, 0);
const gmv = BY_SKU.reduce((n, s) => n + s.units * s.price, 0);
const contribution = BY_SKU.reduce((n, s) => n + s.units * s.price * s.margin, 0);

export const PILOT = {
  unitsSold,
  unitsCommitted,
  uniqueActivations,
  outboundSessions,
  gmv,
  orders: ORDERS,
  views: STOREFRONT_VIEWS,
  repeatPerUnit: REPEAT_PER_UNIT,
  sellThrough: unitsSold / unitsCommitted,
  activationRate: uniqueActivations / unitsSold,
  /** Share of activated units that have routed at least one session back. */
  outboundRate: outboundSessions / uniqueActivations,
  blendedMargin: contribution / gmv,
  averageOrderValue: gmv / ORDERS,
  conversion: ORDERS / STOREFRONT_VIEWS,
  /** Weeks of the validation window with a complete read. */
  weeks: WEEKLY.length,
};

/** Units by region. Sums to the unit total; share is derived, never typed. */
const REGION_UNITS = [
  { region: "United States", units: 1630 },
  { region: "United Kingdom", units: 415 },
  { region: "Canada", units: 326 },
  { region: "Australia", units: 237 },
  { region: "Germany", units: 178 },
  { region: "Rest of world", units: 178 },
];

export const BY_REGION = REGION_UNITS.map((r) => ({
  ...r,
  share: r.units / PILOT.unitsSold,
}));

export const COMMERCIAL_MEASURES: Measure[] = [
  {
    id: "views",
    label: "Product views",
    value: PILOT.views.toLocaleString("en-US"),
    delta: 0.22,
    hint: "Views across the on-platform storefront since the pilot opened.",
  },
  {
    id: "conversion",
    label: "View-to-order conversion",
    value: pct(PILOT.conversion, 1),
    delta: 0.003,
    hint: `${PILOT.orders.toLocaleString("en-US")} orders divided by product views.`,
  },
  {
    id: "units",
    label: "Units sold",
    value: PILOT.unitsSold.toLocaleString("en-US"),
    delta: 0.31,
    hint: "Across both live SKUs since the pilot opened.",
  },
  {
    id: "sellthrough",
    label: "Sell-through",
    value: pct(PILOT.sellThrough),
    delta: 0.12,
    hint: `Against the ${PILOT.unitsCommitted.toLocaleString("en-US")} units committed for the validation window.`,
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
    value: money(PILOT.averageOrderValue, 2),
    delta: 0.06,
    hint: `${(PILOT.unitsSold / PILOT.orders).toFixed(2)} units per order across the live assortment.`,
  },
];

export const ENGAGEMENT_MEASURES: Measure[] = [
  {
    id: "activations",
    label: "Unique activations",
    value: PILOT.uniqueActivations.toLocaleString("en-US"),
    delta: 0.27,
    hint: "Distinct units tapped or scanned at least once.",
  },
  {
    id: "activation-rate",
    label: "Activation rate",
    value: pct(PILOT.activationRate),
    delta: 0.09,
    hint: "Share of units sold that have been activated at least once.",
  },
  {
    id: "repeat",
    label: "Repeat interactions",
    value: PILOT.repeatPerUnit.toFixed(2),
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
    label: "Send-back rate",
    value: pct(PILOT.outboundRate),
    delta: 0.05,
    hint: "Share of activated units that have routed at least one session back into the experience.",
  },
  {
    id: "outbound",
    label: "Outbound to Roblox",
    value: PILOT.outboundSessions.toLocaleString("en-US"),
    delta: 0.24,
    hint: "Sessions routed from a physical product back into the experience.",
  },
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
  /**
   * Each gate reads a figure from PILOT rather than restating it, so a gate can
   * never claim a number the performance screen disagrees with.
   */
  gates: [
    {
      id: "sellthrough",
      measure: "Sell-through",
      target: "≥ 60%",
      actual: pct(PILOT.sellThrough),
      state: "clear",
      note: "Clears the gate with four weeks still to run. The keychain is carrying it.",
    },
    {
      id: "activation",
      measure: "Activation rate",
      target: "≥ 50%",
      actual: pct(PILOT.activationRate),
      state: "clear",
      note: "Well clear. Supports the case that the activation is the differentiator, not a novelty.",
    },
    {
      id: "outbound",
      measure: "Outbound to Roblox",
      target: "≥ 1,000 sessions",
      actual: PILOT.outboundSessions.toLocaleString("en-US"),
      state: "clear",
      note: "Just cleared this week. The number Roblox cares about most.",
    },
    {
      id: "margin",
      measure: "Blended contribution margin",
      target: "≥ 35%",
      actual: pct(PILOT.blendedMargin),
      state: "clear",
      note: "Ahead of model, helped by the keychain's mix share.",
    },
    {
      id: "repeat",
      measure: "Repeat interactions per unit",
      target: "≥ 3.0",
      actual: PILOT.repeatPerUnit.toFixed(2),
      state: "clear",
      note: "The strongest signal in the pilot.",
    },
    {
      id: "price-point",
      measure: "Sell-through at the $32 price point",
      target: "≥ 60%",
      actual: pct(BY_SKU[1].units / BY_SKU[1].committed),
      state: "watch",
      note: "The t-shirt is the slower half of the assortment. This is the read that matters before the $68 hoodie is committed to production.",
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
      body: "The commercial case holds at wholesale economics for the keychain, which carries the margin. The $32 price point should clear its gate before the assortment is quoted into a retail buy — retail orders in one go, so a slow mover is inventory rather than a lesson.",
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
    when: "Last week",
    title: "Week 8 program report published",
    body: "Commercial and engagement measures for weeks 1–8 are available in the performance dashboard.",
  },
];

/**
 * The date this demo is written as of — day `REVIEW.dayOf` of the validation
 * window, not the wall clock. Everything relative is measured from here so the
 * portal reads the same in six months as it does today.
 */
export const TODAY = (() => {
  const d = new Date(`${REVIEW.windowStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + REVIEW.dayOf);
  return d;
})();

/** Whole days between an ISO date and the portal's fixed today. */
export const daysSince = (iso: string) =>
  Math.round((TODAY.getTime() - new Date(`${iso}T12:00:00Z`).getTime()) / 86_400_000);

/** Index of a stage in the pipeline, for progress maths. */
export const stageIndex = (id: StageId) => PROGRAM.stages.findIndex((s) => s.id === id);
