import { sendProgramEmail, type MailResult } from "@/lib/hub/mail.server";

import { UGC } from "./model";
import type { UgcNamespace } from "./store.server";

// UGC Hub emails, sent through the Creator Hub's mailer (Resend when
// RESEND_API_KEY is set). Without a key nothing is sent: on localhost and
// previews the link is logged and returned as `devLink`, so the UI can show it.

export type { MailResult };

const EYEBROW = "EVADE UGC Hub · MEDIALIFE";
const FOOTER =
  "You're getting this because you applied to the EVADE creator program, run by MEDIALIFE.";

export function sendJoinEmail(ns: UgcNamespace, to: string, name: string, url: string) {
  return sendProgramEmail(ns, to, {
    subject: "You're in: welcome to the EVADE creator program",
    eyebrow: EYEBROW,
    heading: `You're in${name ? `, ${name}` : ""}!`,
    body: "Your application was approved. Your EVADE package is being packed, and your brief, assets and upload space are waiting in the UGC Hub.\n\nThe button signs you in. No password needed.",
    cta: "Open the UGC Hub",
    url,
    footer: `${FOOTER} The link works for 7 days and only once; after that, sign in with your email.`,
  });
}

export function sendSignInEmail(ns: UgcNamespace, to: string, url: string) {
  return sendProgramEmail(ns, to, {
    subject: "Your EVADE UGC Hub sign-in link",
    eyebrow: EYEBROW,
    heading: "Sign in to the UGC Hub",
    body: "Tap the button to sign in. If you didn't ask for this, you can ignore it.",
    cta: "Sign in",
    url,
    footer: `${FOOTER} The link works for 30 minutes and only once.`,
  });
}

/** A notice with a link back into the hub (package shipped, review decision, brief updated). */
export function sendUgcNotice(
  ns: UgcNamespace,
  to: string,
  input: { subject: string; heading: string; body: string; cta: string; url: string },
) {
  return sendProgramEmail(ns, to, {
    ...input,
    eyebrow: EYEBROW,
    footer: `${FOOTER} Questions? Reply to ${UGC.supportEmail}.`,
  });
}
