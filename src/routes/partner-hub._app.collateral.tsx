import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  Camera,
  Clapperboard,
  Download,
  ImagePlay,
  ExternalLink,
  Inbox,
  Maximize2,
  MonitorPlay,
  Plus,
  Megaphone,
  Presentation,
  Sparkles,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { CopyButton, Page, Pill } from "@/components/hub/app/ui";
import { AssetDetails } from "@/components/hub/assets/details";
import { AssetThumb } from "@/components/hub/assets/shared";
import {
  PartnerBanner,
  PartnerTab,
  PartnerTabs,
  TabIntro,
  Tag,
  lift,
  surface,
  type TabDef,
} from "@/components/partner/ui";
import {
  AddTile,
  EntryCard,
  EntryDialog,
  EntryViewer,
  entryView,
  type EntryView,
} from "@/components/partner/collateral-entries";
import { GifsPanel, VideosPanel } from "@/components/partner/showcase";
import { inviteFor, programUrl, usePartnerWorkspace } from "@/components/partner/workspace";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ASSET_SECTIONS, SECTION_META, sectionOf, type AssetSection } from "@/lib/hub/assets";
import {
  COLLATERAL_TABS,
  KIT_GROUPS,
  fillHref,
  kitFor,
  type CollateralEntry,
  type CollateralTab,
  type KitGroup,
  type KitItem,
} from "@/lib/hub/collateral";
import { deletePartnerCollateral, savePartnerCollateral } from "@/lib/hub/collateral.functions";
import { HUB, type HubFile } from "@/lib/hub/model";
import { MEDIALIFE_GIFS, MEDIALIFE_VIDEOS } from "@/lib/hub/showcase";
import { cn } from "@/lib/utils";

const TAB_IDS = ["explain", "show", "videos", "post", "gifs", "photos", "team"] as const;
type TabId = (typeof TAB_IDS)[number];

