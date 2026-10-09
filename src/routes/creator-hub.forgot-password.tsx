import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { z } from "zod";

import {
  DevLinkNotice,
  Field,
  FormError,
  INPUT,
  LINK,
  SubmitButton,
  describedBy,
  useFieldIds,
} from "@/components/hub/auth/fields";
import { AuthCard, AuthHeading, AuthShell } from "@/components/hub/auth/shell";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/hub/auth.functions";
import { HUB } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/forgot-password")({
  validateSearch: z.object({
    email: z.string().max(254).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: `Reset your password · ${HUB.name} | MEDIALIFE` }] }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const search = Route.useSearch();
  const ids = useFieldIds("email");
  const [email, setEmail] = useState(search.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ email: string; devLink?: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const v = email.trim();
    if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError(v ? "That email doesn't look right." : "Add the email you signed up with.");
      emailRef.current?.focus();
      return;
    }
    setError(null);
    setFormError(null);
    setBusy(true);
    try {
      const r = await requestPasswordReset({ data: { email: v } });
      if (!r.ok) {
        setFormError(r.error);
      } else {
        setSent({ email: v, devLink: r.devLink });
        requestAnimationFrame(() => doneRef.current?.focus());
      }
    } catch {
      setFormError("We couldn't send that just now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <AuthCard>
        {sent ? (
          <div aria-live="polite">
            <span
              aria-hidden
              className="grid size-12 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary"
            >
              <MailCheck className="size-5" />
            </span>
            <h1
              ref={doneRef}
              tabIndex={-1}
              className="mt-5 text-2xl font-medium tracking-tight outline-none"
            >
              Check your inbox
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              If there's an account for <span className="text-foreground">{sent.email}</span>, we've
              sent a link to reset your password. It works once and expires soon. Nothing there?
              Check spam, or try again in a few minutes.
            </p>
            <DevLinkNotice className="mt-5" href={sent.devLink} label="Open the reset link" />
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link to="/creator-hub/sign-in" className={LINK}>
                Back to sign in
              </Link>
              <button type="button" className={LINK} onClick={() => setSent(null)}>
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <>
            <AuthHeading eyebrow={HUB.name} title="Forgot your password?">
              Enter the email you signed up with and we'll send you a link to set a new one.
            </AuthHeading>
            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              <FormError>{formError}</FormError>
              <Field id={ids.email} label="Email" error={error}>
                <Input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  maxLength={254}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  className={INPUT}
                  {...describedBy(ids.email, { error })}
                />
              </Field>
              <SubmitButton busy={busy} busyLabel="Sending…" disabled={busy}>
                Send reset link
              </SubmitButton>
            </form>
            <p className="mt-6 text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/creator-hub/sign-in" className={LINK}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </AuthCard>
    </AuthShell>
  );
}
