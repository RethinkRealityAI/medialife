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
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-sm"
      >
        <span className="mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          MEDIALIFE · internal
        </span>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Activated retail tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analytics, client links and the endcap builder.
        </p>
        {!configured ? (
          <p className="mt-5 rounded-lg border border-border bg-muted/50 p-3 text-sm">
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
              onChange={(e) => {
                setPassword(e.target.value);
                if (state !== "busy") setState("idle");
              }}
              className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {state === "wrong" && (
              <p className="mt-2 text-sm text-destructive">That password isn't right.</p>
            )}
            {state === "error" && (
              <p className="mt-2 text-sm text-destructive">Couldn't sign in. Try again.</p>
            )}
            <button
              type="submit"
              disabled={state === "busy" || !password}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {state === "busy" ? "Signing in…" : "Sign in"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
