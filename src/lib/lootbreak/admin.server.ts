import type { ArNamespace } from "@/lib/ar/store.server";

import {
  isExpired,
  getCode,
  getSettings,
  KEYS,
  lootStore,
  putCode,
  saveSettings,
} from "./store.server";
import type { LootCode, LootSettings } from "./model";

// The team's side of LOOT BREAK rewards: see and check codes, mark them used,
// verify bonus-quest follows, and edit the campaign. Called only from admin
// server functions (signed-in admin).

/** The overview loads this many of the newest codes; the CSV export loads all. */
const OVERVIEW_MAX = 400;

export type AdminCode = LootCode & { expired: boolean };

const withExpiry = (c: LootCode): AdminCode => ({ ...c, expired: isExpired(c) });

async function loadCodes(ns: ArNamespace, codes: string[]): Promise<AdminCode[]> {
  const out: AdminCode[] = [];
  for (let i = 0; i < codes.length; i += 40) {
    const part = await Promise.all(codes.slice(i, i + 40).map((c) => getCode(ns, c)));
    for (const c of part) if (c) out.push(withExpiry(c));
  }
  return out;
}

export async function lootOverview(ns: ArNamespace) {
  const store = await lootStore(ns);
  const [settings, recent] = await Promise.all([
    getSettings(ns),
    store.getJSON<string[]>(KEYS.recent()).then((r) => r ?? []),
  ]);
  const codes = await loadCodes(ns, recent.slice(0, OVERVIEW_MAX));
  const live = (c: AdminCode) => c.status === "active" && !c.expired;
  const players = new Set(codes.map((c) => c.emailHash));
  return {
    ns,
    settings,
    total: recent.length,
    shown: codes.length,
    stats: {
      players: players.size,
      live: codes.filter(live).length,
      redeemed: codes.filter((c) => c.status === "redeemed").length,
      toVerify: codes.filter((c) => c.kind === "quest" && !c.verified && live(c)).length,
      consent: new Set(codes.filter((c) => c.consent).map((c) => c.emailHash)).size,
    },
    codes,
  };
}

/** Every code, newest first, for the CSV export. */
export async function lootExport(ns: ArNamespace): Promise<AdminCode[]> {
  const recent = (await (await lootStore(ns)).getJSON<string[]>(KEYS.recent())) ?? [];
  return loadCodes(ns, recent);
}

export async function lootLookup(ns: ArNamespace, code: string): Promise<AdminCode | null> {
  const c = await getCode(ns, code);
  return c ? withExpiry(c) : null;
}

export type CodeAction = "redeem" | "unredeem" | "void" | "reactivate" | "verify" | "unverify";

export async function lootAction(
  ns: ArNamespace,
  code: string,
  action: CodeAction,
  note?: string,
): Promise<AdminCode> {
  const c = await getCode(ns, code);
  if (!c) throw new Error("No such code");
  const now = new Date().toISOString();
  let next: LootCode = { ...c };
  switch (action) {
    case "redeem":
      if (c.status === "void") throw new Error("This code was cancelled. It can't be used.");
      if (c.status === "redeemed") throw new Error("Already used.");
      next = { ...c, status: "redeemed", redeemedAt: now };
      break;
    case "unredeem":
      next = { ...c, status: "active", redeemedAt: undefined };
      break;
    case "void":
      next = { ...c, status: "void" };
      break;
    case "reactivate":
      if (c.replacedBy) throw new Error(`Replaced by ${c.replacedBy}. Use that code instead.`);
      next = { ...c, status: "active" };
      break;
    case "verify":
    case "unverify":
      if (c.kind !== "quest") throw new Error("Only bonus-quest codes are verified.");
      next = { ...c, verified: action === "verify" };
      break;
  }
  if (note !== undefined) next.note = note.trim().slice(0, 200) || undefined;
  await putCode(ns, next);
  return withExpiry(next);
}

export async function lootSaveSettings(ns: ArNamespace, s: Partial<LootSettings>) {
  return saveSettings(ns, { ...(await getSettings(ns)), ...s });
}
