// EVADE UGC Hub: sign-up import, quotas and uploads, magic links, isolation
// between creators, the live-link disclosure rule and status transitions.
// Run with `npm run test:ugc` (or `npm run test:hub`, which runs every suite).
// Runs with its cwd set to a throwaway directory, so .data/ is never touched.
import assert from "node:assert/strict";
import process from "node:process";

import {
  adminSetLiveUrl,
  markDelivered,
  markShipped,
  pipeline,
  review,
  saveCampaignInput,
  setCampaignStatus,
  shippingCsv,
  updateStatuses,
} from "@/lib/ugc/admin.server";
import {
  UGC_COOKIE,
  consumeUgcToken,
  createUgcSession,
  resolveUgcSession,
  ugcCaller,
} from "@/lib/ugc/auth.server";
import {
  briefFor,
  homeFor,
  profileFor,
  sendSignInLink,
  setLiveUrl,
  setShotTicks,
} from "@/lib/ugc/creator.server";
import {
  getCreator,
  getPii,
  listSubmissions,
  saveCreator,
  saveSubmission,
} from "@/lib/ugc/data.server";
import { mapSignup, normaliseFields, parseCsv, parseTrackingCsv, toCsv } from "@/lib/ugc/import";
import { importCsv, syncNetlifyForms } from "@/lib/ugc/import.server";
import {
  UGC,
  UGC_STATUSES,
  UGC_TRANSITIONS,
  aspectHint,
  aspectOf,
  canTransition,
  contentStatusFrom,
  liveUrlProblem,
  nextCreatorStatus,
  overQuota,
  sniffUgc,
  trackingUrlFor,
  ugcNextAction,
  ugcTimeline,
  type UgcCreator,
  type UgcSubmission,
} from "@/lib/ugc/model";
import { seedUgcSample } from "@/lib/ugc/sample.server";
import {
  completeUpload,
  initUpload,
  putChunk,
  serveAsset,
  servePoster,
  serveSubmission,
  uploadStatus,
} from "@/lib/ugc/uploads.server";

const ns = "dev" as const;
const ORIGIN = "http://localhost:3000";
const GiB = 1024 ** 3;
delete process.env.RESEND_API_KEY;
delete process.env.AR_ADMIN_PASSWORD;

/* ---------------------------------------------------------------------------
   1. Import mapping
   --------------------------------------------------------------------------- */

const FORM = {
  "form-name": "evade-ugc-creator",
  "contact-name": "Jamie Rivera",
  email: "  Jamie.Rivera@Example.com ",
  phone: "+1 555 0100",
  creator_name: "JamieJumps",
  country: "United States",
  platforms: "tiktok,roblox",
  main_platform: "tiktok",
  tiktok_handle: "@jamiejumps",
  tiktok_audience: "10K–50K",
  roblox_handle: "JamieJumps",
  roblox_audience: "1K–10K",
  instagram_handle: "",
  address_line1: "1 Main St",
  address_line2: "Apt 2",
  city: "Austin",
  region: "TX",
  postal_code: "78701",
  address_country: "",
  notes: "Love Cola Run",
  consent: "yes",
  source: "landing",
  page: "/evade/creators/?c=abc",
  utm_source: "tiktok",
  utm_campaign: "launch",
};

