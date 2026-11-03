import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { rateLimit } from "@/lib/hub/auth.server";

import { UGC_COOKIE, consumeUgcToken, endUgcSession, ugcAuthConfigured } from "./auth.server";
import { sendSignInLink } from "./creator.server";
import { logActivity, saveCreator } from "./data.server";
import { UGC_ROUTES, UGC_STATUS_LABELS, type UgcStatus } from "./model";
import { clearUgcCookie, currentUgc, linkOrigin, startUgcSession } from "./session.server";
import { ugcNs } from "./store.server";

// Sign-in for UGC creators: magic links only. The pages under /ugc-hub call
// these; the layout route's beforeLoad calls getUgcSession.

const MINUTE = 60_000;

/** Who is signed in. Safe to call signed out (route guards use it). */
export const getUgcSession = createServerFn({ method: "GET" }).handler(async () => {
  const s = await currentUgc();
  if (!s) return { signedIn: false as const, configured: ugcAuthConfigured(ugcNs()) };
  const c = s.creator;
  return {
    signedIn: true as const,
    configured: true,
    creator: {
      id: c.id,
      name: c.name,
      creatorName: c.creatorName,
      email: c.email,
      status: c.status as UgcStatus,
      statusLabel: UGC_STATUS_LABELS[c.status],
    },
  };
});

/**
 * Emails a sign-in link. Always answers ok (so the page can't be used to find
 * out who is in the program), except for rate limits. Without RESEND_API_KEY,
 * on localhost and previews, `devLink` is the link that would have been sent.
 */
export const requestUgcSignInLink = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
      next: z.string().max(300).optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = ugcNs();
    if (!ugcAuthConfigured(ns))
      return { ok: false as const, error: "Sign-in isn't available yet. Please try again later." };
    const ip = getRequest().headers.get("x-nf-client-connection-ip") ?? "unknown";
    if (
      !(await rateLimit(ns, "ugc-link-ip", ip, 30, 60 * MINUTE)) ||
      !(await rateLimit(ns, "ugc-link-email", data.email, 5, 15 * MINUTE))
    )
      return { ok: false as const, error: "Too many requests. Try again in a few minutes." };
    const r = await sendSignInLink(ns, linkOrigin(ns), data.email, data.next);
    return { ok: true as const, email: data.email, devLink: r.devLink ?? null };
  });

/**
 * Signs in with the token from an emailed link (sign-in or join) and sets the
 * ugc_session cookie. Call it from the browser (a click or an effect on
 * /ugc-hub/auth), never from a route loader: an email scanner that prefetches
 * the link must not use it up.
 */
export const consumeUgcLink = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().max(100) }))
  .handler(async ({ data }) => {
    const ns = ugcNs();
    const r = await consumeUgcToken(ns, data.token.trim());
    if (!r.ok)
      return {
        ok: false as const,
        reason: r.reason,
        error:
          r.reason === "expired"
            ? "That link has expired. Ask for a new one below."
            : r.reason === "not-allowed"
              ? "Your account isn't active right now. Email creators@medialife.ai if you think this is a mistake."
              : "That link doesn't work any more. Ask for a new one below.",
      };
    const now = Date.now();
    const first = r.creator.joinedAt == null;
    await saveCreator(ns, { ...r.creator, joinedAt: r.creator.joinedAt ?? now, lastLoginAt: now });
    if (first)
      await logActivity(ns, r.creator.id, {
        kind: "account",
        actor: "creator",
        title: "You joined the UGC Hub",
      });
    await startUgcSession(ns, r.creator.id);
    return { ok: true as const, next: r.next ?? UGC_ROUTES.home, firstVisit: first };
  });

export const signOutUgc = createServerFn({ method: "POST" }).handler(async () => {
  await endUgcSession(ugcNs(), getCookie(UGC_COOKIE));
  clearUgcCookie();
  return { ok: true as const };
});
