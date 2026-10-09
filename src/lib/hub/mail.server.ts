import process from "node:process";

import type { HubNamespace } from "./store.server";

// Transactional email for the Creator Hub (verify email, reset password,
// "a proof is ready", "your application was approved").
//
// Sent through Resend's HTTP API when RESEND_API_KEY is set; the sender is
// HUB_EMAIL_FROM (default "MEDIALIFE Creator Hub <creators@medialife.ai>" — the
// domain must be verified in Resend). Without a key, nothing is sent: on
// localhost and deploy previews the link is handed back to the page instead so
// every flow can still be tested end to end; on production the page tells the
// creator to contact support rather than pretending an email went out.

export type MailResult =
  { sent: true } | { sent: false; reason: "not-configured" | "failed"; devLink?: string };

export function mailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** A plain, dark, brand-coloured email with one button. Renders in every client that matters. */
function layout({
  heading,
  body,
  cta,
  url,
  footer,
}: {
  heading: string;
  body: string;
  cta: string;
  url: string;
  footer: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:Helvetica,Arial,sans-serif;color:#ececf1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b10;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#121219;border:1px solid #26262f;border-radius:10px">
<tr><td style="padding:28px 28px 0;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8c8e9c">MEDIALIFE&trade; Creator Hub</td></tr>
<tr><td style="padding:12px 28px 0;font-size:22px;font-weight:600;color:#ffffff">${escape(heading)}</td></tr>
<tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6;color:#b9bac6">${body}</td></tr>
<tr><td style="padding:24px 28px"><a href="${escape(url)}" style="display:inline-block;background:#1f7fd1;background-image:linear-gradient(135deg,#1f7fd1,#c4207a);color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">${escape(cta)}</a></td></tr>
<tr><td style="padding:0 28px 28px;font-size:12px;line-height:1.6;color:#8c8e9c">${footer}<br><br>Button not working? Paste this into your browser:<br><span style="word-break:break-all;color:#b9bac6">${escape(url)}</span></td></tr>
</table></td></tr></table></body></html>`;
}

async function send(
  ns: HubNamespace,
  to: string,
  subject: string,
  html: string,
  text: string,
  link: string,
): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (ns !== "prod") {
      console.info(`[creator-hub] email not sent (no RESEND_API_KEY) → ${to}: ${subject}\n${link}`);
      return { sent: false, reason: "not-configured", devLink: link };
    }
    console.warn(`[creator-hub] RESEND_API_KEY is not set; could not email ${subject}`);
    return { sent: false, reason: "not-configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.HUB_EMAIL_FROM || "MEDIALIFE Creator Hub <creators@medialife.ai>",
        to: [to],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      console.error(`[creator-hub] Resend ${res.status}: ${await res.text().catch(() => "")}`);
      return { sent: false, reason: "failed", devLink: ns === "prod" ? undefined : link };
    }
    return { sent: true };
  } catch (err) {
    console.error("[creator-hub] email failed", err);
    return { sent: false, reason: "failed", devLink: ns === "prod" ? undefined : link };
  }
}

export function sendVerifyEmail(ns: HubNamespace, to: string, name: string, url: string) {
  const hi = name ? `Hi ${escape(name)},<br><br>` : "";
  return send(
    ns,
    to,
    "Confirm your email for the Creator Hub",
    layout({
      heading: "Confirm your email",
      body: `${hi}Confirm this address so we can reach you about your products, proofs and payouts.`,
      cta: "Confirm email",
      url,
      footer:
        "The link works for 7 days. If you didn't create a Creator Hub account, ignore this email.",
    }),
    `Confirm your email for the MEDIALIFE Creator Hub: ${url}\n\nThe link works for 7 days.`,
    url,
  );
}

export function sendResetEmail(ns: HubNamespace, to: string, url: string) {
  return send(
    ns,
    to,
    "Reset your Creator Hub password",
    layout({
      heading: "Reset your password",
      body: "Someone (hopefully you) asked to reset the password for this Creator Hub account.",
      cta: "Choose a new password",
      url,
      footer:
        "The link works for 1 hour and only once. If you didn't ask for this, you can ignore it — your password hasn't changed.",
    }),
    `Reset your MEDIALIFE Creator Hub password: ${url}\n\nThe link works for 1 hour.`,
    url,
  );
}

/** A notification with a link back into the hub: proof ready, application approved, stage changed. */
export function sendNotice(
  ns: HubNamespace,
  to: string,
  subject: string,
  heading: string,
  bodyText: string,
  url: string,
  cta: string,
) {
  return send(
    ns,
    to,
    subject,
    layout({
      heading,
      body: escape(bodyText),
      cta,
      url,
      footer: "You're getting this because you're in the MEDIALIFE Activated Merchandise Program.",
    }),
    `${heading}\n\n${bodyText}\n\n${url}`,
    url,
  );
}
