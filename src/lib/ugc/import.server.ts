import process from "node:process";

import { findCreatorByEmail } from "./auth.server";
import {
  claimCreatorEmail,
  logActivity,
  saveCreator,
  savePii,
  type ImportRef,
} from "./data.server";
import {
  csvObjects,
  mapSignup,
  normaliseFields,
  rowFingerprint,
  type MappedSignup,
} from "./import";
import { UGC, type UgcCreator, type UgcSource, type UgcStatus } from "./model";
import { UKEYS, newId, ugcStore, type UgcNamespace } from "./store.server";

// Bringing sign-ups in: the admin "Sync from Netlify Forms" button (pulls the
// landing page's form submissions through the Netlify API), a CSV of a Netlify
// Forms export as the fallback, and adding one creator by hand. All three go
// through importSignup(), which is idempotent by submission id (Netlify's, or a
// fingerprint of the CSV row) and never creates a second creator for an email.

export type ImportRowResult = {
  submissionId: string | null;
  email: string;
  result: "created" | "duplicate-submission" | "duplicate-email" | "deleted-before" | "skipped";
  creatorId: string | null;
  reason?: string;
};

export type ImportSummary = {
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
  rows: ImportRowResult[];
};

const summarise = (rows: ImportRowResult[]): ImportSummary => ({
  total: rows.length,
  created: rows.filter((r) => r.result === "created").length,
  duplicates: rows.filter((r) => r.result.startsWith("duplicate") || r.result === "deleted-before")
    .length,
  skipped: rows.filter((r) => r.result === "skipped").length,
  rows,
});

export function newCreatorFrom(
  id: string,
  s: MappedSignup["creator"],
  status: UgcStatus = "applied",
  now = Date.now(),
): UgcCreator {
  return {
    id,
    status,
    statusChangedAt: now,
    campaignIds: [],
    name: s.name,
    creatorName: s.creatorName,
    email: s.email,
    country: s.country,
    platforms: s.platforms,
    mainPlatform: s.mainPlatform,
    handles: s.handles,
    audiences: s.audiences,
    applicationNotes: s.applicationNotes,
    consent: s.consent,
    source: s.source,
    ageBand: null,
    licence: null,
    hubUserId: null,
    deletionRequest: null,
    createdAt: s.source.submittedAt ?? now,
    updatedAt: now,
    approvedAt: status === "applied" ? null : now,
    joinedAt: null,
    lastLoginAt: null,
  };
}

/** One sign-up in. Safe to call again with the same submission id. */
export async function importSignup(
  ns: UgcNamespace,
  signup: MappedSignup,
  opts: { status?: UgcStatus; dryRun?: boolean } = {},
): Promise<ImportRowResult> {
  const store = await ugcStore(ns);
  const sid = signup.creator.source.submissionId;
  const email = signup.creator.email;
  if (sid) {
    const seen = await store.getJSON<ImportRef>(UKEYS.imported(sid));
    if (seen)
      return {
        submissionId: sid,
        email,
        result: seen.creatorId ? "duplicate-submission" : "deleted-before",
        creatorId: seen.creatorId,
      };
  }
  if (opts.dryRun) {
    const existing = await findCreatorByEmail(ns, email);
    return {
      submissionId: sid,
      email,
      result: existing ? "duplicate-email" : "created",
      creatorId: existing?.id ?? null,
    };
  }
  const id = newId();
  const holder = await claimCreatorEmail(ns, email, id);
  if (holder !== id) {
    if (sid) await store.setJSON(UKEYS.imported(sid), { creatorId: holder, at: Date.now() });
    await logActivity(ns, holder, {
      kind: "account",
      title: "Signed up again",
      body: `Another sign-up arrived for ${email} (${signup.creator.source.kind}); kept the existing record.`,
    });
    return { submissionId: sid, email, result: "duplicate-email", creatorId: holder };
  }
  const creator = newCreatorFrom(id, signup.creator, opts.status ?? "applied");
  await saveCreator(ns, creator);
  await savePii(ns, {
    creatorId: id,
    phone: signup.pii.phone,
    address: signup.pii.address,
    purgeAfter: null,
    purgedAt: null,
    updatedAt: 0,
  });
  if (sid) await store.setJSON(UKEYS.imported(sid), { creatorId: id, at: Date.now() });
  await logActivity(ns, id, {
    kind: "account",
    title: "Applied",
    body:
      creator.source.kind === "manual"
        ? "Added by the MEDIALIFE team."
        : `Signed up through the landing page (${creator.source.kind}).`,
    at: creator.createdAt,
  });
  return { submissionId: sid, email, result: "created", creatorId: id };
}

