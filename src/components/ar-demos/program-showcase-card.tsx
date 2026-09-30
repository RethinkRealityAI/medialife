import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PROGRAM_SLUG, templateUrl } from "@/lib/ar/projects";
import { createProjectFn, getProjectFn } from "@/lib/ar/projects.functions";

/**
 * /admin/demos: the 3D showcase on the public /activated-retail page. It shows the built-in
 * MEDIALIFE template until a builder project with the same link is published; "Customize"
 * creates that project from the template (once) and opens it in the builder.
 */
export function ProgramShowcaseCard() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["ar-builder", "project", PROGRAM_SLUG],
    queryFn: () => getProjectFn({ data: { slug: PROGRAM_SLUG } }),
  });
  const status = q.data?.summary.status;
  const label = !q.data
    ? "Built-in template"
    : status === "published"
      ? "Your version is live"
      : status === "changed"
        ? "Live, with unpublished changes"
        : "Draft · the page still shows the built-in template";

  async function customize() {
    if (q.data) {
      await navigate({ to: "/admin/builder/$slug", params: { slug: PROGRAM_SLUG } });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(templateUrl("medialife"));
      if (!res.ok) throw new Error("template");
      const r = await createProjectFn({
        data: { slug: PROGRAM_SLUG, name: "Program page showcase", source: await res.json() },
      });
      if (!r.ok && r.error !== "taken") throw new Error(r.error);
      await navigate({ to: "/admin/builder/$slug", params: { slug: PROGRAM_SLUG } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(
        msg === "unauthorized"
          ? "Your session ended. Sign in again."
          : "Couldn't open it. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">
              Program page · /activated-retail
            </div>
            <h2 className="mt-1 text-lg font-medium">3D showcase</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Merch, graphics, themes, venues and tour of the showcase on the public page. Edit it
              in the builder; publishing replaces what the page shows.
            </p>
            <p className="mt-3 text-xs">
              {q.isPending ? "Checking…" : <span className="text-primary">{label}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/activated-retail"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary"
            >
              View page <ExternalLink className="size-3.5" aria-hidden />
            </a>
            <button
              type="button"
              onClick={customize}
              disabled={busy || q.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              {q.data ? "Open in builder" : "Customize in builder"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
