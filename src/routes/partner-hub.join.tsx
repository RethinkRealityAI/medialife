import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";

import {
  Field,
  FormError,
  INPUT,
  LINK,
  PasswordField,
  SubmitButton,
  describedBy,
  useFieldIds,
} from "@/components/hub/auth/fields";
import { AuthCard, AuthHeading, AuthShell } from "@/components/hub/auth/shell";
import { Input } from "@/components/ui/input";
import { signOut } from "@/lib/hub/auth.functions";
import { acceptPartnerInvite, lookupPartnerInvite } from "@/lib/hub/partner.functions";
import { PARTNER_ROLES } from "@/lib/hub/partners";

// Accepting an emailed invitation to a partner's team.

export const Route = createFileRoute("/partner-hub/join")({
  validateSearch: z.object({ token: z.string().max(200).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) =>
    deps.token
      ? lookupPartnerInvite({ data: { token: deps.token } })
      : { state: "invalid" as const },
  head: () => ({
    meta: [
      { title: "Join your team · Partner Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Join,
});

function Join() {
  const info = Route.useLoaderData();
  const { token } = Route.useSearch();
  const router = useRouter();
  const ids = useFieldIds("name", "password");
  const [name, setName] = useState(info.state === "open" ? info.name : "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<"name" | "password" | null>(null);
  const here = `/partner-hub/join?token=${encodeURIComponent(token ?? "")}`;

  if (info.state !== "open") {
    return (
      <AuthShell aside={false}>
        <AuthCard>
          <AuthHeading
            eyebrow="MEDIALIFE Partner Hub"
            title={info.state === "accepted" ? "You're already in" : "This invitation doesn't work"}
          >
            {info.state === "accepted"
              ? "This invitation has been used. Sign in to open the Partner Hub."
              : info.state === "expired"
                ? "It has expired. Ask your team admin to send a new one."
                : "It may have been cancelled or replaced. Ask your team admin to send a new one."}
          </AuthHeading>
          <a
            href="/creator-hub/sign-in?next=%2Fpartner-hub"
            className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
          >
            Sign in
          </a>
        </AuthCard>
      </AuthShell>
    );
  }

  async function accept(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    setField(null);
    try {
      const r = await acceptPartnerInvite({
        data: { token, name: name.trim() || undefined, password: password || undefined },
      });
      if (!r.ok) {
        setError(r.error);
        setField("field" in r ? (r.field ?? null) : null);
        setBusy(false);
        return;
      }
      await router.invalidate();
      window.location.assign(r.next);
    } catch {
      setError("We couldn't accept the invitation just now. Check your connection and try again.");
      setBusy(false);
    }
  }

  const heading = (
    <AuthHeading eyebrow="MEDIALIFE Partner Hub" title={`Join ${info.partnerName}`}>
      {info.invitedBy} invited you as {PARTNER_ROLES[info.role].label.toLowerCase()}: the creators{" "}
      {info.partnerName} brings into activated merch, their progress, and all the collateral to
      pitch it.
    </AuthHeading>
  );

  // Signed in already.
  if (info.signedInAs) {
    return (
      <AuthShell aside={false}>
        <AuthCard>
          {heading}
          {info.signedInMatches ? (
            <>
              <FormError className="mt-5">{error}</FormError>
              <form onSubmit={accept} className="mt-6 grid gap-4">
                <Field id={ids.name} label="Your name" hint="How your teammates see you.">
                  <Input
                    id={ids.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    className={INPUT}
                  />
                </Field>
                <SubmitButton busy={busy} busyLabel="Joining…">
                  Join the team
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <p className="mt-5 text-sm text-muted-foreground">
                You're signed in as <span className="text-foreground">{info.signedInAs}</span>, but
                this invitation is for <span className="text-foreground">{info.email}</span>.
              </p>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  window.location.assign(here);
                }}
                className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
              >
                Sign out and continue
              </button>
            </>
          )}
        </AuthCard>
      </AuthShell>
    );
  }

  // Has an account: sign in first, then come back here.
  if (info.accountExists) {
    return (
      <AuthShell aside={false}>
        <AuthCard>
          {heading}
          <p className="mt-5 text-sm text-muted-foreground">
            There's already an account for <span className="text-foreground">{info.email}</span>.
            Sign in and you'll come straight back here to join.
          </p>
          <a
            href={`/creator-hub/sign-in?next=${encodeURIComponent(here)}`}
            className="btn-pill btn-ember mono mt-6 inline-flex h-12 w-full items-center justify-center px-6 text-xs font-medium tracking-[0.18em] uppercase"
          >
            Sign in to accept
          </a>
        </AuthCard>
      </AuthShell>
    );
  }

  return (
    <AuthShell aside={false}>
      <AuthCard>
        {heading}
        <FormError className="mt-5">{error}</FormError>
        <form onSubmit={accept} className="mt-6 grid gap-5" noValidate>
          <Field id={`${ids.name}-email`} label="Email">
            <Input id={`${ids.name}-email`} value={info.email} readOnly className={INPUT} />
          </Field>
          <Field id={ids.name} label="Your name" error={field === "name" ? error : null}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={80}
              required
              {...describedBy(ids.name, { error: field === "name" ? error : null })}
              className={INPUT}
            />
          </Field>
          <PasswordField
            id={ids.password}
            label="Choose a password"
            value={password}
            onValueChange={setPassword}
            showStrength
            autoComplete="new-password"
            error={field === "password" ? error : null}
          />
          <SubmitButton busy={busy} busyLabel="Creating your account…">
            Join {info.partnerName}
          </SubmitButton>
          <p className="text-xs text-muted-foreground">
            By joining you agree to keep creators' details confidential and use them only to support
            them in the program. Questions?{" "}
            <a href="mailto:creators@medialife.ai" className={LINK}>
              creators@medialife.ai
            </a>
          </p>
        </form>
      </AuthCard>
    </AuthShell>
  );
}
