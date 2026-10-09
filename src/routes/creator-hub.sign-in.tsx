import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import {
  DiscordButton,
  Field,
  FormError,
  INPUT,
  LINK,
  Notice,
  OrDivider,
  PasswordField,
  SubmitButton,
  describedBy,
  useFieldIds,
} from "@/components/hub/auth/fields";
import {
  HUB_PATHS,
  discordError,
  discordSignInHref,
  homeFor,
  safeNext,
} from "@/components/hub/auth/session";
import { AuthCard, AuthHeading, AuthShell } from "@/components/hub/auth/shell";
import { Input } from "@/components/ui/input";
import { getHubSession, signIn } from "@/lib/hub/auth.functions";
import { HUB } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/sign-in")({
  validateSearch: z.object({
    next: z.string().max(500).optional().catch(undefined),
    error: z.string().max(60).optional().catch(undefined),
  }),
  head: () => ({
    meta: [{ title: `Sign in · ${HUB.name} | MEDIALIFE` }],
  }),
  beforeLoad: async ({ search }) => {
    const session = await getHubSession();
    // A Discord error can land here while signed in (e.g. linking a Discord that's
    // taken): stay and show it instead of bouncing away and losing the message.
    if (session.signedIn && !search.error) {
      const draft = session.creator?.status === "draft";
      throw redirect({
        href: draft ? homeFor(session) : (safeNext(search.next) ?? homeFor(session)),
      });
    }
    return { session };
  },
  component: SignIn,
});

type Errors = Partial<Record<"email" | "password", string>>;

function SignIn() {
  const { session } = Route.useRouteContext();
  const { next, error: errorCode } = Route.useSearch();
  const router = useRouter();
  const ids = useFieldIds("email", "password");
  const target = safeNext(next);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(discordError(errorCode));
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const e: Errors = {};
    if (!email.trim()) e.email = "Add your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = "That email doesn't look right.";
    if (!password) e.password = "Add your password.";
    setErrors(e);
    if (e.email) return emailRef.current?.focus();
    if (e.password) return passwordRef.current?.focus();

    setBusy(true);
    setFormError(null);
    try {
      const r = await signIn({ data: { email: email.trim(), password } });
      if (!r.ok) {
        setFormError(r.error);
        setBusy(false);
        passwordRef.current?.select();
        return;
      }
      const s = await getHubSession();
      const home = homeFor(s);
      await router.invalidate();
      await router.navigate({
        href: s.creator?.status === "draft" ? home : (target ?? home),
      });
    } catch {
      setFormError("We couldn't sign you in just now. Check your connection and try again.");
      setBusy(false);
    }
  }

  // Signed in already (we only stay here to show a Discord error).
  if (session.signedIn) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthHeading eyebrow="Discord" title="That didn't connect" />
          <FormError className="mt-5">{formError}</FormError>
          <p className="mt-4 text-sm text-muted-foreground">
            You're still signed in as {session.user?.email}.
          </p>
          <a
            href={homeFor(session)}
            className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
          >
            Back to your hub
          </a>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headerRight={
        <span className="text-sm text-muted-foreground">
          <span className="hidden sm:inline">New here? </span>
          <Link to="/creator-hub/join" className={LINK}>
            Apply to join
          </Link>
        </span>
      }
    >
      <AuthCard>
        <AuthHeading eyebrow={HUB.name} title="Welcome back">
          Sign in to check your products, approvals, orders and earnings.
        </AuthHeading>

        {!session.configured ? (
          <Notice className="mt-6" tone="warn">
            Sign-in isn't available yet. Please try again later, or write to{" "}
            <a href={`mailto:${HUB.supportEmail}`} className={LINK}>
              {HUB.supportEmail}
            </a>
            .
          </Notice>
        ) : null}

        {session.discordEnabled ? (
          <>
            <div className="mt-6">
              <DiscordButton href={discordSignInHref(target ?? HUB_PATHS.onboarding)} />
            </div>
            <OrDivider>or with email</OrDivider>
          </>
        ) : (
          <div className="h-6" />
        )}

        <form onSubmit={submit} noValidate className="space-y-5">
          <FormError>{formError}</FormError>

          <Field id={ids.email} label="Email" error={errors.email}>
            <Input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={254}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              placeholder="you@example.com"
              className={INPUT}
              {...describedBy(ids.email, { error: errors.email })}
            />
          </Field>

          <PasswordField
            ref={passwordRef}
            id={ids.password}
            autoComplete="current-password"
            value={password}
            onValueChange={(v) => {
              setPassword(v);
              if (errors.password) setErrors({ ...errors, password: undefined });
            }}
            error={errors.password}
            labelAside={
              <Link to="/creator-hub/forgot-password" className={`${LINK} text-xs`}>
                Forgot password?
              </Link>
            }
          />

          <SubmitButton busy={busy} busyLabel="Signing in…" disabled={busy}>
            Sign in <span aria-hidden>→</span>
          </SubmitButton>
        </form>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to the program?{" "}
        <Link to="/creator-hub/join" className={LINK}>
          Apply to join
        </Link>
      </p>
    </AuthShell>
  );
}
