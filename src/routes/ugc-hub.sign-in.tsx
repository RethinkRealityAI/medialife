import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AuthCard, UgcAuthShell } from "@/components/ugc/creator/auth-shell";
import { EmailLinkForm, safeUgcNext } from "@/components/ugc/creator/email-form";
import { Notice } from "@/components/ugc/creator/kit";
import { eyebrow } from "@/components/ugc/shared/look";
import { getUgcSession } from "@/lib/ugc/auth.functions";
import { UGC, UGC_ROUTES } from "@/lib/ugc/model";

// Creator sign-in for the UGC Hub: magic link by email, no password.

export const Route = createFileRoute("/ugc-hub/sign-in")({
  validateSearch: z.object({
    next: z.string().max(300).optional().catch(undefined),
    email: z.string().max(254).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Sign in · EVADE UGC Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const session = await getUgcSession();
    if (session.signedIn) throw redirect({ href: safeUgcNext(search.next) ?? UGC_ROUTES.home });
    return { configured: session.configured };
  },
  component: SignIn,
});

function SignIn() {
  const { configured } = Route.useRouteContext();
  const { next, email } = Route.useSearch();
  return (
    <UgcAuthShell>
      <AuthCard>
        <div className={eyebrow}>Creator crew</div>
        <h1 className="mt-3 text-[30px] leading-[1.02] font-bold tracking-[-0.04em] text-balance">
          Sign in to your UGC Hub
        </h1>
        <p className="mt-2.5 text-[15px] leading-relaxed text-[#c9d1d8]">
          We'll email you a link. Tap it on this device and you're in.
        </p>
        {!configured ? (
          <Notice tone="warn" className="mt-6" title="Sign-in isn't open yet">
            Try again later, or write to{" "}
            <a className="underline underline-offset-4" href={`mailto:${UGC.supportEmail}`}>
              {UGC.supportEmail}
            </a>
            .
          </Notice>
        ) : null}
        <div className="mt-7">
          <EmailLinkForm next={next} defaultEmail={email ?? ""} autoFocus />
        </div>
      </AuthCard>
      <p className="mt-6 px-2 text-center text-sm leading-relaxed text-muted-foreground">
        Not in the crew yet?{" "}
        <a
          href="/evade/creators/#join"
          className="font-medium text-[#bff7f4] underline decoration-[#3fe6e0]/40 underline-offset-4 hover:decoration-[#3fe6e0]"
        >
          Apply on the EVADE creator page
        </a>
      </p>
    </UgcAuthShell>
  );
}
