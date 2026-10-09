import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto";
import process from "node:process";

import { KEYS, hubStore, newId, sha256Hex, type HubNamespace } from "./store.server";

// Creator Hub accounts.
//
// Email + password (scrypt), optional "Continue with Discord", and one-time
// tokens for email verification and password reset. Sessions are server-side
// records referenced by a signed, HttpOnly cookie, so signing out — or resetting
// a password — ends them everywhere at once.
//
// Secrets: HUB_SESSION_SECRET (falls back to AR_SESSION_SECRET, which the admin
// tools already use). Production refuses to issue sessions without one; dev and
// deploy previews fall back to a fixed development key.

export const HUB_COOKIE = "hub_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type HubUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  /** null for accounts created with Discord and no password yet. */
  passwordHash: string | null;
  discord: { id: string; username: string; avatar: string | null } | null;
  creatorId: string;
  createdAt: number;
  lastLoginAt: number | null;
  disabled: boolean;
};

export type HubSession = {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  userAgent: string;
};

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/* ---------------------------------------------------------------------------
   Secrets and signing
   --------------------------------------------------------------------------- */

function sessionSecret(ns: HubNamespace): string | null {
  const s = process.env.HUB_SESSION_SECRET || process.env.AR_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  return ns === "prod" ? null : "medialife-creator-hub-development-only-secret";
}

export function authConfigured(ns: HubNamespace): boolean {
  return sessionSecret(ns) !== null;
}

