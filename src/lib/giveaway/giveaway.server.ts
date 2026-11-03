import { timingSafeEqual } from "node:crypto";

import { signWithHubSecret, authConfigured } from "@/lib/hub/auth.server";
import { sendProgramEmail } from "@/lib/hub/mail.server";

import { newSeed, skillQuestion, snapshot, snapshotHash, weightedDraw } from "./draw";
import {
  GIVEAWAY,
  GIVEAWAY_ROUTES,
  TASK_VERIFIED,
  blankTask,
  campaignPhase,
  eligibilityProblem,
  foldEmail,
  goLiveProblems,
  isDisposableEmail,
  maskEmail,
  pointsOf,
  prizeCount,
  publicTask,
  type DrawPick,
  type Entrant,
  type GiveawayCampaign,
  type GiveawayDraw,
  type GiveawayTask,
  type LedgerRow,
  type PublicTask,
  type WinnerStatus,
} from "./model";
import {
  GKEYS,
  gwStore,
  newId,
  readAllLimited,
  sha256Hex,
  type GwNamespace,
} from "./store.server";

// Points giveaways: campaigns, entry by confirmed email, tasks and points, referrals,
// fraud flags and the audited weighted draw. Every function takes the namespace,
// so the tests (scripts/hub-tests/giveaway.test.ts) can run it outside a request.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

/* ── Campaigns ───────────────────────────────────────────────────────────── */

/** A new campaign, pre-filled with the agreed points table. Handles and links stay blank for the team. */
export function campaignTemplate(id: string, slug: string, now = Date.now()): GiveawayCampaign {
  const t = (kind: GiveawayTask["kind"], fields: Partial<GiveawayTask>): GiveawayTask => ({
    ...blankTask(newId(6, false), kind),
    ...fields,
  });
  return {
    id,
    slug,
    status: "draft",
    title: "Win the EVADE drop",
    tagline: "Complete tasks, earn points. Every point is one more ticket in the draw.",
    sponsor: "MEDIALIFE",
    sponsorAddress: "",
    brandLine: "MEDIALIFE × EVADE",
    heroImage: "/evade/creators/assets/img/cola-run-splash.webp",
    startsAt: null,
    endsAt: null,
    drawAt: null,
    timeZoneLabel: "ET",
    prizes: [],
    currency: "CAD",
    countries: ["CA", "US"],
    excludedRegions: ["CA-QC"],
    minAge: 13,
    entryPoints: 1,
    referralPoints: 10,
    referralCap: 10,
    honourCap: 25,
    optIns: [
      { id: "medialife", label: "Send me news and drops from MEDIALIFE" },
      { id: "evade", label: "Send me news and drops from EVADE" },
    ],
    tasks: [
      t("newsletter", {
        title: "Join the MEDIALIFE mailing list",
        description: "Drops, behind the scenes and first dibs on merch.",
        points: 10,
        listId: "medialife",
      }),
      t("code", {
        title: "Scan your keychain and play Cola Run",
        description: "Find the code in Cola Run after you scan the QR on your keychain.",
        codeHint: "Scan the QR on the back of your EVADE keychain, play Cola Run, and enter the code it shows you.",
        points: 15,
      }),
      t("discord", { title: "Join the EVADE Discord", points: 5 }),
      t("follow", {
        title: "Follow MEDIALIFE on Instagram",
        platform: "instagram",
        url: "https://www.instagram.com/medialife.ai",
        points: 5,
      }),
      t("follow", { title: "Follow EVADE on Instagram", platform: "instagram", points: 5 }),
      t("follow", { title: "Follow EVADE on TikTok", platform: "tiktok", points: 5 }),
      t("follow", { title: "Subscribe on YouTube", platform: "youtube", points: 5 }),
      t("follow", { title: "Follow on X", platform: "x", points: 3 }),
      t("visit", { title: "Watch the Cola Run trailer", points: 2 }),
    ],
    rulesText: "",
    createdAt: now,
    updatedAt: now,
  };
}

export async function getCampaign(ns: GwNamespace, id: string) {
  return (await gwStore(ns)).getJSON<GiveawayCampaign>(GKEYS.campaign(id));
}

export async function getCampaignBySlug(ns: GwNamespace, slug: string) {
  const store = await gwStore(ns);
  const ref = await store.getJSON<{ id: string }>(GKEYS.slug(slug));
  return ref ? store.getJSON<GiveawayCampaign>(GKEYS.campaign(ref.id)) : null;
}