{
  const m = mapSignup(normaliseFields(FORM), {
    kind: "netlify-form",
    submissionId: "sub1",
    submittedAt: 1000,
  });
  assert.ok(m.ok);
  const { creator, pii } = m.signup;
  assert.equal(creator.email, "jamie.rivera@example.com");
  assert.equal(creator.name, "Jamie Rivera");
  assert.equal(creator.creatorName, "JamieJumps");
  assert.deepEqual(creator.platforms, ["roblox", "tiktok"], "form order");
  assert.equal(creator.mainPlatform, "tiktok");
  assert.deepEqual(creator.handles, { roblox: "JamieJumps", tiktok: "@jamiejumps" });
  assert.equal(creator.audiences.tiktok, "10K–50K");
  assert.deepEqual(creator.consent, { contact: true, at: 1000 });
  assert.deepEqual(creator.source.utm, { source: "tiktok", campaign: "launch" });
  assert.equal(creator.source.page, "/evade/creators/?c=abc");
  assert.equal(pii.phone, "+1 555 0100");
  assert.deepEqual(pii.address, {
    name: "Jamie Rivera",
    line1: "1 Main St",
    line2: "Apt 2",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "United States", // falls back to `country`
  });
  // headers from a CSV export, in other spellings
  const f = normaliseFields({
    "Contact Name": "A B",
    Email: "a@b.co",
    "Postal Code": "1",
    "bot field": "",
  });
  assert.equal(f["contact-name"], "A B");
  assert.equal(f.postal_code, "1");
  assert.equal(
    mapSignup({ ...f, "bot-field": "x" }, { kind: "csv", submissionId: null }).ok,
    false,
    "honeypot",
  );
  assert.equal(
    mapSignup({ email: "nope" }, { kind: "csv", submissionId: null }).ok,
    false,
    "bad email",
  );
}

// CSV round trip and formula safety
{
  const csv = toCsv(
    ["a", "b"],
    [
      ["=SUM(1)", 'he said "hi", ok'],
      ["x\ny", ""],
    ],
  );
  assert.deepEqual(parseCsv(csv), [
    ["a", "b"],
    ["'=SUM(1)", 'he said "hi", ok'],
    ["x\ny", ""],
  ]);
  assert.deepEqual(parseTrackingCsv("Email,Carrier,Tracking\nA@x.co,UPS,1Z9\n"), [
    { email: "a@x.co", carrier: "UPS", tracking: "1Z9", url: "" },
  ]);
  assert.deepEqual(parseTrackingCsv("a@x.co,USPS,94001")[0].tracking, "94001", "no header");
  assert.match(trackingUrlFor("usps", "9400 1")!, /tools\.usps\.com.*9400%201/);
  assert.equal(trackingUrlFor("Some Courier", "1"), null);
}

// Import: CSV idempotency, then Netlify sync (mocked API) idempotency + delete
{
  const header = Object.keys(FORM).filter((k) => k !== "form-name");
  const rowA = header.map((k) => FORM[k as keyof typeof FORM]);
  const rowB = header.map((k) =>
    k === "email" ? "other@example.com" : FORM[k as keyof typeof FORM],
  );
  const csv = toCsv(
    ["id", "created_at", ...header],
    [
      ["csv-row-1", "2026-10-01T10:00:00Z", ...rowA],
      ["", "2026-10-02T10:00:00Z", ...rowB],
    ],
  );
  const first = await importCsv(ns, csv);
  assert.equal(first.created, 2);
  const again = await importCsv(ns, csv);
  assert.equal(again.created, 0, "re-import creates nothing");
  assert.equal(again.duplicates, 2);
  assert.ok(
    again.rows.every((r) => r.result === "duplicate-submission"),
    "matched by id / fingerprint",
  );

  // not configured
  delete process.env.NETLIFY_API_TOKEN;
  delete process.env.NETLIFY_SITE_ID;
  delete process.env.SITE_ID;
  const nc = await syncNetlifyForms(ns);
  assert.equal(nc.configured, false);
  assert.ok(!nc.configured && nc.missing.includes("NETLIFY_API_TOKEN"));

  process.env.NETLIFY_API_TOKEN = "test-token";
  process.env.NETLIFY_SITE_ID = "site-1";
  const deleted: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
    if (url.endsWith("/sites/site-1/forms"))
      return Response.json([
        { id: "f0", name: "contact" },
        { id: "f1", name: UGC.formName },
      ]);
    if (url.includes("/forms/f1/submissions"))
      return Response.json([
        {
          id: "n1",
          created_at: "2026-10-05T00:00:00Z",
          data: { ...FORM, email: "new.person@example.com" },
        },
        { id: "n2", created_at: "2026-10-06T00:00:00Z", data: FORM }, // same email as the CSV row
        {
          id: "n3",
          created_at: "2026-10-07T00:00:00Z",
          data: { ...FORM, email: "spam@example.com", "bot-field": "x" },
        },
      ]);
    if (init?.method === "DELETE") {
      deleted.push(url.split("/").pop()!);
      return new Response(null, { status: 204 });
    }
    return new Response("nope", { status: 500 });
  }) as typeof fetch;
  const s1 = await syncNetlifyForms(ns, { deleteAfterImport: true });
  assert.ok(s1.configured && "rows" in s1, JSON.stringify(s1));
  if (s1.configured && "rows" in s1) {
    assert.equal(s1.formId, "f1");
    assert.deepEqual(
      s1.rows.map((r) => r.result),
      ["created", "duplicate-email", "skipped"],
    );
    assert.deepEqual(deleted, ["n1", "n2"], "deletes imported ones, not spam");
  }
  const s2 = await syncNetlifyForms(ns);
  assert.ok(s2.configured && "rows" in s2 && s2.created === 0, "sync is idempotent");
  globalThis.fetch = realFetch;
  const p = await pipeline(ns);
  assert.equal(p.counts.applied, 3);
}

