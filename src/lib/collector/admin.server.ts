import process from "node:process";

import type { ArNamespace } from "@/lib/ar/store.server";
import { purgeCacheTags } from "@/lib/ar/cdn.server";
import { newId } from "@/lib/hub/store.server";

import {
  ALERT_KINDS,
  cleanAlertLink,
  formatCode,
  roomById,
  type AlertKind,
  type AlertsFeed,
  type CollectorAlert,
} from "./model";
import {
  KEYS,
  TEST_CODE,
  batchKey,
  codeFor,
  codeHash,
  codeSecret,
  collectorStore,
  testCodeEnabled,
  type Batch,
} from "./store.server";

// The team's side of the Collector Hub: live alerts to every room, and batches
// of unlock codes for the factory. Called from admin server functions (signed-in
// admin only) and the admin CSV / QR-sheet routes.

const MAX_ALERTS = 30;
export const MAX_BATCH = 5000;

/* ── Alerts ──────────────────────────────────────────────────────────────── */

export const alertsTag = (room: string) => `collector-alerts-${room}`;

export async function listAlerts(ns: ArNamespace, room: string): Promise<CollectorAlert[]> {
  return (await (await collectorStore(ns)).getJSON<CollectorAlert[]>(KEYS.alerts(room))) ?? [];
}

export async function sendAlert(
  ns: ArNamespace,
  input: {
    room: string;
    kind: AlertKind;
    title: string;
    body: string;
    linkLabel?: string;
    linkUrl?: string;
  },
): Promise<CollectorAlert> {
  if (!roomById(input.room)) throw new Error("Unknown room");
  const kind = ALERT_KINDS.includes(input.kind) ? input.kind : "news";
  const linkUrl = cleanAlertLink(input.linkUrl);
  const alert: CollectorAlert = {
    id: newId(8),
    room: input.room,
    kind,
    title: input.title.trim().slice(0, 60),
    body: input.body.trim().slice(0, 180),
    ...(linkUrl ? { linkUrl, linkLabel: (input.linkLabel || "Open").trim().slice(0, 24) } : {}),
    at: new Date().toISOString(),
  };
  await (
    await collectorStore(ns)
  ).update<CollectorAlert[]>(KEYS.alerts(input.room), (cur) =>
    [alert, ...(cur ?? [])].slice(0, MAX_ALERTS),
  );
  await purgeCacheTags([alertsTag(input.room)]);
  return alert;
}

export async function deleteAlert(ns: ArNamespace, room: string, id: string) {
  await (
    await collectorStore(ns)
  ).update<CollectorAlert[]>(KEYS.alerts(room), (cur) => (cur ?? []).filter((a) => a.id !== id));
  await purgeCacheTags([alertsTag(room)]);
}

/** GET /api/collector/alerts.json?room=evade — public, polled by every open room. */
export async function handleAlertsFeed(ns: ArNamespace, request: Request): Promise<Response> {
  const room = roomById(new URL(request.url).searchParams.get("room") || "evade");
  if (!room) return new Response("unknown room", { status: 400 });
  const feed: AlertsFeed = { v: 1, room: room.id, alerts: await listAlerts(ns, room.id) };
  const body = JSON.stringify(feed);
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(body));
  const etag = `"${Buffer.from(d).toString("hex").slice(0, 20)}"`;
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    // Rooms poll every 15 s. The CDN holds a copy for 30 s and is purged the
    // moment the team sends, so a new alert reaches every room within one poll.
    "cache-control": "public, max-age=5, must-revalidate",
    "netlify-cdn-cache-control": "public, s-maxage=30, stale-while-revalidate=60",
    "netlify-cache-tag": alertsTag(room.id),
    "access-control-allow-origin": "*",
    etag,
  };
  if (request.headers.get("if-none-match") === etag)
    return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
}

/* ── Batches ─────────────────────────────────────────────────────────────── */

export type BatchSummary = Batch & { claimed: number };

