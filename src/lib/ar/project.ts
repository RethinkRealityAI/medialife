import { z } from "zod";

// An endcap project: everything the config-driven engine
// (public/activated-retail/engine/index.html) needs to render an activated-retail
// endcap, edited in /admin/builder and published to /x/<slug>.
//
// The engine is plain JS and reads this shape as JSON; this file is the contract
// for both sides. Keep changes backward compatible (add optional fields) —
// published projects are stored JSON and are never migrated.

export const PROJECT_VERSION = 1;

/**
 * A reference to a file the engine can load:
 * - an uploaded asset:   "/api/ar/asset/<assetId>"
 * - a file on the site:  "/roblox/activated-retail/assets/hd/ev_towerL.webp"
 * Always an absolute path (the engine is served from /x/<slug>).
 */
export const assetRef = z.string().regex(/^\/[^\s]*$/, "must be a site path starting with /");
/** An image with an optional smaller version for phones. */
export const imageRef = z.union([
  assetRef,
  z.object({ src: assetRef, mobile: assetRef.optional() }),
]);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/, "lowercase letters, numbers and dashes");

/**
 * The fixture's shelf zones (AR-01 endcap). Keys are the fixture's own group ids
 * (MERCH_<id> in display.glb), so they stay stable; labels are what the builder shows.
 * Every slot in a zone gets the same product model (auto-fitted to the slot).
 */
export const ZONES = {
  cap: { label: "Top shelf · left", slots: 3, hint: "Sits on the shelf. Caps, small apparel." },
  plush: { label: "Top shelf · centre", slots: 2, hint: "Hero spot at eye level. Plush, figures." },
  keychain: {
    label: "Top shelf · hanging rail",
    slots: 5,
    hint: "Hangs from the rail. Keychains, charms, lanyards.",
  },
  mousepad: {
    label: "Top shelf · right",
    slots: 2,
    hint: "Low and long. Rolled desk mats, posters, tubes.",
  },
  figure: {
    label: "Bottom shelf · left",
    slots: 4,
    hint: "Boxed collectibles, cans, blind boxes.",
  },
  tee: { label: "Bottom shelf · centre", slots: 2, hint: "Folded apparel: tees." },
  hoodie: { label: "Bottom shelf · right", slots: 4, hint: "Folded apparel: hoodies, jackets." },
} as const;
export type ZoneId = keyof typeof ZONES;
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

/** Named camera viewpoints the engine knows (used by tour steps). */
export const VIEWS = {
  aisle: "From the aisle (whole fixture)",
  hero: "Hero screen",
  shelf: "The merch shelf",
  qr: "QR tower",
  totem: "Digital totem",
  dashboard: "Wide, with the dashboard",
  build: "Exploded build view",
} as const;
export type ViewId = keyof typeof VIEWS;

export const themeSchema = z.object({
  id: slugSchema,
  /** shown on the property switch, e.g. "EVADE", "Film campaign" */
  name: z.string().min(1).max(40),
  /** LED channel colours of the fixture */
  led: hexColor,
  led2: hexColor,
  /** backlit merch bay tint; derived from led when absent */
  bay: hexColor.optional(),
  /** floor light spill; derived from led when absent */
  spill: hexColor.optional(),
  /** hotspot marker colours (products / activation); default led / led2 */
  markers: z.object({ product: hexColor.optional(), activation: hexColor.optional() }).optional(),
  graphics: z.object({
    /**
     * "keyart": compose every panel from one key-art image (like "Your IP");
     * "panels": use the per-panel images below (missing ones fall back to key art).
     */
    mode: z.enum(["keyart", "panels"]),
    keyArt: imageRef.optional(),
    towerL: imageRef.optional(),
    towerR: imageRef.optional(),
    totem: imageRef.optional(),
    wall: imageRef.optional(),
    screen: imageRef.optional(),
    /** header lightbox art; when absent the header shows 3D channel letters */
    header: imageRef.optional(),
  }),
  /** the experience's site label shown in the phone mock, e.g. "EVADE.MEDIALIFE.AI" */
  site: z.string().max(60).optional(),
  /** the game / property name used in copy, e.g. "EVADE" */
  game: z.string().max(40).optional(),
});
export type Theme = z.infer<typeof themeSchema>;

export const productSchema = z.object({
  label: z.string().min(1).max(60),
  /** the eyebrow line, e.g. "Activated Apparel® · pilot SKU" */
  category: z.string().max(80).default(""),
  sku: z.string().max(40).default(""),
  /** USD, whole or cents */
  price: z.number().min(0).max(100000),
  /** size picker options, e.g. ["S","M","L","XL"] */
  sizes: z.array(z.string().max(8)).max(8).optional(),
  description: z.string().max(600).default(""),
  unlock: z.object({
    title: z.string().max(60),
    sub: z.string().max(120).default(""),
    /** reward art; a snapshot of the 3D product is used when absent */
    image: imageRef.optional(),
  }),
  /** how the product triggers the experience, e.g. "NFC care label" */
  trigger: z.string().max(80).default(""),
  /** where it's sold, e.g. "Roblox Commerce → Walmart" */
  channel: z.string().max(80).default(""),
  /** hotspot label override (defaults to the product label) */
  hotspot: z.string().max(40).optional(),
  /** show "Tap to activate" on this product */
  canActivate: z.boolean().default(false),
});
export type Product = z.infer<typeof productSchema>;

