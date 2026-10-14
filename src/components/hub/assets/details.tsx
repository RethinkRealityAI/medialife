/**
 * One file, up close: a real preview for every type the browser can show
 * (images, video, audio, PDFs, 3D models, fonts), then where it lives, its
 * tags and note, what it is, and where it's used.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Download, ExternalLink, Loader2, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ResponsiveDrawer } from "@/components/hub/app/responsive-drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSET_SECTIONS,
  MEDIA_LABEL,
  PREVIEW_3D,
  SECTION_META,
  extOf,
  mediaTypeOf,
  sectionOf,
  tagsOf,
  type AssetPatch,
  type AssetSection,
} from "@/lib/hub/assets";
import { downloadHubFile } from "@/lib/hub/download-client";
import { fileUrl, isImage, shortDate, type AssetFolder, type HubFile } from "@/lib/hub/model";
import { deleteHubFile, formatBytes } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

import { TYPE_ICON, errorText, useFontFamily } from "./shared";
import { TagPicker } from "./tag-picker";

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

export type UsedIn = { id: string; name: string; href?: string };

export function AssetPreview({ file, className }: { file: HubFile; className?: string }) {
  const type = mediaTypeOf(file);
  const ext = extOf(file.name);
  const family = useFontFamily(file, type === "font");
  const box = cn(
    "relative grid w-full place-items-center overflow-hidden rounded-xl border border-border bg-black/30",
    className,
  );

  if (isImage(file.mime))
    return (
      <div className={cn(box, "aspect-[4/3]")}>
        <img
          src={fileUrl(file)}
          alt={file.name}
          className="size-full bg-[conic-gradient(at_50%_50%,#1a1a22_25%,#22222c_0_50%,#1a1a22_0_75%,#22222c_0)] bg-[length:16px_16px] object-contain"
        />
      </div>
    );
  if (type === "video")
    return (
      <div className={cn(box, "aspect-video bg-black")}>
        <video src={fileUrl(file)} controls playsInline preload="metadata" className="size-full" />
      </div>
    );
  if (type === "audio")
    return (
      <div className={cn(box, "gap-3 px-4 py-6")}>
        <TypeIconBig file={file} />
        <audio src={fileUrl(file)} controls preload="metadata" className="w-full" />
      </div>
    );
  if (file.mime === "application/pdf")
    return (
      <div className={cn(box, "aspect-[4/5] max-h-[60vh] bg-white")}>
        <iframe
          src={`${fileUrl(file)}#view=FitH`}
          title={file.name}
          className="size-full border-0"
        />
      </div>
    );
  if (type === "3d" && PREVIEW_3D.has(ext)) {
    const q = new URLSearchParams({ src: fileUrl(file), ext, size: String(file.size) });
    return (
      <div className={cn(box, "aspect-[4/3]")}>
        <iframe
          src={`/hub-viewer/index.html?${q}`}
          title={`3D preview of ${file.name}`}
          className="size-full border-0"
          allow="fullscreen"
        />
      </div>
    );
  }
  if (type === "font")
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
        ) : (
          <Loader2
            className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-label="Loading font"
          />
        )}
      </div>
    );
  return (
    <div className={cn(box, "gap-2 px-4 py-10 text-center")}>
      <TypeIconBig file={file} />
      <p className="max-w-xs text-sm text-muted-foreground">
        {type === "3d"
          ? `.${ext.toUpperCase()} files can't be previewed here. Download it to open it in your 3D app.`
          : "No preview for this type. Download it to open it."}
      </p>
    </div>
  );
}

function TypeIconBig({ file }: { file: HubFile }) {
  const Icon = TYPE_ICON[mediaTypeOf(file)];
  return (
    <span className="grid size-14 place-items-center rounded-full border border-border bg-white/[0.04]">
      <Icon className="size-6 text-muted-foreground" aria-hidden />
    </span>
  );
}

/** Saves on blur or Enter, if it changed. */
function InlineText({
  id,
  value,
  onSave,
  multiline,
  placeholder,
  disabled,
  maxLength,
}: {
  id: string;
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  maxLength: number;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v.trim() !== value.trim() && (multiline || v.trim())) onSave(v);
    else setV(value);
  };
  const common = {
    id,
    value: v,
    disabled,
    placeholder,
    maxLength,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <Textarea {...common} rows={3} className="resize-y text-sm" />
  ) : (
    <Input
      {...common}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setV(value);
      }}
    />
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

