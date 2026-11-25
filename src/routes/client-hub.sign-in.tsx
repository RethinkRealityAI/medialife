import { createFileRoute, redirect } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { z } from "zod";

import { AuthTitle, ClientAuthFrame } from "@/components/client/auth";
import { btnPrimary } from "@/components/client/ui";
import {
  Field,
  FormError,
  INPUT,
  LINK,
  PasswordField,
  describedBy,
  useFieldIds,
} from "@/components/hub/auth/fields";
import { Input } from "@/components/ui/input";
import { getClientSession } from "@/lib/client/hub.functions";
import { CLIENT_BASE } from "@/lib/client/model";
import { signIn, signOut } from "@/lib/hub/auth.functions";
import { cn } from "@/lib/utils";

// Sign-in for the Client Hub. Same accounts as the Creator and Partner Hubs;
// people get theirs from an invitation and choose their own password.

const safe = (next?: string) =>
  next &&
  (next === CLIENT_BASE || next.startsWith(`${CLIENT_BASE}/`)) &&
  !next.startsWith("//") &&
  !next.includes("\\")
    ? next
    : CLIENT_BASE;

export const Route = createFileRoute("/client-hub/sign-in")({
  validateSearch: z.object({ next: z.string().max(500).optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Sign in · Client Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async ({ search }) => {
    const s = await getClientSession();
    if (s.viewer) throw redirect({ href: safe(search.next) });
    return { signedInAs: s.signedInAs };
  },
  component: SignIn,
});

function SignIn() {
  const { signedInAs } = Route.useRouteContext();
  const { next } = Route.useSearch();
  const ids = useFieldIds("email", "password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError("Add your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await signIn({ data: { email: email.trim(), password } });
      if (!r.ok) {
        setError(r.error);
        setBusy(false);
        passwordRef.current?.select();
        return;
      }
      const s = await getClientSession();
      if (!s.viewer) {
        await signOut();
        setError(
          "That account isn't on a client team. Use the invitation link you were sent, or ask the person who invited you for a new one.",
        );
        setBusy(false);
        return;
      }
      window.location.assign(safe(next));
    } catch {
      setError("We couldn't sign you in just now. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (signedInAs) {
    return (
      <ClientAuthFrame>
        <AuthTitle eyebrow="Client Hub" title="This account isn't on a client team">
          You're signed in as {signedInAs}. Open the invitation link you were sent, or sign out and
          use the email the invitation went to.
        </AuthTitle>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            window.location.reload();
          }}
          className={cn(btnPrimary, "mt-6 h-12 w-full")}
        >
          Sign out
        </button>
      </ClientAuthFrame>
    );
  }

  return (
    <ClientAuthFrame>
      <AuthTitle eyebrow="Client Hub" title="Welcome back">
        Your creators, videos, updates, merch and files from MEDIALIFE.
      </AuthTitle>
      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        <FormError>{error}</FormError>
        <Field id={ids.email} label="Email">
          <Input
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={INPUT}
            {...describedBy(ids.email, {})}
          />
        </Field>
        <PasswordField
          ref={passwordRef}
          id={ids.password}
          autoComplete="current-password"
          value={password}
          onValueChange={setPassword}
          labelAside={
            <a href="/creator-hub/forgot-password" className={cn(LINK, "text-xs")}>
              Forgot password?
            </a>
          }
        />
        <button type="submit" disabled={busy} className={cn(btnPrimary, "h-12 w-full")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          New to the hub? Open the invitation link in your email to create your account. There's no
          shared password.
        </p>
      </form>
    </ClientAuthFrame>
  );
}