export async function listCampaigns(ns: GwNamespace): Promise<GiveawayCampaign[]> {
  const all = await readAllLimited<GiveawayCampaign>(await gwStore(ns), GKEYS.campaigns());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createCampaign(
  ns: GwNamespace,
  slug: string,
): Promise<Result<{ campaign: GiveawayCampaign }>> {
  const store = await gwStore(ns);
  if (await store.getJSON(GKEYS.slug(slug))) return fail("That web address is already used.");
  const c = campaignTemplate(newId(8), slug);
  await store.setJSON(GKEYS.slug(slug), { id: c.id });
  await store.setJSON(GKEYS.campaign(c.id), c);
  return { ok: true, campaign: c };
}

/** Saves the editor's fields. Going live needs every goLiveProblems item fixed. */
export async function saveCampaign(
  ns: GwNamespace,
  next: GiveawayCampaign,
): Promise<Result<{ campaign: GiveawayCampaign }>> {
  const store = await gwStore(ns);
  const cur = await getCampaign(ns, next.id);
  if (!cur) return fail("That campaign doesn't exist any more.");
  if (next.slug !== cur.slug) {
    const taken = await store.getJSON<{ id: string }>(GKEYS.slug(next.slug));
    if (taken && taken.id !== cur.id) return fail("That web address is already used.");
  }
  const merged: GiveawayCampaign = {
    ...next,
    createdAt: cur.createdAt,
    updatedAt: Date.now(),
    tasks: next.tasks.slice(0, GIVEAWAY.maxTasks).map((t) => ({
      ...t,
      points: Math.max(0, Math.min(1000, Math.round(t.points))),
      codes: t.codes.map((x) => x.trim().toUpperCase()).filter(Boolean),
    })),
    prizes: next.prizes.slice(0, GIVEAWAY.maxPrizes),
  };
  if (merged.status === "live") {
    const problems = goLiveProblems(merged);
    if (problems.length) return fail(`Before going live: ${problems[0]}`);
  }
  if (next.slug !== cur.slug) {
    await store.setJSON(GKEYS.slug(next.slug), { id: cur.id });
    await store.del(GKEYS.slug(cur.slug));
  }
  await store.setJSON(GKEYS.campaign(cur.id), merged);
  return { ok: true, campaign: merged };
}

/** What the public page gets: no codes, no draft tasks. */
export type PublicCampaign = Omit<GiveawayCampaign, "tasks" | "createdAt" | "updatedAt"> & {
  tasks: PublicTask[];
  phase: ReturnType<typeof campaignPhase>;
  prizeCount: number;
};

export function publicCampaign(c: GiveawayCampaign, now = Date.now()): PublicCampaign {
  const { tasks, createdAt: _c, updatedAt: _u, ...rest } = c;
  return {
    ...rest,
    tasks: tasks.filter((t) => t.enabled).map(publicTask),
    phase: campaignPhase(c, now),
    prizeCount: prizeCount(c),
  };
}

/* ── Sessions and one-time links ─────────────────────────────────────────── */

export const GW_COOKIE = "gw_session";
export const GW_DEVICE_COOKIE = "gw_device";

type Session = { id: string; emailKey: string; email: string; createdAt: number; expiresAt: number };
type Token = {
  campaignId: string;
  entrantId: string;
  emailKey: string;
  expiresAt: number;
};

const sign = (ns: GwNamespace, data: string) => signWithHubSecret(ns, "giveaway", data);

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const gwAuthConfigured = authConfigured;

export async function createGwSession(ns: GwNamespace, email: string) {
  const now = Date.now();
  const s: Session = {
    id: newId(24, false),
    emailKey: foldEmail(email),
    email: email.trim().toLowerCase(),
    createdAt: now,
    expiresAt: now + GIVEAWAY.sessionTtlMs,
  };
  await (await gwStore(ns)).setJSON(GKEYS.session(s.id), s);
  return { cookie: `${s.id}.${await sign(ns, s.id)}`, maxAge: Math.floor(GIVEAWAY.sessionTtlMs / 1000) };
}

/** The confirmed email behind a session cookie, or null. */
export async function resolveGwSession(
  ns: GwNamespace,
  cookie: string | null | undefined,
): Promise<Session | null> {
  if (!cookie || !authConfigured(ns)) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const id = cookie.slice(0, dot);
  if (!safeEqual(cookie.slice(dot + 1), await sign(ns, id))) return null;
  const s = await (await gwStore(ns)).getJSON<Session>(GKEYS.session(id));
  return s && s.expiresAt > Date.now() ? s : null;
}

export async function endGwSession(ns: GwNamespace, cookie: string | null | undefined) {
  const id = cookie?.slice(0, cookie.lastIndexOf("."));
  if (id) await (await gwStore(ns)).del(GKEYS.session(id));
}

async function issueToken(ns: GwNamespace, e: Entrant): Promise<string> {
  const raw = newId(32, false);
  await (await gwStore(ns)).setJSON(GKEYS.token(await sha256Hex(raw)), {
    campaignId: e.campaignId,
    entrantId: e.id,
    emailKey: e.emailKey,
    expiresAt: Date.now() + GIVEAWAY.linkTtlMs,
  } satisfies Token);
  return raw;
}

/* ── Entrants ────────────────────────────────────────────────────────────── */

export async function getEntrant(ns: GwNamespace, campaignId: string, id: string) {
  return (await gwStore(ns)).getJSON<Entrant>(GKEYS.entrant(campaignId, id));
}

export async function findEntrant(ns: GwNamespace, campaignId: string, email: string) {
  const store = await gwStore(ns);
  const ref = await store.getJSON<{ id: string }>(
    GKEYS.byEmail(campaignId, await sha256Hex(foldEmail(email))),
  );
  return ref ? store.getJSON<Entrant>(GKEYS.entrant(campaignId, ref.id)) : null;
}

export async function listEntrants(ns: GwNamespace, campaignId: string) {
  return readAllLimited<Entrant>(await gwStore(ns), GKEYS.entrants(campaignId));
}

/** Read-modify-write one entrant; recomputes the cached points total. */
async function updateEntrant(
  ns: GwNamespace,
  campaignId: string,
  id: string,
  fn: (e: Entrant) => Entrant,
): Promise<Entrant | null> {
  const store = await gwStore(ns);
  let missing = false;
  const next = await store.update<Entrant | null>(GKEYS.entrant(campaignId, id), (cur) => {
    if (!cur) {
      missing = true;
      return cur;
    }
    const e = fn(structuredClone(cur));
    return { ...e, points: pointsOf(e.ledger) };
  });
  return missing ? null : next;
}

const row = (fields: Partial<LedgerRow> & Pick<LedgerRow, "kind" | "points">): LedgerRow => ({
  id: newId(6),
  at: Date.now(),
  taskId: null,
  refEntrantId: null,
  note: "",
  voided: false,
  ...fields,
});

/** Points from honour-system tasks so far (for the cap). */
function honourPoints(c: GiveawayCampaign, e: Entrant) {
  const honour = new Set(c.tasks.filter((t) => !TASK_VERIFIED[t.kind]).map((t) => t.id));
  return e.ledger.reduce(
    (s, r) => (!r.voided && r.kind === "task" && r.taskId && honour.has(r.taskId) ? s + r.points : s),
    0,
  );
}

export type EnterInput = {
  email: string;
  name: string;
  country: string;
  region: string;
  ageConfirmed: boolean;
  optIns: string[];
  ref: string | null;
};

export type RequestMeta = { ip: string; device: string; origin: string };

/**
 * Starts (or resumes) an entry. New entrants get a confirm email; nothing counts
 * until they click it. If the browser already has a session for this email, the
 * entry is confirmed straight away (the email is already proven).
 */
export async function enter(
  ns: GwNamespace,
  c: GiveawayCampaign,
  input: EnterInput,
  meta: RequestMeta,
  sessionEmailKey: string | null,
): Promise<Result<{ status: "check-email" | "confirmed"; devLink: string | null; entrantId: string }>> {
  if (campaignPhase(c) !== "open") return fail("This giveaway isn't open for entries right now.");
  if (!input.ageConfirmed) return fail(`You need to be at least ${c.minAge} to enter.`);
  const problem = eligibilityProblem(c, input.country, input.region);
  if (problem) return fail(problem);
  if (isDisposableEmail(input.email))
    return fail("Please use your everyday email address. Temporary inboxes can't enter.");

  const store = await gwStore(ns);
  const emailKey = foldEmail(input.email);
  const emailHash = await sha256Hex(emailKey);
  const ipHash = (await sha256Hex(`${c.id}:${meta.ip}`)).slice(0, 24);
  const deviceHash = meta.device ? (await sha256Hex(`${c.id}:${meta.device}`)).slice(0, 24) : "";
  const now = Date.now();

  let e = await findEntrant(ns, c.id, input.email);
  if (e?.status === "void") return fail("This entry can't take part. Check the official rules.");
  if (!e) {
    const id = newId(10);
    let refCode = newId(5, false).toLowerCase();
    while (await store.getJSON(GKEYS.byRef(c.id, refCode))) refCode = newId(5, false).toLowerCase();
    let referredBy: string | null = null;
    if (input.ref) {
      const r = await store.getJSON<{ id: string }>(GKEYS.byRef(c.id, input.ref.toLowerCase()));
      if (r) referredBy = r.id;
    }
    e = {
      id,
      campaignId: c.id,
      email: input.email.trim().toLowerCase(),
      emailKey,
      name: input.name.trim().slice(0, 80),
      country: input.country,
      region: input.region,
      ageConfirmed: true,
      status: "pending",
      voidReason: "",
      refCode,
      referredBy,
      ipHash,
      deviceHash,
      consents: c.optIns
        .filter((o) => input.optIns.includes(o.id))
        .map((o) => ({ listId: o.id, label: o.label, at: now, ipHash })),
      opened: {},
      completed: {},
      ledger: [],
      points: 0,
      createdAt: now,
      confirmedAt: null,
      lastSeenAt: now,
    };
    const claimed = await store.update<{ id: string } | null>(GKEYS.byEmail(c.id, emailHash), (cur) => cur ?? { id });
    if (claimed?.id !== id) {
      e = await getEntrant(ns, c.id, claimed!.id);
      if (!e) return fail("Something went wrong. Please try again.");
    } else {
      await store.setJSON(GKEYS.entrant(c.id, id), e);
      await store.setJSON(GKEYS.byRef(c.id, refCode), { id });
    }
  }

  if (e.status === "confirmed") {
    return { ok: true, status: sessionEmailKey === emailKey ? "confirmed" : "check-email", devLink: sessionEmailKey === emailKey ? null : await sendLink(ns, c, e, meta.origin), entrantId: e.id };
  }
  if (sessionEmailKey === emailKey) {
    await confirmEntrant(ns, c, e.id);
    return { ok: true, status: "confirmed", devLink: null, entrantId: e.id };
  }
  return { ok: true, status: "check-email", devLink: await sendLink(ns, c, e, meta.origin), entrantId: e.id };
}

async function sendLink(ns: GwNamespace, c: GiveawayCampaign, e: Entrant, origin: string) {
  const token = await issueToken(ns, e);
  const url = `${origin}${GIVEAWAY_ROUTES.auth}?token=${token}`;
  const r = await sendProgramEmail(ns, e.email, {
    subject: e.status === "confirmed" ? `Your link to ${c.title}` : `Confirm your entry: ${c.title}`,
    eyebrow: c.brandLine || "MEDIALIFE",
    heading: e.status === "confirmed" ? "Here's your link" : "One tap to confirm your entry",
    body:
      e.status === "confirmed"
        ? "Use the button to get back to your tasks and points."
        : "Confirm your email to lock in your entry. Then complete tasks to earn more points: every point is one more ticket in the draw.",
    cta: e.status === "confirmed" ? "Open my entry" : "Confirm my entry",
    url,
    footer: `You're getting this because this address was entered in ${c.title}. If that wasn't you, ignore this email and nothing happens. The link works for 7 days.`,
  });
  return r.sent ? null : (r.devLink ?? null);
}

/** Resends a link for an existing entry (always "ok" so it can't reveal who entered). */
export async function resendLink(ns: GwNamespace, c: GiveawayCampaign, email: string, origin: string) {
  const e = await findEntrant(ns, c.id, email);
  if (!e || e.status === "void") return { devLink: null };
  return { devLink: await sendLink(ns, c, e, origin) };
}

async function confirmEntrant(ns: GwNamespace, c: GiveawayCampaign, entrantId: string) {
  let firstConfirm = false;
  const e = await updateEntrant(ns, c.id, entrantId, (e) => {
    if (e.status !== "pending") return e;
    firstConfirm = true;
    e.status = "confirmed";
    e.confirmedAt = Date.now();
    if (c.entryPoints > 0) e.ledger.push(row({ kind: "entry", points: c.entryPoints, note: "Confirmed entry" }));
    // Mailing-list tasks ticked on the entry form count once the email is proven.
    for (const t of c.tasks) {
      if (t.enabled && t.kind === "newsletter" && e.consents.some((x) => x.listId === t.listId) && !e.completed[t.id]) {
        e.completed[t.id] = { at: Date.now(), handle: "", detail: "Opted in on entry" };
        e.ledger.push(row({ kind: "task", taskId: t.id, points: t.points, note: t.title }));
      }
    }
    return e;
  });
  if (firstConfirm && e?.referredBy) await creditReferral(ns, c, e);
  return e;
}

/** A confirmed friend pays the referrer, up to the cap, unless they look like the same person. */
async function creditReferral(ns: GwNamespace, c: GiveawayCampaign, friend: Entrant) {
  if (!friend.referredBy || c.referralPoints <= 0) return;
  await updateEntrant(ns, c.id, friend.referredBy, (r) => {
    if (r.status !== "confirmed" || r.id === friend.id) return r;
    const paid = r.ledger.filter((x) => x.kind === "referral" && !x.voided).length;
    const samePerson =
      r.ipHash === friend.ipHash || (r.deviceHash !== "" && r.deviceHash === friend.deviceHash);
    if (paid >= c.referralCap || r.ledger.some((x) => x.refEntrantId === friend.id)) return r;
    r.ledger.push(
      row({
        kind: "referral",
        refEntrantId: friend.id,
        points: c.referralPoints,
        note: samePerson ? "Referral (same network or device as you: held for review)" : `Referral: ${maskEmail(friend.email)}`,
        voided: samePerson,
      }),
    );
    return r;
  });
}

export type ConsumeResult =
  | { ok: true; slug: string; email: string }
  | { ok: false; reason: "invalid" | "expired" };

/** Uses an emailed link once: confirms the entry and returns the email to sign in as. */
export async function consumeLink(ns: GwNamespace, raw: string): Promise<ConsumeResult> {
  if (!/^[A-Za-z0-9]{20,80}$/.test(raw)) return { ok: false, reason: "invalid" };
  const store = await gwStore(ns);
  const key = GKEYS.token(await sha256Hex(raw));
  const t = await store.getJSON<Token>(key);
  if (!t) return { ok: false, reason: "invalid" };
  await store.del(key);
  if (t.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  const c = await getCampaign(ns, t.campaignId);
  const e = await getEntrant(ns, t.campaignId, t.entrantId);
  if (!c || !e || e.emailKey !== t.emailKey || e.status === "void") return { ok: false, reason: "invalid" };
  await confirmEntrant(ns, c, e.id);
  return { ok: true, slug: c.slug, email: e.email };
}

/* ── What an entrant sees ────────────────────────────────────────────────── */

export type EntrantView = {
  name: string;
  email: string;
  status: Entrant["status"];
  points: number;
  refUrl: string;
  referrals: number;
  referralsHeld: number;
  optIns: string[];
  tasks: Record<string, { done: boolean; at: number | null; handle: string }>;
  honourPoints: number;
};

export function entrantView(c: GiveawayCampaign, e: Entrant, origin: string): EntrantView {
  const tasks: EntrantView["tasks"] = {};
  for (const t of c.tasks) {
    const d = e.completed[t.id];
    tasks[t.id] = { done: !!d, at: d?.at ?? null, handle: d?.handle ?? "" };
  }
  return {
    name: e.name,
    email: e.email,
    status: e.status,
    points: e.points,
    refUrl: `${origin}${GIVEAWAY_ROUTES.campaign(c.slug)}?ref=${e.refCode}`,
    referrals: e.ledger.filter((r) => r.kind === "referral" && !r.voided).length,
    referralsHeld: e.ledger.filter((r) => r.kind === "referral" && r.voided).length,
    optIns: e.consents.map((x) => x.listId),
    tasks,
    honourPoints: honourPoints(c, e),
  };
}

/* ── Tasks ───────────────────────────────────────────────────────────────── */

/** Records that the entrant opened an honour task's link (needed before claiming it). */
export async function openTask(ns: GwNamespace, c: GiveawayCampaign, entrantId: string, taskId: string) {
  const t = c.tasks.find((x) => x.id === taskId && x.enabled);
  if (!t) return;
  await updateEntrant(ns, c.id, entrantId, (e) => {
    e.opened[taskId] = e.opened[taskId] ?? Date.now();
    e.lastSeenAt = Date.now();
    return e;
  });
}

export type ClaimInput = { taskId: string; handle?: string; code?: string; listId?: string };

/** Completes a task that doesn't need OAuth (newsletter, follow, visit, code). */
export async function claimTask(
  ns: GwNamespace,
  c: GiveawayCampaign,
  entrantId: string,
  input: ClaimInput,
  meta: { ipHash?: string } = {},
): Promise<Result<{ points: number; awarded: number }>> {
  if (campaignPhase(c) !== "open") return fail("This giveaway has ended, so points can't be added.");
  const t = c.tasks.find((x) => x.id === input.taskId && x.enabled);
  if (!t) return fail("That task isn't available.");
  if (t.kind === "discord") return fail("Use the Discord button to check this one.");
  const handle = (input.handle ?? "").trim().replace(/^@+/, "").slice(0, 60);
  const code = (input.code ?? "").trim().toUpperCase();
  if (t.kind === "follow" && !/^[A-Za-z0-9._-]{2,60}$/.test(handle))
    return fail(`Enter your ${t.platform === "youtube" ? "YouTube channel name" : "username"} so we can check it if you win.`);
  if (t.kind === "code" && !t.codes.includes(code)) return fail("That code isn't right. Check it and try again.");

  let error: string | null = null;
  let awarded = 0;
  const e = await updateEntrant(ns, c.id, entrantId, (e) => {
    if (e.status !== "confirmed") {
      error = "Confirm your email first. Check your inbox for the link.";
      return e;
    }
    if (e.completed[t.id]) return e;
    if (!TASK_VERIFIED[t.kind]) {
      const opened = e.opened[t.id];
      if (!opened || Date.now() - opened < GIVEAWAY.minOpenMs) {
        error = "Open the link first, then come back and tap “I did it”.";
        return e;
      }
    }
    let pts = t.points;
    if (!TASK_VERIFIED[t.kind] && c.honourCap > 0)
      pts = Math.max(0, Math.min(pts, c.honourCap - honourPoints(c, e)));
    if (t.kind === "newsletter" && t.listId && !e.consents.some((x) => x.listId === t.listId)) {
      const list = c.optIns.find((o) => o.id === t.listId);
      e.consents.push({ listId: t.listId, label: list?.label ?? t.title, at: Date.now(), ipHash: meta.ipHash ?? e.ipHash });
    }
    e.completed[t.id] = { at: Date.now(), handle, detail: t.kind === "code" ? "Code accepted" : "" };
    e.ledger.push(row({ kind: "task", taskId: t.id, points: pts, note: t.title + (handle ? ` (@${handle})` : "") }));
    e.lastSeenAt = Date.now();
    awarded = pts;
    return e;
  });
  if (!e) return fail("We couldn't find your entry. Enter again with your email.");
  if (error) return fail(error);
  return { ok: true, points: e.points, awarded };
}

/** Discord OAuth finished: award the task when they're in the server. */
export async function completeDiscordTask(
  ns: GwNamespace,
  c: GiveawayCampaign,
  entrantId: string,
  taskId: string,
  discord: { id: string; username: string; guildIds: string[] },
): Promise<"done" | "not-member" | "taken" | "closed" | "error"> {
  if (campaignPhase(c) !== "open") return "closed";
  const t = c.tasks.find((x) => x.id === taskId && x.enabled && x.kind === "discord");
  if (!t?.guildId) return "error";
  if (!discord.guildIds.includes(t.guildId)) return "not-member";
  const store = await gwStore(ns);
  const owner = await store.update<{ id: string } | null>(GKEYS.byDiscord(c.id, discord.id), (cur) => cur ?? { id: entrantId });
  if (owner?.id !== entrantId) return "taken";
  const e = await updateEntrant(ns, c.id, entrantId, (e) => {
    if (e.status !== "confirmed" || e.completed[t.id]) return e;
    e.completed[t.id] = { at: Date.now(), handle: discord.username, detail: `Discord ${discord.id}` };
    e.ledger.push(row({ kind: "task", taskId: t.id, points: t.points, note: `${t.title} (@${discord.username})` }));
    return e;
  });
  return e ? "done" : "error";
}

/* ── Admin: entrants, flags, adjustments ─────────────────────────────────── */

export type EntrantFlag = "shared-network" | "shared-device" | "burst" | "held-referrals";
export const FLAG_LABELS: Record<EntrantFlag, string> = {
  "shared-network": "Same network as 3+ entries",
  "shared-device": "Same device as another entry",
  burst: "Many entries within a minute",
  "held-referrals": "Referrals held for review",
};

export type AdminEntrantRow = {
  id: string;
  name: string;
  email: string;
  country: string;
  region: string;
  status: Entrant["status"];
  voidReason: string;
  points: number;
  tasksDone: number;
  referrals: number;
  handles: { taskId: string; title: string; platform: string | null; handle: string; url: string }[];
  optIns: string[];
  flags: EntrantFlag[];
  createdAt: number;
  confirmedAt: number | null;
};

export function flagEntrants(entrants: Entrant[]): Map<string, EntrantFlag[]> {
  const byIp = new Map<string, number>();
  const byDevice = new Map<string, number>();
  for (const e of entrants) {
    byIp.set(e.ipHash, (byIp.get(e.ipHash) ?? 0) + 1);
    if (e.deviceHash) byDevice.set(e.deviceHash, (byDevice.get(e.deviceHash) ?? 0) + 1);
  }
  const times = entrants.map((e) => e.createdAt).sort((a, b) => a - b);
  const out = new Map<string, EntrantFlag[]>();
  for (const e of entrants) {
    const f: EntrantFlag[] = [];
    if ((byIp.get(e.ipHash) ?? 0) >= 3) f.push("shared-network");
    if (e.deviceHash && (byDevice.get(e.deviceHash) ?? 0) >= 2) f.push("shared-device");
    const within = times.filter((t) => Math.abs(t - e.createdAt) < 60_000).length;
    if (within >= 10) f.push("burst");
    if (e.ledger.some((r) => r.kind === "referral" && r.voided)) f.push("held-referrals");
    out.set(e.id, f);
  }
  return out;
}

export function adminRows(c: GiveawayCampaign, entrants: Entrant[]): AdminEntrantRow[] {
  const flags = flagEntrants(entrants);
  return entrants
    .map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      country: e.country,
      region: e.region,
      status: e.status,
      voidReason: e.voidReason,
      points: e.points,
      tasksDone: Object.keys(e.completed).length,
      referrals: e.ledger.filter((r) => r.kind === "referral" && !r.voided).length,
      handles: c.tasks
        .filter((t) => e.completed[t.id]?.handle)
        .map((t) => ({ taskId: t.id, title: t.title, platform: t.platform, handle: e.completed[t.id].handle, url: t.url })),
      optIns: e.consents.map((x) => x.listId),
      flags: flags.get(e.id) ?? [],
      createdAt: e.createdAt,
      confirmedAt: e.confirmedAt,
    }))
    .sort((a, b) => b.points - a.points || a.createdAt - b.createdAt);
}