export function AssetDetails({
  file,
  open,
  onOpenChange,
  folders,
  yourTags,
  usedIn,
  canEdit,
  canDelete,
  onPatch,
  onDeleted,
  mode,
}: {
  mode: "creator" | "admin";
  file: HubFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: AssetFolder[];
  yourTags: string[];
  usedIn: UsedIn[];
  /** Rename and note: whoever uploaded it, and the team. */
  canEdit: boolean;
  canDelete: boolean;
  onPatch: (f: HubFile, p: AssetPatch, message?: string) => void;
  onDeleted: (f: HubFile) => void;
}) {
  const [downloading, setDownloading] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!file) return null;
  const f = file;
  const type = mediaTypeOf(f);
  const section = sectionOf(f);
  const inSection = folders.filter((x) => x.section === section);
  const tags = tagsOf(f);
  const inline = isImage(f.mime) || f.mime === "application/pdf" || type === "video";

  async function download() {
    setDownloading(0);
    try {
      await downloadHubFile(f, { onProgress: setDownloading });
    } catch (e) {
      toast.error(errorText(e, "Couldn't download the file."));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="block truncate pr-2">{f.name}</span>}
      description={`${MEDIA_LABEL[type]} · ${formatBytes(f.size)} · ${SECTION_META[section].label}`}
      className="sm:max-w-lg"
      footer={
        <div className="flex items-center gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={() => void download()}
            disabled={downloading !== null}
          >
            {downloading !== null ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Download aria-hidden />
            )}
            {downloading !== null && downloading > 0
              ? `Downloading ${Math.round(downloading * 100)}%`
              : "Download"}
          </Button>
          {inline ? (
            <Button type="button" variant="outline" asChild>
              <a href={fileUrl(f)} target="_blank" rel="noopener" aria-label="Open in a new tab">
                <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            aria-pressed={!!f.starred}
            aria-label={f.starred ? "Unstar" : "Star"}
            onClick={() => onPatch(f, { starred: !f.starred })}
          >
            <Star className={cn(f.starred && "fill-amber-300 text-amber-300")} aria-hidden />
          </Button>
          {canDelete ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-300"
                  aria-label={`Delete ${f.name}`}
                  disabled={deleting}
                >
                  <Trash2 aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{f.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It's removed from the library for good.
                    {usedIn.length
                      ? ` It's also taken off ${usedIn.map((u) => u.name).join(", ")}.`
                      : ""}{" "}
                    Designs already made with it aren't affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await deleteHubFile(f);
                        toast.success(`Deleted ${f.name}`);
                        onDeleted(f);
                      } catch (e) {
                        toast.error(errorText(e, "Couldn't delete the file."));
                      } finally {
                        setDeleting(false);
                      }
                    }}
                  >
                    Delete file
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5">
        <AssetPreview file={f} />

        <Field label="Name" htmlFor="asset-name">
          {canEdit ? (
            <InlineText
              id="asset-name"
              value={f.name}
              maxLength={140}
              onSave={(name) => onPatch(f, { name }, "Renamed")}
            />
          ) : (
            <p className="text-sm break-all">{f.name}</p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Section" htmlFor="asset-section">
            <select
              id="asset-section"
              className={selectClass}
              value={section}
              onChange={(e) =>
                onPatch(
                  f,
                  { section: e.target.value as AssetSection, folderId: null },
                  `Moved to ${SECTION_META[e.target.value as AssetSection].label}`,
                )
              }
            >
              {ASSET_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {SECTION_META[s].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Folder" htmlFor="asset-folder">
            <select
              id="asset-folder"
              className={selectClass}
              value={f.folderId ?? ""}
              disabled={!inSection.length}
              onChange={(e) => onPatch(f, { folderId: e.target.value || null }, "Moved")}
            >
              <option value="">{inSection.length ? "No folder" : "No folders here yet"}</option>
              {inSection.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Tags">
          <TagPicker
            value={tags}
            yourTags={yourTags}
            onChange={(t) => onPatch(f, { setTags: t })}
          />
        </Field>

        <Field label="Note" htmlFor="asset-note">
          {canEdit ? (
            <InlineText
              id="asset-note"
              value={f.note}
              multiline
              maxLength={500}
              placeholder="Where it's from, how to use it, what it's for…"
              onSave={(note) => onPatch(f, { note }, "Note saved")}
            />
          ) : f.note ? (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{f.note}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No note.</p>
          )}
        </Field>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl border border-border p-3 text-sm">
          <dt className="text-muted-foreground">Type</dt>
          <dd>
            {MEDIA_LABEL[type]}{" "}
            <span className="text-muted-foreground uppercase">· {extOf(f.name)}</span>
          </dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd className="tabular-nums">{formatBytes(f.size)}</dd>
          <dt className="text-muted-foreground">Added</dt>
          <dd>
            {shortDate(f.createdAt)} by{" "}
            {f.uploadedBy === "medialife"
              ? "MEDIALIFE"
              : mode === "creator"
                ? "you"
                : "the creator"}
          </dd>
          {usedIn.length ? (
            <>
              <dt className="text-muted-foreground">Used in</dt>
              <dd className="flex flex-wrap gap-x-2">
                {usedIn.map((u) =>
                  u.href ? (
                    <a key={u.id} href={u.href} className="text-primary hover:underline">
                      {u.name}
                    </a>
                  ) : (
                    <span key={u.id}>{u.name}</span>
                  ),
                )}
              </dd>
            </>
          ) : null}
        </dl>
      </div>
    </ResponsiveDrawer>
  );
}
