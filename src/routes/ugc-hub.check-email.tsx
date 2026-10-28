import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Loader2, MailCheck, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AuthCard, UgcAuthShell } from "@/components/ugc/creator/auth-shell";
import { DEV_LINK_KEY, rememberDevLink, safeUgcNext } from "@/components/ugc/creator/email-form";
import { btnGhost, btnGold, eyebrow } from "@/components/ugc/shared/look";
import { requestUgcSignInLink } from "@/lib/ugc/auth.functions";
import { UGC, UGC_ROUTES } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ugc-hub/check-email")({
  validateSearch: z.object({
    email: z.string().max(254).optional().catch(undefined),
    next: z.string().max(300).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Check your email · EVADE UGC Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: CheckEmail,
});

const COOLDOWN = 30;

function CheckEmail() {
  const { email, next } = Route.useSearch();
  const [devLink, setDevLink] = useState<string | null>(null);
  const [wait, setWait] = useState(COOLDOWN);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      setDevLink(sessionStorage.getItem(DEV_LINK_KEY));
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function resend() {
    if (!email || busy || wait > 0) return;
    setBusy(true);
    try {
      const r = await requestUgcSignInLink({ data: { email, next: safeUgcNext(next) } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Sent a fresh link");
        rememberDevLink(r.devLink);
        setDevLink(r.devLink);
        setWait(COOLDOWN);
      }
    } catch {
      toast.error("Couldn't send. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const changeHref = `${UGC_ROUTES.signIn}?${new URLSearchParams({
    ...(email ? { email } : {}),
    ...(safeUgcNext(next) ? { next: safeUgcNext(next)! } : {}),
  })}`;

  return (
    <UgcAuthShell>
      <AuthCard>
        <span className="relative inline-grid size-14 place-items-center rounded-2xl bg-[#3fe6e0]/10 text-[#3fe6e0] ring-1 ring-[#3fe6e0]/35 ring-inset">
          <MailCheck className="size-7" aria-hidden />
          <span
            aria-hidden
            className="absolute -top-1 -right-1 size-3 rounded-full bg-[#f6c344] shadow-[0_0_0_3px_#0b1318]"
          />
        </span>
        <div className={cn(eyebrow, "mt-5")}>Check your inbox</div>
        <h1 className="mt-2.5 text-[30px] leading-[1.02] font-bold tracking-[-0.04em] text-balance">
          Your sign-in link is on its way
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#c9d1d8]" aria-live="polite">
          {email ? (
            <>
              If <strong className="font-semibold break-all text-foreground">{email}</strong> is in
              the crew, a link is waiting in your inbox.
            </>
          ) : (
            "If that email is in the crew, a link is waiting in your inbox."
          )}{" "}
          It works once and expires in 30 minutes.
        </p>

        <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="text-[#3fe6e0]">
              ·
            </span>
            Open it on the phone or computer you want to use.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-[#3fe6e0]">
              ·
            </span>
            Not there? Check spam or Promotions. It comes from MEDIALIFE.
          </li>
        </ul>

        {devLink ? (
          <div className="mt-6 rounded-2xl border border-dashed border-amber-400/50 bg-amber-400/[0.06] p-4">
            <div className="font-mono text-[10px] tracking-[0.18em] text-amber-300 uppercase">
              Dev only · no email sent
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Email isn't set up here, so open the link directly.
            </p>
            <a href={devLink} className={cn(btnGold, "mt-3 w-full")}>
              Open sign-in link <ExternalLink aria-hidden />
            </a>
          </div>
        ) : null}

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={resend}
            disabled={!email || busy || wait > 0}
            className={btnGhost}
          >
            {busy ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden />
            ) : (
              <RotateCw aria-hidden />
            )}
            {wait > 0 ? <span className="tabular-nums">Resend in {wait}s</span> : "Send it again"}
          </button>
          <a href={changeHref} className={btnGhost}>
            Use a different email
          </a>
        </div>
      </AuthCard>
      <p className="mt-6 px-2 text-center text-sm text-muted-foreground">
        Still stuck? Write to{" "}
        <a
          href={`mailto:${UGC.supportEmail}`}
          className="font-medium text-[#bff7f4] underline decoration-[#3fe6e0]/40 underline-offset-4"
        >
          {UGC.supportEmail}
        </a>
      </p>
    </UgcAuthShell>
  );
}