export async function listBatches(ns: ArNamespace): Promise<BatchSummary[]> {
  const store = await collectorStore(ns);
  const keys = await store.list(KEYS.batches());
  const batches = (await Promise.all(keys.map((k) => store.getJSON<Batch>(k)))).filter(
    (b): b is Batch => !!b,
  );
  const out = await Promise.all(
    batches.map(async (b) => ({ ...b, claimed: (await store.list(KEYS.claims(b.key))).length })),
  );
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createBatch(
  ns: ArNamespace,
  input: { room: string; product: string; label: string; count: number; experienceUrl: string },
): Promise<Batch> {
  const secret = codeSecret(ns);
  if (!secret) throw new Error("Set COLLECTOR_CODE_SECRET on Netlify before making codes.");
  const room = roomById(input.room);
  const product = room?.products.find((p) => p.id === input.product);
  if (!room || !product) throw new Error("Pick a product.");
  const count = Math.round(input.count);
  if (!(count >= 1 && count <= MAX_BATCH))
    throw new Error(`A batch holds 1 to ${MAX_BATCH} codes.`);
  const url = cleanAlertLink(input.experienceUrl);
  if (!url || url.startsWith("/")) throw new Error("The experience URL must start with https://");

  const store = await collectorStore(ns);
  // Reserve a batch number; "TE" is the test code's prefix, so it's skipped.
  let key = "";
  await store.update<{ n: number }>(KEYS.counter(), (cur) => {
    let n = cur?.n ?? 0;
    key = batchKey(n);
    if (key === TEST_CODE.slice(4, 6)) key = batchKey(++n);
    return { n: n + 1 };
  });

  const index: Record<string, number> = {};
  for (let serial = 1; serial <= count; serial++)
    index[await codeHash(await codeFor(secret, key, serial))] = serial;
  await store.setJSON(KEYS.index(key), index);

  const batch: Batch = {
    key,
    room: room.id,
    product: product.id,
    label: input.label.trim().slice(0, 80) || `${product.name} batch ${key}`,
    count,
    status: "active",
    experienceUrl: url,
    createdAt: new Date().toISOString(),
  };
  await store.setJSON(KEYS.batch(key), batch);
  return batch;
}

export async function setBatchStatus(ns: ArNamespace, key: string, status: Batch["status"]) {
  const store = await collectorStore(ns);
  const b = await store.getJSON<Batch>(KEYS.batch(key));
  if (!b) throw new Error("Batch not found");
  await store.setJSON(KEYS.batch(key), { ...b, status });
}

export function claimUrl(batch: Batch, code: string) {
  const u = new URL(batch.experienceUrl);
  u.searchParams.set("hub", formatCode(code));
  return u.toString();
}

/** Every code of a batch, regenerated from the secret (never read from storage). */
export async function batchCodes(ns: ArNamespace, key: string) {
  const secret = codeSecret(ns);
  if (!secret) throw new Error("COLLECTOR_CODE_SECRET is not set");
  const store = await collectorStore(ns);
  const batch = await store.getJSON<Batch>(KEYS.batch(key));
  if (!batch) return null;
  const claimed = new Set(
    (await store.list(KEYS.claims(key))).map((k) => Number(k.split("/").pop())),
  );
  const rows: { serial: number; code: string; url: string; claimed: boolean }[] = [];
  for (let serial = 1; serial <= batch.count; serial++) {
    const code = await codeFor(secret, key, serial);
    rows.push({
      serial,
      code: formatCode(code),
      url: claimUrl(batch, code),
      claimed: claimed.has(serial),
    });
  }
  return { batch, rows };
}

export function batchCsv(
  batch: Batch,
  rows: { serial: number; code: string; url: string; claimed: boolean }[],
) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["serial,code,claim_url,product,batch,claimed"];
  for (const r of rows)
    lines.push(
      [
        String(r.serial).padStart(5, "0"),
        r.code,
        q(r.url),
        batch.product,
        batch.key,
        r.claimed ? "yes" : "no",
      ].join(","),
    );
  return lines.join("\r\n") + "\r\n";
}

/* ── Overview ────────────────────────────────────────────────────────────── */

export async function collectorOverview(ns: ArNamespace) {
  const store = await collectorStore(ns);
  const [alerts, batches, ownerKeys] = await Promise.all([
    listAlerts(ns, "evade"),
    listBatches(ns),
    store.list(KEYS.owners()),
  ]);
  return {
    ns,
    alerts,
    batches,
    owners: ownerKeys.length,
    testCode: testCodeEnabled(ns) ? formatCode(TEST_CODE) : null,
    codeSecretSet: !!process.env.COLLECTOR_CODE_SECRET,
    codesReady: codeSecret(ns) !== null,
  };
}