export async function setEntrantVoid(
  ns: GwNamespace,
  campaignId: string,
  entrantId: string,
  voided: boolean,
  reason: string,
) {
  const e = await updateEntrant(ns, campaignId, entrantId, (e) => {
    if (voided) {
      e.status = "void";
      e.voidReason = reason.slice(0, 200) || "Voided by the team";
    } else {
      e.status = e.confirmedAt ? "confirmed" : "pending";
      e.voidReason = "";
    }
    return e;
  });
  return e ? { ok: true as const } : fail("Entrant not found.");
}

/** Adds (or removes, with a negative number) points by hand, or voids/unvoids a ledger row. */
export async function adjustPoints(
  ns: GwNamespace,
  campaignId: string,
  entrantId: string,
  input: { points?: number; note?: string; rowId?: string; voided?: boolean },
) {
  const e = await updateEntrant(ns, campaignId, entrantId, (e) => {
    if (input.rowId) {
      const r = e.ledger.find((x) => x.id === input.rowId);
      if (r && input.voided != null) r.voided = input.voided;
    } else if (input.points) {
      e.ledger.push(row({ kind: "adjust", points: Math.round(input.points), note: (input.note || "Adjusted by the team").slice(0, 200) }));
    }
    return e;
  });
  return e ? { ok: true as const, entrant: e } : fail("Entrant not found.");
}

