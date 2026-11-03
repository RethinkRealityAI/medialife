import { useEffect, useRef, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Link2Off, Loader2 } from "lucide-react";
import { z } from "zod";

import { UgcTheme } from "@/components/ugc/creator/kit";
import { card } from "@/components/ugc/shared/look";
import { consumeGiveawayLink } from "@/lib/giveaway/public.functions";
import { cn } from "@/lib/utils";

// Landing page of the emailed confirm link. The token is used from the browser,
// never in a loader, so an email scanner that prefetches the link can't burn it.

export const Route = createFileRoute("/giveaway/auth")({
  validateSearch: z.object({ token: z.string().max(100).optional().catch(undefined) }),
  head: () => ({
    meta: [
      { title: "Confirming your entry | MEDIALIFE" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Confirm,
});

function Confirm() {
  const { token } = Route.useSearch();
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(
    token ? null : "This link is missing its code.",
  );

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void (async () => {
      try {
        const r = await consumeGiveawayLink({ data: { token } });
        if (!r.ok) return setError(r.error);
        await router.navigate({ to: "/giveaway/$slug", params: { slug: r.slug }, replace: true });
      } catch {
        setError(
          "We couldn't confirm that just now. Check your connection and open the link again.",
        );
      }
    })();
  }, [token, router]);

  return (
    <div className="grid min-h-dvh place-items-center bg-[#05080a] px-4 text-foreground">
      <UgcTheme />
      <div className={cn(card, "w-full max-w-md p-7 text-center")} role="status" aria-live="polite">
        {error ? (
          <>
            <Link2Off className="mx-auto size-8 text-amber-300" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold">That link didn't work</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto size-8 animate-spin text-[#3fe6e0]" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold">Confirming your entry…</h1>
          </>
        )}
      </div>
    </div>
  );
}
