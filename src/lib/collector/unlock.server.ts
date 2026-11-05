import process from "node:process";

import type { ArNamespace } from "@/lib/ar/store.server";
import { clientIp } from "@/lib/bobo/events.server";
import { publicOrigin, rateLimit } from "@/lib/hub/auth.server";

import {
  EMAIL_RE,
  formatCode,
  normalizeCode,
  normalizeEmail,
  roomById,
  type UnlockResult,
} from "./model";
import {
  KEYS,
  TEST_CODE,
  TEST_SERIAL,
  addItem,
  bearer,
  codeFor,
  codeHash,
  codeSecret,
  collectorStore,
  emailHash,
  issueOwnerToken,
  meFor,
  safeEqual,
  testCodeEnabled,
  verifyOwnerToken,
  type Batch,
  type Claim,
  type Owner,
} from "./store.server";

// POST /api/collector/unlock { room, code, email }
//
// One form does both jobs, so fans never have to know which one they need:
//   - an unclaimed code: it becomes theirs (first claim wins, for good), the
//     item lands in their room and we email them their key;
//   - a code they already claimed with this email: they're signed back in
//     (email + code is the password, on any device);
//   - a code claimed by a different email: refused. That's what keeps the hub
//     owners-only: one product, one room.
// Rate limited per IP and per email. Answers with a Bearer token the hub keeps.
//
// GET /api/collector/me (Bearer) → the fan's items in a room.

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
    },
  });

// Token in a header, never a cookie, so any origin may call (the Mattercraft
// experience runs on its own domain).
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-max-age": "86400",
};
export const preflight = () => new Response(null, { status: 204, headers: CORS });

const fail = (
  error: Exclude<UnlockResult, { ok: true }>["error"],
  message: string,
  status: number,
) => json({ ok: false, error, message } satisfies UnlockResult, status);

export async function handleUnlock(ns: ArNamespace, request: Request): Promise<Response> {
  let body: { room?: unknown; code?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "Something went wrong. Try again.", 400);
  }
  const room = roomById(typeof body.room === "string" ? body.room : "evade");
  if (!room) return fail("bad-request", "That room doesn't exist.", 400);
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  if (!EMAIL_RE.test(email) || email.length > 200)
    return fail("bad-email", "Enter the email you want your hideout linked to.", 400);
  const code = normalizeCode(typeof body.code === "string" ? body.code : "");
  if (!code)
    return fail(
      "bad-code",
      "Codes look like BOBO-XXXX-XXXX. Check the card that came with your merch.",
      400,
    );

  const ip = clientIp(request);
  if (
    !(await rateLimit(ns, "collector-unlock-ip", ip, 20, 15 * 60e3)) ||
    !(await rateLimit(ns, "collector-unlock-email", email, 10, 15 * 60e3))
  )
    return fail("rate-limited", "Too many tries. Wait 15 minutes and try again.", 429);

  const eh = await emailHash(email);
  const store = await collectorStore(ns);
  let firstClaim = false;
  let owner: Owner;

  try {
    if (code === TEST_CODE) {
      if (!testCodeEnabled(ns)) return fail("bad-code", "That code isn't valid.", 404);
      const before = await store.getJSON<Owner>(KEYS.owner(eh));
      firstClaim = !before?.rooms[room.id]?.some((i) => i.test);
      owner = await addItem(ns, email, eh, room.id, {
        product: "keychain",
        serial: TEST_SERIAL,
        test: true,
        claimedAt: new Date().toISOString(),
      });
    } else {
      const secret = codeSecret(ns);
      if (!secret)
        return fail("unavailable", "Unlocking is switched off right now. Try again later.", 503);
      const key = code.slice(4, 6);
      const batch = await store.getJSON<Batch>(KEYS.batch(key));
      const index = batch ? await store.getJSON<Record<string, number>>(KEYS.index(key)) : null;
      const serial = index?.[await codeHash(code)];
      if (!batch || serial == null || !safeEqual(await codeFor(secret, key, serial), code))
        return fail("bad-code", "That code isn't valid. Check each character on your card.", 404);
      if (batch.room !== room.id) return fail("bad-code", "That code opens a different room.", 404);
      if (batch.status !== "active")
        return fail("paused", "This code isn't active yet. Try again soon.", 409);

      const now = new Date().toISOString();
      const claim = await store.update<Claim>(
        KEYS.claim(key, serial),
        (cur) => cur ?? { emailHash: eh, at: now, product: batch.product, room: batch.room },
      );
      if (claim.emailHash !== eh)
        return fail(
          "taken",
          "This code is already linked to another email. Use the email you unlocked it with.",
          409,
        );
      firstClaim = claim.at === now;
      owner = await addItem(ns, email, eh, room.id, {
        product: batch.product,
        serial,
        claimedAt: claim.at,
      });
    }
  } catch (err) {
    console.error("[collector] unlock failed", err);
    return fail("unavailable", "Something went wrong on our side. Try again in a minute.", 500);
  }

  let token: string;
  try {
    token = await issueOwnerToken(ns, eh);
  } catch {
    return fail("unavailable", "Sign-in isn't set up on this site yet.", 503);
  }

  let emailed = false;
  if (firstClaim) {
    const url = `${publicOrigin(request, ns)}/labs/collector-hub/`;
    emailed = await sendKeyEmail(ns, email, formatCode(code), room.name, url);
  }

  return json({
    ok: true,
    token,
    me: meFor(owner, room.id),
    firstClaim,
    emailed,
    code: formatCode(code),
  } satisfies UnlockResult);
}