/* ---------------------------------------------------------------------------
   2. Status transitions
   --------------------------------------------------------------------------- */

for (const s of UGC_STATUSES) assert.ok(!canTransition(s, s), `${s} → itself`);
assert.ok(canTransition("applied", "approved"));
assert.ok(!canTransition("applied", "shipped"), "can't skip ahead");
assert.ok(canTransition("paused", "content-due"), "resume to anywhere");
assert.ok(UGC_TRANSITIONS.posted.includes("approved-content"), "undo posted");
assert.equal(contentStatusFrom([]), null);
assert.equal(
  contentStatusFrom([{ status: "in-review" }, { status: "changes-requested" }]),
  "changes-requested",
);
assert.equal(
  contentStatusFrom([{ status: "approved" }, { status: "rejected" }]),
  "approved-content",
);
assert.equal(nextCreatorStatus("content-due", [{ status: "in-review" }]), "submitted");
assert.equal(nextCreatorStatus("submitted", [{ status: "rejected" }]), "content-due");
assert.equal(nextCreatorStatus("shipped", [{ status: "uploading" }]), "shipped");
assert.equal(nextCreatorStatus("paused", [{ status: "posted" }]), "paused", "paused is sticky");

/* ---------------------------------------------------------------------------
   3. A campaign, approval and magic links
   --------------------------------------------------------------------------- */

const camp = await saveCampaignInput(ns, {
  title: "Test campaign",
  drop: "Keychain",
  shots: [
    { label: "The scan reveal", required: true },
    { label: "Unbox", required: false },
  ],
  hashtags: ["EVADE", "#ad"],
  deadline: Date.now() + 5 * 86_400_000,
});
assert.ok(camp.ok);
const campaignId = camp.ok ? camp.campaign.id : "";
assert.deepEqual(camp.ok && camp.campaign.shots.map((s) => s.id), ["the-scan-reveal", "unbox"]);
assert.deepEqual(camp.ok && camp.campaign.hashtags, ["#EVADE", "#ad"]);
const live = await setCampaignStatus(ns, ORIGIN, campaignId, "live");
assert.ok(live.ok && live.campaign.version === 1, "publishing bumps to v1");
const edited = await saveCampaignInput(ns, { id: campaignId, keyMessages: ["Scan it"] });
assert.ok(
  edited.ok && edited.bumped && edited.campaign.version === 2,
  "editing a live brief bumps",
);
const same = await saveCampaignInput(ns, { id: campaignId, keyMessages: ["Scan it"] });
assert.ok(same.ok && !same.bumped, "no-op edit doesn't bump");

const applied = (await pipeline(ns, { status: "applied" })).creators;
const [aId, bId] = [applied[0].id, applied[1].id];

// an applicant can't get a sign-in link
const c0 = await getCreator(ns, aId);
assert.deepEqual(await sendSignInLink(ns, ORIGIN, c0!.email), { sent: false });

// applied → shipped isn't a step; force allows it
const bad = await updateStatuses(ns, ORIGIN, { ids: [aId], status: "shipped" });
assert.equal(bad[0].ok, false);

