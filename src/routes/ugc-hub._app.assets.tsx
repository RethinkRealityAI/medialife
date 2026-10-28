import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  FileArchive,
  FileAudio,
  FileText,
  FileType,
  Images,
  Maximize2,
  Play,
  type LucideIcon,
} from "lucide-react";
import { z } from "zod";

import { Card, EmptyState, Page, PageHead, Section } from "@/components/ugc/creator/kit";
import { NoCampaign, UgcPageSkeleton, UgcRouteError } from "@/components/ugc/creator/states";
import { DownloadButton } from "@/components/ugc/shared/download-button";
import { card } from "@/components/ugc/shared/look";
import { MediaDialog } from "@/components/ugc/shared/media";
import { listUgcAssets } from "@/lib/ugc/creator.functions";
import { formatBytes, type UgcAssetGroup, type UgcAssetView } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ugc-hub/_app/assets")({
  validateSearch: z.object({ campaign: z.string().max(60).optional().catch(undefined) }),
  loaderDeps: ({ search }) => ({ campaign: search.campaign }),
  loader: ({ deps }) => listUgcAssets({ data: { campaignId: deps.campaign ?? null } }),
  head: () => ({ meta: [{ title: "Assets · EVADE UGC Hub | MEDIALIFE" }] }),
  pendingComponent: () => <UgcPageSkeleton />,
  errorComponent: UgcRouteError,
  component: AssetsPage,
});

const GROUP_ICONS: Partial<Record<UgcAssetGroup, LucideIcon>> = {
  logos: FileType,
  art: Images,
  gameplay: Play,
  sounds: FileAudio,
  overlays: Images,
  splash: Images,
  other: FileText,
};

const ext = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "FILE";

function AssetsPage() {
  const data = Route.useLoaderData();
  const [open, setOpen] = useState<UgcAssetView | null>(null);

  if (!data)
    return (
      <Page>
        <NoCampaign what="asset kit" />
      </Page>
    );

  const total = data.groups.reduce((n, g) => n + g.assets.length, 0);

  return (
    <Page>
      <PageHead kicker="Asset kit" title="Everything you can use">
        Logos, Bobo and Eclipse can art, and Cola Run clips for{" "}
        <span className="text-foreground">{data.campaign.title}</span>. Use them in your edit; don't
        change the logos.
      </PageHead>

      {data.zip ? (
        <Card className="relative isolate mt-6 flex flex-wrap items-center gap-4 overflow-hidden border-[#f6c344]/30 p-5 sm:p-6">
          <span
            aria-hidden
            className="absolute -top-20 -left-10 -z-10 size-64 rounded-full bg-[radial-gradient(closest-side,rgb(246_195_68/0.2),transparent)] blur-xl"
          />
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f6c344]/12 text-[#ffe48a] ring-1 ring-[#f6c344]/30 ring-inset">
            <FileArchive className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="font-semibold">Download all</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              {data.zip.name} · {formatBytes(data.zip.size)}
            </p>
          </div>
          <DownloadButton
            file={data.zip}
            label="Download ZIP"
            className="border-transparent bg-[linear-gradient(180deg,#ffe48a_0%,#f6c344_45%,#e0a21a_100%)] font-semibold text-[#1a1203] hover:bg-[linear-gradient(180deg,#ffe48a_0%,#f6c344_45%,#e0a21a_100%)] hover:brightness-105 max-sm:w-full"
          />
        </Card>
      ) : null}

      {data.groups.length > 1 ? (
        <nav
          aria-label="Asset groups"
          className="-mx-4 mt-6 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
        >
          <ul className="flex w-max gap-2">
            {data.groups.map((g) => (
              <li key={g.group}>
                <a
                  href={`#g-${g.group}`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 text-sm whitespace-nowrap text-[#c9d1d8] transition-colors hover:border-[#3fe6e0]/45 hover:text-foreground focus-visible:outline-2 focus-visible:outline-[#3fe6e0]"
                >
                  {g.label}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {g.assets.length}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {total === 0 ? (
        <EmptyState className="mt-8" title="The kit is being put together" art="can">
          We're adding logos, art and clips. We'll email you when they're here.
        </EmptyState>
      ) : (
        data.groups.map((g) => (
          <Section
            key={g.group}
            id={`g-${g.group}`}
            icon={GROUP_ICONS[g.group]}
            title={g.label}
            description={`${g.assets.length} file${g.assets.length === 1 ? "" : "s"}`}
          >
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.assets.map((a) => (
                <AssetTile key={a.id} asset={a} onOpen={() => setOpen(a)} />
              ))}
            </ul>
          </Section>
        ))
      )}

      {open ? (
        <MediaDialog
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={open.name}
          subtitle={`${formatBytes(open.size)}${open.note ? ` · ${open.note}` : ""}`}
          src={open.url}
          kind={open.isVideo ? "video" : "image"}
          actions={<DownloadButton file={open} icon />}
        />
      ) : null}
    </Page>
  );
}

function AssetTile({ asset: a, onOpen }: { asset: UgcAssetView; onOpen: () => void }) {
  const viewable = a.isImage || a.isVideo;
  const audio = a.mime.startsWith("audio/");
  const preview = (
    <span className="relative block aspect-[4/3] overflow-hidden bg-[conic-gradient(at_50%_50%,#0b1318_25%,#0f1a20_0_50%,#0b1318_0_75%,#0f1a20_0)] bg-[length:18px_18px]">
      {a.isImage ? (
        <img
          src={a.url}
          alt=""
          loading="lazy"
          className="size-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
        />
      ) : a.isVideo ? (
        <>
          <video
            src={`${a.url}#t=0.5`}
            muted
            playsInline
            preload="metadata"
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none size-full bg-black object-cover"
          />
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/30 backdrop-blur-md"
          >
            <Play className="ml-0.5 size-4 fill-current" />
          </span>
        </>
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_top,rgb(63_230_224/0.14),transparent_70%)]">
          {audio ? (
            <FileAudio className="size-8 text-[#3fe6e0]/80" aria-hidden />
          ) : (
            <FileText className="size-8 text-muted-foreground" aria-hidden />
          )}
          <span className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
            {ext(a.name)}
          </span>
        </span>
      )}
      {viewable ? (
        <span
          aria-hidden
          className="absolute top-2 right-2 grid size-7 place-items-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        >
          <Maximize2 className="size-3.5" />
        </span>
      ) : null}
    </span>
  );
  return (
    <li className={cn(card, "group relative flex min-w-0 flex-col overflow-hidden rounded-2xl")}>
      {viewable ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Preview ${a.name}`}
          className="block w-full text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#3fe6e0]"
        >
          {preview}
        </button>
      ) : (
        preview
      )}
      <div className="flex flex-1 items-end gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={a.name}>
            {a.name}
          </p>
          <p className="truncate text-xs text-muted-foreground tabular-nums">
            {ext(a.name)} · {formatBytes(a.size)}
          </p>
        </div>
        <DownloadButton file={a} icon />
      </div>
      {a.note ? (
        <p className="-mt-1 line-clamp-2 px-3 pb-3 text-xs leading-relaxed text-muted-foreground">
          {a.note}
        </p>
      ) : null}
      {audio ? (
        <audio src={a.url} controls preload="none" className="mx-3 mb-3 h-10 w-[calc(100%-1.5rem)]">
          <track kind="captions" />
        </audio>
      ) : null}
    </li>
  );
}