export async function handleMe(ns: ArNamespace, request: Request): Promise<Response> {
  const room = roomById(new URL(request.url).searchParams.get("room") || "evade");
  if (!room) return json({ error: "unknown room" }, 400);
  const eh = await verifyOwnerToken(ns, bearer(request));
  if (!eh) return json({ error: "signed-out" }, 401);
  const owner = await (await collectorStore(ns)).getJSON<Owner>(KEYS.owner(eh));
  if (!owner || !owner.rooms[room.id]?.length) return json({ error: "signed-out" }, 401);
  return json({ me: meFor(owner, room.id) });
}

/* ── Email ───────────────────────────────────────────────────────────────── */

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

async function sendKeyEmail(
  ns: ArNamespace,
  to: string,
  code: string,
  roomName: string,
  url: string,
) {
  const key = process.env.RESEND_API_KEY;
  const subject = `Your key to ${roomName}`;
  if (!key) {
    console.info(`[collector] email not sent (no RESEND_API_KEY) → ${to}: ${subject} ${code}`);
    return false;
  }
  const html = `<!doctype html><html><body style="margin:0;background:#070b1c;font-family:Helvetica,Arial,sans-serif;color:#eef3ff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070b1c;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0e1736;border:1px solid #1f3270;border-radius:14px">
<tr><td style="padding:28px 28px 0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#36e3ff">EVADE · MEDIALIFE Collector Hub</td></tr>
<tr><td style="padding:12px 28px 0;font-size:22px;font-weight:700;color:#ffffff">${esc(roomName)} is yours</td></tr>
<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#c4cdea">Your merch unlocked your own room with Bobo. To open it on any phone or computer, use this email and your code:</td></tr>
<tr><td style="padding:18px 28px 0"><div style="display:inline-block;font:700 22px/1 Menlo,Consolas,monospace;letter-spacing:.08em;color:#ffffff;background:#16245a;border:1px solid #36e3ff;border-radius:10px;padding:14px 18px">${esc(code)}</div></td></tr>
<tr><td style="padding:24px 28px"><a href="${esc(url)}" style="display:inline-block;background:#36e3ff;background-image:linear-gradient(90deg,#36e3ff,#ff4fa3);color:#041824;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px">Open my hideout</a></td></tr>
<tr><td style="padding:0 28px 28px;font-size:12px;line-height:1.6;color:#8d98bd">Keep this email: the code is your password for the hub. It only works with this email address. Didn't unlock anything? You can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${roomName} is yours.\n\nOpen it on any device with this email and your code: ${code}\n\n${url}\n\nKeep this email: the code is your password for the hub.`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.HUB_EMAIL_FROM || "MEDIALIFE <creators@medialife.ai>",
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok)
      console.error(`[collector] Resend ${res.status}: ${await res.text().catch(() => "")}`);
    return res.ok;
  } catch (err) {
    console.error("[collector] email failed", err);
    return false;
  }
}
