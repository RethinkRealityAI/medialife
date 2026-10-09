/**
 * The Creator Merch Shelf — config contract.
 *
 * A shelf is an interactive 3D merch shop made for one creator: a lit product
 * shelf with their name in neon at the top, their logo printed on every
 * product, click-to-inspect, add-to-cart and the activation flow (what happens
 * when a fan scans the merch). It's a pitch tool: the MEDIALIFE team (and agency
 * partners like Snowday Media) send a creator a link to *their* shelf in an
 * outreach email.
 *
 * Three ways a shelf is configured, all producing a ShelfConfig:
 *  1. Published: /shelf/<slug> — made in /admin/shelves, stored server side,
 *     injected into the page (window.__SHELF).
 *  2. Quick link: /shelf?name=PixelPine&neon=ff37ae&invite=snowday — no admin
 *     needed; anything not given falls back to DEFAULT_SHELF.
 *  3. In the page: a visitor drops in their own logo, renames the sign, picks
 *     colours. Stays in their browser (never uploaded).
 *
 * The runtime is the static page public/merch-shelf/ (plain JS, no build step),
 * so it can't import this file: public/merch-shelf/default.json mirrors
 * DEFAULT_SHELF and must be kept in step (see scripts/check-shelf-default.mjs).
 */
import { z } from "zod";

export const PRODUCT_TYPES = [
  "tee",
  "hoodie",
  "cap",
  "plush",
  "keychain",
  "sticker",
  "deskmat",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const ACTIVATION_KINDS = ["ar", "model", "video", "game", "unlock"] as const;
export type ActivationKind = (typeof ACTIVATION_KINDS)[number];

export const SHELF_FINISHES = ["walnut", "black", "white", "maple"] as const;
export const BACKDROPS = ["midnight", "sunset", "arcade", "snow"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Same-site paths only (/api/ar/asset/<id>, /merch-shelf/…), or https URLs. */
const imageRef = z
  .string()
  .max(1000)
  .refine((s) => s.startsWith("/") || s.startsWith("https://"), "Use a site path or an https URL");

export const shelfProductSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  type: z.enum(PRODUCT_TYPES),
  enabled: z.boolean(),
  name: z.string().trim().min(1).max(60),
  /** Indicative retail price, cents. */
  price: z.number().int().min(0).max(100_000),
  /** Colourway washed over the model. */
  color: hex,
  /** Artwork printed on it; null = the creator's logo (or the generated wordmark). */
  print: imageRef.nullable(),
  blurb: z.string().trim().max(240),
  activation: z.object({
    kind: z.enum(ACTIVATION_KINDS),
    title: z.string().trim().max(60),
    description: z.string().trim().max(240),
    reward: z.string().trim().max(120),
  }),
});
export type ShelfProduct = z.infer<typeof shelfProductSchema>;

export const shelfConfigSchema = z.object({
  version: z.literal(1),
  creator: z.object({
    /** On the neon sign. */
    name: z.string().trim().min(1).max(28),
    /** e.g. "@pixelpine" — shown under the sign. */
    handle: z.string().trim().max(40),
    /** Transparent PNG/SVG/WebP ideally; null = a wordmark generated from the name. */
    logo: imageRef.nullable(),
  }),
  theme: z.object({
    neon: hex,
    accent: hex,
    shelf: z.enum(SHELF_FINISHES),
    backdrop: z.enum(BACKDROPS),
  }),
  products: z.array(shelfProductSchema).min(1).max(12),
  pitch: z.object({
    /** "Prepared for PixelPine" — shown on the intro card. */
    preparedFor: z.string().trim().max(60),
    /** "Snowday Media × MEDIALIFE" style line; empty = MEDIALIFE only. Text only, never a partner's logo. */
    presentedBy: z.string().trim().max(60),
    /** Carried to the Creator Hub application so the creator is tagged with the agency. */
    inviteCode: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^([a-z0-9-]{2,40})?$/),
    /** Shown in the earnings estimator as the starting audience. */
    audience: z.number().int().min(0).max(1_000_000_000),
    /** Show the illustrative earnings estimator. */
    showEstimator: z.boolean(),
  }),
});
export type ShelfConfig = z.infer<typeof shelfConfigSchema>;

