/**
 * MEDIALIFE x ROBLOX - creator program data.
 *
 * Single source of truth. scripts/build-creators.mjs renders this to static
 * HTML at build time, so every fact on the page is readable with JavaScript
 * off; the interactive layer enhances it rather than supplying it.
 *
 * The premise, in one line: we design, make and fund a creator's merch line,
 * and every piece carries an activation that opens an experience and sends the
 * buyer back into their game with a reward. Creators who already sell merch can
 * have their existing products activated instead.
 *
 * Deliberately not here: MEDIALIFE contribution margins, platform fee splits,
 * the internal pilot phase plan, and the operating-team roster. Those are deck
 * material. Figures marked indicative are working assumptions, and the UI must
 * always say so.
 */

export const PROGRAM = {
  name: "Activated Merchandising Program",
  /** The short form, for places a full programme name would crowd the line. */
  short: "MEDIALIFE × Roblox",
  partner: "Roblox",
  pilot: { skusPerProperty: "2–3", reviewDays: 90, upfrontCost: 0 },

  // Creator-facing economics only. Indicative, pre-agreement.
  economics: {
    royaltyOnPlatform: 0.1,
    royaltyRetail: 0.04,
    priceFloor: 15,
    priceCeiling: 70,
    note:
      "Indicative rates for modelling. Final royalty, term and territory are set in your " +
      "program agreement and are subject to confirmation with Roblox and the participating IP holder.",
  },

  leadTimes: [
    { region: "U.S. production", weeks: "4–7", use: "Speed and low minimums" },
    { region: "International production", weeks: "6–13", use: "Unit cost at volume" },
  ],
};

/**
 * The two ways in. Co-design leads: most Roblox creators have no merch yet.
 * Activating an existing line is the faster on-ramp for the ones who do.
 */
export const PATHS = [
  {
    id: "design",
    kicker: "Start from nothing",
    title: "Launch your own line",
    body:
      "You have the characters, the look and the community. You do not have a factory, a " +
      "storefront or a shipping account — and you should not need one. We design the products " +
      "with you, fund them, make them, sell them and ship them.",
    points: [
      "We co-design the assortment around your IP",
      "We pay for sampling, production and inventory",
      "Every piece ships activated",
    ],
    cta: "Design your line",
    href: "#studio",
  },
  {
    id: "activate",
    kicker: "Already selling",
    title: "Activate what you already have",
    body:
      "If you already sell merch, you do not need a new line — you need the one you have to do " +
      "more. We add the activation layer to your existing products: the chip, the experience and " +
      "the reward that sends buyers back into your game.",
    points: [
      "No redesign, no new inventory",
      "Works with your current manufacturer and store",
      "Your existing stock becomes a channel back to your game",
    ],
    cta: "Activate my merch",
    href: "#apply",
  },
];

/**
 * The whole program in three steps. Two belong to the creator. This is the
 * spine of the page — everything else supports it.
 */
export const STEPS = [
  {
    n: "01",
    owner: "You",
    title: "Tell us about your game",
    body:
      "Your experience, your IP, and which products you want to make. Five minutes, one form. " +
      "If you already sell merch, tell us that instead and we will activate what you have.",
  },
  {
    n: "02",
    owner: "You",
    title: "Send us your designs",
    body:
      "Artwork for each product. Drop it straight onto the products in the Drop Studio below and " +
      "it comes through with your application. No artwork yet? Our design team makes it with you.",
  },
  {
    n: "03",
    owner: "MEDIALIFE",
    title: "We handle the rest",
    body:
      "Sampling, production, the chip in every unit, the immersive experience, the storefront, " +
      "payments and shipping. You approve the samples. Then you get paid as it sells.",
  },
];

/**
 * The catalogue. `model` names a GLB under assets/models/; products without one
 * fall back to the generated placeholder geometry.
 *
 * `attachWeight` is a relative mix weight used by the projection model to spread
 * units across an assortment — a keychain converts far more often than a hoodie,
 * but a hoodie carries far more value per unit.
 */
