/**
 * A product's activation link and QR code: a compact card for pages, and a
 * dialog with a size preview and print-ready downloads (SVG, or PNG at the
 * chosen size with the quiet zone included).
 */
import { useState } from "react";
import { Download, Link2, Maximize2, Nfc, QrCode as QrIcon } from "lucide-react";
import { toast } from "sonner";

import { QrCode } from "@/components/admin/qr";
import { downloadBlob, qrPath } from "@/components/admin/qr-matrix";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TRIGGER_METHODS, type TriggerMethod } from "@/lib/hub/model";
import { cn } from "@/lib/utils";

import { CopyButton } from "./ui";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "medialife";

function svgString(value: string, px: number) {
  const { d, size } = qrPath(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** Draws the same path onto a canvas at an integer scale of at least `minPx`. */
function pngBlob(value: string, minPx: number): Promise<Blob | null> {
  const { d, size } = qrPath(value);
  const scale = Math.ceil(minPx / size);
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

const SIZES = [
  { px: 1024, label: "Web", hint: "Social posts, slides" },
  { px: 2048, label: "Print", hint: "Posters up to A3" },
  { px: 4096, label: "Large", hint: "Banners and big prints" },
] as const;

export function QrDialog({
  open,
  onOpenChange,
  url,
  name,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  url: string;
  name: string;
}) {
  const [px, setPx] = useState<number>(2048);
  const [busy, setBusy] = useState(false);
  const file = `${slug(name)}-qr`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[100dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>QR code · {name}</DialogTitle>
          <DialogDescription>
            Opens{" "}
            <span className="font-mono text-foreground">{url.replace(/^https?:\/\//, "")}</span>.
            Black on white with a quiet zone, so it scans from paper or a screen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_12rem] sm:items-center">
          <div className="grid aspect-square place-items-center rounded-xl border border-border bg-[conic-gradient(at_50%_50%,#121218_25%,#17171f_0_50%,#121218_0_75%,#17171f_0)] bg-[length:20px_20px] p-4">
            <div
              className="rounded-md bg-white p-1 shadow-2xl transition-[width] duration-300"
              style={{ width: `${40 + (SIZES.findIndex((s) => s.px === px) + 1) * 18}%` }}
            >
              <QrCode value={url} className="block h-auto w-full" title={`QR code for ${name}`} />
            </div>
          </div>
          <fieldset>
            <legend className="text-sm font-medium">PNG size</legend>
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {SIZES.map((s) => (
                <label
                  key={s.px}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    px === s.px
                      ? "border-primary/60 bg-primary/10"
                      : "border-border hover:border-white/25",
                  )}
                >
                  <input
                    type="radio"
                    name="qr-size"
                    value={s.px}
                    checked={px === s.px}
                    onChange={() => setPx(s.px)}
                    className="sr-only"
                  />
                  <span>
                    <span className="block font-medium">{s.label}</span>
                    <span className="block text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{s.px}px</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              downloadBlob(
                new Blob([svgString(url, px)], { type: "image/svg+xml" }),
                `${file}.svg`,
              );
              toast.success("QR code downloaded (SVG)");
            }}
          >
            <Download aria-hidden /> SVG (any size)
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const blob = await pngBlob(url, px);
                if (!blob) throw new Error("no canvas");
                downloadBlob(blob, `${file}-${px}.png`);
                toast.success(`QR code downloaded (PNG, ${px}px)`);
              } catch {
                toast.error("Couldn't make the PNG. Try the SVG instead.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download aria-hidden /> {busy ? "Preparing…" : `PNG · ${px}px`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The activation link and QR as one compact block. */
export function TriggerCard({
  url,
  name,
  method,
  placement,
  className,
}: {
  url: string;
  name: string;
  method: TriggerMethod;
  placement: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const MethodIcon = method === "nfc" ? Nfc : QrIcon;
  return (
    <div className={cn("flex gap-4", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-24 shrink-0 self-start rounded-lg bg-white p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-28"
        aria-label={`Open the QR code for ${name}: size preview and downloads`}
      >
        <QrCode value={url} className="block h-auto w-full" title={`QR code for ${name}`} />
        <span className="absolute inset-0 grid place-items-center rounded-lg bg-background/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Maximize2 className="size-5" aria-hidden />
        </span>
      </button>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div>
          <div className="text-xs text-muted-foreground">Activation link</div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 flex min-w-0 items-center gap-1.5 font-mono text-sm underline-offset-4 hover:underline"
          >
            <Link2 className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">{url.replace(/^https?:\/\//, "")}</span>
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CopyButton value={url} label="Copy link" toastText="Activation link copied" />
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Download aria-hidden /> QR code
          </Button>
        </div>
        <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <MethodIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="text-foreground">{TRIGGER_METHODS[method].label}</span>
            {placement ? ` · ${placement}` : ""}
          </span>
        </p>
      </div>
      <QrDialog open={open} onOpenChange={setOpen} url={url} name={name} />
    </div>
  );
}
