/**
 * "Where is Bobo?" (/evade/where-is-bobo/): a 3D globe of the places Bobo, the
 * EVADE cat, has been. Two sources feed it:
 *
 *   1. Media Library files (videos, images) that are Public, have a location
 *      and "Show on the Where is Bobo? globe" switched on (admin, /admin/media).
 *   2. AR events: the activated-merch AR experience / Cola Run posts scans,
 *      plays, rewards and sightings to POST /api/bobo/events. They show as a
 *      live layer (anonymous, city level).
 *
 * The AR experience can also upload captures with the ingest token through the
 * Media Library's upload API; those stay private until the team reviews them.
 *
 * Endpoints:
 *   GET  /api/bobo/feed.json   public, CDN-cached: everything the globe draws
 *   POST /api/bobo/events      ingest (Bearer BOBO_INGEST_TOKEN, or an allowed Origin)
 *   GET  /api/bobo/places?q=   city search for the admin location picker (admin)
 *
 * Client-safe: types and constants only.
 */
import type { MediaLocation } from "./location";

export const BOBO = {
  pagePath: "/evade/where-is-bobo/",
  feedPath: "/api/bobo/feed.json",
  eventsPath: "/api/bobo/events",
  /** Default Media Library collection for captures the AR experience uploads. */
  captureCollection: "Where is Bobo · AR captures",
  captureTags: ["AR capture", "Needs review", "Bobo"],
  /** Events per request. */
  maxBatch: 50,
  /** Events per minute per visitor (browser mode; best effort, per function instance). */
  ratePerMinute: 120,
  /** Coordinates from browsers are rounded to this many degrees (~5 km) before storing. */
  publicGridDeg: 0.05,
  /** How many recent events the feed carries. */
  recentEvents: 40,
  /** Largest upload the ingest token may start (video captures). */
  maxIngestBytes: 512 * 1024 * 1024,
} as const;

export const BOBO_EVENT_TYPES = [
  "scan",
  "play",
  "reward",
  "sighting",
  "share",
  "capture",
  "custom",
] as const;
export type BoboEventType = (typeof BOBO_EVENT_TYPES)[number];

export const BOBO_EVENT_LABELS: Record<BoboEventType, string> = {
  scan: "Keychain scanned",
  play: "Cola Run played",
  reward: "Reward unlocked",
  sighting: "Bobo spotted",
  share: "Shared",
  capture: "AR capture",
  custom: "Activity",
};

/** One media item on the globe. URLs are public and same-origin. */
export type FeedMedia = {
  id: string;
  kind: "video" | "image";
  title: string;
  description: string;
  url: string;
  poster: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  /** ISO date Bobo was there. */
  seenAt: string;
  /** Venue / landmark ("Golden Gate Bridge"), may be empty. */
  place: string;
  tags: string[];
  sample: boolean;
};

export type FeedPlace = {
  key: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  /** Newest first. */
  media: FeedMedia[];
  /** AR events counted here (all types). */
  events: number;
  byType: Partial<Record<BoboEventType, number>>;
  firstSeen: string | null;
  lastSeen: string | null;
};

export type FeedEvent = {
  type: BoboEventType;
  at: string;
  key: string | null;
  city: string;
  country: string;
  countryCode: string;
};

export type BoboFeed = {
  v: 1;
  generatedAt: string;
  stats: {
    places: number;
    countries: number;
    media: number;
    events: number;
    /** Along the journey (media places in the order Bobo first visited them). */
    km: number;
  };
  /** Places with media first (newest sighting first), then event-only places. */
  places: FeedPlace[];
  /** Place keys in the order Bobo first visited them (media only). */
  journey: string[];
  /** ISO codes of every country with media or events. */
  countries: string[];
  /** Newest first. */
  recent: FeedEvent[];
  /** True when every media item is sample data (previews). */
  sample: boolean;
};

/** A stored event (src/lib/bobo/events.server.ts). */
export type BoboEvent = {
  id: string;
  type: BoboEventType;
  at: number;
  receivedAt: number;
  trusted: boolean;
  source: string;
  /** Hashed; never the raw id the client sent. */
  session: string | null;
  location: Omit<MediaLocation, "place" | "seenAt"> | null;
  /** How the location was found. */
  locatedBy: "coords" | "name" | "ip" | "country" | null;
  /** The point the client sent: exact when trusted, rounded to ~5 km from browsers. */
  coords: { lat: number; lng: number } | null;
  mediaId: string | null;
  props: Record<string, string | number | boolean>;
};

/** The aggregate the feed reads (one blob, updated per batch). */
export type BoboCell = {
  key: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  count: number;
  byType: Partial<Record<BoboEventType, number>>;
  firstAt: number;
  lastAt: number;
};

export type BoboAggregate = {
  v: 1;
  total: number;
  unlocated: number;
  byType: Partial<Record<BoboEventType, number>>;
  cells: Record<string, BoboCell>;
  recent: FeedEvent[];
  updatedAt: number;
};
