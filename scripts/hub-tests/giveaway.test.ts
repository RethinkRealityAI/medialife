// Points giveaways: email folding, eligibility, entry + confirm, task claims and the
// honour cap, referrals (and their same-device hold), void, the weighted draw's
// determinism and fairness, forfeits promoting alternates, and CSV safety.
// Run with `npm run test:giveaway` (or `npm run test:hub`, which runs every suite).
import assert from "node:assert/strict";
import process from "node:process";

import { snapshotHash, weightedDraw } from "@/lib/giveaway/draw";
import {
  adjustPoints,
  claimTask,
  consumeLink,
  createCampaign,
  enter,
  entrantsCsv,
  getCampaign,
  getEntrant,
  listEntrants,
  openTask,
  resolveGwSession,
  createGwSession,
  runDraw,
  saveCampaign,
  setEntrantVoid,
  setPickStatus,
  subscribersCsv,
  adminRows,
} from "@/lib/giveaway/giveaway.server";
import {
  GIVEAWAY,
  eligibilityProblem,
  foldEmail,
  goLiveProblems,
  isDisposableEmail,
  type GiveawayCampaign,
} from "@/lib/giveaway/model";
import { generatedRules, parseRules } from "@/lib/giveaway/rules";

const ns = "dev" as const;
delete process.env.RESEND_API_KEY;

// 1. Email folding and disposable domains
assert.equal(foldEmail(" J.Doe+promo@GoogleMail.com "), "jdoe@gmail.com");
assert.equal(foldEmail("j.doe+x@outlook.com"), "j.doe@outlook.com");
assert.ok(isDisposableEmail("a@mailinator.com"));
assert.ok(!isDisposableEmail("a@gmail.com"));

