/**
 * The detail drawer: a preview (video player, image lightbox, audio player,
 * 3D viewer, PDF, font sample, text), the copy / embed / download actions, the
 * Public switch, and every classification field, saved together.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  Code2,
  Download,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Maximize2,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { errorMessage } from "@/components/admin/creators/ui";
import { copyText, formatDateTime } from "@/components/admin/format";
import { CopyButton, well } from "@/components/admin/kit";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { MediaLibraryData } from "@/lib/media/admin.server";
import { adminDeleteMedia, adminUpdateMedia } from "@/lib/media/admin.functions";
import {
  MEDIA,
  MEDIA_CLIENT_SUGGESTIONS,
  MEDIA_KIND_LABELS,
  MEDIA_ORIENTATION_LABELS,
  MEDIA_PURPOSES,
  MEDIA_PURPOSE_LABELS,
  MEDIA_RIGHTS_SUGGESTIONS,
  embedSnippet,
  extOf,
  formatBytes,
  formatDuration,
  tagKey,
  type MediaAssetView,
  type MediaPatch,
  type MediaPurpose,
} from "@/lib/media/model";
import { downloadMediaFile } from "@/lib/media/upload-client";
import { cn } from "@/lib/utils";

import {
  AiBadge,
  AssetThumb,
  ComboField,
  FieldRow,
  KIND_ICON,
  TagEditor,
  VisibilityBadge,
  mergeSuggestions,
  tap,
} from "./parts";

type Form = {
  title: string;
  description: string;
  client: string;
  collection: string;
  purpose: MediaPurpose | "none";
  tags: string[];
  rights: string;
  usageNotes: string;
  aiGenerated: boolean;
};

const formOf = (a: MediaAssetView): Form => ({
  title: a.title,
  description: a.description,
  client: a.client,
  collection: a.collection,
  purpose: a.purpose ?? "none",
  tags: a.tags,
  rights: a.rights,
  usageNotes: a.usageNotes,
  aiGenerated: a.aiGenerated,
});

function diff(a: MediaAssetView, f: Form): MediaPatch {
  const p: MediaPatch = {};
  if (f.title.trim() !== a.title) p.title = f.title;
  if (f.description.trim() !== a.description) p.description = f.description;
  if (f.client !== a.client) p.client = f.client;
  if (f.collection !== a.collection) p.collection = f.collection;
  const purpose = f.purpose === "none" ? null : f.purpose;
  if (purpose !== a.purpose) p.purpose = purpose;
  if (f.tags.map(tagKey).join("|") !== a.tags.map(tagKey).join("|")) p.setTags = f.tags;
  if (f.rights.trim() !== a.rights) p.rights = f.rights;
  if (f.usageNotes.trim() !== a.usageNotes) p.usageNotes = f.usageNotes;
  if (f.aiGenerated !== a.aiGenerated) p.aiGenerated = f.aiGenerated;
  return p;
}

export function AssetDrawer({
  asset,
  data,
  onClose,
}: {
  asset: MediaAssetView | null;
  data: MediaLibraryData;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full max-w-none flex-col gap-0 border-white/[0.08] bg-[linear-gradient(180deg,oklch(0.16_0.018_280),oklch(0.11_0.01_280))] p-0 sm:max-w-[640px] [&>button:first-child]:hidden"
        aria-describedby={undefined}
      >
        {asset ? <DrawerBody key={asset.id} asset={asset} data={data} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  asset: a,
  data,
  onClose,
}: {
  asset: MediaAssetView;
  data: MediaLibraryData;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(() => formOf(a));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const changes = useMemo(() => diff(a, form), [a, form]);
  const dirty = Object.keys(changes).length > 0;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicUrl = a.publicPath ? `${origin}${a.publicPath}` : null;
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const clients = mergeSuggestions(data.facets.clients, MEDIA_CLIENT_SUGGESTIONS);
  const collections = mergeSuggestions(data.facets.collections);
  const rights = mergeSuggestions([], MEDIA_RIGHTS_SUGGESTIONS);

  async function save() {
    setSaving(true);
    try {
      const r = await adminUpdateMedia({ data: { ids: [a.id], patch: changes } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Saved");
        await router.invalidate();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function setPublic(on: boolean) {
    setToggling(true);
    try {
      const r = await adminUpdateMedia({ data: { ids: [a.id], patch: { public: on } } });
      if (!r.ok) toast.error(r.error);
      else {
        await router.invalidate();
        const path = r.assets[0]?.publicPath;
        if (on && path) {
          const ok = await copyText(`${origin}${path}`);
          toast.success(ok ? "Public. Link copied." : "Public");
        } else toast.success("Private: only the team and the API token can open it");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await adminDeleteMedia({ data: { ids: [a.id] } });
      toast.success(`Deleted ${a.title}`);
      onClose();
      await router.invalidate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const Icon = KIND_ICON[a.kind];
  return (
    <>
      <div className="flex items-start gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.1]">
          <Icon className="size-4 text-white/80" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate text-base leading-snug font-semibold">
            {a.title}
          </SheetTitle>
          <SheetDescription className="truncate text-xs">
            {a.name} · {formatBytes(a.size)}
          </SheetDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-muted-foreground hover:bg-white/[0.06] sm:size-9"
          onClick={onClose}
          aria-label="Close details"
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-5 px-4 py-4 sm:px-5">
          <Preview a={a} />

          <div className="flex flex-wrap items-center gap-1.5">
            <VisibilityBadge isPublic={a.public} />
            {a.aiGenerated ? <AiBadge /> : null}
            {a.client ? (
              <span className="inline-flex h-6 items-center rounded-full bg-sky-400/15 px-2 text-[11px] font-medium text-sky-200 ring-1 ring-sky-400/30 ring-inset">
                {a.client}
              </span>
            ) : null}
            {a.collection ? (
              <span className="inline-flex h-6 items-center rounded-full bg-violet-400/15 px-2 text-[11px] font-medium text-violet-200 ring-1 ring-violet-400/30 ring-inset">
                {a.collection}
              </span>
            ) : null}
            {a.sample ? (
              <span className="inline-flex h-6 items-center rounded-full bg-amber-400/15 px-2 text-[11px] font-medium text-amber-200 ring-1 ring-amber-400/30 ring-inset">
                Sample data
              </span>
            ) : null}
          </div>

          {a.clientPolicy ? (
            <div
              role="note"
              className="flex gap-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-3 text-xs leading-relaxed text-amber-100"
            >
              <AlertTriangle className="mt-px size-4 shrink-0 text-amber-300" aria-hidden />
              <p>
                <span className="font-semibold">{a.client} policy.</span> {a.clientPolicy}
              </p>
            </div>
          ) : null}

          {/* Share and download */}
          <section aria-labelledby="share-h" className={cn(well, "space-y-3 p-3")}>
            <div className="flex items-center gap-3">
              <Globe className="size-4 shrink-0 text-emerald-300" aria-hidden />
              <div className="min-w-0 flex-1">
                <label id="share-h" htmlFor="asset-public" className="block text-sm font-medium">
                  Public link
                </label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {a.public
                    ? "Anyone with the link can open it; pages can embed it. Turning this off stops it within the hour."
                    : "Private: only the team and the read-only API token can open it."}
                </p>
              </div>
              {toggling ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
              <Switch
                id="asset-public"
                checked={a.public}
                disabled={toggling}
                onCheckedChange={(v) => void setPublic(v)}
              />
            </div>
            {publicUrl ? (
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-black/30 py-1 pr-1 pl-3">
                <code
                  className="mono min-w-0 flex-1 truncate text-[11px] text-emerald-200"
                  title={publicUrl}
                >
                  {publicUrl}
                </code>
                <CopyButton
                  text={publicUrl}
                  label="Copy public URL"
                  toastText="Public URL copied"
                  className="size-11 sm:size-8"
                />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ActionButton
                icon={Link2}
                disabled={!publicUrl}
                title={publicUrl ? undefined : "Make it public first"}
                onClick={async () => {
                  if (publicUrl && (await copyText(publicUrl))) toast.success("Public URL copied");
                }}
              >
                Copy URL
              </ActionButton>
              <ActionButton
                icon={Code2}
                disabled={!publicUrl}
                title={publicUrl ? undefined : "Make it public first"}
                onClick={async () => {
                  if (!publicUrl) return;
                  if (await copyText(embedSnippet(a, publicUrl, origin)))
                    toast.success(
                      a.kind === "video"
                        ? "<video> snippet copied"
                        : a.kind === "image"
                          ? "<img> snippet copied"
                          : "Embed snippet copied",
                    );
                }}
              >
                Copy embed
              </ActionButton>
              <DownloadAction a={a} />
              <ActionButton
                icon={ExternalLink}
                onClick={() => {
                  window.open(a.fileUrl, "_blank", "noopener");
                }}
              >
                Open
              </ActionButton>
            </div>
            {!publicUrl ? (
              <p className="text-[11px] text-muted-foreground">
                Copy URL and Copy embed need the Public link on.
              </p>
            ) : null}
          </section>

          {/* Classification */}
          <section aria-labelledby="details-h" className="space-y-3">
            <h3 id="details-h" className="text-sm font-semibold">
              Details
            </h3>
            <FieldRow label="Title" htmlFor="asset-title">
              <Input
                id="asset-title"
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
                maxLength={MEDIA.limits.title}
                className={cn(tap, "bg-black/20")}
              />
            </FieldRow>
            <FieldRow
              label="Description / alt text"
              htmlFor="asset-description"
              hint="What's in it, in a sentence. Used as alt text and by agents searching the library."
            >
              <Textarea
                id="asset-description"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                maxLength={MEDIA.limits.description}
                rows={3}
                className="bg-black/20"
              />
            </FieldRow>
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldRow label="Client / property" htmlFor="asset-client">
                <ComboField
                  id="asset-client"
                  value={form.client}
                  onChange={(client) => set({ client })}
                  suggestions={clients}
                  placeholder="None"
                  maxLength={MEDIA.limits.client}
                />
              </FieldRow>
              <FieldRow label="Collection" htmlFor="asset-collection">
                <ComboField
                  id="asset-collection"
                  value={form.collection}
                  onChange={(collection) => set({ collection })}
                  suggestions={collections}
                  placeholder="None"
                  maxLength={MEDIA.limits.collection}
                />
              </FieldRow>
              <FieldRow label="Purpose" htmlFor="asset-purpose">
                <Select
                  value={form.purpose}
                  onValueChange={(v) => set({ purpose: v as Form["purpose"] })}
                >
                  <SelectTrigger id="asset-purpose" className={cn(tap, "bg-black/20")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {MEDIA_PURPOSES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {MEDIA_PURPOSE_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Rights / source" htmlFor="asset-rights">
                <ComboField
                  id="asset-rights"
                  value={form.rights}
                  onChange={(r) => set({ rights: r })}
                  suggestions={rights}
                  placeholder="Not recorded"
                  maxLength={MEDIA.limits.rights}
                />
              </FieldRow>
            </div>
            <FieldRow label="Tags" id="asset-tags-l">
              <TagEditor
                labelledBy="asset-tags-l"
                value={form.tags}
                onChange={(tags) => set({ tags })}
                known={data.facets.tags}
              />
            </FieldRow>
            <FieldRow
              label="Usage notes"
              htmlFor="asset-usage"
              hint="Where it's used, what it's cleared for, anything to avoid."
            >
              <Textarea
                id="asset-usage"
                value={form.usageNotes}
                onChange={(e) => set({ usageNotes: e.target.value })}
                maxLength={MEDIA.limits.usageNotes}
                rows={2}
                className="bg-black/20"
              />
            </FieldRow>
            <div className={cn(well, "flex items-center gap-3 px-3 py-2.5")}>
              <div className="min-w-0 flex-1">
                <label htmlFor="asset-ai" className="block text-sm font-medium">
                  AI-generated
                </label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Was this file made with AI? Filterable in the library and the API.
                </p>
              </div>
              <Switch
                id="asset-ai"
                checked={form.aiGenerated}
                onCheckedChange={(v) => set({ aiGenerated: v })}
              />
            </div>
          </section>

          {/* Facts */}
          <section aria-labelledby="facts-h">
            <h3 id="facts-h" className="text-sm font-semibold">
              File
            </h3>
            <dl className={cn(well, "mt-2 divide-y divide-white/[0.05] text-sm")}>
              <Fact label="Type">
                {MEDIA_KIND_LABELS[a.kind]} · <span className="mono text-xs">{a.mime}</span>
              </Fact>
              <Fact label="Size">{formatBytes(a.size)}</Fact>
              {a.width && a.height ? (
                <Fact label="Dimensions">
                  {a.width}×{a.height}
                  {a.aspect ? ` · ${a.aspect}` : ""}
                  {a.orientation ? ` · ${MEDIA_ORIENTATION_LABELS[a.orientation]}` : ""}
                </Fact>
              ) : null}
              {a.durationS != null ? (
                <Fact label="Duration">{formatDuration(a.durationS)}</Fact>
              ) : null}
              {a.color ? (
                <Fact label="Colour">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="size-4 rounded ring-1 ring-white/20"
                      style={{ background: a.color }}
                      aria-hidden
                    />
                    <span className="mono text-xs">{a.color}</span>
                  </span>
                </Fact>
              ) : null}
              <Fact label="Uploaded">
                <span suppressHydrationWarning>{formatDateTime(a.createdAt)}</span> · {a.uploader}
              </Fact>
              <Fact label="Edited">
                <span suppressHydrationWarning>{formatDateTime(a.updatedAt)}</span>
              </Fact>
              <Fact label="ID">
                <span className="flex items-center gap-1">
                  <code className="mono min-w-0 truncate text-xs">{a.id}</code>
                  <CopyButton
                    text={a.id}
                    label="Copy ID"
                    toastText="ID copied"
                    className="size-8"
                  />
                </span>
              </Fact>
              <Fact label="API URL">
                <span className="flex items-center gap-1">
                  <code className="mono min-w-0 truncate text-xs">{a.fileUrl}</code>
                  <CopyButton
                    text={`${origin}${a.fileUrl}`}
                    label="Copy authenticated download URL"
                    toastText="Download URL copied (needs admin or the API token)"
                    className="size-8"
                  />
                </span>
              </Fact>
            </dl>
          </section>

          <div className="pb-2">
            <Button
              type="button"
              variant="ghost"
              className={cn(
                tap,
                "w-full justify-center text-red-200 hover:bg-red-400/10 hover:text-red-100 sm:w-auto",
              )}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 aria-hidden />
              Delete from the library
            </Button>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center justify-end gap-2 border-t border-white/[0.07] px-4 py-3 sm:px-5",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        )}
      >
        <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button
          type="button"
          variant="outline"
          className={cn(tap, "bg-transparent hover:bg-white/[0.06]")}
          disabled={!dirty || saving}
          onClick={() => setForm(formOf(a))}
        >
          Undo
        </Button>
        <Button
          type="button"
          className={tap}
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />}
          Save
        </Button>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {a.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              The file is removed from storage{a.public ? " and its public link stops working" : ""}
              . Pages that embed it will break. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={tap}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                tap,
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              )}
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {deleting ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3 px-3 py-2">
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-white/85">{children}</dd>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  title,
}: {
  icon: typeof Link2;
  children: ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 justify-center bg-white/[0.02] text-xs hover:bg-white/[0.07] sm:h-10"
      disabled={disabled}
      title={title}
      onClick={() => void onClick()}
    >
      <Icon aria-hidden />
      {children}
    </Button>
  );
}

function DownloadAction({ a }: { a: MediaAssetView }) {
  const [pct, setPct] = useState<number | null>(null);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 justify-center bg-white/[0.02] text-xs hover:bg-white/[0.07] sm:h-10"
      disabled={pct !== null}
      onClick={async () => {
        setPct(0);
        try {
          await downloadMediaFile(a, { onProgress: setPct });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Download failed.");
        } finally {
          setPct(null);
        }
      }}
    >
      {pct !== null ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {pct !== null && pct < 1 ? `${Math.round(pct * 100)}%` : "Download"}
    </Button>
  );
}

/* ── Preview ──────────────────────────────────────────────────────────────── */

const box =
  "relative grid w-full place-items-center overflow-hidden rounded-2xl bg-black ring-1 ring-white/[0.08]";

function Preview({ a }: { a: MediaAssetView }) {
  const [lightbox, setLightbox] = useState(false);
  const ext = extOf(a.name);
  const ratio = a.width && a.height ? a.width / a.height : null;
  const frameStyle = ratio ? { aspectRatio: `${a.width} / ${a.height}` } : undefined;

  if (a.kind === "video")
    return (
      <div
        className={cn(
          box,
          !ratio && "aspect-video",
          ratio && ratio < 1 && "mx-auto max-h-[58vh] w-auto",
        )}
        style={frameStyle}
      >
        <video
          src={a.fileUrl}
          poster={a.thumbUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="size-full bg-black object-contain"
          aria-label={`Video: ${a.title}`}
          data-testid="media-video"
        />
      </div>
    );
  if (a.kind === "image")
    return (
      <>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className={cn(
            box,
            "group max-h-[58vh] cursor-zoom-in bg-[conic-gradient(at_50%_50%,#17151f_25%,#1e1b29_0_50%,#17151f_0_75%,#1e1b29_0)] bg-[length:16px_16px] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
            !ratio && "aspect-[4/3]",
          )}
          style={ratio ? { aspectRatio: `${Math.max(ratio, 0.6)}` } : undefined}
          aria-label={`View ${a.title} full size`}
        >
          <img
            src={a.mime === "image/heic" && a.thumbUrl ? a.thumbUrl : a.fileUrl}
            alt={a.description || a.title}
            className="size-full object-contain"
          />
          <span className="absolute right-2 bottom-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/60 px-3 text-xs text-white/85 opacity-0 ring-1 ring-white/10 backdrop-blur transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Maximize2 className="size-3.5" aria-hidden /> Full size
          </span>
        </button>
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="grid h-[100dvh] w-screen max-w-none place-items-center rounded-none border-0 bg-black/95 p-2 sm:p-8 [&>button]:size-11 [&>button]:place-items-center [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:opacity-100">
            <DialogTitle className="sr-only">{a.title}</DialogTitle>
            <img
              src={a.mime === "image/heic" && a.thumbUrl ? a.thumbUrl : a.fileUrl}
              alt={a.description || a.title}
              className="max-h-full max-w-full object-contain"
            />
          </DialogContent>
        </Dialog>
      </>
    );
  if (a.kind === "audio")
    return (
      <div
        className={cn(
          box,
          "gap-4 bg-[radial-gradient(80%_100%_at_50%_0%,rgb(52_211_153/0.18),transparent)] px-4 py-8",
        )}
      >
        <AssetThumb a={a} className="size-20 rounded-2xl" />
        <audio
          src={a.fileUrl}
          controls
          preload="metadata"
          className="w-full"
          aria-label={`Audio: ${a.title}`}
        />
      </div>
    );
  if (a.kind === "model" && (ext === "glb" || ext === "gltf")) {
    const q = new URLSearchParams({ src: a.fileUrl, ext, size: String(a.size) });
    return (
      <div className={cn(box, "aspect-[4/3]")}>
        <iframe
          src={`/hub-viewer/index.html?${q}`}
          title={`3D preview of ${a.title}`}
          className="size-full border-0"
          allow="fullscreen"
          loading="lazy"
        />
      </div>
    );
  }
  if (a.mime === "application/pdf")
    return (
      <div className={cn(box, "aspect-[4/5] max-h-[60vh] bg-white")}>
        <iframe
          src={`${a.fileUrl}#view=FitH`}
          title={a.title}
          className="size-full border-0"
          loading="lazy"
        />
      </div>
    );
  if (a.kind === "font") return <FontPreview a={a} />;
  if (a.kind === "data") return <TextPreview a={a} />;
  return (
    <div className={cn(box, "gap-3 px-4 py-10 text-center")}>
      <AssetThumb a={a} className="size-20 rounded-2xl" />
      <p className="max-w-xs text-sm text-muted-foreground">
        {a.kind === "model"
          ? `.${ext.toUpperCase()} can't be previewed here. Download it to open it in a 3D app (or on an iPhone for AR Quick Look).`
          : "No preview for this type. Download it to open it."}
      </p>
    </div>
  );
}

function FontPreview({ a }: { a: MediaAssetView }) {
  const [family, setFamily] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const name = `media-${a.id}`;
    const face = new FontFace(name, `url(${a.fileUrl})`);
    face
      .load()
      .then((f) => {
        document.fonts.add(f);
        setFamily(name);
      })
      .catch(() => setFailed(true));
  }, [a.id, a.fileUrl]);
  return (
    <div
      className={cn(box, "gap-2 px-5 py-8 text-center")}
      style={family ? { fontFamily: family } : undefined}
    >
      {family ? (
        <>
          <div className="text-5xl leading-tight">Aa Bb Cc</div>
          <div className="text-xl leading-snug">The quick brown fox jumps over the lazy dog</div>
          <div className="text-base text-muted-foreground">0123456789 !?&amp;@#</div>
        </>
      ) : failed ? (
        <p className="text-sm text-muted-foreground">
          This font couldn't be previewed. Download it to install it.
        </p>
      ) : (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading font" />
      )}
    </div>
  );
}

function TextPreview({ a }: { a: MediaAssetView }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(a.fileUrl, { headers: { range: "bytes=0-6143" }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then(setText)
      .catch((e) => {
        if (!ctrl.signal.aborted) setFailed(!!e);
      });
    return () => ctrl.abort();
  }, [a.fileUrl]);
  return (
    <div className={cn(well, "max-h-[50vh] overflow-auto p-3")}>
      {text != null ? (
        <pre className="mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/80">
          {text}
          {a.size > 6144 ? "\n…" : ""}
        </pre>
      ) : failed ? (
        <p className="text-sm text-muted-foreground">Couldn't load a preview.</p>
      ) : (
        <Loader2
          className="mx-auto size-5 animate-spin text-muted-foreground"
          aria-label="Loading preview"
        />
      )}
    </div>
  );
}
