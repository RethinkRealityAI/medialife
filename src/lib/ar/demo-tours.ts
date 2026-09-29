// The guided tours of the two live static demos, as the admin knows them:
// stable stop ids, a short label for /admin/demos, and each stop's default copy.
//
// The pages (public/<demo>/activated-retail/index.html) are the source of truth: their
// inline TOUR is what clients see when there are no overrides, and the fallback when
// the content API is slow or down. These defaults are a copy for the admin UI;
// `node scripts/check-demo-tours.mjs` fails when the two drift apart.
//
// Import-free on purpose: the check script runs this file directly with Node.

export interface DemoTourStep {
  /** stable id, also in the page's TOUR entry */
  id: string;
  /** short name in the admin list */
  label: string;
  /** what the stop does besides its copy (camera, theme, dashboard…) */
  note: string;
  default: { t: string; b: string; ar: boolean };
}

export interface DemoTour {
  label: string;
  /** where the demo lives on the site */
  path: string;
  steps: DemoTourStep[];
}

export const DEMO_TOURS = {
  roblox: {
    label: "Roblox",
    path: "/roblox/activated-retail/",
    steps: [
      {
        id: "aisle",
        label: "Aisle view",
        note: "Wide view of the whole fixture.",
        default: {
          t: "Stop them in the aisle",
          b: "A 3.84 m Walmart endcap built from modular lightbox towers, a channel-letter header and a 12-tile video wall. It reads from the end of the aisle, and every surface either sells or activates.",
          ar: false,
        },
      },
      {
        id: "featured",
        label: "Featured IP",
        note: "Switches to the EVADE theme.",
        default: {
          t: "Featured IP",
          b: "Top Roblox experiences featured here with merchandise collections periodically refreshed. The same fixture re-skins for any Roblox-native IP.",
          ar: false,
        },
      },
      {
        id: "merch",
        label: "Merchandise",
        note: "Close on the merch shelf (EVADE).",
        default: {
          t: "Merchandise that extends the IP",
          b: "The pilot EVADE keychain and tee, plus Cat Bobo and Bobo plush, the BOBO cap, a hoodie, a desk mat and Eclipse Cola collectibles. Tap any product and it comes off the shelf.",
          ar: false,
        },
      },
      {
        id: "qr",
        label: "QR activation",
        note: "The scan-to-unlock tower; pulses the QR hotspot.",
        default: {
          t: "Tap, play, unlock",
          b: "The QR on the right tower is real: scan it with your phone and Cola Run opens at evade.medialife.ai. No app. A mini-game, a reveal, then a UGC reward redeemed inside EVADE.",
          ar: false,
        },
      },
      {
        id: "ar",
        label: "View in AR",
        note: "Usually highlights the View in AR button.",
        default: {
          t: "See it in your space",
          b: "Place the full-size endcap in your own room and walk around it. It opens in AR Quick Look on iPhone and Google Scene Viewer on Android, with no app to install. On a computer you get a QR code for your phone.",
          ar: true,
        },
      },
      {
        id: "measured",
        label: "Measurement",
        note: "Opens the analytics dashboard.",
        default: {
          t: "Back to Roblox, and measured",
          b: "Unique activations, repeat interactions, engagement time and outbound traffic to Roblox, reported by location, property and creative treatment. This is the data behind the 90-day program review.",
          ar: false,
        },
      },
      {
        id: "modular",
        label: "Modular build",
        note: "Exploded view of the six modules.",
        default: {
          t: "Built modular",
          b: "Six modules bolt together on site: two lightbox towers, the header, the video wall, the merch bay and the plinth, plus a freestanding digital totem. When the featured property changes, you swap graphics, not fixtures.",
          ar: false,
        },
      },
    ],
  },
  "monkey-quest": {
    label: "Monkey Quest",
    path: "/monkey-quest/activated-retail/",
    steps: [
      {
        id: "aisle",
        label: "Aisle view",
        note: "Wide view of the whole fixture (game theme).",
        default: {
          t: "Stop them in the aisle",
          b: "A 3.84 m Walmart endcap for Monkey Quest: two lightbox towers, a lit header, a 12-tile video wall and a hero screen. One fixture carries the Roblox game today and the Toei Animation film in 2027.",
          ar: false,
        },
      },
      {
        id: "live",
        label: "The live game",
        note: "The hero screen, game theme.",
        default: {
          t: "The game is live now",
          b: "Hypergalactic: Monkey Quest, built by Twin Atlas for Toei Animation, is the hub of the Monkey Quest universe on Roblox. Players sled, battle Xenons and collect Mini-Might pets. The display sells that world at shelf height.",
          ar: false,
        },
      },
      {
        id: "hero-sku",
        label: "Hero SKU",
        note: "Close on the merch shelf.",
        default: {
          t: "The Mini-Might is the hero SKU",
          b: "Okon's tiny clones are the most collectible thing in the game, so they lead the shelf: a plush, a keychain, apparel and a desk mat. Every product carries NFC, and every tap puts its digital twin in the game.",
          ar: false,
        },
      },
      {
        id: "qr",
        label: "QR activation",
        note: "The scan-to-unlock tower; pulses the QR hotspot.",
        default: {
          t: "Tap, play, unlock",
          b: "The QR on the right tower is real: scan it and Hypergalactic: Monkey Quest opens on Roblox. The activation flow turns a Walmart purchase into an in-game Mini-Might and a first look at the film.",
          ar: false,
        },
      },
      {
        id: "ar",
        label: "View in AR",
        note: "Usually highlights the View in AR button.",
        default: {
          t: "See it in your space",
          b: "Place the full-size endcap in your own room and walk around it. It opens in AR Quick Look on iPhone and Google Scene Viewer on Android, with no app to install. On a computer you get a QR code for your phone.",
          ar: true,
        },
      },
      {
        id: "film",
        label: "Film campaign",
        note: "Switches to the film theme.",
        default: {
          t: "Flip to the film campaign",
          b: "The same hardware re-skins for Toei Animation's 2027 theatrical release: film key art on the towers and hero screen, a movie collector box on the shelf, and the game promoted on the totem. Players become the opening-weekend audience.",
          ar: false,
        },
      },
      {
        id: "measured",
        label: "Measured, and modular",
        note: "Opens the dashboard and the exploded view.",
        default: {
          t: "Measured, and built modular",
          b: "Activations, returns to the game, film first-look views and sell-through are reported by store and SKU. Six modules bolt together on site, so each campaign phase swaps graphics, not fixtures.",
          ar: false,
        },
      },
    ],
  },
} satisfies Record<string, DemoTour>;

export type DemoId = keyof typeof DEMO_TOURS;
export const DEMO_IDS = Object.keys(DEMO_TOURS) as DemoId[];
export const isDemoId = (v: string): v is DemoId => Object.hasOwn(DEMO_TOURS, v);
