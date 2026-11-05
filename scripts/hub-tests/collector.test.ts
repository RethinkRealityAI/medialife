// Collector Hub: code format, batch codes (regenerable, findable, never stored
// in plain text), the unlock flow (claim, sign in again, taken, paused, test
// code, rate limits), owner tokens, alerts and the CSV.
// Run with `npm run test:hub collector`. Runs in a throwaway directory.
import assert from "node:assert/strict";

import {
  batchCodes,
  batchCsv,
  createBatch,
  deleteAlert,
  handleAlertsFeed,
  listAlerts,
  sendAlert,
  setBatchStatus,
} from "@/lib/collector/admin.server";
import { CODE_ALPHABET, formatCode, maskEmail, normalizeCode } from "@/lib/collector/model";
import {
  KEYS,
  collectorStore,
  issueOwnerToken,
  verifyOwnerToken,
} from "@/lib/collector/store.server";
import { handleMe, handleUnlock } from "@/lib/collector/unlock.server";

const NS = "dev" as const;
let ipN = 0;
const unlock = (body: unknown, ip = `10.0.0.${++ipN % 250}`) =>
  handleUnlock(
    NS,
    new Request("http://localhost/api/collector/unlock", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nf-client-connection-ip": ip },
      body: JSON.stringify(body),
    }),
  );
