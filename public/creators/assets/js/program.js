/**
 * MEDIALIFE x ROBLOX - Activated Merchandising Program
 * Single source of truth for program facts, product catalogue and economics.
 *
 * Every number here traces back to the MEDIALIFE x Roblox commercialization
 * proposal. Figures marked `indicative: true` are working assumptions that are
 * subject to final agreement -- the UI must always surface that caveat.
 *
 * Deliberately omitted from this creator-facing build: MEDIALIFE contribution
 * margins and platform-side fee splits. Those live in the confidential deck.
 */

export const PROGRAM = {
  name: 'Activated Merchandising Program',
  short: 'AMP',
  partner: 'Roblox',

  pilot: {
    properties: '3–5',
    skusPerProperty: '2–3',
    initialProducts: '6–10',
    reviewDays: 90,
    upfrontCost: 0,
  },

  // Creator-facing economics only. Indicative, pre-agreement.
  economics: {
    royaltyOnPlatform: 0.10, // share of net sales on direct/on-platform commerce
    royaltyRetail: 0.04,     // share of wholesale value once a SKU moves to retail
    priceFloor: 15,
    priceCeiling: 70,
    indicative: true,
    note:
      'Indicative rates for modelling. Final royalty, term and territory are set in your ' +
      'program agreement and are subject to confirmation with Roblox and the participating IP holder.',
  },

  leadTimes: [
    { region: 'U.S. production', weeks: '4–7', use: 'Speed, low MOQ, tariff-light' },
    { region: 'International production', weeks: '6–13', use: 'Unit cost at volume' },
  ],
};

/**
 * The six modelled product categories.
 *
 * `price` is the suggested on-platform price and is clamped to
 * PROGRAM.economics.priceFloor/priceCeiling across the whole catalogue.
 * `attachWeight` is a relative mix weight used by the projection model to
 * distribute units across a selected assortment (plush and hoodies convert
 * less often than stickers, but carry far more value per unit).
 */
export const PRODUCTS = [
  {
    id: 'tee',
    name: 'T-Shirt',
    tag: 'Activated Apparel®',
    price: 32,
    min: 22,
    max: 45,
    attachWeight: 1.0,
    activation: 'Woven NFC label + printed QR on the inner hem',
    blurb: 'The volume driver. Heavyweight cotton, screen or DTG print, activation woven into the care label.',
    lead: '4–7 weeks (U.S.)',
    hero: true,
  },
  {
    id: 'hoodie',
    name: 'Hoodie',
    tag: 'Activated Apparel®',
    price: 68,
    min: 55,
    max: 70,
    attachWeight: 0.45,
    activation: 'NFC chip in the left cuff, QR on the inner hem',
    blurb: 'Highest value per unit and the strongest signal of real fandom. Fleece-back, embroidered or printed.',
    lead: '6–13 weeks (intl.)',
    hero: true,
  },
  {
    id: 'keychain',
    name: 'Keychain / Pin',
    tag: 'Activated Merchandise®',
    price: 18,
    min: 15,
    max: 24,
    attachWeight: 1.35,
    activation: 'NFC embedded in the charm body',
    blurb: 'Proven at RDC. Low price, high attach, and it travels — the most-tapped format we produce.',
    lead: '6–13 weeks (intl.)',
    hero: true,
  },
  {
    id: 'plush',
    name: 'Plush',
    tag: 'Activated Merchandise®',
    price: 42,
    min: 30,
    max: 55,
    attachWeight: 0.6,
    activation: 'NFC sewn into the hang tag',
    blurb: 'The character play. Turns a in-experience mascot into an object a fan keeps on a desk for years.',
    lead: '6–13 weeks (intl.)',
    hero: true,
  },
  {
    id: 'stickers',
    name: 'Sticker Bundle',
    tag: 'Activated Print®',
    price: 15,
    min: 12,
    max: 22,
    attachWeight: 1.6,
    activation: 'Printed QR on the backing card',
    blurb: 'Entry price point and the cheapest way to put an activation into a lot of hands quickly.',
    lead: '4–7 weeks (U.S.)',
    hero: false,
  },
  {
    id: 'mousepad',
    name: 'Deskmat',
    tag: 'Activated Print®',
    price: 30,
    min: 24,
    max: 38,
    attachWeight: 0.7,
    activation: 'NFC under the stitched edge',
    blurb: 'Sits under the mouse of the exact person who plays your experience. Large-format art surface.',
    lead: '6–13 weeks (intl.)',
    hero: false,
  },
];

