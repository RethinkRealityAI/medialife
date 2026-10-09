import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Copy,
  CopyPlus,
  ExternalLink,
  Images,
  Link2,
  MoreHorizontal,
  PencilLine,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AssetLibrary } from "@/components/ar-builder/asset-library";
import { NewShelfDialog } from "@/components/admin/shelves/new-shelf-dialog";
import { QuickLinkGenerator } from "@/components/admin/shelves/quick-link";
import {
  absoluteUrl,
  copyText,
  shelvesQueryKey,
  STATUS_LABEL,
} from "@/components/admin/shelves/shared";
import { PageHeader, Panel, Pill } from "@/components/portal/kit";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteShelfFn, duplicateShelfFn, listShelvesFn } from "@/lib/shelf/shelves.functions";
import { shelfDemoId, shelfPath, type ShelfSummary } from "@/lib/shelf/shelves";

// Creator Merch Shelves: every shelf the team has made, newest first, and the
// quick-link generator for a name-only shelf that needs no publishing.

export const Route = createFileRoute("/admin/shelves/")({
  component: ShelvesPage,
});

function ShelvesPage() {
  const qc = useQueryClient();
  const shelves = useQuery({ queryKey: shelvesQueryKey, queryFn: () => listShelvesFn() });
  const [creating, setCreating] = useState(false);
  const [library, setLibrary] = useState(false);
  const [confirm, setConfirm] = useState<ShelfSummary | null>(null);

  const duplicate = useMutation({
    mutationFn: (slug: string) => duplicateShelfFn({ data: { slug } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: shelvesQueryKey });
      if (r.ok) toast.success(`Made “${r.summary.name}”`);
    },
    onError: () => toast.error("Couldn't duplicate the shelf"),
  });
  const remove = useMutation({
    mutationFn: (slug: string) => deleteShelfFn({ data: { slug } }),
    onSuccess: async (_r, slug) => {
      qc.setQueryData<ShelfSummary[]>(shelvesQueryKey, (list) =>
        list?.filter((s) => s.slug !== slug),
      );
      await qc.invalidateQueries({ queryKey: shelvesQueryKey });
      toast.success("Shelf deleted");
    },
    onError: () => toast.error("Couldn't delete the shelf"),
  });

  const newButton = (
    <button
      type="button"
      onClick={() => setCreating(true)}
      className="btn-pill btn-ember px-5 py-2 text-sm font-medium pointer-coarse:min-h-11"
    >
      <Plus className="size-4" aria-hidden /> New shelf
    </button>
  );

  return (
    <>
      <PageHeader
        eyebrow="Creator Merch Shelf"
        title="Merch shelves"
        actions={
          <>
            <Button
              variant="outline"
              className="pointer-coarse:h-11"
              onClick={() => setLibrary(true)}
            >
              <Images aria-hidden /> Asset library
            </Button>
            {newButton}
          </>
        }
      />
      <div className="grid gap-8 px-4 py-8 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Shelves" className="min-w-0">
          {shelves.isPending ? (
            <CardGrid>
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="overflow-hidden rounded-xl border border-border">
                  <Skeleton className="aspect-[1200/630] rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </li>
              ))}
            </CardGrid>
          ) : shelves.isError ? (
            <EmptyState
              icon={<AlertTriangle aria-hidden />}
              title="Couldn't load your shelves"
              body="Check your connection and try again."
              action={
                <Button variant="outline" onClick={() => shelves.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : !shelves.data.length ? (
            <EmptyState
              icon={<Store aria-hidden />}
              title="No shelves yet"
              body="A shelf is a 3D merch shop made for one creator: their name in neon, their logo on every product, and what fans experience when they scan it. Make one for the next creator you pitch."
              action={newButton}
            />
          ) : (
            <CardGrid>
              {shelves.data.map((s) => (
                <ShelfCard
                  key={s.slug}
                  s={s}
                  onDuplicate={() => duplicate.mutate(s.slug)}
                  onDelete={() => setConfirm(s)}
                />
              ))}
            </CardGrid>
          )}
        </section>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <QuickLinkGenerator />
        </aside>
      </div>

      <NewShelfDialog open={creating} onOpenChange={setCreating} shelves={shelves.data ?? []} />
      <AssetLibrary open={library} onOpenChange={setLibrary} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.publishedAt
                ? `Its link, medialife.ai/shelf/${confirm.slug}, stops working for everyone, including personal links. `
                : ""}
              The draft is deleted too. Uploaded logos stay in the asset library. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="pointer-coarse:[&_:is(button,a)]:h-11">
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirm && remove.mutate(confirm.slug)}
            >
              Delete shelf
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">{children}</ul>;
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <Panel className="mx-auto flex max-w-lg flex-col items-center px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-border bg-white/[0.03] text-muted-foreground [&_svg]:size-5">
        {icon}
      </span>
      <h2 className="mt-5 text-lg font-medium">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-6">{action}</div>
    </Panel>
  );
}

