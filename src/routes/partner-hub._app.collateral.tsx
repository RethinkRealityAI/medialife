import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ExternalLink, FileText, Globe, Inbox, Maximize2 } from "lucide-react";

import { CopyButton, Page, PageHeader, Pill } from "@/components/hub/app/ui";
import { AssetDetails } from "@/components/hub/assets/details";
import { AssetThumb } from "@/components/hub/assets/shared";
import { inviteFor, usePartnerWorkspace } from "@/components/partner/workspace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ASSET_SECTIONS, SECTION_META, sectionOf, type AssetSection } from "@/lib/hub/assets";
import { KIT_GROUPS, fillHref, kitFor, type KitGroup, type KitItem } from "@/lib/hub/collateral";
import { HUB, type HubFile } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/partner-hub/_app/collateral")({
  head: () => ({ meta: [{ title: "Collateral · Partner Hub | MEDIALIFE" }] }),
  component: Collateral,
});

const NEW_DAYS = 21;

function Collateral() {
  const ws = usePartnerWorkspace();
  const invite = inviteFor(ws, ws.me.name);
  const items = kitFor(ws.partner.kit);
  const [zoom, setZoom] = useState<KitItem | null>(null);
  const [file, setFile] = useState<HubFile | null>(null);
  const [section, setSection] = useState<AssetSection | "all">("all");
  const groups = (Object.keys(KIT_GROUPS) as KitGroup[]).filter((g) =>
    items.some((i) => i.group === g),
  );

  const uploads = useMemo(
    () => ws.library.files.filter((f) => f.complete).sort((a, b) => b.createdAt - a.createdAt),
    [ws.library.files],
  );
  const sectionsHere = ASSET_SECTIONS.filter((s) => uploads.some((f) => sectionOf(f) === s));
  const shownUploads = uploads.filter((f) => section === "all" || sectionOf(f) === section);
  const fill = (href: string) => fillHref(href, { partner: ws.partner.id, invite });
  const abs = (href: string) => (href.startsWith("/") ? `${ws.origin}${href}` : href);

  return (
    <Page className="lg:pt-8">
      <PageHeader
        title="Collateral"
        description="Everything to explain, show and post about activated merch, made for you. Each piece says what it's for and when to use it. We keep adding to it."
        actions={
          <Button asChild variant="outline" size="sm">
            <a
              href={`mailto:${HUB.supportEmail}?subject=${encodeURIComponent(`Collateral request from ${ws.partner.name}`)}`}
            >
              <Inbox aria-hidden /> Request something
            </a>
          </Button>
        }
      />

      <nav aria-label="Collateral sections" className="mt-5 -mx-4 overflow-x-auto px-4">
        <ul className="flex w-max gap-1.5">
          {[...groups, ...(uploads.length ? (["uploads"] as const) : [])].map((g) => (
            <li key={g}>
              <a
                href={`#${g}`}
                className="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {g === "uploads" ? "From the MEDIALIFE team" : KIT_GROUPS[g].title}
                {g === "uploads" ? (
                  <span className="ml-1.5 text-xs tabular-nums">{uploads.length}</span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {uploads.some((f) => Date.now() - f.createdAt < NEW_DAYS * 86_400_000) ? (
        <a
          href="#uploads"
          className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--partner)]/40 bg-[var(--partner)]/10 px-4 py-3 text-sm"
        >
          <Pill tone="primary">New</Pill>
          The MEDIALIFE team added new materials. See them below.
        </a>
      ) : null}

      {groups.map((g) => (
        <section key={g} id={g} aria-labelledby={`${g}-title`} className="mt-10 scroll-mt-20">
          <h2 id={`${g}-title`} className="text-lg font-medium tracking-tight">
            {KIT_GROUPS[g].title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{KIT_GROUPS[g].blurb}</p>
          <ul
            className={cn(
              "mt-4 grid grid-cols-1 gap-3",
              g === "photos"
                ? "grid-cols-2 @3xl/inset:grid-cols-3"
                : "@2xl/inset:grid-cols-2 @5xl/inset:grid-cols-3",
            )}
          >
            {items
              .filter((i) => i.group === g)
              .map((i) =>
                g === "photos" ? (
                  <PhotoCard key={i.id} item={i} onZoom={() => setZoom(i)} />
                ) : (
                  <KitCard
                    key={i.id}
                    item={i}
                    href={fill(i.href)}
                    absolute={abs(fill(i.href))}
                    onZoom={() => setZoom(i)}
                  />
                ),
              )}
          </ul>
        </section>
      ))}

      <section id="uploads" aria-labelledby="uploads-title" className="mt-12 scroll-mt-20">
        <h2 id="uploads-title" className="text-lg font-medium tracking-tight">
          From the MEDIALIFE team
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Decks, case studies, product photos and anything else we add for you. New files show up
          here first.
        </p>
        {uploads.length ? (
          <>
            {sectionsHere.length > 1 ? (
              <div
                role="group"
                aria-label="Filter by section"
                className="mt-4 flex flex-wrap gap-1.5"
              >
                {(["all", ...sectionsHere] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={section === s}
                    onClick={() => setSection(s)}
                    className={cn(
                      "h-8 rounded-full border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      section === s
                        ? "border-[var(--partner)] bg-[var(--partner)]/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s === "all" ? "All" : SECTION_META[s].label}
                  </button>
                ))}
              </div>
            ) : null}
            <ul className="mt-4 grid grid-cols-2 gap-2.5 @md/inset:grid-cols-3 @3xl/inset:grid-cols-5">
              {shownUploads.map((f) => (
                <li key={f.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setFile(f)}
                    className="block w-full overflow-hidden rounded-xl border border-border text-left hover:border-[var(--partner)]/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <AssetThumb file={f} className="aspect-square" />
                    <span className="block truncate px-2.5 pt-2 text-xs font-medium">{f.name}</span>
                    <span className="block truncate px-2.5 pb-2.5 text-[11px] text-muted-foreground">
                      {SECTION_META[sectionOf(f)].label}
                    </span>
                  </button>
                  {Date.now() - f.createdAt < NEW_DAYS * 86_400_000 ? (
                    <span className="pointer-events-none absolute top-2 left-2">
                      <Pill tone="primary">New</Pill>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Nothing extra yet. When the MEDIALIFE team adds case studies, product photos or new
            graphics for you, they appear here, and on your Home page.
          </p>
        )}
      </section>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-5xl gap-3 overflow-y-auto p-3 sm:p-4">
          <DialogTitle className="pr-8 text-base">{zoom?.title}</DialogTitle>
          <DialogDescription className="sr-only">{zoom?.what}</DialogDescription>
          {zoom ? (
            <img
              src={zoom.kind === "pdf" ? zoom.preview : zoom.href}
              alt={zoom.title}
              className="max-h-[78dvh] w-full rounded-lg object-contain"
            />
          ) : null}
          {zoom ? (
            <div className="flex justify-end">
              <Button asChild>
                <a href={zoom.href} download>
                  <Download aria-hidden /> Download
                </a>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AssetDetails
        mode="admin"
        readOnly
        file={file}
        open={!!file}
        onOpenChange={(o) => !o && setFile(null)}
        folders={ws.library.folders}
        yourTags={[]}
        usedIn={[]}
        canEdit={false}
        canDelete={false}
        onPatch={() => {}}
        onDeleted={() => {}}
      />
    </Page>
  );
}

function KitCard({
  item: i,
  href,
  absolute,
  onZoom,
}: {
  item: KitItem;
  href: string;
  absolute: string;
  onZoom: () => void;
}) {
  const preview = i.kind === "image" ? i.href : i.preview;
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-border bg-gradient-to-b from-white/[0.035] to-white/[0.01]">
      {preview ? (
        <button
          type="button"
          onClick={onZoom}
          className="group relative block aspect-[16/9] overflow-hidden bg-black/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          aria-label={`Preview ${i.title}`}
        >
          <img
            src={preview}
            alt=""
            loading="lazy"
            className="size-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <Maximize2
            className="absolute top-2 right-2 size-7 rounded-full bg-background/80 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </button>
      ) : (
        <div className="grid aspect-[16/9] place-items-center bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--partner)_30%,transparent),transparent_70%)]">
          {i.kind === "link" ? (
            <Globe className="size-8 text-[var(--partner)]" aria-hidden />
          ) : (
            <FileText className="size-8 text-[var(--partner)]" aria-hidden />
          )}
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{i.title}</h3>
          <span className="shrink-0 text-[11px] text-muted-foreground">{i.format}</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{i.what}</p>
        <p className="mt-2 text-sm leading-relaxed">
          <span className="font-medium text-[var(--partner)]">When to use it: </span>
          {i.when}
        </p>
        {i.channels?.length ? (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Works well on">
            {i.channels.map((c) => (
              <li
                key={c}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {c}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {i.kind === "link" ? (
            <>
              <CopyButton
                value={absolute}
                label="Copy link"
                copiedLabel="Copied"
                size="sm"
                variant="default"
              />
              <Button asChild size="sm" variant="outline">
                <a href={href} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden /> Open
                </a>
              </Button>
              {i.id === "merch-shelf" ? (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/partner-hub/links" hash="shelf">
                    Personalise
                  </Link>
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button asChild size="sm">
                <a href={i.href} download>
                  <Download aria-hidden /> Download
                </a>
              </Button>
              {i.kind === "pdf" ? (
                <Button asChild size="sm" variant="outline">
                  <a href={i.href} target="_blank" rel="noopener">
                    <ExternalLink aria-hidden /> Open
                  </a>
                </Button>
              ) : null}
              <CopyButton
                value={absolute}
                label="Copy link"
                copiedLabel="Copied"
                size="sm"
                variant="ghost"
              />
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function PhotoCard({ item: i, onZoom }: { item: KitItem; onZoom: () => void }) {
  return (
    <li className="group relative overflow-hidden rounded-xl border border-border">
      <button
        type="button"
        onClick={onZoom}
        className="block w-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        aria-label={`Preview ${i.title}`}
      >
        <img src={i.href} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
      </button>
      <div className="flex items-center gap-2 p-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{i.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{i.format}</span>
        </span>
        <a
          href={i.href}
          download
          className="grid size-8 shrink-0 place-items-center rounded-md border border-border hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Download ${i.title}`}
        >
          <Download className="size-4" aria-hidden />
        </a>
      </div>
    </li>
  );
}
