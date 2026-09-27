import { Link } from "@tanstack/react-router";
import { BarChart3, ExternalLink, FlaskConical, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEMO_PATHS } from "@/lib/ar/events";

import { CopyButton, Panel } from "../kit";

const DEMOS = [
  { id: "roblox", label: "Roblox (MEDIALIFE × Roblox)" },
  { id: "monkey-quest", label: "Monkey Quest (Toei × Hypergalactic)" },
];

/** First run: nothing has ever been recorded in this namespace. */
export function EmptyState({
  ns,
  onLoadSample,
  loadingSample,
}: {
  ns: "prod" | "preview" | "dev";
  onLoadSample: () => void;
  loadingSample: boolean;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <Panel className="mx-auto max-w-2xl p-6 sm:p-8">
      <span
        aria-hidden
        className="grid size-10 place-items-center rounded-lg border border-border bg-white/[0.03] text-primary"
      >
        <BarChart3 className="size-5" />
      </span>
      <h2 className="mt-4 text-xl font-medium tracking-tight">No visits yet</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Visits appear here within about 10 seconds of someone opening a demo: who it was (when they
        came through a client link), how long they stayed and every step they took.
      </p>

      <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
        {DEMOS.map((d) => {
          const url = `${origin}${DEMO_PATHS[d.id]}`;
          return (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm">{d.label}</div>
                <div className="mono truncate text-xs text-muted-foreground">{url}</div>
              </div>
              <CopyButton text={url} label={`Copy the ${d.label} URL`} toastText="URL copied" />
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
              >
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${d.label}`}>
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/admin/links">
            <Link2 aria-hidden />
            Create a client link
          </Link>
        </Button>
        {ns !== "prod" ? (
          <Button
            variant="outline"
            onClick={onLoadSample}
            disabled={loadingSample}
            className="bg-transparent hover:bg-white/[0.06] hover:text-foreground"
          >
            {loadingSample ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <FlaskConical aria-hidden />
            )}
            Load sample data
          </Button>
        ) : null}
      </div>
      {ns !== "prod" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Sample data adds about 40 made-up visits over the last two weeks to this{" "}
          {ns === "dev" ? "local" : "preview"} copy only, so you can try the dashboard. You can
          remove it again.
        </p>
      ) : null}
    </Panel>
  );
}
