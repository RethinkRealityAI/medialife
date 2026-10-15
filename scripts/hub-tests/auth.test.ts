// Creator Hub account primitives. Run with `npm run test:hub`.
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
  claimEmail,
  saveUser,
  findUserByEmail,
  createSession,
  resolveSession,
  endAllSessions,
  issueToken,
  consumeToken,
  rateLimit,
  publicOrigin,
  type HubUser,
} from "@/lib/hub/auth.server";

// runs with its cwd set to a throwaway directory (see scripts/test-hub.mjs)
const ns = "dev" as const;

const h = await hashPassword("correct horse battery");
assert.ok(await verifyPassword("correct horse battery", h));
assert.ok(!(await verifyPassword("wrong", h)));
assert.ok(!(await verifyPassword("x", null)));
assert.equal(passwordProblem("short"), "Use at least 10 characters.");
assert.equal(passwordProblem("a@b.co.uk1", "A@b.co.uk1"), "Don't use your email as your password.");

assert.ok(await claimEmail(ns, "Fan@Example.com", "u1"));
assert.ok(
  !(await claimEmail(ns, "fan@example.com ", "u2")),
  "second claim on same email (normalised) fails",
);
const user: HubUser = {
  id: "u1",
  email: "fan@example.com",
  emailVerified: false,
  passwordHash: h,
  discord: null,
  creatorId: "c1",
  createdAt: 0,
  lastLoginAt: null,
  disabled: false,
};
await saveUser(ns, user);
assert.equal((await findUserByEmail(ns, "FAN@example.com"))?.id, "u1");

const s1 = await createSession(ns, "u1");
const s2 = await createSession(ns, "u1");
assert.equal((await resolveSession(ns, s1.cookie))?.user.id, "u1");
assert.equal(
  await resolveSession(
    ns,
    s1.cookie.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
  ),
  null,
  "tampered signature rejected",
);
assert.equal(await resolveSession(ns, "garbage"), null);
await endAllSessions(ns, "u1", s2.cookie.split(".")[0]);
assert.equal(await resolveSession(ns, s1.cookie), null, "other sessions ended");
assert.ok(await resolveSession(ns, s2.cookie), "kept session survives");

const tok = await issueToken(ns, "reset", user);
assert.equal(await consumeToken(ns, "verify", tok), null, "wrong kind rejected (and consumed)");
const tok2 = await issueToken(ns, "reset", user);
assert.equal((await consumeToken(ns, "reset", tok2))?.id, "u1");
assert.equal(await consumeToken(ns, "reset", tok2), null, "single use");

let allowed = 0;
for (let i = 0; i < 5; i++) if (await rateLimit(ns, "t", "k", 3, 60_000)) allowed++;
assert.equal(allowed, 3);

const req = (host: string) =>
  new Request(`http://${host}/x`, { headers: { "x-forwarded-host": host } });
assert.equal(publicOrigin(req("evil.com"), "prod"), "https://medialife.ai");
assert.equal(
  publicOrigin(req("evil.com"), "preview"),
  "https://medialife.ai",
  "untrusted preview host is not used in emails",
);
assert.equal(
  publicOrigin(req("deploy-preview-12--medialife.netlify.app"), "preview"),
  "https://deploy-preview-12--medialife.netlify.app",
);
console.log("auth: all assertions passed");
