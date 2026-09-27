import { useEffect, useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { DemoOption } from "@/lib/ar/analytics.server";
import type { ArLink } from "@/lib/ar/events";
import { deleteLink, updateLink } from "@/lib/ar/links.functions";

import { CopyButton } from "../kit";
import { QrCode } from "../qr";
import { downloadBlob, qrPngBlob, qrSvgString } from "../qr-matrix";
import { UrlText } from "./url-text";

export function QrDialog({
  link,
  url,
  onOpenChange,
}: {
  link: ArLink | null;
  url: string;
  onOpenChange: (open: boolean) => void;
}) {
  const file = link ? `medialife-${link.code}` : "qr";
  return (
    <Dialog open={!!link} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>QR code for {link?.name}</DialogTitle>
          <DialogDescription>
            Scans to this client's link. Use it on slides or print.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <>
            <QrCode
              value={url}
              className="mx-auto w-full max-w-64 rounded-lg"
              title={`QR code for ${link.name}`}
            />
            <div className="flex min-w-0 items-center gap-1 rounded-md border border-border py-1 pr-1 pl-3">
              <UrlText url={url} className="flex-1" />
              <CopyButton text={url} label="Copy link" toastText="Link copied" />
            </div>
            <DialogFooter className="gap-2 sm:justify-start sm:space-x-0">
              <Button
                variant="outline"
                className="bg-transparent hover:bg-white/[0.06] hover:text-foreground"
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
                className="bg-transparent hover:bg-white/[0.06] hover:text-foreground"
                onClick={() =>
                  downloadBlob(
                    new Blob([qrSvgString(url)], { type: "image/svg+xml" }),
                    `${file}.svg`,
                  )
                }
              >
                <Download aria-hidden />
                SVG
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function EditLinkDialog({
  link,
  demo,
  onOpenChange,
}: {
  link: ArLink | null;
  demo: DemoOption | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const uid = useId();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [unlock, setUnlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!link) return;
    setName(link.name);
    setNote(link.note ?? "");
    setUnlock(link.unlock);
    setError(null);
  }, [link]);

  const save = useMutation({
    mutationFn: () =>
      updateLink({ data: { code: link!.code, name: name.trim(), note: note.trim(), unlock } }),
    onSuccess: (r) => {
      if (!r.ok) return setError("This link no longer exists.");
      toast.success("Link updated");
      void qc.invalidateQueries({ queryKey: ["ar-links"] });
      onOpenChange(false);
    },
    onError: () => setError("Couldn't save. Try again."),
  });

  return (
    <Dialog open={!!link} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit link</DialogTitle>
          <DialogDescription>
            <span className="mono">?c={link?.code}</span> keeps working: the code and demo stay the
            same.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return setError("Add who this link is for");
            save.mutate();
          }}
        >
          <div>
            <Label htmlFor={`${uid}-name`}>Client or contact</Label>
            <Input
              id={`${uid}-name`}
              className="mt-1.5"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Shown on the demo as "Prepared for {name.trim() || "…"}".
            </p>
          </div>
          <label
            htmlFor={`${uid}-unlock`}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-input px-3 py-2"
          >
            <span className="text-sm">
              Skip the password
              <span className="block text-xs text-muted-foreground">
                {unlock
                  ? "They go straight in."
                  : demo?.password
                    ? `They'll need: ${demo.password}`
                    : "They'll need the demo's password."}
              </span>
            </span>
            <Switch
              id={`${uid}-unlock`}
              checked={unlock}
              onCheckedChange={setUnlock}
              className="data-[state=unchecked]:bg-white/15"
            />
          </label>
          <div>
            <Label htmlFor={`${uid}-note`}>Note</Label>
            <Textarea
              id={`${uid}-note`}
              className="mt-1.5 min-h-0"
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="hover:bg-white/[0.06] hover:text-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteLinkDialog({
  link,
  onOpenChange,
}: {
  link: ArLink | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteLink({ data: { code: link!.code } }),
    onSuccess: () => {
      toast.success(`Deleted the link for ${link?.name}`);
      void qc.invalidateQueries({ queryKey: ["ar-links"] });
      onOpenChange(false);
    },
    onError: () => toast.error("Couldn't delete the link. Try again."),
  });
  return (
    <AlertDialog open={!!link} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the link for {link?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="mono">?c={link?.code}</span> stops greeting them by name and the code
            can be reused. Their past visits stay in Analytics. To stop the link for now but keep
            it, archive it instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent hover:bg-white/[0.06] hover:text-foreground">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              del.mutate();
            }}
            disabled={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Delete link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
