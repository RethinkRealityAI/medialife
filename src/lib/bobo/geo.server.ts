import { haversineKm, slugify, type PlaceHit } from "./location";

// City and country lookups for "Where is Bobo?": the admin place search and
// snapping an AR event's coordinates to the nearest city. Data from GeoNames
// (CC BY 4.0), built by scripts/build-bobo-geo.mjs into places.json /
// countries.json. Loaded lazily so other server routes don't pay for it.

type Row = [name: string, region: string, cc: string, lat: number, lng: number, pop: number];
type Data = {
  rows: Row[];
  folded: string[];
  countries: Record<string, [name: string, lat: number, lng: number]>;
  /** 10° buckets for the nearest-city search. */
  grid: Map<string, number[]>;
};

let data: Promise<Data> | null = null;

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

const cell = (lat: number, lng: number) =>
  `${Math.floor((lat + 90) / 10)}:${Math.floor(((((lng + 180) % 360) + 360) % 360) / 10)}`;

function load(): Promise<Data> {
  data ||= Promise.all([import("./places.json"), import("./countries.json")]).then(([p, c]) => {
    const rows = (p.default ?? p) as unknown as Row[];
    const countries = (c.default ?? c) as unknown as Data["countries"];
    const grid = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const k = cell(r[3], r[4]);
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    });
    return { rows, folded: rows.map((r) => fold(r[0])), countries, grid };
  });
  return data;
}

const hit = (d: Data, r: Row): PlaceHit => ({
  city: r[0],
  region: r[1],
  country: d.countries[r[2]]?.[0] ?? r[2],
  countryCode: r[2],
  lat: r[3],
  lng: r[4],
  population: r[5],
  kind: "city",
});

/** Country name for an ISO code ("US" → "United States"), or null. */
export async function countryName(cc: string): Promise<string | null> {
  return (await load()).countries[cc.toUpperCase()]?.[0] ?? null;
}

/** A country's label point, for country-only tags. */
export async function countryPlace(cc: string): Promise<PlaceHit | null> {
  const d = await load();
  const c = d.countries[cc.toUpperCase()];
  return c
    ? {
        city: "",
        region: "",
        country: c[0],
        countryCode: cc.toUpperCase(),
        lat: c[1],
        lng: c[2],
        population: 0,
        kind: "country",
      }
    : null;
}

/**
 * Cities (and countries) matching what someone typed: "san fran", "lagos ng",
 * "tokyo, japan". Prefix matches first, then bigger cities. At most `limit`.
 */
export async function searchPlaces(q: string, limit = 8): Promise<PlaceHit[]> {
  const d = await load();
  const words = fold(q)
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 6);
  if (!words.length) return [];
  const [first, ...rest] = words;
  const countryMatches = (cc: string) => {
    const name = fold(d.countries[cc]?.[0] ?? "");
    return (w: string) => cc.toLowerCase() === w || name.startsWith(w) || name.includes(` ${w}`);
  };
  const scored: { i: number; s: number }[] = [];
  for (let i = 0; i < d.rows.length; i++) {
    const name = d.folded[i];
    const r = d.rows[i];
    let s = 0;
    if (name === words.join(" ")) s = 5;
    else if (name.startsWith(words.join(" "))) s = 4;
    else if (name.startsWith(first)) s = 3;
    else if (name.includes(` ${first}`) || name.includes(`-${first}`)) s = 2;
    else continue;
    // the other words may name more of the city, the region or the country
    const region = fold(r[1]);
    const cm = countryMatches(r[2]);
    let ok = true;
    for (const w of rest) {
      if (name.includes(w) || region.startsWith(w) || region.includes(` ${w}`) || cm(w)) continue;
      ok = false;
      break;
    }
    if (!ok) continue;
    scored.push({ i, s });
  }
  scored.sort((a, b) => b.s - a.s || d.rows[b.i][5] - d.rows[a.i][5]);
  const out = scored.slice(0, limit).map((x) => hit(d, d.rows[x.i]));
  // a country by name, for country-only tags
  const fullQ = words.join(" ");
  for (const [cc, c] of Object.entries(d.countries)) {
    const name = fold(c[0]);
    if (
      name === fullQ ||
      (fullQ.length >= 3 && name.startsWith(fullQ)) ||
      cc.toLowerCase() === fullQ
    ) {
      const cp = await countryPlace(cc);
      if (cp) out.splice(Math.min(out.length, name === fullQ ? 0 : 3), 0, cp);
      break;
    }
  }
  return out.slice(0, limit);
}

/**
 * The city a point belongs to, within `maxKm`, or null (open ocean, the middle
 * of nowhere). A point inside a big city's metro radius maps to that city, not
 * the suburb it's technically nearest to (Mushin → Lagos); otherwise the nearest.
 */
export async function nearestPlace(
  lat: number,
  lng: number,
  maxKm = 120,
): Promise<PlaceHit | null> {
  const d = await load();
  let nearest: { i: number; km: number } | null = null;
  let metro: { i: number; pop: number } | null = null;
  const la = Math.floor((lat + 90) / 10);
  const lo = Math.floor(((((lng + 180) % 360) + 360) % 360) / 10);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const k = `${la + dy}:${(lo + dx + 36) % 36}`;
      for (const i of d.grid.get(k) ?? []) {
        const r = d.rows[i];
        const km = haversineKm({ lat, lng }, { lat: r[3], lng: r[4] });
        if (km > maxKm) continue;
        if (!nearest || km < nearest.km) nearest = { i, km };
        // ~8 km for a town of 50k, ~22 km for a 10M megacity
        const radius = 8 + 6 * Math.log10(Math.max(1, r[5] / 50000));
        if (km <= radius && (!metro || r[5] > metro.pop)) metro = { i, pop: r[5] };
      }
    }
  const pick = metro?.i ?? nearest?.i;
  return pick === undefined ? null : hit(d, d.rows[pick]);
}

/** A city by name (and optionally country), for events that send a name but no coordinates. */
export async function placeByName(city: string, cc?: string): Promise<PlaceHit | null> {
  const d = await load();
  const want = slugify(city);
  if (!want) return null;
  let best: Row | null = null;
  for (const r of d.rows) {
    if (cc && r[2] !== cc.toUpperCase()) continue;
    if (slugify(r[0]) !== want) continue;
    if (!best || r[5] > best[5]) best = r;
  }
  return best ? hit(d, best) : null;
}