async function hmac(ns: HubNamespace, data: string): Promise<string> {
  const secret = sessionSecret(ns);
  if (!secret) throw new Error("HUB_SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${secret}:hub`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Buffer.from(sig).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ---------------------------------------------------------------------------
   Passwords
   --------------------------------------------------------------------------- */

// scrypt N=2^16, r=8, p=1 (64 MiB) — within OWASP's recommended range and
// ~100–200 ms on a function. Parameters are stored with the hash so they can be
// raised later without breaking existing accounts.
const SCRYPT = { N: 65536, r: 8, p: 1, keylen: 64 };

function scrypt(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scryptCb(
      password.normalize("NFKC"),
      salt,
      keylen,
      { N, r, p, maxmem: 160 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scrypt(password, salt, N, r, p, keylen);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(
    password,
    Buffer.from(saltB64, "base64url"),
    Number(n),
    Number(r),
    Number(p),
    expected.length,
  );
  return timingSafeEqual(key, expected);
}

/** A check that costs the same as a real one, so a missing account can't be told apart by timing. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword("not-a-real-password-placeholder");
  await verifyPassword(password, await dummyHash);
}

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That password is too long.";
  if (email && normalizeEmail(password) === normalizeEmail(email))
    return "Don't use your email as your password.";
  if (/^(.)\1+$/.test(password)) return "Pick something harder to guess.";
  return null;
}

/* ---------------------------------------------------------------------------
   Users
   --------------------------------------------------------------------------- */

export async function getUser(ns: HubNamespace, id: string) {
  return (await hubStore(ns)).getJSON<HubUser>(KEYS.user(id));
}

export async function findUserByEmail(ns: HubNamespace, email: string): Promise<HubUser | null> {
  const store = await hubStore(ns);
  const ref = await store.getJSON<{ userId: string }>(
    KEYS.userByEmail(await sha256Hex(normalizeEmail(email))),
  );
  return ref ? store.getJSON<HubUser>(KEYS.user(ref.userId)) : null;
}

export async function findUserByDiscord(
  ns: HubNamespace,
  discordId: string,
): Promise<HubUser | null> {
  const store = await hubStore(ns);
  const ref = await store.getJSON<{ userId: string }>(KEYS.userByDiscord(discordId));
  return ref ? store.getJSON<HubUser>(KEYS.user(ref.userId)) : null;
}

export async function saveUser(ns: HubNamespace, user: HubUser) {
  await (await hubStore(ns)).setJSON(KEYS.user(user.id), user);
}

/**
 * Claims an email for a new user. Returns false when the address is already
 * taken — including by a signup racing this one.
 */
export async function claimEmail(
  ns: HubNamespace,
  email: string,
  userId: string,
): Promise<boolean> {
  const store = await hubStore(ns);
  const key = KEYS.userByEmail(await sha256Hex(normalizeEmail(email)));
  const now = Date.now();
  const ref = await store.update<{ userId: string; at?: number }>(
    key,
    (cur) => cur ?? { userId, at: now },
  );
  if (ref.userId === userId) return true;
  // A claim whose user was never written (a sign-up that died halfway) stops
  // blocking the address after a few minutes.
  if ((ref.at ?? 0) > now - 5 * 60_000 || (await store.getJSON(KEYS.user(ref.userId))))
    return false;
  await store.setJSON(key, { userId, at: now });
  return true;
}

export async function claimDiscord(
  ns: HubNamespace,
  discordId: string,
  userId: string,
): Promise<boolean> {
  const store = await hubStore(ns);
  const ref = await store.update<{ userId: string }>(
    KEYS.userByDiscord(discordId),
    (cur) => cur ?? { userId },
  );
  return ref.userId === userId;
}

/* ---------------------------------------------------------------------------
   Sessions
   --------------------------------------------------------------------------- */

export async function createSession(ns: HubNamespace, userId: string, userAgent = "") {
  const now = Date.now();
  const session: HubSession = {
    id: newId(24, false),
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    userAgent: userAgent.slice(0, 200),
  };
  const store = await hubStore(ns);
  await store.setJSON(KEYS.session(session.id), session);
  // index the user's sessions so a password reset can end all of them
  await store.update<string[]>(`user-sessions/${userId}`, (cur) => [
    ...(cur ?? []).slice(-49),
    session.id,
  ]);
  return {
    cookie: `${session.id}.${await hmac(ns, session.id)}`,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** The signed-in user for a session cookie, or null. */
export async function resolveSession(
  ns: HubNamespace,
  cookie: string | null | undefined,
): Promise<{ user: HubUser; session: HubSession } | null> {
  if (!cookie || !authConfigured(ns)) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const id = cookie.slice(0, dot);
  if (!safeEqual(cookie.slice(dot + 1), await hmac(ns, id))) return null;
  const store = await hubStore(ns);
  const session = await store.getJSON<HubSession>(KEYS.session(id));
  if (!session || session.expiresAt < Date.now()) return null;
  const user = await store.getJSON<HubUser>(KEYS.user(session.userId));
  if (!user || user.disabled) return null;
  return { user, session };
}

export async function endSession(ns: HubNamespace, cookie: string | null | undefined) {
  if (!cookie) return;
  const id = cookie.slice(0, cookie.lastIndexOf("."));
  if (id) await (await hubStore(ns)).del(KEYS.session(id));
}

export async function endAllSessions(ns: HubNamespace, userId: string, keep?: string) {
  const store = await hubStore(ns);
  const ids = (await store.getJSON<string[]>(`user-sessions/${userId}`)) ?? [];
  await Promise.all(ids.filter((id) => id !== keep).map((id) => store.del(KEYS.session(id))));
  await store.setJSON(`user-sessions/${userId}`, keep ? [keep] : []);
}

/* ---------------------------------------------------------------------------
   One-time tokens (verify email, reset password)
   --------------------------------------------------------------------------- */

export type TokenKind = "verify" | "reset";
const TOKEN_TTL: Record<TokenKind, number> = {
  verify: 7 * 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

type StoredToken = { kind: TokenKind; userId: string; email: string; expiresAt: number };

/** The raw token goes in the emailed link; only its hash is stored. */
export async function issueToken(
  ns: HubNamespace,
  kind: TokenKind,
  user: HubUser,
): Promise<string> {
  const raw = newId(32, false);
  await (
    await hubStore(ns)
  ).setJSON(KEYS.token(await sha256Hex(raw)), {
    kind,
    userId: user.id,
    email: user.email,
    expiresAt: Date.now() + TOKEN_TTL[kind],
  } satisfies StoredToken);
  return raw;
}

/** Consumes a token: valid once, and only for the email it was issued to. */
export async function consumeToken(
  ns: HubNamespace,
  kind: TokenKind,
  raw: string,
): Promise<HubUser | null> {
  if (!/^[A-Za-z0-9]{20,80}$/.test(raw)) return null;
  const store = await hubStore(ns);
  const key = KEYS.token(await sha256Hex(raw));
  const t = await store.getJSON<StoredToken>(key);
  if (!t || t.kind !== kind) return null;
  await store.del(key);
  if (t.expiresAt < Date.now()) return null;
  const user = await store.getJSON<HubUser>(KEYS.user(t.userId));
  if (!user || normalizeEmail(user.email) !== normalizeEmail(t.email)) return null;
  return user;
}

/* ---------------------------------------------------------------------------
   Rate limits
   --------------------------------------------------------------------------- */

/**
 * Fixed-window counter. Returns false once `max` attempts have been made in the
 * window. Stored in Blobs, so it holds across function instances.
 */
export async function rateLimit(
  ns: HubNamespace,
  bucket: string,
  key: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const store = await hubStore(ns);
  const now = Date.now();
  const rec = await store.update<{ count: number; resetAt: number }>(
    KEYS.limit(bucket, await sha256Hex(key.toLowerCase())),
    (cur) =>
      !cur || cur.resetAt < now
        ? { count: 1, resetAt: now + windowMs }
        : { ...cur, count: cur.count + 1 },
  );
  return rec.count <= max;
}

export async function clearRateLimit(ns: HubNamespace, bucket: string, key: string) {
  await (await hubStore(ns)).del(KEYS.limit(bucket, await sha256Hex(key.toLowerCase())));
}

/* ---------------------------------------------------------------------------
   Links in emails
   --------------------------------------------------------------------------- */

/**
 * The origin to put in emailed links. Never taken blindly from the Host header —
 * that would let anyone who can trigger an email point its link at their own
 * site. Production is pinned; previews must be Netlify hosts.
 */
export function publicOrigin(request: Request, ns: HubNamespace): string {
  if (ns === "prod") return "https://medialife.ai";
  const host = (request.headers.get("x-forwarded-host") ?? new URL(request.url).host)
    .split(",")[0]
    .trim();
  if (ns === "dev") return `http://${host}`;
  if (/^[a-z0-9-]+(--[a-z0-9-]+)?\.netlify\.app$/i.test(host)) return `https://${host}`;
  return "https://medialife.ai";
}
