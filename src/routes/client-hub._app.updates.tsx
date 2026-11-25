import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Megaphone } from "lucide-react";

import {
  ClientHeader,
  ClientPage,
  Chip,
  Empty,
  Paragraphs,
  btnGhost,
  card,
  day,
} from "@/components/client/ui";
import { getClientUpdates } from "@/lib/client/hub.functions";
import { POST_KIND_LABELS } from "@/lib/client/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/updates")({
  head: () => ({ meta: [{ title: "Updates · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientUpdates(),
  staleTime: 15_000,
  component: Updates,
});

function Updates() {
  const { posts } = Route.useLoaderData();
  return (
    <ClientPage>
      <ClientHeader
        eyebrow="From MEDIALIFE"
        title="Updates"
        description="News, campaign notes, merch updates and new documents, newest first."
      />
      <div className="mt-6 max-w-3xl">
        {posts.length ? (
          <ol className="grid gap-4">
            {posts.map((p) => (
              <li key={p.id} id={p.id} className={cn(card, "scroll-mt-24 p-5 sm:p-6")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={p.kind === "merch" ? "accent" : "muted"}>
                    {POST_KIND_LABELS[p.kind]}
                  </Chip>
                  {p.pinned ? <Chip tone="warn">Pinned</Chip> : null}
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={new Date(p.createdAt).toISOString()}
                  >
                    {day(p.createdAt)}
                  </time>
                </div>
                <h2 className="mt-3 text-lg font-semibold tracking-tight">{p.title}</h2>
                {p.body ? (
                  <Paragraphs
                    text={p.body}
                    className="mt-2 text-sm leading-relaxed text-white/80"
                  />
                ) : null}
                {p.link ? (
                  <a
                    href={p.link.url}
                    target={p.link.url.startsWith("/") ? undefined : "_blank"}
                    rel="noreferrer"
                    className={cn(btnGhost, "mt-4")}
                  >
                    {p.link.label} <ExternalLink className="size-4" aria-hidden />
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon={Megaphone} title="No updates yet">
            When MEDIALIFE has news for your team, it shows up here.
          </Empty>
        )}
      </div>
    </ClientPage>
  );
}
