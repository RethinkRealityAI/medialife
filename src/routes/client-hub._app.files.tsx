import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, FileText, FolderOpen, Link2 } from "lucide-react";
import { useMemo } from "react";

import { MediaGrid } from "@/components/client/media";
import {
  ClientHeader,
  ClientPage,
  ClientSection,
  Chip,
  Empty,
  card,
  cardHover,
  day,
} from "@/components/client/ui";
import { getClientMedia } from "@/lib/client/hub.functions";
import { LINK_KIND_LABELS } from "@/lib/client/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/client-hub/_app/files")({
  head: () => ({ meta: [{ title: "Files · Client Hub | MEDIALIFE" }] }),
  loader: () => getClientMedia(),
  staleTime: 30_000,
  component: Files,
});

function Files() {
  const { media, links } = Route.useLoaderData();
  const docs = useMemo(() => media.filter((m) => m.kind === "document"), [media]);
  const images = useMemo(() => media.filter((m) => m.kind === "image"), [media]);
  const other = useMemo(
    () => media.filter((m) => !["video", "image", "document"].includes(m.kind)),
    [media],
  );
  const nothing = !links.length && !docs.length && !images.length && !other.length;

  return (
    <ClientPage>
      <ClientHeader
        eyebrow="From MEDIALIFE"
        title="Files and documents"
        description="Decks, briefs and documents, plus artwork, logos and photos to use in your own posts."
      />
      {nothing ? (
        <div className="mt-6">
          <Empty icon={FolderOpen} title="No files yet">
            Documents and collateral MEDIALIFE shares with you show up here.
          </Empty>
        </div>
      ) : null}

      {links.length || docs.length ? (
        <ClientSection title="Documents" className="mt-8">
          <ul className="grid gap-3 md:grid-cols-2">
            {links.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target={l.url.startsWith("/") ? undefined : "_blank"}
                  rel="noreferrer"
                  className={cn(card, cardHover, "flex items-start gap-3 p-4")}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[var(--client)]">
                    <Link2 className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{l.title}</span>
                      <Chip>{LINK_KIND_LABELS[l.kind]}</Chip>
                    </span>
                    {l.description ? (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {l.description}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Shared {day(l.createdAt)}
                    </span>
                  </span>
                  <ExternalLink
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
            {docs.map((d) => (
              <li key={d.id}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(card, cardHover, "flex items-start gap-3 p-4")}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[var(--client)]">
                    <FileText className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.title}</span>
                      <Chip>PDF</Chip>
                    </span>
                    {d.description ? (
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {d.description}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Added {day(d.createdAt)}
                    </span>
                  </span>
                  <ExternalLink
                    className="mt-1 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </a>
              </li>
            ))}
          </ul>
        </ClientSection>
      ) : null}

      {images.length ? (
        <ClientSection title="Artwork and photos">
          <MediaGrid items={images} />
        </ClientSection>
      ) : null}
      {other.length ? (
        <ClientSection title="Other files" description="3D models, sounds, archives and more.">
          <MediaGrid items={other} />
        </ClientSection>
      ) : null}
    </ClientPage>
  );
}
