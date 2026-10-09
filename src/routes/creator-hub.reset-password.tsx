import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import {
  FormError,
  LINK,
  MIN_PASSWORD,
  Notice,
  PasswordField,
  SubmitButton,
  useFieldIds,
} from "@/components/hub/auth/fields";
import { homeFor } from "@/components/hub/auth/session";
import { AuthCard, AuthHeading, AuthShell } from "@/components/hub/auth/shell";
import { getHubSession, resetPassword } from "@/lib/hub/auth.functions";
import { HUB } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/reset-password")({
  validateSearch: z.object({
    token: z.string().max(100).optional().catch(undefined),
  }),
  head: () => ({ meta: [{ title: `Set a new password · ${HUB.name} | MEDIALIFE` }] }),
  component: ResetPassword,
});

type Errors = Partial<Record<"password" | "confirm", string>>;

function ResetPassword() {
  const { token } = Route.useSearch();
  const router = useRouter();
  const ids = useFieldIds("password", "confirm");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy || !token) return;
    const e: Errors = {};
    if (password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`;
    if (!e.password && confirm !== password) e.confirm = "The passwords don't match.";
    setErrors(e);
    if (e.password) return pwRef.current?.focus();
    if (e.confirm) return confirmRef.current?.focus();

    setBusy(true);
    setFormError(null);
    try {
      const r = await resetPassword({ data: { token, password } });
      if (!r.ok) {
        // The token is single-use, so any failure means asking for a new link.
        setFormError(r.error);
        setExpired(true);
        setBusy(false);
        return;
      }
      const s = await getHubSession();
      await router.invalidate();
      await router.navigate({ href: homeFor(s) });
    } catch {
      setFormError("We couldn't save that just now. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell>
        <AuthCard>
          <AuthHeading eyebrow={HUB.name} title="This link isn't complete">
            The reset link is missing a piece. Open it again from the email, or ask for a new one.
          </AuthHeading>
          <Link
            to="/creator-hub/forgot-password"
            className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
          >
            Get a new link
          </Link>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthCard>
        <AuthHeading eyebrow={HUB.name} title="Set a new password">
          Choose something you don't use anywhere else. You'll be signed in straight after.
        </AuthHeading>

        <form onSubmit={submit} noValidate className="mt-6 space-y-5">
          <FormError>
            {formError ? (
              <>
                {formError}{" "}
                {expired ? (
                  <Link to="/creator-hub/forgot-password" className={LINK}>
                    Get a new link
                  </Link>
                ) : null}
              </>
            ) : null}
          </FormError>

          <PasswordField
            ref={pwRef}
            id={ids.password}
            label="New password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onValueChange={(v) => {
              setPassword(v);
              if (errors.password) setErrors({ ...errors, password: undefined });
            }}
            error={errors.password}
            showStrength
          />
          <PasswordField
            ref={confirmRef}
            id={ids.confirm}
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onValueChange={(v) => {
              setConfirm(v);
              if (errors.confirm) setErrors({ ...errors, confirm: undefined });
            }}
            error={errors.confirm}
          />

          <SubmitButton busy={busy} busyLabel="Saving…" disabled={busy || expired}>
            Save and sign in
          </SubmitButton>
        </form>

        <Notice className="mt-6">
          Resetting signs you out everywhere else, and confirms your email too.
        </Notice>
      </AuthCard>
    </AuthShell>
  );
}