/** Colourways available in the Drop Studio. */
export const COLORWAYS = [
  { id: 'void', name: 'Void', hex: '#0b0b0f', ink: '#f4f5f8' },
  { id: 'bone', name: 'Bone', hex: '#ece7dc', ink: '#101014' },
  { id: 'ember', name: 'Ember', hex: '#ff37ae', ink: '#120008' },
  { id: 'signal', name: 'Signal', hex: '#19affe', ink: '#00131f' },
  { id: 'moss', name: 'Moss', hex: '#2f4a33', ink: '#eaf3ea' },
  { id: 'clay', name: 'Clay', hex: '#c4623b', ink: '#1b0a04' },
  { id: 'slate', name: 'Slate', hex: '#4a5060', ink: '#f4f5f8' },
  { id: 'sulphur', name: 'Sulphur', hex: '#e3d84a', ink: '#14130a' },
];

/** Where the activation lives on the product. */
export const ACTIVATIONS = [
  {
    id: 'nfc',
    name: 'NFC',
    label: 'Tap',
    blurb: 'A chip in the garment or charm. The fan holds a phone near it and the experience opens. No camera, no app, no typing.',
  },
  {
    id: 'qr',
    name: 'QR',
    label: 'Scan',
    blurb: 'A printed code on the hem, tag or backing card. Works on every phone made in the last decade, and on packaging before the box is opened.',
  },
  {
    id: 'both',
    name: 'NFC + QR',
    label: 'Tap or scan',
    blurb: 'Both paths on one product. Highest activation rate — the fan uses whichever is closest to hand. This is our default.',
  },
];

/** The four-phase pilot. Days are cumulative from program start. */
export const PHASES = [
  {
    n: '01',
    day: 'Day 0–14',
    title: 'Onboard & select',
    you: 'Submit your experience, pick the properties and approve direction.',
    us: 'Assortment modelling, unit economics per SKU, activation plan.',
    out: 'A signed program agreement and a locked 2–3 SKU assortment.',
  },
  {
    n: '02',
    day: 'Day 14–45',
    title: 'Build & approve',
    you: 'One creative approval round on product and on the immersive build.',
    us: 'Sampling, production art, the app-free experience, reward integration.',
    out: 'Physical samples in your hands and a live experience URL to test.',
  },
  {
    n: '03',
    day: 'Day 45–60',
    title: 'Produce & launch',
    you: 'Announce to your community. We supply the assets.',
    us: 'Production, QC, chip encoding, fulfilment, storefront and commerce.',
    out: 'Inventory live and selling, activation loop running.',
  },
  {
    n: '04',
    day: 'Day 60–90',
    title: 'Measure & decide',
    you: 'Read the data with us and decide what happens next.',
    us: 'Commercial and engagement reporting, reorder and retail recommendation.',
    out: 'A reorder, a wider assortment, or a retail recommendation — on evidence.',
  },
];

/** Who is responsible for what. Straight from the proposal. */
export const RESPONSIBILITIES = [
  {
    who: 'You',
    role: 'IP holder',
    accent: 'primary',
    items: [
      'Property selection',
      'IP and creative approvals',
      'Commerce integration (only if you want it in-experience)',
      'Telling your community it exists',
    ],
    weight: 'Light. Four touchpoints across 90 days.',
  },
  {
    who: 'MEDIALIFE',
    role: 'Operator',
    accent: 'gradient',
    items: [
      'Product and assortment development',
      'Production and supplier management',
      'Inventory planning and capital',
      'Immersive experience production',
      'Commerce and fulfilment coordination',
      'Analytics and program reporting',
      'Retail recommendation for validated products',
    ],
    weight: 'Everything operational, and the inventory risk.',
  },
  {
    who: 'Roblox',
    role: 'Platform',
    accent: 'accent',
    items: [
      'AMP onboarding and authorization',
      'Participating IP coordination',
      'Commerce and platform support',
    ],
    weight: 'Platform-side enablement.',
  },
];

/**
 * Measurement. Split exactly as the proposal does, because the split is the
 * point: merch programs normally report only the left column.
 */
