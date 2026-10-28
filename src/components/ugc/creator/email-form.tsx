/**
 * "Email me a sign-in link": the form on the sign-in page and under a failed
 * link. On success it goes to the check-email page; in dev (no email
 * provider) the link the server would have sent rides along in
 * sessionStorage so that page can offer it as a button.
 */
import { useId, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";

import { btnGold, field } from "@/components/ugc/shared/look";
import { requestUgcSignInLink } from "@/lib/ugc/auth.functions";
import { UGC_ROUTES } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const DEV_LINK_KEY = "ugc-dev-link";

/** Only same-app paths; anything else falls back to Home. */
export function safeUgcNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/ugc-hub") || next.startsWith("//")) return null;
  if (next.startsWith(UGC_ROUTES.signIn) || next.startsWith(UGC_ROUTES.auth)) return null;
  return next;
}

export function rememberDevLink(link: string | null) {
  try {
    if (link) sessionStorage.setItem(DEV_LINK_KEY, link);
    else sessionStorage.removeItem(DEV_LINK_KEY);
  } catch {
    /* private mode */
  }
}

export function EmailLinkForm({
  next,
  defaultEmail = "",
  submitLabel = "Email me a sign-in link",
  autoFocus,
}: {
  next?: string | null;
  defaultEmail?: string;
  submitLabel?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(defaultEmail);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = email.trim();
    if (!v) {
      setError("Enter the email you signed up with.");
      return input.current?.focus();
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      setError("That email doesn't look right.");
      return input.current?.focus();
    }
    setBusy(true);
    setError(null);
    try {
      const r = await requestUgcSignInLink({ data: { email: v, next: safeUgcNext(next) } });
      if (!r.ok) {
        setError(r.error);
        setBusy(false);
        return;
      }
      rememberDevLink(r.devLink);
      const q = new URLSearchParams({ email: r.email });
      const n = safeUgcNext(next);
      if (n) q.set("next", n);
      await router.navigate({ href: `${UGC_ROUTES.checkEmail}?${q}` });
    } catch {
      setError("We couldn't send the link just now. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-medium">
          Email
        </label>
        <input
          ref={input}
          id={id}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          autoFocus={autoFocus}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className={field}
        />
        <div aria-live="assertive" aria-atomic="true">
          {error ? (
            <p id={`${id}-error`} className="mt-2 flex items-start gap-1.5 text-sm text-red-300">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : (
            <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Use the email from your creator sign-up. No password needed.
            </p>
          )}
        </div>
      </div>
      <button type="submit" className={cn(btnGold, "w-full")} aria-disabled={busy || undefined}>
        {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
        {busy ? "Sending…" : submitLabel}
        {busy ? null : <ArrowRight aria-hidden />}
      </button>
    </form>
  );
}