export const Route = createFileRoute("/partner-hub/_app/collateral")({
  validateSearch: z.object({ tab: z.enum(TAB_IDS).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Collateral · Partner Hub | MEDIALIFE" }] }),
  component: Collateral,
});

const NEW_DAYS = 21;
const isNew = (f: HubFile) => Date.now() - f.createdAt < NEW_DAYS * 86_400_000;

const GROUP_ICONS: Record<KitGroup, LucideIcon> = {
  explain: Presentation,
  show: MonitorPlay,
  post: Megaphone,
  photos: Camera,
};

function Collateral() {
  const ws = usePartnerWorkspace();
  const navigate = useNavigate({ from: Route.fullPath });
  const { tab = "explain" } = Route.useSearch();
  const invite = inviteFor(ws, ws.me.name);
  const hidden = useMemo(() => new Set(ws.collateral.hidden), [ws.collateral.hidden]);
  const items = kitFor(ws.partner.kit).filter((i) => !hidden.has(i.id));
  const router = useRouter();
  const entries = ws.collateral.entries;
  const views = useMemo(
    () => entries.map((e) => entryView(e, ws.library.files)),
    [entries, ws.library.files],
  );
  const [adding, setAdding] = useState<{ tab: CollateralTab; entry?: CollateralEntry } | null>(
    null,
  );
  const [viewing, setViewing] = useState<EntryView | null>(null);
  const [removing, setRemoving] = useState<CollateralEntry | null>(null);
  const canEdit = (e: CollateralEntry) =>
    e.addedBy.kind === "partner" && (ws.me.role === "admin" || e.addedBy.userId === ws.me.id);
  const videoCount = MEDIALIFE_VIDEOS.filter((v) => !hidden.has(v.id)).length;
  const gifCount = MEDIALIFE_GIFS.filter((g) => !hidden.has(g.id)).length;
  const entryCount = (t: CollateralTab) => entries.filter((e) => e.tab === t).length;
  const [zoom, setZoom] = useState<KitItem | null>(null);
  const [file, setFile] = useState<HubFile | null>(null);
  const [section, setSection] = useState<AssetSection | "all">("all");

  // Loose files from the team; files that belong to a piece show with it instead.
  const uploads = useMemo(() => {
    const used = new Set(entries.flatMap((e) => [e.fileId, e.previewFileId]));
    return ws.library.files
      .filter((f) => f.complete && f.uploadedBy === "medialife" && !used.has(f.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [ws.library.files, entries]);
  const freshCount = uploads.filter(isNew).length;
  const sectionsHere = ASSET_SECTIONS.filter((s) => uploads.some((f) => sectionOf(f) === s));
  const shownUploads = uploads.filter((f) => section === "all" || sectionOf(f) === section);
  const fill = (href: string) => fillHref(href, { partner: ws.partner.id, invite });
  const abs = (href: string) => (href.startsWith("/") ? `${ws.origin}${href}` : href);
  const banner =
    items.find((i) => i.id === "stream-diorama")?.href ?? items.find((i) => i.preview)?.preview;

  const count = (n: number) => (
    <span className="text-xs text-muted-foreground tabular-nums">{n}</span>
  );
  const groupTab = (g: KitGroup): TabDef<TabId>[] => {
    const n = items.filter((i) => i.group === g).length + entryCount(g);
    return [{ id: g, label: KIT_GROUPS[g].title, icon: GROUP_ICONS[g], badge: count(n) }];
  };
  const tabs: TabDef<TabId>[] = [
    ...groupTab("explain"),
    ...groupTab("show"),
    {
      id: "videos",
      label: "Videos",
      icon: Clapperboard,
      badge: count(videoCount + entryCount("videos")),
    },
    ...groupTab("post"),
    {
      id: "gifs",
      label: "Email GIFs",
      icon: ImagePlay,
      badge: count(gifCount + entryCount("gifs")),
    },
    ...groupTab("photos"),
    {
      id: "team",
      label: "From MEDIALIFE",
      icon: Sparkles,
      badge: freshCount ? (
        <span className="rounded-full bg-[var(--partner)] px-1.5 text-[10px] font-semibold text-[var(--partner-ink)]">
          {freshCount} new
        </span>
      ) : (
        count(uploads.length)
      ),
    },
  ];

  return (
    <Page className="lg:pt-8">
      <PartnerBanner
        image={banner ?? "/partner-kit/medialife/shelf-preview.webp"}
        eyebrow="Collateral"
        title="Your kit"
        description="Ready to send, post and print, each with your links built in. We keep adding to it."
        actions={
          <>
            <Button
              onClick={() =>
                setAdding({ tab: tab === "team" ? "explain" : (tab as CollateralTab) })
              }
            >
              <Plus aria-hidden /> Add collateral
            </Button>
            <Button asChild variant="outline" className="bg-black/30 backdrop-blur">
              <a
                href={`mailto:${HUB.supportEmail}?subject=${encodeURIComponent(`Collateral request from ${ws.partner.name}`)}`}
              >
                <Inbox aria-hidden /> Request something
              </a>
            </Button>
          </>
        }
      />

      <PartnerTabs
        tabs={tabs}
        value={tab}
        label="Collateral"
        onChange={(t) =>
          void navigate({
            search: { tab: t === "explain" ? undefined : t },
            replace: true,
            resetScroll: false,
          })
        }
      >
        {(Object.keys(KIT_GROUPS) as KitGroup[]).map((g) => (
          <PartnerTab key={g} value={g}>
            <TabIntro>{KIT_GROUPS[g].blurb}</TabIntro>
            <ul
              className={cn(
                "grid gap-3",
                g === "photos"
                  ? "grid-cols-2 @3xl/inset:grid-cols-3"
                  : "grid-cols-1 @2xl/inset:grid-cols-2 @5xl/inset:grid-cols-3",
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
            <Added
              tab={g}
              views={views}
              origin={ws.origin}
              partnerName={ws.partner.name}
              canEdit={canEdit}
              onAdd={(tab) => setAdding({ tab })}
              onEdit={(entry) => setAdding({ tab: entry.tab, entry })}
              onDelete={setRemoving}
              onOpen={setViewing}
            />
          </PartnerTab>
        ))}

        <PartnerTab value="videos">
          <TabIntro>
            Real activations on video: standees, products, fans and creators. Tap any video to play
            it.
          </TabIntro>
          <VideosPanel origin={ws.origin} hidden={hidden} />
          <Added
            tab="videos"
            views={views}
            origin={ws.origin}
            partnerName={ws.partner.name}
            canEdit={canEdit}
            onAdd={(tab) => setAdding({ tab })}
            onEdit={(entry) => setAdding({ tab: entry.tab, entry })}
            onDelete={setRemoving}
            onOpen={setViewing}
            portrait
          />
        </PartnerTab>

        <PartnerTab value="gifs">
          <TabIntro>
            Five short loops, each under 2 MB, made to drop into an email or a DM.
          </TabIntro>
          <GifsPanel origin={ws.origin} link={programUrl(ws, invite)} hidden={hidden} />
          <Added
            tab="gifs"
            views={views}
            origin={ws.origin}
            partnerName={ws.partner.name}
            canEdit={canEdit}
            onAdd={(tab) => setAdding({ tab })}
            onEdit={(entry) => setAdding({ tab: entry.tab, entry })}
            onDelete={setRemoving}
            onOpen={setViewing}
            portrait
          />
        </PartnerTab>

        <PartnerTab value="team">
          <TabIntro>
            Decks, case studies, product photos and anything else the MEDIALIFE team adds for you.
          </TabIntro>
          {uploads.length ? (
            <>
              {sectionsHere.length > 1 ? (
                <div
                  role="group"
                  aria-label="Filter by section"
                  className="mb-4 flex flex-wrap gap-1.5"
                >
                  {(["all", ...sectionsHere] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={section === s}
                      onClick={() => setSection(s)}
                      className={cn(
                        "h-8 rounded-full border px-3 text-sm focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
                        section === s
                          ? "border-[var(--partner)]/60 bg-[var(--partner)]/15 text-foreground"
                          : "border-white/[0.08] text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {s === "all" ? "All" : SECTION_META[s].label}
                    </button>
                  ))}
                </div>
              ) : null}
              <ul className="grid grid-cols-2 gap-3 @md/inset:grid-cols-3 @3xl/inset:grid-cols-5">
                {shownUploads.map((f) => (
                  <li key={f.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setFile(f)}
                      className={cn(surface, lift, "block w-full overflow-hidden text-left")}
                    >
                      <AssetThumb file={f} className="aspect-square" />
                      <span className="block truncate px-3 pt-2.5 text-sm font-medium">
                        {f.name}
                      </span>
                      <span className="block truncate px-3 pb-3 text-[11px] text-muted-foreground">
                        {SECTION_META[sectionOf(f)].label}
                      </span>
                    </button>
                    {isNew(f) ? (
                      <span className="pointer-events-none absolute top-2 left-2">
                        <Pill tone="primary">New</Pill>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div
              className={cn(
                surface,
                "grid place-items-center gap-2 border-dashed px-6 py-12 text-center",
              )}
            >
              <Sparkles className="size-8 text-[var(--partner)]" aria-hidden />
              <p className="font-medium">Nothing extra yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                New decks, case studies and graphics from the team land here, and on your Home page.
              </p>
            </div>
          )}
        </PartnerTab>
      </PartnerTabs>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-h-[94dvh] w-[calc(100vw-1.5rem)] max-w-5xl gap-0 overflow-y-auto p-0">
          {zoom ? (
            <>
              <div className="bg-black/40 p-3 sm:p-4">
                <img
                  src={zoom.kind === "image" ? zoom.href : zoom.preview}
                  alt={zoom.title}
                  className="mx-auto max-h-[68dvh] w-auto rounded-lg object-contain"
                />
              </div>
              <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="max-w-2xl min-w-0">
                  <DialogTitle className="text-lg">{zoom.title}</DialogTitle>
                  <DialogDescription className="mt-1">{zoom.what}</DialogDescription>
                  <p className="mt-2 text-sm">
                    <span className="font-medium text-[var(--partner)]">Use it: </span>
                    {zoom.when}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {zoom.kind === "link" ? (
                    <>
                      <CopyButton
                        value={abs(fill(zoom.href))}
                        label="Copy link"
                        variant="default"
                      />
                      <Button asChild variant="outline">
                        <a href={fill(zoom.href)} target="_blank" rel="noopener">
                          <ExternalLink aria-hidden /> Open
                        </a>
                      </Button>
                    </>
                  ) : (
                    <Button asChild>
                      <a href={zoom.href} download>
                        <Download aria-hidden /> Download
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <EntryDialog
        open={!!adding}
        onOpenChange={(o) => !o && setAdding(null)}
        owner={ws.library.ownOwner}
        initial={adding?.entry ?? null}
        defaultTab={adding?.tab ?? "explain"}
        heading={adding?.entry ? "Edit your collateral" : `Add collateral for ${ws.partner.name}`}
        onSave={async (input) => {
          const r = await savePartnerCollateral({ data: input });
          if (r.ok) await router.invalidate();
          return r;
        }}
      />
      <EntryViewer view={viewing} origin={ws.origin} onClose={() => setViewing(null)} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from everyone's collateral, and its file is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const e = removing;
                setRemoving(null);
                if (!e) return;
                const r = await deletePartnerCollateral({ data: { id: e.id } });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Removed");
                await router.invalidate();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    <li className={cn(surface, "group flex flex-col overflow-hidden")}>
      <button
        type="button"
        onClick={onZoom}
        className="relative block aspect-[16/10] overflow-hidden bg-[var(--partner-ink)] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none focus-visible:ring-inset"
        aria-label={`Preview ${i.title}`}
      >
        {preview ? (
          <>
            {/* The same image, blurred, fills the frame behind odd aspect ratios. */}
            <img
              src={preview}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl"
            />
            <img
              src={preview}
              alt=""
              loading="lazy"
              className={cn(
                "relative size-full transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none",
                i.kind === "link" ? "object-cover object-top" : "object-contain",
              )}
            />
          </>
        ) : null}
        <span className="absolute top-2.5 left-2.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium backdrop-blur">
          {i.format}
        </span>
        <Maximize2
          className="absolute top-2.5 right-2.5 size-7 rounded-full bg-black/60 p-1.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </button>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-medium">{i.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{i.when}</p>
        {i.channels?.length ? (
          <ul className="mt-3 flex flex-wrap gap-1" aria-label="Works well on">
            {i.channels.map((c) => (
              <li key={c}>
                <Tag tone="blue" className="h-5 px-2 text-[10px]">
                  {c}
                </Tag>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          {i.kind === "link" ? (
            <>
              <CopyButton value={absolute} label="Copy link" size="sm" variant="default" />
              <Button asChild size="sm" variant="outline">
                <a href={href} target="_blank" rel="noopener">
                  <ExternalLink aria-hidden /> Open
                </a>
              </Button>
              {i.id === "merch-shelf" ? (
                <Button asChild size="sm" variant="ghost">
                  <Link to="/partner-hub/links">
                    <Wand2 aria-hidden /> Personalise
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
                size="icon"
                variant="ghost"
                ariaLabel={`Copy a link to ${i.title}`}
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
    <li className={cn(surface, "group relative overflow-hidden")}>
      <button
        type="button"
        onClick={onZoom}
        className="block w-full focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none focus-visible:ring-inset"
        aria-label={`Preview ${i.title}`}
      >
        <img
          src={i.href}
          alt=""
          loading="lazy"
          className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
      </button>
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/85 to-transparent p-3 pt-8">
        <span className="pointer-events-none min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{i.title}</span>
          <span className="block truncate text-[11px] text-white/65">{i.format}</span>
        </span>
        <a
          href={i.href}
          download
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 backdrop-blur hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none"
          aria-label={`Download ${i.title}`}
        >
          <Download className="size-4" aria-hidden />
        </a>
      </div>
    </li>
  );
}

/** Pieces added for this partner: MEDIALIFE's, then the team's own, with a tile to add more. */
function Added({
  tab,
  views,
  origin,
  partnerName,
  canEdit,
  portrait,
  onAdd,
  onEdit,
  onDelete,
  onOpen,
}: {
  tab: CollateralTab;
  views: EntryView[];
  origin: string;
  partnerName: string;
  canEdit: (e: CollateralEntry) => boolean;
  portrait?: boolean;
  onAdd: (tab: CollateralTab) => void;
  onEdit: (e: CollateralEntry) => void;
  onDelete: (e: CollateralEntry) => void;
  onOpen: (v: EntryView) => void;
}) {
  const here = views.filter((v) => v.entry.tab === tab);
  const medialife = here.filter((v) => v.entry.addedBy.kind === "medialife");
  const team = here.filter((v) => v.entry.addedBy.kind === "partner");
  const grid = portrait
    ? "grid grid-cols-2 gap-3 @2xl/inset:grid-cols-3 @4xl/inset:grid-cols-4 @6xl/inset:grid-cols-5"
    : "grid grid-cols-1 gap-3 @2xl/inset:grid-cols-2 @5xl/inset:grid-cols-3";
  const card = (v: EntryView) => (
    <EntryCard
      key={v.entry.id}
      view={v}
      origin={origin}
      portrait={portrait}
      partnerName={partnerName}
      canEdit={canEdit(v.entry)}
      onOpen={() => onOpen(v)}
      onEdit={() => onEdit(v.entry)}
      onDelete={() => onDelete(v.entry)}
    />
  );
  return (
    <>
      {medialife.length ? (
        <section aria-label="More from MEDIALIFE" className="mt-8">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">More from MEDIALIFE</h3>
          <ul className={grid}>{medialife.map(card)}</ul>
        </section>
      ) : null}
      <section aria-label={`From ${partnerName}`} className="mt-8">
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          From your team <span className="font-normal">· only {partnerName} sees these</span>
        </h3>
        <ul className={grid}>
          {team.map(card)}
          <AddTile
            label={`Add to ${COLLATERAL_TABS[tab]}`}
            onClick={() => onAdd(tab)}
            portrait={portrait}
          />
        </ul>
      </section>
    </>
  );
}
