import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Copy, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { copyText } from "./format";

// The small set of pieces the /admin screens share, so Analytics and Client
// links read as one tool.

export function PageHeader({
  title,
  badge,
  actions,
  children,
}: {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-border px-4 pt-6 pb-5 sm:px-6 lg:px-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
          {badge}
        </div>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card bg-gradient-to-b from-white/[0.03] to-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  title,
  sub,
  actions,
  className,
  id,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-medium tracking-tight">
          {title}
        </h2>
        {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Deploy previews and local dev keep their own data, apart from medialife.ai. */
export function NamespaceBadge({ ns }: { ns: "prod" | "preview" | "dev" | undefined }) {
  if (!ns || ns === "prod") return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="mono inline-flex items-center gap-1.5 rounded-full border border-amber-400/45 bg-amber-400/10 px-2.5 py-1 text-[10px] tracking-[0.1em] whitespace-nowrap text-amber-300 uppercase outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <FlaskConical className="size-3" aria-hidden />
          Preview data
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 border border-border bg-popover text-popover-foreground">
        {ns === "dev"
          ? "Local dev: data is stored on this machine, not on medialife.ai."
          : "Deploy preview: visits and links here are separate from medialife.ai."}
      </TooltipContent>
    </Tooltip>
  );
}

/** An icon button that copies `text` and confirms with a check and a toast. */
export function CopyButton({
  text,
  label = "Copy",
  toastText = "Copied",
  className,
  showLabel = false,
  size = "icon",
}: {
  text: string;
  label?: string;
  toastText?: string;
  className?: string;
  showLabel?: boolean;
  size?: "icon" | "sm";
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (await copyText(text)) {
      setDone(true);
      toast.success(toastText);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1600);
    } else toast.error("Couldn't copy. Select the text and copy it instead.");
  }
  const Icon = done ? Check : Copy;
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "icon" && !showLabel ? "icon" : "sm"}
      onClick={onClick}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
      className={cn(
        "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        size === "icon" && !showLabel && "size-8",
        className,
      )}
    >
      <Icon className={cn(done && "text-emerald-400")} aria-hidden />
      {showLabel ? <span>{done ? "Copied" : label}</span> : null}
    </Button>
  );
}

/** A labelled figure. `meter` (0–1) draws a thin share bar under the value. */
export function StatTile({
  label,
  value,
  hint,
  meter,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  meter?: number | null;
  loading?: boolean;
}) {
  return (
    <Panel className="flex flex-col p-4">
      <Eyebrow>{label}</Eyebrow>
      {loading ? (
        <div className="mt-2.5 h-8 w-20 animate-pulse rounded bg-white/[0.06]" />
      ) : (
        <div className="mt-1.5 text-2xl font-medium tracking-tight md:text-[1.75rem]">{value}</div>
      )}
      {meter != null && !loading ? (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[#0070ab]/25" aria-hidden>
          <div
            className="h-full rounded-full bg-[#259cde]"
            style={{ width: `${Math.max(0, Math.min(1, meter)) * 100}%` }}
          />
        </div>
      ) : null}
      {hint ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{loading ? " " : hint}</p>
      ) : null}
    </Panel>
  );
}

export function SignInAgain() {
  return (
    <Panel className="mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-base font-medium">Your session has ended</h2>
      <p className="mt-1 text-sm text-muted-foreground">Sign in again to keep going.</p>
      <Button asChild className="mt-4">
        <Link
          to="/admin/login"
          search={{
            next: typeof location !== "undefined" ? location.pathname + location.search : undefined,
          }}
        >
          Sign in
        </Link>
      </Button>
    </Panel>
  );
}
