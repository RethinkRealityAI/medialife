/**
 * Locations for "Where is Bobo?" (/evade/where-is-bobo/): where a Media Library
 * file was filmed or photographed, and where an AR event happened.
 *
 * Client-safe: types and pure helpers only. The city list and the nearest-city
 * lookup are server-side (geo.server.ts); the admin picker calls
 * GET /api/bobo/places.
 */

export type MediaLocation = {
  /** Optional venue or landmark, shown above the city: "Golden Gate Bridge", "RDC 2026". */
  place: string;
  /** Empty for a country-only tag. */
  city: string;
  region: string;
  country: string;
  /** ISO 3166-1 alpha-2, upper case. */
  countryCode: string;
  lat: number;
  lng: number;
  /** When Bobo was there (ms since epoch); null means "use the upload date". */
  seenAt: number | null;
  /** Optional public credit shown on the globe: "@handle" or a first name. Set by the team, never by the game. */
  credit?: string;
};

export const LOCATION_LIMITS = { place: 80, city: 80, region: 80, country: 80, credit: 40 } as const;

const line = (v: unknown, max: number) =>
  typeof v === "string"
    ? Array.from(v)
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A clean location, or null when it's unusable (no country or bad coordinates). */
export function cleanLocation(raw: unknown): MediaLocation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lat = num(r.lat);
  const lng = num(r.lng);
  const cc = line(r.countryCode, 2).toUpperCase();
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const seen = num(r.seenAt);
  const credit = line(r.credit, LOCATION_LIMITS.credit);
  return {
    ...(credit ? { credit } : {}),
    place: line(r.place, LOCATION_LIMITS.place),
    city: line(r.city, LOCATION_LIMITS.city),
    region: line(r.region, LOCATION_LIMITS.region),
    country: line(r.country, LOCATION_LIMITS.country) || cc,
    countryCode: cc,
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    seenAt: seen && seen > 0 && seen < 8.64e15 ? Math.round(seen) : null,
  };
}

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** One hotspot per city (or per country for a country-only tag): "us-san-francisco", "jp". */
export const placeKey = (l: Pick<MediaLocation, "city" | "countryCode">) =>
  l.city ? `${l.countryCode.toLowerCase()}-${slugify(l.city)}` : l.countryCode.toLowerCase();

/** "Golden Gate Bridge · San Francisco, United States" (whatever parts there are). */
export function locationLabel(l: MediaLocation | null | undefined, withPlace = true): string {
  if (!l) return "";
  const where = [l.city, l.country].filter(Boolean).join(", ");
  return withPlace && l.place ? `${l.place} · ${where}` : where;
}

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A place from the city search (GET /api/bobo/places). */
export type PlaceHit = {
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  population: number;
  /** "city" or a country-only result. */
  kind: "city" | "country";
};