const me = (token?: string) =>
  handleMe(
    NS,
    new Request("http://localhost/api/collector/me?room=evade", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  );

let passed = 0;
async function t(name: string, fn: () => Promise<void> | void) {
  await fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("collector");

await t("code format: normalise, reject look-alikes, format", () => {
  assert.equal(CODE_ALPHABET.length, 31);
  assert.equal(normalizeCode("bobo-k7rm 9xqc"), "BOBOK7RM9XQC");
  assert.equal(normalizeCode("K7RM9XQC"), "BOBOK7RM9XQC");
  assert.equal(normalizeCode("BOBO-K7RM-9XQ0"), null); // 0 isn't in the alphabet
  assert.equal(normalizeCode("BOBO-K7RM-9XQ"), null);
  assert.equal(formatCode("BOBOK7RM9XQC"), "BOBO-K7RM-9XQC");
  assert.equal(maskEmail("jordan@gmail.com"), "j•••••@gmail.com");
});

let batchKeyA = "";
let codes: { serial: number; code: string; url: string; claimed: boolean }[] = [];
await t("batch: codes are unique, regenerable and not stored", async () => {
  const b = await createBatch(NS, {
    room: "evade",
    product: "keychain",
    label: "Test run",
    count: 300,
    experienceUrl: "https://medialife.ai/labs/collector-hub/",
  });
  batchKeyA = b.key;
  assert.match(b.key, /^[2-9A-Z]{2}$/);
  const data = await batchCodes(NS, b.key);
  assert.ok(data);
  codes = data.rows;
  assert.equal(codes.length, 300);
  assert.equal(new Set(codes.map((r) => r.code)).size, 300);
  for (const r of codes) assert.ok(normalizeCode(r.code), r.code);
  const again = await batchCodes(NS, b.key);
  assert.deepEqual(
    again!.rows.map((r) => r.code),
    codes.map((r) => r.code),
  );
  const index = JSON.stringify(await (await collectorStore(NS)).getJSON(KEYS.index(b.key)));
  assert.ok(!index.includes(normalizeCode(codes[0].code)!.slice(4)), "index must not hold codes");
  assert.ok(codes[0].url.includes("hub=BOBO-"), codes[0].url);
  const csv = batchCsv(data.batch, codes);
  assert.ok(csv.startsWith("serial,code,claim_url,product,batch,claimed\r\n00001,BOBO-"));
  // a second batch gets a different key
  const b2 = await createBatch(NS, {
    room: "evade",
    product: "keychain",
    label: "",
    count: 1,
    experienceUrl: "https://medialife.ai/x",
  });
  assert.notEqual(b2.key, b.key);
});

let token = "";
await t("unlock: first claim owns the code and returns a working token", async () => {
  const r = await unlock({
    room: "evade",
    code: codes[41].code.toLowerCase(),
    email: "Fan@Example.com ",
  });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.firstClaim, true);
  assert.equal(j.me.items[0].product, "keychain");
  assert.equal(j.me.items[0].serial, 42);
  assert.equal(j.me.owned, 1);
  assert.equal(j.me.total, 5);
  assert.equal(j.me.email, "f••@example.com");
  token = j.token;
  const m = await me(token);
  assert.equal(m.status, 200);
  assert.equal((await m.json()).me.items.length, 1);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
});

await t("unlock: same email + code signs back in (the code is the password)", async () => {
  const j = await (
    await unlock({ room: "evade", code: codes[41].code, email: "fan@example.com" })
  ).json();
  assert.equal(j.ok, true);
  assert.equal(j.firstClaim, false);
  assert.equal(j.me.items.length, 1, "no duplicate item");
});

await t("unlock: someone else's email is refused", async () => {
  const r = await unlock({ room: "evade", code: codes[41].code, email: "friend@example.com" });
  assert.equal(r.status, 409);
  assert.equal((await r.json()).error, "taken");
});

await t("unlock: wrong, malformed and paused codes", async () => {
  const wrong = codes[5].code.slice(0, -1) + (codes[5].code.endsWith("Z") ? "Y" : "Z");
  assert.equal((await (await unlock({ code: wrong, email: "a@b.co" })).json()).error, "bad-code");
  assert.equal((await (await unlock({ code: "hello", email: "a@b.co" })).json()).error, "bad-code");
  assert.equal(
    (await (await unlock({ code: codes[5].code, email: "nope" })).json()).error,
    "bad-email",
  );
  await setBatchStatus(NS, batchKeyA, "paused");
  assert.equal(
    (await (await unlock({ code: codes[6].code, email: "c@d.co" })).json()).error,
    "paused",
  );
  await setBatchStatus(NS, batchKeyA, "active");
  assert.equal((await (await unlock({ code: codes[6].code, email: "c@d.co" })).json()).ok, true);
  const listed = await batchCodes(NS, batchKeyA);
  assert.equal(listed!.rows.filter((r) => r.claimed).length, 2);
});

await t("test code: any email, keychain #00412, marked as a test", async () => {
  for (const email of ["team1@medialife.ai", "team2@medialife.ai"]) {
    const j = await (await unlock({ code: "BOBO-TEST-CATS", email })).json();
    assert.equal(j.ok, true, JSON.stringify(j));
    assert.equal(j.me.items[0].serial, 412);
    assert.equal(j.me.items[0].test, true);
    // the room's whole collection comes along, with the secret drop's name kept secret
    assert.equal(j.me.collection.products.length, 5);
    assert.equal(j.me.collection.reward, "The Golden Bobo");
    assert.equal(
      j.me.collection.products.find((p: { id: string }) => p.id === "mystery").name,
      "Mystery drop",
    );
  }
  const again = await (
    await unlock({ code: "bobo test cats", email: "team1@medialife.ai" })
  ).json();
  assert.equal(again.firstClaim, false);
});

await t("rate limit: 20 tries per IP per 15 minutes", async () => {
  let last = 0;
  for (let i = 0; i < 21; i++)
    last = (await unlock({ code: "BOBO-2222-2222", email: `x${i}@y.co` }, "9.9.9.9")).status;
  assert.equal(last, 429);
});

await t("tokens: tampered or missing tokens are refused", async () => {
  assert.equal((await me()).status, 401);
  assert.equal((await me(token.slice(0, -2) + "xx")).status, 401);
  const eh = await verifyOwnerToken(NS, token);
  assert.ok(eh);
  const expired = await issueOwnerToken(NS, eh!, Date.now() - 200 * 864e5);
  assert.equal(await verifyOwnerToken(NS, expired), null);
});

await t("alerts: send, list newest first, safe links only, delete, feed", async () => {
  const a = await sendAlert(NS, {
    room: "evade",
    kind: "drop",
    title: "Hoodie drop",
    body: "Friday",
    linkLabel: "Shop",
    linkUrl: "javascript:alert(1)",
  });
  assert.equal(a.linkUrl, undefined);
  const b = await sendAlert(NS, {
    room: "evade",
    kind: "event",
    title: "Cola Run weekend",
    body: "",
    linkLabel: "Play",
    linkUrl: "/evade/cola-run-lab/",
  });
  assert.equal(b.linkUrl, "/evade/cola-run-lab/");
  assert.deepEqual(
    (await listAlerts(NS, "evade")).map((x) => x.id),
    [b.id, a.id],
  );
  const feed = await handleAlertsFeed(
    NS,
    new Request("http://localhost/api/collector/alerts.json?room=evade"),
  );
  assert.equal(feed.headers.get("netlify-cache-tag"), "collector-alerts-evade");
  assert.equal((await feed.json()).alerts.length, 2);
  await deleteAlert(NS, "evade", a.id);
  assert.equal((await listAlerts(NS, "evade")).length, 1);
});

console.log(`  ${passed} passed`);