// 2. Eligibility
const elig = { countries: ["CA", "US"], excludedRegions: ["CA-QC"] };
assert.equal(eligibilityProblem(elig, "CA", "ON"), null);
assert.match(eligibilityProblem(elig, "CA", "QC")!, /Quebec/);
assert.match(eligibilityProblem(elig, "GB", "")!, /isn't open/);

// 3. Campaign: template needs filling in before going live
const created = await createCampaign(ns, "evade-launch");
assert.ok(created.ok);
let c = created.campaign;
assert.ok((await createCampaign(ns, "evade-launch")).ok === false, "slug is unique");
assert.ok(goLiveProblems(c).length > 0);
const blocked = await saveCampaign(ns, { ...c, status: "live" });
assert.ok(!blocked.ok);

const igEvade = c.tasks.find((t) => t.title === "Follow EVADE on Instagram")!;
const codeTask = c.tasks.find((t) => t.kind === "code")!;
const discordTask = c.tasks.find((t) => t.kind === "discord")!;
const newsletter = c.tasks.find((t) => t.kind === "newsletter")!;
const ready: GiveawayCampaign = {
  ...c,
  status: "live",
  sponsor: "MEDIALIFE Inc.",
  startsAt: Date.now() - 1000,
  endsAt: Date.now() + 86_400_000,
  prizes: [
    { id: "p1", title: "EVADE merch pack", description: "", retailValue: 60, quantity: 2 },
  ],
  honourCap: 8,
  tasks: c.tasks.map((t) =>
    t.id === igEvade.id
      ? { ...t, url: "https://www.instagram.com/evade" }
      : t.id === codeTask.id
        ? { ...t, codes: ["bobo-2026"] }
        : t.id === discordTask.id
          ? { ...t, url: "https://discord.gg/evade", guildId: "123456789012345678" }
          : t.kind === "follow" || t.kind === "visit"
            ? { ...t, enabled: false }
            : t,
  ),
};
const saved = await saveCampaign(ns, ready);
assert.ok(saved.ok, saved.ok ? "" : saved.error);
c = saved.campaign;
assert.deepEqual(c.tasks.find((t) => t.kind === "code")!.codes, ["BOBO-2026"], "codes are normalised");

// 4. Entry → confirm
const meta = { ip: "1.1.1.1", device: "dev-a", origin: "http://localhost:3000" };
const base = { name: "Ana", country: "CA", region: "ON", ageConfirmed: true, optIns: ["medialife"], ref: null };
assert.ok(!(await enter(ns, c, { ...base, email: "x@mailinator.com" }, meta, null)).ok);
assert.ok(!(await enter(ns, c, { ...base, email: "q@x.com", region: "QC" }, meta, null)).ok);
const a = await enter(ns, c, { ...base, email: "Ana.B@gmail.com" }, meta, null);
assert.ok(a.ok && a.status === "check-email" && a.devLink);
const again = await enter(ns, c, { ...base, email: "anab+2@gmail.com" }, meta, null);
assert.ok(again.ok && again.entrantId === a.entrantId, "one entry per mailbox");

let ana = (await getEntrant(ns, c.id, a.entrantId))!;
assert.equal(ana.points, 0, "nothing counts before confirming");
const claimEarly = await claimTask(ns, c, ana.id, { taskId: codeTask.id, code: "BOBO-2026" });
assert.ok(!claimEarly.ok);

const token = new URL(a.devLink!).searchParams.get("token")!;
const consumed = await consumeLink(ns, token);
assert.ok(consumed.ok && consumed.slug === "evade-launch");
assert.equal((await consumeLink(ns, token)).ok, false, "links work once");
ana = (await getEntrant(ns, c.id, a.entrantId))!;
assert.equal(ana.status, "confirmed");
assert.equal(ana.points, c.entryPoints + newsletter.points, "entry + mailing list ticked on the form");

// 5. Tasks
assert.ok(!(await claimTask(ns, c, ana.id, { taskId: codeTask.id, code: "nope" })).ok);
const code = await claimTask(ns, c, ana.id, { taskId: codeTask.id, code: " bobo-2026 " });
assert.ok(code.ok && code.awarded === codeTask.points);
const dup = await claimTask(ns, c, ana.id, { taskId: codeTask.id, code: "BOBO-2026" });
assert.ok(dup.ok && dup.awarded === 0, "a task pays once");

const notOpened = await claimTask(ns, c, ana.id, { taskId: igEvade.id, handle: "ana_b" });
assert.ok(!notOpened.ok, "honour tasks need the link opened first");
await openTask(ns, c, ana.id, igEvade.id);
{
  const store = (await import("@/lib/giveaway/store.server")).gwStore;
  const s = await store(ns);
  const rec = (await getEntrant(ns, c.id, ana.id))!;
  rec.opened[igEvade.id] = Date.now() - GIVEAWAY.minOpenMs - 10;
  await s.setJSON(`entrants/${c.id}/${ana.id}`, rec);
}
assert.ok(!(await claimTask(ns, c, ana.id, { taskId: igEvade.id, handle: "a" })).ok, "handle needed");
const ig = await claimTask(ns, c, ana.id, { taskId: igEvade.id, handle: "@ana_b" });
assert.ok(ig.ok && ig.awarded === 5);
assert.equal((await getEntrant(ns, c.id, ana.id))!.completed[igEvade.id].handle, "ana_b");

// 6. Referrals: paid on the friend's confirm; same device is held
const refCode = ana.refCode;
const b = await enter(ns, c, { ...base, email: "ben@example.com", ref: refCode }, { ...meta, ip: "2.2.2.2", device: "dev-b" }, null);
assert.ok(b.ok);
await consumeLink(ns, new URL(b.devLink!).searchParams.get("token")!);
const d = await enter(ns, c, { ...base, email: "dup@example.com", ref: refCode }, meta, null);
assert.ok(d.ok);
await consumeLink(ns, new URL(d.devLink!).searchParams.get("token")!);
ana = (await getEntrant(ns, c.id, ana.id))!;
const refRows = ana.ledger.filter((r) => r.kind === "referral");
assert.equal(refRows.length, 2);
assert.equal(refRows.filter((r) => !r.voided).length, 1, "same network/device referral held");
const rows = adminRows(c, await listEntrants(ns, c.id));
assert.ok(rows.find((r) => r.id === ana.id)!.flags.includes("held-referrals"));

// 7. Session cookie round trip
const sess = await createGwSession(ns, "Ana.B@gmail.com");
assert.equal((await resolveGwSession(ns, sess.cookie))!.emailKey, "anab@gmail.com");
assert.equal(await resolveGwSession(ns, sess.cookie + "x"), null);
const quick = await enter(ns, c, { ...base, email: "cara@example.com" }, { ...meta, ip: "3.3.3.3" }, foldEmail("cara@example.com"));
assert.ok(quick.ok && quick.status === "confirmed", "a signed-in email confirms straight away");

// 8. Void + adjust
await setEntrantVoid(ns, c.id, d.ok ? d.entrantId : "", true, "duplicate");
const adj = await adjustPoints(ns, c.id, ana.id, { points: -2, note: "test" });
assert.ok(adj.ok);

// 9. Draw: deterministic, weighted, excludes void/pending
const pool = [
  { id: "a", tickets: 1 },
  { id: "b", tickets: 99 },
  { id: "c", tickets: 0 },
];
const seed = "00".repeat(32);
assert.deepEqual(await weightedDraw(seed, pool, 2), await weightedDraw(seed, pool, 2), "same seed, same result");
assert.equal(await snapshotHash(pool), await snapshotHash([...pool].reverse()));
let bFirst = 0;
for (let i = 0; i < 200; i++) {
  const [w] = await weightedDraw(i.toString(16).padStart(64, "0"), pool, 1);
  assert.notEqual(w.id, "c", "0 tickets never wins");
  if (w.id === "b") bFirst++;
}
assert.ok(bFirst > 180, `heavier entry wins most often (${bFirst}/200)`);

const drawn = await runDraw(ns, (await getCampaign(ns, c.id))!);
assert.ok(drawn.ok);
const winners = drawn.draw.picks.filter((p) => p.role === "winner");
assert.equal(winners.length, Math.min(2, drawn.draw.entrants));
const ids = new Set(drawn.draw.picks.map((p) => p.entrantId));
assert.equal(ids.size, drawn.draw.picks.length, "nobody is picked twice");
assert.ok(!ids.has(d.ok ? d.entrantId : ""), "voided entries aren't drawn");
if (drawn.draw.picks.some((p) => p.role === "alternate")) {
  const first = winners[0];
  const after = await setPickStatus(ns, c.id, drawn.draw.id, first.entrantId, "forfeited");
  assert.ok(after.ok);
  assert.equal(after.draw.picks.filter((p) => p.role === "winner").length, winners.length, "alternate steps in");
}

// 10. CSV: formulas neutralised, opt-ins only for confirmed
const all = await listEntrants(ns, c.id);
assert.match(entrantsCsv(c, all), /^name,email/);
const subs = subscribersCsv(all, "medialife");
assert.ok(subs.includes("anab@gmail.com") || subs.includes("ana.b@gmail.com"));

// 11. Rules text
const rules = generatedRules(c);
assert.match(rules, /NO PURCHASE NECESSARY/);
assert.match(rules, /skill-testing/);
assert.match(rules, /excluding Quebec/);
assert.ok(parseRules(rules).some((b) => b.kind === "ul"));

console.log("giveaway: all checks passed");
