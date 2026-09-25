import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  CloudOff,
  Copy,
  ExternalLink,
  Eye,
  Images,
  Link2,
  Loader2,
  MoreHorizontal,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectStatus } from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { clientLinkHref, copyText, draftPreviewHref, shareUrl } from "./api";
import { StatusPill } from "./status";
import type { SaveStatus } from "./use-autosave";

// The editor's toolbar: back, name + status, save state, library, preview,
// share and publish.

function SaveState({
  status,
  error,
  onRetry,
  onReload,
  onOverwrite,
  slug,
}: {
  status: SaveStatus;
  error: string | null;
  onRetry: () => void;
  onReload: () => void;
  onOverwrite: () => void;
  slug: string;
}) {
  const link =
    "rounded font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      {status === "saved" ? (
        <>
          <Check className="size-3.5 shrink-0" aria-hidden /> Saved
        </>
      ) : status === "pending" || status === "saving" ? (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden /> Saving…
        </>
      ) : status === "error" ? (
        <span className="flex items-center gap-1.5 text-amber-300" title={error ?? undefined}>
          <CloudOff className="size-3.5 shrink-0" aria-hidden /> Couldn't save ·
          <button type="button" onClick={onRetry} className={link}>
            Retry
          </button>
        </span>
      ) : status === "conflict" ? (
        <span className="flex items-center gap-1.5 text-amber-300">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden /> Changed in another tab ·
          <button type="button" onClick={onReload} className={link}>
            Load theirs
          </button>
          ·
          <button type="button" onClick={onOverwrite} className={link}>
            Keep mine
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-amber-300">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden /> Signed out ·
          <a
            href={`/admin/login?next=${encodeURIComponent(`/admin/builder/${slug}`)}`}
            target="_blank"
            rel="noreferrer"
            className={link}
          >
            Sign in
          </a>
          ·
          <button type="button" onClick={onRetry} className={link}>
            Retry
          </button>
        </span>
      )}
    </div>
  );
}

export function EditorHeader({
  slug,
  name,
  status,
  save,
  onRetry,
  onReload,
  onOverwrite,
  onLibrary,
  onPreview,
  onPublish,
  onUnpublish,
}: {
  slug: string;
  name: string;
  status: ProjectStatus;
  save: { status: SaveStatus; error: string | null };
  onRetry: () => void;
  onReload: () => void;
  onOverwrite: () => void;
  onLibrary: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const live = status !== "draft";
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
      <Button variant="ghost" size="sm" asChild className="shrink-0 text-muted-foreground">
        <Link to="/admin/builder">
          <ArrowLeft aria-hidden /> Endcaps
        </Link>
      </Button>
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="truncate text-sm font-medium" title={name}>
          {name || "Untitled endcap"}
        </h1>
        <StatusPill status={status} className="shrink-0" />
      </div>
      <div className="ml-2 min-w-0 flex-1">
        <SaveState
          {...save}
          slug={slug}
          onRetry={onRetry}
          onReload={onReload}
          onOverwrite={onOverwrite}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={onLibrary}>
          <Images aria-hidden /> <span className="hidden xl:inline">Library</span>
          <span className="sr-only xl:hidden">Asset library</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onPreview} title="Opens the draft in a new tab">
          <Eye aria-hidden /> <span className="hidden xl:inline">Open preview</span>
          <span className="sr-only xl:hidden">Open preview in a new tab</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Link2 aria-hidden /> Share{" "}
              <ChevronDown className="size-3.5 opacity-60" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {live ? (
              <>
                <DropdownMenuLabel className="mono truncate text-[11px] font-normal text-muted-foreground">
                  {shareUrl(slug).replace(/^https?:\/\//, "")}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={async () => {
                    if (await copyText(shareUrl(slug))) toast.success("Link copied");
                  }}
                >
                  <Copy aria-hidden /> Copy link
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={shareUrl(slug)} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden /> Open the live endcap
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={clientLinkHref(slug)}>
                    <Link2 aria-hidden /> Make a client link…
                  </a>
                </DropdownMenuItem>
              </>
            ) : (
              <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                Publish first to get a link you can share. Until then, use Open preview.
              </p>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={draftPreviewHref(slug)} target="_blank" rel="noreferrer">
                <Eye aria-hidden /> Open the draft preview
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {status === "published" || status === "changed" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={onUnpublish}
                className="text-destructive focus:text-destructive"
              >
                Unpublish…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          size="sm"
          onClick={onPublish}
          className={cn("relative ml-1 text-white shadow-[0_4px_20px_-8px_var(--glow)]")}
          style={{ background: "var(--gradient-ember-btn)" }}
        >
          <Rocket aria-hidden />{" "}
          {status === "changed"
            ? "Publish changes"
            : status === "published"
              ? "Republish"
              : "Publish"}
          {status !== "published" ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-amber-300"
            />
          ) : null}
        </Button>
      </div>
    </div>
  );
}
