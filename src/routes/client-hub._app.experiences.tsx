import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Smartphone, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { CopyButton } from "@/components/hub/app/ui";
import {
  ClientHeader,
  ClientPage,
  Chip,
  Empty,
  btnGhost,
  btnPrimary,
  card,
} from "@/components/client/ui";
import { useClientWorkspace } from "@/components/client/workspace";
import { cn } from "@/lib/utils";

// The client's experiences, read from the public Labs catalogue (/labs/catalog.json)
// with the same rules as the client's own Labs page: entries for this client
// unless they say "share": false, with the "share" overrides applied.

export const Route = createFileRoute("/client-hub/_app/experiences")({
  head: () => ({ meta: [{ title: "Experiences · Client Hub | MEDIALIFE" }] }),
  component: Experiences,
});

type Entry = {
  slug: string;
  title: string;
  lead: string;
  url: string;
  thumb?: string;
  alt?: string;
  client?: string;
  status?: string;
  tech?: string[];
  share?:
    | false
    | {
        title?: string;
        lead?: string;
        needs?: string;
        start?: number;
        links?: { label: string; url: string }[];
      };
  extraLinks?: { label: string; url: string }[];
};

const TECH: Record<string, string> = {
  "image-target": "On the merch",
  world: "In your room",
  face: "Selfie",
  sky: "Sky AR",
  "web-3d": "Any screen",
};
const internal = (url: string) => /^\/labs\/(?!img\/|collector-hub\/)/.test(url);

function Experiences() {
  const ws = useClientWorkspace();
  const [items, setItems] = useState<ReturnType<typeof view>[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [origin, setOrigin] = useState("https://medialife.ai");

  useEffect(() => {
    setOrigin(window.location.origin);
    let live = true;
    fetch("/labs/catalog.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((all: Entry[]) => {
        if (!live) return;
        const mine = all
          .map((e, i) => ({ e, i }))
          .filter(({ e }) => e.client === ws.client.catalogClient && e.share !== false && e.url);
        const list = mine.map(({ e, i }) => view(e, i));
        list.sort((a, b) => (a.start || 999) - (b.start || 999) || a.i - b.i);
        setItems(list);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [ws.client.catalogClient]);

  return (
    <ClientPage>
      <ClientHeader
        eyebrow={`${ws.client.name} experiences`}
        title="Every experience, ready to show"
        description="Open any of them on your phone. Links work for anyone you send them to."
        actions={
          ws.client.experiencesUrl ? (
            <a
              href={ws.client.experiencesUrl}
              target="_blank"
              rel="noreferrer"
              className={btnPrimary}
            >
              Open the showcase page <ArrowUpRight className="size-4" aria-hidden />
            </a>
          ) : null
        }
      />
      <div className="mt-6">
        {failed ? (
          <Empty icon={Sparkles} title="Couldn't load the experiences">
            Check your connection and refresh the page.
          </Empty>
        ) : !items ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className={cn(card, "h-72 animate-pulse")} />
            ))}
          </ul>
        ) : items.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((x) => (
              <li key={x.slug} className={cn(card, "flex flex-col overflow-hidden")}>
                <div className="aspect-[16/10] bg-black">
                  {x.thumb ? (
                    <img
                      src={x.thumb}
                      alt={x.alt}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex flex-wrap gap-1.5">
                    {x.start ? <Chip tone="accent">Start here</Chip> : null}
                    {x.tags.map((t) => (
                      <Chip key={t}>{t}</Chip>
                    ))}
                  </div>
                  <h2 className="mt-2 font-semibold">{x.title}</h2>
                  <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{x.lead}</p>
                  {x.needs ? (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Smartphone className="size-3.5" aria-hidden /> {x.needs}
                    </p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                    <a
                      href={x.url}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(btnPrimary, "h-9")}
                    >
                      Open <ArrowUpRight className="size-4" aria-hidden />
                    </a>
                    <CopyButton value={`${origin}${x.url}`} label="Copy link" />
                    {x.links.slice(0, 2).map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(btnGhost, "h-9")}
                      >
                        {l.label}
                      </a>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={Sparkles} title="No experiences listed yet">
            Experiences MEDIALIFE builds for you show up here.
          </Empty>
        )}
      </div>
    </ClientPage>
  );
}

function view(e: Entry, i: number) {
  const s = (e.share || {}) as Exclude<Entry["share"], false | undefined>;
  return {
    slug: e.slug,
    i,
    url: e.url,
    thumb: e.thumb,
    alt: e.alt || e.title,
    title: s.title || e.title,
    lead: s.lead || e.lead,
    needs: s.needs || "",
    start: s.start || 0,
    links: (s.links || e.extraLinks || []).filter((l) => l?.url && !internal(l.url)),
    tags: (e.tech || []).map((t) => TECH[t]).filter(Boolean),
  };
}