const approved = await updateStatuses(ns, ORIGIN, { ids: [aId, bId], status: "approved" });
assert.ok(
  approved.every((r) => r.ok && r.devLink),
  "join link returned in dev without RESEND_API_KEY",
);
const A = (await getCreator(ns, aId))!;
const B = (await getCreator(ns, bId))!;
assert.deepEqual(A.campaignIds, [campaignId], "the only live campaign is assigned on approval");
assert.ok(A.approvedAt);

const joinToken = new URL(approved[0].devLink!).searchParams.get("token")!;
const consumed = await consumeUgcToken(ns, joinToken);
assert.ok(consumed.ok && consumed.creator.id === aId && consumed.kind === "join");
assert.equal((await consumeUgcToken(ns, joinToken)).ok, false, "single use");
assert.equal((await consumeUgcToken(ns, "short")).ok, false);

const link = await sendSignInLink(ns, ORIGIN, A.email.toUpperCase(), "/ugc-hub/upload");
assert.ok(link.devLink?.startsWith(`${ORIGIN}/ugc-hub/auth?token=`));
const login = await consumeUgcToken(ns, new URL(link.devLink!).searchParams.get("token")!);
assert.ok(login.ok && login.kind === "login" && login.next === "/ugc-hub/upload");
const evil = await sendSignInLink(ns, ORIGIN, A.email, "https://evil.example/");
const evilT = await consumeUgcToken(ns, new URL(evil.devLink!).searchParams.get("token")!);
assert.ok(evilT.ok && evilT.next === null, "off-site next is dropped");

const sessA = await createUgcSession(ns, aId);
const sessB = await createUgcSession(ns, bId);
assert.equal((await resolveUgcSession(ns, sessA.cookie))?.creator.id, aId);
assert.equal(await resolveUgcSession(ns, sessA.cookie.slice(0, -2) + "xx"), null, "tampered");
const reqAs = (cookie: string, init: RequestInit = {}) =>
  new Request("http://localhost/x", {
    ...init,
    headers: { cookie: `${UGC_COOKIE}=${cookie}`, "x-ugc": "1", ...(init.headers ?? {}) },
  });
const callerA = (await ugcCaller(ns, reqAs(sessA.cookie)))!;
const callerB = (await ugcCaller(ns, reqAs(sessB.cookie)))!;
assert.equal(callerA.kind, "creator");
assert.equal(await ugcCaller(ns, new Request("http://localhost/x")), null);

/* ---------------------------------------------------------------------------
   4. Uploads: limits, quota, sniffing
   --------------------------------------------------------------------------- */

const init = async (c: typeof callerA, body: object) => {
  const res = await initUpload(ns, c, { target: "submission", mime: "video/mp4", ...body });
  return {
    status: res.status,
    body: (await res.json()) as { id: string; chunks: number; error?: string },
  };
};

assert.equal((await init(callerA, { name: "x.mp4", size: 2 * GiB + 1 })).status, 413, "over 2 GB");
assert.equal((await init(callerA, { name: "x.exe", size: 100, mime: "" })).status, 415, "type");
const big1 = await init(callerA, { name: "a.mp4", size: 2 * GiB });
assert.equal(big1.status, 201);
assert.equal(big1.body.chunks, 512);
const big2 = await init(callerA, { name: "b.mov", size: 2 * GiB, mime: "video/quicktime" });
assert.equal(big2.status, 201);
const over = await init(callerA, { name: "c.mp4", size: 1.5 * GiB });
assert.equal(over.status, 413, "past 5 GB in total");
assert.match(over.body.error!, /5 GB/);
const fits = await init(callerA, { name: "d.mp4", size: 1 * GiB });
assert.equal(fits.status, 201, "exactly 5 GB is allowed");

