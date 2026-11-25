// Who can play what in Bobo's Arcade (the fan side of src/lib/collector/unlocks.ts, which holds the model, the
// default rules and the missions; this file only reads them).
//
// A machine is open when its rule says "open", or the fan has ANY ONE of its ways:
//   merch      a product they unlocked with its code (POST /api/collector/unlock, the same claim the Collector Hub
//              uses: first email to use a code owns it; email + code signs them in again on any phone)
//   challenge  a mission flag another experience set on this phone (localStorage)
// The rules come from /api/collector/unlocks.json (the team edits them in /admin/collector) with the built-in
// defaults as the fallback, so the hub works offline and in `vite dev` without the site's server.
//
// The team hub (/labs/evade-hub/, or ?team) skips every rule: all machines open, as the hub always was.
import {
  CHALLENGES,
  challengeById,
  cleanUnlocks,
  defaultUnlocks,
  ruleFor,
  type Challenge,
  type UnlockConfig,
  type UnlockMode,
  type UnlockWay,
} from '../../../src/lib/collector/unlocks';
import { ROOMS, normalizeCode, formatCode, type CollectorMe } from '../../../src/lib/collector/model';

export { CHALLENGES, formatCode, normalizeCode };
export type { Challenge };

const ROOM = ROOMS.evade;
/** Same key the Collector Hub (hub-core.js, Cola Run's BOBO OS) keeps its sign-in under, so one sign-in covers both. */
const SESSION_KEY = `ml.collector.${ROOM.id}.session`;
/** Machines this phone has already seen open (so a newly opened one gets its moment once). */
const SEEN_KEY = 'evade-hub-seen-open';

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/** Team view: /labs/evade-hub/ (Labs) or ?team. Everything open, nothing to unlock. */
export const TEAM = typeof location !== 'undefined' && (/^\/labs\//.test(location.pathname) || q.has('team'));

const ls = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ?resetunlocks (testing): forget the missions, the sign-in and the "seen" list on this phone
if (q.has('resetunlocks')) {
  for (const c of CHALLENGES) if (c.flag) ls.set(c.flag, null);
  ls.set(SESSION_KEY, null);
  ls.set(SEEN_KEY, null);
}

interface Session { token: string; me?: CollectorMe; email?: string; codes?: string[] }

function readSession(): Session | null {
  try {
    const s = JSON.parse(ls.get(SESSION_KEY) || 'null');
    return s && typeof s.token === 'string' ? s : null;
  } catch { return null; }
}
function writeSession(s: Session | null) { ls.set(SESSION_KEY, s ? JSON.stringify(s) : null); }

// ------------------------------------------------------------------ state + change feed
let cfg: UnlockConfig = defaultUnlocks(ROOM.id);
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; subs.forEach((f) => { try { f(); } catch { /* listener */ } }); };
/** Changes every time what's open may have changed (sign-in, a claim, rules loaded). Cheap to poll per frame. */
export const unlockVersion = () => version;
export function onUnlocksChange(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); }

const timeoutFetch = (url: string, init: RequestInit = {}, ms = 7000) => {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => ctl?.abort(), ms);
  return fetch(url, { ...init, signal: ctl?.signal }).finally(() => clearTimeout(t));
};

let loading: Promise<void> | null = null;
/** Rules + the fan's sign-in. Never rejects; call as often as you like (one load per page). */
export function loadUnlocks(): Promise<void> {
  return (loading ||= (async () => {
    if (TEAM) return;
    const products = ROOM.products.map((p) => p.id);
    const [rules] = await Promise.all([
      timeoutFetch(`/api/collector/unlocks.json?room=${ROOM.id}`, { cache: 'no-cache' })
        .then((r) => (r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null))
        .catch(() => null),
      refreshMe(),
    ]);
    if (rules) cfg = cleanUnlocks(rules, products, ROOM.id);
    bump();
  })());
}

/** Re-check the saved sign-in against the site (offline keeps what we had). */
async function refreshMe(): Promise<void> {
  const s = readSession();
  if (!s) return;
  try {
    const r = await timeoutFetch(`/api/collector/me?room=${ROOM.id}`, { headers: { authorization: `Bearer ${s.token}` } });
    if (r.status === 401) { writeSession(null); return; }
    if (!r.ok) return;
    const j = await r.json();
    if (j?.me) writeSession({ ...s, me: j.me });
  } catch { /* offline */ }
}

// ------------------------------------------------------------------ what the fan has
export function ownedProducts(): Set<string> {
  return new Set((readSession()?.me?.items ?? []).map((i) => i.product));
}
export const signedInEmail = (): string | null => readSession()?.email ?? null;
export const isSignedIn = (): boolean => !!readSession();
export const knownCodes = (): string[] => readSession()?.codes ?? [];

const flagDone = (c: Challenge) => !!c.flag && ls.get(c.flag) === '1';
export function challengeDone(id: string): boolean {
  const c = challengeById(id);
  if (!c) return false;
  if (c.count) return CHALLENGES.filter((x) => x.flag && flagDone(x)).length >= c.count;
  return flagDone(c);
}
/** For "count" missions: how many of the flag missions are done. */
export const missionsDone = () => CHALLENGES.filter((x) => x.flag && flagDone(x)).length;

