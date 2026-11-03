import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import { isAdminRequest } from "@/lib/ar/auth.server";
import { publicOrigin, rateLimit } from "@/lib/hub/auth.server";
import { mailConfigured } from "@/lib/hub/mail.server";

import {
  GW_COOKIE,
  GW_DEVICE_COOKIE,
  claimTask,
  consumeLink,
  createGwSession,
  endGwSession,
  enter,
  entrantView,
  findEntrant,
  getCampaignBySlug,
  gwAuthConfigured,
  openTask,
  publicCampaign,
  resendLink,
  resolveGwSession,
} from "./giveaway.server";
import { discordGiveawayConfigured } from "./discord.server";
import { foldEmail } from "./model";
import { gwNs, newId, sha256Hex, type GwNamespace } from "./store.server";
import { turnstileSiteKey, verifyTurnstile } from "./turnstile.server";

// What the public campaign pages call: /giveaway/<slug>, its rules, and the
// emailed-link landing /giveaway/auth. Entrants have no password: the emailed
// link confirms the entry and sets the gw_session cookie (60 days).

const MINUTE = 60_000;
const slug = z.string().regex(/^[a-z0-9-]{3,48}$/);

const clientIp = () => getRequest().headers.get("x-nf-client-connection-ip") ?? "unknown";
const origin = (ns: GwNamespace) => publicOrigin(getRequest(), ns);
const secure = (ns: GwNamespace) => new URL(getRequest().url).protocol === "https:" || ns !== "dev";

function deviceId(ns: GwNamespace): string {
  let id = getCookie(GW_DEVICE_COOKIE);
  if (!id || !/^[A-Za-z0-9]{16,40}$/.test(id)) {
    id = newId(16, false);
    setCookie(GW_DEVICE_COOKIE, id, {
      httpOnly: true,
      secure: secure(ns),
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 3600,
    });
  }
  return id;
}

async function signedInEntrant(ns: GwNamespace, campaignId: string) {
  const s = await resolveGwSession(ns, getCookie(GW_COOKIE));
  if (!s) return { session: null, entrant: null };
  return { session: s, entrant: await findEntrant(ns, campaignId, s.email) };
}

/** The campaign page: public campaign data + this browser's entry, if any. */
export const getGiveaway = createServerFn({ method: "GET" })
  .validator(z.object({ slug }))
  .handler(async ({ data }) => {
    const ns = gwNs();
    const c = await getCampaignBySlug(ns, data.slug);
    if (!c) return null;
    // Drafts are visible to the team only (signed in to /admin), as a preview.
    const preview = c.status === "draft";
    if (preview && !(await isAdminRequest(getRequest()))) return null;
    const { session, entrant } = await signedInEntrant(ns, c.id);
    return {
      preview,
      campaign: publicCampaign(c),
      entrant: entrant && entrant.status !== "void" ? entrantView(c, entrant, origin(ns)) : null,
      signedInEmail: session?.email ?? null,
      turnstileSiteKey: turnstileSiteKey(),
      discordReady: discordGiveawayConfigured(),
      emailReady: mailConfigured() || ns !== "prod",
    };
  });

export const enterGiveaway = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug,
      email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
      name: z.string().trim().max(80).default(""),
      country: z.string().regex(/^[A-Z]{2}$/, "Pick your country"),
      region: z
        .string()
        .regex(/^[A-Z0-9]{0,3}$/)
        .default(""),
      ageConfirmed: z.boolean(),
      optIns: z.array(z.string().max(40)).max(10).default([]),
      ref: z
        .string()
        .regex(/^[a-z0-9]{3,20}$/)
        .nullable()
        .optional(),
      turnstileToken: z.string().max(2048).optional().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const ns = gwNs();
    if (!gwAuthConfigured(ns))
      return { ok: false as const, error: "Entries aren't open yet. Please try again later." };
    const c = await getCampaignBySlug(ns, data.slug);
    if (!c || c.status === "draft")
      return { ok: false as const, error: "This giveaway doesn't exist." };
    const ip = clientIp();
    if (!(await verifyTurnstile(data.turnstileToken ?? null, ip)))
      return {
        ok: false as const,
        error: "We couldn't check you're a person. Refresh the page and try again.",
      };
    if (
      !(await rateLimit(ns, "gw-enter-ip", `${c.id}:${ip}`, 12, 60 * MINUTE)) ||
      !(await rateLimit(ns, "gw-enter-email", `${c.id}:${foldEmail(data.email)}`, 5, 15 * MINUTE))
    )
      return { ok: false as const, error: "Too many tries. Wait a few minutes and try again." };
    const session = await resolveGwSession(ns, getCookie(GW_COOKIE));
    const r = await enter(
      ns,
      c,
      { ...data, ref: data.ref ?? null },
      { ip, device: deviceId(ns), origin: origin(ns) },
      session?.emailKey ?? null,
    );
    if (!r.ok) return r;
    return { ok: true as const, status: r.status, devLink: r.devLink, email: data.email };
  });

