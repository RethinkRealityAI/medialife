import { timingSafeEqual } from "node:crypto";

import { namedStore, type ArNamespace } from "@/lib/ar/store.server";
import { signWithHubSecret } from "@/lib/hub/auth.server";
import { newId, sha256Hex } from "@/lib/hub/store.server";

import {
  CODE_ALPHABET,
  cleanSettings,
  normalizeCode,
  type LootCode,
  type LootSettings,
} from "./model";

// LOOT BREAK rewards storage (Netlify Blobs, store "lootbreak-<ns>", so deploy
// previews never touch production codes):
//
//   settings              the campaign settings (admin-editable)
//   codes/<CODE>          one record per code, keyed by its normalized form
//   players/<emailHash>   { scoreCode?, questCode? }: one of each per email
//   tickets/<id>          what a round ticket has already been used for
//   recent                newest codes first (summaries), for the admin list

export const lootStore = (ns: ArNamespace) => namedStore(`lootbreak-${ns}`);

export const KEYS = {
  settings: () => "settings",
  code: (normalized: string) => `codes/${normalized}`,
  player: (emailHash: string) => `players/${emailHash}`,
  ticket: (id: string) => `tickets/${id}`,
  recent: () => "recent",
} as const;

export const RECENT_MAX = 2000;

export type Player = { scoreCode?: string; questCode?: string; updatedAt: string };
export type TicketUse = { score?: string; quest?: string };

export async function getSettings(ns: ArNamespace): Promise<LootSettings> {
  return cleanSettings(await (await lootStore(ns)).getJSON<LootSettings>(KEYS.settings()));
}

export async function saveSettings(
  ns: ArNamespace,
  s: Partial<LootSettings>,
): Promise<LootSettings> {
  const clean = cleanSettings({ ...s, updatedAt: new Date().toISOString() });
  await (await lootStore(ns)).setJSON(KEYS.settings(), clean);
  return clean;
}

export const emailHash = (email: string) => sha256Hex(`lootbreak:${email}`);

/* ── Round tickets ───────────────────────────────────────────────────────── */
// The game asks for a ticket when a round starts. A claim must bring one that
// is signed by us, old enough to be a real round, and not already spent, so
// codes can't be minted by calling the API in a loop.

export async function issueTicket(ns: ArNamespace): Promise<string> {
  const id = newId(9);
  const at = Date.now();
  const sig = await signWithHubSecret(ns, "lootbreak-ticket", `${id}.${at}`);
  return `${id}.${at}.${sig}`;
}

export async function readTicket(
  ns: ArNamespace,
  ticket: unknown,
): Promise<{ id: string; at: number } | null> {
  if (typeof ticket !== "string" || ticket.length > 200) return null;
  const [id, atS, sig] = ticket.split(".");
  const at = Number(atS);
  if (!id || !sig || !Number.isFinite(at)) return null;
  const want = await signWithHubSecret(ns, "lootbreak-ticket", `${id}.${at}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id, at };
}

/* ── Codes ───────────────────────────────────────────────────────────────── */

function randomChunk(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n * 2));
  let out = "";
  for (let i = 0; out.length < n && i < bytes.length; i++) {
    // Reject the top of the byte range so every character is equally likely.
    const limit = 256 - (256 % CODE_ALPHABET.length);
    if (bytes[i] < limit) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out.length === n ? out : randomChunk(n);
}

/** A fresh code that doesn't exist yet: PREFIX + percent + 8 random characters. */
export async function newCode(ns: ArNamespace, prefix: string, percent: number): Promise<string> {
  const store = await lootStore(ns);
  for (let i = 0; i < 6; i++) {
    const code = `${prefix}${percent}-${randomChunk(4)}-${randomChunk(4)}`;
    if (!(await store.getJSON(KEYS.code(normalizeCode(code))))) return code;
  }
  throw new Error("could not make a unique code");
}

export async function getCode(ns: ArNamespace, code: string): Promise<LootCode | null> {
  const n = normalizeCode(code);
  if (!n || n.length > 24) return null;
  return (await lootStore(ns)).getJSON<LootCode>(KEYS.code(n));
}

export async function putCode(ns: ArNamespace, c: LootCode): Promise<void> {
  const store = await lootStore(ns);
  await store.setJSON(KEYS.code(normalizeCode(c.code)), c);
  await store.update<string[]>(KEYS.recent(), (cur) => {
    const list = (cur ?? []).filter((x) => x !== c.code);
    list.unshift(c.code);
    return list.slice(0, RECENT_MAX);
  });
}

/** Expired codes read as such everywhere, without a cleanup job. */
export function isExpired(c: LootCode, now = Date.now()): boolean {
  return Date.parse(c.expiresAt) < now;
}
