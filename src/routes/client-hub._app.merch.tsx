import { createFileRoute } from "@tanstack/react-router";
import { Check, ExternalLink, Shirt } from "lucide-react";

import {
  ClientHeader,
  ClientPage,
  ClientSection,
  Chip,
  Empty,
  Paragraphs,
  btnGhost,
  card,
  day,
} from "@/components/client/ui";
import { getClientMerch } from "@/lib/client/hub.functions";
import { MERCH_STAGE_LABELS, MERCH_TRACK, type MerchItem } from "@/lib/client/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/merch")({
  head: () => ({ meta: [{ title: "Merch · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientMerch(),
  staleTime: 15_000,
  component: Merch,
});

function Merch() {
  const { merch, posts } = Route.useLoaderData();
  return (
    <ClientPage>
      <ClientHeader
        eyebrow="Activated merch"
        title="Merch drops"
        description="Every drop we're making together and where it is, from first idea to live."
      />
      <div className="mt-6">
        {merch.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {merch.map((m) => (
              <MerchCard key={m.id} m={m} />
            ))}
          </ul>
        ) : (
          <Empty icon={Shirt} title="No drops listed yet">
            New merch and its progress show up here as soon as we start on it.
          </Empty>
        )}
      </div>
      {posts.length ? (
        <ClientSection title="Merch notes" className="max-w-3xl">
          <ol className="grid gap-3">
            {posts.map((p) => (
              <li key={p.id} className={cn(card, "p-5")}>
                <div className="text-xs text-muted-foreground">{day(p.createdAt)}</div>
                <h3 className="mt-1 font-semibold">{p.title}</h3>
                {p.body ? (
                  <Paragraphs text={p.body} className="mt-2 text-sm text-white/80" />
                ) : null}
              </li>
            ))}
          </ol>
        </ClientSection>
      ) : null}
    </ClientPage>
  );
}

function MerchCard({ m }: { m: MerchItem }) {
  const at = MERCH_TRACK.indexOf(m.stage);
  return (
    <li className={cn(card, "flex flex-col overflow-hidden sm:flex-row")}>
      <div className="grid aspect-[4/3] shrink-0 place-items-center bg-white/[0.04] sm:aspect-auto sm:w-44">
        {m.image ? (
          <img src={m.image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <Shirt className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            tone={
              m.stage === "live"
                ? "good"
                : m.stage === "paused" || m.stage === "sold-out"
                  ? "warn"
                  : "accent"
            }
          >
            {MERCH_STAGE_LABELS[m.stage]}
          </Chip>
          {m.eta ? <span className="text-xs text-muted-foreground">{m.eta}</span> : null}
        </div>
        <h2 className="mt-2 text-base font-semibold">{m.name}</h2>
        {m.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
        ) : null}
        {at >= 0 ? (
          <ol className="mt-4 flex items-center gap-1" aria-label="Progress">
            {MERCH_TRACK.map((s, i) => (
              <li key={s} className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={cn(
                    "h-1.5 rounded-full",
                    i <= at ? "bg-[var(--client)]" : "bg-white/10",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex items-center gap-1 truncate text-[10px]",
                    i === at ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {i < at ? <Check className="size-3 shrink-0" aria-hidden /> : null}
                  {MERCH_STAGE_LABELS[s]}
                  <span className="sr-only">{i < at ? " (done)" : i === at ? " (now)" : ""}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
        {m.link ? (
          <a
            href={m.link.url}
            target="_blank"
            rel="noreferrer"
            className={cn(btnGhost, "mt-4 h-9")}
          >
            {m.link.label} <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </div>
    </li>
  );
}