/* ── Draw ────────────────────────────────────────────────────────────────── */

export async function listDraws(ns: GwNamespace, campaignId: string) {
  const all = await readAllLimited<GiveawayDraw>(await gwStore(ns), GKEYS.draws(campaignId));
  return all.sort((a, b) => b.at - a.at);
}

/** Draws one winner per prize unit plus alternates, from confirmed entries with ≥1 point. */
export async function runDraw(ns: GwNamespace, c: GiveawayCampaign): Promise<Result<{ draw: GiveawayDraw }>> {
  const slots = c.prizes.flatMap((p) => Array.from({ length: p.quantity }, () => p.id));
  if (!slots.length) return fail("Add the prizes first: the draw picks one winner per prize.");
  const entrants = (await listEntrants(ns, c.id)).filter((e) => e.status === "confirmed" && e.points > 0);
  if (!entrants.length) return fail("There are no confirmed entries with points yet.");
  const pool = snapshot(entrants.map((e) => ({ id: e.id, tickets: e.points })));
  const seed = newSeed();
  const picks = await weightedDraw(seed, pool, slots.length + GIVEAWAY.alternates);
  const now = Date.now();
  const draw: GiveawayDraw = {
    id: newId(8),
    campaignId: c.id,
    at: now,
    seed,
    entrants: pool.length,
    totalTickets: pool.reduce((s, e) => s + e.tickets, 0),
    snapshotHash: await snapshotHash(pool),
    picks: picks.map((p, i): DrawPick => {
      const q = skillQuestion();
      return {
        entrantId: p.id,
        tickets: p.tickets,
        role: i < slots.length ? "winner" : "alternate",
        prizeId: i < slots.length ? slots[i] : null,
        status: "pending",
        skillQuestion: q.question,
        skillAnswer: q.answer,
        notes: "",
        updatedAt: now,
      };
    }),
  };
  await (await gwStore(ns)).setJSON(GKEYS.draw(c.id, draw.id), draw);
  return { ok: true, draw };
}

