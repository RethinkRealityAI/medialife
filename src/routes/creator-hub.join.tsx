import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
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
  discordSignInHref,
  homeFor,
  stashAfterSignUp,
} from "@/components/hub/auth/session";
import { AuthCard, AuthHeading, AuthShell } from "@/components/hub/auth/shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getHubSession, lookupInvite, signUp } from "@/lib/hub/auth.functions";
import { HUB } from "@/lib/hub/model";

export const Route = createFileRoute("/creator-hub/join")({
  validateSearch: z.object({
    invite: z.string().trim().min(1).max(60).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: `Apply to join · ${HUB.name} | MEDIALIFE` },
      {
        name: "description",
        content: "Apply to the Activated Merchandise Program. It takes about five minutes.",
      },
    ],
  }),
  beforeLoad: async () => {
    const session = await getHubSession();
    if (session.signedIn) throw redirect({ href: homeFor(session) });
    return { session };
  },
  loaderDeps: ({ search }) => ({ invite: search.invite }),
  loader: async ({ deps }) => {
    if (!deps.invite) return { invite: null };
    try {
      return { invite: await lookupInvite({ data: { code: deps.invite } }) };
    } catch {
      return { invite: null };
    }
  },
  component: Join,
});

const NAME_HINT = "Your channel or brand name — what fans call you.";

type Errors = Partial<Record<"name" | "email" | "password" | "terms", string>>;

function Join() {
  const { session } = Route.useRouteContext();
  const { invite } = Route.useLoaderData();
  const { invite: inviteParam } = Route.useSearch();
  const router = useRouter();
  const ids = useFieldIds("name", "email", "password", "terms", "marketing");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    terms: useRef<HTMLButtonElement>(null),
  };

  function validate(): Errors {
    const e: Errors = {};
    if (!name.trim()) e.name = "Add the name your fans know you by.";
    if (!email.trim()) e.email = "Add your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      e.email = "That email doesn't look right.";
    if (password.length < 10) e.password = "Use at least 10 characters.";
    if (!terms) e.terms = "Please agree to the program terms to continue.";
    return e;
  }

  function focusFirst(e: Errors) {
    const order = ["name", "email", "password", "terms"] as const;
    const first = order.find((k) => e[k]);
    if (first) refs[first].current?.focus();
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      setFormError(null);
      focusFirst(e);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const r = await signUp({
        data: {
          name: name.trim(),
          email: email.trim(),
          password,
          invite: invite?.code ?? null,
          terms: true,
          marketing,
        },
      });
      if (!r.ok) {
        if (r.field) {
          const fe = { [r.field]: r.error } as Errors;
          setErrors(fe);
          focusFirst(fe);
        } else setFormError(r.error);
        setBusy(false);
        return;
      }
      stashAfterSignUp(r.devLink);
      await router.invalidate();
      await router.navigate({ href: HUB_PATHS.onboarding });
    } catch {
      setFormError(
        "We couldn't create your account just now. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell
      headerRight={
        <span className="text-sm text-muted-foreground">
          <span className="hidden sm:inline">Already in? </span>
          <Link to="/creator-hub/sign-in" className={LINK}>
            Sign in
          </Link>
        </span>
      }
    >
      {invite ? (
        <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary">
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            Invited by <strong className="font-medium">{invite.agencyName ?? "a partner"}</strong>
          </span>
        </div>
      ) : null}

      <AuthCard>
        <AuthHeading eyebrow={HUB.program} title="Apply to join the Creator Hub">
          Make activated merch with us: tees, keychains and stickers your fans scan to unlock
          something. Takes about five minutes.
        </AuthHeading>

        {inviteParam && !invite ? (
          <Notice className="mt-5" tone="warn">
            We couldn't find that invite link. You can still apply — mention who sent you in your
            application.
          </Notice>
        ) : null}

        {session.discordEnabled ? (
          <>
            <div className="mt-6">
              <DiscordButton href={discordSignInHref(HUB_PATHS.onboarding, invite?.code)}>
                Join with Discord
              </DiscordButton>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                By continuing with Discord you agree to the{" "}
                <Link to="/creator-hub/terms" className={LINK} target="_blank">
                  program terms
                </Link>
                .
              </p>
            </div>
            <OrDivider>or with email</OrDivider>
          </>
        ) : (
          <div className="h-6" />
        )}

        <form onSubmit={submit} noValidate className="space-y-5">
          <FormError>{formError}</FormError>

          <Field id={ids.name} label="Creator name" hint={NAME_HINT} error={errors.name}>
            <Input
              ref={refs.name}
              autoComplete="nickname"
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors({ ...errors, name: undefined });
              }}
              placeholder="e.g. PixelPete"
              className={INPUT}
              {...describedBy(ids.name, { hint: NAME_HINT, error: errors.name })}
            />
          </Field>

          <Field id={ids.email} label="Email" error={errors.email}>
            <Input
              ref={refs.email}
              type="email"
              inputMode="email"
              autoComplete="email"
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
            ref={refs.password}
            id={ids.password}
            label="Create a password"
            autoComplete="new-password"
            value={password}
            onValueChange={(v) => {
              setPassword(v);
              if (errors.password) setErrors({ ...errors, password: undefined });
            }}
            error={errors.password}
            showStrength
          />

          <div className="space-y-3 pt-1">
            <div>
              <div className="flex items-start gap-3">
                <Checkbox
                  ref={refs.terms}
                  checked={terms}
                  onCheckedChange={(v) => {
                    setTerms(v === true);
                    if (errors.terms) setErrors({ ...errors, terms: undefined });
                  }}
                  className="mt-0.5 size-5 rounded-[5px]"
                  {...describedBy(ids.terms, { error: errors.terms })}
                />
                <label htmlFor={ids.terms} className="text-sm leading-snug">
                  I agree to the{" "}
                  <Link to="/creator-hub/terms" className={LINK} target="_blank">
                    program terms
                  </Link>
                </label>
              </div>
              {errors.terms ? (
                <p id={`${ids.terms}-error`} className="mt-1.5 pl-8 text-sm text-destructive">
                  {errors.terms}
                </p>
              ) : null}
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id={ids.marketing}
                checked={marketing}
                onCheckedChange={(v) => setMarketing(v === true)}
                className="mt-0.5 size-5 rounded-[5px]"
              />
              <label htmlFor={ids.marketing} className="text-sm leading-snug text-muted-foreground">
                Send me occasional news about new products and drops. No spam, unsubscribe any time.
              </label>
            </div>
          </div>

          <SubmitButton busy={busy} busyLabel="Creating your account…" disabled={busy}>
            Create account <span aria-hidden>→</span>
          </SubmitButton>
        </form>
      </AuthCard>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/creator-hub/sign-in" className={LINK}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
