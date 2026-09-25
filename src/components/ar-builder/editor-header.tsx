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
  PanelLeftClose,
  PanelLeftOpen,
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
    "rounded font-medium text-foreground underline-offset-2 hover:underline pointer-coarse:px-1 pointer-coarse:py-2.5 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";
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

/** 44 px targets on touch screens (header buttons are 32 px for a mouse). */
const touch = "pointer-coarse:h-11 pointer-coarse:min-w-11";
const touchItem = "pointer-coarse:py-3";

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
  compact = false,
  tiny = false,
  panel,
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
  /** narrow: Library, Open preview and Share move into the overflow menu */
  compact?: boolean;
  /** phone width: icons only */
  tiny?: boolean;
  /** side-by-side layout: show / hide the settings panel */
  panel?: { open: boolean; toggle: () => void } | null;
}) {
  const live = status !== "draft";
  const problem =
    save.status === "error" || save.status === "conflict" || save.status === "signed-out";
  const saveState = (
    <SaveState
      {...save}
      slug={slug}
      onRetry={onRetry}
      onReload={onReload}
      onOverwrite={onOverwrite}
    />
  );

  const shareItems = (
    <>
      {live ? (
        <>
          <DropdownMenuLabel className="mono truncate text-[11px] font-normal text-muted-foreground">
            {shareUrl(slug).replace(/^https?:\/\//, "")}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className={touchItem}
            onSelect={async () => {
              if (await copyText(shareUrl(slug))) toast.success("Link copied");
            }}
          >
            <Copy aria-hidden /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={touchItem}>
            <a href={shareUrl(slug)} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden /> Open the live endcap
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={touchItem}>
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
    </>
  );

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-2 sm:gap-3 sm:px-3">
        <Button
          variant="ghost"
          size={tiny ? "icon" : "sm"}
          asChild
          className={cn("shrink-0 text-muted-foreground", touch)}
        >
          <Link to="/admin/builder" aria-label={tiny ? "All endcaps" : undefined}>
            <ArrowLeft aria-hidden /> {tiny ? null : "Endcaps"}
          </Link>
        </Button>
        {panel ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0 text-muted-foreground", touch)}
            onClick={panel.toggle}
            aria-pressed={panel.open}
            aria-label={panel.open ? "Hide settings" : "Show settings"}
            title={panel.open ? "Hide settings (bigger preview)" : "Show settings"}
          >
            {panel.open ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
          </Button>
        ) : null}
        {!tiny ? <span aria-hidden className="h-5 w-px shrink-0 bg-border" /> : null}
        <div className="flex min-w-0 items-center gap-2.5">
          <h1 className="truncate text-sm font-medium" title={name}>
            {name || "Untitled endcap"}
          </h1>
          {!tiny ? <StatusPill status={status} className="shrink-0" /> : null}
        </div>
        <div className="ml-1 min-w-0 flex-1 sm:ml-2">
          {/* narrow: problems get their own strip below, with room for the actions */}
          {compact && problem ? (
            <AlertCircle className="size-4 text-amber-300" aria-label="Not saved" />
          ) : tiny ? (
            <SaveIcon status={save.status} />
          ) : (
            saveState
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!compact ? (
            <>
              <Button variant="ghost" size="sm" className={touch} onClick={onLibrary}>
                <Images aria-hidden /> <span className="hidden xl:inline">Library</span>
                <span className="sr-only xl:hidden">Asset library</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onPreview}
                className={touch}
                title="Opens the draft in a new tab"
              >
                <Eye aria-hidden /> <span className="hidden xl:inline">Open preview</span>
                <span className="sr-only xl:hidden">Open preview in a new tab</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={touch}>
                    <Link2 aria-hidden /> Share{" "}
                    <ChevronDown className="size-3.5 opacity-60" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {shareItems}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href={draftPreviewHref(slug)} target="_blank" rel="noreferrer">
                      <Eye aria-hidden /> Open the draft preview
                    </a>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
          {compact || live ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-8", touch)}
                  aria-label="More actions"
                >
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {compact ? (
                  <>
                    {tiny ? (
                      <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
                        <StatusPill status={status} />
                      </DropdownMenuLabel>
                    ) : null}
                    <DropdownMenuItem className={touchItem} onSelect={onLibrary}>
                      <Images aria-hidden /> Asset library
                    </DropdownMenuItem>
                    <DropdownMenuItem className={touchItem} onSelect={onPreview}>
                      <Eye aria-hidden /> Open preview in a new tab
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs font-medium">Share</DropdownMenuLabel>
                    {shareItems}
                  </>
                ) : null}
                {live ? (
                  <>
                    {compact ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem
                      onSelect={onUnpublish}
                      className={cn("text-destructive focus:text-destructive", touchItem)}
                    >
                      Unpublish…
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button
            size="sm"
            onClick={onPublish}
            className={cn("relative ml-1 text-white shadow-[0_4px_20px_-8px_var(--glow)]", touch)}
            style={{ background: "var(--gradient-ember-btn)" }}
          >
            <Rocket aria-hidden />
            {tiny
              ? "Publish"
              : status === "changed"
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
      {compact && problem ? (
        <div className="flex min-h-11 shrink-0 items-center border-b border-amber-400/30 bg-amber-400/[0.06] px-3 py-1.5">
          {saveState}
        </div>
      ) : null}
    </>
  );
}

function SaveIcon({ status }: { status: SaveStatus }) {
  return (
    <span className="inline-flex text-muted-foreground" role="status" aria-live="polite">
      {status === "saved" ? (
        <Check className="size-4" aria-label="Saved" />
      ) : (
        <Loader2 className="size-4 animate-spin" aria-label="Saving" />
      )}
    </span>
  );
}
