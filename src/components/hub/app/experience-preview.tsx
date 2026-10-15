/**
 * "Preview": the experience running inside a phone frame, next to a QR code
 * to open it on a real phone. Many sites refuse to be embedded, so the QR and
 * the new-tab link are always there, not hidden behind an error.
 */
import { useState } from "react";
import { ExternalLink, Gift, Loader2, Play, Smartphone, Sparkles } from "lucide-react";

import { QrCode } from "@/components/admin/qr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EXPERIENCE_KINDS, EXPERIENCE_STATUS, type Experience } from "@/lib/hub/model";

import { Pill } from "./ui";

export function ExperiencePreview({
  experience: e,
  open,
  onOpenChange,
}: {
  experience: Pick<
    Experience,
    "name" | "kind" | "status" | "reward" | "description" | "url" | "previewUrl"
  >;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const url = e.previewUrl || e.url;
  const [loaded, setLoaded] = useState(false);
  const [started, setStarted] = useState(false);
  const status = EXPERIENCE_STATUS[e.status];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setLoaded(false);
          setStarted(false);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden border-0 p-0 sm:h-auto sm:max-h-[94vh] sm:w-[94vw] sm:max-w-4xl sm:rounded-2xl sm:border sm:border-border">
        <div
          className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:grid-rows-1"
          style={{
            background:
              "radial-gradient(80% 60% at 20% 10%, oklch(0.72 0.16 240 / 18%), transparent 60%), radial-gradient(70% 60% at 90% 90%, oklch(0.68 0.26 350 / 16%), transparent 60%)",
          }}
        >
          {/* The phone */}
          <div className="relative grid min-h-0 place-items-center p-0 sm:p-8">
            {started ? (
              <p className="absolute bottom-1 hidden text-center text-xs text-muted-foreground sm:block">
                Blank screen? This site can't be shown inside the preview — use the QR code.
              </p>
            ) : null}
            <div className="relative h-full w-full overflow-hidden bg-black sm:aspect-[9/19.5] sm:h-[min(78vh,640px)] sm:w-auto sm:rounded-[2.6rem] sm:border-[10px] sm:border-neutral-900 sm:shadow-[0_40px_120px_-30px_oklch(0.68_0.26_350/45%),0_0_0_1px_oklch(1_0_0/8%)]">
              <span
                aria-hidden
                className="absolute top-2 left-1/2 z-10 hidden h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-900 sm:block"
              />
              {url && started ? (
                <iframe
                  src={url}
                  title={`Preview of ${e.name}`}
                  className="size-full border-0 bg-white"
                  onLoad={() => setLoaded(true)}
                  allow="camera; gyroscope; accelerometer; magnetometer; xr-spatial-tracking; fullscreen; autoplay"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                />
              ) : null}
              {!started ? (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
                  style={{ background: "var(--gradient-ember)" }}
                >
                  <div
                    className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_50%)]"
                    aria-hidden
                  />
                  <Sparkles
                    className="relative size-10 text-white motion-safe:animate-pulse"
                    aria-hidden
                  />
                  <div className="relative text-white">
                    <div className="text-lg font-semibold tracking-tight">{e.name}</div>
                    {e.reward ? <p className="mt-1 text-sm text-white/85">{e.reward}</p> : null}
                  </div>
                  {url ? (
                    <Button
                      onClick={() => setStarted(true)}
                      className="relative bg-white text-black hover:bg-white/90"
                    >
                      <Play aria-hidden /> Start preview
                    </Button>
                  ) : (
                    <p className="relative text-sm text-white/85">
                      The preview link arrives once it's built.
                    </p>
                  )}
                </div>
              ) : !loaded ? (
                <div className="absolute inset-0 grid place-items-center bg-neutral-950 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                    Loading the experience…
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* About + open on your phone */}
          <div className="flex flex-col gap-4 border-t border-border bg-background/80 p-5 backdrop-blur sm:border-t-0 sm:border-l sm:bg-transparent sm:p-8 sm:pr-12">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={status.tone}>{status.label}</Pill>
                <span className="text-xs text-muted-foreground">{EXPERIENCE_KINDS[e.kind]}</span>
              </div>
              <DialogTitle className="mt-2 text-xl font-medium tracking-tight">
                {e.name}
              </DialogTitle>
              <DialogDescription className="mt-1 hidden leading-relaxed sm:block">
                {e.description || "What fans see when they scan your merch."}
              </DialogDescription>
            </div>
            {e.reward ? (
              <div className="hidden gap-3 rounded-lg border border-border bg-white/[0.03] p-3 sm:flex">
                <Gift className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <div className="text-sm">
                  <div className="font-medium">What fans get</div>
                  <p className="mt-0.5 text-muted-foreground">{e.reward}</p>
                </div>
              </div>
            ) : null}
            {url ? (
              <div className="mt-auto hidden items-center gap-4 rounded-xl border border-border bg-background/60 p-4 sm:flex">
                <div className="w-28 shrink-0 rounded-md bg-white p-1">
                  <QrCode
                    value={url}
                    className="block h-auto w-full"
                    title={`QR code: open ${e.name} on your phone`}
                  />
                </div>
                <div className="text-sm">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Smartphone className="size-4 text-primary" aria-hidden /> Try it on your phone
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Point your camera at the code. AR and motion only work on a real phone, and some
                    sites can't load inside the preview.
                  </p>
                </div>
              </div>
            ) : null}
            {url ? (
              <Button asChild variant="outline" className="w-full sm:w-auto sm:self-start">
                <a href={url} target="_blank" rel="noreferrer">
                  Open in a new tab <ExternalLink aria-hidden />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
