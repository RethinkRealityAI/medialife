import { useEffect, useState } from "react";
import { AlertTriangle, Library, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { formatBytes, formatCount } from "./scene-math";
import type { Asset } from "./types";
import { btn, KIND_ICON, KIND_WORD } from "./ui";

// "From your assets": picks a file from the shared asset library (the same one as the Studio's Assets
// tab), so both editors share one library. The host passes `library` (SceneEditorProps).

export function AssetPicker({
  open,
  onOpenChange,
  load,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: () => Promise<Asset[]>;
  onPick: (asset: Asset) => void;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setError(null);
    load().then(
      (a) => live && setAssets(a),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-white/10 bg-[#17181c] text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>From your assets</DialogTitle>
          <DialogDescription>
            The files you have added in the Spray Studio's Assets tab or here. Pick one to add it to
            this scene.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        ) : !assets ? (
          <p className="flex items-center gap-2 py-6 text-sm text-white/60" aria-busy="true">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading your assets
          </p>
        ) : !assets.length ? (
          <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60">
            Your asset library is empty. Add files in the Spray Studio's Assets tab, or upload one
            here with Add model, picture or video.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Your assets">
            {assets.map((a) => {
              const Icon = KIND_ICON[a.kind];
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    className={cn(
                      btn,
                      "h-auto w-full flex-col items-stretch gap-0 overflow-hidden p-0 text-left",
                    )}
                    onClick={() => onPick(a)}
                  >
                    <span className="grid aspect-square place-items-center bg-[#2a2b31]">
                      {a.thumb ? (
                        <img src={a.thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon aria-hidden className="!size-8 text-white/40" />
                      )}
                    </span>
                    <span className="block truncate px-2.5 pt-2 text-sm font-medium">{a.name}</span>
                    <span className="block truncate px-2.5 pb-2 text-xs text-white/55">
                      {KIND_WORD[a.kind]} · {formatBytes(a.bytes)}
                      {a.tris != null ? ` · ${formatCount(a.tris)} triangles` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { Library as LibraryIcon };
