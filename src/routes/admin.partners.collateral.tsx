import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Panel, PanelTitle } from "@/components/admin/kit";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <div className="p-8 text-sm text-muted-foreground">
        That partner doesn't exist.{" "}
        <Link to="/admin/partners/collateral" className="text-primary underline">
          Back to collateral
        </Link>
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

  return (
    <>
      <PageHeader
        title="Partner collateral"
        actions={
          <Button onClick={() => setEditing({})}>
            <Plus aria-hidden /> Add to {COLLATERAL_TABS[tab]}
          </Button>
        }
      >
        <Link
          to="/admin/partners"
          className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Partners
        </Link>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          What partners see in Collateral. Add pieces for every partner or just one, and hide
          built-in pieces that don't fit. Partners can add their own too; you can edit or remove
          those here.
        </p>
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Showing collateral for</span>
            <select
              value={d.scope}
              onChange={(e) =>
                go({ scope: e.target.value === KIT_SCOPE ? undefined : e.target.value })
              }
              className="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/partners/$partnerId" params={{ partnerId: d.partner.id }}>
                Open {d.partner.name}
              </Link>
            </Button>
          ) : null}
        </div>

        <Tabs value={tab} onValueChange={(t) => go({ tab: t as CollateralTab })}>
          <div className="-mx-4 overflow-x-auto px-4">
            <TabsList>
              {COLLATERAL_TAB_IDS.map((t) => (
                <TabsTrigger key={t} value={t}>
                  {COLLATERAL_TABS[t]}
                  {count(t) ? (
                    <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                      {count(t)}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>

        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title="Added pieces"
            sub={
              isKit
                ? "Every partner sees these."
                : `Only ${d.partner?.name} sees these, plus the ones added for all partners.`
            }
            actions={
              <Button size="sm" variant="outline" onClick={() => setEditing({})}>
                <Plus aria-hidden /> Add
              </Button>
            }
          />
          {here.length ? (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {here.map((v) => {
                const e = v.entry;
                const fromKit = !isKit && e.scope === KIT_SCOPE;
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 p-3">
                    <Thumb v={v} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.format} ·{" "}
                        {e.addedBy.kind === "medialife"
                          ? fromKit
                            ? "MEDIALIFE, for all partners"
                            : "MEDIALIFE"
                          : `Added by ${e.addedBy.name} (${d.partner?.name ?? "partner"})`}{" "}
                        · {shortDate(e.updatedAt)}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setViewing(v)}
                        aria-label={`View ${e.title}`}
                      >
                        <Eye aria-hidden />
                      </Button>
                      {fromKit ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/admin/partners/collateral" search={{ tab }}>
                            Edit in All partners
                          </Link>
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing({ entry: e })}
                            aria-label={`Edit ${e.title}`}
                          >
                            <Pencil aria-hidden />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRemoving(e)}
                            aria-label={`Remove ${e.title}`}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
              Nothing added to {COLLATERAL_TABS[tab]} yet. Upload a file or add a link and it shows
              here and in the Partner Hub straight away.
            </p>
          )}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <PanelTitle
            title="Built-in pieces"
            sub={
              isKit
                ? "MEDIALIFE's own pieces every partner gets. Turn one off to hide it from everyone."
                : `MEDIALIFE's pieces plus ${d.partner?.name}'s co-branded set. Turn one off to hide it from ${d.partner?.name} only.`
            }
          />
          {builtins.length ? (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {builtins.map((b) => {
                const offForAll = !isKit && kitHidden.has(b.id);
                const shown = !hidden.has(b.id) && !offForAll;
                return (
                  <li key={b.id} className="flex items-center gap-3 p-3">
                    {b.thumb ? (
                      <img
                        src={b.thumb}
                        alt=""
                        loading="lazy"
                        className="size-12 shrink-0 rounded-md bg-black object-cover"
                      />
                    ) : (
                      <span className="grid size-12 shrink-0 place-items-center rounded-md bg-white/5">
                        <Globe className="size-5 text-muted-foreground" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.title}</span>
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
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">No built-in pieces in this tab.</p>
          )}
        </Panel>
      </div>

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

function Thumb({ v }: { v: EntryView }) {
  if (v.cover)
    return (
      <img
        src={v.cover}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-md bg-black object-cover"
      />
    );
  if (v.video)
    return (
      <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-black">
        <video
          src={`${v.video}#t=0.5`}
          muted
          preload="metadata"
          className="size-full object-cover"
        />
        <Play
          className="absolute top-1/2 left-1/2 size-4 -translate-x-1/2 -translate-y-1/2 fill-current text-white/90"
          aria-hidden
        />
      </span>
    );
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-md bg-white/5">
      {v.entry.link ? (
        <ExternalLink className="size-5 text-muted-foreground" aria-hidden />
      ) : (
        <FileText className="size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
