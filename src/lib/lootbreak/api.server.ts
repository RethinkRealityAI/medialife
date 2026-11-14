import type { ArNamespace } from "@/lib/ar/store.server";
import { clientIp } from "@/lib/bobo/events.server";
import { authConfigured, publicOrigin, rateLimit } from "@/lib/hub/auth.server";
import { sendNotice } from "@/lib/hub/mail.server";

import {
  EMAIL_RE,
  DISCORD_RE,
  HANDLE_RE,
  LADDER,
  MAX_PLAUSIBLE_SCORE,
  MAX_POINTS_PER_SEC,
  MAX_TICKET_AGE_MS,
  MIN_ROUND_MS,
  normalizeEmail,
  normalizeDiscord,
  normalizeHandle,
  platformOf,
  publicCode,
  publicConfig,
  questReady,
  rewardFor,
  type ClaimResult,
  type LootCode,
} from "./model";
import {
  KEYS,
  emailHash,
  getCode,
  getSettings,
  isExpired,
  issueTicket,
  lootStore,
  newCode,
  putCode,
  readTicket,
  type Player,
  type TicketUse,
} from "./store.server";

// The public LOOT BREAK rewards API. The game runs on Mattercraft's domain, so
// every answer allows any origin and nothing relies on cookies.
//
//   GET  /api/lootbreak/config   rewards, bonus quest and shop link for the game
//   POST /api/lootbreak/round    a signed ticket, asked for when a round starts
//   POST /api/lootbreak/claim    { kind: "score", ticket, tier, score, email, consent }
//                                { kind: "quest", ticket, email, handle, consent, steps }

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};
export const preflight = () => new Response(null, { status: 204, headers: CORS });

const json = (body: unknown, status = 200, cache = "no-store") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache, ...CORS },
  });

const fail = (
  error: Extract<ClaimResult, { ok: false }>["error"],
  message: string,
  status: number,
  extra: Partial<Extract<ClaimResult, { ok: false }>> = {},
) => json({ ok: false, error, message, ...extra } satisfies ClaimResult, status);

export async function handleConfig(ns: ArNamespace): Promise<Response> {
  const config = publicConfig(await getSettings(ns));
  // Without a signing secret no round can be claimed, so the game hides rewards.
  if (!authConfigured(ns)) config.active = false;
  return json(config, 200, "public, max-age=60");
}

export async function handleRound(ns: ArNamespace, request: Request): Promise<Response> {
  if (!authConfigured(ns)) return json({ ok: false, error: "inactive" }, 503);
  // Generous: a booth or school shares one IP across many phones.
  if (!(await rateLimit(ns, "lootbreak-round", clientIp(request), 400, 60 * 60 * 1000)))
    return json({ ok: false, error: "rate-limited" }, 429);
  return json({ ok: true, ticket: await issueTicket(ns) });
}

type ClaimBody = {
  kind?: unknown;
  ticket?: unknown;
  tier?: unknown;
  score?: unknown;
  email?: unknown;
  consent?: unknown;
  handle?: unknown;
  discord?: unknown;
  steps?: unknown;
};