/* ---------------------------------------------------------------------------
   Netlify Forms
   --------------------------------------------------------------------------- */

export type NetlifyConfig =
  | { configured: true; token: string; siteId: string | null; formId: string | null }
  | { configured: false; missing: string[] };

export function netlifyConfig(): NetlifyConfig {
  const token = process.env.NETLIFY_API_TOKEN?.trim();
  // Netlify sets SITE_ID on builds and functions; NETLIFY_SITE_ID overrides it.
  const siteId = (process.env.NETLIFY_SITE_ID || process.env.SITE_ID || "").trim() || null;
  const formId = process.env.UGC_NETLIFY_FORM_ID?.trim() || null;
  const missing: string[] = [];
  if (!token) missing.push("NETLIFY_API_TOKEN");
  if (!siteId && !formId) missing.push("NETLIFY_SITE_ID");
  return token && missing.length === 0
    ? { configured: true, token, siteId, formId }
    : { configured: false, missing };
}

export const NETLIFY_SETUP_HELP = [
  "In Netlify: User settings → Applications → Personal access tokens → New access token.",
  "In the site's Environment variables, add NETLIFY_API_TOKEN with that token (scope: Functions).",
  "NETLIFY_SITE_ID is the site's API ID (Site configuration → General → Site details). Netlify also provides SITE_ID automatically on deploys.",
  `Optional: UGC_NETLIFY_FORM_ID to skip looking the form up by name ("${UGC.formName}").`,
  "Redeploy so functions pick up the new variables.",
];

type NetlifySubmission = {
  id: string;
  created_at?: string;
  data?: Record<string, unknown>;
  human_fields?: Record<string, unknown>;
};

const API = "https://api.netlify.com/api/v1";

async function netlifyFetch(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (!res.ok && res.status !== 404)
    throw new Error(
      `Netlify API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`,
    );
  return res;
}

export type SyncResult =
  | { configured: false; missing: string[]; help: string[] }
  | ({
      configured: true;
      ok: true;
      formId: string;
      deleted: number;
      deleteErrors: number;
    } & ImportSummary)
  | { configured: true; ok: false; error: string };

export async function syncNetlifyForms(
  ns: UgcNamespace,
  opts: { deleteAfterImport?: boolean; dryRun?: boolean } = {},
): Promise<SyncResult> {
  const cfg = netlifyConfig();
  if (!cfg.configured) return { configured: false, missing: cfg.missing, help: NETLIFY_SETUP_HELP };
  try {
    let formId = cfg.formId;
    if (!formId) {
      const res = await netlifyFetch(cfg.token, `/sites/${cfg.siteId}/forms`);
      if (res.status === 404) return { configured: true, ok: false, error: "Site not found." };
      const forms = (await res.json()) as { id: string; name: string }[];
      formId = forms.find((f) => f.name === UGC.formName)?.id ?? null;
      if (!formId)
        return {
          configured: true,
          ok: false,
          error: `No form named "${UGC.formName}" on this site yet. It appears after the first deploy that includes public/__forms.html, or the first submission.`,
        };
    }
    const subs: NetlifySubmission[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await netlifyFetch(
        cfg.token,
        `/forms/${formId}/submissions?per_page=100&page=${page}`,
      );
      if (res.status === 404) return { configured: true, ok: false, error: "Form not found." };
      const batch = (await res.json()) as NetlifySubmission[];
      subs.push(...batch);
      if (batch.length < 100) break;
    }
    const rows: ImportRowResult[] = [];
    let deleted = 0;
    let deleteErrors = 0;
    // oldest first, so a creator's earliest sign-up wins
    subs.sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? ""));
    for (const s of subs) {
      const fields = normaliseFields({ ...(s.data ?? {}) });
      const mapped = mapSignup(fields, {
        kind: "netlify-form",
        submissionId: s.id,
        submittedAt: s.created_at ? Date.parse(s.created_at) : null,
      });
      if (!mapped.ok) {
        rows.push({
          submissionId: s.id,
          email: fields.email ?? "",
          result: "skipped",
          creatorId: null,
          reason: mapped.reason,
        });
        continue;
      }
      const r = await importSignup(ns, mapped.signup, { dryRun: opts.dryRun });
      rows.push(r);
      if (opts.deleteAfterImport && !opts.dryRun && r.result !== "skipped") {
        try {
          const del = await netlifyFetch(cfg.token, `/submissions/${s.id}`, { method: "DELETE" });
          if (del.ok || del.status === 404) deleted++;
        } catch (err) {
          deleteErrors++;
          console.error("[ugc-hub] couldn't delete Netlify submission", s.id, err);
        }
      }
    }
    const summary = summarise(rows);
    if (!opts.dryRun) await recordImport(ns, "netlify-form", summary);
    return { configured: true, ok: true, formId, deleted, deleteErrors, ...summary };
  } catch (err) {
    console.error("[ugc-hub] Netlify sync failed", err);
    return {
      configured: true,
      ok: false,
      error: err instanceof Error ? err.message : "Netlify sync failed",
    };
  }
}

