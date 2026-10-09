/**
 * A product's QR code, with print-ready downloads: SVG (scales to any size)
 * and a PNG at 1024px or more with the quiet zone included.
 */
import { useState } from "react";
import { Download, Link2 } from "lucide-react";
import { toast } from "sonner";

import { QrCode } from "@/components/admin/qr";
import { downloadBlob, qrPath } from "@/components/admin/qr-matrix";
import { Button } from "@/components/ui/button";
import { TRIGGER_METHODS, type TriggerMethod } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { CopyButton } from "./ui";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "medialife";

function svgString(value: string) {
  const { d, size } = qrPath(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** Draws the same path onto a canvas at an integer scale of at least 1024px. */
function pngBlob(value: string): Promise<Blob | null> {
  const { d, size } = qrPath(value);
  const scale = Math.ceil(1024 / size);
  const px = size * scale;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, px, px);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000";
  ctx.fill(new Path2D(d));
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function QrDownloads({
  value,
  name,
  className,
}: {
  value: string;
  name: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const file = `${slug(name)}-qr`;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          downloadBlob(new Blob([svgString(value)], { type: "image/svg+xml" }), `${file}.svg`);
          toast.success("QR code downloaded (SVG)");
        }}
      >
        <Download aria-hidden /> SVG
        <span className="sr-only"> QR code for {name}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const blob = await pngBlob(value);
            if (!blob) throw new Error("no canvas");
            downloadBlob(blob, `${file}.png`);
            toast.success("QR code downloaded (PNG)");
          } catch {
            toast.error("Couldn't make the PNG. Try the SVG instead.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download aria-hidden /> {busy ? "Preparing…" : "PNG"}
        <span className="sr-only"> QR code for {name}</span>
      </Button>
    </div>
  );
}

/** The activation link, its QR code and the downloads, as one block. */
export function TriggerBlock({
  url,
  name,
  method,
  placement,
  compact = false,
}: {
  url: string;
  name: string;
  method: TriggerMethod;
  placement: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5",
        compact ? "@md:grid-cols-[8.5rem_1fr]" : "@xl:grid-cols-[11rem_1fr]",
      )}
    >
      <div className="mx-auto w-full max-w-44 @md:mx-0">
        <div className="rounded-lg bg-white p-1.5">
          <QrCode
            value={url}
            className="block h-auto w-full"
            title={`QR code for ${name}: opens ${url}`}
          />
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <div className="text-xs text-muted-foreground">Activation link</div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate font-mono text-sm text-foreground underline-offset-4 hover:underline"
            >
              {url.replace(/^https?:\/\//, "")}
            </a>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton value={url} label="Copy link" toastText="Activation link copied" />
            <QrDownloads value={url} name={name} />
          </div>
        </div>
        <div className="text-sm">
          <div className="font-medium">{TRIGGER_METHODS[method].label}</div>
          <p className="mt-0.5 text-muted-foreground">{TRIGGER_METHODS[method].blurb}</p>
          {placement ? (
            <p className="mt-1 text-muted-foreground">
              <span className="text-foreground">Where it goes:</span> {placement}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