export const PRODUCTS = [
  {
    id: "tee",
    name: "T-Shirt",
    tag: "Activated Apparel®",
    model: "tee.glb",
    price: 32,
    min: 22,
    max: 45,
    attachWeight: 1.0,
    activation: "Woven NFC label and a printed code on the inner hem",
    blurb: "The volume driver. Heavyweight cotton, screen or DTG print.",
    hero: true,
  },
  {
    id: "hoodie",
    name: "Hoodie",
    tag: "Activated Apparel®",
    model: "hoodie.glb",
    price: 68,
    min: 55,
    max: 70,
    attachWeight: 0.45,
    activation: "NFC chip in the left cuff, code on the inner hem",
    blurb: "Highest value per unit and the strongest signal of real fandom.",
    hero: true,
  },
  {
    id: "cap",
    name: "Snapback",
    tag: "Activated Apparel®",
    model: "cap.glb",
    price: 35,
    min: 26,
    max: 44,
    attachWeight: 0.7,
    activation: "NFC under the sweatband",
    blurb: "Six blank panels and a flat brim. Reads at a glance, travels everywhere.",
    hero: true,
  },
  {
    id: "keychain",
    name: "Keychain / Pin",
    tag: "Activated Merchandise®",
    model: "keychain.glb",
    price: 18,
    min: 15,
    max: 24,
    attachWeight: 1.35,
    activation: "NFC embedded in the charm body",
    blurb: "Proven at RDC. Low price, high attach, and the most-tapped format we make.",
    hero: true,
  },
  {
    id: "plush",
    name: "Vinyl Figure",
    tag: "Activated Merchandise®",
    model: "plush.glb",
    price: 42,
    min: 30,
    max: 55,
    attachWeight: 0.6,
    activation: "NFC in the base",
    blurb: "The character play. Turns an in-game mascot into something kept on a desk.",
    hero: true,
  },
  {
    id: "deskmat",
    name: "Deskmat",
    tag: "Activated Print®",
    model: "deskmat.glb",
    price: 30,
    min: 24,
    max: 38,
    attachWeight: 0.7,
    activation: "NFC under the stitched edge",
    blurb: "Sits under the mouse of the exact person who plays your experience.",
    hero: false,
  },
];

export const COLORWAYS = [
  { id: "void", name: "Void", hex: "#15151c", ink: "#f4f5f8" },
  { id: "bone", name: "Bone", hex: "#e8e3d8", ink: "#101014" },
  { id: "ember", name: "Ember", hex: "#ff37ae", ink: "#12000a" },
  { id: "signal", name: "Signal", hex: "#19affe", ink: "#00131f" },
  { id: "moss", name: "Moss", hex: "#35543a", ink: "#eaf3ea" },
  { id: "clay", name: "Clay", hex: "#c4623b", ink: "#1b0a04" },
  { id: "slate", name: "Slate", hex: "#535a6b", ink: "#f4f5f8" },
  { id: "sulphur", name: "Sulphur", hex: "#e0d54a", ink: "#14130a" },
];

export const ACTIVATIONS = [
  {
    id: "nfc",
    name: "NFC",
    blurb:
      "A chip in the product. The buyer holds a phone near it and the experience opens. No camera, no app, no typing.",
  },
  {
    id: "qr",
    name: "QR",
    blurb:
      "A printed code on the hem, tag or backing card. Works on every phone made in the last decade.",
  },
  {
    id: "both",
    name: "NFC + QR",
    blurb:
      "Both on one product. Highest activation rate — the buyer uses whichever is closest to hand. This is our default.",
  },
];

/** What "activated" actually means, in four beats. */
export const LOOP = [
  {
    n: "01",
    title: "They buy the product",
    body: "A real physical thing with your art on it, made properly and shipped to their door.",
  },
  {
    n: "02",
    title: "They tap it",
    body: "A chip in the product, or a printed code. A phone near it is all it takes.",
  },
  {
    n: "03",
    title: "An experience opens",
    body: "In the browser, in about a second. No app store, no download, no account.",
  },
  {
    n: "04",
    title: "They land back in your game",
    body: "With a reward you approved. And every tap comes back to you as data.",
  },
];

