import { useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  EyeOff,
  Flag,
  MoreHorizontal,
  Paintbrush,
  RotateCcw,
  Star,
  StarOff,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { formatDate } from "@/components/admin/format";
import { CopyButton, EmptyState, Panel } from "@/components/admin/kit";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Creation, CreationStatus } from "@/lib/spray/model";
import { cn } from "@/lib/utils";

import { deleteCreation, shareUrl, sprayKeys, updateCreation, type AdminPaintable } from "./api";

// The Creations tab: every painting saved from the Studio, with moderation.

const ALL = "__all";
const NO_EVENT = "__none";
const STATUS_LABEL: Record<CreationStatus, string> = {
  unlisted: "Unlisted",
  featured: "Featured",
  hidden: "Hidden",
};

export function CreationsGrid({
  creations,
  sets,
}: {
  creations: Creation[];
  sets: AdminPaintable[];
}) {
  const qc = useQueryClient();
  const uid = useId();
  const [fPaintable, setFPaintable] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);
  const [fEvent, setFEvent] = useState(ALL);
  const [toDelete, setToDelete] = useState<Creation | null>(null);
  const [eventFor, setEventFor] = useState<Creation | null>(null);
  const [eventText, setEventText] = useState("");

  const byId = useMemo(() => new Map(sets.map((s) => [s.id, s])), [sets]);
  const events = useMemo(
    () =>
      [...new Set(creations.map((c) => c.event).filter((e): e is string => !!e))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [creations],
  );
  const shown = creations.filter(
    (c) =>
      (fPaintable === ALL || c.paintable === fPaintable) &&
      (fStatus === ALL || c.status === fStatus) &&
      (fEvent === ALL || (fEvent === NO_EVENT ? !c.event : c.event === fEvent)),
  );

  const patch = useMutation({
    mutationFn: (v: { id: string; status?: CreationStatus; event?: string | null }) =>
      updateCreation(v.id, { status: v.status, event: v.event }),
    onSuccess: (c, v) => {
      qc.setQueryData<Creation[]>(sprayKeys.creations, (list) =>
        list?.map((x) => (x.id === c.id ? c : x)),
      );
      toast.success(
        v.status === "featured"
          ? "Featured"
          : v.status === "hidden"
            ? "Hidden: the link no longer works"
            : v.status === "unlisted"
              ? "Back to unlisted: the link works again"
              : "Event tag saved",
      );
      setEventFor(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteCreation(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<Creation[]>(sprayKeys.creations, (list) => list?.filter((x) => x.id !== id));
      toast.success("Creation deleted");
      setToDelete(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!creations.length)
    return (
      <EmptyState icon={Paintbrush} tone="amber" title="No creations yet">
        Creations are the paintings fans save in the Studio. Each one gets its own share link and
        shows up here, where you can feature it, tag the event or hide it.
      </EmptyState>
    );

  const reported = creations.filter((c) => c.reports > 0 && c.status !== "hidden").length;
  return (
    <div className="space-y-4">
      {reported ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-100"
        >
          <Flag className="size-4 shrink-0" aria-hidden />
          {reported === 1
            ? "1 creation has been reported. Take a look and hide it if needed."
            : `${reported} creations have been reported. Take a look and hide them if needed.`}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Filter
          id={`${uid}-p`}
          label="Paintable"
          value={fPaintable}
          onChange={setFPaintable}
          options={[
            [ALL, "All paintables"],
            ...sets.map((s) => [s.id, s.name] as [string, string]),
          ]}
        />
        <Filter
          id={`${uid}-s`}
          label="Status"
          value={fStatus}
          onChange={setFStatus}
          options={[
            [ALL, "Any status"],
            ["unlisted", "Unlisted"],
            ["featured", "Featured"],
            ["hidden", "Hidden"],
          ]}
        />
        <Filter
          id={`${uid}-e`}
          label="Event"
          value={fEvent}
          onChange={setFEvent}
          options={[
            [ALL, "All events"],
            [NO_EVENT, "No event tag"],
            ...events.map((e) => [e, e] as [string, string]),
          ]}
        />
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {shown.length === creations.length
          ? `${creations.length} ${creations.length === 1 ? "creation" : "creations"}`
          : `${shown.length} of ${creations.length} creations`}
      </p>

      {shown.length === 0 ? (
        <EmptyState icon={Paintbrush} tone="slate" title="Nothing matches these filters">
          Try another paintable, status or event.
        </EmptyState>
      ) : (
        <ul
          className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          aria-label="Creations"
        >
          {shown.map((c) => {
            const p = byId.get(c.paintable);
            const name = p?.name ?? "Deleted paintable";
            const busy = patch.isPending && patch.variables?.id === c.id;
            return (
              <li key={c.id} className="min-w-0">
                <Panel
                  className={cn(
                    "flex h-full flex-col overflow-hidden",
                    c.reports > 0 && c.status !== "hidden" && "border-amber-400/50",
                  )}
                >
                  <div className="relative aspect-[3/4] bg-[#24252b]">
                    {p ? (
                      <img
                        src={p.files.print}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : null}
                    <img
                      src={c.image}
                      alt={`Painting on ${name}`}
                      loading="lazy"
                      className={cn(
                        "absolute inset-0 size-full object-cover",
                        c.status === "hidden" && "opacity-40",
                      )}
                    />
                    <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
                      <StatusTag status={c.status} />
                      {c.reports > 0 ? (
                        <span
                          title="Times fans reported it"
                          className="inline-flex h-6 items-center gap-1 rounded-full bg-amber-400 px-2.5 text-[11px] font-semibold text-black [&_svg]:size-3"
                        >
                          <Flag aria-hidden />
                          {c.reports} {c.reports === 1 ? "report" : "reports"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    <h3 className="truncate text-sm font-semibold" title={name}>
                      {name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(c.createdAt)} · {c.views} {c.views === 1 ? "view" : "views"}
                      {c.reports === 0 ? " · no reports" : null}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/75" title={c.event ?? undefined}>
                      {c.event ? (
                        <>
                          <span className="text-muted-foreground">Event: </span>
                          {c.event}
                        </>
                      ) : (
                        <span className="text-muted-foreground">No event tag</span>
                      )}
                    </p>
                    <div className="mt-auto flex items-center gap-1 pt-3">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-11 text-muted-foreground hover:text-foreground"
                      >
                        <a
                          href={`/sb/${c.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open the share page (new tab)`}
                          title="Open the share page"
                        >
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                      <CopyButton
                        text={shareUrl(c.id)}
                        label="Copy share link"
                        toastText="Share link copied"
                        className="size-11"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        className={cn(
                          "size-11",
                          c.status === "featured"
                            ? "text-amber-300 hover:text-amber-200"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        aria-pressed={c.status === "featured"}
                        aria-label={c.status === "featured" ? "Unfeature" : "Feature"}
                        title={c.status === "featured" ? "Unfeature" : "Feature"}
                        onClick={() =>
                          patch.mutate({
                            id: c.id,
                            status: c.status === "featured" ? "unlisted" : "featured",
                          })
                        }
                      >
                        {c.status === "featured" ? <StarOff aria-hidden /> : <Star aria-hidden />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        className="size-11 text-muted-foreground hover:text-foreground"
                        aria-label={c.status === "hidden" ? "Restore" : "Hide"}
                        title={
                          c.status === "hidden"
                            ? "Restore (the link works again)"
                            : "Hide (the link stops working)"
                        }
                        onClick={() =>
                          patch.mutate({
                            id: c.id,
                            status: c.status === "hidden" ? "unlisted" : "hidden",
                          })
                        }
                      >
                        {c.status === "hidden" ? <RotateCcw aria-hidden /> : <EyeOff aria-hidden />}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="ml-auto size-11 text-muted-foreground hover:text-foreground"
                            aria-label="More actions"
                            title="More actions"
                          >
                            <MoreHorizontal aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="min-h-11"
                            onSelect={() => {
                              setEventText(c.event ?? "");
                              setEventFor(c);
                            }}
                          >
                            <TagIcon aria-hidden />
                            Edit event tag
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="min-h-11 text-rose-300 focus:text-rose-200"
                            onSelect={() => setToDelete(c)}
                          >
                            <Trash2 aria-hidden />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!eventFor} onOpenChange={(o) => !o && setEventFor(null)}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (eventFor) patch.mutate({ id: eventFor.id, event: eventText.trim() || null });
            }}
          >
            <DialogHeader>
              <DialogTitle>Event tag</DialogTitle>
              <DialogDescription>
                Where it was made, so you can find it later. Leave empty to remove the tag.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              <Label htmlFor={`${uid}-ev`}>Event</Label>
              <Input
                id={`${uid}-ev`}
                value={eventText}
                onChange={(e) => setEventText(e.target.value)}
                maxLength={80}
                placeholder="e.g. Mall pop-up, Toronto"
                className="mt-1.5 h-11"
                list={`${uid}-evs`}
                autoComplete="off"
              />
              <datalist id={`${uid}-evs`}>
                {events.map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>
            <DialogFooter className="mt-5 gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setEventFor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" className="h-11" disabled={patch.isPending}>
                Save tag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this creation?</AlertDialogTitle>
            <AlertDialogDescription>
              The painting and its share link are removed for good. To take it down but keep it,
              hide it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
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

/** Solid (not see-through) so it reads on top of any picture. */
function StatusTag({ status }: { status: CreationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold [&_svg]:size-3",
        status === "featured"
          ? "bg-amber-300 text-black"
          : status === "hidden"
            ? "bg-rose-600 text-white"
            : "bg-[#15131a]/90 text-white ring-1 ring-white/20",
      )}
    >
      {status === "featured" ? (
        <Star aria-hidden />
      ) : status === "hidden" ? (
        <EyeOff aria-hidden />
      ) : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

function Filter({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="mt-1 h-11">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, t]) => (
            <SelectItem key={v} value={v} className="min-h-11">
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
