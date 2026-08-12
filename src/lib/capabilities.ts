/**
 * Production capabilities.
 *
 * Copy is taken from the approved positioning brief. Note on GAMING +
 * PLATFORM INTEGRATION: it deliberately says "native development partners"
 * and names no platform. Do not state or imply a formal Roblox partnership,
 * Roblox Commerce, or AMP approval anywhere on this site until approved.
 */

export type Capability = {
  num: string;
  name: string;
  body: string;
  glyph: string;
};

export const CAPABILITIES: Capability[] = [
  {
    num: "01",
    name: "Immersive format development",
    body: "New media concepts built around IP, fandom behaviour, physical environments, distribution, and emerging technology.",
    glyph: "◐",
  },
  {
    num: "02",
    name: "Activated Print™",
    body: "App-free immersive layers for magazines, posters, stickers, flyers, standees, packaging, and other printed media.",
    glyph: "▤",
  },
  {
    num: "03",
    name: "Activated Merchandise™ + Activated Apparel™",
    body: "Merchandise designed, manufactured, and distributed with QR, NFC, app-free AR, and other digital activation layers.",
    glyph: "◈",
  },
  {
    num: "04",
    name: "Location-based entertainment + live media",
    body: "Immersive formats deployed through conventions, parades, pop-ups, venues, retail environments, festivals, and other location-based entertainment.",
    glyph: "◎",
  },
  {
    num: "05",
    name: "Gaming + platform integration",
    body: "Physical and digital programmes built for game-native audiences, commerce, and platform-connected experiences with native development partners.",
    glyph: "◇",
  },
  {
    num: "06",
    name: "Measurement + analytics",
    body: "First-party behavioural measurement across scans, taps, dwell time, repeat interaction, CTA conversion, location, and placement performance.",
    glyph: "◔",
  },
];

/** Physical touchpoint strip shown under the capability grid. */
export const TOUCHPOINTS = [
  "Retail",
  "Merchandise",
  "Packaging + print",
  "Live events",
  "Gaming",
] as const;

/**
 * Selected live deployment performance.
 *
 * These are the approved ranges. They are drawn from multiple deployments —
 * the section label must make that clear and must NOT imply all figures come
 * from a single campaign.
 */
export const PERFORMANCE = [
  { v: "72–90%", l: "interaction rate" },
  { v: "35–86%", l: "interaction-to-action conversion" },
  { v: "5.4–6.2×", l: "repeat interactions per activated unit" },
  { v: "1.5–3+ min", l: "average engagement, by deployment" },
  { v: "50%", l: "shared with others" },
  { v: "+11%", l: "engagement growth 2+ weeks post distribution" },
  { v: "1.7/min", l: "attendees engaging at Anime NYC" },
  { v: "680+", l: "unique interactions per activated retail unit" },
];