/**
 * Moves a pick along: pending → verified (handles checked, winner emailed) → claimed,
 * or forfeited, which hands the prize to the next alternate still waiting.
 */
export async function setPickStatus(
  ns: GwNamespace,
  campaignId: string,
  drawId: string,
  entrantId: string,
  status: WinnerStatus,
  notes?: string,
): Promise<Result<{ draw: GiveawayDraw }>> {
  const store = await gwStore(ns);
  const key = GKEYS.draw(campaignId, drawId);
  let error: string | null = null;
  const draw = await store.update<GiveawayDraw | null>(key, (d) => {
    if (!d) return d;
    const pick = d.picks.find((p) => p.entrantId === entrantId);
    if (!pick) {
      error = "That person isn't in this draw.";
      return d;
    }
    pick.status = status;
    if (notes != null) pick.notes = notes.slice(0, 500);
    pick.updatedAt = Date.now();
    if (status === "forfeited" && pick.role === "winner" && pick.prizeId) {
      const next = d.picks.find((p) => p.role === "alternate" && p.status === "pending");
      if (next) {
        next.role = "winner";
        next.prizeId = pick.prizeId;
        next.updatedAt = Date.now();
      }
      pick.role = "alternate";
    }
    return d;
  });
  if (!draw) return fail("That draw doesn't exist.");
  if (error) return fail(error);
  return { ok: true, draw };
}