/** No snapshot yet: the name in the shelf's neon, like the sign. */
function NeonPlaceholder({ name, neon }: { name: string; neon: string }) {
  return (
    <div
      className="grid size-full place-items-center px-6"
      style={{
        background: `radial-gradient(ellipse at 50% 30%, ${neon}26, transparent 65%), #0b0a10`,
      }}
    >
      <span
        className="max-w-full truncate text-center text-2xl font-semibold tracking-tight uppercase"
        style={{
          color: "#fff",
          textShadow: `0 0 6px ${neon}, 0 0 18px ${neon}, 0 0 36px ${neon}`,
        }}
      >
        {name}
      </span>
    </div>
  );
}

function ShelfCard({
  s,
  onDuplicate,
  onDelete,
}: {
  s: ShelfSummary;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const live = s.status !== "draft";
  const url = absoluteUrl(shelfPath(s.slug));
  return (
    <li className="group relative">
      <Panel className="overflow-hidden transition-colors group-focus-within:border-primary/45 group-hover:border-primary/45">
        <div className="relative aspect-[1200/630] overflow-hidden border-b border-border">
          {s.snapshot ? (
            <img
              src={s.snapshot}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <NeonPlaceholder name={s.creator} neon={s.neon} />
          )}
          <Pill
            tone={s.status === "published" ? "live" : s.status === "changed" ? "watch" : "muted"}
            className="absolute top-3 left-3 bg-background/80 backdrop-blur"
          >
            {STATUS_LABEL[s.status]}
          </Pill>
        </div>
        <div className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium tracking-tight">
              <Link
                to="/admin/shelves/$slug"
                params={{ slug: s.slug }}
                className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {s.creator}
              </Link>
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {s.name}
              {s.handle ? <span className="text-muted-foreground/70"> · {s.handle}</span> : null}
            </p>
            <p className="mono mt-3 truncate text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              Edited {formatDistanceToNow(s.updatedAt, { addSuffix: true })}
              {s.publishedAt && live
                ? ` · live since ${formatDistanceToNow(s.publishedAt, { addSuffix: true })}`
                : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative z-10 -mr-1 size-8 shrink-0 pointer-coarse:size-11"
                aria-label={`Actions for ${s.name}`}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 pointer-coarse:[&_[role=menuitem]]:py-3"
            >
              <DropdownMenuItem asChild>
                <Link to="/admin/shelves/$slug" params={{ slug: s.slug }}>
                  <PencilLine aria-hidden /> Open
                </Link>
              </DropdownMenuItem>
              {live ? (
                <>
                  <DropdownMenuItem
                    onSelect={async () => {
                      if (await copyText(url)) toast.success("Link copied");
                    }}
                  >
                    <Copy aria-hidden /> Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`${shelfPath(s.slug)}?notrack=1`} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden /> Open the live shelf
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/admin/links" search={{ demo: shelfDemoId(s.slug) }}>
                      <Link2 aria-hidden /> Personal link
                    </Link>
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuItem onSelect={onDuplicate}>
                <CopyPlus aria-hidden /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 aria-hidden /> Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Panel>
    </li>
  );
}
