// MEDIALIFE Collector Hub: shared shapes and rules (safe for the browser and
// the server). The hub is owners only: a fan unlocks their room with the code
// that ships with an activated product, plus their email. After that, email +
// code is their sign-in on any device.
//
// Codes look like BOBO-XXXX-XXXX. The 8 characters after the prefix use an
// alphabet with no look-alikes (no 0/O, 1/I/L), so they survive being read off a
// card. The first two characters name the batch; the last six are an HMAC of
// batch + serial (see codes.server.ts), so codes can be regenerated from the
// secret and are never stored in plain text.

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 31 characters
export const CODE_PREFIX = "BOBO";
export const CODE_BODY = 8;

/** "bobo-k7rm 9xqc" → "BOBOK7RM9XQC", or null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  let s = (input || "").toUpperCase().replace(/[\s\-_.]/g, "");
  if (s.startsWith(CODE_PREFIX)) s = s.slice(CODE_PREFIX.length);
  if (s.length !== CODE_BODY) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return CODE_PREFIX + s;
}

/** "BOBOK7RM9XQC" → "BOBO-K7RM-9XQC". */
export function formatCode(code: string): string {
  const b = code.startsWith(CODE_PREFIX) ? code.slice(CODE_PREFIX.length) : code;
  return `${CODE_PREFIX}-${b.slice(0, 4)}-${b.slice(4, 8)}`;
}

export const normalizeEmail = (e: string) => (e || "").trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** j••••@gmail.com, for showing who owns a room without printing the address. */
export function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!d) return "••••";
  return `${u.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
}

/* ── Rooms and their collections ─────────────────────────────────────────── */

export type CollectorProduct = {
  id: string;
  name: string;
  /** Short line shown on the card. */
  blurb: string;
  /** True once the product exists and codes can be made for it. */
  released: boolean;
  /** Name kept off the card until it's owned (a surprise drop). */
  secret?: boolean;
};

export type CollectorRoom = {
  id: string;
  name: string;
  ip: string;
  collection: { name: string; reward: string; rewardBlurb: string };
  products: CollectorProduct[];
};

export const ROOMS: Record<string, CollectorRoom> = {
  evade: {
    id: "evade",
    name: "Bobo's Hideout",
    ip: "EVADE",
    collection: {
      name: "EVADE Merch Collection",
      reward: "The Golden Bobo",
      rewardBlurb:
        "Collect the full set to unlock a golden Bobo for your room and early access to the next drop.",
    },
    products: [
      {
        id: "keychain",
        name: "Bobo × Eclipse keychain",
        blurb: "Bobo cat and Eclipse can charms, QR on the back of the can.",
        released: true,
      },
      { id: "hoodie", name: "EVADE hoodie", blurb: "Coming soon.", released: false },
      { id: "tee", name: "EVADE tee", blurb: "Coming soon.", released: false },
      { id: "deskmat", name: "Cola Run desk mat", blurb: "Coming soon.", released: false },
      {
        id: "mystery",
        name: "Mystery drop",
        blurb: "Nobody knows yet.",
        released: false,
        secret: true,
      },
    ],
  },
};

export const roomById = (id: string | null | undefined) => (id && ROOMS[id]) || null;

/* ── API shapes ──────────────────────────────────────────────────────────── */

export type OwnedItem = {
  product: string;
  serial: number;
  /** Test codes give every tester the same serial and say so. */
  test?: boolean;
  claimedAt: string;
};

export type CollectorMe = {
  room: string;
  email: string; // masked
  items: OwnedItem[];
  owned: number;
  total: number;
  complete: boolean;
  /** The room's collection, so the hub can draw every slot (secret names stay hidden until owned). */
  collection: CollectorRoom["collection"] & { products: CollectorProduct[] };
};

export type UnlockResult =
  | {
      ok: true;
      token: string;
      me: CollectorMe;
      /** True the first time this code was claimed (vs. signing in again). */
      firstClaim: boolean;
      emailed: boolean;
      code: string;
    }
  | { ok: false; error: UnlockError; message: string };

export type UnlockError =
  "bad-request" | "bad-code" | "bad-email" | "taken" | "paused" | "rate-limited" | "unavailable";

export type AlertKind = "drop" | "event" | "reward" | "news";
export const ALERT_KINDS: AlertKind[] = ["drop", "event", "reward", "news"];

export type CollectorAlert = {
  id: string;
  room: string;
  kind: AlertKind;
  title: string;
  body: string;
  linkLabel?: string;
  linkUrl?: string;
  at: string;
};

export type AlertsFeed = { v: 1; room: string; alerts: CollectorAlert[] };

/** Safe link for an alert button: https only (or a site-relative path). */
export function cleanAlertLink(url: string | undefined): string | undefined {
  const u = (url || "").trim();
  if (!u) return undefined;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : undefined;
  } catch {
    return undefined;
  }
}
