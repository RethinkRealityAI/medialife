import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { z } from "zod";

import { DevLinkNotice, FormError, LINK, Notice } from "@/components/hub/auth/fields";
import { clearStashedDevLink, homeFor } from "@/components/hub/auth/session";
import { AuthCard, AuthShell } from "@/components/hub/auth/shell";
import { getHubSession, resendVerification, verifyEmail } from "@/lib/hub/auth.functions";
import { HUB } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/verify-email")({
  validateSearch: z.object({
    token: z.string().max(100).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: `Confirm your email · ${HUB.name} | MEDIALIFE` }] }),
  beforeLoad: async () => ({ session: await getHubSession() }),
  component: VerifyEmail,
});

type State = "checking" | "ok" | "failed";

function VerifyEmail() {
  const { token } = Route.useSearch();
  const { session } = Route.useRouteContext();
  const router = useRouter();
  const [state, setState] = useState<State>(token ? "checking" : "failed");
  const ran = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Tokens are single-use: run exactly once, even under StrictMode's double effects.
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    verifyEmail({ data: { token } })
      .then(async (r) => {
        setState(r.ok ? "ok" : "failed");
        if (r.ok) {
          clearStashedDevLink();
          await router.invalidate();
        }
      })
      .catch(() => setState("failed"));
  }, [token, router]);

  useEffect(() => {
    if (state !== "checking") headingRef.current?.focus();
  }, [state]);

  // After a successful verify the session refreshes; a signed-in creator's next
  // stop is their application (draft) or their dashboard.
  const home = session.signedIn ? homeFor(session) : null;
  const alreadyVerified = session.signedIn && session.user?.emailVerified;

  return (
    <AuthShell>
      <AuthCard>
        <div aria-live="polite" aria-busy={state === "checking"}>
          {state === "checking" ? (
            <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
              Confirming your email…
            </div>
          ) : state === "ok" || alreadyVerified ? (
            <>
              <span
                aria-hidden
                className="grid size-12 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              >
                <CircleCheck className="size-6" />
              </span>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mt-5 text-2xl font-medium tracking-tight outline-none"
              >
                Email confirmed
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Thanks — you're all set. We'll use this address for anything important about your
                products and payouts.
              </p>
              {home ? (
                <a
                  href={home}
                  className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
                >
                  {session.creator?.status === "draft"
                    ? "Continue your application"
                    : "Go to your Creator Hub"}{" "}
                  <span aria-hidden>→</span>
                </a>
              ) : (
                <Link
                  to="/creator-hub/sign-in"
                  className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
                >
                  Sign in <span aria-hidden>→</span>
                </Link>
              )}
            </>
          ) : (
            <Failed session={session} home={home} headingRef={headingRef} />
          )}
        </div>
      </AuthCard>
    </AuthShell>
  );
}

function Failed({
  session,
  home,
  headingRef,
}: {
  session: Awaited<ReturnType<typeof getHubSession>>;
  home: string | null;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const r = await resendVerification();
      if (!r.ok) setError(r.error);
      else setSent({ devLink: r.devLink });
    } catch {
      setError("We couldn't send that just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-full border border-destructive/40 bg-destructive/10 text-destructive"
      >
        <CircleX className="size-6" />
      </span>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="mt-5 text-2xl font-medium tracking-tight outline-none"
      >
        This link didn't work
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        It may have expired or already been used. Links only work once.
      </p>

      {session.signedIn ? (
        <div className="mt-6 space-y-4">
          <FormError>{error}</FormError>
          {sent ? (
            <>
              <Notice tone="success">
                New link sent to <span className="text-foreground">{session.user?.email}</span>.
                Check your inbox (and spam).
              </Notice>
              <DevLinkNotice href={sent.devLink} label="Open the confirmation link" />
            </>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={busy}
              className="btn-pill btn-ember mono inline-flex h-12 w-full items-center justify-center gap-2 px-6 text-xs font-medium tracking-[0.18em] uppercase disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Send a new link
            </button>
          )}
          {home ? (
            <p className="text-center text-sm">
              <a href={home} className={LINK}>
                Skip for now
              </a>
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <Link
            to="/creator-hub/sign-in"
            search={{ next: "/creator-hub/onboarding" }}
            className="btn-pill btn-ember mono inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
          >
            Sign in to get a new link
          </Link>
        </div>
      )}
    </>
  );
}
