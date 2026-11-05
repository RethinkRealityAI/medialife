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
 * The AR experience can also upload captures through the Media Library's upload
 * API: with the ingest token (a server), or from an allowed browser Origin (the
 * game's record button; see captures.server.ts). Both stay private until the
 * team reviews them.
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
  /** Largest capture a player's browser may upload without the token (a 60 s clip is ~30 MB). */
  maxWebCaptureBytes: 80 * 1024 * 1024,
  /** Browser captures each visitor may start per window (best effort, per function instance). */
  webCapturesPerWindow: 8,
  webCaptureWindowMs: 10 * 60_000,
  /** Extra tag on captures that came straight from a player's browser. */
  webCaptureTag: "Web capture",
  /** The tag the team removes (or "Approve for the globe" removes) once a clip is checked. */
  reviewTag: "Needs review",
  /** Tag on web captures published without review (BOBO_CAPTURE_REVIEW=off). */
  autoPublishedTag: "Auto-published",
  /** Game clips waiting for review show on the globe as "in review" pins for this long. */
  reviewPinDays: 14,
  /** How long a player's view key opens their own clip. */
  viewKeyDays: 30,
  /** In-review pins the feed carries at most. */
  maxReviewPins: 30,
  /** Netlify cache tag on the feed; purged when a clip lands or the team changes globe media. */
  feedCacheTag: "bobo-feed",
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
  /**
   * A game clip the team hasn't checked yet: the pin shows, the clip doesn't.
   * url and poster are empty; title is generic. The player who sent it can
   * still watch it through /api/bobo/clips/<id> with their view key.
   */
  review?: boolean;
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
    /** Game clips on the globe waiting for the team's review (pins without a playable clip). */
    review: number;
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

/** GET /api/bobo/clips/<id>?k=<viewKey>: the player's own clip, before or after review. */
export type OwnClip = FeedMedia & {
  key: string;
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
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
