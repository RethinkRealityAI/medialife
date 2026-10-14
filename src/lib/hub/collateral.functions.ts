import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { COLLATERAL_TAB_IDS, KIT_SCOPE, scopeOwner, type CollateralEntry } from "./collateral";
import {
  deleteCollateral,
  getCollateral,
  getCollateralSettings,
  listCollateral,
  saveCollateral,
  setBuiltinHidden,
} from "./collateral.server";
import { getFile, listFiles } from "./data.server";
import { removeLibraryFile } from "./files.server";
import { isImage } from "./model";
import { partnerIdOk } from "./partners";
import { getPartner, listPartners } from "./partners.server";
import { requireHubAdmin, requirePartner } from "./session.server";
import { newId, type HubNamespace } from "./store.server";

// Managed collateral. The MEDIALIFE team adds pieces for every partner (scope
// "kit") or one partner, and hides built-in pieces per scope; a partner team
// adds and edits its own. Files are uploaded first (to the scope's library)
// and then attached here.

const fileId = z
  .string()
  .regex(/^[A-Za-z0-9]{6,40}$/)
  .nullable();

const entryInput = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9]{6,40}$/)
      .optional(),
    tab: z.enum(COLLATERAL_TAB_IDS as [string, ...string[]]),
    videoCategory: z.enum(["standee", "product", "fans", "creators"]).optional(),
    title: z.string().trim().min(2, "Give it a title").max(80),
    what: z.string().trim().max(240).default(""),
    when: z.string().trim().max(200).default(""),
    channels: z.array(z.string().trim().min(1).max(24)).max(6).default([]),
    fileId,
    link: z
      .string()
      .trim()
      .max(500)
      .url("A full link, starting with https://")
      .refine((u) => /^https?:\/\//i.test(u), "A full link, starting with https://")
      .nullable(),
    previewFileId: fileId,
  })
  .refine((d) => !!d.fileId !== !!d.link, "Add a file or a link");

type EntryInput = z.infer<typeof entryInput>;

const scopeSchema = z.string().refine((s) => s === KIT_SCOPE || partnerIdOk(s), "Unknown scope");

/** Checks the files belong to the scope's library and are finished uploading. */
async function checkFiles(
  ns: HubNamespace,
  scope: string,
  d: EntryInput,
  prev: CollateralEntry | null,
  byPartner: boolean,
) {
  const owner = scopeOwner(scope);
  // A partner attaches only files its own team uploaded (removing a piece
  // deletes its files, so it mustn't reach files MEDIALIFE put there).
  const kept = new Set([prev?.fileId, prev?.previewFileId]);
  const theirs = (f: { uploadedBy: string; id: string }) =>
    !byPartner || f.uploadedBy === "creator" || kept.has(f.id);
  if (d.fileId) {
    const f = await getFile(ns, owner, d.fileId);
    if (!f || !f.complete || !theirs(f)) return "That file didn't finish uploading. Try again.";
  }
  if (d.previewFileId) {
    const p = await getFile(ns, owner, d.previewFileId);
    if (!p || !p.complete || !isImage(p.mime) || !theirs(p)) return "The cover has to be an image.";
  }
  return null;
}

function build(
  scope: string,
  d: EntryInput,
  addedBy: CollateralEntry["addedBy"],
  prev: CollateralEntry | null,
): CollateralEntry {
  const now = Date.now();
  return {
    id: prev?.id ?? newId(12),
    scope,
    tab: d.tab as CollateralEntry["tab"],
    ...(d.tab === "videos" ? { videoCategory: d.videoCategory ?? "product" } : {}),
    title: d.title,
    what: d.what,
    when: d.when,
    channels: [...new Set(d.channels)],
    fileId: d.fileId,
    link: d.link,
    previewFileId: d.previewFileId,
    addedBy: prev?.addedBy ?? addedBy,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  };
}

/** Files an edit no longer uses, so they don't linger in the library. */
async function dropReplaced(ns: HubNamespace, prev: CollateralEntry | null, next: CollateralEntry) {
  if (!prev) return;
  const keep = new Set([next.fileId, next.previewFileId]);
  for (const id of [prev.fileId, prev.previewFileId]) {
    if (id && !keep.has(id)) await removeLibraryFile(ns, scopeOwner(prev.scope), id);
  }
}

/* ---------------------------------------------------------------------------
   Partner side
   --------------------------------------------------------------------------- */

