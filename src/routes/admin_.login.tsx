import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { adminLogin, getAdminSession } from "@/lib/ar/admin.functions";

export const Route = createFileRoute("/admin_/login")({
  validateSearch: z.object({ next: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in · Activated Retail | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  beforeLoad: async () => {
    const s = await getAdminSession();
    if (s.authed) throw redirect({ to: "/admin/analytics" });
    return { configured: s.configured };
  },
  component: Login,
});

function Login() {
  const { configured } = Route.useRouteContext();
  const { next } = Route.useSearch();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "wrong" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || state === "busy") return;
    setState("busy");
    try {
      const r = await adminLogin({ data: { password } });
      if (r.ok) {
        // only follow same-site paths under /admin
        const target = next && next.startsWith("/admin") ? next : "/admin/analytics";
        await router.navigate({ href: target });
      } else setState(r.error === "wrong" ? "wrong" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_25%_10%,color-mix(in_oklab,var(--partner)_22%,transparent),transparent_70%),radial-gradient(45%_45%_at_85%_90%,color-mix(in_oklab,var(--partner-2)_26%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="grid-bg absolute inset-0 -z-10 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-[color-mix(in_oklab,var(--partner)_30%,transparent)] bg-card bg-[linear-gradient(180deg,rgb(255_255_255/0.06),rgb(255_255_255/0.01))] p-7 shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--partner)_28%,transparent),0_30px_60px_-30px_color-mix(in_oklab,var(--partner-2)_70%,black)]"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_10px_22px_-10px_color-mix(in_oklab,var(--partner-2)_80%,black)]"
            style={{ background: "var(--gradient-ember)" }}
          >
            <span className="size-3.5 rounded-full bg-background/85" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm leading-tight font-semibold tracking-tight">
              MEDIALIFE<sup className="text-[0.6em]">™</sup>
            </span>
            <span className="block text-xs text-muted-foreground">Team admin</span>
          </span>
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creators, partners, analytics, client links and the builders.
        </p>
        {!configured ? (
          <p className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-sm">
            Sign-in isn't set up yet. Add an <code className="mono">AR_ADMIN_PASSWORD</code>{" "}
            environment variable in Netlify and redeploy.
          </p>
        ) : (
          <>
            <label className="mt-5 block text-sm font-medium" htmlFor="pw">
              Password
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              aria-invalid={state === "wrong" || undefined}
              aria-describedby={state === "wrong" || state === "error" ? "pw-error" : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                if (state !== "busy") setState("idle");
              }}
              className="mt-1.5 h-11 w-full rounded-xl border border-input bg-black/30 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {state === "wrong" && (
              <p id="pw-error" className="mt-2 text-sm text-destructive">
                That password isn't right.
              </p>
            )}
            {state === "error" && (
              <p id="pw-error" className="mt-2 text-sm text-destructive">
                Couldn't sign in. Try again.
              </p>
            )}
            <button
              type="submit"
              disabled={state === "busy" || !password}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.3)] transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:opacity-60"
            >
              {state === "busy" ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