/* ---------------------------------------------------------------------------
   CSV and manual
   --------------------------------------------------------------------------- */

export async function importCsv(
  ns: UgcNamespace,
  csv: string,
  opts: { dryRun?: boolean } = {},
): Promise<ImportSummary> {
  const rows: ImportRowResult[] = [];
  for (const raw of csvObjects(csv)) {
    const fields = normaliseFields(raw);
    const sid = fields.id?.trim() || (await rowFingerprint(fields));
    const mapped = mapSignup(fields, { kind: "csv", submissionId: sid });
    if (!mapped.ok) {
      rows.push({
        submissionId: sid,
        email: fields.email ?? "",
        result: "skipped",
        creatorId: null,
        reason: mapped.reason,
      });
      continue;
    }
    rows.push(await importSignup(ns, mapped.signup, { dryRun: opts.dryRun }));
  }
  const summary = summarise(rows);
  if (!opts.dryRun) await recordImport(ns, "csv", summary);
  return summary;
}

export type ManualCreatorInput = {
  name: string;
  creatorName: string;
  email: string;
  country?: string;
  handles?: Partial<Record<string, string>>;
  phone?: string;
  address?: MappedSignup["pii"]["address"];
  notes?: string;
  status?: "applied" | "approved";
};

/** Builds a MappedSignup from the admin's "Add creator" form (same mapping as the landing page). */
export function manualSignup(i: ManualCreatorInput): MappedSignup | { error: string } {
  const fields: Record<string, string> = {
    "contact-name": i.name,
    creator_name: i.creatorName,
    email: i.email,
    country: i.country ?? "",
    phone: i.phone ?? "",
    notes: i.notes ?? "",
    consent: "yes",
  };
  for (const [p, h] of Object.entries(i.handles ?? {})) if (h) fields[`${p}_handle`] = h;
  if (i.address) {
    fields.address_line1 = i.address.line1;
    fields.address_line2 = i.address.line2;
    fields.city = i.address.city;
    fields.region = i.address.region;
    fields.postal_code = i.address.postalCode;
    fields.address_country = i.address.country;
  }
  const m = mapSignup(fields, { kind: "manual", submissionId: null, submittedAt: Date.now() });
  if (!m.ok) return { error: m.reason };
  if (m.signup.pii.address && i.address?.name) m.signup.pii.address.name = i.address.name;
  return m.signup;
}

export type ImportLogEntry = {
  at: number;
  kind: UgcSource["kind"];
  total: number;
  created: number;
  duplicates: number;
  skipped: number;
};

async function recordImport(ns: UgcNamespace, kind: UgcSource["kind"], s: ImportSummary) {
  await (
    await ugcStore(ns)
  ).update<ImportLogEntry[]>(UKEYS.importLog(), (cur) =>
    [
      {
        at: Date.now(),
        kind,
        total: s.total,
        created: s.created,
        duplicates: s.duplicates,
        skipped: s.skipped,
      },
      ...(cur ?? []),
    ].slice(0, 50),
  );
}

export async function importLog(ns: UgcNamespace) {
  return (await (await ugcStore(ns)).getJSON<ImportLogEntry[]>(UKEYS.importLog())) ?? [];
}
