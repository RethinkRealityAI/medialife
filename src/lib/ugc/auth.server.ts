import { timingSafeEqual } from "node:crypto";

import { isAdminRequest, readCookie } from "@/lib/ar/auth.server";
import { authConfigured, normalizeEmail, signWithHubSecret } from "@/lib/hub/auth.server";

import { canSignIn, UGC, type UgcCreator } from "./model";
import { UKEYS, newId, sha256Hex, ugcStore, type UgcNamespace } from "./store.server";

// UGC Hub accounts: magic links by email, no passwords.
//
// A UGC creator signs in with a one-time link (30 minutes) or the join link in
// their approval email (7 days). Sessions are server-side records in the UGC
// store behind their own signed, HttpOnly cookie ("ugc_session"), so they sit
// beside a Creator Hub session ("hub_session") without touching it. Signing
// uses the hub secret (HUB_SESSION_SECRET / AR_SESSION_SECRET) under a separate
// "ugc" purpose. Admins use the existing /admin cookie (isAdminRequest).

export const UGC_COOKIE = "ugc_session";

export type UgcSession = {
  id: string;
  creatorId: string;
  createdAt: number;
  expiresAt: number;
  userAgent: string;
};

export type UgcTokenKind = "login" | "join";
type StoredToken = {
  kind: UgcTokenKind;
  creatorId: string;
  email: string;
  expiresAt: number;
  next: string | null;
};

const sign = (ns: UgcNamespace, data: string) => signWithHubSecret(ns, "ugc", data);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const ugcAuthConfigured = authConfigured;

/* ---------------------------------------------------------------------------
   Creators by email
   --------------------------------------------------------------------------- */

export async function findCreatorByEmail(
  ns: UgcNamespace,
  email: string,
): Promise<UgcCreator | null> {
  const store = await ugcStore(ns);
  const ref = await store.getJSON<{ creatorId: string }>(
    UKEYS.byEmail(await sha256Hex(normalizeEmail(email))),
  );
  return ref ? store.getJSON<UgcCreator>(UKEYS.creator(ref.creatorId)) : null;
}

/* ---------------------------------------------------------------------------
   Sessions
   --------------------------------------------------------------------------- */

export async function createUgcSession(ns: UgcNamespace, creatorId: string, userAgent = "") {
  const now = Date.now();
  const session: UgcSession = {
    id: newId(24, false),
    creatorId,
    createdAt: now,
    expiresAt: now + UGC.sessionTtlMs,
    userAgent: userAgent.slice(0, 200),
  };
  const store = await ugcStore(ns);
  await store.setJSON(UKEYS.session(session.id), session);
  await store.update<string[]>(UKEYS.creatorSessions(creatorId), (cur) => [
    ...(cur ?? []).slice(-19),
    session.id,
  ]);
  return {
    cookie: `${session.id}.${await sign(ns, session.id)}`,
    maxAge: Math.floor(UGC.sessionTtlMs / 1000),
  };
}

/** The signed-in UGC creator for a cookie, or null (bad signature, expired, or no longer allowed in). */
export async function resolveUgcSession(
  ns: UgcNamespace,
  cookie: string | null | undefined,
): Promise<{ creator: UgcCreator; session: UgcSession } | null> {
  if (!cookie || !authConfigured(ns)) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const id = cookie.slice(0, dot);
  if (!safeEqual(cookie.slice(dot + 1), await sign(ns, id))) return null;
  const store = await ugcStore(ns);
  const session = await store.getJSON<UgcSession>(UKEYS.session(id));
  if (!session || session.expiresAt < Date.now()) return null;
  const creator = await store.getJSON<UgcCreator>(UKEYS.creator(session.creatorId));
  if (!creator || !canSignIn(creator.status)) return null;
  return { creator, session };
}

export async function endUgcSession(ns: UgcNamespace, cookie: string | null | undefined) {
  if (!cookie) return;
  const id = cookie.slice(0, cookie.lastIndexOf("."));
  if (id) await (await ugcStore(ns)).del(UKEYS.session(id));
}