/** Verified results from shipped MEDIALIFE programs. */
export const PROOF = {
  stats: [
    { value: "35%", label: "Call-to-action conversion", foot: "Netflix activated print program" },
    { value: "3:22", label: "Average engagement time", foot: "Per activated unit" },
    { value: "5.46", label: "Repeat interactions", foot: "Per activated unit" },
    {
      value: "+11%",
      label: "Engagement at week two",
      foot: "After distribution — it keeps working",
    },
  ],
  track: [
    {
      year: "2026",
      title: "MEDIALIFE × EVADE",
      kind: "Roblox · RDC 2026",
      body: "An activated keychain for a Roblox property: physical product, an immersive mini-game, and a UGC reward redeemed back in-experience. The whole loop, running end to end.",
    },
    {
      year: "2025–26",
      title: "MEDIALIFE × Netflix",
      kind: "Licensed IP · retail scale",
      body: "Activated physical media for major entertainment properties across 150+ North American retail locations and the biggest fan conventions in the country.",
    },
    {
      year: "2012–25",
      title: "ANIMEBAE & KANSO",
      kind: "Original IP · 1,750+ retailers",
      body: "Original IP from concept to shelf across Hot Topic, Zumiez and Urban Outfitters, plus brand collaborations distributed to 1,750+ retail doors. We have made and sold this kind of product for over a decade.",
    },
  ],
};

export const FAQ = [
  {
    q: "What does this cost me?",
    a: "Nothing up front. We fund design, sampling, production, inventory, the immersive build and fulfilment. You approve the work. We carry the inventory risk — that is the deal, because we are buying evidence, not a fee.",
  },
  {
    q: "I do not have any artwork. Can you still make this?",
    a: "Yes. Our design team builds the assortment with you from your characters, logo and in-game look. Plenty of creators come to us with nothing but the game.",
  },
  {
    q: "I already sell merch. Do I have to start over?",
    a: "No. We can activate what you already sell — we add the chip, the experience and the reward to your existing products, working with your current manufacturer and store. No redesign and no new inventory.",
  },
  {
    q: "Do I keep my IP?",
    a: "Yes. You license specific rights, for specific products, for a specific term and territory — nothing more. The agreement names the SKUs. Anything outside that list needs a new approval from you.",
  },
  {
    q: 'What is "app-free" — really?',
    a: "The buyer taps the NFC chip or scans the code with their normal phone camera. The experience opens in the mobile browser in about a second. No app store, no download, no account, no sign-in. Removing that step is the single biggest reason our activation rates hold up.",
  },
  {
    q: "How does a buyer get back into my experience?",
    a: "The activated experience ends on a call to action you approve — usually a UGC reward code redeemed in-game. Every outbound click is attributed, so you can see how much traffic the physical product sent you, per product and per region.",
  },
  {
    q: "How much work is this for me?",
    a: "Two things: tell us about your game, and send us your designs. After that you approve the samples and tell your community it exists. Most creators spend under five hours across the whole launch.",
  },
  {
    q: "How much can I earn?",
    a: "You take a royalty on every unit sold, with nothing at risk. The projection in the Drop Studio is an illustrative model built on assumptions you control — treat it as a model, not a forecast. Real economics land in your program agreement.",
  },
  {
    q: "Does my game need to be huge?",
    a: "No. We select for fit, not follower count: a recognisable look, a community that already asks where to buy the merch, and a creator who will show up for the launch. A committed mid-size community usually outperforms a large passive one.",
  },
];

/**
 * Projection model for the Drop Studio.
 *
 * Deliberately simple: one audience input the creator supplies and one
 * assumption they can move, both printed next to the result. It projects a
 * 90-day window capped by the limited launch inventory we hold, which is the
 * honest shape of a first run.
 */
export const MODEL = {
  defaults: { monthlyVisits: 1_500_000, attachRate: 0.001 },
  attachRange: { min: 0.0002, max: 0.006, step: 0.0001 },
  visitsRange: { min: 10_000, max: 50_000_000 },
  pilotMonths: 3,
  inventoryCapPerSku: 2000,
  disclaimer:
    "Illustrative model, not a forecast. Units are capped by the limited inventory we hold on a " +
    "first run. Royalty rate is indicative and set in your program agreement.",
};

/**
 * Project a 90-day launch from an assortment and two audience assumptions.
 * @param {Array<{id:string, price:number, attachWeight:number}>} assortment
 */
