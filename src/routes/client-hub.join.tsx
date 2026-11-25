import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthTitle, ClientAuthFrame } from "@/components/client/auth";
import { btnPrimary } from "@/components/client/ui";
import {
  Field,
  FormError,
  INPUT,
  PasswordField,
  describedBy,
  useFieldIds,
} from "@/components/hub/auth/fields";
import { Input } from "@/components/ui/input";
import { acceptClientInvite, lookupClientInvite } from "@/lib/client/hub.functions";
import { CLIENT_ROLES } from "@/lib/client/model";
import { signOut } from "@/lib/hub/auth.functions";
import { cn } from "@/lib/utils";

// Accepting an invitation to a client's team. A new person picks their own
// password here; someone with an account signs in first.

export const Route = createFileRoute("/client-hub/join")({
  validateSearch: z.object({ token: z.string().max(200).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) =>
    deps.token
      ? lookupClientInvite({ data: { token: deps.token } })
      : { state: "invalid" as const },
  head: () => ({
    meta: [
      { title: "Join your team · Client Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Join,
});

function Join() {
  const info = Route.useLoaderData();
  const { token } = Route.useSearch();
  const ids = useFieldIds("name", "password");
  const [name, setName] = useState(info.state === "open" ? info.name : "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<"name" | "password" | null>(null);
  const here = `/client-hub/join?token=${encodeURIComponent(token ?? "")}`;

  if (info.state !== "open") {
    return (
      <ClientAuthFrame>
        <AuthTitle
          eyebrow="Client Hub"
          title={info.state === "accepted" ? "You're already in" : "This invitation doesn't work"}
        >
          {info.state === "accepted"
            ? "This invitation has been used. Sign in to open your hub."
            : info.state === "expired"
              ? "It has expired. Ask the person who invited you to send a new one."
              : "It may have been cancelled or replaced. Ask the person who invited you to send a new one."}
        </AuthTitle>
        <a href="/client-hub/sign-in" className={cn(btnPrimary, "mt-6 h-12 w-full")}>
          Sign in
        </a>
      </ClientAuthFrame>
    );
  }

  async function accept(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (busy || !token) return;
    setBusy(true);
    setError(null);
    setField(null);
    try {
      const r = await acceptClientInvite({
        data: { token, name: name.trim() || undefined, password: password || undefined },
      });
      if (!r.ok) {
        setError(r.error);
        setField("field" in r ? (r.field ?? null) : null);
        setBusy(false);
        return;
      }
      window.location.assign(r.next);
    } catch {
      setError("We couldn't accept the invitation just now. Check your connection and try again.");
      setBusy(false);
    }
  }

  const heading = (
    <AuthTitle eyebrow={`${info.clientName} × MEDIALIFE`} title={`Join the ${info.clientName} hub`}>
      {info.invitedBy} invited you as {CLIENT_ROLES[info.role].label.toLowerCase()}: your creators
      and their videos, updates, merch, files and every {info.clientName} experience, in one place.
    </AuthTitle>
  );

  if (info.signedInAs) {
    return (
      <ClientAuthFrame clientName={info.clientName} accent={info.brand.accent}>
        {heading}
        {info.signedInMatches ? (
          <form onSubmit={accept} className="mt-6 grid gap-4">
            <FormError>{error}</FormError>
            <Field id={ids.name} label="Your name" hint="How your teammates see you.">
              <Input
                id={ids.name}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className={INPUT}
              />
            </Field>
            <button type="submit" disabled={busy} className={cn(btnPrimary, "h-12 w-full")}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Joining…" : "Join the team"}
            </button>
          </form>
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
              className={cn(btnPrimary, "mt-6 h-12 w-full")}
            >
              Sign out and continue
            </button>
          </>
        )}
      </ClientAuthFrame>
    );
  }

  if (info.accountExists) {
    return (
      <ClientAuthFrame clientName={info.clientName} accent={info.brand.accent}>
        {heading}
        <p className="mt-5 text-sm text-muted-foreground">
          There's already an account for <span className="text-foreground">{info.email}</span>. Sign
          in and you'll come straight back here to join.
        </p>
        <a
          href={`/creator-hub/sign-in?next=${encodeURIComponent(here)}`}
          className={cn(btnPrimary, "mt-6 h-12 w-full")}
        >
          Sign in to accept
        </a>
      </ClientAuthFrame>
    );
  }

  return (
    <ClientAuthFrame clientName={info.clientName} accent={info.brand.accent}>
      {heading}
      <form onSubmit={accept} className="mt-6 grid gap-5" noValidate>
        <FormError>{error}</FormError>
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
        <button type="submit" disabled={busy} className={cn(btnPrimary, "h-12 w-full")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Creating your account…" : `Join ${info.clientName}`}
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Creator details in the hub are shared with you to run the program. Please keep them inside
          your team.
        </p>
      </form>
    </ClientAuthFrame>
  );
}
