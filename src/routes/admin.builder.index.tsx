import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Boxes,
  Copy,
  CopyPlus,
  ExternalLink,
  Images,
  MoreHorizontal,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AssetLibrary } from "@/components/ar-builder/asset-library";
import { copyText, projectsQueryKey, shareUrl } from "@/components/ar-builder/api";
import { NewProjectDialog } from "@/components/ar-builder/new-project-dialog";
import { StatusPill } from "@/components/ar-builder/status";
import { PageHeader, Panel } from "@/components/portal/kit";
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
import { deleteProjectFn, duplicateProjectFn, listProjectsFn } from "@/lib/ar/projects.functions";
import type { ProjectSummary } from "@/lib/ar/projects";

// The endcap builder's home: every endcap the team has made, newest first.

export const Route = createFileRoute("/admin/builder/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: projectsQueryKey, queryFn: () => listProjectsFn() });
  const [creating, setCreating] = useState(false);
  const [library, setLibrary] = useState(false);
  const [confirm, setConfirm] = useState<ProjectSummary | null>(null);

  const duplicate = useMutation({
    mutationFn: (slug: string) => duplicateProjectFn({ data: { slug } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: projectsQueryKey });
      if (r.ok) toast.success(`Made “${r.summary.name}”`);
    },
    onError: () => toast.error("Couldn't duplicate the endcap"),
  });
  const remove = useMutation({
    mutationFn: (slug: string) => deleteProjectFn({ data: { slug } }),
    onSuccess: async (_r, slug) => {
      qc.setQueryData<ProjectSummary[]>(projectsQueryKey, (list) =>
        list?.filter((p) => p.slug !== slug),
      );
      await qc.invalidateQueries({ queryKey: projectsQueryKey });
      toast.success("Endcap deleted");
    },
    onError: () => toast.error("Couldn't delete the endcap"),
  });

  return (
    <>
      <PageHeader
        eyebrow="Endcap builder"
        title="Endcaps"
        actions={
          <>
            <Button variant="outline" onClick={() => setLibrary(true)}>
              <Images aria-hidden /> Asset library
            </Button>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="btn-pill btn-ember px-5 py-2 text-sm font-medium"
            >
              <Plus className="size-4" aria-hidden /> New endcap
            </button>
          </>
        }
      />
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        {projects.isPending ? (
          <CardGrid>
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="overflow-hidden rounded-xl border border-border">
                <Skeleton className="aspect-[16/10] rounded-none" />
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </CardGrid>
        ) : projects.isError ? (
          <EmptyState
            icon={<AlertTriangle aria-hidden />}
            title="Couldn't load your endcaps"
            body="Check your connection and try again."
            action={
              <Button variant="outline" onClick={() => projects.refetch()}>
                Try again
              </Button>
            }
          />
        ) : !projects.data.length ? (
          <EmptyState
            icon={<Boxes aria-hidden />}
            title="No endcaps yet"
            body="Make one from the Roblox, EVADE or Monkey Quest demo, or start blank. You can preview it live and share a link when it's ready."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn-pill btn-ember px-5 py-2 text-sm font-medium"
              >
                <Plus className="size-4" aria-hidden /> New endcap
              </button>
            }
          />
        ) : (
          <CardGrid>
            {projects.data.map((p) => (
              <ProjectCard
                key={p.slug}
                p={p}
                onDuplicate={() => duplicate.mutate(p.slug)}
                onDelete={() => setConfirm(p)}
              />
            ))}
          </CardGrid>
        )}
      </div>

      <NewProjectDialog open={creating} onOpenChange={setCreating} />
      <AssetLibrary open={library} onOpenChange={setLibrary} />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{confirm?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.publishedAt
                ? `Its link, medialife.ai/x/${confirm.slug}, stops working for everyone. `
                : ""}
              The draft is deleted too. Uploaded files stay in the asset library. This can't be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirm && remove.mutate(confirm.slug)}
            >
              Delete endcap
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</ul>;
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

function ProjectCard({
  p,
  onDuplicate,
  onDelete,
}: {
  p: ProjectSummary;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const live = p.status !== "draft";
  return (
    <li className="group relative">
      <Panel className="overflow-hidden transition-colors group-hover:border-primary/45 group-focus-within:border-primary/45">
        <div className="relative aspect-[16/10] overflow-hidden border-b border-border bg-[radial-gradient(ellipse_at_top,oklch(0.3_0.12_260/35%),transparent_70%)]">
          {p.thumb ? (
            <img
              src={p.thumb}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="grid size-full place-items-center">
              <Boxes className="size-8 text-muted-foreground/60" aria-hidden />
            </div>
          )}
          <StatusPill
            status={p.status}
            className="absolute top-3 left-3 bg-background/80 backdrop-blur"
          />
        </div>
        <div className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-medium tracking-tight">
              {/* the whole card is the link; the menu sits above it */}
              <Link
                to="/admin/builder/$slug"
                params={{ slug: p.slug }}
                className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {p.name}
              </Link>
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {p.client ? `For ${p.client}` : <span className="mono text-xs">/x/{p.slug}</span>}
            </p>
            <p className="mono mt-3 text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
              Edited {formatDistanceToNow(p.updatedAt, { addSuffix: true })}
              {p.publishedAt && live
                ? ` · live since ${formatDistanceToNow(p.publishedAt, { addSuffix: true })}`
                : ""}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative z-10 -mr-1 size-8 shrink-0"
                aria-label={`Actions for ${p.name}`}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/admin/builder/$slug" params={{ slug: p.slug }}>
                  <PencilLine aria-hidden /> Open
                </Link>
              </DropdownMenuItem>
              {live ? (
                <>
                  <DropdownMenuItem
                    onSelect={async () => {
                      if (await copyText(shareUrl(p.slug))) toast.success("Link copied");
                    }}
                  >
                    <Copy aria-hidden /> Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={shareUrl(p.slug)} target="_blank" rel="noreferrer">
                      <ExternalLink aria-hidden /> Open the live endcap
                    </a>
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
