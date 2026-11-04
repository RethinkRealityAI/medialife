#!/usr/bin/env node
/**
 * Builds the geography behind "Where is Bobo?" (/evade/where-is-bobo/) and the
 * Media Library's location tagging. Run by hand after changing it; the output
 * is committed, like the cards and creator pages (nothing runs on Netlify).
 *
 *   node scripts/build-bobo-geo.mjs
 *
 * Inputs (downloaded into .cache/bobo-geo/ on first run):
 *   - GeoNames cities15000, countryInfo, admin1 codes   (CC BY 4.0, geonames.org)
 *   - world-atlas countries-110m TopoJSON (Natural Earth, public domain; devDependency)
 *
 * Outputs:
 *   src/lib/bobo/places.json      cities for the admin place search and for
 *                                 snapping AR events to the nearest city
 *                                 [name, region, countryCode, lat, lng, population][]
 *   src/lib/bobo/countries.json   { "US": ["United States", lat, lng], … } (label point)
 *   public/evade/where-is-bobo/assets/data/globe.bin
 *                                 the globe: land dots (with their country) and
 *                                 coastline / border line segments. Format below.
 *
 * globe.bin (little-endian):
 *   "BOBO" u16 version=1 u16 countryCount u32 dotCount u32 coastVerts u32 borderVerts
 *   countryCount × 2 ASCII bytes (ISO 3166-1 alpha-2; dot country index i+1, 0 = none)
 *   Int16[dotCount] lat×180, Int16[dotCount] lng×180, Uint8[dotCount] country (padded to 4)
 *   Int16[coastVerts×2] (lat×180, lng×180) pairs as GL line segments
 *   Int16[borderVerts×2] same, land borders between countries
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

import { geoArea, geoBounds, geoCentroid, geoContains, geoInterpolate } from "d3-geo";
import { feature, mesh } from "topojson-client";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".cache", "bobo-geo");
mkdirSync(cache, { recursive: true });

function fetchTo(url, file) {
  const out = path.join(cache, file);
  if (!existsSync(out)) {
    console.log(`downloading ${url}`);
    execFileSync("curl", ["-sSLf", "-o", out, url]);
  }
  return out;
}

const GEONAMES = "https://download.geonames.org/export/dump";
const zip = fetchTo(`${GEONAMES}/cities15000.zip`, "cities15000.zip");
if (!existsSync(path.join(cache, "cities15000.txt")))
  execFileSync("unzip", ["-o", "-q", zip, "-d", cache]);
const countryInfo = readFileSync(fetchTo(`${GEONAMES}/countryInfo.txt`, "countryInfo.txt"), "utf8");
const admin1 = readFileSync(
  fetchTo(`${GEONAMES}/admin1CodesASCII.txt`, "admin1CodesASCII.txt"),
  "utf8",
);

/* ── Countries ─────────────────────────────────────────────────────────────── */

const countries = new Map(); // ISO2 → { name, numeric }
const byNumeric = new Map(); // "840" → "US"
for (const line of countryInfo.split("\n")) {
  if (!line || line.startsWith("#")) continue;
  const c = line.split("\t");
  const iso2 = c[0];
  const numeric = String(Number(c[2])).padStart(3, "0");
  const name = c[4];
  if (!iso2 || !name) continue;
  countries.set(iso2, { name, numeric });
  byNumeric.set(numeric, iso2);
}
// Short names people actually use on a map.
const SHORT = {
  US: "United States",
  GB: "United Kingdom",
  KR: "South Korea",
  KP: "North Korea",
  RU: "Russia",
  CD: "DR Congo",
  CG: "Congo",
  CZ: "Czechia",
  TZ: "Tanzania",
  IR: "Iran",
  SY: "Syria",
  VN: "Vietnam",
  LA: "Laos",
  BO: "Bolivia",
  VE: "Venezuela",
  MD: "Moldova",
  TW: "Taiwan",
  PS: "Palestine",
};
for (const [k, v] of Object.entries(SHORT)) if (countries.has(k)) countries.get(k).name = v;

const regions = new Map(); // "US.CA" → "California"
for (const line of admin1.split("\n")) {
  const c = line.split("\t");
  if (c.length >= 2) regions.set(c[0], c[1]);
}

/* ── Places ────────────────────────────────────────────────────────────────── */

const places = [];
const rl = readline.createInterface({
  input: createReadStream(path.join(cache, "cities15000.txt")),
});
for await (const line of rl) {
  const c = line.split("\t");
  const name = c[1];
  const lat = Number(c[4]);
  const lng = Number(c[5]);
  const fcode = c[7];
  const cc = c[8];
  const pop = Number(c[14]) || 0;
  const seat = fcode === "PPLC" || fcode === "PPLA" || (fcode === "PPLA2" && pop >= 25000);
  if (!(pop >= 50000 || seat)) continue;
  if (fcode === "PPLX") continue; // a section of a city ("Paris 16 Passy"), not a city
  if (!countries.has(cc)) continue;
  const region = regions.get(`${cc}.${c[10]}`) ?? "";
  places.push([name, region === name ? "" : region, cc, +lat.toFixed(3), +lng.toFixed(3), pop]);
}
places.sort((a, b) => b[5] - a[5]);

/* ── Globe ─────────────────────────────────────────────────────────────────── */