export async function endAllUgcSessions(ns: UgcNamespace, creatorId: string) {
  const store = await ugcStore(ns);
  const ids = (await store.getJSON<string[]>(UKEYS.creatorSessions(creatorId))) ?? [];
  await Promise.all(ids.map((id) => store.del(UKEYS.session(id))));
  await store.del(UKEYS.creatorSessions(creatorId));
}

/* ---------------------------------------------------------------------------
   One-time links
   --------------------------------------------------------------------------- */

const TTL: Record<UgcTokenKind, number> = {
  login: UGC.loginLinkTtlMs,
  join: UGC.joinLinkTtlMs,
};

/** Only same-site paths under the hub survive as a post-sign-in destination. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  return /^\/ugc-hub(\/[A-Za-z0-9\-_/]*)?(\?[A-Za-z0-9\-_=&%.]*)?$/.test(next) ? next : null;
}

/** The raw token goes in the emailed link; only its hash is stored. */
export async function issueUgcToken(
  ns: UgcNamespace,
  kind: UgcTokenKind,
  creator: Pick<UgcCreator, "id" | "email">,
  next?: string | null,
): Promise<string> {
  const raw = newId(32, false);
  await (
    await ugcStore(ns)
  ).setJSON(UKEYS.token(await sha256Hex(raw)), {
    kind,
    creatorId: creator.id,
    email: normalizeEmail(creator.email),
    expiresAt: Date.now() + TTL[kind],
    next: safeNext(next),
  } satisfies StoredToken);
  return raw;
}

export type ConsumeResult =
  | { ok: true; creator: UgcCreator; kind: UgcTokenKind; next: string | null }
  | { ok: false; reason: "invalid" | "expired" | "not-allowed" };

/** Valid once, only while the creator's email is unchanged and they're allowed in. */
export async function consumeUgcToken(ns: UgcNamespace, raw: string): Promise<ConsumeResult> {
  if (!/^[A-Za-z0-9]{20,80}$/.test(raw)) return { ok: false, reason: "invalid" };
  const store = await ugcStore(ns);
  const key = UKEYS.token(await sha256Hex(raw));
  const t = await store.getJSON<StoredToken>(key);
  if (!t) return { ok: false, reason: "invalid" };
  await store.del(key);
  if (t.expiresAt < Date.now()) return { ok: false, reason: "expired" };
  const creator = await store.getJSON<UgcCreator>(UKEYS.creator(t.creatorId));
  if (!creator || normalizeEmail(creator.email) !== t.email)
    return { ok: false, reason: "invalid" };
  if (!canSignIn(creator.status)) return { ok: false, reason: "not-allowed" };
  return { ok: true, creator, kind: t.kind, next: t.next };
}

/* ---------------------------------------------------------------------------
   API routes: who is calling
   --------------------------------------------------------------------------- */

export type UgcCaller = { kind: "admin" } | { kind: "creator"; creator: UgcCreator };

/** The team (admin cookie) or a signed-in UGC creator; null when neither. */
export async function ugcCaller(ns: UgcNamespace, request: Request): Promise<UgcCaller | null> {
  if (await isAdminRequest(request)) return { kind: "admin" };
  const s = await resolveUgcSession(ns, readCookie(request, UGC_COOKIE));
  return s ? { kind: "creator", creator: s.creator } : null;
}

export const noStore = { "cache-control": "no-store" };
export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: noStore });

/** For non-GET API requests: a caller plus the x-ugc header (CSRF: a cross-site form can't send it). */
export async function ugcGuard(ns: UgcNamespace, request: Request): Promise<UgcCaller | Response> {
  const c = await ugcCaller(ns, request);
  if (!c) return json({ error: "unauthorized" }, 401);
  const m = request.method.toUpperCase();
  if (m !== "GET" && m !== "HEAD" && request.headers.get("x-ugc") !== "1")
    return json({ error: "missing x-ugc header" }, 403);
  return c;
}
