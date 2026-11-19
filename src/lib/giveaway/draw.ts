// The weighted draw: 1 point = 1 ticket, picks without replacement.
//
// Deterministic and reproducible: every random number is HMAC-SHA256(seed, "n")
// read as a 52-bit fraction, so anyone holding the seed and the ticket snapshot
// can run it again and get the same winners. Client-safe (WebCrypto only).

export type DrawEntry = { id: string; tickets: number };

async function hmacKey(seedHex: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(seedHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Uniform in [0, 1) for counter n. */
async function uniform(key: CryptoKey, n: number): Promise<number> {
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(n))),
  );
  // 52 bits: 6 full bytes + 4 bits
  let x = 0;
  for (let i = 0; i < 6; i++) x = x * 256 + sig[i];
  x = x * 16 + (sig[6] >> 4);
  return x / 2 ** 52;
}

/** The snapshot every draw is run over: entries with ≥1 ticket, sorted by id. */
export function snapshot(entries: DrawEntry[]): DrawEntry[] {
  return entries
    .filter((e) => Number.isFinite(e.tickets) && e.tickets >= 1)
    .map((e) => ({ id: e.id, tickets: Math.floor(e.tickets) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function snapshotHash(entries: DrawEntry[]): Promise<string> {
  const text = snapshot(entries)
    .map((e) => `${e.id}:${e.tickets}`)
    .join("\n");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Picks up to `count` distinct entries, each weighted by its tickets. */
export async function weightedDraw(
  seedHex: string,
  entries: DrawEntry[],
  count: number,
): Promise<DrawEntry[]> {
  const pool = snapshot(entries);
  const key = await hmacKey(seedHex);
  const picked: DrawEntry[] = [];
  let total = pool.reduce((s, e) => s + e.tickets, 0);
  for (let n = 0; picked.length < count && pool.length > 0; n++) {
    const target = (await uniform(key, n)) * total;
    let acc = 0;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      acc += pool[i].tickets;
      if (target < acc) {
        idx = i;
        break;
      }
    }
    const [hit] = pool.splice(idx, 1);
    total -= hit.tickets;
    picked.push(hit);
  }
  return picked;
}

export function newSeed(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

/** A simple multi-step maths question for the Canadian skill-testing requirement. */
export function skillQuestion(): { question: string; answer: number } {
  const r = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
  const a = r(11, 29);
  const b = r(3, 9);
  const c = r(10, 60);
  const d = r(2, 9);
  return { question: `(${a} × ${b}) + ${c} − ${d} = ?`, answer: a * b + c - d };
}
