import { useEffect, useId, useState } from "react";
import { Loader2, PackageCheck, Truck } from "lucide-react";

import { CheckRow, Field } from "@/components/admin/creators/ui";
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
import { adminMarkUgcDelivered, adminMarkUgcShipped } from "@/lib/ugc/admin.functions";
import { UGC_CARRIERS, trackingUrlFor } from "@/lib/ugc/model";

import { plural, useBulk } from "./ui";

// Mark shipped / delivered, used by the Shipping page and a creator's page.

export type ShipTarget = { creatorId: string; name: string; carrier?: string; tracking?: string };

export function MarkShippedDialog({
  target,
  campaignId,
  onClose,
}: {
  target: ShipTarget | null;
  campaignId?: string | null;
  onClose: () => void;
}) {
  const uid = useId();
  const bulk = useBulk();
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [url, setUrl] = useState("");
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (!target) return;
    setCarrier(target.carrier ?? "");
    setTracking(target.tracking ?? "");
    setUrl("");
    setNotify(true);
  }, [target]);
  const derived = trackingUrlFor(carrier, tracking);

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!target || !tracking.trim()) return;
            const r = await bulk.run(
              "ship",
              () =>
                adminMarkUgcShipped({
                  data: {
                    entries: [
                      {
                        creatorId: target.creatorId,
                        carrier: carrier.trim(),
                        tracking: tracking.trim(),
                        url: url.trim() || null,
                      },
                    ],
                    campaignId: campaignId ?? undefined,
                    notify,
                  },
                }),
              "Marked shipped:",
            );
            if (r?.every((x) => x.ok)) onClose();
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Mark shipped</DialogTitle>
            <DialogDescription>
              {target?.name}'s package. They get the tracking link by email and on their home
              screen.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Field label="Carrier" htmlFor={`${uid}-carrier`}>
              <Input
                id={`${uid}-carrier`}
                list={`${uid}-carriers`}
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="USPS"
                autoComplete="off"
              />
              <datalist id={`${uid}-carriers`}>
                {UGC_CARRIERS.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Tracking number" htmlFor={`${uid}-tracking`}>
              <Input
                id={`${uid}-tracking`}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                className="mono"
                required
                autoComplete="off"
              />
            </Field>
          </div>
          <Field
            label="Tracking page"
            htmlFor={`${uid}-url`}
            optional
            hint={
              derived && !url
                ? "We'll link to the carrier's tracking page."
                : "Only needed for carriers we don't know."
            }
          >
            <Input
              id={`${uid}-url`}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={derived ?? "https://"}
            />
          </Field>
          <CheckRow id={`${uid}-notify`} checked={notify} onChange={setNotify}>
            Email them the tracking link
          </CheckRow>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={bulk.busy || !tracking.trim()}>
              {bulk.busy ? <Loader2 className="animate-spin" aria-hidden /> : <Truck aria-hidden />}
              Mark shipped
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarkDeliveredDialog({
  targets,
  campaignId,
  onClose,
  onDone,
}: {
  targets: { creatorId: string; name: string }[];
  campaignId?: string | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const uid = useId();
  const bulk = useBulk();
  const [start, setStart] = useState(true);
  useEffect(() => setStart(true), [targets]);
  return (
    <Dialog open={targets.length > 0} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Mark{" "}
            {targets.length === 1
              ? `${targets[0].name}'s package`
              : plural(targets.length, "package")}{" "}
            delivered?
          </DialogTitle>
          <DialogDescription>
            Their address is deleted automatically 90 days after delivery.
          </DialogDescription>
        </DialogHeader>
        <CheckRow
          id={`${uid}-start`}
          checked={start}
          onChange={setStart}
          hint="Moves them to “Content due” so the countdown to the deadline starts."
        >
          Start the content phase
        </CheckRow>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={bulk.busy}
            onClick={async () => {
              const r = await bulk.run(
                "delivered",
                () =>
                  adminMarkUgcDelivered({
                    data: {
                      creatorIds: targets.map((t) => t.creatorId),
                      campaignId: campaignId ?? undefined,
                      startContent: start,
                    },
                  }),
                "Marked delivered:",
              );
              if (r) {
                onDone?.();
                onClose();
              }
            }}
          >
            {bulk.busy ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <PackageCheck aria-hidden />
            )}
            Mark delivered
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