// two uploads that raced past init: the later one is refused on its chunks
const subsA = await listSubmissions(ns, aId);
const racer = subsA.find((s) => s.id === fits.body.id)!;
await saveSubmission(ns, { ...racer, id: "racer00001", createdAt: racer.createdAt + 1 });
assert.ok(overQuota(await listSubmissions(ns, aId), "racer00001"));
const raceRes = await putChunk(
  ns,
  callerA,
  "racer00001",
  0,
  reqAs(sessA.cookie, { method: "PUT", body: new Uint8Array(10) }),
);
// "racer00001" has no upload pointer, so it 404s: write the pointer the way init does
assert.ok(raceRes.status === 404 || raceRes.status === 413);
{
  const { ugcStore, UKEYS } = await import("@/lib/ugc/store.server");
  await (
    await ugcStore(ns)
  ).setJSON(UKEYS.upload("racer00001"), {
    id: "racer00001",
    target: "submission",
    creatorId: aId,
    campaignId,
    createdAt: Date.now(),
  });
  const r = await putChunk(
    ns,
    callerA,
    "racer00001",
    0,
    reqAs(sessA.cookie, { method: "PUT", body: new Uint8Array(UGC.chunkBytes) }),
  );
  assert.equal(r.status, 413, "quota re-checked on each chunk");
}
// free the space again
{
  const { deleteSubmission } = await import("@/lib/ugc/data.server");
  for (const s of await listSubmissions(ns, aId)) await deleteSubmission(ns, s);
}

// magic bytes
const mp4Head = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
]);
assert.ok(sniffUgc("video/mp4", mp4Head));
assert.ok(!sniffUgc("video/mp4", new TextEncoder().encode("<html><script>....")));
assert.ok(
  sniffUgc("video/quicktime", new Uint8Array([0, 0, 0, 8, 0x77, 0x69, 0x64, 0x65, 0, 0, 0, 0])),
);
assert.ok(
  sniffUgc(
    "image/heic",
    new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]),
  ),
);
assert.ok(!sniffUgc("image/heic", mp4Head), "an mp4 isn't a HEIC");

const fake = await init(callerA, { name: "fake.mp4", size: 64 });
const fakeRes = await putChunk(
  ns,
  callerA,
  fake.body.id,
  0,
  reqAs(sessA.cookie, { method: "PUT", body: new TextEncoder().encode("<html>".padEnd(64, " ")) }),
);
assert.equal(fakeRes.status, 415, "renamed file refused on its first chunk");
assert.equal((await uploadStatus(ns, callerA, fake.body.id)).status, 404, "and discarded");

// a real (tiny) upload end to end
const video = new Uint8Array(100);
video.set(mp4Head);
const up = await init(callerA, {
  name: "scan.mp4",
  size: 100,
  shotIds: ["the-scan-reveal", "bogus"],
  width: 1080,
  height: 1920,
  platform: "tiktok",
});
assert.equal(up.status, 201);
assert.equal(
  (
    await putChunk(
      ns,
      callerA,
      up.body.id,
      0,
      reqAs(sessA.cookie, { method: "PUT", body: video.slice(0, 50) }),
    )
  ).status,
  400,
  "wrong size",
);
assert.equal((await completeUpload(ns, callerA, up.body.id)).status, 409, "missing chunk");
assert.equal(
  (await putChunk(ns, callerA, up.body.id, 0, reqAs(sessA.cookie, { method: "PUT", body: video })))
    .status,
  204,
);
const st = (await (await uploadStatus(ns, callerA, up.body.id)).json()) as { received: number[] };
assert.deepEqual(st.received, [0], "resume status");
const done = (await (await completeUpload(ns, callerA, up.body.id)).json()) as {
  submission: UgcSubmission;
};
assert.equal(done.submission.status, "in-review");
assert.deepEqual(done.submission.shotIds, ["the-scan-reveal"], "unknown shots dropped");
assert.equal(done.submission.aspect, "9:16");
assert.equal((await getCreator(ns, aId))!.status, "submitted", "creator moves to submitted");
const subId = up.body.id;

/* ---------------------------------------------------------------------------
   5. Isolation: one creator can't read another's things
   --------------------------------------------------------------------------- */

