import { timingSafeEqual } from "node:crypto";
import process from "node:process";

import { namedStore, type ArNamespace } from "@/lib/ar/store.server";
import { signWithHubSecret } from "@/lib/hub/auth.server";
import { sha256Hex } from "@/lib/hub/store.server";

import {
  CODE_ALPHABET,
  CODE_PREFIX,
  maskEmail,
  roomById,
  type CollectorMe,
  type OwnedItem,
} from "./model";

// Collector Hub storage and the code maths (Netlify Blobs, store "collector-<ns>").
//
//   batches/<key>          a batch of codes for one product (key = 2 code chars)
//   batch-index/<key>      { sha256(code)[0..20]: serial } so a typed code finds its serial
//   claims/<key>/<serial>  who claimed a code (first claim wins, for good)
//   owners/<emailHash>     a fan's room: every item they've unlocked
//   alerts/<room>          the alerts the team sent to that room (newest first)
//   meta/batch-counter     next batch number
//
// Codes are HMAC(COLLECTOR_CODE_SECRET, "<key>:<serial>"), so a batch's CSV can
// be regenerated at any time and no code is stored in plain text. Rotating that
// secret would invalidate every printed code, which is why it's its own env var
// and not the session secret.

export const collectorStore = (ns: ArNamespace) => namedStore(`collector-${ns}`);

export const KEYS = {
  batch: (key: string) => `batches/${key}`,
  batches: () => "batches/",
  index: (key: string) => `batch-index/${key}`,
  claim: (key: string, serial: number) => `claims/${key}/${serial}`,
  claims: (key: string) => `claims/${key}/`,
  owner: (emailHash: string) => `owners/${emailHash}`,
  owners: () => "owners/",
  alerts: (room: string) => `alerts/${room}`,
  counter: () => "meta/batch-counter",
} as const;

export type Batch = {
  key: string;
  room: string;
  product: string;
  label: string;
  count: number;
  status: "active" | "paused";
  /** Where the QR on the product points; the code rides along as ?hub=. */
  experienceUrl: string;
  createdAt: string;
};

export type Claim = { emailHash: string; at: string; product: string; room: string };

export type Owner = {
  emailHash: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  /** Items per room. */
  rooms: Record<string, OwnedItem[]>;
};

/* ── Secrets ─────────────────────────────────────────────────────────────── */

export function codeSecret(ns: ArNamespace): string | null {
  const s = process.env.COLLECTOR_CODE_SECRET?.trim();
  if (s && s.length >= 24) return s;
  return ns === "prod" ? null : "medialife-collector-codes-development-only";
}

/** The shared test code: BOBO-TEST-CATS. On for previews and dev; prod only with COLLECTOR_TEST_CODE=on. */
export const TEST_CODE = "BOBOTESTCATS";
export const TEST_SERIAL = 412;
export function testCodeEnabled(ns: ArNamespace): boolean {
  const v = process.env.COLLECTOR_TEST_CODE?.trim().toLowerCase();
  if (v === "off") return false;
  if (v === "on") return true;
  return ns !== "prod";
}

async function hmacBytes(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

/** Six code characters for one serial of a batch. */
export async function macChars(secret: string, key: string, serial: number): Promise<string> {
  const b = await hmacBytes(secret, `${key}:${serial}`);
  // 40 bits mod 31^6 (887,503,681): the bias is far below anything guessable.
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 256 + b[i];
  n %= 31 ** 6;
  let s = "";
  for (let i = 0; i < 6; i++) {
    s = CODE_ALPHABET[n % 31] + s;
    n = Math.floor(n / 31);
  }
  return s;
}

export async function codeFor(secret: string, key: string, serial: number): Promise<string> {
  return CODE_PREFIX + key + (await macChars(secret, key, serial));
}

export const codeHash = async (code: string) => (await sha256Hex(`collector:${code}`)).slice(0, 20);
export const emailHash = async (email: string) =>
  (await sha256Hex(`collector-email:${email}`)).slice(0, 32);

/** Batch number → two code characters ("22", "23", … skipping "TE", the test code's). */
export function batchKey(n: number): string {
  const a = CODE_ALPHABET;
  const k = a[Math.floor(n / 31) % 31] + a[n % 31];
  return k;
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/* ── Owner tokens ────────────────────────────────────────────────────────── */

// "c1.<emailHash>.<expiry base36>.<sig>". Stateless and sent as a Bearer header,
// so it works from the Mattercraft experience on another origin (no cookies).
const TOKEN_DAYS = 180;

export async function issueOwnerToken(ns: ArNamespace, eh: string, now = Date.now()) {
  const exp = Math.floor((now + TOKEN_DAYS * 864e5) / 1000).toString(36);
  const payload = `c1.${eh}.${exp}`;
  return `${payload}.${await signWithHubSecret(ns, "collector", payload)}`;
}

export async function verifyOwnerToken(ns: ArNamespace, token: string | null | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "c1") return null;
  const [, eh, exp] = parts;
  if (!/^[a-f0-9]{32}$/.test(eh)) return null;
  if (parseInt(exp, 36) * 1000 < Date.now()) return null;
  let sig: string;
  try {
    sig = await signWithHubSecret(ns, "collector", `c1.${eh}.${exp}`);
  } catch {
    return null;
  }
  return safeEqual(sig, parts[3]) ? eh : null;
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

/* ── Owners ──────────────────────────────────────────────────────────────── */

export function meFor(owner: Owner, roomId: string): CollectorMe {
  const room = roomById(roomId)!;
  const items = owner.rooms[roomId] ?? [];
  const ids = new Set(items.map((i) => i.product));
  const owned = room.products.filter((p) => ids.has(p.id)).length;
  return {
    room: roomId,
    email: maskEmail(owner.email),
    items,
    owned,
    total: room.products.length,
    complete: owned === room.products.length,
    collection: {
      ...room.collection,
      products: room.products.map((p) =>
        p.secret && !ids.has(p.id)
          ? { ...p, name: "Mystery drop", blurb: "A secret drop. Nobody knows what it is yet." }
          : p,
      ),
    },
  };
}

/** Add an item to a fan's room (idempotent). Returns the saved owner. */
export async function addItem(
  ns: ArNamespace,
  email: string,
  eh: string,
  roomId: string,
  item: OwnedItem,
): Promise<Owner> {
  const store = await collectorStore(ns);
  const now = new Date().toISOString();
  return store.update<Owner>(KEYS.owner(eh), (cur) => {
    const o: Owner = cur ?? { emailHash: eh, email, createdAt: now, updatedAt: now, rooms: {} };
    const list = o.rooms[roomId] ?? [];
    if (
      !list.some(
        (i) => i.product === item.product && i.serial === item.serial && !!i.test === !!item.test,
      )
    )
      list.push(item);
    return { ...o, updatedAt: now, rooms: { ...o.rooms, [roomId]: list } };
  });
}
