import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Monitor, RotateCw, Smartphone } from "lucide-react";

import { Segmented } from "@/components/ar-builder/fields";
import { Button } from "@/components/ui/button";
import { SHELF_PREVIEW_URL } from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

import type { ShelfPreview } from "./use-shelf-preview";

// The live preview pane: the shelf page in an iframe (desktop or a phone frame),
// with loading and "didn't start" states. The protocol is in use-shelf-preview.ts.

const PHONE = { w: 390, h: 844 };

export function ShelfPreviewPane({
  preview,
  invalid,
}: {
  preview: ShelfPreview;
  /** the draft has a problem, so the preview shows the last valid version */
  invalid: boolean;
}) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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

  // the iframe starts loading only once we're hydrated and listening: a page that
  // says shelf:ready before then would never hear back
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const busy = preview.status === "loading";
  const down = preview.status === "unavailable";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[oklch(0.1_0.008_280)]">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
          Live preview
        </span>
        {invalid ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-300">
            <AlertTriangle className="size-3" aria-hidden /> Showing the last valid version
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="w-[88px] pointer-coarse:w-[108px]">
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
            className="size-8 pointer-coarse:size-11"
            onClick={preview.reload}
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
            ref={preview.iframeRef}
            src={mounted ? SHELF_PREVIEW_URL : undefined}
            title="Shelf preview"
            data-testid="shelf-preview"
            className={cn(
              "block size-full border-0 bg-black",
              device === "phone" && "rounded-[32px]",
            )}
            allow="fullscreen"
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
                  The shelf page didn't answer. Your edits are still being saved, and you can
                  publish without a link-preview image. Try reloading the preview.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={preview.reload}>
                  <RotateCw aria-hidden /> Reload preview
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
