import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Monitor, RotateCw, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIEWS, type Project, type ViewId } from "@/lib/ar/project";
import { cn } from "@/lib/utils";

import { Segmented } from "./fields";
import { ENGINE_PREVIEW_URL, type Engine } from "./use-engine";

// The live preview: the real engine page in an iframe, driven over postMessage.

const PHONE = { w: 390, h: 844 };

export function PreviewPane({
  engine,
  draft,
  theme,
  onTheme,
  view,
  onView,
  warnings,
  onClearWarnings,
}: {
  engine: Engine;
  draft: Project;
  theme: string;
  onTheme: (id: string) => void;
  view: ViewId | "";
  onView: (v: ViewId) => void;
  warnings: string[];
  onClearWarnings: () => void;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // fit the phone frame to the space available
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setScale(Math.min(1, (height - 40) / (PHONE.h + 24), (width - 40) / (PHONE.w + 24)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const busy = engine.status === "loading";
  const down = engine.status === "unavailable";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[oklch(0.1_0.008_280)]">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <Select value={theme || undefined} onValueChange={onTheme}>
          <SelectTrigger aria-label="Preview theme" className="h-8 w-36 bg-background/60 text-xs">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            {draft.themes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${t.led}, ${t.led2})` }}
                  />
                  {t.name || t.id}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={view || undefined} onValueChange={(v) => onView(v as ViewId)}>
          <SelectTrigger aria-label="Camera view" className="h-8 w-48 bg-background/60 text-xs">
            <SelectValue placeholder="Camera view" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VIEWS) as ViewId[]).map((v) => (
              <SelectItem key={v} value={v}>
                {VIEWS[v]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {warnings.length ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 text-xs text-amber-300 hover:bg-amber-400/15 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {warnings.length === 1
                    ? "1 preview warning"
                    : `${warnings.length} preview warnings`}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                  <p className="text-xs font-medium">From the preview</p>
                  <button
                    type="button"
                    onClick={onClearWarnings}
                    className="rounded text-xs text-muted-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Clear
                  </button>
                </div>
                <ul className="max-h-64 space-y-2 overflow-auto p-3 text-xs">
                  {warnings.map((w, i) => (
                    <li key={i} className="leading-relaxed text-muted-foreground">
                      {w}
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}
          <div className="w-[88px]">
            <Segmented
              label="Preview size"
              hideLabel
              value={device}
              onChange={setDevice}
              options={[
                { value: "desktop", label: "", icon: <Monitor aria-label="Desktop" /> },
                { value: "phone", label: "", icon: <Smartphone aria-label="Phone" /> },
              ]}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={engine.reload}
            aria-label="Reload the preview"
          >
            <RotateCw aria-hidden />
          </Button>
        </div>
      </div>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "absolute",
            device === "desktop"
              ? "inset-0"
              : "top-1/2 left-1/2 rounded-[44px] border border-white/15 bg-black p-3 shadow-2xl",
          )}
          style={
            device === "phone"
              ? {
                  width: PHONE.w + 24,
                  height: PHONE.h + 24,
                  transform: `translate(-50%, -50%) scale(${scale})`,
                }
              : undefined
          }
        >
          <iframe
            ref={engine.iframeRef}
            src={ENGINE_PREVIEW_URL}
            title="Endcap preview"
            className={cn(
              "block size-full border-0 bg-black",
              device === "phone" && "rounded-[32px]",
            )}
            allow="fullscreen; xr-spatial-tracking"
          />
        </div>

        {busy || down ? (
          <div className="absolute inset-0 grid place-items-center bg-[oklch(0.1_0.008_280)]/90 backdrop-blur-sm">
            {busy ? (
              <div
                className="flex items-center gap-2.5 text-sm text-muted-foreground"
                role="status"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the preview…
              </div>
            ) : (
              <div className="max-w-sm px-6 text-center">
                <AlertTriangle className="mx-auto size-6 text-amber-300" aria-hidden />
                <p className="mt-3 text-sm font-medium">The preview didn't start</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  The endcap engine didn't answer. Your edits are still being saved. Try reloading
                  the preview.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={engine.reload}>
                  <RotateCw aria-hidden /> Reload preview
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {engine.applyError ? (
          <div
            className="absolute right-3 bottom-3 left-3 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-background/95 p-3 text-xs shadow-lg"
            role="status"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" aria-hidden />
            <p className="min-w-0 flex-1 leading-relaxed">
              <span className="font-medium">The preview couldn't show the last change.</span>{" "}
              <span className="text-muted-foreground">{engine.applyError}</span>
            </p>
            <button
              type="button"
              onClick={engine.reload}
              className="shrink-0 rounded text-xs font-medium text-primary hover:underline focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            >
              Reload
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
