import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { CopyButton } from "../kit";
import { UrlText } from "../links/url-text";
import { QrCode } from "../qr";
import { downloadBlob, qrPngBlob, qrSvgString } from "../qr-matrix";
import { outlineBtn } from "./ui";

/** A URL as a QR code, with copy and PNG / SVG downloads. */
export function QrDialog({
  open,
  onOpenChange,
  url,
  title,
  description,
  file,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title: string;
  description?: string;
  file: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <QrCode value={url} className="mx-auto w-full max-w-64 rounded-lg" title={title} />
        <UrlPill url={url} />
        <DialogFooter className="gap-2 sm:justify-start sm:space-x-0">
          <Button
            variant="outline"
            className={outlineBtn}
            onClick={async () => {
              const blob = await qrPngBlob(url);
              if (blob) downloadBlob(blob, `${file}.png`);
              else toast.error("Couldn't make the PNG");
            }}
          >
            <Download aria-hidden />
            PNG
          </Button>
          <Button
            variant="outline"
            className={outlineBtn}
            onClick={() =>
              downloadBlob(new Blob([qrSvgString(url)], { type: "image/svg+xml" }), `${file}.svg`)
            }
          >
            <Download aria-hidden />
            SVG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A URL on one line in a bordered box, with a copy button. */
export function UrlPill({ url, className }: { url: string; className?: string }) {
  return (
    <div
      className={`flex min-w-0 items-center gap-1 rounded-md border border-border py-0.5 pr-0.5 pl-2.5 ${className ?? ""}`}
    >
      <UrlText url={url} className="flex-1" />
      <CopyButton text={url} label="Copy link" toastText="Link copied" />
    </div>
  );
}
