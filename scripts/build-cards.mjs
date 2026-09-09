#!/usr/bin/env node
/**
 * MEDIALIFE virtual business card generator.
 *
 * Reads every `team/<slug>.json`, and for each one writes:
 *   public/<slug>/index.html   – the card page (from scripts/templates/card.html)
 *   public/<slug>/qr-*.svg     – branded QR codes (vCard payload, and card link)
 *   public/<slug>/<slug>.vcf   – vCard with embedded photo (one-tap "Save contact")
 *   public/<slug>/portrait.webp, avatar.jpg – copied from team/<slug>/
 *
 * Cards sit at the site root (medialife.ai/dapo), which means a slug shares a
 * namespace with the site's own routes. RESERVED below is the guard: a slug that
 * would shadow a real page — or be shadowed by one — is refused at build time
 * rather than discovered as a 404 on a printed card.
 *
 * It also rewrites the marked blocks in netlify.toml and public/robots.txt, so
 * the noindex headers and crawl rules can never drift from the set of cards
 * that actually exist.
 *
 * Usage:  npm run build:cards
 */
import { readFile, writeFile, mkdir, readdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEAM_DIR = path.join(ROOT, "team");
const OUT_DIR = path.join(ROOT, "public");
const TEMPLATE = path.join(ROOT, "scripts", "templates", "card.html");
const NETLIFY_TOML = path.join(ROOT, "netlify.toml");
const ROBOTS = path.join(ROOT, "public", "robots.txt");

/**
 * Slugs a card may not take. Two kinds of collision, both silent in production:
 * a card that shadows a real route, and a route that shadows a card. `card` is
 * the shared-asset folder; the rest are the site's routes and public/ entries.
 */
const RESERVED = new Set([
  "api",
  "assets",
  "brand",
  "c",
  "card",
  "case-studies",
  "contact",
  "fan-reactions",
  "insights",
  "live",
  "merch",
  "public",
  "static",
  "technology",
  "work",
  "__forms",
  "favicon",
  "robots",
  "sitemap",
  "og",
  "site",
]);

const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* ---------- vCard ---------- */
function vcardEscape(s = "") {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function foldLine(line) {
  // RFC 6350: fold lines longer than 75 octets
  const out = [];
  let i = 0;
  while (i < line.length) {
    out.push((i === 0 ? "" : " ") + line.slice(i, i + (i === 0 ? 75 : 74)));
    i += i === 0 ? 75 : 74;
  }
  return out.join("\r\n");
}
async function buildVcard(m, avatarPath) {
  const photo = existsSync(avatarPath) ? (await readFile(avatarPath)).toString("base64") : null;
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(m.lastName)};${vcardEscape(m.firstName)};;;`,
    `FN:${vcardEscape(m.displayName)}`,
    `ORG:${vcardEscape(m.org)}`,
    `TITLE:${vcardEscape(m.title)}`,
    `TEL;TYPE=CELL,VOICE:${m.phone}`,
    `EMAIL;TYPE=INTERNET,WORK:${m.email}`,
    `URL;TYPE=WORK:${m.website}`,
    `item1.URL:${m.linkedin}`,
    "item1.X-ABLabel:LinkedIn",
    `X-SOCIALPROFILE;TYPE=linkedin:${m.linkedin}`,
    `item2.URL:${m.instagram}`,
    "item2.X-ABLabel:Instagram",
    `X-SOCIALPROFILE;TYPE=instagram:${m.instagram}`,
    `IMPP;X-SERVICE-TYPE=WhatsApp;TYPE=HOME:whatsapp:+${m.whatsapp}`,
    `NOTE:${vcardEscape(`${m.org} — ${m.tagline} Card: ${m.cardUrl}`)}`,
  ];
  if (photo) lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photo}`);
  lines.push(`REV:${new Date().toISOString()}`, "END:VCARD");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/* ---------- Compact vCard for the QR payload ----------
 * No photo and no folding: iOS Camera and Android (camera / Google Lens) both parse
 * this inline and offer "Add contact" natively. Keep it short so the code stays sparse. */
function buildQrVcard(m) {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(m.lastName)};${vcardEscape(m.firstName)}`,
    `FN:${vcardEscape(m.displayName)}`,
    `ORG:${vcardEscape(m.org)}`,
    `TITLE:${vcardEscape(m.title)}`,
    `TEL;TYPE=CELL:${m.phone}`,
    `EMAIL:${m.email}`,
    `URL:${m.linkedin}`,
    `NOTE:${vcardEscape(`WhatsApp +${m.whatsapp} / IG ${m.instagramHandle}`)}`,
    "END:VCARD",
  ].join("\n");
}

/* ---------- Branded QR (rounded modules, ember gradient, optional logo well) ---------- */
function buildQrSvg(
  payload,
  { primary, accent },
  { ecc = "H", logo = true, label = "QR code" } = {},
) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: ecc });
  const n = qr.modules.size;
  const get = (r, c) => qr.modules.get(r, c) === 1;
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  // Logo well: clear a centre block (H = 30% recoverable; we clear ~6%)
  const well = logo ? Math.floor(n * 0.24) : 0;
  const wellStart = Math.floor((n - well) / 2);
  const inWell = (r, c) =>
    logo && r >= wellStart && r < wellStart + well && c >= wellStart && c < wellStart + well;

  const q = 2; // quiet zone in modules
  const size = n + q * 2;
  let dots = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!get(r, c) || isFinder(r, c) || inWell(r, c)) continue;
      const x = c + q,
        y = r + q;
      // denser codes get squarer modules so cameras see clean edges
      const inset = n > 45 ? 0.03 : 0.06,
        rx = n > 45 ? 0.16 : 0.22;
      dots += `<rect x="${x + inset}" y="${y + inset}" width="${1 - inset * 2}" height="${1 - inset * 2}" rx="${rx}"/>`;
    }
  }
  const finder = (x, y) => `
    <rect x="${x}" y="${y}" width="7" height="7" rx="2.1" fill="url(#gd)"/>
    <rect x="${x + 1}" y="${y + 1}" width="5" height="5" rx="1.4" fill="#f7f8fb"/>
    <rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="url(#g)"/>`;

  const cx = size / 2;
  const logoR = well / 2 - 0.4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 10}" height="${size * 10}" role="img" aria-label="${esc(label)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/>
    </linearGradient>
    <!-- Deep ember for data modules: keeps >7:1 contrast on the light tile so every scanner reads it -->
    <linearGradient id="gd" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#062c48"/><stop offset="1" stop-color="#6d0a45"/>
    </linearGradient>
    <radialGradient id="core" cx="50%" cy="42%" r="60%">
      <stop offset="0" stop-color="#7fd4ff"/><stop offset=".55" stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="1.5" fill="#f7f8fb"/>
  <g fill="url(#gd)">${dots}</g>
  ${finder(q, q)}${finder(size - q - 7, q)}${finder(q, size - q - 7)}
  ${
    logo
      ? `<circle cx="${cx}" cy="${cx}" r="${logoR}" fill="#f7f8fb"/>
  <circle cx="${cx}" cy="${cx}" r="${logoR * 0.72}" fill="none" stroke="url(#g)" stroke-width="${logoR * 0.16}"/>
  <circle cx="${cx}" cy="${cx}" r="${logoR * 0.4}" fill="url(#core)"/>
  <circle cx="${cx - logoR * 0.14}" cy="${cx - logoR * 0.16}" r="${logoR * 0.11}" fill="#fff" opacity=".55"/>`
      : ""
  }
</svg>`;
}