const topo = JSON.parse(
  readFileSync(path.join(root, "node_modules/world-atlas/countries-110m.json"), "utf8"),
);
const feats = feature(topo, topo.objects.countries).features;
const codes = []; // index → ISO2 (dot country index = position + 1)
const featCode = new Map();
for (const f of feats) {
  const id = f.id == null ? null : String(f.id).padStart(3, "0");
  let cc = id ? byNumeric.get(id) : null;
  if (!cc && f.properties?.name === "Kosovo") cc = "XK";
  if (!cc && f.properties?.name === "N. Cyprus") cc = "CY";
  if (!cc && f.properties?.name === "Somaliland") cc = "SO";
  if (!cc) continue;
  if (!codes.includes(cc)) codes.push(cc);
  featCode.set(f, cc);
}

// Label points: centroid of each country's largest polygon (so France isn't in the Atlantic).
const labels = {};
for (const f of feats) {
  const cc = featCode.get(f);
  if (!cc || !countries.has(cc)) continue;
  let g = f.geometry;
  if (g.type === "MultiPolygon") {
    let best = null;
    let bestA = -1;
    for (const coords of g.coordinates) {
      const poly = { type: "Polygon", coordinates: coords };
      const a = geoArea(poly);
      if (a > bestA) {
        bestA = a;
        best = poly;
      }
    }
    g = best;
  }
  const [lng, lat] = geoCentroid(g);
  if (!labels[cc]) labels[cc] = [countries.get(cc).name, +lat.toFixed(3), +lng.toFixed(3)];
}
// Countries too small for 110m still need a point (for a country-only tag): use the capital.
for (const [cc, c] of countries) {
  if (labels[cc]) continue;
  const cap = places.find((p) => p[2] === cc);
  if (cap) labels[cc] = [c.name, cap[3], cap[4]];
}

// Land dots on a Fibonacci sphere, tested against the country polygons (bbox first).
const N = 52000;
const boxes = feats
  .filter((f) => featCode.has(f))
  .map((f) => ({ f, b: geoBounds(f), idx: codes.indexOf(featCode.get(f)) + 1 }));
const dLat = [];
const dLng = [];
const dCc = [];
const golden = Math.PI * (3 - Math.sqrt(5));
const inBox = ([lng, lat], [[x0, y0], [x1, y1]]) =>
  lat >= y0 && lat <= y1 && (x0 <= x1 ? lng >= x0 && lng <= x1 : lng >= x0 || lng <= x1);
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = golden * i;
  const lat = (Math.asin(y) * 180) / Math.PI;
  const lng =
    (((Math.atan2(Math.sin(th) * r, Math.cos(th) * r) * 180) / Math.PI + 540) % 360) - 180;
  if (lat < -60) continue; // Antarctica reads as noise at the bottom of the globe
  const p = [lng, lat];
  for (const { f, b, idx } of boxes) {
    if (!inBox(p, b)) continue;
    if (geoContains(f, p)) {
      dLat.push(Math.round(lat * 180));
      dLng.push(Math.round(lng * 180));
      dCc.push(idx);
      break;
    }
  }
}

// Line segments, densified so they follow the curve of the globe.
function segments(ml) {
  const out = [];
  for (const line of ml.coordinates) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const interp = geoInterpolate(a, b);
      const deg = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(deg / 2));
      for (let k = 0; k < n; k++) {
        const p = interp(k / n);
        const q = interp((k + 1) / n);
        out.push(p[1], p[0], q[1], q[0]);
      }
    }
  }
  return out;
}
const coast = segments(mesh(topo, topo.objects.countries, (a, b) => a === b));
const borders = segments(mesh(topo, topo.objects.countries, (a, b) => a !== b));

const q = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 180)));
const nDots = dLat.length;
const pad4 = (n) => (n + 3) & ~3;
const headerBytes = 4 + 2 + 2 + 4 + 4 + 4;
const size =
  headerBytes +
  pad4(codes.length * 2) +
  nDots * 4 +
  pad4(nDots) +
  coast.length * 2 +
  borders.length * 2;
const buf = Buffer.alloc(size);
let o = 0;
buf.write("BOBO", o, "ascii");
o += 4;
buf.writeUInt16LE(1, o);
o += 2;
buf.writeUInt16LE(codes.length, o);
o += 2;
buf.writeUInt32LE(nDots, o);
o += 4;
buf.writeUInt32LE(coast.length / 2, o);
o += 4;
buf.writeUInt32LE(borders.length / 2, o);
o += 4;
for (const cc of codes) {
  buf.write(cc, o, "ascii");
  o += 2;
}
o = headerBytes + pad4(codes.length * 2);
for (const v of dLat) (buf.writeInt16LE(v, o), (o += 2));
for (const v of dLng) (buf.writeInt16LE(v, o), (o += 2));
for (const v of dCc) (buf.writeUInt8(v, o), (o += 1));
o = headerBytes + pad4(codes.length * 2) + nDots * 4 + pad4(nDots);
for (const v of coast) (buf.writeInt16LE(q(v), o), (o += 2));
for (const v of borders) (buf.writeInt16LE(q(v), o), (o += 2));

const outDir = path.join(root, "public/evade/where-is-bobo/assets/data");
mkdirSync(outDir, { recursive: true });
mkdirSync(path.join(root, "src/lib/bobo"), { recursive: true });
writeFileSync(path.join(outDir, "globe.bin"), buf);
writeFileSync(path.join(root, "src/lib/bobo/places.json"), JSON.stringify(places));
writeFileSync(path.join(root, "src/lib/bobo/countries.json"), JSON.stringify(labels));

console.log(
  `places: ${places.length} · countries: ${Object.keys(labels).length} · dots: ${nDots} · coast segs: ${coast.length / 4} · border segs: ${borders.length / 4} · globe.bin ${(size / 1024).toFixed(0)} KB`,
);