export const resendGiveawayLink = createServerFn({ method: "POST" })
  .validator(z.object({ slug, email: z.string().trim().toLowerCase().email().max(254) }))
  .handler(async ({ data }) => {
    const ns = gwNs();
    const c = await getCampaignBySlug(ns, data.slug);
    if (!c) return { ok: false as const, error: "This giveaway doesn't exist." };
    if (!(await rateLimit(ns, "gw-resend", `${c.id}:${foldEmail(data.email)}`, 3, 15 * MINUTE)))
      return { ok: false as const, error: "We just sent one. Check your inbox and spam folder." };
    const r = await resendLink(ns, c, data.email, origin(ns));
    return { ok: true as const, devLink: r.devLink };
  });

/** Uses the emailed link (call from the browser, never a loader: mail scanners prefetch links). */
export const consumeGiveawayLink = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().max(100) }))
  .handler(async ({ data }) => {
    const ns = gwNs();
    const r = await consumeLink(ns, data.token.trim());
    if (!r.ok)
      return {
        ok: false as const,
        error:
          r.reason === "expired"
            ? "That link has expired. Enter your email on the giveaway page to get a new one."
            : "That link doesn't work any more. Enter your email on the giveaway page to get a new one.",
      };
    const { cookie, maxAge } = await createGwSession(ns, r.email);
    setCookie(GW_COOKIE, cookie, {
      httpOnly: true,
      secure: secure(ns),
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return { ok: true as const, slug: r.slug };
  });

async function requireEntrant(slugValue: string) {
  const ns = gwNs();
  const c = await getCampaignBySlug(ns, slugValue);
  if (!c || c.status === "draft") return { error: "This giveaway doesn't exist." } as const;
  const { entrant } = await signedInEntrant(ns, c.id);
  if (!entrant || entrant.status === "void")
    return { error: "Enter with your email first." } as const;
  return { ns, c, entrant } as const;
}

export const openGiveawayTask = createServerFn({ method: "POST" })
  .validator(z.object({ slug, taskId: z.string().max(40) }))
  .handler(async ({ data }) => {
    const r = await requireEntrant(data.slug);
    if ("error" in r) return { ok: false as const, error: r.error };
    await openTask(r.ns, r.c, r.entrant.id, data.taskId);
    return { ok: true as const };
  });

export const claimGiveawayTask = createServerFn({ method: "POST" })
  .validator(
    z.object({
      slug,
      taskId: z.string().max(40),
      handle: z.string().max(80).optional(),
      code: z.string().max(60).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const r = await requireEntrant(data.slug);
    if ("error" in r) return { ok: false as const, error: r.error };
    if (!(await rateLimit(r.ns, "gw-claim", `${r.c.id}:${r.entrant.id}`, 40, 10 * MINUTE)))
      return { ok: false as const, error: "Slow down a little and try again in a few minutes." };
    const ipHash = (await sha256Hex(`${r.c.id}:${clientIp()}`)).slice(0, 24);
    return claimTask(r.ns, r.c, r.entrant.id, data, { ipHash });
  });

export const signOutGiveaway = createServerFn({ method: "POST" }).handler(async () => {
  await endGwSession(gwNs(), getCookie(GW_COOKIE));
  deleteCookie(GW_COOKIE, { path: "/" });
  return { ok: true as const };
});
