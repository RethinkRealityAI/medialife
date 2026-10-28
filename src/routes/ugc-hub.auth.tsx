import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Link2Off, Loader2, PackageOpen, Upload } from "lucide-react";
import { z } from "zod";

import { AuthCard, UgcAuthShell } from "@/components/ugc/creator/auth-shell";
import { EmailLinkForm, safeUgcNext } from "@/components/ugc/creator/email-form";
import { UGC_ART, btnGold, eyebrow } from "@/components/ugc/shared/look";
import { consumeUgcLink, getUgcSession } from "@/lib/ugc/auth.functions";
import { UGC_ROUTES } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

// Landing page of every emailed link (sign-in and the join link sent on
// approval). The token is used from the browser, never in a loader, so an
// email scanner that prefetches the link can't burn it.

export const Route = createFileRoute("/ugc-hub/auth")({
  validateSearch: z.object({
    token: z.string().max(100).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Signing in · EVADE UGC Hub | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AuthLanding,
});

type State =
  | { kind: "working" }
  | { kind: "welcome"; next: string; name: string }
  | { kind: "error"; message: string };

function AuthLanding() {
  const { token } = Route.useSearch();
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<State>(
    token
      ? { kind: "working" }
      : { kind: "error", message: "This link is missing its code. Ask for a new one below." },
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const r = await consumeUgcLink({ data: { token } });
        if (!r.ok) return setState({ kind: "error", message: r.error });
        const next = safeUgcNext(r.next) ?? UGC_ROUTES.home;
        if (!r.firstVisit) {
          await router.invalidate();
          return router.navigate({ href: next, replace: true });
        }
        const s = await getUgcSession().catch(() => null);
        const name = s?.signedIn ? s.creator.creatorName || s.creator.name.split(" ")[0] || "" : "";
        setState({ kind: "welcome", next, name });
      } catch {
        setState({
          kind: "error",
          message:
            "We couldn't sign you in just now. Check your connection, then ask for a new link.",
        });
      }
    })();
  }, [token, router]);

  if (state.kind === "welcome") return <Welcome name={state.name} next={state.next} />;

  return (
    <UgcAuthShell>
      <AuthCard>
        {state.kind === "working" ? (
          <div
            className="flex flex-col items-center py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <span className="relative grid size-16 place-items-center">
              <span
                aria-hidden
                className="absolute inset-0 rounded-full border-2 border-[#3fe6e0]/20 border-t-[#3fe6e0] motion-safe:animate-spin"
              />
              <img src={UGC_ART.mark} alt="" className="size-7" />
            </span>
            <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em]">Signing you in…</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">This takes a second.</p>
          </div>
        ) : (
          <>
            <span className="inline-grid size-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/35 ring-inset">
              <Link2Off className="size-7" aria-hidden />
            </span>
            <div className={cn(eyebrow, "mt-5 text-amber-300")}>Link didn't work</div>
            <h1 className="mt-2.5 text-[28px] leading-[1.05] font-bold tracking-[-0.04em] text-balance">
              Let's get you a fresh link
            </h1>
            <p role="alert" className="mt-3 text-[15px] leading-relaxed text-[#c9d1d8]">
              {state.message}
            </p>
            <div className="mt-6">
              <EmailLinkForm submitLabel="Send me a new link" />
            </div>
          </>
        )}
      </AuthCard>
    </UgcAuthShell>
  );
}

const STEPS = [
  {
    icon: ClipboardList,
    title: "Read the brief",
    body: "Key messages, the shot list and the scan reveal.",
  },
  {
    icon: PackageOpen,
    title: "Watch for your package",
    body: "We'll email the tracking link the day it ships.",
  },
  { icon: Upload, title: "Film and upload", body: "Big files are fine. Uploads pause and resume." },
];

function Welcome({ name, next }: { name: string; next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <UgcAuthShell wide>
      <AuthCard className="relative isolate overflow-hidden text-center">
        <img
          src={UGC_ART.splash}
          alt=""
          aria-hidden
          className="absolute inset-x-0 top-0 -z-20 h-56 w-full object-cover opacity-40 [mask-image:linear-gradient(180deg,black,transparent)]"
        />
        <div className="relative mx-auto flex h-32 w-56 items-end justify-center">
          <img
            src={UGC_ART.bobo}
            alt=""
            className="h-32 w-auto -rotate-6 drop-shadow-[0_20px_30px_rgb(0_0_0/0.7)]"
          />
          <img
            src={UGC_ART.can}
            alt=""
            className="-ml-6 h-24 w-auto rotate-12 drop-shadow-[0_0_16px_rgb(63_230_224/0.5)]"
          />
        </div>
        <div className={cn(eyebrow, "mt-5")}>You're in</div>
        <h1 className="mt-2.5 text-[32px] leading-[1.02] font-bold tracking-[-0.045em] text-balance sm:text-[38px]">
          Welcome to the crew{name ? `, ${name}` : ""}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#c9d1d8]">
          This is your UGC Hub for the EVADE Bobo + Eclipse can keychain drop. Everything you need
          lives here.
        </p>
        <ol className="mt-7 grid gap-3 text-left sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-xl bg-[#3fe6e0]/10 text-[#3fe6e0] ring-1 ring-[#3fe6e0]/30 ring-inset">
                  <s.icon className="size-4" aria-hidden />
                </span>
                <span className="font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground">
                  STEP {i + 1}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={cn(btnGold, "mt-8 w-full sm:w-auto sm:px-10")}
          aria-disabled={busy || undefined}
          onClick={async () => {
            setBusy(true);
            await router.invalidate();
            await router.navigate({ href: next, replace: true });
          }}
        >
          {busy ? <Loader2 className="motion-safe:animate-spin" aria-hidden /> : null}
          Open my hub <ArrowRight aria-hidden />
        </button>
      </AuthCard>
    </UgcAuthShell>
  );
}