export const MEASURES = {
  commercial: [
    'Product views and conversion',
    'Units sold and sell-through',
    'SKU and price-point performance',
    'Geographic demand',
    'Reorder velocity',
  ],
  engagement: [
    'Unique activations',
    'Repeat interactions',
    'Engagement time',
    'Content and call-to-action activity',
    'Outbound traffic back to your experience',
  ],
};

/** Verified results from shipped MEDIALIFE programs. */
export const PROOF = {
  stats: [
    { value: '35%', label: 'Call-to-action conversion', foot: 'Netflix activated print program' },
    { value: '3:22', label: 'Average engagement time', foot: 'Per activated unit' },
    { value: '5.46', label: 'Repeat interactions', foot: 'Per activated unit' },
    { value: '+11%', label: 'Engagement at week two', foot: 'After distribution — it keeps working' },
  ],
  track: [
    {
      year: '2026',
      title: 'MEDIALIFE × EVADE',
      kind: 'Roblox · RDC 2026',
      body: 'An Activated Merchandise keychain proof of concept: physical product, an immersive mini-game, and UGC reward redemption back in-experience. The loop, running end to end, on a Roblox property.',
    },
    {
      year: '2025–26',
      title: 'MEDIALIFE × Netflix',
      kind: 'Licensed IP · retail scale',
      body: 'Activated physical media for major entertainment properties across 150+ North American retail locations and the biggest fan conventions in the country — Anime Expo, San Diego Comic-Con, Anime NYC, New York Comic Con.',
    },
    {
      year: '2023–26',
      title: 'MEDIALIFE × ANIMEBAE',
      kind: 'Category development',
      body: 'Where Activated Merchandise®, Activated Print® and Activated Apparel® were built: physical products with NFC/QR immersive experiences and measurable post-purchase engagement.',
    },
    {
      year: '2021–25',
      title: 'KANSO',
      kind: 'Retail scale distribution',
      body: 'Creator and brand partnerships turned into physical product and distributed across 1,750+ retailers, big-box and wholesale. Collaborations include Marie Kondo, LUSH, TEDx and Grand Hyatt.',
    },
    {
      year: '2012–25',
      title: 'ANIMEBAE',
      kind: 'Original IP · merchandising',
      body: 'Original IP from concept to shelf across 1,000+ North American retailers including Hot Topic, Zumiez and Urban Outfitters, plus fan-driven drops and convention programs.',
    },
  ],
};

/** Operating team, as listed in the proposal. */
export const TEAM = [
  {
    name: 'Sofia Gorenstein, Esq.',
    city: 'New York',
    role: 'Chief Executive Officer',
    tags: ['Commercial strategy', 'Strategic partnerships', 'Licensing', 'Channel development'],
  },
  {
    name: 'Alexander Pinto',
    city: 'Vancouver',
    role: 'Merchandising / Creative',
    tags: ['Merchandising', 'Immersive product design', 'Product development', 'Retail channel strategy'],
  },
  {
    name: 'Dapo Ajisafe',
    city: 'Toronto',
    role: 'Immersive Production',
    tags: ['Immersive technology', 'Activation infrastructure', 'User experience', 'Analytics & measurement'],
  },
  {
    name: 'Dominik Hadlow',
    city: 'Germany',
    role: 'Roblox Platform Integration',
    tags: ['Roblox ecosystem', 'Creator partnerships', 'Platform integration', 'Creative asset production'],
  },
  {
    name: 'James Aldaba',
    city: 'New York',
    role: 'Roblox Platform Integration',
    tags: ['Roblox ecosystem', 'Developer relations', 'Commercialization', 'Community engagement'],
  },
];