const act = (kind: ActivationKind, title: string, description: string, reward: string) => ({
  kind,
  title,
  description,
  reward,
});

/** The shelf anyone sees at /shelf with no config: a believable creator drop. */
export const DEFAULT_SHELF: ShelfConfig = {
  version: 1,
  creator: { name: "YOUR NAME", handle: "@yourchannel", logo: null },
  theme: { neon: "#ff37ae", accent: "#19affe", shelf: "walnut", backdrop: "midnight" },
  products: [
    {
      id: "tee",
      type: "tee",
      enabled: true,
      name: "Signature Tee",
      price: 3900,
      color: "#111216",
      print: null,
      blurb: "Heavyweight cotton, your art front and centre.",
      activation: act(
        "ar",
        "Your character steps out",
        "Fans scan the print and your character jumps out of the shirt in AR.",
        "A secret clip only buyers can watch",
      ),
    },
    {
      id: "hoodie",
      type: "hoodie",
      enabled: true,
      name: "Drop Hoodie",
      price: 6500,
      color: "#2a2d3a",
      print: null,
      blurb: "Brushed fleece with an NFC tag in the sleeve.",
      activation: act(
        "video",
        "Behind-the-scenes video",
        "Tap the sleeve to unlock a video message from you.",
        "Early access to your next drop",
      ),
    },
    {
      id: "cap",
      type: "cap",
      enabled: true,
      name: "Logo Cap",
      price: 3200,
      color: "#0d0f14",
      print: null,
      blurb: "Embroidered front, scannable under the brim.",
      activation: act(
        "model",
        "A 3D collectible",
        "Your logo spins up as a 3D model fans can place on their desk.",
        "A digital collectible",
      ),
    },
    {
      id: "plush",
      type: "plush",
      enabled: true,
      name: "Mascot Plush",
      price: 3500,
      color: "#f2efe9",
      print: null,
      blurb: "Soft, huggable, and it talks back when scanned.",
      activation: act(
        "game",
        "A 60-second mini-game",
        "Scan the tag and play a quick game starring your mascot.",
        "A shout-out for top scores",
      ),
    },
    {
      id: "keychain",
      type: "keychain",
      enabled: true,
      name: "Activated Keychain",
      price: 1800,
      color: "#ffffff",
      print: null,
      blurb: "Acrylic charm with a QR on the back.",
      activation: act(
        "unlock",
        "Unlock a reward",
        "Every scan unlocks a reward fans can't get anywhere else.",
        "A discount code for the next drop",
      ),
    },
    {
      id: "sticker",
      type: "sticker",
      enabled: true,
      name: "Holo Sticker Pack",
      price: 900,
      color: "#ffffff",
      print: null,
      blurb: "Holographic die-cuts. Tap or scan to open them.",
      activation: act(
        "ar",
        "The sticker comes alive",
        "Point a phone at it and the art animates off the page.",
        "A bonus wallpaper",
      ),
    },
    {
      id: "deskmat",
      type: "deskmat",
      enabled: true,
      name: "Desk Mat",
      price: 3000,
      color: "#15161c",
      print: null,
      blurb: "XL mat with the QR built into the art.",
      activation: act(
        "video",
        "Your setup tour",
        "Scan the corner to open a setup tour video.",
        "Your settings and keybinds",
      ),
    },
  ],
  pitch: {
    preparedFor: "",
    presentedBy: "",
    inviteCode: "",
    audience: 250_000,
    showEstimator: true,
  },
};

/** Messages between /admin/shelves and the shelf page in its preview iframe (?preview=1). */
export type ShelfPreviewMessage =
  | { type: "shelf:config"; config: ShelfConfig } // admin → page: render this config now
  | { type: "shelf:snapshot"; width: number; height: number } // admin → page: capture the hero view
  | { type: "shelf:ready" } // page → admin: listening
  | { type: "shelf:snapshot-result"; dataUrl: string | null }; // page → admin: PNG data URL