export const zoneSchema = z.object({
  /** false: leave the zone empty (no products, no hotspot) */
  enabled: z.boolean().default(true),
  model: z.object({
    /** "default": the fixture's own sample merch; "asset": an uploaded .glb */
    source: z.enum(["default", "asset"]),
    asset: assetRef.optional(),
    /** extra turn in degrees around the vertical axis, applied after auto-fit */
    yaw: z.number().min(-180).max(180).default(0),
    /** multiplier on the auto-fitted size */
    scale: z.number().min(0.2).max(3).default(1),
  }),
  product: productSchema,
});
export type Zone = z.infer<typeof zoneSchema>;

export const tourStepSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(500),
  view: z.enum(Object.keys(VIEWS) as [ViewId, ...ViewId[]]),
  /** switch to this theme when the step opens */
  theme: slugSchema.optional(),
  /** open the analytics dashboard panel on this step */
  dashboard: z.boolean().optional(),
});

export const projectSchema = z.object({
  version: z.literal(PROJECT_VERSION),
  slug: slugSchema,
  /** internal name, e.g. "EVADE × Walmart Q4 pitch" */
  name: z.string().min(1).max(80),
  /** who it's for, shown as "Prepared for …" when set */
  client: z.string().max(80).optional(),
  brand: z.object({
    /** top-left lockup, e.g. "MEDIALIFE® × ROBLOX" */
    lockup: z.string().max(40),
    /** small line under the lockup */
    sub: z.string().max(80).default(""),
    splashTitle: z.string().max(40).default("Activated Retail"),
    splashSub: z.string().max(120).default(""),
    /** retailer named in copy ("In stock at this Walmart") */
    retailer: z.string().max(30).default("Walmart"),
  }),
  access: z.object({
    /** plain password, admin-only: stripped from the public JSON (only passwordHash ships) */
    password: z.string().max(60).optional(),
    /** FNV-1a hex of the lowercased, space-stripped password (same as the demo pages' gate) */
    passwordHash: z
      .string()
      .regex(/^[0-9a-f]{1,8}$/)
      .optional(),
  }),
  themes: z.array(themeSchema).min(1).max(4),
  defaultTheme: slugSchema,
  zones: z.object(
    Object.fromEntries(ZONE_IDS.map((id) => [id, zoneSchema])) as Record<ZoneId, typeof zoneSchema>,
  ),
  activation: z.object({
    /**
     * "game": the built-in 12-second catch game in the phone mock;
     * "link": opens url in a new tab (like the live EVADE game) and moves to the reward;
     * "none": no activation demo.
     */
    type: z.enum(["game", "link", "none"]),
    url: z.string().url().optional(),
    /** CTA on the phone's splash screen, e.g. "Launch Cola Run ↗" */
    buttonLabel: z.string().max(40).default("Play the drop"),
    /** splash art in the phone mock; the hero screen art is used when absent */
    splash: imageRef.optional(),
    /** reward code prefix, e.g. "EVD" → "EVD-7Q4X-R2" */
    rewardPrefix: z
      .string()
      .regex(/^[A-Z0-9]{2,6}$/)
      .default("AR01"),
    /** draw a real, scannable QR for this URL on the right tower + hero screen */
    qrUrl: z.string().url().optional(),
  }),
  tour: z.array(tourStepSchema).max(10),
  cta: z.object({
    label: z.string().max(40).default("Book a call"),
    /** "lead": the in-page contact form (Netlify form); "url": open url */
    mode: z.enum(["lead", "url"]).default("lead"),
    url: z.string().url().optional(),
  }),
  /** AR files generated at publish time (Scene Viewer / Quick Look) */
  ar: z
    .object({
      glb: assetRef.optional(),
      usdz: assetRef.optional(),
      generatedAt: z.number().optional(),
    })
    .default({}),
});
export type Project = z.infer<typeof projectSchema>;

/** What is stored per project (arStore("projects"), key "<slug>.json"). */
export interface ProjectDoc {
  slug: string;
  draft: Project;
  published: Project | null;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** small preview image for the project list */
  thumb: string | null;
}

/** Remove admin-only fields before a project is served publicly. */
export function publicProject(p: Project): Project {
  const access = { ...p.access };
  delete access.password;
  return { ...p, access };
}

/** Same hash as the demo pages' password gate (FNV-1a over the normalized password). */
export function gateHash(password: string): string {
  let h = 0x811c9dc5;
  for (const c of password.toLowerCase().replace(/\s+/g, "")) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Uploaded file metadata (arStore("assets"), key "<id>.json"; bytes in arStore("chunks")). */
export interface AssetMeta {
  id: string;
  name: string;
  kind: "model" | "image";
  mime: string;
  size: number;
  chunks: number;
  createdAt: number;
  /** optional thumbnail asset id (for models) */
  thumb?: string;
  tags?: string[];
}