/* ---------- Render ---------- */
function render(tpl, data) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in data)) throw new Error(`Template placeholder {{${k}}} has no value`);
    return data[k];
  });
}

async function buildOne(file) {
  const m = JSON.parse(await readFile(path.join(TEAM_DIR, file), "utf8"));
  const src = path.join(TEAM_DIR, m.slug);
  const out = path.join(OUT_DIR, m.slug);
  await mkdir(out, { recursive: true });

  for (const f of [m.portrait, m.avatar]) {
    if (existsSync(path.join(src, f))) await copyFile(path.join(src, f), path.join(out, f));
  }

  const vcfName = `${m.slug}.vcf`;
  await writeFile(path.join(out, vcfName), await buildVcard(m, path.join(src, m.avatar)));
  // Contact QR: the vCard itself — scanning saves straight into Contacts on iOS and Android.
  // ECC M keeps the module count low enough to scan from a phone screen; no logo well.
  await writeFile(
    path.join(out, "qr-contact.svg"),
    buildQrSvg(buildQrVcard(m), m, {
      ecc: "M",
      logo: false,
      label: "QR code — scan to save contact",
    }),
  );
  // Link QR: opens this card (for sharing the full experience).
  await writeFile(
    path.join(out, "qr-link.svg"),
    buildQrSvg(m.cardUrl, m, { ecc: "H", logo: true, label: "QR code — scan to open this card" }),
  );

  const tpl = await readFile(TEMPLATE, "utf8");
  const waText = encodeURIComponent(m.whatsappMessage || "");
  // Every card-local asset is prefixed with this. Root-absolute, not relative:
  // the card is reachable at both /<slug> and /<slug>/, and a relative src
  // resolves against / on the first of those.
  const base = `/${m.slug}/`;
  const html = render(tpl, {
    base: esc(base),
    title: esc(`${m.displayName} — ${m.org}`),
    displayName: esc(m.displayName),
    firstName: esc(m.firstName),
    jobTitle: esc(m.title),
    org: esc(m.org),
    location: esc(m.location),
    tagline: esc(m.tagline),
    phone: esc(m.phone),
    phoneDisplay: esc(m.phoneDisplay),
    email: esc(m.email),
    whatsappUrl: esc(`https://wa.me/${m.whatsapp}${waText ? `?text=${waText}` : ""}`),
    linkedin: esc(m.linkedin),
    instagram: esc(m.instagram),
    instagramHandle: esc(m.instagramHandle),
    website: esc(m.website),
    websiteDisplay: esc(m.website.replace(/^https?:\/\//, "")),
    cardUrl: esc(m.cardUrl),
    vcf: esc(vcfName),
    portrait: esc(m.portrait),
    avatar: esc(m.avatar),
    accent: esc(m.accent || "#ff37ae"),
    primary: esc(m.primary || "#19affe"),
    year: String(new Date().getFullYear()),
  });
  await writeFile(path.join(out, "index.html"), html);
  console.log(`✓ ${m.displayName} → public/${m.slug}/  (${m.cardUrl})`);
}

/* ---------- Host config: keep noindex + crawl rules in step with the cards ----------
 * Cards live at the site root, so there is no /c/* glob to cover them all. Rather
 * than trusting a human to add two rules per team member, the generator owns a
 * marked block in each file and rewrites it every run.
 */
const MARK_START = "# >>> generated by scripts/build-cards.mjs — do not edit by hand";
const MARK_END = "# <<< end generated";

function replaceBlock(text, body) {
  const block = `${MARK_START}\n${body}\n${MARK_END}`;
  const i = text.indexOf(MARK_START);
  if (i === -1) return `${text.trimEnd()}\n\n${block}\n`;
  const j = text.indexOf(MARK_END, i);
  if (j === -1) throw new Error("Found a start marker with no matching end marker");
  return text.slice(0, i) + block + text.slice(j + MARK_END.length);
}

async function writeHostConfig(slugs) {
  const headers = slugs
    .flatMap((slug) => [
      `[[headers]]`,
      `  for = "/${slug}"`,
      `  [headers.values]`,
      `    X-Robots-Tag = "noindex, nofollow, noarchive"`,
      `    Cache-Control = "public, max-age=300"`,
      ``,
      `[[headers]]`,
      `  for = "/${slug}/*"`,
      `  [headers.values]`,
      `    X-Robots-Tag = "noindex, nofollow, noarchive"`,
      `    Cache-Control = "public, max-age=300"`,
      ``,
    ])
    .join("\n")
    .trimEnd();
  await writeFile(NETLIFY_TOML, replaceBlock(await readFile(NETLIFY_TOML, "utf8"), headers));

  const rules = slugs.map((slug) => `Disallow: /${slug}`).join("\n");
  await writeFile(ROBOTS, replaceBlock(await readFile(ROBOTS, "utf8"), rules));
  console.log(`✓ netlify.toml + robots.txt updated for ${slugs.length} card(s)`);
}

/* ---------- run ---------- */
const files = (await readdir(TEAM_DIR)).filter((f) => f.endsWith(".json"));
if (!files.length) throw new Error("No team/*.json files found");

const members = await Promise.all(
  files.map(async (f) => JSON.parse(await readFile(path.join(TEAM_DIR, f), "utf8"))),
);

// Validate the whole set before writing anything — a half-built run that leaves
// netlify.toml describing cards that do not exist is worse than a clean failure.
for (const m of members) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(m.slug)) {
    throw new Error(`Slug "${m.slug}" must be lowercase letters, digits and hyphens.`);
  }
  if (RESERVED.has(m.slug)) {
    throw new Error(
      `Slug "${m.slug}" is reserved — it would collide with a site route or asset folder. Pick another.`,
    );
  }
  const expected = `https://medialife.ai/${m.slug}`;
  if (m.cardUrl !== expected) {
    throw new Error(`cardUrl for "${m.slug}" is "${m.cardUrl}"; expected "${expected}".`);
  }
}
const dupes = members.map((m) => m.slug).filter((s, i, a) => a.indexOf(s) !== i);
if (dupes.length) throw new Error(`Duplicate slug(s): ${dupes.join(", ")}`);

for (const f of files) await buildOne(f);
await writeHostConfig(members.map((m) => m.slug).sort());