/** Emails a winner their skill-testing question and how to claim. */
export async function emailWinner(
  ns: GwNamespace,
  c: GiveawayCampaign,
  draw: GiveawayDraw,
  entrantId: string,
  origin: string,
) {
  const pick = draw.picks.find((p) => p.entrantId === entrantId && p.role === "winner");
  const e = await getEntrant(ns, c.id, entrantId);
  if (!pick || !e) return fail("That winner isn't in this draw.");
  const prize = c.prizes.find((p) => p.id === pick.prizeId);
  const r = await sendProgramEmail(ns, e.email, {
    subject: `You've been selected in ${c.title}`,
    eyebrow: c.brandLine || "MEDIALIFE",
    heading: `You've been selected${e.name ? `, ${e.name.split(" ")[0]}` : ""}!`,
    body: `You were drawn as a potential winner of ${prize?.title ?? "a prize"} in ${c.title}.\n\nTo claim it, reply to this email within ${GIVEAWAY.claimDays} days with:\n1. The answer to this skill-testing question, worked out without help: ${pick.skillQuestion}\n2. Your full name and shipping address.\n\nIf you're under the age of majority where you live, a parent or guardian needs to reply for you.`,
    cta: "Read the official rules",
    url: `${origin}${GIVEAWAY_ROUTES.rules(c.slug)}`,
    footer: `You entered ${c.title} with this address. If you don't reply within ${GIVEAWAY.claimDays} days the prize goes to an alternate.`,
  });
  return r.sent || r.devLink ? { ok: true as const, devLink: r.sent ? null : (r.devLink ?? null) } : fail("The email couldn't be sent. Check RESEND_API_KEY on Netlify.");
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // no spreadsheet formulas
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export function entrantsCsv(c: GiveawayCampaign, entrants: Entrant[]) {
  const rows = adminRows(c, entrants);
  const honourTasks = c.tasks.filter((t) => t.kind === "follow");
  return csv([
    ["name", "email", "country", "region", "status", "points", "tasks_done", "referrals", "flags", "entered", "confirmed", ...honourTasks.map((t) => t.title)],
    ...rows.map((r) => [
      r.name,
      r.email,
      r.country,
      r.region,
      r.status,
      r.points,
      r.tasksDone,
      r.referrals,
      r.flags.join(" "),
      new Date(r.createdAt).toISOString(),
      r.confirmedAt ? new Date(r.confirmedAt).toISOString() : "",
      ...honourTasks.map((t) => r.handles.find((h) => h.taskId === t.id)?.handle ?? ""),
    ]),
  ]);
}

/** Confirmed opt-ins only, with when and what they agreed to (CASL record keeping). */
export function subscribersCsv(entrants: Entrant[], listId: string) {
  return csv([
    ["email", "name", "country", "list", "consent_text", "consented_at"],
    ...entrants
      .filter((e) => e.status === "confirmed")
      .flatMap((e) =>
        e.consents
          .filter((x) => x.listId === listId)
          .map((x) => [e.email, e.name, e.country, x.listId, x.label, new Date(x.at).toISOString()]),
      ),
  ]);
}
