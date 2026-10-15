import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Download,
  ExternalLink,
  FileArchive,
  FileText,
  FileVideo,
  Loader2,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

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
import { HUB, fileUrl, isImage, type FileKind, type HubFile } from "@/lib/hub/model";
import { UPLOAD_ACCEPT, deleteHubFile, formatBytes, uploadHubFile } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

import { formatDateTime } from "../format";
import { errorMessage, ghostBtn, outlineBtn } from "./ui";

// Uploading, showing and deleting Creator Hub files from the admin.

/** A button that picks file(s) and uploads them for a creator, with progress. */
export function UploadButton({
  creatorId,
  kind,
  category,
  productId = null,
  accept = UPLOAD_ACCEPT,
  multiple = false,
  label = "Upload",
  size = "sm",
  variant = "outline",
  onUploaded,
  className,
  disabled,
}: {
  creatorId: string;
  kind: FileKind;
  category: string;
  productId?: string | null;
  accept?: string;
  multiple?: boolean;
  label?: ReactNode;
  size?: "sm" | "default";
  variant?: "outline" | "default";
  /** Called once per finished file, before the route reloads. */
  onUploaded?: (f: HubFile) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; frac: number } | null>(null);

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (!files.length) return;
    let ok = 0;
    for (const f of files) {
      if (f.size > HUB.maxUploadBytes) {
        toast.error(`${f.name} is over ${formatBytes(HUB.maxUploadBytes)}.`);
        continue;
      }
      setProgress({ name: f.name, frac: 0 });
      try {
        const done = await uploadHubFile(f, {
          kind,
          category,
          productId,
          creatorId,
          onProgress: (frac) => setProgress({ name: f.name, frac }),
        });
        ok++;
        await onUploaded?.(done);
      } catch (err) {
        toast.error(`${f.name}: ${errorMessage(err, "upload failed")}`);
      }
    }
    setProgress(null);
    if (ok) {
      toast.success(ok === 1 ? "Uploaded" : `Uploaded ${ok} files`);
      await router.invalidate();
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => void onFiles(e.target.files)}
      />
      <Button
        type="button"
        size={size}
        variant={variant}
        className={cn(variant === "outline" && outlineBtn, "relative overflow-hidden", className)}
        disabled={disabled || !!progress}
        onClick={() => input.current?.click()}
      >
        {progress ? (
          <>
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 bg-sky-400/15 transition-[width]"
              style={{ width: `${Math.round(progress.frac * 100)}%` }}
            />
            <Loader2 className="animate-spin" aria-hidden />
            <span className="relative max-w-40 truncate">
              {Math.round(progress.frac * 100)}% · {progress.name}
            </span>
          </>
        ) : (
          <>
            <Upload aria-hidden />
            {label}
          </>
        )}
      </Button>
    </>
  );
}

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  const Icon = mime.startsWith("video/")
    ? FileVideo
    : /zip/.test(mime)
      ? FileArchive
      : /font|otf|ttf|woff/.test(mime)
        ? Type
        : FileText;
  return <Icon className={className} aria-hidden />;
}

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toUpperCase() : "");

/** A square preview: the image itself, or an icon and the extension. */
export function FileThumb({ file, className }: { file: HubFile; className?: string }) {
  return (
    <div
      className={cn(
        "grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-white/[0.03]",
        className,
      )}
    >
      {isImage(file.mime) ? (
        <img src={fileUrl(file)} alt="" loading="lazy" className="size-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <FileIcon mime={file.mime} className="size-6" />
          <span className="mono text-[10px]">{ext(file.name)}</span>
        </div>
      )}
    </div>
  );
}

/** A file card: preview, name, size, who uploaded it, open / download / delete. */
export function FileTile({
  file,
  caption,
  actions,
  onDeleted,
  canDelete = true,
}: {
  file: HubFile;
  caption?: ReactNode;
  actions?: ReactNode;
  onDeleted?: () => void;
  canDelete?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="group min-w-0 rounded-lg border border-border bg-white/[0.015] p-2">
      <a href={fileUrl(file)} target="_blank" rel="noreferrer" title={`Open ${file.name}`}>
        <FileThumb file={file} />
      </a>
      <div className="mt-2 min-w-0 px-0.5">
        <div className="truncate text-xs font-medium" title={file.name}>
          {file.name}
        </div>
        <div
          className="truncate text-[11px] text-muted-foreground"
          suppressHydrationWarning
          title={formatDateTime(file.createdAt)}
        >
          {formatBytes(file.size)} · {file.uploadedBy === "creator" ? "Creator" : "MEDIALIFE"}
        </div>
        {caption ? <div className="mt-0.5 text-[11px] text-muted-foreground">{caption}</div> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn("size-7 text-muted-foreground", ghostBtn)}
        >
          <a
            href={fileUrl(file)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${file.name}`}
            title="Open"
          >
            <ExternalLink aria-hidden />
          </a>
        </Button>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn("size-7 text-muted-foreground", ghostBtn)}
        >
          <a href={fileUrl(file, true)} aria-label={`Download ${file.name}`} title="Download">
            <Download aria-hidden />
          </a>
        </Button>
        {actions}
        {canDelete ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "ml-auto size-7 text-muted-foreground hover:bg-destructive/15 hover:text-destructive",
            )}
            onClick={() => setConfirm(true)}
            aria-label={`Delete ${file.name}`}
            title="Delete"
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>
      <DeleteFileDialog
        file={confirm ? file : null}
        onClose={() => setConfirm(false)}
        onDeleted={onDeleted}
      />
    </div>
  );
}

export function DeleteFileDialog({
  file,
  onClose,
  onDeleted,
}: {
  file: HubFile | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={!!file} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {file?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {file?.uploadedBy === "creator"
              ? "The creator uploaded this. It's removed for them too, and can't be undone."
              : "It's removed from the creator's hub too. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={outlineBtn}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              if (!file) return;
              setBusy(true);
              try {
                await deleteHubFile(file);
                toast.success("File deleted");
                onDeleted?.();
                onClose();
                await router.invalidate();
              } catch (err) {
                toast.error(errorMessage(err, "Couldn't delete the file."));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Delete file
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