export function signOut() { writeSession(null); bump(); }

// ------------------------------------------------------------------ per machine
export interface WayState {
  way: UnlockWay;
  done: boolean;
  /** What to do, in a sentence ("Unlock your Bobo × Eclipse keychain with its code"). */
  label: string;
  /** Short chip text. */
  short: string;
  /** merch: the product isn't out yet; challenge: the machine to play for it. */
  released?: boolean;
  play?: string;
}

export interface Access {
  mode: UnlockMode;
  locked: boolean;
  ways: WayState[];
  note?: string;
}

const productName = (id: string) => ROOM.products.find((p) => p.id === id);

export function wayState(w: UnlockWay): WayState {
  if (w.kind === 'merch') {
    const p = productName(w.product);
    const name = p ? (p.secret ? 'the mystery drop' : p.name) : w.product;
    const released = !!p?.released;
    return {
      way: w,
      done: ownedProducts().has(w.product),
      released,
      label: released ? `Unlock your ${name} with the code that came with it` : `Comes with the ${name} (coming soon)`,
      short: released ? `Got the ${p?.id === 'keychain' ? 'keychain' : name}` : `${name}: soon`,
    };
  }
  const c = challengeById(w.id);
  return {
    way: w,
    done: challengeDone(w.id),
    label: c?.task ?? w.id,
    short: c?.short ?? w.id,
    play: c?.play,
  };
}

export function accessFor(id: string): Access {
  if (TEAM) return { mode: 'open', locked: false, ways: [] };
  const rule = cfg.openAll ? { mode: 'open' as const } : ruleFor(cfg, id);
  const ways = (rule.ways ?? []).map(wayState);
  const locked = rule.mode === 'locked' && !ways.some((w) => w.done);
  return { mode: rule.mode, locked, ways, note: rule.note };
}

// ------------------------------------------------------------------ "newly opened" moments
/** Machines open now that this phone hasn't seen open before (then remembers them). First visit: remembers silently. */
export function takeNewlyOpened(openIds: string[]): string[] {
  if (TEAM) return [];
  const raw = ls.get(SEEN_KEY);
  const seen = new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  const fresh = openIds.filter((id) => !seen.has(id));
  ls.set(SEEN_KEY, JSON.stringify([...new Set([...seen, ...openIds])]));
  return raw ? fresh : [];
}
/** Remember these as seen (after a claim celebrated them in the sheet). */
export function markSeen(ids: string[]) {
  if (TEAM) return;
  let seen: string[] = [];
  try { seen = JSON.parse(ls.get(SEEN_KEY) || '[]'); } catch { /* reset */ }
  ls.set(SEEN_KEY, JSON.stringify([...new Set([...seen, ...ids])]));
}

// ------------------------------------------------------------------ claiming a code
export type ClaimResult =
  | { ok: true; firstClaim: boolean; products: string[]; code: string }
  | { ok: false; message: string; field?: 'code' | 'email' };

export async function claimCode(codeIn: string, emailIn: string): Promise<ClaimResult> {
  const code = normalizeCode(codeIn);
  if (!code) return { ok: false, field: 'code', message: 'Codes look like BOBO-XXXX-XXXX. Check each character on your card.' };
  const email = emailIn.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, field: 'email', message: 'Enter the email you want your merch linked to.' };
  let j: { ok: boolean; token?: string; me?: CollectorMe; firstClaim?: boolean; code?: string; message?: string; error?: string };
  try {
    const r = await timeoutFetch('/api/collector/unlock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: ROOM.id, code, email }),
    }, 12000);
    j = await r.json();
  } catch {
    return { ok: false, message: "Couldn't reach EVADE's servers. Check your connection and try again." };
  }
  if (!j.ok || !j.token || !j.me) {
    return { ok: false, field: j.error === 'bad-email' ? 'email' : j.error === 'bad-code' || j.error === 'taken' ? 'code' : undefined, message: j.message || 'That didn\'t work. Try again.' };
  }
  const prev = readSession();
  const codes = [...new Set([...(prev?.codes ?? []), j.code || formatCode(code)])].slice(-20);
  writeSession({ token: j.token, me: j.me, email, codes });
  bump();
  return { ok: true, firstClaim: !!j.firstClaim, products: j.me.items.map((i) => i.product), code: j.code || formatCode(code) };
}

/** A code handed to the hub in its URL (?hub= from a QR / NFC tag, or ?code=), removed from the address bar. */
export function takeUrlCode(): string | null {
  if (typeof location === 'undefined') return null;
  const u = new URL(location.href);
  const raw = u.searchParams.get('hub') || u.searchParams.get('code');
  if (!raw) return null;
  u.searchParams.delete('hub');
  u.searchParams.delete('code');
  try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch { /* sandboxed */ }
  const c = normalizeCode(raw);
  return c ? formatCode(c) : raw.slice(0, 20);
}

export const PRODUCTS = ROOM.products;

/** ?from= value experiences get, so their home button (public/evade/arcade/back.js) returns to the right hub. */
export const launchFrom = () => (TEAM ? 'evade-hub-team' : 'evade-hub');