const opts = { download: false, head: false, range: null };
assert.equal((await serveSubmission(ns, callerA, subId, opts)).status, 200);
assert.equal(
  (await serveSubmission(ns, callerB, subId, opts)).status,
  403,
  "B can't stream A's video",
);
assert.equal((await serveSubmission(ns, null, subId, opts)).status, 401);
assert.equal((await servePoster(ns, callerB, subId)).status, 403);
assert.equal((await uploadStatus(ns, callerB, subId)).status, 403);
assert.equal(
  (await putChunk(ns, callerB, subId, 0, reqAs(sessB.cookie, { method: "PUT", body: video })))
    .status,
  403,
);
const ranged = await serveSubmission(ns, callerA, subId, { ...opts, range: "bytes=4-7" });
assert.equal(ranged.status, 206);
assert.equal(new TextDecoder().decode(await ranged.arrayBuffer()), "ftyp");
assert.equal(ranged.headers.get("x-content-type-options"), "nosniff");

const Bnow = (await getCreator(ns, bId))!;
assert.equal(
  (
    await setLiveUrl(ns, Bnow, {
      submissionId: subId,
      url: "https://x.com/a",
      disclosureConfirmed: true,
    })
  ).ok,
  false,
  "B can't touch A's submission",
);
const profB = await profileFor(ns, Bnow);
assert.equal(profB.creator.id, bId);
assert.ok(!("source" in profB.creator), "import internals aren't sent to creators");
assert.equal(profB.address?.line1, "1 Main St");
// a brief asset on a campaign B isn't on
const other = await saveCampaignInput(ns, { title: "Other" });
await setCampaignStatus(ns, ORIGIN, other.ok ? other.campaign.id : "", "live");
assert.equal(
  (await serveAsset(ns, callerB, other.ok ? other.campaign.id : "", "assetxxxx1", opts)).status,
  403,
);
assert.equal(
  (
    await initUpload(ns, callerA, {
      target: "asset",
      campaignId,
      name: "a.png",
      size: 10,
      mime: "image/png",
    })
  ).status,
  403,
  "creators can't add brief assets",
);

/* ---------------------------------------------------------------------------
   6. Review, live link and the disclosure rule
   --------------------------------------------------------------------------- */

