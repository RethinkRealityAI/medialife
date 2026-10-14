import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  CURRENT,
  agreementText,
  nameMatches,
  signatureStatus,
  termsFor,
  type Signature,
} from "./agreements";
import { getUser } from "./auth.server";
import { getCreator, logActivity, saveCreator } from "./data.server";
import { listSignatures, saveSignature } from "./partners.server";
import { requireCreator, requireHubAdmin } from "./session.server";
import { newId, sha256Hex } from "./store.server";

// Signing the program agreement in the Creator Hub (step 2 of the journey).
// The creator reads the agreement made out to them, types their legal name and
// confirms; we keep what they signed (a fingerprint of the exact text, the
// terms, when, from where) and never edit it afterwards.

/** The creator's agreements: what to sign now and what they've signed. */
export const getAgreements = createServerFn({ method: "GET" }).handler(async () => {
  const { ns, creator } = await requireCreator();
  const signatures = await listSignatures(ns, creator.id);
  const status = signatureStatus(signatures);
  const terms = termsFor(creator);
  return {
    eligible: creator.status === "approved",
    template: {
      id: CURRENT.id,
      version: CURRENT.version,
      title: CURRENT.title,
      summary: CURRENT.summary,
      sections: CURRENT.sections(terms),
    },
    terms,
    ...status,
    signatures: signatures.map((s) => ({
      id: s.id,
      title: s.title,
      version: s.version,
      signedName: s.signedName,
      signedAt: s.signedAt,
      textHash: s.textHash,
    })),
  };
});

/** A signed copy, exactly as signed (rebuilt from the stored terms and version). */
export const getSignedCopy = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().max(40), creatorId: z.string().max(60).optional() }))
  .handler(async ({ data }) => {
    let ns;
    let creatorId: string;
    if (data.creatorId) {
      ns = await requireHubAdmin();
      creatorId = data.creatorId;
    } else {
      const s = await requireCreator();
      ns = s.ns;
      creatorId = s.creator.id;
    }
    const sig = (await listSignatures(ns, creatorId)).find((s) => s.id === data.id);
    if (!sig) return null;
    const tpl = sig.version === CURRENT.version ? CURRENT : null;
    return {
      signature: sig,
      sections: tpl ? tpl.sections(sig.terms) : null,
      title: sig.title,
    };
  });

export const signAgreement = createServerFn({ method: "POST" })
  .validator(
    z.object({
      version: z.string().max(40),
      legalName: z.string().trim().min(2, "Type your full legal name").max(120),
      signedName: z.string().trim().min(2, "Type your full legal name to sign").max(120),
      agree: z.literal(true, { errorMap: () => ({ message: "Tick the box to confirm" }) }),
      guardian: z.string().trim().max(120).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { ns, user, creator } = await requireCreator();
    if (creator.status !== "approved")
      return {
        ok: false as const,
        error: "Your agreement opens once your application is approved.",
      };
    if (data.version !== CURRENT.version)
      return {
        ok: false as const,
        error: "The agreement was just updated. Reload the page to read the new version.",
      };
    if (!nameMatches(data.signedName, data.legalName))
      return {
        ok: false as const,
        error: "Type your signature exactly as your legal name.",
        field: "signedName" as const,
      };
    const existing = await listSignatures(ns, creator.id);
    if (signatureStatus(existing).signedCurrent)
      return { ok: false as const, error: "You've already signed this agreement." };

    // Keep the legal name on the profile, so the next version is made out to it too.
    let c = creator;
    if (creator.profile.legalName.trim() !== data.legalName) {
      c = await saveCreator(ns, {
        ...creator,
        profile: { ...creator.profile, legalName: data.legalName },
      });
    }
    const terms = termsFor(c);
    const request = getRequest();
    const fresh = await getUser(ns, user.id);
    const sig: Signature = {
      id: newId(8),
      creatorId: c.id,
      agreementId: CURRENT.id,
      version: CURRENT.version,
      title: CURRENT.title,
      signedName: data.signedName.replace(/\s+/g, " "),
      legalName: terms.legalName,
      email: fresh?.email ?? user.email,
      terms,
      textHash: await sha256Hex(agreementText(CURRENT, terms)),
      signedAt: Date.now(),
      ip: request.headers.get("x-nf-client-connection-ip") ?? "unknown",
      userAgent: (request.headers.get("user-agent") ?? "").slice(0, 300),
      guardian: data.guardian?.trim() || null,
    };
    await saveSignature(ns, sig);
    await logActivity(ns, c.id, {
      kind: "account",
      title: "Agreement signed",
      body: `${CURRENT.title}, version ${CURRENT.version}.`,
    });
    return { ok: true as const, id: sig.id };
  });

/** For the admin's creator page. */
export const adminGetSignatures = createServerFn({ method: "GET" })
  .validator(z.object({ creatorId: z.string().max(60) }))
  .handler(async ({ data }) => {
    const ns = await requireHubAdmin();
    const creator = await getCreator(ns, data.creatorId);
    if (!creator) return null;
    const signatures = await listSignatures(ns, creator.id);
    return { ...signatureStatus(signatures), current: CURRENT.version, signatures };
  });