export function project(assortment, monthlyVisits, attachRate) {
  const skus = assortment.filter(Boolean);
  if (!skus.length) return { units: 0, perSku: [], gmv: 0, royalty: 0, aov: 0, capped: false };

  const buyers = Math.round(monthlyVisits * attachRate * MODEL.pilotMonths);
  const totalWeight = skus.reduce((sum, s) => sum + (s.attachWeight || 1), 0);

  let capped = false;
  const perSku = skus.map((s) => {
    const share = (s.attachWeight || 1) / totalWeight;
    const raw = Math.round(buyers * share);
    const units = Math.min(raw, MODEL.inventoryCapPerSku);
    if (units < raw) capped = true;
    return { id: s.id, name: s.name, price: s.price, units, gmv: units * s.price };
  });

  const units = perSku.reduce((sum, s) => sum + s.units, 0);
  const gmv = perSku.reduce((sum, s) => sum + s.gmv, 0);
  return {
    units,
    perSku,
    gmv,
    royalty: gmv * PROGRAM.economics.royaltyOnPlatform,
    aov: units ? gmv / units : 0,
    capped,
  };
}

/**
 * What happens between hitting submit and the build starting.
 *
 * The three steps above are the creator's whole job. This is the answer to the
 * question the three steps raise — "then what?" — and it is the part that makes
 * "we handle the rest" concrete rather than a promise. Ten days, and it is clear
 * at every one of them who owes what.
 */
export const ONBOARDING = [
  {
    day: "Day 0",
    title: "You submit",
    who: "You",
    body:
      "One form, about four minutes: your experience, your audience, who owns the IP, what you " +
      "already sell, and where your artwork is.",
  },
  {
    day: "Day 1–2",
    title: "We qualify it",
    who: "MEDIALIFE",
    body:
      "A named specialist picks up your account within 48 hours and screens audience scale, IP " +
      "clarity, asset readiness and which product categories fit.",
  },
  {
    day: "Day 3–5",
    title: "Scoping call",
    who: "Together",
    body:
      "Which products, what the activation does, and which in-game reward it ends on. You bring " +
      "the instincts about your world and characters; we bring the assortment and the timeline.",
  },
  {
    day: "Day 6–10",
    title: "Scope and sign-off",
    who: "You + MEDIALIFE",
    body:
      "We issue the proposal — assortment, experience concept, economics, timeline. You approve " +
      "the creative and the licensing. Both production tracks are staffed the day it is signed.",
  },
];

/**
 * After kickoff the work runs on two tracks at once. Neither ships without the
 * other: a product with no activation is just merch, and an activation with no
 * reward path is a dead end.
 */
export const TRACKS = [
  {
    id: "merch",
    name: "Merchandise",
    sub: "Production & sourcing",
    steps: ["Design", "Sampling", "IP approval", "Production", "Fulfilment"],
  },
  {
    id: "experience",
    name: "Experience",
    sub: "Immersive production",
    steps: ["Concept", "Asset intake", "Build", "Reward code", "Device QA"],
  },
];

/** What a creator gets if the pilot works. The stages after launch, in weeks. */
export const HORIZON = [
  { n: "01", name: "IP onboarding", weeks: "Weeks 0–2", body: "Apply, screen, licence." },
  {
    n: "02",
    name: "Product development",
    weeks: "Weeks 2–6",
    body: "Up to four SKUs per property.",
  },
  {
    n: "03",
    name: "Commerce validation",
    weeks: "Weeks 6–16",
    body: "Launch, measure, find the winners.",
  },
  {
    n: "04",
    name: "Performance review",
    weeks: "Weeks 16–20",
    body: "Hero products and retail readiness.",
  },
  { n: "05", name: "Retail scale", weeks: "Week 20+", body: "Expanded distribution." },
];

/** Compact currency for dense readouts: $1.2K, $340K, $1.4M. */
export function money(n, { compact = false } = {}) {
  if (!compact) return "$" + Math.round(n).toLocaleString("en-US");
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return "$" + Math.round(n);
}

/** Compact integer for dense readouts: 1.2K, 340K, 1.4M. */
export function count(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + "K";
  return String(Math.round(n));
}