export async function handleClaim(ns: ArNamespace, request: Request): Promise<Response> {
  let body: ClaimBody;
  try {
    body = (await request.json()) as ClaimBody;
  } catch {
    return fail("bad-request", "Something went wrong. Try again.", 400);
  }
  const kind = body.kind === "quest" ? "quest" : "score";
  const email = normalizeEmail(String(body.email ?? ""));
  if (!EMAIL_RE.test(email) || email.length > 200)
    return fail("bad-request", "Check your email address.", 400);
  const consent = body.consent === true;

  const settings = await getSettings(ns);
  if (!settings.active) return fail("inactive", "Rewards are paused right now.", 403);

  const ip = clientIp(request);
  if (
    !(await rateLimit(ns, "lootbreak-claim-ip", ip, 60, 60 * 60 * 1000)) ||
    !(await rateLimit(ns, "lootbreak-claim-email", email, 20, 60 * 60 * 1000))
  )
    return fail("rate-limited", "Too many tries. Give it a few minutes.", 429);

  if (!authConfigured(ns)) return fail("inactive", "Rewards are paused right now.", 503);
  const ticket = await readTicket(ns, body.ticket);
  if (!ticket)
    return fail("bad-ticket", "We couldn't check this round. Play another one to claim.", 400);
  const age = Date.now() - ticket.at;
  if (age > MAX_TICKET_AGE_MS)
    return fail("bad-ticket", "This round is too old to claim. Play another one.", 400);

  const store = await lootStore(ns);
  const hash = await emailHash(email);
  const player = (await store.getJSON<Player>(KEYS.player(hash))) ?? { updatedAt: "" };
  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.expiryDays * 86400_000).toISOString();

  /* ── bonus quest ── */
  if (kind === "quest") {
    if (!questReady(settings)) return fail("inactive", "The bonus quest isn't on right now.", 403);
    const platforms = new Set(settings.follow.map((f) => platformOf(f.url)));
    const handle = String(body.handle ?? "").trim();
    const discord = String(body.discord ?? "").trim();
    if (platforms.has("instagram") && !HANDLE_RE.test(handle))
      return fail("bad-request", "Add your Instagram handle, like @yourname.", 400);
    if (platforms.has("discord") && !DISCORD_RE.test(discord))
      return fail("bad-request", "Add your Discord username.", 400);
    const steps = Array.isArray(body.steps) ? body.steps : [];
    if (steps.length < settings.follow.length + 1 || !steps.every((s) => s === true))
      return fail("bad-request", "Finish every step first.", 400);
    if (player.questCode) {
      const have = await getCode(ns, player.questCode);
      if (have)
        return json({
          ok: true,
          code: publicCode(have),
          existing: true,
          message: "You already have your bonus code.",
        } satisfies ClaimResult);
    }
    const used = (await store.getJSON<TicketUse>(KEYS.ticket(ticket.id))) ?? {};
    if (used.quest) return fail("used-ticket", "Play another round to claim.", 409);
    const c: LootCode = {
      code: await newCode(ns, settings.prefix, settings.questPercent),
      kind: "quest",
      percent: settings.questPercent,
      email,
      emailHash: hash,
      consent,
      status: "active",
      createdAt: now.toISOString(),
      expiresAt,
      handle: HANDLE_RE.test(handle) ? normalizeHandle(handle) : undefined,
      discord: DISCORD_RE.test(discord) ? normalizeDiscord(discord) : undefined,
      verified: false,
    };
    await putCode(ns, c);
    await store.setJSON(KEYS.ticket(ticket.id), { ...used, quest: c.code } satisfies TicketUse);
    await store.setJSON(KEYS.player(hash), {
      ...player,
      questCode: c.code,
      updatedAt: c.createdAt,
    });
    void mailCode(ns, request, c);
    return json({
      ok: true,
      code: publicCode(c),
      message: "Bonus unlocked. We check your follows and story before your order ships.",
    } satisfies ClaimResult);
  }

  /* ── score reward ── */
  const tier = Math.round(Number(body.tier));
  const score = Math.round(Number(body.score));
  if (!Number.isFinite(tier) || tier < 0 || tier >= LADDER.length || !Number.isFinite(score))
    return fail("bad-request", "Something went wrong. Try again.", 400);
  // The rarity must match the score (it can sit lower: a boss that escaped drops one).
  if (score > MAX_PLAUSIBLE_SCORE || score < LADDER[tier].at)
    return fail("no-reward", "That score doesn't add up. Play another round.", 400);
  // No one scores faster than MAX_POINTS_PER_SEC, so a big score needs a long enough round.
  if (age < Math.max(MIN_ROUND_MS, (score / MAX_POINTS_PER_SEC) * 1000))
    return fail("too-fast", "That round was too quick to count.", 400);
  const reward = rewardFor(settings.rewards, tier);
  if (!reward)
    return fail("no-reward", "This rarity doesn't unlock a code yet. Keep raiding!", 400);

  const used = (await store.getJSON<TicketUse>(KEYS.ticket(ticket.id))) ?? {};
  if (used.score) return fail("used-ticket", "This round's code was already claimed.", 409);

  // One score code per email: same or better already → keep it; better now → upgrade.
  let previous: LootCode | null = null;
  if (player.scoreCode) {
    previous = await getCode(ns, player.scoreCode);
    if (previous && previous.status === "redeemed") previous = null; // spent: a new one is fair
    if (
      previous &&
      previous.status === "active" &&
      !isExpired(previous) &&
      previous.percent >= reward.percent
    )
      return fail(
        "already-claimed",
        previous.percent > reward.percent
          ? `You already have ${previous.percent}% off. It's still yours.`
          : `You already have ${previous.percent}% off. Reach a higher rarity to upgrade it.`,
        409,
        { code: publicCode(previous) },
      );
  }

  const c: LootCode = {
    code: await newCode(ns, settings.prefix, reward.percent),
    kind: "score",
    percent: reward.percent,
    email,
    emailHash: hash,
    consent: consent || !!previous?.consent,
    status: "active",
    createdAt: now.toISOString(),
    expiresAt,
    tier,
    score,
  };
  await putCode(ns, c);
  if (previous && previous.status === "active") {
    await putCode(ns, { ...previous, status: "void", replacedBy: c.code });
  }
  await store.setJSON(KEYS.ticket(ticket.id), { ...used, score: c.code } satisfies TicketUse);
  await store.setJSON(KEYS.player(hash), { ...player, scoreCode: c.code, updatedAt: c.createdAt });
  void mailCode(ns, request, c);
  const upgraded = !!previous && previous.status === "active";
  return json({
    ok: true,
    code: publicCode(c),
    upgraded,
    message: upgraded
      ? `Upgraded to ${c.percent}% off. Your old code no longer works.`
      : `${c.percent}% off unlocked.`,
  } satisfies ClaimResult);
}

/** Email the code as a backup, when email is set up (RESEND_API_KEY). */
async function mailCode(ns: ArNamespace, request: Request, c: LootCode) {
  try {
    const settings = await getSettings(ns);
    const url = settings.shopUrl || `${publicOrigin(request, ns)}/`;
    await sendNotice(
      ns,
      c.email,
      `Your ${c.percent}% off code: ${c.code}`,
      `${c.percent}% off, unlocked in LOOT BREAK`,
      `Your code is ${c.code}. It works once and only with this email address, until ${new Date(
        c.expiresAt,
      ).toDateString()}.${c.kind === "quest" ? " We check your follows and story before your order ships." : ""} ${settings.terms}`,
      url,
      settings.shopLabel || "Shop the drop",
    );
  } catch (err) {
    console.warn("[lootbreak] code email failed", err);
  }
}