assert.equal(
  (await review(ns, ORIGIN, { submissionId: subId, decision: "changes" })).ok,
  false,
  "changes need a comment",
);
const ch = await review(ns, ORIGIN, {
  submissionId: subId,
  decision: "changes",
  comment: "Film it vertical",
});
assert.ok(ch.ok && ch.submission.comments.at(-1)?.author === "medialife");
assert.equal((await getCreator(ns, aId))!.status, "changes-requested");
const Anow = () => getCreator(ns, aId) as Promise<UgcCreator>;
assert.equal(
  (
    await setLiveUrl(ns, await Anow(), {
      submissionId: subId,
      url: "https://tiktok.com/@a/video/1",
      disclosureConfirmed: true,
    })
  ).ok,
  false,
  "not approved yet",
);
assert.ok((await review(ns, ORIGIN, { submissionId: subId, decision: "approve" })).ok);
assert.equal((await getCreator(ns, aId))!.status, "approved-content");
const noDisclosure = await setLiveUrl(ns, await Anow(), {
  submissionId: subId,
  url: "https://www.tiktok.com/@a/video/1",
  disclosureConfirmed: false,
});
assert.ok(!noDisclosure.ok && /#ad/.test(noDisclosure.error));
const httpOnly = await setLiveUrl(ns, await Anow(), {
  submissionId: subId,
  url: "http://www.tiktok.com/@a/video/1",
  disclosureConfirmed: true,
});
assert.equal(httpOnly.ok, false, "https only");
assert.equal(liveUrlProblem("javascript:alert(1)"), "Use the https:// link to your post.");
assert.equal(
  (
    await adminSetLiveUrl(ns, {
      submissionId: subId,
      url: "https://a.co/x",
      disclosureConfirmed: false,
    })
  ).ok,
  false,
);
const posted = await setLiveUrl(ns, await Anow(), {
  submissionId: subId,
  url: " https://www.tiktok.com/@a/video/1 ",
  disclosureConfirmed: true,
});
assert.ok(
  posted.ok && posted.submission.status === "posted" && posted.submission.disclosureConfirmed,
);
assert.equal((await getCreator(ns, aId))!.status, "posted");

/* ---------------------------------------------------------------------------
   7. Shipping, home and brief
   --------------------------------------------------------------------------- */

const shipped = await markShipped(ns, ORIGIN, [
  { creatorId: bId, carrier: "UPS", tracking: "1Z999" },
]);
assert.ok(shipped[0].ok);
assert.equal((await getCreator(ns, bId))!.status, "shipped");
let homeB = await homeFor(ns, (await getCreator(ns, bId))!);
assert.equal(homeB.nextAction.id, "on-its-way");
assert.match(homeB.nextAction.cta?.href ?? "", /ups\.com/);
assert.equal(homeB.timeline.find((s) => s.id === "shipped")?.state, "done");
assert.equal(homeB.timeline.find((s) => s.id === "delivered")?.state, "current");
await markDelivered(ns, [bId]);
const Bd = (await getCreator(ns, bId))!;
assert.equal(Bd.status, "content-due");
assert.ok((await getPii(ns, bId)).purgeAfter, "address purge scheduled after delivery");
homeB = await homeFor(ns, Bd);
assert.equal(homeB.nextAction.id, "film-and-upload");
const csvOut = await shippingCsv(ns, { onlyUnshipped: false });
assert.match(csvOut.csv.split("\r\n")[0], /^reference,name,address_line1/);
assert.equal(csvOut.count, 2);

const brief = await briefFor(ns, Bd);
assert.equal(brief?.lastSeenVersion, 0);
assert.equal((await briefFor(ns, Bd))?.lastSeenVersion, 2, "seen version recorded");
const ticks = await setShotTicks(ns, Bd, campaignId, ["unbox", "nope"]);
assert.ok(ticks.ok && ticks.tickedShotIds.join() === "unbox");
assert.deepEqual((await briefFor(ns, Bd))?.tickedShotIds, ["unbox"], "ticks persist");

// pure timeline helpers
const tl = ugcTimeline({
  creator: { status: "approved", approvedAt: 1 },
  campaign: null,
  shipment: null,
  submissions: [],
  perks: [],
});
assert.deepEqual(
  tl.slice(0, 2).map((s) => s.state),
  ["done", "current"],
);
assert.equal(
  ugcNextAction({
    creator: { status: "paused", approvedAt: 1 },
    campaign: null,
    shipment: null,
    submissions: [],
    perks: [],
  }).id,
  "paused",
);
assert.equal(aspectOf(1920, 1080), "16:9");
assert.equal(aspectHint("16:9", "9:16"), "Looks like 16:9. This brief asks for 9:16.");

// declining ends sessions
await updateStatuses(ns, ORIGIN, { ids: [bId], status: "declined", force: true });
assert.equal(await resolveUgcSession(ns, sessB.cookie), null, "declined creators are signed out");
await saveCreator(ns, { ...(await getCreator(ns, bId))!, status: "content-due" });

/* ---------------------------------------------------------------------------
   8. Sample data loads (art files are skipped outside the repo; that's fine)
   --------------------------------------------------------------------------- */

await assert.rejects(() => seedUgcSample("prod"), "never in production");
const seeded = await seedUgcSample(ns);
assert.equal(seeded.created, true);
assert.equal((await seedUgcSample(ns)).created, false, "seed is idempotent");
const pl = await pipeline(ns);
assert.ok(pl.creators.filter((c) => c.sample).length >= 8);
const zoe = pl.creators.find((c) => c.email === "zoe.sample@medialife.test")!;
const zoeHome = await homeFor(ns, (await getCreator(ns, zoe.id))!);
assert.equal(zoeHome.timeline.at(-1)?.state, "done", "posted + perk: the timeline is complete");
assert.ok(zoeHome.perks.length >= 1);
const reset = await seedUgcSample(ns, { reset: true });
assert.equal(reset.created, true);

console.log("ugc: all assertions passed");
