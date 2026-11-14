import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, Eye, EyeOff, Layers, Lock, Pencil, Plus, SprayCan, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { EmptyState, Panel, Tag } from "@/components/admin/kit";
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

import { deletePaintable, setPaintableStatus, sprayKeys, type AdminPaintable } from "./api";
import { ScoreChip } from "./parts";

// The Paintables tab: one card per piece of merch.

export function PaintablesList({
  sets,
  creationCounts,
  onNew,
  onEdit,
  onScene,
}: {
  sets: AdminPaintable[];
  creationCounts: Map<string, number>;
  onNew: () => void;
  onEdit: (p: AdminPaintable) => void;
  /** Opens the scene editor (models, pictures, video around the print). */
  onScene: (p: AdminPaintable) => void;
}) {
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<AdminPaintable | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const status = useMutation({
    mutationFn: (v: { id: string; status: "live" | "draft" }) => setPaintableStatus(v.id, v.status),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: sprayKeys.sets });
      toast.success(
        p.status === "live" ? `${p.name} is live` : `${p.name} is a draft: fans no longer see it`,
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deletePaintable(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: sprayKeys.sets });
      toast.success("Paintable deleted");
      setToDelete(null);
    },
    onError: (e) => setDeleteErr(e.message),
  });

  const own = sets.filter((s) => !s.builtin);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Each paintable is one piece of merch fans can spray: the pictures the camera looks for and
          the part they can paint. Drafts are only visible to the team in the Studio.
        </p>
        <Button type="button" className="h-11" onClick={onNew}>
          <Plus aria-hidden />
          New paintable
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Paintables">
        {sets.map((p) => {
          const n = creationCounts.get(p.id) ?? 0;
          const front = p.targets.find((t) => t.side === "front") ?? p.targets[0];
          return (
            <li key={p.id} className="min-w-0">
              <Panel className="flex h-full flex-col p-4">
                <div className="flex gap-4">
                  <img
                    src={p.files.thumb}
                    alt=""
                    width={96}
                    height={128}
                    loading="lazy"
                    className="h-32 w-24 shrink-0 rounded-xl border border-white/[0.08] bg-[#24252b] object-cover"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="truncate text-base font-semibold tracking-tight" title={p.name}>
                      {p.name}
                    </h3>
                    <p className="truncate text-sm text-muted-foreground">{p.client}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.status === "live" ? (
                        <Tag tone="mint">Live</Tag>
                      ) : (
                        <Tag tone="slate">Draft</Tag>
                      )}
                      {p.builtin ? (
                        <Tag tone="violet">
                          <Lock aria-hidden />
                          Built in
                        </Tag>
                      ) : null}
                      <Tag tone="slate" title="Sides the camera can find">
                        <Layers aria-hidden />
                        {p.targets.length === 1 ? "1 side" : `${p.targets.length} sides`}
                      </Tag>
                      <ScoreChip score={front?.score ?? null} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {n === 1 ? "1 creation" : `${n} creations`} · {p.heightMm} mm tall
                    </p>
                  </div>
                </div>
                {p.builtin ? (
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
                    <SceneButton p={p} onScene={onScene} />
                    <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                      Built into the site: only its scene can be changed here.
                    </p>
                  </div>
                ) : (
                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    <SceneButton p={p} onScene={onScene} />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      onClick={() => onEdit(p)}
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11"
                      disabled={status.isPending && status.variables?.id === p.id}
                      onClick={() =>
                        status.mutate({
                          id: p.id,
                          status: p.status === "live" ? "draft" : "live",
                        })
                      }
                      aria-label={`${p.status === "live" ? "Unpublish" : "Publish"} ${p.name}`}
                    >
                      {p.status === "live" ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                      {p.status === "live" ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                      onClick={() => {
                        setDeleteErr(null);
                        setToDelete(p);
                      }}
                      aria-label={`Delete ${p.name}`}
                      title="Delete"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                )}
              </Panel>
            </li>
          );
        })}
      </ul>

      {own.length === 0 ? (
        <EmptyState
          icon={SprayCan}
          tone="amber"
          title="No paintables of your own yet"
          action={
            <Button type="button" className="h-11" onClick={onNew}>
              <Plus aria-hidden />
              New paintable
            </Button>
          }
        >
          The built-in EVADE charms are ready to paint. Add a shirt, poster or sticker with a front
          picture and the part fans can paint.
        </EmptyState>
      ) : null}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its pictures are removed and fans can no longer paint it. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteErr ? (
            <p
              role="alert"
              className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100"
            >
              {deleteErr}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-rose-600 text-white hover:bg-rose-500"
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) del.mutate(toDelete.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Scene" opens the scene editor; shows how many things are placed around the print. */
function SceneButton({ p, onScene }: { p: AdminPaintable; onScene: (p: AdminPaintable) => void }) {
  const n = p.scene?.length ?? 0;
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      onClick={() => onScene(p)}
      aria-label={`Scene for ${p.name}${n ? ` (${n} ${n === 1 ? "item" : "items"})` : ""}`}
      title="Place 3D models, pictures and video around the print"
    >
      <Box aria-hidden />
      Scene
      {n ? (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f6c344] px-1.5 text-[11px] font-semibold text-black tabular-nums">
          {n}
        </span>
      ) : null}
    </Button>
  );
}
