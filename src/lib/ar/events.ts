import { z } from "zod";

// The analytics contract shared by the demo pages (public/vendor/ar-kit/track.js),
// the ingestion endpoint (POST /api/ar/track) and the dashboard.
//
// One stored record per visit ("session"), keyed by the day the session started:
//   sessions store, key  "<YYYY-MM-DD>/<sid>"
// The page batches events and flushes every ~10 s and when it is hidden; each
// flush appends to the same record. Events are small: a name and a few props.

/** Known event names. The endpoint accepts any snake_case name so new ones don't need a deploy. */
export const AR_EVENTS = {
  session_start: "Visit started",
  gate_view: "Saw the password screen",
  gate_unlock: "Entered the password",
  gate_fail: "Wrong password",
  enter: "Entered the store",
  tour_step: "Tour step",
  tour_finish: "Finished the tour",
  tour_skip: "Skipped the tour",
  theme: "Switched property / campaign",
  light: "Switched day / night",
  mode: "Changed view mode",
  hotspot: "Tapped a hotspot",
  product_open: "Opened a product",
  add_to_cart: "Added to cart",
  cart_open: "Opened the cart",
  checkout: "Started checkout",
  order: "Placed a demo order",
  activation_open: "Opened the activation demo",
  activation_launch: "Launched the live experience",
  game_start: "Started the mini-game",
  game_end: "Finished the mini-game",
  reward_redeem: "Redeemed the reward",
  ar_open: "Opened AR",
  ar_qr: "Saw the AR QR code (desktop)",
  present_start: "Started presentation mode",
  present_stop: "Stopped presentation mode",
  cta_open: "Opened 'Book a call'",
  lead_submit: "Sent a contact request",
  custom_ip: "Tried 'Your IP'",
  dash_open: "Opened the dashboard panel",
} as const;
export type ArEventName = keyof typeof AR_EVENTS | (string & {});

const propValue = z.union([z.string().max(300), z.number(), z.boolean(), z.null()]);

export const trackEventSchema = z.object({
  /** event name, snake_case */
  n: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  /** client timestamp, ms since epoch */
  ts: z.number().int().positive(),
  p: z.record(z.string().max(40), propValue).optional(),
});

export const trackPayloadSchema = z.object({
  /** session id: "<start ms base36>-<random>" (the start time keys the record) */
  sid: z.string().regex(/^[0-9a-z]{6,12}-[0-9a-z]{4,16}$/),
  /** anonymous visitor id kept in localStorage */
  vid: z.string().regex(/^[0-9a-z-]{6,40}$/),
  /** which demo: "roblox", "monkey-quest", or "x:<project slug>" for builder endcaps */
  demo: z.string().regex(/^[a-z0-9:_-]{1,64}$/),
  /** client link code from ?c=, if any */
  link: z
    .string()
    .regex(/^[a-z0-9_-]{1,40}$/)
    .nullish(),
  /** display name from the link (or ?to=), if any */
  client: z.string().max(80).nullish(),
  ref: z.string().max(300).nullish(),
  /** time the page was visible, ms, cumulative for the session */
  activeMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 3600 * 1000)
    .optional(),
  screen: z.string().max(20).optional(),
  events: z.array(trackEventSchema).max(200),
});
export type TrackPayload = z.infer<typeof trackPayloadSchema>;

export interface StoredEvent {
  n: string;
  ts: number;
  p?: Record<string, string | number | boolean | null>;
}

export interface StoredSession {
  sid: string;
  vid: string;
  demo: string;
  link: string | null;
  client: string | null;
  startedAt: number;
  lastAt: number;
  activeMs: number;
  ref: string | null;
  screen: string | null;
  device: { mobile: boolean; os: string; browser: string };
  geo: { country: string | null; city: string | null };
  events: StoredEvent[];
}

/** "<YYYY-MM-DD>/<sid>" from the start time encoded in the session id. */
export function sessionKey(sid: string): string {
  const start = parseInt(sid.split("-")[0], 36);
  const d = new Date(Number.isFinite(start) ? start : Date.now());
  return `${d.toISOString().slice(0, 10)}/${sid}`;
}

export function parseUserAgent(ua: string): StoredSession["device"] {
  const s = ua || "";
  const os = /iPhone|iPad|iPod/.test(s)
    ? "iOS"
    : /Android/.test(s)
      ? "Android"
      : /Mac OS X/.test(s)
        ? "macOS"
        : /Windows/.test(s)
          ? "Windows"
          : /CrOS/.test(s)
            ? "ChromeOS"
            : /Linux/.test(s)
              ? "Linux"
              : "Other";
  const browser = /Edg\//.test(s)
    ? "Edge"
    : /SamsungBrowser/.test(s)
      ? "Samsung"
      : /CriOS|Chrome\//.test(s)
        ? "Chrome"
        : /FxiOS|Firefox\//.test(s)
          ? "Firefox"
          : /Safari\//.test(s)
            ? "Safari"
            : "Other";
  return { mobile: /Mobi|iPhone|iPad|Android/.test(s), os, browser };
}

// ---- client links (managed in /admin/links, resolved by the demo pages) ----

export const linkSchema = z.object({
  /** short code used in ?c= */
  code: z.string().regex(/^[a-z0-9_-]{2,40}$/),
  /** who the link is for, shown as "Prepared for <name>" */
  name: z.string().min(1).max(80),
  /** which demo it opens: "roblox" | "monkey-quest" | "x:<slug>" */
  demo: z.string().regex(/^[a-z0-9:_-]{1,64}$/),
  /** skip the password screen for this link */
  unlock: z.boolean().default(false),
  note: z.string().max(500).optional(),
  createdAt: z.number().int(),
  archived: z.boolean().optional(),
});
export type ArLink = z.infer<typeof linkSchema>;

/** Where each demo lives, for building share URLs. */
export const DEMO_PATHS: Record<string, string> = {
  roblox: "/roblox/activated-retail/",
  "monkey-quest": "/monkey-quest/activated-retail/",
};
export function demoPath(demo: string): string {
  if (demo.startsWith("x:")) return `/x/${demo.slice(2)}`;
  return DEMO_PATHS[demo] ?? "/";
}