/** A partner adds or edits its own piece. Members edit what they added; admins edit any. */
export const savePartnerCollateral = createServerFn({ method: "POST" })
  .validator(entryInput)
  .handler(async ({ data }) => {
    const { ns, user, partner, role } = await requirePartner();
    const prev = data.id ? await getCollateral(ns, partner.id, data.id) : null;
    if (data.id && !prev) return { ok: false as const, error: "That piece is gone." };
    if (prev?.addedBy.kind === "medialife") {
      return {
        ok: false as const,
        error: "Pieces from MEDIALIFE can only be changed by MEDIALIFE.",
      };
    }
    if (
      prev &&
      role !== "admin" &&
      !(prev.addedBy.kind === "partner" && prev.addedBy.userId === user.id)
    ) {
      return { ok: false as const, error: "Only an admin on your team can edit this one." };
    }
    const bad = await checkFiles(ns, partner.id, data, prev, true);
    if (bad) return { ok: false as const, error: bad };
    const next = build(
      partner.id,
      data,
      { kind: "partner", userId: user.id, name: user.name || user.email },
      prev,
    );
    await saveCollateral(ns, next);
    await dropReplaced(ns, prev, next);
    return { ok: true as const, entry: next };
  });

export const deletePartnerCollateral = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().regex(/^[A-Za-z0-9]{6,40}$/) }))
  .handler(async ({ data }) => {
    const { ns, user, partner, role } = await requirePartner();
    const e = await getCollateral(ns, partner.id, data.id);
    if (!e) return { ok: true as const };
    if (role !== "admin" && !(e.addedBy.kind === "partner" && e.addedBy.userId === user.id)) {
      return { ok: false as const, error: "Only an admin on your team can remove this one." };
    }
    if (e.addedBy.kind === "medialife") {
      return {
        ok: false as const,
        error: "Pieces from MEDIALIFE can only be removed by MEDIALIFE.",
      };
    }
    await deleteCollateral(ns, e);
    return { ok: true as const };
  });

/* ---------------------------------------------------------------------------
   Admin side
   --------------------------------------------------------------------------- */

export const adminGetCollateral = createServerFn({ method: "GET" })
  .validator(z.object({ scope: scopeSchema }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const partners = (await listPartners(ns)).map((p) => ({ id: p.id, name: p.name, kit: p.kit }));
    const partner = data.scope === KIT_SCOPE ? null : await getPartner(ns, data.scope);
    if (data.scope !== KIT_SCOPE && !partner) return null;
    const isKit = data.scope === KIT_SCOPE;
    const [entries, settings, files, kitEntries, kitSettings, kitFiles] = await Promise.all([
      listCollateral(ns, data.scope),
      getCollateralSettings(ns, data.scope),
      listFiles(ns, scopeOwner(data.scope)),
      isKit ? Promise.resolve([]) : listCollateral(ns, KIT_SCOPE),
      isKit ? Promise.resolve(null) : getCollateralSettings(ns, KIT_SCOPE),
      isKit ? Promise.resolve([]) : listFiles(ns, scopeOwner(KIT_SCOPE)),
    ]);
    return {
      scope: data.scope,
      partner: partner ? { id: partner.id, name: partner.name, kit: partner.kit } : null,
      partners,
      entries,
      hidden: settings.hidden,
      kitEntries,
      kitHidden: kitSettings?.hidden ?? [],
      files: [...files, ...kitFiles],
    };
  });

export const adminSaveCollateral = createServerFn({ method: "POST" })
  .validator(z.object({ scope: scopeSchema, entry: entryInput }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    if (data.scope !== KIT_SCOPE && !(await getPartner(ns, data.scope)))
      return { ok: false as const, error: "That partner is gone." };
    const prev = data.entry.id ? await getCollateral(ns, data.scope, data.entry.id) : null;
    if (data.entry.id && !prev) return { ok: false as const, error: "That piece is gone." };
    const bad = await checkFiles(ns, data.scope, data.entry, prev, false);
    if (bad) return { ok: false as const, error: bad };
    const next = build(data.scope, data.entry, { kind: "medialife" }, prev);
    await saveCollateral(ns, next);
    await dropReplaced(ns, prev, next);
    return { ok: true as const, entry: next };
  });

export const adminDeleteCollateral = createServerFn({ method: "POST" })
  .validator(z.object({ scope: scopeSchema, id: z.string().regex(/^[A-Za-z0-9]{6,40}$/) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const e = await getCollateral(ns, data.scope, data.id);
    if (e) await deleteCollateral(ns, e);
    return { ok: true as const };
  });

export const adminSetBuiltinHidden = createServerFn({ method: "POST" })
  .validator(
    z.object({
      scope: scopeSchema,
      id: z.string().regex(/^[a-z0-9-]{2,60}$/),
      hidden: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const s = await setBuiltinHidden(ns, data.scope, data.id, data.hidden);
    return { ok: true as const, hidden: s.hidden };
  });
