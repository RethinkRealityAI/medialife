import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowRight,
  BookOpen,
  Camera,
  Clapperboard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Globe,
  Handshake,
  ImagePlay,
  Megaphone,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  AdminTab,
  AdminTabs,
  BackLink,
  EmptyState,
  PageBody,
  PageHeader,
  Panel,
  PanelTitle,
  TabCount,
  Tag,
  surface,
} from "@/components/admin/kit";
import {
  EntryDialog,
  EntryViewer,
  entryView,
  type EntryView,
} from "@/components/partner/collateral-entries";
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
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import {
  COLLATERAL_TABS,
  COLLATERAL_TAB_IDS,
  KIT_SCOPE,
  builtinPieces,
  scopeOwner,
  type CollateralEntry,
  type CollateralTab,
} from "@/lib/hub/collateral";
import {
  adminDeleteCollateral,
  adminGetCollateral,
  adminSaveCollateral,
  adminSetBuiltinHidden,
} from "@/lib/hub/collateral.functions";
import { shortDate } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

// /admin/partners/collateral: what partners see in their Collateral. Add pieces
// for every partner or for one, edit or remove them (partners' own too), and
// hide built-in pieces that don't fit.

export const Route = createFileRoute("/admin/partners/collateral")({
  validateSearch: z.object({
    scope: z.string().max(40).optional().catch(undefined),
    tab: z
      .enum(COLLATERAL_TAB_IDS as [CollateralTab, ...CollateralTab[]])
      .optional()
      .catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ scope: search.scope ?? KIT_SCOPE }),
  loader: ({ deps }) => adminGetCollateral({ data: { scope: deps.scope } }),
  head: () => ({ meta: [{ title: "Collateral · Partners | MEDIALIFE" }] }),
  component: CollateralAdmin,
});

