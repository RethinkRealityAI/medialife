import { createFileRoute } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { useMemo, useState } from "react";

import { MediaGrid } from "@/components/client/media";
import { ClientHeader, ClientPage, Empty } from "@/components/client/ui";
import { getClientMedia } from "@/lib/client/hub.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/videos")({
  head: () => ({ meta: [{ title: "Videos · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientMedia(),
  staleTime: 30_000,
  component: Videos,
});

function Videos() {
  const { media } = Route.useLoaderData();
  const videos = useMemo(() => media.filter((m) => m.kind === "video"), [media]);
  const collections = useMemo(
    () => [...new Set(videos.map((v) => v.collection).filter(Boolean))].sort(),
    [videos],
  );
  const [pick, setPick] = useState<string | null>(null);
  const shown = pick ? videos.filter((v) => v.collection === pick) : videos;

  return (
    <ClientPage>
      <ClientHeader
        eyebrow="From MEDIALIFE"
        title="Videos"
        description="Films, phone recordings of the experiences and gameplay we've made for you. Play them here or download the full-quality file."
      />
      {collections.length > 1 ? (
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label="Collections">
          {[null, ...collections].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              aria-pressed={pick === c}
              onClick={() => setPick(c)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--client)] focus-visible:outline-none",
                pick === c
                  ? "border-[var(--client)] bg-[color-mix(in_oklab,var(--client)_16%,transparent)] text-foreground"
                  : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              {c ?? "All"}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-5">
        {shown.length ? (
          <MediaGrid items={shown} />
        ) : (
          <Empty icon={Video} title="No videos yet">
            Videos MEDIALIFE makes for you show up here.
          </Empty>
        )}
      </div>
    </ClientPage>
  );
}