export const FAQ = [
  {
    q: 'What does this cost me?',
    a: 'Nothing up front. MEDIALIFE funds product development, sampling, production, inventory, the immersive build and fulfilment. We carry the inventory risk during the pilot; you carry the IP approval. That is the deal — we are buying evidence, not a fee.',
  },
  {
    q: 'What do I actually have to do?',
    a: 'Four things across 90 days: pick the property, approve the creative once, approve the product once, and tell your community it exists. Everything operational is ours. Most creators spend under five hours across the whole pilot.',
  },
  {
    q: 'Do I keep my IP?',
    a: 'Yes. You license specific rights, for specific products, for a specific term and territory — nothing more. The agreement names the SKUs. Anything outside that list needs a new approval from you.',
  },
  {
    q: 'What is "app-free" — really?',
    a: 'The fan taps the NFC chip or scans the QR with their normal phone camera. The experience opens in the mobile browser in about a second. No app store, no download, no account, no sign-in. This is the single biggest reason our activation rates hold up: we removed the step where everyone drops off.',
  },
  {
    q: 'How does a fan get back into my experience?',
    a: 'The activated experience ends on a call to action you approve — usually a UGC reward code redeemed in-experience. Every outbound click is attributed, so you can see exactly how much traffic the physical product sent you, per SKU and per region.',
  },
  {
    q: 'How much can I actually earn?',
    a: 'The pilot is deliberately small: limited inventory, 2–3 SKUs, 90 days. It is designed to produce a defensible number, not a big one. The Drop Studio projection on this page is illustrative and built on assumptions you control — treat it as a model, not a forecast. Real economics land in your program agreement.',
  },
  {
    q: 'What happens after 90 days?',
    a: 'Roblox, you and MEDIALIFE read the commercial and engagement data together and decide: reorder, widen the assortment, move to retail, or stop. Properties that clear the bar go into larger production runs at lower unit cost and into appropriate retail channels. Properties that do not, do not — and you have lost nothing but a few hours.',
  },
  {
    q: 'Who is manufacturing this?',
    a: 'Our extended operating team across Canada, the U.S., Japan and China, covering sourcing, manufacturing, fulfilment, live events and channel management. We route each SKU to the supply chain that fits it: U.S. production for speed and low minimums, international for unit cost at volume.',
  },
  {
    q: 'Does my experience need to be huge to qualify?',
    a: 'No. Scale helps, but the pilot selects for fit: a recognisable visual identity, a community that already asks for merch, and a creator who will actually show up for the launch. We would rather run a tight program with an engaged mid-size community than a flat one with a big, passive audience.',
  },
  {
    q: 'What data do I get?',
    a: 'Both halves. Commercial: product views, conversion, units, sell-through, SKU and price-point performance, geographic demand, reorder velocity. Engagement: unique activations, repeat interactions, engagement time, CTA activity and outbound traffic. It is first-party — it belongs to the program, not to an ad platform.',
  },
];

/**
 * Projection model for the Drop Studio.
 *
 * Deliberately simple and fully transparent: the creator controls both inputs
 * and can see the assumption printed next to the result. It projects a 90-day
 * pilot window with limited inventory, so it is capped by inventory, not by
 * audience -- which is the honest shape of a pilot.
 */
export const MODEL = {
  defaults: { monthlyVisits: 1_500_000, attachRate: 0.0010 },
  attachRange: { min: 0.0002, max: 0.0060, step: 0.0001 },
  visitsRange: { min: 10_000, max: 50_000_000 },
  pilotMonths: 3,
  inventoryCapPerSku: 2000, // deliberately limited pilot inventory
  disclaimer:
    'Illustrative model, not a forecast. Units are capped by the limited pilot inventory ' +
    'we deliberately hold during validation. Royalty rate is indicative and set in your ' +
    'program agreement.',
};

/**
 * Project a 90-day pilot from an assortment and two audience assumptions.
 *
 * @param {Array<{id:string, price:number}>} assortment selected SKUs with live prices
 * @param {number} monthlyVisits creator-supplied monthly experience visits
 * @param {number} attachRate fraction of monthly visits that buy, per month
 * @returns {{units:number, perSku:Array, gmv:number, royalty:number, aov:number, capped:boolean}}
 */
export function project(assortment, monthlyVisits, attachRate) {
  const skus = assortment.filter(Boolean);
  if (!skus.length) {
    return { units: 0, perSku: [], gmv: 0, royalty: 0, aov: 0, capped: false };
  }

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

/** Compact currency for dense readouts: $1.2K, $340K, $1.4M. */
export function money(n, { compact = false } = {}) {
  if (!compact) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + 'K';
  return '$' + Math.round(n);
}

/** Compact integer for dense readouts: 1.2K, 340K, 1.4M. */
export function count(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 100_000 ? 0 : 1) + 'K';
  return String(Math.round(n));
}