function CollateralAdmin() {
  const d = Route.useLoaderData();
  const { tab = "explain" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const [editing, setEditing] = useState<{ entry?: CollateralEntry } | null>(null);
  const [viewing, setViewing] = useState<EntryView | null>(null);
  const [removing, setRemoving] = useState<CollateralEntry | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const views = useMemo(
    () =>
      d ? [...d.entries, ...d.kitEntries].map((e) => entryView(e, d.files)) : ([] as EntryView[]),
    [d],
  );

  if (!d) {
    return (
      <div className="mx-auto mt-10 max-w-md px-4">
        <EmptyState
          icon={Handshake}
          tone="slate"
          title="That partner doesn't exist"
          action={
            <Button asChild>
              <Link to="/admin/partners/collateral">Back to collateral</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isKit = d.scope === KIT_SCOPE;
  const builtins = builtinPieces(d.partner?.kit ?? "base").filter((b) => b.tab === tab);
  const here = views.filter((v) => v.entry.tab === tab);
  const hidden = new Set(d.hidden);
  const kitHidden = new Set(d.kitHidden);
  const count = (t: CollateralTab) => views.filter((v) => v.entry.tab === t).length;
  const go = (search: { scope?: string; tab?: CollateralTab }) =>
    void navigate({ search: (s) => ({ ...s, ...search }) });

  const tabIcons: Record<CollateralTab, LucideIcon> = {
    explain: BookOpen,
    show: MonitorPlay,
    videos: Clapperboard,
    post: Megaphone,
    gifs: ImagePlay,
    photos: Camera,
  };

  return (
    <>
      <PageHeader
        title="Partner collateral"
        icon={FolderOpen}
        tone="violet"
        back={<BackLink to="/admin/partners">Partners</BackLink>}
        description="What partners see in Collateral. Add pieces for everyone or one partner, and hide built-ins that don't fit."
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus aria-hidden /> Add to {COLLATERAL_TABS[tab]}
          </Button>
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 items-center gap-2 rounded-xl bg-black/30 py-1 pr-1 pl-3 text-sm ring-1 ring-white/10 ring-inset focus-within:ring-2 focus-within:ring-ring">
            {isKit ? (
              <Globe className="size-4 shrink-0 text-sky-300" aria-hidden />
            ) : (
              <Handshake className="size-4 shrink-0 text-violet-300" aria-hidden />
            )}
            <span className="shrink-0 text-white/65">Showing</span>
            <select
              value={d.scope}
              onChange={(e) =>
                go({ scope: e.target.value === KIT_SCOPE ? undefined : e.target.value })
              }
              className="h-8 min-w-0 rounded-lg bg-transparent pr-1 text-sm font-medium focus-visible:outline-none [&>option]:bg-popover"
            >
              <option value={KIT_SCOPE}>All partners</option>
              {d.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} only
                </option>
              ))}
            </select>
          </label>
          {d.partner ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-10 text-white/75 hover:bg-white/[0.06]"
            >
              <Link to="/admin/partners/$partnerId" params={{ partnerId: d.partner.id }}>
                Open {d.partner.name} <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
        </div>
      </PageHeader>

      <PageBody>
        <AdminTabs
          label="Collateral sections"
          value={tab}
          onChange={(t) => go({ tab: t })}
          tabs={COLLATERAL_TAB_IDS.map((t) => ({
            id: t,
            label: COLLATERAL_TABS[t],
            icon: tabIcons[t],
            badge: count(t) ? <TabCount n={count(t)} /> : null,
          }))}
        >
          <AdminTab value={tab} className="space-y-4">
            <Panel className="p-4 sm:p-5">
              <PanelTitle
                icon={Plus}
                tone="sky"
                title={`Added pieces (${here.length})`}
                sub={
                  isKit
                    ? "Every partner sees these."
                    : `Only ${d.partner?.name} sees these, plus the ones added for all partners.`
                }
                actions={
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent"
                    onClick={() => setEditing({})}
                  >
                    <Plus aria-hidden /> Add
                  </Button>
                }
              />
              {here.length ? (
                <ul className="mt-4 grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @6xl/inset:grid-cols-4">
                  {here.map((v) => {
                    const e = v.entry;
                    const fromKit = !isKit && e.scope === KIT_SCOPE;
                    return (
                      <li
                        key={e.id}
                        className={cn(surface, "group flex min-w-0 flex-col overflow-hidden")}
                      >
                        <button
                          type="button"
                          onClick={() => setViewing(v)}
                          aria-label={`View ${e.title}`}
                          className="relative block aspect-video overflow-hidden bg-black focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none focus-visible:ring-inset"
                        >
                          <Cover v={v} />
                          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white/85 backdrop-blur">
                            {v.format}
                          </span>
                          <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100 motion-reduce:transition-none">
                            <Eye className="size-5 text-white" aria-hidden />
                          </span>
                        </button>
                        <div className="flex flex-1 items-start gap-1 p-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{e.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {e.addedBy.kind === "medialife"
                                ? fromKit
                                  ? "MEDIALIFE, all partners"
                                  : "MEDIALIFE"
                                : `By ${e.addedBy.name} (${d.partner?.name ?? "partner"})`}{" "}
                              · {shortDate(e.updatedAt)}
                            </span>
                          </span>
                          {fromKit ? (
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground"
                            >
                              <Link to="/admin/partners/collateral" search={{ tab }}>
                                Edit in All
                              </Link>
                            </Button>
                          ) : (
                            <span className="flex shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                                onClick={() => setEditing({ entry: e })}
                                aria-label={`Edit ${e.title}`}
                                title="Edit"
                              >
                                <Pencil aria-hidden />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                                onClick={() => setRemoving(e)}
                                aria-label={`Remove ${e.title}`}
                                title="Remove"
                              >
                                <Trash2 aria-hidden />
                              </Button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={tabIcons[tab]}
                  tone="sky"
                  title={`Nothing added to ${COLLATERAL_TABS[tab]} yet`}
                  className="mt-4 py-8"
                  action={
                    <Button size="sm" onClick={() => setEditing({})}>
                      <Plus aria-hidden /> Add a file or link
                    </Button>
                  }
                >
                  It shows here and in the Partner Hub straight away.
                </EmptyState>
              )}
            </Panel>

            <Panel className="p-4 sm:p-5">
              <PanelTitle
                icon={Sparkles}
                tone="violet"
                title={`Built-in pieces (${builtins.length})`}
                sub={
                  isKit
                    ? "MEDIALIFE's own pieces every partner gets. Turn one off to hide it from everyone."
                    : `MEDIALIFE's pieces plus ${d.partner?.name}'s co-branded set. Turn one off to hide it from ${d.partner?.name} only.`
                }
              />
              {builtins.length ? (
                <ul className="mt-4 grid grid-cols-2 gap-3 @3xl/inset:grid-cols-3 @6xl/inset:grid-cols-4">
                  {builtins.map((b) => {
                    const offForAll = !isKit && kitHidden.has(b.id);
                    const shown = !hidden.has(b.id) && !offForAll;
                    return (
                      <li
                        key={b.id}
                        className={cn(
                          surface,
                          "flex min-w-0 flex-col overflow-hidden transition-opacity",
                          !shown && "opacity-60",
                        )}
                      >
                        <span className="relative block aspect-video overflow-hidden bg-black">
                          {b.thumb ? (
                            <img
                              src={b.thumb}
                              alt=""
                              loading="lazy"
                              className={cn("size-full object-cover", !shown && "grayscale")}
                            />
                          ) : (
                            <span className="grid size-full place-items-center bg-white/[0.03]">
                              <Globe className="size-6 text-muted-foreground" aria-hidden />
                            </span>
                          )}
                          {!shown ? (
                            <Tag
                              tone="slate"
                              className="absolute top-2 left-2 bg-black/60 backdrop-blur"
                            >
                              <EyeOff aria-hidden /> Hidden
                            </Tag>
                          ) : null}
                        </span>
                        <span className="flex flex-1 items-center gap-2 p-3">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{b.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {offForAll ? "Hidden for all partners" : shown ? "Shown" : "Hidden"}
                            </span>
                          </span>
                          <Switch
                            checked={shown}
                            disabled={offForAll || toggling === b.id}
                            aria-label={`Show ${b.title}`}
                            onCheckedChange={async (on) => {
                              setToggling(b.id);
                              try {
                                await adminSetBuiltinHidden({
                                  data: { scope: d.scope, id: b.id, hidden: !on },
                                });
                                await router.invalidate();
                              } catch {
                                toast.error("Couldn't save that. Try again.");
                              } finally {
                                setToggling(null);
                              }
                            }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  tone="slate"
                  title="No built-in pieces here"
                  className="mt-4 py-8"
                />
              )}
            </Panel>
          </AdminTab>
        </AdminTabs>
      </PageBody>

      <EntryDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        owner={scopeOwner(d.scope)}
        initial={editing?.entry ?? null}
        defaultTab={tab}
        heading={
          editing?.entry
            ? "Edit collateral"
            : `Add collateral for ${isKit ? "all partners" : d.partner?.name}`
        }
        onSave={async (input) => {
          const r = await adminSaveCollateral({ data: { scope: d.scope, entry: input } });
          if (r.ok) await router.invalidate();
          return r;
        }}
      />
      <EntryViewer view={viewing} origin={origin} onClose={() => setViewing(null)} />
      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{removing?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from {isKit ? "every partner's" : `${d.partner?.name}'s`} collateral,
              and its file is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const e = removing;
                setRemoving(null);
                if (!e) return;
                await adminDeleteCollateral({ data: { scope: e.scope, id: e.id } });
                toast.success("Removed");
                await router.invalidate();
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </>
  );
}

function Cover({ v }: { v: EntryView }) {
  if (v.cover)
    return (
      <img
        src={v.cover}
        alt=""
        loading="lazy"
        className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
    );
  if (v.video)
    return (
      <span className="relative block size-full">
        <video
          src={`${v.video}#t=0.5`}
          muted
          preload="metadata"
          className="size-full object-cover"
        />
        <Play
          className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 fill-current text-white/90"
          aria-hidden
        />
      </span>
    );
  return (
    <span className="grid size-full place-items-center bg-gradient-to-br from-violet-400/15 to-sky-400/5">
      {v.entry.link ? (
        <ExternalLink className="size-6 text-muted-foreground" aria-hidden />
      ) : (
        <FileText className="size-6 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
