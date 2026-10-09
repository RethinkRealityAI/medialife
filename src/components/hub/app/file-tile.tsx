/**
 * A file as a thumbnail tile. Clicking it opens the lightbox (download and
 * delete live there); a small download button stays on the tile for speed.
 */
import { useState } from "react";
import { Download, FileArchive, FileText, FileType, Film, Trash2 } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fileUrl, isImage, shortDate, type HubFile } from "@/lib/hub/model";
import { deleteHubFile, formatBytes } from "@/lib/hub/upload-client";
import { cn } from "@/lib/utils";

const fileExt = (name: string) =>
  name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 5) : "FILE";

function TypeIcon({ mime, name }: { mime: string; name: string }) {
  const ext = fileExt(name);
  const Icon = mime.startsWith("video/")
    ? Film
    : /zip/.test(mime) || ext === "ZIP"
      ? FileArchive
      : /font|otf|ttf|woff/i.test(mime + ext)
        ? FileType
        : FileText;
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-[radial-gradient(ellipse_at_top,oklch(0.3_0.1_240/35%),transparent_70%)]">
      <Icon className="size-7 text-muted-foreground" aria-hidden />
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
        {ext}
      </span>
    </div>
  );
}

export function FilePreview({ file, className }: { file: HubFile; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-white/[0.03]", className)}>
      {isImage(file.mime) ? (
        <img
          src={fileUrl(file)}
          alt=""
          loading="lazy"
          className="size-full bg-[conic-gradient(at_50%_50%,#1a1a22_25%,#22222c_0_50%,#1a1a22_0_75%,#22222c_0)] bg-[length:16px_16px] object-contain"
        />
      ) : (
        <TypeIcon mime={file.mime} name={file.name} />
      )}
    </div>
  );
}

export function FileTile({
  file,
  onOpen,
  label,
}: {
  file: HubFile;
  onOpen: () => void;
  /** A small category tag above the name. */
  label?: string;
}) {
  return (
    <li className="group relative min-w-0 overflow-hidden rounded-xl border border-border bg-white/[0.02] transition-colors hover:border-primary/50">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
      >
        <FilePreview file={file} className="aspect-square" />
        <span className="block min-w-0 p-2.5">
          {label ? <span className="block truncate text-[11px] text-primary">{label}</span> : null}
          <span className="block truncate text-xs font-medium" title={file.name}>
            {file.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
            {formatBytes(file.size)} · {shortDate(file.createdAt).replace(/, \d{4}$/, "")}
          </span>
        </span>
        <span className="sr-only">Open preview</span>
      </button>
      <a
        href={fileUrl(file, true)}
        download={file.name}
        className="absolute top-2 right-2 grid size-8 place-items-center rounded-full border border-white/15 bg-background/80 opacity-100 backdrop-blur transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:opacity-0 sm:group-hover:opacity-100"
        aria-label={`Download ${file.name}`}
      >
        <Download className="size-4" aria-hidden />
      </a>
    </li>
  );
}

/** Delete with a confirm. For files the creator uploaded. */
export function DeleteFileButton({ file, onDeleted }: { file: HubFile; onDeleted?: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hover:border-red-400/50 hover:bg-red-400/10 hover:text-red-300"
          disabled={busy}
          aria-label={`Delete ${file.name}`}
        >
          <Trash2 aria-hidden />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{file.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It's removed from your library. Designs we've already made with it aren't affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async () => {
              setBusy(true);
              try {
                await deleteHubFile(file);
                toast.success(`Deleted ${file.name}`);
                onDeleted?.();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Couldn't delete the file.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete file
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
