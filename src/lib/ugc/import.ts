/**
 * Sign-up import: maps the landing page's Netlify form fields
 * (public/__forms.html, form "evade-ugc-creator"; values sent by
 * public/evade/creators/assets/js/page.js) into a UgcCreator draft + UgcPii,
 * and reads / writes CSV. Pure and client-safe, so the admin import page can
 * preview a CSV before sending it.
 */
import { UGC_PLATFORMS, type ShippingAddress, type UgcPlatform, type UgcSource } from "./model";

/** Every field the form sends, by its exact name. */
export const UGC_FORM_FIELDS = [
  "contact-name",
  "email",
  "phone",
  "creator_name",
  "country",
  "platforms",
  "main_platform",
  ...UGC_PLATFORMS.flatMap((p) => [`${p}_handle`, `${p}_audience`]),
  "address_line1",
  "address_line2",
  "city",
  "region",
  "postal_code",
  "address_country",
  "notes",
  "consent",
  "source",
  "page",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** "Contact Name", "contact-name" and "contact_name" all mean the same column. */
const norm = (k: string) =>
  k
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

const KNOWN = new Map<string, string>(UGC_FORM_FIELDS.map((f) => [norm(f), f]));
// Columns a Netlify CSV export (or the API) adds around the form fields.
const META: Record<string, string> = {
  id: "id",
  submission_id: "id",
  created_at: "created_at",
  date: "created_at",
  bot_field: "bot-field",
};

/** Maps arbitrary keys (CSV headers, API "data" keys) onto the form's field names. */
export function normaliseFields(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const n = norm(k);
    const key = KNOWN.get(n) ?? META[n];
    if (!key || v == null) continue;
    const s = Array.isArray(v) ? v.join(",") : String(v);
    if (!out[key]) out[key] = s.trim();
  }
  return out;
}

export type MappedSignup = {
  creator: {
    name: string;
    creatorName: string;
    email: string;
    country: string;
    platforms: UgcPlatform[];
    mainPlatform: UgcPlatform | null;
    handles: Partial<Record<UgcPlatform, string>>;
    audiences: Partial<Record<UgcPlatform, string>>;
    applicationNotes: string;
    consent: { contact: boolean; at: number | null };
    source: UgcSource;
  };
  pii: { phone: string; address: ShippingAddress | null };
};

export type MapResult = { ok: true; signup: MappedSignup } | { ok: false; reason: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n);
const isPlatform = (p: string): p is UgcPlatform =>
  (UGC_PLATFORMS as readonly string[]).includes(p);

function toTime(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * One form submission → creator + PII. `fields` uses the form's field names
 * (run CSV rows through normaliseFields first).
 */
export function mapSignup(
  fields: Record<string, string>,
  meta: { kind: UgcSource["kind"]; submissionId: string | null; submittedAt?: number | null },
): MapResult {
  if (fields["bot-field"]) return { ok: false, reason: "spam (honeypot filled)" };
  const email = clip(fields.email, 254).toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, reason: "missing or invalid email" };

  const listed = (fields.platforms ?? "")
    .split(/[,\s]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(isPlatform);
  const handles: Partial<Record<UgcPlatform, string>> = {};
  const audiences: Partial<Record<UgcPlatform, string>> = {};
  for (const p of UGC_PLATFORMS) {
    const h = clip(fields[`${p}_handle`], 200);
    const a = clip(fields[`${p}_audience`], 40);
    if (h) handles[p] = h;
    if (a) audiences[p] = a;
  }
  // a handle without the tile ticked still counts as a platform
  const platforms = UGC_PLATFORMS.filter((p) => listed.includes(p) || handles[p]);
  const main = (fields.main_platform ?? "").trim().toLowerCase();
  const mainPlatform = isPlatform(main) ? main : platforms.length === 1 ? platforms[0] : null;

  const name = clip(fields["contact-name"], 120);
  const country = clip(fields.country, 80);
  const line1 = clip(fields.address_line1, 200);
  const address: ShippingAddress | null = line1
    ? {
        name,
        line1,
        line2: clip(fields.address_line2, 200),
        city: clip(fields.city, 120),
        region: clip(fields.region, 120),
        postalCode: clip(fields.postal_code, 30),
        country: clip(fields.address_country, 80) || country,
      }
    : null;
  const submittedAt = meta.submittedAt ?? toTime(fields.created_at);
  const consent = /^(yes|true|on|1)$/i.test((fields.consent ?? "").trim());

  return {
    ok: true,
    signup: {
      creator: {
        name,
        creatorName: clip(fields.creator_name, 80) || name.split(" ")[0] || email.split("@")[0],
        email,
        country,
        platforms,
        mainPlatform,
        handles,
        audiences,
        applicationNotes: clip(fields.notes, 2000),
        consent: { contact: consent, at: consent ? submittedAt : null },
        source: {
          kind: meta.kind,
          submissionId: meta.submissionId,
          submittedAt,
          page: clip(fields.page, 300),
          source: clip(fields.source, 120),
          utm: Object.fromEntries(
            (["source", "medium", "campaign", "content", "term"] as const)
              .map((k) => [k, clip(fields[`utm_${k}`], 120)])
              .filter(([, v]) => v),
          ),
        },
      },
      pii: { phone: clip(fields.phone, 40), address },
    },
  };
}

/* ---------------------------------------------------------------------------
   CSV
   --------------------------------------------------------------------------- */

/** RFC 4180-ish: quoted fields, "" escapes, CRLF or LF, a BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/** CSV rows as objects keyed by the header row. */
export function csvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // a leading = + - @ would run as a formula in a spreadsheet
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** A stable id for a CSV row with no submission id, so re-importing the same file is a no-op. */
export async function rowFingerprint(fields: Record<string, string>): Promise<string> {
  const basis = `${(fields.email ?? "").trim().toLowerCase()}|${fields.created_at ?? ""}`;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  return `csv-${Array.from(new Uint8Array(d).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Bulk "mark shipped" CSV: email,carrier,tracking[,url]. Header row optional. */
export function parseTrackingCsv(
  text: string,
): { email: string; carrier: string; tracking: string; url: string }[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => norm(h));
  const hasHeader = head.includes("email");
  const ie = hasHeader ? head.indexOf("email") : 0;
  const ic = hasHeader ? head.indexOf("carrier") : 1;
  const it = hasHeader ? head.findIndex((h) => h === "tracking" || h === "tracking_number") : 2;
  const iu = hasHeader ? head.findIndex((h) => h === "url" || h === "tracking_url") : 3;
  return (hasHeader ? rows.slice(1) : rows).map((r) => ({
    email: (r[ie] ?? "").trim().toLowerCase(),
    carrier: (ic >= 0 ? (r[ic] ?? "") : "").trim(),
    tracking: (it >= 0 ? (r[it] ?? "") : "").trim(),
    url: (iu >= 0 ? (r[iu] ?? "") : "").trim(),
  }));
}

/** Bulk perk codes: email,code. Header row optional. */
export function parseCodesCsv(text: string): { email: string; code: string }[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => norm(h));
  const hasHeader = head.includes("email");
  const ie = hasHeader ? head.indexOf("email") : 0;
  const ic = hasHeader ? head.findIndex((h) => h === "code" || h === "discount_code") : 1;
  return (hasHeader ? rows.slice(1) : rows).map((r) => ({
    email: (r[ie] ?? "").trim().toLowerCase(),
    code: (ic >= 0 ? (r[ic] ?? "") : "").trim(),
  }));
}
