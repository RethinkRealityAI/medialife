import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MonitorPlay, Paintbrush, Shapes, SprayCan } from "lucide-react";

import { isUnauthorized } from "@/components/admin/format";
import {
  AdminTab,
  AdminTabs,
  PageBody,
  PageHeader,
  Panel,
  SignInAgain,
  TabCount,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

import { listCreations, listSets, sprayKeys, type AdminPaintable } from "./api";
import { CreationsGrid } from "./creations-grid";
import { PaintableEditor } from "./paintable-editor";
import { PaintablesList } from "./paintables-list";

// /admin/spray: the Spray Bobo CMS. Paintables (the merch fans can spray) and Creations (the
// paintings they save, with share links and moderation).

export type SprayTab = "paintables" | "creations";

export function SprayAdmin({ tab, onTab }: { tab: SprayTab; onTab: (t: SprayTab) => void }) {
  const sets = useQuery({
    queryKey: sprayKeys.sets,
    queryFn: listSets,
    retry: (n, err) => !isUnauthorized(err) && n < 2,
  });
  const creations = useQuery({
    queryKey: sprayKeys.creations,
    queryFn: listCreations,
    retry: (n, err) => !isUnauthorized(err) && n < 2,
  });
  // null: the list; "new" or a paintable: the editor
  const [editing, setEditing] = useState<null | "new" | AdminPaintable>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of creations.data ?? []) m.set(c.paintable, (m.get(c.paintable) ?? 0) + 1);
    return m;
  }, [creations.data]);
  const reported = (creations.data ?? []).filter(
    (c) => c.reports > 0 && c.status !== "hidden",
  ).length;

  const unauthorized =
    (sets.isError && isUnauthorized(sets.error)) ||
    (creations.isError && isUnauthorized(creations.error));

  return (
    <>
      <Toaster theme="dark" position="bottom-right" closeButton />
      <PageHeader
        title="Spray Bobo"
        icon={SprayCan}
        tone="amber"
        description="Fans spray-paint EVADE merch in AR and save their painting with a share link. Set up what they can paint, and look after what they make."
        actions={
          <>
            <Button asChild variant="outline" className="h-11">
              <a href="/spray/" target="_blank" rel="noopener">
                <Paintbrush aria-hidden />
                Open Studio
                <span className="sr-only"> (new tab)</span>
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11">
              <a href="/spray/?kiosk=1" target="_blank" rel="noopener">
                <MonitorPlay aria-hidden />
                Kiosk mode
                <span className="sr-only"> (new tab)</span>
              </a>
            </Button>
          </>
        }
      />
      <PageBody>
        {unauthorized ? (
          <SignInAgain />
        ) : (
          <AdminTabs
            label="Spray Bobo sections"
            value={tab}
            onChange={(t) => {
              onTab(t);
            }}
            tabs={[
              {
                id: "paintables",
                label: "Paintables",
                icon: Shapes,
                badge: sets.data ? <TabCount n={sets.data.length} /> : undefined,
              },
              {
                id: "creations",
                label: "Creations",
                icon: Paintbrush,
                badge: creations.data ? (
                  <TabCount
                    n={reported || creations.data.length}
                    alert={reported ? "amber" : undefined}
                  />
                ) : undefined,
              },
            ]}
          >
            <AdminTab value="paintables">
              {sets.isError ? (
                <LoadError what="the paintables" retry={() => void sets.refetch()} />
              ) : !sets.data ? (
                <Panel className="h-72 animate-pulse" aria-busy="true" aria-label="Loading" />
              ) : editing ? (
                <PaintableEditor
                  key={editing === "new" ? "new" : editing.id}
                  paintable={editing === "new" ? null : editing}
                  onClose={() => {
                    setEditing(null);
                    window.scrollTo({ top: 0 });
                  }}
                />
              ) : (
                <PaintablesList
                  sets={sets.data}
                  creationCounts={counts}
                  onNew={() => setEditing("new")}
                  onEdit={(p) => setEditing(p)}
                />
              )}
            </AdminTab>
            <AdminTab value="creations">
              {creations.isError ? (
                <LoadError what="the creations" retry={() => void creations.refetch()} />
              ) : !creations.data || !sets.data ? (
                <Panel className="h-72 animate-pulse" aria-busy="true" aria-label="Loading" />
              ) : (
                <CreationsGrid creations={creations.data} sets={sets.data} />
              )}
            </AdminTab>
          </AdminTabs>
        )}
      </PageBody>
    </>
  );
}

function LoadError({ what, retry }: { what: string; retry: () => void }) {
  return (
    <Panel className="mx-auto max-w-md p-6 text-center">
      <h2 className="text-base font-medium">Couldn't load {what}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Check your connection and try again.</p>
      <Button className="mt-4 h-11" onClick={retry}>
        Try again
      </Button>
    </Panel>
  );
}
