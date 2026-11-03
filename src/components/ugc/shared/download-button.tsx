/**
 * Download for brief assets and submissions. Small files use a plain link;
 * big ones are read in Range pieces by downloadUgcFile (a single function
 * response tops out near 20 MB), with progress shown on the button.
 */
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { downloadUgcFile } from "@/lib/ugc/upload-client";
import { cn } from "@/lib/utils";

import { btnGhost, btnIcon } from "./look";

type F = { downloadUrl: string; size: number; mime: string; name: string };

export function DownloadButton({
  file,
  label = "Download",
  icon,
  className,
}: {
  file: F;
  label?: string;
  /** Round icon-only button. */
  icon?: boolean;
  className?: string;
}) {
  const [pct, setPct] = useState<number | null>(null);
  async function go() {
    if (pct != null) return;
    setPct(0);
    try {
      await downloadUgcFile(file, { onProgress: (f) => setPct(Math.round(f * 100)) });
    } catch {
      toast.error(`Couldn't download ${file.name}. Check your connection and try again.`);
    } finally {
      setPct(null);
    }
  }
  const busy = pct != null;
  return (
    <button
      type="button"
      onClick={go}
      aria-label={icon ? `Download ${file.name}` : undefined}
      aria-busy={busy || undefined}
      className={cn(icon ? btnIcon : btnGhost, "relative overflow-hidden", className)}
    >
      {busy ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-[#3fe6e0]/15 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      ) : null}
      {busy ? (
        <Loader2 className="relative motion-safe:animate-spin" aria-hidden />
      ) : (
        <Download className="relative" aria-hidden />
      )}
      {icon ? null : (
        <span className="relative tabular-nums">{busy && pct ? `${pct}%` : label}</span>
      )}
      <span className="sr-only" aria-live="polite">
        {busy ? `Downloading ${pct}%` : ""}
      </span>
    </button>
  );
}
